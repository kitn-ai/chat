# Builder run record — the rung-6 front-door build (compose your own thread)

Run metadata, the complete MCP call sequence, the direct-read audit and the
setup record, from the stream-json transcript (`builder-transcript.txt`, 201
JSONL lines) and the launch artifacts. Written by the setup orchestrator; the
builder's own gap record is `NOTES.md` (verbatim beside this file).

## Run metadata

| | |
|---|---|
| Outcome | success (`subtype: "success"`, `is_error: false`, `stop_reason: end_turn`) |
| Turns | 44 (`num_turns`) — of a 150-turn allowance |
| Wall clock | `duration_ms: 374286` = 6.24 min (launch-start 2026-08-25T12:16:34Z → launch-end 12:22:49Z, exit 0) |
| Cost | $3.59 (`total_cost_usd: 3.59176`) — `claude-opus-5[1m]` + one `claude-haiku-4-5` helper call |
| Session id | `ca9e799f-3e0b-44f3-8c23-c900a54d324e` |
| Output tokens | 23,756 (5,463 thinking) |
| Permission denials | 0 (plain `claude -p`, default permissions — NOT `--dangerously-skip-permissions`) |
| Web fetches | 1 — `https://ui.kitn.ai/llms-full.txt` (a sanctioned doc surface) |
| Subagents | 0 |
| Kit under test | `kitn.ai-ui-0.26.0.tgz`, local `npm pack` off `main` @ `9b21f3d4`, sha256 `6f7ff0ffb5d00a05d9d9edcb31d1fc7ce8d5f3ee27dd9d964258b942e16e2428` |
| Prompt | `builder-prompt.md`, sha256 `1a78d9e937cbe47fa8f3d686bc4c530aef7f6a1013b6f6d680ef01ce8d6bbfd2`, no follow-up prompts |

## Setup (the gate, and the clean room)

- Gate on the artifact packed: `nx build ui --skip-nx-cache` green (a stale NX
  daemon resolving into an old worktree's node_modules had to be stopped
  first), then `verify:fresh` green — 2 artifacts newer than all 739 scanned
  sources.
- Clean room: `/private/tmp/rung6-clean-room/` — outside the repo, no CLAUDE.md
  in any ancestor (checked `/`, `/private`, `/private/tmp`, the dir itself).
  The tarball was pre-installed (`npm install` of a `file:` dep), matching the
  prior rung's "already installed in this directory" setup.
- MCP: `.mcp.json` → `node node_modules/@kitn.ai/ui/bin/mcp.js` (the installed
  tarball's bin, not the repo's), probed over stdio before launch (serverInfo
  `@kitn.ai/ui 0.26.0`). Launched with `--mcp-config .mcp.json
  --strict-mcp-config --allowedTools mcp__kai__component_reference,
  mcp__kai__scaffold,mcp__kai__theme,mcp__kai__debug` so no other MCP server
  leaked in.
- **Contamination caveats, both environmental and recorded rather than
  controlled:** (1) the launching user's global `~/.claude/CLAUDE.md`
  (supervisor-mode process instructions — none of the kit's invariants) is
  inherited by any `claude` session for this user; (2) a global SessionStart
  hook injected the "superpowers" skill intro into the builder session. Neither
  carries kit API facts; the project CLAUDE.md — the thing the clean-room rule
  exists to exclude — was not present.

## MCP tool calls — the complete sequence (13 calls)

Line numbers are 1-based into `builder-transcript.txt`. 10 `component_reference`,
1 `scaffold`, 2 `debug`, 0 `theme`. Zero MCP calls errored; **both `debug`
calls returned "No known failure pattern matched."**

| # | Line | Tool | Arguments |
|---|---|---|---|
| 1 | 18 | `component_reference` | `{ name: "list" }` |
| 2 | 26 | `component_reference` | `{ name: "kai-thread" }` |
| 3 | 31 | `component_reference` | `{ name: "kai-composer" }` |
| 4 | 32 | `component_reference` | `{ name: "kai-attachments" }` |
| 5 | 38 | `component_reference` | `{ name: "recipes" }` |
| 6 | 40 | `component_reference` | `{ name: "kai-message" }` |
| 7 | 48 | `scaffold` | `{ components: ["kai-chat","kai-tool","kai-attachments"], framework: "html", integration: "mock", placement: "full-page" }` |
| 8 | 49 | `component_reference` | `{ name: "kai-conversation-item" }` |
| 9 | 56 | `component_reference` | `{ name: "kai-feedback-bar" }` |
| 10 | 58 | `component_reference` | `{ name: "kai-toast-region" }` |
| 11 | 63 | `debug` | how does a user attach a FILE when composing with kai-thread + kai-composer (not kai-chat)? → **no pattern matched** |
| 12 | 65 | `debug` | `createMockResponder` exact signature / options / tool-call support? → **no pattern matched** |
| 13 | 72 | `component_reference` | `{ name: "kai-file-upload" }` |

The two misses are exactly the two mechanisms this rung is about — composer
attachments and the mock's tool calls — repeating rung 5's shape (its three
`debug` misses were the two mechanisms *that* rung was about). **And the miss
text itself instructs the agent to read the package directly**: "Check the
Streaming recipe in `llms-full.txt` (`node_modules/@kitn.ai/ui/...`)" — the
MCP's own fallback advice points out of the front door.

## Direct-read audit

Of 26 `Bash` calls and 1 `Read`, **12 touched `@kitn.ai/ui` package content**
(the `Read` was the builder's own screenshot; two further matches were writes
of the app's own files that merely mention the kit):

| Category | Calls | Lines |
|---|---|---|
| Orientation + README (`ls`, `package.json`, `cat README.md` — the README is a sanctioned doc; reading the installed copy is the natural way to read it) | 3 | 8, 17, 24 |
| `llms-full.txt` greps (the shipped copy of the doc it had just WebFetched) | 2 | 83, 90 |
| **`dist/*.d.ts` reads** (`state/index`, `state/mock`, `state/stream`, `wire/read`, `wire/chunk` ×2, `dist/index`+`elements` for `AttachmentData`/`ToastItem`) | 7 | 106, 113, 118, 120, 122, 127, 141 |
| Minified `dist/*.js` bundle reads | **0** | — |

**Ratio: 13 MCP calls vs 7 substantive out-of-bounds reads (~1.9:1 in the
MCP's favor)** — the inverse of rung 5's 13:36 (≈1:2.8) and rung 4's 10:37.
Two shifts explain it: `component_reference` answered the element-surface
questions (10 lookups, no follow-up digging on any element), and the shipped
`llms-full.txt` absorbed digging that previously hit bundle bytes. What still
forced `.d.ts` reads is a coherent cluster: **the programmatic layer** —
`createMockResponder`'s options/`toolCalls`, `AssistantStream`'s methods,
`ModelTurn`/`ModelToolCall`, `AttachmentData`/`ToastItem` — none of it covered
by `component_reference` (element-shaped), `recipes` (2 recipes, both built on
`kai-chat`), or `debug`. The builder flags the same three shapes itself in
NOTES.md §5.

## Timeline

| Phase | Lines | What happened |
|---|---|---|
| MCP burst | 8–72 | Orientation, README, then 13 MCP calls: index, the six named elements, recipes, one scaffold (adopted as a wiring reference only — the emitted page is `kai-chat`-based, which the brief forbids), the two `debug` misses, one speculative `kai-file-upload` lookup |
| Sanctioned-doc dig | 77–90 | WebFetch `ui.kitn.ai/llms-full.txt`, then greps over the shipped copy |
| `.d.ts` dig | 106–141 | The programmatic-layer shapes above — the pivot follows the two `debug` misses, same as rung 5's pivot followed its third miss |
| Build + write | 144–160 | `src/main.ts`, `index.html`, styles, tsconfig; `npm run build` |
| Self-verification | 162–195 | Installed Playwright itself, drove its own app headless (file attach round-trip included), hit one ESM-resolution error running the script from `/tmp` (recovered by copying it into the app dir — the run's only tool error), then **uninstalled Playwright and deleted the smoke script** before writing NOTES.md |
| Wrap-up | 195–201 | NOTES.md, final report |

## Independent verification (setup orchestrator, after the run)

- Clean rebuild: `rm -rf dist && npm run build` — tsc + vite green.
- Playwright smoke in real Chromium (`smoke/smoke.mjs` beside this file),
  **22/22**: all 7 elements registered + in the DOM · no `<kai-chat>` · a sent
  message streams (assistant text length sampled strictly growing mid-stream,
  0→209 chars) · the mock reply renders (shadow-DOM text walk) · a picked file
  stages in `kai-attachments` · the sent user message's `parts` carry
  `{ type: 'file', attachment: { filename: 'smoke-fixture.txt', mediaType:
  'text/plain', url: 'blob:…' } }` · the filename renders in the thread · the
  staging tray clears · turn 3's `search_docs` tool call renders
  `output-available` · zero page/console errors. Screenshots
  `smoke/smoke-1…5.png`.
- Three of the smoke's first-run failures were **probe defects, not app
  defects** (host `innerText` does not see shadow DOM; the tool part nests its
  state under `.tool`), fixed in the probe and re-run — recorded because a
  checker wrong about shadow DOM is exactly the class this repo's
  checks-that-prove-nothing lesson names.

## Observations (the measurement — factual, for grading later)

1. **The front door held for elements, not for the programmatic layer.** Every
   element question was answered by `component_reference` and stayed answered.
   Every forced guess in NOTES.md (12 of them) is either behavioral glue the
   docs don't state (who resolves a tool call, who owns object-URL lifecycle,
   how a lone `kai-conversation-item` is selected, where the composer sits) or
   a `/state` / `/wire` type shape reachable only via `.d.ts`.
2. **`kai-composer` has no attachment affordance** — no prop, no button, no
   `attachments` on its `kai-submit` detail (only `kai-prompt-input`/`kai-chat`
   have that). The builder hand-built the paperclip + hidden input + staging
   tray around it. Composition finding, per NOTES.md §1.
3. **`createMockResponder` is undocumented in every sanctioned surface** —
   present only as one line of scaffold output; its options and `toolCalls`
   support (the thing the brief advertised) required `dist/state/mock.d.ts`.
   NOTES.md §5–§7.
4. **`debug`'s no-match fallback recommends reading the package** (`llms-full.txt`
   under `node_modules`). Either the advice is legitimate — in which case the
   shipped `llms-full.txt` should count as a sanctioned surface and the MCP
   should say so — or the fallback undermines the front door it fronts.
5. **`recipes` still has nothing for a hand-composed thread** — both recipes
   build on `kai-chat`; `kai-thread`'s only slot is `empty`, and nothing states
   the thread/composer layout contract. NOTES.md §9. Same class as rung 3's
   sidebar-composition gap.
6. **The scaffold could not express the brief** — asked for a no-`kai-chat`
   composition, the builder still had to request a `kai-chat`-based scaffold
   and use it only as wiring reference.
7. The builder **self-verified with real browser automation unprompted**, and
   cleaned up after itself (uninstalled Playwright, deleted its smoke script) —
   the delivered tree is exactly the app.
8. Scale check: 44 turns / 6.2 min / $3.59 against rung 5's 164 / 43.8 / $22.30
   — a much smaller rung, consistent with mock-only and no cross-origin leg.

## Files in this record

| File | What |
|---|---|
| `builder-prompt.md` + `prompt.sha256` | The brief, verbatim, and its recorded hash |
| `builder-transcript.txt` | Full stream-json transcript (201 lines) |
| `NOTES.md` | The builder's own gap record, verbatim |
| `app/` | The delivered app (source; no node_modules/dist), plus the provenance README written into it |
| `smoke/` | The independent smoke script, its 22/22 output, and 5 screenshots |
| `launch-start.txt` / `launch-end.txt` | Wall-clock bounds and exit code |
