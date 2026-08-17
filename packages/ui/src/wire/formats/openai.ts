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

/** The sibling reasoning STRINGS, in precedence order. See `applyReasoning`. */
const REASONING_KEYS = ['reasoning', 'reasoning_content'] as const;

/** First non-empty sibling string wins. These are alternative SPELLINGS of the
 *  same text, never two halves of it, so this coalesces and never concatenates. */
function siblingReasoning(delta: Record<string, unknown>): string | undefined {
  for (const key of REASONING_KEYS) {
    const raw = str(delta[key]);
    if (raw !== undefined && raw !== '') return raw;
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
 *
 * SIBLING NAMES. Chat-completions says nothing about reasoning, so every vendor
 * extended it on its own and each parser in the wild reads a different subset:
 * `reasoning` is what OpenRouter normalises to, `reasoning_content` is what
 * DeepSeek's own API emits and what LiteLLM forwards. Nobody is ahead here and
 * there is no canonical spelling. A stream that only ever went through
 * OpenRouter never shows the other name, which is the whole reason this one
 * stayed invisible: reading `reasoning` alone loses a DeepSeek-direct stream's
 * reasoning completely, and silently.
 *
 * PRECEDENCE. The siblings coalesce, first non-empty wins, and both outrank the
 * details text. `reasoning` is checked first, which is what keeps this additive:
 * any stream that already carried `reasoning` parses byte for byte as it did
 * before, so the order is only observable on a provider that disagrees with
 * itself. A gateway that aliases one spelling onto the other sends identical
 * text in both, and summing them would double every token exactly the way
 * summing `reasoning` and `reasoning_details` does.
 *
 * SCOPE, and it is NOT a closed class. This covers the NAMING axis only.
 * Reasoning on this wire is fragmented three ways STRUCTURALLY: a sibling string
 * (here), a block array (`reasoning_details`), and reasoning carried inside a
 * polymorphic `content` array. Aliasing bridges names, not shapes. A fourth
 * spelling is one entry in REASONING_KEYS; a fourth SHAPE is not, and needs its
 * own branch plus its own fixture.
 */
function applyReasoning(delta: Record<string, unknown>, out: ModelStreamChunk): void {
  const details = Array.isArray(delta.reasoning_details) ? delta.reasoning_details : undefined;
  const primary = siblingReasoning(delta);
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

  // Stated per frame and reported per frame, no dedupe: a stream that changes
  // its mind mid-turn is a finding, and collapsing it would hide one.
  const model = str(frame.model);
  if (model) out.model = model;

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
