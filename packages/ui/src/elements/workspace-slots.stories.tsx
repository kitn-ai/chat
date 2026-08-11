import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onMount, onCleanup } from 'solid-js';
import { Sparkles } from 'lucide-solid';
import './chat-workspace';
import './card';
import { attachKaiActions } from '../stories/docs/story-actions';
import { textMessage } from '../state';
import type { ChatMessage } from './chat-types';
import type { ConversationSummary, ConversationGroup } from '../types';

// Labs: the kai-workspace injection slots. Three bounded holes the consumer
// fills with their own light-DOM markup:
//   • sidebar-header — top of the rail (brand / a kai-tabs strip)
//   • sidebar-footer — bottom of the rail (an upgrade card / Design trigger / user menu)
//   • main-header    — top of the main region (a top-placed banner / corner action)
// Each region renders ONLY when content is projected, so a plain <kai-workspace>
// is unchanged.

declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-workspace': JSX.HTMLAttributes<HTMLElement> & { 'sidebar-min-width'?: string | number; 'collapse-below'?: string | number };
      'kai-card': JSX.HTMLAttributes<HTMLElement> & {
        appearance?: 'outlined' | 'filled' | 'plain' | 'accent';
        orientation?: 'vertical' | 'horizontal' | 'responsive';
        collapse?: string;
        dense?: boolean;
        dismissible?: boolean;
        href?: string;
        target?: string;
        rel?: string;
        clickable?: boolean;
      };
    }
  }
}

type WorkspaceEl = HTMLElement & {
  groups?: ConversationGroup[];
  conversations?: ConversationSummary[];
  activeId?: string;
  messages?: ChatMessage[];
  chatTitle?: string;
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
const messages: ChatMessage[] = [
  textMessage('user', 'Can you summarize last quarter?', { id: '1' }),
  textMessage('assistant', 'Revenue was up 18% QoQ, driven by the self-serve tier.', {
    id: '2',
    actions: ['copy', 'like'],
  }),
];

const meta = {
  title: 'Labs/Workspace Slots',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function SlotsDemo() {
  let el: WorkspaceEl | undefined;
  let upgrade: HTMLElement | undefined;
  onMount(() => {
    if (el) {
      el.groups = groups;
      el.conversations = conversations;
      el.activeId = 'c1';
      el.messages = messages;
      el.chatTitle = 'Acme';
      onCleanup(attachKaiActions(el));
    }
    if (upgrade) onCleanup(attachKaiActions(upgrade)); // logs kai-card-click
  });
  return (
    <kai-workspace ref={(e) => (el = e as WorkspaceEl)} style={{ display: 'block', height: '100vh' }}>
      {/* sidebar-header: brand mark at the top of the rail. */}
      <div slot="sidebar-header" style="display:flex;align-items:center;gap:8px;padding:14px 16px;font:600 14px system-ui;color:var(--color-foreground)">
        <span style="color:var(--color-primary);display:flex"><Sparkles size={18} /></span> Acme
      </div>

      {/* main-header: a top-placed banner over the main region. */}
      <div slot="main-header" style="padding:8px 16px;font:13px/1.4 system-ui;color:var(--color-foreground);background:var(--color-surface)">
        You are on the free plan. <a href="#" style="color:var(--color-primary)">Upgrade for higher limits.</a>
      </div>

      {/* sidebar-footer: the upgrade card — a real, clickable kai-card. */}
      <kai-card
        slot="sidebar-footer"
        clickable
        dense
        ref={(e) => (upgrade = e as HTMLElement)}
        style="display:block;margin:10px"
      >
        <strong style="display:block;font-weight:600">Upgrade to Pro</strong>
        <p style="margin-top:0.25rem;font-size:0.8125rem;color:var(--color-muted-foreground)">Unlock Fable 5 and higher limits.</p>
      </kai-card>
    </kai-workspace>
  );
}

export const Slots: Story = {
  name: 'sidebar-header, sidebar-footer & main-header',
  render: () => <SlotsDemo />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-workspace>
  <!-- Top of the rail. -->
  <div slot="sidebar-header">Acme</div>

  <!-- Top of the main region (a banner / corner action). -->
  <div slot="main-header">You are on the free plan. <a href="#">Upgrade.</a></div>

  <!-- Bottom of the rail: an upgrade card, Design trigger, or user menu. -->
  <kai-card slot="sidebar-footer" clickable dense>
    <strong>Upgrade to Pro</strong>
    <p>Unlock higher limits.</p>
  </kai-card>
</kai-workspace>

<script type="module">
  const ws = document.querySelector('kai-workspace');
  ws.conversations = [/* ConversationSummary[] */];
  ws.messages = [/* ChatMessage[] */];

  // The card stays interactive while projected into the shadow slot.
  ws.querySelector('kai-card').addEventListener('kai-card-click', () => openBilling());
</script>`,
      },
    },
  },
};
