import { createSignal, For, Show } from "solid-js";
import {
  ChatConfig,
  ChatContainer,
  ChatContainerContent,
  ChatContainerScrollAnchor,
  ConversationList,
  Message,
  MessageActions,
  MessageContent,
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
import type { ConversationGroup, ConversationSummary } from "@kitn.ai/ui";
import { ArrowUp, Copy, Plus, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-solid";

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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "u1",
    role: "user",
    content: "How does SolidJS reactivity differ from React hooks?",
  },
  {
    id: "a1",
    role: "assistant",
    content: `**SolidJS** takes a fundamentally different approach to reactivity.

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
  {
    id: "u2",
    role: "user",
    content: "What about createEffect vs useEffect?",
  },
  {
    id: "a2",
    role: "assistant",
    content: `\`createEffect\` in SolidJS auto-tracks all reactive dependencies — no dependency array needed.

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

  function handleSubmit() {
    const text = inputValue().trim();
    if (!text || isLoading()) return;

    const userMsg: ChatMessage = { id: `u${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    // Simulate a streamed reply word-by-word
    const reply = cannedReply(text);
    const words = reply.split(" ");
    const assistantId = `a${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: words.slice(0, i).join(" ") } : m,
        ),
      );
      if (i >= words.length) {
        clearInterval(timer);
        setIsLoading(false);
      }
    }, 35);
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

          <ResizableHandle withHandle />

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
                    <For each={messages()}>
                      {(msg) => (
                        <Show
                          when={msg.role === "user"}
                          fallback={
                            /* assistant */
                            <Message class="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 items-start">
                              <div class="group flex w-full flex-col gap-0">
                                <MessageContent
                                  markdown
                                  class="text-foreground prose flex-1 rounded-lg bg-transparent p-0"
                                >
                                  {msg.content}
                                </MessageContent>
                                <MessageActions class="-ml-2.5 flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                  <Button variant="ghost" size="icon-sm" class="rounded-full">
                                    <Copy class="size-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon-sm" class="rounded-full">
                                    <ThumbsUp class="size-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon-sm" class="rounded-full">
                                    <ThumbsDown class="size-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon-sm" class="rounded-full">
                                    <RefreshCw class="size-3.5" />
                                  </Button>
                                </MessageActions>
                              </div>
                            </Message>
                          }
                        >
                          {/* user */}
                          <Message class="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 items-end">
                            <div class="group flex flex-col items-end gap-1">
                              <MessageContent class="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5">
                                {msg.content}
                              </MessageContent>
                            </div>
                          </Message>
                        </Show>
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
