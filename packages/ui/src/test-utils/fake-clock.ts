import { vi, beforeEach, afterEach } from 'vitest';

/**
 * Shared fake `requestAnimationFrame` + `performance.now()` clock for tests
 * that need to drive time deterministically instead of racing real timers.
 *
 * requestAnimationFrame's timestamp and performance.now() share a time origin
 * per spec, so production code can read either. Stubbing them off the same
 * fake `now` keeps the two from silently disagreeing.
 *
 * The stub holds a REAL per-registration queue, matching a real browser: a
 * single frame fires every callback that was pending BEFORE that frame, all
 * with the SAME advanced `now`, in registration order -- so two
 * independently-animating things under test (e.g. a `createTween`'s own step
 * loop and `ShaderCanvas`'s separate `draw` loop, both requestAnimationFrame
 * consumers, both mounted at once) tick together on one `advance()` call
 * instead of the second silently stealing the first's slot.
 *
 * This used to be a single PENDING-callback slot, not a queue: a second
 * consumer scheduling a new frame before `advance()` ran overwrote the
 * first rather than queueing behind it. That was fine for anything that only
 * ever has ONE thing pending at a time (the common case, e.g. bar/grid/radial's
 * single sequencer tick, or a lone `createTween`), which is why switching to a
 * queue does not change any of those. It was NOT fine for a mounted shader
 * variant, where a tween and ShaderCanvas's `draw` are both independently
 * pending at once: `draw` always registers last and re-arms itself every
 * `advance()`, so it permanently "won" the single slot and the tween's step
 * never fired -- silently defeating any test trying to prove something holds
 * while UNIFORM VALUES genuinely change every frame (see
 * `variant-custom.test.tsx`'s recompile-guard test for the concrete case this
 * was fixed for).
 *
 * `cancelAnimationFrame` cancels by id now (each `requestAnimationFrame` call
 * gets its own), not by clearing whatever happens to be in the single slot --
 * required once more than one callback can be pending at a time, so a
 * `cancelAnimationFrame(idA)` cannot accidentally drop a DIFFERENT pending
 * callback `idB`.
 *
 * Call once per `describe` block (or at file scope for the whole file); it
 * registers `beforeEach`/`afterEach` hooks scoped to wherever it is called,
 * exactly like inlining the hooks would, and returns the driver bound to
 * that scope's fake clock.
 */
export function installFakeClock() {
  let now = 0;
  let nextId = 1;
  let pending = new Map<number, (t: number) => void>();

  beforeEach(() => {
    now = 0;
    nextId = 1;
    pending = new Map();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, cb as (t: number) => void);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      pending.delete(id);
    });
    vi.stubGlobal('performance', { now: () => now });
  });

  afterEach(() => vi.unstubAllGlobals());

  /**
   * Advance the fake clock and run every callback pending BEFORE this call,
   * all at the new `now` -- one simulated frame. A callback that reschedules
   * itself (the normal RAF-loop pattern) lands in a FRESH pending set for the
   * NEXT `advance()`, not this one: snapshotting the callback list before
   * invoking any of them is what keeps a self-rescheduling loop from looping
   * forever inside a single `advance()` call, matching how a real browser
   * frame never re-enters itself either.
   */
  function advance(ms: number) {
    now += ms;
    const callbacks = Array.from(pending.values());
    pending = new Map();
    for (const cb of callbacks) cb(now);
  }

  /** Whether at least one requestAnimationFrame callback is currently pending. */
  function isFramePending(): boolean {
    return pending.size > 0;
  }

  return { advance, isFramePending };
}
