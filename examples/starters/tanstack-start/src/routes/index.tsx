import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';

// Typed React wrappers over the `kai-*` custom elements. Importing a wrapper is
// enough — it lazily registers its own element on the client (in a layout
// effect), so there's no separate `import '@kitn.ai/ui/elements'` side effect
// and the unused elements stay tree-shaken out of the bundle.
//
// `Conversations` is included on purpose: its element file ships as
// `conversation-list.js`, and the wrapper imports it under that name. It
// resolves natively here — no consumer-side specifier shim needed.
import { Button, Chat, Conversations } from '@kitn.ai/ui/react';

export const Route = createFileRoute('/')({
  component: Home,
});

// A message thread — passed as a JS *property* (an array of objects) through the
// wrapper. This is the data-driven prop that proves array round-tripping
// survives SSR + hydration: the server emits a bare <kai-chat>, then after
// hydration the wrapper assigns `el.messages = [...]` and the element populates.
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ('copy' | 'like' | 'dislike' | 'regenerate' | 'edit')[];
};

const MESSAGES: ChatMessage[] = [
  {
    id: 'm-1',
    role: 'user',
    content: 'Does @kitn.ai/ui work with TanStack Start?',
  },
  {
    id: 'm-2',
    role: 'assistant',
    content:
      'Yes — the `kai-*` web components server-render as bare tags and then ' +
      'register + hydrate on the client. This thread is a `messages` **array** ' +
      'prop set through the React wrapper.',
    actions: ['copy', 'like'],
  },
];

// A second data-driven element — also set as a JS *property* array.
type Conversation = {
  id: string;
  title: string;
  scope: { type: 'document' | 'collection' };
  messageCount: number;
  lastMessageAt: string;
  updatedAt: string;
};

const CONVERSATIONS: Conversation[] = [
  {
    id: 'c-1',
    title: 'React + web components',
    scope: { type: 'collection' },
    messageCount: 2,
    lastMessageAt: '2026-06-10T15:30:00.000Z',
    updatedAt: '2026-06-10T15:30:00.000Z',
  },
  {
    id: 'c-2',
    title: 'Centering a div',
    scope: { type: 'collection' },
    messageCount: 2,
    lastMessageAt: '2026-06-09T14:20:00.000Z',
    updatedAt: '2026-06-09T14:20:00.000Z',
  },
  {
    id: 'c-3',
    title: 'TypeScript generics',
    scope: { type: 'collection' },
    messageCount: 4,
    lastMessageAt: '2026-06-08T11:05:00.000Z',
    updatedAt: '2026-06-08T11:05:00.000Z',
  },
];

function Home() {
  const [clicks, setClicks] = useState(0);
  const [activeId, setActiveId] = useState('c-1');

  // Client-only probe: confirm the elements registered after hydration. On the
  // server this stays "registering…" (the wrappers never touch `customElements`
  // during SSR); after hydration the layout effects define the elements. We
  // include `kai-conversations` — the previously-mis-specified one — to prove it
  // now registers natively.
  const [registered, setRegistered] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      const ok =
        typeof customElements !== 'undefined' &&
        !!customElements.get('kai-button') &&
        !!customElements.get('kai-chat') &&
        !!customElements.get('kai-conversations');
      setRegistered(ok ? 'registered' : 'registering…');
      if (!ok) raf = requestAnimationFrame(check);
    };
    check();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <main>
      <h1>@kitn.ai/ui on TanStack Start</h1>
      <p className="lede">
        Framework-agnostic web components, consumed through the typed React
        wrappers, server-rendered and hydrated by TanStack Start.
      </p>

      <div className="row">
        <Button variant="default" onClick={() => setClicks((c) => c + 1)}>
          Clicked {clicks}×
        </Button>
        <Button variant="outline" icon="sparkles">
          Outline
        </Button>
        <Button variant="subtle" disabled>
          Disabled
        </Button>
        <span data-testid="registration-status">
          elements: {registered ?? '…'}
        </span>
      </div>

      <div className="panes">
        <Conversations
          className="pane-rail"
          groups={[]}
          conversations={CONVERSATIONS}
          activeId={activeId}
          onConversationSelect={(e) => setActiveId(e.detail.id)}
        />
        <Chat
          className="pane-chat"
          messages={MESSAGES}
          chatTitle="Demo thread"
          placeholder="Ask anything…"
        />
      </div>
    </main>
  );
}
