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
//   surface  = the public SolidJS entry: `src/solid.ts` module exports resolved by
//              the TS checker, intersected with the runtime keys of the BUILT
//              dist/solid.server.js (a source export that does not survive the
//              build is not public)
//
// NOTE ON WHICH ENTRY IS CHECKED. This used to inspect the ROOT entry
// (src/index.ts / dist/index.server.js). It does not any more, because full Solid
// coverage no longer lives there: carrying it on "." cost every React/Vue/Svelte/
// vanilla consumer +113,672 bytes (+19.2%) for components they cannot render, so
// the complete Solid surface moved to `@kitn.ai/ui/solid` as its own build target.
// This guard follows the surface — checking "." now would assert almost nothing,
// which is the failure mode where a green check covers no ground.
//
// src/solid.ts is `export * from './index'` plus the Solid-only additions, so it
// is a compiler-guaranteed superset of the root entry. Step 3b re-asserts that on
// the BUILT artifacts, so a build-config change cannot quietly break it.
//   usage    = the Solid components each facade actually renders, resolved
//              JSX-tag -> declaring module by the checker, recursing through
//              element-local helper components
//
// Verdict rule (deliberately sharp):
//   DIRECT       every Solid component the element renders is public, and it is one
//   COMPOSITION  every Solid component the element renders is public, and it is 2+
//   DECLARED     the facade renders/calls nothing kit-derived, but carries a
//                reviewed `solid-coverage: equivalent` directive naming a PUBLIC
//                Solid component that is the same contract by a different
//                mechanism (see below)
//   GAP          the element renders at least one Solid component that is NOT
//                reachable from the public entry (grade PARTIAL), or renders /
//                calls nothing public at all (grade TOTAL)
//
// THE DIRECTIVE. Some facades are deliberately mechanism-split from their Solid
// twin: `<kai-view>` is a bare slot the enclosing stack drives through a
// MutationObserver over light-DOM children, while the Solid `View` coordinates
// through context — same contract, no shared render path, so no derivation can
// connect them. For exactly that shape the facade may declare its equivalent at
// its own definition site (the same parsed-directive-not-prose policy as
// `lint-silent-drops`):
//
//   // solid-coverage: equivalent <Component> -- <reason>
//
// This is NOT an exemption: the named component must be public (source entry AND
// the runtime keys of the built dist/solid.server.js) or the element stays a GAP
// and the directive is flagged; a directive on an element that is not a TOTAL
// gap is STALE and fails the build, so entries cannot accumulate past their
// usefulness; a directive without a reason is malformed and fails. There is
// still no central mapping table — the declaration lives next to the facade it
// describes, one per defect, each carrying its own justification.
//
// Each GAP row carries its own proof: the missing symbol, its declaring module,
// and every public export that module does or does not provide.
//
// Usage:  node scripts/verify-solid-coverage.mjs [--json out.json]
//         Needs `nx build ui` first — the surface is cross-checked against the
//         runtime keys of the BUILT dist/solid.server.js, and a missing build is
//         a hard error, not a silently-skipped check.

import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

// ---- the package root: ADDRESSED, not searched for --------------------------
//
// This script lives at <package>/scripts/, so the package root is one level up and
// is known exactly. It used to CLIMB — start at process.cwd() and walk parents
// (unbounded, to the filesystem root) taking the first directory holding
// src/elements/element-meta.json — which made the answer depend on where you
// happened to be standing, and let a run bind to a different checkout than the one
// you were editing. Same defect class as the manifest walk-up in
// mcp/mcp/manifest.ts, which was measured escaping an agent worktree
// and verifying a six-week-old artifact from another tree while reporting success.
//
// A verifier that cannot say WHICH tree it verified is not a verifier. Deriving from
// import.meta.url also makes the script cwd-independent, which the climb never was,
// and matches every other verify-*.mjs / gen-*.mjs in this directory.
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const SELF_TEST = argv.includes('--self-test');
const PKG_ROOT = resolve(argOf('--package-root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));

/**
 * The whole analysis over ONE package root. Returns the model rather than
 * printing or exiting, so `--self-test` can drive the SAME code path over
 * synthesized packages — see the cases at the bottom of this file.
 *
 * Why that matters here specifically: every verdict below comes out of the TS
 * checker resolving real symbols. If the resolution ever silently stops working —
 * a moved directory, a changed tsconfig, an entry that no longer re-exports — the
 * honest result and the broken result look alike from the outside. GAP counts
 * would move, but this guard's PASS message would not.
 */
async function analyzeSolidCoverage(pkgRoot) {
if (!existsSync(resolve(pkgRoot, 'src/elements/element-meta.json'))) {
  return {
    fatal:
      `[verify:solid-coverage] Expected the element catalog at ` +
      `${resolve(pkgRoot, 'src/elements/element-meta.json')} and it is not there.\n` +
      `Package root resolved from this script's own location: ${pkgRoot}\n` +
      `element-meta.json is generated by the build — run \`nx build ui\`. This does ` +
      `NOT search parent directories: verifying another checkout's catalog would be ` +
      `worse than failing.`,
  };
}
const srcDir = resolve(pkgRoot, 'src');
const elementsDir = resolve(srcDir, 'elements');
const rel = (f) => (f && f.startsWith(pkgRoot) ? relative(pkgRoot, f) : f);

// ---- 1. the catalog ---------------------------------------------------------
const catalog = JSON.parse(readFileSync(resolve(elementsDir, 'element-meta.json'), 'utf8'));
// VACUITY. Every row below is derived from this list, so an empty one produces no
// rows, no gaps, and the cheerful "✓ solid coverage: 0/0 elements have a writable
// SolidJS equivalent" — a sentence that is true of a package with no elements at
// all. The catalog is generated, so an empty one means the generator broke, not
// that the kit shipped nothing.
if (!Array.isArray(catalog) || catalog.length === 0) {
  return {
    fatal:
      'verify-solid-coverage: EMPTY CATALOG — src/elements/element-meta.json lists no elements.\n' +
      '  Every verdict this guard reaches is per element, so it would report 0/0 covered\n' +
      '  and exit 0 having checked nothing. Regenerate it: `npm run build:api`.',
  };
}

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
// The COMPLETE Solid surface lives on `@kitn.ai/ui/solid`, not on "." — see the
// header. `src/solid.ts` re-exports `src/index.ts`, so checking it covers both.
const entryPath = resolve(srcDir, 'solid.ts');
const rootEntryPath = resolve(srcDir, 'index.ts');
const program = ts.createProgram([...facadeFiles, entryPath, rootEntryPath], { ...tsconfig.options, noEmit: true });
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
const builtEntry = resolve(pkgRoot, 'dist/solid.server.js');
if (!existsSync(builtEntry)) {
  return {
    fatal:
      'verify-solid-coverage: dist/solid.server.js is missing — run `nx build ui` first.\n' +
      '  (the public surface is cross-checked against the BUILT entry; without it this check proves nothing)',
  };
}
const runtimeExports = new Set(
  Object.keys(await import(pathToFileURL(builtEntry).href)).filter((k) => k !== 'default'),
);
const isPublic = (name) => publicValues.has(name) && runtimeExports.has(name);

// ---- 3b. ./solid must remain a SUPERSET of "." ------------------------------
// src/solid.ts is `export * from './index'` + additions, so TypeScript already
// guarantees this at source level. Re-asserting it on the BUILT artifacts is the
// part that can actually rot: a rollup/externals/config change could drop
// re-exported bindings from dist/solid.js while the source still looks right,
// and a Solid consumer — told to import ONLY from `@kitn.ai/ui/solid` — would
// silently lose access to half the kit.
const builtRootEntry = resolve(pkgRoot, 'dist/index.server.js');
if (!existsSync(builtRootEntry)) {
  return { fatal: 'verify-solid-coverage: dist/index.server.js is missing — run `nx build ui` first.' };
}
const rootRuntimeExports = new Set(
  Object.keys(await import(pathToFileURL(builtRootEntry).href)).filter((k) => k !== 'default'),
);
const notInSolid = [...rootRuntimeExports].filter((k) => !runtimeExports.has(k)).sort();

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
// Most facades pass an inline arrow as the render argument, so the JSX is right
// there in the call. A few hoist it into a named function and pass the reference
// (`defineWebComponent('kai-audio-visualizer', {...}, AudioVisualizerFacade)`).
// Walking only the argument expression finds no JSX in that shape and reports the
// element as having NO Solid surface at all -- a false GAP, which is worse than a
// miss: it would push someone to "fix" an element that is already fine, or to
// weaken this check. Resolve an identifier to its declaration in the same file
// and walk that instead.
function renderNodeFor(sf, renderArg) {
  if (!ts.isIdentifier(renderArg)) return renderArg;
  let found = null;
  const seek = (node) => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === renderArg.text) found = node;
    else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === renderArg.text && node.initializer) found = node.initializer;
    ts.forEachChild(node, seek);
  };
  seek(sf);
  return found ?? renderArg;
}

// The `solid-coverage: equivalent` directive (header: THE DIRECTIVE). Parsed,
// not prose — a comment that does not parse is a build failure, not a shrug.
// One per facade module; it attaches to the element(s) that module defines.
function parseEquivalentDirective(sf, module, problems) {
  const m = sf.getFullText().match(/\/\/\s*solid-coverage:\s*equivalent\b([^\n]*)/);
  if (!m) return null;
  const mm = m[1].trim().match(/^([A-Za-z_$][\w$]*)\s+--\s+(\S.*)$/);
  if (!mm) {
    problems.push(
      `SOLID-EQUIVALENT MALFORMED: ${module} — write "// solid-coverage: equivalent <Component> -- <reason>" (the reason is mandatory)`,
    );
    return null;
  }
  return { component: mm[1], reason: mm[2].trim() };
}

const directiveProblems = [];
const byTag = new Map();
for (const file of facadeFiles) {
  const sf = program.getSourceFile(file);
  if (!sf) continue;
  const api = apiUsage(sf);
  const declared = parseEquivalentDirective(sf, rel(file), directiveProblems);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineWebComponent') {
      const tagArg = node.arguments[0];
      const renderArg = node.arguments[2];
      if (tagArg && ts.isStringLiteralLike(tagArg) && renderArg) {
        byTag.set(tagArg.text, { module: basename(file), usage: kitUsage(renderNodeFor(sf, renderArg)), api, declared });
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

  // A reviewed directive can turn ONLY a TOTAL gap into DECLARED, and only by
  // naming a component that is actually public. Anything else it could say is a
  // build failure — see THE DIRECTIVE in the header.
  let declaredEquivalent = null;
  const d = info.declared;
  if (d) {
    if (verdict === 'GAP' && grade === 'TOTAL') {
      if (isPublic(d.component)) {
        verdict = 'DECLARED';
        grade = null;
        declaredEquivalent = d;
        surface.push(d.component);
      } else {
        directiveProblems.push(
          `SOLID-EQUIVALENT NOT PUBLIC: ${el.tag} declares ${d.component}, but \`@kitn.ai/ui/solid\` does not export it ` +
            `(source entry + built dist/solid.server.js are both required) — export it, or the element stays a GAP`,
        );
      }
    } else {
      directiveProblems.push(
        `SOLID-EQUIVALENT STALE: ${el.tag} declares ${d.component} but is ${verdict}${grade ? `/${grade}` : ''}, ` +
          `not a TOTAL gap — the directive no longer earns its place, delete it`,
      );
    }
  }

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
    declaredEquivalent,
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
  generatedFrom: { catalog: 'src/elements/element-meta.json', surface: ['src/solid.ts (TS checker)', 'dist/solid.server.js (runtime keys)'] },
  totals: {
    elements: catalog.length,
    publicValueExports: publicValues.size,
    publicTypeExports: publicTypes.size,
    runtimeKeys: runtimeExports?.size ?? null,
    DIRECT: counts.DIRECT ?? 0, COMPOSITION: counts.COMPOSITION ?? 0, DECLARED: counts.DECLARED ?? 0, GAP: counts.GAP ?? 0,
    gapTotal: grades.TOTAL ?? 0, gapPartial: grades.PARTIAL ?? 0,
  },
  rows,
  unreachableExports: unreachable,
  propTypes: { checked: propTypes.length, missing: propTypesMissing },
};

  return { result, rows, unreachable, propTypes, propTypesMissing, notInSolid, directiveProblems, catalog, publicValues, publicTypes, runtimeExports, rootRuntimeExports };
}

// ---------------------------------------------------------------------------
// self-test: synthesized packages with real .tsx facades, a real src/solid.ts and
// real built entries, driven through the SAME analyzer. Every verdict here comes
// out of the TS checker resolving symbols, and a resolution that silently stopped
// working would look like a clean report rather than a broken one.
// ---------------------------------------------------------------------------
const FIXTURE_TSCONFIG = {
  compilerOptions: {
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'preserve',
    skipLibCheck: true,
    noEmit: true,
    allowJs: true,
  },
  include: ['src'],
};

/** The healthy fixture: one element rendering one public Solid component. */
const fixtureFiles = (over = {}) => ({
  'tsconfig.json': JSON.stringify(FIXTURE_TSCONFIG, null, 2),
  'src/components/foo.tsx':
    'export type FooProps = { a?: string };\nexport function Foo(props: FooProps) { return <div>{props.a}</div>; }\n',
  'src/elements/define.tsx':
    'export function defineWebComponent(tag: string, props: unknown, render: unknown) { return { tag, props, render }; }\n',
  'src/elements/x.tsx':
    "import { defineWebComponent } from './define';\nimport { Foo } from '../components/foo';\ndefineWebComponent('kai-x', {}, () => <Foo a=\"hi\" />);\n",
  'src/elements/element-meta.json': JSON.stringify([{ tag: 'kai-x', displayName: 'X' }], null, 2),
  'src/index.ts': 'export const version = "1";\n',
  'src/solid.ts':
    "export * from './index';\nexport { Foo } from './components/foo';\nexport type { FooProps } from './components/foo';\n",
  'dist/solid.server.js': 'export const version = "1";\nexport const Foo = () => null;\n',
  'dist/index.server.js': 'export const version = "1";\n',
  ...over,
});

function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'verify-solid-coverage-selftest-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = resolve(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/**
 * THE verdict — one definition, used by the real run below AND by the self-test.
 * Deliberately not restated in the self-test: a self-test that scored a fixture
 * against its own copy of the rules would pass while the shipped rules said
 * something else, which is the failure mode this whole exercise exists to end.
 */
function failureReasons(a) {
  if (a.fatal) return [a.fatal];
  const reasons = [];
  for (const r of a.rows.filter((row) => row.verdict === 'GAP')) {
    reasons.push(`GAP ${r.tag} (${r.grade}) missing=[${r.missing.join(', ')}]`);
  }
  for (const p of a.directiveProblems ?? []) reasons.push(p);
  for (const n of a.notInSolid) reasons.push(`MISSING FROM ./solid: ${n}`);
  for (const n of a.propTypesMissing) reasons.push(`NO PROPS TYPE: ${n}`);
  return reasons;
}

const SELF_TEST_CASES = [
  {
    name: 'a healthy package: the element renders a public Solid component (DIRECT)',
    files: fixtureFiles(),
    expect: [],
    check: (v) => (v.rows?.[0]?.verdict === 'DIRECT' ? null : `expected a DIRECT row, got ${v.rows?.[0]?.verdict}`),
  },
  {
    name: 'GAP: the element renders a component ./solid does not export',
    files: fixtureFiles({
      'src/solid.ts': "export * from './index';\n",
      'dist/solid.server.js': 'export const version = "1";\n',
    }),
    expect: ['GAP kai-x', 'missing=[Foo]'],
  },
  {
    name: 'GAP: exported from source but absent from the BUILT entry',
    // The runtime cross-check is the load-bearing half: a source export that does
    // not survive the build is not public, however good src/solid.ts looks.
    files: fixtureFiles({ 'dist/solid.server.js': 'export const version = "1";\n' }),
    expect: ['GAP kai-x', 'missing=[Foo]'],
  },
  {
    name: 'SUPERSET: an export reachable from "." but missing from ./solid',
    files: fixtureFiles({
      'dist/index.server.js': 'export const version = "1";\nexport const OnlyInRoot = () => null;\n',
    }),
    expect: ['MISSING FROM ./solid: OnlyInRoot'],
  },
  {
    name: 'PROPS TYPE: a public component with no public <Name>Props',
    files: fixtureFiles({
      'src/components/foo.tsx': 'export function Foo(props: { a?: string }) { return <div>{props.a}</div>; }\n',
      'src/solid.ts': "export * from './index';\nexport { Foo } from './components/foo';\n",
    }),
    expect: ['NO PROPS TYPE: Foo'],
  },
  // ---- the `solid-coverage: equivalent` directive -------------------------
  // A slot-only facade (renders no kit component, calls no kit function) plus a
  // catalog carrying it. The four cases below prove the directive can rescue
  // EXACTLY that shape and nothing else: without it the element is a TOTAL gap,
  // with it naming a public component it is DECLARED, and every other thing the
  // directive could say — a non-public component, a stale site, a missing
  // reason — fails the build.
  {
    name: 'DIRECTIVE baseline: a slot-only facade with no directive is a TOTAL gap',
    files: fixtureFiles({
      'src/elements/y.tsx':
        "import { defineWebComponent } from './define';\ndefineWebComponent('kai-y', {}, () => <div><slot /></div>);\n",
      'src/elements/element-meta.json': JSON.stringify(
        [{ tag: 'kai-x', displayName: 'X' }, { tag: 'kai-y', displayName: 'Y' }], null, 2),
    }),
    expect: ['GAP kai-y (TOTAL)'],
  },
  {
    name: 'DIRECTIVE: a reviewed equivalent naming a PUBLIC component makes it DECLARED',
    files: fixtureFiles({
      'src/elements/y.tsx':
        "import { defineWebComponent } from './define';\n// solid-coverage: equivalent Foo -- same contract, different mechanism\ndefineWebComponent('kai-y', {}, () => <div><slot /></div>);\n",
      'src/elements/element-meta.json': JSON.stringify(
        [{ tag: 'kai-x', displayName: 'X' }, { tag: 'kai-y', displayName: 'Y' }], null, 2),
    }),
    expect: [],
    check: (v) => {
      const row = v.rows?.find((r) => r.tag === 'kai-y');
      return row?.verdict === 'DECLARED' && row?.solidSurface?.includes('Foo')
        ? null
        : `expected kai-y DECLARED with surface [Foo], got ${row?.verdict} [${row?.solidSurface}]`;
    },
  },
  {
    name: 'DIRECTIVE is not an exemption: naming a component ./solid does not export still fails',
    files: fixtureFiles({
      'src/elements/y.tsx':
        "import { defineWebComponent } from './define';\n// solid-coverage: equivalent Bar -- wishful thinking\ndefineWebComponent('kai-y', {}, () => <div><slot /></div>);\n",
      'src/elements/element-meta.json': JSON.stringify(
        [{ tag: 'kai-x', displayName: 'X' }, { tag: 'kai-y', displayName: 'Y' }], null, 2),
    }),
    expect: ['GAP kai-y (TOTAL)', 'SOLID-EQUIVALENT NOT PUBLIC: kai-y declares Bar'],
  },
  {
    name: 'DIRECTIVE on an element that is not a TOTAL gap is STALE and fails',
    files: fixtureFiles({
      'src/elements/x.tsx':
        "import { defineWebComponent } from './define';\nimport { Foo } from '../components/foo';\n// solid-coverage: equivalent Foo -- already renders it, this directive is dead weight\ndefineWebComponent('kai-x', {}, () => <Foo a=\"hi\" />);\n",
    }),
    expect: ['SOLID-EQUIVALENT STALE: kai-x declares Foo'],
  },
  {
    name: 'DIRECTIVE without a reason is MALFORMED and fails',
    files: fixtureFiles({
      'src/elements/y.tsx':
        "import { defineWebComponent } from './define';\n// solid-coverage: equivalent Foo\ndefineWebComponent('kai-y', {}, () => <div><slot /></div>);\n",
      'src/elements/element-meta.json': JSON.stringify(
        [{ tag: 'kai-x', displayName: 'X' }, { tag: 'kai-y', displayName: 'Y' }], null, 2),
    }),
    expect: ['SOLID-EQUIVALENT MALFORMED'],
  },
  {
    name: 'VACUITY: an empty catalog is not 0/0 success',
    files: fixtureFiles({ 'src/elements/element-meta.json': '[]' }),
    expect: ['EMPTY CATALOG'],
  },
  {
    name: 'no built entry to cross-check against',
    files: fixtureFiles({ 'dist/solid.server.js': null }),
    expect: ['dist/solid.server.js is missing'],
  },
  {
    name: 'no element catalog at all',
    files: fixtureFiles({ 'src/elements/element-meta.json': null }),
    expect: ['Expected the element catalog at'],
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const analysis = await analyzeSolidCoverage(writeFixture(c.files));
    const reasons = failureReasons(analysis);
    const v = { text: reasons.join('\n'), failed: reasons.length > 0, rows: analysis.rows };
    const missingExpected = c.expect.filter((s) => !v.text.includes(s));
    const cleanMismatch = c.expect.length === 0 && v.failed;
    const extra = c.check ? c.check(v) : null;
    const ok = missingExpected.length === 0 && !cleanMismatch && !extra;
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect.length === 0 ? 'clean' : c.expect.map((s) => `"${s}"`).join(' + ')}, got ${v.failed ? v.text.split('\n')[0] : 'clean'})`,
    );
    if (missingExpected.length > 0) console.log(`    missing: ${missingExpected.map((s) => `"${s}"`).join(', ')}`);
    if (cleanMismatch) console.log(`    unexpected: ${v.text.split('\n')[0]}`);
    if (extra) console.log(`    ${extra}`);
  }
  if (failed > 0) {
    console.error(`\n✗ verify-solid-coverage self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify-solid-coverage self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const analysis = await analyzeSolidCoverage(PKG_ROOT);
if (analysis.fatal) {
  console.error(analysis.fatal);
  process.exit(1);
}
const { result, rows, unreachable, propTypes, propTypesMissing, notInSolid, directiveProblems, catalog, publicValues, publicTypes, runtimeExports, rootRuntimeExports } = analysis;

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > -1) writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(result, null, 2));

const verbose = process.argv.includes('--verbose');

console.log(`elements ${catalog.length} | public values ${publicValues.size} | public types ${publicTypes.size} | runtime keys ${runtimeExports.size}`);
console.log(`DIRECT ${result.totals.DIRECT}  COMPOSITION ${result.totals.COMPOSITION}  DECLARED ${result.totals.DECLARED}  GAP ${result.totals.GAP} (total ${result.totals.gapTotal} / partial ${result.totals.gapPartial})\n`);

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
// `failureReasons` above is what DECIDES; everything printed below explains that
// decision in more detail. Keeping the decision in one function is what lets the
// self-test score fixtures against the shipped rules rather than a copy of them.
const gapRows = rows.filter((r) => r.verdict === 'GAP');
const failed = failureReasons(analysis).length > 0;

if (gapRows.length) {
  // decided by failureReasons above
  console.error(`✗ ${gapRows.length}/${catalog.length} element(s) have no writable SolidJS equivalent:\n`);
  for (const r of gapRows) {
    console.error(`  ${r.tag} (${r.grade})`);
    if (r.solidSurface.length) console.error(`    public today : ${r.solidSurface.join(', ')}`);
    for (const p of r.proof) {
      const fix = p.exportedFromOwnModule
        ? `already exported by ${p.module} — re-export it from src/solid.ts`
        : `NOT exported by ${p.module} — export it there first, then from src/solid.ts`;
      console.error(`    unreachable  : ${p.symbol}  (${fix})`);
    }
  }
  console.error('');
} else {
  console.log(`✓ solid coverage: ${catalog.length}/${catalog.length} elements have a writable SolidJS equivalent.`);
}

if (directiveProblems.length) {
  // decided by failureReasons above
  console.error(`✗ ${directiveProblems.length} \`solid-coverage: equivalent\` directive problem(s):\n`);
  for (const p of directiveProblems) console.error(`    ${p}`);
  console.error('');
}

if (notInSolid.length) {
  // decided by failureReasons above
  console.error(`✗ ${notInSolid.length} export(s) reachable from "." are MISSING from ./solid:\n`);
  for (const n of notInSolid) console.error(`    ${n}`);
  console.error('\n  ./solid must be a superset of "." — Solid consumers are told to import only from it.\n');
} else {
  console.log(`✓ superset: all ${rootRuntimeExports.size} runtime exports of "." are reachable from ./solid.`);
}

if (propTypesMissing.length) {
  // decided by failureReasons above
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
