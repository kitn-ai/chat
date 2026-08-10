#!/usr/bin/env node
/**
 * Guard: no emitted .d.ts may reference a path outside dist/.
 *
 * The tarball ships `src/` today, so a declaration that type-imports
 * `../../src/elements/chat-types` still resolves for a consumer — by accident.
 * The moment raw source stops shipping (a reasonable size win) every such type
 * silently breaks, exactly like `@kitn.ai/ui/provider`, whose declarations
 * reached outside dist/ and therefore never typechecked at all.
 *
 * So: walk every .d.ts under dist/, pull out every module specifier and triple-slash
 * reference, and fail on any RELATIVE one that resolves outside dist/.
 * Bare specifiers (`react`, `@kitn.ai/ui/state`) are a consumer-resolution concern,
 * not a path-escape, and are checked separately below for self-references that
 * are not declared in the exports map.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(pkgRoot, 'dist');
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
const selfName = pkg.name;

/** Subpaths this package publicly declares — a self-import must hit one of these. */
const exportedSubpaths = Object.keys(pkg.exports ?? {}).map((k) =>
  k === '.' ? selfName : `${selfName}/${k.slice(2)}`,
);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Module specifiers in a .d.ts: static import/export ... from '…', bare side-effect
 * `import '…'`, dynamic `import('…')` type queries, and `/// <reference path="…" />`.
 */
function specifiersOf(text) {
  const found = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /<reference\s+path\s*=\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) found.push(m[1]);
  }
  return found;
}

function matchesExport(specifier) {
  if (specifier === selfName) return exportedSubpaths.includes(selfName);
  for (const sub of exportedSubpaths) {
    if (sub.endsWith('/*')) {
      if (specifier.startsWith(sub.slice(0, -1))) return true;
    } else if (specifier === sub) return true;
  }
  return false;
}

if (!statSync(distRoot, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ dist/ not found at ${distRoot} — run \`nx build ui\` first.`);
  process.exit(1);
}

/** Extensionless .d.ts resolution, the way tsc would do it. */
function resolvesInDist(target) {
  const candidates = [`${target}.d.ts`, join(target, 'index.d.ts'), target];
  if (target.endsWith('.js')) candidates.unshift(`${target.slice(0, -3)}.d.ts`);
  return candidates.some((c) => statSync(c, { throwIfNoEntry: false })?.isFile());
}

const escapes = [];
const dangling = [];
const badSelfRefs = [];
const files = walk(distRoot);

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const spec of specifiersOf(text)) {
    if (spec.startsWith('.')) {
      const target = resolve(dirname(file), spec);
      const rel = relative(distRoot, target);
      if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
        escapes.push({ file: relative(pkgRoot, file), spec, target: relative(pkgRoot, target) });
      } else if (!resolvesInDist(target)) {
        // Inside dist/ but pointing at nothing — a rewritten specifier that missed.
        dangling.push({ file: relative(pkgRoot, file), spec, target: relative(pkgRoot, target) });
      }
    } else if (spec === selfName || spec.startsWith(`${selfName}/`)) {
      if (!matchesExport(spec)) {
        badSelfRefs.push({ file: relative(pkgRoot, file), spec });
      }
    }
  }
}

if (escapes.length === 0 && dangling.length === 0 && badSelfRefs.length === 0) {
  console.log(
    `✓ dts boundaries: ${files.length} emitted .d.ts files reference nothing outside dist/.`,
  );
  process.exit(0);
}

if (escapes.length > 0) {
  console.error(
    `✗ ${escapes.length} declaration reference(s) escape dist/ — these only resolve because raw src/ still ships:\n`,
  );
  for (const e of escapes) {
    console.error(`  ${e.file}`);
    console.error(`      imports '${e.spec}'  ->  ${e.target}`);
  }
  console.error('');
}

if (dangling.length > 0) {
  console.error(`✗ ${dangling.length} declaration reference(s) point inside dist/ but resolve to nothing:\n`);
  for (const e of dangling) {
    console.error(`  ${e.file}`);
    console.error(`      imports '${e.spec}'  ->  ${e.target} (no .d.ts)`);
  }
  console.error('');
}

if (badSelfRefs.length > 0) {
  console.error(
    `✗ ${badSelfRefs.length} self-reference(s) to a subpath that package.json "exports" does not declare:\n`,
  );
  for (const e of badSelfRefs) console.error(`  ${e.file}  imports '${e.spec}'`);
  console.error('');
}

console.error(
  'Emitted declarations must point at compiled dist/ output, or at a public\n' +
    `"${selfName}" subpath listed in the exports map.`,
);
process.exit(1);
