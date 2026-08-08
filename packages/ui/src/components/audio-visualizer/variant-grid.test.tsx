import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { GridVisualizer } from './variant-grid';

afterEach(cleanup);

const cells = (c: HTMLElement) => Array.from(c.querySelectorAll('[part="cell"]')) as HTMLElement[];
const lit = (c: HTMLElement) => cells(c).filter((e) => e.dataset.kaiHighlighted === 'true');

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
        {(item) => <span data-custom={item.index}>{item.value}</span>}
      </GridVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(6);
    expect(container.querySelectorAll('[part="cell"]')).toHaveLength(0);
  });

  it('hands the render-prop the live highlight state and level, per column', () => {
    const seen: { index: number; highlighted: boolean; value: number }[] = [];
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
    expect(seen.map((s) => s.value)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(seen.map((s) => s.highlighted)).toEqual([false, true, true, true, false, true]);
  });
});
