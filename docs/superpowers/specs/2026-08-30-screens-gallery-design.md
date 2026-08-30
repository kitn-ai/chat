# Screens gallery — design spec (2026-08-30)

Executes the 2026-08-28 owner ruling: the proof screens (about/auth/pricing/
dashboard/data-table/empty-states) are not builder material — they become a
**Screens gallery** on the docs site: a browsable library, per-screen live
preview + copy-the-source, feeding the banked MCP capability menu, with only a
quiet pointer from the builder Start screen. Plus the 2026-08-30 ruling: the
**Settings screen** (parked with `modes[]`) is re-routed here — it is app
chrome, not chat-surface vocabulary.

This is the concrete opening move of the general-UI positioning round (owner
item: roughly a third of the elements are general-purpose atoms, but the docs
market only "AI chat components"). Scope is honest: this spec covers the
gallery, one guide page, one nav topic, one builder pointer line, and the MCP
feed. A full marketing/landing re-cast is out.

## What the investigation found (load-bearing facts)

- **The proof stories exist and are polished.** Five screens under the
  Storybook group `Labs/Proofs` in `packages/ui/src/elements/`:
  `proof-auth` · `proof-pricing` · `proof-dashboard` · `proof-data-table` ·
  `proof-empty-states`, plus `proof-about` (the group's explainer card, not a
  screen). Each is a Solid render function built from token utilities
  (`bg-card`, `text-muted-foreground`, `--color-tool-*`, `.kai-elevation`) +
  raw markup + lucide-solid glyphs, deliberately using almost no kai-*
  elements (auth dogfoods `<kai-input>`, data-table `<kai-search>`, pricing
  `<kai-icon>`). Full-viewport layouts (`h-screen` / `min-h-screen`,
  `layout: 'fullscreen'`). Light/dark falls out of the tokens.
- **They already carry the two-copy defect this spec exists to kill.** Each
  story hand-maintains a `parameters.docs.source.code` HTML "representative
  skeleton" — a typed restatement of the render that is already abridged
  (`class="..."` placeholders) and will drift the first time the screen moves.
- **How the docs site embeds live components today** (this is the mechanism to
  build against, per the mandate):
  - `apps/docs` is Astro Starlight with the `solid()` integration; interactive
    demos are Solid islands under `apps/docs/src/components/*Demo.tsx`
    mounted from MDX with `client:only="solid"`.
  - Islands never import kit Solid source. They call `loadKit()`
    (`src/components/example/kit.ts`), which imports **`@kitn.ai/ui/elements`
    from the live workspace package** and awaits `kai-chat` definition, then
    create kai-* elements imperatively. Theme sync is `syncKaiTheme()`
    mirroring Starlight's `data-theme` onto the element's `theme` attribute.
  - The generic `Example.tsx` island is the one **derived** preview: it reads
    `@kitn.ai/ui/element-meta.json` + `lib/codegen` + `lib/sample-data` and
    generates the code panel — no hand-copied snippet. The composed demo pages
    (patterns/examples) by contrast pair a Demo island with a hand-written
    code fence in the MDX.
  - The docs site's Tailwind pipeline (`app.css`) imports the docs' **own**
    token set (`tokens.css`, `--kai-*`/ink-scale naming) — it does **not**
    import the kit's `theme.css`, and no light-DOM kit utility (`bg-card`,
    `bg-surface-sunken`, …) exists on a docs page today. Everything visual
    the demos show lives inside kai-* shadow roots (compiled.css).
- **The shipped shadow sheet deliberately excludes stories.**
  `src/elements/styles.css` is `source(none)` + explicit `@source` lines for
  `components/ui/elements/primitives/utils/builder-app`, with
  `@source not "../**/*.stories.tsx"` — utilities used only by proof screens
  are excluded from `compiled.css` on purpose ("paid by every consumer");
  `.storybook/styles.css` adds its own `@source` for stories. Any new screens
  directory must follow the same split: scanned by Storybook and by the docs
  site, **never** added to `styles.css`.
- **The MCP feed vehicle already exists.** The code-recipe registry
  (`src/agent-tooling/recipes/`): a `CodeRecipe` is
  `{id, title, intent, ingredients, notes, files[]}` with `files[].code` as
  string literals; registered recipes are **served by
  `component_reference({name: "<id>"})` AND compiled by `verify:scaffold`**,
  which loads the list through the registry bundle so adding an entry moves
  the gate's printed cell counts by itself. One recipe exists today
  (`composed-thread`). This is exactly the "capability menu" data shape the
  gallery is supposed to feed (banked idea, coupling-map §4 discipline).
- **The acceptance-surface lesson applies.** The 2026-08-28 builder handoff's
  process lesson: the phase-3 spec treated the design stories as groundwork
  instead of the binding visual contract, and the parity gap shipped. This
  spec names the stories as the acceptance surface up front (Ruling R-6).

---

## R-1. Gallery inventory v1 + the single source of truth

### Inventory (derived from the existing story corpus, nothing invented)

Ships in v1 — six screens:

| id | Today | Elements dogfooded | Note |
|---|---|---|---|
| `auth` | `proof-auth.stories.tsx` | kai-input (leading/trailing slots) | sign-in card, OAuth row |
| `pricing` | `proof-pricing.stories.tsx` | kai-icon | plans, billing toggle, feature matrix |
| `dashboard` | `proof-dashboard.stories.tsx` | none (pure tokens) | stat tiles, activity feed, charts-as-markup |
| `data-table` | `proof-data-table.stories.tsx` | kai-search | sortable members table, status pills, pagination |
| `empty-states` | `proof-empty-states.stories.tsx` | none (pure tokens) | empty/error/offline gallery |
| `settings` | **new — R-2** | kai-tabs, kai-input, kai-switch, kai-select, kai-avatar, kai-button (target set; the design round decides) | app chrome |

Considered and excluded, with reasons:

- `proof-about` — the Storybook group's explainer, not a screen. Its framing
  (what token-only screens prove, where the gaps surface) is absorbed into
  the gallery's guide page (R-3) and the story updated, not shipped as an
  entry.
- The ten `Labs/Apps` clones (chatgpt, claude-code, codex, lovable,
  perplexity ×2, t3code, v0, wisp, tasks) — chat surfaces and brand-shaped
  recreations; they are the Examples corpus, not general-UI screens.
- `Labs/Workspace Home`, the builder stories, split-workspace — chat-surface
  and builder material respectively (the owner ruling routes those away from
  this gallery by definition).
- `Labs/Foundations` (form-controls, primitives) — component-page material,
  already covered by the components topic.

Future entries come from the same door: a screen earns a gallery slot by first
existing as a designed story (R-2's story-first rule generalizes), then
registering. No speculative inventory here.

### Source of truth: one screen component file, everything else derived

**Ruling: each screen's single source of truth is a standalone Solid
component file, `packages/ui/src/screens/<id>.tsx`, plus a leaf metadata
registry `packages/ui/src/screens/registry.ts`. The story, the docs preview,
the copyable source, and the MCP recipe are all derived from those files.
The hand-written `parameters.docs.source.code` skeletons are deleted.**

Why not the story file as the source: a `.stories.tsx` file cannot be the
copyable artifact (Meta/StoryObj scaffolding, `declare module` JSX
augmentations, storybook imports are noise a consumer must strip by hand) and
cannot be imported by the docs site without dragging storybook types in. Why
not a dedicated recipe file with the source as a string literal: that is the
hand-copied second version by construction — the exact defect the mandate
names. Extracting the render into a plain component makes the story a thin
wrapper and gives every other consumer a real module.

Shape of a screen file (rules, enforced by a small screens contract test):

- Default-exports one Solid component, self-contained: imports only
  `solid-js`, `lucide-solid`, and (relative) kai-* element registration
  modules it needs (`../elements/input`, …). **The relative registration
  imports are rewritten to `@kitn.ai/ui/elements` by the recipe generator**
  (R-5) so the emitted copy is consumer-shaped; keeping them relative in
  source keeps Storybook and the kit's own typecheck working on an unbuilt
  tree (the dist-first self-import trap the tsconfig.mcp ordering note warns
  about).
- No imports from `components/`, `ui/`, or `primitives/` — a screen is what a
  *consumer* can build: tokens + markup + published kai-* elements. This is
  the positioning claim made structural.
- Token utilities only, no hex — same rule the proofs already follow.
- `registry.ts` is a zod-free leaf (the `templates.ts` pattern):
  `{ id, title, blurb, ingredients: string[], notes: string[] }` per screen,
  `SCREENS` array exported. It carries the metadata; it does **not** carry
  source strings.

Derivations:

- **Story**: `screens.stories.tsx` (one file, group retitled
  `Labs/Screens`) renders each registry entry's component;
  `parameters.docs.source.code` becomes the real file via Vite `?raw` import.
  `proof-about` is rewritten as the `Labs/Screens` About card (still
  explaining the token-proof origin *and* the gallery). The old
  `proof-*.stories.tsx` files are deleted after extraction — their renders
  move, byte-for-byte where possible, into `screens/<id>.tsx`. Story ids
  change (`labs-proofs--*` → `labs-screens--*`); nothing in the repo pins the
  old ids beyond comments (verified by grep before the rename lands).
- **Docs preview + copy button**: R-3's mechanism, importing the same
  component and the same `?raw` source.
- **MCP recipe**: R-5's generator.
- **Tailwind scan**: add `@source` for `src/screens` to `.storybook/styles.css`
  and to the docs preview stylesheet (R-3). **Do not** add it to
  `src/elements/styles.css` — the shipped shadow sheet stays free of
  screen-only utilities (the `source(none)` comment there is the law; the
  Tailwind-shadow-DOM verdict memo's ~19.9KB-gz budget is the re-open
  trigger, not a target to spend).

What the consumer copies: the authored Solid/JSX source, verbatim. These
screens are overwhelmingly markup + token classes; the JSX translates
near-mechanically to React/Vue/Svelte, and each gallery page says so in one
line ("Solid JSX; for React swap `class` → `className`, `<For>` → `.map()`")
plus the lucide-solid dependency note. Per-framework emitted variants are
explicitly **out of v1** — that is scaffolder territory, and hand-maintaining
five translations of six screens is thirty copies of the thing we just made
singular. If the gallery earns traffic, framework emit joins the scaffolder
axis where `verify:scaffold` can compile it (recorded as the follow-up, not
built now).

## R-2. Settings screen: story-first, in this arc

**Ruling: build it in this arc, story-first.** The owner's story-first policy
(2026-08-26) says new visual surfaces get a stub-data Storybook story FIRST
for design iteration; deferring the one screen the 2026-08-30 ruling
explicitly re-routed here would ship a gallery whose newest ruling is the one
hole in it. It is also the entry that best carries the positioning story: the
other five prove *tokens*; settings is the one that composes the general-UI
*atoms* (tabs, switch, select, input, avatar, button, separator) into app
chrome — the exact "use kai for your whole app" claim.

Scope for v1: one screen, stub data — a settings surface with a section rail
or `kai-tabs` (the design round decides), covering profile (avatar + inputs),
appearance (theme mode via kai-switch/kai-select), and notifications
(switches). Light and dark. No persistence, no routing — it is a screen, not
an app. Danger-zone/billing sections are optional design-round material, not
requirements.

Process: design iterates in the story (`Labs/Screens` / Settings) with the
owner reviewing there — the story is the binding design surface (R-6). Only
after the story settles does the screen extract into `screens/settings.tsx` +
registry + gallery entry, same pipeline as the other five. If the design
round stalls, the gallery ships five screens and settings follows — the
pipeline does not block on it, but the default plan is six.

## R-3. Docs-site placement + the whole-app story

### Placement: a new sidebar topic, `Screens`

The docs use `starlight-sidebar-topics` (Docs · Components · Examples ·
Patterns · Integrations). **Ruling: `Screens` becomes its own topic**, placed
after Examples, with:

- `screens/overview` — the guide page (below), the topic's landing link.
- One page per screen: `screens/auth`, `screens/pricing`,
  `screens/dashboard`, `screens/data-table`, `screens/empty-states`,
  `screens/settings`.

Not under Examples: the Examples topic is "AI chat apps you can build";
filing the general-UI screens inside it re-tells exactly the story the owner
item says to stop telling. A top-level topic is the positioning move.

**The sidebar item list for the topic is derived, not typed**: the six pages
exist as MDX files, and a docs-side test (see R-6) asserts the set of
`screens/*` pages equals `SCREENS` ids + `overview`, so registering a screen
that has no page (or a page with no registry entry) fails loudly.

### The live preview mechanism (the load-bearing decision)

The proof screens are full-viewport layouts. Inlining them into a Starlight
content column breaks their geometry, and rendering their light-DOM token
utilities requires the kit's Tailwind theme on the page — importing
`@kitn.ai/ui/theme.css` into the docs' global `app.css` would restyle a site
that has its own token system (`--kai-*` / ink scale). Neither existing docs
mechanism fits: `Example.tsx` is per-element, and the Demo-island pattern
would put screen markup into the docs' un-themed light DOM.

**Ruling: previews render in an iframe, served by a dedicated full-bleed
Astro route per screen.**

- `apps/docs/src/pages/screens/preview/[id].astro` — a minimal non-Starlight
  page (static paths derived from `SCREENS`): no site chrome, one
  `client:only="solid"` island that renders the screen component, and its own
  stylesheet `screen-preview.css`:
  `@import "tailwindcss" source(none)` + `@import "@kitn.ai/ui/theme.css"` +
  `@source` lines for `packages/ui/src/screens` (and the kit dirs the screens'
  kai-* usage needs nothing from — the elements style themselves in shadow
  roots via `loadKit()`, exactly as the demo islands do today). This is the
  safe `theme.css` usage (Tailwind processes it — the Solid-starter
  qualifier from the coupling lessons, not the raw-browser-import trap).
- The island imports the screen component **relatively across the workspace**
  (`../../../../packages/ui/src/screens/<id>.tsx`) — same Vite pipeline, same
  `solid()` integration; `vite.server.fs.allow` gains the workspace root for
  dev. `loadKit()` + `whenDefined` before mount, as every island does.
- Theme: the preview page reads `?theme=` on load and listens for a
  `postMessage` theme flip; the embedding island sends it from the existing
  `data-theme` MutationObserver pattern (`syncKaiTheme`'s observer,
  generalized).
- The gallery MDX page embeds the iframe inside the existing `Resizer`
  (drag-to-resize, like `Example.tsx`), with an "Open full screen" link to
  the preview route.
- **Copy the source**: a `ScreenSource` island imports the same file with
  `?raw`, renders it in the docs' code panel treatment with a copy button.
  One file, three consumers (story, preview, source panel), zero copies.

Fallback recorded (not planned): if cross-package TSX compilation fights the
docs Vite setup in a way a `fs.allow` + alias cannot fix, the preview iframe
points at the deployed Storybook's `iframe.html?id=labs-screens--<id>` — same
zero-copy property, worse coupling (docs page ↔ Storybook deploy). Only taken
with a dated note in the coupling map.

### The whole-app story: one guide page

`screens/overview` ("Build your whole app with AI/UI" — final title per
STYLE.md's earn-every-sentence pass) tells the positioning story once:

- The kit is a token system + general-purpose atoms + AI feature components;
  roughly a third of the elements are ordinary app UI. (State the fact by
  pointing at the Foundations/Controls groups — no hand-typed element count;
  counts rot, per the no-numbers rule.)
- What each gallery entry proves (absorbing `proof-about`'s framing: tokens
  can dress screens the kit ships no component for; where they could not,
  a component got built — kai-input, kai-search exist because these screens
  surfaced the gap).
- How to take one: copy the source, install the noted deps, keep the tokens.

Honest scope: this page + the gallery **is** the positioning work in this
spec. Landing-page copy, the components-topic naming confusion
("primitives" vs the atom tier), and any marketing re-cast are separate
owner-visible rounds; this guide gives them something concrete to point at.

## R-4. The builder Start pointer

**Ruling: one muted line in the Start screen footer, text + link, no card, no
icon, no template-grid presence:**

> Building app screens rather than a chat surface? See the
> [Screens gallery](https://ui.kitn.ai/screens/overview/).

- Implementation: `packages/ui/src/components/builder-start.tsx`, rendered
  after the template grid in `text-sm text-muted-foreground`, the link in the
  existing quiet-link treatment. It must not touch `BUILDER_TEMPLATES` (whose
  map-over-`TEMPLATES` equality is byte-pinned by `builder-start.test.tsx`)
  and must not read as a seventh template.
- The Labs/Builder/Start story picks it up automatically (stories are the
  binding surface; the parity round made the story and the real page share
  this component).
- The URL is a stable docs path, no version literal — nothing for
  `lint:cdn-pins` to see; if a pin ever appears here it is a defect.

## R-5. The MCP feed: screens become code recipes, generated

**Ruling: each gallery screen registers as a `CodeRecipe`, and the recipe's
`files[].code` is GENERATED from `screens/<id>.tsx` at `build:api` time —
the registry metadata (`screens/registry.ts`) supplies id/title/intent/
ingredients/notes; nothing is restated by hand.**

Mechanism (the `gen-construct-template-fixtures` pattern, coupling-map §4's
template-registry row is the model):

- `packages/ui/scripts/gen-screen-recipes.mjs`, run inside `build:api`:
  reads `SCREENS` + each `screens/<id>.tsx`, applies the **import rewrite**
  (relative `../elements/<x>` registration imports → one
  `import '@kitn.ai/ui/elements'` line; anything else non-consumer-shaped is
  a generator ERROR, not a rewrite), and writes
  `src/agent-tooling/recipes/generated/screens.json`
  `{id → {meta, code}}`.
- `recipes/index.ts` maps that JSON into `codeRecipes` entries with ids
  `screen-<id>` (`lang: 'tsx'` — the `CodeRecipeFile` union widens from
  `'ts' | 'html' | 'css'` to include `'tsx'`), alongside `composed-thread`.
  `component_reference({name: "screen-auth"})` then serves it, and the
  recipe LIST is the capability-menu statement surface: a harness that asks
  what the kit can do gets "auth / pricing / dashboard / data-table /
  empty-states / settings" as informed statements with compiling source
  behind each. The full banked capability-menu tool stays banked — this
  makes it data-backed without designing its conversation shape here.
- **Gates that make the derivation real**:
  - `scripts/verify-generated-sync.mjs`: `generated/screens.json` joins
    `GENERATED` (both directions are enforced there since the 2026-08-28
    fix wave — a fixture on disk the list doesn't name is caught too).
  - `verify:scaffold` compiles every registered code recipe; `tsx` recipes
    compile under the existing **solid** tsc project (`jsx: preserve` +
    `jsxImportSource`), resolving `@kitn.ai/ui` through the shipped exports
    map — so the import rewrite is proven consumer-real, not assumed. The
    gate prints its cell counts; adding a screen moves them on its own.
    (`lucide-solid` joins the consumer-project devDependencies the same way
    the route hosts did — a real dep, never a `declare module` stub.)
  - `verify-pack-weight`: the generated JSON rides into the MCP bundle;
    expected growth is tens of KB against a 13.5 MiB ceiling — if it trips,
    that is a real conversation, not a silent raise.
- **Coupling-map §4 gains a row**: source of truth `src/screens/*.tsx` +
  `screens/registry.ts`; derived by the story file, the docs preview/source
  islands, and `gen-screen-recipes.mjs`; adding a screen re-fires the story
  group, the docs page-set test, the recipe list, and the scaffold cell
  count; enforced by `verify:generated` + `verify:scaffold` + the docs-side
  page-set test; the one deliberate copy is the generated JSON, named as
  such.

## R-6. Gates and acceptance surface

**The Labs/Screens stories are the binding design surface.** Named here, per
the parity lesson: every visual verification in this arc — including the
final IVP — compares against the stories, not against this spec's prose. The
docs gallery preview of a screen must be the story's screen (same component,
so divergence is a wiring bug, and the IVP looks for exactly that).

Per-change gates:

- **Kit changes** (`src/screens/`, story rewrite, builder-start line,
  recipes): `nx typecheck ui` (fresh runs `--skip-nx-cache` per the cached-
  green warning) · `--project=unit` AND `--project=emitted` (both are the
  merge gate) · the screens contract test (import discipline + registry↔story
  coverage) · axe over each Labs/Screens story (the builder rounds set the
  axe-green precedent) · `lint:silent-drops` untouched (screens never touch
  `src/wire`).
- **Recipe/generator changes**: `nx build ui` (NOT cache-trusted for
  derived artifacts — use `build:api` in `packages/ui` or `--skip-nx-cache`
  when the generated JSON matters) · `verify:generated` · `verify:scaffold`
  (read the printed axes/cell counts; the tsx-recipe cells must appear) ·
  `verify:pack` / pack-weight.
- **Docs changes**: the docs build (`nx build docs`) · the page-set-equals-
  registry test · a STYLE.md pass on the overview page and every gallery
  page's copy (human voice, no em-dash flourishes, no filler) ·
  `lint:cdn-pins` runs as always and must stay clean — gallery pages carry
  **no version literals** (install instructions link the Installation page
  rather than restating a pinned snippet).
- **IVP (end of arc, per defer-IVP-to-end)**: Playwright over the built docs
  site — each gallery page renders its iframe preview (screenshot each,
  light AND dark, compared against the corresponding story screenshot), the
  copy button yields the exact `?raw` source, the full-screen route works,
  the builder Start line renders and links. Storybook-static cannot register
  web components — the story-side screenshots come from `npm run dev`
  Storybook, the docs side from the built site preview.
- **Story tests**: smoke-render each screen story in the unit project (jsdom)
  so the extraction cannot silently break a screen; the Settings story
  additionally goes through the story-first design review before extraction
  (owner sees it in Storybook first — show-first for unseen UI).

## Task breakdown

Order: T1 → {T2, T3} (parallel; T3 can start on the five extracted screens) →
T4 → T5 → T6. T2 merges into T3/T4 when its story settles.

**T1 — Extract screens + registry, retitle stories, kill the copies.**
Files: new `packages/ui/src/screens/{auth,pricing,dashboard,data-table,empty-states}.tsx`
+ `registry.ts` + contract test; new `src/elements/screens.stories.tsx`
(group `Labs/Screens`, `?raw`-derived source params, About card rewritten);
delete `proof-*.stories.tsx`; `.storybook/styles.css` gains
`@source "../src/screens"`; grep confirms nothing pins `labs-proofs--*` ids.
Gates: typecheck (uncached) · unit + emitted projects · axe on the stories ·
visual parity check story-vs-previous-story (screenshots before/after the
extraction — the move must be a no-op on pixels).

**T2 — Settings screen, story-first.**
Files: Settings story added to `screens.stories.tsx` (stub data, kit atoms,
light+dark); after design review, `src/screens/settings.tsx` + registry
entry. Gates: axe · story smoke test · owner/story review is the checkpoint
before extraction (stories are the acceptance surface).

**T3 — Docs gallery: preview route, islands, pages, topic, guide.**
Files: `apps/docs/src/pages/screens/preview/[id].astro` +
`src/styles/screen-preview.css`; islands `src/components/ScreenPreview.tsx`
(iframe + Resizer + theme postMessage) and `ScreenSource.tsx` (`?raw` + copy);
MDX pages `src/content/docs/screens/{overview,auth,pricing,dashboard,
data-table,empty-states,settings}.mdx`; `astro.config.mjs` gains the Screens
topic + `vite.server.fs.allow`; docs-side page-set test. Gates: `nx build
docs` · page-set test · STYLE.md pass · `lint:cdn-pins` clean (no version
literals introduced).

**T4 — MCP feed: generator + recipes + gates.**
Files: `packages/ui/scripts/gen-screen-recipes.mjs` (wired into `build:api`);
`src/agent-tooling/recipes/generated/screens.json` (generated);
`recipes/index.ts` + `recipes/types.ts` (`'tsx'` lang, `screen-*` entries);
`scripts/verify-generated-sync.mjs` `GENERATED` entry; verify-scaffold recipe
compile picks the solid project for `tsx` + consumer devDeps gain
`lucide-solid`. Gates: `build:api` fresh · `verify:generated` ·
`verify:scaffold` (read printed counts) · pack-weight · unit suite.

**T5 — Builder Start pointer.**
Files: `packages/ui/src/components/builder-start.tsx` (one footer line);
Labs/Builder/Start story inherits it. Gates: `builder-start.test.tsx` still
green (template derivation pins untouched) · story screenshot (quiet — the
review question is "does it read as chrome, not a template").

**T6 — Coupling map + arc close.**
Files: `docs/coupling-map.md` §4 new row (source `src/screens` + registry;
derived: story group, docs pages, generated recipe JSON; enforced-by list as
in R-5). Then the end-of-arc IVP from R-6 over the whole surface, evidence
committed under `docs/superpowers/research/` per the builder-arc precedent.
