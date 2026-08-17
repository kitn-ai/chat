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


/** How the encoder represented one attachment on this wire. `skipped` is the
 *  one that matters: the part rendered in the thread and never reached the
 *  model. */
export type AttachmentDisposition = 'encoded' | 'skipped' | 'as-text';

export interface AttachmentRow {
  mediaType?: string;
  bytes?: number;
  encoded?: boolean;
  disposition?: AttachmentDisposition;
  reason?: string;
}

/** What the kit ENCODED and sent. The read path alone cannot answer "did the
 *  model actually receive my attachment", which is why this side exists. */
export interface RequestSummary {
  format?: string;
  messages?: number;
  byRole: Record<string, number>;
  parts: Record<string, number>;
  bodyBytes?: number;
  attachments: AttachmentRow[];
}

/** One part the encoder could not represent on this wire. */
export interface DroppedRow {
  variant: string;
  count: number;
  messageIndex?: number;
  partIndex?: number;
  reason?: string;
}

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

  // ── The write path, and the connection it opened ──────────────────────
  /** Origin + pathname only; never a query string, which can carry a key. */
  url?: string;
  hasQuery?: boolean;
  /** The response's HTTP status, distinct from `status` (which is set only by
   *  wire.failed and therefore always an error). */
  httpStatus?: number;
  /** A `text/html` here where SSE was expected is the classic misconfiguration. */
  contentType?: string;
  /** Absent when the app encoded elsewhere -- which is not a finding. */
  request?: RequestSummary;
  /** Parts the encoder did not put on the wire. */
  dropped: DroppedRow[];
}

export interface FoldResult {
  streams: StreamSummary[];
  /** Event types this panel does not know, by name and count. Shown rather than
   *  hidden: it is how someone learns their kit reports more than their panel
   *  renders. */
  unknownTypes: Record<string, number>;
}

const KNOWN = new Set([
  'wire.open', 'wire.frame', 'wire.part', 'wire.close', 'wire.failed',
  // The write path. A kit that does not emit these folds exactly as before.
  'encode.request', 'encode.dropped',
]);

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
      s = {
        streamId: e.streamId, chunks: 0, parts: {}, open: false,
        frameRows: [], partRows: [], dropped: [],
      };
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
        // Present only on a kit new enough to report them; absent stays absent.
        s.url = str(field(e, 'url'));
        const hasQuery = field(e, 'hasQuery');
        if (typeof hasQuery === 'boolean') s.hasQuery = hasQuery;
        s.httpStatus = num(field(e, 'status'));
        s.contentType = str(field(e, 'contentType'));
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
      case 'encode.request': {
        const attachments = field(e, 'attachments');
        s.request = {
          format: str(field(e, 'format')),
          messages: num(field(e, 'messages')),
          byRole: { ...((field(e, 'byRole') as Record<string, number>) ?? {}) },
          parts: { ...((field(e, 'parts') as Record<string, number>) ?? {}) },
          bodyBytes: num(field(e, 'bodyBytes')),
          attachments: Array.isArray(attachments) ? (attachments as AttachmentRow[]) : [],
        };
        break;
      }
      case 'encode.dropped': {
        s.dropped.push({
          variant: str(field(e, 'variant')) ?? 'unknown',
          count: num(field(e, 'count')) ?? 1,
          messageIndex: num(field(e, 'messageIndex')),
          partIndex: num(field(e, 'partIndex')),
          reason: str(field(e, 'reason')),
        });
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

// ── The verdict layer ────────────────────────────────────────────────────────
//
// Measurements are not findings. Byte counts and timestamps are evidence; a
// developer opening a devtool wants to know what is WRONG, and only then what
// the numbers were. So the panel interprets each stream here -- in the fold,
// where it is pure and unit-testable -- and the view only renders the verdicts.
//
// THREE HONESTY RULES, and they are what make this safe to state in plain
// language rather than hedged into uselessness:
//
//   1. OBSERVATION BEFORE SUSPICION. Every statement opens with what was
//      measured ("5 frames arrived and none yielded a chunk") and only then
//      names what that resembles. The reader can always check the claim.
//   2. NEVER ASSERT A CAUSE THE PANEL CANNOT KNOW. We see one side of the
//      conversation. "That is the signature of a reader pointed at a different
//      dialect" is honest; "your endpoint is Anthropic" is a guess wearing a
//      verdict's clothes. Signatures and suggestions, never diagnoses.
//   3. HEURISTICS SAY SO, AND SHOW THEIR WORKING. The buffering check is a
//      threshold on an arrival distribution, so it names the counts it judged
//      and labels itself.
//
// Absent stays absent throughout: a model the stream never reported is "not
// reported", never "unknown" and never filled in from the request.

export type Verdict = 'ok' | 'warn' | 'fail' | 'na';

export interface Finding {
  id: string;
  label: string;
  verdict: Verdict;
  /** One line of plain language, observation first. */
  statement: string;
  /** Optional second line: the method, the caveat, the numbers behind it. */
  detail?: string;
}

/** Deterministic thousands separators -- `toLocaleString` varies by host. */
function group(n: number): string {
  const [whole, ...rest] = String(n).split('.');
  return [whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','), ...rest].join('.');
}

const plural = (n: number, one: string) => `${group(n)} ${one}${n === 1 ? '' : 's'}`;

/** Human bytes, because 245760 is not a size anyone reads at a glance. */
function bytes(n: number): string {
  if (n < 1024) return `${group(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** `1,100ms` under a second, `1.1s` above it: the unit people actually compare in. */
function duration(msValue: number): string {
  return msValue >= 1000 ? `${(msValue / 1000).toFixed(1)}s` : `${group(msValue)}ms`;
}

function partsSummary(parts: Record<string, number>): string {
  const entries = Object.entries(parts).filter(([, n]) => n > 0);
  if (entries.length === 0) return 'no parts';
  return entries.map(([variant, n]) => plural(n, `${variant} part`)).join(', ');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** The panel's OWN explanation of each code. Deliberately not the kit's message
 *  string: the kit writes for a console, and a code is a closed vocabulary a
 *  consumer is supposed to key its own copy off. */
const CODE_COPY: Record<string, string> = {
  'empty-stream':
    'empty-stream — the response was 200 but nothing in its body parsed as a stream frame.',
  'empty-turn':
    'empty-turn — frames parsed, but none carried content this reader reads, so no message part was produced.',
};

const RANK: Record<Verdict, number> = { fail: 0, warn: 1, ok: 2, na: 3 };

/**
 * Interpret one stream. Findings are ordered failures first and
 * not-applicable last, so the top of the card is always the part worth reading.
 */
export function findingsFor(s: StreamSummary): Finding[] {
  const out: Finding[] = [];
  const partsTotal = Object.values(s.parts).reduce((a, b) => a + b, 0);
  const frames = s.frames ?? s.frameRows.length;
  const failedBeforeStream = s.status !== undefined;

  // ── The request itself ───────────────────────────────────────────────
  if (failedBeforeStream) {
    out.push({
      id: 'request',
      label: 'Request',
      verdict: 'fail',
      statement:
        `The request failed before any stream began: HTTP ${s.status}` +
        `${s.errorCode !== undefined ? `, provider code ${s.errorCode}` : ''}.`,
      detail: 'Nothing was parsed, so the checks below have nothing to judge.',
    });
  }

  // ── Did anything come out? ───────────────────────────────────────────
  if (partsTotal > 0) {
    out.push({
      id: 'content',
      label: 'Content produced',
      verdict: 'ok',
      statement: `${partsSummary(s.parts)} from ${plural(frames, 'frame')}.`,
    });
  } else if (failedBeforeStream) {
    out.push({
      id: 'content',
      label: 'Content produced',
      verdict: 'na',
      statement: 'No stream was read, so no message part could be produced.',
    });
  } else if (frames > 0) {
    out.push({
      id: 'content',
      label: 'Content produced',
      verdict: 'fail',
      statement: `${plural(frames, 'frame')} arrived and no message part was produced.`,
    });
  } else {
    out.push({
      id: 'content',
      label: 'Content produced',
      verdict: 'na',
      statement: 'Nothing has arrived on this stream yet.',
    });
  }

  // ── Is the reader reading the right dialect? ─────────────────────────
  const sawContentKey = s.frameRows.some((f) => f.fields.some((k) => CONTENT_KEYS.has(k)));
  const reader = s.format ?? 'this format';
  if (failedBeforeStream || frames === 0) {
    out.push({
      id: 'dialect',
      label: 'Dialect match',
      verdict: 'na',
      statement: 'No frames were decoded, so there is nothing to compare.',
    });
  } else if (s.chunks === 0) {
    out.push({
      id: 'dialect',
      label: 'Dialect match',
      verdict: 'fail',
      statement:
        `${plural(frames, 'frame')} arrived and none yielded a chunk. That is the signature of a ` +
        `reader pointed at a different dialect than the endpoint is sending — this reader is ${reader}.`,
      detail: 'The bytes are arriving; this format simply recognises nothing in them.',
    });
  } else if (!sawContentKey) {
    out.push({
      id: 'dialect',
      label: 'Dialect match',
      verdict: 'fail',
      statement:
        'Frames parsed, but no frame carried a content key (text, reasoning, toolCalls, sources). ' +
        'The payload may be in a field this format does not read.',
      detail: 'Open Frames below to see which keys each frame did carry.',
    });
  } else {
    out.push({
      id: 'dialect',
      label: 'Dialect match',
      verdict: 'ok',
      statement: `Frames parsed into chunks carrying content keys ${reader} reads.`,
    });
  }

  // ── Streaming, or buffered and dumped at the end? ────────────────────
  //
  // The check a browser network panel structurally cannot do: it sees one
  // response, not the arrival times of the frames inside it.
  const times = s.frameRows.map((f) => f.atMs).filter((t): t is number => t !== undefined);
  if (times.length < 3) {
    out.push({
      id: 'buffering',
      label: 'Streaming, not buffered',
      verdict: 'na',
      statement: 'Too few frames to judge (three needed).',
    });
  } else {
    const span = times[times.length - 1] - times[0];
    const tailStart = times[0] + span * 0.8;
    const tail = times.filter((t) => t >= tailStart).length;
    const share = tail / times.length;
    if (span > 200 && share >= 0.8) {
      out.push({
        id: 'buffering',
        label: 'Streaming, not buffered',
        verdict: 'warn',
        statement:
          `${group(tail)} of ${group(times.length)} frames arrived in the final ` +
          `${group(Math.round(span * 0.2))}ms of a ${group(span)}ms span. Something upstream is ` +
          'buffering the stream rather than the model being slow.',
        detail:
          'Heuristic: at least 80% of frames landing inside the last 20% of the span. ' +
          'A proxy, a serverless response buffer or a compression layer will each do this.',
      });
    } else {
      out.push({
        id: 'buffering',
        label: 'Streaming, not buffered',
        verdict: 'ok',
        statement: `Frames spread across ${duration(span)}.`,
      });
    }
  }

  // ── One long stall, as opposed to a slow stream ──────────────────────
  if (times.length >= 3) {
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const worst = Math.max(...gaps);
    const mid = median(gaps);
    if (worst > 250 && worst > mid * 3) {
      const at = gaps.indexOf(worst) + 1;
      out.push({
        id: 'gap',
        label: 'Longest gap',
        verdict: 'warn',
        statement:
          `Longest gap ${group(worst)}ms before frame ${s.frameRows[at]?.seq ?? at + 1}, ` +
          `against a ${group(mid)}ms median.`,
        detail: 'One stall rather than a uniformly slow stream.',
      });
    }
    // Otherwise it is not a finding, and a row saying "nothing unusual" is
    // exactly the noise this redesign is removing.
  }

  // ── What actually served the response? ───────────────────────────────
  out.push(
    s.model
      ? {
          id: 'model',
          label: 'Model served',
          verdict: 'ok',
          statement: `The response reported ${s.model}.`,
          detail: 'Read from the response, so it is what served the turn, not what was asked for.',
        }
      : {
          id: 'model',
          label: 'Model served',
          verdict: 'na',
          statement: 'The stream did not report a model.',
          detail: 'Not every endpoint sends one, and the panel will not fill it in from elsewhere.',
        },
  );

  // ── Reasoning, so an empty thinking panel is explainable ─────────────
  const reasoning = s.parts.reasoning ?? 0;
  out.push(
    reasoning > 0
      ? {
          id: 'reasoning',
          label: 'Reasoning',
          verdict: 'ok',
          statement: `${plural(reasoning, 'reasoning part')}.`,
        }
      : {
          id: 'reasoning',
          label: 'Reasoning',
          verdict: 'na',
          statement: 'No reasoning parts (this model may not emit any).',
        },
  );

  // ── Tool calls ───────────────────────────────────────────────────────
  const tools = s.parts.tool ?? 0;
  if (tools > 0) {
    out.push({
      id: 'tools',
      label: 'Tool calls',
      verdict: 'ok',
      statement: `${plural(tools, 'tool part')}.`,
    });
  }


  // ── The write path: what we SENT, and what never made it ─────────────
  //
  // The read path cannot answer "did the model actually receive my
  // attachment". These checks are the reason the encoder is instrumented at
  // all, and a silent drop is the highest-value thing this tool can surface.
  const attachments = s.request?.attachments ?? [];
  if (attachments.length > 0) {
    const skipped = attachments.filter((a) => a.disposition === 'skipped');
    const asText = attachments.filter((a) => a.disposition === 'as-text');
    if (skipped.length > 0) {
      out.push({
        id: 'attachments',
        label: 'Attachments',
        verdict: 'fail',
        statement: skipped
          .map(
            (a) =>
              `${plural(1, `${a.mediaType ?? 'unknown'} attachment`)}` +
              `${a.bytes !== undefined ? ` (${bytes(a.bytes)})` : ''} was not encoded for this ` +
              `provider, so the model never saw it${a.reason ? ` — ${a.reason}` : ''}.`,
          )
          .join(' '),
        detail: 'It still rendered in the thread, which is what makes this easy to miss.',
      });
    } else if (asText.length > 0) {
      out.push({
        id: 'attachments',
        label: 'Attachments',
        verdict: 'warn',
        statement:
          `${plural(asText.length, 'attachment')} reached the model as TEXT rather than as a ` +
          `native part${asText[0].reason ? ` — ${asText[0].reason}` : ''}.`,
        detail: 'Fidelity depends on the encoder; the model did receive something.',
      });
    } else {
      out.push({
        id: 'attachments',
        label: 'Attachments',
        verdict: 'ok',
        statement: `${plural(attachments.length, 'attachment')} encoded for this provider.`,
      });
    }
  }

  if (s.dropped.length > 0) {
    out.push({
      id: 'dropped',
      label: 'Dropped parts',
      verdict: 'fail',
      statement: s.dropped
        .map(
          (d) =>
            `${plural(d.count, `${d.variant} part`)} were not encoded onto this wire` +
            `${d.reason ? ` — ${d.reason}` : ''}.`,
        )
        .join(' '),
      detail:
        'These exist in the thread and were never sent, so the model answered without them.',
    });
  }

  // A content type that is not an SSE stream, on a source that should be one.
  if (s.contentType && !/event-stream/i.test(s.contentType)) {
    out.push({
      id: 'contentType',
      label: 'Content type',
      verdict: 'warn',
      statement:
        `The response declared ${s.contentType} where text/event-stream was expected. ` +
        'An endpoint returning a page or a plain JSON body instead of a stream looks like this.',
    });
  }

  // ── The kit's own error vocabulary ───────────────────────────────────
  if (!failedBeforeStream && s.errorCode !== undefined) {
    const code = String(s.errorCode);
    out.push({
      id: 'errorCode',
      label: 'Error code',
      verdict: 'fail',
      statement: CODE_COPY[code] ?? `${code} — reported by the stream.`,
    });
  }

  return out.sort((a, b) => RANK[a.verdict] - RANK[b.verdict]);
}
