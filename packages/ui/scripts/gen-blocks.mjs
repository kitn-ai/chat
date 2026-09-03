// Blocks generation (Task 3.1, blocks-and-parts plan 2026-08-31): the
// filesystem half of @kitn.ai/blocks's src/registry.ts. Scans
// packages/blocks/blocks/<id>/ (a block IS a directory with a registry-item.json
// - adding one moves every output with no list to edit), validates manifests
// and the kai- contract checks, then emits the derived artifacts.
//
// OWNER RULING 2026-08-31: generated block forms are BUILD ARTIFACTS, never
// committed - blocks/<id>/ holds only authored source + registry-item.json
// (the shadcn-shaped file tree is the product), and everything derived lands
// under dist/ (gitignored; runs in postbuild after build:api, which produces
// the element-nonscalar.json input):
//
//   dist/blocks/registry.json                 the index (browse surface)
//   dist/blocks/r/<name>.json                 the per-block item JSON with
//                                             file contents - THE public
//                                             integration surface (CLI,
//                                             gallery, MCP all resolve it)
//   dist/blocks/f/<name>.<form>.json          one file per block per FRAMEWORK
//                                             delivery form (spec 3.5): the
//                                             rendered tree, contents and
//                                             install targets. The site's
//                                             code view reads these, and so
//                                             do the compile cells inside
//                                             verify:scaffold, so what the
//                                             page shows and what compiles
//                                             are the same bytes. NOT inlined
//                                             into r/<name>.json: that file
//                                             is the CLI's integration
//                                             surface and every `add` would
//                                             then download the trees it will
//                                             not use.
//   dist/blocks/r/<name>.cdn.html             the self-contained CDN-paste
//                                             form, pins stamped from
//                                             package.json at build - always
//                                             current by construction, so no
//                                             release-please extra-files
//                                             entry and no lint:cdn-pins
//                                             scope (dist is out of its scan)
//   scripts/block-driver/pages/generated/<name>/index.html
//                                             the SAME form rendered against
//                                             the driver's /kit/ mount, so
//                                             the V-1 driver runs the real
//                                             generated form, not a copy
//                                             (gitignored - compiled.css
//                                             precedent: generated into the
//                                             source tree so serve.mjs's one
//                                             pages root also reaches the
//                                             authored parity pages)
//
//   node scripts/gen-blocks.mjs           # write
//   node scripts/gen-blocks.mjs --check   # freshness mode: regenerate in
//                                         # memory and diff against dist -
//                                         # no longer a committed-file sync
//                                         # gate (nothing generated is
//                                         # committed); it answers "is the
//                                         # built output stale against the
//                                         # block sources RIGHT NOW", the
//                                         # verify:fresh pattern
import { readFileSync, writeFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The authored block sources live in their own package now. Resolve it rather
// than joining a path literal: a repo-root literal is exactly the hand-typed
// restatement that goes stale the next time something moves.
const BLOCKS_PKG_JSON = createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json');
const BLOCKS_PKG_ROOT = dirname(BLOCKS_PKG_JSON);
const BLOCKS_DIR = join(BLOCKS_PKG_ROOT, 'blocks');
// The OUTPUTS stay in packages/ui: dist/blocks/ ships inside @kitn.ai/ui, and
// the driver pages are served by this package's block driver.
const OUT_DIR = join(ROOT, 'dist', 'blocks');
const DRIVER_PAGES_DIR = join(ROOT, 'scripts', 'block-driver', 'pages', 'generated');
const CHECK = process.argv.includes('--check');

// esbuild-import a TS module (the gen-catalog.mjs pattern).
async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'gen-blocks-'));
  const bundle = join(tmp, 'mod.mjs');
  await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

// The entry is READ OUT OF the package's exports map, not restated: there is
// then one identity for the module, and a change to the map moves this with it.
// Resolving it through node's own resolver instead would depend on which
// conditions apply to a require of a .ts file, which is a detail this script
// has no reason to care about.
const blocksExports = JSON.parse(readFileSync(BLOCKS_PKG_JSON, 'utf8')).exports;
const blocksEntry = blocksExports?.['.']?.default;
if (typeof blocksEntry !== 'string') {
  console.error('gen-blocks: @kitn.ai/blocks has no exports["."].default -- cannot locate the registry entry');
  process.exit(1);
}
const blocksMod = await importTs(join(BLOCKS_PKG_ROOT, blocksEntry));
const scaffolderRegistry = await importTs(join(ROOT, 'mcp/registry.ts'));

// Axes and inputs, each read where it lives - never restated:
const routeIntegrations = scaffolderRegistry.listIntegrations().map((i) => i.id);
const nonscalarByTag = JSON.parse(readFileSync(join(ROOT, 'src/elements/element-nonscalar.json'), 'utf8'));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------- the scan
const sources = [];
for (const entry of readdirSync(BLOCKS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(BLOCKS_DIR, entry.name);
  const manifestPath = join(dir, 'registry-item.json');
  if (!existsSync(manifestPath)) continue; // r/ and any non-block dir
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name !== 'registry-item.json')
    .map((f) => ({ name: f.name, content: readFileSync(join(dir, f.name), 'utf8') }));
  sources.push({ dirName: entry.name, manifestJson: readFileSync(manifestPath, 'utf8'), files });
}
if (sources.length === 0) {
  console.error(`gen-blocks: no block directories under ${BLOCKS_DIR} - a zero-block scan is a broken walk, not an empty gallery`);
  process.exit(1);
}

const { blocks, errors } = blocksMod.discoverBlocks(sources, routeIntegrations);
for (const block of blocks) errors.push(...blocksMod.checkBlockContracts(block, nonscalarByTag));
if (errors.length) {
  console.error(`gen-blocks: ${errors.length} error(s):`);
  for (const e of errors) console.error(`  RED ${e}`);
  process.exit(1);
}

// -------------------------------------------------------- the stripped twins
// The controller is TypeScript and two delivery forms land in contexts with
// no build step (a pasted single file, and a tree dropped next to markup), so
// the types come off HERE, once, and the stripped twin travels with the block
// inside the emitted item JSON. `packages/blocks` cannot do it: it depends on
// nothing, and the two RUNTIME renderers (the kai dev gallery route, inside
// the published CLI, and `create-kai add`, on Node >= 20.19) have no stripper
// either. Two strippers would emit two different files and break the one
// claim src/forms/index.ts makes.
const stripTypes = (source, fileName) =>
  esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: fileName }).code;

const blocksForms = await importTs(join(BLOCKS_PKG_ROOT, blocksExports['./forms'].default));
const withTwins = blocks.map((block) => blocksForms.withStrippedTwins(block, stripTypes));

// ------------------------------------------------------------- the outputs
/** path (repo-absolute) -> content */
const outputs = new Map();
const put = (path, content) => outputs.set(path, content);

put(join(OUT_DIR, 'registry.json'), JSON.stringify(blocksMod.buildRegistryIndex(withTwins), null, 2) + '\n');
/** Blocks that render no framework form yet - see the transitional note below. */
const skippedForms = [];
for (const block of withTwins) {
  put(join(OUT_DIR, 'r', `${block.name}.json`), JSON.stringify(blocksMod.buildRegistryItem(block), null, 2) + '\n');

  // The paste form renders the HTML FORM first and inlines that. Calling
  // generateCdnForm on the AUTHORED block emits markup with no JavaScript in
  // it, because under the authored contract the entry script is GENERATED.
  put(join(OUT_DIR, 'r', `${block.name}.cdn.html`), cdnForm(block, { version: VERSION }, 'CDN form'));

  // The driver page: the same generated form against the local /kit/ mount
  // (no pins - kit-relative URLs the way serve.mjs mounts dist).
  put(join(DRIVER_PAGES_DIR, block.name, 'index.html'), cdnForm(block, { version: VERSION, base: '/kit/' }, 'driver form'));

  // One form JSON per FRAMEWORK renderer, from the TWINNED block, so the tree
  // the page displays carries the stripped .js twin the html form installs.
  // The axis is `FRAMEWORK_BLOCK_FORMS`, read where it lives: `cdn` is a
  // single pasted file with no project to compile and is covered by
  // verify:blocks [pins] and the driver instead.
  //
  // TRANSITIONAL: a block still on the pre-contract page shape renders no
  // framework form at all (there is no parsed template to render from), so it
  // is skipped by name here and its compile cells are skipped with it. PR B
  // Task 12 converts the rest, and this branch then covers nothing.
  if (!blocksMod.isAuthoredContractPage(pageHtmlOf(block))) {
    skippedForms.push(block.name);
    continue;
  }
  for (const form of blocksForms.FRAMEWORK_BLOCK_FORMS) {
    const files = formFiles(block, form.id);
    put(
      join(OUT_DIR, 'f', `${block.name}.${form.id}.json`),
      JSON.stringify({ block: block.name, form: form.id, files }, null, 2) + '\n',
    );
  }
}
if (skippedForms.length) {
  console.log(
    `gen-blocks: no per-form JSON for ${skippedForms.join(', ')} - not on the authored contract yet (PR B Task 12 converts them), so the form renderers and their compile cells have nothing to run on.`,
  );
}

/** The block's `registry:page` source, or '' when it declares none. */
function pageHtmlOf(block) {
  const entry = block.manifest.files.find((f) => f.type === 'registry:page');
  return (entry && block.files.get(entry.path)) ?? '';
}

function formFiles(block, formId) {
  try {
    return blocksForms.renderBlockForm(block, formId, { cdn: { version: VERSION } });
  } catch (err) {
    console.error(`gen-blocks: ${block.name} ${formId} form:\n  RED ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function cdnForm(block, opts, label) {
  try {
    return blocksForms.renderCdnFormFiles(block, opts)[0].content;
  } catch (err) {
    console.error(`gen-blocks: ${block.name} ${label}:\n  RED ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// --------------------------------------------------------- write, or diff
if (!CHECK) {
  for (const [path, content] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`wrote ${relative(ROOT, path)}`);
  }
  console.log(`gen-blocks: ${blocks.length} block(s), ${outputs.size} file(s).`);
} else {
  const drift = [];
  for (const [path, content] of outputs) {
    if (!existsSync(path)) { drift.push(`${relative(ROOT, path)}: missing (not built yet, or deleted)`); continue; }
    if (readFileSync(path, 'utf8') !== content) drift.push(`${relative(ROOT, path)}: stale (differs from what the generator produces now)`);
  }
  if (drift.length) {
    console.error(`gen-blocks --check: ${drift.length} stale built file(s) - the build output is behind the block sources; run \`node scripts/gen-blocks.mjs\` (or a full build):`);
    for (const d of drift) console.error(`  RED ${d}`);
    process.exit(1);
  }
  console.log(`gen-blocks --check: fresh (${blocks.length} block(s), ${outputs.size} file(s)).`);
}
