// Freshness guard for measurement runs: the built artifacts you are about to
// measure must be NEWER than every source they were built from.
//
// WHY IT EXISTS
// -------------
// On 2026-08-18 a measurement demo ran the `kai` MCP against a `dist/` that had
// been built 15 hours before the tool it was measuring last changed. The run
// produced a tidy, confident finding list whose top three items were things the
// newer source already fixed. Nothing was wrong with the harness, the prompts or
// the analysis — every one of those was correct ABOUT THE WRONG TREE, and the
// whole run was worthless. That failure mode is silent by construction: a stale
// artifact loads, runs and answers exactly like a fresh one.
//
// This repo has no other check of this shape. Every existing guard is
// CONTENT-drift (`verify:generated`, `lint:catalog-drift`, …) — they ask whether
// a derived file matches its generator's current output. None of them asks the
// cheaper, more basic question: was this artifact produced AFTER the code it
// claims to represent?
//
// THE INVARIANT
// -------------
// For every artifact under measurement: artifact.mtime is STRICTLY greater than
// the mtime of every hand-written source in the package. One source at or newer
// than one artifact means the artifact may not contain that source, and any
// measurement taken against it is a measurement of history.
//
// An EQUAL mtime counts as stale. It is practically unreachable at millisecond
// resolution, but the tie has to break somewhere and it breaks fail-closed: at
// equal timestamps the order of the two writes is genuinely unknown, so the
// honest answer is "cannot confirm this artifact contains that source", and a
// guard whose whole purpose is to stop confident measurement of the wrong tree
// must not resolve its own ambiguity in favour of proceeding. It also keeps the
// code and this comment from disagreeing, which is the failure this note exists
// to prevent.
//
// WHAT IT ASSERTS
// ---------------
//   1. Every artifact asked for EXISTS (a missing one names its exact path and
//      the command that produces it).
//   2. No scanned source has an mtime at or newer than the OLDEST checked
//      artifact (equal counts as stale — see THE INVARIANT).
//   3. It scanned a non-zero number of artifacts and a non-zero number of
//      sources — counting artifacts that RESOLVED, not merely ones that were
//      asked for, so "everything was skipped" can never read as a pass.
// On success it prints each artifact's SHA-256 and mtime, so a measurement run's
// ledger can record exactly which bytes were measured rather than "latest".
//
// WHY IT NEVER TRUSTS A BUILD'S EXIT CODE
// ---------------------------------------
// The obvious alternative — "run the build first, then measure" — is the thing
// that already failed. `nx build ui` CAN hit the NX cache, print "Successfully
// ran target build" and regenerate nothing, because the generators write their
// side effects into the SOURCE tree and a cache restore does not put them back
// (CLAUDE.md documents this; `verify-generated-sync.mjs` is built around the
// same trap). A cached build is indistinguishable from a successful one by exit
// code. So this guard never shells out to a build, never reads a build log, and
// never takes anyone's word for it: it stats the files on disk. The only input
// is timestamps, which no cache can fake.
//
// WHY THIS IS NOT A CI STEP
// -------------------------
// CI builds fresh immediately before it does anything else, so on CI this check
// cannot fail — it would be a check that passes vacuously forever, which this
// repo treats as worse than no check at all. The staleness only exists on a
// developer's or an agent's box, where `dist/` persists across sessions and
// branches. This is therefore a LOCAL guard: the mandatory first line of any
// measurement run or rung brief, run by hand or by the brief's own command list.
//
// SCOPE
// -----
// Sources are every file under `src/` and `scripts/`, plus `package.json`.
// Files the BUILD ITSELF writes back into `src/` are excluded (see
// GENERATED_SOURCES) — otherwise a correctly built tree fails instantly, since
// postbuild's `build:api` writes `src/elements/element-meta.json` a second after
// `dist/kai.es.js`. Excluding them leaves no hole: those files are derived, and
// whether they match their generator is exactly what `verify:generated` checks.
// This guard covers hand-written source; that one covers generated source.
//
// A ZERO-SCAN RUN IS A HARD FAILURE. Resolve no artifacts, or find no sources,
// and this exits non-zero rather than reporting a clean tree. A runner that
// matched nothing and exited 0 is this repo's most expensive recurring defect.
//
// Usage:
//   node scripts/verify-artifact-fresh.mjs                              # from packages/ui
//   node scripts/verify-artifact-fresh.mjs dist/kai.es.js dist/foo.js   # positional args REPLACE the default artifact set
//   node scripts/verify-artifact-fresh.mjs --package-root <dir>         # point it at another checkout or a fixture
//   node scripts/verify-artifact-fresh.mjs --self-test                  # prove the comparator still detects
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored to THIS FILE, not the cwd. CLAUDE.md tells everyone to run from the
// repo root while `npm run` sets the cwd to the package.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
// Argument handling is strict, and that is a deliberate reversal of how this
// script started. A silently-ignored unknown flag is the worst possible bug in a
// guard: `--selftest` (no hyphen) was accepted and dropped, so the command ran
// the REAL check instead of the self-test and printed a ✓ that meant something
// entirely different from what the caller asked for. Same for a `--package-root`
// with no value, which quietly fell back to this script's own package and
// reported on a tree nobody asked about. A guard that misreads its own
// invocation and answers confidently is exactly the failure mode this file
// exists to stop, so every unrecognised or malformed argument is fatal.
const die = (message, details = []) => {
  console.error(`\n✗ verify-artifact-fresh: ${message}`);
  for (const d of details) console.error(`  - ${d}`);
  process.exit(1);
};

// Flags that consume the following argv entry, so it is not mistaken for an
// artifact path.
const VALUE_FLAGS = new Set(['--package-root']);
const BOOL_FLAGS = new Set(['--self-test']);
const KNOWN_FLAGS = [...VALUE_FLAGS, ...BOOL_FLAGS];

const positionals = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) {
    positionals.push(a);
    continue;
  }
  if (BOOL_FLAGS.has(a)) continue;
  if (VALUE_FLAGS.has(a)) {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      die(`${a} requires a directory argument, and none was given.`, [
        `usage: ${a} <dir>`,
        'refusing to fall back to a default package root: reporting on a tree you did not ask about is worse than not running',
      ]);
    }
    i++;
    continue;
  }
  die(`unknown flag "${a}".`, [
    `known flags: ${KNOWN_FLAGS.join(', ')}`,
    "anything else is a typo, and a mistyped flag must never be silently dropped -- '--selftest' would otherwise run the REAL check and print a ✓ for a question you did not ask",
  ]);
}

const SELF_TEST = argv.includes('--self-test');
const PKG_ROOT = resolve(argOf('--package-root') ?? join(SCRIPT_DIR, '..'));

// What a measurement run actually loads: the registered-elements bundle a
// consumer executes, and the manifest the `kai` MCP answers from.
const DEFAULT_ARTIFACTS = ['dist/kai.es.js', 'dist/custom-elements.json'];
// `mcp` is here because the MCP tree used to be `src/agent-tooling/` and was
// scanned as part of `src`. The 2026-09-02 move out of `src/` would otherwise
// have narrowed this guard to stop watching that tree entirely, and would have
// left the `mcp/catalog/derived.json` exclusion below unreachable.
const SOURCE_DIRS = ['src', 'scripts', 'mcp'];
const EXTRA_SOURCE_FILES = ['package.json'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.nx', 'dist']);

// Files the BUILD writes back into `src/`. Each is a build OUTPUT that happens
// to live among the inputs, so its mtime is always a second or two NEWER than
// dist/ and would make this guard un-passable on a correctly built tree.
//
// This list is a COPY -- the authority for each entry is the generator named
// beside it, and `scripts/verify-generated-sync.mjs` is the guard that checks
// their CONTENT. If a fresh, clean build ever fails this guard naming a file
// under src/, the answer is almost certainly a new generator writing here that
// needs adding to this list, not a stale tree.
const GENERATED_SOURCES = new Set([
  'src/elements/compiled.css', // build:css (gitignored)
  'src/elements/element-manifest.json', // scripts/gen-elements-manifest.mjs
  'src/elements/element-meta.json', // scripts/gen-element-api.mjs
  'src/elements/icon-names.json', // scripts/gen-element-api.mjs
  'src/elements/element-nonscalar.json', // scripts/gen-element-nonscalar.mjs
  'src/elements/element-types.d.ts', // scripts/gen-element-types.mjs
  'mcp/catalog/derived.json', // scripts/gen-catalog.mjs
]);
// NOT excluded, deliberately: `src/primitives/card-validate-schemas.ts` is
// generated by the build too -- `prebuild` runs `build:card-validation`, which
// is `scripts/gen-card-validation-schemas.mjs` writing exactly that path. It
// needs no exclusion for a different reason: prebuild runs BEFORE any dist/
// output is written, so a build always leaves it OLDER than the artifacts.
// `build:css` sits in the same prebuild step and would be fine on the same
// argument; it is excluded anyway because it is gitignored and regularly
// rebuilt on its own by Storybook and the watch task, out of band with dist/.

const posix = (p) => p.split(sep).join('/');
const iso = (ms) => new Date(ms).toISOString();
const sha256 = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');

const humanizeDelta = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 48) return rm ? `${h}h ${rm}m` : `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

function walkSources(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkSources(abs, root, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = posix(relative(root, abs));
    if (GENERATED_SOURCES.has(rel)) continue;
    out.push({ rel, mtimeMs: statSync(abs).mtimeMs });
  }
}

// ---------------------------------------------------------------------------
// the comparator, in-process so `--self-test` exercises THIS code and not a
// re-implementation of it
// ---------------------------------------------------------------------------
function analyze(pkgRoot, artifactRels) {
  const reasons = [];
  const artifacts = [];
  const missing = [];

  if (artifactRels.length === 0) {
    reasons.push({ kind: 'no-artifacts', detail: 'no artifact paths were resolved' });
  }
  const notFiles = [];
  for (const rel of artifactRels) {
    const abs = resolve(pkgRoot, rel);
    if (!existsSync(abs)) {
      missing.push({ rel, abs });
      continue;
    }
    // A directory has an mtime, so it sails through every timestamp comparison
    // and only blows up later at the SHA-256 read -- after the ✓ success line
    // has already been printed, with a raw EISDIR stack under it. Caught here
    // instead, while a clean verdict is still possible.
    const stat = statSync(abs);
    if (!stat.isFile()) {
      notFiles.push({ rel, abs });
      continue;
    }
    artifacts.push({ rel, abs, mtimeMs: stat.mtimeMs });
  }
  if (missing.length > 0) reasons.push({ kind: 'missing-artifact', missing });
  if (notFiles.length > 0) reasons.push({ kind: 'not-a-file', notFiles });

  // STRUCTURAL non-emptiness, and the distinction matters. The check above
  // counts what was REQUESTED; this one counts what actually RESOLVED. Without
  // it, "every artifact was skipped" is a green: the loop skips each path, no
  // skip path happens to record a reason, `reasons` stays empty, and the success
  // branch cheerfully prints `0 artifact(s) are newer than all N source(s)` and
  // exits 0 -- a guard reporting that nothing is wrong because it checked
  // nothing, which is this repo's most expensive recurring defect.
  //
  // Deleting any single skip path's reason push reproduces exactly that, so the
  // old code was safe only by per-site convention: every `continue` above had to
  // REMEMBER to record why. Conventions are not invariants, and the third skip
  // reason someone adds later will not know about this one. This backstop makes
  // the property structural instead -- zero resolved artifacts can never be a
  // pass, whatever skipped them, including a skip path that does not exist yet.
  if (artifactRels.length > 0 && artifacts.length === 0 && reasons.length === 0) {
    reasons.push({ kind: 'internal-skip', requested: artifactRels.length });
  }

  const sources = [];
  for (const d of SOURCE_DIRS) {
    const abs = join(pkgRoot, d);
    if (existsSync(abs)) walkSources(abs, pkgRoot, sources);
  }
  for (const f of EXTRA_SOURCE_FILES) {
    // Routed through the SAME exclusion check as the walked dirs. Nothing in
    // EXTRA_SOURCE_FILES is generated today, so this changes no result -- it
    // exists so that an over-broad GENERATED_SOURCES cannot hide behind one
    // file that silently bypasses it. A mutant that excluded every fixture
    // source survived the self-test until this path honoured the set too.
    if (GENERATED_SOURCES.has(f)) continue;
    const abs = join(pkgRoot, f);
    if (existsSync(abs)) sources.push({ rel: f, mtimeMs: statSync(abs).mtimeMs });
  }
  if (sources.length === 0) {
    reasons.push({ kind: 'no-sources', detail: `no source files under ${SOURCE_DIRS.join('/, ')}/ in ${pkgRoot}` });
  }

  let stale = [];
  let oldest = null;
  if (artifacts.length > 0 && sources.length > 0) {
    oldest = artifacts.reduce((a, b) => (a.mtimeMs <= b.mtimeMs ? a : b));
    // `>=`, not `>`: an equal mtime is an unresolvable ordering, and this guard
    // breaks that tie closed. See THE INVARIANT at the top.
    stale = sources
      .filter((s) => s.mtimeMs >= oldest.mtimeMs)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (stale.length > 0) reasons.push({ kind: 'stale', stale, oldest });
  }

  return { ok: reasons.length === 0, reasons, artifacts, sources, stale, oldest, missing };
}

const REBUILD_ADVICE =
  'Rebuild before measuring:\n' +
  '  npm run build                 # inside packages/ui\n' +
  '  nx build ui --skip-nx-cache   # from the repo root\n' +
  '`nx build ui` WITHOUT --skip-nx-cache can hit the NX cache, print "Successfully ran\n' +
  'target build" and regenerate nothing, because the generators write their side effects\n' +
  'into the source tree and a cache restore does not put them back (CLAUDE.md). A cached\n' +
  'build looks exactly like a successful one, which is why this guard reads mtimes and\n' +
  'never a build exit code.';

// ---------------------------------------------------------------------------
// self-test: the comparator has to produce the red on a planted defect. Fixture
// mtimes are set with utimesSync -- never by sleeping, which would make this
// slow AND flaky.
// ---------------------------------------------------------------------------
const BASE_SECONDS = Math.floor(Date.now() / 1000) - 86_400;

function makeFixture(root, { sourceOffset, artifactOffset, artifacts, withSources = true, decoy = false, artifactDirs = [] }) {
  mkdirSync(join(root, 'src/elements'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });

  const touch = (rel, body, offset) => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    utimesSync(abs, BASE_SECONDS + offset, BASE_SECONDS + offset);
  };

  if (withSources) {
    touch('src/elements/chat.ts', 'export const a = 1;\n', sourceOffset);
    touch('scripts/gen.mjs', '// generator\n', sourceOffset);
    touch('package.json', '{"name":"fixture"}\n', sourceOffset);
    // A build-written file under src/ that is ALWAYS newer than dist. Every
    // fixture carries one, so the exclusion is exercised by the passing case
    // rather than only asserted in a comment.
    touch('src/elements/element-meta.json', '{}\n', artifactOffset + 5);
  }
  // A file that SHARES A BASENAME with an excluded generated artifact but sits
  // at a different path, planted newer than dist. It must still be reported
  // stale. The exclusion is a set of exact repo-relative paths, and this is the
  // positive control for that: a mutant that relaxed it to a basename or
  // suffix match (`rel.endsWith('element-meta.json')`) passed every other case
  // in this file while quietly excusing any file anywhere with a matching tail.
  if (decoy) touch('src/other/element-meta.json', '{"hand-written":true}\n', artifactOffset + 5);
  for (const rel of artifacts) touch(rel, `// ${rel}\n`, artifactOffset);
  // A DIRECTORY standing where an artifact was asked for: the one shape that
  // resolves to something real, has a perfectly good mtime, and still cannot be
  // an artifact. It is how a request can be skipped while everything else looks
  // healthy, which is what makes it the right probe for the zero-resolved rule.
  for (const rel of artifactDirs) mkdirSync(join(root, rel), { recursive: true });
}

const SELF_TEST_CASES = [
  {
    name: 'a source newer than the artifact is STALE (the 2026-08-18 demo)',
    fixture: { sourceOffset: 3600, artifactOffset: 0, artifacts: DEFAULT_ARTIFACTS },
    expect: 'stale',
  },
  {
    name: 'artifacts newer than every source is clean',
    fixture: { sourceOffset: 0, artifactOffset: 3600, artifacts: DEFAULT_ARTIFACTS },
    expect: null,
  },
  {
    name: 'a missing artifact fails even when timestamps would pass',
    fixture: { sourceOffset: 0, artifactOffset: 3600, artifacts: ['dist/kai.es.js'] },
    expect: 'missing-artifact',
  },
  {
    name: 'an empty source tree fails rather than passing vacuously',
    fixture: { sourceOffset: 0, artifactOffset: 3600, artifacts: DEFAULT_ARTIFACTS, withSources: false },
    expect: 'no-sources',
  },
  {
    name: 'an EQUAL mtime counts as stale (the tie breaks fail-closed)',
    fixture: { sourceOffset: 3600, artifactOffset: 3600, artifacts: DEFAULT_ARTIFACTS },
    expect: 'stale',
  },
  {
    name: 'the exclusion is path-exact: a same-basename file elsewhere is still STALE',
    fixture: { sourceOffset: 0, artifactOffset: 3600, artifacts: DEFAULT_ARTIFACTS, decoy: true },
    expect: 'stale',
  },
  {
    name: 'zero artifacts requested fails rather than passing vacuously',
    fixture: { sourceOffset: 0, artifactOffset: 3600, artifacts: DEFAULT_ARTIFACTS },
    artifactRels: [],
    expect: 'no-artifacts',
  },
  {
    // The zero-RESOLVED probe. On this script the directory is reported as
    // `not-a-file`; the point of the case is what happens to a build of this
    // script where that reason is missing -- the `internal-skip` backstop fires
    // instead of a `0 artifact(s)` green, so the case still goes red and the run
    // still exits 1. Either way, "requested one, resolved none" is never a pass.
    name: 'an artifact that resolves to nothing usable is never a 0-artifact green',
    fixture: {
      sourceOffset: 0,
      artifactOffset: 3600,
      artifacts: DEFAULT_ARTIFACTS,
      artifactDirs: ['dist/a-directory'],
    },
    artifactRels: ['dist/a-directory'],
    expect: 'not-a-file',
  },
];

if (SELF_TEST) {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'verify-artifact-fresh-'));
  let failed = 0;
  try {
    for (const [i, c] of SELF_TEST_CASES.entries()) {
      const root = join(tmpRoot, `case-${i}`);
      mkdirSync(root, { recursive: true });
      makeFixture(root, c.fixture);
      const res = analyze(root, c.artifactRels ?? DEFAULT_ARTIFACTS);
      const got = res.reasons.map((r) => r.kind);
      let ok = c.expect === null ? res.ok : !res.ok && got.includes(c.expect);

      // Applied to EVERY case, not just the one written for it: a pass that
      // resolved no artifacts is a contradiction in terms, so it fails here
      // regardless of what the case was checking. A future skip path that
      // forgets its reason trips this in whichever case reaches it first.
      let note = '';
      if (res.ok && res.artifacts.length === 0) {
        ok = false;
        note = ' -- PASSED WITH ZERO RESOLVED ARTIFACTS (vacuous green)';
      }

      if (!ok) failed++;
      console.log(
        `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect ?? 'clean'}, got ${got.length ? got.join('+') : 'clean'})${note}`,
      );
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  if (failed > 0) {
    console.error(`\n✗ verify-artifact-fresh self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed -- the comparator no longer detects what it claims to.`);
    process.exit(1);
  }
  console.log(`\n✓ verify-artifact-fresh self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const artifactRels = positionals.length > 0 ? positionals.map(posix) : DEFAULT_ARTIFACTS;
const result = analyze(PKG_ROOT, artifactRels);

if (result.ok) {
  console.log(
    `✓ verify-artifact-fresh: ${result.artifacts.length} artifact(s) are newer than all ` +
      `${result.sources.length} scanned source(s) in ${PKG_ROOT}.`,
  );
  for (const a of result.artifacts) {
    console.log(`  · ${a.rel}  sha256=${sha256(a.abs)}  mtime=${iso(a.mtimeMs)}`);
  }
  process.exit(0);
}

for (const reason of result.reasons) {
  if (reason.kind === 'no-artifacts') {
    console.error(`\n✗ verify-artifact-fresh: no artifact paths were resolved -- a guard that checked nothing must not report a clean tree.`);
    console.error(`  - pass artifact paths as positional args, or drop them to use the defaults: ${DEFAULT_ARTIFACTS.join(', ')}`);
    continue;
  }
  if (reason.kind === 'missing-artifact') {
    console.error(`\n✗ verify-artifact-fresh: ${reason.missing.length} build artifact(s) missing -- there is nothing to measure.`);
    for (const m of reason.missing) console.error(`  - ${m.abs}`);
    console.error(`Resolved from: ${PKG_ROOT}`);
    console.error(`These are produced by the build. ${REBUILD_ADVICE}`);
    continue;
  }
  if (reason.kind === 'internal-skip') {
    console.error(`\n✗ verify-artifact-fresh: INTERNAL INVARIANT BREACH -- ${reason.requested} artifact(s) were requested and ZERO resolved, but nothing recorded why.`);
    console.error(`  - this is a bug in this script, not a verdict about your tree: an artifact was skipped without a recorded reason`);
    console.error(`  - failing instead of reporting a clean tree; a "0 artifact(s) checked" pass is a guard that checked nothing`);
    console.error(`  - if you just added a skip path to the artifact loop, give it a reason of its own`);
    continue;
  }
  if (reason.kind === 'not-a-file') {
    console.error(`\n✗ verify-artifact-fresh: ${reason.notFiles.length} artifact path(s) are not files -- an artifact must be a single built file whose bytes can be hashed.`);
    for (const n of reason.notFiles) console.error(`  - ${n.rel} resolves to a directory: ${n.abs}`);
    console.error(`  - name the built file itself, e.g. ${DEFAULT_ARTIFACTS.join(' ')}`);
    continue;
  }
  if (reason.kind === 'no-sources') {
    console.error(`\n✗ verify-artifact-fresh: scanned ZERO source files -- ${reason.detail}. That is a broken scan, not a clean tree.`);
    console.error(`  - check --package-root: it must point at packages/ui (or a checkout shaped like it)`);
    continue;
  }
  if (reason.kind === 'stale') {
    const shown = reason.stale.slice(0, 20);
    console.error(
      `\n✗ verify-artifact-fresh: ${reason.stale.length} source file(s) changed AT OR AFTER \`${reason.oldest.rel}\` was built ` +
        `(${iso(reason.oldest.mtimeMs)}). Measuring this tree measures code that has since changed -- ` +
        `findings will describe defects the current source may already have fixed. ` +
        `(An identical timestamp counts as stale: the write order is unknowable, so the tie breaks fail-closed.)`,
    );
    for (const s of shown) {
      const delta = s.mtimeMs - reason.oldest.mtimeMs;
      const how = delta === 0 ? 'SAME timestamp' : `${humanizeDelta(delta)} newer`;
      console.error(`  - ${s.rel}  ${how}  (${iso(s.mtimeMs)})`);
    }
    if (reason.stale.length > shown.length) {
      console.error(`  - … and ${reason.stale.length - shown.length} more`);
    }
    console.error(REBUILD_ADVICE);
  }
}
process.exit(1);
