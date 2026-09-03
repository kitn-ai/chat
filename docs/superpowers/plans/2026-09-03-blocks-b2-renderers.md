# PR B2: the vue, svelte, angular and solid renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four remaining delivery-form renderers to `@kitn.ai/blocks` so every authored block ships a vue, svelte, angular and solid tree beside its html, react and cdn ones, each gate-compiled by the tool that can actually see its template, with the site dropdown, the compile-cell axis, `create-kai`'s `--form` menu and its host detection all growing from `BLOCK_FORMS` without a single hand edit.

**Architecture:** The renderers are string emitters in `packages/blocks/src/forms/<framework>.ts`, consuming the same `ParsedTemplate` and `ControllerShape` the html and react renderers already consume, and computing every `FormFile.target` through `fileTarget()`. Each one is added to `BLOCK_FORMS` in the SAME commit as its compile cell, because `runBlockCompileCells` hard-fails on a form id with no strategy, so the tree can never be green with an unchecked form. The compile cells run inside `verify:scaffold`'s existing blocks phase over the harness `createConsumerTsc` already stands up, but each new form runs its own tool rather than `tsc`: `vue-tsc` for the SFC, `svelte-check` for the Svelte component, `ngc` for the Angular template, and `tsc` under the existing `solid` project for the Solid TSX, which additionally needs a new `solid-js/jsx-runtime` JSX augmentation in the kit because solid-js's `IntrinsicElements` is closed and rejects `<kai-dock>` outright.

**Tech Stack:** The TypeScript the workspace resolves (every package declares `^5.5.0`, and the resolved version is whatever `pnpm list typescript` prints, which is not the same number; `packages/blocks` compiles with `types: []` and no DOM lib) · vitest 4 · `vue-tsc` · `svelte-check` · `@angular/compiler-cli` (`ngc`) · `solid-js` · esbuild · Node >= 22. Task 0 Step 5 prints every tool's resolved version and the path it resolved from; no version literal appears below it.

**Spec:** `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` sections 3.4 (install roots), 3.5 (the renderers table), 3.6 (the Solid gap, OPEN with recommendation (a)), 5.1 (verification, items 1, 2, 3 and 7), 8a amendment 1, 8b amendments 1 to 8, and section 9's rulings. Also `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md` Part 2 and Part 7 for the standing rule that every block ships every framework tree the generator supports, gate-compiled, nothing hand-authored per framework, and that a form the gate cannot compile is withheld from the dropdown. Operating order: `docs/superpowers/HANDOFF-2026-09-02-night-run.md` section 2 (process) and section 3.4 (**every bullet there is a requirement**). What actually landed, and whose house style this plan copies: `docs/superpowers/plans/2026-09-02-blocks-pr-b-authored-contract.md`, `docs/superpowers/plans/2026-09-03-create-kai-add-targets.md`, and the three addenda `HANDOFF-2026-09-03-pr-b-addendum.md`, `-pr-c-addendum.md`, `-pr-d-addendum.md`.

---

## Scope: PR B2, and nothing else

IN scope:

- `packages/blocks/src/forms/{vue,svelte,angular,solid}.ts`, their unit suites, and their four rows in `BLOCK_FORMS`.
- One additive widening of `ControllerShape`: `actionArity`, read by `analyzeController` and consumed only by the angular renderer, because Angular is the only host that CALLS the action from the template and `strictTemplates` refuses both the missing and the extra argument (ruling R18).
- One `solid-js/jsx-runtime` JSX augmentation in `packages/ui/scripts/gen-element-types.mjs` plus the regenerated `src/elements/element-types.d.ts`, without which no Solid tree compiles at all.
- Four compile cells in `packages/ui/scripts/lib/block-compile-cells.mjs` (through a new `block-framework-cells.mjs`), the tool devDependencies they need declared where the gate lives, and the planted-defect self-tests that prove each one can go red.
- The two hand edits that genuinely are hand edits: `languageFor` in `apps/docs/src/lib/blocks-source.ts` gains `.vue` and `.svelte`, and `verify-pack-weight.mjs`'s ceiling gains a measured ledger entry.
- The kit-fix backlog item listing the Solid exports the coverage script says are missing, derived at implementation time.
- The `docs/coupling-map.md` rows this PR moves.

OUT of scope, do not start any of it:

- **Runtime cells for the four new frameworks.** Spec 5.3 and the section 9 ruling: react gets the runtime cell, every other framework stays compile-only until a block actually breaks in one, and the gate output names them as compile-checked only. Do not add a fifth `verify:blocks:*` gate.
- **Per-element Solid or Svelte template typing.** Ruling R2 and R6 put both on the backlog with their reasons. This PR ships the generic Solid augmentation only.
- **Exporting the missing Solid components.** Ruling R1 files them; it does not fix them.
- **New blocks**, the pages move to `apps/`, the small-tickets round, an MCP `add` tool, the theme-builder hookup.
- **Publishing.** No `prepublishOnly` change.

---

## Global Constraints

- Branch `feat/blocks-b2-renderers`, cut from `origin/main` AFTER PR D (#381) is merged. Worktree `.claude/worktrees/blocks-b2`, prepared by the controller and passed at dispatch. Export it once per shell:

```bash
export WT=/Users/home/Projects/kitn-ai/kitn-chat/.claude/worktrees/blocks-b2
export SCRATCH="<the scratchpad path passed at dispatch>"
```

  Every command in this plan runs inside `"$WT"`. Never `git checkout` in a checkout another agent owns; if one does, stop and say so.
- **The three-step worktree prep, and skipping one produces a failure that reads like a broken checkout:** (1) `cd "$WT" && pnpm install` - a worktree under `.claude/worktrees/` resolves up into the parent checkout's `node_modules` while Vite refuses to serve paths outside the worktree root, and suites die on one identical `Cannot find module '/@fs/<parent>/node_modules/...'`; (2) `pnpm --filter @kitn.ai/ui run build:css` for the gitignored `packages/ui/src/elements/compiled.css`; (3) a real cold build, `cd "$WT/packages/ui" && npm run build`, for `dist/custom-elements.json`, `dist/elements.d.ts` **and `dist/blocks/`, which every task in this plan reads**. `npm run` puts the ancestor `.bin` on PATH, so `build:css` can print success while every suite still fails identically. Confirm all three in Task 0 even when told the controller did them.
- **Never `nx build ui`** when you need a real build: the NX cache can restore a target whose generators write into the SOURCE tree, printing success while changing nothing. A cached build looks exactly like a successful one. Use `cd "$WT/packages/ui" && npm run build`, `npm run build:api` when only the generated element artifacts need rewriting, or `npm run build:blocks` when only `dist/blocks/` does.
- **After touching any renderer in `packages/blocks`, regenerate the artifacts before running anything that reads them:** `pnpm --filter @kitn.ai/ui run build:blocks`. `verify:blocks [fresh]` is a `gen-blocks --check` and will otherwise report a stale tree that is really an unrun generator.
- **After touching `gen-element-types.mjs`, run `npm run build:api` inside `packages/ui`, never `gen-llms.mjs` standalone** (it silently rewrites `llms-full.txt` with less data).
- **Never pipe a heavy suite, a build or a gate through `tail` inside an `&&` chain.** The exit status becomes the pipe's and a failure reads as a pass. One gate, one command. This cost the previous PR its merge.
- **Every new test and every new guard is watched FAILING first**, with the exact expected red stated in the step. A check nobody has seen fail is not evidence.
- **No hand-typed counts, sizes, versions or lists.** Name the command that prints the number. `docs/superpowers/**` is scanned by `node packages/ui/scripts/lint-gate-parity.mjs` and `node packages/ui/scripts/lint-threshold-derivation.mjs`, so a fenced block or table under that tree that looks like a merge-gate enumeration carries `<!-- gate-list: partial -- <reason> -->` above it. This plan carries those; keep them if you edit it.
- **The required gate is a graph, not a list.** Read it with `node packages/ui/scripts/lint-gate-parity.mjs --list`; never copy a list out of a handoff.
- **No em dashes and no emoji** anywhere this branch adds prose, code comments and emitted template text included. `apps/docs/STYLE.md` is the voice: sharp human engineer, terse, no boilerplate. Two carve-outs, both real and both already in the tree: `✓` and `✗` in a gate's own printed output are this repo's convention (`block-compile-cells.mjs`, `verify-scaffold-compiles.mjs`, `consumer-tsc-projects.mjs` all use them), so they are not emoji violations; and the mandated `🤖 Generated with [Claude Code]` attribution line at the end of a PR body stays exactly as it is. Task 8 Step 2's greps exempt both, and they scan ADDED lines only, because the files this branch edits (`docs/coupling-map.md`, `gen-element-types.mjs`, `consumer-tsc-projects.mjs`, `verify-pack-weight.mjs`) are full of em dashes that a three-line diff context would report as this branch's.
- **No scratchpad path in a committed file**, and no absolute agent path in a commit message. Task 8 greps for both.
- macOS `sed` needs the empty backup argument: `sed -i '' -E`.
- Every commit ends with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

## Rulings this plan makes

Each ruling is here because an implementer would otherwise guess, and because the reason is not recoverable from the spec text.

**R1. The solid form emits CUSTOM ELEMENTS for every tag, with `prop:` / `on:` / `attr:`. The set of elements that MUST be a custom element is every element carrying a `#ref` or an `@event`, and mixing components for the rest would make one tree speak two idioms, so: custom elements throughout.**

The night run rules spec 3.6 option (a): custom elements for any element without a Solid component export. Its literal wording is "where no component exists", and this ruling is a DEPARTURE from that wording, labelled as one in the self-review's spec table. Solid components genuinely do exist for many tags (`Dock`, `Panel`, `Thread`, `Row`, `Button`, `PromptInput` and `Empty` are all in `@kitn.ai/ui/solid`'s surface; `ViewStack` is one of the ones that is not), so the literal reading would produce a hybrid tree. Two facts in the tree make that hybrid unbuildable wherever a ref or an event lands, and both are mechanical rather than aesthetic.

- **The controller types its refs as ELEMENT interfaces.** `packages/blocks/blocks/support-widget/support-widget.controller.ts:96` declares `SupportWidgetRefs` as `{ stack: KaiViewStackElement | null; dock: KaiDockElement | null }`, imported from `@kitn.ai/ui/elements`. A Solid `<Dock>` component does not hand back a `KaiDockElement`; the custom element does. A tree that rendered `<Dock>` could not populate the refs the shared controller declares.
- **The `kai-*` events are dispatched by the element facade, not by the Solid component.** `kai-click` is dispatched at `packages/ui/src/elements/button.tsx:131` (`onClick={() => dispatch('kai-click')}`), inside `defineWebComponent`. The Solid `Button` in `src/ui/` never fires it, so `on:kai-click` on a Solid component would silently never run.

Every `#ref` in the three blocks sits on a `kai-` tag and every `@event` binds a `kai-` event, so the "must" set is not a corner case: it is most of each tree. One form, custom elements throughout. The kit-fix backlog item the night run asks for is still filed (Task 6 Step 7), derived from `node packages/ui/scripts/verify-solid-coverage.mjs --json <path>` at implementation time and recorded in the task report, never in this plan. Note when reading it that the guard grades **writable equivalence** (a `solid-coverage: equivalent` directive counts), which is weaker than "there is a component with this name to put in a generated tree", and that the spec's own 3.6 table is wrong in both directions against it. Follow the script.

**R2. The kit gains a `solid-js/jsx-runtime` JSX augmentation, GENERIC in the React block's shape, and it is not optional.**

`node_modules/solid-js/types/jsx.d.ts:4248` declares `interface IntrinsicElements extends HTMLElementTags, HTMLElementDeprecatedTags, SVGElementTags, MathMLElementTags {}` with no index signature and no dashed-tag catch-all, so `<kai-dock>` in a Solid TSX file is TS2339 before any of this PR's other work matters. `packages/ui/src/elements/element-types.d.ts` already augments React's `JSX.IntrinsicElements` and Vue's `GlobalComponents` from the same generated element list; this adds the third.

The augmentation target is `solid-js/jsx-runtime`, not `solid-js`. `solid-js`'s own index re-exports `JSX` as a type (`node_modules/solid-js/types/index.d.ts:9`), while `solid-js/jsx-runtime`'s `types` condition points straight at `./types/jsx.d.ts`, the file that DECLARES `export namespace JSX`. Verified by compiling both shapes (Facts table): augmenting `solid-js/jsx-runtime` from a file that is itself a module merges cleanly and `<span>` still resolves; the same block in a file with no top-level import or export is an ambient module DECLARATION instead, which replaces solid's module wholesale and breaks every standard tag.

It is generic (one `KaiElementSolidProps` with an index signature) rather than per-element for one reason worth stating: the per-element version needs an Events type keyed by the RAW event name (`on:kai-click`), and the generator emits only the camel-cased `onKaiClick` shape the Vue and React blocks use. Deriving `on:kai-click` from `onKaiClick` at the type level is not possible, so per-element Solid typing is a generator change of its own. It goes on the backlog with that reason, and Task 6's gate output says out loud that the solid cell does not type kai prop values.

**R3. Every non-react renderer annotates its ref callback with the element interface, derived from the tag by the rule `react.ts` already documents.**

Under R2's generic augmentation an unannotated `ref={(el) => ...}` is `TS7006: Parameter 'el' implicitly has an 'any' type` (verified). The interface name is `Kai<PascalCase of the tag minus kai->Element`, which is the same derivation `packages/blocks/src/forms/react.ts:6-12` states and `packages/ui/mcp/tests/blocks-artifacts.test.ts` asserts for every element the kit declares. A `#ref` on a non-kai tag gets `HTMLElement`.

This means the four new trees import type-only from `@kitn.ai/ui/elements`. That is correct and is NOT the thing `verify:blocks [react-tree]` forbids: that check (`reactTreeErrors` in `packages/ui/scripts/verify-blocks.mjs`) bans the import for the REACT form, where the typed wrappers already carry the element type on their forwarded ref, and it stays react-only.

**R4. `vue-tsc` IS the vue cell, and it is pinned by TWO planted defects, not one.**

Ruled by the owner (spec section 9) from the spike: `vue-tsc` costs about a quarter-second over `tsc` on the same program and the `default`-project half would have caught none of F-5, F-6, F-7 or F-8. It needs `skipLibCheck: true`, and the property it actually depends on is REACHABILITY: `vue-tsc` applies the kit's `GlobalComponents` augmentation only when the declaring file is in the compiled program, and with nothing importing `@kitn.ai/ui/elements` anywhere Vue falls through to `@vue/runtime-dom`'s `[name: string]: any` and the cell is green on nothing.

**Correcting the spec here, because it states the mechanism one notch too narrowly.** Spec 5.1 and section 9 open item 3 say the cell needs "an explicitly imported augmentation shim", i.e. a `.d.ts` in the sandbox carrying `import '@kitn.ai/ui/elements';`. Measured against the real `vue-tsc` and the real `packages/ui` (Facts table): the shim is not what makes the plant fire. The augmentation reaches the program equally well from the SFC's own `<script setup>` and from a sibling `.ts` the SFC imports, which is exactly the shape every emitted tree has (`Fixture.vue` imports `./useFixture`, and `useFixture.ts` imports `@kitn.ai/ui/elements`). Both of those go red. So the shim is kept as belt and braces for a future emitted tree that stops importing the kit, not as the load-bearing part, and the self-test arm that withholds it is named for what it really withholds: reachability, not one file.

The spec's plant is `:value.prop="42"` on `kai-tab-bar`, whose `value` is `string` (`element-types.d.ts:3587`). This plan adds a second: `:activeId.prop="42"` on `kai-conversations`, whose `activeId` is `string` (`element-types.d.ts:2729`). The reason is that `value` is a single word, so it cannot distinguish "the declared member was reached" from "the kebab-to-camel normalisation quietly failed and the `KaiElementVueProps` index signature swallowed it". A multi-word prop can. Both plants are watched red, and both are then run again with the augmentation UNREACHABLE (no shim and no `import '@kitn.ai/ui/elements'` in the plant at all) and watched turning GREEN, which is what proves the augmentation is what is doing the work rather than `vue-tsc` happening to be strict.

**R5. `ngc` IS the angular cell, not `tsc`.**

**This is a DEPARTURE from spec 5.1 item 3, which says "angular and solid through `tsc`", and the self-review's spec table labels it as one.** Section 9's ruling from open item 3 is about `vue-tsc` only, and the night run's 3.4 bullet says the same. The reason to depart anyway: `tsc` cannot read a `templateUrl`, so a `tsc`-only angular cell checks the component class and nothing whatsoever about the template that carries every binding, and inlining the template as a `template:` string does not help because `tsc` does not understand Angular template syntax either. `@angular/compiler-cli` is already resolvable and ships `ngc` at `bundles/src/bin/ngc.js`, and `examples/starters/angular/tsconfig.json` carries the real `angularCompilerOptions` (`strictTemplates: true`, `strictInjectionParameters`, `strictInputAccessModifiers`) to copy rather than invent.

The owner may want to rule this rather than take it from a plan: it grows a required gate's toolchain by a ninth devDependency, and it is the one place where this PR overrides the spec's letter on a verification question rather than on a mechanism question. Flag it in the Task 8 report either way.

What `ngc` does and does not buy is stated in the gate output (R7): it type-checks every template EXPRESSION against the component class, and it does not check kai prop names or types, because `CUSTOM_ELEMENTS_SCHEMA` suppresses exactly that check by design. That is not a gap this PR can close; it is what the schema is.

**R6. `svelte-check` IS the svelte cell, and the gate prints that Svelte's own catch-all types every unknown element `any`.**

`node_modules/svelte/elements.d.ts:2075` ends `SvelteHTMLElements` with `[name: string]: { [name: string]: any };`. So `<kai-dock>` and every attribute on it type as `any`, and a wrong prop name is invisible to `svelte-check`. Template EXPRESSIONS are still checked (`onkai-click={fixture.actions.opne}` is TS2339 on the actions type regardless of what it is assigned to), which is real coverage and is what the cell claims. A Svelte augmentation in `svelteHTML.IntrinsicElements` would close the rest and is a kit generator change of the same size as R2's per-element version; it goes on the backlog beside it.

**R7. The gate's own output says what each cell checked. One table, printed by the gate, never copied into a doc.**

Night run 3.4: "Svelte, Angular and Solid are compile-only cells, and the gate says so in its own output. A cell that compiles and proves nothing about behavior must not read as a behavioral pass." The four new cells are not equal to each other either, so the printed line per form names the tool AND the blind spot:

- vue: `vue-tsc` + the shipped `GlobalComponents` augmentation. Script, template expressions, AND kai prop types. The only cell of the four that types a kai prop.
- svelte: `svelte-check`. Script and template expressions. Not kai prop names or types (Svelte types every unknown element `any`).
- angular: `ngc --strictTemplates`. Class and template expressions. Not kai prop names or types (`CUSTOM_ELEMENTS_SCHEMA`).
- solid: `tsc` under the `solid` project. Module and JSX expressions. Not kai prop types (the augmentation is generic).

And the existing line stays: **none of the four runs anything.** React is the only runtime cell and stays so.

**R8. The four new adapters take `refs: () => <Name>Refs`; react's `RefObject` shape is left exactly as it is.**

`deps.refs` is a GETTER in the controller contract (spec 8b amendment 6, and `support-widget.controller.ts:15-19` says why), and each of the four hosts already hands a nullable handle back through a getter-shaped container: `useTemplateRef` in Vue, `bind:this` in Svelte, `viewChild()` in Angular, a plain `let` written by a `ref` callback in Solid. Passing the getter straight through means no framework needs a cast to build a `Refs` object.

React keeps `useRef<Refs>({ ... })` and the component writing `refs.current.<name> = el`. Changing it is out of this PR's scope, its compile cell and its runtime cell both pin the current shape, and a shape change there would be a breaking change to a tree consumers already have on disk.

**R9. Each renderer's `BLOCK_FORMS` row and its compile cell land in the SAME commit.**

`runBlockCompileCells` (`packages/ui/scripts/lib/block-compile-cells.mjs:150-159`) returns a hard failure for any form id with no entry in `STRATEGIES` ("Add one, or the form ships with nothing compiling it"), and `gen-blocks.mjs` iterates `FRAMEWORK_BLOCK_FORMS` with no list of its own. So adding a row without a cell turns `verify:scaffold` red, and adding a cell without a row leaves it unexercised. Landing both together is what makes the standing rule ("a form the gate cannot compile is withheld") enforced by the tree rather than remembered by a person. Task 2 builds the cell machinery FIRST, against hand-written fixture trees, so that each renderer task adds one `STRATEGIES` entry and one `BLOCK_FORMS` row and is green at its own end.

**R10. Nothing downstream is hand-edited except `languageFor`, and the plan names the test that proves it for each consumer.**

Every consumer of the forms list derives:

| Consumer | Derivation | Proof it grew without an edit |
|---|---|---|
| The site's framework dropdown | `frameworkOptions()` maps `FRAMEWORK_BLOCK_FORMS` | `apps/docs/test/blocks-source.test.ts`, "equals FRAMEWORK_BLOCK_FORMS, value and label, in order" |
| The displayed-path guard | loops `blockIds x FRAMEWORK_BLOCK_FORMS` and asserts the artifact count equals the product | `apps/docs/test/blocks-targets.test.ts`, "there is at least one block and one framework" |
| The generated artifacts | `gen-blocks.mjs:172` iterates `FRAMEWORK_BLOCK_FORMS` | `verify:blocks [fresh]`, a `gen-blocks --check` |
| The compile-cell axis | `loadBlockForms` reads the form ids out of the emitted file NAMES | the gate's own printed cell count |
| `create-kai`'s `--form` menu | `FORM_IDS = BLOCK_FORMS.map(f => f.id)` (`packages/create-kai/src/add.ts:64`) | `packages/create-kai/test/add.test.ts`, the `for (const form of BLOCK_FORMS)` loop that drives every accepted value through a real `runAdd` |
| Detection landing forms | `landingForm()` over `FRAMEWORK_BLOCK_FORMS` (`packages/create-kai/src/blocks.ts:261-268`) | `add.test.ts`, "the detection signals table, row by row", whose expectation is `emits ? signal.framework : 'html'` |
| The ambiguity question | two signals deciding DIFFERENT forms | `add.test.ts`, "two signals that decide the SAME form are not a question at all", whose expectation is derived from `detectForm` itself |
| The `verify:add` non-react leg | matches the tree on disk against the generated artifacts and reports which form it got | `packages/create-kai/scripts/verify-add.mjs`, the three-legs-three-forms anti-vacuity floor |
| The docs public copy | `cpSync(src, ..., { recursive: true })` (`apps/docs/scripts/copy-blocks.mjs:119`) | the astro build in `dist-guards` |

**MUST NOT be hand-edited**: `frameworkOptions`, `FRAMEWORK_SIGNALS`, `landingForm`, `emitsOwnTree`, `blockFormAxis`, `FORM_IDS`, `gen-blocks.mjs`, `blocks-targets.test.ts`, `verify-add.mjs`. A diff touching any of them is a plan failure, and Task 7 Step 1 is the grep that catches it.

The one honest exception is `languageFor` (`apps/docs/src/lib/blocks-source.ts:99-111`), a `switch` over file EXTENSIONS, not over forms. `.vue` and `.svelte` are two new extensions and the default is `'text'`, so without the two cases the site would render a Vue SFC unhighlighted. Both languages are already lazy-loadable in the kit's highlighter (`packages/ui/src/primitives/highlighter.ts:28-29`), so this is two `case` lines and nothing else.

**R11. Solid's `<For>` has no key, and the renderer says so in the emitted file rather than inventing one.**

`:key` is mandatory in the grammar (spec 8b amendment 1) and every other renderer uses it: react `key={row.id}`, vue `:key="row.id"`, svelte `{#each rows as row (row.id)}`, angular `@for (... ; track row.id)`. Solid's `<For>` is reference-keyed by the row object itself and takes no key prop. Emitting `key={row.id}` on a custom element would set an attribute nothing reads, which is the quiet version of a decision. So the solid renderer emits a comment at the `<For>` naming the fact, and `solid-form.test.ts` asserts the emitted tree contains NO `key=` on a repeated element.

**R12. `packages/blocks` gains no framework dependency. The four toolchains become explicit devDependencies of `packages/ui`, where the gate lives.**

`vue`, `svelte`, `@angular/core`, `vue-tsc`, `svelte-check` and `@angular/compiler-cli` all resolve from the repo root TODAY, but only as a side effect of `node-linker=hoisted` in `.npmrc` hoisting the dependencies AND devDependencies of `examples/starters/{vue,svelte,angular}`. Which half a package sits in varies by starter and does not matter to the hoist: `vue` and `svelte` are `dependencies` of theirs while `vue-tsc` and `svelte-check` are devDependencies, and the angular starter has `@angular/{common,compiler,core,platform-browser}` plus `rxjs` under `dependencies` with only `@angular/compiler-cli` under devDependencies. That makes a required CI gate depend on a starter nobody thinks of as infrastructure: deleting `examples/starters/vue` would take the vue cell's tool with it and the failure would read as a broken install. So `packages/ui/package.json` declares them, at the versions already in the lockfile, and Task 2 Step 1 writes the versions Task 0 Step 5 printed rather than typing them.

Recorded so nobody "fixes" it: `@angular/compiler-cli` declares a `typescript` peer range that the workspace's resolved TypeScript does not satisfy (read both with the Task 0 Step 5 probe and `node -e` on the package's `peerDependencies`), and `ngc` runs correctly anyway. It was spiked against the tree's own TypeScript and both angular plants fire, in both TS2554 directions. `pnpm install` will print an unmet-peer warning for it; that warning is expected and is not a version to chase.

`packages/blocks` itself stays a string emitter: no framework package, no `node:*`, no ambient types. Its `tsconfig.json` (`types: []`, `lib: ["ES2023"]`, no DOM) is what enforces that mechanically, and the four renderers must compile under it unchanged. Note for accuracy: CLAUDE.md says the package "depends on nothing", and the tree says `parse5` is a real dependency (`packages/blocks/package.json`). The invariant that actually holds, and the one this PR must not break, is: no `@kitn.ai/ui`, no `node:*`, no ambient type packages.

**R13. The pack ceiling moves, measured, with a ledger entry. It is not raised speculatively.**

The ceiling is the `MAX_UNPACKED_BYTES` constant `packages/ui/scripts/verify-pack-weight.mjs` declares, and the last measured unpacked size is the figure `HANDOFF-2026-09-03-pr-c-addendum.md` section 2 records. Read both rather than quoting either: the gap between them is the whole headroom, and this PR is about to change one of them. It adds four `dist/blocks/f/<id>.<form>.json` per block, each carrying a full tree including the controller, and that will very likely exceed it. Rule 1 (`MAX_FILE_BYTES`) does not apply, since it only fires outside `dist/`.

Task 7 runs `verify:pack`, reads the measured figure out of its own output, and writes a ledger entry in the file's existing prose style: what grew, why it is the new shipped surface and nothing else, and the standing margin rule (measured + about 0.29 MiB of headroom, rounded to the 0.05 MiB grain, because a larger margin would hide the `llms-full` regression the ceiling was tuned against). No number from this paragraph is copied into the entry.

**R14. The forms list order is the spec 3.5 table's, and `cdn` stays last.**

`BLOCK_FORMS` becomes `html, react, vue, svelte, angular, solid, cdn`. Three consequences, all load-bearing:

- The dropdown order follows, and `readFramework()`'s fallback is `FRAMEWORK_BLOCK_FORMS[0].id`, which stays `html`. No stored preference changes meaning.
- `cdn` stays LAST so the `--form` help text reads the paste form as the exception it is, and so `FRAMEWORK_BLOCK_FORMS`'s `filter` keeps producing the framework rows in spec order.
- Labels are `HTML`, `React`, `Vue`, `Svelte`, `Angular`, `Solid`, `CDN single file`: the framework's own capitalisation, nothing invented.

**R15. Menu honesty is enforced by R9, not by a list of withheld forms.**

There is no "withhold" branch anywhere and there must not be one. A renderer that cannot compile never gets its `BLOCK_FORMS` row, so it is absent from the dropdown, from `--form`, from the detection landing set and from the compile axis at once, all by the same derivation. The exercise that proves it is the pair of hard failures already in the tree, and Task 2 Step 6 watches both: `runBlockCompileCells` refusing a form id with no strategy, and `runBlockCompileCells` refusing a block that emitted some forms but not this one.

**The second refusal is PER BLOCK, and that is what its plant has to respect.** `loadBlockForms` (`packages/ui/scripts/lib/block-compile-cells.mjs`) derives the whole `forms` axis from the file NAMES it finds under `dist/blocks/f/`, so deleting every `*.<form>.json` deletes the form from the axis and the run stays green over the forms that remain. The message only exists for the block-shaped hole: some block still emitted the form, and this one did not. So the plant moves ONE block's file aside, never all of them, which is also ruling R19.

**R16. `sandbox()` gains optional `include` and `tsconfigExtra`, additively, and the symlink list grows.**

`consumer-tsc-projects.mjs` is a shared module with two callers (coupling-map row 119), so the change is additive only: `sandbox(project, name, opts)` where `opts.include` is APPENDED to the default include array and `opts.tsconfigExtra` is spread at the TOP level of the written tsconfig (for `angularCompilerOptions`).

Appended, not replacing, and the reason is a trap the replacing form walks into quietly. The default include ends with `relative(dir, shims)`, the shims file that carries `declare module '*.css'` and the `next/dynamic` and `@tanstack/react-router` stand-ins. A caller that passed `['**/*.ts', '**/*.vue', '**/*.d.ts']` to get its SFCs compiled would silently drop that file. It happens to be harmless today, because TypeScript reports no diagnostic for a bare side-effect import with no import clause, so the emitted trees' `import './fixture.css';` is fine either way (spiked, Facts table). But it is harmless by accident: the first emitted tree that writes `import styles from './x.css'` would break, and the failure would look like a renderer defect. So the callers pass only what they are adding, `['**/*.vue']` and `['**/*.svelte']`, and nothing the module already guarantees can be lost by a caller forgetting to restate it. The `compilerOptions` merge stays `{ ...BASE_OPTIONS, ...spec.options }` and is never re-typed, which is the property the module's own header defends. The symlink list gains `@angular/common`, `@angular/compiler` and `@angular/platform-browser`, which `ngc` needs; the other caller just gets three more symlinks it does not use.

**R17. No new target check in `verify-blocks.mjs`. `apps/docs/test/blocks-targets.test.ts` already covers every form and grows on its own.**

Spec 5.2 asks that every tree's emitted paths equal `targets.ts`. `[react-tree]` does it for react inside `verify:blocks`, and `blocks-targets.test.ts` does it for every block and every framework form by looping `FRAMEWORK_BLOCK_FORMS`. Adding four more `*-tree` checks would be a second derivation of the same fact in a second job. The `[html-binder]` stream-reader scan stays html-only for the same reason it always was: it is about the one form with no typecheck behind it.

**R18. `ControllerShape` gains `actionArity`, and the angular renderer passes `$event` iff the declared action takes a parameter. There is no name-shaped shortcut, in either direction.**

Angular's event binding is a STATEMENT, so the action is called rather than referenced, and `strictTemplates` type-checks that call. An action declared `close(): void` called as `store.actions.close($event)` is `TS2554: Expected 0 arguments, but got 1`; an action declared `submit(event: CustomEvent<...>)` called as `store.actions.submit()` is `TS2554: Expected 1 arguments, but got 0`. Both directions were spiked with the real `ngc` (Facts table), so neither blanket rule compiles.

No property of the event NAME predicts the arity. `kai-click` carries no detail at all (`packages/ui/src/elements/button.tsx` declares `'kai-click': void` and dispatches it with no payload), and the real controllers mix arities freely across `kai-` events in ONE template: `support-widget.controller.ts` declares `viewChange`, `tabChange`, `openChange`, `submit` and `openConversation` WITH a parameter and `back`, `close`, `startNew` and `openRecent` WITHOUT one, all bound to `kai-*` events. `assistant.controller.ts` and `in-app-assistant.controller.ts` are the same shape. So `support-widget` needs `$event` on `(kai-view-change)` and must not have it on `(kai-click)`, in the same file, and any rule keyed on the name is wrong on the first real block.

The arity therefore comes off the declaration, which means `ControllerShape` has to carry it. It is added ADDITIVELY, as `actionArity: Record<string, number>`, so `react.ts`, `html.ts` and `checkBlockContracts` do not move: `actionNames` stays exactly what it is and every existing reader is untouched. `analyzeController` already tokenizes each interface member with `splitMembers` and reads its name with `memberNames`, so the parameter count comes off the same tokens rather than from a second scan. This lands in Task 5 Step 1, which is the first task that needs it, and it is watched failing first: `packages/blocks/tests/analyze-controller.test.ts` asserts the whole shape object with `toEqual`, so the new key turns that existing case red before a line of the angular renderer exists.

**R19. The menu-honesty plant for the per-block refusal moves ONE block's form file, not every one.**

The refusal it exercises ("the block emitted other forms but not this one, so its tree is unchecked") is per block, and `loadBlockForms` derives the `forms` axis from file names, so removing every file of a form removes the form from the axis instead of failing. The plant that fires is one file moved aside from a tree that has at least three blocks in it. R15 carries the mechanism; this is the operational half, and Task 2 Step 6(c) is the only place it is performed.

**R20. A `lint:thresholds` hit is fixed with that linter's own directive, never with a `gate-list` marker.**

The two doc linters over `docs/superpowers/**` are different guards with different markers, and confusing them leaves the tree red while looking fixed. `lint-gate-parity.mjs` honours `<!-- gate-list: partial -- <reason> -->` above a block that looks like a gate enumeration. `lint-threshold-derivation.mjs` honours exactly three things on the offending LINE: a backticked producing command, the literal phrase `ratchet, not a target`, or the parsed directive `lint-thresholds: waive -- <reason>` with a reason of at least fifteen characters. A `gate-list` marker does nothing for it. Read the header of `packages/ui/scripts/lint-threshold-derivation.mjs` before waiving anything, and prefer naming the command that prints the number to waiving at all.

---

## Facts verified

Every row was read or run in the tree at plan time. Where the spec and the tree disagree, the tree wins on mechanics and the spec on intent, and the row says which.

<!-- gate-list: partial -- a provenance table of facts checked while writing this plan, not a gate list; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints the merge gate -->

| Claim | How it was checked |
|---|---|
| `INSTALL_ROOTS` already carries vue, solid, svelte and angular rows | read `packages/blocks/src/targets.ts:18-25` |
| `renderBlockForm`'s `switch` has no `default` | read `packages/blocks/src/forms/index.ts:124-130`. A missing case makes the end of the function reachable, and under `strict` the declared `FormFile[]` return then fails TS2366. That is `strict`, not `noFallthroughCasesInSwitch`, which is about a `case` body falling into the next one and has nothing to do with exhaustiveness; the flag IS set in `packages/blocks/tsconfig.json`, it is simply not what produces this red |
| `BLOCK_FORMS` is html, react, cdn; `FRAMEWORK_BLOCK_FORMS` is a `filter` over it | read `packages/blocks/src/forms/index.ts:58-76` |
| `FormFile` is `{ path, content, target }` and lives in `contract/types.ts` to avoid a barrel cycle | read `packages/blocks/src/contract/types.ts:81-85` (the doc comment above it says why) |
| `renderReadme(block, lines)` and `README_FILE` exist and are re-exported from `@kitn.ai/blocks/forms` | read `packages/blocks/src/forms/readme.ts:23,50` and `index.ts:44` |
| The react renderer emits `<Name>.tsx`, `use<Name>.ts`, `README.md` and every non-page non-`.js` manifest file | read `packages/blocks/src/forms/react.ts:281-293` |
| The react renderer derives the wrapper name, the handler name and the element interface rather than tabling them | read `packages/blocks/src/forms/react.ts:6-12,29-34` |
| `analyzeController` yields `{ name, stateFields, actionNames, refNames }` and carries NO parameter counts, and `ControllerShape` is that same four-field interface | read `packages/blocks/src/contract/analyze-controller.ts:168-181` and `contract/types.ts:87-94`. `analyzeController` is the only constructor of a `ControllerShape` in the repo (grepped), so widening it is additive by construction; the one reader that pins the whole object is `packages/blocks/tests/analyze-controller.test.ts`'s `toEqual`, which is R18's watched red |
| The real controllers mix action arities on `kai-` events inside ONE template | read `packages/blocks/blocks/support-widget/support-widget.controller.ts:107-125`: `viewChange`, `tabChange`, `openChange`, `submit` and `openConversation` take an event, `back`, `close`, `startNew` and `openRecent` take none. `assistant.controller.ts` and `in-app-assistant.controller.ts` are the same shape |
| `kai-click` carries NO detail, so "a `kai-` event means the action takes the event" is false | read `packages/ui/src/elements/button.tsx:40-45` (`'kai-click': void`) and `:131` (dispatched with no payload) |
| `ngc --strictTemplates` reports TS2554 in BOTH directions | spiked with the real `ngc`: a zero-arg action called with `$event` gives `error TS2554: Expected 0 arguments, but got 1`; a one-arg action called with none gives `error TS2554: Expected 1 arguments, but got 0`. This is why ruling R18 reads the arity instead of the event name |
| The controller contract is `{ state(): State; actions: Actions; subscribe(fn): () => void }`, `refs` a getter of nullable handles | read `packages/blocks/blocks/support-widget/support-widget.controller.ts:6,96-104,133` |
| The shared controller types its refs as `KaiViewStackElement` / `KaiDockElement` from `@kitn.ai/ui/elements` | read `support-widget.controller.ts:37,96-99`. This is R1's first proof |
| `kai-click` is dispatched by the ELEMENT facade, not by the Solid component | read `packages/ui/src/elements/button.tsx:44,131`. This is R1's second proof |
| All three blocks use all six binding kinds including `*for` and `seed:` | grepped `packages/blocks/blocks/*/[a-z]*.html`; every `#ref` in the three blocks sits on a `kai-` tag |
| The test fixture covers all six kinds in one page | read `packages/blocks/tests/fixtures/fixture.html` |
| Solid coverage today | ran `node packages/ui/scripts/verify-solid-coverage.mjs --json <path>`: 96/96 writable, GAP 0, but DIRECT 72 with 23 COMPOSITION and 1 DECLARED. `kai-tab-bar` and `kai-conversations` have no same-name component export at all; `kai-view-stack`'s row lists `createViewStack`. The spec's 3.6 table disagrees with the script in both directions, and the night run says to follow the script |
| solid-js's `IntrinsicElements` is closed, with no dashed-tag catch-all | read `node_modules/solid-js/types/jsx.d.ts:4248-4252` |
| `declare module 'solid-js/jsx-runtime'` merges when the declaring file is a module, and REPLACES solid's module when it is not | compiled both shapes with the repo's own tsc under `jsx: preserve` + `jsxImportSource: solid-js`. Non-module form: `error TS2339: Property 'span' does not exist on type 'JSX.IntrinsicElements'`. Module form: exit 0, with `<kai-dock prop:unread on:kai-click>` and `<span>` both accepted |
| An unannotated Solid ref callback under that augmentation is TS7006; an annotated one compiles | same probe: `ref={(el) => ...}` gave `error TS7006`, `ref={(el: KaiDockElement) => ...}` compiled |
| `element-types.d.ts` augments React's JSX and Vue's `GlobalComponents` from the same generated element list, and there is no solid-js augmentation | read `packages/ui/scripts/gen-element-types.mjs`: `jsxIntrinsicBlock` is defined at `:404` and interpolated once per emitted copy (`:549` for the src copy, `:577` for the dist copy); the Vue `GlobalComponents` block is `:470-501`. Grepped the generated file for `solid-js`: no hits |
| `KaiTabBarElementProps.value` is `string` and `KaiConversationsElementProps.activeId` is `string` | read `packages/ui/src/elements/element-types.d.ts:3587` and `:2729`. These are R4's two plants |
| Svelte 5 accepts `onkai-click` and compiles it to `$.event('kai-click', node, handler)` | compiled a probe SFC with `svelte/compiler` 5.56.4 |
| Svelte's keyed `{#each rows as row (row.id)}` compiles to `$.each(..., (row) => row.id, ...)` | same probe |
| Svelte sets a PROPERTY on a registered custom element and falls back to `setAttribute` otherwise | read `node_modules/svelte/src/internal/client/dom/elements/attributes.js:226-271` (`set_custom_element_data`) and `:172-208` (`set_attribute`, which assigns the property for a non-string value whose name is a setter, so `<span hidden={false}>` sets `hidden = false` rather than writing `"false"`). This is why the plan follows the spec's INTENT (property assignment happens) without its mechanism (`$effect` per binding), which the `ready` gate makes unnecessary |
| Svelte types every unknown element `any` | read `node_modules/svelte/elements.d.ts:2075` |
| `vue-tsc`, `svelte-check` and `@angular/compiler-cli` resolve today, at `bin/vue-tsc.js`, `bin/svelte-check` and `bundles/src/bin/ngc.js` | `require.resolve` from the gate's own module plus each package's `bin` field. Task 0 Step 5 re-runs it and prints the versions; none is written here |
| Those three resolve only through hoisting from `examples/starters/*`, not from `packages/ui`'s own devDependencies, and the starters split them across `dependencies` and `devDependencies` differently from each other | grepped every workspace `package.json`; read `.npmrc` (`node-linker=hoisted`) and `pnpm-workspace.yaml`. `vue` and `svelte` are `dependencies` of their starters, `vue-tsc` and `svelte-check` devDependencies; the angular starter puts `@angular/{common,compiler,core,platform-browser}` and `rxjs` in `dependencies` and only `@angular/compiler-cli` in devDependencies |
| `@angular/compiler-cli` declares a `typescript` peer range the workspace's resolved TypeScript does not satisfy, and `ngc` works anyway | read its `peerDependencies` with `node -e`, compared against the resolved root `typescript`, then ran `ngc` against the real block controllers: both plants fire. `pnpm install` prints the unmet-peer warning; `.npmrc` sets only `node-linker=hoisted` and `enable-pre-post-scripts=true`, so `strict-peer-dependencies` is off and it stays a warning |
| The vue cell's real dependency is REACHABILITY of the kit's augmentation, not the shim FILE | spiked with the real `vue-tsc` against the real `packages/ui`, three shapes. No kit import anywhere in the program: both plants GREEN. The plant's own `<script setup>` importing `@kitn.ai/ui/elements`, no shim file: both RED with TS2322. The import living in a sibling `.ts` the SFC imports, which is exactly the emitted tree's shape: RED with TS2322. So spec 5.1's "explicitly imported augmentation shim" wording is one notch too narrow, and ruling R4 records the correction rather than repeating it |
| `svelte-check`'s unused-CSS warning fires ONLY for a `<style>` block inside the component | spiked: a `<style>` block with a dead selector gives `WARNING ... "Unused CSS selector"`, while an `import './plant.css'` in the script is never analysed. The emitted `Fixture.svelte` has no `<style>` block, so the block's own stylesheet cannot produce this warning and `--fail-on-warnings` stays |
| `svelte-check` prints a `COMPLETED` record on every real run, and its machine records match `^\d+\s+(ERROR\|WARNING)` | same spike: clean tree exits 0 with `START` / `COMPLETED ... 0 ERRORS`; a defect exits 1 with an `ERROR` record and a `COMPLETED ... 1 ERRORS` line. So a non-empty output with no records and a non-zero exit is a CRASHED tool, which is why `svelteCell` fails loudly on it rather than returning clean |
| `packages/ui/node_modules/typescript` DOES NOT EXIST | `ls`. `node-linker=hoisted` puts the only copies at the repo root and under `packages/create-kai`, so any probe naming a `packages/ui/node_modules/typescript` path fails with a module-not-found before it can produce the red it was written to watch. Resolve it instead of typing it |
| A bare side-effect import of a missing module produces NO diagnostic under `moduleResolution: bundler` | spiked: `import './definitely-missing-thing';` and `import 'some-missing-pkg';` in a checked `.ts` are silent, while a deliberate type error on the next line is reported. This is why dropping `shims.d.ts` (which carries `declare module '*.css'`) from a sandbox include happens to be harmless for the emitted trees today, and why ruling R16 makes `opts.include` additive anyway |
| `runBlockCompileCells` hard-fails on a form id with no strategy, and per BLOCK on a block that emitted some forms but not this one | read `packages/ui/scripts/lib/block-compile-cells.mjs:142-159` (the strategy refusal) and `:160-172` (the per-block one). `blockFormCheck` (`packages/ui/scripts/verify-scaffold-compiles.mjs:1972-2001`) additionally refuses a registry block that emitted NO form at all |
| `loadBlockForms` derives the `forms` axis from the emitted file NAMES | read `packages/ui/scripts/lib/block-compile-cells.mjs:48-70`: `formIds.add(parsed.form)` per file. So removing every file of one form removes the form from the axis and the run stays green, which is ruling R19's whole reason |
| `sandbox(project, name)` writes its own tsconfig with the project's computed options and a recursive include, and exposes `dir`, `clear`, `run`, `selfTest` | read `packages/ui/scripts/lib/consumer-tsc-projects.mjs:466-511`. Its default include ends with the shims path (`:481-485`), which is what ruling R16 refuses to let a caller drop |
| The consumer harness symlinks `vue`, `svelte`, `solid-js` and `@angular/core` but not `@angular/common`, `@angular/compiler` or `@angular/platform-browser` | read `consumer-tsc-projects.mjs:306-333` |
| `gen-blocks.mjs` iterates `FRAMEWORK_BLOCK_FORMS` and needs no edit | read `packages/ui/scripts/gen-blocks.mjs:172-178` |
| The site dropdown IS `FRAMEWORK_BLOCK_FORMS`, pinned in order | read `apps/docs/test/blocks-source.test.ts:13-27` |
| `languageFor` is a switch over extensions with a `'text'` default and no `.vue` / `.svelte` case | read `apps/docs/src/lib/blocks-source.ts:99-111` |
| `vue` and `svelte` are already lazy-loadable languages in the kit highlighter | read `packages/ui/src/primitives/highlighter.ts:28-29` |
| create-kai's detection, `--form` menu, ambiguity and `verify:add` legs all derive and already anticipate a `vue` row | read `packages/create-kai/src/blocks.ts:241-333` (`landingForm` is `:267-270`), `src/add.ts:62-64` (`FORM_IDS` is `:64`), `test/add.test.ts:333-410,440-466`, `scripts/verify-add.mjs:268-292,340-350` |
| The docs public copy is recursive | read `apps/docs/scripts/copy-blocks.mjs:119` |
| `verify:scaffold` runs in the required `dist-guards` job (timeout 25 minutes), so the new cells need no workflow edit | read `.github/workflows/test.yml:738,849` |
| The pack ceiling is the `MAX_UNPACKED_BYTES` constant the tool declares, and the last measured unpacked size is the figure PR C's addendum records | read `packages/ui/scripts/verify-pack-weight.mjs:438` and `HANDOFF-2026-09-03-pr-c-addendum.md` section 2. Neither figure is copied into this plan: this PR moves one of them, and Task 7 Step 3 reads both out of `verify:pack`'s own output |
| `packages/blocks` compiles with `types: []`, `lib: ["ES2023"]`, no DOM, `noUnusedLocals`, `verbatimModuleSyntax` | read `packages/blocks/tsconfig.json` |
| The required gate today | ran `node packages/ui/scripts/lint-gate-parity.mjs --list` |

---

## File structure

<!-- gate-list: partial -- a file-change table naming created/modified paths, not a gate list; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints the merge gate -->

| File | Created / Modified | Responsibility |
|---|---|---|
| `packages/ui/scripts/gen-element-types.mjs` | Modify | Emits the third JSX augmentation, `declare module 'solid-js/jsx-runtime'`, from the same element list the React and Vue blocks use. |
| `packages/ui/src/elements/element-types.d.ts` | Modify (generated) | The regenerated file. Never hand-edited; `verify:generated` is the guard. |
| `packages/ui/src/elements/solid-jsx-augmentation.test.ts` | Create | Drift guard on the augmentation, in the shape of `vue-global-components.test.ts`. |
| `packages/ui/scripts/lib/consumer-tsc-projects.mjs` | Modify | `sandbox(project, name, opts)` gains `include` / `tsconfigExtra`; three Angular packages join the symlink list. |
| `packages/ui/scripts/lib/block-framework-cells.mjs` | Create | `vueCell`, `svelteCell`, `angularCell`, `solidCell`, the shim each writes, and `frameworkCellSelfTest()` with one planted defect per cell. |
| `packages/ui/scripts/lib/block-compile-cells.mjs` | Modify | `STRATEGIES` gains one entry per form as its renderer lands; the printed line per form names its tool and its blind spot. |
| `packages/ui/scripts/verify-scaffold-compiles.mjs` | Modify | Runs `frameworkCellSelfTest()` before the block cells, so a cell that cannot go red fails the gate. |
| `packages/ui/package.json` | Modify | `vue`, `svelte`, `@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/platform-browser`, `vue-tsc`, `svelte-check`, `@angular/compiler-cli` as explicit devDependencies. |
| `packages/blocks/src/forms/vue.ts` | Create | The vue SFC plus its composable. |
| `packages/blocks/src/forms/svelte.ts` | Create | The svelte component plus its `.svelte.ts` rune adapter. |
| `packages/blocks/src/forms/angular.ts` | Create | The standalone component, its template, and its injectable store. |
| `packages/blocks/src/forms/solid.ts` | Create | The solid TSX over custom elements plus its signal adapter. |
| `packages/blocks/src/forms/emit.ts` | Create | The helpers all four new renderers share: the parse-and-analyze preamble, the tag list, the ref interface name, the null-refs literal, and `escapeAttr`, the one attribute escaper (`react.ts`'s `jsString` and `jsxText` are neither). |
| `packages/blocks/src/contract/types.ts` | Modify | `ControllerShape` gains `actionArity: Record<string, number>`, additively (ruling R18). |
| `packages/blocks/src/contract/analyze-controller.ts` | Modify | Reads the parameter count off the same interface-member tokens `memberNames` already walks, and returns it in the shape. |
| `packages/blocks/tests/analyze-controller.test.ts` | Modify | The existing whole-shape `toEqual` gains the new key, and one case asserts the arity of a zero-arg and a one-arg action. This is R18's watched red. |
| `packages/blocks/src/forms/index.ts` | Modify | Four `BLOCK_FORMS` rows, four `switch` cases, four re-exports. |
| `packages/blocks/tests/{vue,svelte,angular,solid}-form.test.ts` | Create | One suite per renderer, over the shared fixture. |
| `packages/blocks/tests/forms-axis.test.ts` | Create | The axis itself: every `BLOCK_FORMS` id renders, every framework id has an install root, `renderBlockForm` covers all of them. |
| `apps/docs/src/lib/blocks-source.ts` | Modify | `languageFor` gains `.vue` and `.svelte`. |
| `apps/docs/test/blocks-source.test.ts` | Modify | Two assertions for the new extensions. |
| `packages/ui/scripts/verify-pack-weight.mjs` | Modify | The measured ledger entry and the new ceiling. |
| `docs/coupling-map.md` | Modify | The forms-list row and the `INSTALL_ROOTS` row gain the new cells; a new row for the three hoisted toolchains. |

---

## Task 0: pre-flight

**Files:** none. Nothing is committed by this task.

**Interfaces:**
- Consumes: nothing.
- Produces: three recorded facts every later task depends on - the Solid coverage output, the axes `verify:scaffold` prints today, and the gate list. Record all three in the task report; none of them is written into this plan.

- [ ] **Step 1: Confirm the three worktree steps, even if told they were done**

```bash
cd "$WT" && git status --porcelain && git log --oneline -1
cd "$WT" && pnpm install
cd "$WT" && pnpm --filter @kitn.ai/ui run build:css
cd "$WT/packages/ui" && npm run build
```

Expected: a clean tree on `feat/blocks-b2-renderers` whose parent is the PR D squash; then a real build (NOT `nx build ui`, ruling in Global Constraints). Then confirm the three artifacts the later tasks read exist:

```bash
cd "$WT" && ls packages/ui/src/elements/compiled.css packages/ui/dist/custom-elements.json packages/ui/dist/elements.d.ts && ls packages/ui/dist/blocks/f/
```

Expected: all present, and `dist/blocks/f/` lists two files per block (`<id>.html.json`, `<id>.react.json`). Record the count. If any is missing, the build did not really run: re-run it and do not proceed.

- [ ] **Step 2: Run the Solid coverage script and record its output verbatim**

```bash
cd "$WT" && node packages/ui/scripts/verify-solid-coverage.mjs --json "$SCRATCH/solid-coverage.json"
```

Note the flag takes a PATH argument (`--json <file>`); passing it bare crashes in `writeFileSync`. Record the printed totals line and the verdict line in the task report. Then record, per element the three blocks actually render, whether a same-name component export exists:

```bash
cd "$WT" && node -e "
const j = require(process.env.SCRATCH + '/solid-coverage.json');
const rows = j.rows.filter((r) => r.verdict !== 'DIRECT' || r.nameMatch === null || !r.solidSurface.includes(r.nameMatch));
for (const r of rows) console.log(r.verdict.padEnd(12), r.tag.padEnd(26), 'wanted=' + r.nameMatch, 'have=[' + r.solidSurface.join(', ') + ']');
console.log(rows.length + ' element(s) have no export named after the tag');
"
```

Expected: a non-empty list. This is the raw material for Task 6 Step 7's backlog item, and it is also the evidence for ruling R1: the guard grades WRITABLE EQUIVALENCE, which is a weaker property than "there is a component with this name to put in a generated tree", and the spec's section 3.6 table disagrees with it in both directions. Follow the script, never the table.

- [ ] **Step 3: Read the axes `verify:scaffold` prints today**

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
```

Expected: green, and it prints (among much else) `· block forms: N cell(s) over M block(s) x 2 form(s) (html, react)` plus the two-line note about html being a syntax-and-strip check. Record that line and the total wall time. Every later task's gate step compares against these two numbers; nothing in this plan states either.

- [ ] **Step 4: Read the merge gate**

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs --list
```

Record the gate count and confirm `@kitn.ai/ui run verify:scaffold` and `@kitn.ai/ui run verify:pack` are both on it. This PR adds no new gate id, which is why no workflow edit appears anywhere below: the new cells run inside `verify:scaffold`, which is already required.

- [ ] **Step 5: Confirm the three toolchains resolve, and from where**

```bash
cd "$WT" && node -e "
const { createRequire } = require('module');
const r = createRequire('$WT/packages/ui/scripts/lib/consumer-tsc-projects.mjs');
for (const p of ['vue', 'svelte', '@angular/core', '@angular/common', '@angular/compiler', '@angular/platform-browser', 'solid-js', 'vue-tsc', 'svelte-check', '@angular/compiler-cli']) {
  try { console.log(p.padEnd(28), require(r.resolve(p + '/package.json')).version, r.resolve(p + '/package.json')); }
  catch { console.log(p.padEnd(28), 'MISSING'); }
}"
```

Expected: every one resolves, and every path is under the WORKTREE ROOT's `node_modules`, not `packages/ui/node_modules`. That is ruling R12's evidence: they are hoisted from `examples/starters/*` and no package that uses them declares them. Record the versions; Task 2 Step 2 writes exactly these into `packages/ui/package.json`.

---

## Task 1: the kit learns to type `<kai-*>` in Solid JSX

**Files:**
- Modify: `packages/ui/scripts/gen-element-types.mjs` (the augmentation blocks, beside the React and Vue ones)
- Modify: `packages/ui/src/elements/element-types.d.ts` (generated output, never hand-edited)
- Create: `packages/ui/src/elements/solid-jsx-augmentation.test.ts`

**Interfaces:**
- Consumes: the `elements` model `gen-element-types.mjs` already builds for the React `jsxTagMap` and the Vue `vueTagMap`.
- Produces: `KaiElementSolidProps` and a `declare module 'solid-js/jsx-runtime'` block in the shipped `element-types.d.ts`. Task 6's renderer and Task 2's `solidCell` both depend on it existing.

Without this, a Solid tree containing `<kai-dock>` does not compile at all: `solid-js`'s `IntrinsicElements` is closed (Facts table). This is a kit change and it lands first, because it needs its own `build:api` and every later task builds on top of it.

- [ ] **Step 1: Write the failing drift guard**

Create `packages/ui/src/elements/solid-jsx-augmentation.test.ts`:

```ts
/**
 * The SOLID JSX augmentation, and the reason it exists.
 *
 * `solid-js`'s `JSX.IntrinsicElements` is closed: it extends HTMLElementTags,
 * HTMLElementDeprecatedTags, SVGElementTags and MathMLElementTags and carries
 * no index signature, so a `<kai-dock>` in a Solid TSX file is TS2339 before
 * anything else about the solid delivery form matters.
 *
 * TWO THINGS ARE PINNED HERE and neither is stylistic.
 *
 * 1. THE AUGMENTATION TARGET IS `solid-js/jsx-runtime`, not `solid-js`.
 *    `solid-js`'s index re-exports JSX as a TYPE; `solid-js/jsx-runtime`'s
 *    `types` condition points at the file that DECLARES `export namespace JSX`,
 *    which is what a module augmentation has to name to merge.
 *
 * 2. EVERY REGISTERED TAG IS IN IT. The list is generated from the same
 *    element model the React and Vue blocks use, so a new element joins all
 *    three at once; this asserts the three lists have the same length rather
 *    than re-deriving a fourth.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, 'element-types.d.ts'), 'utf8');

const tagsIn = (block: string): string[] =>
  [...block.matchAll(/'(kai-[\w-]+)'\s*:/g)].map((m) => m[1]);

/** The body of a `declare module '<name>' { ... }` block, to its closing brace. */
function moduleBlock(name: string): string {
  const start = SOURCE.indexOf(`declare module '${name}' {`);
  expect(start, `no \`declare module '${name}'\` block in element-types.d.ts`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = SOURCE.indexOf('{', start); i < SOURCE.length; i += 1) {
    if (SOURCE[i] === '{') depth += 1;
    if (SOURCE[i] === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated \`declare module '${name}'\` block`);
}

describe('the solid JSX augmentation', () => {
  it('targets solid-js/jsx-runtime, which is the module that declares the namespace', () => {
    // `declare module 'solid-js'` would create a NEW namespace rather than
    // merging into the one `types/jsx.d.ts` exports, and every standard tag
    // would stop resolving. Verified by compiling both shapes.
    expect(SOURCE).toContain("declare module 'solid-js/jsx-runtime' {");
    expect(SOURCE).not.toContain("declare module 'solid-js' {");
  });

  it('carries every tag the react and vue augmentations carry', () => {
    const solid = tagsIn(moduleBlock('solid-js/jsx-runtime'));
    const react = tagsIn(moduleBlock('react'));
    expect(solid.length).toBeGreaterThan(0);
    expect(solid).toEqual(react);
  });

  it('is generic, and says out loud that it is', () => {
    // A per-element version needs an Events type keyed by the RAW event name
    // (`on:kai-click`), and the generator emits only the camel-cased
    // `onKaiClick` shape. Until it does, the solid compile cell cannot type a
    // kai prop value and the gate output says so.
    expect(SOURCE).toContain('interface KaiElementSolidProps');
    const solid = moduleBlock('solid-js/jsx-runtime');
    expect(solid).toContain('KaiElementSolidProps');
  });

  it('is generated, not hand-written', () => {
    expect(SOURCE.startsWith('// AUTO-GENERATED by scripts/gen-element-api.mjs')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/solid-jsx-augmentation.test.ts
```

Expected: FAIL, three cases. The FIRST fails on a plain containment assertion (`expect(SOURCE).toContain("declare module 'solid-js/jsx-runtime' {")`), with vitest's own diff and no custom text. The custom message `no \`declare module 'solid-js/jsx-runtime'\` block in element-types.d.ts` comes from `moduleBlock`, so it belongs to the SECOND case and the third. The fourth ("is generated") PASSES already, and that pass is the control: it proves the harness is reading the right file, which it does because `element-types.d.ts` begins `// AUTO-GENERATED by scripts/gen-element-api.mjs`.

- [ ] **Step 3: Emit the augmentation**

In `packages/ui/scripts/gen-element-types.mjs`, immediately after the `jsxIntrinsicBlock` template literal (the React block, which ends with the closing backtick after `declare module 'react' { ... }`), add:

```js
  // SOLID. `solid-js`'s JSX.IntrinsicElements is CLOSED -- it extends the four
  // tag interfaces and carries no index signature -- so a raw `<kai-dock>` in
  // a Solid TSX file is "Property 'kai-dock' does not exist on type
  // 'JSX.IntrinsicElements'". The blocks package's solid delivery form renders
  // custom elements rather than the Solid components in `@kitn.ai/ui/solid`
  // (the shared controller types its refs as ELEMENT interfaces, and the kai-
  // events are dispatched by the element facade rather than by the Solid
  // component underneath it), so without this nothing in that form compiles.
  //
  // THE TARGET IS `solid-js/jsx-runtime`. `solid-js`'s own index re-exports
  // JSX as a type; `solid-js/jsx-runtime`'s `types` condition points straight
  // at types/jsx.d.ts, the file that DECLARES `export namespace JSX`, and that
  // is the module a declaration merge has to name. Verified by compiling both:
  // targeting 'solid-js' shadows the namespace instead of merging, and every
  // standard tag stops resolving.
  //
  // GENERIC, like the react block above and for the same reason plus one more.
  // Array/object props are set as properties, never as attributes, so typing
  // them per element would invite the wrong spelling. And a per-element version
  // would need an Events type keyed by the RAW event name (`on:kai-click`),
  // while this generator emits only the camel-cased `onKaiClick` shape the
  // react and vue blocks use -- deriving one from the other at the type level
  // is not possible. So the solid compile cell does not type a kai prop value,
  // and scripts/lib/block-framework-cells.mjs says so in the gate's output.
  const solidTagMap = elements.map((el) => `      '${el.tag}': KaiElementSolidProps;`).join('\n');

  const solidIntrinsicBlock = `/** A kai-* custom element as Solid's JSX checker sees it. The index signature
 *  is what accepts \`prop:\`, \`attr:\` and \`on:\` without typing them. \`ref\` is
 *  declared so a generated tree annotates its own callback parameter: under the
 *  index signature alone an unannotated \`ref={(el) => ...}\` is TS7006. */
interface KaiElementSolidProps {
  id?: string;
  class?: string;
  style?: Record<string, string | number> | string;
  slot?: string;
  part?: string;
  children?: unknown;
  ref?: unknown;
  [attr: string]: unknown;
}

declare module 'solid-js/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
${solidTagMap}
    }
  }
}`;
```

Then add `solidIntrinsicBlock` to BOTH emitted copies, immediately after `jsxIntrinsicBlock` in each template literal - the dist copy and the `srcOut` source copy. Search for `jsxIntrinsicBlock` in the file; it appears once per copy, and each occurrence gets `\n\n${solidIntrinsicBlock}` after it.

- [ ] **Step 4: Regenerate and confirm the guard passes**

```bash
cd "$WT/packages/ui" && npm run build:api
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/solid-jsx-augmentation.test.ts
```

Expected: PASS, all four. `build:api`, never `gen-llms.mjs` standalone: the latter rewrites `llms-full.txt` with less data and the oversized diff is the only tell.

- [ ] **Step 5: Prove the augmentation actually does the job, in a real tsc run**

This is the anti-vacuity control on the whole task: the drift guard above reads a string, and a string is not a compiler.

```bash
cd "$WT" && mkdir -p "$SCRATCH/solid-probe/node_modules" \
  && ln -sfn "$WT/node_modules/solid-js" "$SCRATCH/solid-probe/node_modules/solid-js" \
  && ln -sfn "$WT/node_modules/csstype" "$SCRATCH/solid-probe/node_modules/csstype" \
  && mkdir -p "$SCRATCH/solid-probe/node_modules/@kitn.ai" \
  && ln -sfn "$WT/packages/ui" "$SCRATCH/solid-probe/node_modules/@kitn.ai/ui"
cat > "$SCRATCH/solid-probe/tsconfig.json" <<'JSON'
{"compilerOptions":{"target":"ES2022","lib":["ES2022","DOM","DOM.Iterable"],"module":"ESNext","moduleResolution":"bundler","strict":true,"noEmit":true,"skipLibCheck":true,"jsx":"preserve","jsxImportSource":"solid-js"},"include":["*.tsx","*.ts","*.d.ts"]}
JSON
cat > "$SCRATCH/solid-probe/a.tsx" <<'TSX'
import '@kitn.ai/ui/elements';
import type { KaiDockElement } from '@kitn.ai/ui/elements';
let dock: KaiDockElement | null = null;
export function A() {
  return (
    <kai-dock ref={(el: KaiDockElement) => { dock = el; }} prop:unread={true} on:kai-click={() => {}}>
      <span>{String(dock)}</span>
    </kai-dock>
  );
}
TSX
export TSC="$(cd "$WT" && node -e "console.log(require.resolve('typescript/bin/tsc'))")"
cd "$SCRATCH/solid-probe" && node "$TSC" -p tsconfig.json; echo "EXIT=$?"
```

RESOLVE the compiler, never type its path: `packages/ui/node_modules/typescript` DOES NOT EXIST (`node-linker=hoisted` keeps the only copies at the repo root and under `packages/create-kai`), so a hard-coded path there fails with a module-not-found before the probe can produce either verdict, and the whole anti-vacuity control silently does not run.

Expected: `EXIT=0`. Both `<kai-dock>` AND `<span>` resolve, which is the pair that matters: `<span>` failing would mean the block shadowed solid's module instead of merging.

Now watch it fail without the augmentation, by pointing the probe at solid alone:

```bash
cd "$SCRATCH/solid-probe" && sed -i '' -E "1,2d" a.tsx && sed -i '' -E "s/KaiDockElement/HTMLElement/g" a.tsx \
  && node "$TSC" -p tsconfig.json; echo "EXIT=$?"
```

Expected: FAIL with `error TS2339: Property 'kai-dock' does not exist on type 'JSX.IntrinsicElements'`. That red is the whole reason this task exists, and it is what a Solid consumer sees today.

- [ ] **Step 6: Run the package's gates**

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:generated
cd "$WT" && pnpm --filter @kitn.ai/ui run typecheck
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit
```

Expected: green. `verify:generated` is the one that would catch a hand-edited `element-types.d.ts`.

- [ ] **Step 7: Commit**

```bash
cd "$WT" && git add packages/ui/scripts/gen-element-types.mjs packages/ui/src/elements/element-types.d.ts packages/ui/src/elements/solid-jsx-augmentation.test.ts
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(elements): type kai-* in Solid JSX, the third augmentation

solid-js's JSX.IntrinsicElements is closed: it extends the four tag interfaces
and carries no index signature, so a raw <kai-dock> in a Solid TSX file is
TS2339. The generator already emits the same tag list into React's
JSX.IntrinsicElements and Vue's GlobalComponents; this adds Solid's, from the
same model, so a new element joins all three at once.

The target is `solid-js/jsx-runtime`, not `solid-js`: the latter re-exports JSX
as a type, and augmenting it shadows the namespace instead of merging, which
takes every standard tag with it. Both shapes were compiled before choosing.

Generic, like the react block: array and object props are set as properties
rather than attributes, and a per-element version would need an Events type
keyed by the raw event name (`on:kai-click`) that this generator does not emit.

Watched failing first, twice: the drift guard red before the emit, and a real
tsc run over a Solid TSX red with the exact TS2339 a consumer sees today.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 2: the four compile cells, before there is anything to compile

**Files:**
- Create: `packages/ui/scripts/lib/block-framework-cells.mjs`
- Modify: `packages/ui/scripts/lib/consumer-tsc-projects.mjs` (`sandbox` options, three symlinks)
- Modify: `packages/ui/scripts/lib/block-compile-cells.mjs` (`STRATEGIES` import site and the printed lines)
- Modify: `packages/ui/scripts/verify-scaffold-compiles.mjs` (run the cell self-test before the cells)
- Modify: `packages/ui/package.json` (the toolchain devDependencies)

**Interfaces:**
- Consumes: `createConsumerTsc({ keep, fail })` and its `sandbox(project, name)` from `consumer-tsc-projects.mjs`; the `{ tsc, esbuild, name, files }` cell signature `block-compile-cells.mjs` already calls its strategies with.
- Produces: `FRAMEWORK_CELLS`, an object keyed by form id whose values are cell functions with that same `{ tsc, name, files }` signature; `CELL_NOTES`, one printed line per form id naming the tool and the blind spot; and `frameworkCellSelfTest({ tsc, log })`, which plants one defect per cell and returns the ones that did not fire. Tasks 3 to 6 each add ONE `STRATEGIES` entry pointing at `FRAMEWORK_CELLS[<form>]`.

The cells land before the renderers so that each renderer task is one row plus one wiring line and is green at its own end (ruling R9). They are exercised here against hand-written minimal trees, which is the only thing available before a renderer exists, and every one of those trees is planted with a defect and watched red.

- [ ] **Step 1: Declare the toolchains where the gate lives**

Add to `packages/ui/package.json`'s `devDependencies`, in alphabetical position, at **the versions Task 0 Step 5 recorded** (do not type the ones in this plan's prose; read your own output):

```
"@angular/common", "@angular/compiler", "@angular/compiler-cli", "@angular/core",
"@angular/platform-browser", "svelte", "svelte-check", "vue", "vue-tsc"
```

`@angular/ssr` is already there; `solid-js` is already a runtime dependency. Then:

```bash
cd "$WT" && pnpm install
cd "$WT" && git diff --stat pnpm-lock.yaml
```

Expected: `pnpm install` succeeds and the lockfile diff is small (these versions are already resolved for `examples/starters/*`; this only adds importer entries). If a version resolves DIFFERENTLY from Task 0 Step 5's, you typed a range that moved: pin the exact resolved version instead.

**One warning is expected and is not a version to fix.** `@angular/compiler-cli` declares a `typescript` peer range that the workspace's resolved TypeScript does not satisfy, so `pnpm install` prints an unmet-peer warning for it. `ngc` runs correctly against the version the workspace has: it was spiked against the real block controllers and both angular plants fire, in both TS2554 directions (Facts table, ruling R12). Do not chase the range, do not add a second TypeScript, and do not turn on `strict-peer-dependencies`: `.npmrc` sets only `node-linker=hoisted` and `enable-pre-post-scripts=true`, so it is off, and turning it on would make this warning a hard install failure for the whole workspace. `examples/starters/angular` gets away with the same thing today by additionally declaring a TypeScript that does not win the hoist.

Why this is not bureaucracy: all nine resolve today only because `.npmrc` sets `node-linker=hoisted` and `examples/starters/{vue,svelte,angular}` declare them. A required CI gate whose tool comes from a starter is one `rm -rf examples/starters/vue` away from a failure that reads as a broken install (ruling R12).

- [ ] **Step 2: Widen the sandbox, additively**

In `packages/ui/scripts/lib/consumer-tsc-projects.mjs`, add the three Angular packages to the symlink list beside `@angular/core`:

```js
    'solid-js', '@angular/core', '@angular/common', '@angular/compiler', '@angular/platform-browser',
```

and change `sandbox`'s signature and its tsconfig write:

```js
  /**
   * A SUBDIRECTORY of a project, with the project's own compilerOptions and a
   * recursive include.
   *
   * ... (the existing doc comment is unchanged) ...
   *
   * `opts.include` is APPENDED to the default include array, for a caller whose
   * files are not .ts/.tsx (a .vue SFC, a .svelte component). Appended rather
   * than replacing, because the default array ends with the shims path and a
   * caller that restated the list would silently drop it: `declare module
   * '*.css'` and the next/dynamic and router stand-ins live there, and losing
   * them would show up as a defect in whatever tree happened to import a
   * stylesheet. `opts.tsconfigExtra` is spread at the TOP level of the written
   * tsconfig, for a caller whose tool reads a sibling of `compilerOptions`
   * (`angularCompilerOptions`). Neither touches the compilerOptions merge: that
   * stays the project's own computed object and is never re-typed, which is the
   * property this module's header defends.
   */
  function sandbox(project, name, opts = {}) {
    const spec = PROJECTS[project];
    if (!spec) {
      cleanup();
      fail(`no such tsc project "${project}". The projects are ${Object.keys(PROJECTS).join(', ')}.`);
    }
    const dir = join(spec.dir, name);
    mkdirSync(dir, { recursive: true });
    if (spec.packageJson) writeFileSync(join(dir, 'package.json'), JSON.stringify(spec.packageJson, null, 2));
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: { ...BASE_OPTIONS, ...spec.options },
          include: [
            '**/*.ts',
            '**/*.tsx',
            '**/*.d.ts',
            relative(dir, shims).split('\\').join('/'),
            ...(opts.include ?? []),
          ],
          ...(opts.tsconfigExtra ?? {}),
        },
        null,
        2,
      ),
    );
```

The rest of `sandbox` is unchanged. Note that `clear()` already removes everything but `tsconfig.json` and `package.json`, which is what lets a cell reuse one sandbox per block (ruling T11-a from PR B: clearing between blocks is why one broken block cannot print reds under another block's name).

- [ ] **Step 3: Write the four cells**

Create `packages/ui/scripts/lib/block-framework-cells.mjs`:

```js
// THE FOUR FRAMEWORK CELLS: vue, svelte, angular, solid (spec 2026-09-02
// section 5.1, and the PR B2 rulings).
//
// WHY EACH RUNS ITS OWN TOOL. `tsc` cannot read a .vue file, a .svelte file or
// an Angular templateUrl, so a `default`-project pass over any of the three
// would compile the script block and NOTHING about the template that carries
// every binding. That is the "green on nothing" shape this repo names most
// often, and for vue it is a ruled requirement (spec section 9, from the
// contract spike: vue-tsc IS the vue cell, not a supplement).
//
// WHAT EACH ONE CANNOT SEE, stated here and PRINTED by the gate, because a
// cell that compiles and proves nothing about behaviour must not read as a
// behavioural pass:
//
//   vue     vue-tsc + the kit's shipped GlobalComponents augmentation.
//           Script, template expressions AND kai prop types. The only one of
//           the four that types a kai prop value.
//   svelte  svelte-check. Script and template expressions. NOT kai prop names
//           or types: svelte/elements.d.ts ends SvelteHTMLElements with
//           `[name: string]: { [name: string]: any }`, so every unknown element
//           and every attribute on it is `any`.
//   angular ngc with strictTemplates. Class and template expressions. NOT kai
//           prop names or types: CUSTOM_ELEMENTS_SCHEMA suppresses exactly that
//           check, which is what the schema IS.
//   solid   tsc under the `solid` project. Module and JSX expressions. NOT kai
//           prop types: the kit's solid-js/jsx-runtime augmentation is generic
//           (see scripts/gen-element-types.mjs for why).
//
// NONE OF THE FOUR RUNS ANYTHING. React is the only runtime cell
// (verify:blocks:react) and stays so, per the owner ruling in spec section 9.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** A tool's entry script, resolved through Node rather than a node_modules
 *  path literal: pnpm's layout differs between the workspace root, a worktree
 *  and CI, and a wrong guess reads as a scaffolder defect. */
function toolBin(pkg, rel) {
  let root;
  try {
    root = dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    throw new Error(
      `${pkg} is not installed. It is a devDependency of packages/ui because this gate runs it; run \`pnpm install\` at the repo root.`,
    );
  }
  const bin = join(root, rel);
  if (!existsSync(bin)) throw new Error(`${pkg} is installed but ${rel} is missing (found ${root})`);
  return bin;
}

/** Run a tool and return its combined output ('' when it exits 0). */
function runTool(bin, args, cwd) {
  try {
    execFileSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

/**
 * The augmentation shim every non-solid cell writes into its sandbox.
 *
 * WHAT IT IS FOR, stated precisely, because the obvious version of this claim
 * is false. vue-tsc applies a module augmentation only when the declaring file
 * is IN THE PROGRAM, and with nothing importing the kit anywhere Vue falls
 * through to @vue/runtime-dom's `[name: string]: any` and the cell type-checks
 * the script block and nothing about the template. What the program needs is
 * REACHABILITY, and the emitted trees already have it: the SFC imports its
 * composable and the composable imports '@kitn.ai/ui/elements'. Measured, all
 * three shapes: no kit import anywhere is GREEN, the SFC's own script importing
 * it is RED, and a sibling .ts importing it (the emitted shape) is RED.
 *
 * So this file is BELT AND BRACES, not the load-bearing part: it keeps the cell
 * honest for a future emitted tree that stops importing the kit from its script.
 * The self-test below withholds reachability entirely, not just this file, and
 * watches both plants turn GREEN.
 */
const SHIM = `import '@kitn.ai/ui/elements';\n`;

/** Write one form's files into a sandbox, under their `path` (not `target`:
 *  the sandbox IS the block directory, and the install root is the consumer
 *  project's business, checked by apps/docs/test/blocks-targets.test.ts). */
function writeTree(dir, files) {
  for (const file of files) {
    const dest = join(dir, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.content);
  }
}

/** The sandbox self-test, run before every cell: a green over a sandbox whose
 *  @kitn.ai/ui resolved to `any` would pass every assertion below. */
function guardSandbox(box, name, form) {
  const { missed, out } = box.selfTest();
  if (!missed.length) return null;
  return (
    `${name} [${form}]: the sandbox self-test did NOT fire (${missed.map((p) => p.file).join(', ')}).\n` +
    `    ${missed.map((p) => p.why).join('\n    ')}\n` +
    `    Every cell under it would pass vacuously. tsc said:\n${out || '    (nothing)'}`
  );
}

export function vueCell({ tsc, name, files }) {
  const box = tsc.sandbox('default', `block-${name}-vue`, {
    include: ['**/*.ts', '**/*.tsx', '**/*.vue', '**/*.d.ts'],
  });
  const guard = guardSandbox(box, name, 'vue');
  if (guard) return [guard];
  box.clear();
  writeTree(box.dir, files);
  writeFileSync(join(box.dir, 'kai-shim.d.ts'), SHIM);
  const out = runTool(toolBin('vue-tsc', 'bin/vue-tsc.js'), ['--noEmit', '-p', join(box.dir, 'tsconfig.json')], box.dir);
  box.clear();
  return out.trim() ? [`${name} [vue]: vue-tsc rejects the emitted SFC:\n${out.trimEnd()}`] : [];
}

export function svelteCell({ tsc, name, files }) {
  const box = tsc.sandbox('default', `block-${name}-svelte`, {
    include: ['**/*.ts', '**/*.svelte', '**/*.d.ts'],
  });
  const guard = guardSandbox(box, name, 'svelte');
  if (guard) return [guard];
  box.clear();
  writeTree(box.dir, files);
  writeFileSync(join(box.dir, 'kai-shim.d.ts'), SHIM);
  const out = runTool(
    toolBin('svelte-check', 'bin/svelte-check'),
    ['--output', 'machine', '--fail-on-warnings', '--tsconfig', join(box.dir, 'tsconfig.json')],
    box.dir,
  );
  box.clear();
  // svelte-check's machine output is one record per line; ERROR and WARNING
  // records are the failures, and `--fail-on-warnings` makes the exit code
  // agree. Filtering rather than trusting the exit code alone keeps the
  // reported text short enough to read.
  //
  // `runTool` returns text ONLY when the tool exited non-zero, so reaching here
  // with output and no records is not a clean tree: it is svelte-check having
  // CRASHED (a tsconfig it cannot read, a missing peer, a .svelte it cannot
  // parse), and returning [] on it would be exactly the green-on-nothing this
  // cell was added to close. It fails loudly instead, with the raw text. The
  // `COMPLETED` record is the tool's own "I really ran" line and its absence is
  // the same anomaly.
  if (!out.trim()) return [];
  const lines = out.split('\n');
  const problems = lines.filter((l) => /^\d+\s+(ERROR|WARNING)/.test(l));
  if (!problems.length || !lines.some((l) => /^\d+\s+COMPLETED/.test(l))) {
    return [
      `${name} [svelte]: svelte-check exited non-zero with no machine records (or no COMPLETED line), ` +
        `which is a crashed tool rather than a clean tree:\n${out.trimEnd()}`,
    ];
  }
  return [`${name} [svelte]: svelte-check rejects the emitted component:\n    ${problems.join('\n    ')}`];
}

export function angularCell({ tsc, name, files }) {
  const box = tsc.sandbox('angular', `block-${name}-angular`, {
    // Copied from the tsconfig `ng new` writes (examples/starters/angular),
    // not invented. `strictTemplates` is the whole reason ngc is the cell:
    // without it the template's expressions are unchecked too and the cell
    // would be back to compiling the class alone.
    tsconfigExtra: {
      angularCompilerOptions: {
        strictTemplates: true,
        strictInjectionParameters: true,
        strictInputAccessModifiers: true,
        enableI18nLegacyMessageIdFormat: false,
      },
    },
  });
  const guard = guardSandbox(box, name, 'angular');
  if (guard) return [guard];
  box.clear();
  writeTree(box.dir, files);
  writeFileSync(join(box.dir, 'kai-shim.d.ts'), SHIM);
  const out = runTool(toolBin('@angular/compiler-cli', 'bundles/src/bin/ngc.js'), ['-p', join(box.dir, 'tsconfig.json')], box.dir);
  box.clear();
  return out.trim() ? [`${name} [angular]: ngc rejects the emitted component:\n${out.trimEnd()}`] : [];
}

export function solidCell({ tsc, name, files }) {
  // The `solid` project, which is `jsx: preserve` + `jsxImportSource:
  // solid-js` -- the same one the scaffolder's solid front end compiles under,
  // which is what makes "it compiles for a consumer" mean the same thing in
  // both places. No shim: the solid-js/jsx-runtime augmentation reaches the
  // program through the tree's own `import '@kitn.ai/ui/elements'`.
  const box = tsc.sandbox('solid', `block-${name}-solid`);
  const guard = guardSandbox(box, name, 'solid');
  if (guard) return [guard];
  box.clear();
  writeTree(box.dir, files);
  const out = box.run();
  box.clear();
  return out.trim() ? [`${name} [solid]: does not compile under a stock solid consumer tsconfig:\n${out.trimEnd()}`] : [];
}

export const FRAMEWORK_CELLS = { vue: vueCell, svelte: svelteCell, angular: angularCell, solid: solidCell };

/** One line per form, printed by the gate. What the cell checked, and what it
 *  did not. Keyed by form id so a form with no note is a missing note rather
 *  than a silent one. */
export const CELL_NOTES = {
  vue: 'vue     vue-tsc + the kit GlobalComponents augmentation: script, template expressions AND kai prop types.',
  svelte: 'svelte  svelte-check: script + template expressions. NOT kai prop names or types (svelte types every unknown element `any`).',
  angular: 'angular ngc --strictTemplates: class + template expressions. NOT kai prop names or types (CUSTOM_ELEMENTS_SCHEMA suppresses that check by design).',
  solid: 'solid   tsc, solid project: module + JSX expressions. NOT kai prop types (the solid-js JSX augmentation is generic).',
};
```

- [ ] **Step 4: Write the self-test, with one plant per cell**

Append to `packages/ui/scripts/lib/block-framework-cells.mjs`:

```js
// ---------------------------------------------------------------------------
// THE PLANTS. A cell that cannot go red is compile theatre and looks exactly
// like a passing one, so every cell is handed a tree with a known defect and
// must name it. These trees are hand-written and MINIMAL on purpose: they are
// the only thing available before a renderer exists, and a plant that needed a
// real block would make this self-test depend on the thing it is guarding.
// ---------------------------------------------------------------------------

const CONTROLLER = `export interface PlantState { title: string }
export interface PlantActions { open(): void; boot(): Promise<void> }
export interface PlantRefs { host: HTMLElement | null }
export function createController(deps: { refs: () => PlantRefs }) {
  let state: PlantState = { title: 'x' };
  const listeners = new Set<() => void>();
  void deps;
  return {
    state: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    actions: { open() { state = { ...state }; }, async boot() {} },
  };
}
`;

const f = (path, content) => ({ path, content, target: path });

/**
 * Each plant is [label, files, expected]. `expected` is a substring the cell's
 * failure text MUST contain, so "it went red" is not enough: it has to go red
 * for the planted reason. Every plant is a TEMPLATE defect, because the
 * template is the half a plain `tsc` cell cannot see and therefore the half
 * these tools exist for.
 */
function plants() {
  return [
    // vue, plant 1: the ruled one (spec section 9). `kai-tab-bar`'s `value` is
    // `string`, so binding a number to it as a PROPERTY is TS2322 -- but only
    // when GlobalComponents is REACHABLE from the program. The plant's own
    // script imports the kit, which is enough on its own; with neither that
    // import nor the shim, Vue falls through to `[name: string]: any` and this
    // is green, which is the arm the self-test runs second.
    ['vue', 'kai prop type (single-word prop)', [
      f('plant.controller.ts', CONTROLLER),
      f('Plant.vue', `<script setup lang="ts">
import '@kitn.ai/ui/elements';
import { createController } from './plant.controller';
const c = createController({ refs: () => ({ host: null }) });
const state = c.state();
</script>

<template>
  <kai-tab-bar :value.prop="42">{{ state.title }}</kai-tab-bar>
</template>
`),
    ], 'TS2322'],

    // vue, plant 2: NOT a duplicate. `value` is one word, so plant 1 cannot
    // tell "the declared member was reached" from "the kebab-to-camel spelling
    // quietly missed and the KaiElementVueProps index signature swallowed it".
    // `activeId` on kai-conversations is `string` and is two words, so it can.
    // The generated SFC uses the camelCase spelling for exactly this reason.
    ['vue', 'kai prop type (multi-word prop reaches the declared member)', [
      f('plant.controller.ts', CONTROLLER),
      f('Plant.vue', `<script setup lang="ts">
import '@kitn.ai/ui/elements';
import { createController } from './plant.controller';
const c = createController({ refs: () => ({ host: null }) });
const state = c.state();
</script>

<template>
  <kai-conversations :activeId.prop="42">{{ state.title }}</kai-conversations>
</template>
`),
    ], 'TS2322'],

    // svelte: an expression defect, which is what this cell CAN see. A prop
    // defect is deliberately not planted here: svelte types every unknown
    // element `any`, so such a plant could never fire and a self-test that
    // expects a red it cannot get is worse than no plant at all.
    ['svelte', 'template expression against the controller', [
      f('plant.controller.ts', CONTROLLER),
      f('Plant.svelte', `<script lang="ts">
  import '@kitn.ai/ui/elements';
  import { createController } from './plant.controller';
  const c = createController({ refs: () => ({ host: null }) });
</script>

<kai-dock onkai-click={c.actions.opne}>{c.state().title}</kai-dock>
`),
    ], 'opne'],

    // angular: the same class of defect, in a templateUrl that `tsc` cannot
    // open at all. This is the plant that proves ngc is doing the work rather
    // than the angular tsc project.
    ['angular', 'template expression against the component class', [
      f('plant.controller.ts', CONTROLLER),
      f('plant.component.html', `<kai-dock (kai-click)="store.actions.opne()">{{ store.title }}</kai-dock>\n`),
      f('plant.component.ts', `import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import '@kitn.ai/ui/elements';
import { createController } from './plant.controller';

@Component({
  selector: 'app-plant',
  templateUrl: './plant.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PlantComponent {
  protected readonly store = createController({ refs: () => ({ host: null }) });
  protected readonly title = this.store.state().title;
}
`),
    ], 'opne'],

    // solid: a JSX expression defect under the generic augmentation, plus the
    // TS7006 an unannotated ref callback produces. Both are what the solid cell
    // CAN see, and the second is why the renderer annotates its ref parameter.
    ['solid', 'JSX expression against the controller', [
      f('plant.controller.ts', CONTROLLER),
      f('Plant.tsx', `import '@kitn.ai/ui/elements';
import { createController } from './plant.controller';

export function Plant() {
  const c = createController({ refs: () => ({ host: null }) });
  return <kai-dock on:kai-click={c.actions.opne}>{c.state().title}</kai-dock>;
}
`),
    ], 'opne'],
  ];
}

/**
 * Run every plant. Returns the labels that did NOT fire, which the caller
 * turns into a hard failure: a cell that cannot fail is the dominant failure
 * mode in this repo.
 *
 * It ALSO runs the vue plants a second time with the kit's augmentation
 * UNREACHABLE from the program, and those two must go GREEN. That direction is
 * the whole point: it proves the augmentation is what is doing the work rather
 * than vue-tsc happening to be strict, which is the ruled requirement (spec
 * section 9, open item 3). Unreachable means BOTH the shim file and the plant's
 * own `import '@kitn.ai/ui/elements'`: either one alone reaches the program and
 * turns the plant red, which is why the arm is named for reachability rather
 * than for the shim (ruling R4).
 */
export function frameworkCellSelfTest({ tsc, log }) {
  const problems = [];
  for (const [form, label, files, expected] of plants()) {
    const errors = FRAMEWORK_CELLS[form]({ tsc, name: `plant-${form}-${label.replace(/\W+/g, '-')}`, files });
    const text = errors.join('\n');
    const fired = errors.length > 0 && text.includes(expected);
    log(`  ${fired ? 'OK ' : 'RED'} plant [${form}] ${label} (expected "${expected}")`);
    if (!fired) problems.push(`[${form}] ${label}: expected a failure containing "${expected}", got ${errors.length ? text.split('\n')[0] : 'CLEAN'}`);
  }

  // The reachability direction, vue only.
  const unreachable = plants().filter(([form]) => form === 'vue');
  for (const [, label, files] of unreachable) {
    const stripped = files.map((file) =>
      file.path.endsWith('.vue') ? { ...file, content: file.content.replace("import '@kitn.ai/ui/elements';\n", '') } : file,
    );
    const errors = vueCellWithoutAugmentation({ tsc, name: `plant-vue-unreachable-${label.replace(/\W+/g, '-')}`, files: stripped });
    const green = errors.length === 0;
    log(`  ${green ? 'OK ' : 'RED'} plant [vue] ${label} with the augmentation UNREACHABLE (expected CLEAN: this is what vue-tsc does on its own)`);
    if (!green) problems.push(`[vue] ${label} with the augmentation unreachable: expected CLEAN, got ${errors[0].split('\n')[0]}. If vue-tsc is now strict on its own, this plant has stopped proving what the augmentation is for.`);
  }

  return problems;
}

/** vueCell with the augmentation made UNREACHABLE: no shim file, and the
 *  caller has already stripped the plant's own kit import. Only the self-test
 *  calls it. Withholding the shim alone would prove nothing, because the
 *  plant's own import reaches the program by itself (ruling R4). */
function vueCellWithoutAugmentation({ tsc, name, files }) {
  const box = tsc.sandbox('default', `block-${name}-vue`, {
    include: ['**/*.ts', '**/*.tsx', '**/*.vue', '**/*.d.ts'],
  });
  box.clear();
  writeTree(box.dir, files);
  const out = runTool(toolBin('vue-tsc', 'bin/vue-tsc.js'), ['--noEmit', '-p', join(box.dir, 'tsconfig.json')], box.dir);
  box.clear();
  return out.trim() ? [out.trimEnd()] : [];
}
```

- [ ] **Step 5: Wire the self-test into the gate, and the notes into the cells module**

In `packages/ui/scripts/lib/block-compile-cells.mjs`, import the new module and print its notes:

```js
import { CELL_NOTES } from './block-framework-cells.mjs';
```

Replace the two `log(...)` calls at the end of `runBlockCompileCells` with:

```js
  log(
    `  · block forms: ${cells} cell(s) over ${blocks.length} block(s) x ${forms.length} form(s) (${forms.join(', ')})`,
  );
  log(
    '    html    esbuild parses the emitted .js and it must carry no TypeScript. Syntax + strip only;\n' +
      "            what the binder MEANS is the block driver's half, in a real browser against a committed baseline.\n" +
      '    react   tsc under a stock consumer tsconfig, and the only form with a RUNTIME cell (verify:blocks:react).',
  );
  for (const form of forms) if (CELL_NOTES[form]) log(`    ${CELL_NOTES[form]}`);
  log('    NONE of the four framework cells above RUNS anything. Compile-checked only.');
```

And in the same function, the zero-cells anti-vacuity message hand-types the old axis: it ends "at least one block is on the authored contract and renders **both** framework forms", which will say "both" about six. Change that clause to `renders every framework form`. It is one string and it is easy to walk past, which is why it is a named step rather than a note.

`STRATEGIES` is NOT extended here. Each renderer task adds its own entry (ruling R9), and until then a form id with no strategy is the hard failure that keeps the two in step.

In `packages/ui/scripts/verify-scaffold-compiles.mjs`, inside `blockFormCheck`, before the `runBlockCompileCells` call:

```js
  // THE PLANTS FIRST. Every framework cell is handed a tree with a known
  // template defect and must name it, and the vue cell is additionally run
  // with the kit's augmentation UNREACHABLE and must go GREEN there. A cell
  // that cannot fail passes every real cell below vacuously, and looks
  // identical to one that works.
  const plantProblems = frameworkCellSelfTest({ tsc: consumerTsc, log: console.log });
  if (plantProblems.length) {
    for (const p of plantProblems) console.log(`  ✗ ${p}`);
    cleanup();
    fail(`${plantProblems.length} block framework cell plant(s) did not behave as specified. A cell that cannot go red is compile theatre.`);
  }
```

with the import beside the existing one:

```js
import { frameworkCellSelfTest } from './lib/block-framework-cells.mjs';
```

- [ ] **Step 6: Watch every plant fire, and watch the two menu-honesty refusals fire**

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
```

Expected: green overall, and among the output five `OK plant [...]` lines plus two `OK plant [vue] ... with the augmentation UNREACHABLE` lines. Record them. If any prints `RED`, the cell it names cannot see what it claims to see and the renderer task for that form must not start.

Now break each plant in turn and confirm the gate refuses. Do these one at a time, restoring between:

```bash
# (a) a cell that always returns clean
cd "$WT" && sed -i '' -E "s#^export const FRAMEWORK_CELLS = .*#export const FRAMEWORK_CELLS = { vue: () => [], svelte: svelteCell, angular: angularCell, solid: solidCell };#" packages/ui/scripts/lib/block-framework-cells.mjs
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && git checkout packages/ui/scripts/lib/block-framework-cells.mjs
```

Expected: FAIL, naming both vue plants with `expected a failure containing "TS2322", got CLEAN`.

```bash
# (b) menu honesty, half one: a form id with no strategy
cd "$WT" && node -e "
const p='packages/ui/dist/blocks/f/';const fs=require('fs');
const src=fs.readdirSync(p).find(f=>f.endsWith('.react.json'));
const j=JSON.parse(fs.readFileSync(p+src,'utf8'));j.form='fortran';
fs.writeFileSync(p+src.replace('.react.','.fortran.'),JSON.stringify(j,null,2));"
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && rm packages/ui/dist/blocks/f/*.fortran.json
```

Expected: FAIL with `form(s) fortran have no compile cell in scripts/lib/block-compile-cells.mjs. Add one, or the form ships with nothing compiling it.` That refusal is what ruling R15 leans on: it is why "withheld from the dropdown" needs no withhold branch anywhere.

```bash
# (c) menu honesty, half two: ONE block with no tree for a form the others emit
cd "$WT" && mkdir -p "$SCRATCH/f-bak" && mv packages/ui/dist/blocks/f/support-widget.react.json "$SCRATCH/f-bak/"
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && mv "$SCRATCH/f-bak/support-widget.react.json" packages/ui/dist/blocks/f/
```

Expected: FAIL with `support-widget [react]: the block emitted other forms but not this one, so its tree is unchecked.`

**ONE file, and moving all of them instead would produce a GREEN run** (ruling R19). `loadBlockForms` builds the `forms` axis from the file names it finds, so with every `*.react.json` gone the axis is `['html']`, every block still has its html tree, the registry index is untouched so `noForms` is empty, and the gate runs a full set of green html cells. The message above exists only for the block-shaped hole, which needs at least one other block still emitting the form. Pick any single block id that `ls packages/ui/dist/blocks/f/` shows; `support-widget` is used here because it is the block the contract spike ran.

- [ ] **Step 7: Restore, rebuild the artifacts, and run the package's gates**

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks
cd "$WT" && git status --porcelain
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run typecheck
```

Expected: green, no stray files (the doctored `dist/blocks/f/*.fortran.json` and the `$SCRATCH/f-bak` shuffle are exactly how a doctored artifact gets left behind, so `build:blocks` is run rather than trusting the restore). Confirm `ls packages/ui/dist/blocks/f/` still lists two files per block.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add packages/ui/package.json pnpm-lock.yaml packages/ui/scripts/lib/block-framework-cells.mjs packages/ui/scripts/lib/block-compile-cells.mjs packages/ui/scripts/lib/consumer-tsc-projects.mjs packages/ui/scripts/verify-scaffold-compiles.mjs
cd "$WT" && git commit -m "$(cat <<'EOF'
test(blocks): the vue, svelte, angular and solid compile cells, plants first

Each of the four runs the tool that can actually see its template. tsc cannot
read a .vue file, a .svelte file or an Angular templateUrl, so a default-project
pass over any of the three would compile the script block and nothing about the
template that carries every binding. vue-tsc IS the vue cell (ruled from the
contract spike); ngc with strictTemplates is the angular one for the same
reason; svelte-check is svelte's; solid compiles under the existing solid
project.

Seven plants, all watched before a single renderer exists. Five are template
defects each cell must NAME, not merely go red on. Two more run the vue plants
with the kit's augmentation UNREACHABLE from the program and require them to go
GREEN, which is what proves the augmentation is doing the work rather than
vue-tsc happening to be strict. Unreachable means both the shim file and the
plant's own kit import: either one alone reaches the program, so withholding
only the shim would have proved nothing.

The gate now prints what each cell checked AND what it did not: svelte types
every unknown element `any`, CUSTOM_ELEMENTS_SCHEMA suppresses angular's prop
check by design, and the solid JSX augmentation is generic. Vue is the only one
of the four that types a kai prop value, and none of the four runs anything.

vue, svelte, @angular/* , vue-tsc, svelte-check and @angular/compiler-cli become
explicit devDependencies of packages/ui. They resolved before only because
node-linker=hoisted lifts them out of examples/starters, which put a required
gate's toolchain one `rm -rf examples/starters/vue` from a failure that reads as
a broken install.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 3: the vue renderer

**Files:**
- Create: `packages/blocks/src/forms/emit.ts`
- Create: `packages/blocks/src/forms/vue.ts`
- Create: `packages/blocks/tests/vue-form.test.ts`
- Create: `packages/blocks/tests/forms-axis.test.ts`
- Modify: `packages/blocks/src/forms/index.ts`
- Modify: `packages/ui/scripts/lib/block-compile-cells.mjs` (one `STRATEGIES` entry)

**Interfaces:**
- Consumes: `parseTemplate`, `walkElements` (`../contract/parse-template`), `analyzeController`, `crossCheckBindings` (`../contract/analyze-controller`), `fileTarget` (`../targets`), `pascal` and `Block` (`../registry`), `README_FILE` and `renderReadme` (`./readme`), the `Binding` / `FormFile` / `ParsedTemplate` / `TemplateNode` / `ControllerShape` types (`../contract/types`).
- Produces: in `emit.ts`, used by Tasks 4, 5 and 6: `parseBlock(block, form): ParsedBlock`, `carriedFiles(block, target): FormFile[]`, `nullRefs`, `isKai`, `camel`, `pascalTag`, `elementInterface` and `escapeAttr`. Then `renderVueForm(block): FormFile[]`; a `vue` row in `BLOCK_FORMS`; a `vue` case in `renderBlockForm`.

The shared preamble lands here because vue is first, not because it is vue's. `html.ts` and `react.ts` each carry their own copy of it today (a deferred item in the PR B addendum); this task does NOT refactor those two, because a renderer refactor inside a renderer-addition PR is how one form quietly changes while four are being added. `emit.ts` is new code the four new renderers share, and folding html and react onto it is a small-tickets item.

- [ ] **Step 1: Write the shared preamble**

Create `packages/blocks/src/forms/emit.ts`:

```ts
/**
 * What every COMPONENT-framework renderer does before it emits a line.
 *
 * The html and cdn forms render the whole page; react, vue, svelte, angular and
 * solid render the block ROOT and share the same five steps: parse the page,
 * refuse a page with no `data-block-root`, analyze the controller, cross-check
 * the bindings against it, and work out which element interfaces the refs need.
 *
 * NOT './index': index.ts re-exports every renderer, so importing the barrel
 * from one is a cycle. Same reason `FormFile` lives in ../contract/types.
 *
 * react.ts is deliberately NOT refactored onto this. A renderer that already
 * ships, with a compile cell and a runtime cell behind it, does not get rewritten
 * inside the PR that adds four more; folding it in is a small-tickets item.
 */
import { parseTemplate, walkElements } from '../contract/parse-template';
import { analyzeController, crossCheckBindings } from '../contract/analyze-controller';
import { pascal, type Block } from '../registry';
import type { ControllerShape, FormFile, ParsedTemplate, TemplateNode } from '../contract/types';

type ElementNode = Extract<TemplateNode, { type: 'element' }>;

export const isKai = (tag: string): boolean => tag.startsWith('kai-');
/** `kai-view-stack` -> `ViewStack`. */
export const pascalTag = (tag: string): string => pascal(tag.replace(/^kai-/, ''));
/** `conversation-id` -> `conversationId`. */
export const camel = (name: string): string => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * A literal attribute VALUE, for the double-quoted attribute every renderer
 * below writes it into.
 *
 * It lives here because there was nowhere else: `react.ts` has `jsString` and
 * `jsxText`, and neither is an attribute escaper, so a renderer reaching for
 * one of those would be escaping for the wrong context. `&` first, or the
 * ampersand of an entity this function itself introduced gets escaped twice.
 * `<` is escaped too: it is legal in an attribute value in HTML but not in the
 * XML-ish templates Vue and Angular parse.
 */
export const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The element interface a `#ref` hands the controller.
 *
 * DERIVED, by the same rule react.ts states and
 * packages/ui/mcp/tests/blocks-artifacts.test.ts asserts for every element the
 * kit declares: `Kai` + PascalCase of the tag minus `kai-` + `Element`. A `#ref`
 * on a plain tag gets `HTMLElement`, because there is nothing narrower to
 * derive and inventing one would not compile.
 */
export const elementInterface = (tag: string): string =>
  isKai(tag) ? `Kai${pascalTag(tag)}Element` : 'HTMLElement';

export interface ParsedBlock {
  /** `pascal(block.name)`: the component name every emitted file is named for. */
  name: string;
  /** The authored page's path, e.g. `fixture.html`. */
  pagePath: string;
  /** `<id>.controller.ts`. */
  controllerPath: string;
  template: ParsedTemplate;
  shape: ControllerShape;
  /** The `data-block-root` element with the marker attribute removed: what a
   *  component-framework renderer emits, never the page. */
  root: ElementNode;
  /** Every `kai-` tag the ROOT subtree renders, sorted and deduped. Collected
   *  over the root rather than read off `template.kaiTags`, which is the whole
   *  body: an element in the host stand-in is not in the emitted tree, so
   *  awaiting its registration would await a definition this tree never uses. */
  tags: string[];
  /** `#ref` name -> the element interface it hands back, in document order. */
  refTypes: Map<string, string>;
}

export function parseBlock(block: Block, form: string): ParsedBlock {
  const pageEntry = block.manifest.files.find((file) => file.type === 'registry:page');
  if (!pageEntry) throw new Error(`${block.name}: no registry:page entry to render the ${form} form from`);
  const parsed = parseTemplate(block.files.get(pageEntry.path) as string, `${block.name}/${pageEntry.path}`);
  if (!parsed.template) throw new Error(`${block.name}: ${parsed.errors.join('; ')}`);

  const name = pascal(block.name);
  const controllerPath = `${block.name}.controller.ts`;
  const controllerSource = block.files.get(controllerPath);
  if (controllerSource === undefined) throw new Error(`${block.name}: the ${form} form needs ${controllerPath} (spec 3.2)`);
  const analysis = analyzeController(controllerSource, name, `${block.name}/${controllerPath}`);
  if (!analysis.shape) throw new Error(`${block.name}: ${analysis.errors.join('; ')}`);

  // The cross-check is not the gate's alone: `create-kai add` and `kai dev`
  // render without ever running checkBlockContracts, so it runs HERE too or
  // those two front doors emit a tree that calls a function nobody exports.
  const crossErrors = crossCheckBindings(parsed.template, analysis.shape, `${block.name}/${pageEntry.path}`);
  if (crossErrors.length) throw new Error(`${block.name}: ${crossErrors.join('; ')}`);

  const root = parsed.template.blockRoot;
  const subtree = walkElements([root]);
  const refTypes = new Map<string, string>();
  for (const element of subtree) {
    for (const binding of element.bindings) {
      if (binding.kind === 'ref') refTypes.set(binding.value, elementInterface(element.tag));
    }
  }

  return {
    name,
    pagePath: pageEntry.path,
    controllerPath,
    template: parsed.template,
    shape: analysis.shape,
    root: { ...root, attrs: root.attrs.filter((a) => a.name !== 'data-block-root') },
    tags: [...new Set(subtree.filter((el) => isKai(el.tag)).map((el) => el.tag))].sort(),
    refTypes,
  };
}

/** The block's own files, carried into a component tree unchanged: everything
 *  but the page and the generated `.js` twins, which only the html and cdn
 *  forms ship. */
export function carriedFiles(block: Block, target: (path: string) => string): FormFile[] {
  const out: FormFile[] = [];
  for (const entry of block.manifest.files) {
    if (entry.type === 'registry:page') continue;
    if (entry.path.endsWith('.js')) continue;
    out.push({ path: entry.path, content: block.files.get(entry.path) as string, target: target(entry.path) });
  }
  return out;
}

/** The refs object literal every adapter seeds itself with: every declared ref
 *  name, null. Same shape react's `useRef<Refs>({ ... })` takes. */
export const nullRefs = (shape: ControllerShape): string =>
  `{ ${shape.refNames.map((r) => `${r}: null`).join(', ')} }`;
```

- [ ] **Step 2: Write the failing vue suite**

Create `packages/blocks/tests/vue-form.test.ts`. It reads the SAME fixture the html and react suites read, for the reason those two state: two renderers disagreeing about one source is the defect class this round removes, and two hand-written fixtures could disagree quietly.

```ts
/**
 * The vue form: a `<script setup lang="ts">` SFC over the custom elements, plus
 * a composable holding one `shallowRef` over the controller's snapshot.
 *
 * THE THREE THINGS THAT ARE NOT OBVIOUS, each pinned below:
 *
 * 1. The template is gated on `ready`. Outside react, a generated form emits
 *    the registration import AND the whenDefined await (spec 8b, amendment 7):
 *    Vue created `<kai-conversations>` before the bundle defined it, the
 *    property landed on a plain HTMLElement, the upgrade discarded it, and the
 *    block rendered a search box it does not have.
 * 2. A kai prop is bound with the CAMELCASE name and the `.prop` modifier.
 *    Camel because `KaiElementVueProps` carries an index signature and an
 *    explicit member only wins when the name matches it, so the kebab spelling
 *    would type as `unknown` and check nothing. `.prop` because these are
 *    properties: an attribute stringifies, and `unread="false"` reads as true.
 * 3. A `="false"` or bare-boolean literal on a kai element becomes `:name="false"`
 *    / `:name="true"` (spec 8b, amendment 8 (F-10)). The kit's own default-true-flag
 *    idiom does not survive translation: vue-tsc rejects the string against the
 *    generated `boolean`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderVueForm } from '../src/forms';
import type { Block } from '../src/registry';

const FIXTURES = resolve(__dirname, 'fixtures');
const PAGE = readFileSync(join(FIXTURES, 'fixture.html'), 'utf8');
const CONTROLLER = readFileSync(join(FIXTURES, 'fixture.controller.ts'), 'utf8');

const block = (): Block => ({
  name: 'fixture',
  manifest: {
    name: 'fixture', title: 'F', description: 'f', type: 'registry:block',
    files: [
      { path: 'fixture.html', type: 'registry:page' },
      { path: 'fixture.controller.ts', type: 'registry:file' },
      { path: 'fixture.css', type: 'registry:file' },
    ],
  },
  files: new Map([
    ['fixture.html', PAGE],
    ['fixture.controller.ts', CONTROLLER],
    ['fixture.css', readFileSync(join(FIXTURES, 'fixture.css'), 'utf8')],
  ]),
});

const byPath = (files: { path: string; content: string }[]) => new Map(files.map((f) => [f.path, f.content]));

describe('the vue form', () => {
  it('emits the SFC, the composable, the controller, the css and a README', () => {
    expect([...byPath(renderVueForm(block())).keys()].sort()).toEqual([
      'Fixture.vue', 'README.md', 'fixture.controller.ts', 'fixture.css', 'useFixture.ts',
    ]);
  });

  it('targets every file at src/components/<id>/', () => {
    for (const file of renderVueForm(block())) expect(file.target).toBe(`src/components/fixture/${file.path}`);
  });

  it('gates the tree on registration, and awaits the tags the ROOT renders', () => {
    const files = byPath(renderVueForm(block()));
    const sfc = files.get('Fixture.vue')!;
    const composable = files.get('useFixture.ts')!;
    expect(composable).toContain("import '@kitn.ai/ui/elements';");
    expect(composable).toContain('customElements.whenDefined');
    // Derived from the fixture, not typed: every kai tag inside the block root,
    // sorted. `kai-dock`, `kai-conversations`, `kai-conversation-item`.
    expect(composable).toContain(
      `const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];`,
    );
    expect(sfc).toContain('v-if="ready"');
  });

  it('binds a kai property by its CAMELCASE name with the .prop modifier', () => {
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain(':unread.prop="state.hidden"');
    // The camel case is what makes the declared member win over
    // KaiElementVueProps's index signature. A kebab spelling here types as
    // `unknown` and vue-tsc checks nothing, which is the exact green-on-nothing
    // the compile cell's second plant exists to catch.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations .activeId="title">'),
    );
    expect(byPath(renderVueForm(b)).get('Fixture.vue')).toContain(':activeId.prop="state.title"');
  });

  it('binds a :attr on a kai element as a property too, under the camel name', () => {
    // Same rule the react renderer applies: `:attr` on a kai element is the
    // camelCase PROPERTY. An attribute stringifies, so `unread="false"` would
    // read as true, which is the boolean trap in three of the five frameworks.
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain(':unread.prop="row.unread"');
  });

  it('translates a ="false" literal and a bare boolean on a kai element', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false" compact>'),
    );
    const sfc = byPath(renderVueForm(b)).get('Fixture.vue')!;
    expect(sfc).toContain(':searchable="false"');
    expect(sfc).toContain(':compact="true"');
    expect(sfc).not.toContain('searchable="false"');
  });

  it('emits a seed as a static attribute, never as a bound one', () => {
    // A seed is written once. In react that is a mount effect; everywhere else
    // it is a plain attribute, because nothing re-applies it     // amendment 5).
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain('position="bottom-end"');
    expect(sfc).not.toContain(':position');
  });

  it('wires an event straight to the action, with no handler name to invent', () => {
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain('@kai-click="actions.open"');
  });

  it('renders .textContent as children and a *for as a keyed v-for', () => {
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain('{{ state.title }}');
    expect(sfc).toContain('v-for="row in state.rows"');
    expect(sfc).toContain(':key="row.id"');
    expect(sfc).toContain('{{ row.title }}');
    // The loop item is read through the item, never through state.
    expect(sfc).not.toMatch(/state\.row\./);
  });

  it('takes a ref through useTemplateRef, typed by the element interface the tag names', () => {
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain("import type { KaiDockElement } from '@kitn.ai/ui/elements';");
    expect(sfc).toContain(`const dock = useTemplateRef<KaiDockElement>('dock');`);
    expect(sfc).toContain('useFixture(() => ({ dock: dock.value }))');
    expect(sfc).toContain('ref="dock"');
    // No cast anywhere: `useTemplateRef<T>` gives `T | null`, which is exactly
    // what the controller's Refs declares. Matched as a CAST rather than as the
    // substring " as ", which any future comment could contain and which would
    // quietly turn this into a prose guard.
    expect(sfc).not.toMatch(/\bas\s+Kai\w+Element\b/);
    expect(sfc).not.toMatch(/\bas\s+HTMLElement\b/);
  });

  it('emits the composable as ONE shallowRef over the controller snapshot', () => {
    const composable = byPath(renderVueForm(block())).get('useFixture.ts')!;
    expect(composable).toContain('shallowRef<FixtureState>(controller.state())');
    expect(composable).toContain('createController({ refs })');
    expect(composable).toContain('controller.subscribe(');
    expect(composable).toContain('void controller.actions.boot();');
    expect(composable).toContain("from './fixture.controller'");
  });

  it('names the one config line a Vue project needs, in the README', () => {
    const readme = byPath(renderVueForm(block())).get('README.md')!;
    expect(readme).toContain('isCustomElement');
    expect(readme).toContain('Fixture.vue');
  });

  it('cross-checks the bindings against the controller, as every other form does', () => {
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderVueForm(b)).toThrow(/nope/);
  });

  it('refuses a block with no controller, by the file name it wanted', () => {
    const b = block();
    (b.files as Map<string, string>).delete('fixture.controller.ts');
    expect(() => renderVueForm(b)).toThrow(/fixture\.controller\.ts/);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/vue-form.test.ts
```

Expected: every case FAILS at import, `renderVueForm is not exported by ../src/forms`. That is the correct first red; the per-case reds arrive as Step 4 lands.

- [ ] **Step 4: Write the renderer**

Create `packages/blocks/src/forms/vue.ts`. The full emitted output for the fixture is the contract, and it is this, exactly:

`Fixture.vue`
```vue
<script setup lang="ts">
// GENERATED by @kitn.ai/blocks from fixture.html and fixture.controller.ts.
// It is your code now: edit freely, and regenerate to start over.
import { useTemplateRef } from 'vue';
import type { KaiDockElement } from '@kitn.ai/ui/elements';
import { useFixture } from './useFixture';
import './fixture.css';

const dock = useTemplateRef<KaiDockElement>('dock');
const { state, actions, ready } = useFixture(() => ({ dock: dock.value }));
</script>

<template>
  <kai-dock
    v-if="ready"
    ref="dock"
    position="bottom-end"
    :unread.prop="state.hidden"
    @kai-click="actions.open"
  >
    <span>{{ state.title }}</span>
    <kai-conversations>
      <kai-conversation-item
        v-for="row in state.rows"
        :key="row.id"
        :unread.prop="row.unread"
      >
        <span>{{ row.title }}</span>
      </kai-conversation-item>
    </kai-conversations>
  </kai-dock>
</template>
```

`useFixture.ts`
```ts
// GENERATED by @kitn.ai/blocks: the vue adapter.
// One shallowRef over the controller's snapshot: nothing is mirrored and no
// effect re-derives anything. shallowRef rather than ref because the controller
// hands back a NEW state object per notification and the kai- reactivity
// contract wants a new array reference for a list prop anyway, so deep
// reactivity would only cost proxies over data that is replaced wholesale.
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
// The add form's registration, not the autoloader's: the autoloader resolves
// element modules relative to its own URL and 404s every one of them through a
// bundler.
import '@kitn.ai/ui/elements';
import {
  createController,
  type FixtureActions,
  type FixtureRefs,
  type FixtureState,
} from './fixture.controller';

// Every kai- tag the block root renders. The template is gated on these being
// DEFINED: an element created before its definition lands discards a property
// set on it, and the upgrade does not put it back (spec 8b, amendment 7).
const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];

export interface UseFixture {
  state: ShallowRef<FixtureState>;
  actions: FixtureActions;
  ready: Ref<boolean>;
}

export function useFixture(refs: () => FixtureRefs): UseFixture {
  const controller = createController({ refs });
  const state = shallowRef<FixtureState>(controller.state());
  const ready = ref(false);
  let unsubscribe: (() => void) | undefined;

  onMounted(async () => {
    unsubscribe = controller.subscribe(() => {
      state.value = controller.state();
    });
    await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));
    ready.value = true;
    void controller.actions.boot();
  });
  onUnmounted(() => unsubscribe?.());

  return { state, actions: controller.actions, ready };
}
```

`README.md` comes from `renderReadme(block, lines)` with:

```ts
  [
    `Render it: \`<${name} />\`, from \`./${name}.vue\`.`,
    '',
    "Vue resolves every tag as a component first, so add `vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('kai-') } } })` to your vite config or it will warn about each `kai-` element.",
  ]
```

The renderer itself follows `react.ts`'s structure exactly: a `printNode(node, pad, scope, emit)` recursion over the root, a `bindingProp` switch over the five binding kinds, and a `literalProp` for authored attributes. The four functions that differ from react's are:

```ts
/** The template NAME a binding lands on. Camel for a kai element, because
 *  `KaiElementVueProps` carries an index signature and an explicit member only
 *  wins when the name matches it: the kebab spelling types as `unknown` and
 *  vue-tsc then checks nothing. Verbatim otherwise, which is what a plain
 *  element's attribute is. */
function propName(tag: string, name: string): string {
  return isKai(tag) ? camel(name) : name;
}

/** A literal attribute in the template.
 *
 *  A bare boolean and a `="true"` / `="false"` on a KAI element become bound
 *  literals (spec 8b, amendment 8 (F-10)): the generated prop is `boolean`, and
 *  vue-tsc rejects the string against it. On a plain element they stay
 *  attributes, because that is what they are in HTML. */
function literalAttr(tag: string, name: string, value: string): string {
  if (!isKai(tag)) return value === '' ? name : `${name}="${escapeAttr(value)}"`;
  if (value === '') return `:${propName(tag, name)}="true"`;
  if (value === 'true' || value === 'false') return `:${propName(tag, name)}="${value}"`;
  return `${name}="${escapeAttr(value)}"`;
}

/** One binding as a template attribute. */
function bindingAttr(tag: string, b: Binding, scope: string | undefined): string | null {
  switch (b.kind) {
    case 'prop':
      // `.textContent` is emitted as CHILDREN, never as a binding: it is not a
      // Vue prop and binding it is silently wrong (spec 8b, amendment 2).
      return b.name === 'textContent' ? null : `:${propName(tag, b.name)}.prop="${read(b.value, scope)}"`;
    case 'attr':
      // THE SAME as a `.prop` on a kai element, deliberately, and the react
      // renderer decided this first: an attribute stringifies, so a bound
      // `false` would write `unread="false"` and the element would read it as
      // true. On a plain element it is a real attribute binding.
      return isKai(tag)
        ? `:${propName(tag, b.name)}.prop="${read(b.value, scope)}"`
        : `:${b.name}="${read(b.value, scope)}"`;
    case 'event':
      // No handler name to invent: Vue camelizes `@kai-click` to the
      // `onKaiClick` the kit's own Events type declares.
      return `@${b.name}="actions.${b.value}"`;
    case 'ref':
      return `ref="${b.name}"`;
    case 'seed':
      return null; // a static attribute, emitted from `attrs` below
  }
}
```

Seeds are emitted as static attributes ahead of the literals: `seedAttrs(node)` maps each `seed:` binding to `${b.name}="${escapeAttr(b.value)}"`. The `v-if="ready"` and the `v-for` / `:key` pair are emitted on the root and on a repeated element respectively, both ahead of every other attribute so the template reads top-down.

- [ ] **Step 5: Add the ROW, and nothing else yet**

The row alone, so that Step 6 can watch the two couplings this plan leans on actually refuse. The `switch` case, the re-export and the `STRATEGIES` entry all land in Step 6, after their reds.

In `packages/blocks/src/forms/index.ts`:

```ts
export const BLOCK_FORMS = [
  { id: 'html', label: 'HTML' },
  { id: 'react', label: 'React' },
  { id: 'vue', label: 'Vue' },
  { id: 'cdn', label: 'CDN single file' },
] as const;
```

- [ ] **Step 6: Watch the exhaustiveness and the honesty couplings fire, then complete the wiring**

The row is in and nothing renders it yet. That is deliberate: it is the state in which both mechanisms refuse.

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
```

Expected: FAIL, `src/forms/index.ts(...): error TS2366: Function lacks ending return statement and return type does not include 'undefined'` on `renderBlockForm`. That is what stands between "a `--form` value `BLOCK_FORMS` accepts" and "add silently writes the html tree for it". Now add the re-export and the case:

```ts
export { renderVueForm } from './vue';
```

```ts
    case 'vue': return renderVueForm(block);
```

Re-run the typecheck and confirm green. Then, still WITHOUT the `STRATEGIES` entry:

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
```

Expected: FAIL, `form(s) vue have no compile cell in scripts/lib/block-compile-cells.mjs. Add one, or the form ships with nothing compiling it.` Now add the entry, in `packages/ui/scripts/lib/block-compile-cells.mjs`:

```js
import { CELL_NOTES, FRAMEWORK_CELLS } from './block-framework-cells.mjs';
...
const STRATEGIES = { react: reactCell, html: htmlCell, vue: FRAMEWORK_CELLS.vue };
```

Re-run `verify:scaffold` and confirm green. Those two reds together are ruling R9: the tree cannot be green with an unchecked form.

- [ ] **Step 7: Write the axis suite, and run everything**

Create `packages/blocks/tests/forms-axis.test.ts`:

```ts
/**
 * THE AXIS ITSELF. Every consumer of the forms list derives from it, so the one
 * thing worth asserting here is that the list is internally coherent: every id
 * renders, every framework id has an install root, and the dispatch covers all
 * of them.
 *
 * The block is the shared fixture rather than a real one, so this stays a fact
 * about the AXIS and not about any block's content.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BLOCK_FORMS, FRAMEWORK_BLOCK_FORMS, renderBlockForm } from '../src/forms';
import { fileTarget, isTargetFramework } from '../src/targets';
import type { Block } from '../src/registry';

const FIXTURES = resolve(__dirname, 'fixtures');
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const block = (): Block => ({
  name: 'fixture',
  manifest: {
    name: 'fixture', title: 'F', description: 'f', type: 'registry:block',
    files: [
      { path: 'fixture.html', type: 'registry:page' },
      { path: 'fixture.controller.ts', type: 'registry:file' },
      { path: 'fixture.controller.js', type: 'registry:file' },
      { path: 'fixture.css', type: 'registry:file' },
    ],
  },
  files: new Map([
    ['fixture.html', read('fixture.html')],
    ['fixture.controller.ts', read('fixture.controller.ts')],
    // The html form needs a stripped twin on disk; identity is enough here,
    // because what is under test is the AXIS, not the strip.
    ['fixture.controller.js', read('fixture.controller.ts')],
    ['fixture.css', read('fixture.css')],
  ]),
});

describe('the delivery-form axis', () => {
  it('has more than one framework form, so every loop below is non-vacuous', () => {
    expect(FRAMEWORK_BLOCK_FORMS.length).toBeGreaterThan(1);
    expect(BLOCK_FORMS.length).toBeGreaterThan(FRAMEWORK_BLOCK_FORMS.length);
  });

  it('never offers cdn as a framework: it is the paste form', () => {
    expect(FRAMEWORK_BLOCK_FORMS.some((f) => f.id === 'cdn')).toBe(false);
  });

  it('every framework form id has an install root', () => {
    for (const form of FRAMEWORK_BLOCK_FORMS) {
      expect(isTargetFramework(form.id), `${form.id} has no row in INSTALL_ROOTS`).toBe(true);
    }
  });

  for (const form of BLOCK_FORMS) {
    it(`${form.id}: renderBlockForm emits a non-empty tree with derived targets`, () => {
      const files = renderBlockForm(block(), form.id, { cdn: { version: '0.0.0-test' } });
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(file.target, `${form.id}/${file.path}`).toBe(
          isTargetFramework(form.id) ? fileTarget(form.id, 'fixture', file.path) : file.path,
        );
      }
    });
  }

  it('every framework form ships a README, and cdn ships exactly one file', () => {
    for (const form of FRAMEWORK_BLOCK_FORMS) {
      const files = renderBlockForm(block(), form.id, { cdn: { version: '0.0.0-test' } });
      expect(files.some((f) => f.path === 'README.md'), `${form.id} has no README`).toBe(true);
    }
    expect(renderBlockForm(block(), 'cdn', { cdn: { version: '0.0.0-test' } })).toHaveLength(1);
  });
});
```

**Watch it fail before trusting it.** It is a new guard, and the Global Constraint applies to it exactly as it does to the renderer suites.

Do NOT plant it by mutating `INSTALL_ROOTS`: the renderer and the assertion both read `fileTarget()`, so moving the root moves both sides and the suite stays green. That is worth knowing about this suite rather than discovering later, and it is what the plant has to be chosen around. The defect the per-form case can actually see is a renderer that computed a target WITHOUT `fileTarget()`, so plant that: in `packages/blocks/src/forms/vue.ts`, temporarily emit one file with `target: file.path` instead of the derived one, and run:

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/forms-axis.test.ts
```

Expected: FAIL in the `vue: renderBlockForm emits a non-empty tree with derived targets` case, whose message names `vue/Fixture.vue` and prints the two paths that disagree. Then plant the second shape: delete the `README.md` entry from the vue renderer's output and watch `every framework form ships a README` fail with `vue has no README`. Revert both, re-run, confirm green.

Then:

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/docs run test
```

Expected: all green, and three things move WITHOUT an edit, which the reports must state:

- `verify:scaffold` prints one more form in its cell line (`html, react, vue`) and one more cell per block, plus the `vue vue-tsc ...` note.
- `create-kai`'s suite now drives `--form vue` through a real `runAdd`, and its detection row for `vue` flips from `html` to `vue` in `add.test.ts`'s derived expectation, and the "a framework with no generated tree is told so" case takes its `emitsVue` branch.
- `apps/docs`'s dropdown test passes with three rows, having never been edited.

If any of those three needed a hand edit, stop: ruling R10 has been broken and the derivation is not doing the work.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add packages/blocks packages/ui/scripts/lib/block-compile-cells.mjs
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the vue delivery form

A `<script setup lang="ts">` SFC over the custom elements plus a composable
holding one shallowRef over the controller's snapshot. vue-tsc is its compile
cell, with the kit's GlobalComponents augmentation reachable, so this is the one
of the four new forms whose kai prop VALUES are type-checked.

Three decisions the emitted code makes and says out loud. The template is gated
on registration, because outside react a generated form needs the registration
import AND the whenDefined await (spec 8b, amendment 7). A kai binding uses the
CAMELCASE name with `.prop`, because KaiElementVueProps carries an index
signature and an explicit member only wins when the name matches it, so the
kebab spelling would type as `unknown` and check nothing. And `:attr` on a kai
element is a property too, the rule the react renderer set first: an attribute
stringifies, so a bound `false` would write unread="false" and the element would
read it as true.

The row and the cell land together. Both couplings were watched red first: the
row without the switch case is TS2366 on renderBlockForm, and the row without
the STRATEGIES entry is a hard failure naming the missing cell.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 4: the svelte renderer

**Files:**
- Create: `packages/blocks/src/forms/svelte.ts`
- Create: `packages/blocks/tests/svelte-form.test.ts`
- Modify: `packages/blocks/src/forms/index.ts`
- Modify: `packages/ui/scripts/lib/block-compile-cells.mjs`

**Interfaces:**
- Consumes: `parseBlock`, `carriedFiles`, `nullRefs`, `isKai`, `camel`, `elementInterface`, `escapeAttr` from `./emit` (Task 3); `README_FILE` and `renderReadme` from `./readme`; `fileTarget` from `../targets`.
- Produces: `renderSvelteForm(block): FormFile[]`; a `svelte` row in `BLOCK_FORMS`; a `svelte` case in `renderBlockForm`; `STRATEGIES.svelte`.

**Where this plan follows the spec's INTENT and not its mechanism, stated up front.** Spec 3.5's table says the svelte form uses "`$effect` for property assignment". Reading Svelte 5.56's own runtime settles it differently: `set_custom_element_data` (`node_modules/svelte/src/internal/client/dom/elements/attributes.js:226-271`) sets the PROPERTY when the element is registered and the name is one of its setters, and falls back to `setAttribute` otherwise; and `set_attribute` (`:172-208`) assigns the property for a non-string value whose name is a setter, so `<span hidden={false}>` sets `hidden = false` rather than writing the string `"false"`. With the tree gated on registration, a plain `unread={...}` attribute in the template IS a property assignment. So the intent (properties get assigned, and a bound `false` does not read as true) is met, and a hand-rolled `$effect` per binding is not needed. `$effect` is still used, for the one job only it can do: the registration await, which must not run during SSR.

- [ ] **Step 1: Write the failing svelte suite**

Create `packages/blocks/tests/svelte-form.test.ts`. The fixture setup block is the same three files the vue suite reads (`fixture.html`, `fixture.controller.ts`, `fixture.css` from `packages/blocks/tests/fixtures/`), loaded into a `Block` with the same `manifest.files` list and the same `byPath` helper; copy it from `vue-form.test.ts` and change the import to `renderSvelteForm`. The cases that are svelte's own:

```ts
describe('the svelte form', () => {
  it('emits the component, the rune adapter, the controller, the css and a README', () => {
    expect([...byPath(renderSvelteForm(block())).keys()].sort()).toEqual([
      'Fixture.svelte', 'README.md', 'fixture.controller.ts', 'fixture.css', 'useFixture.svelte.ts',
    ]);
  });

  it('names the adapter .svelte.ts, because runes do not compile in a plain module', () => {
    // `$state` outside a .svelte or .svelte.ts file is a compile error, not a
    // silent no-op, so the extension is load-bearing rather than a convention.
    const adapter = byPath(renderSvelteForm(block())).get('useFixture.svelte.ts')!;
    expect(adapter).toContain('$state');
    expect(adapter).toContain('$effect');
  });

  it('targets every file at src/lib/components/<id>/', () => {
    for (const file of renderSvelteForm(block())) {
      expect(file.target).toBe(`src/lib/components/fixture/${file.path}`);
    }
  });

  it('does the registration await inside $effect, which never runs on the server', () => {
    const adapter = byPath(renderSvelteForm(block())).get('useFixture.svelte.ts')!;
    expect(adapter).toContain("import '@kitn.ai/ui/elements';");
    expect(adapter).toContain(`const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];`);
    expect(adapter).toMatch(/\$effect\(\(\) => \{[\s\S]*customElements\.whenDefined/);
    // `customElements` does not exist on the server, and a SvelteKit page
    // renders this component there. `$effect` is browser-only, which is the
    // whole reason the await lives in one rather than at call time.
    //
    // Asserted as CONTAINMENT, not absence. The emitted adapter's await IS
    // indented, so a `/^\s*await Promise\.all\(TAGS/m` absence check would match
    // the correct line and fail against the renderer this task specifies. What
    // must not exist is the same await at module top level, with no indentation
    // and no effect around it.
    expect(adapter).toMatch(/\$effect\(\(\) => \{[\s\S]*await Promise\.all\(TAGS/);
    expect(adapter).not.toMatch(/^await Promise\.all\(TAGS/m);
  });

  it('gates the tree on ready, and takes the ref through bind:this', () => {
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('{#if fixture.ready}');
    expect(sfc).toContain("import type { KaiDockElement } from '@kitn.ai/ui/elements';");
    expect(sfc).toContain('let dock = $state<KaiDockElement | null>(null);');
    expect(sfc).toContain('bind:this={dock}');
    expect(sfc).toContain('useFixture(() => ({ dock }))');
  });

  it('binds a kai prop by its camel name, plainly, and says why that is a property', () => {
    // Svelte's set_custom_element_data assigns the PROPERTY when the element is
    // registered and the name is one of its setters, and the tree is gated on
    // registration. So a plain attribute here IS the property assignment, and a
    // bound `false` does not become the string "false".
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('unread={fixture.state.hidden}');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations .activeId="title">'),
    );
    expect(byPath(renderSvelteForm(b)).get('Fixture.svelte')).toContain('activeId={fixture.state.title}');
  });

  it('wires an event with the on<name> attribute svelte 5 compiles to addEventListener', () => {
    // Verified against svelte 5.56's compiler: `onkai-click={fn}` emits
    // `$.event('kai-click', node, fn)`, which is exactly right for an event
    // that does not bubble.
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('onkai-click={fixture.actions.open}');
  });

  it('renders a *for as a KEYED each, which is what the mandatory :key becomes here', () => {
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('{#each fixture.state.rows as row (row.id)}');
    expect(sfc).toContain('{row.title}');
    expect(sfc).not.toMatch(/state\.row\./);
  });

  it('emits a seed as a static attribute and a ="false" literal as a bound false', () => {
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('position="bottom-end"');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false" compact>'),
    );
    const other = byPath(renderSvelteForm(b)).get('Fixture.svelte')!;
    expect(other).toContain('searchable={false}');
    expect(other).toContain('compact={true}');
  });

  it('the README says how to render it and claims no config a Svelte project does not need', () => {
    const readme = byPath(renderSvelteForm(block())).get('README.md')!;
    expect(readme).toContain('Fixture.svelte');
    // Svelte needs no isCustomElement equivalent: any dashed tag is an element.
    expect(readme).not.toContain('isCustomElement');
  });

  it('cross-checks the bindings against the controller', () => {
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderSvelteForm(b)).toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/svelte-form.test.ts
```

Expected: every case FAILS at import, `renderSvelteForm is not exported by ../src/forms`.

- [ ] **Step 3: Write the renderer**

Create `packages/blocks/src/forms/svelte.ts`. The emitted output for the fixture is the contract, and it is this, exactly:

`Fixture.svelte`
```svelte
<script lang="ts">
  // GENERATED by @kitn.ai/blocks from fixture.html and fixture.controller.ts.
  // It is your code now: edit freely, and regenerate to start over.
  //
  // A kai prop is set PLAINLY here and it still lands as a property: Svelte's
  // set_custom_element_data assigns the property when the element is registered
  // and the name is one of its setters, and this tree does not render until
  // registration is done. That is also why a bound `false` clears rather than
  // writing the string "false".
  import type { KaiDockElement } from '@kitn.ai/ui/elements';
  import { useFixture } from './useFixture.svelte';
  import './fixture.css';

  let dock = $state<KaiDockElement | null>(null);
  const fixture = useFixture(() => ({ dock }));
</script>

{#if fixture.ready}
  <kai-dock
    bind:this={dock}
    position="bottom-end"
    unread={fixture.state.hidden}
    onkai-click={fixture.actions.open}
  >
    <span>{fixture.state.title}</span>
    <kai-conversations>
      {#each fixture.state.rows as row (row.id)}
        <kai-conversation-item unread={row.unread}>
          <span>{row.title}</span>
        </kai-conversation-item>
      {/each}
    </kai-conversations>
  </kai-dock>
{/if}
```

`useFixture.svelte.ts`
```ts
// GENERATED by @kitn.ai/blocks: the svelte adapter.
// `.svelte.ts`, not `.ts`: the runes compiler runs on `.svelte` and `.svelte.ts`
// files only, so `$state` in a plain module is a compile error.
//
// The add form's registration, not the autoloader's: the autoloader resolves
// element modules relative to its own URL and 404s every one of them through a
// bundler.
import '@kitn.ai/ui/elements';
import {
  createController,
  type FixtureActions,
  type FixtureRefs,
  type FixtureState,
} from './fixture.controller';

// Every kai- tag the block root renders. The template is gated on these being
// DEFINED: an element created before its definition lands discards a property
// set on it, and the upgrade does not put it back (spec 8b, amendment 7).
const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];

export interface UseFixture {
  readonly state: FixtureState;
  readonly actions: FixtureActions;
  readonly ready: boolean;
}

export function useFixture(refs: () => FixtureRefs): UseFixture {
  const controller = createController({ refs });
  let snapshot = $state<FixtureState>(controller.state());
  let ready = $state(false);

  // IN AN EFFECT, and that is the SSR answer rather than a style choice:
  // `$effect` runs in the browser only, and `customElements` does not exist on
  // the server, so a SvelteKit page rendering this component would throw.
  $effect(() => {
    const unsubscribe = controller.subscribe(() => {
      snapshot = controller.state();
    });
    void (async () => {
      await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));
      ready = true;
      await controller.actions.boot();
    })();
    return unsubscribe;
  });

  return {
    get state() { return snapshot; },
    get actions() { return controller.actions; },
    get ready() { return ready; },
  };
}
```

`README.md` lines: `` [`Render it: \`<${name} />\`, from \`./${name}.svelte\`.`] `` and nothing else. Svelte needs no custom-element configuration: any dashed tag is an element.

The differing functions from Task 3's vue renderer:

```ts
/** One binding as a svelte attribute. */
function bindingAttr(tag: string, b: Binding, scope: string | undefined): string | null {
  switch (b.kind) {
    case 'prop':
      return b.name === 'textContent' ? null : `${propName(tag, b.name)}={${read(b.value, scope)}}`;
    case 'attr':
      // The same spelling as a prop on a kai element, and it lands as a property
      // for the same reason: set_custom_element_data prefers the setter once the
      // element is registered, which the `ready` gate guarantees.
      return `${propName(tag, b.name)}={${read(b.value, scope)}}`;
    case 'event':
      // `onkai-click` compiles to `$.event('kai-click', node, handler)` in
      // svelte 5, which is addEventListener with the exact name. Correct for an
      // event that does not bubble.
      return `on${b.name}={fixture.actions.${b.value}}`;
    case 'ref':
      return `bind:this={${b.name}}`;
    case 'seed':
      return null;
  }
}

/** A literal attribute. A bare boolean and a `="true"` / `="false"` on a kai
 *  element become expressions, so the element sees a boolean rather than a
 *  string (spec 8b, amendment 8 (F-10)). */
function literalAttr(tag: string, name: string, value: string): string {
  if (!isKai(tag)) return value === '' ? name : `${name}="${escapeAttr(value)}"`;
  if (value === '') return `${propName(tag, name)}={true}`;
  if (value === 'true' || value === 'false') return `${propName(tag, name)}={${value}}`;
  return `${name}="${escapeAttr(value)}"`;
}
```

A repeated element is wrapped in `{#each ${read(repeat.list, scope)} as ${repeat.item} (${repeat.key})}` / `{/each}` rather than carrying an attribute, and `.textContent` becomes `{${read(value, scope)}}` as the element's only child. The whole tree is wrapped in `{#if fixture.ready}` / `{/if}`.

- [ ] **Step 4: Add the row, the case, the re-export and the cell**

`packages/blocks/src/forms/index.ts`: `export { renderSvelteForm } from './svelte';`, a `{ id: 'svelte', label: 'Svelte' }` row after `vue`, and `case 'svelte': return renderSvelteForm(block);`. `packages/ui/scripts/lib/block-compile-cells.mjs`: `svelte: FRAMEWORK_CELLS.svelte` in `STRATEGIES`.

- [ ] **Step 5: Run everything**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/docs run test
```

Expected: green, `verify:scaffold`'s form list now `html, react, svelte, vue` (it prints them sorted), and its printed notes now include the svelte line naming what it cannot see. Record the new cell count.

**If `svelte-check` reports anything, read it before changing the renderer, and do not reach for the flag.** The unused-CSS warning people expect here cannot fire: `svelte-check` reports `Unused CSS selector` only for selectors in a `<style>` block INSIDE the component, and the emitted `Fixture.svelte` has none. The block's stylesheet arrives as `import './fixture.css';` in the script, which `svelte-check` never analyses at all (spiked, Facts table). So the block being authored for the html form's whole page is not a risk to this cell.

What `--fail-on-warnings` does catch is warnings about the EMITTED MARKUP: a11y warnings on the slotted `<span>`s, `state_referenced_locally`, and the rest of the runes warning set. Those are exactly the ones worth having, so the flag stays. If one fires, the fix is the renderer, not the cell.

- [ ] **Step 6: Commit**

```bash
cd "$WT" && git add packages/blocks packages/ui/scripts/lib/block-compile-cells.mjs
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the svelte delivery form

A `.svelte` component over the custom elements plus a `.svelte.ts` rune adapter
holding one `$state` snapshot. The extension is load-bearing: `$state` in a
plain module is a compile error, not a silent no-op.

Follows the spec's INTENT rather than its mechanism, and says which. Spec 3.5
prescribes `$effect` for property assignment; svelte 5.56's own
set_custom_element_data assigns the property whenever the element is registered
and the name is one of its setters, and this tree is gated on registration, so a
plain attribute IS the property assignment and a bound `false` does not become
the string "false". `$effect` is still used for the one job only it can do: the
registration await, which must not run during SSR because `customElements` does
not exist on the server.

`onkai-click` was verified against the compiler to emit
`$.event('kai-click', node, handler)`, and the keyed `{#each ... (row.id)}` to
carry the mandatory :key through.

svelte-check is the compile cell. The gate prints what it cannot see: svelte
types every unknown element `any`, so a wrong kai prop NAME is invisible to it
and only the expressions are checked.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 5: the angular renderer

**Files:**
- Modify: `packages/blocks/src/contract/types.ts` (`ControllerShape` gains `actionArity`)
- Modify: `packages/blocks/src/contract/analyze-controller.ts` (read the parameter counts)
- Modify: `packages/blocks/tests/analyze-controller.test.ts` (the whole-shape assertion, plus an arity case)
- Create: `packages/blocks/src/forms/angular.ts`
- Create: `packages/blocks/tests/angular-form.test.ts`
- Modify: `packages/blocks/src/forms/index.ts`
- Modify: `packages/ui/scripts/lib/block-compile-cells.mjs`

**Interfaces:**
- Consumes: `parseBlock`, `carriedFiles`, `nullRefs`, `isKai`, `camel`, `elementInterface`, `escapeAttr` from `./emit`; `renderReadme` from `./readme`; `fileTarget` from `../targets`; `ControllerShape.actionArity`, which Step 1 adds.
- Produces: `actionArity` on `ControllerShape` (additive, so `react.ts`, `html.ts` and `checkBlockContracts` are untouched); `renderAngularForm(block): FormFile[]`; an `angular` row in `BLOCK_FORMS`; an `angular` case in `renderBlockForm`; `STRATEGIES.angular`.

**This is the one task that widens a type three renderers share**, and it is why it is bigger than Tasks 4 and 6. Ruling R18 has the argument; Step 1 does the work, first, on its own, watched red.

Three shape decisions this task makes, each because the alternative is worse and neither is recoverable from the spec:

- **The store is `@Injectable()` with no `providedIn`, provided in the component's own `providers`.** Spec 3.5 says "an injectable service over the controller". A controller belongs to a component INSTANCE (it owns conversation state and a subscription), so `providedIn: 'root'` would give two instances of the block one controller.
- **There is no `<name>.component.css`.** Spec 3.5's table writes `<name>.component.{ts,html,css}`, but the block already ships its own stylesheet and the component names it through `styleUrls`. A second, empty file would be a file nobody reads. Angular scopes it with the default emulated encapsulation, and the README says so, because a rule authored to reach the host page will not.
- **`ngAfterViewInit`, not the constructor.** `viewChild()` has nothing before the view exists, and `customElements.whenDefined` must not run during SSR.

- [ ] **Step 1: Teach `analyzeController` the action arities, watched failing first**

Angular is the only host that CALLS the action from the template, so it is the only one that needs to know whether the action takes the event. Ruling R18 says why no rule over the event NAME works: `kai-click` carries no detail, and `support-widget.controller.ts` mixes both arities across `kai-*` events in one template.

Add the assertion first, to `packages/blocks/tests/analyze-controller.test.ts`. The existing `GOOD` fixture already has all three shapes (`back(): void`, `submit(event: CustomEvent<{ value: string }>): Promise<void>`, `boot(): Promise<void>`), so nothing new has to be authored:

```ts
  it('records how many parameters each action declares', () => {
    // Angular's event binding is a STATEMENT, so `strictTemplates` type-checks
    // the call: a zero-arg action called with $event is TS2554 "Expected 0
    // arguments, but got 1", and a one-arg action called with none is TS2554
    // the other way. Nothing about the event NAME predicts it -- kai-click
    // carries no detail, and the real blocks mix both arities across kai-*
    // events in one template -- so the renderer reads the declaration.
    const out = analyzeController(GOOD, 'Widget', 'fixture/w.controller.ts');
    expect(out.shape?.actionArity).toEqual({ back: 0, submit: 1, boot: 0 });
  });
```

and add `actionArity: { back: 0, submit: 1, boot: 0 }` to the existing whole-shape `toEqual` in "reads the state fields, the action names and the ref names".

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/analyze-controller.test.ts
```

Expected: FAIL, two cases. The new one gets `expected undefined to deeply equal { back: 0, ... }`; the existing whole-shape case fails on the missing key, which is the useful half: it proves nothing else in the repo constructs a `ControllerShape`, because if anything did, it would be red here too. (`analyzeController` is the only constructor: grepped.)

Then make it pass. In `packages/blocks/src/contract/types.ts`:

```ts
export interface ControllerShape {
  /** `componentName(block.name)`, the prefix every exported type carries. */
  name: string;
  stateFields: string[];
  actionNames: string[];
  /** How many parameters each action DECLARES, by name.
   *
   *  Only the angular form reads it, and only because an Angular event binding
   *  is a statement: the action is CALLED in the template, and
   *  `strictTemplates` checks that call in both directions. Additive on
   *  purpose: `actionNames` keeps its exact meaning, so html.ts, react.ts and
   *  checkBlockContracts do not move. */
  actionArity: Record<string, number>;
  refNames: string[];
}
```

In `packages/blocks/src/contract/analyze-controller.ts`, `read()` already has the member tokens in hand from `splitMembers(body)`; count the parameters off the same tokens rather than re-scanning the source. One helper beside `memberNames`:

```ts
/**
 * How many parameters a member DECLARES: 0 for a property, and for a method or
 * a function-typed property the count of top-level commas in its first
 * parameter list, plus one, or 0 when that list is empty.
 *
 * Depth-tracked for the same reason `splitMembers` is: `send(a: string, opts: {
 * x: boolean, y: boolean })` is TWO parameters, and a naive comma count reads
 * four. This is not a parser and does not need to be -- the contract fixes
 * these interfaces to plain method signatures, and the ONE consumer is a
 * renderer deciding whether to pass `$event`.
 *
 * ONE KNOWN IMPRECISION, stated rather than hidden. An arrow type inside the
 * parameter list (`send(cb: (a: string) => void, x: number)`) ends the scan
 * early, because the `>` of `=>` reads as a closer under plain counting --
 * the same case `splitMembers` handles explicitly. The count it returns is
 * still >= 1, so the renderer's decision (pass `$event` or not) is unaffected,
 * which is why this does not carry `splitMembers`'s arrow special case. If a
 * consumer ever needs the exact count, add it there and here together.
 */
function memberArity(token: string): number {
  const open = token.indexOf('(');
  if (open === -1) return 0;
  let depth = 0;
  let commas = 0;
  let body = '';
  for (let i = open; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === '(' || ch === '{' || ch === '[' || ch === '<') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']' || ch === '>') {
      depth -= 1;
      if (depth === 0) break;
    }
    if (depth === 1 && ch === ',') commas += 1;
    if (i > open) body += ch;
  }
  return body.trim() === '' ? 0 : commas + 1;
}
```

`read()` returns the members it found; have it also return their arities (or add a second pass over `splitMembers(body)` inside `read`, keyed by the name `memberNames` derived), and `analyzeController` returns `actionArity` for the `Actions` interface only. State and refs do not need it and must not grow one: an unused field on a shared type is the next thing somebody derives a wrong rule from.

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/analyze-controller.test.ts
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
```

Expected: green, all three. If `html-form.test.ts` or `react-form.test.ts` moved, the change was not additive: `actionNames` must mean exactly what it meant before.

- [ ] **Step 2: Write the failing angular suite**

Create `packages/blocks/tests/angular-form.test.ts` with the same fixture setup block the vue suite uses (three files from `packages/blocks/tests/fixtures/`, the same `manifest.files`, the same `byPath`), importing `renderAngularForm`. Its own cases:

```ts
describe('the angular form', () => {
  it('emits the component, its template, the store, the controller, the css and a README', () => {
    expect([...byPath(renderAngularForm(block())).keys()].sort()).toEqual([
      'README.md', 'fixture.component.html', 'fixture.component.ts', 'fixture.controller.ts',
      'fixture.css', 'fixture.store.ts',
    ]);
  });

  it('targets every file at src/app/components/<id>/', () => {
    for (const file of renderAngularForm(block())) {
      expect(file.target).toBe(`src/app/components/fixture/${file.path}`);
    }
  });

  it('declares CUSTOM_ELEMENTS_SCHEMA and provides its own store', () => {
    const ts = byPath(renderAngularForm(block())).get('fixture.component.ts')!;
    expect(ts).toContain('schemas: [CUSTOM_ELEMENTS_SCHEMA]');
    // Instance-scoped, never providedIn: 'root'. Two instances of the block
    // sharing one controller would share its conversation state.
    expect(ts).toContain('providers: [FixtureStore]');
    expect(ts).toContain("templateUrl: './fixture.component.html'");
    expect(ts).toContain("styleUrls: ['./fixture.css']");
  });

  it('takes its refs through viewChild, typed by the element interface the tag names', () => {
    const ts = byPath(renderAngularForm(block())).get('fixture.component.ts')!;
    expect(ts).toContain("import type { KaiDockElement } from '@kitn.ai/ui/elements';");
    expect(ts).toContain(`private readonly dock = viewChild<ElementRef<KaiDockElement>>('dock');`);
    expect(ts).toContain('ngAfterViewInit');
    expect(ts).toContain('dock: this.dock()?.nativeElement ?? null');
    // No cast: ElementRef<T>.nativeElement is T, and the controller's Refs
    // declares T | null. Matched as a CAST, not as the substring " as ": the
    // emitted comment above already breaks "resolve them as / components"
    // across a line, and the next comment might not.
    expect(ts).not.toMatch(/\bas\s+Kai\w+Element\b/);
    expect(ts).not.toMatch(/\bas\s+HTMLElement\b/);
  });

  it('binds a kai property with [camelName] and an attr binding with [attr.name] on a plain tag', () => {
    const html = byPath(renderAngularForm(block())).get('fixture.component.html')!;
    expect(html).toContain('[unread]="store.state().hidden"');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations .activeId="title">'),
    );
    expect(byPath(renderAngularForm(b)).get('fixture.component.html')).toContain(
      '[activeId]="store.state().title"',
    );
  });

  it('gates the template on ready and reads the signal, never a stale snapshot', () => {
    const html = byPath(renderAngularForm(block())).get('fixture.component.html')!;
    expect(html).toContain('@if (store.ready()) {');
    expect(html).toContain('{{ store.state().title }}');
    expect(html).toContain('@for (row of store.state().rows; track row.id) {');
    expect(html).not.toMatch(/state\(\)\.row\./);
  });

  it('wires an event with the dashed name Angular passes straight to addEventListener', () => {
    const html = byPath(renderAngularForm(block())).get('fixture.component.html')!;
    expect(html).toContain('(kai-click)="store.actions.open()"');
  });

  it('passes $event to an action that DECLARES a parameter, and to no other', () => {
    // Both directions are TS2554 under strictTemplates: a zero-arg action
    // called with $event is "Expected 0 arguments, but got 1", and a one-arg
    // action called with none is "Expected 1 arguments, but got 0". Nothing
    // about the event NAME predicts which -- kai-click carries no detail, and
    // support-widget.controller.ts mixes both arities across kai-* events in
    // ONE template -- so the renderer reads ControllerShape.actionArity.
    //
    // The shared fixture declares only zero-arg actions, so this case builds
    // the mixed shape rather than changing the fixture out from under the vue,
    // svelte and solid suites, which pin its emitted output byte for byte.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.controller.ts',
      CONTROLLER.replace('  open(): void;', '  open(): void;\n  pick(event: CustomEvent<{ id: string }>): void;'),
    );
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations @kai-conversation-select="pick">'),
    );
    const html = byPath(renderAngularForm(b)).get('fixture.component.html')!;
    expect(html).toContain('(kai-click)="store.actions.open()"');
    expect(html).toContain('(kai-conversation-select)="store.actions.pick($event)"');
    expect(html).not.toContain('store.actions.open($event)');
    expect(html).not.toContain('store.actions.pick()');
  });

  it('emits a seed as a static attribute and translates a ="false" literal', () => {
    const html = byPath(renderAngularForm(block())).get('fixture.component.html')!;
    expect(html).toContain('position="bottom-end"');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false" compact>'),
    );
    const other = byPath(renderAngularForm(b)).get('fixture.component.html')!;
    expect(other).toContain('[searchable]="false"');
    expect(other).toContain('[compact]="true"');
  });

  it('the store is a signal over the controller, seeded with every declared ref', () => {
    const store = byPath(renderAngularForm(block())).get('fixture.store.ts')!;
    expect(store).toContain('@Injectable()');
    expect(store).toContain('signal<FixtureState>(');
    expect(store).toContain("import '@kitn.ai/ui/elements';");
    expect(store).toContain(`const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];`);
    expect(store).toContain('{ dock: null }');
    expect(store).toContain('void this.controller.actions.boot();');
  });

  it('the README names CUSTOM_ELEMENTS_SCHEMA and the style scoping', () => {
    const readme = byPath(renderAngularForm(block())).get('README.md')!;
    expect(readme).toContain('CUSTOM_ELEMENTS_SCHEMA');
    expect(readme).toContain('fixture.css');
  });

  it('cross-checks the bindings against the controller', () => {
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderAngularForm(b)).toThrow(/nope/);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/angular-form.test.ts
```

Expected: every case FAILS at import, `renderAngularForm is not exported by ../src/forms`.

- [ ] **Step 4: Write the renderer**

Create `packages/blocks/src/forms/angular.ts`. The emitted output for the fixture is the contract:

`fixture.component.ts`
```ts
// GENERATED by @kitn.ai/blocks from fixture.html and fixture.controller.ts.
// It is your code now: edit freely, and regenerate to start over.
import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, inject, viewChild } from '@angular/core';
import type { KaiDockElement } from '@kitn.ai/ui/elements';
import { FixtureStore } from './fixture.store';

@Component({
  selector: 'app-fixture',
  templateUrl: './fixture.component.html',
  styleUrls: ['./fixture.css'],
  // The store is INSTANCE-scoped. Two of this block on one page each need their
  // own controller: it owns a subscription and a snapshot.
  providers: [FixtureStore],
  // kai-* are custom elements, so Angular is told not to resolve them as
  // components. This is also why the angular compile cell cannot type a kai
  // prop: the schema suppresses exactly that check, which is what it is for.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class FixtureComponent implements AfterViewInit {
  protected readonly store = inject(FixtureStore);
  private readonly dock = viewChild<ElementRef<KaiDockElement>>('dock');

  // ngAfterViewInit, not the constructor: viewChild has nothing before the view
  // exists, and `customElements` does not exist during server rendering.
  ngAfterViewInit(): void {
    void this.store.connect(() => ({ dock: this.dock()?.nativeElement ?? null }));
  }
}
```

`fixture.component.html`
```html
@if (store.ready()) {
  <kai-dock
    #dock
    position="bottom-end"
    [unread]="store.state().hidden"
    (kai-click)="store.actions.open()"
  >
    <span>{{ store.state().title }}</span>
    <kai-conversations>
      @for (row of store.state().rows; track row.id) {
        <kai-conversation-item [unread]="row.unread">
          <span>{{ row.title }}</span>
        </kai-conversation-item>
      }
    </kai-conversations>
  </kai-dock>
}
```

`fixture.store.ts`
```ts
// GENERATED by @kitn.ai/blocks: the angular adapter.
// One signal over the controller's snapshot. Nothing is mirrored and no
// computed re-derives anything: the controller already hands back a view model.
import { Injectable, signal } from '@angular/core';
// The add form's registration, not the autoloader's: the autoloader resolves
// element modules relative to its own URL and 404s every one of them through a
// bundler.
import '@kitn.ai/ui/elements';
import {
  createController,
  type FixtureActions,
  type FixtureRefs,
  type FixtureState,
} from './fixture.controller';

// Every kai- tag the block root renders. The template is gated on these being
// DEFINED: an element created before its definition lands discards a property
// set on it, and the upgrade does not put it back (spec 8b, amendment 7).
const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];

@Injectable()
export class FixtureStore {
  // Replaced by `connect` once the view exists. The controller reads it lazily,
  // which is why `refs` is a getter in the contract at all.
  private refs: () => FixtureRefs = () => ({ dock: null });
  private readonly controller = createController({ refs: () => this.refs() });

  readonly state = signal<FixtureState>(this.controller.state());
  readonly ready = signal(false);
  readonly actions: FixtureActions = this.controller.actions;

  async connect(refs: () => FixtureRefs): Promise<void> {
    this.refs = refs;
    this.controller.subscribe(() => this.state.set(this.controller.state()));
    await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));
    this.ready.set(true);
    void this.controller.actions.boot();
  }
}
```

`README.md` lines:

```ts
  [
    `Render it: \`<app-${block.name} />\`, importing \`${name}Component\` from \`./${block.name}.component\`.`,
    '',
    'The component declares `CUSTOM_ELEMENTS_SCHEMA`, which is what lets Angular render `kai-` elements without trying to resolve them as components.',
    '',
    `Angular scopes \`${stylesheet}\` to this component. A rule that has to reach the page around the block belongs in your global styles instead.`,
  ]
```

where `stylesheet` is `parsed.template.stylesheets[0]` (and the line is omitted when the block links none).

The differing functions:

```ts
/** One binding as an angular template attribute. `arity` is
 *  `shape.actionArity`, which is why Step 1 exists. */
function bindingAttr(tag: string, b: Binding, scope: string | undefined, arity: Record<string, number>): string | null {
  switch (b.kind) {
    case 'prop':
      return b.name === 'textContent' ? null : `[${propName(tag, b.name)}]="${read(b.value, scope)}"`;
    case 'attr':
      // A PROPERTY binding on a kai element, the rule react set first: an
      // `[attr.x]` stringifies, so a bound `false` would write x="false" and the
      // element would read it as true. A plain element keeps `[attr.x]`, which
      // is what an attribute on a plain element means.
      return isKai(tag)
        ? `[${propName(tag, b.name)}]="${read(b.value, scope)}"`
        : `[attr.${b.name}]="${read(b.value, scope)}"`;
    case 'event':
      // Angular passes an unrecognised event name straight to addEventListener,
      // which is what a non-bubbling kai- event needs. The action is CALLED
      // here, not referenced: an Angular event binding is a statement, and
      // strictTemplates type-checks the call. So $event is passed IFF the
      // action declares a parameter (ruling R18): both directions are TS2554,
      // and the event name predicts neither -- kai-click carries no detail, and
      // the real blocks mix both arities across kai-* events in one template.
      return `(${b.name})="store.actions.${b.value}(${(arity[b.value] ?? 0) > 0 ? '$event' : ''})"`;
    case 'ref':
      return `#${b.name}`;
    case 'seed':
      return null;
  }
}
```

For the shared fixture, whose actions are all zero-arg, that emits `(kai-click)="store.actions.open()"`, which is what the contract above prints. For a real block it emits both shapes in one file: `support-widget.controller.ts` declares `back(): void` and `viewChange(event: CustomEvent<...>)`, so its template carries `(kai-click)="store.actions.back()"` beside `(kai-view-change)="store.actions.viewChange($event)"`. That mixture is the whole reason `actionArity` exists, and Step 6 watches `ngc` accept it.

`read(value, scope)` is `store.state().<field>` at document scope and `<item>.<field>` inside a `@for`.

- [ ] **Step 5: Add the row, the case, the re-export and the cell**

`packages/blocks/src/forms/index.ts`: `export { renderAngularForm } from './angular';`, a `{ id: 'angular', label: 'Angular' }` row after `svelte`, and `case 'angular': return renderAngularForm(block);`. `packages/ui/scripts/lib/block-compile-cells.mjs`: `angular: FRAMEWORK_CELLS.angular` in `STRATEGIES`.

- [ ] **Step 6: Run everything**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/docs run test
```

Expected: green, and `verify:scaffold` prints the angular note. The likely first red is `ngc` on a missing peer (`@angular/common` or `@angular/compiler`): both are symlinked by Task 2 Step 2, so if one is reported missing, that step's list is wrong rather than the emitted component.

Then watch the arity rule earn its place, in both directions, against the REAL blocks rather than the fixture. `support-widget` is the block that carries both shapes.

```bash
# (a) $event on everything: the zero-arg direction
cd "$WT" && sed -i '' -E "s#\(arity\[b\.value\] \?\? 0\) > 0 \? '\\\$event' : ''#'\$event'#" packages/blocks/src/forms/angular.ts
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && git checkout packages/blocks/src/forms/angular.ts

# (b) $event on nothing: the one-arg direction
cd "$WT" && sed -i '' -E "s#\(arity\[b\.value\] \?\? 0\) > 0 \? '\\\$event' : ''#''#" packages/blocks/src/forms/angular.ts
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && git checkout packages/blocks/src/forms/angular.ts
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks && pnpm --filter @kitn.ai/ui run verify:scaffold
```

Expected: (a) FAILS with `error TS2554: Expected 0 arguments, but got 1` inside `support-widget.component.html`, on the `(kai-click)` bindings; (b) FAILS with `error TS2554: Expected 1 arguments, but got 0`, on the `(kai-view-change)` binding and its siblings. Then green again after the restore and rebuild. Adjust the `sed` to whatever the line ended up looking like, or make the two edits by hand: what matters is that both directions were SEEN, because a blanket rule in either direction is what an implementer reaches for and each one compiles for exactly half the bindings in a real block.

Record the wall time against Task 0 Step 3's baseline. Every plant and every real cell runs on EVERY `verify:scaffold`, local runs included, which is the intended design (ruling R7) and is worth stating rather than discovering. If the step's wall time more than triples the Task 0 baseline, say so in the task report and name which cell dominates; the gate prints its own cell count, so read that rather than multiplying.

- [ ] **Step 7: Commit**

```bash
cd "$WT" && git add packages/blocks packages/ui/scripts/lib/block-compile-cells.mjs
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the angular delivery form, and action arities on ControllerShape

A standalone component with CUSTOM_ELEMENTS_SCHEMA, its template, and an
@Injectable store holding one signal over the controller's snapshot. ngc with
strictTemplates is its compile cell, because tsc cannot open a templateUrl at
all and a tsc-only angular cell would check the class and nothing about the
template that carries every binding.

Three shape decisions, each stated in the emitted file. The store is
instance-scoped rather than providedIn: 'root', because two of the block on one
page would otherwise share one controller and its conversation state. There is
no <name>.component.css: the block already ships a stylesheet and the component
names it through styleUrls, with the README saying that Angular scopes it.
And the refs are read in ngAfterViewInit, because viewChild has nothing before
the view exists and customElements does not exist during server rendering.

Angular is the only host that CALLS the action from the template, and
strictTemplates type-checks that call in both directions, so ControllerShape
grows actionArity and the renderer passes $event iff the action declares a
parameter. Nothing about the event name predicts it: kai-click carries no detail
at all, and support-widget.controller.ts mixes both arities across kai-* events
in one template, so a blanket rule in either direction compiles for exactly half
the bindings in a real block. Both TS2554 directions were watched against the
real blocks before the rule was kept. The field is additive: actionNames means
exactly what it meant, and html.ts, react.ts and checkBlockContracts do not move.

The gate prints what ngc cannot see: CUSTOM_ELEMENTS_SCHEMA suppresses the kai
prop check by design, so the cell covers the class and the template expressions
and not the prop names or types.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 6: the solid renderer, and the kit-fix backlog item

**Files:**
- Create: `packages/blocks/src/forms/solid.ts`
- Create: `packages/blocks/tests/solid-form.test.ts`
- Modify: `packages/blocks/src/forms/index.ts`
- Modify: `packages/ui/scripts/lib/block-compile-cells.mjs`
- Modify: `docs/superpowers/HANDOFF-2026-09-02-night-run.md` (the kit-fix backlog item)

**Interfaces:**
- Consumes: `parseBlock`, `carriedFiles`, `nullRefs`, `isKai`, `camel`, `elementInterface`, `escapeAttr` from `./emit`; `renderReadme` from `./readme`; `fileTarget` from `../targets`; the `solid-js/jsx-runtime` augmentation Task 1 shipped.
- Produces: `renderSolidForm(block): FormFile[]`; a `solid` row in `BLOCK_FORMS`; a `solid` case in `renderBlockForm`; `STRATEGIES.solid`.

This is spec 3.6 option (a), and ruling R1 says why the set of "elements with no Solid component" is all of them: the shared controller types its refs as ELEMENT interfaces, which a Solid component does not hand back, and the `kai-` events are dispatched by the element facade rather than by the Solid component underneath it, so `on:kai-click` on a Solid component would silently never fire.

- [ ] **Step 1: Write the failing solid suite**

Create `packages/blocks/tests/solid-form.test.ts` with the same fixture setup block the vue suite uses, importing `renderSolidForm`. Its own cases:

```ts
describe('the solid form', () => {
  it('emits the component, the adapter, the controller, the css and a README', () => {
    expect([...byPath(renderSolidForm(block())).keys()].sort()).toEqual([
      'Fixture.tsx', 'README.md', 'fixture.controller.ts', 'fixture.css', 'useFixture.ts',
    ]);
  });

  it('targets every file at src/components/<id>/', () => {
    for (const file of renderSolidForm(block())) expect(file.target).toBe(`src/components/fixture/${file.path}`);
  });

  it('renders CUSTOM ELEMENTS, never the components in @kitn.ai/ui/solid', () => {
    // Spec 3.6, option (a), and the set is all of them. The shared controller
    // types its refs as element interfaces, which a Solid component does not
    // hand back; and kai- events are dispatched by the element facade in
    // src/elements/, not by the Solid component underneath it, so on:kai-click
    // on a Solid component would never fire.
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('<kai-dock');
    expect(tsx).not.toContain("from '@kitn.ai/ui/solid'");
    expect(tsx).not.toContain('<Dock');
  });

  it('sets a kai property with prop: and listens with on:', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('prop:unread={state().hidden}');
    expect(tsx).toContain('on:kai-click={actions.open}');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations .activeId="title">'),
    );
    expect(byPath(renderSolidForm(b)).get('Fixture.tsx')).toContain('prop:activeId={state().title}');
  });

  it('annotates the ref callback, because an unannotated one is TS7006', () => {
    // Under the kit's generic solid-js/jsx-runtime augmentation, `ref` types as
    // `unknown` and an unannotated parameter has no contextual type. Verified
    // with a real tsc run before this renderer was written.
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain("import type { KaiDockElement } from '@kitn.ai/ui/elements';");
    expect(tsx).toContain('ref={(el: KaiDockElement) => { dock = el; }}');
    expect(tsx).toContain('let dock: KaiDockElement | null = null;');
    expect(tsx).toContain('useFixture(() => ({ dock }))');
  });

  it('repeats with <For>, and does NOT invent a key prop Solid would ignore', () => {
    // Solid's <For> is reference-keyed by the row object itself and takes no
    // key. Emitting key={row.id} on a custom element would set an attribute
    // nothing reads, which is the quiet version of a decision.
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('<For each={state().rows}>');
    expect(tsx).toContain('{(row) => (');
    expect(tsx).not.toMatch(/key=\{/);
    // and it says so, at the site, rather than leaving a reader to wonder where
    // the mandatory :key went.
    expect(tsx).toContain('reference-keyed');
  });

  it('gates the tree on ready and imports only the solid helpers it uses', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain("import { For, Show } from 'solid-js';");
    expect(tsx).toContain('<Show when={ready()}>');
    // `noUnusedLocals` is on in a stock solid-ts project, so an unconditional
    // import list fails the compile cell on TS6133. A page with no *for gets no
    // `For`.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(/<kai-conversations>[\s\S]*<\/kai-conversations>/, '<kai-conversations></kai-conversations>'),
    );
    const flat = byPath(renderSolidForm(b)).get('Fixture.tsx')!;
    expect(flat).toContain("import { Show } from 'solid-js';");
    // The TAG and the IMPORT, not the bare substring "For": a bare containment
    // check passes only as long as no word in the emitted header happens to
    // contain a capital "For", which is luck rather than a guard.
    expect(flat).not.toMatch(/<For\b/);
    expect(flat).not.toMatch(/\bFor\b[^\n]*from 'solid-js'/);
  });

  it('emits a seed as a static attribute and translates a ="false" literal', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('position="bottom-end"');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false" compact>'),
    );
    const other = byPath(renderSolidForm(b)).get('Fixture.tsx')!;
    expect(other).toContain('prop:searchable={false}');
    expect(other).toContain('prop:compact={true}');
  });

  it('emits the adapter as one signal over the controller', () => {
    const adapter = byPath(renderSolidForm(block())).get('useFixture.ts')!;
    expect(adapter).toContain("import '@kitn.ai/ui/elements';");
    expect(adapter).toContain(`const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];`);
    expect(adapter).toContain('createSignal<FixtureState>(controller.state())');
    expect(adapter).toContain('onCleanup(controller.subscribe(');
    expect(adapter).toContain('onMount(');
    expect(adapter).toContain('void controller.actions.boot();');
  });

  it('cross-checks the bindings against the controller', () => {
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderSolidForm(b)).toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/solid-form.test.ts
```

Expected: every case FAILS at import, `renderSolidForm is not exported by ../src/forms`.

- [ ] **Step 3: Write the renderer**

Create `packages/blocks/src/forms/solid.ts`. The emitted output for the fixture:

`Fixture.tsx`
```tsx
// GENERATED by @kitn.ai/blocks from fixture.html and fixture.controller.ts.
// It is your code now: edit freely, and regenerate to start over.
//
// CUSTOM ELEMENTS, not the Solid components in `@kitn.ai/ui/solid`, and the
// reasons are mechanical rather than stylistic. The controller types its refs
// as the ELEMENT interfaces (KaiDockElement), which a Solid component does not
// hand back; and the kai- events are dispatched by the element facade, not by
// the Solid component underneath it, so `on:kai-click` on a Solid component
// would silently never fire.
import { For, Show } from 'solid-js';
import type { KaiDockElement } from '@kitn.ai/ui/elements';
import { useFixture } from './useFixture';
import './fixture.css';

export function Fixture() {
  // A plain `let`, read through the getter below: refs are not reactive, and
  // the controller reads them lazily, so there is nothing here for a signal to
  // do. The parameter annotation is required: under the kit's generic
  // solid-js JSX augmentation an unannotated `ref` callback is TS7006.
  let dock: KaiDockElement | null = null;
  const { state, actions, ready } = useFixture(() => ({ dock }));

  return (
    <Show when={ready()}>
      <kai-dock
        ref={(el: KaiDockElement) => { dock = el; }}
        position="bottom-end"
        prop:unread={state().hidden}
        on:kai-click={actions.open}
      >
        <span>{state().title}</span>
        <kai-conversations>
          {/* Solid's <For> is reference-keyed by the row object itself and
              takes no key, so the authored `:key` has no expression to become
              here. It is not dropped in silence: a key prop on a custom
              element would be an attribute Solid sets and nothing reads. */}
          <For each={state().rows}>
            {(row) => (
              <kai-conversation-item prop:unread={row.unread}>
                <span>{row.title}</span>
              </kai-conversation-item>
            )}
          </For>
        </kai-conversations>
      </kai-dock>
    </Show>
  );
}
```

`useFixture.ts`
```ts
// GENERATED by @kitn.ai/blocks: the solid adapter.
// One signal over the controller's snapshot. The controller replaces the whole
// state object per notification, so a store with reconciliation would buy
// nothing a signal does not already give.
import { createSignal, onCleanup, onMount } from 'solid-js';
import type { Accessor } from 'solid-js';
// The add form's registration, not the autoloader's: the autoloader resolves
// element modules relative to its own URL and 404s every one of them through a
// bundler.
import '@kitn.ai/ui/elements';
import {
  createController,
  type FixtureActions,
  type FixtureRefs,
  type FixtureState,
} from './fixture.controller';

// Every kai- tag the block root renders. The tree is gated on these being
// DEFINED: an element created before its definition lands discards a property
// set on it, and the upgrade does not put it back (spec 8b, amendment 7).
const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];

export interface UseFixture {
  state: Accessor<FixtureState>;
  actions: FixtureActions;
  ready: Accessor<boolean>;
}

export function useFixture(refs: () => FixtureRefs): UseFixture {
  const controller = createController({ refs });
  const [state, setState] = createSignal<FixtureState>(controller.state());
  const [ready, setReady] = createSignal(false);

  onCleanup(controller.subscribe(() => setState(controller.state())));

  // onMount, not the body: it runs in the browser only, and `customElements`
  // does not exist during server rendering.
  onMount(async () => {
    await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));
    setReady(true);
    void controller.actions.boot();
  });

  return { state, actions: controller.actions, ready };
}
```

`README.md` lines: `` [`Render it: \`import { ${name} } from './${name}';\``] `` and nothing else. Solid needs no custom-element configuration: its compiler treats any dashed tag as an element, and the kit ships the JSX typing.

The differing functions:

```ts
/** One binding as a solid JSX prop. */
function bindingProp(tag: string, b: Binding, scope: string | undefined, refType: string): string | null {
  switch (b.kind) {
    case 'prop':
      // `.textContent` is emitted as CHILDREN. `prop:` sets the DOM property,
      // which for a custom element is the only spelling that carries a
      // non-string value at all.
      return b.name === 'textContent' ? null : `prop:${propName(tag, b.name)}={${read(b.value, scope)}}`;
    case 'attr':
      // A PROPERTY on a kai element, the rule react set first: solid's `attr:`
      // stringifies, so a bound `false` would write unread="false" and the
      // element would read it as true. A plain element keeps the ordinary JSX
      // prop, which is where solid's own HTML typings apply.
      return isKai(tag)
        ? `prop:${propName(tag, b.name)}={${read(b.value, scope)}}`
        : `${b.name}={${read(b.value, scope)}}`;
    case 'event':
      // `on:name` is addEventListener with the exact name, which is what a
      // non-bubbling kai- event needs. Solid's lower-cased `onname` delegation
      // would not reach it.
      return `on:${b.name}={actions.${b.value}}`;
    case 'ref':
      // The annotation is not decoration: without it this is TS7006.
      return `ref={(el: ${refType}) => { ${b.value} = el; }}`;
    case 'seed':
      return null;
  }
}
```

`literalProp` follows react's, with `prop:` in front for a kai element's boolean literals (`value === ''` gives `prop:${camel(name)}={true}`; `'true'`/`'false'` give `prop:${camel(name)}={value}`) and the plain attribute form otherwise. The import line is built from the helpers actually used, `Show` always and `For` only when the page has a `*for`, because `noUnusedLocals` is on in the solid project and an unconditional list is TS6133 in a consumer's tree.

- [ ] **Step 4: Add the row, the case, the re-export and the cell**

`packages/blocks/src/forms/index.ts`: `export { renderSolidForm } from './solid';`, a `{ id: 'solid', label: 'Solid' }` row after `angular`, and `case 'solid': return renderSolidForm(block);`. `packages/ui/scripts/lib/block-compile-cells.mjs`: `solid: FRAMEWORK_CELLS.solid` in `STRATEGIES`.

- [ ] **Step 5: Run everything**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/docs run test
```

Expected: green. `verify:scaffold` now prints six framework forms and the four notes. Record the cell count and the wall time against Task 0 Step 3's, both read off the gate's own output.

This is the first run with the whole matrix in it, so it is the one worth costing. The step adds, per `verify:scaffold`: the plant runs, the real cells (blocks x forms), and one sandbox `selfTest()` tsc invocation per plant and per cell. `.github/workflows/test.yml` budgets the step's comment at a figure it states and the `dist-guards` job at a timeout it states; read both there rather than here. **If this step's wall time more than triples the Task 0 Step 3 baseline, say so in the task report and name which cell dominates.** Tens of seconds is the expected order; minutes is a finding, and the fix is a conversation about the axis rather than a quiet acceptance.

- [ ] **Step 6: Prove the solid cell would catch the augmentation being removed**

The solid cell's whole premise is that the JSX augmentation is load-bearing. Watch it:

Only `dist/elements.d.ts` is doctored, and it is restored from the `.bak` this snippet writes beside it. The source `element-types.d.ts` is not touched at all, so it needs no backup.

```bash
cd "$WT" && node -e "
const fs = require('fs');
const p = 'packages/ui/dist/elements.d.ts';
const s = fs.readFileSync(p, 'utf8');
fs.writeFileSync(p + '.bak', s);
fs.writeFileSync(p, s.replace(\"declare module 'solid-js/jsx-runtime' {\", \"declare module 'solid-js/jsx-runtime-DISABLED' {\"));"
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && mv packages/ui/dist/elements.d.ts.bak packages/ui/dist/elements.d.ts
```

Expected: FAIL, `<block> [solid]: does not compile under a stock solid consumer tsconfig`, with `error TS2339: Property 'kai-dock' does not exist on type 'JSX.IntrinsicElements'` for every block. Restore, re-run `verify:scaffold`, confirm green.

- [ ] **Step 7: Run the coverage script and write the kit-fix backlog item**

```bash
cd "$WT" && node packages/ui/scripts/verify-solid-coverage.mjs --json "$SCRATCH/solid-coverage.json"
cd "$WT" && node -e "
const j = require(process.env.SCRATCH + '/solid-coverage.json');
const missing = j.rows.filter((r) => r.nameMatch === null || !r.solidSurface.includes(r.nameMatch));
for (const r of missing) console.log('- \`' + r.tag + '\` wants \`' + r.nameMatch + '\`; @kitn.ai/ui/solid exports [' + r.solidSurface.join(', ') + ']');
console.log(missing.length + ' of ' + j.rows.length);
"
```

Section 3.6's small-tickets list is a `| Ticket | What |` MARKDOWN TABLE, with its own `<!-- gate-list: partial -->` marker above it. Multi-line derived output cannot go in a table cell, so this is two edits, not one.

**First**, three new rows on that table, each a one-line "What" that points at the subsection below:

```markdown
| Solid exports named after the tag | The elements with no same-name Solid component export. Derived list in 3.6a |
| Per-element Solid JSX typing | The PR B2 augmentation is generic, so the solid cell types no kai prop value. Reason in 3.6a |
| Svelte template typing for `kai-*` | Svelte types every unknown element `any`, so the svelte cell sees no prop name. Reason in 3.6a |
```

**Second**, a new `### 3.6a Filed by PR B2` subsection immediately AFTER the table, carrying the three items in full, the first with the derived output **verbatim**:

```markdown
### 3.6a Filed by PR B2

- **[tickets] Export a Solid component named after the tag, for the elements that have none.** `verify:solid-coverage` grades WRITABLE EQUIVALENCE and passes at full coverage today, which is a weaker property than "there is a component with this name to put in a generated tree". The solid delivery form (PR B2) renders custom elements for every tag and does not need these, so nothing is blocked; what they would buy is a Solid consumer writing the block by hand rather than generating it. The list below was produced by `node packages/ui/scripts/verify-solid-coverage.mjs --json <path>`, read for `nameMatch` against `solidSurface`; re-run it rather than trusting the list, and note that the 2026-09-02 spec's section 3.6 table disagrees with the script in both directions.
- **[tickets] Per-element Solid JSX typing.** The `solid-js/jsx-runtime` augmentation shipped in PR B2 is generic, so the solid compile cell checks JSX expressions and not kai prop VALUES. A per-element version needs an Events type keyed by the RAW event name (`on:kai-click`); `gen-element-types.mjs` emits only the camel-cased `onKaiClick` shape the React and Vue blocks use, and one cannot be derived from the other at the type level. Generator work, not augmentation work.
- **[tickets] Svelte template typing for `kai-*`.** `svelte/elements.d.ts` ends `SvelteHTMLElements` with `[name: string]: { [name: string]: any }`, so `svelte-check` types every unknown element and every attribute on it as `any` and a wrong kai prop NAME is invisible to the svelte compile cell. An augmentation of `svelteHTML.IntrinsicElements` would close it, on the same generator, and would let the svelte cell carry a prop-type plant the way the vue cell does.
```

Two constraints on what goes in that subsection, both of which have bitten this repo's handoffs before. The derived list must carry no bare numeric threshold, or `lint:thresholds` fires on the handoff and the fix is that linter's own `lint-thresholds: waive -- <why>` directive, never a `gate-list` marker (ruling R20). And the `<!-- gate-list: partial -->` marker above the table covers the TABLE; if the new subsection ends up looking like a gate enumeration, run `node packages/ui/scripts/lint-gate-parity.mjs` and give it its own marker rather than assuming the table's reaches it.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add packages/blocks packages/ui/scripts/lib/block-compile-cells.mjs docs/superpowers/HANDOFF-2026-09-02-night-run.md
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the solid delivery form, over custom elements

Spec 3.6 option (a), and the set of elements with no Solid component to use is
all of them. Two mechanical reasons, both stated in the emitted file: the shared
controller types its refs as ELEMENT interfaces (KaiDockElement), which a Solid
component does not hand back, and the kai- events are dispatched by the element
facade rather than by the Solid component underneath it, so on:kai-click on a
Solid component would silently never fire.

The ref callback carries an explicit parameter annotation, because under the
generic JSX augmentation an unannotated one is TS7006. <For> takes no key, so
the mandatory :key has no expression to become here and the emitted file says so
at the site rather than inventing a key prop Solid would ignore.

The compile cell was watched failing with the augmentation disabled: every block
goes red with the exact TS2339 a Solid consumer sees today.

Files the missing Solid exports as a backlog item, derived from
verify-solid-coverage.mjs rather than from the spec's table, which disagrees with
the script in both directions. Two more items: per-element Solid JSX typing, and
Svelte template typing, both of which are why those two cells cannot carry a
prop-type plant the way the vue cell does.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 7: the downstream sweep

**Files:**
- Modify: `apps/docs/src/lib/blocks-source.ts`
- Modify: `apps/docs/test/blocks-source.test.ts`
- Modify: `packages/ui/scripts/verify-pack-weight.mjs`
- Modify: `docs/coupling-map.md`

**Interfaces:**
- Consumes: the six framework forms Tasks 3 to 6 landed.
- Produces: nothing another task imports. This task's deliverable is EVIDENCE: that every other consumer grew on its own, and that the two things which genuinely did not are fixed and explained.

- [ ] **Step 1: Prove nothing downstream was hand-edited**

```bash
cd "$WT" && git diff --stat origin/main...HEAD
cd "$WT" && git diff origin/main...HEAD -- packages/create-kai apps/docs/src/lib apps/docs/test packages/ui/scripts/gen-blocks.mjs
```

Expected: **`packages/create-kai` and `packages/ui/scripts/gen-blocks.mjs` are UNTOUCHED**, and `apps/docs` is untouched so far. If any of them has a diff, ruling R10 is broken: read what changed and remove it, because a hand edit there means the derivation is not doing the work and the next renderer will need the same edit again.

Then record, in the task report, the four places that grew by themselves and the command that shows each:

```bash
cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-source.test.ts -t 'equals FRAMEWORK_BLOCK_FORMS'
cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-targets.test.ts
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts -t 'the detection signals table'
cd "$WT" && ls packages/ui/dist/blocks/f/ | wc -l
```

Expected: the dropdown test passes with six rows; the targets test's `readdirSync(formsDir).length` equality holds at blocks x six; every detection row lands on its own framework rather than `html`, and the `fallback` array is empty for every signal that names a framework; the artifact count is blocks x six.

- [ ] **Step 2: The one honest hand edit, watched failing first**

Add to `apps/docs/test/blocks-source.test.ts`, inside the `languageFor` describe:

```ts
  it('highlights the SFC extensions the framework forms emit', () => {
    // Not derived from the forms list: this is a switch over file EXTENSIONS,
    // and two new forms brought two new ones. The default is 'text', so a
    // missing case renders a whole Vue SFC unhighlighted rather than failing.
    // Both languages are already lazy-loadable in the kit's highlighter.
    expect(languageFor('src/components/x/X.vue')).toBe('vue');
    expect(languageFor('src/lib/components/x/X.svelte')).toBe('svelte');
    // The svelte adapter is a .svelte.ts module, which is TypeScript.
    expect(languageFor('src/lib/components/x/useX.svelte.ts')).toBe('typescript');
  });
```

```bash
cd "$WT" && pnpm --filter @kitn.ai/docs exec vitest run test/blocks-source.test.ts
```

Expected: FAIL on the first two expectations, both received `'text'`. Then in `apps/docs/src/lib/blocks-source.ts`, inside `languageFor`'s switch, after `case 'tsx': return 'tsx';`:

```ts
    case 'vue': return 'vue';
    case 'svelte': return 'svelte';
```

Re-run: PASS. `useX.svelte.ts` already passes, because the extension is `ts`.

- [ ] **Step 3: Move the pack ceiling, measured**

```bash
cd "$WT/packages/ui" && npm run build
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:pack
```

Expected: FAIL, naming the measured unpacked size against the ceiling that `MAX_UNPACKED_BYTES` in `packages/ui/scripts/verify-pack-weight.mjs` declares. **Read both figures out of that output; they are the only numbers that go in the ledger.** Then confirm what grew:

```bash
cd "$WT" && du -sk packages/ui/dist/blocks && ls packages/ui/dist/blocks/f/ | wc -l
```

Add a ledger entry to `packages/ui/scripts/verify-pack-weight.mjs`'s comment block, in the file's existing prose style, and raise `MAX_UNPACKED_BYTES` to the measured figure plus about 0.29 MiB of headroom, rounded to the same 0.05 MiB grain the prior entries use. The margin rule is not arbitrary and the entry must restate why: a larger headroom would hide the `llms-full` dist copy quietly coming back, which is what the ceiling was tuned against. The entry says what grew (four more `dist/blocks/f/<id>.<form>.json` per block, each carrying a full tree including the controller and the mock), why it is the new shipped surface and nothing else (`git diff --stat` over `dist/blocks` before and after), and that `dist/blocks/` ships because the docs site and `create-kai add` both read it.

If the measured figure is UNDER the current ceiling, do not raise it. Record the measurement and say so.

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:pack
```

Expected: PASS.

- [ ] **Step 4: The coupling-map rows**

In `docs/coupling-map.md`:

Both identifiers are written in BACKTICKS in the file, so a grep for `FRAMEWORK_BLOCK_FORMS in` or `INSTALL_ROOTS in` matches nothing. Find the rows by their headings instead: the forms-list row is the one in section 8 beginning "The forms list", and the install-roots row is the one in section 5 beginning with the backticked `INSTALL_ROOTS`. `grep -n 'FRAMEWORK_BLOCK_FORMS' docs/coupling-map.md` finds the first; `grep -n 'INSTALL_ROOTS' docs/coupling-map.md` the second.

- The forms-list row: the "Enforced by" cell gains the compile cells, since the axis is now what decides which tool runs. Add, after the existing clauses: `; the compile-cell axis in packages/ui/scripts/lib/block-compile-cells.mjs hard-fails on a form id with no strategy, so a renderer added without a cell cannot ship and a cell added without a renderer is never exercised`.
- The `INSTALL_ROOTS` row: its list of renderers `src/forms/{html,react,cdn}.ts` becomes `src/forms/*.ts` with a note that every renderer reaches it through `fileTarget()` and `apps/docs/test/blocks-targets.test.ts` re-derives it for every block and every framework.
- A NEW row in section 4 (derived lists), for the toolchains:

```markdown
| The framework toolchains the block compile cells run (`vue-tsc`, `svelte-check`, `@angular/compiler-cli`) | `packages/ui/scripts/lib/block-framework-cells.mjs`, which resolves each one through Node | Before PR B2 they resolved ONLY because `.npmrc` sets `node-linker=hoisted` and `examples/starters/{vue,svelte,angular}` declare them, across both their `dependencies` and their `devDependencies`, so deleting a starter would have taken a required gate's toolchain with it and the failure would have read as a broken install | `packages/ui/package.json` now declares all three (plus `vue`, `svelte` and the `@angular/*` packages the harness symlinks, whose list is the code's rather than this row's), and `toolBin()` fails naming the package and `pnpm install` rather than reporting a missing binary |
```

- [ ] **Step 5: Run the full local gate sweep**

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs --list
```

Read that list, and run every gate on it that this branch can affect. At minimum:

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/ui run typecheck
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:generated
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks:react
cd "$WT" && pnpm --filter @kitn.ai/ui run gate:compiles:self-test
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:solid-coverage
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:pack
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:consumer
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:gate-parity
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:thresholds
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:cdn-pins
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter create-kai run verify:add
cd "$WT" && pnpm --filter @kitn.ai/docs run test
cd "$WT" && pnpm --filter @kitn.ai/docs run typecheck:blocks
cd "$WT" && pnpm --filter @kitn.ai/docs run build
cd "$WT" && pnpm --filter @kitn.ai/docs run verify:preview
```

One gate, one command; never chained through `tail`. Three are worth watching specifically:

- **`verify:add`** now runs its non-react leg into a project whose only signal is `vue`, and that leg must report `vue` rather than `html` (it computes the expectation from which `f/<id>.<form>.json` files exist, so it moves on its own). Its three-legs-three-forms floor still holds: react, vue, cdn.
- **`gate:compiles:self-test`** is on the list above and is NOT on the required-gate list, which is exactly why it is here. `acceptance-gate-compiles.mjs` is the SECOND caller of `consumer-tsc-projects.mjs`, the module Task 2 Step 2 edits, and coupling-map row 119 says it out loud: neither gate runs on the other's fixtures, so a change that breaks only one is caught only by that one. Run both.
- **`lint:thresholds`** scans `docs/superpowers/**`. If it fires on this plan or on the handoff edit from Task 6 Step 7, the fix is that linter's own remedy on the offending LINE: a backticked producing command, the phrase `ratchet, not a target`, or a `lint-thresholds: waive -- <why>` directive. Never a `<!-- gate-list: partial -->` marker, which belongs to `lint:gate-parity` and does nothing here (ruling R20). Read the header of `packages/ui/scripts/lint-threshold-derivation.mjs` before waiving.

- [ ] **Step 6: Commit**

```bash
cd "$WT" && git add apps/docs packages/ui/scripts/verify-pack-weight.mjs docs/coupling-map.md
cd "$WT" && git commit -m "$(cat <<'EOF'
chore(blocks): the four new forms' downstream, and the two edits that were real

Everything that derives from the forms list grew by itself and this commit
touches none of it: the site's framework dropdown, the displayed-path guard,
the generated artifacts, the compile-cell axis, create-kai's --form menu, its
detection landing forms, its ambiguity question and its verify:add legs. The
diff over packages/create-kai and gen-blocks.mjs for this whole branch is empty,
which is the evidence rather than the claim.

Two things did not derive, and both are here. `languageFor` is a switch over
file EXTENSIONS, not forms, so .vue and .svelte are two real cases; without them
the site renders a whole SFC as plain text and nothing fails. And the pack
ceiling moves, measured from verify:pack's own output, with a ledger entry
saying what grew and keeping the margin rule that exists to catch the llms-full
copy coming back.

Three coupling-map rows: the forms list now decides which TOOL runs, the install
roots row covers every renderer rather than three, and the framework toolchains
get their own row for having resolved through a hoisting accident until now.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 8: close the branch

**Files:** none beyond what the fix wave needs. Nothing is merged by this task; the merge is the controller's.

**Interfaces:**
- Consumes: the whole branch.
- Produces: a pushed branch, an open PR, and a report naming every gate that ran with its result.

- [ ] **Step 1: Read the gate list, do not type it**

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs --list
```

Every gate on that list which this branch can affect must have been run green in Task 7 Step 5. Re-run any that has not been run since the last commit. Record the count the command prints; do not copy a count from this plan or from a handoff.

- [ ] **Step 2: Hygiene greps**

```bash
cd "$WT" && git diff origin/main...HEAD | grep -nE "claude-501|/scratchpad|/private/tmp" || echo "OK no scratchpad paths"
cd "$WT" && git log origin/main..HEAD --format='%B' | grep -nE "claude-501|/scratchpad|/Users/home" || echo "OK no absolute paths in commit messages"
cd "$WT" && git diff origin/main...HEAD | grep '^+' | grep -nP "[\x{2014}\x{2013}]" || echo "OK no em or en dashes"
cd "$WT" && git diff origin/main...HEAD | grep '^+' | grep -nP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{2712}\x{2718}-\x{27BF}]" || echo "OK no emoji"
cd "$WT" && git status --porcelain
```

Expected: the four `OK` lines and a clean status. A dash hit inside `packages/ui/dist/` is not a hit: `dist/` is gitignored and does not appear in the diff, so anything reported is in tracked source.

**Two narrowings in those greps, both load-bearing, and neither is a weakening.**

- **ADDED lines only** (`grep '^+'`). `git diff` carries three lines of context, and the tracked files this branch edits are full of em dashes already: `docs/coupling-map.md`, `packages/ui/scripts/gen-element-types.mjs`, `packages/ui/scripts/lib/consumer-tsc-projects.mjs` and `packages/ui/scripts/verify-pack-weight.mjs` all have them, including inside the ledger comment block Task 7 Step 3 appends to. Over the whole diff the `OK` line simply cannot print, and a check that always fires gets waived on sight. The constraint is about prose this branch ADDS, and this is the grep that asks that question.
- **`✓` and `✗` exempted** (the emoji class skips U+2713 and U+2717). Both are U+27xx and both are this repo's own gate-output convention, used across `block-compile-cells.mjs`, `verify-scaffold-compiles.mjs` and `consumer-tsc-projects.mjs`, and Task 2 Step 5 adds another one deliberately. The mandated `🤖 Generated with [Claude Code]` line lives in the PR body rather than in a tracked file, so it does not reach these greps at all; if the plan file itself is committed on this branch, that line is inside it and is exempt by the Global Constraint above.

- [ ] **Step 3: Confirm the branch's own claim, one last time**

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:scaffold
```

Expected: green, and record the final block-forms line and the four cell notes VERBATIM in the report. That line is the deliverable of this PR in one sentence, and it is the only place the cell count is allowed to come from.

Time this run and compare it against Task 0 Step 3's baseline. **If it more than triples that baseline, say so in the report and name which cell dominates**, together with what `.github/workflows/test.yml` budgets for the step and for the `dist-guards` job, read from the workflow rather than from here. The plants and every real cell run on every invocation, local ones included; that is ruling R7's design and not an oversight, but it is the cost this PR adds to the slowest required gate and the report is where it gets said out loud.

- [ ] **Step 4: Push and open the PR**

```bash
cd "$WT" && git push -u origin feat/blocks-b2-renderers
cd "$WT" && gh pr create --title "feat(blocks): the vue, svelte, angular and solid delivery forms" --body "$(cat <<'EOF'
Every authored block now ships six framework trees plus the paste form, all
generated from the one framework-neutral source, each compiled by the tool that
can actually see its template.

## What each cell is, and what it is not

The gate prints this itself; read its output rather than this paragraph. vue-tsc
is the vue cell with the kit's GlobalComponents augmentation reachable, and it
is the only one of the four that type-checks a kai prop VALUE. svelte-check and
ngc check their templates' expressions but not kai prop names or types, for
reasons that belong to those frameworks: Svelte types every unknown element
`any`, and Angular's CUSTOM_ELEMENTS_SCHEMA suppresses exactly that check by
design. The solid cell is tsc under the existing solid project, against a new
generic JSX augmentation. None of the four RUNS anything. React remains the only
runtime cell.

## The kit change this needed

solid-js's JSX.IntrinsicElements is closed, so `<kai-dock>` in a Solid TSX file
was TS2339 before any of this mattered. `gen-element-types.mjs` now emits a
third augmentation beside the React and Vue ones, from the same element list.
It targets `solid-js/jsx-runtime`, not `solid-js`: the latter re-exports JSX as
a type and augmenting it shadows the namespace instead of merging, taking every
standard tag with it. Both shapes were compiled before choosing.

## Solid renders custom elements, not the Solid components

Spec 3.6 option (a), and the set is all of them. The shared controller types its
refs as ELEMENT interfaces, which a Solid component does not hand back, and the
kai- events are dispatched by the element facade rather than by the Solid
component underneath it, so `on:kai-click` on a Solid component would silently
never fire. The Solid exports that have no component named after their tag are
filed as a backlog item, derived from `verify-solid-coverage.mjs`.

## Everything downstream grew without an edit

The site's framework dropdown, the displayed-path guard, the generated
artifacts, the compile-cell axis, `create-kai`'s `--form` menu, its detection
landing forms, its ambiguity question and its `verify:add` legs all derive from
`BLOCK_FORMS`. The diff over `packages/create-kai` and `gen-blocks.mjs` for this
whole branch is empty. The two things that did not derive are here and explained:
`languageFor` is a switch over file extensions, and the pack ceiling moves with a
measured ledger entry.

## Plants

Seven, landed before a single renderer existed and all watched red: one template
defect per cell that the cell must NAME, and the vue plants run again with the
kit's augmentation UNREACHABLE and required to go GREEN, which is what proves
the augmentation is doing the work rather than vue-tsc happening to be strict.
Plus the two menu-honesty refusals (a form id with no strategy, and one block
missing a form the others emit, which is per block and is why the plant moves
one file rather than all of them), the solid cell watched red with the JSX
augmentation disabled, and the angular arity rule watched red in both TS2554
directions against the real blocks.

## Two departures from the spec's letter, both deliberate

`ngc --strictTemplates` is the angular cell where spec 5.1 item 3 says `tsc`:
`tsc` cannot open a templateUrl and does not understand Angular template syntax,
so a tsc-only cell would check the class and nothing in the template. And the
solid form renders custom elements for every tag, not only "where no component
exists": Solid components do exist for many tags, but every element carrying a
ref or an event must be a custom element and every ref and event in the three
blocks sits on a kai- tag, so a hybrid would make one tree speak two idioms for
no gain. Both are argued in the plan and both are worth a ruling.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Watch CI, and stop there**

```bash
cd "$WT" && gh pr checks --watch
```

Never pipe this or `gh pr merge` through `tail`: `set -e` does not see a refusal through a pipe, and that is how PR D lost its number. The merge, the branch deletion and the worktree removal are the controller's, after the whole-branch review. Report the PR number, the check results, and the four cell notes from Step 3.

Two things go in the report as OWNER-FACING rather than as findings, because a plan made both calls and only the owner can ratify them: **ruling R5** put `ngc` on a required gate where spec 5.1 item 3 says `tsc`, which adds a ninth devDependency to the gate's toolchain; and **ruling R1** read spec section 9's "where no component exists" as "every element carrying a ref or an event, so all of them". Both are argued where they are made and both are labelled as departures in the self-review's spec table. Name them in the PR body's summary paragraph so the reviewer does not have to find them.

---

## Self-review

**1. Spec coverage.**

<!-- gate-list: partial -- a spec-requirement traceability table, not a gate list; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints the merge gate -->

| Spec requirement | Task |
|---|---|
| 3.4 install roots, one table, displayed path equals written path | Tasks 3 to 6 (every renderer targets through `fileTarget()`), asserted per form in each suite and per block in `blocks-targets.test.ts`; ruling R17 says why no new guard is added |
| 3.5 vue: `<Name>.vue` + a composable, `:prop.prop` / `@kai-event`, README states `isCustomElement` | Task 3 |
| 3.5 svelte: `<Name>.svelte` + a store adapter, `bind:this`, `onkai-event` | Task 4, with the `$effect`-for-property-assignment mechanism replaced and the replacement justified from Svelte's own runtime |
| 3.5 angular: `<name>.component.{ts,html}` + a service, `[prop]` / `(kai-event)`, README states `CUSTOM_ELEMENTS_SCHEMA` | Task 5, with the `.component.css` dropped and why |
| 3.5 solid: `<Name>.tsx`, Solid reactivity over the controller | Task 6 |
| 3.5 every tree emits main component, adapter, controller, mock, css, README | Tasks 3 to 6; the mock and the css arrive through `carriedFiles`, and `forms-axis.test.ts` asserts every framework form ships a README |
| 3.5 handler names are derived, never invented | Tasks 3 to 6: vue and angular and svelte and solid all pass the AUTHORED event name straight through, because none of the four needs the react wrapper's `onName` rule; the suites pin the exact spelling per framework |
| 3.6 the Solid gap, option (a), plus a kit-fix backlog item derived from the coverage script | Ruling R1, Task 6, Task 6 Step 7 |
| Section 9 open item 2, "custom elements where no component exists" | **DEPARTURE, ruling R1.** Solid components DO exist for many tags (`Dock`, `Panel`, `Thread`, `Row`, `Button`, `PromptInput`, `Empty`), so the literal reading builds a hybrid tree. What the proofs in the tree support is narrower and stronger: every element carrying a `#ref` or an `@event` MUST be a custom element (the controller types its refs as element interfaces; the facade dispatches the `kai-` events), and every `#ref` and `@event` in the three blocks sits on a `kai-` tag. Mixing idioms for the remainder buys nothing, so: custom elements throughout. Owner-facing, flagged in Task 8 Step 4 |
| 5.1 item 1: compile cells, blocks x frameworks, axis derived, SFC frameworks need their own tools | Task 2 |
| 5.1 item 1: `vue-tsc` IS the vue cell, pinned by a planted-defect self-test | Ruling R4, Task 2 Steps 4 and 6. **Correction inside a satisfied requirement:** 5.1 and section 9 describe the mechanism as "an explicitly imported augmentation shim", and the tree says the requirement is REACHABILITY of the augmentation, which the emitted tree's own kit import already provides. The shim stays as belt and braces; the self-test arm is named for what it withholds |
| 5.1 item 2: structural checks (targets equal `targets.ts`) | Ruling R17: already covered for every form by `blocks-targets.test.ts` |
| 5.1 item 3: react runtime cell only, gate output names the compile-only ones | Ruling R7, Task 2 Step 5 |
| 5.1 item 3: "angular and solid through `tsc`" | **DEPARTURE for angular, ruling R5.** `tsc` cannot open a `templateUrl` and does not understand Angular template syntax, so a `tsc`-only angular cell type-checks the class and nothing in `<name>.component.html`, which is where every binding lives. `ngc --strictTemplates` is the cell instead, at the cost of a ninth devDependency on a required gate. Solid stays on `tsc`, as the spec says. Owner-facing, flagged in Task 8 Step 4 |
| 5.1 item 7: the dropdown is the framework renderer list | Ruling R10, Task 7 Step 1 |
| 5.1: every new guard watched failing first | Task 1 Steps 2 and 5; Task 2 Step 6 (the five plants, the two reachability arms, both menu-honesty refusals); Task 3 Steps 3, 6 and 7 (the suite, both couplings, and `forms-axis.test.ts`'s own two plants); Task 4 Step 2; Task 5 Steps 1, 3 and 6 (the arity red, the suite, and both TS2554 directions against the real blocks); Task 6 Steps 2 and 6; Task 7 Steps 2 and 3 |
| 8b amendment 7: non-react forms emit the registration import AND the `whenDefined` await | Tasks 3 to 6, asserted in each suite |
| 8b amendment 5: a seed is a mount effect in react, a static attribute elsewhere | Tasks 3 to 6, asserted in each suite |
| 8b amendment 8 (F-10): `="false"` translated per framework | Tasks 3 to 6, asserted in each suite |
| 8b amendment 1: `*for` with a mandatory `:key` | Tasks 3 to 5 use it; Task 6 rules that Solid's `<For>` has nowhere to put it and says so in the emitted file (ruling R11) |
| 8b amendment 2: `.textContent` is children | Tasks 3 to 6, asserted in each suite |
| 8b amendment 6: `refs` is a getter of nullable handles | Ruling R8, Tasks 3 to 6 |
| 2026-08-31 Part 2 and Part 7: nothing hand-authored per framework, a form the gate cannot compile is withheld | Rulings R9, R15 and R19, Task 2 Step 6, Task 3 Step 6 |
| Spec 3.5's "an Angular event binding calls the action" | Ruling R18, Task 5 Step 1. The spec does not say what to pass, and `strictTemplates` is strict in both directions, so `ControllerShape` grows `actionArity` and the renderer reads the declaration. Additive, so `react.ts`, `html.ts` and `checkBlockContracts` are untouched |
| Night run 3.4 bullet 1 (solid option a, re-derive the gap) | R1, Task 0 Step 2, Task 6 Step 7 |
| Night run 3.4 bullet 2 (vue-tsc IS the cell, planted-defect self-test) | R4, Task 2 |
| Night run 3.4 bullet 3 (svelte/angular/solid compile-only, gate says so) | R7, Task 2 Step 5 |
| Night run 3.4 bullet 4 (cell count and dropdown move together, confirm the dropdown grew unedited) | R10, Task 7 Step 1 |
| Night run 3.4 eval gate (cells with printed axes, the vue plant watched failing, the dropdown assertion) | Task 2 Step 6, Task 7 Step 1, Task 8 Step 3 |

Gaps found and closed while writing this: the Solid JSX augmentation (nothing in the spec anticipated it, and without it the solid form does not compile at all) became Task 1; the toolchains resolving only through hoisting became ruling R12 and Task 2 Step 1; the pack ceiling became ruling R13 and Task 7 Step 3; the Angular call arity, which the spec does not address and which `strictTemplates` refuses in both directions, became ruling R18 and Task 5 Step 1.

**2. Placeholder scan.** No "TBD", no "implement later", no "add error handling", no "similar to Task N". Tasks 4, 5 and 6 each restate the fixture-setup instruction in full rather than pointing back at Task 3, because an implementer may read them out of order. Every code step carries real code, and every predicted red names the exact message.

Two decision procedures that used to sit here have been replaced by answers, because in both cases the tree already settled it and leaving the question open was the more expensive option. The Angular `$event` arity is now ruling R18 with the type change scoped into Task 5 Step 1, rather than a rule over the event name plus an instruction to watch for TS2554. The `svelte-check --fail-on-warnings` question is now a fact: the unused-CSS warning fires only for a component `<style>` block, the emitted component has none, so the flag stays and any warning that does fire is about the emitted markup and the fix is the renderer.

**3. Type consistency.** `parseBlock`/`carriedFiles`/`nullRefs`/`isKai`/`camel`/`elementInterface`/`pascalTag`/`escapeAttr` are defined once in Task 3's `emit.ts` and used under those exact names in Tasks 4, 5 and 6, each of which lists them in its Consumes line. `renderVueForm`, `renderSvelteForm`, `renderAngularForm`, `renderSolidForm` are the names used in the re-exports, the `switch` cases and every suite. `FRAMEWORK_CELLS`, `CELL_NOTES`, `frameworkCellSelfTest` and `vueCellWithoutAugmentation` are defined in Task 2 and referenced by exactly those names in Tasks 3 to 6 and in `verify-scaffold-compiles.mjs`. `sandbox(project, name, opts)` with `opts.include` (appended to the default include, never replacing it) and `opts.tsconfigExtra` is defined in Task 2 Step 2 and called with those keys in Task 2 Step 3. `ControllerShape.actionArity` is added in Task 5 Step 1 and read only by Task 5's `bindingAttr`, whose signature carries it explicitly. The adapter contract is `use<Name>(refs: () => <Name>Refs)` in vue, svelte and solid, and `connect(refs: () => <Name>Refs)` in angular's store, which is the same signature reached through DI; `ready` is the gate name in all four. `KaiDockElement` is the ref type in every emitted example, matching the fixture's `#ref="dock"` on `<kai-dock>` and `elementInterface`'s derivation.
