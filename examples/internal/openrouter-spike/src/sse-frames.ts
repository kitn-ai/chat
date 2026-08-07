// SSE frame decoding, split out from the adapter so `model-stream.ts` stays a
// pure chunk consumer with no wire-format knowledge. Also portable into the kit.
//
// Real SSE framing, not `split('\n').startsWith('data:')`:
//   · a frame ends at a BLANK line; multiple `data:` lines join with `\n`
//   · lines starting with `:` are comments (OpenRouter sends
//     `: OPENROUTER PROCESSING` keep-alives) → dropped
//   · `event:` / `id:` / `retry:` fields → ignored
//   · `\r\n` is normalised
//   · the decoder is incremental, so a socket boundary inside a multi-byte
//     codepoint does not corrupt the text

type ByteSource = AsyncIterable<Uint8Array | string> | ReadableStream<Uint8Array>;

/** Adapt a WHATWG ReadableStream to an async iterable. Never rely on
 *  `for await (… of res.body)` — Safari still lacks async iteration on it. */
export async function* readableToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
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

/** Decode an SSE byte stream into JSON payloads of type `T`, stopping at
 *  `[DONE]` and skipping frames that are not JSON. */
export async function* sseJson<T>(source: ByteSource): AsyncGenerator<T> {
  for await (const payload of sseDataFrames(source)) {
    if (payload === '[DONE]') return;
    try {
      yield JSON.parse(payload) as T;
    } catch {
      // a keep-alive or a provider's stray line — ignore rather than throw
    }
  }
}
