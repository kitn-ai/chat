import { describe, it, expect, vi } from 'vitest';
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
// The shared `installFakeClock` stub used everywhere else in this file
// cannot reproduce this: it holds a single pending callback, not a real
// per-registration queue, so it can never represent "two independently
// scheduled callbacks queued for the same frame" in the first place -- see
// its own doc. These tests use jsdom's REAL `requestAnimationFrame`
// (confirmed to support multiple independently pending callbacks, unlike
// the stub) with real timers instead.
describe('createTween: does not depend on its own value merely by being .to()\'d', () => {
  // `createEffect`'s FIRST run is not synchronous even inside `createRoot`
  // (confirmed empirically: it flushes on the next microtask, unlike
  // `@solidjs/testing-library`'s `render()`, which flushes before returning
  // -- that is why the rest of this file, and variant-wave.test.tsx, never
  // needed this). One `await Promise.resolve()` is enough to observe it.
  //
  // Disposal is wrapped in try/finally: with real timers and a real
  // `requestAnimationFrame`, a tween that is never disposed keeps its RAF
  // loop running past the end of ITS OWN test and into whichever test runs
  // next, corrupting that test's timing. An assertion failure must not skip
  // cleanup.
  it('an effect that calls .to() on a tween does not re-run merely because that tween\'s OWN value changes -- and the tween still reaches its target', async () => {
    vi.unstubAllGlobals(); // real requestAnimationFrame/performance for this test, not the fake clock's single-slot stub.
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

      await new Promise((r) => setTimeout(r, 1500));

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
    vi.unstubAllGlobals();
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

      await new Promise((r) => setTimeout(r, 1500));

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
