// Import the authored catalog modules from a plain Node script.
//
// They are TypeScript and they import zod, so they cannot just be `import()`ed;
// esbuild bundles them once into a temp file and that gets imported. The packer
// carries its own copy of this dance (inline, and predating this file) — the
// runner and the evaluator share this one rather than growing a third.
//
// This reads SOURCE, deliberately, not `dist`: the catalog is authored data, and
// an evaluation that scored against a stale build of it would be measuring the
// wrong catalog.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG_DIR = join(ROOT, 'src/agent-tooling/catalog');

/** @returns {Promise<{ listScenarios: Function, listInvariants: Function, listSurfaceRecipes: Function, listInventory: Function, listPartConsumption: Function, listFabrications: Function }>} */
export async function importCatalog() {
  const tmp = mkdtempSync(join(tmpdir(), 'kai-catalog-'));
  try {
    const entry = join(tmp, 'entry.ts');
    writeFileSync(
      entry,
      [
        `export { listScenarios } from ${JSON.stringify(join(CATALOG_DIR, 'scenarios.ts'))};`,
        `export { listInvariants } from ${JSON.stringify(join(CATALOG_DIR, 'invariants.ts'))};`,
        `export { listSurfaceRecipes, listInventory, listPartConsumption } from ${JSON.stringify(join(CATALOG_DIR, 'surfaces.ts'))};`,
        `export { listFabrications } from ${JSON.stringify(join(CATALOG_DIR, 'fabrications.ts'))};`,
      ].join('\n'),
    );
    const bundle = join(tmp, 'bundle.mjs');
    await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
    return await import(pathToFileURL(bundle).href);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** The derived layer and the element metadata, as committed artifacts. */
export const CATALOG_PATHS = {
  derived: join(CATALOG_DIR, 'derived.json'),
  elementMeta: join(ROOT, 'src/elements/element-meta.json'),
  packageJson: join(ROOT, 'package.json'),
};
