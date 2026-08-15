# Peer UI libraries and provider wire formats

Research date: 2026-08-14. All source claims come from shallow clones of the repos at the commits noted, or from official docs pages fetched the same day. Evidence labels: **[SRC]** = read in source, **[DOC]** = official docs, **[2ND]** = secondary report, **[?]** = could not determine.

---

## Verdict up front

**(c) is closest to true, with one important exception.**

Every peer that is (i) actively maintained, (ii) at meaningful scale, and (iii) positioned as a *library* rather than an *app* defines its own browser-facing protocol and requires the backend to conform. Provider-native SSE is parsed **server-side**, in a package the UI kit does not ship to the browser.

The exception is Deep Chat — the one genuinely comparable framework-agnostic web-component chat kit — which ships 25 provider-native parsers that run in the browser. But Deep Chat's own README labels that path prototype-only, and its production path is the same as everyone else's: its own tiny protocol, backend conforms. So even the exception endorses (c) for production.

So: **shipping provider-native parsers is unusual among UI libraries.** It is *normal* among the layer beneath them (AI SDK, TanStack AI adapters, LibreChat's API, Open WebUI's Python backend, CopilotKit's runtime) — but that layer is server-side in every case I checked.

Full reasoning, including the strongest case against our approach, is at the bottom.

---

## 1. assistant-ui

Clone: `assistant-ui/assistant-ui` @ `46a15f4`, 2026-08-14. ★11.6k. `@assistant-ui/react` 0.15.14.

**What it parses.** Never provider-native SSE. I grepped the entire `packages/` tree for OpenAI-native chunk shapes (`chat.completion.chunk`, `choices[0].delta`) and got **zero hits** [SRC]. Anthropic-native event names (`content_block_delta`, `input_json_delta`) appear only inside `packages/react-langgraph/` and `packages/react-langchain/` — i.e. re-parsing LangChain's *re-emission* of Anthropic events, not Anthropic's own stream [SRC: `packages/react-langgraph/src/convertLangChainMessages.ts:195`].

What it does parse is its own protocols, in `packages/assistant-stream/`: a generic SSE encoder/decoder (`src/core/utils/stream/SSE.ts`) plus the "data stream" and "assistant transport" formats [SRC]. It also parses A2A, AG-UI, Google ADK, and Pi protocols in dedicated adapter packages — all of which are *agent* protocols, not provider protocols.

**What it requires beneath it.** `@assistant-ui/react`'s dependency list contains **no** provider SDK and **no** `ai` package [SRC: `packages/react/package.json` — deps are radix, zustand, zod, `assistant-stream`]. `assistant-stream` itself depends on nothing but `nanoid`, `secure-json-parse`, and a schema spec [SRC].

Four documented custom-backend paths [DOC: `apps/docs/content/docs/runtimes/custom/overview.mdx`]:

| Path | Contract |
|---|---|
| `LocalRuntime` | You write `ChatModelAdapter.run` and return assistant-ui's own part model |
| `ExternalStoreRuntime` | You own the message array; provide callbacks |
| `DataStream` | Your backend emits assistant-ui's data-stream protocol |
| `AssistantTransport` | Your backend streams agent-state snapshots |

The `ChatModelAdapter` type is the load-bearing detail: `run()` must return `ThreadAssistantMessagePart[]` — assistant-ui's own normalized part union [SRC: `packages/core/src/runtime/utils/chat-model-adapter.ts`]. **assistant-ui does not parse a provider stream for you; it defines the shape you must produce and makes producing it your problem.** The canonical docs example is not even streaming — it's `await result.json()` against `<YOUR_API_ENDPOINT>` [DOC: `runtimes/custom/local-runtime.mdx`].

**Framework reach.** Published: React only. There are `packages/svelte/` and `packages/vue/` in the repo, both at version `0.0.0`, and **neither is on npm** (`npm view @assistant-ui/svelte` → 404; same for vue) [SRC + npm registry]. Also ships React Native and React Ink targets. So: React-only in practice, with in-progress ports.

**Model switching.** No opinion at the UI layer — the runtime carries a `runConfig` / `ModelContext` and the backend decides. Wire format is fixed by whichever runtime you picked; the provider is invisible to the UI.

**Evidence quality:** high. Source read directly.

---

## 2. CopilotKit

Clone: `CopilotKit/CopilotKit` @ `4d569c1`, v1.68.1, 2026-08-14. ★36.8k. (Clone needs `GIT_LFS_SKIP_SMUDGE=1`.)

**What it parses.** The client parses **AG-UI protocol** SSE, nothing else. `packages/core/src/agent.ts:629` sets `Accept: text/event-stream` and consumes AG-UI events via `@ag-ui/client` [SRC]. I grepped every client package (`react-core`, `react-ui`, `core`, `vue`, `angular`, `web-components`) for provider-native chunk shapes and for `api.openai.com` / `api.anthropic.com`: **zero hits** [SRC].

Provider-native parsing exists, and lives entirely in `packages/runtime/` — the Node server package. `packages/runtime/src/service-adapters/` contains `openai/`, `anthropic/`, `bedrock/`, `google/`, `groq/`, `langchain/`, `unify/` [SRC]. That package is also the only one carrying provider SDKs: `openai`, `@anthropic-ai/sdk`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@langchain/*` [SRC: `packages/runtime/package.json`]. Every client package's provider-ish dependency is `@ag-ui/client` / `@ag-ui/core` and nothing more.

**What it requires beneath it.** An AG-UI-compatible backend — either CopilotKit's own runtime or any third party speaking AG-UI (LangGraph, Claude Agent SDK, AWS Strands, Google ADK) [DOC: docs.copilotkit.ai]. CopilotKit authored AG-UI, so this is textbook (c): invent the browser-facing protocol, push the provider problem down.

**Framework reach.** Genuinely broad, and this is the most directly relevant peer datapoint for our niche: `@copilotkit/react-core`, `react-ui`, `react-native`, `vue`, `angular`, and **`@copilotkit/web-components` v1.68.1** — described as "Framework-agnostic shadow-DOM web components for CopilotKit" [SRC: package.json]. Before reading that as competition: it contains exactly **one** element, `<copilotkit-threads-drawer>`, built on Lit [SRC: `packages/web-components/src/` is a single `threads-drawer/` directory]. It is a thread-list drawer, not a chat kit. Their chat UI is still React/Vue/Angular components.

**Model switching.** Not a UI concern at all. The client sends messages to an AG-UI endpoint; provider and model selection happen in the runtime's service adapter.

**Diagnosability note.** `packages/runtime/src/agent/converters/aisdk.ts:404` carries the literal comment *"Unknown event types are silently ignored"* [SRC]. That is the exact failure mode we're designing against, shipped and commented.

**Evidence quality:** high for source claims; the "any AG-UI backend" framing is [DOC].

---

## 3. Vercel `ai-chatbot` template

Clone: `vercel/ai-chatbot` (redirects to `vercel/chatbot`) @ `c2f8235`, 2026-07-08. ★20.8k.

**What it parses.** The browser parses the **AI SDK UI Message Stream protocol**. The route returns `createUIMessageStreamResponse({...})` [SRC: `app/(chat)/api/chat/route.ts:405`]; the client uses `@ai-sdk/react` 4.0.16 with `ai` 7.0.15 [SRC: `package.json`]. This is explicitly the AI SDK's own protocol, not a provider's — custom backends must set the header `x-vercel-ai-ui-message-stream: v1` to speak it [DOC: ai-sdk.dev/docs/ai-sdk-ui/stream-protocol]. Provider-native SSE is parsed inside the AI SDK's server-side provider packages and never reaches the browser.

**What it requires beneath it.** Hard-requires the Vercel AI SDK, and now also the **AI Gateway**: `lib/ai/providers.ts` is down to `gateway.languageModel(modelId)` with a mock branch for tests — there is no longer a per-provider `createOpenAI`/`createAnthropic` in the template at all [SRC].

**Framework reach.** Next.js/React only. It's a template, not a library.

**Model switching.** The most aggressively normalized of anything I looked at. `lib/ai/models.ts` is a flat list of gateway model ids (`deepseek/deepseek-v3.2`, `moonshotai/kimi-k2.5`) with an optional `gatewayOrder` for provider failover [SRC]. The wire format is not per-request and not switchable — it is normalized away twice: once by the gateway (provider → AI SDK model interface), once by `toUIMessageStream` (AI SDK → browser protocol). The picker changes a string; nothing about parsing changes.

**Evidence quality:** high.

---

## 4. LibreChat

Clone: `danny-avila/LibreChat` @ `eaef87f`, 2026-08-14. ★42k.

**What it parses.** The React client parses **LibreChat's own SSE event vocabulary**: `data.final`, `data.created`, `data.event === 'title'`, `ON_CONTEXT_USAGE`, `ON_TOKEN_USAGE`, `ON_PENDING_ACTION`, `ON_MESSAGE_DELTA`, `ON_REASONING_DELTA`, `ON_PENDING_ACTION` [SRC: `client/src/hooks/SSE/useSSE.ts:120–180`]. Nothing provider-shaped.

**What it requires beneath it.** Its own Node API. Provider SDKs are exclusively in `api/package.json`: `openai` 5.8.2, `@anthropic-ai/vertex-sdk`, `@aws-sdk/client-bedrock-runtime`, `@google/genai`. `client/package.json` and `packages/data-provider/package.json` have **zero** provider dependencies [SRC].

**Framework reach.** React only, and not shipped as a library — it's an app.

**Model switching.** The client sends an `endpoint` + model to `/api/agents/{endpoint}` [SRC: `packages/data-provider/src/createPayload.ts`]; the server picks the provider client. The browser's wire format never changes.

Worth noting for us: LibreChat has *resumable* streams (`useResumableSSE.ts` splits generation-start POST from a GET subscription) — a feature that is only tractable because they own both ends of the protocol [SRC].

**Evidence quality:** high.

---

## 5. Open WebUI

Clone: `open-webui/open-webui` @ `01f4282`, 2026-07-27. ★148.8k. SvelteKit frontend, FastAPI backend.

**This is the one peer whose browser code genuinely parses a provider-native format** — and the qualification matters.

**What it parses.** `src/lib/apis/streaming/index.ts` uses `eventsource-parser/stream` and reads `parsedData.choices?.[0]?.delta?.content` — OpenAI chat-completions SSE, parsed in the browser [SRC, 142 lines total]. It also special-cases its own extensions on the same stream: `sources`, `selected_model_id`, `usage`.

**But there is only ever one wire format**, because the Python backend normalizes everything to OpenAI-compatible SSE before it reaches the browser: `backend/open_webui/utils/response.py:235 convert_streaming_response_ollama_to_openai`, `backend/open_webui/utils/anthropic.py:136 convert_anthropic_to_openai_payload` and `:468 convert_openai_to_anthropic_response`, plus a whole `convert_payload_openai_to_ollama` family [SRC]. So the frontend "parses OpenAI" in the same sense that a Postgres client "parses Postgres" — it is the house format, not a provider choice.

**Framework reach.** Svelte, app not library.

**Model switching.** Picker sends a model id to the Python backend, which routes to `routers/openai.py` / `routers/ollama.py` / pipelines and converts back. Wire format at the browser is fixed.

**Evidence quality:** high.

---

## 6. Deep Chat — the actual closest comparable

Clone: `OvidijusParsiunas/deep-chat` @ `accb119`, v2.5.0, 2026-08-07. ★3.7k.

This is the only substantial framework-agnostic web-component AI chat kit I could find. A GitHub search for web-component chat repos above 150 stars, plus a `topic:web-components topic:chatbot` search, returned Deep Chat and then a cliff — next candidates are at 54, 20, 5, and 1 stars [SRC: `gh api search/repositories`]. **If you want the headline: our niche has exactly one incumbent.**

**What it parses.** Provider-native SSE, in the browser, for **25 services** [SRC: `component/src/services/` has 25 directories — openAI, claude, gemini, cohere, mistral, groq, deepSeek, kimi, qwen, miniMax, together, perplexity, openRouter, requesty, liteLLM, bigModel, dify, ollama, openWebUI, azure, huggingFace, stabilityAI, assemblyAI, x, plus shared utils]. Streaming goes through `@microsoft/fetch-event-source` [SRC: `component/src/utils/HTTP/stream.ts`]. The Claude parser handles `content_block_delta`/`text_delta`, `content_block_start`+`tool_use`, `input_json_delta` accumulation, and `message_delta`+`stop_reason:'tool_use'` [SRC: `component/src/services/claude/claudeIO.ts:110–145`]. It sets `anthropic-dangerous-direct-browser-access: true` and hits `https://api.anthropic.com/v1/` from the page [SRC: `services/claude/utils/claudeUtils.ts:19`].

**So this is a (b) datapoint — but read the caveat.** Their README, on the `directConnection` property that enables all of the above:

> "this approach should be used for local/prototyping/demo purposes ONLY as it exposes the API Key to the browser. When ready to go live, please switch to using the `connect` property … along with a proxy service" [SRC: `README.md:142`]

**The production path (`connect`) is its own protocol**, and a very thin one: responses are `{text: "..."}`, `{html: "..."}`, `{files: [...]}`, optionally `{role, overwrite}`; streaming is SSE carrying those same objects [DOC: `website/docs/docs/connect.mdx`]. Deep Chat ships example proxy servers for exactly this.

So Deep Chat is (b) for demos and (c) for production, and it says so.

**Two things to take seriously about the (b) half:**

1. **It rots.** I grepped the Claude and OpenAI chat parsers for `thinking_delta` / `reasoning` and got **zero hits** [SRC]. As of v2.5.0 those parsers do not surface extended thinking from either provider. Twenty-five parsers is twenty-five things to keep current, and this one is visibly behind.
2. **It fails silently by construction.** `claudeIO.ts` ends with `// Return empty for other event types (message_start, content_block_start, etc.)` followed by `return {[TEXT]: ''}` [SRC:139–140]. Any frame it does not recognise contributes an empty string. That is precisely "frames received, no output produced", shipped, with no signal.

**Framework reach.** True web component; `other-packages/react` provides a React wrapper. Dependencies: `@microsoft/fetch-event-source`, `remarkable`, `speech-to-element` — no provider SDKs [SRC].

**Model switching.** `directConnection` is a config object with one optional key per provider [SRC: `component/src/types/directConnection.ts`]. Wire format is per-provider and picked by which key you set — the only peer where the browser's parser is selected by config. Each provider config carries its own `model?: string`.

**Evidence quality:** high.

---

## 7. TanStack AI

Clone: `TanStack/ai` @ `9a4124d`, 2026-08-14. ★3k. Fast-moving (`@tanstack/ai` 0.44.1, `ai-client` 0.23.2).

Included because it is the newest serious attempt at a framework-spanning AI toolkit and its layering is the cleanest illustration of the industry pattern.

**What it parses.** Split precisely. `@tanstack/ai-client` — "Framework-agnostic headless client" — has `sse-parser.ts` and `connection-adapters.ts` and consumes **TanStack's own chunk stream**; it has **zero** provider dependencies [SRC]. Provider-native parsing lives in per-provider adapter packages that carry the real SDKs: `@tanstack/ai-anthropic` → `@anthropic-ai/sdk`, `@tanstack/ai-openai`/`grok`/`groq`/`bedrock`/`byteplus`/`vercel-gateway` → `@tanstack/openai-base` + `openai`, `@tanstack/ai-gemini` → `@google/genai` [SRC: package.json sweep across `packages/*`].

**Framework reach.** The broadest of anyone: `ai-react`, `ai-vue`, `ai-svelte`, `ai-solid`, `ai-angular`, `ai-preact`, plus `ai-react-ui` / `ai-vue-ui` / `ai-solid-ui` component layers. No web components.

**Relevance to us.** TanStack does ship provider parsers — so the *organisation* is world (b) — but it ships them as a **separate server-side package per provider**, and the client is protocol-only. That is the shape most peers converge on: parse providers, yes; parse them in the UI package, no.

**Diagnosability.** The best prior art I found on the loudness question, and it is server-side: `packages/ai-bedrock/src/adapters/converse-text.ts:181` throws `'Bedrock Converse: empty stream response'`, and `:335` carries a comment about not "letting them fall through and masquerade as an empty response" [SRC]. Someone there had our exact thought.

**Evidence quality:** high, but note version churn — these packages are shipping multiple times a week and anything here could be a week stale.

---

## 8. Also checked, briefly

- **NLUX** (`nlkitai/nlux`, ★1.4k) — a vanilla-JS + React conversational UI kit that shipped provider adapter packages (`@nlux/openai`). **Last npm publish 2024-08-15**; repo last pushed 2025-11-25 [SRC: npm registry, gh api]. The one prior framework-agnostic kit that took the provider-adapter route is effectively dead. I did not determine whether the architecture had anything to do with that — treat it as circumstantial, not causal [?].
- **AI Elements** (`ai-elements` 1.9.0, published 2026-05-18) — shadcn-registry components on top of the AI SDK. React only, assumes AI SDK beneath [npm metadata].
- **prompt-kit** — React/shadcn chat components. React only [2ND: search result summary; I did not read source].

---

## Direct answer on (a)/(b)/(c)

**(c), decisively, for anything that ships as a library and is currently maintained.**

The pattern is consistent enough to state as a rule: **every peer draws a line, and provider-native parsing is always on the server side of it.**

| Library | Browser parses | Provider SDKs live in | Line drawn at |
|---|---|---|---|
| assistant-ui | own data-stream / transport, or nothing (you write the adapter) | nowhere in the kit | `ChatModelAdapter` / protocol |
| CopilotKit | AG-UI | `@copilotkit/runtime` (server) | AG-UI |
| ai-chatbot | AI SDK UI Message Stream | AI SDK provider pkgs + Gateway (server) | `x-vercel-ai-ui-message-stream: v1` |
| LibreChat | own event vocabulary | `api/` (server) | own SSE events |
| Open WebUI | OpenAI-compatible — but as house format | Python backend converters | backend normalization |
| TanStack AI | own chunk stream | `@tanstack/ai-*` adapter pkgs (server) | client/adapter package split |
| **Deep Chat** | **25 provider formats** | **the component itself** | **none (demo) / `{text}` protocol (prod)** |

Deep Chat is the sole counterexample and it disclaims itself.

**The reasoning behind the consensus — stated at full strength, because you asked me not to flatter us:**

1. **The parser is coupled to a credential decision.** You can only parse provider-native SSE in the browser if the provider-native request was made from the browser, which means the key was in the browser. Deep Chat hit this and drew the exact line: `directConnection` = demo, proxy = production. Anthropic makes it explicit at the protocol level — you must send `anthropic-dangerous-direct-browser-access: true`, a header named after its own warning. **This is the strongest argument against us and it deserves a direct answer.** Ours is different in kind: we parse a stream the consumer's own server proxied, so the key never leaves their backend. But if a reader assumes "ships provider parsers" implies "fetches from the browser", they will file us next to `directConnection` and stop reading. The distinction is load-bearing and is not self-evident from "we ship `readAnthropicStream`".

2. **N providers × M capabilities is unbounded maintenance, and it shows.** Deep Chat's Claude and OpenAI parsers have no `thinking_delta` / reasoning handling at v2.5.0. Every provider format gains reasoning, then citations, then server-side tools, then something else, on the provider's schedule. A normalized protocol absorbs that in one place; a parser fleet absorbs it once per provider, forever.

3. **A normalized protocol lets the UI kit define the part model, which is the actual product.** assistant-ui's `ThreadAssistantMessagePart` union and the AI SDK's UI message parts are the same move: pick the vocabulary the UI renders, and make everything upstream translate into it. Our `parts[]` model is exactly this and is orthogonal to whether we ship parsers — worth being clear about, since the parsers are the contested half and the part model is not.

4. **Where the library's boundary sits determines who eats a mismatch.** The most useful secondary observation I found: with CopilotKit, when the backend doesn't speak AG-UI, the library's stream parsing "becomes an obstacle rather than an aid, and you often end up reimplementing the stream handling the library was supposed to abstract" [2ND: ranjankumar.in, CopilotKit-in-production writeup — a blog, not a primary source, cited as opinion]. That cuts *toward* us: a fixed protocol is a hard dependency the consumer cannot route around, whereas a parser is a helper they can decline. That is the honest pro-parser argument and it is about optionality, not correctness.

**How to characterize our position accurately.** We are not doing what Deep Chat's `directConnection` does. We are closer to shipping TanStack's per-provider adapters — but on the browser side of the network boundary rather than the server side, and as optional imports rather than as the required path. Two things follow:

- The position is unusual. Nobody in this set ships provider parsers in the browser package as a first-class supported path. That is a differentiator or a mistake and this research cannot settle which; it can only say it is a road not taken by six well-funded peers.
- The "consumer FETCHES" half of our slogan is doing more work than it looks. It is the thing that separates us from `directConnection`, and it is the half a skimming reader drops.

**One thing I could not determine [?]:** whether any peer *considered* and *rejected* browser-side provider parsing on the record. I found the practice absent and Deep Chat's warning explicit, but no design doc, RFC, or issue in which a maintainer argues the case. The consensus is legible in the code, not in prose. Do not cite an "industry consensus statement" — there isn't one to cite.

---

## Diagnosability: prior art for "I received frames but produced no output"

**Short answer: essentially none, and the negative space is unusually clean.**

What exists:

- **Deep Chat** — the anti-pattern in its purest form. `return {[TEXT]: ''}` for every unrecognised event, with a comment explaining the drop [SRC: `claudeIO.ts:139`]. Frames in, nothing out, no signal. Worth noting for us: a comment explaining a drop is what a lint rule that honours comments would pass — the same conclusion your `lint-silent-drops` waiver-as-parsed-directive design already reached.
- **CopilotKit** — `// Unknown event types are silently ignored`, in the AI SDK converter [SRC: `packages/runtime/src/agent/converters/aisdk.ts:404`].
- **Open WebUI** — `catch (e) { console.error('Error extracting delta from SSE event:', e); }` and `parsedData.choices?.[0]?.delta?.content ?? ''` [SRC: `src/lib/apis/streaming/index.ts`]. A malformed frame becomes a console line; an *unrecognised* frame becomes an empty string with no line at all. `Chat.svelte:2404` has a bare `console.log('Empty response')`.
- **TanStack AI** — the only place anyone throws: `throw new Error('Bedrock Converse: empty stream response')`, plus a comment about not letting failures "masquerade as an empty response" [SRC: `packages/ai-bedrock/src/adapters/converse-text.ts:181,335`]. This is real prior art for deciding loudly, but it is (i) server-side, (ii) one provider, (iii) an error throw, not a diagnostic that distinguishes *no frames* from *frames but no parts*.
- **assistant-ui react-devtools** 1.2.13 — the closest thing to a designed diagnostic surface. It has an `activity` view with `EventStreamPane`, `RunDetailPane`, and an **`OrphansPane`** [SRC: `packages/react-devtools/src/views/activity/`]. "Orphans" are events that `groupRuns` could not attach to any run [SRC: `activityNodes.ts:19–38`] — structurally adjacent to what you want, but it answers "which events didn't belong to a run", not "we parsed 400 frames and emitted zero parts". It is also a devtools panel a developer must open, not something the stream itself reports.
- **TanStack `@tanstack/ai-devtools-core`** 0.5.2 — "inspecting chat messages, tool calls, streams, and errors" [SRC: package description]. I did not find a frames-in/parts-out counter in its store [SRC: grep of `packages/ai-devtools/src/store/` for `chunk`/`Stream` returned nothing]. Its conversation components are message-oriented. [?] on whether the UI surfaces raw chunk counts — I read the store, not every component.

**Nobody surfaces the specific signal.** Not one of these libraries, when a stream delivers well-formed frames that produce zero renderable output, tells the developer that is what happened. The universal behaviour is an empty message bubble. If you build "N frames received, 0 parts produced, M frame types unrecognised: [names]", I found no prior art to copy and no prior art to be measured against — which also means no peer has field-tested whether developers find it useful. The closest philosophical ally is TanStack's `masquerade as an empty response` comment, and it is one function in one provider adapter.

---

## What I could not determine

- Whether `@copilotkit/web-components` is intended to grow into a chat kit or stays a one-element utility. One element (`<copilotkit-threads-drawer>`) at v1.68.1 is all the evidence there is [?].
- Whether assistant-ui's unpublished `packages/svelte` and `packages/vue` are on a release path or are exploratory. Both at `0.0.0`, neither on npm [?].
- Any on-the-record maintainer argument, in any of these projects, for or against browser-side provider parsing. Absent from what I searched [?].
- prompt-kit: characterized from search results only, not from source [2ND].
- Whether NLUX's abandonment relates to its provider-adapter architecture. Circumstantial only [?].
