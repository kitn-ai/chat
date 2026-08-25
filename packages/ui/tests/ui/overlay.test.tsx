import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import { createSignal, flush as flushSync } from 'solid-js';
import { createPresence, As, useDismiss, usePosition } from '../../src/ui/overlay';

// jsdom (v24) does not implement the PointerEvent constructor. useDismiss
// listens for `pointerdown`, so the outside-dismiss test dispatches one. Real
// browsers implement PointerEvent, so this is a jsdom-only shim. We extend
// MouseEvent so .target / bubbling behave like a real pointer event.
if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params?: PointerEventInit) {
      super(type, params);
    }
  };
}

describe('createPresence', () => {
  it('is present immediately when shown', () => {
    let present!: () => boolean;
    render(() => {
      const [show] = createSignal(true);
      const p = createPresence(show);
      present = p.present;
      return <div ref={p.setRef} />;
    });
    expect(present()).toBe(true);
  });

  it('unmounts immediately on hide when no animation is defined (jsdom)', async () => {
    const [show, setShow] = createSignal(true);
    let present!: () => boolean;
    render(() => {
      const p = createPresence(show);
      present = p.present;
      return <div ref={p.setRef} />;
    });
    expect(present()).toBe(true);
    setShow(false);
    flushSync(); // V2-FLUSH: commit the staged hide so the close effect queues its microtask
    await Promise.resolve();
    flushSync(); // V2-FLUSH: the microtask's setPresent write is itself staged
    expect(present()).toBe(false);
  });

  it('exposes state open/closed reflecting show', async () => {
    const [show, setShow] = createSignal(true);
    let state!: () => 'open' | 'closed';
    render(() => {
      const p = createPresence(show);
      state = p.state;
      return <div ref={p.setRef} />;
    });
    expect(state()).toBe('open');
    setShow(false);
    flushSync(); // V2-FLUSH: commit the staged write
    await Promise.resolve();
    expect(state()).toBe('closed');
  });

  it('does not unmount when re-opened before the microtask drains (reduced-motion safety)', async () => {
    const [show, setShow] = createSignal(true);
    let present!: () => boolean;
    render(() => {
      const p = createPresence(show);
      present = p.present;
      return <div ref={p.setRef} />;
    });
    setShow(false);
    flushSync(); // V2-FLUSH: commit the staged write
    setShow(true); // re-open synchronously before microtask
    flushSync(); // V2-FLUSH: commit the staged write
    await Promise.resolve();
    await Promise.resolve();
    expect(present()).toBe(true);
  });
});

describe('usePosition', () => {
  it('returns pos/arrowPos signals and tolerates undefined refs', () => {
    let result!: ReturnType<typeof usePosition>;
    render(() => {
      const [ref] = createSignal<HTMLElement | undefined>(undefined);
      const [float] = createSignal<HTMLElement | undefined>(undefined);
      result = usePosition(ref, float, { placement: 'top', gutter: 6 });
      return null;
    });
    expect(typeof result.pos).toBe('function');
    expect(result.pos()).toHaveProperty('x');
    expect(result.pos()).toHaveProperty('y');
    expect(typeof result.arrowPos).toBe('function');
  });
});

describe('usePosition onDisconnect', () => {
  // MutationObserver callbacks are scheduled async; flush a macrotask.
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('fires once when the reference leaves the document', async () => {
    const refEl = document.createElement('div');
    const floatEl = document.createElement('div');
    document.body.append(refEl, floatEl);
    let calls = 0;
    render(() => {
      const [r] = createSignal<HTMLElement | undefined>(refEl);
      const [f] = createSignal<HTMLElement | undefined>(floatEl);
      usePosition(r, f, { onDisconnect: () => { calls++; } });
      return null;
    });
    refEl.remove();
    await flush();
    expect(calls).toBe(1);
    // Re-mutating the document must not re-fire (one-shot).
    document.body.append(document.createElement('div'));
    await flush();
    expect(calls).toBe(1);
    floatEl.remove();
  });

  it('fires once when an ancestor of the reference becomes inert', async () => {
    // Mirrors the DOM-removal case for the modal/takeover pattern: a kai-screen
    // inert-s its host's siblings while open, so the anchor stays in the DOM but
    // gains an `inert` ancestor. The overlay must still close.
    const wrapper = document.createElement('div');
    const refEl = document.createElement('div');
    const floatEl = document.createElement('div');
    wrapper.append(refEl);
    document.body.append(wrapper, floatEl);
    let calls = 0;
    render(() => {
      const [r] = createSignal<HTMLElement | undefined>(refEl);
      const [f] = createSignal<HTMLElement | undefined>(floatEl);
      usePosition(r, f, { onDisconnect: () => { calls++; } });
      return null;
    });
    wrapper.setAttribute('inert', '');
    await flush();
    expect(calls).toBe(1);
    // A further inert toggle elsewhere must not re-fire (one-shot).
    const other = document.createElement('div');
    document.body.append(other);
    other.setAttribute('inert', '');
    await flush();
    expect(calls).toBe(1);
    wrapper.remove();
    floatEl.remove();
    other.remove();
  });

  it('fires when an inert ancestor sits across a shadow boundary from the anchor', async () => {
    // The REAL shape that the light-DOM-only test missed: kai-coachmark anchors
    // usePosition to a span INSIDE its own shadow root, while kai-screen sets
    // `inert` on a LIGHT-DOM ancestor of the coachmark host. closest() halts at
    // the shadow root, so the predicate must climb across the boundary via the
    // host. Here: wrapper > host (shadowRoot > refEl); wrapper gains inert.
    const wrapper = document.createElement('div');
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const refEl = document.createElement('div');
    root.append(refEl);
    wrapper.append(host);
    const floatEl = document.createElement('div');
    document.body.append(wrapper, floatEl);
    let calls = 0;
    render(() => {
      const [r] = createSignal<HTMLElement | undefined>(refEl);
      const [f] = createSignal<HTMLElement | undefined>(floatEl);
      usePosition(r, f, { onDisconnect: () => { calls++; } });
      return null;
    });
    wrapper.setAttribute('inert', '');
    await flush();
    expect(calls).toBe(1);
    wrapper.remove();
    floatEl.remove();
  });

  it('does not fire while the reference stays connected', async () => {
    const refEl = document.createElement('div');
    const floatEl = document.createElement('div');
    document.body.append(refEl, floatEl);
    let calls = 0;
    render(() => {
      const [r] = createSignal<HTMLElement | undefined>(refEl);
      const [f] = createSignal<HTMLElement | undefined>(floatEl);
      usePosition(r, f, { onDisconnect: () => { calls++; } });
      return null;
    });
    // Unrelated DOM churn with the anchor still attached.
    const sibling = document.createElement('div');
    document.body.append(sibling);
    sibling.remove();
    await flush();
    expect(calls).toBe(0);
    refEl.remove();
    floatEl.remove();
  });
});

describe('As', () => {
  it('renders the string tag with forwarded props', () => {
    render(() => (
      <As as="button" data-testid="t" type="button" aria-expanded="false">hi</As>
    ));
    const el = screen.getByTestId('t');
    expect(el.tagName).toBe('BUTTON');
    expect(el.getAttribute('aria-expanded')).toBe('false');
  });

  it('passes forwarded props to a render-function `as`', () => {
    let received: any;
    render(() => (
      <As as={(p: any) => { received = p; return <span data-testid="r" {...p} />; }} data-x="1" />
    ));
    expect(received['data-x']).toBe('1');
    expect(screen.getByTestId('r').getAttribute('data-x')).toBe('1');
  });
});

describe('useDismiss', () => {
  it('calls onDismiss on Escape keydown', () => {
    let dismissed = 0;
    render(() => {
      const [open] = createSignal(true);
      useDismiss({ enabled: open, onDismiss: () => { dismissed++; }, refs: () => [] });
      return null;
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(dismissed).toBe(1);
  });

  it('calls onDismiss on pointerdown outside the provided refs', () => {
    const inside = document.createElement('div');
    document.body.appendChild(inside);
    let dismissed = 0;
    render(() => {
      const [open] = createSignal(true);
      useDismiss({ enabled: open, onDismiss: () => { dismissed++; }, refs: () => [inside] });
      return null;
    });
    inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(dismissed).toBe(0);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(dismissed).toBe(1);
    inside.remove();
  });
});
