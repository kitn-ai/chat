import { createMemo, createSignal, Show } from 'solid-js';
import {
  Button,
  ChatConfig,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@kitn.ai/ui/solid';
import { partsToText } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import { CONVERSATIONS, GROUPS, SUGGESTIONS, THREADS, mockResponse, newId } from './chat-data';
import { createChat } from './lib/chat';
import { createConversations } from './lib/conversations';
import type { Theme } from './lib/types';
import { Composer } from './components/Composer';
import { Sidebar } from './components/Sidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { ThreadView } from './components/ThreadView';

/**
 * A mini chat **workspace composed by hand** from @kitn.ai/ui — to show how the
 * pieces fit together (vs. dropping in one batteries-included `<kai-chat>`):
 *
 *   <ResizablePanelGroup>/<ResizablePanel>  — the draggable sidebar | main split
 *   <ConversationList>  — the sidebar rail (see components/Sidebar.tsx)
 *   <ChatContainer> + <Message>/<MessageBody>  — the scrolling thread
 *                                                (components/ThreadView.tsx)
 *   <PromptInput>       — the composer at the bottom (components/Composer.tsx)
 *
 * WHAT MAKES THIS ONE DIFFERENT FROM THE OTHER STARTERS. The React, Vue, Svelte,
 * Angular and vanilla starters consume the `kai-*` WEB COMPONENTS — one custom
 * element per region, with arrays set as JS properties. This one imports the
 * SolidJS components DIRECTLY from `@kitn.ai/ui/solid`, because Solid is the
 * kit's authored layer: there is no shadow root, no custom-element registration,
 * and no property-vs-attribute question. The thread is spelled out as components
 * rather than hidden behind `<kai-thread>`, which is the whole reason to read
 * this one. Import from `@kitn.ai/ui/solid` and never the root entry — `/solid`
 * is a strict superset, and the root ships none of the Solid catalog.
 *
 * The pieces are split into `components/` (the UI subcomponents + the example's
 * own icons) and `lib/` (`createChat` owns the message array + streaming,
 * `createConversations` the conversation stash). `lib/` rather than React's
 * `hooks/`, and `createX` rather than `useX`, because that is what these are in
 * Solid — they run ONCE and hand back accessors, so calling them hooks would
 * name a React lifecycle Solid does not have. Same shape as the Svelte starter's
 * `lib/`.
 *
 * Swap `mockResponse(text)` for a real `fetch` to ship a real app.
 */
export default function App() {
  const [theme, setTheme] = createSignal<Theme>('dark');
  const [collapsed, setCollapsed] = createSignal(false);
  const chat = createChat(THREADS[CONVERSATIONS[0].id] ?? []);
  const conversations = createConversations(chat, CONVERSATIONS);

  // Suggestions are a first-turn affordance: they fall away once the thread is
  // underway rather than sitting under a long conversation.
  const suggestions = createMemo(() => (chat.messages().length <= 1 ? SUGGESTIONS : []));

  const activeTitle = createMemo(
    () => conversations.conversations().find((c) => c.id === conversations.activeId())?.title ?? '',
  );

  async function send(raw: string) {
    const text = raw.trim();
    if (!text) return;
    // The Composer already cleared its own input; here we just append the user
    // message and stream the (mock) assistant reply.
    chat.append({ id: newId(), role: 'user', parts: [{ type: 'text', text }] });
    const stream = chat.streamAssistant();
    // NO BACKEND AND NO PROVIDER. mockResponse() yields canned SSE frames that
    // go through the SAME reader a real model's response would, so this preview
    // exercises the real path. To go live, only this one expression changes —
    // `mockResponse(text)` becomes a POST to your route, with
    // toOpenAIMessages(chat.messages()) as the body. The line below stays.
    await readOpenAIStream(mockResponse(text), stream);
    stream.done();
  }

  /**
   * Regenerate: drop the assistant turn (and anything after it), then re-send
   * the user turn that preceded it through the same path above. Re-running
   * `send` rather than patching the old message in place is what keeps this
   * honest — a regenerated reply goes over the same wire as a first one.
   */
  function regenerate(assistantId: string) {
    if (chat.loading()) return;
    const all = chat.messages();
    const at = all.findIndex((m) => m.id === assistantId);
    if (at < 0) return;
    const prompt = all.slice(0, at).reverse().find((m) => m.role === 'user');
    if (!prompt) return;
    // Truncate to just before the prompt: `send` re-appends it.
    chat.setMessages(all.slice(0, all.indexOf(prompt)));
    void send(partsToText(prompt.parts));
  }

  return (
    <ChatConfig>
      {/* The kit declares every --color-* token twice and flips the set under a
          `.dark` ancestor (`@custom-variant dark (&:is(.dark *))` in theme.css),
          so one class on the shell themes the components AND your own chrome. */}
      <div class={`h-screen w-full overflow-hidden bg-background${theme() === 'dark' ? ' dark' : ''}`}>
        <ResizablePanelGroup orientation="horizontal">
          <Show when={!collapsed()}>
            <ResizablePanel defaultSize="280px" minSize="220px" maxSize="420px">
              <Sidebar
                groups={GROUPS}
                conversations={conversations.conversations}
                activeId={conversations.activeId}
                onSelect={conversations.selectConversation}
                onNewChat={conversations.newChat}
                onToggleSidebar={() => setCollapsed(true)}
              />
            </ResizablePanel>
            <ResizableHandle handle="line" />
          </Show>

          <ResizablePanel>
            <main class="flex h-full flex-1 flex-col overflow-hidden">
              <header class="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
                <div class="flex items-center gap-2">
                  <Show when={collapsed()}>
                    <Button variant="ghost" size="icon-sm" onClick={() => setCollapsed(false)}>
                      <span aria-hidden>☰</span>
                      <span class="sr-only">Show sidebar</span>
                    </Button>
                  </Show>
                  <span class="text-sm font-semibold text-foreground">{activeTitle()}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="hidden text-xs text-muted-foreground sm:inline">
                    @kitn.ai/ui · composed chat
                  </span>
                  <ThemeToggle
                    theme={theme}
                    onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                  />
                </div>
              </header>

              <ThreadView messages={chat.messages} onRegenerate={regenerate} />

              <Composer loading={chat.loading} suggestions={suggestions} onSubmit={send} />
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ChatConfig>
  );
}
