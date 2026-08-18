# kai devtools as an observability tool — capability matrix and slice plan

Date: 2026-08-17
Status: **REQUIREMENTS + CAPABILITY INVENTORY.** Rulings needed on the open questions
at the end; the slice plan is a recommendation, not a schedule.
Verified against `origin/main` at `47b292fe` (`Update .coderabbit.yaml`), which
contains `473325a7` (the wire diagnostic stream), `64924c9b` (the devtools hook) and
`1cbdf9f0` (the globalThis emitter singleton + its dist guard).

Consumes and does not restate: `2026-08-14-endpoint-choice-design.md`
§"The diagnostic event stream" (the envelope, the five event types, the
metadata/payload rule) and `2026-08-14-kai-devtools-design.md` (delivery, the capture
model, the hook shape). Both are still correct where they describe the stream. This
document exists because **neither of them is an inventory**, and the cost of that has
already been paid: every requirement below arrived one at a time, after the tool had
been built without it.

## Why this document exists

The failure mode has been reactive scope discovery. A capability was built, shown, and
found to be missing something; the something was added; the next showing found the next
gap. That loop is expensive and it never converges, because the missing pieces are not
a list anybody has written down.

So this is the list. Every question a developer would ask of a chat application, with a
verdict against the tree rather than against a design document. Four verdicts:

- **SHIPPED** — on `origin/main` today, at the cited line.
- **IN FLIGHT** — a branch exists. Named, never depended on.
- **MISSING** — the kit could see it and does not. This is work.
- **NOT KNOWABLE** — the kit structurally cannot see it. This is a UI obligation, not
  a backlog item: the panel has to say so rather than render a confident blank.

The fourth verdict is the one that earns the document. A panel that shows nine facts
and stays silent about the tenth teaches the developer that the tenth does not exist.
`2026-08-14-endpoint-choice-design.md` already ruled this for one field — "a consumer
renders it as absent when it is absent" — and it generalises to the whole surface.

**Every factual claim here has a check in the table at the end.** Several claims in the
two parent specs did not survive being checked; they are listed in §5 rather than
quietly worked around.

---

## 1. The three levels

The owner's framing is "an observability mechanism tool for the chat application", and
the word that matters is *application*. The stream today is a **stream-level** tool: it
answers questions about one provider response. Two levels sit above it and neither
exists.

**Stream.** One `readModelStream` call: one provider response, one `streamId`. Every
`wire.*` event carries it (`packages/ui/src/wire/diagnostics.ts:30`). This is the level
the shipped stream serves, and it serves it well.

**Trace.** One user turn — which is one submit and *everything it caused*. A tool loop
is several reads into one assistant turn, and today each read mints its own
`streamId` (`packages/ui/src/wire/read.ts:188`) with **nothing tying them together**.
Round 2 of a tool loop is indistinguishable from an unrelated later message. This is
the level almost every question the owner asked actually lives at: "the thinking, and
the time between thinking and responding" spans rounds; "multiple models where there
are sub-agents" is by definition several streams in one trace; "is the context the
original context" is a question about what was sent at the *start* of a trace versus
what the thread held.

**Session.** The page. Which elements registered, which contract violations fired, the
aggregate token spend, the model mix. Nothing here is stream-scoped and nothing here
exists today.

Aggregates that are **honestly computable** at each level, and the ones that are not:

| Aggregate | Level | Honest? |
|---|---|---|
| frames, chunks, parts-by-variant | stream | yes — counted, `wire.close` |
| wall time, time-to-first-frame, inter-frame gaps | stream | yes — event `t` deltas |
| time-to-first-reasoning, reasoning→text gap | stream | yes — `wire.part` `t` by variant |
| tokens per stream | stream | **only when the provider sent usage**; absent is not zero |
| tokens per trace | trace | yes IF traces exist — a sum over streams |
| **cost per session** | session | **NO.** `costUsd` is populated by one non-standard field on one gateway (§ req 6). Summing it across a session where most streams lack it produces a number that is wrong and looks right. |
| requests per session | session | yes |
| "was every turn healthy" | session | yes — a fold over `errorCode` |

The costing row is the one to be strict about. A total that silently excludes the
streams with no `costUsd` is the "confident zero" the forward-compat rule already
forbids, wearing a currency symbol.

---

## 2. The capability matrix

One row per question a developer would actually ask. Grouped by the owner's own
requirements.

### Req 1 — "Are we connected?"

| Question | What answers it | Event / field | Status | Evidence | Notes |
|---|---|---|---|---|---|
| Did a stream open at all? | the open event | `wire.open` | **SHIPPED** | `read.ts:190-198`; type at `diagnostics.ts:34-39` | Emitted after the source resolves, before `format.open()`. |
| What kind of thing was I handed? | `source` | `wire.open.source` — `response` / `stream` / `iterable` | **SHIPPED** | `read.ts:43-48` | Duck-typed; `iterable` is the fallback, not a positive identification. |
| Which reader is parsing it? | `format` | `wire.open.format` (`opts.format.id`) | **SHIPPED** | `read.ts:195` | The requested dialect. Half of every wrong-dialect diagnosis. |
| **What endpoint was this?** | the response URL | — | **MISSING** | `read.ts:125-133` duck-types a `Response` on `ok`/`status`/`body` only | `Response.url` is **present on the object already handed in** and is never read. This is the owner's literal first question and it is one property access. See §5-A. |
| **Was the content type `text/event-stream`?** | the response headers | — | **MISSING** | no match for `content-type` in `read.ts` or `sse.ts` | The `empty-stream` message *tells the developer to go check this by hand* (`consume.ts:503-506`) while the object that knows it is in scope. See §5-A. |
| Did any bytes arrive? | frame count | `wire.close.frames` | **SHIPPED** | `consume.ts:530`, `read.ts:252` | Absent, not zero, on a direct `consumeModelStream` call — deliberate. |
| Did the connection fail before a stream? | the failed event | `wire.failed` — `status`, `statusText`, `bodyBytes`, `bodyIsJson`, `providerCode` | **SHIPPED** | `read.ts:151-171`; type at `diagnostics.ts:90-99` | `bodyIsJson: false` on a 502 is the proxy-returned-HTML signature. |
| **A 200 with no body** | — | — | **MISSING** | `read.ts:172-176` throws a plain `Error`, not a `WireError`, **before** `wire.open` is emitted | The sibling of `wire.failed`, and it emits nothing at all. A panel sees a stream that never opened and no failure. |
| **Frames that arrive but do not parse as JSON** | — | — | **MISSING** | `sse.ts:145-152`, documented at `:130-132`: the frame is skipped and `onRawFrame` is deliberately **not** called | So a stream of malformed frames is indistinguishable from a stream of keep-alives, and surfaces later only as `empty-stream` — which sends the developer to check the wrong thing. |
| Did the stream end early / get aborted? | — | `wire.interrupted` | **IN FLIGHT** | branch work, not on main | An abort today produces no close event at all, so a panel sees an open stream that never finishes. |
| Was it slow, or was it buffered? | frame timestamps | `wire.frame.t` deltas | **SHIPPED** | `read.ts:234` | Every frame landing in one burst at the end is a proxy buffering SSE. Invisible in the network panel. |
| How long did the *request* take? | — | — | **NOT KNOWABLE** | the app calls `fetch`; `readModelStream` receives an already-resolved `Response` | `wire.open.t` is when the kit was handed the response, **not** when the request left. A panel must never label it "time to first byte". |

### Req 2 — "What are the input and the response?"

| Question | What answers it | Event / field | Status | Evidence | Notes |
|---|---|---|---|---|---|
| How much came back? | byte and char counts | `wire.frame.bytes`, `wire.part.chars` | **SHIPPED** | `read.ts:236`, `consume.ts:298` | Sizes only. The metadata rule holds: pinned by the `SECRET` assertion in `diagnostic-events.test.ts`. |
| What *shape* came back? | the key union per frame | `wire.frame.fields` | **SHIPPED** | `read.ts:225-238`; rationale at `diagnostics.ts:50-55` | The field that earns the design: frames whose chunks never carry a content key is the failure a chunk count cannot separate from health. |
| What was the encoded request? | the encoder's output | `encode.request` | **IN FLIGHT** | branch work | The single highest-value addition. See §5-C and the slice plan. |
| What was the actual response text? | — | `payload.*` | **IN FLIGHT** | branch work, behind its own signal | §4 is the whole discussion. |
| What did the app POST? | — | — | **NOT KNOWABLE** | the kit does not fetch (`CLAUDE.md`, "the kit PARSES, the consumer FETCHES") | The kit can show what the *encoder produced*. What the app then wrapped it in — model id, temperature, tools, a hand-prepended system message — is the app's object. The in-flight `reportRequest`/`app.request` API is the seam for an app that wants to volunteer it. |

### Req 3 — "If there are any errors"

Every error class the kit can observe. **Five of the seven exist and are reported
somewhere; two of the five reach the diagnostic stream.**

| Class | Where it lives | Machine code? | On the stream? | Evidence |
|---|---|---|---|---|
| Transport / HTTP | `WireError` — `status`, `statusText`, `bodyText`, `body` | HTTP status + `providerCode` | **SHIPPED** | `read.ts:63-85`, `read.ts:103-112`, `wire.failed` at `read.ts:154-168` |
| Provider in-band (HTTP was already 200) | `ModelStreamChunk.error` → `ModelTurn.error` | `code?` — provider's, free-form | **SHIPPED** as `wire.close.errorCode` | `chunk.ts:89`, `consume.ts:401`, `consume.ts:542` |
| Parse / emptiness — the kit's own | `empty-stream`, `empty-turn` | **yes, the kit's own closed vocabulary** | **SHIPPED** | `consume.ts:497-516` | 
| **Tool** — three distinct failures | `ToolPart.errorText` (a UI part) | **NO — free text, no code** | **MISSING** | `consume.ts:189` (stream died mid-call), `:201` (no function name), `:227-229` (malformed/truncated args) |
| **Card validation** — two tiers | `host.emit({ kind: 'error', cardId, message })` | no | **MISSING** | `card-renderer.tsx:114-143`; hard tier renders `CardFallback` at `:156`, soft tier renders normally and reports only through the emit; unknown type at `:164-170` |
| **Element contract** — `messages` not an array / entries without `parts` | `console.error`, deduped per object | no | **MISSING** | `validate-messages.ts:44-75`, used by `kai-chat` (`chat.tsx:107`), `kai-workspace` (`chat-workspace.tsx:141`), `kai-thread` (`thread.tsx:95`) |
| **Encode** — unencodable attachment, unechoa­ble reasoning | `WireEncodeError`, thrown | no | **MISSING** | `encode.ts:180-187`, `:631-643` |

Two rulings fall straight out of this table.

**The "closed vocabulary" claim fails in both directions, and the second way is worse.**
The devtools spec says "error codes are the kit's own closed vocabulary … so a panel
renders its own explanation keyed by code and never needs the message text"
(`2026-08-14-kai-devtools-design.md`, forward-compat rules).

*It is not closed.* `git grep "code: '" -- packages/ui/src/wire/` returns exactly two
non-test hits — `empty-stream` at `consume.ts:501` and `empty-turn` at `:509` — as
inline literals inside one ternary. **There is no union type, no `const CODES`, no
exported enumeration anywhere**; the type is the fully open `code?: string | number`
(`chunk.ts:89`, `chunk.ts:177`, `diagnostics.ts:84`). Tool errors, card validation
errors and encode errors carry **no code at all** — a panel keyed purely on codes shows
three of the seven classes as "an error occurred".

*And it is not the kit's.* `wire.close.errorCode` carries **provider** codes verbatim
through the same field — OpenAI's `err.code` (`formats/openai.ts:175-183`) and
Anthropic's `err.type` (`formats/anthropic.ts:220-232`) both flow through
`consume.ts:542`. **A panel cannot tell a kit code from a provider code without
hardcoding the two kit values**, which is exactly the hand-written restatement this repo
keeps paying for. Worse, an OpenAI in-band error commonly has no `code`, so `wire.close`
carries **no `errorCode` at all** and the only evidence of the failure is a parts count.

Recommended: export the kit's codes as a union from `wire/`, and add a boolean or a
prefix that separates kit codes from provider codes on the event. Give the three tool
errors codes at the same time — they are already three enumerated branches at
`consume.ts:189/201/227`, so it is a rename.

**The kit already has a diagnosable-condition surface, and none of it is on the
stream.** `console.warn`/`console.error` sites exist across `primitives/card-routing.ts:77`
(no policy handler for a card kind), `components/confirm-card.tsx:74/97/106`,
`components/tasks-card.tsx:61`, `components/choice-card.tsx:77` (duplicate ids, unknown
styles), `components/artifact.tsx:136` (**a blocked unsafe URL** — a security event),
and `schemas/registry.ts:338` (an incomplete card registry). Every one of them is a
condition a developer would want in a session log, and every one is reachable only by
having the console open at the moment it fired. A `kit.warn` event type carrying the
same code and site is the cheapest large win in this document.

### Req 4 — Attachments, and whether they can always be previewed

**The devtools half is easy. The library half is a defect, and it is the most
significant finding in this document.**

| Question | Status | Evidence |
|---|---|---|
| Are there attachments on this turn? | **MISSING** | `wire.part` is emitted only for the four *streamed* variants (`consume.ts:302-330`). A `file` part is authored, never streamed, so no diagnostic event mentions attachments at all. |
| What are they (name, type, size)? | **MISSING** | `AttachmentData` at `components/attachment-types.ts:3-10` carries `filename`, `mediaType`, `url`. Filename is arguably payload; **media type and byte size are metadata by the rule** and belong in the default stream. |
| Did they survive encoding? | **IN FLIGHT** | `encode.dropped` on the encode-instrumentation branch. |
| **Can every accepted media type be previewed in the thread?** | **NO. See below.** | |

#### The preview gap, stated plainly

Three layers disagree about media types, and the disagreement is not a subset relation
in either direction.

- **The composer accepts everything, by default.** `<kai-chat>` defaults `accept:
  undefined` (`elements/chat.tsx:101`), and with `accept` unset every picked file is
  staged unconditionally — `default-input.tsx:158-160` computes `undefined` for each
  decision and `:179` stages on `decision === undefined || status === 'allowed'`. The
  comment at `:161-162` says this is deliberate. So `.zip`, `.mp4`, `.mp3`, `.svg` and
  `.exe` all reach the thread out of the box.
- **The thread previews exactly two categories.** `AttachmentPreview`'s entire switch is
  `components/attachments.tsx:187-215`: an `<img>` when the category is `image`, a
  `<video>` when it is `video`, and a lucide icon otherwise. In the message thread the
  variant is hardcoded `inline` (`components/message.tsx:478-494`), so the image
  preview is a **20×20 pixel thumbnail** (`attachments.tsx:200-206`). The 96px grid tile
  and the `<kai-attachments hover-card>` full preview both exist and the thread uses
  neither.
- **The encoder accepts four image formats, PDF, and text.** `ENCODABLE` at
  `wire/media-types.ts:92-103`. SVG and BMP are excluded *on purpose* — `:76-77`: "both
  are a 400 at request time, so they are absent on purpose."

The resulting three-way disagreement:

| Media type | Composer stages it? | Thread previews it? | Encodes? |
|---|---|---|---|
| `image/png` `image/jpeg` `image/gif` `image/webp` | yes | **yes** (20×20) | yes |
| `image/svg+xml`, `image/bmp`, `image/avif` | **yes** (default) | **yes — a real, convincing `<img>`** | **NO — throws** |
| `video/mp4`, `video/webm` | **yes** (default) | **yes — a real `<video>`** | **NO — throws** |
| `application/pdf` (base64) | yes | no — a `FileText` icon | **yes** |
| `text/*`, `application/json`/`xml`/`yaml` | yes | no — a `FileText` icon | **yes** |
| unnamed file (`.ts`, `.rs`, `.go`, `.sql`) | yes if the bytes decode as UTF-8 | no — a `Paperclip` icon | **yes**, as text |
| `audio/*`, `application/zip`, unknown binary | **yes** (default) | no — an icon | **NO — throws** |

Three findings, in descending severity.

**A. The renderer does not read the media declaration, and the declaration says it
must.** `wire/media-types.ts:63-66` is unambiguous: *"★ THE DECLARATION. Everything
else in this file, and both `accept` surfaces, are derived from this array. … If you
find yourself writing a second list of media types anywhere in this repo, delete it and
read this."* `getMediaCategory` at `components/attachments.tsx:34-47` **is that second
list** — a hand-rolled prefix switch (`image/`, `video/`, `audio/`, then `application/`
and `text/` both collapsed to `document`) with no import from `wire/media-types.ts`.
Adding a row to `ENCODABLE` moves the picker and both encoders and does not move the
renderer. This is the repo's own "derive it, don't type it" rule broken at the one site
its own declaration names.

**B. Preview implies sendable, and it lies in the loud direction.** SVG and video are
the sharp cases: both render a real preview and both **throw** at
`toOpenAIMessages`/`toAnthropicMessages` (`encode.ts:180-187`, default policy `'throw'`
at `:433`). A user drops an `.svg` diagram, sees it rendered perfectly, hits send, and
the request explodes. Meanwhile PDF and text — the two things the wire handles *best* —
get the most anonymous treatment. The visual hierarchy is inverted relative to the
capability set.

**C. The gap is not a silent drop, but only by accident.** Nothing vanishes:
`AttachmentInfo` (`message.tsx:488` → `attachments.tsx:241-259`) guarantees a filename
chip for every file part, and the encoder throws with a full remediation sentence
rather than skipping. So "decide loudly" is not violated at the point of drop. What is
missing is one step earlier: **the renderer makes no decision, so it cannot report
one.** There is no console line, no `data-preview` attribute, nothing. And
`lint:silent-drops` cannot reach it — the guard reads `src/wire/*.ts` only
(`scripts/lint-silent-drops.mjs:83`).

Zero tests pin the preview switch. `components/attachments.test.tsx` has two cases and
both are about layout; `components/message.test.tsx:22-104` tests grouping with
fixtures that carry no `mediaType` and no `url`.

**Recommendation: file this as a library defect independent of devtools.** The cheapest
correct fix consistent with the existing design is to have `AttachmentPreview` consult
`resolveMediaPolicy().decide()` rather than its own prefix table, drop the `video`
branch (nothing encodable is video), and mark previewable-but-unencodable attachments
visibly in the chip. The devtools contribution is orthogonal and still worth having: an
`attachment` fact on the encode event, carrying media type, byte size, and whether the
encoder accepted it.

### Req 5 — Thinking, and the time between thinking and responding

| Question | Status | Evidence |
|---|---|---|
| Did the model reason at all? | **SHIPPED** | `wire.part` with `variant: 'reasoning'` (`consume.ts:308-319`), and `wire.frame.fields` containing `reasoning`. |
| Did it reason without showing it? | **SHIPPED** (OpenAI-family only) | `wire.close.usage.reasoningTokens > 0` with zero reasoning parts. `chunk.ts:37` states exactly this. **Anthropic never reports it** — see req 6. |
| When did thinking start and end? | **SHIPPED, derivable** | first and last `wire.part` with `variant: 'reasoning'`, by `t` (`consume.ts:292-299`). |
| The gap between thinking and answering | **SHIPPED, derivable** | first `variant: 'text'` `t` minus last `variant: 'reasoning'` `t`. |
| Time to first frame | **SHIPPED, derivable** | first `wire.frame.t` minus `wire.open.t`. |
| Total turn time | **SHIPPED** | `wire.close.ms`, measured from `consumeModelStream` entry (`consume.ts:544`). |
| Thinking time *across a tool loop* | **MISSING** | needs traces. Each round is a separate `streamId` with nothing joining them. |

Everything at the stream level is already derivable and none of it is presented. This
is the single largest "already paid for, not yet spent" item in the document: the
timing lane is a fold over events that exist.

One caveat a panel must respect: `wire.part` fires per **sink write**, not per part
(`consume.ts:280-300`), so a reasoning phase is a run of events, not one. The part
*count* is `wire.close.parts`, which counts distinct parts — the docblock at
`consume.ts:251-261` is explicit that these two numbers are different on purpose.

### Req 6 — Token usage

`ModelUsage` is `packages/ui/src/wire/chunk.ts:33-41` — six optional fields. It reaches
the stream as `wire.close.usage` (`consume.ts:543`), merged shallowly across chunks
(`consume.ts:398`), so Anthropic's split reporting composes correctly.

**Which fields are populated, by whom:**

| Field | OpenAI chat-completions | Anthropic Messages |
|---|---|---|
| `inputTokens` | `prompt_tokens` — `formats/openai.ts:31-32` | `input_tokens` — `formats/anthropic.ts:48-49` |
| `outputTokens` | `completion_tokens` — `openai.ts:33-34` | `output_tokens` — `anthropic.ts:50-51` |
| `totalTokens` | `total_tokens` — `openai.ts:35-36` | **never** — no source field read |
| `reasoningTokens` | `completion_tokens_details.reasoning_tokens` — `openai.ts:37-43` | **never** |
| `cachedInputTokens` | `prompt_tokens_details.cached_tokens` — `openai.ts:44-48` | `cache_read_input_tokens` — `anthropic.ts:52-53` |
| `costUsd` | top-level `cost` — `openai.ts:49-50` | **never** |

Four things follow, and each is a correction to an assumption a panel would otherwise
make:

1. **`costUsd` is not an OpenAI field.** A top-level `cost` on a chat-completions chunk
   is a **gateway extension** — OpenRouter's, which is what this repo's fixtures were
   recorded through. Against `api.openai.com` or `api.anthropic.com` directly it is
   never populated. A cost column is therefore blank for most users, and a session
   total over it is misleading. Render it per-stream, never summed, and say what
   produced it.
2. **Anthropic reports no reasoning tokens** because it does not separate them — thinking
   is inside `output_tokens`. So the "reasoned but hid it" diagnosis at `chunk.ts:37` is
   an OpenAI-family capability only. A panel must not render "0 reasoning tokens" for an
   Anthropic stream; it must render *absent*.
3. **`cache_creation_input_tokens` is never read** (`anthropic.ts` has only
   `cache_read_input_tokens` at `:52`). Cache *writes* are billed at a premium and are
   currently invisible in a kit that otherwise reports cache reads. **MISSING**, and a
   two-line fix — but note it needs a seventh `ModelUsage` field, not a merge into
   `cachedInputTokens`, which would conflate a discount with a surcharge.
4. **Absent is not zero, on every row.** A proxy that strips usage, a custom endpoint
   that never sends it, and a model that used no cache are three different facts and
   `undefined` is all three.

### Req 7 — Which model, and multiple models

| Question | Status | Evidence |
|---|---|---|
| Which model *answered*? | **SHIPPED — but only on `wire.frame`** | `chunk.ts:44-59`; read at `formats/openai.ts:187-188` (per frame, deliberately no dedupe) and `formats/anthropic.ts:253-254` (`message_start` only). Surfaced at `read.ts:226-240` as `wire.frame.model`. |
| Which model answered, per turn? | **MISSING** | `WireCloseEvent` has no `model` (`diagnostics.ts:72-87`), and `ModelTurn` has no `model` either (`chunk.ts:162-183`) — `consume.ts` never reads `chunk.model`. The value is computed at `read.ts:229` and discarded. A panel must fold frames to get it. |
| Did the model change mid-stream? | **SHIPPED** | the no-dedupe ruling at `formats/openai.ts:185-186` — "a stream that changes its mind mid-turn is a finding, and collapsing it would hide one." |
| Which model was *requested*? | **NOT KNOWABLE by the kit** | no model field on either encoder's output (`encode.ts:31-43`, `:112-115`); the app puts `model` beside `messages` in its own body. |
| What did the user *select*? | **MISSING, and worse than missing** | `<kai-model-switcher>` holds `models` and `currentModel` (`elements/model-switcher.tsx:12-14`) and dispatches `kai-model-change` with `{ modelId }` (`:26-31`, `:115`). The selection **never reaches the wire layer** — the component is a controlled leaf with no `wire/` import. |
| Sub-agents / multi-call turns | **NOT KNOWABLE beyond the round** | see below |

**The switcher is decorative in a scaffolded app.** `scaffold.ts` has zero matches for
`kai-model-change`, and the generated client sends a hardcoded const —
`scaffold.ts:1899` (and identically at `:1573`, `:2249`, `:2462`, `:2792`, `:3073`,
`:3387`): `// SCAF-8: change this model id to another id THIS PROVIDER accepts. const
model = 'gpt-4o-mini';`. So a user switches the model, the event fires, nothing listens,
and the request keeps the old id. The devtools finding "selected Claude, served gpt-4o"
that the devtools spec names as its best single line would, in a scaffolded app, be
**correct and would be reporting a scaffold bug**. That is a good outcome and worth
saying out loud, but it means requested-vs-served is a scaffold fix as much as a panel
feature.

**On sub-agents.** What is knowable: each round of a client-driven tool loop is a
separate `readModelStream` call with its own `streamId` and its own served model, so
*if* the rounds can be joined, "round 1 was haiku, round 2 was opus" is reportable
today. What is not knowable: any model invoked **server-side**. Six of eleven catalog
integrations declare `forwardsFromClient: []` (`mastra.ts:142`, `langgraph.ts:103`,
`cloudflare.ts:158`, `mock.ts:58`, `pi.ts:99`, `pydantic-ai.ts:82`) and define their own
model in agent code — `langgraph.ts:28` constructs `new ChatOpenAI({ model: 'gpt-4o' })`
inside the agent. A sub-agent there produces **one SSE stream** at the browser, and the
kit sees exactly one model: whatever the outer stream stated, if it stated one. **This
is the hard boundary and no amount of client instrumentation moves it.**

### Req 8 — System prompts

**The client-side kit cannot see a system prompt. There is no channel, in either
direction.** This is the strongest negative in the document and it was checked
exhaustively.

| Where a prompt could enter | Visible to the kit? | Evidence |
|---|---|---|
| The client encoder | **It cannot even produce one.** No `system` option on either encoder (`encode.ts:428`, `:579`; options types at `:48-71`, `:88-105`). `ChatMessage.role` is `'user' \| 'assistant'` (`chat-types.ts:91`) and `MessagePart` is a closed six-member union with no instruction variant (`chat-types.ts:59-87`). The literal `'system'` appears once in 694 lines, in the *output* type union at `encode.ts:32`, so a host can hand-append one. | |
| An element prop | **No such prop exists** anywhere in `packages/ui/src`. `MessageRole` at `components/message.tsx:21` includes `'system'` but is render-only and never reaches `encode.ts`. | |
| The app, hand-prepending to the encoder's output | **NOT KNOWABLE** — it happens after the kit returns the array | |
| A scaffolded server route | **NOT KNOWABLE.** Note the scaffolds add nothing today: `ChatRequestBody` is exactly `{ messages, model?, tools? }` (`route-emit.ts:132-136`), and `anthropic.ts:117/131-134` and `vercel-ai-sdk.ts:190-191` *hoist* a client-sent system turn out of `messages` rather than inventing one. But nothing in the contract prevents a route from adding one. | |
| An agent object | **NOT KNOWABLE.** For the six `forwardsFromClient: []` integrations the instruction lives in agent code the browser never sees. | |
| A gateway or proxy upstream | **NOT KNOWABLE** | |

There is no response-side channel either: no system field on `ModelStreamChunk`
(`chunk.ts:43-90`), on `ModelTurn` (`chunk.ts:162-183`), or on any diagnostic event
(`diagnostics.ts:34-106`).

**The ruling: the panel must state this, not omit it.** A prompts section that renders
empty teaches the developer there is no system prompt, which is usually false. The
honest rendering is a named boundary: *"the client sent no system message. Anything the
server or the agent added is not visible from here."* The in-flight `reportRequest` /
`app.request` API is the only path that changes this, and only for an app that
volunteers the information.

*(One documentation defect found here, unrelated to devtools:
`agent-tooling/integrations/vercel-ai-sdk.ts:181-182` asserts "The kit's own encoder
puts the system prompt at `messages[0]`, so that is every single turn of a scaffolded
app, not an edge case." That is false — the encoder has no such path. The hoist is
correct defensive code; the comment misattributes the source. Same claim at `:358`.)*

### Req 9 — Is the context the original context, or was it rewritten?

**It is rewritten, always, and the transformations are substantial.** `toOpenAIMessages`
and `toAnthropicMessages` are not serialisers; they restructure the thread. The full
enumeration, verified against `encode.ts`:

**Structural**

1. **One `ChatMessage` becomes several wire messages.** A turn is SPLIT at each tool
   boundary — `assistant(text + tool_calls) → tool(result) → assistant(answer)` on
   OpenAI (`:377-395`), and `assistant(blocks + tool_use) → user(tool_result) →
   assistant(answer)` on Anthropic (`:546-557`), because Anthropic carries results in a
   *following user message*. So the thread's message count and the request's message
   count are routinely different.
2. **Adjacent user messages are merged** on Anthropic (`pushUser` at `:589-593`).
3. **Runs of adjacent text parts are merged** into one entry on a user turn
   (`flushText` at `:448-452`).

**Omissions — these are the ones that answer the owner's question**

4. **A turn that encodes to nothing is skipped entirely** (`:492`: `if (text === '' &&
   pending.length === 0) return;`). A message present in the thread can be absent from
   the request.
5. **An unsettled tool part is dropped.** `isSettled` requires a `toolCallId` *and* an
   `output` or `errorText` (`:260-263`); a call with no result yet is skipped, as is one
   with no id.
6. **`card` and `source` parts are never encoded** — kit-side, waived at `:427`, `:454`,
   `:599`, `:626`.
7. **A `file` part on an assistant turn is dropped** — neither API accepts document
   content there (`:423-425`, `:626`).
8. **Empty text parts are dropped** on Anthropic (`:602`, `:651`).
9. **Reasoning is omitted by default on OpenAI.** `options.reasoning` defaults to
   `'omit'` (`:432`), documented at `:400-406` as ~25% fewer prompt tokens per round.
   So by default *the model does not get its own prior thinking back*.

**The `raw.source` rule, and the one silent case**

10. **Anthropic throws** rather than encoding a reasoning part with no `raw` (`:631-636`)
    or with a `raw` from a different format (`:637-643`). Loud, correct, and pinned by
    the round-trip tests.
11. **OpenAI, under `{ reasoning: 'include' }`, silently skips a third case.**
    `reasoningDetailOf` (`:358-375`) returns the detail by reference when it is encrypted
    or carries `data`, reassembles it from `part.text` + `part.signature` when signed,
    and returns `undefined` otherwise — `:364`: `if (typeof part.signature !== 'string'
    || part.signature === '') return undefined;`. A deepseek `format: "unknown"` block,
    or a gpt-5.4-mini `reasoning.summary` entry, is dropped with **no signal**. The
    reasoning at `:339-356` is sound and measured; it is nonetheless a silent omission,
    and `lint:silent-drops` cannot see it because `reasoningDetailOf` never discriminates
    a `MessagePart`.

**Rewrites**

12. **Tool arguments are echoed raw, not re-stringified** (`argumentsOf` at `:270-273`) —
    providers validate an echoed block against what they emitted.
13. **`errorText` wins over `output`** when a tool part carries both (`:281-289`).
14. **A text file becomes an XML-ish block**: `<file name="…" type="…">…</file>`, with
    only the closing delimiter escaped (`files.ts:172-177`). The body is deliberately
    otherwise untouched.
15. **A `data:` URI's own media type overrides `attachment.mediaType`** when they
    disagree (`files.ts:215-224`).

| Question | Status | Notes |
|---|---|---|
| What did the encoder produce? | **IN FLIGHT** (`encode.request`) | metadata form: message count, role sequence, part-type counts in vs out. |
| Which parts did it drop, and why? | **IN FLIGHT** (`encode.dropped`) | items 4-9 and 11 above are the list this must cover. Item 11 is the one nobody would think to instrument. |
| Thread message count vs request message count | **IN FLIGHT** | the single most legible line: `7 thread messages → 11 wire messages, 2 parts dropped`. |
| The actual encoded body | **IN FLIGHT**, payload-gated | |

### Req 10 — Framing

Covered in §1. The one ruling: **the panel's top-level object is the trace, not the
stream.** Every question above except the wrong-dialect diagnosis is a trace question,
and the stream view is a drill-down. That is a UI ruling with one contract consequence —
traces need a correlator, which is the in-flight `traceId`.

### Req 11 — Element-layer observability

The devtools spec lists three contract violations and an element registry, none built.
Verified at the choke point:

| Capability | Status | Evidence and cost |
|---|---|---|
| Every element registers through one function | **CONFIRMED** | `defineWebComponent(tag, propDefaults, Facade)` at `elements/define.tsx:262-266`; SSR-guarded at `:272`, idempotent at `:273`. The only `customElements.define` in source is inside that file. Already enforced: `elements/slots.test.ts:527` extracts every call site's tag and `:643-647` fails on a registered tag with no `defineWebComponent` call. |
| A registry of which `kai-*` tags are defined | **MISSING, cheap** | `elements/element-manifest.json` is a tag→module map and already exists. `customElements.get(tag)` over its keys is the whole implementation. The SSR starters already do this by hand for a hard-coded subset (`HydrationBadge.tsx` in the nextjs and tanstack-start starters). **But see the manifest gap below.** |
| **Array/object prop set as an HTML attribute** | **PARTIALLY SHIPPED — for `messages`/`message` only** | `createMessagesGuard` (`validate-messages.ts:44-75`) fires `console.error` when `messages` is not an array — exactly what an attribute assignment produces. Used by `kai-chat` (`chat.tsx:107`), `kai-workspace` (`chat-workspace.tsx:141`), `kai-thread` (`thread.tsx:95`); the singular twin is `elements/message.tsx:201-212`. **No other array or object prop is guarded** — `suggestions`, `models`, `cardSchemas`, `triggers`, `kindIcons`, `cardTypes` all take the string in silence. |
| Detect it generically | **MISSING, and the mechanism is now exactly known** | see below |
| Same array reference during streaming | **MISSING, cheap and worth it** | The no-op is structural: `solid-element` creates one `createSignal` per prop and sets with `set(() => v)`, and Solid's default equality is `===`, so re-assigning the identical reference notifies nothing. Detection is one `prev === next` compare in a wrapped setter — O(1), free. **It must be per-instance**: `component-register` `defineProperty`s the accessor onto the *instance* in `connectedCallback`, shadowing anything `installNonReflectingProps` (`define.tsx:141-155`) put on the prototype. |
| In-place mutation | **MISSING, expensive** | Structurally undetectable at O(1) — no setter runs, so there is no event to hook. The kit already owns a structural fingerprint (`fingerprint()` at `state/parts.ts:8-22`, used per tool-argument write at `consume.ts:104`), but its cost is O(size of the prop) per check, and for `messages` during streaming that is the whole conversation. A `Proxy` is O(1) per trap but changes the identity handed back (`el.messages !== theArrayIAssigned`) and breaks the structured-clone paths in `remote/`. **Recommend against building it.** The reference compare above catches the common case — mutated in place *and* re-assigned — for free. |

**The correction to the devtools spec, and it cuts both ways.**

The spec says `defineWebComponent` "already receives a `propDefaults` object that
declares each prop's expected shape. That is what makes a type mismatch detectable
rather than heuristic."

**`propDefaults` is a plain object of default *values*, and about half are `undefined`.**
From `<kai-chat>` (`elements/chat.tsx:95-101`): `messages: []` declares an array and
`loading: false` a boolean, but `suggestions`, `models`, `triggers`, `cardTypes`,
`cardSchemas`, `context`, `chatTitle` and `accept` all default to `undefined` and
declare **nothing at runtime**. `<kai-cards>` is worse — `elements/cards.tsx:187` is
`{ cards: undefined, types: undefined, schemas: undefined, policy: undefined,
validateCards: true }`, so every prop that matters is shapeless. Everything
`define.tsx` does with `propDefaults` is `Object.keys` (`:282`, `:316`); the type lives
only in the TS `Props` generic, which is erased.

**How `[object Object]` actually gets in, verified:** `define.tsx` implements no
`attributeChangedCallback` at all. The path is `component-register`'s: every prop whose
default is not a string is marked `parse: true`, and `parseAttributeValue` is a
`JSON.parse` in a `try`/`catch` whose `catch` **returns the raw string**
(`component-register/dist/component-register.js:59-66`, called from
`attributeChangedCallback` at `:162` and from initialize at `:38`). So the string is
assigned to the property verbatim and pushed into the Solid signal, with nothing logged,
counted or evented. The failure is silent by construction, not by oversight.

**But the shape map the spec wanted already exists — it is just not shipped to
runtime.** `element-meta.json` carries a per-prop **`scalar`** boolean, generated at
`scripts/gen-element-api.mjs:293` from the TS checker: 550 props across 80 elements,
**94 of them non-scalar**. It is even an exported package entry
(`packages/ui/package.json`, `./element-meta.json`) — and no runtime module imports it;
only two Storybook docs files do. So the options are:

- **Free and exact today** for props with a non-`undefined` default: compare
  `Array.isArray(default)` / `typeof default === 'object'` against the incoming value.
  Covers `messages`, which is already covered by hand.
- **Free and exact for all 94 non-scalar props** if the `scalar` bits are shipped as a
  small runtime map (a tag→prop-name list, not the 400 KB file), or carried on the
  `defaults` literal. **Recommend this** — the derivation exists, `verify:generated-sync`
  already keeps it honest, and it is the difference between guarding 2 props on 3
  elements and guarding every non-scalar prop on all 80.

**A manifest gap found while checking this.** 80 tags register through
`defineWebComponent` and `element-meta.json` has 80 entries, but
`element-manifest.json` has **79** — `kai-remote` is absent. The manifest is what the
autoloader reads (`elements/autoloader.ts:19-21`, used at `:37`), so `kai-remote` is
the one element that cannot be lazy-loaded, and a registry panel built over the manifest
would under-report by one. Worth filing separately; it is a one-line data fix and the
interesting question is why `verify:generated` did not catch a divergence between two
generated files.

---

## 3. The boundary

**The kit sees one thing: the bytes that came back, and the object it built to send.**
Everything else in a chat application is somewhere the kit is not.

The line is `fetch`. The app calls it; the kit is handed a `Response`
(`CLAUDE.md`: "the kit PARSES, the consumer FETCHES", enforced by there being no client
and no key handling below `wire/`). So:

**Before the handoff, invisible:** what the app put in the request body beside
`messages` — the model id, temperature, tools, any system message it prepended; the URL,
headers and credentials; any client middleware.

**On the server, invisible:** anything a route adds between `readChatRequest` and the
upstream call; instructions and tools baked into an agent (six of eleven integrations);
gateway or proxy rewrites; retries; a fallback model; RAG retrieval; anything a
sub-agent did.

**After parsing, invisible:** what the app does with `ModelTurn` — whether it persisted
it, whether it re-rendered.

**One realm at a time.** The emitter is keyed by `Symbol.for` in the per-realm registry
(`diagnostics.ts:140`, explained at `:137-138`): a stream read inside a Worker, an iframe
or an SSR isolate has its own emitter, and a panel in the parent document does not see
it.

**How the UI must communicate this.** Three rules, and they are contract, not polish.

1. **Absent renders as absent.** Never a zero, never a dash that reads like a zero,
   never a sum that quietly excludes the unreported. This is already ruled for
   `model` in spec 1 and it generalises: `usage`, `costUsd`, `frames`, `reasoningTokens`
   and every field a proxy can strip take the same treatment.
2. **The boundary is a rendered object, not an omission.** A "server side" band in the
   trace view, drawn and explicitly empty, with one line saying what it would take to
   fill it (the app calling `reportRequest`). A panel that simply has no prompts section
   is indistinguishable from a panel reporting that there is no prompt.
3. **Label the timeline honestly.** `wire.open.t` is *response received by the kit*. If
   a panel draws a bar from there and calls it request latency, it is inventing the
   number the app never gave it.

---

## 4. Data exposure

The rule is spec 1's and it stands, verbatim: **if a value comes from the model, the end
user, or the app's data, it is payload; if it describes the shape, size, timing or
identity of that value, it is metadata.** Every field shipped today is metadata by that
rule, and the boundary is *tested* — `diagnostic-events.test.ts` asserts the message text
never appears in `JSON.stringify(events)`.

**Metadata, and therefore default:** counts, byte and character lengths, timings, variant
names, format ids, status codes, error codes, the served model id, usage numbers. Plus
three the encode work should add, all identity or shape: **an attachment's media type and
byte size**, **a tool's name** (it is identity; today `wire.part` variant `'tool'` carries
only an index — `consume.ts:320-324` — so a panel can see that a tool part was written
and not which tool), and **a message/part count delta** across encoding.

**Payload, and therefore behind the switch:** text and reasoning deltas, tool `input` and
`output`, card envelopes, source URLs and titles, **attachment filenames**, the encoded
request body, `WireError.bodyText`, and a provider's error `message` — that last one
because providers echo request content back inside it, which is precisely why
`wire.failed` carries `providerCode` and not the message (`read.ts:164-168`).

**Why the payload signal is separate from activation, and must stay separate.** The
devtools spec is direct about the consequence of its own delivery decision: a tag pasted
into a live Shopify theme is permanently installed and `?kai-devtools=1` is guessable, so
**anyone who knows the URL can open the panel over a real customer's session**. That is
accepted — it is the app's call whether to leave the tag on production.

What makes it *acceptable* is that the two switches are different switches. Activation
buys the shape of a conversation; payload buys its content. If one signal bought both,
the guessable query parameter would be a content-disclosure vector, and the honest
response would be to remove the query parameter — which would remove the ergonomics the
whole delivery decision was made for. **The separation is what lets activation stay
cheap.**

Three properties follow, and each is checkable rather than promised:

- **One key.** Payload fields live under a single optional `payload` object on the event,
  never scattered among the metadata, so a reviewer checks one key instead of re-reading
  every field name.
- **The default is diagnostic on its own.** The wrong-dialect case, the buffering
  signature, the empty-turn case and the contract violations are all diagnosable without
  rendering one token. That is what makes the default defensible rather than merely
  cautious.
- **Nothing is transmitted.** No endpoint, no telemetry. This is a panel, not a service.

One addition this document makes: **the payload signal should not be a query
parameter.** Activation is shareable by design; content capture should require
`localStorage` or the app's own `window.__KAI_DEVTOOLS__`-style global, so that turning
it on is an act performed on the machine, not a link someone can send. Recorded as open
question OQ-3.

---

## 5. What the tree contradicts

Four items where the code disagrees with a written claim, or with itself.

**A. The endpoint identity is one property access away and is treated as unknowable.**
`readModelStream` receives a `Response`. `Response.url` (the final URL after redirects)
and `Response.headers.get('content-type')` are both on that object. Neither is read
(`read.ts:125-133` duck-types on `ok`/`status`/`body` only), so `wire.open` carries the
requested *format* and nothing about the actual endpoint. Meanwhile the `empty-stream`
message instructs the developer to "check the endpoint really sent Content-Type:
text/event-stream" (`consume.ts:503-506`). **The kit is telling a human to go and check a
header it is holding.** Adding `url` and `contentType` to `wire.open` — both identity by
the metadata rule, both absent for the `stream`/`iterable` sources — is the cheapest
row in this document and it answers the owner's first question.

**B. The devtools spec's `propDefaults` claim is half true — and the half it needs
already exists elsewhere.** See req 11. Runtime detection is exact for props with a
non-`undefined` default and impossible for the rest, but `element-meta.json` already
carries a `scalar` bit for all 550 props and no runtime module reads it.

**C. "The kit's own closed vocabulary" is neither closed nor exclusively the kit's.**
See req 3. Two literals, no enumeration, and the same `errorCode` field carries provider
codes verbatim, so a panel cannot separate them without hardcoding the two kit values.

**D. `element-manifest.json` has 79 tags where 80 elements register** — `kai-remote` is
missing, so it cannot be lazy-loaded and any registry view built over the manifest
under-reports. Two generated artifacts disagree and no gate noticed.

**E. `vercel-ai-sdk.ts:181-182` and `:358` state the encoder emits a system message at
`messages[0]` on every scaffolded turn.** It cannot; there is no such path. A separate
one-line docs fix.

Nothing here contradicts the in-flight work. Three of the in-flight items — encode
instrumentation, `traceId`, and connection identity on `wire.open` — are the top three
gaps this inventory found independently, which is a good sign about the direction. The
inventory's contribution is what is *not* in flight: the `kit.warn` surface, the element
registry, usage-field honesty, and the attachment-preview defect.

---

## 6. Slice plan

Ordered so each slice is independently useful and so the cheap answers to the loudest
questions land first. Opinionated.

**Slice 1 — Connection identity, and the two silent holes beside it.** `url` and
`contentType` on `wire.open`, absent for non-`Response` sources; a `wire.failed`-shaped
event for the 200-with-no-body path (`read.ts:172-176`, which emits nothing today); and
a malformed-frame count so a frame that fails `JSON.parse` (`sse.ts:145-152`) stops
being indistinguishable from a keep-alive. *Why first:* it is the owner's question 1,
the first part is two property reads, none of it needs a new consumer contract beyond
extra fields, and all three close loops on failures that currently send a human to look
something up by hand. Ships without the panel.

**Slice 2 — The turn summary is complete.** `model` on `wire.close`; the seventh
`ModelUsage` field for Anthropic cache creation; `model` on `ModelTurn` while the value
is in hand. *Why second:* it removes the fold-frames-to-find-the-model workaround before
any consumer writes one, and it is the last chance to add fields to `wire.close` before
a CDN panel is pinned to its shape.

**Slice 3 — Traces.** `traceId` / `label` correlation. *Why third and not first:* it is
the structural prerequisite for most of §1, but it is worth landing after the stream-level
fields are settled, because a trace whose streams are individually incomplete is a
prettier version of the same gap. Everything after this slice depends on it.

**Slice 4 — The encode path.** `encode.request` and `encode.dropped`, metadata form:
thread message count → wire message count, part-type counts in vs out, and a dropped
list covering all ten omissions in req 9 — including the OpenAI reasoning case at
`encode.ts:364` that nobody would instrument from the outside. *Why here:* it is the
largest single answer (requirements 2, 8-by-negation and 9 at once) and it is the first
slice that needs traces to be legible.

**Slice 5 — `kit.warn`, and codes for the classes that have none.** One event type
carrying `{ code, site, count }` over the existing console surface: card validation
(`card-renderer.tsx:142`, `elements/cards.tsx:150-165`), the messages guard
(`validate-messages.ts:48/70`), unrouted cards (`card-routing.ts:77`), duplicate ids
across confirm/tasks/choice, the autoloader's failed import (`autoloader.ts:56`), and
**the blocked-unsafe-URL event at `artifact.tsx:136`** — a security fact currently
visible only to whoever had the console open. Alongside it: export the kit's error-code
union, separate kit codes from provider codes on `wire.close`, and give the three tool
errors codes (`consume.ts:189/201/227`).

Note one thing to preserve rather than re-derive: card validation already produces
**structured** issues — `{ path, keyword, message }` plus a hard/soft `tier`
(`primitives/card-validate.ts:33-40`) — and the structure is flattened to a string at
the emit seam (`cardValidationMessage`, `card-validate-cards.ts:250-252`). The event
should carry the structure, not re-flatten it. *Why here:* highest ratio of value to new
design in the document — it converts an already-decided-loudly surface into something a
panel can show, at the cost of one emission call per site.

**Slice 6 — The element registry.** `customElements.get()` over
`element-manifest.json`. *Why late:* it is genuinely cheap but it answers a narrower
question (hydration) than slices 1-5, and the SSR starters cover the acute case today.

**Slice 7 — Contract violations.** The attribute-misuse check for props with a derivable
shape, plus the same-array-reference check. Requires the build-time shape map from
`gen-element-api.mjs` for full coverage. *Why last of the build items:* it is the only
slice needing a new derived artifact, and its value depends on a panel already existing
to show it in.

**Slice 8 — Payload capture.** Its own signal, one `payload` key, `localStorage`/global
only. *Why last:* every slice above is metadata, and the point of the ordering is to
prove the default stream does the job before adding the thing that makes the panel
sensitive.

**Not scheduled here, but file it now:** the attachment preview defect (req 4). It is a
library bug with a user-visible failure — a previewed SVG that throws on send — and it
should not wait on a devtools slice.

---

## 7. Open questions

Short, because most of the above is verification rather than choice. Four things
genuinely fork the work.

**OQ-1. Is a trace a kit concept or a panel concept?** A `traceId` on the events makes
the kit responsible for a notion of "one user turn", which is a thing the kit does not
otherwise model — the app owns the loop. The alternative is that the panel infers traces
by proximity (streams within N ms with no user input between).
**Recommendation: kit concept, app-supplied, optional.** `ConsumeOptions.traceId`, defaulted
to a fresh id per read, so an app that runs a tool loop passes the same value across
rounds and one that does nothing gets today's behaviour exactly. Inference by proximity
is a heuristic that will be wrong on a slow tool, and a wrong trace boundary is worse
than no trace because it makes a correct stream look like it belongs to another turn.

**OQ-2. Does the non-scalar prop map get shipped to runtime?** Full contract-violation
coverage needs the per-prop `scalar` bit at runtime. It is already generated
(`gen-element-api.mjs:293`) and already sync-enforced (`verify-generated-sync.mjs`), but
it lives in a 400 KB file no runtime module imports. Shipping a compact tag→non-scalar-
prop-names map is a new emitted artifact and a new coupling.
**Recommendation: yes, and it is cheaper than it looked.** This is derivation, not a new
declaration — the repo's own rule points at it, and it is the difference between guarding
2 props on 3 elements and guarding all 94 non-scalar props on all 80. If the answer is no,
scope the check explicitly to props with a non-`undefined` default and have the panel say
which props it is *not* watching, rather than implying it watched them all.

**OQ-3. Can payload capture be turned on by URL?** Activation can, deliberately.
**Recommendation: no.** `localStorage` or the app's own global only. A query parameter is
shareable by design, and content capture that a link can enable turns the guessable
activation parameter into a disclosure vector — which would force removing the parameter,
which would remove the ergonomics the delivery decision was made for.

**OQ-4. Is the attachment preview gap fixed by narrowing the renderer or by widening the
composer's default?** Two coherent answers. Narrow: `AttachmentPreview` reads
`resolveMediaPolicy()`, the `video` branch goes, unencodable attachments are marked in the
chip. Widen: `<kai-chat>` defaults `accept` to the encodable set, so nothing unsendable is
ever staged.
**Recommendation: narrow the renderer, and do NOT change the composer default.** The
default `accept: undefined` is a deliberate scope decision — what a user may attach is an
application-layer call, and the kit narrowing it would be deciding something that lands in
a policy document. Making the *preview* honest is the kit deciding HOW its own rendering
works, which is squarely the kit's. The two fixes look interchangeable and only one of them
respects the boundary.

---

## 8. Claims and how to check them

| Claim | Check |
|---|---|
| Five wire events ship, metadata-only | `packages/ui/src/wire/diagnostics.ts:101-106`; the `SECRET` assertion in `src/wire/diagnostic-events.test.ts` |
| Emission is a guarded no-op with no subscriber | `wireDiagnosticsActive()` at `diagnostics.ts:190-193`, and every call site gating before constructing an event (`read.ts:153/190/224`, `consume.ts:284/526`) |
| The emitter is a per-realm `globalThis` singleton | `STATE_KEY` at `diagnostics.ts:140`; `pnpm --filter @kitn.ai/ui run verify:diagnostics-wiring` (needs a build) |
| The hook installs automatically for element consumers | `src/diagnostics/index.ts:9-23`; `src/diagnostics/register-install.test.ts` |
| The endpoint URL and content type are never read | `git grep -n "content-type\|\.url" packages/ui/src/wire/read.ts packages/ui/src/wire/sse.ts` returns nothing; `isResponse` at `read.ts:125-133` |
| `ModelTurn` has no model; `consume.ts` never reads `chunk.model` | `chunk.ts:162-183`; `git grep -n "chunk.model" packages/ui/src/wire/consume.ts` returns nothing |
| The served model is on `wire.frame` only | `read.ts:226-240`; `WireCloseEvent` at `diagnostics.ts:72-87` |
| `costUsd` comes from a top-level `cost`, and Anthropic never sets it | `formats/openai.ts:49-50`; `formats/anthropic.ts:45-55` |
| Anthropic cache *creation* tokens are never read | `git grep -n "cache_creation" packages/ui/src` returns nothing |
| The encoder cannot emit a system message | `git grep -n "system" packages/ui/src/wire/encode.ts` → one hit, the output type union at `:32`; `ChatMessage.role` at `chat-types.ts:91` |
| Scaffolded routes add no system prompt | `git grep -n "role: 'system'" packages/ui/src/agent-tooling` finds only *hoists*; `ChatRequestBody` at `route-emit.ts:132-136` |
| Six integrations own their model/tools server-side | `git grep -n "forwardsFromClient: \[\]" packages/ui/src/agent-tooling/integrations` |
| The scaffold ignores `kai-model-change` | `git grep -c "kai-model-change" packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` → 0; the model const at `scaffold.ts:1899` |
| A turn can encode to nothing and be skipped | `encode.ts:492` |
| An unsettled tool part is dropped | `isSettled` at `encode.ts:260-263` |
| Anthropic reasoning throws without `raw`; OpenAI silently skips a third case | `encode.ts:631-643` vs `encode.ts:364` |
| The renderer has a second media-type list | `getMediaCategory` at `components/attachments.tsx:34-47`, beside the declaration's own rule at `wire/media-types.ts:63-66` |
| The thread previews only image and video | `components/attachments.tsx:187-215`; the `inline` variant is hardcoded at `components/message.tsx:479` |
| The composer stages everything by default | `elements/chat.tsx:101` (`accept: undefined`); `elements/default-input.tsx:158-160`, `:179` |
| SVG/BMP are excluded from `ENCODABLE` on purpose | `wire/media-types.ts:76-77`, `:92-103` |
| The preview switch has no tests | `git grep -l "AttachmentPreview\|getMediaCategory" -- "packages/ui/**/*.test.*"` returns nothing |
| The kit's error codes are two inline literals, never enumerated | `git grep "code: '" -- packages/ui/src/wire/` → `consume.ts:501`, `:509`; the open type at `chunk.ts:89` and `diagnostics.ts:84` |
| `errorCode` also carries provider codes | `formats/openai.ts:175-183`, `formats/anthropic.ts:220-232`, both flowing through `consume.ts:542` |
| A 200 with no body emits no diagnostic | `read.ts:172-176` — a plain `Error`, thrown before the `wire.open` at `:190` |
| A frame that fails `JSON.parse` is skipped without `onRawFrame` | `sse.ts:145-152`, documented at `:130-132` |
| Tool errors are free text with no code | `consume.ts:189`, `:201`, `:227-229` |
| Card errors go to the card host, not the stream; the only emit sites are five | `components/card-renderer.tsx:142`, `:164-170`; `git grep -n emitWireDiagnostic -- packages/ui/src` → `consume.ts:292/531`, `read.ts:154/191/231` |
| Card validation issues are structured, then flattened at the seam | `primitives/card-validate.ts:33-40` vs `card-validate-cards.ts:250-252` |
| `messages` misuse is caught for three elements only | `validate-messages.ts:44-75`; `git grep -n "createMessagesGuard" packages/ui/src/elements`; the singular twin at `elements/message.tsx:201-212` |
| `propDefaults` is values, and many are `undefined` | `defineWebComponent` signature at `elements/define.tsx:262-266`; the literals at `elements/chat.tsx:95-101` and `elements/cards.tsx:187` |
| `[object Object]` reaches the property verbatim | `define.tsx` has no `attributeChangedCallback`; `node_modules/component-register/dist/component-register.js:59-66` — `parseAttributeValue` is a `JSON.parse` whose `catch` returns the raw string — assigned at `:162`, and at initialize via `:38` |
| A per-prop `scalar` bit already exists and no runtime module reads it | `scripts/gen-element-api.mjs:293`; `git grep -l element-meta.json -- packages/ui/src` → only the two `stories/docs/` files |
| Every element registers through one function, and it is enforced | `git grep -l defineWebComponent -- packages/ui/src`; `elements/slots.test.ts:527`, `:643-647` |
| A tag→module map already exists, and is one short | `packages/ui/src/elements/element-manifest.json` (79 tags) vs `element-meta.json` (80 entries); `kai-remote` is the missing one |
| `lint:silent-drops` cannot see the render layer | `WIRE_DIR` at `packages/ui/scripts/lint-silent-drops.mjs:83` |
| `vercel-ai-sdk.ts` misstates the encoder | `packages/ui/src/agent-tooling/integrations/vercel-ai-sdk.ts:181-182` and `:358` |
