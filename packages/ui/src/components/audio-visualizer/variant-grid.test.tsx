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

// The grid is square-only (`count`), so threshold probes drive every column
// at the same level and assert on the set of ROWS lit.
const litRows = (c: HTMLElement, count: number) => [
  ...new Set(lit(c).map((e) => Math.floor(Number(e.dataset.kaiIndex) / count))),
].sort((a, b) => a - b);
const uniform = (count: number, level: number) => new Array(count).fill(level);

describe('GridVisualizer', () => {
  it('renders count x count cells', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} count={4} />
    ));
    expect(cells(container)).toHaveLength(16);
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
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} count={4} />
    ));
    const host = container.querySelector('[data-kai-state]') as HTMLElement;
    expect(host.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });

  it('lights the full column when a band is at full level', () => {
    const { container } = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        count={3} bands={[1, 0, 0]}
      />
    ));
    // Column 0 clears every row threshold; columns 1 and 2 are silent, which
    // sits under the silence floor, so they light nothing at all (see the
    // divergence note in variant-grid.tsx).
    const litIdx = lit(container)
      .map((e) => Number(e.dataset.kaiIndex))
      .sort((a, b) => a - b);
    expect(litIdx).toEqual([0, 3, 6]); // all of column 0, nothing else
  });

  // This test used to pin upstream's resting pattern: the middle row's
  // threshold was 0, so a silent column still lit it. That is exactly what
  // the divergence note in variant-grid.tsx removes — while speaking, a
  // silent mic now shows an EMPTY grid.
  it('shows an empty grid while speaking on a silent mic (levels 0 and 0.01)', () => {
    const silent = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        count={5} bands={uniform(5, 0)}
      />
    ));
    expect(lit(silent.container)).toHaveLength(0);
    cleanup();
    const nearSilent = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        count={5} bands={uniform(5, 0.01)}
      />
    ));
    expect(lit(nearSilent.container)).toHaveLength(0);
  });

  it('lights cells from the bands while listening when listeningAmplitude is set (opt-in)', () => {
    const { container } = render(() => (
      <GridVisualizer
        state="listening" size="md" frozen={false}
        count={3} bands={[1, 0, 0]}
        listeningAmplitude
      />
    ));
    // Identical to the speaking case above: column 0 fully lit, nothing else.
    const litIdx = lit(container)
      .map((e) => Number(e.dataset.kaiIndex))
      .sort((a, b) => a - b);
    expect(litIdx).toEqual([0, 3, 6]);
    // The host still reports the REAL state for CSS hooks.
    expect(container.querySelector('[data-kai-state="listening"]')).toBeTruthy();
  });

  it('keeps listening scripted without listeningAmplitude, even with loud bands (LiveKit parity control)', () => {
    const { container } = render(() => (
      <GridVisualizer
        state="listening" size="md" frozen={false}
        count={3} bands={[1, 0, 0]}
      />
    ));
    // The scripted listening animation lights at most one cell per frame,
    // never a whole column.
    expect(lit(container).length).toBeLessThanOrEqual(1);
  });

  it('lights exactly the middle row just past the silence floor (level 0.03)', () => {
    // The control bounding the floor from above: any real speech (bands sit
    // at ~0.1 and up) must light the centre instantly.
    const { container } = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        count={5} bands={uniform(5, 0.03)}
      />
    ));
    expect(litRows(container, 5)).toEqual([2]);
  });

  it('reaches the outer rows of a 5-row grid at a realistic speech peak (0.5)', () => {
    // Real speech through the aligned pipeline peaks at 0.51-0.54; upstream's
    // unscaled ramp put the outer rows at 2/3, which real speech never reached
    // (0 times in 139 measured samples). The scaled ramp tops out at ~0.433.
    const { container } = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        count={5} bands={uniform(5, 0.5)}
      />
    ));
    expect(litRows(container, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('pins the scaled threshold table on 5 rows: 0.02, ~0.217, ~0.433', () => {
    const rowsLitAt = (count: number, level: number) => {
      cleanup();
      const { container } = render(() => (
        <GridVisualizer
          state="speaking" size="md" frozen={false}
          count={count} bands={uniform(count, level)}
        />
      ));
      return litRows(container, count);
    };
    expect(rowsLitAt(5, 0.21)).toEqual([2]);                // under 0.65/3
    expect(rowsLitAt(5, 0.22)).toEqual([1, 2, 3]);          // over 0.65/3
    expect(rowsLitAt(5, 0.43)).toEqual([1, 2, 3]);          // under 1.3/3
    expect(rowsLitAt(5, 0.44)).toEqual([0, 1, 2, 3, 4]);    // over 1.3/3
  });

  it('generalizes the remap across counts, including the degenerate shapes', () => {
    const rowsLitAt = (count: number, level: number) => {
      cleanup();
      const { container } = render(() => (
        <GridVisualizer
          state="speaking" size="md" frozen={false}
          count={count} bands={uniform(count, level)}
        />
      ));
      return litRows(container, count);
    };
    // 3 rows: mid=1 -> thresholds 0.02, 0.325.
    expect(rowsLitAt(3, 0.32)).toEqual([1]);
    expect(rowsLitAt(3, 0.33)).toEqual([0, 1, 2]);
    // 7 rows: mid=3 -> thresholds 0.02, 0.1625, 0.325, 0.4875. A realistic
    // peak (0.5) clears even the outermost ring.
    expect(rowsLitAt(7, 0.2)).toEqual([2, 3, 4]);
    expect(rowsLitAt(7, 0.5)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Degenerate counts stay sane -- mid+1 >= 1 always, so no division blows up.
    // 1x1: mid=0, the only row is distance 0 -> just the silence floor.
    expect(rowsLitAt(1, 0)).toEqual([]);
    expect(rowsLitAt(1, 0.03)).toEqual([0]);
    // 2x2: mid=1 -> row 0 at 0.325, row 1 (the "middle") at 0.02. The
    // same floor(rows/2) asymmetry upstream had (theirs was 0.5 / 0).
    expect(rowsLitAt(2, 0.03)).toEqual([1]);
    expect(rowsLitAt(2, 0.33)).toEqual([0, 1]);
    // 4x4 (even): mid=2 -> 0.433, 0.217, 0.02, 0.217, centre-weighted on
    // row 2; silence still shows nothing.
    expect(rowsLitAt(4, 0)).toEqual([]);
    expect(rowsLitAt(4, 0.44)).toEqual([0, 1, 2, 3]);
  });

  it('lights exactly one cell in a scripted state', () => {
    const { container } = render(() => (
      <GridVisualizer state="thinking" size="md" bands={[]} frozen={false} count={5} />
    ));
    expect(lit(container)).toHaveLength(1);
  });

  // This test used to pin the idle resting pattern: one stationary centre
  // cell (index 12 of 5x5), upstream's default frame. Divergence (3) in
  // variant-grid.tsx (Rob, 2026-08-09) makes idle fully dark instead — which
  // also matches bar and radial, whose idle sequences were already empty.
  it('renders zero highlighted cells at disconnected, matching idle', () => {
    // 'disconnected' became first-class 2026-08-10 (Rob); the grid's
    // dead-connection look mirrors the dark idle grid for now (a LiveKit
    // measurement pass may adjust it).
    const { container } = render(() => (
      <GridVisualizer state="disconnected" size="md" bands={[]} frozen={false} count={5} />
    ));
    expect(cells(container)).toHaveLength(25);
    expect(lit(container)).toHaveLength(0);
  });

  it('renders zero highlighted cells at idle', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} count={5} />
    ));
    expect(cells(container)).toHaveLength(25); // the cells themselves stay
    expect(lit(container)).toHaveLength(0);
  });

  it('indexes every cell in row-major order', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} count={2} />
    ));
    expect(cells(container).map((e) => e.dataset.kaiIndex)).toEqual(['0', '1', '2', '3']);
  });

  it('lets a caller render each cell themselves', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} count={2}>
        {(item) => <span data-custom={item.index}>{item.value()}</span>}
      </GridVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(4);
    expect(container.querySelectorAll('[part~="cell"]')).toHaveLength(0);
  });

  it('hands the render-prop the live highlight state and level, per column', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        count={2} bands={[0, 1]}
      >
        {(item) => { seen.push(item); return <span />; }}
      </GridVisualizer>
    ));
    // Column 0 is silent (band 0), so nothing in it clears the silence floor;
    // column 1 is full (band 1) and lights every row.
    expect(seen.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(seen.map((s) => s.value())).toEqual([0, 1, 0, 1]);
    expect(seen.map((s) => s.highlighted())).toEqual([false, true, false, true]);
  });

  it('zeroes the render-prop value in every state except speaking, even with stale bands', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <GridVisualizer
        state="idle" size="md" frozen={false}
        count={2} bands={[0.9, 0.9]}
      >
        {(item) => { seen.push(item); return <span />; }}
      </GridVisualizer>
    ));
    expect(seen).toHaveLength(4);
    expect(seen.every((s) => s.value() === 0)).toBe(true);
  });

  it('keeps the render-prop live when bands update via a signal, not just at mount', async () => {
    const [bands, setBands] = createSignal([0, 1]);
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        count={2} bands={bands()}
      >
        {(item) => { seen.push(item); return <span />; }}
      </GridVisualizer>
    ));
    expect(seen.map((s) => s.value())).toEqual([0, 1, 0, 1]);
    expect(seen.map((s) => s.highlighted())).toEqual([false, true, false, true]);

    setBands([1, 0]);
    await flush();

    // This is the streaming-audio case <Index> exists for: bands change on
    // nearly every frame while speaking. Re-invoking the SAME closures
    // captured on first render (not reading fresh items from a rerender,
    // which would pass even against a resolved-value implementation) is what
    // proves `value()`/`highlighted()` track `bands` live rather than
    // freezing them at mount. Column roles are now the exact mirror of above
    // (the silence floor keeps the now-silent column 1 fully dark).
    expect(seen.map((s) => s.value())).toEqual([1, 0, 1, 0]);
    expect(seen.map((s) => s.highlighted())).toEqual([true, false, true, false]);
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
      <GridVisualizer state="listening" size="md" bands={[]} frozen={true} count={3} />
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
        count={3} class={cls()}
      />
    ));
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['4']);

    setCls('b');
    await flush();

    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['4']);
  });

  it('un-freezing lets the tick advance, the control case proving the frozen assertions above are not coincidental', () => {
    const { container } = render(() => (
      <GridVisualizer state="listening" size="md" bands={[]} frozen={false} count={3} />
    ));
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['4']);

    advance(100); // the default grid interval
    expect(lit(container)).toHaveLength(0);
  });

  it('hands the render-prop accessors that reflect the CURRENT sequence frame, not a mount-time snapshot', () => {
    const seen: { index: number; highlighted: () => boolean; value: () => number }[] = [];
    render(() => (
      <GridVisualizer state="listening" size="md" bands={[]} frozen={false} count={3}>
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
