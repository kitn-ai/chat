# Blocks and parts — design (2026-08-31)

> **DESIGN + PLAN. Implementation starts only on the owner's go-ahead**, and
> then in the order the companion plan
> (`docs/superpowers/plans/2026-08-31-blocks-and-parts.md`) sequences —
> the sequencing is load-bearing, not administrative (see "Why parts come
> first").

## Owner's framing (verbatim, binding intent)

> "We need blocks like shadcn ui has... a block can be full apps... a
> library of them people can peruse and we add more and more... similar to
> our lab apps except web components, and script, and some css. Someone
> could start with that, paste it in somewhere, then use their harness to
> customize from there... blocks would work using our CDN and when they
> copy/paste it has everything they need... like
> `npx shadcn@latest add dashboard-01`."

> "moving away from the configuration (deprecate it until we are done with
> this)... I want that really well defined so 1. we don't have the old junk
> out there 2. you can orchestrate this... managing the different agents...
> when we find gaps we fill the gaps and we're updating our MCP server...
> so this feels like a solution we can live with."

Owner's calibration on the spike's `fine.html`: "a prototype... not ready
for primetime." The primetime bar, as ruled: **built on parts** (no private
chrome copies), **CI-compiled and screenshot-driven per release**,
**versioned against the kit**.

## Evidence base (cited, not restated)

- **T-5 Amendments 3 + 4**
  (`docs/superpowers/specs/2026-08-28-t5-vocabulary-rulings.md`): the
  boundary splits at the thread; composition means Model B — composing in
  the consumer's app; the compiled element is embed *packaging*, not the
  composition model. Blocks are Model B made distributable.
- **The composition spike**
  (`docs/superpowers/research/2026-08-31-composition-spike/` — `report.md`,
  `phase2-cdn.md`, `phase3-fine-grain.md`): findings F-1..F-9, the four
  fidelity rounds, the private-row-density finding, and the LOC economics
  (facade ~186 lines vs fine-grain ~498 by `wc -l` over the sources beside
  the reports — re-run there, never trust the prose). Phase 2 proved the
  open×CDN cell real (`dist/state.js`/`dist/wire.js` load raw; the root
  export does not); phase 3 proved the engine composes at the fine grain
  and that everything expensive was **unpackaged product tier**: home
  screen (F-1), panel chrome (F-2), the controller (F-3), the tab bar,
  list density.
- **The template-purpose audit**
  (`docs/superpowers/research/2026-08-30-template-purpose/`, findings
  recorded in T-5 Amendment 2 and
  `HANDOFF-2026-08-30-builder-testing-and-the-config-boundary.md`): config
  made the wrong question the easy one — a panel of toggles feels finished,
  so nobody asked what the thread contains. Blocks answer the thread
  question by construction: a block ships a scripted rich thread or it
  visibly demos nothing.

## What a block IS

A block is a **complete, runnable composition of kai web components — HTML
+ a script + minimal CSS — that a person can paste into a page or `add`
into a project, then hand to their coding harness to customize.** It is a
Labs app in the open dialect: `kai-*` elements, JS properties, `kai-*`
events, `@kitn.ai/ui/state` + `/wire` + `/stores`, public surface only.
Not a construct, not a config, not a sealed compiled box (Amendment 4:
the box remains available as embed packaging of a block, never as the
block itself).

Three properties are definitional, each traceable to a spike finding:

1. **Built on parts.** A block contains zero private chrome copies — no
   hand-built tab bars, panel headers or home screens. Phase 3's fidelity
   round is the proof this matters: a hand-built chrome passed every
   feature check and was still visibly the wrong widget three owner
   reviews running. What the fidelity round repaired by hand, the kit now
   ships as elements (below), and a block that needs chrome the kit lacks
   is a **gap-filling event**, not a workaround site.
2. **Self-contained per delivery form.** CDN-paste carries everything
   (pinned URLs, inline theme, inline mock); `add` writes real files and
   declares real deps. One authored source, both forms derived (below).
3. **Versioned against the kit.** Every `@kitn.ai/ui@<version>` literal in
   a block's generated CDN form is produced at build time from
   `packages/ui/package.json`, never typed — the exact class of defect
   `lint:cdn-pins` exists for, and that lint's scope already covers
   `packages/`, so generated block output is inside the fence on day one.

## Why parts come first (the sequencing ruling)

The spike ran blocks-before-parts by necessity — that is what `fine.html`
IS — and the result is the strongest available evidence against shipping
that way: ~170 of its ~498 lines are private chrome and controller glue
(phase 3, LOC section), it drifted from the facade's navigation model
twice, and its row density was matched only by smuggling padding through
slotted spans around a **private** interior class. Every block built
before the parts exist embeds its own copy of that debt, and every copy
drifts independently — the same copy-then-the-code-moves failure
CLAUDE.md's derive-don't-type rule names, at the chrome layer.

So the order is: **parts → kai-chat becomes a thin preset over the parts →
the reference block is built on the parts → everything else.** The
kai-chat refactor is not optional polish; it is what makes the facade and
the blocks render the *same* chrome from the *same* elements, so parity is
structural instead of re-measured per block.

---

## Rulings — Part 1: THE PARTS

Every new visual part below is **story-first** (owner policy,
[[story-first-ui-iteration]]): a stub-data Storybook story lands for
design iteration before any block or facade consumes it. Element naming
follows the item-element pattern from the construction-over-configuration
ruling: children as elements, not config arrays, wherever a list has
per-item structure.

### P-1 · `kai-panel` / `kai-panel-header`

The widget/panel frame phase 3 hand-built (~100 lines of CSS, F-2):
surface, border, radius, shadow, the header row (title, leading control
slot, trailing control slot — back arrow and close are *slotted content*,
not props), and the view container region. Painted from the kit's own
tokens so `--kai-color-*` overrides retint it with the elements
(phase 3, observation 12 — the fine-grain accent already beat the facade
once the chrome used tokens; this makes that the only possible outcome).

- **Rationale:** F-2 verbatim — "with the facade gone there is no widget
  frame", and the first pass's invented slate palette is what happens
  next. Chrome color is a kit decision (HOW it renders), not an app one.
- **Acceptance:** story with header variants (level: title+close ·
  drilled: back+title+close); computed-style probe asserts the panel's
  background/border/foreground resolve from kit tokens in light, dark,
  and under a `--kai-color-primary` override; the refactored `kai-chat`
  (P-8) renders its panel THROUGH this element.

### P-2 · `kai-tab-bar` + `kai-tab-bar-item`

The widget tab bar `kai-tabs` cannot express (phase 3, fidelity round:
tried and dropped): icon-over-label columns, icon-only mode, a
badge/unread dot on an item. Item-element pattern: each
`<kai-tab-bar-item>` carries `icon`, optional label text (slotted),
`active`, `dot`/`badge`; selection emits a `kai-*` event on the bar.

- **Rationale:** F-1/F-2's second demonstration — the facade's
  `WidgetTabBar` is the only implementation of a shape every
  widget-family block needs. `kai-tabs` stays what it is (content tabs /
  segmented); this is navigation chrome, a different component, and
  pretending one element serves both is how the spike lost a round.
- **Acceptance:** story (icon-only · icon+label · with dot · with count
  badge); the facade's Messages-tab unread dot renders through this
  element after P-8; icon sizing is the element's own default so no
  consumer restates `size="lg"` to get equal glyphs (phase 3, round 2).

### P-3 · The view navigator — `kai-view-stack` + `kai-view`

Mobile stack semantics as an element: named views, `push`/`back`,
tab-root awareness (a tab switch replaces the root view rather than
pushing), and the one rule the spike got wrong twice — **a drilled view
hides the tab bar and shows a back arrow; a tab root shows the tab bar
and no back arrow**. The navigator owns that state and exposes it
(current view, `drilled` boolean) so `kai-panel-header` and `kai-tab-bar`
consumers wire it with slots/attributes, not reimplemented policy.

- **Rationale:** F-3's sharpest clause: "the likeliest consumer failure
  mode is not 'can't build it' but 'builds a different widget without
  noticing'." The navigation model drifted in the spike's first pass
  (persistent tab bar, invented header toggle) *and* was the root cause
  of two further fidelity-round rows. A model that must be known is a
  model that must be shipped.
- **Acceptance:** story driving push/back/tab-switch with visible
  tab-bar/back-arrow state; behavioral test pinning the
  drilled-hides-tab-bar rule and tab-root replacement; the block driver
  (V-1) asserts the same two probes phase 3's `fine-drive.mjs` does
  (back arrow present + tab bar absent in-thread).

### P-4 · `kai-row`

The generic list row: leading slot, title, optional subtitle, trailing
slot. Covers the home tab's three row shapes (recent-conversation card
row, full-width CTA row with trailing arrow, help link with icon and
chevron — the exact anatomy the spike approximated from memory and got
wrong, phase 3 fidelity table) and every settings screen a block will
ever grow.

- **Rationale:** three hand-built approximations of the same row in one
  spike page is the "name a second instance" test passing itself.
- **Acceptance:** story showing the three home-tab rows plus a
  settings-style row; `kai-chat`'s home tab renders its rows through it
  after P-8.

### P-5 · The headless conversation controller

`createConversationController(store, options)` in `src/stores/`
(shipping in the already-CDN-reachable `dist/stores.js` beside
`localStorageStore`, `isConversationUnread`, `byRecency`): active-id
tracking, mint-id-on-first-message, save-per-turn, mount-time
auto-restore, and the three-leg seen rule for `markRead` (open + chat
view + active conversation) as an explicit `seen()` input. Framework-free,
solid-free, no DOM — the same discipline that made `state.js`/`wire.js`
loadable raw in phase 2. **`kai-chat` consumes this same controller**
(P-8), so facade and blocks cannot drift on policy.

- **Rationale:** F-3 names every one of these behaviors as reimplemented
  glue, and F-6's write-side caveat (the read primitive shipped, the
  when-to-`markRead` policy did not) is the half still open. One shipped
  controller replaces the most drift-prone ~60 lines of every block.
- **Acceptance:** unit tests for each behavior including the seen rule's
  three legs individually failing; `kai-chat` imports it (grep-level
  assertion in the P-8 parity task); reachable raw over the CDN
  stand-in in the block driver run.

### P-6 · Region slots on `kai-chat`

Progressive unfolding on the facade: named slots for **home-tab
content**, **header**, **footer**, and **per-message actions**, each
replaceable without leaving the element.

- **Rationale:** the spike's ask 2 ("add an FAQ above the thread") was
  the draw config lost too — "the customization ceiling is set by the
  component surface, not by the authoring path" (report.md). Region
  slots move the ceiling for the most common asks so a block consumer's
  first customization is a slot fill, not a rewrite; the spike's
  recommendation condition 3 (home goes composable) is satisfied by
  this plus P-1..P-4.
- **Acceptance:** a story per region slot; the block driver's facade page
  exercises at least the home-tab slot; slot metadata reaches
  `element-meta.json`/docs via the existing generators (`npm run
  build:api` inside `packages/ui` regenerates — never trust a cached
  `nx build ui` for this, per CLAUDE.md).

### P-7 · List density as public API + unread dot on items

`<kai-conversation-item>` gains a density that reproduces the facade
panel's exact row box (the `px-3 py-2.5` interior class phase 3 round 3
could only match by smuggling padding through slotted spans), and an
unread dot (F-8's named remaining polish gap). Whether that is a third
density value or a widget `variant` on `kai-conversations` is the
implementer's call against the story — the acceptance is measured, not
named.

- **Rationale:** the private-row-density finding verbatim: "exactly the
  kind of contortion a `variant` (or row-density prop) would delete."
- **Acceptance:** the round-3 computed-style probe (same y, same row
  height, facade vs block) passes with **no** host padding hacks and no
  slotted-span padding in the block source.

### P-8 · Icon roster: enumerated + fail-loud

`ICON_NAMES` (from `src/ui/icon.tsx`, already exported and sorted) is
rendered into `docs/web-components.md` and `llms-full.txt` by the
existing `build:api` generators — derived, never a hand list — and the
MCP's `component_reference` answers icon questions from the same export.
The unknown-name warning stops being `import.meta.env.DEV`-only: prod
renders the fallback AND says so on the console.

- **Rationale:** F-7 — the one finding where current behavior actively
  misleads (`icon="send"` painted the word "send" silently in prod), and
  a direct application of decide-loudly.
- **Acceptance:** roster present in regenerated docs artifacts; a test
  pinning the prod-path console signal (watch it fail against the
  current DEV-only guard first).

### P-9 · `kai-chat` refactored to a thin preset over the parts

The facade keeps its exact public contract (props, events, methods,
slots grow only by P-6) but its interior chrome — panel, header, tab
bar, home rows, view routing, conversation lifecycle — becomes the parts
above. **Story parity gates the refactor:** the spike's dual-page driver
(V-1) runs the facade before and after through the same states,
light+dark, screenshot pairs + computed-style probes, and the existing
`kai-chat` stories and component tests stay green untouched.

- **Rationale:** this is the ruling that makes "no private chrome
  copies" true for the kit itself, not just for blocks. Without it the
  facade holds the only copy of the chrome and every block is a
  second-source — the situation the spike measured at ~2.7× and three
  fidelity rounds. It also closes the spike's condition 2 trajectory
  (facade parity debt): seams like the unread machinery and list-view
  reset become part behavior both dialects reach.
- **Acceptance:** zero changes required in existing `kai-chat` stories
  and tests to stay green; the before/after screenshot run shows
  state-for-state parity; `verify:consumer` and the emitted suite stay
  green (the facade is what scaffolds render through).

---

## Rulings — Part 2: THE BLOCKS (v1 gallery)

| block | status | contents |
|---|---|---|
| **support-widget** | **the reference block** — the spike prototype rebuilt on parts | dock + panel + tab bar + view stack + home rows + thread + conversations, controller-driven |
| **assistant** | v1 | full-page thread + conversations rail, model switcher recipe (Amendment 3: switcher is a composition recipe now) |
| **in-app-assistant** | v1 | docked aside over host content |
| **research** | v1 | the Amendment-3 composition-first example IN block form: citations/sources strip, reasoning, rich scripted thread |
| **workspace** | v1 | the other Amendment-3 example: chat rail + work surface, checkpoints recipe |
| **voice-widget** | **aspirational, gated** | gated on the realtime adapter (`readRealtimeEvents` in `wire/`) — spec'd here as a **named dependency**, not built this round; the gallery shows it only when it works (menu-honesty, the create-kai precedent) |

Every block ships:

- **html + js + minimal css** — the owner's words, and phase 3's LOC
  breakdown says the minimal css is now genuinely minimal: the ~170
  lines of chrome/glue the spike carried move into the parts.
- **A block is defined FRAMEWORK-NEUTRALLY and rendered per framework
  by the generator.** The authored source is elements + JS properties +
  `kai-*` event wiring — the one dialect that is true in every host —
  and each delivery/framework form is a *rendering* of it by the
  generator, riding the scaffolder's integrations × frameworks
  machinery. This is the derive-don't-type answer to shadcn's single
  React source tree: they must author per framework or not at all; we
  author once and the framework axis is generation, gate-compiled like
  every other generated axis (`verify:scaffold`'s discipline, V-2's
  cells).
- **Two delivery forms, one source of truth.** The `add` form: real
  files, bare `@kitn.ai/ui/...` imports, a small deps list. The
  CDN-paste form is derived by the generator
  (`build:api`-adjacent, in `packages/ui/scripts/`): bare imports
  rewritten to pinned `cdn.jsdelivr.net/npm/@kitn.ai/ui@<version>/dist/...`
  URLs (version read from `package.json` at generation — the phase-2
  layout, using the entries phase 2 proved self-contained: `elements`,
  `state.js`, `wire.js`, `stores.js`; never the root export, which
  phase 2 captured failing on bare `solid-js`), css and mock inlined.
  Two forms authored by hand would drift; a derived second form cannot.
- **The CDN-paste form bakes in the two contract points naive
  copy-paste gets wrong** — this is the target shadcn structurally
  cannot serve, and it is only safe because the generator, not a
  human, emits it. Every emitted snippet (1) sets array/object props
  as **JS properties**, never attributes, and (2) attaches `kai-*`
  listeners **on the element** (non-bubbling), reading
  `event.detail`. The generator enforces both structurally — its
  emitters have no attribute path for rich props at all — and M-2's
  `validate` tool checks the same two points on compositions people
  hand back.
- **Emitted wiring uses the `@kitn.ai/ui/wire` readers, never a
  hand-rolled SSE parser.** The gallery and its snippets are exactly
  the doc/example/scaffold surface CLAUDE.md's wire rule forbids
  hand-rolling in; V-2 greps the generated forms for it as a
  structural check (the `verify:scaffold` structural-check precedent),
  and the mock path goes through `createMockResponder` →
  `readOpenAIStream` like the spike's did.
- **A per-block scripted mock** so the block demos a rich thread —
  reasoning, tool rows, cards, sources as the block's purpose implies.
  This is S-1's lesson (template-purpose audit) applied at birth: a
  block whose thread is two plain-text messages is not done, and unlike
  a config panel, a block makes that absence visible on first paint.
- **A state script for the driver** (V-1): the named UI states the
  block's screenshots and probes run through.

### B-G · The Blocks gallery on the docs site (owner addition, 2026-08-31)

A **Blocks section on ui.kitn.ai** (`apps/docs`), modeled on
shadcn's `/blocks`: a browsable gallery where each block shows a live
preview, a preview/code toggle, its file tree, copy affordances, and
responsive-viewport toggles. The owner's key point, adopted as the
ruling: **the gallery page dogfoods kai components to showcase kai
blocks** — the workSurface round already built exactly this chrome, so
the gallery is a consumer of the kit, not a bespoke docs widget.

**The gallery grammar mirrors shadcn's `/blocks`** (registry research,
item 7 — none of it is React-specific): category nav (the manifest's
`categories`) → live iframe preview (`meta.iframeHeight` sizes it) +
viewport toggles + open-in-new-tab → Preview/Code toggle with a file
tree and per-file copy → the one-line install command
(`npx create-kai add <block>`) → description. Which existing component
serves which affordance:

| gallery affordance | existing kit piece |
|---|---|
| Live preview | `WorkSurface`'s preview branch — which frames its `src` through the kit's own `Artifact` (one sandboxed iframe, one `isSafeUrl` policy; `work-surface.tsx`'s own header records that reuse). The iframe loads the block's **CDN form** off the real CDN path — the gallery is thereby also the standing proof that every published block works paste-cold |
| Preview / Code toggle | `WorkSurface`'s Preview\|Code segmented toggle (`showCodeView`), preview-first per its recorded design contract |
| Responsive-viewport toggles | `WorkSurface`'s device toggle (`WORK_SURFACE_DEVICE_WIDTHS`) — "if cheap" is already answered: it ships, scaling the preview canvas only |
| File tree | `FileTree` (`components/file-tree.tsx`, `buildFileTree` over the block's `add`-form file list) |
| Code display + copy | `CodeBlock` (`components/code-block.tsx`) per selected file |

Named gaps, handled per V-4 (parts-list additions, not workarounds):

- **Facade coverage.** The docs site composes via web components, and
  whichever of `WorkSurface` / `FileTree` / `CodeBlock` lacks a `kai-*`
  facade gets one in the gallery round — read the actual coverage out
  of `dist/custom-elements.json` / `element-meta.json` at build time
  rather than from this spec (this is also the owner's standing audit
  axis: ui atoms without facades).
- **Block-level "copy everything"** (the whole CDN-paste form in one
  click) if `CodeBlock`'s per-file copy doesn't compose into it
  cleanly — decide at the story, story-first like every gallery
  surface.

The dev-server gallery route (Part 5, kept-infra front door) and this
docs section render from the same derived registry and the same
generated forms; the docs section is the public shop window, the dev
server route is where live theming (Part 4) happens.

> **Owner ruling (2026-08-31, amendment):** the gallery LEADS with the
> block's file tree — per-file copy plus the one-line
> `npx create-kai add <block>` — because the shadcn-shaped file tree IS
> the product. The standalone CDN-paste form is a secondary
> try-it/download affordance, never presented as the block itself. And
> the generated forms (registry index, per-block item JSON, cdn.html,
> driver page) are **build artifacts**: `gen-blocks.mjs` emits them
> under `dist/blocks/` (driver pages under the driver's gitignored
> `pages/generated/`), stamped from `package.json` at build — they are
> never committed, so `blocks/<id>/` shows only authored source plus
> `registry-item.json`, and the release-please extra-files wiring for a
> committed cdn.html is gone with the committed file.

### Registry mechanics (adopted from the shadcn registry research, 2026-08-31)

The research report on shadcn's registry landed; these mechanics are
adopted, adapted where our axes differ:

- **The registry-item skeleton is adopted** for the per-block
  manifest: `name` / `title` / `description` / `type`
  (block | component | page | file), `files[]` with per-file `type` and
  optional `target`, npm `dependencies`, `registryDependencies`,
  `cssVars`, `envVars`, `docs` (a string the CLI prints on install —
  where a block's "needs an endpoint at /api/chat" note lives),
  `categories`, `meta`. A proven vocabulary is worth reusing; inventing
  a synonym schema buys nothing and costs every tool that already
  speaks this shape.
- **Producer side, adopted:** the directory scan emits a `registry.json`
  index plus a **static per-block JSON at a public URL**
  (`public/r/<name>.json` shape) as part of the generation step. Any
  static host is then a registry, and **the per-block JSON URL is the
  integration surface**: shadcn's Open-in-v0 is nothing but a link
  handing that URL to a tool, and our builder/gallery/MCP analog gets
  the same for free — M-4's `add`-via-MCP and the gallery both resolve
  the same URL the CLI does.
- **`registryDependencies` stays, and works harder than shadcn's:**
  block-on-block deps (bare name; namespaced and URL forms accepted per
  the shadcn grammar), AND **backend-route deps** — "this block needs
  route X for integration Y", resolved against the scaffolder catalog
  that already models routes per integration × runtime. shadcn never
  faces this because its blocks have no wire; ours stream, so the dep
  graph must be able to say so.
- **`cssVars` lands on our token system** — `--kai-*` knobs on the
  host, the flat `light`/`dark` shape `ThemePayload` already defines —
  never a Tailwind config. This is Part 4's carrier expressed in the
  manifest: `cssVars` IS the block's theme file in registry form, and
  `themePayloadToCss` is the one serializer for both.
- **`meta.iframeHeight`** is read by the gallery (B-G) for preview
  sizing, matching the shadcn convention so the field means what a
  reader expects.
- **What our resolution DELETES (the structural simplification):**
  shadcn's hardest CLI machinery — `components.json`
  aliases/tsx/rsc/registries config, import rewriting into alias paths,
  recursive source-copy of dependency trees — exists because it copies
  React source that must import other copied React source. Our base
  form is HTML + custom elements, which are **global by construction**:
  no aliases, no import rewrite, no components.json analog for the
  html/CDN targets. The react variant reuses the published
  `@kitn.ai/ui/react` wrapper imports rather than rewriting paths.
  `add` is: fetch/resolve item JSON → resolve `registryDependencies`
  → install npm deps → write files to targets. Nothing more.

**Versioning stance — adopted, with our structural advantage stated.**
shadcn's answer is "it's your code now": no version field, no update
path, diffing acknowledged useless after customization (their v4 goes
further toward ownership, not less). We adopt that stance **for the
glue layer**: a block's html/js/css is the consumer's the moment it
lands, and no update machinery is promised for it. But the trade is
structurally better here: shadcn copies the *primitives*, so a copied
block freezes the whole stack; our blocks compose `kai-*` elements
resolved from the published kit, so **a block freezes only the
wiring** — the elements underneath keep updating on the consumer's
normal dependency (or pinned-CDN) bump. The generated CDN pin is the
one version fact a block carries, and it is generated, never typed
(definitional point 3 above).

## Rulings — Part 3: the CLI (`create-kai add <block>`)

- **`add` is a subcommand of the existing create-kai CLI**, beside the
  wizard, not a second binary. The wizard remains the from-scratch door;
  `add` is the into-an-existing-project door. When `add` runs in an
  empty directory it says so and points at the wizard (loud, not
  magical).
- **The registry is derived, never hand-listed.** Blocks live at
  `packages/ui/blocks/<id>/` (each with a small manifest: title,
  description, parts used, deps, gated-on). The registry module scans
  the directory — the same discovery discipline as the construct
  fixtures and the scaffold gate's axes — and create-kai imports it at
  bundle time exactly the way `catalog.ts` already imports
  `../../ui/src/agent-tooling/registry`. Adding a block = adding a
  directory; the gallery, the CLI menu, the MCP listing and the CI cell
  count all move on their own. (`create-kai add --list` prints the
  count; no count is written anywhere.)

  **Path note, 2026-09-02:** the block sources moved to
  `packages/blocks/blocks/<id>/` and the registry to `@kitn.ai/blocks`. See
  `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` section
  2. Everything this bullet says about the mechanism still holds.
- **What `add` writes:** the block's `add`-form files into a
  conventional path (announced, collision-checked, never overwriting
  silently), plus the dependency line (`@kitn.ai/ui` at the CLI's
  existing kit-pin range — `kit-pin.ts` already owns that fact), plus
  the framework-native variant selected by detection (next ruling).
- **Framework detection (owner addition, 2026-08-31).** `add` reads the
  host project, never asks what it can see:
  1. **No project context** (no `package.json` walking up from cwd):
     `add` says so and prints/writes the **CDN self-contained form** —
     the paste context is the delivery form for it.
  2. **`react` in the project's deps** (`package.json`
     dependencies/devDependencies): emit the block rewritten onto the
     **`@kitn.ai/ui/react` typed wrappers** (`Chat`, `Message`, … —
     typed props and `onKai*` handlers instead of hand-cast
     `CustomEvent`s, which is exactly spike finding 1's DX gap closed
     for this cell).
  3. **Any other project**: the plain web-component `add` form —
     elements work everywhere, and that base variant is the one every
     block is authored in.
  4. **Ambiguous** (e.g. multiple frameworks present, or a `react` dep
     in a repo whose app framework is something else and the signals
     conflict): **ask, loudly, with what was found named** — "found
     react AND svelte; which does this block land in?" — never guess
     silently. Detection rules are data (a signals table), tested per
     rule, so a new framework variant adds a row rather than a branch.
  - **The rewrite mechanism is the scaffolder's per-framework emission
    machinery**, not a new engine: the `kai` MCP's scaffold tool
    (`agent-tooling/mcp/tools/scaffold.ts` and the integration route
    templates) already emits per-framework consumer code and is
    gate-compiled across the tsc projects by `verify:scaffold` —
    blocks' framework variants ride that machinery and that gate
    (V-2's add-form typecheck reuses the same projects), so a variant
    the gate doesn't compile doesn't ship. The plain html+js form
    stays the base variant every block has; framework variants beyond
    react are added per demand, not speculatively.
- **CDN-paste and `add` stay one source of truth** by construction: both
  are generated from the same authored files (Part 2). The CLI never
  carries a copy of a block; it resolves the registry the ui package
  ships — and, identically, any per-block JSON URL (registry
  mechanics), so a third-party static registry works through the same
  path from day one.
- **Resolution is the shadcn flow minus its hardest parts** (registry
  mechanics, "what our resolution DELETES"): resolve item JSON →
  resolve `registryDependencies` (blocks and backend routes) → install
  npm deps → write files to targets, print `docs`. No
  `components.json`, no alias map, no import rewriting for the
  html/CDN targets; the react variant imports the published wrappers.

## Rulings — Part 4: theme builder integration

The studio's embed contract already exists — `ThemePayload` in
`packages/ui/src/theme-studio-app/theme-payload.ts` is the ONE flat wire
shape (`light`/`dark`/`radius`/`fonts`, `--kai-*` knob names) both sides
of the postMessage handshake import.

- **The gallery flow:** browse a block → open it with the theme studio
  beside it (the same studio embed the builder hosts today) → the studio
  posts `ThemePayload` changes → the gallery applies them live to the
  running block → download/`add` carries the tokens.
- **The token carrier is a per-block theme file of `--kai-*` overrides,
  replacing the construct file's role.** `add` writes `theme.css` — a
  `:root { --kai-* ... }` block plus a `.dark { ... }` block; CDN-paste
  inlines the identical rules in a `<style>` tag. One shared fold,
  `themePayloadToCss(payload)`, lives beside `theme-payload.ts` and both
  the gallery and the generator use it — never two serializers. In the
  registry manifest this same data rides the adopted `cssVars` field
  (registry mechanics): `cssVars` on our token system, `--kai-*` on the
  host, never a Tailwind config — one theme fact, three renderings
  (manifest field, `theme.css`, inline style), one serializer.
- **Why this carrier and not a linked `theme.tokens.css`:** phase 2
  measured it — elements read `var(--kai-color-*, fallback)` directly
  and custom properties inherit into shadow DOM, so the stylesheet link
  is unnecessary for element theming (the stylesheet's own header says
  so; the docs page contradicting it is already a recorded phase-2 gap).
  With chrome now made of elements (P-1..P-4), the last reason a block
  needed `theme.tokens.css` — painting hand-built light-DOM chrome from
  `--color-*` (phase 3's F-2 recipe, with its `.dark`-class/
  `prefers-color-scheme` sync wrinkle) — disappears. A block's theme is
  knob overrides, nothing else, which is also exactly what the studio
  emits.
- **Acceptance:** themed download of the reference block reproduces the
  studio's preview (screenshot probe under a non-default accent, the
  phase-3 `fine-accent` pattern); a block with NO theme file renders kit
  defaults and follows `prefers-color-scheme` with zero code
  (`theme="auto"`, verified in both spike phases).

## Rulings — Part 5: deprecation of the config route ("no old junk")

Per the decide-loudly rule: **nothing is deleted; everything is parked
with a notice that says what replaces it.** The owner's "deprecate it
until we are done with this" is a transition state, and Amendment 3's
tier-1 ruling is NOT reversed by this spec — whether construct's tier 1
survives blocks-landing is an owner call scheduled at the end of the
plan, made against a working gallery instead of a hypothesis.

**KEPT, no notice:**

- The construct **dev server / preview / studio infrastructure**
  (`kai dev`, the SSE hub, the prebuilt builder page, the theme studio
  embed). It becomes the **gallery's front door**: the same server grows
  the block gallery route, and the studio embed is Part 4's mechanism.
  This is infrastructure, not the config vocabulary.
- `kai eject` / `kai compile` for existing constructs — people hold
  construct files today (0.31.0 shipped the builder publicly); their
  exits keep working.
- `cards[].kind`, the scripted-mocks work, and everything Amendment 3
  ruled tier-independent.

**DEPRECATED-UNTIL-BLOCKS-LAND (notice, still functional):**

- The **template starters and their panel surfaces** in the builder: the
  five template cards gain a transitional banner ("blocks are replacing
  templates; this template keeps working") once the reference block
  ships. New config vocabulary is frozen — which Amendment 3 already
  did for tier 2+ (queue CLOSED); this extends the freeze to tier 1 for
  the duration.
- The **create-kai wizard's construct-emitting shapes**: same banner
  policy in the wizard copy; the wizard itself stays (it converges with
  the gallery entry per the template-builder spec's own process note).
- **`kai dev --builder`'s front door** during the transition: it keeps
  opening the template picker (killing it would strand 0.31.0 users),
  with the banner linking the gallery route the moment the gallery
  route exists in the same server. When the gallery has its v1 blocks,
  the default front door flips to the gallery and the picker moves
  behind a labeled "config templates (deprecated)" entry.
- **Docs pages** needing banners: the builder guide, the construct/
  template pages, and the wizard sections of getting-started. Redirects
  only when a page's replacement actually exists; a banner that points
  at nothing ships nothing. Historical release notes are records and
  are left alone (the `lint:cdn-pins` historical-waiver precedent).

**Explicitly NOT deprecated:** the compiled-element output (`kai
compile`) as embed packaging — Amendment 4 keeps the box as a packaging
choice, and a block wanting a one-tag embed compiles the same way.

## Rulings — Part 6: MCP updates

The effort discipline for all of this: **effort scales with axes, not
cells, when derived** — the `verify:scaffold` lesson (every axis read
from the registry so a new integration moves cell counts on its own;
see also the live-runtime spec's R11 recording the same constraint).
Every MCP answer below reads its axes from artifacts, never restates
them in prompt text.

- **M-1 · Cell-scoped `component_reference`.** Answers become scoped by
  **delivery × integration read from the project on disk** — package
  manager files, bundler config, framework deps, or their absence
  (= CDN cell) — not restated by the model. A CDN-cell answer never
  recommends the root export (phase 2's captured failure); a bundler-
  cell answer never hand-rolls a store. The icon roster (P-8) is
  answerable by name.
- **M-2 · A `validate` tool.** Takes pasted composition (HTML and/or
  JS) and checks it against the machine-readable contracts:
  array/object props set as attributes (the `kai-` contract's top
  trap), `kitn-` legacy prefix, unknown element names and icon names
  (against `element-meta.json` / `ICON_NAMES`), event names that don't
  exist, the store-before-`conversations` ordering (spike finding 2),
  and the reactivity contract's known stale patterns where statically
  visible. Heuristic where it must be, but every check is derived from
  the same artifacts the docs are generated from — the tool cannot know
  a contract the artifacts don't carry, which is the point.
- **M-3 · Verified snippets.** Snippets the MCP hands out for
  block-adjacent asks are backed by the compile gates: block sources
  themselves (compiled by V-2) are the quarry, so every snippet has a
  CI cell somewhere upstream. No freehand SSE readers, no freehand
  stores — the CLAUDE.md rule, now enforceable because the corpus
  exists.
- **M-4 · `add` via MCP.** A tool equivalent to `create-kai add`:
  lists the registry (same derived module), writes the same files,
  and resolves the same per-block JSON URLs — the registry-mechanics
  ruling that the public item URL is THE integration surface means the
  MCP's open-a-block flow is the shadcn Open-in-v0 analog with no
  extra protocol. The harness customizing a block is the owner's
  stated loop; the MCP is where that harness lives.

## Rulings — Part 7: verification + parity machinery

- **V-1 · The block driver.** `fine-drive.mjs` generalizes into a
  per-block Playwright driver: serve the CDN form against the built
  `dist/` (the phase-2/3 stand-in pattern), run the block's declared
  states, assert **behavioral probes** (the phase-3 set: navigation
  rules, badge on/off, suggestions lifecycle) and **computed-style
  probes** (the round-3 lesson: fidelity is measured, not eyeballed —
  a feature checklist passed while the widget drifted, a computed-style
  probe caught it immediately), light + dark, zero console errors, and
  write the screenshot set. States and probes come from the block's own
  state script, so a new block brings its cells with it.
- **V-2 · Every block a CI cell.** A new gate, `verify:blocks`, in the
  required job: cells derived from the blocks directory × delivery
  forms — (a) generate both forms and diff-check the CDN form is
  current (the derived-artifact-sync pattern `verify-generated-sync`
  already uses), (b) typecheck the `add` form's TS under the existing
  scaffold-gate tsc projects (extending `verify:scaffold`'s project
  set rather than inventing a fourth compiler story), (c) run V-1 per
  block. Like every new guard here: **watch it fail first** — plant a
  drifted CDN form, a bad prop-as-attribute, a wrong screenshot, and
  see each named ([[checks-that-prove-nothing]]).
- **V-3 · Screenshot pairs per release.** The release PR runs V-1 with
  screenshot output and attaches the set (the owner's primetime bar:
  screenshot-driven per release). Pairs meaning: reference block vs
  the facade for the widget family (the P-9 parity pair), and
  current-vs-previous per block elsewhere.
- **V-4 · The gap-filling loop, as process.** When a block build hits a
  wall — a missing part, a private class, an unreachable seam — the
  round does three things before the block ships: the **kit fix** (a
  part, a prop, an export), the **MCP/docs update in the same round**
  (the artifact regenerates; M-1/M-2 answers move with it), and a
  **guard for the wall's class** where one is expressible (the
  `searchable` prop's spike-ethic precedent: the residual closed in
  the kit, not worked around). This is the owner's "when we find gaps
  we fill the gaps and we're updating our MCP server", written down as
  the definition of done for a block.
- **Extends vs new:** extends — `verify:scaffold`'s derived-axes/tsc
  projects, `verify-generated-sync`'s drift pattern, `lint:cdn-pins`'
  version equality (already in scope for `packages/`), the emitted
  project's run-the-real-code ethic. New — `verify:blocks` itself, the
  generalized driver, the screenshot machinery.

## Non-goals

1. **Not the hosted gallery service.** The gallery is the dev server's
   route + a docs-site listing; auth/tenancy/storage stay out (the
   live-runtime spec's non-goal 1, unchanged).
2. **Not the realtime adapter.** `readRealtimeEvents` in `wire/` is
   voice-widget's named dependency and its own future spec.
3. **Not reversing Amendment 3.** Tier-1 construct's fate is an owner
   call at plan end, made against the working gallery.
4. **Not framework-variant blocks for every framework at v1.** Base
   html+js form for all; variants per demand (Part 3).
5. **Not touching `verify:construct`'s matrix** except where deprecation
   banners land in its fixtures' copy.
6. **Not the live construct runtime.** That spec stands separately;
   nothing here consumes it, and its owner gate ("after the content is
   validated") is unchanged.

## Open questions — RULED (owner, 2026-08-31)

1. **Gallery placement:** dev-server route first with a docs-site
   listing after (recommended — the studio embed and live theming
   already live in the dev server), or docs-site first?
   RULED: dev-server route first, docs-site listing after
   (recommendation adopted).
2. **Does the reference block's compiled-element embed ship in v1's
   gallery** as a third delivery form, or wait? Recommend wait: two
   derived forms is the drift surface we can gate now; Amendment 4
   keeps the door open.
   RULED: wait; v1 ships the two derived forms (recommendation
   adopted).
3. **The tier-1 construct call** (Non-goal 3): scheduled for the end of
   the plan — confirm that timing.
   RULED: confirmed for plan end, decided against the working gallery.

The owner signed off the spec and authorized execution per the
companion plan on 2026-08-31.
