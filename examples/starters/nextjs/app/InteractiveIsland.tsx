'use client';

// An interactive island. NOTE the `'use client'` here is required because THIS
// component uses React state + an event handler — that's the standard React
// Server Component rule (hooks and function props can't cross into RSC), NOT a
// requirement of the kit. The kai wrappers themselves already carry their own
// `'use client'` banner, so they can also be rendered straight from a Server
// Component (see app/page.tsx, which has no directive).
//
// The wrappers are real React components:
//   - array/object props (groups, conversations) are passed as normal props and
//     assigned as live DOM *properties* under the hood (no refs needed);
//   - events are `on<Event>` handlers over the `kai-*` CustomEvents;
//   - registration happens automatically on mount (browser-only).

import { useState } from 'react';
import { Button, Conversations } from '@kitn.ai/ui/react';

const GROUPS = [
  { id: 'g-today', name: 'Today', sortOrder: 0, createdAt: '2026-06-29T09:00:00Z' },
  { id: 'g-earlier', name: 'Earlier', sortOrder: 1, createdAt: '2026-06-28T09:00:00Z' },
];

const CONVERSATIONS = [
  {
    id: 'c-1',
    title: 'Wire up streaming responses',
    groupId: 'g-today',
    scope: { type: 'collection' as const },
    messageCount: 12,
    lastMessageAt: '2026-06-29T10:15:00Z',
    updatedAt: '2026-06-29T10:15:00Z',
  },
  {
    id: 'c-2',
    title: 'Design the tool-call panel',
    groupId: 'g-today',
    scope: { type: 'collection' as const },
    messageCount: 5,
    lastMessageAt: '2026-06-29T08:40:00Z',
    updatedAt: '2026-06-29T08:40:00Z',
  },
  {
    id: 'c-3',
    title: 'Markdown + code highlighting',
    groupId: 'g-earlier',
    scope: { type: 'collection' as const },
    messageCount: 23,
    lastMessageAt: '2026-06-28T16:05:00Z',
    updatedAt: '2026-06-28T16:05:00Z',
  },
];

export default function InteractiveIsland() {
  const [activeId, setActiveId] = useState('c-1');
  const [clicks, setClicks] = useState(0);

  return (
    <section style={{ display: 'grid', gap: '1.5rem' }}>
      {/* Scalar prop + an event handler (onClick over the kai-* CustomEvent). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Button variant="default" onClick={() => setClicks((c) => c + 1)}>
          Click me
        </Button>
        <Button variant="outline" icon="plus">
          New
        </Button>
        <span data-testid="click-count">clicked {clicks}×</span>
      </div>

      {/* Data-driven wrapper: typed array/object props + a typed event handler.
          `conversations` was one of the previously-broken registration
          specifiers — it now resolves, registers, and populates. */}
      <div
        style={{
          maxWidth: 320,
          height: 420,
          border: '1px solid var(--kai-border, #e5e5e5)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <Conversations
          groups={GROUPS}
          conversations={CONVERSATIONS}
          activeId={activeId}
          onConversationSelect={(e) => setActiveId(e.detail.id)}
        />
      </div>

      <p data-testid="active-id">active: {activeId}</p>
    </section>
  );
}
