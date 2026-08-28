// Writes each BUILDABLE template starter (and every variant starter) to
// src/agent-tooling/construct/fixtures/templates/<name>.construct.json —
// the §4-registered DERIVED COPY of templates.ts (B-15/B-18). The copy
// exists because verify-construct.mjs is an .mjs gate that reads JSON
// fixtures, not TS; verify:generated guards its drift (this generator runs
// in build:api), and verify:construct's fixture discovery then ejects/
// compiles/builds every starter on every gate run with zero new harness.
//
// Same `importTs` mechanism as gen-construct-schema.mjs (read its header):
// esbuild-bundle the TS module into a throwaway .mjs and import it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'gen-construct-template-fixtures-'));
  const bundle = join(tmp, 'bundle.mjs');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

const { buildableTemplates } = await importTs(
  join(PKG_ROOT, 'src/agent-tooling/construct/templates.ts'),
);

const OUT_DIR = join(PKG_ROOT, 'src/agent-tooling/construct/fixtures/templates');
mkdirSync(OUT_DIR, { recursive: true });

for (const template of buildableTemplates()) {
  const files = [
    [template.id, template.starter],
    ...(template.variants ?? []).map((v) => [`${template.id}.${v.id}`, v.starter]),
  ];
  for (const [name, starter] of files) {
    const out = join(OUT_DIR, `${name}.construct.json`);
    writeFileSync(out, `${JSON.stringify(starter, null, 2)}\n`);
    console.log(`  · wrote ${out}`);
  }
}
