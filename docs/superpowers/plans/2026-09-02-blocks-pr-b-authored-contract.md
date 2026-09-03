# PR B: the authored block contract, and the html / react / cdn renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move a block's wiring off its imperative entry script and onto its markup, so the three delivery forms a consumer can get today (`html`, `react`, `cdn`) are GENERATED from one framework-neutral source instead of hand-written, with nothing regressing.

**Architecture:** `packages/blocks` grows two layers. `src/contract/` parses the authored page (parse5) and reads the authored controller's declared shape; `src/forms/` holds one renderer per delivery form, each consuming that one parsed template plus that one controller analysis. `src/targets.ts` is the single install-root table both a renderer and (in PR D) the CLI read. The authored block directory becomes `<id>.html` (bindings on the markup) + `<id>.controller.ts` + `mock.ts` + `<id>.css` + `states.mjs` + `registry-item.json`, and the imperative `<id>.js` is deleted: the html form's entry script is now GENERATED (a binder of roughly forty lines), the react form is a typed-wrapper tree over `useSyncExternalStore`, and the cdn form is the html form inlined and pinned exactly as today.

**Tech Stack:** TypeScript (no build step in `packages/blocks`; consumers bundle the source) · `parse5` 7.3 for HTML · vitest (node environment) for the package's own suite · esbuild for the type strip, at generation time only · the existing consumer-tsc harness (`packages/ui/scripts/lib/consumer-tsc-projects.mjs`) for the compile cells · Playwright + the existing block driver (`packages/ui/scripts/block-driver/`) for runtime.

**Spec:** `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md`, sections 3 (3.1 to 3.6), 5, 7's PR B paragraph, 8a and 8b. Evidence: `docs/superpowers/research/2026-09-02-blocks-contract-spike.md`, Q1, F-1 through F-10, "4. Recommendation", and appendices A1 (the authored page), A2 (the controller), A3/A4 (the react tree, which IS this plan's target output for `react`). Predecessors whose house rules this plan copies: `docs/superpowers/plans/2026-09-02-blocks-package-move.md` (PR A, the move) and `docs/superpowers/plans/2026-09-02-blocks-pr-b0-kit-fixes.md` (PR B0, the four kit fixes, merged).

---

## Scope: PR B, and nothing else

IN scope:

- The binding grammar of spec 3.1 as amended by 8b: `.prop`, `:attr`, `@event`, `#ref`, `*for` with a mandatory `:key`, `seed:attr`, `.textContent`, identifiers-never-expressions.
- The controller contract of spec 3.2 as amended by 8b: `createController(deps) => { state, actions, subscribe }`, `deps.refs` a getter of nullable typed handles, `State` as a view model.
- The `html`, `react` and `cdn` renderers, at parity with today's `wc`, `react` and `cdn` forms.
- `src/targets.ts`, and `registry-item.json`'s `files[].target` becoming derived.
- The form id rename `wc` -> `html`.
- `support-widget` converted first as the reference, then `assistant` and `in-app-assistant`.
- The gates: the new `verify:blocks` cells, the blocks compile cells, and the react RUNTIME cell.

OUT of scope, do not start any of it:

- `vue`, `svelte`, `angular`, `solid` renderers, their compile cells, `vue-tsc` / `svelte-check`. **PR B2.**
- The `/blocks` page on `apps/docs`, and retiring `packages/ui/apps/gallery` or the `kai dev` `/gallery` route. **PR C.** Both must keep working through this PR; that is a gate, not a nicety.
- `create-kai`'s `blockDir()`, `FRAMEWORK_SIGNALS` rows, README printing, `planAdd` reading `targets.ts`. **PR D.** Task 3 pins the resulting temporary mismatch so it cannot be forgotten.
- Any new block. The three under `packages/blocks/blocks/` only.
- The wider F-5 class of attribute-only declarative-child readers listed as OUT of scope in the PR B0 plan. If a converted block breaks on one of them, that is a finding: report it, do not fix it here unless the block cannot be converted at all without it (and then say so loudly in the PR body).

---

## Global Constraints

- Branch: `feat/blocks-authored-contract`, cut from `origin/main`. **The controller prepares the worktree and passes its absolute path at dispatch.** Every command in this plan runs inside it, never in the main checkout, which the controller keeps for itself. Export it once per shell:

```bash
export WT=/Users/home/Projects/kitn-ai/kitn-chat/.claude/worktrees/blocks-b
```

  Never `git checkout` in someone else's working checkout; if another agent owns a tree, stop and say so.
- Conventional commits, one per task. `feat(blocks): ...` for the contract, the renderers and the form-id rename; `refactor(blocks): ...` for a pure move; `fix(<area>): ...` for a kit defect found on the way. **This is a minor bump** (pre-1.0, `bump-minor-pre-major: true` in `release-please-config.json`, so `feat` takes the minor), which is correct: the block forms change shape.
- **A fresh clone or worktree needs THREE things before the unit suite means anything, and skipping one produces a failure that reads like a broken checkout:** (1) `pnpm install` -- a worktree under `.claude/worktrees/` resolves up into the parent checkout's `node_modules` while Vite refuses to serve paths outside the worktree root, and the whole suite dies on one identical `Cannot find module '/@fs/<parent>/node_modules/@testing-library/jest-dom/dist/vitest.mjs'`; (2) `pnpm --filter @kitn.ai/ui run build:css`, because `packages/ui/src/elements/compiled.css` is generated and gitignored; (3) a real build, for `dist/custom-elements.json`, `dist/kai.es.js` and `dist/blocks/`. `npm run` puts the ancestor `.bin` on PATH, so `build:css` can print success while the suite still fails identically.
- When a cold build is needed run `cd "$WT/packages/ui" && npm run build`, **never** `nx build ui`: the NX cache can restore a build target whose generators write into the SOURCE tree, printing success while changing nothing. A cached build looks exactly like a successful one.
- **Never pipe a heavy suite or a build through `tail` inside an `&&` chain** -- the exit status becomes the pipe's and a failure reads as a pass. Run each gate as its own command.
- Scratchpad paths are for scratch only. A scratchpad path must never appear in a committed file; Task 13 greps for that.
- macOS `sed` needs the empty backup argument: `sed -i '' -E`.
- No em dashes and no emoji in any prose this branch adds to the tree, comments included. (The authored `support-widget.html` keeps its `&#x1F44B;` numeric character reference, which is not an emoji character in the file.)
- **Every new test and every new guard is watched FAILING first.** Each task states the exact expected red. A check nobody has seen fail is not evidence.
- `docs/superpowers/**` is scanned by `node packages/ui/scripts/lint-gate-parity.mjs` and `node packages/ui/scripts/lint-threshold-derivation.mjs`. A fenced block or table under that tree that looks like a merge-gate enumeration needs `<!-- gate-list: partial -- <reason> -->` above it; a numeric threshold in prose needs a backticked producing command, the literal phrase `ratchet, not a target`, or `lint-thresholds: waive -- <reason>`. This plan carries those directives; keep them if you edit it.
- **No hand-typed counts.** Name the command that prints the number.
- `gh pr update-branch` before merge. Task 13 does NOT merge.
- Every commit ends with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

## Rulings this plan makes

Each ruling is here because an implementer would otherwise have to guess, and because the reason is not obvious from the spec.

**R1. The binding syntax is parsed with `parse5`, and the regex `bodyToJsx` is DELETED rather than kept beside it.**

`packages/blocks` gains `parse5` as a real `dependency`. The package's "depends on nothing" rule NARROWS to: **`src/registry.ts` depends on nothing OUTSIDE this package** -- it is what `create-kai` bundle-imports for validation and what the ban rules in `bundleGraphProblem` grade -- while `src/contract/**` and `src/forms/**` may depend on `parse5`. **Be precise about what that means after Task 6:** `registry.ts` then imports `./contract/parse-template` and `./contract/analyze-controller`, so parse5 reaches it transitively, and `create-kai`'s bundle grows parse5 with it. That is the intended shape (the grammar has one owner and `checkBlockContracts` surfaces it rather than restating it), and it is what the ban rules must keep passing: `bundleGraphProblem` bans `node_modules/zod/` and `mcp/mcp/` by path, so a `node_modules/parse5/` input is not banned. **Task 6 Step 5 re-runs `create-kai`'s bundle guard and its pack shape, and a red there is a scope finding, not a nuisance.** Say all of this in `packages/blocks/README.md` and in the coupling map.

Verified before this plan was written, on the tree, not assumed:

- `node_modules/parse5/package.json` is version `7.3.0`, `"type": "module"`, one runtime dependency (`entities`), and it ships its own types (`"types": "dist/index.d.ts"`). No `@types/parse5` is needed.
- Its declarations import nothing from `node:*`. (`grep -rn "node:" node_modules/parse5/dist/**/*.d.ts` matches only the property `node: Node;` inside `tree-adapters/interface.d.ts`, never a module specifier.) They reference no DOM lib type.
- A file importing `parseFragment`, `defaultTreeAdapter` and `type DefaultTreeAdapterMap` compiles CLEAN under exactly `packages/blocks/tsconfig.json`'s options -- `"types": []`, `"lib": ["ES2023"]`, `moduleResolution: bundler`, `strict`, `noUnusedLocals`, `verbatimModuleSyntax`, `isolatedModules` -- with `skipLibCheck` both true and false. **So `"types": []` stays and the DOM-free `lib` stays.** Both were measured, in a throwaway directory inside `packages/blocks` (resolution has to run inside the repo; the scratchpad has no `node_modules`).
- The repo uses `node-linker=hoisted` (`.npmrc`), so `parse5` already resolves from the root `node_modules` as a transitive dependency of something else. **That is a trap:** the import will work before it is declared. Declare it in `packages/blocks/package.json` and run `pnpm install` so the lockfile records it; a workspace package that resolves only by hoisting is one `pnpm prune` away from a broken build.

**R2. parse5 LOWERCASES attribute names, and the authored case is recovered from source locations.**

Measured: `parseFragment('<span .textContent="row.title">')` yields the attribute name `.textcontent`. `.activeId` becomes `.activeid`. Left alone, `.textContent` and `.activeId` would both be unauthorable, and the react renderer would emit `textcontent={...}`.

The fix is not to force kebab-case on the author. `parseFragment(html, { sourceCodeLocationInfo: true })` gives every element a `sourceCodeLocation.attrs` map, keyed by the LOWERCASED name, whose `startOffset`/`endOffset` slice the ORIGINAL source. Measured on the same fixture: slicing `[startOffset, endOffset)` returns `.textContent="row.title"`, and everything before the first `=` is the authored spelling. `parse-template.ts` therefore restores the authored case for every attribute before it classifies anything, and every error message quotes the authored spelling.

A property binding is normalised kebab-to-camel anyway (`.conversation-id` and `.conversationId` are the same property), so both spellings are legal; an ATTRIBUTE binding (`:attr`) keeps its authored spelling, because an attribute name is a string the element reads.

**R3. Form ids: `wc` becomes `html`, in one commit, before any renderer moves.**

Spec 3.4's table and spec 4's dropdown both say `HTML`, and `wc` is the only name left from the pre-spec vocabulary. The rename lands first so that every later diff is about behaviour. Every literal, found by `grep -rn --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.md' --include='*.yml' -E "['\"]wc['\"]" packages apps docs .github`:

`packages/blocks/src/forms.ts` (the `BLOCK_FORMS` row, the `renderBlockForm` case) · `packages/ui/mcp/construct/dev.test.ts` · `packages/ui/apps/gallery/GalleryPage.tsx` and `GalleryPage.test.tsx` · `packages/create-kai/src/blocks.ts` (`FRAMEWORK_SIGNALS['lands']`, `detectForm`, `blockFormAxis`, `blockDir`, `planWcBlock`) · `packages/create-kai/src/add.ts` (the `--form` validation list, its help line, the `decideForm` fallbacks, the ambiguous-case error text) · `packages/create-kai/test/add.test.ts`.

**`--form wc` becomes a hard error naming `html`, not a silent alias.** One shape per kind is the rule the whole binding grammar is built on, and an alias is a second spelling. Before implementing, run `npm view create-kai versions` and check whether a published version already documents `--form wc`; if one does, STOP and report -- the alias then belongs in PR D with the rest of the CLI's compatibility surface, and this task keeps the internal rename only.

**R4. `src/targets.ts` lands here, `FormFile` gains `target`, and `create-kai`'s `blockDir()` does NOT change.**

The react renderer needs `src/components/<id>/` and the html renderer needs `blocks/<id>/`, so the table cannot wait for PR D. But making `FormFile.path` the full project-relative path would DOUBLE-PREFIX inside `create-kai`, whose `planAdd` joins `blockDir(form, name)` onto every `file.path` -- `add` would write `src/blocks/support-widget/src/components/support-widget/...`. So:

- `FormFile.path` keeps its meaning: the file's name relative to wherever the caller mounts the form. Unchanged for every existing caller.
- `FormFile` gains `target: string`, **required, not optional**. The site (PR C) and the `[react-tree]` gate read it, and an optional field would let a renderer forget one and a gate pass on `undefined`. Required means four existing files that build a `FormFile` by hand stop compiling, and Task 3 fixes each by name: `packages/ui/apps/gallery/GalleryPage.tsx:179` (the `?? { path: '', content: '' }` empty-file fallback), `packages/ui/apps/gallery/GalleryPage.test.tsx:13-22` and `:68` (the stub form files), and `packages/ui/mcp/construct/dev.test.ts:890-893` and `:902` (the `storeZip` fixtures). `create-kai` keeps using `path` until PR D.
- **The resulting mismatch is temporary, deliberate and pinned.** After this PR the react form's `target` says `src/components/support-widget/SupportWidget.tsx` while `create-kai add` still writes `src/blocks/support-widget/SupportWidget.tsx`. Task 3 adds a test that ASSERTS the mismatch, names PR D, and fails the day someone changes one side -- so PR D deletes a red test rather than discovering an old lie.

`registry-item.json`'s `files[].target` becomes derived: validation refuses any `target` that is not the file's own basename, with a message naming `targets.ts` as the owner of the directory half. All three manifests already restate the basename, so the change is deleting those lines.

**R5. The controller is TypeScript; the type strip runs ONCE, at generation time, with esbuild, and the stripped `.js` twin TRAVELS with the block.**

Spec 8a item 5 says `gen-blocks.mjs` strips with esbuild. That is right for `gen-blocks` and is not enough on its own, because two more callers render the html and cdn forms and neither can run esbuild:

- `packages/ui/mcp/construct/dev.ts` (the `kai dev` gallery route) renders at RUNTIME inside the published `@kitn.ai/ui` CLI. `esbuild` is a devDependency of that package, not a runtime one.
- `packages/create-kai`'s `add` renders at RUNTIME in a published CLI whose `engines.node` is `">=20.19"`. `module.stripTypeScriptTypes` from `node:module` exists and works (measured on v22.22.3) but landed in Node 22.13, so it cannot be the mechanism for that CLI without a consumer-facing engines bump, which is out of scope.

And "each caller strips with whatever it has" is the worst option of all: `forms.ts`'s header claims what the gallery shows is byte-for-byte what `add` writes, and two different strippers make that false.

So `packages/blocks` never strips. `withStrippedTwins(block, strip)` (exported from `@kitn.ai/blocks/forms`) returns a Block whose `files` map and whose `manifest.files` carry a generated `<name>.js` beside every `<name>.ts`; the html and cdn renderers look the twin up and refuse LOUDLY, naming the generator, when it is missing. The twin is written by exactly two build-time callers, both with esbuild and both with the same options:

| Writer | Where the twin lands | Who reads it |
|---|---|---|
| `packages/ui/scripts/gen-blocks.mjs` (and `verify-blocks.mjs`, same call) | `dist/blocks/r/<id>.json`, and the rendered driver page | `dev.ts` (which renders from that item JSON), the site (PR C), a third-party registry consumer |
| `packages/create-kai/scripts/build.mjs` | `dist/blocks/<id>/<name>.js`, beside the copied source | the CLI's own directory scan in `loadBlocks` |

The esbuild options are restated in those two places, which is a copy: it gets a `docs/coupling-map.md` section 4 row, and a create-kai test asserts the twin in `dist/blocks/` equals what `esbuild.transformSync` produces from the source it sits beside.

**R6. The cdn inliner inlines ONE level -- the binder plus the controller plus the controller's own leaf imports -- and refuses anything deeper, and it lands in the SAME COMMIT as the conversion.**

The second half is not a preference. `packages/ui/scripts/gen-blocks.mjs:128` and `:134` call `generateCdnForm` on the AUTHORED block, and `packages/ui/mcp/construct/dev.ts:662` (`galleryPreviewHtml`) does the same. `generateCdnForm` inlines the page's relative `<script type="module">` tags, and after the conversion the authored page has none -- so the emitted `cdn.html` and the generated driver page would contain the markup and NO JavaScript. `verify:blocks [pins]` would fail (a pinless form is a hard failure by construction) and `[driver]` would time out on a readiness signal nothing sets, and `kai dev`'s preview would render dead markup. So the three call sites are routed through the html form in the conversion task itself, and that task asserts the emitted cdn.html and driver page CONTAIN the binder and the controller.

`inlineRelativeModule` today refuses a module with imports of its own. The generated binder imports `./<id>.controller.js`, which imports `./mock.js` and three `@kitn.ai/ui/*` entries. So the inliner recurses: a relative import inside an inlined module is itself inlined (its own relative imports must be leaves), and a bare `@kitn.ai/ui/*` import inside an inlined module is rewritten by `rewriteBareImport` and hoisted to the top exactly as the entry's own are. A third level is still a loud refusal, and so is a bare import that is not an `@kitn.ai/ui` entry. The closed `CDN_IMPORT_ENTRIES` set and the root-export refusal are untouched.

**R7. `analyze-controller` is a shape scanner over the contract's FIXED declarations, not a TypeScript parser, and esbuild's metafile is rejected for a decisive reason.**

R7 of the dispatch asked for esbuild's metafile or a TS AST walk, and to justify the pick. Neither is available: `packages/blocks` cannot depend on `esbuild` (see R5: two of its consumers are published CLIs that bundle this source), and it cannot depend on `typescript` either -- `create-kai` bundles `packages/blocks/src/**` into its CLI, and `bundleGraphProblem` grades that bundle's inputs. And esbuild's metafile could not answer the question anyway: it reports RUNTIME exports, and every name this analysis needs except `createController` is a TYPE, erased before any metafile exists.

So `src/contract/analyze-controller.ts` reads only what the contract FIXES, by brace-matched extraction after comment stripping:

- `export function createController(` must be present.
- `export interface <Name>State {`, `<Name>Actions {`, `<Name>Refs {`, where `<Name>` is `componentName(block.name)` -- so `SupportWidgetState`, `SupportWidgetActions`, `SupportWidgetRefs`. **Fixing these names is what makes the react adapter generatable at all**, so the analyzer enforces them and its error names the exact identifier it wanted.
- The member names of each block, from lines matching `^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??[?:(]`.

**Anti-vacuity is the whole point:** an empty action set, an empty state set or a missing interface is a HARD ERROR, never a silent empty. A scanner that finds nothing and says nothing is the failure mode that makes scanners worthless. The real backstop for action names is tsc: the react tree writes `actions.back` and `state.backHidden`, so the react compile cell (Task 10) catches anything the scanner mis-reads. The scanner exists so the HTML form -- which has no typecheck at all -- fails at generation time with a useful message instead of at runtime with `actions.bck is not a function`.

**R8. The generated non-react forms emit the registration import AND the `whenDefined` await; the react form emits neither.**

Spike F-7, both halves observed. The binder's first lines are `import '@kitn.ai/ui/autoloader';` and `await Promise.all(TAGS.map((t) => customElements.whenDefined(t)))`, with `TAGS` derived from the parsed template's `kai-*` tags. `adaptRegistrationForBundler` (unchanged) rewrites the autoloader import to `@kitn.ai/ui/elements` for the html form, and the cdn form keeps the autoloader, which is its native pattern. The react wrappers self-register and re-apply props on `whenDefined`, so the react tree carries no registration line.

**R9. The binder signals readiness with `window.__blockReady = true`, ONE constant, and the two stragglers are renamed onto it.**

Moving the wiring out of the authored script takes the readiness assignment with it, and without it the driver hangs for fifteen seconds and reports a timeout that reads like a broken block. A generated binder cannot emit a per-block name, so the convention has to be one word -- and the tree has two:

| Site | Today | After |
|---|---|---|
| `packages/blocks/blocks/assistant/states.mjs:26` | `__blockReady` | unchanged |
| `packages/blocks/blocks/in-app-assistant/states.mjs:27` | `__blockReady` | unchanged |
| `packages/blocks/blocks/support-widget/states.mjs:37` | `__widgetReady` | `__blockReady` |
| `packages/ui/scripts/block-driver/scenarios/kai-chat-facade.mjs:24` | `__widgetReady` | `__blockReady` |
| `packages/ui/scripts/block-driver/pages/kai-chat-facade/app.js:146` | sets `__widgetReady` | sets `__blockReady` |

`__blockReady` wins because it is already the majority and because the signal is about a BLOCK, not a widget. The binder emits it as its last line, after `apply()` and after `await actions.boot()`. The facade page and its scenario move together in Task 9, in one commit, or the facade run goes red.

**R10. `seed:` renders in React as a MOUNT EFFECT, never as a `defaultX` prop.**

The dispatch offered `defaultX` or an initial-only prop. `defaultX` cannot be the general rule: mapping `seed:view` to `defaultView` needs a per-tag table of which props have a `default` twin, which is exactly the hand-written list `docs/coupling-map.md` section 4 exists to shame -- and the twin frequently does not exist. Checked on the tree: `DockProps` declares `open` AND `defaultOpen`, while `ViewStackProps` declares only `view` and `drilled`, so the one seed this block actually needs has no `defaultView` to map to. One shape: the react renderer allocates a ref for any element carrying a `seed:` (reusing the element's `#ref` when it has one) and emits a single `useEffect(() => { ref.current?.setAttribute('view', 'home'); }, [])`. Written once, then never again, which is what `seed:` means.

**R11. A literal `="true"` / `="false"` on a `kai-*` element becomes a JSX boolean, and tsc is the table that makes this safe.**

Spike F-10: `searchable="false"` is the kit's own documented idiom and vue-tsc rejects the string. React needs `searchable={false}`. Deciding this per-prop would need a boolean-prop table; deciding it unconditionally is safe because of a fact measured on `packages/ui/src/elements/element-meta.json`: **no element declares a prop whose type union contains the string literal `'true'` or `'false'`** (`node -e "..."` over `element-meta.json`, zero hits). So a `="false"` literal can never legitimately mean the string. If that ever changes, the react compile cell fails with TS2322 on the exact line -- the guard is tsc, not a list somebody maintains.

**R12. The react component is a NAMED export, and the emitted hook is `use<Name>`.**

The spike's A3 target is `export function SupportWidget()`. Today's generated react form emits `export default function SupportWidget()` and `packages/create-kai/test/add.test.ts:213` pins that. The named export wins: it is what the README the renderer emits tells the reader to import, and it is what the spike compiled and ran. The create-kai assertion moves with it in Task 10. The adapter file is `use${componentName(block.name)}.ts` -- `useSupportWidget`, not the spike's illustrative `useSupportChat`.

**R13. The blocks compile cells run INSIDE `verify:scaffold` as a fourth PHASE of `main()`, and their code lives in its own module.**

`packages/ui/scripts/verify-scaffold-compiles.mjs` is already very large and is about the scaffolder. The cells share its harness (`createConsumerTsc`, whose `sandbox(project, name)` is exactly the "compile a directory of files under a project's own options, with its own anti-theatre self-test" mechanism these cells need) and standing the harness up twice would double the cost for nothing. So: the cell logic is `packages/ui/scripts/lib/block-compile-cells.mjs`, and `main()` calls it after `await routeCheck(scaffold)` at `:1953` and before `cleanup()`.

**Do not call it "block (4)".** In that script "block (1)" and "block (2)" are the two halves of the SCAFFOLDER'S EMITTED OUTPUT -- the front end and the backend route -- and its comments use the word that way throughout (`:137`, `:1951`). Blocks-the-product are a different thing with the same name, and a comment saying "block (4)" would be actively misleading in a file whose whole vocabulary is already taken. It is a fourth phase of `main()`, beside `routeCheck`.

**R14. The authored controller is in NO tsconfig program in this repo, and that is a consequence to hold rather than fix here.**

`packages/blocks/tsconfig.json` includes `src/**/*.ts` only, and `blocks/<id>/*.ts` imports `@kitn.ai/ui/state`, `/wire`, `/stores` and `/elements` -- which the package must not depend on. Adding a third tsconfig with a `@kitn.ai/ui` path mapping would give `packages/blocks` a build-order dependency on the kit, which PR A exists to prevent. **The controller's typecheck is the react compile cell** (Task 10), which compiles it against the SHIPPED declarations in a consumer-shaped harness -- a stronger check than a local pass, because it is the consumer's program. Say so in the package README so the absence reads as a decision.

**R15. `boot()` joins the controller contract, and the binder awaits it before signalling readiness.**

Every host calls one mount hook after wiring: React's adapter fires it in an effect, and the html binder awaits it before setting the driver's readiness signal. The html form has nowhere else to hydrate from storage, and the spike's own controller (report A2) already carries it with the comment "Mount hook: hydrate from storage. Not a binding - the host calls it." Making it required is what lets both adapters be generated. `analyzeController` refuses an `Actions` block without it (Task 7), and Task 13 folds the addition into spec 3.2 as a dated note.

**R16. The html serializer emits ASCII.**

Every non-ASCII code point in a text node or an attribute value is re-encoded as a numeric character reference. parse5 DECODES entities on parse, so `&#x1F44B;` in the authored page would round-trip as a literal astral character inside a generated file. The emitted forms are build artifacts rather than repo prose, so the house emoji rule is not what is at stake; byte-stability of a file people paste into arbitrary pages is. One line, and a test.

**R17. `handlerName` is a RESTATEMENT with a per-event guard, because an import is impossible.**

The handler-name rule lives in `packages/ui/scripts/gen-element-react.mjs` (`onName`), and `packages/blocks` cannot import from `packages/ui` -- that direction is what PR A established and what keeps the blocks package free of a build-order dependency. So the rule is written once more, in `src/forms/react.ts`, and `packages/ui/mcp/tests/blocks-artifacts.test.ts` -- the suite that already holds BOTH packages' inputs -- asserts the two agree for every event name in `element-meta.json`, with an anti-vacuity floor on the roster. `onName` gains an `export`. Say in the coupling map that this row is a restatement with a guard rather than a derivation; the distinction is the whole point of that section.

**R18. The wrapper component name and the element interface name are derived from the tag, and the derivation is pinned.**

Measured on `packages/ui/src/elements/element-meta.json` before this plan was written: for all of its entries, `displayName` equals PascalCase of the tag minus `kai-`, and `className` equals `Kai<displayName>Element`. Zero exceptions. So the react renderer derives both rather than carrying a tag-to-name table, and the same test asserts the rule for every entry, so an exception introduced later fails there rather than in a consumer's build.

**R19. The react runtime cell reuses each block's `states.mjs` through a `react` PAGE, with no baseline and light only.**

The driver already separates the page-specific facts (`path`, `indexKey`, `messagesElementId`, `expectedFirstTitle`, `expectRestore`, `closedSend`) from the shared story, so the react host is a third page key whose spec is the `block` one with `path: '/'`. The element ids survive into the react tree, which is what lets one set of probes drive both. No `--baseline`: a `react` page has no recorded run, and the assertions this cell needs are already `expect` maps the driver enforces on every run -- `suggestionsStillShowing: false` IS the spike's F-8 hole and `backArrow: true` / `homeTab: false` IS its F-6 loop. Light only, because dark adds paint and this cell is about behaviour.

**And the LAYOUT probes do not run on the react page.** `2-home`'s `homeSubtitleToCtaGap: 16`, `homeTitleToSubtitleGap: 4` and `homeSubtitleLineBox: 20` are pixel measurements taken in a specific document, and the react host is a different document: a Vite `index.html` with `#root` and no `.host-stand-in` paragraph, mounting a subtree rather than a page. Asserting those numbers there would make the cell fail for reasons that are not defects, and passing them would prove nothing about the react form. The react page asserts STATE, NAVIGATION, the `4-reply` probes and console-cleanliness; layout stays on the `block` page, where it was measured. The `states.mjs` `react` page definition says this in a comment, and the cell's own output repeats it, so nobody reads its green as a layout guarantee. Mechanically: each state's `probes`/`expect` entries are filtered by a `layout: true` marker the scenario puts on the three geometry probes and the `styleProbes`, and the driver skips a marked probe when the page spec sets `skipLayout: true`.

**R20. The authored page marks exactly one `data-block-root`, and the component frameworks emit that subtree only.**

`support-widget.html` opens with `<p class="host-stand-in">This blank page stands in for your site...</p>`. That is host chrome: it exists so the html and cdn forms are a runnable PAGE. A react consumer is not installing a paragraph explaining that the page is a stand-in, and today's react renderer emits the whole body, which is a defect the old form shipped and this round should not carry forward.

So the grammar gains one marker attribute: `data-block-root` on exactly one element. The `html` and `cdn` forms render the WHOLE page, unchanged; every component-framework renderer emits that subtree and nothing else. Validation refuses zero roots and refuses two, naming both lines -- an unmarked page would silently give react the host chrome back, and two roots have no answer at all. It is a plain `data-` attribute rather than a sixth punctuation prefix because it marks a boundary rather than binding anything, and because it stays a legal HTML attribute in the emitted page.

**R21. Five refusals and one attribute-writing rule are part of the contract, and they were undeclared.**

The parser enforces these; the spec did not say them, and Task 12's and Task 13's spec notes fold them in. Each one is a case in `tests/parse-template.test.ts`:

- `*for` needs a PARENT element: a repeated top-level child of `<body>` has nothing to rebuild its rows into.
- `*for` and `#ref` are exclusive on one element: a ref to a repeated element would name one row of many.
- A `#ref` name is declared once.
- `:key` is dotted from the loop item (`:key="row.id"`, never `:key="id"` and never `:key="other.id"`).
- An authored `<script type="module">` on the page is an ERROR: the entry script is generated now, and a page carrying one is a page that was never converted.
- **`#ref` and `seed:` are refused anywhere INSIDE a `*for` subtree**, for the same reason `#ref` is refused on the repeated element itself: both name one element, and a repeat has none.

And the attribute-writing rule, which spec 3.1 gets wrong in one word. It says the wc renderer "removes the attribute when the field is falsy". **Falsy is the wrong test**: `0` and `''` are falsy and are legitimate attribute values, and removing `count="0"` because zero is falsy is a silent data loss of exactly the kind this repo has a lint for. The rule is: remove on `false`, `null` and `undefined`; write everything else through `String(value)`, with `true` writing the empty string. The spec amendment fixes the word.

**R22. A binding inside a `*for` subtree is wired INSIDE the row, and the document-scope pass must exclude every descendant marker.**

This is the defect that would have made the first generated binder throw. `walkElements` is FLAT: it returns every element in document order, including the descendants of a repeated element. A binder loop that skips only the repeated element itself still emits `at(9).textContent = state.row.title` at document scope for the row's `<span .textContent="row.title">` -- and `at(9)` is null, because that span exists only inside a `<template>`. The first `apply()` throws, and the driver reports a state error rather than a legible message.

So the binder computes the repeat subtrees FIRST, collects every marker inside them, and the document-scope pass skips all of them. Task 7's test asserts BOTH halves over the fixture's `<span .textContent="row.title">`: absent from the top-level applies, present in the row block. Asserting only that the row block has it would pass with the duplicate still there.

---

## File structure

| File | Task | Responsibility after this PR |
|---|---|---|
| `packages/blocks/package.json` | 4 | Declares `parse5`; exports `./targets` beside `.` and `./forms` |
| `packages/blocks/src/targets.ts` | 3 | THE install-root table, plus `installRoot()` / `fileTarget()` |
| `packages/blocks/src/contract/types.ts` | 4 | `Binding`, `Repeat`, `TemplateNode`, `ParsedTemplate`, `ControllerShape` -- the vocabulary both renderers share |
| `packages/blocks/src/contract/parse-template.ts` | 4 | parse5 -> `ParsedTemplate`; the whole binding grammar and every validation message |
| `packages/blocks/src/contract/analyze-controller.ts` | 5 | The controller's declared shape: exported action names, State field names, ref names |
| `packages/blocks/src/forms/index.ts` | 7 | `BLOCK_FORMS`, `FormFile`, `isBlockFormId`, `renderBlockForm`, `withStrippedTwins`, `componentName`, `kaiTagsIn`, `adaptRegistrationForBundler` -- the module `@kitn.ai/blocks/forms` resolves to |
| `packages/blocks/src/forms/html.ts` | 7 | The html form: the page (bindings stripped, markers added) plus the generated binder |
| `packages/blocks/src/forms/cdn.ts` | 9 | The cdn form over the html form's output |
| `packages/blocks/src/forms/react.ts` | 8 | `<Name>.tsx` + `use<Name>.ts` + the copied controller/mock/css + README |
| `packages/blocks/src/registry.ts` | 3, 6 | Unchanged shape; derived-`target` validation and the four new contract checks |
| `packages/blocks/src/forms.ts` | 7 | DELETED, replaced by `src/forms/` (the exports map's `./forms` key moves to `src/forms/index.ts`) |
| `packages/blocks/blocks/support-widget/*` | 9 | The reference conversion: `.html` with bindings, `.controller.ts`, `mock.ts`; `support-widget.js` deleted |
| `packages/blocks/blocks/{assistant,in-app-assistant}/*` | 12 | The same conversion |
| `packages/blocks/tests/*.test.ts` | 3-9 | One suite per module, beside the module it pins |
| `packages/ui/scripts/gen-blocks.mjs` | 9 | Writes the stripped twins (esbuild) before rendering; emits them in the item JSON |
| `packages/ui/scripts/verify-blocks.mjs` | 6, 9, 10 | Two new cells (`html-binder`, `react-tree`) and their `--self-test` plants |
| `packages/ui/scripts/lib/block-compile-cells.mjs` | 10 | blocks x {html, react} compile cells over the shared consumer-tsc harness |
| `packages/ui/scripts/verify-scaffold-compiles.mjs` | 10 | Calls the cells as a fourth phase of `main()`, beside `routeCheck` |
| `packages/ui/scripts/verify-blocks-react.mjs` | 11 | The react RUNTIME cell: packed tarball, real Vite app, Playwright through `states.mjs` |
| `packages/ui/scripts/block-driver/react-host/` | 11 | The checked-in fixture template that cell copies |
| `packages/create-kai/scripts/build.mjs` | 9 | Writes the `.js` twins beside the copied block sources |
| `packages/create-kai/src/{blocks,add,react-form}.ts` | 3, 8 | `html` instead of `wc`; the react-form shim slims to what survives |
| `docs/coupling-map.md` | 13 | Section 4 rows (targets, `onName` reuse, the two esbuild call sites), section 10 row (the contract) |
| `packages/blocks/README.md` | 13 | The narrowed dependency rule, and R14 |

---

## Task 1: Capture the baseline (no commit)

**Files:** none. Nothing is edited in this task.

**Interfaces:**
- Consumes: a prepared worktree at `$WT`.
- Produces: four recorded artifacts under `$SCRATCH`, referenced by Task 9's baseline procedure and Task 13's PR body.

- [ ] **Step 1: Confirm the worktree is prepared**

```bash
cd "$WT" && git status --porcelain && git log --oneline -1
cd "$WT" && ls packages/ui/src/elements/compiled.css packages/ui/dist/kai.es.js packages/ui/dist/blocks/registry.json
```

Expected: a clean tree on `feat/blocks-authored-contract`, and all three paths present. If any is missing, do the three preparation steps in Global Constraints before anything else; a red anywhere below is otherwise unreadable.

- [ ] **Step 2: Record the block ids, from the scan, not from memory**

```bash
export SCRATCH="<the scratchpad path passed at dispatch>"
mkdir -p "$SCRATCH/baseline"
cd "$WT" && ls -d packages/blocks/blocks/*/ | xargs -n1 basename | tee "$SCRATCH/baseline/block-ids.txt"
```

- [ ] **Step 3: Record the pack list and the built block artifacts**

```bash
cd "$WT/packages/ui" && npm pack --dry-run --json > "$SCRATCH/baseline/pack.json"
cd "$WT" && node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readPackListing } from './scripts/pack-listing.mjs';
const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
const { files } = readPackListing(readFileSync(process.env.SCRATCH + '/baseline/pack.json', 'utf8'), { npmVersion });
console.log(files.map((f) => f.path).sort().join('\n'));
" > "$SCRATCH/baseline/pack-files.txt"
cd "$WT" && find packages/ui/dist/blocks -type f | sort > "$SCRATCH/baseline/dist-blocks.txt"
cd "$WT" && cp -R packages/ui/scripts/block-driver/baselines "$SCRATCH/baseline/driver-baselines"
```

**`readPackListing` from `<repo>/scripts/pack-listing.mjs`, never a hand-parse.** npm 12 made `npm pack --json`'s top level an object keyed by package name, so `JSON.parse(raw)[0]` is `undefined` under it -- that helper exists because the shape changed mid-publish once already, and `lint:pack-parse` is a required CI check that every pack-JSON consumer goes through it.

Read `pack-files.txt` and note whether `dist/blocks/**` appears. The pack list matters at the end: this PR adds emitted form JSON under `dist/blocks/`, so the delta is expected and must be ENUMERATED in Task 13, never waved through.

- [ ] **Step 4: Record the gates that must still be green at the end**

```bash
cd "$WT/packages/ui" && npm run verify:blocks 2>&1 | tee "$SCRATCH/baseline/verify-blocks.txt"
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run 2>&1 | tee "$SCRATCH/baseline/blocks-tests.txt"
```

Expected: both green. Read the block and check counts the gate PRINTS; do not copy a number from any document.

- [ ] **Step 5: No commit**

This task changes nothing and commits nothing. Say so in the handoff, and name the four files under `$SCRATCH/baseline/`.

---

## Task 2: Form ids -- `wc` becomes `html`

**Files:**
- Modify: `packages/blocks/src/forms.ts:37-46` (`BLOCK_FORMS`, `isBlockFormId`), `:388-393` (`renderBlockForm`), and the header prose at `:1-27`
- Modify: `packages/create-kai/src/blocks.ts:215-221,243,258,328` and the `planWcBlock` name
- Modify: `packages/create-kai/src/add.ts:64,92-93,129,142` and the ambiguous-case error text near `:134`
- Modify: `packages/ui/apps/gallery/GalleryPage.tsx:171`, `packages/ui/apps/gallery/GalleryPage.stories.tsx:105` (it calls `renderWcForm` and keys the result `wc:`, and the key is UNQUOTED so the `['"]wc['"]` grep below does not find it)
- Test: `packages/create-kai/test/add.test.ts:260,283-288,305-309,408`, `packages/ui/apps/gallery/GalleryPage.test.tsx:13,68-69`, `packages/ui/mcp/construct/dev.test.ts:777`

**Interfaces:**
- Produces: `BlockFormId` is now `'html' | 'react' | 'cdn'`. Every later task uses `html`.

- [ ] **Step 1: Check the published-CLI question BEFORE renaming anything**

```bash
npm view create-kai versions --json
npm view create-kai@latest bin --json
```

If a published version already ships `add --form wc`, STOP and report: the alias belongs in PR D. If `add` has not shipped, continue. Record what you saw in the commit body either way.

- [ ] **Step 2: Write the failing test**

Add to `packages/create-kai/test/add.test.ts`, in the `parseAddArgs` describe:

```ts
  it('--form html is accepted and --form wc is refused by name', () => {
    expect(parseAddArgs(['support-widget', '--form', 'html']).errors).toEqual([]);
    const legacy = parseAddArgs(['support-widget', '--form', 'wc']);
    expect(legacy.errors.join(' ')).toContain("--form must be react, html or cdn, got 'wc'");
  });
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts -t 'form html is accepted'
```

Expected: FAIL. `--form html` produces `--form must be react, wc or cdn, got 'html'`, so the first assertion is a non-empty errors array.

- [ ] **Step 4: Rename the form id at its source**

In `packages/blocks/src/forms.ts`:

```ts
export const BLOCK_FORMS = [
  { id: 'html', label: 'HTML' },
  { id: 'react', label: 'React' },
  { id: 'cdn', label: 'CDN single file' },
] as const;
```

and in `renderBlockForm`, `case 'html': return renderWcForm(block);` for now (the renderer itself is Task 7). Rename `renderWcForm` to `renderHtmlForm` and `wrapWcEntryScript` to `wrapHtmlEntryScript` in the same pass, updating `packages/create-kai/src/react-form.ts`'s re-export list and `packages/create-kai/src/blocks.ts`'s import. Update the module header prose: the form is `html`, not `wc`.

- [ ] **Step 5: Rename through create-kai**

```bash
cd "$WT" && grep -rn --include='*.ts' --include='*.tsx' --include='*.mjs' -E "['\"]wc['\"]" packages apps | grep -v node_modules | grep -v '/dist/'
# The quoted-literal grep MISSES an object key and a function name. Run both:
cd "$WT" && grep -rn --include='*.ts' --include='*.tsx' --include='*.mjs' -E "(^|[^A-Za-z])wc\s*:" packages apps | grep -v node_modules | grep -v '/dist/'
cd "$WT" && grep -rn --include='*.ts' --include='*.tsx' --include='*.mjs' -E "renderWcForm|wrapWcEntryScript|planWcBlock" packages apps | grep -v node_modules | grep -v '/dist/'
```

Change each hit. `packages/ui/apps/gallery/GalleryPage.stories.tsx:104-107` (the `stubForms` body, whose `wc:` key is at `:105`) and `packages/ui/apps/gallery/GalleryPage.test.tsx:13` are the two only the second and third greps find. In `packages/create-kai/src/blocks.ts` that is `FRAMEWORK_SIGNALS`'s `lands: 'react' | 'html'` and its five `'html'` rows, `detectForm`'s fallback, `blockFormAxis`'s option id and hint, `blockDir`'s branch, and `planWcBlock` -> `planHtmlBlock`. In `add.ts` it is the `--form` help line (`--form <react|html|cdn>`), the validation list and message, both `decideForm` fallbacks, and the ambiguous-case error (`Pass --form react or --form html.`).

- [ ] **Step 6: Run the three suites and watch them pass**

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit apps/gallery
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/construct/dev.test.ts
cd "$WT" && pnpm exec nx typecheck ui --skip-nx-cache
```

**`pnpm --filter @kitn.ai/blocks run typecheck` is not covered by `nx typecheck ui`.** The blocks package has its own two tsc passes (source and tests) and `BlockFormId` is a union type this task changes, so a missed literal in `packages/blocks/tests/**` is a compile error nothing else in this list reaches.

Expected: all green. `dev.test.ts:777`'s `filesOf('wc')` becomes `filesOf('html')`; `GalleryPage.test.tsx:13` and `:68-69` move their `wc` key and expectation to `html`; the stories file's `wc:` key and `renderWcForm` call become `html:` and `renderHtmlForm`. The typecheck is here rather than at the end because `BlockFormId` is a union type and a missed key is a type error, not a test failure.

- [ ] **Step 7: Prove no `wc` literal survives**

```bash
cd "$WT" && if grep -rnE "['\"]wc['\"]|(^|[^A-Za-z])wc\s*:|renderWcForm|wrapWcEntryScript|planWcBlock" --include='*.ts' --include='*.tsx' --include='*.mjs' packages apps | grep -v node_modules | grep -v '/dist/'; then echo "LEFTOVER wc FORM ID"; exit 1; else echo "clean"; fi
```

Written as an `if`, not `... || echo clean`: `grep` exits non-zero both for "no match" and for a bad invocation, and the `||` form reports a broken command as a pass.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the web-component delivery form is `html`, not `wc`

Spec 3.4's install-root table and spec 4's framework dropdown both say
HTML; `wc` was the last name left from the pre-spec vocabulary. Renamed
at its source (BLOCK_FORMS) and through every literal: the gallery page,
the kai dev form route, create-kai's detection table, its --form flag and
its axis.

`--form wc` is a hard error naming `html` rather than a silent alias.
One shape per kind is the rule the binding grammar is built on, and an
alias is a second spelling.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 3: `src/targets.ts`, derived manifest targets, and the PR D mismatch pin

**Files:**
- Create: `packages/blocks/src/targets.ts`
- Create: `packages/blocks/tests/targets.test.ts`
- Modify: `packages/blocks/package.json` (the `./targets` exports key)
- Modify: `packages/blocks/src/registry.ts` (the `files[].target` validation, in `validateBlockManifest`)
- Modify: `packages/blocks/blocks/*/registry-item.json` (delete the restated `target` lines)
- Modify: `packages/blocks/src/forms.ts` (`FormFile` gains a REQUIRED `target`)
- Modify, because a required field breaks them: `packages/ui/apps/gallery/GalleryPage.tsx:179`, `packages/ui/apps/gallery/GalleryPage.test.tsx:13-22,68`, `packages/ui/mcp/construct/dev.test.ts:890-893,902`
- Modify: `packages/create-kai/src/blocks.ts:333` (the "open <page>" note, which read the manifest `target` this task deletes) and `packages/create-kai/test/add.test.ts:219`
- Create: `packages/create-kai/test/pr-d-target-mismatch.test.ts`

**Interfaces:**
- Produces:
  - `INSTALL_ROOTS: Readonly<Record<TargetFramework, string>>`
  - `type TargetFramework = 'react' | 'vue' | 'solid' | 'svelte' | 'angular' | 'html'`
  - `installRoot(framework: TargetFramework, blockId: string): string`
  - `fileTarget(framework: TargetFramework, blockId: string, fileName: string): string`
  - `FormFile` becomes `{ path: string; content: string; target: string }`.

- [ ] **Step 1: Write the failing test**

`packages/blocks/tests/targets.test.ts`:

```ts
/**
 * The install-root table (spec 3.4). ONE table, read by the generator, the
 * CLI and the site, so the path the page DISPLAYS is the path `add` WRITES.
 */
import { describe, expect, it } from 'vitest';
import { INSTALL_ROOTS, installRoot, fileTarget } from '../src/targets';

describe('install roots', () => {
  it('carries every framework the spec names, and no other', () => {
    expect(Object.keys(INSTALL_ROOTS).sort()).toEqual(
      ['angular', 'html', 'react', 'solid', 'svelte', 'vue'],
    );
  });

  it('puts the component frameworks under src/components/<id>', () => {
    expect(installRoot('react', 'support-widget')).toBe('src/components/support-widget');
    expect(installRoot('vue', 'support-widget')).toBe('src/components/support-widget');
    expect(installRoot('solid', 'support-widget')).toBe('src/components/support-widget');
  });

  it('puts sveltekit under src/lib/components and angular under src/app/components', () => {
    expect(installRoot('svelte', 'support-widget')).toBe('src/lib/components/support-widget');
    expect(installRoot('angular', 'support-widget')).toBe('src/app/components/support-widget');
  });

  it('puts the html form under blocks/<id>', () => {
    expect(installRoot('html', 'support-widget')).toBe('blocks/support-widget');
  });

  it('fileTarget joins the root and the file name, posix only', () => {
    expect(fileTarget('react', 'support-widget', 'SupportWidget.tsx'))
      .toBe('src/components/support-widget/SupportWidget.tsx');
    expect(fileTarget('html', 'support-widget', 'support-widget.html'))
      .toBe('blocks/support-widget/support-widget.html');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/targets.test.ts
```

Expected: FAIL, `Failed to resolve import "../src/targets"`.

- [ ] **Step 3: Write `src/targets.ts`**

```ts
/**
 * INSTALL ROOTS -- ONE table (spec 2026-09-02 section 3.4), read by the form
 * renderers, by `create-kai add` (PR D) and by the /blocks page (PR C).
 *
 * THE RULING THIS FILE ENFORCES: the path the site DISPLAYS is the path the
 * CLI WRITES, byte for byte. A file tree on a page that does not match where
 * the command puts the file is a lie the reader finds out about after
 * running it.
 *
 * `components/` because every project already has one. No `ui/` or `kai/`
 * namespace: a block is the consumer's code, not a copied primitive, and a
 * namespace directory implies an upstream that owns it.
 *
 * No `node:path` here (this package declares no ambient types on purpose):
 * these are posix paths joined by hand, which is what a project-relative
 * path in a manifest is.
 */
export const INSTALL_ROOTS = {
  react: 'src/components',
  vue: 'src/components',
  solid: 'src/components',
  svelte: 'src/lib/components',
  angular: 'src/app/components',
  html: 'blocks',
} as const;

export type TargetFramework = keyof typeof INSTALL_ROOTS;

export function isTargetFramework(id: string): id is TargetFramework {
  return Object.prototype.hasOwnProperty.call(INSTALL_ROOTS, id);
}

/** Where this block's files land in a consumer project of this framework. */
export function installRoot(framework: TargetFramework, blockId: string): string {
  return `${INSTALL_ROOTS[framework]}/${blockId}`;
}

/** The project-relative target of one emitted file. */
export function fileTarget(framework: TargetFramework, blockId: string, fileName: string): string {
  return `${installRoot(framework, blockId)}/${fileName}`;
}
```

- [ ] **Step 4: Add the exports key**

In `packages/blocks/package.json`, beside `.` and `./forms`:

```json
    "./targets": {
      "types": "./src/targets.ts",
      "default": "./src/targets.ts"
    },
```

`packages/blocks/tests/registry.test.ts`'s "the package exports map" describe walks every entry and asserts `types` and `default` resolve to the same real file, so this key is covered the moment it exists. Run that suite in Step 8 and read it.

- [ ] **Step 5: Run the new test and watch it pass**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/targets.test.ts
```

Expected: PASS.

- [ ] **Step 6: Make `files[].target` derived -- write the failing validation test first**

Add to `packages/blocks/tests/registry.test.ts`, inside the "manifest validation (each rule watched failing)" describe. **Use its real helper**: `bad(mutate, files?)` at `:158` takes a MUTATOR over the synthetic manifest and returns the errors; there is no `VALID` object and no `CTX` constant, and inventing them would not compile.

```ts
  it('refuses a files[].target that is not the file basename (targets.ts owns the directory)', () => {
    const errs = bad((m) => {
      m.files = [{ path: 'demo.html', type: 'registry:page', target: 'src/blocks/x/demo.html' }];
    });
    expect(errs.join(' ')).toContain('targets.ts');
    expect(errs.join(' ')).toContain('"target" is derived');
  });

  it('accepts a target that equals the basename, and its absence', () => {
    expect(bad((m) => {
      m.files = [{ path: 'demo.html', type: 'registry:page', target: 'demo.html' }];
    })).toEqual([]);
    expect(bad((m) => {
      m.files = [{ path: 'demo.html', type: 'registry:page' }];
    })).toEqual([]);
  });
```

Read the `syntheticSource` helper above `bad` first and match the file names it declares, so the "a listed file must exist in the scanned directory" rule does not fire and mask what this case is testing.

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/registry.test.ts -t 'files\[\].target'
```

Expected: FAIL -- today any string `target` is accepted.

- [ ] **Step 7: Implement the check**

In `validateBlockManifest`, replace the `'target' in f` branch:

```ts
      if ('target' in f) {
        if (typeof f.target !== 'string') {
          errors.push(`${dirName}: files["${f.path}"].target must be a string when present`);
        } else if (f.target !== f.path.split('/').pop()) {
          errors.push(
            `${dirName}: files["${f.path}"].target is "${f.target}", but "target" is derived: the file name comes from the path and the DIRECTORY comes from src/targets.ts (one table, read by the renderers, the CLI and the site). Delete the line, or write "${f.path.split('/').pop()}".`,
          );
        }
      }
```

- [ ] **Step 8: Delete the restated target lines from all three manifests**

```bash
cd "$WT" && sed -i '' -E 's/, "target": "[^"]*"//' packages/blocks/blocks/*/registry-item.json
cd "$WT" && git diff --stat packages/blocks/blocks
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
```

Expected: three manifests changed, the whole blocks suite green (including the exports-map describe from Step 4).

- [ ] **Step 9: `FormFile` gains `target`**

In `packages/blocks/src/forms.ts` (Task 4 moves this interface into `src/contract/types.ts`, so that the renderers can name it without importing their own barrel; here it stays where it is):

```ts
/** One rendered file of a form.
 *
 *  `path` is the file's name relative to wherever the caller mounts the form
 *  -- unchanged, and what `create-kai` joins its own directory onto today.
 *  `target` is the PROJECT-RELATIVE path from `src/targets.ts`: what the
 *  /blocks page displays and what `add` will write once PR D reads the table.
 *  They disagree for react until then, deliberately and with a test on it. */
export interface FormFile {
  path: string;
  content: string;
  target: string;
}
```

Give every existing `files.push({ path, content })` in `renderHtmlForm`, `renderReactForm` and `renderCdnFormFiles` a `target`:

```ts
  files.push({ path: name, content, target: fileTarget('html', block.name, name) });
```

The cdn form is not a framework install: its target is the file name itself (it lands in the cwd), so `target: `${block.name}.html``.

**Required breaks four files that build a `FormFile` by hand.** They are not optional to fix and the field is not optional to make optional -- an optional `target` lets a renderer forget one and lets `[react-tree]` pass on `undefined`. Fix each:

| File | What it is | Fix |
|---|---|---|
| `packages/ui/apps/gallery/GalleryPage.tsx:179` | `?? { path: '', content: '' }`, the empty-file fallback when a form has no files | `?? { path: '', content: '', target: '' }` |
| `packages/ui/apps/gallery/GalleryPage.test.tsx:13-22` | the stub form files in the `block()` factory | add `target: \`blocks/${name}/${'<the file name>'}\`` for the html rows and `src/components/${name}/...` for the react rows; the values are stubs and only need to be present and consistent |
| `packages/ui/apps/gallery/GalleryPage.test.tsx:68` | `forms: { html: [{ path: 'assistant.html', content: '<p>a</p>' }] }` | same, one `target` |
| `packages/ui/mcp/construct/dev.test.ts:890-893,902` | the `storeZip` fixtures | add a `target`; `storeZip` reads `path` and `content` only, so any consistent value works and the test's meaning is unchanged |

- [ ] **Step 9b: The "open the page" note stops reading a deleted field**

`packages/create-kai/src/blocks.ts:333` builds its note with `page?.target ?? ''`, so deleting the manifest targets in Step 8 degrades it to `open blocks/support-widget/ through your dev server`. The page's own basename is the honest source:

```ts
  const page = block.manifest.files.find((f) => f.type === 'registry:page');
  const pageFile = page ? (page.target ?? page.path.split('/').pop()) : '';
  plan.notes.push(`${block.name}: web-component form under ${dir}/ (open ${path.posix.join(dir, pageFile)} through your dev server)`);
```

`packages/create-kai/test/add.test.ts:219` reads the same `page.target ?? path.basename(page.path)` and keeps working unchanged, but run it and read it rather than assuming:

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts
```

- [ ] **Step 10: Pin the PR D mismatch, so it cannot be forgotten**

`packages/create-kai/test/pr-d-target-mismatch.test.ts`:

```ts
/**
 * KNOWN MISMATCH, deliberate, temporary, and scheduled: PR D.
 *
 * PR B put `src/targets.ts` in the blocks package because the react renderer
 * needs a path, and left `blockDir()` alone because rewriting the CLI's write
 * planner is PR D's job. So right now the FORM says its react files belong at
 * `src/components/<id>/` and `add` still writes them to `src/blocks/<id>/`.
 *
 * This test asserts the mismatch EXISTS. It goes red the day either side
 * moves, which is the point: PR D deletes a failing test instead of
 * discovering an old lie. Delete this file in PR D, in the commit that makes
 * `planAdd` read `fileTarget()`.
 */
import { describe, expect, it } from 'vitest';
import { installRoot } from '@kitn.ai/blocks/targets';
import { planAdd } from '../src/blocks';
import { loadBundledBlocks, KIT_RANGE, KIT_VERSION } from './helpers';

describe('the PR D target mismatch', () => {
  it('the react form declares src/components/<id> while add still writes src/blocks/<id>', async () => {
    const blocks = await loadBundledBlocks();
    const block = blocks.find((b) => b.name === 'support-widget');
    if (!block) throw new Error('support-widget is not in the bundled registry');

    const plan = planAdd({ blocks: [block], routes: [] }, { form: 'react', kitRange: KIT_RANGE, kitVersion: KIT_VERSION });
    const written = plan.files.map((f) => f.path);

    expect(installRoot('react', 'support-widget')).toBe('src/components/support-widget');
    expect(written.every((p) => p.startsWith('src/blocks/support-widget/'))).toBe(true);
    expect(written.some((p) => p.startsWith('src/components/'))).toBe(false);
  });
});
```

Adapt the helper imports to what `packages/create-kai/test/add.test.ts` already uses for loading the bundled registry and the two pins; if it has no shared helper module, inline the same loading code the way that suite does rather than inventing one.

- [ ] **Step 11: Run it and watch it PASS for the right reason, then run everything the required field touched**

```bash
cd "$WT" && pnpm --filter create-kai exec vitest run test/pr-d-target-mismatch.test.ts
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit apps/gallery
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/construct/dev.test.ts
cd "$WT" && pnpm exec nx typecheck ui --skip-nx-cache
```

Two typechecks, and both matter: `nx typecheck ui` is where the required `target` fails in four `packages/ui` files (three of them tests a targeted vitest run would not reach), and the blocks package's own pass is where `targets.ts` and the changed `FormFile` are checked at all -- `nx typecheck ui` does not descend into `packages/blocks/tests`.

Expected: PASS. Then prove it can fail: temporarily change `blockDir`'s react branch to `src/components`, re-run, watch the third assertion go red naming `src/components/`, and revert. A mismatch pin nobody watched fail is not a pin.

- [ ] **Step 12: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): src/targets.ts, and files[].target becomes derived

ONE install-root table (spec 3.4), exported as @kitn.ai/blocks/targets and
read by the form renderers now, by the /blocks page in PR C and by the CLI
in PR D. FormFile gains `target`, the project-relative path; `path` keeps
its meaning so create-kai's own directory join is untouched.

registry-item.json's files[].target was a hand-typed restatement of the
file's own basename in all three manifests. Validation now refuses any
target that is not the basename and names targets.ts as the owner of the
directory half; the three restatements are deleted.

The react form's target and what `add` writes disagree until PR D. That
mismatch is asserted by test/pr-d-target-mismatch.test.ts, which goes red
the day either side moves.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 4: parse5 in, and `src/contract/parse-template.ts`

**Files:**
- Modify: `packages/blocks/package.json` (add `parse5` to `dependencies`)
- Create: `packages/blocks/src/contract/types.ts`
- Create: `packages/blocks/src/contract/parse-template.ts`
- Create: `packages/blocks/tests/parse-template.test.ts`
- Modify: `packages/blocks/README.md` (the narrowed dependency rule)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseTemplate(html: string, where: string): { template?: ParsedTemplate; errors: string[] }`, plus the whole `types.ts` vocabulary below. Tasks 7 and 10 consume `ParsedTemplate`; Task 6 consumes `parseTemplate` for the new contract checks.

- [ ] **Step 1: Declare parse5 and install**

```bash
cd "$WT" && node -e "const p=require('./packages/blocks/package.json'); p.dependencies={parse5:'^7.3.0'}; require('fs').writeFileSync('./packages/blocks/package.json', JSON.stringify(p,null,2)+'\n')"
cd "$WT" && pnpm install
cd "$WT" && git diff --stat pnpm-lock.yaml packages/blocks/package.json
```

Expected: `packages/blocks/package.json` gains `dependencies`, and `pnpm-lock.yaml` records it. **The lockfile change is required**: `.npmrc` sets `node-linker=hoisted`, so `parse5` already resolves from the root `node_modules` as somebody else's transitive dependency and the import would work undeclared. That is exactly the state one `pnpm prune` breaks.

- [ ] **Step 2: Write the failing test**

`packages/blocks/tests/parse-template.test.ts` -- the grammar, one case per rule, every refusal watched:

```ts
/**
 * The binding grammar (spec 3.1 as amended by 8b). Every rule has a case, and
 * every REFUSAL has a case: a parser that accepts everything and a parser that
 * is correct look identical from the outside until you plant the bad input.
 */
import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../src/contract/parse-template';

// Every fixture page carries the host stand-in the real blocks carry, plus a
// `data-block-root` wrapper, because that is the shape the contract requires
// and a fixture without it would test a page no renderer accepts.
const page = (body: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<link rel="stylesheet" href="./b.css" />\n</head>\n<body>\n<p class="host-stand-in">stand-in</p>\n<div data-block-root>\n${body}\n</div>\n</body>\n</html>\n`;

/** The block root's element children -- what the per-kind cases below assert
 *  against, now that the fixture wraps them. */
const rootChildren = (t: ReturnType<typeof ok>) => t.blockRoot.children.filter((n) => n.type === 'element');

const ok = (body: string) => {
  const out = parseTemplate(page(body), 'fixture/b.html');
  if (out.errors.length) throw new Error(`unexpected errors: ${out.errors.join(' | ')}`);
  return out.template!;
};
const errsFor = (body: string) => parseTemplate(page(body), 'fixture/b.html').errors.join(' | ');

describe('the five binding kinds', () => {
  it('.prop binds a property, with the AUTHORED case preserved', () => {
    const t = ok('<kai-thread .messages="messages" .activeId="activeId"></kai-thread>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings.map((b) => [b.kind, b.name, b.value])).toEqual([
      ['prop', 'messages', 'messages'],
      ['prop', 'activeId', 'activeId'],
    ]);
  });

  it('.prop accepts the kebab spelling of the same property', () => {
    const t = ok('<kai-conversation-item .conversation-id="id"></kai-conversation-item>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings[0].name).toBe('conversationId');
  });

  it('.textContent is a property binding and keeps its case', () => {
    const t = ok('<span .textContent="recentTitle"></span>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings[0]).toMatchObject({ kind: 'prop', name: 'textContent' });
  });

  it(':attr binds a scalar attribute and keeps the authored attribute name', () => {
    const t = ok('<kai-button :hidden="backHidden"></kai-button>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings[0]).toMatchObject({ kind: 'attr', name: 'hidden', value: 'backHidden' });
  });

  it('@event binds an action, kai- or native', () => {
    const t = ok('<kai-button @kai-click="back"></kai-button><button @click="close"></button>');
    const kinds = rootChildren(t).map((n) => (n.type === 'element' ? n.bindings[0] : null));
    expect(kinds).toMatchObject([{ kind: 'event', name: 'kai-click', value: 'back' }, { kind: 'event', name: 'click', value: 'close' }]);
  });

  it('#ref names a handle, and every ref name is collected', () => {
    const t = ok('<kai-dock #ref="dock"><kai-view-stack #ref="stack"></kai-view-stack></kai-dock>');
    expect(t.refs).toEqual(['dock', 'stack']);
  });

  it('seed: carries a literal, not a field', () => {
    const t = ok('<kai-view-stack seed:view="home"></kai-view-stack>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings[0]).toMatchObject({ kind: 'seed', name: 'view', value: 'home' });
  });

  it('*for opens a scope in which row.<field> is legal, and records the key', () => {
    const t = ok(
      '<kai-conversations><kai-conversation-item *for="row of rows" :key="row.id" :unread="row.unread">' +
        '<span .textContent="row.title"></span></kai-conversation-item></kai-conversations>',
    );
    const list = rootChildren(t)[0];
    const item = list.type === 'element' ? list.children.find((c) => c.type === 'element') : undefined;
    expect(item && item.type === 'element' && item.repeat).toMatchObject({ item: 'row', list: 'rows', key: 'row.id' });
  });

  it('a plain attribute stays a literal', () => {
    const t = ok('<kai-button variant="ghost" full></kai-button>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.attrs).toEqual([{ name: 'variant', value: 'ghost' }, { name: 'full', value: '' }]);
    expect(el.type === 'element' && el.bindings).toEqual([]);
  });
});

describe('every refusal', () => {
  it('refuses an expression, and names the fix', () => {
    const out = errsFor('<kai-button :hidden="!drilled"></kai-button>');
    expect(out).toContain('!drilled');
    expect(out).toContain('identifier, never an expression');
    expect(out).toContain('controller');
  });

  it('refuses a call and a comparison too', () => {
    expect(errsFor('<span .textContent="fmt(time)"></span>')).toContain('never an expression');
    expect(errsFor('<span :hidden="count === 0"></span>')).toContain('never an expression');
  });

  it('refuses a dotted value outside a *for scope', () => {
    expect(errsFor('<span .textContent="row.title"></span>')).toContain('only legal inside the `*for`');
  });

  it('refuses a dotted value from the wrong loop variable', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="row.id" .textContent="other.title"></li></ul>'))
      .toContain('only legal inside the `*for`');
  });

  it('refuses *for without :key', () => {
    expect(errsFor('<ul><li *for="row of rows"></li></ul>')).toContain(':key is mandatory');
  });

  it('refuses :key without *for', () => {
    expect(errsFor('<li :key="a.id"></li>')).toContain(':key is only legal on an element carrying `*for`');
  });

  it('refuses a *for value that is not `item of list`', () => {
    expect(errsFor('<ul><li *for="rows" :key="row.id"></li></ul>')).toContain('*for="item of list"');
  });

  it('refuses a *for on a top-level body element (nothing to rebuild into)', () => {
    expect(errsFor('<li *for="row of rows" :key="row.id"></li>')).toContain('needs a parent element');
  });

  it('refuses *for and #ref on the same element', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="row.id" #ref="x"></li></ul>')).toContain('cannot also carry `#ref`');
  });

  it('refuses a duplicate #ref name', () => {
    expect(errsFor('<kai-dock #ref="a"></kai-dock><kai-dock #ref="a"></kai-dock>')).toContain('#ref="a" is declared twice');
  });

  it('refuses an unknown prefix rather than treating it as a literal', () => {
    expect(errsFor('<kai-button ?hidden="x"></kai-button>')).toContain('?hidden');
  });

  it('refuses an authored module script: the entry script is GENERATED now', () => {
    expect(errsFor('<script type="module" src="./b.js"></script>')).toContain('generated');
  });

  it('refuses #ref inside a *for subtree', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="row.id"><span #ref="x"></span></li></ul>'))
      .toContain('inside a `*for` subtree');
  });

  it('refuses seed: inside a *for subtree', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="row.id"><kai-view seed:name="a"></kai-view></li></ul>'))
      .toContain('inside a `*for` subtree');
  });
});

describe('the block root', () => {
  it('is the one element renderers that emit a subtree cut at', () => {
    const t = ok('<kai-dock #ref="d"></kai-dock>');
    expect(t.blockRoot.type).toBe('element');
    expect(t.blockRoot.tag).toBe('div');
    expect(t.body.some((n) => n.type === 'element' && n.attrs.some((a) => a.name === 'class' && a.value === 'host-stand-in'))).toBe(true);
  });

  it('refuses a page with none, naming what the marker is for', () => {
    const bare = `<!doctype html>\n<html lang="en"><head></head><body><kai-dock></kai-dock></body></html>\n`;
    const errs = parseTemplate(bare, 'fixture/b.html').errors.join(' | ');
    expect(errs).toContain('data-block-root');
    expect(errs).toContain('host');
  });

  it('refuses a page with two, naming both lines', () => {
    const two = `<!doctype html>\n<html lang="en"><head></head><body>\n<div data-block-root></div>\n<div data-block-root></div>\n</body></html>\n`;
    const errs = parseTemplate(two, 'fixture/b.html').errors.join(' | ');
    expect(errs).toContain('2 elements carry');
  });
});

describe('what the renderers need out of it', () => {
  it('collects the kai tags, sorted and deduped', () => {
    const t = ok('<kai-dock><kai-panel></kai-panel><kai-dock></kai-dock></kai-dock>');
    expect(t.kaiTags).toEqual(['kai-dock', 'kai-panel']);
  });

  it('records the stylesheets and leaves the head slice verbatim', () => {
    const t = ok('<p>x</p>');
    expect(t.stylesheets).toEqual(['b.css']);
    expect(t.headInner).toContain('<meta charset="utf-8" />');
  });

  it('numbers a marker for every element carrying a binding, in document order (the unbound wrapper takes none)', () => {
    const t = ok('<kai-dock #ref="d"><span>plain</span><kai-button :hidden="h"></kai-button></kai-dock>');
    const dock = rootChildren(t)[0];
    const button = dock.type === 'element' ? dock.children.find((c) => c.type === 'element' && c.tag === 'kai-button') : undefined;
    expect(dock.type === 'element' && dock.marker).toBe(0);
    expect(button && button.type === 'element' && button.marker).toBe(1);
    expect(t.markerCount).toBe(2);
  });

  it('keeps text and comments as nodes', () => {
    const t = ok('<kai-panel-header>Support<!-- note --></kai-panel-header>');
    const header = rootChildren(t)[0];
    const kinds = header.type === 'element' ? header.children.map((c) => c.type) : [];
    expect(kinds).toEqual(['text', 'comment']);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/parse-template.test.ts
```

Expected: FAIL, `Failed to resolve import "../src/contract/parse-template"`.

- [ ] **Step 4: Write `src/contract/types.ts`**

```ts
/**
 * The vocabulary the parsed page and the parsed controller are expressed in.
 * Every renderer consumes THESE types and never re-reads the source, which is
 * what makes "the renderers agree about what a binding means" checkable.
 */

/** An attribute the renderers pass through unchanged. */
export interface LiteralAttr {
  name: string;
  value: string;
}

export type BindingKind = 'prop' | 'attr' | 'event' | 'ref' | 'seed';

export interface Binding {
  kind: BindingKind;
  /** The authored spelling, case preserved: `.textContent`, `:hidden`, `@kai-click`. */
  raw: string;
  /** prop: the camelCase property. attr/seed: the authored attribute name.
   *  event: the event name. ref: the ref name. */
  name: string;
  /** prop/attr: the controller field (`row.title` inside a `*for`).
   *  event: the action name. ref: the ref name. seed: the literal. */
  value: string;
  line: number;
}

/** A `*for="item of list"` with its mandatory `:key`. */
export interface Repeat {
  item: string;
  list: string;
  /** Always dotted from `item`, e.g. `row.id`. */
  key: string;
  line: number;
}

export type TemplateNode =
  | {
      type: 'element';
      tag: string;
      attrs: LiteralAttr[];
      bindings: Binding[];
      repeat?: Repeat;
      /** The binder's address for this element, assigned to every element that
       *  carries a binding or a repeat. Absent means "nothing to wire". */
      marker?: number;
      children: TemplateNode[];
      line: number;
    }
  | { type: 'text'; text: string }
  | { type: 'comment'; text: string };

export interface ParsedTemplate {
  /** `<html lang>`, so the emitted page keeps it. */
  lang: string;
  /** The literal attributes on `<body>`. */
  bodyAttrs: LiteralAttr[];
  /** The original source of everything inside `<head>`, verbatim. */
  headInner: string;
  body: TemplateNode[];
  /** Relative stylesheet hrefs the page linked, in order, without `./`. */
  stylesheets: string[];
  /** Every `kai-*` tag the page renders, sorted and deduped. */
  kaiTags: string[];
  /** Every `#ref` name, in document order. */
  refs: string[];
  markerCount: number;
  /** The one element marked `data-block-root`: what a COMPONENT-framework
   *  renderer emits. The html and cdn forms render the whole `body` instead,
   *  because they are a page and the rest of it is the host stand-in. */
  blockRoot: Extract<TemplateNode, { type: 'element' }>;
}

/** One rendered file of a delivery form.
 *
 *  It lives HERE rather than in src/forms/index.ts so that `html.ts` and
 *  `react.ts` can name it without importing their own barrel: index.ts
 *  re-exports every renderer, so a renderer importing index.ts is a cycle.
 *  `path` is the file name relative to wherever the caller mounts the form;
 *  `target` is the project-relative path from src/targets.ts. */
export interface FormFile {
  path: string;
  content: string;
  target: string;
}

/** What `analyze-controller` reads off `<id>.controller.ts`. */
export interface ControllerShape {
  /** `componentName(block.name)`, the prefix every exported type carries. */
  name: string;
  stateFields: string[];
  actionNames: string[];
  refNames: string[];
}
```

- [ ] **Step 5: Write `src/contract/parse-template.ts`**

```ts
/**
 * The authored page -> `ParsedTemplate` (spec 3.1 as amended by 8b).
 *
 * WHY parse5 AND NOT A REGEX. The predecessor (`bodyToJsx`) matched tags with
 * a regex and refused anything it could not translate. That was honest and it
 * does not scale to a grammar: bindings are attributes, `*for` opens a scope,
 * and a scope needs a tree. parse5 is the WHATWG tokenizer, so what it thinks
 * a page contains is what a browser thinks.
 *
 * THE ONE parse5 GOTCHA, measured, not assumed: it LOWERCASES attribute names,
 * so `.textContent` arrives as `.textcontent` and `.activeId` as `.activeid`.
 * With `sourceCodeLocationInfo: true` every attribute carries source offsets
 * keyed by that lowercased name, and slicing the original text gives the
 * AUTHORED spelling back. That is what `authoredAttrs` does, and it runs
 * before anything is classified, so every rule and every error message sees
 * what the author wrote.
 */
import { parse, defaultTreeAdapter } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { Binding, BindingKind, LiteralAttr, ParsedTemplate, Repeat, TemplateNode } from './types';

type P5Node = DefaultTreeAdapterMap['node'];
type P5Element = DefaultTreeAdapterMap['element'];
type P5Parent = DefaultTreeAdapterMap['parentNode'];

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DOTTED = /^([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)$/;
const FOR_VALUE = /^([A-Za-z_$][A-Za-z0-9_$]*)\s+of\s+([A-Za-z_$][A-Za-z0-9_$]*)$/;

const camel = (name: string): string => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const isElement = (node: P5Node): node is P5Element => defaultTreeAdapter.isElementNode(node);
const childrenOf = (node: P5Parent): P5Node[] => defaultTreeAdapter.getChildNodes(node) ?? [];
const findChild = (node: P5Parent, tag: string): P5Element | undefined =>
  childrenOf(node).find((c): c is P5Element => isElement(c) && c.tagName === tag);

/** parse5 lowercases attribute names; recover the authored spelling from the
 *  source offsets it recorded for each one. */
function authoredAttrs(el: P5Element, source: string): { name: string; value: string }[] {
  const locs = el.sourceCodeLocation?.attrs;
  return el.attrs.map((attr) => {
    const loc = locs?.[attr.name];
    if (!loc) return { name: attr.name, value: attr.value };
    const raw = source.slice(loc.startOffset, loc.endOffset);
    const eq = raw.indexOf('=');
    return { name: (eq === -1 ? raw : raw.slice(0, eq)).trim(), value: attr.value };
  });
}

const lineOf = (el: P5Element): number => el.sourceCodeLocation?.startLine ?? 0;

interface Ctx {
  where: string;
  source: string;
  errors: string[];
  refs: string[];
  marker: number;
}

const fail = (ctx: Ctx, line: number, message: string): void => {
  ctx.errors.push(`${ctx.where}:${line}: ${message}`);
};

/** A binding value is an identifier, optionally dotted from the enclosing
 *  `*for` item. Everything else is an error that names the fix. */
function checkValue(ctx: Ctx, line: number, raw: string, value: string, scope: string | undefined): boolean {
  if (IDENT.test(value)) return true;
  const dotted = DOTTED.exec(value);
  if (dotted) {
    if (scope && dotted[1] === scope) return true;
    fail(
      ctx,
      line,
      `${raw}="${value}": a dotted value like \`${value}\` is only legal inside the \`*for\` that declares \`${dotted[1]}\`. Add a field to State instead.`,
    );
    return false;
  }
  fail(
    ctx,
    line,
    `${raw}="${value}": a binding holds an identifier, never an expression. Put the derivation in the controller and bind the field it produces (spec 3.1; State is a view model, spec 3.2).`,
  );
  return false;
}

function classify(name: string): { kind: BindingKind | 'for' | 'key'; target: string } | null {
  if (name.startsWith('seed:')) return { kind: 'seed', target: name.slice('seed:'.length) };
  if (name.startsWith('.')) return { kind: 'prop', target: name.slice(1) };
  if (name === ':key') return { kind: 'key', target: 'key' };
  if (name.startsWith(':')) return { kind: 'attr', target: name.slice(1) };
  if (name.startsWith('@')) return { kind: 'event', target: name.slice(1) };
  if (name.startsWith('#')) return { kind: 'ref', target: name.slice(1) };
  if (name.startsWith('*')) return { kind: 'for', target: name.slice(1) };
  return null;
}

const BINDING_PREFIXES = /^[.:@#*]|^seed:/;

function convertElement(el: P5Element, ctx: Ctx, scope: string | undefined, hasParent: boolean): TemplateNode {
  const line = lineOf(el);
  const attrs: LiteralAttr[] = [];
  const bindings: Binding[] = [];
  let repeat: Repeat | undefined;
  let keyValue: string | undefined;
  let refName: string | undefined;

  for (const { name, value } of authoredAttrs(el, ctx.source)) {
    const kind = classify(name);
    if (!kind) {
      if (BINDING_PREFIXES.test(name)) {
        fail(ctx, line, `"${name}" starts with a binding prefix this grammar does not have. The kinds are .prop, :attr, @event, #ref, *for and seed:attr (spec 3.1).`);
        continue;
      }
      attrs.push({ name, value });
      continue;
    }
    if (kind.kind === 'for') {
      if (kind.target !== 'for') {
        fail(ctx, line, `"*${kind.target}" is not a list binding; the only \`*\` form is \`*for="item of list"\`.`);
        continue;
      }
      const m = FOR_VALUE.exec(value.trim());
      if (!m) {
        fail(ctx, line, `*for="${value}": a list binding is spelled \`*for="item of list"\`, both identifiers.`);
        continue;
      }
      repeat = { item: m[1], list: m[2], key: '', line };
      continue;
    }
    if (kind.kind === 'key') {
      keyValue = value;
      continue;
    }
    if (kind.kind === 'ref') {
      if (!IDENT.test(value)) {
        fail(ctx, line, `#ref="${value}": a ref name is a plain identifier.`);
        continue;
      }
      if (ctx.refs.includes(value)) {
        fail(ctx, line, `#ref="${value}" is declared twice; a ref names one element.`);
        continue;
      }
      ctx.refs.push(value);
      refName = value;
      bindings.push({ kind: 'ref', raw: '#ref', name: value, value, line });
      continue;
    }
    if (kind.kind === 'seed') {
      bindings.push({ kind: 'seed', raw: name, name: kind.target, value, line });
      continue;
    }
    if (kind.kind === 'event') {
      if (!IDENT.test(value)) {
        fail(ctx, line, `${name}="${value}": an event binds ONE action name, an identifier the controller exports.`);
        continue;
      }
      bindings.push({ kind: 'event', raw: name, name: kind.target, value, line });
      continue;
    }
    // prop | attr
    const inScope = repeat ? repeat.item : scope;
    if (!checkValue(ctx, line, name, value, inScope)) continue;
    bindings.push({
      kind: kind.kind,
      raw: name,
      name: kind.kind === 'prop' ? camel(kind.target) : kind.target,
      value,
      line,
    });
  }

  if (repeat) {
    if (keyValue === undefined) {
      fail(ctx, line, `*for="${repeat.item} of ${repeat.list}" carries no :key. :key is mandatory: the kai- reactivity contract is reference-keyed and every host framework needs a key anyway (spec 3.1).`);
    } else {
      const dotted = DOTTED.exec(keyValue);
      if (!dotted || dotted[1] !== repeat.item) {
        fail(ctx, line, `:key="${keyValue}" must be dotted from the loop item, e.g. :key="${repeat.item}.id".`);
      } else {
        repeat.key = keyValue;
      }
    }
    if (!hasParent) {
      fail(ctx, line, `*for needs a parent element to rebuild its rows into; a repeated element cannot be a top-level child of <body>.`);
    }
    if (refName !== undefined) {
      fail(ctx, line, `an element carrying *for cannot also carry \`#ref\`: the ref would name one of many rows.`);
    }
  } else if (keyValue !== undefined) {
    fail(ctx, line, `:key="${keyValue}" is only legal on an element carrying \`*for\`.`);
  }

  const childScope = repeat ? repeat.item : scope;
  const children = convertChildren(el, ctx, childScope);

  // `#ref` and `seed:` name ONE element, and a repeat has none: inside a
  // `*for` subtree both would resolve to whichever clone the binder reached
  // last. `scope !== undefined` IS "inside a repeat subtree", because the
  // scope is set by the enclosing `*for` and by nothing else; the repeated
  // element itself is covered by the `#ref`-and-`*for`-are-exclusive check
  // below, which names its own reason.
  if (scope !== undefined) {
    for (const b of bindings) {
      if (b.kind === 'ref' || b.kind === 'seed') {
        fail(ctx, line, `${b.raw}="${b.value}" is inside a \`*for\` subtree. \`#ref\` and \`seed:\` name one element, and a repeated element is many.`);
      }
    }
  }

  const node: TemplateNode = { type: 'element', tag: el.tagName, attrs, bindings, children, line };
  if (repeat) node.repeat = repeat;
  if (bindings.length > 0 || repeat) node.marker = ctx.marker++;
  return node;
}

/** Every element carrying `data-block-root`, with its line -- the marker the
 *  component-framework renderers cut the tree at. */
function findBlockRoots(nodes: readonly TemplateNode[]): Extract<TemplateNode, { type: 'element' }>[] {
  const out: Extract<TemplateNode, { type: 'element' }>[] = [];
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    if (node.attrs.some((a) => a.name === 'data-block-root')) out.push(node);
    out.push(...findBlockRoots(node.children));
  }
  return out;
}

function convertChildren(parent: P5Parent, ctx: Ctx, scope: string | undefined): TemplateNode[] {
  const out: TemplateNode[] = [];
  for (const child of childrenOf(parent)) {
    if (isElement(child)) {
      if (child.tagName === 'script') {
        const src = child.attrs.find((a) => a.name === 'src')?.value ?? '';
        fail(
          ctx,
          lineOf(child),
          `the page carries <script src="${src}">. Under the authored contract the entry script is GENERATED: put the wiring on the markup (spec 3.1) and the logic in <id>.controller.ts (spec 3.2).`,
        );
        continue;
      }
      out.push(convertElement(child, ctx, scope, true));
      continue;
    }
    if (child.nodeName === '#text') {
      const text = (child as DefaultTreeAdapterMap['textNode']).value;
      if (text.trim().length === 0) continue;
      out.push({ type: 'text', text });
      continue;
    }
    if (child.nodeName === '#comment') {
      out.push({ type: 'comment', text: (child as DefaultTreeAdapterMap['commentNode']).data });
    }
  }
  return out;
}

function collectKaiTags(nodes: readonly TemplateNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    if (node.tag.startsWith('kai-')) into.add(node.tag);
    collectKaiTags(node.children, into);
  }
}

export function parseTemplate(html: string, where: string): { template?: ParsedTemplate; errors: string[] } {
  const ctx: Ctx = { where, source: html, errors: [], refs: [], marker: 0 };
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const htmlEl = findChild(doc, 'html');
  const head = htmlEl && findChild(htmlEl, 'head');
  const body = htmlEl && findChild(htmlEl, 'body');
  if (!htmlEl || !head || !body) {
    return { errors: [`${where}: the block page needs <html>, <head> and <body>; the html form emits the whole document.`] };
  }

  // parse5 SYNTHESIZES html/head/body for a fragment, with a null
  // sourceCodeLocation on the synthesized node (measured: `parse('<!doctype
  // html><kai-thread>')` yields all three, head.sourceCodeLocation === null).
  // That is what keeps the fragment-shaped pages in the existing contract
  // tests parseable, and it is why every offset read below is optional.
  const headStart = head.sourceCodeLocation?.startTag?.endOffset ?? 0;
  const headEnd = head.sourceCodeLocation?.endTag?.startOffset ?? headStart;
  const headInner = html.slice(headStart, headEnd);

  const stylesheets: string[] = [];
  for (const link of childrenOf(head)) {
    if (!isElement(link) || link.tagName !== 'link') continue;
    if (link.attrs.find((a) => a.name === 'rel')?.value !== 'stylesheet') continue;
    const href = link.attrs.find((a) => a.name === 'href')?.value ?? '';
    if (href.startsWith('./')) stylesheets.push(href.slice(2));
  }

  const nodes = convertChildren(body, ctx, undefined);
  const kai = new Set<string>();
  collectKaiTags(nodes, kai);

  // Exactly one block root. Zero means a component renderer would emit the
  // host chrome the page carries so the html form is a runnable PAGE (the
  // "this blank page stands in for your site" paragraph); two has no answer.
  const roots = findBlockRoots(nodes);
  if (roots.length !== 1) {
    ctx.errors.push(
      roots.length === 0
        ? `${where}: no element carries \`data-block-root\`. Mark the ONE element that IS the block: the html and cdn forms render the whole page, and every component-framework renderer emits that subtree only (spec 3.1, as amended by PR B).`
        : `${where}: ${roots.length} elements carry \`data-block-root\` (lines ${roots.map((r) => r.line).join(', ')}). Exactly one element is the block.`,
    );
  }

  if (ctx.errors.length) return { errors: ctx.errors };
  return {
    template: {
      lang: htmlEl.attrs.find((a) => a.name === 'lang')?.value ?? 'en',
      bodyAttrs: body.attrs.map((a) => ({ name: a.name, value: a.value })),
      headInner,
      body: nodes,
      stylesheets,
      kaiTags: [...kai].sort(),
      refs: ctx.refs,
      markerCount: ctx.marker,
      blockRoot: roots[0],
    },
    errors: [],
  };
}

/** Every element node, document order -- what a renderer or a checker walks. */
export function walkElements(nodes: readonly TemplateNode[]): Extract<TemplateNode, { type: 'element' }>[] {
  const out: Extract<TemplateNode, { type: 'element' }>[] = [];
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    out.push(node);
    out.push(...walkElements(node.children));
  }
  return out;
}
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/parse-template.test.ts
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
```

Expected: both green. If the typecheck complains about `parse5` under `"types": []`, do NOT relax the option: it was measured compiling clean under exactly these options (see R1), so a red here means the import shape is wrong, not the config.

- [ ] **Step 7: Narrow the dependency rule in the README**

In `packages/blocks/README.md`, rewrite the "This package depends on nothing" section heading and first paragraph:

```markdown
## What this package may depend on

`src/registry.ts` depends on NOTHING -- not on `@kitn.ai/ui`, not on `zod`,
not on `node:*`. It is what `create-kai` bundle-imports for validation and
what `bundleGraphProblem` grades, and it stays a leaf.

`src/contract/**` and `src/forms/**` depend on `parse5`, and on nothing else.
The binding grammar is attributes on a tree with a scope in it, and a regex
cannot see a tree; the predecessor (`bodyToJsx`) refused everything it could
not translate, which was honest and does not scale to a grammar. parse5 ships
its own types, imports no `node:*` module, and compiles under this package's
`"types": []` / DOM-free `lib` (measured, both with and without
`skipLibCheck`), so neither tsconfig option relaxes for it.

The two facts the registry needs from the kit still arrive by injection:
```

Leave the injected-input table below it as it is.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): parse the authored binding grammar with parse5

src/contract/{types,parse-template}.ts: the whole grammar of spec 3.1 as
amended by 8b -- .prop, :attr, @event, #ref, *for with a mandatory :key,
seed:attr, .textContent -- with identifiers-never-expressions enforced and
every refusal naming the fix.

parse5 LOWERCASES attribute names, so `.textContent` arrives as
`.textcontent`. sourceCodeLocationInfo gives per-attribute offsets into the
original text, and the authored spelling is recovered from them before
anything is classified. Measured, with a fixture, not assumed.

The package's dependency rule narrows rather than breaks: src/registry.ts
stays a leaf; src/contract and src/forms may use parse5, which ships its own
types and compiles under this package's "types": [] and DOM-free lib.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 5: `src/contract/analyze-controller.ts`

**Files:**
- Create: `packages/blocks/src/contract/analyze-controller.ts`
- Create: `packages/blocks/tests/analyze-controller.test.ts`

**Interfaces:**
- Consumes: `ControllerShape` from `src/contract/types.ts` (Task 4).
- Produces: `analyzeController(source: string, componentName: string, where: string): { shape?: ControllerShape; errors: string[] }`. Task 6 uses `shape.actionNames`; Tasks 7 and 8 use `shape.name` to emit the adapter's type imports.

- [ ] **Step 1: Write the failing test**

`packages/blocks/tests/analyze-controller.test.ts`:

```ts
/**
 * The controller's DECLARED shape (spec 3.2). Not a TypeScript parser: this
 * reads only what the contract FIXES, and it is loud about everything else.
 * Anti-vacuity is the point -- an analyzer that finds nothing and says nothing
 * is worse than none, because the html form has no typecheck behind it.
 */
import { describe, expect, it } from 'vitest';
import { analyzeController } from '../src/contract/analyze-controller';

const GOOD = `
import type { ChatMessage } from '@kitn.ai/ui/state';

export interface WidgetState {
  messages: ChatMessage[];
  loading: boolean;
  backHidden: boolean;
}

export interface WidgetRefs {
  stack: KaiViewStackElement | null;
  dock: KaiDockElement | null;
}

export interface WidgetActions {
  back(): void;
  submit(event: CustomEvent<{ value: string }>): Promise<void>;
  boot(): Promise<void>;
}

export function createController(deps: WidgetDeps): WidgetController {
  return null as never;
}
`;

describe('analyzeController', () => {
  it('reads the state fields, the action names and the ref names', () => {
    const out = analyzeController(GOOD, 'Widget', 'fixture/w.controller.ts');
    expect(out.errors).toEqual([]);
    expect(out.shape).toEqual({
      name: 'Widget',
      stateFields: ['messages', 'loading', 'backHidden'],
      actionNames: ['back', 'submit', 'boot'],
      refNames: ['stack', 'dock'],
    });
  });

  it('ignores comments, including a commented-out member', () => {
    const out = analyzeController(GOOD.replace('  loading: boolean;', '  // loading: boolean;'), 'Widget', 'w');
    expect(out.shape?.stateFields).toEqual(['messages', 'backHidden']);
  });

  it('refuses a missing createController by name', () => {
    const out = analyzeController(GOOD.replace('export function createController', 'function createController'), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('export function createController(');
  });

  it('refuses a misnamed interface by naming the identifier it wanted', () => {
    const out = analyzeController(GOOD.replace('WidgetActions', 'WidgetHandlers'), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('export interface WidgetActions');
  });

  it('refuses an EMPTY actions block rather than reporting none', () => {
    const out = analyzeController(GOOD.replace(/export interface WidgetActions \{[\s\S]*?\n\}/, 'export interface WidgetActions {\n}'), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('declares no actions');
  });

  it('refuses an EMPTY state block for the same reason', () => {
    const out = analyzeController(GOOD.replace(/export interface WidgetState \{[\s\S]*?\n\}/, 'export interface WidgetState {\n}'), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('declares no state');
  });

  it('refuses an unterminated interface instead of silently reading to EOF', () => {
    const out = analyzeController(GOOD.replace('export interface WidgetRefs {', 'export interface WidgetRefs {{'), 'Widget', 'w');
    expect(out.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/analyze-controller.test.ts
```

Expected: FAIL, unresolved import.

- [ ] **Step 3: Write `src/contract/analyze-controller.ts`**

```ts
/**
 * The controller's DECLARED shape (spec 3.2), read off the source.
 *
 * WHY NOT A REAL PARSER. `packages/blocks` cannot depend on `typescript`
 * (create-kai bundles this source into its CLI and `bundleGraphProblem`
 * grades that bundle) and cannot depend on `esbuild` for the same reason --
 * and esbuild could not answer this question anyway: it reports RUNTIME
 * exports, and every name here except `createController` is a TYPE, erased
 * before a metafile exists.
 *
 * So this reads only what the CONTRACT FIXES: three interfaces named after
 * the block, and one exported factory. Fixing those names is what makes the
 * react adapter generatable at all, so a wrong name is an error that says
 * which identifier it wanted.
 *
 * ANTI-VACUITY IS THE POINT. An empty result is a HARD ERROR, never a quiet
 * empty list: the html form has no typecheck behind it, so this is the only
 * thing standing between a typo and `actions.bck is not a function` at
 * runtime. For the react form tsc is the backstop and this is the early,
 * legible failure.
 */
import type { ControllerShape } from './types';

/** Strip line and block comments without touching string contents. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      if (ch === '\\') { out += '  '; i += 2; continue; }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i += 1; continue; }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      out += '  ';
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      i += 2;
      out += '  ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** The body of `export interface <name> { ... }`, brace-matched, or null. */
function interfaceBody(source: string, name: string): string | null {
  const head = new RegExp(`export\\s+interface\\s+${name}\\s*\\{`).exec(source);
  if (!head) return null;
  let depth = 1;
  let i = head.index + head[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return source.slice(start, i - 1);
}

/** Member names of an interface body: `name:`, `name?:`, `name(`. */
function memberNames(body: string): string[] {
  const names: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*[:(]/.exec(line);
    if (m && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

export function analyzeController(
  source: string,
  componentName: string,
  where: string,
): { shape?: ControllerShape; errors: string[] } {
  const errors: string[] = [];
  const code = stripComments(source);

  if (!/export\s+function\s+createController\s*\(/.test(code)) {
    errors.push(`${where}: no \`export function createController(\`. The controller contract (spec 3.2) is one factory returning { state, actions, subscribe }.`);
  }

  const read = (suffix: string, label: string): string[] => {
    const name = `${componentName}${suffix}`;
    const body = interfaceBody(code, name);
    if (body === null) {
      errors.push(`${where}: no \`export interface ${name}\` (or its braces do not close). The generated adapters import that exact name, derived from the block id, so it is fixed by the contract.`);
      return [];
    }
    const members = memberNames(body);
    if (members.length === 0) {
      errors.push(`${where}: \`${name}\` declares no ${label}. An empty ${label} block is a hard error, not an empty result: nothing downstream can tell it apart from a shape this analyzer failed to read.`);
    }
    return members;
  };

  const stateFields = read('State', 'state');
  const actionNames = read('Actions', 'actions');
  const refNames = read('Refs', 'refs');

  if (errors.length) return { errors };
  return { shape: { name: componentName, stateFields, actionNames, refNames }, errors: [] };
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/analyze-controller.test.ts
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
```

Expected: both green.

- [ ] **Step 5: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): read the controller's declared shape

analyzeController reads what spec 3.2 FIXES -- <Name>State, <Name>Actions,
<Name>Refs and `export function createController(` -- so the renderers can
emit an adapter that imports those exact names, and so a binding pointing at
an action nobody exports fails at generation time.

Not a TypeScript parser and not esbuild's metafile: the package cannot
depend on either (create-kai bundles this source and bundleGraphProblem
grades the bundle), and a metafile reports runtime exports while every name
here but one is an erased type. It is a brace-matched read over
contract-fixed declarations, and an empty result is a hard error.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 6: the contract checks, extended

**Files:**
- Modify: `packages/blocks/src/registry.ts` (`checkBlockContracts`)
- Modify: `packages/blocks/tests/registry.test.ts` (the "contract checks" describe)
- Modify: `packages/ui/scripts/verify-blocks.mjs` (`--self-test`, class 2)

**Interfaces:**
- Consumes: `parseTemplate` (Task 4), `analyzeController` (Task 5), `componentName` (already in `forms.ts`; move it to `src/contract/types.ts`? No -- import it from `../forms` would be a cycle, so `checkBlockContracts` takes the component name it derives with a two-line local `pascal()` helper, and Task 7 makes `componentName` call the same helper).
- Produces: `checkBlockContracts` additionally refuses a non-scalar in `:`/`seed:` attribute position, surfaces every `parseTemplate` error, and cross-checks `@`/`#ref` against the controller.

**A transitional rule, stated so nobody reads it as a hole.** Until Task 12 converts the other two blocks, a block is an "authored-contract block" when its page carries at least one binding-prefixed attribute. Only those get the grammar and controller checks; the two unconverted blocks keep passing the old checks. Task 12 makes the contract mandatory for every block and deletes the conditional.

- [ ] **Step 1: Write the failing tests**

The "contract checks (each plant watched being caught)" describe in `packages/blocks/tests/registry.test.ts` already has ONE helper, `blockWith(files)` at `:272`, which takes `{ name, content }[]` and makes the FIRST file the `registry:page`. Use it, and add two page helpers beside it rather than inventing a `check(bodyHtml)` that does not exist:

```ts
  /** A full authored page around `body`, with the block root the contract
   *  requires. `demo` is the synthetic block's name, so the controller the
   *  checks look for is `demo.controller.ts` and its types are `Demo*`. */
  const pageOf = (body: string) =>
    `<!doctype html>\n<html lang="en"><head></head><body><div data-block-root>${body}</div></body></html>`;

  /** A controller of the contract shape, with the members the case needs. */
  const controllerOf = (opts: { actions?: string[]; refs?: string[]; state?: string[] }) =>
    [
      `export interface DemoState { ${(opts.state ?? ['ready']).map((f) => `${f}: boolean;`).join(' ')} }`,
      `export interface DemoRefs { ${(opts.refs ?? ['dock']).map((r) => `${r}: unknown;`).join(' ')} }`,
      `export interface DemoActions { ${[...(opts.actions ?? ['open']), 'boot'].map((a) => `${a}(): void;`).join(' ')} }`,
      `export function createController(deps: unknown) { return deps as never; }`,
      '',
    ].join('\n');

  const contractErrors = (body: string, controller?: string) =>
    checkBlockContracts(
      blockWith([
        { name: 'demo.html', content: pageOf(body) },
        ...(controller ? [{ name: 'demo.controller.ts', content: controller }] : []),
      ]),
      NONSCALAR,
    );

  it('catches a non-scalar prop in : attribute position (the prefix used to slip past the scan)', () => {
    expect(contractErrors('<kai-thread :messages="messages"></kai-thread>', controllerOf({})).join(' '))
      .toContain('non-scalar prop "messages"');
  });

  it('catches a non-scalar prop in seed: attribute position, for the same reason', () => {
    expect(contractErrors('<kai-thread seed:messages="[]"></kai-thread>', controllerOf({})).join(' '))
      .toContain('non-scalar prop "messages"');
  });

  it('accepts the same prop in .prop position, which is what a rich binding looks like', () => {
    expect(contractErrors('<kai-thread .messages="messages"></kai-thread>', controllerOf({ state: ['messages'] })))
      .toEqual([]);
  });

  it('surfaces a grammar error from the page (one owner for the grammar)', () => {
    expect(contractErrors('<kai-button :hidden="!drilled"></kai-button>', controllerOf({})).join(' '))
      .toContain('never an expression');
  });

  it('catches an @ binding pointing at an action the controller does not export', () => {
    const errs = contractErrors('<kai-button @kai-click="bak"></kai-button>', controllerOf({ actions: ['back'] }));
    expect(errs.join(' ')).toContain('@kai-click="bak"');
    expect(errs.join(' ')).toContain('back');
  });

  it('catches a #ref the controller does not declare in its Refs', () => {
    const errs = contractErrors('<kai-dock #ref="dok"></kai-dock>', controllerOf({ refs: ['dock'] }));
    expect(errs.join(' ')).toContain('#ref="dok"');
  });

  it('refuses a page with bindings and no controller', () => {
    expect(contractErrors('<kai-button @kai-click="open"></kai-button>').join(' '))
      .toContain('demo.controller.ts');
  });
```

`blockWith` runs the source through `discoverOne` and asserts zero validation errors, so the synthetic manifest has to stay valid: the extra controller file is listed as a `registry:file` by the helper's own mapping, which is what makes it visible to `checkBlockContracts`.

- [ ] **Step 2: Run them and watch them fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/registry.test.ts -t 'contract checks'
```

Expected: six FAILs. The `:messages` and `seed:messages` cases fail because the attribute-position regex requires whitespace immediately before the prop name, so a prefixed spelling walks past it. The others fail because the checks do not exist.

- [ ] **Step 3: Fix the attribute-position scan**

In `checkBlockContracts`, replace the attribute regex:

```ts
          // The prefix is part of the match, not skipped by it. `:messages=`
          // and `seed:messages=` are a non-scalar in ATTRIBUTE position
          // exactly as a bare `messages=` is; only `.prop=` and `*for=`
          // legitimately carry a non-scalar (spec 3.1, amendment 8a.2). The
          // old form required whitespace immediately before the name, so
          // every prefixed spelling slipped past it.
          const attrRe = new RegExp(`(?:^|\\s)(?::|seed:)?(?:${prop}|${kebab(prop)})\\s*=`, 'i');
```

- [ ] **Step 4: Add the grammar and controller cross-checks**

Still in `checkBlockContracts`, after the per-file loop:

```ts
  // The GRAMMAR has one owner. Rather than restating the binding rules here,
  // parse the page and surface what the parser says; a block that is not on
  // the authored contract yet (no binding-prefixed attribute anywhere) is
  // skipped, which is what carries the unconverted blocks through the
  // conversion round.
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
  const pageHtml = pageEntry ? block.files.get(pageEntry.path) : undefined;
  if (pageEntry && pageHtml !== undefined && /\s(?:seed:|[.:@#*])[\w-]+\s*=/.test(pageHtml)) {
    const where = `${block.name}/${pageEntry.path}`;
    const parsed = parseTemplate(pageHtml, where);
    errors.push(...parsed.errors);

    const name = pascal(block.name);
    const controllerPath = `${block.name}.controller.ts`;
    const controllerSource = block.files.get(controllerPath);
    if (controllerSource === undefined) {
      errors.push(`${block.name}: the page declares bindings, so the block needs ${controllerPath} (spec 3.2). The wiring moved off the script and onto the markup; the logic lives in the controller.`);
    } else if (parsed.template) {
      const shape = analyzeController(controllerSource, name, `${block.name}/${controllerPath}`);
      errors.push(...shape.errors);
      if (shape.shape) errors.push(...crossCheckBindings(parsed.template, shape.shape, where));
    }
  }
```

**The cross-check is a FUNCTION, and that is the point of this step.** `create-kai add` and `kai dev` never call `checkBlockContracts` -- they call a renderer -- so an inline check here would leave both front doors emitting a tree that calls a function nobody exports. It goes in `src/contract/analyze-controller.ts`, beside the analyzer whose output it consumes, and Tasks 7 and 8 call it from `renderHtmlForm` and `renderReactForm`:

```ts
/** The page's `@` and `#ref` bindings against the controller's declared
 *  names. Called by `checkBlockContracts` (the gate) AND by every renderer,
 *  so `create-kai add` and `kai dev` refuse the same page by name instead of
 *  emitting a tree that calls a function nobody exports. */
export function crossCheckBindings(template: ParsedTemplate, shape: ControllerShape, where: string): string[] {
  const errors: string[] = [];
  for (const el of walkElements(template.body)) {
    for (const b of el.bindings) {
      if (b.kind === 'event' && !shape.actionNames.includes(b.value)) {
        errors.push(`${where}:${b.line}: ${b.raw}="${b.value}" names no action. ${shape.name}Actions declares: ${shape.actionNames.join(', ')}.`);
      }
      if (b.kind === 'ref' && !shape.refNames.includes(b.value)) {
        errors.push(`${where}:${b.line}: #ref="${b.value}" is not in ${shape.name}Refs, so the controller can never reach it. ${shape.name}Refs declares: ${shape.refNames.join(', ')}.`);
      }
    }
  }
  return errors;
}
```

with, at the top of `registry.ts`:

```ts
import { parseTemplate } from './contract/parse-template';
import { analyzeController, crossCheckBindings } from './contract/analyze-controller';

/** kebab-or-plain block name to its component name: support-widget -> SupportWidget.
 *  ONE definition; `componentName` in src/forms/index.ts re-exports it. */
export function pascal(blockName: string): string {
  return blockName.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}
```

- [ ] **Step 5: Run the suite and watch it pass**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && grep -n "^import" packages/blocks/src/registry.ts
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run verify:pack
cd "$WT" && pnpm --filter create-kai exec vitest run
```

Expected: green. `registry.ts` now imports from `./contract/*`, which is the one place the leaf rule bends -- **and it must not bend further**: it still imports nothing outside this package except `parse5`, transitively, through those two modules.

**The create-kai build and its pack shape are in this step deliberately.** `create-kai` bundle-imports `registry.ts`, so this is the commit where parse5 enters its CLI bundle. `bundleGraphProblem` grades the esbuild metafile's input keys against path-shaped ban rules (`node_modules/zod/`, `mcp/mcp/`), and `node_modules/parse5/` matches neither, so the expected result is green -- but expected is not measured, and if it goes red the finding is about scope, not about a nuisance. Read the bundle size the build prints and note it in the commit body.

- [ ] **Step 6: Plant the new classes in `verify-blocks --self-test`**

In `packages/ui/scripts/verify-blocks.mjs`, class 2, add three plants beside the two that are there:

```js
    // The prefixed spellings of the same defect. `:messages=` and
    // `seed:messages=` are a non-scalar in ATTRIBUTE position exactly as a
    // bare `messages=` is; the scan used to require whitespace immediately
    // before the name, so both walked past it (spec 8a, amendment 2).
    for (const spelling of [':messages', 'seed:messages']) {
      const planted = {
        name: 'planted',
        manifest: { name: 'planted', title: 'P', description: 'p', type: 'registry:block', files: [{ path: 'page.html', type: 'registry:page' }] },
        files: new Map([['page.html', `<!doctype html><html lang="en"><head></head><body><kai-thread ${spelling}="messages"></kai-thread></body></html>`]]),
      };
      const errs = registry.checkBlockContracts(planted, nonscalarByTag);
      check(`contract violation detected (non-scalar in "${spelling}" position)`, errs.some((e) => /non-scalar prop "messages"/.test(e)), errs.join(' | '));
    }

    // A list binding with no :key. Mandatory, because the kai- reactivity
    // contract is reference-keyed (spec 8b, amendment 1).
    {
      const planted = {
        name: 'planted',
        manifest: { name: 'planted', title: 'P', description: 'p', type: 'registry:block', files: [{ path: 'page.html', type: 'registry:page' }] },
        files: new Map([['page.html', `<!doctype html><html lang="en"><head></head><body><kai-conversations><kai-conversation-item *for="row of rows"></kai-conversation-item></kai-conversations></body></html>`]]),
      };
      const errs = registry.checkBlockContracts(planted, nonscalarByTag);
      check('contract violation detected (*for with no :key)', errs.some((e) => /:key is mandatory/.test(e)), errs.join(' | '));
    }
```

- [ ] **Step 7: Watch every planted class get caught**

```bash
cd "$WT/packages/ui" && npm run verify:blocks
```

Expected: the `--self-test` half prints `SELF-TEST OK` for each class including the three new ones, then the real gate runs green. If a plant prints `SELF-TEST RED`, the check does not catch it and the fix is the check, never the plant.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the contract checks learn the binding grammar

checkBlockContracts gains four refusals, each planted in
verify-blocks --self-test and watched being caught:

- a non-scalar prop in `:attr` or `seed:attr` position, which the old
  attribute-position scan walked past because it required whitespace
  immediately before the prop name (spec 8a, amendment 2);
- every parseTemplate error, surfaced rather than restated: the grammar has
  ONE owner, and a second copy of it here is how the two drift;
- an @ binding naming an action the controller does not export, and a #ref
  the controller's Refs does not declare.

Transitional, until the other two blocks convert: a page with no
binding-prefixed attribute is not an authored-contract page and is skipped.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 7: the `html` renderer and its generated binder

**Files:**
- Create: `packages/blocks/src/forms/index.ts` (the module `./forms` now resolves to), `packages/blocks/src/forms/html.ts`
- Delete: `packages/blocks/src/forms.ts` (its surviving contents move into `src/forms/index.ts`)
- Modify: `packages/blocks/package.json` (the `./forms` key points at `./src/forms/index.ts`)
- Modify: `packages/ui/mcp/construct/dev.ts` (the form route catches a render refusal instead of throwing) and `packages/ui/mcp/construct/dev.test.ts:695-706,777-787` (the synthetic block gains a controller; the `(async () => {` assertion becomes the readiness line; the react file list loses the two typing files)
- Create: `packages/blocks/tests/html-form.test.ts`

**Interfaces:**
- Consumes: `parseTemplate`, `walkElements`, `ParsedTemplate` (Task 4); `analyzeController` (Task 5); `fileTarget` (Task 3).
- Produces:
  - `renderHtmlForm(block: Block): FormFile[]`
  - `renderBinder(opts: { blockName: string; template: ParsedTemplate; shape: ControllerShape }): string`
  - `serializeTemplate(template: ParsedTemplate, opts: { entryScript: string }): string`
  - `withStrippedTwins(block: Block, strip: (source: string, fileName: string) => string): Block`
  - unchanged for every caller, and re-exported from `src/forms/index.ts`: `BLOCK_FORMS`, `BlockFormId`, `isBlockFormId`, `FormFile` (defined in `src/contract/types.ts`), `renderBlockForm`, `componentName`, `kaiTagsIn`, `adaptRegistrationForBundler` (defined in `src/forms/html.ts`), `moduleScriptsIn`, `stylesheetsIn`. **Nothing under `src/forms/` imports `./index`**: the barrel re-exports every renderer, so a renderer importing it is a cycle.
  - DELETED: `bodyToJsx`, `wrapEntryScript`, `wrapHtmlEntryScript`, `renderComponent`, `renderJsxTypings`, `renderEntryTypings` (Task 8 removes their last callers; leave them in place for this task and delete them there, so this task's diff is additive).

**Two contract additions this task makes, folded into spec 3.2 by Task 13:**

1. **`boot()` is a required action.** It is the mount hook every host calls after wiring (the spike's A2 has it, and the html form has nowhere else to hydrate from storage). `analyzeController` gains one line refusing an `Actions` block without it, and the binder awaits it before signalling readiness.
2. **The serializer emits ASCII.** Every non-ASCII code point in text and in attribute values is re-encoded as a numeric character reference, so the authored `&#x1F44B;` round-trips as an escape rather than becoming a literal emoji inside a generated file.

- [ ] **Step 1: Write the shared fixture, then the failing test**

Both renderer suites -- this one and Task 8's react one -- read ONE fixture block off disk, because two renderers disagreeing about one source is the defect class this round exists to remove and two hand-written fixtures could disagree quietly. Add `esbuild` to `packages/blocks`'s **devDependencies** first (never `dependencies`: it is used by the suite only, so it never enters the CLI bundle `bundleGraphProblem` grades), then `pnpm install`.

`packages/blocks/tests/fixtures/fixture.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./fixture.css" />
  </head>
  <body>
    <p class="host-stand-in">stand-in</p>
    <kai-dock data-block-root #ref="dock" seed:position="bottom-end" .unread="hidden" @kai-click="open">
      <span .textContent="title"></span>
      <kai-conversations>
        <kai-conversation-item *for="row of rows" :key="row.id" :unread="row.unread">
          <span .textContent="row.title"></span>
        </kai-conversation-item>
      </kai-conversations>
    </kai-dock>
  </body>
</html>
```

`packages/blocks/tests/fixtures/fixture.controller.ts` -- **multi-line interfaces on purpose.** The "no TypeScript survived into the shipped .js" case is only worth anything if the strip has something to remove that a naive helper would leave behind:

```ts
export interface FixtureState {
  title: string;
  hidden: boolean;
  rows: { id: string; title: string; unread: boolean }[];
}

export interface FixtureRefs {
  dock: unknown;
}

export interface FixtureActions {
  open(): void;
  boot(): Promise<void>;
}

export function createController(deps: { refs: () => FixtureRefs }) {
  return deps as never;
}
```

`packages/blocks/tests/fixtures/fixture.css`:

```css
.host-stand-in { color: #555; }
```

Then `packages/blocks/tests/html-form.test.ts`:

```ts
/**
 * The html form: the authored page with the bindings taken OFF the markup and
 * a generated binder that puts them back at runtime. What is pinned here is
 * the shape of that binder, because it is the file with no typecheck behind
 * it anywhere.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { renderHtmlForm, withStrippedTwins } from '../src/forms';
import type { Block } from '../src/registry';

const FIXTURES = resolve(__dirname, 'fixtures');

// THE SHARED FIXTURE. Both renderer suites read the same page and the same
// controller from `packages/blocks/tests/fixtures/`, because two renderers
// disagreeing about one source is the defect class this whole round exists to
// remove, and two hand-written fixtures could disagree quietly.
//
//   packages/blocks/tests/fixtures/fixture.html
//   packages/blocks/tests/fixtures/fixture.controller.ts
//   packages/blocks/tests/fixtures/fixture.css
//
// The controller is a REAL multi-line TypeScript file, not a one-liner: the
// "no TypeScript survived into the shipped .js" assertion below is only worth
// anything if the strip has something to remove that a naive helper would
// leave behind.
const CONTROLLER = readFileSync(join(FIXTURES, 'fixture.controller.ts'), 'utf8');

const PAGE = readFileSync(join(FIXTURES, 'fixture.html'), 'utf8');

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

// The strip is esbuild's, the same transform gen-blocks runs. A hand-rolled
// regex here is how the "no TypeScript in the shipped .js" case below passes
// VACUOUSLY: the obvious `/export interface[\s\S]*?\n\}\n/g` never matches a
// single-line interface, so it removes nothing, and the assertion then holds
// because the fixture had no multi-line types rather than because anything
// was stripped. `esbuild` is a DEVDEPENDENCY of packages/blocks (added in this
// task), never a dependency: it is used by this suite only, so it never
// reaches the CLI bundle that `bundleGraphProblem` grades.
const stripped = () =>
  withStrippedTwins(block(), (source, fileName) =>
    transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: fileName }).code,
  );
const byPath = (files: { path: string; content: string }[]) => new Map(files.map((f) => [f.path, f.content]));

describe('the html form', () => {
  it('refuses to render without the stripped twin, and names the generator', () => {
    expect(() => renderHtmlForm(block())).toThrow(/fixture\.controller\.js/);
    expect(() => renderHtmlForm(block())).toThrow(/gen-blocks/);
  });

  it('emits the page, the binder, the stripped controller and the css', () => {
    const files = byPath(renderHtmlForm(stripped()));
    expect([...files.keys()].sort()).toEqual(['fixture.controller.js', 'fixture.css', 'fixture.html', 'fixture.js']);
  });

  it('targets every file at blocks/<id>/', () => {
    for (const file of renderHtmlForm(stripped())) {
      expect(file.target).toBe(`blocks/fixture/${file.path}`);
    }
  });

  it('takes every binding OFF the markup and leaves the literals', () => {
    const page = byPath(renderHtmlForm(stripped())).get('fixture.html')!;
    expect(page).not.toMatch(/\.unread=|@kai-click=|#ref=|\*for=|:key=|seed:/);
    expect(page).toContain('data-kai-b="0"');
    expect(page).toContain('<link rel="stylesheet" href="./fixture.css" />');
    expect(page).toContain('<script type="module" src="./fixture.js"></script>');
  });

  it('turns the repeated element into a template the binder clones', () => {
    const page = byPath(renderHtmlForm(stripped())).get('fixture.html')!;
    expect(page).toMatch(/<template data-kai-for="\d+">\s*<kai-conversation-item/);
  });

  it('binds registration and the whenDefined await, and adapts the import for a bundler', () => {
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    expect(binder).toContain("import '@kitn.ai/ui/elements';");
    expect(binder).not.toContain('@kitn.ai/ui/autoloader');
    expect(binder).toContain('customElements.whenDefined');
    expect(binder).toContain("'kai-conversation-item'");
  });

  it('writes the seed once, before the first apply, and never inside apply()', () => {
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    const seedAt = binder.indexOf("'position'");
    const applyAt = binder.indexOf('function apply(');
    expect(seedAt).toBeGreaterThan(-1);
    expect(seedAt).toBeLessThan(applyAt);
  });

  it('signals the driver readiness convention as its last statement', () => {
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    expect(binder.trimEnd().endsWith('window.__blockReady = true;')).toBe(true);
    expect(binder.indexOf('actions.boot()')).toBeLessThan(binder.indexOf('__blockReady'));
  });

  it('wires a row descendant INSIDE the row and NOT at document scope', () => {
    // The defect this asserts: walkElements is flat, so a document-scope loop
    // that skips only the repeated element still emits `at(N).textContent =`
    // for a <span> that exists only inside the <template>. at(N) is null
    // there and the first apply() throws. Both halves are asserted, because
    // asserting only the row half passes with the duplicate still present.
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    const applyBody = binder.slice(binder.indexOf('function apply('), binder.indexOf('controller.subscribe'));
    const rowBody = binder.slice(binder.indexOf('function applyRows'), binder.indexOf('function apply('));
    expect(applyBody).not.toContain('row.title');
    expect(applyBody).toContain('applyRows');
    expect(rowBody).toContain('row.title');
    expect(rowBody).toContain('inRow(node,');
  });

  it('removes an attribute on false/null/undefined and NOT on 0 or the empty string', () => {
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    const setAttr = binder.slice(binder.indexOf('const setAttr'), binder.indexOf('const controller'));
    expect(setAttr).toContain("value === false || value === null || value === undefined");
    expect(setAttr).not.toContain("value === ''");
  });

  it('carries no TypeScript into the shipped .js files', () => {
    const files = byPath(renderHtmlForm(stripped()));
    for (const name of ['fixture.js', 'fixture.controller.js']) {
      expect(files.get(name)).not.toMatch(/^\s*(?:export\s+)?(?:interface|type)\s/m);
      expect(files.get(name)).not.toMatch(/:\s*(?:string|boolean|number)\s*[;,)]/);
    }
    // Anti-vacuity: the SOURCE has to contain what the strip removes, or this
    // case holds for the wrong reason.
    expect(CONTROLLER).toMatch(/^export interface /m);
  });

  it('re-encodes non-ASCII rather than emitting a literal astral character', () => {
    const b = block();
    b.files.set('fixture.html', PAGE.replace('<span .textContent="title"></span>', '<span>Hi &#x1F44B;</span>'));
    const page = byPath(renderHtmlForm(withStrippedTwins(b, (s) => s))).get('fixture.html')!;
    expect(page).toContain('&#x1f44b;');
    expect(/[\u{10000}-\u{10FFFF}]/u.test(page)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/html-form.test.ts
```

Expected: FAIL -- `renderHtmlForm` still renders the old imperative form and `withStrippedTwins` does not exist.

- [ ] **Step 3: Create the `src/forms/` directory and move the survivors**

```bash
cd "$WT" && mkdir -p packages/blocks/src/forms
cd "$WT" && git mv packages/blocks/src/forms.ts packages/blocks/src/forms/index.ts
```

Fix the relative import inside it (`./registry` becomes `../registry`), point `packages/blocks/package.json`'s `./forms` key at `./src/forms/index.ts`, and add the two new exports:

```ts
export { renderHtmlForm, renderBinder, serializeTemplate } from './html';
export { pascal as componentName } from '../registry';
```

deleting the old local `componentName` so there is one definition.

- [ ] **Step 4: Write `withStrippedTwins` in `src/forms/index.ts`**

```ts
/**
 * Add a `<name>.js` twin beside every `<name>.ts` file the block ships.
 *
 * WHERE THE STRIP HAPPENS, and why not here: the controller is TypeScript and
 * the html and cdn forms land in contexts with no build step, so the types
 * have to come off. This package cannot strip them -- it depends on nothing
 * that can -- and neither of the two RUNTIME renderers can either: the kai dev
 * gallery route runs inside the published @kitn.ai/ui CLI (esbuild is a
 * devDependency there) and `create-kai add` runs on Node >= 20.19, which
 * predates `module.stripTypeScriptTypes`. And "each caller strips with what it
 * has" makes this module's central claim false, because two strippers emit two
 * different files.
 *
 * So the strip runs ONCE, at generation time, with esbuild, and the twin
 * TRAVELS with the block: packages/ui/scripts/gen-blocks.mjs writes it into
 * the emitted item JSON, and packages/create-kai/scripts/build.mjs writes it
 * beside the copied source. Everything downstream just reads the file.
 */
export function withStrippedTwins(block: Block, strip: (source: string, fileName: string) => string): Block {
  const files = new Map(block.files);
  const manifestFiles = [...block.manifest.files];
  for (const entry of block.manifest.files) {
    if (!entry.path.endsWith('.ts')) continue;
    const twin = entry.path.replace(/\.ts$/, '.js');
    if (files.has(twin)) continue;
    files.set(twin, strip(block.files.get(entry.path) ?? '', entry.path));
    manifestFiles.push({ path: twin, type: 'registry:file' });
  }
  return { name: block.name, manifest: { ...block.manifest, files: manifestFiles }, files };
}
```

- [ ] **Step 5: Write `src/forms/html.ts`**

Three parts: the serializer, the binder emitter, and the form.

```ts
/**
 * The html delivery form: the authored page with its bindings taken OFF the
 * markup, plus a GENERATED binder that puts them back at runtime. This is the
 * form `create-kai add` writes into a project with no framework, and the form
 * the cdn single-file paste is inlined from.
 *
 * The binder is the only file in this repo with no typecheck behind it
 * anywhere, which is why so much of the contract is checked before it is
 * emitted (the grammar in parse-template, the action and ref names in
 * analyze-controller) and why `verify:blocks [html-binder]` re-checks the
 * emitted artifact.
 */
import { parseTemplate, walkElements } from '../contract/parse-template';
import { analyzeController, crossCheckBindings } from '../contract/analyze-controller';
import type { ControllerShape, ParsedTemplate, TemplateNode } from '../contract/types';
import { fileTarget } from '../targets';
import { pascal, type Block } from '../registry';
import type { FormFile } from '../contract/types';

// NO import from './index': index.ts re-exports this module, so a renderer
// importing the barrel is a cycle. `adaptRegistrationForBundler` therefore
// lives here (it is about this form's registration line) and index.ts
// re-exports it for the callers that already import it by name.
export function adaptRegistrationForBundler(js: string): string {
  return js.replace(
    /import\s+['"]@kitn\.ai\/ui\/autoloader['"];?/g,
    `import '@kitn.ai/ui/elements'; // add form: register-all (the autoloader is CDN-only and 404s through a bundler)`,
  );
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Emit ASCII: a generated file never carries a literal astral character. */
const ascii = (s: string): string =>
  [...s].map((ch) => (ch.codePointAt(0)! > 127 ? `&#x${ch.codePointAt(0)!.toString(16)};` : ch)).join('');
const escText = (s: string): string => ascii(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
const escAttr = (s: string): string => ascii(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

function serializeNode(node: TemplateNode, pad: string): string {
  if (node.type === 'text') return `${pad}${escText(node.text.trim())}`;
  if (node.type === 'comment') return `${pad}<!--${escText(node.text)}-->`;
  const attrs = node.attrs.map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${escAttr(a.value)}"`)).join('');
  const marker = node.marker === undefined ? '' : ` data-kai-b="${node.marker}"`;
  const open = `<${node.tag}${attrs}${marker}>`;
  const body = node.children.map((c) => serializeNode(c, `${pad}  `)).filter(Boolean).join('\n');
  const element = VOID_TAGS.has(node.tag)
    ? `${pad}${open.slice(0, -1)} />`
    : body
      ? `${pad}${open}\n${body}\n${pad}</${node.tag}>`
      : `${pad}${open}</${node.tag}>`;
  // A repeated element ships inside a <template>: the binder clones it once
  // per row and keys the clones. Templates never render, so the parent element
  // sees exactly the rows and nothing else.
  return node.repeat ? `${pad}<template data-kai-for="${node.marker}">\n${element.replace(/^/gm, '  ')}\n${pad}</template>` : element;
}

export function serializeTemplate(template: ParsedTemplate, opts: { entryScript: string }): string {
  const bodyAttrs = template.bodyAttrs.map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${escAttr(a.value)}"`)).join('');
  return [
    '<!doctype html>',
    `<html lang="${escAttr(template.lang)}">`,
    '  <head>',
    template.headInner.trim().split('\n').map((l) => `  ${l.trim()}`).join('\n'),
    '  </head>',
    `  <body${bodyAttrs}>`,
    template.body.map((n) => serializeNode(n, '    ')).filter(Boolean).join('\n'),
    `    <script type="module" src="./${opts.entryScript}"></script>`,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}
```

and the binder:

```ts
const jsString = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** `state.field` or, inside a `*for`, `row.field`. */
const readOf = (value: string, scope: string | undefined): string =>
  scope && value.startsWith(`${scope}.`) ? value : `state.${value}`;

function applyLines(el: Extract<TemplateNode, { type: 'element' }>, target: string, scope: string | undefined): string[] {
  const out: string[] = [];
  for (const b of el.bindings) {
    switch (b.kind) {
      case 'prop':
        out.push(`  ${target}.${b.name} = ${readOf(b.value, scope)};`);
        break;
      case 'attr':
        out.push(`  setAttr(${target}, ${jsString(b.name)}, ${readOf(b.value, scope)});`);
        break;
      case 'event':
      case 'ref':
      case 'seed':
        break; // wired once, outside apply()
      default: {
        // A seventh binding kind must not be dropped here in silence: this
        // function decides what gets re-applied, and a kind nobody re-applies
        // is a binding that renders once and then goes stale.
        const never: never = b.kind;
        throw new Error(`applyLines: unhandled binding kind "${String(never)}"`);
      }
    }
  }
  return out;
}

export function renderBinder(opts: { blockName: string; template: ParsedTemplate; shape: ControllerShape }): string {
  const { template, shape } = opts;
  const elements = walkElements(template.body);

  // EVERY element inside a repeat subtree is wired INSIDE the row, never at
  // document scope. `walkElements` is FLAT: it returns a repeated element's
  // descendants too, so a loop that skipped only the repeated element would
  // still emit `at(9).textContent = ...` for a <span> that exists only inside
  // a <template>. `at(9)` is null there, and the first apply() throws.
  const rowScoped = new Set<number>();
  for (const el of elements) {
    if (!el.repeat) continue;
    for (const inner of walkElements(el.children)) {
      if (inner.marker !== undefined) rowScoped.add(inner.marker);
    }
  }
  const documentScope = elements.filter((el) => !el.repeat && (el.marker === undefined || !rowScoped.has(el.marker)));

  const refs = documentScope.flatMap((el) => el.bindings.filter((b) => b.kind === 'ref').map((b) => `${b.name}: at(${el.marker})`));
  const seeds: string[] = [];
  const listeners: string[] = [];
  const applies: string[] = [];
  const rowBlocks: string[] = [];

  for (const el of documentScope) {
    const target = `at(${el.marker})`;
    for (const b of el.bindings) {
      if (b.kind === 'seed') seeds.push(`setAttr(${target}, ${jsString(b.name)}, ${jsString(b.value)});`);
      if (b.kind === 'event') listeners.push(`${target}.addEventListener(${jsString(b.name)}, (event) => controller.actions.${b.value}(event));`);
    }
    applies.push(...applyLines(el, target, undefined));
  }

  for (const el of elements) {
    if (!el.repeat) continue;
    const n = el.marker as number;
    const rows = walkElements([el]); // the repeated element AND its descendants
    const setters = rows.flatMap((row) => applyLines(row, `inRow(node, ${row.marker})`, el.repeat!.item));
    const rowListeners = rows.flatMap((row) =>
      row.bindings.filter((b) => b.kind === 'event').map((b) => `      inRow(node, ${row.marker}).addEventListener(${jsString(b.name)}, (event) => controller.actions.${b.value}(event));`),
    );
    rowBlocks.push(
      [
        `const rowTemplate${n} = document.querySelector('template[data-kai-for="${n}"]');`,
        `const rowParent${n} = rowTemplate${n}.parentElement;`,
        `function applyRows${n}(rows) {`,
        `  const existing = new Map();`,
        `  for (const node of rowParent${n}.querySelectorAll(':scope > [data-kai-row="${n}"]')) existing.set(node.getAttribute('data-kai-key'), node);`,
        `  let prev = rowTemplate${n};`,
        `  for (const ${el.repeat.item} of rows) {`,
        `    const key = String(${el.repeat.key});`,
        `    let node = existing.get(key);`,
        `    if (node) existing.delete(key);`,
        `    else {`,
        `      node = rowTemplate${n}.content.firstElementChild.cloneNode(true);`,
        `      node.setAttribute('data-kai-row', '${n}');`,
        `      node.setAttribute('data-kai-key', key);`,
        ...rowListeners,
        `    }`,
        ...setters.map((l) => `  ${l}`),
        `    if (prev.nextElementSibling !== node) prev.after(node);`,
        `    prev = node;`,
        `  }`,
        `  for (const stale of existing.values()) stale.remove();`,
        `}`,
      ].join('\n'),
    );
    applies.push(`  applyRows${n}(state.${el.repeat.list});`);
  }

  const body = [
    `// GENERATED by @kitn.ai/blocks (the html form's binder). Do not edit: edit`,
    `// ${opts.blockName}.html (the bindings) or ${opts.blockName}.controller.ts (the logic).`,
    `//`,
    `// It does three things. Register the elements this page uses and WAIT for`,
    `// them (an element created before its definition lands discards a property`,
    `// set on it, and the upgrade does not put it back). Wire every binding the`,
    `// page declared. Re-apply on every controller notification.`,
    `import '@kitn.ai/ui/autoloader';`,
    `import { createController } from './${opts.blockName}.controller.js';`,
    '',
    `const TAGS = [${template.kaiTags.map(jsString).join(', ')}];`,
    `await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));`,
    '',
    `const at = (n) => document.querySelector(\`[data-kai-b="\${n}"]\`);`,
    `const inRow = (row, n) => (row.matches(\`[data-kai-b="\${n}"]\`) ? row : row.querySelector(\`[data-kai-b="\${n}"]\`));`,
    `// REMOVE on false/null/undefined and NOTHING ELSE. \`0\` and \`''\` are`,
    `// falsy and are legitimate attribute values; dropping count="0" because`,
    `// zero is falsy is a silent data loss. \`true\` writes the empty string,`,
    `// which is what a bare boolean attribute is.`,
    `const setAttr = (el, name, value) => {`,
    `  if (value === false || value === null || value === undefined) el.removeAttribute(name);`,
    `  else el.setAttribute(name, value === true ? '' : String(value));`,
    `};`,
    '',
    `const controller = createController({`,
    `  refs: () => ({ ${refs.join(', ')} }),`,
    `});`,
    '',
    ...(seeds.length
      ? [
          '// seed: written ONCE, after registration and before the first apply,',
          '// then never again. "After registration" is the honest wording: an',
          '// element that captures a prop at upgrade (kai-view-stack captures',
          '// `view` into initialView, view-stack.tsx:125) has already captured',
          '// by the time this line runs, so a seed on such a prop acts as the',
          '// first NAVIGATION rather than as a deep link. That is the same',
          '// landing view here, and it is the behaviour to expect.',
          ...seeds,
          '',
        ]
      : []),
    ...(listeners.length ? ['// kai-* events do not bubble: every listener is on its own element.', ...listeners, ''] : []),
    ...(rowBlocks.length ? [...rowBlocks, ''] : []),
    `function apply() {`,
    `  const state = controller.state();`,
    ...applies,
    `}`,
    '',
    `controller.subscribe(apply);`,
    `apply();`,
    `await controller.actions.boot();`,
    '',
    `// The block driver's readiness convention: ONE constant across every`,
    `// block and every scenario (packages/ui/scripts/block-driver/).`,
    `window.__blockReady = true;`,
    '',
  ].join('\n');

  void shape; // validated by the caller; nothing in the emitted body reads it
  return body;
}
```

and the form itself:

```ts
export function renderHtmlForm(block: Block): FormFile[] {
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
  if (!pageEntry) throw new Error(`${block.name}: no registry:page entry to render the html form from`);
  const pageHtml = block.files.get(pageEntry.path) as string;

  const parsed = parseTemplate(pageHtml, `${block.name}/${pageEntry.path}`);
  if (!parsed.template) throw new Error(`${block.name}: ${parsed.errors.join('; ')}`);

  const name = pascal(block.name);
  const controllerPath = `${block.name}.controller.ts`;
  const controllerSource = block.files.get(controllerPath);
  if (controllerSource === undefined) {
    throw new Error(`${block.name}: the html form needs ${controllerPath} (spec 3.2)`);
  }
  const analysis = analyzeController(controllerSource, name, `${block.name}/${controllerPath}`);
  if (!analysis.shape) throw new Error(`${block.name}: ${analysis.errors.join('; ')}`);
  // The gate is not the only caller: `create-kai add` and `kai dev` render
  // without ever running checkBlockContracts, so the cross-check runs HERE too
  // or those two front doors emit a binder that calls a missing action.
  const crossErrors = crossCheckBindings(parsed.template, analysis.shape, `${block.name}/${pageEntry.path}`);
  if (crossErrors.length) throw new Error(`${block.name}: ${crossErrors.join('; ')}`);

  const entryScript = `${block.name}.js`;
  const files: FormFile[] = [];
  const put = (path: string, content: string): void => {
    files.push({ path, content, target: fileTarget('html', block.name, path) });
  };

  put(pageEntry.path, serializeTemplate(parsed.template, { entryScript }));
  put(entryScript, adaptRegistrationForBundler(renderBinder({ blockName: block.name, template: parsed.template, shape: analysis.shape })));

  for (const entry of block.manifest.files) {
    if (entry.type === 'registry:page') continue;
    if (entry.path.endsWith('.js')) continue; // a twin; emitted beside its .ts below
    if (entry.path.endsWith('.ts')) {
      const twin = entry.path.replace(/\.ts$/, '.js');
      const stripped = block.files.get(twin);
      if (stripped === undefined) {
        throw new Error(
          `${block.name}: ${twin} is missing. The html form ships JavaScript, and the stripped twin is written at generation time by packages/ui/scripts/gen-blocks.mjs (esbuild) or packages/create-kai/scripts/build.mjs. Run a build.`,
        );
      }
      put(twin, adaptRegistrationForBundler(stripped));
      continue;
    }
    put(entry.path, block.files.get(entry.path) as string);
  }
  return files;
}
```

Point `renderBlockForm`'s `case 'html'` at it.

- [ ] **Step 6: The `kai dev` form route refuses loudly instead of 404-ing**

`renderHtmlForm` now REFUSES a page with no controller, and `packages/ui/mcp/construct/dev.ts`'s form route calls `renderBlockForm` inside a `try` that returns `{ kind: 'missing' }` on a throw. **Read what that produces before changing anything**: `missing` renders as a 404, and a 404 saying "the html form cannot be rendered" for a block that plainly exists is the wrong shape and sends the reader looking for a routing bug. Make the refusal a 500 that says the true thing:

```ts
      } catch (err) {
        // A render REFUSAL is not a missing route. The block is there and the
        // renderer will not emit it, which is a fact the reader needs in
        // words: an unconverted block (no <id>.controller.ts, or a page still
        // carrying its own <script type="module">) cannot be rendered under
        // the authored contract. Loud, and never a crashed dev server.
        return {
          kind: 'file',
          status: 500,
          type: 'text/plain; charset=utf-8',
          body: Buffer.from(
            `the ${form} form of "${name}" cannot be rendered:\n${err instanceof Error ? err.message : String(err)}\n`,
            'utf8',
          ),
        };
      }
```

If the route's response union has no `status`, add one defaulting to 200 rather than reusing `missing`; the handler's caller writes the head, so this stays local. Read `handleGalleryRequest`'s return type and its writer before editing either.

**The synthetic fixture at `dev.test.ts:695-706` stays UNCONVERTED in this task, deliberately.** It is a page with an authored `<script type="module">` and an imperative `demo-block.js`, which is exactly an unconverted block, and this step's new behaviour is what such a block gets. Converting the fixture here would break the same test's `react` half, because the OLD react renderer (still in place until Task 8) requires exactly one module script and would refuse the converted page -- so the fixture and every half of that assertion move together, in Task 9, and this task asserts the refusal instead:

```ts
  it('an unconverted block gets a loud refusal from the html form, not a 404', () => {
    const { dirs } = galleryFixture();
    const out = handleGalleryRequest('/gallery/api/form/demo-block/html', dirs);
    expect(out?.kind).toBe('file');
    expect(out?.kind === 'file' && out.status).toBe(500);
    expect(String(out?.kind === 'file' ? out.body : '')).toContain('demo-block.controller.ts');
  });
```

and the existing `filesOf('html')` assertions at `:777-782` move to Task 9 with the fixture. Delete them here and say so in the commit body, or the suite is red at the end of this task.

- [ ] **Step 7: Add `boot` to the controller contract**

In `analyze-controller.ts`, after `const actionNames = read('Actions', 'actions');`:

```ts
  if (actionNames.length > 0 && !actionNames.includes('boot')) {
    errors.push(`${where}: ${componentName}Actions declares no \`boot\`. Every host calls boot() once after wiring, and the html form has nowhere else to hydrate from storage (spec 3.2, as amended by the PR B plan).`);
  }
```

and add the matching case to `tests/analyze-controller.test.ts`:

```ts
  it('refuses an Actions block with no boot hook', () => {
    const out = analyzeController(GOOD.replace('  boot(): Promise<void>;\n', ''), 'Widget', 'w');
    expect(out.errors.join(' ')).toContain('declares no `boot`');
  });
```

- [ ] **Step 8: Run everything and watch it pass**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/construct/dev.test.ts
cd "$WT" && pnpm exec nx typecheck ui --skip-nx-cache
```

Expected: green, including the new `boot` case watched failing first (run it before adding the check if you did the steps out of order).

**What `dev.test.ts` proves at the end of THIS task**, so the green is read correctly: its synthetic `demo-block` is still UNCONVERTED, so `filesOf('html')` gets the new 500 (asserted in Step 6) while `filesOf('react')` and `filesOf('cdn')` still pass through the OLD renderers, which handle an unconverted page fine. The fixture converts in Task 9, when all three renderers are new.

**Watch the anti-vacuity half of the strip case fail.** Delete one line from the fixture controller's first interface so it no longer spans `\n}\n`, re-run `tests/html-form.test.ts`, and confirm the `expect(CONTROLLER).toMatch(/^export interface /m)` guard still holds while the naive-regex version of `stripped()` would have gone green with nothing stripped. Restore the line. The point of the exercise is to see, once, that the strip is doing work.

- [ ] **Step 9: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the html form renders a generated binder

src/forms/ replaces src/forms.ts. The html form emits the authored page with
every binding taken OFF the markup (a data-kai-b marker in its place, and a
<template data-kai-for> around a repeated element), plus a generated binder
that registers the page's tags, awaits whenDefined, writes the seeds once,
attaches every listener on its own element, keys the *for rows by their
declared :key, and re-applies on every controller notification.

withStrippedTwins states where the TypeScript strip happens and why it
cannot happen in this package: two of the three renderers run inside
published CLIs that have no stripper. It runs once, at generation time, and
the .js twin travels with the block.

boot() joins the controller contract: it is the mount hook every host calls,
and the binder awaits it before setting the driver's readiness signal.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---
## Task 8: the `react` renderer

**Files:**
- Create: `packages/blocks/src/forms/react.ts`
- Create: `packages/blocks/tests/react-form.test.ts`
- Modify: `packages/blocks/src/forms/index.ts` (delete the six dead helpers, dispatch `react` at the new renderer)
- Modify: `packages/create-kai/src/react-form.ts` (the shim slims to what survives), `packages/create-kai/test/add.test.ts:204-226` and `:430-442`
- Modify: `packages/ui/mcp/construct/dev.test.ts:783-787` (the react half of the form-route assertion becomes the refusal case; the fixture itself converts in Task 9)
- Modify: `packages/ui/scripts/gen-element-react.mjs` (export `onName`)
- Modify: `packages/ui/mcp/tests/blocks-artifacts.test.ts` (the two derivation guards)

**Interfaces:**
- Consumes: `ParsedTemplate` (Task 4), `ControllerShape` (Task 5), `fileTarget` (Task 3), `pascal` (Task 6), and the shared fixture at `packages/blocks/tests/fixtures/` (Task 7).
- Produces: `renderReactForm(block: Block): FormFile[]` emitting `<Name>.tsx`, `use<Name>.ts`, the controller, the mock, the css and a README -- the shape of the spike's appendices A3 and A4.

**This task comes BEFORE the conversion, and the ordering is forced.** Today's `renderReactForm` (`packages/blocks/src/forms.ts:335-338`) throws unless the page carries exactly one module script, and an authored-contract page carries none. `packages/create-kai/test/add.test.ts:204-206` loops the REAL blocks through `add --form react`, and `packages/ui/mcp/construct/dev.ts:831` dispatches every form through one renderer. So converting `support-widget` while the old react renderer is still in place turns both suites red, and there is no ordering of those two commits that avoids it EXCEPT this one: build the new react renderer first, against the fixture Task 7 wrote, and convert afterwards when all three renderers are new.

**What is green at the end of this task, and why.** The blocks suite is green because both renderer suites run over the fixture, which IS an authored-contract block. `create-kai`'s suite is green because its react-form case asserts the REFUSAL for the still-unconverted real blocks (Step 4 below), which is the true statement at this point in the branch. `dev.test.ts` is green because its synthetic fixture is still unconverted and both its html and react cases assert the loud 500. Task 9 converts everything and turns all three back into positive assertions in one commit.

**Two derivations this task makes, each with a guard rather than a table:**

- **The handler name.** `onName` in `packages/ui/scripts/gen-element-react.mjs` is the rule (drop `kai-`, PascalCase on hyphens, prefix `on`). `packages/blocks` cannot import from `packages/ui` -- that is the dependency direction PR A established -- so the rule is restated once, in `src/forms/react.ts`, and `packages/ui/mcp/tests/blocks-artifacts.test.ts` (the suite that already has both packages' inputs) asserts the two agree for EVERY event name in `element-meta.json`. That test is what makes the restatement safe, and it is a `docs/coupling-map.md` section 4 row.
- **The component and element-interface names.** `displayName` is PascalCase of the tag minus `kai-`, and `className` is `Kai<displayName>Element`, for every entry in `packages/ui/src/elements/element-meta.json` with no exceptions. That was measured before this plan was written and it is not a number to copy: the assertion in Step 5 re-derives it over whatever the file holds at implementation time, with an anti-vacuity floor, so an exception introduced later fails there rather than in a consumer's build. Read the entry count the test prints; do not restate one.

- [ ] **Step 1: Write the failing test**

`packages/blocks/tests/react-form.test.ts`. It reads the SAME fixture Task 7 wrote (`packages/blocks/tests/fixtures/`), through the same three-line loader -- one page, one controller, two renderers, which is the property this whole round is for. Do not copy the fixture into this file:

```ts
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderReactForm } from '../src/forms';
import type { Block } from '../src/registry';

const FIXTURES = resolve(__dirname, 'fixtures');
const PAGE = readFileSync(join(FIXTURES, 'fixture.html'), 'utf8');
const CONTROLLER = readFileSync(join(FIXTURES, 'fixture.controller.ts'), 'utf8');
// `block()` and `byPath()` are the same two helpers html-form.test.ts declares.
// If a third suite needs them, they move to tests/fixtures/block.ts; two is not
// yet a pattern.
```

then the cases:

```ts
describe('the react form', () => {
  it('emits the component, the hook, the controller, the mock, the css and a README', () => {
    const files = byPath(renderReactForm(block()));
    expect([...files.keys()].sort()).toEqual([
      'Fixture.tsx', 'README.md', 'fixture.controller.ts', 'fixture.css', 'useFixture.ts',
    ]);
  });

  it('targets every file at src/components/<id>/', () => {
    for (const file of renderReactForm(block())) expect(file.target).toBe(`src/components/fixture/${file.path}`);
  });

  it('imports every kai element from @kitn.ai/ui/react and emits no raw kai- tag', () => {
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain("from '@kitn.ai/ui/react'");
    expect(tsx).toMatch(/import \{[\s\S]*Dock,[\s\S]*\} from '@kitn\.ai\/ui\/react';/);
    expect(tsx).not.toMatch(/<kai-/);
  });

  it('translates each binding kind', () => {
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('unread={state.hidden}');            // .prop
    expect(tsx).toContain('onClick={actions.open}');           // @kai-click -> the onName rule
    expect(tsx).toContain('{state.title}');                    // .textContent -> children
    expect(tsx).toContain('refs.current.dock = el;');          // #ref, no cast (PR B0 typed it)
    expect(tsx).toContain('.map((row) =>');                    // *for
    expect(tsx).toContain('key={row.id}');                     // the mandatory :key
  });

  it('writes a seed ONCE in a mount effect, never as a re-applied prop', () => {
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain("setAttribute('position', 'bottom-end')");
    expect(tsx).toMatch(/useEffect\(\(\) => \{[\s\S]*setAttribute\('position'[\s\S]*\}, \[\]\);/);
    expect(tsx).not.toContain('position="bottom-end"');
  });

  it('translates a ="false" literal on a kai element to a JSX boolean', () => {
    const b = block();
    b.files.set('fixture.html', (b.files.get('fixture.html') as string).replace('<kai-conversations>', '<kai-conversations searchable="false">'));
    expect(byPath(renderReactForm(b)).get('Fixture.tsx')).toContain('searchable={false}');
  });

  it('emits the hook as one useSyncExternalStore over the controller', () => {
    const hook = byPath(renderReactForm(block())).get('useFixture.ts')!;
    expect(hook).toContain('useSyncExternalStore(controller.subscribe, controller.state, controller.state)');
    expect(hook).toContain("from './fixture.controller'");
    expect(hook).toContain('void controller.actions.boot();');
  });

  it('exports the component by NAME, which is what the README tells the reader to import', () => {
    const files = byPath(renderReactForm(block()));
    expect(files.get('Fixture.tsx')).toContain('export function Fixture()');
    expect(files.get('Fixture.tsx')).not.toContain('export default');
    expect(files.get('README.md')).toContain('import { Fixture }');
  });

  it('emits no registration import: the wrappers self-register', () => {
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).not.toContain('registerAll');
    expect(tsx).not.toContain('@kitn.ai/ui/elements');
    expect(tsx).not.toContain('whenDefined');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run tests/react-form.test.ts
```

Expected: FAIL -- the old renderer emits `Fixture.tsx`, `kai-elements.d.ts` and a wrapped entry script.

- [ ] **Step 3: Write `src/forms/react.ts`**

```ts
/**
 * The react delivery form: the typed wrappers from `@kitn.ai/ui/react` plus a
 * `useSyncExternalStore` adapter over the controller. This is the generator's
 * target as the contract spike hand-wrote and RAN it (report appendices A3 and
 * A4), so the shape below is evidence rather than taste.
 *
 * THREE NAMES ARE DERIVED, NOT TABLED. The wrapper component is PascalCase of
 * the tag minus `kai-`; the element interface is `Kai<Component>Element`; the
 * handler prop is `on` + PascalCase of the event minus `kai-`. All three hold
 * for every entry in the kit's element metadata, and
 * packages/ui/mcp/tests/blocks-artifacts.test.ts asserts it for every entry
 * rather than trusting this comment.
 *
 * NO REGISTRATION LINE, deliberately, and it is the one place this form
 * differs from every other: the wrappers self-register their own element and
 * their runtime re-applies props on `customElements.whenDefined`, so the
 * import and the await the other forms need would be noise here.
 */
import { walkElements } from '../contract/parse-template';
import type { Binding, ParsedTemplate, TemplateNode } from '../contract/types';
import { analyzeController } from '../contract/analyze-controller';
import { parseTemplate } from '../contract/parse-template';
import { fileTarget } from '../targets';
import { pascal, type Block } from '../registry';
import type { FormFile } from '../contract/types'; // never './index': that is a cycle

const camel = (name: string): string => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const pascalTag = (tag: string): string => pascal(tag.replace(/^kai-/, ''));

/** `packages/ui/scripts/gen-element-react.mjs`'s `onName`, restated once and
 *  pinned against the original for every event the kit declares. */
export const handlerName = (event: string): string => `on${pascal(event.replace(/^kai-/, ''))}`;

const isKai = (tag: string): boolean => tag.startsWith('kai-');
const read = (value: string, scope: string | undefined): string =>
  scope && value.startsWith(`${scope}.`) ? value : `state.${value}`;

/** A literal attribute as a JSX prop. */
function literalProp(tag: string, name: string, value: string): string {
  if (name === 'class') return `className="${value}"`;
  if (name === 'for') return `htmlFor="${value}"`;
  const prop = isKai(tag) && name !== 'slot' && name !== 'id' ? camel(name) : name;
  if (value === '') return prop;
  // The kit's own documented "default-true flag off" idiom does not survive
  // translation: the generated prop is `boolean`, so the string has to become
  // one. Safe unconditionally because no element declares a prop whose type
  // union contains the string 'true' or 'false' -- and if one ever does, the
  // react compile cell fails on that line with TS2322, which is a better guard
  // than a list somebody maintains.
  if (isKai(tag) && (value === 'true' || value === 'false')) return `${prop}={${value}}`;
  return `${prop}="${value}"`;
}

function bindingProp(tag: string, b: Binding, scope: string | undefined, refExpr: (b: Binding) => string): string | null {
  switch (b.kind) {
    case 'prop':
      return b.name === 'textContent' ? null : `${b.name}={${read(b.value, scope)}}`;
    case 'attr':
      return `${isKai(tag) ? camel(b.name) : b.name}={${read(b.value, scope)}}`;
    case 'event':
      return `${handlerName(b.name)}={actions.${b.value}}`;
    case 'ref':
      return refExpr(b);
    case 'seed':
      return null; // a mount effect, never a re-applied prop (spec 8b, amendment 5)
  }
}
```

then the node printer and the two files:

```ts
interface Emit {
  seeds: { ref: string; name: string; value: string }[];
  refNames: Set<string>;
}

function printNode(node: TemplateNode, pad: string, scope: string | undefined, emit: Emit): string {
  if (node.type === 'text') return `${pad}${node.text.trim()}`;
  if (node.type === 'comment') return `${pad}{/*${node.text.replace(/\*\//g, '* /')}*/}`;

  const tag = isKai(node.tag) ? pascalTag(node.tag) : node.tag;
  const refBinding = node.bindings.find((b) => b.kind === 'ref');
  const seedBindings = node.bindings.filter((b) => b.kind === 'seed');
  let seedRef: string | undefined;
  if (seedBindings.length) {
    seedRef = refBinding ? `refs.current.${refBinding.name}` : `seedRef${node.marker}.current`;
    if (!refBinding) emit.refNames.add(`seedRef${node.marker}`);
    for (const s of seedBindings) emit.seeds.push({ ref: seedRef, name: s.name, value: s.value });
  }

  const refExpr = (b: Binding): string => `ref={(el) => { refs.current.${b.name} = el; }}`;
  const props = [
    ...(refBinding ? [] : seedRef ? [`ref={(el) => { seedRef${node.marker}.current = el; }}`] : []),
    ...node.attrs.map((a) => literalProp(node.tag, a.name, a.value)),
    ...node.bindings.map((b) => bindingProp(node.tag, b, scope, refExpr)).filter((p): p is string => p !== null),
  ];

  // A repeated element opens the scope its subtree reads from: inside
  // `*for="row of rows"`, `row.title` is legal and `title` still means
  // `state.title`. Threading `scope` unchanged here would make every binding
  // in a row body read `state.row.title`.
  const childScope = node.repeat ? node.repeat.item : scope;
  const textBinding = node.bindings.find((b) => b.kind === 'prop' && b.name === 'textContent');
  const children = textBinding
    ? [`${pad}  {${read(textBinding.value, childScope)}}`]
    : node.children.map((c) => printNode(c, `${pad}  `, childScope, emit)).filter(Boolean);

  const head = props.length > 3
    ? `${pad}<${tag}\n${props.map((p) => `${pad}  ${p}`).join('\n')}\n${pad}${children.length ? '>' : '/>'}`
    : `${pad}<${tag}${props.length ? ' ' : ''}${props.join(' ')}${children.length ? '>' : ' />'}`;
  const element = children.length ? `${head}\n${children.join('\n')}\n${pad}</${tag}>` : head;

  if (!node.repeat) return element;
  const inner = element.split('\n').map((l) => `  ${l}`).join('\n');
  return [
    `${pad}{${read(node.repeat.list, undefined)}.map((${node.repeat.item}) => (`,
    inner.replace(`<${tag}`, `<${tag} key={${node.repeat.key}}`),
    `${pad}))}`,
  ].join('\n');
}
```

Note that a repeated element's OWN bindings (`:key`, `:conversation-id="row.id"`, `:unread="row.unread"`) are read with `childScope` too, because they are inside the `.map((row) => ...)` closure the repeat emits. The `props` array above is built with `scope`, so it must be built AFTER `childScope` and with it: move the `childScope` line above the `props` computation and pass `childScope` to both `bindingProp` and the `key` expression. Getting this wrong emits `key={state.row.id}`, which does not compile, so the react compile cell catches it -- but it is cheaper to read the code once.

```ts
export function renderReactForm(block: Block): FormFile[] {
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
  if (!pageEntry) throw new Error(`${block.name}: no registry:page entry to render the react form from`);
  const parsed = parseTemplate(block.files.get(pageEntry.path) as string, `${block.name}/${pageEntry.path}`);
  if (!parsed.template) throw new Error(`${block.name}: ${parsed.errors.join('; ')}`);

  const name = pascal(block.name);
  const controllerPath = `${block.name}.controller.ts`;
  const controllerSource = block.files.get(controllerPath);
  if (controllerSource === undefined) throw new Error(`${block.name}: the react form needs ${controllerPath} (spec 3.2)`);
  const analysis = analyzeController(controllerSource, name, `${block.name}/${controllerPath}`);
  if (!analysis.shape) throw new Error(`${block.name}: ${analysis.errors.join('; ')}`);

  const emit: Emit = { seeds: [], refNames: new Set() };
  // THE BLOCK ROOT, not the page. The authored page opens with a host
  // stand-in paragraph so the html and cdn forms are a runnable PAGE; a react
  // consumer is not installing a paragraph explaining that the page is a
  // stand-in. `data-block-root` marks the one element that IS the block, and
  // the marker attribute itself is dropped from the emitted tree.
  const root = parsed.template.blockRoot;
  const rootForEmit = { ...root, attrs: root.attrs.filter((a) => a.name !== 'data-block-root') };
  const body = printNode(rootForEmit, '    ', undefined, emit);
  const components = [...new Set(walkElements([root]).filter((el) => isKai(el.tag)).map((el) => pascalTag(el.tag)))].sort();

  const tsx = [
    `// GENERATED by @kitn.ai/blocks from ${block.name}.html and ${controllerPath}.`,
    `// It is your code now: edit freely, and regenerate to start over.`,
    `import { useEffect${emit.refNames.size ? ', useRef' : ''} } from 'react';`,
    `import { ${components.join(', ')} } from '@kitn.ai/ui/react';`,
    `import { use${name} } from './use${name}';`,
    ...parsed.template.stylesheets.map((css) => `import './${css}';`),
    '',
    `export function ${name}() {`,
    `  const { state, actions, refs } = use${name}();`,
    ...[...emit.refNames].map((r) => `  const ${r} = useRef<HTMLElement | null>(null);`),
    ...(emit.seeds.length
      ? [
          '',
          '  // seed: written ONCE. A literal on a prop the element self-manages is',
          '  // a controlled-component trap in React, because the wrapper re-applies',
          '  // every prop after every render (spec 8b, amendment 5).',
          '  useEffect(() => {',
          ...emit.seeds.map((s) => `    ${s.ref}?.setAttribute('${s.name}', '${s.value}');`),
          '  }, []);',
        ]
      : []),
    '',
    '  return (',
    body,
    '  );',
    '}',
    '',
  ].join('\n');

  const hook = [
    `// GENERATED by @kitn.ai/blocks: the react adapter.`,
    `// useSyncExternalStore takes exactly the getter + subscribe pair the`,
    `// controller contract specifies, so this file is the whole adapter: no`,
    `// state mirrored, no effect re-deriving anything.`,
    `import { useEffect, useRef, useState, useSyncExternalStore } from 'react';`,
    // RefObject, not MutableRefObject: @types/react 19 deprecates
    // MutableRefObject and `useRef<T>(initial)` returns RefObject<T> there,
    // whose `.current` is mutable. The repo pins @types/react 19.
    `import type { RefObject } from 'react';`,
    `import {`,
    `  createController,`,
    `  type ${name}Actions,`,
    `  type ${name}Refs,`,
    `  type ${name}State,`,
    `} from './${block.name}.controller';`,
    '',
    `export interface Use${name} {`,
    `  state: ${name}State;`,
    `  actions: ${name}Actions;`,
    `  refs: RefObject<${name}Refs>;`,
    `}`,
    '',
    `export function use${name}(): Use${name} {`,
    `  // The refs object is stable and the controller reads it lazily, which is`,
    `  // why deps.refs is a getter: here both handles are still null.`,
    `  const refs = useRef<${name}Refs>({ ${analysis.shape.refNames.map((r) => `${r}: null`).join(', ')} });`,
    `  const [controller] = useState(() => createController({ refs: () => refs.current }));`,
    `  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state);`,
    '',
    `  useEffect(() => {`,
    `    void controller.actions.boot();`,
    `  }, [controller]);`,
    '',
    `  return { state, actions: controller.actions, refs };`,
    `}`,
    '',
  ].join('\n');

  const readme = [
    `# ${block.manifest.title}`,
    '',
    `${block.manifest.description}`,
    '',
    `Render it: \`import { ${name} } from './${name}';\``,
    ...(block.manifest.docs ? ['', block.manifest.docs] : []),
    '',
  ].join('\n');

  const files: FormFile[] = [];
  const put = (path: string, content: string): void => {
    files.push({ path, content, target: fileTarget('react', block.name, path) });
  };
  put(`${name}.tsx`, tsx);
  put(`use${name}.ts`, hook);
  put('README.md', readme);
  for (const entry of block.manifest.files) {
    if (entry.type === 'registry:page') continue;
    if (entry.path.endsWith('.js')) continue; // a generated twin; the react tree keeps the .ts
    put(entry.path, block.files.get(entry.path) as string);
  }
  return files;
}
```

- [ ] **Step 4: Delete the six dead helpers and their callers**

From `src/forms/index.ts`: `bodyToJsx`, `wrapEntryScript`, `wrapHtmlEntryScript`, `splitImports`, `renderComponent`, `renderJsxTypings`, `renderEntryTypings`, `VOID_TAGS`. Point `renderBlockForm`'s `react` case at the new renderer.

In `packages/create-kai/src/react-form.ts`, the re-export list slims to what still exists:

```ts
export { componentName, kaiTagsIn } from '@kitn.ai/blocks/forms';
```

In `packages/create-kai/test/add.test.ts`, delete the two `bodyToJsx` cases and the `wrapEntryScript` case at `:430-442` -- they pin functions that no longer exist.

**The react-form case at `:204-226` loops the REAL blocks, which are not converted yet**, so in THIS task it becomes the refusal it now is, with a pointer to the commit that turns it back:

```ts
  // The real blocks are still authored the old way at this point in the
  // branch; the react renderer refuses a page with no controller, by name.
  // Task 9 converts them and this case becomes the positive assertions in the
  // table below, in that commit.
  it('refuses the react form for a block that is not on the authored contract yet', async () => {
    for (const block of blocks) {
      const dir = await project(`react-${block.name}`, { name: 'host', dependencies: { react: '^19.0.0' } });
      const run = await runInto(dir, [block.name]);
      expect(run.code, `${block.name}: expected a refusal`).toBe(1);
      expect(run.err.join('\n')).toContain(`${block.name}.controller.ts`);
    }
  });
```

The renderer's POSITIVE behaviour is not untested in the meantime: `packages/blocks/tests/react-form.test.ts` asserts all of it over the fixture, which is a real authored-contract block. What is deferred is only the end-to-end CLI path, and it is deferred by exactly one task.

Task 9 replaces that case with the real one. Every assertion in the original is about the OLD form and each fails for its own reason, so they change together, and this is the table Task 9 applies:

| Line | Asserts today | Why it fails | Becomes |
|---|---|---|---|
| `:212` | `import { registerAll } from '@kitn.ai/ui/react';` | the new tree emits no registration line: the wrappers self-register | `import { Dock` ... `} from '@kitn.ai/ui/react';` (assert the specifier and one wrapper name) |
| `:213` | `export default function <Name>()` | R12: the component is a NAMED export | `export function ${componentName(block.name)}()` |
| `:214` | `className=` | still true, the renderer maps `class` to `className` | unchanged |
| `:215-216` | no `<script`, no ` class="` | still true | unchanged |
| `:217` | `kai-elements.d.ts` exists | the JSX-typings file is gone: every element comes from a typed wrapper | `expect(existsSync(path.join(base, 'kai-elements.d.ts'))).toBe(false)` and `expect(existsSync(path.join(base, `use${componentName(block.name)}.ts`))).toBe(true)` |
| `:219` | the page html is NOT written | still true, and it now reads the derived basename (Task 3 Step 9b) | unchanged |
| `:220-226` | an emitted `.js` the tsx imports, exporting `initBlock` | the react tree ships `.ts`/`.tsx` only; there is no wrapped entry script | replace with: the tsx imports `./use<Name>`, and `<id>.controller.ts` and `mock.ts` are both present |

```ts
      const tsx = await readFile(path.join(base, `${componentName(block.name)}.tsx`), 'utf8');
      expect(tsx).toContain("from '@kitn.ai/ui/react'");
      expect(tsx).toContain(`export function ${componentName(block.name)}()`);
      expect(tsx).toContain(`from './use${componentName(block.name)}'`);
      expect(tsx).toContain('className=');
      expect(tsx).not.toMatch(/<script\b/);
      expect(tsx).not.toContain(' class="');
      expect(existsSync(path.join(base, 'kai-elements.d.ts'))).toBe(false);
      expect(existsSync(path.join(base, `use${componentName(block.name)}.ts`))).toBe(true);
      expect(existsSync(path.join(base, `${block.name}.controller.ts`))).toBe(true);
      const page = block.manifest.files.find((f) => f.type === 'registry:page')!;
      expect(existsSync(path.join(base, page.target ?? path.basename(page.path)))).toBe(false);
```

The `it(...)` title moves too: "writes the component, typings and wrapped script for every block" describes a form that no longer exists. "writes the component, the hook and the controller for every block; never the page html".

- [ ] **Step 4b: The `kai dev` react route joins the refusal case**

Task 7 made an unconverted block's `html` form a loud 500 and asserted it. The react form is now the same kind of refusal for the same reason, and `dev.ts:831` dispatches both through one `try`, so extend that one case rather than adding a second:

```ts
  it('an unconverted block gets a loud refusal from the html AND react forms, not a 404', () => {
    const { dirs } = galleryFixture();
    for (const form of ['html', 'react']) {
      const out = handleGalleryRequest(`/gallery/api/form/demo-block/${form}`, dirs);
      expect(out?.kind, form).toBe('file');
      expect(out?.kind === 'file' && out.status, form).toBe(500);
      expect(String(out?.kind === 'file' ? out.body : ''), form).toContain('demo-block.controller.ts');
    }
  });
```

The react `arrayContaining([...])` assertion at `:783-787` goes with it: the fixture is unconverted, so there is no react tree to list. `filesOf('cdn')` at `:791-793` is UNTOUCHED and must still pass -- the cdn renderer is unchanged until Task 9 and handles the unconverted fixture fine. If it goes red here, something in this task reached further than intended.

```bash
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/construct/dev.test.ts
```

- [ ] **Step 5: Export `onName` and pin both derivations**

One line in `packages/ui/scripts/gen-element-react.mjs`: `const onName = ...` becomes `export const onName = ...`.

In `packages/ui/mcp/tests/blocks-artifacts.test.ts`:

```ts
import { onName } from '../../scripts/gen-element-react.mjs';
import { handlerName } from '@kitn.ai/blocks/forms';

describe('the derivations the react block renderer makes', () => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'src/elements/element-meta.json'), 'utf8'));

  it('handlerName agrees with the wrapper generator for every event the kit declares', () => {
    const events = meta.flatMap((el: { events: { name: string }[] }) => el.events.map((e) => e.name));
    expect(events.length).toBeGreaterThan(0); // anti-vacuity: an empty roster must not pass
    for (const event of events) expect(handlerName(event)).toBe(onName(event));
  });

  it('the component and element-interface names are derivable from the tag, with no exceptions', () => {
    const pascalTag = (tag: string) => tag.replace(/^kai-/, '').split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('');
    expect(meta.length).toBeGreaterThan(0);
    for (const el of meta as { tag: string; displayName: string; className: string }[]) {
      expect(el.displayName).toBe(pascalTag(el.tag));
      expect(el.className).toBe(`Kai${pascalTag(el.tag)}Element`);
    }
  });
});
```

Watch both fail before trusting them: temporarily change `handlerName` to prefix `onKai`, run, see it name the first event, revert.

- [ ] **Step 6: Run everything**

```bash
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/tests/blocks-artifacts.test.ts
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/construct/dev.test.ts
cd "$WT/packages/ui" && npm run verify:generated
```

Expected: green, and read each one for the RIGHT green. The blocks suite is the renderer working over the fixture. `create-kai`'s is the REFUSAL for the still-unconverted real blocks. `dev.test.ts`'s is the same refusal through the dev route, with its cdn case still passing through the untouched cdn renderer. `verify:generated` re-runs `build:api` and diffs, so it catches the `export` on `onName` having changed generator OUTPUT (it must not: `export` on a const changes nothing the generator writes).

**`verify:blocks` is NOT in this list, and that is a decision, not an omission.** It renders every real block, and they are still unconverted, so it would refuse -- correctly. It returns in Task 9, in the commit that converts them.

- [ ] **Step 7: Read the emitted react tree with your own eyes**

```bash
cd "$WT/packages/ui" && node -e "
const { createRequire } = require('node:module');
" # (use the gen-blocks importTs path instead if a quick script is easier)
cd "$WT/packages/ui" && node scripts/gen-blocks.mjs && cat dist/blocks/f/support-widget.react.json 2>/dev/null || echo "(the form JSON lands in Task 11; until then dump the tree from a vitest scratch test)"
```

Compare it against the spike report's appendix A3 and A4, side by side, and list every difference in the handoff with a reason. Expected differences: the hook is `useSupportWidget` rather than the spike's illustrative `useSupportChat`; the seed is a mount effect rather than dropped; `refs.current.stack = el` carries no cast (PR B0's F-9). **An unexpected difference is a finding.**

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): the react form is a typed-wrapper tree over the controller

<Name>.tsx from the parsed page and use<Name>.ts from the controller: the
shape the contract spike hand-wrote, compiled and RAN (report A3 and A4).
Every kai element comes from @kitn.ai/ui/react, .textContent renders as
children, *for is a keyed .map, #ref assigns without a cast because PR B0
typed the forwarded ref, and a seed is written once in a mount effect rather
than re-applied on every render.

Three names are derived rather than tabled -- the wrapper component, the
element interface, and the handler prop -- and blocks-artifacts.test.ts
asserts each derivation against the kit's own metadata for every element and
every event, so a restatement cannot drift silently.

The regex bodyToJsx and the five helpers around it are deleted, not kept
beside the parser.

It lands BEFORE the conversion because the old renderer refuses a page with
no module script, create-kai's suite loops the real blocks through it, and
the kai dev route dispatches every form through one renderer: building the
new one first, against the shared test fixture, is the only ordering where
both commits are green. Until the next commit converts them, the CLI and dev
cases assert the refusal the real blocks now get, and the renderer's own
behaviour is pinned over the fixture.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 9: convert `support-widget`, write the twins, land the cdn path, re-record the driver baseline

**Files:**
- Rewrite: `packages/blocks/blocks/support-widget/support-widget.html`
- Create: `packages/blocks/blocks/support-widget/support-widget.controller.ts`
- Rename: `packages/blocks/blocks/support-widget/mock.js` -> `mock.ts`
- Delete: `packages/blocks/blocks/support-widget/support-widget.js`
- Modify: `packages/blocks/blocks/support-widget/registry-item.json` (the `files[]` list and the `docs` string)
- Modify: `packages/ui/scripts/gen-blocks.mjs` (the twins, AND the two `generateCdnForm` calls at `:128` and `:134`)
- Modify: `packages/create-kai/scripts/build.mjs` (the twins)
- Modify: `packages/blocks/src/registry.ts` (`inlineRelativeModule`, `rewriteBlockScript`) and create `packages/blocks/src/forms/cdn.ts`
- Modify: `packages/ui/mcp/construct/dev.ts:662` (`galleryPreviewHtml`)
- Modify: `packages/ui/mcp/tests/blocks-artifacts.test.ts:87-105`
- Modify: `packages/ui/mcp/construct/dev.test.ts:695-706` (the synthetic fixture converts) and `:777-793` (all three form assertions turn positive again)
- Modify: `packages/create-kai/test/add.test.ts:204-226` (the react-form case turns back onto the real blocks)
- Modify: `packages/blocks/blocks/support-widget/states.mjs:37`, `packages/ui/scripts/block-driver/scenarios/kai-chat-facade.mjs:24`, `packages/ui/scripts/block-driver/pages/kai-chat-facade/app.js:146` (the one readiness constant)
- Modify: `packages/ui/scripts/block-driver/baselines/support-widget.json` (re-recorded, and only if the driver step says so)
- Create: `packages/create-kai/test/block-twins.test.ts`

**Interfaces:**
- Consumes: `renderHtmlForm`, `withStrippedTwins` (Task 7) and `renderReactForm` (Task 8).
- Produces: the reference authored block, and `renderCdnFormFiles(block, opts)` rendering from the html form. Tasks 10 through 12 all render THIS block.

**This is the commit where every deferred assertion turns positive.** Tasks 7 and 8 left three suites asserting a REFUSAL, because the real blocks were not on the contract yet: `create-kai`'s react-form case, `dev.test.ts`'s html-and-react route case, and `verify:blocks`, which was left out of both gate lists. All three renderers are new now and the block is converted here, so all three go back to asserting what they are for, in this commit. **Nothing about that is optional: a task that ends with a suite asserting a refusal that is no longer true is a task that ended red.**

**Why the cdn path is in this commit and not its own task.** `gen-blocks.mjs:128` and `:134` call `generateCdnForm` on the AUTHORED block, and so does `dev.ts:662`. `generateCdnForm` inlines the page's relative `<script type="module">` tags -- and after this conversion the authored page has none. Split across two commits, the first one emits a `cdn.html` and a driver page containing markup and NO JavaScript: `verify:blocks [pins]` fails (a pinless form is a hard failure by construction), `[driver]` times out waiting for a readiness signal nothing sets, and `kai dev`'s preview renders dead markup. There is no ordering of two commits that avoids it, because the authored page and the cdn path are two ends of one change.

- [ ] **Step 1: Write the authored page**

`packages/blocks/blocks/support-widget/support-widget.html`, in full. It is the spike's appendix A1 with SEVEN deliberate differences, each marked in the file, and the last three are ones the spike's page dropped by accident:

1. The element `id`s stay. The block driver's `states.mjs` addresses `#dock`, `#prompt`, `#thread` and `#close` by id, and a state script is authored rather than generated.
2. `view="home"` becomes `seed:view="home"` (spec 8b amendment 5).
3. The buttons use `@kai-click`, not `@click` (spec 8b amendment 4).
4. `searchable="false"` stays the kit's own idiom; the renderers translate it (spec 8b amendment 8).
5. **`data-block-root` on `<kai-dock>`.** The `<p class="host-stand-in">` paragraph is host chrome that makes the html and cdn forms a runnable page; a react consumer is not installing a paragraph that says the page is a stand-in. The html and cdn forms render the whole page; the component renderers emit this subtree.
6. **The three literal `hidden` attributes stay, beside their `:hidden` bindings.** `support-widget.html:19` (the back button), `:32` (the recent row) and `:35` (the unread dot) are authored hidden and the old script un-hid them. A `:hidden` binding alone leaves all three VISIBLE from parse until the first apply, which is a flash of the wrong widget on every load. A literal and a binding of the same name on one element are both legal and they are different channels: the literal is the pre-registration value, the binding takes over at the first apply.
7. **`seed:value="home"` on the tab bar**, beside `.value="tab"`, for the same reason: `support-widget.html:73` authored `value="home"` and `kai-tab-bar` reads it before the binder runs.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Support widget</title>
    <link rel="stylesheet" href="./support-widget.css" />
  </head>
  <body>
    <p class="host-stand-in">This blank page stands in for your site. The chat widget is in the bottom-right corner.</p>

    <!-- The wiring is DECLARED here and applied by the generated binder (spec
         3.1): .prop sets a JS property, :attr a runtime scalar attribute,
         @event an action on THIS element (kai-* events do not bubble), #ref
         names a handle the controller calls methods on, *for repeats with a
         mandatory :key, and seed: writes a literal once. A binding holds a
         field name, never an expression: every derivation is a field of
         State. The ids are for the block driver's state script, which is
         authored rather than generated. -->
    <kai-dock
      id="dock"
      data-block-root
      #ref="dock"
      label="Support"
      position="bottom-end"
      hide-close
      .unread="unread"
      @kai-open-change="openChange"
    >
      <kai-panel slot="panel">
        <kai-panel-header slot="header">
          <kai-button
            id="back"
            slot="start"
            variant="ghost"
            size="icon-sm"
            icon="arrow-left"
            label="Back"
            hidden
            :hidden="backHidden"
            @kai-click="back"
          ></kai-button>
          Support
          <kai-button
            id="close"
            slot="end"
            variant="ghost"
            size="icon-sm"
            icon="x"
            label="Close Support"
            @kai-click="close"
          ></kai-button>
        </kai-panel-header>

        <!-- The stack OWNS navigation. `view` is a SEED: the element
             self-manages it afterwards, and driving it from the same state
             kai-view-change writes is a controlled loop that undoes every
             navigation in React (spec 8b, amendment 5). -->
        <kai-view-stack id="stack" #ref="stack" seed:view="home" @kai-view-change="viewChange">
          <kai-view name="home" tab-root>
            <div class="home">
              <div class="greeting">
                <h2>How can we help? &#x1F44B;</h2>
                <p class="subtitle">Orders, refunds, anything.</p>
              </div>
              <kai-row id="recent" class="recent-card" interactive hidden :hidden="recentHidden" @kai-click="openRecent">
                <span .textContent="recentTitle"></span>
                <span slot="subtitle" .textContent="recentPreview" :hidden="recentPreviewHidden"></span>
                <span slot="trailing" class="unread-dot" hidden :hidden="recentDotHidden"></span>
                <span slot="trailing" .textContent="recentTime"></span>
              </kai-row>
              <kai-button id="cta" full align="start" icon-trailing="arrow-right" @kai-click="startNew">Send us a message</kai-button>
              <div class="home-links">
                <kai-row href="https://ui.kitn.ai" chevron>
                  <kai-icon slot="leading" name="book-open" size="sm"></kai-icon>
                  Help center
                  <span slot="subtitle">Guides and FAQs</span>
                </kai-row>
              </div>
            </div>
          </kai-view>

          <!-- Messages tab: ITEM mode. The data-driven prop renders a group
               header this block deliberately avoids, so the rows are the
               block's own and the list binding is what builds them. -->
          <kai-view name="messages" tab-root>
            <kai-conversations
              id="conversations"
              searchable="false"
              .activeId="activeId"
              @kai-conversation-select="openConversation"
            >
              <span slot="header"></span>
              <kai-conversation-item
                *for="row of conversationRows"
                :key="row.id"
                :conversation-id="row.id"
                density="panel"
                :unread="row.unread"
              >
                <span .textContent="row.title"></span>
                <span slot="meta" .textContent="row.preview" :hidden="row.previewHidden"></span>
                <span slot="menu" class="row-time" .textContent="row.time"></span>
              </kai-conversation-item>
            </kai-conversations>
            <kai-button id="new-conversation" class="new-pill" variant="outline" size="sm" @kai-click="startNew">New conversation</kai-button>
          </kai-view>

          <kai-view name="chat">
            <kai-thread id="thread" .messages="messages" .loading="loading">
              <kai-empty
                slot="empty"
                empty-title="Hi, we're here to help"
                description="Ask us about orders, refunds, and more."
              ></kai-empty>
            </kai-thread>
            <kai-prompt-input
              id="prompt"
              placeholder="Ask anything"
              .suggestions="suggestions"
              .loading="loading"
              @kai-submit="submit"
            ></kai-prompt-input>
          </kai-view>
        </kai-view-stack>

        <kai-tab-bar
          id="tabbar"
          slot="footer"
          label="Widget navigation"
          seed:value="home"
          .value="tab"
          :hidden="tabBarHidden"
          @kai-tab-change="tabChange"
        >
          <kai-tab-bar-item value="home" icon="home">Home</kai-tab-bar-item>
          <kai-tab-bar-item id="tab-messages" value="messages" icon="message-square" .dot="unread">Messages</kai-tab-bar-item>
        </kai-tab-bar>
      </kai-panel>
    </kai-dock>
  </body>
</html>
```

- [ ] **Step 2: Write the controller**

Copy `docs/superpowers/research/2026-09-02-blocks-contract-spike.md` appendix **A2** ("The framework-neutral controller") verbatim into `packages/blocks/blocks/support-widget/support-widget.controller.ts`, then apply exactly these five changes. They are all the differences; anything else you feel like changing is a finding for the PR body, not an edit.

1. **`ConversationSummary` comes from `@kitn.ai/ui/stores`.** PR B0 landed the re-export (its F-10). Replace the two lines

```ts
// GAP: `ConversationSummary` is the type `onSummariesChange` hands you, but
// `@kitn.ai/ui/stores` does not re-export it - only the heavy root entry does.
import type { ConversationSummary } from '@kitn.ai/ui';
```

with the type joining the import beside it:

```ts
import {
  localStorageStore,
  createConversationController,
  isConversationUnread,
  type ConversationSummary,
} from '@kitn.ai/ui/stores';
```

2. **The refs are the real element interfaces**, not structural narrowings. PR B0's F-9 fix types a React ref as the element interface, so the react tree assigns without a cast and the no-workaround grep in Task 12 stays meaningful. Replace `SupportWidgetRefs` with:

```ts
import type { KaiDockElement, KaiViewStackElement } from '@kitn.ai/ui/elements';

/** The element handles the controller calls methods on. Nullable because no
 *  framework has them at construction: React's ref is null through the first
 *  render, Vue's until mount. */
export interface SupportWidgetRefs {
  stack: KaiViewStackElement | null;
  dock: KaiDockElement | null;
}
```

3. **The action JSDoc names the bindings that actually exist.** The spike's A2 has THREE wrong references, not two: `back`, `close` AND `startNew` are each documented as `@click` (`startNew`'s reads "`@click` on the home CTA and the New conversation pill"). All three are `@kai-click` on their buttons in the authored page. Fix all three comment lines and grep the file for a fourth: `grep -n '@click' packages/blocks/blocks/support-widget/support-widget.controller.ts` must come back empty.

4. **The stale F-9 reference in the header comment goes.** The `relativeTimeShort` note says "spike finding F-9"; F-9 in the published report is the react typed-ref gap, and this is the "no relative-time formatter is exported" residual. Rewrite that comment to name the fact rather than a number: `KNOWN RESIDUAL: the "2m ago" formatter is internal to the Solid layer and is not exported from @kitn.ai/ui/stores, so the block restates it. Delete this when the kit ships it beside byRecency.`

5. **`MOCK_SCRIPT` and friends come from `./mock`**, not `./mock.js`: the import stays extensionless so both the `.ts` source and its emitted `.js` twin resolve.

- [ ] **Step 3: `mock.js` becomes `mock.ts`**

```bash
cd "$WT" && git mv packages/blocks/blocks/support-widget/mock.js packages/blocks/blocks/support-widget/mock.ts
```

No content change: it is `export const` constants and they are already valid TypeScript. Confirm with `git diff --cached --stat` that the rename carries no edit.

- [ ] **Step 4: Delete the imperative script and fix the manifest**

```bash
cd "$WT" && git rm packages/blocks/blocks/support-widget/support-widget.js
```

`registry-item.json`'s `files[]` becomes:

```json
  "files": [
    { "path": "support-widget.html", "type": "registry:page" },
    { "path": "support-widget.controller.ts", "type": "registry:file" },
    { "path": "support-widget.css", "type": "registry:file" },
    { "path": "mock.ts", "type": "registry:file" }
  ],
```

and the `docs` string's last sentence changes from "replace the mock responder in support-widget.js" to "replace the mock responder in support-widget.controller.ts". Keep it free of em dashes and emoji: `validateBlockManifest` refuses both.

- [ ] **Step 4b: One readiness constant**

The generated binder emits `window.__blockReady = true`, which is already what two of the three blocks wait on. Two sites still use the old name and both move now, in this commit, or the runs that read them go red:

```bash
cd "$WT" && sed -i '' 's/__widgetReady/__blockReady/' packages/blocks/blocks/support-widget/states.mjs
cd "$WT" && sed -i '' 's/__widgetReady/__blockReady/' packages/ui/scripts/block-driver/scenarios/kai-chat-facade.mjs
cd "$WT" && sed -i '' 's/__widgetReady/__blockReady/' packages/ui/scripts/block-driver/pages/kai-chat-facade/app.js
cd "$WT" && if grep -rn "__widgetReady" packages apps --include='*.mjs' --include='*.js' --include='*.ts' | grep -v node_modules | grep -v '/dist/' | grep -v '/pages/generated/'; then echo "LEFTOVER __widgetReady"; exit 1; else echo "clean"; fi
```

The facade PAGE and the facade SCENARIO move together: the page sets the signal and the scenario waits on it, and renaming one alone hangs the facade run for fifteen seconds and reports a timeout that reads like a broken harness.

- [ ] **Step 5: `gen-blocks.mjs` writes the twins**

After the discovery block and before the outputs, in `packages/ui/scripts/gen-blocks.mjs`:

```js
// The controller is TypeScript and two delivery forms land in contexts with
// no build step (a pasted single file, and a tree dropped next to markup), so
// the types come off HERE, once, and the stripped twin travels with the block
// inside the emitted item JSON. `packages/blocks` cannot do it: it depends on
// nothing, and the two RUNTIME renderers (the kai dev gallery route, inside
// the published CLI, and `create-kai add`, on Node >= 20.19) have no stripper
// either. Two strippers would emit two different files and break the one
// claim src/forms/index.ts makes.
const stripTypes = (source, fileName) =>
  esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: fileName }).code;

const withTwins = blocks.map((block) => blocksMod.withStrippedTwins(block, stripTypes));
```

and use `withTwins` everywhere `blocks` was used below (the index, the item JSON, both `generateCdnForm` calls). Leave the contract checks running over the ORIGINAL `blocks`, so a defect is reported against the authored source and not against generated output.

- [ ] **Step 6: `create-kai`'s build writes the twins too**

`packages/create-kai/scripts/build.mjs:173` is ONE recursive copy (`await cp(blocksSrcDir, path.join(dist, 'blocks'), { recursive: true })`), not a per-entry loop, so there is no per-file hook to hang this on. Add a POST-COPY WALK immediately after it, before the `blockCount` check at `:174`:

```js
  // The .js twin beside every .ts block source, written AFTER the recursive
  // copy because that copy has no per-file hook. Same esbuild options as
  // packages/ui/scripts/gen-blocks.mjs -- the two are a COPY, registered in
  // docs/coupling-map.md section 4, and test/block-twins.test.ts asserts they
  // produce the same bytes. `add` renders the html form at RUNTIME with no
  // stripper of its own, so the twin has to be in the tarball.
  const blocksDist = path.join(dist, 'blocks');
  let twins = 0;
  for (const dirent of await readdir(blocksDist, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dir = path.join(blocksDist, dirent.name);
    for (const file of await readdir(dir)) {
      if (!file.endsWith('.ts')) continue;
      const js = esbuild.transformSync(await readFile(path.join(dir, file), 'utf8'), {
        loader: 'ts', format: 'esm', target: 'es2022', sourcefile: file,
      }).code;
      await writeFile(path.join(dir, file.replace(/\.ts$/, '.js')), js);
      twins += 1;
    }
  }
  // Anti-vacuity, same shape as zeroBlocksCopiedProblem beside it: every block
  // has a controller, so zero twins means the walk is broken, not that there
  // was nothing to do.
  if (twins === 0) {
    console.error('  blocks    RED no .js twins written; every block has a .controller.ts, so a zero here is a broken walk');
    process.exit(1);
  }
  console.log(`  blocks    ${twins} .js twin(s) written beside their .ts sources`);
```

Check which of `readdir` / `readFile` / `writeFile` and `esbuild` that file already imports before adding an import; it uses `node:fs/promises` for `cp` and `readdir` already.

and add the twin assertion to `packages/create-kai/scripts/verify-pack.mjs` beside the existing `dist/blocks/**` one: every `dist/blocks/<id>/<name>.ts` in the tarball has its `<name>.js` twin. A tarball with sources and no twins installs fine and then fails at `add` time, which is the same failure shape the missing-templates assertion exists for.

- [ ] **Step 7: Pin that the two strippers agree**

`packages/create-kai/test/block-twins.test.ts`:

```ts
/**
 * The .js twin is written in TWO places -- packages/ui/scripts/gen-blocks.mjs
 * (into the emitted item JSON) and this package's build (beside the copied
 * source) -- because neither runtime renderer can strip types itself. Two
 * writers of one artifact is a copy, and this is the check that keeps them
 * one file rather than two.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { transformSync } from 'esbuild';

const DIST_BLOCKS = resolve(__dirname, '../dist/blocks');

describe('the stripped twins in the packed CLI', () => {
  it('exist for every .ts block source and equal what esbuild produces from it', () => {
    if (!existsSync(DIST_BLOCKS)) {
      throw new Error(`${DIST_BLOCKS} is missing. Run \`pnpm --filter create-kai run build\` first: this asserts a BUILD artifact.`);
    }
    let checked = 0;
    for (const id of readdirSync(DIST_BLOCKS)) {
      const dir = join(DIST_BLOCKS, id);
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.ts')) continue;
        const twin = join(dir, file.replace(/\.ts$/, '.js'));
        expect(existsSync(twin), `${id}/${file} has no .js twin`).toBe(true);
        const expected = transformSync(readFileSync(join(dir, file), 'utf8'), {
          loader: 'ts', format: 'esm', target: 'es2022', sourcefile: file,
        }).code;
        expect(readFileSync(twin, 'utf8')).toBe(expected);
        checked += 1;
      }
    }
    // Anti-vacuity: a scan that finds nothing must not read as a pass.
    expect(checked).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 8: The cdn inliner learns one more level -- write the failing test first**

Add to the "the CDN-form generator" describe in `packages/blocks/tests/registry.test.ts`:

```ts
  it('inlines one level: the entry, the controller it imports, and the controller\'s own leaf import', () => {
    const files = new Map([
      ['b.js', "import '@kitn.ai/ui/autoloader';\nimport { createController } from './b.controller.js';\ncreateController({});\n"],
      ['b.controller.js', "import { readOpenAIStream } from '@kitn.ai/ui/wire';\nimport { MOCK } from './mock.js';\nexport function createController() { return [readOpenAIStream, MOCK]; }\n"],
      ['mock.js', 'export const MOCK = [];\n'],
    ]);
    const out = rewriteBlockScript(files.get('b.js') as string, files, { version: VERSION });
    expect(out.errors).toEqual([]);
    const code = out.code as string;
    expect(code).toContain(`@kitn.ai/ui@${VERSION}/dist/elements/autoloader.js`);
    expect(code).toContain(`@kitn.ai/ui@${VERSION}/dist/wire.js`);
    expect(code).toContain('const MOCK = [];');
    expect(code).not.toContain("from './b.controller.js'");
    expect(code).not.toContain("from './mock.js'");
  });

  it('refuses a THIRD level rather than inlining a module graph', () => {
    const files = new Map([
      ['b.js', "import { a } from './a.js';\na();\n"],
      ['a.js', "import { b } from './b2.js';\nexport const a = () => b;\n"],
      ['b2.js', "import { c } from './c.js';\nexport const b = c;\n"],
      ['c.js', 'export const c = 1;\n'],
    ]);
    const out = rewriteBlockScript(files.get('b.js') as string, files, { version: VERSION });
    expect(out.errors.join(' ')).toContain('two levels');
    expect(out.errors.join(' ')).toContain('b2.js');
  });

  it('still refuses a bare import that is not a proven @kitn.ai/ui entry, at any level', () => {
    const files = new Map([
      ['b.js', "import { x } from './a.js';\nx();\n"],
      ['a.js', "import lodash from 'lodash';\nexport const x = lodash;\n"],
    ]);
    expect(rewriteBlockScript(files.get('b.js') as string, files, { version: VERSION }).errors.join(' '))
      .toContain('lodash');
  });
```

- [ ] **Step 9: Recurse one level in `registry.ts`**

Replace `inlineRelativeModule` and give `rewriteBlockScript` a depth:

```ts
/**
 * Inline a relative module into the entry script.
 *
 * ONE LEVEL DEEP, deliberately. The generated binder imports the controller,
 * and the controller imports its mock plus the `@kitn.ai/ui` entries it
 * parses through -- that is the shape the authored contract produces, and it
 * is exactly two levels. A third is a module graph, and a single pasted file
 * that reconstructs a module graph by concatenation is a thing that works
 * until it does not (order, cycles, name collisions). So the third level is a
 * loud refusal naming the file, not a deeper inliner.
 *
 * Bare `@kitn.ai/ui/*` imports inside an inlined module are rewritten onto the
 * pinned CDN entries and hoisted exactly like the entry's own, through the
 * same closed `CDN_IMPORT_ENTRIES` set.
 */
function inlineRelativeModule(
  name: string,
  content: string,
  files: ReadonlyMap<string, string>,
  base: string,
  depth: number,
  hoistedImports: string[],
  errors: string[],
): string {
  const body: string[] = [];
  for (const line of content.split('\n')) {
    const m = IMPORT_RE.exec(line.trim());
    if (!m) { body.push(line); continue; }
    const [, clause, spec] = m;
    if (spec.startsWith('./') || spec.startsWith('../')) {
      if (depth >= 1) {
        errors.push(`"${name}" imports "${spec}": the single-file paste form inlines two levels (the entry and what it imports), not a module graph. Flatten the block, or use \`create-kai add\` inside a project.`);
        continue;
      }
      const childName = spec.replace(/^\.\//, '');
      const child = files.get(childName) ?? files.get(`${childName}.js`);
      if (child === undefined) { errors.push(`import "${spec}" does not resolve to a file in the block directory`); continue; }
      body.push(inlineRelativeModule(childName, child, files, base, depth + 1, hoistedImports, errors));
      continue;
    }
    const resolved = rewriteBareImport(spec, base);
    if (resolved.error) { errors.push(resolved.error); continue; }
    const importOf = clause ? `import ${clause} from` : 'import';
    const annotate = base.includes('@kitn.ai/ui@');
    hoistedImports.push(`${importOf} '${resolved.url}';${annotate ? ' // x-release-please-version' : ''}`);
  }
  return `// ---- inlined from ./${name} ----\n${body.join('\n').replace(/^export\s+/gm, '')}`;
}
```

and in `rewriteBlockScript`, pass the entry's relative imports through it with `depth = 0`, collecting the hoisted bare imports into the same `out` array the entry's own produce, deduped in order. The `annotate` computation moves next to the base so the two agree.

**Import ORDER is load-bearing** and the test above does not cover it: an inlined module's body must appear ABOVE the code that uses it, and the deepest module first. Keep the existing "hoisted, then out" join, and push a child's text before its importer's.

- [ ] **Step 10: Move `renderCdnFormFiles` into `src/forms/cdn.ts`, rendering from the html form**

```ts
/**
 * The single-file paste form: the html form, inlined and pinned.
 *
 * It renders the HTML FORM first and inlines that, rather than reaching for
 * the authored files: the page a visitor pastes and the page `add` writes
 * then differ only in how their imports resolve, which is the whole claim the
 * cdn form makes.
 */
export function renderCdnFormFiles(block: Block, opts: CdnFormOptions): FormFile[] {
  if ((block.manifest.registryDependencies ?? []).some((dep) => !dep.startsWith('route:'))) {
    throw new Error(
      `${block.name} composes other blocks, and the single-file paste form cannot carry them yet; run \`create-kai add\` inside a project instead`,
    );
  }
  const html = renderHtmlForm(block);
  const rendered: Block = {
    name: block.name,
    manifest: {
      ...block.manifest,
      files: html.map((f) => ({ path: f.path, type: f.path.endsWith('.html') ? ('registry:page' as const) : ('registry:file' as const) })),
    },
    files: new Map(html.map((f) => [f.path, f.content])),
  };
  const form = generateCdnForm(rendered, opts);
  if (!form.html) throw new Error(`${block.name}: the paste form cannot be generated: ${form.errors.join('; ')}`);
  return [{ path: `${block.name}.html`, content: form.html, target: `${block.name}.html` }];
}
```

Note the consequence: the cdn form now inlines the binder's `@kitn.ai/ui/elements` import rather than the autoloader, because `renderHtmlForm` applies `adaptRegistrationForBundler`. **That is wrong for the cdn form** -- the autoloader is its native pattern and `kai.es.js` is the register-all bundle. So `renderHtmlForm` grows one option: `renderHtmlForm(block, { registration: 'bundler' | 'autoloader' })`, defaulting to `'bundler'`, and `cdn.ts` passes `'autoloader'`. Add a test for it in `tests/html-form.test.ts`:

```ts
  it('keeps the autoloader when the caller asks for it (the cdn form s native pattern)', () => {
    const binder = byPath(renderHtmlForm(stripped(), { registration: 'autoloader' })).get('fixture.js')!;
    expect(binder).toContain("import '@kitn.ai/ui/autoloader';");
  });
```

- [ ] **Step 11: Route the three `generateCdnForm` call sites through the html form**

This is the step the merge exists for. Three call sites render the cdn form from the AUTHORED block, and after the conversion an authored page carries no script for `generateCdnForm` to inline:

| Site | Today | After |
|---|---|---|
| `packages/ui/scripts/gen-blocks.mjs:128` | `blocksMod.generateCdnForm(block, { version: VERSION })` | `blocksMod.renderCdnFormFiles(twinned, { version: VERSION })[0].content` |
| `packages/ui/scripts/gen-blocks.mjs:134` | `blocksMod.generateCdnForm(block, { version: VERSION, base: '/kit/' })` | `blocksMod.renderCdnFormFiles(twinned, { version: VERSION, base: '/kit/' })[0].content` |
| `packages/ui/mcp/construct/dev.ts:662` (`galleryPreviewHtml`) | `generateCdnForm(blockFromRegistryItem(item), { version, base: '/kit/' })` | `renderCdnFormFiles(...)` inside a try, returning `{ errors: [message] }` on a refusal -- its signature already answers `{ html?, errors }`, so the refusal path it has is the one to reuse |

`generateCdnForm` itself is UNCHANGED and stays exported: it is the inliner, and `renderCdnFormFiles` is what feeds it a rendered page. Anything that still calls it directly on an authored block is the defect this step removes.

- [ ] **Step 12: Assert the emitted cdn form and driver page actually carry the block**

The failure this catches is silent by construction: a form with no script is still valid HTML and still renders a page.

```bash
cd "$WT/packages/ui" && node scripts/gen-blocks.mjs
cd "$WT" && for f in packages/ui/dist/blocks/r/support-widget.cdn.html packages/ui/scripts/block-driver/pages/generated/support-widget/index.html; do
  echo "== $f"
  grep -c "createController" "$f"
  grep -c "window.__blockReady = true" "$f"
  grep -c "customElements.whenDefined" "$f"
done
```

Expected: each count at least 1, in BOTH files. A zero anywhere means the call site above was missed and the form is markup with no block in it. Then add the same assertion to `packages/ui/mcp/tests/blocks-artifacts.test.ts` so it is a test rather than a one-time look:

```ts
  it('the emitted cdn form and driver page carry the binder and the controller, not just markup', () => {
    for (const block of blocks) {
      for (const path of [
        join(DIST_BLOCKS, 'r', `${block.name}.cdn.html`),
        join(ROOT, 'scripts/block-driver/pages/generated', block.name, 'index.html'),
      ]) {
        const html = readBuiltArtifact(path);
        expect(html, path).toContain('createController');
        expect(html, path).toContain('window.__blockReady = true');
      }
    }
  });
```

- [ ] **Step 13: Teach `blocks-artifacts.test.ts` about the twins and the new cdn path**

`packages/ui/mcp/tests/blocks-artifacts.test.ts:87-105` compares the BUILT artifacts against what the current sources produce, and both of its comparisons are now wrong in the same way: `buildRegistryItem(block)` is computed from the AUTHORED block (no twins) while the built JSON carries them, and `generateCdnForm(block)` is the authored-block call this task just removed from the generator. This test is in `packages/ui`, which has esbuild, so it can derive the twins the same way the generator does:

```ts
import { transformSync } from 'esbuild';
import { withStrippedTwins, renderCdnFormFiles } from '@kitn.ai/blocks/forms';

const stripTypes = (source: string, fileName: string) =>
  transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: fileName }).code;
const twinned = blocks.map((b) => withStrippedTwins(b, stripTypes));
```

then `buildRegistryItem(twinned[i])` and `renderCdnFormFiles(twinned[i], { version: VERSION })[0].content` replace the two authored-block calls. **If this test goes green without the twins line, it is not comparing what you think**: delete the line, watch it go red naming the missing `.js` entry, put it back.

- [ ] **Step 13b: Convert the `kai dev` form-route fixture, all three halves at once**

Tasks 7 and 8 left `packages/ui/mcp/construct/dev.test.ts`'s synthetic `demo-block` unconverted and asserted the refusal instead, because a fixture cannot be half-converted: one renderer dispatch serves all three forms. All three are new now, so convert the fixture at `:695-706`:

```ts
  files: [
    {
      path: 'demo-block.html',
      type: 'registry:page' as const,
      content:
        '<!doctype html>\n<html lang="en"><head><link rel="stylesheet" href="./demo-block.css" /></head>' +
        '<body><div data-block-root><kai-panel :hidden="collapsed" @kai-click="open"></kai-panel></div></body></html>',
    },
    {
      path: 'demo-block.controller.ts',
      type: 'registry:file' as const,
      content:
        'export interface DemoBlockState { collapsed: boolean; }\n' +
        'export interface DemoBlockRefs { panel: unknown; }\n' +
        'export interface DemoBlockActions { open(): void; boot(): Promise<void>; }\n' +
        'export function createController(deps: unknown) { return deps as never; }\n',
    },
    { path: 'demo-block.controller.js', type: 'registry:file' as const, content: 'export function createController(deps) { return deps; }\n' },
    { path: 'demo-block.css', type: 'registry:file' as const, content: 'body { margin: 0; }' },
  ],
```

The `.js` twin is in the fixture by hand because this route renders from an item JSON and in production `gen-blocks` puts it there (Task 9). Then at `:777-787`:

- `expect(wcJs).toContain('(async () => {')` becomes `expect(htmlJs).toContain('window.__blockReady = true;')`. The IIFE wrap went with the authored entry script; the readiness line is what the generated binder ends with.
- `expect(htmlJs).toContain(`import '@kitn.ai/ui/elements'`)` stays: `adaptRegistrationForBundler` still rewrites the autoloader for the add form.
- the react `arrayContaining(['DemoBlock.tsx', 'kai-elements.d.ts', 'demo-block.d.ts', 'demo-block.js'])` becomes `arrayContaining(['DemoBlock.tsx', 'useDemoBlock.ts', 'demo-block.controller.ts', 'README.md'])`.
- the cdn assertion (the pinned jsDelivr URL derived from `dirs.version`) must still pass, and it is now proving something new: that this task's rerouting of `galleryPreviewHtml` and the form route through the html form works end to end.
- Tasks 7 and 8's "an unconverted block gets a loud refusal from the html AND react forms" case STAYS, moved onto its own inline unconverted fixture rather than the shared `ITEM`. The refusal path is permanent behaviour -- a consumer with an old block hits it -- so it keeps a test after the shared fixture converts.

- [ ] **Step 13c: Turn `add.test.ts`'s react-form case back onto the real blocks**

Task 8 replaced `packages/create-kai/test/add.test.ts:204-226` with a refusal loop and left the table of positive assertions in its own text. Apply that table now: the case becomes "writes the component, the hook and the controller for every block; never the page html", over the real blocks, with the assertions Task 8 enumerated. Delete the refusal loop; the refusal is covered by `dev.test.ts`'s inline fixture and by the blocks suite.

```bash
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai exec vitest run test/add.test.ts
```



```bash
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/construct/dev.test.ts
```

- [ ] **Step 14: Build, and read what the generator says**

```bash
cd "$WT/packages/ui" && npm run build
cd "$WT/packages/ui" && node scripts/gen-blocks.mjs
cd "$WT" && cat packages/ui/scripts/block-driver/pages/generated/support-widget/index.html | head -60
cd "$WT" && cat packages/ui/dist/blocks/r/support-widget.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).files.map(f=>f.path).join('\n')))"
```

Expected: the driver page carries the inlined binder and controller, and the item JSON lists the four authored files plus the two twins. A generation error here is a contract error and the message names the file and line; fix the block, not the generator.

- [ ] **Step 15: Run the driver against the OLD baseline FIRST, and print the diff**

This is the step the whole task is judged on. **Do not pass `--record`.**

```bash
cd "$WT/packages/ui" && node scripts/block-driver/driver.mjs ../blocks/blocks/support-widget/states.mjs \
  --serve scripts/block-driver/pages --pages block --schemes light,dark \
  --baseline scripts/block-driver/baselines/support-widget.json \
  --shots "$SCRATCH/driver-after" --out "$SCRATCH/driver-after.json"
```

Expected: either PASS (the conversion is behaviour-identical, which is the goal) or a list of `baseline/block/<scheme>/<state>: probe "<key>" ...` lines. Copy that list into the handoff verbatim. Then classify every moved probe:

- `greeting`, `helpLink`, `emptyTitle`, `pulledUp`, `tool`, `dhl`, `backArrow`, `homeTab`, `suggestionsStillShowing`, `rowTitleAsPolicied`, `unreadAfterClosedReply`, `unreadAfterReopen`, `emptyAfterNewChat`, `restoreAsPolicied` are TEXT / ORDERING / STATE probes. A move here means the conversion changed behaviour: investigate before anything else.
- `homeCtaClearOfSubtitle`, `homeSubtitleToCtaGap`, `homeTitleToSubtitleGap`, `homeSubtitleLineBox`, and every `styleProbes` entry, are LAYOUT probes. **A moved layout probe is a STOP.** The markup is supposed to be the same markup; if a gap moved, the serializer changed the DOM in a way nobody intended (a dropped whitespace text node between elements is the likely cause). Report it, do not re-record.

- [ ] **Step 16: Look at the screenshots**

```bash
cd "$WT" && ls "$SCRATCH/driver-after"
```

Open `block-light-2-home.png`, `block-light-4-reply.png` and `block-light-5-conversations.png` beside the committed `packages/ui/scripts/block-driver/baselines/screenshots-support-widget/` versions of the same names. Say in the handoff what you compared and what you saw. The owner-caught defect this scenario exists for (a CTA overlapping the subtitle's descenders) was visible in a recorded baseline and invisible to every probe until the probes were added, so eyes on the image are part of the gate.

- [ ] **Step 17: Re-record ONLY if Step 15 said text or ordering, never layout**

```bash
cd "$WT/packages/ui" && node scripts/block-driver/driver.mjs ../blocks/blocks/support-widget/states.mjs \
  --serve scripts/block-driver/pages --pages block --schemes light,dark \
  --record scripts/block-driver/baselines/support-widget.json \
  --shots scripts/block-driver/baselines/screenshots-support-widget
cd "$WT" && git diff --stat packages/ui/scripts/block-driver/baselines
```

If Step 15 was a clean PASS, skip this step entirely and say so: an unchanged baseline is the strongest possible result for this task.

- [ ] **Step 18: The gate**

```bash
cd "$WT/packages/ui" && npm run verify:blocks
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai run verify:pack
cd "$WT" && pnpm --filter create-kai exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/tests/blocks-artifacts.test.ts
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/construct/dev.test.ts
```

Expected: all green, and three of these are green for a NEW reason, which is the thing to read: `create-kai`'s suite because its react-form case is back on the real blocks (Step 13c), `dev.test.ts` because its fixture is converted and all three forms assert results again (Step 13b), and `verify:blocks` because it was absent from Tasks 7 and 8's lists and returns here. `blocks-artifacts.test.ts` compares the built `dist/blocks/**` against what the current sources produce, so it is the fast check that the twins and the new cdn path agree with the build.

**If any of those three is still asserting a refusal at the end of this task, the task is not done.** A refusal assertion that outlives the refusal is a test pinning a lie.

**Three known deltas this conversion makes. Each is expected; each is a finding if it shows up somewhere else.**

1. **The `slot="meta"` preview span becomes permanent-and-hidden.** `support-widget.js:87-93` CREATED that span only when a preview existed; the declarative form authors it once and binds `:hidden="row.previewHidden"`. `kai-conversation-item` styles its meta region on slot occupancy, and a hidden assigned node still occupies a slot, so a row with no preview may now reserve the meta line's height. Expected outcome: no visible change, because the row's height is driven by `density="panel"`. **If a layout probe moves in the driver step, the fix is a KIT fix** -- slot-occupancy detection in `packages/ui/src/components/conversation-item.tsx` should ignore assigned nodes that are `hidden` -- and NOT a new binding kind for conditional children. Report it and stop; adding a `*if` to the grammar to dodge a kit defect is how a syntax starts collecting exceptions.
2. **`.value="tab"` is re-asserted on every notification.** The old script wrote `tabbar.value = root` only inside the `kai-view-change` handler; the binder writes it in every `apply()`. `kai-tab-bar` reflects and de-dupes its own value, so the expected outcome is no change, and the `seed:value="home"` covers the pre-registration read.
3. **`.activeId` applies before any row exists.** On the FIRST apply, `conversationRows` is empty and `activeId` is `undefined`, so `kai-conversations` receives `activeId = undefined` with no children. That is what the old script also did (`renderSummaries` set `activeId` after appending rows, but the first call had no summaries either). Expected outcome: no change. If the list renders a selection state for a row that does not exist yet, that is a finding.

- [ ] **Step 19: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): support-widget moves onto the authored contract

The wiring is off the script and on the markup: .prop / :attr / @kai-event /
#ref / *for with :key / seed:view, and the imperative support-widget.js is
deleted. support-widget.controller.ts is the framework-neutral logic (the
spike's conversion, with ConversationSummary now from @kitn.ai/ui/stores and
the refs typed as the real element interfaces, both landed by PR B0), and
mock.js becomes mock.ts.

gen-blocks and create-kai's build each write the stripped .js twin beside
every .ts source, with the same esbuild options; test/block-twins.test.ts
asserts they produce the same bytes and verify-pack refuses a tarball
carrying sources with no twins.

The cdn path lands here rather than in its own commit, because it has to:
gen-blocks and dev.ts rendered the paste form from the AUTHORED block, and an
authored page now carries no script for the inliner to inline. All three call
sites render the html form first; the inliner recurses one level (the binder,
the controller, and the controller's leaf imports) and refuses a third by
name; and the emitted cdn.html and driver page are asserted to CONTAIN the
binder and the controller rather than being valid empty markup.

One readiness constant, `__blockReady`: two of the three blocks already used
it, and a generated binder cannot emit a per-block name. support-widget's
states.mjs, the facade scenario and the facade page move together.

This is also the commit where the assertions the previous two tasks had to
defer turn positive again: create-kai's react-form case goes back onto the
real blocks, the kai dev route's three forms assert results instead of the
refusal, and verify:blocks returns to the gate list. The refusal path keeps
its own test, on an inline unconverted fixture, because a consumer with an
old block still hits it.

Driver baselines: <PASTE the Step 9 verdict here -- either "unchanged, the
conversion is behaviour-identical" or the enumerated probes that moved and
why each is text or ordering rather than layout>.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 10: the blocks compile cells, and the two new `verify:blocks` structural cells

**Files:**
- Create: `packages/ui/scripts/lib/block-compile-cells.mjs`
- Modify: `packages/ui/scripts/verify-scaffold-compiles.mjs` (call the cells as a fourth PHASE of `main()`, after `await routeCheck(scaffold)` at `:1953`)
- Modify: `packages/ui/scripts/gen-blocks.mjs` (emit the per-form JSON the cells and the site read)
- Modify: `packages/ui/scripts/verify-blocks.mjs` (the `html-binder` and `react-tree` cells, and their self-test plants)

**Interfaces:**
- Consumes: `renderBlockForm` for every discovered block; `createConsumerTsc` from `packages/ui/scripts/lib/consumer-tsc-projects.mjs`.
- Produces: `runBlockCompileCells({ tsc, blocks, fail, log })` -> `{ cells: number; failures: string[] }`, and `dist/blocks/f/<id>.<form>.json` per block per form.

- [ ] **Step 1: Emit the per-form JSON**

In `gen-blocks.mjs`, beside the item JSON:

```js
// One form JSON per block per FRAMEWORK renderer (spec 3.5): the site's Code
// view reads these static files, and so do the compile cells, so what the page
// shows and what the cells compile are the same bytes. NOT inlined into
// r/<id>.json: that file is the CLI's integration surface and every `add`
// would then download the trees it will not use.
for (const form of blocksMod.BLOCK_FORMS) {
  const files = blocksMod.renderBlockForm(block, form.id, { cdn: { version: VERSION } });
  put(join(OUT_DIR, 'f', `${block.name}.${form.id}.json`), JSON.stringify({ block: block.name, form: form.id, files }, null, 2) + '\n');
}
```

using the twinned block. Then rebuild and confirm the new paths appear:

```bash
cd "$WT/packages/ui" && node scripts/gen-blocks.mjs && find dist/blocks/f -type f | sort
```

- [ ] **Step 2: Write the cells, and watch them fail on a planted defect FIRST**

`packages/ui/scripts/lib/block-compile-cells.mjs`:

```js
// blocks x {html, react} COMPILE cells (spec section 5.1).
//
// They run inside verify:scaffold rather than as their own script because
// they share its harness: `createConsumerTsc` stands up a node_modules tree
// with the REAL packages symlinked and one tsc project per consumer shape,
// and `sandbox(project, name)` compiles a DIRECTORY under that project's own
// options with a recursive include. Standing that up twice would double the
// cost of the slowest gate in the repo for nothing.
//
// A NOTE ON THE WORD "BLOCK". In verify-scaffold-compiles.mjs, "block (1)"
// and "block (2)" are the two halves of the SCAFFOLDER'S emitted output, the
// front end and the backend route. Blocks-the-product are a different thing
// with the same name, so these cells are a fourth PHASE of that script's
// main(), beside routeCheck, and never "block (4)".
//
// The axis is derived twice over: the block ids from the registry scan, the
// forms from the renderer list. Neither is written here.
//
// react compiles under the `default` project (the same one the scaffolder's
// react front end uses). html emits .js, which tsc cannot check, so its cell
// is a SYNTAX check: esbuild parses every emitted .js as an ES module, and a
// grep asserts no TypeScript survived the strip.
export async function runBlockCompileCells({ tsc, blocks, forms, esbuild, log }) { /* ... */ }
```

The body, in order:

1. For each block and each form in `forms` (the framework renderers only -- `cdn` is not a project shape and is covered by `verify:blocks [pins]` and the driver):
2. `react`: `const box = tsc.sandbox('default', `block-${id}-react`)`; `box.clear()`; run `box.selfTest()` FIRST and fail loudly if any anti-theatre probe did not fire (a sandbox whose types resolved to `any` would pass every cell); write each `FormFile` by `path`; `box.run()`; a non-empty diagnostic is a failure reported with the block, the form and the raw tsc output.
3. `html`: for each emitted `.js`, `esbuild.transformSync(content, { loader: 'js', format: 'esm' })` inside a try (a parse error is the failure), then assert the content does not match `/^\s*(?:export\s+)?(?:interface|type)\s|:\s*(?:string|number|boolean)\s*[;,)]/m` -- TypeScript that survived the strip.
4. Return the cell count and the failures. **Print the axis and the cell count**; never write one down.

In `verify-scaffold-compiles.mjs`, add the call in `main()` immediately after `await routeCheck(scaffold)` (`:1953`) and before `cleanup()`, using the harness `main()` already created, and include the cell count in the summary it prints. Do not put the word "block" in the phase's comment without qualifying it; that file's vocabulary is already taken.

**Watch it fail before trusting it.** Plant each defect by hand, run, watch the named red, revert:

```bash
# (a) a type error in the react tree: break the controller's State field name
cd "$WT" && sed -i '' 's/  backHidden: boolean;/  backHiddenn: boolean;/' packages/blocks/blocks/support-widget/support-widget.controller.ts
cd "$WT/packages/ui" && npm run build && npm run verify:scaffold
cd "$WT" && git checkout packages/blocks/blocks/support-widget/support-widget.controller.ts
```

Expected: RED naming `support-widget [react]` and a TS2339 on `state.backHidden`. Then:

```bash
# (b) TypeScript surviving into the html form: neuter the strip
cd "$WT" && sed -i '' "s/loader: 'ts'/loader: 'js'/" packages/ui/scripts/gen-blocks.mjs
cd "$WT/packages/ui" && npm run build && npm run verify:scaffold
cd "$WT" && git checkout packages/ui/scripts/gen-blocks.mjs
```

Expected: RED naming `support-widget [html]` and the file that still carries TypeScript. Record both reds verbatim in the handoff.

- [ ] **Step 3: Add the two structural cells to `verify:blocks`**

In `packages/ui/scripts/verify-blocks.mjs`, per block, beside `contracts` / `fresh` / `pins` / `driver`:

```js
// [html-binder] -- what tsc cannot see about the form that has no tsc.
function htmlBinderErrors(name, files) {
  const errors = [];
  const binder = files.find((f) => f.path === `${name}.js`);
  if (!binder) return [`${name}: the html form emitted no ${name}.js binder`];
  if (/^\s*(?:export\s+)?(?:interface|type)\s/m.test(binder.content)) {
    errors.push(`${name}: the emitted binder carries TypeScript; the strip did not run (gen-blocks writes the .js twin with esbuild)`);
  }
  for (const file of files) {
    if (/new\s+EventSource\(|text\/event-stream|\.getReader\(/.test(file.content)) {
      errors.push(`${name}/${file.path}: hand-rolls a stream reader; use the @kitn.ai/ui/wire readers`);
    }
  }
  if (!/customElements\.whenDefined/.test(binder.content)) {
    errors.push(`${name}: the binder does not await customElements.whenDefined. An element created before its definition lands DISCARDS a property set on it, and the upgrade does not put it back (spec 8b, amendment 7).`);
  }
  return errors;
}

// [react-tree] -- the three things spec 5.2 says tsc cannot see.
function reactTreeErrors(name, files) {
  const errors = [];
  for (const file of files) {
    if (file.path.endsWith('.tsx') && /<kai-[\w-]+/.test(file.content)) {
      errors.push(`${name}/${file.path}: renders a raw <kai-*> tag. The react form imports every element from @kitn.ai/ui/react (spec 5.2); the intrinsic-JSX escape hatch is exactly what this check forbids.`);
    }
    if (/from '@kitn\.ai\/ui\/elements'/.test(file.content) && !file.path.endsWith('.controller.ts')) {
      errors.push(`${name}/${file.path}: imports elements from @kitn.ai/ui/elements. Only the controller may name an element INTERFACE; the tree uses the wrappers.`);
    }
    if (file.target !== `src/components/${name}/${file.path}`) {
      errors.push(`${name}/${file.path}: target is "${file.target}", but targets.ts says "src/components/${name}/${file.path}". The path the page displays is the path add writes.`);
    }
  }
  return errors;
}
```

and plant both in `--self-test`: a binder with an `export interface` line, a `.tsx` carrying `<kai-dock>`, and a `FormFile` whose `target` disagrees with `targets.ts`. Watch all three print `SELF-TEST OK` (meaning caught) before the real run.

- [ ] **Step 4: Run the two gates**

```bash
cd "$WT/packages/ui" && npm run build
cd "$WT/packages/ui" && npm run verify:blocks
cd "$WT/packages/ui" && npm run verify:scaffold
```

Expected: both green, and both PRINT their axes and counts. Quote what they printed in the handoff; do not restate a number from this plan.

- [ ] **Step 5: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): compile cells for blocks x {html, react}, and two structural cells

gen-blocks emits dist/blocks/f/<id>.<form>.json per block per framework
renderer, so the site's code view (PR C) and the cells read the same bytes.

The compile cells run inside verify:scaffold, over the harness it already
stands up: react compiles in a `default`-project sandbox whose anti-theatre
probes are re-run IN that directory first, and html's emitted .js is parsed
by esbuild and grepped for TypeScript that survived the strip. Both were
watched failing on a planted defect: a renamed State field (TS2339) and a
neutered strip.

verify:blocks gains [html-binder] and [react-tree]: no TypeScript and no
hand-rolled SSE reader in the shipped .js, no raw <kai-*> JSX, no element
import outside the controller, and every emitted target equal to targets.ts.
Each planted in --self-test.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 11: the react RUNTIME cell

**Files:**
- Create: `packages/ui/scripts/verify-blocks-react.mjs`, `packages/ui/scripts/block-driver/react-host/{package.json,vite.config.ts,tsconfig.json,index.html,src/main.tsx}`
- Modify: `packages/ui/package.json` (the `verify:blocks:react` script)
- Modify: `packages/blocks/blocks/support-widget/states.mjs` (a `react` page entry)
- Modify: `.github/workflows/test.yml` (the `browser` leg)

**Interfaces:**
- Consumes: `renderBlockForm(block, 'react', ...)`; the packed `@kitn.ai/ui` tarball; `packages/ui/scripts/block-driver/driver.mjs`.
- Produces: `pnpm --filter @kitn.ai/ui run verify:blocks:react`, and `--self-test`.

**Why this cell is not optional** (spec 5.3, ruled): the spike found two defects that type-check perfectly and break the block. F-8's third hole (a prop set back to `undefined` was skipped rather than cleared, so the react form showed its conversation starters forever) and F-6's controlled-component loop (a literal on a self-managed prop undoing every navigation) are both invisible to tsc and invisible to a compile cell. PR B0 fixed both mechanisms; this is what keeps them fixed.

**Ruling: the cell reuses `states.mjs`, and each block's scenario gains a `react` PAGE.** The driver's page spec carries the page-specific facts (`path`, `indexKey`, `messagesElementId`, `expectedFirstTitle`, `expectRestore`, `closedSend`); the STATES are the block's story and are shared. So the react host is a third page key whose spec is the `block` one with `path: '/'`. The element ids survive into the react tree (a literal `id` is a literal attribute, and `WebComponentProps` declares `id`), which is what makes the same probes work.

**Ruling: no `--baseline`, light only, and NO LAYOUT PROBES.** A `react` page has no recorded run, and recording one would double the baselines to maintain for no gain -- the assertions this cell needs are already in the scenario as `expect` maps, which the driver enforces on EVERY run alongside the zero-console-error rule. `suggestionsStillShowing: false` in state `4-reply` IS F-8's third hole and `backArrow: true` / `homeTab: false` IS F-6's loop. Dark adds paint, not behaviour, and this cell is about behaviour.

The layout probes are excluded for a harder reason than cost. `2-home` asserts `homeSubtitleToCtaGap: 16`, `homeTitleToSubtitleGap: 4` and `homeSubtitleLineBox: 20` -- pixel measurements taken in the block's own page. The react host is a DIFFERENT document: a Vite `index.html` with `#root`, no `.host-stand-in` paragraph, and a mounted subtree rather than a page. Those numbers would fail there for reasons that are not defects, and making them pass would prove nothing about the react form. So the scenario marks the three geometry probes and the `styleProbes` with `layout: true`, the `react` page spec sets `skipLayout: true`, and the driver skips a marked probe on a page that asks it to. **The cell's output says "layout probes are not run on the react page"**, so nobody reads its green as a layout guarantee.

- [ ] **Step 1: Add the `react` page to `support-widget`'s scenario**

In `packages/blocks/blocks/support-widget/states.mjs`, beside `pages.block`:

```js
    // The REACT form, mounted at the root of a throwaway Vite app by
    // scripts/verify-blocks-react.mjs. Same story, same probes, same
    // page-specific facts: only the URL differs, because the react tree is a
    // component in an app rather than a page in a directory. The element ids
    // survive the translation (a literal id is a literal attribute), which is
    // what lets one set of probes drive both.
    react: {
      path: '/',
      indexKey: 'kai:support-widget:threads',
      rowScope: 'kai-conversations',
      messagesElementId: 'thread',
      expectedFirstTitle: 'Let me pull up that order.',
      expectRestore: true,
      // Layout probes are measured in the BLOCK's own page and do not
      // transfer to a mounted subtree in a Vite index.html. This page asserts
      // state, navigation and console-cleanliness; geometry stays where it
      // was measured.
      skipLayout: true,
      closedSend: () => {
        document.getElementById('prompt').dispatchEvent(
          new CustomEvent('kai-submit', { detail: { value: 'Request a refund', attachments: [] } }),
        );
      },
    },
```

and mark the probes it skips, in the same file's `2-home` state:

```js
      // Marked LAYOUT: measured in this page's own document, so a page that
      // mounts the block somewhere else (the react host) skips them rather
      // than failing on a number that was never about that document.
      layoutProbes: ['homeCtaClearOfSubtitle', 'homeSubtitleToCtaGap', 'homeTitleToSubtitleGap', 'homeSubtitleLineBox'],
```

and teach `driver.mjs` the two lines that honour it, beside where it reads `state.probes` and `state.styleProbes`:

```js
      const skipLayout = spec.skipLayout === true;
      const layout = new Set(state.layoutProbes ?? []);
      for (const [key, probe] of Object.entries(state.probes ?? {})) {
        if (skipLayout && layout.has(key)) continue;
        rec.probes[key] = await probe(page, sctx);
      }
      for (const sp of skipLayout ? [] : state.styleProbes ?? []) {
```

and skip an `expect` whose probe was skipped, or the run fails on a probe it deliberately did not take. **Watch that**: run the cell once with `skipLayout` NOT honoured in the expect loop and confirm it fails naming `homeSubtitleToCtaGap`, then add the guard. A skip that silently passes an unmeasured expectation is the exact shape of a check that proves nothing.

- [ ] **Step 2: Write the checked-in host fixture**

`packages/ui/scripts/block-driver/react-host/package.json`. **Every version is pinned to a range, not left to `npm install <name>@latest`**: an unpinned host makes the cell's verdict depend on what npm published this morning, which is the difference between a gate and a weather report. Read the repo's own ranges rather than copying these (`node -e "const p=require('./package.json'),u=require('./packages/ui/package.json');const a={...p.dependencies,...p.devDependencies,...u.dependencies,...u.devDependencies};for(const k of ['react','react-dom','@types/react','@types/react-dom','vite','@vitejs/plugin-react','typescript'])console.log(k,a[k])"`), so the host tracks the versions the rest of the repo is tested against. At the time this plan was written that command printed `react ^19.2.7`, `react-dom ^19.2.7`, `@types/react ^19.2.17`, `@types/react-dom ^19.2.3`, `vite ^6.0.0`, `@vitejs/plugin-react ^4.7.0`, `typescript ^5.5.0`:

```json
{
  "name": "kai-block-react-host",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "react": "<the repo's range>",
    "react-dom": "<the repo's range>"
  },
  "devDependencies": {
    "@types/react": "<the repo's range>",
    "@types/react-dom": "<the repo's range>",
    "@vitejs/plugin-react": "<the repo's range>",
    "typescript": "<the repo's range>",
    "vite": "<the repo's range>"
  }
}
```

The cell then installs the packed kit tarball plus `npm install` with no package list, so the pins in this file are what it gets. Record the resolved versions in the run's output, so a future red can be read against them.

`packages/ui/scripts/block-driver/react-host/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], server: { host: '127.0.0.1' }, logLevel: 'error' });
```

`packages/ui/scripts/block-driver/react-host/src/vite-env.d.ts` -- one line, and it is load-bearing. The emitted react tree imports `./support-widget.css`, and with `"types": []` in the tsconfig below nothing declares a CSS module, so `tsc --noEmit` fails with TS2307 on a file that is perfectly correct. This is the reference create-vite ships:

```ts
/// <reference types="vite/client" />
```

`packages/ui/scripts/block-driver/react-host/tsconfig.json` -- a stock create-vite react-ts config, strict, so the cell's tsc pass is what a consumer's `npm run build` runs. `include` names `src`, which picks up `vite-env.d.ts` with it:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src"]
}
```

`packages/ui/scripts/block-driver/react-host/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>kai block react host</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/ui/scripts/block-driver/react-host/src/main.tsx` -- `__BLOCK__` is the one token the cell rewrites per block, so the fixture stays a real, readable file rather than a template string:

```tsx
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Block } from './block';

declare global {
  interface Window { __blockReady?: boolean }
}

// The driver waits on the block driver's readiness convention. React has no
// boot() of its own to await -- the hook fires it in an effect -- so "ready"
// here is "mounted, and one frame has passed".
function Host() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => { window.__blockReady = true; setReady(true); });
    return () => cancelAnimationFrame(id);
  }, []);
  void ready;
  return <Block />;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
```

with `src/block.ts` written per block by the cell as a one-line re-export:

```ts
export { SupportWidget as Block } from './components/support-widget/SupportWidget';
```

**StrictMode is deliberate.** It double-invokes effects in development, which is precisely the condition a mount-effect seed (R10) has to survive, and it is what a stock `npm create vite` app gives a consumer.

- [ ] **Step 3: Write the cell**

`packages/ui/scripts/verify-blocks-react.mjs`. Structure, and the reasons that belong in its header:

```js
#!/usr/bin/env node
// verify:blocks:react -- the REACT RUNTIME cell (spec section 5.3, ruled).
//
// Compile-only is not enough for react, and the contract spike proved it with
// two defects that type-check perfectly: a prop set back to `undefined` being
// skipped rather than clearing (the block showed its conversation starters
// forever) and a literal on a self-managed prop being re-applied after every
// render (every navigation silently undone). PR B0 fixed both mechanisms;
// this is what keeps them fixed.
//
// It drives the PACKED TARBALL, not the tree: the tree is not the tarball.
// One throwaway Vite app is installed once and reused per block, because the
// install is the expensive part and the component is the cheap part.
//
//   node scripts/verify-blocks-react.mjs             # the gate
//   node scripts/verify-blocks-react.mjs --self-test # plant, watch, revert
//   node scripts/verify-blocks-react.mjs --keep      # leave the app for a look
```

The body, in order:

1. **Preconditions.** `dist/kai.es.js` and `dist/blocks/` must exist; fail naming `npm run build` (never skip: a skip reads as green).
2. **Pack**, with `readPackedFilename` from `<repo>/scripts/pack-listing.mjs` and `npm pack --json --pack-destination <tmp>`, exactly as `verify-consumer-sideeffects.mjs` does. That helper exists because npm 12 changed the shape of `--json` mid-publish; do not re-parse it by hand.
3. **Stand up the app**: copy `scripts/block-driver/react-host/` into `<tmp>/app`, then one `npm install --no-audit --no-fund` of the tarball plus `react`, `react-dom`, `@vitejs/plugin-react`, `vite`, `typescript`, `@types/react`, `@types/react-dom`.
4. **Per block** (the list from the same directory scan `verify-blocks.mjs` uses -- import its `scanBlocks` shape rather than writing a third walk):
   - render the react form through `renderBlockForm(withStrippedTwins(block, strip), 'react', ...)`;
   - write every `FormFile` at its `target` under `app/` (which is what makes `targets.ts` the thing under test rather than a claim);
   - write `src/block.ts` re-exporting the component as `Block`;
   - **the no-workaround grep** over every emitted file: `/@ts-expect-error|@ts-ignore|as Kai[A-Za-z]+Element|as unknown as/`. A cast is how a react tree passes tsc while lying, and PR B0 exists so none is needed;
   - `npx tsc --noEmit` in `app/`; any diagnostic is a failure, printed raw;
   - start `npx vite --port <port>` (never 4400/4401/8931/8952/8954/8955), wait for its "ready" line, then run `driver.mjs <states.mjs> --pages react --schemes light --base http://127.0.0.1:<port> --shots <tmp>/shots/<id>`, and kill the server in a `finally`;
   - the driver's exit status is the verdict; on red print its `RED` lines.
5. **Print the axis**: which blocks ran, that this cell is RUNTIME for react while every other framework is compile-only, and that layout probes were skipped. Spec 5.3 requires the gate's output to say which is which, so nobody reads four greens as four running blocks.

**On console noise, predict nothing.** The driver treats any `console.error` or `console.warn` as a failure, and React's development build warns about things a production build does not. Run the cell BEFORE adding any `consoleIgnore`, read what it actually prints, and add a pattern only for a warning that (a) really appeared and (b) is about the host rather than the block -- a StrictMode double-invoke notice, say. A pre-emptive ignore list is a filter over failures nobody has seen, and it is how a runtime cell quietly stops being one. Whatever you add, add it to the `react` page spec so the `block` page keeps the strict rule.

- [ ] **Step 4: Write the self-test, and watch all three plants fire**

`--self-test` plants three defects into the EMITTED tree (never into the source) and requires each to be caught by name:

```js
const PLANTS = [
  {
    label: 'a leftover cast in the react tree',
    apply: (files) => files.map((f) => (f.path.endsWith('.tsx')
      ? { ...f, content: f.content.replace('refs.current.stack = el;', 'refs.current.stack = el as unknown as never;') }
      : f)),
    expect: /as unknown as/,
    why: 'the no-workaround grep must fire: a cast is how a react tree passes tsc while lying',
  },
  {
    label: 'a broken binding (a State field that does not exist)',
    apply: (files) => files.map((f) => (f.path.endsWith('.tsx')
      ? { ...f, content: f.content.replace('state.backHidden', 'state.backHiddenn') }
      : f)),
    expect: /error TS2339/,
    why: 'tsc must fire: a binding naming a field the controller does not declare is the compile half of this cell',
  },
  {
    label: 'the F-6 controlled-component loop (the seed back as a re-applied prop)',
    apply: (files) => files.map((f) => (f.path.endsWith('.tsx')
      ? { ...f, content: f.content.replace(/useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/, '').replace('<ViewStack', '<ViewStack view="home"') }
      : f)),
    expect: /probe "backArrow"|probe "homeTab"/,
    why: 'ONLY the browser finds this one: it type-checks perfectly and silently undoes every navigation',
  },
];
```

Run it and read every line:

```bash
cd "$WT/packages/ui" && node scripts/verify-blocks-react.mjs --self-test
```

Expected: three `SELF-TEST OK` lines. **The third is the one that justifies the whole cell**; if it does not fire, the cell is compile-only in disguise and the fix is the cell.

- [ ] **Step 5: Run the real gate**

```bash
cd "$WT/packages/ui" && npm run build
cd "$WT/packages/ui" && npm run verify:blocks:react
```

Expected: green for `support-widget` (the other two convert in Task 13; until then the cell renders whatever `react` form they have, so if an unconverted block fails here, note it and let Task 13 fix it -- do not weaken the cell).

- [ ] **Step 6: Add the npm script and the CI step**

`packages/ui/package.json`:

```json
    "verify:blocks:react": "node scripts/verify-blocks-react.mjs --self-test && node scripts/verify-blocks-react.mjs",
```

`.github/workflows/test.yml`, in the `browser` leg, immediately after the `Block cells` step (it needs the same three things: the downloaded `kit-dist`, the Playwright browser, and network for the install):

```yaml
      # The REACT RUNTIME cell (spec 5.3, ruled). The compile cells in
      # verify:scaffold prove the emitted react tree type-checks; they cannot
      # see the two defects the contract spike found, because both type-check
      # perfectly: a prop set back to `undefined` being skipped rather than
      # clearing, and a literal on a self-managed prop being re-applied after
      # every render and undoing every navigation. This packs the tarball,
      # installs it into a throwaway Vite app, compiles the emitted tree with
      # tsc --strict, greps it for the casts that would let it lie, and drives
      # the block's own states.mjs through it in a real Chromium. Every other
      # framework is compile-only at runtime, and the gate's output says so.
      - name: Block react runtime cell (packed tarball, real Vite app)
        run: pnpm --filter @kitn.ai/ui run verify:blocks:react
```

- [ ] **Step 7: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): a react RUNTIME cell for every block

verify:blocks:react packs the tarball, installs it into a throwaway Vite
React app built from a checked-in fixture host, writes the emitted react tree
AT ITS targets.ts paths, compiles it with tsc --strict, greps it for the
casts that would let it pass tsc while lying, and drives the block's own
states.mjs through it in a real Chromium.

It exists because compile-only was measured insufficient: the contract spike
found two defects that type-check perfectly and break the block, and its
--self-test plants both classes plus a broken binding and requires each to be
caught by name. The third plant -- the F-6 controlled-component loop -- is
the one only a browser finds.

The scenario is reused, not forked: each block's states.mjs gains a `react`
page whose spec is its `block` spec with path '/'.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 12: convert `assistant` and `in-app-assistant`

**Files:**
- Rewrite: `packages/blocks/blocks/assistant/assistant.html`, `packages/blocks/blocks/in-app-assistant/in-app-assistant.html`
- Create: `packages/blocks/blocks/assistant/assistant.controller.ts`, `packages/blocks/blocks/in-app-assistant/in-app-assistant.controller.ts`
- Rename: both `mock.js` -> `mock.ts`; delete both imperative `.js` entry scripts
- Modify: both `registry-item.json`, both `states.mjs` (the `react` page entry)
- Modify: `packages/blocks/src/registry.ts` (the contract becomes mandatory)
- Possibly modify: `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` section 3 (a dated note per gap found)

**Interfaces:**
- Consumes: everything above.
- Produces: three converted blocks, and the end of the transitional rule from Task 6.

**Expect the contract to move, and record it when it does.** These two blocks do things `support-widget` does not, and each is a genuine test of the grammar:

- `assistant.js:118-121` filters the ALREADY-RENDERED rows on `kai-search` by reading `item.textContent` and setting `item.hidden`. That is a DOM query the contract forbids, and the conversion is a `query` field in State with `conversationRows` precomputed filtered -- which is what "State is a view model" means. Expect the row count to become a derived field too.
- `assistant.html` has no `kai-view-stack` at all and drives `kai-model-switcher`'s `models` as a property, so it exercises `.prop` on a leaf element with no navigation.
- `in-app-assistant.js:71` toggles `hidden` on a PLAIN `<span id="history-dot">`, so it exercises `:hidden` on a non-kai element.
- `in-app-assistant.js:114` hides a kai-button on drill, which is the same `:hidden` pattern as `support-widget`'s back arrow.

**If something in either block cannot be expressed, that is a finding, not a workaround.** Add a dated note to spec section 3.1 or 3.2 in THIS task's commit (`**Amendment, 2026-09-02 (PR B, converting <block>):** ...`), and say in the handoff what moved. Do not add a binding kind without recording why, and do not reach for an expression.

- [ ] **Step 1: Convert `assistant`**

Follow Task 9's shape exactly: bindings onto `assistant.html` (keeping the ids `states.mjs` addresses -- read that file first and list them), the logic into `assistant.controller.ts` with `AssistantState` / `AssistantActions` / `AssistantRefs` and a `boot()`, `mock.js` renamed to `mock.ts`, `assistant.js` deleted, the manifest's `files[]` updated, the `docs` string pointed at the controller.

- [ ] **Step 2: Convert `in-app-assistant`**, the same way.

- [ ] **Step 3: Add the `react` page to both scenarios**

The same entry Task 11 added to `support-widget`'s, with each block's own `indexKey`, `messagesElementId`, `expectedFirstTitle`, `expectRestore` and `closedSend` copied from its own `block` page spec and only `path` changed to `/`.

- [ ] **Step 4: Make the contract mandatory**

In `checkBlockContracts`, delete the "does the page carry a binding-prefixed attribute" conditional from Task 6 and make the controller unconditional:

```ts
  // Every block is an authored-contract block now (PR B). A page with no
  // bindings and no controller is not a simpler block, it is an unconverted
  // one, and the forms cannot be generated from it.
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
```

Add the case to `packages/blocks/tests/registry.test.ts`:

```ts
  it('refuses a block with no controller, now that the contract is mandatory', () => {
    const errs = check('<kai-thread></kai-thread>');
    expect(errs.join(' ')).toContain('.controller.ts');
  });
```

and watch it fail first (before deleting the conditional it passes vacuously, because the page has no bindings).

- [ ] **Step 5: Build, and run the driver against BOTH old baselines, without recording**

```bash
cd "$WT/packages/ui" && npm run build
for id in assistant in-app-assistant; do
  cd "$WT/packages/ui" && node scripts/block-driver/driver.mjs "../blocks/blocks/$id/states.mjs" \
    --serve scripts/block-driver/pages --pages block --schemes light,dark \
    --baseline "scripts/block-driver/baselines/$id.json" \
    --shots "$SCRATCH/driver-after-$id" --out "$SCRATCH/driver-after-$id.json"
done
```

Apply Task 9 Step 15's classification to each: a moved TEXT or ORDERING probe is investigated then re-recorded; **a moved LAYOUT probe is a STOP.** Save the screenshots and look at them.

- [ ] **Step 6: The full block gate**

```bash
cd "$WT/packages/ui" && npm run verify:blocks
cd "$WT/packages/ui" && npm run verify:blocks:react
cd "$WT/packages/ui" && npm run verify:scaffold
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
```

Expected: green, with the block count the gates PRINT covering all three.

- [ ] **Step 7: Commit**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
feat(blocks): assistant and in-app-assistant move onto the authored contract

Both blocks converted the way support-widget was, and the contract becomes
mandatory: a page with no bindings and no controller is an unconverted block,
not a simpler one, so checkBlockContracts refuses it.

What these two exercised that the reference did not: a search filter that was
a DOM query over rendered rows and is now a derived field of State, a leaf
element driven by .prop with no navigation anywhere, and :hidden on a plain
<span>.

<PASTE: the spec amendments this conversion forced, or "the contract needed
no change", and the driver verdict per block>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

---

## Task 13: docs, the coupling map, the gate, and the PR

**Files:**
- Modify: `docs/coupling-map.md` (section 4 rows, section 10 row)
- Modify: `packages/blocks/README.md` (the structure, R14, the gates)
- Modify: `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` (dated notes for the two contract additions Task 7 made, plus anything Task 13 found)
- No source changes. If a gate goes red, the fix belongs in the task that owns the file, as its own commit.

**Interfaces:**
- Consumes: everything.
- Produces: a PR on `feat/blocks-authored-contract`. **This task does not merge.**

### Step group A: the record

- [ ] **Step 1: Register the couplings**

Add to `docs/coupling-map.md` section 4 (Derived lists):

| Source of truth | Derived by | What adding a member does | Enforced by |
|---|---|---|---|
| `src/targets.ts` in `packages/blocks` | `FormFile.target` in every renderer; the `/blocks` file tree (PR C); `planAdd` (PR D) | A framework's install root moves in one place and every emitted target, every displayed path and every written path moves with it | `verify:blocks [react-tree]` compares each emitted target against the table; `packages/create-kai/test/pr-d-target-mismatch.test.ts` pins the one place that has NOT moved yet |
| `onName` in `packages/ui/scripts/gen-element-react.mjs` | `handlerName` in `packages/blocks/src/forms/react.ts`, which cannot import it (blocks depends on nothing from the kit, by design) | A change to the handler-name rule moves both the wrappers and every generated react block tree | `packages/ui/mcp/tests/blocks-artifacts.test.ts` asserts the two agree for EVERY event in `element-meta.json`, with an anti-vacuity floor. **This is a restatement with a guard, not a derivation** |
| The esbuild options that strip a block's TypeScript | `packages/ui/scripts/gen-blocks.mjs` and `packages/create-kai/scripts/build.mjs`, which write the `.js` twin in two places because neither runtime renderer can strip | Two different strippers would make "what the gallery shows is what `add` writes" false | `packages/create-kai/test/block-twins.test.ts` re-derives the twin with esbuild and compares bytes; `verify-pack.mjs` refuses a tarball with a `.ts` source and no twin |

and to section 10 (Blocks and the facades):

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| The binding grammar in `packages/blocks/src/contract/parse-template.ts` | every renderer under `src/forms/`, and every authored block page | a renderer that does not know a kind emits a tree missing that wiring, and the html form has no typecheck to catch it | `verify:blocks [contracts]` (the parser is the one owner and its errors are surfaced, never restated), `[html-binder]`, `[react-tree]`, the compile cells in `verify:scaffold`, and `verify:blocks:react` at runtime |
| The controller contract in `packages/blocks/src/contract/analyze-controller.ts` (`createController`, `<Name>State`, `<Name>Actions`, `<Name>Refs`, `boot`) | the generated react adapter, which imports those exact names, and the binder, which calls them | a renamed interface makes the adapter import a type nobody exports | the analyzer refuses at generation time naming the identifier; the react compile cell is the backstop |

- [ ] **Step 2: Fold the two contract additions into the spec**

In `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` section 3.2, after the `createController` block:

```markdown
**Amendment, 2026-09-02 (PR B).** `Actions` carries a `boot()`. It is the mount
hook every host calls once after wiring -- React's adapter fires it in an
effect, the html binder awaits it before signalling readiness -- and the html
form has nowhere else to hydrate from storage. `analyzeController` refuses an
`Actions` block without it.

**Amendment, 2026-09-02 (PR B).** The three exported interfaces are NAMED after
the block: `<Component>State`, `<Component>Actions`, `<Component>Refs`, where
`<Component>` is the block id in PascalCase. Fixing the names is what lets the
react adapter be generated at all, and the analyzer names the identifier it
wanted when one is missing.
```

and in section 3.1, after the binding table:

```markdown
**Amendment, 2026-09-02 (PR B).** The parser recovers the AUTHORED case of an
attribute from parse5's source locations, because parse5 lowercases attribute
names and `.textContent` would otherwise be unauthorable. A `.prop` binding
accepts either spelling (`.conversation-id` and `.conversationId` name one
property); an `:attr` binding keeps what was written, because an attribute name
is a string the element reads.

**Amendment, 2026-09-02 (PR B).** The page marks exactly one element
`data-block-root`. The `html` and `cdn` forms render the WHOLE page, because
they are a page and the host chrome around the block is what makes them
runnable; every component-framework renderer emits that subtree and nothing
else. Zero roots and two roots are both validation errors.

**Amendment, 2026-09-02 (PR B).** Six refusals the section implied and did not
state. `*for` needs a parent element (a repeated top-level child of `<body>`
has nothing to rebuild its rows into). `*for` and `#ref` are exclusive on one
element, and `#ref` and `seed:` are refused anywhere inside a `*for` subtree,
because each names ONE element and a repeat has none. A `#ref` name is declared
once. `:key` is dotted from the loop item. An authored `<script type="module">`
on the page is an error: the entry script is generated now.

**Amendment, 2026-09-02 (PR B).** A literal attribute and a binding of the same
name on one element are both legal, and they are different channels: the
literal is the value the element reads before registration, and the binding
takes over at the first apply. `<kai-button hidden :hidden="backHidden">` is
the shape that keeps an authored-hidden element hidden from parse instead of
flashing visible until the binder runs.

**Correction, 2026-09-02 (PR B).** This section said the wc renderer "removes
the attribute when the field is falsy". Falsy is the wrong test: `0` and `''`
are falsy and are legitimate attribute values. The rule is remove on `false`,
`null` and `undefined`; write everything else through `String(value)`, with
`true` writing the empty string.

**Amendment, 2026-09-02 (PR B).** What `seed:` guarantees is "written once,
after registration, before the first apply". An element that captures a prop at
upgrade (`kai-view-stack` captures `view` into `initialView`,
`src/elements/view-stack.tsx:125`) has already captured by then, so a seed on
such a prop acts as the first navigation rather than as a deep link. Same
landing view for the blocks in this round; state it so nobody debugs it twice.
```

Add whatever Task 12's conversions found, in the same dated form.

- [ ] **Step 3: Update the package README**

`packages/blocks/README.md`'s "What is here" list gains the new modules, and it gains one short section:

```markdown
## The authored block sources are in no tsconfig here

`blocks/<id>/<id>.controller.ts` imports `@kitn.ai/ui/state`, `/wire`, `/stores`
and `/elements`, and this package must not depend on the kit -- that is the
direction the package move established, and a path mapping would put a build
ordering back between the two. So the controllers are checked where a consumer
checks them: the react compile cell in `pnpm --filter @kitn.ai/ui run
verify:scaffold` compiles the emitted tree against the SHIPPED declarations in
a consumer-shaped harness, and `verify:blocks:react` then runs it. That is a
stronger check than a local pass, not a weaker one.
```

### Step group B: the gate

- [ ] **Step 4: Cold build from a clean tree**

```bash
cd "$WT" && git status --porcelain
cd "$WT/packages/ui" && npm run build
```

Expected: clean apart from untracked files that were there before the branch, and a green build. **Not `nx build ui`.**

- [ ] **Step 5: The typecheck chain and the suites**

Each as its own command. Never `&&`-chained through `tail`.

<!-- gate-list: partial -- this task's local pre-push subset, not the merge gate; the merge gate is the required `test` job graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd "$WT/packages/ui" && npm run typecheck
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
cd "$WT/packages/ui" && npm run test:react
cd "$WT" && pnpm --filter create-kai run build
cd "$WT" && pnpm --filter create-kai exec vitest run
```

- [ ] **Step 6: The verify and lint gates**

<!-- gate-list: partial -- the gates this change can plausibly move, not the merge gate; the merge gate is the required `test` job graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd "$WT/packages/ui" && npm run verify:generated
cd "$WT/packages/ui" && npm run verify:blocks
cd "$WT/packages/ui" && npm run verify:blocks:react
cd "$WT/packages/ui" && npm run verify:scaffold
cd "$WT/packages/ui" && npm run verify:consumer
cd "$WT/packages/ui" && npm run verify:construct
cd "$WT/packages/ui" && npm run verify:dts
cd "$WT/packages/ui" && npm run verify:dts:consumer
cd "$WT/packages/ui" && npm run verify:artifact-glob
cd "$WT/packages/ui" && npm run verify:pack
cd "$WT/packages/ui" && npm run lint:silent-drops
cd "$WT/packages/ui" && npm run lint:cdn-pins
cd "$WT/packages/ui" && npm run lint:pack-parse
cd "$WT/packages/ui" && npm run build-storybook
cd "$WT" && pnpm --filter create-kai run verify:pack
cd "$WT" && pnpm --filter @kitn.ai/docs run verify:docs
```

Notes on what each is here for, so a red is diagnosed rather than retried:

- `verify:blocks` and `verify:blocks:react` are the subject of this PR; both print their axes and both run their `--self-test` first.
- `verify:scaffold` now carries the blocks compile cells, and it PRINTS the axes and cell counts it ran. Read those; never a figure from a document.
- `verify:construct` drives the real eject/install/tsc/build/consumer-bundle chain and is the only gate that compiles emitted consumer code end to end besides the new cells.
- `verify:pack` and `verify:artifact-glob` measure what the tarball carries, and this PR ADDS files under `dist/blocks/f/`. Run them right after the Step 4 build; if either wants a snapshot step first, do the step it names rather than skipping.
- `verify:consumer` and `verify:dts*` should be untouched by this PR. A red in one of them is a finding about a change that reached further than intended.
- `create-kai run verify:pack` is the tarball assertion Task 9 extended: it refuses a tarball carrying a `.ts` block source with no `.js` twin. `add` would otherwise install cleanly and then fail to render the html form, which is the same failure shape the missing-templates assertion exists for.
- `lint:pack-parse` is here because Tasks 1 and 13 both read `npm pack --json`, and it is the required check that every such reader goes through `scripts/pack-listing.mjs` rather than indexing the raw JSON.
- `build-storybook` compiles the stories, and `kai-view-stack` / `kai-view` have them. Nothing in this PR should move them.

- [ ] **Step 7: The pack-list delta, ENUMERATED**

```bash
cd "$WT/packages/ui" && npm pack --dry-run --json > "$SCRATCH/after-pack.json"
cd "$WT" && node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readPackListing } from './scripts/pack-listing.mjs';
const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
const { files } = readPackListing(readFileSync(process.env.SCRATCH + '/after-pack.json', 'utf8'), { npmVersion });
console.log(files.map((f) => f.path).sort().join('\n'));
" > "$SCRATCH/after-pack-files.txt"
cd "$WT" && diff "$SCRATCH/baseline/pack-files.txt" "$SCRATCH/after-pack-files.txt"
```

Expected additions: `dist/blocks/f/<id>.<form>.json` per block per framework renderer, and the `.js` twins inside `dist/blocks/r/<id>.json` (which is a content change, not a new path). Expected removals: none. **Anything else is a finding**, and the enumerated diff goes in the PR body.

- [ ] **Step 8: The doc linters, over this plan file included**

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs --self-test
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs
cd "$WT" && node packages/ui/scripts/lint-threshold-derivation.mjs
```

Expected: all three exit 0. The `--self-test` runs first for the reason every self-test in this repo runs first: this PR adds gate steps to the workflow AND gate lists to a plan under `docs/superpowers/`, which is both halves of what that linter compares, and a linter that had silently stopped comparing would pass both. If one flags a fenced block here, add `<!-- gate-list: partial -- <reason> -->` above it rather than editing the commands inside it.

- [ ] **Step 9: Prove no scratchpad path leaked into the tree**

```bash
cd "$WT" && git diff origin/main --name-only
cd "$WT" && if git grep -nE '/(private/)?tmp/claude-|/var/folders/' -- $(git diff origin/main --name-only); then echo "SCRATCHPAD PATH LEAKED"; exit 1; else echo "clean"; fi
```

Expected: `clean`. An absolute scratchpad path has been committed in this repo before; this is the grep that stops it, written as an `if` so a broken invocation cannot read as a pass.

- [ ] **Step 10: Commit the docs**

```bash
cd "$WT" && git add -A
cd "$WT" && git commit -m "$(cat <<'EOF'
docs(blocks): register the contract's couplings, and what it costs

coupling-map section 4 gains three rows: targets.ts and everything that
reads it, the handler-name rule restated in the blocks renderer with a
per-event guard rather than an import, and the two esbuild call sites that
write the stripped twin. Section 10 gains the grammar and the controller
contract.

The spec gets dated notes for the two additions PR B made to section 3.2
(boot(), and the block-named interfaces), and for the authored-case recovery
in 3.1 that parse5's lowercasing forced.

The package README says out loud that the authored controllers are in no
tsconfig here, and where they ARE checked instead.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
EOF
)"
```

- [ ] **Step 11: Push and open the PR**

```bash
cd "$WT" && git push -u origin feat/blocks-authored-contract
cd "$WT" && gh pr create --title "feat(blocks): the authored contract, and the html / react / cdn renderers" --body-file "$SCRATCH/pr-body.md"
```

The body carries these sections, filled from what the run actually produced:

**What changed.** One framework-neutral source per block; three forms generated from it. The binding grammar, the controller seam, the three renderers, the form-id rename, `targets.ts`.

**The proof, in the order it is worth reading.**
1. The driver verdict per block against the OLD baseline (unchanged, or the enumerated probes that moved and why each was text or ordering).
2. The react runtime cell's `--self-test`: three plants, three catches, the third being the class only a browser finds.
3. The compile cells' printed axis and counts.
4. The pack-list diff, enumerated.
5. Every gate in Step 6, with what each printed.

**Deliberately not in this PR.** The other four renderers (B2), the site (C), the CLI's write planner and `FRAMEWORK_SIGNALS` (D). The `src/components` vs `src/blocks` mismatch, with a pointer to the test that pins it. The wider F-5 class of attribute-only readers, if a converted block met one.

**Notes for the reviewer.** The narrowed dependency rule and why parse5 earns it. Where the type strip happens and why it cannot happen in `packages/blocks`. `handlerName` being a restatement with a guard rather than an import, and why an import is impossible. Anything Task 13's conversions forced into spec section 3.

- [ ] **Step 12: Before merge (a separate decision, not this task's)**

```bash
cd "$WT" && gh pr update-branch
```

Then wait for the required `test` job. **This task does not merge.**

---

## Self-review

Run by the plan's author before dispatch, per the writing-plans skill.

**Spec coverage.** Every requirement in scope, and the task that implements it:

| Spec | Task |
|---|---|
| 3.1 the binding table (`.prop`, `:attr`, `@event`, `*for`+`:key`, `seed:`, `#ref`) | 4 (grammar), 7 (html), 8 (react) |
| 3.1 `.textContent` as children | 4, 7, 8 |
| 3.1 identifiers, never expressions | 4 |
| 3.1 `@` covers native events | 4 |
| 3.1 `:nonscalar=` / `seed:nonscalar=` are the same error as a bare one | 6 |
| 3.1 the block root, the six refusals, the literal-plus-binding rule, the attribute-removal rule | 4 (all enforced), 13 (all written into the spec) |
| 3.2 `createController` / `state` / `actions` / `subscribe`, refs as a nullable getter | 5, 9 |
| 3.2 State as a view model | 9 (the conversion is what makes it true) |
| 3.3 the authored directory, `mock.ts`, derived `files[].target` | 3, 9, 12 |
| 3.4 `targets.ts` | 3 |
| 3.5 `html` + generated binder | 7 |
| 3.5 `react` + adapter, handler names derived | 8 |
| 3.5 `cdn` inlined and pinned, and the three call sites that render it | 9 |
| 3.5 the compile step for html and cdn | 7 (where), 9 (who) |
| 3.5 the per-form JSON gen-blocks emits | 10 |
| 5.1 compile cells, axis derived | 10 |
| 5.2 structural checks | 10 |
| 5.3 the react runtime cell, and the gate saying which frameworks are compile-only | 11 |
| 8b.1..8 (all eight amendments) | 4 (1,2,3,4,5), 9 (5,8), 7 (7), 5 (6) |
| 7's "nothing regresses" | 1 (baseline), 9 and 12 (driver), 13 (the gate list and the pack diff) |

Out of scope by ruling and named as such: 3.6 (the Solid gap), 4 (the page), 5.4 (the site test), 5.5 (create-kai smoke for a non-react fixture), 5.6 (the preview source switch), 5.7 (the dropdown test) -- all PR B2, C or D.

**Placeholder scan.** Three places carry an intentional placeholder, each a RESULT the implementer must record rather than a value the plan can know: the Task 9 and Task 12 commit bodies (`<PASTE ...>`, the driver verdict), and Task 11's host `package.json` (`<the repo's range>`, with the command that prints it beside it and the values it printed while this plan was written). Task 8's "read the emitted react tree" step is a comparison instruction, not an instruction gap, not an instruction gap; the substance is "compare against A3/A4 and list every difference".

**Every task ends green, checked task by task.** This is what the ordering is FOR, and it is the review finding that reordered the plan, so here is the closing gate of each task and what it proves.

<!-- gate-list: partial -- per-task closing subsets, deliberately not the merge gate: each row is the narrowest set that can be green at that commit, and Tasks 7 and 8 omit verify:blocks on purpose. The merge gate is the required `test` job graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

| Task | Closing gate | The green means |
|---|---|---|
| 2 | create-kai suite, gallery + dev suites, blocks typecheck + suite, `nx typecheck ui` | the form id is a union type, so a missed literal is a compile error in two packages |
| 3 | the same, plus the blocks suite | a REQUIRED `FormFile.target` is a compile error in four `packages/ui` files and in the blocks tests |
| 4, 5 | blocks suite + typecheck | the parser and the analyzer, over fixtures |
| 6 | those, plus create-kai's build, pack shape and suite | the commit where parse5 enters the CLI bundle; the bundle guard is measured, not assumed |
| 7 | blocks suite, `nx typecheck ui`, `dev.test.ts` | the html renderer over the shared fixture. `dev.test.ts`'s synthetic block is UNCONVERTED and its html case asserts the new 500; react and cdn still go through the old renderers, which handle it |
| 8 | blocks suite + typecheck, create-kai suite, `dev.test.ts`, `verify:generated` | the react renderer over the same fixture. The CLI and dev react cases assert the REFUSAL the still-unconverted real blocks get. **`verify:blocks` is deliberately absent**: it renders real blocks and would correctly refuse |
| 9 | `verify:blocks` end to end, both packages' suites and typechecks, create-kai build + pack + suite, `dev.test.ts` | every deferred assertion turns positive in this one commit: the CLI's react case, the dev route's three forms, and `verify:blocks` itself |
| 10, 11 | `verify:scaffold`, `verify:blocks`, `verify:blocks:react` | the cells, each watched failing on a planted defect first |
| 12 | every block gate over all three blocks | the contract is mandatory now |
| 13 | the whole list | nothing regressed |

Tasks 7 and 8 each end with a suite asserting a REFUSAL rather than a result, and that is stated in both, in their commit bodies, and in the table above. **Task 9 must turn all of them positive; a task that leaves a refusal assertion standing after the refusal stops being true has ended red.**

**Type consistency, checked across tasks.** `FormFile` is `{ path, content, target }` from Task 3 onward, and every renderer's `put()` supplies all three. `ParsedTemplate` fields (`lang`, `bodyAttrs`, `headInner`, `body`, `stylesheets`, `kaiTags`, `refs`, `markerCount`) are defined in Task 4 and consumed by name in Tasks 7 and 8. `ControllerShape` is `{ name, stateFields, actionNames, refNames }` in Tasks 5, 6, 7 and 8. `pascal` has one definition (Task 6, `registry.ts`) and `componentName` re-exports it (Task 7). `renderHtmlForm` gains its `{ registration }` option in Task 9 and its Task 7 callers pass nothing, which is why the option defaults to `'bundler'`. `handlerName` is defined in Task 8 and pinned against `onName` in the same task.

**Known gaps, stated rather than hidden.**

- The `*for` binder's keyed rebuild is written out in Task 7 but has no unit test that RUNS it -- `packages/blocks`'s suite is `environment: 'node'` and the binder is a string. Its behaviour is covered by the driver (`5-conversations` renders the rows) and by `verify:blocks:react`. If the reviewer wants it pinned closer, the honest place is a jsdom test in `packages/ui`, not a DOM in the blocks package.
- Task 10's html cell checks syntax and the absence of TypeScript, not semantics. The binder's semantics are covered by the driver, which is the right instrument; nothing in this plan claims tsc sees the html form.
- The plan assumes PR B0 is on `main` (typed refs, `slot`/`hidden` on `WebComponentProps`, `undefined` restoring the declared default, `ConversationSummary` from `/stores`). All four were verified present on the tree at `0b4046af` while this plan was written. If Task 8's react tree needs a cast, that assumption broke and it is a STOP, not a workaround.
- Task 11's driver change (`layoutProbes` / `skipLayout`) touches `packages/ui/scripts/block-driver/driver.mjs`, which every block run goes through. It is two lines and a skip in the `expect` loop, and the plan requires watching the un-guarded version fail first -- but it IS a change to shared harness code in a task about a new cell, and a reviewer should look at it as such.
- The `data-block-root` marker is new vocabulary the spec did not have. It is a `data-` attribute rather than a binding prefix, it is validated (exactly one), and Task 13 writes it into spec 3.1 -- but it came from this plan rather than from the spike, so it is the piece of the contract with the least evidence behind it. The evidence it does have: today's react form emits the host stand-in paragraph into a consumer's component, which nobody wants.
