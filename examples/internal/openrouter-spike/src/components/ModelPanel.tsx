import { Cards, Notice, Sources } from '@kitn.ai/ui/react';
import type { CardEnvelope, CardResolution } from '@kitn.ai/ui';
import type { Theme } from '../App';
import type { SourceItem } from '../tools';
import type { TurnStats } from '../hooks';

interface ModelPanelProps {
  theme: Theme;
  sources: SourceItem[];
  cards: CardEnvelope[];
  onCardResolved: (cardId: string, resolution: CardResolution) => void;
  error: string | null;
  stats: TurnStats | null;
}

/**
 * ★ THE FINDING, MADE VISIBLE.
 *
 * Everything in this panel belongs INSIDE the assistant turn and cannot get
 * there. `ChatMessage` has `content`, `reasoning`, `tools`, `attachments`,
 * `actions`, `avatar` and `feedback`: no `sources`, no `cards`. `<kai-thread>`
 * exposes no per-message slot either (`Message` has an `inject` slot, but the
 * thread element does not forward one). So a model-produced citation row and a
 * model-produced card have to be rendered in a tray under the thread, detached
 * from the message that caused them.
 */
export function ModelPanel({ theme, sources, cards, onCardResolved, error, stats }: ModelPanelProps) {
  const nothing = !error && sources.length === 0 && cards.length === 0 && !stats;
  if (nothing) return null;

  return (
    <div className="panel">
      {error && (
        <Notice theme={theme} severity="error">
          {error}
        </Notice>
      )}

      {sources.length > 0 && (
        <section className="panel-block">
          <h2 className="panel-title">
            Sources <span className="panel-note">rendered outside the message: ChatMessage has no `sources`</span>
          </h2>
          <Sources theme={theme} sources={sources} numbered showFavicon />
        </section>
      )}

      {cards.length > 0 && (
        <section className="panel-block">
          <h2 className="panel-title">
            Cards <span className="panel-note">rendered outside the message: ChatMessage has no `cards`</span>
          </h2>
          <Cards
            theme={theme}
            cards={cards}
            onCardResolved={(e) => onCardResolved(e.detail.cardId, e.detail.resolution as CardResolution)}
          />
        </section>
      )}

      {stats && <StatsRow stats={stats} />}
    </div>
  );
}

/** The instrumentation that answers "did reasoning actually stream?". */
function StatsRow({ stats }: { stats: TurnStats }) {
  const reasoningVerdict =
    stats.reasoningChunks > 0
      ? `streamed (${stats.reasoningChunks} deltas, ${stats.reasoningChars} chars)`
      : stats.reasoningTokens
        ? `hidden: ${stats.reasoningTokens} reasoning tokens billed, 0 deltas`
        : 'none';

  return (
    <section className="panel-block">
      <h2 className="panel-title">Turn stats</h2>
      <dl className="stats">
        <Stat label="card mode" value={stats.cardMode} />
        <Stat label="rounds" value={String(stats.rounds)} />
        <Stat label="chunks" value={String(stats.chunks)} />
        <Stat label="reasoning" value={reasoningVerdict} />
        <Stat label="tool calls" value={`${stats.toolCallsSeen} (${stats.toolCallsMalformed} malformed)`} />
        <Stat label="finish" value={stats.finishReason ?? '—'} />
        <Stat
          label="tokens"
          value={`${stats.promptTokens ?? '—'} in / ${stats.completionTokens ?? '—'} out`}
        />
        {stats.costUsd != null && <Stat label="cost" value={`$${stats.costUsd.toFixed(6)}`} />}
        {stats.structuredError && <Stat label="schema error" value={stats.structuredError} />}
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
