import { createEffect, createSignal, latest, untrack, type Accessor } from 'solid-js';
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
  const [seeded, setSeeded] = createSignal(false);
  let mountBaselined = false;
  // V2-PORT: flips once the intake effect below has applied the author's intent
  // to the controller. The reflection holds off until then — under v2's staged
  // writes the two effects can land in either order within one drain, and a
  // reflection that runs first would write the controller's still-default CLOSED
  // state over the author's `open` attribute and start an attribute⇄prop
  // oscillation (measured: kai-tool looped the flush guard to its ceiling). A
  // SIGNAL, not a plain flag, so the reflection re-runs when it flips even when
  // the intake made no controller write (the default-open case).

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
  // V2-PORT: tracked reads (controller, prop, flag) in the compute; the
  // attribute probe and the controller write in the apply (untracked by
  // construction, so the old untrack() around api.open is folded in).
  createEffect(
    () => ({ api: getApi(), openP: openProp(), desired: flag('open') }),
    ({ api, openP, desired }) => {
      if (!api) return;
      setSeeded(true);
      const explicit = openP !== undefined || element.hasAttribute('open');
      if (explicit) {
        // V2-PORT: latest() — the guard has to compare against the STAGED value,
        // or two same-flush passes read each other one commit stale and the
        // attribute⇄prop pair oscillates forever (measured: the kai-tool loop).
        if (desired !== latest(api.open)) api.setOpen(desired);
      }
      // V2-PORT: on the FIRST run with a live controller, pin the change
      // notifier's baseline to the seeded outcome — within one drain the
      // notifier's compute can run before this apply, capture the pre-seed
      // state, and read the seed as a "change", announcing kai-open-change at
      // mount (which the event contractually never does).
      if (!mountBaselined) {
        mountBaselined = true;
        prev = explicit ? desired : latest(api.open);
      }
    },
  );

  // Reflect internal open → the `[open]` host attribute.
  //
  // Through `reflectFlag`, whose SOURCE is the controller rather than the prop — this
  // element's truth is its internal open signal, not `props.open`. It also installs
  // the read-back accessor, which this wiring needed and did not have: `el.open = true`
  // used to leave `el.open === undefined`, exactly as `kai-chat`'s `loading` did
  // (findings G-05). Returning `undefined` before the primitive has handed its
  // controller up leaves the author's `<el open>` attribute alone.
  // V2-PORT: the reflection source reads the STAGED value via latest() (still a
  // tracked read) — on the mount flush this effect runs in the same drain as the
  // intake effect above, and reflecting the last COMMITTED (closed) state would
  // delete the author's `open` attribute and start the oscillation.
  reflectFlag('open', () => {
    const api = getApi();
    if (!api) return undefined;
    api.open(); // tracked subscription
    if (!seeded()) return undefined; // V2-PORT: see the `seeded` note above
    return latest(api.open);
  });

  // kai-open-change, fired once per change. Separate from the reflection above
  // because it is a notification, not a reflection; both run in the same batch, so
  // splitting them changes nothing observable about the ordering.
  // V2-PORT: tracked reads in the compute; the change-detect + dispatch in the
  // apply. The compute returns the STAGED value via latest(): on the mount drain
  // the intake above may have just applied `<el open>` in this same flush, and a
  // first run that captured the still-committed CLOSED state would make the very
  // next pass look like a change — announcing kai-open-change at mount, which
  // this event contractually never does.
  createEffect(
    () => {
      const api = getApi();
      if (!api) return undefined;
      api.open(); // tracked subscription
      return latest(api.open);
    },
    (o) => {
      if (o === undefined) return;
      // Re-read the STAGED truth here rather than trusting the compute's value:
      // within one drain this compute can run BEFORE the intake's apply seeds
      // the controller, and dispatching that stale snapshot announced a phantom
      // closed→open pair at mount.
      const api = untrack(getApi);
      if (!api) return;
      const now = latest(api.open);
      if (prev !== undefined && prev !== now) dispatch('kai-open-change', { open: now } as E['kai-open-change']);
      prev = now;
    },
  );

  expose({
    /** Open it programmatically (no-op while disabled). */
    show: () => { if (!flag('disabled')) getApi()?.setOpen(true); },
    /** Close it programmatically. */
    hide: () => getApi()?.setOpen(false),
    /** Flip the open state (closes while disabled). */
    toggle: () => { const api = getApi(); if (api) api.setOpen(flag('disabled') ? false : !api.open()); },
  });
}
