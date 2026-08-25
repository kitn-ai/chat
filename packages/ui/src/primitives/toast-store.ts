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
// CREATES, never adopts: `ensureMounted` does not look for a
// `<kai-toast-region>` already in the markup, so an app that places and drives
// its own region (the declarative mode) must not also call `toast()` — the
// first call mounts a second, overlapping region. Pick one mode per app.
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
 * Lazily create the single `<kai-toast-region>` host on `document.body` and
 * bind the store to its `toasts` property. Idempotent + SSR-safe. The element
 * upgrade (its `defineWebComponent` registration) happens when the elements
 * bundle loads; setting the property before/after upgrade both work because
 * `customElement` reflects late-set properties.
 *
 * It CREATES a region — it never queries the document for, or adopts, a
 * `<kai-toast-region>` the app placed in markup. Imperative `toast()` and a
 * hand-placed data-driven region are therefore either/or: an app that owns its
 * own region must not also call `toast()`, or two overlapping regions render.
 */
// One region per distinct target (the `null` key = the global / viewport region).
// Every region binds the SAME store proxy and filters to its own target, so a
// toast routes to the region for its `target`.
const regions = new Map<HTMLElement | null, HTMLElement>();

export function ensureMounted(target: HTMLElement | null = null): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const cached = regions.get(target);
  if (cached && cached.isConnected) return cached;
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
