// OpenAI chat-completions SSE. Also the shape every non-mock integration in the
// kit's catalog re-frames to server-side, so this one decoder covers all nine.
//
// Input is an ALREADY DECODED JSON frame typed `unknown`. Nothing here imports a
// provider SDK, and nothing here throws: a frame this format does not recognise
// yields [] so a provider adding a field cannot take a turn down.
import type { MessageSource } from '../../elements/chat-types';
import type {
  ModelStreamChunk,
  ModelToolCallDelta,
  ModelUsage,
  WireFormat,
  WireFormatReader,
} from '../chunk';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function usageOf(raw: unknown): ModelUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const out: ModelUsage = {};
  const input = num(raw.prompt_tokens);
  if (input !== undefined) out.inputTokens = input;
  const output = num(raw.completion_tokens);
  if (output !== undefined) out.outputTokens = output;
  const total = num(raw.total_tokens);
  if (total !== undefined) out.totalTokens = total;
  const details = raw.completion_tokens_details;
  if (isRecord(details)) {
    // The one number that proves reasoning happened even when no reasoning text
    // was streamed back.
    const reasoning = num(details.reasoning_tokens);
    if (reasoning !== undefined) out.reasoningTokens = reasoning;
  }
  const promptDetails = raw.prompt_tokens_details;
  if (isRecord(promptDetails)) {
    const cached = num(promptDetails.cached_tokens);
    if (cached !== undefined) out.cachedInputTokens = cached;
  }
  const cost = num(raw.cost);
  if (cost !== undefined) out.costUsd = cost;
  return Object.keys(out).length > 0 ? out : undefined;
}

function toolCallDelta(raw: unknown, position: number): ModelToolCallDelta | undefined {
  if (!isRecord(raw)) return undefined;
  const fn = isRecord(raw.function) ? raw.function : undefined;
  const out: ModelToolCallDelta = { index: num(raw.index) ?? position };
  const id = str(raw.id);
  if (id) out.id = id;
  const name = str(fn?.name);
  if (name) out.name = name;
  const args = str(fn?.arguments);
  if (args !== undefined) out.arguments = args;
  return out;
}

/** Sum the READABLE text across reasoning_details entries. Entries with no
 *  readable text (`reasoning.encrypted`, opaque signed blobs) contribute nothing
 *  here; they still ride along whole in `reasoningRaw`. */
function detailText(details: unknown[]): string {
  let out = '';
  for (const d of details) {
    if (!isRecord(d)) continue;
    const text = str(d.text) ?? str(d.summary);
    if (text) out += text;
  }
  return out;
}

function detailField(details: unknown[], key: 'index' | 'signature'): unknown {
  for (const d of details) {
    if (isRecord(d) && d[key] !== undefined) return d[key];
  }
  return undefined;
}

/**
 * FINDINGS: OpenRouter frequently puts the SAME text in `reasoning` AND in
 * `reasoning_details` on the same delta. Concatenating both doubles every
 * reasoning token, so `reasoning` wins and details are only a text FALLBACK.
 *
 * `reasoning_details` is still read in BOTH cases, for `reasoningRaw`, the block
 * index and the signature. It is the provider's own block list, and dropping it
 * is exactly the Anthropic 400 this entry exists to avoid.
 */
function applyReasoning(delta: Record<string, unknown>, out: ModelStreamChunk): void {
  const details = Array.isArray(delta.reasoning_details) ? delta.reasoning_details : undefined;
  const primaryRaw = str(delta.reasoning);
  const primary = primaryRaw !== undefined && primaryRaw !== '' ? primaryRaw : undefined;
  const fallback = details ? detailText(details) : undefined;
  const hasDetails = details !== undefined && details.length > 0;
  const text = primary ?? fallback;
  if (text === undefined && !hasDetails) return;

  // '' is deliberate and meaningful: an encrypted-only detail entry has no
  // readable text but must still produce a reasoning part carrying its payload.
  out.reasoning = text ?? '';
  if (!hasDetails) return;

  out.reasoningRaw = { source: 'openai.reasoning_details', payload: details };
  const index = num(detailField(details, 'index'));
  if (index !== undefined) out.reasoningIndex = index;
  const signature = str(detailField(details, 'signature'));
  if (signature !== undefined) out.reasoningSignature = signature;
}

function sourcesOf(delta: Record<string, unknown>): MessageSource[] {
  if (!Array.isArray(delta.annotations)) return [];
  const out: MessageSource[] = [];
  for (const a of delta.annotations) {
    if (!isRecord(a)) continue;
    const citation = isRecord(a.url_citation) ? a.url_citation : undefined;
    const url = str(citation?.url);
    if (!url) continue;
    const source: MessageSource = { url };
    const title = str(citation?.title);
    if (title) source.title = title;
    const snippet = str(citation?.content);
    if (snippet) source.snippet = snippet;
    out.push(source);
  }
  return out;
}

function pushOpenAI(frame: unknown): ModelStreamChunk[] {
  if (!isRecord(frame)) return [];
  const out: ModelStreamChunk = {};

  const err = frame.error;
  if (isRecord(err)) {
    const message = str(err.message);
    if (message) {
      out.error = { message };
      const code = err.code;
      if (typeof code === 'string' || typeof code === 'number') out.error.code = code;
    }
  }

  const usage = usageOf(frame.usage);
  if (usage) out.usage = usage;

  const choices = Array.isArray(frame.choices) ? frame.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : undefined;
  if (choice) {
    const delta = isRecord(choice.delta) ? choice.delta : undefined;
    if (delta) {
      const content = str(delta.content);
      if (content) out.text = content;

      applyReasoning(delta, out);

      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
        const calls = delta.tool_calls
          .map((raw, i) => toolCallDelta(raw, i))
          .filter((c): c is ModelToolCallDelta => c !== undefined);
        if (calls.length > 0) out.toolCalls = calls;
      }

      const sources = sourcesOf(delta);
      if (sources.length > 0) out.sources = sources;
    }
    const finish = str(choice.finish_reason);
    if (finish) out.finishReason = finish;
  }

  return Object.keys(out).length > 0 ? [out] : [];
}

/** Stateless: every frame is self-describing, so `open()` returns a reader with
 *  no closure state. The interface still calls it per stream, which is what lets
 *  the stateful Anthropic format use the same seam. */
export const openaiChatFormat: WireFormat = {
  id: 'openai.chat-completions',
  open(): WireFormatReader {
    return { push: pushOpenAI };
  },
};
