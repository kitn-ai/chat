import { useCallback, useState } from 'react';
import { Button, Resizable, ResizableItem, useKaiChat } from '@kitn.ai/ui/react';
import { CONVERSATIONS, THREADS, SUGGESTIONS, TRIGGERS, newId, streamFakeReply } from './chat-data';
import { Sidebar } from './components/Sidebar';
import { ThreadView } from './components/ThreadView';
import { Composer } from './components/Composer';
import { ThemeToggle } from './components/ThemeToggle';
import { useConversations } from './hooks';

export type Theme = 'light' | 'dark';

/**
 * A mini chat **workspace composed by hand** from @kitn.ai/ui's individual
 * elements — to show how the pieces fit together (vs. dropping in one
 * batteries-included <kai-chat>/<kai-workspace> tag):
 *
 *   <Resizable>/<ResizableItem>  — the draggable sidebar | main split (the divider
 *                                  is the kit's default `line` hairline)
 *   <Conversations>  — the sidebar list (fed `conversations`, emits select/new)
 *   <Thread>         — the scrolling message list (kai-thread; stick-to-bottom built in)
 *   <PromptInput>    — the composer at the bottom
 *
 * The pieces are split into `components/` (the UI subcomponents + the example's own
 * moon/sun icons) and `hooks/` (the
 * conversation stash; voice input + the thread scroll now come from the kit), so the
 * structure reads top-down. `useKaiChat` owns the
 * message array + streaming; everything else is plain React state. Swap
 * `streamFakeReply` for a real model call to ship a real app.
 */
export default function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [collapsed, setCollapsed] = useState(false);
  const chat = useKaiChat({ initialMessages: THREADS[CONVERSATIONS[0].id] ?? [] });
  const { conversations, activeId, selectConversation, newChat } = useConversations(chat, CONVERSATIONS);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      // The Composer already cleared its own input; here we just append the user
      // message and stream the (fake) assistant reply.
      chat.append({ id: newId(), role: 'user', content: text });
      const stream = chat.streamAssistant();
      await streamFakeReply(text, (delta) => stream.appendText(delta));
      stream.done();
    },
    [chat],
  );

  return (
    <div className={`app${theme === 'dark' ? ' dark' : ''}`}>
      {/* <kai-resizable> owns the sidebar width + the divider. The handle defaults
          to the new `line` hairline (transparent at rest, tinting on hover/drag);
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
                <span className="brand">@kitn.ai/ui · composed chat</span>
              </div>
              <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} />
            </header>

            <ThreadView theme={theme} messages={chat.messages} />

            <Composer
              theme={theme}
              loading={chat.loading}
              suggestions={chat.messages.length <= 1 ? SUGGESTIONS : []}
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
