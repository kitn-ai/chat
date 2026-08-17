import { describe, expect, it } from 'vitest';
import { foldStreams } from './streams';
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
