// Shared TypeScript-compiler helpers for the API extractors
// (gen-element-api.mjs for the web-component facades). It walks a `ts.Program`,
// reads a Props/Events type, and renders members to a self-contained,
// fully-expanded display string.
//
// `createTsHelpers(program, checker, { importable })` returns the helper set
// bound to that program/checker so each generator keeps a single parse.

import ts from 'typescript';

// Friendly element name shared by the React/Solid wrappers, story titles, and the
// API tab. KaiArtifactElement -> Artifact. All element tags start `kai-`, so the
// className always starts `Kai`.
export const displayNameFromClass = (className) =>
  className.replace(/^Kai/, '').replace(/Element$/, '');

/**
 * A property name as it must be written INSIDE an emitted type literal.
 *
 * Bare when it is a valid JS identifier, quoted otherwise. Not cosmetic: these
 * strings are pasted into `src/elements/element-types.d.ts` and
 * `frameworks/react/index.tsx`, and a hyphen is a MINUS SIGN to the parser, so an
 * unquoted `x-kai-widget?: 'textarea' | …` is not a loosely-typed member — it is a
 * syntax error that takes the rest of the file with it. Measured when
 * `FormDefinition` first got inlined (it is the only payload type with hyphenated
 * keys, which is why this went unnoticed while every inlined type happened to have
 * identifier-safe members): compiling the generated `.d.ts` reported 60 errors
 * starting `TS1131: Property or signature expected` at the first `x-kai-*` key, and
 * 0 with this applied.
 *
 * `JSON.stringify` for the quoting so an embedded quote or backslash is escaped
 * rather than pasted through. Numeric-looking keys are quoted too: `{ 0: X }` and
 * `{ "0": X }` mean the same thing to TypeScript, so quoting is never wrong here,
 * only occasionally redundant.
 */
export const propKey = (name) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name));

export function createTsHelpers(program, checker, { importable = new Set() } = {}) {
  const isScalar = (t) => {
    if (t.isUnion?.()) return t.types.every(isScalar);
    const F = ts.TypeFlags;
    return !!(t.flags & (F.String | F.Number | F.Boolean | F.StringLiteral | F.NumberLiteral | F.BooleanLiteral | F.Undefined | F.Any));
  };

  const jsdocOf = (sym) => ts.displayPartsToString(sym.getDocumentationComment(checker)).replace(/\s+/g, ' ').trim();

  const isLibSym = (sym) => {
    const d = sym?.declarations?.[0];
    return !!d && program.isSourceFileDefaultLibrary(d.getSourceFile());
  };

  // ---- deterministic union order --------------------------------------------
  // `type.types` comes back in CHECKER-ID order, and a type's id is assigned when
  // the checker FIRST interns it — so the order tracks the module graph, not the
  // source. Adding one unrelated module (measured: a new module reached through
  // the first facade's props) re-ordered `ConfirmTone` from the authored
  // `"default" | "warning" | "danger"` to `"danger" | "default" | "warning"` in
  // element-meta.json, element-types.d.ts, llms-full.txt and the React wrappers at
  // once, and `ContextSeverity` the same way.
  //
  // Two real costs. `verify:generated` diffs a fresh run against the COMMITTED
  // artifacts, so an order flip fails that gate for a change that had nothing to
  // do with it. And this repo reads DIFF SIZE as the tell for a generator that
  // silently rewrote an artifact with less data (the gen-llms.mjs incident); a
  // baseline that churns on every unrelated commit destroys that signal.
  //
  // SORTING WOULD BE DETERMINISTIC AND WRONG. Authored order carries meaning here:
  // `"sm" | "md" | "lg"` is a size scale, `"ok" | "warn" | "danger"` a severity
  // ramp, `"button" | "submit" | "reset"` the HTML order. 482 of the model's 594
  // unions would move under an alphabetical sort, and the docs, the .d.ts tooltips
  // and the MCP catalog all render this string verbatim. So the order is recovered
  // from the SOURCE instead — the union's type-alias declaration, or the
  // declaration the type was read from — and validated: unless the authored node
  // accounts for every non-nullish constituent, it is not used at all.
  //
  // Constituents the authored node cannot name (the `undefined` that `?` adds)
  // sort FIRST, by rendered text. That is where the checker put them, so the
  // existing artifacts do not churn on the way in.
  const NULLISH = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;
  const unwrapParenNode = (n) => (n && ts.isParenthesizedTypeNode(n) ? unwrapParenNode(n.type) : n);

  /** Every node that could be the authored `A | B | C` for this type, best first.
   *  Speculative on purpose: a candidate that turns out to describe a DIFFERENT
   *  type is discarded by the coverage test in authoredRanks, so casting the net
   *  wide costs nothing and a missed candidate costs the authored order. */
  function unionNodeCandidates(type, decl) {
    const out = [];
    const seenNodes = new Set();
    const push = (n) => {
      const u = unwrapParenNode(n);
      if (!u || seenNodes.has(u)) return;
      seenNodes.add(u);
      if (ts.isUnionTypeNode(u)) out.push(u);
      // `foo?: ('a' | 'b')[]` — renderType recurses into the ELEMENT type carrying
      // the array's own declaration.
      else if (ts.isArrayTypeNode(u)) push(u.elementType);
      // `variant?: LoaderVariant`. An OPTIONAL property's type is
      // `LoaderVariant | undefined`, which is a DIFFERENT type from the alias, so
      // it carries no aliasSymbol and the alias branch above never fires — the
      // single biggest hole, and the one that put `size?: 'sm' | 'md' | 'lg'`
      // into alphabetical order. Follow the reference to the alias by hand.
      else if (ts.isTypeReferenceNode(u)) {
        let sym = checker.getSymbolAtLocation(ts.isQualifiedName(u.typeName) ? u.typeName.right : u.typeName);
        try { if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym); } catch { /* unresolved */ }
        for (const d of sym?.declarations ?? []) if (ts.isTypeAliasDeclaration(d)) push(d.type);
        // ...and through a generic WRAPPER. floating-ui spells its placement type
        // `Prettify<Side | AlignedPlacement>`, so the alias body is a reference,
        // not a union, and the 12 members have no authored node anywhere else.
        for (const a of u.typeArguments ?? []) push(a);
      }
    };
    // `type Tone = 'ok' | 'warn' | 'danger'`, wherever it was referenced from.
    for (const d of type.aliasSymbol?.declarations ?? []) if (ts.isTypeAliasDeclaration(d)) push(d.type);
    if (decl) {
      push(decl.type);                       // PropertySignature / parameter / variable
      push(decl.initializer?.type);          // `theme: 'auto' as 'light' | 'dark' | 'auto'`
      push(decl);                            // membersOfNode passes the type node itself
    }
    return out;
  }

  /** constituent type -> position in the authored source, or null when no candidate
   *  node accounts for the whole union. */
  function authoredRanks(type, decl, depth) {
    if (depth > 4) return null;
    for (const node of unionNodeCandidates(type, decl)) {
      const rank = new Map();
      let n = 0;
      const walk = (tn) => {
        const inner = unwrapParenNode(tn);
        if (ts.isUnionTypeNode(inner)) { inner.types.forEach(walk); return; }
        let t;
        try { t = checker.getTypeFromTypeNode(inner); } catch { return; }
        if (!t) return;
        // A constituent that is itself a union (an alias reference, `boolean`) is
        // spliced in at this position, in ITS OWN authored order.
        if (t.flags & ts.TypeFlags.Union) {
          for (const s of orderedUnionTypes(t, undefined, depth + 1)) if (!rank.has(s)) rank.set(s, n++);
          return;
        }
        if (!rank.has(t)) rank.set(t, n++);
      };
      node.types.forEach(walk);
      // ALL-OR-NOTHING. A partial match means this node describes a different type
      // and its positions are meaningless. Nullish constituents are exempt: `?`
      // adds them after the fact and no authored node ever names them.
      if (type.types.every((t) => rank.has(t) || t.flags & NULLISH)) return rank;
    }
    return null;
  }

  /** `type.types` in a stable order. Three bands, in this order:
   *    0  nullish the author never wrote (the `undefined` that `?` adds)
   *    1  everything the authored node accounts for, in ITS order
   *    2  anything left, by rendered text
   *  Band 0 exists because that is where the checker has always put those, so the
   *  committed artifacts do not churn on the way in. A nullish constituent the
   *  author DID write (`string | undefined`) is ranked and keeps its place. */
  function orderedUnionTypes(type, decl, depth = 0) {
    const rank = authoredRanks(type, decl, depth);
    return type.types
      .map((t) => {
        const ranked = rank?.has(t);
        return {
          t,
          band: ranked ? 1 : t.flags & NULLISH ? 0 : 2,
          rank: ranked ? rank.get(t) : 0,
          key: checker.typeToString(t),
        };
      })
      .sort((a, b) => a.band - b.band || a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((x) => x.t);
  }

  // Render a type to a self-contained, fully-expanded string: every named
  // (non-lib, non-importable) object type is inlined so the output drags no
  // imports into a consumer's compilation. Unions de-dup; arrays parenthesize
  // unions so `(A | B)[]` doesn't mis-parse.
  //
  // `seen` tracks the object-type ids on the CURRENT expansion path so a
  // self-referential type (e.g. `KaiMenuItem.items?: KaiMenuItem[]`, or
  // `FileTreeNode.children`) can't recurse forever. On re-entry we emit a
  // self-contained, tsc-valid placeholder — the top-level shape is already fully
  // described, and the inlined `.d.ts` cannot carry a named recursive reference.
  // The path is copied per branch (`new Set(seen)`), so a type used by two
  // sibling props is NOT mistaken for a cycle — only a true ancestor triggers it.
  function renderType(type, decl, seen = new Set()) {
    if (type.isUnion()) {
      return [...new Set(orderedUnionTypes(type, decl).map((t) => renderType(t, decl, seen)))].join(' | ');
    }
    if (checker.isArrayType(type)) {
      const elem = checker.getTypeArguments(type)[0];
      const rendered = renderType(elem, decl, seen);
      return elem.isUnion() ? `(${rendered})[]` : `${rendered}[]`;
    }
    const sym = type.aliasSymbol || type.getSymbol();
    const name = sym?.getName();
    if (name && importable.has(name)) return name;
    if (
      type.flags & ts.TypeFlags.Object &&
      type.getCallSignatures().length === 0 &&
      !isLibSym(sym) &&
      type.getProperties().length
    ) {
      const id = type.id; // checker-assigned numeric id, stable within this parse
      if (id != null && seen.has(id)) return 'Record<string, unknown>';
      const next = id != null ? new Set(seen).add(id) : seen;
      const props = type.getProperties().map((s) => {
        // The property's OWN declaration, not the outer one. The type was already
        // read at `s.valueDeclaration`; passing the outer decl down meant a nested
        // union (`role: 'user' | 'assistant'` inside an inlined `ChatMessage`)
        // could not reach the node that authored it, and fell back to text order.
        const at = s.valueDeclaration ?? s.declarations?.[0] ?? decl;
        const t = checker.getTypeOfSymbolAtLocation(s, at);
        const opt = s.flags & ts.SymbolFlags.Optional ? '?' : '';
        return `${propKey(s.name)}${opt}: ${renderType(t, at, next)}`;
      });
      return `{ ${props.join('; ')} }`;
    }
    // A `Record<string, X>` (mapped/index-signature type) has ZERO enumerable
    // properties, so the branch above never catches it — it would otherwise
    // fall through to the `typeToString` call below, which for an `X` whose
    // symbol lives in another source file prints `import("<absolute path>").X`
    // (a TS compiler-API quirk: there's no enclosing import to reference, so it
    // synthesizes one against the FILESYSTEM PATH of the file that declared X).
    // That path is specific to the machine that ran this generator and breaks
    // every consumer's `tsc` the moment they touch the property (as with
    // `shader.uniforms?: Record<string, UniformSpec>` on kai-audio-visualizer).
    // Render it the same self-contained way as the object-with-properties
    // branch above: recurse into the value type so IT gets inlined/imported too.
    // NOTE: no `!isLibSym(sym)` guard here (unlike the branch above) — `sym` for
    // a `Record<K, V>` IS the lib-declared `Record` alias itself (from
    // lib.es5.d.ts), so that guard would always exclude exactly the case this
    // is for. `getIndexInfoOfType` is the real gate: it only returns non-null
    // for a genuine index signature, so this is a no-op for every other type.
    if (type.flags & ts.TypeFlags.Object && type.getCallSignatures().length === 0) {
      const stringIndex = checker.getIndexInfoOfType(type, ts.IndexKind.String);
      if (stringIndex) return `Record<string, ${renderType(stringIndex.type, decl, seen)}>`;
    }
    return checker.typeToString(type, decl, ts.TypeFormatFlags.NoTruncation);
  }

  // The authored, NAMED form of an object/array-of-object type (e.g. `Step[]`,
  // `AttachmentData[]`) — so docs can show the named type and reveal its shape
  // on demand, instead of an anonymous expanded literal. Returns null for
  // primitives, unions, and anonymous object literals (no useful name).
  // An OPTIONAL property's type is `undefined | X` — a UNION — so bailing on every
  // union hid the name of every optional object/array prop: `messages: ChatMessage[]`
  // (required) was named, `triggers?: TriggerDef[]` (optional) was not, and the docs
  // could only show it expanded. Strip the nullish constituents first; anything left
  // that is still a union genuinely has no single name.
  const unwrapNullish = (t) => {
    if (!t?.isUnion?.()) return t;
    const rest = t.types.filter(
      (x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)),
    );
    return rest.length === 1 ? rest[0] : t;
  };

  const namedTypeName = (type) => {
    let t = unwrapNullish(type);
    let suffix = '';
    if (checker.isArrayType(t)) { t = checker.getTypeArguments(t)[0]; suffix = '[]'; }
    if (!t || t.isUnion?.()) return null;
    const sym = t.aliasSymbol || t.getSymbol();
    const name = sym?.getName();
    if (!name || name === '__type' || isLibSym(sym)) return null;
    if (!(t.flags & ts.TypeFlags.Object) || !t.getProperties().length) return null;
    return name + suffix;
  };

  // Force-expand a named object/array-of-object type to its `{ prop: type; … }`
  // shape (for the docs "click to see the shape" dialog), even when renderType
  // would otherwise print the bare name.
  const expandShape = (type) => {
    let t = unwrapNullish(type);
    let suffix = '';
    if (checker.isArrayType(t)) { t = checker.getTypeArguments(t)[0]; suffix = '[]'; }
    if (t && t.flags & ts.TypeFlags.Object && !t.isUnion?.() && t.getProperties().length) {
      const props = t.getProperties().map((s) => {
        const pt = checker.getTypeOfSymbolAtLocation(s, s.valueDeclaration ?? s.declarations?.[0]);
        const opt = s.flags & ts.SymbolFlags.Optional ? '?' : '';
        return `${propKey(s.name)}${opt}: ${renderType(pt, s.valueDeclaration)}`;
      });
      return `{ ${props.join('; ')} }${suffix}`;
    }
    return renderType(type);
  };

  // Map one property symbol to the canonical member record. `filter` (optional)
  // is applied to the symbol BEFORE mapping so callers can drop inherited
  // members (e.g. the DOM/JSX attribute flood on components that extend
  // JSX.HTMLAttributes). Returns { name, type, optional, scalar, description }
  // (+ `typeName` for named object/array types) — element-meta.json is
  // serialized straight from it.
  const memberInfo = (sym, fallbackDecl) => {
    const decl = sym.valueDeclaration ?? sym.declarations?.[0] ?? fallbackDecl;
    const t = checker.getTypeOfSymbolAtLocation(sym, decl);
    const typeName = namedTypeName(t);
    return {
      name: sym.name,
      type: renderType(t, decl),
      optional: !!(sym.flags & ts.SymbolFlags.Optional),
      scalar: isScalar(t),
      description: jsdocOf(sym),
      ...(typeName ? { typeName, typeShape: expandShape(t) } : {}),
    };
  };

  const membersOfType = (type, fallbackDecl, filter) =>
    (type ? type.getProperties() : [])
      .filter((s) => (filter ? filter(s) : true))
      .map((s) => memberInfo(s, fallbackDecl));

  const membersOfNode = (typeNode) =>
    typeNode ? membersOfType(checker.getTypeFromTypeNode(typeNode), typeNode) : [];

  return { isScalar, jsdocOf, isLibSym, renderType, memberInfo, membersOfType, membersOfNode };
}
