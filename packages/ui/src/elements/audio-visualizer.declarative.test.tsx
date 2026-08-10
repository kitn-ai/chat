/**
 * Unit tests for the declarative `<kai-audio-visualizer>` API.
 *
 * `defineWebComponent` needs a real browser (Constructable Stylesheets, shadow
 * roots) for the custom-element upgrade itself, which is unsuitable for jsdom,
 * so most cases exercise `AudioVisualizer` directly with the values the facade
 * would hand it after attribute coercion. But the facade's own wiring (which
 * prop gets `num()`'d into which `AudioVisualizer` prop) is a plain Solid
 * component call with no shadow DOM involved, so it IS testable directly: one
 * test below calls the extracted `AudioVisualizerFacade` render function with
 * raw string values, the way an attribute would arrive. The `num()` coercion
 * helper and the `normalizeVariant` alias contract it relies on are each
 * tested directly too.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { AudioVisualizer, normalizeVariant } from '../components/audio-visualizer';
import { num, AudioVisualizerFacade } from './audio-visualizer';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
  vi.stubGlobal('AudioContext', undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('num(): the facade\'s attribute coercion helper', () => {
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
  // In an afterEach, not at the end of the one test below that mocks a
  // shader chunk: if an earlier assertion in that test throws, a cleanup
  // step sitting after it never runs, and the mock leaks into whatever test
  // happens to run next. Harmless (a no-op) for every other test here, since
  // doUnmock on an already-unmocked module does nothing.
  afterEach(() => vi.doUnmock('../components/audio-visualizer/variant-custom'));

  it('coerces a string bar-count attribute to a number', () => {
    const { container } = render(() => <AudioVisualizer barCount={num('7')} />);
    expect(container.querySelectorAll('[part~="bar"]')).toHaveLength(7);
  });

  it('coerces a string count attribute to a square grid', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="grid" count={num('4')} />
    ));
    expect(container.querySelectorAll('[part~="cell"]')).toHaveLength(16);
  });

  it('a blank bar-count attribute falls back to the size default, not NaN bars', () => {
    const { container } = render(() => <AudioVisualizer barCount={num('')} />);
    // size defaults to 'md' -> defaultBarCount('md') === 5
    expect(container.querySelectorAll('[part~="bar"]')).toHaveLength(5);
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
    const heights = Array.from(container.querySelectorAll('[part~="bar"]')).map(
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
      const heights = Array.from(container.querySelectorAll('[part~="bar"]')).map(
        (b) => (b as HTMLElement).style.height,
      );
      expect(heights).toEqual(['90%', '90%']);
    });
  });

  it('defaults every optional attribute to a working visualizer', () => {
    const { container } = render(() => <AudioVisualizer />);
    expect(container.querySelectorAll('[part~="bar"]')).toHaveLength(5);
    expect(container.querySelector('[data-kai-state="idle"]')).toBeTruthy();
  });

  it('invokes the real facade wiring with raw string attribute values, catching a swapped prop slot', () => {
    // Everything above renders AudioVisualizer directly with values the test
    // computed itself, so the wiring inside AudioVisualizerFacade (which prop
    // gets num()'d into which AudioVisualizer prop) is never actually
    // exercised -- a copy-paste swap, e.g. num(props.count) landing in the
    // barCount slot, would go uncaught. Call the real facade function with
    // STRING values, the way component-register hands it attributes, and
    // assert both the cell total AND the column template so a `count`
    // mis-wire cannot slip through as a coincidentally-right cell count.
    const attrProps = { variant: 'grid', count: '4' } as unknown as Parameters<
      typeof AudioVisualizerFacade
    >[0];
    const { container } = render(() => AudioVisualizerFacade(attrProps));
    expect(container.querySelectorAll('[part~="cell"]')).toHaveLength(16);
    const grid = container.querySelector('.grid') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });

  it('forwards the facade context\'s resolved dark boolean through to what a shader variant receives', async () => {
    // defineWebComponent already resolves theme='light'|'dark'|'auto' against
    // a live prefers-color-scheme listener (createDarkMode) to drive every
    // element's `.dark` class -- that resolved boolean is what `ctx.dark`
    // carries. The facade's own job is just relaying it as an explicit
    // 'light'/'dark' <AudioVisualizer theme=...>, never re-deriving the
    // auto-vs-explicit rule itself. Prove that relay reaches all the way to
    // what a shader variant actually receives, with a hand-rolled ctx the
    // way defineWebComponent would supply one (see define.tsx).
    //
    // Uses `variant-custom`, not `variant-wave`: another agent is
    // concurrently editing the latter in this same worktree, and mocking a
    // file mid-edit elsewhere turned out to make this test file's own module
    // graph interact badly with `index.test.tsx`'s (also `variant-wave`)
    // when both files run in the same invocation -- reproducible, and gone
    // entirely once this test stopped sharing a mocked specifier with that
    // file. `variant-custom` is untouched by any other test in either file.
    let captured: { dark: boolean } | undefined;
    vi.doMock('../components/audio-visualizer/variant-custom', () => ({
      default: (props: { dark: boolean }) => {
        captured = props;
        return null;
      },
    }));

    render(() =>
      AudioVisualizerFacade({ variant: 'custom' } as unknown as Parameters<typeof AudioVisualizerFacade>[0], {
        dark: () => true,
      }),
    );

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured!.dark).toBe(true);
  });
});

describe('normalizeVariant(): the aura -> aurora LiveKit-markup alias contract', () => {
  // The facade passes `variant` straight through untouched and relies on
  // normalizeVariant (../components/audio-visualizer) to resolve LiveKit's
  // `aura` naming to this kit's `aurora`. No other test in the repo exercises
  // normalizeVariant directly, so this is the only regression guard for that
  // contract. Verified to actually fail when the alias is removed: see the
  // fix report in task-9-report.md for the delete-the-alias RED proof.
  it('resolves the aura alias to aurora', () => {
    expect(normalizeVariant('aura')).toBe('aurora');
  });

  it('passes every known variant through unchanged', () => {
    for (const v of ['bar', 'grid', 'radial', 'wave', 'aurora', 'custom']) {
      expect(normalizeVariant(v)).toBe(v);
    }
  });

  it('falls back to bar for an unrecognized variant, and for undefined', () => {
    expect(normalizeVariant('not-a-real-variant')).toBe('bar');
    expect(normalizeVariant(undefined)).toBe('bar');
  });
});
