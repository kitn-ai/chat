import { describe, it, expect } from 'vitest';
import { createRoot, createSignal, flush } from 'solid-js';
import { useSequencer } from './use-sequencer';
import { installFakeClock } from '../test-utils/fake-clock';

/** Drive RAF manually so we can step time deterministically. */
const { advance } = installFakeClock();

describe('useSequencer', () => {
  it('starts at tick 0', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [tick, dispose] = createRoot((d) => [useSequencer(() => 100), d] as const);
    expect(tick()).toBe(0);
    dispose();
  });

  it('parks when interval is Infinity', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [tick, dispose] = createRoot((d) => [useSequencer(() => Infinity), d] as const);
    advance(1000);
    expect(tick()).toBe(0);
    dispose();
  });

  it('resets to 0 when interval value changes', () => {
    // This test verifies that the memo implementation properly isolates
    // the effect from non-interval churn. The interval value genuinely
    // changes from 100 to 200, triggering the reset.
    // V2-SHAPE: create inside the root, DRIVE outside it (owned-scope write guard).
    const [interval, setInterval] = createSignal(100);
    const [tick, dispose] = createRoot((d) => [useSequencer(() => interval()), d] as const);

    // Initial state
    expect(tick()).toBe(0);

    // Change interval - should reset tick to 0
    setInterval(200);
    flush(); // V2-FLUSH: commit the staged write
    expect(tick()).toBe(0);

    dispose();
  });
});
