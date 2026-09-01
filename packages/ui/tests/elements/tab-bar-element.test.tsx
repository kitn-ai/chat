/**
 * `<kai-tab-bar>` + `<kai-tab-bar-item>` — the element pair over the headless
 * tab-bar controller (blocks-and-parts P-2). The Solid-layer behavior lives in
 * src/components/tab-bar.test.tsx; THIS file exercises the element seam a
 * consumer actually hits: light-DOM `<kai-tab-bar-item>` children, the bar's
 * MutationObserver discovery, the parent-item contract stamped across the
 * shadow boundary (role/aria-selected/roving tabindex on each item's shadow
 * body), and `kai-tab-change` on the bar (non-bubbling).
 *
 * CONVENTIONS (pane-grid-element.test.tsx): assertions run against the real
 * custom elements; a macrotask flush covers upgrade + MutationObserver delivery.
 */
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/tab-bar';
import '../../src/elements/tab-bar-item';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type TabBarEl = HTMLElement & {
  value?: string;
  select?: (v: string) => void;
};

async function mount(items: string): Promise<TabBarEl> {
  const el = document.createElement('kai-tab-bar') as TabBarEl;
  el.innerHTML = items;
  document.body.appendChild(el);
  await flush();
  await flush(); // item facades mount → host-attribute mutations → bar re-sync
  return el;
}

const item = (el: TabBarEl, value: string) =>
  el.querySelector<HTMLElement>(`kai-tab-bar-item[value="${value}"]`)!;
const bodyOf = (it: HTMLElement) =>
  it.shadowRoot!.querySelector<HTMLElement>('[data-kai-tab-body]')!;

describe('<kai-tab-bar> registration + parent-item contract', () => {
  test('registers both custom elements', () => {
    expect(customElements.get('kai-tab-bar')).toBeDefined();
    expect(customElements.get('kai-tab-bar-item')).toBeDefined();
  });

  test('renders the tablist and stamps tab semantics onto each item shadow body', async () => {
    const el = await mount(
      '<kai-tab-bar-item value="home" icon="home">Home</kai-tab-bar-item>' +
      '<kai-tab-bar-item value="messages" icon="message-square">Messages</kai-tab-bar-item>',
    );
    const tablist = el.shadowRoot!.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist!.getAttribute('part')).toBe('tablist');

    const home = bodyOf(item(el, 'home'));
    const messages = bodyOf(item(el, 'messages'));
    expect(home.getAttribute('role')).toBe('tab');
    expect(messages.getAttribute('role')).toBe('tab');
    // Uncontrolled with no default-value: first enabled tab is active.
    expect(home.getAttribute('aria-selected')).toBe('true');
    expect(messages.getAttribute('aria-selected')).toBe('false');
    // Roving tabindex: exactly the active body is in the tab order.
    expect(home.getAttribute('tabindex')).toBe('0');
    expect(messages.getAttribute('tabindex')).toBe('-1');
  });

  test('select() moves selection and fires kai-tab-change on the bar', async () => {
    const el = await mount(
      '<kai-tab-bar-item value="home">Home</kai-tab-bar-item>' +
      '<kai-tab-bar-item value="messages">Messages</kai-tab-bar-item>',
    );
    const seen: string[] = [];
    el.addEventListener('kai-tab-change', (e) => seen.push((e as CustomEvent<{ value: string }>).detail.value));

    el.select!('messages');
    await flush();
    expect(seen).toEqual(['messages']);
    expect(bodyOf(item(el, 'messages')).getAttribute('aria-selected')).toBe('true');
    expect(bodyOf(item(el, 'home')).getAttribute('aria-selected')).toBe('false');

    // The paired negative, over the same harness: unknown values are ignored.
    el.select!('nope');
    await flush();
    expect(seen).toEqual(['messages']);
  });

  test('the controlled value attribute wins and drives the items', async () => {
    const el = document.createElement('kai-tab-bar') as TabBarEl;
    el.setAttribute('value', 'messages');
    el.innerHTML =
      '<kai-tab-bar-item value="home">Home</kai-tab-bar-item>' +
      '<kai-tab-bar-item value="messages">Messages</kai-tab-bar-item>';
    document.body.appendChild(el);
    await flush();
    await flush();
    expect(bodyOf(item(el, 'messages')).getAttribute('aria-selected')).toBe('true');
    expect(item(el, 'messages').hasAttribute('active')).toBe(true);
    expect(bodyOf(item(el, 'home')).getAttribute('aria-selected')).toBe('false');
  });

  test('a disabled item cannot be selected', async () => {
    const el = await mount(
      '<kai-tab-bar-item value="home">Home</kai-tab-bar-item>' +
      '<kai-tab-bar-item value="help" disabled>Help</kai-tab-bar-item>',
    );
    const seen: string[] = [];
    el.addEventListener('kai-tab-change', () => seen.push('fired'));
    el.select!('help');
    await flush();
    expect(seen).toEqual([]);
    expect(bodyOf(item(el, 'home')).getAttribute('aria-selected')).toBe('true');
  });
});
