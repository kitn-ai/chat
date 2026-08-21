# Page builder

Rung 4 of the iteration ladder: an AI page builder. Chat on the left, a live
preview on the right. Ask for a page and the assistant reply carries a whole
self-contained HTML document as a **`kai_artifact` tool call**; the host turns
that into a `<kai-artifact>` preview, a compact custom card in the thread, and a
`<kai-checkpoint>` version you can restore. Preview/Code toggle, device-width
toggle, resizable split, maximize. React + TypeScript + Vite, on the generated
React wrappers from `@kitn.ai/ui/react`.

The interesting part is the **seam**: assistant reply → previewable artifact.
`docs/superpowers/research/2026-08-20-rung-4-front-door/findings.md` measures it
at 615 authored lines, 48% of the app proper, and decomposes it into six jobs the
kit currently supplies a helper for one and a half of.

## Run it

The kit resolves through `workspace:*`, so build it first:

```bash
pnpm install          # from the repo root
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-app-builder dev
```

Then open <http://localhost:5181>.

### Mock mode (the default)

With no key set, `POST /api/chat` streams a mocked turn: the words come from
`createMockResponder()` in `@kitn.ai/ui/state`, and the page comes from a
hand-framed `kai_artifact` tool call over a deterministic generator in
`server/page-spec.ts` + `server/render-page.ts`. Ask for "make the header dark",
"add pricing", "use a serif font", "make it purple", "add an FAQ" or "rename it
to Field Notes" and the generator folds each one into the next version.

Nothing here can be mistaken for a real turn: the stream opens with a
`: kai-mock` comment, every frame carries `_kai_mock`, `model` reports as
`kai-mock`, usage is all zeros, and the response carries `X-Kai-Mock: 1` for
whoever is reading a curl. The hand-framed half is stamped with the kit's own
exported markers, not lookalikes.

**Why the page half is hand-framed at all** is finding **F-05**:
`createMockResponder()` emits content deltas only — `replies`, `delayMs`,
`chunkSize`, `announce` — so the kit's own mock cannot exercise the kit's own
card path. 95 of this app's lines exist for that reason alone, and every future
app demoing a card pays them again.

### Real mode

```bash
cp .env.example .env.local   # paste an OpenRouter key, restart the dev server
```

The key is **unprefixed** (`OPENROUTER_API_KEY`, never `VITE_…`): Vite only
inlines `VITE_`-prefixed vars into client code, so an unprefixed name cannot
reach the browser bundle. It is read in `vite-chat-api.ts` and used in
`server/chat.ts`, nowhere else.

**The browser code does not change between the two modes.** Same `fetch`, same
`toOpenAIMessages` encode, same `readOpenAIStream` parse, same
`onToolCallReady` → `cardFromToolCall` bridge. The mock and the model put the
*same* call on the wire, because the tool definition real mode sends is derived
from the same card schema the client validates against:

```ts
cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' })
```

Two things about real mode are worth knowing before you turn it on, both found
by this app's first real turn and both written up at their site in
`server/chat.ts` and `vite-chat-api.ts`:

1. **The derived tool is rejected by OpenAI and Anthropic as-is.** The artifact
   card schema carries a top-level `anyOf` (`src` or `files`), and both
   providers refuse a top-level combinator in a tool schema — in **non-strict**
   mode, before the model runs (`HTTP 400`, verbatim messages quoted in
   `server/chat.ts`). Google/Gemini accepts it. So the kit's own note that
   non-strict "is currently the only working mode" does not hold for the
   artifact card on the two largest providers. The route drops the top-level
   combinator and says the same thing in the description; every property stays
   derived. Proposed as **F-20** for the rung's findings.
2. **The default model is `deepseek/deepseek-v4-flash-0731`, not the corpus's
   `anthropic/claude-haiku-4.5`.** This app's whole reply is a *streamed* tool
   call, and OpenRouter's streamed `tool_calls` argument deltas come back as
   invalid JSON on its Anthropic routes — a stray `}` near the end, reproduced
   on two prompts. The same request non-streamed parses fine and OpenAI's
   streamed deltas parse fine, so it is an upstream defect, but on an Anthropic
   model this app produces no page at all.

   `openai/gpt-4o-mini` is the **verified alternate** and passes the same
   three-turn acceptance run; set `OPENROUTER_MODEL` to switch. It is markedly
   less generous, though — its pages land around 400–800 bytes against
   DeepSeek's 3–7 KB — so the preview looks thin.

Real mode also sends a short system prompt (one call, one complete document, in
`files[0].code`). The tool definition alone is an offer, not a contract: without
it the model answers in prose and no version ever appears.

### What small models do to this loop

Three failure modes showed up in real turns, none of them visible to any test
over the tree, all three fixed at their own layer. Captured SSE for each is under
`.superpowers/sdd/2026-08-20-rung-4-builder/w7-evidence/`.

| What happened | Where it was fixed |
| --- | --- |
| One edit minted three versions: `gpt-4o-mini` fanned the reply into parallel `kai_artifact` calls carrying the same document | `parallel_tool_calls: false` on the request, **and** a one-version-per-turn policy in `App.tsx` that drops extras loudly |
| The page rendered visible `\n` runs: the model escaped the document a second time inside the tool argument, so `JSON.parse` handed back backslash-n pairs | `src/page-html.ts` repairs a document that has zero real line breaks and several escaped ones |
| The turn produced nothing: the model narrated the call (*"Calling the tool now."*) and stopped, or — on DeepSeek — sent file *metadata* with no `code` | `tool_choice: 'required'`, and `demandFileCode()` narrowing the derived schema so `code` is required |

The last one is the interesting one. The kit's artifact card requires only
`path` per file and documents `code` as optional ("omit for binary files"),
which is right for the card and wrong for an app whose product *is* the code.
DeepSeek read the schema literally and returned `{"path":"index.html",
"type":"html","status":"added"}` in five of six turns. The route now narrows the
derived schema rather than restating it — everything still comes from
`cardSchemas.artifact`.

## How it works

- `src/App.tsx` owns the loop: `onToolCallReady` → `isCardTool` →
  `cardFromToolCall` → the HTML out of `files[].code` → a new version, plus
  `stream.addCard` putting a compact `page-version` card in the same assistant
  turn. Its `AssistantStreamSink` swallows `upsertTool` so the raw tool panel
  does not say the same thing as the card (**F-17**).
- `src/page-version-card.ts` is the app's own generative-UI card element,
  implementing by hand the property contract the front door never states
  (**F-02**): `data` / `cardId` / `heading` / `resolution` as properties, plus
  `emitCardEvent` on click.
- `src/cards.ts` declares both card types once with `createCardRegistry`. The
  `as CardSchema` assertion is **F-04**: the schema type's own docs invite
  authored form, and its type rejects a nested `description`.
- `src/components/PreviewPanel.tsx` frames the selected version in
  `<kai-artifact>` off a `data:` URL, with the checkpoint rail, the device
  toggle and maximize.
- `server/chat.ts` + `vite-chat-api.ts` are the dev endpoint: the mock/real seam,
  the request guards, and the disconnect propagation.

## Not production

`vite-chat-api.ts` is a dev-only Vite plugin: `vite build` produces a static site
with no `/api/chat` at all (the plugin also mounts on `vite preview`, so the
built app runs locally). Shipping this means deploying `server/chat.ts`'s handler
on your own host; the kit's `kai` MCP scaffolder emits one per framework
(`npx @kitn.ai/ui mcp`).

The generated page is framed from a `data:` URL in the kit's default sandbox
(`allow-scripts allow-forms`, no `allow-same-origin`), so it runs in an opaque
origin. That a `data:` URL is a blessed `<kai-artifact>` src is stated nowhere —
**F-13**; the builder assembled it from two indirect signals and verified it in a
real browser.

## How this app was built

This app is the ladder's fourth front-door build: the application code was
written by a clean-room builder agent (Claude Opus, 134 turns, ~28 minutes) that
had never seen this repository. It worked from a packed-and-stripped
<!-- lint-cdn-pins: historical -- records the exact kit version the clean-room builder was handed; a release bump must not rewrite this run record -->
`@kitn.ai/ui@0.25.2` tarball (README, llms files and TS/TSX/CSS source removed)
plus the kit's own `kai` MCP server over stdio — and nothing else: no repo
access, no web fetches, no docs. The app it delivered **built and ran with zero
comparer fixes**, verified independently on a fresh keyless mirror.

The rung's measurement: **10 MCP calls against 37 direct package inspections**,
including nine consecutive reads of **minified bundle bytes** to recover the
custom-card property contract. The bridge itself is taught; everything on either
side of it — `onToolCallReady`, `stream.addCard`, and the whole custom-card
contract — scores zero across all ten MCP responses and zero in the shipped
`llms-full.txt`. The full run record, the builder's `NOTES.md` (15 questions,
verbatim), the delivered snapshot, the MCP call table, the artifact-seam
inventory and the graded findings live in
[`docs/superpowers/research/2026-08-20-rung-4-front-door/`](../../../docs/superpowers/research/2026-08-20-rung-4-front-door/)
(run metadata: session `6d586d73-e8cd-4aa0-869c-c00268a294dd`, prompt sha256
`7229dde70cead39d064e89b20db5939a566737793e5c56b734ef1faf30b27b43`).

**The builder's composition choices stand here unmodified**, including the ones
that are findings: the hand-built preview chrome around `<kai-artifact>` rather
than letting the element own the panel, the app's own `page-version` card type
instead of drawing the artifact envelope in the thread, the constrain-the-
container device toggle (**F-11**, the element exposes no `::part` for its
iframe, so the toolbar narrows with the page), the labels-only device segmented
control (**F-12**, no tablet/phone glyph in the icon set), the
`listenForCardEvents`-on-a-wrapper card routing (**F-03**, `<kai-chat>` has no
`policy` prop), and the non-destructive restore with per-version prompt lineage
(**F-18**, the scope boundary working).

An insider then finished the distance — corpus integration, the request guards,
the OpenRouter seam — and nothing else. Per the standing provenance policy, every
phase's complete instruction stream follows verbatim, then the named list of
every change made to the builder's code.

### Phase 1 — the front-door build (the builder's entire task prompt, verbatim)

The one and only prompt the clean-room builder received (authored to the ops dir
as `prompt.md`, sha256
`7229dde70cead39d064e89b20db5939a566737793e5c56b734ef1faf30b27b43`, verified
identical to the file launched):

````text
Build a small web app: an AI page builder. The user chats with an AI assistant in a column on the left; when they ask for a web page (for example "make me a landing page for a coffee shop"), the assistant produces a complete self-contained HTML page, and the page appears on the right in a live preview panel. The panel has a Preview/Code toggle: Preview renders the running page, Code shows its source. Asking for changes in the chat ("make the header dark") produces a new version of the page; every version is kept as a checkpoint the user can restore, and the preview shows the selected version (the latest by default). The preview panel is resizable against the chat column and can be maximized. Add a device-width toggle (desktop / tablet / mobile) that constrains the previewed page's width. Give the app a slim top bar with its name and a non-functional Publish button. Each generated page should also appear as a compact card in the conversation itself; selecting a card shows that version in the preview panel. React + TypeScript + Vite. Use the `@kitn.ai/ui` package already installed in this directory — it ships web components for AI chat UIs and React bindings. Its `kai` MCP server is configured for you: use it to learn what the package provides and how to use it. Replies should come from a local dev endpoint that streams a mocked response; the package ships facilities for mocking — discover them, including how an assistant reply can carry a generated page. Do not fetch any remote docs or read the package's source on npm/GitHub; work from the MCP and what is installed. When done: the app must build (`npm run build`) and run (`npm run dev`), and write NOTES.md recording every question you could not answer from the MCP and where you had to guess.
````

The recorded bias statement, verbatim from the run's `prompt-bias.md`:

````text
It names the product requirements a real consumer would state (split shell, preview/code, versions, device toggle, top bar, in-thread page cards) and NO kit vocabulary — not kai-artifact, not kai-resizable, not cards, tools, or blob URLs; the mock-facilities hint is carried from rungs 1–3; "including how an assistant reply can carry a generated page" is a NEW nudge — it asserts the kit has an answer to the message→page bridge, which is exactly the undriven seam, so whether the builder can FIND that answer is the measurement and the nudge only tells it to look; React bindings named as before.
````

### Phase 2 — the insider completion (this conversation, verbatim)

The insider agent (Claude Fable worker W4, dispatched by a supervisor session)
received the following dispatch message, reproduced unedited:

````text
You are W4, rung-4 Task-5 insider-completion implementer in /Users/home/Projects/kitn-ai/kitn-chat, branch rung-4/app. Writer-lock: you own examples/apps/builder, pnpm-workspace.yaml, examples/README.md, pnpm-lock.yaml — NOTHING else. Do not commit or touch the git index.

Read FIRST, in order:
1. .superpowers/sdd/2026-08-20-rung-4-builder/task-5-text.md — requirements, every checkbox binding.
2. .superpowers/sdd/2026-08-20-rung-4-builder/global-constraints.md
3. docs/superpowers/research/2026-08-20-rung-4-front-door/findings.md — the F-numbered gap catalog; every insider change you make must be labeled in the app README with the F-number/gap that made it necessary.
4. examples/apps/workspace/ (the rung-3 landing, your closest precedent — README shape, package.json shape, the /api/chat middleware with the OpenRouter seam) and examples/README.md.

Source of the app: the BUILDER'S code at /private/tmp/claude-501/-Users-home-Projects-kitn-ai-kitn-chat/fd4bf0f6-9b19-46af-aa5b-a6d03e1689e7/scratchpad/rung4-cleanroom/app/ (copy from the sandbox, NOT the research snapshot; exclude node_modules, dist, .mcp.json, any .env*). Builder code stays verbatim except your gap-labeled changes; its composition choices stand.

Context beyond the task text:
- F-10 (findings.md): the app's dev middleware has the scaffolder template's unguarded `await request.json()` — a single GET kills the Vite dev server (reviewer-reproduced twice). The task text's request-guard trio fixes this; verify with that exact repro (GET → 405, server stays alive) and say so in the README label.
- The mock stream stays verbatim (+ X-Kai-Mock header if absent, per the rung-3 shape). Real mode: OpenRouter seam reading the env key, status passthrough, in-band mid-stream error, disconnect → request.signal — mirror examples/apps/workspace's landed route.
- Real mode must carry the kit's artifact tool definition from the schemas surface (packages/ui exports ./schemas; the model-facing artifact card tool lives there — find the exact export in packages/ui/src/schemas/tool-defs.ts and import it, never restate it). If the builder's mock invented a different bridge shape, both stand; label the divergence.
- .env: for your real-mode smoke you may COPY .env from any existing examples/apps/* (it has OPENROUTER_API_KEY and the model) — but .env never lands in git; ship .env.example with the unprefixed-key comment, and confirm .gitignore covers .env.
- Ports: every 517x through 5180 may be taken — read every vite.config under examples/ and pick the next free port; state which.
- README provenance (owner policy): all phases verbatim — the builder prompt (copy from the sandbox ops/prompt.md, sha256 7229dde70cead39d064e89b20db5939a566737793e5c56b734ef1faf30b27b43), the run metadata (134 turns, ~28 min, session 6d586d73-e8cd-4aa0-869c-c00268a294dd), and your own insider brief = this dispatch (transcribe your received instructions verbatim per the ladder-apps-record-prompts policy). Check a sibling app README for the lint-cdn-pins historical waiver pattern if you quote a versioned run record.
- Verify before reporting: `pnpm --filter @kitn.ai/ui run verify:starters` green with the app enrolled; app `npm run build` exit 0 and typecheck green; keyless dev smoke (mock SSE + the guard trio 405/400/400); ONE real-mode turn that produces a page (using the copied .env) — report what the model emitted. lint:cdn-pins green if you added any version literal.

Write your full report to .superpowers/sdd/2026-08-20-rung-4-builder/task-5-report.md (include every gap-labeled change, the port, commands + outputs). Return ONLY: STATUS, port, insider-change count, verification one-liners, concerns. No subagents.
````

### Every insider change to the builder's code, named and labeled

F-numbers refer to the graded findings in
[`docs/superpowers/research/2026-08-20-rung-4-front-door/findings.md`](../../../docs/superpowers/research/2026-08-20-rung-4-front-door/findings.md).
Everything not listed here is the builder's, **verbatim** from the delivered
snapshot: the whole of `src/` (`App.tsx`, `cards.ts`, `page-version-card.ts`,
`versions.ts`, `main.tsx`, `app.css`, `components/`), `server/mock-stream.ts`,
`server/page-spec.ts`, `server/render-page.ts`, `index.html`, all three
tsconfigs, and every composition choice.

1. **`package.json` — corpus identity**: name `@kitn.ai/ui-app-builder`
   (private, version 0.0.0), the kit dep `file:…tgz` → `workspace:*`, a
   `typecheck` script (`tsc -b --pretty false`, the shape `verify:starters`
   classifies), a corpus-style description. Corpus integration — no gap.
   **Deliberately NOT changed: the builder's toolchain pins** (`vite ^8.2.2`,
   `typescript ^7.0.2`, `@vitejs/plugin-react ^6.1.0`, `@types/node ^26`,
   React 19) — the run was verified green on them, they are a major ahead of the
   corpus pins, and `verify:starters` builds the app on exactly them.
   `react`/`react-dom` stay **real dependencies**: `@kitn.ai/ui/react` resolves
   only with them installed. `@types/node` was already present — the builder put
   it in from the start, which is why rung-3's F-08 did not recur.
2. **`vite.config.ts` — fixed port 5181** for `server` and `preview` (the
   builder ran on Vite's default 5173; 5173–5176 are the starters, 5178–5180
   rungs 1–3; every `vite.config` under `examples/` was read). Plus the
   corpus-standard `workspace:*` header comment. Corpus convention — no gap.
3. **`server/chat.ts` — the request-guard trio** (**F-10**): 405 (with
   `Allow: POST`) on a non-POST, 400 on a non-JSON body, 400 on a
   missing/empty `messages` array. F-10 is not a paperwork gap: the comparer
   reproduced a single `GET /api/chat` **killing the Vite dev-server process**
   twice, on two ports, because the scaffolder's emitted block-2 route reaches
   `await request.json()` unguarded and Node 22 exits on the unhandled
   rejection. Second instance of the class — rung 3's app has the identical
   unguarded line — which is what makes it a template defect, not a builder
   one. Verified fixed with that exact repro: `GET /api/chat` → 405 and
   `GET /` → 200 immediately after.
4. **`vite-chat-api.ts` — the other two thirds of F-10, plus the seam plumbing**:
   the bridge now forwards the **real HTTP method** instead of stamping every
   request POST (without this change 3's 405 is unreachable and a GET still
   dies in `request.json()`), reads a body only where one is legal (`new
   Request` throws on GET/HEAD with a body), and wraps the whole middleware in
   a `try`/`catch` that logs and answers 500 rather than letting a rejection
   escape into the process. Also: `loadEnv(mode, root, '')` at `configResolved`
   (the unprefixed-key pattern), and an `AbortController` wired to socket close
   riding the `Request` into the handler, so a browser that hangs up mid-reply
   also hangs up on the provider. The builder's `configurePreviewServer` and its
   streaming write loop are kept.
5. **`server/chat.ts` — the OpenRouter seam**: no key → `streamMock()`, which is
   the builder's route body **verbatim** but for the extracted arguments and an
   `X-Kai-Mock: 1` header (for curls and tests; the client never reads it —
   branching there would put the seam back in the browser); key → the same
   request forwarded to OpenRouter with the provider's SSE piped back untouched,
   provider error status/body passed through (a 401 arriving as a 200 is a blank
   bubble and no error), and a mid-stream failure reported **in band** the way
   OpenRouter itself reports one. Copied from the rung-1/2/3 corpus pattern —
   not a builder gap; the clean-room task was mock-only by design.
6. **`server/chat.ts` — the model-facing artifact tool, derived** (task
   requirement): `cardTools({ artifact: cardSchemas.artifact }, { provider:
   'openai' })` from `@kitn.ai/ui/schemas`, never restated. It produces
   `kai_artifact`, which is **exactly the call the builder's mock hand-frames**
   and exactly what the client's `isCardTool` / `cardFromToolCall` recognise —
   **so there is no bridge divergence to label**; the mock and a real model put
   the same call on the wire. Only `artifact` is offered: `page-version` is the
   host's own mint (`src/cards.ts` says so). The app's registry is deliberately
   *not* imported here — `src/cards.ts` pulls in `page-version-card.ts`, a DOM
   custom element with no business in a Node process.
7. **`server/chat.ts` — `providerSafe()`, a NEW gap, proposed as F-20**: the
   derived tool as emitted is rejected by **OpenAI and Anthropic alike, in
   non-strict mode, HTTP 400**, on the artifact schema's **top-level `anyOf`**
   (`src` or `files`). Gemini accepts it. Both refusal messages are quoted at
   the site. The route drops the top-level combinator and folds its meaning into
   the description, where a model reads it anyway; every property, type and
   description stays derived. This contradicts `tool-defs.ts`'s own note that
   non-strict "is currently the only working mode" — `provider-subsets.ts` knows
   about top-level combinators, but only under `strict: true`, which throws for
   every built-in card for unrelated reasons, so nobody runs it. Re-cast input:
   this belongs in the non-strict path, or the artifact schema should express
   "one of src/files" without a top-level combinator.
8. **`server/chat.ts` — a real-mode system prompt** (real-mode requirement): one
   `kai_artifact` call, one complete document, in `files[0].code`, rebuild the
   whole page each turn from the prompt lineage the client posts. The tool
   definition alone is an offer, not a contract — without this the model answers
   in prose and no version ever appears. Kept to the facts `takeToolCall` reads.
9. **`vite-chat-api.ts` + `.env.example` — the default model is
   `openai/gpt-4o-mini`, not the corpus's `anthropic/claude-haiku-4.5`** (found
   by the real-mode smoke). OpenRouter's **streamed** `tool_calls` argument
   deltas come back as invalid JSON on its Anthropic routes — a stray `}` near
   the end, reproduced on two different prompts, both times leaving the page
   unbuildable. The same request **non-streamed** parses fine, and OpenAI's
   streamed deltas parse fine, so it is an upstream defect and not the kit's —
   but this app is nothing *but* a streamed tool call, so the corpus default
   would have shipped an app that silently never produces a page.
10. **Added `.env.example`** (the runs-with-no-key contract, the unprefixed-key
    rule, an 8000-token ceiling because a reply here carries a whole page, and
    the model note from change 9) **and `.gitignore`** (the corpus's, which
    guards `.env*`). Corpus and security conventions — no gap.
11. **Enrollment outside the app dir**: `pnpm-workspace.yaml` gains
    `examples/apps/builder` (the file lists ladder apps one by one, and
    `verify:starters` cross-checks membership against the `workspace:*` dep),
    `examples/README.md` gains the rung-4 row and the port-5181 run line, and
    `pnpm-lock.yaml` was regenerated by `pnpm install`. Corpus convention — no
    gap.
12. **Added this `README.md`** — the provenance policy itself.
