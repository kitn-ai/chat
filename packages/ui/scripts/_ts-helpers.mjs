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

/**
 * Does this rendered type bind LOOSER than the position it is about to be spliced
 * into? If so the caller must parenthesise it.
 *
 * WHY THIS EXISTS. `renderType` builds a union by rendering each constituent on its
 * own and joining with ` | `, and an array by appending `[]`. Both are correct only
 * while every constituent binds tighter than the punctuation being added. A FUNCTION
 * type does not: it is the loosest form in TypeScript's type grammar, so it swallows
 * whatever follows it.
 *
 *   union   `boolean | (value: number) => string`   TS1385, the .d.ts does not parse
 *   array   `() => void[]`                          parses, and means the WRONG thing
 *
 * The first shipped: `kai-slider`'s `valueLabel` is the kit's first function-in-union
 * prop, and it put a syntax error into `src/elements/element-types.d.ts` AND into
 * `dist/elements.d.ts`, which is what a TypeScript consumer of the published package
 * resolves. The second has never shipped only because nothing renders an array of
 * functions yet.
 *
 * THE TEST IS SYNTACTIC, NOT STRUCTURAL, ON PURPOSE. Asking the checker "does this
 * type have call signatures?" mis-fires on a callable object type (`{ (): void; x: 1 }`),
 * which is already brace-delimited and needs no parens, and it cannot see the shape of
 * the string when this function falls through to `checker.typeToString`. What actually
 * matters is what the emitted TEXT parses as, so that is what is measured: a `=>` at
 * bracket depth zero, which is how both function types and constructor types
 * (`new () => X`) are spelled, and nothing else is.
 *
 * Already-parenthesised input is left alone rather than double-wrapped: TypeScript's
 * own `typeToString` parenthesises function types in unions, so a constituent that
 * reached here through the fallback arrives as `(() => void)`, whose `=>` sits at
 * depth 1.
 *
 * SCOPE. Function and constructor types are the only forms this renderer can emit
 * that bind looser than `|` or `[]`. Intersections, `keyof`, `typeof` and indexed
 * access all bind tighter and need nothing. Conditional types (`A extends B ? C : D`)
 * would also need wrapping, but no path here produces one; if that ever changes this
 * is the function to extend.
 */
export const bindsLoosely = (rendered) => {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < rendered.length; i += 1) {
    const c = rendered[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    // Checked BEFORE the bracket cases so the `>` of `=>` is never mistaken for a
    // closing angle bracket, which would corrupt the depth for everything after it.
    if (c === '=' && rendered[i + 1] === '>') {
      if (depth === 0) return true;
      i += 1;
      continue;
    }
    if (c === '(' || c === '[' || c === '{' || c === '<') depth += 1;
    else if (c === ')' || c === ']' || c === '}' || c === '>') depth -= 1;
  }
  return false;
};


/**
 * Drop one redundant outer paren pair, if the whole string is wrapped in it.
 *
 * The companion to {@link bindsLoosely}, and needed for the same reason: whether a
 * type needs parens is a property of the POSITION it sits in, and some consumers move
 * it to a different position afterwards. `clean()` in gen-element-types.mjs strips the
 * `undefined` arm from an optional prop before writing it into the `.d.ts`, so
 * `undefined | ((audio: Blob) => Promise<string>)` becomes a lone
 * `((audio: Blob) => Promise<string>)` — correct, but wearing parens it no longer
 * needs. Without this the fix for the union bug would have churned every existing
 * function-typed prop in two committed artifacts for no behavioural gain.
 *
 * Only unwraps when the OPENING paren matches the FINAL character, so `(a | b)[]` and
 * `(() => void) | null` are both left alone.
 */
export const unwrapOuterParens = (rendered) => {
  const t = rendered.trim();
  if (!t.startsWith('(')) return t;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '=' && t[i + 1] === '>') { i += 1; continue; }
    if (c === '(' || c === '[' || c === '{' || c === '<') depth += 1;
    else if (c === ')' || c === ']' || c === '}' || c === '>') {
      depth -= 1;
      // The opener closed before the end, so the string is not one wrapped group.
      if (depth === 0) return i === t.length - 1 ? t.slice(1, -1) : t;
    }
  }
  return t;
};

/**
 * Normalise a rendered type for EMISSION into a `.d.ts` / `.tsx` declaration.
 *
 * ONE OWNER, DELIBERATELY. This lived as two byte-identical copies, in
 * gen-element-types.mjs and gen-element-react.mjs, and the duplication cost exactly
 * what this repo says duplication costs: fixing the function-in-union bug in one copy
 * left `frameworks/react/index.tsx` — a SHIPPED consumer entry point — still emitting
 * `valueLabel?: boolean | (value: number) => string`, i.e. still TS1385. That second
 * failure stayed invisible because `npm run typecheck` is `&&`-joined and the earlier
 * step was already red.
 *
 * `optional` means the member is emitted as `name?: T`, so the `undefined` arm is
 * redundant and is stripped. Stripping can leave a type wearing parens it no longer
 * needs, hence the unwrap (see {@link unwrapOuterParens}).
 */
export const cleanEmittedType = (type, optional) => {
  let t = type
    .replace(/\bUint8Array<ArrayBufferLike>/g, 'Uint8Array')
    .replace(/\bfalse \| true\b/g, 'boolean')
    .replace(/\btrue \| false\b/g, 'boolean');
  if (optional) {
    t = t.replace(/undefined \| /g, '').replace(/ \| undefined/g, '');
    t = unwrapOuterParens(t);
  }
  return t.trim();
};

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

  // Does `type` name, anywhere in its own structure, a symbol `renderType`
  // would need to EXPAND (a non-lib named object type)? Used only to gate the
  // generic-lib-type-argument branch inside `renderType` below: that branch
  // exists so `Promise<ConversationSummary[]>` doesn't print `ConversationSummary`
  // bare-and-unresolved in a no-imports `.d.ts`, but firing it unconditionally
  // on every lib generic regressed a real case — `AsyncIterable<string>`
  // rendered as the fully-reified `AsyncIterable<string, any, any>`, because
  // `checker.getTypeArguments` always returns every type parameter (defaults
  // included) while `checker.typeToString` elides a defaulted one. So this
  // mirrors `renderType`'s own branch order (union, array, function, then the
  // symbol/lib check) but only ANSWERS the question, it never renders:
  // `typeToString` is still the one producing the string when the answer is
  // "no", which is what keeps `AsyncIterable`'s elision intact.
  //
  // Deliberately does NOT walk into a lib type's own properties/methods (e.g.
  // `ArrayBuffer.slice(...)`) the way renderType's object-with-properties
  // branch does for a non-lib type -- `typeToString` never expands a named
  // type reference's members, so a lib type's members are irrelevant to
  // whether ITS bare name prints safely. Only a lib GENERIC's own type
  // arguments matter, recursed into via the same `ObjectFlags.Reference`
  // check `renderType` uses.
  function needsSelfContainment(type, seen = new Set()) {
    if (type.isUnion?.()) return type.types.some((t) => needsSelfContainment(t, seen));
    if (checker.isArrayType(type)) return needsSelfContainment(checker.getTypeArguments(type)[0], seen);
    const callSignatures = type.getCallSignatures?.() ?? [];
    if (callSignatures.length === 1 && type.getProperties().length === 0) {
      const sig = callSignatures[0];
      const paramNeeds = sig.parameters.some((p) => {
        const pt = checker.getTypeOfSymbolAtLocation(p, p.valueDeclaration ?? p.declarations?.[0]);
        return needsSelfContainment(pt, seen);
      });
      return paramNeeds || needsSelfContainment(sig.getReturnType(), seen);
    }
    const sym = type.aliasSymbol || type.getSymbol();
    if (!sym) return false; // a primitive (string, number, any, void, …) always renders bare, fine
    if (!isLibSym(sym)) return true; // a non-lib named type: renderType's object branch would expand it
    if (type.flags & ts.TypeFlags.Object && type.objectFlags & ts.ObjectFlags.Reference) {
      const id = type.id;
      if (id != null) {
        if (seen.has(id)) return false;
        seen = new Set(seen).add(id);
      }
      return checker.getTypeArguments(type).some((a) => needsSelfContainment(a, seen));
    }
    return false;
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
      // De-dup on the BARE form, then wrap, so two identical function arms collapse
      // into one rather than differing by punctuation.
      return [...new Set(orderedUnionTypes(type, decl).map((t) => renderType(t, decl, seen)))]
        .map((r) => (bindsLoosely(r) ? `(${r})` : r))
        .join(' | ');
    }
    if (checker.isArrayType(type)) {
      const elem = checker.getTypeArguments(type)[0];
      const rendered = renderType(elem, decl, seen);
      // A union element was always wrapped. A FUNCTION element was not, and that one
      // is the nastier of the two: `() => void` + `[]` is `() => void[]`, which parses
      // perfectly as a function returning an array. tsc says nothing and the consumer
      // gets the wrong type. Nothing in the kit renders an array of functions today,
      // which is exactly why it went unnoticed.
      return elem.isUnion() || bindsLoosely(rendered) ? `(${rendered})[]` : `${rendered}[]`;
    }
    const sym = type.aliasSymbol || type.getSymbol();
    const name = sym?.getName();
    if (name && importable.has(name)) return name;
    // A FUNCTION-valued type (an object property whose value is itself callable,
    // e.g. `store.list: () => Promise<ConversationSummary[]>` on the `store` prop
    // of <kai-chat>): render the signature with every parameter and the return
    // type recursively self-contained, the same treatment `dtsSignature` gives
    // expose() methods. Without this branch a lone call signature falls straight
    // to `checker.typeToString` below, which prints named non-lib return/param
    // types (ConversationSummary, ChatMessage) BARE — valid only because the
    // AUTHORING file (chat.tsx) happens to have them in scope; the generated
    // `.d.ts` this string is spliced into carries no imports at all, so that bare
    // name is an invisible TS2304 under the `skipLibCheck: true` every consumer
    // template sets (caught here only by
    // tests/elements/element-types-lib-check.test.ts, which runs with it off).
    // `getProperties().length === 0` keeps this from misfiring on an ordinary
    // object that also happens to carry call signatures (none do today).
    const callSignatures = type.getCallSignatures();
    if (callSignatures.length === 1 && type.getProperties().length === 0) {
      const sig = callSignatures[0];
      const params = sig.parameters.map((p) => {
        const pDecl = p.valueDeclaration;
        const pt = checker.getTypeOfSymbolAtLocation(p, pDecl ?? decl);
        const isParamNode = pDecl && ts.isParameter(pDecl);
        const rest = isParamNode && pDecl.dotDotDotToken ? '...' : '';
        const opt = isParamNode && (pDecl.questionToken || pDecl.initializer) ? '?' : '';
        return `${rest}${propKey(p.name)}${opt}: ${renderType(pt, pDecl ?? decl, seen)}`;
      });
      const ret = renderType(sig.getReturnType(), decl, seen);
      return `(${params.join(', ')}) => ${ret}`;
    }
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
    // A generic LIB type instantiated with a non-lib type argument — the one
    // that matters in practice is `Promise<X>` inside a function-valued prop
    // member (e.g. `store.list: () => Promise<ConversationSummary[]>`, reached
    // via the call-signature branch above). `Promise` itself is a lib symbol
    // (isLibSym true, so it never reaches the object-with-properties branch
    // above and its own `then`/`catch`/`finally` members are never expanded —
    // correctly), but a bare `checker.typeToString` still prints its type
    // ARGUMENT by name only, with the same invisible-in-a-no-imports-.d.ts
    // problem the Record<string, X> branch above exists to avoid.
    //
    // Only reconstruct when a type argument actually NEEDS it. `typeToString`
    // is otherwise the better renderer for a lib generic: it elides a type
    // argument that equals its parameter's default (`AsyncIterable<string>`,
    // not the fully-reified `AsyncIterable<string, any, any>`), a nicety
    // `checker.getTypeArguments` does not preserve (it always returns every
    // parameter, defaults included). Reconstructing unconditionally regressed
    // exactly that case — caught in review, not by any test, because nothing
    // here asserts the FULL rendered string for every prop, only that it
    // compiles self-contained (element-types-lib-check.test.ts), and
    // `AsyncIterable<string, any, any>` still compiles fine. So the guard is
    // "does any type argument, anywhere in its own expansion, name a
    // non-lib type" -- checked with `needsSelfContainment` below -- not "is
    // this a lib generic at all".
    if (
      sym &&
      isLibSym(sym) &&
      type.flags & ts.TypeFlags.Object &&
      type.objectFlags & ts.ObjectFlags.Reference &&
      !checker.getIndexInfoOfType(type, ts.IndexKind.String)
    ) {
      const typeArgs = checker.getTypeArguments(type);
      if (typeArgs.length && typeArgs.some(needsSelfContainment)) {
        return `${name}<${typeArgs.map((a) => renderType(a, decl, seen)).join(', ')}>`;
      }
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
