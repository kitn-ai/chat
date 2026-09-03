# PR C: the `/blocks` site section on `apps/docs` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/blocks` on the deployed docs site -- a hero, a category strip and one card per block, each card previewing the published CDN form in an iframe and showing the exact file tree `create-kai add` writes -- and retire the `packages/ui/apps/gallery` predecessor it replaces.

**Architecture:** The generated artifacts already exist (`packages/ui/dist/blocks/{registry.json, r/<id>.json, r/<id>.cdn.html, f/<id>.<form>.json}`, written by `packages/ui/scripts/gen-blocks.mjs`). `apps/docs` COPIES them into `public/` in a prebuild step and never regenerates them. The viewer is one Solid island built from the kit's own `kai-*` custom elements (`kai-segmented`, `kai-select`, `kai-file-tree`, `kai-code-block`, `kai-button`), loaded through the docs site's existing `loadKit()` helper. The framework dropdown is `FRAMEWORK_BLOCK_FORMS` from `@kitn.ai/blocks/forms`, read not restated, so PR B2's four renderers appear in it without anyone editing a list. The preview iframe's source is decided ONCE, in the copy script, from `KAI_BLOCKS_KIT`, and written into a generated module the island imports.

**Tech Stack:** Astro 6 + Starlight (`apps/docs`) with `@astrojs/solid-js` already registered · SolidJS islands (`client:only="solid"`) · the `kai-*` element bundle via `apps/docs/src/components/example/kit.ts` · `@kitn.ai/blocks` (a `.ts`-exports workspace package) for the form axis and the install-root table · vitest + jsdom + `@solidjs/testing-library` for the new `apps/docs` suite · Playwright for the visual pass.

**Spec:** `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md`, sections 2.5, 4, 4.1, 5.4, 5.6, 5.7, 8 (coupling rows), 9 (owner rulings). Operating order: `docs/superpowers/HANDOFF-2026-09-02-night-run.md` sections 3.2 and 4 -- **every bullet in 3.2 is a requirement, not a suggestion**. Predecessors whose house rules this plan copies: `docs/superpowers/plans/2026-09-02-blocks-package-move.md` (PR A) and `docs/superpowers/plans/2026-09-02-blocks-pr-b-authored-contract.md` (PR B, whose output this plan consumes).

---

## Scope: PR C, and nothing else

IN scope:

- `/blocks` on `apps/docs`: the page, the topic entry, the full-width CSS marker, the Solid island, the card.
- The prebuild copy of `packages/ui/dist/blocks` into `apps/docs/public/`, with a loud failure when it is missing.
- The `KAI_BLOCKS_KIT=local` preview-source switch, the footer that names the source in words, and the guard that the production build carries the CDN pin and no local kit path.
- The framework dropdown derived from `FRAMEWORK_BLOCK_FORMS`, and its derivation test.
- The per-card add command derived from the card's own id, and its multi-card test.
- The sticky global framework choice in `localStorage`, read and written inside `try`/`catch`.
- The Download `.zip` button, riding the store-only zip writer moved out of the retired gallery route.
- Retiring the predecessor: `packages/ui/apps/gallery`, `KAI_BUILD=gallery`, `dist/gallery`, the `/gallery` routes and the `/kit/` CORS mount in `packages/ui/mcp/construct/dev.ts`, the gallery story and tests, the coupling-map rows, and the pack-weight ledger row (amended with a MEASURED number).
- The new CI steps that make the site build and its tests part of the required graph.

OUT of scope, do not start any of it:

- **The `vue`, `svelte`, `angular` and `solid` renderers, their compile cells, `vue-tsc` and `svelte-check`. That is PR B2.** The dropdown must GROW on its own when B2 lands; a task that hardcodes two rows has failed this plan.
- **`create-kai`: `blockDir()`, `FRAMEWORK_SIGNALS`, README printing, `planAdd` reading `targets.ts`. That is PR D.** The `packages/create-kai/test/pr-d-target-mismatch.test.ts` PR B left behind stays RED-by-design-assertion here; do not delete it, do not "fix" the mismatch it pins.
- **Any new block.** The blocks under `packages/blocks/blocks/` only.
- The theme-studio hookup, the compiled-element embed, an MCP `add` tool (spec 4, "Not in v1").
- Moving `packages/ui/apps/{builder,theme-studio}` to the root `apps/`. That is the pages move, the queue item after PR D and B2.

---

## Global Constraints

- Branch: `feat/blocks-site-section`, cut from `origin/main` AFTER PR B is squash-merged. **The controller prepares the worktree and passes its absolute path at dispatch.** Every command in this plan runs inside it. Export it once per shell:

```bash
export WT=/Users/home/Projects/kitn-ai/kitn-chat/.claude/worktrees/blocks-c
export SCRATCH="<the scratchpad path passed at dispatch>"   # screenshots land under "$SCRATCH/pr-c/"
```

  Never `git checkout` in someone else's working checkout; if another agent owns a tree, stop and say so.
- **A fresh worktree needs THREE things before any suite means anything, and skipping one produces a failure that reads like a broken checkout:** (1) `pnpm install` -- a worktree under `.claude/worktrees/` resolves up into the parent checkout's `node_modules` while Vite refuses to serve paths outside the worktree root, and the suite dies on one identical `Cannot find module '/@fs/<parent>/node_modules/@testing-library/jest-dom/dist/vitest.mjs'`; (2) `pnpm --filter @kitn.ai/ui run build:css` for the gitignored `packages/ui/src/elements/compiled.css`; (3) a real build, for `dist/custom-elements.json` and **`dist/blocks/`, which this entire PR reads**. `npm run` puts the ancestor `.bin` on PATH, so `build:css` can print success while the suite still fails identically.
- When a cold build is needed run `cd "$WT/packages/ui" && npm run build`, **never** `nx build ui`: the NX cache can restore a build target whose generators write into the SOURCE tree, printing success while changing nothing. A cached build looks exactly like a successful one.
- **Never pipe a heavy suite or a build through `tail` inside an `&&` chain** -- the exit status becomes the pipe's and a failure reads as a pass. Run each gate as its own command.
- Scratchpad paths are for scratch only. **A scratchpad path must never appear in a committed file**; Task 10 greps for that.
- macOS `sed` needs the empty backup argument: `sed -i '' -E`.
- **No em dashes and no emoji** in any prose this branch adds to the tree, comments included. `apps/docs/STYLE.md` is the voice: sharp human engineer, terse, web-components-first, no boilerplate.
- **Every new test and every new guard is watched FAILING first.** Each task states the exact expected red. A check nobody has seen fail is not evidence.
- **No hand-typed counts, sizes, versions or lists.** Name the command that prints the number. This applies hardest to the pack-weight ledger in Task 8 and to the dropdown in Task 4.
- `docs/superpowers/**` is scanned by `node packages/ui/scripts/lint-gate-parity.mjs` and `node packages/ui/scripts/lint-threshold-derivation.mjs`. A fenced block or table under that tree that looks like a merge-gate enumeration needs `<!-- gate-list: partial -- <reason> -->` above it. This plan carries those directives; keep them if you edit it.
- **The required gate is a graph, not a list.** Read it with `node packages/ui/scripts/lint-gate-parity.mjs --list`; never copy a list from a handoff. Steps added to `.github/workflows/test.yml` must use a shape the parity guard recognises (`pnpm --filter <pkg> run <script>` is recognised; an unknown `run:` shape is a hard failure naming the step).
- Every commit ends with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

## Rulings this plan makes

Each ruling is here because an implementer would otherwise have to guess, and because the reason is not recoverable from the spec text.

**R1. The viewer is built from the kit's `kai-*` CUSTOM ELEMENTS, not from its Solid component exports.**

Spec 2.5 says "built from kai components", and the retired `GalleryPage.tsx` read that as importing Solid values (`WorkSurface`, `FileTree`, `CodeBlock`, `Button`, `cn`) by relative path from `../../src/`. On `apps/docs` that reading is wrong three ways, each measured on the tree:

- **No docs island imports a Solid component value from `@kitn.ai/ui` today.** `grep -n "from '@kitn.ai/ui'" apps/docs/src/components/*.tsx` returns only `import type { ChatMessage }`. Every runtime island goes through `loadKit()` in `apps/docs/src/components/example/kit.ts` and drives `kai-*` elements. Introducing a second idiom to the site in this PR is scope nobody asked for.
- **The kit's Solid components are Tailwind-utility-styled light-DOM components.** Their classes reach the browser only if the consuming Tailwind build scans their source. `apps/docs/src/styles/app.css` carries exactly one `@source` line, for the theme-studio app. The elements carry `compiled.css` inside their shadow roots and need nothing from the docs Tailwind build.
- **The elements exist for everything the card needs.** `kai-segmented` (Preview|Code, viewport group), `kai-select` (framework dropdown), `kai-file-tree` (`files` with `code`/`language`, `activeFile`, fires `kai-select`), `kai-code-block` (`code`, `language`, `copy`), `kai-button` (`icon`, `variant`, fires `kai-click`). Verified against `packages/ui/src/elements/element-meta.json`; the commands are in "Facts verified on the tree".

There is no `kai-work-surface` element, and the card does not need one: spec 4's toolbar is contextual and bespoke, and the preview is a plain iframe.

**What this supersedes, said out loud.** The 2026-08-31 B-G ruling named `WorkSurface` / `FileTree` / `CodeBlock`, and then ruled IN THE SAME SECTION that "the docs site composes via web components, and whichever of them lacks a `kai-*` facade gets one in the gallery round". The elements are therefore the sanctioned form of "kai components" on this site, and R1 follows that clause rather than contradicting it. The half that IS superseded is the expectation that a missing facade gets BUILT: spec 4, written later off the mockup, describes bespoke card chrome instead of a `WorkSurface` embed, so no `kai-work-surface` facade is built here. Spec 4 is the later document and it wins. Retiring the gallery story also closes the PR B addendum's ticket on that story's CDN snippet pane; say so in the PR body.

**R2. The preview source is decided ONCE, in the copy script, and travels to the island through a GENERATED module -- not through `import.meta.env`.**

Astro exposes only `PUBLIC_`-prefixed env vars to client code. `KAI_BLOCKS_KIT` is the name the handoff and spec fix, and renaming it to `PUBLIC_KAI_BLOCKS_KIT` would put a switch that must never be on in production into the surface most likely to be set by accident. So `apps/docs/scripts/copy-blocks.mjs` reads `process.env.KAI_BLOCKS_KIT`, performs the copy that mode implies, and writes `apps/docs/src/generated/blocks-preview.ts` (gitignored, regenerated on every `predev`/`prebuild`). The island imports it.

That buys three things: the env-to-decision function is PURE and testable with no build; the footer text has one definition; and the production guard is a grep over built output rather than a second full build.

**R3. Local mode rewrites the emitted CDN form's import base by string replacement, and a ZERO-replacement run is a hard failure.**

The alternative is re-rendering the CDN form in the docs prebuild with `base: '/blocks/kit/'`, which means a `.mjs` node script importing `@kitn.ai/blocks`'s `.ts` exports and reconstructing a `Block` from item JSON. That is a second renderer path for a dev convenience.

Instead the script reads `dist/blocks/r/<id>.cdn.html` and replaces `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@<version>/dist/` with `/blocks/kit/`, writing `public/blocks/local/<id>.html`. **The regex is the coupling, so it announces itself:** a run that replaces nothing exits non-zero naming the file and the pattern, exactly the way `lint:cdn-pins` treats a zero-match scan as a hard failure. If `rewriteBlockScript`'s base formula ever changes, local mode goes red on the next `astro dev` instead of silently previewing the published kit while the footer says otherwise.

Local mode also copies the whole of `packages/ui/dist` to `apps/docs/public/blocks/kit`. That is roughly the size `du -sh packages/ui/dist` prints, it is gitignored, and it exists only when `KAI_BLOCKS_KIT=local`. A narrower copy would have to know which chunks the autoloader pulls, which is exactly the kind of hand-maintained list this repo keeps deleting.

**R4. The dropdown equals `FRAMEWORK_BLOCK_FORMS` exactly. A block missing a form JSON is a LOUD failure, not a hidden row.**

`packages/blocks/src/forms/index.ts` already exports `FRAMEWORK_BLOCK_FORMS` (`BLOCK_FORMS` minus `cdn`), and `gen-blocks.mjs` iterates that same export to emit `dist/blocks/f/<id>.<form>.json`, hard-failing on any block that cannot render a form. So every discovered block has every framework form, by construction.

The retired gallery filtered its selector by which forms were present (`formsAvailable`). Carrying that forward would mean a copy failure silently narrows the menu -- a quiet decision on the one axis this round exists to keep honest. Here: the dropdown is the derivation, and a card whose form JSON does not load renders an error naming the missing path. Decide loudly.

**R5. The store-only zip writer MOVES from `packages/ui/mcp/construct/dev.ts` into `apps/docs`, ported to `Uint8Array`.**

Spec 2.5 retires the zip route with the rest of the gallery. Its writer is a pure function with one remaining consumer, so this is a move, not a delete-and-rewrite. It cannot go to `packages/blocks`: that package's `tsconfig.json` sets `"types": []` and `"lib": ["ES2023"]` with no DOM, deliberately and with the reason written in the file, so `TextEncoder` has no type there. `apps/docs/tsconfig.json` extends `astro/tsconfigs/strict`, which has DOM. It lands at `apps/docs/src/components/blocks/zip.ts`, ported from `Buffer` to `Uint8Array`/`DataView`, keeping the deterministic 1980-01-01 stamps so the same files always produce the same bytes.

**R6. `/blocks` is a `template: splash` page with a `.blocks-page` marker, and a topic entry in `src/topics.mjs`.**

The site has exactly two precedents for a full-width page and this takes the second: `.kai-fullscreen` (theme editor: header only, page never scrolls, chrome gone) and `.landing-page` (full-bleed sections, header and footer stay, page scrolls). A blocks index is a scrolling page of stacked cards, so it is the landing-page shape. `template: splash` is what removes the sidebar, and `Header.astro` already gates its mobile disclosure on `hasSidebar`, so a splash page gets the mobile topics menu for free (that is what #367 fixed).

**The marker is SERVER-rendered, in the MDX, not inside the island.** Both precedents say so in `app.css` at their own definitions, and the reason is first paint: `:root:has(.blocks-page)` has to match before hydration or the page paints as a normal splash content column and then jumps to full width when the island mounts. `client:only="solid"` renders nothing on the server, so a marker on the island's root would do exactly that. `blocks.mdx` wraps the island in `<div class="blocks-page not-content">`.

The topic entry is what makes `/blocks` a SECTION rather than an orphan page: `src/topics.mjs` is read by BOTH `astro.config.mjs` (sidebars) and `Header.astro` (the nav), and the file's own header says a link added there shows up in both. Owner ruling, night-run section 4: "call it blocks not gallery; `/blocks` = site section."

**R7. The island is split into a data shell and a pure view, and the tests drive the view.**

`BlocksIsland.tsx` fetches `registry.json` and the `f/` JSONs and is what the MDX mounts. `BlocksPage.tsx` takes `items` and an injected `loadForm` and renders. Without that seam the multi-card add-command test (requirement 5) and the displayed-path test (spec 5.4) would each need a network mock, and a test that mocks the thing it is checking is the failure mode this repo names most often.

**R8. `apps/docs` gets its own vitest project and a SCOPED tsc pass, not `astro check`.**

There is no test runner in `apps/docs` today and no typecheck script. `astro check` over the whole site is a new gate of unknown colour on ~150 existing pages, which is not this PR's business. So: `apps/docs/vitest.config.ts` covering `test/**`, and `apps/docs/tsconfig.blocks.json` covering only the files this PR adds, run as `typecheck:blocks`. Vitest transpiles without checking types, so without the second one the island's types ship unchecked.

**R9. The `preserveSymlinks` fragility: this plan relies on `packages/ui/mcp/tests/blocks-artifacts.test.ts`, and it REPLACES both bundler witnesses.**

PR A proved four toolchains resolve `@kitn.ai/blocks`'s `.ts` exports (`docs/superpowers/plans/2026-09-02-blocks-package-move.md`, Task 4 Step 10's table). Two of the four are vitest dev-server semantics and two are bundlers. **PR C deletes one of each:** the gallery's vite `page` build and `GalleryPage.stories.tsx` under Storybook's builder both go with the gallery.

- **The witness this plan relies on** is `packages/ui/mcp/tests/blocks-artifacts.test.ts`, in the ui `unit` vitest project, run in CI's `unit` leg. It is the same class as the new `apps/docs` suite: a vitest dev server must SERVE a dependency whose realpath is outside the consuming project's root. If the new suite fails to resolve `@kitn.ai/blocks/forms`, the fallback its row names is `test.server.deps.inline: ['@kitn.ai/blocks']` in `apps/docs/vitest.config.ts`. (The second vitest witness, `packages/create-kai/test/add.test.ts`, stays too, and is the same class again.)
- **The bundler witness is REPLACED, not lost.** After this PR the only bundler resolving `@kitn.ai/blocks` is Astro's Vite build of `/blocks`, and Task 9 puts that build in the required graph, where the gallery's page build already was. Its fallback is `vite.optimizeDeps.exclude: ['@kitn.ai/blocks']` in `apps/docs/astro.config.mjs`.
- **If any fallback is needed, apply it and RECORD which in the PR body**, the way PR A's Step 10 asks. The answer is worth more than the fix.

**R10. `kai dev` keeps no blocks route at all.**

Spec 2.5 leaves this OPEN with a recommendation and the night run says to take it. Taken. The public page is the shop window and the CDN preview is the standing proof the published form runs cold; a second locally-served copy is a second thing to keep true, and the route's stated reason (live theming) is Part 4 work. The block driver's own `/kit/` mount at `packages/ui/scripts/block-driver/serve.mjs` is a DIFFERENT mount and STAYS -- it is what `verify:blocks [driver]` drives.

**R11. The preview iframe carries `sandbox="allow-scripts allow-same-origin"`.**

The threat model first: these are our own generated files, built from authored block sources running a scripted local mock, served from our own origin. Nothing in them is model output, so neither SECURITY.md's scope nor CLAUDE.md's "everything the model produced is untrusted input" rule bites here. The retired gallery served its previews unsandboxed for the same reason, and no-sandbox would be defensible.

**The two tokens are still worth it, and the reason the first draft of this ruling gave for skipping them was wrong.** `allow-scripts allow-same-origin` does not "grant back everything it took": the sandbox still withholds top-level navigation, popups, form submission, modal dialogs and downloads. That is a real, free reduction for a page that embeds one iframe per block, and it costs the blocks nothing, because what they need is scripts and `localStorage` and those are exactly the two tokens granted. So: sandbox, with those two tokens and no others.

**What this supersedes.** The 2026-08-31 B-G ruling said the gallery preview would be "one sandboxed iframe, one `isSafeUrl` policy" via the kit's `Artifact` component. R1 already replaces the `Artifact` embed with a plain iframe in bespoke card chrome (spec 4), so the `isSafeUrl` half has no sink to sit on: the only URL the card builds is `previewUrl(id)`, a site-absolute path this code composes from a registry id, never a URL from anywhere else. The sandbox half survives, spelled directly on the iframe.

**One coupling to record rather than fix.** Each block persists its conversations to `localStorage` on whatever origin it runs, so on `ui.kitn.ai` the three block previews share a storage origin with the docs site's own keys (including `kai-blocks-framework` from R3's sticky choice) and with the theme editor. Distinct key names today, not a vulnerability, and `allow-same-origin` is what lets the blocks work at all. It is a sentence in the PR body, not a change.

**R12. Category strip filters; it does not navigate.**

`registry.json` items carry `categories`. The strip is `['all', ...every category seen]`, derived, and selecting one filters the stacked cards in place. No per-category route, no deep link in v1. Spec 4 says "Hero, category strip, then one card per block, stacked" and nothing about routing.

### Dispositions from the adversarial review

The plan was reviewed against the tree at `64d2e652` before any task ran. **No finding was declined.** Four of them offered a choice rather than a fix, and these are the choices taken, with the reason, so a reader does not have to reconstruct them from the diff:

- **The preview iframe is sandboxed** (`allow-scripts allow-same-origin`), where the first draft had none. The review showed the "it grants back everything it took" reasoning was false, and the two tokens are free for a page that embeds one iframe per block. R11 carries the corrected text.
- **The `sr-only` duplicate mode buttons are DELETED**, not fixed. They doubled the mode control for screen-reader users, the audience they claimed to serve, and the alternative the review preferred is better anyway: the tests and the screenshot script both drive `kai-segmented` by dispatching its own non-bubbling `kai-change` on the element, which is what a viewer's click does.
- **Line numbers are deferred as a named kit ticket**, not faked. `kai-code-block` has no line-number prop and a CSS-counter gutter drawn outside a shadow root it cannot measure would look wrong at every font size. Task 5 states the deviation and the PR body repeats it.
- **`verify-preview-source`'s prose marker is SCOPED** to chunks carrying the footer's own wording, rather than scanning every built page for the literal `packages/ui/dist`. The unscoped version is clean today and would turn a future guide sentence into a red gate with a misleading message. The two PATH markers stay global, because neither has an innocent reason to appear in a deployed page.

---

## File structure

| File | Created / Modified | Responsibility |
|---|---|---|
| `apps/docs/scripts/copy-blocks.mjs` | Create | Reads `KAI_BLOCKS_KIT`; copies `packages/ui/dist/blocks` into `public/blocks`; in local mode copies the kit and rewrites each CDN form's import base; writes the generated preview module. Exports `previewSource` and `rewriteKitBase` as pure functions for the tests. Hard-fails when `dist/blocks` is missing. |
| `apps/docs/src/generated/blocks-preview.ts` | Generated, gitignored | `{ mode, previewDir, footer }` -- the one statement of which kit the previews run. |
| `apps/docs/src/lib/blocks-source.ts` | Create | `frameworkOptions()` (from `FRAMEWORK_BLOCK_FORMS`), `addCommandFor(id)`, `registryUrl()` / `formUrl(id, form)`, `readFramework()` / `writeFramework()` (localStorage in try/catch), `languageFor(path)`. Pure, no DOM beyond `localStorage`. |
| `apps/docs/src/components/blocks/zip.ts` | Create (moved) | The store-only zip writer, `Uint8Array` port of `packages/ui/mcp/construct/dev.ts`'s. |
| `apps/docs/src/components/blocks/BlocksPage.tsx` | Create | The pure view: hero, category strip, stacked `BlockCard`s. Takes `items` and `loadForm`. |
| `apps/docs/src/components/blocks/BlockCard.tsx` | Create | One card: header line, contextual toolbar, preview iframe, code view (file tree + code block), add-command pill. |
| `apps/docs/src/components/blocks/BlocksIsland.tsx` | Create | The data shell: `loadKit()`, fetch the registry, fetch form JSON on demand, render `BlocksPage`. What the MDX mounts. |
| `apps/docs/src/content/docs/blocks.mdx` | Create | The page: `template: splash`, the `.blocks-page` marker, `<BlocksIsland client:only="solid" />`. |
| `apps/docs/src/topics.mjs` | Modify | Adds the `Blocks` topic, so the header nav and the mobile menu both carry it. |
| `apps/docs/src/styles/app.css` | Modify | `.blocks-page` full-width rules, on the `.landing-page` pattern. |
| `apps/docs/scripts/verify-preview-source.mjs` | Create | Over `apps/docs/dist`: every preview carries the jsDelivr pin equal to `packages/ui/package.json`, no local kit path anywhere, footer matches. `--self-test` plants the local form and watches it go red. |
| `apps/docs/vitest.config.ts` | Create | The `apps/docs` suite (jsdom, `vite-plugin-solid`). |
| `apps/docs/tsconfig.blocks.json` | Create | Scoped `tsc --noEmit` over the files this PR adds. |
| `apps/docs/package.json` | Modify | `prebuild`/`predev` chain the new copy; `test`, `typecheck:blocks`, `verify:preview` scripts; `@kitn.ai/blocks` and the test devDependencies. |
| `apps/docs/.gitignore` | Modify | `public/blocks/`, `src/generated/`. |
| `apps/docs/test/*.test.ts(x)` | Create | The four suites: preview source, the axis and the command, the page render, the target-path equality. |
| `packages/ui/apps/gallery/**` | **Delete** | The predecessor. |
| `packages/ui/package.json` | Modify | Drop `KAI_BUILD=gallery` from `build`. |
| `packages/ui/config/vite/page.ts` | Modify | Drop the `gallery` page entry. |
| `packages/ui/mcp/construct/dev.ts` | Modify | Delete `galleryPageDir`, `galleryPreviewHtml`, `crc32`, `storeZip`, `GalleryDirs`, `GalleryResponse`, `handleGalleryRequest`, the `/kit/` CORS mount, the cached dirs and the startup log line. |
| `packages/ui/mcp/construct/dev.test.ts` | Modify | Delete the gallery route table, `storeZip` and preview-serializer describes. |
| `packages/ui/scripts/verify-pack-weight.mjs` | Modify | Amend the `10.60 -> 11.85 MiB` ledger row and lower `MAX_UNPACKED_BYTES` to a MEASURED value. |
| `packages/ui/tsconfig.apps.json` | Modify | Its comment names three apps; two remain. |
| `packages/ui/scripts/lint-catalog-drift.mjs`, `packages/ui/scripts/story-roots.mjs` | Modify | Comments citing `apps/gallery/GalleryPage.stories.tsx` as the example. |
| `docs/coupling-map.md` | Modify | Delete the gallery rows in the module graph; add the five PR C rows from spec section 8. |
| `.github/workflows/test.yml` | Modify | Four steps in the `dist-guards` leg: the docs suite, the scoped typecheck, the site build, the preview-source guard. |

---

## Task 1: Baseline

**Files:** none. This task commits nothing.

**Interfaces:**
- Produces: recorded artifacts under `$SCRATCH/pr-c/baseline/`, referenced by Task 8's ledger amendment and Task 10's PR body.

- [ ] **Step 1: Confirm the worktree is real and built**

```bash
cd "$WT" && git branch --show-current
test -d node_modules && echo "install: ok"
test -f packages/ui/src/elements/compiled.css && echo "build:css: ok"
test -f packages/ui/dist/custom-elements.json && echo "build: ok"
ls packages/ui/dist/blocks/registry.json packages/ui/dist/blocks/r packages/ui/dist/blocks/f
```

Expected: branch `feat/blocks-site-section`, three `ok` lines, and the blocks artifacts listed. **A missing one is a missing setup step, not a broken checkout.** Run `pnpm install`, then `pnpm --filter @kitn.ai/ui run build:css`, then `cd "$WT/packages/ui" && npm run build`, in that order.

- [ ] **Step 2: Record what the gallery does today, so the retirement can be judged**

```bash
mkdir -p "$SCRATCH/pr-c/baseline"
cd "$WT" && ls packages/ui/dist/gallery > "$SCRATCH/pr-c/baseline/dist-gallery.txt"
cd "$WT" && du -sh packages/ui/dist/gallery >> "$SCRATCH/pr-c/baseline/dist-gallery.txt"
cd "$WT/packages/ui" && npm run verify:pack 2>&1 | tee "$SCRATCH/pr-c/baseline/verify-pack.txt"
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs --list > "$SCRATCH/pr-c/baseline/gate-set.txt"
```

Expected: `verify:pack` prints one `pack weight` line carrying the measured file count and unpacked MiB. **That number is the BEFORE half of Task 8's ledger entry.** Do not type it anywhere; the file is the record.

- [ ] **Step 3: Record that the docs site builds green today**

```bash
cd "$WT" && pnpm --filter @kitn.ai/docs run build 2>&1 | tee "$SCRATCH/pr-c/baseline/docs-build.txt"
```

Expected: exit 0. If it is already red, STOP and report: this PR adds that build to the required gate and cannot distinguish its own breakage from a pre-existing one.

- [ ] **Step 4: Report, commit nothing**

Name the four files under `$SCRATCH/pr-c/baseline/` in the handoff.

---

## Task 2: The prebuild copy and the preview-source switch

**Files:**
- Create: `apps/docs/scripts/copy-blocks.mjs`
- Create: `apps/docs/vitest.config.ts`
- Create: `apps/docs/test/preview-source.test.ts`
- Modify: `apps/docs/package.json`
- Modify: `apps/docs/.gitignore`

**Interfaces:**
- Consumes: `packages/ui/dist/blocks/**` (written by `packages/ui/scripts/gen-blocks.mjs`), `packages/ui/package.json`'s `version`.
- Produces: `apps/docs/public/blocks/**`, `apps/docs/src/generated/blocks-preview.ts` exporting `BLOCKS_PREVIEW: { mode: 'cdn' | 'local'; previewDir: string; footer: string }`; and from the script module, the pure exports `previewSource(env, version)` and `rewriteKitBase(html, localBase)`.

- [ ] **Step 1: Add the test harness and the dependencies**

`apps/docs/vitest.config.ts`:

```ts
// The apps/docs suite. jsdom because the /blocks island renders Solid into a
// document; vite-plugin-solid because the island is .tsx compiled for Solid,
// the same compiler @astrojs/solid-js uses at build time.
//
// `@kitn.ai/blocks` exports .ts and pnpm symlinks it, so its realpath is
// OUTSIDE this project's root. That resolves with no help today (PR A proved
// it across four toolchains). If it ever stops, the fallback is
// `test.server.deps.inline: ['@kitn.ai/blocks']` here, and the standing
// witness for this class is packages/ui/mcp/tests/blocks-artifacts.test.ts.
import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
```

In `apps/docs/package.json`, add `"@kitn.ai/blocks": "workspace:*"` plus four test devDependencies: `@solidjs/testing-library`, `jsdom`, `vite-plugin-solid`, `vitest`.

**Do not type a version range. Read each one off the lockfile**, so the store gains no second copy of anything the workspace already resolves:

```bash
cd "$WT" && grep -nE "^  '?(@solidjs/testing-library|jsdom|vite-plugin-solid|vitest)@" pnpm-lock.yaml
```

Lockfile keys are quoted for scoped packages (`'@solidjs/testing-library@x.y.z':`), which is why the pattern allows the optional quote. Use the caret range of each version it prints. Then `pnpm install`.

Add to `scripts`: `"test": "vitest run"`, and **`"pretest": "node scripts/copy-blocks.mjs"`** -- see Step 6 for why that hook is not optional.

- [ ] **Step 2: Write the failing test**

`apps/docs/test/preview-source.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { previewSource, rewriteKitBase, LOCAL_KIT_BASE } from '../scripts/copy-blocks.mjs';

const VERSION = '9.9.9';

describe('previewSource', () => {
  it('is the CDN pin when KAI_BLOCKS_KIT is unset -- production', () => {
    const out = previewSource({}, VERSION);
    expect(out.mode).toBe('cdn');
    expect(out.previewDir).toBe('/blocks/r');
    expect(out.footer).toContain(`@kitn.ai/ui@${VERSION}`);
    expect(out.footer).toContain('jsDelivr');
    expect(out.footer).not.toContain('packages/ui/dist');
  });

  it('is the local build when KAI_BLOCKS_KIT=local, and SAYS SO in words', () => {
    const out = previewSource({ KAI_BLOCKS_KIT: 'local' }, VERSION);
    expect(out.mode).toBe('local');
    expect(out.previewDir).toBe('/blocks/local');
    expect(out.footer).toContain('packages/ui/dist');
    expect(out.footer).not.toContain('jsDelivr');
  });

  it('refuses any other value rather than guessing which kit it meant', () => {
    expect(() => previewSource({ KAI_BLOCKS_KIT: 'cdn' }, VERSION)).toThrow(/KAI_BLOCKS_KIT/);
    expect(() => previewSource({ KAI_BLOCKS_KIT: '1' }, VERSION)).toThrow(/KAI_BLOCKS_KIT/);
  });
});

describe('rewriteKitBase', () => {
  const form = [
    '<script type="module">',
    `import 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${VERSION}/dist/elements/autoloader.js'; // x-release-please-version`,
    `import { readModelStream } from 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${VERSION}/dist/wire.js';`,
    '</script>',
  ].join('\n');

  it('points every kit import at the local mount', () => {
    const out = rewriteKitBase(form, 'support-widget.cdn.html');
    expect(out).toContain(`import '${LOCAL_KIT_BASE}elements/autoloader.js'`);
    expect(out).toContain(`from '${LOCAL_KIT_BASE}wire.js'`);
    expect(out).not.toContain('cdn.jsdelivr.net');
  });

  it('a zero-replacement rewrite is a HARD FAILURE naming the file, never a silent pass', () => {
    expect(() => rewriteKitBase('<html></html>', 'support-widget.cdn.html')).toThrow(
      /support-widget\.cdn\.html/,
    );
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/preview-source.test.ts`
Expected: FAIL to collect -- `Failed to resolve import "../scripts/copy-blocks.mjs"`. That file does not exist yet.

- [ ] **Step 4: Write the copy script**

`apps/docs/scripts/copy-blocks.mjs`:

```js
// Copy the GENERATED block artifacts into the site's public/ tree, and decide
// -- once -- which kit the previews run against.
//
// The site never regenerates a block. `packages/ui/scripts/gen-blocks.mjs`
// writes dist/blocks/ during the kit build; this copies it. Same bounded-copy
// discipline as copy-kit-assets.mjs beside it, and the outputs are gitignored
// for the same reason.
//
// THE PREVIEW SWITCH. Production (KAI_BLOCKS_KIT unset) previews the PUBLISHED
// kit off jsDelivr at the pin lint:cdn-pins keeps equal to package.json, which
// is what makes the page standing proof that the published block runs cold.
// KAI_BLOCKS_KIT=local previews the build in your working tree, which is most
// of a block's life. The two look identical on screen, so the footer says
// which in words and scripts/verify-preview-source.mjs asserts the production
// build carries the CDN URL and no local path.
//
// Astro exposes only PUBLIC_* env to client code, and this switch must never
// be reachable by accident from a deploy environment, so the decision is
// written into src/generated/blocks-preview.ts and imported by the island.
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where local mode mounts the kit, site-absolute. One definition. */
export const LOCAL_KIT_BASE = '/blocks/kit/';

/** The jsDelivr base `rewriteBlockScript` stamps into an emitted CDN form.
 *  A COPY of the formula in packages/blocks/src/registry.ts, and it is a copy
 *  on purpose: importing that module here would mean a .mjs script loading a
 *  .ts export. The copy cannot rot silently -- rewriteKitBase throws when it
 *  matches nothing, so a changed formula fails the next `astro dev`. */
const CDN_BASE_RE = /https:\/\/cdn\.jsdelivr\.net\/npm\/@kitn\.ai\/ui@[^/]+\/dist\//g;

/**
 * Which kit the previews run, derived from the environment. Pure.
 * @param {Record<string, string | undefined>} env
 * @param {string} version the kit version, read from packages/ui/package.json
 */
export function previewSource(env, version) {
  const raw = env.KAI_BLOCKS_KIT;
  if (raw === undefined || raw === '') {
    return {
      mode: 'cdn',
      previewDir: '/blocks/r',
      footer: `previewing @kitn.ai/ui@${version} from jsDelivr`,
    };
  }
  if (raw === 'local') {
    return {
      mode: 'local',
      previewDir: '/blocks/local',
      footer: 'previewing the local build of packages/ui/dist',
    };
  }
  throw new Error(
    `KAI_BLOCKS_KIT="${raw}" is not a preview source. Set it to "local" for the build in your working tree, or leave it unset for the published CDN pin.`,
  );
}

/**
 * Point an emitted CDN form's kit imports at the local mount. Pure.
 * A form with no kit import is a broken input, not an empty edit: the emitted
 * form is self-contained BY CONSTRUCTION (generateCdnForm refuses otherwise),
 * so zero matches means the base formula moved and this rewrite has silently
 * stopped doing anything. Same reasoning as lint:cdn-pins treating a zero-match
 * scan as a hard failure.
 * @param {string} html
 * @param {string} fileName for the message
 */
export function rewriteKitBase(html, fileName) {
  CDN_BASE_RE.lastIndex = 0;
  const out = html.replace(CDN_BASE_RE, LOCAL_KIT_BASE);
  if (out === html) {
    throw new Error(
      `copy-blocks: ${fileName} carries no @kitn.ai/ui CDN import, so KAI_BLOCKS_KIT=local rewrote nothing. Either the form is not the generated one, or rewriteBlockScript's base in packages/blocks/src/registry.ts changed and ${CDN_BASE_RE.source} no longer matches it.`,
    );
  }
  return out;
}

const IS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (IS_MAIN) main();

function main() {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve('@kitn.ai/ui/package.json');
  const pkgRoot = dirname(pkgJson);
  const version = JSON.parse(readFileSync(pkgJson, 'utf8')).version;

  // fileURLToPath, NOT new URL(...).pathname: a URL pathname is percent-encoded
  // and platform-shaped, and mkdirSync(recursive) would happily create the
  // wrong directory and exit 0. Same trap copy-kit-assets.mjs records.
  const here = dirname(fileURLToPath(import.meta.url));
  const pub = join(here, '..', 'public');
  const generated = join(here, '..', 'src', 'generated');

  const src = join(pkgRoot, 'dist', 'blocks');
  if (!existsSync(join(src, 'registry.json'))) {
    console.error(
      `\n[copy-blocks] ${src}/registry.json is missing. The site SERVES the generated blocks registry and does not regenerate it, so there is nothing to copy.\n` +
        `  Build the kit first:  pnpm exec nx build ui   (or, from packages/ui, npm run build)\n`,
    );
    process.exit(1);
  }

  const source = previewSource(process.env, version);

  rmSync(join(pub, 'blocks'), { recursive: true, force: true });
  mkdirSync(join(pub, 'blocks'), { recursive: true });
  cpSync(src, join(pub, 'blocks'), { recursive: true });

  let localForms = 0;
  if (source.mode === 'local') {
    // The kit itself, so /blocks/kit/elements/autoloader.js resolves the way
    // the pinned CDN URL does. The whole dist: which chunks the autoloader
    // pulls is not a list worth hand-maintaining.
    // Everything but dist/blocks, which is already copied above and would
    // otherwise nest a second time under the kit mount. cpSync does not
    // descend a directory its filter rejects, so one path equality is enough.
    const distBlocks = join(pkgRoot, 'dist', 'blocks');
    cpSync(join(pkgRoot, 'dist'), join(pub, 'blocks', 'kit'), {
      recursive: true,
      filter: (from) => from !== distBlocks,
    });
    mkdirSync(join(pub, 'blocks', 'local'), { recursive: true });
    for (const name of readdirSync(join(src, 'r'))) {
      if (!name.endsWith('.cdn.html')) continue;
      const html = readFileSync(join(src, 'r', name), 'utf8');
      const id = name.slice(0, -'.cdn.html'.length);
      writeFileSync(join(pub, 'blocks', 'local', `${id}.html`), rewriteKitBase(html, name));
      localForms++;
    }
    if (localForms === 0) {
      console.error('\n[copy-blocks] KAI_BLOCKS_KIT=local rewrote no preview: dist/blocks/r has no <id>.cdn.html.\n');
      process.exit(1);
    }
  }

  mkdirSync(generated, { recursive: true });
  writeFileSync(
    join(generated, 'blocks-preview.ts'),
    [
      '// GENERATED by apps/docs/scripts/copy-blocks.mjs on predev/prebuild.',
      '// Do not edit and do not commit: it records which kit the /blocks previews',
      '// run against, decided once from KAI_BLOCKS_KIT.',
      'export const BLOCKS_PREVIEW = ' + JSON.stringify(source, null, 2) + ' as const;',
      '',
    ].join('\n'),
  );

  console.log(
    `[copy-blocks] ${source.mode} preview: ${source.footer}` +
      (localForms > 0 ? ` (${localForms} local form(s) rewritten)` : ''),
  );
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/preview-source.test.ts`
Expected: PASS, five tests (three over `previewSource`, two over `rewriteKitBase`).

- [ ] **Step 6: Wire it into the build, and ignore its outputs**

In `apps/docs/package.json`, extend both hooks so the existing asset copy still runs, and add the two the TESTS need:

```json
"predev": "node scripts/copy-kit-assets.mjs && node scripts/copy-blocks.mjs",
"prebuild": "node scripts/copy-kit-assets.mjs && node scripts/copy-blocks.mjs",
"pretest": "node scripts/copy-blocks.mjs",
"pretypecheck:blocks": "node scripts/copy-blocks.mjs",
```

**`pretest` and `pretypecheck:blocks` are load-bearing, not tidiness.** `src/generated/blocks-preview.ts` is written ONLY by this script, it is gitignored, and Task 3's module imports it. Without these hooks `pnpm --filter @kitn.ai/docs run test` and `run typecheck:blocks` fail on an unresolved import on every cold checkout and on every CI run, and the CI build step's own prebuild would mask it by accident while the local command stayed broken. `.npmrc` sets `enable-pre-post-scripts=true`, so pnpm runs them. The script is idempotent and runs in cdn mode whenever `KAI_BLOCKS_KIT` is unset, which is what a test run wants.

**Do not "fix" this by reordering the CI steps** so the build runs first. That makes the gate pass for a reason unrelated to the gate, and leaves a fresh clone unable to run the suite.

Append to `apps/docs/.gitignore`, under the existing raw-kit-assets block:

```
# blocks registry + previews copied by scripts/copy-blocks.mjs, and the
# preview-source module it generates: regenerated on prebuild, never committed
public/blocks/
src/generated/
```

**Two repo guards walk `apps/` and will now walk these copies.** `packages/ui/scripts/lint-cdn-pins.mjs` and `packages/ui/scripts/lint-attachment-object-urls.mjs` each carry a `SKIP_PATHS` list whose one entry today is `apps/docs/public/kitn`, with the stated reason that it holds gitignored copies of built kit output whose existence depends on whether anyone ran a build. `apps/docs/public/blocks/` is exactly that class and worse: `r/*.cdn.html` carry version pins that go stale the moment a release bumps the version and nobody rebuilds, and local mode copies the entire kit `dist` under `public/blocks/kit/`. Add `'apps/docs/public/blocks'` to **both** lists, beside the existing entry and under the same reason. `src/generated/` needs no entry: it carries no pin and no object URL.

Both guards are gate scripts, so they close this task:

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:cdn-pins
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:attachment-object-urls
```

Expected: both exit 0 with `public/blocks/` present in BOTH modes. **Watch `lint:cdn-pins` fail first** by removing the new skip entry after a local-mode copy: it reports a pinned literal inside `public/blocks/kit/` that no `fix:cdn-pins` run can keep true. Restore the entry and it goes green.

- [ ] **Step 7: Watch the loud failure, then watch both modes work**

```bash
cd "$WT" && mv packages/ui/dist/blocks packages/ui/dist/blocks.away
cd "$WT" && pnpm --filter @kitn.ai/docs exec node scripts/copy-blocks.mjs; echo "exit=$?"
cd "$WT" && mv packages/ui/dist/blocks.away packages/ui/dist/blocks
```

Expected: `exit=1` and a message naming `dist/blocks/registry.json` and the build command. **This is the "loud failure when dist/blocks is missing" the handoff requires; it must be seen, not assumed.**

```bash
cd "$WT" && pnpm --filter @kitn.ai/docs exec node scripts/copy-blocks.mjs
cd "$WT" && cat apps/docs/src/generated/blocks-preview.ts
cd "$WT" && grep -c "cdn.jsdelivr.net" apps/docs/public/blocks/r/*.cdn.html
cd "$WT" && KAI_BLOCKS_KIT=local pnpm --filter @kitn.ai/docs exec node scripts/copy-blocks.mjs
cd "$WT" && ls apps/docs/public/blocks/local && ls apps/docs/public/blocks/kit/elements/autoloader.js
cd "$WT" && grep -c "cdn.jsdelivr.net" apps/docs/public/blocks/local/*.html; echo "grep exit=$?"
```

Expected: cdn mode writes `mode: "cdn"` and every `r/*.cdn.html` carries jsDelivr imports; local mode writes one `local/<id>.html` per block, the kit mount exists, and the grep finds nothing in the local forms (`grep exit=1`).

Then prove the `pretest` hook does its job on a COLD tree, which is the state CI is always in:

```bash
cd "$WT" && rm -rf apps/docs/src/generated
cd "$WT" && pnpm --filter @kitn.ai/docs run test
cd "$WT" && cat apps/docs/src/generated/blocks-preview.ts | head -4
```

Expected: green, with the generated module recreated by the hook rather than found. Run it once more without deleting anything, to confirm the copy is idempotent.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add apps/docs/scripts/copy-blocks.mjs apps/docs/vitest.config.ts apps/docs/test/preview-source.test.ts apps/docs/package.json apps/docs/.gitignore pnpm-lock.yaml packages/ui/scripts/lint-cdn-pins.mjs packages/ui/scripts/lint-attachment-object-urls.mjs
git commit -m "$(cat <<'MSG'
feat(docs): copy the generated blocks registry into the site, and decide the preview source once

The site SERVES the generated artifacts and never regenerates them: prebuild
copies packages/ui/dist/blocks into public/, and refuses loudly when the kit
has not been built. KAI_BLOCKS_KIT=local additionally mounts the working
tree's kit and rewrites each emitted CDN form's import base at it; unset,
production, the previews run the published pin. A zero-replacement rewrite is
a hard failure, so the base formula cannot move without saying so.

The copies are gitignored built output under apps/, the same class as
public/kitn/, so lint:cdn-pins and lint:attachment-object-urls skip them for
the reason their SKIP_PATHS already states. pretest and pretypecheck:blocks
regenerate the preview module, so a cold checkout can run the suite.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

## Task 3: The derived axis, the add command, and the sticky framework

**Files:**
- Create: `apps/docs/src/lib/blocks-source.ts`
- Create: `apps/docs/test/blocks-source.test.ts`
- Create: `apps/docs/tsconfig.blocks.json`
- Modify: `apps/docs/package.json`

**Interfaces:**
- Consumes: `FRAMEWORK_BLOCK_FORMS`, `type BlockFormId`, `type FormFile` from `@kitn.ai/blocks/forms`.
- Produces: `frameworkOptions()`, `addCommandFor(id)`, `registryUrl()`, `formUrl(id, form)`, `previewUrl(id)`, `readFramework()`, `writeFramework(id)`, `languageFor(path)`, `type RegistryItem`.

- [ ] **Step 1: Write the failing test**

`apps/docs/test/blocks-source.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FRAMEWORK_BLOCK_FORMS } from '@kitn.ai/blocks/forms';
import {
  frameworkOptions,
  addCommandFor,
  formUrl,
  previewUrl,
  readFramework,
  writeFramework,
  languageFor,
} from '../src/lib/blocks-source';

describe('the framework dropdown is the renderer list, never a typed one', () => {
  it('equals FRAMEWORK_BLOCK_FORMS, value and label, in order', () => {
    expect(frameworkOptions()).toEqual(
      FRAMEWORK_BLOCK_FORMS.map((f) => ({ value: f.id, label: f.label })),
    );
  });

  it('never offers cdn: it is the preview source and the no-project form, not a framework', () => {
    expect(frameworkOptions().some((o) => o.value === 'cdn')).toBe(false);
  });

  it('is not empty -- a dropdown with no rows would satisfy an equality test vacuously', () => {
    expect(frameworkOptions().length).toBeGreaterThan(0);
  });
});

describe('addCommandFor', () => {
  it('carries the block id it was given, and no framework', () => {
    expect(addCommandFor('support-widget')).toBe('npx create-kai add support-widget');
    expect(addCommandFor('assistant')).toBe('npx create-kai add assistant');
  });

  it('two different ids give two different commands', () => {
    expect(addCommandFor('assistant')).not.toBe(addCommandFor('support-widget'));
  });
});

describe('urls', () => {
  it('form JSON is the per-form artifact gen-blocks writes', () => {
    expect(formUrl('support-widget', 'react')).toBe('/blocks/f/support-widget.react.json');
  });
  it('the preview href comes from the generated preview source, per block', () => {
    expect(previewUrl('assistant')).toMatch(/^\/blocks\/(r\/assistant\.cdn\.html|local\/assistant\.html)$/);
  });
});

describe('the sticky framework choice', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('round-trips', () => {
    writeFramework('react');
    expect(readFramework()).toBe('react');
  });

  it('falls back to the first offered framework when nothing is stored', () => {
    expect(readFramework()).toBe(FRAMEWORK_BLOCK_FORMS[0].id);
  });

  it('ignores a stored value no renderer emits', () => {
    localStorage.setItem('kai-blocks-framework', 'fortran');
    expect(readFramework()).toBe(FRAMEWORK_BLOCK_FORMS[0].id);
  });

  it('a private window that THROWS on read renders the default rather than blowing up', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(readFramework()).toBe(FRAMEWORK_BLOCK_FORMS[0].id);
  });

  it('a private window that THROWS on write is not an error the page shows', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => writeFramework('react')).not.toThrow();
  });
});

describe('languageFor', () => {
  it('maps the extensions the block forms actually emit', () => {
    expect(languageFor('src/components/x/X.tsx')).toBe('tsx');
    expect(languageFor('blocks/x/x.html')).toBe('html');
    expect(languageFor('blocks/x/x.css')).toBe('css');
    expect(languageFor('blocks/x/x.js')).toBe('javascript');
    expect(languageFor('src/components/x/x.controller.ts')).toBe('typescript');
    expect(languageFor('src/components/x/README.md')).toBe('markdown');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-source.test.ts`
Expected: FAIL to collect -- `Failed to resolve import "../src/lib/blocks-source"`.

- [ ] **Step 3: Write the module**

`apps/docs/src/lib/blocks-source.ts`:

```ts
/**
 * What the /blocks page reads, and where it reads it from.
 *
 * THE DROPDOWN IS THE RENDERER LIST. `FRAMEWORK_BLOCK_FORMS` is the axis
 * `packages/ui/scripts/gen-blocks.mjs` iterates to emit dist/blocks/f/, and
 * the axis the compile cells run. Reading it here rather than restating it is
 * what makes PR B2's four renderers appear on this page without anyone editing
 * this file, and what stops the page ever offering a framework nothing emits.
 * That is the create-kai menu-honesty rule applied to a page instead of a
 * prompt (packages/create-kai/test/menu-honesty.test.ts).
 */
import { FRAMEWORK_BLOCK_FORMS, type BlockFormId, type FormFile } from '@kitn.ai/blocks/forms';
import { BLOCKS_PREVIEW } from '../generated/blocks-preview';

export type { BlockFormId, FormFile };

/** One entry of dist/blocks/registry.json. */
export interface RegistryItem {
  name: string;
  title: string;
  description: string;
  categories: string[];
  docs?: string;
  meta?: { iframeHeight?: string };
}

/** The rendered tree of one block in one framework: dist/blocks/f/<id>.<form>.json. */
export interface FormPayload {
  block: string;
  form: BlockFormId;
  files: FormFile[];
}

const STORAGE_KEY = 'kai-blocks-framework';

/** The dropdown's rows. Derived, in the renderers' own order. */
export function frameworkOptions(): { value: BlockFormId; label: string }[] {
  return FRAMEWORK_BLOCK_FORMS.map((form) => ({ value: form.id, label: form.label }));
}

/** The default when nothing is stored: the first renderer, which is `html`,
 *  the authored truth. */
export function defaultFramework(): BlockFormId {
  return frameworkOptions()[0].value;
}

/** The add command, derived from THIS block's id. No framework in it: the CLI
 *  detects the host from the project, and with no project emits the single
 *  file form. */
export function addCommandFor(id: string): string {
  return `npx create-kai add ${id}`;
}

export function registryUrl(): string {
  return '/blocks/registry.json';
}

export function formUrl(id: string, form: BlockFormId): string {
  return `/blocks/f/${id}.${form}.json`;
}

/** The preview page for one block, against whichever kit the copy script
 *  chose. `.cdn.html` in production, `.html` under KAI_BLOCKS_KIT=local. */
export function previewUrl(id: string): string {
  return BLOCKS_PREVIEW.mode === 'local'
    ? `${BLOCKS_PREVIEW.previewDir}/${id}.html`
    : `${BLOCKS_PREVIEW.previewDir}/${id}.cdn.html`;
}

/** The words the footer says. One definition, generated from KAI_BLOCKS_KIT. */
export function previewFooter(): string {
  return BLOCKS_PREVIEW.footer;
}

/** The viewer's framework choice, global across every card and sticky.
 *  Every access is wrapped: a private window or blocked site data throws on
 *  read AND on write, and neither is worth a broken page. */
export function readFramework(): BlockFormId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const match = frameworkOptions().find((o) => o.value === stored);
    return match ? match.value : defaultFramework();
  } catch {
    return defaultFramework();
  }
}

export function writeFramework(form: BlockFormId): void {
  try {
    localStorage.setItem(STORAGE_KEY, form);
  } catch {
    // A viewer who cannot persist a preference still gets a working page.
  }
}

/** Highlighter language for a file the renderers emit. */
export function languageFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1);
  switch (ext) {
    case 'html': return 'html';
    case 'css': return 'css';
    case 'js': case 'mjs': return 'javascript';
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'json': return 'json';
    case 'md': return 'markdown';
    default: return 'text';
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-source.test.ts`
Expected: PASS. **If it fails to resolve `@kitn.ai/blocks/forms`, that is the R9 fallback: add `test: { server: { deps: { inline: ['@kitn.ai/blocks'] } } }` to `apps/docs/vitest.config.ts` and RECORD it for the PR body.**

- [ ] **Step 5: Add the scoped typecheck**

`apps/docs/tsconfig.blocks.json`:

```json
{
  "comment": "SCOPED type pass over the /blocks section only. apps/docs has no typecheck today and `astro check` over ~150 existing pages is a new gate of unknown colour, which is not this section's business. vitest transpiles without checking types, so without this the island's types ship unchecked. Extends the site's own config so module resolution and JSX match what Astro builds with.",
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "types": ["vite/client"]
  },
  "include": [
    "src/lib/blocks-source.ts",
    "src/generated/blocks-preview.ts",
    "src/components/blocks/**/*.ts",
    "src/components/blocks/**/*.tsx",
    "test/**/*.ts",
    "test/**/*.tsx"
  ]
}
```

In `apps/docs/package.json` scripts: `"typecheck:blocks": "tsc --noEmit -p tsconfig.blocks.json"`. Task 2 already added `"pretypecheck:blocks": "node scripts/copy-blocks.mjs"` (inert until now, because a `pre` hook for a script that does not exist never runs); this is the script it was waiting for. **Prove the pair on a cold tree before moving on:**

```bash
cd "$WT" && rm -rf apps/docs/src/generated
cd "$WT" && pnpm --filter @kitn.ai/docs run typecheck:blocks
```

Expected: green, with `src/generated/blocks-preview.ts` recreated by the hook. Without it this pass cannot resolve the module and fails identically on every CI run.

- [ ] **Step 6: Watch the typecheck FAIL, then pass**

```bash
cd "$WT" && printf '\nconst rot: number = addCommandFor("x");\n' >> apps/docs/src/lib/blocks-source.ts
cd "$WT" && pnpm --filter @kitn.ai/docs run typecheck:blocks; echo "exit=$?"
cd "$WT" && git checkout apps/docs/src/lib/blocks-source.ts 2>/dev/null || sed -i '' -E '/const rot: number/d' apps/docs/src/lib/blocks-source.ts
cd "$WT" && pnpm --filter @kitn.ai/docs run typecheck:blocks
```

Expected: `exit=2` with TS2322 on the planted line, then exit 0. **A typecheck nobody has watched fail is not evidence it reads these files.** Note that `src/generated/blocks-preview.ts` must exist for this pass; Task 2's copy script wrote it.

- [ ] **Step 7: Commit**

```bash
cd "$WT" && git add apps/docs/src/lib/blocks-source.ts apps/docs/test/blocks-source.test.ts apps/docs/tsconfig.blocks.json apps/docs/package.json
git commit -m "$(cat <<'MSG'
feat(docs): the /blocks framework axis, add command and sticky choice, all derived

The dropdown's rows ARE FRAMEWORK_BLOCK_FORMS, read from @kitn.ai/blocks/forms,
so PR B2's renderers appear here without editing this file and the page can
never offer a framework nothing emits. The add command is derived from each
block's own id and carries no framework. The framework choice is global and
sticky, and every localStorage access is wrapped: a private window renders the
default rather than throwing.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

## Task 4: The store-only zip writer moves to the site

**Files:**
- Create: `apps/docs/src/components/blocks/zip.ts`
- Create: `apps/docs/test/zip.test.ts`

**Interfaces:**
- Consumes: `type FormFile` from `@kitn.ai/blocks/forms` (only `path` and `content` are read).
- Produces: `storeZip(files: readonly { path: string; content: string }[]): Uint8Array`, `crc32(bytes: Uint8Array): number`, `zipFileName(id: string, form: string): string`.

The source is `packages/ui/mcp/construct/dev.ts` lines 695 to 754 (`CRC_TABLE`, `crc32`, `storeZip`). Task 8 deletes them there. Read that code before writing this; the port is `Buffer` to `Uint8Array` and nothing else.

- [ ] **Step 1: Write the failing test**

`apps/docs/test/zip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { storeZip, crc32, zipFileName } from '../src/components/blocks/zip';

const dec = new TextDecoder();
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

describe('storeZip', () => {
  const files = [
    { path: 'src/components/x/X.tsx', content: 'export const X = () => null;\n' },
    { path: 'src/components/x/README.md', content: '# X\n' },
  ];

  it('is a real zip: local header, central directory, end-of-central-directory', () => {
    const zip = storeZip(files);
    expect(u32(zip, 0)).toBe(0x04034b50);
    const eocdAt = zip.length - 22;
    expect(u32(zip, eocdAt)).toBe(0x06054b50);
    const view = new DataView(zip.buffer, zip.byteOffset);
    expect(view.getUint16(eocdAt + 10, true)).toBe(files.length);
  });

  it('stores, never deflates, so the file bytes appear verbatim', () => {
    const text = dec.decode(storeZip(files));
    for (const f of files) {
      expect(text).toContain(f.path);
      expect(text).toContain(f.content);
    }
  });

  it('is deterministic: the same files give byte-identical output', () => {
    expect(Array.from(storeZip(files))).toEqual(Array.from(storeZip(files)));
  });

  it('crc32 matches the known PKZIP value for "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('a different file set gives different bytes -- so the determinism test cannot pass vacuously', () => {
    expect(Array.from(storeZip(files))).not.toEqual(Array.from(storeZip([files[0]])));
  });
});

describe('zipFileName', () => {
  it('names the block and the framework, so two downloads do not collide', () => {
    expect(zipFileName('support-widget', 'react')).toBe('support-widget-react.zip');
    expect(zipFileName('assistant', 'html')).not.toBe(zipFileName('support-widget', 'html'));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/zip.test.ts`
Expected: FAIL to collect -- `Failed to resolve import "../src/components/blocks/zip"`.

- [ ] **Step 3: Write the module**

`apps/docs/src/components/blocks/zip.ts`:

```ts
/**
 * A store-only zip writer, in the browser.
 *
 * MOVED from packages/ui/mcp/construct/dev.ts, whose /gallery/api/zip route
 * PR C retires. The decision it records still holds: node's zlib has DEFLATE
 * but no zip CONTAINER, nothing in the dependency tree ships one, and the
 * files are a handful of small text sources, so compression buys nothing worth
 * a dependency. Method 0, which every unzip reads. Deterministic on purpose
 * (fixed 1980-01-01 stamps), so the same files always produce the same bytes.
 *
 * It lives HERE and not in packages/blocks because that package's tsconfig
 * sets `types: []` and `lib: ["ES2023"]` with no DOM, deliberately, and
 * TextEncoder has no type there.
 */
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The listed files as one uncompressed (store-only) zip. */
export function storeZip(files: readonly { path: string; content: string }[]): Uint8Array {
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01, the zip epoch
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.path);
    const data = enc.encode(file.content);
    const crc = crc32(data);

    const fixed = (sig: number, extraLead: Uint8Array): Uint8Array => {
      const head = new Uint8Array(4);
      new DataView(head.buffer).setUint32(0, sig, true);
      const meta = new Uint8Array(22);
      const mv = new DataView(meta.buffer);
      mv.setUint16(0, 20, true); // version needed: 2.0
      mv.setUint16(2, 0, true); // flags
      mv.setUint16(4, 0, true); // method: store
      mv.setUint16(6, 0, true); // mod time
      mv.setUint16(8, DOS_DATE, true); // mod date
      mv.setUint32(10, crc, true);
      mv.setUint32(14, data.length, true); // compressed = uncompressed (store)
      mv.setUint32(18, data.length, true);
      return concat([head, extraLead, meta]);
    };

    const localTail = new Uint8Array(4);
    new DataView(localTail.buffer).setUint16(0, name.length, true); // extra length stays 0
    const local = concat([fixed(0x04034b50, new Uint8Array(0)), localTail, name, data]);

    const centralVersion = new Uint8Array(2);
    new DataView(centralVersion.buffer).setUint16(0, 20, true); // version made by
    const centralTail = new Uint8Array(18);
    const cv = new DataView(centralTail.buffer);
    cv.setUint16(0, name.length, true);
    // extra(2) comment(2) disk(2) internal-attrs(2) external-attrs(4): all zero
    cv.setUint32(14, offset, true); // local header offset
    centrals.push(concat([fixed(0x02014b50, centralVersion), centralTail, name]));

    locals.push(local);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); // entries on this disk
  ev.setUint16(10, files.length, true); // entries total
  ev.setUint32(12, centralDir.length, true);
  ev.setUint32(16, offset, true); // central dir offset
  return concat([...locals, centralDir, eocd]);
}

/** One derivation, shared by the Download button and its test. */
export function zipFileName(id: string, form: string): string {
  return `${id}-${form}.zip`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/zip.test.ts`
Expected: PASS, six tests.

- [ ] **Step 5: Prove the port is byte-identical to the writer it replaces**

The old writer still exists at this point in the branch, which is the only window in which this comparison can be made. Take it.

```bash
cd "$WT" && npx tsx -e "
const { storeZip: nodeZip } = await import('./packages/ui/mcp/construct/dev.ts');
const { storeZip: webZip } = await import('./apps/docs/src/components/blocks/zip.ts');
const files = [
  { path: 'a/b.tsx', content: 'export const X = 1;\n', target: 'a/b.tsx' },
  { path: 'a/README.md', content: '# hi\n', target: 'a/README.md' },
];
const a = Buffer.from(nodeZip(files));
const b = Buffer.from(webZip(files));
console.log('equal:', a.equals(b), a.length, b.length);
process.exit(a.equals(b) ? 0 : 1);
"
```

Expected: `equal: true` and matching lengths. **If `npx tsx` is unavailable, note it and skip this step** -- it is corroboration, not the gate; the six tests above are the gate. Record the outcome either way in the task report.

- [ ] **Step 6: Commit**

```bash
cd "$WT" && git add apps/docs/src/components/blocks/zip.ts apps/docs/test/zip.test.ts
git commit -m "$(cat <<'MSG'
feat(docs): the store-only zip writer moves to the site, ported to Uint8Array

The /gallery zip route is retired in this PR and the writer has one consumer
left: the /blocks Download button. Same method 0, same deterministic
1980-01-01 stamps, Buffer swapped for Uint8Array and DataView. It cannot live
in packages/blocks: that tsconfig has no DOM lib on purpose, so TextEncoder has
no type there.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

## Task 5: The card and the page view

**Files:**
- Create: `apps/docs/src/components/blocks/kai-jsx.d.ts`
- Create: `apps/docs/src/components/blocks/BlockCard.tsx`
- Create: `apps/docs/src/components/blocks/BlocksPage.tsx`
- Create: `apps/docs/test/blocks-page.test.tsx`
- Modify: `apps/docs/tsconfig.blocks.json` (add the d.ts to `include`)

**Interfaces:**
- Consumes: everything Task 3 produced, plus `storeZip` and `zipFileName` from Task 4.
- Produces: `BlocksPage(props: { items: RegistryItem[]; loadForm: (id, form) => Promise<FormPayload> })`, `BlockCard(props: { item; framework; onFramework; loadForm })`.

**The layout is the owner's ratified cutup (spec 4, night-run 3.2 bullet 7). Every one of these is a requirement:**

- Title and description on ONE line.
- One toolbar row, contextual on the mode, with its height RESERVED so swapping modes moves nothing.
- Preview mode, left of centre: a bordered icon group for desktop / tablet / mobile, plus open-in-new-tab and refresh.
- Code mode, left of centre: the framework dropdown and a Download .zip ghost button.
- Right, BOTH modes: the add-command pill with copy and an info affordance.
- A Preview | Code segmented toggle, always, at the left.
- **No "Built from" row.** The mockup had one; it is gone.
- Code mode: a project-shaped file tree with per-file copy, and **the displayed path is `FormFile.target` byte for byte.**

**One spec deviation, stated rather than dropped.** Spec 4 says the file view is "line-numbered and highlighted". `kai-code-block` highlights (`codeHighlight`, on by default) and has **no line-number prop** -- its props are `theme`, `code`, `language`, `codeTheme`, `codeHighlight`, `copy`, `proseSize`, verified against `element-meta.json`. This card ships highlighted, not line-numbered, and **the gap is a kit ticket, not a silent omission**: `kai-code-block` line numbers goes on the small-tickets round's list, and the PR body says the page is missing them and why. A CSS-counter gutter faked around the element would paint numbers next to a shadow root it cannot measure, which is worse than not having them.

**Two element details that decide the markup**, both verified on the tree:

- `kai-button`'s `label` is the ACCESSIBLE name only; the visible text is the default slot. A text button therefore needs children (`<kai-button ...>Download .zip</kai-button>`), and `label` stays only on the icon-only buttons.
- `kai-code-block` renders its OWN copy button by default (`copy` defaults on). The card puts the per-file copy in the file header beside the path, per spec 4, so the element's own copy is turned off rather than shown twice.

- [ ] **Step 1: Write the JSX declarations**

This is a certainty, not a contingency: nothing in the kit or the docs augments Solid's `JSX.IntrinsicElements` or `JSX.CustomEvents` for `kai-*` (`dist/elements.d.ts` augments React's namespace only), so `typecheck:blocks` fails deterministically without it.

`apps/docs/src/components/blocks/kai-jsx.d.ts`:

```ts
/**
 * Solid JSX declarations for the kai-* elements this section binds.
 *
 * The kit ships React typings (`dist/elements.d.ts` augments React's
 * namespace) and generated React wrappers, but nothing augments Solid's
 * JSX.IntrinsicElements, so a Solid island using the elements directly has no
 * types for them. Scoped to the six elements the card uses rather than
 * generated: a generated Solid typing surface is a kit feature, and it belongs
 * in packages/ui with the generator that would own it, not in the docs site.
 *
 * `on:kai-*` needs JSX.CustomEvents, which is Solid's own escape hatch for a
 * non-delegated listener on a custom event. Delegated `onKaiClick` would not
 * work anyway: kai-* events do not bubble.
 */
import 'solid-js';

interface KaiBase {
  theme?: 'light' | 'dark' | 'auto';
  class?: string;
  slot?: string;
  hidden?: boolean;
  'data-testid'?: string;
  'data-category'?: string;
}

declare module 'solid-js' {
  namespace JSX {
    interface CustomEvents {
      'kai-click': CustomEvent<void>;
      'kai-change': CustomEvent<{ value: string; values?: string[] }>;
      'kai-select': CustomEvent<{ path: string }>;
    }
    interface IntrinsicElements {
      'kai-button': KaiBase & {
        variant?: 'default' | 'subtle' | 'ghost' | 'outline' | 'destructive';
        size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
        icon?: string;
        label?: string;
        disabled?: boolean;
        children?: JSX.Element;
      };
      'kai-segmented': KaiBase & { size?: 'sm' | 'md'; children?: JSX.Element };
      'kai-select': KaiBase & { label?: string; placeholder?: string; children?: JSX.Element };
      'kai-file-tree': KaiBase & { summary?: boolean; children?: JSX.Element };
      'kai-code-block': KaiBase & { proseSize?: 'xs' | 'sm' | 'base' | 'lg'; children?: JSX.Element };
      'kai-tooltip': KaiBase & { content?: string; children?: JSX.Element };
    }
  }
}
```

**Array and object props are deliberately absent from these declarations.** They are set as JS properties in effects, never as attributes, which is the kai- contract; leaving them out of the JSX types is what stops someone writing `options={[...]}` and shipping `[object Object]`.

Add `"src/components/blocks/kai-jsx.d.ts"` to `tsconfig.blocks.json`'s `include`.

- [ ] **Step 2: Write the failing test**

`apps/docs/test/blocks-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@solidjs/testing-library';
import { FRAMEWORK_BLOCK_FORMS } from '@kitn.ai/blocks/forms';
import { BlocksPage } from '../src/components/blocks/BlocksPage';
import type { FormPayload, RegistryItem } from '../src/lib/blocks-source';

const items: RegistryItem[] = [
  {
    name: 'support-widget',
    title: 'Support Widget',
    description: 'Docked support chat.',
    categories: ['assistant', 'widget'],
    meta: { iframeHeight: '720px' },
  },
  {
    name: 'assistant',
    title: 'Assistant',
    description: 'Full-page assistant.',
    categories: ['assistant', 'full-page'],
    meta: { iframeHeight: '800px' },
  },
];

// A fixture for EVERY block x EVERY framework the renderers emit. The default
// framework after localStorage.clear() is FRAMEWORK_BLOCK_FORMS[0], which is
// `html`, so a react-only fixture set would send every default-path test down
// the form-error branch. Derived from the same axis the page reads, so PR B2
// cannot leave this file half-covered without failing the floor below.
const TARGET_ROOT: Record<string, string> = { html: 'blocks', react: 'src/components' };
const forms: Record<string, FormPayload> = {};
for (const item of items) {
  for (const form of FRAMEWORK_BLOCK_FORMS) {
    const root = TARGET_ROOT[form.id] ?? 'src/components';
    const file = form.id === 'react' ? `${item.title.replace(/\s/g, '')}.tsx` : `${item.name}.html`;
    forms[`${item.name}:${form.id}`] = {
      block: item.name,
      form: form.id,
      files: [
        {
          path: file,
          content: `/* ${item.name} ${form.id} */\n`,
          target: `${root}/${item.name}/${file}`,
        },
      ],
    };
  }
}

const loadForm = vi.fn(async (id: string, form: string) => {
  const payload = forms[`${id}:${form}`];
  if (!payload) throw new Error(`no fixture for ${id}:${form}`);
  return payload;
});

/** Drive the card's mode the way a viewer does: kai-segmented's own event.
 *  kai-* events do not bubble, so it is dispatched ON the element. */
const setMode = (card: HTMLElement, value: 'preview' | 'code'): void => {
  within(card)
    .getByTestId('mode-toggle')
    .dispatchEvent(new CustomEvent('kai-change', { detail: { value } }));
};

const setFramework = (card: HTMLElement, value: string): void => {
  within(card)
    .getByTestId('framework-select')
    .dispatchEvent(new CustomEvent('kai-change', { detail: { value } }));
};

/** Every card in code mode, which is where the framework controls exist. */
async function allCardsInCodeMode(): Promise<HTMLElement[]> {
  const cards = items.map((i) => screen.getByTestId(`block-card-${i.name}`));
  for (const card of cards) setMode(card, 'code');
  await waitFor(() => {
    for (const card of cards) expect(within(card).queryByTestId('framework-select')).not.toBeNull();
  });
  return cards;
}

beforeEach(() => {
  localStorage.clear();
  loadForm.mockClear();
});

describe('the fixtures cover the whole axis', () => {
  it('has a payload for every block x every framework renderer', () => {
    expect(Object.keys(forms).length).toBe(items.length * FRAMEWORK_BLOCK_FORMS.length);
    expect(FRAMEWORK_BLOCK_FORMS.length).toBeGreaterThan(0);
  });
});

describe('the add command is per card', () => {
  it('renders one command per block, each carrying ITS OWN id', () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const commands = screen.getAllByTestId('add-command').map((el) => el.textContent?.trim());
    expect(commands).toEqual([
      'npx create-kai add support-widget',
      'npx create-kai add assistant',
    ]);
  });

  it('two cards do not print the same command -- the mockup defect', () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const commands = screen.getAllByTestId('add-command').map((el) => el.textContent?.trim());
    expect(new Set(commands).size).toBe(commands.length);
    expect(commands.length).toBeGreaterThan(1);
  });

  it('never names a framework: the CLI detects it from the project', () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    for (const el of screen.getAllByTestId('add-command')) {
      for (const form of FRAMEWORK_BLOCK_FORMS) {
        expect(el.textContent).not.toContain(` ${form.id}`);
      }
    }
  });
});

describe('the framework dropdown', () => {
  it('offers exactly the renderers that exist, on every card', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    for (const card of await allCardsInCodeMode()) {
      const select = within(card).getByTestId('framework-select') as HTMLElement & {
        options?: { value: string; label: string }[];
      };
      expect(select.options).toEqual(
        FRAMEWORK_BLOCK_FORMS.map((f) => ({ value: f.id, label: f.label })),
      );
    }
  });

  it('is global and sticky: choosing on one card moves every card and survives a remount', async () => {
    const first = render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const cards = await allCardsInCodeMode();
    setFramework(cards[0], 'react');
    await waitFor(() => {
      for (const card of cards) {
        const select = within(card).getByTestId('framework-select') as HTMLElement & { value?: string };
        expect(select.value).toBe('react');
      }
    });
    expect(localStorage.getItem('kai-blocks-framework')).toBe('react');
    first.unmount();

    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    for (const card of await allCardsInCodeMode()) {
      const select = within(card).getByTestId('framework-select') as HTMLElement & { value?: string };
      expect(select.value).toBe('react');
    }
  });
});

describe('code mode', () => {
  it('displays FormFile.target byte for byte, not the bare file name', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => {
      const tree = within(card).getByTestId('file-tree') as HTMLElement & {
        files?: { path: string }[];
      };
      // The DEFAULT framework, whatever the renderer list leads with.
      const target = forms[`support-widget:${FRAMEWORK_BLOCK_FORMS[0].id}`].files[0].target;
      expect(tree.files?.map((f) => f.path)).toEqual([target]);
      expect(within(card).getByTestId('active-path').textContent?.trim()).toBe(target);
    });
  });

  it('re-sets the tree when the card returns to code mode -- a fresh element gets fresh props', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => expect(within(card).queryByTestId('file-tree')).not.toBeNull());
    setMode(card, 'preview');
    await waitFor(() => expect(within(card).queryByTestId('file-tree')).toBeNull());
    setMode(card, 'code');
    await waitFor(() => {
      const tree = within(card).getByTestId('file-tree') as HTMLElement & { files?: unknown[] };
      expect(tree.files?.length).toBe(1);
    });
  });

  it('loads the new framework for THAT card only when the dropdown changes', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-assistant');
    setMode(card, 'code');
    await waitFor(() =>
      expect(loadForm).toHaveBeenCalledWith('assistant', FRAMEWORK_BLOCK_FORMS[0].id),
    );
    loadForm.mockClear();

    setFramework(card, 'react');
    await waitFor(() => expect(loadForm).toHaveBeenCalledWith('assistant', 'react'));
    // support-widget never entered code mode, so nothing was fetched for it.
    expect(loadForm.mock.calls.every((c) => c[0] === 'assistant')).toBe(true);
    await waitFor(() => {
      const tree = within(card).getByTestId('file-tree') as HTMLElement & {
        files?: { path: string }[];
      };
      expect(tree.files?.[0]?.path).toBe(forms['assistant:react'].files[0].target);
    });
  });

  it('turns the code element own copy button off, because the file header carries one', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => {
      const code = within(card).getByTestId('code-block') as HTMLElement & { copy?: boolean };
      expect(code.copy).toBe(false);
      expect(within(card).queryByTestId('file-copy')).not.toBeNull();
    });
  });
});

describe('the toolbar', () => {
  it('shows the viewport group in preview mode and the framework row in code mode, never both', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    expect(within(card).queryByTestId('viewport-group')).not.toBeNull();
    expect(within(card).queryByTestId('framework-select')).toBeNull();

    setMode(card, 'code');
    await waitFor(() => {
      expect(within(card).queryByTestId('framework-select')).not.toBeNull();
      expect(within(card).queryByTestId('viewport-group')).toBeNull();
    });
  });

  it('keeps the add-command pill in BOTH modes', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    expect(within(card).queryByTestId('add-command')).not.toBeNull();
    setMode(card, 'code');
    await waitFor(() => expect(within(card).queryByTestId('add-command')).not.toBeNull());
  });

  it('gives the Download button VISIBLE text, not just an accessible name', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() =>
      expect(within(card).getByTestId('download-zip').textContent).toContain('.zip'),
    );
  });

  it('has no "Built from" row', () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    expect(screen.queryByText(/built from/i)).toBeNull();
  });
});

describe('the preview', () => {
  it('sizes the frame from the manifest and reloads on refresh', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    const card = screen.getByTestId('block-card-assistant');
    const frame = within(card).getByTestId('preview-frame') as HTMLIFrameElement;
    expect(frame.style.height).toBe('800px');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    const before = frame.getAttribute('src');
    within(card).getByTestId('preview-refresh').dispatchEvent(new CustomEvent('kai-click'));
    await waitFor(() =>
      expect(
        (within(card).getByTestId('preview-frame') as HTMLIFrameElement).getAttribute('src'),
      ).not.toBe(before),
    );
  });
});

describe('the category strip', () => {
  it('is derived from the items and filters them in place', async () => {
    render(() => <BlocksPage items={items} loadForm={loadForm} />);
    expect(screen.getAllByTestId('category').map((el) => el.textContent?.trim())).toEqual([
      'all',
      'assistant',
      'widget',
      'full-page',
    ]);
    (document.querySelector('[data-category="widget"]') as HTMLElement).click();
    await waitFor(() => {
      expect(screen.queryByTestId('block-card-assistant')).toBeNull();
      expect(screen.queryByTestId('block-card-support-widget')).not.toBeNull();
    });
  });
});

describe('a form that will not load', () => {
  it('says so on the card instead of quietly hiding the framework', async () => {
    const failing = vi.fn(async () => {
      throw new Error('404');
    });
    render(() => <BlocksPage items={[items[0]]} loadForm={failing} />);
    const card = screen.getByTestId('block-card-support-widget');
    setMode(card, 'code');
    await waitFor(() => expect(within(card).getByTestId('form-error')).toBeTruthy());
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-page.test.tsx`
Expected: FAIL to collect -- `Failed to resolve import "../src/components/blocks/BlocksPage"`.

**That is the only red this task gets for free, and it is a weak one.** Steps 4 and 5 exist precisely because an unresolved import proves nothing about the assertions. After the code lands, Step 6 re-runs the suite and every assertion must go green in one pass; anything still red there is a defect in this task's code, not a fixture problem to be edited around.

- [ ] **Step 4: Write `BlockCard.tsx`**

```tsx
/**
 * One block on /blocks: header line, contextual toolbar, and either the live
 * preview or the tree `create-kai add` writes.
 *
 * Built from the kit's own kai-* elements, loaded through the site's
 * loadKit() helper -- the dogfooding ruling, in the site's existing idiom.
 * Array and object props are set as JS PROPERTIES, never attributes, and
 * kai-* events do not bubble so every listener is `on:` ON the element.
 *
 * THE REFS ARE SIGNALS, and that is not a style choice. The elements that
 * carry properties live inside <Show>, so they do not exist at mount and are
 * RE-CREATED every time the card changes mode. An effect over a plain `let`
 * ref reads no signal, runs once, at mount, against `undefined` -- the
 * framework select would never receive its `options`, and a second entry into
 * code mode would leave a brand new kai-file-tree with no `files`. Reading
 * `selectEl()` inside the effect makes the element's arrival the dependency,
 * so every effect re-runs when its element (re)appears.
 *
 * THE TOOLBAR IS CONTEXTUAL AND ITS HEIGHT IS RESERVED. Swapping Preview and
 * Code must move nothing: the row keeps one min-height and only its middle
 * group changes.
 */
import { createSignal, createEffect, createMemo, Show, type JSX } from 'solid-js';
import {
  addCommandFor,
  frameworkOptions,
  languageFor,
  previewUrl,
  type BlockFormId,
  type FormPayload,
  type RegistryItem,
} from '../../lib/blocks-source';
import { storeZip, zipFileName } from './zip';

const VIEWPORTS = [
  { value: 'desktop', label: 'Desktop', icon: 'monitor', width: '100%' },
  { value: 'tablet', label: 'Tablet', icon: 'tablet', width: '768px' },
  { value: 'mobile', label: 'Mobile', icon: 'smartphone', width: '390px' },
] as const;

/** Set a JS property on a kai-* element. Array and object props never work as
 *  attributes (the kai- contract), and a fresh reference is what NOTIFIES. */
function prop<T>(el: HTMLElement | undefined, name: string, value: T): void {
  if (el) (el as unknown as Record<string, unknown>)[name] = value;
}

function copy(text: string): void {
  void Promise.resolve(navigator.clipboard?.writeText(text)).catch(() => {});
}

export interface BlockCardProps {
  item: RegistryItem;
  framework: BlockFormId;
  onFramework: (form: BlockFormId) => void;
  loadForm: (id: string, form: BlockFormId) => Promise<FormPayload>;
}

export function BlockCard(props: BlockCardProps): JSX.Element {
  const [mode, setMode] = createSignal<'preview' | 'code'>('preview');
  const [viewport, setViewport] = createSignal<string>('desktop');
  const [payload, setPayload] = createSignal<FormPayload | undefined>();
  const [error, setError] = createSignal<string | undefined>();
  const [activePath, setActivePath] = createSignal<string | undefined>();
  const [reloadKey, setReloadKey] = createSignal(0);

  // Signals, not `let` bindings: see the header.
  const [treeEl, setTreeEl] = createSignal<HTMLElement>();
  const [selectEl, setSelectEl] = createSignal<HTMLElement>();
  const [modeEl, setModeEl] = createSignal<HTMLElement>();
  const [viewportEl, setViewportEl] = createSignal<HTMLElement>();
  const [codeEl, setCodeEl] = createSignal<HTMLElement>();

  // The tree's paths are FormFile.target, byte for byte: the path the CLI
  // writes IS the path the page displays (owner ruling, spec 3.4).
  const treeFiles = createMemo(() =>
    (payload()?.files ?? []).map((f) => ({
      path: f.target,
      code: f.content,
      language: languageFor(f.target),
    })),
  );

  const activeFile = createMemo(() => {
    const files = payload()?.files ?? [];
    return files.find((f) => f.target === activePath()) ?? files[0];
  });

  // Load the selected framework's tree when the card first enters code mode
  // and whenever the framework changes. Nothing is fetched for a card the
  // reader never opens.
  createEffect(() => {
    if (mode() !== 'code') return;
    const form = props.framework;
    const id = props.item.name;
    setError(undefined);
    void props
      .loadForm(id, form)
      .then((next) => {
        setPayload(next);
        setActivePath(next.files[0]?.target);
      })
      .catch((err: unknown) => {
        setPayload(undefined);
        // Decide loudly. A form that will not load is a broken copy, not a
        // reason to quietly drop a framework the renderers do emit.
        setError(
          `Could not load the ${form} files for ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  });

  createEffect(() => prop(treeEl(), 'files', treeFiles()));
  createEffect(() => prop(treeEl(), 'activeFile', activeFile()?.target));
  createEffect(() => prop(selectEl(), 'options', frameworkOptions()));
  createEffect(() => prop(selectEl(), 'value', props.framework));
  createEffect(() =>
    prop(modeEl(), 'options', [
      { value: 'preview', label: 'Preview' },
      { value: 'code', label: 'Code' },
    ]),
  );
  createEffect(() => prop(modeEl(), 'value', mode()));
  createEffect(() =>
    prop(
      viewportEl(),
      'options',
      VIEWPORTS.map((v) => ({ value: v.value, label: v.label, icon: v.icon })),
    ),
  );
  createEffect(() => prop(viewportEl(), 'value', viewport()));
  createEffect(() => prop(codeEl(), 'code', activeFile()?.content ?? ''));
  createEffect(() => prop(codeEl(), 'language', languageFor(activeFile()?.target ?? '')));
  // The element renders its own copy button by default; the file header has
  // one beside the path (spec 4), so two would be two.
  createEffect(() => prop(codeEl(), 'copy', false));

  const download = (): void => {
    const files = payload()?.files ?? [];
    if (files.length === 0) return;
    const blob = new Blob([storeZip(files) as unknown as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipFileName(props.item.name, props.framework);
    a.click();
    // Revoke on the next frame: a synchronous revoke races the download in
    // WebKit. The kit's own attachment code takes the same shape.
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  };

  const iframeWidth = createMemo(
    () => VIEWPORTS.find((v) => v.value === viewport())?.width ?? '100%',
  );

  return (
    <article
      data-testid={`block-card-${props.item.name}`}
      class="not-content overflow-hidden rounded-xl border border-line bg-surface"
    >
      {/* Header: title and description on ONE line. */}
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h2 class="text-base font-semibold text-ink">{props.item.title}</h2>
        <p class="min-w-0 flex-1 truncate text-sm text-ink-2">{props.item.description}</p>
      </div>

      {/* Toolbar: one row, contextual, height reserved so a mode swap moves
          nothing. `flex-wrap` is deliberate at narrow widths and Task 10
          checks at 390px that the two modes still agree on height. */}
      <div class="flex min-h-12 flex-wrap items-center gap-3 border-b border-line px-4 py-2">
        <kai-segmented
          ref={setModeEl}
          data-testid="mode-toggle"
          size="sm"
          on:kai-change={(e) => setMode(e.detail.value === 'code' ? 'code' : 'preview')}
        />

        <Show when={mode() === 'preview'}>
          <div data-testid="viewport-group" class="flex items-center gap-1 rounded-md border border-line p-0.5">
            <kai-segmented
              ref={setViewportEl}
              size="sm"
              on:kai-change={(e) => setViewport(e.detail.value)}
            />
          </div>
          <kai-button
            data-testid="preview-open"
            variant="ghost"
            size="icon-sm"
            icon="external-link"
            label="Open the preview in a new tab"
            on:kai-click={() => window.open(previewUrl(props.item.name), '_blank', 'noopener')}
          />
          <kai-button
            data-testid="preview-refresh"
            variant="ghost"
            size="icon-sm"
            icon="rotate-cw"
            label="Reload the preview"
            on:kai-click={() => setReloadKey((n) => n + 1)}
          />
        </Show>

        <Show when={mode() === 'code'}>
          <kai-select
            ref={setSelectEl}
            data-testid="framework-select"
            label="Framework"
            on:kai-change={(e) => props.onFramework(e.detail.value as BlockFormId)}
          />
          {/* Visible text is the default slot; `label` would be the accessible
              name only and this button would render icon-only. */}
          <kai-button
            data-testid="download-zip"
            variant="ghost"
            size="sm"
            icon="download"
            on:kai-click={download}
          >
            Download .zip
          </kai-button>
        </Show>

        {/* The add command: RIGHT, in BOTH modes, derived from this block's
            own id, with no framework in it. */}
        <div class="ml-auto flex items-center gap-1">
          <code data-testid="add-command" class="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-ink">
            {addCommandFor(props.item.name)}
          </code>
          <kai-button
            data-testid="add-copy"
            variant="ghost"
            size="icon-sm"
            icon="copy"
            label="Copy the add command"
            on:kai-click={() => copy(addCommandFor(props.item.name))}
          />
          <kai-tooltip
            data-testid="add-info"
            content="add detects the framework from your project. With no project it writes the single-file form."
          >
            <kai-button variant="ghost" size="icon-sm" icon="info" label="About this command" />
          </kai-tooltip>
        </div>
      </div>

      <Show when={mode() === 'preview'}>
        <div class="flex justify-center bg-surface-2 p-4">
          <iframe
            data-testid="preview-frame"
            title={`${props.item.title} live preview`}
            src={`${previewUrl(props.item.name)}${reloadKey() > 0 ? `?r=${reloadKey()}` : ''}`}
            loading="lazy"
            {/* R11: scripts and same-origin, because the block needs both;
                top-navigation, popups, forms, modals and downloads stay
                withheld. */}
            sandbox="allow-scripts allow-same-origin"
            style={{ width: iframeWidth(), height: props.item.meta?.iframeHeight ?? '720px' }}
            class="max-w-full rounded-lg border border-line bg-surface"
          />
        </div>
      </Show>

      <Show when={mode() === 'code'}>
        <Show
          when={!error()}
          fallback={
            <p data-testid="form-error" class="px-4 py-6 text-sm text-ink-2">
              {error()}
            </p>
          }
        >
          <div class="flex min-h-0 flex-col md:flex-row">
            <div class="w-full shrink-0 overflow-y-auto border-b border-line p-2 md:w-72 md:border-b-0 md:border-r">
              <kai-file-tree
                ref={setTreeEl}
                data-testid="file-tree"
                on:kai-select={(e) => setActivePath(e.detail.path)}
              />
            </div>
            <div class="min-w-0 flex-1 overflow-auto p-3">
              <div class="mb-2 flex items-center gap-2">
                <span data-testid="active-path" class="min-w-0 truncate font-mono text-xs text-ink-2">
                  {activeFile()?.target ?? ''}
                </span>
                <kai-button
                  data-testid="file-copy"
                  class="ml-auto"
                  variant="ghost"
                  size="icon-sm"
                  icon="copy"
                  label="Copy this file"
                  on:kai-click={() => copy(activeFile()?.content ?? '')}
                />
              </div>
              <kai-code-block ref={setCodeEl} data-testid="code-block" />
            </div>
          </div>
        </Show>
      </Show>
    </article>
  );
}
```

**If the JSX comment inside the `<iframe>` attribute list does not parse** (Solid's JSX allows an expression container between attributes in most setups but it is not worth a fight), move that comment above the element. The `sandbox` attribute itself is not optional: R11 rules it, and the test asserts it.

- [ ] **Step 5: Write `BlocksPage.tsx`**

```tsx
/**
 * The /blocks page: hero, category strip, one card per block, stacked.
 *
 * PURE VIEW. It takes the registry items and a loader, so the tests drive the
 * layout without a network mock. The fetching lives in BlocksIsland.tsx.
 *
 * The framework choice is GLOBAL across every card and sticky per viewer.
 *
 * The `.blocks-page` full-width marker is NOT here: it is server-rendered in
 * blocks.mdx, because :root:has(.blocks-page) has to match at first paint and
 * a client:only island renders nothing on the server.
 */
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { BlockCard } from './BlockCard';
import {
  previewFooter,
  readFramework,
  writeFramework,
  type BlockFormId,
  type FormPayload,
  type RegistryItem,
} from '../../lib/blocks-source';

export interface BlocksPageProps {
  items: RegistryItem[];
  loadForm: (id: string, form: BlockFormId) => Promise<FormPayload>;
}

export function BlocksPage(props: BlocksPageProps): JSX.Element {
  const [framework, setFramework] = createSignal<BlockFormId>(readFramework());
  const [category, setCategory] = createSignal('all');

  const categories = createMemo(() => {
    const seen: string[] = [];
    for (const item of props.items) {
      for (const c of item.categories) if (!seen.includes(c)) seen.push(c);
    }
    return ['all', ...seen];
  });

  const visible = createMemo(() =>
    category() === 'all'
      ? props.items
      : props.items.filter((item) => item.categories.includes(category())),
  );

  const chooseFramework = (form: BlockFormId): void => {
    setFramework(form);
    writeFramework(form);
  };

  return (
    <div class="mx-auto w-full max-w-6xl px-4 py-10">
      <header class="mb-8">
        <h1 class="text-3xl font-black tracking-tight text-ink">Blocks</h1>
        <p class="mt-2 max-w-2xl text-ink-2">
          Complete compositions built from kai elements. Preview one, read the files it writes,
          then run the command. Nothing here is a dependency: the files land in your project and
          they are yours.
        </p>
      </header>

      <nav aria-label="Block categories" class="mb-6 flex flex-wrap gap-1">
        <For each={categories()}>
          {(c) => (
            <button
              type="button"
              data-testid="category"
              data-category={c}
              aria-pressed={category() === c}
              class={
                category() === c
                  ? 'rounded-md bg-surface-2 px-2.5 py-1 text-sm font-medium capitalize text-ink'
                  : 'rounded-md px-2.5 py-1 text-sm capitalize text-ink-2 transition-colors hover:text-ink'
              }
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          )}
        </For>
      </nav>

      <Show
        when={visible().length > 0}
        fallback={<p class="text-sm text-ink-2">No blocks in this category.</p>}
      >
        <div class="flex flex-col gap-8">
          <For each={visible()}>
            {(item) => (
              <BlockCard
                item={item}
                framework={framework()}
                onFramework={chooseFramework}
                loadForm={props.loadForm}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Which kit the previews above are running, in words. The production
          page proves the PUBLISHED artifact works cold; a local preview looks
          identical and proves nothing, so the page says which it is. */}
      <p data-testid="preview-footer" class="mt-10 text-xs text-ink-3">
        {previewFooter()}
      </p>
    </div>
  );
}
```

**Note on the category chips:** every chip carries `data-testid="category"` (so the strip can be read as a list) and `data-category="<value>"` (so one chip can be selected without a per-value test id). Both assertions are load-bearing: the strip is DERIVED from the items, and selecting one filters in place rather than navigating.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-page.test.tsx`
Expected: PASS, every describe.

**Where the assertions look:** `kai-*` elements do not upgrade in jsdom, so the tests read the PROPERTIES the effects set (`treeEl.files`, `selectEl.options`, `selectEl.value`, `codeEl.copy`) and dispatch the elements' own non-bubbling events to drive them. That is the correct level: this page's job is to set the right properties on the right elements and listen on the elements themselves, and the elements' rendering is `packages/ui`'s suite.

**If `offers exactly the renderers` or `re-sets the tree` is red, the refs are the suspect, not the test.** Both are the finding this task's signal-refs exist to close: an effect that reads no signal other than a `let` ref runs once, at mount, against an element inside a `<Show>` that does not exist yet.

- [ ] **Step 7: Typecheck**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs run typecheck:blocks`
Expected: exit 0, with `kai-jsx.d.ts` from Step 1 in the project's `include`.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add apps/docs/src/components/blocks apps/docs/test/blocks-page.test.tsx apps/docs/tsconfig.blocks.json
git commit -m "$(cat <<'MSG'
feat(docs): the /blocks card and page, built from kai elements

Title and description on one line, one contextual toolbar whose height is
reserved so a mode swap moves nothing, the add-command pill on the right in
both modes, and a project-shaped file tree whose displayed path is
FormFile.target byte for byte. The framework choice is global and sticky. A
form that will not load says so on the card instead of quietly narrowing the
menu.

The element refs are SIGNALS. Every property-carrying element lives inside a
Show and is re-created on each mode change, so an effect over a plain ref
would run once at mount against undefined: the framework select would never
receive its options and a second visit to code mode would leave a fresh file
tree empty.

Ships highlighted but not line-numbered: kai-code-block has no line-number
prop. Filed as a kit ticket rather than faked with a gutter the element cannot
measure.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

## Task 6: The page, the topic, and the site build

**Files:**
- Create: `apps/docs/src/components/blocks/BlocksIsland.tsx`
- Create: `apps/docs/src/content/docs/blocks.mdx`
- Modify: `apps/docs/src/topics.mjs`
- Modify: `apps/docs/src/styles/app.css`

**Interfaces:**
- Consumes: `BlocksPage` (Task 5), `registryUrl`/`formUrl` (Task 3), `loadKit` from `apps/docs/src/components/example/kit.ts`.
- Produces: the route `/blocks/`, reachable from the header nav and the mobile topics menu.

- [ ] **Step 1: Write the island**

`apps/docs/src/components/blocks/BlocksIsland.tsx`:

```tsx
/**
 * The data shell for /blocks. Loads the kit (so the kai-* elements are
 * defined before any property is set -- the upgrade race the site's kit.ts
 * exists to close), fetches the static registry the prebuild copied into
 * public/, and hands both to the pure view.
 *
 * The registry is STATIC FILES the site serves: /blocks/registry.json and
 * /blocks/f/<id>.<form>.json. Nothing is generated here; that happens once,
 * in packages/ui/scripts/gen-blocks.mjs, during the kit build.
 */
import { createResource, Show, type JSX } from 'solid-js';
import { loadKit } from '../example/kit';
import { BlocksPage } from './BlocksPage';
import { formUrl, registryUrl, type BlockFormId, type FormPayload, type RegistryItem } from '../../lib/blocks-source';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}

async function boot(): Promise<RegistryItem[]> {
  await loadKit();
  const index = await fetchJson<{ items: RegistryItem[] }>(registryUrl());
  return index.items;
}

const loadForm = (id: string, form: BlockFormId): Promise<FormPayload> =>
  fetchJson<FormPayload>(formUrl(id, form));

export default function BlocksIsland(): JSX.Element {
  const [items] = createResource(boot);
  return (
    <Show
      when={items()}
      fallback={
        <p class="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-ink-2">
          {items.error ? `Could not load the block registry: ${String(items.error)}` : 'Loading blocks...'}
        </p>
      }
    >
      {(list) => <BlocksPage items={list()} loadForm={loadForm} />}
    </Show>
  );
}
```

- [ ] **Step 2: Write the page**

`apps/docs/src/content/docs/blocks.mdx`:

```mdx
---
title: Blocks
description: Complete compositions built from kai elements. Preview one, read the files it writes, then run the command.
template: splash
tableOfContents: false
---

import BlocksIsland from '../../components/blocks/BlocksIsland.tsx';

{/* SERVER-rendered marker, the same as `.landing-page` and `.kai-fullscreen`.
    `:root:has(.blocks-page)` has to match at FIRST PAINT or the page renders
    as a normal splash content column and jumps to full width when the island
    mounts. `client:only="solid"` renders nothing on the server, so the marker
    cannot live inside the island. */}
<div class="blocks-page not-content">
  <BlocksIsland client:only="solid" />
</div>
```

`template: splash` is what removes the sidebar. `Header.astro` gates its mobile disclosure on the same `hasSidebar` flag, so a splash page gets the mobile topics menu rather than losing navigation below the nav breakpoint -- that is what #367 fixed and this page inherits it.

- [ ] **Step 3: Add the topic**

In `apps/docs/src/topics.mjs`, after the `Examples` entry and before `Integrations`:

```js
  {
    label: 'Blocks',
    link: '/blocks/',
    id: 'blocks',
    items: [{ label: 'Blocks', slug: 'blocks' }],
  },
```

One list, two consumers: `astro.config.mjs` gives it to `starlight-sidebar-topics` and `Header.astro` renders it as the nav. The page itself is `template: splash` and shows no sidebar; the entry is what makes `/blocks` a section of the site rather than an orphan page.

- [ ] **Step 3b: Re-measure `--breakpoint-nav`, because this entry invalidates it**

`apps/docs/src/styles/app.css` defines `--breakpoint-nav` with a comment saying it is the MEASURED width at which the header row stops fitting, for **logo plus five section links** plus the right-hand cluster. This task adds a sixth section link, so the measured value is now a claim about a header that no longer exists. This is the #361 / #367 class exactly: a nav change that shipped invisible because nobody looked at more than one width, and the memory file says header changes need a multi-width pass.

Re-measure the way the comment describes:

```bash
cd "$WT" && pnpm --filter @kitn.ai/docs run dev
```

In a browser, narrow the window until the nav row first collides (the section links touching the search cluster, or the row wrapping), read the viewport width, convert to rem at the site's root font size, and set `--breakpoint-nav` to that value rounded up to the nearest whole rem. Update the comment with the new composition ("logo + six sections + ...") so the next person is not measuring against a stale sentence.

Then confirm both sides of the new line: just above it the six links and the tools are all visible with no overlap; just below it the links are gone and the header's `<details>` topics menu is the navigation and contains Blocks. Task 10 shoots both widths.

- [ ] **Step 4: Add the full-width CSS**

In `apps/docs/src/styles/app.css`, after the `.landing-page` block:

```css
/* The blocks index is a scrolling page of full-width cards inside the splash
   shell, the same shape as the landing page: the marker widens the content
   column to the viewport and zeroes its padding so the page controls its own
   inner max-width. Header and footer stay.
   The `.blocks-page` marker is SERVER-rendered in blocks.mdx, like the two
   above it: `:has()` must match before hydration or the page paints narrow
   and then jumps, and the island is client:only. */
:root:has(.blocks-page) { --sl-content-width: 100%; --sl-content-pad-x: 0rem; }
body:has(.blocks-page) .content-panel { padding: 0; border: 0; }
body:has(.blocks-page) .sl-markdown-content { margin: 0; }
/* Starlight renders the frontmatter title as an <h1>; the page supplies its
   own hero heading. */
body:has(.blocks-page) h1#_top { display: none; }
```

- [ ] **Step 5: Watch the build fail without the copy, then pass with it**

```bash
cd "$WT" && rm -rf apps/docs/public/blocks apps/docs/src/generated
cd "$WT" && pnpm --filter @kitn.ai/docs exec astro build; echo "exit=$?"
```

Expected: non-zero, failing to resolve `../generated/blocks-preview`. **That is the coupling announcing itself:** the page cannot build without the prebuild copy, which is exactly what you want, because the alternative is a page that builds and serves a registry that is not there.

```bash
cd "$WT" && pnpm --filter @kitn.ai/docs run build
cd "$WT" && ls apps/docs/dist/blocks/index.html apps/docs/dist/blocks/registry.json
cd "$WT" && ls apps/docs/dist/blocks/f | head
```

Expected: exit 0; the page and the copied artifacts both under `dist/blocks/`.

**The route and the public directory coexist, and the mechanism is explicit.** Astro's `checkPublicConflict` (in `node_modules/astro/dist/core/build/generate.js`) computes each generated page's own output path relative to `outDir` -- `blocks/index.html` for `/blocks/` under Starlight's default `trailingSlash` -- and skips generating the page ONLY if a file exists at exactly that path under `publicDir`. `public/blocks/` holds `registry.json`, `r/`, `f/` and, in local mode, `local/` and `kit/`, and **never an `index.html`**, so the page is generated and the public tree is copied alongside it into `dist/blocks/`. In dev the same path-exact rule applies: `/blocks/` falls through to the route while `/blocks/registry.json` is served from `public/`.

**Two things follow, and both are rules for this plan, not observations.** Never write a `public/blocks/index.html`, and never point the local-mode kit copy at `public/blocks/` root (it goes to `public/blocks/kit/`, which Task 2 does). The `ls` above is the confirmation, and it is worth keeping: if a future Astro changes that rule the build goes red here rather than silently dropping the page. The contingency if it ever does: move the artifacts to `public/blocks-registry/`, changing the three URL builders in `blocks-source.ts` and `previewDir` in `copy-blocks.mjs`.

- [ ] **Step 6: Run the docs alignment guard**

Run: `cd "$WT" && pnpm --filter @kitn.ai/docs run verify:docs`
Expected: exit 0. It scans `src/content/docs/**` and checks MDX component imports, markup and prose against the shipped API. A finding on the new page is this task's to fix.

- [ ] **Step 7: Look at it, in both modes**

```bash
cd "$WT" && KAI_BLOCKS_KIT=local pnpm --filter @kitn.ai/docs run dev
```

Open `http://localhost:4321/blocks/`. Confirm by eye: the cards stack, the toolbar does not reflow between Preview and Code, each card's command names its own block, the file tree shows full project paths, and the footer says the LOCAL build. Then stop the server, run it again without `KAI_BLOCKS_KIT`, and confirm the footer says jsDelivr and the previews still render. **Screenshots come in Task 10; this is the smoke check.**

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add apps/docs/src/components/blocks/BlocksIsland.tsx apps/docs/src/content/docs/blocks.mdx apps/docs/src/topics.mjs apps/docs/src/styles/app.css
git commit -m "$(cat <<'MSG'
feat(docs): /blocks lands on the site as a section

A splash-template page mounting the Solid island, plus the topics entry that
puts Blocks in the header nav and the mobile menu together (one list, two
consumers). The island loads the kit before setting a single property, then
serves the registry the prebuild copied: static files, nothing regenerated at
request time.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

## Task 7: The two guards over the BUILT site

**Files:**
- Create: `apps/docs/scripts/verify-preview-source.mjs`
- Create: `apps/docs/test/blocks-targets.test.ts`
- Modify: `apps/docs/package.json`

**Interfaces:**
- Consumes: `apps/docs/dist/**` (a production build), `packages/ui/dist/blocks/f/*.json`, `installRoot`/`fileTarget` from `@kitn.ai/blocks/targets`, `packages/ui/package.json`'s `version`.
- Produces: `pnpm --filter @kitn.ai/docs run verify:preview` (with `--self-test`), and the spec 5.4 site-path test.

- [ ] **Step 1: Write the spec 5.4 site-path test**

`apps/docs/test/blocks-targets.test.ts`:

```ts
/**
 * Spec 5.4: the path /blocks DISPLAYS equals the path `create-kai add` WRITES,
 * for every block and every framework. Both sides read src/targets.ts, so this
 * is cheap and it is the guard on the section 3.4 ruling.
 *
 * It reads the GENERATED artifacts rather than a fixture, because the page
 * reads those exact files: dist/blocks/f/<id>.<form>.json, whose FormFile.target
 * is what BlockCard renders into the tree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { FRAMEWORK_BLOCK_FORMS } from '@kitn.ai/blocks/forms';
import { fileTarget, isTargetFramework } from '@kitn.ai/blocks/targets';

const require = createRequire(import.meta.url);
const kitRoot = dirname(require.resolve('@kitn.ai/ui/package.json'));
const formsDir = join(kitRoot, 'dist', 'blocks', 'f');

const blockIds = (() => {
  const index = JSON.parse(readFileSync(join(kitRoot, 'dist', 'blocks', 'registry.json'), 'utf8'));
  return (index.items as { name: string }[]).map((i) => i.name);
})();

describe('the displayed path is the written path', () => {
  it('there is at least one block and one framework -- neither axis may be empty', () => {
    expect(blockIds.length).toBeGreaterThan(0);
    expect(FRAMEWORK_BLOCK_FORMS.length).toBeGreaterThan(0);
    expect(readdirSync(formsDir).length).toBe(blockIds.length * FRAMEWORK_BLOCK_FORMS.length);
  });

  for (const id of blockIds) {
    for (const form of FRAMEWORK_BLOCK_FORMS) {
      it(`${id} x ${form.id}: every FormFile.target equals fileTarget()`, () => {
        // Narrow with the guard rather than casting: a renderer whose id is
        // not in the install-root table has no target to compare against, and
        // `as never` would hide exactly that.
        if (!isTargetFramework(form.id)) {
          throw new Error(
            `${form.id} is a renderer with no row in targets.ts INSTALL_ROOTS, so the page would display a path the CLI cannot write`,
          );
        }
        const payload = JSON.parse(readFileSync(join(formsDir, `${id}.${form.id}.json`), 'utf8'));
        expect(payload.files.length).toBeGreaterThan(0);
        for (const file of payload.files as { path: string; target: string }[]) {
          expect(file.target).toBe(fileTarget(form.id, id, file.path));
        }
      });
    }
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Plant the failure first, so the assertion is known to bite:

```bash
cd "$WT" && node -e "
const p='packages/ui/dist/blocks/f/support-widget.react.json';
const fs=require('fs'); const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.files[0].target='src/blocks/support-widget/'+j.files[0].path;
fs.writeFileSync(p+'.bak', fs.readFileSync(p)); fs.writeFileSync(p, JSON.stringify(j,null,2));
"
cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-targets.test.ts; echo "exit=$?"
cd "$WT" && mv packages/ui/dist/blocks/f/support-widget.react.json.bak packages/ui/dist/blocks/f/support-widget.react.json
cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-targets.test.ts
```

Expected: red on the planted `src/blocks/...` target naming the file, then green. **This is the drift the ruling exists to stop: the page telling a reader a file lands somewhere the command does not put it.**

- [ ] **Step 3: Write the preview-source guard**

`apps/docs/scripts/verify-preview-source.mjs`:

```js
// THE PRODUCTION BUILD PREVIEWS THE PUBLISHED KIT. Spec 5.6.
//
// The two preview modes look identical on screen and only one of them proves
// anything: the production page is the standing evidence that a pasted block
// runs cold off the CDN. The failure this catches is KAI_BLOCKS_KIT=local
// leaking into a deploy, which looks perfect, serves a kit path that is not
// deployed, and quietly retires the proof while the footer still claims it.
//
//   node scripts/verify-preview-source.mjs
//   node scripts/verify-preview-source.mjs --self-test   # prove it detects
//
// Runs over apps/docs/dist AFTER a production build. It never skips: a missing
// dist is a hard failure, because "no build to check" is how a guard that
// proves nothing looks from the outside.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');
const SELF_TEST = process.argv.includes('--self-test');

const require = createRequire(import.meta.url);
const version = JSON.parse(
  readFileSync(require.resolve('@kitn.ai/ui/package.json'), 'utf8'),
).version;

const CDN_PIN = `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${version}/dist/`;
// The two path markers are scanned across the whole built site: neither string
// has any innocent reason to appear in a deployed page.
const LOCAL_MARKERS = ['/blocks/kit/', '/blocks/local/'];
// `packages/ui/dist` is the FOOTER's words, not a path, and a guide sentence
// mentioning that directory would otherwise turn a docs edit into a red
// preview-source gate with a misleading message. So it is scanned only where
// the footer can be: the block artifacts and the chunk carrying the footer
// string. Scoped deliberately -- see FOOTER_SCOPE below.
const FOOTER_MARKER = 'previewing the local build of packages/ui/dist';

/** Every file under a directory, recursively. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** The checks, as a pure function over a virtual tree, so --self-test can
 *  plant a defect without touching the real build. */
export function check(files, cdnPin, localMarkers, footerMarker) {
  const problems = [];
  const previews = files.filter((f) => f.path.endsWith('.cdn.html'));

  if (previews.length === 0) {
    problems.push(
      'no <id>.cdn.html under dist/blocks/r/. The production preview IS the pinned CDN form, so zero of them means the prebuild copy did not run or the build ran in local mode.',
    );
  }
  for (const preview of previews) {
    if (!preview.content.includes(cdnPin)) {
      problems.push(
        `${preview.path} does not import ${cdnPin}. A production preview that is not pinned to the published version proves nothing about the published artifact.`,
      );
    }
  }

  if (files.some((f) => f.path.includes('/blocks/local/'))) {
    problems.push('dist/blocks/local/ exists: this build ran with KAI_BLOCKS_KIT=local.');
  }
  if (files.some((f) => f.path.includes('/blocks/kit/'))) {
    problems.push('dist/blocks/kit/ exists: this build shipped a local copy of the kit.');
  }

  const text = files.filter((f) => /\.(html|js|css|json)$/.test(f.path));
  for (const marker of localMarkers) {
    const hit = text.find((f) => f.content.includes(marker));
    if (hit) {
      problems.push(
        `${hit.path} carries the local-preview path "${marker}". A deployed page must load the kit from the CDN pin, never from a path that only exists in a working tree.`,
      );
    }
  }

  // The footer's own words, scanned only where the footer can be rendered
  // from: any chunk that carries the word "previewing". A prose page that
  // happens to mention packages/ui/dist is not this guard's business.
  const footerCarriers = text.filter((f) => f.content.includes('previewing'));
  const localFooter = footerCarriers.find((f) => f.content.includes(footerMarker));
  if (localFooter) {
    problems.push(
      `${localFooter.path} carries the LOCAL footer text ("${footerMarker}"). The deployed page must say it is previewing the published kit, because that is what it is doing and the claim is the whole point of the production preview.`,
    );
  }

  const footer = text.find((f) => f.content.includes('from jsDelivr'));
  if (!footer) {
    problems.push(
      'no built asset carries the words "from jsDelivr". The footer states the preview source in words and the deployed one must say the published kit.',
    );
  }

  return problems;
}

function loadTree() {
  if (!existsSync(DIST)) {
    console.error(
      `\nx preview source: ${DIST} does not exist. Build the site first: pnpm --filter @kitn.ai/docs run build\n`,
    );
    process.exit(1);
  }
  return walk(DIST).map((path) => ({
    path: path.slice(DIST.length),
    content: /\.(html|js|css|json)$/.test(path) ? readFileSync(path, 'utf8') : '',
  }));
}

if (SELF_TEST) {
  const good = [
    { path: '/blocks/r/x.cdn.html', content: `<script type="module">import '${CDN_PIN}elements/autoloader.js';</script>` },
    { path: '/_astro/page.js', content: 'const f = "previewing @kitn.ai/ui@1.2.3 from jsDelivr";' },
  ];
  const cleanRun = check(good, CDN_PIN, LOCAL_MARKERS, FOOTER_MARKER);
  if (cleanRun.length !== 0) {
    console.error('x self-test: the clean tree was reported as broken:', cleanRun);
    process.exit(1);
  }
  const planted = [
    [{ ...good[0], content: '<script type="module">import "/blocks/kit/elements/autoloader.js";</script>' }, good[1]],
    [good[0], { path: '/blocks/local/x.html', content: '' }, good[1]],
    [good[0], { path: '/_astro/page.js', content: 'const f = "previewing the local build of packages/ui/dist";' }],
    [good[1]],
  ];
  for (const [i, tree] of planted.entries()) {
    const problems = check(tree, CDN_PIN, LOCAL_MARKERS, FOOTER_MARKER);
    if (problems.length === 0) {
      console.error(`x self-test: planted defect ${i + 1} was NOT detected.`);
      process.exit(1);
    }
    console.log(`  self-test ${i + 1}: detected -- ${problems[0]}`);
  }
  console.log('\nok preview source --self-test: 4 planted defects, all detected.\n');
  process.exit(0);
}

const problems = check(loadTree(), CDN_PIN, LOCAL_MARKERS, FOOTER_MARKER);
if (problems.length > 0) {
  console.error('\nx preview source:\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}
console.log(`ok preview source: every /blocks preview pins ${CDN_PIN}, and no local kit path ships.`);
```

Add to `apps/docs/package.json` scripts: `"verify:preview": "node scripts/verify-preview-source.mjs"`.

- [ ] **Step 4: Watch the self-test, then the real run, then a real red**

```bash
cd "$WT" && pnpm --filter @kitn.ai/docs run verify:preview -- --self-test
cd "$WT" && pnpm --filter @kitn.ai/docs run build
cd "$WT" && pnpm --filter @kitn.ai/docs run verify:preview
```

Expected: the self-test prints four detections and exits 0; the real run exits 0.

Now the end-to-end red, which is the one that matters:

```bash
cd "$WT" && KAI_BLOCKS_KIT=local pnpm --filter @kitn.ai/docs run build
cd "$WT" && pnpm --filter @kitn.ai/docs run verify:preview; echo "exit=$?"
cd "$WT" && pnpm --filter @kitn.ai/docs run build
cd "$WT" && pnpm --filter @kitn.ai/docs run verify:preview
```

Expected: `exit=1` naming `dist/blocks/local/` and the local marker, then green again after the production rebuild. **A guard nobody has watched fail on the real artifact is not evidence.**

- [ ] **Step 5: Commit**

```bash
cd "$WT" && git add apps/docs/scripts/verify-preview-source.mjs apps/docs/test/blocks-targets.test.ts apps/docs/package.json
git commit -m "$(cat <<'MSG'
feat(docs): guard the preview source and the displayed path

verify:preview runs over the built site and refuses a deploy whose previews
carry a local kit path, whose CDN pin is not the published version, or whose
footer does not say jsDelivr. It never skips: a missing dist is a hard
failure. Its --self-test plants four defects and watches each detected.

The site-path test is spec 5.4: for every block and every framework, the
FormFile.target the page displays equals fileTarget() from the one install-root
table create-kai add writes through.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

## Task 8: Retire the gallery

**Files:**
- Delete: `packages/ui/apps/gallery/` (all six files)
- Modify: `packages/ui/package.json` (drop `KAI_BUILD=gallery ...` from `build`)
- Modify: `packages/ui/config/vite/page.ts` (drop the `gallery` entry)
- Modify: `packages/ui/mcp/construct/dev.ts`
- Modify: `packages/ui/mcp/construct/dev.test.ts`
- Modify: `packages/ui/tsconfig.apps.json`, `packages/ui/scripts/story-roots.mjs`, `packages/ui/scripts/lint-catalog-drift.mjs` (comments naming three apps / the gallery story)
- Modify: `packages/ui/scripts/verify-pack-weight.mjs` (the ledger row and the ceiling)

**Interfaces:**
- Removes: `galleryPageDir`, `galleryPreviewHtml`, `crc32`, `storeZip`, `GalleryDirs`, `GalleryResponse`, `handleGalleryRequest` from `packages/ui/mcp/construct/dev.ts`.
- Keeps: `packages/ui/scripts/block-driver/serve.mjs` and its own `/kit/` mount, untouched. **These are different mounts. Deleting the wrong one takes `verify:blocks [driver]` with it.**

- [ ] **Step 1: Find every reference before deleting anything**

```bash
cd "$WT" && grep -rn "apps/gallery\|dist/gallery\|KAI_BUILD=gallery\|/gallery" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  packages apps .github docs/coupling-map.md | grep -v "^docs/superpowers/"
```

Record the list in the task report. Everything on it is either deleted, edited, or explained in this task.

- [ ] **Step 2: Delete the app and its build entry**

```bash
cd "$WT" && git rm -r packages/ui/apps/gallery
```

In `packages/ui/package.json`, remove ` && KAI_BUILD=gallery vite build --config config/vite/page.ts` from the `build` script. In `packages/ui/config/vite/page.ts`, remove the `gallery` entry from the pages map and any prose in the file header that names three pages.

In `packages/ui/tsconfig.apps.json`, the `comment` says "the three shipped dev-tool apps (apps/builder, apps/theme-studio, apps/gallery)". Two remain; fix the sentence.

In `packages/ui/scripts/story-roots.mjs` and `packages/ui/scripts/lint-catalog-drift.mjs`, both comments cite `apps/gallery/GalleryPage.stories.tsx` as the reason the `apps/` root is walked. The reason is still true (the glob is still there and `apps/` still exists); the EXAMPLE is gone. Rewrite each to name the glob rather than a file that no longer exists.

- [ ] **Step 3: Delete the dev-server routes**

In `packages/ui/mcp/construct/dev.ts`, delete:

- `galleryPageDir()` and its `resolveBuilderPageDir(..., 'gallery')` call (around line 600).
- The whole gallery route section: the `blockFromRegistryItem`/`isBlockName` helpers ONLY IF nothing else uses them (`grep -n "blockFromRegistryItem\|isBlockName" packages/ui/mcp/construct/dev.ts` before deleting either), `galleryPreviewHtml`, `CRC_TABLE`, `crc32`, `storeZip`, `GalleryDirs`, `GalleryResponse`, `handleGalleryRequest`, and the `GALLERY_REBUILD` message constant.
- In `createDevServer`: `cachedGalleryDirs`, `galleryDirs()`, the `handleGalleryRequest` dispatch block, and the `block gallery at http://localhost:.../gallery/` startup log.
- **The `/kit/` CORS mount inside `handleGalleryRequest` goes with it.** The `/theme-studio/kit/` mount is a DIFFERENT one and stays.

This is R10 in force: `kai dev` keeps no blocks route at all.

- [ ] **Step 4: Delete the tests that covered them**

In `packages/ui/mcp/construct/dev.test.ts`, delete the three describes: `the gallery route table`, `storeZip`, and `the gallery preview serializer seam`, plus the now-unused imports on the `from './dev'` line and the `galleryFixture()` helper if nothing else calls it.

**Deleting a test with the code it guarded is correct here and should be said out loud in the commit body.** A test kept alive past the thing it guarded is worse than no test.

- [ ] **Step 5: Run the suites and watch them go green, not silent**

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/construct/dev.test.ts
cd "$WT" && pnpm exec nx typecheck ui --skip-nx-cache
cd "$WT/packages/ui" && npm run build
cd "$WT" && test -d packages/ui/dist/gallery && echo "STILL THERE" || echo "gone"
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
```

Expected: the dev suite green with FEWER tests than before (compare against `$SCRATCH/pr-c/baseline/`); typecheck green with `--skip-nx-cache`, which is not optional because this repo has recorded the nx cache returning a cached green over code carrying a real TS error; `dist/gallery` gone after a fresh build; and **`verify:blocks` still green, which is what proves the block driver's own `/kit/` mount was not the one deleted.**

- [ ] **Step 6: Amend the pack-weight ledger with a MEASURED number**

```bash
cd "$WT/packages/ui" && npm run verify:pack 2>&1 | tee "$SCRATCH/pr-c/after-verify-pack.txt"
```

Read the `pack weight` line it prints: it carries the file count and the measured unpacked MiB under the current ceiling. Then:

- Lower `MAX_UNPACKED_BYTES` to the measured size plus the file's own standing margin rule -- **read that rule from the entries above it rather than from here** (the entries state it and the number is theirs, not this plan's), and round to the same grain those entries use.
- Amend the `10.60 -> 11.85 MiB (2026-08-31, the gallery + blocks builder surface)` entry: it recorded `dist/gallery/` and `dist/blocks/` together, and only the first half is going. Add a new dated entry BELOW it in the same voice: what was removed (`dist/gallery/`, the prebuilt page `kai dev --builder` served at `/gallery/`, retired with the page by PR C), what stayed (`dist/blocks/`, which the site and the CLI both read), the measured before and after read off this tool, and the margin rule applied. **Every number in it comes from `$SCRATCH/pr-c/after-verify-pack.txt` and `$SCRATCH/pr-c/baseline/verify-pack.txt`. Do not type one.**

```bash
cd "$WT/packages/ui" && npm run verify:pack
```

Expected: green against the NEW, lower ceiling. Then confirm the ceiling actually bites:

```bash
cd "$WT" && node -e "
const fs=require('fs'); const p='packages/ui/scripts/verify-pack-weight.mjs';
const s=fs.readFileSync(p,'utf8'); fs.writeFileSync(p+'.bak',s);
fs.writeFileSync(p, s.replace(/const MAX_UNPACKED_BYTES = [0-9.]+/, 'const MAX_UNPACKED_BYTES = 0.1'));
"
cd "$WT/packages/ui" && npm run verify:pack; echo "exit=$?"
cd "$WT" && mv packages/ui/scripts/verify-pack-weight.mjs.bak packages/ui/scripts/verify-pack-weight.mjs
```

Expected: `exit=1` on rule 2 naming the overage. A ceiling nobody has watched fire is a number, not a guard.

- [ ] **Step 7: Sweep the word "gallery" out of prose that now lies**

```bash
cd "$WT" && grep -rn "gallery" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  packages apps .github | grep -v "^docs/"
```

Owner ruling: **blocks, never gallery, everywhere, in code and prose.** Every surviving hit is either (a) a comment or message that should now say "blocks" or name `/blocks`, or (b) a genuine historical record, which stays and says so. Fix (a); list (b) in the task report with the reason each stays.

**These sites are named because they are load-bearing prose and two of them the grep above cannot reach.** Each is a sentence that becomes FALSE the moment the gallery is gone, so leaving one is not untidiness, it is a document telling the next reader about a page that does not exist:

| File | What it says now |
|---|---|
| `packages/blocks/package.json` `description` | "bundled into create-kai and the packages/ui/apps/gallery page served by kai dev; the docs site is a future consumer". After this PR the docs site is THE consumer and the gallery is gone. Rewrite both halves. |
| `packages/blocks/src/forms/index.ts` header (the "ONE RENDERER, TWO CALLERS" block) and the `GET /gallery/api/form/` sentence | its central claim is stated as "what the gallery shows is byte-for-byte what add writes". The claim survives; the surface is now `/blocks` and the `f/` artifacts. |
| `packages/blocks/src/registry.ts` header and the `buildRegistryItem` comment | names the gallery as an item-JSON consumer |
| `packages/ui/scripts/gen-blocks.mjs` | the `dist/blocks/r/` comment naming "CLI, gallery, MCP", and the "the kai dev gallery route" note on the strip |
| `packages/ui/scripts/verify-blocks.mjs` and `verify-blocks-react.mjs` | "a broken walk, not an empty gallery" -- rewrite to "not an empty registry" |
| `docs/coupling-map.md` (the block-twin row's justification) | "the gallery shows byte-for-byte what `add` writes". **Outside the grep above and outside Task 9's named edits**, which is exactly why it is listed here. |

Re-run the grep afterwards, and add the coupling map to it:

```bash
cd "$WT" && grep -rn "gallery" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  packages apps .github docs/coupling-map.md | grep -v "^docs/superpowers/"
```

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add -A packages/ui
git commit -m "$(cat <<'MSG'
refactor(ui)!: retire the blocks gallery; /blocks on the docs site replaces it

The predecessor goes whole: packages/ui/apps/gallery, the KAI_BUILD=gallery
page build, dist/gallery, and every /gallery route in the construct dev server
along with the /kit/ CORS mount its previews imported from. kai dev keeps no
blocks route at all (spec 2.5's open item, recommendation taken): the public
page is the shop window and the CDN preview is the standing proof the
published form runs cold, and a second locally-served copy is a second thing
to keep true.

The block driver's own /kit/ mount in scripts/block-driver/serve.mjs is a
different mount and is untouched; verify:blocks proves it.

The dev-server tests covering those routes are deleted WITH them. A test kept
alive past the thing it guarded is worse than no test.

Removing dist/gallery from the tarball lowers the pack-weight ceiling; the
ledger entry carries the measurement read off verify:pack, before and after.

BREAKING CHANGE: `kai dev` no longer serves /gallery or the /kit/ mount, and
the construct dev server no longer exports handleGalleryRequest,
galleryPreviewHtml, galleryPageDir, storeZip or crc32. Browse blocks at
https://ui.kitn.ai/blocks.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

## Task 9: CI, and the couplings

**Files:**
- Modify: `.github/workflows/test.yml` (the `dist-guards` leg)
- Modify: `docs/coupling-map.md`

**Interfaces:**
- Produces: four new steps in the required graph. After this task, `node packages/ui/scripts/lint-gate-parity.mjs --list` prints them.

- [ ] **Step 1: Add the steps**

They go in the `dist-guards` leg, which already downloads the kit build (so `packages/ui/dist/blocks/` is present for the copy) and already runs `verify:docs`. Insert immediately after the `Docs alignment` step:

```yaml
      # The /blocks section. The site is built in deploy-docs.yml on main, so
      # until now nothing built it on a PR: a page that fails to compile shipped
      # green through the gate and broke the deploy. These four steps close
      # that, in the leg that already has the kit dist the prebuild copies.
      - name: Docs site tests (the /blocks island, its axis and its targets)
        run: pnpm --filter @kitn.ai/docs run test

      - name: Docs /blocks typecheck (vitest transpiles, it does not check)
        run: pnpm --filter @kitn.ai/docs run typecheck:blocks

      # `pnpm --filter ... run build`, NOT `nx build docs`: the nx target
      # depends on ^build and would rebuild the kit this leg already downloaded.
      # KAI_BLOCKS_KIT is deliberately unset here -- this is the production
      # build shape, and the step after it is what proves that.
      - name: Docs site build (astro, with the blocks prebuild copy)
        run: pnpm --filter @kitn.ai/docs run build

      - name: Preview source guard (the deployed page pins the published kit)
        run: pnpm --filter @kitn.ai/docs run verify:preview
```

Note that `pnpm --filter @kitn.ai/docs run test` needs `apps/docs/test/blocks-targets.test.ts`'s inputs -- `packages/ui/dist/blocks/**` -- which the `kit-dist` artifact carries and this leg has already restored.

- [ ] **Step 2: Watch the gate-parity guard accept them, and watch it reject a bad shape**

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs --list | grep docs
```

Expected: exit 0, and the four new identifiers printed. If the parity guard reports an unrecognised `run:` shape, the step's command is the problem, not the guard: keep it to `pnpm --filter <pkg> run <script>`.

- [ ] **Step 3: Register the couplings**

In `docs/coupling-map.md`:

- **Delete** the `packages/ui/apps/**` module-graph bullet's mention of `gallery` (two apps remain), and the gallery clause in the `packages/blocks/package.json` exports row (its bundler consumers are now create-kai's CLI bundle, Storybook's builder and the Astro build of `/blocks`). Task 8 Step 7 already rewrote the block-twin row's "the gallery shows byte-for-byte what `add` writes"; confirm it here rather than assuming, since this file is outside that step's original grep.
- **Add** the five rows spec section 8 specifies, verbatim in intent, in §10 (`Blocks and the facades that still paint their own copies`), except the `targets.ts` row which section 8 says belongs in §4 (derived lists):

<!-- gate-list: partial -- the coupling rows PR C adds, not an enumeration of the CI gate set; the gate set is what `node packages/ui/scripts/lint-gate-parity.mjs --list` prints -->

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| `packages/blocks/src/targets.ts` | the path the `/blocks` file tree displays, and the path `add` writes | the page tells a reader a file lands somewhere it does not; found only after running the command | `apps/docs/test/blocks-targets.test.ts` |
| `packages/ui/package.json` version | the CDN pin in the site's preview iframe | the preview loads a version the CDN does not serve yet, or an old one | `lint:cdn-pins` (equality, not range membership) |
| A block directory added or removed | the `/blocks` category strip, the cell axes of every gate, the CLI listing | a block ships ungated, or the page shows a block the CLI cannot write | the registry scan is the one derivation; `verify:blocks` hard-fails a zero-block scan |
| `KAI_BLOCKS_KIT` | the footer naming the preview source, and whether the deploy previews a kit path that is not deployed | it works, because the path happens to resolve, and the page stops proving the published artifact runs while the footer still claims it does | `apps/docs/scripts/verify-preview-source.mjs`, in the required graph |
| The forms list (`FRAMEWORK_BLOCK_FORMS`) | the site's framework dropdown, the compile-cell axis, `FRAMEWORK_SIGNALS` | the page offers a framework nothing generates | `apps/docs/test/blocks-source.test.ts`; both sides read the forms list |
| Docs deploy vs npm publish ordering | whether the version the site's preview pins is on the CDN when the page goes live | **today they race:** `deploy-docs.yml` and `release-please.yml` both trigger on `push: main` with no ordering between them, so merging a release PR builds the docs against the NEW pin while the publish is still running. Small and self-healing, but during it every `/blocks` preview iframe 404s | **NOTHING.** §1 already records the same two workflows racing for the publish gate; this is its second consequence |

The last row is a real unguarded coupling and it goes in the map SAYING SO rather than being quietly fixed here: fixing it means cross-workflow ordering, which is its own change.

- [ ] **Step 4: Run the full required graph locally**

<!-- gate-list: partial -- the subset this task can move; the merge gate is the graph `node packages/ui/scripts/lint-gate-parity.mjs --list` prints, and CI runs it -->

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:cdn-pins
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:attachment-object-urls
cd "$WT" && pnpm --filter @kitn.ai/docs run test
cd "$WT" && pnpm --filter @kitn.ai/docs run typecheck:blocks
cd "$WT" && pnpm --filter @kitn.ai/docs run build
cd "$WT" && pnpm --filter @kitn.ai/docs run verify:preview
cd "$WT" && pnpm exec nx typecheck ui --skip-nx-cache
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:pack
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
```

Expected: every one exits 0. Anything red here is red in CI.

- [ ] **Step 5: Commit**

```bash
cd "$WT" && git add .github/workflows/test.yml docs/coupling-map.md
git commit -m "$(cat <<'MSG'
ci: build and check the docs site in the required graph

The site was only ever built by deploy-docs.yml on main, so a page that failed
to compile shipped green through the gate and broke the deploy. The dist-guards
leg now runs the docs suite, the scoped /blocks typecheck, the astro build and
the preview-source guard, in the leg that already has the kit dist the
prebuild copies.

Registers PR C's couplings, including the one nothing enforces: the docs deploy
and the npm publish race on a release merge, so the pin the page previews can
briefly not be on the CDN yet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

## Task 10: The visual pass, and the PR

**Files:** none tracked. Screenshots land under `$SCRATCH/pr-c/shots/`.

- [ ] **Step 1: Write the shot script into the scratchpad**

**This file is never committed.** Write it to `$SCRATCH/pr-c/shot.mjs`:

```js
// Screenshots of /blocks for the owner. Run against a docs dev server.
//   node $SCRATCH/pr-c/shot.mjs http://localhost:4321 $SCRATCH/pr-c/shots/local
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2];
const out = process.argv[3];
mkdirSync(out, { recursive: true });

// The two widths either side of --breakpoint-nav are not decoration: Task 6
// re-measured it because /blocks is a sixth header section, and a nav change
// that was only ever looked at on one width is how #361 shipped invisible.
// `navPx` is the re-measured value in px, passed in so nothing here restates it.
const navPx = Number(process.argv[4] ?? 1200);
const browser = await chromium.launch();
for (const [name, width, height] of [
  ['desktop', 1440, 1000],
  ['nav-above', navPx + 40, 1000],
  ['nav-below', navPx - 1, 1000],
  ['tablet', 900, 1000],
  ['mobile', 390, 844],
]) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${base}/blocks/`, { waitUntil: 'networkidle' });
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(out, `${name}-${theme}-preview.png`), fullPage: true });

    // Code mode on the first card. The mode control is a kai-segmented whose
    // internals live in a shadow root, and its event does not bubble, so it is
    // driven by dispatching its own event ON the element -- the same way the
    // vitest suite does it. A Playwright .click() on shadow internals is the
    // fragile version of this.
    await page
      .getByTestId('mode-toggle')
      .first()
      .evaluate((el) => el.dispatchEvent(new CustomEvent('kai-change', { detail: { value: 'code' } })));
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, `${name}-${theme}-code.png`), fullPage: true });
    await page.close();
  }
}
await browser.close();
console.log(`wrote shots to ${out}`);
```

- [ ] **Step 2: Shoot both preview modes**

```bash
cd "$WT" && KAI_BLOCKS_KIT=local pnpm --filter @kitn.ai/docs run dev &
sleep 20
node "$SCRATCH/pr-c/shot.mjs" http://localhost:4321 "$SCRATCH/pr-c/shots/local" "$NAV_PX"
kill %1

cd "$WT" && pnpm --filter @kitn.ai/docs run build
cd "$WT" && pnpm --filter @kitn.ai/docs exec astro preview --port 4322 &
sleep 10
node "$SCRATCH/pr-c/shot.mjs" http://localhost:4322 "$SCRATCH/pr-c/shots/production" "$NAV_PX"
kill %1

ls -R "$SCRATCH/pr-c/shots"
```

`NAV_PX` is the `--breakpoint-nav` value Task 6 Step 3b re-measured, in px (`export NAV_PX=<value>` before the runs; a rem value times the root font size). Expected: twenty PNGs per mode (five widths x two themes x two modes). **The supervisor personally reads these.** Four owner-caught eyeball-misses earned that rule; an agent reporting "looks right" is not acceptance.

- [ ] **Step 3: Read them against the requirement list**

Check each, by eye, in the images:

- Title and description on one line; no "Built from" row anywhere.
- The toolbar row does not change height between the `-preview` and `-code` shots of the same viewport and theme.
- Each card's command names its own block. Two cards, two commands.
- The file tree shows full project paths (`src/components/<id>/...`, `blocks/<id>/...`), folders included.
- The footer reads `previewing the local build of packages/ui/dist` in the local shots and `previewing @kitn.ai/ui@<version> from jsDelivr` in the production ones.
- Nothing overflows horizontally at 390px, and the toolbar's height still agrees between the `-preview` and `-code` shots there: the row is `flex-wrap`, so the narrow widths are where the two modes' differing group widths could wrap differently and break the reserved height.
- `nav-above` shows all six header sections plus the tools with no collision; `nav-below` shows none of them and the header's topics menu button instead, with Blocks inside it.
- Both themes are legible; the cards do not paint a light surface in dark mode.

Anything wrong is a fix in this task, then re-shoot.

- [ ] **Step 4: Prove no scratch path and no em dash got committed**

```bash
cd "$WT" && git diff origin/main...HEAD --name-only | while read -r f; do
  [ -f "$f" ] || continue
  grep -Hn "/private/tmp/claude-\|/tmp/claude-\|scratchpad/" "$f"
done
cd "$WT" && git diff origin/main...HEAD -- apps packages .github | grep -n $'—' || echo "no em dash"
```

Expected: no output from the first, `no em dash` from the second.

- [ ] **Step 5: Push and open the PR**

```bash
cd "$WT" && git push -u origin feat/blocks-site-section
cd "$WT" && gh pr create --title "feat(docs)!: /blocks lands on the site, and the gallery is retired" --body "$(cat <<'BODY'
`/blocks` on ui.kitn.ai: hero, category strip, one card per block. Each card
previews the published CDN form in an iframe and shows the exact tree
`create-kai add` writes, with the displayed path equal to the written path.

- The registry is static files the site serves. The prebuild copies
  `packages/ui/dist/blocks` into `public/` and refuses loudly when the kit has
  not been built. Nothing is regenerated by the site.
- The framework dropdown IS `FRAMEWORK_BLOCK_FORMS`. Two rows today; PR B2's
  four renderers appear without anyone editing the dropdown, and a test asserts
  the equality.
- `KAI_BLOCKS_KIT=local` previews the working tree's kit; unset, the deploy
  previews the published pin. The footer says which in words, and
  `verify:preview` refuses a build carrying a local kit path.
- The add command is derived from each card's own id. A test renders more than
  one card and asserts the commands differ.
- `packages/ui/apps/gallery`, `dist/gallery`, every `/gallery` route and the
  `/kit/` CORS mount are gone. `kai dev` keeps no blocks route. The block
  driver's own `/kit/` mount is untouched. Retiring the gallery story also
  closes the PR B addendum's ticket on that story's CDN snippet pane.

Known deviations and couplings, stated rather than buried:

- **No line numbers in the code view.** Spec 4 asks for "line-numbered and
  highlighted"; `kai-code-block` highlights and has no line-number prop.
  Filed for the small-tickets round rather than faked with a gutter drawn
  outside a shadow root it cannot measure.
- **`--breakpoint-nav` was re-measured**, because `/blocks` is a sixth header
  section and the old value was measured for five. New value and the widths it
  was checked at: <state them>.
- **The block previews share a storage origin with the site.** Each block
  persists conversations to `localStorage`, so on ui.kitn.ai they sit beside
  the docs site's own keys. Distinct names, not a vulnerability, and
  `allow-same-origin` is what lets the blocks work at all.
- **The docs deploy and the npm publish race on a release merge**, so the pin
  the previews load can briefly not be on the CDN yet. Registered in the
  coupling map as enforced by NOTHING; fixing it is cross-workflow ordering
  and is its own change.

Screenshots for the owner: <the $SCRATCH/pr-c/shots path, stated literally>

BREAKING CHANGE: `kai dev` no longer serves `/gallery` or the `/kit/` mount.

Workspace-package resolution: <state whether any preserveSymlinks fallback was
needed, and which>.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
BODY
)"
cd "$WT" && gh pr checks --watch
```

**This task does not merge.** Report the PR number, the screenshot path and the check results.

---

## Self-review

### 1. Spec coverage

| Requirement (handoff 3.2 / spec) | Task |
|---|---|
| `/blocks` on `apps/docs`, viewer from kai components, Solid island | 5, 6 |
| Dropdown = generated AND gate-compiled frameworks, derived, with a test | 3 |
| Registry is static files the site COPIES, not regenerates; loud failure when `dist/blocks` is missing | 2 |
| `KAI_BLOCKS_KIT=local` switch; footer in words; production build carries the CDN URL and no local path | 2, 7 |
| Add command derived per card; test with more than one card | 3, 5 |
| Framework choice global and sticky, `localStorage` in try/catch | 3, 5 |
| Card layout: one-line header, contextual toolbar, viewport/open/refresh, dropdown+zip, add pill both modes, no "Built from", Preview/Code toggle, project-shaped tree, per-file copy, path = `FormFile.target` | 5 |
| Spec 4's "line-numbered" code view | 5, as a STATED deviation plus a kit ticket: `kai-code-block` has no such prop. The highlighted half ships |
| The preview iframe's sandbox (B-G's "one sandboxed iframe", narrowed) | 5 (R11), asserted by the render test |
| Retire `apps/gallery`, `KAI_BUILD=gallery`, `dist/gallery`, `galleryPageDir`, `/gallery` routes, the `/kit/` mount, the story, the tests, coupling rows | 8 |
| Pack-weight ledger amended with a MEASURED value | 8 |
| `kai dev` keeps no blocks route (spec 2.5 recommendation) | 8 (R10) |
| Which `preserveSymlinks` test the plan relies on | R9 |
| Spec 5.4 site path test | 7 |
| Spec 5.6 preview-source test | 7 |
| Spec 5.7 dropdown test | 3 |
| Eval gate: site build, production-vs-local, add-command, dropdown, visual pass with screenshots | 9, 10 |
| Zip download (owner ruling: it rides the writer that already exists) | 4, 5 |

No spec requirement in sections 2.5, 4, 4.1, 5.4, 5.6 or 5.7 is without a task.

### 2. Per-task closing gate

<!-- gate-list: partial -- each task's own closing check, not an enumeration of the merge gate; the merge gate is the graph `node packages/ui/scripts/lint-gate-parity.mjs --list` prints -->

| Task | Closing gate | Expected red watched first |
|---|---|---|
| 1 Baseline | `verify:pack`, `pnpm --filter @kitn.ai/docs run build`, `lint-gate-parity --list` recorded | n/a (records only) |
| 2 Copy + switch | `vitest run test/preview-source.test.ts` (five tests); a cold `rm -rf src/generated && run test`; both copy modes; `lint:cdn-pins`; `lint:attachment-object-urls` | unresolved import; `exit=1` on a missing `dist/blocks`; `lint:cdn-pins` red with the new `SKIP_PATHS` entry removed |
| 3 Axis + command | `vitest run test/blocks-source.test.ts`; a cold `typecheck:blocks` | unresolved import; then TS2322 on a planted annotation |
| 4 Zip | `vitest run test/zip.test.ts` (six tests) | unresolved import |
| 5 Card + page | `vitest run test/blocks-page.test.tsx`; `typecheck:blocks` | unresolved import, and the plan SAYS that is a weak red: Step 6 is where the assertions have to pass in one go |
| 6 Page + topic | `astro build`; `verify:docs`; the re-measured `--breakpoint-nav` checked both sides; dev server by eye | build fails without the prebuild copy |
| 7 Guards | `verify:preview --self-test`, then real; `vitest run test/blocks-targets.test.ts` | four planted self-test defects; a planted wrong `target`; a real local-mode build |
| 8 Retirement | `dev.test.ts`, `nx typecheck ui --skip-nx-cache`, cold build, `verify:blocks`, `verify:pack` | the lowered ceiling fired at `MAX_UNPACKED_BYTES = 0.1` |
| 9 CI + couplings | `lint-gate-parity`, then the ten-command local run | parity guard rejects an unrecognised step shape |
| 10 Visual + PR | twelve screenshots read by the supervisor; scratch-path and em-dash greps | n/a |

### 3. Placeholder scan

No "TBD", no "add appropriate error handling", no "similar to Task N". Every code step carries the code. Three places deliberately defer to a measurement rather than a literal, and each names the command that produces it: the pack-weight ceiling and its ledger entry (Task 8 Step 6), the dependency versions in Task 2 Step 1, and the margin rule, which is read from `verify-pack-weight.mjs`'s own prior entries.

Three places name a decision the implementer must make on the tree and REPORT, rather than guess silently: the `apps/docs` route collision check (Task 6 Step 5), whether the `sr-only` mode buttons survive review (Task 5 Step 3), and whether any `preserveSymlinks` fallback was needed (R9, Task 3 Step 4).

### 4. Type consistency

`FormFile` is `{ path, content, target }` throughout -- Task 4's zip reads `path` and `content`, Task 5's tree reads `target`, Task 7 compares `target` against `fileTarget()`. `BlockFormId` comes from `@kitn.ai/blocks/forms` in every file that names it and is never re-declared. `previewSource`'s return shape (`{ mode, previewDir, footer }`) is written by Task 2 and read by Task 3's `previewUrl`/`previewFooter` and Task 7's guard, with the same three keys. `loadForm(id, form) => Promise<FormPayload>` has one signature across `BlocksIsland`, `BlocksPage`, `BlockCard` and the test fixture.

---

## Facts verified on the tree

Every claim this plan leans on, with the command that established it. First established inside `.claude/worktrees/blocks-b` while PR B was in flight, then **re-verified by an independent adversarial review against `.claude/worktrees/blocks-c` at `64d2e652`, with PR B merged**. Every row below holds on that tree. Three rows were CORRECTED by that review and say so; two rows are new because the review found them missing.

| Fact | Command |
|---|---|
| `FRAMEWORK_BLOCK_FORMS` already exists, is `BLOCK_FORMS` minus `cdn`, and carries `{id,label}` | `sed -n '55,80p' packages/blocks/src/forms/index.ts` |
| `gen-blocks.mjs` iterates that same export to emit `dist/blocks/f/<id>.<form>.json`, and hard-fails a block that cannot render a form | `grep -n "FRAMEWORK_BLOCK_FORMS" -A 12 packages/ui/scripts/gen-blocks.mjs` |
| The emitted artifacts exist and have the shapes this plan reads: `registry.json` has `{name, homepage, items[]}`; `f/<id>.<form>.json` has `{block, form, files[{path,target,content}]}`; item JSON's `files[]` has NO `target` | `node -e "..."` over `packages/ui/dist/blocks/{registry.json,r/support-widget.json,f/support-widget.react.json}` |
| `FormFile.target` is required and is the project-relative path (`src/components/support-widget/SupportWidget.tsx`, `blocks/support-widget/support-widget.html`) | the same `node -e`, plus `sed -n '80,95p' packages/blocks/src/contract/types.ts` |
| `targets.ts` exports `INSTALL_ROOTS`, `installRoot`, `fileTarget`, `isTargetFramework` | `cat packages/blocks/src/targets.ts` |
| The emitted CDN form's kit imports are `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@<version>/dist/...`, from `rewriteBlockScript`'s default base | `sed -n '489,500p' packages/blocks/src/registry.ts` |
| `apps/docs` already registers `@astrojs/solid-js` and `unplugin-icons` with `compiler: 'solid'` | `cat apps/docs/astro.config.mjs` |
| `apps/docs` already has a prebuild/predev copy script whose outputs are gitignored, and `enable-pre-post-scripts=true` makes the hooks run | `cat apps/docs/scripts/copy-kit-assets.mjs`, `cat apps/docs/.gitignore`, `cat .npmrc` |
| No docs island imports a Solid COMPONENT value from `@kitn.ai/ui`; every runtime island goes through `loadKit()` | `grep -n "from '@kitn.ai/ui'" apps/docs/src/components/*.tsx`, `sed -n '1,30p' apps/docs/src/components/example/kit.ts` |
| `loadKit()` resolves only after `customElements.whenDefined('kai-chat')`, so properties set after it do not race the upgrade | the same `sed` |
| Every element the card needs exists, with the props and events used here: `kai-file-tree` (`files`, `activeFile`, `kai-select`), `kai-code-block` (`code`, `language`, `copy`), `kai-segmented` (`options`, `value`, `kai-change`), `kai-select`, `kai-button` (`icon`, `kai-click`) | `node -e` over `packages/ui/src/elements/element-meta.json` |
| There is no `kai-work-surface` element; `WorkSurface` is a Solid-only export | the same `node -e`, plus `grep -n "work-surface" packages/ui/src/index.ts` |
| `template: splash` is the site's sidebar-less shape, and `Header.astro` gates its mobile disclosure on `hasSidebar`, so a splash page keeps navigation | `sed -n '1,10p' apps/docs/src/content/docs/index.mdx`, `sed -n '1,45p' apps/docs/src/components/overrides/Header.astro` |
| `.landing-page` is the full-width scrolling precedent; `.kai-fullscreen` is the non-scrolling one | `grep -n "kai-fullscreen\|landing-page" apps/docs/src/styles/app.css` |
| `src/topics.mjs` is read by both `astro.config.mjs` and `Header.astro` | `sed -n '1,20p' apps/docs/src/topics.mjs` |
| The docs site is built ONLY by `deploy-docs.yml` on `push: main`; the required `test` job runs `verify:docs` and no astro build | `cat .github/workflows/deploy-docs.yml`, `grep -n "@kitn.ai/docs" .github/workflows/test.yml` |
| `dist-guards` downloads `kit-dist`, which carries `packages/ui/dist/**` | `sed -n '425,440p;693,720p' .github/workflows/test.yml` |
| `lint-gate-parity.mjs` fails on an unrecognised `run:` shape and recognises `pnpm --filter <pkg> run <script>`; it strips a leading env prefix | `sed -n '355,430p' packages/ui/scripts/lint-gate-parity.mjs` |
| `verify-pack-weight.mjs` prints the MEASURED file count and unpacked MiB on success; `MAX_UNPACKED_BYTES` is one constant; the gallery ledger entry is the `10.60 -> 11.85` one | `sed -n '400,420p;520,536p' packages/ui/scripts/verify-pack-weight.mjs` |
| `KAI_BUILD=gallery` is one clause of `packages/ui/package.json`'s `build`, and `config/vite/page.ts` carries the `gallery` entry with `outDir: 'dist/gallery'` | `grep -n "KAI_BUILD=gallery" packages/ui/package.json`, `grep -n "gallery" packages/ui/config/vite/page.ts` |
| `dev.ts` owns `galleryPageDir`, `galleryPreviewHtml`, `crc32`, `storeZip`, `GalleryDirs`, `handleGalleryRequest` and the `/kit/` CORS mount; `dev.test.ts` covers them in three describes | `grep -n "gallery\|zip\|/kit/" packages/ui/mcp/construct/dev.ts`, `grep -n "describe(" packages/ui/mcp/construct/dev.test.ts` |
| `storeZip` is `Buffer`-based, method 0, with fixed 1980-01-01 stamps | `sed -n '685,754p' packages/ui/mcp/construct/dev.ts` |
| `packages/blocks/tsconfig.json` sets `types: []` and `lib: ["ES2023"]` with NO DOM, deliberately, so `TextEncoder` cannot live there | `cat packages/blocks/tsconfig.json` |
| `GalleryPage.stories.tsx` is the ONLY story under `packages/ui/apps/`, so deleting it empties the `apps/**` story glob without breaking `storyRoots()` | `find packages/ui/apps -name "*.stories.tsx"` |
| The four `preserveSymlinks` surfaces and their fallbacks, including which two PR C deletes | `sed -n '1278,1300p' docs/superpowers/plans/2026-09-02-blocks-package-move.md` |
| `packages/ui/dist` is roughly 12 MB, of which `dist/gallery` is roughly 1.1 MB | `du -sh packages/ui/dist packages/ui/dist/gallery` |
| The workspace already resolves `@solidjs/testing-library`, `jsdom`, `vite-plugin-solid` and `vitest`. **CORRECTED:** an earlier draft typed `jsdom ^28.0.0`, which the lockfile does not carry, and its lockfile probe printed `undefined` for the scoped package because lockfile keys are quoted. Task 2 now names the probe and types no range at all | `grep -nE "^  '?(@solidjs/testing-library\|jsdom\|vite-plugin-solid\|vitest)@" pnpm-lock.yaml` |
| **NEW.** `lint-cdn-pins.mjs` and `lint-attachment-object-urls.mjs` both walk `apps/` with a one-entry `SKIP_PATHS` (`apps/docs/public/kitn`), whose stated reason is gitignored copies of built kit output. `apps/docs/public/blocks/` is the same class and is added to both in Task 2 | `grep -n "SKIP_PATHS" -A 4 packages/ui/scripts/lint-cdn-pins.mjs packages/ui/scripts/lint-attachment-object-urls.mjs` |
| **NEW.** `--breakpoint-nav` in `app.css` is a MEASURED width for "logo + five sections + ..."; `/blocks` makes six, so Task 6 re-measures it | `grep -n "breakpoint-nav" -B 6 apps/docs/src/styles/app.css` |
| **CORRECTED.** `kai-button`'s `label` is the accessible name only; visible text is the default slot, so a text button needs children. `kai-code-block` renders its own copy button by default and has NO line-number prop | `node -e` over `packages/ui/src/elements/element-meta.json` |
| **CORRECTED.** A `/blocks/` page route and a `public/blocks/` directory coexist: Astro's `checkPublicConflict` skips a page only when `publicDir` holds a file at that page's exact output path, and `public/blocks/` never holds an `index.html`. An earlier draft left this open | `grep -n "checkPublicConflict" -A 12 node_modules/astro/dist/core/build/generate.js` |
| `packages/create-kai/test/pr-d-target-mismatch.test.ts` exists and belongs to PR D | `ls packages/create-kai/test/` |

**Nothing in this plan is now unsettled from the tree.** The one open question the first draft carried -- whether a `/blocks/` page route can sit over a `public/blocks/` directory -- was answered from Astro's own `generate.js` during review and is written into Task 6 Step 5 as a mechanism plus two rules (never a `public/blocks/index.html`; the local kit mounts at `public/blocks/kit/`). The `ls` in that step stays as the confirmation, so a future Astro that changes the rule turns the build red rather than silently dropping the page.

Three things remain deliberately decided-on-the-tree rather than pre-answered here, each with the task that answers it and what to do either way:

- **Whether any `preserveSymlinks` fallback is needed** for `@kitn.ai/blocks` in the new `apps/docs` vitest or in Astro's Vite build (R9, Task 3 Step 4). The fallbacks are named; the answer goes in the PR body, because it is worth more than the fix.
- **The re-measured `--breakpoint-nav`** (Task 6 Step 3b). A number, measured in a browser, that no script in the repo can produce.
- **The new pack-weight ceiling and its ledger entry** (Task 8 Step 6), read off `verify:pack` before and after, never typed.
