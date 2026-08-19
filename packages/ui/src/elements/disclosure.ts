import { createEffect, untrack, type Accessor } from 'solid-js';
import type { WebComponentContext } from './define';

/** The open controller a primitive hands up via `controllerRef` so a facade can
 *  drive + observe its open/closed state. */
export interface OpenController {
  open: Accessor<boolean>;
  setOpen: (v: boolean) => void;
}

/**
 * Wire the standard Shoelace/WebAwesome-style overlay surface onto an internal
 * open controller — the kit's convention for every open/close element (hover-card,
 * tooltip, popover, menu, model-switcher, scope-picker, collapsibles, …). NOT
 * React-controlled: the element keeps self-managing; this layers the host-facing
 * conveniences on top.
 *
 * Given the primitive's `{ open, setOpen }` controller, it provides:
 *  - **`open` reflects** to the host `[open]` attribute (for `:host([open])` CSS),
 *    and is **settable** — `el.open = true` / `<el open>` drives it;
 *  - **`kai-open-change` `{ open }`** fires once per change (a guarded reflect
 *    avoids the attribute⇄prop feedback loop);
 *  - **`show()` / `hide()` / `toggle()`** instance methods, gated by `disabled`.
 *
 * The facade still:
 *  - declares the `open` / `defaultOpen` / `disabled` props (defaults `undefined`),
 *  - seeds the primitive from `defaultOpen` (e.g. via the primitive's own prop),
 *  - includes `'kai-open-change': { open: boolean }` in its `Events` map.
 *
 * @param ctx      the facade's WebComponentContext (its Events must include kai-open-change).
 * @param getApi   returns the open controller once the primitive has handed it up (may be undefined early).
 * @param openProp reads the raw reactive `open` prop (e.g. `() => props.open`) — used to tell
 *                 "consumer explicitly set open" from "unset" so a `defaultOpen` seed isn't clobbered.
 */
export function wireDisclosure<E extends { 'kai-open-change': { open: boolean } }>(
  ctx: WebComponentContext<E>,
  getApi: () => OpenController | undefined,
  openProp: () => unknown,
): void {
  const { element, dispatch, flag, reflectFlag, expose } = ctx;
  let prev: boolean | undefined;

  // External `open` prop/attr → drive internal state. Only when the consumer has
  // EXPLICITLY set it (so a defaultOpen seed survives mount); the equality guard
  // keeps the reflect below from looping back through the prop.
  //
  // THIS RUNS FIRST, AND THE ORDER IS THE FIX FOR A REAL DEFECT. It used to run
  // second, after the outward reflection — which on the very first pass read a
  // controller still in its default CLOSED state and called
  // `toggleAttribute('open', false)`, DELETING the author's attribute before anything
  // had read it. This effect then saw no attribute and a prop that
  // component-register had parsed to `undefined`, concluded nothing was asked for,
  // and left the element shut. Net result: `<kai-reasoning open>` — the plain HTML
  // spelling the `open` prop's own doc advertises — never opened; only `default-open`
  // did. Reading intent IN before reflecting state OUT is what makes the author's
  // attribute survive long enough to mean something.
  createEffect(() => {
    const api = getApi();
    if (!api) return;
    const explicit = openProp() !== undefined || element.hasAttribute('open');
    if (!explicit) return;
    const desired = flag('open');
    if (desired !== untrack(api.open)) api.setOpen(desired);
  });

  // Reflect internal open → the `[open]` host attribute.
  //
  // Through `reflectFlag`, whose SOURCE is the controller rather than the prop — this
  // element's truth is its internal open signal, not `props.open`. It also installs
  // the read-back accessor, which this wiring needed and did not have: `el.open = true`
  // used to leave `el.open === undefined`, exactly as `kai-chat`'s `loading` did
  // (findings G-05). Returning `undefined` before the primitive has handed its
  // controller up leaves the author's `<el open>` attribute alone.
  reflectFlag('open', () => getApi()?.open());

  // kai-open-change, fired once per change. Separate from the reflection above
  // because it is a notification, not a reflection; both run in the same batch, so
  // splitting them changes nothing observable about the ordering.
  createEffect(() => {
    const api = getApi();
    if (!api) return;
    const o = api.open();
    if (prev !== undefined && prev !== o) dispatch('kai-open-change', { open: o } as E['kai-open-change']);
    prev = o;
  });

  expose({
    /** Open it programmatically (no-op while disabled). */
    show: () => { if (!flag('disabled')) getApi()?.setOpen(true); },
    /** Close it programmatically. */
    hide: () => getApi()?.setOpen(false),
    /** Flip the open state (closes while disabled). */
    toggle: () => { const api = getApi(); if (api) api.setOpen(flag('disabled') ? false : !api.open()); },
  });
}
