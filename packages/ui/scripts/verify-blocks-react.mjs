#!/usr/bin/env node
// verify:blocks:react -- the REACT RUNTIME cell (spec section 5.3, ruled).
//
// Compile-only is not enough for react, and the contract spike proved it with
// two defects that type-check perfectly: a prop set back to `undefined` being
// skipped rather than clearing (the block showed its conversation starters
// forever) and a literal on a self-managed prop being re-applied after every
// render (every navigation silently undone). PR B0 fixed both mechanisms;
// this is what keeps them fixed.
//
// It drives the PACKED TARBALL, not the tree: the tree is not the tarball.
// One throwaway Vite app is installed once and reused per block, because the
// install is the expensive part and the component is the cheap part.
//
// THE HOST IS A CHECKED-IN FIXTURE, AND ITS VERSIONS ARE THE RANGES A REAL
// create-vite APP DECLARES. scripts/block-driver/react-host/ is a stock
// create-vite react-ts app; the install here passes the tarball and NO
// package list, so what the cell gets is whatever that package.json's ranges
// resolve to. The resolved versions are printed on every run so a future red
// can be read against them.
//
// WHAT IT DOES NOT COVER, stated so nobody reads its green as more than it is.
// Every OTHER framework form is compile-only (the cells inside verify:scaffold),
// and the LAYOUT probes are skipped on the react page: geometry was measured
// in the block's own document, and the host is a different one. The gate's own
// output repeats both.
//
//   node scripts/verify-blocks-react.mjs             # the gate
//   node scripts/verify-blocks-react.mjs --self-test # plant, watch, revert
//   node scripts/verify-blocks-react.mjs --keep      # leave the app for a look
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

import { readPackedFilename } from '../../../scripts/pack-listing.mjs';
import { scanBlocks } from './lib/scan-blocks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST_DIR = join(ROOT, 'scripts', 'block-driver', 'react-host');
const DRIVER = join(ROOT, 'scripts', 'block-driver', 'driver.mjs');
const SELF_TEST = process.argv.includes('--self-test');
const KEEP = process.argv.includes('--keep');
// Ports the block-driver README rules out: 4400, 4401, 8931, and the driver's
// own 8952 plus verify-blocks' 8954/8955. These two are this cell's.
const GATE_PORT = 8961;
const SELF_TEST_PORT = 8962;

// The host's dependency names, read off the fixture rather than restated, so
// the resolved-version report follows the file that pins them.
const HOST_MANIFEST = JSON.parse(readFileSync(join(HOST_DIR, 'package.json'), 'utf8'));
const HOST_DEPS = [...Object.keys(HOST_MANIFEST.dependencies ?? {}), ...Object.keys(HOST_MANIFEST.devDependencies ?? {})].sort();

// THE NO-WORKAROUND GREP. A cast is how a react tree passes tsc while lying,
// and PR B0's wrapper fixes exist so the emitted tree needs none.
const WORKAROUNDS = /@ts-expect-error|@ts-ignore|as Kai[A-Za-z]+Element|as unknown as/;

const log = (msg) => console.log(msg);
const fail = (msg) => {
  console.error(`\nverify-blocks-react: ${msg}\n`);
  process.exit(1);
};
// stdio pinned to pipes on BOTH streams: execFileSync lets a child's stderr
// through to this process by default, which printed every driver failure
// twice and made the second copy look like a second failure.
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

// ------------------------------------------------------------- the block side
// esbuild-import the TS modules (the gen-blocks.mjs pattern): validation and
// rendering live in @kitn.ai/blocks, and nothing about a block is decided here.
async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'verify-blocks-react-'));
  const bundle = join(tmp, 'mod.mjs');
  await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

const BLOCKS_PKG_JSON = createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json');
const BLOCKS_PKG_ROOT = dirname(BLOCKS_PKG_JSON);
const BLOCKS_DIR = join(BLOCKS_PKG_ROOT, 'blocks');
const blocksExports = JSON.parse(readFileSync(BLOCKS_PKG_JSON, 'utf8')).exports ?? {};
for (const key of ['.', './forms', './targets']) {
  if (typeof blocksExports[key]?.default !== 'string') {
    fail(`@kitn.ai/blocks has no exports["${key}"].default -- cannot locate the registry entry`);
  }
}
const registry = await importTs(join(BLOCKS_PKG_ROOT, blocksExports['.'].default));
const forms = await importTs(join(BLOCKS_PKG_ROOT, blocksExports['./forms'].default));
const targets = await importTs(join(BLOCKS_PKG_ROOT, blocksExports['./targets'].default));
const scaffolder = await importTs(join(ROOT, 'mcp/registry.ts'));

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const routeIntegrations = scaffolder.listIntegrations().map((i) => i.id);
const stripTypes = (source, fileName) =>
  esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: fileName }).code;

// Preconditions. A skip here reads as green, so both are hard failures.
if (!existsSync(join(ROOT, 'dist', 'kai.es.js')) || !existsSync(join(ROOT, 'dist', 'blocks'))) {
  fail('dist/kai.es.js (or dist/blocks/) is missing. This cell packs the BUILT package and drives it in a browser, so it cannot skip. Run `npm run build` in packages/ui first.');
}

const sources = scanBlocks(BLOCKS_DIR);
if (sources.length === 0) fail(`no block directories under ${BLOCKS_DIR} -- a zero-block scan is a broken walk, not an empty registry.`);
const { blocks, errors: discoveryErrors } = registry.discoverBlocks(sources, routeIntegrations);
if (discoveryErrors.length) fail(`the block scan did not validate:\n  RED ${discoveryErrors.join('\n  RED ')}`);

// Every discovered block renders a react form. There is no skip list: a block
// that cannot render one fails in `renderReact` by name.
if (blocks.length === 0) {
  fail('no discovered block, so this cell would run nothing. A zero-block run reads as green and is a hard failure.');
}

// The self-test's plants are written against ONE block's emitted tree, and
// they are picked BY NAME rather than by position. `blocks[0]` is whichever
// block sorts first, so a rename or a new block would silently hand the
// plants a tree they do not match -- which the "the plant did not apply"
// guard below would then report as a plant failure rather than as what it is.
const PLANT_BLOCK = 'support-widget';
const plantBlock = blocks.find((b) => b.name === PLANT_BLOCK);
if (SELF_TEST && !plantBlock) {
  fail(`--self-test plants are written against ${PLANT_BLOCK}'s emitted react tree (its refs, its State fields, its ViewStack) and that block is not in the registry. Point the plants at a block that is here, or restore it; a self-test with nothing to plant into proves nothing.`);
}

/** The rendered react tree for one block, as the site displays it. */
function renderReact(block) {
  return forms.renderBlockForm(forms.withStrippedTwins(block, stripTypes), 'react', { cdn: { version: VERSION } });
}

// ------------------------------------------------------------- the app side
/** Pack the built package and stand up one throwaway Vite app from the fixture. */
function standUpApp(tmp) {
  const app = join(tmp, 'app');
  log('  . npm pack');
  // Shape-normalised: npm 12 made the top level an object keyed by package
  // name, so `JSON.parse(raw)[0]` is `undefined` under it. See
  // <repo>/scripts/pack-listing.mjs.
  const npmVersion = run('npm', ['--version'], ROOT).trim();
  const { filename } = readPackedFilename(run('npm', ['pack', '--json', '--pack-destination', tmp], ROOT), { npmVersion });
  const tarball = join(tmp, filename);

  cpSync(HOST_DIR, app, { recursive: true });
  log('  . npm install (the tarball plus the fixture pins, no package list)');
  try {
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', tarball], app);
  } catch (err) {
    fail(`npm install failed (network?):\n${err.stderr || err.stdout || err.message}`);
  }

  const resolved = HOST_DEPS.map((name) => {
    const manifest = join(app, 'node_modules', name, 'package.json');
    return `${name}@${existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : 'MISSING'}`;
  });
  log(`  . resolved: ${resolved.join(', ')}`);
  return { app, resolved };
}

/** Write one block's rendered tree into the app AT ITS targets.
 *
 *  EVERY block's install root is cleared first, not just this one's. tsc runs
 *  over the whole app, so a tree left behind by the previous block is still in
 *  the program: its diagnostics would print under THIS block's name, and a
 *  block whose own tree is clean would go red for someone else's. */
function installTree(app, block, files) {
  for (const other of blocks) rmSync(join(app, targets.installRoot('react', other.name)), { recursive: true, force: true });
  for (const file of files) {
    const dest = join(app, file.target);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.content);
  }

  // src/block.ts: the one file the host does not ship, because it names the
  // block. The import path is DERIVED from the emitted target rather than
  // restated, so `targets.ts` is the thing under test here too.
  const component = forms.componentName(block.name);
  const tsx = files.find((f) => f.path === `${component}.tsx`);
  if (!tsx) fail(`${block.name}: the react form emitted no ${component}.tsx, so the host has nothing to mount.`);
  if (!tsx.target.startsWith('src/') || !tsx.target.endsWith('.tsx')) {
    fail(`${block.name}: the react install target is "${tsx.target}", which is not a .tsx under src/. The host mounts from src/block.ts and cannot import it.`);
  }
  const specifier = `./${tsx.target.slice('src/'.length, -'.tsx'.length)}`;
  writeFileSync(join(app, 'src', 'block.ts'), `export { ${component} as Block } from '${specifier}';\n`);
}

/** Poll the dev server until it answers, or the process dies. */
async function waitForServer(child, port, exited) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited.code !== null) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * Run one block through the whole cell, and say WHICH STAGE decided.
 *
 * The stage matters to --self-test: a plant meant for the browser that gets
 * caught by tsc would leave the cell compile-only in disguise, so the plants
 * name the stage they must be caught at and this returns it.
 */
async function runBlock({ app, block, files, port, shots }) {
  // Stage 1: the no-workaround grep.
  const casts = [];
  for (const file of files) {
    file.content.split('\n').forEach((line, i) => {
      if (WORKAROUNDS.test(line)) casts.push(`${block.name}/${file.path}:${i + 1}: ${line.trim()}`);
    });
  }
  if (casts.length) {
    return {
      stage: 'grep',
      ok: false,
      output: `${block.name}: the emitted react tree carries a type workaround. A cast is how a react tree passes tsc while lying, and the wrapper fixes exist so none is needed:\n  RED ${casts.join('\n  RED ')}`,
    };
  }

  installTree(app, block, files);

  // Stage 2: tsc, under the fixture's stock create-vite strict config.
  try {
    run('npx', ['tsc', '--noEmit'], app);
  } catch (err) {
    return { stage: 'tsc', ok: false, output: `${block.name}: the emitted react tree does not compile:\n${(err.stdout || '') + (err.stderr || '')}` };
  }

  // Stage 3: the block's own states.mjs, in a real Chromium, against the app.
  const exited = { code: null };
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  child.on('exit', (code) => { exited.code = code ?? 0; });
  try {
    if (!(await waitForServer(child, port, exited))) {
      return { stage: 'server', ok: false, output: `${block.name}: the vite dev server never came up on port ${port}:\n${serverLog}` };
    }
    const args = [
      DRIVER,
      join(BLOCKS_DIR, block.name, 'states.mjs'),
      '--pages', 'react',
      '--schemes', 'light',
      '--base', `http://127.0.0.1:${port}`,
      '--shots', shots,
    ];
    try {
      run(process.execPath, args, ROOT);
    } catch (err) {
      const lines = ((err.stdout || '') + (err.stderr || '')).split('\n').filter((l) => /RED |FAIL /.test(l));
      return { stage: 'driver', ok: false, output: `${block.name}: the block driver went red on the react page:\n${lines.join('\n') || err.message}` };
    }
  } finally {
    child.kill();
  }
  return { stage: 'driver', ok: true, output: '' };
}

// ------------------------------------------------------------------ self-test
// Three plants, into the EMITTED tree and never the source. Each names the
// stage that must catch it, so a plant caught early cannot be reported as
// proof of the stage it was written for.
//
// They are written against ONE NAMED block's emitted tree (PLANT_BLOCK above),
// which is what --self-test runs on. That is a coupling, and it is guarded
// twice: the block is looked up by name and its absence is a hard failure, and
// a plant whose replacement finds nothing changes no file, which the runner
// treats as a failure. Otherwise it would run the clean tree and report its
// green as a catch.
const PLANTS = [
  {
    label: 'a leftover cast in the react tree',
    stage: 'grep',
    apply: (files) => files.map((f) => (f.path.endsWith('.tsx')
      ? { ...f, content: f.content.replace('refs.current.stack = el;', 'refs.current.stack = el as unknown as never;') }
      : f)),
    expect: /as unknown as/,
    why: 'the no-workaround grep must fire: a cast is how a react tree passes tsc while lying',
  },
  {
    label: 'a broken binding (a State field that does not exist)',
    stage: 'tsc',
    apply: (files) => files.map((f) => (f.path.endsWith('.tsx')
      ? { ...f, content: f.content.replace('state.backHidden', 'state.backHiddenn') }
      : f)),
    expect: /error TS2339|error TS2551/,
    why: 'tsc must fire: a binding naming a field the controller does not declare is the compile half of this cell',
  },
  {
    // The plant is the LITERAL, not the removal of the seed effect. Deleting
    // the effect would take `useEffect` out of use and `noUnusedLocals` would
    // catch it at tsc, which is the one stage this plant must not be caught
    // at. Adding `view="home"` beside the seed leaves a tree that compiles
    // perfectly and re-applies the prop after every render.
    //
    // WHAT THE DRIVER ACTUALLY REPORTS, read off a real run rather than
    // predicted: the stack snaps back to `home` on the render that follows
    // every navigation, so by `4-reply` the conversation starter the state
    // clicks is not visible and the state errors there. The drilled-state
    // probes (`backArrow`, `homeTab`) are the same symptom one step later,
    // so the pattern accepts either.
    label: 'the F-6 controlled-component loop (a literal on a self-managed prop)',
    stage: 'driver',
    apply: (files) => files.map((f) => (f.path.endsWith('.tsx')
      ? { ...f, content: f.content.replace('<ViewStack', '<ViewStack view="home"') }
      : f)),
    expect: /probe "backArrow"|probe "homeTab"|4-reply: state errored/,
    why: 'ONLY the browser finds this one: it type-checks perfectly and silently undoes every navigation',
  },
];

async function selfTest(app, block, shotsRoot) {
  const base = renderReact(block);
  const fails = [];
  for (const plant of PLANTS) {
    const files = plant.apply(base.map((f) => ({ ...f })));
    const changed = files.some((f, i) => f.content !== base[i].content);
    if (!changed) {
      fails.push(`${plant.label}: the plant did not apply to ${block.name}'s emitted tree. A plant that changes nothing runs the CLEAN tree and reports its green as a catch.`);
      console.log(`SELF-TEST RED ${plant.label}`);
      continue;
    }
    const res = await runBlock({ app, block, files, port: SELF_TEST_PORT, shots: join(shotsRoot, `plant-${plant.stage}`) });
    const caught = !res.ok && plant.expect.test(res.output) && res.stage === plant.stage;
    console.log(`${caught ? 'SELF-TEST OK ' : 'SELF-TEST RED'} ${plant.label} (caught at stage "${res.stage}", must be "${plant.stage}")`);
    if (!caught) {
      fails.push(`${plant.label}: ${plant.why}\n    stage=${res.stage} ok=${res.ok}\n${res.output || '    (no output)'}`);
    }
  }
  if (fails.length) {
    console.error(`\nverify-blocks-react --self-test: ${fails.length} plant(s) NOT caught as required:`);
    for (const f of fails) console.error(`  RED ${f}`);
    return false;
  }
  console.log(`\nverify-blocks-react --self-test: every planted defect was caught at the stage it was written for, on ${block.name}.`);
  return true;
}

// ----------------------------------------------------------------- the run
const tmp = mkdtempSync(join(tmpdir(), 'kai-blocks-react-'));
let failed = false;
try {
  console.log(`\nverify-blocks-react${SELF_TEST ? ' --self-test' : ''} -- ${tmp}`);
  const { app, resolved } = standUpApp(tmp);
  const shotsRoot = join(tmp, 'shots');

  if (SELF_TEST) {
    failed = !(await selfTest(app, plantBlock, shotsRoot));
  } else {
    const ran = [];
    for (const block of blocks) {
      const t0 = Date.now();
      const res = await runBlock({ app, block, files: renderReact(block), port: GATE_PORT, shots: join(shotsRoot, block.name) });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (res.ok) {
        ran.push(block.name);
        console.log(`OK  ${block.name} [react runtime] (grep + tsc --strict + the driver's react page, light, ${secs}s)`);
      } else {
        failed = true;
        console.error(`RED ${res.output}`);
      }
    }
    // Anti-vacuity: a run over zero blocks is a broken walk, not a clean tree.
    if (ran.length === 0) failed = true;

    console.log(
      `\nverify-blocks-react: ${failed ? 'FAIL' : 'PASS'} -- ${ran.length} block(s) run in a real browser: ${ran.join(', ') || '(none)'}\n` +
        `  react is the one framework form this repo tests AT RUNTIME. Every other framework form is COMPILE-ONLY\n` +
        '  (the block compile cells inside verify:scaffold), so a green here says nothing about them.\n' +
        '  LAYOUT PROBES ARE NOT RUN on the react page: the geometry expectations were measured in the block\'s\n' +
        "  own document, and this host is a different one, so they stay on the driver's `block` page.\n" +
        `  Host: ${resolved.join(', ')}`,
    );
  }
} finally {
  if (KEEP) console.log(`\n(kept: ${tmp})`);
  else rmSync(tmp, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
