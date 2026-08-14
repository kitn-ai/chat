import { useCallback, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Resizable, ResizableItem, useKaiChat } from '@kitn.ai/ui/react';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import { CONVERSATIONS, THREADS, SUGGESTIONS, TRIGGERS, newId, mockResponse } from '../chat-data';
import { Sidebar } from '../components/Sidebar';
import { ThreadView } from '../components/ThreadView';
import { Composer } from '../components/Composer';
import { ThemeToggle } from '../components/ThemeToggle';
import { HydrationBadge } from '../components/HydrationBadge';
import { useConversations } from '../hooks';
import type { Theme } from '../theme';

/**
 * A mini chat **workspace composed by hand** from @kitn.ai/ui's individual
 * elements — server-rendered by TanStack Start, then hydrated and streamed into.
 *
 *   <Resizable>/<ResizableItem>  — the draggable sidebar | main split
 *   <Conversations>  — the sidebar list (fed `conversations`, emits select/new)
 *   <Thread>         — the scrolling message list (kai-thread; stick-to-bottom built in)
 *   <PromptInput>    — the composer at the bottom
 *
 * `useKaiChat` owns the message array + streaming; everything else is plain React
 * state. Swap `mockResponse(text)` for a real `fetch` to ship a real app.
 *
 * WHAT THIS ROUTE PROVES ABOUT SERVER RENDERING
 * ---------------------------------------------
 * This starter exists to show that the `kai-*` web components survive SSR. It used
 * to show that with a static `<Chat>` fed a frozen array. A composed thread that
 * hydrates and then STREAMS proves strictly more, so the demonstration moved here
 * rather than being kept alongside:
 *
 *   1. The server emits BARE TAGS. `@kitn.ai/ui/react` registers each element from
 *      a layout effect, and layout effects do not run on the server, so the SSR'd
 *      HTML contains `<kai-thread></kai-thread>` and nothing inside it. View source
 *      and you will find empty elements — that is correct, not a bug.
 *   2. Array and object props NEVER become attributes. `messages`, `conversations`
 *      and `triggers` are assigned as live DOM properties after hydration, so
 *      there is no serialize/parse step and no `messages="[{...}]"` in the markup.
 *      The static version proved this ONCE, at mount.
 *   3. Streaming proves the channel KEEPS working. Every chunk assigns a new
 *      `messages` array reference to the same element that the server rendered
 *      empty. A page that hydrated badly can still look right; it cannot stream.
 *      The badge in the top bar reports which of those you are looking at.
 *
 * Nothing on this page is fetched from the server: no loader, no server function.
 * The reply comes from the kit's mock responder in the browser. That keeps the SSR
 * question — does the ELEMENT survive hydration — separate from a data-loading
 * question this starter is not about.
 */
export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [collapsed, setCollapsed] = useState(false);
  const chat = useKaiChat({ initialMessages: THREADS[CONVERSATIONS[0].id] ?? [] });
  const { conversations, activeId, selectConversation, newChat } = useConversations(chat, CONVERSATIONS);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      // The Composer already cleared its own input; here we just append the user
      // message and stream the (mock) assistant reply.
      chat.append({ id: newId(), role: 'user', parts: [{ type: 'text', text }] });
      const stream = chat.streamAssistant();
      // NO BACKEND AND NO PROVIDER. mockResponse() yields canned SSE frames that
      // go through the SAME reader a real model's response would, so this preview
      // exercises the real path. To go live, only this one expression changes —
      // `mockResponse(text)` becomes a POST to a TanStack server route, with
      // toOpenAIMessages(chat.messages) as the body. The line below stays.
      await readOpenAIStream(mockResponse(text), stream);
      stream.done();
    },
    [chat],
  );

  return (
    <div className={`app${theme === 'dark' ? ' dark' : ''}`}>
      {/* <kai-resizable> owns the sidebar width + the divider. The handle defaults
          to the `line` hairline (transparent at rest, tinting on hover/drag);
          collapsing the sidebar maps to <ResizableItem collapsed>. */}
      <Resizable theme={theme} orientation="horizontal">
        <ResizableItem theme={theme} size="280px" min="220px" max="420px" collapsed={collapsed}>
          <Sidebar
            theme={theme}
            conversations={conversations}
            activeId={activeId}
            collapsed={collapsed}
            onSelect={selectConversation}
            onNewChat={newChat}
            onToggle={() => setCollapsed((c) => !c)}
          />
        </ResizableItem>

        <ResizableItem theme={theme}>
          <main className="main">
            <header className="bar">
              <div className="bar-left">
                {collapsed && (
                  <Button
                    theme={theme}
                    variant="ghost"
                    size="icon"
                    icon="panel-left"
                    label="Show sidebar"
                    onClick={() => setCollapsed(false)}
                  />
                )}
                <span className="brand">@kitn.ai/ui · composed chat on TanStack Start</span>
              </div>
              <div className="bar-right">
                <HydrationBadge />
                <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} />
              </div>
            </header>

            <ThreadView theme={theme} messages={chat.messages} />

            <Composer
              theme={theme}
              loading={chat.loading}
              suggestions={chat.messages.length <= 2 ? SUGGESTIONS : []}
              triggers={TRIGGERS}
              onSubmit={send}
              onSuggestionClick={send}
            />
          </main>
        </ResizableItem>
      </Resizable>
    </div>
  );
}
