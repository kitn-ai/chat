// The pure fold: a flat event list becomes one summary per stream.
//
// No DOM, no state, no I/O -- so the interesting logic is testable without
// mounting anything, and the panel is left doing only rendering.
//
// FORWARD COMPATIBILITY IS THIS MODULE'S JOB. It will be handed events from
// kits both older and newer than itself, so: an unknown event `type` is counted
// and otherwise ignored, never thrown on; unknown FIELDS are ignored; and a
// fact that was never reported stays `undefined` rather than defaulting to a
// confident zero. "Not reported" and "measured zero" are different claims, and
// a panel that renders them the same way lies about the one that matters.
import { field, type WireDiagnosticEvent } from './contract';

/** One decoded frame, retained so the inspector can show the sequence. All
 *  metadata: sizes, counts and field NAMES, never a field's value. */
export interface FrameRow {
  seq: number;
  /** ms since `wire.open`. Undefined when no open was seen. */
  atMs?: number;
  bytes: number;
  chunks: number;
  fields: string[];
  model?: string;
}

/** One part write. `chars` is a LENGTH; the delta itself never travels. */
export interface PartRow {
  variant: string;
  index?: number;
  chars?: number;
  atMs?: number;
}

export interface StreamUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
}

/**
 * The four states a stream can be in, which are the filter pills.
 *
 * `empty` is deliberately its own state rather than a kind of failure: "the
 * request worked and produced nothing" is the case this whole product exists
 * to make visible, and folding it into `failed` would bury it next to 401s.
 */
export type StreamStatus = 'open' | 'ok' | 'empty' | 'failed';

/** The kit's emptiness vocabulary. Anything else on `errorCode` is a real
 *  error the provider or the stream reported. */
const EMPTY_CODES = new Set(['empty-stream', 'empty-turn']);

export function streamStatus(s: StreamSummary): StreamStatus {
  if (s.status !== undefined) return 'failed';
  if (s.errorCode !== undefined) {
    return EMPTY_CODES.has(String(s.errorCode)) ? 'empty' : 'failed';
  }
  return s.open ? 'open' : 'ok';
}

/**
 * The chunk keys that carry CONTENT, as opposed to the ones that describe the
 * response.
 *
 * It lives here rather than in the view because it is a fact about the wire,
 * and the frames table leans on it hard: a stream whose every frame carries
 * only metadata keys is the wrong-dialect signature, and rendering that as a
 * visual texture is the fastest way to see it.
 */
export const CONTENT_KEYS: ReadonlySet<string> = new Set([
  'text',
  'reasoning',
  'toolCalls',
  'sources',
]);

export interface StreamSummary {
  streamId?: string;
  format?: string;
  source?: string;
  /** Undefined when no `wire.close` reported one -- a direct
   *  `consumeModelStream` call has no frames, which is not the same as zero. */
  frames?: number;
  chunks: number;
  parts: Record<string, number>;
  /** Verbatim from whichever frame stated it. NEVER filled from anywhere else:
   *  a display that substituted the requested id would lie in exactly the
   *  requested-vs-served mismatch this field exists to catch. */
  model?: string;
  finishReason?: string | null;
  errorCode?: string | number;
  /** HTTP status, from `wire.failed` only. */
  status?: number;
  ms?: number;
  /** Time from `wire.open` to the first frame. The buffering signature. */
  firstFrameMs?: number;
  /**
   * True when the stream was opened and NOTHING terminal ever arrived.
   *
   * This is a real state, not a defect: a transport failure mid-read emits
   * neither `wire.close` nor `wire.failed`, so the last word about that stream
   * is a frame. Rendering it as complete would claim a finish nobody reported;
   * rendering it as an error would invent one. It renders as open.
   */
  open: boolean;
  /** The kit's normalized stop vocabulary, when the close carried one. */
  stopReason?: string;
  usage?: StreamUsage;
  /** Retained per frame so the inspector can show the sequence and its fields. */
  frameRows: FrameRow[];
  /** Retained per part write, in arrival order. */
  partRows: PartRow[];
}

export interface FoldResult {
  streams: StreamSummary[];
  /** Event types this panel does not know, by name and count. Shown rather than
   *  hidden: it is how someone learns their kit reports more than their panel
   *  renders. */
  unknownTypes: Record<string, number>;
}

const KNOWN = new Set(['wire.open', 'wire.frame', 'wire.part', 'wire.close', 'wire.failed']);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export function foldStreams(events: readonly WireDiagnosticEvent[]): FoldResult {
  // Insertion-ordered, so rows appear in the order their streams first spoke.
  const byId = new Map<string, StreamSummary>();
  const unknownTypes: Record<string, number> = {};
  // `wire.open` time per stream, kept aside so `firstFrameMs` is a delta rather
  // than an absolute nobody can read.
  const openedAt = new Map<string, number>();
  // Which (variant, index) pairs a stream has already produced, so the live
  // parts count is DISTINCT PARTS rather than write events. See `wire.part`.
  const seenParts = new Map<string, Set<string>>();

  // A missing streamId is its own bucket rather than a dropped event: the
  // correlator is optional in the envelope, and an uncorrelated event is still
  // evidence.
  const keyOf = (e: WireDiagnosticEvent) => e.streamId ?? '\u0000none';

  const summaryFor = (e: WireDiagnosticEvent): StreamSummary => {
    const key = keyOf(e);
    let s = byId.get(key);
    if (!s) {
      s = { streamId: e.streamId, chunks: 0, parts: {}, open: false, frameRows: [], partRows: [] };
      byId.set(key, s);
    }
    return s;
  };

  for (const e of events) {
    if (typeof e?.type !== 'string') continue; // not an event shape we can place
    if (!KNOWN.has(e.type)) {
      unknownTypes[e.type] = (unknownTypes[e.type] ?? 0) + 1;
      continue;
    }
    const s = summaryFor(e);

    switch (e.type) {
      case 'wire.open': {
        s.format = str(field(e, 'format'));
        s.source = str(field(e, 'source'));
        // Opened and not yet terminated. A later close/failed clears this.
        s.open = true;
        const t = num(e.t);
        if (t !== undefined) openedAt.set(keyOf(e), t);
        break;
      }
      case 'wire.frame': {
        s.frames = (s.frames ?? 0) + 1;
        // Accumulate chunks LIVE. Taking this only from `wire.close` meant a
        // healthy stream rendered `N frames → 0 chunks → M parts` for its whole
        // duration -- the wrong-dialect signature this panel exists to flag,
        // shown transiently on every healthy stream, and a confident zero of
        // exactly the kind the header rule forbids. Each frame REPORTS how many
        // chunks it yielded, so summing them is measurement, not invention.
        // `wire.close` overwrites the sum below, being the kit's own tally.
        const frameChunks = num(field(e, 'chunks'));
        if (frameChunks !== undefined) s.chunks += frameChunks;
        const model = str(field(e, 'model'));
        // Last frame to state one wins; absent stays absent.
        if (model) s.model = model;
        const opened = openedAt.get(keyOf(e));
        const t = num(e.t);
        const atMs = opened !== undefined && t !== undefined ? t - opened : undefined;
        if (s.firstFrameMs === undefined && atMs !== undefined) s.firstFrameMs = atMs;

        // Retained for the inspector. `fields` is the FIELD NAMES the frame's
        // chunks carried -- never their values -- which is what lets the table
        // show "frames arriving with no content key" without rendering content.
        const rawFields = field(e, 'fields');
        s.frameRows.push({
          seq: num(field(e, 'seq')) ?? s.frameRows.length + 1,
          ...(atMs !== undefined ? { atMs } : {}),
          bytes: num(field(e, 'bytes')) ?? 0,
          chunks: frameChunks ?? 0,
          fields: Array.isArray(rawFields) ? rawFields.filter((f): f is string => typeof f === 'string') : [],
          ...(model ? { model } : {}),
        });
        break;
      }
      case 'wire.part': {
        // DISTINCT PARTS, not write events. Several deltas land on one part --
        // a text part grows by a delta per frame -- so counting events made the
        // live figure climb and then FALL to `wire.close`'s authoritative map
        // at the end of every healthy stream. Each event carries the `index` it
        // wrote to, so unique (variant, index) pairs are a measured distinct
        // count that converges on the close map instead of contradicting it.
        const variant = str(field(e, 'variant')) ?? 'unknown';
        const index = num(field(e, 'index'));
        const key = keyOf(e);
        let seen = seenParts.get(key);
        if (!seen) {
          seen = new Set();
          seenParts.set(key, seen);
        }
        // A NUL separator, so a variant name containing the delimiter cannot
        // collide with a different (variant, index) pair.
        const pair = `${variant}\u0000${index ?? 'unreported'}`;
        if (!seen.has(pair)) {
          seen.add(pair);
          s.parts[variant] = (s.parts[variant] ?? 0) + 1;
        }

        const openedForPart = openedAt.get(key);
        const tPart = num(e.t);
        const chars = num(field(e, 'chars'));
        s.partRows.push({
          variant,
          ...(index !== undefined ? { index } : {}),
          ...(chars !== undefined ? { chars } : {}),
          ...(openedForPart !== undefined && tPart !== undefined
            ? { atMs: tPart - openedForPart }
            : {}),
        });
        break;
      }
      case 'wire.close': {
        // The close is authoritative for the counts it carries -- it is the
        // kit's own tally, not the panel's reconstruction. `frames` is only
        // adopted when PRESENT, so a direct consume call leaves it undefined.
        const frames = num(field(e, 'frames'));
        if (frames !== undefined) s.frames = frames;
        s.chunks = num(field(e, 'chunks')) ?? s.chunks;
        const parts = field(e, 'parts');
        if (parts && typeof parts === 'object') {
          s.parts = { ...(parts as Record<string, number>) };
        }
        const finish = field(e, 'finishReason');
        if (finish !== undefined) s.finishReason = finish as string | null;
        const code = field(e, 'errorCode');
        if (code !== undefined) s.errorCode = code as string | number;
        const stop = str(field(e, 'stopReason'));
        if (stop) s.stopReason = stop;
        const usage = field(e, 'usage');
        if (usage && typeof usage === 'object') s.usage = { ...(usage as StreamUsage) };
        s.ms = num(field(e, 'ms'));
        s.open = false;
        break;
      }
      case 'wire.failed': {
        s.status = num(field(e, 'status'));
        const provider = field(e, 'providerCode');
        if (typeof provider === 'string' || typeof provider === 'number') s.errorCode = provider;
        // It never opened a stream, so it is terminal, not open.
        s.open = false;
        break;
      }
    }
  }

  return { streams: [...byId.values()], unknownTypes };
}
