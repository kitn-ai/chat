// SSE frame decoding, kept separate from the adapter so `consume.ts` stays a pure
// chunk consumer with no wire-format knowledge.
//
// Real SSE framing, not `split('\n').filter(startsWith('data:'))`:
//   - a frame ends at a BLANK line; multiple `data:` lines join with '\n'
//   - lines starting with ':' are comments (OpenRouter sends
//     `: OPENROUTER PROCESSING` keep-alives) and are dropped
//   - `event:` / `id:` / `retry:` fields are ignored. Anthropic's `event:` lines
//     are redundant: the same discriminator is inside the JSON as `type`.
//   - '\r\n' is normalised
//   - the decoder is incremental, so a socket boundary inside a multi-byte
//     codepoint does not corrupt the text
//
// SSR: TextDecoder is constructed inside the generator, never at module scope,
// and a ReadableStream is detected by duck-typing `getReader` rather than by
// `instanceof`, so this module imports cleanly where neither global exists.

export type ByteSource = AsyncIterable<Uint8Array | string> | ReadableStream<Uint8Array>;

/** Adapt a WHATWG ReadableStream to an async iterable. Never rely on
 *  `for await (... of res.body)`: Safari still lacks async iteration on it.
 *
 *  On EARLY EXIT the underlying stream is CANCELLED, not just unlocked.
 *  `releaseLock()` alone hands the reader back while the body stays open, which
 *  leaks the socket. The adapter stops reading mid-stream on a real and
 *  not-rare path (an in-band provider error after a 200), and every consumer
 *  `break`/`throw` inside `for await` lands here too, so this is where the
 *  connection has to be closed.
 *
 *  What must NOT land here is normal completion. `drained` is only honest if
 *  every layer above reads to EOF rather than returning on a sentinel — see
 *  `sseJson` and `[DONE]`. */
export async function* readableToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  let drained = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        drained = true;
        return;
      }
      if (value) yield value;
    }
  } finally {
    // Only when the producer did NOT finish on its own. Cancelling a stream
    // that already reported done is a no-op, but skipping it keeps the normal
    // path free of an extra await.
    if (!drained) {
      // A cancel can reject if the stream already errored; that is not a new
      // failure and must not mask whatever ended the iteration.
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

function asAsyncIterable(source: ByteSource): AsyncIterable<Uint8Array | string> {
  return typeof (source as ReadableStream<Uint8Array>).getReader === 'function'
    ? readableToAsyncIterable(source as ReadableStream<Uint8Array>)
    : (source as AsyncIterable<Uint8Array | string>);
}

/** Yield the payload of each SSE `data:` frame. `[DONE]` is yielded as-is; the
 *  caller decides to stop. */
export async function* sseDataFrames(source: ByteSource): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];

  const take = (): string | undefined => {
    if (dataLines.length === 0) return undefined;
    const payload = dataLines.join('\n');
    dataLines = [];
    return payload;
  };

  const consumeLine = (raw: string): 'boundary' | 'skip' => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') return 'boundary';
    if (line.startsWith(':')) return 'skip'; // keep-alive comment
    if (line.startsWith('data:')) {
      // One optional space after the colon is framing, not data.
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    return 'skip';
  };

  for await (const chunk of asAsyncIterable(source)) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const raw = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (consumeLine(raw) === 'boundary') {
        const payload = take();
        if (payload !== undefined) yield payload;
      }
      nl = buffer.indexOf('\n');
    }
  }

  buffer += decoder.decode(); // flush any trailing multi-byte remainder
  if (buffer) consumeLine(buffer);
  const tail = take();
  if (tail !== undefined) yield tail;
}

/** Decode an SSE byte stream into JSON payloads, stopping at `[DONE]` and
 *  skipping frames that are not JSON. A provider that emits a stray non-JSON
 *  line should not take the turn down.
 *
 *  `[DONE]` stops the YIELDING, not the READING. Returning at the sentinel
 *  unwinds the generator chain while the reader has not yet seen `done: true`,
 *  so `readableToAsyncIterable` treats normal completion as an early exit and
 *  CANCELS the body — and since every OpenAI-format stream ends in `[DONE]`,
 *  that aborts the response on the normal path, one `net::ERR_ABORTED` per
 *  turn. Reading on to EOF instead lets the producer's own close end the
 *  iteration, which is the only thing that makes `drained` mean what it says.
 *  In practice that costs exactly one more `read()`: a server that has sent
 *  `[DONE]` has finished the response body. Frames after the sentinel are
 *  dropped, so what a caller sees is unchanged.
 *
 *  `onRawFrame` is the diagnostics seam: it receives the raw `data:` payload
 *  STRING for each frame that parsed, immediately before that frame is yielded,
 *  because the payload is discarded here and its byte length cannot be recovered
 *  downstream. It is not called for `[DONE]`, for a keep-alive, or for a payload
 *  that failed to parse -- so a caller counting calls counts exactly the frames
 *  it will be handed. Default undefined: with no diagnostics subscriber nothing
 *  passes one in and this is a dead branch. */
export async function* sseJson<T>(
  source: ByteSource,
  onRawFrame?: (raw: string) => void,
): AsyncGenerator<T> {
  let done = false;
  for await (const payload of sseDataFrames(source)) {
    if (done) continue; // drain the rest of the body; yield nothing more
    if (payload === '[DONE]') {
      done = true;
      continue;
    }
    try {
      const frame = JSON.parse(payload) as T;
      onRawFrame?.(payload);
      yield frame;
    } catch {
      // a keep-alive or a provider's stray line: ignore rather than throw
    }
  }
}
