// The block directory walk: a block IS a directory holding a registry-item.json
// (spec 2026-08-31, Part 3). Adding a directory adds it to every gate with no
// list to edit.
//
// WHY IT LIVES HERE. `@kitn.ai/blocks` depends on nothing, `node:*` included,
// so the registry module that understands a block's LAYOUT cannot read one off
// disk. Every caller with a filesystem therefore walks, and this is where that
// walk lives so a new gate reuses one rather than adding another. gen-blocks.mjs
// keeps its own inline copy because it runs before anything else in postbuild
// and reports the scan in its own vocabulary. docs/coupling-map.md section 4
// registers the copies that remain, and records that nothing ties them
// together.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Scan `blocksDir` for authored blocks.
 *
 * Returns the `discoverBlocks` input shape: `{ dirName, manifestJson, files }`
 * per block, where `files` is every non-manifest file in the directory.
 */
export function scanBlocks(blocksDir) {
  const sources = [];
  for (const entry of readdirSync(blocksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(blocksDir, entry.name);
    const manifestPath = join(dir, 'registry-item.json');
    if (!existsSync(manifestPath)) continue;
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name !== 'registry-item.json')
      .map((f) => ({ name: f.name, content: readFileSync(join(dir, f.name), 'utf8') }));
    sources.push({ dirName: entry.name, manifestJson: readFileSync(manifestPath, 'utf8'), files });
  }
  return sources;
}
