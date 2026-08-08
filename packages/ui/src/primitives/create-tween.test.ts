import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
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
