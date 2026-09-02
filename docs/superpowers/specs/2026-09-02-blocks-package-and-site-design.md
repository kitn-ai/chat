# Blocks: the package, the authored contract, and the site

**Date:** 2026-09-02 · **Status:** draft for owner review (rulings in section 9 were made in-session; the written spec awaits sign-off) · **Scope:** design only. The plan comes next, and sequences the five PRs in section 7, in the order A, B, C, D, B2. Section 8a carries the amendments agreed after review; where it and an earlier section disagreed, the earlier section has been rewritten to match.

Successor to `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md`, which stands
for what a block IS, the parts, the registry mechanics and the CLI flow. This
document settles four things that spec left open or got wrong: where the block
code lives now that the restructure has a rule, what an authored block source
must contain for six framework trees to be *generated* rather than hand-written,
what the public `/blocks` page is, and what gates it.

Read alongside `docs/superpowers/specs/2026-09-01-repo-restructure-design.md`
(the last two sections carry the owner's ruled map and the `packages/` vs
`apps/` rule this design applies).

---

## 1. Naming: blocks, never gallery

"Blocks" is the word, in every new name, route, script, test and doc. `/blocks`
is a section of ui.kitn.ai. There is no "gallery" in anything written from here.

The existing `packages/ui/apps/gallery` page and the `kai dev` `/gallery` route
(`packages/ui/mcp/construct/dev.ts`, the `handleGalleryRequest` block and the
`/kit/` mount its previews import from) are the predecessor. They are retired,
not renamed, in PR C.

---

## 2. Where things live

The restructure rule, owner-ruled 2026-09-01: **imported as code by another
project goes to `packages/`; only served or deployed as a page goes to `apps/`.**
Block sources are imported as code by the CLI, by the ui build scripts and by
the site. They are a package.

### 2.1 The new package

`packages/blocks`, name `@kitn.ai/blocks`, `private: true`, never published.
`pnpm-workspace.yaml` already globs `packages/*`, so it needs no workspace edit.

| Path | What | Moved from |
|---|---|---|
| `blocks/<id>/` | authored block sources | `packages/ui/blocks/<id>/` |
| `src/registry.ts` | manifest schema, validation, discovery, index/item JSON, the CDN-form pass, `checkBlockContracts` | `packages/ui/mcp/blocks/registry.ts` |
| `src/forms/` | one renderer per framework | grown from `packages/ui/mcp/blocks/forms.ts` |
| `src/targets.ts` | the per-framework install-root table | new (section 3.4) |
| `tests/` | the registry and renderer suites | `packages/ui/mcp/tests/blocks-registry.test.ts` |
| `tsconfig.json`, `vitest.config.ts` | its own, not the ui package's | new |

`package.json` carries an inline `nx` key on the pattern
`packages/create-kai/package.json` already uses (a `targets` map with
`test.dependsOn` and `typecheck.dependsOn`). Exports map:

- `.` : the registry, `discoverBlocks`, the manifest types
- `./forms` : the renderers and the form axis
- `./targets` : the install-root table

### 2.2 Dependency direction

**`packages/blocks` depends on nothing.** Not on `@kitn.ai/ui`, not on zod, not
on `node:*`. `registry.ts` already earns this: it takes its two kit-derived
inputs by injection (`routeIntegrations` into `discoverBlocks`, `nonscalarByTag`
into `checkBlockContracts`) and its header states the discipline explicitly, for
the same two reasons that still apply after the move. Keep it exactly.

The ui package gains `@kitn.ai/blocks` as a `workspace:*` **devDependency**.
`packages/ui/scripts/gen-blocks.mjs` and `packages/ui/scripts/verify-blocks.mjs`
stay in `packages/ui` (they need the kit's build outputs and the kit's version)
and import the package by specifier, injecting what only the kit knows:

| Injected input | Read from |
|---|---|
| `routeIntegrations` | `listIntegrations()` in `packages/ui/mcp/registry.ts` |
| `nonscalarByTag` | `packages/ui/src/elements/element-nonscalar.json` |
| `version` | `packages/ui/package.json` |

So: ui build depends on blocks, blocks depends on nothing, no cycle.

One mechanical detail that is easy to get wrong: both scripts are `.mjs` and
`packages/blocks` ships TypeScript source, so `import '@kitn.ai/blocks'` does not
work on its own. Keep the existing `importTs()` esbuild round trip they both
already carry, but point it at the entry **resolved through the package's
exports map** rather than at a path literal, so there is still one identity for
the module. Giving `packages/blocks` a build step of its own is the alternative
and is worse: it puts a build ordering between the package and the ui build for
no gain, since every consumer that matters (create-kai, the site) bundles the
source anyway.

### 2.3 Consumers

Every relative reach across package boundaries becomes a specifier import.

| Consumer | Today | After |
|---|---|---|
| `packages/create-kai/src/blocks.ts` | `../../ui/mcp/blocks/registry`, `../../ui/mcp/blocks/forms` | `@kitn.ai/blocks`, `@kitn.ai/blocks/forms`, `@kitn.ai/blocks/targets` |
| `packages/create-kai/src/react-form.ts` | re-export shim over `../../ui/mcp/blocks/forms` | re-export shim over `@kitn.ai/blocks/forms` |
| `packages/ui/scripts/gen-blocks.mjs` | esbuild-imports the TS by path | imports `@kitn.ai/blocks` |
| `packages/ui/scripts/verify-blocks.mjs` | same | same |
| `apps/docs` | n/a | imports `@kitn.ai/blocks` and `@kitn.ai/blocks/targets`; serves the generated registry and form JSON as static files (section 3.5) |

Three create-kai build details move with it:

- **`bundleGraphProblem`** (`packages/create-kai/src/build-guards.ts`) grades the
  esbuild metafile's input keys against path-shaped ban rules
  (`node_modules/zod/`, `mcp/mcp/`) and its message sends the reader to "the
  LEAF modules at the root of `mcp/`". Both the rules and that message are
  restated for the new specifiers. A workspace-linked package's inputs resolve
  to real paths under `packages/blocks/`, not to `node_modules/@kitn.ai/blocks/`,
  so the ban rules keep working unchanged; what needs writing is the positive
  half, that `packages/blocks/src/**` IS an expected input, so the reuse
  boundary is asserted rather than merely not-banned.
- **`packages/create-kai/scripts/build.mjs`** copies the block sources from the
  **resolved package path** (`createRequire(import.meta.url).resolve` on
  `@kitn.ai/blocks/package.json`, then its `blocks/` directory), never
  `path.join(repoRoot, 'packages/ui/blocks')` as it does today. A repo-root path
  literal is exactly the copy the derive-don't-type rule is about.
- **`packages/create-kai/scripts/verify-pack.mjs`** gains a `dist/blocks/**`
  assertion mirroring the `dist/templates/**` one it already carries. Today a
  tarball with a bundled CLI and no blocks passes: `add` would install and then
  find nothing, which is the same failure shape as the missing-templates case
  that assertion exists for.

### 2.4 A dead emission deleted in the same PR

`packages/ui/config/vite/lib.ts`'s `construct` target lists
`mcp/blocks/registry.ts` and `mcp/blocks/forms.ts` in its `dts.include`, emitting
`dist/agent-tooling/blocks/{registry,forms}.d.ts`. Nothing resolves those: no
`exports` key names them, and the comment at the site already records that the
two entries "currently have no in-repo consumer and are kept only pending a
separate removal decision". The move makes the decision: they go. The
`outDir: 'dist/agent-tooling'` / `entryRoot: 'mcp'` pair stays, because it is the
literal value of `exports["./construct"].types` and is pinned by
`packages/ui/tests/scripts/construct-export-smoke.test.ts`.

Consequence for the tarball: `npm pack --dry-run --json` for `@kitn.ai/ui` must
be identical name-for-name before and after PR A **except** those two `.d.ts`
files. That is the gate on the move.

### 2.5 The site, and what it retires

`/blocks` lands on `apps/docs`, because that is the deployed site. The viewer is
built from kai components (the B-G dogfooding ruling from the 2026-08-31 spec)
as a Solid island: `apps/docs/astro.config.mjs` already registers
`@astrojs/solid-js` and `unplugin-icons` with `compiler: 'solid'`, and
`apps/docs/src/components/` is full of `.tsx` islands, so this is the site's
existing idiom rather than a new one.

PR C retires the predecessor: `packages/ui/apps/gallery`, the `dist/gallery`
build target, and everything under `/gallery` plus the `/kit/` CORS mount in
`packages/ui/mcp/construct/dev.ts` (the route handler, the preview HTML
serializer, the store-only zip writer). That removes a page from the ui tarball,
so the pack-weight ledger narrative in
`packages/ui/scripts/verify-pack-weight.mjs` gets its row: the entry that
recorded the increase for "the gallery + blocks builder surface" is the one to
amend, with the new measurement read from the tool, not typed.

**OPEN (recommend: retire).** Whether `kai dev` keeps any blocks route at all.
Recommendation is that it does not. The public page is the shop window and the
CDN preview is the standing proof the published form works cold; a second
locally-served copy of the same thing is a second thing to keep true, and the
2026-08-31 spec's reason for keeping the dev route was live theming, which is
Part 4 work and out of this round. If the theme-studio hookup revives later it
can bring a route back with a purpose.

---

## 3. What a block is, and the authored contract

Unchanged from the 2026-08-31 spec: a complete, runnable composition of kai web
components that a person can paste into a page or `add` into a project, built on
parts, self-contained per delivery form, versioned against the kit.

What changes is the **authored source**, because the delivery axis grew from
three forms to six frameworks. The owner's rule: *we don't want to hand-code this
stuff for the final product.* The hand-written per-framework trees in the mockup
were generator TARGETS, samples of what the output should look like, never
sources. One framework-neutral source per block, every framework form generated,
nothing hand-maintained per framework.

Today's authored block is HTML plus an imperative `.js` entry script that does
all its wiring by hand (`packages/ui/blocks/support-widget/support-widget.js`:
`$('dock')`, `thread.messages = ...`, `prompt.addEventListener('kai-submit', ...)`).
That form renders to `wc`, `react` and `cdn` because those three can all take an
imperative script. It cannot render to Vue, Svelte, Angular or Solid, because
those frameworks own the DOM and want the bindings declared, not applied.

So the wiring moves out of the script and onto the markup.

### 3.1 The page: `<id>.html`

Still `kai-*` elements. Rich props and event wiring are now **declared on the
element** with a small binding syntax instead of being applied imperatively:

| Syntax | Means | Renders as |
|---|---|---|
| `.prop="name"` | bind controller field `name` to the element's JS **property** `prop` | `el.prop = ...` (wc), `prop={...}` (react), `:prop.prop` (vue), `$effect` assignment (svelte), `[prop]` (angular), `prop:prop` or a Solid component prop (solid) |
| `@kai-event="handler"` | bind controller action `handler` to a non-bubbling `kai-*` event **on that element** | `el.addEventListener('kai-...', ...)` (wc), the wrapper's derived handler prop (react), `@kai-event` (vue), `onkai-event` (svelte), `(kai-event)` (angular), `on:kai-event` (solid) |
| `:attr="name"` | bind controller field `name` to a scalar **attribute** the element reads at runtime (string, number, boolean) | `setAttribute` / `removeAttribute` on falsy for booleans (wc), the attribute-named prop in react/vue/svelte/angular/solid |
| `#ref="name"` | name an element the controller calls methods and setters on | a ref in whatever the framework calls one, holding the same element instance in every framework |

Plain `attr="literal"` stays a literal, because a scalar that never changes is an
attribute in every host. One shape per kind, and the leading punctuation is what
makes each unambiguous against a plain attribute: `.` property, `:` attribute,
`@` event, `#` ref. There is no separate boolean syntax; `:hidden="collapsed"`
covers it, and the wc renderer removes the attribute when the field is falsy.

The runtime-attribute kind exists because controllers change attributes, not just
properties: `support-widget` toggles `hidden` on the back button and changes
`view` on the view stack. Those were imperative `setAttribute` calls in the old
script and had nowhere to go on the markup.

**Element methods are the one sanctioned DOM leak into the controller.** Some of
what a block does is a call, not a binding: `stack.push('chat')`, `back()`,
setting `dock.open`. `#ref` is the mechanism, and `ControllerDeps` (section 3.2)
carries the named refs, typed against the element interfaces. This is identical
in all six frameworks because every framework hands back the same element
instance, which is the property that makes a DOM call safe to put in
framework-neutral code where a DOM *query* would not be.

The property-not-attribute contract is unchanged and still structurally
enforced: `checkBlockContracts` refuses a non-scalar prop in attribute position,
with the non-scalar list derived from `src/elements/element-nonscalar.json`. The
`.prop=` prefix is what a rich binding looks like now, and a bare `messages=`
stays an error. **`:messages=` is the same error**, and the check has to be
changed to say so: today the attribute-position regex requires whitespace
immediately before the prop name, so a `:` prefix slips past it. `:` means
attribute, and a non-scalar in attribute position is wrong however it is spelled.
Plant that exact case in `--self-test`.

### 3.2 The controller: `<id>.controller.ts`

TypeScript now, not `.js`. The framework-neutral logic, exported as:

```ts
export function createController(deps: ControllerDeps): {
  state: () => State;          // snapshot getter
  actions: Actions;            // named handlers the @-bindings point at
  subscribe(listener: () => void): () => void;
};
```

A getter plus `subscribe` is the whole store contract, chosen because it is what
every framework can adapt cheaply: React's `useSyncExternalStore` takes exactly
that pair, Vue and Solid wrap it in their own reactivity, Svelte's store contract
is one `subscribe`, Angular wraps it in a service.

It uses `@kitn.ai/ui/state`, `/wire` and `/stores` exactly as
`support-widget.js` does today (`createAssistantStream`, `createMockResponder`,
`readOpenAIStream`, `localStorageStore`, `createConversationController`,
`isConversationUnread`). No DOM access except through the refs handed in. No
hand-rolled SSE reader, still greppable, still an error.

`ControllerDeps` carries one typed ref per `#ref` name in the page, so the
methods and setters the controller calls are checked by tsc rather than reached
for by query. That is the sanctioned leak described in section 3.1 and the only
one.

### 3.3 The rest of the authored directory

`<id>.css`, `mock.ts`, `states.mjs` (the V-1 driver's state script),
`registry-item.json` (the shadcn-shaped manifest, schema unchanged) with one
difference: `files[].target` is **derived from `targets.ts`**, not typed. Today
every entry in `packages/ui/blocks/support-widget/registry-item.json` restates
its own basename as `target`, which is a hand-typed copy of a value the layout
already determines.

### 3.4 Install roots: `src/targets.ts`

ONE table, read by the generator, the CLI and the site.

| Framework | Install root |
|---|---|
| React | `src/components/<id>/` |
| Vue | `src/components/<id>/` |
| Solid | `src/components/<id>/` |
| SvelteKit | `src/lib/components/<id>/` |
| Angular | `src/app/components/<id>/` |
| HTML | `blocks/<id>/` |

**Ruling: the path the site DISPLAYS is the path `add` WRITES, byte for byte.**
A file tree on the page that does not match where the CLI puts the file is a lie
the reader finds out about after running the command.

`components/` because every project already has one. No `ui/` or `kai/`
namespace: a block is the consumer's code, not a copied primitive, and a
namespace directory implies an upstream that owns it. This changes React's root
from what `blockDir()` in `packages/create-kai/src/blocks.ts` writes today
(`src/blocks/<name>`); the html root is unchanged.

`add` keeps announcing its target and keeps refusing to overwrite (the
whole-plan collision refusal in `packages/create-kai/src/add.ts` is unchanged).

### 3.5 The renderers

One per framework, `src/forms/<framework>.ts`, all consuming the same parsed
template plus the same controller. Each emits a **project-shaped tree**: the main
component, the adapter, the controller, the mock, the css, and a README of two or
three lines saying what the block needs (an endpoint at `/api/chat`, or the mock)
plus the one framework-config line where there is one.

| Form | Emits | Bindings render as | Adapter | Notes |
|---|---|---|---|---|
| `html` | the page plus a generated binder, as `.js` | imperative: `el.prop = ...`, `el.setAttribute(...)`, `el.addEventListener('kai-...')` | none, the controller is called directly | the binder is roughly forty generated lines. This is today's `wc` form with the wiring generated instead of authored |
| `react` | `<Name>.tsx` + `use<Name>.ts` | typed wrappers from `@kitn.ai/ui/react`: `.messages` becomes `messages={...}`, `@kai-submit` becomes the wrapper's handler prop | `useSyncExternalStore` over the controller | handler names are NOT invented here, see below |
| `vue` | `<Name>.vue` (`<script setup lang="ts">`) + a composable | `:prop.prop`, `@kai-event` | composable over the controller | the README states the `compilerOptions.isCustomElement` line a Vue project needs for `kai-*` tags |
| `svelte` | `<Name>.svelte` + a store adapter | `bind:this` for refs, `$effect` for property assignment, `onkai-event` | the store contract is one `subscribe`, so the adapter is thin | |
| `angular` | `<name>.component.{ts,html,css}` + a service | `[prop]`, `(kai-event)` | an injectable service over the controller | the README states `CUSTOM_ELEMENTS_SCHEMA` |
| `solid` | `<Name>.tsx` | Solid components from `@kitn.ai/ui/solid` where one exists; `prop:` / `on:` on the custom element where one does not | Solid reactivity over the controller | see the gap below |
| `cdn` | one `<id>.html` | as `html`, inlined and pinned | none | unchanged from today's `renderCdnFormFiles` |

**The React handler names are derived, not chosen.** The wrapper generator
`packages/ui/scripts/gen-element-react.mjs` defines the rule at its `onName`
helper: drop the `kai-` prefix, PascalCase on hyphens, prefix `on`. So
`kai-submit` becomes `onSubmit` and `kai-view-change` becomes `onViewChange`.
There is no `onKai*` form; the 2026-08-31 spec's Part 3 said "`onKai*` handlers"
and that was wrong. The react renderer applies the same function, imported or
re-derived from the same rule, so a renamed event moves both sides at once.

**The controller is TypeScript, so two forms need a compile step.** `html` ships
`.js` and `cdn` inlines everything into one file, and neither context has a build
step: an author pasting the CDN form into a page and a reader dropping the html
tree next to their markup both get plain script. `gen-blocks.mjs` strips the
types with esbuild's `transform`, which costs nothing to add because the script
already depends on esbuild for its `importTs()` round trip. Framework trees keep
`.ts` and `.tsx`, because every one of those projects compiles.

The `cdn` form stays what it is: `generateCdnForm` in the registry, imports
rewritten onto the proven self-contained entries in `CDN_IMPORT_ENTRIES`, pins
stamped from `package.json` at build. The closed entry set and the root-export
refusal are untouched.

**Where the rendered trees come from.** `gen-blocks.mjs` grows one output per
block per framework, beside the artifacts it already writes: a form JSON
carrying that tree's files and their targets. The site's Code view reads those
static files, the compile cells read the same ones, and the CLI renders through
`@kitn.ai/blocks/forms` directly the way it does today. One renderer behind all
three, so "what the page shows" and "what `add` writes" cannot disagree, which is
the property `forms.ts` already claims in its header and is the reason the
per-framework trees are generator output rather than a second copy on the site.
They do NOT go inside `r/<id>.json`: that file is the CLI's integration surface
and inlining six trees into it makes every `add` download five it will not use.

### 3.6 The Solid gap

`@kitn.ai/ui/solid` (`packages/ui/src/solid.ts`, which is
`export * from './index'` plus Solid-only additions) does not have a Solid
component for every element `support-widget` uses. Verified against the source,
because the mockup's list was wrong in both directions:

| Element in `support-widget.html` | Solid surface today |
|---|---|
| `kai-dock` | `Dock` (`src/solid.ts`) |
| `kai-panel`, `kai-panel-header` | `Panel`, `PanelHeader` (`src/solid.ts`) |
| `kai-view-stack`, `kai-view` | `ViewStack`, `View` (`src/solid.ts`) |
| `kai-thread` | `Thread` |
| `kai-row` | `Row` (`src/index.ts`) |
| `kai-button` | `Button` (`src/index.ts`) |
| `kai-prompt-input` | `PromptInput` (`src/index.ts`) |
| `kai-empty` | `Empty` (`src/index.ts`) |
| `kai-conversations` | `ConversationList` (`src/index.ts`) |
| `kai-tab-bar`, `kai-tab-bar-item` | **no exported component.** `TabBar` is defined at `src/components/tab-bar.tsx` and exported from neither entry; `src/solid.ts` exports only `TabBarItemContent` and the `createTabBarItemsController` reader helpers |
| `kai-icon` | **no component.** `renderIcon` is exported from `src/solid.ts`; there is no `Icon` |

So the gap is two elements, not five, and `Row` / `Button` / `PromptInput` /
`Empty` / `ConversationList` are all already there. Re-derive the list at
implementation time rather than trusting this table: run
`packages/ui/scripts/verify-solid-coverage.mjs --json` and read it, and note that
guard grades *writable equivalence* (a `solid-coverage: equivalent` directive
counts), which is a weaker property than "there is a component with this name to
put in a generated tree".

**OPEN (recommend a).**

- **(a) The solid renderer emits the custom element with `prop:` / `on:` for any
  element that has no Solid component**, and the kit-fix backlog gets an item to
  export the missing ones. Honest, compiles, and the page never hides a
  framework from a reader.
- (b) The block's Solid form is withheld until the components exist
  (menu-honesty, the create-kai precedent).

Recommend (a). A Solid consumer can write `prop:` and `on:` on a custom element
today and it works; withholding the whole framework over two elements makes the
page tell a reader Solid is unsupported, which is false.

---

## 4. The `/blocks` page

From the approved mockup. Hero, category strip, then one card per block, stacked.

**Card header.** Title and description on ONE line.

**Toolbar.** One row, contextual on the mode.

- Left, always: a Preview | Code segmented toggle.
- Preview mode, left of centre: a bordered icon group for desktop / tablet /
  mobile, plus open-in-new-tab and refresh.
- Code mode, left of centre: a framework dropdown and a Download .zip ghost
  button. **The dropdown lists frameworks only, and only ones that are generated
  and gate-compiled**, never one the renderers do not yet emit. After PR B that
  is two rows, HTML and React. PR B2 adds Vue, Svelte, Angular and Solid, and
  only then does it match the six the component docs offer. The `cdn` form is
  not a row: it is what the preview iframe runs, and what the info affordance
  describes for the no-project case, which is also what `create-kai add` emits
  outside a project. This is the create-kai menu-honesty precedent
  (`packages/create-kai/test/menu-honesty.test.ts`): offer it and it has to work.
- Right, both modes: the add-command pill, `npx create-kai add <id>`, with copy
  and an info affordance. The info says two things: the CLI detects the
  framework from the project, and with no project it emits the single-file form.
  **No framework in the command.**

Swapping modes moves nothing. The toolbar reserves its height so the row does not
reflow between Preview and Code.

**Framework choice is global** across every card on the page and persisted in
`localStorage`, read and written inside `try`/`catch` so a private window or
blocked site data renders the default rather than throwing.

**Code mode.** File tree at left, folders shown, each path written in full from
the project root (which is the `targets.ts` path, section 3.4). File header
carries the path and a copy button. The file itself is line-numbered and
highlighted.

**Preview.** An iframe running the block's CDN form against the **published** kit
at the pinned version. `lint:cdn-pins` keeps that pin equal to
`packages/ui/package.json`, which makes the preview the standing proof that the
published block works paste-cold, and makes a stale pin a red required check
rather than a broken page.

That is production. It is also useless while writing a block, because the change
you want to see is not published yet. So the preview source is switched by env:
**`KAI_BLOCKS_KIT=local`** makes the dev server and PR-preview builds load the
kit from `packages/ui/dist`, copied into the site's `public/` tree at build the
way the retired `/kit/` mount served it. Unset, which is what the production
deploy leaves it, the iframe uses the CDN pin.

**The footer says which one it is, in words** ("previewing the local build of
`packages/ui/dist`" or "previewing @kitn.ai/ui@x.y.z from jsDelivr"), because the
whole value of the production preview is that it proves the *published* artifact
works, and a local preview that looks identical would quietly retire that proof.
A test asserts the production build carries the CDN URL and no local kit path
(section 5.6).

**The registry is static files the site serves.** `/blocks/registry.json` (the
index) and `/blocks/r/<id>.json` (the per-block item JSON with file contents).
That is the shadcn "any static host is a registry" mechanic, and it is the same
URL shape `create-kai add <url>` already resolves through `blockFromItemJson` in
`packages/create-kai/src/blocks.ts`. `buildRegistryIndex` in the registry already
hard-codes `homepage: 'https://ui.kitn.ai/blocks'`; after PR C that points at
something real. The site build copies the generated artifacts into its `public/`
tree rather than regenerating them.

**Each card's add command is derived from that card's own id.** The mockup caught
a copy-paste defect where every card printed `support-widget`. Pin it with a
test that renders more than one card and asserts the commands differ.

Not in v1: theme-studio integration, the compiled-element embed, an MCP `add`
tool.

### 4.1 The local authoring loop

Two servers, both existing, neither of them the retired gallery.

- **The block itself:** `packages/ui/scripts/block-driver/serve.mjs`, over the
  generated `html` form. It serves a root at `/` and mounts a kit build at
  `/kit/` so the page imports `/kit/elements/autoloader.js` the way a CDN page
  imports the pinned one. `PORT` defaults to `8952`, `ROOT` and `KIT` are env
  too. It is what the V-1 driver already drives, so iterating on a block and
  gating a block are the same server. Its `/kit/` mount is its own and stays;
  the one section 2.5 retires is the unrelated CORS mount in
  `packages/ui/mcp/construct/dev.ts`.
- **The card:** the docs dev server with `KAI_BLOCKS_KIT=local`, which is how you
  see the file tree, the framework dropdown and the preview against the build in
  your working tree.

---

## 5. Verification

No hand-typed counts anywhere. Name the command; read its printed axes.

**What stays.** `pnpm --filter @kitn.ai/ui run verify:blocks`
(`packages/ui/scripts/verify-blocks.mjs`) keeps all four checks per discovered
block: `contracts`, `fresh`, `pins`, `driver`, and keeps its `--self-test`,
which plants a failure per class including the browser-only baseline mismatch.
Its inputs move to the package (section 2.2); its structure does not change.

**What is new.**

1. **Compile cells: blocks x frameworks.** Every framework tree of every block
   compiles under the tsc projects
   `packages/ui/scripts/verify-scaffold-compiles.mjs` already defines, through
   the shared harness in `packages/ui/scripts/lib/consumer-tsc-projects.mjs`
   (`FRAMEWORK_PROJECT` routes angular to the `angular` project, solid to the
   `solid` project with `jsx: preserve` and `jsxImportSource`, the rest to
   `default`). The cell axis is derived: block ids from the registry scan,
   frameworks from the forms list, whose framework rows are exactly what the
   site's dropdown reads, so PR B2 moves the cell count and the dropdown together
   and neither is typed. Never a hand-written list, and note that
   `FRAMEWORKS` in that script is itself still hand-written, which the
   derive-don't-type row in `docs/coupling-map.md` §4 already records.

   **OPEN (recommend: extend the harness). This is PR B2 work**, since PR B
   emits no SFC. Those projects compile `.ts` and
   `.tsx`. `FRAMEWORK_PROJECT` maps vue and svelte to the `default` project and
   `EXT` gives both `'ts'`, because the scaffolder's vue and svelte front ends
   are plain TypeScript. A block's Vue SFC and Svelte component are not, and
   `tsc` cannot see inside either. Recommendation: compile the extractable
   TypeScript (the composable, the store adapter, the controller, the mock)
   under the `default` project in v1, and add `vue-tsc` and `svelte-check` as
   their own cells rather than pretending the `default` project covers the SFC.
   Say out loud in the gate's output which half of each vue/svelte tree was
   type-checked, so nobody reads the green as more than it is.

2. **Structural checks**, over what tsc cannot see:
   - the react tree imports kai elements only from `@kitn.ai/ui/react` (no raw
     `kai-*` tags, no second JSX typing file);
   - no tree contains a hand-rolled SSE reader (`EventSource`,
     `text/event-stream`, `.getReader(`), the same pattern
     `checkBlockContracts` already applies to authored sources;
   - every tree's emitted paths equal `targets.ts`;
   - the `html` binder and the `cdn` file carry no TypeScript (section 3.5's
     strip step ran), while the framework trees still do.

3. **Runtime parity.** In v1: the wc/cdn form through the existing block driver,
   as today. **OPEN (recommend: compile-only for the other four).** React
   additionally through the existing emit-chain machinery if it can host a block
   cheaply. Recommendation: compile-only for vue, svelte, angular and solid
   until a block actually breaks in one of them. The emitted project runs cost
   seconds per file by construction (`packages/ui/emitted-code-tests.ts` owns
   those timings), and four more framework runtimes is a real budget for a risk
   nobody has yet observed.

4. **A site test** that the path displayed on `/blocks` equals the CLI's target,
   for every block x framework. Both sides read `targets.ts`, so this is cheap
   and is the guard on the section 3.4 ruling.

5. **create-kai smoke** extends to one non-react framework fixture, so the
   detection table in `FRAMEWORK_SIGNALS` (`packages/create-kai/src/blocks.ts`)
   is exercised past the react row.

6. **The preview source switch.** A test over the production docs build asserts
   every block preview loads the jsDelivr CDN URL and no local kit path, and that
   the footer says so. It is the guard on section 4's switch: the failure it
   catches is `KAI_BLOCKS_KIT=local` leaking into a deploy, which looks perfect
   and proves nothing.

7. **The dropdown is the framework renderer list.** A test asserts the site's
   framework options equal the framework renderers that exist, `cdn` excluded
   because it is not a row, so a renderer added or withheld cannot drift from
   what the page offers. Menu honesty, same shape as
   `packages/create-kai/test/menu-honesty.test.ts`.

**Every new guard is watched failing first.** Plant the defect, watch the check
go red naming it, then fix it. A check nobody has seen fail is not evidence.

---

## 6. Non-goals

- Publishing `@kitn.ai/blocks` to npm. It is private, bundled into the CLI and
  the site, and shipping it separately buys nothing.
- Full shadcn parity. Their CLI machinery (`components.json`, alias rewriting,
  recursive source copy) exists because they copy React source that imports other
  copied React source. Custom elements are global by construction; the
  2026-08-31 spec's "what our resolution DELETES" stands.
- Per-framework hand-authored blocks. One source, generated trees, or the round
  has failed.
- New blocks. The ones already under `packages/ui/blocks/` only
  (`create-kai add --list` prints them).
- The builder and theme-studio hookup (Part 4 of the 2026-08-31 spec).
- MCP tools over blocks (Part 6 of that spec).

---

## 7. Sequencing

One PR each, owner eval between, so the plan can split cleanly. Order: **A, B, C,
D, B2.**

**PR A, the move.** `packages/blocks` created; sources, registry and forms
relocated; every consumer on specifiers; the dead `dist/agent-tooling/blocks/*`
d.ts emission removed. Gates: `npm pack --dry-run --json` for `@kitn.ai/ui`
identical name-for-name except the two deleted `.d.ts`; `verify:blocks` green;
create-kai smoke green; `nx typecheck ui --skip-nx-cache`. No behaviour change,
which is what makes the tarball diff a real gate.

**PR B, the authored contract at parity.** The binding syntax, the controller
seam, and the `html`, `react` and `cdn` renderers: the same three forms that
ship today, generated instead of hand-written. `support-widget` converted first
as the reference, then the other two. Compile cells live for those three.
**This is the expensive one**, and the reason is worth stating: it is the only PR
that changes what a block IS. The binding syntax has to be parsed, the renderers
have to agree about what a binding means, and the controller seam has to be found
by converting a real block rather than designed in the abstract. The gate is that
nothing regresses: the three forms a consumer can get today, a consumer still
gets. Budget accordingly, and expect the first conversion to change the contract
in section 3.

**PR C, the site.** `/blocks` on `apps/docs`, static registry files, the
predecessor retired. The framework dropdown has two rows, HTML and React,
because those are the framework renderers that exist (section 4).

**PR D, the CLI.** The targets table wired into `planAdd`, README printing, and
`FRAMEWORK_SIGNALS` detection rows **for the frameworks whose forms exist**.
Detecting Vue in a project and then having no Vue tree to write is the failure
menu honesty exists to prevent; B2 adds the remaining rows with the renderers
they belong to.

**PR B2, the other four renderers.** `vue`, `svelte`, `angular`, `solid`. Their
compile cells, the `vue-tsc` / `svelte-check` harness growth for SFCs, their
`FRAMEWORK_SIGNALS` rows, and the four dropdown rows they earn. Separated from
PR B because the risk in this round is the contract, not the count: four more
renderers against a proven contract is mechanical, four more renderers against
an unproven one multiplies every wrong guess by four.

**B2 may slot earlier** if the spike (section 9, item 5) says the contract is
stable. The sequence commits to B2 last, not to B2 late.

---

## 8. Couplings to register

Rows for `docs/coupling-map.md`. §10 already exists as "Blocks and the facades
that still paint their own copies" and takes most of these; the targets-table row
belongs in §4 (derived lists).

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| `targets.ts` | the path the `/blocks` file tree displays, and the path `add` writes | the page tells a reader a file lands somewhere it does not; found only after running the command | the site test in section 5.4 |
| The handler-name rule in `gen-element-react.mjs` (`onName`) | the react renderer's `@kai-event` translation | the emitted tree passes a prop no wrapper declares; caught by tsc only if the wrapper props are exact rather than indexed | the react compile cell |
| `packages/ui/package.json` version | the CDN pin in the site's preview iframe | the preview loads a version the CDN does not serve yet, or an old one; a stale pin is already a red required check | `lint:cdn-pins` (equality, not range membership) |
| A block directory added or removed | the `/blocks` category strip, the cell axes of every gate, the CLI listing | a block ships ungated, or the page shows a block the CLI cannot write | the registry scan is the one derivation; `verify:blocks` hard-fails a zero-block scan |
| `KAI_BLOCKS_KIT` (section 4) | the footer text naming the preview source, and the env block of `.github/workflows/deploy-docs.yml` | the production page previews a local kit path that is not deployed, so every iframe breaks; or worse, it works because the path happens to resolve and the page stops proving the published artifact runs, while the footer still claims it does | the section 5.6 test: the production build has the CDN URL, no local kit path, and a footer that matches |
| The forms list (which renderers exist) | the site's framework dropdown, the compile-cell axis, the `FRAMEWORK_SIGNALS` rows | the page offers a framework nothing generates, or the CLI detects one it cannot write for; found by the reader, after the download | the section 5.7 dropdown test; both sides read the forms list |
| Docs deploy vs npm publish ordering | whether the version the site's preview pins is on the CDN when the page goes live | **today: they race.** `.github/workflows/deploy-docs.yml` and `.github/workflows/release-please.yml` both trigger on `push: main` with no `needs:` between them (cross-workflow, so `needs:` cannot express it). Merging a release PR bumps `packages/ui/package.json`, so the docs build on that push pins the NEW version while the publish job is still running in the other workflow, and jsDelivr needs a moment after that. The window is small and self-healing (the next docs deploy is fine, and the pin is correct), but during it every preview iframe on `/blocks` 404s | **NOTHING.** coupling-map §1 already records the same two workflows racing for the publish gate; this is the second consequence of that race |

---

## 8a. Amendments after review (owner-agreed, 2026-09-02)

Five changes to the design above. Each one has been folded into the section it
touches; this section is the record of what moved and why.

**1. PR B splits.** PR B is the authored contract plus the `html`, `react` and
`cdn` renderers, which is parity with the three forms that ship today and no
regression. PR B2 is `vue`, `svelte`, `angular`, `solid`. The sequence becomes A,
B, C, D, B2, with B2 free to move earlier once the spike says the contract holds.
The split is about risk, not size: the unknown in this round is whether the
binding syntax and the controller seam survive contact with a real block, and
four extra renderers written against an unsettled contract is four times the
rework. The site's framework dropdown lists frameworks only, and only ones that
are generated and gate-compiled, so between B and B2 it shows two rows, HTML and
React, never six. The `cdn` form is not a dropdown row: it is the
preview iframe's source, the no-project case the info affordance describes, and
what `create-kai add` emits outside a project. That is the create-kai
menu-honesty rule applied to a page instead of a prompt.
(Sections 4, 5, 7.)

**2. Two more binding kinds.** The `.prop` / `@event` / `#ref` set was short by
one and vague about another.

- **`:attr="name"`**, a bound scalar attribute, for attributes the controller
  changes at runtime. `support-widget` toggles `hidden` on the back button and
  changes `view` on the view stack, and neither had a home on the markup. One
  shape per kind: `:` is always a bound attribute, `.` is always a bound
  property, plain `attr="literal"` is always a literal. Rejected: a separate
  `?attr` for booleans, because two spellings for one kind is how a syntax
  starts collecting exceptions. Booleans render as `setAttribute` with
  `removeAttribute` on falsy.
- **Element methods over `#ref`.** Blocks call things (`stack.push('chat')`,
  `back()`, setting `dock.open`), and calls are not bindings. `#ref` is the
  mechanism and `ControllerDeps` carries the typed refs. State it as **the one
  sanctioned DOM leak into the controller**: sanctioned because it is identical
  in every framework, since every framework hands back the same element instance.
  A DOM *query* has no such guarantee and stays banned.

`checkBlockContracts` needs a matching change: `:messages=` is a non-scalar in
attribute position exactly as `messages=` is, and today's regex requires
whitespace before the prop name, so the prefixed form walks past it. Plant that
case in `--self-test`. (Sections 3.1, 3.2.)

**3. The preview has a source switch.** Production keeps the CDN pin, unchanged,
for the reason it was chosen: it is the standing proof that the published block
runs paste-cold. Dev and PR-preview builds set `KAI_BLOCKS_KIT=local` and load
the kit from `packages/ui/dist` copied into the site's `public/` tree, which is
what the retired `/kit/` mount did. Without this you cannot see an unpublished
block on its own card, which is most of a block's life. The footer states the
mode in words, and a test asserts the production build has the CDN URL and no
local path, because the two modes look identical and only one of them proves
anything. (Section 4, coupling rows in section 8, guard 5.6.)

**4. The local authoring loop is named.** Block authors iterate with
`packages/ui/scripts/block-driver/serve.mjs` (`PORT` default `8952`) over the
generated `html` form, and see the card through the docs dev server in local
mode. Both already exist; neither is the retired gallery, which is worth saying
out loud in a document that retires it. (Section 4.1.)

**5. The CDN and html forms get a compile step.** The controller is TypeScript
and those two forms land in contexts with no build: a pasted single file, and a
tree dropped next to markup. `gen-blocks.mjs` strips the types with esbuild's
`transform`, already a dependency of the script through its `importTs()` round
trip. The html form ships `.js`; framework trees ship `.ts` and `.tsx`, because
those projects compile. (Section 3.5.)

---

## 9. Owner rulings, 2026-09-02

- **Blocks, not gallery.** Every new name, route, script and doc. `/blocks` is a
  section of ui.kitn.ai; the `kai dev` gallery and `packages/ui/apps/gallery` are
  the predecessor and are retired.
- **`packages/blocks`, private, depending on nothing.** Imported as code, so it
  is a package. Injection keeps the direction one-way.
- **One source, all trees generated.** The hand-written framework trees in the
  mockup were generator targets. Nothing per-framework is hand-maintained.
- **Typed React wrappers.** The react form uses `@kitn.ai/ui/react`, and its
  handler names come from the wrapper generator's own rule.
- **shadcn is a layout template, not a parity target.** Take the page grammar and
  the registry-item vocabulary; do not take the CLI machinery that exists for a
  problem we do not have.
- **Zip only because it is already there.** The store-only zip writer exists; the
  Download button rides it. It is not a feature worth building.
- **`components/<id>` roots**, and the displayed path equals the written path.
- **Sticky global framework choice**, persisted per viewer.

### Open items, with recommendations

| # | Question | Recommendation |
|---|---|---|
| 1 | Does `kai dev` keep any blocks route? | Retire it. The public page plus the CDN preview covers the ground; a second local copy is a second thing to keep true, and its stated purpose (live theming) is out of this round. |
| 2 | The Solid gap: `kai-tab-bar`/`kai-tab-bar-item` and `kai-icon` have no exported Solid component. | (a) Emit the custom element with `prop:` / `on:` where no component exists, and file the kit-fix. Honest, compiles, and the page never hides a framework. |
| 3 | Vue and Svelte SFCs are outside what the existing tsc projects can check. | Compile the extractable TypeScript under the `default` project in v1 and add `vue-tsc` / `svelte-check` as their own cells. Say in the gate output which half was checked. |
| 4 | Runtime parity beyond the wc/cdn driver. | Compile-only for vue, svelte, angular and solid until a block breaks in one. React through the existing emit-chain machinery if it hosts a block cheaply. |
| 5 | Is the section 3 contract right? | Spike it: convert `support-widget` by hand and hand-render it to React and Vue in throwaway apps. **Runs in parallel with PR A**, which touches none of the same files. Its findings amend section 3 before the PR B plan is written, so the binding syntax is settled by a real conversion rather than by the first renderer that has to implement it. It is also what tells us whether B2 can move earlier. |
