// The SHIPPED API surface, read at run time.
//
// Nothing in this file is a hard-coded list of exports, elements, props or
// events. Every name comes from either the built `.d.ts` reached through the
// package's own `exports` map, or from `src/elements/element-meta.json`. That is
// deliberate: the surface moves under this harness (a sibling change added ~330
// root exports mid-flight), and a baked-in list would have turned every new
// export into a phantom "docs are wrong" finding.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/** Subpaths whose types we can enumerate. `./elements/*` is a wildcard and is
 *  handled separately; the css/json ones have no types. */
const isTypedEntry = (target) =>
  target && typeof target === 'object' && typeof target.types === 'string' && target.types.endsWith('.d.ts');

/**
 * @param {string} uiRoot absolute path to packages/ui
 */
export function loadSurface(uiRoot) {
  const pkg = JSON.parse(readFileSync(join(uiRoot, 'package.json'), 'utf8'));

  // ── 1. Exported names per entry point, through the REAL exports map ────────
  const entryFiles = [];
  for (const [sub, target] of Object.entries(pkg.exports ?? {})) {
    if (sub.includes('*')) continue;
    if (!isTypedEntry(target)) continue;
    const dts = resolve(uiRoot, target.types);
    if (!existsSync(dts)) continue;
    const specifier = sub === '.' ? '@kitn.ai/ui' : `@kitn.ai/ui${sub.slice(1)}`;
    entryFiles.push({ specifier, dts });
  }
  if (!entryFiles.length) {
    throw new Error(
      `No typed entry points found under ${uiRoot}. Run \`nx build ui\` first — this reads the SHIPPED types.`,
    );
  }

  const program = ts.createProgram(
    entryFiles.map((e) => e.dts),
    {
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: false,
    },
  );
  const checker = program.getTypeChecker();

  /** specifier -> Map<name, {value:boolean, type:boolean}> */
  const entries = new Map();
  /** name -> specifier[] */
  const byName = new Map();

  for (const { specifier, dts } of entryFiles) {
    const sf = program.getSourceFile(dts);
    const moduleSymbol = sf && checker.getSymbolAtLocation(sf);
    const names = new Map();
    if (moduleSymbol) {
      for (const sym of checker.getExportsOfModule(moduleSymbol)) {
        let s = sym;
        if (s.flags & ts.SymbolFlags.Alias) {
          try {
            s = checker.getAliasedSymbol(s);
          } catch {
            /* keep the alias */
          }
        }
        names.set(sym.getName(), {
          value: Boolean(s.flags & ts.SymbolFlags.Value),
          type: Boolean(s.flags & ts.SymbolFlags.Type),
        });
      }
    }
    entries.set(specifier, names);
    for (const n of names.keys()) {
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(specifier);
    }
  }

  // ── 2. The kai-* element catalog ───────────────────────────────────────────
  const metaPath = resolve(uiRoot, (pkg.exports?.['./element-meta.json'] ?? './src/elements/element-meta.json'));
  const elements = JSON.parse(readFileSync(metaPath, 'utf8'));

  // element-meta.json records the props each element DECLARES, but `define.tsx`
  // injects a universal `theme` onto every element that never reaches the JSON.
  // The shipped `Kai<Name>ElementProps` interfaces do include it, so the two are
  // unioned: names come from the .d.ts, the scalar/non-scalar flag (which only
  // element-meta carries) comes from the JSON. Deriving this rather than
  // hard-coding `theme` means the next universal prop is handled for free —
  // without it, every `theme="dark"` in the docs was a false positive.
  const elementsDts = entryFiles.find((e) => e.specifier === '@kitn.ai/ui/elements');
  const dtsMembers = new Map(); // interface name -> Set<member>
  if (elementsDts) {
    const sf = program.getSourceFile(elementsDts.dts);
    if (sf) {
      for (const stmt of sf.statements) {
        if (!ts.isInterfaceDeclaration(stmt)) continue;
        dtsMembers.set(
          stmt.name.text,
          new Set(stmt.members.map((m) => m.name && ts.isIdentifier(m.name) ? m.name.text : m.name?.getText?.(sf)).filter(Boolean).map((n) => n.replace(/^['"]|['"]$/g, ''))),
        );
      }
    }
  }

  const byTag = new Map();
  const eventNames = new Set();
  for (const el of elements) {
    const props = new Map();
    for (const p of el.props ?? []) {
      props.set(p.name, p);
      props.set(camelToKebab(p.name), p);
    }
    // Props the shipped interface has that the JSON does not: universal ones.
    // `scalar: undefined` marks them as "exists, scalarity unknown", so the
    // attribute-stringification check skips them rather than guessing.
    for (const name of dtsMembers.get(`${el.className}Props`) ?? []) {
      if (props.has(name)) continue;
      const injected = { name, universal: true, scalar: undefined };
      props.set(name, injected);
      props.set(camelToKebab(name), injected);
    }
    byTag.set(el.tag, {
      ...el,
      propIndex: props,
      propNames: new Set([...props.keys()]),
      // Raw CustomEvent names (`kai-message-action`) — what addEventListener and
      // Solid's `on:` take.
      eventNames: new Set((el.events ?? []).map((e) => e.name)),
      // The React/Vue handler-prop spelling of the same events
      // (`onKaiMessageAction`), which the shipped `…Events` interface declares.
      // Kept apart so the event catalog is not double-counted.
      handlerNames: new Set(dtsMembers.get(`${el.className}Events`) ?? []),
      slotNames: new Set((el.slots ?? []).map((s) => s.name)),
      partNames: new Set((el.parts ?? []).map((s) => s.name)),
      methodNames: new Set((el.methods ?? []).map((m) => (typeof m === 'string' ? m : m.name))),
    });
    for (const e of el.events ?? []) eventNames.add(e.name);
  }

  // Not every kai-* event is declared on an element. The card protocol routes a
  // document-level `kai-card` event, published as `CARD_EVENT_NAME = "kai-card"`.
  // Any exported const whose type is a string literal starting with `kai-` is an
  // event name — derived from the literal types in the shipped .d.ts, so a new
  // one is picked up without editing this file.
  for (const { specifier, dts } of entryFiles) {
    const sf = program.getSourceFile(dts);
    const moduleSymbol = sf && checker.getSymbolAtLocation(sf);
    if (!moduleSymbol) continue;
    for (const sym of checker.getExportsOfModule(moduleSymbol)) {
      try {
        const t = checker.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration ?? sf);
        if (t.isStringLiteral && t.isStringLiteral() && t.value.startsWith('kai-')) eventNames.add(t.value);
      } catch {
        /* not a value export */
      }
    }
    void specifier;
  }

  // ── 3. Which root exports are renderable COMPONENTS ────────────────────────
  // Used only for reverse coverage. A component is a PascalCase value export
  // that also ships a `<Name>Props` type — that pairing is the convention the
  // kit follows, and it is derived here rather than listed.
  const root = entries.get('@kitn.ai/ui') ?? new Map();
  const components = new Set();
  for (const [name, kind] of root) {
    if (!/^[A-Z]/.test(name) || !kind.value) continue;
    if (root.has(`${name}Props`)) components.add(name);
  }

  // ── 4. kai-* tokens the kit KNOWS but element-meta does not declare ────────
  // Two real API surfaces are missing from element-meta.json:
  //   · declarative light-DOM children — `<kai-step>` inside
  //     <kai-chain-of-thought>, `<kai-model>` inside <kai-model-switcher>. Both
  //     are documented routes with their own tests; neither is a registered
  //     custom element, so neither appears in the catalog.
  //   · bubbling events dispatched with `composed: true` from inside an element,
  //     such as `kai-maximize-intent`, which no element DECLARES.
  // Scanning the kit's own source for quoted `kai-…` literals separates "the
  // docs invented this" from "the kit has it but the metadata omits it". The
  // second is a real finding, but about element-meta.json, not about the docs.
  const knownTokens = new Set();
  const srcDir = join(uiRoot, 'src');
  if (existsSync(srcDir)) {
    (function walk(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (/\.(stories|test|spec)\./.test(e.name)) continue;
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(/['"`](kai-[a-z0-9-]+)['"`]/g)) knownTokens.add(m[1]);
        for (const m of text.matchAll(/<(kai-[a-z0-9-]+)[\s/>]/g)) knownTokens.add(m[1]);
      }
    })(srcDir);
  }

  // ── 5. Standard-library globals, so prose naming a DOM/JS type is quiet ────
  // `MediaRecorder`, `SpeechSynthesisVoice`, `AbortController` are not kit API
  // and never will be. Reading them out of TypeScript's own lib files resolves
  // that mechanically instead of by an allowlist that rots.
  const globalNames = new Set();
  const libDir = join(dirname(require.resolve('typescript/package.json')), 'lib');
  if (existsSync(libDir)) {
    for (const f of readdirSync(libDir)) {
      if (!/^lib\..*\.d\.ts$/.test(f)) continue;
      const text = readFileSync(join(libDir, f), 'utf8');
      for (const m of text.matchAll(
        /^(?:interface|type|declare (?:var|let|const|function|namespace|class)|declare abstract class)\s+([A-Za-z_$][\w$]*)/gm,
      )) {
        globalNames.add(m[1]);
      }
    }
  }

  return {
    version: pkg.version,
    entries,
    byName,
    /** Every global TypeScript's standard libs declare. */
    globalNames,
    /** Every `kai-…` literal the kit's own source mentions. A superset of the
     *  registered tags and declared events. */
    knownTokens,
    specifiers: [...entries.keys()],
    elements,
    byTag,
    tags: new Set(byTag.keys()),
    eventNames,
    components,
    /** Does this bare specifier belong to the kit? */
    isKitSpecifier: (spec) => spec === '@kitn.ai/ui' || spec.startsWith('@kitn.ai/ui/'),
    /** Is `spec` an entry point the package actually declares? */
    resolvesEntry(spec) {
      if (entries.has(spec)) return true;
      // ./elements/* wildcard — a per-element module.
      const m = /^@kitn\.ai\/ui\/elements\/(.+)$/.exec(spec);
      if (m) return existsSync(join(uiRoot, 'dist/elements', `${m[1]}.d.ts`));
      // Asset subpaths declared in the exports map (theme.css, element-meta.json…).
      const sub = spec === '@kitn.ai/ui' ? '.' : `.${spec.slice('@kitn.ai/ui'.length)}`;
      return Object.prototype.hasOwnProperty.call(pkg.exports ?? {}, sub);
    },
  };
}

export const camelToKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
export const kebabToCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
