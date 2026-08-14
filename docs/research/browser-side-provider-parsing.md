# Browser-side provider parsing — the peer landscape and the risk case

**Date:** 2026-08-14 · **Status:** research complete, nothing changed in `src/` · **Question:** the
kit ships `readOpenAIStream` / `readAnthropicStream` in a browser package. Is that a differentiator
or a mistake?

Raw reports: [`evidence/browser-side-provider-parsing/`](evidence/browser-side-provider-parsing/)
(five files, preserved verbatim, digests in `MANIFEST.sha256`). This document compresses them; the
compression drops most per-claim citations, so the evidence directory is where anyone checking the
work should go.

**Evidence labels**, used on every claim below. The five reports each used their own vocabulary;
these map them onto one, and where two reports rated the same fact differently the weaker label
wins.

- **[1H]** measured first-hand during this campaign — source read at a named commit, package
  unpacked, request issued, grep run.
- **[2ND]** secondary — a blog, a search snippet, a docs page describing someone else's behaviour,
  or a leg of a report its own author flagged as not personally re-run.
- **[?]** undetermined, and recorded as such rather than dropped.

---

## Verdict up front

**Nobody else does this, and no evidence says it is wrong.** Of the peers examined, every
maintained *library* draws a line and puts provider-native parsing on the server side of it — but
the reason is credential exposure, every time, and that reason does not reach a stream the
consumer's own server already proxied. Meanwhile the survey looking for anyone who tried browser
parsing and gave up found the opposite result: zero abandonments across roughly twenty projects,
three migrations *toward* it, and independent convergence on this kit's exact split — a normalized
part model at the UI boundary with the adapter free to run on either side.

Of ten conditions that would make the approach a mistake, **two are live and neither is
architectural**: silent incompleteness in an unspecified extension space, and untrusted stream
content when a user supplies their own endpoint.

The position is unusual. This research can say it is a road not taken by well-funded peers; it
cannot say whether that makes it a differentiator or a mistake, and it does not pretend to.

---

## 1. How this was done, and where it corrected itself

Five researchers worked in parallel from separate briefs on 2026-08-14. Every report carries its own
provenance legend and labels claims individually, which is what made merging them possible at all.

Several briefs were framed adversarially, and the reports say so in their own words — one records
that it was asked to state the case against "at full strength, because you asked me not to flatter
us", another is organised around "has anyone tried this and abandoned it" and "what would have to
become true for this to be a mistake". **That framing is why the most useful results here are the
ones that came back negative or inverted**, and it is worth preserving as method: the questions were
pointed at the answer nobody wanted.

The reports are kept because the corrections are as informative as the conclusions, and a summary
loses them first. The ones worth reading in the original are below.

### 1.1 The CORS claim that was asserted, then disproved by measurement

An earlier draft of `parser-trajectory-risk.md` asserted, on the strength of OpenAI community
threads, that `api.openai.com` sends no `Access-Control-Allow-Origin`, and therefore browser calls
to OpenAI are impossible — supporting the tidy argument that *everyone has to proxy anyway*.

A live preflight disproved it **[1H, 2026-08-14]**:

```
OPTIONS https://api.openai.com/v1/chat/completions
  Origin: https://example.com
→ HTTP 200
  access-control-allow-origin: https://example.com
  access-control-allow-methods: GET, OPTIONS, POST
  access-control-max-age: 86400
```

OpenAI grants CORS and echoes the origin, with no opt-in header. The researcher retracted the claim
and the argument resting on it, and flagged it as an instance of this repo's own documented failure
mode: **the more quotable version of a finding was the wrong one.** The conclusion survived on the
narrower ground the providers actually state — proxying is justified by credential exposure alone.

Recorded here rather than quietly fixed because a retraction that leaves no trace teaches nobody.

### 1.2 The same probe pinned Anthropic's mechanism first-hand

The commonly-quoted account of `anthropic-dangerous-direct-browser-access` is a 401 with a "CORS
requests must set..." message **[2ND]**. The measurement found something more specific: the header
is not a runtime flag inspected on the real call. **Naming it in the preflight is what flips
Anthropic from refusing to granting cross-origin access** **[1H, 2026-08-14]**:

```
OPTIONS https://api.anthropic.com/v1/messages
  Origin: https://example.com
  Access-Control-Request-Headers: content-type,x-api-key,anthropic-version
→ HTTP 400, no access-control-allow-origin                      (CORS refused)

… same request, with anthropic-dangerous-direct-browser-access
  added to Access-Control-Request-Headers
→ HTTP 200, access-control-allow-origin: *                      (CORS granted)
```

This matters for how the kit is described. The header is sent by whoever calls `api.anthropic.com`,
and in this kit the browser never does — the scaffolder's Anthropic integration emits a server route
reading `process.env.ANTHROPIC_API_KEY`, and neither
`anthropic-dangerous-direct-browser-access` nor `dangerouslyAllowBrowser` occurs anywhere in
`packages/ui/src` or `apps/docs` **[1H, in-tree grep]**. The header, the preflight and the
key-exposure risk all sit upstream of the boundary this kit occupies.

### 1.3 "We have fallen behind on reasoning fields" — retired

The campaign began with a known in-tree gap: `packages/ui/src/wire/formats/openai.ts` reads
`delta.reasoning` and `delta.reasoning_details`, and `reasoning_content` appears nowhere under
`packages/ui/src/wire/` **[1H, in-tree grep]**. The premise holds. The framing did not survive
contact with the evidence:

- **OpenCode reads only `reasoning_content`** (`packages/llm/src/protocols/openai-chat.ts:147`) —
  the exact mirror image **[1H]**. They miss the two we read; we miss the one they read.
- **Deep Chat has our version of the gap**: `reasoning_content` occurs zero times across its
  connectors **[1H, code search, `total_count: 0`]**.
- **LiteLLM**, whose entire product is provider normalization, shipped the same class of bug —
  [BerriAI/litellm#20246](https://github.com/BerriAI/litellm/issues/20246), streaming reasoning
  content missing for vLLM providers **[1H title/URL, 2ND body]**.

There is no position that is ahead, because there is nothing to be ahead of — see §5. The gap is
real and worth closing; "we are behind" was the wrong description of it.

### 1.4 One report corrected another

`peer-ui-kits.md` listed NLUX as the prior framework-agnostic kit that took the provider-adapter
route and died. `livekit-elements-promptkit.md` checked the package and overturned it: **NLUX does
not parse.** `@nlux/openai` declares `dependencies: { openai: "^4" }` and bundles OpenAI's official
Node SDK into the browser with `dangerouslyAllowBrowser` six times; its entry point is named
`createUnsafeChatAdapter` and the docs disclaim it **[1H]**. It is not a datapoint about parser
maintenance at all.

The same report upgraded `peer-ui-kits.md`'s prompt-kit section, which had been characterized from
search results **[2ND]** and was replaced by an exhaustive grep of the full registry source **[1H]**.

### 1.5 One tension between reports is unresolved

`peer-ui-kits.md` grepped Deep Chat's **Claude and OpenAI chat parsers** for `thinking_delta` /
`reasoning` and reported zero hits, concluding those parsers do not surface extended thinking at
v2.5.0 **[1H]**. `parser-trajectory-risk.md` ran a repo-wide code search and found `reasoning` in 17
files, including provider type modules for `openAI.ts`, `openRouter.ts`, `mistral.ts`,
`perplexity.ts`, `requesty.ts` **[1H]**, and explicitly rejected a brief that had claimed Deep Chat
has no reasoning support at all.

Both can be true — different scopes, parser files versus the whole repository — but nobody
re-ran one against the other's scope, so **treat "Deep Chat's reasoning coverage" as unsettled**.
The part both measurements agree on is the one used above: `reasoning_content` is absent.

---

## 2. What the peers actually do

Ten projects read in source across the two sweeps, at the commits and versions noted. All **[1H]**
unless marked.

| Project | Version / commit read | What the browser parses | Where provider SDKs live |
| --- | --- | --- | --- |
| assistant-ui | `46a15f4`, `@assistant-ui/react` 0.15.14 | its own data-stream / transport, or nothing (you write the adapter) | nowhere in the kit |
| CopilotKit | `4d569c1`, v1.68.1 | AG-UI | `@copilotkit/runtime` (server) |
| Vercel `ai-chatbot` | `c2f8235` (2026-07-08) | AI SDK UI Message Stream | AI SDK provider pkgs + Gateway (server) |
| LibreChat | `eaef87f` | its own SSE event vocabulary | `api/` (server) |
| Open WebUI | `01f4282` (2026-07-27) | OpenAI-compatible — as house format | Python backend converters |
| TanStack AI | `9a4124d`, `@tanstack/ai` 0.44.1 | its own chunk stream | `@tanstack/ai-*` adapter pkgs (server) |
| LiveKit | `livekit-client` 2.21.0 | protobuf over WebRTC; text streams on named topics | the agent process (Python or Node) |
| AI Elements | `ai-elements` 1.9.0 | nothing | nothing — it renders a data structure |
| prompt-kit | registry @ 2026-03-12 | nothing | nothing |
| **Deep Chat** | `accb119`, v2.5.0 | **provider-native SSE, in the browser** | **the component itself** |

**The accurate statement of the pattern, which is narrower than "everyone defines a protocol":**
every maintained peer that ships as a library draws a line, and provider-native parsing is always on
the server side of it. What sits on the browser side of the line varies more than that phrasing
suggests — prompt-kit defines no protocol at all, and AI Elements inherits someone else's rather
than owning one.

Three positions are worth separating, because they fail differently for a consumer with a non-JS
backend:

1. **LiveKit — own the whole stack.** The strongest possible form. Protobuf wire
   (`@livekit/protocol` 1.50.4), own SFU (`livekit/livekit`, Go, Apache-2.0, 20.3k stars), own agent
   runtime, client SDKs on ten platforms. Ten grep probes for provider-shaped strings across
   `livekit-client` (13 MB unpacked) and `@livekit/components-react` 2.9.24 (4.3 MB) returned zero
   hits. The docs state that clients "never receive unprocessed model output". They ship the **token
   server route inside the component registry** (`nextjs-api-token-route`), which is the "both ends"
   claim made concrete. Cost: a non-JS shop still runs a Python or Node sidecar, because the agent
   framework is Python (`livekit/agents` 1.6.10, 2026-08-13) or Node (`@livekit/agents` 1.6.3,
   2026-08-12) only.
2. **AI Elements — own the protocol, rent the components.** The npm package `ai-elements@1.9.0` is
   **3,472 bytes, four files**, and `index.js` is a ~55-line shim that shells out to
   `npx shadcn@latest add`. There is no runtime code in it. Across all 48 registry components
   (316,183 bytes of TSX), twelve files import from `ai` and **every one is `import type`**; non-type
   imports from `ai` or `@ai-sdk/*`: zero. So it is shape-coupled to the AI SDK's `UIMessage` part
   model and carries none of its runtime. The transport is entirely the consumer's problem.
3. **prompt-kit — own nothing.** **No npm package exists** (`npm view prompt-kit` → E404);
   distribution is the shadcn registry only. Across 170,545 bytes, `fetch(` occurs **zero** times.
   All 21 `registry:ui` primitives have no AI SDK dependency, not even a type import — they redeclare
   the shapes locally, converging on the AI SDK's vocabulary without depending on it. That is a real
   strength and also the catch: **"backend-agnostic" here means the hard part is out of scope.** You
   write the SSE reader, the delta accumulation and the tool-call assembly yourself.

**Deep Chat is the sole counterexample, and it disclaims itself.** It parses provider-native SSE in
the browser — 25 directories under `component/src/services/` **[1H]**, 23 providers documented for
`directConnection` **[1H, docs listing]** — and its README says the feature "should be used for
local/prototyping/demo purposes ONLY as it exposes the API Key to the browser". Its production path
(`connect`) is its own thin protocol. **[1H]**

Two honest qualifiers found in the category sweep, both cutting against a "nobody ships one core
across frameworks" framing: **Syncfusion** genuinely runs one JS core behind thin React/Angular/Vue
wrappers (`@syncfusion/ej2-interactive-chat` 34.2.2, ~60k weekly downloads, commercial, not custom
elements), and **A2UI** (`@a2ui/lit` 0.10.3, 16.1k stars, ~809k weekly downloads on 2026-08-03) has
the only real web-component momentum in the space — adjacent to the card layer rather than the
thread, and the thing to watch. **[1H, npm + GitHub metadata]**

**On the specific slot this kit occupies:** of the framework-agnostic custom-element entries that
exist, each is one monolithic element (`<deep-chat>`, `<cds-aichat-container>`,
`<openai-chatkit>`, the last not even installable — its npm tarball is types only). A *composable
multi-element* web-component chat library has one other occupant, `@ai-chat-ui-kit/*`, at ~30 weekly
downloads and one star, whose README advertises an Anthropic adapter that does not exist in the code.
GitHub code search for `content_block_delta "@customElement"` returns two results, neither a library.
**[1H]**

### 2.1 The one thing nobody surfaces

A separate sweep looked for prior art on the diagnostic this kit wants — *frames arrived, no parts
came out*. **Essentially none exists, and the negative space is clean [1H].** Deep Chat returns
`{[TEXT]: ''}` for every unrecognised event with a comment explaining the drop. CopilotKit's AI SDK
converter carries `// Unknown event types are silently ignored`. Open WebUI turns an unrecognised
frame into an empty string with no log line. The only place anyone throws is TanStack's Bedrock
adapter — `'Bedrock Converse: empty stream response'`, with a comment about not letting failures
"masquerade as an empty response" — and that is server-side, one provider, an error rather than a
diagnostic. The closest designed surface is assistant-ui's react-devtools `OrphansPane`, which
answers "which events didn't belong to a run", not "we parsed 400 frames and emitted zero parts".

Worth noting for this repo specifically: **Deep Chat's silent drop ships with a comment explaining
it.** A lint rule that honoured comments would have passed it. That is independent confirmation of
the design already chosen for `lint:silent-drops`, where the waiver is a parsed directive rather than
prose.

---

## 3. The strongest single result: convergent evolution

**LobeChat's `StreamProtocolChunk` is near-identical in shape to our `MessagePart`.** Defined at
`packages/model-runtime/src/core/streams/protocol.ts` as
`text | reasoning | tool_calls | reasoning_signature | grounding | content_part | usage | stop |
error` **[2ND — from the survey leg its author flagged as not personally re-run]**.

The generalization the survey drew from it is the load-bearing claim, and it is stronger than the
example: **across every project examined, only the adapter's *location* varies. A normalized part
model at the UI boundary is the constant.** Even in LobeChat's client-fetch mode the browser never
hands raw provider SSE to the UI — the same adapter parses the provider stream and re-emits
LobeChat's own protocol, which `fetchSSE` consumes.

The same shape recurs independently:

- **OpenCode** parses provider SSE into a normalized `LLMEvent` union
  (`TextStart/Delta/End`, `ReasoningStart/Delta/End`, `ToolInputStart/Delta/End`, `ToolCall`,
  `ToolResult`, `ToolError`, `StepStart/StepFinish`, `Finish`, `ProviderErrorEvent`) and republishes
  it as its own event schema on one SSE endpoint. Its UI package — `@opencode-ai/session-ui`, a
  **SolidJS** component package with Storybook stories, `message-part-text`, `markdown-stream`,
  `prompt-input`, tool cards — contains zero provider parsing, verified by grep **[1H]**.
- **assistant-ui** requires `ChatModelAdapter.run()` to return `ThreadAssistantMessagePart[]`.
- **The Vercel AI SDK** normalizes at a versioned provider interface (`LanguageModelV4StreamPart`)
  and re-encodes again for the browser (`UIMessageChunk`) **[1H, read from `ai@7.0.59` in this repo's
  `node_modules`]**.

**OpenCode agrees with this kit on the seam and disagrees on the packaging.** Solid components
above, protocol parsers below, normalized parts between — then they put the parser package on the
server side of the network boundary. `@kitn.ai/ui/wire` is already a separate subpath export doing
the job of their `@opencode-ai/llm`; the difference is which side of the wire it runs on, not what
it is.

**And OpenCode is migrating toward more hand-written parsing, not less.** `packages/core/src`
contains zero imports of `streamText` or `from "ai"`; remaining `@ai-sdk/*` imports are type-only
plus a vendored Copilot provider. Their published docs still say they use the AI SDK for "75+ LLM
providers" **[1H, fetched live]** — which is a standing warning about researching this question from
documentation. Their protocol modules, measured at `4643e65` on 2026-08-14 **[1H, cross-validated by
two independent methods]**:

| Module | Lines |
| --- | --- |
| `openai-responses.ts` | 1022 |
| `anthropic-messages.ts` | 855 |
| `bedrock-converse.ts` | 674 |
| `gemini.ts` | 512 |
| `openai-chat.ts` | 506 |
| `shared.ts` | 326 |
| `bedrock-event-stream.ts` | 87 |
| `openai-compatible-chat.ts` | **24** |

Roughly 4,000 lines of hand-written protocol code. **The 24-line file is the more useful half:** it
is not a parser. It reuses the OpenAI chat parser end-to-end and overrides only the route id. So
OpenCode maintains **five real protocols** and routes the entire OpenAI-compatible long tail through
one of them. **The fleet scales with distinct wire formats — of which there are about five in the
world — not with provider count.** That is a materially better-bounded liability than "a parser per
provider", and it is the same shape as this kit's two-format design.

### 3.1 A gateway moves the problem, it does not delete it

The most likely pushback is "just use OpenRouter and there is only one format". True, and OpenCode
does exactly that — **and still routes it through `OpenAIChat.protocol.stream` unchanged** **[1H]**.
A gateway collapses N formats into 1; somebody still parses the 1, and the 1 is OpenAI
chat-completions, positional tool-call fragment correlation and all.

T3 Chat is the counterweight and the two together yield the actual rule. Its format surface has been
*narrowing*: Anthropic moved from direct onto OpenRouter (completed 2025-08), OpenAI comes via
Azure, Groq is explicitly not direct **[1H, founder statements on their own feedback board]**. Both
Azure OpenAI and OpenRouter emit OpenAI chat-completions SSE.

These directions look contradictory and are not. **The variable is how much provider-native surface
the product needs.** OpenCode is an agent: prompt-cache control, reasoning signatures,
provider-executed server tools, exact token accounting — all of which a gateway flattens. T3 Chat is
a chat product: text, reasoning, attachments, breadth of model choice, almost none of which requires
the native layer. **You need per-protocol parsers in proportion to the provider-native capability
you expose** — which is why `readOpenAIStream` being the scaffolder's only emitted reader is the
right default, and why `readAnthropicStream` still earns its place for consumers going direct who
want thinking blocks and cache behaviour intact.

---

## 4. The abandonment null result, which inverted

The brief asked for the story of someone who tried browser-side provider parsing and gave up.

**Across roughly twenty projects surveyed: zero abandonments, for any reason [2ND — the survey leg
its author flagged as not personally re-run].** `BetterChatGPT` is dormant since 2024-08-14, but
that is project death, not migration. Searches for `"deprecate" directConnection`,
`"no longer support" "direct connection"`, and about 80 enumerated LobeChat RFCs produced nothing
proposing a move off browser parsing.

A null result alone can always be dismissed as insufficient searching. **The traffic running the
other way is the stronger half:**

1. **big-AGI *added* client-side direct fetch** (`7b664aff`, 2025-11-23) *after* already building
   AIX, a server-side normalized particle protocol, reusing "the same wire protocols as the server".
   Its own rationale document: no upload limit, no function timeout, more privacy — "Net: Direct
   Connection is a win on speed, limits, and privacy whenever the provider permits it."
2. **Jan *deleted* its normalizing backend.** Through mid-2025 the renderer hit one cortex URL; the
   Tauri rewrite removed it, and `web-app/src/lib/model-factory.ts` now constructs `createOpenAI` /
   `createAnthropic` / `createGoogleGenerativeAI` / `createXai` / `createMistral` in the renderer.
3. **Chatbox consolidated into a client library, not a backend** — hand-rolled renderer parsers to
   the Vercel AI SDK (PR #216, April 2025), still in the renderer, 27 providers.

And **Deep Chat is expanding**, not shrinking: from six providers when the quoted disclaimer was
written **[2ND]** to 23 documented today, with Kimi and Qwen added 2025-10-22 and **LiteLLM added
2026-06-09** — roughly two months before this review **[1H, commit dates via the GitHub API]**. A
maintainer who had concluded the approach was a mistake does not ship a new browser-side connector
in June.

**One near-miss to refuse:** the Vercel AI SDK normalized on a house protocol but never had
browser-side provider parsing to abandon — `useChat` always consumed an AI-SDK-shaped stream. The
structural proof is clean: `grep -c "choices" node_modules/ai/dist/index.js` returns **0** **[1H,
`ai@7.0.59`]**. Anyone citing it as "the industry moved away from provider parsing" is citing a road
not travelled.

---

## 5. Reasoning is a vendor extension to a spec that is silent

This is the structural finding, and it is worth stating in its strong form because the weak form
gets quoted instead.

Not "vendors implemented a standard field inconsistently". Rather: **OpenAI chat-completions has no
reasoning field at all.** The documented delta keys are `content`, `role`, `tool_calls`,
`function_call` (deprecated) and `refusal` — nothing else **[1H, OpenAI streaming-events
reference]**. OpenAI's reasoning guide states raw chain-of-thought "is not exposed"; summaries and
`encrypted_content` exist only on the Responses API. **There was never a `delta.reasoning*` to be
compatible with.** Every implementer who invented one invented a different one.

That is a fact about the spec, not a survey of vendors, so the next provider that happens to agree
with someone cannot falsify it. It also explains cleanly why `content` and `tool_calls` did *not*
diverge: those field names genuinely agree across OpenAI, OpenRouter, LiteLLM and Anthropic's compat
endpoint **[1H across all four]**, with only behavioural caveats (argument fragmenting, `index`
presence, `finish_reason` placement).

The census **[1H unless noted]**:

| Layer | Streaming field(s) for reasoning |
| --- | --- |
| OpenAI chat-completions | **none** (only `usage…reasoning_tokens`) |
| OpenAI Responses API | `reasoning` output item, `summary[]`, `encrypted_content` |
| DeepSeek first-party | `delta.reasoning_content` |
| OpenRouter | `delta.reasoning` + `delta.reasoning_details[]` |
| vLLM (and anything served through it) | `reasoning_content` |
| LiteLLM | `delta.reasoning_content` + `thinking_blocks[]` |
| Anthropic native | `content_block_delta` → `thinking_delta` + `signature_delta` |
| Anthropic's own OpenAI-compat endpoint | **nothing — not returned, and documented as such** |
| Some open models | **no field at all — inline `<think>` tags in `content`** |

**The fragmentation is structurally three-way, not three names.** A sibling *string* (`reasoning` /
`reasoning_content`), a *block array* (`reasoning_details`), and a *polymorphic `content`* carrying
inline tags. **Field-name aliasing bridges the naming axis only** — it does nothing for the other
two shapes. Any claim that "we just need to accept the alias" is answering one third of the problem.

Two pieces of evidence carry more weight than the rest of the table:

- **LiteLLM ships an alias in code.** `Delta.__init__` contains
  `if reasoning_content is None and "reasoning" in params: reasoning_content = params.pop("reasoning")`
  (`litellm/types/utils.py` L1387-88) **[1H, read in source]**. A major normalization layer needs
  explicit reconciliation for two names. Nobody writes that for `content`.
- **Anthropic's own compat layer drops reasoning entirely and documents it** — "the OpenAI SDK
  doesn't return Claude's detailed thought process" **[1H]**. The vendor best positioned to define an
  OpenAI-shaped reasoning field declined, because signature-bearing, index-addressed thinking blocks
  have no representation in a flat `choices[].delta` frame.

**Practical consequence for this kit, flagged and not acted on:** a consumer pointing
`readOpenAIStream` at DeepSeek first-party or a LiteLLM proxy gets reasoning **silently dropped**.
Adding `reasoning_content` is strictly additive — OpenRouter itself documents it as functioning
identically to `reasoning` — and covers every vLLM-served model, the largest self-hosted surface in
the ecosystem. Note also that `lint:silent-drops` covers the encode side (`parts` → request) and not
the decode side, so a decode-side drop is silent by construction.

**One precision to keep.** The OpenRouter rename is real and observed — a live capture in
`packages/ui/src/wire/fixtures/openai/reasoning-both-fields.sse` (model
`~deepseek/deepseek-v4-flash-latest`, captured 2026-08-10 via OpenRouter) shows 47 `reasoning`,
46 `reasoning_details`, **0** `reasoning_content` **[1H]** — but **no OpenRouter statement documents
it**. State it as measured, never as documented. And OpenRouter accepts `reasoning_content`
*request-side only*, as an alias for what you send back; a parser should not expect it in
OpenRouter's response delta.

---

## 6. The argument against ever collapsing into one universal adapter

arvinxx, maintaining LobeChat's 85 providers,
[RFC 090](https://github.com/lobehub/lobehub/discussions/6563), 2025-02-27 **[2ND]**:

> 一个 OpenAI Compatible 运行时已经无法满足这个分化趋势下的应用层需求了
> *("a single OpenAI-Compatible runtime can no longer meet application-layer needs under this
> divergence trend")*

> 如果仅仅锁死在 openai 的接口规范，会导致未来高阶特性的接入成本越来越高
> *("locking to the OpenAI spec alone makes integrating future advanced features ever costlier")*

**This is the strongest maintainer statement found, and it argues against collapsing
`readOpenAIStream` and `readAnthropicStream` into one universal adapter** — from the person who
tried it at 85-provider scale. Keeping them as distinct formats is a validated design, not a
shortcut.

The structural half sits underneath it and does not depend on the quote. Anthropic is **indexed
content blocks with typed deltas and a named SSE event per frame**; OpenAI chat-completions is **one
flat frame type carrying `choices[].delta`, no event names, no block indices**. Parallel content
blocks, block boundaries and cryptographic signatures have no representation in the OpenAI frame
**[1H, both providers' streaming docs]**. That asymmetry is present in OpenCode's code too — flat
`"text-0"` / `"reasoning-0"` string constants on the OpenAI side, per-index channel keys on the
Anthropic side **[1H]**. Being precise about where it bites: for text and thinking, Anthropic's
delta type is self-describing and the index only keeps channels apart; for **tool calls** the
remembered `content_block_start` is load-bearing, because the tool's `id` and `name` arrive there and
never in the `input_json_delta`s that follow.

---

## 7. Untrusted stream content — the one genuinely new risk

**Open WebUI v0.6.35 (2025-11-06) blocked event emission from direct-connected model servers after
an SSE code-injection flaw let an untrusted model server execute JavaScript in the browser.**
**[2ND]**

The threat model is specific and it does apply to any browser-side parser: when the stream is parsed
client-side, whoever controls the upstream server controls a payload reaching the browser's
execution context. For an app pointed at a trusted first-party provider through its own proxy this
is inert. **It is live the moment a user supplies their own base URL** — which is exactly what a
bring-your-own-endpoint design introduces.

Note the response: **they narrowed the capability, they did not abandon browser parsing.** The
mitigation is the ordinary one — never let stream content reach an execution sink, treat every field
as data, and audit anything a part model renders as HTML or hands to a component. This is a security
class rather than a fidelity class, and it is the only genuinely new risk the campaign surfaced.

---

## 8. The cautionary example: the complete shape of a conformance suite, asserting nothing

**Portkey's cross-provider driver iterates 78 providers and asserts only
`expect(res.status).toEqual(200)`. Every provider `continue`s when its API key is absent, and CI
(`.github/workflows/run_tests.yml:34`) runs `jest src/` without keys. In CI, that loop over 78
providers asserts nothing at all.** **[2ND]**

It has the entire file-tree shape of a cross-provider conformance suite and is a no-op in the
pipeline.

This connects directly to this repo's own documented dominant failure mode — checks that pass while
covering nothing, named as a class in
[`../superpowers/coverage-diagnostic-2026-08-14.md`](../superpowers/coverage-diagnostic-2026-08-14.md)
and worked through in §5 of
[`../superpowers/HANDOFF-2026-08-13-attachments-scaffolder-a11y.md`](../superpowers/HANDOFF-2026-08-13-attachments-scaffolder-a11y.md).
It is also why `lint:silent-drops` takes a parsed directive rather than prose as its waiver: the turn
that encoded an attachment to nothing shipped with a comment explaining the drop, so a guard
honouring comments would have passed it unchanged. **The shape of a conformance suite is not
evidence of one.** The transferable rule is the one already applied here: `provenance.test.ts`
requiring real capture metadata on every fixture in `packages/ui/src/wire/fixtures/` is a check that
makes the shape hard to fake, which is precisely why it is worth keeping strict.

A second instance of the same class, in the same survey: `aimock`'s three-way drift detector is the
best *idea* found, but its own `DRIFT.md` oversells it — the "SDK types" leg is hand-written
representative objects, not extraction via the TypeScript compiler API, so the triangulation only
holds if someone remembers to update them **[2ND]**.

---

## 9. Two mechanisms worth importing

Techniques, not code. Both come from differently-licensed projects and neither should be copied
verbatim; what transfers is the assertion each makes.

1. **LangChain's accumulator-correctness check** (`stream_lifecycle.py`) — the only validator in the
   survey that checks accumulator *correctness* rather than liveness **[2ND]**. It asserts that the
   delta payloads equal the final payload, **and** that the last chunk carries an explicit terminator
   (`chunk_position == "last"`) — without which `tool_call_chunks` never aggregate into `tool_calls`.
   Both halves are cheap additions to fixture replay, and the terminator assertion catches a failure
   that otherwise looks like a model that simply did not call a tool.
2. **`req_llm`'s fixture rigor** (Elixir) — the most rigorous mechanism found **[2ND]**: an explicit
   three-tier strategy, 2,766 fixture JSON files checked in, a `provider_contract/1` macro, a drift
   module driven by a checked-in anchor matrix, and a `COMPATIBILITY.md` classifying every surface
   stable / experimental / deprecated. The transferable part is the classification discipline, not
   the file count.

For calibration: **recorded fixtures are the universal mechanism**, and this kit already runs it.
OpenCode maintains per-protocol suites plus a distinct recorded-replay tier. `packages/ui/src/wire/
fixtures/` holds live-captured provider SSE under `anthropic/` and `openai/`, and `provenance.test.ts`
requires a complete provenance header on every fixture, so captures cannot be hand-written and pass
**[1H, in-tree]**. On this axis the kit is at parity with the most rigorous implementation found and
ahead of every project in the failure table below. **No shared conformance suite exists for
OpenAI-compatible streaming**; the one artifact that could anchor one, `openai/openai-openapi`, has
no reasoning field in its delta schema and describes its SSE envelope only in prose.

---

## 10. Ten conditions, two live

The adversarial brief's output: what would have to become true for browser-side parsing to be a
mistake. Reproduced from `parser-trajectory-risk.md`; the "visible today" column is the researcher's
verdict.

| # | Condition | Visible today? |
| --- | --- | --- |
| 1 | A provider ships a **breaking** (not additive) change to a format we parse | **No.** Zero breaking changes to either format in 24 months. Anthropic's versioning policy contractually forbids it within a version; the version string has not moved since `2023-06-01`. |
| 2 | The parser count grows past what a small team can maintain | **No.** OpenCode covers the landscape with five real protocols and one 24-line re-route. Scales with wire formats, not providers. |
| 3 | Silent-drop incidents accumulate faster than they are caught | **Yes — live.** One confirmed instance in-tree (`reasoning_content`); three independent projects hit the same class this year. |
| 4 | Text chat streaming stops being SSE | **No.** OpenAI, Anthropic and Google all stream text over SSE. WebRTC/WebSocket exist for realtime voice — a new surface, not a break in this one. |
| 5 | Providers block parsing a stream the consumer's own server proxied | **No, and there is no mechanism by which they could.** Once the consumer's server has the bytes, the provider has no say. |
| 6 | Someone demonstrates server-side parsing avoids drift | **No — the evidence runs the other way.** See below. |
| 7 | The approach gets abandoned by its practitioners | **No — the opposite.** §4. |
| 8 | The normalized-protocol alternative proves more stable | **No — it proved less stable.** See below. |
| 9 | **Untrusted stream content becomes an attack surface** | **Yes, conditionally.** §7. Inert behind a trusted proxy; live for bring-your-own-endpoint. |
| 10 | Browser calls become impossible on CORS grounds | **No, but it is the real constraint and it is measurable.** 41 of 85 LobeChat providers set `disableBrowserRequest: true`, and the number moves both ways. Irrelevant to a proxied stream. |

**Condition 6 deserves its own line, because it inverts the usual assumption.** Every documented
instance of the failure mode under review happened in a **server-side or desktop** parser, and not
one had a cause related to where the parser ran **[1H, issue titles and URLs; bodies 2ND]**:

| Project | What was lost | Where the parser ran |
| --- | --- | --- |
| microsoft/agent-framework [#5327](https://github.com/microsoft/agent-framework/issues/5327) | reasoning text from OpenAI-compatible vendors, silently. **Closed as not planned** | server |
| Effect-TS/effect-smol [#2337](https://github.com/Effect-TS/effect-smol/issues/2337) | *whole chunks*, including streamed tool-call argument deltas, on schema-validation failure | server |
| janhq/jan [#8280](https://github.com/janhq/jan/issues/8280) | **the entire stream**, on an unrecognised `event:` name | desktop |

Two things fall out. **Parser location is orthogonal to parser drift** — moving parsing to a backend
relocates this liability into code someone still has to write and keep current. And **the three
failure modes rank, with ours mildest**: Jan lost everything loudly, Effect-TS lost tool arguments
silently, this kit loses one optional decoration from providers using a third spelling. **Strict
schema validation — the safer-looking design — produced the two worse outcomes.**

**Condition 8, likewise.** The Vercel AI SDK is the reference implementation of "define your own
browser protocol and make the backend conform", and its UI Message Stream defines roughly 25 event
types — a *larger* surface than the five-field chat-completions delta. It broke at v4→v5 (SSE
replacing the proprietary `0:` / `1:` prefixed format, published 2025-07-31), with a v5→v6 migration
guide now in existence **[1H for the protocol surface, 2ND for the migration write-ups]**.
Scoreboard over ~24 months: OpenAI chat-completions SSE, 0 breaking changes; Anthropic Messages SSE,
0; Vercel's UI stream protocol, 1 confirmed plus a second in flight. **The complexity is not
eliminated by normalizing; it is relocated to a server the consumer must now run, plus a protocol
the library owns forever.**

**Where the churn actually comes from.** Searching specifically for *unannounced* wire changes found
plenty — and almost all of them point at **emulators, not owners**: sglang emitting `text_delta`
against an open `tool_use` block, MiniMax sending an empty `role`, vLLM omitting `"type":"function"`
in streaming tool calls, Azure's content-filter chunks. Genuinely OpenAI-side and unannounced: two
instances, both already covered in-tree by fixtures. **The honest statement is not "provider formats
churn" — it is that the two formats parsed here are owned by two stable publishers, and the
instability lives in the unbounded long tail of servers claiming to speak them.** That tail is the
same wherever the parser runs, and a house protocol does not shrink it, because someone still parses
the emulator's output somewhere.

---

## 11. Open questions

Recorded rather than dropped. Several are cheap to close and are gated on access, not analysis.

**The Responses API question was asked and *was* answered** — contrary to the summary this document
was commissioned from, which reported it unanswered. `parser-trajectory-risk.md` Q2 settles it
**[1H, OpenAI's own pages]**: `/v1/chat/completions` is **not** on OpenAI's deprecations page (the
Assistants API is, deprecated 2025-08-26, shutdown 2026-08-26), the migration guide says verbatim
"While Chat Completions remains supported, Responses is recommended for all new projects", and the
Responses-only capability list is web search, file search, computer use, code interpreter, MCP, image
generation and **reasoning summaries**. One capability is being actively withdrawn, which is the
sharpest signal on the page: "Starting with GPT-5.4, tool calling is not supported in Chat
Completions with `reasoning: none`." **Read: a stable, indefinitely-supported transport whose
feature surface is frozen-ish and slowly eroding at the reasoning and tool-calling edge. The
endpoint will not disappear; what it can express is what stops growing.**

What genuinely remains open, on that question and around it:

- **The exact number of Responses streaming event types.** Its reference page exceeds a 10 MB fetch
  limit — itself a crude measure of the surface-area difference against a chat-completions page that
  fetched without trouble. **[?]**
- **Whether OpenAI has ever stated in writing, on a currently-live OpenAI-owned page, that Chat
  Completions will be supported "indefinitely."** The line is everywhere in third-party summaries of
  the March 2025 Responses launch and was not found on an OpenAI page. The verifiable version is
  weaker but sufficient: absent from the deprecations list, described as "remains supported". **[?]**
- **DeepSeek's *current* first-party streaming delta field for reasoning.** Their docs now foreground
  request-side `thinking` / `reasoning_effort` and no longer specify the response delta shape. **[?]**
- **The wire format T3 Chat's browser receives** — the question its brief cared most about. Their
  routing architecture is well established from founder statements; the wire is not. The site returns
  HTTP 429 behind a Vercel Security Checkpoint to every non-browser client, so no artifact inspection
  was possible. **The highest-yield way to close it is to open t3.chat in a real logged-in browser
  and watch the Network tab across a model switch.** **[?]**
- **Whether T3 Chat's BYOK requests go browser→provider or browser→their server→provider.**
  Local-only key *storage* is confirmed from a founder statement; the founder's wording distinguishes
  storing from receiving and never addresses the latter. **[?]**
- **Whether any peer *considered and rejected* browser-side provider parsing on the record.** The
  practice is absent and Deep Chat's warning is explicit, but no design doc, RFC or issue was found in
  which a maintainer argues the case. **Do not cite an "industry consensus statement" — there is not
  one to cite.** **[?]**
- **Whether the ~20-project abandonment survey missed a quiet deletion years ago.** Still "no
  evidence found", not "evidence of absence". The positive evidence in §4 does not depend on the null
  result holding. **[?]**
- **Deep Chat's reasoning coverage** — the unresolved inter-report tension in §1.5. **[?]**
- Smaller, all from `normalization-landscape.md`: OpenRouter's streaming placement of `annotations`;
  whether OpenRouter's tool-call `arguments` fragment (their own example code would break if they
  do); whether `index` is present on OpenRouter tool calls (prose says yes, the JSON example omits
  it); whether OpenRouter ever surfaces that it ignored a parameter (appears silent); and whether any
  public language-agnostic schema exists for OpenAI's ChatKit wire format. **[?]**

---

## 12. The evidence, and who verified what

Five reports, preserved verbatim in
[`evidence/browser-side-provider-parsing/`](evidence/browser-side-provider-parsing/) with a README
and digests. Nothing in them was edited, including the retracted claims and the places where one
contradicts another.

| File | Scope |
| --- | --- |
| `peer-ui-kits.md` | assistant-ui, CopilotKit, Vercel `ai-chatbot`, LibreChat, Open WebUI, Deep Chat, TanStack AI — plus the prior-art survey on diagnosing frames-in / no-parts-out |
| `livekit-elements-promptkit.md` | LiveKit, AI Elements, prompt-kit, plus the npm/GitHub category sweep for framework-agnostic custom-element chat kits |
| `t3-chat-and-opencode.md` | OpenCode (read in source at `4643e65`) and T3 Chat (closed source; founder statements) |
| `normalization-landscape.md` | Vercel AI SDK, OpenRouter, LiteLLM, Anthropic's OpenAI-compat endpoint — read from shipped artifacts in this repo's `node_modules` |
| `parser-trajectory-risk.md` | The adversarial brief: abandonment survey, format stability, the ten-condition table, both CORS preflights |

**What was measured first-hand versus relayed.** The distinction is preserved above per claim; the
summary is that source reads, package unpacks, greps, npm and GitHub metadata, the CORS preflights,
the OpenCode line counts (cross-validated by two independent methods) and everything in-tree are
**[1H]**. The ranked survey of maintenance mechanisms (req_llm, any-llm, LangChain, LiteLLM, aimock,
Portkey) and the ~20-project abandonment survey — LobeChat's 41/85 CORS ratio and `StreamProtocolChunk`,
big-AGI's commit, Jan's `model-factory.ts`, RFC 090, the Open WebUI security fix — rest on sweeps
that `parser-trajectory-risk.md`'s author did not re-run, and are **[2ND]** throughout this document
for that reason. Both sweeps reported their own caveats and each self-corrected a sub-finding, which
is a reasonable sign for the rest, but they are one remove from primary.

**Version and date sensitivity.** Every external count, star figure, line count and version above is
an observation with a date attached, generally 2026-08-14, and several of these projects ship
multiple times a week — TanStack AI's packages especially, and the `ai` package ships three parallel
majors. Re-measure before quoting any of it. The in-tree facts are the ones that stay true until
someone changes them here.
