/** Knowledge base demo — a scoped RAG assistant.
 *
 *  A <kai-scope-picker> chooses a knowledge scope (Product Docs / API Reference /
 *  Engineering Wiki). The choice filters the <kai-conversations> sidebar list and
 *  swaps which <kai-sources> citations the <kai-chat> answer grounds itself in.
 *  Everything is laid out with <kai-resizable> (sidebar + main pane).
 *
 *  All kai-* elements are real, prop-driven, and upgraded after loadKit(); arrays
 *  and objects are set as JS PROPERTIES, never serialized to attributes. */
import { onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

// --- Shapes (verified against element-meta.json) -------------------------

type MessagePart = { type: 'text'; text: string };
type ChatMsg = { id: string; role: 'user' | 'assistant'; parts: MessagePart[]; actions?: string[] };

interface SourceItem {
  href: string;
  title?: string;
  description?: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  groupId?: string;
  scope: { type: 'document' | 'collection'; filters?: { tags?: string[] } };
  messageCount: number;
  lastMessageAt: string;
  updatedAt: string;
}

// --- Scopes --------------------------------------------------------------
// The scope picker offers tags; each tag maps to a knowledge base. The first
// item ("All knowledge") is the undefined-filters case the picker emits.

type ScopeId = 'all' | 'product-docs' | 'api-reference' | 'engineering-wiki';

const SCOPE_TAGS = ['Product Docs', 'API Reference', 'Engineering Wiki'];

const TAG_TO_SCOPE: Record<string, ScopeId> = {
  'Product Docs': 'product-docs',
  'API Reference': 'api-reference',
  'Engineering Wiki': 'engineering-wiki',
};

const SCOPE_LABEL: Record<ScopeId, string> = {
  all: 'All knowledge',
  'product-docs': 'Product Docs',
  'api-reference': 'API Reference',
  'engineering-wiki': 'Engineering Wiki',
};

// --- Seed data per scope -------------------------------------------------

const CONVERSATIONS: ConversationSummary[] = [
  {
    id: 'c1',
    title: 'How do I configure webhook retries?',
    groupId: 'today',
    scope: { type: 'collection', filters: { tags: ['Product Docs'] } },
    messageCount: 6,
    lastMessageAt: '2026-06-17T15:30:00.000Z',
    updatedAt: '2026-06-17T15:30:00.000Z',
  },
  {
    id: 'c2',
    title: 'Pagination on the list endpoints',
    groupId: 'today',
    scope: { type: 'collection', filters: { tags: ['API Reference'] } },
    messageCount: 4,
    lastMessageAt: '2026-06-17T11:20:00.000Z',
    updatedAt: '2026-06-17T11:20:00.000Z',
  },
  {
    id: 'c3',
    title: 'On-call escalation policy',
    groupId: 'yesterday',
    scope: { type: 'collection', filters: { tags: ['Engineering Wiki'] } },
    messageCount: 9,
    lastMessageAt: '2026-06-16T18:00:00.000Z',
    updatedAt: '2026-06-16T18:00:00.000Z',
  },
  {
    id: 'c4',
    title: 'Rate limits & burst allowance',
    groupId: 'yesterday',
    scope: { type: 'collection', filters: { tags: ['API Reference'] } },
    messageCount: 3,
    lastMessageAt: '2026-06-16T09:10:00.000Z',
    updatedAt: '2026-06-16T09:10:00.000Z',
  },
  {
    id: 'c5',
    title: 'Setting up SSO with SAML',
    groupId: 'yesterday',
    scope: { type: 'collection', filters: { tags: ['Product Docs'] } },
    messageCount: 7,
    lastMessageAt: '2026-06-16T08:05:00.000Z',
    updatedAt: '2026-06-16T08:05:00.000Z',
  },
];

const GROUPS = [
  { id: 'today', name: 'Today', sortOrder: 0, createdAt: '2026-06-17T00:00:00.000Z' },
  { id: 'yesterday', name: 'Yesterday', sortOrder: 1, createdAt: '2026-06-16T00:00:00.000Z' },
];

interface ScopeContent {
  chatTitle: string;
  placeholder: string;
  suggestions: string[];
  greeting: ChatMsg;
  reply: string;
  sources: SourceItem[];
}

const CONTENT: Record<ScopeId, ScopeContent> = {
  all: {
    chatTitle: 'Knowledge base',
    placeholder: 'Ask across every knowledge base…',
    suggestions: [
      'How do I configure webhook retries?',
      'What are the API rate limits?',
      'What is the on-call escalation policy?',
    ],
    greeting: {
      id: 'g-all',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Pick a knowledge scope from the dropdown to narrow your search, or ask across everything. Answers cite the documents they came from.',
        },
      ],
    },
    reply:
      'Searching across all knowledge bases. Webhook retries are configured under **Settings → Webhooks** with an exponential backoff capped at 24 hours [1]. The retry budget counts against your account rate limits, so high-volume endpoints should return `2xx` quickly and process asynchronously [2].',
    sources: [
      {
        href: 'https://docs.kitn.ai/product/webhooks/retries',
        title: 'Webhook delivery & retries',
        description: 'Backoff schedule, retry budget, and how to inspect delivery logs.',
      },
      {
        href: 'https://docs.kitn.ai/api/rate-limits',
        title: 'Rate limits',
        description: 'Per-token request budgets and the burst allowance window.',
      },
    ],
  },
  'product-docs': {
    chatTitle: 'Product Docs',
    placeholder: 'Ask about the product…',
    suggestions: [
      'How do I configure webhook retries?',
      'How do I set up SSO with SAML?',
      'Where do I manage team roles?',
    ],
    greeting: {
      id: 'g-product',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Scoped to **Product Docs**. Ask about features, configuration, and account settings.' }],
    },
    reply:
      'In **Product Docs**: open **Settings → Webhooks**, select an endpoint, and enable **Automatic retries**. Failed deliveries retry with exponential backoff — 1 min, 5 min, 30 min, then hourly up to 24 hours [1]. Once SSO is enabled, webhook settings inherit your SAML-mapped role permissions [2].',
    sources: [
      {
        href: 'https://docs.kitn.ai/product/webhooks/retries',
        title: 'Webhook delivery & retries',
        description: 'Backoff schedule, retry budget, and how to inspect delivery logs.',
      },
      {
        href: 'https://docs.kitn.ai/product/security/saml-sso',
        title: 'Single sign-on with SAML',
        description: 'Connect your IdP, map attributes to roles, and enforce SSO.',
      },
    ],
  },
  'api-reference': {
    chatTitle: 'API Reference',
    placeholder: 'Ask about the API…',
    suggestions: [
      'How does cursor pagination work?',
      'What are the API rate limits?',
      'Which endpoints support idempotency keys?',
    ],
    greeting: {
      id: 'g-api',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Scoped to the **API Reference**. Ask about endpoints, parameters, and limits.' }],
    },
    reply:
      'In the **API Reference**: list endpoints use **cursor pagination**. Pass `limit` (max 100) and follow the `next_cursor` returned in each response until it is `null` [1]. List requests are metered at 600 requests/minute per token, with a short burst allowance above that ceiling [2].',
    sources: [
      {
        href: 'https://docs.kitn.ai/api/pagination',
        title: 'Cursor pagination',
        description: 'Using limit and next_cursor to page through list endpoints.',
      },
      {
        href: 'https://docs.kitn.ai/api/rate-limits',
        title: 'Rate limits',
        description: 'Per-token request budgets and the burst allowance window.',
      },
    ],
  },
  'engineering-wiki': {
    chatTitle: 'Engineering Wiki',
    placeholder: 'Ask the engineering wiki…',
    suggestions: [
      'What is the on-call escalation policy?',
      'How do we run a database migration?',
      'What is the incident severity matrix?',
    ],
    greeting: {
      id: 'g-eng',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Scoped to the **Engineering Wiki**. Ask about runbooks, on-call, and internal process.' }],
    },
    reply:
      'In the **Engineering Wiki**: the primary on-call ack window is 5 minutes. An unacknowledged page escalates to the secondary, then to the engineering manager after 15 minutes [1]. SEV-1 incidents open a dedicated channel and notify the incident commander immediately [2].',
    sources: [
      {
        href: 'https://wiki.kitn.ai/runbooks/on-call-escalation',
        title: 'On-call escalation policy',
        description: 'Ack windows, escalation tiers, and paging schedule.',
      },
      {
        href: 'https://wiki.kitn.ai/runbooks/incident-severity',
        title: 'Incident severity matrix',
        description: 'SEV definitions, channel setup, and commander responsibilities.',
      },
    ],
  },
};

let uid = 0;
const nextId = () => `kb${++uid}`;

export default function KnowledgeBaseDemo() {
  let resizableRef: HTMLElement | undefined;
  let sidebarItemRef: HTMLElement | undefined;
  let chatItemRef: HTMLElement | undefined;

  let pickerEl: (HTMLElement & { availableTags?: string[]; currentLabel?: string }) | undefined;
  let convEl: (HTMLElement & { groups?: unknown; conversations?: ConversationSummary[]; activeId?: string }) | undefined;
  let chatEl: (HTMLElement & { messages?: ChatMsg[]; [k: string]: unknown }) | undefined;
  let sourcesEl: (HTMLElement & { sources?: SourceItem[]; numbered?: boolean }) | undefined;

  let scope: ScopeId = 'all';
  let timer: number | undefined;

  const theme = () => document.documentElement.dataset.theme ?? 'light';

  /** Conversations matching the active scope ("all" shows everything). */
  const conversationsForScope = (s: ScopeId): ConversationSummary[] => {
    if (s === 'all') return CONVERSATIONS;
    const label = SCOPE_LABEL[s];
    return CONVERSATIONS.filter((c) => c.scope.filters?.tags?.includes(label));
  };

  /** Re-seed the chat, sources, and conversation list for the active scope. */
  const applyScope = (s: ScopeId) => {
    scope = s;
    const c = CONTENT[s];

    if (chatEl) {
      chatEl.messages = [c.greeting];
      chatEl.chatTitle = c.chatTitle;
      chatEl.placeholder = c.placeholder;
      chatEl.suggestions = c.suggestions;
    }
    if (sourcesEl) sourcesEl.sources = []; // hide stale citations until a new answer streams
    if (convEl) {
      convEl.conversations = conversationsForScope(s);
      convEl.activeId = undefined;
    }
  };

  const onScopeChange = (e: Event) => {
    const filters = (e as CustomEvent).detail?.filters as { tags?: string[] } | undefined;
    const tag = filters?.tags?.[0];
    applyScope(tag ? TAG_TO_SCOPE[tag] ?? 'all' : 'all');
  };

  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (!text || !chatEl) return;
    const c = CONTENT[scope];

    if (sourcesEl) sourcesEl.sources = []; // clear citations while the answer streams

    const aId = nextId();
    chatEl.messages = [
      ...(chatEl.messages ?? []),
      { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    chatEl.loading = true;

    const words = c.reply.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      chatEl!.messages = (chatEl!.messages ?? []).map((m) =>
        m.id === aId
          ? { ...m, parts: [{ type: 'text', text: partial }], ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}) }
          : m,
      );
      if (!done) {
        timer = window.setTimeout(tick, 38);
      } else {
        chatEl!.loading = false;
        if (sourcesEl) {
          sourcesEl.sources = c.sources; // reveal scope-specific citations
          sourcesEl.numbered = true;
        }
      }
    };
    timer = window.setTimeout(tick, 240);
  };

  const onConversationSelect = (e: Event) => {
    const id = (e as CustomEvent).detail?.id as string | undefined;
    if (id && convEl) convEl.activeId = id;
  };

  const applyTheme = () => {
    const t = theme();
    pickerEl?.setAttribute('theme', t);
    convEl?.setAttribute('theme', t);
    chatEl?.setAttribute('theme', t);
    sourcesEl?.setAttribute('theme', t);
  };

  onMount(async () => {
    await loadKit();
    const t = theme();

    // --- Scope picker ---
    pickerEl = document.createElement('kai-scope-picker') as typeof pickerEl;
    pickerEl!.style.cssText = 'display:block;padding:10px 12px';
    pickerEl!.setAttribute('theme', t);
    customElements.upgrade(pickerEl!);
    pickerEl!.availableTags = SCOPE_TAGS;
    pickerEl!.currentLabel = SCOPE_LABEL.all;
    pickerEl!.addEventListener('kai-scope-change', onScopeChange);

    // --- Conversations sidebar ---
    convEl = document.createElement('kai-conversations') as typeof convEl;
    convEl!.style.cssText = 'display:block;flex:1;min-height:0;width:100%';
    convEl!.setAttribute('theme', t);
    customElements.upgrade(convEl!);
    convEl!.groups = GROUPS;
    convEl!.conversations = conversationsForScope('all');
    convEl!.addEventListener('kai-conversation-select', onConversationSelect);

    if (sidebarItemRef) {
      // A <kai-resizable-item> slots its light children into a single
      // minmax(0,1fr) grid cell, so appending the picker AND the list directly
      // would land both in the SAME cell (item 2 spilling into an auto implicit
      // row) and a flex style on the item host is inert. Wrap them in one
      // flex-column that fills the cell and stacks: picker (intrinsic height)
      // above conversations (flex:1).
      const sidebar = document.createElement('div');
      sidebar.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;width:100%';
      sidebar.appendChild(pickerEl!);
      sidebar.appendChild(convEl!);
      sidebarItemRef.appendChild(sidebar);
    }

    // --- Chat main pane ---
    chatEl = document.createElement('kai-chat') as typeof chatEl;
    chatEl!.style.cssText = 'display:block;flex:1;min-height:0;width:100%';
    chatEl!.setAttribute('theme', t);
    customElements.upgrade(chatEl!);
    chatEl!.chatTitle = CONTENT.all.chatTitle;
    chatEl!.placeholder = CONTENT.all.placeholder;
    chatEl!.suggestions = CONTENT.all.suggestions;
    chatEl!.messages = [CONTENT.all.greeting];
    chatEl!.addEventListener('kai-submit', onSubmit);

    // --- Sources strip below the chat ---
    sourcesEl = document.createElement('kai-sources') as typeof sourcesEl;
    sourcesEl!.style.cssText = 'display:block';
    sourcesEl!.setAttribute('theme', t);
    customElements.upgrade(sourcesEl!);
    sourcesEl!.numbered = true;
    sourcesEl!.sources = [];

    if (chatItemRef) {
      // Same single-cell constraint as the sidebar: stack chat (flex:1) over the
      // sources strip (intrinsic height) inside one flex-column that fills the
      // item's grid cell, instead of appending both children into one cell.
      const main = document.createElement('div');
      main.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;width:100%';
      main.appendChild(chatEl!);
      const strip = document.createElement('div');
      strip.style.cssText =
        'border-top:1px solid var(--color-line, #e5e7eb);padding:10px 16px;background:var(--color-surface, #fff)';
      strip.appendChild(sourcesEl!);
      main.appendChild(strip);
      chatItemRef.appendChild(main);
    }

    if (resizableRef) customElements.upgrade(resizableRef);

    const obs = new MutationObserver(applyTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    onCleanup(() => {
      clearTimeout(timer);
      pickerEl?.removeEventListener('kai-scope-change', onScopeChange);
      chatEl?.removeEventListener('kai-submit', onSubmit);
      convEl?.removeEventListener('kai-conversation-select', onConversationSelect);
      obs.disconnect();
    });
  });

  return (
    <div
      class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface"
      style={{ height: '620px' }}
    >
      {/* @ts-expect-error custom element */}
      <kai-resizable
        ref={(el: HTMLElement) => (resizableRef = el)}
        orientation="horizontal"
        style={{ display: 'block', height: '100%' }}
      >
        {/* Sidebar: scope picker + conversation list (children appended in onMount) */}
        {/* @ts-expect-error custom element */}
        <kai-resizable-item
          ref={(el: HTMLElement) => (sidebarItemRef = el)}
          size="28%"
          min="220px"
          max="360px"
        />
        {/* Main pane: chat + sources strip (children appended in onMount) */}
        {/* @ts-expect-error custom element */}
        <kai-resizable-item
          ref={(el: HTMLElement) => (chatItemRef = el)}
        />
      </kai-resizable>
    </div>
  );
}
