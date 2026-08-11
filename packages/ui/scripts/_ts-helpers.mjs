// Shared TypeScript-compiler helpers for the API extractors
// (gen-element-api.mjs for web-component facades, gen-component-api.mjs for the
// SolidJS/UI components). Both walk a `ts.Program`, read a Props/Events type, and
// render members to a self-contained, fully-expanded display string.
//
// `createTsHelpers(program, checker, { importable })` returns the helper set
// bound to that program/checker so each generator keeps a single parse.

import ts from 'typescript';

// Friendly element name shared by the React/Solid wrappers, story titles, and the
// API tab. KaiArtifactElement -> Artifact. All element tags start `kai-`, so the
// className always starts `Kai`.
export const displayNameFromClass = (className) =>
  className.replace(/^Kai/, '').replace(/Element$/, '');

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
    if (type.isUnion()) return [...new Set(type.types.map((t) => renderType(t, decl, seen)))].join(' | ');
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
        const t = checker.getTypeOfSymbolAtLocation(s, s.valueDeclaration ?? decl);
        const opt = s.flags & ts.SymbolFlags.Optional ? '?' : '';
        return `${s.name}${opt}: ${renderType(t, decl, next)}`;
      });
      return `{ ${props.join('; ')} }`;
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
        return `${s.name}${opt}: ${renderType(pt, s.valueDeclaration)}`;
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
