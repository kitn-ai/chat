import '../../src/elements/conversation-list';
import type { ConversationGroup, ConversationSummary } from '../../src/types';

const groups: ConversationGroup[] = [{ id: 'g1', name: 'Today', sortOrder: 0, createdAt: '2026-06-01' }];
const conversations: ConversationSummary[] = [{
  id: 'c1', title: 'Hello world', groupId: 'g1', scope: { type: 'document' },
  messageCount: 2, lastMessageAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
}];

test('renders conversations and emits conversationselect', async () => {
  const el = document.createElement('kai-conversations') as HTMLElement & {
    groups: ConversationGroup[]; conversations: ConversationSummary[]; activeId?: string;
  };
  el.groups = groups;
  el.conversations = conversations;
  document.body.appendChild(el);
  await Promise.resolve();

  expect(el.shadowRoot!.textContent).toContain('Hello world');

  let selected: string | null = null;
  el.addEventListener('kai-conversation-select', (e) => (selected = (e as CustomEvent).detail.id));
  const item = el.shadowRoot!.querySelector('[data-conversation-id="c1"]') as HTMLElement;
  item.click();
  expect(selected).toBe('c1');

  el.remove();
});

test('does not emit old "select" event (breaking change)', async () => {
  const el = document.createElement('kai-conversations') as HTMLElement & {
    groups: ConversationGroup[]; conversations: ConversationSummary[];
  };
  el.groups = groups;
  el.conversations = conversations;
  document.body.appendChild(el);
  await Promise.resolve();

  let selectFired = false;
  el.addEventListener('kai-select', () => (selectFired = true));
  const item = el.shadowRoot!.querySelector('[data-conversation-id="c1"]') as HTMLElement;
  item.click();
  expect(selectFired).toBe(false);

  el.remove();
});

test('icon-only controls have accessible names (a11y A1)', async () => {
  const el = document.createElement('kai-conversations') as HTMLElement & {
    groups: ConversationGroup[]; conversations: ConversationSummary[];
  };
  el.groups = groups;
  el.conversations = conversations;
  document.body.appendChild(el);
  await Promise.resolve();

  const root = el.shadowRoot!;
  const toggle = root.querySelector<HTMLButtonElement>('button[aria-label="Toggle sidebar"]');
  const newChat = root.querySelector<HTMLButtonElement>('button[aria-label="New chat"]');
  const search = root.querySelector<HTMLInputElement>('input[type="text"]');

  expect(toggle).not.toBeNull();
  expect(toggle!.getAttribute('aria-label')).toBe('Toggle sidebar');
  expect(newChat).not.toBeNull();
  expect(newChat!.getAttribute('aria-label')).toBe('New chat');
  expect(search!.getAttribute('aria-label')).toBe('Search chats');

  el.remove();
});

// ── §8 rail collapse ────────────────────────────────────────────────────────

type ConvEl = HTMLElement & {
  groups: ConversationGroup[]; conversations: ConversationSummary[];
  collapsed?: boolean;
  collapse(): void; expand(): void; toggle(): void;
};

function mountConversations(extra?: (el: ConvEl) => void): ConvEl {
  const el = document.createElement('kai-conversations') as ConvEl;
  el.groups = groups;
  el.conversations = conversations;
  extra?.(el);
  document.body.appendChild(el);
  return el;
}

test('collapse() shrinks the rail to a floating reopen button; expand() restores it', async () => {
  const el = mountConversations();
  await Promise.resolve();
  const root = el.shadowRoot!;

  // Expanded by default: the list (and search) render.
  expect(root.textContent).toContain('Hello world');

  el.collapse();
  await Promise.resolve();
  // Collapsed: the list is gone, only the reopen button remains.
  expect(root.textContent).not.toContain('Hello world');
  const reopen = root.querySelector<HTMLButtonElement>('button[aria-label="Open sidebar"]');
  expect(reopen).not.toBeNull();

  el.expand();
  await Promise.resolve();
  expect(root.textContent).toContain('Hello world');
  expect(root.querySelector('button[aria-label="Open sidebar"]')).toBeNull();

  el.remove();
});

test('collapse/expand/toggle fire kai-collapse-toggle with the new state', async () => {
  const el = mountConversations();
  await Promise.resolve();

  const states: boolean[] = [];
  el.addEventListener('kai-collapse-toggle', (e) => states.push((e as CustomEvent).detail.collapsed));

  el.collapse();
  el.expand();
  el.toggle(); // from expanded → collapsed
  await Promise.resolve();

  expect(states).toEqual([true, false, true]);
  el.remove();
});

test('the floating reopen button expands the rail and fires kai-collapse-toggle', async () => {
  const el = mountConversations((e) => (e.collapsed = undefined));
  el.collapsed = undefined;
  await Promise.resolve();
  el.collapse();
  await Promise.resolve();

  let lastCollapsed: boolean | null = null;
  el.addEventListener('kai-collapse-toggle', (e) => (lastCollapsed = (e as CustomEvent).detail.collapsed));

  const reopen = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Open sidebar"]')!;
  reopen.click();
  await Promise.resolve();

  expect(lastCollapsed).toBe(false);
  expect(el.shadowRoot!.textContent).toContain('Hello world');
  el.remove();
});

test('default-collapsed seeds the rail collapsed (uncontrolled)', async () => {
  const el = document.createElement('kai-conversations') as ConvEl;
  el.setAttribute('default-collapsed', '');
  el.groups = groups;
  el.conversations = conversations;
  document.body.appendChild(el);
  await Promise.resolve();

  const root = el.shadowRoot!;
  expect(root.querySelector('button[aria-label="Open sidebar"]')).not.toBeNull();
  expect(root.textContent).not.toContain('Hello world');
  el.remove();
});

test('controlled collapsed prop wins over an internal toggle', async () => {
  const el = mountConversations((e) => (e.collapsed = true));
  await Promise.resolve();
  const root = el.shadowRoot!;
  // Controlled-collapsed: shows the reopen button.
  expect(root.querySelector('button[aria-label="Open sidebar"]')).not.toBeNull();

  // expand() writes the internal value (masked while controlled) + still fires the
  // event, so a controlling app can react — but the view stays collapsed.
  let fired = false;
  el.addEventListener('kai-collapse-toggle', () => (fired = true));
  el.expand();
  await Promise.resolve();
  expect(fired).toBe(true);
  expect(root.querySelector('button[aria-label="Open sidebar"]')).not.toBeNull();
  el.remove();
});

// ── compact (row density, the old kai-workspace `compact` maps here) ────────
// Both orders per the kai-tool upgrade class: the attribute present in MARKUP
// before properties are assigned, and the property assigned on a bare element.
// The compact row drops the "N messages" line; the default row keeps it — the
// default case is the non-vacuity pair for the compact assertions.

test('compact via markup attribute renders dense rows (no message-count line)', async () => {
  document.body.innerHTML = '<kai-conversations compact></kai-conversations>';
  const el = document.body.querySelector('kai-conversations') as ConvEl;
  el.groups = groups;
  el.conversations = conversations;
  await Promise.resolve();

  // Scoped to the ROW node: the shadow root's textContent includes the inline
  // <style> fallback, whose CSS happens to contain the word "messages".
  const row = el.shadowRoot!.querySelector('[data-conversation-id="c1"]')!;
  expect(row.textContent).toContain('Hello world');
  expect(row.textContent).not.toContain('messages');
  document.body.innerHTML = '';
});

test('compact via property assignment renders dense rows; default keeps the count line', async () => {
  // Default first: the count line renders, so its absence below means something.
  const plain = mountConversations();
  await Promise.resolve();
  expect(plain.shadowRoot!.querySelector('[data-conversation-id="c1"]')!.textContent).toContain('2 messages');
  plain.remove();

  const el = document.createElement('kai-conversations') as ConvEl & { compact?: boolean };
  el.compact = true;
  el.groups = groups;
  el.conversations = conversations;
  document.body.appendChild(el);
  await Promise.resolve();

  const row = el.shadowRoot!.querySelector('[data-conversation-id="c1"]')!;
  expect(row.textContent).toContain('Hello world');
  expect(row.textContent).not.toContain('messages');
  // The property reads back what was set (#294 read-back class).
  expect(el.compact).toBe(true);
  el.remove();
});
