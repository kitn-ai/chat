/**
 * The composed-launcher acceptance harness (composition spike, 2026-08-31 —
 * report: docs/superpowers/research/2026-08-31-composition-spike, "Real gap 1"
 * and "Real gap 2"). A NON-facade consumer — someone composing `<kai-chat>`
 * beside their OWN launcher instead of using a preset widget — must be able
 * to, through public surface only:
 *
 *   (a) observe unread transitions (the kit-owned computation the spike's
 *       hand-composed widget had to re-derive by hand): the `hostOpen`
 *       property in, the `kai-unread-change` event out; and
 *   (b) close the conversations list programmatically on widget close
 *       (`el.closeConversationsList()`), the interaction-API seam that was
 *       reachable only through `ChatThreadController` inside the facade.
 *
 * `../../src/elements/chat` is the source of the public `@kitn.ai/ui/elements`
 * entry; `../../src/index` is the package root — the same modules a consumer's
 * imports resolve to through the shipped exports map.
 */
import { expect, test, vi } from 'vitest';
import '../../src/elements/chat';
import { isConversationUnread, type ConversationStore, type ConversationSummary } from '../../src/index';

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
// The conversations lifecycle is a chain of microtask-hopping awaits
// (list → restore-pick → load → onConversationLoad); a few macrotask turns
// settle it deterministically in jsdom.
const settle = async () => { await flush(); await flush(); await flush(); };

/** Minimal in-memory ConversationStore: "a" is UNREAD (updated after last
 *  read), "b" is read. Typed against the PUBLIC `ConversationStore` interface
 *  so this harness proves the contract a composing consumer actually writes. */
function makeStore() {
  const summaries: ConversationSummary[] = [
    { id: 'a', title: 'Order status', messageCount: 2, updatedAt: '2026-08-31T12:00:00Z', lastReadAt: '2026-08-31T11:00:00Z' },
    { id: 'b', title: 'Returns', messageCount: 1, updatedAt: '2026-08-30T09:00:00Z', lastReadAt: '2026-08-30T10:00:00Z' },
  ];
  const markRead = vi.fn(async (id: string) => {
    const row = summaries.find((s) => s.id === id);
    if (row) row.lastReadAt = new Date().toISOString();
  });
  const store: ConversationStore = {
    list: async () => summaries.map((s) => ({ ...s })), // fresh array + objects (reactivity contract)
    load: async () => [],
    save: async () => {},
    markRead,
  };
  return { store, summaries, markRead };
}

type KaiChatEl = HTMLElement & {
  messages?: unknown[];
  store?: ConversationStore;
  hostOpen?: boolean;
  closeConversationsList?: () => void;
  startNewConversation?: () => void;
};

function mountChat(store: ConversationStore): KaiChatEl {
  const el = document.createElement('kai-chat') as KaiChatEl;
  el.setAttribute('conversations', '');
  el.messages = [];
  el.store = store;
  return el;
}

test('composed launcher, gap (a): hostOpen in, kai-unread-change out — a message arriving while the launcher is closed reads unread, opening marks it seen', async () => {
  const { store, markRead } = makeStore();
  const el = mountChat(store);
  // The consumer's own launcher badge: nothing but the public event feeds it.
  const badge: boolean[] = [];
  el.addEventListener('kai-unread-change', (e) => badge.push((e as CustomEvent<{ unread: boolean }>).detail.unread));
  // Launcher starts CLOSED — the canonical "agent replied while your box was
  // shut" case. A JS property, matching its doc (default true; only an
  // explicit `false` closes).
  el.hostOpen = false;
  document.body.appendChild(el);
  await settle();

  // Mount auto-restore made "a" (newest) active — but the host is closed, so
  // nothing may count as seen: markRead must NOT fire, and "a"'s unreadness
  // must surface outward to the launcher.
  expect(markRead).not.toHaveBeenCalled();
  expect(badge).toContain(true);
  expect(badge.at(-1)).toBe(true);

  // The visitor opens the launcher: the active conversation is now seen —
  // markRead fires for it and the badge clears, all through the same seam.
  el.hostOpen = true;
  await settle();
  expect(markRead).toHaveBeenCalledWith('a');
  expect(badge.at(-1)).toBe(false);

  el.remove();
});

test('composed launcher, gap (b): closeConversationsList() is an element method — close-while-list-open, and the next open lands on chat', async () => {
  const { store } = makeStore();
  const el = mountChat(store);
  document.body.appendChild(el);
  await settle();

  // Visitor opens the prior-conversations list via the built-in header toggle.
  const toggle = el.shadowRoot!.querySelector<HTMLElement>('[data-kai-conversations-toggle]');
  expect(toggle).toBeTruthy();
  toggle!.click();
  await settle();
  expect(el.shadowRoot!.querySelector('[data-kai-new-conversation]')).toBeTruthy();

  // The consumer's own dock closes; its kai-open-change handler calls the
  // method — previously reachable only inside the facade's own controller.
  expect(typeof el.closeConversationsList).toBe('function');
  el.closeConversationsList!();
  await settle();
  expect(el.shadowRoot!.querySelector('[data-kai-new-conversation]')).toBeNull();
  // Back on the chat view: the toggle reads "Conversations" again, not "Back to chat".
  expect(
    el.shadowRoot!.querySelector('[data-kai-conversations-toggle]')!.getAttribute('aria-label'),
  ).toMatch(/^Conversations/);

  el.remove();
});

test('composed launcher, B-10: startNewConversation() is an element method — clears the active conversation and delivers [] through kai-conversation-load', async () => {
  const { store } = makeStore();
  const el = mountChat(store);
  document.body.appendChild(el);
  await settle();
  // Mount auto-restore made "a" active (delivered via kai-conversation-load);
  // only count loads from here on, so the assertion is about THIS call.
  const loads: { id: string | undefined; messages: unknown[] }[] = [];
  el.addEventListener('kai-conversation-load', (e) =>
    loads.push((e as CustomEvent<{ id: string | undefined; messages: unknown[] }>).detail));

  // The consumer's own "New conversation" control — previously reachable only
  // through ChatThreadController inside the facade.
  expect(typeof el.startNewConversation).toBe('function');
  el.startNewConversation!();
  await settle();

  expect(loads).toEqual([{ id: undefined, messages: [] }]); // C-6: no id until the first message
  // Back on the chat view, not the list.
  expect(el.shadowRoot!.querySelector('[data-kai-new-conversation]')).toBeNull();
  expect(
    el.shadowRoot!.querySelector('[data-kai-conversations-toggle]')!.getAttribute('aria-label'),
  ).toMatch(/^Conversations/);

  el.remove();
});

test('the unread predicate itself is importable from the package root, and agrees with the badge the kit renders', async () => {
  const { store, summaries } = makeStore();
  // The composed consumer deriving a per-row badge for their OWN list UI uses
  // the same predicate the kit uses — exported, not restated.
  expect(isConversationUnread(summaries[0])).toBe(true);
  expect(isConversationUnread(summaries[1])).toBe(false);

  const el = mountChat(store);
  document.body.appendChild(el);
  await settle();
  // hostOpen unset (default true): "a" is active and seen, "b" is read — the
  // kit's own header dot agrees with the public predicate over the summaries.
  expect(el.shadowRoot!.querySelector('[data-kai-conversations-unread]')).toBeNull();

  el.remove();
});
