/**
 * GUARD — every NAMED type used by a `kai-*` element property must be importable
 * from the ROOT entry (`@kitn.ai/ui`).
 *
 * The generated `./elements` declarations and the React wrappers expand prop types
 * STRUCTURALLY — no imports, by design (see the `IMPORTS = {}` note in
 * scripts/gen-element-api.mjs: a relative import in a shipped `.d.ts` drags library
 * `.ts` source into a consumer's compilation). The cost is that a consumer who wants
 * to name the shape in their own code has nothing to import and falls back to
 * `NonNullable<KaiPromptInputElementProps['triggers']>`.
 *
 * So the shape must be reachable by NAME from the entry a React / Vue / Svelte /
 * vanilla consumer imports, which is "." (`src/index.ts`) — NOT "./solid", which
 * only Solid consumers pull in.
 *
 * The list is re-derived here from the facades with the TypeScript checker on every
 * run — there is no table to keep in sync — so a new element prop typed with a new
 * named interface fails this test until it is exported from `src/index.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const elementsDir = resolve(pkgRoot, 'src/elements');

// Same skip list as scripts/gen-element-api.mjs — infra/helpers, not facades.
const SKIP = new Set([
  'define.tsx', 'register.ts', 'register-impl.ts', 'css.ts', 'chat-types.ts', 'default-input.tsx',
]);
const facadeFiles = readdirSync(elementsDir)
  .filter((f) => /\.tsx?$/.test(f) && !/\.(stories|test)\.tsx?$/.test(f) && !SKIP.has(f))
  .map((f) => resolve(elementsDir, f));

const ROOT_ENTRY = resolve(pkgRoot, 'src/index.ts');

const tsconfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile(resolve(pkgRoot, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  pkgRoot,
);
const program = ts.createProgram([...facadeFiles, ROOT_ENTRY], { ...tsconfig.options, noEmit: true });
const checker = program.getTypeChecker();

const rootExports = new Set(
  checker
    .getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(ROOT_ENTRY)!)!)
    .map((s) => s.name),
);

const isLibType = (sym: ts.Symbol | undefined) =>
  (sym?.declarations ?? []).some((d) => d.getSourceFile().fileName.includes('node_modules/typescript/lib'));

/**
 * The declared NAME of an object/array-of-object type, or null for primitives,
 * plain unions and anonymous literals.
 *
 * Sees through the `undefined` an OPTIONAL property adds — `triggers?: TriggerDef[]`
 * has the type `undefined | TriggerDef[]`, a union, and the naive check bailed on
 * every union. That is why `TriggerDef` was invisible to this rule for as long as it
 * existed while `ChatMessage` (a required prop) was not.
 */
function namedTypeOf(type: ts.Type): string | null {
  let t = type;
  if (t.isUnion()) {
    const rest = t.types.filter(
      (x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)),
    );
    if (rest.length !== 1) return null;
    t = rest[0];
  }
  if (checker.isArrayType(t)) t = checker.getTypeArguments(t as ts.TypeReference)[0];
  if (!t || t.isUnion()) return null;
  const sym = t.aliasSymbol ?? t.getSymbol();
  const name = sym?.getName();
  if (!name || name === '__type' || isLibType(sym)) return null;
  if (!(t.flags & ts.TypeFlags.Object) || t.getProperties().length === 0) return null;
  return name;
}

/** `{ typeName -> ['kai-tag.prop', …] }` over every registered element. */
function namedPropTypes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const file of facadeFiles) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'defineWebComponent'
      ) {
        const tagArg = node.arguments[0];
        const propsNode = node.typeArguments?.[0];
        if (tagArg && ts.isStringLiteralLike(tagArg) && propsNode) {
          for (const s of checker.getTypeFromTypeNode(propsNode).getProperties()) {
            const decl = s.valueDeclaration ?? s.declarations?.[0];
            const name = namedTypeOf(checker.getTypeOfSymbolAtLocation(s, decl!));
            if (!name) continue;
            if (!out.has(name)) out.set(name, []);
            out.get(name)!.push(`${tagArg.text}.${s.name}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

describe('named kai-* prop types are importable from the root entry', () => {
  const found = namedPropTypes();

  it('finds the named prop types at all (the rule is not vacuous)', () => {
    // A regression that broke the checker walk would otherwise pass silently with
    // an empty set. Both a REQUIRED prop's type and an OPTIONAL prop's type must
    // show up — the optional case is the one that was being missed.
    expect(found.size).toBeGreaterThan(15);
    expect([...found.keys()]).toContain('ChatMessage'); // kai-chat.messages (required)
    expect([...found.keys()]).toContain('TriggerDef'); // kai-prompt-input.triggers (optional)
  });

  it('every one of them is exported from src/index.ts', () => {
    const missing = [...found.entries()]
      .filter(([name]) => !rootExports.has(name))
      .map(([name, uses]) => `${name} (used by ${uses.sort().join(', ')})`)
      .sort();
    expect(missing).toEqual([]);
  });
});
