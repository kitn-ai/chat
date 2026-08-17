import ts from 'typescript';

/**
 * The `Labs/…` title a story file REGISTERS: the `title` property of its
 * default-exported meta object, parsed rather than matched.
 *
 * ★ WHY IT IS SPELLED THAT PRECISELY. Three text-based versions of this question
 * shipped and each was defeated, and the fourth — a parse that was still too
 * broad — was defeated too:
 *
 *  1. A raw regex over file text counted PROSE as a registration. Renaming every
 *     real `Labs/Proofs` meta title across all six proof-*.stories.tsx left the
 *     `Proofs` inventory row resolving, kept alive by one comment.
 *  2. A hand-rolled comment stripper fixed that and introduced a worse bug. JSX
 *     text like `Don't have an account?` put the scanner into single-quote state,
 *     which it never left, so every `//` after it survived stripping. Live in
 *     three story files; appending ONE comment line to one of them made an
 *     invented `GHOSTPROBE` row resolve at exit 0.
 *  3. The equivalence guard between the two copies of that stripper could not
 *     see it: both carried the identical bug, so they agreed perfectly.
 *  4. Parsing every `title:` in the file — the first version of THIS function —
 *     was still wrong. A `title` nested in a story's `args` is not a
 *     registration: `export const S = { args: { title: 'Labs/Apps' } };` in a
 *     non-app story conjured a phantom app that satisfied this lint and
 *     surfaces.test.ts together, with no comment involved at all.
 *
 * So the rule is the meta's own `title`, and nothing else. Comments are TRIVIA
 * and never nodes; apostrophes, escapes and template literals are the real
 * lexer's problem; and a title that is not the meta's is not a registration.
 * Single-quoted, double-quoted and untemplated-backtick spellings are all read.
 *
 * REGISTERED COPY: `scripts/lint-catalog-drift.mjs` carries an equivalent
 * `readLabsTitles`, because a Node `.mjs` cannot import a `.ts` at runtime.
 * `tests/scripts/catalog-drift-guard-wiring.test.ts` imports both and asserts
 * they agree over every story file in the tree plus adversarial inputs. Note
 * what that guard is worth: it catches DIVERGENCE, and it is blind by
 * construction to a bug both copies share — it stayed green through defects 2
 * AND 4 above, both of which were present in both copies at once.
 */
export function readLabsTitles(text: string, fileName = 'story.tsx'): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const meta = metaObject(source);
  if (!meta) return [];
  const titles: string[] = [];
  for (const prop of meta.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
    if (key !== 'title') continue;
    const init = prop.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      if (init.text.startsWith('Labs/')) titles.push(init.text);
    }
  }
  return titles;
}

/**
 * The story file's DEFAULT-EXPORTED meta object, or null.
 *
 * Walking every `title:` in the file was the narrower defect: a `title` nested
 * in a story's `args` is not a registration, and Storybook never reads it as
 * one. Measured before this existed, both exit 0:
 * `export const GhostProbeStory = { args: { title: 'Labs/GHOSTPROBE' } };`
 * made an invented inventory row resolve, and the `Labs/Apps` spelling of the
 * same shape produced a PHANTOM app that satisfied the lint and
 * surfaces.test.ts together — the exact both-sides-green shape this guard
 * exists to prevent, reached without a single comment.
 *
 * Restricting to the meta is a measured NO-OP on the clean tree: the title set
 * and the nine `Labs/Apps` files are identical by set difference in both
 * directions.
 *
 * Handles the two shapes in the tree and their wrappers:
 * `const meta = {…} satisfies Meta; export default meta;` and
 * `export default {…} as Meta;` — `satisfies`, `as`, angle-bracket assertions
 * and parentheses are all unwrapped.
 */
function metaObject(source: ts.SourceFile): ts.ObjectLiteralExpression | null {
  const unwrap = (expr: ts.Expression | undefined): ts.Expression | undefined => {
    let cur = expr;
    while (
      cur &&
      (ts.isAsExpression(cur) ||
        ts.isSatisfiesExpression(cur) ||
        ts.isParenthesizedExpression(cur) ||
        ts.isTypeAssertionExpression(cur))
    ) {
      cur = cur.expression;
    }
    return cur;
  };
  const topLevel = new Map<string, ts.Expression>();
  let defaultExport: ts.Expression | undefined;
  for (const stmt of source.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) topLevel.set(d.name.text, d.initializer);
      }
    } else if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      defaultExport = stmt.expression;
    }
  }
  let expr = unwrap(defaultExport);
  if (expr && ts.isIdentifier(expr)) expr = unwrap(topLevel.get(expr.text));
  return expr && ts.isObjectLiteralExpression(expr) ? expr : null;
}
