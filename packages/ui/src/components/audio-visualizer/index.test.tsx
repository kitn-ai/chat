import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import { AudioVisualizer } from './index';
import * as UseAudioAnalysisModule from '../../primitives/use-audio-analysis';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('AudioVisualizer dispatch', () => {
  it('renders bars by default', () => {
    const { container } = render(() => <AudioVisualizer />);
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);
  });

  it('renders cells for the grid variant', () => {
    const { container } = render(() => <AudioVisualizer variant="grid" />);
    expect(container.querySelectorAll('[part="cell"]').length).toBe(25);
  });

  it('renders spokes for the radial variant', () => {
    const { container } = render(() => <AudioVisualizer variant="radial" />);
    expect(container.querySelectorAll('[data-kai-spoke]').length).toBe(24);
  });

  it('falls back to bars for an unknown variant', () => {
    const { container } = render(() => <AudioVisualizer variant={'nonsense' as never} />);
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);
  });

  it('normalizes a LiveKit state alias onto ours', () => {
    const { container } = render(() => <AudioVisualizer state={'initializing' as never} />);
    expect(container.querySelector('[data-kai-state="connecting"]')).toBeTruthy();
  });

  it('passes caller-supplied bands straight through without touching Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const { container } = render(() => (
      <AudioVisualizer variant="bar" state="speaking" barCount={3} bands={[0.2, 0.4, 0.6]} />
    ));
    const heights = Array.from(container.querySelectorAll('[part="bar"]')).map(
      (b) => (b as HTMLElement).style.height,
    );
    expect(heights).toEqual(['20%', '40%', '60%']);
  });

  it('is decorative by default', () => {
    const { container } = render(() => <AudioVisualizer />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
  });

  it('becomes an labelled image when a label is given', () => {
    const { container } = render(() => <AudioVisualizer label="Assistant audio" />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Assistant audio');
    expect(host.getAttribute('aria-hidden')).toBeNull();
  });

  it('renders a bar fallback while a shader variant loads', () => {
    // "aura" is the LiveKit-compatibility alias for "aurora" -- runtime-only,
    // not a member of the VisualizerVariant type, hence the cast.
    const { container } = render(() => <AudioVisualizer variant={'aura' as never} />);
    // The dynamic import has not resolved on the first synchronous frame.
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);
  });

  it('freezes the sequence when the user prefers reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(() => <AudioVisualizer variant="radial" state="thinking" />);
    await waitFor(() => {
      const host = container.querySelector('[data-kai-state="thinking"]') as HTMLElement;
      expect(host.className).not.toContain('animate-spin');
    });
  });
});

// The brief's behaviors call out "warn once on failure, do not throw" for a
// shader chunk that fails to load, but the prescribed test list above never
// exercises it. `vi.doMock` makes the dynamic `import('./variant-wave')`
// reject instead of resolve, so this proves the fallback stays on bars
// permanently -- not just before resolution settles -- and that the failure
// is reported once via console.warn rather than thrown.
describe('AudioVisualizer shader load failure', () => {
  // In an afterEach, not at the end of the test body: if an earlier
  // assertion in the test throws, a cleanup step sitting after it never
  // runs, and the mock leaks into whatever test happens to run next.
  afterEach(() => {
    vi.doUnmock('./variant-wave');
    vi.restoreAllMocks();
  });

  it('falls back to bars permanently and warns once when the shader chunk fails to load', async () => {
    vi.doMock('./variant-wave', () => {
      throw new Error('chunk failed');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = render(() => <AudioVisualizer variant="wave" />);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]?.[0]).toContain('variant="wave"');
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);
  });
});

// Nothing above exercises a prop change after mount, which is exactly how the
// band-count-reactivity bug (index.tsx calling `bandCount()` once instead of
// passing the accessor) went unnoticed: `useAudioAnalysis` is Solid setup
// code, called exactly once per component instance, so the only way to prove
// the COUNT stays live is to capture the accessor it was actually given and
// call it again after a post-mount prop change -- a DOM-level assertion can't
// distinguish this, since every variant re-pads/truncates whatever `bands()`
// array it receives to its own count regardless of the array's real length.
describe('AudioVisualizer band count reactivity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('re-requests the analyser bucket count when barCount changes post-mount', async () => {
    const spy = vi
      .spyOn(UseAudioAnalysisModule, 'useAudioAnalysis')
      .mockReturnValue({ bands: () => [], volume: () => 0 });

    const [barCount, setBarCount] = createSignal(3);
    render(() => (
      <AudioVisualizer variant="bar" stream={{} as MediaStream} barCount={barCount()} />
    ));

    // Solid components run their setup function once, so useAudioAnalysis
    // must be called exactly once for this instance -- if a future change
    // regressed to calling it per-render, this would catch that too.
    expect(spy).toHaveBeenCalledTimes(1);
    const options = spy.mock.calls[0]?.[1] as { bands: () => number };
    expect(options.bands()).toBe(3);

    setBarCount(7);
    await Promise.resolve();

    // Same accessor, called again: it must reflect the NEW prop, not a
    // mount-time snapshot. Before the fix this field was a plain number (3),
    // so calling it here would have thrown "options.bands is not a function"
    // -- itself proof the old shape was broken, not just stale.
    expect(options.bands()).toBe(7);
  });
});

// The dispatcher declared `children` on AudioVisualizerProps but never
// forwarded it, so the render-prop each DOM variant supports had no public
// path to it -- dead code from a consumer's perspective. These prove it
// actually reaches each variant (not just that the dispatcher still renders),
// that it works whether passed as nested JSX or an explicit prop, and that
// the shader path is deliberately excluded rather than incidentally so.
describe('AudioVisualizer children render-prop', () => {
  const renderItem = (item: { index: number }) => <span data-custom={item.index} />;

  // In an afterEach, not at the end of the shader test's body: if an earlier
  // assertion there throws, a cleanup step after it never runs and the mock
  // leaks into whatever test happens to run next (same lesson as the
  // shader-load-failure describe above).
  afterEach(() => vi.doUnmock('./variant-wave'));

  it('forwards children to the bar variant, replacing its default markup', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="bar">{renderItem}</AudioVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(0);
  });

  it('forwards children to the grid variant, replacing its default markup', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="grid">{renderItem}</AudioVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(25);
    expect(container.querySelectorAll('[part="cell"]')).toHaveLength(0);
  });

  it('forwards children to the radial variant, rendered inside each spoke', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="radial">{renderItem}</AudioVisualizer>
    ));
    // The spoke wrapper stays (radial positions it via CSS transform); only
    // the markup INSIDE it is replaced, unlike bar/grid which swap the node
    // itself.
    expect(container.querySelectorAll('[data-kai-spoke]')).toHaveLength(24);
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(24);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(0);
  });

  it('also works passed as an explicit prop rather than nested JSX', () => {
    const { container } = render(() => <AudioVisualizer variant="bar" children={renderItem} />);
    expect(container.querySelectorAll('[data-custom]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(0);
  });

  it('does not throw and renders the default markup when no children are given', () => {
    // Guards against Solid ever handing `props.children` a non-nullish,
    // non-function default (e.g. an empty string): every variant calls it as
    // `props.children?.(item)`, which only short-circuits on null/undefined
    // -- a falsy-but-defined value would throw "is not a function" here.
    const { container } = render(() => <AudioVisualizer variant="bar" />);
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(0);
  });

  it('does not forward children to a shader variant', async () => {
    let captured: Record<string, unknown> | undefined;
    vi.doMock('./variant-wave', () => ({
      default: (props: Record<string, unknown>) => {
        captured = props;
        return null;
      },
    }));

    render(() => <AudioVisualizer variant="wave">{renderItem}</AudioVisualizer>);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured?.children).toBeUndefined();
  });
});
