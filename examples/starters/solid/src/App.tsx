import { createSignal, For } from "solid-js";
import {
  ChatConfig,
  ChatContainer,
  ChatContainerContent,
  ChatContainerScrollAnchor,
  ConversationList,
  Message,
  MessageBody,
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
  Button,
  ScrollButton,
  PromptSuggestion,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@kitn.ai/ui";
import type {
  ChatMessage,
  ChatMessageAction,
  ConversationGroup,
  ConversationSummary,
  FeedbackVote,
} from "@kitn.ai/ui";
import { appendTextPart, partsToText } from "@kitn.ai/ui/state";
import { ArrowUp, Plus } from "lucide-solid";

// ─── Static seed data ────────────────────────────────────────────────────────

const scope = { type: "document" as const };

const groups: ConversationGroup[] = [
  { id: "today", name: "Today", sortOrder: 0, createdAt: "2026-06-11" },
  { id: "yesterday", name: "Yesterday", sortOrder: 1, createdAt: "2026-06-10" },
];

const seedConversations: ConversationSummary[] = [
  {
    id: "1",
    title: "SolidJS signals vs React hooks",
    groupId: "today",
    scope,
    messageCount: 4,
    lastMessageAt: "2026-06-11T15:30:00Z",
    updatedAt: "2026-06-11T15:30:00Z",
  },
  {
    id: "2",
    title: "Tailwind v4 @source directive",
    groupId: "today",
    scope,
    messageCount: 6,
    lastMessageAt: "2026-06-11T11:00:00Z",
    updatedAt: "2026-06-11T11:00:00Z",
  },
  {
    id: "3",
    title: "Vite plugin ordering",
    groupId: "yesterday",
    scope,
    messageCount: 3,
    lastMessageAt: "2026-06-10T17:00:00Z",
    updatedAt: "2026-06-10T17:00:00Z",
  },
];

// ─── Seeded messages ──────────────────────────────────────────────────────────

// `ChatMessage` is the kit's own public type — same shape the elements and the
// `@kitn.ai/ui/wire` adapter produce, so nothing here is starter-specific.

/** The action bar under every assistant message. Built-in names; `<MessageBody>`
 *  renders the buttons and reports clicks through `onAction`. */
const ASSISTANT_ACTIONS: ChatMessageAction[] = ["copy", "like", "dislike", "regenerate"];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "How does SolidJS reactivity differ from React hooks?" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `**SolidJS** takes a fundamentally different approach to reactivity.

### Signals vs useState

In SolidJS, signals are **fine-grained reactive primitives** — when a signal updates, only the DOM nodes that read it are updated; no virtual DOM diff required.

\`\`\`typescript
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
    id: "u2",
    role: "user",
    parts: [{ type: "text", text: "What about createEffect vs useEffect?" }],
  },
  {
    id: "a2",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `\`createEffect\` in SolidJS auto-tracks all reactive dependencies — no dependency array needed.

\`\`\`typescript
// SolidJS — auto-tracks count and name
createEffect(() => {
  console.log(count(), name());
});

// React — must manually declare deps
useEffect(() => {
  console.log(count, name);
}, [count, name]); // easy to get wrong
\`\`\`

The biggest win: **no stale closure bugs**. Because \`count()\` is a function call, you always get the latest value.`,
      },
    ],
  },
  {
    id: "u3",
    role: "user",
    parts: [{ type: "text", text: "What's the signature of createResource?" }],
  },
  // A message is an ORDERED list of parts, not a string. This one carries a
  // reasoning block and a tool call before its answer — <MessageBody> renders
  // each in place. Flattening the parts to text (which this starter used to do)
  // silently drops both.
  {
    id: "a3",
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        text: "They want the exact signature, not a paraphrase. I should look it up in the reference rather than recall it — the fetcher's second argument changed in 1.5 and I'd rather not guess.",
        label: "Thinking",
      },
      {
        type: "tool",
        tool: {
          type: "search_docs",
          kind: "search",
          state: "output-available",
          toolCallId: "call_docs_1",
          input: { query: "createResource signature", version: "1.9" },
          output: {
            top: "solidjs.com/docs/latest/api#createresource",
            excerpt: "createResource(source?, fetcher, options?) => [Resource, { mutate, refetch }]",
          },
        },
      },
      {
        type: "text",
        text: `\`createResource\` returns a resource accessor plus an actions object.

\`\`\`typescript
const [data, { mutate, refetch }] = createResource(source, fetcher);

// data() — the value, or undefined while pending
// data.loading — boolean
// data.error — the thrown error, if any
\`\`\`

Omit \`source\` for a fetch that runs once; pass a signal to re-fetch whenever it changes.`,
      },
    ],
  },
];

// ─── Canned reply generator ───────────────────────────────────────────────────

function cannedReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("store") || t.includes("context"))
    return `SolidJS **stores** are deeply reactive objects — perfect for shared state.

\`\`\`typescript
import { createStore } from "solid-js/store";

const [state, setState] = createStore({ count: 0, user: { name: "Alice" } });

// Fine-grained: only components reading state.count re-run
setState("count", c => c + 1);

// Nested updates also fine-grained
setState("user", "name", "Bob");
\`\`\`

For global state, wrap a store in a context with \`createContext\` + \`useContext\`.`;

  if (t.includes("typescript") || t.includes("type"))
    return `SolidJS has excellent TypeScript support out of the box.

\`\`\`typescript
import type { Component, ParentComponent } from "solid-js";

const Counter: Component<{ initial?: number }> = (props) => {
  const [count, setCount] = createSignal(props.initial ?? 0);
  return <button onClick={() => setCount(c => c + 1)}>{count()}</button>;
};

// ParentComponent adds children prop automatically
const Card: ParentComponent<{ title: string }> = (props) => (
  <div>
    <h2>{props.title}</h2>
    {props.children}
  </div>
);
\`\`\``;

  return `That's a great question! Here's a quick rundown:

- **Signals** (\`createSignal\`) — atomic reactive state
- **Memos** (\`createMemo\`) — derived/computed values, cached
- **Effects** (\`createEffect\`) — side-effects, auto-tracked
- **Stores** (\`createStore\`) — deeply reactive objects
- **Resources** (\`createResource\`) — async data fetching

Each primitive composes cleanly. You rarely need anything beyond these five.`;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeId, setActiveId] = createSignal("1");
  const [messages, setMessages] = createSignal<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = createSignal("");
  const [isLoading, setIsLoading] = createSignal(false);
  // Action-bar state. <MessageBody> is prop-driven and holds no signals of its
  // own, so the app owns the vote and the transient "copied" flag.
  const [votes, setVotes] = createSignal<Record<string, FeedbackVote | undefined>>({});
  const [copiedId, setCopiedId] = createSignal<string | null>(null);

  /** Stream `reply` into `assistantId` word-by-word. A NEW parts array per chunk
   *  (`appendTextPart` returns one) is what makes the thread re-render. */
  function streamReply(assistantId: string, reply: string) {
    const words = reply.split(" ");
    setIsLoading(true);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      const delta = (i > 1 ? " " : "") + words[i - 1];
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, parts: appendTextPart(m.parts, delta) } : m)),
      );
      if (i >= words.length) {
        clearInterval(timer);
        setIsLoading(false);
      }
    }, 35);
  }

  function handleSubmit() {
    const text = inputValue().trim();
    if (!text || isLoading()) return;

    const userMsg: ChatMessage = {
      id: `u${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text }],
    };
    const assistantId = `a${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", parts: [] },
    ]);
    setInputValue("");
    streamReply(assistantId, cannedReply(text));
  }

  /** Regenerate: clear the message's parts and re-stream a reply to the user
   *  turn that preceded it. */
  function regenerate(assistantId: string) {
    if (isLoading()) return;
    const all = messages();
    const at = all.findIndex((m) => m.id === assistantId);
    const prompt = all
      .slice(0, at)
      .reverse()
      .find((m) => m.role === "user");
    if (!prompt) return;
    setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, parts: [] } : m)));
    streamReply(assistantId, cannedReply(partsToText(prompt.parts)));
  }

  /** One handler for the whole action bar — `id` is the built-in action name. */
  function handleAction(msg: ChatMessage, id: string) {
    if (id === "copy") {
      void navigator.clipboard?.writeText(partsToText(msg.parts));
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((c) => (c === msg.id ? null : c)), 2000);
      return;
    }
    if (id === "like" || id === "dislike") {
      setVotes((prev) => ({ ...prev, [msg.id]: prev[msg.id] === id ? undefined : id }));
      return;
    }
    if (id === "regenerate") regenerate(msg.id);
  }

  function handleSuggestion(text: string) {
    setInputValue(text);
  }

  return (
    <ChatConfig>
      <div class="h-screen w-full bg-background overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          {/* ── Sidebar ── */}
          <ResizablePanel defaultSize={22} data-min-size="180" data-max-size="360">
            <ConversationList
              groups={groups}
              conversations={seedConversations}
              activeId={activeId()}
              onSelect={setActiveId}
              onNewChat={() => {}}
            />
          </ResizablePanel>

          <ResizableHandle handle="grip" />

          {/* ── Main chat area ── */}
          <ResizablePanel>
            <main class="flex flex-1 flex-col overflow-hidden h-full">
              {/* Header */}
              <header class="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
                <span class="text-sm font-semibold text-foreground">
                  SolidJS signals vs React hooks
                </span>
                <span class="text-xs text-muted-foreground">
                  @kitn.ai/ui primitives · SolidJS + Vite
                </span>
              </header>

              {/* Scrollable message thread */}
              <div class="relative flex-1 overflow-y-auto">
                <ChatContainer class="h-full">
                  <ChatContainerContent class="space-y-0 px-5 pt-4 pb-12">
                    {/* One <MessageBody> per message. It walks `parts` in order
                        and renders each kind — text as markdown, reasoning as a
                        collapsible block, tool calls as a panel, cards through
                        the card registry — and owns the action bar. */}
                    <For each={messages()}>
                      {(msg) => (
                        <Message
                          class={`mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 ${
                            msg.role === "user" ? "items-end" : "items-start"
                          }`}
                        >
                          <div class="group flex w-full flex-col gap-0">
                            <MessageBody
                              parts={msg.parts}
                              isUser={msg.role === "user"}
                              markdown={msg.role !== "user"}
                              actions={msg.role === "user" ? undefined : ASSISTANT_ACTIONS}
                              actionsReveal="hover"
                              activeFeedback={votes()[msg.id]}
                              copied={copiedId() === msg.id}
                              onAction={(id) => handleAction(msg, id)}
                            />
                          </div>
                        </Message>
                      )}
                    </For>

                    <ChatContainerScrollAnchor />
                  </ChatContainerContent>

                  {/* Scroll-to-bottom button */}
                  <div class="absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-center px-5">
                    <ScrollButton class="shadow-sm" />
                  </div>
                </ChatContainer>
              </div>

              {/* Prompt input area */}
              <div class="shrink-0 bg-background px-3 pb-3 md:px-5 md:pb-5">
                <div class="mx-auto max-w-3xl">
                  {/* Suggestions */}
                  <div class="flex gap-2 pb-3 flex-wrap">
                    <PromptSuggestion onClick={() => handleSuggestion("How do SolidJS stores work?")}>
                      How do stores work?
                    </PromptSuggestion>
                    <PromptSuggestion onClick={() => handleSuggestion("SolidJS TypeScript tips")}>
                      TypeScript tips
                    </PromptSuggestion>
                  </div>

                  <PromptInput
                    value={inputValue()}
                    onValueChange={setInputValue}
                    onSubmit={handleSubmit}
                  >
                    <div class="flex flex-col">
                      <PromptInputTextarea
                        placeholder="Ask about SolidJS…"
                        class="min-h-[44px] pt-3 pl-4"
                      />
                      <PromptInputActions class="mt-2 flex w-full items-center justify-between gap-2 px-3 pb-3">
                        <div class="flex items-center gap-2">
                          <Button variant="outline" size="icon-sm" class="rounded-full" disabled>
                            <Plus class="size-4" />
                          </Button>
                        </div>
                        <Button
                          size="icon-sm"
                          class="rounded-full"
                          disabled={!inputValue().trim() || isLoading()}
                          onClick={handleSubmit}
                        >
                          <ArrowUp class="size-4" />
                        </Button>
                      </PromptInputActions>
                    </div>
                  </PromptInput>
                </div>
              </div>
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ChatConfig>
  );
}
