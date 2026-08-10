import { createSignal, createEffect, onCleanup, createMemo, type Accessor } from 'solid-js';

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

  createEffect(() => {
    const ms = intervalMs();

    // Reset on every interval change so a state transition restarts the
    // sequence from its first frame rather than resuming mid-pattern.
    // With the memo, this only fires on real changes (the interval VALUE),
    // not on spurious re-runs from unrelated props churn.
    setTick(0);

    if (!Number.isFinite(ms) || ms <= 0) return;
    if (typeof requestAnimationFrame === 'undefined') return;

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
    onCleanup(() => cancelAnimationFrame(raf));
  });

  return tick;
}
