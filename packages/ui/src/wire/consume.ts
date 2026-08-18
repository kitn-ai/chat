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
import {
  emitWireDiagnostic,
  nextStreamId,
  wireCorrelation,
  wireDiagnosticsActive,
  withPayload,
  type WireCorrelation,
} from './diagnostics';

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
function createPartsRecorder(correlation: WireCorrelation): AssistantStreamSink & {
  parts(): MessagePart[];
  /** How many DISTINCT parts each variant produced, keyed by variant name.
   *
   *  Counted from the sink method that was called plus the fact that the parts
   *  array GREW, NOT by discriminating a `MessagePart` -- which is what keeps
   *  this out of scope for `lint:silent-drops`: there is no new switch over
   *  `MessagePart.type` in `wire/` to go stale when a seventh variant lands.
   *
   *  Parts, not writes: five text deltas merge into ONE text part and report
   *  `{ text: 1 }`. A consumer renders these as "N parts", so a write count
   *  would lie there. Per-delta granularity is not lost -- one `wire.part`
   *  event is still emitted per write, carrying that delta's own `chars`. */
  partCounts(): Record<string, number>;
} {
  let parts: MessagePart[] = [];
  const counts: Record<string, number> = {};

  /** Count the part if this write created one, then report the write. `chars` is
   *  the delta LENGTH and is passed only for the text-bearing variants; the
   *  delta itself never travels.
   *
   *  A write either APPENDS a part or MERGES into one that already exists, and
   *  the array length is what separates them -- uniform across all four methods
   *  and needing no knowledge of any variant's shape. The growth amount is used
   *  rather than a flat +1 so a builder that ever appends two stays honest.
   *
   *  `index` is the position in `parts` this write landed on, found by comparing
   *  references before and after. The builders return a new array with a new
   *  object for the item they changed, so the first slot that differs IS the
   *  part that moved. Computed only when someone is listening. */
  const record = (
    variant: string,
    before: MessagePart[],
    chars?: number,
    /** Built ONLY when the payload switch is on -- a thunk, so with it off
     *  nothing here is read or copied. */
    payload?: () => { delta?: string; patch?: unknown; source?: unknown },
  ) => {
    if (parts.length > before.length) {
      counts[variant] = (counts[variant] ?? 0) + (parts.length - before.length);
    }
    if (!wireDiagnosticsActive()) return;
    let index = parts.length - 1;
    for (let i = 0; i < parts.length; i++) {
      if (before[i] !== parts[i]) {
        index = i;
        break;
      }
    }
    emitWireDiagnostic({
      type: 'wire.part',
      t: Date.now(),
      ...correlation,
      variant,
      index,
      ...(chars !== undefined ? { chars } : {}),
      ...(payload ? withPayload(payload) : {}),
    });
  };

  return {
    appendText(delta) {
      const before = parts;
      parts = appendTextPart(parts, delta);
      record('text', before, delta.length, () => ({ delta }));
    },
    appendReasoning(delta, opts) {
      const before = parts;
      // `streamId` is DROPPED here on purpose. It namespaces block indices for a
      // sink that outlives one stream; this recorder starts a fresh array per
      // call, so within `ModelTurn.parts` there is nothing to disambiguate. Worse,
      // it is a new value on every call, so keeping it would make `parts`
      // non-reproducible for identical input and break the determinism the
      // adapter guarantees (same chunks in, same parts out, whatever the byte
      // boundaries). The host's own sink still receives it.
      parts = appendReasoningPart(parts, delta, { ...opts, streamId: undefined });
      record('reasoning', before, delta.length, () => ({ delta }));
    },
    upsertTool(toolCallId, patch) {
      const before = parts;
      parts = upsertToolPart(parts, toolCallId, patch);
      // The patch is where the tool's arguments and its output live, so the
      // whole thing is payload and none of it is metadata.
      record('tool', before, undefined, () => ({ patch }));
    },
    addSource(source) {
      const before = parts;
      parts = [...parts, { type: 'source', source }];
      record('source', before, undefined, () => ({ source }));
    },
    parts: () => parts,
    partCounts: () => counts,
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
  // `readModelStream` assigns the id one level up, because it opens the format
  // and counts frames before this function runs and every event from one read
  // has to carry the same id. A direct caller still gets a fresh one per call.
  const streamId = opts.streamId ?? nextStreamId();
  // `traceId`/`label` ride along unchanged from the caller. `readModelStream`
  // built the same object one level up and passes the parts of it through
  // `opts`, so a read and its consume report one identical correlation.
  const correlation = wireCorrelation(streamId, opts);
  const startedAt = Date.now();
  const recorder = createPartsRecorder(correlation);
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

  // A turn that received NOTHING has failed, and used to say so nowhere.
  //
  // The response was 200 and the body carried no parsable frame at all, which is
  // exactly what a proxy route produces when it forwards a provider failure
  // WITHOUT its status: an upstream 401 (no key — the most common first run)
  // arrives as HTTP 200 whose body is a JSON error object mislabelled
  // text/event-stream. `readModelStream` cannot throw for it (the response is
  // ok) and the SSE decoder finds no `data:` line, so the turn resolved empty:
  // no text, no error, no console output, nothing to debug. The route templates
  // forward the status now; this is the second, independent guard, and it also
  // covers a truncated body, a non-streaming completion returned by mistake, and
  // an HTML proxy page.
  //
  // AND ITS SIBLING: a turn whose frames PARSED but produced no part.
  //
  // The guard judges on parts produced rather than on raw chunk count, which is
  // what makes it hold once a format reads a field that content-less frames also
  // carry (`model`, `finishReason`, `usage`). Judged on chunks alone, surfacing
  // `model` would have taken this whole guard quiet: frames yielding nothing but
  // an id would push `chunkCount` above zero and the turn would go back to
  // resolving empty and saying so nowhere.
  //
  // The split reports which of the two happened, because they have different
  // fixes: zero chunks means nothing parsed as a frame at all, while chunks with
  // no parts means the frames parsed and carried nothing THIS reader reads --
  // the wrong-dialect case, and the one this option makes common.
  // ORDER IS LOAD-BEARING: settle runs FIRST, because settle PRODUCES PARTS.
  //
  // A tool call that never held both an id and a non-empty name is announced
  // only inside `settle`, so a parts map read before it is not final. Judged
  // there, a turn whose only content is such a call looked empty, and the
  // damage went both ways: the guard's own prose was fed back in as
  // `streamError` and REPLACED the call's accurate "arrived with no function
  // name" diagnosis, while `wire.close` reported an emptiness code beside a
  // produced part. Both reads now happen after settle, so the parts map, the
  // error code and the tool's own error agree by construction.
  //
  // `settle` still receives only a GENUINE in-band stream error, exactly as it
  // did before the guard was widened -- an emptiness diagnosis must never flow
  // into it. `stopReason` is recomputed below because the guard can set the
  // error that makes it 'error'; settle only branches on 'length', which the
  // guard cannot produce, so the pre-guard value is the right one to pass.
  const settleStopReason = normalizeStopReason(finishReason) ?? (error ? 'error' : undefined);
  const toolCalls = tools.settle(settleStopReason, error?.message);

  const partsTotal = Object.values(recorder.partCounts()).reduce((a, b) => a + b, 0);
  if (!error && partsTotal === 0) {
    error =
      chunkCount === 0
        ? {
            code: 'empty-stream',
            message:
              'The model stream produced no chunks. The response was 200 but nothing in its body parsed ' +
              'as a stream frame — check the endpoint really sent Content-Type: text/event-stream and that ' +
              'the request set stream: true. A route that forwards a provider error without its status ' +
              'lands here: the body is a JSON error, not SSE.',
          }
        : {
            code: 'empty-turn',
            message:
              `The stream completed and ${chunkCount} chunk(s) were parsed, but none carried content ` +
              'this reader reads, so no message part was produced. If the endpoint streams a different ' +
              'dialect (or carries its payload in a field this format does not read), switch to the ' +
              'matching reader. A model that returned no content at all also lands here.',
          };
  }

  // REWORK 3. `finishReason` is reported verbatim; `stopReason` is what the
  // adapter itself branches on, so no OpenAI literal leaks into adapter logic.
  //
  // Recomputed after the guard: an emptiness error is still an error, and a turn
  // that reports one must report `stopReason: 'error'` beside it as it always
  // has. Identical to `settleStopReason` whenever the guard stayed silent.
  const stopReason = normalizeStopReason(finishReason) ?? (error ? 'error' : undefined);

  if (wireDiagnosticsActive()) {
    // `_frames` is supplied by `readModelStream` only. A direct caller had no
    // frames, so the field is absent rather than zero -- a consumer must be able
    // to tell "not reported" from "none arrived".
    const frames = (opts as { _frames?: () => number })._frames?.();
    emitWireDiagnostic({
      type: 'wire.close',
      t: Date.now(),
      ...correlation,
      ...(frames !== undefined ? { frames } : {}),
      chunks: chunkCount,
      parts: recorder.partCounts(),
      finishReason,
      ...(stopReason ? { stopReason } : {}),
      // The CODE only. A provider's error message can echo request content back,
      // which is why it stays on `ModelTurn.error` and never on the event.
      ...(error?.code !== undefined ? { errorCode: error.code } : {}),
      ...(usage ? { usage } : {}),
      ms: Date.now() - startedAt,
      // The assembled turn: everything the sink was driven with, in one place,
      // which is what a panel renders when someone asks "what did it actually
      // say" -- plus the in-band error's own message.
      //
      // ALL THREE TERMINAL EVENTS TREAT PROVIDER MESSAGE TEXT IDENTICALLY:
      // `wire.close`, `wire.failed` and `wire.interrupted` each keep it out of
      // the metadata (where only `errorCode` travels, because a message can
      // echo request content back) and each publish it under `payload`, which
      // is the switch that accepts exactly that. A developer who armed payload
      // is most often chasing the in-band error that explains an empty turn.
      ...withPayload(() => ({
        text,
        reasoning,
        toolCalls,
        sources,
        ...(error?.message !== undefined ? { message: error.message } : {}),
      })),
    });
  }

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
