import { describe, it, expect } from 'vitest';
import { createRoot, createEffect } from 'solid-js';
import { createTween } from './create-tween';
import { installFakeClock } from '../test-utils/fake-clock';

/** Drive RAF manually so we can step time deterministically. */
const { advance } = installFakeClock();

describe('createTween', () => {
  it('starts at the initial value', () => {
    createRoot((dispose) => {
      const t = createTween(0.3);
      expect(t.value()).toBe(0.3);
      dispose();
    });
  });

  it('sets instantly when duration is 0', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(0.9, { duration: 0 });
      expect(t.value()).toBe(0.9);
      dispose();
    });
  });

  it('sets instantly when no transition is given', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(0.5);
      expect(t.value()).toBe(0.5);
      dispose();
    });
  });

  it('lands exactly on the target when the duration elapses', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 0.5 });
      advance(500);
      expect(t.value()).toBeCloseTo(1, 6);
      dispose();
    });
  });

  it('moves monotonically toward the target part-way through', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1, ease: 'linear' });
      advance(250);
      const quarter = t.value();
      expect(quarter).toBeGreaterThan(0);
      expect(quarter).toBeLessThan(1);
      advance(250);
      expect(t.value()).toBeGreaterThan(quarter);
      dispose();
    });
  });

  it('eases out, so it covers more than half the distance at the halfway point', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1, ease: 'easeOut' });
      advance(500);
      expect(t.value()).toBeGreaterThan(0.5);
      dispose();
    });
  });

  it('ping-pongs between the two values of an array target', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to([0.2, 0.8], { duration: 1, ease: 'linear' });
      advance(1000);
      expect(t.value()).toBeCloseTo(0.8, 2);
      advance(1000);
      expect(t.value()).toBeCloseTo(0.2, 2);
      advance(1000);
      expect(t.value()).toBeCloseTo(0.8, 2);
      dispose();
    });
  });

  it('starts an array target from its first value', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to([0.2, 0.8], { duration: 1, ease: 'linear' });
      advance(0);
      expect(t.value()).toBeCloseTo(0.2, 2);
      dispose();
    });
  });

  it('overshoots past the target with a bouncy spring', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { type: 'spring', duration: 1, bounce: 0.5 });
      let peak = 0;
      for (let i = 0; i < 40; i++) {
        advance(25);
        peak = Math.max(peak, t.value());
      }
      expect(peak).toBeGreaterThan(1);
      dispose();
    });
  });

  it('settles on the target after a spring completes', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { type: 'spring', duration: 1, bounce: 0.3 });
      for (let i = 0; i < 60; i++) advance(25);
      expect(t.value()).toBeCloseTo(1, 2);
      dispose();
    });
  });

  it('a new target interrupts the one in flight rather than queueing', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1, ease: 'linear' });
      advance(500);
      t.to(0, { duration: 0 });
      expect(t.value()).toBe(0);
      advance(500);
      expect(t.value()).toBe(0);
      dispose();
    });
  });

  it('stops animating after dispose', () => {
    let t!: ReturnType<typeof createTween>;
    createRoot((dispose) => {
      t = createTween(0);
      t.to(1, { duration: 1, ease: 'linear' });
      dispose();
    });
    const before = t.value();
    advance(1000);
    expect(t.value()).toBe(before);
  });

  // `animating` exists for the aurora variant's upstream-parity volume
  // guard: live volume must not re-target uScale while a state landing (or
  // the listening spring) is still in flight. It is a real signal, so an
  // effect reading it re-runs the moment a tween settles.
  it('animating() starts false', () => {
    createRoot((dispose) => {
      const t = createTween(0.3);
      expect(t.animating()).toBe(false);
      dispose();
    });
  });

  it('animating() is true while a tween is in flight and false once it lands', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 0.5 });
      expect(t.animating()).toBe(true);
      advance(250);
      expect(t.animating()).toBe(true);
      advance(250);
      expect(t.animating()).toBe(false);
      dispose();
    });
  });

  it('animating() stays false for an instant to() -- duration 0 or no transition', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 0 });
      expect(t.animating()).toBe(false);
      t.to(0.5);
      expect(t.animating()).toBe(false);
      dispose();
    });
  });

  it('animating() stays true across ping-pong legs (a pulse never settles)', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to([0.2, 0.8], { duration: 0.5, ease: 'linear' });
      expect(t.animating()).toBe(true);
      advance(500); // first leg lands, reverses
      expect(t.animating()).toBe(true);
      advance(500); // second leg lands, reverses again
      expect(t.animating()).toBe(true);
      dispose();
    });
  });

  it('animating() goes false when an instant to() interrupts an in-flight tween', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1 });
      advance(300);
      expect(t.animating()).toBe(true);
      t.to(0.4, { duration: 0 });
      expect(t.animating()).toBe(false);
      dispose();
    });
  });

  it('animating() is true for the full duration of a spring and false after it settles', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { type: 'spring', duration: 1, bounce: 0.35 });
      advance(500);
      expect(t.animating()).toBe(true);
      for (let i = 0; i < 30; i++) advance(25);
      expect(t.animating()).toBe(false);
      dispose();
    });
  });

  it('eases from the moment to() is called, even after a long idle gap', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1, ease: 'linear' });
      advance(1000);                 // first tween completes, loop goes idle
      expect(t.value()).toBeCloseTo(1, 6);
      advance(5000);                 // long idle with no tween running
      t.to(0, { duration: 1, ease: 'linear' });
      advance(500);                  // half of the NEW tween's duration
      expect(t.value()).toBeCloseTo(0.5, 1);   // must ease, not snap to 0
      dispose();
    });
  });
});

// Reference values below are computed straight from the cubic-bezier
// formulas for each curve, not eyeballed: solving X(s) = 0.5 for
// easeOut's (0, 0, 0.58, 1) gives Y(s) ≈ 0.6846, and easeIn's
// (0.42, 0, 1, 1) is easeOut mirrored (its control points are easeOut's
// reflected through (0.5, 0.5)), giving Y(s) ≈ 0.3154 at the same point.
describe('named easings as cubic beziers', () => {
  const NAMES = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const;

  // The fake requestAnimationFrame stub holds a single pending callback, not
  // a queue, so two tweens must be driven one after the other; scheduling a
  // second one before advancing the first would silently drop the first
  // tween's frame instead of running both.

  it('easeOut matches the (0, 0, 0.58, 1) curve: steeper than linear at the midpoint', () => {
    createRoot((dispose) => {
      const eased = createTween(0);
      eased.to(1, { duration: 1, ease: 'easeOut' });
      advance(500);
      const easedAtHalf = eased.value();

      const linear = createTween(0);
      linear.to(1, { duration: 1, ease: 'linear' });
      advance(500);
      const linearAtHalf = linear.value();

      expect(easedAtHalf).toBeCloseTo(0.68, 2);
      expect(easedAtHalf).toBeGreaterThan(linearAtHalf);
      dispose();
    });
  });

  it('easeIn matches the (0.42, 0, 1, 1) curve: shallower than linear at the midpoint', () => {
    createRoot((dispose) => {
      const eased = createTween(0);
      eased.to(1, { duration: 1, ease: 'easeIn' });
      advance(500);
      const easedAtHalf = eased.value();

      const linear = createTween(0);
      linear.to(1, { duration: 1, ease: 'linear' });
      advance(500);
      const linearAtHalf = linear.value();

      expect(easedAtHalf).toBeCloseTo(0.32, 2);
      expect(easedAtHalf).toBeLessThan(linearAtHalf);
      dispose();
    });
  });

  it('easeInOut matches the (0.42, 0, 0.58, 1) curve: at the midpoint, and symmetric about it', () => {
    createRoot((dispose) => {
      const mid = createTween(0);
      mid.to(1, { duration: 1, ease: 'easeInOut' });
      advance(500);
      expect(mid.value()).toBeCloseTo(0.5, 2);

      const early = createTween(0);
      early.to(1, { duration: 1, ease: 'easeInOut' });
      advance(250);
      const atQuarter = early.value();

      const late = createTween(0);
      late.to(1, { duration: 1, ease: 'easeInOut' });
      advance(750);
      const atThreeQuarters = late.value();

      expect(atQuarter).toBeCloseTo(1 - atThreeQuarters, 2);
      dispose();
    });
  });

  it('every named easing returns exactly 0 at t = 0 and exactly 1 at t = 1', () => {
    createRoot((dispose) => {
      for (const ease of NAMES) {
        const t = createTween(0);
        t.to(1, { duration: 1, ease });
        advance(0);
        expect(t.value()).toBe(0);
        advance(1000);
        expect(t.value()).toBe(1);
      }
      dispose();
    });
  });

  it('every named easing is monotonically non-decreasing across a sweep of t', () => {
    createRoot((dispose) => {
      for (const ease of NAMES) {
        const t = createTween(0);
        t.to(1, { duration: 1, ease });
        let previous = t.value();
        for (let i = 0; i < 20; i++) {
          advance(50); // 0.05 of the 1s duration per step
          const current = t.value();
          expect(current).toBeGreaterThanOrEqual(previous);
          previous = current;
        }
      }
      dispose();
    });
  });
});

// `step()` clamps the TOP of `t` (`Math.min(1, ...)`) but not the bottom, so a
// frame timestamp that predates the `performance.now()` captured by `to()`
// hands the easing a NEGATIVE `t`. Per spec that cannot happen in a browser --
// requestAnimationFrame's timestamp and `performance.now()` share a time
// origin -- but it happens routinely under vitest + jsdom, where they do not:
// jsdom computes its frame timestamp as `performance.now() - windowInitialized`
// against its OWN performance object, while vitest has already replaced the
// global `performance` with jsdom's. The two disagree by the window's age, so
// the first frames of every tween arrive "before" it started.
//
// With an unclamped easing that runs the tween BACKWARDS. These tests drive
// exactly that timestamp through every easing. They are the only thing that
// can ever catch a regression here, because the condition is unreachable in
// the browser the visualizers actually run in.
describe('createTween: a frame timestamp that predates the tween origin', () => {
  const ORIGIN = 1_000_000;
  const SKEW_MS = 250; // a quarter of the 1s duration used below, i.e. t = -0.25

  /**
   * Runs `body` against a clock where `performance.now()` is pinned to
   * `ORIGIN` -- so `to()` captures that as its leg start -- and hands it a
   * `fireFrameAt(timestamp)` that invokes the single pending
   * requestAnimationFrame callback with whatever absolute timestamp it is
   * given, including one in that frame's past. That is the jsdom shape, in
   * isolation and without real timers.
   *
   * These stubs replace the file-scope `installFakeClock()` ones for the
   * duration of the test; its `afterEach` unstubs both alike.
   */
  function withPreOriginFrame(body: (fireFrameAt: (timestamp: number) => void) => void) {
    let pending: ((t: number) => void) | null = null;
    vi.stubGlobal('performance', { now: () => ORIGIN });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending = cb as (t: number) => void;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      pending = null;
    });

    body((timestamp) => {
      const callback = pending;
      pending = null;
      // Prove the setup reaches the gap rather than passing vacuously: the
      // tween must actually have armed a frame to fire.
      expect(callback).not.toBeNull();
      callback!(timestamp);
    });
  }

  /** A frame timestamp genuinely in the past relative to the captured origin. */
  const EARLY = ORIGIN - SKEW_MS;

  // `from` and `to` are both non-zero and distinct so "held at the start
  // value" is distinguishable from "happened to produce 0".
  const FROM = 0.4;
  const TO = 0.9;

  // RED before the clamp: `linear` is the identity, so t = -0.25 drove the
  // value to 0.275 -- BELOW the start, the tween running backwards. The three
  // cubic-bezier curves already guarded (`if (t <= 0) return 0`), so they were
  // green before and after; they are here to pin that, and to show the harness
  // drives all four the same way.
  it.each(['linear', 'easeIn', 'easeOut', 'easeInOut'] as const)(
    "'%s' holds at the start value instead of running backwards",
    (ease) => {
      createRoot((dispose) => {
        withPreOriginFrame((fireFrameAt) => {
          const t = createTween(FROM);
          t.to(TO, { duration: 1, ease });
          expect(EARLY).toBeLessThan(performance.now()); // the frame really is in the past
          fireFrameAt(EARLY);
          expect(t.value()).toBe(FROM);
        });
        dispose();
      });
    },
  );

  // RED before the clamp, and much louder than linear's: `spring` has
  // `Math.exp(-zeta * omega * t)` in it, so a negative `t` makes the
  // exponential GROW instead of decay. At t = -0.25 with bounce 0.4 the easing
  // returned ~5.9, putting the value at ~3.36 -- roughly seven times the
  // distance to the target, in the wrong direction, on the first frame.
  it('a spring holds at the start value instead of diverging exponentially', () => {
    createRoot((dispose) => {
      withPreOriginFrame((fireFrameAt) => {
        const t = createTween(FROM);
        t.to(TO, { type: 'spring', duration: 1, bounce: 0.4 });
        expect(EARLY).toBeLessThan(performance.now());
        fireFrameAt(EARLY);
        expect(t.value()).toBe(FROM);
      });
      dispose();
    });
  });

  // The clamp must HOLD the tween, not cancel it: an early frame is still a
  // frame, so the loop has to stay armed and the tween has to animate normally
  // from its real origin once the timestamps catch up.
  it('stays armed through an early frame and still lands on the target', () => {
    createRoot((dispose) => {
      withPreOriginFrame((fireFrameAt) => {
        const t = createTween(FROM);
        t.to(TO, { duration: 1, ease: 'linear' });
        fireFrameAt(EARLY);
        expect(t.value()).toBe(FROM);
        expect(t.animating()).toBe(true);

        fireFrameAt(ORIGIN + 500); // halfway through, measured from the origin
        expect(t.value()).toBeCloseTo(FROM + (TO - FROM) / 2, 6);

        fireFrameAt(ORIGIN + 1000);
        expect(t.value()).toBe(TO);
        expect(t.animating()).toBe(false);
      });
      dispose();
    });
  });
});

// A real browser bug, found by the audio-visualizer epic's end-to-end
// verification: the wave shader's `uFrequency` uniform read 0 in every
// state, forever, while `uAmplitude` (built the same way, one line above it)
// worked. Root cause was here, not in the wave variant: `to()` read this
// tween's own `value()` WITHOUT `untrack()`, so calling `.to()` from inside
// a createEffect (the normal way to use this primitive -- see the class doc)
// made that effect implicitly depend on the tween's own signal. Every write
// from the tween's own `step()` then re-triggered the effect, which called
// `.to()` again -- harmless for a single tween (it just restarts itself and
// still crawls toward the target), but fatal for a SECOND tween `.to()`'d
// later in the SAME effect (exactly what the wave variant does for amplitude
// then frequency): a browser fires one frame's queued
// `requestAnimationFrame` callbacks in registration order, so the first
// tween's step -- which runs first and whose `setValue` synchronously
// re-triggers the effect -- cancels the second tween's already-queued step
// before the browser ever reaches it. That repeated identically every
// frame, forever, so the second tween's `step` never fired even once.
//
// These two tests used to drive jsdom's REAL `requestAnimationFrame` with
// real timers, on the grounds that `installFakeClock` held a single pending
// callback rather than a per-registration queue and so could not represent
// two independently scheduled callbacks at all. That premise is stale: the
// stub holds a real `Map` queue now (see its own doc), and a single
// `advance()` fires every callback pending before that frame, in
// registration order -- exactly the shape these tests need.
//
// Driving them off REAL requestAnimationFrame was also actively WRONG, and
// was the cause of a load-sensitive flake in the full suite. `createTween`
// measures elapsed time as `rafTimestamp - performance.now()`, which is
// correct in a browser because the two share a time origin per spec. Under
// vitest + jsdom they DO NOT: jsdom computes its frame timestamp as
// `performance.now() - windowInitialized` (Window.js), but vitest has by
// then replaced the global `performance` with jsdom's own window
// performance, so that subtraction is applied twice. The frame timestamp
// therefore runs a CONSTANT offset BEHIND `performance.now()` -- measured at
// ~475ms for a freshly started worker, and 900-1500ms for a file that lands
// late in a reused worker's life, because the offset is whatever
// `performance.now()` read when that file's jsdom window was built.
//
// `createTween` then computes a NEGATIVE `t` for that whole offset, and
// `EASINGS.linear` does not clamp below 0, so the tween travels BACKWARDS
// until the frame clock catches up. Measured directly at this call site
// during a full-suite run: offset 1145ms -> value 10 (passed), offset
// 1522ms -> value -0.798 (failed). A fixed 1500ms wall-clock wait is a
// coin flip on how busy the machine was when the worker booted -- which is
// exactly the "passes alone, fails in the full suite" signature.
//
// The fake clock removes the whole class: it stubs `requestAnimationFrame`
// AND `performance.now()` off the SAME fake `now`, so there is no origin to
// disagree about and no wall-clock dependency left.
describe('createTween: does not depend on its own value merely by being .to()\'d', () => {
  // `createEffect`'s FIRST run is not synchronous even inside `createRoot`
  // (confirmed empirically: it flushes on the next microtask, unlike
  // `@solidjs/testing-library`'s `render()`, which flushes before returning
  // -- that is why the rest of this file, and variant-wave.test.tsx, never
  // needed this). One `await Promise.resolve()` is enough to observe it.
  //
  // Disposal stays wrapped in try/finally so an assertion failure cannot
  // skip cleanup and leak a live tween into the next test.
  it('an effect that calls .to() on a tween does not re-run merely because that tween\'s OWN value changes -- and the tween still reaches its target', async () => {
    let dispose = () => {};
    try {
      let runs = 0;
      const t = createRoot((d) => {
        dispose = d;
        const tween = createTween(0);
        createEffect(() => {
          runs++;
          tween.to(10, { duration: 0.15, ease: 'linear' });
        });
        return tween;
      });
      await Promise.resolve();
      expect(runs).toBe(1);

      // 20 frames of 10ms covers the 150ms duration with room to spare. Each
      // one is a real frame for the tween: `step()` runs, writes a value, and
      // re-arms -- so if `.to()` were tracking this tween's own signal, every
      // one of these would re-enter the effect.
      for (let i = 0; i < 20; i++) advance(10);

      // The bug, reproduced in isolation: reading `value()` inside `.to()`
      // without `untrack()` made this effect depend on `t`'s own signal, so
      // every `setValue()` call from `step()` re-ran it -- climbing into the
      // dozens within a few hundred ms, not staying at 1.
      expect(runs).toBe(1);
      expect(t.value()).toBeCloseTo(10, 0);
    } finally {
      dispose();
    }
  });

  it('a SECOND tween .to()\'d from the same effect as a first one still reaches its own target -- the exact shape of the wave shader bug (amplitude worked, frequency stayed stuck at 0 forever)', async () => {
    let dispose = () => {};
    try {
      const { first, second } = createRoot((d) => {
        dispose = d;
        const first = createTween(0);
        const second = createTween(0);
        createEffect(() => {
          first.to(10, { duration: 0.15, ease: 'linear' });
          second.to(10, { duration: 0.15, ease: 'linear' });
        });
        return { first, second };
      });
      await Promise.resolve();

      // Both tweens are independently pending every frame; the stub's queue
      // fires both per `advance()`, in registration order, which is the
      // precondition this test needs (a single-slot stub would silently drop
      // one of them and prove nothing).
      for (let i = 0; i < 20; i++) advance(10);

      expect(first.value()).toBeCloseTo(10, 0);
      // Before the fix, this stayed at EXACTLY 0 forever: the first tween's
      // step always fired first (registered first, every restart cycle) and
      // its write always re-triggered the effect before the browser ever
      // reached the second tween's already-queued step for that same frame.
      expect(second.value()).toBeCloseTo(10, 0);
    } finally {
      dispose();
    }
  });
});
