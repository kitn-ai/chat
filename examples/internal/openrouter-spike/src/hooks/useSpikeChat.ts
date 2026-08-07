import { useCallback, useRef, useState } from 'react';
import type { KaiChatController } from '@kitn.ai/ui/react';
import type { CardEnvelope, CardResolution } from '@kitn.ai/ui';
import {
  applyToolOutput,
  assistantWireMessage,
  bufferText,
  consumeModelStream,
  toolResultWireMessage,
  type ModelTurn,
  type WireMessage,
} from '../model-stream';
import { openChatStream, type CardMode } from '../transport';
import { buildSystemPrompt, runTool, toolsFor, type SourceItem } from '../tools';
import { STRUCTURED_SYSTEM_SUFFIX, parseReplyWithCard } from '../card-schema';
import { newId } from '../chat-data';

/** Hard cap on the tool loop — a runaway model is a runaway bill. */
const MAX_ROUNDS = 4;

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
  finishReason: string | null;
  toolCallsSeen: number;
  toolCallsMalformed: number;
  cardMode: CardMode;
  structuredError?: string;
}

export interface SpikeChat {
  send: (text: string) => Promise<void>;
  reset: () => void;
  /** Citation chips from `search_docs`. ChatMessage has no `sources` field, so
   *  these live OUTSIDE the thread. See ../../FINDINGS.md, section
   *  "ChatMessage has no sources and no cards". */
  sources: SourceItem[];
  /** Card envelopes from `propose_action` or the structured-output schema.
   *  ChatMessage has no `cards` field either. */
  cards: CardEnvelope[];
  resolveCard: (cardId: string, resolution: CardResolution) => void;
  /** Live partial tool-call arguments, keyed by toolCallId. The kit's ToolPart
   *  cannot hold these, so the app renders them itself. */
  partialArgs: Record<string, string>;
  error: string | null;
  stats: TurnStats | null;
}

export function useSpikeChat(chat: KaiChatController, cardMode: CardMode): SpikeChat {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [cards, setCards] = useState<CardEnvelope[]>([]);
  const [partialArgs, setPartialArgs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TurnStats | null>(null);

  // The full provider-neutral conversation, rebuilt as the loop runs.
  const wireRef = useRef<WireMessage[]>([]);

  const reset = useCallback(() => {
    wireRef.current = [];
    setSources([]);
    setCards([]);
    setPartialArgs({});
    setError(null);
    setStats(null);
  }, []);

  const resolveCard = useCallback((cardId: string, resolution: CardResolution) => {
    setCards((list) => list.map((c) => (c.id === cardId ? { ...c, resolution } : c)));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      setError(null);
      setPartialArgs({});

      const structured = cardMode === 'structured';
      if (wireRef.current.length === 0) {
        wireRef.current.push({
          role: 'system',
          content: buildSystemPrompt(!structured) + (structured ? STRUCTURED_SYSTEM_SUFFIX : ''),
        });
      }
      wireRef.current.push({ role: 'user', content: text });
      chat.append({ id: newId(), role: 'user', content: text });

      const stream = chat.streamAssistant();
      // In structured mode the whole message is JSON, so it must NOT be appended
      // into the visible thread — buffer it, parse, then setText the prose.
      const buffered = structured ? bufferText(stream) : null;
      const sink = buffered ?? stream;

      const tools = toolsFor(cardMode);

      const acc: TurnStats = {
        rounds: 0,
        chunks: 0,
        reasoningChunks: 0,
        reasoningChars: 0,
        finishReason: null,
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
        acc.toolCallsSeen += turn.toolCalls.length;
        acc.toolCallsMalformed += turn.toolCalls.filter((c) => c.error).length;
        if (turn.usage) {
          acc.reasoningTokens = (acc.reasoningTokens ?? 0) + (turn.usage.reasoningTokens ?? 0);
          acc.promptTokens = (acc.promptTokens ?? 0) + (turn.usage.promptTokens ?? 0);
          acc.completionTokens = (acc.completionTokens ?? 0) + (turn.usage.completionTokens ?? 0);
          if (turn.usage.costUsd != null) acc.costUsd = (acc.costUsd ?? 0) + turn.usage.costUsd;
        }
        setStats({ ...acc });
      };

      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const chunks = await openChatStream({ messages: [...wireRef.current], tools, cardMode });
          const turn = await consumeModelStream(chunks, sink, {
            reasoningLabel: 'Thinking',
            onToolArgumentsDelta: (call) =>
              setPartialArgs((p) => ({ ...p, [call.id]: call.argumentsText })),
          });
          absorb(turn);

          if (turn.error) throw new Error(turn.error.message);

          const usable = turn.toolCalls.filter((c) => !c.error);
          wireRef.current.push(assistantWireMessage(turn));

          if (turn.toolCalls.length > 0 && usable.length === 0) {
            throw new Error('Every tool call the model emitted was malformed — see the tool panels.');
          }

          if (usable.length > 0) {
            for (const call of usable) {
              const run = runTool(call.name, call.input ?? {});
              applyToolOutput(sink, call.id, run.output);
              if (run.sources?.length) setSources((s) => [...s, ...run.sources!]);
              if (run.card) setCards((c) => [...c, run.card!]);
              wireRef.current.push(toolResultWireMessage(call, run.output));
            }
            continue; // another round: let the model answer with the results
          }

          // No tool calls left — this round produced the final answer.
          if (buffered) {
            const { value, error: schemaError } = parseReplyWithCard(buffered.buffered());
            if (schemaError || !value) {
              acc.structuredError = schemaError ?? 'unknown structured-output failure';
              setStats({ ...acc });
              // Show SOMETHING rather than an empty bubble.
              stream.setText(
                `The model's structured output did not match the card schema.\n\n> ${acc.structuredError}`,
              );
              wireRef.current.push({ role: 'assistant', content: buffered.buffered() });
            } else {
              stream.setText(value.reply);
              if (value.card) setCards((c) => [...c, value.card!]);
              wireRef.current.push({ role: 'assistant', content: value.reply });
            }
          }
          return;
        }
        throw new Error(`Stopped after ${MAX_ROUNDS} tool rounds without a final answer.`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        // Leave whatever streamed in place; just make the failure visible.
        if (!chat.messages.some((m) => m.id === stream.id && m.content)) {
          stream.setText(`_The request failed: ${message}_`);
        }
      } finally {
        stream.done();
      }
    },
    [chat, cardMode],
  );

  return { send, reset, sources, cards, resolveCard, partialArgs, error, stats };
}
