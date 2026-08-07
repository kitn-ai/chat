import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createTween } from './create-tween';

/** Drive RAF manually so we can step time deterministically. */
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
  // requestAnimationFrame's timestamp and performance.now() share a time
  // origin per spec, so the production code can read either. Keep them on
  // the same fake clock here or the two would silently disagree.
  vi.stubGlobal('performance', { now: () => now });
});

afterEach(() => vi.unstubAllGlobals());

/** Advance the fake clock and run the pending frame. */
function advance(ms: number) {
  now += ms;
  const f = frame;
  frame = undefined;
  f?.(now);
}

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
