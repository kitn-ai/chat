/**
 * One assistant turn: POST the thread, read the reply, fold it onto the message.
 *
 * The kit parses and the consumer fetches. This module fetches from our own
 * `/api/chat` and hands the response straight to `readOpenAIStream` — there is
 * no hand-rolled SSE reader here, because every edge case in one (keep-alive
 * comments, multi-line frames, a codepoint split across chunks, tool-call
 * fragments arriving out of order) is already solved in `@kitn.ai/ui/wire`.
 */
import { createAssistantStream } from '@kitn.ai/ui/state';
import type { CardEnvelope, ChatMessage } from '@kitn.ai/ui/state';
import type { AssistantStreamSink } from '@kitn.ai/ui/wire';
import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';
import { cardFromToolCall, isCardTool } from '@kitn.ai/ui/schemas';
import { cards } from '../shared/cards';
import type { SetMessages } from './card-store';

export interface TurnOptions {
  /** Drives a specific scripted turn instead of matching on the prompt text. */
  intent?: string;
  params?: Record<string, unknown>;
}

export interface TurnResult {
  /** Card envelopes this turn produced, in emission order. */
  cards: CardEnvelope[];
  error?: string;
}

/**
 * Wrap the stream so CARD tool calls do not also render as tool panels.
 *
 * A card tool call is not a tool the console executes — it IS the card, and
 * `onToolCallReady` turns it into one. Left alone, the accumulator would also
 * push a `<kai-tool>` panel for the same call and every proposal would render
 * twice: once as a collapsed "kai_confirm" panel and once as the card. Tools
 * the app really does run are deliberately NOT suppressed; an ops console
 * should show its own work.
 *
 * The name arrives on the announce patch (`patch.type`), which is the first
 * moment the id can be classified, so the id is remembered from there on.
 */
function cardAwareSink(stream: ReturnType<typeof createAssistantStream>): AssistantStreamSink {
  const cardCallIds = new Set<string>();
  return {
    appendText: (delta) => stream.appendText(delta),
    appendReasoning: (delta, opts) => stream.appendReasoning(delta, opts),
    addSource: (source) => stream.addSource(source),
    upsertTool: (toolCallId, patch) => {
      if (typeof patch.type === 'string' && isCardTool(patch.type)) cardCallIds.add(toolCallId);
      if (cardCallIds.has(toolCallId)) return;
      return stream.upsertTool(toolCallId, patch);
    },
  };
}

export async function runTurn(
  setMessages: SetMessages,
  history: ChatMessage[],
  options: TurnOptions = {},
): Promise<TurnResult> {
  const stream = createAssistantStream(setMessages);
  const emitted: CardEnvelope[] = [];

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: toOpenAIMessages(history),
        intent: options.intent,
        params: options.params,
      }),
    });

    const turn = await readOpenAIStream(response, cardAwareSink(stream), {
      traceId: options.intent ?? 'operator-turn',
      onToolCallReady: (call) => {
        if (!isCardTool(call.name)) return;
        // `tool_call_id` becomes `CardEnvelope.id` UNCHANGED — that is what makes
        // a re-sent call revise the card in place instead of drawing a second one.
        const envelope = cardFromToolCall(call.name, call.input, { id: call.id });
        if (!envelope) return;
        const report = cards.validate(envelope.type, envelope.data);
        if (report && !report.ok) {
          // The card renderer will draw its own diagnostic; this is for whoever
          // has to fix the producer.
          console.warn(`[assistant] ${envelope.type} card failed validation: ${report.summary}`);
        }
        emitted.push(envelope);
        stream.addCard(envelope);
      },
    });

    if (turn.error) return { cards: emitted, error: turn.error.message };
    return { cards: emitted };
  } catch (error) {
    // Without this a failed request is a permanently blank assistant bubble plus
    // an unhandled rejection. abort() puts the reason in the thread, where the
    // operator can actually read it.
    const reason = error instanceof Error && error.message ? error.message : 'The assistant is unreachable.';
    stream.abort(reason);
    console.error('[assistant]', error);
    return { cards: emitted, error: reason };
  } finally {
    // done() SETTLES the message: every mutation after it is dropped, which is
    // why the whole loop runs above it.
    stream.done();
  }
}
