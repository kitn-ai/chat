import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { WorkSurface, WORK_SURFACE_DEVICE_WIDTHS } from './work-surface';

afterEach(cleanup);

describe('WorkSurface — promoted from builder-workspace.stories.tsx', () => {
  it('renders every toolbar affordance the story ships, when all are enabled', () => {
    render(() => (
      <WorkSurface
        src="/work-surface.html"
        showDeviceToggle
        showUrlBar
        showOpenInNewTab
        showExpand
        showCodeView
        code={<pre>source</pre>}
      />
    ));
    expect(screen.getByRole('group', { name: 'Pane device' })).toBeInTheDocument();
    expect(screen.getByLabelText('Desktop')).toBeInTheDocument();
    expect(screen.getByLabelText('Tablet')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile')).toBeInTheDocument();
    expect(screen.getByLabelText('Open in new tab')).toBeInTheDocument();
    expect(screen.getByLabelText('Expand work pane')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pane kind' })).toBeInTheDocument();
  });

  it('showCodeView={false} REMOVES the Preview|Code toggle entirely — not a disabled control (the story\'s own rule)', () => {
    render(() => <WorkSurface src="/x.html" showCodeView={false} code={<pre>source</pre>} />);
    expect(screen.queryByRole('group', { name: 'Pane kind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Code' })).not.toBeInTheDocument();
  });

  it('the device toggle scales the PREVIEW canvas only, never the Code view (Lovable\'s own rule)', () => {
    const { container } = render(() => (
      <WorkSurface src="/x.html" showDeviceToggle showCodeView code={<pre>source</pre>} />
    ));
    fireEvent.click(screen.getByLabelText('Mobile'));
    const canvas = container.querySelector('[data-kai-work-surface-canvas]') as HTMLElement;
    expect(canvas.style.maxWidth).toBe(WORK_SURFACE_DEVICE_WIDTHS.mobile);
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(container.querySelector('[data-kai-work-surface-canvas]')).toBeNull();
  });

  it('the tab is controllable and reports changes', () => {
    const onTabChange = vi.fn();
    render(() => (
      <WorkSurface src="/x.html" showCodeView tab="preview" onTabChange={onTabChange} code={<pre>source</pre>} />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(onTabChange).toHaveBeenCalledWith('code');
  });

  it('expand is CONTROLLED — it reports, it does not self-toggle (codegen drives WorkspaceShell.startCollapsed)', () => {
    const [expanded, setExpanded] = createSignal(false);
    const onExpandedChange = vi.fn((v: boolean) => setExpanded(v));
    render(() => (
      <WorkSurface src="/x.html" showExpand expanded={expanded()} onExpandedChange={onExpandedChange} />
    ));
    fireEvent.click(screen.getByLabelText('Expand work pane'));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText('Restore split')).toHaveAttribute('aria-pressed', 'true');
  });

  it('the URL bar shows urlLabel when given, and the src otherwise — read-only either way', () => {
    render(() => <WorkSurface src="/work-surface.html" showUrlBar urlLabel="preview--build-workspace.kitn.app" />);
    expect(screen.getByText('preview--build-workspace.kitn.app')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('open-in-new-tab is WIRED — the story\'s button had no onClick, which is a dead affordance', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(() => <WorkSurface src="/work-surface.html" showOpenInNewTab />);
    fireEvent.click(screen.getByLabelText('Open in new tab'));
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it('showOpenInNewTab with NO src renders no button at all — an affordance with nothing behind it is not an affordance', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(() => (
      <WorkSurface preview={<div>stub</div>} showOpenInNewTab showDeviceToggle />
    ));
    // Paired against a vacuous pass: the toolbar really did render, and the
    // device toggle asked for alongside it IS there — the one button with no
    // document behind it is the only thing missing.
    expect(container.querySelector('[data-kai-work-surface-toolbar]')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pane device' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Open in new tab')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('the same flag WITH a src renders it and wires it — the update case the stale case is paired against', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(() => <WorkSurface src="/work-surface.html" preview={<div>stub</div>} showOpenInNewTab showUrlBar />);
    expect(screen.getByLabelText('Open in new tab')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Open in new tab'));
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it('renders `preview` content instead of an iframe when no src is given (the story\'s stub path)', () => {
    const { container } = render(() => <WorkSurface preview={<div data-stub>stub</div>} />);
    expect(container.querySelector('[data-stub]')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('frames src through the kit\'s own Artifact — one sandbox policy, not a second one', () => {
    const { container } = render(() => <WorkSurface src="/work-surface.html" />);
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  });

  // ── the Code tab's graceful empty state (owner ruling, 2026-08-30) ────────
  //
  // `chrome.codeView: true` with no `codeUrl` is now a VALID construct: the
  // toggle has to be reachable out of the box, and the tab says honestly that
  // nothing is pointed at it yet rather than erroring at authoring time or
  // framing a missing page.
  describe('the Code tab with no source', () => {
    it('renders a graceful empty state — not a blank pane, not an error, not a 404', () => {
      const { container } = render(() => <WorkSurface src="/x.html" showCodeView defaultTab="code" />);
      const empty = container.querySelector('[data-kai-work-surface-code-empty]');
      expect(empty).toBeInTheDocument();
      // It has to say what the tab reads and name the key that fills it —
      // an empty state that explains nothing is just a blank pane with a border.
      expect(empty!.textContent).toContain('workSurface.codeUrl');
      // And it must not be a broken frame: no iframe on this branch at all.
      expect(container.querySelector('iframe')).toBeNull();
    });

    it('the Preview tab is unaffected — the empty state belongs to the Code branch only', () => {
      const { container } = render(() => <WorkSurface src="/x.html" showCodeView />);
      expect(container.querySelector('[data-kai-work-surface-code-empty]')).toBeNull();
      expect(container.querySelector('iframe')).toBeInTheDocument();
    });

    it('`code` content WINS over the empty state — the story\'s stub path is untouched', () => {
      const { container } = render(() => (
        <WorkSurface src="/x.html" showCodeView defaultTab="code" code={<pre data-stub>source</pre>} />
      ));
      expect(container.querySelector('[data-stub]')).toBeInTheDocument();
      expect(container.querySelector('[data-kai-work-surface-code-empty]')).toBeNull();
    });

    it('`codeSrc` WINS over the empty state — the emitted app\'s path is untouched', () => {
      const { container } = render(() => (
        <WorkSurface src="/x.html" showCodeView defaultTab="code" codeSrc="/src.html" />
      ));
      expect(container.querySelector('iframe')).toBeInTheDocument();
      expect(container.querySelector('[data-kai-work-surface-code-empty]')).toBeNull();
    });
  });
});
