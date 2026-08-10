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

/** A ReadableStream that behaves like a real network body: nothing is produced
 *  until somebody reads, and the close arrives on the read AFTER the last byte.
 *
 *  `highWaterMark: 0` is the whole point. With the default strategy the source
 *  is pre-pulled, so a short fixture is fully enqueued AND closed before the
 *  consumer has finished parsing it — and `reader.cancel()` on an
 *  already-closed stream is a spec no-op that never reaches the underlying
 *  `cancel()`. A test built on the default strategy therefore reports
 *  "not cancelled" no matter what the adapter does. This one cannot. */
function networkStream(text: string, size = 8) {
  const buf = new TextEncoder().encode(text);
  let i = 0;
  const state = { cancelled: false, closed: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (i >= buf.length) {
          state.closed = true;
          controller.close();
          return;
        }
        controller.enqueue(buf.subarray(i, Math.min(i + size, buf.length)));
        i += size;
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

// `data: [DONE]` is how EVERY OpenAI-format stream ends, so cancelling there
// aborts the response body on the normal completion path — one
// `net::ERR_ABORTED` in the console per turn. Cancelling on a genuine early
// exit is still required: `releaseLock()` alone leaves the body open.
describe('cancellation: clean drain vs early exit', () => {
  const DONE_SSE = 'data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n';

  it('does NOT cancel a [DONE]-terminated stream', async () => {
    const { stream, state } = networkStream(DONE_SSE);

    expect(await collect(sseJson<{ a: number }>(stream))).toEqual([{ a: 1 }, { a: 2 }]);
    expect(state.cancelled).toBe(false);
    // The producer's own close is what ended it — proof the source was read to
    // EOF rather than merely abandoned at the sentinel.
    expect(state.closed).toBe(true);
  });

  it('DOES cancel when the consumer breaks mid-stream', async () => {
    const { stream, state } = networkStream(DONE_SSE);

    for await (const frame of sseJson<{ a: number }>(stream)) {
      expect(frame).toEqual({ a: 1 });
      break;
    }

    expect(state.cancelled).toBe(true);
    expect(state.closed).toBe(false); // abandoned mid-stream, not drained
  });

  it('DOES cancel when the consumer throws mid-stream', async () => {
    const { stream, state } = networkStream(DONE_SSE);

    await expect(
      (async () => {
        for await (const _frame of sseJson(stream)) throw new Error('consumer exploded');
      })(),
    ).rejects.toThrow('consumer exploded');

    expect(state.cancelled).toBe(true);
  });

  it('DOES cancel a stream the producer never finishes', async () => {
    // No [DONE], no close: the frames just stop. Breaking out has to close the
    // connection or the socket leaks.
    const { stream, state } = networkStream('data: {"a":1}\n\ndata: {"a":2}\n\n');

    for await (const _frame of sseDataFrames(stream)) break;

    expect(state.cancelled).toBe(true);
  });
});
