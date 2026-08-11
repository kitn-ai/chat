// Sample data for <kai-workspace> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding this file is all that's needed — no shared file edits required.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into
//
// Non-scalar props:
//   groups          — pre-bucketed sidebar groups (optional; element auto-buckets if omitted)
//   conversations   — flat list of conversation summaries
//   messages        — the active thread (newest last)
//   models          — model options for the header switcher
//   suggestions     — starter prompts shown on an empty thread
//   triggers        — entity-pill trigger definitions (/ skills, @ agents/plugins)
//   context         — token-usage meter in the header

// ── shared conversation list ───────────────────────────────────────────────────

const CONVERSATIONS = [
  {
    id: 'c-1',
    title: 'Web component architecture',
    scope: { type: 'document' },
    messageCount: 12,
    lastMessageAt: '2026-06-16T10:00:00.000Z',
    updatedAt: '2026-06-16T10:00:00.000Z',
  },
  {
    id: 'c-2',
    title: 'Theming & design tokens',
    scope: { type: 'document' },
    messageCount: 7,
    lastMessageAt: '2026-06-16T08:30:00.000Z',
    updatedAt: '2026-06-16T08:30:00.000Z',
  },
  {
    id: 'c-3',
    title: 'Publishing pipeline review',
    scope: { type: 'document' },
    messageCount: 5,
    lastMessageAt: '2026-06-15T14:00:00.000Z',
    updatedAt: '2026-06-15T14:00:00.000Z',
  },
  {
    id: 'c-4',
    title: 'API migration notes',
    scope: { type: 'document' },
    messageCount: 9,
    lastMessageAt: '2026-06-14T11:00:00.000Z',
    updatedAt: '2026-06-14T11:00:00.000Z',
  },
  {
    id: 'c-5',
    title: 'Q2 launch plan',
    scope: { type: 'document' },
    messageCount: 3,
    lastMessageAt: '2026-06-10T09:00:00.000Z',
    updatedAt: '2026-06-10T09:00:00.000Z',
  },
];

// ── default thread messages ────────────────────────────────────────────────────

const BASE_MESSAGES = [
  {
    id: 'm-1',
    role: 'user',
    parts: [{ type: 'text', text: 'How do I drop the whole chat app in with one tag?' }],
  },
  {
    id: 'm-2',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Use `<kai-workspace>` — set `conversations`, `messages`, and `models` as JS properties and listen for `kai-conversation-select` and `kai-submit`.\n\n```html\n<kai-workspace id="workspace" style="display:block; height:100vh;"></kai-workspace>\n\n<script type="module">\n  import \'@kitn.ai/ui/elements\';\n  const ws = document.getElementById(\'workspace\');\n  ws.conversations = [...];\n  ws.messages = [...];\n  ws.addEventListener(\'kai-submit\', (e) => console.log(e.detail.value));\n</script>\n```\n\nThat\'s the whole setup. The sidebar, thread, and prompt composer are all wired up internally.',
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
];

// ── loading state thread ───────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  {
    id: 'm-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Can you summarise the publishing pipeline document?' }],
  },
];

// ── model switcher ─────────────────────────────────────────────────────────────

const MODEL_LIST = [
  { id: 'claude-4-opus', name: 'Claude 4 Opus', provider: 'Anthropic' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gemini-1-5-pro', name: 'Gemini 1.5 Pro', provider: 'Google' },
];

const MODEL_MESSAGES = [
  {
    id: 'm-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Which model should I use for code generation?' }],
  },
  {
    id: 'm-2',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Each has its strength:\n\n- **Claude 4 Opus** — best for complex, multi-step reasoning and long-context editing.\n- **Claude 3.5 Sonnet** — fast, nuanced, excellent at following detailed instructions.\n- **GPT-4o** — broad language support, strong at refactoring.\n- **Gemini 1.5 Pro** — very large context window, great for repo-wide analysis.',
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
];

// ── suggestions (empty thread) ─────────────────────────────────────────────────

const SUGGESTION_LIST = [
  'Summarise this document',
  'Write a unit test for this function',
  'Explain this error message',
  'Refactor this code for readability',
];

// ── entity triggers (/ skills, @ agents/plugins) ──────────────────────────────

const TRIGGERS = [
  { char: '/', kind: 'skill', items: [
    { id: 'summarize', label: 'Summarize', description: 'Summarize the thread', promptText: 'Summarize the thread.' },
    { id: 'translate', label: 'Translate', description: 'Translate to English' },
    { id: 'rewrite', label: 'Rewrite', description: 'Rewrite for clarity' },
  ] },
  { char: '@', kind: 'agent', items: [
    { id: 'code-reviewer', label: 'Code Reviewer', group: 'Agents', description: 'Reviews diffs for bugs' },
    { id: 'researcher', label: 'Researcher', group: 'Agents', description: 'Deep multi-source research' },
    { id: 'documents', label: 'Documents', kind: 'plugin', group: 'Plugins', description: 'Create and edit documents' },
  ] },
];

const TRIGGER_MESSAGES = [
  {
    id: 'm-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Review the checkout path' }],
  },
  {
    id: 'm-2',
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Type `/` for a skill or `@` for an agent or plugin — each selection drops an atomic pill into the prompt below.' },
    ],
    actions: ['copy'],
  },
];

// ── pre-bucketed groups ────────────────────────────────────────────────────────

const GROUPS = [
  { id: 'g-today', name: 'Today', sortOrder: 0, createdAt: '2026-06-16T00:00:00.000Z' },
  { id: 'g-yesterday', name: 'Yesterday', sortOrder: 1, createdAt: '2026-06-15T00:00:00.000Z' },
];

const GROUPED_CONVERSATIONS = [
  {
    id: 'c-1',
    title: 'Web component architecture',
    groupId: 'g-today',
    scope: { type: 'document' },
    messageCount: 12,
    lastMessageAt: '2026-06-16T10:00:00.000Z',
    updatedAt: '2026-06-16T10:00:00.000Z',
  },
  {
    id: 'c-2',
    title: 'Theming & design tokens',
    groupId: 'g-today',
    scope: { type: 'document' },
    messageCount: 7,
    lastMessageAt: '2026-06-16T08:30:00.000Z',
    updatedAt: '2026-06-16T08:30:00.000Z',
  },
  {
    id: 'c-3',
    title: 'Publishing pipeline review',
    groupId: 'g-yesterday',
    scope: { type: 'document' },
    messageCount: 5,
    lastMessageAt: '2026-06-15T14:00:00.000Z',
    updatedAt: '2026-06-15T14:00:00.000Z',
  },
  {
    id: 'c-4',
    title: 'API migration notes',
    groupId: 'g-yesterday',
    scope: { type: 'document' },
    messageCount: 9,
    lastMessageAt: '2026-06-15T11:00:00.000Z',
    updatedAt: '2026-06-15T11:00:00.000Z',
  },
];

// ── context token meter ────────────────────────────────────────────────────────

const CONTEXT_DATA = {
  usedTokens: 18500,
  maxTokens: 32000,
  inputTokens: 14200,
  outputTokens: 4300,
  estimatedCost: 0.074,
};

// ── exports ────────────────────────────────────────────────────────────────────

export default {
  // Default playground sample — conversations sidebar + active thread.
  sample: {
    conversations: CONVERSATIONS,
    messages: BASE_MESSAGES,
    activeId: 'c-1',
    chatTitle: 'Web component architecture',
  },
  named: {
    // Loading state — spinner shown in the thread while a reply streams in.
    loading: {
      conversations: CONVERSATIONS,
      messages: LOADING_MESSAGES,
      activeId: 'c-3',
      chatTitle: 'Publishing pipeline review',
    },
    // Model switcher — multiple models surfaced in the header.
    withModels: {
      conversations: CONVERSATIONS,
      messages: MODEL_MESSAGES,
      models: MODEL_LIST,
      currentModel: 'claude-4-opus',
      activeId: 'c-1',
      chatTitle: 'Web component architecture',
    },
    // Starter suggestions on an empty thread.
    withSuggestions: {
      conversations: CONVERSATIONS,
      messages: [],
      suggestions: SUGGESTION_LIST,
      activeId: 'c-2',
      chatTitle: 'Theming & design tokens',
    },
    // Entity pills — type "/" for a skill or "@" for an agent/plugin.
    withTriggers: {
      conversations: CONVERSATIONS,
      messages: TRIGGER_MESSAGES,
      triggers: TRIGGERS,
      activeId: 'c-1',
      chatTitle: 'Web component architecture',
    },
    // Sidebar collapsed on load — chat panel fills the full width.
    sidebarCollapsed: {
      conversations: CONVERSATIONS,
      messages: BASE_MESSAGES,
      activeId: 'c-1',
      chatTitle: 'Web component architecture',
    },
    // Pre-bucketed groups — caller supplies Today / Yesterday buckets explicitly.
    withGroups: {
      groups: GROUPS,
      conversations: GROUPED_CONVERSATIONS,
      messages: BASE_MESSAGES,
      activeId: 'c-1',
      chatTitle: 'Web component architecture',
    },
    // Context token meter shown in the header.
    withContext: {
      conversations: CONVERSATIONS,
      messages: MODEL_MESSAGES,
      models: MODEL_LIST,
      currentModel: 'claude-3-5-sonnet',
      context: CONTEXT_DATA,
      activeId: 'c-1',
      chatTitle: 'Web component architecture',
    },
  },
};
