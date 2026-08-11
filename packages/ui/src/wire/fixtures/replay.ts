// Byte-level replay for captured fixtures.
//
// The chunk sizes are not arbitrary. 1 puts a boundary between every byte, which
// is the only reliable way to catch a decoder that assumes a frame arrives whole
// or that a multi-byte codepoint is not split. 3 and 17 are coprime with typical
// frame lengths so boundaries land mid-key and mid-value. 64 is a realistic
// small socket read. 4096 delivers most fixtures in one go, which is the case
// that hides every bug the others find.
import type { AssistantStreamSink } from '../chunk';

export const BYTE_SIZES: readonly number[] = [1, 3, 17, 64, 4096];

/** UTF-8 bytes of `sse` in chunks of `size`, with a microtask between them so
 *  the consumer really does suspend, like a socket. */
export async function* replayBytes(sse: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(sse);
  for (let i = 0; i < bytes.length; i += size) {
    yield bytes.subarray(i, Math.min(i + size, bytes.length));
    await Promise.resolve();
  }
}

/** The same bytes as a WHATWG ReadableStream, for the `res.body` code path. */
export function replayReadable(sse: string, size: number): ReadableStream<Uint8Array> {
  const iterator = replayBytes(sse, size)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}

/** A sink that discards everything. Tests read `ModelTurn.parts`, which the
 *  adapter records through its own tee, so discarding here loses nothing. */
export function nullSink(): AssistantStreamSink {
  return {
    appendText: () => undefined,
    appendReasoning: () => undefined,
    upsertTool: () => undefined,
    addSource: () => undefined,
  };
}

/** A sink that records an ordered, printable log of every call, for asserting
 *  the ORDER the host sink was driven in. */
export function recordingSink(): AssistantStreamSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    appendText: (delta) => calls.push(`text:${delta}`),
    appendReasoning: (delta, opts) => calls.push(`reasoning:${opts?.index ?? 0}:${delta}`),
    upsertTool: (id, patch) => calls.push(`tool:${id}:${patch.state ?? '-'}`),
    addSource: (source) => calls.push(`source:${source.url ?? ''}`),
  };
}
