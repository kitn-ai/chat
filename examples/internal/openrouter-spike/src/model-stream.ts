// ─────────────────────────────────────────────────────────────────────────────
// model-stream.ts: THE PORTABLE ADAPTER. The point of the spike.
//
// The kit ships `createAssistantStream` (a fluent builder over one in-flight
// assistant message) but nothing that FEEDS it from a model. This is that piece.
//
// PORTABILITY RULES (this file is the candidate for `@kitn.ai/ui/state`):
//   · no React, no Solid, no DOM, no fetch, no SSE
//   · NO PROVIDER SDK. The input is `ModelStreamChunk`: our own minimal
//     structural shape. Mapping a provider's chunks onto it is somebody else's
//     job (here: server/sdk-bridge.ts). The kit must never depend on
//     @openrouter/sdk, the OpenAI SDK, or an SSE wire format.
//   · the only kit values imported are the three part builders
//     (`appendTextPart` / `appendReasoningPart` / `upsertToolPart`); everything
//     else is a type and is erased at build time. Inside the kit those imports
//     collapse to `./parts` and `../components/tool-types` and nothing else
//     changes. They are REUSED rather than reimplemented so that `ModelTurn.parts`
//     is produced by exactly the code that drove the sink.
// ─────────────────────────────────────────────────────────────────────────────

import type { MessagePart, RawOrigin, ToolPart } from '@kitn.ai/ui';
import {
  appendReasoningPart,
  appendTextPart,
  upsertToolPart,
  type ReasoningOpts,
} from '@kitn.ai/ui/state';

// ── The provider-neutral chunk shape ─────────────────────────────────────────

/** One fragment of a tool call. `index` is the ONLY thing guaranteed to
 *  correlate fragments: `id`, `name` and `arguments` each arrive whenever the
 *  provider feels like it, and `arguments` is partial JSON. */
export interface ModelToolCallDelta {
  index: number;
  id?: string;
  /** Usually whole on the first fragment; a few providers split it. */
  name?: string;
  /** A FRAGMENT of the JSON arguments string, not valid JSON on its own. */
  arguments?: string;
}

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Non-zero proves the model reasoned even when no reasoning text streamed. */
  reasoningTokens?: number;
  costUsd?: number;
}

/**
 * Everything the kit needs out of one streaming chunk, and nothing else. Every
 * field is optional: a chunk may carry text, reasoning, tool fragments, a finish
 * reason, usage, an error, or any combination.
 */
export interface ModelStreamChunk {
  text?: string;
  reasoning?: string;
  /**
   * The UNTRANSLATED provider payload the `reasoning` delta was normalized from.
   *
   * Round-trip critical, which is why it gets its own field: Anthropic returns a
   * 400 if a `thinking` block is modified, reordered or RECONSTRUCTED, so an
   * encoder has to echo the original block back verbatim rather than rebuild one
   * out of `text` + `signature`. A bridge that still has the original block
   * (here: `reasoningDetails`, see server/sdk-bridge.ts) attaches it here and the
   * adapter threads it onto the reasoning part.
   *
   * There is deliberately NO `textRaw`: the kit's `appendText` takes a bare
   * string with no options channel, so a text part's `raw` is unreachable.
   */
  reasoningRaw?: RawOrigin;
  toolCalls?: ModelToolCallDelta[];
  finishReason?: string | null;
  usage?: ModelUsage;
  /** An in-band provider error (the HTTP response was already 200). */
  error?: { code?: string | number; message: string };
}

// ── The sink ─────────────────────────────────────────────────────────────────

/**
 * The subset of the kit's `AssistantStream` this adapter drives. Declared
 * structurally so the adapter has no runtime dependency on a stream
 * implementation and can be tested against a recorder. The kit's real
 * `AssistantStream` satisfies it as-is: same method names, same arities, and
 * its `AssistantStream` returns are assignable to `unknown`.
 */
export interface AssistantStreamSink {
  appendText(delta: string): unknown;
  appendReasoning(delta: string, opts?: ReasoningOpts): unknown;
  /** Create-or-merge. There is no separate "announce" call: handing a patch for
   *  an unknown `toolCallId` creates the ToolPart, and every later patch merges. */
  upsertTool(toolCallId: string, patch: Partial<ToolPart>): unknown;
}

// ── Result types ─────────────────────────────────────────────────────────────

/** One tool call reassembled out of the stream's fragments. */
export interface ModelToolCall {
  /** The delta index that correlated this call's fragments. */
  index: number;
  /** Provider call id (synthesised as `call_<index>` if the provider omits it). */
  id: string;
  name: string;
  /** The RAW accumulated argument fragments. Echo THIS back to the model on the
   *  next turn, not a re-stringified parse. */
  argumentsText: string;
  /** Parsed arguments: present only when `argumentsText` was a valid JSON object. */
  input?: Record<string, unknown>;
  /** Why this call is unusable (malformed/truncated args, missing name). */
  error?: string;
}

/** Everything one assistant turn produced. */
export interface ModelTurn {
  /**
   * The turn as ORDERED MESSAGE PARTS: the kit's content model, built with the
   * kit's own part builders, so it is exactly what the sink was driven with.
   *
   * Covers this turn only. A multi-round tool loop calls `consumeModelStream`
   * once per round against the same sink, so the message accumulates across
   * rounds while each `ModelTurn.parts` stays a per-round snapshot.
   *
   * `bufferText` swallows text on the way to the sink but NOT here: `parts`
   * describes what the model produced, not what the host chose to display.
   */
  parts: MessagePart[];
  /** Flat concatenation of the text deltas. Kept because the PROVIDER wire format
   *  is a flat string (see `assistantWireMessage`). Not the content model. */
  text: string;
  /** Flat concatenation of the reasoning deltas, for the same reason. */
  reasoning: string;
  toolCalls: ModelToolCall[];
  finishReason: string | null;
  error?: { code?: string | number; message: string };
  usage?: ModelUsage;
  /** How many chunks carried a non-empty `reasoning` delta. Zero with a non-zero
   *  `usage.reasoningTokens` means the provider hid the thinking text. */
  reasoningChunks: number;
  chunks: number;
}

export interface ConsumeOptions {
  /** Label for the reasoning disclosure. Defaults to `'Thinking'`. */
  reasoningLabel?: string;
  /**
   * Fires on every argument fragment with a snapshot of the call so far.
   *
   * Exists because `ToolPart` has NOWHERE to put partial argument text: `input`
   * is `Record<string, unknown>`, so a half-written `{"city":"Par` is
   * unrepresentable until it parses. A host that wants a live "arguments
   * arriving" preview must render it itself off this callback.
   */
  onToolArgumentsDelta?: (call: ModelToolCall) => void;
  /** Fires once per tool call the moment its arguments parse cleanly. */
  onToolCallReady?: (call: ModelToolCall) => void;
}

// ── Tool-call accumulator ────────────────────────────────────────────────────

interface MutableCall {
  index: number;
  id: string | null;
  name: string;
  argumentsText: string;
  announced: boolean;
}

const snapshot = (c: MutableCall): ModelToolCall => ({
  index: c.index,
  id: c.id ?? `call_${c.index}`,
  name: c.name,
  argumentsText: c.argumentsText,
});

/**
 * The provider-shaped tool-call block, REASSEMBLED from the fragments: this is
 * the object `assistantWireMessage` echoes on the next turn, kept on the part so
 * an encoder can round-trip without re-deriving it.
 *
 * Tagged `custom.` on purpose: it is a reconstruction, not a payload the provider
 * handed us intact, so it must never be mistaken for one of the verbatim blocks
 * (Anthropic `thinking`) that a provider refuses to accept rebuilt.
 */
const rawOf = (c: MutableCall): RawOrigin => ({
  source: 'custom.model-stream.tool_call',
  payload: { id: c.id ?? `call_${c.index}`, name: c.name, arguments: c.argumentsText },
});

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

/**
 * Correlate tool-call fragments by `index` and drive the ToolPart lifecycle.
 * THE HARD PART: `id`, `name` and each slice of `arguments` arrive across
 * arbitrarily many chunks in provider-dependent order.
 *
 * A ToolPart is pushed (`input-streaming`) the first time a call has BOTH an id
 * and a non-empty name: announcing earlier would create a panel whose `type` is
 * the empty string. Everything before that is buffered.
 */
export function createToolCallAccumulator(sink: AssistantStreamSink, opts: ConsumeOptions = {}) {
  const calls = new Map<number, MutableCall>();

  const announce = (call: MutableCall) => {
    if (call.announced) return;
    call.id ??= `call_${call.index}`;
    call.announced = true;
    sink.upsertTool(call.id, { type: call.name || 'unknown_tool', state: 'input-streaming' });
  };

  const apply = (raw: ModelToolCallDelta) => {
    const index = typeof raw.index === 'number' ? raw.index : 0;
    let call = calls.get(index);
    if (!call) {
      call = { index, id: null, name: '', argumentsText: '', announced: false };
      calls.set(index, call);
    }
    if (raw.id && !call.id) call.id = raw.id;
    if (raw.name) call.name += raw.name;
    if (call.id && call.name) announce(call);

    if (typeof raw.arguments === 'string' && raw.arguments !== '') {
      call.argumentsText += raw.arguments;
      // NOTE: nothing is written to the ToolPart here: `input` cannot hold a
      // half-parsed JSON string. See ConsumeOptions.onToolArgumentsDelta.
      opts.onToolArgumentsDelta?.(snapshot(call));
    }
  };

  /** Settle every accumulated call once the stream ends. */
  const settle = (finishReason: string | null, streamError?: string): ModelToolCall[] =>
    [...calls.values()]
      .sort((a, b) => a.index - b.index)
      .map((call) => {
        announce(call); // a call that only ever had arguments still gets a panel
        const id = call.id!;
        const base = snapshot(call);
        // Attached once, at settle: before that `argumentsText` is still growing
        // and a raw snapshot of half a JSON string is worse than none.
        const raw = rawOf(call);

        if (streamError) {
          const error = `Stream failed before the tool call completed: ${streamError}`;
          sink.upsertTool(id, { state: 'output-error', errorText: error, raw });
          return { ...base, error };
        }

        if (!call.name) {
          const error = 'Tool call arrived with no function name; cannot dispatch it.';
          sink.upsertTool(id, { state: 'output-error', errorText: error, raw });
          return { ...base, error };
        }

        const rawArgs = call.argumentsText.trim();
        try {
          // An argument-less tool legitimately streams "" or "{}".
          const parsed: unknown = rawArgs === '' ? {} : JSON.parse(rawArgs);
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('arguments must be a JSON object');
          }
          const input = parsed as Record<string, unknown>;
          sink.upsertTool(id, { state: 'input-available', input, raw });
          const ready = { ...base, input };
          opts.onToolCallReady?.(ready);
          return ready;
        } catch (e) {
          const truncated = finishReason === 'length' ? ' (the stream hit the token limit mid-call)' : '';
          const error =
            `Malformed tool arguments${truncated}: ${(e as Error).message}. ` +
            `Received ${rawArgs.length} chars: ${clip(rawArgs, 160)}`;
          sink.upsertTool(id, { state: 'output-error', errorText: error, raw });
          return { ...base, error };
        }
      });

  return { apply, settle };
}

// ── Part recording ───────────────────────────────────────────────────────────

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
      parts = appendReasoningPart(parts, delta, opts);
    },
    upsertTool(toolCallId, patch) {
      parts = upsertToolPart(parts, toolCallId, patch);
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
  };
}

// ── The main loop ────────────────────────────────────────────────────────────

/**
 * Read one turn's worth of `ModelStreamChunk`s and drive `sink` with them.
 *
 * The sink is expected to be the kit's `AssistantStream`, which produces a NEW
 * message object (and a new `parts` array) on every mutation: that is what makes
 * `<kai-thread>` re-render. This adapter calls the sink once per delta and never
 * batches; batching is a host concern.
 */
export async function consumeModelStream(
  chunks: AsyncIterable<ModelStreamChunk>,
  sink: AssistantStreamSink,
  opts: ConsumeOptions = {},
): Promise<ModelTurn> {
  const label = opts.reasoningLabel ?? 'Thinking';
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

    if (chunk.reasoning) {
      reasoning += chunk.reasoning;
      reasoningChunks++;
      // `raw` only when the bridge actually had the provider's block; passing
      // `undefined` would blank a `raw` an earlier delta already established.
      out.appendReasoning(chunk.reasoning, {
        label,
        ...(chunk.reasoningRaw ? { raw: chunk.reasoningRaw } : {}),
      });
    }

    if (chunk.toolCalls) for (const tc of chunk.toolCalls) tools.apply(tc);

    if (chunk.finishReason) finishReason = chunk.finishReason;
  }

  const toolCalls = tools.settle(finishReason, error?.message);

  return {
    parts: recorder.parts(),
    text,
    reasoning,
    toolCalls,
    finishReason,
    reasoningChunks,
    chunks: chunkCount,
    ...(error ? { error } : {}),
    ...(usage ? { usage } : {}),
  };
}

// ── Post-execution sink helpers ──────────────────────────────────────────────

/** Mark a tool call's panel done with the result the host computed. */
export function applyToolOutput(
  sink: AssistantStreamSink,
  toolCallId: string,
  output: Record<string, unknown>,
): void {
  sink.upsertTool(toolCallId, { state: 'output-available', output });
}

/** Mark a tool call's panel failed. */
export function applyToolFailure(sink: AssistantStreamSink, toolCallId: string, message: string): void {
  sink.upsertTool(toolCallId, { state: 'output-error', errorText: message });
}

/**
 * A sink wrapper that swallows text instead of appending it, and hands the
 * buffered text back at the end.
 *
 * Needed for STRUCTURED OUTPUTS: when `response_format` is a JSON schema, the
 * assistant's whole message is raw JSON, so streaming it into `<kai-thread>`
 * shows the user a wall of braces. Buffer, parse, then `appendText` the human
 * part, which behaves as a SET, because nothing text-shaped ever reached the
 * message (the kit has no replace-the-text operation; `appendTextPart` only ever
 * extends or opens a text part).
 */
export function bufferText(sink: AssistantStreamSink): AssistantStreamSink & { buffered(): string } {
  let buf = '';
  return {
    appendText(delta) {
      buf += delta;
      return undefined;
    },
    appendReasoning: (d, o) => sink.appendReasoning(d, o),
    upsertTool: (id, p) => sink.upsertTool(id, p),
    buffered: () => buf,
  };
}

// ── Wire messages (what goes back to the model next turn) ────────────────────

export interface WireToolCall {
  id: string;
  name: string;
  /** The raw argument JSON string, verbatim. */
  arguments: string;
}

/** A provider-neutral conversation message. The transport maps it to whatever
 *  the provider wants (snake_case JSON, an SDK type, …). */
export interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: WireToolCall[];
  toolCallId?: string;
  name?: string;
}

/**
 * Rebuild the assistant message for the next turn. Uses the RAW `argumentsText`
 * rather than `JSON.stringify(input)`: providers validate the echoed tool block
 * against what they emitted, and a re-stringify changes key order and whitespace.
 *
 * Reads `turn.text`, NOT `partsToText(turn.parts)`: the wire is provider-facing
 * and its `content` is one flat string, so the flat accumulation is the honest
 * source. Parts are for the kit; strings are for the model.
 *
 * Tool calls that failed to parse are DROPPED, which keeps the API's invariant
 * intact: every echoed tool call must have exactly one matching tool result.
 */
export function assistantWireMessage(turn: ModelTurn, textOverride?: string): WireMessage {
  const usable = turn.toolCalls.filter((c) => !c.error);
  const content = textOverride ?? turn.text;
  return {
    role: 'assistant',
    content: content || null,
    ...(usable.length
      ? { toolCalls: usable.map<WireToolCall>((c) => ({ id: c.id, name: c.name, arguments: c.argumentsText || '{}' })) }
      : {}),
  };
}

/** The `role: 'tool'` reply carrying one locally-executed result. */
export function toolResultWireMessage(call: ModelToolCall, result: unknown): WireMessage {
  return {
    role: 'tool',
    toolCallId: call.id,
    name: call.name,
    content: typeof result === 'string' ? result : JSON.stringify(result),
  };
}
