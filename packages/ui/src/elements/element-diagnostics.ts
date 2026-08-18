// Element-layer observability: the OTHER half of "why isn't it updating".
//
// The wire diagnostics answer "did the data arrive". Everything here answers the
// question a developer asks NEXT, after they have confirmed in the console that
// `el.messages` holds exactly what they expect and the screen still shows the
// old thing. All three causes are contract violations documented in root
// CLAUDE.md, and all three are silent by construction rather than by oversight.
// See `./diagnostic-events.ts` for what each one is and why it is detectable.
//
// WHERE THIS HOOKS, AND WHY THERE. `defineWebComponent` is the single choke
// point -- every `kai-*` element registers through it, and `elements/slots.test.ts`
// already fails the build if a registered tag has no `defineWebComponent` call.
// So one install site covers all 79 registered elements with no per-element
// work and no list to keep in step.
//
// OBSERVE-ONLY, AND STRUCTURALLY SO. Two of the three hooks are wrappers around
// prototype methods, which is the risky shape, so the discipline is fixed:
//
//   * the inner method is called FIRST and UNCONDITIONALLY, with the arguments
//     untouched, before this file looks at anything;
//   * its return value is passed straight back;
//   * everything this file then does is a read.
//
// The third hook is not a wrapper at all: `addPropertyChangedCallback` is
// component-register's own public observation channel -- solid-element itself
// uses it to bridge props into signals -- so a second listener is purely
// additive and cannot alter a value or an ordering.
//
// EVERY observation is wrapped in a try/catch, for the same reason
// `emitWireDiagnostic` swallows a subscriber's throw: a diagnostic that breaks
// the element it is watching is worse than no diagnostic. A bug in this file
// must cost a missing event, never a dead component.
//
// ZERO COST WHEN NOBODY IS SUBSCRIBED. This runs on the hottest path in the kit
// -- every prop set on every element, which during streaming is every chunk --
// so the ordering of the guards is load-bearing:
//
//   1. AT REGISTRATION: an element with no non-scalar prop (37 of the 80 in
//      `element-nonscalar.json`) installs NOTHING. No wrapper, no closure, no
//      per-instance cost, ever.
//   2. ON EVERY CALL: `wireDiagnosticsActive()` is checked BEFORE constructing
//      an event, building a string, or touching an attribute -- one symbol read
//      on `globalThis` plus an array-length compare, allocating nothing.
//
// SSR-SAFE: no `window`, `document` or `customElements` at module scope. The
// registry snapshot touches `customElements` only inside its function body, and
// returns undefined where there is none.
import {
  emitWireDiagnostic,
  wireDiagnosticsActive,
} from '../wire/diagnostics';
import type {
  ElementRegistryEvent,
  ElementViolationEvent,
  ElementViolationKind,
} from './diagnostic-events';
import NON_SCALAR from './element-nonscalar.json';
import manifest from './element-manifest.json';

/** tag -> the names of its props that CANNOT be carried by an attribute.
 *
 *  Generated, never hand-written: `gen-element-nonscalar.mjs` derives it from
 *  the per-prop `scalar` bit that `gen-element-api.mjs` already reads off the TS
 *  checker into `element-meta.json`. That 390 KB file must never reach a
 *  runtime path; this is the ~2 KB of it that ships.
 *
 *  NOTE FOR ANYONE READING THE DEVTOOLS SPEC: it claims `defineWebComponent`
 *  "already receives a `propDefaults` object that declares each prop's expected
 *  shape". It does not. `propDefaults` is a plain object of default VALUES and
 *  roughly half of them are `undefined`, which declares nothing at runtime --
 *  `<kai-cards>` defaults every prop that matters to `undefined`. Deriving the
 *  check from `propDefaults` would guard 2 props on 3 elements. This map guards
 *  94 props on 43. */
const NON_SCALAR_PROPS: Record<string, string[]> = NON_SCALAR;

/** camelCase prop name -> kebab-case attribute. The SAME derivation
 *  component-register applies (`toAttribute`), because the attribute name it
 *  reports to `attributeChangedCallback` is the one it derived. */
function toAttr(name: string): string {
  return name.replace(/\.?([A-Z]+)/g, (_x, y: string) => '-' + y.toLowerCase()).replace('_', '-').replace(/^-/, '');
}

/**
 * What SHAPE arrived in the attribute -- or `undefined` when the attribute is
 * fine and nothing should be reported.
 *
 * An attribute is NOT automatically a violation on a non-scalar prop. A literal
 * `conversations='[{"id":"a"}]'` is valid JSON, `JSON.parse` succeeds, and the
 * property really does receive an array: that works, and reporting it would be
 * reporting correct code. The violation is precisely the case where the value
 * that reaches the property is not an object -- either because `JSON.parse`
 * threw and component-register's `catch` handed back the raw string, or because
 * the JSON was valid but scalar.
 *
 * EVERY RETURN IS A SHAPE, NEVER CONTENT. The vocabulary is closed and small:
 * two fixed markers, a type name, and a LENGTH. The raw text is never returned,
 * never interpolated, and never measured for anything but its length -- which
 * is what lets this run with no payload gate at all. Pinned with sentinels by
 * `element-diagnostics-payload.test.ts`.
 */
export function classifyAttributeValue(raw: string): string | undefined {
  // component-register's parseAttributeValue starts `if (!value) return;`, so a
  // bare attribute yields `undefined` on a prop that needs a real value.
  if (raw === '') return 'empty-attribute';

  // The signature case, and the reason this capability exists: `String(obj)`.
  if (raw === '[object Object]') return '[object Object]';

  // `String([{}, {}])` -- an ARRAY of objects, which is what `messages`,
  // `conversations` and `suggestions` actually produce. Reported with its
  // element count, which is a length and therefore metadata.
  if (raw.includes(',')) {
    const parts = raw.split(',');
    if (parts.every((p) => p === '[object Object]')) return `[object Object] x ${parts.length}`;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    // A real array or object got through. Unusual, but correct -- say nothing.
    if (parsed !== null && typeof parsed === 'object') return undefined;
    if (parsed === null) return 'json:null';
    return `json:${typeof parsed}`;
  } catch {
    // JSON.parse threw, so component-register assigned the raw STRING to the
    // property. Length only.
    return `string(len=${raw.length})`;
  }
}

/** Build and deliver one violation. Callers gate on `wireDiagnosticsActive()`
 *  BEFORE calling, so nothing here is allocated on the inactive path. */
function emitViolation(
  kind: ElementViolationKind,
  tag: string,
  prop: string,
  extra?: { valuePreview?: string; length?: number },
): void {
  const event: ElementViolationEvent = {
    type: 'element.violation',
    t: Date.now(),
    kind,
    tag,
    prop,
    ...extra,
  };
  emitWireDiagnostic(event);
}

/** Shape of the element class component-register builds, as far as this file
 *  needs to know it. Declared rather than imported: `component-register` is not
 *  a declared dependency of this package (see the note in `define.tsx`). */
interface RegisterProto {
  connectedCallback?: (this: RegisterInstance) => void;
  attributeChangedCallback?: (
    this: RegisterInstance,
    name: string,
    oldVal: string | null,
    newVal: string | null,
  ) => void;
}
interface RegisterInstance {
  addPropertyChangedCallback?: (fn: (key: string, val: unknown, oldValue: unknown) => void) => void;
}

/** Marks a prototype this file has already wrapped, so a re-registration can
 *  never stack two wrappers and double every event. */
const INSTALLED = Symbol.for('kai.element.diagnostics.installed.v1');

/** Whether this tag has anything to watch at all. `defineWebComponent` asks
 *  BEFORE it decides whether it needs to intercept the registry, so a tag with
 *  no non-scalar prop pays not even the interception. */
export function elementDiagnosticsWanted(tag: string): boolean {
  const props = NON_SCALAR_PROPS[tag];
  return props !== undefined && props.length > 0;
}

/**
 * Install the contract checks onto one element class's PROTOTYPE.
 *
 * MUST BE CALLED BEFORE `customElements.define()` SEES THE CLASS.
 *
 * This is not a preference, it is the platform: `define()` snapshots the
 * lifecycle callbacks -- `connectedCallback`, `attributeChangedCallback` and
 * the rest -- off the prototype into the custom-element definition at
 * definition time, and the browser invokes THOSE. Replacing a prototype method
 * afterwards changes an object nothing reads: the wrapper installs perfectly,
 * `hasOwnProperty` confirms it is there, and it is never called once. (Measured
 * exactly that way in jsdom before this comment existed.) It is the same trap,
 * for the same reason, that `defineWithNonReflectingProps` in `define.tsx` was
 * built to get around -- so this rides through that same seam.
 *
 * Returns without touching anything when the tag has no non-scalar prop, which
 * is 37 of the 80 elements: for those this capability has no runtime presence
 * whatsoever.
 */
export function installElementDiagnostics(tag: string, proto: object): void {
  const props = NON_SCALAR_PROPS[tag];
  if (!props || props.length === 0) return;

  const marker = proto as unknown as Record<symbol, unknown>;
  if (marker[INSTALLED]) return;
  marker[INSTALLED] = true;

  const target = proto as RegisterProto;

  // attribute name -> camelCase prop name, built ONCE per tag rather than per
  // call. Only the non-scalar props are in here, so an attribute set on a
  // scalar prop -- the supported way to use one -- misses the map and costs a
  // single failed lookup.
  const attrToProp = new Map<string, string>();
  for (const p of props) attrToProp.set(toAttr(p), p);

  // ---- Capability 1: an array/object prop set as an HTML attribute ---------
  const innerAttributeChanged = target.attributeChangedCallback;
  target.attributeChangedCallback = function (name, oldVal, newVal) {
    // Call through FIRST, unconditionally, arguments untouched. Everything
    // after this point is a read.
    innerAttributeChanged?.call(this, name, oldVal, newVal);

    if (newVal === null) return; // an attribute REMOVAL is not a misuse
    if (!wireDiagnosticsActive()) return; // the zero-cost gate, before any work
    try {
      const prop = attrToProp.get(name);
      if (prop === undefined) return; // a scalar prop: attributes are correct there
      const valuePreview = classifyAttributeValue(newVal);
      if (valuePreview === undefined) return; // valid JSON for an object: not a misuse
      emitViolation('array-prop-as-attribute', tag, prop, { valuePreview });
    } catch {
      // a broken diagnostic must never break the element
    }
  };

  // ---- Capability 2: the same reference handed back -----------------------
  const innerConnected = target.connectedCallback;
  target.connectedCallback = function () {
    // Call through FIRST. This is what runs `initializeProps` (which installs
    // the per-instance accessors) and the facade, so the observation channel
    // below does not exist until it has returned.
    innerConnected?.call(this);

    // NOT gated on `wireDiagnosticsActive()`. Registration has to happen even
    // when nothing is listening yet, because a panel attaches LATE by design --
    // that is the whole premise of the devtools hook's buffer. The gate lives
    // inside the callback instead, where the hot path actually is. The cost
    // here is one closure per connected element of the 43 tags that have a
    // non-scalar prop, paid once, next to mounting a whole Solid facade.
    try {
      // component-register clears `__propertyChangedCallbacks` on every
      // connect, so this re-registers naturally on a re-insertion and cannot
      // accumulate. It is a PUBLIC method -- solid-element bridges props into
      // signals through this exact channel -- and it is invoked AFTER the value
      // is already stored, so a listener here cannot influence anything.
      this.addPropertyChangedCallback?.((key, val, oldValue) => {
        if (!wireDiagnosticsActive()) return; // the hot-path gate, first thing
        try {
          // Arrays only. A string prop re-set to an equal string is `===` too,
          // and reporting that as a no-op update would be noise about a value
          // that never had reference semantics in the first place.
          if (!Array.isArray(val)) return;

          if (val === oldValue) {
            // The array reference is what NOTIFIES; Solid's default equality is
            // `===`, so this write reached the signal and did nothing at all.
            emitViolation('same-array-reference', tag, key, { length: val.length });
            return;
          }

          // A NEW array whose every item is the previous array's item object.
          // The list notified, but every row's identity is unchanged, so a
          // reference-keyed <For> re-invokes none of them: an update that
          // cannot render.
          //
          // `length > 0` is required, and not for performance: two empty arrays
          // satisfy "every item identical" VACUOUSLY. Setting `[]` over `[]` is
          // genuinely a no-op, but it carries no information about what the
          // consumer was trying to change, and it is what a default-valued prop
          // does on a perfectly ordinary first render.
          if (!Array.isArray(oldValue)) return;
          if (val.length === 0 || oldValue.length !== val.length) return;
          for (let i = 0; i < val.length; i++) if (val[i] !== oldValue[i]) return;

          emitViolation('mutated-in-place', tag, key, { length: val.length });
        } catch {
          // see above: never break the element
        }
      });
    } catch {
      // an element type without the channel: nothing to observe, carry on
    }
  };
}

// ---- Capability 3: which kai-* elements are DEFINED ------------------------

/** Every tag the manifest knows about. See `emitElementRegistry` for why this
 *  is the manifest and not `element-meta.json`. */
const MANIFEST_TAGS: string[] = Object.keys((manifest as { tags: Record<string, string> }).tags);

/**
 * Snapshot which `kai-*` elements are defined in THIS realm, and emit it.
 *
 * The question is hydration. An undefined custom element is a perfectly valid,
 * perfectly inert `HTMLElement`: an SSR page whose markup contains `<kai-chat>`
 * but whose element bundle never loaded renders empty boxes, throws nothing and
 * logs nothing. The SSR starters already answer this by hand for a hard-coded
 * handful (`HydrationBadge.tsx` in the nextjs and tanstack-start starters); this
 * is the same answer, derived, over every tag.
 *
 * WHY THE MANIFEST AND NOT `element-meta.json`. The two generated artifacts
 * disagree -- 79 tags against 80 entries -- and the manifest is the one that
 * answers THIS question. `kai-remote` is in the meta file because
 * `gen-element-api.mjs` scans the `src/elements` directory listing, and absent
 * from the manifest because `gen-elements-manifest.mjs` reads the import list in
 * `register-impl.ts`, which does not import `remote.tsx`.
 *
 * AND THAT IS DELIBERATE, not a generator bug -- `vite.config.elements.ts:44-50`
 * says so at the site: `<kai-remote>` mounts a sandboxed cross-origin iframe and
 * is opt-in, reachable only through `@kitn.ai/ui/elements/remote` or the React
 * `Remote` wrapper, and intentionally kept out of the register-all bundle. So
 * the honest universe for "did the element bundle load" is the 79 that bundle
 * registers. Listing `kai-remote` beside them would report a permanent "not
 * defined" against an element almost no app is missing, and adding it to the
 * manifest -- the obvious "fix" -- would hand an opt-in cross-origin iframe
 * element to the autoloader's lazy-load set, which is a behaviour change wearing
 * the costume of a data fix.
 *
 * The cost is stated rather than hidden: a consumer who HAS opted into
 * `kai-remote` sees it in neither list. `element-artifact-divergence.test.ts`
 * pins the divergence at exactly this one tag, so it stays a known exception and
 * a NEW one fails.
 *
 * Returns the event it emitted, or `undefined` where there is no custom-element
 * registry (SSR) or nobody is listening.
 */
export function emitElementRegistry(): ElementRegistryEvent | undefined {
  if (typeof customElements === 'undefined') return undefined;
  if (!wireDiagnosticsActive()) return undefined;

  const defined: string[] = [];
  const notDefined: string[] = [];
  for (const tag of MANIFEST_TAGS) {
    (customElements.get(tag) ? defined : notDefined).push(tag);
  }

  const event: ElementRegistryEvent = {
    type: 'element.registry',
    t: Date.now(),
    defined,
    notDefined,
    total: MANIFEST_TAGS.length,
  };
  emitWireDiagnostic(event);
  return event;
}
