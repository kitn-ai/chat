# Findings — rung-4 front-door build (AI page builder, "Pagesmith")

Comparer analysis of the clean-room builder's app against the kit, the MCP transcript (every
per-call claim below cites a transcript line), and the spec's pre-named expected findings
(`docs/superpowers/specs/2026-08-20-rung-4-builder-design.md` § Expected finding classes).
Companions: `builder-run.md` (run metadata, the MCP call table, the package-read audit, the
independent build/run), `NOTES.md` (the builder's 15 questions, verbatim), `app/` (the delivered
source).

Classes: **teaching gap** (the front door failed to teach a fact the kit knows) · **product
gap** (the kit lacks the thing itself) · **doc gap** (fact stated nowhere shipped — checked
against the stripped README/`llms*` before filing) · **builder error** · **acceptable
variation** · **strip artifact**. Severity S1–S4 as in rungs 1–3.

**Strip discipline.** Every candidate below was checked against the real (unstripped)
`package/llms-full.txt` and `package/README.md` read straight out of the tarball before being
filed. **Zero findings are strip artifacts.** The tarball's 880 files against rung-3's 873 is
the tree moving between rungs, not a strip difference, and is not filed.

## Headline verdicts

- **The builder found the bridge, and the front door is not where it found it.** The assistant
  reply carries the page as a **`kai_artifact` tool call**, which the host turns back into a
  `CardEnvelope` with `cardFromToolCall` and lifts the HTML out of. That mechanism IS taught —
  by `component_reference kai-chat` (line 21/22) and `kai-artifact` (30/32). **Everything on
  either side of it is not**: `onToolCallReady` (where the call comes from), `stream.addCard`
  (how the envelope reaches the thread), and the whole custom-card contract
  (`emitCardEvent` / `listenForCardEvents`, and what the kit assigns to your tag) score **zero
  across all ten MCP responses and zero in the shipped `llms-full.txt`**.
- **10 MCP calls, 37 direct package inspections** — including a cluster of **nine consecutive
  reads of MINIFIED BUNDLE BYTES** (`dist/elements/cards.js`, sliced by offset) to recover the
  custom-card property contract. That inversion is the rung's measurement.
- **Build/run: green, zero comparer fixes**, verified independently on a fresh keyless mirror
  under Vite 8 / TypeScript 7.
- **A `GET /api/chat` kills the dev server.** Rung-3's route-guard residual is not merely
  unfixed; it has a demonstrated blast radius, and it is now in two apps because both copied the
  same scaffold block.
- **F-16 is not fixed, it is relocated.** `useCase: "artifact-split"` emits the identical
  `src="https://example.com"` placeholder the `workspace` preset used to. And the preset is
  invisible: the scaffold tool's `useCase` description hand-types seven ids and omits it.
- **The one recipe that names the flow documents everything except the flow.**

## The spec's pre-named expected findings — scorecard

### 1. The `artifact-split` placeholder / missing message→artifact bridge — SPLIT VERDICT

The spec predicted the front-door agent would "hit this wall first". **It did not hit that wall
at all, because it could not see the door.**

- `artifact-split` appears **zero times in the entire 2.79 MB transcript**. The builder never
  passed a `useCase`; it passed `components: ["kai-chat","kai-artifact","kai-resizable",
  "kai-segmented","kai-checkpoint"]` (line 39/41).
- **Why**: the scaffold tool's `useCase` field description — read at the wire level from a live
  `tools/list` against the installed `bin/mcp.js` — enumerates seven preset ids
  (`drop-in-chat`, `support-widget`, `knowledge-base`, `agentic`, `workspace`, `voice`,
  `attachments`) and **omits `artifact-split`**, while `agent-tooling/archetypes.ts` defines
  **eight**. The derived list exists — but only on the *reject* path
  (`rejectUseCase`, `scaffold.ts:6572`), which prints all eight. The archetype the spec named as
  this rung's first obstacle is reachable only by first guessing a wrong name. Filed as **F-07**.
- **The placeholder itself: still there, on both axes.** I called the installed MCP directly with
  `{ useCase: "artifact-split", integration: "mock", placement: "side", framework: "react" }`.
  It emits, verbatim:

  ```jsx
  {/* Replace src + files with your real artifact data (files is required: …) */}
  <Artifact src="https://example.com" files={[{ path: 'index.html', url: 'https://example.com' }]} … />
  ```

  Not one line connects it to `messages`. Rung-3's F-16 verdict stands unchanged; the re-cast
  moved the `kai-artifact`+`kai-resizable` pair off `workspace` into its own preset **and moved
  the defect with it**. Filed as **F-08**.
- **Confirmed on the components axis too**, which is what the builder actually used — plus two
  *worse* placeholders (`<Segmented />` and `<Checkpoint />`, no props at all, emitted as bare
  siblings after the `Resizable`). Filed as **F-09**. The builder discarded the entire emitted
  front-end block and kept only block (2).
- **Verdict: CONFIRMED as a product gap, REFUTED as the predicted stumble.** The wall the
  builder hit first was not the placeholder — it was that nothing in the front door names the
  *streaming* end of the bridge (F-01).

### 2. The blob-URL + `displayUrl` recipe — PARTIALLY TEACHABLE

`displayUrl` **is** documented, 5 mentions in the `kai-artifact` reference (30/32), and its
description names the exact case: *"Use when the framed url is not consumer-facing (e.g. a
`data:` blob) so a clean address shows instead of leaking it."*

What is **not** stated anywhere: that a `data:` URL is a legitimate `<kai-artifact>.src` at all.
The builder assembled that from two *indirect* signals (NOTES §4) — the artifact card schema's
`displayUrl` prose, and `isScriptUrl`'s doc calling a `data:` blob artifact "a documented
`<kai-artifact>` use" — then verified it in a real browser (page renders, its `<script>` runs,
frame in an opaque origin under the kit's default `allow-scripts allow-forms`).

**Verdict: the half that exists is good; the blessing is missing.** Filed as **F-13**, doc gap,
S3. Re-cast input: state the supported `src` schemes on the element reference, next to
`displayUrl`, and say which sandbox each gets.

### 3. The card-opens-panel flow (`artifact-from-message`) — NOT TEACHABLE THROUGH THE FRONT DOOR

`component_reference recipes` (49/50) returns a **2-recipe catalog**. The relevant one,
`workspace-chat`, describes itself as:

> Full-screen chat with a conversations sidebar; **assistant replies can open artifacts in a
> resizable side panel.**

Its wiring list then contains four edges — `kai-conversation-select` → `messages`,
`kai-new-chat` → `messages`, `kai-submit` → `messages`, and `kai-maximize-change` →
`maximizedIndex` — **and no message→artifact edge whatsoever**. The one document in the front
door that promises the flow in its own one-line summary is the one that omits it from its wiring
table.

`patterns/artifact-from-message.mdx` exists — on the **docs site only** (`apps/docs/`). It is
not in the tarball, so it is out of reach for a bundler-installed consumer, and it was out of
scope by the run's own no-remote-docs rule. **Not a strip artifact** (the strip removed
`README`/`llms*`; this file was never shipped in the package to begin with).

**Verdict: CONFIRMED, S2.** Filed as **F-14**.

### 4. `kai-artifact` under a real consumer layout — CONFIRMED, one concrete constraint

- **Device-width container:** `<kai-artifact>` exposes **no `::part` for its iframe** (verified:
  no `part` attribute on the iframe in `components/artifact*.tsx`; the only `part="card"` is the
  outer chrome). A host therefore cannot size the previewed page independently of the artifact's
  own toolbar. Constraining the element's container is the only lever, so at Tablet/Mobile the
  **toolbar narrows with the page**. The builder kept it (it reads as a device mock) and named
  it a workaround (NOTES §8). Filed as **F-11**, product gap, S3.
- **Maximize:** worked, and both documented paths are real. The recipe's zero-code path (an
  artifact inside a `kai-resizable-item` drives the panel through the bubbling
  `kai-maximize-intent`) did not apply here because the panel chrome is the app's, not the
  artifact's, so the app drove `kai-resizable.maximizedIndex` directly and mirrored
  `kai-maximize-change` back into state. Verified by the builder at 885 px → 1440 px → back
  (transcript 487). **No gap.** One small builder miss: NOTES §10 calls `maximizedIndex={null}`
  a guess, but the `kai-resizable` reference states *"null = none"* verbatim (result line 42,
  L22). Filed as **F-16**, builder error, S4, harmless.
- **Preview/Code:** the builder drove the artifact's own toggle as a controlled `tab` and fed
  `kai-tab-change` back, rather than building a second toggle. The docs describe controlled `tab`
  and the built-in toggle separately and never say the two combine (NOTES §9). It works; worth a
  sentence in the reference. Rolled into **F-13**'s re-cast note.

## Full findings

### F-01 — the streaming half of the bridge is unnamed in the entire front door · teaching gap · S1

`onToolCallReady`, `ModelToolCall` and `stream.addCard`: **0 occurrences across all ten MCP
responses, 0 in the shipped `llms-full.txt`.** `component_reference` teaches
`cardFromToolCall(name, input, { id: call.id })` beautifully — "turns the call into a renderable
envelope … It never throws" — while never saying **where `call` comes from** on the streaming
path, or **how the resulting envelope gets into the thread**.

Both facts exist and are public. The builder recovered them by reading
`dist/wire/read.d.ts` + `dist/wire/index.d.ts` (transcript 62) and `dist/state/index.d.ts`
(54/56). The shape it landed on (`App.tsx:181-184`, `153-157`) is exactly right:

```ts
const turn = await readOpenAIStream(res, sink, {
  traceId: …,
  onToolCallReady: (call) => takeToolCall(call, addCard, value, basePrompts),
});
```

**Re-cast input:** `component_reference kai-chat`'s card-loop paragraph is three lines short of
complete. Add the reader option that delivers the call and the stream method that adds the card,
in the same paragraph that already names `cardFromToolCall`.

### F-02 — the custom-card contract is nowhere in the front door · teaching gap · S1

`emitCardEvent`, `listenForCardEvents`, `routeCardEvent`, `CARD_EVENT_NAME`: **0 across all ten
MCP responses, 0 in `llms-full.txt`** — yet all four are public exports of the package **root**.
And `cardTypes` tells you to name a tag while nothing tells you what the kit assigns to it.

The cost, in transcript lines: **nine consecutive tool calls (115, 119, 122, 126, 132, 137, 141,
145, 152) reading minified bundle bytes** — `grep -o '.\{400\}"kai-card".\{400\}' dist/kai.es.js`,
then `s.slice(1500,2766)` out of `dist/elements/cards.js` — to recover that the kit assigns
`data`, `cardId`, `heading` and `resolution` as **properties**, plus a `theme` attribute and
`data-card-id`. Then two more (391, 395) to find the emit/route helpers in
`dist/primitives/card-routing.d.ts`.

Independently verified against the kit: `primitives/card-routing.ts:8` defines
`CARD_EVENT_NAME = 'kai-card'` and line 15 dispatches it `{ bubbles: true, composed: true }` —
the builder's reasoning (`page-version-card.ts:5-20`) is correct.

**This is the sharpest measurement of the rung.** A consumer authoring a generative-UI card —
the whole point of `cardTypes` — is handed a mapping and no contract, and the only complete
statement of that contract in the delivered package is compiled JavaScript.

**Re-cast input:** a `component_reference` topic for the custom-card contract (assigned
properties, the `kai-card` protocol event, `emitCardEvent`/`listenForCardEvents`), or the same
block appended to `kai-cards`.

### F-03 — cards live in `<kai-chat>`; `policy` lives on `<kai-cards>` · product gap · S2

`CardPolicy` is the documented way to handle card events. Verified against
`elements/element-types.d.ts`: **only `KaiCardsElement` and `KaiRemoteElement` carry `policy`.**
`<kai-chat>` — where in-thread cards actually render — does not, and neither does the React
`ChatProps` (the builder confirmed this at transcript 97/101).

The builder's workaround (`App.tsx:43-61`, `226`): wrap the chat in a plain `<div>` and attach
`listenForCardEvents(wrapper, { onAction })`, which works only because `kai-card` is deliberately
`bubbles + composed` and escapes the chat's shadow root. It asked outright whether that is the
intended pattern (NOTES §3) and got nothing.

**Re-cast input:** either put `policy` on `kai-chat`, or state on `kai-chat` that the host routes
in-thread card events with `listenForCardEvents` on an ancestor. One of the two — the current
state teaches a policy handle that is absent from the element the docs point cards at.

### F-04 — `CustomCardSpec.schema`'s doc invites what its type rejects · product gap · S2 · REPRODUCED

`CustomCardSpec.schema`'s own JSDoc (`schemas/registry.ts:90-105`) says:

> *"Authored form is fine, with the descriptions left in: the projection strips what a provider
> cannot take, and the validator ignores keywords it does not implement."*

But `CardSchema = JsonSchema & Readonly<Record<string, unknown>>` (`schemas/index.ts:117`)
relaxes the **top level only**; `JsonSchema.properties` is `Record<string, JsonSchema>`
(`primitives/card-validate.ts:11`), and `JsonSchema` admits extras only under `x-*`. A nested
`description` — which every one of the kit's own seven built-in schemas carries — is an
excess-property error.

**Reproduced with a fresh `tsc --strict` probe against the installed package (not inferred):**

```
probe/schema-probe.ts(10,40): error TS2353: Object literal may only specify known properties,
and 'description' does not exist in type 'JsonSchema'.
```

**Positive control:** the identical schema with the nested `description` removed compiles, exit 0.
So the error is the `description`, not the probe.

The builder ate it with a single `as CardSchema` and wrote the reason beside it
(`cards.ts:21-46`). **Re-cast input:** widen the nested value type to the same
`JsonSchema & Record<string, unknown>` the top level gets, or stop promising authored form.

### F-05 — `createMockResponder()` cannot carry a generated page · product gap · S2

The prompt's nudge was "the package ships facilities for mocking — discover them, **including
how an assistant reply can carry a generated page**". The mocking facility is
`createMockResponder()`, and it emits **content deltas only**: options are `replies`, `delayMs`,
`chunkSize`, `announce`. There is no tool-call hook, so nothing it produces can ever become a
card — which is to say, the kit's mock cannot exercise the kit's own card path.

The builder's answer (`server/mock-stream.ts`, 143 lines): keep the responder for the **text**
half, hand-frame the `kai_artifact` **tool-call** half, stamp every hand-built frame with the
kit's own exported markers (`MOCK_MARKER`, `MOCK_MARKER_KEY`, `MOCK_MODEL_ID`) so a mock frame
still cannot be mistaken for a real turn, and drop + re-issue the responder's terminal frames so
the turn ends `finish_reason: "tool_calls"`. The frame envelope was **reverse-engineered from
what the responder emits** (transcript 156 reads `dist/state.js` around `kai-mock`), not from any
documentation — and the builder said so: *"If a future version changes that shape, this file is
what breaks."*

`MOCK_MARKER` / `MOCK_BANNER` / `MOCK_MODEL_ID` score **0 across all MCP output**, so even the
markers it did the right thing with were found by reading the bundle.

**Re-cast input:** a `toolCalls` option on `createMockResponder` (the builder named exactly this:
*"A `mockResponder({ toolCalls })` option would remove all of this"*). Highest-leverage single
item on this list — it is the difference between the card path being mockable and not.

### F-06 — `debug` answered nothing, second rung running · teaching gap · S2

Symptom asked (transcript 60): *"…how do I make the mocked assistant reply emit a `kai_artifact`
tool call so a card renders in the thread?"* — a precise, in-domain question about two of the
kit's own facilities.

Answer, in full (442 ch): **"No known failure pattern matched."** plus three fallbacks: use
`component_reference`; check the **Streaming recipe** in `llms-full.txt`; paste
`https://ui.kitn.ai/llms.txt`.

Two of the three were dead on arrival — `llms-full.txt` was stripped, the URL was forbidden by
the run's rules. And the third would not have helped either: **I read the real `llms-full.txt`
out of the tarball.** Its "Streaming recipe (critical)" section is about the reactivity two-halves
rule and folding text deltas onto a trailing text part. It contains no `tool_calls`, no
`onToolCallReady`, no `createMockResponder`. **So this is not a strip artifact — the pointer was
to the wrong document.**

Rung 3's `debug` call returned the same "No known failure pattern matched" to the same class of
question. **Two rungs, two hard questions, zero answers.**

### F-07 — the scaffold tool hand-types its own preset list, and it is now wrong · product gap · S2

Read from a live `tools/list` against the installed `bin/mcp.js`, i.e. exactly what an MCP client
receives:

> `"Archetype PRESET id, e.g. "drop-in-chat", "support-widget", "knowledge-base", "agentic",
> "workspace", "voice", "attachments"."`

Seven. `archetypes.ts` has **eight** — `artifact-split` was added by the 2026-08-20 re-cast and
the description was not. Four more comment sites in `scaffold.ts` (735, 5397, 6574, 6600) still
say "seven presets". The `rejectUseCase` path *derives* the list correctly and prints all eight,
so the only way to discover the preset through the front door is to guess a wrong id first.

This is a textbook CLAUDE.md **"derive it, don't type it"** violation, and it cost this rung its
predicted measurement. **Second instance of the class named, per the repo's own rule:** the
`FRAMEWORKS` list in `scripts/verify-scaffold-compiles.mjs` is likewise hand-written in the gate
that derives every other axis from the registry (CLAUDE.md already records it). The rule holds.

**Re-cast input:** build that description from `ARCHETYPES` at module init. It is one `.map()`.

### F-08 — F-16 relocated, not fixed: the unwired artifact placeholder survives · product gap · S2

Called directly against the installed MCP:

| Call | Emitted artifact |
|---|---|
| `useCase: "artifact-split"` | `<Artifact src="https://example.com" files={[{ path: 'index.html', url: 'https://example.com' }]} …/>` |
| `components: [… kai-artifact, kai-resizable …]` (what the builder ran) | identical |

Nothing wires it to `messages`, in either. The archetype comment in `archetypes.ts:44-58`
correctly narrates the re-cast — the `workspace` preset became a real BLOCK, and the artifact
pair "did not vanish — it moved to `artifact-split` below, so its renderer branch keeps its cells
in `verify:scaffold`". **The cells kept compiling; the placeholder kept being a placeholder.**
Compiling is exactly what an unwired `src="https://example.com"` does best.

**Re-cast input:** this is the rung's clearest single build item. The `artifact-split` renderer
should emit the seam — `onToolCallReady` → `isCardTool` → `cardFromToolCall` → app state →
`<Artifact src=… files=…>` — because the seam is what the surface IS. See the artifact-seam
inventory below for the shape it would emit.

### F-09 — the components axis emits bare, propless elements as siblings · product gap · S3

The emitted front end put `<Segmented />` and `<Checkpoint />` **outside** the `Resizable`,
after it, each preceded by `{/* wire data props — see the component_reference MCP tool */}`.
No `options`, no `value`, no `label`. This is worse than the artifact placeholder, which at least
carries plausible props: two controls that render as inert chrome at the bottom of a
`position: fixed` full-page flex column.

`archetypes.ts` already names this exact failure mode in the `attachments` preset's comment —
*"two bare `<kai-file-upload>` / `<kai-attachments>` siblings with nothing wired to them: on
screen, inert, silent"* — as the reason that preset exists. The diagnosis is written down; the
components axis still does it for controls with no capability branch.

The builder discarded the entire block (only block (2) survived into the app).

### F-10 — `GET /api/chat` kills the dev server · product gap · S1 · rung-3 residual, now with a blast radius

The scaffolder's block (2) emits `readChatRequest` as an unguarded `await request.json()`, a
`chatHandler` with no method check, and a `chatMiddleware` with no `try`/`catch`. The builder
adopted all three near-verbatim (`server/chat.ts:28-30, 44-45`, `vite-chat-api.ts:14-44`) — it
*added* a `try`/`catch` inside the `ReadableStream.start` and a `configurePreviewServer`, both
improvements, but neither covers the parse.

Reproduced on a fresh keyless mirror, twice, on two ports:

```
GET /api/chat  ->  000   (connection refused; the process is gone)
GET /          ->  000   (was 200 four seconds earlier)

SyntaxError: Unexpected end of JSON input
    at parseJSONFromBytes (node:internal/deps/undici…)
    at async readChatRequest (…/vite.config.ts.timestamp-….mjs:809:9)
    at async chatHandler (…:818:37)
    at async chatMiddleware (…:855:19)
Node.js v22.22.3
```

An unhandled rejection in an async connect middleware, and Node 22 exits the process. A browser
tab opened on the endpoint, a link prefetch, a health check, or any malformed body takes the
whole dev server down.

**Second instance of the class, confirmed:** rung 3's delivered app carries the identical
unguarded `return (await request.json()) as ChatRequestBody` with no `try`/`catch` anywhere in
its `vite-chat-api.ts`. Same template, two apps, two rungs — which is what makes this a template
defect and not a builder defect.

**Re-cast input:** the emitted route needs a method guard returning 405, a `try`/`catch` around
the body parse returning 400, and a `.catch()` on the middleware that at minimum ends the
response. The scaffolder already teaches "the STATUS has to survive the bridge: a 401 that
arrives at the browser as a 200 is a blank bubble and no error" — it is one step from teaching
that an exception must too.

### F-11 — `<kai-artifact>` exposes no iframe part, so device-width sizing catches the toolbar · product gap · S3

Verified: no `part` on the iframe anywhere in `components/artifact*.tsx`. Detail in expected
finding 4 above. The app constrains `.frame` (`PreviewPanel.tsx:106`, `app.css:186-199`), which
is the only lever, and the toolbar narrows with the page.

**Re-cast input:** a `::part(frame)` (or a `previewWidth` prop) on `kai-artifact`. A device
toggle over a preview panel is not an exotic ask for this element's whole reason to exist.

### F-12 — no tablet/phone glyph in `icon-names.json` · doc gap · S3

Verified absent (`grep -oiE "tablet|phone|smartphone|mobile"` over the 48 names returns nothing).
The device toggle is labels-only for that reason (NOTES §13), which is a fine outcome — the
builder also correctly noted that `icon` takes "a named icon, an image URL, **or plain text**", so
an unknown name degrades to text rather than failing. Same class as rung 3's missing trash icon.
Not urgent; worth noting the icon set is now short for two consecutive rungs' needs.

### F-13 — `data:` as a blessed artifact `src` is never stated · doc gap · S3

Detail in expected finding 2 above.

### F-14 — the `workspace-chat` recipe promises the message→artifact flow and omits it from its wiring · product gap · S2

Detail in expected finding 3 above.

### F-15 — who toggles `.dark` is stated nowhere · doc gap · S4 · repeat of rung 3

Elements self-theme from `theme="auto"`; the token stylesheet's dark scope is a `.dark` class on
the host page; nothing says who keeps the two in step. The builder toggled it from
`prefers-color-scheme` in `main.tsx:15-21`. Rung 3's NOTES §11 said the same thing about the same
file. **Two rungs, same question, unchanged.**

### F-16 — `maximizedIndex={null}` filed as a guess when it is documented · builder error · S4

The `kai-resizable` reference says *"Which item index is maximized (null = none). Declarative
source of truth."* (result line 42). The builder used `null` and got it right, then recorded it
as a guess (NOTES §10). Over-caution, no consequence.

### F-17 — suppressing the duplicate tool panel via a hand-built `AssistantStreamSink` · acceptable variation, with a product note

`readOpenAIStream` always drives `upsertTool`, so a `kai_artifact` call renders a raw tool panel
in the thread *beside* the card built from the same call — the same fact twice. There is no
documented "skip tool parts" option, so the builder passed its own sink
(`App.tsx:163-168`) forwarding `appendText`/`appendReasoning`/`addSource` and making `upsertTool`
a no-op. `AssistantStreamSink` is a public, deliberately structural interface, and the kit's rule
is "never hand-roll an SSE *reader*", which this respects. **Clean, and the right call.**

The product note is that this is not an edge case: **duplicated rendering is the DEFAULT for
every card-tool app**, and the workaround requires knowing about an interface that appears 0
times in the front door. Re-cast input: either card tools should not also emit a tool part, or
the reader should take an option, or the sink pattern should be documented on `kai-chat`.

### F-18 — restore-appends and per-version prompt lineage · acceptable variation

`<kai-checkpoint>` is a button with a `kai-select` event and no opinion about restore semantics —
correctly, per the repo's own scope rule ("the kit decides HOW; the app decides WHETHER"). The
app decided: restoring appends a copy labelled "restored from vN", nothing is discarded, and each
version carries its own `basePrompts` lineage so "restore v2, then keep editing" branches off v2
(`versions.ts:14-19`, `App.tsx:143-151`, `199-214`). Verified by the builder in a browser
(transcript 587). **No gap. This is the boundary working.**

### F-19 — recorded non-finding: the `cards: 0` scare

At transcript 477 a probe reported `cards: 0` while the message showed `parts: ["text","card"]`
and the element was defined. The probe could not see into the shadow root; line 480 adds a
`deepQueryAll` helper and the card is found. Neither an app nor a kit defect. Recorded because
"nothing rendered" that turns out to be the *checker's* blindness is exactly the class this
project keeps paying for.

---

## Findings from the real-mode turn (F-20 – F-22)

F-01 – F-19 come from the clean-room run, which was mock-only by design. The three below came
out of the **insider's real-mode smoke** while landing the app into `examples/apps/builder/`
(`.superpowers/sdd/2026-08-20-rung-4-builder/task-5-report.md`, and the labeled sites in
`examples/apps/builder/server/chat.ts`). They are filed here because they belong to this
catalog, not because the comparer observed the HTTP responses: **the provider 400s and the
OpenRouter corruption are the insider's measurements and are cited as such.** Everything below
that is stated about the kit's own code, I re-derived myself against the tree and the shipped
package, and where that changed the verdict I say so.

### F-20 — `cardTools` emits tool definitions that OpenAI and Anthropic reject with HTTP 400, in the mode the kit calls the only working one · product gap · S1

`cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' })` carries the artifact
schema's **top-level `anyOf`** (`[{required:['src']},{required:['files']}]`). Both providers
refuse the tool array outright, before the model runs (insider's measurements):

```
OpenAI (openai/gpt-4o-mini, HTTP 400):
  Invalid schema for function 'kai_artifact': schema must have type 'object'
  and not have 'oneOf'/'anyOf'/'allOf'/'enum'/'const'/'not' at the top level

Anthropic (anthropic/claude-haiku-4.5, HTTP 400, on every OpenRouter route tried
— Anthropic, Bedrock, Google, Azure):
  tools.0.custom.input_schema: input_schema does not support oneOf, allOf,
  or anyOf at the top level
```

**Positive control (insider):** `google/gemini-2.5-flash`, byte-identical tool array, HTTP 200.
So the schema is not universally invalid — it is invalid for the two largest providers.

**Re-derived here, against the shipped 0.25.2 package and the tree — three things, and two of
them widen the finding:**

1. **The combinator really does survive the projection.** Probing the installed package:
   `cardTools({ artifact: … }, { provider: 'openai' })` yields parameters whose top-level keys
   are `title, description, type, additionalProperties, anyOf, properties` — `anyOf` present.
2. **It is not one card, it is two.** Over `packages/ui/src/primitives/card-schemas/*.json`,
   **`artifact` carries a top-level `anyOf` and `embed` carries a top-level `allOf`**; the other
   five are clean. And `cardTools({ provider: 'openai' })` with no card argument — the
   project-everything call — emits **7 tools, 2 of them carrying a top-level combinator**
   (`kai_artifact(anyOf)`, `kai_embed(allOf)`). Both provider error strings name `allOf` at the
   top level as well as `anyOf`, so **`kai_embed` is very likely refused on the same two
   providers**. *Flagged as a derived prediction, not a measurement — nobody has sent `embed`.*
   That matters because the front door's own instruction is to build the definitions once with
   `cardTools(registry, { provider })`, and the default registry contains both.
3. **The check that would catch this cannot run in the mode that needs it.** In
   `schemas/tool-defs.ts:419`, `const subset = strict ? … : null`, and `checkProviderSubset` is
   called only `if (subset)`. `provider-subsets.ts` knows the rule exactly — `anyOf` is
   *"supported … and it may not be at the root"* for OpenAI, `allOf` *"unsupported"* — and that
   knowledge is unreachable on the default path.

**The contradiction is worse than a stale header comment.** `tool-defs.ts:30-32` says non-strict
*"is not merely the default, it is currently the only working mode"*. But the same file's
**error text, the one a consumer is shown when `strict: true` throws** (line 228), reads: *"Fix:
drop `strict: true`. … both providers accept a loose schema there and ignore what they do not
compile."* That is the kit instructing the developer, at the moment of failure, to take the path
that returns HTTP 400. A remediation message that routes you into the defect is a stronger defect
than a comment that is merely out of date.

**Severity: S1, raised from the insider's proposed S2**, and the reason is the blast radius, not
the fix cost. This is a hard refusal, before the model runs, on the two largest providers, for the
flagship card of the exact flow this rung exists to measure — and it is reached by following the
kit's own documented one-liner. The app's workaround is 8 lines (`providerSafe`,
`examples/apps/builder/server/chat.ts:103-109`), and every consumer of `cardTools` for these two
cards has to write it.

**Re-cast input:** either run the top-level-combinator check on the **non-strict** path (it is a
provider refusal, not a strictness nicety) or re-express "one of `src`/`files`" in the artifact
schema without a root combinator — and fix the `strict: true` error text either way, since it
currently prescribes the failure. Check `embed` at the same time.

### F-21 — OpenRouter's streamed tool-call argument deltas corrupt on its Anthropic routes · environmental / upstream defect · S3, with a kit consequence

Insider's isolation, three probes:

| Request | Result |
|---|---|
| `anthropic/claude-haiku-4.5`, `stream: true` | concatenated `arguments` is **invalid JSON** — a stray `}` before the close |
| `anthropic/claude-haiku-4.5`, `stream: false` | `JSON.parse` **OK** |
| `openai/gpt-4o-mini`, `stream: true` | `JSON.parse` **OK** |

Not the model, not the schema, and **not the kit's reader** — it is OpenRouter's
Anthropic→OpenAI streaming translation. **Filed as environmental, and it is the only finding in
this catalog that is not about this repo.**

**The kit-relevant consequence, which is why it is recorded here at all:** this app is a streamed
tool call by construction, so the corpus's standard default model would have shipped an example
that never produces a page. The insider changed the app's default to `openai/gpt-4o-mini`
(`examples/apps/builder/vite-chat-api.ts`, `.env.example`), with the reason written at the site —
**the first corpus app to diverge from the corpus-standard model, and the divergence is
load-bearing rather than cosmetic.** If the corpus ever standardises a model per app, this is the
precedent to point at; if OpenRouter fixes the translation, this app's default should go back.

### F-22 — a malformed tool call is reported only on the channel card apps are told to suppress · product gap · S2

**The claim as it reached me was that a tool call whose arguments fail to parse "produces no
error anywhere on the kit path". I checked, and that is not true — the kit reports it, twice and
well.** `wire/consume.ts:230-244` catches the parse failure and calls
`sink.upsertTool(id, { state: 'output-error', errorText: … })` with a genuinely good message that
even distinguishes the truncation case (*"the stream hit the token limit mid-call"*) and clips the
raw text; and the failure is also returned on `ModelToolCall.error`, a documented field
(*"Why this call is unusable (malformed or truncated args, missing name)"*, `wire/chunk.ts:158`),
reachable as `turn.toolCalls[i].error`.

**The real defect is where those two channels land**, and it is a genuine decide-loudly problem:

1. **Channel one is the one every card app is pushed to switch off.** `upsertTool` is also what
   renders the raw tool panel that duplicates the card built from the same call — F-17. The
   workaround for F-17 is a custom `AssistantStreamSink` with `upsertTool: () => undefined`,
   which is exactly what this app ships (`App.tsx:163-168`). **Error reporting and duplicate
   rendering ride the same wire**, so suppressing the cosmetic problem silently disables the
   diagnostic one.
2. **Channel two is not the one anyone is taught to check.** The scaffolder's own emitted client
   ends with `if (turn.error) console.error('Model error:', turn.error.message)` — and
   `ModelTurn.error` is the **turn-level** error; a malformed tool call does not set it. Nothing
   in any of the ten MCP responses mentions `turn.toolCalls[].error`.

Net effect for this app, and for any app that follows the same two pieces of advice: a corrupted
tool call produces no visible failure — `takeToolCall` falls through on a missing `call.input`
(`App.tsx:94`), no version appears, and the thread just says nothing happened. Which is precisely
how F-21 presented before it was isolated.

**Re-cast input:** give the failure a channel that survives tool-panel suppression — set
`ModelTurn.error` (or a dedicated `toolErrors`) on a malformed call, or make "suppress the panel"
an explicit reader option that keeps errors flowing rather than something a host achieves by
gutting the sink. This is the same fix surface as F-17 and the two should be designed together.

## Counts by class

| Class | Count | IDs |
|---|---|---|
| teaching gap | 3 | F-01, F-02, F-06 |
| product gap | 11 | F-03, F-04, F-05, F-07, F-08, F-09, F-10, F-11, F-14, **F-20**, **F-22** |
| doc gap | 3 | F-12, F-13, F-15 |
| builder error | 1 | F-16 |
| acceptable variation | 2 | F-17, F-18 |
| environmental / upstream | 1 | **F-21** |
| strip artifact | **0** | — (all candidates checked against the real `llms-full.txt` / `README.md`) |
| recorded non-finding | 1 | F-19 |
| **Classified total** | **21** | F-01 – F-22 less the non-finding F-19 |

By severity: **S1 ×4** (F-01, F-02, F-10, F-20) · **S2 ×8** (F-03, F-04, F-05, F-06, F-07, F-08,
F-14, F-22) · **S3 ×5** (F-09, F-11, F-12, F-13, F-21) · **S4 ×2** (F-15, F-16). Nineteen
severity-carrying findings; the two acceptable variations (F-17, F-18) carry none, and F-19 is a
recorded non-finding.

**Provenance split.** F-01 – F-19 are the clean-room run (mock-only by design). **F-20 – F-22**
came out of the insider's real-mode smoke and are marked as such at each site: the provider HTTP
responses are the insider's measurements, everything asserted about the kit's own code was
re-derived by the comparer — which raised F-20 from the proposed S2 to S1 and **corrected the
premise of F-22** (the kit is not silent; the channels it reports on are the wrong two).

## Rung-3 residuals, re-checked

| Residual | Status |
|---|---|
| Baseline #5 / **F-16** — the workspace scaffold's unwired Artifact+Resizable placeholder | **NOT FIXED, RELOCATED.** `useCase: "artifact-split"` and the components axis both still emit `src="https://example.com"` wired to nothing. And the preset is undiscoverable (F-07). Filed F-08. |
| **Scaffold block-2 route's missing request guards** | **NOT FIXED, AND WORSE THAN RECORDED.** No method guard, no parse guard, no middleware catch — a single `GET /api/chat` terminates the dev-server process. Reproduced twice. Present in rung-3's app too. Filed F-10. |
| `debug` returns "No known failure pattern matched" to a real question | **REPEATED**, and this time the fallback pointer was to the wrong document as well as a stripped one. Filed F-06. |
| Who toggles `.dark` | **REPEATED** verbatim from rung-3 NOTES §11. Filed F-15. |
| The emitted route needs `@types/node` and the run note doesn't say so (rung-3 F-08) | Not re-exercised as a stumble: this builder put `@types/node` in `devDependencies` from the start. Run note still silent. Left open. |
| Icon set short for the app's needs (rung 3: no trash) | **REPEATED** with a different glyph (no tablet/phone). Filed F-12. |

---

# THE ARTIFACT-SEAM INVENTORY

Every line the app wrote to bridge **assistant reply → previewable page**. This is the
compile-to-WC builder spec's input, the way rung 3's glue inventory seeded the re-cast.

Line ranges are into `app/` as snapshotted here. Counts are computed from those ranges, not
estimated.

| # | Seam | File · lines | Lines | What it is |
|---|---|---|---|---|
| A | **Wire → envelope** | `src/App.tsx` 6-7, 91-128, 153-157, 163-168, 181-184 | **55** | `onToolCallReady` → `isCardTool` guard → `cardFromToolCall(name, input, {id})` → `envelope.type !== 'artifact'` guard → `data.files.find(f => f.code)` → HTML in hand. Plus the `AssistantStreamSink` that swallows `upsertTool` so the tool panel doesn't duplicate the card. |
| B1 | **Card registry + schema** | `src/cards.ts` 1-67 | **67** | `createCardRegistry({ use: ['artifact'], custom: { 'page-version': … } })`, the authored JSON Schema, and the `as CardSchema` assertion F-04 forces. |
| B2 | **The custom card element** | `src/page-version-card.ts` 1-148 | **148** | A hand-written `<page-version-card>` implementing the contract F-02 says is undocumented: idempotent `data`/`cardId`/`heading`/`resolution` setters, a shadow root, escaping, and `emitCardEvent` on click. |
| C | **Card → panel routing** | `src/App.tsx` 39, 43-61, 63-88, 226 | **47** | `listenForCardEvents` on a wrapper `<div>` (because `kai-chat` has no `policy` — F-03), the `select-version` action → `setSelectedId`, and the reactivity-two-halves re-stamp that keeps every card's "in preview" pill in step with the panel (new array **and** new object per changed part). |
| D1 | **URL / title / size minting** | `src/versions.ts` 24-53 | **30** | `pageUrl(html)` → `data:text/html;charset=utf-8,…`; `titleOf(html)` with entity decoding (`<title>` is markup); `formatBytes`. |
| D2 | **Artifact props** | `src/components/PreviewPanel.tsx` 104-127 | **24** | `src` + `files[{path,url,code,language,type}]` + `activeFile` + `displayUrl` + controlled `tab` + `noNav` + `iframeTitle`, keyed on version id. |
| E1 | **Version model** | `src/versions.ts` 1-22 | **22** | `PageVersion` incl. `basePrompts` lineage and `restoredFrom`. |
| E2 | **Version state, lineage, restore** | `src/App.tsx` 25-31, 37, 41, 143-151, 199-214 | **34** | The state/ref pair (the streaming handler runs outside render), the branch-off-the-restored-version context computation, non-destructive restore. |
| E3 | **Checkpoint rail** | `src/components/PreviewPanel.tsx` 81-102 | **22** | One `<Checkpoint>` per version, `variant` swapped to show selection (no `selected` prop exists), conditional Restore button. |
| F1 | **Maximize wiring** | `src/App.tsx` 21-22, 219-224 | **8** | `maximizedIndex={maximized ? 1 : null}` + `onMaximizeChange` mirroring back. |
| F2 | **Device + maximize controls** | `src/components/PreviewPanel.tsx` 16-29, 45-49, 64-78 | **34** | `DEVICE_WIDTHS`, the labels-only `Segmented` (F-12), the maximize `Button`. |
| F3 | **Device / stage CSS** | `src/app.css` 173-199 | **27** | The constrain-the-container workaround F-11 forces. |
| G | **Preview/Code tab control** | `src/App.tsx` 29, 114 | **2** | Controlled `tab`, reset to `preview` when a new version lands. |
| H | **Mock-side tool-call framing** | `server/mock-stream.ts` 1-50, 69-74, 105-143 | **95** | The half `createMockResponder` cannot do (F-05): marker-stamped frame builder, terminal-frame detection + suppression, the `kai_artifact` open frame, chunked argument deltas, the `finish_reason: "tool_calls"` close, `[DONE]`. |
| | **TOTAL** | | **615** | |

**615 seam lines.** The app is **1,925** authored source lines; **655** of those are the
deterministic page generator (`server/page-spec.ts` + `server/render-page.ts`), which stands in
for the model and is not seam. **Against the 1,270 lines of app proper, the seam is 48%.**

Derive it, don't trust it — run this over the snapshot in `app/`:

```
wc -l src/App.tsx src/cards.ts src/page-version-card.ts src/versions.ts \
      src/components/PreviewPanel.tsx src/components/TopBar.tsx src/main.tsx src/app.css \
      server/chat.ts server/mock-stream.ts server/page-spec.ts server/render-page.ts \
      vite-chat-api.ts vite.config.ts          # -> 1925 total
wc -l server/page-spec.ts server/render-page.ts  # -> 655 total (the model stand-in)
```

Fourteen files: every authored `.ts` / `.tsx` / `.css` in the delivered app. `index.html` (16
lines), the three `tsconfig*.json` and `package.json` are excluded — markup and config, and no
seam line lives in any of them.

**Correction note (2026-08-20).** An earlier draft of this section said 1,956 / 1,301 / 47%. The
**615 seam total was and is exact**; only the denominator was wrong, by 31 lines, from two causes
and *not* from anything the snapshot excludes: **+15** because the first pass counted
`split('\n').length` (one more than `wc -l` for each of 15 files ending in a newline), and **+16**
because it included `index.html` in the denominator while no seam line is in it. Corrected here
and in `.superpowers/sdd/2026-08-20-rung-4-builder/task-4-report.md`.

### What the seam decomposes into — for the builder spec

Six distinct jobs, and the kit currently supplies a helper for exactly one and a half of them:

1. **Get the tool call off the wire** (A) — kit has it (`onToolCallReady`), front door doesn't
   name it. *Fix: documentation.*
2. **Turn it into an envelope** (A) — kit has it (`cardFromToolCall`), front door teaches it well.
   *The one solved link.*
3. **Get a renderable thing into the thread** (A, B1, B2) — kit has `stream.addCard` and
   `cardTypes`, but authoring the card means implementing an undocumented property contract by
   hand. **215 lines of the 615 are B1+B2.** *Fix: document the contract; consider a
   `kai-conversation-item`-style item element for the compact-card case, which is the same
   construction-over-configuration move the re-cast already ratified for the rail.*
4. **Route a click from the card to the panel** (C) — kit has `emitCardEvent` /
   `listenForCardEvents`, unnamed in the front door, and the policy handle is on the wrong
   element. *Fix: F-02 + F-03.*
5. **Mint a URL the artifact can frame, and keep versions** (D1, D2, E1-E3) — **132 lines**,
   almost all genuinely app-owned policy (what a version means, what restore does, what the
   lineage is). *The kit should NOT take this; per the scope rule these are the app's calls. But
   `data:` needs blessing (F-13).*
6. **Frame it under a real layout** (F1-F3, G) — **71 lines**, of which 27 are pure workaround
   for the missing iframe part (F-11).

**The compile-to-WC read:** links 1, 2, 4 and half of 3 are pure mechanism — the same code in
every app that does this, and exactly the kind of thing a compiled component should own. Links 5
and most of 6 are policy and should stay in consumer lines. **The natural block boundary is
"assistant reply → a selectable, previewable artifact in the thread", with version semantics
left outside it** — which is the same split the workspace block drew when it kept the persistence
policy in consumer-owned lines.

The seam that is *entirely* avoidable is **H (95 lines)**: it exists only because the kit's mock
cannot emit a tool call. Every future app that wants to demo the card path pays it again.
