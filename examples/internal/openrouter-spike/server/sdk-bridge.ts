// The THIN provider layer: @openrouter/sdk shapes ⇄ our provider-neutral shapes.
//
// This is the only file that knows @openrouter/sdk exists, and it runs
// SERVER-SIDE ONLY (the Vite dev proxy imports it; nothing under src/ does).
// `src/model-stream.ts` never sees an SDK type, which is what keeps it
// mergeable into `@kitn.ai/ui`: the kit must not depend on a provider SDK.
//
// Verified against the INSTALLED @openrouter/sdk 1.2.11:
//   · `chat.send({ chatRequest: { … } })`: the payload IS nested under
//     `chatRequest`. The README's flat form is wrong for this version.
//   · streaming `chat.send` resolves to `EventStream<ChatStreamChunk>`: the
//     chat-completions delta surface, NOT the Responses-style
//     `response.function_call_arguments.delta` events (those belong to
//     `betaResponses.send`).
//   · every field is camelCase: `toolCalls`, `toolCallId`, `finishReason`,
//     `reasoningDetails`, `maxTokens`, `toolChoice`, `responseFormat`.
import type {
  ChatMessages,
  ChatStreamChunk,
  ChatStreamDelta,
  ChatStreamToolCall,
  ReasoningDetailUnion,
} from '@openrouter/sdk/models';
import type { ModelStreamChunk, ModelToolCallDelta, ModelUsage, WireMessage } from '../src/model-stream';

/**
 * Pull reasoning text out of a delta. OpenRouter emits reasoning two ways and
 * often BOTH in the same delta, so `reasoning` wins and `reasoningDetails` is
 * only a fallback; otherwise every token is appended twice.
 *
 * Detail entries with no readable text (`reasoning.encrypted`, and the opaque
 * signed-thinking blobs) are skipped: there is nothing to show and the kit's
 * `appendReasoning` takes a plain string.
 */
export function reasoningTextOf(delta: ChatStreamDelta): string {
  if (typeof delta.reasoning === 'string' && delta.reasoning) return delta.reasoning;
  const details: ReasoningDetailUnion[] | undefined = delta.reasoningDetails;
  if (!Array.isArray(details)) return '';
  let out = '';
  for (const d of details) {
    if (!d || typeof d !== 'object') continue;
    if ('text' in d && typeof d.text === 'string') out += d.text;
    else if ('summary' in d && typeof d.summary === 'string') out += d.summary;
  }
  return out;
}

/**
 * The provider's BLOCK index for this delta's reasoning, when it reports one.
 *
 * OpenRouter's `reasoningDetails` entries carry an optional `index`; the plain
 * `delta.reasoning` string carries none, so that path degrades to block 0. The
 * first entry that declares an index wins, matching `reasoningTextOf`'s
 * left-to-right read of the same array.
 */
export function reasoningIndexOf(delta: ChatStreamDelta): number | undefined {
  const details: ReasoningDetailUnion[] | undefined = delta.reasoningDetails;
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    if (d && typeof d === 'object' && 'index' in d && typeof d.index === 'number') return d.index;
  }
  return undefined;
}

function toolCallDelta(tc: ChatStreamToolCall): ModelToolCallDelta {
  return {
    index: tc.index,
    ...(tc.id ? { id: tc.id } : {}),
    ...(tc.function?.name ? { name: tc.function.name } : {}),
    ...(typeof tc.function?.arguments === 'string' ? { arguments: tc.function.arguments } : {}),
  };
}

function usageOf(chunk: ChatStreamChunk): ModelUsage | undefined {
  const u = chunk.usage;
  if (!u) return undefined;
  return {
    promptTokens: u.promptTokens,
    completionTokens: u.completionTokens,
    totalTokens: u.totalTokens,
    // The one number that proves reasoning happened even when no reasoning text
    // was streamed back.
    ...(u.completionTokensDetails?.reasoningTokens != null
      ? { reasoningTokens: u.completionTokensDetails.reasoningTokens }
      : {}),
    ...(u.cost != null ? { costUsd: u.cost } : {}),
  };
}

/** SDK streaming chunk → our provider-neutral chunk. Returns `null` for chunks
 *  that carry nothing the kit cares about (pure keep-alive/role-only frames). */
export function toModelChunk(chunk: ChatStreamChunk): ModelStreamChunk | null {
  const out: ModelStreamChunk = {};

  if (chunk.error) {
    out.error = { code: chunk.error.code, message: chunk.error.message };
  }

  const usage = usageOf(chunk);
  if (usage) out.usage = usage;

  const choice = chunk.choices?.[0];
  if (choice) {
    const delta = choice.delta;
    if (typeof delta?.content === 'string' && delta.content) out.text = delta.content;

    const reasoning = delta ? reasoningTextOf(delta) : '';
    if (reasoning) {
      out.reasoning = reasoning;
      // Keeps parallel reasoning blocks distinct downstream. Absent means block 0.
      const reasoningIndex = delta ? reasoningIndexOf(delta) : undefined;
      if (reasoningIndex !== undefined) out.reasoningIndex = reasoningIndex;
      // The ROUND-TRIP channel. `reasoningDetails` is the provider's own block
      // list, opaque entries (`reasoning.encrypted`, signed thinking blobs)
      // included. Anthropic-backed models return 400 if a thinking block is
      // rebuilt from text + signature rather than echoed verbatim, so the
      // untranslated array rides along and the adapter pins it to the reasoning
      // part as `raw`. `delta.reasoning` alone carries no such payload, so a
      // plain-string reasoning delta gets no `raw`: there is nothing to attach.
      if (Array.isArray(delta?.reasoningDetails) && delta.reasoningDetails.length > 0) {
        out.reasoningRaw = { source: 'openrouter.reasoning_details', payload: delta.reasoningDetails };
      }
    }

    if (Array.isArray(delta?.toolCalls) && delta.toolCalls.length > 0) {
      out.toolCalls = delta.toolCalls.map(toolCallDelta);
    }

    if (choice.finishReason) out.finishReason = choice.finishReason;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** Our neutral wire messages → the SDK's `ChatMessages` union (camelCase). */
export function toSdkMessages(wire: WireMessage[]): ChatMessages[] {
  const out: ChatMessages[] = [];
  for (const m of wire) {
    switch (m.role) {
      case 'system':
        out.push({ role: 'system', content: m.content ?? '' });
        break;
      case 'user':
        out.push({ role: 'user', content: m.content ?? '' });
        break;
      case 'tool':
        out.push({ role: 'tool', toolCallId: m.toolCallId ?? '', content: m.content ?? '' });
        break;
      case 'assistant':
        out.push({
          role: 'assistant',
          content: m.content,
          ...(m.toolCalls?.length
            ? {
                toolCalls: m.toolCalls.map((c) => ({
                  id: c.id,
                  type: 'function' as const,
                  function: { name: c.name, arguments: c.arguments },
                })),
              }
            : {}),
        });
        break;
    }
  }
  return out;
}
