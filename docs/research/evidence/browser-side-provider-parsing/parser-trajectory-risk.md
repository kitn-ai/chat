# Parser trajectory risk — evidence review

Research date: 2026-08-14. Every claim is labelled **VERIFIED** (I read the cited source), **SECONDARY** (someone else's summary), or **COULD NOT DETERMINE**.

---

## The single most decision-relevant fact

**Every documented instance of the failure mode we are worried about happened in a server-side or desktop parser. Not one was a browser parser, and not one had a cause related to where the parser ran.**

Microsoft's .NET agent-framework silently dropped `reasoning_content` and closed the issue *not planned*. Effect-TS silently discarded whole chunks including tool-call arguments. Jan hard-failed an entire stream on an unknown `event:` name. All three are 2026, all three are server/desktop, all three are the exact class our `reasoning_content` gap belongs to (Q3, with URLs).

**Parser location is orthogonal to parser drift.** Moving parsing to a backend does not remove this liability, it relocates it into code someone still has to write and keep current — and the three teams above are the evidence of what that looks like when they fall behind. Any argument for "define your own protocol and make the backend conform" has to be made on grounds *other* than robustness, because the robustness evidence does not support it.

Two structural facts underwrite that, and neither can be wrong on a technicality:

- **Anthropic's versioning policy contractually forbids breaking the stream within a version** and instructs integrators to tolerate additions: "Anthropic may... **Add new variants to enum-like output values (for example, streaming event types)**" (<https://platform.claude.com/docs/en/api/versioning>) and "new event types may be added, and **your code should handle unknown event types gracefully**" (<https://platform.claude.com/docs/en/build-with-claude/streaming>). The version string has not moved since `2023-06-01`. A parser that ignores unknown events is **conforming, not lagging**.
- **The house-protocol alternative is the one with a breaking-change record.** OpenAI chat-completions: 0 breaking changes in 24 months. Anthropic Messages: 0. The Vercel AI SDK's own UI stream protocol: a confirmed breaking rewrite at v4→v5, with a second major migration in flight (Q2(e)).

The real risk is therefore not breakage and not the browser. It is **silent incompleteness in an unspecified extension space** — and that is a testing problem with a known, already-installed answer.

**And the architecture is convergent, not idiosyncratic.** Across ~20 surveyed projects, **zero** abandoned browser-side provider parsing, while three moved *toward* it (big-AGI added client-side direct fetch in Nov 2025; Jan deleted its normalizing backend; Chatbox consolidated into a client-side library). The invariant they independently landed on is this kit's: **a normalized protocol at the UI boundary, with the provider adapter free to run on either side.** LobeChat's `StreamProtocolChunk` (`text | reasoning | tool_calls | reasoning_signature | grounding | content_part | usage | stop | error`) is near-convergent evolution with our `MessagePart`. Only the adapter's *location* varies between projects; the normalized part model at the UI boundary is the constant.

---

## Q1 — Has anyone tried browser-side provider parsing and abandoned it?

**Short answer: I found no abandonment story. And the one library that is the reference implementation of the approach is not abandoning it — it is aggressively expanding it.** Both halves are evidence; the second is much stronger than the first, because a null result alone can always be dismissed as insufficient searching.

### Deep Chat is growing its browser parser fleet, not shrinking it (VERIFIED, first-hand)

Deep Chat's `directConnection` feature is browser-side provider parsing, exactly the thing under review. Measured directly against the repository today:

- **`directConnection` now covers 23 providers** — AssemblyAI, Azure, BigModel, Claude, Cohere, DeepSeek, Dify, Gemini, Groq, HuggingFace, Kimi, LiteLLM, MiniMax, Mistral, Ollama, OpenAI, OpenRouter, OpenWebUI, Perplexity, Qwen, Requesty, StabilityAI, Together, X. (VERIFIED: `gh api repos/OvidijusParsiunas/deep-chat/contents/website/docs/docs/directConnection`.)
- When the README disclaimer that everyone quotes was written, the supported list was **six**: "OpenAI, HuggingFace, Cohere, Stability AI, Azure, and AssemblyAI." (SECONDARY — that six-item list is what current search snapshots of the README/webcomponents.org listing still surface.) The fleet has roughly **quadrupled**.
- **The additions are recent and ongoing.** First-commit dates for the doc pages (VERIFIED via `gh api .../commits?path=...`, oldest commit): Kimi and Qwen added **2025-10-22**; **LiteLLM added 2026-06-09** — roughly two months before this review. Latest touches: LiteLLM 2026-07-19, Qwen/MiniMax 2026-06-15.
- npm `deep-chat@latest` is **2.5.0** (VERIFIED, npm registry).

A maintainer who had concluded browser-side provider parsing was a mistake would not have shipped a browser-side LiteLLM connector in June 2026.

### Correction to the brief's premise about Deep Chat and reasoning

The task stated Deep Chat's parsers have "no reasoning support at all at v2.5.0." **That is not accurate.** A code search finds `reasoning` in 17 files, including provider type modules for `openAI.ts`, `openRouter.ts`, `mistral.ts`, `perplexity.ts`, `requesty.ts`, `openWebUIResult.ts` and the Claude/Ollama direct-connection docs (VERIFIED, `gh api search/code q='reasoning repo:OvidijusParsiunas/deep-chat'`).

What Deep Chat *does* lack is the same thing we lack: **`reasoning_content` appears in zero files** (VERIFIED, same search, `total_count: 0`) — despite Deep Chat shipping first-party DeepSeek *and* LiteLLM connectors, the two integrations most likely to emit it. So the independent implementation of this exact feature, across 23 providers, has landed on the same gap. That reframes our known bug from "we fell behind" to "**the third spelling is a genuinely obscure corner that the most thorough implementer in this space also missed**."

### What the disclaimer actually says, and what it does not

Deep Chat's stated reason for discouraging `directConnection` in production is credential exposure and nothing else: the property "should be used for local/prototyping/demo purposes ONLY as it exposes the API Key to the browser," with the remedy being to "switch to using the `connect` property... along with a proxy service." (SECONDARY — consistent across the README, <https://deepchat.dev/docs/directConnection/>, and the npm listing.)

**Note the shape of that remedy: proxy the request. Not "stop parsing in the browser."** Deep Chat's recommended production posture and this kit's default architecture are the same posture — the key lives on a server, the browser consumes the stream. Deep Chat additionally supports parsing when the browser holds the key; we never do that at all.

### Null result, confirmed across ~20 projects

**No project has ever abandoned browser-side provider parsing — zero cases, for any reason.** The parallel sweep has now returned and found none.

*Never had it in the first place* (so not evidence either way): **CopilotKit** (`dangerouslyAllowBrowser` = 0; at `fb0b90e1`, Sept 2023, a thin wrapper over `ai/react`'s `useChat` — its Runtime *formalized* an already-server-side design rather than retreating to one) · **chatbot-ui** (`OpenAIStream` server-only from the MVP commit `758a1215`) · **assistant-ui** (`content_block_delta` = 0; no `react-openai` package ever published) · **LibreChat** · **Chainlit** (socket.io) · **Streamlit** (protobuf) · **Gradio** · **llamaindex chat-ui**.

*Still parsing in the browser today:* Deep Chat · SillyTavern · Open WebUI · big-AGI (opt-in) · LobeChat (opt-in) · Jan · Chatbox · NextChat · page-assist · KoboldAI Lite. **BetterChatGPT** is dormant since 2024-08-14 — project death, not migration.

Searches that returned nothing: `"parse the provider stream in the browser"` (0 hits globally), `"deprecate" directConnection`, `"no longer support" "direct connection"`, and ~80 LobeChat RFCs enumerated with **none** proposing moving parsing off the browser.

### The traffic runs the other way — three reverse migrations

1. **big-AGI *added* client-side direct fetch** in commit `7b664aff` (**2025-11-23**) — having already built AIX, a server-side normalized particle protocol — and reused *"the same wire protocols as the server."* Its `kb/systems/client-side-fetch.md` states the rationale verbatim: *"No 4.5MB upload limit… No 300s function timeout… More privacy… Costs: Slightly more downlink bandwidth… **Net: Direct Connection is a win on speed, limits, and privacy whenever the provider permits it.**"*
2. **Jan deleted its normalizing backend.** Through mid-2025 the renderer hit one URL (`${CORTEX_API_URL}/v1/chat/completions`) with cortex normalizing everything. The Tauri rewrite removed it: `web-app/src/lib/model-factory.ts` now constructs `createOpenAI` / `createAnthropic` / `createGoogleGenerativeAI` / `createXai` / `createMistral` **in the renderer**, streaming via `streamText`, sidestepping CORS with `@tauri-apps/plugin-http`.
3. **Chatbox consolidated into a client library, not a backend** — hand-rolled renderer parsers → Vercel AI SDK (PR #216, April 2025), still in the renderer, 27 providers.

**Open WebUI goes further:** its *backend* asks the *browser* to make the call — `generate_direct_chat_completion` raises "Direct connection requires an active WebSocket session," and the browser handles `request:chat:completion` and streams chunks back.

**SillyTavern is the closest structural match to this kit:** the server raw-passes (`// Pipe remote SSE stream to Express response`) and the browser parses. Its `getStreamingReply()` spans 7,249 lines across 35 sources, handling Claude `delta.thinking`, Google `thoughtSignature`, Cohere, DeepSeek and xAI.

### The invariant everyone converged on is this kit's architecture

**LobeChat states it structurally.** Even in client-fetch mode the browser never hands raw provider SSE to the UI: the same adapter parses the provider stream and re-emits LobeChat's *own* SSE protocol, which `fetchSSE` consumes. `packages/model-runtime/src/core/streams/protocol.ts` defines `StreamProtocolChunk` as `text | reasoning | tool_calls | reasoning_signature | grounding | content_part | usage | stop | error | …` — **near-convergent evolution with our `MessagePart`**.

**Only the adapter's location moves; the normalized protocol at the UI boundary is the constant.** That is exactly the split this kit ships: one parser set usable in either runtime, feeding a normalized part model. big-AGI, LobeChat and Deep Chat arrived at it independently.

### The strongest maintainer statement found — and it argues against one universal adapter

arvinxx (LobeChat, maintaining 85 providers), [RFC 090](https://github.com/lobehub/lobehub/discussions/6563), 2025-02-27:

> 一个 OpenAI Compatible 运行时已经无法满足这个分化趋势下的应用层需求了
> *("a single OpenAI-Compatible runtime can no longer meet application-layer needs under this divergence trend")*

> 如果仅仅锁死在 openai 的接口规范，会导致未来高阶特性的接入成本越来越高
> *("locking to the OpenAI spec alone makes integrating future advanced features ever costlier")*

**This is the argument against ever collapsing `readModelStream` into one universal adapter** — from the person who tried it at 85-provider scale. Keeping `readOpenAIStream` and `readAnthropicStream` as distinct formats is the validated design, not a shortcut.

One caveat retained: **the Vercel AI SDK is a near-miss, not a supporting case.** It normalized on a house protocol, but never had browser-side provider parsing to abandon — `useChat` always consumed an AI-SDK-shaped stream. Anyone citing it as "the industry moved away from provider parsing" is citing a road not travelled. (Its core *permits* browser use: lgrammel on [vercel/ai#3041](https://github.com/vercel/ai/issues/3041) — *"You can use the Anthropic AI SDK provider in the browser."*)

**On the question as asked — did anyone abandon it for reasons OTHER than credential exposure — the answer is: I found no one who abandoned it for any reason at all, and credential exposure remains the only stated objection anywhere, from Deep Chat, from Anthropic, and from OpenAI.**

---

## Q2 — How stable is the ground?

### Is chat-completions deprecated, in maintenance mode, or superseded?

**Not deprecated. Not scheduled for shutdown. But no longer where new capability lands.** VERIFIED on OpenAI's own pages:

- OpenAI's deprecations page lists 20+ entries from 2022–2026 and **does not list `/v1/chat/completions`**. It does list the Assistants API: deprecated 2025-08-26, shutdown 2026-08-26. — <https://developers.openai.com/api/docs/deprecations>
- The migration guide says, verbatim: **"While Chat Completions remains supported, Responses is recommended for all new projects."** — <https://developers.openai.com/api/docs/guides/migrate-to-responses>
- The same guide's capability table shows what is **Responses-only**: Web search, File search, Computer use, Code interpreter, MCP, Image generation, **Reasoning summaries**, and Audio ("coming soon"). Text generation, Vision, Structured Outputs and Function calling are on both. (VERIFIED, table reproduced from that page.)
- One capability is being actively *withdrawn* from chat-completions, which is the sharpest signal on the page: **"Starting with GPT-5.4, tool calling is not supported in Chat Completions with `reasoning: none`."** (VERIFIED, same page.)

**Read:** chat-completions is a stable, indefinitely-supported *transport* whose feature surface is frozen-ish and slowly eroding at the reasoning/tool-calling edge. The endpoint will not disappear. What it can *express* is what stops growing.

The frequently-quoted "OpenAI intends to support Chat Completions indefinitely" line is **SECONDARY** — I found it repeatedly in third-party summaries of the March 2025 Responses launch, but could not locate that exact sentence on a current OpenAI-owned page. The stronger, verifiable version is simply: it is absent from the deprecations list, and it is described as "remains supported."

### How much have the two formats actually changed in 24 months?

**Additive, almost without exception.** VERIFIED against OpenAI's changelog (<https://developers.openai.com/api/docs/changelog>), entries touching chat-completions Aug 2024 → Aug 2026:

| Date | Change | Kind |
|---|---|---|
| 2024-08-06 | Structured Outputs | additive |
| 2024-10-01 | Prompt caching | additive |
| 2024-11-04 | Predicted outputs | additive |
| 2024-12-17 | `reasoning_effort` param; `developer` message role | additive |
| 2025-05-20 | `strict` mode for tool schemas | additive |
| 2025-08-07 | GPT-5 family; `minimal` reasoning effort | additive |
| 2026-04-24 | GPT-5.5, 1M context | additive |
| 2026-08-05 | Fast mode for long context | additive |
| 2024-12-17 | o1-preview/o1-mini reject `system`/`developer` messages | **constraint on existing behaviour** |

The only wire-level *removal* I found is `system_fingerprint`, now marked **deprecated** in the chunk schema (VERIFIED, <https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events>) — a field a UI parser has no reason to read.

Anthropic over the same window added `thinking_delta`, `signature_delta`, `citations_delta`, and most recently a `fallback` content block emitted at model boundaries during server-side fallback — all new *variants* under the existing `content_block_start` / `content_block_delta` / `content_block_stop` envelope. The envelope itself has not changed since 2023-06-01. (VERIFIED, streaming + versioning pages.)

**Conclusion:** neither format has had a breaking change in the observation window. Both grew by addition. Additive change is exactly the kind a tolerant parser survives.

### The churn is real — but it comes from the emulators, not the owners

This is the correction that reorganises the whole risk picture. I searched specifically for *unannounced* wire changes (which by definition would not appear in a changelog). The hits are numerous, and almost all of them point at third parties:

- **Anthropic-format breakages found: every one is a server emulating the format, not Anthropic.** sglang emitting `text_delta` against an open `tool_use` block, crashing the official SDK with "Content block is not a text block" ([sgl-project/sglang#24293](https://github.com/sgl-project/sglang/issues/24293)); Kimi k2p5 via an anthropic-messages adapter producing "Unexpected event order: message_start before message_stop" ([openclaw#57523](https://github.com/openclaw/openclaw/issues/57523)); a proxy returning SSE even for `stream=false` ([sub2api#867](https://github.com/Wei-Shaw/sub2api/issues/867)). (VERIFIED titles/URLs; issue bodies SECONDARY via search summaries.)
- **OpenAI-format breakages: mostly emulators too** — MiniMax sending an empty `role` string in deltas ([MiniMax-AI/MiniMax-M2.5#2](https://github.com/MiniMax-AI/MiniMax-M2.5/issues/2)), vLLM omitting `"type":"function"` in streaming tool calls ([vllm-project/vllm#16340](https://github.com/vllm-project/vllm/issues/16340)), Azure's content-filter chunks.
- **Genuinely OpenAI-side and unannounced, two instances:** chunks with an **empty `choices` array** appearing first/last once `stream_options.include_usage` is requested (broke autogen and haystack — [microsoft/autogen#5078](https://github.com/microsoft/autogen/issues/5078), [deepset-ai/haystack#8780](https://github.com/deepset-ai/haystack/issues/8780)); and multiple JSON chunks arriving in a single SSE event without newline delimiting ([OpenAI community, "Was there an intentional change to the streaming responses?"](https://community.openai.com/t/was-there-an-intentional-change-to-the-streaming-responses-multiple-chunks-in-stream-event/603960)).

*(Both OpenAI-side cases are already covered in-tree: `packages/ui/src/wire/fixtures/openai/usage-only-final-chunk.sse` and `keepalive-comments.sse`. VERIFIED by listing.)*

**So the honest statement of the risk is not "provider formats churn."** It is: **the two formats we parse are owned by two stable publishers, and the instability lives in the unbounded long tail of servers claiming to speak them.** That tail is the same whether the parser runs in a browser or on a server — and a normalized house protocol does not shrink it either, because someone still has to parse the emulator's output somewhere.

### Is Responses a third protocol anyone serious eventually needs?

**Directionally yes, and the surface-area gap is large.** Partly VERIFIED, partly could-not-determine:

- Chat-completions streaming has **one** event shape: `chat.completion.chunk`, with a `delta` containing exactly five documented fields — `content`, `role`, `tool_calls`, `function_call` (deprecated), `refusal`. (VERIFIED, streaming-events reference above.)
- Responses streaming has dozens of named event types (`response.created`, `response.output_text.delta`, `response.reasoning_summary_text.delta`, `response.reasoning_text.delta`, `response.output_item.added`, …). **I could not get an exact count**: the reference page <https://developers.openai.com/api/reference/resources/responses/streaming-events> exceeded a 10 MB fetch limit. That failure is itself a crude measure of the surface-area difference against a chat-completions page that fetched without trouble.
- **The OpenCode reading is CONFIRMED, measured first-hand: `openai-responses.ts` is 1022 lines and is their largest protocol module, roughly 2× `openai-chat.ts` at 506.** Full table in Q3. So yes — Responses is a genuine third protocol, not a variant, and it costs about what a from-scratch provider format costs.

**The structural argument does not need the line count:** everything on OpenAI's Responses-only list — reasoning summaries, web search, file search, code interpreter, MCP, image generation — is only representable over the Responses protocol. A kit that never adds Responses is permanently unable to render OpenAI's reasoning summaries or built-in tool activity, regardless of how well its chat-completions parser is maintained.

---

## Q3 — The concrete failure mode of a parser fleet

### Our own instance, verified in-tree

`packages/ui/src/wire/formats/openai.ts` reads `delta.reasoning` (line 98) and `delta.reasoning_details` (line 97). **There is no occurrence of `reasoning_content` anywhere under `packages/ui/src/wire/`.** VERIFIED by grep. The premise holds.

The sharpest framing of this, which changes what the bug *is*: **OpenAI does not document any reasoning field in the chat-completions delta at all.** The documented delta is `content` / `role` / `tool_calls` / `function_call` / `refusal` — nothing else. (VERIFIED, streaming-events reference.) So `reasoning`, `reasoning_details` and `reasoning_content` are *all three* vendor extensions to an unspecified extension space. We are not behind OpenAI. We are covering two of N dialects in a space with no spec, no registry, and no arbiter.

### The reasoning-field fragmentation, mapped

| Source | Field in `choices[].delta` | Evidence |
|---|---|---|
| **OpenAI (chat-completions)** | **none — no reasoning field exists** | VERIFIED, <https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events>. Documented delta keys are `content`, `role`, `tool_calls`, `function_call`, `refusal`. Reasoning summaries are **Responses-only**. |
| **OpenRouter** | `reasoning` (plaintext) · `reasoning_details` (structured; "In streaming responses, `reasoning_details` appears in `choices[].delta.reasoning_details`") · **`reasoning_content` accepted as an alias** — "You can also use `reasoning_content` as an alias – it functions identically to `reasoning`" | VERIFIED, <https://openrouter.ai/docs/use-cases/reasoning-tokens> |
| **vLLM** (and anything served through it) | `reasoning_content` — "the `reasoning_content` field [is] available in the delta field in chat completion response chunks" | VERIFIED, <https://docs.vllm.ai/en/latest/features/reasoning_outputs/> |
| **DeepSeek** | `reasoning_content` historically; current docs foreground `thinking: {type: enabled}` / `reasoning_effort` **request** params and do not document the streaming delta shape | COULD NOT DETERMINE for the current API — <https://api-docs.deepseek.com/guides/reasoning_model> no longer specifies the response delta field |
| **DashScope / Alibaba** | `reasoning_content` | SECONDARY, via [microsoft/agent-framework#5327](https://github.com/microsoft/agent-framework/issues/5327) |

**Two things this table settles.**

1. **`reasoning_content` is not an exotic spelling — it is the most widely emitted one**, since every model served behind vLLM produces it, and OpenRouter accepts it as a first-class alias. Adding it is strictly additive with no ambiguity risk, because OpenRouter itself treats it as identical to `reasoning`.
2. **There is no "correct" field to have implemented.** OpenAI, the format's owner, specifies none. This is an extension space with three live spellings and no arbiter — which is why a *completeness* strategy is unachievable and a *tolerance* strategy is the only stable one.

**The fragmentation is structurally three-way, not just three names:** a sibling *string* (`reasoning` / `reasoning_content`), a *block array* (`reasoning_details`), and a *polymorphic `content`*. Field-name aliasing alone does not bridge those shapes.

### Everyone has this bug, including in mirror image

Three independent confirmations that this gap is a property of the ecosystem, not of us:

- **OpenCode reads only `reasoning_content`** (`packages/llm/src/protocols/openai-chat.ts:147`) — **the exact mirror image of our bug.** We read `reasoning` + `reasoning_details` and miss `reasoning_content`; they read `reasoning_content` and miss the other two. Neither is "behind"; there is no position that is ahead.
- **Deep Chat**, across 23 browser-side connectors including DeepSeek and LiteLLM, has **zero** occurrences of `reasoning_content`.
- **mozilla-ai/any-llm** (2.1k★, parametrizes every integration test across all 54 providers, using the OpenAI SDK's own Pydantic types as the oracle) hit it head-on and wrote the reason into the source — `types/completion.py:28`: *"OpenAI Completion API doesn't include reasoning information, so we need to extend the openai type."*

**Confirmed: no shared conformance suite or spec exists for OpenAI-compatible streaming.** The one artifact that could anchor one, `openai/openai-openapi`, does declare `text/event-stream` → `CreateChatCompletionStreamResponse` — but **its delta schema has no reasoning field at all**, its SSE envelope is described only in prose, and the codegen consumers sampled are frozen at spring 2024. There is nothing to conform to.

**A fourth instance that directly vindicates this repo's `lint:silent-drops` rule.** Chatbox's `gemini-stream-error-handling.md` documents a gateway writing `{"error":…}` into an HTTP-200 stream, where `@ai-sdk/google`'s `chunkSchema` has no `error` field and **Zod silently strips it** — their note: *"这是 SDK 的未文档化实现细节，不是公开契约"* ("this is an undocumented SDK implementation detail, not a public contract"). A schema-validating parser turned a server error into silence. That is the decode-side twin of the encode-side drop `lint:silent-drops` was built to catch, and it is the strongest external argument for extending that principle to the decode path.

One more instance of the class, in the tool that exists specifically to normalize providers: **[BerriAI/litellm#20246](https://github.com/BerriAI/litellm/issues/20246), "[Bug]: Streaming reasoning content missing for VLLM providers."** LiteLLM's entire product is provider normalization, and it still dropped streaming reasoning for a whole provider family. (VERIFIED title/URL; body SECONDARY.) **If the dedicated normalization layer has this bug, "normalize it on the backend" is not a fix for this class.**

### Independent instances of the same class (all found this session, all VERIFIED)

| Project | Issue | What was lost | Date | Where the parser ran |
|---|---|---|---|---|
| **microsoft/agent-framework** (.NET) | [#5327](https://github.com/microsoft/agent-framework/issues/5327) — "expose `delta.reasoning_content` (and similar) without raw SSE tap" | reasoning text from OpenAI-compatible vendors (DashScope et al.) silently dropped; reporter had to write "a delegating HttpClient handler that wraps the response stream in a tee/tap that scans `data:` lines" — self-described as "fragile" and "easy to break on minor protocol changes" | opened 2026-04-17, **closed as not planned** | server |
| **Effect-TS/effect-smol** | [#2337](https://github.com/Effect-TS/effect-smol/issues/2337) — "streamed SSE chunks that fail schema validation are dropped silently" | *whole chunks*, including streamed `tool_calls` argument deltas. Trigger: Fireworks AI sending `function.name: null` on tool-call continuation fragments, violating a non-nullable schema | opened 2026-06-04, fixed via PR #6667 | server |
| **janhq/jan** | [#8280](https://github.com/janhq/jan/issues/8280) — "SSE parser fails on custom event types from OpenAI-compatible API servers" | **the entire stream**. Parser treated all `data:` lines as `chat.completion.chunk` regardless of `event:` name; an `event: hermes.tool.progress` frame produced "Generation failed / Type validation failed" and no output at all | opened 2026-06-05, fixed in v0.8.4 | desktop client |

**Two things fall out of this table.**

1. **Every one of these is a server-side or desktop parser.** Not one is a browser parser, and not one of the causes has anything to do with where the parser runs. Moving a parser to the server does not fix this failure class; it relocates it.
2. **The three failure modes are ranked, and ours is the mildest.** Jan lost the whole stream (hard failure, loud). Effect-TS lost whole chunks including tool arguments (silent, severe). We lose one optional decoration from providers using a third spelling (silent, cosmetic-to-moderate). Strict schema validation — the "safer"-looking design — produced the two *worse* outcomes.

### Azure and the "OpenAI-compatible" fiction

VERIFIED / SECONDARY mix: Azure OpenAI returns HTTP 200 with `finish_reason: content_filter` and content "omitted or incomplete," and adds a `content_filters` array that "isn't part of the base OpenAI response schema, so the SDKs don't expose a typed property for it" (<https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/content-streaming>, Microsoft Q&A threads, [Azure/azure-sdk-for-js#28343](https://github.com/Azure/azure-sdk-for-js/issues/28343)). Gemini's OpenAI-compatibility layer generates its own CORS and schema complaints. **"OpenAI-compatible" is a marketing claim, not a conformance statement**, and I found no shared test suite anywhere that adjudicates it.

### How projects that maintain parser fleets keep them current

**OpenCode — verified first-hand, and the caller's reading is confirmed with one important correction.**

The repo now lives at `anomalyco/opencode` (`sst/opencode` redirects). Its protocol modules are in `packages/llm/src/protocols/`. Measured directly via the GitHub contents API:

| Module | Lines |
|---|---|
| `openai-responses.ts` | **1022** |
| `anthropic-messages.ts` | 855 |
| `bedrock-converse.ts` | 674 |
| `gemini.ts` | 512 |
| `openai-chat.ts` | 506 |
| `shared.ts` | 326 |
| `bedrock-event-stream.ts` | 87 |
| `openai-compatible-chat.ts` | **24** |

**The claim is accurate: `openai-responses` is ~1000 lines and is the largest protocol module — roughly 2× `openai-chat`.** That is the strongest available quantification of what adding Responses costs, from an independent implementation. It supports the reading that Responses is a genuine third protocol, not a variant.

**The correction, and it is the more useful half:** `openai-compatible-chat.ts` is **24 lines**, and it is not a parser at all. It reuses the OpenAI chat parser wholesale and changes only routing:

> "Route for non-OpenAI providers that expose an OpenAI Chat-compatible `/chat/completions` endpoint. **Reuses `OpenAIChat.protocol` end-to-end and overrides only the route id** so providers can be resolved per-family without colliding with native OpenAI."

So OpenCode does **not** maintain N parsers for N providers. It maintains **five real protocols** — OpenAI chat, OpenAI Responses, Anthropic Messages, Gemini, Bedrock Converse — and routes the entire OpenAI-compatible long tail (including OpenRouter, which has its own *test* but no separate protocol) through the single chat parser. **The fleet does not scale with provider count; it scales with genuinely distinct wire formats, of which there are about five in the world.** That is a materially smaller and better-bounded liability than "a parser per provider," and it is the same shape as our two-format design.

**Their maintenance mechanism is recorded fixtures**, verified by file listing in `packages/llm/test/`: per-protocol suites (`openai-chat.test.ts`, `openai-responses.test.ts`, `anthropic-messages.test.ts`, `gemini.test.ts`, `bedrock-converse.test.ts`, `openai-compatible-chat.test.ts`, `openrouter.test.ts`, `cloudflare.test.ts`) **plus a distinct recorded-replay tier** — `recorded-test.ts` as the harness, and `anthropic-messages.recorded.test.ts`, `openai-responses-cache.recorded.test.ts`, `gemini-cache.recorded.test.ts`, `bedrock-converse-cache.recorded.test.ts`, and a cross-provider `golden.recorded.test.ts`.

**We already run the same mechanism.** `packages/ui/src/wire/fixtures/` holds 26 files of captured real provider SSE across `anthropic/` and `openai/`, and `provenance.test.ts` requires every fixture to carry a complete provenance header (`fixture`, `capture`, `provider`, `model`, `captured`, `request`) — i.e. captures cannot be hand-written and pass. (VERIFIED in-tree.) On this axis we are at parity with the most rigorous implementation I found, and ahead of every project in the failure table above.

**No shared conformance suite exists** (see the `openai/openai-openapi` finding in the fragmentation section above — the one artifact that could anchor one has no reasoning field and a prose-only SSE envelope). Every project rolls its own fixtures.

### The rest of the field, ranked — and one cautionary tale

A survey of other projects maintaining parser fleets, from strongest mechanism to weakest:

- **`agentjido/req_llm` (Elixir) — the most rigorous found.** An explicit three-tier strategy, **2,766 fixture JSON files checked in**, a `provider_contract/1` macro, a drift module driven by a checked-in anchor matrix, and a `COMPATIBILITY.md` classifying every surface stable / experimental / deprecated.
- **`mozilla-ai/any-llm`** — parametrizes every integration test over all 54 providers, using the OpenAI SDK's own Pydantic types as the oracle. Strong per-capita, and it independently hit our exact gap (quoted above).
- **LangChain `stream_lifecycle.py`** — the only validator in the survey that checks accumulator *correctness* rather than liveness: it asserts the delta payloads equal the final payload, **and** that `last_chunk.chunk_position == "last"`, a required terminator without which `tool_call_chunks` never aggregate into `tool_calls`. Worth copying.
- **OpenCode** — per-protocol suites plus a recorded-replay tier; every protocol's test file is larger than or comparable to its source.
- **LiteLLM — weaker than its provider count implies.** `BaseReasoningLLMTests`, the base class that would catch exactly our bug, has **exactly one subclass** repo-wide (`tests/llm_translation/test_xai.py:168`). Nothing derives the set of reasoning-bearing providers from anything; the five duplicated `reasoning` → `reasoning_content` rename sites are hand-maintained, one of them mid-migration with a dated deadline comment.
- **`aimock`'s three-way drift detector** — the best *idea* in the survey, but its `DRIFT.md` framing oversells it: the "SDK types" leg is not extracted via the TypeScript compiler API, it is hand-written representative objects (`src/__tests__/drift/sdk-shapes.ts` says so outright), so the triangulation only works if someone remembers to update them.

**And the cautionary tale, which is the most transferable finding in this file.** Portkey's cross-provider driver iterates 78 providers and asserts only `expect(res.status).toEqual(200)`. Worse: every provider `continue`s when its API key is absent, and CI (`.github/workflows/run_tests.yml:34`) runs `jest src/` **without keys**. **In CI, that loop over 78 providers asserts nothing at all.** It has the complete file-tree shape of a cross-provider conformance suite and is a no-op in the pipeline.

Given this repo's own documented dominant failure mode — guards that pass while covering nothing — this is the one to internalise: **the shape of a conformance suite is not evidence of one.** Our `provenance.test.ts` requiring real capture metadata on every fixture is exactly the kind of check that makes the shape hard to fake, which is why it is worth keeping strict.


---

## Q4 — What could actually block a UI library that ships provider parsers?

Four candidate blockers, tested:

### (a) A provider going non-SSE — REAL, but for a different product

**VERIFIED.** OpenAI's Realtime API is WebRTC (browsers) / WebSocket (servers) / SIP (telephony), with no SSE option; OpenAI explicitly recommends WebRTC for browser and mobile clients (<https://developers.openai.com/api/docs/guides/realtime-webrtc>). Gemini's Live API (`BidiGenerateContent`) is likewise a stateful WebSocket API, while its `streamGenerateContent` text endpoint remains SSE via `alt=sse` (<https://ai.google.dev/gemini-api/docs/streaming>).

**Assessment:** this is not chat-completions being replaced by WebSockets. It is *real-time voice* being a different product with a different transport. Text chat streaming is SSE at OpenAI, Anthropic and Google today. The blocker is real only if the kit wants live voice, and it is a *new* surface rather than a break in the existing one.

### (b) A format that cannot be represented as flat parts — REAL and already visible

The Responses-only capability list (reasoning summaries, web search, file search, code interpreter, MCP, image generation) is the concrete version of this. Also note Anthropic's `signature_delta` and encrypted/redacted thinking: these carry opaque blobs that must survive a round trip verbatim. Any part model that cannot carry an opaque payload alongside readable text loses the ability to send the turn back. *(Our `reasoningRaw` / `reasoningSignature` fields exist precisely for this — VERIFIED in `packages/ui/src/wire/formats/anthropic.ts`.)*

### (c) Auth requiring a client SDK — NOT VISIBLE

Both providers are plain HTTP with a header (`x-api-key` / `Authorization: Bearer`). Anthropic's TypeScript SDK docs explicitly document making "custom/undocumented requests" and note the SDK "does not validate or strip extra properties from the response" — i.e. the wire is not privileged over hand-rolled HTTP. No provider I looked at gates streaming behind an SDK-only handshake. Bedrock/Vertex are the partial exception (SigV4 / GCP auth), but those are already server-side by construction.

### (d) Providers discouraging browser access — **does not apply to this architecture**

This is the one the question was pointed at, and the answer is clean.

**What `anthropic-dangerous-direct-browser-access` gates — VERIFIED first-hand by live preflight, 2026-08-14.** It gates the **CORS preflight itself**:

```
OPTIONS https://api.anthropic.com/v1/messages
  Origin: https://example.com
  Access-Control-Request-Headers: content-type,x-api-key,anthropic-version
→ HTTP 400, NO access-control-allow-origin        (CORS refused)

… same request, with anthropic-dangerous-direct-browser-access added to
  Access-Control-Request-Headers
→ HTTP 200, access-control-allow-origin: *        (CORS granted)
```

So the header is not a runtime flag the API inspects on the real call — **naming it in the preflight is what flips Anthropic from refusing to granting cross-origin access.** The commonly-quoted 401 "CORS requests must set..." text is SECONDARY (issue trackers incl. [ChainForge#367](https://github.com/ianarawjo/ChainForge/issues/367), [openai-translator#1685](https://github.com/openai-translator/openai-translator/issues/1685); feature first documented by Simon Willison, 2024-08-23, <https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/>); the preflight mechanism above is my own measurement.

**What the stated danger is — verbatim, from Anthropic's own SDK page (VERIFIED, <https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript>):**

> "Enabling the `dangerouslyAllowBrowser` option can be dangerous because **it exposes your secret API credentials in the client-side code**. Web browsers are inherently less secure than server environments, any user with access to the browser can potentially inspect, extract, and misuse these credentials."

Anthropic then names when it is *not* dangerous: internal tools with trusted users, and development/debugging with short-lived keys. **Credential exposure is the entire stated objection. There is no claim about parsing, format stability, or client-side correctness anywhere in it.**

**Why it does not touch us.** The header is a *request* header sent by whoever calls `api.anthropic.com`. In this kit the browser never does: `packages/ui/src/agent-tooling/integrations/anthropic.ts` emits a server route that reads `process.env.ANTHROPIC_API_KEY` (VERIFIED, line 327), and grep finds **zero** occurrences of `anthropic-dangerous-direct-browser-access` or `dangerouslyAllowBrowser` anywhere in `packages/ui/src` or `apps/docs`. The browser receives a stream its own server proxied. The header, the CORS preflight and the key-exposure risk are all upstream of the boundary this kit sits on.

### ⚠ CORRECTION to an earlier claim in this file

An earlier draft asserted, on the strength of OpenAI community threads, that `api.openai.com` sends no `Access-Control-Allow-Origin` and therefore browser calls to OpenAI are impossible. **That is wrong.** Live preflight, 2026-08-14, verified by me and independently by a parallel sweep:

```
OPTIONS https://api.openai.com/v1/chat/completions
  Origin: https://example.com
→ HTTP 200
  access-control-allow-origin: https://example.com
  access-control-allow-methods: GET, OPTIONS, POST
  access-control-max-age: 86400
```

**OpenAI grants CORS, echoing the origin, with no opt-in header required.** The community threads I relied on are stale or describe a different endpoint. The consequence: browser→OpenAI is *possible*, so "everyone must proxy anyway" is not a valid argument. The argument for proxying rests on credential exposure alone — which is exactly what the providers say, and it remains sufficient.

**The real constraint is CORS coverage, and it is measurable rather than rhetorical.** In LobeChat's catalogue — the largest surveyed — **41 of 85 provider definitions carry an active `disableBrowserRequest: true`**, i.e. roughly half of all providers cannot be called from a browser at all. *(Only 11 of those 41 record an in-file reason — 9 `// CORS error`, 2 `// CORS Error`; the other 30 are unannotated. A parallel sweep initially reported "most are annotated" and self-corrected.)* And the number **moves**: Anthropic was disabled in [lobehub#3359](https://github.com/lobehub/lobehub/pull/3359) (2024-07-29) and **re-enabled** in [#3798](https://github.com/lobehub/lobehub/pull/3798) (2024-09-06) once browser support shipped.

**Precision worth keeping:** the objection to browser-side provider *calls* is well-documented, real, and quantifiable as a CORS ratio that changes month to month. The objection to browser-side provider *parsing* is a different claim, and I found no source making it. Cite the ratio, never a capability claim — it is a fact about providers' headers, not about our code.

### (f) ⚠ The one genuinely NEW risk this review surfaced — untrusted stream content

**This is the only candidate blocker I did not anticipate, and it is real.** Open WebUI **v0.6.35 (2025-11-06)** blocked event emission from direct-connected model servers after an **SSE code-injection flaw let an untrusted model server execute JavaScript in the browser.**

The threat model is specific and it *does* apply to any browser-side parser: when the stream is parsed client-side, **whoever controls the upstream server controls a payload that reaches the browser's execution context.** For an app pointed at a trusted first-party provider through its own proxy this is inert. For an app where the *user* supplies a base URL — a "bring your own endpoint" or self-hosted-model feature — the model server is untrusted input.

Note the response: Open WebUI **narrowed the capability, it did not abandon browser parsing.** The mitigation is the ordinary one — never let stream content reach an execution sink, treat every field as data, and be especially careful with anything a part model renders as HTML or passes to a component. Worth an explicit audit of our part-rendering path against a hostile fixture; it is a different failure class from everything else in this file, because it is a *security* bug rather than a fidelity bug.

### (e) The counterfactual nobody costed: is the normalized-protocol alternative more stable?

**No. In this observation window it was measurably *less* stable.** This is the finding I did not expect and it is the strongest single argument in the file.

The Vercel AI SDK is the reference implementation of "define your own browser protocol and make the backend conform." Its UI Message Stream protocol defines roughly 25 event types — `start`, `finish`, `abort`, `text-start`/`text-delta`/`text-end`, `reasoning-start`/`reasoning-delta`/`reasoning-end`/`reasoning-file`, `source-url`, `source-document`, `tool-input-start`/`tool-input-delta`/`tool-input-available`/`tool-approval-request`/`tool-approval-response`/`tool-output-available`/`tool-output-denied`, `data-*`, `custom`, `file`, `error`, `start-step`, `finish-step` — and a custom backend **must** emit exactly that format, announcing itself with `x-vercel-ai-ui-message-stream: v1`. There is no documented path to feed `useChat` a raw provider stream. (VERIFIED, <https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol>.)

That protocol surface is *larger* than the chat-completions delta (5 fields) and comparable to Anthropic's event set. **The complexity is not eliminated by normalizing; it is relocated to a server the consumer is now obliged to run, plus a protocol the library now owns forever.**

And it broke. AI SDK 5 (VERIFIED, published 2025-07-31, <https://vercel.com/blog/ai-sdk-5>): "The AI SDK now uses Server-Sent Events (SSE) as its standard for streaming data from the server to the client," alongside a new `UIMessage` / `ModelMessage` split where "UIMessage: This is the *source of truth* for your application state." Third-party migration write-ups are blunter about the consequence — v5 "replaces the custom protocol entirely with standard SSE, which is architecturally cleaner but breaks existing streaming implementations," and custom backends had to be rewritten (SECONDARY: <https://www.pkgpulse.com/guides/vercel-ai-sdk-5-migration-2026>, <https://lukasnotes.dk/migrating-v4-to-v5-in-vercels-ai-sdk>). A v5→v6 migration guide now exists as well (SECONDARY: <https://ai-sdk.guide/migration/>).

**Scoreboard for the last ~24 months:**

| Format | Breaking changes to the stream contract |
|---|---|
| OpenAI chat-completions SSE | 0 |
| Anthropic Messages SSE | 0 (version string unchanged since 2023-06-01) |
| Vercel AI SDK UI stream protocol | 1 confirmed (v4→v5), a second major migration in flight (v5→v6) |

The provider formats are the *stable* layer. A house protocol is a layer you must version yourself, and versioning it is what breaks consumers.

---

## Honest risk assessment

### What would have to become true for this to be a mistake

| # | Condition | Visible today? |
|---|---|---|
| 1 | A provider ships a **breaking** (not additive) change to a streaming format we parse | **No.** Zero breaking changes to either format in 24 months; Anthropic's versioning policy contractually forbids it within a version, and the version has not moved since 2023-06-01. |
| 2 | The parser count grows past what a small team can maintain | **No — and this is better-bounded than it looks.** OpenCode, an independent implementation, covers the entire provider landscape with **five** real protocols and routes every "OpenAI-compatible" provider through one 24-line re-route of its chat parser. The fleet scales with distinct wire formats (~5 in existence), not with provider count. |
| 3 | Silent-drop incidents accumulate faster than they are caught | **Yes — this is the live risk, and the only one.** One confirmed instance in-tree (`reasoning_content`), in a spelling space OpenAI never specified and nobody arbitrates. Three independent projects hit the same class this year. |
| 4 | Text chat streaming stops being SSE | **No.** OpenAI, Anthropic and Google all stream text over SSE today. Non-SSE transports (WebRTC/WebSocket) exist only for realtime voice, which is a new surface rather than a break in this one. |
| 5 | Providers block or discourage parsing a stream a consumer's own server proxied | **No, and there is no mechanism by which they could.** Once the consumer's server has the bytes, the provider has no say in what parses them. Every documented objection — Anthropic's, Deep Chat's, OpenAI's — is about credentials in the browser. |
| 6 | Someone demonstrates that server-side parsing avoids the drift problem | **No — the evidence runs the other way.** All three independent drift failures found this session were in server-side or desktop parsers. |
| 7 | The approach gets abandoned by its practitioners | **No — the opposite, now confirmed across ~20 projects.** Zero abandonments. Deep Chat grew from 6 to 23 providers; big-AGI *added* client-side fetch (2025-11-23); Jan *deleted* its normalizing backend; Chatbox consolidated client-side. |
| 8 | The normalized-protocol alternative proves more stable | **No — it proved less stable.** The AI SDK's house protocol broke at v4→v5; the provider formats it wraps did not break at all. |
| 9 | **Untrusted stream content becomes an attack surface** | **Yes, conditionally — the one new risk found.** Open WebUI patched an SSE code-injection flaw in v0.6.35 (2025-11-06) where an untrusted model server could run JS in the browser. Inert when the upstream is a trusted first-party provider behind the consumer's proxy; **live the moment a user supplies their own base URL.** They narrowed the capability rather than abandoning browser parsing. |
| 10 | Browser calls become impossible on CORS grounds | **No — but it is the real constraint and it is measurable.** 41 of 85 LobeChat providers set `disableBrowserRequest: true`. The number moves both ways (Anthropic disabled 2024-07, re-enabled 2024-09). Irrelevant to a proxied stream, which is our default. |

### The honest summary

**Conditions 3 and 9 are the only live ones. Neither is architectural.** Condition 3 (silent incompleteness) is a maintenance problem with infrastructure we already have. Condition 9 (untrusted stream content) is a security audit scoped to the bring-your-own-endpoint case.

Nothing in the evidence suggests browser-side parsing is a category error, and the survey makes the positive case rather than merely failing to make the negative one: **~20 projects, zero abandonments, three migrations toward it, and independent convergence on this kit's exact split.** The peer libraries that "define their own protocol and make the backend conform" are not avoiding these parsers — they are *relocating* them into a backend that someone still has to write and keep current, and Microsoft, Effect-TS, Jan and LiteLLM all show what happens when that someone falls behind.

The two genuine strategic exposures are narrower than "browser parsing was wrong":

1. **Extension-space coverage.** `reasoning_content` is not an isolated miss, it is the first sighting of an unbounded class: undocumented vendor fields on a format whose owner documents five delta keys. Crucially this class is bounded by *tolerance*, not by *completeness* — a parser that never throws and never drops a whole chunk degrades to "missing a decoration," the mildest outcome in the Q3 table, while the two projects that chose strict validation got the two severe outcomes. We already have that tolerance and already assert it (`default: return []` in both format modules, plus the two tests cited below). The residual exposure is narrow: coverage of *specific* vendor spellings, and the fact that the repo's "decide loudly" principle is enforced only on the encode side (`lint:silent-drops` covers `src/wire` parts→request, not stream→parts), so a decode-side drop is silent by construction.
2. **Responses is a real gap with a real deadline attached to nothing.** Nothing forces it. But reasoning summaries and built-in tool activity from OpenAI are unreachable without it, and that gap widens every release.

### What the evidence actually supports doing

- **Add `reasoning_content`, and treat the reasoning-field space as open.** Accept all three spellings with a documented precedence. The existing `reasoning` > `reasoning_details` ordering already exists to dodge OpenRouter's doubling trap (`openai.ts:88-90`); `reasoning_content` slots in as a peer of `reasoning`, which is exactly how OpenRouter itself defines it ("functions identically"). This is the single highest-value change in the file: it is a few lines, it closes the known instance, and it covers **every vLLM-served model**, which is the largest self-hosted surface in the ecosystem. Note that OpenCode has the *mirror* bug (reads only `reasoning_content`) and Deep Chat has ours — accepting all three spellings would make us the most complete implementation of the three, at a cost of roughly a line each.
- **The recorded-fixture suite is the right mechanism and it already exists** — `packages/ui/src/wire/fixtures/` holds 26 files of real captured SSE across `anthropic/` and `openai/`, with a `provenance.test.ts`. That is more conformance infrastructure than most of the projects that hit these bugs had. Extending it per dialect is the maintenance answer.
- **Audit the part-rendering path against a hostile fixture** (new, from Q4(f)). Open WebUI shipped a fix for an untrusted model server executing JS in the browser via SSE. Scope: anything a part model renders as HTML or hands to a component. Inert for trusted-provider-behind-our-proxy; live for any bring-your-own-endpoint feature. This is a security class, not a fidelity class, and it is the only genuinely new risk this review surfaced.
- **Do not collapse `readOpenAIStream` and `readAnthropicStream` into one universal adapter.** LobeChat RFC 090 is the direct evidence: the maintainer of an 85-provider catalogue concluded a single OpenAI-compatible runtime "can no longer meet application-layer needs under this divergence trend."
- **Borrow LangChain's terminator assertion.** `stream_lifecycle.py` is the only validator found that checks accumulator *correctness*: delta payloads must equal the final payload, and the last chunk must carry an explicit terminator, without which tool-call chunks never aggregate. That is a cheap, high-yield addition to our fixture replay.
- **Tolerance is already asserted — extend it to the two scenarios that bit others.** VERIFIED in-tree: `packages/ui/src/wire/formats/anthropic.test.ts:206` asserts "ignores ping, message_stop and any unrecognized event without throwing", and `openai.test.ts:151` asserts "returns [] for frames that carry nothing, and never throws". Both format modules end in `default: return []`. **This is why neither the Jan nor the Effect-TS failure can happen here** — note it is the non-throwing format layer that protects us, not event filtering, since `read.ts` ignores `event:` names entirely (`read.test.ts:91`). What is *not* asserted is the exact Effect-TS trigger: an otherwise-valid chunk carrying an unexpected or wrongly-typed extra field (e.g. `function.name: null`) must still yield its tool-argument delta. Add that case and the OpenAI-side equivalent of the Anthropic unknown-event test.
- **Decide the Responses question on product grounds, not risk grounds.** It is a ~1000-line protocol (OpenCode's measurement) and it is the only way to reach OpenAI reasoning summaries, web/file search, code interpreter, MCP and image generation. Nothing about the current architecture makes it harder to add later. It is a feature investment, not a migration, and nothing in this file argues it is urgent.
- **Do not use "others abandoned this" as a reason to change course.** No such case was found, and the closest thing to a practitioner verdict runs the other way: Deep Chat shipped a *new* browser-side connector two months ago.

---

## What I could not determine

- The exact number of Responses API streaming event types (its reference page exceeds a 10 MB fetch limit).
- Whether OpenAI has ever stated in writing on a currently-live OpenAI-owned page that Chat Completions will be supported "indefinitely." The verifiable version is weaker but sufficient: absent from the deprecations list, described as "remains supported."
- DeepSeek's *current* first-party streaming delta field for reasoning; their docs now document request-side `thinking`/`reasoning_effort` but not the response delta shape.
- Whether an OpenAI-owned page states the `api.openai.com` CORS policy; the no-`Access-Control-Allow-Origin` behaviour is consistently reported by developers but I found no official statement.
- Whether the ~20-project abandonment survey missed a quiet deletion years ago. It is still "no evidence found," not "evidence of absence" — but the positive evidence (three migrations *toward* browser parsing, independent architectural convergence) does not depend on the null result holding.

### One claim in an earlier draft of this file was WRONG

I asserted `api.openai.com` sends no `Access-Control-Allow-Origin`, sourced from OpenAI community threads. **Live preflight disproves it** — OpenAI grants CORS and echoes the origin, no opt-in header needed (full trace in Q4(d)). The argument it supported ("everyone must proxy anyway") is retracted. The conclusion is unaffected: proxying is justified by credential exposure alone, which is what the providers actually say. Flagging it because it is exactly the failure this repo's conventions warn about — the more quotable version of a finding was the wrong one.

### Provenance

Splitting by who verified what:

- **My own first-hand measurement:** the OpenCode line-count table and test-file listing, the reasoning-field table, our in-tree `wire/` code and fixtures, Deep Chat's provider count and commit dates, and every GitHub issue cited in the drift table.
- **Independently cross-validated:** the OpenCode `openai-responses.ts` = **1022 lines** figure was measured twice, by me via the GitHub contents API and by the sweep via a clone at `4643e65` (2026-08-14). Same number. That is the claim the caller asked to verify, and it is confirmed by two independent methods.
- **Live network measurement by me, 2026-08-14:** the OpenAI and Anthropic CORS preflight traces in Q4(d), including the discovery that naming `anthropic-dangerous-direct-browser-access` in `Access-Control-Request-Headers` is what flips Anthropic from 400/no-ACAO to 200/`*`. A parallel sweep reached the same conclusion about OpenAI independently.
- **Not re-run by me:** the ranked survey of maintenance mechanisms (req_llm, any-llm, LangChain, LiteLLM, aimock, Portkey) and the ~20-project abandonment survey (LobeChat's 41/85 CORS ratio, big-AGI's commit `7b664aff`, Jan's `model-factory.ts`, SillyTavern's `getStreamingReply`, RFC 090, the Open WebUI CVE). These rest on the sweeps' clones and fetches. The file paths, line numbers and commit hashes quoted are their observations, not mine. Both reported their own caveats and each self-corrected one sub-finding (aimock's drift detector downgraded; the LobeChat annotation count corrected from "most" to 11 of 41), which is a good sign for the rest — but treat them as one remove from primary.
