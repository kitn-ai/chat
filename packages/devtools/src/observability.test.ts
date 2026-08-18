import { describe, expect, it } from 'vitest';
import { foldStreams } from './streams';
import { phasesFor, rollup } from './observability';
import type { WireDiagnosticEvent } from './contract';

const ev = (o: Record<string, unknown>) => o as unknown as WireDiagnosticEvent;
const fold = (events: Record<string, unknown>[]) => foldStreams(events.map(ev)).streams;
const one = (events: Record<string, unknown>[]) => fold(events)[0];

/** A reasoning model: opens, thinks, then answers. The gap between the last
 *  reasoning delta and the first text delta is the number people actually ask
 *  about ("why did it sit there after thinking?"). */
const REASONING_TURN = [
  { type: 'wire.open', t: 1000, streamId: 'r1', format: 'openai.chat-completions', source: 'response' },
  { type: 'wire.frame', t: 1200, streamId: 'r1', seq: 1, bytes: 40, chunks: 1, fields: ['reasoning'] },
  { type: 'wire.part', t: 1210, streamId: 'r1', variant: 'reasoning', index: 0, chars: 12 },
  { type: 'wire.part', t: 1600, streamId: 'r1', variant: 'reasoning', index: 0, chars: 20 },
  { type: 'wire.part', t: 2400, streamId: 'r1', variant: 'text', index: 1, chars: 5 },
  { type: 'wire.part', t: 2500, streamId: 'r1', variant: 'text', index: 1, chars: 7 },
  { type: 'wire.close', t: 2600, streamId: 'r1', frames: 1, chunks: 1, parts: { reasoning: 1, text: 1 }, finishReason: 'stop', ms: 1600 },
];

describe('phasesFor', () => {
  it('derives every phase of a reasoning turn', () => {
    const p = phasesFor(one(REASONING_TURN));
    expect(p.ttfbMs).toBe(200); // open → first frame
    expect(p.toFirstReasoningMs).toBe(210); // open → first reasoning part
    expect(p.reasoningSpanMs).toBe(390); // first → last reasoning part
    expect(p.thinkToAnswerMs).toBe(800); // last reasoning → first text
    expect(p.toFirstTextMs).toBe(1400); // open → first text part
    expect(p.totalMs).toBe(1600);
  });

  it('leaves a phase absent when it cannot be derived, never zero', () => {
    const p = phasesFor(
      one([
        { type: 'wire.open', t: 0, streamId: 'n1', format: 'f', source: 'response' },
        { type: 'wire.frame', t: 30, streamId: 'n1', seq: 1, bytes: 10, chunks: 1, fields: ['text'] },
        { type: 'wire.part', t: 31, streamId: 'n1', variant: 'text', index: 0, chars: 4 },
      ]),
    );
    expect(p.ttfbMs).toBe(30);
    expect(p.toFirstTextMs).toBe(31);
    // No reasoning ever arrived, so these are UNDERIVABLE -- not 0.
    expect(p.toFirstReasoningMs).toBeUndefined();
    expect(p.reasoningSpanMs).toBeUndefined();
    expect(p.thinkToAnswerMs).toBeUndefined();
    // No close, so no total.
    expect(p.totalMs).toBeUndefined();
  });

  it('reports a single reasoning delta as a zero-length span, not a missing one', () => {
    const p = phasesFor(
      one([
        { type: 'wire.open', t: 0, streamId: 's1', format: 'f', source: 'response' },
        { type: 'wire.part', t: 100, streamId: 's1', variant: 'reasoning', index: 0, chars: 9 },
        { type: 'wire.part', t: 300, streamId: 's1', variant: 'text', index: 1, chars: 3 },
      ]),
    );
    expect(p.reasoningSpanMs).toBe(0);
    expect(p.thinkToAnswerMs).toBe(200);
  });

  it('is empty for a stream that never opened', () => {
    const p = phasesFor(
      one([
        { type: 'wire.failed', t: 0, streamId: 'f1', status: 401, statusText: 'Unauthorized', bodyBytes: 10, bodyIsJson: true },
      ]),
    );
    expect(p.ttfbMs).toBeUndefined();
    expect(p.totalMs).toBeUndefined();
  });
});

describe('rollup', () => {
  const SESSION = [
    ...REASONING_TURN,
    { type: 'wire.open', t: 3000, streamId: 'a1', format: 'openai.chat-completions', source: 'response' },
    { type: 'wire.frame', t: 3100, streamId: 'a1', seq: 1, bytes: 50, chunks: 1, fields: ['model', 'text'], model: 'openai/gpt-4o-mini' },
    { type: 'wire.part', t: 3110, streamId: 'a1', variant: 'text', index: 0, chars: 6 },
    { type: 'wire.close', t: 3400, streamId: 'a1', frames: 1, chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 400, usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 20, cachedInputTokens: 10, totalTokens: 150, costUsd: 0.002 } },
    { type: 'wire.open', t: 4000, streamId: 'b1', format: 'openai.chat-completions', source: 'response' },
    { type: 'wire.frame', t: 4010, streamId: 'b1', seq: 1, bytes: 90, chunks: 0, fields: [] },
    { type: 'wire.close', t: 4020, streamId: 'b1', frames: 1, chunks: 0, parts: {}, finishReason: null, errorCode: 'empty-stream', ms: 20 },
    { type: 'wire.failed', t: 5000, streamId: 'c1', status: 401, statusText: 'Unauthorized', bodyBytes: 30, bodyIsJson: true, providerCode: 'invalid_api_key' },
  ];

  it('counts streams by outcome', () => {
    const r = rollup(fold(SESSION));
    expect(r.streams).toBe(4);
    expect(r.ok).toBe(2);
    expect(r.empty).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.open).toBe(0);
  });

  it('lists the models that actually answered, with counts', () => {
    const r = rollup(fold(SESSION));
    expect(r.models).toEqual([{ model: 'openai/gpt-4o-mini', streams: 1 }]);
  });

  it('totals only the tokens that were reported', () => {
    const r = rollup(fold(SESSION));
    expect(r.tokens).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 20,
      cachedInputTokens: 10,
      totalTokens: 150,
    });
    expect(r.costUsd).toBeCloseTo(0.002);
  });

  it('leaves cost absent when nobody reported one', () => {
    const r = rollup(fold(REASONING_TURN));
    expect(r.costUsd).toBeUndefined();
    // And no token key at all rather than a row of zeroes.
    expect(r.tokens).toEqual({});
  });

  it('measures wall time across the session', () => {
    const r = rollup(fold(SESSION));
    expect(r.wallMs).toBe(4000); // first open 1000 → last event 5000
  });

  it('groups by traceId when one is reported', () => {
    const traced = fold([
      { type: 'wire.open', t: 0, streamId: 't1', traceId: 'trace-a', format: 'f', source: 'response' },
      { type: 'wire.close', t: 10, streamId: 't1', chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 10 },
      { type: 'wire.open', t: 20, streamId: 't2', traceId: 'trace-a', format: 'f', source: 'response' },
      { type: 'wire.close', t: 30, streamId: 't2', chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 10 },
      { type: 'wire.open', t: 40, streamId: 't3', format: 'f', source: 'response' },
    ]);
    const r = rollup(traced);
    expect(r.traces).toEqual([{ traceId: 'trace-a', streams: 2 }]);
  });

  it('reports no traces when none were reported', () => {
    expect(rollup(fold(SESSION)).traces).toEqual([]);
  });

  it('is empty and safe with no streams', () => {
    const r = rollup([]);
    expect(r.streams).toBe(0);
    expect(r.models).toEqual([]);
    expect(r.wallMs).toBeUndefined();
  });
});

describe('the reasoning-token finding', () => {
  it('flags tokens billed for thinking that never arrived as parts', async () => {
    const { findingsFor } = await import('./streams');
    const s = one([
      { type: 'wire.open', t: 0, streamId: 'x1', format: 'openai.chat-completions', source: 'response' },
      { type: 'wire.frame', t: 10, streamId: 'x1', seq: 1, bytes: 40, chunks: 1, fields: ['text'] },
      { type: 'wire.part', t: 11, streamId: 'x1', variant: 'text', index: 0, chars: 5 },
      { type: 'wire.close', t: 20, streamId: 'x1', frames: 1, chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 20, usage: { reasoningTokens: 812, outputTokens: 40 } },
    ]);
    const f = findingsFor(s).find((x) => x.id === 'reasoning')!;
    expect(f.verdict).toBe('warn');
    // Observation first, suspicion second, and no assertion of a cause.
    expect(f.statement).toContain('812 reasoning tokens');
    expect(f.statement).toContain('no reasoning part arrived');
    expect(`${f.statement} ${f.detail ?? ''}`).toContain('may not read');
  });

  it('stays quiet when the tokens and the parts agree', async () => {
    const { findingsFor } = await import('./streams');
    const s = one([
      ...REASONING_TURN.slice(0, -1),
      { type: 'wire.close', t: 2600, streamId: 'r1', frames: 1, chunks: 1, parts: { reasoning: 1, text: 1 }, finishReason: 'stop', ms: 1600, usage: { reasoningTokens: 300 } },
    ]);
    const f = findingsFor(s).find((x) => x.id === 'reasoning')!;
    expect(f.verdict).toBe('ok');
  });
});
