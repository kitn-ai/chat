/**
 * Blank out `//` and block comments, preserving offsets and newlines.
 *
 * WHY THIS EXISTS. Anything that decides "is this story registered under
 * `Labs/X`?" by matching raw file text counts PROSE as a registration. Measured
 * on this tree, before the deriver stripped comments: renaming every real
 * `Labs/Proofs` meta title across all six proof-*.stories.tsx left the `Proofs`
 * inventory row resolving, kept alive by one comment at
 * proof-about.stories.tsx:9. Worse, in the other direction: a comment reading
 * `title: 'Labs/Apps'` added to command.stories.tsx makes surfaces.test.ts
 * DEMAND an inventory row for a phantom app that does not exist.
 *
 * ★ REGISTERED COPY, and a GUARDED one. `scripts/lint-catalog-drift.mjs`
 * carries a second implementation of this function, byte-identical in
 * behaviour. It is a copy on purpose and could not be a shared import:
 *   - a Node script (.mjs) cannot import a .ts at runtime, and
 *   - this file lives under `src/`, whose typecheck pass (tsconfig.json) has no
 *     `allowJs`, so importing the .mjs from here is a hard TS7016 — measured.
 *     Adding `allowJs` would loosen the pass that covers the SHIPPED library,
 *     and a hand-written `.d.mts` beside the .mjs is the option this repo has
 *     already rejected once (see the `allowJsIs` note in tsconfig.tests.json):
 *     it types an import by restating an implementation nothing then checks.
 * So the two cannot diverge silently: `tests/scripts/catalog-drift-guard-wiring.test.ts`
 * imports BOTH and asserts they agree character-for-character over every story
 * file in the tree plus a set of adversarial inputs. Change one, and that test
 * goes red naming the other.
 *
 * The scanner tracks string and template state so a `//` inside a literal (a
 * URL) is not mistaken for a comment. Where it does get confused it can only
 * blank out MORE than intended, which makes a real title stop resolving and
 * fails loudly — the safe direction. It cannot invent a title.
 */
export function stripComments(text: string): string {
  let out = '';
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') {
        state = 'line';
        out += '  ';
        i += 1;
        continue;
      }
      if (c === '/' && next === '*') {
        state = 'block';
        out += '  ';
        i += 1;
        continue;
      }
      if (c === "'") state = 'single';
      else if (c === '"') state = 'double';
      else if (c === '`') state = 'template';
      out += c;
      continue;
    }
    if (state === 'line') {
      if (c === '\n') {
        state = 'code';
        out += '\n';
      } else out += ' ';
      continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 1;
        continue;
      }
      out += c === '\n' ? '\n' : ' ';
      continue;
    }
    // Inside a string literal: copy through, honouring backslash escapes so an
    // escaped quote does not close it early.
    out += c;
    if (c === '\\') {
      out += text[i + 1] ?? '';
      i += 1;
      continue;
    }
    if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) {
      state = 'code';
    }
  }
  return out;
}
