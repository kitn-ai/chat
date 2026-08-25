/**
 * Fit-to-container scaling: a visualizer whose container is narrower than its
 * size tier's natural pixel footprint scales the WHOLE picture down
 * proportionally instead of clipping at the edges (owner finding, rung 2).
 * At or above the natural width, rendering keeps today's exact px metrics.
 *
 * jsdom does no real layout and has no ResizeObserver, so these tests drive
 * the observer callback by hand with faked contentRects and assert on the
 * styles the component writes. The real-layout half (shrink a real viewport
 * below each tier's natural width and assert the host's bounding box never
 * overflows its parent horizontally) is a browser-only concern for the IVP.
 */
import { flush } from 'solid-js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import { AudioVisualizer } from './index';
import { computeFitScale } from './fit-scale';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('computeFitScale', () => {
  it('is 1 when the container is at least the natural width (never upscales)', () => {
    expect(computeFitScale(200, 100)).toBe(1);
    expect(computeFitScale(100, 100)).toBe(1);
  });

  it('is the proportional ratio when the container is narrower', () => {
    expect(computeFitScale(50, 100)).toBe(0.5);
    expect(computeFitScale(30, 120)).toBe(0.25);
  });

  it('is 1 for zero, negative, missing or non-finite measurements, so a bad reading can never blank the element', () => {
    expect(computeFitScale(0, 100)).toBe(1);
    expect(computeFitScale(100, 0)).toBe(1);
    expect(computeFitScale(-5, 100)).toBe(1);
    expect(computeFitScale(100, -5)).toBe(1);
    expect(computeFitScale(undefined, 100)).toBe(1);
    expect(computeFitScale(100, undefined)).toBe(1);
    expect(computeFitScale(Number.NaN, 100)).toBe(1);
    expect(computeFitScale(Infinity, 100)).toBe(1);
  });
});

type ROCallback = (entries: { target: Element; contentRect: { width: number; height: number } }[]) => void;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  cb: ROCallback;
  targets: Element[] = [];
  constructor(cb: ROCallback) {
    this.cb = cb;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) { this.targets.push(el); }
  unobserve(el: Element) { this.targets = this.targets.filter((t) => t !== el); }
  disconnect() { this.targets = []; }
}

const entry = (target: Element, width: number, height = 0) => ({
  target,
  contentRect: { width, height },
});

describe('AudioVisualizer fit-to-container scaling', () => {
  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  /** The observer instance watching the visualizer's own wrappers. */
  const observerFor = (el: Element) =>
    FakeResizeObserver.instances.find((ro) => ro.targets.includes(el));

  const mount = () => {
    const { container } = render(() => <AudioVisualizer barCount={3} />);
    const outer = container.firstElementChild as HTMLElement;
    const inner = outer.firstElementChild as HTMLElement;
    return { outer, inner };
  };

  it('clamps the host to its container width so a narrow parent can actually constrain it', () => {
    const { outer } = mount();
    expect(outer.style.maxWidth).toBe('100%');
  });

  it('pins the inner wrapper to its intrinsic size in both axes, so the natural-size measurement can never read back an adopted size (the feedback-collapse guard)', () => {
    // jsdom cannot show the collapse itself (no layout engine) -- headed
    // Chromium does, in .superpowers/sdd/2026-08-19-rung-2/w6-containment-probe.
    // What jsdom CAN pin is the style contract that prevents it: without
    // `align-self: flex-start` the inner stretches to the outer's adopted
    // height and the ResizeObserver measures that instead of the natural size.
    const { inner } = mount();
    expect(inner.style.flex).toBe('0 0 auto');
    expect(inner.style.alignSelf).toBe('flex-start');
  });

  it('scales the whole picture down, and shrinks the layout box with it, when the container is narrower than the natural size', async () => {
    const { outer, inner } = mount();
    const ro = observerFor(outer);
    expect(ro, 'the component must observe its own wrappers').toBeDefined();
    expect(ro!.targets).toContain(inner);

    // Natural size 200x80; the container only offers 100.
    ro!.cb([entry(inner, 200, 80), entry(outer, 100)]);

    await waitFor(() => expect(inner.style.transform).toBe('scale(0.5)'));
    expect(inner.style.transformOrigin).toBe('top left');
    // The layout box follows the visual, so the page never reserves the
    // unscaled height.
    expect(outer.style.height).toBe('40px');
    // The inner wrapper's layout box deliberately keeps its natural size
    // while scaled, so the outer must clip it -- painting AND hit-testing --
    // or it overhangs the host and eats a sibling's pointer events (W5 live
    // finding, mechanism 2).
    expect(outer.style.overflow).toBe('hidden');
  });

  it('returns to the exact natural rendering (no transform, no forced height) when the container grows back', async () => {
    const { outer, inner } = mount();
    const ro = observerFor(outer)!;

    ro.cb([entry(inner, 200, 80), entry(outer, 100)]);
    await waitFor(() => expect(inner.style.transform).toBe('scale(0.5)'));

    ro.cb([entry(outer, 200)]);
    await waitFor(() => expect(inner.style.transform).toBe(''));
    expect(outer.style.height).toBe('');
    expect(outer.style.overflow).toBe('');
  });

  it('never scales UP: a container wider than the natural size keeps the designed px metrics', async () => {
    const { outer, inner } = mount();
    const ro = observerFor(outer)!;

    ro.cb([entry(inner, 200, 80), entry(outer, 500)]);
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(inner.style.transform).toBe('');
    expect(outer.style.height).toBe('');
  });
});

describe('AudioVisualizer without ResizeObserver (SSR, jsdom default)', () => {
  it('renders untransformed at the natural size, exactly as before the fit feature', () => {
    // No ResizeObserver stub: jsdom genuinely lacks it, which is also the
    // SSR condition. The component must not touch it, and must not scale.
    expect(typeof globalThis.ResizeObserver).toBe('undefined');
    const { container } = render(() => <AudioVisualizer barCount={3} />);
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.querySelectorAll('[part~="bar"]')).toHaveLength(3);
    const inner = outer.firstElementChild as HTMLElement;
    expect(inner.style.transform).toBe('');
  });
});
