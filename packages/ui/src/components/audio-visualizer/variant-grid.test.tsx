import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { GridVisualizer } from './variant-grid';
import { installFakeClock } from '../../test-utils/fake-clock';

afterEach(cleanup);

// `~=` (token match), not `=` (exact match): `part` is a space-separated
// token list, and a highlighted cell's `part` is "cell highlighted", so
// `[part="cell"]` would silently stop matching it the moment it lights up.
const cells = (c: HTMLElement) => Array.from(c.querySelectorAll('[part~="cell"]')) as HTMLElement[];
const lit = (c: HTMLElement) => cells(c).filter((e) => e.dataset.kaiHighlighted === 'true');
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('GridVisualizer', () => {
  it('renders rowCount x columnCount cells', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={4} columnCount={6} />
    ));
    expect(cells(container)).toHaveLength(24);
  });

  it('defaults to 5x5, or 3x3 at icon size', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} />
    ));
    expect(cells(container)).toHaveLength(25);
    cleanup();
    const small = render(() => (
      <GridVisualizer state="idle" size="icon" bands={[]} frozen={false} />
    ));
    expect(cells(small.container)).toHaveLength(9);
  });

  it('lays out the columns via grid-template-columns', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={3} columnCount={4} />
    ));
    const host = container.querySelector('[data-kai-state]') as HTMLElement;
    expect(host.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });

  it('lights the full column when a band is at full level', () => {
    const { container } = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        rowCount={5} columnCount={3} bands={[1, 0, 0]}
      />
    ));
    // Column 0 clears every row threshold; columns 1 and 2 clear only the middle row.
    const litIdx = lit(container).map((e) => Number(e.dataset.kaiIndex));
    expect(litIdx).toContain(0);   // row 0, col 0
    expect(litIdx).toContain(6);   // row 2, col 0
    expect(litIdx).toContain(12);  // row 4, col 0
    expect(litIdx).not.toContain(1); // row 0, col 1 needs a loud band
  });

  it('lights only the middle row of a silent column', () => {
    const { container } = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        rowCount={5} columnCount={1} bands={[0]}
      />
    ));
    // threshold at the middle row is 0, so a zero band still clears it.
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['2']);
  });

  it('lights exactly one cell in a scripted state', () => {
    const { container } = render(() => (
      <GridVisualizer state="thinking" size="md" bands={[]} frozen={false} rowCount={5} columnCount={5} />
    ));
    expect(lit(container)).toHaveLength(1);
  });

  it('rests on the center cell when idle', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={5} columnCount={5} />
    ));
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['12']);
  });

  it('indexes every cell in row-major order', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={2} columnCount={3} />
    ));
    expect(cells(container).map((e) => e.dataset.kaiIndex)).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('lets a caller render each cell themselves', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={2} columnCount={3}>
        {(item) => <span data-custom={item.index}>{item.value()}</span>}
      </GridVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(6);
    expect(container.querySelectorAll('[part~="cell"]')).toHaveLength(0);
  });

  it('hands the render-prop the live highlight state and level, per column', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        rowCount={3} columnCount={2} bands={[0, 1]}
      >
        {(item) => { seen.push(item); return <span />; }}
      </GridVisualizer>
    ));
    // Column 0 is silent (band 0), column 1 is full (band 1); the middle row
    // (threshold 0) lights regardless, the outer rows only light column 1.
    expect(seen.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(seen.map((s) => s.value())).toEqual([0, 1, 0, 1, 0, 1]);
    expect(seen.map((s) => s.highlighted())).toEqual([false, true, true, true, false, true]);
  });

  it('zeroes the render-prop value in every state except speaking, even with stale bands', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <GridVisualizer
        state="idle" size="md" frozen={false}
        rowCount={2} columnCount={3} bands={[0.9, 0.9, 0.9]}
      >
        {(item) => { seen.push(item); return <span />; }}
      </GridVisualizer>
    ));
    expect(seen).toHaveLength(6);
    expect(seen.every((s) => s.value() === 0)).toBe(true);
  });

  it('keeps the render-prop live when bands update via a signal, not just at mount', async () => {
    const [bands, setBands] = createSignal([0, 1]);
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        rowCount={3} columnCount={2} bands={bands()}
      >
        {(item) => { seen.push(item); return <span />; }}
      </GridVisualizer>
    ));
    expect(seen.map((s) => s.value())).toEqual([0, 1, 0, 1, 0, 1]);
    expect(seen.map((s) => s.highlighted())).toEqual([false, true, true, true, false, true]);

    setBands([1, 0]);
    await flush();

    // This is the streaming-audio case <Index> exists for: bands change on
    // nearly every frame while speaking. Re-invoking the SAME closures
    // captured on first render (not reading fresh items from a rerender,
    // which would pass even against a resolved-value implementation) is what
    // proves `value()`/`highlighted()` track `bands` live rather than
    // freezing them at mount. Column roles are now the mirror of above.
    expect(seen.map((s) => s.value())).toEqual([1, 0, 1, 0, 1, 0]);
    expect(seen.map((s) => s.highlighted())).toEqual([true, false, true, true, true, false]);
  });
});

// `state="speaking"` above keeps things static enough (thresholds, not the
// clock) that the render-prop's staleness bug (finding 2) never showed up.
// These exercise a SCRIPTED state, where the highlight genuinely changes
// from frame to frame, plus the `frozen` contract (finding 3). Same fake
// RAF/performance clock as variant-bar.test.tsx and create-tween.test.ts: a
// single pending callback advanced by hand for deterministic ticking.
describe('GridVisualizer frozen and live sequencing', () => {
  const { advance, isFramePending } = installFakeClock();

  it('never arms requestAnimationFrame while frozen, so the highlight stays pinned to the sequence\'s first frame', () => {
    const { container } = render(() => (
      <GridVisualizer state="listening" size="md" bands={[]} frozen={true} rowCount={3} columnCount={3} />
    ));

    // listening's first frame lights only the center cell (index 4 of 3x3).
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['4']);
    expect(isFramePending()).toBe(false);

    advance(5000);
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['4']);
  });

  it('pins the highlight to the first frame while frozen, even across an unrelated rerender', async () => {
    const [cls, setCls] = createSignal('a');
    const { container } = render(() => (
      <GridVisualizer
        state="listening" size="md" bands={[]} frozen={true}
        rowCount={3} columnCount={3} class={cls()}
      />
    ));
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['4']);

    setCls('b');
    await flush();

    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['4']);
  });

  it('un-freezing lets the tick advance, the control case proving the frozen assertions above are not coincidental', () => {
    const { container } = render(() => (
      <GridVisualizer state="listening" size="md" bands={[]} frozen={false} rowCount={3} columnCount={3} />
    ));
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['4']);

    advance(100); // the default grid interval
    expect(lit(container)).toHaveLength(0);
  });

  it('hands the render-prop accessors that reflect the CURRENT sequence frame, not a mount-time snapshot', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <GridVisualizer state="listening" size="md" bands={[]} frozen={false} rowCount={3} columnCount={3}>
        {(item) => { seen.push(item); return <span />; }}
      </GridVisualizer>
    ));

    expect(seen.map((s) => s.highlighted())).toEqual([
      false, false, false,
      false, true, false,
      false, false, false,
    ]);

    advance(100);

    // Same closures as above, called again: they must reflect the new tick.
    expect(seen.every((s) => s.highlighted() === false)).toBe(true);
  });
});
