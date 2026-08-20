# Design: the workspace re-cast — construction over configuration

Date: 2026-08-20. Status: DRAFT for owner review — a deliverable, not a build. Rewritten
same-day after the owner worked through the first draft's six open questions with the
supervisor; every ruling below is **owner-ratified 2026-08-20** and quoted as such. No
implementation and no implementation plan follow from this document until the owner
green-lights it (rung-3 spec, § owner ruling).

Parent direction: `docs/superpowers/specs/2026-07-01-composition-first-architecture-proposal.md`
(the composition-first RFC). This spec executes and **supersedes the RFC's workspace
sections with evidence** — where the RFC argued from structure (config scales as
parts × placements), this spec argues from a measured build, and where the RFC proposed a
preset ELEMENT, the owner rulings replace it with a layout shell plus a consumer-owned
block (§ 3).

Evidence of record, cited throughout:

- `docs/superpowers/research/2026-08-20-rung-3-front-door/findings.md` — the classified
  findings (F-01…F-20) and § 5, the glue-code inventory.
- `docs/superpowers/research/2026-08-20-rung-3-front-door/builder-run.md` — the transcript-
  derived MCP call table and read audit.
- `docs/superpowers/research/2026-08-20-rung-3-front-door/NOTES.md` — the builder's own
  17 questions, verbatim.
- `examples/apps/workspace/` — the delivered app, the corpus copy of the glue this spec
  proposes to absorb.
- `.superpowers/sdd/2026-08-20-rung-3/latency-debug/report.md` — the 2026-08-20 latency
  diagnosis (the F-21 finding below).
- `packages/ui/src/elements/element-meta.json` — the current surfaces. Every prop/event
  count below is counted from that artifact; re-count there, never from this prose.
- The mandate: `docs/superpowers/specs/2026-08-20-rung-3-workspace-design.md` § owner
  ruling — "the app's glue code IS the preset's design input", and the drafted re-cast
  spec is the rung's named deliverable.

## Vision — construction over configuration (owner-ratified 2026-08-20)

This is the spec's spine, and it is the shadcn model. The owner's words:

> "shadcn doesnt just pass in a bunch of configurations, you compose. and that is the
> vision i have for our component set."

Consumers **construct** their chat app from elements. A config-driven black box — a
mega-element whose every consumer feature must become our prop — is the anti-pattern this
re-cast retires. Rung 3 ran the experiment that makes this more than taste: a clean-room
builder, told nothing about elements or compose-vs-monolith, pulled the full
`kai-workspace` reference (23,641 ch, builder-run.md call 7) and **rejected the monolith on
a verified fact** — its `kai-search` event is the composer's web-search Globe
(`detail: Record<string, never>`), not conversation search, and search was a hard
requirement (NOTES §2). The config surface did not merely fail to cover a need; it
actively misdescribed itself. The builder then composed — and wrote ~300 lines of glue
doing it (§ 1), which is the other half of the evidence: construction must be made cheap,
not merely permitted.

## Taxonomy — four tiers (owner-ratified 2026-08-20)

The kit's public surface re-states itself as four tiers. The first two exist today; the
third is a reclassification; the fourth is new.

1. **Primitives** — generic atoms (`packages/ui/src/ui/`: buttons, popovers, inputs). No
   domain knowledge.
2. **Elements** — domain components: the thread, the composer, cards, voice, the
   conversation rail. They know what a chat is; they do not know what an app is.
3. **Layout elements** — arrangement, not domain behavior: `kai-dock`,
   `kai-prompt-dock`, `kai-resizable`/`kai-resizable-item` (all in element-meta.json
   today), and the re-cast workspace shell (§ 3). They own placement, resize, collapse,
   z-layering, focus-return — the prop/JSON-driven behaviors CSS alone cannot do — and are
   chat-agnostic by definition.
4. **Blocks** — generated compositions the consumer **owns**: emitted by the kai MCP
   scaffolder / create-kai, with the corpus apps as reference implementations. shadcn
   blocks, exactly.

The mechanical distinction that makes the tiers real, stated as the accepted trade-off it
is: **a layout-element or element fix reaches every consumer via npm update; a block's
code belongs to the consumer at generation time and no later fix reaches it.** That IS the
block's point — the consumer can edit every line without a fork or an ejection cliff — and
it is why the split in § 3 pushes every mechanically-updateable piece down into elements
and state helpers, and leaves in the block only what the consumer should own.

## 1. The evidence — the glue inventory, category by category

Rung 3's builder wrote 342 authored TS/TSX code lines wiring TWO elements, ~300 of them
glue (findings § 5 — method: non-blank non-comment code lines, per file and per `App.tsx`
region). The findings' own scale line: the app renders two kit elements plus a button and
wrote more lines wiring them than `<kai-chat>` has props.

The boundary rule for assigning each category is CLAUDE.md's: **the kit decides HOW, the
app decides WHETHER** — does this decision land on an invoice or in a policy document?
The first draft of this spec assigned destinations to a preset element; under the § 
Taxonomy rulings the destinations are re-mapped to the shell, the block, and the state
helpers. The assignments themselves — what is medium, what is policy — are unchanged;
they were derived from the evidence, not from the delivery vehicle.

| Category | Lines (findings § 5) | Boundary verdict | Destination under the taxonomy |
|---|---|---|---|
| Persistence (load/validate/save, debounce+flush, active-id) | 106 | **App policy** — retention, backend, quota land in policy documents and on invoices | Stays consumer-owned, in the BLOCK; the mechanical halves (the `parseStoredThread` validator, F-18; the debounce/flush seam) move to `@kitn.ai/ui/state` helpers so they stay npm-updateable |
| State lifting / projection (record→row, title derivation, recency sort) | 61 | **Medium** — how a thread renders as a row invoices nobody | State helpers (the projection fold) + the BLOCK (the consumer's own record shape) |
| Send/stream pipeline (submit → encode → fetch → fold; error-vs-abort split) | 52 | **Split on the fetch line** — the kit parses, the consumer fetches; endpoint/auth/model/spend is the invoice | State helpers own everything around the fetch (incl. the F-07 cancellation story); the fetch itself is the consumer's line in the BLOCK |
| Identity management (id-bound sinks, per-thread loading, abort map, delete-under-stream) | ~34 | **Medium** — pure assembly-correctness; a wrong answer is a bug, not a decision | State helpers (the thread-switching fold) — the strongest case in the inventory for a mechanically-updateable helper |
| Hand-rolled delete affordance | ~27 | **Split** — the affordance is the medium; WHETHER/confirm/soft-delete is policy | The affordance: `kai-conversation-item` (§ 2a, owner ruling: build now). The wiring: the BLOCK. The policy: the consumer, who owns that code |
| Sidebar event plumbing (select/new/collapse/search mirror) | ~14 | **Medium** | The BLOCK (it is the block's definitional job), leaning on the helpers |
| Theme sync (who owns `.dark`, F-09) | ~10 | **Kit-side docs/token fix** — not workspace glue; a shell toggling `<html>` would reach outside its boundary | The standing docs pass |
| No-match search state (F-04) | ~6 | **Part-side fix** — a decide-loudly violation inside the element | `kai-conversations` (§ 2, rides along per § Sequencing) |
| Layout CSS (no documented arrangement satisfies search+collapse, F-02) | 59 CSS | **Medium — arrangement** | The LAYOUT SHELL (§ 3); this category is the shell's whole reason to exist |

Two categories the first draft routed to "the preset" deserve the explicit re-statement:
projection, identity, and plumbing now ship as **the first official block plus headless
state helpers** — not as a preset element, which under the § 3 ruling does not exist to
receive them. The layout CSS ships as the shell.

## 2. What the parts need regardless — element-tier fixes

These are element-tier gaps the rung paid for. They are valuable under every § 4 open
question and proceed per § Sequencing.

### 2a. `kai-conversation-item` — BUILD NOW (owner-ratified 2026-08-20)

This supersedes the first draft's posed-not-settled slots-vs-events question. The ruling:
the **item-element pattern**, with batteries mode kept as sugar.

The evidence it answers: F-01 (the rung's S2). `kai-conversations`' complete event list
(element-meta.json: `kai-collapse-toggle`, `kai-conversation-select`, `kai-new-chat`,
`kai-search`, `kai-toggle-sidebar`) has no delete, no rename, no per-row action; rows
expose no `::part` (NOTES §1: only `trailing`, a plain string). The measured cost was a
**feature reduction**: the builder's hand-roll can only delete the ACTIVE conversation —
"you cannot delete an arbitrary row from the list without replacing the built-in list
wholesale."

The shape:

- **The consumer owns the loop** — framework-native `map` / `<For>` / `v-for` over their
  own records, emitting `<kai-conversation-item>` children into `<kai-conversations>`'
  light DOM. This is the construction vision applied to the rail: the row is composed,
  not configured.
- **The container detects light-DOM item children and skips its data rendering.**
  Batteries mode — the `conversations` array prop — STAYS, unchanged, as the sugar layer
  for the consumer who wants ten rows and no opinions.
- **Item slots**: default (title), `meta`, `leading`, `menu`. The `menu` slot takes the
  consumer's OWN popover — the owner's real-world example: rename / fork / session /
  archive — which is exactly the open-ended action surface no declarative `actions` prop
  could have enumerated. Any future declarative menu prop is batteries-mode sugar, never
  the only path.
- **The parent↔item contract is the hard 70%**, and it is where the element earns its
  tier: selection state flowing container→item, roving tabindex across slotted children
  (maintained via `slotchange`), and the accessible list semantics — the
  assembly-correctness a consumer loop cannot be asked to get right per-app.
  **AMENDED at implementation (ratified 2026-08-20, the sibling restructure):** the
  vocabulary is list/listitem rows with a `role="button"` body carrying `aria-current`
  and the roving tabindex, and the `menu` slot as the body's tabbable SIBLING — NOT the
  listbox/option relationship this line first named. Two axe rules make the original
  wording unimplementable alongside the menu slot above: `nested-interactive` bans
  focusable descendants of an option (negative tabindex included), and
  `aria-required-children` lets a listbox subtree own nothing but options, so a sibling
  menu is illegal anywhere inside one. The shape follows `src/ui/nav.tsx`
  TrailingActions (actions as siblings of the row control) and matches the
  batteries-mode row, which was already a button with `aria-current`.

Delete and rename stop being kit features at all: they are entries in the consumer's menu
slot, wired to the consumer's own state — with the mechanical consequences (abort the
in-flight stream, drop late deltas) available from the § 3 state helpers.

### 2b. The naming collision — SETTLED (owner-ratified 2026-08-20)

The first draft posed which `kai-search` keeps the name. Ruling: **the sidebar keeps
"search"** — conversation filtering is what search means in chat products — and the
composer's web-search toggle renames `search` → `webSearch` / `kai-web-search` on
`kai-prompt-input`, `kai-chat`, and the workspace surface (element-meta.json, all four
listings today). `feat!`, pre-1.0, a minor bump under release-please. The evidence is the
builder's monolith rejection over exactly this misnomer (NOTES §2): the name did not
merely confuse, it cost the kit its one chance at being adopted whole.

### 2c. The toast z-index contract — F-20

`kai-toast-region` paints at a hardcoded `z-index: 100`, documented nowhere, with no
override hook — the IVP found every toast buried under the app's own fixed-position
layout, and the fix was archaeology (devtools, not docs). Fix: a `--kai-toast-z` custom
property (the kit decides the default stacking; the app can re-decide, loudly, in its own
CSS) plus the one-sentence doc ("your app chrome must stay below the toast layer"). The
first block's delete flow rides on that toast, so this lands before or with it.

### 2d. Reasoning streams into a collapsed panel — NEW finding, F-21

From the 2026-08-20 latency diagnosis
(`.superpowers/sdd/2026-08-20-rung-3/latency-debug/report.md`): the pipeline handles
reasoning-first models end to end — `formats/openai.ts` parses `reasoning` /
`reasoning_content`, `consume.ts` builds reasoning parts, `message.tsx` renders a
"Thinking" disclosure — but `packages/ui/src/components/reasoning.tsx` gates its
auto-open-while-streaming on an `isStreaming` prop that
`packages/ui/src/components/message.tsx` **never passes**. So a reasoning-first model
(the diagnosis drove `deepseek/deepseek-v4-flash-0731` through 8 real OpenRouter calls)
streams its thinking into a collapsed, motionless panel: the report's mid-stream
screenshot shows a completely blank thread, and the measured invisible-reasoning window
ran 0.9s to 16s depending on provider routing. The proxy and the client render path were
both measured clean — this one missing prop is where the perceived latency lives. Fix in
`message.tsx`; rides along per § Sequencing.

### 2e. Smaller part fixes the inventory paid for

- F-04: `kai-conversations`' empty state must key off the FILTERED count (decide loudly —
  in the element, where it fixes every consumer, batteries mode and item mode alike).
- F-10: `scope` required with no stated meaning; `lastMessageAt` and `updatedAt` both
  required with one documented (NOTES §12 — the builder guessed `{ type: 'collection' }`
  for every row). Make the unexplainable fields optional or document what they drive.
  The item element sharpens this: a required prop a consumer cannot explain is worse on
  an element they now instantiate per row.
- F-03: state the search semantics (titles-only, non-disableable, local) where the MCP
  and docs render the element — the builder got them from the compiled bundle.
- F-02's documentation half: until the shell ships, the sibling arrangement the builder
  used is the only one satisfying search+collapse and is "not documented as a supported
  arrangement" (NOTES §2). The shell resolves this structurally; the recipe should stop
  recommending an arrangement that cannot satisfy the pair in the meantime.

## 3. The dissolution — shell + block + helpers (owner-ratified 2026-08-20)

This supersedes the first draft's § 3 (a preset element composing the parts) entirely.
**`kai-workspace` dissolves as a chat preset.** Its 32-prop / 10-event surface (counted
from `packages/ui/src/elements/element-meta.json`; re-count there) splits three ways, and
no chat mega-element remains.

### 3a. The layout shell (layout element, npm-updateable)

`kai-workspace` re-casts as a slotted, **chat-agnostic** layout shell:

- Slots: `left-aside` · `main` · `right-aside` · `header` · `footer`.
- Behaviors — the prop/JSON-driven things CSS alone cannot do: resize handles between
  regions, collapse-below-breakpoint, and a mobile drawer for the asides.
- Precedent: `kai-dock` (`docs/superpowers/specs/2026-08-19-kai-dock-design.md`), the
  proven layout element — placement, focus-return, escape/close, z-layering, no domain
  knowledge. The shell is its big sibling: same tier, drawn at page scale.
- It knows nothing about chat. A consumer can put a file tree in `left-aside` and a
  terminal in `main`; the workspace app puts `kai-conversations` and `kai-chat` there.

This is where the inventory's 59 lines of F-02 layout CSS go: the arrangement that
satisfies search+collapse — a rail column that actually collapses beside a main region —
becomes the shell's default behavior instead of every consumer's hand-owned flexbox.

### 3b. The semantic glue has NO element home — it ships as the first block + state helpers

The sidebar-selection→thread swap, the projection, the identity management: under the
taxonomy these are not element material (they orchestrate an APP, and an element that
orchestrates an app is the monolith again). They ship twice, split by updateability:

- **The first official BLOCK**: sidebar + `kai-chat` + persistence wiring inside the
  shell, emitted by the scaffolder / create-kai, with `examples/apps/workspace/` as its
  reference implementation. The consumer owns this code from generation time — the
  accepted trade-off from § Taxonomy, stated again because it is the design: the
  persistence policy, the fetch line, the menu actions are exactly what a consumer should
  be editing without asking us.
- **Headless helpers in `@kitn.ai/ui/state`** for the mechanical chat-aware parts, which
  stay npm-updateable: the thread-switching fold (the id-bound `SetMessages`,
  per-conversation loading, the abort map, delete-under-stream safety — the inventory's
  identity category, verbatim), and the persistence seam (the debounce/flush shape plus
  the `parseStoredThread` validator from F-18, whose `MessagePart` variant list derives
  from the union in `src/elements/chat-types.ts` — the same derivation `lint:silent-drops`
  and `verify:scaffold` use — so consumer storage code stops hand-typing the union).

**The five-minute start = scaffold the block, not mount a mega-element.** The first-run
moment the RFC defended survives as a generation step: one scaffolder call emits a working
workspace whose every line the consumer may edit. The first draft's Q2 (does the preset
compose `kai-chat` or `kai-thread`+`kai-prompt-input`?) is **MOOT**: blocks compose
`kai-chat`; no preset element exists to stack.

### 3c. Honest migration — where the 32 props go

By destination (prop names from element-meta.json):

- **To the shell** (arrangement behavior): `sidebarWidth` / `sidebarMinWidth` /
  `sidebarMaxWidth` (or CSS custom properties — open question), `sidebarCollapsed` /
  `defaultSidebarCollapsed` (as generic aside collapse), `collapseBelow`, `compact`.
  `theme` stays, as on every element.
- **To the parts inside the block** (the consumer's own markup now carries them):
  `conversations` / `activeId` / `groups` / `noConversations` → `kai-conversations`;
  `messages` / `loading` / `proseSize` / `codeTheme` / `codeHighlight` / `chatTitle` /
  `scrollButton` / `cardTypes` / `cardSchemas` → `kai-chat`; `value` / `placeholder` /
  `suggestions` / `suggestionMode` / `voice` / `triggers` / `kindIcons` and the renamed
  `webSearch` (§ 2b) → the composer surface; `models` / `currentModel` / `context` → 
  header chrome the consumer slots (a model picker is a part in a slot, not three
  orchestrator props).
- **Events**: the shell keeps only layout events (`kai-sidebar-toggle`-shaped, names to be
  settled with the slot names); every chat event (`kai-submit`, `kai-conversation-select`,
  `kai-message-action`, `kai-model-change`, …) is listened to on the part that fires it,
  in the block's consumer-owned code — which also dissolves the first draft's
  `kai-sidebar-toggle` vs `kai-toggle-sidebar` unification question down to the shell's
  own naming pass.

**What breaks:** everything about `kai-workspace`-as-chat-element — a consumer driving it
today re-generates as a block or re-slots the shell by hand. Plus the § 2b rename and any
F-10 row-field loosening. Pre-1.0: `feat!`, a minor bump under release-please, per
conventions. The RFC's phased-migration discipline (additive first, `/consumer-regression`
green before any removal) still governs; the RFC's prop-usage-audit risk is cheaper now —
the corpus apps plus the starters are a countable consumer set.

## Sequencing (owner-ratified 2026-08-20)

Settles the first draft's Q6:

- **Two parallel element lanes, disjoint by construction**: `kai-conversation-item`
  (§ 2a) and the layout shell (§ 3a). Neither blocks the other.
- **State helpers + the first block** land on both lanes: the helpers have no DOM
  dependency on either element; the block is generated against whatever has landed and is
  re-generated cheaply (that being the point of blocks).
- **The small part fixes ride along in whichever PR touches their files**: F-04 (no-match
  empty state), F-20 (`--kai-toast-z`), the § 2b `webSearch` rename, and F-21 (the
  `isStreaming` prop `message.tsx` never passes).
- **The RFC's `kai-chat`-as-preset phase stays future**, unblocked by any of this — the
  block composes today's `kai-chat` as-is.

## 4. Explicitly not doing + open questions

- **Implementing anything.** This document ends at owner review (the rung-3 spec's owner
  ruling; the plan's Task 8: "deliverable only"). No implementation plan either — that is
  a separate, later document if the owner green-lights the direction.
- **Persistence as kit behavior** — § 1. Not localStorage, not IndexedDB, not a `persist`
  prop on anything. The validator and the seam are helpers; the policy is the block's
  consumer-owned code.
- **Re-casting `kai-chat`** — the RFC's phase 1, explicitly future per § Sequencing.
- **A declarative row-actions prop** — permitted later as batteries-mode sugar (§ 2a),
  not designed here, never the only path.
- **Server-side or multi-tab sync** — application territory, same boundary as
  persistence.
- **The MCP/docs teaching-gap fixes** (F-03/F-08/F-09/F-13 doc sentences, the
  wrapper-layer discoverability gap, `debug`'s 0-for-2) — they ride the standing docs
  pass and the banked rung follow-ups. Note the scaffolder work here is larger than a doc
  fix: blocks make the scaffolder a distribution channel (§ Taxonomy), and the
  `workspace` archetype must stop emitting the unwired Artifact split while omitting the
  rail (F-16) before it can carry the first block.

### Open questions for the owner (what genuinely remains)

1. **The persistence helper's exact API shape** — events only, callbacks, or a small
   store-shaped object; and which entry point carries `parseStoredThread`.
2. **Shell slot and event naming** — `left-aside`/`right-aside` vs `start`/`end`
   (logical properties suggest the latter; `kai-dock` precedent to follow), and the
   layout event names.
3. **Shell layout knobs**: props vs CSS custom properties for the aside widths.
4. **Does `kai-prompt-dock` formally reclassify as a layout element now, or at its next
   touch?** (Pure bookkeeping — docs/MCP tier labels — but the taxonomy should not ship
   with a known misfiled element unaddressed.)
5. **The batteries-mode boundary on `kai-conversations`**: when item children are
   detected, which container behaviors (search filter, grouping, empty state) still
   apply to slotted items and which become the consumer's loop's job.

## 5. Measurement — how a future rung proves the shell + block + helpers

The claim this spec makes is falsifiable and should be falsified the same way it was
produced: **rebuild the same app, front-door-first, against the shell + the first block +
the state helpers, and re-run the glue-code inventory.**

- **Baseline**: findings.md § 5 — 342 authored TS/TSX code lines, ~300 glue, per-category
  table in § 1. The artifact of record is
  `docs/superpowers/research/2026-08-20-rung-3-front-door/findings.md`; the corpus copy of
  the measured code is `examples/apps/workspace/`.
- **Re-measure**: a future rung's comparer produces the same per-category table over the
  rebuilt app, same method (non-blank non-comment code lines per file and region, as
  findings § 5 states it), landing in that rung's `findings.md`.
- **The distinction that keeps the ratchet honest — glue vs composition.** Under the
  construction vision the rebuilt app is SUPPOSED to contain consumer-authored lines: the
  loop over `<kai-conversation-item>`, the consumer's menu popover, the persistence
  policy, the fetch line. Those are **composition** — lines expressing an app decision or
  an app's own markup — and are expected, not counted as glue. **Glue** remains what
  findings § 5 measured: lines that exist only to make two kit pieces cooperate
  (projection plumbing, identity bookkeeping, event mirroring, arrangement CSS) while
  deciding nothing. The re-measure classifies every line as one or the other, in the
  rung's findings, before totalling.
- **Expected shape of the result**: the mechanical-wiring categories (identity, plumbing,
  projection scaffolding) and the F-02 layout CSS should approach zero — that is what the
  helpers and the shell absorb. Success is the GLUE total falling materially under the
  baseline recorded in `findings.md` § 5 — a ratchet, not a target — while the
  composition lines are reported alongside it, unpenalized.
- **The same rebuild re-measures the teaching layer**: does the front door find the
  shell, the item element, and the block scaffold? Does the builder eject cleanly —
  editing block code rather than fighting an element? That tests the no-ejection-cliff
  claim the way rung 3 tested the monolith.
- Regression floor for existing consumers: `/consumer-regression` green through the
  migration window (the RFC's success criterion, unchanged).

What this measurement deliberately does not use: any figure retyped into this spec or the
docs. The baseline lives in the findings artifact; the re-measure lives in the future
rung's; this document only names them.
