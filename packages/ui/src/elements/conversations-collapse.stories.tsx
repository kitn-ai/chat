import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled, onCleanup } from 'solid-js';
import './conversation-list';
import { attachKaiActions } from '../stories/docs/story-actions';
import type { ConversationSummary, ConversationGroup } from '../types';

// Labs: rail collapse on the standalone <kai-conversations>. Collapsed shrinks
// the whole rail to a floating reopen button (the same fallback kai-workspace
// renders). Drive it with the `collapsed` property + the `kai-collapse-toggle`
// event, or call collapse() / expand() / toggle().

type ConvEl = HTMLElement & {
  groups?: ConversationGroup[];
  conversations?: ConversationSummary[];
  activeId?: string;
  collapse(): void;
  expand(): void;
  toggle(): void;
};

const scope = { type: 'document' as const };
const groups: ConversationGroup[] = [
  { id: 'today', name: 'Today', sortOrder: 0, createdAt: '2026-06-26' },
  { id: 'earlier', name: 'Earlier', sortOrder: 1, createdAt: '2026-06-20' },
];
const conversations: ConversationSummary[] = [
  { id: 'c1', title: 'Q3 forecast', groupId: 'today', scope, messageCount: 8, lastMessageAt: '2026-06-26T14:00:00Z', updatedAt: '2026-06-26T14:00:00Z' },
  { id: 'c2', title: 'Onboarding flow', groupId: 'today', scope, messageCount: 3, lastMessageAt: '2026-06-26T11:00:00Z', updatedAt: '2026-06-26T11:00:00Z' },
  { id: 'c3', title: 'Pricing page copy', groupId: 'earlier', scope, messageCount: 5, lastMessageAt: '2026-06-20T09:00:00Z', updatedAt: '2026-06-20T09:00:00Z' },
];

const meta = {
  title: 'Labs/Conversations Collapse',
} satisfies Meta;
export default meta;
type Story = StoryObj;

function CollapseDemo() {
  let el: ConvEl | undefined;
  // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
  // and register them once at the owner scope (same lifecycle as 1.x).
  const settledDisposers: (() => void)[] = [];
  onCleanup(() => { for (const d of settledDisposers) d(); });
  onSettled(() => {
    if (!el) return;
    el.groups = groups;
    el.conversations = conversations;
    el.activeId = 'c1';
    settledDisposers.push(attachKaiActions(el)); // log kai-conversation-select, kai-collapse-toggle, …
  });
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.75rem', padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <DemoButton onClick={() => el?.collapse()}>collapse()</DemoButton>
        <DemoButton onClick={() => el?.expand()}>expand()</DemoButton>
        <DemoButton onClick={() => el?.toggle()}>toggle()</DemoButton>
      </div>
      <div
        style={{
          width: '280px',
          height: '420px',
          border: '1px solid var(--color-border)',
          'border-radius': '0.75rem',
          overflow: 'hidden',
          background: 'var(--color-background)',
        }}
      >
        <kai-conversations ref={(e) => (el = e as ConvEl)} style={{ display: 'block', height: '100%' }} />
      </div>
    </div>
  );
}

export const Collapse: Story = {
  name: 'Rail collapse',
  render: () => <CollapseDemo />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-conversations></kai-conversations>

<script type="module">
  const rail = document.querySelector('kai-conversations');
  rail.groups = [/* ConversationGroup[] */];
  rail.conversations = [/* ConversationSummary[] */];

  // Methods: collapse() / expand() / toggle().
  rail.collapse(); // shrinks to a floating reopen button

  // Event: kai-collapse-toggle fires on every change.
  rail.addEventListener('kai-collapse-toggle', (e) => console.log(e.detail.collapsed));

  // Or drive it controlled: rail.collapsed = true; (update on the event)
  // Plain HTML: <kai-conversations default-collapsed> to start collapsed.
</script>`,
      },
    },
  },
};

// Start collapsed via the uncontrolled `default-collapsed` attribute.
function DefaultCollapsedDemo() {
  let el: ConvEl | undefined;
  // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
  // and register them once at the owner scope (same lifecycle as 1.x).
  const settledDisposers2: (() => void)[] = [];
  onCleanup(() => { for (const d of settledDisposers2) d(); });
  onSettled(() => {
    if (!el) return;
    el.groups = groups;
    el.conversations = conversations;
    settledDisposers2.push(attachKaiActions(el));
  });
  return (
    <div
      style={{
        width: '280px',
        height: '420px',
        border: '1px solid var(--color-border)',
        'border-radius': '0.75rem',
        overflow: 'hidden',
        background: 'var(--color-background)',
        margin: '1rem',
      }}
    >
      <kai-conversations default-collapsed ref={(e) => (el = e as ConvEl)} style={{ display: 'block', height: '100%' }} />
    </div>
  );
}

export const DefaultCollapsed: Story = {
  name: 'Start collapsed (default-collapsed)',
  render: () => <DefaultCollapsedDemo />,
};

function DemoButton(props: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        height: '2rem',
        padding: '0 0.75rem',
        'border-radius': '0.5rem',
        border: '1px solid var(--color-border)',
        background: 'var(--color-card)',
        color: 'var(--color-foreground)',
        font: '500 0.8125rem system-ui',
        cursor: 'pointer',
      }}
    >
      {props.children}
    </button>
  );
}
