import { describe, expect, it } from 'vitest';
import { WireError, readAnthropicStream, readModelStream, readOpenAIStream } from './read';
import { openaiChatFormat } from './formats/openai';
import type { AssistantStreamSink } from './chunk';

const nullSink = (): AssistantStreamSink => ({
  appendText: () => undefined,
  appendReasoning: () => undefined,
  upsertTool: () => undefined,
  addSource: () => undefined,
});

async function* bytes(text: string, size = 17): AsyncGenerator<Uint8Array> {
  const buf = new TextEncoder().encode(text);
  for (let i = 0; i < buf.length; i += size) {
    yield buf.subarray(i, Math.min(i + size, buf.length));
    await Promise.resolve();
  }
}

function readable(text: string, size = 17): ReadableStream<Uint8Array> {
  const it = bytes(text, size)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}

const OPENAI_SSE =
  ': OPENROUTER PROCESSING\n\n' +
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

const ANTHROPIC_SSE =
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}\n\n' +
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n' +
  'event: message_stop\ndata: {"type":"message_stop"}\n\n';

describe('readOpenAIStream', () => {
  it('reads an AsyncIterable of bytes', async () => {
    const turn = await readOpenAIStream(bytes(OPENAI_SSE), nullSink());
    expect(turn.text).toBe('Hello world');
    expect(turn.finishReason).toBe('stop');
    expect(turn.stopReason).toBe('stop');
  });

  it('reads a ReadableStream', async () => {
    const turn = await readOpenAIStream(readable(OPENAI_SSE), nullSink());
    expect(turn.text).toBe('Hello world');
  });

  it('reads an ok Response by taking its body', async () => {
    const res = new Response(readable(OPENAI_SSE), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const turn = await readOpenAIStream(res, nullSink());
    expect(turn.text).toBe('Hello world');
  });
});

describe('readAnthropicStream', () => {
  it('reads Anthropic events and ignores the event: lines', async () => {
    const turn = await readAnthropicStream(bytes(ANTHROPIC_SSE), nullSink());
    expect(turn.text).toBe('Hi');
    expect(turn.finishReason).toBe('end_turn');
    expect(turn.stopReason).toBe('stop');
    expect(turn.usage).toEqual({ inputTokens: 9, outputTokens: 2 });
  });
});

describe('readModelStream', () => {
  it('takes an explicit format', async () => {
    const turn = await readModelStream(bytes(OPENAI_SSE), nullSink(), { format: openaiChatFormat });
    expect(turn.text).toBe('Hello world');
  });

  it('opens the format ONCE per stream', async () => {
    let opens = 0;
    const counting = {
      id: 'test.counting',
      open() {
        opens++;
        return { push: () => [] };
      },
    };
    await readModelStream(bytes(OPENAI_SSE), nullSink(), { format: counting });
    expect(opens).toBe(1);
  });

  it('forwards ConsumeOptions through to the adapter', async () => {
    const sse = 'data: {"choices":[{"delta":{"reasoning":"hm"}}]}\n\ndata: [DONE]\n\n';
    const seen: string[] = [];
    await readModelStream(
      bytes(sse),
      {
        appendText: () => undefined,
        appendReasoning: (_d, o) => seen.push(o?.label ?? ''),
        upsertTool: () => undefined,
      },
      { format: openaiChatFormat, reasoningLabel: 'Reasoning' },
    );
    expect(seen).toEqual(['Reasoning']);
  });
});

describe('WireError', () => {
  it('carries status, statusText and a PARSED JSON error body', async () => {
    const res = new Response(
      JSON.stringify({ error: { message: 'Insufficient credits', code: 402 } }),
      { status: 402, statusText: 'Payment Required' },
    );
    const err = await readOpenAIStream(res, nullSink()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WireError);
    const wire = err as WireError;
    expect(wire.name).toBe('WireError');
    expect(wire.status).toBe(402);
    expect(wire.statusText).toBe('Payment Required');
    expect(wire.message).toContain('402');
    expect(wire.message).toContain('Insufficient credits');
    expect(wire.body).toEqual({ error: { message: 'Insufficient credits', code: 402 } });
  });

  it('carries an HTML 4xx body as text with no parsed body', async () => {
    const html = '<html><head><title>404 Not Found</title></head><body>nginx</body></html>';
    const res = new Response(html, { status: 404, statusText: 'Not Found' });
    const err = (await readOpenAIStream(res, nullSink()).catch((e: unknown) => e)) as WireError;
    expect(err).toBeInstanceOf(WireError);
    expect(err.status).toBe(404);
    expect(err.body).toBeUndefined();
    expect(err.bodyText).toContain('<html');
    // The message shows a snippet so a proxy misconfiguration is diagnosable.
    expect(err.message).toContain('404');
    expect(err.message).toContain('<html');
  });

  it('throws a plain Error when an ok Response has no body', async () => {
    const res = new Response(null, { status: 200 });
    const err = (await readOpenAIStream(res, nullSink()).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WireError);
    expect(err.message).toContain('no body');
  });

  it('does NOT throw for an in-band error after a 200', async () => {
    // An error frame inside a 200 stream is data, not an HTTP failure. It lands
    // on the turn so partial text and tool panels survive.
    const sse =
      'data: {"choices":[{"delta":{"content":"Chec"}}]}\n\n' +
      'data: {"error":{"code":"server_error","message":"upstream dropped"}}\n\n';
    const turn = await readOpenAIStream(new Response(readable(sse)), nullSink());
    expect(turn.error?.message).toBe('upstream dropped');
    expect(turn.text).toBe('Chec');
  });
});
