// Emits the construct format's PUBLISHED JSON Schema, derived from the Zod
// source of truth (mcp/construct/schema.ts) — never hand-edited.
// Two addresses, one artifact: the checked-in copy beside the source (what the
// MCP tool and tests read) and apps/docs/public/schemas/construct/v1.json
// (served at https://ui.kitn.ai/schemas/construct/v1.json — what a
// hand-author's editor fetches for autocomplete). Runs in build:api, so
// verify:generated (the generated-artifact drift guard) fails CI when either
// copy is stale. Additive evolution edits v1 in place; a breaking change bumps
// the URL.
//
// Loads the schema through vite-node? No: through the built dist/construct-cli
// would couple api-gen to the js build. tsx is not a dependency. The pragmatic
// path the repo already uses for TS-in-scripts is to esbuild-bundle the module
// into a throwaway .mjs and import it — the exact mechanism scripts/gen-catalog.mjs
// uses (its `importTs` helper) for the same problem, reused verbatim here.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Same mechanism as scripts/gen-catalog.mjs's `importTs`: esbuild-bundle the TS
// entry into a throwaway .mjs and import it. Kept local rather than shared so
// this generator has no import-time dependency on gen-catalog.mjs's own shape.
async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'gen-construct-schema-'));
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

async function loadSchemaModule() {
  const { z } = await import('zod');
  const { ConstructSchema, CONSTRUCT_SCHEMA_URL } = await importTs(
    join(PKG_ROOT, 'mcp/construct/schema.ts'),
  );
  return { z, ConstructSchema, CONSTRUCT_SCHEMA_URL };
}

const { z, ConstructSchema, CONSTRUCT_SCHEMA_URL } = await loadSchemaModule();

const schema = {
  $id: CONSTRUCT_SCHEMA_URL,
  ...z.toJSONSchema(ConstructSchema),
};
const body = `${JSON.stringify(schema, null, 2)}\n`;

for (const out of [
  join(PKG_ROOT, 'mcp/construct/construct.v1.schema.json'),
  join(PKG_ROOT, '../../apps/docs/public/schemas/construct/v1.json'),
]) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  console.log(`  · wrote ${out}`);
}
