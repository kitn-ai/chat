import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Resizable, ResizableItem, Segmented, useKaiChat } from '@kitn.ai/ui/react';
import { RAIL, SUGGESTIONS, type RailEntry } from './chat-data';
import { fetchSpikeConfig, type CardMode, type SpikeConfig } from './transport';
import { useSpikeChat } from './hooks';
import type { Scenario, ScenarioMode } from './scenarios';
import { readHarnessRequest, sendOptionsFor, useHarnessRun } from './useHarnessRun';
import { registerSpikeArtifact, SPIKE_CARD_TYPES } from './spike-artifact';
import { Sidebar } from './components/Sidebar';
import { ThreadView } from './components/ThreadView';
import { Composer } from './components/Composer';
import { ModelPanel } from './components/ModelPanel';
import { ThemeToggle } from './components/ThemeToggle';

export type Theme = 'light' | 'dark';

// A consumer-registered card type. See spike-artifact.ts: the kit has no
// `artifact` card, so S13 reaches one through the documented `cardTypes` seam.
registerSpikeArtifact();

/**
 * ⚠ SPIKE, not a supported starter. See README.md.
 *
 * A copy of `examples/starters/react/` with the fake responder replaced by a
 * REAL model over OpenRouter, so the kit's tool / reasoning / card components
 * are driven by actual model output instead of hand-written fixtures.
 *
 * It is also the instrument the CONFORMANCE HARNESS drives (see HARNESS.md):
 * `?scenario=<id>&mode=live|replay` fires one catalog scenario and publishes a
 * phase for Playwright to wait on. The rail and the harness share one catalog,
 * so a click in the browser and a run in CI are the same run.
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

  // Parsed once: a bad ?scenario= is a harness bug worth failing loudly on.
  const [harnessRequest, harnessError] = useMemo(() => {
    try {
      return [readHarnessRequest(window.location.search), null] as const;
    } catch (e) {
      return [null, e instanceof Error ? e.message : String(e)] as const;
    }
  }, []);

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
    (scenario: Scenario, mode: ScenarioMode, fixtureDir?: string) => {
      chat.setMessages([]);
      spike.reset();
      setActiveId(scenario.id);
      void spike.send(
        scenario.prompt,
        sendOptionsFor(scenario, mode, config?.modelSlug ?? 'unknown', fixtureDir),
      );
    },
    [chat, spike, config],
  );

  useHarnessRun({
    request: harnessRequest,
    config,
    configError: configError ?? harnessError,
    spike,
    loading: chat.loading,
    run: runScenario,
  });

  const runFromRail = useCallback(
    (entry: RailEntry) => runScenario(entry.scenario, entry.scenario.mode),
    [runScenario],
  );

  const send = useCallback((text: string) => void spike.send(text), [spike]);

  return (
    <div className={`app${theme === 'dark' ? ' dark' : ''}`}>
      <Resizable theme={theme} orientation="horizontal">
        <ResizableItem theme={theme} size="280px" min="220px" max="420px" collapsed={collapsed}>
          <Sidebar
            theme={theme}
            entries={RAIL}
            activeId={activeId}
            collapsed={collapsed}
            onRun={runFromRail}
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
                {harnessError && <span className="model model-bad">{harnessError}</span>}
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

            <ThreadView
              theme={theme}
              messages={chat.messages}
              loading={chat.loading}
              cardTypes={SPIKE_CARD_TYPES}
            />

            <ModelPanel theme={theme} error={spike.error} stats={spike.stats} />

            <Composer
              theme={theme}
              loading={chat.loading}
              suggestions={chat.messages.length === 0 ? SUGGESTIONS : []}
              onSubmit={send}
              onStop={spike.stop}
            />
          </main>
        </ResizableItem>
      </Resizable>
    </div>
  );
}
