// ─────────────────────────────────────────────────────────────────────────────
// model-stream.ts — THE PORTABLE ADAPTER. The point of the spike.
//
// The kit ships `createAssistantStream` (a fluent builder over one in-flight
// assistant message) but nothing that FEEDS it from a model. This is that piece.
//
// PORTABILITY RULES (this file is the candidate for `@kitn.ai/ui/state`):
//   · no React, no Solid, no DOM, no fetch, no SSE
//   · NO PROVIDER SDK. The input is `ModelStreamChunk` — our own minimal
//     structural shape. Mapping a provider's chunks onto it is somebody else's
//     job (here: server/sdk-bridge.ts). The kit must never depend on
//     @openrouter/sdk, the OpenAI SDK, or an SSE wire format.
//   · the only kit import is a TYPE (`ToolPart`), erased at build time. Inside
//     the kit that import becomes `../components/tool-types` and nothing else
//     changes.
// ─────────────────────────────────────────────────────────────────────────────

import type { ToolPart } from '@kitn.ai/ui';

// ── The provider-neutral chunk shape ─────────────────────────────────────────

/** One fragment of a tool call. `index` is the ONLY thing guaranteed to
 *  correlate fragments — `id`, `name` and `arguments` each arrive whenever the
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
  toolCalls?: ModelToolCallDelta[];
  finishReason?: string | null;
  usage?: ModelUsage;
  /** An in-band provider error (the HTTP response was already 200). */
  error?: { code?: string | number; message: string };
}

// ── The sink ─────────────────────────────────────────────────────────────────

/**
 * The subset of the kit's `AssistantStream` this adapter drives. Declared
 * structurally so the adapter has no runtime dependency on the kit and can be
 * tested against a recorder. The kit's real `AssistantStream` satisfies it.
 */
export interface AssistantStreamSink {
  appendText(delta: string): unknown;
  appendReasoning(delta: string, label?: string): unknown;
  upsertTool(tool: ToolPart): unknown;
  updateTool(toolCallId: string, patch: Partial<ToolPart>): unknown;
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
  /** Parsed arguments — present only when `argumentsText` was a valid JSON object. */
  input?: Record<string, unknown>;
  /** Why this call is unusable (malformed/truncated args, missing name). */
  error?: string;
}

/** Everything one assistant turn produced. */
export interface ModelTurn {
  text: string;
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

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

/**
 * Correlate tool-call fragments by `index` and drive the ToolPart lifecycle.
 * THE HARD PART: `id`, `name` and each slice of `arguments` arrive across
 * arbitrarily many chunks in provider-dependent order.
 *
 * A ToolPart is pushed (`input-streaming`) the first time a call has BOTH an id
 * and a non-empty name — announcing earlier would create a panel whose `type` is
 * the empty string. Everything before that is buffered.
 */
export function createToolCallAccumulator(sink: AssistantStreamSink, opts: ConsumeOptions = {}) {
  const calls = new Map<number, MutableCall>();

  const announce = (call: MutableCall) => {
    if (call.announced) return;
    call.id ??= `call_${call.index}`;
    call.announced = true;
    sink.upsertTool({ type: call.name || 'unknown_tool', toolCallId: call.id, state: 'input-streaming' });
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
      // NOTE: nothing is written to the ToolPart here — `input` cannot hold a
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

        if (streamError) {
          const error = `Stream failed before the tool call completed: ${streamError}`;
          sink.updateTool(id, { state: 'output-error', errorText: error });
          return { ...base, error };
        }

        if (!call.name) {
          const error = 'Tool call arrived with no function name; cannot dispatch it.';
          sink.updateTool(id, { state: 'output-error', errorText: error });
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
          sink.updateTool(id, { state: 'input-available', input });
          const ready = { ...base, input };
          opts.onToolCallReady?.(ready);
          return ready;
        } catch (e) {
          const truncated = finishReason === 'length' ? ' (the stream hit the token limit mid-call)' : '';
          const error =
            `Malformed tool arguments${truncated}: ${(e as Error).message}. ` +
            `Received ${rawArgs.length} chars: ${clip(rawArgs, 160)}`;
          sink.updateTool(id, { state: 'output-error', errorText: error });
          return { ...base, error };
        }
      });

  return { apply, settle };
}

// ── The main loop ────────────────────────────────────────────────────────────

/**
 * Read one turn's worth of `ModelStreamChunk`s and drive `sink` with them.
 *
 * The sink is expected to be the kit's `AssistantStream`, which produces a NEW
 * message object (and a new `tools` array) on every mutation — that is what makes
 * `<kai-thread>` re-render. This adapter calls the sink once per delta and never
 * batches; batching is a host concern.
 */
export async function consumeModelStream(
  chunks: AsyncIterable<ModelStreamChunk>,
  sink: AssistantStreamSink,
  opts: ConsumeOptions = {},
): Promise<ModelTurn> {
  const label = opts.reasoningLabel ?? 'Thinking';
  const tools = createToolCallAccumulator(sink, opts);

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
      sink.appendText(chunk.text);
    }

    if (chunk.reasoning) {
      reasoning += chunk.reasoning;
      reasoningChunks++;
      sink.appendReasoning(chunk.reasoning, label);
    }

    if (chunk.toolCalls) for (const tc of chunk.toolCalls) tools.apply(tc);

    if (chunk.finishReason) finishReason = chunk.finishReason;
  }

  return {
    text,
    reasoning,
    toolCalls: tools.settle(finishReason, error?.message),
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
  sink.updateTool(toolCallId, { state: 'output-available', output });
}

/** Mark a tool call's panel failed. */
export function applyToolFailure(sink: AssistantStreamSink, toolCallId: string, message: string): void {
  sink.updateTool(toolCallId, { state: 'output-error', errorText: message });
}

/**
 * A sink wrapper that swallows text instead of appending it, and hands the
 * buffered text back at the end.
 *
 * Needed for STRUCTURED OUTPUTS: when `response_format` is a JSON schema, the
 * assistant's whole message is raw JSON, so streaming it into `<kai-thread>`
 * shows the user a wall of braces. Buffer, parse, then `setText` the human part.
 */
export function bufferText(sink: AssistantStreamSink): AssistantStreamSink & { buffered(): string } {
  let buf = '';
  return {
    appendText(delta) {
      buf += delta;
      return undefined;
    },
    appendReasoning: (d, l) => sink.appendReasoning(d, l),
    upsertTool: (t) => sink.upsertTool(t),
    updateTool: (id, p) => sink.updateTool(id, p),
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
 * rather than `JSON.stringify(input)` — providers validate the echoed tool block
 * against what they emitted, and a re-stringify changes key order and whitespace.
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
