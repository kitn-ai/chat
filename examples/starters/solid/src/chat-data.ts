// Self-contained sample data + the kit's shared mock responder — no backend.
//
// The seeded threads and the conversation rail live here so `App.tsx` reads as
// composition rather than as a wall of fixture data. Mirrors
// `examples/starters/react/src/chat-data.ts`; the types are the kit's own, taken
// from `@kitn.ai/ui/solid` rather than redeclared, because a Solid app renders
// the components directly and so already has them.
import type {
  ChatMessage,
  ChatMessageAction,
  ConversationGroup,
  ConversationSummary,
} from '@kitn.ai/ui/solid';
import { createMockResponder } from '@kitn.ai/ui/state';

export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2);
}

const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

const scope = { type: 'document' as const };

export const GROUPS: ConversationGroup[] = [
  { id: 'today', name: 'Today', sortOrder: 0, createdAt: iso(0) },
  { id: 'yesterday', name: 'Yesterday', sortOrder: 1, createdAt: iso(1) },
];

export const CONVERSATIONS: ConversationSummary[] = [
  {
    id: 'c1',
    title: 'SolidJS signals vs React hooks',
    groupId: 'today',
    scope,
    messageCount: 6,
    lastMessageAt: iso(0),
    updatedAt: iso(0),
  },
  {
    id: 'c2',
    title: 'Composing your own chat',
    groupId: 'today',
    scope,
    messageCount: 2,
    lastMessageAt: iso(0),
    updatedAt: iso(0),
  },
  {
    id: 'c3',
    title: 'Theming + dark mode',
    groupId: 'yesterday',
    scope,
    messageCount: 2,
    lastMessageAt: iso(1),
    updatedAt: iso(1),
  },
];

/** The action bar under every assistant message. Built-in names; `<MessageBody>`
 *  renders the buttons and reports clicks through `onAction`. */
export const ASSISTANT_ACTIONS: ChatMessageAction[] = ['copy', 'like', 'dislike', 'regenerate'];

/**
 * The in-memory conversation stash, keyed by conversation id.
 *
 * `createConversations` swaps the OPEN thread out to here and the picked one in,
 * so switching conversations does not lose what was already streamed. A real app
 * replaces this object with a fetch.
 *
 * The `c1` thread deliberately ends on a message carrying REASONING and a TOOL
 * part before its text. A message is an ordered list of parts, not a string, and
 * `<MessageBody>` renders each kind in place — flattening to text silently drops
 * both. The mock responder streams text only (it produces an OpenAI-shaped wire,
 * and that wire carries text deltas), so a seeded turn is what keeps the other
 * two part kinds on screen.
 */
export const THREADS: Record<string, ChatMessage[]> = {
  c1: [
    {
      id: 'c1u1',
      role: 'user',
      parts: [{ type: 'text', text: 'How does SolidJS reactivity differ from React hooks?' }],
    },
    {
      id: 'c1a1',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: `**SolidJS** takes a fundamentally different approach to reactivity.

### Signals vs useState

In SolidJS, signals are **fine-grained reactive primitives** — when a signal updates, only the DOM nodes that read it are updated; no virtual DOM diff required.

\`\`\`tsx
// SolidJS — runs once, DOM updates surgically
const [count, setCount] = createSignal(0);
return <p>{count()}</p>; // only this text node re-renders

// React — entire component re-renders
const [count, setCount] = useState(0);
return <p>{count}</p>; // whole function re-executes
\`\`\`

### Key differences

1. **No re-renders** — SolidJS components run once; only reactive expressions update
2. **No dependency arrays** — \`createEffect\` auto-tracks dependencies
3. **No stale closures** — signals are getter functions, always current`,
        },
      ],
    },
    {
      id: 'c1u2',
      role: 'user',
      parts: [{ type: 'text', text: "What's the signature of createResource?" }],
    },
    {
      id: 'c1a2',
      role: 'assistant',
      parts: [
        {
          type: 'reasoning',
          text: "They want the exact signature, not a paraphrase. I should look it up in the reference rather than recall it — the fetcher's second argument changed in 1.5 and I'd rather not guess.",
          label: 'Thinking',
        },
        {
          type: 'tool',
          tool: {
            type: 'search_docs',
            kind: 'search',
            state: 'output-available',
            toolCallId: 'call_docs_1',
            input: { query: 'createResource signature', version: '1.9' },
            output: {
              top: 'solidjs.com/docs/latest/api#createresource',
              excerpt:
                'createResource(source?, fetcher, options?) => [Resource, { mutate, refetch }]',
            },
          },
        },
        {
          type: 'text',
          text: `\`createResource\` returns a resource accessor plus an actions object.

\`\`\`ts
const [data, { mutate, refetch }] = createResource(source, fetcher);

// data()        — the value, or undefined while pending
// data.loading  — boolean
// data.error    — the thrown error, if any
\`\`\`

Omit \`source\` for a fetch that runs once; pass a signal to re-fetch whenever it changes.`,
        },
      ],
    },
  ],
  c2: [
    {
      id: 'c2u',
      role: 'user',
      parts: [
        { type: 'text', text: 'How do I build my own chat instead of dropping in `<kai-chat>`?' },
      ],
    },
    {
      id: 'c2a',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Put a `<Message>` per item inside a `<ChatContainer>`, hand each one\'s `parts` to `<MessageBody>`, and wire a `<PromptInput>` below it to append + stream. That is exactly what this example does — read `App.tsx`, then `components/ThreadView.tsx`.',
        },
      ],
    },
  ],
  c3: [
    { id: 'c3u', role: 'user', parts: [{ type: 'text', text: 'How does dark mode work?' }] },
    {
      id: 'c3a',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: "The kit ships a `.dark` class variant: `theme.css` declares every `--color-*` token twice, and `@custom-variant dark (&:is(.dark *))` flips the whole tree under it. Drive the class from app state — toggle it with the button top-right — and both the kit's components and your own chrome follow.",
        },
      ],
    },
  ],
};

export const SUGGESTIONS = [
  'How do SolidJS stores work?',
  'SolidJS TypeScript tips',
  'Show me some markdown',
];

// The replies the mock cycles through, one per turn. Markdown-rich on purpose:
// the thread renders markdown, code blocks and blockquotes, so the canned
// replies exercise that instead of only proving text arrives.
//
// The first one says it is a mock in words. That is the WEAKEST of the
// responder's tells and the only one a real model could imitate, which is
// exactly why it is not the only one — the rest are on the wire.
const MOCK_REPLIES = [
  "This reply streams token-by-token from the kit's own mock responder — no API key, no backend, no provider was contacted. Replace `mockResponse(text)` with a real model call (Anthropic, OpenAI, your own endpoint) to ship a real app.",
  'SolidJS **stores** are deeply reactive objects — good for shared state:\n\n```ts\nimport { createStore } from "solid-js/store";\n\nconst [state, setState] = createStore({ count: 0, user: { name: "Alice" } });\n\n// Fine-grained: only what reads state.count re-runs\nsetState("count", (c) => c + 1);\nsetState("user", "name", "Bob");\n```\n\nFor global state, wrap a store in `createContext` + `useContext`.',
  'I render **bold**, *italic*, `inline code`, lists, and code blocks:\n\n```ts\nconst stream = chat.streamAssistant();\nawait readOpenAIStream(mockResponse(text), stream);\nstream.done();\n```\n\n> Blockquotes too.',
  "This chat is **composed by hand** out of the SolidJS components: `<ConversationList>` for the sidebar, a `<Message>` + `<MessageBody>` per turn inside `<ChatContainer>`, and `<PromptInput>` at the bottom — all wired with `createSignal`. Swap `mockResponse(text)` for your own model call and you're shipping.",
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
