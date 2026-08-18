// The ONE derivation of the `MessagePart` variant list, shared by
// `lint-silent-drops.mjs` and `gen-catalog.mjs` so the two can never disagree.
//
// This was moved here out of `lint-silent-drops.mjs` unchanged. It reads the
// union in `src/elements/chat-types.ts` through the TypeScript parser rather
// than restating the members, so a seventh variant is picked up with no edit
// here -- the same reason `verify:scaffold` derives its list from that file.
//
// Callers pass the source TEXT, not a path: the two callers anchor
// `chat-types.ts` differently (one off `--package-root`, one off its own
// location) and neither should have to agree with the other about that.
import ts from 'typescript';

export const UNION_NAME = 'MessagePart';

// A parse that yields fewer than this many variants means the declaration moved
// or changed shape and the caller is reading something else. This is a
// DEGRADATION FLOOR, not the variant count -- the union has more than this
// today, and raising it to match would turn a legitimate removal into a crash
// while catching nothing extra. It exists to catch a parse that silently
// collapsed to a couple of members.
export const MIN_VARIANTS = 4;

/** The declared variant literals of `MessagePart`, read from the type itself so
 *  a new member is picked up with no edit here. */
export function readVariants(text) {
  const sf = ts.createSourceFile(
    'chat-types.ts',
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const found = [];
  const visit = (node) => {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === UNION_NAME &&
      ts.isUnionTypeNode(node.type)
    ) {
      for (const member of node.type.types) {
        if (!ts.isTypeLiteralNode(member)) continue;
        for (const prop of member.members) {
          if (
            ts.isPropertySignature(prop) &&
            prop.name &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'type' &&
            prop.type &&
            ts.isLiteralTypeNode(prop.type) &&
            ts.isStringLiteral(prop.type.literal)
          ) {
            found.push(prop.type.literal.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}
