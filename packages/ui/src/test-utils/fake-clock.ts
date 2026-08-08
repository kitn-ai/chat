import { vi, beforeEach, afterEach } from 'vitest';

/**
 * Shared fake `requestAnimationFrame` + `performance.now()` clock for tests
 * that need to drive time deterministically instead of racing real timers.
 *
 * requestAnimationFrame's timestamp and performance.now() share a time origin
 * per spec, so production code can read either. Stubbing them off the same
 * fake `now` keeps the two from silently disagreeing.
 *
 * The stub holds a single PENDING callback, not a queue: a second consumer
 * scheduling a new frame before `advance()` runs overwrites the first rather
 * than queueing behind it. That is intentional -- it is how a real RAF loop
 * behaves one tick at a time, and it means two independently-animating
 * things under test must be driven one after the other, not scheduled
 * together and advanced once.
 *
 * Call once per `describe` block (or at file scope for the whole file); it
 * registers `beforeEach`/`afterEach` hooks scoped to wherever it is called,
 * exactly like inlining the hooks would, and returns the driver bound to
 * that scope's fake clock.
 */
export function installFakeClock() {
  let frame: ((t: number) => void) | undefined;
  let now = 0;

  beforeEach(() => {
    now = 0;
    frame = undefined;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => { frame = undefined; });
    vi.stubGlobal('performance', { now: () => now });
  });

  afterEach(() => vi.unstubAllGlobals());

  /** Advance the fake clock and run the pending frame, if any. */
  function advance(ms: number) {
    now += ms;
    const f = frame;
    frame = undefined;
    f?.(now);
  }

  /** Whether a requestAnimationFrame callback is currently pending. */
  function isFramePending(): boolean {
    return frame !== undefined;
  }

  return { advance, isFramePending };
}
