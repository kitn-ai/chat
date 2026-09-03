#!/usr/bin/env node
// verify:blocks (V-2, blocks-and-parts plan 2026-08-31 Task 3.3): the CI cell
// that makes every block provably work per release. The block LIST is derived
// from the packages/blocks/blocks/ directory scan every run (a block IS a
// directory with a registry-item.json; adding one adds its cells with no list
// to edit), and each discovered block must pass every check in CHECK_NAMES:
//
//   [contracts]  its manifest validates and the kai- contract checks pass
//                (discoverBlocks + checkBlockContracts from
//                @kitn.ai/blocks's src/registry.ts -- the one module that
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
//   [html-binder] what tsc cannot see about the form that has no tsc: the
//                emitted binder exists, carries no TypeScript, awaits
//                customElements.whenDefined, and no file in the form
//                hand-rolls an SSE reader.
//   [react-tree] the three things spec 5.2 says tsc cannot see: no raw
//                <kai-*> JSX (the intrinsic escape hatch compiles, and it is
//                exactly what the typed wrappers exist to replace), no
//                element import outside the controller, and every emitted
//                target equal to what src/targets.ts derives.
//
// Those two read dist/blocks/f/<name>.<form>.json, the per-form trees
// gen-blocks emits and the blocks site displays, so what is checked is what a
// reader copies. Every block renders every framework form, so a MISSING tree
// is a red rather than a skip.
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
// baseline, a BASELINE MISMATCH (a doctored copy of a real committed
// baseline, one driver leg, light only -- the one class only a real browser
// run can prove caught), a binder carrying an `export interface` line, a
// react .tsx carrying a raw <kai-dock>, and a rendered file whose target
// disagrees with src/targets.ts. Guards that were never watched failing prove
// nothing ([[checks-that-prove-nothing]]).
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';

// The directory walk, shared with the react runtime cell (scripts/lib/).
import { scanBlocks } from './lib/scan-blocks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The authored block sources are their own package; the driver, its baselines
// and the generated pages stay here, because they need this package's build.
const BLOCKS_PKG_JSON = createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json');
const BLOCKS_PKG_ROOT = dirname(BLOCKS_PKG_JSON);
const BLOCKS_DIR = join(BLOCKS_PKG_ROOT, 'blocks');
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

// The entries, read out of the package's exports map (the gen-blocks.mjs
// pattern). `./targets` comes along because [react-tree] re-derives the
// install target of every emitted file rather than restating "src/components".
const blocksMap = JSON.parse(readFileSync(BLOCKS_PKG_JSON, 'utf8')).exports ?? {};
const blocksEntry = blocksMap['.']?.default;
const targetsEntry = blocksMap['./targets']?.default;
if (typeof blocksEntry !== 'string' || typeof targetsEntry !== 'string') {
  console.error('verify-blocks: @kitn.ai/blocks has no exports["."].default / exports["./targets"].default -- cannot locate the registry entry');
  process.exit(1);
}
const registry = await importTs(join(BLOCKS_PKG_ROOT, blocksEntry));
const targets = await importTs(join(BLOCKS_PKG_ROOT, targetsEntry));
const scaffolder = await importTs(join(ROOT, 'mcp/registry.ts'));
const routeIntegrations = scaffolder.listIntegrations().map((i) => i.id);
const nonscalarByTag = JSON.parse(readFileSync(join(ROOT, 'src/elements/element-nonscalar.json'), 'utf8'));


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
    errors.push(`${name}: no state script at packages/blocks/blocks/${name}/states.mjs -- every block declares its driver states (V-1); a block cannot ship unverified`);
  }
  if (!existsSync(page)) {
    errors.push(`${name}: no generated driver page at scripts/block-driver/pages/generated/${name}/index.html -- build first (gen-blocks writes it in postbuild)`);
  }
  if (!existsSync(baseline)) {
    errors.push(
      `${name}: no committed baseline at scripts/block-driver/baselines/${name}.json -- a block cannot ship unverified. Record one (from packages/ui, after a real build):\n` +
      `    node scripts/block-driver/driver.mjs ../blocks/blocks/${name}/states.mjs --serve scripts/block-driver/pages --pages block --record scripts/block-driver/baselines/${name}.json --shots <dir>\n` +
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

// The per-form trees gen-blocks emitted, or null when the file is absent --
// which is a red at every call site below, never a skip: every block is on the
// authored contract and renders every framework form.
function readFormFiles(name, form) {
  const path = join(OUT_DIR, 'f', `${name}.${form}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')).files;
}

// [html-binder] -- what tsc cannot see about the form that has no tsc.
function htmlBinderErrors(name, files) {
  const errors = [];
  const binder = files.find((f) => f.path === `${name}.js`);
  if (!binder) return [`${name}: the html form emitted no ${name}.js binder`];
  if (/^\s*(?:export\s+)?(?:interface|type)\s/m.test(binder.content)) {
    errors.push(`${name}: the emitted binder carries TypeScript; the strip did not run (gen-blocks writes the .js twin with esbuild)`);
  }
  for (const file of files) {
    if (/new\s+EventSource\(|text\/event-stream|\.getReader\(/.test(file.content)) {
      errors.push(`${name}/${file.path}: hand-rolls a stream reader; use the @kitn.ai/ui/wire readers`);
    }
  }
  if (!/customElements\.whenDefined/.test(binder.content)) {
    errors.push(`${name}: the binder does not await customElements.whenDefined. An element created before its definition lands DISCARDS a property set on it, and the upgrade does not put it back (spec 8b, amendment 7).`);
  }
  return errors;
}

// [react-tree] -- the three things spec 5.2 says tsc cannot see.
function reactTreeErrors(name, files) {
  const errors = [];
  for (const file of files) {
    if (file.path.endsWith('.tsx') && /<kai-[\w-]+/.test(file.content)) {
      errors.push(`${name}/${file.path}: renders a raw <kai-*> tag. The react form imports every element from @kitn.ai/ui/react (spec 5.2); the intrinsic-JSX escape hatch is exactly what this check forbids.`);
    }
    if (/from '@kitn\.ai\/ui\/elements'/.test(file.content) && !file.path.endsWith('.controller.ts')) {
      errors.push(`${name}/${file.path}: imports elements from @kitn.ai/ui/elements. Only the controller may name an element INTERFACE; the tree uses the wrappers.`);
    }
    const expected = targets.fileTarget('react', name, file.path);
    if (file.target !== expected) {
      errors.push(`${name}/${file.path}: target is "${file.target}", but src/targets.ts says "${expected}". The path the page displays is the path add writes.`);
    }
  }
  return errors;
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

  // The prefixed spellings of the same defect. `:messages=` and
  // `seed:messages=` are a non-scalar in ATTRIBUTE position exactly as a
  // bare `messages=` is; the scan used to require whitespace immediately
  // before the name, so both walked past it (spec 8a, amendment 2).
  for (const spelling of [':messages', 'seed:messages']) {
    const planted = {
      name: 'planted',
      manifest: { name: 'planted', title: 'P', description: 'p', type: 'registry:block', files: [{ path: 'page.html', type: 'registry:page' }] },
      files: new Map([['page.html', `<!doctype html><html lang="en"><head></head><body><kai-thread ${spelling}="messages"></kai-thread></body></html>`]]),
    };
    const errs = registry.checkBlockContracts(planted, nonscalarByTag);
    check(`contract violation detected (non-scalar in "${spelling}" position)`, errs.some((e) => /non-scalar prop "messages"/.test(e)), errs.join(' | '));
  }

  // A list binding with no :key. Mandatory, because the kai- reactivity
  // contract is reference-keyed (spec 8b, amendment 1).
  {
    const planted = {
      name: 'planted',
      manifest: { name: 'planted', title: 'P', description: 'p', type: 'registry:block', files: [{ path: 'page.html', type: 'registry:page' }] },
      files: new Map([['page.html', `<!doctype html><html lang="en"><head></head><body><kai-conversations><kai-conversation-item *for="row of rows"></kai-conversation-item></kai-conversations></body></html>`]]),
    };
    const errs = registry.checkBlockContracts(planted, nonscalarByTag);
    check('contract violation detected (*for with no :key)', errs.some((e) => /:key is mandatory/.test(e)), errs.join(' | '));
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
    const sources = scanBlocks(BLOCKS_DIR);
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

  // Class 7: a binder that still carries TypeScript must be named. The strip
  // runs once, in gen-blocks; a twin with types in it throws in the browser at
  // parse time and every check upstream of the strip stays green.
  {
    const errs = htmlBinderErrors('planted', [
      { path: 'planted.js', content: 'export interface State { open: boolean }\ncustomElements.whenDefined("kai-dock");\n', target: 'blocks/planted/planted.js' },
    ]);
    check('binder carrying TypeScript is named', errs.some((e) => /carries TypeScript/.test(e)), errs.join(' | '));
  }

  // Class 8: a raw <kai-*> tag in the react tree must be named. It COMPILES
  // (JSX lets any dashed tag through as an intrinsic), which is why tsc can
  // never be the check for it.
  {
    const errs = reactTreeErrors('planted', [
      { path: 'Planted.tsx', content: 'export const P = () => <kai-dock label="Support" />;\n', target: targets.fileTarget('react', 'planted', 'Planted.tsx') },
    ]);
    check('raw <kai-*> JSX in the react tree is named', errs.some((e) => /raw <kai-\*> tag/.test(e)), errs.join(' | '));
  }

  // Class 9: a rendered target that disagrees with src/targets.ts must be
  // named. The path the page displays is the path `add` writes, so a drift
  // between them is a lie the reader finds out about after running it.
  {
    const errs = reactTreeErrors('planted', [
      { path: 'Planted.tsx', content: 'export const P = () => null;\n', target: 'src/widgets/planted/Planted.tsx' },
    ]);
    check('rendered target disagreeing with targets.ts is named', errs.some((e) => /src\/targets\.ts says/.test(e)), errs.join(' | '));
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
// The checks each block runs, in order. The summary line counts THIS list
// rather than restating a number that goes stale the next time one is added.
const CHECK_NAMES = ['contracts', 'fresh', 'pins', 'driver', 'html-binder', 'react-tree'];
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

const sources = scanBlocks(BLOCKS_DIR);
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

// [html-binder] and [react-tree] -- over the per-form trees the site displays.
let structuralCells = 0;
for (const source of sources) {
  const name = source.dirName;
  for (const [checkName, files, errsOf] of [
    ['html-binder', readFormFiles(name, 'html'), htmlBinderErrors],
    ['react-tree', readFormFiles(name, 'react'), reactTreeErrors],
  ]) {
    if (!files) { red(name, checkName, `no dist/blocks/f/${name}.${checkName === 'html-binder' ? 'html' : 'react'}.json. Every block renders every framework form, so a missing tree is an unchecked block, not a simpler one -- build, and read what gen-blocks says.`); continue; }
    structuralCells += 1;
    const errs = errsOf(name, files);
    if (errs.length) red(name, checkName, errs);
    else ok(name, checkName, `(${files.length} file(s))`);
  }
}
// Anti-vacuity: zero structural cells is a broken walk over dist/blocks/f/,
// not an empty gallery. At least one block is on the authored contract.
if (structuralCells === 0) {
  failures.push('(all) [html-binder, react-tree] zero cells ran -- no per-form tree was found under dist/blocks/f/. Build first; a silent zero here reads as green.');
  console.error('RED (all) [html-binder, react-tree] zero cells ran -- no per-form tree under dist/blocks/f/');
}

if (failures.length) {
  console.error(`\nverify-blocks: FAIL -- ${failures.length} red check(s) across ${sources.length} block(s):`);
  for (const f of failures) console.error(`  RED ${f}`);
  process.exit(1);
}
console.log(
  `\nverify-blocks: PASS -- ${sources.length} block(s) over ${CHECK_NAMES.length} checks (${CHECK_NAMES.join(', ')}), ` +
    `${structuralCells} structural cell(s), all green.`,
);
