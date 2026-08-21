/**
 * Repair a document that arrived DOUBLE-ESCAPED in a tool call.
 *
 * THE DEFECT THIS EXISTS FOR (captured, not theorised — see
 * `.superpowers/sdd/2026-08-20-rung-4-builder/w7-evidence/t2-14.sse`): a small
 * model asked for a whole HTML file inside a JSON tool argument sometimes
 * escapes the file a second time. The provider's JSON is well formed and
 * `JSON.parse` succeeds, so nothing upstream can notice — but the string it
 * yields holds the two characters `\` `n` everywhere a newline belongs:
 *
 *   "<!doctype html>\\n<html>\\n<head>\\n    <title>Welcome to Our Coffee Shop</title>"
 *          ^^ backslash + n, in the parsed string, not an escape sequence
 *
 * Rendered, those backslash-n pairs are page TEXT: the body shows runs of
 * `\n\n\n \n \n\n\n`, which is exactly what the owner's turn 2 showed.
 *
 * WHY A HEURISTIC IS SAFE HERE. The tell is not "contains a backslash-n" — a
 * legitimate page may carry one inside a `<script>` string or a `<pre>`. The
 * tell is that the document contains NO REAL LINE BREAK AT ALL while carrying
 * several escaped ones: a hand-written or model-written page either has real
 * newlines, or is minified and then has no `\n` escapes to speak of. Both
 * conditions have to hold, and the escape count has to clear MIN_ESCAPES, before
 * anything is rewritten. A page that fails either test is returned untouched.
 *
 * DECIDE LOUDLY: the caller is told whether a repair happened, and says so.
 */

/**
 * How many escaped newlines a newline-less document must carry before we accept
 * it as double-escaped. A one-line page with one or two `\n` inside a script
 * string is plausible; one with five is a whole file that lost its line breaks.
 */
const MIN_ESCAPES = 5;

const UNESCAPE: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
};

/**
 * Undo ONE level of JSON string escaping, in a single left-to-right pass so a
 * genuine escaped backslash (`\\` + `n`) survives as a backslash followed by the
 * letter n rather than being turned into a newline by a second pass.
 */
function unescapeOnce(text: string): string {
  return text.replace(/\\(.)/g, (_match, char: string) => UNESCAPE[char] ?? char);
}

export type PageHtmlRepair = {
  html: string;
  /** True when the document was double-escaped and has been unescaped once. */
  repaired: boolean;
};

export function repairPageHtml(code: string): PageHtmlRepair {
  if (/[\n\r]/.test(code)) return { html: code, repaired: false };
  const escapes = code.match(/\\n/g);
  if (!escapes || escapes.length < MIN_ESCAPES) return { html: code, repaired: false };
  return { html: unescapeOnce(code), repaired: true };
}
