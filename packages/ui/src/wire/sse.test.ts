import { describe, expect, it } from 'vitest';
import { readableToAsyncIterable, sseDataFrames, sseJson } from './sse';

const BYTE_SIZES = [1, 3, 17, 64, 4096];

async function* bytes(text: string, size: number): AsyncGenerator<Uint8Array> {
  const buf = new TextEncoder().encode(text);
  for (let i = 0; i < buf.length; i += size) {
    yield buf.subarray(i, Math.min(i + size, buf.length));
    await Promise.resolve();
  }
}

function readable(text: string, size: number): ReadableStream<Uint8Array> {
  const it = bytes(text, size)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('sseDataFrames', () => {
  it('drops keep-alive comment lines', async () => {
    const sse = ': OPENROUTER PROCESSING\n\ndata: one\n\n: ping\n\ndata: two\n\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual(['one', 'two']);
  });

  it('joins multiple data lines in one frame with a newline', async () => {
    const sse = 'data: line one\ndata: line two\n\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual(['line one\nline two']);
  });

  it('ignores event, id and retry fields', async () => {
    const sse = 'event: content_block_delta\nid: 7\nretry: 3000\ndata: payload\n\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual(['payload']);
  });

  it('strips exactly one space after the colon', async () => {
    const sse = 'data:  two spaces\n\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual([' two spaces']);
  });

  it('normalises CRLF', async () => {
    const sse = 'data: one\r\n\r\ndata: two\r\n\r\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual(['one', 'two']);
  });

  it('yields a trailing frame that never got its blank line', async () => {
    expect(await collect(sseDataFrames(bytes('data: tail', 4096)))).toEqual(['tail']);
  });

  it('survives a boundary inside a multi-byte codepoint at every chunk size', async () => {
    const sse = 'data: {"t":"héllo wörld ☔️ 日本語"}\n\ndata: [DONE]\n\n';
    for (const size of BYTE_SIZES) {
      expect(await collect(sseDataFrames(bytes(sse, size)))).toEqual([
        '{"t":"héllo wörld ☔️ 日本語"}',
        '[DONE]',
      ]);
    }
  });

  it('accepts a ReadableStream as well as an AsyncIterable', async () => {
    const sse = 'data: one\n\ndata: two\n\n';
    for (const size of BYTE_SIZES) {
      expect(await collect(sseDataFrames(readable(sse, size)))).toEqual(['one', 'two']);
    }
  });

  it('accepts a source that yields strings', async () => {
    async function* strings(): AsyncGenerator<string> {
      yield 'data: on';
      yield 'e\n\ndata: two\n\n';
    }
    expect(await collect(sseDataFrames(strings()))).toEqual(['one', 'two']);
  });
});

describe('sseJson', () => {
  it('parses each frame and stops at [DONE]', async () => {
    const sse = 'data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\ndata: {"a":3}\n\n';
    expect(await collect(sseJson<{ a: number }>(bytes(sse, 4096)))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('skips a frame that is not JSON instead of throwing', async () => {
    const sse = 'data: not json\n\ndata: {"a":1}\n\n';
    expect(await collect(sseJson<{ a: number }>(bytes(sse, 4096)))).toEqual([{ a: 1 }]);
  });
});

describe('readableToAsyncIterable', () => {
  it('yields every chunk and releases the lock', async () => {
    const stream = readable('abcdef', 2);
    const chunks = await collect(readableToAsyncIterable(stream));
    expect(new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])))).toBe('abcdef');
  });
});
