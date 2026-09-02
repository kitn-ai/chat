// Generated-artifact drift guard: the checked-in files that are DERIVED from
// src/elements must match what their generator produces right now.
//
// WHY IT EXISTS
// -------------
// fc40a10 registered a new `::part(citations)` in src/elements/slots.ts and did
// not regenerate the artifacts derived from it. Nothing went red. The `kai`
// MCP's `component_reference` and the docs site's PartTable.astro both read from
// those artifacts, so a part that existed in the SHIPPED element was invisible
// to every tool a developer would use to discover it. That is a
// developer-experience defect, not untidy files, and it was found by a human
// noticing — which does not scale.
//
// WHAT IT ASSERTS
// ---------------
// Runs the real generator (`npm run build:api` — the same command this guard
// tells you to run, so the fix and the check can never diverge) and fails if any
// derived file in the tree differs from what came out.
//
// THE TRAP THIS GUARD IS BUILT AROUND (documented in CLAUDE.md)
// -------------------------------------------------------------
//   `nx build ui` is not a dependable way to regenerate these. It runs them
//   via postbuild, but the generators write side-effects into the SOURCE tree
//   and the NX cache does not restore those, so on a cache HIT the target
//   prints "Successfully ran target build" and leaves the tree stale — a
//   cached build is indistinguishable from a successful one. A guard layered
//   on `nx build ui` could therefore pass on a stale tree. This guard invokes
//   build:api directly and never goes through NX, so no cache state can
//   affect its result.
//   (Measured in this repo: three consecutive `nx build ui` runs all MISSED
//   the cache and did regenerate — the target's own source-tree side effects
//   dirty its input hash, so it re-runs. The guard does not depend on that
//   staying true, which is the point.)
//
// WHY IT CANNOT PASS VACUOUSLY
// ----------------------------
// A diff-based guard has an obvious hole: if the generator silently stops
// writing a file — deleted, renamed, an output dropped, an early `return` — then
// "nothing changed" reads as "in sync" and the check passes forever while
// covering nothing. So before running the generator, every derived file is
// overwritten with a single-use random SENTINEL. Afterwards the sentinel MUST be
// gone from every one of them. That is a live, per-run proof that this specific
// run genuinely rewrote this specific file. Delete the generator, drop one of
// its outputs, or have it no-op, and this guard goes red rather than green.
// Emptiness is covered too: a generator that writes zero bytes clears the
// sentinel but fails the structural sanity check below.
//
// WHAT THE SENTINEL DOES NOT COVER, AND WHY `--self-test` EXISTS
// -------------------------------------------------------------
// An audit put this precisely: the sentinel proves the generators RE-RAN, and
// nothing proved the COMPARATOR still notices drift. Those are different halves.
// The sentinel could keep working perfectly while the `a.equals(b)` half was
// deleted, inverted, or fed the wrong buffers, and every run would stay green on
// a tree with stale artifacts — which is the exact defect fc40a10 shipped and
// this guard was written to catch. So `--self-test` builds throwaway repos with
// a stub generator, lets the sentinel clear NORMALLY, and plants a DRIFTED
// artifact: the comparator alone has to produce the red.
//
//   node scripts/verify-generated-sync.mjs                        # the real tree
//   node scripts/verify-generated-sync.mjs --self-test            # prove it still detects
//   node scripts/verify-generated-sync.mjs --fixture-config <f>   # any synthesized repo
//
// It also pins the promise this guard makes about YOUR tree: it rewrites these
// files for the duration of a run, and must restore every one of them, pass or
// fail. A self-test case asserts the bytes are back afterwards.
//
// The guard is read-only with respect to your tree: every file is snapshotted up
// front and restored on the way out, pass or fail, including on Ctrl-C. It never
// silently fixes the drift it is reporting.
//
// CAVEAT: read-only is the NET effect, not the intermediate state — the sentinel
// pass genuinely rewrites these files for the duration of the run. Do not run
// this concurrently with the test suite, Storybook or a dev server in the same
// worktree; they read the same files. CI runs it as its own sequential step.
// (This is also why the self-test synthesizes its own repos rather than planting
// drift in yours, and why the wiring test never runs the real configuration.)
//
// No network, no build required — build:api writes dist/custom-elements.json
// itself before the downstream generators read it.
//   node scripts/verify-generated-sync.mjs [--verbose]
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // packages/ui
const REPO = resolve(ROOT, '..', '..');
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const VERBOSE = argv.includes('--verbose');
const SELF_TEST = argv.includes('--self-test');
const FIXTURE_CONFIG = argOf('--fixture-config');

// The command that regenerates everything, run FROM packages/ui. This is the
// literal fix printed on failure — the guard runs it, so it cannot drift.
const FIX = 'pnpm --filter @kitn.ai/ui run build:api';

// Every tracked file written by the generators `build:api` runs — that is
// scripts/gen-elements-manifest.mjs, plus scripts/gen-element-api.mjs and the
// sibling generators it invokes. Paths are repo-relative so failure output
// matches what you would `git add`.
//
// element-manifest.json is in `build:api` for THIS guard's sake and it is worth
// knowing why, because it looks redundant: `build:elements` already runs the
// same generator, ahead of the elements vite build that needs the entry points.
// But this guard only ever runs `build:api`, so while the manifest was reachable
// only through `build:elements` it could not be covered here at all — the
// sentinel would survive the run and the guard would fail on every clean tree.
// Adding it to the list without adding it to `build:api` produces a check that
// is red always, which is the same as no check. The generator is a pure scan of
// register-impl.ts and src/elements/*.ts[x] — no build, no network, idempotent —
// so running it in both places costs milliseconds and cannot diverge.
//
// `probe` says how to plant the sentinel:
//   'overwrite' — the generator rewrites the whole file, so clobber it.
//   'in-block'  — docs/web-components.md is NOT fully generated. The generator
//                 READS it and rewrites only the regions between
//                 `<!-- spec:TAG -->` markers, so clobbering it would destroy
//                 hand-written prose AND its own input. The sentinel goes INSIDE
//                 the first generated block instead, which is exactly the region
//                 that must be rewritten.
const GENERATED = [
  { file: 'packages/ui/src/elements/element-meta.json', probe: 'overwrite' },
  { file: 'packages/ui/src/elements/element-manifest.json', probe: 'overwrite' },
  // The ~2 KB of element-meta.json that SHIPS: tag -> its non-scalar prop names,
  // read at runtime by src/elements/element-diagnostics.ts. Stale bytes here mean
  // a prop that silently stopped being watched, which is invisible by nature —
  // the check for it is a check that does not fire.
  { file: 'packages/ui/src/elements/element-nonscalar.json', probe: 'overwrite' },
  { file: 'packages/ui/src/elements/icon-names.json', probe: 'overwrite' },
  { file: 'packages/ui/src/elements/element-types.d.ts', probe: 'overwrite' },
  { file: 'packages/ui/frameworks/react/index.tsx', probe: 'overwrite' },
  { file: 'packages/ui/llms.txt', probe: 'overwrite' },
  { file: 'packages/ui/llms-full.txt', probe: 'overwrite' },
  { file: 'packages/ui/mcp/catalog/derived.json', probe: 'overwrite' },
  // The construct format's published JSON Schema (Task 14), two addresses of
  // the same artifact: the checked-in copy scripts/gen-construct-schema.mjs
  // writes beside its Zod source, and the docs-site copy served at
  // https://ui.kitn.ai/schemas/construct/v1.json. Both are written by that one
  // generator, which build:api already runs.
  { file: 'packages/ui/mcp/construct/construct.v1.schema.json', probe: 'overwrite' },
  { file: 'apps/docs/public/schemas/construct/v1.json', probe: 'overwrite' },
  // The template registry's derived fixture JSONs (B-15) — written by
  // scripts/gen-construct-template-fixtures.mjs in build:api, read by
  // verify-construct.mjs's recursive fixture discovery. One file per
  // buildable starter + variant; a template removed from templates.ts
  // leaves its file's sentinel standing, which is this guard's red.
  { file: 'packages/ui/mcp/construct/fixtures/templates/widget.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/mcp/construct/fixtures/templates/inAppAssistant.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/mcp/construct/fixtures/templates/assistant.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/mcp/construct/fixtures/templates/research.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/mcp/construct/fixtures/templates/workspace.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/mcp/construct/fixtures/templates/workspace.artifactPreview.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/mcp/construct/fixtures/templates/workspace.appPreview.construct.json', probe: 'overwrite' },
  { file: 'docs/web-components.md', probe: 'in-block' },
];

/** The real configuration. `--self-test` and `--fixture-config` swap this out. */
const REAL = {
  repoRoot: REPO,
  pkgRoot: ROOT,
  generated: GENERATED,
  // argv form so a fixture can name a stub generator without a shell.
  genCommand: { cmd: 'npm', args: ['run', 'build:api'] },
  // The artifact whose STRUCTURE is sanity-checked: a generator that writes
  // valid-but-empty output clears the sentinel and would otherwise pass.
  metaFile: 'packages/ui/src/elements/element-meta.json',
  fix: FIX,
  // §4 of docs/coupling-map.md's templates row used to say the fixture-JSON
  // copy was guarded only in the REMOVE direction — a listed file going
  // missing (the `existsSync` precondition above) — and that a NEW fixture
  // gen-construct-template-fixtures.mjs writes for a template added to
  // templates.ts was never added to GENERATED and so never sentinel-checked
  // for drift at all. This closes that gap the smallest honest way: glob the
  // directory the generator actually writes and fail if anything on disk
  // there isn't one of the paths listed above.
  fixtureDir: {
    dir: 'packages/ui/mcp/construct/fixtures/templates',
    suffix: '.construct.json',
  },
};

const SPEC_MARKER = /<!-- spec:[a-z0-9-]+ -->/;

/**
 * One complete run against ONE repo. Returns the problems it found (empty is the
 * pass) plus the notes worth printing. Every file it touches is restored before
 * it returns, whatever happens — the caller does the exiting.
 *
 * Written as a pure-ish function of `cfg` so `--self-test` can drive the SAME
 * code path over synthesized repos. A self-test that exercised a reimplementation
 * would prove nothing about this one.
 */
function runGuard(cfg, { log = () => {} } = {}) {
  const abs = (f) => resolve(cfg.repoRoot, f);
  const problems = [];
  const p = (msg) => (problems.push(msg), problems);

  // ----------------------------------------------------------- preconditions
  // A missing or untracked artifact means the guard's coverage silently shrank.
  // Fail rather than quietly guard less than the list claims.
  if (cfg.generated.length === 0) return p('the generated-file list is empty — the guard would assert nothing.');

  for (const { file } of cfg.generated) {
    if (!existsSync(abs(file))) {
      return p(
        `${file} does not exist.\n` +
          "  It is on this guard's list of generated artifacts. If it was renamed or\n" +
          '  retired, update GENERATED in scripts/verify-generated-sync.mjs — do not\n' +
          '  leave the guard pointing at a file that is gone.',
      );
    }
  }

  {
    const paths = cfg.generated.map((g) => g.file);
    const r = spawnSync('git', ['ls-files', '--', ...paths], { cwd: cfg.repoRoot, encoding: 'utf8' });
    if (r.status !== 0) return p(`\`git ls-files\` failed: ${`${r.stderr}`.trim()}`);
    const tracked = new Set(`${r.stdout}`.split('\n').filter(Boolean));
    const untracked = paths.filter((x) => !tracked.has(x));
    if (untracked.length) {
      return p(
        `${untracked.length} generated artifact(s) are not tracked by git:\n` +
          untracked.map((x) => `    ${x}`).join('\n') +
          '\n  An untracked artifact cannot drift in the repo, so guarding it proves nothing.',
      );
    }
  }

  // The ADD direction for a generator that writes a variable number of files
  // into one directory (the template fixtures): every entry ABOVE catches a
  // listed file going missing, but a file the generator writes that was never
  // added to the list above is invisible to everything else in this guard —
  // it is never sentinel-planted, so it is never checked for drift. Glob the
  // directory and fail if anything on disk there isn't one of the listed
  // paths.
  if (cfg.fixtureDir) {
    const dirAbs = abs(cfg.fixtureDir.dir);
    if (existsSync(dirAbs)) {
      const onDisk = readdirSync(dirAbs).filter((f) => f.endsWith(cfg.fixtureDir.suffix));
      const listed = new Set(
        cfg.generated
          .filter((g) => g.file.startsWith(`${cfg.fixtureDir.dir}/`))
          .map((g) => g.file.slice(cfg.fixtureDir.dir.length + 1)),
      );
      const unlisted = onDisk.filter((f) => !listed.has(f));
      if (unlisted.length) {
        return p(
          `${unlisted.length} fixture(s) in ${cfg.fixtureDir.dir} are not in GENERATED:\n` +
            unlisted.map((x) => `    ${x}`).join('\n') +
            '\n  A fixture nothing here lists is never sentinel-planted, so it is never checked\n' +
            '  for drift. Add it to GENERATED in scripts/verify-generated-sync.mjs.',
        );
      }
    }
  }

  // ---------------------------------------------------------------- snapshot
  const before = new Map();
  for (const { file } of cfg.generated) before.set(file, readFileSync(abs(file)));

  let restored = false;
  const restoreAll = () => {
    if (restored) return;
    restored = true;
    for (const [file, buf] of before) {
      try {
        writeFileSync(abs(file), buf);
      } catch (e) {
        console.error(`  ! could not restore ${file}: ${e.message}`);
      }
    }
  };
  const onSignal = () => {
    restoreAll();
    process.exit(130);
  };
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, onSignal);

  try {
    // ---------------------------------------------------------- plant sentinel
    // Random per run, so a sentinel accidentally committed into a file can never
    // stand in for a real regeneration.
    const SENTINEL = `__KAI_GENERATED_SYNC_SENTINEL_${randomBytes(8).toString('hex')}__`;
    for (const { file, probe } of cfg.generated) {
      if (probe === 'overwrite') {
        writeFileSync(abs(file), SENTINEL);
        continue;
      }
      // 'in-block'
      const src = before.get(file).toString('utf8');
      const m = src.match(SPEC_MARKER);
      if (!m) {
        return p(
          `${file} contains no \`<!-- spec:TAG -->\` marker.\n` +
            '  That marker delimits the generated region. Without it the generator\n' +
            '  rewrites nothing in this file and the guard cannot prove it is current.',
        );
      }
      writeFileSync(abs(file), src.replace(m[0], `${m[0]}\n${SENTINEL}`));
    }

    // ------------------------------------------------------------ run generator
    log(`verify-generated-sync: regenerating ${cfg.generated.length} artifacts via \`${cfg.genCommand.cmd} ${cfg.genCommand.args.join(' ')}\`\n`);
    const gen = spawnSync(cfg.genCommand.cmd, cfg.genCommand.args, {
      cwd: cfg.pkgRoot,
      encoding: 'utf8',
      timeout: 10 * 60_000,
      shell: process.platform === 'win32',
    });
    if (VERBOSE && gen.stdout) log(`${gen.stdout}`.trim().replace(/^/gm, '    '));
    if (gen.status !== 0) {
      return p(
        `the generator itself failed (exit ${gen.status}).\n` +
          '  This guard cannot say anything about drift until it runs.\n\n' +
          `${`${gen.stdout || ''}${gen.stderr || ''}`.trim().replace(/^/gm, '    ')}`,
      );
    }

    // ------------------------------------------- anti-vacuity: was it REWRITTEN?
    const after = new Map();
    const notWritten = [];
    for (const { file } of cfg.generated) {
      const buf = readFileSync(abs(file));
      after.set(file, buf);
      if (buf.includes(SENTINEL)) notWritten.push(file);
    }
    if (notWritten.length) {
      return p(
        `the generator did NOT write ${notWritten.length} of the ${cfg.generated.length} artifacts this guard claims to cover:\n` +
          notWritten.map((x) => `    ${x}`).join('\n') +
          '\n\n  Each file was seeded with a sentinel before the run and still contains it,\n' +
          '  so nothing regenerated it. A diff-based check would have reported "in sync"\n' +
          '  here and covered nothing. Either the generator stopped emitting this output\n' +
          '  or the path moved.',
      );
    }

    // ------------------------------------------- anti-vacuity: is it SUBSTANTIVE?
    // Clearing the sentinel by writing zero bytes must not read as success.
    const empty = [...after].filter(([, buf]) => buf.length === 0).map(([file]) => file);
    if (empty.length) {
      return p(
        `the generator wrote an EMPTY file for:\n` +
          empty.map((x) => `    ${x}`).join('\n') +
          '\n  The generator ran but produced nothing. This is a generator bug, not drift.',
      );
    }
    {
      let meta;
      try {
        meta = JSON.parse(after.get(cfg.metaFile).toString('utf8'));
      } catch (e) {
        return p(`the regenerated ${cfg.metaFile} is not valid JSON: ${e.message}`);
      }
      const tags = Array.isArray(meta) ? meta.filter((el) => typeof el?.tag === 'string' && el.tag.startsWith('kai-')) : [];
      if (tags.length === 0) {
        return p(
          `the regenerated ${cfg.metaFile} describes no kai-* elements.\n` +
            '  The generator produced a structurally empty model, so comparing against it\n' +
            '  would prove nothing about any element.',
        );
      }
      log(`  · model parsed: ${tags.length} kai-* elements\n`);
    }

    // ------------------------------------------------------------------- diff
    // THE HALF THE SENTINEL DOES NOT COVER. Everything above proves the generator
    // ran and produced something; only this notices that what it produced differs
    // from what is committed.
    const drifted = [];
    for (const { file } of cfg.generated) {
      const a = before.get(file);
      const b = after.get(file);
      if (a.equals(b)) {
        log(`  ✓ ${file}`);
        continue;
      }
      drifted.push(file);
      const aL = a.toString('utf8').split('\n');
      const bL = b.toString('utf8').split('\n');
      let i = 0;
      while (i < aL.length && i < bL.length && aL[i] === bL[i]) i++;
      // One side runs out when the other file is strictly longer — say so rather
      // than printing a blank line that reads as "identical".
      const trim = (s) => (s === undefined ? '<end of file>' : s.length > 120 ? `${s.slice(0, 120)}…` : s);
      log(`  ✗ ${file}  (first differs at line ${i + 1})`);
      log(`        in tree:    ${trim(aL[i])}`);
      log(`        generated:  ${trim(bL[i])}`);
    }

    if (drifted.length) {
      return p(
        `${drifted.length} generated artifact(s) are STALE — they do not match what the generator produces from the current source:\n` +
          drifted.map((x) => `    ${x}`).join('\n') +
          '\n\n  These are derived from src/elements/ by the generators `build:api` runs. The\n' +
          "  `kai` MCP's component_reference and the docs site's PartTable.astro read them,\n" +
          '  so a prop, event or ::part you added to the source is invisible to every tool a\n' +
          '  developer would use to discover it until these are regenerated.\n\n' +
          '  element-manifest.json is worse than invisible: src/elements/autoloader.ts\n' +
          '  imports it AT RUNTIME to map a tag to the chunk that registers it. A tag\n' +
          '  missing from the committed manifest hits `if (!file) return` and the element\n' +
          '  never upgrades — silently, since the warnOnce path below it only fires when a\n' +
          '  dynamic import throws, which a missing key never reaches.\n\n' +
          '  Fix — run, then commit the files listed above:\n' +
          `    ${cfg.fix}\n\n` +
          '  Do not reach for `nx build ui` instead. It regenerates these only when it\n' +
          '  actually runs the target; on a cache HIT it restores dist/ and skips these\n' +
          '  SOURCE-tree side effects while still printing "Successfully ran target build",\n' +
          '  so a cached build is indistinguishable from a successful one. build:api above\n' +
          '  (or `nx build ui --skip-nx-cache`) has no such failure mode.',
      );
    }
    return problems;
  } finally {
    restoreAll();
    for (const sig of ['SIGINT', 'SIGTERM']) process.off(sig, onSignal);
  }
}

// ---------------------------------------------------------------------------
// self-test: synthesized repos with a STUB generator, so the sentinel clears
// normally and each planted defect has to be found by the check that owns it.
// ---------------------------------------------------------------------------
const META_REL = 'packages/ui/src/elements/element-meta.json';
const DOC_REL = 'docs/web-components.md';
const META_CONTENT = JSON.stringify([{ tag: 'kai-chat', displayName: 'Chat' }], null, 2) + '\n';
const DOC_CONTENT = `# Web components\n\nHand-written prose.\n\n<!-- spec:kai-chat -->\nGENERATED BLOCK\n<!-- /spec:kai-chat -->\n`;

/**
 * A stub generator whose behaviour is read from `gen-mode` at run time, so one
 * fixture shape covers every failure mode. It writes the SAME bytes the fixture
 * committed, which is what makes the clean case clean and the drift case drift.
 */
const GEN_STUB = `
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const repo = resolve(process.argv[2]);
const mode = readFileSync(resolve(repo, 'gen-mode'), 'utf8').trim();
if (mode === 'fail') { console.error('stub generator exploded'); process.exit(3); }
const meta = ${JSON.stringify(META_CONTENT)};
const doc = ${JSON.stringify(DOC_CONTENT)};
if (mode !== 'skip-meta') {
  writeFileSync(resolve(repo, ${JSON.stringify(META_REL)}), mode === 'empty-meta' ? '[]' : mode === 'zero-bytes' ? '' : meta);
}
writeFileSync(resolve(repo, ${JSON.stringify(DOC_REL)}), doc);
`;

function fixtureRepo({ mode = 'normal', tree = {}, track = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'generated-sync-selftest-'));
  const files = {
    'gen-mode': `${mode}\n`,
    'gen.mjs': GEN_STUB,
    'pkg/.keep': '',
    [META_REL]: META_CONTENT,
    [DOC_REL]: DOC_CONTENT,
    ...tree,
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const p2 = join(root, rel);
    mkdirSync(dirname(p2), { recursive: true });
    writeFileSync(p2, content);
  }
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'guard@example.com');
  git('config', 'user.name', 'guard');
  if (track) git('add', '-A');
  return root;
}

const fixtureConfig = (root, over = {}) => ({
  repoRoot: root,
  pkgRoot: join(root, 'pkg'),
  generated: [
    { file: META_REL, probe: 'overwrite' },
    { file: DOC_REL, probe: 'in-block' },
  ],
  genCommand: { cmd: process.execPath, args: [join(root, 'gen.mjs'), root] },
  metaFile: META_REL,
  fix: 'pnpm --filter @kitn.ai/ui run build:api',
  ...over,
});

const SELF_TEST_CASES = [
  {
    name: 'a tree matching its generator is in sync',
    build: () => fixtureConfig(fixtureRepo()),
    expect: [],
  },
  {
    name: 'DRIFT: a committed artifact the generator no longer produces (the comparator, alone)',
    // The sentinel clears normally here — the generator runs and rewrites both
    // files. Only the comparison can produce this red, which is the half the
    // audit found untested.
    build: () =>
      fixtureConfig(
        fixtureRepo({
          tree: {
            [META_REL]: JSON.stringify([{ tag: 'kai-chat', displayName: 'Chat', parts: ['citaitons'] }], null, 2) + '\n',
          },
        }),
      ),
    // The per-file "first differs at line" detail goes to stdout rather than into
    // the problem, so it is asserted in the wiring test, which reads the real
    // process output.
    expect: ['are STALE', META_REL],
    reject: ['did NOT write', 'EMPTY file'],
  },
  {
    name: 'DRIFT in the in-block artifact is caught too',
    build: () =>
      fixtureConfig(
        fixtureRepo({
          tree: { [DOC_REL]: DOC_CONTENT.replace('GENERATED BLOCK', 'STALE BLOCK') },
        }),
      ),
    expect: ['are STALE', DOC_REL],
  },
  {
    name: 'the generator no-ops on one artifact (the sentinel survives)',
    build: () => fixtureConfig(fixtureRepo({ mode: 'skip-meta' })),
    expect: ['did NOT write', META_REL],
    reject: ['are STALE'],
  },
  {
    name: 'the generator writes zero bytes',
    build: () => fixtureConfig(fixtureRepo({ mode: 'zero-bytes' })),
    expect: ['EMPTY file'],
  },
  {
    name: 'the generator produces a structurally empty model',
    build: () => fixtureConfig(fixtureRepo({ mode: 'empty-meta' })),
    expect: ['describes no kai-* elements'],
  },
  {
    name: 'the generator itself fails',
    build: () => fixtureConfig(fixtureRepo({ mode: 'fail' })),
    expect: ['the generator itself failed', 'exit 3'],
  },
  {
    name: 'a listed artifact is not on disk',
    build: () => fixtureConfig(fixtureRepo({ tree: { [META_REL]: null } })),
    expect: ['does not exist'],
  },
  {
    name: 'a listed artifact is not tracked by git',
    build: () => fixtureConfig(fixtureRepo({ track: false })),
    expect: ['not tracked by git'],
  },
  {
    name: 'an in-block artifact with no <!-- spec:TAG --> marker',
    build: () => fixtureConfig(fixtureRepo({ tree: { [DOC_REL]: '# Web components\n\nNo marker here.\n' } })),
    expect: ['contains no `<!-- spec:TAG -->` marker'],
  },
  {
    name: 'an empty generated list asserts nothing',
    build: () => fixtureConfig(fixtureRepo(), { generated: [] }),
    expect: ['list is empty'],
  },
  {
    // The ADD direction: a fixture the generator wrote that nothing added to
    // GENERATED — the gap the templates row of docs/coupling-map.md §4 used
    // to call unenforced. `extra.construct.json` is on disk (and tracked)
    // but never listed, which is exactly what a template added to
    // templates.ts without touching this list would look like.
    name: 'a fixture on disk is not listed in GENERATED (the ADD direction)',
    build: () => {
      const dir = 'pkg-fixtures/templates';
      return fixtureConfig(
        fixtureRepo({
          tree: {
            [`${dir}/widget.construct.json`]: '{}\n',
            [`${dir}/extra.construct.json`]: '{}\n',
          },
        }),
        {
          generated: [
            { file: META_REL, probe: 'overwrite' },
            { file: DOC_REL, probe: 'in-block' },
            { file: `${dir}/widget.construct.json`, probe: 'overwrite' },
          ],
          fixtureDir: { dir, suffix: '.construct.json' },
        },
      );
    },
    expect: ['extra.construct.json', 'not in GENERATED'],
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const cfg = c.build();
    const problems = runGuard(cfg);
    const text = problems.join('\n');
    const missingExpected = c.expect.filter((s) => !text.includes(s));
    const wrongfullyPresent = (c.reject ?? []).filter((s) => text.includes(s));
    const cleanMismatch = c.expect.length === 0 && problems.length > 0;
    let ok = missingExpected.length === 0 && wrongfullyPresent.length === 0 && !cleanMismatch;

    // THE PROMISE THIS GUARD MAKES ABOUT YOUR TREE: it rewrites these files during
    // a run and must put every one of them back, pass or fail. Checked on every
    // case, because the failure paths are exactly where an early return could skip
    // the restore.
    let restoreNote = '';
    for (const { file } of cfg.generated) {
      const p2 = resolve(cfg.repoRoot, file);
      if (!existsSync(p2)) continue;
      const now = readFileSync(p2, 'utf8');
      if (now.includes('__KAI_GENERATED_SYNC_SENTINEL_')) {
        ok = false;
        restoreNote = `    LEFT A SENTINEL BEHIND in ${file} — the run did not restore the tree`;
      }
    }

    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect.length === 0 ? 'clean' : c.expect.map((s) => `"${s}"`).join(' + ')}, got ${problems.length === 0 ? 'clean' : `${problems.length} problem(s)`})`,
    );
    if (missingExpected.length > 0) console.log(`    missing: ${missingExpected.map((s) => `"${s}"`).join(', ')}`);
    if (wrongfullyPresent.length > 0) console.log(`    fired for the wrong reason: ${wrongfullyPresent.map((s) => `"${s}"`).join(', ')}`);
    if (cleanMismatch) console.log(`    unexpected: ${text.split('\n')[0]}`);
    if (restoreNote) console.log(restoreNote);
  }
  if (failed > 0) {
    console.error(`\n✗ verify-generated-sync self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify-generated-sync self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified, ` +
      'and every run restored the tree it touched.',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run (or a synthesized one named by --fixture-config)
// ---------------------------------------------------------------------------
let cfg = REAL;
if (FIXTURE_CONFIG) {
  const raw = JSON.parse(readFileSync(resolve(FIXTURE_CONFIG), 'utf8'));
  cfg = { ...raw, repoRoot: resolve(raw.repoRoot), pkgRoot: resolve(raw.pkgRoot) };
}

const problems = runGuard(cfg, { log: (m) => console.log(m) });

if (problems.length === 0) {
  console.log(
    `\n✓ verify-generated-sync: all ${cfg.generated.length} generated artifacts match their source ` +
      '(each one proven rewritten this run).',
  );
  process.exit(0);
}
for (const problem of problems) console.error(`\n✗ verify-generated-sync: ${problem}\n`);
process.exit(1);
