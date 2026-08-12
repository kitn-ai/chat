// Copy the published card JSON-Schema artifacts to dist/schemas/ so backends in any
// language can fetch/validate against the same shapes the kit uses.
//
// These files are PUBLIC: package.json "exports" maps `./schemas/*` onto this
// directory, so `@kitn.ai/ui/schemas/confirm.schema.json` is a supported specifier.
// (For JS/TS consumers the JS entry `@kitn.ai/ui/schemas` — dist/schemas.js, built
// from src/schemas/index.ts, whose declarations land in this same directory as
// index.d.ts — is the primary surface; this raw JSON is for Python/Go backends and
// for `fetch`.) `verify:schemas` resolves both from outside the package.
//
// Paths are anchored to THIS FILE, not to the cwd. `npm run build:schemas` happens to
// set the cwd to the package, but the repo's own CLAUDE.md tells everyone to run from
// the REPO ROOT, and done that way the cwd-relative version misbehaved in the worst
// possible order: it `mkdirSync`'d the OUTPUT before it read the INPUT, so it created a
// stray `dist/schemas/` wherever you happened to be standing and only then threw ENOENT
// on the source. Anchoring fixes where; the read-before-create below fixes the order, so
// a failure leaves nothing behind either way.
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(PKG_ROOT, 'src/primitives/card-schemas');
const OUT = join(PKG_ROOT, 'dist/schemas');

const files = readdirSync(SRC).filter((f) => f.endsWith('.schema.json'));
if (files.length === 0) {
  // Silently emitting an empty public directory would leave every `./schemas/*`
  // specifier resolving to nothing, which is the bug this surface was added to fix.
  console.error(`✗ no *.schema.json under ${SRC} — dist/schemas would ship empty.`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
for (const f of files) copyFileSync(join(SRC, f), join(OUT, f));
console.log(`✓ dist/schemas — ${files.length} card schema(s)`);
