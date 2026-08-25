import { createSignal, createEffect, createMemo, type Accessor } from 'solid-js';

/**
 * One requestAnimationFrame loop emitting a monotonically increasing tick
 * whenever `interval()` milliseconds have elapsed.
 *
 * RAF rather than setInterval: the browser parks it on hidden tabs, so an
 * off-screen visualizer costs nothing. Upstream leaks a timer here.
 *
 * An interval of `Infinity` (or anything non-finite) parks the loop entirely
 * and holds the tick at 0. The radial variant uses that while `thinking`,
 * where a CSS spin drives the motion instead.
 */
export function useSequencer(interval: () => number): Accessor<number> {
  const [tick, setTick] = createSignal(0);

  // Memoize the interval VALUE to isolate the effect from whatever else the
  // interval getter might be transitively subscribed to (e.g. a props proxy
  // that includes unrelated signals like `bands`). The memo only notifies
  // downstream when the number itself changes, not when intermediate accessors
  // that feed it change to the same final value. This is the same pattern as
  // `uniformShapeKey` in `shader-canvas.tsx`.
  const intervalMs = createMemo(() => interval());

  // V2-PORT: the memoized interval is the COMPUTE; the reset write and rAF loop are
  // the APPLY, whose returned cleanup replaces the in-effect onCleanup.
  createEffect(intervalMs, (ms) => {
    // Reset on every interval change so a state transition restarts the
    // sequence from its first frame rather than resuming mid-pattern.
    // With the memo, this only fires on real changes (the interval VALUE),
    // not on spurious re-runs from unrelated props churn.
    setTick(0);

    if (!Number.isFinite(ms) || ms <= 0) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    if (typeof cancelAnimationFrame === 'undefined') return;

    // Captured at SETUP and closed over, never re-resolved as a global inside
    // `onCleanup`: cleanup can run after the host removed the DOM globals (a
    // `kai-*` release is deferred one microtask past detachment, so an
    // environment teardown gets in between), and a bare `cancelAnimationFrame`
    // there throws -- from a promise nobody holds, so it lands as an unhandled
    // rejection that fails the run while every test passes.
    // See tests/components/teardown-without-dom-globals.test.tsx.
    //
    // The FUNCTION, not the view. The `const win = window` capture that fixes a
    // bare `document` does nothing here: `window === globalThis` -- measured, in
    // jsdom and in real Chromium/WebKit alike -- and the teardown deletes these
    // keys off that very object, so `win.cancelAnimationFrame` is undefined by
    // the time cleanup runs. It only trades the ReferenceError for a TypeError.
    // `.bind` pins the receiver the WebIDL operation is specified on; Chromium
    // and WebKit both accept a detached call (measured), so the bind is belt and
    // braces against an engine that does not, at zero cost.
    const cancelFrame = cancelAnimationFrame.bind(globalThis);

    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      if (now - last >= ms) {
        setTick((t) => t + 1);
        last = now;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    // V2-PORT: in-effect onCleanup -> the apply's returned cleanup.
    return () => cancelFrame(raf);
  });

  return tick;
}
