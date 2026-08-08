import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import { AudioVisualizer } from './index';

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
  afterEach(() => vi.restoreAllMocks());

  it('falls back to bars permanently and warns once when the shader chunk fails to load', async () => {
    vi.doMock('./variant-wave', () => {
      throw new Error('chunk failed');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = render(() => <AudioVisualizer variant="wave" />);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]?.[0]).toContain('variant="wave"');
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);

    vi.doUnmock('./variant-wave');
  });
});
