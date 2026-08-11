// One place that turns a raw tsc diagnostic into a { kind, severity } verdict.
//
// It lives in its own module so the self-test can drive it directly. The rules
// below decide what gates CI, and a severity threshold nudged in the wrong
// direction is invisible in a green run — which is exactly the class of change
// that has to be probed rather than trusted.

/** TS widened a string/number/boolean literal and it no longer fits a kit union.
 *  Matched on the FLATTENED diagnostic chain, so the elaboration at the end of a
 *  nested "Type 'X' is not assignable to type 'Y'" cascade is what is read. */
const WIDENING = /Type '(?:string|number|boolean)' is not assignable to type '"/;

/** Languages a reader actually runs a type-checker over. Everything else is a
 *  `js` / `jsx` / `html` `<script>` / Vue / Svelte block: correct JavaScript with
 *  no compiler behind it. */
const TYPED_LANGS = new Set(['ts', 'tsx']);

/**
 * @param {{ origin: unknown, syntactic?: boolean, message: string }} finding
 * @param {string} lang  the fenced block's language (`ts`, `tsx`, `js`, `html-script`, …)
 * @returns {{ kind: string, severity: 'high'|'medium'|'advisory' }}
 */
export function classifyCompileFinding(finding, lang) {
  const typed = TYPED_LANGS.has(lang);

  // A distinct, very common class worth counting on its own: the snippet writes
  // `role: 'user'` in a plain object, TS widens it to `string`, and the kit's
  // prop wants `'user' | 'assistant'`.
  //
  // In a TS block that is real drift: a reader who copies it does not compile,
  // and the fix is the kit's own exported `ChatMessage`. It is still not an API
  // MISMATCH, so it is counted separately rather than folded in with genuinely
  // wrong props.
  //
  // In an UNTYPED block it is not a finding at all. `{ role: 'user' }` in a
  // ```js fence is correct JavaScript that runs correctly; nothing type-checks
  // it, and there is no edit that would "fix" it short of turning a vanilla-JS
  // example into a TypeScript one. Gating on it means editing correct docs to
  // appease the linter, which is how a linter gets switched off. Advisory.
  //
  // This downgrade is narrow ON PURPOSE and does not extend to shape drift: a
  // snippet whose message object is genuinely wrong for the kit (a missing or
  // misspelled property, a removed field) produces a different diagnostic —
  // "Property 'parts' is missing…", "Object literal may only specify known
  // properties…" — which is NOT widening and still lands `kit-type-error`/high
  // in an untyped block. The self-test probes both halves.
  if (finding.origin && WIDENING.test(finding.message)) {
    return { kind: 'literal-widening', severity: typed ? 'high' : 'advisory' };
  }
  // The offending type was declared under packages/ui: the snippet disagrees
  // with the shipped API. Gating regardless of the block's language.
  if (finding.origin) return { kind: 'kit-type-error', severity: 'high' };
  // Does not parse under any interpretation. Not kit drift, but not publishable.
  if (finding.syntactic) return { kind: 'snippet-syntax', severity: 'medium' };
  // A type error that traces back to the reader's own code or an uninstalled
  // third-party package. Noise by construction; reported, never gating.
  return { kind: 'snippet-type-error', severity: 'advisory' };
}

export { WIDENING, TYPED_LANGS };
