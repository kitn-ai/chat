#!/usr/bin/env node
/**
 * verify:add -- the PUBLISHED `create-kai add`, into one throwaway project per
 * detected form.
 *
 * The tree is not the tarball and the tarball is not what npx runs. Every
 * other check in this package reads `dist/` in the working tree; this one packs
 * the CLI, installs it, and runs the binary a user runs. What it grades is the
 * one thing no unit test can see: that the bytes the PACKED CLI puts on a real
 * filesystem, at real paths, are the bytes the /blocks page shows.
 *
 * THE LEGS ARE THE DETECTION ROWS (spec Part 3):
 *   react in the deps  -> the typed-wrapper tree, and it must COMPILE
 *   another framework  -> that framework's tree if this release emits one,
 *                         the framework-neutral html tree if it does not
 *   no project at all  -> the self-contained single-file paste form
 *
 * NOTHING PREDICTS WHICH FORM A LEG GETS. Each leg matches what landed on disk
 * against the generated artifacts and reports the form that matched, so PR B2
 * moves this gate's verdicts without moving a line of it. What is asserted is
 * what the RULING fixes: react gets the react tree under src/, no-project gets
 * the one-file paste form, and the three legs got three DIFFERENT forms --
 * which is the anti-vacuity floor, because three legs that all quietly landed
 * on html would be one leg run three times.
 *
 * ONLY THE REACT LEG INSTALLS. `add` writes files and merges a package.json;
 * neither needs a node_modules. So the CLI is installed once into a tools
 * directory and invoked by absolute path with the leg's directory as its cwd,
 * and the leg dirs are siblings of it under separate mkdtemp roots -- if the
 * tools install were an ANCESTOR of the no-project leg, `nearestPackageJson`
 * would walk up into it and turn rule 1 into rule 3 silently. The leg asserts
 * the "No project here" line as proof it did not.
 *
 * THE REACT HOST IS packages/ui/scripts/block-driver/react-host, reused rather
 * than copied: a stock create-vite react-ts app with PINNED dependency ranges,
 * which is the difference between a gate and a weather report. It deliberately
 * overlaps `verify:blocks:react` -- that gate proves the RENDERER's tree
 * compiles, this one proves the PACKED CLI puts those bytes where a project
 * can compile them.
 *
 *   node scripts/verify-add.mjs              # the legs
 *   node scripts/verify-add.mjs --self-test  # the legs, then four plants
 *   node scripts/verify-add.mjs --keep       # leave the projects for a look
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPackedFilename } from '../../../scripts/pack-listing.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');
const KEEP = process.argv.includes('--keep');

const require_ = createRequire(import.meta.url);
// Resolved through the package, never a `../../ui` literal: a relative path
// survives a package move silently until the directory it names is empty.
const UI_ROOT = path.dirname(require_.resolve('@kitn.ai/ui/package.json'));
const FORMS_DIR = path.join(UI_ROOT, 'dist/blocks/f');
const ITEMS_DIR = path.join(UI_ROOT, 'dist/blocks/r');
const REACT_HOST = path.join(UI_ROOT, 'scripts/block-driver/react-host');

const log = (msg) => console.log(msg);
const fail = (msg) => {
  console.error(`\nverify:add: ${msg}\n`);
  process.exit(1);
};
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

// ------------------------------------------------------------------ preflight

for (const [what, where, how] of [
  ['the built CLI', path.join(PKG_ROOT, 'dist/index.js'), 'pnpm --filter create-kai run build'],
  ['the bundled block registry', path.join(PKG_ROOT, 'dist/blocks'), 'pnpm --filter create-kai run build'],
  ['the generated form artifacts', FORMS_DIR, 'pnpm --filter @kitn.ai/ui run build:blocks'],
  ['the generated paste forms', ITEMS_DIR, 'pnpm --filter @kitn.ai/ui run build:blocks'],
  ['the react host fixture', REACT_HOST, 'check out packages/ui'],
]) {
  if (!existsSync(where)) fail(`${what} is missing at ${where}. Run \`${how}\` first: this gate drives the published artifact and cannot skip.`);
}

/** The blocks this release ships, read off the bundled registry the CLI walks. */
const BLOCKS = readdirSync(path.join(PKG_ROOT, 'dist/blocks'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(PKG_ROOT, 'dist/blocks', d.name, 'registry-item.json')))
  .map((d) => d.name);
if (BLOCKS.length === 0) fail('the bundled registry has no blocks, so every leg below would assert nothing');

/** Which framework forms the generator emits, read off the artifact names. */
const EMITTED_FORMS = [...new Set(
  readdirSync(FORMS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length).split('.').pop()),
)].sort();
if (EMITTED_FORMS.length === 0) fail(`no <block>.<form>.json under ${FORMS_DIR}`);

// -------------------------------------------------------------------- packing

const tmpRoot = mkdtempSync(path.join(tmpdir(), 'verify-add-'));
// toolsDir is created below, once the CLI is packed; declared here so cleanup
// can remove it too, and guarded on being set since it does not exist yet.
let toolsDir;
const cleanup = () => {
  if (KEEP) {
    log(`\n  (--keep) projects left at ${tmpRoot}`);
    if (toolsDir) log(`  (--keep) tools install left at ${toolsDir}`);
    return;
  }
  rmSync(tmpRoot, { recursive: true, force: true });
  if (toolsDir) rmSync(toolsDir, { recursive: true, force: true });
};
process.on('exit', cleanup);

// The npm to pack with, honoring VERIFY_PACK_NPM the same way verify-pack.mjs
// does, so this gate can be re-run under the release job's pinned npm too.
const NPM = process.env.VERIFY_PACK_NPM ?? 'npm';

function pack(dir, label) {
  const out = path.join(tmpRoot, 'tarballs');
  mkdirSync(out, { recursive: true });
  // readPackedFilename(raw, { npmVersion }) -> { filename, shape }: npm 12
  // moved `npm pack --json`'s top level from an array to an object keyed by
  // package name (see <repo>/scripts/pack-listing.mjs), so the version has to
  // be read first and handed in - verify-blocks-react.mjs is the precedent.
  const npmVersion = run(NPM, ['--version'], dir).trim();
  const { filename } = readPackedFilename(
    run(NPM, ['pack', '--json', '--pack-destination', out], dir),
    { npmVersion },
  );
  const file = path.join(out, filename);
  log(`  packed    ${label} -> ${path.basename(file)}`);
  return file;
}

const CLI_TARBALL = pack(PKG_ROOT, 'create-kai');
const KIT_TARBALL = pack(UI_ROOT, '@kitn.ai/ui');

// The CLI, installed ONCE, in its own root so it can never be an ancestor of a
// leg's project directory.
toolsDir = mkdtempSync(path.join(tmpdir(), 'verify-add-tools-'));
writeFileSync(path.join(toolsDir, 'package.json'), JSON.stringify({ name: 'verify-add-tools', private: true }, null, 2));
run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', CLI_TARBALL], toolsDir);
const CLI = path.join(toolsDir, 'node_modules/create-kai/dist/index.js');
if (!existsSync(CLI)) fail(`the packed CLI installed without a ${path.relative(toolsDir, CLI)} - the tarball is missing its bin`);

// ------------------------------------------------------------------ the match

/** Every generated form of one block, as `{ form, files: [{ target, content }] }`. */
function generatedForms(block) {
  const forms = EMITTED_FORMS.map((form) => ({
    form,
    files: JSON.parse(readFileSync(path.join(FORMS_DIR, `${block}.${form}.json`), 'utf8')).files,
  }));
  const paste = path.join(ITEMS_DIR, `${block}.cdn.html`);
  if (existsSync(paste)) {
    forms.push({ form: 'cdn', files: [{ target: `${block}.html`, content: readFileSync(paste, 'utf8') }] });
  }
  return forms;
}

/**
 * Which generated form is on disk under `root` for `block`, byte for byte.
 *
 * Returns the form id, or throws naming the first file that disagreed. Matching
 * rather than predicting is what makes this gate survive PR B2 unedited.
 */
function matchForm(root, block) {
  const misses = [];
  for (const candidate of generatedForms(block)) {
    const wrong = candidate.files.find((file) => {
      const abs = path.join(root, file.target);
      return !existsSync(abs) || readFileSync(abs, 'utf8') !== file.content;
    });
    if (!wrong) return candidate.form;
    const abs = path.join(root, wrong.target);
    misses.push(`${candidate.form}: ${wrong.target} ${existsSync(abs) ? 'differs byte for byte' : 'was not written'}`);
  }
  throw new Error(`${block}: nothing on disk matches a generated form.\n    ${misses.join('\n    ')}`);
}

/** Run the published CLI's `add` in `cwd`, returning its output. */
function add(cwd, block, extra = []) {
  try {
    return run(process.execPath, [CLI, 'add', block, '-y', ...extra], cwd);
  } catch (err) {
    throw new Error(`${block}: \`create-kai add\` exited ${err.status}\n${(err.stdout || '') + (err.stderr || '')}`);
  }
}

// -------------------------------------------------------------------- the legs

const results = [];

/**
 * A project directory with the given package.json, in its own mkdtemp root
 * under tmpRoot (not under toolsDir - R12 only forbids toolsDir being an
 * ancestor of a leg, and nesting here means cleanup()'s single rmSync of
 * tmpRoot removes every leg directory too, not just the react host).
 */
function project(label, pkg) {
  const dir = mkdtempSync(path.join(tmpRoot, `verify-add-${label}-`));
  if (pkg !== null) writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

// LEG 1: react in the deps. The only leg that installs, because it is the only
// one that compiles. The host fixture ships everything but src/block.ts.
function reactLeg() {
  const app = path.join(tmpRoot, 'react-host');
  cpSync(REACT_HOST, app, { recursive: true });
  // ONLY the kit tarball: `add()` always invokes the CLI by absolute path out
  // of the tools directory below (R12), never an app-local install, so
  // installing CLI_TARBALL here too would be a copy nothing reads (R10 vs R12,
  // reconciled - see the ruling).
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', KIT_TARBALL], app);
  const installed = JSON.parse(readFileSync(path.join(app, 'node_modules/@kitn.ai/ui/package.json'), 'utf8')).version;
  log(`  react     installed @kitn.ai/ui@${installed} from the tarball`);

  const forms = [];
  for (const block of BLOCKS) {
    const out = add(app, block);
    const form = matchForm(app, block);
    forms.push(form);
    for (const file of generatedForms(block).find((f) => f.form === form).files) {
      if (!out.includes(file.target)) throw new Error(`${block}: wrote ${file.target} without announcing it`);
    }
    log(`  react     ${block} -> ${form}`);
  }
  if (new Set(forms).size !== 1 || forms[0] !== 'react') {
    fail(`the react leg landed on ${[...new Set(forms)].join(', ')}; a project with react in its dependencies gets the typed-wrapper tree (spec Part 3, rule 2)`);
  }
  for (const block of BLOCKS) {
    for (const file of generatedForms(block).find((f) => f.form === 'react').files) {
      if (!file.target.startsWith('src/')) fail(`${block}: the react tree targets ${file.target}, which a src-rooted project cannot compile`);
    }
  }

  // src/block.ts: the one file the host does not ship, because it names the
  // block. The specifier is derived from the CLI's own written path.
  const first = BLOCKS[0];
  const tsx = generatedForms(first).find((f) => f.form === 'react').files.find((f) => f.target.endsWith('.tsx'));
  const component = path.basename(tsx.target, '.tsx');
  writeFileSync(
    path.join(app, 'src/block.ts'),
    `export { ${component} as Block } from './${tsx.target.slice('src/'.length, -'.tsx'.length)}';\n`,
  );

  try {
    run('npx', ['tsc', '--noEmit'], app);
  } catch (err) {
    fail(`the tree the packed CLI wrote does not compile against the installed @kitn.ai/ui:\n${(err.stdout || '') + (err.stderr || '')}`);
  }
  log('  react     tsc --noEmit clean over every written tree');
  results.push({ leg: 'react', form: 'react' });
  return app;
}

// LEG 2: another framework. `vue` because it is a signal row with no tree of
// its own today; the expectation is COMPUTED from which artifacts exist, so
// the day PR B2 emits a vue tree this leg expects it with nothing edited.
function otherFrameworkLeg() {
  const dir = project('vue', { name: 'host', private: true, dependencies: { vue: '^3.0.0' } });
  const expected = EMITTED_FORMS.includes('vue') ? 'vue' : 'html';
  const forms = [];
  for (const block of BLOCKS) {
    const out = add(dir, block);
    const form = matchForm(dir, block);
    forms.push(form);
    if (expected === 'html' && !out.includes('generates no vue tree yet')) {
      fail(`${block}: landed on the html form without saying why. A quiet fallback is the decision this gate exists to catch.`);
    }
    log(`  vue       ${block} -> ${form}`);
  }
  if (forms.some((form) => form !== expected)) {
    fail(`the vue leg landed on ${[...new Set(forms)].join(', ')}, expected ${expected} (computed from the forms under ${FORMS_DIR})`);
  }
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (!pkg.dependencies['@kitn.ai/ui']) fail('the vue leg did not merge the kit pin into package.json');
  results.push({ leg: 'vue', form: expected });
  return dir;
}

// LEG 3: no project at all. Rule 1: the self-contained paste form, in the cwd.
function noProjectLeg() {
  const dir = project('none', null);
  for (const block of BLOCKS) {
    const out = add(dir, block);
    if (!out.includes('No project here')) {
      fail(`${block}: no package.json anywhere above ${dir}, but the CLI did not take rule 1. Something up the tree owns a package.json.`);
    }
    const form = matchForm(dir, block);
    if (form !== 'cdn') fail(`${block}: a directory with no project got the ${form} form`);
    const written = readdirSync(dir);
    if (written.length !== BLOCKS.indexOf(block) + 1) {
      fail(`${block}: the paste form wrote ${written.length} entries (${written.join(', ')}); it is ONE self-contained file`);
    }
    log(`  none      ${block} -> cdn`);
  }
  results.push({ leg: 'none', form: 'cdn' });
  return dir;
}

log('\nverify:add -- the packed CLI, one project per detected form\n');
const reactApp = reactLeg();
const vueDir = otherFrameworkLeg();
noProjectLeg();

// THE ANTI-VACUITY FLOOR. Three legs that all landed on the same form would be
// one leg run three times, and every assertion above would still pass.
if (new Set(results.map((r) => r.form)).size !== results.length) {
  fail(`the legs landed on ${results.map((r) => `${r.leg}=${r.form}`).join(', ')} - they must cover DIFFERENT detection rows`);
}
log(`\n  OK        ${results.map((r) => `${r.leg} -> ${r.form}`).join(', ')} (${BLOCKS.length} block(s) each)`);

// ------------------------------------------------------------------ the plants

if (SELF_TEST) {
  log('\n  self-test: four plants, in the projects the legs left behind\n');
  const plants = [];
  const plant = (label, ok, detail = '') => {
    log(`${ok ? '  SELF-TEST OK ' : '  SELF-TEST RED'} ${label}`);
    if (!ok) plants.push(`${label}${detail ? ` -- ${detail}` : ''}`);
  };

  // 1. The collision refusal, whole-plan and loud. A second add over an edited
  //    file must refuse everything and overwrite nothing.
  {
    const block = BLOCKS[0];
    // MATCH, never predict (R11): the vue leg's form is whatever it actually
    // landed on, read off `results` rather than hard-coded as 'html' - the
    // day PR B2 emits a vue tree this leg's row in `results` says 'vue' and
    // the plant follows it with nothing here edited.
    const vueForm = results.find((r) => r.leg === 'vue').form;
    const target = generatedForms(block).find((f) => f.form === vueForm).files[0].target;
    const abs = path.join(vueDir, target);
    writeFileSync(abs, 'EDITED BY THE CONSUMER');
    let refused = false;
    let message = '';
    try {
      add(vueDir, block);
    } catch (err) {
      refused = true;
      message = err.message;
    }
    plant('a second add refuses, lists the collision, and overwrites nothing',
      refused && message.includes('refusing to overwrite') && message.includes(target)
        && readFileSync(abs, 'utf8') === 'EDITED BY THE CONSUMER',
      message.split('\n')[0]);
  }

  // 2. tsc must be able to fail. A compile leg that cannot go red is compile
  //    theatre, and it looks exactly like a passing one.
  {
    const block = BLOCKS[0];
    const tsx = generatedForms(block).find((f) => f.form === 'react').files.find((f) => f.target.endsWith('.tsx'));
    const abs = path.join(reactApp, tsx.target);
    const original = readFileSync(abs, 'utf8');
    writeFileSync(abs, `${original}\nconst rot: number = 'not a number';\nexport { rot };\n`);
    let red = false;
    try { run('npx', ['tsc', '--noEmit'], reactApp); } catch { red = true; }
    writeFileSync(abs, original);
    plant('tsc fires on a planted type error in the written tree', red);
  }

  // 3. The byte match must be able to fail: a file moved out of its target is
  //    the whole class this gate exists for.
  {
    const block = BLOCKS[0];
    const vueForm = results.find((r) => r.leg === 'vue').form;
    const target = generatedForms(block).find((f) => f.form === vueForm).files.at(-1).target;
    const abs = path.join(vueDir, target);
    const original = readFileSync(abs, 'utf8');
    writeFileSync(abs, `${original}\n<!-- drift -->\n`);
    let red = false;
    try { matchForm(vueDir, block); } catch { red = true; }
    writeFileSync(abs, original);
    plant('the byte match fires when a written file drifts from the artifact', red);
  }

  // 4. Rule 1 must be discriminating: a package.json in the same directory has
  //    to take the no-project leg off the paste form.
  {
    const block = BLOCKS[0];
    const dir = project('none-planted', { name: 'planted', private: true, dependencies: { vue: '^3.0.0' } });
    const out = add(dir, block);
    plant('a package.json takes the no-project leg off rule 1', !out.includes('No project here'), out.split('\n')[0]);
  }

  if (plants.length) fail(`${plants.length} plant(s) were not caught:\n  ${plants.join('\n  ')}`);
  log('\n  OK        every plant caught');
}
