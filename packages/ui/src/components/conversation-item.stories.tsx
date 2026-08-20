import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { createSignal, For } from 'solid-js';
import { ConversationItem, SlottedConversationItem } from './conversation-item';
import { componentDescription } from '../stories/docs/element-controls';

const baseConversation = {
  id: '1',
  title: 'How to use SolidJS signals',
  messageCount: 8,
  lastMessageAt: '2026-04-10T12:00:00Z',
  updatedAt: '2026-04-10T12:00:00Z',
  scope: { type: 'document' as const },
};

/**
 * A single selectable row in a conversation/chat list: title plus a message
 * count, with an active (selected) state.
 */
const meta = {
  title: 'Components/Elements/ConversationItem',
  component: ConversationItem,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A single conversation row for a history sidebar: title (truncated) and message count, with a highlighted active state. Pass a `conversation` summary, an `isActive` flag, and `onSelect(id)`. Usually rendered for you by `ConversationList`; use it directly for a custom list.',
      ]),
      controls: { exclude: ['use:eventListener'] },
    },
  },
  argTypes: {
    conversation: {
      control: 'object',
      description: 'The conversation summary (id, title, messageCount, scope, timestamps).',
    },
    isActive: {
      control: 'boolean',
      description: 'Whether this row is the currently selected conversation.',
    },
    onSelect: {
      action: 'select',
      description: 'Fired with the conversation id when the row is clicked.',
      table: { category: 'Events' },
    },
  },
  args: {
    conversation: baseConversation,
    isActive: false,
    onSelect: fn(),
  },
  render: (args) => (
    <div class="w-64">
      <ConversationItem {...args} />
    </div>
  ),
} satisfies Meta<typeof ConversationItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { ConversationItem } from '@kitn.ai/ui';
import type { ConversationSummary } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: toggle `isActive` and edit the conversation object. */
export const Playground: Story = {
  ...src(`const conversation: ConversationSummary = {
  id: '1',
  title: 'How to use SolidJS signals',
  messageCount: 8,
  scope: { type: 'document' },
  lastMessageAt: '2026-04-10T12:00:00Z',
  updatedAt: '2026-04-10T12:00:00Z',
};

<ConversationItem
  conversation={conversation}
  isActive={false}
  onSelect={(id) => setActiveId(id)}
/>`),
};

export const Active: Story = {
  args: { isActive: true },
  ...src(`<ConversationItem conversation={conversation} isActive onSelect={(id) => {}} />`),
};

export const Inactive: Story = {
  args: { isActive: false },
  ...src(`<ConversationItem conversation={conversation} isActive={false} onSelect={(id) => {}} />`),
};

export const LongTitle: Story = {
  args: {
    conversation: {
      ...baseConversation,
      title: 'This is a very long conversation title that should be truncated with an ellipsis',
    },
  },
  ...src(`<ConversationItem
  conversation={{ ...conversation, title: 'A very long title…' }}
  isActive={false}
  onSelect={(id) => {}}
/>`),
};

/** Several items stacked, one active (showcase). */
export const MultipleItems: Story = {
  render: (args: { onSelect: (id: string) => void }) => (
    <div class="w-64 space-y-0.5">
      <ConversationItem
        conversation={{ ...baseConversation, id: '1', title: 'SolidJS reactive primitives' }}
        isActive={true}
        onSelect={args.onSelect}
      />
      <ConversationItem
        conversation={{ ...baseConversation, id: '2', title: 'TypeScript generics guide', messageCount: 12 }}
        isActive={false}
        onSelect={args.onSelect}
      />
      <ConversationItem
        conversation={{ ...baseConversation, id: '3', title: 'Tailwind CSS tips and tricks', messageCount: 3 }}
        isActive={false}
        onSelect={args.onSelect}
      />
    </div>
  ),
  ...src(`<div class="space-y-0.5">
  <ConversationItem conversation={c1} isActive onSelect={onSelect} />
  <ConversationItem conversation={c2} isActive={false} onSelect={onSelect} />
  <ConversationItem conversation={c3} isActive={false} onSelect={onSelect} />
</div>`),
};

// ── The slotted-item shape (spec 2026-08-20 § 2a) ───────────────────────────
// Rendered by <kai-conversation-item>: regions, not a ConversationSummary. This
// story is the human-inspectable companion of the two real-Chromium probes
// (scripts/probe-conversation-item-focus-order.mjs and -slotchange.mjs), which
// drive the element pair directly.

const slottedRows = [
  { id: 'c1', title: 'Quarterly report', meta: '2h ago' },
  { id: 'c2', title: 'Support triage', meta: 'yesterday' },
  { id: 'c3', title: 'Roadmap draft', meta: '3d ago' },
];

/** The consumer-owned loop: your records, your rows, your menu.
 *
 *  The rows sit inside a `role="list"` container, each row a listitem holding
 *  a `role="button"` body (`aria-current` marks the active one) with the menu
 *  button as the body's tabbable SIBLING — the ratified 2026-08-20 sibling
 *  restructure, nav.tsx TrailingActions precedent. NOT listbox/option: axe
 *  `nested-interactive` bans focusable descendants of a control, and
 *  `aria-required-children` lets a listbox subtree own nothing but options,
 *  which outlaws a sibling menu anywhere inside one. Selection is one delegated
 *  click handler on the list, not a wrapper div per row. This story is the axe
 *  evidence for the shape. */
export const SlottedRows: StoryObj = {
  render: () => {
    const [active, setActive] = createSignal('c2');
    return (
      <div
        role="list"
        aria-label="Conversations"
        class="w-72"
        onClick={(e) => {
          const row = (e.target as HTMLElement).closest('[data-conversation-id]');
          if (row) setActive(row.getAttribute('data-conversation-id')!);
        }}
      >
        <For each={slottedRows}>
          {(row) => (
            <SlottedConversationItem
              conversationId={row.id}
              active={active() === row.id}
              meta={<span>{row.meta}</span>}
              menu={<button aria-label={`Actions for ${row.title}`}>&#8942;</button>}
            >
              {row.title}
            </SlottedConversationItem>
          )}
        </For>
      </div>
    );
  },
  ...src(`<div role="list" aria-label="Conversations">
  <For each={threads}>
    {(t) => (
      <SlottedConversationItem
        conversationId={t.id}
        active={activeId() === t.id}
        meta={<span>{t.lastReplyAgo}</span>}
        menu={<MyThreadMenu thread={t} />}
      >
        {t.title}
      </SlottedConversationItem>
    )}
  </For>
</div>`),
};

/** Leading region plus the compact density. The `role="list"` wrapper keeps
 *  the rows' listitem semantics (and the container's aria-label legal). */
export const SlottedWithLeading: StoryObj = {
  render: () => (
    <div role="list" aria-label="Conversations" class="w-72 space-y-0.5">
      <SlottedConversationItem
        conversationId="c1"
        leading={<span aria-hidden="true">#</span>}
        meta={<span>12 messages</span>}
      >
        Channel-style row
      </SlottedConversationItem>
      <SlottedConversationItem conversationId="c2" active compact>
        Compact active row
      </SlottedConversationItem>
    </div>
  ),
  ...src(`<div role="list" aria-label="Conversations">
  <SlottedConversationItem conversationId="c1" leading={<Hash />} meta={<span>12 messages</span>}>
    Channel-style row
  </SlottedConversationItem>
  <SlottedConversationItem conversationId="c2" active compact>
    Compact active row
  </SlottedConversationItem>
</div>`),
};
