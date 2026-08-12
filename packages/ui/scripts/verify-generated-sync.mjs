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
// The guard is read-only with respect to your tree: every file is snapshotted up
// front and restored on the way out, pass or fail, including on Ctrl-C. It never
// silently fixes the drift it is reporting.
//
// CAVEAT: read-only is the NET effect, not the intermediate state — the sentinel
// pass genuinely rewrites these files for the duration of the run. Do not run
// this concurrently with the test suite, Storybook or a dev server in the same
// worktree; they read the same files. CI runs it as its own sequential step.
//
// No network, no build required — build:api writes dist/custom-elements.json
// itself before the downstream generators read it.
//   node scripts/verify-generated-sync.mjs [--verbose]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // packages/ui
const REPO = resolve(ROOT, '..', '..');
const VERBOSE = process.argv.includes('--verbose');

// The command that regenerates everything, run FROM packages/ui. This is the
// literal fix printed on failure — the guard runs it, so it cannot drift.
const FIX = 'pnpm --filter @kitn.ai/ui run build:api';

// Every tracked file written by scripts/gen-element-api.mjs and the sibling
// generators it invokes. Paths are repo-relative so failure output matches what
// you would `git add`.
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
  { file: 'packages/ui/src/elements/icon-names.json', probe: 'overwrite' },
  { file: 'packages/ui/src/elements/element-types.d.ts', probe: 'overwrite' },
  { file: 'packages/ui/frameworks/react/index.tsx', probe: 'overwrite' },
  { file: 'packages/ui/llms.txt', probe: 'overwrite' },
  { file: 'packages/ui/llms-full.txt', probe: 'overwrite' },
  { file: 'docs/web-components.md', probe: 'in-block' },
];

const abs = (f) => resolve(REPO, f);
const fail = (msg) => {
  console.error(`\n✗ verify-generated-sync: ${msg}\n`);
  process.exit(1);
};

// ------------------------------------------------------------- preconditions
// A missing or untracked artifact means the guard's coverage silently shrank.
// Fail rather than quietly guard less than the list claims.
if (GENERATED.length === 0) fail('the generated-file list is empty — the guard would assert nothing.');

for (const { file } of GENERATED) {
  if (!existsSync(abs(file))) {
    fail(
      `${file} does not exist.\n` +
        '  It is on this guard\'s list of generated artifacts. If it was renamed or\n' +
        '  retired, update GENERATED in scripts/verify-generated-sync.mjs — do not\n' +
        '  leave the guard pointing at a file that is gone.',
    );
  }
}

{
  const paths = GENERATED.map((g) => g.file);
  const r = spawnSync('git', ['ls-files', '--', ...paths], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) fail(`\`git ls-files\` failed: ${`${r.stderr}`.trim()}`);
  const tracked = new Set(`${r.stdout}`.split('\n').filter(Boolean));
  const untracked = paths.filter((p) => !tracked.has(p));
  if (untracked.length) {
    fail(
      `${untracked.length} generated artifact(s) are not tracked by git:\n` +
        untracked.map((p) => `    ${p}`).join('\n') +
        '\n  An untracked artifact cannot drift in the repo, so guarding it proves nothing.',
    );
  }
}

// ------------------------------------------------------------------ snapshot
const before = new Map();
for (const { file } of GENERATED) {
  before.set(file, readFileSync(abs(file)));
}

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
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    restoreAll();
    process.exit(130);
  });
}

// -------------------------------------------------------------- plant sentinel
// Random per run, so a sentinel accidentally committed into a file can never
// stand in for a real regeneration.
const SENTINEL = `__KAI_GENERATED_SYNC_SENTINEL_${randomBytes(8).toString('hex')}__`;
const SPEC_MARKER = /<!-- spec:[a-z0-9-]+ -->/;

try {
  for (const { file, probe } of GENERATED) {
    if (probe === 'overwrite') {
      writeFileSync(abs(file), SENTINEL);
      continue;
    }
    // 'in-block'
    const src = before.get(file).toString('utf8');
    const m = src.match(SPEC_MARKER);
    if (!m) {
      restoreAll();
      fail(
        `${file} contains no \`<!-- spec:TAG -->\` marker.\n` +
          '  That marker delimits the generated region. Without it the generator\n' +
          '  rewrites nothing in this file and the guard cannot prove it is current.',
      );
    }
    writeFileSync(abs(file), src.replace(m[0], `${m[0]}\n${SENTINEL}`));
  }

  // ------------------------------------------------------------ run generator
  console.log(`verify-generated-sync: regenerating ${GENERATED.length} artifacts via \`npm run build:api\`\n`);
  const gen = spawnSync('npm', ['run', 'build:api'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10 * 60_000,
    shell: process.platform === 'win32',
  });
  if (VERBOSE && gen.stdout) console.log(`${gen.stdout}`.trim().replace(/^/gm, '    '));
  if (gen.status !== 0) {
    restoreAll();
    fail(
      `the generator itself failed (exit ${gen.status}).\n` +
        '  This guard cannot say anything about drift until it runs.\n\n' +
        `${`${gen.stdout || ''}${gen.stderr || ''}`.trim().replace(/^/gm, '    ')}`,
    );
  }

  // ------------------------------------------- anti-vacuity: was it REWRITTEN?
  const after = new Map();
  const notWritten = [];
  for (const { file } of GENERATED) {
    const buf = readFileSync(abs(file));
    after.set(file, buf);
    if (buf.includes(SENTINEL)) notWritten.push(file);
  }
  if (notWritten.length) {
    restoreAll();
    fail(
      `the generator did NOT write ${notWritten.length} of the ${GENERATED.length} artifacts this guard claims to cover:\n` +
        notWritten.map((p) => `    ${p}`).join('\n') +
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
    restoreAll();
    fail(
      `the generator wrote an EMPTY file for:\n` +
        empty.map((p) => `    ${p}`).join('\n') +
        '\n  The generator ran but produced nothing. This is a generator bug, not drift.',
    );
  }
  {
    const metaPath = 'packages/ui/src/elements/element-meta.json';
    let meta;
    try {
      meta = JSON.parse(after.get(metaPath).toString('utf8'));
    } catch (e) {
      restoreAll();
      fail(`the regenerated ${metaPath} is not valid JSON: ${e.message}`);
    }
    const tags = Array.isArray(meta) ? meta.filter((el) => typeof el?.tag === 'string' && el.tag.startsWith('kai-')) : [];
    if (tags.length === 0) {
      restoreAll();
      fail(
        `the regenerated ${metaPath} describes no kai-* elements.\n` +
          '  The generator produced a structurally empty model, so comparing against it\n' +
          '  would prove nothing about any element.',
      );
    }
    console.log(`  · model parsed: ${tags.length} kai-* elements\n`);
  }

  // ------------------------------------------------------------------- diff
  const drifted = [];
  for (const { file } of GENERATED) {
    const a = before.get(file);
    const b = after.get(file);
    if (a.equals(b)) {
      console.log(`  ✓ ${file}`);
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
    console.log(`  ✗ ${file}  (first differs at line ${i + 1})`);
    console.log(`        in tree:    ${trim(aL[i])}`);
    console.log(`        generated:  ${trim(bL[i])}`);
  }

  restoreAll();

  if (drifted.length) {
    fail(
      `${drifted.length} generated artifact(s) are STALE — they do not match what the generator produces from the current source:\n` +
        drifted.map((p) => `    ${p}`).join('\n') +
        '\n\n  These are derived from src/elements/ by scripts/gen-element-api.mjs. The `kai`\n' +
        '  MCP\'s component_reference and the docs site\'s PartTable.astro read them, so a\n' +
        '  prop, event or ::part you added to the source is invisible to every tool a\n' +
        '  developer would use to discover it until these are regenerated.\n\n' +
        '  Fix — run, then commit the files listed above:\n' +
        `    ${FIX}\n\n` +
        '  Do not reach for `nx build ui` instead. It regenerates these only when it\n' +
        '  actually runs the target; on a cache HIT it restores dist/ and skips these\n' +
        '  SOURCE-tree side effects while still printing "Successfully ran target build",\n' +
        '  so a cached build is indistinguishable from a successful one. build:api above\n' +
        '  (or `nx build ui --skip-nx-cache`) has no such failure mode.',
    );
  }
} finally {
  restoreAll();
}

console.log(
  `\n✓ verify-generated-sync: all ${GENERATED.length} generated artifacts match their source ` +
    '(each one proven rewritten this run).',
);
