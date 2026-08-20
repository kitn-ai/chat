import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { WorkspaceShell, type WorkspaceShellController } from './workspace-shell';

// Written test-first against the Lane B proposal (spec §3a, plan B1): slots
// `start`/`main (children)`/`end`/`header`/`footer`, layout events
// `kai-aside-toggle` / `kai-aside-resize` surfaced through the Solid callbacks
// `onAsideToggle` / `onAsideResize`, aside widths as px props (the facade feeds
// them from CSS custom properties). Every negative assertion is paired with a
// positive one over the same harness (the reactivity-contract.test.tsx rule).
//
// WHAT JSDOM CANNOT DO: geometry. Drag deltas, breakpoint reflow and drawer
// overlay stacking are asserted in the B4 Chromium probes
// (packages/ui/scripts/probe-workspace-shell-*.mjs); here we assert the DOM
// state the browser acts on (which regions exist, data-drawer, focus return)
// and drive the width-reactive paths through a controllable ResizeObserver stub.

// jsdom has no ResizeObserver; install a controllable stub the tests can fire.
type ROCallback = (entries: { contentRect: { width: number } }[]) => void;
const roCallbacks = new Set<ROCallback>();
globalThis.ResizeObserver = class {
  private cb: ROCallback;
  constructor(cb: ROCallback) { this.cb = cb; roCallbacks.add(cb); }
  observe() {}
  unobserve() {}
  disconnect() { roCallbacks.delete(this.cb); }
} as unknown as typeof ResizeObserver;

/** Fire every live ResizeObserver with a fake host width. */
function fireResize(width: number) {
  for (const cb of roCallbacks) cb([{ contentRect: { width } }]);
}

afterEach(() => { cleanup(); roCallbacks.clear(); });

const tick = () => new Promise((r) => setTimeout(r, 0));

const region = (container: HTMLElement, name: string) =>
  container.querySelector(`[part~="${name}"]`) as HTMLElement | null;

describe('regions', () => {
  it('renders projected content into all five regions, each with its part name', () => {
    const { container } = render(() => (
      <WorkspaceShell
        header={<nav data-probe="header">top</nav>}
        start={<ul data-probe="start">rail</ul>}
        end={<aside data-probe="end">notes</aside>}
        footer={<small data-probe="footer">legal</small>}
      >
        <article data-probe="main">the app</article>
      </WorkspaceShell>
    ));
    for (const name of ['header', 'start', 'main', 'end', 'footer']) {
      const wrap = region(container, name);
      expect(wrap, `region ${name}`).toBeTruthy();
      expect(wrap!.querySelector(`[data-probe="${name}"]`), `content in ${name}`).toBeTruthy();
    }
  });

  it('omits a region wrapper when nothing is provided for it (main always renders)', () => {
    const { container } = render(() => (
      <WorkspaceShell><article data-probe="main">solo</article></WorkspaceShell>
    ));
    expect(region(container, 'main')).toBeTruthy();
    for (const name of ['header', 'start', 'end', 'footer']) {
      expect(region(container, name), `no ${name} region`).toBeNull();
    }
  });

  it('is chat-agnostic: arbitrary content (a file tree stand-in) projects fine', () => {
    const { container } = render(() => (
      <WorkspaceShell start={<div role="tree"><div role="treeitem">src/</div></div>}>
        <pre>terminal</pre>
      </WorkspaceShell>
    ));
    expect(container.querySelector('[part~="start"] [role="tree"]')).toBeTruthy();
    expect(container.querySelector('[part~="main"] pre')).toBeTruthy();
  });

  it('reflects compact as a data hook on the root', () => {
    const { container } = render(() => (
      <WorkspaceShell compact><div>m</div></WorkspaceShell>
    ));
    expect(container.querySelector('[data-compact]')).toBeTruthy();
    cleanup();
    const { container: plain } = render(() => (<WorkspaceShell><div>m</div></WorkspaceShell>));
    expect(plain.querySelector('[data-compact]')).toBeNull();
  });
});

describe('collapse: controlled and uncontrolled per aside', () => {
  it('uncontrolled: the controller collapses/expands the start aside and reports it', () => {
    const onAsideToggle = vi.fn();
    let api!: WorkspaceShellController;
    const { container } = render(() => (
      <WorkspaceShell
        start={<div data-probe="rail" />}
        onAsideToggle={onAsideToggle}
        controllerRef={(c) => (api = c)}
      >
        <div>m</div>
      </WorkspaceShell>
    ));
    expect(region(container, 'start')).toBeTruthy();
    api.collapseAside('start');
    expect(region(container, 'start')).toBeNull();
    expect(onAsideToggle).toHaveBeenLastCalledWith({ side: 'start', collapsed: true });
    api.expandAside('start');
    expect(region(container, 'start')).toBeTruthy();
    expect(onAsideToggle).toHaveBeenLastCalledWith({ side: 'start', collapsed: false });
  });

  it('defaultStartCollapsed seeds the uncontrolled state', () => {
    let api!: WorkspaceShellController;
    const { container } = render(() => (
      <WorkspaceShell start={<div />} defaultStartCollapsed controllerRef={(c) => (api = c)}>
        <div>m</div>
      </WorkspaceShell>
    ));
    expect(region(container, 'start')).toBeNull();
    api.toggleAside('start');
    expect(region(container, 'start')).toBeTruthy();
  });

  it('controlled: startCollapsed wins; the controller only reports intent', () => {
    const onAsideToggle = vi.fn();
    const [collapsed, setCollapsed] = createSignal(false);
    let api!: WorkspaceShellController;
    const { container } = render(() => (
      <WorkspaceShell
        start={<div />}
        startCollapsed={collapsed()}
        onAsideToggle={onAsideToggle}
        controllerRef={(c) => (api = c)}
      >
        <div>m</div>
      </WorkspaceShell>
    ));
    api.collapseAside('start');
    // Controlled: the DOM does not move until the app flips its own state...
    expect(region(container, 'start')).toBeTruthy();
    expect(onAsideToggle).toHaveBeenLastCalledWith({ side: 'start', collapsed: true });
    // ...and moves when it does.
    setCollapsed(true);
    expect(region(container, 'start')).toBeNull();
  });

  it('the end aside collapses independently of start', () => {
    let api!: WorkspaceShellController;
    const { container } = render(() => (
      <WorkspaceShell start={<div />} end={<div />} controllerRef={(c) => (api = c)}>
        <div>m</div>
      </WorkspaceShell>
    ));
    api.collapseAside('end');
    expect(region(container, 'end')).toBeNull();
    expect(region(container, 'start')).toBeTruthy();
  });
});

describe('collapse-below-breakpoint', () => {
  it('collapses both uncontrolled asides below the breakpoint and restores above it', async () => {
    const onAsideToggle = vi.fn();
    const { container } = render(() => (
      <WorkspaceShell start={<div />} end={<div />} collapseBelow={700} onAsideToggle={onAsideToggle}>
        <div>m</div>
      </WorkspaceShell>
    ));
    await tick();
    expect(region(container, 'start')).toBeTruthy();
    fireResize(500);
    expect(region(container, 'start')).toBeNull();
    expect(region(container, 'end')).toBeNull();
    expect(onAsideToggle).toHaveBeenCalledWith({ side: 'start', collapsed: true });
    expect(onAsideToggle).toHaveBeenCalledWith({ side: 'end', collapsed: true });
    fireResize(900);
    expect(region(container, 'start')).toBeTruthy();
    expect(region(container, 'end')).toBeTruthy();
  });

  it('never fights a controlled aside (no DOM move, and no toggle emitted at all)', async () => {
    const onAsideToggle = vi.fn();
    const { container } = render(() => (
      <WorkspaceShell start={<div />} startCollapsed={false} collapseBelow={700} onAsideToggle={onAsideToggle}>
        <div>m</div>
      </WorkspaceShell>
    ));
    await tick();
    fireResize(500);
    expect(region(container, 'start')).toBeTruthy();
    // The DOM staying put is not enough (a controlled prop masks an internal
    // write); the breakpoint must not even REPORT a collapse it has no say over.
    expect(onAsideToggle).not.toHaveBeenCalled();
  });
});

describe('resize handles', () => {
  it('renders a separator handle beside each present aside, and none when collapsed', () => {
    let api!: WorkspaceShellController;
    const { container } = render(() => (
      <WorkspaceShell start={<div />} end={<div />} controllerRef={(c) => (api = c)}>
        <div>m</div>
      </WorkspaceShell>
    ));
    expect(container.querySelectorAll('[role="separator"]').length).toBe(2);
    api.collapseAside('start');
    expect(container.querySelectorAll('[role="separator"]').length).toBe(1);
    api.collapseAside('end');
    expect(container.querySelectorAll('[role="separator"]').length).toBe(0);
  });

  it('renders no handle for an absent aside', () => {
    const { container } = render(() => (
      <WorkspaceShell><div>m</div></WorkspaceShell>
    ));
    expect(container.querySelectorAll('[role="separator"]').length).toBe(0);
  });
});

describe('mobile drawer', () => {
  it('below drawerBelow an expanded aside renders as a drawer overlay', async () => {
    let api!: WorkspaceShellController;
    const { container } = render(() => (
      <WorkspaceShell start={<div data-probe="rail" />} defaultStartCollapsed drawerBelow={640} controllerRef={(c) => (api = c)}>
        <div>m</div>
      </WorkspaceShell>
    ));
    await tick();
    fireResize(480);
    api.expandAside('start');
    const drawer = region(container, 'start');
    expect(drawer).toBeTruthy();
    expect(drawer!.closest('[data-drawer]') ?? drawer!.hasAttribute('data-drawer') ? drawer : null).toBeTruthy();
    // Paired positive: at desktop width the same harness renders no drawer marker.
    fireResize(900);
    const desk = region(container, 'start');
    expect(desk).toBeTruthy();
    expect(container.querySelector('[data-drawer]')).toBeNull();
  });

  it('Escape inside the drawer closes it and returns focus to the opener', async () => {
    let api!: WorkspaceShellController;
    const { container } = render(() => (
      <WorkspaceShell
        start={<button data-probe="in-rail">rail button</button>}
        defaultStartCollapsed
        drawerBelow={640}
        controllerRef={(c) => (api = c)}
      >
        <button data-probe="opener">open rail</button>
      </WorkspaceShell>
    ));
    await tick();
    fireResize(480);
    const opener = container.querySelector('[data-probe="opener"]') as HTMLButtonElement;
    opener.focus();
    api.expandAside('start');
    await tick();
    const inRail = container.querySelector('[data-probe="in-rail"]') as HTMLButtonElement;
    inRail.focus();
    inRail.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(region(container, 'start')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Escape outside the drawer is left alone (the drawer stays open)', async () => {
    let api!: WorkspaceShellController;
    const { container } = render(() => (
      <WorkspaceShell start={<div data-probe="rail" />} defaultStartCollapsed drawerBelow={640} controllerRef={(c) => (api = c)}>
        <button data-probe="main-btn">main</button>
      </WorkspaceShell>
    ));
    await tick();
    fireResize(480);
    api.expandAside('start');
    const mainBtn = container.querySelector('[data-probe="main-btn"]') as HTMLButtonElement;
    mainBtn.focus();
    mainBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(region(container, 'start')).toBeTruthy();
  });
});
