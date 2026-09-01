# Blocks and parts — orchestration plan (2026-08-31)

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to execute this plan
> phase-by-phase. Lanes inside a phase are disjoint-file and run in
> parallel worker agents; phases are sequential and each closes on its
> acceptance gate before the next opens. Parallel EDITING agents each get
> `isolation: "worktree"` and their own scratch dir
> ([[concurrent-writers-need-worktrees]]); the fresh-worktree three-step
> (install, `build:css`, real build) applies. Follow TDD; watch every new
> guard fail before trusting it.

**Spec.** `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md`
(rulings P-1..P-9, Parts 2–7). Every task below argues from a ruling and
names it. Evidence base cited there, not here.

**Goal.** Ship the parts the composition spike proved missing, refactor
`kai-chat` into a thin preset over them, then ship a derived-registry
block gallery (reference block first) with `create-kai add`, live
theming, per-block CI cells with screenshot parity, an MCP round, and
the loud deprecation of the config route's front doors.

## Global constraints (bind every phase)

- **Sequencing is load-bearing.** No block work starts before P-9 closes
  (spec: "Why parts come first"). A lane that discovers it needs a file
  outside its assignment stops and reports; the supervisor re-cuts lanes.
- **Story-first** for every new visual part: the stub-data story is the
  first artifact of each P-lane, and the owner iterates on it before the
  element's behavior work completes ([[story-first-ui-iteration]]).
- **Derive, don't type.** Registry from directory scan; CDN pins
  generated from `packages/ui/package.json`; icon roster from
  `ICON_NAMES`; V-2 cells from the blocks dir. No count appears in any
  report that a command doesn't print (`create-kai add --list`,
  `verify:blocks` output).
- **Decide loudly.** Deprecation = banner + working feature, never
  deletion. `add` never overwrites silently. Unknown icon names speak in
  prod (P-8).
- **Shared/generated files are serialized by the supervisor:**
  `element-meta.json`, `docs/web-components.md`, `llms-full.txt`, React
  wrappers, `register-impl.ts`, `package.json` exports, lockfile,
  `docs/coupling-map.md`. Lanes report "needs regen"; one agent runs
  `npm run build:api` inside `packages/ui` per phase close (never trust
  a cached `nx build ui` for derived artifacts).
- **NX cache caveats** (CLAUDE.md): typecheck verdicts via
  `npm run typecheck` inside `packages/ui` or `--skip-nx-cache`.
- **Untrusted-input discipline:** everything a block's mock "model"
  emits is untrusted; no block script may put model-shaped text on an
  `innerHTML`/`href` sink — the existing guards
  (`isSafeUrl`/`isRenderableLink`) are the only policies.
- Conventional commits; release-please owns versions; foreground gates
  only; reports paste raw output.

## Phase 0 — unblock the tree

**Task 0.1 — merge PR #353** (the in-flight branch work this plan was
cut against). Nothing here lands on top of unmerged churn; the P-lanes
touch `components/` and `elements/` files that branch moves.
Gate: PR merged; `main` (or the integration branch the owner names)
green on the required `test` job.

## Phase 1 — THE PARTS (parallel lanes, disjoint files)

Up to five worker agents. Each lane: story first → owner look → tests →
element/primitive → report "needs regen" for generated artifacts. Lanes
touch only their named source files; registration and wrapper
regeneration is the phase-close serialization step.

| lane | ruling | files (indicative; lane-owned) | size |
|---|---|---|---|
| **1A panel chrome** | P-1 | `src/components/panel.tsx` + story, `src/elements/panel.ts`, `panel-header` | M |
| **1B tab bar** | P-2 | `src/components/tab-bar.tsx` + story, elements for bar + item | M |
| **1C view navigator** | P-3 | `src/components/view-stack.tsx` + story, elements, the drilled/tab-root behavioral tests | M–L |
| **1D row + density + dot** | P-4, P-7 | `src/components/row.tsx` + story, `conversation-item` density + unread dot (+ its story), the round-3 computed-style probe as a test | M |
| **1E controller + icon roster** | P-5, P-8 | `src/stores/conversation-controller.ts` + tests; `src/ui/icon.tsx` prod signal + test; the docs-generator hook for `ICON_NAMES` | M |

Phase-1 close (one agent, serialized): register new elements, regenerate
derived artifacts (`npm run build:api` in `packages/ui`), coupling-map
rows for each new part ↔ its consumer.

**Acceptance gate:** stories owner-reviewed; per-lane unit tests green;
`pnpm --filter @kitn.ai/ui exec vitest run --project=unit`;
`npm run typecheck` in `packages/ui`; `verify:consumer` (new
registrations must survive a real bundler); P-8's prod-signal test
observed failing against the old DEV-only guard before the fix.

## Phase 2 — `kai-chat` thin preset (single lane, locks the facade)

**Task 2.1 — the parity harness first** (V-1 seed): generalize the
spike's `fine-drive.mjs` into `packages/ui/scripts/block-driver/` —
states, behavioral + computed-style probes, screenshots, light+dark.
Point it at the CURRENT facade and record the baseline set. Watch a
planted probe fail.

**Task 2.2 — the refactor** (P-9): `chat.tsx` interior onto
panel/tab-bar/view-stack/row/controller (P-5's controller import is a
grep-level assertion in the task's tests); P-6 region slots added.
High-effort task; one agent, locked; existing stories and component
tests must stay green UNCHANGED — an edit to an existing `kai-chat`
test to make it pass is a defect report, not a fix.

**Acceptance gate:** baseline-vs-refactor driver run state-for-state
(screenshot pairs + probes); `--project=unit` AND `--project=emitted`
(the scaffolds render through this facade); `verify:scaffold` (needs
`nx build ui` first); `verify:consumer`; regenerated artifacts
committed. Owner sees the pair set (show-first for unseen UI).

## Phase 3 — the reference block + registry + delivery forms

**Task 3.1 — registry + generator.** `packages/ui/blocks/` layout on
the adopted registry-item skeleton (spec "Registry mechanics":
name/title/description/type, `files[]` with per-file type + target,
`dependencies`, `registryDependencies` covering blocks AND backend
routes against the scaffolder catalog, `cssVars` on `--kai-*`,
`envVars`, `docs`, `categories`, `meta.iframeHeight`); the
directory-scan registry module emitting `registry.json` plus the
static per-block JSON at a public URL (the integration surface the
gallery, MCP and any third-party tool all resolve); and the CDN-form
generator (pins from `package.json`; inlining; the phase-2-proven
entry set only — never the root export; JS-properties +
on-element-listener emission with no attribute path for rich props).
Drift check wired into `verify-generated-sync`'s pattern. Watch it
fail on a planted stale form.

**Task 3.2 — support-widget, the reference block** (spec Part 2): the
spike prototype rebuilt on parts. Definition of done includes V-4's
loop: any wall = kit fix + docs/MCP regen + guard, reported, before the
block merges. Its scripted mock and state script land with it.

**Task 3.3 — `verify:blocks` v1** (V-2): cells derived from the blocks
dir × forms; typecheck of the `add` form under the scaffold gate's tsc
projects; the driver per block; the structural checks over generated
forms (no hand-rolled SSE — `@kitn.ai/ui/wire` readers only; no
rich-prop-as-attribute); CI wiring into the required job. Self-test
faults for each check class, observed firing.

**Acceptance gate:** `verify:blocks` green with the reference block's
cell, after each self-test fault was seen red; the CDN form runs
paste-cold against the built dist via the driver; `lint:cdn-pins`
green over the generated form.

## Phase 4 — CLI `add` (parallel with Phase 5)

**Task 4.1 —** `create-kai add <block>` (spec Part 3): registry import
(the existing `catalog.ts` import pattern) plus per-block-JSON-URL
resolution through the same path; the simplified shadcn flow (item →
`registryDependencies`, blocks and routes → npm deps → write to
targets → print `docs`; no components.json, no alias map, no import
rewriting); file writing + deps, collision refusal, `--list`.
Menu-honesty tests in the `menu-honesty.test.ts` mold: every listed
block resolves and writes. create-kai's own vitest suite + a pty
smoke.

**Task 4.2 — framework detection + react variant** (spec Part 3's
detection ruling): the signals table (no-project → CDN form · react
deps → `@kitn.ai/ui/react` wrapper variant · other → web components ·
conflicting signals → ask loudly, naming what was found), tested per
rule including the ambiguous-asks case; the react rewrite riding the
scaffolder's per-framework emission machinery and compiled by the same
tsc projects `verify:scaffold` uses (via V-2's add-form cell).

## Phase 5 — gallery + theming (parallel with Phase 4; disjoint from it)

**Task 5.1 — gallery route** in the construct dev server (KEPT infra as
the front door, spec Part 5): browse blocks from the registry, run them
live, copy the CDN form.

**Task 5.2 — theme integration** (spec Part 4): `themePayloadToCss`
beside `theme-payload.ts` (one fold, tested both directions against
`ThemePayload`); studio embed beside a running block; download/`add`
carrying `theme.css` / the inline style block. Screenshot probe under a
non-default accent.

**Task 5.3 — the docs-site Blocks section** (spec B-G): the gallery
page in `apps/docs` on the mirrored shadcn grammar (category nav →
live preview sized by `meta.iframeHeight` + viewport toggles +
open-in-new-tab → Preview/Code with file tree and per-file copy →
install one-liner → description), dogfooding the kit — `WorkSurface`
(live preview
through its `Artifact` frame loading the CDN form off the real CDN
path, Preview|Code toggle, device toggles), `FileTree` over the
`add`-form file list, `CodeBlock` per file with copy. Story-first for
the page's own layout; facade-coverage gaps for those three components
read from `element-meta.json` and filled per V-4, not worked around.
Copy in the house voice (`apps/docs/STYLE.md`).

**Phase 4+5 gate:** `add` writes a project that builds
(`verify:blocks`' add-form cell covers the compile; the pty smoke
covers the flow, including the ambiguous-detection ask); themed
download reproduces the studio preview; the docs gallery renders every
registry block live from the CDN form.

## Phase 6 — remaining v1 blocks (parallel lanes, one per block)

assistant · in-app-assistant · research · workspace — each its own lane
and directory, each under Task 3.2's definition of done (rich scripted
mock per S-1; V-4 loop; states + probes). voice-widget is NOT in this
phase — gated on the realtime adapter (spec non-goal 2).
Gate: `verify:blocks` green across all cells (its output prints the
count); release-PR screenshot set attached (V-3).

## Phase 7 — deprecation round (after the gallery works, not before)

Banners and door-flips per spec Part 5: builder template cards, wizard
copy, `kai dev --builder` front-door link then flip, docs banners with
redirects only where a replacement page exists. Nothing deleted;
`kai eject`/`compile` untouched. Copy in the house voice
(`apps/docs/STYLE.md`).
Gate: every banner links a live target; `verify:construct` still green
(construct route still functional); a grep proves no doc recommends a
deprecated door without its banner.

## Phase 8 — MCP round

M-1 cell-scoped `component_reference` (delivery × integration read from
disk) · M-2 `validate` tool (checks derived from `element-meta.json` /
`ICON_NAMES` / event lists; watch each check catch a planted paste) ·
M-3 snippets quarried from gated block sources · M-4 `add` via MCP.
Gate: MCP tool tests; the emitted/manifest-dependent tests' build
prerequisite respected; a transcript demo of M-2 catching the
prop-as-attribute trap.

## Phase 9 — close-out

Coupling-map rows (parts ↔ facade, registry ↔ CLI/gallery/MCP, generator
↔ `lint:cdn-pins`, driver ↔ block state scripts); `lint:gate-parity` +
`lint:thresholds` over the new docs; the owner's scheduled tier-1
construct call (spec open question 3), made against the working gallery.

## What locks what

- Phase 2 locks `chat.tsx`/`chat` element + its tests to one agent.
- `build:api` regeneration is a serialized phase-close step, one agent,
  main checkout — never inside a parallel lane.
- `package.json` (exports, scripts) and CI workflow edits: supervisor-
  serialized.
- Phases 4 and 5 are disjoint (create-kai vs packages/ui server code)
  and may run concurrently; both depend on Phase 3's registry.

## Relative sizes (not dates)

Phase 1 ≈ Phase 2 ≈ Phase 6 (the three big ones; Phase 2 is the
riskiest, Phase 6 the widest) > Phase 3 > Phase 8 > Phases 4, 5 >
Phase 7 > Phases 0, 9.
