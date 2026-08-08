import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { BarVisualizer } from './variant-bar';
import { defaultBarCount } from './sizes';

afterEach(cleanup);

const bars = (c: HTMLElement) => Array.from(c.querySelectorAll('[part="bar"]')) as HTMLElement[];

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
        {(item) => <span data-custom={item.index}>{item.value}</span>}
      </BarVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(2);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(0);
  });

  it('hands the render-prop the live highlight state and level', () => {
    const seen: { index: number; highlighted: boolean; value: number }[] = [];
    render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.25, 0.75]} frozen={false} barCount={2}>
        {(item) => { seen.push(item); return <span />; }}
      </BarVisualizer>
    ));
    expect(seen.map((s) => s.value)).toEqual([0.25, 0.75]);
    expect(seen.every((s) => s.highlighted)).toBe(true);
  });
});
