import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { createSignal } from 'solid-js';
import { ChatThread, type ChatThreadProps } from './chat-thread';
import type { ConversationStore } from '../primitives/conversation-store';
import type { ConversationSummary } from '../types';
import type { ChatMessage } from '../elements/chat-types';
import { componentDescription } from '../stories/docs/element-controls';

/**
 * A stub `ConversationStore` — no localStorage, no network — so this story is
 * a fast design-iteration surface for the widget-box list view: edit the
 * fixture data or the row/pill markup in `conversation-panel.tsx` and this
 * canvas reflects it immediately, no build/pack/redeploy loop. `markRead` IS
 * implemented (mutating an in-memory copy of the seed data) — unlike
 * `save`, which stays a no-op — so `ListViewWithUnread` demonstrates the
 * real write path: select a row, reopen the list, its dot is gone.
 */
function stubStore(summaries: ConversationSummary[]): ConversationStore {
  const threads: Record<string, ChatMessage[]> = {
    'conv-1': [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'How do I reset my password?' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: "Head to Settings → Security and click \"Send reset link\" — it'll land in your inbox within a minute." }] },
    ],
    'conv-2': [
      { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'Can I export my data as CSV?' }] },
      { id: 'm4', role: 'assistant', parts: [{ type: 'text', text: 'Yes — from the Data tab, choose Export, then CSV. Larger exports get emailed to you as a download link.' }] },
    ],
    'conv-3': [
      { id: 'm5', role: 'user', parts: [{ type: 'text', text: "What's the difference between the Team and Business plans?" }] },
    ],
  };
  const state = summaries.map((s) => ({ ...s }));
  return {
    async list() { return state.map((s) => ({ ...s })); },
    async load(id) { return threads[id] ?? []; },
    async save() { /* stub: the story never mutates the fixture's content */ },
    async markRead(id) {
      const entry = state.find((s) => s.id === id);
      if (entry) entry.lastReadAt = new Date().toISOString();
    },
  };
}

const now = Date.parse('2026-08-26T15:00:00Z');
const minsAgo = (mins: number) => new Date(now - mins * 60_000).toISOString();

const fixtureConversations: ConversationSummary[] = [
  {
    id: 'conv-1',
    title: 'Resetting my password',
    messageCount: 2,
    updatedAt: minsAgo(4),
    trailing: "Head to Settings → Security and click \"Send reset link\" — it'll land in your inbox within a minute.",
  },
  {
    id: 'conv-2',
    title: 'Exporting data as CSV',
    messageCount: 2,
    updatedAt: minsAgo(180),
    trailing: 'Yes — from the Data tab, choose Export, then CSV. Larger exports get emailed to you as a download link.',
  },
  {
    id: 'conv-3',
    title: 'Team vs Business plans',
    messageCount: 1,
    updatedAt: minsAgo(2880),
    trailing: "What's the difference between the Team and Business plans?",
  },
];

/**
 * Same three conversations, but `conv-2`/`conv-3` carry a `lastReadAt` OLDER
 * than their `updatedAt` — unread, per `isConversationUnread`'s contract
 * (conversation-item.tsx). `conv-1` (no `lastReadAt` at all) is the one
 * mount-time auto-restore selects (most-recently-updated), which is also
 * exactly why it's the right one to leave "clean" here: it becomes the
 * active conversation and gets marked read for real the moment the story
 * mounts (this stub's `markRead` below actually persists it, matching a real
 * store), so a static `lastReadAt` on it would either be redundant or,
 * pinned in the past, get immediately corrected anyway.
 */
const unreadFixtureConversations: ConversationSummary[] = fixtureConversations.map((c) =>
  c.id === 'conv-1' ? c : { ...c, lastReadAt: minsAgo(60 * 24 * 3) },
);

/**
 * The widget-box conversations experience: a header toggle that swaps between
 * a chat-bubble glyph and a back arrow, and a list view that fully replaces
 * the content area (no composer, no suggestions — see `ConversationPanel`).
 * Rebuilt 2026-08-26 after the owner rejected a retrofit of the desktop
 * `ConversationList` into this box at the live demo; modeled on Intercom's
 * Messenger "Messages" tab (`.superpowers/sdd/2026-08-26-conversations/
 * research-intercom-messages-view.md`).
 */
const meta = {
  title: 'Components/Elements/ChatThread',
  component: ChatThread,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      controls: { exclude: ['use:eventListener', 'messages', 'controllerRef', 'cardHostElement', 'onMessageAction'] },
      description: componentDescription([
        'The full chat surface: header, message thread, suggestions and composer — plus, with `conversations` + `store` set, a second widget-box-shaped list view (`ConversationPanel`) behind a header toggle. The list view fully replaces the content area: no composer, no suggestions, one floating "New conversation" pill.',
        'This story pins a box-sized container (380×600, the `kai-dock` panel default) and a stub `ConversationStore` so the states below iterate fast — no build/pack/demo cycle needed to see a row or pill tweak.',
      ]),
    },
  },
  args: {
    messages: [],
    onSubmit: fn(),
    onConversationLoad: fn(),
    chatTitle: 'Support',
    placeholder: 'Message support…',
  },
  render: (args) => (
    <div class="h-[600px] w-[380px] overflow-hidden rounded-2xl border border-border">
      <ChatThread {...args} />
    </div>
  ),
} satisfies Meta<typeof ChatThread>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Chat view, the default state — the header toggle renders the chat-bubble glyph. */
export const ChatView: Story = {
  args: {
    conversations: true,
    store: stubStore(fixtureConversations),
  },
};

/** List view, populated: rows show a bold title, right-aligned relative time,
 *  and a truncated one-line last-message preview. The header toggle has
 *  swapped to a back arrow. */
export const ListViewPopulated: Story = {
  args: {
    conversations: true,
    store: stubStore(fixtureConversations),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const toggle = await waitFor(() => {
      const btn = canvasElement.querySelector<HTMLButtonElement>('[data-kai-conversations-toggle]');
      expect(btn).toBeTruthy();
      return btn!;
    });
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(canvasElement.querySelector('[data-conversation-id="conv-1"]')).toBeTruthy();
      expect(toggle).toHaveAttribute('aria-label', 'Back to chat');
    });
  },
};

/** List view, no conversations yet: the empty state plus the same floating pill. */
export const ListViewEmpty: Story = {
  args: {
    conversations: true,
    store: stubStore([]),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const toggle = await waitFor(() => {
      const btn = canvasElement.querySelector<HTMLButtonElement>('[data-kai-conversations-toggle]');
      expect(btn).toBeTruthy();
      return btn!;
    });
    await userEvent.click(toggle);
    await waitFor(() => expect(canvasElement.querySelector('[data-kai-new-conversation]')).toBeTruthy());
  },
};

/** Unread indicators (owner round, 2026-08-26): a header-toggle badge (any
 *  conversation other than the active one is unread) and, in the list, a
 *  trailing dot on each unread row. `conv-2`/`conv-3` are unread; `conv-1`
 *  is auto-selected as active on mount (most-recently-updated) and marked
 *  read for real via this story's `stubStore().markRead`. */
export const ListViewWithUnread: Story = {
  args: {
    conversations: true,
    store: stubStore(unreadFixtureConversations),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    // Chat view: the badge shows before the list is ever opened.
    await waitFor(() => {
      expect(canvasElement.querySelector('[data-kai-conversations-unread]')).toBeTruthy();
      expect(canvasElement.querySelector('[data-kai-conversations-toggle]')).toHaveAttribute('aria-label', 'Conversations (unread)');
    });
    await userEvent.click(canvasElement.querySelector<HTMLButtonElement>('[data-kai-conversations-toggle]')!);
    await waitFor(() => {
      expect(canvasElement.querySelector('[data-conversation-id="conv-2"]')).toHaveAttribute('data-unread', '');
      expect(canvasElement.querySelector('[data-conversation-id="conv-3"]')).toHaveAttribute('data-unread', '');
      // conv-1 is the auto-restored active conversation — not unread.
      expect(canvasElement.querySelector('[data-conversation-id="conv-1"]')).not.toHaveAttribute('data-unread');
    });
  },
};

/** Interactive playground: click the header toggle to swap between the chat
 *  view (bubble icon) and the list view (back arrow) freely. */
export const Playground: Story = {
  args: {
    conversations: true,
    store: stubStore(fixtureConversations),
  },
  render: (args: ChatThreadProps) => {
    const [store] = createSignal(stubStore(fixtureConversations));
    return (
      <div class="h-[600px] w-[380px] overflow-hidden rounded-2xl border border-border">
        <ChatThread {...args} store={store()} />
      </div>
    );
  },
};
