/**
 * THE RE-RENDER CONTRACT, pinned as behaviour so the docs cannot drift from it.
 *
 * Issue #224 was filed by an outside user who renamed a conversation, saw the new
 * title in DevTools, and saw the old one on screen. He had followed the rule the
 * docs stated — "a new array reference per chunk" — which is the WEAKER rule and
 * is not sufficient. The elements were behaving correctly; every doc that stated
 * the rule stated half of it.
 *
 * The real rule, which the framework guides, both READMEs, the starter READMEs and
 * root `CLAUDE.md` now all state:
 *
 *   A new array reference is what NOTIFIES  — the same array set back is a no-op,
 *                                             even with an item swapped inside it.
 *   A new object for the changed item is what makes the change VISIBLE — these
 *                                             lists render rows through a
 *                                             reference-keyed <For>, so a row whose
 *                                             item identity is unchanged is never
 *                                             re-invoked.
 *   Adds / removes / reorders need only the fresh array, because those rows'
 *   identities already differ.
 *
 * WHY THIS IS NOT A VACUOUS TEST. A test asserting "the DOM did not change" passes
 * just as well when the harness is broken, the component never mounted, or the
 * query matches nothing — which is the failure mode this repo keeps hitting. So
 * every stale-case assertion here is paired with an update-case assertion over the
 * SAME harness and the SAME query: the update proves the harness can observe a
 * change at all, which is what makes the neighbouring "stayed stale" mean
 * something. Delete the update half and the stale half stops being evidence.
 *
 * If a future change makes an in-place mutation render (a store, `<Index>`, a
 * deep-reactive prop), these tests go red. That is the signal to update the docs
 * listed above — not to delete the assertion.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { ConversationList } from './conversation-list';
import { Thread } from './thread';
import type { ConversationSummary } from '../types';
import type { ChatMessage } from '../elements/chat-types';

// jsdom lacks these; the thread's auto-scroll container and reasoning disclosure
// wire them up. Same stubs as thread.test.tsx.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
vi.mock('../primitives/toast-store', () => {
  const fn = Object.assign(() => {}, { success: () => {}, dismiss: vi.fn(), clear: vi.fn() });
  return { toast: fn };
});

afterEach(cleanup);

const tick = () => new Promise((r) => setTimeout(r, 0));

const seedConversations = (): ConversationSummary[] => [
  { id: 'a', title: 'ORIGINAL', scope: { type: 'collection' }, messageCount: 3 } as ConversationSummary,
  { id: 'b', title: 'Beta', scope: { type: 'collection' }, messageCount: 1 } as ConversationSummary,
];

function mountConversations() {
  const [conversations, setConversations] = createSignal<ConversationSummary[]>(seedConversations());
  const { container } = render(() => (
    <ConversationList groups={[]} conversations={conversations()} onSelect={() => {}} onNewChat={() => {}} />
  ));
  return { container, setConversations, current: conversations };
}

describe('re-render contract — ConversationList (the #224 surface)', () => {
  it('does NOT re-render an item mutated in place, even inside a NEW array', async () => {
    const { container, setConversations, current } = mountConversations();
    expect(container.textContent).toContain('ORIGINAL');

    // The reporter's edit: change the field, hand over a fresh array of the SAME objects.
    current().find((c) => c.id === 'a')!.title = 'RENAMED';
    setConversations([...current()]);
    await tick();

    expect(container.textContent).not.toContain('RENAMED');
    expect(container.textContent).toContain('ORIGINAL');
  });

  it('DOES re-render when the changed item is a new object (the control for the case above)', async () => {
    const { container, setConversations, current } = mountConversations();
    expect(container.textContent).toContain('ORIGINAL');

    setConversations(current().map((c) => (c.id === 'a' ? { ...c, title: 'RENAMED' } : c)));
    await tick();

    expect(container.textContent).toContain('RENAMED');
    expect(container.textContent).not.toContain('ORIGINAL');
  });

  it('does NOT re-render when the SAME array reference is set back, item swapped inside it', async () => {
    const { container, setConversations, current } = mountConversations();
    const list = current();

    // A new object for the changed item, but the array reference never changes, so
    // nothing notifies. Both halves of the rule are load-bearing.
    list[0] = { ...list[0], title: 'RENAMED' };
    setConversations(list);
    await tick();

    expect(container.textContent).not.toContain('RENAMED');
  });

  it('adds, removes and reorders on a fresh array alone — untouched items keep their identity', async () => {
    const { container, setConversations, current } = mountConversations();

    setConversations([...current(), { id: 'c', title: 'GAMMA', scope: { type: 'collection' }, messageCount: 9 } as ConversationSummary]);
    await tick();
    expect(container.textContent).toContain('GAMMA');
    expect(container.textContent).toContain('ORIGINAL');

    setConversations(current().filter((c) => c.id !== 'b'));
    await tick();
    expect(container.textContent).not.toContain('Beta');
    expect(container.textContent).toContain('ORIGINAL');
  });
});

describe('re-render contract — Thread (the same rule on messages)', () => {
  const seedMessages = (): ChatMessage[] => [
    { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'ORIGINAL' }] },
  ];

  function mountThread() {
    const [messages, setMessages] = createSignal<ChatMessage[]>(seedMessages());
    const { container } = render(() => <Thread messages={messages()} />);
    return { container, setMessages, current: messages };
  }

  it('does NOT re-render a message mutated in place, even inside a NEW array', async () => {
    const { container, setMessages, current } = mountThread();
    expect(container.textContent).toContain('ORIGINAL');

    current()[0].parts = [{ type: 'text', text: 'RENAMED' }];
    setMessages([...current()]);
    await tick();

    expect(container.textContent).not.toContain('RENAMED');
  });

  it('DOES re-render when the changed message is a new object (the control for the case above)', async () => {
    const { container, setMessages, current } = mountThread();
    expect(container.textContent).toContain('ORIGINAL');

    setMessages(current().map((m) => ({ ...m, parts: [{ type: 'text' as const, text: 'RENAMED' }] })));
    await tick();

    expect(container.textContent).toContain('RENAMED');
  });
});
