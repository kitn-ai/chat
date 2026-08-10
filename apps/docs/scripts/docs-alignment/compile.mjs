// Compile doc snippets against the SHIPPED types.
//
// THE PROBLEM
// -----------
// Doc snippets are fragments. They call the reader's own code
// (`streamFromYourAPI`, `handleSubmit`, `conversations()`), they omit imports,
// and they import packages this repo does not install (`ai`, `next/dynamic`). A
// harness that compiles them naively drowns in false positives, gets switched
// off, and catches nothing. A harness that suppresses errors broadly catches
// nothing either, more quietly.
//
// THE LINE THIS FILE HOLDS
// ------------------------
//   · A name the snippet never declared and never imported is the READER's.
//     It becomes `any`. It must not fail.
//   · A module the snippet imports that is not the kit is the READER's or a
//     third party's. It becomes a shorthand ambient module (`any`). It must not
//     fail.
//   · `@kitn.ai/ui` and every subpath of it are NEVER shimmed and NEVER stubbed.
//     An unresolved kit entry point, a missing exported member, or a bad prop on
//     a kit component fails, always.
//
// HOW UNKNOWNS ARE FOUND
// ----------------------
// Not by walking the AST for free identifiers — by asking the compiler. Compile,
// collect TS2304/TS2552 ("Cannot find name 'X'"), declare those names, compile
// again, repeat until it settles. The compiler's own scope analysis is the
// authority on what is undeclared, which is exactly the question being asked.
//
// Two refinements that matter:
//   · Stubs go on ONE prepended line, inside a module (every snippet gets
//     `export {}`), so they are module-scoped rather than global — snippet A's
//     unknown cannot silently resolve snippet B's — and every reported line
//     number is off by exactly one, which is subtracted back out.
//   · If the unknown name IS a kit export and the snippet already imports from
//     the kit, the real import is injected instead of an `any` stub. A fragment
//     that lists `Message` in its imports and then uses `MessageContent` without
//     it still gets its props type-checked. Every injection is recorded on the
//     block so the report can be audited.
//
// WHAT IS REPORTED
// ----------------
// Diagnostics are split by ORIGIN, not by code. `kitOrigin()` asks the checker
// where the offending type was declared; anything declared under packages/ui is
// KIT drift and gates. Everything else is advisory. Untyped `js` / inline
// `<script>` snippets report KIT findings ONLY — `document.getElementById('x').messages = …`
// is correct at run time and flagging it would be the noise that gets a harness
// turned off.
import { mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const pkgDir = (name) => {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
};

/** Packages symlinked into the harness. A missing one would surface as dozens of
 *  TS2307 that read like a docs defect, so it is a hard failure instead. */
const REQUIRED = ['react', 'react-dom', '@types/react', '@types/react-dom', 'solid-js'];
const OPTIONAL = ['vue', 'svelte'];

const BASE = {
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  allowJs: false,
  types: [],
};

export const PROJECTS = {
  // Strict, JSX checked against React.
  react: { options: { ...BASE, strict: true, jsx: ts.JsxEmit.ReactJSX } },
  // Strict, JSX checked against Solid. `preserve` only changes emit; props are
  // still checked, which is the whole point.
  solid: { options: { ...BASE, strict: true, jsx: ts.JsxEmit.Preserve, jsxImportSource: 'solid-js' } },
  // Untyped JS and lifted <script> bodies. KIT-origin findings only.
  loose: { options: { ...BASE, strict: false, noImplicitAny: false, jsx: ts.JsxEmit.ReactJSX } },
};

// The shadow pass (see shadow.mjs) recompiles a rewritten copy of a snippet, so
// it needs its own directory per project — same options, separate program.
for (const name of ['react', 'solid', 'loose']) {
  PROJECTS[`shadow-${name}`] = { options: PROJECTS[name].options, shadowOf: name };
}

export function createWorkspace(uiRoot) {
  const tmp = join(
    process.env.TMPDIR || '/tmp',
    `kai-docs-align-${process.pid}-${Date.now().toString(36)}`,
  );
  const nm = join(tmp, 'node_modules');
  mkdirSync(join(nm, '@kitn.ai'), { recursive: true });
  mkdirSync(join(nm, '@types'), { recursive: true });
  symlinkSync(uiRoot, join(nm, '@kitn.ai/ui'), 'dir');
  for (const p of REQUIRED) {
    const src = pkgDir(p);
    if (!src) throw new Error(`'${p}' is not installed. Run \`pnpm install\` at the repo root.`);
    symlinkSync(src, join(nm, p), 'dir');
  }
  for (const p of OPTIONAL) {
    const src = pkgDir(p);
    if (src) symlinkSync(src, join(nm, p), 'dir');
  }
  for (const name of Object.keys(PROJECTS)) mkdirSync(join(tmp, name), { recursive: true });
  return {
    tmp,
    dir: (project) => join(tmp, project),
    cleanup: (keep) => {
      if (keep) return tmp;
      rmSync(tmp, { recursive: true, force: true });
      return null;
    },
    /** Can this bare specifier resolve for real from inside the harness? */
    canResolve(spec) {
      try {
        createRequire(join(tmp, 'probe.js')).resolve(spec);
        return true;
      } catch {
        // Type-only or exports-map-restricted packages: fall back to TS's own
        // resolver before deciding a package is absent.
        const r = ts.resolveModuleName(spec, join(tmp, 'probe.ts'), BASE, ts.sys);
        return Boolean(r.resolvedModule);
      }
    },
  };
}

/** Bare package specifier of an import/export-from, or null for relative ones. */
export function bareSpecifiers(code) {
  const out = new Set();
  const re = /(?:^|[\s;}])(?:import|export)\s*(?:[\s\S]*?from\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(code))) {
    const spec = m[1] || m[2] || m[3];
    if (!spec || spec.startsWith('.') || spec.startsWith('/')) continue;
    out.add(spec);
  }
  return out;
}

const isKit = (s) => s === '@kitn.ai/ui' || s.startsWith('@kitn.ai/ui/');

/**
 * Shorthand ambient modules for every third-party specifier the docs import
 * that this repo does not install. `declare module 'x';` makes every import from
 * it `any` — which is right: those packages are the reader's problem, not the
 * kit's. Kit specifiers are excluded by a hard guard; shimming one would turn
 * this whole harness into theatre.
 */
export function writeShims(workspace, project, specifiers) {
  const unresolved = [];
  for (const spec of specifiers) {
    if (isKit(spec)) continue;
    if (workspace.canResolve(spec)) continue;
    unresolved.push(spec);
  }
  const body = [
    '// Third-party / reader-owned packages this repo does not install. Shorthand',
    '// ambient modules: every import from them is `any`. NEVER used for @kitn.ai/ui.',
    ...unresolved.sort().map((s) => `declare module '${s}';`),
    "declare module '*.css';",
    "declare module '*.svg';",
    '',
  ].join('\n');
  writeFileSync(join(workspace.dir(project), '__shims.d.ts'), body);
  return unresolved;
}

/** Deepest node covering `pos`. */
function nodeAt(sf, pos) {
  let found = null;
  (function visit(n) {
    if (n.getStart(sf) <= pos && pos < n.getEnd()) {
      found = n;
      n.forEachChild(visit);
    }
  })(sf);
  return found;
}

function declFiles(type, checker) {
  const syms = [type?.getSymbol?.(), type?.aliasSymbol].filter(Boolean);
  const files = [];
  for (const s of syms) for (const d of s.getDeclarations?.() ?? []) files.push(d.getSourceFile().fileName);
  return files;
}

/**
 * Did this diagnostic come from a KIT type?
 *
 * Asked of the checker, not of the message string: for `Property 'text' does not
 * exist on type 'MessagePart'` it resolves the RECEIVER's type and reports which
 * file declared it. That is what makes "unknown prop on a kit component" separable
 * from "unknown prop on the reader's own object".
 */
/**
 * Is this "children is missing" error really a deliberate elision?
 *
 * Docs write `<ChatConfig …>{/* your components *\/}</ChatConfig>`. A JSX
 * comment is a JsxExpression with no expression, so `children` types as
 * `undefined` and a required-children prop errors — on a snippet that is doing
 * exactly what a doc should. A genuinely self-closing `<PromptInputActions />`
 * has no children node at all and is NOT excused.
 */
function isPlaceholderChildren(diag) {
  if (!/Property 'children' is missing/.test(ts.flattenDiagnosticMessageText(diag.messageText, ' '))) return false;
  if (!diag.file || typeof diag.start !== 'number') return false;
  let node = nodeAt(diag.file, diag.start);
  while (node && !ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) node = node.parent;
  if (!node || !ts.isJsxElement(node)) return false;
  const meaningful = node.children.filter((c) => {
    if (ts.isJsxText(c)) return c.getText().trim().length > 0;
    if (ts.isJsxExpression(c)) return Boolean(c.expression);
    return true;
  });
  return meaningful.length === 0;
}

export function kitOrigin(diag, program, checker, uiRoot, surface) {
  const text = ts.flattenDiagnosticMessageText(diag.messageText, ' ');

  // Shape-of-the-fragment errors, not API drift. TS2657 fires on doc blocks that
  // list several sibling elements to show usage; the kit is incidental.
  if (diag.code === 2657) return null;
  if (isPlaceholderChildren(diag)) return null;

  // Import-level drift is unambiguous and does not need the checker.
  if (/@kitn\.ai\/ui/.test(text)) {
    if ([2307, 2305, 2724, 2614, 2306, 2694].includes(diag.code)) return 'import';
  }
  if (diag.relatedInformation?.some((r) => r.file?.fileName.startsWith(uiRoot))) return 'type';

  if (diag.file && typeof diag.start === 'number') {
    const node = nodeAt(diag.file, diag.start);
    if (node) {
      const candidates = [];
      const parent = node.parent;
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) candidates.push(parent.expression);
      // An argument rejected by a call: the type that rejected it belongs to the
      // CALLEE, not to the argument. Without this, `classifyTool(42)` reported
      // `number` — declared in lib.es5.d.ts — and read as "not the kit's fault".
      else if (parent && (ts.isCallExpression(parent) || ts.isNewExpression(parent))) candidates.push(parent.expression);
      else if (parent && ts.isJsxAttribute(parent)) {
        const tag = parent.parent?.parent;
        if (tag && (ts.isJsxSelfClosingElement(tag) || ts.isJsxOpeningElement(tag))) candidates.push(tag.tagName);
      } else if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) candidates.push(node.tagName);
      else candidates.push(node);

      for (const c of candidates) {
        try {
          const files = declFiles(checker.getTypeAtLocation(c), checker);
          const sym = checker.getSymbolAtLocation(c);
          for (const d of sym?.getDeclarations?.() ?? []) files.push(d.getSourceFile().fileName);
          if (files.some((f) => f.startsWith(uiRoot))) return 'type';
        } catch {
          /* checker can throw on synthetic nodes; fall through */
        }
      }
    }
  }

  // Last resort: the message names a type the kit exports. Weaker than the
  // checker, but catches diagnostics whose node walk lands somewhere unhelpful.
  for (const m of text.matchAll(/'([A-Za-z_$][\w$]*)'/g)) {
    if (surface.byName.has(m[1]) && /^[A-Z]/.test(m[1])) return 'name';
  }
  return null;
}

/**
 * Compile one project's files, resolving unknown names to `any` until it
 * settles. Mutates `units` in place with `.prelude` / `.injectedImports`.
 */
export function compileProject({ workspace, project, units, surface, uiRoot, maxRounds = 5 }) {
  const dir = workspace.dir(project);
  const options = PROJECTS[project].options;
  const rootEntry = surface.entries.get('@kitn.ai/ui') ?? new Map();

  for (const u of units) {
    u.injectedImports = u.injectedImports ?? [];
    u.stubs = u.stubs ?? new Set();
    // Built BEFORE the first round, not after it: the shadow pass supplies its
    // substituted import through `extraPrelude`, and a first round without it
    // resolved the name to `any` and then collided with the real import on the
    // next round (TS2440) — which read like a docs defect and was a harness bug.
    u.prelude = buildPrelude(u);
  }

  let program = null;
  for (let round = 0; round < maxRounds; round++) {
    for (const u of units) writeFileSync(u.path, u.prelude ? `${u.prelude}\n${u.code}` : u.code);
    program = ts.createProgram(
      [...units.map((u) => u.path), join(dir, '__shims.d.ts')],
      options,
      undefined,
      program,
    );
    const checker = program.getTypeChecker();

    let added = 0;
    for (const u of units) {
      const sf = program.getSourceFile(u.path);
      if (!sf) continue;
      const diags = [...program.getSemanticDiagnostics(sf), ...program.getSyntacticDiagnostics(sf)];
      u.diagnostics = diags;
      for (const d of diags) {
        if (d.code !== 2304 && d.code !== 2552 && d.code !== 2593) continue;
        const text = ts.flattenDiagnosticMessageText(d.messageText, ' ');
        const m = /^Cannot find name '([^']+)'/.exec(text);
        if (!m) continue;
        const name = m[1];
        if (u.stubs.has(name)) continue;
        u.stubs.add(name);
        added++;
        // A kit export named in a snippet that already imports from the kit is
        // an omitted import, not the reader's code. Import it for real so its
        // props stay under type-check.
        if (u.importsKit && rootEntry.has(name)) u.injectedImports.push(name);
      }
      u.prelude = buildPrelude(u);
    }
    if (!added) break;
  }

  // Final classification pass.
  const checker = program.getTypeChecker();
  for (const u of units) {
    const sf = program.getSourceFile(u.path);
    const diags = u.diagnostics ?? [];
    u.findings = [];
    for (const d of diags) {
      if (d.code === 2304 || d.code === 2552 || d.code === 2593) continue; // resolved to `any` by design
      const line = d.file ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      const origin = kitOrigin(d, program, checker, uiRoot, surface);
      u.findings.push({
        code: d.code,
        // The prelude is exactly one line; subtract it so line numbers point at
        // the doc's own code.
        line: Math.max(1, line - (u.prelude ? 1 : 0)),
        message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
        category: d.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
        syntactic: d.code >= 1000 && d.code < 2000,
        origin,
      });
    }
    void sf;
  }
  return program;
}

/**
 * Docs show fragments that are not whole programs: a bare type shape
 * (`{ type: 'reasoning'; text: string }`), or a class method lifted out of its
 * class (Angular's `onResize(e: Event) { … }`). Neither parses as a module, and
 * reporting them as syntax errors is reporting the docs for using a normal
 * documentation convention.
 *
 * So: try each interpretation and keep the first one that PARSES. Every opener
 * is one line and goes on the prelude line, which is already subtracted from
 * reported line numbers, so the fragment's own lines stay accurate. If none
 * parse, the snippet is genuinely malformed and keeps its syntax errors.
 */
const WRAPPERS = [
  { id: 'module', opener: null, closer: '' },
  { id: 'type-shape', opener: 'type __DocShape =', closer: '\n;' },
  { id: 'class-member', opener: 'class __DocHost {', closer: '\n}' },
  { id: 'object-literal', opener: 'const __DocValue =', closer: '\n;' },
];

const parseErrors = (code, ext) =>
  (ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, isolatedModules: false },
    fileName: `probe.${ext}`,
  }).diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error).length;

export function chooseWrapper(code, ext) {
  if (parseErrors(code, ext) === 0) return WRAPPERS[0];
  for (const w of WRAPPERS.slice(1)) {
    if (parseErrors(`${w.opener}\n${code}${w.closer}`, ext) === 0) return w;
  }
  return WRAPPERS[0];
}

function buildPrelude(u) {
  const parts = ['export {};'];
  if (u.extraPrelude) parts.push(u.extraPrelude);
  if (u.injectedImports.length) {
    parts.push(`import { ${[...new Set(u.injectedImports)].join(', ')} } from '@kitn.ai/ui';`);
  }
  const injected = new Set(u.injectedImports);
  // Names the shadow pass already imports for real must never also be stubbed.
  for (const m of (u.extraPrelude ?? '').matchAll(/\{([^}]*)\}/g))
    for (const n of m[1].split(',')) injected.add(n.trim());
  for (const n of u.stubs) {
    if (injected.has(n)) continue;
    // Declared as BOTH a value and a type: doc fragments use undeclared names in
    // both positions, and a value-only stub turns a type use into TS2749 noise.
    parts.push(`declare const ${n}: any; type ${n} = any;`);
  }
  // The fragment wrapper's opener must be the LAST thing on the line — anything
  // after it would land inside the wrapper's body.
  if (u.opener) parts.push(u.opener);
  return parts.join(' ');
}

export { ts };
