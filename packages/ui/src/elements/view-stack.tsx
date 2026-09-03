import { createSignal, createEffect, on, onMount, onCleanup, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { createViewStack, type ViewEntry, type ViewStackState } from '../components/view-stack';

/** Is this element a `<kai-view>` child the stack should manage? */
export function isKaiViewElement(el: Element): boolean {
  return el.tagName.toLowerCase() === 'kai-view';
}

/** Read a `<kai-view>`'s declarative registration: `name` (the PROPERTY a
 *  framework sets, else the attribute, else the host `id`) and the `tab-root`
 *  flag. Pure -- unit-tested directly, the pattern `parseKaiConversationElement`
 *  set.
 *
 *  Property FIRST, and this order is load-bearing: a component framework
 *  assigns a declared prop as a DOM property and never writes the attribute, so
 *  an attribute-only read saw every child as `{ name: '', tabRoot: false }` and
 *  the stack matched nothing. Same order, helper for helper, as
 *  `readTabBarItemValue` and `isTabBarItemDisabled` in `../components/tab-bar`. */
export function readViewEntry(el: Element): ViewEntry {
  const nameProp = (el as Element & { name?: unknown }).name;
  const tabRootProp = (el as Element & { tabRoot?: unknown }).tabRoot;
  return {
    name:
      typeof nameProp === 'string' && nameProp
        ? nameProp
        : (el.getAttribute('name') ?? (el as HTMLElement).id),
    // A real boolean is the framework's answer and wins outright. Otherwise the
    // bare boolean attribute: present and not explicitly ="false" is ON, the
    // same policy `flag()` applies to facade props. The `typeof` test is what
    // keeps the two apart -- solid-element syncs the ATTRIBUTE onto the prop as
    // a string, which must not be mistaken for a host-supplied boolean.
    tabRoot:
      typeof tabRootProp === 'boolean'
        ? tabRootProp
        : el.hasAttribute('tab-root') && el.getAttribute('tab-root') !== 'false',
  };
}

interface Props extends Record<string, unknown> {
  /** Deep link / initial view name; reflected to the `view` ATTRIBUTE as
   *  navigation happens, so `kai-view-stack[view="chat"]` selectors follow.
   *  Setting it later navigates (tab root selects that tab; a drill view
   *  replaces the top while drilled, or pushes from a root). */
  view?: string;
  /** READ-ONLY reflection of the drilled state, present while a pushed
   *  (non-root) view is showing. THE rule this element owns: drilled hides
   *  the tab bar and shows a back affordance, so a sibling tab bar hides
   *  itself on `kai-view-stack[drilled]` (or from `kai-view-change`), and a
   *  header shows its back arrow the same way. */
  drilled?: boolean;
}

/** Events fired by `<kai-view-stack>`. Non-bubbling — listen on the element. */
interface Events {
  /** The visible view or the drilled flag changed (push, back, replace, tab
   *  switch, or a `view` attribute write). `detail`: `{ view, root, drilled,
   *  stack }`; `root` is what the tab bar should mark active, defined even
   *  while drilled. */
  'kai-view-change': ViewStackState;
}

/**
 * `<kai-view-stack>` — the mobile-stack view navigator (widget navigation as
 * an element). Declare views as light-DOM `<kai-view>` children: TAB ROOTS
 * (`tab-root`) sit side by side behind a tab bar; the rest are DRILL views,
 * pushed on top with `push()` and left with `back()`. The stack owns the one
 * rule the chat widget is built on: a drilled view hides the tab bar and
 * shows a back affordance; a tab root shows the tab bar and no back arrow.
 * Consumers wire chrome to the exposed state (`drilled` attribute/property,
 * `view` attribute, `kai-view-change`), never to their own copy of that
 * policy.
 *
 * ```html
 * <kai-view-stack view="home">
 *   <kai-view name="home" tab-root>...home...</kai-view>
 *   <kai-view name="messages" tab-root>...list...</kai-view>
 *   <kai-view name="chat">...thread...</kai-view>
 * </kai-view-stack>
 * <script type="module">
 *   const stack = document.querySelector('kai-view-stack');
 *   stack.addEventListener('kai-view-change', (e) => {
 *     tabBar.hidden = e.detail.drilled;   // the rule, consumed not restated
 *     backArrow.hidden = !e.detail.drilled;
 *   });
 *   openButton.onclick = () => stack.push('chat');
 *   backArrow.onclick = () => stack.back();
 *   tabBar.onclick = (e) => stack.selectTab(e.target.dataset.tab);
 * </script>
 * ```
 *
 * Views stay MOUNTED while hidden, so tab switching resets nothing by
 * default. The stack decides only WHICH view shows: it never moves focus or
 * scroll (the kit's idiom is an imperative `focus()` on the element that owns
 * the control).
 *
 * Methods: `push(name)` drills (a tab-root name routes to `selectTab` — a
 * root can never be drilled); `back()` pops one view, a no-op at a root;
 * `replace(name)` swaps the current view without touching history;
 * `selectTab(name)` switches roots and clears any drill; `navigate(name)` is
 * the deep-link form the `view` attribute uses. Unknown names are ignored.
 */
defineWebComponent<Props, Events>('kai-view-stack', {
  view: undefined,
  drilled: undefined,
}, (props, { element, dispatch, reflectFlag, expose }) => {
  const [entries, setEntries] = createSignal<readonly ViewEntry[]>([]);

  const viewChildren = () =>
    Array.from(element.children).filter(isKaiViewElement);

  const controller = createViewStack({
    entries,
    // UNTRACKED, and that is the bug fix, not tidiness. The facade body runs
    // inside a TRACKED scope (define.tsx renders `Facade(props, …)` from a JSX
    // children thunk), so a bare `props.view` read here subscribed the whole
    // facade to the prop — and the reflect effect below writes the `view`
    // attribute on every navigation, which loops back into `props.view` and
    // re-ran the body, silently REPLACING the controller (and all its state)
    // mid-flight. The replacement booted from the CURRENT view as a deep link,
    // so a drill entered from a non-default tab root forgot its root: after
    // `selectTab('messages'); push('chat')`, `back()` landed on 'home'.
    // `initialView` is a capture-once value by contract; later `view` writes
    // navigate via the deferred effect below.
    initialView: untrack(() => props.view as string | undefined),
    onViewChange: (state) => dispatch('kai-view-change', state),
  });

  // Discover the light-DOM `<kai-view>` children, and follow adds, removes
  // and `name`/`tab-root` edits (the conversation-item pattern).
  //
  // The cached `entries` refresh on child-list and attribute mutations ONLY, so a
  // post-mount PROPERTY write (`view.name = 'chat'`, which a framework does
  // without touching the attribute) does not invalidate them; that is sufficient
  // today because every place the name actually decides something re-reads the
  // child live via `readViewEntry` -- the active-view effect below does, and it
  // re-runs on each navigation -- and the cached entries only ever supply the
  // controller's set of known views, which a rename does not change the size of.
  onMount(() => {
    const read = () => setEntries(viewChildren().map(readViewEntry));
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, {
      childList: true,
      attributes: true,
      attributeFilter: ['name', 'tab-root', 'id'],
      subtree: true,
    });
    onCleanup(() => observer.disconnect());
  });

  // Show exactly the current view: toggle `hidden` plus a `data-active`
  // styling hook on each child. Entries are in the dependency so a child
  // registered after the first run gets stamped too.
  createEffect(() => {
    const current = controller.view();
    entries();
    for (const child of viewChildren()) {
      const active = readViewEntry(child).name === current;
      // The native `hidden` IDL property, not toggleAttribute: it reflects to
      // the attribute (so `kai-view[hidden]` and the host's `:host([hidden])`
      // rule both see it) AND the property reads back what was set. kai-view
      // deliberately does not declare `hidden` as a facade prop, so the native
      // reflecting accessor is intact (contrast kai-resizable-item, which
      // declares it and loses the reflection — see NOT_REFLECTED in
      // tests/elements/reflected-boolean-coverage.test.ts).
      (child as HTMLElement).hidden = !active;
      if (active) child.setAttribute('data-active', 'true');
      else child.removeAttribute('data-active');
    }
  });

  // Reflect the resolved view name to the `view` attribute. The write echoes
  // back through attributeChangedCallback into `props.view`; the navigate
  // effect below absorbs it with its `v !== controller.view()` guard — the
  // echo always carries the value the controller already holds. ("Idempotent"
  // alone is NOT the safety argument: kai-pane-group reflected idempotently
  // and still self-controlled, because it consulted the echoed prop.)
  createEffect(() => {
    const v = controller.view();
    if (v !== undefined) element.setAttribute('view', v);
  });

  // Later `view` prop/attribute writes navigate; the initial value was
  // consumed by `createViewStack` (lazily, so an attribute parsed before the
  // children upgrade still resolves).
  createEffect(on(() => props.view as string | undefined, (v) => {
    if (v !== undefined && v !== controller.view()) controller.navigate(v);
  }, { defer: true }));

  // `drilled` is container-owned truth: attribute and property both read it.
  reflectFlag('drilled', () => controller.drilled());

  expose({
    /** Drill into a view (fires `kai-view-change`). A tab-root name routes to
     *  `selectTab`; unknown names are ignored. */
    push: (name: string) => controller.push(name),
    /** Pop one drilled view. No-op at a tab root. */
    back: () => controller.back(),
    /** Swap the current view without touching history. */
    replace: (name: string) => controller.replace(name),
    /** Switch tab roots and clear any drill. Ignores non-root names. */
    selectTab: (name: string) => controller.selectTab(name),
    /** Deep-link navigation: what the `view` attribute drives. */
    navigate: (name: string) => controller.navigate(name),
  });

  return <slot />;
});
