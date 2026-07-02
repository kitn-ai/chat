/**
 * Shared sample data for kai-chat examples.
 *
 * Types are defined inline (matching the kit's exported types) so this file
 * has no runtime or compile-time dependency on the kit source — it works in
 * any framework example without pulling in SolidJS or the full kit bundle.
 *
 * Usage (TypeScript / React / Solid):
 *   import {
 *     SAMPLE_GROUPS, SAMPLE_CONVERSATIONS, SAMPLE_MESSAGES,
 *     SAMPLE_MODELS, SAMPLE_CONTEXT, SAMPLE_SUGGESTIONS, SAMPLE_TRIGGERS,
 *   } from '../../shared/sample-data';
 */

// ── Shared types (mirror @kitn.ai/ui exported interfaces) ────────────────────

/** Mirror of `ConversationGroup` from @kitn.ai/ui. */
export interface SampleGroup {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

/** Mirror of `ConversationSummary` from @kitn.ai/ui. */
export interface SampleConversation {
  id: string;
  title: string;
  groupId?: string;
  scope: { type: 'document' | 'collection' };
  messageCount: number;
  lastMessageAt: string;
  updatedAt: string;
}

/** Mirror of `ModelOption` from @kitn.ai/ui. */
export interface SampleModel {
  id: string;
  name: string;
  provider?: string;
}

/** Mirror of a single `TriggerItem` from @kitn.ai/ui (an entity-pill item). */
export interface SampleTriggerItem {
  id: string;
  label: string;
  description?: string;
  /** Optional per-item kind override (defaults to the group's `kind`). */
  kind?: string;
  /** Optional grouping header inside the popover. */
  group?: string;
  /** Text inserted into the draft when the item is a prompt-style skill. */
  promptText?: string;
}

/** Mirror of a `TriggerGroup` from @kitn.ai/ui — one trigger char + its items. */
export interface SampleTrigger {
  /** The character that opens this trigger's popover (e.g. '/' or '@'). */
  char: string;
  /** Default kind for the group's items (e.g. 'skill', 'agent'). */
  kind: string;
  items: SampleTriggerItem[];
}

/** Message action verbs supported by <kai-chat>. */
export type MessageAction = 'copy' | 'like' | 'dislike' | 'regenerate' | 'edit';

/** Minimal chat message shape (mirrors ChatMessage from @kitn.ai/ui/elements). */
export interface SampleMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: MessageAction[];
}

// ── Groups ────────────────────────────────────────────────────────────────────

export const SAMPLE_GROUPS: SampleGroup[] = [
  { id: 'g-work',     name: 'Work',     sortOrder: 0, createdAt: '2026-06-01T09:00:00.000Z' },
  { id: 'g-personal', name: 'Personal', sortOrder: 1, createdAt: '2026-06-02T09:00:00.000Z' },
];

// ── Conversations ─────────────────────────────────────────────────────────────

export const SAMPLE_CONVERSATIONS: SampleConversation[] = [
  {
    id: 'c-1',
    title: 'React + web components',
    groupId: 'g-work',
    scope: { type: 'collection' },
    messageCount: 2,
    lastMessageAt: '2026-06-10T15:30:00.000Z',
    updatedAt:     '2026-06-10T15:30:00.000Z',
  },
  {
    id: 'c-2',
    title: 'Centering a div',
    groupId: 'g-work',
    scope: { type: 'collection' },
    messageCount: 2,
    lastMessageAt: '2026-06-09T14:20:00.000Z',
    updatedAt:     '2026-06-09T14:20:00.000Z',
  },
  {
    id: 'c-3',
    title: 'TypeScript generics',
    groupId: 'g-personal',
    scope: { type: 'collection' },
    messageCount: 2,
    lastMessageAt: '2026-06-08T11:05:00.000Z',
    updatedAt:     '2026-06-08T11:05:00.000Z',
  },
];

// ── Messages (keyed by conversation id) ──────────────────────────────────────

export const SAMPLE_MESSAGES: Record<string, SampleMessage[]> = {
  'c-1': [
    {
      id: 'm1',
      role: 'user',
      content: 'How do I use kai-chat web components inside a React app?',
    },
    {
      id: 'm2',
      role: 'assistant',
      actions: ['copy', 'like', 'dislike'],
      content:
        "Just use the wrappers from `@kitn.ai/ui/react`:\n\n```tsx\nimport { Chat } from '@kitn.ai/ui/react';\n\n<Chat\n  messages={messages}\n  models={models}\n  onSubmit={(e) => console.log(e.detail)}\n  theme=\"auto\"\n/>\n```\n\nArrays/objects are passed as props and become live DOM properties; events arrive as `on<Event>` callbacks. No refs or `useEffect` needed.",
    },
  ],
  'c-2': [
    { id: 'm1', role: 'user', content: 'How do I center a div?' },
    {
      id: 'm2',
      role: 'assistant',
      actions: ['copy', 'like', 'dislike'],
      content:
        "The modern way is CSS Grid:\n\n```css\n.box {\n  display: grid;\n  place-items: center;\n}\n```\n\nThat centers the child on both axes with no magic numbers.",
    },
  ],
  'c-3': [
    { id: 'm1', role: 'user', content: 'Show a generic `identity` function in TypeScript.' },
    {
      id: 'm2',
      role: 'assistant',
      actions: ['copy', 'like', 'dislike'],
      content:
        "```typescript\nfunction identity<T>(value: T): T {\n  return value;\n}\n\nconst n = identity(42);    // number\nconst s = identity('hi'); // string\n```",
    },
  ],
};

// ── Models ────────────────────────────────────────────────────────────────────

export const SAMPLE_MODELS: SampleModel[] = [
  { id: 'sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
  { id: 'opus',   name: 'Claude Opus',   provider: 'Anthropic' },
  { id: 'haiku',  name: 'Claude Haiku',  provider: 'Anthropic' },
];

// ── Context meter ─────────────────────────────────────────────────────────────

export const SAMPLE_CONTEXT = {
  usedTokens:   8200,
  maxTokens:    200_000,
  inputTokens:  6400,
  outputTokens: 1800,
};

// ── Prompt suggestions ────────────────────────────────────────────────────────

export const SAMPLE_SUGGESTIONS: string[] = [
  'How do custom events work in React?',
  'Show me a streaming example',
  'What is SolidJS?',
];

// ── Triggers (entity pills) ─────────────────────────────────────────────────
//
// The `triggers` property powers in-line entity pills in the composer: typing a
// trigger char ('/' for skills, '@' for agents/plugins) opens a popover; picking
// an item drops an atomic pill into the draft. Set it as a JS PROPERTY on
// <kai-prompt-input> / <kai-chat> / <kai-workspace>, never as an HTML attribute.

export const SAMPLE_TRIGGERS: SampleTrigger[] = [
  {
    char: '/',
    kind: 'skill',
    items: [
      { id: 'summarize', label: 'Summarize', description: 'Summarize the thread', promptText: 'Summarize the thread.' },
      { id: 'translate', label: 'Translate', description: 'Translate to English' },
      { id: 'rewrite',   label: 'Rewrite',   description: 'Rewrite for clarity' },
    ],
  },
  {
    char: '@',
    kind: 'agent',
    items: [
      { id: 'code-reviewer', label: 'Code Reviewer', group: 'Agents',  description: 'Reviews diffs for bugs' },
      { id: 'researcher',    label: 'Researcher',    group: 'Agents',  description: 'Deep multi-source research' },
      { id: 'documents',     label: 'Documents',     group: 'Plugins', kind: 'plugin', description: 'Create and edit documents' },
    ],
  },
];
