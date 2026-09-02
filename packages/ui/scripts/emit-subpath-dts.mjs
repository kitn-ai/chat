#!/usr/bin/env node
/**
 * Make the emitted declarations resolvable for every consumer, in two passes:
 *
 *   PASS 1  a SIBLING .d.ts beside every bundled subpath entry that lacks one,
 *           so RELATIVE imports of a bundle resolve to types (TS7016 under
 *           `bundler`).
 *   PASS 2  an explicit extension on every relative specifier in every shipped
 *           .d.ts, so they resolve under `node16`/`nodenext` too (TS2834, which
 *           `skipLibCheck` hides — see the PASS 2 header).
 *
 * Both are declaration-emit gaps that a consumer hits and this package's own
 * typecheck never does. `verify:dts` asserts the result of both, in both
 * resolution modes.
 *
 * ── PASS 1 ──────────────────────────────────────────────────────────────────
 *
 * THE BUG THIS FIXES
 * ------------------
 * Each bundled subpath is a JS file at the top of dist/ whose declarations live
 * in a DIRECTORY beside it:
 *
 *     dist/state.js          <- the bundle (KAI_BUILD=state, config/vite/lib.ts)
 *     dist/state/index.d.ts  <- the declarations (barrel dts, entryRoot: src)
 *
 * package.json "exports" pairs those two by hand, so `@kitn.ai/ui/state` is fine.
 * Nothing else is. `dist/primitives/create-kai-chat.d.ts` imports '../state'
 * relatively — a path that sidesteps the exports map entirely — and under
 * `bundler`/`node16` resolution a matching FILE beats a directory index, so tsc
 * lands on `dist/state.js`, finds no declarations beside it, and any consumer
 * with `skipLibCheck: false` gets:
 *
 *     error TS7016: Could not find a declaration file for module '../state'
 *
 * Rather than chase the one import, this restores the convention tsc actually
 * relies on: a .js entry has its .d.ts as a SIBLING. Every relative path into the
 * bundle then resolves to types, whichever way a consumer reaches it.
 *
 * DERIVED, NOT LISTED
 * -------------------
 * The work list comes from package.json "exports" — for each subpath, the JS
 * target(s) and the declared `types` target. A new subpath is covered the day it
 * is added, with no hand-maintained table to drift. `verify:dts` independently
 * asserts the result, so a failure here surfaces as a red build, not a silent gap.
 *
 * Idempotent: re-running overwrites the generated shims and touches nothing else.
 * Only ever writes a path that does not already exist as a real emitted file.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(pkgRoot, 'dist');
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));

if (!existsSync(distRoot)) {
  console.error('✗ dist/ not found — run `nx build ui` first.');
  process.exit(1);
}

/** All `.js` targets under an exports condition tree, excluding `types`. */
const jsTargets = (node) => {
  if (typeof node === 'string') return node.endsWith('.js') ? [node] : [];
  if (Array.isArray(node)) return node.flatMap(jsTargets);
  if (node && typeof node === 'object') {
    return Object.entries(node)
      .filter(([cond]) => cond !== 'types')
      .flatMap(([, v]) => jsTargets(v));
  }
  return [];
};

/** The `types` target declared for a subpath, if any. */
const typesTarget = (node) => {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    if (typeof node.types === 'string') return node.types;
    for (const [cond, v] of Object.entries(node)) {
      if (cond === 'types') continue;
      const nested = typesTarget(v);
      if (nested) return nested;
    }
  }
  return null;
};

/**
 * Subpaths whose declared `types` path has no natural barrel counterpart of the
 * same name.
 *
 * Every OTHER bundled subpath's source lives at `src/<name>/index.ts`, so
 * vite-plugin-dts (entryRoot: 'src', over the barrel) already emits its real
 * declarations at `dist/<name>/index.d.ts` — exactly what package.json
 * "exports" declares as `types`, so PASS 1 above only ever needs to add a flat
 * SIBLING beside the bundle for relative importers, never to materialize the
 * declared path itself.
 *
 * `./define`'s source is `src/elements/define-entry.ts` (it lives beside the
 * OTHER elements/*, not in its own `define/` directory), so the barrel emits it
 * at `dist/elements/define-entry.d.ts` — one level deeper than the flat
 * `dist/define.d.ts` its own flat `dist/define.js` bundle declares. There is no
 * naming rule to derive that mapping from, so it is a real (and small) entry
 * list rather than a derivation — add an entry here, not a special case in the
 * loop below, if another subpath ever needs the same treatment.
 */
const REAL_TYPES_SOURCE = {
  './define': 'dist/elements/define-entry.d.ts',
};

const written = [];
const skipped = [];

for (const [subpath, node] of Object.entries(pkg.exports ?? {})) {
  if (subpath.includes('*')) continue; // wildcard families resolve per-file already
  const types = typesTarget(node);
  if (!types) continue;

  const typesAbs = resolve(pkgRoot, types);
  if (!existsSync(typesAbs)) {
    const real = REAL_TYPES_SOURCE[subpath];
    const realAbs = real && resolve(pkgRoot, real);
    if (!realAbs || !existsSync(realAbs)) {
      console.error(`✗ ${subpath}: declared types ${types} does not exist — build is incomplete.`);
      process.exit(1);
    }

    let spec = relative(dirname(typesAbs), realAbs).replace(/\.d\.ts$/, '.js');
    if (!spec.startsWith('.')) spec = `./${spec}`;
    const hasDefault = /^\s*(export\s+default|export\s*\{[^}]*\bdefault\b)/m.test(
      readFileSync(realAbs, 'utf8'),
    );
    writeFileSync(
      typesAbs,
      `// GENERATED by scripts/emit-subpath-dts.mjs (REAL_TYPES_SOURCE) — do not edit.\n` +
        `// The declared types for "${subpath}", shimmed onto the barrel's real\n` +
        `// declarations at ${real}.\n` +
        `export * from '${spec}';\n${hasDefault ? `export { default } from '${spec}';\n` : ''}`,
    );
    written.push(`${relative(pkgRoot, typesAbs)}  ->  ${spec}  (REAL_TYPES_SOURCE)`);
  }

  for (const js of jsTargets(node)) {
    const jsAbs = resolve(pkgRoot, js);
    const siblingAbs = `${jsAbs.slice(0, -'.js'.length)}.d.ts`;

    // Already correctly paired (dist/index.js + dist/index.d.ts) — nothing to do.
    if (siblingAbs === typesAbs || existsSync(siblingAbs)) {
      skipped.push(relative(pkgRoot, siblingAbs));
      continue;
    }
    if (!existsSync(jsAbs)) continue; // condition target the build did not emit

    // Relative specifier from the shim to the real declarations, carrying an
    // explicit `.js` extension so it resolves under nodenext too (see PASS 2).
    let spec = relative(dirname(siblingAbs), typesAbs).replace(/\.d\.ts$/, '.js');
    if (!spec.startsWith('.')) spec = `./${spec}`;

    // `export *` does not carry a default binding; forward one only if it exists.
    const hasDefault = /^\s*(export\s+default|export\s*\{[^}]*\bdefault\b)/m.test(
      readFileSync(typesAbs, 'utf8'),
    );

    const banner =
      `// GENERATED by scripts/emit-subpath-dts.mjs — do not edit.\n` +
      `// Sibling declarations for ${relative(pkgRoot, jsAbs)}, so that RELATIVE imports\n` +
      `// of this bundle (which bypass package.json "exports") still resolve to types.\n` +
      `// Without this, tsc resolves the path to the .js and reports TS7016.\n`;

    writeFileSync(
      siblingAbs,
      `${banner}export * from '${spec}';\n${hasDefault ? `export { default } from '${spec}';\n` : ''}`,
    );
    written.push(`${relative(pkgRoot, siblingAbs)}  ->  ${spec}`);
  }
}

if (written.length === 0) {
  console.log(`✓ subpath dts: every bundled entry already has sibling declarations (${skipped.length} checked).`);
} else {
  console.log(`✓ subpath dts: emitted ${written.length} sibling declaration file(s):`);
  for (const w of written) console.log(`    ${w}`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * PASS 2 — give every relative specifier in every shipped .d.ts an extension.
 *
 * THE BUG THIS FIXES
 * ------------------
 * tsc's declaration emit copies import specifiers through verbatim, so a source
 * `export * from './read'` ships as `export * from './read'`. `bundler`
 * resolution tolerates that. `node16`/`nodenext` does not — extensionless
 * relative specifiers are illegal in ESM (TS2834).
 *
 * The consequence is not an error, which is what made this survive: nearly every
 * consumer runs `skipLibCheck: true` (it is on in every Vite template), that
 * SUPPRESSES the TS2834s inside our .d.ts files, and every name re-exported
 * through a broken specifier quietly becomes `any`. Measured on 0.19.0, same
 * file, only the resolution mode changed:
 *
 *     bundler  -> const x: OpenAIWireMessage = 12345   errors TS2322  (correct)
 *     nodenext -> const x: OpenAIWireMessage = 12345   compiles clean (bug)
 *
 * So the entire public API stopped type-checking for node16/nodenext consumers,
 * with no diagnostic anywhere. nodenext is not a corner case: it is what the
 * stock `tsconfig.node.json` in Vite's TS templates uses, which is the mode our
 * own emitted backend routes compile under in a consumer's app.
 *
 * WHY REWRITE dist/ RATHER THAN THE SOURCE
 * ----------------------------------------
 * The alternative is `.js` extensions on every relative import in src/ (~368
 * specifiers). That is the same fix applied in a far more invasive place, and it
 * would fight the Solid/Vite authoring conventions the whole repo uses. The
 * declarations are a BUILD ARTIFACT; normalizing them on the way out is local,
 * reversible, and cannot affect how src/ compiles.
 *
 * `.js` (not `.d.ts`) is the correct target: TypeScript maps a `./read.js`
 * specifier onto `./read.d.ts`, and it is the only form legal in both modes.
 * bundler resolution accepts it too, so this ADDS a mode rather than trading one
 * for another — `verify:dts` asserts both.
 *
 * Idempotent: a specifier that already carries an extension is left untouched.
 * Runs after PASS 1 so the sibling shims are normalized in the same sweep, and
 * so `../state` prefers the sibling `dist/state.d.ts` — matching the file-beats-
 * directory pick bundler resolution already makes.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Specifier positions in a .d.ts, each as [prefix, quote, specifier]. Triple-slash
 *  `/// <reference path="…" />` is deliberately absent: those carry real .d.ts
 *  paths already and are not subject to ESM extension rules. */
const SPECIFIER_PATTERNS = [
  /(\bfrom\s*)(['"])([^'"]+)\2/g,
  /(\bimport\s*\(\s*)(['"])([^'"]+)\2/g,
  /(\bimport\s+)(['"])([^'"]+)\2/g,
  /(\brequire\s*\(\s*)(['"])([^'"]+)\2/g,
];

/** Anything already explicit stays as-is. */
const HAS_EXTENSION = /\.(js|mjs|cjs|jsx|json|css|node)$/i;

function walkDts(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkDts(full, out);
    else if (entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * The explicit form of a relative specifier, or null to leave it alone.
 * `./read` -> `./read.js` (sibling file) · `./foo` -> `./foo/index.js` (dir index).
 */
function withExtension(spec, containingFile) {
  if (!spec.startsWith('.') || HAS_EXTENSION.test(spec)) return null;
  const abs = resolve(dirname(containingFile), spec);
  if (existsSync(`${abs}.d.ts`)) return `${spec}.js`;
  if (existsSync(join(abs, 'index.d.ts'))) return `${spec.replace(/\/$/, '')}/index.js`;
  return null; // Points at nothing we emitted — verify:dts is the authority, let it report.
}

const rewritten = [];
const unresolved = [];

for (const file of walkDts(distRoot)) {
  const before = readFileSync(file, 'utf8');
  let count = 0;
  let after = before;

  for (const pattern of SPECIFIER_PATTERNS) {
    after = after.replace(pattern, (match, prefix, quote, spec) => {
      if (!spec.startsWith('.')) return match;
      const next = withExtension(spec, file);
      if (next === null) {
        if (!HAS_EXTENSION.test(spec)) {
          unresolved.push({ file: relative(pkgRoot, file), spec });
        }
        return match;
      }
      count += 1;
      return `${prefix}${quote}${next}${quote}`;
    });
  }

  if (count > 0) {
    writeFileSync(file, after);
    rewritten.push({ file: relative(pkgRoot, file), count });
  }
}

const total = rewritten.reduce((n, r) => n + r.count, 0);
if (total === 0) {
  console.log('✓ dts extensions: every relative specifier already carries one.');
} else {
  console.log(
    `✓ dts extensions: added explicit extensions to ${total} relative specifier(s) ` +
      `across ${rewritten.length} declaration file(s) — nodenext-resolvable.`,
  );
}

if (unresolved.length > 0) {
  console.warn(
    `\n⚠ ${unresolved.length} extensionless relative specifier(s) matched no emitted declaration ` +
      'and were left alone — verify:dts will fail on these:',
  );
  for (const u of unresolved.slice(0, 20)) console.warn(`    ${u.file}  ->  '${u.spec}'`);
}
