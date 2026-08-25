import { flush } from 'solid-js';
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, clampBasis } from '../ui/resizable';

// NOTE on file location: the task brief names `src/components/resizable.tsx`, but
// in this tree the resizable UI primitives live in `src/ui/resizable.tsx` and the
// custom element in `src/elements/resizable.tsx`. This test (kept at the requested
// `src/components/` path) exercises both the UI primitive (`ResizableHandle`
// dblclick-reset + default-size reflection) and the element (`<kai-resizable>`
// size-preservation across content-only re-renders).

// jsdom doesn't implement layout: getBoundingClientRect returns all-zeros, so the
// pixel-driven DRAG math (pointer move → flex-basis) and the live-percent settle
// are NOT meaningfully testable here. We test the *state logic* that is layout-
// independent: (a) the panel reflects its default size to a data-* attribute, and
// (b) dblclick on a handle restores adjacent panels' flex-basis from those
// defaults, even after their inline basis has been mutated (simulating a drag).
// The element test asserts that a content-only mutation does NOT clobber a panel's
// dragged inline flex-basis.

afterEach(cleanup);

describe('ResizablePanel default-size reflection', () => {
  it('reflects defaultSize to data-default-size-pct (percent) so a handle can reset to it', () => {
    const { container } = render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={30}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const panels = container.querySelectorAll('[style*="flex-basis"]');
    const first = panels[0] as HTMLElement;
    expect(first.dataset.defaultSizePct).toBe('30');
  });

  it('reflects a px defaultSize to data-default-size (pixels)', () => {
    const { container } = render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize="280px">a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const first = container.querySelector('[data-default-size]') as HTMLElement;
    expect(first?.dataset.defaultSize).toBe('280');
  });
});

describe('clampBasis — initial-size clamp helper', () => {
  it('wraps a default in clamp() when both min and max are present', () => {
    expect(clampBasis('40%', '360px', '480px')).toBe('clamp(360px, 40%, 480px)');
  });
  it('caps with min() when only a max is present (the v0 snap-to-max case)', () => {
    expect(clampBasis('40%', undefined, '480px')).toBe('min(40%, 480px)');
  });
  it('floors with max() when only a min is present', () => {
    expect(clampBasis('40%', '360px', undefined)).toBe('max(360px, 40%)');
  });
  it('passes the basis through untouched when there are no bounds', () => {
    expect(clampBasis('40%', undefined, undefined)).toBe('40%');
  });
  it('stays undefined (flexible) when there is no default', () => {
    expect(clampBasis(undefined, '360px', '480px')).toBeUndefined();
  });
});

describe('ResizablePanel clamps its INITIAL flex-basis into [min, max]', () => {
  it('caps a percent default against a px max so it cannot paint past max (v0 chat pane)', () => {
    const { container } = render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize="40%" minSize="360px" maxSize="480px">a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const first = container.querySelector('[style*="flex-basis"]') as HTMLElement;
    // The basis is a CSS clamp() so the live container width can never push it past max.
    expect(first.style.flexBasis).toBe('clamp(360px, 40%, 480px)');
  });

  it('reads min/max from data-* attributes too (the kai-workspace rail path)', () => {
    const { container } = render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={26} data-min-size="240" data-max-size="420">a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const first = container.querySelector('[style*="flex-basis"]') as HTMLElement;
    expect(first.style.flexBasis).toBe('clamp(240px, 26%, 420px)');
  });

  it('leaves a bounded panel with no default flexible (no spurious basis)', () => {
    const { container } = render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel minSize="360px" maxSize="480px">a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    // No defaultSize → flexible (`flex: 1 1 0%`), never a clamp()/min()/max() basis.
    const first = container.firstChild?.firstChild as HTMLElement;
    expect(first.style.flexBasis).not.toMatch(/clamp|min|max/);
    expect(first.style.flexGrow).toBe('1');
  });
});

describe('ResizableHandle dblclick resets adjacent panels to defaults', () => {
  it('restores both adjacent panels flex-basis from their default sizes on dblclick', () => {
    const { container } = render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={30}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={70}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const handle = container.querySelector('[role="separator"]') as HTMLElement;
    const prev = handle.previousElementSibling as HTMLElement;
    const next = handle.nextElementSibling as HTMLElement;

    // Simulate the result of a drag: panels carry pixel flex-basis inline.
    prev.style.flexBasis = '120px';
    next.style.flexBasis = '480px';

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(prev.style.flexBasis).toBe('30%');
    expect(next.style.flexBasis).toBe('70%');
  });

  it('resets a panel that has no explicit default back to flexible (clears inline basis)', () => {
    const { container } = render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={30}>a</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const handle = container.querySelector('[role="separator"]') as HTMLElement;
    const prev = handle.previousElementSibling as HTMLElement;
    const next = handle.nextElementSibling as HTMLElement;

    prev.style.flexBasis = '120px';
    next.style.flexBasis = '480px';
    next.style.flexGrow = '0';
    next.style.flexShrink = '0';

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(prev.style.flexBasis).toBe('30%');
    // The flexible panel (no default) returns to growing: basis cleared, grow:1.
    expect(next.style.flexBasis).toBe('');
    expect(next.style.flexGrow).toBe('1');
  });

  it('does nothing on a static (locked) handle', () => {
    const { container } = render(() => (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={30}>a</ResizablePanel>
        <ResizableHandle static />
        <ResizablePanel defaultSize={70}>b</ResizablePanel>
      </ResizablePanelGroup>
    ));
    const handle = container.querySelector('[role="separator"]') as HTMLElement;
    const prev = handle.previousElementSibling as HTMLElement;
    prev.style.flexBasis = '120px';

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(prev.style.flexBasis).toBe('120px');
  });
});

describe('<kai-resizable> size preservation across content-only re-renders', () => {
  beforeAll(async () => {
    // Importing registers the custom element. jsdom supports customElements.
    await import('../elements/resizable');
  });

  function mount(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not clobber a dragged panel flex-basis when an item child re-renders content', async () => {
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:600px">
        <kai-resizable-item size="30%"><p id="content">hi</p></kai-resizable-item>
        <kai-resizable-item><p>right</p></kai-resizable-item>
      </kai-resizable>
    `);
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    // Let solid-element upgrade + onMount run.
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));

    const panel = el.shadowRoot.querySelector('[data-panel]') as HTMLElement;
    expect(panel).toBeTruthy();

    // Simulate a settled drag: the handle writes inline flex-basis on the panel.
    panel.style.flexBasis = '55%';

    // Now mutate ONLY the slotted content of an existing item (no add/remove).
    const content = host.querySelector('#content') as HTMLElement;
    content.textContent = 'a new chat message arrived';

    // Allow the MutationObserver microtask + any re-render to flush.
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));

    const panelAfter = el.shadowRoot.querySelector('[data-panel]') as HTMLElement;
    // The dragged basis must survive (the bug reset it to "30%").
    expect(panelAfter.style.flexBasis).toBe('55%');
  });

  it('reflects each item default size onto its panel for handle dblclick-reset', async () => {
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:600px">
        <kai-resizable-item size="30%"><p>a</p></kai-resizable-item>
        <kai-resizable-item><p>b</p></kai-resizable-item>
      </kai-resizable>
    `);
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));

    const panels = el.shadowRoot.querySelectorAll('[data-panel]');
    expect((panels[0] as HTMLElement).dataset.defaultSizePct).toBe('30');
    // Second panel has no explicit default → no reflected default size.
    expect((panels[1] as HTMLElement).dataset.defaultSizePct).toBeUndefined();
  });

  it('keeps the ORIGINAL default for dblclick-reset even after sizes are persisted', async () => {
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:600px">
        <kai-resizable-item size="30%"><p>a</p></kai-resizable-item>
        <kai-resizable-item size="70%"><p>b</p></kai-resizable-item>
      </kai-resizable>
    `);
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));

    // Simulate persistence overwriting the live `size` attribute after a drag.
    const item = host.querySelector('kai-resizable-item') as HTMLElement;
    item.setAttribute('size', '55%');
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));

    const panel = el.shadowRoot.querySelector('[data-panel]') as HTMLElement;
    // The reflected DEFAULT (for dblclick-reset) stays the original 30, not 55.
    expect(panel.dataset.defaultSizePct).toBe('30');
  });

  it('collapses a panel at mount when the item carries the `collapsed` attribute', async () => {
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:600px">
        <kai-resizable-item size="28%" collapsed><p>list</p></kai-resizable-item>
        <kai-resizable-item><p>chat</p></kai-resizable-item>
      </kai-resizable>
    `);
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));
    // The collapsed item is dropped from layout → only the chat panel renders.
    expect(el.shadowRoot.querySelectorAll('[data-panel]').length).toBe(1);
  });

  it('collapses at mount when `collapsed` is set as a PROPERTY (the framework-JSX bug repro)', async () => {
    // Frameworks set the IDL property (or a bare boolean that resolves to it), NOT
    // the attribute — the exact path that left `hidden` broken. The facade must
    // reflect the property to the attribute the parent reads so it collapses at mount.
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:600px">
        <kai-resizable-item size="28%"><p>list</p></kai-resizable-item>
        <kai-resizable-item><p>chat</p></kai-resizable-item>
      </kai-resizable>
    `);
    const item = host.querySelector('kai-resizable-item') as HTMLElement & { collapsed?: boolean };
    item.collapsed = true; // property, set before the element fully settles
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));
    // The facade reflected `collapsed` → attribute; the parent dropped the panel.
    expect(item.hasAttribute('collapsed')).toBe(true);
    expect(el.shadowRoot.querySelectorAll('[data-panel]').length).toBe(1);
  });

  it('expands the panel when `collapsed` is cleared', async () => {
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:600px">
        <kai-resizable-item size="28%" collapsed><p>list</p></kai-resizable-item>
        <kai-resizable-item><p>chat</p></kai-resizable-item>
      </kai-resizable>
    `);
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    const item = host.querySelector('kai-resizable-item') as HTMLElement & { collapsed?: boolean };
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));
    expect(el.shadowRoot.querySelectorAll('[data-panel]').length).toBe(1);

    item.collapsed = false; // clearing the prop re-expands and reflects the attr off
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));
    expect(item.hasAttribute('collapsed')).toBe(false);
    expect(el.shadowRoot.querySelectorAll('[data-panel]').length).toBe(2);
  });

  it('leaves the imperative `hidden` attribute path working (back-compat)', async () => {
    // The pre-existing supported path: drive the `hidden` attribute AFTER mount
    // (e.g. the `Show / hide a panel` story). `collapsed` is the new declarative
    // path; the facade must NOT touch `hidden`, so this keeps working unchanged.
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:600px">
        <kai-resizable-item size="28%"><p>list</p></kai-resizable-item>
        <kai-resizable-item><p>chat</p></kai-resizable-item>
      </kai-resizable>
    `);
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    const item = host.querySelector('kai-resizable-item') as HTMLElement;
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));
    expect(el.shadowRoot.querySelectorAll('[data-panel]').length).toBe(2);

    item.setAttribute('hidden', '');
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));
    // The `hidden` attribute still collapses; the facade owns only `collapsed`.
    expect(el.shadowRoot.querySelectorAll('[data-panel]').length).toBe(1);
    expect(item.hasAttribute('collapsed')).toBe(false);
  });

  it('clamps a percent item size against a px max on its panel basis (v0 snap-to-max fix)', async () => {
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:1600px">
        <kai-resizable-item size="40%" min="360px" max="480px"><p>chat</p></kai-resizable-item>
        <kai-resizable-item><p>preview</p></kai-resizable-item>
      </kai-resizable>
    `);
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));

    const panel = el.shadowRoot.querySelector('[data-panel]') as HTMLElement;
    // Initial basis is clamped — at a wide container, 40% resolves past 480px,
    // so the CSS clamp caps it; without the fix it painted 40% then snapped.
    expect(panel.style.flexBasis).toBe('clamp(360px, 40%, 480px)');
  });

  it('still re-initializes when an item is actually added', async () => {
    const host = mount(`
      <kai-resizable orientation="horizontal" style="height:300px;width:600px">
        <kai-resizable-item size="30%"><p>a</p></kai-resizable-item>
        <kai-resizable-item><p>b</p></kai-resizable-item>
      </kai-resizable>
    `);
    const el = host.querySelector('kai-resizable') as HTMLElement & { shadowRoot: ShadowRoot };
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));

    expect(el.shadowRoot.querySelectorAll('[data-panel]').length).toBe(2);

    const item = document.createElement('kai-resizable-item');
    item.innerHTML = '<p>c</p>';
    el.appendChild(item);

    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 0));

    expect(el.shadowRoot.querySelectorAll('[data-panel]').length).toBe(3);
  });
});
