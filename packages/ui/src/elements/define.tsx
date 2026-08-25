import { customElement } from '@solidjs/element';
import { ChatConfig } from '../primitives/chat-config';
import { ELEMENT_CSS } from './css';
import { elementDiagnosticsWanted, installElementDiagnostics } from './element-diagnostics';
import { createEffect, createSignal, onCleanup, runWithOwner, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';

/**
 * Shared constructable stylesheet, built once and adopted by every element's
 * shadow root. This avoids duplicating the full compiled kit CSS (~77 KB) as an
 * inline `<style>` in each instance — important now that composing many small
 * elements on a page is a supported pattern. Falls back to `null` where
 * Constructable Stylesheets aren't available, in which case the facade renders
 * an inline `<style>` instead (see below).
 */
let sharedSheet: CSSStyleSheet | null | undefined;
function getSharedSheet(): CSSStyleSheet | null {
  if (sharedSheet !== undefined) return sharedSheet;
  try {
    if (typeof CSSStyleSheet === 'undefined') throw new Error('no CSSStyleSheet');
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(ELEMENT_CSS);
    sharedSheet = sheet;
  } catch {
    sharedSheet = null;
  }
  return sharedSheet;
}

/** Resolve whether the element should render dark, given its `theme` and the
 *  system preference. `auto` (the default) follows `prefers-color-scheme`. */
function createDarkMode(getTheme: () => string | undefined) {
  // V2-PORT: v2 rejects signal writes in an owned body — SEED from the media
  // query instead of writing right after creation.
  const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : undefined;
  const [systemDark, setSystemDark] = createSignal(mq?.matches ?? false);
  if (mq) {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    onCleanup(() => mq.removeEventListener('change', onChange));
  }
  return () => {
    const theme = getTheme() ?? 'auto';
    return theme === 'dark' || (theme === 'auto' && systemDark());
  };
}

/**
 * Context handed to every element facade. `E` is the element's event map —
 * `{ eventName: detailType }` — which types `dispatch` so a facade can only fire
 * its declared events with the right `detail` shape.
 */
export interface WebComponentContext<E = Record<string, unknown>> {
  /** The custom-element host node. */
  element: HTMLElement;
  /** Fire a non-bubbling, non-composed CustomEvent off the host. Consumers
   *  listen directly on the element (`el.addEventListener(...)`). Typed by the
   *  element's event map `E`. */
  dispatch: <K extends keyof E & string>(type: K, detail?: E[K]) => void;
  /**
   * Resolve a boolean flag from a prop the way HTML authors expect.
   *
   * `component-register` parses a *bare* boolean attribute (`<el removable>`) to
   * `undefined`, not `true` — so a facade can't rely on the prop value alone.
   * `flag('removable')` returns ON when the property is `true`, OR when the
   * matching attribute is present and not explicitly `="false"`. So all of
   * `<el removable>`, `<el removable="true">`, and `el.removable = true` turn it
   * on; `<el removable="false">`, absent, and `el.removable = false` turn it off.
   *
   * `name` is the camelCase prop name; the matching kebab attribute is derived.
   */
  flag: (name: string) => boolean;
  /**
   * Expose imperative methods on the host element instance — the input half of a
   * component's interaction surface (`el.focus()`, `el.clear()`, `el.scrollToBottom()`,
   * …), the counterpart to the events `dispatch` fires. Call once from the facade
   * with closures over its internal state/refs; each entry is assigned to the host,
   * so a consumer calls it directly: `document.querySelector('kai-prompt-input').focus()`.
   * Overriding a native method name (e.g. `focus`) shadows it on the instance so it
   * can target the right control inside the shadow root (the WebAwesome/Shoelace
   * convention). Methods are attached when the facade renders (on element upgrade).
   */
  expose: (methods: Record<string, (...args: never[]) => unknown>) => void;
  /**
   * Reflect a boolean prop to its host attribute AND make that prop read back what
   * was set. Use this instead of hand-rolling
   * `createEffect(() => element.toggleAttribute('x', flag('x')))`.
   *
   * WHY IT IS ONE CALL AND NOT TWO. The reflection is what BREAKS the read-back, so
   * the fix has to be attached to it or it gets forgotten — and it was, three times.
   * `toggleAttribute(name, true)` sets the attribute to the EMPTY STRING;
   * component-register's `attributeChangedCallback` then writes the prop back as
   * `this[name] = parseAttributeValue("")`, and `parseAttributeValue` returns
   * `undefined` for the empty string. So a reflected flag became write-only:
   * `el.loading = true` left `el.loading === undefined` while `[loading]` was on the
   * host. The element kept BEHAVING correctly, because `flag()` reads the attribute —
   * which is precisely why nobody noticed until a consumer tried to read the property
   * back (findings G-05).
   *
   * What this installs is an instance-level wrapper around the accessor
   * component-register already created, coercing every incoming value through the
   * same `flag()` policy (`resolveFlag`) — so the `undefined` write-back resolves to
   * the attribute that caused it, and the property and the attribute can no longer
   * disagree. It delegates to the underlying setter, so reactivity is untouched.
   *
   * `source` overrides where the ON/OFF value comes from, for an element whose truth
   * is an internal controller rather than the prop (see `wireDisclosure`). Returning
   * `undefined` from it means "not ready, leave the attribute alone".
   */
  reflectFlag: (name: string, source?: () => boolean | undefined) => void;
  /**
   * Whether the element should currently render its dark-mode look --
   * exactly the SAME resolved value that already drives the `.dark` class
   * every facade's content sits inside (not a second computation of the
   * `theme='light'|'dark'|'auto'` rule; see `createDarkMode` above). Most
   * facades never need this directly, since the injected kit CSS already
   * flips its custom properties under `.dark`. It exists for content that
   * cannot read CSS at all -- e.g. a WebGL shader baking a colour choice
   * into a GLSL uniform, which is why `kai-audio-visualizer` reads it.
   */
  dark: () => boolean;
}

/** camelCase prop name → kebab-case attribute (`hoverCard` → `hover-card`). */
function toAttr(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Every property name the built-in element prototype chain exposes as an ACCESSOR
 * — `role`, `hidden`, `autofocus`, `dir`, `title`, `className`, … — i.e. the
 * reflected IDL attributes plus the handful of read-only accessors. Methods
 * (`focus`, `append`) are plain data properties and are deliberately not included:
 * assigning over one shadows it on the instance but destroys nothing on the DOM.
 *
 * DERIVED, not listed. A hand-written list is a list someone has to remember to
 * extend: the collision set is (this element's prop names) × (whatever the browser
 * reflects), and both sides move — the kit adds props, and the platform keeps
 * adding globals (`inert`, `popover`, `writingSuggestions` are all recent). Reading
 * it off the live prototype chain means a prop that starts colliding tomorrow is
 * protected the day it lands, in whichever engines have shipped the accessor,
 * without a code change. It also self-limits: in an engine that has NOT shipped a
 * given accessor (jsdom has no `autofocus`) the name is simply not a collision
 * there, which is exactly right.
 *
 * Computed once — the chain does not change at runtime.
 */
let globalAccessorNames: Set<string> | undefined;
export function reflectedGlobalPropNames(): Set<string> {
  if (globalAccessorNames) return globalAccessorNames;
  const names = new Set<string>();
  let proto: object | null =
    typeof HTMLElement === 'undefined' ? null : (HTMLElement.prototype as object);
  while (proto && proto !== Object.prototype) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
      if (descriptor.get || descriptor.set) names.add(name);
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  globalAccessorNames = names;
  return names;
}

/**
 * Replace inherited reflected accessors with plain, non-reflecting per-instance
 * stores on this element class's prototype. Setting the property then only STORES
 * the value — component-register still reads it back to seed the styling prop, and
 * later shadows this with its own (also non-reflecting) instance accessor — and it
 * can never touch a host attribute.
 */
function installNonReflectingProps(proto: object, keys: readonly string[]): void {
  for (const key of keys) {
    const store = Symbol(`kai-prop:${key}`);
    Object.defineProperty(proto, key, {
      get(this: Record<symbol, unknown>) {
        return this[store];
      },
      set(this: Record<symbol, unknown>, value: unknown) {
        this[store] = value;
      },
      enumerable: true,
      configurable: true,
    });
  }
}

/**
 * Run `define` (solid-element's `customElement`, which calls
 * `customElements.define` internally) with `keys` already shadowed on the element
 * class — BEFORE the registry ever sees it.
 *
 * THE ORDER IS THE WHOLE POINT. `customElements.define()` synchronously upgrades
 * every matching element the parser has already produced, and component-register's
 * constructor runs `this[prop] = undefined` for every declared prop. If the
 * non-reflecting accessor is installed AFTER the define call, that assignment lands
 * on the NATIVE setter, which for a reflected IDL attribute means the author's
 * markup is destroyed before a line of facade code runs — `undefined` coerces to
 * `null`/`false` and the setter removes the attribute. Measured in chromium from
 * parsed HTML (`node scripts/probe-upgrade-attribute-loss.mjs`):
 *
 *   <kai-message role="user">        → role attr gone, el.role "assistant",
 *                                      the row renders as "Assistant message"
 *   <kai-resizable-item hidden>      → hidden attr gone, el.hidden false, the
 *                                      panel is slotted and RENDERS VISIBLE
 *   <kai-confirm autofocus>          → autofocus attr gone, nothing focused
 *
 * Two of those are silent: `hidden` and `autofocus` are legitimate global
 * attributes, so no a11y rule and no console warning fires — the value simply
 * evaporates. Only `role` was loud enough to get noticed.
 *
 * WHY A TRANSIENT REGISTRY WRAP and not something tidier: the class does not exist
 * until `register()` builds it, and `register()` defines it in the same statement.
 * component-register can take a `BaseElement` (a prototype we control) or a
 * `customElements`-alike (a registry we control) via its third argument — either
 * would be cleaner — but solid-element's `customElement()` calls `register(tag,
 * props)` with no options and forwards nothing, and `component-register` is not a
 * declared dependency of this package, so reaching past solid-element to call
 * `register` ourselves would ship an undeclared import to consumers. Intercepting
 * the one `define` call is the smallest seam that exists.
 *
 * The wrap is synchronous, restored in a `finally`, delegates to whatever was
 * installed (so a polyfilled or consumer-wrapped registry keeps working), acts only
 * on OUR tag, and is re-entrancy safe: a facade that defines another element during
 * its upgrade nests a second wrap and unwinds it in order.
 */
function defineWithNonReflectingProps<T>(
  tag: string,
  keys: readonly string[],
  define: () => T,
  /**
   * Anything else that must be on the prototype BEFORE the registry sees the
   * class. Today that is the element-layer diagnostics, and it needs this seam
   * for a reason that is adjacent to the one above but not the same: `define()`
   * SNAPSHOTS the lifecycle callbacks (`connectedCallback`,
   * `attributeChangedCallback`, …) off the prototype into the custom-element
   * definition, and the browser invokes the snapshot. A wrapper installed
   * afterwards is present on the prototype, passes `hasOwnProperty`, and is
   * never called. See `installElementDiagnostics`.
   */
  alsoPatch?: (proto: object) => void,
): { result: T; handled: boolean } {
  // `handled` = nothing more for the caller to do. With no colliding props and
  // nothing else to patch there is nothing to install at all, so that case is
  // trivially handled.
  if (keys.length === 0 && !alsoPatch) return { result: define(), handled: true };
  const registry = customElements;
  const hadOwnDefine = Object.prototype.hasOwnProperty.call(registry, 'define');
  const inner = registry.define;
  let handled = false;
  let restore: (() => void) | undefined;
  try {
    registry.define = function (
      this: CustomElementRegistry,
      name: string,
      constructor: CustomElementConstructor,
      options?: ElementDefinitionOptions,
    ) {
      if (name === tag) {
        if (keys.length) installNonReflectingProps(constructor.prototype, keys);
        alsoPatch?.(constructor.prototype);
        handled = true;
      }
      return inner.call(this, name, constructor, options);
    };
    restore = () => {
      if (hadOwnDefine) registry.define = inner;
      else delete (registry as unknown as Record<string, unknown>).define;
    };
  } catch {
    // A frozen registry (SES lockdown, a sealed polyfill, a hardened extension
    // page): we cannot get ahead of define() there. Leave `handled` false so the
    // caller installs on the returned class instead — the OLD, too-late timing, but
    // registration itself still succeeds. Getting this wrong the other way would
    // take all 80 elements down in that environment to fix three props in it.
  }
  try {
    return { result: define(), handled };
  } finally {
    restore?.();
  }
}

/**
 * Marks a setter as one of ours, so the wrap is idempotent WITHOUT being permanent.
 *
 * The mark goes on the setter function rather than on the element, and that is the
 * whole subtlety: component-register installs a FRESH instance accessor from
 * `initializeProps` on every (re)connect after a release, which throws our wrapper
 * away. An element-level "already done" flag would then skip re-wrapping and the
 * property would quietly go write-only again on the second mount. An unmarked setter
 * is by definition a new one, so it gets wrapped again.
 */
const FLAG_READ_BACK = Symbol('kai-flag-read-back');

/**
 * Wrap the instance accessor component-register created for `name` so every value
 * written to it — a consumer's assignment, or the `undefined` write-back that
 * `attributeChangedCallback` performs after a `toggleAttribute` — is resolved through
 * the same policy `flag()` uses.
 *
 * TIMING. This must run from the facade body, i.e. during `connectedCallback` AFTER
 * `initializeProps`, and that is not a detail: `initializeProps` harvests any value
 * set on the element BEFORE upgrade (`value = element[key]`) and only then installs
 * the accessor. Wrapping earlier (on the prototype, the way `installNonReflectingProps`
 * does) would be shadowed by that accessor and would also sit in front of the harvest —
 * the same class of defect `define-upgrade-ordering.test.tsx` pins for attributes.
 */
function installFlagReadBack(element: HTMLElement, name: string, attribute: string): void {
  const inner = Object.getOwnPropertyDescriptor(element, name);
  if (!inner?.get || !inner.set) {
    // Reached only if `name` is not a declared prop of this element — a typo, or a
    // facade reflecting something it never declared. Warn rather than no-op silently;
    // a silent skip here would look exactly like a working read-back.
    console.warn(
      `reflectFlag("${name}"): no such declared prop on <${element.localName}> — ` +
      `the attribute will still reflect, but the property will not read back.`,
    );
    return;
  }
  const { get, set } = inner;
  if ((set as { [FLAG_READ_BACK]?: true })[FLAG_READ_BACK]) return;

  const wrapped = function (this: HTMLElement, value: unknown) {
    set.call(this, resolveFlag(this, value, attribute));
  } as ((value: unknown) => void) & { [FLAG_READ_BACK]?: true };
  wrapped[FLAG_READ_BACK] = true;

  Object.defineProperty(element, name, {
    get,
    set: wrapped,
    enumerable: inner.enumerable ?? true,
    configurable: true,
  });

  // Seed, but ONLY upwards. The value sitting in the prop store right now may already
  // be the broken one: `<el loading>` parses to `undefined` in `initializeProps`
  // exactly as it does in the write-back, so without this the bare-attribute case
  // would still read back `undefined` until something else wrote to the prop.
  //
  // WHY NOT SEED `false` TOO. Writing `false` over an `undefined` would look tidier
  // and is wrong: for props declared with an `undefined` default, `undefined` MEANS
  // "the consumer has not set this", and at least one caller depends on telling that
  // apart from an explicit `false` — `wireDisclosure` seeds from `defaultOpen` only
  // while `open` is unset, so a blanket `false` seed would clobber
  // `<el default-open>` on every mount. Promoting only a present attribute to `true`
  // fixes the read-back without inventing an opinion the author never expressed.
  const current = get.call(element);
  if (typeof current !== 'boolean' && resolveFlag(element, current, attribute)) {
    // V2-PORT: this seed is a signal write and reflectFlag runs from the facade
    // BODY — an owned scope, where v2's dev guard rejects writes. The write is
    // the deliberate attribute→prop promotion documented above, so run it with
    // no owner (same value, same tick, guard satisfied).
    runWithOwner(null, () => wrapped.call(element, true));
  }
}

/** Underlying flag resolution; see `WebComponentContext.flag`. */
function resolveFlag(element: HTMLElement, value: unknown, attribute: string): boolean {
  if (value === true) return true;
  // An explicit JS false wins over a present attribute (see WebComponentContext.flag); this also prevents a feedback loop when an effect writes the attribute it reads.
  if (value === false) return false;
  return element.hasAttribute(attribute) && element.getAttribute(attribute) !== 'false';
}

type FacadeComponent<P, E> = (props: P, ctx: WebComponentContext<E>) => JSX.Element;

/**
 * Register a Solid facade as a Shadow-DOM custom element.
 *
 * - Renders into the element's shadow root (solid-element's default), with the
 *   compiled kit CSS injected via a `<style>` so Tailwind classes apply inside.
 * - Creates a portal mount node inside the shadow root and provides it through
 *   `ChatConfig` so the kit's overlays stay inside the shadow root.
 * - Gives the facade a `dispatch(type, detail)` helper that fires non-bubbling,
 *   non-composed CustomEvents off the host element (consumers listen directly on
 *   the element, so bubbling/composed would only cause consumer collisions).
 * - Idempotent: redefining an already-registered tag is a no-op.
 */
export function defineWebComponent<P extends Record<string, unknown>, E = Record<string, unknown>>(
  tag: string,
  propDefaults: P,
  Facade: FacadeComponent<P, E>,
): void {
  // SSR-safe: skip registration when the Custom Elements API is not available
  // (Node.js / edge runtimes during SSR/prerender). Importing this module in a
  // server context will silently no-op rather than throwing "customElements is
  // not defined" or "window is not defined". The element registers on the client
  // when the browser loads the bundle.
  if (typeof customElements === 'undefined') return;
  if (customElements.get(tag)) return;

  // Guard against prop names that collide with global reflected HTMLElement IDL
  // attributes. component-register sets `this[prop] = undefined` in the element
  // constructor; for these, the native setter coerces undefined → "undefined"
  // and reflects it to an attribute — which is illegal in a CE constructor and
  // throws a cryptic "result must not have attributes". Fail loud and early with
  // a name + fix instead. (Use a prefixed attribute, e.g. `bar-title`/`headline`.)
  const RESERVED = ['title', 'id', 'slot', 'lang'];
  for (const key of Object.keys(propDefaults)) {
    if (RESERVED.includes(key)) {
      throw new Error(
        `defineWebComponent(${tag}): prop "${key}" collides with a global HTMLElement ` +
        `attribute and will break the element constructor. Rename it (e.g. ` +
        `"bar-title" → barTitle, a source title → headline).`,
      );
    }
  }

  // Every element gets a `theme` property/attribute. It drives a `.dark` class on
  // an inner wrapper, which the injected kit CSS already styles — so dark mode
  // works in standalone Shadow-DOM usage with no token duplication.
  //
  // The `as` annotation is load-bearing, not decoration: scripts/gen-element-api.mjs
  // reads THIS object literal to learn which props every element gets for free, and
  // takes each one's type and doc comment off the checker. Without it the inferred
  // type is the literal `"auto"`. Add a universal prop here and it appears in
  // element-meta.json, the generated .d.ts, custom-elements.json and llms-full.txt
  // for all 79 elements, with no second list to update.
  const defaults = {
    /** Color mode (`auto` follows prefers-color-scheme). */
    theme: 'auto' as 'light' | 'dark' | 'auto',
    ...propDefaults,
  };

  // Props that NAME a reflected global IDL accessor (today, across all 80 elements:
  // `role` on kai-message, `hidden` on kai-resizable-item, `autofocus` on
  // kai-confirm). Unlike RESERVED (which throws), these are legitimate domain props
  // — `role` is the SPEAKER, `hidden` and `autofocus` mean what they say — and they
  // stay usable, but the native accessor must not be the one that receives them.
  // See defineWithNonReflectingProps for what the native setter does to the author's
  // markup if it is, and why the shadowing has to be in place before the registry
  // sees the class. RESERVED names never get here; they already threw above.
  const shadowedProps = Object.keys(defaults).filter((key) => reflectedGlobalPropNames().has(key));

  const renderFacade = (props: typeof defaults, options: { element: object }) => {
    const element = options.element as HTMLElement;
    let portalNode!: HTMLDivElement;

    const dispatch = ((type: string, detail?: unknown) =>
      element.dispatchEvent(
        new CustomEvent(type, { detail, bubbles: false, composed: false }),
      )) as WebComponentContext<E>['dispatch'];

    // Reads `props[name]` (reactive) and falls back to attribute presence so
    // bare boolean attributes behave like normal HTML. See WebComponentContext.
    const flag = (name: string) =>
      resolveFlag(element, (props as Record<string, unknown>)[name], toAttr(name));

    // Reflect a boolean prop to its attribute and keep the property readable. See
    // WebComponentContext.reflectFlag for the defect this exists to close.
    const reflectFlag: WebComponentContext<E>['reflectFlag'] = (name, source) => {
      const attribute = toAttr(name);
      installFlagReadBack(element, name, attribute);
      // V2-PORT (R1): the tracked read (source/flag) is the compute; the host
      // attribute write is the apply. `element` is the already-upgraded host
      // (not a render-produced ref), but the WRITE is still a side effect and
      // belongs in the apply phase.
      createEffect(
        () => (source ? source() : flag(name)),
        (on) => {
          // `undefined` means the caller's source is not ready yet (a controller a
          // primitive has not handed up). Leave the author's attribute alone rather
          // than writing a guessed OFF over it.
          if (on === undefined) return;
          element.toggleAttribute(attribute, on);
        },
      );
    };

    // Attach imperative methods onto the host instance. See WebComponentContext.expose.
    // Uses defineProperty so a method can shadow an inherited getter-only accessor
    // (e.g. `focus`/`blur`) which a plain assignment would throw on. A method name
    // must NOT collide with a declared prop (the prop's accessor would be clobbered)
    // — pick a distinct verb (e.g. `send()` next to a `submit` prop). Failures warn
    // and skip rather than breaking the element's render.
    const expose: WebComponentContext<E>['expose'] = (methods) => {
      for (const [name, fn] of Object.entries(methods)) {
        try {
          Object.defineProperty(element, name, { value: fn, writable: true, configurable: true });
        } catch (err) {
          console.warn(`defineWebComponent(${tag}): could not expose method "${name}"`, err);
        }
      }
    };

    const isDark = createDarkMode(() => props.theme as string | undefined);

    // Prefer a single shared stylesheet adopted into this shadow root; only emit
    // an inline <style> when Constructable Stylesheets aren't supported.
    //
    // Adopt SYNCHRONOUSLY, before solid-element inserts the rendered content into
    // the shadow root. component-register attaches the shadow root lazily on first
    // `renderRoot` access — which happens during that insert, AFTER this facade
    // function returns. So we pre-attach the shadow root here (with the same
    // `mode: 'open'` the renderRoot getter would use, making it a no-op for
    // solid-element) and adopt the sheet now. If we deferred to onSettled instead,
    // the content would paint UNSTYLED and then animate from that bare state to
    // its resting style once the sheet landed — every `transition-colors` button
    // and menu/dropdown trigger flashing as if hovered-then-un-hovered on first
    // render. Adopting first means the very first computed style of every node is
    // already the resting style, so no transition can fire on load.
    const sheet = getSharedSheet();
    if (sheet) {
      const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
      if ('adoptedStyleSheets' in root && !root.adoptedStyleSheets.includes(sheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      }
    }

    return (
      <>
        <Show when={!sheet}>
          <style>{ELEMENT_CSS}</style>
        </Show>
        {/* display:contents — no layout box; carries the .dark token scope and
            re-roots the inherited `color` to the active mode's foreground, so text
            without an explicit color class (e.g. attachment filename labels) follows
            light/dark instead of inheriting the host page's color. */}
        <div class={{ dark: isDark() }} style={{ display: 'contents', color: 'var(--color-foreground)' }}>
          <div ref={portalNode} />
          <ChatConfig portalMount={portalNode}>
            {Facade(props as unknown as P, {
              element,
              dispatch,
              flag,
              reflectFlag,
              expose,
              dark: isDark,
            })}
          </ChatConfig>
        </div>
      </>
    );
  };

  // Element-layer diagnostics: report the three `kai-` contract violations that
  // are otherwise silent (an array or object prop set as an HTML attribute, the
  // same array reference handed back, a new array of the same item objects).
  //
  // HERE because this function is the single choke point — every kai-* element
  // registers through it, which `elements/slots.test.ts` already enforces — so
  // one call covers every element with no per-element work and no second list.
  //
  // Through the pre-define seam, not after the fact, because the registry
  // snapshots lifecycle callbacks at definition time; see `alsoPatch` above.
  // `elementDiagnosticsWanted` is asked first so a tag with no non-scalar prop
  // (37 of the 80) does not even pay for the registry interception.
  const wantsDiagnostics = elementDiagnosticsWanted(tag);

  const { result: Ctor, handled } = defineWithNonReflectingProps(
    tag,
    shadowedProps,
    () => customElement(tag, defaults, renderFacade),
    wantsDiagnostics ? (proto) => installElementDiagnostics(tag, proto) : undefined,
  );

  // Belt and braces for the one path the wrap cannot see: if `customElements.define`
  // was never reached for this tag (a registry that defines lazily, or a future
  // solid-element that stops calling it synchronously), install on the returned class
  // instead. That is the OLD, too-late timing — it still protects every element
  // constructed from here on, it just cannot rescue an already-upgraded one. Skipped
  // in the normal case, where the accessors are already on this same prototype.
  const proto = (Ctor as unknown as { prototype?: object } | undefined)?.prototype;
  if (!handled && proto) installNonReflectingProps(proto, shadowedProps);

  // NOTE the diagnostics have no equivalent late fallback, and must not get one.
  // The non-reflecting props still work when installed late (they only have to
  // beat the NEXT constructor); the diagnostics do not, because the registry has
  // already snapshotted the lifecycle callbacks it will invoke. Installing them
  // here would produce a wrapper that is visibly present and never called —
  // which is worse than not installing it, since it would read as coverage. So
  // in the one environment the pre-define seam cannot reach (a frozen registry:
  // SES lockdown, a sealed polyfill), element diagnostics are simply absent, and
  // every other element behaviour is unaffected.
}
