/**
 * A2 — the parent-item contract (spec 2026-08-20 § 2a), jsdom half; the focus
 * order and slotchange timing halves live in real-Chromium probes
 * (scripts/probe-conversation-item-focus-order.mjs / -slotchange.mjs).
 *
 * Also carries C2 / F-04 (routed here per the plan): a search query matching no
 * conversation must render a VISIBLE no-match state, distinct from the
 * zero-conversations empty state.
 *
 * The controller half tests `createConversationItemsController` against plain
 * stand-in nodes on purpose: the contract is pure DOM (properties, attributes,
 * composed paths), so it must hold regardless of which custom element hosts it —
 * that is what lets the facade layer survive ratification renames.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import {
  ConversationList,
  createConversationItemsController,
  readConversationItemId,
} from './conversation-list';
import type { ConversationSummary } from '../types';

afterEach(cleanup);

const conv = (id: string, title: string): ConversationSummary => ({
  id, title, scope: { type: 'collection' }, messageCount: 1,
  lastMessageAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
});

const noop = () => {};
const baseProps = { groups: [], onSelect: noop, onNewChat: noop };

/** A light-DOM stand-in for a kai-conversation-item host. */
function makeItem(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('conversation-id', id);
  document.body.appendChild(el);
  return el;
}

describe('children mode wins over the conversations prop', () => {
  it('renders NO data rows when items are provided, even with conversations set', () => {
    const { container } = render(() => (
      <ConversationList
        {...baseProps}
        conversations={[conv('c1', 'Data row one'), conv('c2', 'Data row two')]}
        items={<div data-t="slotted-item">My own row</div>}
      />
    ));
    // No batteries rows...
    expect(container.querySelector('[data-conversation-id]')).toBeNull();
    expect(container.textContent).not.toContain('Data row one');
    // ...the consumer's items render inside a listbox region instead.
    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox!.querySelector('[data-t="slotted-item"]')).not.toBeNull();
  });

  it('keeps the chrome in items mode: search box renders and still reports queries', () => {
    let query: string | undefined;
    const { container } = render(() => (
      <ConversationList
        {...baseProps}
        conversations={[]}
        items={<div>row</div>}
        onSearchChange={(q) => (query = q)}
      />
    ));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search chats"]');
    expect(input).not.toBeNull();
    fireEvent.input(input!, { target: { value: 'billing' } });
    expect(query).toBe('billing');
    // The consumer's loop owns filtering: the slotted row is untouched.
    expect(container.querySelector('[role="listbox"]')!.textContent).toContain('row');
    // And no built-in empty state competes with the consumer's items.
    expect(container.textContent).not.toContain('No conversations yet');
  });
});

describe('readConversationItemId', () => {
  it('prefers the conversationId property, then the conversation-id attribute, then host id', () => {
    const el = makeItem('attr-id');
    expect(readConversationItemId(el)).toBe('attr-id');
    (el as HTMLElement & { conversationId?: string }).conversationId = 'prop-id';
    expect(readConversationItemId(el)).toBe('prop-id');
    const bare = document.createElement('div');
    bare.id = 'host-id';
    expect(readConversationItemId(bare)).toBe('host-id');
  });
});

describe('createConversationItemsController', () => {
  function setup(ids: string[], activeId?: string) {
    // The handlers are attached as REAL listeners on a wrapper (the shape the
    // facade uses: a listbox region above the slot), because `composedPath()` is
    // only populated while an event is dispatching — calling the handler after
    // the fact hands it an empty path and every activation test passes vacuously.
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const items = ids.map((id) => {
      const el = makeItem(id);
      wrapper.appendChild(el);
      return el;
    });
    const selected: string[] = [];
    let active = activeId;
    const controller = createConversationItemsController({
      getItems: () => items.filter((i) => i.isConnected),
      getActiveId: () => active,
      onSelect: (id) => selected.push(id),
    });
    wrapper.addEventListener('click', (e) => controller.handleClick(e));
    wrapper.addEventListener('keydown', (e) => controller.handleKeyDown(e));
    controller.sync();
    return { items, selected, controller, setActive: (id?: string) => { active = id; controller.sync(); } };
  }

  afterEach(() => { document.body.innerHTML = ''; });

  it('selection flows container to item: exactly one item is aria-selected="true"', () => {
    const { items, setActive } = setup(['a', 'b', 'c'], 'b');
    expect(items.map((i) => i.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    // And the active property is driven for the facade's styling hook.
    expect((items[1] as HTMLElement & { active?: boolean }).active).toBe(true);
    setActive('c');
    expect(items.map((i) => i.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
  });

  it('gives items role="option" when they carry none, and leaves an authored role alone', () => {
    const authored = makeItem('x');
    authored.setAttribute('role', 'treeitem');
    const { items } = setup(['a']);
    expect(items[0].getAttribute('role')).toBe('option');
    const controller = createConversationItemsController({
      getItems: () => [authored], getActiveId: () => undefined, onSelect: noop,
    });
    controller.sync();
    expect(authored.getAttribute('role')).toBe('treeitem');
  });

  it('roving tabindex: exactly one item tabindex="0" (the active one), the rest -1', () => {
    const { items, setActive } = setup(['a', 'b', 'c'], 'b');
    expect(items.map((i) => i.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    setActive(undefined);
    // No active item: the first item is the entry point.
    expect(items.map((i) => i.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('re-derives roving tabindex when items are added or removed (the slotchange path)', () => {
    const { items, controller } = setup(['a', 'b'], 'a');
    items[0].remove();
    controller.sync();
    const rest = items.filter((i) => i.isConnected);
    expect(rest.map((i) => i.getAttribute('tabindex'))).toEqual(['0']);
    const added = makeItem('c');
    const withAdded = [...rest, added];
    const c2 = createConversationItemsController({
      getItems: () => withAdded, getActiveId: () => 'b', onSelect: noop,
    });
    c2.sync();
    expect(withAdded.map((i) => i.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  it('click activates: onSelect fires with the item id', () => {
    const { items, selected } = setup(['a', 'b'], 'a');
    items[1].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(selected).toEqual(['b']);
  });

  it('Enter and Space activate; Space does not scroll (default prevented)', () => {
    const { items, selected } = setup(['a', 'b'], 'a');
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true, cancelable: true });
    items[1].dispatchEvent(space);
    expect(selected).toEqual(['a', 'b']);
    expect(space.defaultPrevented).toBe(true);
  });

  it('activation is suppressed when the composed path crosses the menu region', () => {
    const { items, selected } = setup(['a'], 'a');
    // Non-vacuity first: a plain click on the row DOES select.
    items[0].dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(selected).toEqual(['a']);
    // A click through the shadow menu wrapper does not.
    const menu = document.createElement('span');
    menu.setAttribute('data-kai-item-menu', '');
    const button = document.createElement('button');
    menu.appendChild(button);
    items[0].appendChild(menu);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(selected).toEqual(['a']);
    // Same for light-DOM slot="menu" content (the element-mode shape).
    menu.remove();
    const slotted = document.createElement('button');
    slotted.setAttribute('slot', 'menu');
    items[0].appendChild(slotted);
    slotted.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(selected).toEqual(['a']);
  });

  it('ArrowDown / ArrowUp move focus item-to-item and the roving tabindex follows', () => {
    const { items } = setup(['a', 'b', 'c'], 'a');
    items[0].focus();
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true }));
    expect(document.activeElement).toBe(items[1]);
    expect(items.map((i) => i.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true, cancelable: true }));
    expect(document.activeElement).toBe(items[0]);
    expect(items.map((i) => i.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('Home and End jump to the first and last item', () => {
    const { items } = setup(['a', 'b', 'c'], 'b');
    items[1].focus();
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, composed: true, cancelable: true }));
    expect(document.activeElement).toBe(items[2]);
    items[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, composed: true, cancelable: true }));
    expect(document.activeElement).toBe(items[0]);
  });
});

// C2 / F-04 — the no-match state (decide loudly), routed to this lane per the plan.
describe('search no-match state (F-04)', () => {
  it('conversations present + a query matching none renders a visible no-match state', () => {
    const { container } = render(() => (
      <ConversationList {...baseProps} conversations={[conv('c1', 'Budget planning')]} />
    ));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search chats"]')!;
    fireEvent.input(input, { target: { value: 'zzz-no-such-thing' } });
    expect(container.textContent).toContain('No conversations match your search');
    // Distinct from the zero-conversations empty state.
    expect(container.textContent).not.toContain('No conversations yet');
    // And the rows really are filtered out.
    expect(container.querySelector('[data-conversation-id]')).toBeNull();
  });

  it('clearing the query restores the rows (the no-match state is not sticky)', () => {
    const { container } = render(() => (
      <ConversationList {...baseProps} conversations={[conv('c1', 'Budget planning')]} />
    ));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search chats"]')!;
    fireEvent.input(input, { target: { value: 'zzz' } });
    expect(container.textContent).toContain('No conversations match your search');
    fireEvent.input(input, { target: { value: '' } });
    expect(container.textContent).not.toContain('No conversations match your search');
    expect(container.textContent).toContain('Budget planning');
  });

  it('the zero-conversations empty state (and the empty override) still keys off the unfiltered list', () => {
    const { container } = render(() => (
      <ConversationList {...baseProps} conversations={[]} empty={<div data-t="custom-empty">Nothing here</div>} />
    ));
    expect(container.querySelector('[data-t="custom-empty"]')).not.toBeNull();
    expect(container.textContent).not.toContain('No conversations match your search');
  });
});
