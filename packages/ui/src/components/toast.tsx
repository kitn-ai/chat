import { createSignal, createEffect, onCleanup, For, Show, createMemo } from 'solid-js';
import { deferApply } from '../utils/defer-apply'; // V2-PORT: on(...,{defer:true}) replacement
import { X, Check, AlertTriangle, XCircle, Info } from 'lucide-solid';
import { cn } from '../utils/cn';
import { createPresence } from '../ui/overlay';
import {
  type ToastItem, type ToastVariant, type ToastAppearance, resolveDuration,
} from '../primitives/toast-store';

export type { ToastItem, ToastVariant, ToastAppearance };

/** Why a toast went away — surfaced to `onDismiss` (and the facade event). */
export type ToastDismissReason = 'timeout' | 'close' | 'action';

export type ToastPosition = 'top-center' | 'top-right' | 'top-left' | 'bottom-center' | 'bottom-right' | 'bottom-left';

export interface ToastRegionProps {
  /** The toasts to render. Newest is shown on top. Set as a JS property on the
   *  element; mutate by passing a new array reference. */
  toasts: ToastItem[];
  /** Where the stack anchors. Defaults to `'top-center'`. */
  position?: ToastPosition;
  /** Max simultaneously-visible toasts; the rest queue and promote as slots
   *  free up. Defaults to `3`. */
  max?: number;
  /** Stacking: 'expanded' (default, full column) | 'collapsed' (Sonner-style
   *  pile that expands on hover/focus). Attribute: stack. */
  stack?: 'expanded' | 'collapsed';
  /** Region-level default appearance for toasts that don't set their own. A
   *  per-toast `appearance` always wins. Defaults to `'pill'`. */
  appearance?: ToastAppearance;
  /** Region-level default inverse treatment for toasts that don't set their own.
   *  A per-toast `inverse` always wins. Defaults to `false`. */
  inverse?: boolean;
  /** When set, this region renders only the toasts scoped to that element and
   *  anchors over its bounds (top-center), following it on scroll/resize. Unset =
   *  the global, viewport-anchored region. */
  target?: HTMLElement;
  /** Fired when a toast leaves, with the reason. */
  onDismiss?: (id: string, reason: ToastDismissReason) => void;
  /** Fired when a toast's action button is pressed. */
  onAction?: (id: string, label: string) => void;
}

/** Reactive `prefers-reduced-motion`. SSR-safe (returns false when no window). */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = createSignal(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    onCleanup(() => mq.removeEventListener?.('change', on));
  }
  return reduced;
}

// ── Single toast pill ────────────────────────────────────────────────────────

export interface ToastProps {
  item: ToastItem;
  onDismiss: (reason: ToastDismissReason) => void;
  onAction?: (label: string) => void;
  /** Hold the auto-dismiss timer (the region sets this true while the whole stack
   *  is hovered/expanded, so peers don't dismiss out from under the cursor). */
  paused?: boolean;
  /** Region-level default appearance, used when the item doesn't set its own. */
  appearance?: ToastAppearance;
  /** Region-level default inverse, used when the item doesn't set its own. */
  inverse?: boolean;
}

/**
 * A single toast pill. Auto-dismisses after its (action-floored) duration, holds
 * the timer while hovered (this pill) OR while `paused` (the whole stack is
 * hovered), and animates in/out via `createPresence`. Pure + prop-driven — the
 * parent `ToastRegion` owns the list + queue.
 */
export function Toast(props: ToastProps) {
  const [open, setOpen] = createSignal(true);
  const presence = createPresence(open);
  const variant = () => props.item.variant ?? 'neutral';
  const dismissible = () => props.item.dismissible !== false;
  // Item-level value wins, then the region-level default, then the built-in default.
  const appearance = (): ToastAppearance => props.item.appearance ?? props.appearance ?? 'pill';
  const inverse = (): boolean => props.item.inverse ?? props.inverse ?? false;

  // Surface + accent colors, swapped for the high-contrast inverse treatment so the
  // toast pops on EITHER appearance, in light AND dark. The inverse surface is the
  // foreground color, so action/close/muted text switch to the background color.
  const surfaceClass = () =>
    inverse() ? 'bg-foreground text-background border-transparent' : 'bg-popover text-popover-foreground border-border';
  const mutedClass = () => (inverse() ? 'text-background/70' : 'text-muted-foreground');
  const actionClass = () => (inverse() ? 'text-background hover:text-background/80' : 'text-primary hover:text-primary/80');
  const closeClass = () => (inverse() ? 'text-background/70 hover:text-background' : 'text-muted-foreground hover:text-foreground');

  let remaining = resolveDuration(props.item);
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reason: ToastDismissReason = 'timeout';

  const clear = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };

  const begin = () => {
    clear();
    if (remaining <= 0) return; // sticky (duration 0)
    startedAt = Date.now();
    timer = setTimeout(() => { reason = 'timeout'; setOpen(false); }, remaining);
  };
  const pause = () => {
    if (timer === undefined) return;
    clear();
    remaining -= Date.now() - startedAt;
  };

  const [hovered, setHovered] = createSignal(false);
  // Held = this pill is hovered, OR the region says the whole stack is hovered.
  const held = (): boolean => props.paused === true || hovered();

  // (Re)start the timer whenever the resolved duration changes (mount + update());
  // resets the remaining time to full. Holds instead of running if currently held.
  createEffect(() => resolveDuration(props.item), (d) => {
    remaining = d;
    if (held()) clear();
    else begin();
  });
  // Pause/resume on hover (this pill or the whole stack) WITHOUT resetting remaining,
  // so the countdown continues from where it left off. Deferred — the duration
  // effect already armed it on mount.
  createEffect(held, deferApply((isHeld) => {
    if (isHeld) pause();
    else begin();
  }));
  onCleanup(clear);

  // When presence has fully exited, notify the parent so it drops the item.
  // V2-PORT: tracked reads in the compute; the notify in the apply.
  createEffect(
    () => !presence.present() && !open(),
    (gone) => { if (gone) props.onDismiss(reason); },
  );

  const close = () => { clear(); reason = 'close'; setOpen(false); };

  const act = () => {
    const action = props.item.action;
    if (!action) return;
    props.onAction?.(action.label);
    const keepOpen = action.onAction() === false;
    if (!keepOpen) { clear(); reason = 'action'; setOpen(false); }
  };

  // Leading variant icon — shared by both appearances. In the card it sits at the
  // top, so nudge it down to align with the title's cap height.
  const iconAlign = () => (appearance() === 'card' ? 'mt-0.5' : undefined);
  const VariantIcon = () => (
    <>
      <Show when={variant() === 'success'}>
        <Check class={cn('size-4 shrink-0 text-emerald-500', iconAlign())} />
      </Show>
      <Show when={variant() === 'warning'}>
        <AlertTriangle class={cn('size-4 shrink-0 text-warning', iconAlign())} />
      </Show>
      <Show when={variant() === 'error'}>
        <XCircle class={cn('size-4 shrink-0 text-destructive', iconAlign())} />
      </Show>
      <Show when={variant() === 'info'}>
        <Info class={cn('size-4 shrink-0 text-info', iconAlign())} />
      </Show>
    </>
  );

  const ActionButton = (p: { class?: string }) => (
    <Show when={props.item.action}>
      {(action) => (
        <button
          type="button"
          onClick={act}
          class={cn(
            appearance() === 'card'
              ? cn(
                  'inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  inverse()
                    ? 'border-background/30 text-background hover:bg-background/10'
                    : 'border-border text-foreground hover:bg-accent',
                )
              : cn('shrink-0 rounded-md text-sm font-medium underline-offset-2 hover:underline', actionClass()),
            p.class,
          )}
        >
          {action().label}
        </button>
      )}
    </Show>
  );

  const CloseButton = () => (
    <Show when={dismissible()}>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        class={cn(
          '-mr-1 flex size-5 shrink-0 items-center justify-center rounded-md transition-colors',
          closeClass(),
        )}
      >
        <X class="size-3.5" />
      </button>
    </Show>
  );

  return (
    <Show when={presence.present()}>
      <div
        ref={presence.setRef}
        // `variant` already picks the error ICON; it has to pick the ROLE too, or
        // a failure is announced with the same (polite, easily missed) urgency as
        // a success. `alert` is implicitly assertive and interrupts, which is what
        // the region's `aria-live="polite"` alone will not do for the toast that
        // actually matters. Same expression as ui/notice.tsx.
        role={variant() === 'error' ? 'alert' : 'status'}
        data-appearance={appearance()}
        data-inverse={inverse() ? '' : undefined}
        data-closed={presence.state() === 'closed' ? '' : undefined}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        class={cn(
          'pointer-events-auto border text-sm shadow-lg',
          surfaceClass(),
          'animate-in fade-in-0 slide-in-from-top-4',
          'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:slide-out-to-top-2',
          appearance() === 'card'
            ? 'flex min-w-[24rem] items-start gap-3 rounded-xl p-4 shadow-xl'
            : 'flex items-center gap-3 rounded-full px-4 py-2.5',
        )}
      >
        <VariantIcon />
        <Show
          when={appearance() === 'card'}
          fallback={
            <>
              <span class="min-w-0 flex-1 truncate">{props.item.message}</span>
              <ActionButton />
              <CloseButton />
            </>
          }
        >
          <div class="min-w-0 flex-1">
            <div class="font-medium leading-snug">{props.item.message}</div>
            <Show when={props.item.description}>
              <div class={cn('mt-1 line-clamp-2 text-xs leading-snug', mutedClass())}>
                {props.item.description}
              </div>
            </Show>
            <ActionButton class="mt-2" />
          </div>
          <CloseButton />
        </Show>
      </div>
    </Show>
  );
}

// ── Region (stack + queue) ───────────────────────────────────────────────────

const POSITION_CLASSES: Record<ToastPosition, string> = {
  'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
  'top-right': 'top-4 right-4 items-end',
  'top-left': 'top-4 left-4 items-start',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center flex-col-reverse',
  'bottom-right': 'bottom-4 right-4 items-end flex-col-reverse',
  'bottom-left': 'bottom-4 left-4 items-start flex-col-reverse',
};

// Flex alignment + stack direction per position, for a TARGET-anchored region (the
// stack hugs the chosen corner; bottom rows grow upward so the newest sits at the
// anchored edge). Mirrors POSITION_CLASSES minus the viewport-edge offsets.
const ANCHOR_FLEX: Record<ToastPosition, string> = {
  'top-center': 'items-center',
  'top-left': 'items-start',
  'top-right': 'items-end',
  'bottom-center': 'items-center flex-col-reverse',
  'bottom-left': 'items-start flex-col-reverse',
  'bottom-right': 'items-end flex-col-reverse',
};

/** Inset from the target's edges, in px. */
const ANCHOR_PAD = 12;

interface TargetRect { top: number; left: number; right: number; bottom: number; width: number }

/**
 * The fixed-position style pinning a target-anchored stack to the corner named by
 * `position`, computed from the target's rect. The region is `position: fixed`, so
 * we resolve absolute top/left + a transform that grows the stack inward from that
 * edge. (Rect-based, like the popover's anchor math — no collision flipping needed.)
 */
function anchorStyle(position: ToastPosition, r: TargetRect): Record<string, string> {
  const cx = r.left + r.width / 2;
  const top = r.top + ANCHOR_PAD;
  const bottom = r.bottom - ANCHOR_PAD;
  const left = r.left + ANCHOR_PAD;
  const right = r.right - ANCHOR_PAD;
  const maxWidth = `${Math.max(0, r.width - ANCHOR_PAD * 2)}px`;
  switch (position) {
    case 'top-left':
      return { top: `${top}px`, left: `${left}px`, transform: 'none', 'max-width': maxWidth };
    case 'top-right':
      return { top: `${top}px`, left: `${right}px`, transform: 'translateX(-100%)', 'max-width': maxWidth };
    case 'bottom-center':
      return { top: `${bottom}px`, left: `${cx}px`, transform: 'translate(-50%, -100%)', 'max-width': maxWidth };
    case 'bottom-left':
      return { top: `${bottom}px`, left: `${left}px`, transform: 'translateY(-100%)', 'max-width': maxWidth };
    case 'bottom-right':
      return { top: `${bottom}px`, left: `${right}px`, transform: 'translate(-100%, -100%)', 'max-width': maxWidth };
    case 'top-center':
    default:
      return { top: `${top}px`, left: `${cx}px`, transform: 'translateX(-50%)', 'max-width': maxWidth };
  }
}

/** The overlay layer both region roots sit on (F-20). One token, one default:
 *  your app chrome must stay below the toast layer; set `--kai-toast-z`
 *  (default 100) on the host to move the layer. */
const TOAST_Z = 'var(--kai-toast-z, 100)';

/**
 * Renders a stack of toasts at a viewport edge. Caps the visible count at `max`
 * (newest on top); overflow waits in a queue and is promoted as visible toasts
 * leave. `aria-live=polite` / `role=region` so screen readers announce new
 * toasts without stealing focus. Your app chrome must stay below the toast
 * layer; set `--kai-toast-z` (default 100) on the host to move the layer.
 */
export function ToastRegion(props: ToastRegionProps) {
  const max = () => props.max ?? 3;
  const position = () => props.position ?? 'top-center';

  const stack = () => props.stack ?? 'expanded';
  const reduced = usePrefersReducedMotion();
  const collapsed = () => stack() === 'collapsed' && !reduced();
  // Expanded while the stack is hovered OR holds focus (collapsed mode). These are
  // tracked SEPARATELY and OR'd: dismissing a toast (clicking its ×) removes the
  // focused button → a focusout — but if the pointer is still over the stack we must
  // stay expanded (and paused), so focusout alone must not collapse it.
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const open = () => hovered() || focused();

  // Tunable look (IVP). Resting peek + per-depth shrink; uniform expanded row height.
  const OFFSET = 20;       // px each deeper toast peeks past the one in front
  const SCALE_STEP = 0.05; // each deeper toast is 5% smaller
  const ROW_FALLBACK = 48; // px; used until the front pill is measured
  const GAP = 8;           // matches gap-2 in the expanded column

  const isBottom = () => position().startsWith('bottom');
  const dir = () => (isBottom() ? -1 : 1);

  // Measure ONE pill (all are single-line/uniform) to size the expanded spacing.
  const [rowH, setRowH] = createSignal(ROW_FALLBACK);
  const measure = (el: HTMLElement | undefined) => {
    if (!el || typeof window === 'undefined') return;
    const set = () => { const h = el.offsetHeight; if (h) setRowH(h); };
    set();
    // jsdom (and SSR) lack ResizeObserver; the fallback height is fine there.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  };

  // The transform for the wrapper at depth i, given the current open/resting state.
  const depthTransform = (i: number): string => {
    if (open()) return `translateY(${dir() * (rowH() + GAP) * i}px) scale(1)`;
    return `translateY(${dir() * OFFSET * i}px) scale(${1 - SCALE_STEP * i})`;
  };
  // The collapsed stage gets an explicit height covering the whole stack extent —
  // resting (the pile) vs expanded (the full column) — so the region is ONE
  // continuous hover surface. Without it the cursor falls into the gaps between
  // expanded pills (or the spot a just-dismissed pill vacated) and the region
  // flickers collapsed→expanded. Grows away from the anchored edge in both modes.
  const stageHeight = (): number => {
    const n = visible().length;
    if (!n) return 0;
    return open() ? n * rowH() + (n - 1) * GAP : rowH() + (n - 1) * OFFSET;
  };

  // Only the toasts for THIS region's target (undefined target = the global one).
  // Newest-first so the freshest toast sits at the top; the queue (past `max`)
  // stays mounted-but-hidden until a slot frees up.
  const ordered = createMemo(() =>
    [...(props.toasts ?? []).filter((t) => (t.target ?? undefined) === props.target)].reverse(),
  );
  const visible = createMemo(() => ordered().slice(0, max()));

  // Scoped to a target → anchor the stack to the `position` corner of the target,
  // following it on scroll/resize. Otherwise it's a viewport-fixed corner/center.
  const [anchor, setAnchor] = createSignal<TargetRect | null>(null);
  // V2-PORT: the target prop is the tracked dependency; observer wiring is the
  // apply, and the in-effect onCleanup became the returned cleanup.
  createEffect(() => props.target, (t) => {
    if (!t || typeof window === 'undefined') { setAnchor(null); return; }
    // Captured at SETUP and closed over, never re-resolved as a global inside
    // `onCleanup`: cleanup can run after the host removed the DOM globals (a
    // `kai-*` release is deferred one microtask past detachment, so an
    // environment teardown gets in between), and a bare `window` there throws.
    // See tests/components/teardown-without-dom-globals.test.tsx.
    const win = window;
    const update = () => {
      const r = t.getBoundingClientRect();
      setAnchor({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(t);
    win.addEventListener('scroll', update, true);
    win.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      win.removeEventListener('scroll', update, true);
      win.removeEventListener('resize', update);
    };
  });

  return (
    <Show
      when={collapsed()}
      fallback={
        <div
          role="region"
          aria-label="Notifications"
          aria-live="polite"
          data-stack="expanded"
          class={cn(
            'pointer-events-none fixed flex flex-col gap-2',
            anchor()
              ? ANCHOR_FLEX[position()]
              : cn('max-w-[min(30rem,calc(100vw-2rem))]', POSITION_CLASSES[position()]),
          )}
          style={{ 'z-index': TOAST_Z, ...(anchor() ? anchorStyle(position(), anchor()!) : undefined) }}
        >
          <For each={visible()}>
            {(item) => (
              <Toast
                item={item}
                appearance={props.appearance}
                inverse={props.inverse}
                onDismiss={(reason) => props.onDismiss?.(item.id, reason)}
                onAction={(label) => props.onAction?.(item.id, label)}
              />
            )}
          </For>
        </div>
      }
    >
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        data-stack="collapsed"
        data-expanded={open() ? '' : undefined}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocusIn={() => setFocused(true)}
        onFocusOut={() => setFocused(false)}
        class={cn('pointer-events-none fixed', !anchor() && POSITION_CLASSES[position()])}
        style={{ 'z-index': TOAST_Z, ...(anchor() ? anchorStyle(position(), anchor()!) : undefined) }}
      >
        {/* Relative stage with an explicit height so it's ONE continuous hover
            surface (pointer-events-auto) — no flicker when the cursor crosses gaps
            or a dismissed pill's vacated spot. Pills are absolutely stacked from the
            anchored edge. */}
        <div
          class="pointer-events-auto relative transition-[height] duration-200 ease-out"
          style={{ 'min-width': '16rem', 'max-width': 'min(30rem, calc(100vw - 2rem))', height: `${stageHeight()}px` }}
        >
          <For each={visible()}>
            {(item, i) => (
              <div
                data-depth={i()}
                ref={(el) => { if (i() === 0) measure(el); }}
                class={cn(
                  'absolute inset-x-0 flex transition-[transform,opacity] duration-200 ease-out',
                  isBottom() ? 'bottom-0 origin-bottom' : 'top-0 origin-top',
                  position().endsWith('right') ? 'justify-end' : position().endsWith('left') ? 'justify-start' : 'justify-center',
                )}
                style={{ 'z-index': String(max() - i()), transform: depthTransform(i()) }}
              >
                <Toast
                  item={item}
                  paused={open()}
                  appearance={props.appearance}
                  inverse={props.inverse}
                  onDismiss={(reason) => props.onDismiss?.(item.id, reason)}
                  onAction={(label) => props.onAction?.(item.id, label)}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
