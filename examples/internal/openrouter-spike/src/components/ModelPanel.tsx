import { Notice } from '@kitn.ai/ui/react';
import type { Theme } from '../App';
import type { TurnStats } from '../hooks';

interface ModelPanelProps {
  theme: Theme;
  error: string | null;
  stats: TurnStats | null;
}

/**
 * The debug panel. Instrumentation only.
 *
 * This used to carry two trays, for citations and for cards, because
 * `ChatMessage` had a flat `content` string and nowhere to put either. It has
 * ordered `parts` now, including `source` and `card`, so both render inside the
 * assistant turn that produced them and the trays are gone.
 */
export function ModelPanel({ theme, error, stats }: ModelPanelProps) {
  if (!error && !stats) return null;

  return (
    <div className="panel">
      {error && (
        <Notice theme={theme} severity="error">
          {error}
        </Notice>
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
        <Stat label="stop" value={stats.stopReason ?? '—'} />
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
