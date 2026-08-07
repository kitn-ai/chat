/** Live demo for the Workspace example page. Mounts <kai-workspace>, seeds it
 *  with sample conversations + a thread, and scripts a canned streaming reply
 *  on submit — identical approach to ChatDemo but using the single-element
 *  multi-conversation API. */
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

export default function WorkspaceDemo() {
  let host: (HTMLElement & { [k: string]: unknown }) | undefined;
  const [, setReady] = createSignal(false);
  let timer: number | undefined;

  const theme = () => document.documentElement.dataset.theme ?? 'light';

  // Current active conversation id (local state so we can swap threads).
  let activeId = 'c1';

  const onConversationSelect = (e: Event) => {
    const id = (e as CustomEvent<{ id: string }>).detail?.id;
    if (!id || !host) return;
    activeId = id;
    host.activeId = id;
    host.messages = THREADS[id] ?? [];
  };

  const onNewChat = () => {
    if (!host) return;
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
    host.conversations = [newConv, ...(host.conversations as ConversationSummary[])];
    host.activeId = id;
    host.messages = [];
  };

  const onSubmit = (e: Event) => {
    const text = ((e as CustomEvent).detail?.value as string | undefined)?.trim();
    if (!text || !host) return;
    const aId = nextId();
    const msgs = (host.messages as ChatMessage[]) ?? [];
    host.messages = [
      ...msgs,
      { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    host.loading = true;
    // Update local thread store.
    THREADS[activeId] = host.messages as ChatMessage[];

    const words = DEFAULT_REPLY.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      host!.messages = ((host!.messages as ChatMessage[]) ?? []).map((m) =>
        m.id === aId
          ? { ...m, parts: [{ type: 'text', text: partial }], ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}) }
          : m,
      );
      THREADS[activeId] = host!.messages as ChatMessage[];
      if (!done) timer = window.setTimeout(tick, 38);
      else host!.loading = false;
    };
    timer = window.setTimeout(tick, 240);
  };

  onMount(async () => {
    await loadKit();
    if (!host) return;
    customElements.upgrade(host);

    host.conversations = CONVERSATIONS;
    host.messages = THREADS['c1'];
    host.activeId = 'c1';
    host.setAttribute('theme', theme());

    host.addEventListener('kai-conversation-select', onConversationSelect);
    host.addEventListener('kai-new-chat', onNewChat);
    host.addEventListener('kai-submit', onSubmit);

    setReady(true);

    const obs = new MutationObserver(() => host?.setAttribute('theme', theme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    onCleanup(() => {
      clearTimeout(timer);
      host?.removeEventListener('kai-conversation-select', onConversationSelect);
      host?.removeEventListener('kai-new-chat', onNewChat);
      host?.removeEventListener('kai-submit', onSubmit);
      obs.disconnect();
    });
  });

  return (
    <div
      class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface"
      style={{ height: '560px' }}
    >
      {/* @ts-expect-error custom element */}
      <kai-workspace ref={(el: HTMLElement) => (host = el as any)} style={{ display: 'block', height: '100%' }} />
    </div>
  );
}
