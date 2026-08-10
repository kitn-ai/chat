// Sample data for <kai-conversations> non-scalar props.
//
// `groups` and `conversations` are both scalar:false — they are arrays set as
// JS properties. The default `sample` loads a realistic sidebar (flat
// conversations auto-bucketed by recency). Named sets cover the pre-grouped and
// active-highlighted variants used by the focused examples.
//
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding this file is all that's needed — no shared file edits required.

// ── flat list — component buckets by recency ──────────────────────────────────

const FLAT_CONVERSATIONS = [
  {
    id: 'c-1',
    title: 'Web component architecture',
    scope: { type: 'collection' },
    messageCount: 12,
    lastMessageAt: '2026-06-16T10:00:00.000Z',
    updatedAt: '2026-06-16T10:00:00.000Z',
  },
  {
    id: 'c-2',
    title: 'Theming with CSS custom properties',
    scope: { type: 'collection' },
    messageCount: 7,
    lastMessageAt: '2026-06-16T08:30:00.000Z',
    updatedAt: '2026-06-16T08:30:00.000Z',
  },
  {
    id: 'c-3',
    title: 'Publishing pipeline review',
    scope: { type: 'collection' },
    messageCount: 5,
    lastMessageAt: '2026-06-15T14:00:00.000Z',
    updatedAt: '2026-06-15T14:00:00.000Z',
  },
  {
    id: 'c-4',
    title: 'API migration notes',
    scope: { type: 'collection' },
    messageCount: 9,
    lastMessageAt: '2026-06-14T11:00:00.000Z',
    updatedAt: '2026-06-14T11:00:00.000Z',
  },
  {
    id: 'c-5',
    title: 'Q2 launch plan',
    scope: { type: 'collection' },
    messageCount: 3,
    lastMessageAt: '2026-06-10T09:00:00.000Z',
    updatedAt: '2026-06-10T09:00:00.000Z',
  },
];

// ── pre-bucketed groups ───────────────────────────────────────────────────────

const GROUPS = [
  { id: 'g-work', name: 'Work', sortOrder: 0, createdAt: '2026-06-01T09:00:00.000Z' },
  { id: 'g-personal', name: 'Personal', sortOrder: 1, createdAt: '2026-06-02T09:00:00.000Z' },
];

const GROUPED_CONVERSATIONS = [
  {
    id: 'c-1',
    title: 'Q2 launch plan',
    groupId: 'g-work',
    scope: { type: 'collection' },
    messageCount: 12,
    lastMessageAt: '2026-06-09T14:20:00.000Z',
    updatedAt: '2026-06-09T14:20:00.000Z',
  },
  {
    id: 'c-2',
    title: 'API migration notes',
    groupId: 'g-work',
    scope: { type: 'collection' },
    messageCount: 5,
    lastMessageAt: '2026-06-08T11:05:00.000Z',
    updatedAt: '2026-06-08T11:05:00.000Z',
  },
  {
    id: 'c-3',
    title: 'Weekend trip ideas',
    groupId: 'g-personal',
    scope: { type: 'collection' },
    messageCount: 8,
    lastMessageAt: '2026-06-07T19:42:00.000Z',
    updatedAt: '2026-06-07T19:42:00.000Z',
  },
  {
    id: 'c-4',
    title: 'Recipe experiments',
    groupId: 'g-personal',
    scope: { type: 'collection' },
    messageCount: 4,
    lastMessageAt: '2026-06-06T21:00:00.000Z',
    updatedAt: '2026-06-06T21:00:00.000Z',
  },
];

export default {
  // Default: flat conversations, no groups — everything renders as one Ungrouped section.
  sample: {
    conversations: FLAT_CONVERSATIONS,
  },
  named: {
    // Active row highlighted — c-1 is the open conversation.
    withActive: {
      conversations: FLAT_CONVERSATIONS,
      activeId: 'c-1',
    },
    // Pre-bucketed groups supplied by the caller.
    withGroups: {
      groups: GROUPS,
      conversations: GROUPED_CONVERSATIONS,
      activeId: 'c-1',
    },
    // Empty list — component renders its empty state.
    empty: {
      conversations: [],
    },
    // Declarative children — <kai-conversation> light-DOM children instead of a
    // JS `conversations` property. Great for plain HTML / server-rendered markup.
    declarative: {
      html: '<kai-conversation id="c-1">Q2 launch plan</kai-conversation><kai-conversation id="c-2">API migration notes</kai-conversation><kai-conversation id="c-3">Weekend trip ideas</kai-conversation>',
    },
  },
};
