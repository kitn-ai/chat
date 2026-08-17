import ts from 'typescript';

/**
 * Every `title:` value beginning with `Labs/` that a story file actually
 * REGISTERS — parsed, never matched.
 *
 * ★ WHY A PARSER AND NOT TEXT MATCHING. Three successive text-based versions of
 * this question shipped and each was defeated:
 *
 *  1. A raw regex over file text counted PROSE as a registration. Renaming every
 *     real `Labs/Proofs` meta title across all six proof-*.stories.tsx left the
 *     `Proofs` inventory row resolving, kept alive by one comment.
 *  2. A hand-rolled comment stripper fixed that case and introduced a worse one.
 *     JSX text like `Don't have an account?` put the scanner into single-quote
 *     string state, which it never left, so every `//` after it survived
 *     stripping. Live in the tree at the time in `proof-auth.stories.tsx` and
 *     `ui/pane-grid.stories.tsx`; appending ONE comment line to the first made
 *     an invented `GHOSTPROBE` inventory row resolve, reporting "27 inventory
 *     rows resolved clean" at exit 0.
 *  3. The equivalence guard between the two copies of that stripper could not
 *     see it, because both copies carried the identical bug and so agreed
 *     perfectly. Two implementations of the same mistake agree.
 *
 * The compiler API removes the class rather than the instance. Comments are
 * TRIVIA and are never nodes, so prose is excluded by construction rather than
 * by a scanner someone has to get right; apostrophes, escapes and template
 * literals are handled by the real lexer. This is the same reason
 * `scripts/lint-silent-drops.mjs` reads the MessagePart union through
 * `ts.createSourceFile` instead of a regex.
 *
 * Single-quoted, double-quoted and untemplated-backtick titles are all read,
 * closing a gap the regex had (it saw only single quotes).
 *
 * REGISTERED COPY: `scripts/lint-catalog-drift.mjs` carries an equivalent
 * `readLabsTitles`, because a Node `.mjs` cannot import a `.ts` at runtime.
 * `tests/scripts/catalog-drift-guard-wiring.test.ts` imports both and asserts
 * they agree over every story file in the tree plus adversarial inputs. Note
 * what that guard is and is not worth: it catches divergence, and it did NOT
 * catch the shared apostrophe bug above. Both delegating to the same parser is
 * what makes agreement meaningful now — the guard is the backstop, not the
 * reason to trust them.
 */
export function readLabsTitles(text: string, fileName = 'story.tsx'): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const titles: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name;
      const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
      if (key === 'title') {
        const init = node.initializer;
        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
          if (init.text.startsWith('Labs/')) titles.push(init.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return titles;
}
