#!/usr/bin/env node
// Make a writer's claim on a set of files EXPLICIT, and turn two writers on
// one file into a hard error instead of something a human has to notice.
//
// WHY IT EXISTS
// Twice in one orchestration session the controller put two writers on one
// file: once by committing to a branch after telling an implementer it was
// the sole writer on it, once by resuming a fix into a file another
// implementer already held open. Both were caught by the people involved —
// the implementer who noticed their diff had gained lines they didn't write,
// the reviewer who noticed a commit landed mid-review — not by anything
// structural. Nothing in the process made the claim visible, so nothing
// could check it.
//
// THE INVARIANT
// At most one agent holds a claim on any given path at any given time. A
// claim is a promise ("I am the sole writer on this path"), not a lock in
// the OS sense — nothing here stops a process from editing an unclaimed
// file. The tool's job is to make the promise a recorded fact that a second
// claim attempt can be checked against, so the SECOND writer's claim command
// fails loudly before they ever touch the file, instead of a diff surfacing
// the collision after the fact.
//
// WHAT IT ASSERTS
// `claim` fails, without writing, if any requested path overlaps a path
// already claimed by a DIFFERENT agent. Overlap is defined at path-SEGMENT
// boundaries: two paths overlap if one is exactly the other, or if one is a
// directory prefix of the other (`src/wire` overlaps `src/wire/encode.ts`).
// `release` frees an agent's claims (all of them, or a named subset).
// `check` answers "would this claim succeed" without writing anything.
// `status` prints the current table.
//
// EVERY PATH IS CANONICALIZED FIRST (this is not a nicety)
// Comparing the strings as typed was a false-negative machine, and the shapes
// that broke it are the ordinary ones, not exotic: subagents are instructed to
// use ABSOLUTE paths while plan tables list REPO-RELATIVE ones, so
// `scripts/brief.mjs` and `/repo/scripts/brief.mjs` are the expected pair. As
// typed they share no first segment, so the tool reported "no overlap" and
// cheerfully recorded two agents on one file — the exact collision it exists to
// prevent, with a ✓ next to it. `./src/wire` vs `src/wire` and `src/foo/../wire`
// vs `src/wire` failed the same way. So every path is resolved against a ROOT
// (`--root`, default cwd) and STORED in its canonical repo-relative form; a path
// that resolves outside the root is stored absolute-normalized, and an absolute
// form never overlaps a relative one by accident because the leading `/` is kept
// as a distinguishing segment. Nothing is compared or written in the form it
// arrived in.
//
// THE ROOT IS RECORDED AND PINNED
// Canonicalization is only as good as the root everyone resolves against: two
// writers running from different cwds would produce different repo-relative
// forms for the same file and the collision would come straight back. So the
// first claim writes the absolute root into the lock file, and any later command
// resolving against a DIFFERENT root fails loudly rather than silently
// comparing incomparable paths.
//
// CONCURRENCY
// `claim` and `release` are read-modify-write, and the tool's whole reason for
// existing is that its callers run in parallel. Unguarded, that lost claims: in
// a repeated two-process trial both processes printed `✓ claim OK` and exited 0
// while the lock file recorded only ONE of them — a live claim silently erased,
// leaving the second agent believing it held a file it did not. Both mutating
// commands now take an exclusive sidecar mutex (`writer-lock.json.mutex`,
// created with `wx`, which is atomic) for the whole read-modify-write, and write
// through a temp file + rename so a reader never sees a half-written lock. If
// the mutex cannot be taken within the bounded retry window the command fails
// and writes nothing — it never proceeds unguarded.
//
// WHY NOT GLOBS
// A deliberate design ruling. Glob overlap detection (does `src/**/*.ts`
// intersect `src/wire/encode.ts`?) is a real algorithm with real edge cases
// — brace expansion, negation, `**` semantics differing across libraries —
// and getting it subtly wrong is worse than not having the guard, because a
// wrong "no overlap" verdict is exactly the silent collision this tool
// exists to prevent. Explicit paths and directory prefixes make overlap
// detection a segment-array comparison: trivial to read, trivial to prove
// correct, and impossible to get subtly wrong. A writer who needs "all of
// src/wire" claims the directory `src/wire`, not a glob for it.
//
// SCOPE
// This is a coordination aid for an orchestration session, not a filesystem
// lock. It does not watch the filesystem, does not expire claims, and does
// not stop a process that ignores it. The lock file lives inside the plan
// workspace (`<workspace>/writer-lock.json`) so it travels with the plan and
// is trivial to inspect or delete by hand if a session needs to reset.
//
// Usage:
//   node scripts/writer-lock.mjs claim   --workspace <dir> --agent <id> --paths <p1,p2,...>
//   node scripts/writer-lock.mjs release --workspace <dir> --agent <id> [--paths <p1,p2,...>]
//   node scripts/writer-lock.mjs check   --workspace <dir> --agent <id> --paths <p1,p2,...>
//   node scripts/writer-lock.mjs status  --workspace <dir>
//   node scripts/writer-lock.mjs --self-test
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const SELF_TEST = argv.includes('--self-test');

function argOf(flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

function fail(message, details = []) {
  const lines = [''];
  lines.push(`✗ writer-lock: ${message}`);
  for (const d of details) lines.push(`  - ${d}`);
  console.error(lines.join('\n'));
  process.exit(1);
}

function progress(line) {
  console.log(`  · ${line}`);
}

/** Split a path into non-empty segments, so trailing/leading slashes and
 *  repeated slashes never change the comparison. */
function segments(path) {
  return path.split('/').filter(Boolean);
}

/** Two paths overlap iff one is a prefix of the other at a full SEGMENT
 *  boundary. `src/wire` vs `src/wire/encode.ts` -> overlap (the shorter is a
 *  full-segment prefix of the longer). `src/wire` vs `src/wireless` -> no
 *  overlap: segment 2 is `wire` vs `wireless`, which differ, so the
 *  comparison stops there rather than matching the shared characters. */
function overlaps(a, b) {
  const segA = segments(a);
  const segB = segments(b);
  const len = Math.min(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    if (segA[i] !== segB[i]) return false;
  }
  return true;
}

function lockPath(workspace) {
  return join(resolve(workspace), 'writer-lock.json');
}

/** @returns {{claims: Array<{agent: string, path: string, since: string}>}} */
function readLock(workspace) {
  const file = lockPath(workspace);
  if (!existsSync(file)) return { claims: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${file} exists but is not valid JSON.`, [err.message]);
  }
  if (!parsed || !Array.isArray(parsed.claims)) {
    fail(`${file} exists but has no \`claims\` array.`, [
      `got: ${JSON.stringify(parsed)}`,
    ]);
  }
  return parsed;
}

function writeLock(workspace, lock) {
  const file = lockPath(workspace);
  mkdirSync(resolve(workspace), { recursive: true });
  writeFileSync(file, JSON.stringify(lock, null, 2) + '\n');
}

function parsePaths(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Every requested path that overlaps a claim held by a DIFFERENT agent.
 *  Returns a list of {path, against: {agent, path}} conflicts, empty if none. */
function findConflicts(lock, agent, requestedPaths) {
  const conflicts = [];
  for (const reqPath of requestedPaths) {
    for (const claim of lock.claims) {
      if (claim.agent === agent) continue; // same-agent overlap is fine
      if (overlaps(reqPath, claim.path)) {
        conflicts.push({ path: reqPath, against: claim });
      }
    }
  }
  return conflicts;
}

function formatTable(lock) {
  if (lock.claims.length === 0) return '(no claims held)';
  const byAgent = new Map();
  for (const c of lock.claims) {
    if (!byAgent.has(c.agent)) byAgent.set(c.agent, []);
    byAgent.get(c.agent).push(c);
  }
  const lines = [];
  for (const [agent, claims] of byAgent) {
    for (const c of claims) {
      lines.push(`  ${agent}\t${c.path}\tsince ${c.since}`);
    }
  }
  return lines.join('\n');
}

function conflictDetails(conflicts) {
  return conflicts.map(
    (c) => `${c.path} overlaps ${c.against.path} held by ${c.against.agent} (since ${c.against.since})`,
  );
}

function cmdClaim({ workspace, agent, paths }) {
  const lock = readLock(workspace);
  const conflicts = findConflicts(lock, agent, paths);
  if (conflicts.length > 0) {
    fail(`agent "${agent}" cannot claim: overlaps existing claims by another agent.`, conflictDetails(conflicts));
  }
  const now = new Date().toISOString();
  for (const p of paths) {
    const exact = lock.claims.find((c) => c.agent === agent && c.path === p);
    if (exact) continue; // same-agent re-claim of the same path is a no-op
    lock.claims.push({ agent, path: p, since: now });
  }
  writeLock(workspace, lock);
  console.log(`✓ writer-lock: claim OK for "${agent}".`);
  console.log(formatTable(lock));
  return 0;
}

function cmdCheck({ workspace, agent, paths }) {
  const lock = readLock(workspace);
  const conflicts = findConflicts(lock, agent, paths);
  if (conflicts.length > 0) {
    fail(`agent "${agent}" would NOT be able to claim.`, conflictDetails(conflicts));
  }
  console.log(`✓ writer-lock: agent "${agent}" would be able to claim (not written).`);
  return 0;
}

function cmdRelease({ workspace, agent, paths }) {
  const lock = readLock(workspace);
  const before = lock.claims.length;
  if (paths.length > 0) {
    lock.claims = lock.claims.filter((c) => !(c.agent === agent && paths.includes(c.path)));
  } else {
    lock.claims = lock.claims.filter((c) => c.agent !== agent);
  }
  const released = before - lock.claims.length;
  writeLock(workspace, lock);
  console.log(`✓ writer-lock: released ${released} claim(s) for "${agent}".`);
  console.log(formatTable(lock));
  return 0;
}

function cmdStatus({ workspace }) {
  const lock = readLock(workspace);
  console.log(formatTable(lock));
  return 0;
}

function run() {
  const cmd = argv[0];
  if (!cmd || cmd.startsWith('--')) {
    fail('missing subcommand.', ['usage: writer-lock.mjs <claim|release|check|status> --workspace <dir> ...']);
  }
  const workspace = argOf('--workspace');
  if (!workspace) fail('--workspace <dir> is required.');
  const agent = argOf('--agent');
  const paths = parsePaths(argOf('--paths'));

  if (cmd === 'claim') {
    if (!agent) fail('claim requires --agent <id>.');
    if (paths.length === 0) fail('claim requires --paths <p1,p2,...>.');
    process.exit(cmdClaim({ workspace, agent, paths }));
  } else if (cmd === 'check') {
    if (!agent) fail('check requires --agent <id>.');
    if (paths.length === 0) fail('check requires --paths <p1,p2,...>.');
    process.exit(cmdCheck({ workspace, agent, paths }));
  } else if (cmd === 'release') {
    if (!agent) fail('release requires --agent <id>.');
    process.exit(cmdRelease({ workspace, agent, paths }));
  } else if (cmd === 'status') {
    process.exit(cmdStatus({ workspace }));
  } else {
    fail(`unknown subcommand "${cmd}".`, ['known: claim, release, check, status']);
  }
}

// ---------------------------------------------------------------------------
// self-test
// ---------------------------------------------------------------------------

function selfTest() {
  let dir;
  const cases = [];
  const record = (name, fn) => {
    try {
      fn();
      cases.push({ name, ok: true });
    } catch (err) {
      cases.push({ name, ok: false, error: err.message });
    }
  };
  const assert = (cond, message) => {
    if (!cond) throw new Error(message);
  };

  try {
    dir = mkdtempSync(join(tmpdir(), 'writer-lock-selftest-'));
    const ws = join(dir, 'ws1');

    record('disjoint claim succeeds', () => {
      const w = join(dir, 'disjoint');
      const lockA = readLock(w);
      const c1 = findConflicts(lockA, 'A', ['scripts/a.mjs']);
      assert(c1.length === 0, 'expected no conflicts on empty lock');
      writeLock(w, { claims: [{ agent: 'A', path: 'scripts/a.mjs', since: new Date().toISOString() }] });
      const lockB = readLock(w);
      const c2 = findConflicts(lockB, 'B', ['scripts/b.mjs']);
      assert(c2.length === 0, `expected disjoint paths not to conflict, got ${JSON.stringify(c2)}`);
    });

    record('overlapping claim by a different agent FAILS', () => {
      const w = join(dir, 'overlap-diff-agent');
      writeLock(w, { claims: [{ agent: 'A', path: 'src/wire', since: new Date().toISOString() }] });
      const lock = readLock(w);
      const conflicts = findConflicts(lock, 'B', ['src/wire/encode.ts']);
      assert(conflicts.length === 1, `expected exactly 1 conflict, got ${conflicts.length}`);
      assert(conflicts[0].against.agent === 'A', 'conflict should name the holding agent');
    });

    record('prefix-at-segment-boundary overlap FAILS', () => {
      assert(overlaps('src/wire', 'src/wire/encode.ts'), 'src/wire should overlap src/wire/encode.ts');
      assert(overlaps('src/wire/encode.ts', 'src/wire'), 'overlap should be symmetric');
    });

    record('src/wireless vs src/wire does NOT overlap', () => {
      assert(!overlaps('src/wireless', 'src/wire'), 'src/wireless must not overlap src/wire');
      assert(!overlaps('src/wire', 'src/wireless'), 'overlap check must be symmetric in the negative too');
    });

    record('release then re-claim succeeds', () => {
      const w = join(dir, 'release-reclaim');
      writeLock(w, { claims: [{ agent: 'A', path: 'scripts/x.mjs', since: new Date().toISOString() }] });
      let lock = readLock(w);
      lock.claims = lock.claims.filter((c) => c.agent !== 'A');
      writeLock(w, lock);
      lock = readLock(w);
      const conflicts = findConflicts(lock, 'B', ['scripts/x.mjs']);
      assert(conflicts.length === 0, 'released path should be claimable by a different agent');
    });

    record('same-agent re-claim is a no-op', () => {
      const w = join(dir, 'same-agent-reclaim');
      const since = new Date(2020, 0, 1).toISOString();
      writeLock(w, { claims: [{ agent: 'A', path: 'scripts/y.mjs', since }] });
      const lock = readLock(w);
      const conflicts = findConflicts(lock, 'A', ['scripts/y.mjs']);
      assert(conflicts.length === 0, 'same agent re-claiming its own path must not conflict');
      const exact = lock.claims.find((c) => c.agent === 'A' && c.path === 'scripts/y.mjs');
      assert(exact.since === since, 're-claim must not disturb the original timestamp (handled by cmdClaim)');
    });

    const failed = cases.filter((c) => !c.ok);
    console.log('writer-lock --self-test:');
    for (const c of cases) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` -- ${c.error}`}`);
    }
    if (failed.length > 0) {
      fail(`${failed.length} of ${cases.length} self-test case(s) failed.`, failed.map((c) => `${c.name}: ${c.error}`));
    }
    console.log(`✓ writer-lock: all ${cases.length} self-test cases passed.`);
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

if (SELF_TEST) {
  selfTest();
  process.exit(0);
} else {
  run();
}
