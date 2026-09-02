// Runtime for the generated React wrappers (react/index.tsx). Renders the custom
// element and bridges the React world to it: rich props are assigned as DOM
// *properties* (via a ref, so arrays/objects pass through unstringified), and
// `on<Event>` handlers are wired as `addEventListener` for the element's
// CustomEvents. Layout props (className/style/id) pass straight through.
import {
  createElement,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type PropsWithoutRef,
  type ReactNode,
  type RefAttributes,
} from 'react';

export interface WebComponentProps {
  /** Color mode (`auto` follows prefers-color-scheme). */
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  style?: CSSProperties;
  id?: string;
  /** Slot assignment when this element is a child of another kai element
   *  (`<Panel slot="panel">`). Forwarded to the DOM, never assigned as a
   *  property: slotting is an attribute contract and the parent's
   *  `<slot name="...">` matches on the attribute. */
  slot?: string;
  /** Hide the element. Forwarded to the DOM so a parent that scans its
   *  children for it sees it, which the coarse layout elements do. */
  hidden?: boolean;
  /** Light-DOM children passed through to the element (slots). */
  children?: ReactNode;
}

// Per-element registration fires on the CLIENT, once per tag. The element modules
// touch `window` at module-eval (Solid's runtime), so the thunk must never run on
// the server — it is only ever called from a client effect, browser-gated here too.
const registered = new Set<string>();

/** The in-flight (or settled) register-all import, once a consumer has opted in.
 *  Memoized so repeated registerAll() calls share one bundle load. */
let registerAllLoad: Promise<unknown> | undefined;

function ensureRegistered(tagName: string, register?: () => Promise<unknown>): void {
  if (!register || registered.has(tagName)) return;
  if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
  registered.add(tagName);
  if (customElements.get(tagName)) return; // already defined (e.g. via registerAll)
  // registerAll() is loading the coarse bundle, which defines EVERY kai-* tag —
  // including this one. Checking only customElements.get() is not enough: a dynamic
  // import settles no earlier than a microtask, while this runs synchronously in
  // useLayoutEffect during render(), so the tag is reliably still undefined here and
  // we would fetch a SECOND copy of an implementation already on the wire. Measured
  // at +553 kB for a single <Chat/> in a real Vite consumer build.
  //
  // Nothing is lost by waiting: the prop-assign effect above already re-applies props
  // via customElements.whenDefined() once the definition lands. If the coarse bundle
  // fails to load, fall back to this element's own chunk rather than never upgrading.
  if (registerAllLoad) {
    void registerAllLoad.catch(() => register());
    return;
  }
  void register();
}

/** Eagerly register ALL kai-* elements (the register-all bundle). Opt-in escape
 *  hatch for consumers who prefer no first-mount upgrade delay. Browser-only;
 *  a no-op on the server. */
export function registerAll(): Promise<unknown> | undefined {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') return undefined;
  registerAllLoad ??= import('@kitn.ai/ui/elements');
  return registerAllLoad;
}

export function createWebComponent<
  P extends WebComponentProps,
  /** The generated interface for THIS tag (`KaiViewStackElement`, ...), so a
   *  forwarded ref hands back the element's real methods instead of a bare
   *  HTMLElement that needs casting at every call site. Defaults to
   *  HTMLElement, which keeps a one-argument call compiling unchanged. */
  E extends HTMLElement = HTMLElement,
>(
  tagName: string,
  /** DOM-property names to assign from props (incl. `theme`). */
  propNames: readonly string[],
  /** Map of React handler prop → DOM event name. */
  eventMap: Record<string, string>,
  /** Client-only thunk that loads + registers this element (a literal dynamic
   *  import of its `@kitn.ai/ui/elements/<name>` chunk). */
  register?: () => Promise<unknown>,
): ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<E>> {
  const eventEntries = Object.entries(eventMap);

  const Component = forwardRef<E, P>((props, ref) => {
    const elRef = useRef<E | null>(null);
    useImperativeHandle(ref, () => elRef.current as E, []);
    const p = props as Record<string, unknown>;

    // Hold the latest handlers in a ref so the registered listeners always call
    // the current handler (no stale closures) without re-binding on every render.
    const handlersRef = useRef<Record<string, unknown>>({});
    for (const reactName of Object.keys(eventMap)) handlersRef.current[reactName] = p[reactName];

    // Assign rich props as DOM properties every render (idempotent). Arrays and
    // objects pass through unstringified; booleans become real boolean
    // properties so the element's `flag()` reads them. Updated props re-assign
    // because this effect runs after every render.
    //
    // Upgrade-race guard: if the element isn't upgraded yet (customElements.get
    // returns undefined), writes land on a plain HTMLElement and are lost when
    // Solid's solid-element upgrades the tag later. We call whenDefined() so
    // props set before upgrade are re-applied once the definition arrives.
    // With self-registration (elements/register imported at the top of
    // react/index.tsx) this is belt-and-braces — the element is already defined
    // before React renders — but keeps the runtime safe regardless of import order.
    useLayoutEffect(() => {
      const el = elRef.current;
      if (!el) return;
      const applyProps = () => {
        for (const name of propNames) {
          // PRESENT-with-undefined CLEARS. ABSENT is untouched.
          //
          // React hands a component a COMPLETE props object every render, so a
          // key the caller stopped passing is the caller saying "no value" --
          // and skipping it left the last value stuck on the element forever
          // (blocks contract spike, F-8: a widget that drops its conversation
          // starters after the first turn went on showing them). A key that was
          // never in props at all is not the caller saying anything, and
          // clearing on it would stomp a value set imperatively on the element.
          // A React caller who means "leave it alone" omits the key.
          if (name in p) (el as unknown as Record<string, unknown>)[name] = p[name];
        }
      };
      applyProps();
      if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
        customElements.whenDefined(tagName).then(applyProps);
      }
    });

    // Client-only, deduped: load + register THIS element on first mount. The
    // prop-assign effect's whenDefined guard re-applies props once it upgrades.
    useLayoutEffect(() => {
      ensureRegistered(tagName, register);
    }, []);

    // Wire CustomEvent listeners ONCE per element. Each stable listener reads the
    // latest handler from handlersRef, so changing a handler's identity across
    // renders takes effect without add/remove churn, and listeners are removed on
    // unmount (no leaks).
    useLayoutEffect(() => {
      const el = elRef.current;
      if (!el) return;
      const added: Array<[string, EventListener]> = [];
      for (const [reactName, domName] of eventEntries) {
        const fn: EventListener = (e) => {
          const handler = handlersRef.current[reactName];
          if (typeof handler === 'function') (handler as (e: Event) => void)(e);
        };
        el.addEventListener(domName, fn);
        added.push([domName, fn]);
      }
      return () => added.forEach(([n, fn]) => el.removeEventListener(n, fn));
    }, []);

    return createElement(
      tagName,
      {
        ref: elRef,
        className: p.className as string | undefined,
        style: p.style as CSSProperties | undefined,
        id: p.id as string | undefined,
        slot: p.slot as string | undefined,
        hidden: p.hidden as boolean | undefined,
      },
      // Light-DOM children pass straight through to the element (slots).
      (p.children ?? null) as never,
    );
  });

  Component.displayName = tagName;
  return Component as ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<E>>;
}
