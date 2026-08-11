import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Resizable, ResizableItem, Segmented, useKaiChat } from '@kitn.ai/ui/react';
import { SCENARIOS, SUGGESTIONS, type Scenario } from './chat-data';
import { fetchSpikeConfig, type CardMode, type SpikeConfig } from './transport';
import { useSpikeChat } from './hooks';
import { Sidebar } from './components/Sidebar';
import { ThreadView } from './components/ThreadView';
import { Composer } from './components/Composer';
import { ModelPanel } from './components/ModelPanel';
import { ThemeToggle } from './components/ThemeToggle';

export type Theme = 'light' | 'dark';

/**
 * ⚠ SPIKE, not a supported starter. See README.md.
 *
 * A copy of `examples/starters/react/` with the fake responder replaced by a
 * REAL model over OpenRouter, so the kit's tool / reasoning / card components
 * are driven by actual model output instead of hand-written fixtures.
 *
 * Shape:
 *   src/transport.ts      browser → /api/chat, and nothing else
 *   server/               the dev proxy: adds the key, forwards raw upstream SSE
 *
 * The adapter it used to carry (src/model-stream.ts, src/sse-frames.ts) now ships
 * as `@kitn.ai/ui/wire`, and the proxy no longer needs a provider SDK. What is
 * left is the reason to keep the spike: `useKaiChat` owns the message array and
 * `useSpikeChat` owns the multi-round tool loop, driven by a real model.
 */
export default function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [collapsed, setCollapsed] = useState(false);
  const [cardMode, setCardMode] = useState<CardMode>('tool');
  const [activeId, setActiveId] = useState('');
  const [config, setConfig] = useState<SpikeConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const chat = useKaiChat();
  const spike = useSpikeChat(chat, cardMode);

  useEffect(() => {
    fetchSpikeConfig()
      .then(setConfig)
      .catch((e: Error) => setConfigError(e.message));
  }, []);

  const newChat = useCallback(() => {
    chat.setMessages([]);
    spike.reset();
    setActiveId('');
  }, [chat, spike]);

  const runScenario = useCallback(
    (s: Scenario) => {
      chat.setMessages([]);
      spike.reset();
      setActiveId(s.id);
      void spike.send(s.prompt);
    },
    [chat, spike],
  );

  const send = useCallback((text: string) => void spike.send(text), [spike]);

  return (
    <div className={`app${theme === 'dark' ? ' dark' : ''}`}>
      <Resizable theme={theme} orientation="horizontal">
        <ResizableItem theme={theme} size="280px" min="220px" max="420px" collapsed={collapsed}>
          <Sidebar
            theme={theme}
            scenarios={SCENARIOS}
            activeId={activeId}
            collapsed={collapsed}
            onRun={runScenario}
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
                <span className="brand">OpenRouter spike</span>
                <Badge theme={theme}>SPIKE</Badge>
                {config && (
                  <span className="model" title="Chosen server-side from OPENROUTER_MODEL">
                    {config.model}
                    {config.hasKey ? '' : ' · NO KEY'}
                  </span>
                )}
                {configError && <span className="model model-bad">proxy unreachable: {configError}</span>}
              </div>
              <div className="bar-right">
                {/* Path A vs Path B: the generative-UI comparison. */}
                <Segmented
                  theme={theme}
                  size="sm"
                  options={[
                    { value: 'tool', label: 'Card via tool' },
                    { value: 'structured', label: 'Card via schema' },
                  ]}
                  value={cardMode}
                  onChange={(e) => {
                    setCardMode(e.detail.value as CardMode);
                    newChat();
                  }}
                />
                <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} />
              </div>
            </header>

            <ThreadView theme={theme} messages={chat.messages} loading={chat.loading} />

            <ModelPanel theme={theme} error={spike.error} stats={spike.stats} />

            <Composer
              theme={theme}
              loading={chat.loading}
              suggestions={chat.messages.length === 0 ? SUGGESTIONS : []}
              onSubmit={send}
            />
          </main>
        </ResizableItem>
      </Resizable>
    </div>
  );
}
