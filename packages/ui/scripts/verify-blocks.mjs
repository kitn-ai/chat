#!/usr/bin/env node
// verify:blocks (V-2, blocks-and-parts plan 2026-08-31 Task 3.3): the CI cell
// that makes every block provably work per release. The block LIST is derived
// from the packages/ui/blocks/ directory scan every run (a block IS a
// directory with a registry-item.json; adding one adds its cells with no list
// to edit), and each discovered block must pass FOUR checks:
//
//   [contracts]  its manifest validates and the kai- contract checks pass
//                (discoverBlocks + checkBlockContracts from
//                src/agent-tooling/blocks/registry.ts -- the one module that
//                understands the layout; nothing is re-implemented here)
//   [fresh]      the generated forms under dist/blocks/ and the driver pages
//                are current against the block sources (gen-blocks.mjs
//                --check, spawned -- the verify:fresh pattern)
//   [pins]       the EMITTED CDN form's @kitn.ai/ui@<version> pins all equal
//                package.json's version. The registry test asserts this at
//                source; this re-asserts it on the artifact a consumer
//                actually pastes, because dist/ is outside lint:cdn-pins'
//                scan scope on purpose. Zero pins in a CDN form is a hard
//                failure (the form pins by construction, so zero means the
//                scan is broken, not that the form is clean).
//   [driver]     the block's declared states run against its COMMITTED
//                baseline and pass (the V-1 block driver, invoked per
//                scripts/block-driver/README.md: the block's own states.mjs,
//                the GENERATED page under pages/generated/<name>/, light +
//                dark, zero console errors, screenshots to a scratch dir).
//
// A discovered block MISSING its states.mjs or its committed baseline is a
// HARD FAILURE -- a block cannot ship unverified -- and the message says how
// to record one.
//
// BUILD-DEPENDENT, like verify:consumer and the built-bundle Playwright
// guards: it drives dist/ through the generated pages, so it hard-fails
// loudly without a build rather than skipping (a skip would read as green).
// Run `nx build ui` (or `npm run build` here) first; CI runs it after the
// build + Playwright-install steps.
//
//   node scripts/verify-blocks.mjs              # the gate
//   node scripts/verify-blocks.mjs --self-test  # plant one failure per check
//                                               # class and watch it caught
//
// --self-test plants: a manifest defect (two registry:page entries), a
// contract violation (legacy kitn- prefix + a kai-* listener on document), a
// doctored pin, a STALE emitted file (dist/blocks/registry.json is doctored
// on disk, gen-blocks --check must go red, then it is restored), a missing
// baseline, and a BASELINE MISMATCH (a doctored copy of a real committed
// baseline, one driver leg, light only -- the one class only a real browser
// run can prove caught). Guards that were never watched failing prove
// nothing ([[checks-that-prove-nothing]]).
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKS_DIR = join(ROOT, 'blocks');
const DRIVER_DIR = join(ROOT, 'scripts', 'block-driver');
const BASELINES_DIR = join(DRIVER_DIR, 'baselines');
const OUT_DIR = join(ROOT, 'dist', 'blocks');
const SELF_TEST = process.argv.includes('--self-test');
// 8954/8955: the driver's own default is 8952 (manual runs, Task 2.2 parity);
// distinct ports keep this gate from colliding with one of those in flight.
// Never 4400/4401/8931 (the block-driver README's standing rule).
const GATE_PORT = 8954;
const SELF_TEST_PORT = 8955;

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// esbuild-import the registry TS module (the gen-blocks.mjs / gen-catalog.mjs
// pattern) -- validation logic lives THERE, this file only orchestrates.
async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'verify-blocks-'));
  const bundle = join(tmp, 'mod.mjs');
  await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

const registry = await importTs(join(ROOT, 'src/agent-tooling/blocks/registry.ts'));
const scaffolder = await importTs(join(ROOT, 'src/agent-tooling/registry.ts'));
const routeIntegrations = scaffolder.listIntegrations().map((i) => i.id);
const nonscalarByTag = JSON.parse(readFileSync(join(ROOT, 'src/elements/element-nonscalar.json'), 'utf8'));

// The directory walk, mirroring gen-blocks.mjs' scan (the one fs-side copy;
// the registry module itself is fs-free by design, so each fs caller walks).
function scanBlocks() {
  const sources = [];
  for (const entry of readdirSync(BLOCKS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(BLOCKS_DIR, entry.name);
    const manifestPath = join(dir, 'registry-item.json');
    if (!existsSync(manifestPath)) continue;
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name !== 'registry-item.json')
      .map((f) => ({ name: f.name, content: readFileSync(join(dir, f.name), 'utf8') }));
    sources.push({ dirName: entry.name, manifestJson: readFileSync(manifestPath, 'utf8'), files });
  }
  return sources;
}

// [pins] on the emitted artifact. Exported-style helper so --self-test can
// feed it doctored input.
function pinErrors(html, name, version) {
  const pins = [...html.matchAll(/@kitn\.ai\/ui@([0-9A-Za-z.+-]+)\//g)].map((m) => m[1]);
  if (pins.length === 0) {
    return [`${name}: emitted CDN form carries NO @kitn.ai/ui@<version> pin -- the form pins by construction, so the scan or the generator is broken`];
  }
  return pins
    .filter((p) => p !== version)
    .map((p) => `${name}: emitted CDN form pins @kitn.ai/ui@${p}, package.json says ${version} -- rebuild (gen-blocks runs in postbuild)`);
}

// [driver] prerequisites for one block; returns error lines (empty = ready).
function driverPrereqErrors(name) {
  const errors = [];
  const states = join(BLOCKS_DIR, name, 'states.mjs');
  const baseline = join(BASELINES_DIR, `${name}.json`);
  const page = join(DRIVER_DIR, 'pages', 'generated', name, 'index.html');
  if (!existsSync(states)) {
    errors.push(`${name}: no state script at blocks/${name}/states.mjs -- every block declares its driver states (V-1); a block cannot ship unverified`);
  }
  if (!existsSync(page)) {
    errors.push(`${name}: no generated driver page at scripts/block-driver/pages/generated/${name}/index.html -- build first (gen-blocks writes it in postbuild)`);
  }
  if (!existsSync(baseline)) {
    errors.push(
      `${name}: no committed baseline at scripts/block-driver/baselines/${name}.json -- a block cannot ship unverified. Record one (from packages/ui, after a real build):\n` +
      `    node scripts/block-driver/driver.mjs blocks/${name}/states.mjs --serve scripts/block-driver/pages --pages block --record scripts/block-driver/baselines/${name}.json --shots <dir>\n` +
      `  then review the shots and COMMIT the baseline (screenshots go under baselines/screenshots-${name}/ per the house precedent).`,
    );
  }
  return errors;
}

function runDriver(name, { baseline, schemes, port, shots }) {
  const args = [
    join(DRIVER_DIR, 'driver.mjs'),
    join(BLOCKS_DIR, name, 'states.mjs'),
    '--serve', join(DRIVER_DIR, 'pages'),
    '--pages', 'block',
    '--schemes', schemes,
    '--port', String(port),
    '--baseline', baseline,
    '--shots', shots,
  ];
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
}

// ------------------------------------------------------------------ self-test
if (SELF_TEST) {
  const fails = [];
  const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'SELF-TEST OK ' : 'SELF-TEST RED'} ${label}`);
    if (!ok) fails.push(`${label}${detail ? ` -- ${detail}` : ''}`);
  };

  // Class 1: a manifest defect must be named (two registry:page entries).
  {
    const errs = registry.validateBlockManifest(
      { name: 'planted', title: 'Planted', description: 'planted', type: 'registry:block',
        files: [{ path: 'a.html', type: 'registry:page' }, { path: 'b.html', type: 'registry:page' }] },
      'planted', ['a.html', 'b.html'], { blockNames: ['planted'], routeIntegrations },
    );
    check('manifest defect detected (two registry:page entries)', errs.some((e) => /exactly one/.test(e)), errs.join(' | '));
  }

  // Class 2: a kai- contract violation must be named (legacy prefix + a
  // kai-* listener on document -- both planted in one file).
  {
    const planted = {
      name: 'planted',
      manifest: { name: 'planted', title: 'P', description: 'p', type: 'registry:block', files: [{ path: 'app.js', type: 'registry:file' }] },
      files: new Map([['app.js', `document.addEventListener('kai-submit', () => {});\nconst el = document.createElement('kitn-chat');`]]),
    };
    const errs = registry.checkBlockContracts(planted, nonscalarByTag);
    check('contract violation detected (kitn- prefix)', errs.some((e) => /kitn-/.test(e)), errs.join(' | '));
    check('contract violation detected (kai-* listener on document)', errs.some((e) => /do not bubble/.test(e)), errs.join(' | '));
  }

  // Class 3: a doctored pin, and a pinless form, must both be named.
  {
    const doctored = pinErrors(`import 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${VERSION}-doctored/dist/wire.js';`, 'planted', VERSION);
    check('pin mismatch detected on emitted form', doctored.length === 1 && /-doctored/.test(doctored[0]), doctored.join(' | '));
    const pinless = pinErrors('<html>no pins here</html>', 'planted', VERSION);
    check('pinless emitted form is a hard failure', pinless.length === 1 && /NO @kitn\.ai\/ui/.test(pinless[0]), pinless.join(' | '));
  }

  // Class 4: a STALE emitted file must turn gen-blocks --check red. Doctor
  // dist/blocks/registry.json on disk (a gitignored build artifact), watch
  // the spawned check fail naming it, restore.
  {
    const target = join(OUT_DIR, 'registry.json');
    if (!existsSync(target)) {
      check('stale emitted form detected (gen-blocks --check)', false, `${target} missing -- build first (nx build ui); this gate is build-dependent`);
    } else {
      const original = readFileSync(target, 'utf8');
      try {
        writeFileSync(target, original + '\n// planted drift\n');
        const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gen-blocks.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
        check('stale emitted form detected (gen-blocks --check)', res.status !== 0 && /stale/.test(res.stderr + res.stdout), `exit ${res.status}`);
      } finally {
        writeFileSync(target, original);
      }
    }
  }

  // Class 5: a discovered block with no committed baseline must hard-fail
  // with recording instructions.
  {
    const errs = driverPrereqErrors('planted-block-with-no-baseline');
    check('missing baseline is a hard failure with recording instructions',
      errs.some((e) => /cannot ship unverified/.test(e) && /--record/.test(e)), errs.join(' | '));
  }

  // Class 6: a BASELINE MISMATCH must turn the driver red -- a doctored copy
  // of a real committed baseline, one leg (light only, one block) so the
  // plant proves the browser-run class without doubling the gate's cost.
  {
    const sources = scanBlocks();
    const withBaseline = sources.map((s) => s.dirName).find((n) => driverPrereqErrors(n).length === 0);
    if (!withBaseline) {
      check('baseline mismatch detected by the driver', false,
        'no block has a committed baseline + generated page yet, so the one class needing a browser cannot be watched failing; record a baseline (see the missing-baseline message) and re-run');
    } else {
      const tmp = mkdtempSync(join(tmpdir(), 'verify-blocks-selftest-'));
      try {
        const baseline = JSON.parse(readFileSync(join(BASELINES_DIR, `${withBaseline}.json`), 'utf8'));
        const run = baseline.runs.find((r) => r.page === 'block' && r.colorScheme === 'light');
        const state = run?.states.find((s) => Object.keys(s.probes ?? {}).length > 0);
        if (!state) {
          check('baseline mismatch detected by the driver', false, `${withBaseline}'s baseline has no light-scheme block probes to doctor`);
        } else {
          const key = Object.keys(state.probes)[0];
          state.probes[key] = '__planted-mismatch__';
          const doctoredPath = join(tmp, `${withBaseline}.doctored.json`);
          writeFileSync(doctoredPath, JSON.stringify(baseline, null, 2));
          const res = runDriver(withBaseline, { baseline: doctoredPath, schemes: 'light', port: SELF_TEST_PORT, shots: join(tmp, 'shots') });
          check('baseline mismatch detected by the driver',
            res.status !== 0 && /__planted-mismatch__/.test(res.stdout + res.stderr),
            `exit ${res.status}; probe "${key}" on ${withBaseline}`);
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }

  if (fails.length) {
    console.error(`verify-blocks --self-test: ${fails.length} class(es) NOT caught:`);
    for (const f of fails) console.error(`  RED ${f}`);
    process.exit(1);
  }
  console.log('verify-blocks --self-test: every planted failure class was caught.');
  process.exit(0);
}

// ------------------------------------------------------------------ the gate
const failures = [];
const ok = (block, checkName, extra = '') => console.log(`OK  ${block} [${checkName}]${extra ? ` ${extra}` : ''}`);
const red = (block, checkName, lines) => {
  for (const line of [lines].flat()) {
    console.error(`RED ${block} [${checkName}] ${line}`);
    failures.push(`${block} [${checkName}] ${line.split('\n')[0]}`);
  }
};

// Build precondition: this gate drives dist/ through generated pages.
if (!existsSync(join(ROOT, 'dist', 'kai.es.js')) || !existsSync(OUT_DIR)) {
  console.error('verify-blocks: dist/ (or dist/blocks/) is missing -- this gate drives the BUILT kit through the generated block pages and cannot skip without reading as green. Run `nx build ui` (or `npm run build` in packages/ui) first.');
  process.exit(1);
}

const sources = scanBlocks();
if (sources.length === 0) {
  console.error(`verify-blocks: no block directories under ${BLOCKS_DIR} -- a zero-block scan is a broken walk, not an empty gallery.`);
  process.exit(1);
}
console.log(`verify-blocks: ${sources.length} block(s) discovered: ${sources.map((s) => s.dirName).join(', ')}`);

// [contracts] -- validation + kai- contract checks, per block.
const { blocks, errors: discoveryErrors } = registry.discoverBlocks(sources, routeIntegrations);
for (const source of sources) {
  const mine = discoveryErrors.filter((e) => e.startsWith(`${source.dirName}:`) || e.startsWith(`${source.dirName}/`));
  const block = blocks.find((b) => b.name === source.dirName);
  const contractErrs = block ? registry.checkBlockContracts(block, nonscalarByTag) : [];
  if (mine.length || contractErrs.length) red(source.dirName, 'contracts', [...mine, ...contractErrs]);
  else ok(source.dirName, 'contracts');
}

// [fresh] -- one spawned gen-blocks --check covers every emitted artifact.
{
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gen-blocks.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) red('(all)', 'fresh', (res.stderr + res.stdout).trim().split('\n'));
  else ok('(all)', 'fresh', (res.stdout.trim().split('\n').pop() ?? ''));
}

// [pins] -- on the emitted artifact each consumer pastes.
for (const source of sources) {
  const emitted = join(OUT_DIR, 'r', `${source.dirName}.cdn.html`);
  if (!existsSync(emitted)) { red(source.dirName, 'pins', `emitted CDN form missing at dist/blocks/r/${source.dirName}.cdn.html -- build first`); continue; }
  const errs = pinErrors(readFileSync(emitted, 'utf8'), source.dirName, VERSION);
  if (errs.length) red(source.dirName, 'pins', errs);
  else ok(source.dirName, 'pins', `(= ${VERSION})`);
}

// [driver] -- states vs the committed baseline, light + dark, per block.
const shotsRoot = mkdtempSync(join(tmpdir(), 'verify-blocks-shots-'));
for (const source of sources) {
  const name = source.dirName;
  const prereq = driverPrereqErrors(name);
  if (prereq.length) { red(name, 'driver', prereq); continue; }
  const t0 = Date.now();
  const res = runDriver(name, {
    baseline: join(BASELINES_DIR, `${name}.json`),
    schemes: 'light,dark',
    port: GATE_PORT,
    shots: join(shotsRoot, name),
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (res.status !== 0) {
    const tail = (res.stderr + res.stdout).trim().split('\n').filter((l) => /RED|FAIL|Error/.test(l));
    red(name, 'driver', tail.length ? tail : [`driver exited ${res.status}`]);
  } else {
    ok(name, 'driver', `(light+dark vs committed baseline, ${secs}s, shots in ${join(shotsRoot, name)})`);
  }
}
rmSync(shotsRoot, { recursive: true, force: true });

if (failures.length) {
  console.error(`\nverify-blocks: FAIL -- ${failures.length} red check(s) across ${sources.length} block(s):`);
  for (const f of failures) console.error(`  RED ${f}`);
  process.exit(1);
}
console.log(`\nverify-blocks: PASS -- ${sources.length} block(s) x 4 checks (contracts, fresh, pins, driver), all green.`);
