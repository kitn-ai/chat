# Where the industry normalizes provider differences, and what reaches the browser

Research date: 2026-08-14. Every claim is labelled **[VERIFIED]** (primary doc/source, cited),
**[SECONDARY]**, or **[UNVERIFIED]**.

Where I cite a local file path, that is a **shipped artifact of the pinned version** in this
repo's `node_modules` — a stronger primary source than a docs website, because it is the exact
code and the exact docs that version ships.

---

## 0. The one-paragraph answer

Normalization happens in **four different places**, and they do not agree: (1) inside the
provider SDK/adapter on the server (Vercel AI SDK provider packages), (2) inside a hosted
gateway that re-serves an OpenAI-shaped API (OpenRouter, LiteLLM, Vercel AI Gateway), (3)
inside the vendor's own compatibility shim (Anthropic's OpenAI-compat endpoint), or (4) not at
all. What reaches the **browser** is normalized by a fifth, separate decision — and there the
Vercel AI SDK's UI Message Stream is the only widely-deployed candidate for a standard, but it
is a single vendor's protocol, not a cross-vendor one.

The claim under test — that "OpenAI-compatible" holds for `delta.content` and
`delta.tool_calls` but breaks for reasoning — is **correct, and the underlying reason is
stronger than the claim as stated**. See §5.

**The four findings worth carrying out of this document:**

1. **Reasoning diverges because the OpenAI spec has no reasoning field at all.** Chat
   Completions does not expose reasoning content — OpenAI's own docs say so. Every
   `delta.reasoning*` in existence is a vendor extension to silence, which is why this one
   field broke when `content` and `tool_calls` did not. That is a structural argument, not a
   survey result, so a new provider agreeing with someone cannot falsify it. (§5.2)
2. **Nobody normalizes at the same layer.** The AI SDK normalizes at a versioned *provider
   interface* on the server; OpenRouter and LiteLLM normalize at a *hosted OpenAI-shaped
   endpoint*; Anthropic's own compat shim normalizes by *dropping* what does not fit. LiteLLM
   even offers two competing normal forms itself (OpenAI shape *and* Anthropic `/v1/messages`).
3. **In the AI SDK, provider SSE never reaches the browser** —
   `grep -c "choices" node_modules/ai/dist/index.js` returns **0**. The browser parses the
   SDK's own re-encoded protocol. (§1.5)
4. **There is no cross-vendor browser-facing standard**, but there are two poles in different
   slots (Vercel's UI Message Stream for rendering; AG-UI for agent sessions) and a long tail.
   One React chat library ships **twelve** backend adapters. (§6)

---

## 1. Vercel AI SDK

**Version described: `ai@7.0.59`, `@ai-sdk/provider@4.0.7`, `@ai-sdk/gateway@4.0.47`** —
the versions installed in this repo (`packages/ui/package.json:248` declares `ai: ^7.0.59`).
v7 is the current major. Facts below are read from the shipped `dist/` and the docs the
package ships in `node_modules/ai/docs/`.

### 1.1 Normalization happens at the *provider interface*, not at the wire

The SDK defines a versioned provider interface — `LanguageModelV4` in this release, with V2 and
V3 retained for back-compat (all three exported from `@ai-sdk/provider`
`dist/index.d.ts`). **[VERIFIED]**

Each provider package (`@ai-sdk/openai`, `@ai-sdk/anthropic`, …) owns the SSE parsing for its
own provider and maps it onto one shared union, `LanguageModelV4StreamPart`, whose variants are
**[VERIFIED, `@ai-sdk/provider/dist/index.d.ts`]**:

`text-start` · `text-delta` · `text-end` · `reasoning-start` · `reasoning-delta` ·
`reasoning-end` · `tool-input-start` · `tool-input-delta` · `tool-input-end` · `stream-start` ·
`response-metadata` · `finish` · `raw` · `error`

This is the layer that erases `delta.content` vs `content_block_delta`. It is genuinely
provider-independent in shape.

### 1.2 What `streamText().fullStream` emits

`fullStream` yields `TextStreamPart<TOOLS>` — the provider union above plus SDK-level concerns
(tool execution results, approvals, step boundaries, abort). Full variant list at
`node_modules/ai/dist/index.d.ts:2939`. **[VERIFIED]**

**Is it provider-independent? Mostly yes, with two deliberate escape hatches:**

1. **`providerMetadata`** — an optional field on nearly every part, typed
   `Record<string, JSONObject>` keyed by provider name. Its own doc comment says it exists to
   "quickly ship provider-specific functionality without affecting the core AI SDK"
   (`@ai-sdk/provider/dist/index.d.ts:200-218`). **[VERIFIED]**
2. **`raw` parts** — `{ type: 'raw', rawValue: unknown }`
   (`ai/dist/index.d.ts:2935`), opt-in via `include.rawChunks` (renamed from top-level
   `includeRawChunks` in v7 — `docs/08-migration-guides/23-migration-guide-7-0.mdx:1018`).
   This is the untranslated provider payload. **[VERIFIED]**
3. A third, newer one: **`custom` parts**, `{ type: 'custom', kind: '{provider}.{provider-type}' }`
   (`LanguageModelV4CustomContent`), documented as "provider-specific content that doesn't fit
   into the standard part types". **[VERIFIED]**

So: provider-independent by default, with three explicitly-labelled channels for what does not
normalize. That design choice is the honest one and worth noting — the leaks are *named*
rather than silently flattened.

### 1.3 What goes ON THE WIRE to the browser

`toUIMessageStream` / `toUIMessageStreamResponse` convert `fullStream` into
`UIMessageChunk` — a **different** union from `fullStream`, defined at
`ai/dist/index.d.ts:2275`. **[VERIFIED]** Variants:

`text-start|delta|end` · `reasoning-start|delta|end` · `custom` · `error` ·
`tool-input-start|delta|available|error` · `tool-output-available|error|denied` ·
`tool-approval-request|response` · `source-url` · `source-document` · `file` ·
`reasoning-file` · `data-*` · `start-step` · `finish-step` · `start` · `finish` · `abort` ·
`message-metadata`

Transport: **SSE**, one JSON object per `data:` line, plus header
`x-vercel-ai-ui-message-stream: v1` (`UI_MESSAGE_STREAM_HEADERS`,
`ai/dist/index.d.ts:6031`; value set at `dist/index.js:6472`). **[VERIFIED]**

Notable: `sendReasoning` defaults to **`true`** in v7 (`dist/index.js:7542`) — reasoning text
reaches the browser unless you opt out. **[VERIFIED]** (It defaulted to `false` in earlier
majors; verify before relying on cross-version behavior.)

**Leak into the browser:** `providerMetadata` is carried on almost every `UIMessageChunk`
variant, and the `custom` chunk is explicitly provider-namespaced — the shipped doc's own
example is `{"type":"custom","kind":"openai.compaction","providerMetadata":{"openai":{"itemId":"cmp_123"}}}`
(`docs/04-ai-sdk-ui/50-stream-protocol.mdx:290`). **[VERIFIED]** So provider identity does
reach the client, by design, in a namespaced field.

### 1.4 Is the wire format documented and stable, or internal?

**Documented and public.** `docs/04-ai-sdk-ui/50-stream-protocol.mdx` states its purpose
plainly (lines 11-16): you can use it "to develop custom backends and frontends … e.g., to
provide compatible API endpoints that are implemented in a different language such as Python",
and links a FastAPI example in the `vercel/ai` repo. It documents each chunk type with an
example `data:` line, and instructs custom backends to set the
`x-vercel-ai-ui-message-stream: v1` header. **[VERIFIED]**

**Version history matters here.** The protocol was a *proprietary* prefixed format (`0:`,
`1:`, …) before v5; the v5 migration guide has a section headed "Proprietary Protocol ->
Server-Sent Events" and states the data stream protocol "has been updated to use Server-Sent
Events" (`docs/08-migration-guides/26-migration-guide-5-0.mdx:2544`), alongside a
"data streams → UI message streams" restructure at line 2588. **[VERIFIED]** So: SSE + the
`v1` header is a **v5-and-later** fact. Anything written against v4 or earlier describes a
different wire format. The header says `v1` while the package says v7 — the protocol version
and the package version are independent.

### 1.5 Does the browser side parse provider SSE?

**No — categorically.** The client transport parses the SDK's own protocol only, validating
each event against `uiMessageChunkSchema` via `parseJsonEventStream`
(`ai/dist/index.js:17336`, `:17551`). **[VERIFIED]**

The decisive structural check: **`grep -c "choices" node_modules/ai/dist/index.js` returns
`0`.** The OpenAI chat-completions wire shape (`choices[].delta`) appears *nowhere* in the
entire core `ai` bundle. **[VERIFIED]** All provider SSE parsing lives in the separately
installed `@ai-sdk/*` provider packages, which run on the server.

This is the cleanest available evidence for the architectural claim: in the AI SDK, **provider
SSE never reaches the browser.** The browser gets a re-encoded, provider-independent protocol.

### 1.6 Reasoning: the AI SDK's own docs confirm the divergence (request side)

`docs/03-ai-sdk-core/26-reasoning.mdx` exists to paper over provider differences with one
portable `reasoning` parameter. Its "Provider Support" section (line 80-82) says
**[VERIFIED]**:

- supported by OpenAI, Anthropic, Google, xAI, Groq, DeepSeek, Fireworks, Amazon Bedrock;
- "Some providers support all six levels natively, while others coerce to fewer levels (a
  warning is emitted when coercion occurs)";
- "Some providers use a numeric token budget instead of an enum … mapped to a budget calculated
  as a percentage of the model's maximum output tokens";
- Mistral, Perplexity, Cohere "emit an `unsupported` warning and ignore the parameter".

That third bullet — effort enum mapped to a *percentage of max output tokens* — is the exact
mechanism behind this repo's recorded OpenRouter reasoning-budget-floor bug. It is a general
hazard of the enum→budget mapping, not an OpenRouter quirk.

The same file's migration examples enumerate three mutually incompatible native shapes for one
concept **[VERIFIED]**:

| Provider | Native request shape |
|---|---|
| Anthropic | `providerOptions.anthropic.thinking: { type, budgetTokens }` |
| Google | `thinkingConfig: { includeThoughts, thinkingBudget }` |
| OpenAI | `reasoningEffort` + `reasoningSummary` |

And a **fourth** shape exists where reasoning is not a field at all: `extractReasoningMiddleware({ tagName: 'think' })`
exists because "Some providers and models expose reasoning information in the generated text
using special tags, e.g. `<think>` and `</think>`"
(`docs/03-ai-sdk-core/40-middleware.mdx:64-85`). **[VERIFIED]**

Worth noting for a "decide loudly" argument: the SDK's warning type
(`SharedV4Warning`) has explicit `unsupported` / `compatibility` / `deprecated` variants
carrying a `feature` name — degradation is reported, not silent. **[VERIFIED]**

---

## 2. OpenRouter

Doc-path note: OpenRouter restructured its docs; canonical paths are now `/docs/guides/...`
and `/docs/api/reference/...`, with old paths still resolving. Most pages serve a raw `.md`
twin, which is the better primary source.

### 2.1 What it normalizes

**[VERIFIED]** https://openrouter.ai/docs/api/reference/overview publishes hand-written TS
types: `choices[]`, `message`/`delta`, `tool_calls`, and `finish_reason` mapped to
`tool_calls | stop | length | content_filter | error`.
On tools **[VERIFIED, verbatim]** (https://openrouter.ai/docs/api/reference/parameters):
"Tool calling parameter, following OpenAI's tool calling request shape. For non-OpenAI
providers, it will be transformed accordingly."

### 2.2 What leaks (all **[VERIFIED]**)

- `native_finish_reason` — the raw upstream string, preserved alongside the normalized one.
- `usage` extended well beyond OpenAI: `cost`, `is_byok`, `cost_details`,
  `server_tool_use.web_search_requests`, `completion_tokens_details.reasoning_tokens`.
- A **top-level `provider`** field on chunks.
- **Mid-stream errors at the top level** of a chunk, alongside `finish_reason: "error"` — not
  an OpenAI behavior (https://openrouter.ai/docs/api/reference/streaming).
- **SSE comment keep-alives `: OPENROUTER PROCESSING`.** The docs explicitly warn that passing
  these to `JSON.parse` throws. This is the single most common breakage for a naive reader.
- Provider-specific request fields pass through un-normalized, e.g. `cache_control:
  {"type":"ephemeral"}` for Anthropic/Gemini/Qwen (https://openrouter.ai/docs/guides/features/prompt-caching).

### 2.3 Reasoning

**Response fields [VERIFIED]** (https://openrouter.ai/docs/api-reference/chat-completion,
OpenRouter's generated schema): the streaming `delta` carries `content`, `role`, `tool_calls`,
**`reasoning` (string|null)**, **`reasoning_details` (array|null)**, `refusal`, `images`,
`audio`. The non-streaming `message` has those **plus `annotations`** — `annotations` is
**not** on `delta`.

⚠️ **The two OpenRouter schema pages disagree**: the hand-written types at
`/docs/api/reference/overview` omit `reasoning`, `reasoning_details` and `annotations` from
`StreamingChoice.delta` entirely. The generated schema is the more complete. **[VERIFIED]**

**`reasoning_details` has exactly three types [VERIFIED, verbatim examples]**:
`reasoning.summary` (`summary`), `reasoning.encrypted` (`data`), `reasoning.text` (`text`,
plus **`signature`**). Common fields `id`, `format`, `index`; `format` carries e.g.
`"anthropic-claude-v1"`. Anthropic "defaults to summarized thinking"; encrypted content "may
appear as `[REDACTED]` in streaming responses". For multi-turn you pass
`message.reasoning_details` back **unmodified**.

**Request side [VERIFIED]**: `reasoning: { effort, max_tokens, exclude, enabled }`, where
`effort` ∈ `max|xhigh|high|medium|low|minimal|none` (a **superset** of OpenAI's set).
`max_tokens` for Anthropic is documented **min 1024 / max 128,000** — which independently
corroborates this repo's recorded `openrouter-reasoning-budget-floor` finding. OpenRouter
**also** accepts top-level OpenAI-style `reasoning_effort`; `include_reasoning` is a deprecated
alias for `reasoning.exclude`.

### 2.4 Tool calls — caveats a parser author needs

- **`index` is not reliable [PARTIALLY VERIFIED]**: the guide's prose lists `index` among
  tool_call fields, but the actual JSON example in the raw `.md` has no `index` key.
- **Argument fragmenting is undocumented [COULD NOT DETERMINE]**: no OpenRouter doc states that
  `function.arguments` arrives in fragments needing concatenation. The guide's own snippet does
  a naive `push(...delta.tool_calls)` that would duplicate partials under real OpenAI-style
  fragmenting. Accumulate by id/index defensively.
- **Doc inconsistency [VERIFIED]**: the guide reads `delta.finish_reason`, but every schema
  page puts `finish_reason` on the **choice**. Read `choices[0].finish_reason`.

### 2.5 Citations

**[VERIFIED]** (https://openrouter.ai/docs/guides/features/plugins/web-search) OpenRouter
standardizes web results "to follow the same annotation schema in the OpenAI Chat Completion
Message type" — `annotations[].type: "url_citation"` with
`url_citation.{url,title,content,start_index,end_index}`. Note it **adds a `content` field**
beyond OpenAI's shape. **Streaming placement [COULD NOT DETERMINE]**: `annotations` is on
`message` and absent from `delta` in the schema; no page states when they are emitted during a
stream. Plan for the assembled message, verify empirically.

### 2.6 Unsupported parameters — silent

Three documented behaviors, not fully consistent with each other, all **[VERIFIED]**:
unsupported params "are ignored" (overview); with default routing, providers "can still receive
the request, but will ignore unknown parameters", with `require_parameters: true` to opt into
strictness (provider-routing); and absent sampling params are "omitted upstream rather than
substituting a hardcoded value" (parameters). Discoverability is via per-model
`supported_parameters` on the Models API. **No page enumerates a dropped-params list, and
nothing documents surfacing the drop in the response — it appears to be silent.**

### 2.7 Empirical corroboration from this repo's own live captures

`packages/ui/src/wire/fixtures/openai/*.sse` are **live-captured OpenRouter SSE** carrying
provenance headers (`capture: live`, `provider: openrouter`, `model:`, `captured:`).
**[VERIFIED — captured wire data]**

- `reasoning-both-fields.sse` — model `~deepseek/deepseek-v4-flash-latest`, captured
  2026-08-10, via OpenRouter. Delta field counts: **`content` 49, `role` 49, `reasoning` 47,
  `reasoning_details` 46, `reasoning_content` 0.**
- `reasoning-signed-tool-call.sse` — `anthropic/claude-haiku-4.5` (upstream **Amazon Bedrock**)
  served over the OpenAI-compat wire, i.e. three-way normalization in one capture.
- `reasoning-encrypted-summary.sse` — `openai/gpt-5.4-mini` upstream OpenAI.
- **`reasoning_content` occurs zero times across every captured fixture in the repo.**

This is the empirical half of the rename claim, measured rather than asserted.

Also empirically confirmed by our parser's own regression test
(`wire/formats/openai.test.ts:72`, "prefers `reasoning` over `reasoning_details` text (the
doubling trap)"): OpenRouter frequently puts **the same text in both `reasoning` and
`reasoning_details` on the same delta**, so a parser that concatenates both doubles every
reasoning token. That is a real, load-bearing normalization hazard and it is not documented
anywhere upstream.

---

## 3. LiteLLM (proxy / SDK)

### 3.1 What it normalizes

Guaranteed output fields are the OpenAI core: `choices[].finish_reason`, `choices[].index`,
`choices[].message.{role,content}`, `usage.{prompt,completion,total}_tokens`, `created`,
`model` (https://docs.litellm.ai/docs/completion/output). **[VERIFIED]**
`finish_reason` is normalized to OpenAI's value set, and where the provider's native value
differs the original is preserved at **`provider_specific_fields["native_finish_reason"]`** —
normalization is lossless by escape hatch rather than by erasure. **[VERIFIED]**

### 3.2 What leaks / what is dropped

The boundary is binary and documented (https://docs.litellm.ai/docs/completion/input)
**[VERIFIED]**: "LiteLLM assumes any non-openai param is provider specific and passes it in as
a kwarg in the request body", and "By default, LiteLLM raises an exception if the openai param
being passed in isn't supported." So a *known* OpenAI param on an unsupporting provider →
**error**; an *unknown* param → **forwarded raw**. Silent dropping is opt-in via
`drop_params` (https://docs.litellm.ai/docs/completion/drop_params). **[VERIFIED]**

Nuance worth keeping: the documented contract says nothing about warnings, but the Anthropic
transformation source carries logged constants (`DROP_UNSUPPORTED_ADAPTIVE_THINKING_WARNING`
and siblings, `litellm/llms/anthropic/chat/transformation.py` L214-226), so some drops do log.
"Silently dropped" is true of the contract, not uniformly of the implementation. **[VERIFIED IN SOURCE]**

### 3.3 Reasoning — LiteLLM invents its own fields, and has to alias a rival's

`litellm/types/utils.py`: both `Message` (L1229) and the streaming `Delta` (L1348) carry
**identical** reasoning fields — `reasoning_content: str | None` and
`thinking_blocks: list[...]` (Message L1238-39, Delta L1364-65). Both are *deleted when None*,
so they are absent rather than null. **[VERIFIED IN SOURCE]**

`ChatCompletionThinkingBlock` (`litellm/types/llms/openai.py` L513-517) carries
`type: "thinking"`, `thinking: str`, **`signature: str | None`**, plus a separate
`ChatCompletionRedactedThinkingBlock` (`type: "redacted_thinking"`, `data: str`).
**[VERIFIED IN SOURCE]** This is the shape needed to replay Anthropic thinking into a
multi-turn tool loop — and it is *not* an OpenAI-shaped field.

**The single most telling line in this whole report** — `Delta.__init__` aliases the
OpenRouter-style name onto its own (L1387-88) **[VERIFIED IN SOURCE]**:

```python
if reasoning_content is None and "reasoning" in params:
    reasoning_content = params.pop("reasoning")
```

A major normalization layer contains explicit code to reconcile `reasoning` with
`reasoning_content`. That is compatibility-shim code that only needs to exist because the two
names are both in the wild for the same concept.

Docs caveat: https://docs.litellm.ai/docs/reasoning_content documents the **non-streaming**
shape and lists supporting providers; it has **no streaming example**. The streaming guarantee
above is source-verified, not doc-verified. **[VERIFIED IN SOURCE, not in docs]**

### 3.4 Request side, and the budget-floor hazard again

`_map_reasoning_effort` (`litellm/llms/anthropic/chat/transformation.py` L1174-1223) maps
`low|medium|high|xhigh|max|minimal` → `AnthropicThinkingParam(type="enabled", budget_tokens=<tier>)`;
an unrecognised value raises `BadRequestError`. **[VERIFIED IN SOURCE]**
`_cap_thinking_budget_to_max_tokens` (L1233-46) enforces Anthropic's `max_tokens > budget_tokens`
and **drops thinking entirely** when `max_tokens` cannot fit the minimum budget — but *logs*
that it did. **[VERIFIED IN SOURCE]** Same failure class as this repo's recorded OpenRouter
reasoning-budget-floor finding; LiteLLM announces it, OpenRouter did not.

### 3.5 It also serves the Anthropic shape

LiteLLM exposes `/v1/messages` in **Anthropic** wire format as a translation layer (not a
passthrough) routing to openai, anthropic, bedrock, vertex_ai, gemini, azure
(https://docs.litellm.ai/docs/anthropic_unified). **[VERIFIED]** Note what this means: the
industry's biggest normalizer offers *two* competing normal forms. Even at the proxy layer
there is no single target shape.

### 3.6 What a browser gets

Nothing directly — LiteLLM is a server-side proxy emitting OpenAI-shaped SSE (or Anthropic-shaped
SSE). Any browser consuming it is parsing provider-shaped SSE, i.e. the raw
`choices[].delta` frames, with LiteLLM's non-standard `reasoning_content` / `thinking_blocks`
riding inside them.

---

## 4. Anthropic's OpenAI-compatibility endpoint

**It exists**, at base URL `https://api.anthropic.com/v1/` with an Anthropic key
(https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk; the older
`docs.claude.com/en/api/openai-sdk` 301s there). **[VERIFIED]**

### 4.1 Positioning — explicitly not production

Its own opening paragraph **[VERIFIED]**: the layer "is primarily intended to test and compare
model capabilities, and is **not considered a long-term or production-ready solution for most
use cases**."

### 4.2 Documented limitations

**[VERIFIED]** The governing sentence is: "**Most unsupported fields are silently ignored
rather than producing errors.**"

- **Ignored request fields** include `reasoning_effort`, `logprobs`, `top_logprobs`,
  `response_format`, `metadata`, `prediction`, `presence_penalty`, `frequency_penalty`, `seed`,
  `service_tier`, `audio`, `logit_bias`, `store`, `user`, `modalities`, and `name` on every
  message role.
- **Constrained rather than ignored:** `n` must be exactly 1; `temperature` clamped to 0-1
  (values >1 are capped, not rejected).
- `strict` is ignored → tool arguments are **not** schema-guaranteed. Prompt caching is not
  supported. Audio input is stripped. `image_url.detail` ignored.
- **Response side:** `usage.completion_tokens_details` and `usage.prompt_tokens_details` are
  "Always empty" — so there is not even reasoning-*token* accounting.

### 4.3 The key finding: reasoning is not surfaced at all

**[VERIFIED]** Thinking can be *enabled* via `extra_body={"thinking": {...}}`, but:

> "the OpenAI SDK doesn't return Claude's detailed thought process. For full thinking features,
> including access to Claude's step-by-step reasoning output, use the native Claude API."

Corroborated structurally: the documented response-field table lists only `role`, `content`,
`tool_calls` under `choices[].message` (plus `refusal`/`audio`, both "always empty"). **There
is no reasoning field of any name.** And `reasoning_effort` — the OpenAI-idiomatic knob — is
inert. **[VERIFIED]**

### 4.4 Anthropic's native streaming is a different protocol

**[VERIFIED]** (https://platform.claude.com/docs/en/build-with-claude/streaming) Named SSE
events: `message_start` → per content block (`content_block_start`, n× `content_block_delta`,
`content_block_stop`) → n× `message_delta` → `message_stop`, plus `ping` / `error`. Delta
types: `text_delta`, `input_json_delta`, `thinking_delta`, `signature_delta`. The
`signature_delta` arrives just before `content_block_stop` and exists to verify block
integrity. `message_delta` usage counts are **cumulative**.

The structural contrast is the load-bearing point: Anthropic is **indexed content blocks with
typed deltas and a named SSE event per frame**; OpenAI chat-completions is **one flat frame
type carrying `choices[].delta`, no event names, no block indices**. Parallel content blocks,
block boundaries and cryptographic signatures have **no representation** in the OpenAI frame.
That is precisely why the compat layer returns no thinking — and why LiteLLM had to invent
non-OpenAI-shaped fields (`thinking_blocks`) to preserve it.

---

## 5. Verdict: the reasoning-field divergence claim

**The claim is CORRECT. And the real reason is stronger and cleaner than the claim as stated —
worth restating before it gets used, because the stated version is the weaker argument.**

### 5.1 The half that is genuinely standard

`delta.content` and `delta.tool_calls` (`id` / `type` / `function.name` /
`function.arguments`) really are carried unchanged across OpenAI itself, OpenRouter, LiteLLM
and Anthropic's compat endpoint. All four document the same shape, and OpenRouter states
outright that non-OpenAI providers are "transformed accordingly" into it. **[VERIFIED across
all four]** The caveats are behavioral rather than structural (argument fragmenting,
`index` presence, `finish_reason` placement) — annoying, but the *field names agree*.

### 5.2 Why reasoning breaks — the structural argument

Not "vendors implemented a standard field inconsistently." Rather:

> **The OpenAI chat-completions spec has no reasoning field at all, so every reasoning field in
> the wild is a vendor extension to a spec that is silent.**

OpenAI's own reasoning guide (https://developers.openai.com/api/docs/guides/reasoning) states
that raw chain-of-thought "is not exposed" — reasoning tokens "are not visible via the API" —
and that reasoning *summaries* plus `encrypted_content` exist only on the **Responses API**, in
a `reasoning` output item with a `summary` array. **Chat Completions does not expose reasoning
content at all.** **[VERIFIED]**

So there was never a `delta.reasoning*` to be compatible *with*. Every implementer inventing
one invented a different one. That is why this diverged and `content`/`tool_calls` did not, and
it is a fact about the spec rather than an observation about a sample of vendors — so it cannot
be falsified by the next provider that happens to agree with one of them.

### 5.3 The field-name census

| Layer | Streaming field(s) for reasoning | Evidence |
|---|---|---|
| OpenAI chat-completions | **none** (only `usage…reasoning_tokens`) | [VERIFIED] OpenAI reasoning guide |
| OpenAI Responses API | `reasoning` output item, `summary[]`, `encrypted_content` | [VERIFIED] same |
| DeepSeek first-party | **`delta.reasoning_content`** | [VERIFIED] api-docs.deepseek.com/api/create-chat-completion/ |
| OpenRouter | **`delta.reasoning`** + `delta.reasoning_details[]` | [VERIFIED] docs + 47 live occurrences in our own capture |
| LiteLLM | **`delta.reasoning_content`** + `thinking_blocks[]` | [VERIFIED IN SOURCE] types/utils.py L1364-65 |
| Anthropic native | `content_block_delta` → **`thinking_delta`** + `signature_delta` | [VERIFIED] Anthropic streaming docs |
| Anthropic OpenAI-compat | **nothing — not returned** | [VERIFIED] Anthropic OpenAI-SDK compat page |
| Google | `thinkingConfig.includeThoughts` (request) | [VERIFIED] AI SDK reasoning doc |
| Some open models | **no field — inline `<think>` tags in `content`** | [VERIFIED] AI SDK `extractReasoningMiddleware` |

Nine rows, at least six mutually incompatible representations, including two that are not
fields at all (inline tags; and "absent entirely").

### 5.4 The two strongest single pieces of evidence

1. **LiteLLM ships an alias.** `Delta.__init__` contains
   `if reasoning_content is None and "reasoning" in params: reasoning_content = params.pop("reasoning")`
   (types/utils.py L1387-88). **[VERIFIED IN SOURCE]** A major normalization layer needs
   explicit reconciliation code for these two names. Nobody writes that for `content`.
2. **Anthropic's own compat layer drops reasoning entirely**, and *documents* that it does:
   "the OpenAI SDK doesn't return Claude's detailed thought process." **[VERIFIED]** The vendor
   best positioned to define an OpenAI-shaped reasoning field declined to, because
   signature-bearing, index-addressed thinking blocks have no representation in a flat
   `choices[].delta` frame.

### 5.5 The specific DeepSeek rename claim: **PARTIALLY VERIFIED — behaviorally confirmed, not documented**

Being precise, because this is the one claim that was asserted specifically:

- **(a) DeepSeek emits `reasoning_content` — VERIFIED.** DeepSeek's own API reference documents
  `choices[].delta.reasoning_content` for streaming, "For thinking mode only. The reasoning
  contents of the assistant message, before the final answer."
  (https://api-docs.deepseek.com/api/create-chat-completion/)
- **(b) OpenRouter emits `reasoning` — VERIFIED twice over**: its generated schema and
  announcement post, *and* our own live 2026-08-10 capture of a DeepSeek model through
  OpenRouter showing 47 `reasoning` / 46 `reasoning_details` / **0** `reasoning_content`.
- **(c) An explicit OpenRouter statement "we rename `reasoning_content` to `reasoning`" —
  NOT FOUND.** OpenRouter documents normalizing the *request* side only.

So: **the rename is real and observed, but it is undocumented behavior, not a published
contract.** State it as measured, never as "OpenRouter documents that…". It could change
without a changelog entry — which is itself the argument for owning the parser.

One correction to a plausible over-reading: OpenRouter *does* accept `reasoning_content`, but
**request-side only**, as an alias for what you send back in an assistant message
(**[VERIFIED, verbatim]**: "You can also use `reasoning_content` as an alias - it functions
identically to `reasoning`"). It does **not** appear in the response `delta` or `message`
schema. A parser should not expect `delta.reasoning_content` from OpenRouter.

### 5.6 Consequence for anyone parsing client-side (and one finding about this repo)

There is no single field to read. A client-side parser aimed at "OpenAI-compatible" endpoints
must read at least `reasoning`, `reasoning_content`, and `reasoning_details[]`, and separately
handle inline `<think>` tags — and must decide what to do about signatures and encrypted blocks
if it ever wants to replay reasoning into a multi-turn tool loop.

**Actionable gap found while grounding this:** `reasoning_content` appears **nowhere** in
`packages/ui/src` (verified by grep). Our OpenAI-format parser
(`packages/ui/src/wire/formats/openai.ts`) reads `delta.content`, `delta.tool_calls`,
`delta.reasoning`, `delta.reasoning_details`, `delta.annotations` — correct and well-tested for
**OpenRouter**, but a consumer pointing `readOpenAIStream` at **DeepSeek first-party or a
LiteLLM proxy** would get reasoning **silently dropped**. Given this repo's "decide loudly"
rule — and that `lint:silent-drops` exists precisely to stop irreversible quiet losses in
`src/wire` — that is worth a deliberate decision: either read the alias, or drop it loudly.
I have not changed anything; flagging only.

---

## 6. Verdict: is there a browser-facing streaming standard?

**No. There is no cross-vendor standard for streaming chat to a browser.** But "everyone invents
one" is slightly too strong: there are **two** serious contenders occupying *different slots*,
plus a long tail. The finding is *fragmentation with two poles*, not chaos.

### 6.1 Vercel AI SDK UI Message Stream — the widest-deployed candidate

Already established in §1.3-1.4 from the shipped package: SSE, one JSON object per `data:`
line, `[DONE]` terminator (**[VERIFIED]** `dist/index.js:6461` and
`docs/04-ai-sdk-ui/50-stream-protocol.mdx:473`), header `x-vercel-ai-ui-message-stream: v1`,
and a docs page explicitly written so non-JS backends can emit it.

**The most useful single fact: the protocol version (`v1`) is decoupled from the SDK major.**
`ai` is at v7 while the wire header still says `v1`. **[VERIFIED]** npm dist-tags show three
majors maintained in parallel (`ai@7.0.66` latest, `ai@6.0.256`, `ai@5.0.237` as of
2026-08-14) — but the wire has been far more stable than that churn implies.
(Pydantic's docs state v7 emits the same wire as v6 — **[SECONDARY]**, but consistent with the
frozen header.)

**Independent non-JS / non-Vercel emitters [VERIFIED from each project's own docs]** — this is
what makes it more than one vendor's internal format:
Pydantic AI's `VercelAIAdapter` (native **Python**, selectable `sdk_version` 5/6/7) ·
`@llamaindex/server` · Mastra's `createUIMessageStreamResponse()`.

Scale: `ai` ~20.5M downloads/wk, `@ai-sdk/react` ~7.3M/wk. The `ai` figure over-counts (it is
mostly a server-side model SDK); `@ai-sdk/react` is the fairer proxy for protocol adoption.

### 6.2 AG-UI — a real spec, but a different slot and not neutrally governed

**Real and substantial [VERIFIED IN SOURCE]**: `ag-ui-protocol/ag-ui`, MIT, normative event
union in TS + Python plus a protobuf encoding. Wire values are SCREAMING_SNAKE:
`TEXT_MESSAGE_{START,CONTENT,END,CHUNK}`, `TOOL_CALL_{START,ARGS,END,CHUNK,RESULT}`,
`STATE_SNAPSHOT`/`STATE_DELTA`, `RUN_*`, `STEP_*`, `REASONING_*`, `RAW`, `CUSTOM` — 33 enum
members, 5 deprecated. Transport-agnostic by design (SSE, WebSockets, webhooks).

Three caveats that matter, all **[VERIFIED]**:

1. **It is not stable.** `@ag-ui/core` is at **0.0.57** — fifteen months in, still `0.0.x`,
   with date-tagged releases rather than semver.
2. **It is not neutrally governed.** `.github/CODEOWNERS` is `* @ag-ui-protocol/copilotkit`;
   "1st party" integration rows link to docs.copilotkit.ai rather than the adopters' own docs.
   AG-UI is **not** in the Linux Foundation's Agentic AI Foundation, which took MCP and A2A.
   Single-vendor protocol with an open license ≠ a standard.
3. **Its own docs contradict its source** ("16 standardized event types" vs 33 in the enum).

**Adoption is nonetheless real and hyperscaler-grade**, verified from adopters' *own* sites
rather than AG-UI's list: AWS Bedrock AgentCore ships `agentcore configure --protocol AGUI`
(strongest single datapoint — a protocol flag in a real infra product); Microsoft Agent
Framework; Google ADK; Pydantic AI. **One claim does not hold up:** Anthropic's Managed Agents
docs make **no mention of AG-UI** and define their own SSE event model — that integration is a
bridge the AG-UI project built, not Anthropic adopting it. LangChain's is a CopilotKit
integration page, not native protocol support.

**Crucially, it is not really competing with the Vercel protocol.** Vercel's is a
message-rendering wire format; AG-UI is an agent-*session* protocol (shared state sync,
human-in-the-loop, interrupts). Frameworks adopt **both**.

### 6.3 Everything else invents its own

- **OpenAI ChatKit/AgentKit** — has a `text/event-stream` format and a web component, but
  publishes **no language-agnostic wire spec**; a third party would reverse-engineer it.
  **[VERIFIED / COULD NOT DETERMINE any public schema]**
- **LangChain/LangGraph** — own format (`astream_events`, `StreamPart`, `useStream`).
- **Mastra** — ships **two**: `@mastra/ai-sdk` (Vercel wire) *and* `@ag-ui/mastra`.
- **LlamaIndex** — Vercel wire, plus an AG-UI integration.
- **A2UI** (a2ui.org, Google + CopilotKit, Apache 2.0, **v0.9.1, v1.0 in RC**) — further along
  than AG-UI on version, but it is a *declarative generative-UI* format, **not** a
  chat-streaming protocol. Complementary. **[VERIFIED]**

### 6.4 Standards bodies: essentially nothing

**[VERIFIED]** One individual Internet-Draft exists: `draft-spk-agentproto-llm-stream-00`,
"A Standard Wire Format for Large Language Model Inference Streaming" (Rosomakho & Pallagatti,
Zscaler; submitted 2026-07-19, expires 2027-01-20). **Individual submission, no working group,
no IETF endorsement** — and it targets the **provider→client** layer, explicitly to help
LangChain/Vercel "parse once". It is *not* browser-facing. No W3C work. SSE itself (WHATWG) is
the only actual standard in play, and it standardizes the *envelope*, not the events.

Note the asymmetry: MCP (agent↔tools) and A2A (agent↔agent) both reached neutral foundations.
The browser↔agent link is the one that did not.

### 6.5 The two clinching pieces of evidence

1. **assistant-ui** — one React chat library (~1.6M downloads/wk) — ships adapters for
   **twelve** backends: Vercel AI SDK, Eve (NDJSON), LangGraph, LangChain `useStream`, Google
   ADK, A2A, AG-UI, OpenCode, LocalRuntime, ExternalStoreRuntime, DataStream,
   AssistantTransport. **[VERIFIED]** If a standard existed, that list would have one row.
2. **Pydantic AI ships a pluggable `UIAdapter` base class** and states it "natively supports
   **two** UI event stream protocols", with the subclasses serving "as a reference for
   integrating with **other**" ones. **[VERIFIED]** A framework expecting convergence would not
   build a protocol abstraction layer.

### 6.6 So what should a browser-side parser conclude?

- **There is no standard to conform to.** Anyone shipping a browser chat client either picks a
  framework's protocol and inherits its lock-in, or parses provider SSE directly.
- **If you must pick one to interoperate with**, the Vercel UI Message Stream is the strongest:
  it is the only candidate with a frozen protocol version, a docs page written *for* non-JS
  backends, and independent emitters in three other ecosystems (Pydantic, Mastra, LlamaIndex).
- **But note what it costs**: consuming it means a server that runs the AI SDK (or reimplements
  its protocol), which is precisely the "the kit fetches" posture. Parsing provider SSE
  directly — what this kit does — is the option that requires no server framework, and the
  §5 finding is the price of that choice: you own the reasoning-field divergence yourself.
- The honest framing for docs: **provider SSE is the only thing you can parse without adopting
  someone's framework, and it is standard for `content` and `tool_calls` and nothing else.**

---

## 7. Things I could not verify — flagged

- **OpenRouter's DeepSeek rename is undocumented.** Verified behaviorally on both ends (§5.5c);
  no OpenRouter statement exists. Do not cite it as documented.
- **OpenRouter streaming placement of `annotations`** — schema puts it on `message`, not
  `delta`; no doc states when it is emitted mid-stream. **[COULD NOT DETERMINE]**
- **OpenRouter tool-argument fragmenting** — undocumented; their own example code would break
  under real fragmenting. **[COULD NOT DETERMINE]**
- **OpenRouter `index` on tool_calls** — prose says it exists, the JSON example omits it.
  **[CONFLICTING]**
- **LiteLLM streaming `reasoning_content`** — verified in source, **not** in docs (the docs page
  has no streaming example).
- **Whether OpenRouter ever surfaces that it ignored a param** — nothing documented; appears
  silent. **[COULD NOT DETERMINE]**
- **OpenAI ChatKit wire spec** — no public language-agnostic schema found.
  **[COULD NOT DETERMINE]**
- **AG-UI docs vs source disagree** on event count (16 vs 33). Source wins, but treat AG-UI
  documentation as unreliable.
- Version-sensitivity warning: `ai` ships three parallel majors and `@ag-ui/core` is pre-1.0.
  Everything in §1 is pinned to `ai@7.0.59` / `@ai-sdk/provider@4.0.7` as installed here;
  §6 npm figures are the week of 2026-08-14. Re-check before quoting.
