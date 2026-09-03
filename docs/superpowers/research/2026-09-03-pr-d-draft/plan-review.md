# Review: PR D plan (`2026-09-03-create-kai-add-targets.md`) against `blocks-c` at 26bb65af

Read-only. Every "verified how" below was run at `/Users/home/Projects/kitn-ai/kitn-chat/.claude/worktrees/blocks-c`.

## A. Plan vs tree

| Claim (plan) | Verified how | Result |
|---|---|---|
| `blockDir()` is the only directory join in `planAdd`; react to `src/blocks/<name>`, else `blocks/<name>` | `cat packages/create-kai/src/blocks.ts` | OK |
| `planAdd` branches `cdn` / `react` / else-html itself, never via `renderBlockForm` | same file, `planAdd` body | OK, and it matters: an unknown form id falls into the html branch SILENTLY (see B Task 6, E-2) |
| `FRAMEWORK_SIGNALS` rows are `{ dep, lands: 'react' \| 'html' }`, six rows incl. preact | same file | OK |
| `detectForm` returns `{kind:'none'}` / `{kind:'detected', form, found}` / `{kind:'ambiguous', found}` | same file | OK |
| `blockFormAxis(found)` hard-codes `[react, html]` with hand hints and `because: ''` | same file | OK |
| `Axis.because` is required and an empty one cannot be stated | `packages/create-kai/src/axes.ts` `decideAxis` | OK (but `blockFormAxis` is never routed through `decideAxis`/`answerAxis`; `decideForm` calls `io.ask` directly, so `because` is decorative, see D-R6) |
| `answerAxis`/`AxisIo` injected seam; `index.ts` calls `main()` at module scope | `axes.ts`; `sed -n '95,135p' src/index.ts` | OK |
| `parseAddArgs` derives `FORM_IDS` from `BLOCK_FORMS`; `--form` refusal prose derived | `src/add.ts` | OK |
| `nearestPackageJson` walks up to the filesystem root | `src/add.ts` | OK |
| Collision refusal is whole-plan, lists all, writes nothing; the `-y` flag exists | `src/add.ts` `collisions` + `runAdd`; `parseAddArgs` | OK |
| `runAdd` prints `No project here` only when `form === 'cdn' && !near`; ends with `notes` then `docs` loops | `src/add.ts` | OK |
| `plan.docs` lines are `${block.name}: ${docs}` | `src/blocks.ts` | OK (Task 4's docs-count test counts the raw `manifest.docs` substring, which is inside both the README and that line; suppressing the line makes the count 1) |
| `loadBlocks` reads the manifest from `registry-item.json` verbatim (no `.js` twin entries) while `gen-blocks` renders the `withStrippedTwins` block | `src/blocks.ts`; `sed -n '80,175p' packages/ui/scripts/gen-blocks.mjs`; manifest of support-widget | OK, and harmless: both renderers skip `.js` manifest entries and emit twins beside `.ts` (`html.ts:305-318`, `react.ts:297-301`), so file lists AND order match. Confirmed by listing `dist/blocks/f/*.json` |
| `test/helpers.ts` exports `BLOCKS_ROOT`, `KIT_RANGE='^9.9.9'`, `KIT_VERSION='9.9.9'`, `loadBundledBlocks` (throws naming `pnpm --filter create-kai run build`), `authoredBlock` | `cat test/helpers.ts` | OK |
| `pr-d-target-mismatch.test.ts` asserts `src/blocks/` and names PR D as the deleter | `cat` | OK. Expected red in Task 1 Step 5 (`.every(startsWith('src/blocks/'))` → false) is the first failing assertion: correct |
| `add.test.ts` names `src/blocks` in three places and `blocks/<name>` in the collision case | `cat test/add.test.ts` | OK: `reg-*` loop, `react` describe (`base`), and the `binder` case use literals; the collision case uses `'blocks'` twice. Plan lists all four |
| `add.test.ts` already pins vue+svelte as NOT ambiguous | same | OK (`two non-react frameworks agree on the answer`) |
| `test/menu-honesty.test.ts` reads `dist/templates` | `grep dist/templates` | OK |
| `block-twins.test.ts` asserts the CLI's twins equal esbuild's | `sed -n 1,30p` | OK |
| `kit-contract.test.ts` uses `KAI_KIT_ROOT` override for an extracted tarball | grep | OK |
| `verify-pack.mjs` reads `readPackListing(raw, { npmVersion })` | grep | OK |
| **`readPackedFilename(json, label)` returns a filename** (plan `pack()` does `path.join(out, readPackedFilename(json, label))`) | `sed -n 215,236p scripts/pack-listing.mjs` | **WRONG.** Signature is `readPackedFilename(raw, { npmVersion })` and it returns `{ filename, shape }`. As drafted `pack()` throws on destructuring `npmVersion` from a string; `verify-blocks-react.mjs:143-146` shows the correct call (`npm --version` first, then `.filename`) |
| `scripts/build.mjs` resolves `@kitn.ai/blocks/package.json` via `createRequire` | `cat scripts/build.mjs` | OK |
| `build-guards.ts` rules are pure; nothing in the plan needs a new rule | grep exports | OK (no `verify:add` rule needed; it is a script, not a build guard) |
| `@kitn.ai/ui` exports `./package.json` | `node -e` over ui package.json | OK |
| `build:blocks` = `node scripts/gen-blocks.mjs`, run from `postbuild`; standalone-runnable | ui package.json; gen-blocks header | OK |
| `verify:blocks` = `--self-test && gate`; `verify:blocks:react` same | ui package.json | OK. Note both need Chromium locally ([driver] stage) |
| `[html-binder]` scans EVERY file of the html form with `/new\s+EventSource\(\|text\/event-stream\|\.getReader\(/` | `sed -n 175,200p verify-blocks.mjs` | OK; plan's regex in Task 3's test matches it exactly. Neither the plan's README lines nor any shipped manifest `docs`/`description` carries a token (`grep` over `blocks/*/registry-item.json`: none) |
| `[fresh]` is a spawned `gen-blocks --check` | grep | OK |
| html renderer emits page, `<id>.js` binder, twins, other files; NO README | `sed -n 294,322p html.ts`; `grep README src/` | OK (one hit, `react.ts:296`) |
| react renderer emits `<Name>.tsx`, `use<Name>.ts`, `README.md`, then non-page non-`.js` manifest files | `react.ts:280-302` | OK. `renderReadme(block, ['Render it: ...'])` reproduces today's literal byte for byte (title, '', description, '', line, ['', docs], ''), so react artifacts do not change |
| `cdn.ts` `renderedPage` calls `renderHtmlForm(block, { registration: 'autoloader' })` and emits ONE file `${name}.html` with `target` = same | `cdn.ts` | OK |
| `html-form.test.ts` has an exact file-list assertion | line 100: `['fixture.controller.js','fixture.css','fixture.html','fixture.js']` | OK, plan Step 8 says update it; it MUST gain `README.md`. The fixture helper is `stripped()` (esbuild), not `withStrippedTwins(block(), (s) => s)` as the plan's new cases use; identity-strip works (renderer only checks presence) but the file's own helper should be used |
| `react-form.test.ts` list already contains `README.md` and line 137-141 already asserts `import { Fixture }` | grep | OK; the plan's added react case is a DUPLICATE of an existing one, not a control |
| `verify-blocks-react.mjs` packs the kit, copies `react-host`, installs the tarball with no package list, writes the tree at `installRoot('react', ...)` clearing every other block's root, writes `src/block.ts` from the emitted target, runs `npx tsc --noEmit` | `sed -n 140,260p` | OK. It installs ONE block at a time; the plan's react leg installs all three and runs tsc once over all of them, which nothing has done before (D-R10) |
| react-host: create-vite react-ts, pinned ranges, `include: ["src"]`, `types: []`, `main.tsx` imports `./block` | `cat` of the four files | OK |
| `consumer-tsc-projects.mjs` resolves `@kitn.ai/ui` from the workspace tree | not re-read; plan's citation is plausible and the argument (tree vs tarball) stands regardless | accepted |
| `unit` job: `timeout-minutes: 20`, no npm cache step, downloads `kit-dist` (`packages/ui/dist/**`, so `dist/blocks/{f,r}` are present), create-kai steps are build → typecheck → vitest → verify:pack → both-packages verify:pack under npm 12 | `sed -n 519,547p; 622,692p` test.yml | OK. The kit tarball packed by `verify:add` in that leg will include `dist/` from the artifact |
| `lint-gate-parity.mjs --list` exists and recognises `pnpm --filter <pkg> run <script>` | ran `--list` (55 gates); shapes at lines 430-443 | OK |
| `lint-threshold-derivation.mjs` scans `docs/superpowers/{plans,specs}` | line 85 | OK (the plan will be scanned once committed under plans/) |
| `docs/coupling-map.md` INSTALL_ROOTS row names `pr-d-target-mismatch.test.ts` with the quoted clause, and the forms-list row (line 336) names `FRAMEWORK_SIGNALS` with only the site test as enforcement | grep lines 148, 336 | OK; both quoted strings exist verbatim |
| `apps/docs` `prebuild`/`pretest` copy `dist/blocks`, and `blocks-targets.test.ts` reads `dist/blocks/f` through `require.resolve('@kitn.ai/ui/package.json')` | docs package.json; test lines 12-19 | OK (this is the precedent R2 copies, and it is already on the tree) |
| Three shipped blocks, each with `docs`, `dependencies: ['@kitn.ai/ui']`, no envVars, no registryDependencies | `cat registry-item.json` ×3 (support-widget shown; others same shape) | OK |
| `dist/blocks/f/<id>.<form>.json` carries `{ block, form, files:[{path,content,target}] }` | `node -e` listing | OK |
| Facts table says HEAD is `851f102d` | `git log -1` = `26bb65af` | Stale by one docs commit; nothing the plan reads changed |
| The four gallery-word comment edits are on the tree | `grep -rn gallery packages/create-kai` | **WRONG-by-omission.** Five `gallery` hits remain (`src/blocks.ts:39,323`, `src/build-guards.ts:421`, `src/react-form.ts:3`, `scripts/build.mjs:158`). The plan never mentions `create-kai-gallery-sweep.patch`. Task 1 Step 3 rewrites the `:323` comment (in different words from the patch), so the patch's second hunk will no longer apply after Task 1 |

## B. Plan vs itself

| Task | Finding |
|---|---|
| 1 | Test and code agree. Expected red is right (react cases red, html/cdn green). `planFiles` + `installRoot`/`fileTarget` imports are consistent with `@kitn.ai/blocks/targets`. `path` stays used. The mismatch test is deleted in the same commit (`git add -A packages/create-kai` after `git rm`): OK. Closing gate green at that commit: yes (nothing else reads `src/blocks`). One nit: the new react collision case imports `componentName` from `../src/react-form` (already imported in the file) and `fileTarget` (added in Step 6): consistent |
| 2 | Imports appended mid-file after `describe` blocks: legal in TS/ESM but ugly; hoist them. `formArtifact` / `FORMS_DIR` are used by both new `describe`s: fine. Doctor-and-restore steps are real reds (verified the artifact shape). `formArtifact(blocks[0].name, ...)` inside an `it`: OK. Closing gate: green |
| 3 | The html cases red for the stated reasons. The react case is not a control, it is a copy of `react-form.test.ts:137`. The exact-list at `html-form.test.ts:100` must change (plan says so). `renderReadme` byte-reproduces the react README, so `dist/blocks/f/*.react.json` are unchanged and only `*.html.json` move; `[fresh]` will be red until `build:blocks` (plan runs it). `verify:blocks` locally needs Chromium (not stated). Closing gate green: yes, provided `apps/docs` prebuild copy is re-run before Task 9's docs pair (it is: `prebuild`/`pretest` copy) |
| 4 | Expected red is real (docs count 2 or README line missing). Test names match the `-t 'README'` filter. `fileTarget('html', block.name, 'README.md')` is a literal where `README_FILE` exists: use it. Closing gate green |
| 5 | **Expected red wrong in kind.** vitest transpiles, it does not typecheck; `signal.framework` is `undefined` at runtime, so `expected` becomes `'html'` for every row and `react alone lands on html` / the `fallback` cases fail. Still red, but the plan should say the runtime red, and `typecheck` is the step that shows the TS error. **Step 6's plant is not a red.** Adding a `vue` row to `BLOCK_FORMS` makes `detectForm` return `vue` and the renamed case `vue alone lands on vue` PASSES; nothing under `-t 'detection signals'` renders. The real reds from that plant are in `add-targets.test.ts` (`renderBlockForm(block,'vue')` returns `undefined`, `.length` throws; and `formArtifact` throws naming `build:blocks`). Run the whole file set for the plant and state those reds |
| 6 | **Expected red wrong, and it exposes a defect.** With a planted `angular` row, `--form angular` is accepted (derived), and `planAdd` falls into the `else planHtmlBlock` branch: the run exits 0, the html files exist, and `--form angular writes every file the form renders` PASSES. Only the first `it` (set equality) reds. The menu-honesty loop as written cannot catch "a flag value nothing can emit" because `planAdd` quietly maps unknowns to html. Fix in code (E-2) or the test proves less than it claims |
| 7 | `pack()` is broken (A). The `readme` leftover line is flagged, fine. Step 4's second plant prose contradicts itself ("Expected: FAIL ... which means it does NOT fire ... the drafted script already does" ): the drafted `otherFrameworkLeg` already asserts the fallback sentence, so the plant DOES fire with `landed on the html form without saying why`. Rewrite the step to state that red. Plant 1 hard-codes `form === 'html'` for the vue leg, contradicting R11 (use `results` / the leg's matched form). R10 says install both tarballs into the app but the leg calls the tools-dir `CLI`; the app-local `create-kai` install is dead weight. `npm install` of react-host needs network in CI (same as `verify:blocks:react`). tsc over three blocks at once is untested anywhere today |
| 8 | Step shape recognised. Step 5's grep excludes only `docs/superpowers/plans/`; the HANDOFF files and the PR C plan also name the file, so the command prints hits while the prose says "returns nothing": exclude `docs/superpowers/` wholesale. Coupling rows: quoted anchors exist. Timeout: see D |
| 9 | Gate list is a labelled partial: OK. Hygiene greps fine. The docs pair rationale is right |

Ordering: Task 3 (blocks) precedes Task 4 (needs `README_FILE`); Task 5 precedes Task 6 (needs `FRAMEWORK_BLOCK_FORMS` import); Task 7 needs Task 5's sentence. Consistent. The gallery sweep has no slot (E-1).

## C. Plan vs spec/handoff

| Requirement | Task | Finding |
|---|---|---|
| H3.3 `blockDir()` onto the targets table; mismatch test red for the right reason, deleted same PR, said in the commit body | 1 | Met; commit body says it |
| H3.3 detection: react → wrappers; other → web components; no project → cdn; ambiguous asks loudly | 5 | Met. "Ambiguous" narrowed to answer-based (D-R5) |
| H3.3 README printing per emitted tree, 2-3 lines, what the block needs + framework-config line | 3, 4 | Partly. html gets a bundler line (good). Neither README says "what the block needs (an endpoint at /api/chat, or the mock)" unless `manifest.docs` happens to; a block with no `docs` gets a README that says nothing about needs. Derive a needs line from `registryDependencies` (`route:*`) / `envVars` / their absence ("runs on the bundled mock") |
| H3.3 `add` keeps announcing its target and refusing to overwrite; whole-plan refusal unchanged | 1 (react case), 7 (plant 1) | Met; `runAdd` untouched on that path |
| H3.3 eval gate: create-kai vitest incl. menu-honesty | 9 | Met (runs unchanged) |
| H3.3 eval gate: the pack-file assertion | 7, 9 | Met (`verify:pack` unchanged) |
| H3.3 eval gate: a real `add` into a throwaway project of EACH detected form | 7 | Met: react, vue(html), none(cdn) |
| S5.5 smoke extends to one non-react fixture so `FRAMEWORK_SIGNALS` is exercised past react | 7 | Met and exceeded |
| S3.4 displayed path == written path, byte for byte, tested per block × form with anti-vacuity floor | 1, 2 | Met; floor is `blocks.length>0`, `FRAMEWORK_BLOCK_FORMS.length>0`, artifacts present, at least one nested form. Good |
| S3.4 `add` keeps announcing its target | 1 | Met (`write <target>` lines; verify-add asserts each target announced) |
| S3.5 every framework tree emits a README; cdn is one file | 3 | Met |
| S7 PR D scope: detection rows only for frameworks whose forms exist; "detecting Vue and having no Vue tree is the menu-honesty failure" | 5 | Tension. The plan keeps vue/svelte/angular/solid ROWS and lands them on html with a printed sentence. That is decided loudly and is arguably better than dropping the rows (the row is what makes the fallback sayable), but it is not what S7 literally says. Say so in the PR body |
| S9 rulings: blocks not gallery, everywhere | none | **Not met**: the sweep patch is absent (E-1) |
| S8a.1 menu honesty on the form axis | 6 | Test present; code hole in `planAdd` (E-2) |
| H4 breaking = minor via `!` + footer | 1 | Met |
| Memory: menu honesty via `menu-honesty.test.ts`, stated-vs-asked | 5, 6 | Consistent |

## D. Rulings

- **R1** agree. Reading `file.target` is the single derivation; the identity test pins it.
- **R2** agree; the docs test already resolves the same way.
- **R3** agree.
- **R4** agree. `preact: null` is the right claim.
- **R5** agree, with the caveat stated. The 08-31 spec's rule 4 says "multiple frameworks present, or ... the signals conflict"; the handoff says "ambiguous asks loudly". Count-based would ask vue-vs-svelte today with two identical answers, which `add.test.ts` already pins as NOT a question. Answer-based converges on the spec after B2 (vue+svelte then decide different trees) with no edit. One gap: the "react dep in a repo whose app framework is something else" example is exactly react+vue, which stays ambiguous under R5. Fine. Put the derivation in the PR body so the spec reader sees why "two signals" was narrowed.
- **R6** agree on deriving the options. `because` cannot be exercised: `decideForm` never routes the axis through `decideAxis`/`answerAxis` (it must refuse under `--yes`, which `answerAxis` would not). Keep the sentence but say in the comment that it is for the day the axis is stated, and assert it non-empty (the test does).
- **R7** agree. Also the README middle should derive a needs line (C).
- **R8** agree.
- **R9** agree on not-in-`prepublishOnly`. One-process `--self-test` is fine; the plants must run AFTER the legs against the same dirs, which they do.
- **R10** agree on reusing `react-host`; disagree on the detail. (a) The leg never uses the app-local CLI, so drop `CLI_TARBALL` from the app install (or use it and drop the tools dir for that leg): as written R10 and R12 contradict. (b) All three blocks are installed into one app and compiled together; `verify-blocks-react` compiles one at a time and clears the others. Nothing on the tree proves three trees coexist under `noUnusedLocals`/`strict` (no `declare global` in any artifact, so probably fine), but the plan should say this is new and expect that first red. (c) The typecheck against the INSTALLED kit is the right requirement and the fixture is the right harness.
- **R11** agree; plant 1 must follow it.
- **R12** agree; `nearestPackageJson` walks to `/`, and `mkdtemp` under `os.tmpdir()` has no `package.json` above it on macOS or the runner.
- **CI placement.** `unit` is 20 min with no npm cache. `verify:add` adds: `npm pack` of the kit (~13.5 MiB), a cold `npm install` of react-host (react, react-dom, vite 6, plugin-react, typescript; 1-2 min cold), a CLI install, tsc. `browser` already pays the same install for `verify:blocks:react`. My call: keep it in `unit` (it depends only on `kit-dist` and the create-kai build, and `dist-guards` is already the heaviest leg) but add an `actions/cache` for `~/.npm` keyed on `react-host/package.json` (copy the `construct` leg's pattern), and record the measured wall time in the PR body. Move it only if the measurement plus the leg's current time approaches the budget.

## E. Findings needing a change (ranked)

1. **HIGH. The gallery-sweep patch is not in the plan.** Five `gallery` comments remain under `packages/create-kai`; owner ruling S9/H4 says none. Add a `chore(create-kai): blocks, not gallery, in the comments` commit as Task 0 (apply `create-kai-gallery-sweep.patch` with `git apply`), and reword Task 1 Step 3's comment to match the patch's `:323` hunk or note that hunk is superseded. Applying after Task 1 will fail on that hunk.
2. **HIGH. `planAdd` maps an unknown form to html silently**, so Task 6's plant is green and its second expected red is false. Make `planAdd`'s dispatch exhaustive (`switch (opts.form)` with a `default: { const never: never = opts.form; throw new Error(...) }`) or route file rendering through `renderBlockForm` and keep only the notes per form. Then the plant reds as the plan says. This is the "flag accepts a value nothing can emit" shape the task cites.
3. **HIGH. `verify-add.mjs` `pack()` is wrong about `readPackedFilename`.** Read `npm --version` once, call `readPackedFilename(json, { npmVersion })`, use `.filename`. Also honour `VERIFY_PACK_NPM` for the `--version` call.
4. **MEDIUM. Task 5 Step 6's expected red is false.** State the real reds (add-targets' `renderBlockForm` TypeError and the missing `f/<id>.vue.json` message) and run the whole suite for the plant; the detection cases PASS with the renamed name, which is the derivation proof.
5. **MEDIUM. Task 5 Step 2's red is runtime, not compile.** Say so; name `typecheck` as where the TS error appears.
6. **MEDIUM. R10 vs R12 on the CLI install.** Pick one: drop `CLI_TARBALL` from the react-host install, or use the app-local binary for that leg. State that compiling three trees in one app is new.
7. **MEDIUM. Task 7 Step 4 second plant.** Rewrite: the drafted leg already asserts the sentence, so the plant reds immediately with `landed on the html form without saying why`.
8. **MEDIUM. Plant 1 in `--self-test` hard-codes the html form** for the vue leg; use the form the leg matched (R11).
9. **LOW. README "what the block needs".** Derive a needs line from `route:*` deps / `envVars` / their absence; today it rides only on `manifest.docs`.
10. **LOW. Task 3's react case duplicates `react-form.test.ts:137`**; either drop it or make it assert byte-equality against the pre-change README (which is the actual control: `renderReadme` must reproduce the old literal).
11. **LOW. `html-form.test.ts` new cases should use the file's `stripped()` helper**, not an identity `withStrippedTwins`.
12. **LOW. Task 8 Step 5 grep** should exclude `docs/superpowers/` wholesale to match its own expectation.
13. **LOW. Task 2 imports appended after describe blocks**; hoist. Task 4 uses `'README.md'` where `README_FILE` exists.
14. **LOW. CI: add an npm cache to `unit`** (see D) and mention the network dependency in the step comment, as `browser` does for `verify:blocks:react`.
15. **LOW. Facts table HEAD** is `851f102d`; the tree is `26bb65af`. Update or drop the hash.

## F. Unresolved questions the plan left

- *Do three react trees compile together in one host?* Unknown on the tree; `verify-blocks-react` never tried. No `declare global`/`declare module` in any react artifact (`grep -l` over `dist/blocks/f/*.react.json`: none), each block is its own directory, so likely yes. Expect and record the first run.
- *Does `verify:blocks` run locally without Chromium?* No: its `[driver]` stage runs the block driver. Tasks 3 and 9 run it; state the Playwright prerequisite.
- *Does the cdn synthetic manifest need the README filtered?* Not verified either way; `renderedPage` copies every html file into a synthetic manifest, and the plan's filter is the safe choice. Keep it and keep the "still one file" assertion.
- *Is the `unit` budget enough?* Cannot be measured read-only. The leg has no npm cache; the install is the cost. See D.
- *Does the plan itself pass `lint:thresholds`/`lint:gate-parity` when committed?* Its two labelled `gate-list: partial` directives are the recognised form (`DIRECTIVE` regex at `lint-gate-parity.mjs:578`). The "Facts verified" table quotes no numbers except the stale hash. Should pass.
- *Where does the S7 "rows only for frameworks whose forms exist" tension get recorded?* Nowhere in the plan. Put it in the PR body: rows kept, landing derived, fallback printed.
