// tests/elements/workspace-element.test.tsx
import '../../src/elements/chat-workspace';
import type { ChatMessage } from '../../src/elements/chat-types';
import type { ConversationSummary } from '../../src/types';

if (!Element.prototype.scrollTo) { Element.prototype.scrollTo = () => {}; }

const conversations: ConversationSummary[] = [
  { id: 'c1', title: 'First chat', scope: { type: 'document' }, messageCount: 2, lastMessageAt: '2026-06-13T10:00:00Z', updatedAt: '2026-06-13T10:00:00Z' },
];
const messages: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
];

test('renders the list + thread and emits conversationselect and submit', async () => {
  const el = document.createElement('kai-workspace') as HTMLElement & { conversations: ConversationSummary[]; messages: ChatMessage[] };
  el.conversations = conversations;
  el.messages = messages;
  document.body.appendChild(el);
  await Promise.resolve();

  expect(el.shadowRoot!.textContent).toContain('First chat'); // sidebar
  expect(el.shadowRoot!.textContent).toContain('Hi there');    // thread

  let selected: string | null = null;
  el.addEventListener('kai-conversation-select', (e) => (selected = (e as CustomEvent).detail.id));
  // the conversation row is a button containing the title
  const row = [...el.shadowRoot!.querySelectorAll('button')].find((b) => b.textContent?.includes('First chat'))!;
  row.click();
  expect(selected).toBe('c1');

  let submitted: string | null = null;
  el.addEventListener('kai-submit', (e) => (submitted = (e as CustomEvent).detail.value));
  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  editable.textContent = 'q';
  editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  expect(submitted).toBe('q');

  el.remove();
});

// ── §9 injection slots ───────────────────────────────────────────────────────

type WorkspaceEl = HTMLElement & {
  conversations: ConversationSummary[]; messages: ChatMessage[];
  collapseSidebar?(): void;
};

/** A direct light-DOM child carrying a `slot` attribute is what readSlots gates on. */
function slotted(name: string, text: string): HTMLElement {
  const node = document.createElement('div');
  node.setAttribute('slot', name);
  node.textContent = text;
  return node;
}

test('renders projected sidebar-header / sidebar-footer / main-header content', async () => {
  const el = document.createElement('kai-workspace') as WorkspaceEl;
  el.conversations = conversations;
  el.messages = messages;
  el.appendChild(slotted('sidebar-header', 'Brand mark'));
  el.appendChild(slotted('sidebar-footer', 'Upgrade card'));
  el.appendChild(slotted('main-header', 'Top banner'));
  document.body.appendChild(el);
  await Promise.resolve();
  await Promise.resolve();

  const root = el.shadowRoot!;
  // Each region wrapper renders a <slot> for the projected content.
  expect(root.querySelector('slot[name="sidebar-header"]')).not.toBeNull();
  expect(root.querySelector('slot[name="sidebar-footer"]')).not.toBeNull();
  expect(root.querySelector('slot[name="main-header"]')).not.toBeNull();

  el.remove();
});

test('does NOT render slot wrappers when nothing is projected (empty-slot trap)', async () => {
  const el = document.createElement('kai-workspace') as WorkspaceEl;
  el.conversations = conversations;
  el.messages = messages;
  document.body.appendChild(el);
  await Promise.resolve();
  await Promise.resolve();

  const root = el.shadowRoot!;
  expect(root.querySelector('slot[name="sidebar-header"]')).toBeNull();
  expect(root.querySelector('slot[name="sidebar-footer"]')).toBeNull();
  expect(root.querySelector('slot[name="main-header"]')).toBeNull();
  // The list + thread still render — drop-in behavior is unchanged.
  expect(root.textContent).toContain('First chat');
  expect(root.textContent).toContain('Hi there');

  el.remove();
});

test('a projected sidebar-footer card is clickable (upgrade usage)', async () => {
  const el = document.createElement('kai-workspace') as WorkspaceEl;
  el.conversations = conversations;
  el.messages = messages;
  const card = document.createElement('button');
  card.setAttribute('slot', 'sidebar-footer');
  card.textContent = 'Upgrade to Pro';
  let clicked = false;
  card.addEventListener('click', () => (clicked = true));
  el.appendChild(card);
  document.body.appendChild(el);
  await Promise.resolve();
  await Promise.resolve();

  // The light-DOM node stays interactive while projected into the shadow slot.
  card.click();
  expect(clicked).toBe(true);

  el.remove();
});

test('a projected `main` slot replaces the built-in chat thread', async () => {
  const el = document.createElement('kai-workspace') as WorkspaceEl;
  el.conversations = conversations;
  el.messages = messages;
  el.appendChild(slotted('main', 'Custom home view'));
  document.body.appendChild(el);
  await Promise.resolve();
  await Promise.resolve();

  const root = el.shadowRoot!;
  // The main slot renders, and the built-in thread does NOT mount (its seeded
  // message is gone). The sidebar still renders — only the main region is replaced.
  expect(root.querySelector('slot[name="main"]')).not.toBeNull();
  expect(root.textContent).not.toContain('Hi there');
  expect(root.textContent).toContain('First chat');

  el.remove();
});
