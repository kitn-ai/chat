// Blocks generation (Task 3.1, blocks-and-parts plan 2026-08-31): the
// filesystem half of mcp/blocks/registry.ts. Scans
// packages/ui/blocks/<id>/ (a block IS a directory with a registry-item.json
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

const blocksMod = await importTs(join(ROOT, 'mcp/blocks/registry.ts'));
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

// ------------------------------------------------------------- the outputs
/** path (repo-absolute) -> content */
const outputs = new Map();
const put = (path, content) => outputs.set(path, content);

put(join(OUT_DIR, 'registry.json'), JSON.stringify(blocksMod.buildRegistryIndex(blocks), null, 2) + '\n');
for (const block of blocks) {
  put(join(OUT_DIR, 'r', `${block.name}.json`), JSON.stringify(blocksMod.buildRegistryItem(block), null, 2) + '\n');

  const cdn = blocksMod.generateCdnForm(block, { version: VERSION });
  if (cdn.errors.length) { console.error(`gen-blocks: ${block.name} CDN form:\n  RED ${cdn.errors.join('\n  RED ')}`); process.exit(1); }
  put(join(OUT_DIR, 'r', `${block.name}.cdn.html`), cdn.html);

  // The driver page: the same generated form against the local /kit/ mount
  // (no pins - kit-relative URLs the way serve.mjs mounts dist).
  const local = blocksMod.generateCdnForm(block, { version: VERSION, base: '/kit/' });
  if (local.errors.length) { console.error(`gen-blocks: ${block.name} driver form:\n  RED ${local.errors.join('\n  RED ')}`); process.exit(1); }
  put(join(DRIVER_PAGES_DIR, block.name, 'index.html'), local.html);
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
