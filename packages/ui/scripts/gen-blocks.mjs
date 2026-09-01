// Blocks generation (Task 3.1, blocks-and-parts plan 2026-08-31): the
// filesystem half of src/agent-tooling/blocks/registry.ts. Scans
// packages/ui/blocks/<id>/ (a block IS a directory with a registry-item.json
// - adding one moves every output with no list to edit), validates manifests
// and the kai- contract checks, then emits the derived artifacts:
//
//   blocks/registry.json                      the index (browse surface)
//   blocks/r/<name>.json                      the per-block item JSON with
//                                             file contents - THE public
//                                             integration surface (CLI,
//                                             gallery, MCP all resolve it)
//   blocks/r/<name>.cdn.html                  the self-contained CDN-paste
//                                             form, pins generated from
//                                             package.json (lint:cdn-pins
//                                             scope; release-please rewrites
//                                             them via the inline
//                                             x-release-please-version
//                                             annotations + extra-files)
//   scripts/block-driver/pages/<name>/index.html
//                                             the SAME form rendered against
//                                             the driver's /kit/ mount, so
//                                             the V-1 driver runs the real
//                                             generated form, not a copy
//
//   node scripts/gen-blocks.mjs           # write
//   node scripts/gen-blocks.mjs --check   # drift mode: regenerate in memory
//                                         # and diff against the tree (the
//                                         # verify-generated-sync pattern:
//                                         # the committed artifact must match
//                                         # what the generator produces NOW)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKS_DIR = join(ROOT, 'blocks');
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

const blocksMod = await importTs(join(ROOT, 'src/agent-tooling/blocks/registry.ts'));
const scaffolderRegistry = await importTs(join(ROOT, 'src/agent-tooling/registry.ts'));

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

put(join(BLOCKS_DIR, 'registry.json'), JSON.stringify(blocksMod.buildRegistryIndex(blocks), null, 2) + '\n');
for (const block of blocks) {
  put(join(BLOCKS_DIR, 'r', `${block.name}.json`), JSON.stringify(blocksMod.buildRegistryItem(block), null, 2) + '\n');

  const cdn = blocksMod.generateCdnForm(block, { version: VERSION });
  if (cdn.errors.length) { console.error(`gen-blocks: ${block.name} CDN form:\n  RED ${cdn.errors.join('\n  RED ')}`); process.exit(1); }
  put(join(BLOCKS_DIR, 'r', `${block.name}.cdn.html`), cdn.html);

  // The driver page: the same generated form against the local /kit/ mount
  // (no pins - kit-relative URLs the way serve.mjs mounts dist).
  const local = blocksMod.generateCdnForm(block, { version: VERSION, base: '/kit/' });
  if (local.errors.length) { console.error(`gen-blocks: ${block.name} driver form:\n  RED ${local.errors.join('\n  RED ')}`); process.exit(1); }
  put(join(ROOT, 'scripts/block-driver/pages', block.name, 'index.html'), local.html);
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
    if (!existsSync(path)) { drift.push(`${relative(ROOT, path)}: missing (never generated, or deleted)`); continue; }
    if (readFileSync(path, 'utf8') !== content) drift.push(`${relative(ROOT, path)}: stale (differs from what the generator produces now)`);
  }
  if (drift.length) {
    console.error(`gen-blocks --check: ${drift.length} drifted file(s) - run \`node scripts/gen-blocks.mjs\` and commit:`);
    for (const d of drift) console.error(`  RED ${d}`);
    process.exit(1);
  }
  console.log(`gen-blocks --check: in sync (${blocks.length} block(s), ${outputs.size} file(s)).`);
}
