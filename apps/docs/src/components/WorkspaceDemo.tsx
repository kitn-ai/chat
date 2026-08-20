/** Live demo for the Workspace example page. Mounts the <kai-workspace> layout
 *  shell with <kai-conversations> slotted into `start` and <kai-chat> in the
 *  main region, then drives each part directly — the rail gets the conversation
 *  list, the chat gets the active thread, and a canned streaming reply plays on
 *  submit. Same approach as ChatDemo, plus the rail wiring. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

// Minimal local types so we don't need to import from the kit bundle at
// island build time — the real types are identical.
interface MessagePart {
  type: 'text';
  text: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  actions?: string[];
}

interface ConversationSummary {
  id: string;
  title: string;
  scope: { type: 'document' | 'collection' };
  messageCount: number;
  lastMessageAt: string;
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Sample data
// --------------------------------------------------------------------------

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

const CONVERSATIONS: ConversationSummary[] = [
  {
    id: 'c1',
    title: 'SolidJS reactivity vs React hooks',
    scope: { type: 'collection' },
    messageCount: 4,
    lastMessageAt: daysAgo(0),
    updatedAt: daysAgo(0),
  },
  {
    id: 'c2',
    title: 'Astro island architecture',
    scope: { type: 'collection' },
    messageCount: 6,
    lastMessageAt: daysAgo(0),
    updatedAt: daysAgo(0),
  },
  {
    id: 'c3',
    title: 'Tailwind CSS v4 migration',
    scope: { type: 'collection' },
    messageCount: 3,
    lastMessageAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },
  {
    id: 'c4',
    title: 'Web component Shadow DOM gotchas',
    scope: { type: 'collection' },
    messageCount: 8,
    lastMessageAt: daysAgo(5),
    updatedAt: daysAgo(5),
  },
];

// Threads keyed by conversation id.
const THREADS: Record<string, ChatMessage[]> = {
  c1: [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Can you explain how SolidJS reactivity differs from React hooks?' }],
    },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'SolidJS uses **fine-grained signals**: components run exactly once, and only the specific DOM expressions that read a signal re-evaluate when it changes.\n\nReact hooks re-run the *entire* component function on each render, then a virtual DOM diff patches the real DOM. SolidJS skips the virtual DOM entirely — updates are direct and surgical.',
        },
      ],
      actions: ['copy', 'like', 'dislike'],
    },
  ],
  c2: [
    {
      id: 'u2',
      role: 'user',
      parts: [{ type: 'text', text: 'How does Astro island architecture keep the page fast?' }],
    },
    {
      id: 'a2',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Astro ships **zero JS by default**. Interactive components ("islands") are hydrated independently — only the JS for each island loads, and only when needed (`client:visible`, `client:idle`, etc.). The rest of the page is static HTML.',
        },
      ],
      actions: ['copy', 'like', 'dislike'],
    },
  ],
  c3: [
    {
      id: 'u3',
      role: 'user',
      parts: [{ type: 'text', text: 'What are the biggest breaking changes in Tailwind CSS v4?' }],
    },
    {
      id: 'a3',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: "Tailwind v4 moves configuration from `tailwind.config.js` to CSS `@theme` blocks. The `@apply` directive still works, but the utility class names are now generated from CSS variables. Most projects need a codemod run — `npx @tailwindcss/upgrade` handles the common cases automatically.",
        },
      ],
      actions: ['copy', 'like', 'dislike'],
    },
  ],
  c4: [
    {
      id: 'u4',
      role: 'user',
      parts: [{ type: 'text', text: 'What are the trickiest Shadow DOM gotchas when building web components?' }],
    },
    {
      id: 'a4',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: "A few to watch for:\n\n1. **Global CSS doesn't pierce Shadow DOM** — only inherited properties and CSS custom properties cross the boundary.\n2. **`document.querySelector` won't find elements inside a shadow root** — use `el.shadowRoot.querySelector`.\n3. **Form association** requires `ElementInternals` + `formAssociated = true`.\n4. **Slot assignment** is eager — slotted children render immediately even if you didn't expect them.",
        },
      ],
      actions: ['copy', 'like', 'dislike'],
    },
  ],
};

const DEFAULT_REPLY =
  "That's a great follow-up. The short answer:\n\n- The pattern scales well once you internalize the mental model.\n- Reach for the prop-driven API first; drop to primitives only when you need the extra control.\n- The docs' **Compose your own** guide covers the next level of customization.\n\nSend another message to keep the thread going.";

let uid = 0;
const nextId = () => `m${++uid}`;

// --------------------------------------------------------------------------

type ElementHost = HTMLElement & { [k: string]: unknown };

export default function WorkspaceDemo() {
  let rail: ElementHost | undefined;
  let chat: ElementHost | undefined;
  let shell: ElementHost | undefined;
  const [, setReady] = createSignal(false);
  let timer: number | undefined;

  const theme = () => document.documentElement.dataset.theme ?? 'light';

  // Current active conversation id (local state so we can swap threads).
  let activeId = 'c1';

  const onConversationSelect = (e: Event) => {
    const id = (e as CustomEvent<{ id: string }>).detail?.id;
    if (!id || !rail || !chat) return;
    activeId = id;
    rail.activeId = id;
    chat.messages = THREADS[id] ?? [];
  };

  const onNewChat = () => {
    if (!rail || !chat) return;
    const id = `new-${Date.now()}`;
    const newConv: ConversationSummary = {
      id,
      title: 'New conversation',
      scope: { type: 'collection' },
      messageCount: 0,
      lastMessageAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    THREADS[id] = [];
    activeId = id;
    rail.conversations = [newConv, ...(rail.conversations as ConversationSummary[])];
    rail.activeId = id;
    chat.messages = [];
  };

  const onSubmit = (e: Event) => {
    const text = ((e as CustomEvent).detail?.value as string | undefined)?.trim();
    if (!text || !chat) return;
    const aId = nextId();
    const msgs = (chat.messages as ChatMessage[]) ?? [];
    chat.messages = [
      ...msgs,
      { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    chat.loading = true;
    // Update local thread store.
    THREADS[activeId] = chat.messages as ChatMessage[];

    const words = DEFAULT_REPLY.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      chat!.messages = ((chat!.messages as ChatMessage[]) ?? []).map((m) =>
        m.id === aId
          ? { ...m, parts: [{ type: 'text', text: partial }], ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}) }
          : m,
      );
      THREADS[activeId] = chat!.messages as ChatMessage[];
      if (!done) timer = window.setTimeout(tick, 38);
      else chat!.loading = false;
    };
    timer = window.setTimeout(tick, 240);
  };

  onMount(async () => {
    await loadKit();
    if (!rail || !chat || !shell) return;
    customElements.upgrade(shell);
    customElements.upgrade(rail);
    customElements.upgrade(chat);

    rail.conversations = CONVERSATIONS;
    rail.activeId = 'c1';
    chat.messages = THREADS['c1'];

    const applyTheme = () => {
      shell?.setAttribute('theme', theme());
      rail?.setAttribute('theme', theme());
      chat?.setAttribute('theme', theme());
    };
    applyTheme();

    rail.addEventListener('kai-conversation-select', onConversationSelect);
    rail.addEventListener('kai-new-chat', onNewChat);
    chat.addEventListener('kai-submit', onSubmit);

    setReady(true);

    const obs = new MutationObserver(applyTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    onCleanup(() => {
      clearTimeout(timer);
      rail?.removeEventListener('kai-conversation-select', onConversationSelect);
      rail?.removeEventListener('kai-new-chat', onNewChat);
      chat?.removeEventListener('kai-submit', onSubmit);
      obs.disconnect();
    });
  });

  return (
    <div
      class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface"
      style={{ height: '560px' }}
    >
      {/* @ts-expect-error custom element */}
      <kai-workspace
        ref={(el: HTMLElement) => (shell = el as ElementHost)}
        collapse-below="720"
        drawer-below="640"
        style={{ display: 'block', height: '100%' }}
      >
        {/* @ts-expect-error custom element */}
        <kai-conversations slot="start" ref={(el: HTMLElement) => (rail = el as ElementHost)} />
        {/* @ts-expect-error custom element */}
        <kai-chat ref={(el: HTMLElement) => (chat = el as ElementHost)} style={{ display: 'block', height: '100%' }} />
      </kai-workspace>
    </div>
  );
}
