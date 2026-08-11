// Extracts the public API of every `defineWebComponent(...)` custom element from
// the facades in src/elements/, using the TypeScript compiler API, and emits:
//   - custom-elements.json          (Custom Elements Manifest, for IDE/tooling)
//   - src/elements/jsx-types.d.ts   (HTMLElementTagNameMap + per-element types)
//   - react/index.tsx               (typed React wrappers)
//
// Source of truth = the `Props`/`Events` interfaces + `dispatch('…')` calls in
// each facade. Run after the facades change.

import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsHelpers, displayNameFromClass } from './_ts-helpers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const elementsDir = resolve(root, 'src/elements');

// Facade files only (skip infra/helpers/stories).
const SKIP = new Set(['define.tsx', 'register.ts', 'register-impl.ts', 'css.ts', 'chat-types.ts', 'default-input.tsx']);
const facadeFiles = readdirSync(elementsDir)
  .filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.endsWith('.stories.tsx') && !SKIP.has(f))
  .map((f) => resolve(elementsDir, f));

const tsconfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  root,
);
const program = ts.createProgram([...facadeFiles, resolve(root, 'src/index.ts')], { ...tsconfig.options, noEmit: true });
const checker = program.getTypeChecker();

// Type names re-exported from the public entry (src/index.ts) are importable —
// consumers can `import type { AttachmentData } from '@kitn.ai/ui'`.
const entrySf = program.getSourceFile(resolve(root, 'src/index.ts'));
const entrySym = entrySf && checker.getSymbolAtLocation(entrySf);
const exportedTypeNames = new Set(entrySym ? checker.getExportsOfModule(entrySym).map((s) => s.name) : []);

const toAttr = (name) => name.replace(/([A-Z])/g, '-$1').toLowerCase();

// Every member name `HTMLElement` already carries (own + inherited: Element,
// Node, EventTarget, ARIAMixin, GlobalEventHandlers, …). A generated element
// interface `extends HTMLElement`, so a prop whose NAME lands in here re-declares
// a DOM member and must stay assignable to it — otherwise the interface is
// formally invalid (TS2430) and, for members `Element` itself declares (`role`),
// lib.dom's own `HTMLElementTagNameMap[K] extends Element` constraint fails too
// (TS2344). Read from the checker rather than hand-listed, so a TypeScript/lib
// upgrade that adds a member is picked up on the next build.
// See writeTypes() in gen-element-types.mjs for what is done with this, and
// tests/elements/element-types-lib-check.test.ts for the guard that proves it.
const DOM_MEMBERS = new Set();
for (const sf of program.getSourceFiles()) {
  if (!sf.isDeclarationFile || !/[\\/]lib\.dom\.d\.ts$/.test(sf.fileName)) continue;
  for (const st of sf.statements) {
    if (!ts.isInterfaceDeclaration(st) || st.name.text !== 'HTMLElement') continue;
    for (const p of checker.getPropertiesOfType(checker.getTypeAtLocation(st))) DOM_MEMBERS.add(p.name);
  }
}
if (DOM_MEMBERS.size === 0) throw new Error('gen-element-api: could not resolve HTMLElement members from lib.dom.d.ts');

// Generated types are FULLY SELF-CONTAINED: every named type is expanded inline
// (no imports), so the type files don't drag the kit's Solid `.tsx` sources into
// a consumer's (or React-JSX) compilation. Only lib types (Uint8Array, Blob,
// Promise, AsyncIterable) stay opaque. Keep this empty unless you have a
// JSX-free type module to import from.
const IMPORTS = {};
const IMPORTABLE = new Set(Object.keys(IMPORTS));

// renderType/membersOf/isScalar/jsdocOf live in _ts-helpers.mjs (shared with
// gen-component-api.mjs); membersOf here reads a Props/Events *type node*.
const { membersOfNode: membersOf, renderType, isScalar, jsdocOf } = createTsHelpers(program, checker, { importable: IMPORTABLE });

// Render a propDefaults object-literal property value to a short display string.
function defaultText(initializer) {
  if (!initializer) return undefined;
  if (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) return defaultText(initializer.expression);
  if (ts.isStringLiteralLike(initializer)) return `'${initializer.text}'`;
  if (initializer.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (initializer.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  if (ts.isNumericLiteral(initializer)) return initializer.text;
  if (initializer.kind === ts.SyntaxKind.UndefinedKeyword || initializer.getText() === 'undefined') return undefined;
  if (ts.isArrayLiteralExpression(initializer)) return initializer.elements.length ? '[…]' : '[]';
  if (ts.isObjectLiteralExpression(initializer)) return '{…}';
  return initializer.getText();
}
// Map prop name -> default display string from the propDefaults object literal (arg 1).
function defaultsFrom(objLiteralNode) {
  const out = {};
  if (objLiteralNode && ts.isObjectLiteralExpression(objLiteralNode)) {
    for (const p of objLiteralNode.properties) {
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
        out[p.name.text] = defaultText(p.initializer);
      }
    }
  }
  return out;
}

// Storybook toId: lowercase, non-alphanumerics → nothing (matches our story titles).
const kebabId = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Does this module register its own custom element? Used to stop the recursion
 *  below at a facade boundary — one element must not inherit another's parts. */
const definesElement = (sourceFile) => {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'defineWebComponent') found = true;
    else ts.forEachChild(n, visit);
  };
  visit(sourceFile);
  return found;
};

/** A same-directory relative import resolved to its SourceFile in the program. */
const localModule = (sourceFile, spec) => {
  const dir = dirname(sourceFile.fileName);
  for (const ext of ['.tsx', '.ts']) {
    const sf = program.getSourceFile(resolve(dir, spec + ext));
    if (sf) return sf;
  }
  return null;
};

/** Is this imported binding a COMPONENT (something you can render), as opposed to
 *  a constant, an enum-ish object or a plain value that merely starts with a
 *  capital? `/^[A-Z]/` alone let `DEFAULT_WARN_THRESHOLD` / `DEFAULT_DANGER_THRESHOLD`
 *  (two numbers from ../components/context) into kai-context's `composedFrom`,
 *  where they got a `solid-advanced-elements-defaultwarnthreshold--docs` story id
 *  that resolves to nothing. Ask the checker for the declaration instead. */
const isComponentBinding = (node) => {
  let sym = checker.getSymbolAtLocation(node);
  if (!sym) return false;
  try { if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym); } catch { /* unresolved */ }
  const decl = sym.valueDeclaration ?? sym.declarations?.[0];
  if (!decl) return false;
  if (ts.isFunctionDeclaration(decl) || ts.isClassDeclaration(decl)) return true;
  const init = ts.isVariableDeclaration(decl) ? decl.initializer : undefined;
  if (!init) return false;
  // `const Foo = (props) => …`, `const Foo = function (props) {…}`, and the
  // `Object.assign(Base, { Sub })` / `createX(…)` component-factory forms.
  return ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isCallExpression(init);
};

// Collect { name, group } for the kit components a facade renders: named value
// imports from ../components/ or ../ui/. Skips `import type` declarations and
// inline `type` specifiers, and non-component bindings (see isComponentBinding).
//
// Recurses through ELEMENT-LOCAL helper modules. `kai-prompt-input` composes its
// whole UI in ./default-input (so `<kai-chat>` can render the same composer), and
// with a facade-file-only walk it reported `composedFrom: []` — the one element
// whose composition a consumer most wants to see. Recursion stops at any module
// that registers an element of its own, so an element never inherits another's
// parts.
const composedImports = (sourceFile, seen = new Set([sourceFile.fileName])) => {
  const out = [];
  for (const st of sourceFile.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings) continue;
    // Skip `import type { ... }` (the whole declaration is type-only)
    if (st.importClause.isTypeOnly) continue;
    const spec = st.moduleSpecifier.text;
    const named = st.importClause.namedBindings;
    if (!ts.isNamedImports(named)) continue;
    const group = spec.startsWith('../components/') ? 'Components'
                : spec.startsWith('../ui/') ? 'UI' : null;
    if (!group) {
      if (!spec.startsWith('./')) continue;
      const local = localModule(sourceFile, spec);
      if (!local || seen.has(local.fileName) || definesElement(local)) continue;
      seen.add(local.fileName);
      out.push(...composedImports(local, seen));
      continue;
    }
    for (const el of named.elements) {
      // Skip inline `type` specifiers e.g. `{ Foo, type Bar }`
      if (el.isTypeOnly) continue;
      const name = el.name.text;
      if (!/^[A-Z]/.test(name)) continue; // components, not lowercase utils
      if (!isComponentBinding(el.name)) continue;
      if (!out.some((o) => o.name === name)) out.push({ name, group });
    }
  }
  return out;
};

// ---- the props EVERY element gets, injected by defineWebComponent -----------
// `define.tsx` merges its own defaults over each facade's (`{ theme: 'auto',
// ...propDefaults }`), so `theme` is a real property + attribute on all 79
// elements — but it was declared nowhere in the model, and instead re-typed by
// hand in three places (the .d.ts propBody, the CEM `attributes` list, the React
// `propNames` array) and absent entirely from element-meta.json, llms-full.txt
// and the CEM `members` list the kai MCP serves. Read it off the source literal
// instead, with its type and doc comment from the checker.
const UNIVERSAL_PROPS = (() => {
  const sf = program.getSourceFile(resolve(elementsDir, 'define.tsx'));
  let objLit = null;
  const visit = (n) => {
    if (objLit) return;
    if (
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'defaults' &&
      n.initializer && ts.isObjectLiteralExpression(n.initializer) &&
      n.initializer.properties.some((p) => ts.isSpreadAssignment(p) && p.expression.getText() === 'propDefaults')
    ) objLit = n.initializer;
    else ts.forEachChild(n, visit);
  };
  if (sf) visit(sf);
  if (!objLit) {
    throw new Error(
      "gen-element-api: could not find defineWebComponent's injected `defaults` literal " +
      '(`const defaults = { …, ...propDefaults }`) in src/elements/define.tsx — the universal ' +
      'props would silently vanish from every generated artifact.',
    );
  }
  const out = [];
  for (const p of objLit.properties) {
    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) continue;
    const t = checker.getTypeAtLocation(p.initializer);
    const sym = checker.getSymbolAtLocation(p.name);
    out.push({
      name: p.name.text,
      type: renderType(t, p),
      optional: true,
      scalar: isScalar(t),
      description: sym ? jsdocOf(sym) : '',
      default: defaultText(p.initializer),
      // Marks it as coming from define.tsx rather than the facade's own Props, so
      // the React wrappers (whose WebComponentProps already declares it) can skip it.
      universal: true,
    });
  }
  if (!out.length) throw new Error('gen-element-api: the `defaults` literal in define.tsx declares no universal props');
  return out;
})();

// The few elements with element-specific tokens; everything else is themed by
// the global token set (see the Theming → Token Reference story).
const COMPONENT_TOKENS = {
  'kai-tool': ['--color-tool-blue', '--color-tool-amber', '--color-tool-green', '--color-tool-red'],
  'kai-code-block': ['--color-code-foreground'],
  'kai-conversations': ['--color-sidebar', '--color-scrollbar-thumb'],
};

// Collect the event names a facade file fires. Two channels, and BOTH are public:
//
//   dispatch('kai-x', detail)                        the ctx.dispatch helper
//   el.dispatchEvent(new CustomEvent('kai-x', …))    raw, for the events that must
//                                                    bubble/compose (the maximize
//                                                    protocol between kai-artifact
//                                                    and kai-resizable/-item)
//
// Only the first was collected, so `kai-maximize-intent` and `kai-maximize-state`
// — the two a consumer has to listen for or re-emit to drive maximize from their
// own chrome — appeared in no element's event list, in no generated .d.ts, and in
// no MCP catalog entry, while the private `dispatch()` ones all did.
const dispatchNames = (sourceFile) => {
  const names = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'dispatch') {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) names.add(arg.text);
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'CustomEvent') {
      const arg = node.arguments?.[0];
      if (arg && ts.isStringLiteralLike(arg) && arg.text.startsWith('kai-')) names.add(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
};

// ---- declarative light-DOM children -----------------------------------------
// Several elements accept a "Route 2" child API next to their JS property —
// `<kai-step>` inside `<kai-chain-of-thought>`, `<kai-model>` inside
// `<kai-model-switcher>`, `<kai-action>`, `<kai-conversation>`, `<kai-skill>`,
// `<kai-suggestion>`, `<kai-source>`. They are the only way to drive those
// elements from plain HTML with no JS at all, they are unit-tested
// (*.declarative.test.tsx) and documented in the facades' JSDoc — and they were in
// NO generated artifact: not element-meta.json, not custom-elements.json, not
// llms-full.txt. An agent reading the MCP catalog could not know they exist.
//
// Derived, not listed: find `element.querySelectorAll('kai-…')` inside the
// element's own render callback, then the `.map(fn)` that turns those nodes into
// data, then the attributes that `fn` actually reads.

/** The `fn` in the nearest `<something>.map(fn)` in the same enclosing function. */
const mapCallbackNear = (node) => {
  let scope = node;
  while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
  if (!scope) return null;
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'map' && n.arguments.length === 1
    ) found = n.arguments[0];
    else ts.forEachChild(n, visit);
  };
  visit(scope);
  return found;
};

/** Resolve a `.map(parseKaiXElement)` identifier to its declaration node. */
const resolveCallback = (fn) => {
  if (!fn) return null;
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) return { node: fn, sym: null };
  if (!ts.isIdentifier(fn)) return null;
  let sym = checker.getSymbolAtLocation(fn);
  try { if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym); } catch { /* unresolved */ }
  const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
  if (!decl) return null;
  if (ts.isFunctionDeclaration(decl)) return { node: decl, sym };
  if (ts.isVariableDeclaration(decl) && decl.initializer) return { node: decl.initializer, sym };
  return null;
};

/** Which HTML attributes (and the text content) a parse callback reads off a node. */
const attributesRead = (fnNode) => {
  const attributes = new Set();
  let text = false;
  const visit = (n) => {
    if (
      ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
      (n.expression.name.text === 'getAttribute' || n.expression.name.text === 'hasAttribute')
    ) {
      const a = n.arguments[0];
      if (a && ts.isStringLiteralLike(a)) attributes.add(a.text);
    }
    if (ts.isPropertyAccessExpression(n)) {
      if (n.name.text === 'textContent') text = true;
      // `n.id` — the global `id` attribute, read as an IDL property.
      if (n.name.text === 'id' && ts.isIdentifier(n.expression)) attributes.add('id');
    }
    ts.forEachChild(n, visit);
  };
  visit(fnNode);
  return { attributes: [...attributes].sort(), text };
};

const declarativeChildren = (renderNode) => {
  const out = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'querySelectorAll'
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg) && /^kai-[a-z0-9-]+$/.test(arg.text) && !out.some((o) => o.tag === arg.text)) {
        const cb = resolveCallback(mapCallbackNear(node));
        const read = cb ? attributesRead(cb.node) : { attributes: [], text: false };
        const description = cb?.sym ? jsdocOf(cb.sym) : '';
        out.push({ tag: arg.text, ...read, ...(description ? { description } : {}) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(renderNode);
  return out;
};

// Methods contributed by shared helpers that call `expose()` internally (so the
// literal-`expose({...})` walk below can't see them). Keep in sync with the helper.
const HELPER_METHODS = {
  wireDisclosure: [
    { name: 'show', params: '', returns: 'void', description: 'Open it programmatically (no-op while disabled).' },
    { name: 'hide', params: '', returns: 'void', description: 'Close it programmatically.' },
    { name: 'toggle', params: '', returns: 'void', description: 'Flip the open state (closes while disabled).' },
  ],
};

// collect expose({ name: fn }) imperative methods per file — the input half of the
// interaction surface (defineWebComponent's ctx.expose attaches them to the host).
// Also recognizes method-providing helpers (e.g. wireDisclosure) by their call site.
const exposeMethods = (sourceFile) => {
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && Array.isArray(HELPER_METHODS[node.expression.text])) {
      out.push(...HELPER_METHODS[node.expression.text].map((m) => ({ ...m })));
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'expose' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const prop of node.arguments[0].properties) {
        let name, fn;
        if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name))) {
          name = prop.name.text; fn = prop.initializer;
        } else if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name)) {
          name = prop.name.text; fn = prop;
        } else continue;
        const params = fn.parameters ? fn.parameters.map((pp) => pp.getText(sourceFile)).join(', ') : '';
        const returns = fn.type ? fn.type.getText(sourceFile) : 'void';
        let description = '';
        for (const r of ts.getLeadingCommentRanges(sourceFile.text, prop.getFullStart()) ?? []) {
          const t = sourceFile.text.slice(r.pos, r.end);
          if (t.startsWith('/**')) description = t.replace(/^\/\*\*|\*\/$/g, '').replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ').trim();
        }
        out.push({ name, params, returns, description });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
};

const elements = [];
for (const file of facadeFiles) {
  const sf = program.getSourceFile(file);
  if (!sf) continue;
  const fileDispatch = dispatchNames(sf);
  const fileMethods = exposeMethods(sf);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineWebComponent'
    ) {
      const tagArg = node.arguments[0];
      if (!tagArg || !ts.isStringLiteralLike(tagArg)) return;
      const tag = tagArg.text;
      const props = membersOf(node.typeArguments?.[0]);
      const defaults = defaultsFrom(node.arguments[1]);
      for (const p of props) {
        p.default = defaults[p.name];
        if (p.typeName && exportedTypeNames.has(p.typeName.replace(/\[\]$/, ''))) p.typeImport = p.typeName.replace(/\[\]$/, '');
      }
      const typedEvents = membersOf(node.typeArguments?.[1]);
      const detailByName = new Map(typedEvents.map((e) => [e.name, e]));
      // union of typed events and dispatch() literals seen in the file
      const eventNames = new Set([...typedEvents.map((e) => e.name), ...fileDispatch]);
      const events = [...eventNames].sort().map((name) => {
        const ev = detailByName.get(name);
        const detail = ev ? ev.type : 'unknown';
        return { name, detail: detail === 'void' ? null : detail, description: ev?.description ?? '' };
      });
      const composed = composedImports(sf);
      const tokens = COMPONENT_TOKENS[tag] ?? [];
      const className = tagToClass(tag);
      // Scoped to THIS element's render callback, not the file: source.tsx defines
      // both kai-source and kai-sources, and only the latter reads <kai-source>
      // children.
      const children = node.arguments[2] ? declarativeChildren(node.arguments[2]) : [];
      const el = {
        tag, className, displayName: displayNameFromClass(className),
        props: [...UNIVERSAL_PROPS, ...props],
        events, methods: fileMethods, composedFrom: composed, tokens,
        ...(children.length ? { declarativeChildren: children } : {}),
      };
      // Source-module basename (e.g. confirm-card.tsx → "confirm-card"). The
      // per-element build (vite.config.elements.ts) names each emitted module after
      // its SOURCE FILE, not its tag, so the React wrappers must lazy-import
      // `@kitn.ai/ui/elements/<module>` (not `<tag>`) to resolve a real dist file.
      // Non-enumerable so it stays out of the serialized element-meta.json.
      Object.defineProperty(el, 'module', { value: basename(file).replace(/\.(tsx|ts)$/, ''), enumerable: false });
      elements.push(el);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
elements.sort((a, b) => a.tag.localeCompare(b.tag));

// Resolve story ids for composedFrom entries (after the loop so all elements are collected).
for (const el of elements) {
  el.composedFrom = el.composedFrom.map(({ name, group }) => {
    const seg = group === 'UI' ? 'primitives' : 'elements';
    return { name, group, storyId: `solid-advanced-${seg}-${kebabId(name)}--docs` };
  });
}

// ---- attach composition seams (slots + ::part) from the slots.ts registry ----
// This script runs under plain node, so it can't `import` the TS registry; instead
// read the ELEMENT_COMPOSITION literal straight from the AST (slots.ts is already
// in the program — chat.tsx imports it). Generic literal eval covering the
// registry's pure-data shape: string/bool/number/array/object/identifier-ref.
{
  const slotsSf = program.getSourceFile(resolve(elementsDir, 'slots.ts'));
  if (slotsSf) {
    const symbols = new Map();
    for (const st of slotsSf.statements) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.initializer) symbols.set(d.name.text, d.initializer);
        }
      }
    }
    const evalNode = (node) => {
      if (!node) return undefined;
      if (ts.isStringLiteralLike(node)) return node.text;
      if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (ts.isNumericLiteral(node)) return Number(node.text);
      if (ts.isArrayLiteralExpression(node)) return node.elements.map(evalNode);
      if (ts.isObjectLiteralExpression(node)) {
        const obj = {};
        for (const p of node.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) {
            obj[p.name.text] = evalNode(p.initializer);
          }
        }
        return obj;
      }
      if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return evalNode(node.expression);
      if (ts.isIdentifier(node)) return evalNode(symbols.get(node.text));
      return undefined;
    };
    const composition = evalNode(symbols.get('ELEMENT_COMPOSITION')) ?? {};
    for (const el of elements) {
      const comp = composition[el.tag];
      if (!comp) continue;
      // The DEFAULT (unnamed) slot, documented as `children` on the registry entry
      // rather than as a `{ name: '' }` SlotDef — the SlotDef arrays are also read
      // at runtime by readSlots(), which would then query a meaningless
      // `[slot=""]`. Emitted here as a normal slot with the empty name, which is
      // how the Custom Elements Manifest spells the default slot.
      const slots = [
        ...(comp.children ? [{ name: '', mode: 'inject', doc: comp.children }] : []),
        ...(comp.slots ?? []),
      ];
      // Slots flagged `part: true` are ALSO styleable parts.
      const slotParts = slots.filter((s) => s.part).map((s) => ({ name: s.name, doc: s.doc }));
      const parts = [...(comp.parts ?? []), ...slotParts];
      if (slots.length) el.slots = slots;
      if (parts.length) el.parts = parts;
    }
  } else {
    console.warn('⚠ slots.ts not found in program — slots/parts not emitted');
  }
}

function tagToClass(tag) {
  return tag.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('') + 'Element';
}

// ---- emit custom-elements.json ----
const cem = {
  schemaVersion: '1.0.0',
  readme: '',
  modules: [{
    kind: 'javascript-module',
    path: 'dist/kai.es.js',
    declarations: elements.map((el) => ({
      kind: 'class',
      customElement: true,
      tagName: el.tag,
      name: el.className,
      description: '',
      members: [
        ...el.props.map((p) => ({
          kind: 'field',
          name: p.name,
          type: { text: p.type },
          description: p.description,
          privacy: 'public',
        })),
        ...el.methods.map((m) => ({
          kind: 'method',
          name: m.name,
          ...(m.params ? { parameters: [{ name: m.params }] } : {}),
          return: { type: { text: m.returns } },
          description: m.description,
          privacy: 'public',
        })),
      ],
      // `theme` is no longer special-cased here — it comes through el.props like
      // every other scalar, from the one place define.tsx declares it.
      attributes: el.props.filter((p) => p.scalar).map((p) => ({
        name: toAttr(p.name), fieldName: p.name, type: { text: p.type }, description: p.description,
      })),
      events: el.events.map((e) => ({
        name: e.name,
        type: { text: e.detail ? `CustomEvent<${e.detail}>` : 'CustomEvent' },
        description: e.description,
      })),
      cssProperties: el.tokens.map((name) => ({ name })),
      // Our extension: the "Route 2" light-DOM child elements this one parses.
      // Not a CEM-standard key (the manifest has no vocabulary for a child-element
      // API), but it rides in the same file the kai MCP serves.
      ...(el.declarativeChildren
        ? {
            declarativeChildren: el.declarativeChildren.map((c) => ({
              tagName: c.tag,
              attributes: c.attributes.map((name) => ({ name })),
              textContent: c.text,
              description: c.description ?? '',
            })),
          }
        : {}),
      // Composition seams (CEM-standard `slots`/`cssParts`; `recipe` is our extension).
      ...(el.slots ? { slots: el.slots.map((s) => ({ name: s.name, description: s.doc })) } : {}),
      ...(el.parts
        ? {
            cssParts: el.parts.map((p) => ({
              name: p.name,
              description: p.doc,
              ...(p.recipe ? { recipe: p.recipe } : {}),
            })),
          }
        : {}),
    })),
  }],
};
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/custom-elements.json'), JSON.stringify(cem, null, 2) + '\n');
console.log(`✓ dist/custom-elements.json — ${elements.length} elements`);

export { elements, toAttr, tagToClass, IMPORTS };

// run the sibling generators if present (types + react)
if (import.meta.url === `file://${process.argv[1]}`) {
  // Add readable (alias-shortened) display types for the Storybook API tab, which
  // renders from this JSON and can't run the markdown shortening at display time.
  const { shorten } = await import('./gen-web-components-md.mjs');
  for (const el of elements) {
    for (const p of el.props) p.displayType = shorten(p.type);
    for (const ev of el.events) ev.displayDetail = ev.detail ? shorten(ev.detail) : null;
  }
  writeFileSync(resolve(root, 'src/elements/element-meta.json'), JSON.stringify(elements, null, 2) + '\n');
  console.log(`✓ src/elements/element-meta.json — ${elements.length} elements`);

  // ---- emit the curated icon-name list (the `name=` values kai-icon/icon props
  // accept) so the docs can render a no-drift gallery. Source of truth is the
  // NAMED_ICONS object in src/ui/icon.tsx; extract its keys from the literal. ----
  {
    const iconSrc = readFileSync(resolve(root, 'src/ui/icon.tsx'), 'utf8');
    const block = iconSrc.match(/NAMED_ICONS[^=]*=\s*\{([\s\S]*?)\n\};/);
    const names = block
      ? [...block[1].matchAll(/^\s*'?([a-z][a-z0-9-]*)'?\s*:/gm)].map((m) => m[1]).sort()
      : [];
    writeFileSync(resolve(root, 'src/elements/icon-names.json'), JSON.stringify(names, null, 2) + '\n');
    console.log(`✓ src/elements/icon-names.json — ${names.length} curated icons`);
  }
  for (const mod of ['./gen-element-types.mjs', './gen-element-react.mjs']) {
    try {
      const m = await import(mod);
      if (m.writeTypes) m.writeTypes(root, elements, toAttr, IMPORTS, { domMembers: DOM_MEMBERS });
      if (m.writeReact) m.writeReact(root, elements, IMPORTS);
    } catch (e) {
      if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    }
  }
  // Generate llms.txt / llms-full.txt from the same in-memory model (one parse).
  const { generate } = await import('./gen-llms.mjs');
  generate(elements);
  // Regenerate docs/web-components.md tables between <!-- spec:TAG --> markers.
  const { writeWebComponentsMd } = await import('./gen-web-components-md.mjs');
  writeWebComponentsMd(root, elements);
  // Phase 2: regenerate the SolidJS/UI component spec in the same build pass.
  const { generate: generateComponents } = await import('./gen-component-api.mjs');
  generateComponents();
}
