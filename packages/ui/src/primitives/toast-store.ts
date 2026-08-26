// Module-level toast store + the imperative `toast()` API.
//
// This is the PRIMARY way consumers raise a toast: `toast('Saved')`,
// `toast.success('Copied')`, `toast.dismiss(id)`. The store is a single
// reactive list held in a long-lived `createRoot` (so its reactivity survives
// outside any component), and `ensureMounted()` lazily creates exactly ONE
// `<kai-toast-region>` on `document.body` the first time a toast is raised,
// binding the list to its `toasts` property. The region is a real `kai-*`
// element, so it carries its own shadow root + the shared kit stylesheet — it's
// viewport-positioned AND fully kit-styled, never a raw div.
//
// ADOPTS, else creates: `ensureMounted` first
// looks for a connected `<kai-toast-region>` already in the document and binds
// the store to it, so an app that placed its own region and also calls
// `toast()` gets ONE region, not two overlapping ones. It creates a region only
// when none exists. With two or more candidate regions the choice is genuinely
// ambiguous — the first in document order wins, and a one-time console.warn
// says so (decide loudly).
//
// SSR-safe: every DOM touch is guarded by `typeof document`. On the server,
// raising a toast is an inert no-op (the store updates, nothing mounts).

import { createRoot, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type { ToastPosition } from '../components/toast';

export type ToastVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';
/** Visual treatment: `'pill'` (default, compact single-line) or `'card'` (richer
 *  rounded card with an optional description line). */
export type ToastAppearance = 'pill' | 'card';

export interface ToastConfig {
  stack?: 'expanded' | 'collapsed';
  position?: ToastPosition;
  max?: number;
  /** Default appearance for imperatively-raised toasts. Defaults to `'pill'`. */
  appearance?: ToastAppearance;
  /** Default high-contrast inverse treatment for imperatively-raised toasts.
   *  Defaults to `false`. */
  inverse?: boolean;
}

// Module-level config the imperative singleton regions inherit. Defaults match
// the element's own defaults, so an un-configured app behaves exactly as before.
let toastConfig: ToastConfig = {};

/** Apply the current config to a region element (attributes for scalars). */
function applyConfig(el: HTMLElement): void {
  if (toastConfig.stack) el.setAttribute('stack', toastConfig.stack);
  if (toastConfig.position) el.setAttribute('position', toastConfig.position);
  if (toastConfig.max !== undefined) el.setAttribute('max', String(toastConfig.max));
  if (toastConfig.appearance) el.setAttribute('appearance', toastConfig.appearance);
  if (toastConfig.inverse !== undefined) {
    if (toastConfig.inverse) el.setAttribute('inverse', '');
    else el.removeAttribute('inverse');
  }
}

/**
 * Configure the imperative `toast()` singleton — call once at app start.
 * `toast.success('…')` has no element to set a prop on, so this is how you opt
 * the auto-mounted region into collapsed stacking / a position / a max. Updates
 * any already-mounted regions too, so call order doesn't matter.
 */
export function configureToasts(config: ToastConfig): void {
  toastConfig = { ...toastConfig, ...config };
  if (typeof document === 'undefined') return;
  document.querySelectorAll('kai-toast-region').forEach((el) => applyConfig(el as HTMLElement));
}

/** An action button rendered inside the toast. Returning `false` from
 *  `onAction` keeps the toast open (e.g. to show a follow-up); any other
 *  return value dismisses it. */
export interface ToastAction {
  label: string;
  onAction: () => void | false;
}

export interface ToastItem {
  id: string;
  message: string;
  variant?: ToastVariant;
  /** Visual treatment: `'pill'` (default, compact single-line) or `'card'` (richer
   *  rounded card with an optional description line). */
  appearance?: ToastAppearance;
  /** High-contrast inverse surface — works on either appearance, popping in light
   *  AND dark. Defaults to `false`. */
  inverse?: boolean;
  /** Secondary line shown below the message in the `'card'` appearance. The
   *  `'pill'` appearance ignores it. */
  description?: string;
  action?: ToastAction;
  /** Auto-dismiss delay in ms. `0` = sticky (never auto-dismisses). When an
   *  `action` is present the effective floor is 4000ms so it stays long enough
   *  to act on. Defaults to 2000ms. */
  duration?: number;
  /** Whether the × close affordance is shown. Defaults to `true`. */
  dismissible?: boolean;
  /** Container to scope this toast WITHIN — it floats anchored to that element's
   *  bounds instead of the viewport. Omit for a global, viewport-anchored toast.
   *  The chat targets itself by default so its copy/feedback toasts stay in-chat. */
  target?: HTMLElement;
}

/** Options accepted by `toast()` — everything but the message. Pass `id` to
 *  update an existing toast in place. */
export interface ToastOptions {
  id?: string;
  variant?: ToastVariant;
  /** Visual treatment: `'pill'` (default) or `'card'`. Falls back to the value set
   *  via `configureToasts`, then `'pill'`. */
  appearance?: ToastAppearance;
  /** High-contrast inverse surface. Falls back to `configureToasts`, then `false`. */
  inverse?: boolean;
  /** Secondary line shown below the message in the `'card'` appearance. */
  description?: string;
  action?: ToastAction;
  duration?: number;
  dismissible?: boolean;
  /** Scope this toast to a container's bounds (e.g. a chat) instead of the
   *  viewport. Omit for a global, viewport-anchored toast. */
  target?: HTMLElement;
}

/** Handle returned from `toast()` for imperative control. */
export interface ToastHandle {
  id: string;
  dismiss: () => void;
  update: (patch: Partial<Omit<ToastItem, 'id'>>) => void;
}

/** Default auto-dismiss delay. Long enough to read + reach before it leaves. */
export const DEFAULT_TOAST_DURATION = 5000;
/** Minimum auto-dismiss delay when the toast carries an action (e.g. Undo) — it
 *  has to stay up long enough to actually act on. */
export const ACTION_TOAST_FLOOR = 7000;

// ── The reactive store ──────────────────────────────────────────────────────
// Held in a never-disposed root so the signal/store graph stays live for the
// lifetime of the page, independent of any component.
const { toasts, setToasts, mounted, setMounted } = createRoot(() => {
  const [list, setList] = createStore<ToastItem[]>([]);
  const [isMounted, setIsMounted] = createSignal(false);
  return { toasts: list, setToasts: setList, mounted: isMounted, setMounted: setIsMounted };
});

/** The live toast list (reactive). The region facade binds to this. */
export function getToasts(): ToastItem[] {
  return toasts;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `toast-${counter}`;
}

/** Resolve the effective duration, applying the action floor. */
function resolveDuration(item: Pick<ToastItem, 'duration' | 'action'>): number {
  const base = item.duration ?? DEFAULT_TOAST_DURATION;
  if (base === 0) return 0; // explicit sticky wins
  if (item.action) return Math.max(base, ACTION_TOAST_FLOOR);
  return base;
}

/**
 * Lazily resolve the single `<kai-toast-region>` host for a target and bind the
 * store to its `toasts` property. Idempotent + SSR-safe. The element upgrade
 * (its `defineWebComponent` registration) happens when the elements bundle
 * loads; setting the property before/after upgrade both work because
 * `customElement` reflects late-set properties.
 *
 * ADOPT-IF-PRESENT: a connected
 * `<kai-toast-region>` already in the document (same `target`, not already
 * claimed for another target) is adopted — the store binds to IT, and no
 * second region mounts. Adoption respects the region's authored attributes
 * (position/stack/…): config from `configureToasts()` is not stamped onto an
 * adopted region here, though an explicit `configureToasts()` call still
 * updates every region, adopted included. Binding the store REPLACES a
 * `toasts` array the app set as data — after the first `toast()` call the
 * imperative store owns the adopted region's list. Only when no candidate
 * exists is a fresh region created on `document.body`. Two or more candidates
 * for the same target are genuinely ambiguous: the first in document order
 * wins, with a one-time console.warn (decide loudly).
 *
 * If an adopted (or created) region later leaves the DOM, the cache entry is
 * dropped and the next call resolves fresh — adopt again if a region exists,
 * else create — so a removed region never becomes a dead cache entry that
 * swallows toasts.
 */
// One region per distinct target (the `null` key = the global / viewport region).
// Every region binds the SAME store proxy and filters to its own target, so a
// toast routes to the region for its `target`.
const regions = new Map<HTMLElement | null, HTMLElement>();

// Decide-loudly, once: ambiguity between 2+ candidate regions is warned about a
// single time per page, not on every toast.
let warnedAmbiguousRegions = false;

/** Read a region element's `target` property (undefined pre-upgrade → null =
 *  the global region). */
function regionTarget(el: HTMLElement): HTMLElement | null {
  return (el as unknown as { target?: HTMLElement }).target ?? null;
}

export function ensureMounted(target: HTMLElement | null = null): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const cached = regions.get(target);
  if (cached && cached.isConnected) return cached;
  // The region this key resolved to left the DOM — drop the dead entry so it
  // can never swallow toasts, and resolve fresh below.
  if (cached) regions.delete(target);

  // Adopt a region the app already placed. Regions this store already
  // claimed for OTHER targets are not candidates.
  const claimed = new Set(regions.values());
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('kai-toast-region'),
  ).filter((el) => el.isConnected && !claimed.has(el) && regionTarget(el) === target);
  if (candidates.length > 1 && !warnedAmbiguousRegions) {
    warnedAmbiguousRegions = true;
    console.warn(
      `[kitn] toast(): ${candidates.length} candidate <kai-toast-region> elements are in the ` +
        'document; adopting the first in document order. Keep one region per target so the ' +
        'imperative toast() API has an unambiguous home.',
    );
  }
  const adopted = candidates[0];
  if (adopted) {
    (adopted as unknown as { toasts: ToastItem[] }).toasts = toasts as ToastItem[];
    regions.set(target, adopted);
    setMounted(true);
    return adopted;
  }

  const el = document.createElement('kai-toast-region') as HTMLElement;
  // Append FIRST so the element upgrades, THEN bind. Setting a property before
  // upgrade loses it: component-register resets every prop in the constructor on
  // upgrade (the same pre-upgrade clobber that bites <kai-chat>), so a pre-append
  // `el.toasts = …` is wiped and the first toast never renders.
  document.body.appendChild(el);
  (el as unknown as { toasts: ToastItem[] }).toasts = toasts as ToastItem[];
  if (target) (el as unknown as { target: HTMLElement }).target = target;
  applyConfig(el); // inherit stack/position/max from configureToasts()
  regions.set(target, el);
  setMounted(true);
  return el;
}

/** Test-only: whether `ensureMounted` has run. */
export function isToastRegionMounted(): boolean {
  return mounted();
}

function upsert(item: ToastItem): void {
  const idx = toasts.findIndex((t) => t.id === item.id);
  if (idx >= 0) {
    setToasts(idx, item);
  } else {
    setToasts(produce((list) => { list.push(item); }));
  }
}

function dismiss(id: string): void {
  setToasts((list) => list.filter((t) => t.id !== id));
}

function makeHandle(id: string): ToastHandle {
  return {
    id,
    dismiss: () => dismiss(id),
    update: (patch) => {
      const idx = toasts.findIndex((t) => t.id === id);
      if (idx >= 0) setToasts(idx, (prev) => ({ ...prev, ...patch }));
    },
  };
}

/** Internal: raise/refresh a toast of a given variant. */
function raise(message: string, opts: ToastOptions | undefined, variant: ToastVariant): ToastHandle {
  ensureMounted(opts?.target ?? null);
  const id = opts?.id ?? nextId();
  const item: ToastItem = {
    id,
    message,
    variant: opts?.variant ?? variant,
    appearance: opts?.appearance ?? toastConfig.appearance ?? 'pill',
    inverse: opts?.inverse ?? toastConfig.inverse ?? false,
    description: opts?.description,
    action: opts?.action,
    duration: opts?.duration,
    dismissible: opts?.dismissible,
    target: opts?.target,
  };
  upsert(item);
  return makeHandle(id);
}

export interface ToastFn {
  (message: string, opts?: ToastOptions): ToastHandle;
  /** Raise a success (green check) toast. */
  success: (message: string, opts?: ToastOptions) => ToastHandle;
  /** Raise a warning (amber) toast — e.g. an agent needs your input. */
  warning: (message: string, opts?: ToastOptions) => ToastHandle;
  /** Raise an error (destructive/red) toast — e.g. an agent failed. */
  error: (message: string, opts?: ToastOptions) => ToastHandle;
  /** Raise an info (blue) toast. */
  info: (message: string, opts?: ToastOptions) => ToastHandle;
  /** Dismiss a toast by id. */
  dismiss: (id: string) => void;
  /** Dismiss every active toast. */
  clear: () => void;
}

/**
 * Raise a transient toast. Returns a `{ id, dismiss, update }` handle.
 *
 * ```ts
 * toast('Copied to clipboard');
 * toast.success('Saved');
 * const t = toast('Working…', { duration: 0 });
 * t.update({ message: 'Done', variant: 'success', duration: 2000 });
 * ```
 */
export const toast: ToastFn = Object.assign(
  (message: string, opts?: ToastOptions) => raise(message, opts, 'neutral'),
  {
    success: (message: string, opts?: ToastOptions) => raise(message, opts, 'success'),
    warning: (message: string, opts?: ToastOptions) => raise(message, opts, 'warning'),
    error: (message: string, opts?: ToastOptions) => raise(message, opts, 'error'),
    info: (message: string, opts?: ToastOptions) => raise(message, opts, 'info'),
    dismiss,
    clear: () => setToasts([]),
  },
);

// Re-export for the region facade so the effective-duration rule lives in one place.
export { resolveDuration };
