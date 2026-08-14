// Self-contained sample data + the kit's shared mock responder — no backend.
//
// THIS MODULE IS EVALUATED TWICE: once on the server while the page is being
// prerendered, and once in the browser. Everything in it is therefore plain data
// and pure functions — nothing here touches `window`, `document` or
// `customElements`, which is the rule for any module a Server Component's tree
// reaches, client island or not.
//
// The date helper below is the one thing that produces a DIFFERENT value on each
// of those two evaluations, and it is safe for a specific reason worth knowing:
// `CONVERSATIONS` is only ever handed to `<kai-conversations>` as a JS PROPERTY,
// and the React wrappers assign properties in a layout effect, which never runs
// on the server. So no timestamp reaches the server-rendered HTML and there is
// nothing for hydration to compare. Render one of these into JSX and that stops
// being true — that is the shape of a real hydration mismatch.
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
  { id: 'c1', title: 'Server components', scope: { type: 'collection' }, messageCount: 2, lastMessageAt: iso(0), updatedAt: iso(0) },
  { id: 'c2', title: 'Composing your own chat', scope: { type: 'collection' }, messageCount: 2, lastMessageAt: iso(0), updatedAt: iso(0) },
  { id: 'c3', title: 'Theming + dark mode', scope: { type: 'collection' }, messageCount: 2, lastMessageAt: iso(1), updatedAt: iso(1) },
];

export const THREADS: Record<string, Msg[]> = {
  c1: [
    { id: 'c1u', role: 'user', parts: [{ type: 'text', text: 'Where does the "use client" directive go, and how do the kai-* elements survive the App Router?' }] },
    { id: 'c1a', role: 'assistant', parts: [{ type: 'text', text: "`app/layout.tsx` and `app/page.tsx` are **Server Components** — neither carries a directive. `app/workspace.tsx` does, because IT uses hooks and event handlers. That is the standard RSC rule, not a kit requirement: the React wrappers ship their own `'use client'` banner, so a Server Component can render one directly.\n\nThe elements themselves server-render as **bare tags**. Each wrapper registers its element inside a layout effect, which never runs on the server, so the prerendered HTML contains `<kai-thread></kai-thread>` and nothing inside it. After hydration the wrapper defines the element and assigns `messages` as a live JS **property** — arrays go across unstringified, so nothing has to be serialized into an attribute.\n\nView source on this page and you will find the empty tags. Then watch this reply stream in: that is the same property channel still working, one new array reference per chunk." }] },
  ],
  c2: [
    { id: 'c2u', role: 'user', parts: [{ type: 'text', text: 'How do I build my own chat instead of dropping in `<kai-chat>`?' }] },
    { id: 'c2a', role: 'assistant', parts: [{ type: 'text', text: "Put a `<Thread>` in a scroll area, a `<PromptInput>` below it, and let `useKaiChat` own the message array and the streaming. That's exactly what this app does — read `app/workspace.tsx`." }] },
  ],
  c3: [
    { id: 'c3u', role: 'user', parts: [{ type: 'text', text: 'How does dark mode work?' }] },
    { id: 'c3a', role: 'assistant', parts: [{ type: 'text', text: "Each element takes a `theme` prop (`light` / `dark` / `auto`). Drive it from client state — toggle it with the button top-right. The kit's `--color-*` tokens flip under a `.dark` class for your own surrounding chrome." }] },
  ],
};

export const SUGGESTIONS = [
  'Where does "use client" go?',
  'How do I install it?',
  'Show me some markdown',
];

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

// The replies the mock cycles through, one per turn. Markdown-rich on purpose:
// the thread renders markdown, code blocks and blockquotes, so the canned replies
// exercise that instead of only proving text arrives.
//
// The first one says it is a mock in words. That is the WEAKEST of the responder's
// tells and the only one a real model could imitate, which is exactly why it is
// not the only one — the rest are on the wire, below.
const MOCK_REPLIES = [
  "This reply streams token-by-token from the kit's own mock responder — no API key, no backend, no provider was contacted. Replace `mockResponse(text)` with a real model call (Anthropic, OpenAI, your own route handler) to ship a real app.",
  "Install it:\n\n```bash\nnpm install @kitn.ai/ui\n```\n\nThen import the wrappers + tokens:\n\n```tsx\nimport { Thread, PromptInput } from '@kitn.ai/ui/react';\nimport '@kitn.ai/ui/theme.tokens.css';\n```",
  "I render **bold**, *italic*, `inline code`, lists, and code blocks:\n\n```ts\nconst stream = chat.streamAssistant();\nawait readOpenAIStream(mockResponse(text), stream);\nstream.done();\n```\n\n> Blockquotes too.",
  "Nothing about this thread came from the server. Next prerendered the **empty** `<kai-thread>` tag, the browser hydrated it, and every chunk you are reading now arrived as a new `messages` array assigned to that element as a JS property.",
];

/**
 * The kit's own mock responder, shared with the `kai` MCP scaffolder and
 * `create-kai` so there is ONE implementation of this and not eight.
 *
 * It yields canned SSE frames in the OpenAI chat-completions shape, which
 * `readOpenAIStream` parses exactly as it parses a real provider's. So this
 * no-backend preview runs the kit's REAL streaming path — the SSE reader, the
 * part folding, all of it — rather than a hand-rolled loop that merely resembles
 * it. Going live then changes one expression, not the handler.
 *
 * It also cannot be mistaken for a real turn: the stream opens with a `: kai-mock`
 * SSE comment, every frame carries a `_kai_mock` field, `model` reports as
 * `kai-mock` (no provider serves that, so an echoed mock frame is rejected
 * upstream rather than quietly believed), and usage is all zeros.
 *
 * MODULE scope, not per-send: the responder owns the cursor into the replies
 * above, so rebuilding it each turn would answer with the first one forever.
 */
export const mockResponse = createMockResponder({ replies: MOCK_REPLIES });
