// Self-contained sample data + a local fake streaming responder — no backend.
export interface Conversation {
  id: string;
  title: string;
  scope: { type: 'document' | 'collection' };
  messageCount: number;
  lastMessageAt: string;
  updatedAt: string;
}
export interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2);
}

const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export const CONVERSATIONS: Conversation[] = [
  { id: 'c1', title: 'Getting started', scope: { type: 'collection' }, messageCount: 2, lastMessageAt: iso(0), updatedAt: iso(0) },
  { id: 'c2', title: 'Composing your own chat', scope: { type: 'collection' }, messageCount: 2, lastMessageAt: iso(0), updatedAt: iso(0) },
  { id: 'c3', title: 'Theming + dark mode', scope: { type: 'collection' }, messageCount: 2, lastMessageAt: iso(1), updatedAt: iso(1) },
];

export const THREADS: Record<string, Msg[]> = {
  c1: [
    { id: 'c1u', role: 'user', content: 'What is @kitn.ai/ui?' },
    { id: 'c1a', role: 'assistant', content: '**@kitn.ai/ui** is a set of framework-agnostic web components for AI chat UIs — message threads, streaming, markdown, tool panels, and more. This demo composes its `<kai-conversations>`, `<kai-message>`, and `<kai-prompt-input>` elements by hand.' },
  ],
  c2: [
    { id: 'c2u', role: 'user', content: 'How do I build my own chat instead of dropping in `<kai-chat>`?' },
    { id: 'c2a', role: 'assistant', content: "Map your `messages` to `<Message>` elements inside a scroll area, put a `<PromptInput>` below, and wire `onSubmit` to append + stream. That's exactly what this example does — read `App.tsx`." },
  ],
  c3: [
    { id: 'c3u', role: 'user', content: 'How does dark mode work?' },
    { id: 'c3a', role: 'assistant', content: "Each element takes a `theme` prop (`light` / `dark` / `auto`). Drive it from app state — toggle it with the button top-right. The kit's `--color-*` tokens flip under a `.dark` class for your own surrounding chrome." },
  ],
};

export const SUGGESTIONS = ['What is @kitn.ai/ui?', 'How do I install it?', 'Show me some markdown'];

// Rich entity triggers for the prompt input: typing `/` opens the skills menu,
// `@` opens the agents menu. Each selection inserts an atomic pill. Set on
// <PromptInput> as the `triggers` JS property (a TriggerDef[]).
export const TRIGGERS = [
  {
    char: '/',
    kind: 'skill',
    items: [
      { id: 'summarize', label: 'Summarize', description: 'Summarize the thread', promptText: 'Summarize the thread.' },
      { id: 'translate', label: 'Translate', description: 'Translate to English', promptText: 'Translate to English.' },
      { id: 'rewrite', label: 'Rewrite', description: 'Rewrite for clarity', promptText: 'Rewrite this for clarity.' },
    ],
  },
  {
    char: '@',
    kind: 'agent',
    items: [
      { id: 'researcher', label: 'Researcher', description: 'Deep web research', group: 'Agents' },
      { id: 'coder', label: 'Coder', description: 'Writes and edits code', group: 'Agents' },
      { id: 'designer', label: 'Designer', description: 'UI and visual design', group: 'Agents' },
    ],
  },
];

const REPLIES: { match: RegExp; text: string }[] = [
  {
    match: /install|setup|getting started|how do i (start|use)/i,
    text: "Install it:\n\n```bash\nnpm install @kitn.ai/ui\n```\n\nThen import the wrappers + tokens:\n\n```tsx\nimport { Conversations, Message, PromptInput } from '@kitn.ai/ui/react';\nimport '@kitn.ai/ui/theme.tokens.css';\n```",
  },
  {
    match: /markdown|format|code|highlight/i,
    text: "I render **bold**, *italic*, `inline code`, lists, and code blocks:\n\n```ts\nconst chat = useKaiChat();\nawait streamFakeReply(text, (d) => stream.appendText(d));\n```\n\n> Blockquotes too.",
  },
  {
    match: /compose|build|piece|element|how/i,
    text: "This chat is **composed by hand**: `<Conversations>` for the sidebar, a `<Message>` per item in a scroll area, and `<PromptInput>` at the bottom — all wired with React state. Swap in your own model call where `streamFakeReply` is and you're shipping.",
  },
  {
    match: /what|who|about|can you|do you/i,
    text: "**@kitn.ai/ui** is framework-agnostic, Shadow-DOM web components for AI chat UIs. This demo composes the individual elements rather than the batteries-included `<kai-chat>`.",
  },
];

const DEFAULT =
  "This reply streams token-by-token from a local fake responder — no API key, no backend. Replace `streamFakeReply` with a real model call (Anthropic, OpenAI, your own endpoint) to ship a real app.";

function pickReply(prompt: string): string {
  return REPLIES.find((r) => r.match.test(prompt))?.text ?? DEFAULT;
}

/** Simulate token-by-token streaming of a canned, markdown-rich reply. */
export async function streamFakeReply(prompt: string, onDelta: (delta: string) => void): Promise<void> {
  const reply = pickReply(prompt);
  const tokens = reply.match(/\s*\S+/g) ?? [reply];
  for (const token of tokens) {
    await new Promise((r) => setTimeout(r, 24 + Math.random() * 38));
    onDelta(token);
  }
}
