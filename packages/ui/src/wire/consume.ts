// The adapter core: read neutral chunks, drive a sink, and report the turn.
//
// PORTABILITY RULES: no React, no Solid, no DOM, no fetch, no SSE, and NO
// PROVIDER SDK. The only kit values imported are the three part builders, which
// are REUSED rather than reimplemented so that `ModelTurn.parts` is produced by
// exactly the code that drove the sink.
import type { MessagePart, MessageSource } from '../elements/chat-types';
import { appendReasoningPart, appendTextPart, fingerprint, upsertToolPart } from '../state/parts';
import {
  normalizeStopReason,
  type AssistantStreamSink,
  type ConsumeOptions,
  type ModelStreamChunk,
  type ModelToolCall,
  type ModelToolCallDelta,
  type ModelTurn,
  type ModelUsage,
  type StopReason,
} from './chunk';
import type { RawOrigin } from '../components/tool-types';

// ── Tool-call accumulator ────────────────────────────────────────────────────

interface MutableCall {
  index: number;
  id: string | null;
  name: string;
  argumentsText: string;
  announced: boolean;
  /** Fingerprint of the last `input` written, so a re-parse of unchanged text
   *  does not patch the part again. */
  lastInputFp: string | null;
  providerExecuted: boolean;
  output?: Record<string, unknown>;
  outputError?: string;
}

const snapshot = (c: MutableCall): ModelToolCall => ({
  index: c.index,
  id: c.id ?? `call_${c.index}`,
  name: c.name,
  argumentsText: c.argumentsText,
});

/**
 * The provider-shaped tool-call block, REASSEMBLED from the fragments, kept on
 * the part so an encoder can round-trip without re-deriving it.
 *
 * Tagged `custom.` on purpose: it is a reconstruction, not a payload the
 * provider handed over intact, so it must never be mistaken for one of the
 * verbatim blocks (Anthropic `thinking`) a provider refuses to accept rebuilt.
 */
const rawOf = (c: MutableCall): RawOrigin => ({
  source: 'custom.wire.tool_call',
  payload: { id: c.id ?? `call_${c.index}`, name: c.name, arguments: c.argumentsText },
});

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}

/** Parse accumulated argument text into a JSON OBJECT, or undefined. A prefix of
 *  a JSON object never parses, which is why `rawInput` exists. No tolerant
 *  partial-JSON closer ships: guessing at a half-written object produces
 *  confidently wrong tool inputs. */
function parseArgumentObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  try {
    const value: unknown = JSON.parse(trimmed);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Correlate tool-call fragments by `index` and drive the ToolPart lifecycle.
 * THE HARD PART: `id`, `name` and each slice of `arguments` arrive across
 * arbitrarily many chunks in provider-dependent order.
 *
 * A ToolPart is pushed (`input-streaming`) the first time a call has BOTH an id
 * and a non-empty name: announcing earlier would create a panel whose `type` is
 * the empty string. Everything before that is buffered and flushed at announce.
 */
export function createToolCallAccumulator(sink: AssistantStreamSink, opts: ConsumeOptions = {}) {
  const calls = new Map<number, MutableCall>();

  /** Write the argument text that has arrived so far.
   *
   *  `rawInput` is written on EVERY fragment, so a consumer watching the part
   *  sees the arguments assemble character by character. `input` is written only
   *  when the whole accumulated text parses to a JSON object. Honest caveat:
   *  with plain `JSON.parse` a prefix never parses, so `input` in practice still
   *  lands once, at the end. `rawInput` is what streams. */
  const writeArguments = (call: MutableCall) => {
    const id = call.id!;
    const text = call.argumentsText;
    const parsed = parseArgumentObject(text);
    if (parsed) {
      const fp = fingerprint(parsed);
      if (fp !== call.lastInputFp) {
        call.lastInputFp = fp;
        sink.upsertTool(id, { rawInput: text, input: parsed, state: 'input-available' });
        return;
      }
    }
    sink.upsertTool(id, { rawInput: text });
  };

  const announce = (call: MutableCall) => {
    if (call.announced) return;
    call.id ??= `call_${call.index}`;
    call.announced = true;
    sink.upsertTool(call.id, { type: call.name || 'unknown_tool', state: 'input-streaming' });
    // Fragments that arrived before the id did are flushed now.
    if (call.argumentsText) writeArguments(call);
  };

  const apply = (raw: ModelToolCallDelta) => {
    const index = typeof raw.index === 'number' ? raw.index : 0;
    let call = calls.get(index);
    if (!call) {
      call = {
        index,
        id: null,
        name: '',
        argumentsText: '',
        announced: false,
        lastInputFp: null,
        providerExecuted: false,
      };
      calls.set(index, call);
    }
    if (raw.id && !call.id) call.id = raw.id;
    if (raw.name) call.name += raw.name;
    if (call.id && call.name) announce(call);

    if (typeof raw.arguments === 'string' && raw.arguments !== '') {
      call.argumentsText += raw.arguments;
      if (call.announced) writeArguments(call);
    }

    if (raw.output !== undefined || raw.outputError !== undefined) {
      // A result the PROVIDER executed. Force the announce so the panel exists,
      // then complete it. `settle` must not touch it afterwards.
      announce(call);
      call.providerExecuted = true;
      if (raw.outputError !== undefined) {
        call.outputError = raw.outputError;
        sink.upsertTool(call.id!, { state: 'output-error', errorText: raw.outputError });
      } else {
        call.output = raw.output;
        sink.upsertTool(call.id!, { state: 'output-available', output: raw.output });
      }
    }
  };

  /** Settle every accumulated call once the stream ends. */
  const settle = (stopReason: StopReason | undefined, streamError?: string): ModelToolCall[] =>
    [...calls.values()]
      .sort((a, b) => a.index - b.index)
      .map((call) => {
        announce(call); // a call that only ever had arguments still gets a panel
        const id = call.id!;
        const base = snapshot(call);

        if (call.providerExecuted) {
          // Already at output-available/output-error. Re-settling would overwrite
          // the provider's own result with a parse of its arguments.
          return {
            ...base,
            providerExecuted: true,
            ...(call.output !== undefined ? { output: call.output } : {}),
            ...(call.outputError !== undefined ? { error: call.outputError } : {}),
          };
        }

        // Attached once, at settle: before that `argumentsText` is still growing
        // and a raw snapshot of half a JSON string is worse than none.
        const raw = rawOf(call);
        // `type` is re-sent because a provider may split the tool NAME across
        // fragments; the announce could have fired on a prefix.
        const name = call.name || 'unknown_tool';

        if (streamError) {
          const error = `Stream failed before the tool call completed: ${streamError}`;
          sink.upsertTool(id, {
            type: name,
            state: 'output-error',
            errorText: error,
            rawInput: call.argumentsText,
            raw,
          });
          return { ...base, error };
        }

        if (!call.name) {
          const error = 'Tool call arrived with no function name; cannot dispatch it.';
          sink.upsertTool(id, { state: 'output-error', errorText: error, raw });
          return { ...base, error };
        }

        const rawArgs = call.argumentsText.trim();
        try {
          // An argument-less tool legitimately streams '' or '{}'.
          const parsed: unknown = rawArgs === '' ? {} : JSON.parse(rawArgs);
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('arguments must be a JSON object');
          }
          const input = parsed as Record<string, unknown>;
          sink.upsertTool(id, {
            type: name,
            state: 'input-available',
            input,
            rawInput: call.argumentsText,
            raw,
          });
          const ready: ModelToolCall = { ...base, input };
          opts.onToolCallReady?.(ready);
          return ready;
        } catch (e) {
          const truncated =
            stopReason === 'length' ? ' (the stream hit the token limit mid-call)' : '';
          const error =
            `Malformed tool arguments${truncated}: ${(e as Error).message}. ` +
            `Received ${rawArgs.length} chars: ${clip(rawArgs, 160)}`;
          sink.upsertTool(id, {
            type: name,
            state: 'output-error',
            errorText: error,
            rawInput: call.argumentsText,
            raw,
          });
          return { ...base, error };
        }
      });

  return { apply, settle };
}

// ── Part recording and sink tee ──────────────────────────────────────────────

/** A sink that writes nowhere but into a `MessagePart[]`, using the kit's own
 *  builders. Teed alongside the real sink so `ModelTurn.parts` cannot drift from
 *  what the message actually received. */
function createPartsRecorder(): AssistantStreamSink & { parts(): MessagePart[] } {
  let parts: MessagePart[] = [];
  return {
    appendText(delta) {
      parts = appendTextPart(parts, delta);
    },
    appendReasoning(delta, opts) {
      // `streamId` is DROPPED here on purpose. It namespaces block indices for a
      // sink that outlives one stream; this recorder starts a fresh array per
      // call, so within `ModelTurn.parts` there is nothing to disambiguate. Worse,
      // it is a new value on every call, so keeping it would make `parts`
      // non-reproducible for identical input and break the determinism the
      // adapter guarantees (same chunks in, same parts out, whatever the byte
      // boundaries). The host's own sink still receives it.
      parts = appendReasoningPart(parts, delta, { ...opts, streamId: undefined });
    },
    upsertTool(toolCallId, patch) {
      parts = upsertToolPart(parts, toolCallId, patch);
    },
    addSource(source) {
      parts = [...parts, { type: 'source', source }];
    },
    parts: () => parts,
  };
}

/** Drive two sinks from one call. `a` (the host's) goes first so the visible
 *  message updates in stream order. */
function teeSink(a: AssistantStreamSink, b: AssistantStreamSink): AssistantStreamSink {
  return {
    appendText(delta) {
      a.appendText(delta);
      b.appendText(delta);
    },
    appendReasoning(delta, opts) {
      a.appendReasoning(delta, opts);
      b.appendReasoning(delta, opts);
    },
    upsertTool(toolCallId, patch) {
      a.upsertTool(toolCallId, patch);
      b.upsertTool(toolCallId, patch);
    },
    addSource(source) {
      a.addSource?.(source);
      b.addSource?.(source);
    },
  };
}

// ── The main loop ────────────────────────────────────────────────────────────

/** One id per `consumeModelStream` call, i.e. per provider response stream.
 *
 *  It namespaces reasoning block indices. Anthropic restarts content-block
 *  indices at 0 on every message, and a tool loop reads several messages into ONE
 *  assistant turn, so without this round 2's block 0 merges into round 1's part
 *  and overwrites its verbatim `raw`. See `appendReasoningPart`.
 *
 *  A monotonic counter, not a UUID: this never leaves the process, is compared
 *  only for equality against parts built in the same process, and a counter keeps
 *  the value short and reproducible in test output. */
let streamSeq = 0;
const nextStreamId = (): string => `wire-${++streamSeq}`;

/**
 * Read one turn's worth of `ModelStreamChunk`s and drive `sink` with them.
 *
 * The sink is expected to be the kit's `AssistantStream`, which produces a NEW
 * message object (and a new `parts` array) on every real mutation: that is what
 * makes `<kai-thread>` re-render. This adapter calls the sink once per delta and
 * never batches; batching is a host concern.
 *
 * This is also the escape hatch for a consumer who already has neutral chunks
 * from somewhere else and does not need a WireFormat at all.
 */
export async function consumeModelStream(
  chunks: AsyncIterable<ModelStreamChunk>,
  sink: AssistantStreamSink,
  opts: ConsumeOptions = {},
): Promise<ModelTurn> {
  const label = opts.reasoningLabel ?? 'Thinking';
  const streamId = nextStreamId();
  const recorder = createPartsRecorder();
  const out = teeSink(sink, recorder);
  const tools = createToolCallAccumulator(out, opts);

  let text = '';
  let reasoning = '';
  let reasoningChunks = 0;
  let chunkCount = 0;
  let finishReason: string | null = null;
  let error: ModelTurn['error'];
  let usage: ModelUsage | undefined;
  const sources: MessageSource[] = [];

  for await (const chunk of chunks) {
    chunkCount++;

    if (chunk.usage) usage = { ...usage, ...chunk.usage };

    if (chunk.error) {
      error = chunk.error;
      if (chunk.finishReason) finishReason = chunk.finishReason;
      break;
    }

    if (chunk.text) {
      text += chunk.text;
      out.appendText(chunk.text);
    }

    // REWORK 1. The spike gated this whole branch on `if (chunk.reasoning)`,
    // which is falsy for ''. That dropped exactly the payloads `raw` exists to
    // preserve: an Anthropic redacted_thinking block (opaque, no readable text,
    // and the docs require sending it back "including any blocks with empty
    // thinking fields") and the assembled block emitted at content_block_stop
    // after signature_delta. Both arrive with no text.
    if (
      chunk.reasoning !== undefined ||
      chunk.reasoningRaw !== undefined ||
      chunk.reasoningSignature !== undefined
    ) {
      const delta = chunk.reasoning ?? '';
      reasoning += delta;
      // Only NON-EMPTY text counts as "reasoning streamed".
      if (delta !== '') reasoningChunks++;
      // `raw` and `signature` are spread in only when present: passing undefined
      // would blank a value an earlier delta already established.
      out.appendReasoning(delta, {
        index: chunk.reasoningIndex ?? 0,
        // Namespaces the index to THIS stream, so a later round reading into the
        // same sink opens its own part instead of overwriting this one's `raw`.
        streamId,
        label,
        ...(chunk.reasoningRaw ? { raw: chunk.reasoningRaw } : {}),
        ...(chunk.reasoningSignature ? { signature: chunk.reasoningSignature } : {}),
      });
    }

    if (chunk.toolCalls) for (const tc of chunk.toolCalls) tools.apply(tc);

    if (chunk.sources) {
      for (const source of chunk.sources) {
        sources.push(source);
        out.addSource?.(source);
      }
    }

    if (chunk.finishReason) finishReason = chunk.finishReason;
  }

  // REWORK 3. `finishReason` is reported verbatim; `stopReason` is what the
  // adapter itself branches on, so no OpenAI literal leaks into adapter logic.
  const stopReason = normalizeStopReason(finishReason) ?? (error ? 'error' : undefined);
  const toolCalls = tools.settle(stopReason, error?.message);

  return {
    parts: recorder.parts(),
    text,
    reasoning,
    toolCalls,
    sources,
    finishReason,
    reasoningChunks,
    chunks: chunkCount,
    ...(stopReason ? { stopReason } : {}),
    ...(error ? { error } : {}),
    ...(usage ? { usage } : {}),
  };
}
