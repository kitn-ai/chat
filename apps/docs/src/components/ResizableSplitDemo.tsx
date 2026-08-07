/** Live demo for the "Resizable split layout" pattern page.
 *  Mounts a <kai-resizable> with two <kai-resizable-item> children:
 *  a <kai-conversations> sidebar and a <kai-chat> main pane.
 *  A segmented toggle swaps the sidebar to the left or right by
 *  re-ordering the two <kai-resizable-item> elements in the DOM. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

// ConversationSummary shape (verified against element-meta.json)
const CONVERSATIONS = [
  {
    id: 'c1',
    title: 'Web component architecture',
    groupId: 'today',
    scope: { type: 'document' as const },
    messageCount: 12,
    lastMessageAt: '2026-06-17T15:30:00.000Z',
    updatedAt: '2026-06-17T15:30:00.000Z',
  },
  {
    id: 'c2',
    title: 'Theming & design tokens',
    groupId: 'today',
    scope: { type: 'document' as const },
    messageCount: 5,
    lastMessageAt: '2026-06-17T11:20:00.000Z',
    updatedAt: '2026-06-17T11:20:00.000Z',
  },
  {
    id: 'c3',
    title: 'Streaming reply patterns',
    groupId: 'today',
    scope: { type: 'document' as const },
    messageCount: 8,
    lastMessageAt: '2026-06-17T09:00:00.000Z',
    updatedAt: '2026-06-17T09:00:00.000Z',
  },
  {
    id: 'c4',
    title: 'Shadow DOM isolation',
    groupId: 'yesterday',
    scope: { type: 'document' as const },
    messageCount: 3,
    lastMessageAt: '2026-06-16T18:00:00.000Z',
    updatedAt: '2026-06-16T18:00:00.000Z',
  },
];

// ConversationGroup shape (verified against element-meta.json)
const GROUPS = [
  { id: 'today', name: 'Today', sortOrder: 0, createdAt: '2026-06-17T00:00:00.000Z' },
  { id: 'yesterday', name: 'Yesterday', sortOrder: 1, createdAt: '2026-06-16T00:00:00.000Z' },
];

// ChatMessage seed (verified against element-meta.json kai-chat.messages shape)
type MessagePart = { type: 'text'; text: string };
type ChatMsg = { id: string; role: 'user' | 'assistant'; parts: MessagePart[]; actions?: string[] };
const SEED_MESSAGES: ChatMsg[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'How does the resizable layout work?' }] },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Wrap `<kai-resizable-item>` children inside `<kai-resizable>`. Set `size`, `min`, and `max` on each item — a draggable divider appears automatically between them. Use the toggle above to swap the sidebar to either side.',
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
];

const REPLY =
  'Drag the divider to redistribute space, or use the Left / Right toggle to move the sidebar. `<kai-resizable>` fires a `kai-change` event with updated sizes (in percent) whenever a drag ends.';

let uid = 0;
const nextId = () => `r${++uid}`;

export default function ResizableSplitDemo() {
  const [side, setSide] = createSignal<'left' | 'right'>('left');

  // Container refs — the resizable root and two item wrappers
  let resizableRef: HTMLElement | undefined;
  let sidebarItemRef: HTMLElement | undefined; // the kai-resizable-item holding kai-conversations
  let chatItemRef: HTMLElement | undefined;    // the kai-resizable-item holding kai-chat

  // The actual kai-* elements created imperatively in onMount
  let convEl: HTMLElement | undefined;
  let chatEl: (HTMLElement & { messages?: ChatMsg[]; [k: string]: unknown }) | undefined;

  let timer: number | undefined;
  const theme = () => document.documentElement.dataset.theme ?? 'light';

  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (!text || !chatEl) return;
    const aId = nextId();
    chatEl.messages = [
      ...(chatEl.messages ?? []),
      { id: nextId(), role: 'user' as const, parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant' as const, parts: [] },
    ];
    (chatEl as any).loading = true;
    const words = REPLY.split(/(\s+)/);
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
      if (!done) timer = window.setTimeout(tick, 38);
      else (chatEl as any).loading = false;
    };
    timer = window.setTimeout(tick, 240);
  };

  const applyTheme = () => {
    const t = theme();
    convEl?.setAttribute('theme', t);
    chatEl?.setAttribute('theme', t);
  };

  onMount(async () => {
    await loadKit();

    // --- Build kai-conversations ---
    convEl = document.createElement('kai-conversations') as HTMLElement;
    convEl.style.cssText = 'display:block;height:100%;width:100%';
    convEl.setAttribute('theme', theme());
    customElements.upgrade(convEl);
    (convEl as any).groups = GROUPS;
    (convEl as any).conversations = CONVERSATIONS;
    (convEl as any).activeId = 'c1';
    if (sidebarItemRef) sidebarItemRef.appendChild(convEl);

    // --- Build kai-chat ---
    chatEl = document.createElement('kai-chat') as (HTMLElement & { messages?: ChatMsg[]; [k: string]: unknown });
    chatEl.style.cssText = 'display:block;height:100%;width:100%';
    chatEl.setAttribute('theme', theme());
    (chatEl as any).placeholder = 'Ask about this layout…';
    (chatEl as any).chatTitle = 'Web component architecture';
    customElements.upgrade(chatEl);
    chatEl.messages = SEED_MESSAGES;
    chatEl.addEventListener('kai-submit', onSubmit);
    if (chatItemRef) chatItemRef.appendChild(chatEl);

    // Upgrade the resizable root so it reads its children
    if (resizableRef) customElements.upgrade(resizableRef);

    // Theme observer
    const obs = new MutationObserver(applyTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    onCleanup(() => {
      clearTimeout(timer);
      chatEl?.removeEventListener('kai-submit', onSubmit);
      obs.disconnect();
    });
  });

  /** Swap the two kai-resizable-item children when the side toggle changes. */
  const handleSideChange = (next: 'left' | 'right') => {
    if (next === side()) return;
    setSide(next);
    if (!resizableRef || !sidebarItemRef || !chatItemRef) return;
    if (next === 'right') {
      // sidebar on right: put chatItem first
      resizableRef.insertBefore(chatItemRef, sidebarItemRef);
    } else {
      // sidebar on left: put sidebarItem first
      resizableRef.insertBefore(sidebarItemRef, chatItemRef);
    }
  };

  const btnBase =
    'inline-flex cursor-pointer items-center rounded-md border-0 px-3 py-1 text-xs font-medium outline-none transition-colors';
  const btnActive = 'bg-brand text-white shadow-sm';
  const btnInactive = 'bg-surface text-ink-2 hover:bg-ink-3/10';

  return (
    <div class="not-content my-5 flex flex-col gap-3">
      {/* Side toggle */}
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-ink-2">Sidebar side:</span>
        <div class="inline-flex overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            class={`${btnBase} ${side() === 'left' ? btnActive : btnInactive}`}
            onClick={() => handleSideChange('left')}
            aria-pressed={side() === 'left'}
          >
            Left
          </button>
          <button
            type="button"
            class={`${btnBase} ${side() === 'right' ? btnActive : btnInactive}`}
            onClick={() => handleSideChange('right')}
            aria-pressed={side() === 'right'}
          >
            Right
          </button>
        </div>
      </div>

      {/* Resizable layout — elements are imperative, DOM re-ordered on side change */}
      <div
        class="overflow-hidden rounded-xl border border-line bg-surface"
        style={{ height: '520px' }}
      >
        {/* @ts-expect-error custom element */}
        <kai-resizable
          ref={(el: HTMLElement) => (resizableRef = el)}
          orientation="horizontal"
          style={{ display: 'block', height: '100%' }}
        >
          {/* sidebar item — kai-conversations appended imperatively in onMount */}
          {/* @ts-expect-error custom element */}
          <kai-resizable-item
            ref={(el: HTMLElement) => (sidebarItemRef = el)}
            size="25%"
            min="180px"
            max="340px"
          />
          {/* chat item — kai-chat appended imperatively in onMount */}
          {/* @ts-expect-error custom element */}
          <kai-resizable-item ref={(el: HTMLElement) => (chatItemRef = el)} />
        </kai-resizable>
      </div>
    </div>
  );
}
