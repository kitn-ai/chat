# HANDOFF ADDENDUM 2026-09-03: PR C merged, the release, the rulings, the ticket list

Addendum to [`HANDOFF-2026-09-02-night-run.md`](HANDOFF-2026-09-02-night-run.md), section 3.2.
That file is the operating order and is unchanged. This one is the record of what PR C did, every
decision the controller made without you, and what was deliberately left on the floor. It follows
the shape of [`HANDOFF-2026-09-03-pr-b-addendum.md`](HANDOFF-2026-09-03-pr-b-addendum.md).

## 1. Read this first

PR C is merged: [#375](https://github.com/kitn-ai/ui/pull/375), squash commit `94f89894` on
`main`, `feat(blocks)!:`.

**The one thing to read before anything else.** Task 6 found that every block's CDN form pinned
`@kitn.ai/ui@0.31.0`, and the published 0.31.0 does not ship `dist/stores.js`, which every preview
imports (jsDelivr 404; `kai.es.js`/`state.js`/`wire.js`/`elements/autoloader.js` all 200). In
production that meant all three preview iframes on `/blocks` would be broken the moment this PR
shipped. The fix was the next kit release, already queued as a release-please PR (#354). The owner
authorized merging it mid-PR-C (admin merge, since the bot branch carries no required checks), and
I merged it: `@kitn.ai/ui` 0.32.0 and `create-kai` 0.5.0 published. PR C then merged `main` so
every pin in the branch reads 0.32.0, and `apps/docs/scripts/verify-preview-source.mjs
--require-published` went from a real red (`stores.js -> 404`) to green.

`deploy-docs.yml` now runs that strict published-entry probe before the upload step, so a future
version-skew window turns the deploy red instead of shipping broken previews. The run after the
squash merge (headSha `94f89894`) passed. `/blocks` is live at https://ui.kitn.ai/blocks.

Screenshots the controller read personally are under the session scratchpad, `pr-c/shots-2/{local,production}`
(forty PNGs) and `pr-c/crops2/`; the first pass that caught the two card defects is kept beside
them at `pr-c/shots/` and `pr-c/crops/` for comparison.

The owner asked to clear the session after this addendum lands. The resume prompt in section 7 is
paste-ready for the next one.

**Not a defect, a note.** Two agents died to Opus API 500s near the end of this run (the whole-branch
review and part of the final fix wave had to be redispatched). Nothing was lost: the ledger and the
in-flight commits survived each time and the next agent picked up from the last recorded state.

## 2. What merged

**The section.** `/blocks` on the docs site: a hero, a category strip, one card per block, built
as a Solid island (`BlocksIsland` -> `BlocksPage` -> `BlockCard`) out of an island of `kai-*`
elements: `kai-segmented` for the Preview/Code and viewport toggles, `kai-select` for the
framework dropdown, `kai-file-tree` and `kai-code-block` for the code view, `kai-button` and
`kai-tooltip` for the rest. `/blocks` is a sixth entry in `src/topics.mjs`, read by both
`astro.config.mjs` and `Header.astro`.

- The framework dropdown **is** `FRAMEWORK_BLOCK_FORMS`, derived rather than hand-listed: two rows
  today (`html`, `react`); PR B2's remaining renderers will show up with no site edit, and
  `test/blocks-source.test.ts` pins the equality.
- Framework choice is global and sticky in `localStorage`, read and written inside `try`/`catch`.
- **The preview switch:** `KAI_BLOCKS_KIT=local` previews the working tree's kit; unset (the
  deploy) previews the published CDN pin. The footer states which, in words, and it is legible in
  both themes.
- **Each card's add command is derived from that card's own id.** A test renders more than one
  card and asserts the commands differ (the mockup's copy-paste defect, where every card printed
  `support-widget`, is what this guards against).
- Download `.zip` is keyed on `FormFile.target`, so the archive unzips into the same project shape
  the file tree displays (ruling C10), not the flat `FormFile.path` the retired gallery writer
  used.

**The two guards, and which workflow runs which mode.**

- `apps/docs/scripts/verify-preview-source.mjs` refuses a build carrying a local kit path, an
  unpinned preview, the local footer text on a shipped chunk, or zero CDN forms, and probes every
  `@kitn.ai/ui@<pin>/dist/<entry>` the built previews import against jsDelivr. The **plain** form
  (`verify:preview`, no flag) warns on a miss and exits 0; it runs in `dist-guards`, part of the
  required `test` job. The **strict** form (`--require-published`) is fatal on a miss and runs only
  in `deploy-docs.yml`, immediately after the site build and before the Storybook copy and the
  upload, deliberately ahead of the Storybook copy, since the guard walks the whole built tree for
  local-kit markers and `storybook-static` is thousands of files with nothing to do with previews.
  A non-404 miss (429/5xx) is retried once after 2000ms before being called a failure, since that is
  the registry not answering rather than a fact about the release; the epilogue names which case it
  hit ("release first" for a 404, "re-run the workflow" for anything else).
- `apps/docs/test/blocks-targets.test.ts` asserts, for every block and every framework, that the
  path the page displays equals what `fileTarget()` returns.
- Four steps joined the required `dist-guards` leg (docs suite, scoped `typecheck:blocks`, the astro
  build, the plain preview guard); `lint-gate-parity` recognises all four. `dist-guards`'
  `timeout-minutes` rose 15 -> 25 (ruling C11) for the added astro build.

**The retired gallery.** The exact BREAKING CHANGE paragraph from the squash body:

> BREAKING CHANGE: `kai dev --builder` no longer serves /gallery/ or the /kit/
> mount its previews imported from, and dist/gallery leaves the published
> tarball. Browse blocks at https://ui.kitn.ai/blocks.

`packages/ui/apps/gallery`, the `KAI_BUILD=gallery` page build, `dist/gallery`, `galleryPageDir`,
every `/gallery` route in the construct dev server and the `/kit/` CORS mount its previews imported
from, plus the story and the tests that covered them, are all gone. The block driver's own `/kit/`
mount at `packages/ui/scripts/block-driver/serve.mjs` is a different mount and was left untouched;
`verify:blocks`'s three `[driver]` cells are the proof it survived.

**The pack ledger delta**, quoted from `verify:pack` (Task 8's report), before and after a cold
build:

```
before: 675 files, 11.77 MiB unpacked (ceiling 11.85 MiB)
after:  659 files, 10.60 MiB unpacked (ceiling 10.90 MiB)
```

16 files and 1.17 MiB, which is `dist/gallery` exactly (16 emitted paths, `du -sk` 1176 KiB before
deletion). The ledger entry in `verify-pack-weight.mjs` records both what left (`dist/gallery/`) and
what stayed (`dist/blocks/`, still read by the docs site and `create-kai add`); this is the first
ledger entry that moves the ceiling **down** rather than up.

**The vite/postcss workaround (#376).** `apps/docs` moved from `vite ^7.3.6` to `^6.0.0`, and the
workspace root gained `pnpm.overrides.postcss`, because under `node-linker=hoisted` two vite type
identities in the tree turned `packages/ui`'s `tsconfig.tests.json` pass red with an error naming
neither file. astro 6 nests its own vite 7.3.6, so the site build itself was unaffected;
`skipLibCheck` was already on, so no narrower tsc fix existed. Registered in `docs/coupling-map.md`
as enforced by NOTHING (item 49), with #376 as the durable fix (put `packages/ui` on vite 7,
restore `apps/docs`, drop the override).

**The three issues filed out of this PR:** #376 (vite alignment above), #377 (`kai-code-block`
needs a line-number prop; spec 4 asked for line-numbered code and the element has no such prop, so
faking a gutter outside the shadow root was rejected), #378 (the preview iframes stay light in dark
mode, since each is a separate document loading the block's own CDN form and the site's
`data-theme` does not cross the frame; a decision about what a preview is for, not a bug).

## 3. Rulings I made

Exhaustive, in ledger order. Every one is recorded in the SDD ledger
(`pr-c/ledger/progress.md`) with the finding that prompted it.

**Pre-flight, from the read-only scan of the plan against the tree (findings F-1 through F-11):**

- **C1** (F-1, T2/T3): the generated `BLOCKS_PREVIEW` module drops `as const` and is annotated
  `{ mode: 'cdn' | 'local'; previewDir: string; footer: string }` instead, so `previewUrl`'s
  `mode === 'local'` branch typechecks. Cost if wrong: none.
- **C2** (F-2, T5): `KaiBase extends JSX.HTMLAttributes<HTMLElement>` in `kai-jsx.d.ts`, so `ref`
  and `on:` handlers on every kai element in `BlockCard.tsx` type. Cost: none.
- **C3** (F-3, T3/T7): `tsconfig.blocks.json`'s `types` becomes `["vite/client", "node"]` and
  `@types/node` joins `apps/docs` devDependencies, so `blocks-targets.test.ts`'s `node:fs` /
  `node:module` / `node:path` imports resolve inside the scoped typecheck. Cost: one dev dependency.
- **C4** (F-4, T2): `globals: true` in the new `apps/docs` vitest config, matching
  `packages/ui/vitest.config.ts`, so `@solidjs/testing-library` registers its `afterEach(cleanup)`
  and repeated renders in `blocks-page.test.tsx` don't accumulate on `document.body`. Cost: none.
- **C5** (F-5, T2): the `lint:cdn-pins` watched-red step the plan called for cannot fire on this
  tree as written (the walker already skips `dist` directories, and the only reachable semver pins
  already equal the current version). Ruling: produce the red honestly by scratch-bumping
  `packages/ui/package.json`'s version before a local-mode copy, observe, revert; failing that,
  record the `SKIP_PATHS` entry as a forward-looking exemption with no reproducible red today.
  Cost: minutes.
- **C6** (F-6, T7): the planted `.bak` file for Task 7's drift test is written outside
  `dist/blocks/f/`, so the watched red is exactly the target mismatch and not also a spurious
  axis-floor failure from an extra file in that directory. Cost: none.
- **C7** (F-7, T7): the preview-source guard imports `previewSource` from `copy-blocks.mjs` for its
  footer wording rather than restating the literal, closing the exact "derive, don't type" class the
  repo already has a rule against. Cost: none.
- **C8** (F-8): the plan's self-review screenshot count ("twelve") is wrong; Task 10 reports the
  real count from `ls | wc -l` (forty: 20 local + 20 production) and the plan document is not
  amended for a count. Cost: none.
- **C9** (F-9, T8): `packages/blocks/README.md` joins Task 8's named-sites table for the gallery
  reference sweep. Cost: none.
- **C10** (F-10, T4/T5): the download `.zip` is keyed on `FormFile.target`, matching the owner's
  "displayed path equals written path" ruling extended to the zip; stated in the PR body. Cost if
  wrong: a zip layout the owner dislikes, one line to revert.
- **C11** (F-11, T9): `dist-guards`' `timeout-minutes` rises to 25 with a comment naming the astro
  build as the reason; Task 10 was to read the first CI run's step timings into the PR body. Cost:
  none. (The PR body shipped without that line; see section 5's process notes on this being left
  open through the final push.)

**During execution:**

- **C-T2-a** (Task 2 review): the out-of-scope dependency edits (`apps/docs` vite ^7.3.6 -> ^6.0.0,
  the root `pnpm.overrides.postcss`) stand. The reviewer confirmed astro 6 nests its own vite
  7.3.6 so the build is unaffected, the override is a dedupe inside every declared range, and
  `skipLibCheck` was already on so no narrower fix existed. Task 9 registered the coupling and
  ticketed the durable fix (#376). Cost if wrong: a hoist re-roll on the next dependency change; the
  coupling row is the tripwire.
- **C-T5-a** (Task 5 review, Approved-with-1-Important): the Important (a path-naming defect via an
  untracked coupling) entered a fix round per the skill rule, and two minors were promoted into it
  alongside it: the Download control staying live in an error state (the repo's decide-loudly
  class), and a stale-load race. Fix round 1/1 addressed all three.
- **C-T6-a** (Task 6, the version-skew finding above): `verify-preview-source.mjs` gains the
  published-entry probe, plain form warns in `dist-guards`, strict `--require-published` form gates
  `deploy-docs.yml` before the upload. The PR body and this addendum both say: merge the release,
  then re-run deploy if needed. Cost if wrong: the docs site does not redeploy other content until
  the release; one `workflow_dispatch` after.
- **C-T8-a** (Task 8 review, 2 Important): the `!` on the retirement commit stands: `kai dev
  --builder`'s `/gallery` URL was advertised in the 0.32.0 startup log, and pre-1.0 a breaking
  change is still a minor bump, so `!` is correct either way. The BREAKING CHANGE footer was amended
  to name only the true break (not unpublished internals).
- **C-T8-b** (Task 8 review): delete the dead `blocksDistDir()` export in `dev.ts`, unreferenced
  after the gallery route section was removed.
- **C-T8-c** (Task 8 review): drop the empty `'../apps/**/*.stories'` Storybook glob, since `apps/`
  held no stories once the gallery story left with the app; `story-roots.mjs` was changed to
  *derive* its walk roots from `.storybook/main.ts`'s `stories:` array instead of hard-listing
  `src`/`apps`, so the next glob change moves every walker with no second edit.
- **C-FW-a** (whole-branch review, fix wave): Important 1 (CLAUDE.md still said "gallery" twice),
  Important 3 (the strict probe named every non-200 as "release first" with no retry, fixed with
  the retry-and-branching-epilogue described in section 2), Important 4 (the PR title's scope said
  "docs" where it meant "blocks") were fixed. Minors 5 (Starlight prev/next pager on the `/blocks`
  splash page), 7 (footer scan narrowed to `/_astro/*.js` chunks, `FOOTER_SCOPE` dropped as a
  no-op), 8 (PR body screenshot count, and file the three issues), 9 (zip.ts provenance comment
  tense) were also fixed in the wave. **Important 2 was a revert, not a fix**: four comment-only
  gallery-word edits under `packages/create-kai/` were reverted out of PR C's squash and banked as a
  patch for PR D, so release-please could not attribute a ui-only BREAKING CHANGE to the create-kai
  package. Cost if wrong: four stale "gallery" comments in create-kai for one PR cycle.

**Admin-merge mechanics of the release (ruling, section 1).** #354 was the release-please bot PR;
its branch carries no required checks by design (release-please branches don't run CI), so merging
it required an admin merge. The owner authorized this explicitly given the concrete, observed
breakage (the strict probe's real red at 0.31.0) rather than a hypothetical one. The controller read
the screenshot evidence (Task 6's `blocks-cdn-1280.png`, showing the empty assistant preview iframe)
before asking, and confirmed the release-please run (33749763494) published successfully before
resuming PR C.

## 4. Deferred to the next rounds

Grouped by area. The small-tickets PR (night run 3.6) is the home for everything marked as a
ticket; the rest belongs to whichever PR opens that file next. The PR B addendum's own deferred
list still stands unchanged; this section does not restate it.

**Guard polish.**

- `copy-blocks.mjs`'s `main()` (the hard-fail path, the kit-mount filter, idempotency) has no test;
  the filter equality is the fragile part.
- Local mode mounts the whole of `packages/ui/dist` under `public/blocks/kit` (gallery-era leftover
  paths, `builder-page`, `mcp.es.js` included); local-only, no production exposure.
- `story-roots.mjs`'s regex parser would misread a non-string-literal glob shape rather than throw.
- Nothing asserts `deploy-docs.yml` keeps its `--require-published` flag. Dropping it silently
  reopens the version-skew hole and `lint-gate-parity` cannot see it (the workflow is outside its
  scope by design). The `packages/ui/tests/scripts/*-guard-wiring.test.ts` family is the existing
  idiom for closing this.
- `probeEpilogue([])` returns the release-cadence branch vacuously (`[].every(...)` is true);
  unreachable today since every call site guards on a non-empty miss list, but worth knowing if a
  call site moves.
- The 2000ms retry delay is a judgement call with nothing measuring whether it is long enough for a
  jsDelivr rate limiter; the strict-run worst case doubles on an outage.
- Read the first CI `dist-guards` run's real step timings into a doc (ruling C11 was never closed
  with a number; the PR shipped without one).

**Card polish.**

- The viewport `kai-segmented` has no `data-testid`, so nothing but the visual pass drives it.
- The dropdown test restates `frameworkOptions()`'s mapping instead of calling it.
- The info tooltip is hover/focus only (checked visually at 390px, not otherwise).
- `tsconfig.blocks.json` carries a redundant explicit `kai-jsx.d.ts` include (brief-mandated,
  harmless).
- The toolbar's two-row container-query grid is a stronger guarantee than the reserved-height
  approach it replaced, but the parity assertion still lives in a probe script, not the suite;
  jsdom cannot measure a container query. A Playwright check is the durable version.
- #378: previews don't follow the site theme (filed, not fixed: a decision, not a bug).

**Docs/CI.**

- `--breakpoint-nav` is 78rem where the stated round-up rule would give 77rem (headroom chosen
  deliberately; the CSS comment carries the measurement and the argument).
- `.landing-page`'s CSS rules are now split in two by the new `.blocks-page` block in `app.css`.
- `typescript ^5.5.0` joined `apps/docs` devDependencies, shifting the optional-peer typescript
  resolution for starlight/i18next to 5.9.3 in the lockfile; a one-line note, not a defect.

**Dependency alignment.**

- #376: align `packages/ui` onto vite 7, restore `apps/docs` to `^7.3.6`, retest with the root
  `pnpm.overrides.postcss` removed.

**Zip.**

- No test for `storeZip([])` or a non-ASCII target; the UTF-8 filename flag `0x0800` is not set,
  inherited unchanged from the writer this ports.

## 5. Process notes

**Shape of the run.** Ten tasks, a fresh implementer per task, a reviewer per task who was never
that task's implementer. Fix rounds by task, read from the ledger: Task 5 one round (3 items
addressed), Task 6 one round (3 items), Task 8 one round (4 items), Task 10 one dispatch on top of
the fix commit from Task 5's second round (the visual re-run). Tasks 1, 2, 3, 4, 7, 9 needed none.
Then one whole-branch review, then one final fix wave (7 items, all addressed on re-review, four
more parked for the next round).

**The pre-flight scan paid for itself again.** The read-only scan of the plan against the tree,
before any task ran, found eleven findings (F-1 through F-11): a generated module's `as const`
defeating its own consumer's comparison, JSX declarations too narrow to type the markup they exist
for, a scoped tsconfig excluding the node builtins its own test imports, a missing vitest `globals`
flag silently breaking test isolation, a watched-red step that could not occur on this tree, a
planted defect that fired two assertions instead of one, a hand-copied literal the repo's own rule
forbids, a wrong hand-typed count in the plan's self-review, a file missing from a named-sites
table, an inherited-but-worth-flagging zip behavior, and a CI timeout budget worth a deliberate
decision. None of these was found in code once tasks started; all eleven were found by reading the
plan against the tree before Task 2.

**The visual pass caught two card defects the jsdom suite could not see.** Task 10, first pass:
`kai-segmented` painted its light theme inside a dark card (no `theme` attribute set, no
`data-theme` observer, unlike every other docs island), and at 390px the toolbar wrapped to a
different number of lines in Preview vs. Code mode, so switching modes moved everything below it by
40px. Neither is reachable from jsdom, which cannot render a real box model or a real theme cascade.
The standing rule this confirms again: **new visual surfaces get a stub-data Storybook story first
for design iteration, and an IVP/visual checkpoint before merge**: the dark-mode miss "got through
nine tasks and two reviews because nothing in the suite renders dark," as Task 10's own report put
it, the same shape as an earlier docs-nav regression that shipped invisible. Task 10 stopped rather
than fixed (per its dispatch, "a finding in the card is a stop for you"); the controller ruled
C-T10-a to resume the Task 5 implementer for a second fix round, then re-ran the full 40-shot visual
pass and confirmed both closed by measurement, not by eye alone.

**`exec astro dev` skips the `predev` copy hook.** Running the docs dev server through `pnpm exec
astro dev` rather than the `pnpm --filter @kitn.ai/docs run dev` script bypasses `predev`, so
`public/blocks` never gets copied and the page 404s on its registry. This tripped the owner's own
local test of the branch and is worth remembering: always use the package script, not a bare
`astro` invocation, for anything that depends on a prebuild hook.

**Agents' builds flipped the shared worktree's preview mode under a live dev server.** Because
`KAI_BLOCKS_KIT=local` vs. unset is decided at copy time and `public/blocks` is gitignored state on
disk, an implementer's local-mode build during one task silently changed what a dev server already
running against the same worktree was serving. Nothing broke, but it is a footgun worth naming for
anyone running `kai dev` or the docs dev server against a worktree another agent is also building in.

**`storybook-gate` is a required check.** Confirmed again this round (ruleset 18328421: `test` and
`storybook-gate`). No storybook-gate failure occurred in this PR, but the memory note carried
forward from PR B, that it is required and not advisory, held.

**Two Opus agents lost to API 500s near the end of the run.** Both redispatched successfully with
no loss of ledger state; noted in section 1 as informational, not a defect in the process.

## 6. State of main and next

`main` is at `94f89894`. `feat/blocks-site-section` is deleted remotely (squash-merged); its
worktree `.claude/worktrees/blocks-c` should be removed if still present.

**PR D is next**, the CLI (`create-kai add`), per night run 3.3 (the 2026-08-31 spec's Part 3 plus
spec section 3.4). Its plan draft and review were in flight in the session scratchpad, under
`pr-d/2026-09-03-create-kai-add-targets.md` and `pr-d/plan-review.md`; check first whether
`docs/superpowers/plans/2026-09-03-create-kai-add-targets.md` is on `main`. If it is not, and the
scratchpad draft is also gone (a cleared session can lose scratch state), re-plan PR D from night
run section 3.3 plus the 2026-08-31 spec's Part 3 rather than guessing at what the draft said.

The worktree `.claude/worktrees/blocks-d` on branch `feat/create-kai-add-targets` is already
prepared: installed and built (kit `dist/`, `compiled.css`, `dist/blocks`, `create-kai`'s own
`dist`).

**PR D must carry the banked create-kai gallery-word sweep as its own `chore(create-kai)` Task 0.**
The patch is at the session scratchpad, `pr-d/create-kai-gallery-sweep.patch` (a `git diff
origin/main..HEAD -- packages/create-kai` taken from PR C's branch at the tip that had the four
comment edits; it applies cleanly on PR D's branch). Apply it first, as its own commit, before PR
D's real task sequence.

After D: PR B2 (vue/svelte/angular/solid renderers), the pages move to `apps/`, the small-tickets PR
(section 4 above plus the PR B addendum's own list), then the new-blocks round. Night run section 5
is still the only list of reasons to stop.

## 7. Resume prompt

> Read this addendum (`docs/superpowers/HANDOFF-2026-09-03-pr-c-addendum.md`), the PR B addendum
> (`docs/superpowers/HANDOFF-2026-09-03-pr-b-addendum.md`), and the night run
> (`docs/superpowers/HANDOFF-2026-09-02-night-run.md`), in that order. The night run is the
> operating order; the addenda are what actually happened.
>
> Check `git status` (expect clean but for an untracked `support-widget.construct.json` at the repo
> root, leave it) and `git pull`.
>
> Confirm the worktree `.claude/worktrees/blocks-d` exists on branch `feat/create-kai-add-targets`
> and is built: `node_modules` present, `packages/ui/src/elements/compiled.css` present,
> `packages/ui/dist/custom-elements.json` present, `packages/ui/dist/blocks` present, and
> `packages/create-kai/dist` present. Rebuild what is missing before starting.
>
> If `docs/superpowers/plans/2026-09-03-create-kai-add-targets.md` is on `main`, execute it with
> `superpowers:subagent-driven-development` per night run section 2: plan pre-flight scan first, a
> fresh implementer and a separate reviewer per task, a whole-branch review on the most capable
> model, one fix wave, push, watch CI, squash-merge, delete the remote branch, remove the worktree,
> update memory, then a handoff addendum through a temporary worktree, the same shape as this one. The
> plan's first task must apply the banked patch at the session scratchpad,
> `pr-d/create-kai-gallery-sweep.patch`, as its own `chore(create-kai)` commit before the real task
> sequence starts.
>
> If the plan is not on `main`, write it first, per night run section 3.2 step 1 ("write the plan
> first"), from section 3.3 of the night run and the 2026-08-31 spec's Part 3, then get it
> independently reviewed before any task runs.
>
> Then continue the queue: PR D, PR B2, the pages move, the small-tickets PR, the new-blocks round.
> Night run section 5 is still the only list of reasons to stop; section 6 is still what you decide
> yourself.
