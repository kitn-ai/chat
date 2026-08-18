// The ELEMENT-layer diagnostic events: what the `kai-*` custom elements SAW a
// consumer do to them.
//
// The wire events answer "did the data arrive". These answer the other half —
// "the data is right and the UI still is not updating" — which is a different
// failure with a different cause and, until now, no evidence at all. All three
// causes are documented in root CLAUDE.md's `kai-` contract section, and every
// one of them is silent by construction:
//
//   1. An array or object prop set as an HTML ATTRIBUTE. `component-register`
//      parses attributes with a `JSON.parse` whose `catch` returns the raw
//      string, so `el.setAttribute('messages', arr)` assigns the literal text
//      `"[object Object],[object Object]"` to the property and pushes THAT into
//      the Solid signal. Nothing throws, nothing logs, nothing renders.
//   2. The SAME array reference handed back. solid-element creates one signal
//      per prop and sets it with `set(() => v)`; Solid's default equality is
//      `===`, so re-assigning the identical reference notifies nothing.
//   3. A NEW array whose items are all the previous item objects. The array
//      notifies, but the lists render through reference-keyed `<For>`s, so no
//      row is re-invoked and nothing on screen changes.
//
// ZERO IMPORTS, DELIBERATELY. These are type declarations only, so this file is
// erased at build. That is what lets `wire/diagnostics.ts` name them in its
// union without `wire/` acquiring a runtime dependency on `elements/` — which
// would be a real layering inversion, and would drag the element bundle into
// every consumer that only parses streams.
//
// METADATA ONLY, by the same rule the wire events follow: if a value comes from
// the model, the end user, or the app's data it is PAYLOAD; if it describes the
// shape, size, timing or identity of that value it is METADATA. A tag name, a
// prop name, a kind, a count and a length are all identity or shape. A prop's
// VALUE never appears in any field below — `valuePreview` is a shape
// description built from a closed vocabulary, never the text itself. Pinned by
// `element-diagnostics-payload.test.ts`, which plants a sentinel inside every
// prop value it sets and asserts it never reaches a serialized event.

/** The envelope, structurally identical to `WireDiagnosticBase`. Restated here
 *  rather than imported so this file keeps its zero-import property; the two are
 *  kept in step by `element-diagnostics.test.ts`, which asserts every emitted
 *  element event carries a `type` and a numeric `t`. */
export interface ElementDiagnosticBase {
  type: string;
  /** `Date.now()` at emission. */
  t: number;
}

/** Which contract was broken. A closed vocabulary, so a panel keys its own
 *  explanation off the kind and never needs prose from the kit. */
export type ElementViolationKind =
  /** A non-scalar prop received a value through the ATTRIBUTE channel. The
   *  attribute cannot carry an array or an object, so the property now holds a
   *  string and the element renders nothing. */
  | 'array-prop-as-attribute'
  /** A list prop was set to the array reference it already held. Solid compares
   *  with `===`, so this notified nothing — a no-op write. */
  | 'same-array-reference'
  /** A list prop received a NEW array of the SAME length whose every item is
   *  reference-identical to the previous array's. The array notified, but every
   *  row's identity is unchanged, so a reference-keyed `<For>` re-invokes none
   *  of them. The classic "I mutated the item and copied the array" case.
   *
   *  NOTE what this deliberately does NOT claim: the kit cannot know an item
   *  "changed" without comparing its CONTENT, and content is payload. So this
   *  reports the structurally knowable fact — an update that cannot render —
   *  and leaves the question of whether the consumer meant anything by it to
   *  the consumer, who is the only one who can answer it. */
  | 'mutated-in-place';

/** A consumer broke one of the three `kai-` contract rules on a live element. */
export interface ElementViolationEvent extends ElementDiagnosticBase {
  type: 'element.violation';
  kind: ElementViolationKind;
  /** The custom-element tag, e.g. `kai-chat`. */
  tag: string;
  /** The camelCase prop name, e.g. `messages`. */
  prop: string;
  /**
   * SHAPE of the offending value, never its content. `array-prop-as-attribute`
   * only. A closed vocabulary:
   *
   *   `[object Object]`      one object stringified into the attribute
   *   `[object Object] x N`  an array of N objects stringified — the common case
   *   `json:number`          the attribute held valid JSON, but a scalar
   *   `json:boolean`         "
   *   `json:null`            "
   *   `string(len=N)`        anything else: the LENGTH of the text, never the text
   *   `empty-attribute`      a bare attribute on a prop that needs a value
   */
  valuePreview?: string;
  /** Element count of the array involved. `same-array-reference` and
   *  `mutated-in-place` only. A length is shape, not content. */
  length?: number;
}

/** Which `kai-*` elements are DEFINED in this realm right now.
 *
 *  The question behind it is hydration: an SSR page whose markup contains
 *  `<kai-chat>` but whose element bundle never loaded shows empty boxes and no
 *  error, because an undefined custom element is a valid, inert HTMLElement.
 *  The SSR starters already answer this by hand for a hard-coded handful
 *  (`HydrationBadge.tsx`); this is the same answer over the whole manifest. */
export interface ElementRegistryEvent extends ElementDiagnosticBase {
  type: 'element.registry';
  /** Tags `customElements.get()` resolved. */
  defined: string[];
  /** Tags in the manifest that are NOT defined in this realm. Named for what it
   *  is rather than `undefined`, which is a miserable key to read in a panel. */
  notDefined: string[];
  /** `defined.length + notDefined.length`. Present so a panel can show "62 of
   *  79" without trusting itself to add up two arrays it may have truncated. */
  total: number;
}

export type ElementDiagnosticEvent = ElementViolationEvent | ElementRegistryEvent;
