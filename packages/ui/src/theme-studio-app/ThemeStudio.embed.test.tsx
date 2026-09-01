/**
 * The studio's half of the builder handshake (rail embed, `?embed=1`):
 *
 *  1. kai-theme-init SEEDS the controls — including from the canonical flat
 *     ThemePayload the builder now posts, and tolerantly from the construct
 *     file's nested `tokens` shape (the mismatch that shipped: a saved theme
 *     seeded nothing and the studio opened on kit defaults).
 *  2. WRITE-FREE OPEN: seeding must post NO kai-theme-change — the host
 *     debounce-writes every change frame to disk, so a seed echo overwrote
 *     the construct's saved theme with a full palette of zero edits. Only a
 *     real user edit opens the stream.
 *
 * jsdom has no canvas 2d context, so non-hex kit defaults resolve to #000000
 * in here — irrelevant: the assertions ride on hex OVERRIDES, which pass
 * through cssToHex untouched. The rail renders no showroom (loadKit is never
 * called), which is what makes the studio mountable in jsdom at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@solidjs/testing-library';
import ThemeStudio from './ThemeStudio';

const ORIGIN = window.location.origin;

/** Deliver a host frame exactly as the browser would: a same-origin
 *  MessageEvent on window (the studio's listener attaches on mount). */
const postInit = (theme: unknown): void => {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'kai-theme-init', theme }, origin: ORIGIN }));
};

/** kai-theme-change frames the studio posted to its host (window.parent ===
 *  window in jsdom, so the spy on window.postMessage sees them all). */
const changeFrames = (spy: ReturnType<typeof vi.spyOn>): unknown[] =>
  spy.mock.calls.map((c: unknown[]) => c[0]).filter((d: unknown) => (d as { type?: string })?.type === 'kai-theme-change');

const primaryInput = (): HTMLInputElement => screen.getByLabelText('Primary') as HTMLInputElement;

describe('theme studio — rail embed handshake (kai-theme-init seeding + write-free open)', () => {
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.pushState({}, '', '/?embed=1'); // isRail() + isEmbedded() both key off the flag
    postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    postSpy.mockRestore();
    window.history.pushState({}, '', '/');
  });

  it('seeds from the canonical FLAT ThemePayload — the saved primary shows in the control, not the kit default', async () => {
    render(() => <ThemeStudio />);
    postInit({ light: { '--kai-color-primary': '#123456' }, dark: {}, radius: '1rem' });
    await waitFor(() => expect(primaryInput().value).toBe('#123456'));
  });

  it('tolerates the construct file\'s NESTED tokens shape (and a bare accent) rather than silently seeding kit defaults', async () => {
    render(() => <ThemeStudio />);
    postInit({ mode: 'system', accent: '#112233', tokens: { light: { '--kai-color-primary': '#123456' } } });
    await waitFor(() => expect(primaryInput().value).toBe('#123456')); // tokens win
    cleanup();
    render(() => <ThemeStudio />);
    postInit({ mode: 'system', accent: '#abcdef' }); // no tokens yet — accent folds into primary
    await waitFor(() => expect(primaryInput().value).toBe('#abcdef'));
  });

  it('OPENING POSTS NOTHING: no kai-theme-change on mount or on seeding — only a real edit opens the stream', async () => {
    render(() => <ThemeStudio />);
    postInit({ light: { '--kai-color-primary': '#123456' }, dark: {} });
    await waitFor(() => expect(primaryInput().value).toBe('#123456'));
    await new Promise((r) => setTimeout(r, 50)); // let any effect run settle
    expect(changeFrames(postSpy)).toHaveLength(0);

    // The first REAL edit posts, carrying the edit over the seeded state.
    fireEvent.input(primaryInput(), { target: { value: '#ff0000' } });
    await waitFor(() => expect(changeFrames(postSpy).length).toBeGreaterThan(0));
    const frame = changeFrames(postSpy).at(-1) as { light: Record<string, string> };
    expect(frame.light['--kai-color-primary']).toBe('#ff0000');
  });

  it('a rail that never receives init streams nothing at all (its side of the contract)', async () => {
    render(() => <ThemeStudio />);
    fireEvent.input(primaryInput(), { target: { value: '#ff0000' } }); // even an edit holds until seeded
    await new Promise((r) => setTimeout(r, 50));
    expect(changeFrames(postSpy)).toHaveLength(0);
  });
});
