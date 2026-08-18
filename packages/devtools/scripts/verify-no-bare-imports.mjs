#!/usr/bin/env node
// Does the shipped panel resolve ANY module at runtime? It must not.
//
// The panel is delivered by a script tag onto pages we do not control -- a CMS
// theme, a storefront -- where there is no import map, no bundler and no
// node_modules. A single bare specifier left in the artifact is a 404 at the one
// delivery point that matters.
//
// WHY THIS REPLACED A GREP FOR "@kitn.ai/ui". That was a fine proxy while the
// panel refused to use the kit at all. The panel now BUNDLES the kit's Solid
// primitives, so that string legitimately appears in compiled code, and the old
// check would either fail on correct code or be weakened into meaninglessness.
// The real invariant was never "does not mention the kit" -- it is "does not
// RESOLVE anything".
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = resolve(ROOT, 'dist/kai-devtools.es.js');

if (!existsSync(ARTIFACT)) {
  console.error('\n✗ verify-no-bare-imports: dist/kai-devtools.es.js missing — run `npm run build` first.\n');
  process.exit(1);
}

const src = readFileSync(ARTIFACT, 'utf8');

/** Every syntactic form that makes the runtime resolve a module. */
const PATTERNS = [
  { label: 'import … from', re: /(?:^|[;\s}])import\s[^;]*?\sfrom\s*["']([^"']+)["']/g },
  { label: 'bare import', re: /(?:^|[;\s}])import\s*["']([^"']+)["']/g },
  { label: 'export … from', re: /(?:^|[;\s}])export\s[^;]*?\sfrom\s*["']([^"']+)["']/g },
  { label: 'dynamic import', re: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g },
];

const found = [];
for (const { label, re } of PATTERNS) {
  for (const m of src.matchAll(re)) found.push({ label, spec: m[1] });
}

const isRelative = (s) => s.startsWith('./') || s.startsWith('../') || s.startsWith('/');
const bare = found.filter(({ spec }) => !isRelative(spec));

console.log(`  · scanned ${src.length.toLocaleString()} bytes, found ${found.length} module specifier(s)`);

if (bare.length > 0) {
  console.error(`\n✗ verify-no-bare-imports: the built panel resolves ${bare.length} bare specifier(s):\n`);
  for (const { label, spec } of bare) console.error(`  • ${spec}   (${label})`);
  console.error(
    '\n  The panel is loaded by a script tag with no import map and no bundler, so\n' +
      '  each of these is a 404 in the environments this tool exists for. Everything\n' +
      '  must be bundled in: check `rollupOptions.external` in vite.config.ts.\n',
  );
  process.exit(1);
}

console.log('\n✓ verify-no-bare-imports: the panel resolves nothing at runtime — every dependency is bundled in.\n');
