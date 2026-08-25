import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled, onCleanup } from 'solid-js';
import { LifeBuoy, Sparkles } from 'lucide-solid';
import './register'; // side effect: registers <kai-chat> et al.
import { attachKaiActions } from '../stories/docs/story-actions';
import { textMessage } from '../state';
import type { ChatMessage } from './chat-types';
import type { ConversationSummary, ConversationGroup } from '../types';

// Labs: the kai-chat composition slots. Each demo dogfoods REAL kai-* components
// and the kit's own theme tokens (var(--color-*)), so every region reads
// correctly in light AND dark; i.e. these double as working references you can
// copy. Slots accept ANY light-DOM markup; bespoke regions (the empty state, the
// fully-custom header/composer) stay hand-written but still use the kit tokens so
// they never look out of place.

declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-chat': JSX.HTMLAttributes<HTMLElement>;
      'kai-conversations': JSX.HTMLAttributes<HTMLElement> & { collapsed?: boolean; 'default-collapsed'?: boolean };
      'kai-empty': JSX.HTMLAttributes<HTMLElement> & { 'empty-title'?: string; description?: string };
      'kai-button': JSX.HTMLAttributes<HTMLElement> & { variant?: string; size?: string; icon?: string; 'icon-trailing'?: string; label?: string; disabled?: boolean; full?: boolean; align?: 'start' | 'center' | 'end' };
    }
  }
}

type ChatEl = HTMLElement & { messages?: ChatMessage[]; chatTitle?: string };
type ConversationsEl = HTMLElement & {
  groups?: ConversationGroup[];
  conversations?: ConversationSummary[];
  activeId?: string;
};

const thread: ChatMessage[] = [
  textMessage('user', 'Can you summarize last quarter?', { id: '1' }),
  textMessage(
    'assistant',
    'Revenue was up 18% QoQ, driven mostly by the self-serve tier. Want the breakdown by plan?',
    { id: '2', actions: ['copy', 'like', 'dislike'] },
  ),
];

// Sample data for the dogfooded <kai-conversations> sidebar.
const scope = { type: 'document' as const };
const convGroups: ConversationGroup[] = [
  { id: 'today', name: 'Today', sortOrder: 0, createdAt: '2026-06-26' },
  { id: 'earlier', name: 'Earlier', sortOrder: 1, createdAt: '2026-06-20' },
];
const convs: ConversationSummary[] = [
  { id: 'c1', title: 'Q3 forecast', groupId: 'today', scope, messageCount: 8, lastMessageAt: '2026-06-26T14:00:00Z', updatedAt: '2026-06-26T14:00:00Z' },
  { id: 'c2', title: 'Onboarding flow', groupId: 'today', scope, messageCount: 3, lastMessageAt: '2026-06-26T11:00:00Z', updatedAt: '2026-06-26T11:00:00Z' },
  { id: 'c3', title: 'Pricing page copy', groupId: 'earlier', scope, messageCount: 5, lastMessageAt: '2026-06-20T09:00:00Z', updatedAt: '2026-06-20T09:00:00Z' },
];

const meta = {
  title: 'Labs/Chat Slots',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj;

// ── 1. INJECT: your content added into regions (sidebar + composer-actions +
//      footer), alongside the built-in header and the default composer. The
//      sidebar dogfoods the real <kai-conversations>; the action is a themed
//      <kai-button>; the footer is your own light-DOM, on kit tokens. ──────────
function InjectDemo() {
  let el: ChatEl | undefined;
  let convEl: ConversationsEl | undefined;
  // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
  // and register them once at the owner scope (same lifecycle as 1.x).
  const settledDisposers: (() => void)[] = [];
  onCleanup(() => { for (const d of settledDisposers) d(); });
  onSettled(() => {
    if (el) {
      el.messages = thread;
      el.chatTitle = 'Acme Support';
      // Log every event the chat shell declares (kai-submit, kai-value-change, …).
      settledDisposers.push(attachKaiActions(el));
    }
    if (convEl) {
      convEl.groups = convGroups;
      convEl.conversations = convs;
      convEl.activeId = 'c1';
      // Log every event the sidebar declares (kai-conversation-select, kai-new-chat, …).
      settledDisposers.push(attachKaiActions(convEl));
    }
  });
  return (
    <kai-chat ref={(e) => (el = e as ChatEl)} style={{ display: 'block', height: '100vh' }}>
      {/* Inject the real conversation-history sidebar, set its data as JS props. */}
      <kai-conversations slot="sidebar" ref={(e) => (convEl = e as ConversationsEl)} style={{ display: 'block', height: '100%' }} />
      {/* A custom composer action (a themed kai-button) works in light + dark. */}
      <kai-button slot="composer-actions" variant="subtle" icon="sparkles"
        // V2-PORT: refs are unowned in v2, so an onSettled here can neither call
        // onCleanup nor return a cleanup (SETTLED_CLEANUP_UNOWNED throws at
        // flush). Push the teardown into the component-scope disposers instead.
        ref={(e) => onSettled(() => { settledDisposers.push(attachKaiActions(e)); })}>Improve prompt</kai-button>
      <footer slot="footer" style="font:12px/1.4 system-ui;color:var(--color-muted-foreground);text-align:center;padding:4px">
        Acme may make mistakes. <a href="#" style="color:var(--color-foreground)">Verify important info</a>.
      </footer>
    </kai-chat>
  );
}
export const Inject: Story = {
  name: 'Add a sidebar, action & footer',
  render: () => <InjectDemo />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-chat>
  <kai-conversations slot="sidebar"></kai-conversations>
  <kai-button slot="composer-actions" variant="subtle" icon="sparkles">Improve prompt</kai-button>
  <footer slot="footer">Acme may make mistakes. <a href="#">Verify important info</a>.</footer>
</kai-chat>

<script type="module">
  const chat = document.querySelector('kai-chat');
  chat.messages = [/* ChatMessage[] */];

  // Array/object props are set as JS properties, never attributes.
  const list = document.querySelector('kai-conversations');
  list.groups = [/* ConversationGroup[] */];
  list.conversations = [/* ConversationSummary[] */];
  list.activeId = 'c1';
  list.addEventListener('kai-conversation-select', (e) => console.log(e.detail));
</script>`,
      },
    },
  },
};

// ── 2. REPLACE (empty): a custom zero-state. The component owns WHEN it shows
//      (messages.length === 0); the consumer owns WHAT it is. Dogfoods the kit's
//      own <kai-empty> block (icon via slot="media", a CTA in the default slot)
//      rather than re-rolling an empty state by hand. ─────────────────────────
function EmptyDemo() {
  let el: ChatEl | undefined;
  // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
  // and register them once at the owner scope (same lifecycle as 1.x).
  const settledDisposers2: (() => void)[] = [];
  onCleanup(() => { for (const d of settledDisposers2) d(); });
  onSettled(() => {
    if (!el) return;
    el.messages = [];
    settledDisposers2.push(attachKaiActions(el)); // log kai-chat's events to the Actions panel
  });
  return (
    <kai-chat ref={(e) => (el = e as ChatEl)} style={{ display: 'block', height: '100vh' }}>
      <kai-empty
        slot="empty"
        empty-title="How can we help?"
        description="Ask about billing, your account, or anything else. A human is one click away."
      >
        <span slot="media"><LifeBuoy size={28} /></span>
        <kai-button variant="default"
          // V2-PORT: unowned ref — see the Inject story's kai-button note.
          ref={(e) => onSettled(() => { settledDisposers2.push(attachKaiActions(e)); })}>Talk to a person</kai-button>
      </kai-empty>
    </kai-chat>
  );
}
export const EmptyState: Story = {
  name: 'Custom empty state',
  render: () => <EmptyDemo />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-chat>
  <!-- Your zero-state, shown by the component whenever messages is empty.
       Dogfood <kai-empty> instead of hand-rolling the block. -->
  <kai-empty slot="empty" empty-title="How can we help?"
             description="Ask about billing, your account, or anything else.">
    <svg slot="media"><!-- your icon --></svg>
    <kai-button>Talk to a person</kai-button>
  </kai-empty>
</kai-chat>

<script type="module">
  document.querySelector('kai-chat').messages = []; // empty → the slot shows
</script>`,
      },
    },
  },
};

// ── 3. REPLACE (header + composer): a full custom header AND a custom composer
//      form. This is the DATA-FLOW WALL: a slotted <form> can't read the
//      component's reactive state, so it owns its own submit and drives the
//      thread by setting the `messages` property (a fresh array ref). Bespoke
//      markup, but on kit tokens so it's not stranded in light mode. ──────────
let nextId = 100;
function ReplaceDemo() {
  let el: ChatEl | undefined;
  let input: HTMLInputElement | undefined;
  // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
  // and register them once at the owner scope (same lifecycle as 1.x).
  const settledDisposers3: (() => void)[] = [];
  onCleanup(() => { for (const d of settledDisposers3) d(); });
  onSettled(() => {
    if (!el) return;
    el.messages = thread;
    settledDisposers3.push(attachKaiActions(el)); // log kai-chat's events to the Actions panel
  });
  const send = (e: Event) => {
    e.preventDefault();
    const text = input?.value.trim();
    if (!text || !el) return;
    // Consumer owns the composer behavior end-to-end: append to the thread.
    el.messages = [...(el.messages ?? []), textMessage('user', text, { id: `m${nextId++}` })];
    if (input) input.value = '';
  };
  return (
    <kai-chat ref={(e) => (el = e as ChatEl)} style={{ display: 'block', height: '100vh' }}>
      <div slot="header" style="display:flex;align-items:center;gap:10px;padding:0 16px;height:56px;background:var(--color-surface);border-bottom:1px solid var(--color-border);color:var(--color-foreground);font:600 15px system-ui">
        <span style="color:var(--color-primary);display:flex;flex-shrink:0"><Sparkles size={20} /></span> Concierge, fully custom header
      </div>
      <form slot="composer" onSubmit={send} style="display:flex;gap:8px;padding:10px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface)">
        <input ref={(e) => (input = e as HTMLInputElement)} placeholder="Your own <form> owns submit…" style="flex:1;border:0;background:transparent;font:14px system-ui;outline:none;color:var(--color-foreground)" />
        <button type="submit" data-testid="custom-send" style="padding:8px 16px;border-radius:10px;border:0;background:var(--color-primary);color:var(--color-primary-foreground);font:600 13px system-ui;cursor:pointer">Send</button>
      </form>
    </kai-chat>
  );
}
export const ReplaceComposer: Story = {
  name: 'Replace the header & composer',
  render: () => <ReplaceDemo />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-chat>
  <div slot="header">Concierge, fully custom header</div>
  <form slot="composer">
    <input placeholder="Your own <form> owns submit…" />
    <button type="submit">Send</button>
  </form>
</kai-chat>

<script type="module">
  const chat = document.querySelector('kai-chat');
  chat.messages = [/* ChatMessage[] */];

  // A slotted form can't read the component's reactive state; it owns submit
  // and drives the thread by assigning a fresh messages array.
  document.querySelector('form[slot="composer"]').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    chat.messages = [...chat.messages, { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: input.value }] }];
    input.value = '';
  });
</script>`,
      },
    },
  },
};

// ── Drop-in baseline: NO slots projected. The shell must render exactly as it
//    did before slots existed (regression guard). ─────────────────────────────
function DropInDemo() {
  let el: ChatEl | undefined;
  // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
  // and register them once at the owner scope (same lifecycle as 1.x).
  const settledDisposers4: (() => void)[] = [];
  onCleanup(() => { for (const d of settledDisposers4) d(); });
  onSettled(() => {
    if (!el) return;
    el.messages = thread;
    settledDisposers4.push(attachKaiActions(el)); // log kai-chat's events to the Actions panel
  });
  return <kai-chat ref={(e) => (el = e as ChatEl)} style={{ display: 'block', height: '100vh' }} />;
}
export const DropIn: Story = {
  name: 'Defaults (no slots)',
  render: () => <DropInDemo />,
  parameters: {
    docs: {
      source: {
        language: 'html',
        code: `<kai-chat></kai-chat>

<script type="module">
  // No slots projected: the shell renders its built-in header + composer.
  document.querySelector('kai-chat').messages = [/* ChatMessage[] */];
</script>`,
      },
    },
  },
};
