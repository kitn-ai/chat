import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onMount, onCleanup } from 'solid-js';
import { Sparkles } from 'lucide-solid';
import './chat-workspace';
import './conversation-list';
import './chat';
import './card';
import { attachKaiActions } from '../stories/docs/story-actions';
import { textMessage } from '../state';
import type { ChatMessage } from './chat-types';
import type { ConversationSummary, ConversationGroup } from '../types';

// Labs: the re-cast kai-workspace shell slots. Five bounded regions the
// consumer fills with their own light-DOM markup:
//   • header — the top band across the full shell width (app bar, banner)
//   • start  — the inline-start aside (here: a kai-conversations rail)
//   • main   — the main region (here: a kai-chat; unnamed children land here)
//   • end    — the inline-end aside (inspector, notes)
//   • footer — the bottom band (status bar, disclaimers)
// The shell owns arrangement only: resize handles, collapse-below, the mobile
// drawer. Every chat prop and chat event lives on the parts themselves.

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

type El = HTMLElement & Record<string, unknown>;

function SlotsDemo() {
  let ws: El | undefined;
  let rail: El | undefined;
  let chat: El | undefined;
  onMount(() => {
    if (rail) {
      rail.groups = groups;
      rail.conversations = conversations;
      rail.activeId = 'c1';
    }
    if (chat) {
      chat.messages = messages;
      chat.chatTitle = 'Acme';
    }
    if (ws) {
      // Set as a property: the generated attribute typings regenerate with the
      // supervisor's build:api pass, and properties are the contract anyway.
      ws.drawerBelow = 560;
      onCleanup(attachKaiActions(ws)); // logs kai-aside-toggle / kai-aside-resize
    }
  });
  return (
    <kai-workspace ref={(e) => (ws = e as El)} collapse-below="720" style={{ display: 'block', height: '100vh' }}>
      {/* header: brand band across the full shell width. */}
      <div slot="header" style="display:flex;align-items:center;gap:8px;padding:10px 16px;font:600 14px system-ui;color:var(--color-foreground)">
        <span style="color:var(--color-primary);display:flex"><Sparkles size={18} /></span> Acme
      </div>

      {/* start: the conversation rail is a PART in a slot, driven by its own props. */}
      <kai-conversations slot="start" ref={(e) => (rail = e as El)} style="display:block;height:100%"></kai-conversations>

      {/* main: unnamed children land in the main region. */}
      <kai-chat ref={(e) => (chat = e as El)} style="display:block;height:100%"></kai-chat>

      {/* end: an inspector aside; anything goes, the shell never reads it. */}
      <div slot="end" style="padding:14px 16px;font:13px/1.5 system-ui;color:var(--color-muted-foreground)">
        <strong style="display:block;color:var(--color-foreground);font-weight:600">Notes</strong>
        <p style="margin-top:0.5rem">Pin research, files, or a preview here.</p>
      </div>

      {/* footer: status band. */}
      <div slot="footer" style="padding:6px 16px;font:12px system-ui;color:var(--color-muted-foreground)">
        Acme can make mistakes. Check important info.
      </div>
    </kai-workspace>
  );
}

export const Slots: Story = {
  name: 'header, start, main, end & footer',
  render: () => <SlotsDemo />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-workspace collapse-below="720" drawer-below="560">
  <!-- header: the top band across the full shell width. -->
  <div slot="header">Acme</div>

  <!-- start: the rail is a part in a slot, driven by its own props/events. -->
  <kai-conversations slot="start"></kai-conversations>

  <!-- main: unnamed children land in the main region. -->
  <kai-chat></kai-chat>

  <!-- end: an inspector aside. -->
  <div slot="end">Notes</div>

  <!-- footer: the bottom band. -->
  <div slot="footer">Acme can make mistakes.</div>
</kai-workspace>

<script type="module">
  // Chat props/events live on the parts now, not on the shell.
  const rail = document.querySelector('kai-conversations');
  rail.conversations = [/* ConversationSummary[] */];
  rail.addEventListener('kai-conversation-select', (e) => loadThread(e.detail.id));

  const chat = document.querySelector('kai-chat');
  chat.messages = [/* ChatMessage[] */];
  chat.addEventListener('kai-submit', (e) => send(e.detail.value));

  // The shell fires layout events only.
  const ws = document.querySelector('kai-workspace');
  ws.addEventListener('kai-aside-toggle', (e) => console.log(e.detail));
</script>`,
      },
    },
  },
};
