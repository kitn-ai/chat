# Findings — rung-3 front-door build (chat workspace)

Comparer analysis of the clean-room builder's app against the kit, the MCP transcript (the
first rung with one — every per-call claim below cites a transcript line), and the spec's
pre-named expected findings (`docs/superpowers/specs/2026-08-20-rung-3-workspace-design.md`
§ Expected findings). Companion: `builder-run.md` (run metadata, MCP call table, node_modules
audit), `NOTES.md` (the builder's 17 questions, verbatim), `app/` (the delivered source).

Classes: **teaching gap** (the front door failed to teach a fact the kit knows) · **product
gap** (the kit lacks the thing itself) · **doc gap** (fact stated nowhere shipped — checked
against the stripped README/llms before filing) · **builder error** · **acceptable
variation** · **strip artifact** (an artifact of the harness's stripping, not a real-install
gap). Severity S1–S4 as in rung 1.

## Headline verdicts

- **Build/run: green, zero comparer fixes.** First rung where the builder verified its own
  work (18 CDP checks in headless Chrome) — and the comparer's independent build + keyless
  dev probe confirmed all of it (`builder-run.md` § Build and run).
- **Composition choice: the middle path, chosen with evidence.** `<kai-conversations>` +
  `<kai-chat>` via the React wrappers, rail as a **sibling** — after explicitly consulting
  and rejecting both documented alternatives (below).
- **The mock backend route came from the scaffold** — the #298 fix taught, first time
  exercised. One residual: the emitted route needs `@types/node` and the run note doesn't
  say so (F-08).
- **Candidate G #5 (unwired second component): reproduced.** The `workspace` scaffold
  emitted an `<Artifact src="https://example.com">` in a Resizable split, wired to nothing —
  and did NOT emit the sidebar the workspace actually needed.
- **The delete-affordance gap landed exactly as the spec predicted**, and the builder's
  hand-roll is a *reduced* feature: delete works only on the ACTIVE conversation.

## The spec's pre-named expected findings — scorecard

### 1. The sidebar delete/rename affordance gap — CONFIRMED, with a twist

`component_reference kai-conversations` (transcript 25/26) lists exactly the five events the
spec counted from element-meta — no delete, no rename, no per-row actions, no row `::part`.
The builder asked `debug` directly (line 65: "I need a delete button on each conversation
row…") and got **"No known failure pattern matched"** plus pointers to a stripped file and a
forbidden URL — the front door had nothing.

**What the builder hand-rolled** (NOTES §1, `app/src/App.tsx:209-234, 265-275`): a "Delete
chat" `<Button>` slotted into `<kai-chat slot="header-end">`, acting on the **active
conversation only**, with `toast(…, { action: { label: 'Undo' } })` instead of a confirm,
abort of that conversation's in-flight stream, and an id-bound setter that drops late deltas
so a deleted thread cannot resurrect. The builder named the reduction itself: "You cannot
delete an arbitrary row from the list without replacing the built-in list wholesale."
**Class: product gap, S2** (spec-predicted; the stumble is the measurement — and the
measured cost is a *feature reduction*, not just extra code). Re-cast input: a per-row
action surface (event + slot/part) on the rail, or the preset owns delete.

### 2. Discovery: `kai-conversations` vs the monolith vs hand-rolling — THE MIDDLE PATH, DELIBERATED

Transcript evidence, in order:

- Line 22 (after `component_reference list`): "Key components spotted: `kai-chat`,
  `kai-conversations`, `kai-workspace`." All three candidates on the table from minute one.
- Lines 23–26: pulled `kai-chat` and `kai-conversations` references.
- Line 35/36: pulled `recipes` — the `workspace-chat` recipe says the rail slots INSIDE
  `<kai-chat>`, then itself documents the fixed-width column, that collapse "does not react",
  and points at `<kai-workspace>` for a column that resizes.
- Line 72/73: pulled the full `kai-workspace` reference (23,641 ch) — **considered the
  monolith seriously** — and rejected it on a verified fact: its `kai-search` is the
  composer's Globe button (`detail: Record<string, never>`), not conversation search, and
  search was a hard requirement (NOTES §2).
- `kai-thread` / `kai-prompt-input` were **never queried** (they appear only inside other
  tools' output). The finer-grained decomposition was not considered.

So: **`kai-conversations` + `kai-chat` (which bundles thread + composer), rail as a
sibling** — deviating from the recipe's slot composition because a collapsed slotted rail
leaves a dead 16rem gutter. The builder quoted the recipe's own caveats as its reason and
owned the layout (59 lines of CSS). **Class: acceptable variation** for the builder;
**product gap, S3, for the kit**: of the three documented arrangements (slot, monolith,
sibling), the requirement pair *search + collapse* is satisfiable by NONE without deviation —
slot can't collapse the column, the monolith can't search, and sibling is "not documented as
a supported arrangement" (NOTES §2). That triangle is a direct re-cast input.

### 3. Candidate G re-measures — first rung where both are exercisable

**#4, the `scope` field: PARTIALLY FIXED.** The mechanism that fixed baseline #3 (full types
rendered from the derived layer) does reach it — `component_reference kai-conversations`
renders the complete row type including `scope: { type: "document" | "collection"; … }`, so
unlike the baseline the builder knew the field existed and what shapes it takes. But its
MEANING is stated nowhere (MCP output, README, llms.txt, llms-full.txt all checked —
llms-full carries the same bare type literal), nothing in the rendered row uses it, and the
builder guessed `{ type: 'collection' }` for every row (NOTES §12). Adjacent smell, same
row: `lastMessageAt` AND `updatedAt` both required, only `updatedAt` documented as driving
anything; the builder set both to the same value. **Doc/API gap, S3.** Re-cast input: a
required field no consumer can explain is a field the preset should default or drop.

**#5, `scaffold` emits an unwired second component: REPRODUCED.** `scaffold { useCase:
"workspace", integration: "mock", placement: "full-page", framework: "react" }` (line 27/28)
emitted `<Chat>` in a `<Resizable>` split with **`<Artifact src="https://example.com"
files={[{ path: 'index.html', url: 'https://example.com' }]}>`** — placeholder data, zero
wiring into the chat flow, flagged only by an inline "Replace src + files" comment. The
builder discarded Artifact and Resizable wholesale. Worse, the inverse: the identically
named `workspace-chat` **recipe** lists `kai-conversations` as an ingredient, but the
`workspace` **scaffold archetype** does not emit it — the one component this workspace
actually needed had to be composed entirely by hand while the scaffold shipped one it
didn't need. **Teaching gap, S3** (two named "workspace" surfaces disagree on the
ingredient list; the second component is still decorative). **Verdict: not fixed; carry.**

### 4. Wrapper-layer friction — MILD, NO DEFECTS

- The wrappers held under real load: streamed, persisted, identity-sensitive state through
  `<Chat>`/`<Conversations>`/`<Button>`, typed `CustomEvent` handlers
  (`onConversationSelect`, `onSubmit`), StrictMode, React 19 — zero wrapper bugs.
- The reference-diff contract was understood and respected first try: a module-level
  `NO_MESSAGES` stable ref so the empty thread doesn't re-notify (`App.tsx:24`),
  `map` + spread in the id-bound setter with a comment citing `reactivity-two-halves`
  (`App.tsx:105-122`), and NOTES §16 asking the one question the invariant doesn't answer
  (is a per-token derived-array rebuild harmful or merely wasteful?). **Doc gap, S4.**
- Friction that did cost: the MCP documents **elements**, not the wrapper layer — the
  builder read `dist/react/index.d.ts` three times (transcript 52, 59, 119) for wrapper
  prop/slot/event-prop names (`headerEnd`, `onConversationSelect`). **Teaching gap, S3**:
  a React consumer's first-class surface is discoverable only by reading `.d.ts`.
- The `label` incident (F-05 below) is wrapper-adjacent but turns out to be a builder
  misattribution, not a wrapper doc hole.

### 5. The glue-code inventory — the re-cast's headline numbers

Method: code lines (non-blank, non-comment), measured per file and per `App.tsx` region.
Authored app TS/TSX: **342 code lines**
(`App.tsx` 190, `storage.ts` 90, `conversations.ts` 45, `main.tsx` 17), plus **59** lines of
CSS and **75** lines of scaffold-adopted backend (`server/chat.ts` 41, `vite-chat-api.ts`
34, taken near-verbatim from scaffold block 2).

| Category | Code lines | Where |
|---|---|---|
| **Persistence** (load/validate/save, debounce + `beforeunload` flush, active-id, bootstrap) | **106** | `storage.ts` 90; `App.tsx` bootstrap 5 + effects 11 |
| **State lifting / projection** (record type ≠ row shape, `toRows`, title derivation = the de-facto search index, recency sort, derived memos) | **61** | `conversations.ts` 45; `App.tsx` 76-91 (10) + consts (6) |
| **Send/stream pipeline** (submit event → encode full history → fetch → `readOpenAIStream` → fold; error vs deliberate-abort split) | **52** | `App.tsx` 124-197 |
| **Identity management** (id-bound `SetMessages`, per-conversation `loading`, in-flight `AbortController` map, draft-null convention, mid-stream-switch and delete-under-stream safety) | **~34** | `App.tsx` 93-122 (15) + state decls (9) + the identity strands inside handleSubmit (~10) |
| **Hand-rolled delete affordance** (F-01) | **~27** | `App.tsx` 209-234 (19) + header-end JSX (~8) |
| **Sidebar event plumbing** (select/new/collapse/search mirror) | **~14** | `App.tsx` 199-207 (6) + JSX event props (~8) |
| **Theme sync** (who owns `.dark` — F-09) | **~10** | `main.tsx` |
| **Hand-rolled no-match search state** (F-04) | **~6** | `App.tsx` 89-91 + hint JSX |
| **Layout owned because no documented arrangement fit** (F-02) | **59 CSS** + ~4 JSX | `styles.css`, workspace/rail wrappers |
| Imports, chrome, remainder | ~32 | |

**Headline: of 342 authored TS/TSX lines, ~300 are glue between two elements** — and the
three biggest blocks (persistence 106, projection 61, identity ~34) are exactly what a
`kai-workspace` preset would have to encode, while the two hand-rolled affordances
(delete ~27, no-match ~6) are the parts the components refused. For scale: the app renders
TWO kit elements plus a button, and wrote more lines wiring them than `<kai-chat>` has props.

## G-04 — where did the mock backend route come from? (the #298 re-measure)

**From the scaffold, definitively.** Scaffold block (2) (transcript line 28) contains the
complete `server/chat.ts` (`ChatRequestBody` + `readChatRequest` preamble, module-scope
responder with the cursor comment, `ReadableStream` with backpressure `cancel()`, the
status-must-survive-the-bridge and anti-buffering headers) and the complete
`vite-chat-api.ts` middleware, `.js`-extension caveats included. The builder announced it
("Now the mock streaming dev endpoint (scaffold block 2):", line 167) and adopted both files
near-verbatim — its only substantive addition is a `console.log` of the thread's message
count, added to make the full-history-after-reload requirement observable. Rung 2's builder
saw an EMPTY block 2 for `mock`; this run is the first front-door evidence the #298 fix
teaches. **Fixed — with one residual (F-08).**

## All divergences and NOTES items, classified

| id | Finding | Class | Sev | Notes |
|---|---|---|---|---|
| F-01 | No delete/rename affordance on the rail; hand-roll reduces delete to active-conversation-only (NOTES §1) | product gap | S2 | Spec expected finding 1; see scorecard. |
| F-02 | No documented arrangement satisfies search + collapse: slot ⇒ dead gutter, monolith ⇒ no search, sibling ⇒ undocumented (NOTES §2) | product gap | S3 | Scorecard 2. The recipe documents its own inadequacy and the escape hatch is unnamed. |
| F-03 | Search semantics undocumented: titles-only, non-disableable filter; learned from the compiled chunk (NOTES §3) | doc gap | S3 | 0 hits in README/llms/llms-full; MCP implies without stating. Title derivation becomes the de-facto search index — unstated coupling. |
| F-04 | A no-match search renders a silently blank list (empty state keys off the UNFILTERED count); search box render condition undocumented (NOTES §4) | product gap | S3 | A "decide loudly" violation in the element; builder papered over it in app code. |
| F-05 | `<Button label="Delete chat" />` renders a 24px empty button; NOTES claims "the React `.d.ts` gives no hint" | **builder error** (the claim) + residual product question | S3 | The installed `dist/react/index.d.ts` DOES document it — `ButtonProps.label`: "Accessible name. REQUIRED for icon-only buttons…; ignored when you slot visible text". The builder read compiled `react.js` (line 203), not the d.ts, and only pulled `component_reference kai-button` after the screenshot (line 373). Residual worth keeping: a `label`-only button silently rendering 24px of nothing is a trap the type system permits — but it is documented, twice. |
| F-06 | No delete-ish icon among the 48 curated names; registry contents not surfaced by the MCP (NOTES §6) | doc gap | S4 | Builder shipped a text button — reasonable. |
| F-07 | `ConsumeOptions` has no `signal`; cancellation story absent from MCP (NOTES §7); concurrency of parallel streams unstated (NOTES §8); orphaned-stream behavior unstated (NOTES §9) | teaching gap | S3 | The state/wire lifecycle hole, third rung running (rung-1 G-03 class, rung-2 `ConsumeOptions` read, now this). Builder's abort-the-fetch + id-bound-sink answers are correct and belong in the docs. |
| F-08 | The scaffold's dev route requires `@types/node` (`req.setEncoding`, `for await (req)`); run note's install line omits it — first `npm run build` FAILED (transcript 237), fixed by the builder (244; NOTES §10) | teaching gap | S3 | The one blemish on the otherwise-clean #298 story. Fix: add `@types/node` to the run note's install line for node-runtime routes (derive from the runtime label, don't hand-type). |
| F-09 | Page-level dark mode has no stated owner: elements resolve `prefers-color-scheme` in-shadow, `theme.tokens.css` scopes dark under `.dark`, nobody says who toggles it (NOTES §11) | doc gap | S3 | 0 hits for `.dark` ownership in README/llms/llms-full. Builder's `matchMedia` mirror (`main.tsx`) is the missing doc paragraph, written as code. |
| F-10 | `scope` required with no stated meaning; `lastMessageAt` + `updatedAt` both required, one documented (NOTES §12) | doc/API gap | S3 | Candidate G #4 re-measure — see scorecard 3. |
| F-11 | Row ordering is the host's job ("no recency bucketing" is stated; "so you must sort" is not) (NOTES §13) | doc gap | S4 | Builder's move-to-front-on-turn avoids mid-stream row jumping — preset-worthy behavior. |
| F-12 | `<kai-conversation>` documented in the manifest but never registered — a light-DOM marker tag read via `querySelectorAll` (NOTES §14) | doc inconsistency | S4 | Confirmed in llms-full (5 mentions) and the compiled chunk. Not used by the app. |
| F-13 | The rung's defining surface — JSON round-trip of `ChatMessage[]` and re-feeding a rehydrated thread — is stated nowhere as supported (NOTES §15) | doc gap | S3 | It WORKS (builder proved it end-to-end incl. wire body after reload). One sentence on `ChatMessage` ("plain data, JSON-safe, re-assignable") makes the whole workspace pattern legitimate instead of lucky. |
| F-14 | Per-token derived-array rebuild: wasteful vs harmful unstated (NOTES §16) | doc gap | S4 | Scorecard 4. |
| F-15 | `debug` pointed at `node_modules/@kitn.ai/ui/llms-full.txt` (absent HERE) and a remote URL (NOTES §17) | **strip artifact** (path) + tool weakness (substance) | S3/S4 | The file ships in a real install (rung-1 G-01a precedent; W16 stripped it). The substance stands: for both questions brought to it this run (delete affordance, line 65) `debug` had nothing — 0-for-2 across rungs 1 and 3 on real questions. |
| F-16 | Scaffold `workspace` archetype ≠ `workspace-chat` recipe: no `kai-conversations` emitted; unwired `Artifact` + `Resizable` emitted instead | teaching gap | S3 | Candidate G #5 re-measure — see scorecard 3. Comparer-found (the builder never remarked on it; it silently discarded the artifact split). |
| F-17 | Builder used the scaffold's OPTIONAL HTTP route + `fetch('/api/chat')` instead of the front-end's in-browser `mockResponse(value)` | acceptable variation | — | The stronger choice for this rung: exercises the real wire path over HTTP, which is what made the reload-continuation check meaningful. |
| F-18 | Storage validator drops unreadable records loudly, keeps the rest; correctly frames itself as availability (one truncated record must not take down every other thread), not a rendering trust boundary | acceptable variation | — | `storage.ts` header comment is convention-grade. The variant list in `isMessagePart` is a hand-typed copy of the `MessagePart` union — the derive-don't-type liability, in consumer code, which is itself evidence for shipping a validator (`parseStoredThread`?) with the kit. |
| F-19 | Toolchain: Vite 7 / TS 5.9 / React 19, `vite@^7` pinned deliberately (transcript 109) | acceptable variation | S4 | A major ahead of the corpus pins — incidental forward-compat evidence, same class as rung 1's Vite-8 note. |

**Counts: 4 product gaps (1×S2, 3×S3) · 4 teaching gaps (all S3, one carried three rungs) ·
8 doc gaps (5×S3, 3×S4, incl. one inconsistency) · 1 builder error · 4 acceptable
variations · 1 strip artifact.** Zero kit DEFECTS (nothing broken — every gap is a missing
affordance, a missing sentence, or a scaffold blind spot; contrast rung 1's G-05).

## What the teaching layer got RIGHT this run (the ratio matters)

Every rung-1 fixed class held at rung 3, now through the React wrappers: register-first
import with the silent-failure warning (`App.tsx:1-6`), no hand-rolled structural types, all
event `detail` shapes typed, `theme.tokens.css` not raw `theme.css`, no hand-rolled SSE
reader, host-owned messages array, `reactivity-two-halves` quoted at the exact line it
governs, `stream.abort(reason)` on the failure path with the deliberate-abort distinction,
and the scaffold's backend route adopted rather than reinvented. The builder went from MCP
orientation to a fully verified multi-thread persistent workspace in 98 turns / ~20 minutes
with zero remote docs, zero MCP errors, and one build failure (F-08) it fixed itself.

## Addendum — IVP round (insider, 2026-08-20)

| id | Finding | Class | Sev | Notes |
|---|---|---|---|---|
| F-20 | The delete Undo toast was never visible or clickable: `styles.css` set `.workspace { position: fixed; z-index: 1000 }`, while the kit's `kai-toast-region` (which `toast()` mounts as a body-level sibling of `#root`) paints its stack at a hardcoded `z-index: 100` — both in the root stacking context, so the app layer buried every toast. The builder's own comment justified the 1000 against an in-app sticky-header concern; it was never designed against the kit's toast layer, which the app never touches directly. | **builder error** (app CSS stacking) | S2 | Found only by the hardened IVP (point 4: geometry + `elementFromPoint` + a real click, not state strings — the toast's DOM was perfect throughout). Fixed insider-side: z-index 1000 → 10 with the contract named at the site; probe-verified green (`.superpowers/sdd/2026-08-20-rung-3/w18-undo-fix/`). **Kit-affordance note, re-cast input:** `kai-toast-region`'s `z-index: 100` is easily buried by any consumer fixed-position layout, the value is documented nowhere (README, llms, MCP — a consumer learns it from devtools), and there is no override hook (no CSS custom property, no `toast()` option, no attribute). A one-sentence doc ("your app chrome must stay below 100") or a `--kai-toast-z` token would have prevented the class — candidate for the docs pass / re-cast spec. |
