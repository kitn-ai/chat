/**
 * ViewStack + View — the mobile-stack view navigator (spec P-3).
 *
 * The navigation model the chat widget uses, shipped as its own part so a
 * block cannot rebuild it differently without noticing (the spike drifted on
 * exactly this, twice): TAB-ROOT views sit side by side behind a tab bar;
 * DRILL views are pushed on top of whichever root they were entered from.
 * The one rule that must hold everywhere:
 *
 *   a DRILLED view hides the tab bar and shows a back affordance;
 *   a TAB ROOT shows the tab bar and no back affordance.
 *
 * The stack OWNS that state and exposes it (`view`, `root`, `drilled`) so a
 * tab bar or header consumes it via the controller / `data-*` hooks instead
 * of reimplementing the policy.
 *
 * Presentation-light by design: this part decides WHICH view renders and
 * nothing else. Non-current views stay MOUNTED and hidden, so per-view state
 * (scroll offsets, half-typed inputs, component state) survives tab switches
 * and drills by construction — "switching resets nothing" is the default and
 * there is no opt-out to get wrong. It never moves focus or scroll: the kit's
 * idiom is an imperative `focus()` on the element that owns the control (see
 * `ChatThread`'s exposed methods), never focus stolen on navigation.
 */
import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onCleanup,
  on,
  type JSX,
  type ParentProps,
} from 'solid-js';

/** One registered view: its name plus whether it is a tab root. */
export interface ViewEntry {
  name: string;
  tabRoot: boolean;
}

/** A snapshot of the navigator's state, as handed to `onViewChange`. */
export interface ViewStackState {
  /** The currently visible view's name. */
  view: string | undefined;
  /** The current tab root (what the tab bar should mark active, and where
   *  `back()` ultimately lands). Defined even while drilled. */
  root: string | undefined;
  /** True while a pushed (non-root) view is showing. THE tab-bar/back rule:
   *  drilled hides the tab bar and shows a back affordance. */
  drilled: boolean;
  /** The names of the pushed views, bottom to top. Empty at a tab root. */
  stack: readonly string[];
}

/** The imperative surface, handed out via the `controller` ref callback and
 *  `useViewStack()`. All getters are reactive Solid accessors. */
export interface ViewStackController {
  view: () => string | undefined;
  root: () => string | undefined;
  drilled: () => boolean;
  stack: () => readonly string[];
  /** Drill into a view: pushes `name` on top of the current view. A back()
   *  returns to wherever you were. Pushing a TAB ROOT can never drill (a
   *  root is definitionally un-drilled), so it routes to `selectTab`.
   *  Unknown names are ignored, like `select()` on `kai-pane-group`. */
  push: (name: string) => void;
  /** Pop one drilled view. No-op at a tab root (nothing to go back to). */
  back: () => void;
  /** Swap the CURRENT view without touching history: while drilled the top
   *  of the stack is replaced (back() then skips the replaced view); at a
   *  root, the root itself is replaced — `drilled` stays false and no back
   *  affordance appears. A tab-root name routes to `selectTab`. Unknown
   *  names are ignored. */
  replace: (name: string) => void;
  /** Switch tab roots: shows `name` as the root and clears any drill. The
   *  views themselves stay mounted, so nothing about them resets. Names not
   *  registered as a tab root are ignored. */
  selectTab: (name: string) => void;
  /** Deep-link entry point (what the element's `view` attribute drives): a
   *  tab root selects that tab; any other registered name replaces the top
   *  while drilled, or pushes when at a root. Unknown names are ignored. */
  navigate: (name: string) => void;
}

export interface CreateViewStackOptions {
  /** The registered views, in declaration order. Reactive: element facades
   *  feed this from observed light-DOM children. The first tab root (else
   *  the first entry) is the default root. */
  entries: () => readonly ViewEntry[];
  /** Deep link / initial view. A tab-root name becomes the starting root;
   *  any other registered name boots DRILLED over the default root, so the
   *  back affordance is present from the first frame. Resolved lazily
   *  against `entries`, so it works even when set before views register
   *  (an attribute parsed before child elements upgrade). */
  initialView?: string;
  /** Fired after every navigation that changed the current view or the
   *  drilled flag. Not fired for the initial state. */
  onViewChange?: (state: ViewStackState) => void;
}

/** Headless core: the state machine alone, no DOM. Both the Solid
 *  `<ViewStack>` component and the `<kai-view-stack>` element run on this. */
export function createViewStack(options: CreateViewStackOptions): ViewStackController {
  const entries = options.entries;
  const initial = options.initialView;

  const find = (name: string) => entries().find((e) => e.name === name);
  const isTabRoot = (name: string) => find(name)?.tabRoot === true;
  const defaultRoot = () => entries().find((e) => e.tabRoot)?.name ?? entries()[0]?.name;

  // Explicit state exists only once the user navigates; until then everything
  // derives from `initialView` + the (possibly still-registering) entries.
  const [explicitRoot, setExplicitRoot] = createSignal<string>();
  const [rawStack, setRawStack] = createSignal<readonly string[]>();

  const root = () => {
    const r = explicitRoot();
    if (r !== undefined) return r;
    if (initial !== undefined && isTabRoot(initial)) return initial;
    return defaultRoot();
  };
  const stack = (): readonly string[] => {
    const s = rawStack();
    if (s !== undefined) return s;
    // Deep link to a non-root view: boot drilled over the default root.
    if (initial !== undefined && find(initial) !== undefined && !isTabRoot(initial)) return [initial];
    return [];
  };
  const view = () => stack().at(-1) ?? root();
  const drilled = () => stack().length > 0;

  const snapshot = (): ViewStackState => ({ view: view(), root: root(), drilled: drilled(), stack: stack() });

  /** Run a mutation; notify only when the visible outcome actually moved. */
  const commit = (mutate: () => void) => {
    const before = view();
    const beforeDrilled = drilled();
    mutate();
    if (view() !== before || drilled() !== beforeDrilled) options.onViewChange?.(snapshot());
  };

  const selectTab = (name: string) => {
    if (!isTabRoot(name)) return;
    commit(() => {
      setExplicitRoot(name);
      setRawStack([]);
    });
  };

  const push = (name: string) => {
    if (find(name) === undefined) return;
    if (isTabRoot(name)) return selectTab(name);
    commit(() => setRawStack([...stack(), name]));
  };

  const back = () => {
    if (!drilled()) return;
    commit(() => setRawStack(stack().slice(0, -1)));
  };

  const replace = (name: string) => {
    if (find(name) === undefined) return;
    if (isTabRoot(name)) return selectTab(name);
    commit(() => {
      if (drilled()) setRawStack([...stack().slice(0, -1), name]);
      else {
        // Replacing at a root swaps the root view itself: no history grows,
        // `drilled` stays false, no back affordance appears.
        setExplicitRoot(name);
        setRawStack([]);
      }
    });
  };

  const navigate = (name: string) => {
    if (find(name) === undefined) return;
    if (isTabRoot(name)) return selectTab(name);
    if (drilled()) return replace(name);
    push(name);
  };

  return { view, root, drilled, stack, push, back, replace, selectTab, navigate };
}

interface ViewStackContextValue {
  register: (entry: ViewEntry) => () => void;
  controller: ViewStackController;
}

const ViewStackContext = createContext<ViewStackContextValue>();

/** Reach the enclosing `<ViewStack>`'s controller from inside a view — a back
 *  button in a drilled header, or a tab bar reading `drilled()` to hide
 *  itself. Throws outside a `<ViewStack>`. */
export function useViewStack(): ViewStackController {
  const ctx = useContext(ViewStackContext);
  if (!ctx) throw new Error('useViewStack must be used inside <ViewStack>');
  return ctx.controller;
}

export interface ViewStackProps extends ParentProps {
  /** Deep link / initial view name; later changes navigate (see
   *  `ViewStackController.navigate`). */
  view?: string;
  /** Fired after every navigation that changed the current view or the
   *  drilled flag. */
  onViewChange?: (state: ViewStackState) => void;
  /** Ref callback receiving the imperative controller. */
  controller?: (controller: ViewStackController) => void;
  class?: string;
}

/**
 * The view container. Declare views as `<View>` children; exactly one shows
 * at a time, the rest stay mounted and hidden. The wrapper carries
 * `data-view` (current name) and `data-drilled` ("true"/"false") so sibling
 * chrome can follow the state from CSS or a test without the controller.
 */
export function ViewStack(props: ViewStackProps): JSX.Element {
  const [entries, setEntries] = createSignal<readonly ViewEntry[]>([]);

  const controller = createViewStack({
    entries,
    initialView: props.view,
    onViewChange: (state) => props.onViewChange?.(state),
  });

  // Later `view` prop changes navigate; the initial value was consumed above.
  createEffect(on(() => props.view, (v) => {
    if (v !== undefined && v !== controller.view()) controller.navigate(v);
  }, { defer: true }));

  props.controller?.(controller);

  const register = (entry: ViewEntry) => {
    setEntries((prev) => [...prev, entry]);
    return () => setEntries((prev) => prev.filter((e) => e !== entry));
  };

  return (
    <ViewStackContext.Provider value={{ register, controller }}>
      <div
        class={props.class}
        data-view={controller.view()}
        data-drilled={controller.drilled() ? 'true' : 'false'}
      >
        {props.children}
      </div>
    </ViewStackContext.Provider>
  );
}

export interface ViewProps extends ParentProps {
  /** The view's name — what `push`/`selectTab`/`navigate` address. */
  name: string;
  /** Marks this view as a TAB ROOT: it shows the tab bar and never a back
   *  affordance; a tab switch lands here directly. Views without it are
   *  DRILL views, reached by `push` and left by `back`. */
  tabRoot?: boolean;
  class?: string;
}

/**
 * One view inside a `<ViewStack>`. Stays mounted while hidden (that is what
 * makes tab switching reset nothing), toggling the native `hidden` attribute
 * plus a `data-active` hook.
 */
export function View(props: ViewProps): JSX.Element {
  const ctx = useContext(ViewStackContext);
  if (!ctx) throw new Error('<View> must be a child of <ViewStack>');
  // Registration is render-time (not onMount) so declaration order is the
  // entry order and the first frame already knows its default root.
  const entry: ViewEntry = { name: props.name, tabRoot: props.tabRoot === true };
  onCleanup(ctx.register(entry));

  const active = () => ctx.controller.view() === props.name;
  return (
    <div
      class={props.class}
      data-view-name={props.name}
      data-active={active() ? 'true' : 'false'}
      hidden={!active()}
    >
      {props.children}
    </div>
  );
}
