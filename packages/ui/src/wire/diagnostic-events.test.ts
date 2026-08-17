import { afterEach, describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { subscribeWireDiagnostics, type WireDiagnosticEvent } from './diagnostics';

/** The REAL `AssistantStreamSink` method names (see chunk.ts): `upsertTool`. */
const nullSink = () =>
  ({
    appendText: () => {},
    appendReasoning: () => {},
    upsertTool: () => {},
    addSource: () => {},
  }) as any;

const SECRET = 'the user said something private';
const BODY = [
  `data: {"model":"openai/gpt-4o-mini","choices":[{"index":0,"delta":{"content":"${SECRET}"},"finish_reason":null}]}`,
  '',
  'data: {"model":"openai/gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

let off: (() => void) | undefined;
afterEach(() => {
  off?.();
  off = undefined;
});

describe('wire diagnostic events', () => {
  it('emits open → frames → part → close, correlated by one streamId', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(BODY), nullSink());
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('wire.open');
    expect(types.at(-1)).toBe('wire.close');
    expect(types).toContain('wire.frame');
    expect(types).toContain('wire.part');
    const ids = new Set(events.map((e) => e.streamId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^wire-\d+$/);

    const open = events[0] as any;
    expect(open.format).toBe('openai.chat-completions');
    expect(open.source).toBe('response');

    const frames = events.filter((e) => e.type === 'wire.frame') as any[];
    expect(frames.map((f) => f.seq)).toEqual([1, 2]); // [DONE] is not a frame
    expect(frames[0].fields).toContain('text');
    expect(frames[0].model).toBe('openai/gpt-4o-mini');
    expect(frames[0].bytes).toBeGreaterThan(0);

    const part = events.find((e) => e.type === 'wire.part') as any;
    expect(part.variant).toBe('text');
    expect(part.chars).toBe(SECRET.length); // length, never the text

    const close = events.at(-1) as any;
    expect(close.frames).toBe(2);
    expect(close.chunks).toBeGreaterThan(0);
    expect(close.parts).toEqual({ text: 1 });
    expect(close.finishReason).toBe('stop');
    expect(close.errorCode).toBeUndefined();
    expect(close.ms).toBeGreaterThanOrEqual(0);
  });

  it('the metadata boundary holds: no event carries the message text', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(BODY), nullSink());
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });

  it('the wrong-dialect signature: frames > 0, chunks 0, errorCode empty-stream', async () => {
    const anthropicBody = [
      'data: {"type":"message_start","message":{"model":"m","usage":{"input_tokens":1}}}',
      '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n');
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(anthropicBody), nullSink());
    const close = events.at(-1) as any;
    expect(close.type).toBe('wire.close');
    expect(close.frames).toBeGreaterThan(0);
    expect(close.chunks).toBe(0);
    expect(close.parts).toEqual({});
    expect(close.errorCode).toBe('empty-stream');
  });

  it('emits nothing and changes nothing when nobody subscribes', async () => {
    const turn = await readOpenAIStream(new Response(BODY), nullSink());
    expect(turn.text).toBe(SECRET);
    expect(turn.error).toBeUndefined();
  });
});
