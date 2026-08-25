# WS1 surface audit: every element, standalone verdict + evidence

Date: 2026-08-25. Charter: `docs/superpowers/2026-08-24-roadmap-decision.md` D-1 (ruled: audit
first, then the rung-6 "compose your own thread" app). Every count below was computed this run
against the working tree (branch `main`); the derivation scripts are described inline so any
number can be re-derived. Read-only audit; this file is the only write.

## Summary (one screen)

Roster: **83** elements (`packages/ui/src/elements/element-meta.json`, counted).

| Verdict | Count | Notes |
|---|---|---|
| SHOULD be standalone, and structurally IS | **83 of 83** | Every element is its own Solid root, self-provides `ChatConfig` (`elements/define.tsx:509`), and has a real per-element entry point (`@kitn.ai/ui/elements/<file>`; manifest 82 tags + `kai-remote` explicit in `vite.config.elements.ts`; `dist/elements/` verified complete). There is no elements-tier internal glue: glue lives below, in `src/ui/` atoms without facades. |
| Blocked on EVIDENCE (never driven by any app) | **58** | 14 rendered-inside-`kai-chat`-only + 44 never touched (cross-tab below). |
| Blocked on DOCS | **42** no `###` section in `docs/web-components.md`; **17** documented NOWHERE (not in the docs site either) | The 17 include three DRIVEN elements: `kai-dock`, `kai-segmented`, `kai-status`. |
| Blocked on a known DEFECT | **2** | `kai-chat` and `kai-message`: card parts render through `components/message.tsx:636` `CardRenderer` with no host (F-26), so standalone `kai-message` inherits the void too. |
| SHOULD NOT be standalone | **0 elements** (5 `ui/` atoms stay Solid-only, section A) | The dropdown lesson generalized: nothing already element-ized should be de-element-ized. |

Evidence tiers (strict derivation: tag literal or wrapper import in `examples/apps/`, reproducing
the handoff method): **25 driven / 14 rendered-but-undriven / 44 never touched**.

| Tier (taxonomy) | Count | Driven | Rendered only | Never touched |
|---|---|---|---|---|
| Primitives (generic atoms with facades) | 31 | 5 | 1 | 25 |
| Feature elements (domain) | 40 | 15 | 13 | 12 |
| Layout/shell | 10 | 3 | 0 | 7 |
| Presets (`kai-chat`, `kai-workspace`) | 2 | 2 | 0 | 0 |

### Top 10 work items (section E, the proposed WS1 backlog)

1. **F-26 fix** (pass `hostElement` at `components/message.tsx:636`) - S. Unblocks card parts in both `kai-chat` and standalone `kai-message`; already the kit-debt lane's top item.
2. **F-35: `createMockResponder` tool calls + attachment parts** - S. Prerequisite for the rung-6 app to exercise attachments without a paid provider.
3. **Rung-6 "compose your own thread" clean-room app** - L. Drives `kai-thread`/`kai-message`/`kai-conversation-item`/`kai-composer`/`kai-attachments`/`kai-toast-region`/`kai-feedback-bar` standalone; carries the attachments pipeline (section C).
4. **Docs sections for the 16 driven-but-undocumented-in-`web-components.md` elements** - M. Thread/card/artifact/voice families first; these are proven-working surface a consumer cannot find in the element reference.
5. **The 17 zero-docs elements** - M. Mostly shell + interaction primitives (`kai-nav`, `kai-screen`, `kai-pane`(+`-group`), `kai-tabs`, `kai-dialog`, `kai-dropdown`, `kai-dock`, `kai-prompt-dock`, `kai-setting-item`, `kai-coachmark`, `kai-kbd`, `kai-editable-label`, `kai-progress-bar`, `kai-agent-card`, `kai-segmented`, `kai-status`). One family-shaped docs pass, not 17 stubs.
6. **Close the popover/dropdown/menu question as "no convergence" + one triangle docs section** - S. Section B: the hypothesized gap (menu semantics) does not exist; `ui/dropdown.tsx` already ships role=menu, roving focus, typeahead, submenus.
7. **Element-ize `PaneGrid` as `kai-pane-grid`** - S. The one `ui/` atom that fails the dropdown-lesson test in the element-ize direction (section A).
8. **Rewrite `docs/composable-web-components-roster.md`** - M. It is pre-rename planning fiction: "kitn" prefix, "planning" status, claims `kai-scroll-button` cannot exist standalone while the shipped element solves it with a `for` attribute + composed-tree ancestor walk. Replace with this audit's roster or mark superseded.
9. **Rule on the `Stat` orphan** - S. Built and tested (`ui/stat.tsx`), exported nowhere, no stories, no facade. Export on `./solid` + story, or delete. Recommend: export, do not element-ize (widget territory).
10. **Per-component CSS floor: measure and rule** - M. The only unshipped piece of the footprint plan (section D). The 17 KB gz shared sheet is adopted whole into every shadow root, so a one-leaf-element page still pays the full floor; that is now the dominant cost of the "compose from small elements" story WS1 promotes.

## Contradictions with the roadmap doc (read this even if nothing else)

1. **The per-element bundle split is MERGED AND SHIPPED, not "measured and never merged".**
   Roadmap section on WS1 says the footprint work was never merged. In the tree:
   `packages/ui/vite.config.elements.ts` (predates the monorepo lift), `exports` carries
   `"./elements/*"` and `"./autoloader"`, `sideEffects` lists `./dist/elements/*.js`,
   `dist/elements/` holds a built module for every one of the 83 tags (82 manifest entries, two
   multi-tag files, `kai-remote` explicit, verified complete this run), and the docs site
   documents all three loading strategies (`apps/docs/src/content/docs/guides/loading.mdx`).
   Section D below re-scopes what remains.
2. **The "13 undriven-but-rendered" list is off by two.** `kai-tool` is on it but IS driven
   (rung 5 ops-console, the handoff's own table says so). `kai-suggestions` is missing from it:
   `elements/chat.tsx:161` renders suggestions internally, so it is rendered-but-undriven, not
   never-touched. Corrected list is 14 tags (counting `kai-source` and `kai-sources` separately).
3. **`docs/web-components.md` has 41 element sections, not 40** (computed by matching
   `### \`<kai-...>\`` headings against the roster).
4. **The roster doc's open question about popover/dropdown is answerable and the answer is "no
   gap"** (section B). The overturned-Dropdown annotation stands; the convergence half dissolves.

## Method

- Roster = the 83 `tag` keys of `element-meta.json`.
- Driven = tag literal (`<kai-x`, `'kai-x'`, `"kai-x"`) or React wrapper import of the
  `displayName` in any source file under `examples/apps/` (node_modules/dist excluded). Result:
  25, matching the handoff's strict figure.
- Documented = a `### \`<kai-x>\`` heading in `docs/web-components.md` (41), and separately any
  `<kai-x` or `` `kai-x` `` occurrence across `apps/docs/src/content/docs/**/*.mdx` (17 hit
  neither).
- Standalone structure = read `elements/define.tsx` (every facade wraps its tree in its own
  `ChatConfig` with a shadow-root portal mount; shared constructable stylesheet), spot-checked
  facades (`scroll-button`, `message`, `attachments`, `card`, `dropdown`, `menu`, `code-block`,
  `compare`), and verified the entry-point manifest against `dist/elements/`.

## Per-element verdicts, grouped

Aggregated by shared verdict + blocker. Only interesting cases get their own rows.

### Group 1: driven and standalone-proven (25)

`kai-chat`, `kai-workspace`, `kai-conversations`, `kai-thread`, `kai-dock`, `kai-voice-input`,
`kai-voice-output`, `kai-audio-visualizer`, `kai-artifact`, `kai-checkpoint`, `kai-resizable`,
`kai-resizable-item`, `kai-segmented`, `kai-cards`, `kai-card`, `kai-confirm`, `kai-choice`,
`kai-form`, `kai-tasks`, `kai-remote`, `kai-tool`, `kai-button`, `kai-badge`, `kai-notice`,
`kai-status`.

Verdict: standalone, works, proven by a real clean-room app. Residual blocker for 16 of them:
no `###` section in `docs/web-components.md` (`kai-artifact`, `kai-audio-visualizer`,
`kai-card`, `kai-cards`, `kai-choice`, `kai-confirm`, `kai-dock`, `kai-form`, `kai-remote`,
`kai-resizable`, `kai-resizable-item`, `kai-segmented`, `kai-status`, `kai-tasks`, `kai-thread`,
`kai-voice-output`), of which `kai-dock`, `kai-segmented`, `kai-status` appear in no docs at all.
Item 4/5.

### Group 2: rendered inside `kai-chat`, never constructed with (14)

`kai-message`, `kai-markdown`, `kai-code-block`, `kai-reasoning`, `kai-source`, `kai-sources`,
`kai-prompt-input`, `kai-composer`, `kai-attachments`, `kai-model-switcher`, `kai-context`,
`kai-loader`, `kai-scroll-button`, `kai-suggestions`.

Verdict: SHOULD be standalone; structurally IS (each facade takes its data as props/properties,
none reaches for a parent context; `kai-scroll-button` even ships the `for` attribute + composed
ancestor walk that the old roster doc said was impossible). Blocker: zero app evidence, which is
exactly what F-26 taught us hides real defects. This group is the rung-6 app's target list.
Two specifics:

- **`kai-message` inherits F-26.** Its body renders through `components/message.tsx`, whose line
  636 mounts `CardRenderer` with no `hostElement` and no `CardProvider`. Text/reasoning/tool
  parts are fine; a `card` part in a standalone `kai-message` emits into the same void as inside
  `kai-chat`. One fix covers both (item 1).
- **`kai-composer` and `kai-attachments`** have docs-site pages but no `web-components.md`
  section; `kai-attachments` additionally has never had a file sent through it by any app
  (section C).

### Group 3: never touched, feature tier (12)

`kai-chain-of-thought`, `kai-compare`, `kai-conversation-item`, `kai-embed`, `kai-feedback-bar`,
`kai-file-tree`, `kai-file-upload`, `kai-link-preview`, `kai-response-stream`,
`kai-scope-picker`, `kai-skills`, `kai-thinking-bar`.

Verdict: SHOULD be standalone; structurally IS; blocker is evidence plus docs
(`kai-conversation-item` and `kai-embed` and `kai-file-tree` and `kai-compare` have no
`web-components.md` section; `kai-conversation-item` was an explicit owner build-now ruling and
still has no section, carried in the handoff housekeeping list). `kai-conversation-item`,
`kai-feedback-bar` are in the rung-6 set; `kai-compare` is its own small family and the handoff
already names "a small interaction/compare pass" as the literal-exit residue.

### Group 4: never touched, interaction primitives (25 of the 31-atom tier)

Never-touched primitives: `kai-avatar`, `kai-icon`, `kai-tooltip`, `kai-hover-card`,
`kai-separator`, `kai-scroll-area`, `kai-skeleton`, `kai-switch`, `kai-tabs`, `kai-dialog`,
`kai-popover`, `kai-dropdown`, `kai-menu`, `kai-command`, `kai-input`, `kai-search`, `kai-kbd`,
`kai-editable-label`, `kai-progress-bar`, `kai-coachmark`, `kai-toast-region`, `kai-agent-card`,
`kai-empty`, `kai-image`, `kai-text-shimmer`. (Driven from this tier: `kai-button`, `kai-badge`,
`kai-notice`, `kai-status`, `kai-segmented`; rendered-only: `kai-loader`.)

Verdict: standalone by design; these ARE the widget tier the host framework nominally has, but
the kai-dropdown lesson is that once themed/composed kit surface exists, the element facade is
how a consumer reaches it (no facade means no generated wrapper means alias-cast imports). They
exist; the gap is docs (`kai-tabs`, `kai-dialog`, `kai-dropdown`, `kai-popover`, `kai-coachmark`,
`kai-toast-region`, `kai-agent-card`, `kai-kbd`, `kai-editable-label`, `kai-progress-bar` lack
`web-components.md` sections; several are the zero-docs 17) and, for a handful, driving:
`kai-toast-region` and `kai-menu` (its narrow coverage is a carried housekeeping item) are the
priority; the rest do not need an app rung each. Recommend: docs pass (item 5), rung-6 covers
`kai-toast-region`, coverage item covers `kai-menu`, and the remainder are accepted as
tested-and-storied but app-undriven.

### Group 5: never touched, layout/shell (7 of 10)

`kai-nav`, `kai-screen`, `kai-pane`, `kai-pane-group`, `kai-prompt-dock`, `kai-settings-group`,
`kai-setting-item`. (Driven: `kai-dock`, `kai-resizable`, `kai-resizable-item`.)

Verdict: standalone by definition (tier 3 is chat-agnostic arrangement). All but
`kai-settings-group` are in the zero-docs 17. These came out of the workspace re-cast; the
re-cast shipped in 0.26.0, so shipping the shell family with no reference documentation is the
single most exposed docs gap. Item 5 leads with them.

### Group 6: presets (2)

`kai-chat` (driven, documented, carries F-26), `kai-workspace` (driven, documented). Standalone
by definition; nothing to rule.

## A. `ui/` atoms without a `kai-*` facade

Derived by diffing `src/ui/` component modules against facade imports in `src/elements/*.tsx`.
Six candidates; verdicts under the dropdown-lesson test (is it kit composition surface a
consumer can only reach through an element, or a widget their framework already has?):

| Atom | Verdict | Reasoning |
|---|---|---|
| `PaneGrid` (`ui/pane-grid.tsx`) | **Element-ize** (`kai-pane-grid`, S) | Tier-3 layout with real behavior (responsive column math, min-pane constraints); its siblings `kai-pane`/`kai-pane-group` already have facades, so a React consumer composing the pane family hits the exact alias-cast wall that overturned the Dropdown ruling. Already exported on `./solid` with stories, so the API is settled. |
| `Stat` (`ui/stat.tsx`) | **Do not element-ize; rule on the orphan** | A KPI tile is three spans in any framework: pure widget territory, and unlike Dropdown it carries no kit theming machinery a consumer must reach. But it is currently built + tested and exported NOWHERE (not on `.`, not on `./solid`, no stories). Either export on `./solid` with a story, or delete. |
| `Collapsible` (`ui/collapsible.tsx`) | **Do not element-ize** | Interior mechanism of `kai-reasoning`/`kai-tool`; consumers reach collapse behavior through those. Already exported on the root barrel for Solid composition; `<details>` is the host-framework widget. |
| `Textarea` (`ui/textarea.tsx`) | **Do not element-ize** | Native textarea + `useAutoResize`; `kai-input` and `kai-prompt-input` are the element-tier surface. Exported on the root barrel. |
| `overlay.tsx` (`createPresence`, `usePosition`, `useDismiss`) | **Cannot element-ize** (hooks, not components) | This is the documented escape hatch for building a custom popover in Solid; correctly on `./solid`. Internal glue at the element tier. |
| `action-icons.ts` | **Do not element-ize** | Internal icon table; `kai-icon` is the surface. |

Owner framing honored: these read as "any other UI framework" pieces. The audit's answer is that
all of them except `PaneGrid` are already reachable at the right layer (Solid exports), and
`Stat` is the one piece reachable at NO layer.

## B. `kai-popover` / `kai-dropdown` convergence

**Recommendation: keep both; no code convergence; close the roster's open question.**

The roster's hypothesis was that the real gap behind element-izing Dropdown might be menu
semantics (role=menu, roving focus, typeahead), in which case popover and dropdown should
converge. Read against the source, the hypothesis is false in the best way: the semantics are
already fully built. `ui/dropdown.tsx` ships `role="menu"` surfaces with a roving-focus set that
includes `menuitem`, `menuitemcheckbox`, `menuitemradio` (disabled items skipped), typeahead,
Home/End, separators as `role="separator"`, labels excluded from focus order, and submenus with
`aria-haspopup`/`aria-expanded`. `ui/popover.tsx` is explicitly the other ARIA pattern: its
comment contrasts itself with Dropdown and renders `role="dialog"` for arbitrary content (model
rows, toggles, nested groups).

So the two elements are not duplicates: they are the two distinct WAI-ARIA patterns (menu button
vs non-modal dialog), and merging them would un-decide a decision the code already made
correctly. The actual near-duplicate pair is `kai-dropdown` vs `kai-menu`: BOTH are facades over
the same `ui/Dropdown`, differing only in authoring model (`kai-dropdown` = slot-composed
trigger + content; `kai-menu` = data-driven `items[]` tree, `KaiMenuItem`). That is a legitimate
pair (slot form for construction, property form for model/host-driven menus) and matches the
kit's construction-over-configuration direction plus its data-driven precedent.

The deliverable is one docs section covering the triangle: reach for `kai-popover` when the
panel is content (dialog semantics), `kai-dropdown` when you compose menu items in markup,
`kai-menu` when the items are data. Neither `kai-popover` nor `kai-dropdown` has a
`web-components.md` section today (`kai-dropdown` has zero docs anywhere), so the section is
item 6 and the convergence question is resolved: **no convergence, document the split.**

## C. Attachments: what the rung-6 app must exercise

`kai-attachments` is display-only (an `items: AttachmentData[]` property with grid/inline/list
variants, hover-card previews, `kai-remove`). Never having been "driven" really means the whole
attachment PIPELINE has never been driven end to end by a consumer-shaped app. The rung-6 app
needs, in order of what has historically broken:

1. **The encode path, asserted, not assumed.** Attach a file, submit, and assert the attachment
   part SURVIVES `toOpenAIMessages` / `toAnthropicMessages` into the outgoing request body.
   The kit's worst attachment defect (#186) was a silent encode drop that shipped behind an
   explanatory comment; `lint:silent-drops` guards the code shape, but no app has ever observed
   the wire truth. This is the single highest-value assertion in the rung.
2. **Both acquisition surfaces**: `kai-file-upload` (drop + click) feeding a standalone composer,
   and `kai-prompt-input`'s own attach affordance; plus paste-an-image if supported.
3. **Round-trip display**: the sent user message re-rendered in a standalone `kai-thread` /
   `kai-message` with its attachment chips (the `AttachmentData` projection from `parts`), and
   removal before send (`kai-remove` wiring).
4. **Media-type spread**: one image (preview path), one non-image (pdf/csv: icon + label path),
   one oversized file. Per the boundary rule the app decides the limit; the rung verifies the
   KIT surfaces the facts (media type, byte size, encoder representability) loudly enough for
   the app to decide. If the kit stays silent anywhere, that is a finding.
5. **A responder that can accept it.** `createMockResponder` is text-only (F-35), so today the
   rung either pays a real provider or hand-rolls SSE a third time. Extending the mock to
   tool calls AND to acknowledging attachment parts (item 2) is a prerequisite, or at least a
   simultaneous fix.

## D. Per-element entry points: the research is shipped; re-scope the item

The footprint plan's Lever 1 verdict "DO IT" was ruled on numbers from 2026-06-20 (73 vs 119 KB
gz), and then, contrary to the roadmap's "never merged", it was done: per-element self-registering
modules for all 83 tags via `vite.config.elements.ts` + `element-manifest.json`, the
`"./elements/*"` and `"./autoloader"` exports, `sideEffects` protection for registration modules,
and a full consumer-facing guide (`guides/loading.mdx`: register-all / per-element / autoloader).
Adoption entails nothing; it happened.

What the audit changes is what REMAINS of that plan:

- **Phase 3 (per-component CSS) is now the live question, not Lever 1.** The 17 KB gz compiled
  sheet is one shared constructable stylesheet adopted whole into every shadow root
  (`define.tsx`). WS1's whole thesis is many small standalone elements; a page using only
  `kai-badge` still pays the full floor. The original deferral ("only if the floor becomes the
  bottleneck") should be re-measured against a per-element world: for leaf elements the floor IS
  the bundle. Item 10: measure, then rule do/defer, do not assume the June verdict.
- **The stale numbers rule applies to the plan doc itself**: 73/119/154 KB and "~50 components"
  predate 33 elements' worth of growth. Any new ruling re-measures.
- **No re-architecture is needed for WS1**: the audit found the entry-point layer complete
  (manifest covers the roster; `dist/elements/` verified 1:1 this run), so WS1's standalone work
  is docs + evidence + the two defects, not build plumbing.

## E. The top 10, restated with sizing rationale

See the summary table for the ordered list. Sizing notes: items 1, 2, 6, 7, 9 are S (single-seat,
single-sitting, mechanical or already-diagnosed). Items 4, 5, 8, 10 are M (multi-file but
bounded; the docs passes go family-by-family and each family is one sitting). Item 3 is L (a
clean-room rung with a budget: rung 5's clean-room build alone cost $22.30, and this one has a
larger element list plus the attachments pipeline). Ordering logic: the two S defect/prereq fixes
first because the rung-6 app lands on top of them; the app third because its findings feed every
docs item after it; docs before cleanup; the CSS-floor ruling last because it is the only item
that can change shape based on everything above it.
