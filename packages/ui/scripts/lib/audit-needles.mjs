// SEARCH NEEDLES for the pack's self-audit, one per invariant wrong/right pair.
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
// line, long enough to fire on nothing the catalog itself recommends. Two
// properties are then CHECKED rather than trusted, because "I was careful" is
// exactly the assurance this repo has learned not to accept:
//
//   1. every needle appears in its OWN `wrong` form -- so it is a real signature
//      of the mistake and not a typo;
//   2. every needle appears in ZERO `right` forms across ALL invariants -- so it
//      cannot fire on the code the pack recommends.
//
// `verifyNeedles()` enforces both at pack time and the pack refuses to build if
// either fails. `--self-test` watches it fail in both directions.
//
// RECALL VARIES, AND THE PAGE SAYS SO. Some mistakes have a clean signature that
// generalises across variable names (`.messages.push(`, `'_blank');`, `'data: '`).
// Others -- delegating from a wrapper, gating on a timer -- have no substring
// that separates the mistake from a legitimate use of the same API, so their
// needle stays close to the original line. Narrow and silent beats broad and
// wrong; the alternative is a checklist an agent learns to ignore.
export const NEEDLES = {
  // `.push(` on the array or on a part list: mutation, which never notifies.
  // Generalises across receiver names; the right forms are all spreads.
  'reactivity-two-halves#0': '.messages.push(',
  'reactivity-two-halves#1': '.parts.push(',
  // The property NAME is the discriminator: `messages` and `policy` are
  // scalar:false, so putting either in an attribute is wrong however it is
  // spelled. A bare `setAttribute(` would fire on every legitimate scalar.
  'props-not-attributes#0': "setAttribute('messages'",
  'props-not-attributes#1': "setAttribute('policy'",
  // Delegation targets. `document.addEventListener('kai-` catches the whole
  // class; the wrapper form has no general signature, so it stays narrow.
  'events-non-bubbling#0': "document.addEventListener('kai-",
  'events-non-bubbling#1': "wrapper.addEventListener('kai-",
  // Data on the element that displays the conversation rather than the one that
  // owns the list, and the listener on the wrong side of the wiring edge.
  'host-coordinates#0': 'chat.conversations',
  'host-coordinates#1': "chat.addEventListener('kai-conversation-select'",
  // Model text into an HTML sink.
  'untrusted-model-output#0': '.innerHTML = part.',
  // The UNGUARDED window.open: the right form is `'_blank', 'noopener,noreferrer')`,
  // so the closing paren straight after `'_blank'` is exactly the missing-hardening
  // signature, and it does not depend on the variable name.
  'untrusted-model-output#1': "'_blank');",
  // An href taking a model URL with no check: `.url}>` closes the attribute
  // immediately, where the right form continues into `rel=`.
  'untrusted-model-output#2': '.url}>',
  // A hand-rolled SSE reader: nothing the kit recommends ever splits on the
  // frame prefix.
  'kit-parses-consumer-fetches#0': "'data: '",
  // A provider key concatenated into a browser request. Deliberately NOT
  // `api.openai.com`: a scaffolded BACKEND route calls that host legitimately,
  // so it would fire on correct output for S2 and S5.
  'kit-parses-consumer-fetches#1': "Bearer ' + apiKey",
  // Guessing at load order. `setTimeout(` and `'DOMContentLoaded'` alone are
  // both legitimate for other purposes, so these stay narrow: it is the
  // property-set inside the deferred callback that is the mistake.
  'upgrade-race#0': 'setTimeout(() => { chat.',
  'upgrade-race#1': "'DOMContentLoaded', () => { chat.",
};

/**
 * Both properties, checked against the real records. Returns a list of problems;
 * empty means clean.
 */
export function verifyNeedles(invariants, needles = NEEDLES) {
  const problems = [];
  const allRights = invariants.flatMap((inv) => inv.examples.map((ex) => ({ id: inv.id, right: ex.right })));
  const seen = new Set();

  for (const inv of invariants) {
    for (let i = 0; i < inv.examples.length; i++) {
      const key = `${inv.id}#${i}`;
      const needle = needles[key];
      if (!needle) {
        problems.push(`no search needle for ${key}. Every wrong/right pair needs one, or that mistake is unsearchable.`);
        continue;
      }
      seen.add(key);
      if (!inv.examples[i].wrong.includes(needle)) {
        problems.push(`${key}: the needle ${JSON.stringify(needle)} does not appear in its own wrong form.`);
      }
      for (const r of allRights) {
        if (r.right.includes(needle)) {
          problems.push(
            `${key}: the needle ${JSON.stringify(needle)} FIRES ON A RIGHT FORM (${r.id}). A checklist item that flags correct output is worse than a missing one.`,
          );
        }
      }
    }
  }
  for (const key of Object.keys(needles)) {
    if (!seen.has(key)) problems.push(`dangling needle ${key}: no such invariant example.`);
  }
  return problems;
}

/** POSITIVE CONTROL: both directions of verifyNeedles watched failing. */
export function selfTestNeedles() {
  const probe = [
    { id: 'zz', examples: [{ wrong: "el.innerHTML = part.text;", right: 'el.textContent = part.text;' }] },
  ];
  const results = [];
  results.push([
    'a missing needle is reported',
    verifyNeedles(probe, {}).some((p) => p.includes('no search needle for zz#0')),
  ]);
  results.push([
    'a needle absent from its own wrong form is reported',
    verifyNeedles(probe, { 'zz#0': 'nowhere-in-the-wrong-form' }).some((p) => p.includes('does not appear in its own wrong form')),
  ]);
  results.push([
    'a needle that fires on a right form is reported',
    verifyNeedles(probe, { 'zz#0': 'part.' }).some((p) => p.includes('FIRES ON A RIGHT FORM')),
  ]);
  results.push(['a dangling needle is reported', verifyNeedles(probe, { 'zz#0': '.innerHTML', 'zz#9': 'x' }).some((p) => p.includes('dangling needle zz#9'))]);
  results.push(['a sound needle is accepted', verifyNeedles(probe, { 'zz#0': '.innerHTML = part.' }).length === 0]);
  return results;
}
