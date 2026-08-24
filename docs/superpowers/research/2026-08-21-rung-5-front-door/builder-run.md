# Builder run record — the rung-5 front-door build (remote cards / ops console)

Run metadata and the complete MCP tool-call sequence, extracted from the session transcript.
Source: `ops/f760a7ef-2bf2-4d6f-a72e-b2986e5b0d26.jsonl` (2.39 MB, 746 lines). Transcript mining
only — no build/verification was run by this pass.

## Run metadata

All values verified against `ops/run-result.json` (the `claude -p --output-format json` result
object) and `ops/launch-live.log`.

| | |
|---|---|
| Outcome | success (`is_error: false`, `subtype: "success"`, `terminal_reason: completed`, `stop_reason: end_turn`) — matches the brief |
| Turns | 164 (`num_turns`) — matches the brief |
| Wall clock | `duration_ms: 2630928` = 43.8 min — matches the brief. `duration_api_ms: 2253336` = 37.6 min (API-only time, smaller as expected) |
| Cost | $22.30 (`total_cost_usd: 22.297846500000002`) — matches the brief. $22.296 on `claude-opus-5`, $0.0014 on a `claude-haiku-4-5` helper call |
| Model | `claude-opus-5` |
| Session id | `f760a7ef-2bf2-4d6f-a72e-b2986e5b0d26` — matches the brief |
| Transcript timestamps | `2026-08-21T23:43:37.445Z` (line 1) → `2026-08-22T00:27:28.493Z` (near-final line) — 43m51s, corroborates `duration_ms` independently |
| Transcript | 746 JSONL lines |
| Output tokens | 138,418 (39,972 thinking) |
| Web fetches | 0 (`web_search_requests: 0`, `web_fetch_requests: 0`) |
| Permission denials | `[]` |
| Subagents spawned | 0 |
| Kit under test | `ops/kitn.ai-ui-0.25.2.tgz` (local `npm pack` tarball) |

All four headline numbers in the brief (164 turns, $22.30, 43.8 min, session id, end_turn) check
out against the artifacts.

## Prompt

`ops/builder-prompt.md` sha256: `f9ff4c8debdaf0839eaf4a5f8caccf97da5616f06b68e599af36b618da5b4b3c`

This matches:
- `ops/prompt.sha256` (the recorded hash, `f9ff4c8d...b618da5b4b3c`) exactly.
- `ops/launch-live.log`, which records the same hash against `ops/prompt.md`.
- `ops/prompt.md` is byte-identical to `ops/builder-prompt.md` (`diff` returns no output).

## MCP tool calls — the complete sequence (13 calls)

Extracted by matching `tool_use` blocks named `mcp__kai__*` against their `tool_result`s — one
`tool_use` per JSONL line, 13 lines matched. Line numbers are 1-based into
`ops/f760a7ef-2bf2-4d6f-a72e-b2986e5b0d26.jsonl` (call line / result line). No `ToolSearch`
tool_use for the MCP tools was found by name-grep in this transcript (the tools were evidently
already loaded/declared at session start, unlike rung 4's explicit `ToolSearch` line). **Zero MCP
calls errored** (all returned normal result payloads); **3 of the 5 `debug` calls returned "No
known failure pattern matched."** By tool: 7 `component_reference` (incl. `recipes` looked up
twice), 5 `debug`, 1 `scaffold`.

| # | Line (call/result) | Tool | Arguments | Result size | What it delivered |
|---|---|---|---|---|---|
| 1 | 16/18 | `component_reference` | `{ name: "list" }` | 1,990 ch | The element index (82 elements). |
| 2 | 22/24 | `component_reference` | `{ name: "kai-chat" }` | 31,870 ch | Thread + composer reference. |
| 3 | 23/25 | `component_reference` | `{ name: "kai-remote" }` | 8,176 ch | `kai-remote` is opt-in — not covered by `import '@kitn.ai/ui/elements'`; needs its own entry point or it silently never upgrades (no error/warning). |
| 4 | 32/34 | `component_reference` | `{ name: "recipes" }` | 3,842 ch | The 2-recipe catalog (`workspace-chat`, wiring notes). |
| 5 | 39/40 | `component_reference` | `{ name: "kai-confirm" }` | 17,029 ch | The confirm-card element reference. |
| 6 | 41/42 | `debug` | `{ symptom: "…serve a card from a second local origin and render it with kai-remote… how does @kitn.ai/ui/provider work…" }` | 442 ch | **"No known failure pattern matched."** |
| 7 | 50/51 | `debug` | `{ symptom: "…listen for kai-card event when a user clicks approve on a confirm card… undo of a dismissed card?" }` | 1,740 ch | Matched: "Dismissed cards are DEFERRED (a reopenable stub), not deleted." |
| 8 | 54/55 | `component_reference` | `{ name: "kai-cards" }` | 13,094 ch | `kai-cards` registration + policy prop location. |
| 9 | 63/64 | `scaffold` | `{ integration: "mock", placement: "full-page", framework: "react", components: ["kai-chat","kai-confirm","kai-choice","kai-form","kai-tasks","kai-remote","kai-resizable"], suggestions: [...] }` | 20,578 ch | Front end + mock backend for the 7-component combo, adopted as the app's starting point. |
| 10 | 74/75 | `debug` | `{ symptom: "createMockResponder… how do I make the mocked reply include tool calls so the assistant emits kai_confirm / kai_tasks cards…" }` | 442 ch | **"No known failure pattern matched."** |
| 11 | 102/103 | `debug` | `{ symptom: "Cards render inside kai-chat but my onAction handler never fires. kai-chat has no policy prop — where do I attach the CardPolicy…" }` | 442 ch | **"No known failure pattern matched."** |
| 12 | 630/632 | `debug` | `{ symptom: "…clicking Approve on a confirm card fires no kai-card event anywhere — not on kai-chat, not on document. listenForCardEvents… never fires…" }` | 2,505 ch | Matched: events are non-bubbling CustomEvents — listen on the `kai-*` element directly, not `document`/`window`. |
| 13 | 631/633 | `component_reference` | `{ name: "recipes" }` | 3,842 ch | Re-checked the recipe catalog near the end of the run. |

13 rows = 13 MCP tool calls (7 `component_reference`, 1 `scaffold`, 5 `debug`).

## Package-read audit

**Zero `Read`-tool calls touched `node_modules/@kitn.ai/ui`** — all 3 `Read` tool_use calls in
the transcript targeted the app's own `src/App.tsx` (lines 490, 727) and a screenshot PNG (line
697). Every direct package inspection happened through `Bash` (`cat`/`node -e`/`grep`/`ls`).

Of 90 total `Bash` tool_use calls, **36 touched `@kitn.ai/ui` package content or paths**
(orientation `ls`/version checks included). Breakdown:

| Category | Calls | Lines |
|---|---|---|
| Orientation (`ls dist/*`, `package.json`+`.mcp.json` cat, version/exports probe) | 4 | 15, 31, 56, 65 |
| `.d.ts` reads (substantive — type surfaces, not bundle bytes) | 17 | 72, 79, 83, 89, 93, 95, 104, 108, 125, 132, 134, 137, 168, 297, 329, 354, 358 |
| JSON schema reads (`dist/schemas/*.schema.json`) | 1 | 139 |
| **Minified `dist/*.js` bundle reads (by byte offset / `indexOf`+`slice`)** | 14 | 115†, 146†, 150, 154, 214, 220, 223, 320, 325, 544, 548, 609†, 623†, 666 |

† = line mixes a `.d.ts` grep with a bundle grep/read in the same call (counted once here, noted
in both categories in raw form).

**Notable repeated bundle digs (same file, multiple slices in separate calls):**
- `dist/wire.js`, three separate calls (214, 220, 223) — hunting `openaiChatFormat` then a
  minified local (`Qt =`) by `indexOf`+`slice` around the found offset.
- `dist/react.js`, four separate calls (320, 325, 544, 548) — `useKaiChat` internals, then a
  batch of minified local names (`at =`, `nt =`, …), then two more re-reads of the file head.
- `dist/primitives/card-validate-cards.d.ts` read twice back-to-back (354, then 358 retries with
  a `cd ... 2>/dev/null || cd ...` fallback — looks like a path miss on the first attempt that
  the second call papered over rather than diagnosed).
- `dist/kai-provider.es.js` — one call (154) `cat`s the **entire file** (`wc -c` first, then
  `cat`), not a slice.

Excluded from the 36 (present but not package-content reads): line 174 (`ls node_modules` +
`node -v`/`npm -v`, environment only), line 191 (versions of `vite`/`@vitejs/plugin-react`/
`typescript`/`react`, not `@kitn.ai/ui`), line 739 (`pkill` + a `find` over the app tree
excluding `node_modules`, end-of-run cleanup).

## Ratio + timeline

**13 MCP calls vs. 36 direct package inspections — roughly a 1:2.8 ratio**, similar in shape to
rung 4's 10:37 (roughly 1:3.7), and the inverse of what the MCP front door is supposed to
deliver.

Timeline (transcript timestamps, session starts `23:43:37.445Z`):

| Phase | Lines | Window | What happened |
|---|---|---|---|
| MCP burst | 16 → 103 | 23:43:48 → 23:44:52 (~1 min for calls) through the `debug` miss at 23:44:52-ish | All but the last 2 of the 13 MCP calls fire in the first ~100 lines — `list`, `kai-chat`, `kai-remote`, `recipes`, `kai-confirm`, two `debug` misses/hits, `kai-cards`, `scaffold`, two more `debug` misses. |
| Direct package dig begins | 104 → 666 | 23:45:14 → 00:20:45 (~35 min) | Immediately after the third `debug` "no pattern matched" (line 102/103, ~23:44:52), the builder pivots to `.d.ts` and minified-bundle reads and **stays there for the bulk of the run** — `.d.ts` reads for `remote`, `state`, `wire`, `schemas`, `react`, card primitives; then bundle-byte digs into `wire.js`, `react.js`, `remote.js`, `kai-provider.es.js`, and the card-routing/resolution chunks. |
| Late MCP check-back | 630 → 633 | 00:17:38 → 00:17:52ish | One more `debug` call (this one *matched* — the non-bubbling-events cause) and one more `recipes` lookup, sandwiched inside the bundle-digging phase (609 and 623/666 are bundle reads immediately before/after this pair) rather than a clean return to the MCP. |
| Wrap-up | 697 → 746 | 00:23:20 → 00:27:28 | Screenshot read, App.tsx re-reads, process cleanup, final turn. |

**Where the builder gave up on the MCP:** the third consecutive `debug` miss, at transcript line
102/103 (~23:44:52Z, roughly turn 20 of 164 by line-position, ~1 minute into a 44-minute run).
All three misses concerned exactly the mechanism the app needed most — how a card's approve/
dismiss action reaches the host from inside `kai-chat`, and how `kai-remote` talks back across
origins — and `debug` had no pattern for either. From that point on the builder answered those
questions itself by reading `.d.ts` files and slicing minified bundle bytes, the same pattern
rung 4 found with its `kai_artifact` tool-call bridge. It circled back to the MCP exactly once
more late in the run (line 630) once a bundle dig had already surfaced enough of the answer to
phrase a `debug` symptom precisely — and that one hit, suggesting the pattern DB has partial
coverage of the non-bubbling-events fact but nothing on card-verb wiring through `kai-chat` or
the `kai-remote` cross-origin bridge itself.
