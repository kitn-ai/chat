import { describe, expect, it } from 'vitest';
import { CONTENT_KEYS, findingsFor, foldStreams, streamStatus } from './streams';
import type { WireDiagnosticEvent } from './contract';

const ev = (o: Record<string, unknown>) => o as unknown as WireDiagnosticEvent;

describe('foldStreams', () => {
  it('folds a healthy stream into one summary', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 100, streamId: 'wire-1', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.frame', t: 150, streamId: 'wire-1', seq: 1, bytes: 90, chunks: 1, fields: ['text'], model: 'openai/gpt-4o-mini' }),
      ev({ type: 'wire.frame', t: 160, streamId: 'wire-1', seq: 2, bytes: 40, chunks: 1, fields: ['finishReason'] }),
      ev({ type: 'wire.part', t: 151, streamId: 'wire-1', variant: 'text', index: 0, chars: 5 }),
      ev({ type: 'wire.close', t: 200, streamId: 'wire-1', frames: 2, chunks: 2, parts: { text: 1 }, finishReason: 'stop', ms: 100 }),
    ]);
    expect(streams).toHaveLength(1);
    const s = streams[0];
    expect(s.streamId).toBe('wire-1');
    expect(s.format).toBe('openai.chat-completions');
    expect(s.source).toBe('response');
    expect(s.frames).toBe(2);
    expect(s.chunks).toBe(2);
    expect(s.parts).toEqual({ text: 1 });
    expect(s.model).toBe('openai/gpt-4o-mini');
    expect(s.finishReason).toBe('stop');
    expect(s.errorCode).toBeUndefined();
    expect(s.ms).toBe(100);
    // Time to the FIRST frame, relative to open.
    expect(s.firstFrameMs).toBe(50);
    expect(s.open).toBe(false);
  });

  it('reports the wrong-dialect signature', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-2', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.frame', t: 1, streamId: 'wire-2', seq: 1, bytes: 120, chunks: 0, fields: [] }),
      ev({ type: 'wire.frame', t: 2, streamId: 'wire-2', seq: 2, bytes: 110, chunks: 0, fields: [] }),
      ev({ type: 'wire.close', t: 3, streamId: 'wire-2', frames: 2, chunks: 0, parts: {}, finishReason: null, errorCode: 'empty-stream', ms: 3 }),
    ]);
    const s = streams[0];
    expect(s.frames).toBe(2);
    expect(s.chunks).toBe(0);
    expect(s.parts).toEqual({});
    expect(s.errorCode).toBe('empty-stream');
    // No frame stated a model, and nothing may invent one.
    expect(s.model).toBeUndefined();
  });

  it('folds a wire.failed-only stream: status set, no close', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.failed', t: 5, streamId: 'wire-3', status: 401, statusText: 'Unauthorized', bodyBytes: 88, bodyIsJson: true, providerCode: 'invalid_api_key' }),
    ]);
    const s = streams[0];
    expect(s.status).toBe(401);
    expect(s.errorCode).toBe('invalid_api_key');
    // It failed before a stream existed, so it is NOT open and NOT complete.
    expect(s.open).toBe(false);
    // `frames` stays UNDEFINED, not 0. Nothing ever reported a frame count for
    // this stream, and "not reported" is a different claim from "none arrived"
    // -- the request died before framing was even reached.
    expect(s.frames).toBeUndefined();
  });

  it('a stream with no terminal event stays OPEN, not complete and not errored', () => {
    // A transport failure mid-read emits neither wire.close nor wire.failed
    // (recorded spec gap). Rendering it as complete would claim a finish that
    // never happened; rendering it as an error would claim one nobody reported.
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-4', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.frame', t: 10, streamId: 'wire-4', seq: 1, bytes: 90, chunks: 1, fields: ['text'] }),
      ev({ type: 'wire.part', t: 11, streamId: 'wire-4', variant: 'text', index: 0, chars: 3 }),
    ]);
    const s = streams[0];
    expect(s.open).toBe(true);
    expect(s.finishReason).toBeUndefined();
    expect(s.errorCode).toBeUndefined();
    expect(s.status).toBeUndefined();
    expect(s.ms).toBeUndefined();
    // Frames and parts still counted from what DID arrive.
    expect(s.frames).toBe(1);
    expect(s.parts).toEqual({ text: 1 });
  });

  it('ignores an unknown event type, counts it, and never throws', () => {
    const { streams, unknownTypes } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-5', format: 'x', source: 'response' }),
      ev({ type: 'wire.card', t: 1, streamId: 'wire-5', anything: 'a field from a newer kit' }),
      ev({ type: 'wire.card', t: 2, streamId: 'wire-5' }),
      ev({ type: 'wire.close', t: 3, streamId: 'wire-5', frames: 0, chunks: 0, parts: {}, finishReason: null, ms: 3 }),
    ]);
    expect(streams).toHaveLength(1);
    expect(unknownTypes).toEqual({ 'wire.card': 2 });
  });

  it('accumulates chunks live, before any close arrives', () => {
    // MID-STREAM HONESTY. `chunks` used to be set only from wire.close, so a
    // healthy stream spent its whole duration rendering
    // `N frames → 0 chunks → M parts` -- which is the wrong-dialect signature
    // this panel exists to flag, shown transiently on every healthy stream.
    // Each frame REPORTS how many chunks it yielded, so summing them is
    // measurement, not invention.
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-7', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.frame', t: 1, streamId: 'wire-7', seq: 1, bytes: 40, chunks: 2, fields: ['text'] }),
      ev({ type: 'wire.frame', t: 2, streamId: 'wire-7', seq: 2, bytes: 30, chunks: 1, fields: ['text'] }),
    ]);
    expect(streams[0].chunks).toBe(3);
    expect(streams[0].open).toBe(true);
  });

  it('the close value is authoritative and overwrites the running sum', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-8', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.frame', t: 1, streamId: 'wire-8', seq: 1, bytes: 40, chunks: 2, fields: ['text'] }),
      ev({ type: 'wire.frame', t: 2, streamId: 'wire-8', seq: 2, bytes: 30, chunks: 1, fields: ['text'] }),
      ev({ type: 'wire.close', t: 3, streamId: 'wire-8', frames: 2, chunks: 3, parts: { text: 1 }, finishReason: 'stop', ms: 3 }),
    ]);
    expect(streams[0].chunks).toBe(3);
    expect(streams[0].open).toBe(false);
  });

  it('counts DISTINCT parts live, not write events', () => {
    // Three text deltas merge into ONE part. Counting wire.part events made the
    // live figure climb to 3 and then FALL to 1 when wire.close's authoritative
    // map arrived -- a number that visibly dropped at the end of every healthy
    // stream. Each event carries its `index`, so unique (variant, index) pairs
    // are a measured distinct count that converges smoothly instead.
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-10', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.part', t: 1, streamId: 'wire-10', variant: 'text', index: 0, chars: 3 }),
      ev({ type: 'wire.part', t: 2, streamId: 'wire-10', variant: 'text', index: 0, chars: 4 }),
      ev({ type: 'wire.part', t: 3, streamId: 'wire-10', variant: 'text', index: 0, chars: 2 }),
    ]);
    expect(streams[0].parts).toEqual({ text: 1 });
    expect(streams[0].open).toBe(true);
  });

  it('separates distinct indices and variants', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-11', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.part', t: 1, streamId: 'wire-11', variant: 'text', index: 0, chars: 3 }),
      ev({ type: 'wire.part', t: 2, streamId: 'wire-11', variant: 'tool', index: 1 }),
      ev({ type: 'wire.part', t: 3, streamId: 'wire-11', variant: 'text', index: 0, chars: 5 }),
      ev({ type: 'wire.part', t: 4, streamId: 'wire-11', variant: 'text', index: 2, chars: 1 }),
    ]);
    expect(streams[0].parts).toEqual({ text: 2, tool: 1 });
  });

  it('the close map is adopted verbatim over the live count', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-12', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.part', t: 1, streamId: 'wire-12', variant: 'text', index: 0, chars: 3 }),
      ev({ type: 'wire.part', t: 2, streamId: 'wire-12', variant: 'text', index: 1, chars: 3 }),
      ev({ type: 'wire.close', t: 3, streamId: 'wire-12', frames: 2, chunks: 2, parts: { text: 1 }, finishReason: 'stop', ms: 3 }),
    ]);
    expect(streams[0].parts).toEqual({ text: 1 });
  });

  it('a close with no frames reports frames as undefined, not zero', () => {
    // `consumeModelStream` called directly has no frames to report. "Not
    // reported" and "none arrived" are different facts and must render
    // differently.
    const { streams } = foldStreams([
      ev({ type: 'wire.close', t: 1, streamId: 'wire-6', chunks: 3, parts: { text: 1 }, finishReason: 'stop', ms: 7 }),
    ]);
    expect(streams[0].frames).toBeUndefined();
    expect(streams[0].chunks).toBe(3);
  });

  it('retains one row per frame, with its fields, for the inspector', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 100, streamId: 'wire-20', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.frame', t: 130, streamId: 'wire-20', seq: 1, bytes: 92, chunks: 1, fields: ['model', 'text'], model: 'openai/gpt-4o-mini' }),
      ev({ type: 'wire.frame', t: 160, streamId: 'wire-20', seq: 2, bytes: 41, chunks: 1, fields: ['finishReason'] }),
    ]);
    const rows = streams[0].frameRows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ seq: 1, bytes: 92, chunks: 1, atMs: 30, model: 'openai/gpt-4o-mini' });
    expect(rows[0].fields).toEqual(['model', 'text']);
    expect(rows[1]).toMatchObject({ seq: 2, bytes: 41, chunks: 1, atMs: 60 });
  });

  it('retains part events in arrival order, metadata only', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-21', format: 'f', source: 'response' }),
      ev({ type: 'wire.part', t: 5, streamId: 'wire-21', variant: 'text', index: 0, chars: 12 }),
      ev({ type: 'wire.part', t: 9, streamId: 'wire-21', variant: 'tool', index: 1 }),
    ]);
    expect(streams[0].partRows).toEqual([
      { variant: 'text', index: 0, chars: 12, atMs: 5 },
      { variant: 'tool', index: 1, atMs: 9 },
    ]);
  });

  it('captures stopReason and usage from the close', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-22', format: 'f', source: 'response' }),
      ev({ type: 'wire.close', t: 9, streamId: 'wire-22', frames: 1, chunks: 1, parts: { text: 1 }, finishReason: 'stop', stopReason: 'stop', usage: { inputTokens: 13, outputTokens: 10 }, ms: 9 }),
    ]);
    expect(streams[0].stopReason).toBe('stop');
    expect(streams[0].usage).toEqual({ inputTokens: 13, outputTokens: 10 });
  });

  it('classifies each stream for the status filter', () => {
    const base = (id: string, extra: Record<string, unknown>[]) =>
      foldStreams([
        ev({ type: 'wire.open', t: 0, streamId: id, format: 'f', source: 'response' }),
        ...extra.map(ev),
      ]).streams[0];

    // Opened, nothing terminal ever arrived.
    expect(streamStatus(base('a', []))).toBe('open');
    // Closed clean.
    expect(
      streamStatus(base('b', [{ type: 'wire.close', t: 1, streamId: 'b', chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 1 }])),
    ).toBe('ok');
    // Parsed, produced nothing -- the case this whole product exists for.
    expect(
      streamStatus(base('c', [{ type: 'wire.close', t: 1, streamId: 'c', frames: 5, chunks: 0, parts: {}, finishReason: null, errorCode: 'empty-stream', ms: 1 }])),
    ).toBe('empty');
    expect(
      streamStatus(base('d', [{ type: 'wire.close', t: 1, streamId: 'd', frames: 2, chunks: 2, parts: {}, finishReason: null, errorCode: 'empty-turn', ms: 1 }])),
    ).toBe('empty');
    // HTTP failure.
    expect(
      streamStatus(base('e', [{ type: 'wire.failed', t: 1, streamId: 'e', status: 401, statusText: 'Unauthorized', bodyBytes: 20, bodyIsJson: true, providerCode: 'invalid_api_key' }])),
    ).toBe('failed');
    // An in-band provider error is a failure, not an emptiness.
    expect(
      streamStatus(base('f', [{ type: 'wire.close', t: 1, streamId: 'f', frames: 1, chunks: 1, parts: {}, finishReason: 'error', errorCode: 'rate_limit', ms: 1 }])),
    ).toBe('failed');
  });

  it('names the content-bearing field keys', () => {
    // The chips lean on this: a frame whose fields are ALL metadata is the
    // wrong-dialect texture, and that distinction has to live beside the fold
    // rather than being restated in the view.
    expect([...CONTENT_KEYS].sort()).toEqual(['reasoning', 'sources', 'text', 'toolCalls']);
  });

  it('groups by streamId and keeps arrival order', () => {
    const { streams } = foldStreams([
      ev({ type: 'wire.open', t: 0, streamId: 'a', format: 'f', source: 'response' }),
      ev({ type: 'wire.open', t: 1, streamId: 'b', format: 'f', source: 'stream' }),
      ev({ type: 'wire.frame', t: 2, streamId: 'b', seq: 1, bytes: 1, chunks: 1, fields: [] }),
    ]);
    expect(streams.map((s) => s.streamId)).toEqual(['a', 'b']);
  });

  it('tolerates an event with no streamId at all', () => {
    const { streams } = foldStreams([ev({ type: 'wire.open', t: 0, format: 'f', source: 'iterable' })]);
    expect(streams).toHaveLength(1);
    expect(streams[0].streamId).toBeUndefined();
  });
});

// ── The verdict layer ────────────────────────────────────────────────────────
//
// The copy IS the deliverable here, so these assertions pin wording, not just
// shape. Every statement leads with the OBSERVATION and only then names a
// suspicion, and no finding may assert a cause the panel cannot know.

const fold = (events: Record<string, unknown>[]) => foldStreams(events.map(ev)).streams[0];
const find = (events: Record<string, unknown>[], id: string) =>
  findingsFor(fold(events)).find((f) => f.id === id);

const HEALTHY_EVENTS = [
  { type: 'wire.open', t: 0, streamId: 'h', format: 'openai.chat-completions', source: 'response' },
  { type: 'wire.frame', t: 100, streamId: 'h', seq: 1, bytes: 90, chunks: 1, fields: ['model', 'text'], model: 'openai/gpt-4o-mini' },
  { type: 'wire.part', t: 101, streamId: 'h', variant: 'text', index: 0, chars: 5 },
  { type: 'wire.frame', t: 600, streamId: 'h', seq: 2, bytes: 60, chunks: 1, fields: ['text'] },
  { type: 'wire.part', t: 601, streamId: 'h', variant: 'text', index: 0, chars: 4 },
  { type: 'wire.frame', t: 1200, streamId: 'h', seq: 3, bytes: 40, chunks: 1, fields: ['finishReason'] },
  { type: 'wire.close', t: 1210, streamId: 'h', frames: 3, chunks: 3, parts: { text: 1 }, finishReason: 'stop', ms: 1210 },
];

describe('findingsFor', () => {
  it('a healthy stream reads as a short list with no failures', () => {
    const found = findingsFor(fold(HEALTHY_EVENTS));
    expect(found.filter((f) => f.verdict === 'fail')).toHaveLength(0);
    expect(find(HEALTHY_EVENTS, 'content')!.verdict).toBe('ok');
    expect(find(HEALTHY_EVENTS, 'content')!.statement).toBe('1 text part from 3 frames.');
    expect(find(HEALTHY_EVENTS, 'model')!.statement).toBe('The response reported openai/gpt-4o-mini.');
    expect(find(HEALTHY_EVENTS, 'dialect')!.verdict).toBe('ok');
  });

  it('orders failures first and not-applicable last', () => {
    const found = findingsFor(fold(HEALTHY_EVENTS));
    const rank = { fail: 0, warn: 1, ok: 2, na: 3 } as const;
    const ranks = found.map((f) => rank[f.verdict]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('frames that yield no chunks read as a dialect signature, observation first', () => {
    const events = [
      { type: 'wire.open', t: 0, streamId: 'd', format: 'openai.chat-completions', source: 'response' },
      ...[1, 2, 3, 4, 5].map((n) => ({ type: 'wire.frame', t: n * 10, streamId: 'd', seq: n, bytes: 100, chunks: 0, fields: [] })),
      { type: 'wire.close', t: 60, streamId: 'd', frames: 5, chunks: 0, parts: {}, finishReason: null, errorCode: 'empty-stream', ms: 60 },
    ];
    expect(find(events, 'content')!.verdict).toBe('fail');
    expect(find(events, 'content')!.statement).toBe('5 frames arrived and no message part was produced.');

    const dialect = find(events, 'dialect')!;
    expect(dialect.verdict).toBe('fail');
    expect(dialect.statement).toBe(
      '5 frames arrived and none yielded a chunk. That is the signature of a reader pointed at a different dialect than the endpoint is sending — this reader is openai.chat-completions.',
    );
    // It must never claim to know what the endpoint actually is.
    expect(dialect.statement).not.toMatch(/anthropic/i);
  });

  it('chunks with no content key ever get their own wording', () => {
    const events = [
      { type: 'wire.open', t: 0, streamId: 'm', format: 'openai.chat-completions', source: 'response' },
      { type: 'wire.frame', t: 10, streamId: 'm', seq: 1, bytes: 80, chunks: 1, fields: ['model'] },
      { type: 'wire.frame', t: 20, streamId: 'm', seq: 2, bytes: 40, chunks: 1, fields: ['usage', 'finishReason'] },
      { type: 'wire.close', t: 30, streamId: 'm', frames: 2, chunks: 2, parts: {}, finishReason: 'stop', errorCode: 'empty-turn', ms: 30 },
    ];
    expect(find(events, 'dialect')!.statement).toBe(
      'Frames parsed, but no frame carried a content key (text, reasoning, toolCalls, sources). The payload may be in a field this format does not read.',
    );
  });

  it('flags a buffered arrival pattern, quoting the counts it judged on', () => {
    // 10 frames over ~1000ms with 9 of them crammed into the last stretch.
    const events = [
      { type: 'wire.open', t: 0, streamId: 'b', format: 'f', source: 'response' },
      { type: 'wire.frame', t: 0, streamId: 'b', seq: 1, bytes: 10, chunks: 1, fields: ['text'] },
      ...Array.from({ length: 9 }, (_, i) => ({
        type: 'wire.frame', t: 905 + i * 10, streamId: 'b', seq: i + 2, bytes: 10, chunks: 1, fields: ['text'],
      })),
      { type: 'wire.part', t: 1, streamId: 'b', variant: 'text', index: 0, chars: 3 },
    ];
    const buffering = find(events, 'buffering')!;
    expect(buffering.verdict).toBe('warn');
    expect(buffering.statement).toContain('9 of 10 frames arrived in the final');
    expect(buffering.statement).toContain('buffering');
    // A heuristic has to say so.
    expect(`${buffering.statement} ${buffering.detail ?? ''}`).toMatch(/heuristic/i);
  });

  it('a spread arrival pattern passes', () => {
    expect(find(HEALTHY_EVENTS, 'buffering')!.verdict).toBe('ok');
    expect(find(HEALTHY_EVENTS, 'buffering')!.statement).toContain('spread');
  });

  it('is not applicable with fewer than three frames', () => {
    const events = [
      { type: 'wire.open', t: 0, streamId: 's', format: 'f', source: 'response' },
      { type: 'wire.frame', t: 5, streamId: 's', seq: 1, bytes: 10, chunks: 1, fields: ['text'] },
    ];
    expect(find(events, 'buffering')!.verdict).toBe('na');
  });

  it('surfaces an outlier gap and stays quiet about a smooth one', () => {
    const spiky = [
      { type: 'wire.open', t: 0, streamId: 'g', format: 'f', source: 'response' },
      ...[0, 10, 20, 1260, 1270].map((t, i) => ({
        type: 'wire.frame', t, streamId: 'g', seq: i + 1, bytes: 10, chunks: 1, fields: ['text'],
      })),
    ];
    const gap = find(spiky, 'gap')!;
    expect(gap.verdict).toBe('warn');
    expect(gap.statement).toContain('1,240ms');
    expect(gap.statement).toContain('frame 4');

    const smooth = [
      { type: 'wire.open', t: 0, streamId: 'g2', format: 'f', source: 'response' },
      ...[0, 10, 20, 30, 40].map((t, i) => ({
        type: 'wire.frame', t, streamId: 'g2', seq: i + 1, bytes: 10, chunks: 1, fields: ['text'],
      })),
    ];
    expect(find(smooth, 'gap')).toBeUndefined();
  });

  it('reports a failed request with status and provider code, never body text', () => {
    const events = [
      { type: 'wire.failed', t: 0, streamId: 'x', status: 401, statusText: 'Unauthorized', bodyBytes: 90, bodyIsJson: true, providerCode: 'invalid_api_key' },
    ];
    const req = find(events, 'request')!;
    expect(req.verdict).toBe('fail');
    expect(req.statement).toBe(
      'The request failed before any stream began: HTTP 401, provider code invalid_api_key.',
    );
  });

  it('explains an error code in the panel own words, keyed by code', () => {
    const events = [
      { type: 'wire.open', t: 0, streamId: 'e', format: 'f', source: 'response' },
      { type: 'wire.frame', t: 1, streamId: 'e', seq: 1, bytes: 10, chunks: 1, fields: ['finishReason'] },
      { type: 'wire.close', t: 2, streamId: 'e', frames: 1, chunks: 1, parts: {}, finishReason: 'stop', errorCode: 'empty-turn', ms: 2 },
    ];
    const code = find(events, 'errorCode')!;
    expect(code.verdict).toBe('fail');
    expect(code.statement).toContain('empty-turn');
    expect(code.statement).toContain('no message part was produced');
  });

  it('says a model was not reported rather than inventing one', () => {
    const events = [
      { type: 'wire.open', t: 0, streamId: 'n', format: 'f', source: 'response' },
      { type: 'wire.frame', t: 1, streamId: 'n', seq: 1, bytes: 10, chunks: 1, fields: ['text'] },
    ];
    const model = find(events, 'model')!;
    expect(model.verdict).toBe('na');
    expect(model.statement).toBe('The stream did not report a model.');
    expect(model.statement).not.toMatch(/unknown/i);
  });

  it('explains an absent reasoning panel', () => {
    const r = find(HEALTHY_EVENTS, 'reasoning')!;
    expect(r.verdict).toBe('na');
    expect(r.statement).toBe('No reasoning parts (this model may not emit any).');
  });
});

// ── The write path ───────────────────────────────────────────────────────────
//
// The kit instruments what it SENDS as well as what it reads: an `encode.request`
// inventory (including attachments) and an `encode.dropped` for every part the
// encoder could not represent on this wire. A part that rendered in the thread
// and never reached the model is the highest-value finding this tool can carry,
// so it gets its own checks.
//
// These events are landing on a sibling branch. The fold is written tolerant by
// the forward-compat rule anyway, so these tests also pin that the CURRENT kit
// (which emits none of them) still folds cleanly.

const REQUEST = {
  type: 'encode.request',
  t: 0,
  streamId: 'w-1',
  format: 'openai.chat-completions',
  messages: 4,
  byRole: { user: 2, assistant: 2 },
  parts: { text: 5, file: 1 },
  bodyBytes: 5120,
  attachments: [
    { mediaType: 'image/png', bytes: 245760, encoded: true, disposition: 'encoded' },
  ],
};

describe('the write path', () => {
  it('retains the request inventory on the stream', () => {
    const s = fold([
      REQUEST,
      { type: 'wire.open', t: 1, streamId: 'w-1', format: 'openai.chat-completions', source: 'response' },
    ]);
    expect(s.request).toMatchObject({
      format: 'openai.chat-completions',
      messages: 4,
      bodyBytes: 5120,
    });
    expect(s.request!.byRole).toEqual({ user: 2, assistant: 2 });
    expect(s.request!.attachments).toHaveLength(1);
    expect(s.request!.attachments[0]).toMatchObject({ mediaType: 'image/png', bytes: 245760, disposition: 'encoded' });
  });

  it('retains every dropped part', () => {
    const s = fold([
      REQUEST,
      { type: 'encode.dropped', t: 2, streamId: 'w-1', variant: 'card', count: 2, reason: 'no representation on this wire' },
      { type: 'encode.dropped', t: 3, streamId: 'w-1', variant: 'file', count: 1, messageIndex: 1, partIndex: 0, reason: 'onUnencodableFile: skip' },
    ]);
    expect(s.dropped).toHaveLength(2);
    expect(s.dropped[1]).toMatchObject({ variant: 'file', count: 1, reason: 'onUnencodableFile: skip' });
  });

  it('keeps the connection identity wire.open now carries', () => {
    const s = fold([
      { type: 'wire.open', t: 0, streamId: 'c-1', format: 'openai.chat-completions', source: 'response', url: 'https://api.example.com/v1/chat', hasQuery: false, status: 200, contentType: 'text/event-stream' },
    ]);
    expect(s.url).toBe('https://api.example.com/v1/chat');
    expect(s.contentType).toBe('text/event-stream');
    expect(s.httpStatus).toBe(200);
  });

  it('a skipped attachment is a failure that says the model never saw it', () => {
    const events = [
      { ...REQUEST, attachments: [
        { mediaType: 'image/png', bytes: 245760, encoded: false, disposition: 'skipped', reason: 'this provider does not accept image parts' },
      ] },
      { type: 'wire.open', t: 1, streamId: 'w-1', format: 'openai.chat-completions', source: 'response' },
    ];
    const f = find(events, 'attachments')!;
    expect(f.verdict).toBe('fail');
    expect(f.statement).toContain('image/png');
    expect(f.statement).toContain('was not encoded');
    expect(f.statement).toContain('the model never saw it');
    expect(f.statement).toContain('this provider does not accept image parts');
  });

  it('an as-text attachment warns rather than fails', () => {
    const events = [
      { ...REQUEST, attachments: [
        { mediaType: 'text/csv', bytes: 900, encoded: true, disposition: 'as-text', reason: 'inlined as text' },
      ] },
    ];
    expect(find(events, 'attachments')!.verdict).toBe('warn');
  });

  it('all-encoded attachments pass', () => {
    expect(find([REQUEST], 'attachments')!.verdict).toBe('ok');
  });

  it('a dropped part is a failure naming the variant and the reason', () => {
    const events = [
      REQUEST,
      { type: 'encode.dropped', t: 2, streamId: 'w-1', variant: 'card', count: 2, reason: 'no representation on this wire' },
    ];
    const f = find(events, 'dropped')!;
    expect(f.verdict).toBe('fail');
    expect(f.statement).toContain('2 card parts');
    expect(f.statement).toContain('were not encoded');
    expect(f.statement).toContain('no representation on this wire');
  });

  it('warns about a content type that is not an SSE stream', () => {
    const events = [
      { type: 'wire.open', t: 0, streamId: 'h-1', format: 'openai.chat-completions', source: 'response', contentType: 'text/html; charset=utf-8' },
    ];
    const f = find(events, 'contentType')!;
    expect(f.verdict).toBe('warn');
    expect(f.statement).toContain('text/html; charset=utf-8');
    // Observation first, and no assertion about what the endpoint is.
    expect(f.statement).toContain('text/event-stream');
  });

  it('says nothing about a request that was never reported', () => {
    // The app may encode elsewhere, so absence is not a finding.
    const events = [
      { type: 'wire.open', t: 0, streamId: 'q-1', format: 'f', source: 'response' },
    ];
    expect(find(events, 'attachments')).toBeUndefined();
    expect(find(events, 'dropped')).toBeUndefined();
    expect(find(events, 'request')).toBeUndefined();
  });

  it('folds cleanly when the kit emits none of these', () => {
    const s = fold(HEALTHY_EVENTS);
    expect(s.request).toBeUndefined();
    expect(s.dropped).toEqual([]);
    expect(s.url).toBeUndefined();
    expect(s.contentType).toBeUndefined();
  });
});
