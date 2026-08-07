# Findings: driving `@kitn.ai/ui` from a real model

What broke when the kit's tool, reasoning and card components were fed by a live
model instead of hand-written fixtures. Everything here was measured against
`~deepseek/deepseek-v4-flash-latest` over OpenRouter, running the app in
`examples/internal/openrouter-spike`. Nothing is inferred.

## The short version

1. **Cards should come from tool calls, not structured outputs.** Setting
   `response_format` stopped the model calling tools at all, and it hallucinated
   the answer it would have got from one.
2. **Reasoning streams fine.** `delta.reasoning` arrives incrementally and
   `<kai-reasoning>` renders it live. The kit's `appendReasoning` still loses
   three things.
3. **`ChatMessage` cannot hold what a model produces.** No `sources`, no
   `cards`, and one flat `content` string. This is the largest gap.
4. **The adapter is portable into the kit today**, given four small changes.

## Model and SDK facts

`~deepseek/deepseek-v4-flash-latest` reports `tools`, `tool_choice`,
`reasoning`, `reasoning_effort` and `structured_outputs` in its
`supported_parameters` from `GET /api/v1/models`. Context 1M, $0.09 / $0.18 per
million tokens. The leading `~` is OpenRouter's floating-latest alias and is
cheaper than the pinned `deepseek/deepseek-v4-flash` ($0.14 / $0.28).

### `@openrouter/sdk@1.2.11` call shape

The payload nests under `chatRequest`:

```ts
await client.chat.send({
  chatRequest: { model, messages, stream: true, tools, toolChoice: 'auto' },
});
```

The flat `{ messages, model, stream }` form in the SDK README does not typecheck
against 1.2.11. From `esm/sdk/chat.d.ts`:

```ts
send(request: operations.SendChatCompletionRequestRequest & {
  chatRequest: { stream: true };
}, options?: RequestOptions): Promise<operations.SendChatCompletionRequestResponse>;
```

Two more things worth knowing before you write against it:

- Streaming `chat.send` resolves to `EventStream<ChatStreamChunk>`, which is the
  **chat-completions delta surface**: `choices[0].delta.toolCalls[]`. It is not
  the Responses-style `response.function_call_arguments.delta` event stream.
  Those belong to `betaResponses.send`.
- Every field is camelCase: `toolCalls`, `toolCallId`, `finishReason`,
  `reasoningDetails`, `maxTokens`, `toolChoice`, `responseFormat`. The wire
  format is snake_case; the SDK converts.

## Cards: tool call beats structured output

Both paths ship in the spike behind the header toggle, so the comparison is
reproducible.

**Path A** gives the model a `propose_action` tool and turns its arguments into
a `CardEnvelope`. **Path B** sets `response_format: json_schema` so the model
emits `{ reply, card }` with the confirm envelope inline.

Path B produces valid envelopes. It also breaks three things.

### It suppresses tool calling

This is the disqualifying result. Same prompt, same tool list, the only
difference being `responseFormat`:

| | tool-call chunks | `finish_reason` |
|---|---|---|
| tools only | 5 | `tool_calls` |
| tools + `response_format` | 0 | `stop` |

The model's own reasoning in the treatment run said *"I'll use get_weather
tool"*. It then did not call it, and wrote `"The weather in Tokyo right now is
18°C and partly cloudy"` straight into the schema. Both numbers were reproduced
independently with a separate control/treatment probe.

A model that silently fabricates tool results is not a tradeoff. It is a bug in
the product design.

### It makes streaming impossible

`response_format` constrains the whole assistant message, so the model streams
raw JSON token by token:

```
data: {"text":"{\n"}
data: {"text":"  \""}
data: {"text":"reply"}
data: {"text":"\":"}
```

You cannot append that into `<kai-thread>`. The spike buffers the entire message
(`bufferText()` in `src/model-stream.ts`), parses it, then calls `setText` with
the prose. The user watches an empty bubble until the turn ends. Path A streams
normally.

Failure is worse too. One malformed brace loses the prose *and* the card. In
Path A a bad tool call fails one panel and the rest of the turn survives.

### It costs more

Producing the same confirm card: **280 completion tokens** in Path B against
**121** in Path A.

Prompt-side overhead is real but I cannot pin a number. Across probes the router
reported anywhere from 442 to 926 prompt tokens for the *same* schema request,
which suggests it routed to upstream providers with different tokenizers and
cache accounting. Treat the completion-token figure as the reliable one.

### Recommendation

**Cards come from tools.** Keep the schema path in the spike as evidence, and do
not build the product on it.

## Reasoning

It streams. `delta.reasoning` arrives as 4 to 32 incremental deltas per turn
depending on the prompt, and `<kai-reasoning>` renders it live inside
`<kai-thread>`. There is a separate
`usage.completionTokensDetails.reasoningTokens` count, which is post-hoc and can
be non-zero when nothing streamed at all. The spike reports both so the two
cases stay distinguishable.

**Read `reasoning` or `reasoning_details`, never both.** OpenRouter frequently
puts the same text in both fields of the same delta. Concatenating whatever you
find doubles every reasoning token. `reasoningTextOf()` in
`server/sdk-bridge.ts` prefers `reasoning` and falls back to
`reasoning_details`.

`appendReasoning(delta, label)` takes a flat string, and that loses three things:

- **Signed and encrypted blocks.** `reasoning.encrypted` entries carry an opaque
  `data` blob with no readable text. There is nowhere to put it, so the adapter
  drops it.
- **Parallel blocks.** `reasoning_details` entries carry an `index`. Multiple
  concurrent reasoning blocks collapse into one string.
- **Round-tripping.** Anthropic-family models want their `reasoning_details`
  echoed back verbatim, signatures included, on the next turn.
  `ChatMessage.reasoning` is `{ text, label }`, so the signatures are gone and
  you cannot send them back.

The first two are cosmetic today. The third blocks multi-turn extended thinking
against Anthropic models.

## Where the kit's data model fought back

### `ChatMessage` has no `sources` and no `cards`

The fields are `content`, `reasoning`, `tools`, `attachments`, `actions`,
`avatar`, `feedback`. A model-produced citation row and a model-produced card
have nowhere to live inside the turn that caused them.

`<kai-thread>`'s only slot is `empty`. The `Message` component has an `inject`
slot, but the thread element does not forward a per-message one, so there is no
escape hatch either.

The spike renders both in a tray below the thread and labels it, because there
was no honest alternative. See `src/components/ModelPanel.tsx`. This is the
finding most worth fixing.

### `content` is one flat string, so ordering is unrepresentable

The real shape of a tool-using turn is preamble, then tool, then answer. The kit
renders reasoning, then tools, then content, always. Round two's text appends
straight onto round one's with no separator:

```
"Let me check Paris for you.It's **12 °C** and raining in Paris"
```

That behaviour is pinned in `src/model-stream.test.ts` so it is not mistaken for
a spike bug. Ordered message parts would fix it.

### `ToolPart` cannot hold partial arguments

`function.arguments` arrives as fragments that are individually invalid JSON:

```
{"ci  →  ty":"Pa  →  ris","un  →  its":"me  →  tric"}
```

`ToolPart.input` is `Record<string, unknown>`, so a half-written `{"city":"Par`
is unrepresentable until the whole thing parses. `input-streaming` therefore
means "we know nothing yet". The adapter accumulates internally and exposes an
`onToolArgumentsDelta` callback so the host can render the raw text itself,
which is what `ThreadView` does.

A `rawInput?: string` field on `ToolPart` would remove the need for that
callback entirely.

### The card JSON Schemas are built but not exported

`nx build ui` runs a dedicated `build:schemas` step and emits ten files into
`packages/ui/dist/schemas/`, including `confirm.schema.json`. There is no
`./schemas/*` entry in the package `exports` map, so:

```
require.resolve('@kitn.ai/ui/schemas/confirm.schema.json')
→ ERR_PACKAGE_PATH_NOT_EXPORTED
```

Path B needed the confirm schema to hand to the model. With no way to import it,
`src/card-schema.ts` hand-copies the shape, which will drift. This is a one-line
fix in `package.json`.

### Minor: React consumers cannot reach the types

`@kitn.ai/ui/react` exports exactly one type, `ChatMessage`. `ToolPart`,
`CardEnvelope`, `CardResolution` and `AssistantStream` all require importing
from the SolidJS root entry `@kitn.ai/ui`. Type-only imports erase, so this is a
papercut rather than a bundling problem, but it is surprising.

## The existing SSE reader is not enough

`packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` emits a reader that
handles `choices[0].delta.content` and nothing else. Scaffolded apps that add
tools or reasoning will get neither. It also breaks on three things a real
OpenRouter stream does:

- **Keep-alive comments.** OpenRouter sends `: OPENROUTER PROCESSING` lines. The
  scaffolded reader skips them by accident, since it only looks at lines
  starting with `data:`, but any reader that parses every line will throw.
- **Multi-line frames.** SSE allows several `data:` lines per frame, joined by
  newlines and terminated by a blank line. Splitting on `\n` and treating each
  `data:` line as a complete payload is wrong.
- **Split codepoints.** A socket boundary inside a multi-byte character corrupts
  the text unless the decoder is incremental (`TextDecoder` with
  `{ stream: true }`).

`src/sse-frames.ts` handles all three and is tested at byte-chunk sizes of 1, 3,
17, 64 and 4096 to prove it.

## Moving the adapter into the kit

`src/model-stream.ts` is written to be lifted into `@kitn.ai/ui/state`. It
imports one thing from anywhere: `type ToolPart`. No React, no Solid, no DOM, no
`fetch`, no SSE, and critically **no provider SDK**. Its input is
`ModelStreamChunk`, a shape defined in the file itself. Mapping a provider onto
that shape is 130 lines in `server/sdk-bridge.ts`, which is the only file that
imports `@openrouter/sdk` types.

That separation is the part worth keeping. The kit must never depend on a
provider SDK, and this proves it does not have to.

To move it, change one import path and add:

1. `sources` and `cards` on `ChatMessage`, or ordered message parts.
2. `rawInput?: string` on `ToolPart`.
3. A richer reasoning shape that survives signed blocks and round-tripping.
4. `./schemas/*` in the package `exports` map.

Items 1 and 2 are what the adapter actually needs. Items 3 and 4 are what a
consumer needs to use it against real providers.

## What was not tested

- Long-running streams, rate limits and retry behaviour.
- Anything other than Chromium.
- The hidden-reasoning case against a live model. Every live run streamed
  reasoning text, so the "billed but not streamed" path is covered by fixtures
  only.
- Any model other than `~deepseek/deepseek-v4-flash-latest`. The tool-suppression
  result in particular may differ on other providers.
