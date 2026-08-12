import {
  createSignal, createEffect, onCleanup, splitProps, type Accessor, type JSX,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  computePosition, autoUpdate, offset, flip, shift, arrow, hide,
  getOverflowAncestors, type Placement,
} from '@floating-ui/dom';

/**
 * Keep a node mounted through its CSS exit animation.
 * Open  -> present=true, state='open'  (enter animation via base classes)
 * Close -> state='closed' (data-closed triggers tw-animate-css animate-out),
 *          then unmount on `animationend`. If no animation is defined
 *          (e.g. jsdom), unmount on the next microtask.
 */
export function createPresence(show: Accessor<boolean>) {
  const [present, setPresent] = createSignal(show());
  const [state, setState] = createSignal<'open' | 'closed'>(show() ? 'open' : 'closed');
  let node: Element | undefined;
  let generation = 0;
  const setRef = (el: Element) => { node = el; };

  createEffect((prev: boolean | undefined) => {
    const visible = show();
    if (visible) {
      generation++;
      setPresent(true);
      setState('open');
    } else if (prev) {
      setState('closed');
      const el = node;
      const hasAnim = el && (() => {
        const cs = getComputedStyle(el);
        return cs.animationName !== 'none' && parseFloat(cs.animationDuration || '0') > 0;
      })();
      if (!el || !hasAnim) {
        const gen = ++generation;
        queueMicrotask(() => { if (gen === generation) setPresent(false); });
        return visible;
      }
      const animEl = el as HTMLElement;
      const onEnd = (e: AnimationEvent) => {
        if (e.target !== animEl) return;
        animEl.removeEventListener('animationend', onEnd);
        setPresent(false);
      };
      animEl.addEventListener('animationend', onEnd);
      onCleanup(() => animEl.removeEventListener('animationend', onEnd));
    }
    return visible;
  });

  return { present, state, setRef };
}

export type AsTag = string | ((props: Record<string, any>) => JSX.Element);

/**
 * Polymorphic element. `as` may be a tag name (default 'span') or a render
 * function that receives the forwarded props (render-prop style `as={fn}`).
 * Uses splitProps (NOT destructuring) so reactive forwarded props such as
 * aria-expanded stay reactive. All extra props (incl. `ref`, event handlers,
 * aria-*) are forwarded. `children` is left in `rest` so it forwards naturally.
 */
export function As(props: { as?: AsTag; children?: JSX.Element; [k: string]: any }) {
  const [local, rest] = splitProps(props, ['as']);
  if (typeof local.as === 'function') return local.as(rest);
  return <Dynamic component={local.as ?? 'span'} {...rest} />;
}

export interface UsePositionOptions {
  placement?: Placement;
  gutter?: number;
  arrowEl?: Accessor<HTMLElement | undefined>;
  /**
   * Fired ONCE when the reference (anchor) "goes away" — either removed from the
   * document OR hidden behind an `inert` ancestor (e.g. a modal/takeover that
   * inert-s the background while open). In both cases the anchor is no longer a
   * valid, interactive target, so the caller should close the overlay and unmount
   * its portal instead of leaving it orphaned (floating over an inert background or
   * anchored to a node that no longer exists). Anchored overlays portal OUT of the
   * trigger's subtree, so Solid's onCleanup does not catch an anchor that is
   * removed/inerted independently of the overlay component. Wire this to set the
   * overlay's open state to false.
   */
  onDisconnect?: () => void;
}

/**
 * True if `node` sits inside an `inert` subtree. Climbs ACROSS shadow boundaries:
 * an anchor often lives inside a web component's shadow root (kai-coachmark renders
 * its anchor span in its own shadow) while `inert` lands on a LIGHT-DOM ancestor of
 * the host (kai-screen inert-s its siblings, e.g. kai-workspace). `closest('[inert]')`
 * alone cannot see that because it halts at the shadow root, so after each tree we
 * hop to the host of the containing ShadowRoot and keep climbing.
 */
function inInertSubtree(node: Node | null): boolean {
  let n: Node | null = node;
  while (n) {
    if (n instanceof Element && n.closest('[inert]')) return true;
    const root = n.getRootNode();
    n = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}

/**
 * Watch for the reference element "going away" and fire `onDisconnect` exactly
 * once. The anchor is gone when it is either removed from the document OR hidden
 * behind an `inert` ancestor (`inInertSubtree(reference)`, which crosses shadow
 * boundaries) — the latter is how a modal/takeover (e.g. kai-screen) makes the
 * background non-interactive while leaving it in the DOM. Either way the anchor is
 * no longer a valid target and the overlay must close.
 *
 * Uses a MutationObserver on BOTH the document and the anchor's root node: the
 * document catches the anchor's host being removed and any ancestor gaining
 * `inert` (and light-DOM removals), while the anchor's root node — a ShadowRoot
 * for kai-* elements — catches removals INSIDE the shadow tree, which a
 * document-level observer can't see through encapsulation. We observe childList
 * (DOM removals) AND the `inert` attribute, then re-check the anchor after any
 * mutation. Guarded for environments without MutationObserver. Returns a teardown
 * that disconnects the observer.
 */
function watchAnchorGone(ref: HTMLElement, onDisconnect: () => void): () => void {
  if (typeof MutationObserver !== 'function') return () => {};
  let fired = false;
  // "Live" = connected AND not buried under an inert ancestor (across shadow roots).
  const isLive = () => ref.isConnected && !inInertSubtree(ref);
  // Only fire after the anchor has actually been live, so a one-off setup while
  // detached/inert can never trigger a false disconnect.
  let everLive = isLive();
  const check = () => {
    if (fired) return;
    if (isLive()) { everLive = true; return; }
    if (!everLive) return;
    fired = true;
    obs.disconnect();
    onDisconnect();
  };
  const obs = new MutationObserver(check);
  const roots = new Set<Node>();
  if (typeof document !== 'undefined') roots.add(document);
  const rootNode = ref.getRootNode();
  if (rootNode) roots.add(rootNode);
  for (const root of roots) {
    try {
      obs.observe(root, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['inert'],
      });
    } catch { /* unobservable root */ }
  }
  return () => obs.disconnect();
}

/**
 * Position `floating` relative to `reference` using fixed strategy + autoUpdate,
 * so the element tracks the trigger on scroll/resize (fix DD-2). Writes
 * position into the returned `pos` signal; caller applies it as inline style.
 *
 * `options` (placement/gutter) are read at setup time — pass static values;
 * reactive option changes won't reposition until the next autoUpdate tick.
 */
export function usePosition(
  reference: Accessor<HTMLElement | undefined>,
  floating: Accessor<HTMLElement | undefined>,
  options: UsePositionOptions = {},
) {
  const [pos, setPos] = createSignal<{ x: number; y: number; placement: Placement }>(
    { x: 0, y: 0, placement: options.placement ?? 'bottom' },
  );
  const [arrowPos, setArrowPos] = createSignal<{ x?: number; y?: number }>({});
  // True when the trigger has scrolled out of view (clipped by an ancestor or the
  // viewport). Callers should hide the floating node so it doesn't stick to the
  // edge — Floating UI's `hide` middleware. autoUpdate keeps this live on scroll.
  const [hidden, setHidden] = createSignal(false);

  createEffect(() => {
    const ref = reference();
    const float = floating();
    if (!ref || !float) return;
    const update = () => {
      // `hide()` is read last so it reflects the final, shifted/flipped position.
      const middleware = [offset(options.gutter ?? 8), flip(), shift({ padding: 8 })];
      const aEl = options.arrowEl?.();
      if (aEl) middleware.push(arrow({ element: aEl }));
      middleware.push(hide());
      computePosition(ref, float, {
        placement: options.placement ?? 'bottom',
        strategy: 'fixed',
        middleware,
      }).then(({ x, y, placement, middlewareData }) => {
        setPos({ x, y, placement });
        if (middlewareData.arrow) setArrowPos({ x: middlewareData.arrow.x, y: middlewareData.arrow.y });
        setHidden(!!middlewareData.hide?.referenceHidden);
      });
    };
    // autoUpdate tracks scroll, window resize, reference/floating ResizeObserver,
    // and reference layout-shifts (IntersectionObserver). But its `ancestorResize`
    // only listens for DOM `resize` events (which ONLY `window` fires), so an
    // ANCESTOR element resizing (e.g. a sibling resizable sidebar reflowing the
    // anchor's container without resizing the anchor itself) is caught only by the
    // threshold-based layoutShift, which lags during a continuous drag. Add a
    // ResizeObserver across the reference and its overflow ancestors so the
    // floating node follows the anchor on any layout resize. Both are torn down
    // on unmount via onCleanup.
    const cleanup = autoUpdate(ref, float, update);
    let ro: ResizeObserver | undefined;
    // Only a REAL element can be observed. The composer's trigger menu anchors to a
    // VIRTUAL reference (a caret-rect object exposing just getBoundingClientRect, no
    // DOM node); ResizeObserver.observe() throws "parameter 1 is not of type 'Element'"
    // on it, and that uncaught throw aborts this effect before onCleanup registers,
    // which corrupted the menu's reactive scope so it never re-opened after the first
    // time. autoUpdate already tracks the virtual anchor; this ResizeObserver is a
    // real-element-only add-on for ancestor/element resizes.
    if (typeof ResizeObserver === 'function' && ref instanceof Element) {
      ro = new ResizeObserver(update);
      ro.observe(ref);
      for (const ancestor of getOverflowAncestors(ref)) {
        if (ancestor instanceof Element) ro.observe(ancestor);
      }
    }
    // When the anchor goes away (removed from the DOM or buried under an inert
    // ancestor), close the overlay so its portal unmounts instead of floating
    // orphaned. Independent of autoUpdate/ResizeObserver.
    const disconnectWatch = options.onDisconnect
      ? watchAnchorGone(ref, options.onDisconnect)
      : undefined;
    onCleanup(() => {
      cleanup();
      ro?.disconnect();
      disconnectWatch?.();
    });
  });

  return { pos, arrowPos, hidden };
}

export type DismissReason = 'escape' | 'outside';

export interface UseDismissOptions {
  enabled: Accessor<boolean>;
  onDismiss: (reason: DismissReason) => void;
  /** Elements considered "inside" (trigger + content). Pointerdown outside all of them dismisses. */
  refs: () => (HTMLElement | undefined)[];
}

/**
 * Escape key + outside-pointerdown dismissal. Does NOT lock page scroll (fix DD-1).
 *
 * `onDismiss` and `refs` are captured at call time (component setup), which is
 * fine in SolidJS since components don't re-run — ensure they close over mutable
 * variables, not stale values.
 */
export function useDismiss(opts: UseDismissOptions) {
  createEffect(() => {
    if (!opts.enabled()) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') opts.onDismiss('escape'); };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      const inside = opts.refs().some((el) => el && el.contains(target));
      if (!inside) opts.onDismiss('outside');
    };
    // Captured at SETUP and closed over, never re-resolved as a global inside
    // `onCleanup`: cleanup can run after the host removed the DOM globals (a
    // `kai-*` release is deferred one microtask past detachment, so an
    // environment teardown gets in between), and a bare `document` there throws.
    // See tests/components/teardown-without-dom-globals.test.tsx.
    const doc = document;
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('pointerdown', onPointer, true);
    onCleanup(() => {
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('pointerdown', onPointer, true);
    });
  });
}
