import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { BarVisualizer } from './variant-bar';
import { defaultBarCount } from './sizes';
import { installFakeClock } from '../../test-utils/fake-clock';

afterEach(cleanup);

// `~=` (token match), not `=` (exact match): `part` is a space-separated
// token list, and a highlighted bar's `part` is "bar highlighted", so
// `[part="bar"]` would silently stop matching it the moment it lights up.
const bars = (c: HTMLElement) => Array.from(c.querySelectorAll('[part~="bar"]')) as HTMLElement[];
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('defaultBarCount', () => {
  it('uses 3 bars at the two smallest sizes and 5 above', () => {
    expect(defaultBarCount('icon')).toBe(3);
    expect(defaultBarCount('sm')).toBe(3);
    expect(defaultBarCount('md')).toBe(5);
    expect(defaultBarCount('lg')).toBe(5);
    expect(defaultBarCount('xl')).toBe(5);
  });
});

describe('BarVisualizer', () => {
  it('renders one bar per band', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.1, 0.2, 0.3, 0.4, 0.5]} frozen={false} />
    ));
    expect(bars(container)).toHaveLength(5);
  });

  it('honours an explicit barCount over the band array length', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.5]} frozen={false} barCount={3} />
    ));
    expect(bars(container)).toHaveLength(3);
  });

  it('falls back to the size default when barCount is absent', () => {
    const { container } = render(() => (
      <BarVisualizer state="idle" size="icon" bands={[]} frozen={false} />
    ));
    expect(bars(container)).toHaveLength(3);
  });

  it('drives bar height from the bands while speaking', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0, 0.5, 1]} frozen={false} barCount={3} />
    ));
    const heights = bars(container).map((b) => b.style.height);
    expect(heights).toEqual(['0%', '50%', '100%']);
  });

  it('zeroes the heights in every state except speaking', () => {
    const { container } = render(() => (
      <BarVisualizer state="listening" size="md" bands={[1, 1, 1]} frozen={false} barCount={3} />
    ));
    bars(container).forEach((b) => expect(b.style.height).toBe('0%'));
  });

  it('lights every bar while speaking', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.5, 0.5, 0.5]} frozen={false} barCount={3} />
    ));
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('true'));
  });

  it('lights nothing when idle', () => {
    const { container } = render(() => (
      <BarVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={3} />
    ));
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('false'));
  });

  it('exposes a stable index on every bar for external styling', () => {
    const { container } = render(() => (
      <BarVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={4} />
    ));
    expect(bars(container).map((b) => b.dataset.kaiIndex)).toEqual(['0', '1', '2', '3']);
  });

  it('pads a short band array rather than dropping bars', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.4]} frozen={false} barCount={3} />
    ));
    expect(bars(container).map((b) => b.style.height)).toEqual(['40%', '40%', '40%']);
  });

  it('marks the host with the current state for CSS hooks', () => {
    const { container } = render(() => (
      <BarVisualizer state="thinking" size="md" bands={[]} frozen={false} />
    ));
    expect(container.querySelector('[data-kai-state="thinking"]')).toBeTruthy();
  });

  it('lets a caller render each bar themselves', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.5, 0.5]} frozen={false} barCount={2}>
        {(item) => <span data-custom={item.index}>{item.value()}</span>}
      </BarVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(2);
    expect(container.querySelectorAll('[part~="bar"]')).toHaveLength(0);
  });

  it('hands the render-prop the live highlight state and level', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.25, 0.75]} frozen={false} barCount={2}>
        {(item) => { seen.push(item); return <span />; }}
      </BarVisualizer>
    ));
    expect(seen.map((s) => s.value())).toEqual([0.25, 0.75]);
    expect(seen.every((s) => s.highlighted())).toBe(true);
  });

  // Parity with GridVisualizer's equivalent test: same accessor, same guard.
  it('zeroes the render-prop value in every state except speaking, even with stale bands', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <BarVisualizer state="idle" size="md" frozen={false} barCount={3} bands={[0.9, 0.9, 0.9]}>
        {(item) => { seen.push(item); return <span />; }}
      </BarVisualizer>
    ));
    expect(seen).toHaveLength(3);
    expect(seen.every((s) => s.value() === 0)).toBe(true);
  });

  it('keeps the render-prop live when bands update via a signal, not just at mount', async () => {
    const [bands, setBands] = createSignal([0.1, 0.2, 0.3]);
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <BarVisualizer state="speaking" size="md" bands={bands()} frozen={false} barCount={3}>
        {(item) => { seen.push(item); return <span />; }}
      </BarVisualizer>
    ));
    expect(seen.map((s) => s.value())).toEqual([0.1, 0.2, 0.3]);

    setBands([0.9, 0.8, 0.7]);
    await flush();

    // This is the streaming-audio case <Index> exists for: bands change on
    // nearly every frame while speaking. Re-invoking the SAME closures
    // captured on first render (not reading fresh items from a rerender,
    // which would pass even against a resolved-value implementation) is what
    // proves `value()` tracks `bands` live rather than freezing it at mount.
    expect(seen.map((s) => s.value())).toEqual([0.9, 0.8, 0.7]);
  });
});

// Deliberate, approved divergence from upstream: LiveKit only transitions
// colour, never height, which is byte-faithful but reads as visibly stepped
// once the demo runs at the real ~32ms analyser cadence. A short height
// transition was added to smooth that inter-frame stepping without adding
// perceptible lag; see the comment at the `transition` style declaration in
// variant-bar.tsx for the full rationale and the exact durations.
describe('BarVisualizer height transition (deliberate divergence from upstream)', () => {
  it('transitions height alongside colour when not frozen', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.5]} frozen={false} barCount={1} />
    ));
    const bar = bars(container)[0]!;
    expect(bar.style.transition).toContain('height');
    expect(bar.style.transition).toContain('background-color');
    expect(bar.style.transition).not.toBe('none');
  });

  it('disables the transition entirely when frozen, so a reduced-motion user gets an instant, static picture', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.5]} frozen={true} barCount={1} />
    ));
    const bar = bars(container)[0]!;
    expect(bar.style.transition).toBe('none');
  });
});

// `state="speaking"` above keeps `highlighted` constant true regardless of
// tick, which is exactly why the render-prop's staleness bug (finding 2) was
// invisible there. These exercise a SCRIPTED state, where the highlight set
// genuinely changes from frame to frame, plus the `frozen` contract that
// pins the sequencer at frame 0 (finding 3). The fake RAF/performance clock
// mirrors create-tween.test.ts: a single pending callback we advance by hand
// so ticking is deterministic instead of racing real timers.
describe('BarVisualizer frozen and live sequencing', () => {
  const { advance, isFramePending } = installFakeClock();

  it('never arms requestAnimationFrame while frozen, so the highlight stays pinned to the sequence\'s first frame', () => {
    const { container } = render(() => (
      <BarVisualizer state="listening" size="md" bands={[]} frozen={true} barCount={4} />
    ));

    // listening's first frame lights only the center bar (index 2 of 4).
    const initial = bars(container).map((b) => b.dataset.kaiHighlighted);
    expect(initial).toEqual(['false', 'false', 'true', 'false']);

    // The proof it is truly frozen, not just "hasn't ticked yet": no RAF was
    // ever armed, so there is nothing pending to advance.
    expect(isFramePending()).toBe(false);

    advance(5000);
    expect(bars(container).map((b) => b.dataset.kaiHighlighted)).toEqual(initial);
  });

  it('pins the highlight to the first frame while frozen, even across an unrelated rerender', async () => {
    const [cls, setCls] = createSignal('a');
    const { container } = render(() => (
      <BarVisualizer state="listening" size="md" bands={[]} frozen={true} barCount={4} class={cls()} />
    ));
    const initial = bars(container).map((b) => b.dataset.kaiHighlighted);
    expect(initial).toEqual(['false', 'false', 'true', 'false']);

    setCls('b');
    await flush();

    expect(bars(container).map((b) => b.dataset.kaiHighlighted)).toEqual(initial);
  });

  it('un-freezing lets the tick advance, the control case proving the frozen assertions above are not coincidental', () => {
    const { container } = render(() => (
      <BarVisualizer state="listening" size="md" bands={[]} frozen={false} barCount={4} />
    ));
    expect(bars(container).map((b) => b.dataset.kaiHighlighted)).toEqual(['false', 'false', 'true', 'false']);

    advance(500); // the listening interval
    expect(bars(container).map((b) => b.dataset.kaiHighlighted)).toEqual(['false', 'false', 'false', 'false']);
  });

  it('hands the render-prop accessors that reflect the CURRENT sequence frame, not a mount-time snapshot', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <BarVisualizer state="listening" size="md" bands={[]} frozen={false} barCount={4}>
        {(item) => { seen.push(item); return <span />; }}
      </BarVisualizer>
    ));

    expect(seen.map((s) => s.highlighted())).toEqual([false, false, true, false]);

    advance(500);

    // Same closures as above, called again: they must reflect the new tick.
    expect(seen.map((s) => s.highlighted())).toEqual([false, false, false, false]);
  });
});
