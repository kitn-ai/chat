// GUARD — `npm run verify:starters`, run in the required CI `test` job.
//
// WHY IT EXISTS
// -------------
// `examples/starters/*` holds the eight starter apps. Until this guard, NOTHING
// in CI built, typechecked or ran any of them: they were covered by code review
// alone. They are not just samples — `create-kai` scaffolds FROM them, so a
// starter that stops compiling ships straight into every scaffolded project,
// and the person who finds out is a new user on their first five minutes with
// the kit.
//
// The trigger was a five-starter refactor (each app's hand-rolled
// `streamFakeReply` replaced by the kit's shared `createMockResponder()`) that
// touched every composed-workspace starter with no automated check behind it.
//
// WHAT IT PROVES, AND WHAT IT DOES NOT
// ------------------------------------
// It runs each starter's REAL `build` — the same command a user runs — and,
// where that build does not already invoke a typechecker, its `typecheck` too.
// That catches the failures that actually happen here: a type error, a renamed
// or deleted export, an import specifier the kit no longer serves, a subpath
// missing from the exports map, a framework plugin that cannot process a file.
//
// It does NOT prove the app WORKS. A starter can build perfectly and render a
// blank page — wrong `kai-*` tag name, an array passed as an HTML attribute
// instead of a JS property, a listener bound to a bubbling event that does not
// bubble. Those are runtime contract failures and a bundler cannot see them.
// That layer is `verify:consumer` (registrations survive a real consumer
// bundler) and the `/consumer-regression` skill (real apps driven in a real
// browser). This guard is the compile floor beneath both, not a substitute.
//
// Deliberately NOT attempted: grepping the emitted bundles for `kai-*` tags to
// "prove" registration survived. Every element's tag name appears in the kit's
// metadata whether or not the `customElements.define` calls were tree-shaken,
// so that check passes on a broken build. `verify:consumer` does this properly,
// against a packed tarball, by counting defines in the emitted chunk.
//
// THE TWO TIERS, DERIVED NOT LISTED
// ---------------------------------
// There is no hand-written roster of starters in this file. The set is read
// from the `examples/starters/` directory, and each one's tier is read from how
// it depends on the kit:
//
//   LINKED      "@kitn.ai/ui": "workspace:*"   a pnpm workspace member. Its deps
//                                              are already on disk from the root
//                                              `pnpm install`, so building it
//                                              costs only the build.
//   STANDALONE  "@kitn.ai/ui": "file:../../.." a plain npm consumer that is NOT a
//                                              workspace member (see the comment
//                                              at the bottom of pnpm-workspace.yaml).
//                                              Needs its own `npm ci` first.
//
// Anything else — a starter with no `@kitn.ai/ui` dependency, an unrecognised
// specifier, no `build` script, or a `build` that never reaches a typechecker
// and no `typecheck` script to make up for it — is a HARD FAILURE, not a skip.
// That is the point: a starter added next month cannot quietly fall outside the
// guard while the summary line still says every starter passed.
//
// The tier is cross-checked against pnpm-workspace.yaml, so the two facts cannot
// disagree. A starter declaring `workspace:*` while absent from that file gets a
// dangling link rather than the kit, which is a confusing runtime failure this
// turns into a clear one at the top of the run.
//
// COST — UPPER BOUNDS, NOT AN IDLE BASELINE
// -----------------------------------------
// One full cold run (both standalone node_modules deleted first, kit already
// built) took 1m28s wall:
//   LINKED (6):     react 4s · vue 4s · svelte 4s · vanilla 3s · solid 7s
//                   angular 11s                                = ~33s, no install
//   STANDALONE (2): nextjs 28s npm ci + 15s build
//                   tanstack-start 6s npm ci + 7s build+typecheck
//
// READ THESE AS CEILINGS. The box was NOT quiet: load average 17.56 with three
// other agents building in sibling worktrees, plus a browser and a VM. Expect
// the real numbers to be LOWER, never higher. The ~/.npm cache was also already
// warm, which is why nextjs and tanstack-start disagree so much on install time
// — a truly cold cache costs more, which is what the actions/cache step in
// test.yml is for. If you need a trustworthy figure, re-measure on an idle
// machine rather than trusting this block.
//
// Even at the ceiling this is ~1.5 min against a 30-minute job budget, which is
// why the guard covers all eight rather than only the six that need no install.
// The partial version was cheap to avoid, so it was not worth the dishonesty.
//
// Usage:
//   node scripts/verify-starters.mjs               all starters (what CI runs)
//   node scripts/verify-starters.mjs --linked-only skip the npm-ci tier (local, offline)
//   node scripts/verify-starters.mjs --only=react,vue   iterate on a few (local)
//   node scripts/verify-starters.mjs --fresh       re-run `npm ci` even if node_modules exists
//
// `--linked-only` and `--only` are REFUSED when $CI is set. They are local
// conveniences, and a guard named for eight starters that silently covers three
// is the exact failure this repo keeps paying for.
//
// Needs `nx build ui` first: every starter resolves `@kitn.ai/ui` to this
// package's compiled `dist/`, so an unbuilt tree is a hard error rather than a
// wall of confusing per-starter resolution failures.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(UI_ROOT, '../..');
const STARTERS_DIR = resolve(REPO_ROOT, 'examples/starters');

const NAME = 'verify-starters';
const fail = (msg) => {
  console.error(`\n✗ ${NAME}: ${msg}\n`);
  process.exit(1);
};
const step = (msg) => console.log(`  · ${msg}`);

// ---- flags ------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const hit = argv.find((a) => a.startsWith(`${f}=`));
  return hit ? hit.slice(f.length + 1) : null;
};

const LINKED_ONLY = has('--linked-only');
const FRESH = has('--fresh');
const ONLY = valueOf('--only');

if (process.env.CI) {
  // Structural, not advisory: the scoping flags cannot be used by the thing that
  // gates merges. Without this, "add --linked-only to speed up CI" is a one-line
  // change that silently drops a third of the coverage and still prints a pass.
  const banned = [LINKED_ONLY && '--linked-only', ONLY !== null && '--only'].filter(Boolean);
  if (banned.length > 0) {
    fail(
      `${banned.join(' and ')} ${banned.length > 1 ? 'are' : 'is'} refused when $CI is set.\n` +
        `  These narrow coverage. CI must run the full set, or the summary line lies about\n` +
        `  what was checked. Drop the flag, or run this locally instead.`,
    );
  }
}

// ---- preconditions ----------------------------------------------------------
if (!existsSync(resolve(UI_ROOT, 'dist/kai.es.js'))) {
  fail(
    `packages/ui/dist/kai.es.js is missing — the kit is not built.\n` +
      `  Every starter resolves @kitn.ai/ui to this package's compiled dist/, so all\n` +
      `  eight would fail with confusing module-resolution errors.\n\n` +
      `  Run:  pnpm exec nx build ui`,
  );
}
if (!existsSync(STARTERS_DIR)) fail(`no starters directory at ${STARTERS_DIR}`);

// ---- which specifiers count as which tier -----------------------------------
//
// The only literals in this file that describe the starters. Everything else is
// read off disk.
const TIER_LINKED = 'LINKED';
const TIER_STANDALONE = 'STANDALONE';

// Binaries whose presence in a `build` script means that build already
// typechecks, so running `typecheck` separately would just repeat it.
//   tsc / vue-tsc / svelte-check  explicit typecheckers chained before the bundler
//   ng build                      Angular AOT typechecks the whole app
//   next build                    Next typechecks unless typescript.ignoreBuildErrors
const BUILD_TYPECHECKS = [/\btsc\b/, /\bvue-tsc\b/, /\bsvelte-check\b/, /\bng build\b/, /\bnext build\b/];

// ---- read pnpm-workspace.yaml (membership, for the cross-check) -------------
const workspaceYaml = readFileSync(resolve(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
const workspaceMembers = new Set(
  workspaceYaml
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim().replace(/^['"]|['"]$/g, ''))
    .filter((p) => p.startsWith('examples/starters/'))
    .map((p) => p.slice('examples/starters/'.length)),
);

// ---- enumerate + classify ---------------------------------------------------
const problems = [];
const starters = [];

for (const name of readdirSync(STARTERS_DIR).sort()) {
  const dir = join(STARTERS_DIR, name);
  if (!statSync(dir).isDirectory()) continue;

  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) {
    problems.push(`${name}: no package.json — is this a starter? Nothing can build it.`);
    continue;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    problems.push(`${name}: package.json is not valid JSON (${err.message})`);
    continue;
  }

  const spec = pkg.dependencies?.['@kitn.ai/ui'];
  if (!spec) {
    problems.push(
      `${name}: no "@kitn.ai/ui" in dependencies. A starter that does not depend on the kit\n` +
        `    cannot demonstrate it, and this guard has no idea how to install it.`,
    );
    continue;
  }

  let tier;
  if (spec === 'workspace:*') tier = TIER_LINKED;
  else if (spec.startsWith('file:')) tier = TIER_STANDALONE;
  else {
    problems.push(
      `${name}: unrecognised @kitn.ai/ui specifier "${spec}".\n` +
        `    Expected "workspace:*" (pnpm workspace member) or "file:..." (standalone npm\n` +
        `    consumer). A published range would test npm's copy, not this working tree.`,
    );
    continue;
  }

  // Tier and workspace membership are two records of one fact. Disagreement is a
  // dangling link at install time, which surfaces as a baffling runtime error.
  const isMember = workspaceMembers.has(name);
  if (tier === TIER_LINKED && !isMember) {
    problems.push(
      `${name}: declares "workspace:*" but is NOT listed in pnpm-workspace.yaml.\n` +
        `    pnpm will not link it; the dependency dangles. Add 'examples/starters/${name}'\n` +
        `    to pnpm-workspace.yaml, or switch the dep to "file:../../../packages/ui".`,
    );
    continue;
  }
  if (tier === TIER_STANDALONE && isMember) {
    problems.push(
      `${name}: uses "${spec}" but IS listed in pnpm-workspace.yaml.\n` +
        `    Pick one: a workspace member uses "workspace:*", a standalone consumer is not\n` +
        `    listed in that file.`,
    );
    continue;
  }

  const scripts = pkg.scripts ?? {};
  if (!scripts.build) {
    problems.push(`${name}: no "build" script. There is nothing for this guard to run.`);
    continue;
  }

  const buildTypechecks = BUILD_TYPECHECKS.some((re) => re.test(scripts.build));
  const toRun = ['build'];
  if (!buildTypechecks) {
    if (!scripts.typecheck) {
      problems.push(
        `${name}: "build" (${scripts.build}) does not reach a typechecker, and there is no\n` +
          `    "typecheck" script to make up for it. This starter's types would be checked by\n` +
          `    nobody — it would bundle happily with broken types and ship that way.`,
      );
      continue;
    }
    toRun.push('typecheck');
  }

  starters.push({ name, dir, tier, spec, scripts: toRun, buildTypechecks });
}

if (problems.length > 0) {
  fail(
    `${problems.length} starter${problems.length > 1 ? 's are' : ' is'} not in a shape this guard can check.\n` +
      `  These are FAILURES, not skips — an unclassifiable starter is exactly how coverage\n` +
      `  silently shrinks while the summary keeps saying everything passed.\n\n` +
      problems.map((p) => `  ✗ ${p}`).join('\n\n'),
  );
}

if (starters.length === 0) fail(`found no starters under ${STARTERS_DIR}. Zero checked must not read as green.`);

// ---- scope ------------------------------------------------------------------
const totalFound = starters.length;
let selected = starters;
const skipped = [];

if (ONLY !== null) {
  const wanted = new Set(
    ONLY.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const unknown = [...wanted].filter((w) => !starters.some((s) => s.name === w));
  if (unknown.length > 0)
    fail(`--only named starter(s) that do not exist: ${unknown.join(', ')}\n  Known: ${starters.map((s) => s.name).join(', ')}`);
  selected = starters.filter((s) => wanted.has(s.name));
  for (const s of starters) if (!wanted.has(s.name)) skipped.push({ ...s, why: '--only' });
}
if (LINKED_ONLY) {
  selected = selected.filter((s) => s.tier === TIER_LINKED);
  for (const s of starters)
    if (s.tier === TIER_STANDALONE && !skipped.some((k) => k.name === s.name))
      skipped.push({ ...s, why: '--linked-only' });
}

// ---- run --------------------------------------------------------------------
const run = (cmd, args, cwd) => {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  return {
    ok: r.status === 0,
    status: r.status,
    seconds: Math.round((Date.now() - started) / 1000),
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    error: r.error,
  };
};

console.log(`\n${NAME}: ${selected.length} of ${totalFound} starter(s) under examples/starters/\n`);

const results = [];
for (const s of selected) {
  const label = `${s.name} [${s.tier.toLowerCase()}]`;

  // STANDALONE tier: its deps are not part of the pnpm workspace, so they are
  // not on disk from the root install.
  //
  // The install stays inside the starter's own directory and changes no version
  // range anywhere, so it cannot perturb the pnpm hoisted tree the rest of the
  // repo builds against — worth stating because a devDependency range declared
  // in one workspace package IS a workspace-wide fact under node-linker=hoisted,
  // and three starters do pin @types/node ^22 against the kit's ^26.
  if (s.tier === TIER_STANDALONE) {
    const hasModules = existsSync(join(s.dir, 'node_modules'));
    if (!hasModules || FRESH) {
      step(`${label} — npm ci (standalone consumer, deps not in the pnpm workspace)`);
      const inst = run('npm', ['ci', '--no-audit', '--no-fund'], s.dir);
      if (!inst.ok) {
        results.push({ ...s, phase: 'npm ci', ...inst });
        console.log(`  ✗ ${label} — npm ci failed in ${inst.seconds}s`);
        continue;
      }
      step(`${label} — installed in ${inst.seconds}s`);
    } else {
      step(`${label} — reusing existing node_modules (pass --fresh to reinstall)`);
    }
  }

  let failedPhase = null;
  let elapsed = 0;
  for (const script of s.scripts) {
    const r = run('npm', ['run', script], s.dir);
    elapsed += r.seconds;
    if (!r.ok) {
      failedPhase = { phase: `npm run ${script}`, ...r };
      break;
    }
  }

  if (failedPhase) {
    results.push({ ...s, ...failedPhase });
    console.log(`  ✗ ${label} — ${failedPhase.phase} failed in ${elapsed}s`);
  } else {
    results.push({ ...s, ok: true, seconds: elapsed });
    console.log(`  ✓ ${label} — ${s.scripts.map((x) => `npm run ${x}`).join(' + ')} in ${elapsed}s`);
  }
}

// ---- report -----------------------------------------------------------------
console.log('');
for (const r of results) {
  const mark = r.ok ? '✓' : '✗';
  const how = r.ok ? r.scripts.join(' + ') : `FAILED at ${r.phase}`;
  console.log(
    `  ${mark} ${r.name.padEnd(16)} ${r.tier.padEnd(11)} ${String(r.seconds).padStart(3)}s  ${how}` +
      (r.ok && !r.buildTypechecks ? '   (build does not typecheck — typecheck run separately)' : ''),
  );
}
for (const s of skipped) {
  console.log(`  – ${s.name.padEnd(16)} ${s.tier.padEnd(11)}   —  SKIPPED by ${s.why}`);
}

const broken = results.filter((r) => !r.ok);

if (skipped.length > 0) {
  console.log(
    `\n  PARTIAL COVERAGE: ${selected.length} of ${totalFound} starters checked. ` +
      `${skipped.length} skipped (${skipped.map((s) => s.name).join(', ')}).` +
      `\n  Run without --only/--linked-only for the full set. CI refuses those flags.`,
  );
}

if (broken.length > 0) {
  const detail = broken
    .map(
      (r) =>
        `  ✗ ${r.name} (${r.tier.toLowerCase()}, examples/starters/${r.name})\n` +
        `    ${r.phase} exited ${r.status}${r.error ? ` (${r.error.message})` : ''}\n\n` +
        r.output
          .trimEnd()
          .split('\n')
          .slice(-40)
          .map((l) => `      ${l}`)
          .join('\n'),
    )
    .join('\n\n');

  fail(
    `${broken.length} of ${selected.length} starter(s) do not build.\n\n` +
      `  These are the templates create-kai scaffolds from, so this breakage reaches\n` +
      `  every newly scaffolded project, not just examples/.\n\n` +
      `  Reproduce a single one with:\n` +
      `    cd examples/starters/${broken[0].name} && npm run ${broken[0].phase.replace('npm run ', '') || 'build'}\n\n` +
      detail,
  );
}

console.log(
  `\n✓ ${NAME} — ${results.length} of ${totalFound} starter(s) build clean` +
    (skipped.length > 0 ? ` (${skipped.length} SKIPPED — see above)` : ' (all of them)') +
    `.\n`,
);
