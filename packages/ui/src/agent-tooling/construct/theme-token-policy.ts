/**
 * The construct format's theme-token policy: WHICH `--kai-*` knob names
 * `theme.tokens` may carry, and what a VALUE is allowed to look like.
 *
 * Names — derived, not typed (repo rule). The allow-list is the theme
 * studio's own token catalog (`studioTokens()`), which is itself
 * drift-guarded against theme.css: tests/styles/theme-studio-coverage.test.ts
 * derives every `--kai-*` name theme.css wires (the same `var(--kai-…`
 * anchor the MCP theme tool scans by — src/agent-tooling/mcp/tools/theme.ts)
 * and fails CI if the catalog is missing one. Importing the catalog rather
 * than re-scanning theme.css here keeps this module free of `?raw` CSS
 * imports, which scripts/gen-construct-schema.mjs's esbuild bundling of
 * schema.ts cannot resolve — and it also covers the two knobs wired in
 * src/elements/styles.css rather than theme.css (`--kai-font-base`,
 * `--kai-tracking`), which a theme.css-only scan would wrongly reject even
 * though the builder's embedded ThemeStudio posts both.
 *
 * Values — two emission paths, one conservative posture. Light tokens (and
 * radius/fonts) ride `ctx.element.style.setProperty(name, value)` in the
 * emitted facade: the value is an opaque JS string, JSON.stringify'd at its
 * one interpolation site, so it can never break out into CSS text at all.
 * Dark tokens are different: they land inside generated CSS TEXT (a
 * `.dark { … }` rule in the emitted shadow `<style>` — see codegen.ts's
 * emitElement for why setProperty cannot express "dark only"), so their
 * values MUST be constrained the way the generated `:host` contrast block
 * already is (it only ever interpolates a computed `#000000`/`#ffffff`).
 * `themeTokenValueProblem` is that constraint, applied to EVERY tokens
 * value at the schema doorway for uniform hygiene: printable ASCII,
 * bounded length, no braces/semicolons/backslashes (the declaration- and
 * rule-breakout characters — a CSS escape like `\7b` cannot fabricate a
 * structural `{` token, but rejecting the backslash outright costs no real
 * value), no comment open/close sequences, balanced parentheses (an
 * unclosed `(` would swallow the following declarations). Real theme
 * values — `hsl(240 5.9% 10%)`, `color-mix(in srgb, …)`, `0.6rem`,
 * `"SF Mono", Menlo, monospace` — all pass.
 */
import { studioTokens } from '../../theme-studio-app/theme-tokens';

/** Every `--kai-*` knob name `theme.tokens` may carry. */
export const KNOWN_THEME_TOKENS: ReadonlySet<string> = studioTokens();

/** Cheap length bound — longer than any real token value (a full font stack
 *  is well under half of this), short enough that nothing structured hides
 *  inside a value. */
export const THEME_TOKEN_VALUE_MAX = 256;

/**
 * Why `value` is not acceptable as a theme-token value, or null when it is.
 * See the module header for the posture; the message is author-facing (it
 * comes back through validateConstruct with a path).
 */
export function themeTokenValueProblem(value: string): string | null {
  if (value.length === 0) return 'must not be empty';
  if (value.length > THEME_TOKEN_VALUE_MAX)
    return `too long (${value.length} > ${THEME_TOKEN_VALUE_MAX} characters)`;
  if (!/^[\x20-\x7E]+$/.test(value)) return 'must be printable ASCII with no line breaks';
  if (/[{};\\]/.test(value)) return 'must not contain braces, semicolons or backslashes';
  if (value.includes('/*') || value.includes('*/'))
    return 'must not contain CSS comment sequences';
  let depth = 0;
  for (const ch of value) {
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth < 0) return 'unbalanced parentheses';
    }
  }
  if (depth !== 0) return 'unbalanced parentheses';
  return null;
}
