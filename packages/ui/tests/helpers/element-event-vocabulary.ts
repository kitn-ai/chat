// THE ALLOWLIST: every field of every `element.*` event must be drawn from a
// closed vocabulary. This is what makes "metadata only" a PROVABLE claim.
//
// WHY THIS EXISTS, AND WHY SENTINEL SEARCHING WAS NOT ENOUGH.
//
// The boundary was previously asserted by planting sentinels in prop values and
// grepping the serialized events for them. That is a BLOCKLIST: it can only
// catch a leak you thought to name, in the FORM you thought to name it. A
// verifier demonstrated the gap rather than arguing it -- mutating
// `classifyAttributeValue` to append a 12-character TAIL slice of the raw
// attribute leaks real consumer text on every violation, and the sentinel
// searches did not see it. Reproduced here before this file was written: of
// seven hostile inputs, six leaked their tail past `toContain` untouched
// (`k-plain-text`, `eak-appended`, `nterminated"`, …) and the search fired on
// exactly one -- the input that happened to be a REPETITION of the sentinel
// token, so its tail contained a whole copy by luck. The blocklist's only hit
// was an accident of sentinel design.
//
// Head-anchoring the sentinels (the first repair) fixes head slices and nothing
// else. Tail slices, middle slices, case changes, base64 and any encoding all
// still walk past. There is no sentinel design that closes an open set of leak
// shapes.
//
// So invert it. `classifyAttributeValue` already returns from a genuinely closed
// vocabulary -- two fixed markers, a type name, and a LENGTH -- and every other
// string an element event carries is either a fixed literal or a name drawn
// from a GENERATED artifact. Asserting membership catches every leak shape at
// once, including the ones nobody has imagined, and it does not depend on
// sentinel design at all.
//
// The sentinel tests stay: they are cheap and they document intent. This is what
// makes the claim true.
import { expect } from 'vitest';
import type { KaiDiagnosticEvent } from '../../src/wire/diagnostics';
import NON_SCALAR from '../../src/elements/element-nonscalar.json';
import { tags as MANIFEST_TAGS } from '../../src/elements/element-manifest.json';

const NON_SCALAR_PROPS: Record<string, string[]> = NON_SCALAR;
const MANIFEST_TAG_SET = new Set(Object.keys(MANIFEST_TAGS as Record<string, string>));

/**
 * The ONLY strings `valuePreview` may ever be.
 *
 * `json:` is restricted to what `JSON.parse` can actually yield as a scalar, not
 * to `\w+`: a loose `json:\w+` would happily accept a leak dressed as a type
 * name. If the implementation ever emits a fifth form, this goes red and
 * somebody has to think about whether the new form carries content.
 */
export const VALUE_PREVIEW_VOCABULARY =
  /^(?:empty-attribute|\[object Object\](?: x \d+)?|json:(?:number|boolean|string|null)|string\(len=\d+\))$/;

/** The closed set of violation kinds. */
export const VIOLATION_KINDS = new Set([
  'array-prop-as-attribute',
  'same-array-reference',
  'mutated-in-place',
]);

/** Exactly the keys each event type may carry. An unexpected key is a leak
 *  channel by definition -- it is a field nobody wrote an assertion for. */
const ALLOWED_KEYS: Record<string, Set<string>> = {
  'element.violation': new Set(['type', 't', 'kind', 'tag', 'prop', 'valuePreview', 'length']),
  'element.registry': new Set(['type', 't', 'defined', 'notDefined', 'total']),
};

const isElementEvent = (e: KaiDiagnosticEvent) => e.type.startsWith('element.');

/**
 * Assert one element event is entirely built from closed vocabularies.
 *
 * Every string is either a fixed literal, a shape drawn from
 * `VALUE_PREVIEW_VOCABULARY`, or a NAME read out of a generated artifact
 * (`element-nonscalar.json` / `element-manifest.json`). Nothing a consumer
 * supplies can reach any of them, which is the property the sentinel searches
 * were trying and failing to establish.
 */
export function assertElementEventVocabulary(event: KaiDiagnosticEvent): void {
  const e = event as unknown as Record<string, unknown>;
  const allowed = ALLOWED_KEYS[event.type];
  expect(allowed, `unknown element event type: ${event.type}`).toBeDefined();

  for (const key of Object.keys(e)) {
    expect(allowed.has(key), `unexpected key "${key}" on ${event.type}`).toBe(true);
  }
  expect(typeof e.t).toBe('number');

  if (event.type === 'element.violation') {
    expect(VIOLATION_KINDS.has(e.kind as string), `unknown kind: ${String(e.kind)}`).toBe(true);

    // `tag` and `prop` are NAMES from the generated non-scalar map -- the only
    // elements that install a check at all -- so both are closed sets, and
    // `prop` is closed *within* its tag rather than globally.
    const props = NON_SCALAR_PROPS[e.tag as string];
    expect(props, `tag not in element-nonscalar.json: ${String(e.tag)}`).toBeDefined();
    expect(props).toContain(e.prop as string);

    if ('valuePreview' in e) {
      expect(
        String(e.valuePreview),
        `valuePreview escaped the closed vocabulary: ${JSON.stringify(e.valuePreview)}`,
      ).toMatch(VALUE_PREVIEW_VOCABULARY);
    }
    if ('length' in e) expect(typeof e.length).toBe('number');
    return;
  }

  // element.registry
  expect(typeof e.total).toBe('number');
  for (const key of ['defined', 'notDefined'] as const) {
    const list = e[key] as unknown;
    expect(Array.isArray(list)).toBe(true);
    for (const tag of list as string[]) {
      expect(MANIFEST_TAG_SET.has(tag), `${key} carried a non-manifest tag: ${tag}`).toBe(true);
    }
  }
}

/**
 * Check every element event in a collection a test already gathered.
 *
 * Wired into each suite's `afterEach` over the array it was already collecting,
 * so EVERY element event the suite emits is checked -- including ones emitted by
 * tests written later, with nobody having to remember to ask. That automatic
 * reach is the property the sentinel searches never had.
 *
 * DELIBERATELY NOT A STANDING SUBSCRIBER. The obvious implementation -- subscribe
 * once at module load and check everything that arrives -- would leave the
 * emitter permanently ARMED, and several tests here exist to prove the opposite:
 * that with no subscriber nothing is emitted and the path costs a symbol read.
 * A watcher that quietly guaranteed a subscriber would turn each of those into a
 * test that cannot fail. Reading the array the suite already has costs nothing
 * and changes no state.
 */
export function assertElementEventsVocabulary(events: readonly KaiDiagnosticEvent[]): void {
  for (const e of events) if (isElementEvent(e)) assertElementEventVocabulary(e);
}
