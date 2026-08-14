# T3 Chat and OpenCode: how they handle multi-provider streaming

Research date: 2026-08-14. Evidence labels used throughout:

- **[SOURCE]** — I read this in the project's own source code, at the cited path.
- **[PRIMARY-DOC]** — the project's or author's own docs/statements.
- **[SECONDARY]** — third-party summary. Treat as weak.
- **[UNDETERMINED]** — could not establish.

## Bottom line up front

1. **We are not solving something everyone else avoids.** OpenCode maintains
   ~4,000 lines of hand-written per-protocol SSE parsers — OpenAI Chat, OpenAI
   Responses, Anthropic Messages, Gemini, Bedrock Converse — with the exact
   flat-vs-block asymmetry we describe, and is actively migrating *toward* more
   of it and *away* from the Vercel AI SDK. **[SOURCE]**
2. **T3 Chat is a hybrid — part gateway, part direct — and normalizes
   server-side.** A founder states plainly that some models are deliberately not
   routed through OpenRouter. OpenAI comes via **Azure**, Google via **AI
   Studio**, Anthropic **migrated onto OpenRouter** in 2025-08. There is a real
   backend tier (Effect/TypeScript on Vercel Fluid Compute) that injects system
   prompts and post-processes output, so the format question is resolved before
   anything reaches the browser. **[VERIFIED-PRIMARY]**
3. **The two projects are moving in OPPOSITE directions, and the reason is the
   most useful thing in this report.** OpenCode is *adding* hand-written
   parsers; T3 Chat is *collapsing* its upstream formats toward one
   (OpenAI-chat, via Azure and OpenRouter). That divergence is not a
   contradiction — it tracks whether the product needs provider-native features
   that gateways flatten. See implications §3.
4. **Evidence quality is asymmetric.** OpenCode is open source and I read it.
   T3 Chat is closed source *and* bot-gated; its section rests on founder
   statements from their own feedback board, which is strong for *architecture*
   but left the **exact browser wire format undetermined**.
5. **The model-switching worry does not land on us the way the brief feared.**
   Our `readModelStream` already takes the format as a per-call runtime
   argument with fresh per-stream state, and our scaffolder already fixes the
   *browser* format at OpenAI SSE for every integration while re-framing
   server-side — with a CI guard enforcing it. So the scaffold-time question is
   about which backend to generate, not about locking the browser to a provider.
   **[SOURCE, our own tree]**
6. **A gateway does not delete the problem.** OpenCode routes OpenRouter through
   its OpenAI-chat parser unchanged. Gateways collapse N formats to 1; somebody
   still parses the 1.

---

## OpenCode (sst/opencode)

Evidence base: shallow clone of `github.com/sst/opencode` at commit `4643e65`
(Fri Aug 14 2026), read directly. All **[SOURCE]** claims below cite a path in
that tree.

### Architecture (short version)

OpenCode is a **client/server** program, not a monolithic CLI. A local server
owns the provider connection; the TUI, desktop app, web UI and SDK are all
clients of it. Provider traffic is handled by an in-repo package,
`@opencode-ai/llm` (`packages/llm/`), which is structured as **`protocols/` ×
`providers/`** — protocols are wire formats, providers are deployments. The
session runner parses provider SSE into a normalized `LLMEvent` union, persists
it, and republishes it to clients as `OpenCodeEvent` over a single SSE endpoint.
Clients never see provider-native SSE.

### They hand-write per-protocol SSE parsers. This is the headline.

`packages/llm/src/protocols/` contains, as first-party source **[SOURCE]**:

| File | Lines |
|---|---|
| `openai-responses.ts` | 1022 |
| `anthropic-messages.ts` | 855 |
| `bedrock-converse.ts` | 674 |
| `gemini.ts` | 512 |
| `openai-chat.ts` | 506 |
| `shared.ts` | 326 |
| `openai-compatible-chat.ts` | 24 |
| `bedrock-event-stream.ts` | 87 |

Roughly 4,000 lines of hand-written protocol code, plus `providers/` on top.
There is a dedicated test directory `packages/llm/test/provider/` with separate
suites per protocol (`anthropic-messages.test.ts`, `openai-chat.test.ts`,
`openai-responses.test.ts`, `gemini.test.ts`, `bedrock-converse.test.ts`,
`openrouter.test.ts`), including recorded-fixture tests. **[SOURCE]**

The doc comment on `packages/llm/src/route/protocol.ts` states the design
thesis almost exactly as our kit would state it **[SOURCE]** — that a `Protocol`
owns "how the streaming response decodes back into common `LLMEvent`s", that it
is "**not** a deployment" and does not know URL, headers or auth, and that this
separation "is what lets DeepSeek, TogetherAI, Cerebras, etc. all reuse
`OpenAIChat.protocol` without forking 300 lines per provider."

The `Protocol` interface is parameterized `<Body, Frame, Event, State>` and its
stream half is a state machine: `initial(request)`, `step(state, event) =>
[state, LLMEvent[]]`, optional `onHalt(state)`. **[SOURCE]**
`packages/llm/src/route/protocol.ts`

### The OpenAI/Anthropic structural asymmetry is present in their code too

This matters because it is the specific thing our kit claims is irreducible.

**OpenAI chat-completions** (`packages/llm/src/protocols/openai-chat.ts`,
`step()` around L407-441) **[SOURCE]**: reads `event.choices[0]`, takes
`delta.content` / `delta.reasoning_content`, and pushes them into a **single**
hardcoded text channel — literally the string constants `"text-0"` and
`"reasoning-0"`, because the flat model has exactly one of each. Tool calls are
correlated by **array position**: `for (const tool of toolDeltas)` then
`ToolStream.appendOrStart(ADAPTER, tools, tool.index, {...})`. The file carries
the comment that tool calls "are accumulated because OpenAI streams JSON
arguments across multiple deltas."

**Anthropic Messages** (`packages/llm/src/protocols/anthropic-messages.ts`)
**[SOURCE]**: a genuine block state machine. `step` dispatches on
`content_block_start` / `content_block_delta` / `content_block_stop` (L816-818).
`onContentBlockStart` (L657) reads `event.content_block.type` to learn the block
kind and, for `tool_use` / `server_tool_use`, records `{id, name}` into
`ToolStream.start(state.tools, event.index, ...)`. Channels are keyed by block
index throughout — `` `text-${event.index}` ``, `` `reasoning-${event.index}` ``.
`onContentBlockDelta` branches on `delta.type` (`text_delta`, `thinking_delta`,
`input_json_delta`).

Precise version of the claim, stated honestly: for **text and thinking**,
Anthropic's delta type is self-describing, so OpenCode routes those on
`delta.type` alone and only needs the *index* to keep channels apart. For **tool
calls** the remembered `content_block_start` state is load-bearing — the tool's
`id` and `name` arrive **only** in `content_block_start` and never in the
`input_json_delta`s that follow, so OpenCode must carry that per-index record
forward. So: the "you must remember what `content_block_start` declared" problem
is real and OpenCode solves it with per-index state, but it bites hardest on
tool calls rather than on every block kind.

### They are actively migrating OFF the Vercel AI SDK

This is the single most useful finding, and it cuts against the received wisdom.

- OpenCode's **published docs still say** "OpenCode uses the [AI SDK] and
  [Models.dev] to support **75+ LLM providers**" — `packages/web/src/content/docs/models.mdx` L6. **[PRIMARY-DOC]**
- The **code no longer matches that** for the main path. `packages/core/src/`
  contains **zero** imports of `streamText` or `from "ai"` **[SOURCE]**. The
  session runner imports `@opencode-ai/llm` instead
  (`packages/core/src/session/runner/llm.ts`, `.../publish-llm-event.ts`).
- Remaining `@ai-sdk/*` imports in `packages/core/src` are (a) **type-only**
  (`import type { LanguageModelV3 }`) and (b) a **vendored** GitHub Copilot
  provider under `src/github-copilot/` **[SOURCE]**.

The migration seam is explicit and readable in one function —
`packages/core/src/session/runner/model.ts`, `fromCatalogModel()` L131-179
**[SOURCE]**. It takes the catalog's model metadata and maps the AI SDK
*package name* to one of OpenCode's own protocol routes:

- `api.package === "@ai-sdk/openai"` → `OpenAIResponses.route`
- `api.package === "@ai-sdk/anthropic"` → `AnthropicMessages.route` (auth via `x-api-key`)
- `api.package === "@ai-sdk/openai-compatible"` (+ a url) → `OpenAICompatibleChat.route`
- anything else → `UnsupportedApiError`

and a companion predicate `supported(model)` (L175-179) gates which catalog
models are eligible for this path at all. Read plainly: they kept models.dev's
AI-SDK-shaped metadata as the *label* for the wire format, and swapped the AI
SDK *implementation* out for their own parser underneath, big-three shapes
first, long tail still to come.

**Their own spec confirms this is a deliberate, in-progress migration.**
`specs/v2/provider-model.md` L268-284 **[PRIMARY-DOC]** has a section "Current
Session Runner Adaptation" which says the runner's "**native adaptation surface
is deliberately narrow**" and then lists it — including wire-format labels
spelled out as first-class vocabulary:

```
openai/responses over HTTP
openai/completions for OpenAI Chat
openai/completions for OpenAI-compatible Chat
anthropic/messages
aisdk:@ai-sdk/openai
aisdk:@ai-sdk/openai-compatible with an explicit URL
aisdk:@ai-sdk/anthropic
```

and states that "Google, Azure, Bedrock, OpenRouter-specific behavior, GitHub
Copilot, Vertex, gateway adapters, and signed authentication remain **future
provider slices**." It also specifies that unsupported routes "fail explicitly"
and that `openai/responses` with WebSocket transport "must not silently
downgrade to HTTP."

Two things worth noting there. First, the wire protocol is a **named catalog
value** (`anthropic/messages`, `openai/completions`), not something inferred —
the same stance our kit takes. Second, the no-silent-downgrade rule is the same
"decide loudly" principle this repo enforces with `lint:silent-drops`.

**Caveat, stated honestly:** the shallow clone gave me no git history, so I
cannot date this migration from commits, and I found no OpenCode blog post
explaining the rewrite. The direction of travel is established by the spec text
above plus the structural tell in `fromCatalogModel`, not by a changelog.

Corroborating layering rule from `AGENTS.md` L3 **[PRIMARY-DOC]**: "Client
runtime code may depend on Schema and Protocol but never Core or Server." The
parsing layer is structurally out of the client's reach. And L157: "Preserve one
explicit `llm.stream(request)` call **per provider turn**."

### Where normalization happens, and what the client receives

Normalization happens **server-side, in-process, on the user's own machine**.

1. `packages/llm` parses provider SSE → `LLMEvent` (the normalized union:
   `TextStart/Delta/End`, `ReasoningStart/Delta/End`,
   `ToolInputStart/Delta/End`, `ToolCall`, `ToolResult`, `ToolError`,
   `StepStart/StepFinish`, `Finish`, `ProviderErrorEvent` —
   `packages/llm/src/schema/events.ts`). **[SOURCE]**
2. `packages/core/src/session/runner/publish-llm-event.ts` consumes `LLMEvent`
   and turns it into persisted session messages/parts + `SessionEvent`s. **[SOURCE]**
3. `packages/server/src/handlers/event.ts` exposes **one** SSE endpoint
   (`event.subscribe`, `content-type: text/event-stream`) that emits
   schema-encoded `OpenCodeEvent` JSON, plus a 15s heartbeat comment. **[SOURCE]**

So the client's wire format is **OpenCode's own event schema**, identical for
every provider.

I verified the negative directly: grepping the whole repo for provider-native
SSE markers (`content_block_start`, `content_block_delta`, `choices[0].delta`,
`"choices"`) outside `packages/llm/` returns **only test fixtures** in
`packages/core/test/` (for the vendored GitHub Copilot provider and a plugin
provider test). No TUI, desktop, web or SDK client parses provider SSE. **[SOURCE]**

One nuance: the client *is* told which model produced a turn, as **display
metadata** — `packages/core/src/session/runner/llm.ts` L221-224 attaches
`{id, providerID, variant}` to the assistant message. **[SOURCE]** So the client
knows the provider for attribution and model-badge purposes, but that identity
has no bearing on parsing, which already happened server-side.

### Model switching

- Users switch models with the `/models` command **[PRIMARY-DOC]**
  `packages/web/src/content/docs/models.mdx` L20-23.
- The model is resolved **per provider turn, inside the loop** —
  `packages/core/src/session/runner/llm.ts` L199: `const model = yield*
  models.resolve(session)`, immediately before `LLM.request({model, ...})` and
  `llm.stream(request)`. **[SOURCE]**
- The resolved `Model` object **carries its route, and the route carries its
  protocol** (`request.model.route`, used by
  `packages/llm/src/route/client.ts` to pick `protocol.stream.initial/step/onHalt`). **[SOURCE]**

Therefore, for OpenCode: **the wire format is a per-request property**, not a
per-app one. Switching from an OpenAI model to an Anthropic model mid-session
changes which parser runs on the very next turn, transparently. The *client*
wire format never changes.

**Is the format auto-detected?** No. It is **declared** in catalog metadata
(models.dev's `api.type`/`api.package`) and looked up. An unrecognised value is
a hard `UnsupportedApiError`, not a sniff-and-guess. **[SOURCE]** This matches
our kit's "we do not auto-detect; the caller picks it" stance exactly.

### Does being a CLI change the answer?

Partly, and it is worth being precise. OpenCode is not really "a CLI" for this
question — it is a local client/server app, so it has a **trusted server-side
place to put parsers**, which a browser SPA does not. What it shares with a
browser app is that the *renderer* is decoupled from the provider by a
normalized event stream. What differs is that OpenCode can hold the API key and
call the provider directly without a hosted backend, so its "server" and its
"app" ship together and it never has to decide the wire format at deploy time
the way a hosted product does.

### OpenRouter, notably, does NOT remove the parser

`packages/llm/src/providers/openrouter.ts` **[SOURCE]** defines OpenRouter as a
*provider* with its own request-body extensions (`usage`, `reasoning`,
`prompt_cache_key`) — but its protocol reuses the OpenAI parser verbatim:

```
export const protocol = Protocol.make({
  id: "openrouter-chat",
  body: { ... OpenAIChat.protocol.body.from(request) ... },
  stream: OpenAIChat.protocol.stream,     // <- unchanged
})
```

This is the important point for anyone assuming "just use a gateway and the
problem disappears." A gateway normalizes *which endpoint and which auth*, and
it normalizes Anthropic models into OpenAI-chat shape — but **somebody still has
to parse OpenAI chat-completions SSE**, including the positional tool-call
fragment correlation. The gateway moves the problem; it does not delete it.

Corroborated on the gateway's own side: OpenRouter's streaming docs
(`openrouter.ai/docs/api-reference/streaming`) show the response consumed as
`chunk.choices?.[0]?.delta?.content` across all their examples, and describe a
"unified structure" for streamed errors **[PRIMARY-DOC]**. So OpenRouter's
output *is* OpenAI chat-completions SSE regardless of the underlying model. The
docs do not explicitly spell out per-provider normalization of successful
responses, so treat "identical for every model" as strongly implied rather than
stated. **[PRIMARY-DOC, partial]**

---

## T3 Chat (t3.chat)

### Evidence base, and its limits

T3 Chat is **closed source**, so nothing here reaches the grade of the OpenCode
section. I could not inspect the shipped bundle either: `t3.chat`, `/privacy`
and `/terms` all return **HTTP 429 behind a "Vercel Security Checkpoint"** to
every non-browser client tried (WebFetch and curl with full browser headers).
So no artifact inspection was possible. **[SOURCE, my own fetch]**

What *did* work, and it worked well: **feedback.t3.chat**, T3 Chat's own
Featurebase board, where co-founder **Mark Florkowski** replies with an `admin`
badge. The rendered HTML hides comments, but the board's own JSON API
(`/api/v1/submission`, `/api/v1/comment?submissionId=…`) serves them — the same
data the site renders, from T3 Chat's own domain. ~147 posts and ~340 comments
were mined and admin replies isolated. **Those replies are first-party
statements by a founder** and are the backbone of this section. Theo's tweets
were read verbatim (x.com returns 402 to WebFetch; the fxtwitter JSON mirror
carries the tweet's own text).

### Closed source — confirmed in Theo's own words

> "We are asked all the time about open sourcing T3 Chat. While we don't plan to
> do that any time soon, the lack of a good OSS AI chat app has bugged me for
> awhile… Putting up over $10,000 in prizes for the best clones."
> — x.com/theo/status/1931516591478575476 (2025-06-08), announcing
> `cloneathon.t3.chat` **[VERIFIED-PRIMARY]**

There is also **no public API**: "When will you release an API? We won't. What
you want is OpenRouter." (x.com/theo/status/1911887958573302142), and the admin
close on `feedback.t3.chat/p/apit3chat`: "We are not interested in becoming an
API reseller at this time." **[VERIFIED-PRIMARY]**

Cloneathon entries say nothing about T3 Chat's internals and were used as
evidence nowhere in this report.

### The architecture: a HYBRID, and this is the key finding

**T3 Chat is not a single-abstraction app.** Some models are routed through
OpenRouter; others go direct to a provider. The decisive quote is Mark
Florkowski answering why an OpenRouter key cannot be used for GPT-5.2:

> "Because we don't route those models through openrouter, and changing them
> will require some significant changes. Plan to do it, just not top priority
> right now"
> — Mark Florkowski (admin), 2026-03-18,
> `feedback.t3.chat/p/let-openrouter-keys-work-with-more-models`
> **[VERIFIED-PRIMARY]**

That single sentence carries both halves: OpenRouter is a real routing path in
the product, *and* specific models sit deliberately outside it.

The per-provider picture, all **[VERIFIED-PRIMARY]** admin statements:

| Provider | How T3 Chat reaches it | Source post |
|---|---|---|
| OpenAI | **via Azure** — "I will report this to the upstream provider (Azure)" | `gpt-54-nano-mini-55-provider-moderation-too-strict` |
| Anthropic | **was direct, migrated to OpenRouter** — "We're working on this. Just have to overcome a few technical blockers with the OPenrouter team" (status later *Completed*, 2025-08-27) | `switch-to-openrouter-for-anthropic-models` |
| Google | **AI Studio, not Vertex** — "We do not use Vertex endpoints at this time (Jan 2026)" | `use-vertex-api-for-accessing-google-models` |
| Groq | **not direct** — "The restriction is that we don't use the groq api directly." | `i-would-like-to-use-my-own-groq-api-keys` |
| xAI / DeepSeek / cloaked | **OpenRouter** | `byok-support-for-xai-models`; Theo on DeepSeek R1 |

They also run their own **provider routing pool** on top: "We use them as a
potential routing target" (`request-for-cerebras-ai-hosting`), "It seems like
there was a bad provider in the routing pool" (`no-response-for-chat`), "We do
our best to block slow providers"
(`very-slow-generation-or-please-choose-your-providers-more-carefully`).
**[VERIFIED-PRIMARY]**

Theo's own confirmations of the OpenRouter leg: "T3 Chat is now the 4th biggest
Grok 4 user on OpenRouter" (x.com/theo/status/1949938191865090158), and "Thank
you to @openrouter for making it possible to safely deploy DeepSeek R1"
(quoted by OpenRouter as "T3 Chat, now on OpenRouter!").
**[VERIFIED-PRIMARY]**

### There is definitely a server hop

**[VERIFIED-PRIMARY, indirect]** — several independent facts converge:

- A real backend tier, rewritten in **Effect** (TypeScript), Next.js → TanStack
  Start, on **Vercel Fluid Compute**: "Julius's backend rewrite in Effect was
  much heavier and helped a lot with observability… We are *still* using
  Vercel… Fluid Compute is a great primitive for what we are building."
  x.com/theo/status/1997406196660400228 (2025-12-06).
- They inject their own system instructions (`model-is-trying-to-call-tools`).
- They **post-process model output**: "We do our best to coax them into correct
  formatting, and fix whatever we can in post" (`math-rendering`).
- Provider selection happens per request from a routing pool.

None of that is client-side. The default path is browser → T3 backend →
provider/gateway.

### What the browser actually receives — NOT ESTABLISHED

**[UNDETERMINED]**, and I want to be blunt about it because it is the single
question the brief cared most about.

No primary statement identifies the wire format the T3 browser receives. The
closest is an admin reply treating "stream smoothing" as a T3 Chat-side concern
(`realtime-chat-text-streaming-stopped-working`), which implies client-side
buffering of a token stream but does not name a format.

The claim circulating in third-party writeups — that T3 Chat **removed the
Vercel AI SDK from its client-state layer** in favour of **Dexie**/IndexedDB
over message-type and ID-handling problems, while **keeping it for LLM
streaming** — is **[SECONDARY]** and **was not verifiable**. YouTube served
0-byte captions for Theo's video (`youtube.com/watch?v=QLvIoi2s1zY`), so only
the description was recoverable. Do not rely on it. Note also that it is the
*satisfying* answer, which is exactly when a second-hand finding deserves
suspicion.

What can be said structurally, as **inference not evidence**: Anthropic-format
and OpenAI-format legs coexisted behind one UI, so *something* normalized them,
and the only shared component is their server.

### Model switching — constrained, not established

**[UNDETERMINED as to mechanism]**, though the components are
**[VERIFIED-PRIMARY]**.

Firmly established: the app maintained **two distinct upstream shapes
simultaneously** — OpenRouter-routed models and direct-provider models (OpenAI
via Azure, Anthropic pre-2025-08, Google via AI Studio). So the multi-format
problem genuinely exists *inside their backend*, and it is resolved there,
per request, before anything reaches the browser.

One weak hint that the client is meant to be provider-agnostic: a user had to
file a request asking T3 Chat to *expose* which OpenRouter endpoint served a
response, and the admin declined to surface it
(`expose-open-router-end-point-details-in-stats-for-nerds`). That is about UI
disclosure, not the wire, so weight it lightly.

**Does the T3 client need to know the provider to parse? [UNDETERMINED]** — no
primary source either way, though a single renderer over heterogeneous upstreams
makes "no" the strongly favoured reading.

### A trend worth noticing: T3 Chat is COLLAPSING its format surface

This is the most interesting thing in the T3 evidence and it is not something
either of us set out to look for.

Trace the direction of travel: Anthropic **moved from direct onto OpenRouter**
(completed 2025-08). OpenAI is served **through Azure** rather than direct.
Groq is explicitly **not** used directly. The remaining direct leg that is
*known* to be outside OpenRouter is a subset of OpenAI models, and the admin
says moving those is planned — "Plan to do it, just not top priority right now."

Azure OpenAI and OpenRouter **both emit OpenAI chat-completions SSE**. So T3
Chat's upstream format surface has been narrowing over time toward a single
shape. **[INFERENCE from VERIFIED-PRIMARY facts]**

That is the opposite of OpenCode's direction, and the reason is instructive
rather than contradictory — see the implications section.

### BYOK

**BYOK is keyed to the ROUTE, not the model** — itself further evidence of the
hybrid. **[VERIFIED-PRIMARY]**

- OpenRouter-routed models take an **OpenRouter** key: "BYOK support for xAI
  models" → "Available via OpenRouter keys" (`byok-support-for-xai-models`).
- Direct-provider models require **that provider's** key (the GPT-5.2 quote above).
- OpenAI BYOK requires org verification with OpenAI, and the error surfaced is
  OpenAI's own (`what-the-hell-solve-this-asap`).

**Keys are stored locally in the browser and are not synced server-side:**

> "Because if your keys are synced, that means that we are storing them, which
> many people have indicated that they are not comfortable with. ON our end, we
> don't really love the liability of it either"
> — Mark Florkowski, `feedback.t3.chat/p/api-key-stored-locally`
> **[VERIFIED-PRIMARY]**

**Whether the browser calls the provider DIRECTLY in BYOK mode: [UNDETERMINED],
and this is the gap most worth flagging.** Local-only key *storage* is equally
consistent with (a) the browser calling the provider directly, and (b) the
browser attaching the key to each request to T3 Chat's backend, which forwards
it without persisting. Mark's wording distinguishes *storing* from *receiving*
and never addresses the latter. Two facts lean against a direct browser call —
T3 Chat injects system instructions and post-processes output, and BYOK still
runs through their pricing/fallback logic ("BYOK is really intended as an escape
hatch", `when-using-byok-let-us-determine-when-we-fallback-on-using-the-api-key`)
— but that is inference, and I am not asserting it.

### Sources deliberately not leaned on

Grokipedia, ai.miraheze.org, daily.dev, troublefreeai.com, verved.ai, galaxy.ai
— all **[SECONDARY]**, several visibly recycling each other's summary of the
same video. One of them asserts a **Cloudflare edge**, which contradicts the
primary evidence (T3 Chat is on Vercel, per Theo and per the Vercel checkpoint
I hit myself). That is a concrete instance of the secondary tier being wrong,
and a reason to discount the AI-SDK claim that comes from the same tier.

An OpenRouter apps-leaderboard placement (T3.Chat 10th in General Chat, 644M
tokens) appeared in a search snippet but **could not be verified** on
openrouter.ai. **[SECONDARY]** It would be weak evidence regardless: OpenRouter
attributes by referer, so users' own BYOK keys would also land under T3 Chat.

## What this implies for a UI kit that ships parsers

### 1. The problem is real, and at least one serious project solves it the same way

The strongest single result of this research: **OpenCode maintains ~4,000 lines
of hand-written, separately-tested, per-protocol SSE parsers** — with the exact
OpenAI-flat vs Anthropic-block split our kit describes — and their design
comment justifies protocol/deployment separation in almost the same words we
would. That is a serious, high-traffic project independently landing on our
architecture. "Are we solving something everyone else avoids?" — no. At least
one heavyweight solves it head-on, and is currently migrating *toward* doing
more of it by hand, not less.

### 1b. The two projects diverge, and the split predicts who needs parsers

This is the sharpest finding in the report, and neither of us set out to look
for it.

- **OpenCode is adding parsers.** Own protocol layer, big-three shapes first,
  "future provider slices" planned. **[SOURCE + PRIMARY-DOC]**
- **T3 Chat is removing formats.** Anthropic moved onto OpenRouter, OpenAI comes
  via Azure, Groq explicitly not direct, and the remaining direct OpenAI leg is
  slated to move too. Azure OpenAI and OpenRouter both speak OpenAI-chat, so
  their upstream surface is converging on one shape.
  **[INFERENCE from VERIFIED-PRIMARY facts]**

These look contradictory and are not. The variable is **how much
provider-native surface the product needs**:

- OpenCode is an **agent**. It needs prompt-cache control, reasoning signatures
  and native-continuation metadata, provider-executed server tools, per-provider
  tool envelopes, exact token accounting. Their code is full of this — the
  Anthropic parser handles `server_tool_use` and thinking signatures; the schema
  carries `nonCachedInputTokens` / `cacheReadInputTokens`. **A gateway flattens
  exactly those.** So OpenCode cannot afford normalization it does not own, and
  writing parsers is the price of provider-native fidelity.
- T3 Chat is a **chat product**. It needs text, reasoning, attachments, and
  breadth of model choice. Almost none of it survives or requires the
  provider-native layer, so a gateway is a straight win and the format surface
  can be collapsed.

**The rule this yields, which is the useful takeaway:** you need per-protocol
parsers in proportion to how much provider-native capability you expose. Our kit
sits closer to T3 Chat's end for the common case (text, reasoning, tools,
attachments) — which is precisely why `readOpenAIStream` being the scaffolder's
only emitted reader is the right default — but `readAnthropicStream` earns its
place for consumers who go direct to Anthropic and want thinking blocks and
cache behaviour intact. Both entry points are justified; they serve different
consumers, and we should say so in the docs rather than presenting them as
interchangeable.

### 2. But note WHERE they put the parsers relative to the UI

This is the part that should give the repo owner pause, and it is worth being
blunt about it.

OpenCode splits into two packages that map cleanly onto our two concerns:

- `@opencode-ai/llm` — the protocol parsers. Consumed by the **server**.
- `@opencode-ai/session-ui` — a **SolidJS** chat UI component package (Kobalte,
  solid-primitives, Shiki streaming, Storybook stories; `message-part-text`,
  `markdown-stream`, `prompt-input`, tool cards). **[SOURCE]**

Their UI package contains **zero** provider parsing — verified by grep. The UI
consumes normalized parts only. So OpenCode agrees with us on *the seam* (Solid
components above, protocol parsers below, normalized parts between) but places
the parser package on the **server** side of the network boundary, not in the
package a UI developer installs.

Our kit ships both, though `@kitn.ai/ui/wire` is already a separate subpath
export from the components — structurally the same separation, differently
packaged. The honest read is that our `wire/` entry point is doing the job of
their `@opencode-ai/llm`, and it is fine for it to live in the same npm package
as long as consumers can use the components without it and vice versa.

### 3. On the crux: is the wire format per-app or per-request?

**For OpenCode, it is unambiguously per-request.** The model is resolved inside
the turn loop and the resolved model object carries its protocol. Switching
models mid-session re-dispatches to a different parser on the next turn with no
ceremony.

**And on our side the premise of the worry turns out to be false.** I checked
our own tree (read-only) before concluding anything, and the scaffolder does
*not* bake a browser wire format per app:

- `readModelStream(source, sink, opts)` takes `opts.format` as a **runtime
  argument**, and calls `opts.format.open()` **once per stream** — the code
  comment says this is "the whole point of the `open()`/`push()` shape: a
  stateful format (Anthropic) gets a fresh block map per call."
  `packages/ui/src/wire/read.ts` L118-133. `readOpenAIStream` /
  `readAnthropicStream` are thin presets over it. So the library layer already
  supports per-request format selection, with correct per-call state isolation.
- The **scaffolder's emitted front end always uses `readOpenAIStream`, with no
  branch on `streamFormat` at all** — and there is a CI guard enforcing that any
  integration whose upstream is not OpenAI SSE **re-frames server-side**.
  `packages/ui/src/agent-tooling/registry.test.ts` L520-547. The guard even
  rejects `new Response(upstream.body)` outright so a route cannot pass provider
  frames through to the browser.
- `streamFormat` in the integration registry describes the **upstream**
  (server↔provider) shape, not what the browser receives. Our own
  `types.ts` L213-219 calls conflating the two "a category error." The
  `anthropic` integration is `streamFormat: 'native'` and its route hand-rolls
  a re-framer to OpenAI frames.

So a scaffolded app is already in the "gateway" position: the browser's format
is fixed at OpenAI chat-completions **for every integration**, and provider
differences are absorbed server-side, per request. A model picker spanning
providers does not break it — that is exactly the case the re-framing guard
exists to protect.

**The one residual risk is guidance, not API.** A consumer who bypasses the
scaffolder, calls `readAnthropicStream` directly from their client, *and* then
adds a multi-provider model picker will have hardcoded a per-request property.
The fix is documentation plus pointing them at `readModelStream` with a format
chosen from the selected model — not an API change. Worth a line in the docs;
not worth a redesign.

Also worth keeping: the "we do not auto-detect, the caller picks it" stance is
**shared by OpenCode**, who look the protocol up from declared catalog metadata
and hard-fail with `UnsupportedApiError` on an unknown value rather than
sniffing. That is a point of independent agreement, not an idiosyncrasy.

### 4. The gateway objection does not dissolve the problem

Worth stating plainly because it is the most likely pushback: "just use
OpenRouter and there's only one format." True, and that is exactly what OpenCode
does for OpenRouter — **and they still route it through
`OpenAIChat.protocol.stream`**. A gateway collapses N formats into 1; it does
not remove the need to parse that 1, and the 1 it picks is OpenAI
chat-completions, tool-call index correlation and all. A kit that ships
`readOpenAIStream` is directly useful to every gateway user.

### 5. A caution about researching this by reading docs

OpenCode's live published docs at `opencode.ai/docs/models` still say "OpenCode
uses the AI SDK and Models.dev to support 75+ LLM providers" **[PRIMARY-DOC,
fetched live]**, while `packages/core/src` contains no `streamText` import at
all and routes the big three protocols through their own parsers. Anyone
assessing "does anyone else hand-write parsers?" from documentation would
conclude the opposite of what the source shows. Weight source over docs when
they disagree.

---

## What I could NOT establish

Listed plainly so nothing here gets quoted with more confidence than it earned.

**OpenCode (high confidence overall, these are the edges):**

- **When** the AI-SDK→own-protocol migration started, or its stated rationale.
  The clone was shallow so I had no git history, and I found no blog post or ADR
  explaining the rewrite. The *fact* and *direction* of the migration are solid
  (their spec calls the native surface "deliberately narrow" and lists remaining
  work as "future provider slices"); the *why* and *when* are not.
- Whether the long-tail providers still flow through the AI SDK at runtime today
  or are simply unavailable on the V2 runner. `supported()` gates them out and
  `UnsupportedApiError` is the failure, but I did not trace the V1 path.

**T3 Chat (architecture: good confidence — wire format: none):**

Their *routing* architecture is well established from founder statements. What
remains open is specifically the wire:

- **The wire format the T3 browser receives.** No primary statement exists that
  I could find. This is the question the brief cared most about and it is the
  one I could not answer.
- **Whether the Vercel AI SDK is used server-side today.** Only secondary claims
  about its removal from *client* state survive; YouTube served 0-byte captions
  for Theo's video, so no primary confirmation either way.
- **Whether BYOK requests go browser→provider or browser→T3 server→provider.**
  Local-only key *storage* is confirmed; direct-from-browser calls are not, and
  the founder's wording distinguishes storing from receiving.
- **Where normalization sits** between T3 Chat's Effect backend and OpenRouter
  for the direct-provider legs.
- The privacy policy text and the shipped bundle — both blocked by the same
  Vercel Security Checkpoint (HTTP 429 on `/`, `/privacy`, `/terms`).

Note one earlier claim of mine was **superseded**: I initially read the
subprocessor list through a search index and treated it as the strongest T3
evidence. The founder statements on `feedback.t3.chat` are strictly better
evidence for the same conclusion (hybrid routing), and they corroborate it
independently. The privacy-policy reading is retained only as corroboration.

**If someone wants to close the T3 gap**, the highest-yield move by far is to
open t3.chat in a real logged-in browser and watch the Network tab on a model
switch: one request, one response content-type, and the first few SSE frames
would answer every open question above in about thirty seconds. Everything I
could not determine is gated on access, not on analysis.
