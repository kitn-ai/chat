import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, KaiChatController } from '@kitn.ai/ui/react';
import { createAssistantStream, partsToText, type AssistantStream } from '@kitn.ai/ui/state';
import {
  applyToolFailure,
  applyToolOutput,
  bufferText,
  readAnthropicStream,
  readOpenAIStream,
  toAnthropicMessages,
  toOpenAIMessages,
  type AnthropicWireMessage,
  type AssistantStreamSink,
  type ModelTurn,
  type OpenAIWireMessage,
} from '@kitn.ai/ui/wire';
import {
  openChatStream,
  type CardMode,
  type HarnessTag,
  type ReplayRequest,
  type WireKind,
} from '../transport';
import { buildSystemPrompt, runTool, toolsFor, type ToolSpec } from '../tools';
import { STRUCTURED_SYSTEM_SUFFIX, parseReplyWithCard } from '../card-schema';
import { newId } from '../chat-data';

/** Hard cap on the tool loop: a runaway model is a runaway bill. */
const MAX_ROUNDS = 4;

/** Per-send overrides. The conformance harness supplies all of them; the
 *  interactive composer supplies none and gets today's behaviour. */
export interface SendOptions {
  /** Exactly the tools this turn should offer. Defaults to the card-mode set. */
  tools?: ToolSpec[];
  maxRounds?: number;
  /** Recording label passed through to the proxy. Never affects the request. */
  harness?: HarnessTag;
  /** Replay a captured stream instead of calling the provider. */
  replay?: Omit<ReplayRequest, 'round'>;
}

/** Everything the debug panel shows. Most of it exists to answer one question:
 *  did reasoning STREAM, or only show up as a token count at the end? */
export interface TurnStats {
  rounds: number;
  chunks: number;
  reasoningChunks: number;
  reasoningChars: number;
  reasoningTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  /** The provider's own word for why it stopped, verbatim. */
  finishReason: string | null;
  /** The same fact in the kit's one vocabulary. Both are shown because a
   *  normalization that silently degrades to 'other' is worth being able to see. */
  stopReason: string | null;
  toolCallsSeen: number;
  toolCallsMalformed: number;
  cardMode: CardMode;
  structuredError?: string;
}

export interface SpikeChat {
  send: (text: string, opts?: SendOptions) => Promise<void>;
  /** Abort the in-flight turn. Leaves what already rendered in place and
   *  resolves any tool part that never got a result to `output-error`. */
  stop: () => void;
  reset: () => void;
  error: string | null;
  stats: TurnStats | null;
}

/** What `stream.abort` writes into the orphaned tool panels. Asserted by S17. */
export const CANCEL_REASON = 'Stopped by the user';

/** Drive two sinks from one call, the visible message first so it updates in
 *  stream order. The kit tees internally for its own parts recorder but does not
 *  export that, and a four-method structural interface is not worth an export. */
function tee(a: AssistantStreamSink, b: AssistantStreamSink): AssistantStreamSink {
  return {
    appendText: (delta) => {
      a.appendText(delta);
      b.appendText(delta);
    },
    appendReasoning: (delta, opts) => {
      a.appendReasoning(delta, opts);
      b.appendReasoning(delta, opts);
    },
    upsertTool: (toolCallId, patch) => {
      a.upsertTool(toolCallId, patch);
      b.upsertTool(toolCallId, patch);
    },
    addSource: (source) => {
      a.addSource?.(source);
      b.addSource?.(source);
    },
  };
}

/**
 * @param wire which SSE dialect the proxy is speaking, from `/api/config`. It
 *   selects BOTH halves of the round trip — the encoder that puts the thread
 *   back on the wire and the reader that parses the reply — because those two
 *   must always agree. Defaults to `openai` so a render before the config
 *   resolves cannot silently pick the wrong pair; the harness waits for the
 *   config before it sends anything.
 */
export function useSpikeChat(
  chat: KaiChatController,
  cardMode: CardMode,
  wire: WireKind = 'openai',
): SpikeChat {
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TurnStats | null>(null);

  /** The system prompt TEXT, held across sends. Everything after it is
   *  re-encoded from the thread each round. Kept as text rather than as a wire
   *  message because the two wires carry it differently: OpenAI as
   *  `messages[0]`, Anthropic as a top-level `system` field. */
  const systemRef = useRef<string | null>(null);
  /** The in-flight turn's abort handle, plus the stream to mark up on cancel.
   *  Held in a ref so `stop` can reach a turn started by an earlier render. */
  const inflightRef = useRef<{ abort: AbortController; stream: AssistantStream } | null>(null);

  const reset = useCallback(() => {
    systemRef.current = null;
    inflightRef.current = null;
    setError(null);
    setStats(null);
  }, []);

  const stop = useCallback(() => {
    const inflight = inflightRef.current;
    if (!inflight) return;
    inflightRef.current = null;
    // Order matters: abort the fetch FIRST so no further delta can land after
    // the parts have been marked up, then settle the message.
    inflight.abort.abort();
    inflight.stream.abort(CANCEL_REASON);
    setError(CANCEL_REASON);
  }, []);

  const send = useCallback(
    async (raw: string, opts: SendOptions = {}) => {
      const text = raw.trim();
      if (!text) return;

      setError(null);

      const structured = cardMode === 'structured';
      const tools = opts.tools ?? toolsFor(cardMode);
      systemRef.current ??=
        buildSystemPrompt(tools) + (structured ? STRUCTURED_SYSTEM_SUFFIX : '');
      const systemPrompt = systemRef.current;

      const userMessage: ChatMessage = {
        id: newId(),
        role: 'user',
        parts: [{ type: 'text', text }],
      };
      chat.append(userMessage);

      const stream = chat.streamAssistant();

      // `chat.messages` is THIS RENDER'S snapshot: it does not change while this
      // async callback runs, so the encoder cannot read the turn it is building.
      // `mirror` is a detached copy of the same thread, driven by the same
      // deltas, and it is what toOpenAIMessages reads. The kit's own part folds
      // do the work, so the mirror cannot drift from the visible message.
      let mirror: ChatMessage[] = [...chat.messages, userMessage];
      const mirrorStream: AssistantStream = createAssistantStream(
        (update) => {
          mirror = update(mirror);
        },
        { id: stream.id },
      );
      // Both encoders are the kit's, and both split the turn at the tool
      // boundary; what differs is where the system prompt goes and what a tool
      // result looks like. Picking here — rather than in the proxy — is the
      // point of the exercise: `toAnthropicMessages` is what has to survive a
      // real multi-round tool loop, verbatim thinking blocks and all.
      const encode = (): OpenAIWireMessage[] | AnthropicWireMessage[] =>
        wire === 'anthropic'
          ? toAnthropicMessages(mirror)
          : [{ role: 'system', content: systemPrompt }, ...toOpenAIMessages(mirror)];
      const readStream = wire === 'anthropic' ? readAnthropicStream : readOpenAIStream;

      // In structured mode the whole message is JSON, so it must NOT be appended
      // into the visible thread: buffer it, parse, then append just the prose.
      // The mirror still receives the raw JSON, which is what the model should
      // see echoed back on a later round.
      const buffered = structured ? bufferText(stream) : null;
      const sink = tee(buffered ?? stream, mirrorStream);

      const abort = new AbortController();
      inflightRef.current = { abort, stream };

      const acc: TurnStats = {
        rounds: 0,
        chunks: 0,
        reasoningChunks: 0,
        reasoningChars: 0,
        finishReason: null,
        stopReason: null,
        toolCallsSeen: 0,
        toolCallsMalformed: 0,
        cardMode,
      };
      const absorb = (turn: ModelTurn) => {
        acc.rounds += 1;
        acc.chunks += turn.chunks;
        acc.reasoningChunks += turn.reasoningChunks;
        acc.reasoningChars += turn.reasoning.length;
        acc.finishReason = turn.finishReason;
        acc.stopReason = turn.stopReason ?? null;
        acc.toolCallsSeen += turn.toolCalls.length;
        acc.toolCallsMalformed += turn.toolCalls.filter((c) => c.error).length;
        if (turn.usage) {
          acc.reasoningTokens = (acc.reasoningTokens ?? 0) + (turn.usage.reasoningTokens ?? 0);
          acc.promptTokens = (acc.promptTokens ?? 0) + (turn.usage.inputTokens ?? 0);
          acc.completionTokens = (acc.completionTokens ?? 0) + (turn.usage.outputTokens ?? 0);
          if (turn.usage.costUsd != null) acc.costUsd = (acc.costUsd ?? 0) + turn.usage.costUsd;
        }
        setStats({ ...acc });
      };

      const maxRounds = opts.maxRounds ?? MAX_ROUNDS;

      try {
        for (let round = 0; round < maxRounds; round++) {
          const res = await openChatStream({
            messages: encode(),
            wire,
            // Only the Anthropic wire needs it out-of-band; on the OpenAI wire
            // `encode()` has already put it in messages[0].
            ...(wire === 'anthropic' ? { system: systemPrompt } : {}),
            tools,
            cardMode,
            signal: abort.signal,
            // The round number is 1-based in fixture filenames: `round-1.sse` is
            // the first request, which is what a human reading the directory
            // expects.
            ...(opts.harness ? { harness: { ...opts.harness, round: round + 1 } } : {}),
            ...(opts.replay ? { replay: { ...opts.replay, round: round + 1 } } : {}),
          });
          const turn = await readStream(res, sink, { reasoningLabel: 'Thinking' });
          absorb(turn);

          if (turn.error) throw new Error(turn.error.message);

          // A provider-executed call already has its result in the stream.
          // Running it again would bill twice for the same answer.
          const usable = turn.toolCalls.filter((c) => !c.error && !c.providerExecuted);

          if (turn.toolCalls.length > 0 && usable.length === 0) {
            throw new Error('Every tool call the model emitted was malformed: see the tool panels.');
          }

          if (usable.length > 0) {
            for (const call of usable) {
              const run = runTool(call.name, call.input ?? {});
              // A tool that FAILED takes the other branch on purpose: the panel
              // has an output-error state and a consumer's catch block is
              // supposed to reach it. `applyToolOutput` on a failure would show
              // a green "Completed" chip over an error payload.
              if (run.failure) applyToolFailure(sink, call.id, run.failure);
              else applyToolOutput(sink, call.id, run.output);
              // Sources, cards and files are message PARTS now, so they land
              // inside the assistant turn in stream order instead of in a tray
              // under it.
              for (const s of run.sources ?? []) {
                const source = { url: s.href, title: s.title, snippet: s.description };
                stream.addSource(source);
                mirrorStream.addSource(source);
              }
              if (run.card) {
                stream.addCard(run.card);
                mirrorStream.addCard(run.card);
              }
              if (run.file) {
                stream.addFile(run.file);
                mirrorStream.addFile(run.file);
              }
            }
            // The kit's encoder is the single source of truth for what goes
            // back, and it keeps rawInput verbatim so the provider accepts the
            // echoed tool block.
            continue; // another round: let the model answer with the results
          }

          // No tool calls left: this round produced the final answer.
          if (buffered) {
            // FINDING: `AssistantStream` has no `setText`/`replaceText`, so this
            // appends. It reads as a SET only because `bufferText` swallowed every
            // text delta: the message holds no text part, so the append opens the
            // first one. A kit-level "replace the text" op is the missing piece.
            const { value, error: schemaError } = parseReplyWithCard(buffered.buffered());
            if (schemaError || !value) {
              acc.structuredError = schemaError ?? 'unknown structured-output failure';
              setStats({ ...acc });
              // Show SOMETHING rather than an empty bubble.
              stream.appendText(
                `The model's structured output did not match the card schema.\n\n> ${acc.structuredError}`,
              );
            } else {
              stream.appendText(value.reply);
              if (value.card) {
                stream.addCard(value.card);
                mirrorStream.addCard(value.card);
              }
            }
          }
          return;
        }
        throw new Error(`Stopped after ${maxRounds} tool rounds without a final answer.`);
      } catch (e) {
        // A cancel is not a failure: `stop()` already settled the message and set
        // the reason, and the AbortError that unwinds this loop afterwards must
        // not overwrite it with "signal is aborted without reason".
        if (abort.signal.aborted) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        // Leave whatever streamed in place; just make the failure visible. Only
        // TEXT counts as "the user already saw something": a lone tool panel or
        // reasoning block still needs the failure spelled out. Read from the
        // mirror, for the same staleness reason it exists.
        if (!mirror.some((m) => m.id === stream.id && partsToText(m.parts))) {
          stream.appendText(`_The request failed: ${message}_`);
        }
      } finally {
        if (inflightRef.current?.abort === abort) inflightRef.current = null;
        stream.done();
        mirrorStream.done();
      }
    },
    [chat, cardMode, wire],
  );

  return { send, stop, reset, error, stats };
}
