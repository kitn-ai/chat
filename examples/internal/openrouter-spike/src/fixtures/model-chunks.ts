// Handcrafted fixtures in OUR provider-neutral `ModelStreamChunk` shape — the
// adapter's actual input. They let the whole pipeline be proven with NO API key
// and NO network.
//
// The tool fixtures deliberately split `arguments` into fragments that are
// individually INVALID JSON; that is the real-world failure mode the adapter
// exists to absorb.
import type { ModelStreamChunk } from '../model-stream';

/** 1. The real thing: reasoning deltas, a text preamble, and ONE tool call whose
 *     arguments arrive as five fragments. */
export const TOOL_TURN: ModelStreamChunk[] = [
  { reasoning: 'The user wants weather. ' },
  { reasoning: 'I should call get_weather with city=Paris.' },
  { text: 'Let me check' },
  { text: ' Paris for you.' },
  // Opens with id + name and an empty argument string.
  { toolCalls: [{ index: 0, id: 'call_wx_001', name: 'get_weather', arguments: '' }] },
  // …then fragments. Later fragments carry NO id — only `index` correlates them.
  { toolCalls: [{ index: 0, arguments: '{"ci' }] },
  { toolCalls: [{ index: 0, arguments: 'ty":"Pa' }] },
  { toolCalls: [{ index: 0, arguments: 'ris","un' }] },
  { toolCalls: [{ index: 0, arguments: 'its":"me' }] },
  { toolCalls: [{ index: 0, arguments: 'tric"}' }] },
  { finishReason: 'tool_calls' },
  { usage: { promptTokens: 640, completionTokens: 71, totalTokens: 711, reasoningTokens: 38 } },
];

/** 2. TWO tool calls in one turn, fragments interleaved, and index 1's `id`
 *     arriving LATER than its first argument fragment. */
export const PARALLEL_TOOLS: ModelStreamChunk[] = [
  { toolCalls: [{ index: 0, id: 'call_a', name: 'search_docs', arguments: '' }] },
  { toolCalls: [{ index: 0, arguments: '{"que' }] },
  // index 1 opens with only a NAME — no id yet.
  { toolCalls: [{ index: 1, name: 'get_weather', arguments: '' }] },
  { toolCalls: [{ index: 1, arguments: '{"city' }] },
  { toolCalls: [{ index: 0, arguments: 'ry":"theming"}' }] },
  // …and the id shows up here.
  { toolCalls: [{ index: 1, id: 'call_b', arguments: '":"Tokyo"}' }] },
  { finishReason: 'tool_calls' },
];

/** 3. The arguments stream is CUT OFF — the model hit its token cap mid-JSON. */
export const TRUNCATED_ARGS: ModelStreamChunk[] = [
  { toolCalls: [{ index: 0, id: 'call_cut', name: 'propose_action', arguments: '' }] },
  { toolCalls: [{ index: 0, arguments: '{"title":"Deploy to prod' }] },
  { finishReason: 'length' },
];

/** 4. A provider error delivered in-band, after the response was already 200. */
export const MID_STREAM_ERROR: ModelStreamChunk[] = [
  { text: 'Checking' },
  { toolCalls: [{ index: 0, id: 'call_boom', name: 'get_weather', arguments: '{"city' }] },
  { error: { code: 'server_error', message: 'Upstream provider dropped the connection' }, finishReason: 'error' },
];

/** 5. A plain final answer (the second turn, after tool results go back). */
export const FINAL_TURN: ModelStreamChunk[] = [
  { text: "It's **12 °C**" },
  { text: ' and raining in Paris' },
  { text: ' — take a coat. ☔️' },
  { finishReason: 'stop' },
  { usage: { promptTokens: 812, completionTokens: 46, totalTokens: 858, reasoningTokens: 0, costUsd: 0.000_081 } },
];

/** 6. Reasoning that never streams as text: zero reasoning deltas, but a
 *     non-zero `reasoningTokens` on the final chunk. This is the case that
 *     decides whether `kai-reasoning` can render live or only post-hoc. */
export const HIDDEN_REASONING: ModelStreamChunk[] = [
  { text: 'The answer is 42.' },
  { finishReason: 'stop' },
  { usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28, reasoningTokens: 512 } },
];

/** 7. A structured-output turn: the whole message is JSON, streamed in slices. */
export const STRUCTURED_CARD_TURN: ModelStreamChunk[] = [
  { text: '{"reply":"I can redeploy stag' },
  { text: 'ing for you — confirm below.","card":{"type":"conf' },
  { text: 'irm","id":"card-1","title":"Redeploy staging","data":{"body":"This restarts' },
  { text: ' the staging service.","tone":"warning","dismissible":true,"actions":[{"id":"approve"' },
  { text: ',"label":"Redeploy","style":"primary"},{"id":"cancel","label":"Not now","style":"default"}]}}}' },
  { finishReason: 'stop' },
];

/** 8. Structured output that went off-schema (the graceful-failure case). */
export const STRUCTURED_BROKEN_TURN: ModelStreamChunk[] = [
  { text: 'Sure! Here is the card: {"reply": "oops", ' },
  { finishReason: 'stop' },
];

// ── Replay helpers ───────────────────────────────────────────────────────────

/** Yield chunks one at a time with a microtask gap, like a real stream. */
export async function* replay(chunks: ModelStreamChunk[]): AsyncGenerator<ModelStreamChunk> {
  for (const c of chunks) {
    await Promise.resolve();
    yield c;
  }
}

/** Re-encode chunks the way the dev proxy does, so a test can drive the FULL
 *  browser path: bytes → SSE frames → JSON → adapter. */
export function toSseText(chunks: ModelStreamChunk[]): string {
  return (
    ': OPENROUTER PROCESSING\n\n' +
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') +
    'data: [DONE]\n\n'
  );
}

/** The SSE text as UTF-8 byte chunks of `size` bytes — boundaries land mid-frame,
 *  mid-JSON and mid-codepoint, exactly like a socket. */
export async function* replayBytes(sse: string, size = 17): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(sse);
  for (let i = 0; i < bytes.length; i += size) {
    yield bytes.subarray(i, Math.min(i + size, bytes.length));
    await Promise.resolve();
  }
}

/** Same bytes as a WHATWG ReadableStream, for the `res.body` code path. */
export function replayReadable(sse: string, size = 17): ReadableStream<Uint8Array> {
  const iterator = replayBytes(sse, size)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}
