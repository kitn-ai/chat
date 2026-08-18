import { afterEach, describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { subscribeWireDiagnostics, type KaiDiagnosticEvent, type WireDiagnosticEvent } from './diagnostics';

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
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(BODY), nullSink());
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('wire.open');
    expect(types.at(-1)).toBe('wire.close');
    expect(types).toContain('wire.frame');
    expect(types).toContain('wire.part');
    // `streamId` belongs to the wire events only — the element events now share
    // this channel and are not stream-scoped. Everything this test provokes
    // comes from one stream read, so that is asserted rather than assumed.
    const wire = events.filter((e): e is WireDiagnosticEvent => e.type.startsWith('wire.'));
    expect(wire).toHaveLength(events.length);
    const ids = new Set(wire.map((e) => e.streamId));
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

  it('close.parts counts DISTINCT parts, while wire.part stays per-delta', async () => {
    // Three text deltas merge into ONE text part. The panel renders `parts` as
    // "N parts", so counting writes there would lie; per-delta granularity is
    // already carried by the individual wire.part events, which must not change.
    const body = [
      'data: {"choices":[{"index":0,"delta":{"content":"one "},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"index":0,"delta":{"content":"two "},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"index":0,"delta":{"content":"three"},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n');
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    const turn = await readOpenAIStream(new Response(body), nullSink());

    expect(turn.parts).toHaveLength(1);
    const close = events.at(-1) as any;
    expect(close.parts).toEqual({ text: 1 });

    const textParts = events.filter((e) => e.type === 'wire.part' && (e as any).variant === 'text');
    expect(textParts).toHaveLength(3);
    expect((textParts as any[]).map((p) => p.chars)).toEqual([4, 4, 5]);
  });

  it('the metadata boundary holds: no event carries the message text', async () => {
    const events: KaiDiagnosticEvent[] = [];
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
    const events: KaiDiagnosticEvent[] = [];
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

  it('a subscriber attaching mid-read still gets real bytes, not a confident zero', async () => {
    // Deciding whether to capture the raw frame ONCE, at read entry, left every
    // later frame reporting `bytes: 0` to anyone who subscribed after the read
    // began -- a confident zero, which is exactly what the forward-compat rule
    // exists to prevent. The capture is now always installed; only the length
    // computation is gated.
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    const enc = new TextEncoder();
    const settle = () => new Promise((r) => setTimeout(r, 0));

    const reading = readOpenAIStream(stream, nullSink());
    controller.enqueue(
      enc.encode(
        'data: {"choices":[{"index":0,"delta":{"content":"first"},"finish_reason":null}]}\n\n',
      ),
    );
    await settle();

    // Only now does anyone start listening.
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    controller.enqueue(
      enc.encode(
        'data: {"choices":[{"index":0,"delta":{"content":"second"},"finish_reason":"stop"}]}\n\n',
      ),
    );
    await settle();
    controller.enqueue(enc.encode('data: [DONE]\n\n'));
    controller.close();
    await reading;

    const frames = events.filter((e) => e.type === 'wire.frame') as any[];
    expect(frames).toHaveLength(1); // frame 1 happened before anyone listened
    expect(frames[0].seq).toBe(2);
    expect(frames[0].bytes).toBeGreaterThan(0);
  });

  it('wire.failed carries status/bodyBytes/bodyIsJson/providerCode, never the body text', async () => {
    const body = JSON.stringify({
      error: { code: 'invalid_api_key', message: 'sk-live-... is not valid' },
    });
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await expect(
      readOpenAIStream(new Response(body, { status: 401, statusText: 'Unauthorized' }), nullSink()),
    ).rejects.toMatchObject({ status: 401 }); // WireError still thrown, unchanged
    const failed = events.find((e) => e.type === 'wire.failed') as any;
    expect(failed).toMatchObject({
      status: 401,
      statusText: 'Unauthorized',
      bodyIsJson: true,
      providerCode: 'invalid_api_key',
    });
    expect(failed.bodyBytes).toBe(new TextEncoder().encode(body).length);
    expect(failed.streamId).toMatch(/^wire-\d+$/);
    expect(JSON.stringify(failed)).not.toContain('sk-live');
  });

  it('wire.failed on a non-JSON body reports bodyIsJson false and no providerCode', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await expect(
      readOpenAIStream(
        new Response('<html>502 from the proxy</html>', { status: 502, statusText: 'Bad Gateway' }),
        nullSink(),
      ),
    ).rejects.toMatchObject({ status: 502 });
    const failed = events.find((e) => e.type === 'wire.failed') as any;
    expect(failed).toMatchObject({ status: 502, bodyIsJson: false });
    expect(failed.providerCode).toBeUndefined();
  });
});
