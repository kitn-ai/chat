// SEARCH NEEDLES for the pack's self-audit, one per invariant wrong/right pair,
// each carrying the TIER that says how far it actually reaches.
//
// WHY THESE ARE HAND-AUTHORED, AND WHY THEY ARE MACHINE-CHECKED
// -------------------------------------------------------------
// The first version of the self-audit searched for the `wrong` form VERBATIM.
// That is zero-false-positive by construction and has almost no recall: rename
// the variable and the check goes quiet. The obvious fix -- derive a short
// needle mechanically, say "everything up to the first `(`" -- was measured
// against these actual pairs and produces `el.setAttribute(`, `cards.setAttribute(`
// and `await fetch(`, each of which fires on CORRECT code. A checklist item that
// flags correct output is worse than a missing one.
//
// So the needles are authored by hand, in the middle band: shorter than the full
// line, long enough to fire on nothing the catalog itself recommends.
//
// THE TIER IS THE PART THAT KEPT DRIFTING. The page tells the agent how much a
// needle covers, and that claim was authored prose over a machine-checked table
// -- the pairing that rots. It had already rotted twice: `chat.conversations`
// was filed as surviving anything (a rename kills it) and `.innerHTML = part.`
// was in no tier at all. A guard that only caught an OMITTED needle could not
// see a MISPLACED one, which is the drift it was written for.
//
// So the tier now lives beside the needle and is CHECKED against transform
// corpora, not asserted:
//
//   `rename-proof`  -- survives QUOTE_TRANSFORMS *and* RENAME_TRANSFORMS.
//   `literal-bound` -- survives QUOTE_TRANSFORMS, and demonstrably FAILS at
//                      least one rename. Checked in both directions, so a needle
//                      that quietly became rename-proof is flagged too: the page
//                      would then be understating, which is still a claim that
//                      does not match the code.
//
// Three properties are then checked rather than trusted, because "I was careful"
// is exactly the assurance this repo has learned not to accept:
//
//   1. every needle appears in its OWN `wrong` form;
//   2. every needle appears in ZERO `right` forms across ALL invariants, in
//      every quote variant -- widening is how a false positive gets in;
//   3. every needle's TIER holds against the corpora.
//
// The pack refuses to build if any of the three fails, and `--self-test`
// watches each fail.

/** @typedef {{ needle: string, tier: 'rename-proof' | 'literal-bound', note?: string }} NeedleRecord */

/** @type {Record<string, NeedleRecord>} */
export const NEEDLE_TABLE = {
  // `.push(` on the array or on a part list: mutation, which never notifies.
  'reactivity-two-halves#0': { needle: '.messages.push(', tier: 'literal-bound' },
  'reactivity-two-halves#1': { needle: '.parts.push(', tier: 'rename-proof' },
  // The property NAME is the discriminator: `messages` and `policy` are
  // scalar:false, so putting either in an attribute is wrong however it is
  // spelled. A bare `setAttribute(` would fire on every legitimate scalar.
  'props-not-attributes#0': { needle: "setAttribute('messages'", tier: 'literal-bound' },
  'props-not-attributes#1': { needle: "setAttribute('policy'", tier: 'rename-proof' },
  // Delegation targets. `document` is a global, so that one cannot be renamed
  // away; the wrapper form has no general signature and stays narrow.
  'events-non-bubbling#0': { needle: "document.addEventListener('kai-", tier: 'rename-proof' },
  'events-non-bubbling#1': { needle: "wrapper.addEventListener('kai-", tier: 'literal-bound' },
  // Data on the element that displays the conversation rather than the one that
  // owns the list, and the listener on the wrong side of the wiring edge.
  'host-coordinates#0': { needle: 'chat.conversationRows', tier: 'literal-bound' },
  'host-coordinates#1': { needle: "chat.addEventListener('kai-conversation-select'", tier: 'literal-bound' },
  // Model text into an HTML sink.
  'untrusted-model-output#0': { needle: '.innerHTML = part.', tier: 'literal-bound' },
  // The UNGUARDED window.open: the right form is `'_blank', 'noopener,noreferrer')`,
  // so the closing paren straight after `'_blank'` is exactly the missing-hardening
  // signature. No trailing `;`: review measured `window.open(card.url, "_blank")`
  // missing on that alone.
  'untrusted-model-output#1': { needle: "'_blank')", tier: 'rename-proof' },
  // An href taking a model URL with no check: `.url}>` closes the attribute
  // immediately, where the right form continues into `rel=`.
  'untrusted-model-output#2': { needle: '.url}>', tier: 'rename-proof' },
  // A hand-rolled SSE reader: nothing the kit recommends splits on the frame
  // prefix.
  'kit-parses-consumer-fetches#0': { needle: "'data: '", tier: 'rename-proof' },
  // A provider key concatenated into a browser request. Deliberately NOT
  // `api.openai.com`: a scaffolded BACKEND route calls that host legitimately,
  // so it would fire on correct output for S2 and S5.
  'kit-parses-consumer-fetches#1': { needle: "Bearer ' + apiKey", tier: 'literal-bound' },
  // Guessing at load order. `setTimeout(` and `'DOMContentLoaded'` alone are both
  // legitimate for other purposes, so these stay narrow on purpose.
  'upgrade-race#0': {
    needle: 'setTimeout(() => { chat.',
    tier: 'literal-bound',
    note: 'near-verbatim on purpose: `setTimeout` is legitimate for other work, so nothing shorter separates the mistake from correct code',
  },
  'upgrade-race#1': {
    needle: "'DOMContentLoaded', () => { chat.",
    tier: 'literal-bound',
    note: 'near-verbatim on purpose: `DOMContentLoaded` is legitimate for other work',
  },
};

/** The needle strings alone, for callers that only want the search text. */
export const NEEDLES = Object.fromEntries(Object.entries(NEEDLE_TABLE).map(([k, v]) => [k, v.needle]));

/**
 * QUOTE STYLE IS NOT PART OF THE MISTAKE. Every needle above is written with
 * single quotes because the catalog's examples are, but a formatter that prefers
 * double quotes turns `setAttribute('messages'` into `setAttribute("messages"`
 * and the search goes quiet on identical code. Review measured that: four of the
 * quoted needles missed every double-quoted re-spelling of their own mistake.
 *
 * So a needle MATCHES in either quote style. `variantsOf` is the one derivation
 * of that, shared by the verifier, the page and the test, because the page must
 * print exactly what the verifier proved safe.
 */
export function variantsOf(needle) {
  if (!needle.includes("'") && !needle.includes('"')) return [needle];
  return [...new Set([needle.replace(/"/g, "'"), needle.replace(/'/g, '"')])];
}

/** Re-spellings that change nothing about the mistake. */
export const QUOTE_TRANSFORMS = [
  ['as authored', (s) => s],
  ['double-quoted', (s) => s.replace(/'/g, '"')],
  ['no trailing semicolon', (s) => s.replace(/;\s*$/, '')],
  ['double-quoted, no semicolon', (s) => s.replace(/'/g, '"').replace(/;\s*$/, '')],
];

/**
 * Identifiers a consumer would plausibly name differently. `document` is
 * deliberately absent: it is a global, so "renaming" it is not a re-spelling of
 * the same code. The tier figures depend on this set, which is why it lives here
 * as the ONE definition rather than being described in prose somewhere.
 */
export const RENAMES = {
  chat: 'thread',
  el: 'node',
  cards: 'cardsEl',
  wrapper: 'container',
  source: 'citation',
  part: 'chunk',
  apiKey: 'token',
  messages: 'history',
  card: 'envelope',
};

export const RENAME_TRANSFORMS = [
  ['receivers renamed', (s) => s.replace(/\b[A-Za-z_$][\w$]*\b/g, (w) => RENAMES[w] ?? w)],
  [
    'receivers renamed, double-quoted',
    (s) => s.replace(/\b[A-Za-z_$][\w$]*\b/g, (w) => RENAMES[w] ?? w).replace(/'/g, '"'),
  ],
];

const matches = (needle, text) => variantsOf(needle).some((v) => text.includes(v));

/** Survives every transform in `corpus` when applied to `wrong`? */
export function survives(needle, wrong, corpus) {
  return corpus.every(([, f]) => matches(needle, f(wrong)));
}

/**
 * All three properties, checked against the real records. Returns a list of
 * problems; empty means clean.
 */
export function verifyNeedles(invariants, table = NEEDLE_TABLE) {
  const problems = [];
  const allRights = invariants.flatMap((inv) => inv.examples.map((ex) => ({ id: inv.id, right: ex.right })));
  const seen = new Set();

  for (const inv of invariants) {
    for (let i = 0; i < inv.examples.length; i++) {
      const key = `${inv.id}#${i}`;
      const rec = table[key];
      if (!rec) {
        problems.push(`no search needle for ${key}. Every wrong/right pair needs one, or that mistake is unsearchable.`);
        continue;
      }
      seen.add(key);
      const { needle, tier } = rec;
      const wrong = inv.examples[i].wrong;

      // 1. Present in its own wrong form. At least one variant -- the authored
      //    one, in practice. Requiring ALL of them would be wrong: the
      //    double-quoted variant is for output the catalog does not contain.
      if (!matches(needle, wrong)) {
        problems.push(`${key}: the needle ${JSON.stringify(needle)} does not appear in its own wrong form.`);
      }

      // 2. Absent from every right form, in every variant.
      for (const r of allRights) {
        for (const v of variantsOf(needle)) {
          if (r.right.includes(v)) {
            problems.push(
              `${key}: the needle variant ${JSON.stringify(v)} FIRES ON A RIGHT FORM (${r.id}). A checklist item that flags correct output is worse than a missing one.`,
            );
          }
        }
      }

      // 3. The TIER's promise holds, in both directions.
      const survivesQuotes = survives(needle, wrong, QUOTE_TRANSFORMS);
      const survivesRenames = survives(needle, wrong, RENAME_TRANSFORMS);
      if (!survivesQuotes) {
        problems.push(
          `${key}: ${JSON.stringify(needle)} does not survive a re-spelling of its own mistake, so it is below every tier the page offers.`,
        );
      }
      if (tier === 'rename-proof' && !survivesRenames) {
        problems.push(
          `${key}: ${JSON.stringify(needle)} is filed as rename-proof but a renamed spelling of its own mistake slips past it. The page would OVERSTATE what it catches.`,
        );
      }
      if (tier === 'literal-bound' && survivesRenames) {
        problems.push(
          `${key}: ${JSON.stringify(needle)} is filed as literal-bound but survives every rename. The page would UNDERSTATE it — still a claim that does not match the code.`,
        );
      }
      if (tier !== 'rename-proof' && tier !== 'literal-bound') {
        problems.push(`${key}: unknown tier ${JSON.stringify(tier)}.`);
      }
    }
  }
  for (const key of Object.keys(table)) {
    if (!seen.has(key)) problems.push(`dangling needle ${key}: no such invariant example.`);
  }
  return problems;
}

/** POSITIVE CONTROL: every direction of verifyNeedles watched failing. */
export function selfTestNeedles() {
  const probe = [{ id: 'zz', examples: [{ wrong: 'el.innerHTML = part.text;', right: 'el.textContent = part.text;' }] }];
  const rec = (needle, tier) => ({ 'zz#0': { needle, tier } });
  const results = [];
  const fires = (t, s) => verifyNeedles(probe, t).some((p) => p.includes(s));

  results.push(['a missing needle is reported', fires({}, 'no search needle for zz#0')]);
  results.push([
    'a needle absent from its own wrong form is reported',
    fires(rec('nowhere-in-the-wrong-form', 'literal-bound'), 'does not appear in its own wrong form'),
  ]);
  results.push([
    'a needle that fires on a right form is reported',
    fires(rec('part.', 'literal-bound'), 'FIRES ON A RIGHT FORM'),
  ]);
  // The widening itself is checked: a needle whose OTHER quote variant collides
  // with a right form must be rejected, or quote-agnosticism is how a false
  // positive gets in.
  results.push([
    'a needle whose other quote variant fires on a right form is reported',
    verifyNeedles([{ id: 'zz', examples: [{ wrong: "f('a')", right: 'f("a")' }] }], {
      'zz#0': { needle: "f('a')", tier: 'literal-bound' },
    }).some((p) => p.includes('FIRES ON A RIGHT FORM')),
  ]);
  results.push([
    'a needle matches the same mistake spelled with double quotes',
    variantsOf("setAttribute('messages'").includes('setAttribute("messages"'),
  ]);
  // THE TIER CHECK, both directions. This is the drift the omission guard could
  // not see: a needle moved into a tier whose promise a measurement falsifies.
  results.push([
    'a needle OVERSTATED as rename-proof is reported',
    fires(rec('.innerHTML = part.', 'rename-proof'), 'OVERSTATE'),
  ]);
  results.push([
    'a needle UNDERSTATED as literal-bound is reported',
    fires({ 'zz#0': { needle: '.innerHTML =', tier: 'literal-bound' } }, 'UNDERSTATE'),
  ]);
  results.push(['a dangling needle is reported', fires({ ...rec('.innerHTML', 'literal-bound'), 'zz#9': { needle: 'x', tier: 'literal-bound' } }, 'dangling needle zz#9')]);
  results.push(['a sound needle is accepted', verifyNeedles(probe, rec('.innerHTML = part.', 'literal-bound')).length === 0]);
  return results;
}
