#!/usr/bin/env node
/**
 * verify:construct — the CI gate for the construct engine's real emit chain.
 *
 * WHY IT EXISTS
 * -------------
 * Every other construct-engine test drives the LIBRARY (`generateProject`,
 * `validateConstruct`) in-process. Nothing before this gate drove the CLI a
 * real user runs (`node bin/mcp.js eject …`), installed the ejected project's
 * dependencies, compiled it under its OWN emitted tsconfig, built it with
 * vite, or bundled the compiled output inside a real consumer app. Any of
 * those four steps can be broken by a codegen change that every unit test
 * still passes, because a unit test never leaves the process.
 *
 * AXES: DERIVED, NEVER TYPED
 * ---------------------------
 * `layouts` and `capabilityKeys` are read off the drift-guarded schema
 * artifact (construct.v1.schema.json, kept honest against the Zod source by
 * the build's own generator). Adding a layout or a capability to the Zod
 * schema moves the printed cell count on its own, and an unrecognised
 * capability key with no fixture valuer is a HARD FAILURE rather than a
 * silent skip — see the `CAPABILITY_VALUES` loop below.
 *
 * THE EIGHT LEGS PER SYNTHESIZED FIXTURE
 * ---------------------------------------
 *   1. write the fixture JSON
 *   2. `node bin/mcp.js eject <fixture> <cellDir> --ui <tarball>` — the real
 *      CLI, pointed at THIS checkout's own packed tarball (never a hand-typed
 *      version — npm's published @kitn.ai/ui may not have caught up)
 *   3. one shared `npm install` (the first cell), node_modules SYMLINKED into
 *      every other cell — the verify-scaffold economy move; a per-cell
 *      install would be minutes × cells for identical dependency sets
 *   4. `tsc --noEmit` under the cell's OWN emitted tsconfig.json (strict +
 *      noUnusedLocals are IN that file — the gate compiles exactly what an
 *      ejecting consumer compiles)
 *   5. `npm run build` (the emitted vite lib config) — the element must
 *      actually bundle
 *   6. for one cell per LAYOUT (the layout × all-capabilities cell): a
 *      minimal Vite 8 consumer app that imports the COMPILED output and
 *      builds it, asserting the bundle still contains the tag name AND a
 *      `customElements` call path (Rolldown-era Vite is the aggressive
 *      tree-shaker that has actually broken this class of thing before —
 *      see verify-consumer-sideeffects.mjs)
 *   7. `--self-test` runs FIRST (own npm script entry): a fixture with a
 *      spliced type error MUST fail the tsc leg, and a bundle with the
 *      registration hand-stripped MUST fail the grep. Either one passing
 *      means the harness is broken, not the code under test.
 *   8. named fixtures (demo-widget, ops-console, …) ride along unchanged —
 *      every `*.construct.json` in the fixtures dir, discovered, never listed.
 *
 * COST
 * ----
 * Real npm installs + real vite builds across ~30+ cells: minutes, not
 * seconds. Needs network (the shared install's non-tarball deps, and the
 * consumer-bundle leg's `vite@^8`). Runs in the required CI job after the
 * build, beside verify:scaffold.
 *
 *   npm run verify:construct                 # from packages/ui
 *   node scripts/verify-construct.mjs --self-test    # prove the harness detects
 *   node scripts/verify-construct.mjs [--keep] [--filter <substring>]
 */
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  symlinkSync,
  cpSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPackedFilename } from '../../../scripts/pack-listing.mjs';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');
const KEEP = process.argv.includes('--keep');
const filterIdx = process.argv.indexOf('--filter');
const FILTER = filterIdx > -1 ? process.argv[filterIdx + 1] : null;

const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();

const fail = (msg) => {
  console.error(`\n✗ verify-construct: ${msg}\n`);
  process.exit(1);
};
const step = (msg) => console.log(`  · ${msg}`);
const run = (cmd, args, cwd, opts = {}) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

// ── build-artifact preamble (the verify-consumer-sideeffects convention) ────
const DIST_DIR = join(PKG_ROOT, 'dist');
const KAI_ES = join(DIST_DIR, 'kai.es.js');
const CONSTRUCT_CLI = join(DIST_DIR, 'construct-cli.es.js');
const SCHEMA_PATH = join(PKG_ROOT, 'src/agent-tooling/construct/construct.v1.schema.json');
const BIN = join(PKG_ROOT, 'bin/mcp.js');

for (const [path, what] of [
  [KAI_ES, 'dist/kai.es.js (the built elements entry)'],
  [CONSTRUCT_CLI, 'dist/construct-cli.es.js (the built construct CLI, what bin/mcp.js loads for eject/dev/compile)'],
  [SCHEMA_PATH, 'the drift-guarded construct.v1.schema.json artifact'],
]) {
  if (!existsSync(path)) fail(`${what} not found at ${path} — run \`nx build ui\` first.`);
}

// ── AXES: DERIVED from the schema artifact, never typed ─────────────────────
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const layouts = SCHEMA.properties?.layout?.enum;
if (!Array.isArray(layouts) || layouts.length === 0)
  fail('construct.v1.schema.json has no properties.layout.enum — cannot derive the layout axis.');
const capabilityKeys = Object.keys(SCHEMA.properties?.capabilities?.properties ?? {});

/**
 * One synthesizer per capability key, keyed by NAME. A schema capability key
 * with no entry here is a HARD FAILURE (the verify-scaffold "unrecognised
 * runtime label" rule): a new capability cannot silently skip coverage.
 */
const CAPABILITY_VALUES = {
  starters: ['Track my order', 'Request a refund'],
  attachments: { accept: ['image/*', 'application/pdf'] },
  history: { persistence: 'local' },
  // Task 10b added `reasoning` after this brief's sample was written — the
  // rule fires exactly as designed, so it gets a valuer too.
  reasoning: 'compact',
  // Task 19f: schema.ts's superRefine rejects `reasoningOpen` whenever
  // `reasoning` is 'compact'/'off' — meaningless, no disclosure to open. The
  // "reasoning alone" solo cell above picked 'compact' for its own coverage,
  // so the two valuers collide only in the all-capabilities cell (every key
  // combined into one object). Handled below in fixtureFor, not by changing
  // either valuer — each keeps its own solo-cell coverage.
  reasoningOpen: true,
  // Task 5: schema.ts's superRefine (C-4) rejects `conversations: true`
  // unless `capabilities.history.persistence` is 'local' or 'endpoint' — a
  // hard cross-field dependency, same class as reasoningOpen's coupling to
  // `reasoning` above but the opposite direction (this one requires a
  // partner key rather than colliding with one). The solo `conversations`
  // cell never carries a `history` key on its own, so fixtureFor below
  // injects `history: { persistence: 'local' }` alongside it whenever
  // `history` isn't already present in the same cell (the all-capabilities
  // combo already carries its own `history` entry, so no injection needed
  // there).
  conversations: true,
};
for (const key of capabilityKeys) {
  if (!(key in CAPABILITY_VALUES)) {
    fail(
      `capability "${key}" is in the schema but has no fixture valuer — add one to ` +
        `CAPABILITY_VALUES in scripts/verify-construct.mjs.`,
    );
  }
}

function fixtureFor(layout, capKeys, index) {
  // Drop `reasoningOpen` when it would collide with `reasoning`'s own valuer
  // (compact/off) per schema.ts's superRefine coupling — only reachable when
  // both keys land in the same cell (the all-capabilities combo), since the
  // solo `reasoningOpen` cell never carries a `reasoning` key at all.
  const effectiveKeys =
    capKeys.includes('reasoning') &&
    capKeys.includes('reasoningOpen') &&
    (CAPABILITY_VALUES.reasoning === 'compact' || CAPABILITY_VALUES.reasoning === 'off')
      ? capKeys.filter((k) => k !== 'reasoningOpen')
      : capKeys;
  const capabilities = Object.fromEntries(effectiveKeys.map((k) => [k, CAPABILITY_VALUES[k]]));
  // `conversations` (Task 5) requires a `history` partner (schema.ts C-4) —
  // inject one when the cell doesn't already carry its own `history` key
  // (see the CAPABILITY_VALUES.conversations comment above).
  if (effectiveKeys.includes('conversations') && !('history' in capabilities)) {
    capabilities.history = { persistence: 'local' };
  }
  return {
    name: `probe-${layout}-${index}`,
    layout,
    provider: { mode: 'mock' },
    ...(capKeys.length ? { capabilities } : {}),
    // `custom` layout requires `slots` (superRefine) — kebab-case, <= 8, no dupes.
    ...(layout === 'custom' ? { slots: ['header'] } : {}),
  };
}

/**
 * cells: every layout × (none + each capability alone + all of them).
 * The all-capabilities cell per layout is also the one the consumer-bundle
 * leg runs over (one per layout, per the recorded scope decision).
 */
function buildCells() {
  const cells = [];
  for (const layout of layouts) {
    const probes = [[], ...capabilityKeys.map((k) => [k]), capabilityKeys];
    probes.forEach((capKeys, i) => {
      const isAllCaps = capabilityKeys.length > 0 && capKeys.length === capabilityKeys.length;
      cells.push({ fixture: fixtureFor(layout, capKeys, i), layout, isAllCaps });
    });
  }
  return cells;
}

const FIXTURES_DIR = join(PKG_ROOT, 'src/agent-tooling/construct/fixtures');
function namedFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.construct.json'))
    .map((f) => ({
      fixture: JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf8')),
      layout: null,
      isAllCaps: false,
      named: f,
    }));
}

// ── pack once per gate run ───────────────────────────────────────────────────
function packTarball(destDir) {
  step('npm pack (this checkout\'s own dist)');
  const { filename } = readPackedFilename(
    run('npm', ['pack', '--json', '--pack-destination', destDir], PKG_ROOT),
    { npmVersion },
  );
  return join(destDir, filename);
}

// ── shared install: eject the first cell, npm install, symlink into the rest ─
function ejectCell(fixture, outDir, uiSpec) {
  mkdirSync(outDir, { recursive: true });
  const fixturePath = join(outDir, `${fixture.name}.construct.tmp.json`);
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  run('node', [BIN, 'eject', fixturePath, outDir, '--ui', uiSpec], PKG_ROOT);
}

function shareNodeModules(templateDir, cellDir) {
  symlinkSync(join(templateDir, 'node_modules'), join(cellDir, 'node_modules'), 'dir');
}

// ── the grep the consumer-bundle leg (and the self-test) both use ───────────
/** True when a bundle both mentions the tag literal AND a customElements call
 *  path survives. Minifiers rewrite `customElements.define` through an
 *  aliased local binding, but never rewrite a string literal, so the tag
 *  literal is the honest signal (verify-consumer-sideeffects' reasoning). */
function bundleRegistersTag(code, tagName) {
  return code.includes(tagName) && code.includes('customElements');
}

/** Every `.js` file under `dir`, concatenated — no `find` spawn, portable. */
function walkJs(dir) {
  let code = '';
  if (!existsSync(dir)) return code;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) code += walkJs(p);
    else if (entry.name.endsWith('.js')) code += readFileSync(p, 'utf8');
  }
  return code;
}

// ── self-test: prove the harness actually detects what it claims to ─────────
async function selfTest() {
  console.log('\nverify-construct --self-test\n');
  const tmp = mkdtempSync(join(tmpdir(), 'kai-construct-selftest-'));
  try {
    const tarball = packTarball(tmp);

    // Probe 1: a spliced type error MUST fail the tsc leg.
    step('probe 1: a type error spliced into App.tsx must fail tsc --noEmit');
    const cellDir = join(tmp, 'probe-cell');
    ejectCell({ name: 'selftest-widget', layout: 'widget', provider: { mode: 'mock' } }, cellDir, tarball);
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], cellDir);

    const appPath = join(cellDir, 'src/App.tsx');
    const goodApp = readFileSync(appPath, 'utf8');
    writeFileSync(appPath, `${goodApp}\nconst __selftest_bad: string = 42;\n`);
    let brokenTscFailed = false;
    try {
      run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], cellDir);
    } catch {
      brokenTscFailed = true;
    }
    if (!brokenTscFailed) {
      fail(
        'probe 1: a deliberately broken App.tsx (const __selftest_bad: string = 42) compiled clean.\n' +
          '  The tsc leg is not actually checking anything — the harness is broken, not the fixture.',
      );
    }
    console.log('  ✓ probe 1: the broken fixture failed tsc as expected');

    // Restore and confirm the UNBROKEN fixture is what green looks like — a
    // self-test that never shows a passing case would only prove tsc runs,
    // not that it discriminates.
    writeFileSync(appPath, goodApp);
    run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], cellDir);
    console.log('  ✓ probe 1b: the unbroken fixture compiles clean (tsc discriminates, not just runs)');

    // Probe 2: a bundle with the registration hand-stripped MUST fail the grep.
    step('probe 2: a bundle with customElements.define stripped must fail the registration grep');
    const tag = 'selftest-widget';
    const realBundle = `import{x}from"y";function z(){customElements.define("${tag}",class extends HTMLElement{})}z();`;
    if (!bundleRegistersTag(realBundle, tag)) {
      fail('probe 2: a bundle that DOES register the tag was reported as missing it — grep is broken.');
    }
    console.log('  ✓ probe 2a: an intact bundle is reported as registering the tag');
    const strippedBundle = realBundle.replace(/customElements\.define\([^)]*\)/, '/* stripped */');
    if (bundleRegistersTag(strippedBundle, tag)) {
      fail(
        'probe 2: a bundle with customElements.define HAND-STRIPPED still passed the registration grep.\n' +
          '  The consumer-bundle leg would never catch a real tree-shaking regression.',
      );
    }
    console.log('  ✓ probe 2b: a stripped bundle is correctly reported as NOT registering the tag');
  } finally {
    if (KEEP) console.log(`\n  (--keep) self-test temp dir left at ${tmp}`);
    else rmSync(tmp, { recursive: true, force: true });
  }
  console.log('\n✓ verify-construct --self-test: both probes fail the right way. The harness is trustworthy.\n');
}

// ── the real gate ─────────────────────────────────────────────────────────
async function main() {
  const cells = [...buildCells(), ...namedFixtures()];
  const perLayoutProbeCount = capabilityKeys.length + 2; // none + each alone + all
  const synthesizedCount = layouts.length * perLayoutProbeCount;
  const namedCount = cells.length - synthesizedCount;
  console.log(
    `\nverify:construct — ${layouts.length} layouts × ${perLayoutProbeCount} probes ` +
      `(${capabilityKeys.length} capabilities: ${capabilityKeys.join(', ')}) ` +
      `= ${synthesizedCount} synthesized cells + ${namedCount} named fixture(s) = ${cells.length} total\n`,
  );

  const filtered = FILTER ? cells.filter((c) => c.fixture.name.includes(FILTER)) : cells;
  if (FILTER) console.log(`  (--filter ${FILTER}: ${filtered.length}/${cells.length} cells)`);

  const tmp = mkdtempSync(join(tmpdir(), 'kai-construct-'));
  let failure = null;
  try {
    const tarball = packTarball(tmp);

    const cellsRoot = join(tmp, 'cells');
    mkdirSync(cellsRoot, { recursive: true });

    step(`ejecting ${filtered.length} construct(s) through the real CLI (node bin/mcp.js eject … --ui <tarball>)`);
    const results = [];
    let templateDir = null;
    for (const c of filtered) {
      const dir = join(cellsRoot, c.fixture.name);
      try {
        ejectCell(c.fixture, dir, tarball);
      } catch (e) {
        results.push({ cell: c, dir, ok: false, stage: 'eject', detail: e.stderr || e.message });
        continue;
      }
      if (!templateDir) {
        step('shared install: npm install on the first cell, symlinked into the rest');
        run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir);
        templateDir = dir;
      } else {
        shareNodeModules(templateDir, dir);
      }
      results.push({ cell: c, dir, ok: true });
    }

    const failedEject = results.filter((r) => !r.ok);
    if (failedEject.length) {
      for (const r of failedEject) console.log(`  ✗ eject failed: ${r.cell.fixture.name}\n${r.detail}`);
      throw new Error(`${failedEject.length} construct(s) failed to eject through the CLI.`);
    }

    step(`tsc --noEmit under each cell's own emitted tsconfig.json`);
    const tscFailures = [];
    for (const r of results) {
      try {
        run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], r.dir);
      } catch (e) {
        tscFailures.push({ name: r.cell.fixture.name, detail: (e.stdout || '') + (e.stderr || e.message) });
      }
    }
    if (tscFailures.length) {
      for (const f of tscFailures) console.log(`  ✗ ${f.name}\n${f.detail}`);
      throw new Error(`${tscFailures.length}/${results.length} ejected cell(s) do not compile under their own tsconfig.`);
    }
    console.log(`  ✓ ${results.length}/${results.length} ejected cells compile clean`);

    step('npm run build (the emitted vite lib config) for each cell');
    const buildFailures = [];
    for (const r of results) {
      try {
        run('npm', ['run', 'build'], r.dir);
      } catch (e) {
        buildFailures.push({ name: r.cell.fixture.name, detail: (e.stdout || '') + (e.stderr || e.message) });
      }
    }
    if (buildFailures.length) {
      for (const f of buildFailures) console.log(`  ✗ ${f.name}\n${f.detail}`);
      throw new Error(`${buildFailures.length}/${results.length} ejected cell(s) failed \`npm run build\`.`);
    }
    console.log(`  ✓ ${results.length}/${results.length} ejected cells build clean`);

    // ── consumer-bundle leg: one cell per LAYOUT (the layout×all-caps cell) ──
    const bundleTargets = results.filter((r) => r.cell.isAllCaps);
    step(`consumer-bundle leg (Vite 8): ${bundleTargets.length} cell(s), one per layout`);
    if (bundleTargets.length === 0 && !FILTER) {
      throw new Error('no layout×all-capabilities cell found — the consumer-bundle leg would silently run zero times.');
    }
    if (bundleTargets.length > 0) {
      const consumerRoot = join(tmp, 'consumer-apps');
      mkdirSync(consumerRoot, { recursive: true });
      const first = bundleTargets[0];
      const templateApp = join(consumerRoot, `_template-${first.cell.fixture.name}`);
      // One `npm install vite@^8` shared across every consumer-bundle cell —
      // the compiled output needs nothing else (it's self-registering, no
      // externals — see codegen's emitViteLib comment).
      mkdirSync(join(templateApp, 'src'), { recursive: true });
      writeFileSync(
        join(templateApp, 'package.json'),
        JSON.stringify({ name: 'kai-construct-consumer-guard', private: true, version: '0.0.0', type: 'module' }, null, 2),
      );
      run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', 'vite@^8'], templateApp);

      const bundleFailures = [];
      for (const target of bundleTargets) {
        const name = target.cell.fixture.name;
        const appDir = join(consumerRoot, name);
        mkdirSync(join(appDir, 'src'), { recursive: true });
        writeFileSync(join(appDir, 'package.json'), readFileSync(join(templateApp, 'package.json'), 'utf8'));
        symlinkSync(join(templateApp, 'node_modules'), join(appDir, 'node_modules'), 'dir');

        // Copy the WHOLE compiled dist/, not just the named entry file: the
        // on-demand syntax highlighter (used by any card/message content
        // that renders code) splits into sibling chunk files the entry
        // dynamically imports by relative path — "no externals" (emitViteLib)
        // means no npm dependency, not literally one file on disk.
        const compiledDir = join(target.dir, 'dist');
        const compiledEntry = join(compiledDir, `${name}.js`);
        if (!existsSync(compiledEntry)) {
          bundleFailures.push({ name, detail: `expected compiled output at ${compiledEntry}, not found` });
          continue;
        }
        cpSync(compiledDir, join(appDir, 'src'), { recursive: true });
        writeFileSync(join(appDir, 'src/main.ts'), `import './${name}.js';\n`);
        writeFileSync(
          join(appDir, 'vite.config.js'),
          `export default { logLevel: 'error', build: { outDir: 'out', emptyOutDir: true, ` +
            `rollupOptions: { input: 'src/main.ts' } } };\n`,
        );
        try {
          run('npx', ['vite', 'build'], appDir);
        } catch (e) {
          bundleFailures.push({ name, detail: (e.stdout || '') + (e.stderr || e.message) });
          continue;
        }
        const bundleCode = walkJs(join(appDir, 'out'));
        if (!bundleRegistersTag(bundleCode, name)) {
          bundleFailures.push({
            name,
            detail: `the consumer bundle for <${name}> does not contain both the tag literal "${name}" and ` +
              `"customElements" — the registration was tree-shaken out of a real Vite 8 build.`,
          });
        }
      }
      if (bundleFailures.length) {
        for (const f of bundleFailures) console.log(`  ✗ ${f.name}\n${f.detail}`);
        throw new Error(`${bundleFailures.length}/${bundleTargets.length} consumer-bundle cell(s) dropped the registration.`);
      }
      console.log(`  ✓ ${bundleTargets.length}/${bundleTargets.length} consumer bundles register their tag`);
    }

    console.log(
      `\n✓ verify:construct — ${results.length} cells ejected, tsc'd, built; ` +
        `${bundleTargets.length} consumer-bundled. Real CLI, real install, real tsc, real vite, real bundler.\n`,
    );
  } catch (e) {
    failure = e;
  } finally {
    if (KEEP) console.log(`\n  (--keep) temp dir left at ${tmp}`);
    else rmSync(tmp, { recursive: true, force: true });
  }
  if (failure) fail(failure.message ?? String(failure));
}

if (SELF_TEST) {
  selfTest().catch((e) => fail(e?.stack ?? String(e)));
} else {
  main().catch((e) => fail(e?.stack ?? String(e)));
}
