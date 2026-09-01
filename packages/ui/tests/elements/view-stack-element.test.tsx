/**
 * `<kai-view-stack>` + `<kai-view>` — element-seam behavior a consumer hits:
 * light-DOM `<kai-view>` discovery, the imperative methods on the host, the
 * `kai-view-change` detail, and the attribute reflection loop (`view` is
 * reflected as navigation happens AND drives navigation when written).
 *
 * Exists because the first block build found a bug the Solid-layer suite
 * (src/components/view-stack.test.tsx) could not see: on the bare element,
 * `selectTab('messages'); push('chat'); back()` landed on the DEFAULT root
 * ('home') instead of the root the drill was entered from ('messages').
 *
 * CONVENTIONS (tab-bar-element.test.tsx / pane-grid-element.test.tsx):
 * assertions run against the real custom elements; a macrotask flush covers
 * upgrade + MutationObserver delivery.
 */
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/view-stack';
import '../../src/elements/view';
import type { ViewStackState } from '../../src/components/view-stack';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type ViewStackEl = HTMLElement & {
  view?: string;
  drilled?: boolean;
  push: (name: string) => void;
  back: () => void;
  replace: (name: string) => void;
  selectTab: (name: string) => void;
  navigate: (name: string) => void;
};

const WIDGET_VIEWS =
  '<kai-view name="home" tab-root>home</kai-view>' +
  '<kai-view name="messages" tab-root>messages</kai-view>' +
  '<kai-view name="chat">chat</kai-view>';

async function mount(html = WIDGET_VIEWS, attrs: Record<string, string> = {}): Promise<{
  el: ViewStackEl;
  events: ViewStackState[];
}> {
  const el = document.createElement('kai-view-stack') as ViewStackEl;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = html;
  const events: ViewStackState[] = [];
  el.addEventListener('kai-view-change', (e) =>
    events.push((e as CustomEvent<ViewStackState>).detail),
  );
  document.body.appendChild(el);
  await flush();
  await flush(); // child facades mount → host-attribute mutations → re-read
  return { el, events };
}

describe('<kai-view-stack> registration + discovery', () => {
  test('registers both custom elements and boots on the first tab root', async () => {
    const { el } = await mount();
    expect(customElements.get('kai-view-stack')).toBeDefined();
    expect(customElements.get('kai-view')).toBeDefined();
    expect(el.getAttribute('view')).toBe('home');
    expect(el.hasAttribute('drilled')).toBe(false);
  });
});

describe('back() returns to the root the drill was entered from', () => {
  // THE block-build bug, verbatim: selectTab non-default root, push, back.
  test('selectTab → push → back lands on the selected root, not the default (no initial view attribute)', async () => {
    const { el, events } = await mount();
    el.selectTab('messages');
    el.push('chat');
    el.back();
    await flush();
    const last = events.at(-1)!;
    expect(last.view).toBe('messages');
    expect(last.root).toBe('messages');
    expect(last.drilled).toBe(false);
    expect(el.getAttribute('view')).toBe('messages');
    expect(el.hasAttribute('drilled')).toBe(false);
  });

  test('same sequence with an initial view attribute', async () => {
    const { el, events } = await mount(WIDGET_VIEWS, { view: 'home' });
    el.selectTab('messages');
    el.push('chat');
    el.back();
    await flush();
    const last = events.at(-1)!;
    expect(last.view).toBe('messages');
    expect(last.root).toBe('messages');
    expect(el.getAttribute('view')).toBe('messages');
  });

  // The block's real pacing: a browser turn (event handler per click) between
  // navigations, so every reflection/MutationObserver microtask settles.
  test('selectTab → push → back with a task boundary between each step', async () => {
    const { el, events } = await mount();
    el.selectTab('messages');
    await flush();
    el.push('chat');
    await flush();
    expect(el.hasAttribute('drilled')).toBe(true);
    el.back();
    await flush();
    const last = events.at(-1)!;
    expect(last.view).toBe('messages');
    expect(last.root).toBe('messages');
    expect(last.drilled).toBe(false);
  });
});

describe('adjacent element-seam cases', () => {
  test('replace() while drilled from a non-default root keeps that root; back skips the replaced view', async () => {
    const { el, events } = await mount(
      WIDGET_VIEWS + '<kai-view name="details">details</kai-view>',
    );
    el.selectTab('messages');
    await flush();
    el.push('chat');
    await flush();
    el.replace('details');
    await flush();
    expect(events.at(-1)!.root).toBe('messages');
    expect(el.getAttribute('view')).toBe('details');
    el.back();
    await flush();
    const last = events.at(-1)!;
    expect(last.view).toBe('messages');
    expect(last.root).toBe('messages');
    expect(last.drilled).toBe(false);
  });

  test('selectTab while drilled from a non-default root clears the drill onto the new root', async () => {
    const { el, events } = await mount();
    el.selectTab('messages');
    await flush();
    el.push('chat');
    await flush();
    el.selectTab('home');
    await flush();
    const last = events.at(-1)!;
    expect(last.view).toBe('home');
    expect(last.root).toBe('home');
    expect(last.drilled).toBe(false);
    // And a fresh drill from home backs out to home.
    el.push('chat');
    await flush();
    el.back();
    await flush();
    expect(events.at(-1)!.root).toBe('home');
    expect(events.at(-1)!.view).toBe('home');
  });

  test('deep-link drill via the view attribute boots drilled; back lands on the default root', async () => {
    const { el, events } = await mount(WIDGET_VIEWS, { view: 'chat' });
    expect(el.getAttribute('view')).toBe('chat');
    expect(el.hasAttribute('drilled')).toBe(true);
    el.back();
    await flush();
    const last = events.at(-1)!;
    expect(last.view).toBe('home');
    expect(last.root).toBe('home');
    expect(last.drilled).toBe(false);
  });

  test('shows exactly the current view: hidden/data-active track navigation', async () => {
    const { el } = await mount();
    const view = (name: string) =>
      el.querySelector<HTMLElement>(`kai-view[name="${name}"]`)!;
    expect(view('home').hidden).toBe(false);
    expect(view('messages').hidden).toBe(true);
    el.selectTab('messages');
    await flush();
    el.push('chat');
    await flush();
    expect(view('chat').hidden).toBe(false);
    expect(view('chat').getAttribute('data-active')).toBe('true');
    el.back();
    await flush();
    expect(view('messages').hidden).toBe(false);
    expect(view('chat').hidden).toBe(true);
    expect(view('home').hidden).toBe(true);
  });
});
