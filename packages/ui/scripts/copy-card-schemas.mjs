// Copy the published card JSON-Schema artifacts to dist/schemas/ so backends in any
// language can fetch/validate against the same shapes the kit uses.
//
// These files are PUBLIC: package.json "exports" maps `./schemas/*` onto this
// directory, so `@kitn.ai/ui/schemas/confirm.schema.json` is a supported specifier.
// (For JS/TS consumers the JS entry `@kitn.ai/ui/schemas` — dist/schemas.js, built
// from src/schemas/index.ts, whose declarations land in this same directory as
// index.d.ts — is the primary surface; this raw JSON is for Python/Go backends and
// for `fetch`.) `verify:schemas` resolves both from outside the package.
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src/primitives/card-schemas';
const OUT = 'dist/schemas';

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => f.endsWith('.schema.json'));
if (files.length === 0) {
  // Silently emitting an empty public directory would leave every `./schemas/*`
  // specifier resolving to nothing, which is the bug this surface was added to fix.
  console.error(`✗ no *.schema.json under ${SRC} — dist/schemas would ship empty.`);
  process.exit(1);
}
for (const f of files) copyFileSync(join(SRC, f), join(OUT, f));
console.log(`✓ dist/schemas — ${files.length} card schema(s)`);
