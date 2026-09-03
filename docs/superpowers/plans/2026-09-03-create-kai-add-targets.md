# PR D: `create-kai add` onto the targets table, with host detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `create-kai add` onto `@kitn.ai/blocks`'s install-root table so the path the `/blocks` page displays is byte for byte the path the CLI writes, derive the host-framework detection rows from the renderer list instead of a hand table, print the README each emitted tree carries, and gate all of it with a real `add` driven from the PACKED tarball into one throwaway project per detected form.

**Architecture:** The renderers already compute `FormFile.target` from `fileTarget(framework, id, name)` (PR B, ruling R4). `planAdd` currently ignores that and joins its own `blockDir()` on top, which is the deliberate mismatch `packages/create-kai/test/pr-d-target-mismatch.test.ts` pins. This PR deletes the second join: every planned write is the rendered file's own `target`, so there is ONE derivation of a path in the repo and the site, the compile cells and the CLI all read it. Detection follows the same shape: `FRAMEWORK_SIGNALS` rows name a dependency and the FRAMEWORK it means, and where that framework lands is derived from `FRAMEWORK_BLOCK_FORMS` - its own tree when the generator emits one, the framework-neutral `html` form with a printed sentence when it does not. The new `verify:add` gate packs the CLI, installs it into throwaway projects of each detected shape, runs the published binary and compares every written byte against the generated `dist/blocks/f/<id>.<form>.json` artifacts the site serves.

**Tech Stack:** Node >= 20.19 ESM · TypeScript 5.5 (`tsc --noEmit`, no DOM lib in this package) · vitest 4 (node environment, `test/**/*.test.ts`) · esbuild (the CLI bundle and the `.js` twins) · `@kitn.ai/blocks` imported as `.ts` exports and bundled · `npm pack` + a real `npm install` for the smoke gate.

**Spec:** `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md` Part 3 (the CLI: what `add` writes, the detection rulings, resolution) and `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` sections 3.4 (the targets table), 3.5 (the renderers and their READMEs), 5.5 (the create-kai smoke), 8 (coupling rows), 8a, 8b and 9 (owner rulings). Operating order: `docs/superpowers/HANDOFF-2026-09-02-night-run.md` section 3.3 - **every bullet there is a requirement, not a suggestion** - and section 4. Predecessors whose house rules this plan copies: `docs/superpowers/plans/2026-09-02-blocks-pr-b-authored-contract.md` (ruling R4 in particular) and `docs/superpowers/plans/2026-09-03-blocks-pr-c-site-section.md`.

---

## Scope: PR D, and nothing else

IN scope:

- Task 0: applying the already-banked `chore(create-kai): blocks, not gallery, in the comments` patch, so the five remaining `gallery` comments under `packages/create-kai` say `/blocks` before Task 1 touches one of the same lines.
- `planAdd` writing every file at the rendered file's own `target`; `blockDir()` deleted; `packages/create-kai/test/pr-d-target-mismatch.test.ts` deleted in the same commit, said out loud in the commit body.
- The displayed-path-equals-written-path floor: a test comparing `planAdd`'s output against `dist/blocks/f/<id>.<form>.json` for every block and every form.
- The html renderer gaining the two-or-three-line README the react renderer already emits, through ONE shared `renderReadme`.
- `add` printing that README after the writes.
- `FRAMEWORK_SIGNALS` deriving its landing form from `FRAMEWORK_BLOCK_FORMS`, the printed sentence for a framework whose tree this release does not generate, ambiguity decided on the ANSWER rather than the signal count, and the ambiguous axis's options derived.
- `--form` menu honesty driven end to end: every offered value writes a real tree.
- `packages/create-kai/scripts/verify-add.mjs` (`verify:add`) plus its plants, and its step in the required CI graph.
- The two `docs/coupling-map.md` rows this PR moves.

OUT of scope, do not start any of it:

- **The `vue`, `svelte`, `angular` and `solid` renderers and their compile cells. That is PR B2.** Everything this PR adds must GROW when those land: a task that hand-lists two forms anywhere has failed the plan.
- **The `/blocks` site section.** PR C shipped it; `apps/docs` is not touched by this PR except where a coupling-map row names it.
- **New blocks.** The blocks under `packages/blocks/blocks/` only.
- **An MCP `add` tool** (2026-08-31 spec Part 6), the theme-builder hookup (Part 4), the pages move to `apps/`.
- Publishing anything. `create-kai`'s `prepublishOnly` is not extended (ruling R9).

---

## Global Constraints

- Branch `feat/create-kai-add-targets`, cut from `origin/main` AFTER PR C is squash-merged. Worktree `.claude/worktrees/blocks-d`, prepared by the controller and passed at dispatch. Export it once per shell:

```bash
export WT=/Users/home/Projects/kitn-ai/kitn-chat/.claude/worktrees/blocks-d
export SCRATCH="<the scratchpad path passed at dispatch>"
```

  Every command in this plan runs inside `"$WT"`. Never `git checkout` in a checkout another agent owns; if one does, stop and say so.
- **The three-step worktree prep, and skipping one produces a failure that reads like a broken checkout:** (1) `cd "$WT" && pnpm install` - a worktree under `.claude/worktrees/` resolves up into the parent checkout's `node_modules` while Vite refuses to serve paths outside the worktree root, and suites die on one identical `Cannot find module '/@fs/<parent>/node_modules/...'`; (2) `pnpm --filter @kitn.ai/ui run build:css` for the gitignored `packages/ui/src/elements/compiled.css`; (3) a real cold build, `cd "$WT/packages/ui" && npm run build`, for `dist/custom-elements.json` **and `dist/blocks/`, which Tasks 2 and 7 read**. `npm run` puts the ancestor `.bin` on PATH, so `build:css` can print success while every suite still fails identically. Confirm all three in pre-flight even when told the controller did them.
- **Never `nx build ui`** when you need a real build: the NX cache can restore a target whose generators write into the SOURCE tree, printing success while changing nothing. A cached build looks exactly like a successful one. Use `cd "$WT/packages/ui" && npm run build`, or `npm run build:blocks` when only `dist/blocks/` needs regenerating.
- **`create-kai`'s vitest drives `dist/`.** `test/helpers.ts` reads `packages/create-kai/dist/blocks`, and `menu-honesty.test.ts` reads `dist/templates`; both throw naming the build rather than passing on an empty set. So **`pnpm --filter create-kai run build` precedes the suite in every gate list in this plan**, and so does `pnpm --filter create-kai run typecheck`.
- **After touching any renderer in `packages/blocks`, regenerate the artifacts before running anything that reads them:** `pnpm --filter @kitn.ai/ui run build:blocks`. `verify:blocks [fresh]` is a `gen-blocks --check` and will otherwise report a stale tree that is really an unrun generator.
- **Never pipe a heavy suite, a build or a gate through `tail` inside an `&&` chain.** The exit status becomes the pipe's and a failure reads as a pass. One gate, one command.
- **Every new test and every new guard is watched FAILING first**, with the exact expected red stated in the step. A check nobody has seen fail is not evidence.
- **No hand-typed counts, sizes, versions or lists.** Name the command that prints the number. `docs/superpowers/**` is scanned by `node packages/ui/scripts/lint-gate-parity.mjs` and `node packages/ui/scripts/lint-threshold-derivation.mjs`, so a fenced block or table under that tree that looks like a merge-gate enumeration carries `<!-- gate-list: partial -- <reason> -->` above it. This plan carries those; keep them if you edit it.
- **The required gate is a graph, not a list.** Read it with `node packages/ui/scripts/lint-gate-parity.mjs --list`; never copy a list out of a handoff. A step added to `.github/workflows/test.yml` must use a shape the parity guard recognises - `pnpm --filter <pkg> run <script>` is recognised, an unknown `run:` shape is a hard failure naming the step.
- **No em dashes and no emoji** anywhere this branch adds prose, code comments included. `apps/docs/STYLE.md` is the voice: sharp human engineer, terse, no boilerplate.
- **No scratchpad path in a committed file**, and no absolute agent path in a commit message. Task 9 greps for both.
- macOS `sed` needs the empty backup argument: `sed -i '' -E`.
- Every commit ends with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

## Rulings this plan makes

Each ruling is here because an implementer would otherwise guess, and because the reason is not recoverable from the spec text.

**R1. `planAdd` writes `file.target` verbatim. It does not call `fileTarget()` itself, and `blockDir()` is deleted rather than rewritten.**

The night run says "`planAdd` writes every file at `fileTarget(framework, id, file.path)`". Calling `fileTarget()` in `planAdd` would satisfy that literally and still leave TWO derivations of one path: the renderer's, stamped into `FormFile.target` and shipped inside `dist/blocks/f/<id>.<form>.json` for the site to display, and the planner's. They agree on the day they are written, which is exactly the property the mismatch this PR closes also had. The renderers already compute `target` through `fileTarget()` (`packages/blocks/src/forms/{html,react}.ts`, and `cdn.ts` for its single file), and `verify:blocks [react-tree]` already re-derives and compares it per file with a self-test plant. So the planner reads the value; the derivation stays in one place; and Task 1's test asserts the identity `plan.files[i].path === fileTarget(form, id, rendered[i].path)` so the two statements of it can never come apart silently.

`blockDir()` is deleted, not repointed at `installRoot()`. A helper whose whole job was to invent a second directory has no honest reduced form.

**R2. The artifact floor compares BYTES, not just paths, and it locates `dist/blocks/f/` through Node's resolver.**

The requirement is a path comparison. Comparing content as well costs one line and closes the failure the path check cannot see: a CLI bundling a stale copy of the renderer would write the right paths with the wrong bytes, and the site would still be lying about what `add` writes. The artifacts carry `content` (verified below), so this is free.

The directory is resolved as `dirname(require.resolve('@kitn.ai/ui/package.json')) + '/dist/blocks/f'`, the precedent `packages/create-kai/scripts/build.mjs` sets for `@kitn.ai/blocks` and `packages/ui/scripts/verify-blocks.mjs` sets for the same package. `@kitn.ai/ui` exports `./package.json` (verified below). A repo-relative `../../ui` literal is the copy the derive-don't-type rule is about: it survives a package move silently until the directory it names is empty, and an empty read here would make the floor vacuous rather than red. `test/kit-contract.test.ts` uses the relative form with a `KAI_KIT_ROOT` override; that file's override exists to point at an EXTRACTED tarball, which is a different job, so it is not the precedent to copy here.

**R3. A missing `dist/blocks/f/` is a LOUD failure with the command that produces it, never a skip.**

The floor depends on a ui build, which create-kai's own suite otherwise does not. `helpers.ts` already sets the shape: `loadBundledBlocks` throws `no blocks at <path> - run \`pnpm --filter create-kai run build\` first`. The new reader throws naming `pnpm --filter @kitn.ai/ui run build:blocks` (verified standalone-runnable below: it reads block sources, `mcp/registry.ts`, `src/elements/element-nonscalar.json` and `package.json`, and writes into `dist/blocks/`). A skip here would be the exact "passes vacuously" class this repo names most often, and CI's `unit` leg downloads the kit artifact before create-kai runs, so a skip would only ever hide a local gap.

**R4. `FRAMEWORK_SIGNALS` rows name a FRAMEWORK, and the landing form is derived from `FRAMEWORK_BLOCK_FORMS`.**

Today the row carries `lands: 'react' | 'html'`, hand-decided per row. That is a list that has to be edited in lockstep with PR B2, in a file B2 has no reason to open. So the row becomes `{ dep, framework: TargetFramework | null }` and the landing form is `framework` when the generator emits a tree for it and `html` until then. Two consequences worth stating:

- `preact` carries `framework: null`. It is a real signal (a preact project is a project) and there is no `preact` install root and never will be one, so it always lands on `html`. `null` says that; `'html'` would have read as "preact's own tree is html", which is a different and false claim.
- The predicate that decides "does the generator emit this framework's tree" narrows to `TargetFramework & Exclude<BlockFormId, 'cdn'>`, which is `'html' | 'react'` today and grows to six the moment B2 adds rows to `BLOCK_FORMS`. Nothing in `create-kai` is edited by that change, which is the whole point.

**R5. Ambiguity is about the ANSWER, not the signal count.**

The night run says "ambiguous (two signals) -> ask loudly". Read literally that makes `vue` + `svelte` a question TODAY, when both land on the same `html` tree and there is nothing to choose - and `packages/create-kai/test/add.test.ts` already pins the opposite ("two non-react frameworks agree on the answer, so nothing is ambiguous"). So ambiguity stays defined as **two signals that decide different forms**. Today `react` + `svelte` asks and `vue` + `svelte` does not; after B2 `vue` + `svelte` asks too, because then they decide different trees, and it starts asking without anyone editing a condition. Asking a question whose options are all the same string is not loudness, it is noise.

**R6. The ambiguous axis's options are the forms actually in contention, derived, with labels read from `BLOCK_FORMS`.**

`blockFormAxis` hard-codes `[react, html]` with hand-written hints today. That is a menu with a hand list in it, in the one function whose whole reason for existing is the menu-honesty seam. It takes the contended form ids from the detection and renders one option per form, labelled from `BLOCK_FORMS` and hinted with that form's own install root from `INSTALL_ROOTS`. `because` gains a real sentence: `axes.ts` requires one, and an axis that can never be stated is a latent failure the day a detection produces one option.

**R7. The html form gets a README, through ONE `renderReadme` both renderers call, and the cdn form does not get one.**

Spec 3.5 says every framework tree emits "a README of two or three lines saying what the block needs ... plus the one framework-config line where there is one". The react renderer emits one (`packages/blocks/src/forms/react.ts`); the html renderer emits none (verified below). Rather than a second hand-written README template, both call `renderReadme(block, lines)` from a new `packages/blocks/src/forms/readme.ts`: title, description, the caller's one or two lines, then `manifest.docs` when there is one. The module is its own file because `html.ts` and `react.ts` must not import `forms/index.ts` (it re-exports them, so that is a cycle) - the same reason `FormFile` lives in `contract/types.ts`.

The cdn form does NOT get one: it is one pasted file with no directory to put a README in, and `renderCdnFormFiles` must keep emitting exactly one file. Its `renderedPage()` therefore drops the README before handing the tree to the inliner, and Task 3 asserts the cdn form is still one file.

**Two constraints on the README text, both mechanical.** It must not contain `EventSource`, `text/event-stream` or `.getReader(` - `verify:blocks [html-binder]` scans EVERY file of the form for a hand-rolled stream reader and would red the block on its own README. And it names files by their `path` (the name inside the tree), never by their `target`, because the reader is standing inside the directory `add` just announced.

**R8. `add` prints the README verbatim and stops printing `docs` separately when it did.**

The README already ends with `manifest.docs`. Printing both puts the same paragraph on the terminal twice. So: when the plan wrote a README for a block, that block's `docs` line is not printed again, and a test asserts the docs sentence appears exactly ONCE in the output. The cdn form has no README and keeps printing `docs`, which is the only way that sentence reaches a paste-form user at all.

The README is found by `path.posix.basename(file.path) === README_FILE`, with `README_FILE` exported from `@kitn.ai/blocks/forms` and used by both renderers when they emit it. One definition, matched not guessed.

**R9. `verify:add` is a required-CI gate, is NOT added to `prepublishOnly`, and runs its plants inside the same process as its real legs.**

Not in `prepublishOnly`: the react leg installs a packed `@kitn.ai/ui`, so wiring it into create-kai's publish hook would make publishing the CLI depend on packing the kit, and the release job publishes them from one workflow where that ordering is already the subject of an unfixed coupling-map row. CI is where this belongs.

One process, not the `verify:blocks` two-invocation pattern (`--self-test && <gate>`): the cost of this gate is the `npm install` in the react leg, and a second invocation doubles the only expensive thing it does. So `--self-test` runs the plants AFTER the real legs, against the same installed app, and the npm script passes it always. The script prints two sections and exits non-zero if either fails, so a plant that stops firing is as red as a leg that stops passing.

**R10. The react leg reuses the checked-in host fixture at `packages/ui/scripts/block-driver/react-host`, resolved through `@kitn.ai/ui`'s package root.**

The alternatives were a second copy of the fixture inside `packages/create-kai` (a copy of a pinned dependency set, which is the class of thing this repo keeps deleting) or the `consumer-tsc-projects.mjs` harness (cheaper - no `npm install` at all - but it resolves `@kitn.ai/ui` out of the BUILT WORKSPACE TREE, and the requirement is a typecheck against the INSTALLED kit; "the tree is not the tarball" is the whole reason this gate exists). So: copy the fixture, install the packed kit tarball into the copy (the CLI itself runs from the tools directory, R12 - see the reconciled R10/R12 note above), run the published CLI, write the one file the fixture does not ship (`src/block.ts`, whose import specifier is derived from the CLI's own written path), and run `npx tsc --noEmit` under the fixture's stock create-vite strict config. That is `verify-blocks-react.mjs`'s stage 2 shape, reused rather than reinvented, and it is stated in the PR body that the two gates deliberately overlap: that one proves the RENDERER's tree compiles, this one proves the PACKED CLI puts those bytes where a project can compile them.

**R11. Each leg discovers WHICH form it got by matching the tree on disk against the generated artifacts, instead of predicting it.**

The gate could restate "a vue project gets html". That row moves in B2 and the gate would then be asserting yesterday's behaviour. Instead each leg matches the written files byte for byte against every `f/<id>.<form>.json` (and `r/<id>.cdn.html` for the no-project leg), reports which form matched, and then asserts only what the RULING fixes and B2 cannot move:

- the react-deps leg matched `react`, and its targets are all under `src/`;
- the no-project leg matched the single-file cdn form, in the cwd;
- the non-react leg matched the form its declared framework's tree is emitted as, computed from which `f/<id>.<form>.json` files exist - so it expects `html` today and `vue` the day B2 emits one, with nothing edited;
- and the three legs matched three DIFFERENT forms, which is the anti-vacuity floor: three legs that all quietly landed on `html` would otherwise be one leg run three times.

**R12. The non-react and no-project legs install nothing.**

`add` writes files and merges a `package.json`; neither needs a node_modules. So the CLI is installed ONCE into a tools directory and invoked by absolute path with the leg's directory as its cwd. Only the react leg installs, because only it typechecks. The leg directories are siblings of the tools directory under separate `mkdtemp` roots, so the CLI's own install can never be found by `nearestPackageJson` walking up from a leg - which for the no-project leg would silently turn rule 1 into rule 3, the exact failure the leg exists to catch. The leg asserts the "No project here" line as proof it did not.

**R10 vs R12, reconciled: the react leg's app install carries only the kit tarball.** As first drafted, `reactLeg` installed BOTH `KIT_TARBALL` and `CLI_TARBALL` into the host app, but `add()` always invokes the CLI by absolute path out of the tools directory (R12) - the app-local `create-kai` install is never run. Two tarballs installed and one used is exactly the kind of unread copy this repo keeps deleting elsewhere, so the app install drops `CLI_TARBALL` and keeps only `KIT_TARBALL`, which is the one the compiled tree actually needs on its module graph.

**R13. `planAdd` routes every write through `@kitn.ai/blocks`'s own `renderBlockForm`, so an accepted form with no renderer throws instead of silently landing on the html tree.**

The adversarial review caught this: as drafted, Task 1's three `plan*Block` functions each called their OWN renderer directly (`renderHtmlForm`, `renderReactForm`, `renderCdnFormFiles`), and `planAdd`'s calling code branched `cdn` / `react` / else-html - so ANY form id that is neither `cdn` nor `react`, including one `BLOCK_FORMS` accepts that no renderer handles, fell into the html branch and wrote the html tree anyway, silently. That is the exact "menu accepts a value nothing can emit" shape Task 6 exists to catch, and Task 6's own planted test could not catch it, because nothing in the planner ever asked `@kitn.ai/blocks` whether the form has a renderer.

`renderBlockForm(block, form, opts)` (`packages/blocks/src/forms/index.ts`) is already the ONE dispatch `gen-blocks.mjs` and the CLI are both supposed to share, and its `switch` has no `default` - a form id added to `BLOCK_FORMS` with no case in that switch returns `undefined` at runtime and fails `tsc --noEmit` at compile time. So Task 1 now routes every planned file through it: `planFiles(renderBlockForm(block, opts.form, { cdn: { version: opts.kitVersion } }), plan)`, called once per block regardless of form. `planFiles`' `for (const file of files)` throws immediately (`files is not iterable`) the moment `files` comes back `undefined`, which is before any note is printed and before any file is written. Bespoke note text (react's "render `<X />` from Y", html's "open Y through your dev server") is kept as a second, notes-only step over the already-rendered files, so a future framework with no bespoke note still gets the generic html-shaped phrasing rather than nothing - Task 1 Step 3 below shows the rewritten dispatch. This is why Task 6's plant narrative (a `BLOCK_FORMS` row with no renderer throwing "out of `renderBlockForm`") is now literally true instead of aspirational.

---

## File structure

<!-- gate-list: partial -- a file-change table naming created/modified paths, not a gate list; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints the merge gate -->

| File | Created / Modified | Responsibility |
|---|---|---|
| `packages/create-kai/src/blocks.ts` | Modify (Task 0 comments, Task 1 substantively) | Task 0: two `gallery` comments reworded by the banked patch. Task 1: `planAdd` writes `file.target` by routing every form through `renderBlockForm`; `blockDir()` deleted; `FRAMEWORK_SIGNALS` rows name a framework; `landingForm`/`emitsOwnTree` derive from `FRAMEWORK_BLOCK_FORMS`; `Detection` carries the fallback frameworks; `blockFormAxis` derives its options. |
| `packages/create-kai/src/react-form.ts` | Modify (Task 0 only) | One `gallery` comment reworded by the banked patch. |
| `packages/create-kai/src/build-guards.ts` | Modify (Task 0 only) | One `gallery` comment reworded by the banked patch. |
| `packages/create-kai/scripts/build.mjs` | Modify (Task 0 only) | One `gallery` comment reworded by the banked patch. |
| `packages/create-kai/src/add.ts` | Modify | `decideForm` returns the loud fallback note; `runAdd` prints the README and suppresses the duplicated `docs` line. |
| `packages/create-kai/test/add-targets.test.ts` | Create | Where `add` writes: `planAdd` vs `fileTarget()` (pure), then `planAdd` vs `dist/blocks/f/<id>.<form>.json` bytes (the floor), for every block and every form. |
| `packages/create-kai/test/add.test.ts` | Modify | Derived paths in place of the `src/blocks` literals; the react-form collision case; the detection rows against the new table; the README print; every offered `--form` value driven end to end. |
| `packages/create-kai/test/pr-d-target-mismatch.test.ts` | **Delete** | The mismatch it pinned is closed by Task 1, in the same commit. |
| `packages/create-kai/scripts/verify-add.mjs` | Create | `verify:add`: pack, install, run the published CLI into one project per detected form, match every byte against the generated artifacts, typecheck the react tree, then plant four defects and watch them caught. |
| `packages/create-kai/package.json` | Modify | The `verify:add` script. |
| `packages/blocks/src/forms/readme.ts` | Create | `README_FILE` and `renderReadme(block, lines)` - the one README template both renderers call, including the derived "what the block needs" line. |
| `packages/blocks/src/forms/html.ts` | Modify | Emits the README. |
| `packages/blocks/src/forms/react.ts` | Modify | Emits its README through `renderReadme` instead of its own literal. |
| `packages/blocks/src/forms/cdn.ts` | Modify | Drops the README before inlining, so the paste form stays one file. |
| `packages/blocks/src/forms/index.ts` | Modify | Re-exports `README_FILE` and `renderReadme`. |
| `packages/blocks/tests/html-form.test.ts` | Modify | The html README: present, targeted, free of the stream-reader tokens. |
| `packages/blocks/tests/react-form.test.ts` | Modify | The react README still says what it said, now through the shared renderer. |
| `.github/workflows/test.yml` | Modify | The `verify:add` step in the `unit` job, beside the create-kai steps that already hang off its build, plus an `~/.npm` cache keyed on the react-host fixture and create-kai's `package.json`. |
| `docs/coupling-map.md` | Modify | The `INSTALL_ROOTS` row loses the mismatch test and gains this PR's guards; the forms-list row gains the create-kai side's enforcement. |

---

## Task 0: finish the gallery-word sweep, before Task 1 touches the same lines

**Files:**
- Modify: `packages/create-kai/scripts/build.mjs`, `packages/create-kai/src/blocks.ts`, `packages/create-kai/src/build-guards.ts`, `packages/create-kai/src/react-form.ts` (all four via the banked patch)
- Delete: `docs/superpowers/research/2026-09-03-create-kai-gallery-sweep.patch` (in its own commit)

**Interfaces:** none. Comment-only change; nothing here is imported by a later task.

Owner ruling S9/H4 ("call it blocks, not gallery, everywhere") already landed across most of the repo. Five `gallery` comments remain, all under `packages/create-kai`, and a patch for exactly those five was banked ahead of this plan rather than re-derived: `git apply --check` of it from the worktree root is clean today (verified below). This has to run BEFORE Task 1, because Task 1 Step 3 rewrites the same comment the patch's second hunk targets (`packages/create-kai/src/blocks.ts:323`) - apply the patch after Task 1 and that hunk no longer matches the file.

- [ ] **Step 1: Confirm the patch still applies**

```bash
cd "$WT" && git apply --check docs/superpowers/research/2026-09-03-create-kai-gallery-sweep.patch
```

Expected: no output, exit 0. If it fails, the patch has drifted from `main` since it was banked - stop and reconcile by hand rather than forcing it; do not proceed to Step 2 on a dirty check.

- [ ] **Step 2: Apply it and confirm the sweep is complete**

```bash
cd "$WT" && git apply docs/superpowers/research/2026-09-03-create-kai-gallery-sweep.patch
cd "$WT" && grep -rn "gallery" packages/create-kai --include='*.ts' --include='*.mjs' --include='*.json'
```

Expected: the grep prints nothing. `packages/create-kai/scripts/build.mjs:158`, `src/blocks.ts:39` and `:323`, `src/build-guards.ts:421`, `src/react-form.ts:3` all now say `/blocks` (the docs site's section) or nothing framework-specific in its place - never `gallery` and never `kai dev`'s gallery, which this release does not ship a page for either.

- [ ] **Step 3: Run the package's gates**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
```

Expected: green. Comment-only change; nothing here should move a test.

- [ ] **Step 4: Commit the sweep**

```bash
cd "$WT" && git add packages/create-kai/scripts/build.mjs packages/create-kai/src/blocks.ts packages/create-kai/src/build-guards.ts packages/create-kai/src/react-form.ts
cd "$WT" && git commit -m "$(cat <<'EOF'
chore(create-kai): finish the gallery-word sweep

Five comments under packages/create-kai still said "gallery" (owner ruling
S9/H4: blocks, not gallery, everywhere). Applies the patch banked ahead of
this plan rather than re-deriving it, before Task 1 touches one of the same
lines (src/blocks.ts:323).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

- [ ] **Step 5: Delete the banked patch, in its own commit**

The patch has done its job; keeping it in the tree after it is applied is a stale copy of a diff nothing reads again.

```bash
cd "$WT" && git rm docs/superpowers/research/2026-09-03-create-kai-gallery-sweep.patch
cd "$WT" && git commit -m "$(cat <<'EOF'
chore: drop the applied gallery-word-sweep patch

Applied in the previous commit. Nothing reads it again.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 1: `planAdd` writes at the targets table, and the mismatch test goes with it

**Files:**
- Modify: `packages/create-kai/src/blocks.ts` (the `blockDir` constant, the three `plan*Block` functions collapsed into one `planFormBlock` routed through `renderBlockForm`, and `planAdd`'s calling branch)
- Modify: `packages/create-kai/test/add.test.ts` (the `src/blocks` literals, plus a react collision case)
- Create: `packages/create-kai/test/add-targets.test.ts`
- Delete: `packages/create-kai/test/pr-d-target-mismatch.test.ts`

**Interfaces:**
- Consumes: `fileTarget(framework, blockId, fileName)`, `installRoot(framework, blockId)`, `isTargetFramework(id)`, `INSTALL_ROOTS` from `@kitn.ai/blocks/targets`; `renderBlockForm(block, form, { cdn })`, `FRAMEWORK_BLOCK_FORMS`, `BLOCK_FORMS`, `type FormFile` from `@kitn.ai/blocks/forms`.
- Produces: `planAdd` whose `files[].path` is the rendered file's `target`. Task 2 extends `test/add-targets.test.ts`; Tasks 4 and 5 build on the same `planAdd`.

- [ ] **Step 1: Write the failing test**

Create `packages/create-kai/test/add-targets.test.ts`:

```ts
/**
 * WHERE `add` WRITES.
 *
 * Every planned path is the rendered file's own `target`, which the renderers
 * derived through `fileTarget()` in `@kitn.ai/blocks/targets`. So the path the
 * /blocks page displays and the path the CLI writes are ONE string rather than
 * two joins that happen to agree today. `blockDir()` was the second join, and
 * it disagreed: it wrote react blocks to `src/blocks/<id>/` while the table
 * said `src/components/<id>/`.
 *
 * The loops are derived twice over: blocks from the shipped registry scan,
 * forms from `FRAMEWORK_BLOCK_FORMS`. PR B2's four renderers are covered here
 * on arrival with nothing to edit.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { FRAMEWORK_BLOCK_FORMS, renderBlockForm } from '@kitn.ai/blocks/forms';
import { fileTarget, isTargetFramework } from '@kitn.ai/blocks/targets';
import { planAdd } from '../src/blocks';
import type { Block } from '../src/blocks';
import { KIT_RANGE, KIT_VERSION, loadBundledBlocks } from './helpers';

let blocks: Block[];

beforeAll(async () => {
  blocks = await loadBundledBlocks();
});

describe('planAdd writes at the targets table', () => {
  it('has blocks and framework forms to drive, so the loops below are not vacuous', () => {
    expect(blocks.length).toBeGreaterThan(0);
    expect(FRAMEWORK_BLOCK_FORMS.length).toBeGreaterThan(0);
  });

  it('every framework form id is a framework the targets table knows', () => {
    // The coupling itself: a renderer added to BLOCK_FORMS with no install
    // root would make `fileTarget` unreachable for it, and the loops below
    // would throw rather than check anything.
    for (const form of FRAMEWORK_BLOCK_FORMS) {
      expect(isTargetFramework(form.id), `${form.id} has no install root`).toBe(true);
    }
  });

  for (const form of FRAMEWORK_BLOCK_FORMS) {
    it(`${form.id}: every planned path is fileTarget(${form.id}, id, name)`, () => {
      if (!isTargetFramework(form.id)) throw new Error(`${form.id} is not a target framework`);
      for (const block of blocks) {
        const rendered = renderBlockForm(block, form.id, { cdn: { version: KIT_VERSION } });
        expect(rendered.length, `${block.name}/${form.id}: rendered nothing`).toBeGreaterThan(0);
        const plan = planAdd(
          { blocks: [block], routes: [] },
          { form: form.id, kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
        );
        expect(plan.files.map((f) => f.path)).toEqual(
          rendered.map((f) => fileTarget(form.id, block.name, f.path)),
        );
      }
    });
  }

  it('the react form lands under src/components/<id>/ and never src/blocks/', () => {
    for (const block of blocks) {
      const plan = planAdd(
        { blocks: [block], routes: [] },
        { form: 'react', kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
      );
      expect(plan.files.length).toBeGreaterThan(0);
      for (const file of plan.files) {
        expect(file.path.startsWith(`src/components/${block.name}/`), file.path).toBe(true);
      }
    }
  });

  it('the cdn form is one self-contained file in the cwd, with no directory at all', () => {
    const block = blocks.find((b) => (b.manifest.registryDependencies ?? []).every((d) => d.startsWith('route:')));
    expect(block, 'no block can be rendered as a single paste file').toBeDefined();
    const plan = planAdd(
      { blocks: [block!], routes: [] },
      { form: 'cdn', kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
    );
    expect(plan.files.map((f) => f.path)).toEqual([`${block!.name}.html`]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai exec vitest run test/add-targets.test.ts
```

Expected: FAIL. `react: every planned path is fileTarget(react, id, name)` and `the react form lands under src/components/<id>/` both red, each showing `src/blocks/<id>/...` received against `src/components/<id>/...` expected. The `html` and `cdn` cases PASS - `blockDir('html')` already agrees with the table and the cdn form has no directory - and that split is the evidence that the red is the react root and not a broken harness.

- [ ] **Step 3: Delete `blockDir` and plan from the rendered targets**

In `packages/create-kai/src/blocks.ts`, delete these two lines:

```ts
const blockDir = (form: BlockForm, name: string) =>
  form === 'react' ? path.posix.join('src/blocks', name) : path.posix.join('blocks', name);
```

Extend the import from `@kitn.ai/blocks/forms` with the dispatch and the file type, and add the targets import beside it:

```ts
import {
  adaptRegistrationForBundler,
  componentName,
  renderBlockForm,
  type BlockFormId,
  type FormFile,
} from '@kitn.ai/blocks/forms';
import { fileTarget, installRoot, isTargetFramework } from '@kitn.ai/blocks/targets';
```

`renderHtmlForm`, `renderReactForm` and `renderCdnFormFiles` drop out of the import: nothing in this file calls a specific renderer directly any more (ruling R13). `isTargetFramework` is new; the react-form's note branch below uses it to keep the html note's phrasing exactly what it was.

Replace the three `plan*Block` functions AND the three-way branch in `planAdd` that calls them (the `if (opts.form === 'cdn') ... else if (opts.form === 'react') ... else { planHtmlBlock(...) }` a few lines above the functions) with:

```ts
// The rendered files come from the ONE shared dispatch, `renderBlockForm`
// (`@kitn.ai/blocks/forms`, which is what /blocks shows too) - never a
// specific renderer called by hand. What stays here is what only the CLI
// knows: where the files land (through `target`, already computed) and the
// note printed about them.

/**
 * The ONE place a rendered file becomes a planned write.
 *
 * `target` is the project-relative path the renderer already derived from
 * `@kitn.ai/blocks/targets`, and it is the same string the /blocks page
 * displays and the compile cells check. Joining a directory on here again is
 * what `blockDir()` did, and the two joins disagreed about react for a whole
 * release cycle: the table said `src/components/<id>/`, the CLI wrote
 * `src/blocks/<id>/`, and only a test asserting the mismatch knew.
 */
function planFiles(files: readonly FormFile[], plan: AddPlan): void {
  for (const file of files) plan.files.push({ path: file.target, contents: file.content });
}

/**
 * Render one block into `opts.form` and plan its files and its note.
 *
 * THE FILES ROUTE THROUGH `renderBlockForm`, NEVER A SPECIFIC RENDERER
 * (ruling R13). `@kitn.ai/blocks` keeps that dispatch's `switch` exhaustive
 * over every id in `BLOCK_FORMS` on its own side (no `default`, so a form
 * added there with no case fails ITS OWN `tsc --noEmit`); at runtime under a
 * partially-patched tree it returns `undefined`, and `planFiles`'s `for`
 * throws immediately - before a note is printed, before a file is written.
 * That is what stands between "a --form value BLOCK_FORMS accepts" and "add
 * silently writes the html tree for it", the failure a form id with no
 * renderer produces if the caller decides by hand instead of asking
 * `@kitn.ai/blocks`.
 */
function planFormBlock(block: Block, opts: PlanOptions, plan: AddPlan): void {
  const files = renderBlockForm(block, opts.form, { cdn: { version: opts.kitVersion } });
  planFiles(files, plan);

  if (opts.form === 'cdn') {
    plan.notes.push(
      `${block.name}: no project here, so this is the self-contained CDN paste form - open ${block.name}.html directly, or paste it into any page. To scaffold a project around it, run \`npm create kai@latest\`.`,
    );
    return;
  }
  if (opts.form === 'react') {
    const dir = installRoot('react', block.name);
    plan.notes.push(
      `${block.name}: react form under ${dir}/ (render <${componentName(block.name)} /> from ${fileTarget('react', block.name, `${componentName(block.name)}.tsx`)})`,
    );
    return;
  }
  // Every other project-shaped form, html included: the html-shaped note,
  // naming its own install root. `isTargetFramework` gates the cast the same
  // way it does everywhere else in this file; for 'html' this reproduces the
  // note byte for byte, and for a future framework with no bespoke note of
  // its own (PR B2's business, not this one) it is still a true sentence
  // rather than a missing one.
  const framework = isTargetFramework(opts.form) ? opts.form : 'html';
  const dir = installRoot(framework, block.name);
  const page = block.manifest.files.find((f) => f.type === 'registry:page');
  // `.pop()` is `string | undefined` to tsc even on a non-empty split, so the
  // fallback is spelled out rather than asserted away.
  const pageFile = page ? (page.target ?? page.path.split('/').pop() ?? page.path) : '';
  plan.notes.push(
    `${block.name}: web-component form under ${dir}/ (open ${fileTarget(framework, block.name, pageFile)} through your dev server)`,
  );
}
```

And in `planAdd`, replace the branch that used to call the three separate functions:

```ts
  for (const block of resolved.blocks) {
    planFormBlock(block, opts, plan);
```

(`opts` was already in scope there for `opts.kitVersion`; the old branch read `if (opts.form === 'cdn') { planCdnBlock(block, opts, plan); } else if (opts.form === 'react') { planReactBlock(block, plan); } else { planHtmlBlock(block, plan); }` - all three calls collapse into the one line above.)

`path` stays imported: `resolveAdd` and `loadBlocks` still use it.

- [ ] **Step 4: Run the new test and watch it pass**

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run test/add-targets.test.ts
```

Expected: PASS, every case.

- [ ] **Step 5: Watch the mismatch test go red for the right reason, then delete it**

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run test/pr-d-target-mismatch.test.ts
```

Expected: FAIL on `expect(written.every((p) => p.startsWith('src/blocks/...'))).toBe(true)` - received `false`, because the writes are now `src/components/...`. That is the file's own stated purpose ("Delete this file in PR D, in the commit that makes `planAdd` read `fileTarget()`"), and the red is what proves the mismatch is closed rather than merely untested.

```bash
cd "$WT" && git rm packages/create-kai/test/pr-d-target-mismatch.test.ts
```

- [ ] **Step 6: Move the remaining `src/blocks` literals in `add.test.ts` onto the table**

Three sites in `packages/create-kai/test/add.test.ts` name the old root or the old html root by hand. Add the import:

```ts
import { fileTarget, installRoot } from '@kitn.ai/blocks/targets';
```

In `renders registration per delivery: emitted scripts never import the CDN-only autoloader`:

```ts
      for (const base of [
        path.join(wcDir, installRoot('html', block.name)),
        path.join(reactDir, installRoot('react', block.name)),
      ]) {
```

In `the emitted binder signals readiness and awaits registration, at module scope`:

```ts
      const binder = await readFile(path.join(dir, fileTarget('html', block.name, `${block.name}.js`)), 'utf8');
```

In `writes the component, the hook and the controller for every block; never the page html`:

```ts
      const base = path.join(dir, installRoot('react', block.name));
```

And in `refuses a second add loudly, listing the collisions, overwriting nothing`, replace the two `path.join(dir, 'blocks', block.name, ...)` / `path.posix.join('blocks', block.name, ...)` expressions with `fileTarget('html', block.name, page.target ?? path.basename(page.path))` (joined onto `dir` for the absolute one).

- [ ] **Step 7: Add the react-form collision case, which had no coverage at the new root**

Append inside the `describe('react form (react in the project deps)')` block:

```ts
  it('refuses a second add at the NEW root too, overwriting nothing', async () => {
    // The collision refusal is whole-plan and unchanged by this PR, but it had
    // no react case at all, and the root it guards just moved. A refusal that
    // silently stopped matching would look exactly like a clean first add.
    const block = all()[0];
    const dir = await project('react-collide', { name: 'host', dependencies: { react: '^19.0.0' } });
    expect((await runInto(dir, [block.name])).code).toBe(0);
    const component = fileTarget('react', block.name, `${componentName(block.name)}.tsx`);
    await writeFile(path.join(dir, component), 'EDITED BY THE CONSUMER');
    const second = await runInto(dir, [block.name]);
    expect(second.code).toBe(1);
    expect(second.err.join('\n')).toContain('refusing to overwrite');
    expect(second.err.join('\n')).toContain(component);
    expect(await readFile(path.join(dir, component), 'utf8')).toBe('EDITED BY THE CONSUMER');
  });
```

- [ ] **Step 8: Run the package's gates**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
```

Expected: all green, and the run reports one fewer test file than before (the deleted mismatch file).

- [ ] **Step 9: Commit**

```bash
cd "$WT" && git add -A packages/create-kai
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(create-kai)!: add writes at the blocks targets table, not its own blockDir

`planAdd` now writes every file at the rendered file's own `target`, which the
renderers derive through `fileTarget()`. Every form routes through
`@kitn.ai/blocks`'s own `renderBlockForm` dispatch instead of `planAdd`
calling a specific renderer and falling back to the html one for anything it
does not recognize by name - a form id `BLOCK_FORMS` accepts with no renderer
now throws instead of silently landing on the html tree. The react root moves
from `src/blocks/<id>/` to the ruled `src/components/<id>/`, so the path the
/blocks page displays is the path the CLI writes, byte for byte.

DELETES `packages/create-kai/test/pr-d-target-mismatch.test.ts`. That test
asserted the mismatch EXISTS and named this commit as the one that closes it.
It was watched going red on the change first, which is what a test scheduled
for deletion is for: PR D deletes a failing test instead of discovering an old
lie later.

BREAKING CHANGE: `create-kai add <block>` writes the react form to
`src/components/<id>/` instead of `src/blocks/<id>/`.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 2: the displayed path IS the written path - the artifact floor

**Files:**
- Modify: `packages/create-kai/test/add-targets.test.ts`

**Interfaces:**
- Consumes: `planAdd` from Task 1; the generated `dist/blocks/f/<id>.<form>.json` artifacts (`{ block, form, files: [{ path, content, target }] }`).
- Produces: nothing other tasks import. Task 7's gate re-asks the same question against the PACKED CLI on a real filesystem; this one asks it against the planner in-process, which is where a red is cheap to read.

- [ ] **Step 1: Write the failing test**

First, add these three imports to the TOP of `packages/create-kai/test/add-targets.test.ts`, beside the imports Task 1 wrote (`path` is new to that file; Task 1 imported neither `node:fs` nor `node:module` there) - hoisted rather than appended mid-file, which is legal TS/ESM but reads like an accident:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
```

Then append the rest of this step to the end of the file:

```ts
/**
 * THE ANTI-VACUITY FLOOR under the whole "one renderer, two callers" claim.
 *
 * `dist/blocks/f/<id>.<form>.json` is what the /blocks page SHOWS: its file
 * tree prints those `target`s and its code view prints that `content`. This
 * asserts the CLI plans the same paths AND the same bytes. Paths alone would
 * miss a CLI that bundled a stale renderer, which writes the right names with
 * the wrong file in them - and the page would still be lying.
 *
 * Resolved through Node rather than a `../../ui` literal: a relative path
 * survives a package move silently until the directory it names is empty, and
 * an empty read here would make this file vacuous instead of red.
 */
const FORMS_DIR = path.join(
  path.dirname(createRequire(import.meta.url).resolve('@kitn.ai/ui/package.json')),
  'dist/blocks/f',
);

function formArtifact(blockName: string, form: string): { files: { path: string; content: string; target: string }[] } {
  const file = path.join(FORMS_DIR, `${blockName}.${form}.json`);
  if (!existsSync(file)) {
    // LOUD, never a skip: this floor is the only check that reads what the
    // site actually serves, and a skip would be indistinguishable from a pass.
    throw new Error(
      `no generated form artifact at ${file} - run \`pnpm --filter @kitn.ai/ui run build:blocks\` (a full \`npm run build\` in packages/ui writes it too)`,
    );
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('what /blocks displays is what add writes, byte for byte', () => {
  it('the generated artifacts are present, so the loops below are not vacuous', () => {
    expect(existsSync(FORMS_DIR), `${FORMS_DIR} is missing`).toBe(true);
    for (const block of blocks) {
      for (const form of FRAMEWORK_BLOCK_FORMS) {
        expect(formArtifact(block.name, form.id).files.length, `${block.name}.${form.id}`).toBeGreaterThan(0);
      }
    }
  });

  for (const form of FRAMEWORK_BLOCK_FORMS) {
    it(`${form.id}: planned paths and bytes equal the artifact the page serves`, () => {
      for (const block of blocks) {
        const artifact = formArtifact(block.name, form.id);
        const plan = planAdd(
          { blocks: [block], routes: [] },
          { form: form.id, kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
        );
        expect(plan.files.map((f) => f.path), `${block.name}/${form.id}: paths`).toEqual(
          artifact.files.map((f) => f.target),
        );
        for (const [i, file] of plan.files.entries()) {
          expect(file.contents, `${block.name}/${form.id}: ${file.path} bytes`).toBe(artifact.files[i].content);
        }
      }
    });
  }

  it('at least one form puts its files in a directory, so an empty-root renderer could not pass', () => {
    // Without this the whole describe is satisfied by a renderer whose every
    // target equals its bare file name, which is what a broken `fileTarget`
    // would produce on both sides at once.
    const nested = FRAMEWORK_BLOCK_FORMS.some((form) =>
      formArtifact(blocks[0].name, form.id).files.every((f) => f.target.includes('/')),
    );
    expect(nested, 'no framework form nests its files, which a targets table must').toBe(true);
  });
});
```

- [ ] **Step 2: Watch the floor fire on a doctored artifact before trusting it**

```bash
cd "$WT" && node -e "
const fs=require('fs');const p='packages/ui/dist/blocks/f/support-widget.react.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));fs.writeFileSync(p+'.bak',JSON.stringify(j));
j.files[0].target='src/elsewhere/x.tsx';fs.writeFileSync(p,JSON.stringify(j,null,2));"
cd "$WT" && pnpm --filter create-kai exec vitest run test/add-targets.test.ts
```

Expected: FAIL - `react: planned paths and bytes equal the artifact the page serves`, showing `src/elsewhere/x.tsx` expected against `src/components/support-widget/SupportWidget.tsx` received.

Now the bytes half:

```bash
cd "$WT" && node -e "
const fs=require('fs');const p='packages/ui/dist/blocks/f/support-widget.react.json';
const j=JSON.parse(fs.readFileSync(p+'.bak','utf8'));j.files[0].content+='\n// drift\n';
fs.writeFileSync(p,JSON.stringify(j,null,2));"
cd "$WT" && pnpm --filter create-kai exec vitest run test/add-targets.test.ts
```

Expected: FAIL on the same case, this time naming `SupportWidget.tsx bytes`.

And the missing-artifact message:

```bash
cd "$WT" && mv packages/ui/dist/blocks/f packages/ui/dist/blocks/f.bak
cd "$WT" && pnpm --filter create-kai exec vitest run test/add-targets.test.ts
```

Expected: FAIL naming `pnpm --filter @kitn.ai/ui run build:blocks`, from `the generated artifacts are present` - not a skip, not a green.

- [ ] **Step 3: Restore and confirm green**

```bash
cd "$WT" && mv packages/ui/dist/blocks/f.bak packages/ui/dist/blocks/f
cd "$WT" && mv packages/ui/dist/blocks/f/support-widget.react.json.bak packages/ui/dist/blocks/f/support-widget.react.json
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks
cd "$WT" && pnpm --filter create-kai exec vitest run test/add-targets.test.ts
```

Expected: PASS. `build:blocks` is run rather than trusting the restore, because a `.bak` shuffle is exactly how a doctored artifact gets left behind.

- [ ] **Step 4: Run the package's gates**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && git status --porcelain packages/ui/dist || true
```

Expected: green, and no stray `.bak` anywhere (`dist/` is gitignored, so `git status` will not show it - check with `ls packages/ui/dist/blocks/f`).

- [ ] **Step 5: Commit**

```bash
cd "$WT" && git add packages/create-kai/test/add-targets.test.ts
cd "$WT" && git commit -m "$(cat <<'EOF'
test(create-kai): the path /blocks displays is the path add writes, bytes included

Compares planAdd's output against dist/blocks/f/<id>.<form>.json - the same
artifacts the site's file tree and code view read - for every block and every
framework form. Paths AND content: a CLI bundling a stale renderer writes the
right names with the wrong bytes, and the page would still be lying.

Watched failing three ways first: a doctored target, doctored content, and a
missing artifact directory (which names `build:blocks` rather than skipping).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 3: the html form gets a README, through one shared renderer

**Files:**
- Create: `packages/blocks/src/forms/readme.ts`
- Modify: `packages/blocks/src/forms/html.ts`, `packages/blocks/src/forms/react.ts`, `packages/blocks/src/forms/cdn.ts`, `packages/blocks/src/forms/index.ts`
- Modify: `packages/blocks/tests/html-form.test.ts`, `packages/blocks/tests/react-form.test.ts`

**Interfaces:**
- Consumes: `Block` from `../registry`, `FormFile` from `../contract/types`, `fileTarget` from `../targets`.
- Produces: `README_FILE: 'README.md'` and `renderReadme(block: Block, lines: readonly string[]): string`, both re-exported from `@kitn.ai/blocks/forms`. Task 4 imports `README_FILE`.

- [ ] **Step 1: Write the failing tests**

In `packages/blocks/tests/html-form.test.ts`, append inside `describe('the html form')`, using the file's OWN fixture helper (`stripped()`, already declared at the top of the file - not a fresh identity strip, which would pass even if `withStrippedTwins` stopped doing anything):

```ts
  it('emits a README that says what the block needs and where it runs', () => {
    const files = renderHtmlForm(stripped());
    const readme = files.find((f) => f.path === 'README.md');
    expect(readme, 'the html form emitted no README').toBeDefined();
    expect(readme!.target).toBe('blocks/fixture/README.md');
    // Two or three lines saying what the block needs (spec 3.5), which for
    // this form is the one config fact a consumer cannot guess: the scripts
    // import a bare specifier, so the folder goes through a bundler.
    expect(readme!.content).toContain('fixture.html');
    expect(readme!.content).toContain('@kitn.ai/ui/elements');
  });

  it('the README carries none of the tokens the stream-reader scan bans', () => {
    // `verify:blocks [html-binder]` scans EVERY file of the form for a
    // hand-rolled SSE reader. A README that quoted one would red the block on
    // its own documentation, which is a red nobody would read correctly.
    const readme = renderHtmlForm(stripped()).find((f) => f.path === 'README.md')!;
    expect(readme.content).not.toMatch(/new\s+EventSource\(|text\/event-stream|\.getReader\(/);
  });
```

In `packages/blocks/tests/react-form.test.ts`, append inside the form's describe. This is deliberately NOT the same case as the existing `exports the component by NAME, which is what the README tells the reader to import` (line 137, which already passes today and would still pass with no README change at all - a duplicate proves nothing about the refactor). This is a byte-for-byte REGRESSION control instead: the fixture's `manifest.docs` is unset, so this pins the exact literal `react.ts` emits today, and it must still pass unchanged once `renderReadme` is the one producing it:

```ts
  it('the README is byte-identical to what this form emitted before the shared renderer (regression control)', () => {
    const readme = renderReactForm(block()).find((f) => f.path === 'README.md');
    expect(readme, 'the react form emitted no README').toBeDefined();
    expect(readme!.content).toBe(
      ['# F', '', 'f', '', "Render it: `import { Fixture } from './Fixture';`", ''].join('\n'),
    );
  });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/html-form.test.ts tests/react-form.test.ts
```

Expected: the two html cases FAIL with `the html form emitted no README` / `Cannot read properties of undefined (reading 'content')`; the new react case PASSES already, because it pins react's CURRENT literal output rather than the shared renderer's - that pass is the control this step needs: it proves the harness is right about what the react README says before anything moves, so if Step 5 below ever changes react's bytes this same case goes red for the right reason instead of silently drifting.

- [ ] **Step 3: Write the shared renderer**

Create `packages/blocks/src/forms/readme.ts`:

```ts
/**
 * The README every project-shaped delivery form ships (spec 3.5): two or
 * three lines saying what the block needs, plus the one framework-config line
 * where there is one.
 *
 * ONE TEMPLATE, in its own module. The html and react renderers must not
 * import `./index` (it re-exports them, so that is a cycle), which is the same
 * reason `FormFile` lives in `../contract/types`. Two hand-written READMEs
 * would drift the way two hand-written anything in this package drifts.
 *
 * THE CDN FORM HAS NO README, and that is deliberate: it is one pasted file
 * with no directory to put one in. Its `docs` reaches a user through the CLI's
 * closing note instead.
 *
 * WHAT MUST NOT APPEAR HERE: `EventSource`, `text/event-stream` or
 * `.getReader(`. `verify:blocks [html-binder]` scans every file of the html
 * form for a hand-rolled stream reader, and a README quoting one would fail
 * the block on its own documentation.
 */
import type { Block } from '../registry';

/** The file name both renderers emit and `create-kai add` prints back. */
export const README_FILE = 'README.md';

/**
 * "What the block needs" (spec 3.5), derived rather than left to ride on
 * `manifest.docs` alone. The three shipped blocks all carry a `docs` sentence
 * today (verified below), so this is currently invisible in every generated
 * README - but a future block with envVars or a route dependency and NO
 * `docs` would otherwise ship a README that says nothing about what it needs,
 * which is the gap the adversarial review flagged. `null` when the block
 * declares neither, so `renderReadme` adds nothing rather than an empty line.
 */
function needsLine(block: Block): string | null {
  const envVars = Object.keys(block.manifest.envVars ?? {});
  if (envVars.length > 0) return `Needs ${envVars.join(', ')} set.`;
  const routes = (block.manifest.registryDependencies ?? []).filter((d) => d.startsWith('route:'));
  if (routes.length > 0) {
    return `Needs a server route: ${routes.map((r) => r.slice('route:'.length)).join(', ')}.`;
  }
  return null;
}

/**
 * `lines` is the form-specific middle: how a consumer of THIS form renders the
 * block, and the one config line their framework needs. Everything around it
 * is the block's own manifest, so a block edits its README by editing its
 * manifest.
 */
export function renderReadme(block: Block, lines: readonly string[]): string {
  const needs = needsLine(block);
  return [
    `# ${block.manifest.title}`,
    '',
    block.manifest.description,
    '',
    ...lines,
    ...(needs ? ['', needs] : []),
    ...(block.manifest.docs ? ['', block.manifest.docs] : []),
    '',
  ].join('\n');
}
```

Add a test for the derivation itself. In `packages/blocks/tests/react-form.test.ts` (the react fixture is the more convenient one to extend inline, since `envVars`/`registryDependencies` are not part of the shared fixture files), append a case that builds a one-off block rather than reusing `block()`:

```ts
  it('the README names what the block needs when the manifest says so', () => {
    const withEnv: Block = { ...block(), manifest: { ...block().manifest, envVars: { OPENAI_API_KEY: 'a key' } } };
    const readme = renderReactForm(withEnv).find((f) => f.path === 'README.md')!;
    expect(readme.content).toContain('Needs OPENAI_API_KEY set.');

    const withRoute: Block = {
      ...block(),
      manifest: { ...block().manifest, registryDependencies: ['route:/api/chat'] },
    };
    const readmeRoute = renderReactForm(withRoute).find((f) => f.path === 'README.md')!;
    expect(readmeRoute.content).toContain('Needs a server route: /api/chat.');
  });
```

Watch this one FAIL before trusting it, the same way every other test in this plan is: comment out the two `needs ?` spreads in `renderReadme` (leave `needsLine` itself defined, so nothing else breaks), run `pnpm --filter @kitn.ai/blocks exec vitest run tests/react-form.test.ts -t 'needs'`, confirm both `toContain` assertions fail, then restore the two lines and re-run to confirm green.

- [ ] **Step 4: Emit it from the html renderer**

In `packages/blocks/src/forms/html.ts`, add the import:

```ts
import { README_FILE, renderReadme } from './readme';
```

and, in `renderHtmlForm`, immediately after the binder `put(...)` call:

```ts
  put(
    README_FILE,
    renderReadme(block, [
      `Open \`${pageEntry.path}\` through your dev server.`,
      '',
      'The scripts import `@kitn.ai/ui/elements` by bare specifier, so serve this folder through your bundler rather than opening the file from disk.',
    ]),
  );
```

- [ ] **Step 5: Route the react renderer through the same function**

In `packages/blocks/src/forms/react.ts`, add the same import, delete the local `const readme = [...].join('\n')` block, and replace `put('README.md', readme);` with:

```ts
  put(README_FILE, renderReadme(block, [`Render it: \`import { ${name} } from './${name}';\``]));
```

- [ ] **Step 6: Keep the cdn form a single file**

In `packages/blocks/src/forms/cdn.ts`, inside `renderedPage`, filter the README out before building the synthetic manifest:

```ts
function renderedPage(block: Block): Block {
  // `autoloader`, not the default: the register-all rewrite exists for
  // bundlers, and this form runs off raw CDN URLs in a plain page.
  //
  // The README is dropped here rather than never emitted: the html form is a
  // DIRECTORY and wants one, this form is a single pasted file and has nowhere
  // to put it. Handing it to the inliner would leave a markdown file in the
  // synthetic manifest that no `<script>` tag ever references, which is a file
  // the paste form would carry and no one would read.
  const html = renderHtmlForm(block, { registration: 'autoloader' }).filter((f) => f.path !== README_FILE);
```

with `import { README_FILE } from './readme';` at the top.

- [ ] **Step 7: Re-export from the barrel**

In `packages/blocks/src/forms/index.ts`, beside the other renderer re-exports:

```ts
export { README_FILE, renderReadme } from './readme';
```

- [ ] **Step 8: Run the blocks suites and watch them pass**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
```

Expected: PASS, including the pre-existing `emits the page, the binder, the stripped controller and the css` and `targets every file at blocks/<id>/` cases - if either asserts an exact file LIST it now needs `README.md` in it, and updating that list is part of this step.

- [ ] **Step 9: Regenerate the artifacts and run the block cells**

`verify:blocks` needs a local Chromium (its `[driver]` stage drives the block through a real browser) - `npx playwright install chromium` first if this worktree has not run it before.

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run build:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai exec vitest run
```

Expected: `verify:blocks` green on all its checks - in particular `[fresh]` (the regenerate ran) and `[html-binder]` (the README carries no stream-reader token). create-kai green: `add.test.ts`'s wc loop drives the html form's OWN file list, so the README is written and asserted automatically, and Task 2's floor picks up the new file on both sides.

- [ ] **Step 10: Commit**

```bash
cd "$WT" && git add packages/blocks
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the html form ships the README the react form already had

One `renderReadme` in src/forms/readme.ts, called by both renderers: title,
description, the form-specific render or serve line, a derived "what the
block needs" line (envVars, then a route dependency, then nothing), then the
manifest's docs. Spec 3.5 asks every project-shaped tree for two or three
lines saying what the block needs plus the one framework-config line; the
html tree had none, and a block with no `docs` sentence had no needs line at
all.

The cdn form drops it before inlining and stays a single pasted file. The
template deliberately quotes no stream-reader token, because
`verify:blocks [html-binder]` scans every file of the form for one.

The three shipped blocks all carry a `docs` sentence today, so the derived
needs line is currently invisible in every generated README: verified byte
for byte by react-form.test.ts's new regression control.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 4: `add` prints the README it just wrote

**Files:**
- Modify: `packages/create-kai/src/add.ts`
- Modify: `packages/create-kai/test/add.test.ts`

**Interfaces:**
- Consumes: `README_FILE` from `@kitn.ai/blocks/forms` (Task 3); `AddPlan` from `./blocks`.
- Produces: `runAdd` output whose tail is the README verbatim, with the block's `docs` printed exactly once.

- [ ] **Step 1: Write the failing test**

Add `README_FILE` to `test/add.test.ts`'s existing `@kitn.ai/blocks/forms` import (`BLOCK_FORMS, withStrippedTwins` today), then append inside `describe('web-component form (any non-react project)')`:

```ts
  it('prints the README it just wrote, and prints the docs sentence exactly once', async () => {
    // The README is what a consumer reads to find out what the block needs.
    // Writing it and not printing it makes the terminal end on a file list.
    for (const block of all()) {
      const dir = await project(`readme-${block.name}`, { name: 'host', dependencies: { vue: '^3.0.0' } });
      const run = await runInto(dir, [block.name]);
      expect(run.code, run.err.join('\n')).toBe(0);
      const written = await readFile(path.join(dir, fileTarget('html', block.name, README_FILE)), 'utf8');
      const printed = run.out.join('\n');
      for (const line of written.trimEnd().split('\n').filter((l) => l.trim())) {
        expect(printed, `${block.name}: the README line "${line}" was written but not printed`).toContain(line);
      }
      if (block.manifest.docs) {
        const hits = printed.split(block.manifest.docs).length - 1;
        expect(hits, `${block.name}: the docs sentence appears ${hits} times`).toBe(1);
      }
    }
  });
```

And inside `describe('no project: the CDN paste form (rule 1 of the signals table)')`:

```ts
  it('still prints docs for the paste form, which carries no README', async () => {
    const block = blocks.find((b) => (b.manifest.registryDependencies ?? []).every((d) => d.startsWith('route:')))!;
    const dir = await project('cdn-docs', null);
    const run = await runInto(dir, [block.name]);
    expect(run.code).toBe(0);
    expect(existsSync(path.join(dir, 'README.md')), 'the paste form wrote a README').toBe(false);
    if (block.manifest.docs) expect(run.out.join('\n')).toContain(block.manifest.docs);
  });
```

- [ ] **Step 2: Run them and watch the first fail**

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts -t 'README'
```

Expected: `prints the README it just wrote` FAILS - the first assertion that trips is either a README line missing from the output, or the docs count reading `2` (the docs sentence is inside the README AND printed by the existing `for (const docs of plan.docs)` loop) once the README is printed. The cdn case PASSES, which is the control.

- [ ] **Step 3: Print it**

In `packages/create-kai/src/add.ts`, extend the forms import:

```ts
import { BLOCK_FORMS, README_FILE } from '@kitn.ai/blocks/forms';
```

and replace the two closing loops of `runAdd`:

```ts
  for (const note of plan.notes) env.out(note);

  // THE README, VERBATIM. Every project-shaped form ships one (spec 3.5): what
  // the block needs, and the one framework-config line where there is one.
  // Writing it without printing it ends the command on a file list and leaves
  // the consumer to go find the thing that explains the files.
  //
  // Matched on the renderer's OWN constant rather than the string "README.md",
  // and on the basename because the path is the project-relative target.
  const readmes = plan.files.filter((file) => path.posix.basename(file.path) === README_FILE);
  for (const readme of readmes) {
    env.out('');
    for (const line of readme.contents.trimEnd().split('\n')) env.out(line);
  }

  // `docs` is the LAST line of every README, so printing it again under a form
  // that shipped one puts the same paragraph on the terminal twice. The cdn
  // paste form has no README, and this is the only way its docs are seen.
  if (readmes.length === 0) for (const docs of plan.docs) env.out(docs);
  return 0;
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts
```

Expected: PASS, every case, including the pre-existing `writes every manifest file and pins the kit`, which asserts `run.out` contains `block.manifest.docs` - now satisfied through the README.

- [ ] **Step 5: Run the package's gates**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
```

- [ ] **Step 6: Commit**

```bash
cd "$WT" && git add packages/create-kai
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(create-kai): add prints the README it just wrote

Every project-shaped form ships a README saying what the block needs plus its
one framework-config line. `add` wrote it and then ended on a file list. It now
prints it verbatim, matched on the renderer's own README_FILE constant, and
stops printing `docs` separately when it did: the docs sentence is the README's
last line, and two copies on one terminal is noise. The cdn paste form carries
no README and keeps its docs line, which is the only place it is seen.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 5: detection derives its landing form from the renderer list

**Files:**
- Modify: `packages/create-kai/src/blocks.ts` (`FRAMEWORK_SIGNALS`, `Detection`, `detectForm`, `blockFormAxis`)
- Modify: `packages/create-kai/src/add.ts` (`decideForm`, and the note `runAdd` prints)
- Modify: `packages/create-kai/test/add.test.ts` (the `describe('the detection signals table, row by row')` block)

**Interfaces:**
- Consumes: `FRAMEWORK_BLOCK_FORMS`, `BLOCK_FORMS`, `type BlockFormId` from `@kitn.ai/blocks/forms`; `INSTALL_ROOTS`, `type TargetFramework` from `@kitn.ai/blocks/targets`.
- Produces: `FRAMEWORK_SIGNALS: readonly { dep: string; framework: TargetFramework | null }[]`; `landingForm(framework)`; `Detection` with `{ kind: 'detected'; form; found; fallback }` / `{ kind: 'ambiguous'; found; forms }`; `blockFormAxis(found, forms)`; `decideForm(...)` returning `{ form?, error?, note? }`.

- [ ] **Step 1: Write the failing tests**

Replace the body of `describe('the detection signals table, row by row')` in `packages/create-kai/test/add.test.ts` with:

```ts
describe('the detection signals table, row by row', () => {
  it('no package.json is rule 1: the cdn form', async () => {
    const decided = await decideForm(undefined, null, false, false, { ask: async () => 'x', state: () => {} });
    expect(decided.form).toBe('cdn');
  });

  it('has signal rows to drive, so the loop below is not vacuous', () => {
    expect(FRAMEWORK_SIGNALS.length).toBeGreaterThan(0);
  });

  for (const signal of FRAMEWORK_SIGNALS) {
    // The EXPECTATION is derived from the same place the code derives it: a
    // framework lands in its own tree when the generator emits one, and in the
    // framework-neutral html form until then. PR B2 moves both sides at once.
    const emits = FRAMEWORK_BLOCK_FORMS.some((form) => form.id === signal.framework);
    const expected = emits ? signal.framework : 'html';

    it(`${signal.dep} alone lands on ${expected}`, () => {
      const detection = detectForm({ dependencies: { [signal.dep]: '1.0.0' } });
      expect(detection.kind).toBe('detected');
      expect(detection.kind === 'detected' && detection.form).toBe(expected);
    });

    it(`${signal.dep}: the fallback is named when this release generates no ${signal.framework ?? 'framework'} tree`, () => {
      const detection = detectForm({ dependencies: { [signal.dep]: '1.0.0' } });
      if (detection.kind !== 'detected') throw new Error('expected a detection');
      // `null` means the framework has no tree of its own and never will
      // (preact renders web components like any other host), so it is not a
      // fallback to announce.
      expect(detection.fallback).toEqual(emits || signal.framework === null ? [] : [signal.framework]);
    });
  }

  it('every framework a signal names has an install root', () => {
    for (const signal of FRAMEWORK_SIGNALS) {
      if (signal.framework === null) continue;
      expect(isTargetFramework(signal.framework), signal.framework).toBe(true);
    }
  });

  it('a project with no framework signal at all is still a project: web components', () => {
    const detection = detectForm({ dependencies: { express: '^4.0.0' } });
    expect(detection).toEqual({ kind: 'detected', form: 'html', found: [], fallback: [] });
  });

  it('devDependencies count as signals too', () => {
    expect(detectForm({ devDependencies: { react: '^19.0.0' } }).kind).toBe('detected');
  });

  it('two signals that decide DIFFERENT forms are ambiguous, with what was found named', () => {
    // react always has its own tree; svelte does not until PR B2. Whichever is
    // true, these two decide different forms, which is what makes it a
    // question worth asking.
    const detection = detectForm({ dependencies: { react: '1', svelte: '4' } });
    expect(detection.kind).toBe('ambiguous');
    expect(detection.kind === 'ambiguous' && detection.found).toEqual(['react', 'svelte']);
  });

  it('two signals that decide the SAME form are not a question at all', () => {
    // Today vue and svelte both land on html, so there is nothing to choose
    // and asking would be noise. When B2 emits both trees they start deciding
    // different forms and this case flips on its own - which is why the
    // expectation is derived rather than written.
    const forms = new Set(['vue', 'svelte'].map((dep) => {
      const d = detectForm({ dependencies: { [dep]: '1' } });
      return d.kind === 'detected' ? d.form : 'ambiguous';
    }));
    const detection = detectForm({ dependencies: { vue: '3', svelte: '4' } });
    expect(detection.kind).toBe(forms.size === 1 ? 'detected' : 'ambiguous');
  });

  it('ambiguous + interactive ASKS through the axis seam, offering only the forms in contention', async () => {
    const asked: Axis[] = [];
    const decided = await decideForm(
      undefined,
      { dependencies: { react: '1', svelte: '4' } },
      true,
      true,
      { ask: async (axis) => { asked.push(axis); return axis.options[axis.options.length - 1].id; }, state: () => {} },
    );
    expect(asked).toHaveLength(1);
    expect(asked[0].question).toContain('react AND svelte');
    expect(asked[0].options.length).toBeGreaterThan(1);
    // MENU HONESTY: every option offered is a form the generator emits.
    for (const option of asked[0].options) {
      expect(BLOCK_FORMS.map((f) => f.id), `offered '${option.id}'`).toContain(option.id);
    }
    expect(asked[0].because.length, 'an axis with an empty `because` cannot be stated').toBeGreaterThan(0);
    expect(decided.form).toBe(asked[0].options[asked[0].options.length - 1].id);
  });

  it('ambiguous + non-interactive REFUSES with the flag to pass, never guesses', async () => {
    const decided = await decideForm(
      undefined,
      { dependencies: { react: '1', svelte: '4' } },
      true,
      false,
      { ask: async () => { throw new Error('must not ask under --yes'); }, state: () => {} },
    );
    expect(decided.form).toBeUndefined();
    expect(decided.error).toContain('react AND svelte');
    expect(decided.error).toContain('--form');
  });

  it('a --form flag answers the axis without asking, like every other flag', async () => {
    const decided = await decideForm('html', { dependencies: { react: '1' } }, true, true, {
      ask: async () => { throw new Error('flag given, must not ask'); },
      state: () => {},
    });
    expect(decided.form).toBe('html');
  });

  it('a framework with no generated tree is told so, loudly, in one sentence', async () => {
    // Decided loudly: landing a vue project on the html form is a decision,
    // and making it silently is the failure mode this repo names most often.
    const decided = await decideForm(undefined, { dependencies: { vue: '3' } }, true, false, {
      ask: async () => { throw new Error('not ambiguous, must not ask'); },
      state: () => {},
    });
    const emitsVue = FRAMEWORK_BLOCK_FORMS.some((form) => form.id === 'vue');
    if (emitsVue) {
      expect(decided.form).toBe('vue');
      expect(decided.note).toBeUndefined();
    } else {
      expect(decided.form).toBe('html');
      expect(decided.note).toContain('vue');
      expect(decided.note).toContain('html');
    }
  });
});
```

Add `isTargetFramework` to the test file's `@kitn.ai/blocks/targets` import and `FRAMEWORK_BLOCK_FORMS` to its forms import.

- [ ] **Step 2: Run them and watch them fail**

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts -t 'detection signals'
```

Expected: FAIL, at RUNTIME rather than at collection - vitest transpiles this file without type-checking it, so `signal.framework` on the OLD `{ dep, lands }` rows reads `undefined` for every row rather than throwing a compile error. Two shapes of red follow from that one fact: `<dep>: the fallback is named...` fails for EVERY signal, because the old `detectForm` result has no `fallback` property at all (`expect(undefined).toEqual([...])`); and `react alone lands on html` fails on its own (`expected 'html', received 'react'`), because the test's `expected` variable was miscomputed from the always-`undefined` `signal.framework` while the OLD code still correctly returns `'react'` for that one row. The other five `... alone lands on ...` cases pass by coincidence (today's old rows already send them to html). Running `pnpm --filter create-kai run typecheck` afterwards additionally shows the COMPILE-time version of the same defect, `Property 'framework' does not exist on type '{ dep: string; lands: ... }'` - that is the confirmation, not the vitest symptom.

- [ ] **Step 3: Rewrite the table and the detection**

In `packages/create-kai/src/blocks.ts`, replace the imports and the detection block:

```ts
import {
  BLOCK_FORMS,
  FRAMEWORK_BLOCK_FORMS,
  adaptRegistrationForBundler,
  componentName,
  renderCdnFormFiles,
  renderReactForm,
  renderHtmlForm,
  type BlockFormId,
  type FormFile,
} from '@kitn.ai/blocks/forms';
import { INSTALL_ROOTS, fileTarget, installRoot, type TargetFramework } from '@kitn.ai/blocks/targets';
```

```ts
// ---------------------------------------------------------- framework detection

/**
 * The signals table (spec Part 3, detection ruling). DATA, so a new framework
 * variant is a row, not a branch.
 *
 * A row names the dependency and the FRAMEWORK it means. Where that framework
 * LANDS is not in the table: it is derived from the renderer list below, so
 * the day a renderer for it exists the row starts pointing at its own tree
 * with nothing here to edit. The previous version carried the landing form per
 * row, which made this file a second copy of "which renderers exist" living in
 * a package the renderer work has no reason to open.
 *
 * `preact` carries `null`: it is a real signal (a preact project is a project)
 * and it will never have an install root of its own, because a preact host
 * renders the custom elements like any other. `null` says that; `'html'` would
 * have read as "preact's own tree is the html one", which is a different and
 * false claim.
 */
export const FRAMEWORK_SIGNALS: readonly { dep: string; framework: TargetFramework | null }[] = [
  { dep: 'react', framework: 'react' },
  { dep: 'preact', framework: null },
  { dep: 'vue', framework: 'vue' },
  { dep: 'svelte', framework: 'svelte' },
  { dep: '@angular/core', framework: 'angular' },
  { dep: 'solid-js', framework: 'solid' },
];

export type BlockForm = BlockFormId;
/** Every form that is a project tree: the delivery forms minus the paste form. */
export type ProjectForm = Exclude<BlockForm, 'cdn'>;

/**
 * Does this release generate a tree for this framework?
 *
 * The narrowing is the coupling, spelled in the type system: a form id that is
 * also a target framework. Today that is `html` and `react`; PR B2 adds four
 * rows to `BLOCK_FORMS` and this predicate widens with them.
 */
function emitsOwnTree(framework: TargetFramework | null): framework is TargetFramework & ProjectForm {
  return framework !== null && FRAMEWORK_BLOCK_FORMS.some((form) => form.id === framework);
}

/** Where a signal's framework lands TODAY: its own tree when the generator
 *  emits one, the framework-neutral html form until then. */
export function landingForm(framework: TargetFramework | null): ProjectForm {
  return emitsOwnTree(framework) ? framework : 'html';
}

export type Detection =
  | { kind: 'none' }
  | {
      kind: 'detected';
      form: ProjectForm;
      found: string[];
      /** frameworks this project uses whose OWN tree this release does not
       *  generate yet, so the caller can say so instead of deciding quietly */
      fallback: TargetFramework[];
    }
  | { kind: 'ambiguous'; found: string[]; forms: ProjectForm[] };

/** Read the detection off a parsed package.json, or its absence. */
export function detectForm(packageJson: unknown | null): Detection {
  if (packageJson === null || typeof packageJson !== 'object') return { kind: 'none' };
  const pkg = packageJson as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const found = FRAMEWORK_SIGNALS.filter((signal) => signal.dep in deps);
  const forms = [...new Set(found.map((signal) => landingForm(signal.framework)))];

  // AMBIGUITY IS ABOUT THE ANSWER, NOT THE SIGNAL COUNT. Two signals landing
  // on the same tree is not a question: today vue and svelte both land on the
  // html form and asking which of two identical outcomes the user wants is
  // noise, not loudness. When PR B2 emits both trees they start deciding
  // different forms and this begins asking on its own.
  if (forms.length > 1) return { kind: 'ambiguous', found: found.map((s) => s.dep), forms };

  return {
    kind: 'detected',
    // Any project with no framework signal at all - or one whose only signal
    // has no tree of its own - gets the base web-component form: elements work
    // everywhere.
    form: forms[0] ?? 'html',
    found: found.map((s) => s.dep),
    fallback: found
      .map((s) => s.framework)
      .filter((f): f is TargetFramework => f !== null && !emitsOwnTree(f)),
  };
}

/**
 * The ambiguous case as an axis, so the ask goes through the same `AxisIo`
 * seam every other create-kai question does and the menu-honesty discipline
 * (spy-driven tests over what was CALLED) applies to it.
 *
 * The options are the forms actually IN CONTENTION, derived from the
 * detection, with labels read off `BLOCK_FORMS`. Hand-listing two of them here
 * was a menu with a hand list in it, inside the one function whose reason for
 * existing is the menu-honesty seam.
 */
export function blockFormAxis(found: readonly string[], forms: readonly ProjectForm[]): Axis {
  const label = (id: string): string => BLOCK_FORMS.find((form) => form.id === id)?.label ?? id;
  return {
    id: 'block-form',
    label: 'Block form',
    question: `This project depends on ${found.join(' AND ')}; which form does the block land in?`,
    options: forms.map((id) => ({
      id,
      label: label(id),
      hint: `files under ${INSTALL_ROOTS[id]}/<block>/`,
    })),
    because: 'the frameworks this project uses all land in the same form',
  };
}
```

- [ ] **Step 4: Carry the loud fallback through `decideForm`**

In `packages/create-kai/src/add.ts`:

```ts
export async function decideForm(
  override: string | undefined,
  packageJson: unknown | null,
  hasProject: boolean,
  interactive: boolean,
  io: AxisIo,
): Promise<{ form?: BlockForm; error?: string; note?: string }> {
  if (override !== undefined) return { form: override as BlockForm };
  if (!hasProject) return { form: 'cdn' };
  const detection = detectForm(packageJson);
  if (detection.kind === 'ambiguous') {
    if (!interactive) {
      return {
        error:
          `this project depends on ${detection.found.join(' AND ')}, so the block form is ambiguous. ` +
          `Pass ${detection.forms.map((form) => `--form ${form}`).join(' or ')}.`,
      };
    }
    const axis = blockFormAxis(detection.found, detection.forms);
    const answer = await io.ask(axis, axis.options[0].id);
    return { form: answer as BlockForm };
  }
  if (detection.kind === 'none') return { form: 'html' };
  return {
    form: detection.form,
    // DECIDED LOUDLY. Landing a vue project on the framework-neutral form is a
    // decision, and a decision made without saying so is the failure mode this
    // repo names most often. The sentence states the framework, the form and
    // the reason; the trees for the remaining frameworks arrive with the rest
    // of the renderers (spec 3.5).
    note:
      detection.fallback.length === 0
        ? undefined
        : `this project uses ${detection.fallback.join(' and ')}, and this release generates no ${detection.fallback.join('/')} tree yet, ` +
          `so the block lands in the framework-neutral html form (the kai- elements work in every framework). ` +
          `The generated ${detection.fallback.join(' and ')} trees arrive with the remaining renderers.`,
  };
}
```

and in `runAdd`, right after the form is decided:

```ts
  const form = decided.form;
  if (decided.note) env.out(`create-kai add: ${decided.note}`);
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
```

Expected: PASS. If `typecheck` reds on `INSTALL_ROOTS[id]`, the cause is `ProjectForm` not being provably a key of `INSTALL_ROOTS` - fix it at the source by typing `blockFormAxis`'s parameter as `readonly (ProjectForm & TargetFramework)[]`, never with a cast.

- [ ] **Step 6: Prove the derivation is live, not decorative**

```bash
cd "$WT" && node -e "
const fs=require('fs');const p='packages/blocks/src/forms/index.ts';const s=fs.readFileSync(p,'utf8');
fs.writeFileSync(p+'.bak',s);
fs.writeFileSync(p,s.replace(\"{ id: 'react', label: 'React' },\", \"{ id: 'react', label: 'React' },\n  { id: 'vue', label: 'Vue' },\"));"
cd "$WT" && pnpm --filter create-kai exec vitest run
```

Run the WHOLE create-kai suite for this plant, not just `-t 'detection signals'`: the `BLOCK_FORMS` row this plants adds a real target framework with no renderer behind it, and `detectForm`/`landingForm` (this task's own subject) cannot tell that apart from a real one - only code that actually RENDERS the form can, which lives in Task 1's and Task 2's files, not this task's.

Expected:
- `test/add.test.ts -t 'detection signals'` now includes a case named `vue alone lands on vue` (the case NAME changed with no test edited) and it PASSES - `landingForm('vue')` derives `'vue'` because `FRAMEWORK_BLOCK_FORMS` now lists it, exactly as designed. That PASS, with a renamed case and no code touched, is the derivation proof this step exists for.
- `test/add-targets.test.ts` (Task 1 and Task 2's file) goes RED: the per-form loop over `FRAMEWORK_BLOCK_FORMS` now includes `vue`, so `renderBlockForm(block, 'vue', ...)` is called directly and returns `undefined` (`@kitn.ai/blocks`'s own switch has no `vue` case), and `rendered.length` throws `Cannot read properties of undefined (reading 'length')`. `planAdd({ ... }, { form: 'vue', ... })` throws the same way through `planFormBlock`'s `renderBlockForm` call (ruling R13) before it ever reaches a note. Task 2's floor additionally fails `the generated artifacts are present` naming `pnpm --filter @kitn.ai/ui run build:blocks`, because `dist/blocks/f/<id>.vue.json` was never generated for this plant.

That combination - the detection SIDE derives cleanly and passes, the RENDER side has nothing behind it and throws loudly - is exactly what "the landing form is derived, and a form with no renderer fails somewhere real" is supposed to look like. PR B2 turns both green by writing the vue renderer and regenerating the artifacts, with nothing in this task's own file touched.

```bash
cd "$WT" && mv packages/blocks/src/forms/index.ts.bak packages/blocks/src/forms/index.ts
cd "$WT" && git diff --stat packages/blocks
```

Expected: no diff under `packages/blocks`.

- [ ] **Step 7: Commit**

```bash
cd "$WT" && git add packages/create-kai
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(create-kai): detection rows name a framework, and the landing form is derived

FRAMEWORK_SIGNALS rows carried `lands: 'react' | 'html'`, hand-decided per row,
which made this file a second copy of "which renderers exist" in a package the
renderer work never opens. A row now names the framework, and where it lands
comes from FRAMEWORK_BLOCK_FORMS: its own tree when the generator emits one,
the framework-neutral html form until then, with a printed sentence saying so
rather than deciding it quietly.

Two more derivations: the ambiguous axis offers the forms actually in
contention with labels from BLOCK_FORMS, not a hand-written pair; and
ambiguity is decided on the ANSWER, so two signals landing on the same tree
stay silent today and start asking on their own the day both trees exist.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 6: every offered `--form` value writes a real tree

**Files:**
- Modify: `packages/create-kai/test/add.test.ts`

**Interfaces:**
- Consumes: `BLOCK_FORMS`, `FRAMEWORK_BLOCK_FORMS` from `@kitn.ai/blocks/forms`; `runAdd` through the file's existing `runInto` helper.
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the failing test**

Append to `packages/create-kai/test/add.test.ts` a new describe:

```ts
describe('menu honesty: every --form value the flag accepts writes a real tree', () => {
  // `menu-honesty.test.ts`'s rule applied to the delivery-form flag. The
  // accepted set is the axis itself, and every value in it is driven through
  // the REAL runAdd into a real temp project. A form the flag accepts but the
  // generator cannot emit fails here whether or not anyone remembered a case,
  // and PR B2's four forms are covered on arrival.
  it('has forms and blocks to drive, so the loops below are not vacuous', () => {
    expect(BLOCK_FORMS.length).toBeGreaterThan(1);
    expect(blocks.length).toBeGreaterThan(0);
  });

  for (const form of BLOCK_FORMS) {
    it(`--form ${form.id} writes every file the form renders`, async () => {
      for (const block of blocks) {
        // A project with NO framework signal, so the flag is the only thing
        // deciding: a leg that also matched detection would pass on detection.
        const dir = await project(`form-${form.id}-${block.name}`, { name: 'host' });
        const run = await runInto(dir, [block.name, '--form', form.id]);
        expect(run.code, `${block.name} --form ${form.id}: ${run.err.join('\n')}`).toBe(0);
        const planned = planAdd(
          { blocks: [block], routes: [] },
          { form: form.id, kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
        ).files;
        expect(planned.length, `${block.name} --form ${form.id}: planned nothing`).toBeGreaterThan(0);
        for (const file of planned) {
          expect(existsSync(path.join(dir, file.path)), `${block.name} --form ${form.id}: ${file.path} not written`).toBe(true);
        }
      }
    });
  }
});
```

`form.id` is a `BlockFormId`, which is what `PlanOptions.form` takes, so no cast is needed.

- [ ] **Step 2: Run it and watch it fail on a planted dishonest menu**

The set is already honest, so watch the check FAIL rather than assume it can:

```bash
cd "$WT" && node -e "
const fs=require('fs');const p='packages/blocks/src/forms/index.ts';const s=fs.readFileSync(p,'utf8');
fs.writeFileSync(p+'.bak',s);
fs.writeFileSync(p,s.replace(\"{ id: 'cdn', label: 'CDN single file' },\", \"{ id: 'cdn', label: 'CDN single file' },\n  { id: 'angular', label: 'Angular' },\"));"
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts -t 'menu honesty'
```

Expected: FAIL once - `--form angular writes every file the form renders` (`runAdd` exits non-zero: `planFormBlock` calls `renderBlockForm(block, 'angular', ...)`, which returns `undefined` because `@kitn.ai/blocks`'s own switch has no `angular` case, and `planFiles`'s `for (const file of files)` throws on it - ruling R13 is why this reds at all; before Task 1 routed every form through `renderBlockForm`, `planAdd`'s own `else` branch treated any unrecognized form as html and this case passed silently). That second failure is the exact shape of the shipped defect this rule exists for: a flag accepting a value nothing can emit.

```bash
cd "$WT" && mv packages/blocks/src/forms/index.ts.bak packages/blocks/src/forms/index.ts
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts -t 'menu honesty'
```

Expected: PASS.

- [ ] **Step 3: Run the package's gates**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && git diff --stat packages/blocks
```

Expected: green, and no diff under `packages/blocks`.

- [ ] **Step 4: Commit**

```bash
cd "$WT" && git add packages/create-kai/test/add.test.ts
cd "$WT" && git commit -m "$(cat <<'EOF'
test(create-kai): every --form value the flag accepts is driven through a real add

menu-honesty.test.ts's rule applied to the delivery-form flag: the accepted set
is BLOCK_FORMS itself, and each value writes a real tree into a real temp
project with no framework signal, so the flag is the only thing deciding.
Watched failing on a planted BLOCK_FORMS row with no renderer behind it, which
is the shipped-defect shape this rule exists for.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 7: `verify:add` - the packed tarball into one project per detected form

**Files:**
- Create: `packages/create-kai/scripts/verify-add.mjs`
- Modify: `packages/create-kai/package.json`

**Interfaces:**
- Consumes: `readPackedFilename` from `<repo>/scripts/pack-listing.mjs`; the built `packages/create-kai/dist/`; the built `packages/ui/dist/` (for `npm pack` and for `dist/blocks/{f,r}`); the fixture at `packages/ui/scripts/block-driver/react-host/`.
- Produces: `pnpm --filter create-kai run verify:add`. Task 8 wires it into CI.

- [ ] **Step 1: Write the script**

Create `packages/create-kai/scripts/verify-add.mjs`:

```js
#!/usr/bin/env node
/**
 * verify:add -- the PUBLISHED `create-kai add`, into one throwaway project per
 * detected form.
 *
 * The tree is not the tarball and the tarball is not what npx runs. Every
 * other check in this package reads `dist/` in the working tree; this one packs
 * the CLI, installs it, and runs the binary a user runs. What it grades is the
 * one thing no unit test can see: that the bytes the PACKED CLI puts on a real
 * filesystem, at real paths, are the bytes the /blocks page shows.
 *
 * THE LEGS ARE THE DETECTION ROWS (spec Part 3):
 *   react in the deps  -> the typed-wrapper tree, and it must COMPILE
 *   another framework  -> that framework's tree if this release emits one,
 *                         the framework-neutral html tree if it does not
 *   no project at all  -> the self-contained single-file paste form
 *
 * NOTHING PREDICTS WHICH FORM A LEG GETS. Each leg matches what landed on disk
 * against the generated artifacts and reports the form that matched, so PR B2
 * moves this gate's verdicts without moving a line of it. What is asserted is
 * what the RULING fixes: react gets the react tree under src/, no-project gets
 * the one-file paste form, and the three legs got three DIFFERENT forms --
 * which is the anti-vacuity floor, because three legs that all quietly landed
 * on html would be one leg run three times.
 *
 * ONLY THE REACT LEG INSTALLS. `add` writes files and merges a package.json;
 * neither needs a node_modules. So the CLI is installed once into a tools
 * directory and invoked by absolute path with the leg's directory as its cwd,
 * and the leg dirs are siblings of it under separate mkdtemp roots -- if the
 * tools install were an ANCESTOR of the no-project leg, `nearestPackageJson`
 * would walk up into it and turn rule 1 into rule 3 silently. The leg asserts
 * the "No project here" line as proof it did not.
 *
 * THE REACT HOST IS packages/ui/scripts/block-driver/react-host, reused rather
 * than copied: a stock create-vite react-ts app with PINNED dependency ranges,
 * which is the difference between a gate and a weather report. It deliberately
 * overlaps `verify:blocks:react` -- that gate proves the RENDERER's tree
 * compiles, this one proves the PACKED CLI puts those bytes where a project
 * can compile them.
 *
 *   node scripts/verify-add.mjs              # the legs
 *   node scripts/verify-add.mjs --self-test  # the legs, then four plants
 *   node scripts/verify-add.mjs --keep       # leave the projects for a look
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPackedFilename } from '../../../scripts/pack-listing.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');
const KEEP = process.argv.includes('--keep');

const require_ = createRequire(import.meta.url);
// Resolved through the package, never a `../../ui` literal: a relative path
// survives a package move silently until the directory it names is empty.
const UI_ROOT = path.dirname(require_.resolve('@kitn.ai/ui/package.json'));
const FORMS_DIR = path.join(UI_ROOT, 'dist/blocks/f');
const ITEMS_DIR = path.join(UI_ROOT, 'dist/blocks/r');
const REACT_HOST = path.join(UI_ROOT, 'scripts/block-driver/react-host');

const log = (msg) => console.log(msg);
const fail = (msg) => {
  console.error(`\nverify:add: ${msg}\n`);
  process.exit(1);
};
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

// ------------------------------------------------------------------ preflight

for (const [what, where, how] of [
  ['the built CLI', path.join(PKG_ROOT, 'dist/index.js'), 'pnpm --filter create-kai run build'],
  ['the bundled block registry', path.join(PKG_ROOT, 'dist/blocks'), 'pnpm --filter create-kai run build'],
  ['the generated form artifacts', FORMS_DIR, 'pnpm --filter @kitn.ai/ui run build:blocks'],
  ['the generated paste forms', ITEMS_DIR, 'pnpm --filter @kitn.ai/ui run build:blocks'],
  ['the react host fixture', REACT_HOST, 'check out packages/ui'],
]) {
  if (!existsSync(where)) fail(`${what} is missing at ${where}. Run \`${how}\` first: this gate drives the published artifact and cannot skip.`);
}

/** The blocks this release ships, read off the bundled registry the CLI walks. */
const BLOCKS = readdirSync(path.join(PKG_ROOT, 'dist/blocks'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(PKG_ROOT, 'dist/blocks', d.name, 'registry-item.json')))
  .map((d) => d.name);
if (BLOCKS.length === 0) fail('the bundled registry has no blocks, so every leg below would assert nothing');

/** Which framework forms the generator emits, read off the artifact names. */
const EMITTED_FORMS = [...new Set(
  readdirSync(FORMS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length).split('.').pop()),
)].sort();
if (EMITTED_FORMS.length === 0) fail(`no <block>.<form>.json under ${FORMS_DIR}`);

// -------------------------------------------------------------------- packing

const tmpRoot = mkdtempSync(path.join(tmpdir(), 'verify-add-'));
// toolsDir is created below, once the CLI is packed; declared here so cleanup
// can remove it too, and guarded on being set since it does not exist yet.
let toolsDir;
const cleanup = () => {
  if (KEEP) {
    log(`\n  (--keep) projects left at ${tmpRoot}`);
    if (toolsDir) log(`  (--keep) tools install left at ${toolsDir}`);
    return;
  }
  rmSync(tmpRoot, { recursive: true, force: true });
  if (toolsDir) rmSync(toolsDir, { recursive: true, force: true });
};
process.on('exit', cleanup);

// The npm to pack with, honoring VERIFY_PACK_NPM the same way verify-pack.mjs
// does, so this gate can be re-run under the release job's pinned npm too.
const NPM = process.env.VERIFY_PACK_NPM ?? 'npm';

function pack(dir, label) {
  const out = path.join(tmpRoot, 'tarballs');
  mkdirSync(out, { recursive: true });
  // readPackedFilename(raw, { npmVersion }) -> { filename, shape }: npm 12
  // moved `npm pack --json`'s top level from an array to an object keyed by
  // package name (see <repo>/scripts/pack-listing.mjs), so the version has to
  // be read first and handed in - verify-blocks-react.mjs is the precedent.
  const npmVersion = run(NPM, ['--version'], dir).trim();
  const { filename } = readPackedFilename(
    run(NPM, ['pack', '--json', '--pack-destination', out], dir),
    { npmVersion },
  );
  const file = path.join(out, filename);
  log(`  packed    ${label} -> ${path.basename(file)}`);
  return file;
}

const CLI_TARBALL = pack(PKG_ROOT, 'create-kai');
const KIT_TARBALL = pack(UI_ROOT, '@kitn.ai/ui');

// The CLI, installed ONCE, in its own root so it can never be an ancestor of a
// leg's project directory.
toolsDir = mkdtempSync(path.join(tmpdir(), 'verify-add-tools-'));
writeFileSync(path.join(toolsDir, 'package.json'), JSON.stringify({ name: 'verify-add-tools', private: true }, null, 2));
run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', CLI_TARBALL], toolsDir);
const CLI = path.join(toolsDir, 'node_modules/create-kai/dist/index.js');
if (!existsSync(CLI)) fail(`the packed CLI installed without a ${path.relative(toolsDir, CLI)} - the tarball is missing its bin`);

// ------------------------------------------------------------------ the match

/** Every generated form of one block, as `{ form, files: [{ target, content }] }`. */
function generatedForms(block) {
  const forms = EMITTED_FORMS.map((form) => ({
    form,
    files: JSON.parse(readFileSync(path.join(FORMS_DIR, `${block}.${form}.json`), 'utf8')).files,
  }));
  const paste = path.join(ITEMS_DIR, `${block}.cdn.html`);
  if (existsSync(paste)) {
    forms.push({ form: 'cdn', files: [{ target: `${block}.html`, content: readFileSync(paste, 'utf8') }] });
  }
  return forms;
}

/**
 * Which generated form is on disk under `root` for `block`, byte for byte.
 *
 * Returns the form id, or throws naming the first file that disagreed. Matching
 * rather than predicting is what makes this gate survive PR B2 unedited.
 */
function matchForm(root, block) {
  const misses = [];
  for (const candidate of generatedForms(block)) {
    const wrong = candidate.files.find((file) => {
      const abs = path.join(root, file.target);
      return !existsSync(abs) || readFileSync(abs, 'utf8') !== file.content;
    });
    if (!wrong) return candidate.form;
    const abs = path.join(root, wrong.target);
    misses.push(`${candidate.form}: ${wrong.target} ${existsSync(abs) ? 'differs byte for byte' : 'was not written'}`);
  }
  throw new Error(`${block}: nothing on disk matches a generated form.\n    ${misses.join('\n    ')}`);
}

/** Run the published CLI's `add` in `cwd`, returning its output. */
function add(cwd, block, extra = []) {
  try {
    return run(process.execPath, [CLI, 'add', block, '-y', ...extra], cwd);
  } catch (err) {
    throw new Error(`${block}: \`create-kai add\` exited ${err.status}\n${(err.stdout || '') + (err.stderr || '')}`);
  }
}

// -------------------------------------------------------------------- the legs

const results = [];

/**
 * A project directory with the given package.json, in its own mkdtemp root
 * under tmpRoot (not under toolsDir - R12 only forbids toolsDir being an
 * ancestor of a leg, and nesting here means cleanup()'s single rmSync of
 * tmpRoot removes every leg directory too, not just the react host).
 */
function project(label, pkg) {
  const dir = mkdtempSync(path.join(tmpRoot, `verify-add-${label}-`));
  if (pkg !== null) writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

// LEG 1: react in the deps. The only leg that installs, because it is the only
// one that compiles. The host fixture ships everything but src/block.ts.
function reactLeg() {
  const app = path.join(tmpRoot, 'react-host');
  cpSync(REACT_HOST, app, { recursive: true });
  // ONLY the kit tarball: `add()` always invokes the CLI by absolute path out
  // of the tools directory below (R12), never an app-local install, so
  // installing CLI_TARBALL here too would be a copy nothing reads (R10 vs R12,
  // reconciled - see the ruling).
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', KIT_TARBALL], app);
  const installed = JSON.parse(readFileSync(path.join(app, 'node_modules/@kitn.ai/ui/package.json'), 'utf8')).version;
  log(`  react     installed @kitn.ai/ui@${installed} from the tarball`);

  const forms = [];
  for (const block of BLOCKS) {
    const out = add(app, block);
    const form = matchForm(app, block);
    forms.push(form);
    for (const file of generatedForms(block).find((f) => f.form === form).files) {
      if (!out.includes(file.target)) throw new Error(`${block}: wrote ${file.target} without announcing it`);
    }
    log(`  react     ${block} -> ${form}`);
  }
  if (new Set(forms).size !== 1 || forms[0] !== 'react') {
    fail(`the react leg landed on ${[...new Set(forms)].join(', ')}; a project with react in its dependencies gets the typed-wrapper tree (spec Part 3, rule 2)`);
  }
  for (const block of BLOCKS) {
    for (const file of generatedForms(block).find((f) => f.form === 'react').files) {
      if (!file.target.startsWith('src/')) fail(`${block}: the react tree targets ${file.target}, which a src-rooted project cannot compile`);
    }
  }

  // src/block.ts: the one file the host does not ship, because it names the
  // block. The specifier is derived from the CLI's own written path.
  const first = BLOCKS[0];
  const tsx = generatedForms(first).find((f) => f.form === 'react').files.find((f) => f.target.endsWith('.tsx'));
  const component = path.basename(tsx.target, '.tsx');
  writeFileSync(
    path.join(app, 'src/block.ts'),
    `export { ${component} as Block } from './${tsx.target.slice('src/'.length, -'.tsx'.length)}';\n`,
  );

  try {
    run('npx', ['tsc', '--noEmit'], app);
  } catch (err) {
    fail(`the tree the packed CLI wrote does not compile against the installed @kitn.ai/ui:\n${(err.stdout || '') + (err.stderr || '')}`);
  }
  log('  react     tsc --noEmit clean over every written tree');
  results.push({ leg: 'react', form: 'react' });
  return app;
}

// LEG 2: another framework. `vue` because it is a signal row with no tree of
// its own today; the expectation is COMPUTED from which artifacts exist, so
// the day PR B2 emits a vue tree this leg expects it with nothing edited.
function otherFrameworkLeg() {
  const dir = project('vue', { name: 'host', private: true, dependencies: { vue: '^3.0.0' } });
  const expected = EMITTED_FORMS.includes('vue') ? 'vue' : 'html';
  const forms = [];
  for (const block of BLOCKS) {
    const out = add(dir, block);
    const form = matchForm(dir, block);
    forms.push(form);
    if (expected === 'html' && !out.includes('generates no vue tree yet')) {
      fail(`${block}: landed on the html form without saying why. A quiet fallback is the decision this gate exists to catch.`);
    }
    log(`  vue       ${block} -> ${form}`);
  }
  if (forms.some((form) => form !== expected)) {
    fail(`the vue leg landed on ${[...new Set(forms)].join(', ')}, expected ${expected} (computed from the forms under ${FORMS_DIR})`);
  }
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (!pkg.dependencies['@kitn.ai/ui']) fail('the vue leg did not merge the kit pin into package.json');
  results.push({ leg: 'vue', form: expected });
  return dir;
}

// LEG 3: no project at all. Rule 1: the self-contained paste form, in the cwd.
function noProjectLeg() {
  const dir = project('none', null);
  for (const block of BLOCKS) {
    const out = add(dir, block);
    if (!out.includes('No project here')) {
      fail(`${block}: no package.json anywhere above ${dir}, but the CLI did not take rule 1. Something up the tree owns a package.json.`);
    }
    const form = matchForm(dir, block);
    if (form !== 'cdn') fail(`${block}: a directory with no project got the ${form} form`);
    const written = readdirSync(dir);
    if (written.length !== BLOCKS.indexOf(block) + 1) {
      fail(`${block}: the paste form wrote ${written.length} entries (${written.join(', ')}); it is ONE self-contained file`);
    }
    log(`  none      ${block} -> cdn`);
  }
  results.push({ leg: 'none', form: 'cdn' });
  return dir;
}

log('\nverify:add -- the packed CLI, one project per detected form\n');
const reactApp = reactLeg();
const vueDir = otherFrameworkLeg();
noProjectLeg();

// THE ANTI-VACUITY FLOOR. Three legs that all landed on the same form would be
// one leg run three times, and every assertion above would still pass.
if (new Set(results.map((r) => r.form)).size !== results.length) {
  fail(`the legs landed on ${results.map((r) => `${r.leg}=${r.form}`).join(', ')} - they must cover DIFFERENT detection rows`);
}
log(`\n  OK        ${results.map((r) => `${r.leg} -> ${r.form}`).join(', ')} (${BLOCKS.length} block(s) each)`);

// ------------------------------------------------------------------ the plants

if (SELF_TEST) {
  log('\n  self-test: four plants, in the projects the legs left behind\n');
  const plants = [];
  const plant = (label, ok, detail = '') => {
    log(`${ok ? '  SELF-TEST OK ' : '  SELF-TEST RED'} ${label}`);
    if (!ok) plants.push(`${label}${detail ? ` -- ${detail}` : ''}`);
  };

  // 1. The collision refusal, whole-plan and loud. A second add over an edited
  //    file must refuse everything and overwrite nothing.
  {
    const block = BLOCKS[0];
    // MATCH, never predict (R11): the vue leg's form is whatever it actually
    // landed on, read off `results` rather than hard-coded as 'html' - the
    // day PR B2 emits a vue tree this leg's row in `results` says 'vue' and
    // the plant follows it with nothing here edited.
    const vueForm = results.find((r) => r.leg === 'vue').form;
    const target = generatedForms(block).find((f) => f.form === vueForm).files[0].target;
    const abs = path.join(vueDir, target);
    writeFileSync(abs, 'EDITED BY THE CONSUMER');
    let refused = false;
    let message = '';
    try {
      add(vueDir, block);
    } catch (err) {
      refused = true;
      message = err.message;
    }
    plant('a second add refuses, lists the collision, and overwrites nothing',
      refused && message.includes('refusing to overwrite') && message.includes(target)
        && readFileSync(abs, 'utf8') === 'EDITED BY THE CONSUMER',
      message.split('\n')[0]);
  }

  // 2. tsc must be able to fail. A compile leg that cannot go red is compile
  //    theatre, and it looks exactly like a passing one.
  {
    const block = BLOCKS[0];
    const tsx = generatedForms(block).find((f) => f.form === 'react').files.find((f) => f.target.endsWith('.tsx'));
    const abs = path.join(reactApp, tsx.target);
    const original = readFileSync(abs, 'utf8');
    writeFileSync(abs, `${original}\nconst rot: number = 'not a number';\nexport { rot };\n`);
    let red = false;
    try { run('npx', ['tsc', '--noEmit'], reactApp); } catch { red = true; }
    writeFileSync(abs, original);
    plant('tsc fires on a planted type error in the written tree', red);
  }

  // 3. The byte match must be able to fail: a file moved out of its target is
  //    the whole class this gate exists for.
  {
    const block = BLOCKS[0];
    const vueForm = results.find((r) => r.leg === 'vue').form;
    const target = generatedForms(block).find((f) => f.form === vueForm).files.at(-1).target;
    const abs = path.join(vueDir, target);
    const original = readFileSync(abs, 'utf8');
    writeFileSync(abs, `${original}\n<!-- drift -->\n`);
    let red = false;
    try { matchForm(vueDir, block); } catch { red = true; }
    writeFileSync(abs, original);
    plant('the byte match fires when a written file drifts from the artifact', red);
  }

  // 4. Rule 1 must be discriminating: a package.json in the same directory has
  //    to take the no-project leg off the paste form.
  {
    const block = BLOCKS[0];
    const dir = project('none-planted', { name: 'planted', private: true, dependencies: { vue: '^3.0.0' } });
    const out = add(dir, block);
    plant('a package.json takes the no-project leg off rule 1', !out.includes('No project here'), out.split('\n')[0]);
  }

  if (plants.length) fail(`${plants.length} plant(s) were not caught:\n  ${plants.join('\n  ')}`);
  log('\n  OK        every plant caught');
}
```

`noUnusedLocals` does not apply to `.mjs`, so a stray unused local in this file would not be caught for you - `reactLeg` above has none; keep it that way when implementing.

- [ ] **Step 2: Add the script**

In `packages/create-kai/package.json`, beside `verify:pack`:

```json
    "verify:add": "node scripts/verify-add.mjs --self-test",
```

`--self-test` is always on (ruling R9): the cost of this gate is its one `npm install`, and a second invocation would double the only expensive thing it does.

- [ ] **Step 3: Run it and read what it printed**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run verify:add
```

Expected: the three legs green, `react -> react, vue -> html, none -> cdn`, then four `SELF-TEST OK` lines. Read the printed leg lines rather than trusting the exit code: they are the only statement of which detection rows were actually covered. **Record the wall time it printed** (`time` it) for Step 5 and the PR body; do not write a number into any file.

**This is the first time all three shipped blocks' react trees have ever been installed into ONE host and compiled together** - `verify-blocks-react.mjs` compiles one block at a time, clearing every other block's root between runs. Nothing on the tree today proves three trees coexist under the fixture's strict `tsc`; a `grep -l` over `dist/blocks/f/*.react.json` for `declare global`/`declare module` finds none, so a name collision is the only failure shape expected, and none of the three blocks share a component name. If `tsc --noEmit` reds here for the first time, read the error before assuming the fixture is broken - it may be a real defect this task's own leg is the first thing to exercise.

- [ ] **Step 4: Watch each leg fail before trusting it**

The plants cover the checks. The LEGS still need to be watched, because a leg that silently wrote nothing would pass every assertion over an empty set:

```bash
cd "$WT" && node -e "
const fs=require('fs');const p='packages/create-kai/scripts/verify-add.mjs';const s=fs.readFileSync(p,'utf8');
fs.writeFileSync(p+'.bak',s);fs.writeFileSync(p,s.replace('const BLOCKS = ','const BLOCKS = [].concat('). replace(\".map((d) => d.name);\", \".map((d) => d.name)).slice(0, 0);\"));"
cd "$WT" && pnpm --filter create-kai run verify:add
```

Expected: FAIL immediately with `the bundled registry has no blocks, so every leg below would assert nothing`.

```bash
cd "$WT" && mv packages/create-kai/scripts/verify-add.mjs.bak packages/create-kai/scripts/verify-add.mjs
```

And the assertion that the vue leg's OWN row is still exercised, not just agreed with the other two legs:

```bash
cd "$WT" && node -e "
const fs=require('fs');const p='packages/create-kai/scripts/verify-add.mjs';const s=fs.readFileSync(p,'utf8');
fs.writeFileSync(p+'.bak',s);
fs.writeFileSync(p,s.replace(\"dependencies: { vue: '^3.0.0' } });\", \"dependencies: {} });\"));"
cd "$WT" && pnpm --filter create-kai run verify:add
```

Expected: FAIL immediately with `landed on the html form without saying why. A quiet fallback is the decision this gate exists to catch.` - `otherFrameworkLeg` already asserts (as drafted above) that when `expected === 'html'` the CLI's own output contains `generates no vue tree yet`; strip the vue dependency and the leg still lands on `html` (no framework signal at all also lands there), but the CLI now has nothing to be loud ABOUT, so it never prints that sentence and the assertion fires. This is the check that distinguishes "correctly quiet because there was nothing to decide" from "correctly landed on html because a real vue dependency has no tree yet, and said so" - the anti-vacuity floor (three legs landing on three different forms) would stay green through this plant on its own, because none of the three forms actually changed; this assertion is what catches the row silently stopping being exercised.

```bash
cd "$WT" && mv packages/create-kai/scripts/verify-add.mjs.bak packages/create-kai/scripts/verify-add.mjs
cd "$WT" && pnpm --filter create-kai run verify:add
```

Expected: green again.

- [ ] **Step 5: Run the package's gates**

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter create-kai run verify:pack
cd "$WT" && pnpm --filter create-kai run verify:add
```

- [ ] **Step 6: Commit**

```bash
cd "$WT" && git add packages/create-kai/scripts/verify-add.mjs packages/create-kai/package.json
cd "$WT" && git commit -m "$(cat <<'EOF'
test(create-kai): verify:add drives the PACKED CLI into one project per detected form

Packs create-kai, installs it, and runs the binary a user runs: a react project
(which also installs the packed @kitn.ai/ui and compiles the written tree with
tsc --noEmit), a vue project, and a directory with no package.json at all. Every
written file is compared byte for byte against dist/blocks/f/<id>.<form>.json
and r/<id>.cdn.html -- the same artifacts the /blocks page serves.

Nothing predicts which form a leg gets: each leg MATCHES what landed against
the generated artifacts, so PR B2 moves its verdicts without moving a line of
it. The floor is that the three legs land on three different forms.

Four plants, watched: the collision refusal, a type error tsc must catch, a
drifted byte the match must catch, and a package.json taking the no-project leg
off rule 1.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 8: the gate joins the required graph, and the coupling rows move

**Files:**
- Modify: `.github/workflows/test.yml`
- Modify: `docs/coupling-map.md`

**Interfaces:**
- Consumes: `verify:add` from Task 7.
- Produces: a `test`-graph step the parity guard recognises.

- [ ] **Step 1: Add the step**

In `.github/workflows/test.yml`, in the `unit` job, immediately after the `create-kai packed-tarball shape` step:

```yaml
      # Cache the npm side of the react-host leg. verify:add's own react
      # install is the one expensive thing in this leg (network + a cold
      # install of react, react-dom, vite, the react plugin and typescript).
      # Same shape as the `construct` job's `~/.npm` cache; the `browser`
      # job's verify:blocks:react step does the same kind of install today
      # with no cache ahead of it.
      # Keyed on the fixture's own package.json plus create-kai's, so a pin
      # bump on either side busts it.
      - name: Cache npm (create-kai add smoke, react leg)
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: verify-add-npm-${{ hashFiles('packages/ui/scripts/block-driver/react-host/package.json', 'packages/create-kai/package.json') }}
          restore-keys: verify-add-npm-

      # The published `add`, which nothing above can see. The suite drives the
      # planner in-process and verify:pack reads the tarball's LISTING; neither
      # runs the binary. This packs the CLI, installs it, and runs `add` into one
      # throwaway project per detection row -- react (which also installs the
      # packed kit and compiles the written tree), another framework, and a
      # directory with no package.json -- comparing every written byte against
      # the dist/blocks artifacts the /blocks page serves. It is the guard on the
      # section 3.4 ruling from the CLI's side: the path the page displays is the
      # path add writes.
      #
      # It runs its own plants in the same process (`--self-test` is in the npm
      # script): the cost here is the one npm install, and a second invocation
      # would double the only expensive thing it does.
      #
      # NETWORK-DEPENDENT: the react leg's `npm install` reaches the registry
      # for react, react-dom, vite, the react plugin and typescript, the same
      # packages the `browser` job's verify:blocks:react step installs.
      #
      # Needs the `build` leg's artifact for dist/blocks and for packing the kit.
      - name: create-kai add smoke (packed tarball, one project per detected form)
        run: pnpm --filter create-kai run verify:add
```

- [ ] **Step 2: Confirm the parity guard sees it**

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs --list | grep -A1 'create-kai run verify:add'
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:gate-parity
```

Expected: the listing names `create-kai run verify:add` with the step's description, and the gate is green. If the guard reports an unknown `run:` shape, the step's command is wrong, not the guard.

- [ ] **Step 3: Check the leg's timeout against the measurement**

```bash
cd "$WT" && grep -n -A3 '^  unit:' .github/workflows/test.yml
```

The `unit` job carries a `timeout-minutes`. Compare it against the wall time recorded in Task 7 Step 3 plus what the leg already runs. Raise it only if the measurement demands it, and if you raise it say so in the PR body with the measured figure. Do not adjust it speculatively.

- [ ] **Step 4: Move the two coupling rows**

In `docs/coupling-map.md`, the `INSTALL_ROOTS` row (section 4) currently ends its enforcement column with `packages/create-kai/test/pr-d-target-mismatch.test.ts` pins the ONE place that has not moved yet ... - that file is gone. Replace that clause with:

```
`packages/create-kai/test/add-targets.test.ts` closes the WRITE side, asserting for every block and every framework form that `planAdd`'s paths AND bytes equal the `target`/`content` in `dist/blocks/f/<id>.<form>.json`, which is the artifact the page displays; `pnpm --filter create-kai run verify:add` re-asks it of the PACKED CLI on a real filesystem
```

and change `and `planAdd` (PR D)` in the same row's "what else moves" column to `and `planAdd`, which writes each rendered file's own `target``.

In the forms-list row (`FRAMEWORK_BLOCK_FORMS`), the enforcement column names only the site test. Append:

```
; `packages/create-kai/test/add.test.ts` drives every `--form` value the flag accepts through a real `add`, and derives each detection row's expected landing form from the same list, so a renderer added or withheld moves the CLI's menu and its detection together
```

- [ ] **Step 5: Verify the docs guards**

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:thresholds
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:gate-parity
cd "$WT" && grep -rn "pr-d-target-mismatch" --include='*.md' --include='*.ts' --include='*.mjs' --include='*.yml' . | grep -v '^./docs/superpowers/' | grep -v node_modules
```

Expected: both guards green, and the grep returns nothing outside `docs/superpowers/` (the plans and handoffs under it are a historical record and keep naming the file they scheduled for deletion; excluding the whole directory rather than only `docs/superpowers/plans/` is what the "returns nothing" expectation actually requires, since the HANDOFF files and the PR C plan live in `docs/superpowers/` too, not under `plans/`).

- [ ] **Step 6: Commit**

```bash
cd "$WT" && git add .github/workflows/test.yml docs/coupling-map.md
cd "$WT" && git commit -m "$(cat <<'EOF'
ci: verify:add joins the required graph, and the targets couplings move

The add smoke runs in the `unit` leg beside the create-kai steps that already
hang off its build, where the kit artifact it packs is already downloaded, with
an `~/.npm` cache ahead of it keyed on the react-host fixture and create-kai's
package.json (the same shape the `browser` job already runs ahead of
verify:blocks:react).

coupling-map: the INSTALL_ROOTS row drops the deleted mismatch test and names
the two guards that replaced it; the forms-list row gains the create-kai side,
which now derives both its --form menu and its detection rows from
FRAMEWORK_BLOCK_FORMS.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 9: branch close - the full gate run and the PR

**Files:** none changed unless a gate reds.

- [ ] **Step 1: Read the required gate set, do not copy one**

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs --list
```

Run every gate the listing names that this branch can touch. At minimum, and in this order:

<!-- gate-list: partial -- the subset this branch can move; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints the merge gate -->

```bash
cd "$WT/packages/ui" && npm run build
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter create-kai run verify:pack
cd "$WT" && pnpm --filter create-kai run verify:add
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks
cd "$WT" && pnpm --filter @kitn.ai/ui run verify:blocks:react
cd "$WT" && pnpm --filter @kitn.ai/docs run test
cd "$WT" && pnpm --filter @kitn.ai/docs run build
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:gate-parity
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:thresholds
cd "$WT" && pnpm --filter @kitn.ai/ui run lint:cdn-pins
```

The docs pair is here because Task 3 changed what the html form contains, and the site's file tree and code view read those artifacts: a stale `apps/docs/public/blocks` copy would show a tree with no README while `add` writes one, which is precisely the lie this PR exists to remove.

- [ ] **Step 2: Hygiene**

```bash
cd "$WT" && git log origin/main..HEAD --format='%H %s%n%b' | grep -n "claude-501\|/private/tmp\|scratchpad" || echo "no scratchpad path in a commit message"
cd "$WT" && git diff origin/main..HEAD | grep -n "claude-501\|/private/tmp/\|scratchpad" || echo "no scratchpad path in the diff"
cd "$WT" && git diff origin/main..HEAD | grep -nP "\x{2014}|\x{1F300}-\x{1FAFF}" || echo "no em dash, no emoji"
cd "$WT" && git log origin/main..HEAD --format='%b' | grep -c "Claude-Session:"
```

Expected: the three greps print their "no ..." fallback, and the trailer count equals the commit count.

- [ ] **Step 3: Push and open the PR**

```bash
cd "$WT" && git push -u origin feat/create-kai-add-targets
cd "$WT" && gh pr create --title "feat(create-kai)!: add writes at the blocks targets table, and detects the host framework" --body "$(cat <<'EOF'
`create-kai add` moves onto `@kitn.ai/blocks`'s install-root table, so the path
the /blocks page displays is byte for byte the path the CLI writes.

- `planAdd` writes each rendered file's own `target`. `blockDir()` is deleted:
  it was a second derivation of a path, and it disagreed with the first about
  react for a whole release cycle. **Breaking:** the react form lands in
  `src/components/<id>/`, not `src/blocks/<id>/`.
- `packages/create-kai/test/pr-d-target-mismatch.test.ts` is deleted in the
  commit that closed the mismatch it pinned, after being watched going red on
  the change.
- Detection rows name a FRAMEWORK; where it lands comes from
  `FRAMEWORK_BLOCK_FORMS`. A framework with no generated tree lands on the
  html form and is told so in one sentence. Ambiguity is narrowed from "two
  signals present" (the 08-31 spec's literal wording) to "two signals that
  decide DIFFERENT forms" - count-based would ask vue-vs-svelte a question
  with two identical answers today, which `add.test.ts` already pins as NOT
  a question; answer-based converges on the spec's wording the day PR B2
  gives vue and svelte different trees, with nothing edited here.
- `FRAMEWORK_SIGNALS` keeps a row for every framework this release can
  detect, even the ones with no tree of their own yet (vue, svelte, angular,
  solid) - a stricter reading of spec section 7 ("detecting Vue and having no
  Vue tree is the menu-honesty failure") would drop those rows until PR B2.
  Rows are kept because dropping them removes the one thing that makes the
  loud fallback sayable: a vue project would go undetected instead of landing
  on html with a sentence explaining why. Decided loudly beats not detected.
- The html form ships the README the react form already had, through one
  shared `renderReadme`, plus a derived "what the block needs" line
  (envVars, then a route dependency, then nothing) for a future block with no
  `docs` sentence of its own. `add` prints the README after the writes.
- New gate `pnpm --filter create-kai run verify:add`: the PACKED CLI into one
  throwaway project per detection row, every byte matched against the
  generated artifacts, the react tree compiled against an installed packed
  kit. It deliberately overlaps `verify:blocks:react`, which proves the
  RENDERER's tree compiles; this proves the packed CLI puts those bytes where
  a project can compile them. First time three blocks' react trees have
  compiled together in one host - measured wall time and any surprise there
  is recorded above.

Out of scope and untouched: PR B2's four renderers (everything here grows when
they land, and a planted `vue` row was used to watch that happen), the site,
new blocks, an MCP `add` tool.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
cd "$WT" && gh pr checks --watch
```

- [ ] **Step 4: Squash-merge, then delete the remote branch explicitly**

```bash
cd "$WT" && gh pr merge --squash
cd "$WT" && git push origin --delete feat/create-kai-add-targets
```

`--delete-branch` fails from a worktree: it tries to check out main locally and has nowhere to go.

---

## Self-review

**1. Spec coverage.** Every night-run 3.3 bullet and every numbered requirement, against a task:

| Requirement | Task |
|---|---|
| S9/H4 "blocks, not gallery, everywhere": the five remaining `gallery` comments under `packages/create-kai` | 0 |
| `blockDir()` moves onto the targets table; every file at `fileTarget(...)`; react `src/components/<id>/`, html `blocks/<id>/`, cdn one file in the cwd | 1 |
| Displayed path equals written path, tested against `f/<id>.<form>.json` for every block and form, with an anti-vacuity floor | 2 |
| `pr-d-target-mismatch.test.ts` red for the right reason, deleted in the same commit, said in the commit body | 1 (Steps 5, 9) |
| Detection: react to the typed wrappers; other frameworks to html for now, with the row stating the trees arrive later; no project to cdn; ambiguous asks loudly; `--form` obeyed | 5 |
| `FRAMEWORK_SIGNALS` derives what it can from `FRAMEWORK_BLOCK_FORMS`; a framework with no tree lands on html with a printed sentence | 5 |
| Menu honesty: every offered `--form` value is one the generator emits, derived | 6 (and the derivation itself in `add.ts`, unchanged and now asserted) |
| READMEs: what the renderers emit today checked, the html gap closed, `add` prints them | 3, 4 |
| `add` keeps announcing its target and refusing to overwrite; the whole-plan refusal unchanged and tested | 1 (Step 7, react root), 7 (plant 1, packed CLI) |
| Eval gate: create-kai vitest incl. menu-honesty, `verify:pack`, the build guards, a real `add` per form from the packed tarball, react tree typechecks against the installed kit | 7, 9 |
| Out of scope named | Scope section |
| Every new test watched failing, expected red stated | every task's Step 2 (and Tasks 5, 6, 7 plant defects to watch the derivations fire) |
| No hand-typed counts, gate-list directives, trailers, branch and worktree, three-step prep, build-before-vitest, typecheck in every gate list | Global Constraints, and the per-task gate table below |

Spec 5.5 ("create-kai smoke extends to one non-react framework fixture") is Task 7's leg 2, which is stronger than asked: it drives every block, not one fixture.

**2. Placeholder scan.** No TBD, no "similar to Task N", no "add error handling". One deliberate call-out rather than a placeholder: Task 3's Step 8 says that if an existing file-list assertion in `html-form.test.ts` enumerates the form's files, updating it is part of the step - the exact list is not restated here because the test's current text is the authority.

**3. Type consistency.** `planFiles(files: readonly FormFile[], plan: AddPlan)`, `planFormBlock(block: Block, opts: PlanOptions, plan: AddPlan): void` (routes through `renderBlockForm`, ruling R13), `landingForm(framework: TargetFramework | null): ProjectForm`, `emitsOwnTree(framework): framework is TargetFramework & ProjectForm`, `blockFormAxis(found: readonly string[], forms: readonly ProjectForm[]): Axis`, `decideForm(...): Promise<{ form?: BlockForm; error?: string; note?: string }>`, `renderReadme(block: Block, lines: readonly string[]): string`, `needsLine(block: Block): string | null` (private to `readme.ts`), `README_FILE: 'README.md'`. `ProjectForm` is introduced in Task 5 and used only there and after; Tasks 1 through 4 use `BlockForm`/`BlockFormId` as the file does today. `Detection` gains `fallback` in Task 5, and Task 5's tests are the only ones that read it. One risk flagged in place: `INSTALL_ROOTS[id]` inside `blockFormAxis` needs `id` to be provably a `TargetFramework`, which is why the parameter is `ProjectForm` and Step 5 says to fix a red there at the parameter type rather than with a cast.

### Per-task closing gates

<!-- gate-list: partial -- per-task closing gates, not the merge gate; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints that -->

| Task | Closing gates (all must be green before the commit) |
|---|---|
| 0 | `git apply --check` clean before applying · `pnpm --filter create-kai run build` · `run typecheck` · `exec vitest run` · the `gallery` grep under `packages/create-kai` empty |
| 1 | `pnpm --filter create-kai run build` · `pnpm --filter create-kai run typecheck` · `pnpm --filter create-kai exec vitest run` |
| 2 | the three above, plus the doctored-artifact and missing-directory reds watched, plus `pnpm --filter @kitn.ai/ui run build:blocks` to restore |
| 3 | `pnpm --filter @kitn.ai/blocks run typecheck` · `pnpm --filter @kitn.ai/blocks exec vitest run` · `pnpm --filter @kitn.ai/ui run build:blocks` · `pnpm --filter @kitn.ai/ui run verify:blocks` · `pnpm --filter create-kai run build` · `pnpm --filter create-kai exec vitest run` |
| 4 | `pnpm --filter create-kai run build` · `run typecheck` · `exec vitest run` |
| 5 | `pnpm --filter create-kai run build` · `run typecheck` · `exec vitest run` · the planted-`vue`-row red watched and reverted (`git diff --stat packages/blocks` empty) |
| 6 | `pnpm --filter create-kai run build` · `run typecheck` · `exec vitest run` · the planted-`angular`-row red watched and reverted |
| 7 | `pnpm --filter create-kai run build` · `run typecheck` · `exec vitest run` · `run verify:pack` · `run verify:add` (its own four plants inside) |
| 8 | `pnpm --filter @kitn.ai/ui run lint:gate-parity` · `run lint:thresholds` · the `pr-d-target-mismatch` grep clean outside `docs/superpowers/` |
| 9 | the full list in Task 9 Step 1, read from `lint-gate-parity.mjs --list`, plus the hygiene greps |

---

## Facts verified on the tree

Every fact this plan argues from, with the command that produced it. Most rows were run at `/Users/home/Projects/kitn-ai/kitn-chat/.claude/worktrees/blocks-c` (PR C's worktree, branch `feat/blocks-site-section`, HEAD `26bb65af` - the draft's table named `851f102d`, one docs commit stale; nothing either version reads had changed). The adversarial-review corrections and everything below the `---` inside this section were re-verified against `main` at `aa973c14` (the tree this plan's own worktree, `.claude/worktrees/blocks-d`, is cut from), read-only, after PR C merged.

| Fact | Command |
|---|---|
| `blockDir()` writes react to `src/blocks/<name>` and everything else to `blocks/<name>`, and is the only place `planAdd` joins a directory | `cat packages/create-kai/src/blocks.ts` |
| `INSTALL_ROOTS` maps react/vue/solid to `src/components`, svelte to `src/lib/components`, angular to `src/app/components`, html to `blocks`; `fileTarget` and `isTargetFramework` are exported | `cat packages/blocks/src/targets.ts` |
| Every renderer already stamps `target` from `fileTarget()`; `cdn.ts` uses `${block.name}.html` | `cat packages/blocks/src/forms/{html,react,cdn}.ts` |
| `FRAMEWORK_BLOCK_FORMS` is `BLOCK_FORMS` minus `cdn`, and `renderBlockForm` is `gen-blocks.mjs`'s ONE dispatch, with an exhaustive `switch` and no `default` - BEFORE this plan the CLI did NOT call it: `planAdd` branched `cdn` / `react` / else-html by hand and the `else` branch silently treated ANY other form id as html (ruling R13, adversarial-review finding, HIGH) | `cat packages/blocks/src/forms/index.ts` and `sed -n '290,330p' packages/create-kai/src/blocks.ts` |
| The react renderer emits `README.md`; the html renderer emits none | `grep -rn "README" packages/blocks/src/` (one hit, `src/forms/react.ts:296`) |
| `registry.ts` imports nothing from `src/forms/`, so a new `src/forms/readme.ts` importing `../registry` is not a cycle | `grep -n "^import" packages/blocks/src/registry.ts` |
| `verify:blocks [html-binder]` scans EVERY file of the html form for `EventSource` / `text/event-stream` / `.getReader(` | `sed -n '/function htmlBinderErrors/,/^}/p' packages/ui/scripts/verify-blocks.mjs` |
| `verify:blocks [react-tree]` re-derives `fileTarget('react', ...)` per file and self-test class 9 plants a disagreeing target | same file, `/^\/\/ \[react-tree\]/` |
| `dist/blocks/f/<id>.<form>.json` exists per block per framework form and carries `path`, `content` and `target`; react targets are `src/components/<id>/...` and html targets `blocks/<id>/...` | `ls packages/ui/dist/blocks/f` and `node -e "const j=require('./packages/ui/dist/blocks/f/support-widget.react.json'); ..."` |
| `dist/blocks/r/<id>.cdn.html` is the generated paste form | `sed -n '150,170p' packages/ui/scripts/gen-blocks.mjs` |
| `gen-blocks.mjs` runs standalone: it reads the block sources, `mcp/registry.ts`, `src/elements/element-nonscalar.json` and `package.json`, and writes into `dist/blocks/` | `sed -n '80,130p' packages/ui/scripts/gen-blocks.mjs` |
| `build:blocks` is `node scripts/gen-blocks.mjs`, run from `postbuild` | `node -e "const p=require('./packages/ui/package.json'); ..."` |
| `@kitn.ai/ui` exports `./package.json`, so `require.resolve('@kitn.ai/ui/package.json')` works | `node -e "console.log(require('./packages/ui/package.json').exports['./package.json'])"` |
| `packages/create-kai/scripts/build.mjs` already resolves a workspace package through `createRequire(...).resolve('@kitn.ai/blocks/package.json')` | `cat packages/create-kai/scripts/build.mjs` |
| `test/helpers.ts` reads `packages/create-kai/dist/blocks` and throws naming `pnpm --filter create-kai run build` | `cat packages/create-kai/test/helpers.ts` |
| create-kai's vitest is node-environment over `test/**/*.test.ts`; its tsconfig has `lib: ["ES2023"]`, `types: ["node"]`, no DOM, and includes `src`, `test` and `types` | `cat packages/create-kai/{vitest.config.ts,tsconfig.json}` |
| `add.test.ts` hard-codes `src/blocks` in three places and `blocks/<name>` in the collision case | `cat packages/create-kai/test/add.test.ts` |
| `pr-d-target-mismatch.test.ts` asserts the mismatch EXISTS and names PR D as the deleter | `cat packages/create-kai/test/pr-d-target-mismatch.test.ts` |
| PR B's ruling R4 is the reason `FormFile.path` and `target` differ and the mismatch was left deliberately | `sed -n '85,130p' docs/superpowers/plans/2026-09-02-blocks-pr-b-authored-contract.md` |
| The `--form` accepted set is already derived (`FORM_IDS = BLOCK_FORMS.map(...)`) and the refusal prose derives from it | `cat packages/create-kai/src/add.ts` |
| `Axis` requires a non-empty `because` to be STATED rather than asked, and `blockFormAxis` currently ships `because: ''` | `sed -n '1,60p' packages/create-kai/src/axes.ts` and `cat packages/create-kai/src/blocks.ts` |
| The `unit` CI job downloads the `kit-dist` artifact into `packages/ui` before the create-kai steps, so `dist/blocks` and a packable kit are both present there | `sed -n '515,600p' .github/workflows/test.yml` |
| The create-kai steps in CI are build, typecheck, `vitest run`, `verify:pack`, and `verify:pack` again under the release job's pinned npm | `grep -n "create-kai" .github/workflows/test.yml` |
| The required graph currently names four create-kai gates and two blocks gates; the listing is the authority | `node packages/ui/scripts/lint-gate-parity.mjs --list` |
| `verify-blocks-react.mjs` packs the kit, installs it into a copy of `scripts/block-driver/react-host`, writes each tree at `installRoot('react', ...)`, writes `src/block.ts` with a specifier derived from the emitted target, and runs `npx tsc --noEmit` | `sed -n '150,240p' packages/ui/scripts/verify-blocks-react.mjs` |
| The react host fixture is a stock create-vite react-ts app with pinned ranges, `tsconfig.json` including only `src`, and a `src/main.tsx` that imports `./block` | `cat packages/ui/scripts/block-driver/react-host/{package.json,tsconfig.json,src/main.tsx}` |
| `createConsumerTsc` resolves `@kitn.ai/ui` out of the BUILT WORKSPACE TREE (`PACKAGE_ROOT`), not an install, which is why it is not the harness for "typechecks against the installed kit" | `sed -n '30,130p' packages/ui/scripts/lib/consumer-tsc-projects.mjs` and `sed -n '270,290p'` of the same file |
| `readPackedFilename(raw, { npmVersion })` returns `{ filename, shape }` - NOT `readPackedFilename(json, label)` returning a bare filename, which is what Task 7's script drafted before this revision (adversarial-review finding, HIGH: it would throw destructuring `npmVersion` off a string). `verify-blocks-react.mjs:143-146` is the correct call: read `npm --version` first, then pass `{ npmVersion }` | `sed -n '190,236p' scripts/pack-listing.mjs` and `sed -n '140,146p' packages/ui/scripts/verify-blocks-react.mjs` |
| The gallery-word sweep patch (`docs/superpowers/research/2026-09-03-create-kai-gallery-sweep.patch`) applies clean to `main` at `aa973c14`, and five `gallery` hits remain under `packages/create-kai` before it applies (the patch's own four files plus `src/blocks.ts` twice) - the draft plan named neither the patch nor the remaining hits (adversarial-review finding, HIGH) | `git apply --check docs/superpowers/research/2026-09-03-create-kai-gallery-sweep.patch` and `grep -rn gallery packages/create-kai --include='*.ts' --include='*.mjs' --include='*.json'` |
| `decideForm` calls `io.ask(blockFormAxis(...), 'react')` directly; it is never routed through `decideAxis`/`answerAxis`, so `blockFormAxis`'s `because` field is asserted non-empty by the new test but never actually rendered as a stated line the way `layoutAxis`/`gatewayAxis` are (kept as-is; noted in ruling R6's text, not changed - `decideForm` must be able to REFUSE under `--yes` on an ambiguous axis, which `answerAxis` does not do) | `grep -n "decideForm\|io.ask\|answerAxis\|blockFormAxis" packages/create-kai/src/add.ts` and `sed -n '1,90p' packages/create-kai/src/axes.ts` |
| `unit` job: `timeout-minutes: 20`, no `~/.npm` cache step anywhere in it (the `construct` and `browser` jobs each have one; `unit` has none before this plan adds one in Task 8) | `sed -n '495,560p' .github/workflows/test.yml` |
| `packages/create-kai/src/blocks.ts`'s `planAdd` branches `if (opts.form === 'cdn') ... else if (opts.form === 'react') ... else { planHtmlBlock(block, plan) }` - the `else` is reached by ANY form id that is neither `cdn` nor `react`, confirming the silent-fallback defect ruling R13 fixes | `sed -n '293,320p' packages/create-kai/src/blocks.ts` |
| The react form's current README literal is `['# ${title}', '', description, '', "Render it: \`import { X } from './X';\`", ...(docs ? ['', docs] : []), ''].join('\n')`, and the shared fixture's `block()` has `title: 'F'`, `description: 'f'`, name `Fixture`, no `docs` - so the byte-equality control in Task 3 is `['# F', '', 'f', '', "Render it: \`import { Fixture } from './Fixture';\`", ''].join('\n')` | `sed -n '270,296p' packages/blocks/src/forms/react.ts` and `sed -n '20,36p' packages/blocks/tests/react-form.test.ts` |
| `html-form.test.ts` declares its own `stripped()` helper (not `withStrippedTwins(block(), (s) => s)`, which the draft's new cases used) | `grep -n "const stripped" packages/blocks/tests/html-form.test.ts` |
| The three shipped blocks' `registry-item.json` all carry `registryDependencies: []` and `envVars: {}` today, so the new derived "what the block needs" line in `renderReadme` is currently invisible in every generated README (`docs` covers the same ground for all three) | `node -e` reading each `registry-item.json`'s `docs`/`dependencies`/`registryDependencies`/`envVars` |
| `docs/coupling-map.md`'s `INSTALL_ROOTS` row (its enforcement column) and its forms-list row (line ~336, enforcement column) carry the exact quoted clauses Task 8 replaces/appends, verbatim on `main` at `aa973c14` | `sed -n '148p;336p' docs/coupling-map.md` |
| `readPackedFilename` is the shared `npm pack --json` parser at the repo root, already used by create-kai's `verify-pack.mjs` | `grep -n "pack-listing" packages/create-kai/scripts/verify-pack.mjs` |
| The three shipped blocks all carry a `docs` sentence, `dependencies: ["@kitn.ai/ui"]`, no env vars and no registry dependencies | `node -e "for(const n of ['support-widget','assistant','in-app-assistant']){...}"` |
| `index.ts` wires `add` with `cwd: process.cwd()`, `blocksRoot: <dist>/blocks` and `interactive: Boolean(process.stdout.isTTY)`, and calls `main()` at module scope (so it is unimportable by tests) | `sed -n '95,135p' packages/create-kai/src/index.ts` |
| `docs/coupling-map.md` already carries an `INSTALL_ROOTS` row naming `pr-d-target-mismatch.test.ts` and a forms-list row whose create-kai side has no guard named | `grep -n "targets.ts\|FRAMEWORK_SIGNALS" docs/coupling-map.md` |
