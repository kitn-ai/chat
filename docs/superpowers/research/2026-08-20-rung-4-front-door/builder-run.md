# Builder run record — the rung-4 front-door build (AI page builder)

Run metadata and the complete MCP tool-call sequence, extracted from the session transcript.
Companions: `findings.md` (the classification + the artifact-seam inventory), `NOTES.md` (the
builder's own 15 questions, verbatim), `app/` (the delivered source). Plan of record:
`docs/superpowers/plans/2026-08-20-rung-4-builder.md`; spec
`docs/superpowers/specs/2026-08-20-rung-4-builder-design.md`.

## Run metadata

All values from `ops/run-result.json` (the `claude -p --output-format json` result object)
unless noted.

| | |
|---|---|
| Outcome | success (`is_error: false`, `subtype: "success"`, `terminal_reason: completed`, `stop_reason: end_turn`) |
| Turns | 134 |
| Wall clock | 1,687 s (`duration_ms: 1686511`; `duration_api_ms: 1490869`) |
| Cost | $16.34 (`total_cost_usd: 16.336838`; $16.3355 on `claude-opus-5`, $0.0014 on a `claude-haiku-4-5` helper call) |
| Model | opus (`claude-opus-5`; same seat as rungs 1–3) |
| Task-prompt sha256 | `7229dde70cead39d064e89b20db5939a566737793e5c56b734ef1faf30b27b43` — verified by the comparer against `ops/prompt.md` |
| Session id | `6d586d73-e8cd-4aa0-869c-c00268a294dd` |
| Output tokens | 113,172 (37,509 thinking — thinking content is not persisted in the transcript; per-call reasoning below is inferred from call order and the builder's text turns) |
| Transcript | 607 JSONL lines, 493 timestamped records, 133 tool calls |
| Transcript window | `2026-08-21T02:47:38.454Z` → `2026-08-21T03:15:45.215Z` (1,687 s — corroborates `duration_ms` independently) |
| Kit under test | `@kitn.ai/ui` 0.25.2, local `npm pack` tarball, stripped per the harness (src TS/TSX/CSS, `README.md`, `llms*`, `dist/llms/`, `frameworks/react/*.tsx`) |
| Web fetches | 0 (`web_search_requests: 0`, `web_fetch_requests: 0`) — the no-remote-docs rule held |
| Permission denials | `[]` |

**Tarball file count is not a finding.** The tarball under test carries 880 files against rung
3's 873; the tree moved between rungs. This is not a strip difference and is not filed as one.

### Phase timeline (transcript timestamps)

| Phase | Lines | Window | Elapsed |
|---|---|---|---|
| Discovery (MCP + package inspection) | 9 → 197 | 02:47:41 → 02:53:48 | ~6.1 min |
| Authoring (server generator, config, client) | 197 → 452 | 02:53:48 → 03:05:50 | ~12.0 min |
| Verification (node probe, headless Chrome ×5) | 452 → 575 | 03:05:50 → 03:13:13 | ~7.4 min |
| NOTES + final clean build/dev | 575 → 606 | 03:13:13 → 03:15:45 | ~2.5 min |

## Tool-call census

| Tool | Calls |
|---|---|
| `Bash` | 72 |
| `Edit` | 23 |
| `Write` | 20 |
| `mcp__kai__component_reference` | 8 |
| `Read` | 7 |
| `mcp__kai__scaffold` | 1 |
| `mcp__kai__debug` | 1 |
| `ToolSearch` | 1 |
| **Total** | **133** |

**10 MCP calls against 37 direct inspections of the installed package.** That ratio is the
single most legible number in the run and it is the inverse of what the front door is for. Rung
3's comparable count was ~19 package reads against 8 MCP calls, and its verdict was that no read
substituted for a fact the MCP supplies. **This rung's verdict is the opposite** — see
`findings.md` F-01/F-02 and the table below.

## MCP tool calls — the complete sequence (10 of 133 tool calls)

Extracted by matching `tool_use` blocks named `mcp__kai__*` against their `tool_result`s. Line
numbers are 1-based into `ops/6d586d73-e8cd-4aa0-869c-c00268a294dd.jsonl` (call line / result
line). The builder loaded the four tools in one `ToolSearch` (line 11) and called them ten
times. **Zero MCP calls errored; no wrong-argument-key call was made.**

| # | Line (call/result) | Tool | Arguments | Result size | What it delivered |
|---|---|---|---|---|---|
| 1 | 15/16 | `component_reference` | `{ name: "list" }` | 1,990 ch | The element index (82 elements). |
| 2 | 21/22 | `component_reference` | `{ name: "kai-chat" }` | 31,870 ch | Thread + composer: registration, events, slots, `cardTypes`/`cardSchemas`, **and the card loop** (`isCardTool`, `cardFromToolCall`, `kai_<type>`, `cardTools`). The single most load-bearing call in the run. |
| 3 | 30/32 | `component_reference` | `{ name: "kai-artifact" }` | 27,860 ch | The viewer: `files`/`src`/`tab`/`displayUrl` (5 mentions), the generated `kai_artifact` tool definition, the same card-loop paragraph. |
| 4 | 31/33 | `component_reference` | `{ name: "kai-checkpoint" }` | 8,166 ch | The checkpoint button and its `kai-select` event. |
| 5 | 39/41 | `scaffold` | `{ components: ["kai-chat","kai-artifact","kai-resizable","kai-segmented","kai-checkpoint"], integration: "mock", placement: "full-page", framework: "react", suggestions: [...] }` | 19,557 ch | **The components axis, not `useCase`** — see F-07. Front end (unwired `Artifact` + bare `Segmented` + bare `Checkpoint`) plus block (2), the mock backend route, which the builder adopted near-verbatim. |
| 6 | 40/42 | `component_reference` | `{ name: "kai-resizable" }` | 11,302 ch | `maximizedIndex` ("null = none"), `kai-maximize-change` detail shape, `maximize()`/`restore()`. |
| 7 | 49/50 | `component_reference` | `{ name: "recipes" }` | 3,842 ch | The 2-recipe catalog. `workspace-chat` **promises** "assistant replies can open artifacts in a resizable side panel" and its wiring edge list has no message→artifact edge (F-14). |
| 8 | 60/61 | `debug` | `{ symptom: "…how do I make the mocked assistant reply emit a kai_artifact tool call so a card renders in the thread?" }` | 442 ch | **"No known failure pattern matched."** Pointed at a stripped file and a forbidden URL. Second rung running (F-06). |
| 9 | 76/77 | `component_reference` | `{ name: "kai-cards" }` | 13,094 ch | `createCardRegistry`, the `policy` prop — **on `kai-cards`, not on `kai-chat`** (F-03). |
| 10 | 78/79 | `component_reference` | `{ name: "kai-segmented" }` | 8,816 ch | The device-toggle control's real props. |

## Watched-pattern coverage in MCP output

Counts of each watched identifier in the raw text each call returned. Columns are the ten calls
in order. The **llms** column is the count in the real (unstripped) `package/llms-full.txt` read
out of the tarball — the strip check, so nothing below is mis-filed as a strip artifact.

| Pattern | 1 list | 2 chat | 3 artifact | 4 checkpt | 5 scaffold | 6 resizable | 7 recipes | 8 debug | 9 cards | 10 segmented | llms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `cardFromToolCall` | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `isCardTool` | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `createCardRegistry` | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `kai_artifact` | 0 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `cardTypes` | 1 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| `cardSchemas` | 1 | 5 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| `displayUrl` | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| **`onToolCallReady`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **`ModelToolCall`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **`addCard`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **`emitCardEvent`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **`listenForCardEvents`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **`routeCardEvent`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **`CARD_EVENT_NAME`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `AssistantStreamSink` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `MOCK_MARKER` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `createMockResponder` | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| `createAssistantStream` | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| `readOpenAIStream` | 0 | 3 | 2 | 2 | 5 | 2 | 1 | 0 | 2 | 2 | — |
| `maximizedIndex` | 0 | 1 | 1 | 0 | 0 | 3 | 1 | 0 | 0 | 0 | — |
| `CardPolicy` | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | — |

The bolded rows are the ones that matter: **every identifier the message→page bridge is actually
built out of scores zero across the entire front door AND zero in the shipped `llms-full.txt`.**
`cardFromToolCall` is taught; where the `call` comes from and how the resulting envelope reaches
the thread is not. See F-01/F-02.

## Reads into `node_modules/@kitn.ai/ui` beyond `package.json` — 37 calls

The question, per the rung-1 precedent, is whether any read substituted for a fact the MCP
supplies. **This rung: yes, repeatedly, and one cluster of ten calls read MINIFIED BUNDLE
BYTES.**

| Transcript line | What it read | Why it mattered |
|---|---|---|
| 17, 23, 51 | package root, `dist/` listing, exports map | Orientation; `llms*.txt` absent (strip artifact, cf. NOTES). |
| 54, 56 | `dist/state/index.d.ts` (+ sibling) | `createMockResponder` options (`replies`/`delayMs`/`chunkSize`/`announce`) and the `MOCK_*` constants — **F-05**: the mock facility the prompt pointed at, documented nowhere in the front door. |
| 62 | `dist/wire/read.d.ts`, `dist/wire/index.d.ts` | **`onToolCallReady`, `ModelToolCall`, `AssistantStreamSink`** — the streaming half of the bridge. **F-01.** |
| 69 | `llms.txt` check + stream types | Confirmed the stripped docs, then went back to `.d.ts`. |
| 85, 105, 111 | `dist/primitives/card-contract.d.ts`, `dist/schemas/registry.d.ts`, `dist/primitives/card-tags.d.ts`, `card-renderer.d.ts` | The registry/tag mapping and the `CustomCardSpec` shape (leads to **F-04**). |
| 90, 97, 101, 160, 167, 171, 288 | `dist/react/index.d.ts`, `dist/react.js` | Wrapper prop/event names; **confirmed `ChatProps` has no `policy`** (**F-03**). The MCP documents elements, not the wrapper layer. |
| **115, 119, 122, 126, 132, 137, 141, 145, 152** | `dist/kai.es.js`, `dist/elements/cards.js`, `dist/elements/card.js`, `dist/elements/chunks/define-*.js`, `chunks/card-routing-*.js` — **by byte offset (`s.slice(1500,2766)`)** | **The custom-card-contract dig.** Recovered that the kit assigns `data` / `cardId` / `heading` / `resolution` as properties, plus a `theme` attribute and `data-card-id`. Nine consecutive calls slicing minified output. **F-02.** |
| 156 | `dist/state.js` around `kai-mock` | Reverse-engineered the mock frame envelope so hand-built tool-call frames match it. **F-05.** |
| 175, 178 | `dist/wire/encode.d.ts` | `toOpenAIMessages` signature. |
| 259, 263, 270 | `dist/theme.tokens.css` | Token names; `.dark` scope — who toggles it is stated nowhere (**F-15**, identical to rung-3's NOTES §11). |
| 299, 302 | `src/elements/icon-names.json` (kept JSON, survived the strip) | No tablet/phone glyph among the names (**F-12**). |
| 323 | `BadgeProps`, `toast` export | Top-bar chrome. |
| **391, 395** | `dist/index.d.ts`, `dist/primitives/card-routing.d.ts` | **`CARD_EVENT_NAME` / `emitCardEvent` / `routeCardEvent` / `listenForCardEvents`** — public root exports found only here. **F-02.** |
| 595 | Final clean `npm run build` + `npm run dev` | Self-verification. |

## Self-verification the builder ran

Real, and more of it than any prior rung. A Node-side read-path probe (line 452: drove
`readOpenAIStream` + `cardFromToolCall` against the live `/api/chat`), then **five headless
Chrome drivers** over `puppeteer-core` against the local Chrome (installed `--no-save`, pruned
afterwards at line 591), against both `npm run dev` and `npm run preview`: shell smoke (469),
a no-card diagnosis (473), the full end-to-end driver (480), a maximize-geometry probe (487),
screenshots (523), typing/composer/suggestions/section-edits (536), and restore-then-branch
(587).

Two honest details worth recording:

- **The `cards: 0` scare at line 477 was the probe's own bug, not the app's.** The message
  already showed `parts: ["text","card"]` and `customElements.get()` returned defined; the probe
  simply could not see into the shadow root. Line 480 introduces a `deepQueryAll` helper and the
  card is found. **Not filed as a finding.**
- **The builder found a real bug of its own** at line 495: `versionsRef.current = versions`
  assigned during render. Replaced with explicit ref writes at each mutation site (the shape
  that ships, `App.tsx:33-37`).

## Build and run — verified independently by the comparer (2026-08-20)

Keyless by construction: no `.env*` exists in the sandbox and `grep` for `process.env` /
`import.meta.env` / `loadEnv` across `src/`, `server/` and the root `.ts` files returns nothing.
The precaution was taken anyway: a **mirrored app dir excluding `.env*`, `node_modules`, `dist`
and the lockfile**, with the tarball copied to the same relative `../ops/` path the manifest
pins, then a fresh `npm install` (134 packages, 8 s).

| Step | Command | Result |
|---|---|---|
| Install | `npm install` in the mirror | exit 0, 134 packages |
| Build | `npm run build` (= `tsc -b && vite build`) | **exit 0** — strict project-references tsc green under **TypeScript 7.0.2**; `vite build` green under **Vite 8.2.2** (`✓ built in 449 ms`; the >500 kB `register-impl` chunk warning, non-fatal) |
| Dev | `npx vite --port 5311` | Server up; `MOCK_BANNER` printed to the terminal (`kai-mock — NO PROVIDER WAS CONTACTED`) |
| Dev route | `GET /` | **200** |
| Dev route | `POST /api/chat` with a coffee-shop prompt | **26,855 bytes of SSE**: the `: kai-mock` banner comment, `_kai_mock`-marked content deltas with `model: "kai-mock"`, **one `kai_artifact` tool call streamed in argument chunks**, a `finish_reason: "tool_calls"` frame with all-zero usage, then `data: [DONE]` |

**Verdict: builds and runs, zero comparer fixes to make it do so.** Toolchain note: the builder
pinned **Vite 8 / TypeScript 7** — a major ahead of rung 3's Vite 7 / TS 5.9 — and the kit's
shipped `.d.ts` compiled clean under the TS 7 native compiler.

**One failure-path probe was NOT green, and it is a finding, not a build failure:** a single
`GET /api/chat` **kills the dev-server process**. Reproduced twice on a fresh port. Root cause is
the scaffolder's block-2 template, adopted near-verbatim. See F-10.
