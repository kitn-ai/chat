// Session-level observability: the phases inside one turn, and the aggregates
// across all of them.
//
// Pure, like the fold it reads from, and deliberately in its own module: these
// are the numbers a devtool shows regardless of how it draws them, so they must
// not be entangled with a view that is still being designed.
//
// THE RULE THAT GOVERNS EVERY FIELD HERE: absent when underivable, never a
// confident zero. `thinkToAnswerMs` of 0 means "it answered the instant it
// stopped thinking"; `undefined` means "this turn had no reasoning, so the
// question does not apply". Collapsing those two into 0 would be the same lie
// the panel already refuses to tell about frame counts.
import { streamStatus, type StreamSummary, type StreamUsage } from './streams';

/**
 * The phases of one turn, all relative to `wire.open`.
 *
 * `thinkToAnswerMs` is the one people ask about by name: the gap between the
 * model finishing its reasoning and the first token of the answer appearing.
 * A long one is a real and otherwise invisible experience -- the UI shows a
 * finished thinking panel and then nothing.
 */
export interface Phases {
  /** Open → first decoded frame. */
  ttfbMs?: number;
  /** Open → first reasoning part. */
  toFirstReasoningMs?: number;
  /** First → last reasoning part. 0 is meaningful (a single delta). */
  reasoningSpanMs?: number;
  /** Last reasoning part → first text part. */
  thinkToAnswerMs?: number;
  /** Open → first text part. */
  toFirstTextMs?: number;
  /** What the close reported. */
  totalMs?: number;
}

const firstOf = (s: StreamSummary, variant: string): number | undefined =>
  s.partRows.find((p) => p.variant === variant && p.atMs !== undefined)?.atMs;

function lastOf(s: StreamSummary, variant: string): number | undefined {
  for (let i = s.partRows.length - 1; i >= 0; i--) {
    const p = s.partRows[i];
    if (p.variant === variant && p.atMs !== undefined) return p.atMs;
  }
  return undefined;
}

export function phasesFor(s: StreamSummary): Phases {
  const out: Phases = {};

  const firstFrame = s.frameRows.find((f) => f.atMs !== undefined)?.atMs;
  if (firstFrame !== undefined) out.ttfbMs = firstFrame;

  const firstReasoning = firstOf(s, 'reasoning');
  const lastReasoning = lastOf(s, 'reasoning');
  const firstText = firstOf(s, 'text');

  if (firstReasoning !== undefined) out.toFirstReasoningMs = firstReasoning;
  if (firstReasoning !== undefined && lastReasoning !== undefined) {
    out.reasoningSpanMs = lastReasoning - firstReasoning;
  }
  if (lastReasoning !== undefined && firstText !== undefined) {
    out.thinkToAnswerMs = firstText - lastReasoning;
  }
  if (firstText !== undefined) out.toFirstTextMs = firstText;
  if (s.ms !== undefined) out.totalMs = s.ms;

  return out;
}

export interface ModelCount {
  model: string;
  streams: number;
}

export interface TraceCount {
  traceId: string;
  streams: number;
}

export interface Rollup {
  streams: number;
  open: number;
  ok: number;
  empty: number;
  failed: number;
  /** Models that actually ANSWERED, by what the responses reported. A model the
   *  stream never named is not listed rather than listed as unknown. */
  models: ModelCount[];
  /** Only the token fields somebody reported; a provider that sends none
   *  produces `{}` rather than a row of zeroes. */
  tokens: Partial<Record<keyof StreamUsage, number>>;
  /** Absent unless at least one stream reported a cost. */
  costUsd?: number;
  /** First event to last, across the session. */
  wallMs?: number;
  /** Streams grouped by trace, when the app reports one. */
  traces: TraceCount[];
}

/** The token fields worth totalling. `costUsd` is handled separately because it
 *  is money and gets its own absent-vs-zero treatment. */
const TOKEN_KEYS: Exclude<keyof StreamUsage, 'costUsd'>[] = [
  'inputTokens',
  'outputTokens',
  'reasoningTokens',
  'cachedInputTokens',
  'totalTokens',
];

export function rollup(streams: readonly StreamSummary[]): Rollup {
  const out: Rollup = {
    streams: streams.length,
    open: 0,
    ok: 0,
    empty: 0,
    failed: 0,
    models: [],
    tokens: {},
    traces: [],
  };

  const byModel = new Map<string, number>();
  const byTrace = new Map<string, number>();
  let cost: number | undefined;
  let earliest: number | undefined;
  let latest: number | undefined;

  for (const s of streams) {
    out[streamStatus(s)] += 1;

    if (s.model) byModel.set(s.model, (byModel.get(s.model) ?? 0) + 1);
    if (s.traceId) byTrace.set(s.traceId, (byTrace.get(s.traceId) ?? 0) + 1);

    for (const key of TOKEN_KEYS) {
      const value = s.usage?.[key];
      // Only a REPORTED number contributes, so an absent field stays absent
      // rather than becoming a zero that reads as "measured none".
      if (typeof value === 'number') out.tokens[key] = (out.tokens[key] ?? 0) + value;
    }
    const c = s.usage?.costUsd;
    if (typeof c === 'number') cost = (cost ?? 0) + c;

    if (s.startedAt !== undefined) {
      earliest = earliest === undefined ? s.startedAt : Math.min(earliest, s.startedAt);
    }
    if (s.lastAt !== undefined) {
      latest = latest === undefined ? s.lastAt : Math.max(latest, s.lastAt);
    }
  }

  out.models = [...byModel.entries()].map(([model, n]) => ({ model, streams: n }));
  out.traces = [...byTrace.entries()].map(([traceId, n]) => ({ traceId, streams: n }));
  if (cost !== undefined) out.costUsd = cost;
  if (earliest !== undefined && latest !== undefined) out.wallMs = latest - earliest;

  return out;
}
