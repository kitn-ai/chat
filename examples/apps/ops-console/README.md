# Ops console

An internal operations console. You ask for something consequential — "deploy the
payments service to production" — and the assistant does not do it. It **proposes**
it, as an interactive card sitting in the conversation, and nothing happens until
you click. Approve/reject decisions, a multiple-choice strategy picker, a short
form when the operation needs parameters it will not guess, and a live checklist
that ticks along once a run is under way.

Beside the thread is a **run board** — deployment steps, health pings, a rollback
button — served by a *second local server on a different port*. It is framed into
the console through `<kai-remote>`, so it is a genuinely cross-origin card: it
cannot touch the console's DOM, and when you click Rollback on the board that
request arrives in the chat as a proposal you still have to approve.

Rung 5 of the [iteration ladder](../../README.md). React + TypeScript + Vite.

## Run it

```bash
nx build ui                                        # the app resolves @kitn.ai/ui through workspace:*
pnpm --filter @kitn.ai/ui-app-ops-console dev      # console http://localhost:5182 · board http://localhost:5183
```

`npm run dev` starts **two** Vite servers, because the whole point is two
origins: `mountRemoteCard` refuses to frame a card that is same-origin with its
host. `dev:console` and `dev:board` run them one at a time. `npm run build`
typechecks both halves and emits `dist/console` and `dist/board`.

Open `http://localhost:5182` and try:

- *"deploy payments to production"* → a parameters form (region, change ticket,
  operator note) → submit → an approval card carrying the values you gave →
  approve → the run starts, the in-thread checklist ticks from the live feed, and
  the framed board shows the same run
- *"restart the queue workers"* → four strategies with their blast radius → pick
  one → its own approval
- **Reject** a proposal, then **Undo** it — it comes back live
- **Dismiss** one — it collapses to a stub with an undo toast, and reopens
- Click **Roll back** on the board (the `:5183` panel) — the board does *not*
  roll itself back; the request arrives in the chat as an approval

Opening `http://localhost:5183` directly shows a standalone notice and no card.
That page is the remote half of a card, not an app.

## Mock mode (the default)

With no key, `/api/chat` streams the console's own scripted turn. It is not a
canned string: `server/script.ts` hand-builds OpenAI chat-completions SSE frames
carrying real `kai_approval` / `kai_parameters` / `kai_options` / `kai_checklist`
tool calls, with the arguments arriving in 96-byte slices the way a provider
sends them, so the reader's accumulator gets exercised rather than bypassed. The
browser reads it with `readOpenAIStream` and cannot tell the difference.

Every frame carries the kit's own mock tells — the `: kai-mock` banner,
`_kai_mock` on each frame, `model: "kai-mock"`, all-zero usage — imported from
`@kitn.ai/ui/state` rather than restated, plus an `X-Kai-Mock: 1` response
header. The client never reads that header: branching there would put the seam
back in the browser, which is the one thing this split exists to prevent.

The frames are hand-built because the kit's `createMockResponder()` still cannot
emit a tool call (**F-35**, a verbatim repeat of rung-4 F-05) and an ops console
is nothing but tool calls. The responder *is* used verbatim for the fallback
turn, when nothing matches.

## Real mode

Copy `.env.example` to `.env.local`, paste an OpenRouter key, restart. The
browser code does not change; the seam is `server/chat.ts` and nowhere else.

```bash
cp .env.example .env.local     # then paste your key
```

The key is read with `loadEnv(mode, root, '')` in `plugins/chat-api.ts` — the
**empty prefix** is what makes an unprefixed variable readable. Vite only inlines
`VITE_`-prefixed vars into client code, so `OPENROUTER_API_KEY` can never reach
the bundle. There is no `VITE_OPENROUTER_API_KEY` and there must never be one.

The tools offered to the model are **projected from `shared/cards.ts`**, the same
registry the client renders and validates against:

```ts
const CARD_TOOLS = cardTools(cards, { provider: 'openai', require: { … } });
```

Nothing restates a shape. The names it produces — `kai_approval`,
`kai_parameters`, `kai_options`, `kai_checklist` — are exactly what the mock
hand-frames and what `isCardTool` / `cardFromToolCall` recognise on the client,
so both modes put the same calls on the wire.

**Model:** `deepseek/deepseek-v4-flash-0731` by default; `openai/gpt-4o-mini` is
the alternate, and both are exercised in the verification table at the bottom of
this file — that is what "verified" means here. **Not an `anthropic/*` route** — every card here is a
streamed tool call, and OpenRouter's streamed `tool_calls` argument deltas come
back as invalid JSON on its Anthropic routes (rung-4 **F-21**). On an Anthropic
model this app streams prose and produces no cards at all.

**`tool_choice: 'auto'`, not `'required'`** — and this is the one place the app
deliberately differs from rung 4's builder, whose every reply *is* a tool call.
Here a card is optional per turn: "what is the run board?" is answered in prose,
and forcing a call would put an approval card on a question that proposed
nothing. The cost is rung-4's D4 lesson, and it is real: under `'auto'` a small
model sometimes narrates the call instead of making one. The system prompt's
"say one or two sentences, THEN make the call" is aimed squarely at that.

`parallel_tool_calls: false` — one card per reply is the app's contract, and two
approval cards for one operation is two chances to approve it.

### What a real model did to this loop

Measured 2026-08-22. Raw SSE for every row below is preserved in
[`.superpowers/sdd/2026-08-21-rung-5-remote-cards/t9-sse-captures/`](../../../.superpowers/sdd/2026-08-21-rung-5-remote-cards/t9-sse-captures/).

**`deepseek/deepseek-v4-flash-0731`** (the default):

| Turn | Result |
|---|---|
| "deploy payments to production, us-east-1, CHG-4821" | `kai_approval`, 777 bytes of arguments, parsed clean: heading, a body naming the forward-only migrations as unrecoverable, `tone: "warning"`, an approve/decline pair |
| follow-up, `intent: deploy-running` | `kai_checklist`, `mode: "progress"`, 5 real deploy steps — **2 runs of 3** |
| the third run of the same turn | **nothing.** `finish_reason: "stop"`, zero prose, zero tool calls |

**`openai/gpt-4o-mini`** (the alternate):

| Turn | Result |
|---|---|
| the same deploy prompt | `kai_parameters`, 448 bytes, parsed clean — it asks for the values rather than proposing straight away, which is the app's own scripted flow and a defensible read of the prompt. F-23 held: `title` "Deploy Payments Service", `required: ["region","change_ticket"]` |
| follow-up, `intent: deploy-approval` | `kai_approval`, 445 bytes, parsed clean. **Every F-23 rule held**: `heading` "Deploy Payments Service to Production", a non-empty `body` naming the operation as irreversible and echoing the ticket and the operator note, and 2 actions (`approve` / `deny`) |

Both models emit the call with no prose on the `intent`-driven follow-up turns —
the directive apparently outweighs the system prompt's "say a sentence first", so
the assistant bubble is a bare card. Not wrong; recorded because it is visible.

That third run is worth reading, because it is not the D4 narration failure. The
model produced a perfectly well-formed `kai_checklist` call — and the provider
route emitted the whole thing **inside the reasoning channel**, as raw
`<｜DSML｜invoke name="kai_checklist">` markup, never populating
`delta.tool_calls`. 344 of 345 completion tokens were reasoning tokens. The kit
is right to treat that as reasoning; the call is on the wire in the wrong
channel. It is the F-21 class — a route-specific streamed-tool-call defect — in a
new form, and it is filed as a rung-5 real-mode candidate rather than smoothed
over here. The practical effect for an operator is a turn that answers nothing,
which is recoverable by re-asking.

## How it works

- **`shared/cards.ts`** declares the four card types once, for both ends. They
  are the app's **own** types (`approval`, `parameters`, `options`, `checklist`)
  with `use: []`, each pointing at the kit's card *element* and carrying the
  kit's authored schema. That is forced, and it is this rung's headline finding
  — see below.
- **`src/card-frame.ts`** is the one-property frame element each of those tags
  actually names: it exists only so a card fills the conversation column, and it
  is a labeled workaround for a kit defect (D11), not a pattern to copy.
- **`src/assistant.ts`** POSTs the thread and hands the response straight to
  `readOpenAIStream`. No hand-rolled SSE reader. `onToolCallReady` turns each
  card tool call into a `CardEnvelope` whose id is the `tool_call_id` unchanged,
  which is what makes a re-sent call revise a card in place.
- **`src/card-store.ts`** projects card envelopes out of `ChatMessage.parts` and
  writes edited ones back, so every kit helper that speaks `CardEnvelope[]`
  composes over a thread unchanged.
- **`board/main.ts`** is a `createCardBridge` provider page: it renders the run
  board, emits `action` up the bridge when Rollback is clicked, and subscribes to
  the run feed on **its own** origin. Console and board are two renderings of one
  state, not two simulations that agree by luck.
- **`server/run-engine.ts`** owns the run. Both renderings read it over SSE.

## Not production

`/api/chat` and `/api/run/*` are Vite dev-server middleware; a static build of
`dist/console` + `dist/board` has no API. `server/chat.ts` and
`server/run-engine.ts` are plain modules over WHATWG `Request`/`Response`, so
they drop onto a real server unchanged. Run state is in memory. CORS on the board
API allows any http loopback origin — a real deployment pins the console's
origin, and would also need `frame-ancestors` on the board and a CSP on the
console (**F-38**: how to do that for a two-origin card deployment is documented
nowhere).

## How this app was built

This app is the ladder's fifth front-door build: the application code was written
by a clean-room builder agent (Claude Opus, 164 turns, 43.8 minutes, $22.30,
session `f760a7ef-2bf2-4d6f-a72e-b2986e5b0d26`) that had never seen this
repository. It worked from a packed-and-stripped
<!-- lint-cdn-pins: historical -- records the exact kit version the clean-room builder was handed; a release bump must not rewrite this run record -->
`@kitn.ai/ui@0.25.2` tarball plus the kit's own `kai` MCP server over stdio — and
nothing else: no repo access, no web fetches (`web_fetch_requests: 0`), no docs.
The app it delivered **built and ran with zero comparer fixes**, verified
independently on a fresh keyless mirror.

The rung's measurement: **13 MCP calls against 36 direct package inspections**
(≈1:2.8), with the pivot point exact — the third consecutive `debug` "No known
failure pattern matched", about a minute into the run. All three misses were
about the card-verb and cross-origin mechanisms, which are the two things this
rung is about. **Zero builder errors**: every guess in `NOTES.md` is a correct
reading of the kit.

The full run record, the builder's `NOTES.md` (kept beside this README,
verbatim), the MCP call table, the remote-card seam inventory and the graded
findings F-26 – F-40 live in
[`docs/superpowers/research/2026-08-21-rung-5-front-door/`](../../../docs/superpowers/research/2026-08-21-rung-5-front-door/).

**The builder's composition choices stand here unmodified**, including — in fact
especially — the ones that are findings:

- **The four card types are the app's own, not the kit's built-ins** (**F-26**,
  S1, the rung's headline). `<kai-chat>` draws built-in cards with internal Solid
  components that have no `CardHost` above them, so a built-in `confirm` card
  renders perfect Approve/Reject buttons whose events are constructed and then
  **discarded with no warning** — not merely unrouted. Declaring the types as
  this app's own makes the renderer dispatch to the kit's card *elements*, which
  do emit a bubbling `kai-card`. The cost is that the tool names are
  `kai_approval` / `kai_parameters` rather than `kai_confirm` / `kai_form`. That
  is not a workaround to be tidied away — it is the only shape in which this app
  can exist.
- **The hand-built board** rather than a card surface carrying it (**F-31**:
  neither card surface bridges to `kai-remote`'s contract).
- **`RunBoardFrame.tsx` creating `<kai-remote>` imperatively** — createElement,
  set every prop, *then* append (**F-28**, S1, measured in both registration
  orders: `<Remote>` from `@kitn.ai/ui/react` assigns props in a
  `useLayoutEffect`, i.e. after `connectedCallback`, and `kai-remote` reads its
  required props once at mount, so through the wrapper it always paints
  `Invalid provider-origin ""`).
- **`revive()` in `src/card-store.ts`** giving a re-armed card a fresh `data`
  reference (**F-33**: clearing `resolution` is not enough, because the element
  keeps its own optimistic copy).
- **`cardAwareSink` suppressing the duplicate tool panel** (**F-36**, a repeat of
  rung-4 F-17, and a second independent builder writing the same wrapper by
  hand).
- **The hand-framed mock SSE** (**F-35**).

An insider then finished the distance — corpus integration, the ports, the
OpenRouter seam — and nothing else. Per the standing provenance policy, every
phase's complete instruction stream follows verbatim, then the named list of
every change made to the builder's code.

### Phase 1 — the front-door build (the builder's entire task prompt, verbatim)

The one and only prompt the clean-room builder received (authored to the ops dir
as `builder-prompt.md`, sha256
`f9ff4c8debdaf0839eaf4a5f8caccf97da5616f06b68e599af36b618da5b4b3c`, verified
against the file that was launched):

````text
Build a small web app: an internal ops console where an AI assistant proposes consequential actions and the operator approves or rejects them in the conversation. When the operator asks for something risky (for example "deploy the payments service to production"), the assistant proposes it as an interactive card right in the chat that the operator answers with a click — approve/reject style decisions, occasional multiple-choice, and now and then a short form for parameters (region, ticket number). Rejected or dismissed proposals can be brought back with an undo. Multi-step operations show a live checklist that ticks along in the conversation. The assistant also maintains a live "run board" — deployment steps, health pings, a rollback button — which is rendered by a small page YOUR app serves from a SECOND local server on a different port (a different origin), framed inside the console's right-hand panel; clicking rollback on the board must reach the chat app and be confirmed there. React + TypeScript + Vite. Use the `@kitn.ai/ui` package already installed in this directory — it ships web components for AI chat UIs and React bindings. Its `kai` MCP server is configured for you: use it to learn what the package provides and how to use it. Replies should come from a local dev endpoint that streams a mocked response; the package ships facilities for mocking — discover them, including how an assistant reply can carry interactive cards and how a card served by another origin can talk back. Do not fetch any remote docs or read the package's source on npm/GitHub; work from the MCP and what is installed. When done: the app must build (`npm run build`) and run (`npm run dev`), and write NOTES.md recording every question you could not answer from the MCP and where you had to guess.
````

### Phase 2 — the insider completion (this conversation, verbatim)

The insider agent (Claude Fable worker W9r5, dispatched by a supervisor session)
received the following dispatch message, reproduced unedited:

````text
You are W9r5, rung-5 Task-9 insider-completion implementer in /Users/home/Projects/kitn-ai/kitn-chat, branch rung-5/app. Writer-lock: examples/apps/ops-console, pnpm-workspace.yaml, examples/README.md, pnpm-lock.yaml — NOTHING else. Do not commit.

Read FIRST, in order:
1. .superpowers/sdd/2026-08-21-rung-5-remote-cards/task-9-text.md — requirements, every checkbox binding.
2. docs/superpowers/research/2026-08-21-rung-5-front-door/findings.md — the F-26..F-40 catalog; every insider change must be labeled in the app README with its F-number/gap.
3. examples/apps/builder/ (rung-4's landing — README shape, provenance format, OpenRouter seam with tool defs, the D1-D5 hardening in src/page-html.ts and server/chat.ts as precedent for real-mode robustness).

Source: the BUILDER'S app at /var/folders/ss/nd1qr8qj1v1dthwcsck8h5v00000gn/T/opencode/rung5-cleanroom/app/ (fallback: .superpowers/sdd/2026-08-21-rung-5-remote-cards/sandbox-archive/app/) — copy from the sandbox, exclude node_modules/dist/.mcp.json/.env*, exclude the stray contaminated docs/ subtree inside it (a prior agent's misplaced skeleton — findings.md notes it). Builder code stays verbatim except gap-labeled changes; composition choices STAND (the app's own card types kai_approval/kai_parameters, the hand-built board, imperative kai-remote mounting — all HEADLINE findings, do not rewrite).

Key task-text points, expanded:
- TWO free ports: read every vite.config under examples/ (5181 is the builder app; the sandbox used 5173/5175 — repoint to the next two free; update every cross-origin reference: providerOrigin, board server URL, CORS if any).
- The tarball path in package.json points at the sandbox — replace with `workspace:*` per corpus convention.
- Real mode: extend server/chat.ts with the OpenRouter seam mirroring examples/apps/builder/server/chat.ts (env key read, status passthrough, in-band mid-stream error, disconnect → signal, X-Kai-Mock on mock) — the request carries `cardTools(...)` from @kitn.ai/ui/schemas with F-23's `require` narrowing on the form-card fields the app uses, `parallel_tool_calls: false`, `tool_choice` appropriate (rung-4 F-24 hardening; check what the app's flow needs — cards are optional per turn, so 'auto' with the D4 lesson noted, or justify 'required'). DeepSeek default (`deepseek/deepseek-v4-flash-0731`), gpt-4o-mini alternate, F-21 note (avoid anthropic/* via OpenRouter for streamed tool calls). Mock stays verbatim.
- NOTE the app's own tool names (kai_approval/kai_parameters) are the app's registry — wire cardTools for THOSE app-declared card types (the custom-card path #307 just fixed; if you hit a projection problem, that's a NEW finding — report, don't work around silently).
- .env: copy from examples/apps/builder for your real-mode smoke; never commit it; ship .env.example (unprefixed-key comment). One real 2-turn smoke: a turn that elicits an approval card (assert the tool call arrives + parses) and a follow-up. Multi-turn floor applies fully at T10, not here.
- README provenance: builder prompt verbatim (sandbox ops/builder-prompt.md, sha256 f9ff4c8d… — verify), run metadata (164 turns, $22.30, 43.8 min, session f760a7ef), this dispatch transcribed verbatim, insider changes numbered + gap-labeled. lint-cdn-pins waiver if you quote a versioned record.
- Verify: `pnpm --filter @kitn.ai/ui run verify:starters` green with the app enrolled (13th roster entry); app `npm run build` + typecheck exit 0; keyless dev smoke — both servers, mock SSE, guard trio 405/400/400 (F-40 says the guards are already in the app); the real smoke above. lint:cdn-pins green.

Report to .superpowers/sdd/2026-08-21-rung-5-remote-cards/task-9-report.md (if Write on .md is blocked, use a shell heredoc). Return ONLY: STATUS, ports, insider-change count, verification one-liners, what the real turn produced, concerns. No subagents.
````

### Every insider change to the builder's code, named and labeled

F-numbers refer to the graded findings in
[`docs/superpowers/research/2026-08-21-rung-5-front-door/findings.md`](../../../docs/superpowers/research/2026-08-21-rung-5-front-door/findings.md).
Everything not listed here is the builder's, **verbatim** from the delivered
snapshot: the whole of `src/` (`App.tsx`, `RunBoardFrame.tsx`, `assistant.ts`,
`card-store.ts`, `main.tsx`, `run-board.ts`, `run-view.ts`, `styles.css`), all of
`board/`, `shared/`, `server/script.ts`, `server/run-engine.ts`,
`plugins/bridge.ts`, `plugins/run-board-api.ts`, `scripts/dev.mjs`, `index.html`,
`NOTES.md`, and every composition choice.

1. **`package.json` — corpus identity.** Name `@kitn.ai/ui-app-ops-console`
   (private, `0.0.0`), the kit dependency `file:…kitn.ai-ui-0.25.2.tgz` →
   `workspace:*`, a `typecheck` script (`tsc -b --pretty false`, the shape
   `verify:starters` classifies), `build` moved from `tsc --noEmit` to `tsc -b`
   for the project references below, and a corpus-style description. Corpus
   integration — no gap. **Deliberately NOT changed: the builder's toolchain
   pins** (`vite ^8.2.2`, `typescript ^7.0.2`, `@vitejs/plugin-react ^6.1.0`,
   React 19) — the clean-room run was verified green on them and
   `verify:starters` builds the app on exactly them. `react`/`react-dom` stay
   real dependencies: `@kitn.ai/ui/react` resolves only with them installed.
2. **Ports 5182 (console) and 5183 (board)**, fixed and `strictPort`. The
   clean-room build ran on 5173/5175, which collide with the starters. Every
   cross-origin reference moved with them — `BOARD_ORIGIN` in `src/run-board.ts`
   (which is also the value pinned as `<kai-remote provider-origin>`), both vite
   configs, `scripts/dev.mjs`, the board's standalone notice, the console's own
   `HTTP-Referer`, and the one line of scripted copy that names the board's port.
   The CORS check needed nothing: it allows any http loopback origin by hostname,
   not by port. Corpus integration — no gap. `NOTES.md` still says 5173/5175
   because it is a **record of the clean-room run** and rewriting a record into a
   falsehood is worse than a stale number.
3. **The tsconfig trio** (`tsconfig.json` references → `tsconfig.app.json` +
   `tsconfig.node.json`), replacing the single config that compiled `src`,
   `board`, `server`, `plugins` and the vite configs together with `types:
   ["node", "vite/client"]` and the DOM libs on for all of them. That compiles,
   and it hides the split this repo has been bitten by: `request.json()` is
   `Promise<any>` under the DOM lib and `Promise<unknown>` under undici's, so a
   route that destructures it passes a DOM-flavoured typecheck and fails on a
   real Node server. The node half now has no DOM lib. `shared/` is compiled by
   **both** projects on purpose — it is the one declaration the client and the
   route share, so it has to hold under both resolvers. Corpus convention — no
   gap. Nothing moved in any source file: the builder had already written every
   relative import under `plugins/` and `server/` with a `.js` extension.
4. **`plugins/chat-api.ts` — the env read** (`loadEnv(config.root, mode, '')`
   in `configResolved`, threaded into the handler). The empty prefix is what
   makes an unprefixed key readable. Corpus real-mode seam, **not a builder gap**
   — the clean-room task was mock-only by design, and `NOTES.md` names swapping
   `scriptFrames(...)` for a provider call as the intended seam.
5. **`plugins/chat-api.ts` — disconnect propagation.** An `AbortController`
   aborted on `res.on('close')`, riding the `Request` into the handler, so a
   browser that hangs up mid-answer also hangs up on the provider instead of
   streaming to nobody and still being billed. Corpus pattern.
   **Deliberately NOT changed: the request guards this file already had.** It
   forwards the real method and reads a body only on POST, and `server/chat.ts`
   answers a bare `GET` with 405 and a malformed body with 400 rather than dying.
   That is rung-4 **F-10** arriving fixed in a fresh clean-room build on its own,
   recorded as **F-40** (a non-finding, and the first rung-over-rung residual to
   close). Re-verified here against the exact repro — see below.
6. **`server/chat.ts` — the mock/real seam**, and it is here and only here. The
   clean-room route's whole body became `streamMock(body)`, unchanged but for the
   extracted argument and an `X-Kai-Mock: 1` header. The client makes the
   identical fetch either way and parses both with `readOpenAIStream`, so the
   wire path the mock exercises is the one that ships. Corpus real-mode seam.
7. **`server/chat.ts` — `CARD_TOOLS`, derived from the app's own registry.**
   `cardTools(cards, { provider: 'openai', … })` over `shared/cards.ts`, so the
   tool definitions and the client's renderer/validator cannot drift. This is the
   **custom-card** projection path, because **F-26** is why these are custom card
   types at all. `strict` is off — these schemas carry `const`, `enum`,
   `minLength` and open `properties` objects, none of which survive either
   provider's strict subset. Notably **no app-side patching was needed**: rung-4
   **F-20**'s fatal top-level combinator is now relaxed by the kit in non-strict
   mode, so the projection ships exactly as `cardTools` produces it.
8. **`server/chat.ts` — F-23 `require` narrowing** on the projected tools, four
   rules, each moving a failure from render time to generation time:
   `approval` gains required `heading` + `body` (the `confirm` schema requires
   only `actions`, so a model may legally emit an Approve/Reject pair with no
   statement of what is being approved — the worst card that can appear in an ops
   console) and `minItems: 2` on `actions` (an approval you cannot decline is a
   notification wearing a button); `parameters` gains required `title` +
   `required` (the form schema requires only `type` and `properties`, so a
   parameters form can be headless and submittable blank, after which this app's
   follow-up turn falls back to its own defaults and proposes a deploy to a
   region nobody chose); `options` gains a required `prompt` and `minItems: 2`;
   `checklist` gains `minItems: 1` on `tasks`. This narrows the **wire projection
   only** — `registry.validate()` is untouched, so every hand-built mock envelope
   still validates against the original schema.
9. **`server/chat.ts` — `SYSTEM_PROMPT`.** The one instruction real mode adds:
   what the four tools are for, one card per reply at most, prose *then* the call,
   name the irreversible parts, and the product rule the console exists to
   enforce — propose, never act. Real-mode seam.
10. **`server/chat.ts` — `intentDirective()`.** The app drives its follow-up
    turns with its own `intent` / `params` fields (a submitted form asks for
    `deploy-approval`; an approved deploy asks for `deploy-running`). The scripted
    assistant switches on them; a model has never heard of them. Real mode turns
    the same two fields into one directive turn, so the follow-up flow works in
    both modes. Real-mode seam.
11. **`server/chat.ts` — `proxyOpenRouter()`**, mirroring the rung-4 builder's:
    provider status **passed through unchanged** (a 401 that arrives as a 200 is a
    blank bubble and no error), a mid-stream failure re-framed **in band** the way
    OpenRouter itself reports one, `request.signal` forwarded, and error text that
    never echoes the request because it carries the `Authorization` header.
    `tool_choice: 'auto'` and `parallel_tool_calls: false`, both justified at the
    site (rung-4 **F-24** hardening; the `'auto'` choice is argued above under
    "Real mode"). Real-mode seam.
12. **`.env.example` and `.gitignore`.** The unprefixed-key comment, the model
    note carrying **F-21**, and a token ceiling. `.env*` is gitignored; no key
    ever lands in the tree.
13. **This README.** The builder shipped `NOTES.md` (kept verbatim beside it) and
    no README.

#### The hardening wave — defects D2..D7 from the task-10 IVP

A hardened IVP drove this app in a real Chromium, in both modes, and found eight
defects; the full report is
[`.superpowers/sdd/2026-08-21-rung-5-remote-cards/task-10-report.md`](../../../.superpowers/sdd/2026-08-21-rung-5-remote-cards/task-10-report.md).
Six of them are the app's and are fixed here. Every one of the six was a decision
taken QUIETLY — a stop with no reason, a diagnostic with nowhere to go, a payload
nobody named, a ticket invented, a decision never told to the model, a signal that
landed on nothing. That is one defect class, not six, and it is the class the
repo's decide-loudly rule exists for.

14. **`src/assistant.ts` — an in-band mid-stream error reaches the thread
    (D2).** `readOpenAIStream` reports a provider failure that arrives AFTER the
    headers as `ModelTurn.error`, not as a throw, so the `catch` never saw it and
    `runTurn` returned `{ error }` to a caller that dropped it: the reply stopped
    mid-sentence with nothing on any channel — no thread text, no toast, no
    console. `runTurn` now calls `stream.abort(reason)`, which is the SAME
    presentation the transport-drop path already used (the reason becomes its own
    text part; the partial reply stays where it is), plus a `console.error`. The
    claim at `server/chat.ts:344-346` — "`src/assistant.ts` already puts that in
    the thread" — is true as of this change and was not before.
15. **`src/assistant.ts` — a corrupted card tool call is no longer swallowed
    (D3, the **F-34**/**F-22** class at app scale).** When a card tool call
    cannot be parsed, `wire/consume.ts` reports it on exactly one channel —
    `sink.upsertTool(id, { state: 'output-error', errorText })` — and never calls
    `onToolCallReady`. `cardAwareSink` suppressed EVERY patch for a card call id
    (F-36, so a proposal does not render twice), which meant it suppressed that
    one report too: a truncated `kai_approval` rendered "Working on it." and
    stopped, with zero channels. `output-error` is now the one patch that passes
    through — the kit's own tool-panel diagnostic draws — and the sink also calls
    back so the console says it in words, in the thread and on `console.warn`. A
    collapsed panel is a channel; it is not a thing an operator reads.
16. **`src/assistant.ts` — pollution keys are rejected loudly (D4).**
    `__proto__` / `constructor.prototype` in a card payload were inert (nothing
    spreads them onto a prototype, and `Object.prototype` was verifiably clean)
    but completely silent: the card rendered normally. **The kit layer cannot
    catch this and the app was not bypassing it** — the card validator does not
    implement `additionalProperties` at all (the exclusion is written down in
    `packages/ui/src/primitives/card-validate-schemas.ts`), and `cardSchemas.confirm`
    does not set it in the first place, so `cards.validate()` passes the payload
    and is right to. So the app scans the envelope's own keys itself, refuses to
    render the card, names the offending paths in the thread and warns on the
    console. The paths are backticked because the notice is markdown and a bare
    `data.__proto__` renders as emphasised "proto" — a notice naming a key that
    is not the offending one. (Found by the repro, not by reading.)
17. **`src/App.tsx` — an approval with no context is REFUSED, never defaulted
    (D5).** `String(params.ticket ?? 'CHG-0000')` was invisible in mock mode,
    because the scripted assistant attaches `{ region, ticket }` to its approve
    action. A real model's approve action carries no payload, and the console
    recorded a production deploy against change ticket **CHG-0000** — an audit
    field, fabricated, on a run the operator had explicitly ticketed CHG-4821.
    The console now takes the approve payload if it carries a whole context, else
    the region and ticket the operator actually typed into the parameters form
    (remembered in `deployContextRef`, written from nowhere else and cleared by
    "Clear run"), and otherwise **stops**: nothing is deployed, the thread says
    which fields are missing, and a toast repeats it. Refusing is the decision
    here — a production run recorded against an invented ticket is worse than a
    deploy that does not start, and inferring the ticket from prose would be the
    same fabrication with more steps.
18. **`src/assistant.ts` — card outcomes are projected into the encoded history
    (D6).** `toOpenAIMessages` drops `card` parts by design (kit-side that is a
    settled silent-drop waiver, and the right call: a card envelope has no
    canonical provider representation). The consequence lands on the app — the
    live turn-3 request contained two user lines and one prose line, no proposal
    and no approval, and the model correctly answered *"I don't have any
    confirmation that it was approved"*. `withCardOutcomes()` now states each
    card and its resolution as a compact text part beside it, for the REQUEST
    only; app state is untouched. **Open kit question for the handoff:** should
    the kit offer a canonical projection of card parts for encoders, rather than
    every app inventing its own wording? Not built here.
19. **`board/board.css` + `board/main.ts` — the framed board can re-theme
    (D7).** The transport already worked: `<kai-remote>`'s theme reaches the
    provider and the renderer remounts. Nothing repainted, because the board
    declared ONE dark palette and no rule a theme change could select. A light
    palette now sits behind `[data-theme='light']`, and the mode is stamped on
    `:root` as well as on the mount root — `html`/`body` paint the frame's
    background, which is the surface the panel actually shows, and a mode on the
    mount root alone left it pinned to the dark value. Every colour in that file
    is a token, so nine values are the whole change; the `color-mix()` badges and
    the danger button follow for free.

#### The second wave — D9, D10 and N2, from the fix-wave re-review

The same verifier re-drove the app after the six fixes above, live as well as
mock, and found three more — one of them pre-existing and worse than anything in
the first list, one caused by a fix in it.

20. **`shared/cards.ts` + `server/chat.ts` + `src/App.tsx` — a model-invented
    action id can no longer be a silent no-op (D9).** DeepSeek emitted
    `actions: [{id:'deploy'},{id:'decline'}]` and `[{id:'deploy'},{id:'cancel'}]`.
    `App.onCardAction` switches on `approve`/`reject`, so every live Approve fell
    through to a default branch that raised a transient toast and returned: the
    card stamped itself resolved ("✓ Deploy to production"), and **nothing
    happened** — no run, no refusal, no record. It also made D5's refusal
    unreachable live, because control never reached it. Fixed in two halves, and
    both are needed. `APPROVAL_ACTION_IDS` in `shared/cards.ts` is the console's
    action vocabulary, declared once; `server/chat.ts` pins it as the `enum` on
    the derived tool's `actions[].id` so a real model **cannot** emit anything
    else (F-23-style narrowing, on the projected copy — the authored schema and
    every hand-built mock envelope are untouched, and the pin throws at boot if
    its path stops resolving); and `App`'s `default` branch is now a loud
    in-thread refusal naming the id and listing what the console does implement,
    for the cases the enum cannot cover (a hand-built envelope, a provider that
    drops the enum, a model that ignores it). The enum is a request; only the
    refusal is a guarantee. `CardRequireRule` narrows `required` and `minItems`
    only, so the enum had to be pinned by hand — **a kit gap worth a finding**.
21. **`src/App.tsx` + `src/assistant.ts` — the projection states the console's
    OUTCOME, not the operator's click (N2, from change 18).** The first version
    emitted `the operator chose "deploy"` even where the console had refused to
    act. In the live run the model was told a deploy had been chosen, the app had
    done nothing (D9), and the next turn reported a live 1-of-5 run — and invented
    a second ticket — while the board read `idle`. A projection that can be
    contradicted by the board is a fiction with the app's authority behind it. The
    outcome is now written by the code that DECIDED it (started / refused /
    rejected / unimplemented-id), stored as a record rather than a sentence, and
    rendered at send time against the run the BOARD is currently showing — so
    "started" becomes "the run board no longer holds that run" once it is cleared.
    Where no outcome was recorded the line says so, rather than implying one.
22. **`src/assistant.ts` — an action `style` outside the schema's enum is
    replaced, loudly (D10).** The live model sent `style: "danger"`; two warnings
    followed and the destructive approval rendered with a **default-styled**
    button — the loudest thing on the card was the thing that did not happen. The
    style is now checked against the enum READ BACK from the card schema (not a
    copy) and replaced with a named default, with a `console.warn` naming the
    action, the value and the substitute. It is not mapped to `destructive`:
    guessing that "danger" meant the red button would be this app inventing intent
    for a control that fires an irreversible operation.
23. **`src/assistant.ts` — the D3 notice no longer pastes raw model output into
    the thread** (verifier-requested refinement of change 15). The kit's message
    ends `… Received N chars: <the raw fragment>`. That fragment is model output,
    and the tool panel and the console warning both still carry it in full; the
    thread keeps the sentence only.

#### The third wave — N3, from the round-2 re-review

24. **`shared/cards.ts` + `server/chat.ts` + `src/assistant.ts` — the approval
    vocabulary is PER INTENT (N3, from change 20).** The flat enum constrained
    ids but not the labels the model writes for them, and a label is prose the
    app does not control. Captured live, on a card proposing a **deploy**:

    ```
    'approve'  -> 'Deploy to production'
    'reject'   -> 'Cancel'
    'rollback' -> 'Deploy, then roll back if it faults'   <- executes rollbackRun()
    ```

    Every id was in vocabulary, so nothing refused it; the third button reads as
    a deploy variant and rolls production back. The pin had made a
    coherent-looking id under a contradictory label *executable*, where before it
    at least got refused.

    Reading the label to check it agrees with the id is **not** the fix — that is
    a prose heuristic guarding an irreversible operation. The vocabulary is the
    part the app controls, so it got smaller. `APPROVAL_ACTIONS_BY_INTENT` maps
    each app-driven intent to what that turn may offer (`deploy-approval` →
    approve/reject, `rollback` → rollback/reject, `strategy-confirm` →
    apply-strategy/reject, `rotate` → rotate/stage/reject), and every other turn
    gets `DEFAULT_APPROVAL_ACTION_IDS` — approve/reject only, which is exactly
    the turn the captured card came from. `server/chat.ts` builds the tool defs
    per request (a fresh clone, so one turn's enum cannot leak into the next);
    `src/assistant.ts` removes an out-of-vocabulary button on arrival, loudly,
    naming the id **and the label it wore**, and refuses the whole card if
    nothing legitimate is left. `APPROVAL_ACTION_IDS` — what `App`'s total-switch
    backstop lists — is now DERIVED from that map rather than being a second
    list. The client-side half runs only on turns the app drove, because the mock
    script routes a free-form prompt by keyword ("roll back the deploy" produces
    a rollback card with no intent) and that is the app's own trusted output;
    the scope note sits on `enforceActionVocabulary`.

#### The fourth wave — D11 and D12, from the owner's live validation

Two defects found by driving the console by hand. Both root-caused inside the
kit, and **both were then fixed in the kit** — so neither leaves app code behind.
The app-side workaround D11 wore for one round is recorded here with its
lifecycle rather than deleted: what it was, why it was allowed, and what retired
it. There is no `ops-*-card` frame in this app any more, and `cards.tags` points
straight at the kit elements again.

25. **~~`shared/cards.ts` + `src/card-frame.ts` + `src/main.tsx`~~ — a card in
    the thread now fills the conversation column (D11). ADDED, THEN REMOVED: the
    kit fix landed and the app code went back to plain kit tags.** The
    parameters form rendered ~285px wide in a 768px column: its width was its own button row.
    `<kai-chat>` laid an assistant turn out as `flex flex-col items-start`
    (`packages/ui/src/components/chat-thread.tsx`) and no card surface —
    neither the Solid `Card` root nor the `kai-*` card element hosts — carried
    `w-full` or `align-self: stretch`, so every card was a flex item sized to
    `min(max-content, column)`. The approval card only LOOKED right: its prose is
    wider than the column. Measured in Chromium, pre-fix: form **285**, approval
    **768**, column **768**.

    A consumer could not reach that box, and that is the part worth keeping. The
    card element is created inside `<kai-chat>`'s shadow root, where a document
    stylesheet does not apply, and
    the kit's `CardTagSlot` sets only `data` / `cardId` / `heading` /
    `resolution` / `theme` on it — no class, style or part hook. What a consumer
    CAN do is name its own tag in `cardTypes`, so for one round `cards.tags`
    pointed at four one-property frame elements (`ops-approval-card`, `ops-parameters-card`, …)
    that gave themselves `display:block; width:100%` as an INLINE style and
    rendered the kit's card as their single **light-DOM** child, forwarding those
    same properties. Light DOM deliberately: the bubbling+composed `kai-card`
    event still reached the host listener unchanged, and a `kai-form` probe still
    found the element. It was labeled a workaround at its own site, with the
    condition for deleting it written down: the day the kit gives cards a
    full-width box.

    **That day was the same day.** The kit made assistant rows `items-stretch`
    (one lever, rather than `w-full` on the Solid `Card` root AND on every
    `kai-*` host whose shadow wrapper is `display: contents`), pinned by
    `packages/ui/tests/components/thread-card-width.test.tsx`, and the frame
    elements came straight back out: `src/card-frame.ts` deleted, `cards.tags`
    back to `kai-confirm` / `kai-form` / `kai-choice` / `kai-tasks`,
    `main.tsx` back to its pre-D11 shape. The app now measures the same 768px it
    measured with the frames, through the kit path and nothing else — so what
    this corpus shows a reader is the real composition, not a masked one. The
    one-round detour is kept in this entry because *what a consumer can reach
    from outside a shadow root* is the finding, and it stops being visible the
    moment the workaround is silently erased.
26. **FIXED IN THE KIT — typing in a text field lost focus after every character
    (D12).** Typing `CHG-4821` into "Change ticket" landed the
    `C`, and then focus was on `<body>`; the remaining seven keys went nowhere.
    It reproduced only with real per-key events — Playwright's `fill()` sets the
    value in one shot and never re-enters the path, which is how the earlier IVP
    missed it.

    It was **not** the re-envelope hypothesis, and that mattered: the app never
    writes keystrokes into card data. Nothing outside `<kai-form>` moved — a
    MutationObserver on the card's parent in the chat's shadow root recorded
    nothing, while one on the form's own shadow subtree recorded the `<input>`
    being removed and re-added inside `div.flex w-full flex-col gap-1.5`, the kit
    `Input` primitive's wrapper, three times per keystroke: 6 recreations while 8
    characters were typed. The note field, a `<textarea>` rendered directly, kept
    its node and its focus through the identical test, which isolated the layer.

    Two kit sites, both now fixed. `packages/ui/src/ui/input.tsx` — `<Show>`'s
    `fallback` is a getter read inside Solid's memo, and it **called**
    `inputEl(...)` there with a class argument computed from `isInvalid()` /
    `local.size` / `local.class`, so the node was CREATED in the memo's scope and
    every reactive read in that argument rebuilt it. The class now arrives as an
    accessor read inside the element, so the memo has no dependencies and the
    node is created once. `packages/ui/src/components/form.tsx` — `common()`
    built a fresh object reading `props.value()` alongside everything else, so
    reading any one prop (`invalid`) subscribed to all of them; it is now one
    stable object with a getter per prop, and reading `invalid` tracks only the
    error. Pinned by `packages/ui/tests/ui/input-node-identity.test.tsx` and
    `packages/ui/tests/components/form-field-subscriptions.test.tsx`.

    Nothing an app could set from outside the shadow root changed any of it —
    which is why this one had no workaround round at all, and why the honest
    move while it was open was to leave the field broken and say so.

Not fixed here: **D1** (remote-card auto-resize under-reports, so the board is
clipped) is kit-side, in `packages/ui/src/primitives/use-resize-observer.ts` and
`host-embed.ts`; **N1** (its fix turned the frame into a one-way ratchet) is
kit-side too; **D8** (two unprovoked console warnings) is kit-side noise from
`<kai-remote>`'s own sandbox attributes and the handshake. **D11** and **D12**
were kit-side too and are the two that got fixed there; see above.

### Verification

| Check | Result |
|---|---|
| `pnpm --filter @kitn.ai/ui run verify:starters` | green with this app enrolled in the derived roster |
| `npm run build` (`tsc -b` + both vite builds) | exit 0, `dist/console` + `dist/board` emitted |
| `npm run typecheck` | exit 0 |
| keyless `npm run dev` | console `:5182`, board `:5183`, both ready in ~240 ms |
| keyless `POST /api/chat` | marker-stamped SSE, `X-Kai-Mock: 1`, real `kai_parameters` tool call |
| `GET /api/chat` | **405**, server alive (**F-40**) |
| `POST /api/chat` with `not json` | **400** `{"error":"Request body is not valid JSON."}`, server alive |
| `POST /api/chat` with no `messages` | **400** `{"error":"Request body must carry a messages array."}`, server alive |
| `GET /` on the board origin | **200** |
| real 2-turn smoke, `deepseek/deepseek-v4-flash-0731` (2026-08-22) | `kai_approval` then `kai_checklist`, both parsed clean, F-23 rules held — 1 of 3 follow-up runs produced nothing, see "Real mode" |
| real 2-turn smoke, `openai/gpt-4o-mini` (2026-08-22) | `kai_parameters` then `kai_approval`, both parsed clean, every F-23 rule held — this is what backs "the alternate" above |
| `node .superpowers/sdd/2026-08-21-rung-5-remote-cards/ivp/w11a-verify.mjs` (the D2..D7 + D9/D10/N2 repro, 2026-08-24) | all checks pass; the same script run against the pre-fix files reproduces every defect it asserts. Re-run against the kit that fixes D11/D12, with the app's frame workaround removed: **59/59** |
| `node …/ivp/w12-verify.mjs` (the D11/D12 regression, 2026-08-24, after the kit fixes) | **13/13** — `CHG-4821` typed one key at a time keeps focus on the SAME input node for all 8 keys, the kit re-creates that node **0** times, `pressSequentially` agrees, the form still submits into the `deploy-approval` turn, and form width == approval width == column width == **768**, with no `ops-*` frame element anywhere in the ancestor chain |
| the D11 red run, before the kit fix and without the app's (now deleted) frames | **form 285 vs approval 768** in a 768px column, which is exactly the shape the owner saw; `.../ivp/w12-red-prefix.log` |
| `node …/ivp/w11a-tooldefs.mjs` (the D9/N3 enum pin, on the projected tool defs themselves) | all checks pass — one cell per intent, a deploy approval cannot offer `rollback`, a rollback approval cannot offer `approve`, an unknown intent falls back to the narrow default, the ids the live model invented are absent, and the AUTHORED schema still carries no enum |

The D2..D7 repro is a driven one — real Chromium, hostile and failure fixtures
delivered as OpenAI SSE **bytes** on the app's own `/api/chat`, so each flows
through `readOpenAIStream` → `cardAwareSink` → `cardFromToolCall` exactly as a
model reply would. It **was watched failing first**: with the four changed files
reverted to their pre-fix contents and nothing else touched, the run reproduces
every defect — the in-band error invisible, the corrupted call on zero channels,
the pollution card rendered with nothing said, `CHG-0000` on the board, a request
body with no decision in it, and a board that flips `data-theme` while painting
the identical `rgb(11,13,16)`. The checks that pass in BOTH runs are the ones that
were already true (the mock approve path, `Object.prototype` staying clean, the
theme signal arriving), which is what makes the other verdicts mean something.

The second wave was watched failing the same way, against the tree as it stood
after the first: D9's refusal absent and the board untouched by a click on
"Deploy now", the projection reading `the operator chose "deploy"`, and the
`danger` style producing the kit's two warnings and a default-styled destructive
button. `w11a-tooldefs.mjs` loads `server/chat.ts` through the app's own Vite and
inspects the projected tool defs directly, because a pinned enum only reaches a
provider in real mode and is invisible to a keyless browser run.

So was the fourth, and its red run is the interesting one: before the kit fix
the parameters card measures 285 and the **approval card still measures 768**, so
a check written only against "the card is narrow" would have passed on the card
that looks fine and told you nothing. The check that catches it is the one
comparing the two cards in the same thread.

The D12 checks earned a second lesson, about the checks rather than the code.
While the defect was open they were written as assertions that it was PRESENT
("the kit re-created the input node, measured") — which went red the moment the
fix landed, and read as a failure. A check that fails when the code gets better
is worse than no check. They are positive now: focus retained, node identity
held, zero re-creations, the whole ticket in the field.

So was the third. Against the round-2 tree the same run renders the captured
card with all three buttons live — `["Deploy to production", "Cancel", "Deploy,
then roll back if it faults"]` — and says nothing on any channel; nothing else
moved, which is what shows N3's fix did not cost any of D2..D10 or N2.

Raw SSE for both models is preserved in
[`.superpowers/sdd/2026-08-21-rung-5-remote-cards/t9-sse-captures/`](../../../.superpowers/sdd/2026-08-21-rung-5-remote-cards/t9-sse-captures/),
so the model claims in this file can be re-checked rather than taken on trust.
