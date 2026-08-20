# Builder run record — the rung-3 front-door build

Run metadata and the complete MCP tool-call sequence, extracted from the session transcript —
**the first rung to have one** (rung 1's survived; rung 2's was destroyed by the global-umask
defect this rung's launcher fixed). Method and harness conditions:
`.superpowers/sdd/2026-08-20-rung-3/w16-report.md`; plan of record
`docs/superpowers/plans/2026-08-20-rung-3-workspace.md`.

## Run metadata

All values from `ops/run-result.json` (the `claude -p --output-format json` result object)
unless noted.

| | |
|---|---|
| Outcome | success (`is_error: false`, `subtype: "success"`, `terminal_reason: completed`, `stop_reason: end_turn`) |
| Turns | 98 |
| Wall clock | 1,210 s (`duration_ms: 1210309`; `duration_api_ms: 955328`) |
| Cost | $8.12 (`total_cost_usd: 8.124063`; $8.1228 on `claude-opus-5`, $0.0012 on a `claude-haiku-4-5` helper call) |
| Model | opus (`claude-opus-5`; same seat as rungs 1–2) |
| Claude Code CLI | 2.1.236 (the local `claude` binary, read at analysis time) |
| Task-prompt sha256 | `566133636cf00d91714974f4a127f24ab073f2e132269a71ed13c7b96678a84a` — verified by the comparer against `ops/prompt.md` |
| Session id | `d0cf3c07-b36b-4749-b7c8-0d8593107d85` |
| Output tokens | 73,322 (28,495 thinking — thinking content is not persisted in the transcript; per-call reasoning below is inferred from call order and the builder's text turns) |
| Transcript | 431 JSONL lines, 356 timestamped records, 97 tool calls |
| Transcript window | `2026-08-20T16:47:01.313Z` → `2026-08-20T17:07:11.872Z` (1,210 s — corroborates `duration_ms` independently) |
| Kit under test | `@kitn.ai/ui` 0.25.2, local `npm pack` tarball (sha256 `7bf493fe…`), stripped per W16 (src TS/TSX/CSS, README, `llms*`, `dist/llms/`, **and** `frameworks/react/*.tsx` — stricter than rung 2); `react`/`react-dom` preinstalled by the harness (the /react peer-dep condition, W16) |
| Web fetches | 0 (`web_search_requests: 0`, `web_fetch_requests: 0`) — the no-remote-docs rule held |
| Permission denials | `[]` |

## MCP tool calls — the complete sequence (8 of 97 tool calls)

Extracted by matching `tool_use` blocks named `mcp__kai__*` against their `tool_result`s.
Line numbers are 1-based into `ops/d0cf3c07-b36b-4749-b7c8-0d8593107d85.jsonl` (call line /
result line). The builder loaded the four tools in one `ToolSearch` (line 11) and called them
eight times. **Zero MCP calls errored; no wrong-argument-key call was made** — candidate A
(now a loud "unknown argument" error per W16's positive control) was not exercised, as W16
predicted.

| # | Line (call/result) | Tool | Arguments | Result size | What it delivered |
|---|---|---|---|---|---|
| 1 | 17/19 | `component_reference` | `{ name: "list" }` | 2,106 ch | The element index. Builder's next text turn (line 22): "Key components spotted: `kai-chat`, `kai-conversations`, `kai-workspace`." |
| 2 | 23/24 | `component_reference` | `{ name: "kai-chat" }` | 32,268 ch | The thread + composer element: registration, `KaiChatElement`, events, slots (`header-end` used later), invariants. |
| 3 | 25/26 | `component_reference` | `{ name: "kai-conversations" }` | 15,066 ch | The rail: `conversations` row shape (`scope` typed but unexplained), the 5-event list (no delete), `collapsed`, `kai-search`. |
| 4 | 27/28 | `scaffold` | `{ useCase: "workspace", integration: "mock", placement: "full-page", framework: "react" }` | 19,454 ch | Front end (Chat + **Artifact + Resizable** — see findings) **plus block (2): the full mock backend route** (`server/chat.ts` + `vite-chat-api.ts`), which the builder adopted near-verbatim. |
| 5 | 35/36 | `component_reference` | `{ name: "recipes" }` | 3,806 ch | The `workspace-chat` recipe: slot-the-rail-inside composition, the fixed-width caveat, the full wiring edge list — the document the builder deviated from, quoting its own caveats as the reason. |
| 6 | 65/66 | `debug` | `{ symptom: "I need a delete button on each conversation row in kai-conversations. There is no kai-conversation-delete event…" }` | 473 ch | **"No known failure pattern matched."** Fell back to pointing at `llms-full.txt` (stripped here) and a remote URL (out of scope). The delete gap got nothing from the front door. |
| 7 | 72/73 | `component_reference` | `{ name: "kai-workspace" }` | 23,641 ch | The monolith, consulted mid-deliberation and REJECTED: its `kai-search` is the composer's Globe button, not conversation search (NOTES §2). |
| 8 | 373/374 | `component_reference` | `{ name: "kai-button" }` | 12,759 ch | Called at the END, after a screenshot caught the invisible `label`-only Button — confirmed `label` is accessible-name-only ("ignored when you slot visible text"). |

## Watched-pattern coverage in MCP output

Counts of each watched one-liner class in the raw text each call returned (regex over the
`tool_result` text; `Kai*Element` = `Kai[A-Za-z]*Element`).

| Pattern | `kai-chat` | `kai-conversations` | `scaffold` | `recipes` | `kai-workspace` | `kai-button` |
|---|---|---|---|---|---|---|
| `@kitn.ai/ui/elements` | 3 | 3 | 8 | 0 | 3 | 3 |
| `Kai*Element` | 1 | 1 | 0 | 0 | 1 | 1 |
| `kai-submit` | 4 | 1 | 1 | 2 | 2 | 0 |
| `detail.value` | 0 | 0 | 1 | 2 | 0 | 0 |
| `createMockResponder` | 0 | 0 | 8 | 0 | 0 | 0 |
| `whenDefined` | 2 | 2 | 0 | 1 | 2 | 2 |
| `StreamSource` | 0 | 0 | 0 | 0 | 0 | 0 |
| `reactivity-two-halves` | 4 | 3 | 0 | 3 | 1 | 1 |
| `scope` (row field) | 0 | 1 (type literal only) | 1 | 0 | 1 | 0 |

`StreamSource` remains at zero everywhere — the rung-1 G-03 hole is still open on this surface
(this run didn't need it: the builder passed a `Response`, the documented-by-example case).

## Reads into `node_modules/@kitn.ai/ui` beyond `package.json`

The transcript audit rung 2 couldn't do. ~19 Bash calls read the installed package; per the
rung-1 precedent, the question is whether any read substituted for a fact the MCP supplies.
Verdict: **no** — every read was either verification of an MCP-supplied fact or a fact the MCP
does not carry (the state/wire lifecycle hole named at rung 1, plus the new row-semantics and
rail-behavior holes below).

| Transcript line | What it read | Why it mattered |
|---|---|---|
| 37, 42 | `ls` of the package root and `dist/` subdirs | Orientation; discovered `llms*.txt` absent (strip artifact, cf. NOTES §17). |
| 48 | `dist/state/mock.d.ts`, `dist/state/stream.d.ts`, `dist/wire/read.d.ts` | `createMockResponder` options; `SetMessages`/stream sink shapes; reader signature — the same lifecycle facts rungs 1–2 also had to read (MCP does not carry them). |
| 52, 59, 119 | `dist/react/index.d.ts` (+ `use-kai-chat.d.ts`) | `ConversationsProps` / `ChatProps` — wrapper prop and slot names (`headerEnd`), event-prop naming (`onConversationSelect`). The MCP documents elements, not the wrapper layer. |
| 63 | `dist/elements/chat-types.d.ts` | `ChatMessage` / `MessagePart` union — the storage validator's variant list. |
| 74, 81, 84, 89, 96, 125, 296, 299 | `dist/elements/chunks/conversation-list-*.js` (compiled) | **The search-semantics dig**: filter is `title.toLowerCase().includes(query)`, titles-only, not disableable; search box renders only when `conversations.length > 0`; empty state keys off the unfiltered count; `<kai-conversation>` is a marker tag, never registered (NOTES §3, §4, §14). None of this is in any MCP output or shipped doc. |
| 98 | `dist/wire/encode.d.ts` | `toOpenAIMessages` signature. |
| 104 | grep `declare function toast` | `toast()` options (`action.onAction`) for the Undo affordance. |
| 193, 199 | `dist/wire/chunk.d.ts` (`ConsumeOptions`, `ModelTurn`) | **No `signal` on `ConsumeOptions`** → cancellation must abort the fetch (NOTES §7). Same fact rung 2 dug out; still MCP-absent. |
| 203, 365 | `dist/react.js` (compiled) | How the wrapper maps props/events onto the element (the `label` dig start; `kai-chat` wrapper internals). |
| 207 | `src/elements/icon-names.json` (kept JSON) | No trash/delete icon among the 48 names (NOTES §6). |
| 225 | `dist/theme.tokens.css` | Dark values scoped under `.dark`; who toggles it is stated nowhere (NOTES §11). |

## Self-verification the builder ran (new at this rung)

Unlike rungs 1–2 the builder could and did run everything: `npm run build` (failed once on the
missing `@types/node` — line 237 — installed it and went green, line 244), `npm run dev` +
curl probes of `/api/chat` (lines 249–271), then **drove the app in headless Chrome over CDP**
(lines 273–402): screenshots, an 18-check end-to-end driver (streaming growth, switch/return
integrity, reload survival, wire-body-after-reload, search, collapse, delete + undo, console
errors), plus a typed-input composer-clear check. Two of its own harness bugs were diagnosed
honestly (the `beforeunload` flush undoing a mid-run `localStorage.clear()`; `el.value` making
the composer controlled). The screenshot pass is what caught the invisible delete button
(findings F-05).

## Build and run — verified independently by the comparer (2026-08-20)

Keyless by construction: `grep` for `process.env` / `loadEnv` / `import.meta.env` over the app
returns nothing, and no `.env*` exists in the sandbox — the mock route reads no key, so the
mirrored-app-dir precaution had nothing to isolate.

| Step | Command | Result |
|---|---|---|
| Build | `npm run build` (= `tsc -b && vite build`) | **exit 0** — strict project-references tsc green, `vite build` green (`✓ built in 2.35s`; the >500 kB register-all chunk warning, non-fatal) |
| Dev | `npx vite --port 5199` + curl | `GET /` → 200; `POST /api/chat` streams the mock's self-identifying SSE (`: kai-mock — NO PROVIDER WAS CONTACTED` banner, `_kai_mock` frames, `model: "kai-mock"`); the route logs `1 message(s) in thread` |

**Verdict: builds and runs, zero comparer fixes.** Toolchain: Vite 7.3.6 / TypeScript ~5.9 /
React 19 — the builder pinned `vite@^7` deliberately (transcript line 109), a major ahead of
the corpus apps' pins.
