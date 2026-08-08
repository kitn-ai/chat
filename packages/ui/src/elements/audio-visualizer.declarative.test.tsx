/**
 * Unit tests for the declarative `<kai-audio-visualizer>` API.
 *
 * Mirrors toast.declarative.test.tsx: `defineWebComponent` needs a real
 * browser (Constructable Stylesheets, shadow roots) and is unsuitable for
 * jsdom, so we exercise `AudioVisualizer` directly with the values the facade
 * would hand it after attribute coercion, rather than upgrading a real custom
 * element. The `num()` coercion helper itself, which is where the facade's
 * own logic lives (everything else is a straight pass-through), is tested
 * directly below too.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { AudioVisualizer, type VisualizerVariant } from '../components/audio-visualizer';
import { num } from './audio-visualizer';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
  vi.stubGlobal('AudioContext', undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('num() — the facade\'s attribute coercion helper', () => {
  it('coerces a numeric string', () => {
    expect(num('7')).toBe(7);
  });

  it('returns undefined for a missing attribute (null)', () => {
    expect(num(null)).toBeUndefined();
  });

  it('returns undefined for a missing attribute (undefined)', () => {
    expect(num(undefined)).toBeUndefined();
  });

  it('returns undefined for a blank attribute, never NaN', () => {
    const result = num('');
    expect(result).toBeUndefined();
    expect(Number.isNaN(result)).toBe(false);
  });

  it('returns undefined for a non-numeric attribute, never NaN', () => {
    const result = num('not-a-number');
    expect(result).toBeUndefined();
    expect(Number.isNaN(result)).toBe(false);
  });

  it('passes through an already-numeric JS property value', () => {
    expect(num(7)).toBe(7);
  });

  it('treats 0 as a real value, not as missing', () => {
    expect(num('0')).toBe(0);
    expect(num(0)).toBe(0);
  });
});

describe('kai-audio-visualizer declarative API', () => {
  it('coerces a string bar-count attribute to a number', () => {
    const { container } = render(() => <AudioVisualizer barCount={num('7')} />);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(7);
  });

  it('coerces string row-count and column-count', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="grid" rowCount={num('3')} columnCount={num('4')} />
    ));
    expect(container.querySelectorAll('[part="cell"]')).toHaveLength(12);
  });

  it('a blank bar-count attribute falls back to the size default, not NaN bars', () => {
    const { container } = render(() => <AudioVisualizer barCount={num('')} />);
    // size defaults to 'md' -> defaultBarCount('md') === 5
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(5);
  });

  it('applies a color attribute to the rendered geometry', () => {
    const { container } = render(() => <AudioVisualizer color="#ff0000" />);
    const host = container.querySelector('[data-kai-state]') as HTMLElement;
    expect(host.style.color).toBe('rgb(255, 0, 0)');
  });

  it('accepts bands set as a JS property', () => {
    const { container } = render(() => (
      <AudioVisualizer state="speaking" barCount={2} bands={[0.25, 0.75]} />
    ));
    const heights = Array.from(container.querySelectorAll('[part="bar"]')).map(
      (b) => (b as HTMLElement).style.height,
    );
    expect(heights).toEqual(['25%', '75%']);
  });

  it('re-renders when bands is replaced with a new array reference', async () => {
    // Streaming requires a NEW array reference per frame; mutating in place
    // does not re-render. Prove it against the real component, not a fake.
    const [bands, setBands] = createSignal<number[]>([0.1, 0.1]);
    const { container } = render(() => (
      <AudioVisualizer state="speaking" barCount={2} bands={bands()} />
    ));
    setBands([0.9, 0.9]);
    await waitFor(() => {
      const heights = Array.from(container.querySelectorAll('[part="bar"]')).map(
        (b) => (b as HTMLElement).style.height,
      );
      expect(heights).toEqual(['90%', '90%']);
    });
  });

  it('defaults every optional attribute to a working visualizer', () => {
    const { container } = render(() => <AudioVisualizer />);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(5);
    expect(container.querySelector('[data-kai-state="idle"]')).toBeTruthy();
  });

  it('passes the "aura" LiveKit alias through untouched, resolving identically to "aurora"', () => {
    // The facade's job is to pass `variant` straight through and let
    // normalizeVariant (../components/audio-visualizer) do the alias
    // resolution -- the same contract as `state`. Both currently render the
    // shader path's synchronous bar fallback (the chunk loads async), so
    // asserting a specific bar count would really be testing that fallback,
    // not the alias. Asserting the two render IDENTICALLY, whatever that
    // markup is, proves "aura" was not mangled into something else.
    // Cast, exactly like the facade does: AudioVisualizerProps.variant is
    // typed narrowly as VisualizerVariant even though normalizeVariant (what
    // actually consumes it at runtime) accepts any string. The facade's
    // pass-through cast is what this test is proving is safe.
    const alias = render(() => <AudioVisualizer variant={'aura' as VisualizerVariant} />);
    const aliasHtml = alias.container.innerHTML;
    cleanup();
    const canonical = render(() => <AudioVisualizer variant="aurora" />);
    expect(aliasHtml).toBe(canonical.container.innerHTML);
  });
});
