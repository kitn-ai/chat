// GUARD — `npm run verify:solid-coverage`, run in the required CI `test` job.
//
// Fails the build when a registered element has no writable SolidJS equivalent,
// or when a public component ships no public `<Name>Props` type. Both are the
// same defect: a capability documented for one framework that a Solid consumer
// cannot express. Solid is the source of truth for this kit, so an element whose
// Solid surface is unreachable is a hole in the authored layer, not a Solid-only
// inconvenience.
//
// Derives the "one row per registered element -> what a SolidJS consumer writes"
// coverage map FROM THE REGISTRY AND THE COMPILER, so it cannot drift. There is
// no hand-written mapping table anywhere in this file; the only literals are the
// kit's own layer directory names. That is deliberate: this repo has been bitten
// repeatedly by hand-written content inside gen-*.mjs scripts that no compiler
// or drift check can see.
//
//   catalog  = src/elements/element-meta.json            (the registered kai-* elements)
//   surface  = the public root entry: `src/index.ts` module exports resolved by
//              the TS checker, intersected with the runtime keys of the BUILT
//              dist/index.server.js (a source export that does not survive the
//              build is not public)
//   usage    = the Solid components each facade actually renders, resolved
//              JSX-tag -> declaring module by the checker, recursing through
//              element-local helper components
//
// Verdict rule (deliberately sharp):
//   DIRECT       every Solid component the element renders is public, and it is one
//   COMPOSITION  every Solid component the element renders is public, and it is 2+
//   GAP          the element renders at least one Solid component that is NOT
//                reachable from the public entry (grade PARTIAL), or renders /
//                calls nothing public at all (grade TOTAL)
//
// Each GAP row carries its own proof: the missing symbol, its declaring module,
// and every public export that module does or does not provide.
//
// Usage:  node scripts/verify-solid-coverage.mjs [--json out.json]
//         Needs `nx build ui` first — the surface is cross-checked against the
//         runtime keys of the BUILT dist/index.server.js, and a missing build is
//         a hard error, not a silently-skipped check.

import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---- locate packages/ui without hard-coding a path --------------------------
let pkgRoot = process.cwd();
while (!existsSync(resolve(pkgRoot, 'src/elements/element-meta.json'))) {
  if (existsSync(resolve(pkgRoot, 'packages/ui/src/elements/element-meta.json'))) {
    pkgRoot = resolve(pkgRoot, 'packages/ui');
    break;
  }
  const up = dirname(pkgRoot);
  if (up === pkgRoot) throw new Error('run from packages/ui (or the repo root)');
  pkgRoot = up;
}
const srcDir = resolve(pkgRoot, 'src');
const elementsDir = resolve(srcDir, 'elements');
const rel = (f) => (f && f.startsWith(pkgRoot) ? relative(pkgRoot, f) : f);

// ---- 1. the catalog ---------------------------------------------------------
const catalog = JSON.parse(readFileSync(resolve(elementsDir, 'element-meta.json'), 'utf8'));

// ---- 2. TS program over the facades + the public entry ----------------------
const SKIP = new Set(['define.tsx', 'register.ts', 'register-impl.ts', 'css.ts', 'chat-types.ts']);
const facadeFiles = readdirSync(elementsDir)
  .filter((f) => /\.tsx?$/.test(f) && !/\.(stories|test)\.tsx?$/.test(f) && !SKIP.has(f))
  .map((f) => resolve(elementsDir, f));

const tsconfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile(resolve(pkgRoot, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  pkgRoot,
);
const entryPath = resolve(srcDir, 'index.ts');
const program = ts.createProgram([...facadeFiles, entryPath], { ...tsconfig.options, noEmit: true });
const checker = program.getTypeChecker();

// ---- 3. the public Solid surface -------------------------------------------
const entrySf = program.getSourceFile(entryPath);
const entrySym = entrySf && checker.getSymbolAtLocation(entrySf);
const publicValues = new Set();
const publicTypes = new Set();
const publicByModule = new Map(); // declaring file -> [public names]
for (const s of entrySym ? checker.getExportsOfModule(entrySym) : []) {
  let t = s;
  try { if (s.flags & ts.SymbolFlags.Alias) t = checker.getAliasedSymbol(s); } catch { /* unresolved */ }
  const decl = t.valueDeclaration ?? t.declarations?.[0];
  const file = decl?.getSourceFile().fileName;
  if (file) {
    if (!publicByModule.has(file)) publicByModule.set(file, []);
    publicByModule.get(file).push(s.name);
  }
  if (t.valueDeclaration || (t.flags & ts.SymbolFlags.Value)) publicValues.add(s.name);
  else publicTypes.add(s.name);
}

// Runtime cross-check against the BUILT entry. A source export that does not
// survive the build is not public, so this is load-bearing: without it the guard
// would pass on an export that a consumer cannot actually reach. Missing build
// is therefore a FAILURE, not a skipped check — a guard that silently degrades
// to a weaker guard is how this repo has shipped green-but-empty checks before.
const builtEntry = resolve(pkgRoot, 'dist/index.server.js');
if (!existsSync(builtEntry)) {
  console.error('verify-solid-coverage: dist/index.server.js is missing — run `nx build ui` first.');
  console.error('  (the public surface is cross-checked against the BUILT entry; without it this check proves nothing)');
  process.exit(1);
}
const runtimeExports = new Set(
  Object.keys(await import(pathToFileURL(builtEntry).href)).filter((k) => k !== 'default'),
);
const isPublic = (name) => publicValues.has(name) && runtimeExports.has(name);

// ---- 4. resolution helpers --------------------------------------------------
const LAYER = (file) =>
  !file ? 'unresolved'
  : file.startsWith(resolve(srcDir, 'ui') + '/') ? 'ui'
  : file.startsWith(resolve(srcDir, 'components') + '/') ? 'components'
  : file.startsWith(resolve(srcDir, 'primitives') + '/') ? 'primitives'
  : file.startsWith(resolve(srcDir, 'remote') + '/') ? 'remote'
  : file.startsWith(resolve(srcDir, 'state') + '/') ? 'state'
  : file.startsWith(elementsDir + '/') ? 'element-local'
  : file.startsWith(srcDir) ? 'src-other'
  : 'external';
const KIT = new Set(['ui', 'components', 'primitives', 'remote', 'state']);

function resolveIdent(node) {
  const name = node.getText();
  let sym = checker.getSymbolAtLocation(node);
  if (!sym) return { name, file: null, layer: 'unresolved' };
  try { if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym); } catch { /* */ }
  const decl = sym.valueDeclaration ?? sym.declarations?.[0];
  const file = decl?.getSourceFile().fileName ?? null;
  return { name, file, layer: LAYER(file), decl };
}

/** JSX tags used inside a node, resolved. Host elements (lowercase) skipped. */
function jsxTagsIn(node) {
  const out = [];
  const visit = (n) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const head = n.tagName.getText().split('.')[0];
      if (/^[A-Z]/.test(head)) out.push(resolveIdent(ts.isIdentifier(n.tagName) ? n.tagName : n.tagName.getFirstToken() ?? n.tagName));
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** The declaration node of a component `name` in `file` (function or const arrow). */
const declCache = new Map();
function declarationOf(name, file) {
  const key = `${file}#${name}`;
  if (declCache.has(key)) return declCache.get(key);
  const sf = file && program.getSourceFile(file);
  let found = null;
  if (sf) {
    const visit = (n) => {
      if (found) return;
      if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
      else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) found = n.initializer;
      else ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  declCache.set(key, found);
  return found;
}

/** Kit components rendered by a node, following element-local helpers. */
function kitUsage(node, seen = new Set()) {
  const found = new Map(); // name -> { layer, file }
  for (const tag of jsxTagsIn(node)) {
    if (KIT.has(tag.layer)) {
      if (!found.has(tag.name)) found.set(tag.name, { layer: tag.layer, file: tag.file });
    } else if (tag.layer === 'element-local') {
      const key = `${tag.file}#${tag.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = declarationOf(tag.name, tag.file);
      if (d) for (const [n, v] of kitUsage(d, seen)) if (!found.has(n)) found.set(n, v);
    }
  }
  return found;
}

/** Non-JSX kit bindings a facade imports and references (mountRemoteCard, renderIcon, …). */
function apiUsage(sourceFile) {
  const out = new Map();
  for (const st of sourceFile.statements) {
    if (!ts.isImportDeclaration(st) || st.importClause?.isTypeOnly) continue;
    const named = st.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const el of named.elements) {
      if (el.isTypeOnly) continue;
      const r = resolveIdent(el.name);
      if (KIT.has(r.layer) && !/^[A-Z]/.test(r.name)) out.set(r.name, { layer: r.layer, file: r.file });
    }
  }
  return out;
}

/**
 * Expand a kit-component set down to the PUBLIC components a consumer would have
 * to compose: public names are leaves; private names are expanded into whatever
 * they render, and a private component that bottoms out in no kit component at
 * all is an irreducible gap (hand-written code the consumer cannot reach).
 */
function expandToPublic(usage) {
  const publics = new Set();
  const irreducible = new Map(); // private name -> declaring module
  const seen = new Set();
  const walk = (map) => {
    for (const [name, info] of map) {
      if (isPublic(name)) { publics.add(name); continue; }
      const key = `${info.file}#${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = declarationOf(name, info.file);
      const inner = d ? kitUsage(d) : new Map();
      if (inner.size === 0) irreducible.set(name, rel(info.file));
      else walk(inner);
    }
  };
  walk(usage);
  return { publics: [...publics].sort(), irreducible: [...irreducible].map(([n, f]) => `${n} (${f})`).sort() };
}

/** Names a module exports (so a gap can be priced: re-export vs. write new code). */
const moduleExportCache = new Map();
function moduleExports(file) {
  if (!file) return new Set();
  if (moduleExportCache.has(file)) return moduleExportCache.get(file);
  const sf = program.getSourceFile(file);
  const sym = sf && checker.getSymbolAtLocation(sf);
  const names = new Set(sym ? checker.getExportsOfModule(sym).map((s) => s.name) : []);
  moduleExportCache.set(file, names);
  return names;
}

// ---- 5. walk every defineWebComponent --------------------------------------
const byTag = new Map();
for (const file of facadeFiles) {
  const sf = program.getSourceFile(file);
  if (!sf) continue;
  const api = apiUsage(sf);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineWebComponent') {
      const tagArg = node.arguments[0];
      const renderArg = node.arguments[2];
      if (tagArg && ts.isStringLiteralLike(tagArg) && renderArg) {
        byTag.set(tagArg.text, { module: basename(file), usage: kitUsage(renderArg), api });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ---- 6. classify ------------------------------------------------------------
const rows = catalog.map((el) => {
  const info = byTag.get(el.tag) ?? { module: null, usage: new Map(), api: new Map() };
  const pub = [];
  const missing = [];
  for (const [name, v] of info.usage) (isPublic(name) ? pub : missing).push({ name, ...v });

  // API-only elements (render no kit component but call kit functions).
  const pubApi = [...info.api.keys()].filter(isPublic);
  const privApi = [...info.api.entries()].filter(([n]) => !isPublic(n));

  const usesJsx = info.usage.size > 0;
  const surface = usesJsx ? pub.map((p) => p.name) : pubApi;
  const gaps = usesJsx ? missing : privApi.map(([n, v]) => ({ name: n, ...v }));

  let verdict, grade = null;
  if (gaps.length > 0) { verdict = 'GAP'; grade = surface.length ? 'PARTIAL' : 'TOTAL'; }
  else if (surface.length === 0) { verdict = 'GAP'; grade = 'TOTAL'; }
  else verdict = surface.length === 1 ? 'DIRECT' : 'COMPOSITION';

  // Proof for each missing symbol: its module, what that module DOES export
  // publicly, and whether the symbol is already a module export (in which case
  // closing the gap is one line in src/index.ts, not new code).
  const proof = gaps.map((g) => ({
    symbol: g.name,
    module: rel(g.file),
    publicFromSameModule: (publicByModule.get(g.file) ?? []).filter(isPublic).sort(),
    exportedFromOwnModule: moduleExports(g.file).has(g.name),
  }));

  const { publics, irreducible } = expandToPublic(info.usage);

  return {
    tag: el.tag,
    displayName: el.displayName,
    module: info.module,
    verdict,
    grade,
    solidSurface: surface.sort(),
    missing: gaps.map((g) => g.name).sort(),
    proof,
    // nominal signal: is there a public export named exactly like the element?
    nameMatch: isPublic(el.displayName) ? el.displayName : null,
    // cost of reproducing the element by composing public parts
    publicPiecesNeeded: publics.length,
    publicPieces: publics,
    irreducible,
  };
});

// ---- 7. reverse view --------------------------------------------------------
const renderedByCatalog = new Set();
for (const info of byTag.values()) {
  const { publics } = expandToPublic(info.usage);
  for (const n of publics) renderedByCatalog.add(n);
  for (const n of info.usage.keys()) renderedByCatalog.add(n);
  for (const n of info.api.keys()) renderedByCatalog.add(n);
}
const displayNames = new Set(catalog.map((e) => e.displayName));
const unreachable = [...publicValues]
  .filter((n) => /^[A-Z]/.test(n) && !renderedByCatalog.has(n))
  .map((n) => ({ name: n, module: rel([...publicByModule].find(([, names]) => names.includes(n))?.[0] ?? ''), nominalElement: displayNames.has(n) ? n : null }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ---- 7b. can a consumer TYPE what they compose? -----------------------------
// A documented entry needs the prop type next to the component. Scope: EVERY
// component-shaped public export — PascalCase, declared as a function whose
// first parameter is named `props`.
//
// Deliberately NOT scoped to the elements' composable set: `expandToPublic`
// stops walking at a public boundary, so the moment a coarse component (Thread,
// ChatThread) becomes public the pieces below it drop out of that set. Scoping
// the type check to it would mean improving coverage silently *shrinks* what
// gets checked. This rule only grows.
const declOf = (name, file) => {
  const sf = file && program.getSourceFile(file);
  if (!sf) return null;
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) found = n.initializer;
    else ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
};
const componentish = [];
for (const [file, names] of publicByModule) {
  for (const name of names) {
    if (!/^[A-Z]/.test(name) || !isPublic(name)) continue;
    const p0 = declOf(name, file)?.parameters?.[0];
    if (p0 && ts.isIdentifier(p0.name) && /^props?$/.test(p0.name.text)) componentish.push(name);
  }
}
componentish.sort();
const propTypes = componentish.map((name) => ({
  name, propsType: publicTypes.has(`${name}Props`) ? `${name}Props` : null,
}));
const propTypesMissing = propTypes.filter((p) => !p.propsType).map((p) => p.name);

// ---- 8. emit ----------------------------------------------------------------
const counts = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
const grades = rows.filter((r) => r.verdict === 'GAP').reduce((a, r) => ((a[r.grade] = (a[r.grade] ?? 0) + 1), a), {});
const result = {
  generatedFrom: { catalog: 'src/elements/element-meta.json', surface: ['src/index.ts (TS checker)', 'dist/index.server.js (runtime keys)'] },
  totals: {
    elements: catalog.length,
    publicValueExports: publicValues.size,
    publicTypeExports: publicTypes.size,
    runtimeKeys: runtimeExports?.size ?? null,
    DIRECT: counts.DIRECT ?? 0, COMPOSITION: counts.COMPOSITION ?? 0, GAP: counts.GAP ?? 0,
    gapTotal: grades.TOTAL ?? 0, gapPartial: grades.PARTIAL ?? 0,
  },
  rows,
  unreachableExports: unreachable,
  propTypes: { checked: propTypes.length, missing: propTypesMissing },
};

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > -1) writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(result, null, 2));

const verbose = process.argv.includes('--verbose');

console.log(`elements ${catalog.length} | public values ${publicValues.size} | public types ${publicTypes.size} | runtime keys ${runtimeExports.size}`);
console.log(`DIRECT ${result.totals.DIRECT}  COMPOSITION ${result.totals.COMPOSITION}  GAP ${result.totals.GAP} (total ${result.totals.gapTotal} / partial ${result.totals.gapPartial})\n`);

if (verbose) {
  for (const r of rows) {
    const tail = r.missing.length ? `  MISSING=[${r.missing.join(', ')}]` : '';
    console.log(`${(r.verdict + (r.grade ? `/${r.grade}` : '')).padEnd(13)} ${r.tag.padEnd(22)} pieces=${String(r.publicPiecesNeeded).padStart(2)} solid=[${r.solidSurface.join(', ')}]${tail}${r.irreducible.length ? `  IRREDUCIBLE=[${r.irreducible.join(', ')}]` : ''}`);
  }
  console.log('\n--- public exports no element reaches ---');
  for (const u of unreachable) console.log(`${u.name.padEnd(28)} ${u.module}`);
  console.log('');
}

// ---- 9. verdict -------------------------------------------------------------
const gapRows = rows.filter((r) => r.verdict === 'GAP');
let failed = false;

if (gapRows.length) {
  failed = true;
  console.error(`✗ ${gapRows.length}/${catalog.length} element(s) have no writable SolidJS equivalent:\n`);
  for (const r of gapRows) {
    console.error(`  ${r.tag} (${r.grade})`);
    if (r.solidSurface.length) console.error(`    public today : ${r.solidSurface.join(', ')}`);
    for (const p of r.proof) {
      const fix = p.exportedFromOwnModule
        ? `already exported by ${p.module} — re-export it from src/index.ts`
        : `NOT exported by ${p.module} — export it there first, then from src/index.ts`;
      console.error(`    unreachable  : ${p.symbol}  (${fix})`);
    }
  }
  console.error('');
} else {
  console.log(`✓ solid coverage: ${catalog.length}/${catalog.length} elements have a writable SolidJS equivalent.`);
}

if (propTypesMissing.length) {
  failed = true;
  console.error(`✗ ${propTypesMissing.length}/${propTypes.length} public component(s) ship no public <Name>Props type:\n`);
  for (const n of propTypesMissing) console.error(`    ${n}  -> export a \`${n}Props\` type`);
  console.error('');
} else {
  console.log(`✓ prop types: all ${propTypes.length} public components export a <Name>Props type.`);
}

if (failed) {
  console.error('A registered element must be writable in SolidJS — Solid is the authored layer, and the');
  console.error('framework docs promise the same catalog everywhere. Re-run with --verbose for the full map.');
  process.exit(1);
}
