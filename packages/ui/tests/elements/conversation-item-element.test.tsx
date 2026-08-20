/**
 * A3/A4 — `<kai-conversation-item>` + the two modes of `<kai-conversations>`
 * (spec 2026-08-20 § 2a), one harness for both, per the reactivity-contract
 * discipline: every "nothing rendered" assertion is paired with an update case
 * over the same harness so it cannot pass vacuously.
 *
 * Coverage-guard credit: this file IMPORTS the facade module AND literally
 * constructs `kai-conversation-item`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../src/elements/conversation-list';
import '../../src/elements/conversation-item';
import type { ConversationSummary } from '../../src/types';

const conv = (id: string, title: string): ConversationSummary => ({
  id, title, scope: { type: 'collection' }, messageCount: 3,
  lastMessageAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
});

type ConvEl = HTMLElement & {
  conversations?: ConversationSummary[];
  groups?: unknown[];
  activeId?: string;
};
type ItemEl = HTMLElement & { conversationId?: string; active?: boolean };

const tick = () => new Promise((r) => setTimeout(r, 0));

function mountList(): ConvEl {
  const el = document.createElement('kai-conversations') as ConvEl;
  el.groups = [];
  document.body.appendChild(el);
  return el;
}

function makeItem(id: string, title: string): ItemEl {
  const item = document.createElement('kai-conversation-item') as ItemEl;
  item.setAttribute('conversation-id', id);
  item.textContent = title;
  return item;
}

afterEach(() => { document.body.innerHTML = ''; });

// ── A4 (1): batteries mode pinned BEFORE the facade reshape ─────────────────

describe('batteries mode (the conversations array prop) is unchanged', () => {
  it('renders data rows from the array exactly as before this lane', async () => {
    const el = mountList();
    el.conversations = [conv('c1', 'Alpha thread'), conv('c2', 'Beta thread')];
    await tick();
    const root = el.shadowRoot!;
    const rows = root.querySelectorAll('[data-conversation-id]');
    expect(rows.length).toBe(2);
    expect(root.textContent).toContain('Alpha thread');
    expect(root.textContent).toContain('3 messages');
  });

  it('array-prop reactivity holds: new array + new item object makes an edit visible', async () => {
    const el = mountList();
    const first = [conv('c1', 'Before title')];
    el.conversations = first;
    await tick();
    expect(el.shadowRoot!.textContent).toContain('Before title');
    // The #224 contract: fresh array AND fresh object for the changed item.
    el.conversations = [{ ...first[0], title: 'After title' }];
    await tick();
    expect(el.shadowRoot!.textContent).toContain('After title');
    expect(el.shadowRoot!.textContent).not.toContain('Before title');
  });
});

// ── the item element on its own ─────────────────────────────────────────────

describe('<kai-conversation-item>', () => {
  it('registers and renders the default slot title plus part regions', async () => {
    const item = makeItem('c1', 'My thread');
    const menuBtn = document.createElement('button');
    menuBtn.slot = 'menu';
    menuBtn.textContent = 'Actions';
    item.appendChild(menuBtn);
    document.body.appendChild(item);
    await tick();
    const root = item.shadowRoot!;
    expect(root.querySelector('[part~="row"]')).not.toBeNull();
    // Title comes through the default slot; menu content through slot="menu".
    const defaultSlot = root.querySelector('slot:not([name])') as HTMLSlotElement;
    expect(defaultSlot).not.toBeNull();
    const menuSlot = root.querySelector('[part~="menu"] slot[name="menu"]') as HTMLSlotElement;
    expect(menuSlot).not.toBeNull();
    expect(menuSlot.assignedElements()).toContain(menuBtn);
  });

  it('host carries option semantics; active drives aria-selected both ways', async () => {
    const item = makeItem('c1', 'T');
    document.body.appendChild(item);
    await tick();
    expect(item.getAttribute('role')).toBe('option');
    expect(item.getAttribute('aria-selected')).toBe('false');
    item.active = true;
    await tick();
    expect(item.getAttribute('aria-selected')).toBe('true');
    // The inner row must NOT carry a second option role (one option, not two).
    expect(item.shadowRoot!.querySelector('[role="option"]')).toBeNull();
    item.active = false;
    await tick();
    expect(item.getAttribute('aria-selected')).toBe('false');
  });

  it('an authored role is left alone', async () => {
    const item = makeItem('c1', 'T');
    item.setAttribute('role', 'treeitem');
    document.body.appendChild(item);
    await tick();
    expect(item.getAttribute('role')).toBe('treeitem');
  });
});

// ── children mode on <kai-conversations> ────────────────────────────────────

describe('item children switch <kai-conversations> into item mode', () => {
  it('children win: no data rows render even when conversations is also set', async () => {
    const el = mountList();
    el.conversations = [conv('c1', 'Data row title')];
    el.appendChild(makeItem('x1', 'Slotted title one'));
    el.appendChild(makeItem('x2', 'Slotted title two'));
    document.body.appendChild(el);
    await tick();
    const root = el.shadowRoot!;
    expect(root.querySelector('[data-conversation-id]')).toBeNull();
    expect(root.textContent).not.toContain('Data row title');
    // The listbox region exists and the items are assigned to its slot.
    const listbox = root.querySelector('[role="listbox"]')!;
    expect(listbox).not.toBeNull();
    const slot = listbox.querySelector('slot') as HTMLSlotElement;
    expect(slot.assignedElements().map((n) => n.getAttribute('conversation-id'))).toEqual(['x1', 'x2']);
  });

  it('selection flows container to item: activeId marks exactly one item aria-selected', async () => {
    const el = mountList();
    const a = makeItem('a', 'A');
    const b = makeItem('b', 'B');
    el.append(a, b);
    el.activeId = 'b';
    await tick();
    expect(a.getAttribute('aria-selected')).toBe('false');
    expect(b.getAttribute('aria-selected')).toBe('true');
    expect(a.getAttribute('tabindex')).toBe('-1');
    expect(b.getAttribute('tabindex')).toBe('0');
    el.activeId = 'a';
    await tick();
    expect(a.getAttribute('aria-selected')).toBe('true');
    expect(b.getAttribute('aria-selected')).toBe('false');
  });

  it('item activation emits kai-conversation-select with the item id; the menu slot does not', async () => {
    const el = mountList();
    const a = makeItem('a', 'A');
    const menuBtn = document.createElement('button');
    menuBtn.slot = 'menu';
    a.appendChild(menuBtn);
    el.append(a, makeItem('b', 'B'));
    await tick();
    const selected: string[] = [];
    el.addEventListener('kai-conversation-select', (e) => selected.push((e as CustomEvent).detail.id));
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(selected).toEqual(['a']);
    menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(selected).toEqual(['a']);
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    expect(selected).toEqual(['a', 'a']);
  });

  it('adding and removing items re-derives the roving tabindex (slotchange path)', async () => {
    const el = mountList();
    const a = makeItem('a', 'A');
    el.append(a);
    await tick();
    expect(a.getAttribute('tabindex')).toBe('0');
    const b = makeItem('b', 'B');
    el.append(b);
    await tick();
    expect([a, b].map((i) => i.getAttribute('tabindex'))).toEqual(['0', '-1']);
    a.remove();
    await tick();
    expect(b.getAttribute('tabindex')).toBe('0');
  });

  it('a harness flips modes when children arrive and when they leave', async () => {
    const el = mountList();
    el.conversations = [conv('c1', 'Batteries title')];
    await tick();
    expect(el.shadowRoot!.textContent).toContain('Batteries title');
    const item = makeItem('x', 'Item title');
    el.append(item);
    await tick();
    expect(el.shadowRoot!.textContent).not.toContain('Batteries title');
    expect(el.shadowRoot!.querySelector('[role="listbox"]')).not.toBeNull();
    item.remove();
    await tick();
    expect(el.shadowRoot!.textContent).toContain('Batteries title');
  });

  it('the chrome stays in item mode: search box renders and kai-search still fires', async () => {
    const el = mountList();
    el.append(makeItem('a', 'A'));
    await tick();
    const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Search chats"]');
    expect(input).not.toBeNull();
    const queries: string[] = [];
    el.addEventListener('kai-search', (e) => queries.push((e as CustomEvent).detail.query));
    input!.value = 'foo';
    // composed: true matches the native input event, which crosses the shadow
    // boundary to Solid's delegated document listener.
    input!.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    expect(queries).toEqual(['foo']);
  });
});
