import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { createSignal, For } from 'solid-js';
import '../elements/register'; // side effect: registers kai-menu for the slotted rows' kebab
import type { KaiMenuItem } from '../elements/menu';
import { ConversationItem, SlottedConversationItem } from './conversation-item';
import { componentDescription } from '../stories/docs/element-controls';

// kai-menu is used as a JSX element below; the tag is declared (identically) by
// sibling story files. TypeScript merges identical global augmentations, so this
// is copied byte-for-byte from the canonical sibling decls (mismatch errors TS2717).
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-menu': JSX.HTMLAttributes<HTMLElement> & { theme?: string; 'trigger-icon'?: string; 'trigger-label'?: string; 'trigger-icon-trailing'?: string; label?: string };
    }
  }
}

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

const initialSlottedRows = [
  { id: 'c1', title: 'Quarterly report', meta: '2h ago' },
  { id: 'c2', title: 'Support triage', meta: 'yesterday' },
  { id: 'c3', title: 'Roadmap draft', meta: '3d ago' },
];

// The per-row kebab menu: the kit's own kai-menu (composition, not a bespoke
// popover). Leaf ids are the action verbs the kai-select handler switches on.
const ROW_MENU_ITEMS: KaiMenuItem[] = [
  { id: 'rename', label: 'Rename', icon: 'pencil' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { separator: true },
  { id: 'delete', label: 'Delete', icon: 'x' },
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
 *  click handler on the list, not a wrapper div per row; the guard mirroring the
 *  container contract (a click inside the menu region never selects the row) is
 *  the `data-kai-item-menu` closest() check. This story is the axe evidence for
 *  the shape, and the kebab is a WORKING kai-menu: Rename retitles the row,
 *  Archive moves it to the end, Delete removes it. */
export const SlottedRows: StoryObj = {
  render: () => {
    const [rows, setRows] = createSignal(initialSlottedRows);
    const [active, setActive] = createSignal('c2');
    const applyAction = (action: string, id: string) => {
      if (action === 'rename') {
        // BOTH a fresh array and a fresh object for the changed row: the <For>
        // is reference-keyed, so an unchanged object is never re-rendered.
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, title: `${r.title} (renamed)` } : r)));
      } else if (action === 'archive') {
        setRows((prev) => {
          const row = prev.find((r) => r.id === id);
          return row ? [...prev.filter((r) => r.id !== id), { ...row, meta: 'archived' }] : prev;
        });
      } else if (action === 'delete') {
        setRows((prev) => prev.filter((r) => r.id !== id));
      }
    };
    return (
      <div
        role="list"
        aria-label="Conversations"
        class="w-72"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          // A click in the menu region (the kebab or its open menu) must never
          // also select the row — the same guard the kai-conversations
          // container keys off data-kai-item-menu.
          if (target.closest('[data-kai-item-menu]')) return;
          const row = target.closest('[data-conversation-id]');
          if (row) setActive(row.getAttribute('data-conversation-id')!);
        }}
      >
        <For each={rows()}>
          {(row) => (
            <SlottedConversationItem
              conversationId={row.id}
              active={active() === row.id}
              meta={<span>{row.meta}</span>}
              menu={
                <kai-menu
                  label={`Actions for ${row.title}`}
                  ref={(el) => {
                    (el as HTMLElement & { items?: KaiMenuItem[] }).items = ROW_MENU_ITEMS;
                    el.addEventListener('kai-select', (e) => {
                      applyAction((e as CustomEvent<{ id: string }>).detail.id, row.id);
                    });
                  }}
                >
                  {/* Trigger content is NON-interactive: kai-menu supplies the
                      focusable button (with the accessible name from `label`). */}
                  <span slot="trigger" aria-hidden="true">&#8942;</span>
                </kai-menu>
              }
            >
              {row.title}
            </SlottedConversationItem>
          )}
        </For>
      </div>
    );
  },
  // The kebab really works: open the first row's menu from its trigger, close it
  // with Escape (focus returns to the trigger), then reopen and Rename — the row
  // title visibly changes. Everything lives in kai-menu's shadow root, so the
  // assertions pierce it.
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const menuHost = canvasElement.querySelector('kai-menu') as HTMLElement | null;
    expect(menuHost).toBeTruthy();
    const shadow = menuHost!.shadowRoot!;
    const trigger = shadow.querySelector<HTMLElement>('button');
    expect(trigger).toBeTruthy();

    // Open (pointer), arrow onto an item, Escape closes back to the trigger.
    await userEvent.click(trigger!);
    await waitFor(() => expect(shadow.querySelector('[role="menu"]')).toBeTruthy());
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => {
      const focused = shadow.activeElement as HTMLElement | null;
      expect(focused?.getAttribute('role')).toBe('menuitem');
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(shadow.querySelector('[role="menu"]')).toBeNull();
      expect(shadow.activeElement).toBe(trigger);
    });

    // Reopen and Rename: the row retitles visibly.
    await userEvent.click(trigger!);
    await waitFor(() => expect(shadow.querySelector('[role="menu"]')).toBeTruthy());
    const rename = [...shadow.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
      el.textContent?.includes('Rename'),
    );
    expect(rename).toBeTruthy();
    await userEvent.click(rename!);
    await waitFor(() => expect(canvasElement.textContent).toContain('Quarterly report (renamed)'));
  },
  ...src(`<div role="list" aria-label="Conversations" onClick={selectUnlessInMenu}>
  <For each={threads()}>
    {(t) => (
      <SlottedConversationItem
        conversationId={t.id}
        active={activeId() === t.id}
        meta={<span>{t.lastReplyAgo}</span>}
        menu={
          <kai-menu
            label={\`Actions for \${t.title}\`}
            ref={(el) => {
              el.items = [
                { id: 'rename', label: 'Rename', icon: 'pencil' },
                { id: 'archive', label: 'Archive', icon: 'archive' },
                { separator: true },
                { id: 'delete', label: 'Delete', icon: 'x' },
              ];
              el.addEventListener('kai-select', (e) => applyAction(e.detail.id, t.id));
            }}
          >
            <span slot="trigger" aria-hidden="true">&#8942;</span>
          </kai-menu>
        }
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
