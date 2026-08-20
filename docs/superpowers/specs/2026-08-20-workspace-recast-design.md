# Design: the workspace re-cast — presets over composables

Date: 2026-08-20. Status: DRAFT for owner review — a deliverable, not a build. No
implementation and no implementation plan follow from this document until the owner
green-lights it (rung-3 spec, § owner ruling).

Parent direction: `docs/superpowers/specs/2026-07-01-composition-first-architecture-proposal.md`
(the composition-first RFC). This spec executes the RFC's `kai-workspace` sections and
**supersedes them with evidence**: where the RFC argued from structure (config scales as
parts × placements), this spec argues from a measured build — the rung-3 clean-room app and
its glue-code inventory.

Evidence of record, cited throughout:

- `docs/superpowers/research/2026-08-20-rung-3-front-door/findings.md` — the classified
  findings (F-01…F-20) and § 5, the glue-code inventory.
- `docs/superpowers/research/2026-08-20-rung-3-front-door/builder-run.md` — the transcript-
  derived MCP call table and read audit.
- `docs/superpowers/research/2026-08-20-rung-3-front-door/NOTES.md` — the builder's own
  17 questions, verbatim.
- `examples/apps/workspace/` — the delivered app, the corpus copy of the glue this spec
  proposes to absorb.
- `packages/ui/src/elements/element-meta.json` — the current surfaces. Every prop/event
  count below is counted from that artifact; re-count there, never from this prose.
- The mandate: `docs/superpowers/specs/2026-08-20-rung-3-workspace-design.md` § owner
  ruling — "the app's glue code IS the preset's design input", and the drafted re-cast
  spec is the rung's named deliverable.

## Why now — what rung 3 proved that July could only assert

The RFC predicted the monolith would fail a real consumer on the config treadmill. Rung 3
ran the experiment: a clean-room builder, told nothing about elements or compose-vs-monolith,
with the full `kai-workspace` reference in hand (23,641 ch, builder-run.md call 7),
**rejected the monolith on a verified fact** — its `kai-search` event is the composer's Globe
button (`detail: Record<string, never>`), not conversation search, and search was a hard
requirement (NOTES §2). It also rejected the documented slot composition (a collapsed slotted
rail leaves a dead 16rem gutter, the recipe's own caveat) and built the undocumented third
arrangement: rail as sibling, layout hand-owned (findings scorecard 2, F-02).

Then it wrote the wiring. Of 342 authored TS/TSX code lines, ~300 are glue between TWO
elements (findings § 5 — method: non-blank non-comment code lines, per file and per
`App.tsx` region):

| Category | Lines | Where |
|---|---|---|
| Persistence | 106 | `storage.ts` + bootstrap/effects |
| State lifting / projection | 61 | `conversations.ts` + derived memos |
| Send/stream pipeline | 52 | `App.tsx` handleSubmit |
| Identity management | ~34 | id-bound setter, per-conversation loading, abort map |
| Hand-rolled delete affordance | ~27 | F-01 |
| Sidebar event plumbing | ~14 | select/new/collapse/search mirror |
| Theme sync | ~10 | `main.tsx` (F-09) |
| No-match search state | ~6 | F-04 |
| Layout CSS (no documented arrangement fit) | 59 CSS | F-02 |

The findings' own scale line: the app renders two kit elements plus a button and wrote more
lines wiring them than `<kai-chat>` has props. That inventory is this spec's input — the
preset is defined as "the glue the app wrote", not as a feature list anyone imagined.

## 1. What the preset encapsulates — the inventory, category by category

The boundary rule is CLAUDE.md's: **the kit decides HOW, the app decides WHETHER** — does
this decision land on an invoice or in a policy document? Applied to each category:

### Persistence (106 lines) — **app-side. The preset does NOT persist.**

What is retained, where, for how long, and what happens at quota are policy decisions
(retention lands in policy documents; storage backends land on invoices). The rung-3 owner
ruling that made THIS app client-only was itself an application decision — another consumer
of the same preset wants a server. The preset must not choose for them.

What the kit owes instead is the **serialization contract**, which is squarely the medium:

- F-13 (doc gap, S3): the rung's defining surface — JSON round-trip of `ChatMessage[]` and
  re-feeding a rehydrated thread — is stated nowhere as supported. It works (the builder
  proved it end-to-end including the re-encoded wire body after reload); one sentence
  ("plain data, JSON-safe, re-assignable") makes the whole workspace pattern legitimate
  instead of lucky.
- F-18: the app's storage validator hand-types the `MessagePart` variant list — the
  derive-don't-type liability, exported into consumer code. Evidence for shipping a
  validator with the kit (a `parseStoredThread`-shaped helper whose variant list derives
  from the union in `src/elements/chat-types.ts`, the same derivation `lint:silent-drops`
  and `verify:scaffold` already use). Validating that a stored blob IS a `ChatMessage[]`
  is a fact about the kit's own type; keeping or dropping the record is still the app's
  call, and the app's framing (availability, loud drop, not a rendering trust boundary —
  `storage.ts` header comment) is the doc paragraph.
- The preset's obligation is **seams**: expose the state changes (thread updated,
  conversation created/deleted, active changed) as events/callbacks so an app can persist
  them anywhere. The debounce-plus-`beforeunload`-flush dance is app code today; whether it
  moves into a documented recipe or a state helper is an open question below, but it never
  moves into the preset as behavior.

### State lifting / projection (61 lines) — **preset-side.**

`conversations.ts` exists because the app's record of truth (id, title, timestamps, full
`messages`) is not the shape `<kai-conversations>` renders (`scope`, `messageCount`,
`lastMessageAt`, no bodies). Projecting one onto the other — `toRows`, title derivation,
recency ordering — is pure medium: how a thread renders as a row invoices nobody. Today
every consumer re-derives it; F-11 records that even "you must sort" is unstated, and F-03
that title derivation is the de-facto search index (an unstated coupling). The preset owns a
default projection (title from the first user turn, move-to-front on activity — the
builder's behavior, called "preset-worthy" in F-11) with app override for title/ordering.
This also dissolves most of F-10 at the preset level: a required row field no consumer can
explain (`scope`, guessed as `{ type: 'collection' }` in NOTES §12; `lastMessageAt` AND
`updatedAt` both required, one documented) is a field the preset defaults or the part drops
— see § 2.

### Send/stream pipeline (52 lines) — **split on the fetch line.**

The kit PARSES, the consumer FETCHES (CLAUDE.md, wire layer). Everything around the fetch is
medium and moves preset-side: submit event → encode full history via `toOpenAIMessages` →
fold via `createAssistantStream`/`readOpenAIStream` → settle, with the error-vs-deliberate-
abort split the builder had to reinvent (F-07's client half — the cancellation story is a
teaching gap three rungs running). The fetch itself — endpoint, auth, model choice, spend —
lands on an invoice and stays a consumer-supplied seam: the preset takes a send function
(history in, `Response`/stream out) and owns everything on both sides of it.

### Identity management (~34 lines) — **preset-side, the strongest case in the inventory.**

The id-bound `SetMessages` (tokens land in the conversation that was open at send, not
whichever is open when they arrive), per-conversation loading state, the in-flight
`AbortController` map, delete-under-stream safety (drop late deltas, never resurrect a
deleted thread). This is exactly the RFC's "assembly-correctness cost… a preset encodes the
correct assembly once so consumers cannot get it subtly wrong". No invoice, no policy —
only correctness. A consumer who gets this wrong ships a bug, not a decision.

### Hand-rolled delete (~27 lines) — **split: affordance part-side, wiring preset-side, policy app-side.**

The affordance belongs on `kai-conversations` regardless of any preset (§ 2, F-01 S2). Once
the part fires a per-row intent, the preset wires the default consequence: abort that
conversation's in-flight stream, remove it from state, emit the change (so the app's
persistence sees it), and the toast-undo reversibility window the builder chose over a
confirm. WHETHER deletion is allowed, confirmed, or soft-deleted is app policy — the preset's
default must be interceptable (a cancelable intent event before the state change).

### Sidebar event plumbing (~14 lines) — **preset-side.** Mirroring select/new/collapse/
search between the rail and the thread is the definitional job of a composition preset;
there is nothing here an app could want to decide differently that isn't already an event
it can observe.

### Theme sync (~10 lines) — **kit-side, but not preset glue.**

F-09: elements resolve `prefers-color-scheme` in-shadow while `theme.tokens.css` scopes dark
under `.dark`, and no shipped doc says who toggles it — the builder's `matchMedia` mirror in
`main.tsx` is the missing doc paragraph written as code. This is a documentation/token fix
for every consumer (the standing docs pass), not something a workspace preset should own:
a page-level class is the app's document, and a preset reaching up to `<html>` would violate
its own boundary.

### No-match search (~6 lines) — **part-side fix, not preset glue.** F-04's silently blank
list is a decide-loudly violation inside `kai-conversations` (empty state keys off the
unfiltered count); it is fixed in the element for every arrangement, § 2.

### Layout CSS (59 lines) — **preset-side; this IS the preset.**

F-02 (product gap, S3): of the three documented arrangements, the requirement pair
search + collapse is satisfiable by none — slot ⇒ dead gutter, monolith ⇒ no search,
sibling ⇒ "not documented as a supported arrangement" (NOTES §2). The recipe documents its
own inadequacy and the escape hatch is unnamed. The preset's layout — a sidebar column that
actually collapses, alongside a main region — is the arrangement the builder had to own by
hand, and encoding it once is most of what "app-shell preset" means (RFC § level
distinction).

**Summary: the preset absorbs projection, pipeline-minus-fetch, identity, delete wiring,
event plumbing, and layout (per findings § 5, roughly the inventory minus persistence and
the two kit-side fixes). The app keeps persistence, the fetch, and every policy decision —
each with a seam to observe or intercept the preset's defaults.**

## 2. What the parts need regardless of the preset

These are part-level gaps the rung hit. A consumer composing by hand — the RFC's canonical
customization path — hits every one of them even if the preset ships tomorrow.

### 2a. Per-row delete/rename affordance on `kai-conversations` — F-01, the rung's S2

The element's complete event list (element-meta.json: `kai-collapse-toggle`,
`kai-conversation-select`, `kai-new-chat`, `kai-search`, `kai-toggle-sidebar`) has no
delete, no rename, no per-row action of any kind, and rows expose no `::part` (NOTES §1:
only `trailing`, a plain string). The measured cost was a **feature reduction**, not just
extra code: the builder's hand-roll can only delete the ACTIVE conversation — "you cannot
delete an arbitrary row from the list without replacing the built-in list wholesale."

**Design question for the owner — posed, not settled.** Two shapes, not exclusive:

- **Declarative actions (events).** An `actions` prop on the element (e.g.
  `[{ id: 'delete', label, icon?, destructive? }]`) rendered as a per-row kebab/hover
  affordance, firing one `kai-conversation-action` event with
  `detail: { conversationId, actionId }`. Framework-agnostic, works from plain HTML,
  matches "behaviors are prop/JSON-driven". Ceiling: the affordance's UI is ours; a
  consumer cannot render their own control in the row.
- **Per-row slot/part (composition).** Expose the row's trailing region as a real slot
  (templated per row) and/or `::part(row)`. No ceiling on the UI — but per-row slotting
  through Shadow DOM list rendering is the hard case (a slot is not a template; N rows
  need N light-DOM children or a template contract the kit does not have today), and it
  reopens the shadow-piercing boundary for styling.

Rename is the same surface (a second declarative action + an editing affordance — note
`kai-editable-label` already ships) and should be decided with delete, not after it. The
rung-3 spec scoped rename out of the APP; the part-level design should not repeat that
scoping accidentally.

### 2b. The arrangement gap — F-02

Independent of the preset, the sibling arrangement the builder used needs to be either
documented as supported (it is consistent with `host-coordinates` and the recipe's own
"changes where it renders, never how it is wired" line, NOTES §2) or subsumed: if the
re-cast lands, the preset IS the supported arrangement and the recipe points at it. Until
then the recipe recommends a composition that cannot satisfy search + collapse, which is a
standing trap for every hand-composer.

### 2c. The toast z-index contract — F-20

`kai-toast-region` paints at a hardcoded `z-index: 100`, documented nowhere, with no
override hook — the IVP found every toast buried under the app's own fixed-position layout,
and the fix was archaeology (devtools, not docs). Part-level fix: a `--kai-toast-z` custom
property (the kit decides the default stacking; the app can re-decide, loudly, in its own
CSS) plus the one-sentence doc ("your app chrome must stay below the toast layer"). This
matters doubly for the preset: § 1 wires delete's reversibility through that toast, so the
preset would be shipping a default UX that any consumer `z-index` can silently disable.

### 2d. The `kai-search` naming collision

Today two different `kai-search` events exist: `kai-conversations`' rail filter
(`detail: { query }`) and the composer Globe toggle (`detail: Record<string, never>`) on
`kai-prompt-input` / `kai-chat` / `kai-workspace` (element-meta.json, all four listings).
On separate tags this is confusing — it cost the builder a full monolith evaluation and is
the literal fact `kai-workspace` was rejected on. On a preset that composes rail AND
composer and re-emits both, it stops being confusing and becomes a genuine collision: one
tag, one event name, two incompatible detail shapes. One of them must be renamed before or
with the re-cast (candidate: the Globe becomes `kai-web-search-toggle` or folds into the
existing `kai-toolbar-action`; the rail's filter keeps `kai-search`, matching its
`{ query }` payload — pre-1.0, `feat!` per conventions). Owner's call on direction; the
constraint is only that the preset cannot ship while both exist.

### 2e. Smaller part fixes the inventory paid for

- F-04: `kai-conversations`' empty state must key off the FILTERED count (decide loudly —
  in the element, where it fixes every consumer).
- F-10: `scope` required with no stated meaning; `lastMessageAt` and `updatedAt` both
  required with one documented. Make the unexplainable fields optional (or document what
  they drive); a required field no consumer can explain is a field to default or drop.
- F-03: state the search semantics (titles-only, non-disableable, local) where the MCP and
  docs render the element — the builder got them from the compiled bundle.

## 3. The preset shape

### The re-cast

`kai-workspace` keeps its tag and becomes a thin composition over three public parts —
`kai-conversations` + `kai-thread` + `kai-prompt-input` — plus the § 1 preset logic
(projection, pipeline, identity, delete wiring, plumbing, layout). Per the RFC's keystone
note, `kai-thread` is the element this shape depends on: it exists in element-meta.json
today (messages/loading/prose/code/scroll props, `kai-message-action`, an `empty` slot) but
the RFC's phase-1 ("expose `kai-thread`, reimplement `kai-chat` as a behavior-preserving
preset over it") is the natural first slice, with the workspace as the same pattern drawn
one level up. Whether the workspace preset composes `kai-thread` + `kai-prompt-input`
directly or composes the re-cast `kai-chat` (which bundles them — the middle path the
builder chose) is an open question below; the builder's evidence mildly favors the latter,
since `kai-thread`/`kai-prompt-input` were never even queried in a successful build
(builder-run.md: they appear only inside other tools' output).

Each region is a slot with a preset-provided default: `sidebar` (default:
`kai-conversations`, wired), `main` (default: thread + composer, wired), and the existing
header/footer regions. Filling a slot replaces the default part but keeps the preset's
wiring where the replacement speaks the same events — the RFC's no-ejection-cliff rule.

The batteries-included five-minute start survives by construction: `<kai-workspace>` with
data in (`conversations`, `messages`, `activeId`) and a send seam is still one tag. What
changes is where customization goes: to the parts, via slots — not through new props on the
preset. The RFC's success criterion, now measurable: new features land as elements, not as
orchestrator props.

### Honest migration — what today's surface maps to

`kai-workspace` today: 32 props / 10 events, counted from
`packages/ui/src/elements/element-meta.json` (re-count there; the RFC's own "~28 props" for
`kai-chat` shows how these figures rot in prose). Mapping, by destination:

- **Kept as preset globals** (genuinely whole-surface concerns, per the RFC's rule):
  `theme`, `conversations`, `activeId`, `messages`, `loading` — plus the send seam this
  spec adds.
- **Pass through to the rail** (`kai-conversations` already owns them): `groups`,
  `sidebarCollapsed` → `collapsed`, `defaultSidebarCollapsed` → `defaultCollapsed`.
- **Pass through to the thread** (`kai-thread` props today): `proseSize`, `codeTheme`,
  `codeHighlight`, `scrollButton`, `cardTypes`, `cardSchemas`.
- **Pass through to the composer** (`kai-prompt-input` props today): `value`,
  `placeholder`, `suggestions`, `suggestionMode`, `voice`, `triggers`, `kindIcons`,
  `search` (pending the 2d rename).
- **Become slot content, not props**: `chatTitle`, `models`, `currentModel`, `context`
  (main-header concerns — the model picker is a part in a slot, not four orchestrator
  props); `noConversations` (don't fill the sidebar slot, or slot it empty).
- **Layout knobs — the honest residue**: `sidebarWidth`, `sidebarMinWidth`,
  `sidebarMaxWidth`, `collapseBelow`, `compact`. These are the preset's own domain (it owns
  the F-02 layout), but five props is the treadmill in miniature; proposal: CSS custom
  properties on the host for the widths, keeping `collapseBelow`/`compact` as the only
  layout props. Open question below.

Events: the 10 (element-meta.json) re-emit unchanged — from the default parts, or from
slotted chrome for the ones whose source becomes a slot (`kai-model-change`) — except
`kai-search` (§ 2d) and the additions the § 1 seams require (conversation created/deleted/changed for the
persistence seam; the cancelable delete intent). `kai-sidebar-toggle` vs the rail's
`kai-toggle-sidebar` is a second, smaller naming divergence to unify in the same breaking
pass.

**What breaks:** pass-through props whose names change (`sidebarCollapsed`), props that
become slots (`chatTitle`, `models`, `currentModel`, `context`, `noConversations`), the
2d/2e event renames, and any behavior the preset now defaults differently (recency
move-to-front). Pre-1.0: `feat!`, a minor bump under release-please, per conventions.
Phasing follows the RFC's migration section (additive → behavior-preserving reimplement →
deprecate-then-remove), with `/consumer-regression` green as the gate at step two; the RFC's
prop-usage-audit risk stands and is cheaper now — the corpus apps plus the starters are a
countable consumer set.

## 4. Explicitly not doing

- **Implementing anything.** This document ends at owner review (the rung-3 spec's owner
  ruling; the plan's Task 8: "deliverable only"). No implementation plan either — that is a
  separate, later document if the owner green-lights the direction.
- **Persistence in the preset** — § 1. Not localStorage, not IndexedDB, not a `persist`
  prop. Seams only.
- **Re-casting `kai-chat`** — the RFC's phase 1; this spec depends on it but does not
  design it.
- **Rename/pinning/grouping features** other than the § 2a affordance surface (the rung-3 spec
  scoped these out of the app; the part-level ACTION surface covers rename's plumbing, the
  feature itself is not designed here).
- **Server-side or multi-tab sync** — application territory, same boundary as persistence.
- **The MCP/docs teaching-gap fixes** (F-03/F-08/F-09/F-13 doc sentences, the wrapper-layer
  discoverability gap, `debug`'s 0-for-2) — they ride the standing docs pass and the banked
  rung follow-ups, not this re-cast.

### Open questions for the owner

1. **2a: events vs slots for per-row actions** — declarative `actions` prop, a real per-row
   slot/part contract, or both (prop for the common path, part for styling)?
2. **Does the workspace preset compose `kai-chat` (the builder's middle path) or
   `kai-thread` + `kai-prompt-input` directly?** The former keeps one preset over another
   preset (consistent with "presets all the way down"); the latter is flatter but re-does
   `kai-chat`'s assembly.
3. **Layout knobs**: CSS custom properties vs props for the sidebar widths (§ 3)?
4. **The persistence seam's shape**: events only, or also a documented state helper (the
   debounce/flush recipe as code) in `@kitn.ai/ui/state`? F-18's validator
   (`parseStoredThread`) — ship it, and in which entry point?
5. **2d: which `kai-search` keeps the name?**
6. **Sequencing**: does the workspace re-cast wait for the RFC's phase 1 (`kai-chat` as
   preset), or proceed in parallel with the part-level fixes (2a–2e), which are valuable
   under any answer?

## 5. Measurement — how a future rung proves the preset

The claim this spec makes is falsifiable and should be falsified the same way it was
produced: **rebuild the same app, front-door-first, against the preset, and re-run the
glue-code inventory.**

- **Baseline**: findings.md § 5 — 342 authored TS/TSX code lines, ~300 glue, per-category
  table above. The artifact of record is
  `docs/superpowers/research/2026-08-20-rung-3-front-door/findings.md`; the corpus copy of
  the measured code is `examples/apps/workspace/`.
- **Re-measure**: a future rung's comparer produces the same per-category table over the
  rebuilt app, same method (non-blank non-comment code lines per file and region, as
  findings § 5 states it), landing in that rung's `findings.md`. The categories are the
  contract: persistence should be roughly UNCHANGED (the preset deliberately does not
  absorb it — if it shrinks to zero, the preset overreached its boundary), while
  projection, identity, delete, plumbing, and the F-02 CSS should approach zero. Success is
  the glue total falling materially below the baseline recorded in `findings.md` § 5 —
  a ratchet, not a target — with the persistence category intact.
- **The same rebuild re-measures the teaching layer**: the builder's path (does it find the
  preset? does it eject to parts when asked for something the preset doesn't do?) tests the
  RFC's no-ejection-cliff claim the way rung 3 tested the monolith.
- Regression floor for existing consumers: `/consumer-regression` green through the
  deprecation window (the RFC's success criterion, unchanged).

What this measurement deliberately does not use: any figure retyped into this spec or the
preset's docs. The baseline lives in the findings artifact; the re-measure lives in the
future rung's; this document only names them.
