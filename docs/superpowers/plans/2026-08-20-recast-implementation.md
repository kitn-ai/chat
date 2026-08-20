# Implementation plan: the workspace re-cast — construction over configuration

Date: 2026-08-20. Status: DRAFT — executes only after the owner green-lights the spec.

**Spec (the authority):** `docs/superpowers/specs/2026-08-20-workspace-recast-design.md`.
This plan implements its § Sequencing exactly: two parallel element lanes (A: `kai-conversation-item`,
B: the layout shell) plus a small-fixes lane (C) riding along, then Phase 2 (D: state helpers,
E: the first block + corpus migration, F: final gates) after A+B+C merge.

**Goal:** dissolve `kai-workspace` as a chat preset into a chat-agnostic layout shell; add the
`kai-conversation-item` element pair (consumer-owned loop, batteries mode kept as sugar); land the
ridden-along part fixes (F-21, F-04, F-20, the § 2b `search`→`webSearch` rename); then ship the
`@kitn.ai/ui/state` thread-switching + persistence helpers and the first official scaffolder BLOCK,
migrating `examples/apps/workspace/` to consume them.

**Architecture:** Solid components in `packages/ui/src/components/` are the source of truth;
`packages/ui/src/elements/` wraps `kai-*` facades via `defineWebComponent`; shared registries
(`register-impl.ts`, `slots.ts`, `src/solid.ts`, `element-meta.json` via `build:api`) serialize
through the supervisor. State helpers are I/O-free folds in `packages/ui/src/state/`. The scaffolder
(`packages/ui/src/agent-tooling/`) is the block's distribution channel.

**Tech stack:** SolidJS + TypeScript, Vitest (jsdom `unit` + `emitted` projects), Tailwind-compiled
shadow CSS, pnpm + NX (root-invoked), Playwright over Storybook dev for real-browser IVP.

**Execution mode:** supervised parallel execution by pooled workers. One worker per lane, writer-locked
to the lane's Files list. Anything in § Global Constraints "supervisor-serialized" is handed to the
supervisor as an exact insertion, never edited by a lane worker.

---

## Global Constraints (standing rules — verbatim, every worker)

- **Run git from the repo root** (`/Users/home/Projects/kitn-ai/kitn-chat`). Commits are the
  supervisor's; workers never commit, checkout, reset, or stash.
- **Writer-lock per dispatch**: edit only the files named in your task's Files list. Needing a file
  outside it = stop and report.
- **Never `nx test`**; never trust NX caches for a verdict — `nx typecheck ui` has printed a cached
  green over broken code. Verify with `npm run typecheck` inside `packages/ui`, or `--skip-nx-cache`.
  `nx build ui` can cache-skip the derived-artifact generators; when artifacts must regenerate, use
  `npm run build:api` inside `packages/ui` or `--skip-nx-cache`. A cached build looks exactly like a
  successful one.
- **TDD red-first — watch every new check fail** before making it pass. A guard you never saw fail
  proves nothing (the repo's dominant recorded failure mode).
- **Real-browser IVP for anything user-facing**: jsdom misses focus, paint, and geometry. Probes
  assert **geometry** (bounding rects, computed style, actual focus order), not state strings.
  Storybook via `pnpm dev` (port 6006), not storybook-static (which can't register web components).
- **Shared registries serialize through the supervisor**: `src/elements/register-impl.ts`,
  the `src/elements/slots.ts` allowlist, `src/solid.ts`, and every `build:api` regeneration
  (`element-meta.json`, `element-manifest.json`, `element-types.d.ts`, React wrappers,
  `docs/web-components.md`, `llms-full.txt`). Workers hand the supervisor the exact insertion text
  and report NEEDS-REGEN; they do not edit these in parallel.
- **No em dashes in rendered prop/slot docs**; mirrored descriptions (facade JSDoc ↔ slots.ts `doc`
  ↔ Solid component JSDoc, wherever a description appears twice) must be word-identical.
- **Element coverage guard**: every new `kai-*` tag needs real coverage per
  `tests/elements/element-coverage.test.ts` (facade-module import or literal construction), or a
  named `EXEMPT` entry carrying a reason. An exemption is a punch-list item, not a decision.
- **Derive counts, never restate them.** No prop/event/cell/line count typed into code, tests, or
  docs that an artifact can produce — name the artifact (`element-meta.json`, the findings file,
  the gate's own printout) instead.
- **Everything the model produced is untrusted input** — any new sink gets an existing guard
  (`isSafeUrl`/`isRenderableLink`), never a third policy.
- **Decide loudly** — no silent drops, truncations, or fallbacks; `lint:silent-drops` enforces this
  on `src/wire`-shaped discrimination over `MessagePart`.

All commands below run from the repo root unless prefixed `packages/ui$`.

---

## PHASE 1 — three parallel lanes

Lanes A, B, C are disjoint by construction (per spec § Sequencing). The one deliberate seam:
`src/elements/chat-workspace.tsx` belongs to Lane B ONLY — Lane C4's rename does NOT touch it (the
workspace `search` prop dies with the dissolution; see C4 Interfaces).

---

### LANE A — `kai-conversation-item` (HIGH effort, one worker, writer-locked)

Spec §§ 2a, 2e (F-10 note), open question 5.

**Lane Files (the writer lock):**
- `packages/ui/src/components/conversation-item.tsx` (EXISTS — today a data-mode row taking a
  `ConversationSummary`; this lane extends it into the slottable item, keeping the data-mode entry
  the batteries layer renders)
- `packages/ui/src/components/conversation-item.test.tsx` (new)
- `packages/ui/src/components/conversation-list.tsx` (children-mode detection + contract)
- `packages/ui/src/components/conversation-list.test.tsx` (new; jsdom contract tests)
- `packages/ui/src/elements/conversation-item.tsx` (new facade)
- `packages/ui/src/elements/conversation-list.tsx` (light-DOM child mode on `kai-conversations`)
- `tests/elements/conversation-item-element.test.tsx` (new; coverage-guard-credited construction)
- `packages/ui/src/components/conversation-item.stories.tsx` (probe stories for A2's IVP)
- `apps/docs/src/content/docs/components/conversations.mdx` (item mode + batteries boundary docs)

**Supervisor-serialized (hand over exact insertions, never edit):** `register-impl.ts` import line;
`slots.ts` slot defs; `src/solid.ts` export; `build:api` regen.

#### A1 — the Solid item component, TDD'd

- [ ] Red first: write `src/components/conversation-item.test.tsx` asserting the slotted-item API —
      default slot (title), `meta`, `leading`, `menu` slots; active state reflected as
      `aria-selected` + a styling hook; `::part` names on the row regions (row, title, meta,
      leading, menu). Run
      `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/conversation-item.test.tsx`
      — watch it fail on the missing surface.
- [ ] Extend `src/components/conversation-item.tsx`: keep the existing
      `ConversationItem(props: ConversationItemProps)` data-mode component (batteries mode renders
      it unchanged — A4 pins this), add the slotted-item shape. Whether that is one component with
      two prop shapes or a sibling `SlottedConversationItem` export: **implementer proposes in
      report, supervisor ratifies** (constraint: `src/solid.ts` needs a public component + Props
      type per element for `verify:solid-coverage`).
- [ ] `menu` slot takes the consumer's OWN popover (spec: rename/fork/archive live there); the
      component provides only the slot + focus/ARIA plumbing, never a declarative actions prop.
- [ ] Green; then `packages/ui$ npm run typecheck`.

Verification gate: the new unit file green; typecheck green; no other suite file touched.

#### A2 — the parent↔item contract (the hard 70%)

- [ ] Red first, in `src/components/conversation-list.test.tsx`: (1) container with item children
      renders NO data rows even when `conversations` is also set (children win; detection via
      `slotchange`/children inspection); (2) selection flows container→item (active id set on the
      container marks exactly one item `aria-selected="true"`); (3) item activation (click/Enter/
      Space) emits the selection callback with the item's id; (4) ARIA: container
      `role="listbox"`, items `role="option"`; (5) roving tabindex bookkeeping: exactly one item
      `tabindex="0"`, the rest `-1`, re-derived on `slotchange` when items are added/removed.
- [ ] Implement in `conversation-list.tsx` (children-mode detection + the roving-tabindex/ARIA
      controller maintained via `slotchange`) and `conversation-item.tsx` (item side: id contract,
      keyboard handlers). The item's identity prop (`id` attr vs prop) and the container↔item
      communication channel (context vs DOM traversal): **implementer proposes in report,
      supervisor ratifies** — the facade layer (A3) must survive it, so propose before building A3.
- [ ] Batteries-mode boundary (spec open question 5): when item children are detected, the
      container's search filter, grouping, and empty state do NOT apply to slotted items — the
      consumer's loop owns them; the container still renders its chrome (header, search box,
      new-chat) and still fires `kai-search` so the consumer can filter their own loop.
      **This is a proposed resolution of a spec open question — flag it in the lane report for
      owner ratification; do not document it as settled until ratified.**
- [ ] Real-browser probes (jsdom misses focus/paint — per the repo's record, focus order and
      `slotchange` timing MUST be probed in Chromium). Add probe stories in
      `conversation-item.stories.tsx`, then named probe scripts, `watch-them-fail` style:
      - `packages/ui/scripts/probe-conversation-item-focus-order.mjs` — Tab enters the list at the
        active item, Arrow keys move focus item-to-item across SLOTTED children,
        `document.activeElement` chain asserted through the shadow boundary (geometry: the focused
        item's bounding rect is the one that changed style).
      - `packages/ui/scripts/probe-conversation-item-slotchange.mjs` — appending/removing a
        light-DOM item at runtime re-derives roving tabindex (exactly one `tabindex="0"` after
        mutation).
      Pattern: the existing `packages/ui/scripts/probe-*.mjs` files. Run against `pnpm dev`
      Storybook (6006). Record pass output in the lane report.

Verification gate: contract unit file green; both probes pass in real Chromium with output pasted.

#### A3 — facade + registration + coverage

- [ ] New facade `src/elements/conversation-item.tsx`: `defineWebComponent('kai-conversation-item', …)`
      following the house pattern (read `src/elements/conversation-list.tsx` and `src/elements/dock.tsx`
      first). Scalars as attributes; JSDoc prop docs word-identical to the Solid component's; no em
      dashes in rendered prop/slot docs.
- [ ] `src/elements/conversation-list.tsx`: light-DOM child mode — detect `kai-conversation-item`
      children, skip data rendering, keep the `conversations` array prop path byte-for-byte
      untouched (A4 pins it).
- [ ] F-10 rides along here (spec § 2e): on the batteries-mode row shape, make `scope` and the
      second timestamp optional or document what each drives — sharpened because consumers now
      instantiate items per row. Mirror the wording everywhere it appears.
- [ ] Hand the supervisor, as exact text in the lane report (do NOT edit these files):
      1. the `register-impl.ts` import line (`import './conversation-item';`) and where it slots
         in the existing ordering;
      2. the `slots.ts` entries for the item's slots (default/meta/leading/menu) with their
         `doc` strings (word-identical to the facade JSDoc);
      3. the `src/solid.ts` export line(s).
      Then the supervisor runs `packages/ui$ npm run build:api` (regenerates `element-meta.json`,
      `element-manifest.json`, element types, React wrappers, `docs/web-components.md`,
      `llms-full.txt`) — NEEDS-REGEN, serialized.
- [ ] Coverage guard: `tests/elements/conversation-item-element.test.tsx` must import the facade
      module or literally construct `<kai-conversation-item>` (guard rules in
      `tests/elements/element-coverage.test.ts` — a tag in a string/fixture/comment does not
      count). No `EXEMPT` entry: this element ships covered. Watch the guard fail first by running
      it after the manifest regen but before the test lands.
- [ ] Docs: `apps/docs/src/content/docs/components/conversations.mdx` gains the item-mode section
      (consumer loop example per framework voice, `menu` slot example, batteries boundary).

Verification gate: after supervisor regen — `tests/elements/element-coverage.test.ts` green with
the new tag credited; `packages/ui$ npm run typecheck` green; `verify:consumer` deferred to F.

#### A4 — batteries-mode coexistence (the reactivity-contract pattern)

- [ ] One harness, both modes, in `tests/elements/conversation-item-element.test.tsx` (or a sibling
      it imports): (1) `kai-conversations` with only the `conversations` array prop renders data
      rows exactly as before this lane (pin the current rendered shape BEFORE A3's edits land —
      red-first means capturing today's behavior as the assertion); (2) the same harness with item
      children renders the children and zero data rows; (3) switching a harness from no-children to
      children flips modes. Pair every stale-case assertion with an update case over the same
      harness so "nothing rendered" cannot pass vacuously (the `reactivity-contract.test.tsx`
      discipline, by name).
- [ ] Array-prop reactivity in batteries mode re-asserted: new array reference notifies, new item
      object identity makes the change visible (do not weaken the #224 contract).

Verification gate: coexistence file green; full
`pnpm --filter @kitn.ai/ui exec vitest run --project=unit` green for the lane's files.

**Lane A Interfaces**
- Consumes: `ConversationSummary` from `packages/ui/src/types` (existing); slot-name vocabulary
  from spec § 2a (`meta`/`leading`/`menu`, default = title).
- Produces (other lanes/phases depend on these names): tag **`kai-conversation-item`**; container
  detection contract "light-DOM `kai-conversation-item` children ⇒ container data rendering off";
  events unchanged on `kai-conversations` (`kai-conversation-select` remains the selection event in
  both modes — item activation surfaces through it; the sidebar KEEPS `kai-search` per spec § 2b).
  Phase 2's block (Task E) emits the consumer loop against exactly this contract.

---

### LANE B — the layout shell (HIGH effort, one worker, parallel with A, writer-locked)

Spec §§ 3a, 3c; open questions 2 and 3.

**Lane Files (the writer lock):**
- `packages/ui/src/components/workspace-shell.tsx` (new Solid shell; name final unless the
  supervisor renames at ratification)
- `packages/ui/src/components/workspace-shell.test.tsx` (new)
- `packages/ui/src/elements/chat-workspace.tsx` (the `kai-workspace` facade, reshaped)
- `tests/elements/workspace-shell-element.test.tsx` (new; coverage-credited)
- `packages/ui/src/components/workspace-shell.stories.tsx` (probe stories for B4)
- `apps/docs/src/content/docs/guides/use-a-workspace.mdx` (migration docs)
- Existing workspace stories that drive the old prop surface
  (`packages/ui/src/elements/workspace-home.stories.tsx`, `workspace-slots.stories.tsx`,
  `split-workspace.stories.tsx`) — updated to the shell, or retired with the supervisor's sign-off
  listed per file in the report.

**Supervisor-serialized:** `slots.ts` shell slot defs; `src/solid.ts` export; `build:api` regen
(the reshaped `kai-workspace` listing in `element-meta.json` IS the migration's artifact of
record). `register-impl.ts` already imports `./chat-workspace` — no insertion needed unless the
facade file is renamed, which this plan does not do (tag and module stay; the surface changes).

#### B1 — the Solid shell, TDD'd

- [ ] Decide-and-flag first (spec open questions 2 and 3, resolved by proposal, not TBD):
      slot names `left-aside`/`right-aside` vs `start`/`end`, layout event names, and props-vs-CSS-
      custom-properties for aside widths — **implementer proposes in the lane report with the
      `kai-dock` precedent examined** (`docs/superpowers/specs/2026-08-19-kai-dock-design.md` +
      `packages/ui/src/elements/dock.tsx`), **supervisor ratifies BEFORE the facade (B3) is
      written**. B1's tests may start against the proposal; renames before ratification are cheap,
      after B3 they touch registries. The plan's placeholder vocabulary below uses the spec's
      (`left-aside`/`main`/`right-aside`/`header`/`footer`); substitute the ratified names
      everywhere.
- [ ] Red first in `workspace-shell.test.tsx`: five named slots render projected content in the
      right regions; collapse-below-breakpoint state flips at the configured width; the collapse
      is controlled/uncontrolled per the house pattern (read the existing rail-collapse block in
      `src/elements/conversation-list.tsx` ~line 96, which names `kai-workspace` as its own
      precedent); resize handle drag updates the aside size variable; mobile drawer mode renders
      asides as overlay + focus-return on close (the `kai-dock` behaviors at page scale).
- [ ] Implement `src/components/workspace-shell.tsx` — chat-agnostic: zero imports from chat
      components; a file tree in `left-aside` must be as valid as `kai-conversations`.
- [ ] Reuse before writing: check `src/elements/resizable.tsx` / `pane-group.tsx` /
      `src/components/resizable.test.tsx` for an existing resize primitive to compose rather than
      a second drag implementation; report which was used.

Verification gate: shell unit file green; `packages/ui$ npm run typecheck` green.

#### B2 — the § 3c migration of the 32-prop surface (`feat!`)

The prop list and its three-way destinations are spec § 3c; the count is counted from
`packages/ui/src/elements/element-meta.json` — re-count there, never from this plan.

- [ ] Shell keeps (as generic aside behavior, renamed per B1's ratified naming): the sidebar
      width/min/max knobs (props or CSS custom properties per ratification), collapsed /
      default-collapsed, `collapseBelow`, `compact`, `theme`.
- [ ] Everything chat-shaped comes OFF the facade: the message/composer/model/conversations props
      and every chat event. The facade dispatches only layout events (ratified names).
- [ ] "What breaks" documented where consumers read it: the facade's JSDoc header and
      `apps/docs/src/content/docs/guides/use-a-workspace.mdx` carry the § 3c destination table in
      consumer voice (each removed prop → the part or slot that now carries it, the renamed
      `webSearch` included), plus the block-scaffold pointer as the migration path. No em dashes
      in rendered docs; mirrored wording word-identical. Commit type is `feat!` — the supervisor's
      commit, noted here so the docs say "breaking" plainly.
- [ ] Red-first for the removal: before deleting, write the coexistence-style test asserting the
      NEW surface (slots project, layout events fire, chat props gone from the observed DOM), watch
      it fail against the old facade, then reshape.

Verification gate: unit green; `packages/ui$ npm run typecheck` green; the updated
`use-a-workspace.mdx` builds (`nx build docs` or the docs dev server) — full consumer gates in F.

#### B3 — facade + regen + coverage

- [ ] Reshape `src/elements/chat-workspace.tsx` in place (tag `kai-workspace` stays; module path
      stays; `register-impl.ts` untouched). Facade renders the shell + named slots, scalar knobs as
      attributes, JSDoc word-identical to the shell component's.
- [ ] Hand the supervisor exact text: `slots.ts` defs for the five shell slots (with `part: true`
      where styling hooks are promised) and the `src/solid.ts` export for `WorkspaceShell` +
      `WorkspaceShellProps`. Supervisor runs `packages/ui$ npm run build:api` — the diff to
      `element-meta.json`'s `kai-workspace` listing is the migration's reviewable artifact.
- [ ] Coverage: `tests/elements/workspace-shell-element.test.tsx` constructs `<kai-workspace>` with
      slotted children and asserts projection + one layout event. The tag is already covered today;
      the point is the guard must stay green over the NEW surface — if any existing covering test
      dies with the old props, this file is its replacement.

Verification gate: `tests/elements/element-coverage.test.ts` green post-regen; typecheck green.

#### B4 — real-browser IVP (geometry, not state strings)

Named probes, run against `pnpm dev` Storybook in Chromium, results pasted in the lane report:

- [ ] `packages/ui/scripts/probe-workspace-shell-resize.mjs` — drag the handle; assert the aside's
      `getBoundingClientRect().width` changed by the drag delta and `main` reflowed (its rect
      grew). Geometry, not a `collapsed` attribute read.
- [ ] `packages/ui/scripts/probe-workspace-shell-collapse.mjs` — resize the viewport across the
      breakpoint; assert the aside's rect collapses (width → collapsed width) and restores.
- [ ] `packages/ui/scripts/probe-workspace-shell-drawer.mjs` — narrow viewport: aside opens as an
      overlay (rect overlaps `main`, z-order verified via `elementFromPoint`), Escape closes,
      focus returns to the opener (`document.activeElement`).
- [ ] `packages/ui/scripts/probe-workspace-shell-slots.mjs` — slotted content in all five slots
      actually paints: each projected node has a non-zero rect inside its region's rect.

Verification gate: all four probes pass with output recorded; each was first run against a
deliberately broken story (or pre-implementation) to watch it fail.

**Lane B Interfaces**
- Consumes: `kai-dock` precedent (spec § 3a); resize primitive from `src/elements/resizable.tsx`
  if reusable; B1's ratified naming.
- Produces: tag **`kai-workspace`** as a chat-agnostic shell — slot names + layout event names as
  ratified in B1 (recorded in the lane report AND in `element-meta.json` after regen; Phase 2's
  block emits against those names, so E blocks on B's ratification record). The workspace `search`
  prop and every other chat prop are GONE from this surface — Lane C4 must not reach into this file.

---

### LANE C — small part fixes (MEDIUM effort, one worker, writer-locked)

Spec §§ 2b, 2c, 2d, 2e; all four ride along per § Sequencing.

**Lane Files (the writer lock):**
- `packages/ui/src/components/message.tsx`, `packages/ui/src/components/message.test.tsx` (C1)
- `packages/ui/src/components/conversation-list.tsx` — **COLLISION with Lane A.** Resolution: C2's
  edit is dispatched to the Lane A worker as a follow-up task in the same context (one writer per
  file, per the writer-lock rule). It stays specified here because it is a C-scope deliverable; the
  supervisor routes it. Lane C does not open the file.
- `packages/ui/src/components/toast.tsx`, `packages/ui/src/components/toast.test.tsx` (C3)
- `packages/ui/src/elements/chat.tsx`, `packages/ui/src/elements/prompt-input.tsx`,
  `packages/ui/src/components/prompt-input.tsx` and its tests (C4)
- Docs pages naming the composer `search` toggle (C4 grep decides the exact set; known candidates:
  `apps/docs/src/content/docs/components/chat.mdx`, `components/prompt-input.mdx`,
  `components/composer.mdx`, `guides/use-the-chat-app.mdx`, `guides/build-a-composer.mdx`)
- `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` + integration templates under
  `packages/ui/src/agent-tooling/integrations/` where the grep hits the globe toggle (C4)

**Supervisor-serialized:** `build:api` regen after C4 (event/prop rename changes
`element-meta.json` + React wrappers + generated docs).

#### C1 — F-21: `message.tsx` passes `isStreaming` to `Reasoning`

- [ ] Red first: a test in `src/components/message.test.tsx` mounting the parts renderer with a
      reasoning part on an actively-streaming assistant message, asserting the `Reasoning`
      disclosure is OPEN while streaming (today it renders collapsed — the reproduced defect from
      `.superpowers/sdd/2026-08-20-rung-3/latency-debug/report.md`). Watch it fail.
- [ ] Fix at the `<Reasoning>` render site in `src/components/message.tsx` (~line 619: `Reasoning`/
      `ReasoningTrigger`/`ReasoningContent`): pass `isStreaming` (the prop `reasoning.tsx` already
      gates auto-open on, line ~47). The streaming signal's plumb from the thread (chat-thread's
      `loading` + last-assistant-message position, or a per-part in-flight marker): trace it in the
      file first; if no signal reaches the render site, **implementer proposes the plumb in the
      report, supervisor ratifies** — do not invent a second streaming source.
- [ ] Companion assertion: once streaming ends, the panel keeps its user-toggled state (don't
      regress `reasoning.test.tsx`'s existing contract — run it).

Gate: new test green, `reasoning.test.tsx` + `message.test.tsx` green.

#### C2 — F-04: `kai-conversations` no-match visible state (routed to Lane A's worker)

- [ ] Red first in Lane A's `conversation-list.test.tsx`: conversations present + a search query
      matching none ⇒ a VISIBLE no-match state (decide loudly), distinct from the zero-
      conversations empty state. Today the empty state keys off the unfiltered list
      (`src/components/conversation-list.tsx` ~146: empty renders only "when there are no
      conversations") so a no-match filter renders silence. Watch it fail.
- [ ] Key the empty/no-match branch off the FILTERED count (`filteredConversations()`, ~line 83);
      both modes considered: in batteries mode the element renders the state; in item mode the
      consumer's loop owns it (per A2's boundary ruling).
- [ ] Mirror the one-sentence behavior doc in the facade JSDoc + `conversations.mdx`,
      word-identical.

Gate: test green inside Lane A's suite run.

#### C3 — F-20: the `--kai-toast-z` token

- [ ] Red first in `src/components/toast.test.tsx`: setting `--kai-toast-z` on the host changes the
      region's effective z-index; unset falls back to the current default. Watch it fail against
      the hardcoded value.
- [ ] Replace the two hardcoded sites in `src/components/toast.tsx` (lines ~428 and ~459,
      `z-[100]`) with the token + default: `z-index: var(--kai-toast-z, 100)` (Tailwind arbitrary
      value or inline style — match the file's convention; both sites, same token).
- [ ] The one-sentence doc, everywhere the region is documented (facade JSDoc in
      `src/elements/toast.tsx` header comment counts as rendered docs — no em dashes,
      word-identical mirrors): "your app chrome must stay below the toast layer", plus the token.
      NOTE: `src/elements/toast.tsx` JSDoc edit is inside Lane C's lock; add the file to the lock
      list at dispatch.
- [ ] Do not disturb the intra-stack `z-index` math at `toast.tsx` ~480 (pill depth ordering) —
      `toast.test.tsx` ~323 pins it; run the whole file.

Gate: `toast.test.tsx` green including the new token cases.

#### C4 — the `search` → `webSearch` rename (`feat!`, spec § 2b)

Scope guard first: the SIDEBAR keeps `search`/`kai-search` (`kai-conversations` untouched — that
event is conversation filtering, the meaning the owner ratified). The rename hits only the
composer's web-search Globe: prop `search` → `webSearch`, event `kai-search` → `kai-web-search`,
on `kai-prompt-input` and `kai-chat`. The workspace listing dissolves in Lane B — C4 must NOT edit
`src/elements/chat-workspace.tsx`; the supervisor sequences B's facade reshape and C4's regen so
`element-meta.json` never publishes a half-renamed surface (regen once, after both land).

- [ ] Grep-driven inventory FIRST, pasted into the lane report:
      `grep -rn "'search'\|\"search\"\|kai-search\|onSearch" packages/ui/src/elements/chat.tsx packages/ui/src/elements/prompt-input.tsx packages/ui/src/components/prompt-input.tsx packages/ui/src/agent-tooling apps/docs/src/content/docs`
      then classify each hit: globe toggle (rename) vs sidebar/conversation search (keep) vs the
      scaffolder's unrelated `search` TOOL fixtures in `scaffold.ts` (~lines 570–924 and ~1497 —
      that is a sample MCP tool named `search`, NOT the globe; keep). Misclassifying the tool
      fixtures is this task's trap; the inventory is the deliverable that proves it was dodged.
- [ ] Red first: a facade test (element-level, e.g. extend the prompt-input element tests in
      `tests/elements/` or `src/elements/prompt-input-*.test.tsx` per the supervisor's file grant)
      asserting `webSearch` attribute enables the globe and it dispatches `kai-web-search`; watch
      it fail under the old names.
- [ ] Rename in `src/elements/prompt-input.tsx` (prop `search` ~line 32/96/218, event ~79,
      `onSearch` dispatch ~228), `src/elements/chat.tsx` (~90/100/167/181), and the Solid
      `src/components/prompt-input.tsx` surface it forwards to. No back-compat alias — `feat!`,
      pre-1.0, per conventions; the docs migration note says so plainly.
- [ ] Sweep every classified globe-hit in docs + scaffold templates + integration route templates;
      mirrored descriptions stay word-identical post-rename; no em dashes introduced.
- [ ] `packages/ui$ npm run verify:scaffold` (needs `nx build ui --skip-nx-cache` first) — the gate
      that compiles every emitted front end; read its printed axes/cell counts, never a copied
      figure. Run after the sweep.
- [ ] Report NEEDS-REGEN: `build:api` (element-meta, React wrappers, generated docs) — supervisor
      runs it after B3 lands (see scope guard above).

Gate: renamed-surface tests green; `verify:scaffold` green with printout in the report; grep
inventory shows zero unclassified hits.

**Lane C Interfaces**
- Consumes: `Reasoning`'s existing `isStreaming` prop (`src/components/reasoning.tsx` ~47); the
  filtered-count memo in `conversation-list.tsx`; spec § 2b's ruling.
- Produces: event name **`kai-web-search`** + prop **`webSearch`** on `kai-chat`/`kai-prompt-input`
  (Phase 2's block and Lane B's migration docs both reference these exact names); CSS token
  **`--kai-toast-z`** (default 100) — the block's delete-flow toast (Task E) rides on it.

---

## PHASE 2 — after A + B + C merge

### TASK D — state helpers in `@kitn.ai/ui/state` (HIGH effort, one worker)

Spec § 3b; open question 1 resolved by proposal.

**Files:**
- `packages/ui/src/state/threads.ts` + `packages/ui/src/state/threads.test.ts` (new — the
  thread-switching fold)
- `packages/ui/src/state/persistence.ts` + `packages/ui/src/state/persistence.test.ts` (new — the
  debounce/flush seam + `parseStoredThread`, F-18)
- `packages/ui/src/state/index.ts` (exports)
- File names above are the proposal default; the ratified API shape (below) may merge or rename
  them — the report records the final set.

**Supervisor-serialized:** none expected (`state/` has no registry), but `build:subpath-dts` /
`verify:dts` run inside the normal build — report NEEDS-REGEN if `index.ts` exports change the
public dts surface.

- [ ] **API shape first (spec open question 1): events only, callbacks, or a small store-shaped
      object, and which entry point carries `parseStoredThread` — implementer proposes in the
      report with a worked consumer snippet per option and a recommendation; supervisor ratifies
      before implementation proceeds past the red tests.** Constraints the proposal must honor:
      I/O-free pure folds (the `state/` charter — no fetch, no storage calls, no timers owned by
      the kit for persistence policy; the debounce/flush SEAM takes the consumer's scheduler);
      the kit decides HOW, the app decides WHETHER (retention/backend/quota stay consumer-owned).
- [ ] Thread-switching fold, red-first: id-bound `SetMessages` (a late delta for thread X never
      lands in thread Y), per-conversation loading state, the abort map (switching threads aborts
      or detaches the outgoing stream per the F-07 cancellation story), delete-under-stream safety
      (deleting the streaming thread aborts + drops late deltas). Each is one failing test before
      its code exists.
- [ ] `parseStoredThread` (F-18): validates a stored thread back into `ChatMessage[]`; the
      `MessagePart` variant list DERIVES from the union in
      `packages/ui/src/elements/chat-types.ts` — the same derivation `lint:silent-drops` and
      `verify:scaffold` use — never a hand-typed list. Unknown variants are decided LOUDLY
      (rejected or surfaced per the ratified shape, never silently dropped).
- [ ] `packages/ui$ npm run lint:silent-drops` — any code here discriminating `MessagePart` is
      wire-adjacent and must account for every variant or carry a parsed waiver naming its
      variants. Run `--self-test` once to watch the analyzer detect.
- [ ] Round-trip test: `createAssistantStream`/`appendTextPart` output → persist-shape → 
      `parseStoredThread` → identical thread (extend the pattern in
      `src/state/round-trip.test.ts`).

Gate: new state tests green; `lint:silent-drops` green; `packages/ui$ npm run typecheck` green.

**Task D Interfaces**
- Consumes: `ChatMessage`/`MessagePart` from `src/elements/chat-types.ts`; existing folds in
  `src/state/messages.ts` / `stream.ts`.
- Produces: the ratified helper API (names recorded in the report + `state/index.ts`) — Task E's
  block emits consumer code CALLING these exact exports; E blocks on D's ratification.

### TASK E — the first official BLOCK + corpus migration (HIGH effort, one worker; after B + D ratify)

Spec §§ Taxonomy (blocks), 3b, 4 (F-16 note).

**Files:**
- `packages/ui/src/agent-tooling/archetypes.ts` (the `workspace` archetype, ~line 45 — must stop
  emitting the unwired Artifact split while omitting the rail, F-16, before it can carry the block)
- `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` (the workspace block emission: shell +
  `kai-conversations` with a `kai-conversation-item` loop + `kai-chat` + the D helpers + the
  consumer-owned persistence/fetch lines)
- `packages/ui/src/agent-tooling/registry.ts` (if the block needs a registry entry — the gate's
  axes derive from the registry, so registering is what moves the cell counts on its own; read
  `registry.ts` + the `WHY NOT THE POWER SET` comment in `archetypes.ts` before choosing where the
  block lives on the surface axis)
- `packages/ui/src/agent-tooling/mcp/tools/scaffold.test.ts` (wording assertions; types are
  `verify:scaffold`'s job — emitted code lives in string literals)
- `examples/apps/workspace/` — MIGRATES to consume shell + block shape: its glue categories
  (projection, identity, plumbing, arrangement CSS) replaced by the shell + D helpers + the item
  loop; its persistence policy, fetch line, and menu actions STAY consumer-owned (they are the
  block's point). Its `README.md` provenance section GAINS the migration note (per the
  ladder-apps-record-prompts policy: provenance is appended, never rewritten).

**Supervisor-serialized:** `build:api` if the catalog/docs generators consume the new archetype
surface (`gen-catalog.mjs` runs inside `build:api`); report NEEDS-REGEN.

- [ ] F-16 first, red-first: a `scaffold.test.ts` case pinning that the `workspace` archetype's
      emission includes the rail and no unwired Artifact split; watch it fail against today's
      output.
- [ ] Emit the block: the scaffolder's workspace output composes `kai-workspace` (shell slots per
      B's ratified names) + `kai-conversations` + a framework-native loop of
      `kai-conversation-item` (A's contract) + `kai-chat` (with `webSearch`, C4's name) + D's
      helpers; the fetch line and persistence policy are consumer-owned lines the emission
      comments as such. Blocks compose `kai-chat` as-is — the RFC's `kai-chat`-as-preset phase
      stays future (spec § Sequencing).
- [ ] `packages/ui$ npm run verify:scaffold` (after `nx build ui --skip-nx-cache`): the gate's
      axes derive from the registry — read its PRINTED axes and cell counts to confirm the block's
      cells appeared; paste the printout. If the emission adds a `MessagePart`-discriminating
      renderer, the solid structural check (every variant branched) must stay green.
- [ ] Migrate `examples/apps/workspace/`: re-generate or hand-migrate to the block shape; keep the
      app's own decisions (policy lines) byte-comparable where unchanged; append the README
      provenance migration note (date, spec pointer, what was replaced by what).
- [ ] The migrated app builds and runs locally (its own dev command per its README).

Gate: `verify:scaffold` green with printout; scaffold wording tests green; the migrated app builds.

**Task E Interfaces**
- Consumes: A's item contract, B's ratified slot/event names (from B's report + `element-meta.json`),
  C4's `webSearch`/`kai-web-search`, C3's `--kai-toast-z` (the delete-flow toast), D's ratified
  helper API.
- Produces: the `workspace` block emission (the first official block); the migrated corpus app as
  the block's reference implementation (spec § 5's future re-measure target).

### TASK F — final gates (one worker or the supervisor; nothing merges past this red)

- [ ] `nx build ui --skip-nx-cache` (real build, generators guaranteed to run)
- [ ] `packages/ui$ npm run build:api` (derived artifacts fresh: `element-meta.json`,
      `docs/web-components.md`, `llms-full.txt`; never `gen-llms.mjs` standalone)
- [ ] `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`
- [ ] `pnpm --filter @kitn.ai/ui exec vitest run --project=emitted` (a green `unit` alone is not
      the merge gate)
- [ ] `nx typecheck ui --skip-nx-cache`
- [ ] `packages/ui$ npm run verify:consumer` (every `kai-*` registration — including
      `kai-conversation-item` — survives a real consumer bundler)
- [ ] `packages/ui$ npm run verify:starters`
- [ ] `packages/ui$ npm run verify:scaffold` (read the printed axes/counts)
- [ ] `packages/ui$ npm run lint:silent-drops && npm run lint:cdn-pins`
- [ ] Real-browser IVP of the MIGRATED corpus app (`examples/apps/workspace/` via its dev server,
      Chromium): send a message end-to-end, switch threads mid-stream (D's fold observable: no
      cross-thread delta), delete a row via the item `menu` (toast visible ABOVE app chrome —
      geometry via `elementFromPoint`), collapse/resize the shell (B4's probes re-aimed at the
      app), reasoning panel OPEN while a reasoning-first model streams (C1 observable).
      Screenshots + probe output in the phase report.
- [ ] Docs pass pointers (not this plan's work — banked): the standing docs pass carries
      F-03/F-08/F-09/F-13 and the wrapper-discoverability items per spec § 4; the shell resolves
      F-02 structurally, so the interim recipe warning (spec § 2e) is superseded — confirm the
      recipe page was updated by B/E's docs edits, else file it to the docs pass.
- [ ] `/consumer-regression` (smoke at minimum) before the `feat!` release window closes — the
      RFC's migration floor, unchanged (spec § 5).

---

## Coverage cross-check (spec § → plan task)

- Vision/Taxonomy — framing; enforced by A (item = element), B (shell = layout element), E (block).
- § 1 destinations table — D (identity, projection-fold, persistence seam), E (block-owned rows),
  B (F-02 layout CSS), C2/F-04 (rides in A's file via routed dispatch), § theme-sync F-09 → docs
  pass (F, pointer only).
- § 2a → Lane A. § 2b → C4 (+ B2 for the workspace surface). § 2c → C3. § 2d → C1.
- § 2e: F-04 → C2; F-10 → A3; F-03 + F-02-docs → F's docs-pass pointer (F-02's structural half → B).
- § 3a → B. § 3b → D + E. § 3c → B2. § Sequencing → this plan's lane structure. § 4's
  not-doings — respected (no persistence-as-kit-behavior, no kai-chat re-cast, no declarative
  row-actions, no sync). § 5 measurement → a FUTURE rung, not this plan; E leaves the corpus app
  as its target.
- Open questions: Q1 → D (propose/ratify). Q2, Q3 → B1 (propose/ratify). Q4 (`kai-prompt-dock`
  reclassification — pure bookkeeping) → **not assigned a lane**; flagged for the supervisor to
  ride the docs pass or B's tier-label edit. Q5 → A2 (proposed resolution, flagged for owner).
