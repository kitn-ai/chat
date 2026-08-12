// Self-contained sample data + the kit's shared mock responder, no backend.
import type { MessagePart } from '@kitn.ai/ui';
import { createMockResponder } from '@kitn.ai/ui/state';

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
  parts: MessagePart[];
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
    { id: 'c1u', role: 'user', parts: [{ type: 'text', text: 'What is @kitn.ai/ui?' }] },
    { id: 'c1a', role: 'assistant', parts: [{ type: 'text', text: '**@kitn.ai/ui** is a set of framework-agnostic web components for AI chat UIs: message threads, streaming, markdown, tool panels, and more. This demo composes its `<kai-conversations>`, `<kai-thread>`, and `<kai-prompt-input>` elements by hand.' }] },
  ],
  c2: [
    { id: 'c2u', role: 'user', parts: [{ type: 'text', text: 'How do I build my own chat instead of dropping in `<kai-chat>`?' }] },
    { id: 'c2a', role: 'assistant', parts: [{ type: 'text', text: "Feed your `messages` to a `<kai-thread>`, put a `<kai-prompt-input>` below, and wire `kai-submit` to append + stream. That's exactly what this example does. Read `app.ts`." }] },
  ],
  c3: [
    { id: 'c3u', role: 'user', parts: [{ type: 'text', text: 'How does dark mode work?' }] },
    { id: 'c3a', role: 'assistant', parts: [{ type: 'text', text: "Each element takes a `theme` prop (`light` / `dark` / `auto`). Drive it from app state. Toggle it with the button top-right. The kit's `--color-*` tokens flip under a `.dark` class for your own surrounding chrome." }] },
  ],
};

export const SUGGESTIONS = ['What is @kitn.ai/ui?', 'How do I install it?', 'Show me some markdown'];

// Rich entity triggers for the prompt input: typing `/` opens the skills menu,
// `@` opens the agents menu. Each selection inserts an atomic pill. Set on
// <kai-prompt-input> as the `triggers` JS property (a TriggerDef[]).
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

// The replies the mock cycles through, one per turn. Markdown-rich on purpose:
// the thread renders markdown, code blocks and blockquotes, so the canned
// replies exercise that instead of only proving text arrives.
//
// The first one says it is a mock in words. That is the WEAKEST of the
// responder's tells and the only one a real model could imitate, which is
// exactly why it is not the only one — the rest are on the wire, below.
const MOCK_REPLIES = [
  "This reply streams token-by-token from the kit's own mock responder. No API key, no backend, no provider was contacted. Replace `mockResponse(text)` with a real model call (Anthropic, OpenAI, your own endpoint) to ship a real app.",
  "Install it:\n\n```bash\nnpm install @kitn.ai/ui\n```\n\nThen register the elements + load the tokens:\n\n```ts\nimport '@kitn.ai/ui/elements';\nimport '@kitn.ai/ui/theme.tokens.css';\n```\n\nNow drop `<kai-thread>` and `<kai-prompt-input>` into your template.",
  "I render **bold**, *italic*, `inline code`, lists, and code blocks:\n\n```ts\nconst stream = this.chat.streamAssistant();\nawait readOpenAIStream(mockResponse(text), stream);\nstream.done();\n```\n\n> Blockquotes too.",
  "This chat is **composed by hand**: `<kai-conversations>` for the sidebar, a `<kai-thread>` for the messages, and `<kai-prompt-input>` at the bottom, all wired with plain reactive state. Swap `mockResponse(text)` for your own model call and you're shipping.",
];

/**
 * The kit's own mock responder, shared with the `kai` MCP scaffolder and
 * `create-kai` so there is ONE implementation of this and not seven.
 *
 * It yields canned SSE frames in the OpenAI chat-completions shape, which
 * `readOpenAIStream` parses exactly as it parses a real provider's. So this
 * no-backend preview runs the kit's REAL streaming path — the SSE reader, the
 * part folding, all of it — rather than a hand-rolled loop that merely
 * resembles it. Going live then changes one expression, not the handler.
 *
 * It also cannot be mistaken for a real turn: the stream opens with a
 * `: kai-mock` SSE comment, every frame carries a `_kai_mock` field, `model`
 * reports as `kai-mock` (no provider serves that, so an echoed mock frame is
 * rejected upstream rather than quietly believed), and usage is all zeros.
 *
 * MODULE scope, not per-send: the responder owns the cursor into the replies
 * above, so rebuilding it each turn would answer with the first one forever.
 */
export const mockResponse = createMockResponder({ replies: MOCK_REPLIES });
