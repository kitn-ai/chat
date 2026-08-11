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
}

/** camelCase prop name → kebab-case attribute (`hoverCard` → `hover-card`). */
function toAttr(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase();
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

  // Props that NAME a reflected global IDL accessor (today: only `role`, from
  // ARIAMixin's Element.prototype.role). Unlike RESERVED (which throws), these are
  // allowed as plain styling props, but they must NEVER reach the host as an
  // attribute: kai-message uses role='user'|'assistant' to pick its layout, and
  // those are not valid ARIA roles, so a reflected role="user" / role="assistant"
  // fails axe's aria-roles rule. The native IDL setter reflects to an attribute
  // whenever the property is set BEFORE connectedCallback (e.g. in a framework
  // `ref`: `el.role = 'user'`), which is the window before component-register
  // installs its own (non-reflecting) per-instance accessor in initializeProps. We
  // shadow the native accessor on the element prototype with a plain non-reflecting
  // one, so setting the property only STORES the value (component-register still
  // reads it back for styling) and never touches a host attribute.
  const NON_REFLECTING = ['role'];

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

  const Ctor = customElement(tag, defaults, (props: typeof defaults, options: { element: object }) => {
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
            {Facade(props as unknown as P, { element, dispatch, flag, expose })}
          </ChatConfig>
        </div>
      </>
    );
  });

  // Shadow any reflected native IDL accessor this element re-uses as a prop (see
  // NON_REFLECTING) with a plain, non-reflecting store on the element prototype.
  // This must live on the prototype (not the instance) so it is already in place
  // when the value is set before connectedCallback, the window in which the native
  // setter would otherwise reflect it to a host attribute. component-register reads
  // the property back during initializeProps to seed the styling prop, and later
  // shadows this with its own (also non-reflecting) per-instance accessor.
  const proto = (Ctor as unknown as { prototype?: object } | undefined)?.prototype;
  if (proto) {
    for (const key of NON_REFLECTING) {
      if (!(key in defaults)) continue;
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
}
