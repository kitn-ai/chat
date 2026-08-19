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
// Comparing the strings as typed was a false-negative machine: agent A holds
// `scripts/brief.mjs`, agent B claims the absolute form of the SAME file
// (`/repo/scripts/brief.mjs`) — no shared first segment as typed, so the
// original tool reported "no overlap" and cheerfully recorded two agents on
// one file, the exact collision it exists to prevent, with a ✓ next to it.
// `./src/wire` vs `src/wire` and `src/foo/../wire` vs `src/wire` failed the
// same way. So every path is resolved against a ROOT (`--root`, default
// `process.cwd()`) and reduced to ONE canonical form before it is ever
// compared or stored: `path.relative(root, path.resolve(root, raw))` when
// that lands inside the root (posix-separated, no leading `./`), or the
// absolute normalized path when it resolves OUTSIDE the root. An outside
// path keeps its full absolute segment chain, so it can never accidentally
// share a leading segment with an unrelated inside-root path that happens to
// have the same tail (`/elsewhere/src/wire` vs `src/wire`).
//
// THE ROOT IS RECORDED AND PINNED
// Canonicalization is only as good as the root everyone resolves against:
// two writers running from different cwds would produce different
// repo-relative forms for the same file and the collision would come
// straight back silently. So the first successful `claim` on an empty lock
// pins the resolved absolute root into the lock file; any later command that
// resolves a DIFFERENT root fails loudly (naming both roots) rather than
// silently comparing incomparable forms.
//
// CONCURRENCY, AND EXACTLY WHAT IT GUARANTEES
// `claim` and `release` are read-modify-write, and the tool's whole reason
// for existing is that its callers run in parallel. Unguarded, that lost
// claims outright: in a repeated two-process trial both processes printed
// `✓ claim OK` and exited 0 while the lock file recorded only ONE of them —
// a live claim silently erased, leaving the second agent believing it held a
// file it did not. Both mutating commands now hold an exclusive sidecar
// mutex (`<workspace>/writer-lock.json.mutex`, created with the `wx` flag,
// which POSIX guarantees is atomic — the syscall itself is the arbiter, not
// a check-then-act in this script) for the whole read-modify-write, and
// write the lock file through a temp file + `renameSync` so a concurrent
// reader never observes a half-written JSON file. If the mutex cannot be
// taken within a bounded retry window (20 attempts, 50ms apart — about a
// second) the command fails LOUDLY and writes NOTHING; it never proceeds
// unguarded, and it never deletes a stale mutex on your behalf — a stale
// mutex almost always means a crashed process, and auto-clearing it would
// silently reopen the exact race this file exists to close. Clear one by
// hand only once you are sure nothing else is running:
// `rm <workspace>/writer-lock.json.mutex`.
//
// THE ACTUAL GUARANTEE, STATED PRECISELY: this serializes writer-lock
// processes on ONE machine against ONE local (or otherwise POSIX-`O_EXCL`-
// correct) filesystem. It assumes every writer goes through this CLI —
// nothing stops a process that edits `writer-lock.json` directly, and
// `open(..., wx)` is not guaranteed atomic on some network filesystems
// (classic NFS < v3 being the canonical example), so a plan workspace on
// such a mount is outside what this tool can promise. `check` and `status`
// are read-only and take no mutex; a rename-based writer means a reader
// during a write sees either the old or the new file, never a torn one.
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
// This is a coordination aid for an orchestration session, not a general
// filesystem lock: it does not watch the filesystem, does not expire
// claims, and does not stop a process that ignores it (or edits the lock
// file directly). Within that, the mutex above provides real mutual
// exclusion for concurrent `claim`/`release` calls made THROUGH this CLI on
// one local filesystem — see "CONCURRENCY" for the exact guarantee and its
// limits. The lock file lives inside the plan workspace
// (`<workspace>/writer-lock.json`) so it travels with the plan and is
// trivial to inspect or delete by hand if a session needs to reset.
//
// Usage:
//   node scripts/writer-lock.mjs claim   --workspace <dir> --agent <id> --paths <p1,p2,...> [--root <dir>]
//   node scripts/writer-lock.mjs release --workspace <dir> --agent <id> [--paths <p1,p2,...>] [--root <dir>]
//   node scripts/writer-lock.mjs check   --workspace <dir> --agent <id> --paths <p1,p2,...> [--root <dir>]
//   node scripts/writer-lock.mjs status  --workspace <dir>
//   node scripts/writer-lock.mjs --self-test
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  openSync,
  closeSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { join, resolve as pathResolve, relative, isAbsolute, sep } from 'node:path';
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

/** Thrown by anything that runs UNDER the mutex (readLock, canonicalize,
 *  conflict checks), so `withMutex`'s `finally` releases the mutex via
 *  normal JS exception unwinding before the CLI layer ever calls
 *  `process.exit`. `process.exit()` does not run pending `finally` blocks —
 *  it terminates the process immediately — so nothing that might run while
 *  the mutex is held may call `fail()` (or anything else that exits)
 *  directly; it must throw one of these instead. */
class GuardError extends Error {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
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
 *  comparison stops there rather than matching the shared characters.
 *
 *  Callers MUST pass already-canonicalized paths (see `canonicalize`) — this
 *  function does no normalization itself, on purpose, so it stays a trivial
 *  segment comparison whose correctness does not depend on path-form logic. */
function overlaps(a, b) {
  const segA = segments(a);
  const segB = segments(b);
  const len = Math.min(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    if (segA[i] !== segB[i]) return false;
  }
  return true;
}

/** Reduce a raw, as-typed path to ONE canonical form relative to `root`:
 *  - resolves `.`/`..` and absolute-vs-relative differences away
 *  - a path landing INSIDE `root` becomes a posix-separated, root-relative
 *    string with no leading `./` (e.g. `src/wire`)
 *  - a path landing OUTSIDE `root` becomes its full absolute, posix-
 *    separated path, so it can never collide with an inside-root path that
 *    merely shares a tail (see "EVERY PATH IS CANONICALIZED FIRST" above)
 *  - the ROOT ITSELF (`.`, or any path that resolves back to `root`)
 *    canonicalizes to the EMPTY STRING, never `'.'`. This is load-bearing:
 *    `segments('.')` is `['.']`, a one-segment path that overlaps nothing
 *    real, so a claim on `.` silently claimed NOTHING and a second agent
 *    could claim `src/wire` right through it. `segments('')` is `[]`, and
 *    `overlaps()` treats the empty segment list as everyone's prefix (the
 *    `Math.min` with any other length is 0, so the comparison loop never
 *    runs and it returns `true`) -- which is exactly "the whole tree",
 *    correctly. Display code must render `''` back to `.` (see
 *    `displayPath`); storage and comparison must never see `.`. */
function canonicalize(rawPath, root) {
  const absRoot = pathResolve(root);
  const absPath = pathResolve(absRoot, rawPath);
  const rel = relative(absRoot, absPath);
  const relSegs = rel === '' ? [] : rel.split(sep);
  const inside = rel === '' || (relSegs[0] !== '..' && !isAbsolute(rel));
  const form = inside ? rel : absPath; // rel is already '' for the root itself
  return form.split(sep).join('/');
}

/** The empty string (the canonical form of the root itself) is unreadable in
 *  a table or an error message, so it is always rendered back as `.` --
 *  display-only; storage and comparison stay on the canonical `''` form. */
function displayPath(path) {
  return path === '' ? '.' : path;
}

function lockPath(workspace) {
  return join(pathResolve(workspace), 'writer-lock.json');
}

function mutexPath(workspace) {
  return join(pathResolve(workspace), 'writer-lock.json.mutex');
}

/** @returns {{claims: Array<{agent: string, path: string, since: string}>, root: string|null}} */
function readLock(workspace) {
  const file = lockPath(workspace);
  if (!existsSync(file)) return { claims: [], root: null };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new GuardError(`${file} exists but is not valid JSON.`, [err.message]);
  }
  if (!parsed || !Array.isArray(parsed.claims)) {
    throw new GuardError(`${file} exists but has no \`claims\` array.`, [`got: ${JSON.stringify(parsed)}`]);
  }
  if (!('root' in parsed)) parsed.root = null; // tolerate a pre-root-pinning lock file
  // Tolerate a lock file written by the version that canonicalized the root
  // itself to '.' instead of '' -- see canonicalize()'s doc comment. Without
  // this, a lock file that already has a `.` claim in it would wedge: it
  // would keep failing to overlap anything until manually edited.
  for (const claim of parsed.claims) {
    if (claim.path === '.') claim.path = '';
  }
  return parsed;
}

/** Atomic write: a concurrent `status`/`check` reader (which takes no mutex)
 *  must never observe a half-written file, so this always writes to a
 *  sibling temp file first and `renameSync`s it into place — `rename` is a
 *  single filesystem operation, so a reader sees either the whole old file
 *  or the whole new one, never a torn one. */
function writeLock(workspace, lock) {
  const dir = pathResolve(workspace);
  mkdirSync(dir, { recursive: true });
  const file = lockPath(workspace);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmp, JSON.stringify(lock, null, 2) + '\n');
  renameSync(tmp, file);
}

function parsePaths(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Every requested (already-canonical) path that overlaps a claim held by a
 *  DIFFERENT agent. Returns a list of {path, against: {agent, path}}
 *  conflicts, empty if none. */
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
      lines.push(`  ${agent}\t${displayPath(c.path)}\tsince ${c.since}`);
    }
  }
  return lines.join('\n');
}

function conflictDetails(conflicts) {
  return conflicts.map(
    (c) =>
      `${displayPath(c.path)} overlaps ${displayPath(c.against.path)} held by ${c.against.agent} (since ${c.against.since})`,
  );
}

function rootMismatchError(lock, absRoot) {
  return new GuardError(
    `this lock file is pinned to a different root than the one this command resolved.`,
    [
      `lock file's root: ${lock.root}`,
      `this command's root: ${absRoot}`,
      'pass the same --root every writer in this session uses, or delete the lock file to re-pin it.',
    ],
  );
}

/** Block (synchronously, via `Atomics.wait` on a private buffer -- no
 *  subprocess, no busy-spin) for up to `ms`. Node permits `Atomics.wait` on
 *  its main thread; this is the standard stdlib-only way to get a real
 *  synchronous sleep there. */
function sleepSync(ms) {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

/** Take the sidecar mutex via `open(..., 'wx')`, which fails with EEXIST if
 *  the file already exists -- POSIX guarantees that check-and-create is a
 *  single atomic syscall, so two processes racing here can never both
 *  succeed. Retries on EEXIST up to `retries` times, `delayMs` apart; on
 *  exhaustion throws (never proceeds unguarded, never deletes the mutex). */
function acquireMutex(workspace, { retries = 20, delayMs = 50 } = {}) {
  const dir = pathResolve(workspace);
  mkdirSync(dir, { recursive: true });
  const path = mutexPath(workspace);
  for (let attempt = 0; attempt <= retries; attempt++) {
    let fd;
    try {
      fd = openSync(path, 'wx');
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (attempt === 0) progress(`waiting for writer-lock mutex (${path})...`);
      if (attempt === retries) {
        throw new GuardError(
          `could not acquire the writer-lock mutex after ${retries} retries -- another writer-lock command may be mid-write.`,
          [
            `mutex file: ${path}`,
            'if you are SURE no other writer-lock process is running, delete that file by hand and retry.',
            'never auto-delete it: a stale mutex almost always means a crashed process, and clearing it automatically would silently reopen the exact lost-update race this file exists to close.',
          ],
        );
      }
      sleepSync(delayMs);
      continue;
    }
    return {
      release() {
        try {
          closeSync(fd);
        } catch {
          /* already closed */
        }
        try {
          unlinkSync(path);
        } catch {
          /* already removed */
        }
      },
    };
  }
  // Unreachable (the loop above always returns or throws), but keeps the
  // function's return type honest if the retry math is ever changed.
  throw new GuardError(`could not acquire the writer-lock mutex at ${path}.`);
}

/** Runs `fn` holding the sidecar mutex for `workspace`. `fn` MUST throw
 *  (never call `process.exit`) to report failure, so this `finally` -- an
 *  ordinary JS exception unwind, not a `process.exit` -- always releases the
 *  mutex before any exit happens. `mutexOpts` is test-only: production call
 *  sites never override the retry budget. */
function withMutex(workspace, fn, mutexOpts) {
  const { release } = acquireMutex(workspace, mutexOpts);
  try {
    return fn();
  } finally {
    release();
  }
}

function cmdClaim({ workspace, agent, paths, root }, mutexOpts) {
  return withMutex(
    workspace,
    () => {
      const lock = readLock(workspace);
      const absRoot = pathResolve(root);
      if (lock.root && lock.root !== absRoot) throw rootMismatchError(lock, absRoot);

      const canonicalPaths = paths.map((p) => canonicalize(p, absRoot));
      const conflicts = findConflicts(lock, agent, canonicalPaths);
      if (conflicts.length > 0) {
        throw new GuardError(
          `agent "${agent}" cannot claim: overlaps existing claims by another agent.`,
          conflictDetails(conflicts),
        );
      }

      const now = new Date().toISOString();
      for (const p of canonicalPaths) {
        const exact = lock.claims.find((c) => c.agent === agent && c.path === p);
        if (exact) continue; // same-agent re-claim of the same path is a no-op
        lock.claims.push({ agent, path: p, since: now });
      }
      lock.root = absRoot;
      writeLock(workspace, lock);
      return lock;
    },
    mutexOpts,
  );
}

function cmdCheck({ workspace, agent, paths, root }) {
  const lock = readLock(workspace);
  const absRoot = pathResolve(root);
  if (lock.root && lock.root !== absRoot) throw rootMismatchError(lock, absRoot);
  const canonicalPaths = paths.map((p) => canonicalize(p, absRoot));
  const conflicts = findConflicts(lock, agent, canonicalPaths);
  if (conflicts.length > 0) {
    throw new GuardError(`agent "${agent}" would NOT be able to claim.`, conflictDetails(conflicts));
  }
  return true;
}

function cmdRelease({ workspace, agent, paths, root }, mutexOpts) {
  return withMutex(
    workspace,
    () => {
      const lock = readLock(workspace);
      const absRoot = pathResolve(root);
      if (lock.root && lock.root !== absRoot) throw rootMismatchError(lock, absRoot);
      const canonicalPaths = paths.map((p) => canonicalize(p, absRoot));
      const before = lock.claims.length;
      if (canonicalPaths.length > 0) {
        lock.claims = lock.claims.filter((c) => !(c.agent === agent && canonicalPaths.includes(c.path)));
      } else {
        lock.claims = lock.claims.filter((c) => c.agent !== agent);
      }
      const released = before - lock.claims.length;
      writeLock(workspace, lock);
      return { lock, released };
    },
    mutexOpts,
  );
}

function cmdStatus({ workspace }) {
  return readLock(workspace);
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
  const root = argOf('--root') ?? process.cwd();

  try {
    if (cmd === 'claim') {
      if (!agent) fail('claim requires --agent <id>.');
      if (paths.length === 0) fail('claim requires --paths <p1,p2,...>.');
      const lock = cmdClaim({ workspace, agent, paths, root });
      console.log(`✓ writer-lock: claim OK for "${agent}".`);
      console.log(formatTable(lock));
    } else if (cmd === 'check') {
      if (!agent) fail('check requires --agent <id>.');
      if (paths.length === 0) fail('check requires --paths <p1,p2,...>.');
      cmdCheck({ workspace, agent, paths, root });
      console.log(`✓ writer-lock: agent "${agent}" would be able to claim (not written).`);
    } else if (cmd === 'release') {
      if (!agent) fail('release requires --agent <id>.');
      const { lock, released } = cmdRelease({ workspace, agent, paths, root });
      console.log(`✓ writer-lock: released ${released} claim(s) for "${agent}".`);
      console.log(formatTable(lock));
    } else if (cmd === 'status') {
      console.log(formatTable(cmdStatus({ workspace })));
    } else {
      fail(`unknown subcommand "${cmd}".`, ['known: claim, release, check, status']);
    }
  } catch (err) {
    if (err instanceof GuardError) fail(err.message, err.details);
    fail(err.message, []);
  }
  process.exit(0);
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
  const throws = (fn) => {
    try {
      fn();
      return { threw: false };
    } catch (err) {
      return { threw: true, error: err };
    }
  };

  try {
    dir = mkdtempSync(join(tmpdir(), 'writer-lock-selftest-'));

    record('disjoint claim succeeds', () => {
      const w = join(dir, 'disjoint');
      cmdClaim({ workspace: w, agent: 'A', paths: ['scripts/a.mjs'], root: w });
      const r = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: ['scripts/b.mjs'], root: w }));
      assert(!r.threw, `expected disjoint claim to succeed, got: ${r.error?.message}`);
    });

    record('overlapping claim by a different agent FAILS', () => {
      const w = join(dir, 'overlap-diff-agent');
      cmdClaim({ workspace: w, agent: 'A', paths: ['src/wire'], root: w });
      const r = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: ['src/wire/encode.ts'], root: w }));
      assert(r.threw, 'expected an overlapping claim by a different agent to fail');
      assert(/overlaps existing claims/.test(r.error.message), `unexpected message: ${r.error.message}`);
      const lock = readLock(w);
      assert(!lock.claims.some((c) => c.agent === 'B'), 'a failed claim must not write anything for the loser');
    });

    record('prefix-at-segment-boundary overlap FAILS (unit)', () => {
      assert(overlaps('src/wire', 'src/wire/encode.ts'), 'src/wire should overlap src/wire/encode.ts');
      assert(overlaps('src/wire/encode.ts', 'src/wire'), 'overlap should be symmetric');
    });

    record('src/wireless vs src/wire does NOT overlap (unit)', () => {
      assert(!overlaps('src/wireless', 'src/wire'), 'src/wireless must not overlap src/wire');
      assert(!overlaps('src/wire', 'src/wireless'), 'overlap check must be symmetric in the negative too');
    });

    record('release then re-claim succeeds', () => {
      const w = join(dir, 'release-reclaim');
      cmdClaim({ workspace: w, agent: 'A', paths: ['scripts/x.mjs'], root: w });
      cmdRelease({ workspace: w, agent: 'A', paths: [], root: w });
      const r = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: ['scripts/x.mjs'], root: w }));
      assert(!r.threw, `expected re-claim after release to succeed, got: ${r.error?.message}`);
    });

    record('same-agent re-claim is a no-op', () => {
      const w = join(dir, 'same-agent-reclaim');
      cmdClaim({ workspace: w, agent: 'A', paths: ['scripts/y.mjs'], root: w });
      const since1 = readLock(w).claims.find((c) => c.path === 'scripts/y.mjs').since;
      cmdClaim({ workspace: w, agent: 'A', paths: ['scripts/y.mjs'], root: w });
      const lock = readLock(w);
      const matching = lock.claims.filter((c) => c.agent === 'A' && c.path === 'scripts/y.mjs');
      assert(matching.length === 1, `expected exactly one entry after re-claim, got ${matching.length}`);
      assert(matching[0].since === since1, 're-claim must not disturb the original timestamp');
    });

    // --- D1: path-form canonicalization -------------------------------

    record('D1a: absolute vs relative same file MUST conflict', () => {
      const w = join(dir, 'd1a-abs-vs-rel');
      cmdClaim({ workspace: w, agent: 'A', paths: ['scripts/brief.mjs'], root: w });
      const r = throws(() =>
        cmdClaim({ workspace: w, agent: 'B', paths: [join(w, 'scripts/brief.mjs')], root: w }),
      );
      assert(r.threw, 'absolute and relative forms of the same file must conflict');
    });

    record("D1b: './x' vs 'x' MUST conflict", () => {
      const w = join(dir, 'd1b-dot-slash');
      cmdClaim({ workspace: w, agent: 'A', paths: ['x'], root: w });
      const r = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: ['./x'], root: w }));
      assert(r.threw, "'./x' must conflict with 'x'");
    });

    record("D1c: 'a/../b' vs 'b' MUST conflict", () => {
      const w = join(dir, 'd1c-dotdot');
      cmdClaim({ workspace: w, agent: 'A', paths: ['b'], root: w });
      const r = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: ['a/../b'], root: w }));
      assert(r.threw, "'a/../b' must conflict with 'b'");
    });

    record('D1d: a path outside the root must NOT collide with an inside path sharing the same tail', () => {
      const w = join(dir, 'd1d-outside-root');
      cmdClaim({ workspace: w, agent: 'A', paths: ['src/wire'], root: w });
      const outside = join(dir, 'some-other-repo', 'src/wire'); // outside w, same tail
      const r = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: [outside], root: w }));
      assert(!r.threw, `expected an outside-root path with the same tail NOT to collide, got: ${r.error?.message}`);
    });

    record('D1: canonicalize() unit sanity', () => {
      const root = '/repo';
      assert(canonicalize('/repo/scripts/brief.mjs', root) === canonicalize('scripts/brief.mjs', root));
      assert(canonicalize('./x', root) === canonicalize('x', root));
      assert(canonicalize('a/../b', root) === canonicalize('b', root));
      assert(canonicalize('/elsewhere/src/wire', root) !== canonicalize('src/wire', root));
    });

    record('D1e: claiming the root itself (.) conflicts with any path inside it', () => {
      const root = '/repo';
      assert(canonicalize('.', root) === '', `expected the root to canonicalize to '', got ${JSON.stringify(canonicalize('.', root))}`);
      const w = join(dir, 'd1e-root-claim');
      cmdClaim({ workspace: w, agent: 'A', paths: ['.'], root: w });
      const r1 = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: ['src/wire'], root: w }));
      assert(r1.threw, 'a root claim must conflict with a path inside the root');
      const r2 = throws(() => cmdCheck({ workspace: w, agent: 'B', paths: ['anything/at/all'], root: w }));
      assert(r2.threw, 'a root claim must conflict with check too, for any path inside the root');
      const lock = readLock(w);
      assert(lock.claims.some((c) => c.path === ''), "the root claim must be stored as '', not '.'");
    });

    record("D1f: same-agent re-claim of '.' (the root) is a no-op", () => {
      const w = join(dir, 'd1f-root-reclaim');
      cmdClaim({ workspace: w, agent: 'A', paths: ['.'], root: w });
      const since1 = readLock(w).claims.find((c) => c.agent === 'A').since;
      cmdClaim({ workspace: w, agent: 'A', paths: ['.'], root: w }); // re-claim, same agent
      const lock = readLock(w);
      const matching = lock.claims.filter((c) => c.agent === 'A');
      assert(matching.length === 1, `expected exactly one entry after re-claiming the root, got ${matching.length}`);
      assert(matching[0].since === since1, 're-claiming the root must not disturb the original timestamp');
    });

    record("D1g: a lock file with a legacy '.' claim (pre-fix) normalizes on read and still conflicts", () => {
      const w = join(dir, 'd1g-legacy-dot');
      mkdirSync(w, { recursive: true });
      writeFileSync(
        lockPath(w),
        JSON.stringify(
          { claims: [{ agent: 'A', path: '.', since: '2020-01-01T00:00:00.000Z' }], root: pathResolve(w) },
          null,
          2,
        ),
      );
      const lock = readLock(w);
      assert(lock.claims[0].path === '', `expected legacy '.' to normalize to '', got ${JSON.stringify(lock.claims[0].path)}`);
      const r = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: ['src/wire'], root: w }));
      assert(r.threw, 'a legacy root claim must still conflict with an inside path after normalization');
    });

    // --- D2: mutex-guarded writes ---------------------------------------

    record('D2: root mismatch fails loudly', () => {
      const w = join(dir, 'd2-root-mismatch');
      cmdClaim({ workspace: w, agent: 'A', paths: ['x'], root: w });
      const otherRoot = join(dir, 'd2-root-mismatch-different-root');
      const r = throws(() => cmdClaim({ workspace: w, agent: 'B', paths: ['y'], root: otherRoot }));
      assert(r.threw, 'a claim resolving a different root than the pinned one must fail');
      assert(/root/i.test(r.error.message), `error should mention root, got: ${r.error.message}`);
    });

    record('D2e: a pre-created mutex file makes claim fail loudly after retries, lock file untouched', () => {
      const w = join(dir, 'd2e-stale-mutex');
      mkdirSync(w, { recursive: true });
      writeFileSync(mutexPath(w), ''); // simulate a stuck/crashed holder
      const r = throws(() =>
        cmdClaim({ workspace: w, agent: 'A', paths: ['scripts/z.mjs'], root: w }, { retries: 3, delayMs: 5 }),
      );
      assert(r.threw, 'expected claim to fail when the mutex is already held');
      assert(/mutex/i.test(r.error.message), `error should mention the mutex, got: ${r.error.message}`);
      assert(!existsSync(lockPath(w)), 'the lock file must remain unwritten when the mutex could not be acquired');
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
