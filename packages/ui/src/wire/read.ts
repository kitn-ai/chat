// The transport seam. The kit PARSES the stream; the consumer OWNS the
// transport. Auth, proxies, retries, aborts and rate limits are app decisions,
// so `StreamSource` is the entire surface: hand over a Response, a
// ReadableStream, or any async iterable of bytes or strings.
//
// Deliberately absent: retries, reconnect, Last-Event-ID, backoff, an
// AbortSignal parameter (abort the fetch), a URL-taking client, and key
// handling. Untested retry logic is worse than none.
//
// SSR: nothing here references Response or ReadableStream at module scope. A
// Response is detected by duck-typing, not `instanceof`, so this module imports
// cleanly in a runtime where the global does not exist.
import { sseJson, type ByteSource } from './sse';
import { consumeModelStream } from './consume';
import type {
  AssistantStreamSink,
  ConsumeOptions,
  ModelStreamChunk,
  ModelTurn,
  WireFormat,
} from './chunk';
import { openaiChatFormat } from './formats/openai';
import { anthropicMessagesFormat } from './formats/anthropic';
import { emitWireDiagnostic, nextStreamId, wireDiagnosticsActive } from './diagnostics';

/** Byte length, not `String.length`: a multibyte frame is bigger than its
 *  character count and the number is meant to be comparable with what the socket
 *  carried.
 *
 *  Built on first use and cached, never at module scope -- the same rule
 *  `sseJson` follows for its TextDecoder, so this module keeps importing cleanly
 *  in a runtime that lacks the global. Only ever reached from inside an
 *  active-diagnostics branch. */
let encoder: TextEncoder | undefined;

function byteLength(raw: string): number {
  encoder ??= new TextEncoder();
  return encoder.encode(raw).length;
}

/** What the caller handed over, for `wire.open`. Duck-typed on the same terms as
 *  `isResponse`, because none of these globals is guaranteed to exist. */
function sourceKind(source: StreamSource): 'response' | 'stream' | 'iterable' {
  if (isResponse(source)) return 'response';
  return typeof (source as ReadableStream<Uint8Array>).getReader === 'function'
    ? 'stream'
    : 'iterable';
}

export type StreamSource =
  | Response
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array | string>;

export interface ReadOptions extends ConsumeOptions {
  format: WireFormat;
}

/** A non-ok HTTP response from the model endpoint, with the provider's own error
 *  body attached when there is one. Thrown before a single chunk is read, so a
 *  caller can distinguish "the request failed" from "the stream carried an
 *  error", which is `ModelTurn.error`. */
export class WireError extends Error {
  readonly status: number;
  readonly statusText: string;
  /** The response body parsed as JSON, or undefined when it was not JSON (an
   *  HTML error page from a proxy, most often). */
  readonly body: unknown;
  /** The raw response body, always. */
  readonly bodyText: string;

  constructor(status: number, statusText: string, bodyText: string, body: unknown) {
    super(buildMessage(status, statusText, bodyText, body));
    // Restores the prototype chain when this class is DOWNLEVELLED to ES5 by a
    // consumer's build. Without it `err instanceof WireError` is false there,
    // and the documented way to tell a transport failure from an in-band error
    // stops working. A no-op in the shipped ES2020+ output.
    Object.setPrototypeOf(this, WireError.prototype);
    this.name = 'WireError';
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
    this.body = body;
  }
}

function providerMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  const top = (body as { message?: unknown }).message;
  return typeof top === 'string' ? top : undefined;
}

function buildMessage(status: number, statusText: string, bodyText: string, body: unknown): string {
  const head = `Model request failed: HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
  const provider = providerMessage(body);
  if (provider) return `${head}: ${provider}`;
  const snippet = bodyText.trim().slice(0, 200);
  return snippet ? `${head}: ${snippet}` : head;
}

/** Duck-typed, because `Response` may not be a global in every runtime the kit
 *  is imported into. A ReadableStream has no `ok`, and an async iterable that
 *  happens to have all three of these is not a shape any transport produces. */
function isResponse(source: StreamSource): source is Response {
  return (
    typeof source === 'object' &&
    source !== null &&
    'ok' in source &&
    'status' in source &&
    'body' in source
  );
}

async function wireErrorFrom(res: Response): Promise<WireError> {
  const bodyText = await res.text().catch(() => '');
  let body: unknown;
  try {
    body = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    body = undefined; // an HTML error page, or anything else non-JSON
  }
  return new WireError(res.status, res.statusText, bodyText, body);
}

async function toByteSource(source: StreamSource): Promise<ByteSource> {
  if (!isResponse(source)) return source;
  if (!source.ok) throw await wireErrorFrom(source);
  if (!source.body) {
    throw new Error(
      'The model response has no body to stream. Check that the request set stream: true and that nothing between you and the provider buffered it.',
    );
  }
  return source.body;
}

/** Read one turn off the wire in `opts.format` and drive `sink` with it. */
export async function readModelStream(
  source: StreamSource,
  sink: AssistantStreamSink,
  opts: ReadOptions,
): Promise<ModelTurn> {
  // FIRST, before the source is even resolved: a failure inside `toByteSource`
  // still needs an id to report itself under.
  const streamId = opts.streamId ?? nextStreamId();
  const bytes = await toByteSource(source);
  if (wireDiagnosticsActive()) {
    emitWireDiagnostic({
      type: 'wire.open',
      t: Date.now(),
      streamId,
      format: opts.format.id,
      source: sourceKind(source),
    });
  }
  // Opened ONCE per stream, which is the whole point of the open()/push() shape:
  // a stateful format (Anthropic) gets a fresh block map per call.
  const reader = opts.format.open();

  let frames = 0;
  // The byte length of the frame currently being handed over. `onRawFrame` fires
  // immediately before `sseJson` yields, so this is always the frame the next
  // loop iteration is about to push.
  let frameBytes = 0;
  const onRawFrame = wireDiagnosticsActive()
    ? (raw: string) => {
        frameBytes = byteLength(raw);
      }
    : undefined;

  async function* chunks(): AsyncGenerator<ModelStreamChunk> {
    for await (const frame of sseJson<unknown>(bytes, onRawFrame)) {
      frames++;
      const produced = reader.push(frame);
      // Gated BEFORE the event object exists, and before the keys are walked.
      if (wireDiagnosticsActive()) {
        const fields = new Set<string>();
        let model: string | undefined;
        for (const chunk of produced) {
          for (const key of Object.keys(chunk)) fields.add(key);
          if (chunk.model) model = chunk.model;
        }
        emitWireDiagnostic({
          type: 'wire.frame',
          t: Date.now(),
          streamId,
          seq: frames,
          bytes: frameBytes,
          chunks: produced.length,
          fields: [...fields],
          ...(model ? { model } : {}),
        });
      }
      for (const chunk of produced) yield chunk;
    }
  }
  // `_frames` is INTERNAL and deliberately not on `ConsumeOptions`: it is read
  // once, at the close event, and a public option would invite a caller to
  // supply one. A direct `consumeModelStream` caller passes nothing and its
  // `wire.close` correctly omits `frames` -- there were none.
  return consumeModelStream(chunks(), sink, {
    ...opts,
    streamId,
    _frames: () => frames,
  } as ConsumeOptions);
}

/** OpenAI chat-completions SSE. Also what all nine catalog integrations except
 *  `mock` re-frame to server-side, so this is the common path. */
export function readOpenAIStream(
  source: StreamSource,
  sink: AssistantStreamSink,
  opts: ConsumeOptions = {},
): Promise<ModelTurn> {
  return readModelStream(source, sink, { ...opts, format: openaiChatFormat });
}

/** Anthropic Messages SSE. */
export function readAnthropicStream(
  source: StreamSource,
  sink: AssistantStreamSink,
  opts: ConsumeOptions = {},
): Promise<ModelTurn> {
  return readModelStream(source, sink, { ...opts, format: anthropicMessagesFormat });
}
