# Seam Inventory — rung-5 front door (2026-08-22)

Source: clean-room app snapshot at `app/` in this directory (copied from the rung-5
remote-cards sandbox; see `NOTES.md`). Every authored line in `src/`, `board/`,
`server/`, `plugins/`, `shared/` classified against whether it bridges
MODEL → CARD ENVELOPE → THREAD → RUN BOARD → WIRE-BACK ("the seam"), or is
unrelated UI chrome / config / generic transport plumbing ("zero-seam"). Files
outside those five directories (`package.json`, `vite*.config.ts`,
`tsconfig.json`, `index.html`, `scripts/dev.mjs`) are out of scope for this
inventory — the task names the five directories deliberately, and none of
those root files carries seam logic (they wire up dev servers and build
config only).

Line ranges are drawn from a full read of every file. Every range below is
contiguous and every file's ranges sum to its own `wc -l` count — no line is
double-counted or dropped. Blank/separator lines are folded into whichever
neighboring range they visually belong to (a header comment, a following
function) rather than tracked separately.

## Categories

- **policy routing** — decides which card/tool a model turn produces, or
  routes an inbound card verb (action/submit) to the right handler
- **board updates** — run-board state mutation or state-read: advancing the
  deploy state machine, mounting/painting the board's own UI, the console's
  client for the board's cross-origin API
- **action round-trip** — a card-originated user event (click/submit) turned
  into the next model turn, or a model turn turned into a `CardEnvelope`
  (fetch → stream → tool-call → card)
- **origin plumbing** — two-server / iframe wiring: CORS, the `<kai-remote>`
  mount-before-insert order, the board's own bridge handshake, the origin
  constants
- **envelope construction/validation** — building or validating the card
  envelope itself: the registry, the scripted turns' card `data`, schema
  checks, projecting run state into a card's `data`
- **version/undo bookkeeping** — recording a card's resolution, reviving a
  dismissed/rejected card, the undo toast wiring
- **other-seam** — bridges the model→card→thread→board path but isn't one of
  the above: specifically the card↔thread projection adapter (`card-store.ts`)
  and the effect that writes live run state back into an in-thread card
- **zero-seam** — pure UI chrome, styling, generic HTTP/SSE transport with no
  card- or board-specific decision in it, dev bootstrap

## Seam regions by file

### `shared/cards.ts` (78 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–78 | 78 | envelope construction/validation | Whole file: `createCardRegistry` declaring the four custom card types (`approval`/`parameters`/`options`/`checklist`), each pointing at a kit element + kit schema; `ALLOWED_CARD_TYPES`, the `CARD` verb map. |

### `shared/run.ts` (81 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–75 | 75 | board updates | `RunStep`/`RunState`/`StartRunInput` domain types, `RUN_STATUS_LABEL`, `DEPLOY_STEPS` — the canonical plan three processes read. |
| 76–81 | 6 | action round-trip | `RUN_BOARD_CARD_TYPE` (the card type the console asks the remote provider to draw) and `ROLLBACK_ACTION` (the verb the board's button emits back up the bridge). |

### `server/run-engine.ts` (168 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–168 | 168 | board updates | Whole file: the run board's in-memory state machine — `startRun`/`rollbackRun`/`resetRun`, the step/ping timers, `subscribe`/`commit` pub-sub. Owned solely by the board server. |

### `server/chat.ts` (109 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–55 | 55 | zero-seam | Generic `POST /api/chat` body narrowing (`readChatRequest`), the `ChatRequestError` class, error→`Response` mapping. Nothing here is card-aware; it is the same shape any chat route narrows. |
| 56–109 | 54 | policy routing | `lastUserText` (extracts the text `script.ts` will match on) and `chatHandler`, which calls `scriptFrames({ prompt, intent, params })` and streams the result — the request→scenario routing step. |

### `server/script.ts` (466 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–46 | 46 | envelope construction/validation | Imports + `ScriptRequest`/`CardCall`/`ScriptedTurn` types — the shape every scripted turn's card data takes. |
| 47–55 | 9 | zero-seam | `REGIONS` list, `str()` string-coercion helper. |
| 56–297 | 242 | envelope construction/validation | The eight turn builders (`deployParamsTurn` … `boardTurn`) — each hand-builds a card's `data` (form schema, approval body/actions, checklist tasks, options list) plus its narrative text. |
| 298–321 | 24 | policy routing | `ScriptIntent` type + `routeOf()` — keyword/`intent`-based routing from a prompt to a scenario. |
| 322–344 | 23 | envelope construction/validation | `assertScriptable()` — checks every scripted card's type against `ALLOWED_CARD_TYPES` and its data against `cards.validate()` before it can ship. |
| 345–371 | 27 | policy routing | `turnFor`/`pickTurn` — dispatches a routed intent to its turn builder. |
| 372–411 | 40 | zero-seam | `frame`/`usageFrame` (generic OpenAI SSE chunk shape), `sleep`, `tokenize` — transport utilities with no card semantics. |
| 412–466 | 55 | envelope construction/validation | `fallbackFrames`/`scriptFrames` — encodes each `CardCall` as a `kai_<type>` tool-call whose arguments stream in slices, i.e. turns the constructed card `data` into the wire format the browser's tool-call accumulator expects. |

### `plugins/bridge.ts` (35 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–35 | 35 | zero-seam | Whole file: generic `Response` ⇄ Node `ServerResponse` piping (`readBody`, `pipeResponse`). No card/board awareness — the same helper any dev-server route bridge needs. |

### `plugins/chat-api.ts` (33 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–33 | 33 | zero-seam | Whole file: mounts `chatHandler` on the Vite dev server's `/api/chat` middleware. Dev-only transport wiring; the routing decision itself lives in `chatHandler`/`script.ts`. |

### `plugins/run-board-api.ts` (126 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–34 | 34 | origin plumbing | `allowedOrigin`/`cors()` — the loopback-origin allowlist that lets the console (`:5173`) call the board's API cross-origin from `:5175`. |
| 35–126 | 92 | board updates | `json`/`startInput` helpers plus `runBoardApiPlugin()`'s route table (`/`, `/stream` SSE, `/start`, `/rollback`, `/reset`) — the board's own read/mutate API. |

### `board/main.ts` (217 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–84 | 84 | zero-seam | Header comment, root/standalone DOM lookups, `el()` DOM builder, `renderSteps`/`renderPings` — pure DOM painting with no envelope/action logic. |
| 85–104 | 20 | envelope construction/validation | `BoardData` interface + `BOARD_SCHEMA` — the JSON Schema `createCardBridge` validates the incoming `envelope.data` against before mounting. |
| 105–145 | 41 | board updates | `runBoardRenderer.mount()`'s DOM scaffold — reads `envelope.data`, builds the header/meta/steps/footer shell the board paints into. |
| 146–157 | 12 | action round-trip | The rollback button's click handler — `host.emit({ kind: 'action', action: ROLLBACK_ACTION, … })`, the one place a card event leaves this origin. |
| 158–205 | 48 | board updates | `paint()` (renders a `RunState` tick into the DOM) and the `EventSource('/api/run/stream')` wiring that feeds it. |
| 206–212 | 7 | zero-seam | Renderer teardown (`feed.close()`), closes the `runBoardRenderer` object literal. |
| 213–217 | 5 | origin plumbing | `createCardBridge({ root, renderers })` + `bridge.start()` — the provider half of the `kitn-card` handshake — and the standalone-mode fallback when opened outside an iframe. |

### `board/index.html` (22 lines) — zero-seam

Whole file: static markup (`#card-root`, the standalone notice, the `main.ts` script tag). No logic.

### `board/board.css` (267 lines) — zero-seam

Whole file: board styling only.

### `src/App.tsx` (441 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–63 | 63 | zero-seam | Header comment, imports, `SUGGESTIONS`, `toastAdapter` (generic toast shape adapter), `newId`/`userTurn`/`systemNote` message builders. |
| 64–120 | 57 | version/undo bookkeeping | Component state setup, `store`/`recovery` (`dismissRecovery`) construction, and `resolveCard()` — stamps a card's resolution onto its envelope and writes the thread back. |
| 121–135 | 15 | action round-trip | `ask()` — the shared wrapper around `runTurn` every submit and every card-triggered follow-up turn goes through. |
| 136–144 | 9 | zero-seam | `onSubmit` — plain user-typed text submit; not card-specific. |
| 145–176 | 32 | version/undo bookkeeping | `restore()` (un-resolves a card via `revive`) and `offerUndo()` (the "Undo" toast on a rejection). |
| 177–278 | 102 | action round-trip | `onCardAction()` — the policy's core dispatch: `approve` → `startRun` + follow-up turn, `rollback` → `rollbackRun`, `reject`/`rotate`/`stage`/`apply-strategy`, `ROLLBACK_ACTION` (the verb arriving from the OTHER origin) → a fresh `ask(...,'rollback',...)` turn, the `options` default case → `strategy-confirm`. |
| 279–336 | 58 | policy routing | `onCardSubmit()` (routes a card `submit` to `deploy-approval` or acknowledges a checklist), `livePolicy`/`policyRef`/`policy` — assembling the stable `CardPolicy` dispatch table `listenForCardEvents` is handed. |
| 337–350 | 14 | other-seam | The effect that keeps the in-thread checklist card's `data` synced to the live `RunState` (`replaceCard(prev, { ...current, data })`) — the board→card wire-back, direction opposite the action round-trip. |
| 351–373 | 23 | envelope construction/validation | `boardEnvelope` — the `CardEnvelope` handed to `<kai-remote>`'s one-time `render` frame. |
| 374–380 | 7 | board updates | `onReset()` — calls the board's `resetRun()`. |
| 381–428 | 48 | zero-seam | Render: header/status bar, `<Resizable>`/`<Chat>` wiring with static props. |
| 429–436 | 8 | origin plumbing | `<RunBoardFrame>` invocation — hands the cross-origin frame its `src`/`providerOrigin`/`envelope`/`policy`. |
| 437–441 | 5 | zero-seam | Closes out the JSX/component. |

### `src/RunBoardFrame.tsx` (69 lines) — origin plumbing

Whole file: manually creates and configures the `<kai-remote>` element (`theme`/`src`/`providerOrigin`/`envelope`/`policy`) BEFORE inserting it into the document — the fix for the element's mount-once-and-never-retry read of those props, and the whole reason the two-server/iframe wiring works at all.

### `src/assistant.ts` (110 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–29 | 29 | zero-seam | Header comment, imports, `TurnOptions`/`TurnResult` types. |
| 30–56 | 27 | envelope construction/validation | `cardAwareSink()` — recognizes a card tool call (`isCardTool`) and suppresses it from also rendering as a generic tool panel. |
| 57–75 | 19 | action round-trip | `runTurn()`'s POST to `/api/chat` with the encoded thread — the turn's outbound half. |
| 76–94 | 19 | envelope construction/validation | `onToolCallReady` — `cardFromToolCall()` turns a completed tool call into a `CardEnvelope` (id = `tool_call_id`, unchanged) and validates it against the registry. |
| 95–110 | 16 | zero-seam | Error handling (`stream.abort`, logging) and `stream.done()`. |

### `src/card-store.ts` (118 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–67 | 67 | other-seam | `cardsOf`/`cardById`/`withCards`/`replaceCard` — the adapter that projects `CardEnvelope[]` out of `ChatMessage.parts` and writes edits back in place (both array- and item-identity rules honored) so every kit card helper can compose over the thread. |
| 68–94 | 27 | version/undo bookkeeping | `revive()` — clears an envelope's `resolution` AND forces a new `data` reference, because a card element keeps its own optimistic resolution and only a changed `data` reference clears it. |
| 95–118 | 24 | other-seam | `cardStore()` — the `{ get, set }` pair `dismissRecovery` is handed, backed by the thread via a ref read. |

### `src/main.tsx` (35 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–16 | 16 | zero-seam | Element registration (`@kitn.ai/ui/elements`), theme tokens import, imports. |
| 17 | 1 | origin plumbing | Static `import '@kitn.ai/ui/elements/remote'` — `<kai-remote>` is opt-in and must be defined before React ever creates the element, or the remote board never resolves its provider origin (the `upgrade-race` invariant documented at the top of the file). |
| 18–35 | 18 | zero-seam | Toast config, `#root` lookup, `createRoot(...).render(...)`. |

### `src/run-board.ts` (74 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–17 | 17 | origin plumbing | `BOARD_ORIGIN`/`BOARD_CARD_SRC` constants — the second origin's address, pinned as `<Remote provider-origin>`. |
| 18–74 | 57 | board updates | `post()`/`startRun`/`rollbackRun`/`resetRun` (the console's client for the board's cross-origin mutate API) and `useRunState()` (subscribes to the board's SSE feed). |

### `src/run-view.ts` (52 lines)

| Lines | Count | Category | Description |
|---|---|---|---|
| 1–30 | 30 | zero-seam | Imports, `STEP_NOTE` copy map, `runHeadline()` (plain status text, not card-facing). |
| 31–52 | 22 | envelope construction/validation | `checklistDataFor()` — projects a `RunState` into `TasksCardData`, the in-thread checklist card's `data`. |

### `src/styles.css` (194 lines) — zero-seam

Whole file: console layout/theme CSS only.

## Zero-seam files (whole file, honestly)

- `board/index.html` (22 lines) — static markup, no logic.
- `board/board.css` (267 lines) — styling only.
- `src/styles.css` (194 lines) — styling only.
- `plugins/bridge.ts` (35 lines) — generic `Response`↔Node bridging, reusable by any route.
- `plugins/chat-api.ts` (33 lines) — dev-server route mounting only; the actual routing decision is in `server/chat.ts` + `server/script.ts`.

No file in the five directories is *entirely* seam either — every file with logic carries at least a handful of zero-seam lines (imports, DOM/CSS chrome, generic error plumbing), which is reflected in the per-file breakdowns above rather than asserted here.

## Totals

Command run against this snapshot (`app/`), one directory at a time:

```
find app/src app/board app/server app/plugins app/shared -type f | sort | xargs wc -l
```

| Scope | Lines |
|---|---|
| `src/` + `board/` + `server/` + `plugins/` + `shared/` total ("app proper") | 2695 |
| Seam total (every non-zero-seam category, sum below) | 1715 |
| Zero-seam total | 980 |
| **Seam share of app proper** | **1715 / 2695 = 63.6%** |

Category breakdown (sums to the seam total above; each row independently
re-derivable by summing the line-range table entries for that category
across every file section above):

| Category | Lines |
|---|---|
| envelope construction/validation | 555 |
| board updates | 488 |
| policy routing | 163 |
| action round-trip | 154 |
| origin plumbing | 134 |
| version/undo bookkeeping | 116 |
| other-seam | 105 |
| **seam total** | **1715** |
| zero-seam | 980 |
| **app-proper total** | **2695** |

Verified: every per-file range partition sums exactly to that file's own
`wc -l` count (no gaps, no double-counts — checked programmatically against
the `wc -l` output above, not by summing `split('\n').length` or any other
in-process line count). The 2695 app-proper total matches `wc -l`'s own
`total` line for the five-directory file set exactly.
