import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { RadialVisualizer } from './variant-radial';
import { defaultRadialBarCount } from './sizes';
import { installFakeClock } from '../../test-utils/fake-clock';

afterEach(cleanup);

// `~=` (token match), not `=` (exact match): `part` is a space-separated
// token list, and a highlighted bar's `part` is "bar highlighted", so
// `[part="bar"]` would silently stop matching it the moment it lights up.
const bars = (c: HTMLElement) => Array.from(c.querySelectorAll('[part~="bar"]')) as HTMLElement[];
const spokes = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-kai-spoke]')) as HTMLElement[];
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('defaultRadialBarCount', () => {
  it('uses 12 bars at the two smallest sizes and 24 above', () => {
    expect(defaultRadialBarCount('icon')).toBe(12);
    expect(defaultRadialBarCount('sm')).toBe(12);
    expect(defaultRadialBarCount('md')).toBe(24);
  });
});

describe('RadialVisualizer', () => {
  it('renders one bar per position around the ring', () => {
    const { container } = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={8} />
    ));
    expect(bars(container)).toHaveLength(8);
  });

  it('spaces the spokes evenly around a full turn', () => {
    const { container } = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={4} radius={40} />
    ));
    const transforms = spokes(container).map((s) => s.style.transform);
    expect(transforms[0]).toContain('rotate(0rad)');
    expect(transforms[1]).toContain(`rotate(${Math.PI / 2}rad)`);
    expect(transforms[2]).toContain(`rotate(${Math.PI}rad)`);
    transforms.forEach((t) => expect(t).toContain('translateY(40px)'));
  });

  it('sizes each dot from the circumference so bars never overlap', () => {
    const { container } = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={8} radius={40} />
    ));
    const expected = (40 * Math.PI) / 8;
    expect(bars(container)[0]!.style.width).toBe(`${expected}px`);
    // dotSize doubles as min-height, so a dot still shows at zero height.
    expect(bars(container)[0]!.style.minHeight).toBe(`${expected}px`);
  });

  it('floors barCount at 1, so a zero or negative value never divides by zero for dotSize', () => {
    // A floored count of 1 is never divisible by 4, so this also fires the
    // divisibility warning; mock it so the test output stays clean.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const zero = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={0} radius={40} />
    ));
    expect(bars(zero.container)).toHaveLength(1);
    expect(spokes(zero.container)).toHaveLength(1);
    expect(bars(zero.container)[0]!.style.width).toBe(`${(40 * Math.PI) / 1}px`);
    cleanup();

    const negative = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={-5} radius={40} />
    ));
    expect(bars(negative.container)).toHaveLength(1);

    warn.mockRestore();
  });

  it('collapses every bar to zero height outside speaking, even with oversized bands', () => {
    const { container } = render(() => (
      <RadialVisualizer state="listening" size="md" bands={[5, 10, 100, 1]} frozen={false} barCount={4} />
    ));
    bars(container).forEach((b) => expect(b.style.height).toBe('0px'));
  });

  it('extends bars from the bands while speaking', () => {
    const { container } = render(() => (
      <RadialVisualizer
        state="speaking" size="md" frozen={false}
        barCount={4} radius={40} bands={[0, 0.5, 1, 0]}
      />
    ));
    const dot = (40 * Math.PI) / 4;
    const heights = bars(container).map((b) => b.style.height);
    expect(heights[0]).toBe('0px');
    expect(heights[1]).toBe(`${dot * 10 * 0.5}px`);
    expect(heights[2]).toBe(`${dot * 10 * 1}px`);
    expect(heights[3]).toBe('0px');
  });

  it('lights the whole ring and spins while thinking', () => {
    const { container } = render(() => (
      <RadialVisualizer state="thinking" size="md" bands={[]} frozen={false} barCount={8} />
    ));
    // `thinking` overrides the scripted highlight groups: the whole ring
    // reads as lit and the container spins instead of blinking a subset.
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('true'));
    const host = container.querySelector('[data-kai-state="thinking"]') as HTMLElement;
    expect(host.className).toContain('animate-spin');
  });

  it('extends bars from the bands while listening when listeningAmplitude is set (opt-in)', () => {
    const { container } = render(() => (
      <RadialVisualizer
        state="listening" size="md" frozen={false}
        barCount={4} radius={40} bands={[0, 0.5, 1, 0]}
        listeningAmplitude
      />
    ));
    const dot = (40 * Math.PI) / 4;
    const heights = bars(container).map((b) => b.style.height);
    expect(heights[1]).toBe(`${dot * 10 * 0.5}px`);
    expect(heights[2]).toBe(`${dot * 10 * 1}px`);
    // The host still reports the REAL state for CSS hooks.
    expect(container.querySelector('[data-kai-state="listening"]')).toBeTruthy();
  });

  it('does not leak amplitude into any other scripted state, even with listeningAmplitude set', () => {
    const { container } = render(() => (
      <RadialVisualizer
        state="thinking" size="md" bands={[1, 1, 1, 1]} frozen={false} barCount={4}
        listeningAmplitude
      />
    ));
    bars(container).forEach((b) => expect(b.style.height).toBe('0px'));
  });

  it('lights the whole ring while speaking', () => {
    const { container } = render(() => (
      <RadialVisualizer state="speaking" size="md" bands={[0.5, 0.5, 0.5, 0.5]} frozen={false} barCount={4} />
    ));
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('true'));
  });

  it('lets a caller render each bar themselves', () => {
    const { container } = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={4}>
        {(item) => <span data-custom={item.index}>{item.value()}</span>}
      </RadialVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(4);
    expect(container.querySelectorAll('[part~="bar"]')).toHaveLength(0);
    // The positioning wrapper still places custom markup on the ring.
    expect(spokes(container)).toHaveLength(4);
  });

  it('keeps the render-prop live when bands update via a signal, not just at mount', async () => {
    const [bands, setBands] = createSignal([0, 0.5, 1, 0]);
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <RadialVisualizer state="speaking" size="md" frozen={false} barCount={4} bands={bands()}>
        {(item) => { seen.push(item); return <span />; }}
      </RadialVisualizer>
    ));
    expect(seen.map((s) => s.value())).toEqual([0, 0.5, 1, 0]);

    setBands([1, 0, 0.25, 0.75]);
    await flush();

    // This is the streaming-audio case <Index> exists for: bands change on
    // nearly every frame while speaking. Re-invoking the SAME closures
    // captured on first render (not reading fresh items from a rerender,
    // which would pass even against a resolved-value implementation) is what
    // proves `value()` tracks `bands` live rather than freezing it at mount.
    // (`highlighted()` is not asserted here: radial lights the whole ring
    // while speaking regardless of band values, so it carries no signal --
    // see the "lights the whole ring while speaking" test above.)
    expect(seen.map((s) => s.value())).toEqual([1, 0, 0.25, 0.75]);
  });
});

// Deliberate, approved divergence from upstream: LiveKit only transitions
// colour, never height, which is byte-faithful but reads as visibly stepped
// once the demo runs at the real ~32ms analyser cadence. A short height
// transition was added to smooth that inter-frame stepping without adding
// perceptible lag; see the comment at the `transition` style declaration in
// variant-radial.tsx for the full rationale. `150ms` for colour is the
// carried upstream constant, unchanged by this addition.
describe('RadialVisualizer height transition (deliberate divergence from upstream)', () => {
  it('transitions height alongside colour when not frozen', () => {
    const { container } = render(() => (
      <RadialVisualizer state="speaking" size="md" bands={[0.5, 0.5, 0.5, 0.5]} frozen={false} barCount={4} />
    ));
    const bar = bars(container)[0]!;
    expect(bar.style.transition).toContain('height');
    expect(bar.style.transition).toContain('background-color');
    expect(bar.style.transition).not.toBe('none');
  });

  it('disables the transition entirely when frozen, so a reduced-motion user gets an instant, static picture', () => {
    const { container } = render(() => (
      <RadialVisualizer state="speaking" size="md" bands={[0.5, 0.5, 0.5, 0.5]} frozen={true} barCount={4} />
    ));
    const bar = bars(container)[0]!;
    expect(bar.style.transition).toBe('none');
  });
});

describe('RadialVisualizer barCount divisibility warning', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns once when barCount is not divisible by 4', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={7} />
    ));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('barCount 7');
  });

  it('does not warn when barCount is divisible by 4', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={8} />
    ));
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn for the size defaults (12 and 24 are both divisible by 4)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(() => <RadialVisualizer state="idle" size="icon" bands={[]} frozen={false} />);
    render(() => <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not refire the warning on an unrelated reactive rerender', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [cls, setCls] = createSignal('a');
    render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={7} class={cls()} />
    ));
    expect(warn).toHaveBeenCalledTimes(1);

    setCls('b');
    await flush();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

// `state="listening"` below is a SCRIPTED state, where the highlight set
// genuinely changes from frame to frame, plus the `frozen` contract that pins
// the sequencer at frame 0. `speaking` (used in the tests above) would leave
// `highlighted` constant `true` regardless of tick, which is exactly why the
// render-prop's staleness bug (finding 2) went unnoticed in the other two
// variants' first pass. The fake RAF/performance clock mirrors
// variant-bar.test.tsx and variant-grid.test.tsx: a single pending callback we
// advance by hand so ticking is deterministic instead of racing real timers.
describe('RadialVisualizer frozen and live sequencing', () => {
  const { advance, isFramePending } = installFakeClock();

  it('never arms requestAnimationFrame while frozen, so the highlight stays pinned to the sequence\'s first frame', () => {
    const { container } = render(() => (
      <RadialVisualizer state="listening" size="md" bands={[]} frozen={true} barCount={8} />
    ));

    // listening's first frame lights the first radial group of 8: 0, 2, 4, 6.
    const initial = bars(container).map((b) => b.dataset.kaiHighlighted);
    expect(initial).toEqual(['true', 'false', 'true', 'false', 'true', 'false', 'true', 'false']);

    // The proof it is truly frozen, not just "hasn't ticked yet": no RAF was
    // ever armed, so there is nothing pending to advance.
    expect(isFramePending()).toBe(false);

    advance(5000);
    expect(bars(container).map((b) => b.dataset.kaiHighlighted)).toEqual(initial);
  });

  it('pins the highlight to the first frame while frozen, even across an unrelated rerender', async () => {
    const [cls, setCls] = createSignal('a');
    const { container } = render(() => (
      <RadialVisualizer state="listening" size="md" bands={[]} frozen={true} barCount={8} class={cls()} />
    ));
    const initial = bars(container).map((b) => b.dataset.kaiHighlighted);
    expect(initial).toEqual(['true', 'false', 'true', 'false', 'true', 'false', 'true', 'false']);

    setCls('b');
    await flush();

    expect(bars(container).map((b) => b.dataset.kaiHighlighted)).toEqual(initial);
  });

  it('un-freezing lets the tick advance, the control case proving the frozen assertions above are not coincidental', () => {
    const { container } = render(() => (
      <RadialVisualizer state="listening" size="md" bands={[]} frozen={false} barCount={8} />
    ));
    expect(bars(container).map((b) => b.dataset.kaiHighlighted)).toEqual([
      'true', 'false', 'true', 'false', 'true', 'false', 'true', 'false',
    ]);

    advance(500); // the listening interval
    expect(bars(container).map((b) => b.dataset.kaiHighlighted)).toEqual([
      'false', 'true', 'false', 'true', 'false', 'true', 'false', 'true',
    ]);
  });

  it('hands the render-prop accessors that reflect the CURRENT sequence frame, not a mount-time snapshot', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <RadialVisualizer state="listening" size="md" bands={[]} frozen={false} barCount={8}>
        {(item) => { seen.push(item); return <span />; }}
      </RadialVisualizer>
    ));

    expect(seen.map((s) => s.highlighted())).toEqual([
      true, false, true, false, true, false, true, false,
    ]);

    advance(500);

    // Same closures as above, called again: they must reflect the new tick.
    expect(seen.map((s) => s.highlighted())).toEqual([
      false, true, false, true, false, true, false, true,
    ]);
  });

  it('does not spin while frozen for reduced motion, even though thinking still lights the whole ring', () => {
    const { container } = render(() => (
      <RadialVisualizer state="thinking" size="md" bands={[]} frozen={true} barCount={8} />
    ));
    const host = container.querySelector('[data-kai-state="thinking"]') as HTMLElement;

    expect(isFramePending()).toBe(false);
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('true'));
    expect(host.className).not.toContain('animate-spin');

    advance(5000);
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('true'));
    expect(host.className).not.toContain('animate-spin');
  });
});
