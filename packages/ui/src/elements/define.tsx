import { customElement } from 'solid-element';
import { ChatConfig } from '../primitives/chat-config';
import { ELEMENT_CSS } from './css';
import { createSignal, onCleanup, Show, type JSX } from 'solid-js';

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
  const [systemDark, setSystemDark] = createSignal(false);
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
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
): { result: T; handled: boolean } {
  // `handled` = nothing more for the caller to do. With no colliding props there is
  // nothing to install at all, so that case is trivially handled.
  if (keys.length === 0) return { result: define(), handled: true };
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
        installNonReflectingProps(constructor.prototype, keys);
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
    // solid-element) and adopt the sheet now. If we deferred to onMount instead,
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
        <div classList={{ dark: isDark() }} style={{ display: 'contents', color: 'var(--color-foreground)' }}>
          <div ref={portalNode} />
          <ChatConfig portalMount={portalNode}>
            {Facade(props as unknown as P, { element, dispatch, flag, expose, dark: isDark })}
          </ChatConfig>
        </div>
      </>
    );
  };

  const { result: Ctor, handled } = defineWithNonReflectingProps(tag, shadowedProps, () =>
    customElement(tag, defaults, renderFacade),
  );

  // Belt and braces for the one path the wrap cannot see: if `customElements.define`
  // was never reached for this tag (a registry that defines lazily, or a future
  // solid-element that stops calling it synchronously), install on the returned class
  // instead. That is the OLD, too-late timing — it still protects every element
  // constructed from here on, it just cannot rescue an already-upgraded one. Skipped
  // in the normal case, where the accessors are already on this same prototype.
  const proto = (Ctor as unknown as { prototype?: object } | undefined)?.prototype;
  if (!handled && proto) installNonReflectingProps(proto, shadowedProps);
}
