import { describe, expect, it } from 'vitest';
import { foldStreams } from './streams';
import { verdictFor } from './verdict';
import type { WireDiagnosticEvent } from './contract';

const ev = (o: Record<string, unknown>) => o as unknown as WireDiagnosticEvent;
const fold = (events: Record<string, unknown>[]) => foldStreams(events.map(ev)).streams;

/** One healthy call: frames in, chunks out, a text part, a stated model. */
const call = (id: string, t: number, model?: string) => [
  { type: 'wire.open', t, streamId: id, format: 'openai.chat-completions', source: 'response' },
  { type: 'wire.frame', t: t + 100, streamId: id, seq: 1, bytes: 90, chunks: 1, fields: ['text'], ...(model ? { model } : {}) },
  { type: 'wire.part', t: t + 110, streamId: id, variant: 'text', index: 0, chars: 8 },
  { type: 'wire.frame', t: t + 900, streamId: id, seq: 2, bytes: 40, chunks: 1, fields: ['finishReason'] },
  { type: 'wire.close', t: t + 950, streamId: id, frames: 2, chunks: 2, parts: { text: 1 }, finishReason: 'stop', ms: 950, usage: { costUsd: 0.001 } },
];

/** A call whose frames parsed to nothing: the wrong-dialect signature. */
const brokenCall = (id: string, t: number) => [
  { type: 'wire.open', t, streamId: id, format: 'openai.chat-completions', source: 'response' },
  ...[1, 2, 3, 4, 5].map((n) => ({
    type: 'wire.frame', t: t + n, streamId: id, seq: n, bytes: 100, chunks: 0, fields: [],
  })),
  { type: 'wire.close', t: t + 10, streamId: id, frames: 5, chunks: 0, parts: {}, finishReason: null, errorCode: 'empty-stream', ms: 10 },
];

describe('the verdict line', () => {
  it('summarises a healthy session and says nothing is anomalous', () => {
    const streams = fold([
      ...call('wire-1', 0, 'openai/gpt-4o-mini'),
      ...call('wire-2', 2000, 'anthropic/claude-haiku-4.5'),
    ]);
    const v = verdictFor(streams);
    expect(v.anomalous).toBe(false);
    expect(v.text).toBe('2 model calls · 2 models · 3.0s · $0.0020 · nothing anomalous');
  });

  it('omits cost when nobody reported one, and stays a single line', () => {
    const streams = fold([
      { type: 'wire.open', t: 0, streamId: 'a', format: 'f', source: 'response' },
      { type: 'wire.frame', t: 10, streamId: 'a', seq: 1, bytes: 10, chunks: 1, fields: ['text'] },
      { type: 'wire.part', t: 11, streamId: 'a', variant: 'text', index: 0, chars: 2 },
      { type: 'wire.close', t: 20, streamId: 'a', frames: 1, chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 20 },
    ]);
    const v = verdictFor(streams);
    expect(v.anomalous).toBe(false);
    expect(v.text).toBe('1 model call · 20ms · nothing anomalous');
    expect(v.text).not.toContain('$');
    // No model was reported, so the segment is omitted rather than said as 0.
    expect(v.text).not.toContain('models');
  });

  it('is replaced by the finding when a call went wrong', () => {
    const streams = fold([
      ...call('wire-1', 0, 'openai/gpt-4o-mini'),
      ...brokenCall('wire-2', 2000),
    ]);
    const v = verdictFor(streams);
    expect(v.anomalous).toBe(true);
    expect(v.text).toBe('1 of 2 calls produced no content. 5 frames arrived, none parsed.');
  });

  it('counts every call sharing the leading finding', () => {
    const streams = fold([
      ...call('wire-1', 0),
      ...brokenCall('wire-2', 2000),
      ...brokenCall('wire-3', 4000),
    ]);
    expect(verdictFor(streams).text).toBe('2 of 3 calls produced no content. 5 frames arrived, none parsed.');
  });

  it('leads with the most severe when several kinds are wrong', () => {
    const streams = fold([
      ...brokenCall('wire-1', 0),
      // A buffering WARN must not outrank a content FAIL.
      { type: 'wire.open', t: 5000, streamId: 'wire-2', format: 'f', source: 'response' },
      ...Array.from({ length: 10 }, (_, i) => ({
        type: 'wire.frame', t: i === 0 ? 5000 : 5905 + i * 10, streamId: 'wire-2', seq: i + 1, bytes: 10, chunks: 1, fields: ['text'],
      })),
      { type: 'wire.part', t: 5001, streamId: 'wire-2', variant: 'text', index: 0, chars: 3 },
    ]);
    const v = verdictFor(streams);
    expect(v.anomalous).toBe(true);
    expect(v.text).toContain('produced no content');
  });

  it('reports a request that never streamed', () => {
    const streams = fold([
      { type: 'wire.failed', t: 0, streamId: 'wire-1', status: 401, statusText: 'Unauthorized', bodyBytes: 90, bodyIsJson: true, providerCode: 'invalid_api_key' },
    ]);
    const v = verdictFor(streams);
    expect(v.anomalous).toBe(true);
    expect(v.text).toBe('1 of 1 call failed before streaming. HTTP 401, invalid_api_key.');
  });

  it('says a call is still open rather than calling it healthy', () => {
    const streams = fold([
      { type: 'wire.open', t: 0, streamId: 'wire-1', format: 'f', source: 'response' },
      { type: 'wire.frame', t: 10, streamId: 'wire-1', seq: 1, bytes: 10, chunks: 1, fields: ['text'] },
      { type: 'wire.part', t: 11, streamId: 'wire-1', variant: 'text', index: 0, chars: 2 },
    ]);
    const v = verdictFor(streams);
    expect(v.anomalous).toBe(false);
    expect(v.text).toContain('1 in flight');
  });

  it('has nothing to say with no calls', () => {
    expect(verdictFor([]).text).toBe('Recording. Trigger a request.');
  });
});
