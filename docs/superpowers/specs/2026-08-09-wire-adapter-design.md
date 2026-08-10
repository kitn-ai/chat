# Wire adapter - design

Date: 2026-08-09
Status: DESIGN, decisions ruled. Nothing implemented.
Scope: sub-project **C** of the model-driven components epic.

Depends on **A** (`2026-08-07-message-parts-data-model-design.md`), landed on
`feat/message-parts`: `MessagePart`, `RawOrigin`, `ToolPart.rawInput`,
`classifyTool`, and the part-oriented `createAssistantStream`.

## Summary

Ship the model-stream adapter inside `@kitn.ai/ui` as a new `./wire` entry, so a
developer goes from `fetch('/api/chat')` to a populated `AssistantStream` in one
call and gets tool panels, reasoning and cards without writing a parser.

Two wire formats in v1: OpenAI chat completions SSE and Anthropic Messages SSE.
Formats are pluggable values, not a flag. **The kit parses the stream. The consumer
owns the transport.**

Most of the OpenRouter spike moves nearly as-is. One part needs rework before it
can ship: the reasoning path drops exactly the payloads Anthropic requires back
verbatim.

## Why now

**1. The parser is the last hand-written piece.** A shipped the content model.
Nothing in the package produces it from a model. The scaffolder emits five copies
of a reader that reads `delta.content` and nothing else, so a scaffolded app with
`kai-tool` in its archetype renders a tool panel no code path can populate.

**2. The reference implementation exists and is proven.** The spike's
`model-stream.ts` was written to be lifted: one runtime import from the kit, one
type. 40 passing tests, driven against a live model. The provider mapping is
quarantined in `sdk-bridge.ts`, the only file importing `@openrouter/sdk`.

**3. `raw` is currently untested machinery.** A made `raw.payload` the round-trip
channel because Anthropic returns 400 on reconstructed `thinking` blocks. Nothing
in the repo produces a `raw` from a real Anthropic stream, so the guarantee rests
on a hand-written fixture. C makes it real or reveals it was wrong.

**4. The integration catalog already converged on one format.** All 9 integrations
except `mock` re-frame to `data: {choices:[{delta:{content}}]}` server-side. One
decoder covers all nine.

## Decisions

| Decision | Ruling | Rationale |
|---|---|---|
| New `@kitn.ai/ui/wire` entry vs folding into `./state` | **Separate entry** | `state` is I/O-free pure functions over `ChatMessage[]`. `wire` touches `Response`, `TextDecoder`, byte streams. Keeps the bring-your-own-transport consumer at zero cost and gives AG-UI an obvious home. Costs ~2 KB duplication. |
| Anthropic Messages in v1 | **Yes** | It roughly doubles scope, but without it `raw` ships as machinery no producer exercises and the round-trip guarantee stays a hand-written fixture. It is also the only format carrying a verbatim requirement. |
| Scaffolder imports the adapter vs keeps inlining | **Import for real backends, inline only for `mock`** | `scaffold.ts:142` states inlining as deliberate policy. This is a deliberate policy change: importing is the only way scaffolded apps get tools and reasoning, and the inline reader has real bugs (multi-line frames, split codepoints). Mock stays inline so a zero-backend preview adds zero imports. |
| Pluggable `WireFormat` values, plus named readers | Ruled | A flag grows a closed union nobody outside the repo can extend. Separate hand-written readers duplicate the accumulator, which is the hard part. A value with `open()/push()` gives one accumulator, named exports for the common path, and a third-party seam needing no PR. |
| The kit parses, the consumer fetches | Ruled | Auth, proxies, retries, aborts and rate limits are app decisions. `Response \| ReadableStream \| AsyncIterable` is the whole transport surface. |
| SSE framing ships | Ruled | Handles keep-alive comments, multi-line frames, codepoints split across socket boundaries. Every hand-rolled reader in this repo gets at least one wrong. 95 lines, not optional correctness. |
| `reasoningRaw` decoupled from reasoning text | Ruled | The single change that makes Anthropic work. See rework item 1. |
| `rawInput` per fragment, `input` only on a whole valid parse | Ruled | `ToolPart.input` is `Record<string, unknown>`; a JSON prefix is not one. `rawInput` is the honest character-level channel. |
| `finishReason` verbatim, normalized `stopReason` beside it | Ruled | The spike branches on OpenAI's `'length'`; Anthropic says `max_tokens`. Normalizing in place destroys information consumers branch on. |
| Provider-executed tool results are a chunk field | Ruled | Anthropic `web_search_tool_result` and OpenAI built-ins return outputs in-stream. With no channel those panels sit at `input-available` forever. |
| Fixtures are captured raw SSE, replayed at five byte-boundary sizes | Ruled | The spike's approach. No key, no network in CI. The byte-boundary sweep caught the split-codepoint bug class. |
| The spike's proxy forwards raw upstream SSE; `sdk-bridge.ts` is deleted | Ruled | Every integration template already does exactly that. Also removes `@openrouter/sdk` from the repo. |

## The API

```
packages/ui/src/wire/
  chunk.ts              provider-neutral chunk types
  consume.ts            consumeModelStream + tool-call accumulator + parts recorder
  sse.ts                sseDataFrames / sseJson / readableToAsyncIterable
  formats/openai.ts     openaiChatFormat
  formats/anthropic.ts  anthropicMessagesFormat
  encode.ts             toOpenAIMessages / toAnthropicMessages
  index.ts              barrel
```

### The neutral chunk

```ts
export interface ModelStreamChunk {
  text?: string;
  /** Reasoning delta. `''` is MEANINGFUL: a redacted block has no readable text
   *  but still carries a payload that must round-trip. */
  reasoning?: string;
  reasoningIndex?: number;
  /** Valid on a chunk with NO reasoning text at all. */
  reasoningRaw?: RawOrigin;
  reasoningSignature?: string;
  toolCalls?: ModelToolCallDelta[];
  sources?: Source[];
  /** Provider verbatim: 'stop' | 'tool_calls' | 'end_turn' | 'max_tokens' | ... */
  finishReason?: string | null;
  usage?: ModelUsage;
  error?: { code?: string | number; message: string };
}

export interface ModelToolCallDelta {
  /** The ONLY thing correlating fragments. Namespace is FORMAT-DEFINED: OpenAI
   *  uses the tool_calls array index, Anthropic the content-block index. */
  index: number;
  id?: string;
  name?: string;
  /** A FRAGMENT of the JSON arguments string, not valid JSON on its own. */
  arguments?: string;
  /** A result the PROVIDER executed. Completes the panel with no host work. */
  output?: Record<string, unknown>;
  outputError?: string;
}
```

### Formats

```ts
export interface WireFormat {
  readonly id: string;
  /** Called once per stream so a format can hold per-stream state. */
  open(): { push(frame: unknown): ModelStreamChunk[] };
}

export const openaiChatFormat: WireFormat;
export const anthropicMessagesFormat: WireFormat;
```

`push` returns an array because the mapping is not one-to-one: an Anthropic
`message_start` yields usage, a `content_block_start` for `tool_use` yields an
id-plus-name delta, a `ping` yields nothing.

Anthropic needs state and OpenAI does not. `content_block_delta` says
`thinking_delta` or `input_json_delta` but not which block a fragment belongs to,
so the format keeps a `Map<index, BlockState>` populated at `content_block_start`
and emits the assembled block as `reasoningRaw` at `content_block_stop`. **That
final emit carries no text**, which is why the reasoning guard must move.

### Reading

```ts
export type StreamSource =
  | Response | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string>;

export function readModelStream(
  source: StreamSource, sink: AssistantStreamSink,
  opts: ConsumeOptions & { format: WireFormat },
): Promise<ModelTurn>;

export function readOpenAIStream(s: StreamSource, sink: AssistantStreamSink, o?: ConsumeOptions): Promise<ModelTurn>;
export function readAnthropicStream(s: StreamSource, sink: AssistantStreamSink, o?: ConsumeOptions): Promise<ModelTurn>;

/** Escape hatch for a consumer who already has neutral chunks. */
export function consumeModelStream(
  chunks: AsyncIterable<ModelStreamChunk>, sink: AssistantStreamSink, opts?: ConsumeOptions,
): Promise<ModelTurn>;
```

A non-ok `Response` throws `WireError` carrying `status`, `statusText` and the
provider's parsed error body when there is one.

### Encoding back

```ts
export function toOpenAIMessages(messages: ChatMessage[]): OpenAIWireMessage[];
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicWireMessage[];
```

`toAnthropicMessages` is the round-trip encoder. Contract:

- A reasoning part is emitted as `part.raw.payload` **verbatim**, never rebuilt
  from `text` plus `signature`.
- A reasoning part with **no `raw` throws**. Silently reconstructing it is the
  documented 400 condition; a throw at encode time beats a 400 at request time.
- Block order follows part order. No filtering.
- A tool part echoes the provider `toolCallId`, never a synthesised `call_N`.

`toOpenAIMessages` has no such constraint, but uses the raw accumulated argument
text rather than `JSON.stringify(input)` so key order and whitespace survive.

### Smallest React consumer

```tsx
const chat = useKaiChat({
  onSubmit: async ({ value }) => {
    const user = { id: crypto.randomUUID(), role: 'user' as const, parts: [{ type: 'text' as const, text: value }] };
    chat.append(user);
    const stream = chat.streamAssistant();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: toOpenAIMessages([...chat.messages, user]) }),
      });
      await readOpenAIStream(res, stream);
    } finally { stream.done(); }
  },
});
```

Four lines are the adapter. The rest is `fetch` and React.

## What ships

Adapter core (`consumeModelStream`, tool-call accumulator, parts recorder, sink
tee, `bufferText`, `applyToolOutput`, `applyToolFailure`) · SSE framing · both
formats · named readers over `StreamSource` including the `Response` error path ·
both encoders · the exported `WireFormat` interface.

## What does NOT ship

- **Any provider SDK.** Non-negotiable. Formats read decoded JSON frames.
- **A URL-taking client.** No `createChatClient({ apiKey })`.
- **Retries, reconnect, `Last-Event-ID`, backoff.** FINDINGS lists retry as
  untested, and untested retry logic is worse than none.
- **A tool executor or the multi-round loop.** The kit never calls a consumer's
  function. Encoder helpers make the loop ~15 lines, in the app.
- **Server-side route helpers.** The integration catalog covers it.
- **Non-SSE transports.** WebSocket and NDJSON fit `WireFormat` later.
- **A tolerant partial-JSON closer** for progressive tool `input`.

### Formats considered and excluded

- **Vercel AI SDK UI message stream.** The kit's own template re-frames to OpenAI
  server-side, so nobody is blocked. The protocol churned across v3/v4/v5;
  shipping it means tracking someone else's UI protocol in a component library.
- **OpenAI Responses API.** Strongest v1.1 candidate, genuinely different event
  surface, no catalog integration uses it.
- **Gemini `streamGenerateContent`.** Not SSE by default; Gemini ships an
  OpenAI-compatible endpoint.
- **AG-UI.** A different layer (card state patches over JSON Patch). Becomes a
  `WireFormat` when it lands; this is why the entry is `wire`, not `sse`.

## What in the spike needs rework, not a move

**1. Reasoning payloads dropped when text is empty (BLOCKING).**
`model-stream.ts:376` guards the whole reasoning branch on `if (chunk.reasoning)`,
falsy for `''`. Two Anthropic cases fall through: a `redacted_thinking` block
(opaque blob, no readable text; the docs require sending back "including any
blocks with empty `thinking` fields"), and the assembled block emitted at
`content_block_stop` after `signature_delta`. Both are exactly the payloads `raw`
exists to preserve. Gate on
`chunk.reasoning !== undefined || chunk.reasoningRaw || chunk.reasoningSignature`,
append `chunk.reasoning ?? ''`, count `reasoningChunks` only for non-empty text.
Consequence: `message.tsx:375` renders every reasoning part, so an empty-text part
would show a blank disclosure. One-line guard; the part STAYS in `parts` because
the encoder needs it in order.

**2. Tool `input` only computed at settle.** Nothing is written between announce
and stream end, which is why `input-streaming` means "we know nothing". Write
`rawInput` per fragment and attempt a parse each time, promoting to `input` plus
`input-available` on a whole valid object. Honest caveat: with plain `JSON.parse`
a prefix never parses, so `input` still lands once, at the end. `rawInput` is what
streams.

**3. `finishReason` carries an OpenAI literal into adapter logic.** Add a
normalized `ModelTurn.stopReason`, keep `finishReason` verbatim, branch internally
on `stopReason`.

**4. `rawInput` fingerprinting is quadratic.** `upsertToolPart` fingerprints the
whole merged tool per patch, walking the growing argument string per delta. Fine
at 4 KB, not at 200 KB. Fingerprint only `input`/`output` structurally; compare
the rest by `===`.

## Is the neutral chunk secretly OpenAI-shaped?

Mostly no. `ModelToolCallDelta` correlating by `index` maps cleanly onto
Anthropic's content-block index. Reasoning and tools live in separate part
namespaces, so Anthropic's shared index namespace causes no collision.

Three leaks: the reasoning-guard control-flow bug (blocking, rework 1), the
`finishReason` vocabulary (rework 3), and `ModelUsage` field names reading
OpenAI-ish (cosmetic, a lossless rename). Two genuine gaps, both added above: no
channel for provider-executed tool results, and none for citations. Neither
existed because the spike drove one model over one format.

## Testing

**L1 neutral chunk fixtures.** Port the spike's eight arrays verbatim, plus an
Anthropic redacted-thinking turn and a provider-executed tool result. Tests
`consumeModelStream` with no format involved.

**L2 captured wire fixtures.** Raw SSE, keys redacted, checked in, each headed
with model id, capture date and the request body that produced it. Provenance in
the file is what makes a fixture trustworthy.

Required OpenAI captures: text only; fragmented tool arguments; two parallel tool
calls with a late `id`; `finish_reason: length` mid-arguments; an in-band `error`
after a 200; reasoning arriving as `reasoning` AND `reasoning_details` in the same
delta (the doubling trap FINDINGS documented); a usage-only final chunk;
`: OPENROUTER PROCESSING` keep-alives.

Required Anthropic captures: a full `thinking` block through `signature_delta` and
`content_block_stop`; a `tool_use` block through `input_json_delta`;
`message_delta` with `stop_reason: tool_use`; a `redacted_thinking` block; a
`thinking` block with empty text; an `event: error` frame mid-stream.

A `scripts/capture-wire-fixture.mjs` regenerates these from a key in env, never
run by CI.

**L3 byte-boundary replay.** Every L2 fixture replays at byte-chunk sizes 1, 3,
17, 64 and 4096, through both `AsyncIterable` and `ReadableStream`, asserting the
resulting `parts` are deep-equal across all ten runs.

**Round-trip fidelity** (the test that guards the 400): replay the Anthropic
thinking-plus-tool fixture, run `toAnthropicMessages`, then assert every
`thinking`/`redacted_thinking` block is byte-identical to the fixture's, block
order matches, block count in equals count out (including the empty-text block),
`tool_use` blocks carry the provider id, and a reasoning part with no `raw` makes
the encoder throw.

Plus: reference stability, format isolation (unrecognized frame ignored not
thrown), format statefulness (two `open()` calls share nothing), an SSR smoke
import with `globalThis.window` deleted, and `WireError` on both a JSON and an
HTML 4xx body.

## Migration surface

**New:** `packages/ui/src/wire/**` · `vite.config.wire.ts` in the build chain
after `state`, `emptyOutDir: false` · `./wire` in `exports`.

**Changed:** `state/parts.ts` fingerprint fast path · `components/message.tsx:375`
empty-reasoning guard · the scaffolder (below) · the nine integration
`streamMapping` strings, which currently claim "kai-chat's SSE reader handles it",
a thing that does not exist · `README.md` around the hand-rolled reader · the docs
streaming recipe and the six integration pages showing a reader.

**Scaffolder, scoped.** Six emit sites: `htmlWiring`, `renderJsx` (react+next),
`renderVue`, `renderSvelte`, `renderTanstackStart`, `mockStreamBody`. Real-backend
sites drop the 25-line inline reader for `await readOpenAIStream(res, stream)`.
`PARTS_TO_CONTENT` is replaced by `toOpenAIMessages(history)` (today the
scaffolder throws away tool calls and results on the way back, making a multi-round
loop impossible). `appendTextHelper` stays for `mockStreamBody` only. Archetypes
including `kai-tool` get the tool array in the request body and the round-trip loop
emitted as a COMMENTED block, not live code.

**Starters: no change.** Verified by grep. None of the eight read an SSE stream;
all are canned or mock. The hand-rolling lives in the scaffolder, the docs and the
spike.

**The spike.** Delete `model-stream.ts`, `sse-frames.ts`, `sdk-bridge.ts` and
their tests; content and fixtures move into `packages/ui/src/wire/`. The proxy
forwards raw upstream SSE. `transport.ts` shrinks to a fetch plus a reader call.
`useSpikeChat.ts` keeps its tool loop, drops `partialArgs` for `ToolPart.rawInput`,
drops the sources and cards trays now that A gave both a part. **Keep the spike**;
it is the only live smoke test against a real model.

## Non-goals

Retries and reconnect · a tool executor or loop driver · key handling or a hosted
client · server-side route helpers · AG-UI · non-SSE transports · a tolerant
partial-JSON closer · the citation row renderer (C ships the `sources` channel, D
renders it) · any change to the structured-outputs recommendation.

## Open questions and risks

- **Reference identity is fragile in a way our test may over-assert.** The A
  round-trip test asserts `toBe` on `raw.payload`. Anything that clones a message
  (persistence, `structuredClone`, JSON transport) breaks identity while preserving
  bytes, and the provider compares bytes. Production assertions should be
  `JSON.stringify` equality; reserve `toBe` for synchronous paths.
- **`raw` roughly doubles message size, and C is what fills it.** Consider
  `ConsumeOptions.keepRaw?: 'all' | 'reasoning' | 'none'` defaulting to `'all'`.
- **`ModelToolCallDelta.index` means different things per format.** Correct either
  way, but a third-party format author will assume the wrong one. Document it on
  the field.
- **The `WireFormat` seam is unproven by a third party.** Two formats by the same
  author is weak evidence the interface generalizes. AG-UI is the real test.
- **Anthropic support is designed, not measured.** The OpenAI path carries a live
  measurement; the Anthropic path is read off the docs and validated by captured
  fixtures. Expect one revision after the first real capture, particularly around
  `signature_delta` timing and `redacted_thinking` shape.
- **FINDINGS' untested list still stands** and C does not close it: long-running
  streams, rate limits, retries, non-Chromium browsers, and any model other than
  `~deepseek/deepseek-v4-flash-latest`.
- **Bundle duplication.** `wire` imports `state/parts.ts`, so importing both
  entries ships those pure functions twice (~2 KB). Accept unless it measures worse.
