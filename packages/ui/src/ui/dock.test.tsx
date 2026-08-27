/**
 * DockLauncherImage — graceful degradation for a construct-authored branded
 * launcher icon (owner finding, 2026-08-26: `kai dev`'s own `owner-widget`
 * fixture pinned `launcherIcon: "https://example.com/logo.png"`, a
 * placeholder that never resolves, so the live FAB rendered a permanently
 * broken image the whole time). Everything else in `ui/dock.tsx` (the `Dock`
 * component itself) is covered end to end through the `kai-dock` element
 * facade in `tests/elements/dock.test.tsx`; this is the one piece with no
 * facade equivalent, since `DockLauncherImage` is a plain Solid helper the
 * construct engine's codegen composes into `Dock`'s `launcher` prop
 * (`emitDockLauncher`, codegen.ts) rather than a web component of its own.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { DockLauncherImage } from './dock';

afterEach(cleanup);

describe('DockLauncherImage', () => {
  it('renders the <img> with the given src while it has not failed', () => {
    const { container } = render(() => <DockLauncherImage src="https://example.com/logo.png" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png');
    expect(container.querySelector('svg')).toBeNull(); // no fallback glyph yet
  });

  it('an error event on the <img> swaps it for the default DockLauncherGlyph — no broken image left behind', () => {
    const { container } = render(() => <DockLauncherImage src="https://example.com/logo.png" />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy(); // DockLauncherGlyph
  });

  it('decides loudly: the error path warns once, naming the failing URL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(() => <DockLauncherImage src="https://example.com/dead.png" />);
    fireEvent.error(container.querySelector('img')!);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('https://example.com/dead.png');
    warn.mockRestore();
  });

  it('alt defaults to empty (the launcher BUTTON carries the accessible name, not the icon)', () => {
    const { container } = render(() => <DockLauncherImage src="https://example.com/logo.png" />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });
});
