import { createSignal, createEffect, on, onMount, onCleanup, For, Show, type JSX } from 'solid-js';
import { defineWebComponent } from './define';
import { ResizableHandle, normalizeSize, clampBasis } from '../ui/resizable';

type Orientation = 'horizontal' | 'vertical';

/** Bubbling, composed intent: a descendant asks the nearest enclosing
 *  <kai-resizable> to maximize the item containing it (filling, hiding siblings)
 *  or to restore. Any panel content may emit it — the protocol is zero-config. */
export interface KaiMaximizeIntentDetail {
  /** true = maximize the item containing me; false = restore. */
  requested: boolean;
}

/** Composed, non-bubbling notification the group dispatches DOWN onto the
 *  affected <kai-resizable-item> (on maximize) or the group host + the formerly
 *  maximized item (on restore) so descendant content can sync its affordance. */
export interface KaiMaximizeStateDetail {
  /** Whether THIS subtree's item is the maximized one. */
  maximized: boolean;
}

/** Event type names for the cross-element maximize protocol. */
export const KAI_MAXIMIZE_INTENT = 'kai-maximize-intent' as const;
export const KAI_MAXIMIZE_STATE = 'kai-maximize-state' as const;

/** Parsed view of a `<kai-resizable-item>` light child. */
interface ItemInfo {
  el: HTMLElement;
  size?: string;
  /** Original configured size, captured once and stable across drags (for dblclick-reset). */
  defaultSize?: string;
  min?: string;
  max?: string;
  locked: boolean;
  hidden: boolean;
  collapsed: boolean;
}

/** Max number of panels a single group lays out (nest for more). */
const MAX_ITEMS = 3;

/** Convert a px-or-% bound to `data-*` attribute values the handle understands. */
function boundAttrs(value: string | undefined): { pxAttr?: string; pctAttr?: string } {
  if (value === undefined || value === '') return {};
  const t = value.trim();
  if (t.endsWith('px')) return { pxAttr: String(parseFloat(t)) };
  if (t.endsWith('%')) return { pctAttr: String(parseFloat(t)) };
  if (Number.isFinite(Number(t))) return { pctAttr: t };
  return {};
}

interface GroupProps extends Record<string, unknown> {
  /** Layout axis: `horizontal` (row, default) or `vertical` (column). */
  orientation?: Orientation;
  /** Which item index is maximized (null = none). Declarative source of truth. */
  maximizedIndex?: number | null;
  /**
   * Divider affordance drawn inside each draggable handle's 8px grab zone:
   * - `line` (default): a 1px hairline, transparent at rest, tinting on hover/drag.
   * - `grip`: a dotted grip handle.
   * - `none`: no visible divider, just the invisible hit-area.
   * The full grab zone and keyboard/ARIA behavior are identical for all three.
   */
  handle?: 'line' | 'grip' | 'none';
}

interface GroupEvents extends Record<string, unknown> {
  /** Fired on drag-end / keyboard resize / visibility change. `detail.sizes` = panel sizes in percent. */
  'kai-change': { sizes: number[] };
  /** Observe layout maximize state. */
  'kai-maximize-change': { maximized: boolean; index: number | null };
  /** Authoritative maximize state, dispatched as a raw composed CustomEvent (not
   *  through `dispatch`) onto the affected `<kai-resizable-item>` and, on restore,
   *  onto the group host. A nested element (e.g. `<kai-artifact>`) listens for it
   *  to reconcile its own toggle. */
  'kai-maximize-state': { maximized: boolean };
}

/**
 * `<kai-resizable>` — a composable, resizable multi-panel layout (up to 3 panels)
 * with auto-inserted draggable dividers. It lays out its `<kai-resizable-item>`
 * light children along an axis (`orientation`), reading each item's `size`,
 * `min`, `max`, `locked` and `hidden` attributes via a `MutationObserver`. A
 * divider is interactive only between two unlocked, visible panels. Emits a
 * `change` event (`detail.sizes`, percent) on resize / visibility change.
 */
defineWebComponent<GroupProps, GroupEvents>('kai-resizable', {
  orientation: 'horizontal',
  maximizedIndex: null,
  handle: 'line',
}, (props, { element, dispatch, expose }) => {
  const [items, setItems] = createSignal<ItemInfo[]>([]);
  const orientation = (): Orientation => (props.orientation === 'vertical' ? 'vertical' : 'horizontal');

  /** Read the current `<kai-resizable-item>` light children + their attributes. */
  function readItems() {
    const all = Array.from(element.children).filter(
      (c): c is HTMLElement => c.tagName.toLowerCase() === 'kai-resizable-item',
    );
    if (all.length > MAX_ITEMS) {
      // eslint-disable-next-line no-console
      console.warn(
        `<kai-resizable>: only the first ${MAX_ITEMS} <kai-resizable-item> children are laid out ` +
        `(got ${all.length}). Nest <kai-resizable> for more.`,
      );
    }
    const capped = all.slice(0, MAX_ITEMS);
    const parsed: ItemInfo[] = capped.map((el) => {
      // Capture the ORIGINAL configured size ONCE per item, before any drag (or
      // `persistSizes`) overwrites the live `size` attribute. Stashed on a non-
      // observed data-* attr so dblclick-reset always snaps to the true default,
      // not to wherever the user last dragged. Empty string = no explicit default.
      if (!el.hasAttribute('data-kai-default-size')) {
        el.setAttribute('data-kai-default-size', el.getAttribute('size') ?? '');
      }
      const defaultSize = el.getAttribute('data-kai-default-size') || undefined;
      // The `collapsed` boolean prop is reflected to a `collapsed` attribute by the
      // item facade (see kai-resizable-item), so reading the attribute here works
      // at INITIAL render from any framework — unlike the bare `hidden` boolean,
      // whose JSX form sets neither the attribute nor the IDL property on a custom
      // element. Treated as hidden-for-layout, independently of `hidden` so the
      // back-compat hidden path (and maximize, which drives `hidden`) is untouched.
      const collapsed = el.hasAttribute('collapsed') && el.getAttribute('collapsed') !== 'false';
      return {
        el,
        size: el.getAttribute('size') ?? undefined,
        defaultSize,
        min: el.getAttribute('min') ?? undefined,
        max: el.getAttribute('max') ?? undefined,
        locked: el.hasAttribute('locked') && el.getAttribute('locked') !== 'false',
        // Honour both the `hidden` attribute and the property, because on THIS element
        // they are two independent halves of the state and either can be the only one
        // set. Not a fact about custom elements in general — a custom element that does
        // not declare a `hidden` prop keeps the native reflecting accessor. It is a fact
        // about this one: `<kai-resizable-item>` declares `hidden: false`, so
        // component-register owns the property and nothing reflects. Measured:
        // `el.hidden = true` writes no attribute, and after maximize writes the
        // attribute `el.hidden` reads `undefined`. This union is what absorbs that, and
        // it is why `hidden` is exempt from the reflectFlag migration rather than broken
        // by it — see reflectItemConfig's doc below.
        hidden: el.hidden || (el.hasAttribute('hidden') && el.getAttribute('hidden') !== 'false'),
        collapsed,
      };
    });

    // Assign each visible item to its panel slot by visible order; clear the
    // rest so hidden/extra/collapsed items don't leak into a slot.
    let visIdx = 0;
    for (const info of parsed) {
      if (info.hidden || info.collapsed) {
        info.el.removeAttribute('slot');
      } else {
        info.el.setAttribute('slot', `p${visIdx}`);
        visIdx++;
      }
    }
    for (const el of all.slice(MAX_ITEMS)) el.removeAttribute('slot');

    // BUG FIX (U10b): the MutationObserver fires for ANY subtree change, including
    // a slotted child re-rendering its CONTENT (e.g. a new chat message). If we
    // unconditionally `setItems(parsed)`, the <For> re-keys and each panel's
    // flex-basis is re-derived from the item's `size` ATTRIBUTE — wiping out any
    // size the user dragged (which lives only as inline flex-basis on the panel
    // div, set by ResizableHandle.settleToPercent). The composite <kai-workspace>
    // never hits this because it renders Solid panels directly with no re-read.
    //
    // So: only commit a new items() array when the panel LAYOUT actually changed —
    // i.e. an item was added/removed, or a config attribute (size/min/max/locked/
    // hidden) changed. A pure content mutation is structurally identical and is
    // skipped, leaving the dragged inline basis intact.
    if (!itemsChanged(items(), parsed)) return;
    setItems(parsed);
  }

  /** True when the parsed item list differs structurally (identity, order, or any
   *  layout-affecting config attribute) from the current one. Content-only
   *  mutations leave every field equal → returns false → no re-render. */
  function itemsChanged(prev: ItemInfo[], next: ItemInfo[]): boolean {
    if (prev.length !== next.length) return true;
    for (let i = 0; i < prev.length; i++) {
      const a = prev[i];
      const b = next[i];
      if (a.el !== b.el) return true;
      if (a.size !== b.size || a.min !== b.min || a.max !== b.max) return true;
      if (a.locked !== b.locked || a.hidden !== b.hidden || a.collapsed !== b.collapsed) return true;
    }
    return false;
  }

  const visible = () => items().filter((i) => !i.hidden && !i.collapsed);

  /** Compute current panel sizes (percent of container) from the rendered DOM. */
  function currentSizes(): number[] {
    return visible().map((info) => {
      const panel = info.el.assignedSlot?.closest('[data-panel]') as HTMLElement | null;
      const target = panel ?? info.el;
      const parent = target.parentElement;
      const dim = orientation() === 'horizontal' ? 'width' : 'height';
      const total = parent ? parent.getBoundingClientRect()[dim] : 0;
      const val = target.getBoundingClientRect()[dim];
      return total > 0 ? Math.round((val / total) * 100) : 0;
    });
  }

  function emitChange() {
    dispatch('kai-change', { sizes: currentSizes() });
  }

  /** Guard: while writing `size` attributes back from a live layout, the
   *  MutationObserver must NOT treat our own writes as an external structural
   *  change (which would re-render and could fight the in-flight drag). */
  let persistingSizes = false;

  /**
   * BUG FIX (U10b) — durability: a drag/keyboard resize writes inline flex-basis
   * onto the panel divs only; the item `size` ATTRIBUTE (the source of truth that
   * `readItems` re-derives basis from) is left at its initial value. Persist the
   * live percent back to each visible item's `size` attribute so the dragged
   * layout survives ANY later re-read (including a genuine add/remove relayout),
   * not just content-only mutations. Guarded so it doesn't trip the observer.
   */
  function persistSizes() {
    const vis = visible();
    const live = currentSizes();
    if (vis.length !== live.length) return;
    persistingSizes = true;
    vis.forEach((info, i) => {
      const pct = live[i];
      if (Number.isFinite(pct) && pct > 0) info.el.setAttribute('size', `${pct}%`);
    });
    // Hold the guard across the MutationObserver microtask (it fires AFTER this
    // synchronous code), then clear it — otherwise the observer sees the flag
    // already false and re-reads our own writes. Same pattern as applyingMaximize.
    queueMicrotask(() => { persistingSizes = false; });
  }

  // --- Task 2: maximize/restore core ---

  interface SavedItemState {
    el: HTMLElement;
    size: string | null;
    hidden: boolean;
    locked: boolean;
  }
  interface MaximizeStash {
    /** The element that was maximized (identity anchor for re-target + events). */
    item: HTMLElement;
    /** Per-element stash keyed by element identity, not position. */
    saved: SavedItemState[];
  }
  const [maximized, setMaximized] = createSignal<MaximizeStash | null>(null);
  /** Re-entrancy guard: while we (un)apply maximize attributes, the observer must
   *  NOT emit a mid-flight `change`. The final relayout emits the real one. */
  let applyingMaximize = false;

  /** Find the capped <kai-resizable-item> ancestor of an event target, if any. */
  function findContainingItem(node: Node | null): HTMLElement | null {
    let el = node instanceof Element ? node : node?.parentElement ?? null;
    // The intent is composed; its target may be inside the artifact's shadow.
    // Resolve to a direct light child <kai-resizable-item> of THIS group.
    const capped = items().map((i) => i.el);
    while (el) {
      if (el instanceof HTMLElement && capped.includes(el)) return el;
      el = el.parentElement ?? (el.getRootNode() as ShadowRoot).host ?? null;
    }
    return null;
  }

  function readAttrState(el: HTMLElement) {
    return {
      size: el.getAttribute('size'),
      hidden: el.hidden || (el.hasAttribute('hidden') && el.getAttribute('hidden') !== 'false'),
      locked: el.hasAttribute('locked') && el.getAttribute('locked') !== 'false',
    };
  }

  function setBoolAttr(el: HTMLElement, name: string, on: boolean) {
    if (on) el.setAttribute(name, '');
    else el.removeAttribute(name);
  }

  function maximizeItem(item: HTMLElement) {
    const list = items();
    const index = list.findIndex((i) => i.el === item);
    if (index < 0) return;
    const current = maximized();
    if (current) {
      if (current.item === item) return;       // same item → no-op
      restore();                               // different item → re-target
    }
    applyingMaximize = true;
    // Capture the EFFECTIVE current % so a post-drag layout restores faithfully.
    const live = currentSizes(); // visible-order percents (Playwright-verified)
    let visIdx = 0;
    const saved: SavedItemState[] = list.map((info) => {
      const prev = readAttrState(info.el);
      if (!prev.hidden) {
        // Write the live % back as the stashed size baseline.
        const pct = live[visIdx++];
        if (Number.isFinite(pct) && pct > 0) info.el.setAttribute('size', `${pct}%`);
      }
      return { el: info.el, size: info.el.getAttribute('size'), hidden: prev.hidden, locked: prev.locked };
    });
    // Hide every other item; free the maximized one to fill.
    list.forEach((info, i) => {
      if (i === index) {
        info.el.removeAttribute('size');
        info.el.removeAttribute('locked');
        setBoolAttr(info.el, 'hidden', false);
      } else {
        setBoolAttr(info.el, 'hidden', true);
      }
    });
    setMaximized({ item, saved });
    element.setAttribute('data-maximized', '');
    item.setAttribute('data-maximized-panel', '');
    readItems();
    emitChange();
    // Keep applyingMaximize = true until AFTER the MutationObserver microtask fires
    // so its queueMicrotask(emitChange) sees the guard and skips (storm guard).
    queueMicrotask(() => { applyingMaximize = false; });
    // Tell the maximized subtree (and only it) it is now maximized.
    item.dispatchEvent(new CustomEvent('kai-maximize-state', { detail: { maximized: true }, bubbles: false, composed: true }));
    dispatch('kai-maximize-change', { maximized: true, index });
  }

  function restore() {
    const stash = maximized();
    if (!stash) return;
    applyingMaximize = true;
    // Re-apply saved state keyed by element identity; items no longer in the DOM
    // are simply skipped.  This is safe regardless of sibling additions/removals
    // that happened while maximized (no index drift).
    for (const s of stash.saved) {
      if (!s.el.isConnected) continue;
      if (s.size === null) s.el.removeAttribute('size');
      else s.el.setAttribute('size', s.size);
      setBoolAttr(s.el, 'hidden', s.hidden);
      setBoolAttr(s.el, 'locked', s.locked);
      s.el.removeAttribute('data-maximized-panel');
    }
    const prevItem = stash.item;
    setMaximized(null);
    element.removeAttribute('data-maximized');
    readItems();
    emitChange();
    // Keep applyingMaximize = true until AFTER the MutationObserver microtask fires
    // so its queueMicrotask(emitChange) sees the guard and skips (storm guard).
    queueMicrotask(() => { applyingMaximize = false; });
    // Broadcast restore on the host AND directly on the formerly-maximized item.
    element.dispatchEvent(new CustomEvent('kai-maximize-state', { detail: { maximized: false }, bubbles: false, composed: true }));
    prevItem?.dispatchEvent(new CustomEvent('kai-maximize-state', { detail: { maximized: false }, bubbles: false, composed: true }));
    dispatch('kai-maximize-change', { maximized: false, index: null });
  }

  onMount(() => {
    readItems();
    const onIntent = (e: Event) => {
      const ce = e as CustomEvent<KaiMaximizeIntentDetail>;
      e.stopPropagation();                       // nearest group wins (nesting)
      const item = findContainingItem(ce.target as Node);
      if (!item) return;                         // outside any item → ignore
      if (ce.detail.requested) maximizeItem(item);
      else restore();
    };
    element.addEventListener('kai-maximize-intent', onIntent);

    const onKeydown = (e: KeyboardEvent) => {
      // Only act while maximized — the capture listener on the host already
      // ensures the event originates within the group.
      if (e.key !== 'Escape' || !maximized()) return;
      e.stopPropagation();
      restore();
    };
    element.addEventListener('keydown', onKeydown, true);

    const mo = new MutationObserver(() => {
      // Skip our OWN per-drag size writes (persistSizes). Re-reading here would
      // setItems() → re-render the <For>, replacing the ResizableHandle mid-drag
      // and dropping its pointer capture — the drag stalls after the first move.
      // (The flag is held across this observer microtask; see persistSizes.)
      if (persistingSizes) return;
      readItems();
      const stash = maximized();
      if (stash) {
        // Use element identity, not a positional index, to detect whether the
        // maximized item is still present and visible.
        const maximizedEl = stash.item;
        const isConnected = maximizedEl.isConnected && element.contains(maximizedEl);
        const isVisible = isConnected
          && !(maximizedEl.hidden || maximizedEl.hasAttribute('hidden'))
          && !(maximizedEl.hasAttribute('collapsed') && maximizedEl.getAttribute('collapsed') !== 'false');
        if (!isConnected || !isVisible) {
          // The maximized item was removed or hidden/collapsed out from under us → restore.
          restore();
          return;
        }
      }
      if (applyingMaximize) return; // our own maximize writes — skip the emit
      queueMicrotask(emitChange);
    });
    mo.observe(element, {
      childList: true,
      // Attribute changes happen on the <kai-resizable-item> *children*, so we
      // must observe the subtree (filtered to the config attributes) — not just
      // the host's own attributes.
      subtree: true,
      attributes: true,
      attributeFilter: ['size', 'locked', 'min', 'max', 'hidden', 'collapsed'],
    });
    onCleanup(() => {
      mo.disconnect();
      element.removeEventListener('kai-maximize-intent', onIntent);
      element.removeEventListener('keydown', onKeydown, true);
    });

    // --- Task 3: imperative host methods + declarative maximizedIndex prop ---

    // Imperative host API. Routed through `expose()` like every other element's,
    // so gen-element-api.mjs sees it and the generated element interface carries
    // `maximize`/`restore` — a direct assignment onto `element` was invisible to
    // the extractor and needed an `as unknown as` cast to type-check here.
    expose({
      /** Imperatively maximize the item at `index` (thin wrapper over `maximizedIndex`). */
      maximize: (index: number) => {
        const it = items()[index]?.el;
        if (it) maximizeItem(it);
      },
      /** Imperatively restore from the maximized layout. */
      restore: () => restore(),
    });

    // Declarative maximizedIndex → maximize/restore. Skip the initial null run.
    createEffect(
      on(
        () => props.maximizedIndex,
        (idx) => {
          if (idx == null) restore();
          else {
            const it = items()[idx]?.el;
            if (it) maximizeItem(it);
          }
        },
        { defer: true },
      ),
    );
  });

  const isHoriz = () => orientation() === 'horizontal';

  return (
    <>
      {/* A resizable layout fills its container — default the host to a block
          that stretches, so consumers only need to give a parent (or the element)
          a height. Override with an explicit height on the element if needed. */}
      <style>{':host{display:block;height:100%}'}</style>
    <div
      data-resizable-root
      data-orientation={orientation()}
      style={{
        display: 'flex',
        'flex-direction': isHoriz() ? 'row' : 'column',
        width: '100%',
        height: '100%',
      }}
    >
      <For each={visible()}>
        {(info, i) => {
          const min = boundAttrs(info.min);
          const max = boundAttrs(info.max);
          const def = boundAttrs(info.defaultSize);
          // Clamp the INITIAL basis into [min, max] so a % size on a wide
          // container never paints past a px max and then snaps on first drag.
          const basis = clampBasis(normalizeSize(info.size), normalizeSize(info.min), normalizeSize(info.max));
          const prev = () => visible()[i() - 1];
          const isStatic = () => !!(info.locked || prev()?.locked);
          return (
            <>
              <Show when={i() > 0}>
                <ResizableHandle
                  handle={props.handle ?? 'line'}
                  orientation={orientation()}
                  static={isStatic()}
                  onPanelResize={() => {
                    // Persist the dragged/dblclick-reset layout back to the item
                    // `size` attributes so it survives later re-reads, then emit.
                    persistSizes();
                    queueMicrotask(emitChange);
                  }}
                />
              </Show>
              <div
                data-panel
                data-locked={info.locked ? '' : undefined}
                data-min-size={min.pxAttr}
                data-min-size-pct={min.pctAttr}
                data-max-size={max.pxAttr}
                data-max-size-pct={max.pctAttr}
                // Reflect the configured default size so a dblclick on the
                // adjacent <ResizableHandle> can snap this panel back to it.
                data-default-size={def.pxAttr}
                data-default-size-pct={def.pctAttr}
                style={{
                  // The panel is a flex item of the root: `flex-basis` sizes its
                  // MAIN axis (width when horizontal, height when vertical) and the
                  // drag/keyboard handlers rewrite that basis — so the layout spine
                  // stays a plain flex row/column (drag math unchanged).
                  //
                  // For the FILL, the panel is itself a `display:grid` with a single
                  // `minmax(0,1fr)` cell on BOTH axes. A grid item (the slotted
                  // `<kai-resizable-item>`) stretches to fill its cell on both axes by
                  // default (`place-items:stretch`), and a `1fr` track inside a
                  // definite-sized grid is a *definite* length — so content fills
                  // height AND width whether or not it sets `height:100%`, in both
                  // orientations. A flex panel only stretches the CROSS axis (which is
                  // why the previous `display:flex` panel collapsed the main axis to
                  // content height). This mirrors how Shoelace/Web Awesome
                  // `<sl-split-panel>` lay panels out with grid for guaranteed fill,
                  // adapted here to a per-panel grid cell (our double slot boundary
                  // makes a slot-as-grid-item unusable — a slot with assigned nodes
                  // has a zero box). min:0 on both axes enables shrink-to-scroll;
                  // overflow clips (the item owns the scroll).
                  ...(basis !== undefined
                    ? { 'flex-basis': basis, 'flex-grow': '0', 'flex-shrink': '0' }
                    : { flex: '1 1 0%' }),
                  display: 'grid',
                  'grid-template-rows': 'minmax(0, 1fr)',
                  'grid-template-columns': 'minmax(0, 1fr)',
                  'min-width': '0',
                  'min-height': '0',
                  overflow: 'hidden',
                }}
              >
                <slot name={`p${i()}`} />
              </div>
            </>
          );
        }}
      </For>
    </div>
    </>
  );
});

/**
 * Reflect a `<kai-resizable-item>`'s reactive CONFIG props to the ATTRIBUTES the
 * parent `<kai-resizable>` reads (`readItems()` + its `size`/`min`/`max`/`locked`
 * MutationObserver). Framework runtimes (React et al.) assign these as DOM
 * *properties* — `el.size = "280px"` — but component-register only mirrors
 * attribute→property, never the reverse, so a property-set size never becomes an
 * attribute and the parent silently falls back to a flexible split. This is the
 * exact class of bug the `collapsed` reflection already fixed; handled here for
 * `size`/`min`/`max` (the STRINGS). The booleans — `collapsed` and `locked` — go
 * through `reflectFlag` in the facade body instead, which reflects AND keeps the
 * property readable; see WebComponentContext.reflectFlag.
 *
 * `hidden` is deliberately NOT reflected, and NOT because it is already fine — it is
 * split exactly like the others, and measurably so: `el.hidden = true` leaves no
 * attribute (a plain `<div>` gets one), and after maximize writes the attribute
 * `el.hidden` reads `undefined`. Declaring `hidden: false` is what does it — it makes
 * `hidden` a component-register prop, whose non-reflecting accessor shadows the native
 * reflecting one. What makes the split HARMLESS here is that both readers take the
 * union, `el.hidden || el.hasAttribute('hidden')`, so neither half can be missed.
 * Routing it through `reflectFlag` would put a second writer on an attribute the
 * maximize/restore path already owns, so it is a behaviour decision of its own rather
 * than part of the read-back fix. See the exemption in
 * tests/elements/reflected-boolean-coverage.test.ts.
 *
 * Durability (don't fight drags): the parent WRITES `size` back to the live percent
 * during a drag (`persistSizes` → `setAttribute('size', …)`), and that attribute
 * write back-propagates into this prop's signal (component-register's
 * attributeChangedCallback → property → the solid-element prop signal). A naive
 * "reflect on every signal change" effect would therefore re-stomp the dragged size
 * the next time a framework re-render re-asserts the ORIGINAL declared `size`
 * (e.g. React re-runs `el.size = "280px"` on every render). So each string reflect
 * only writes when the value the CONSUMER declared actually changes: a signal value
 * that already equals the current attribute came FROM an attribute write (a drag),
 * not the consumer, so it is left untouched and is not adopted as the new baseline.
 * Net effect: a dragged size survives re-renders, while an explicit `size` change
 * still applies. `size` prop signals use Solid's DEFAULT (same-value-skipping)
 * equality — this guard is needed on top of that only because of the drag-write
 * back-propagation, which same-value-skip alone can't see.
 *
 * Exported for unit testing (the live Shadow-DOM element is not jsdom-friendly).
 */
export function reflectItemConfig(
  element: HTMLElement,
  props: { readonly size?: string; readonly min?: string; readonly max?: string },
) {
  const norm = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
  const reflectString = (name: 'size' | 'min' | 'max') => {
    // Last value the CONSUMER declared (distinct from a value the parent wrote to
    // the attribute mid-drag). Starts `undefined`, which `norm` never returns, so
    // the first genuine value always reflects.
    let lastConsumer: string | null | undefined;
    createEffect(() => {
      const desired = norm(props[name]); // reactive read
      if (desired === lastConsumer) return; // consumer intent unchanged → leave the attr (the drag owns it)
      const current = element.getAttribute(name);
      // Already matches — either untouched or the parent wrote it (drag). Don't
      // adopt it as the consumer baseline and don't fight it.
      if (desired === current) return;
      lastConsumer = desired;
      if (desired === null) element.removeAttribute(name);
      else element.setAttribute(name, desired);
    });
  };
  reflectString('size');
  reflectString('min');
  reflectString('max');
  // `locked` used to be reflected here too. It is a BOOLEAN, so it now goes through
  // `reflectFlag` in the facade body next to `collapsed` — a boolean reflected with a
  // bare `toggleAttribute` reads back `undefined` (see WebComponentContext.reflectFlag),
  // and `reflectFlag` is only reachable from the facade's context. What is left here is
  // the string props, which is this helper's real subject: the drag-durability guard.
}

interface ItemProps extends Record<string, unknown> {
  /** Initial main-axis size: `"280px"` (fixed) or `"25%"`/`25` (percent). Omitted → flexible. */
  size?: string;
  /** Minimum size during resize (px or %). */
  min?: string;
  /** Maximum size during resize (px or %). */
  max?: string;
  /** Fix this panel's size; adjacent dividers become non-draggable. */
  locked?: boolean;
  /** Hide this panel; its divider is dropped and the rest reflow. */
  hidden?: boolean;
  /**
   * Collapse this panel. Same layout effect as `hidden` (divider dropped, the rest
   * reflow), but it WORKS as a bare boolean from framework JSX. A plain
   * `<kai-resizable-item collapsed>` in React/Solid/Vue/Svelte collapses the panel
   * at the first render; `hidden` does not, because a JSX boolean sets neither the
   * `hidden` attribute nor the IDL property on a custom element, so the parent never
   * sees it. The facade reflects `collapsed` to a `collapsed` attribute the parent
   * reads. Prefer this over `hidden` for declarative collapse.
   */
  collapsed?: boolean;
}

/**
 * `<kai-resizable-item>` — a passive config-carrier inside `<kai-resizable>`. It
 * renders its own slotted light content (`<slot/>`); the parent `<kai-resizable>`
 * reads its `size`/`min`/`max`/`locked`/`hidden` attributes to lay it out.
 */
defineWebComponent<ItemProps>('kai-resizable-item', {
  size: undefined,
  min: undefined,
  max: undefined,
  locked: false,
  hidden: false,
  collapsed: false,
}, (props, { element, reflectFlag }) => {
  // Reflect the reactive `collapsed` prop to the `collapsed` ATTRIBUTE the parent
  // <kai-resizable> reads (and observes). This is what makes a bare JSX boolean
  // collapse the panel at INITIAL render from any framework: component-register
  // parses `<kai-resizable-item collapsed>` to `undefined` (not `true`), and a JSX
  // boolean sets neither `hidden` nor the IDL property — so the flag resolution
  // (which also honours the attribute) is the reliable source, and the attribute is
  // mirrored back so the parent's readItems()/MutationObserver lay it out. Same
  // pattern as <kai-chat>'s `loading` reflection, and now literally the same code:
  // `reflectFlag` also makes `el.collapsed` READ BACK, which a hand-rolled
  // toggleAttribute effect does not (WebComponentContext.reflectFlag).
  //
  // We touch only `collapsed` and `locked`, never `hidden`, so the back-compat hidden
  // path and maximize (which drive `hidden`) are untouched — see the named exemption
  // in tests/elements/reflected-boolean-coverage.test.ts for why `hidden` is a
  // separate decision rather than an oversight.
  reflectFlag('collapsed');
  // `locked` is the parent's other boolean input; the parent also writes it during
  // maximize/restore, and because the flag resolution re-derives from that same
  // attribute state the reflection stays self-consistent (no fight).
  reflectFlag('locked');
  // Reflect the STRING config props (`size`/`min`/`max`) property→attribute for the
  // SAME reason — a framework that sets them as DOM properties (React et al.) would
  // otherwise be invisible to the parent. See reflectItemConfig for the
  // drag-durability guard on `size`.
  reflectItemConfig(element, props);
  return (
  <>
    {/* The item host fills the panel's single grid cell (the panel stretches it on
        both axes) and OWNS the scroll: `display:block; width/height:100%;
        overflow:auto`. min:0 enables shrink-to-scroll.

        The FILL of the *slotted* content happens one level in: a `display:grid`
        wrapper with a single `minmax(0,1fr)` cell whose ONLY child is the `<slot>`.
        A grid item stretches to fill its cell on BOTH axes by default
        (`place-items:stretch`) into a *definite* `1fr` track, so slotted content
        fills width AND height whether or not it sets `height:100%`. The grid MUST
        be its own element wrapping the slot — NOT the host — because the element
        facade renders an empty portal-mount `<div>` (for overlays) as a sibling of
        the facade output; if the host itself were the grid, that portal div would
        become a second grid item and steal a track (collapsing content to the auto
        row). Scoping the grid to a wrapper whose sole child is the slot keeps
        exactly one grid item and is robust to the facade's portal sibling.
        Mirrors how Shoelace/Web Awesome `<sl-split-panel>` use grid for fill. */}
    <style>{':host{display:block;width:100%;height:100%;min-width:0;min-height:0;overflow:auto}'}</style>
    <div style={{ display: 'grid', 'grid-template-rows': 'minmax(0, 1fr)', 'grid-template-columns': 'minmax(0, 1fr)', width: '100%', height: '100%', 'min-width': '0', 'min-height': '0' }}>
      <slot />
    </div>
  </>
  ) as unknown as JSX.Element;
});
