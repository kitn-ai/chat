# HANDOFF ADDENDUM 2026-09-03: PR B merged, the rulings, the ticket list

Addendum to [`HANDOFF-2026-09-02-night-run.md`](HANDOFF-2026-09-02-night-run.md), section 2 step 8.
That file is the operating order and is unchanged. This one is the record of what PR B did, every
decision the controller made without you, and what was deliberately left on the floor.

## 1. Read this first

PR B is merged: [#374](https://github.com/kitn-ai/ui/pull/374), squash commit `c785d1a3` on `main`.

**The one finding to read before anything else.** The whole-branch review found that the authored
binding grammar accepted `.innerHTML` / `.outerHTML` / `.srcdoc` and `:href` / `:src` class targets.
Those are model-output sinks, and this repo's threat model says everything the model produced is
untrusted input. No shipped block and no published artifact bound one (grepped, and the sink is
chosen by the block author, who is the consumer). The controller ruled it a HARDENING of the
grammar rather than a security stop under the night run's stop rule 2, and closed it inside the same
PR with refusals in `parse-template.ts` plus a dated amendment to spec 3.1 naming both sink sets and
the reason.

If you would rather have been woken for it, say so. That call is ruling F-1 in section 3, and it is
the one on this page most worth overruling.

## 2. What merged

**The contract.** A block is an authored `<id>.html` carrying a binding grammar (`.prop`, `:attr`,
`@event`, `*for` plus `:key`, `seed:`, `#ref`, and one `data-block-root` marker) and an
`<id>.controller.ts` exporting `createController` plus three interfaces named after the block, the
Actions one including `boot`. `packages/blocks/src/contract/parse-template.ts` is the single owner
of the grammar; `analyze-controller.ts` is the single owner of the controller shape and cross-checks
it against the bindings the page declares.

**Three renderers over that one source.** `html` emits the page plus a generated binder; `react` a
typed-wrapper tree over the controller with handler names derived rather than typed; `cdn` the same
html form inlined and pinned, rendered through `renderHtmlForm` with
`{ registration: 'autoloader' }` so the paste form pulls no `/elements` import.

**`packages/blocks/src/targets.ts`.** One install-root table. `files[].target` is derived from it in
every renderer instead of restating a basename, so the path the blocks page will show is the path
the CLI writes. It is registered in `docs/coupling-map.md` section 4.

**The form id.** The web-component delivery form is `html`, not `wc`, and it is a union type in two
packages, so a missed literal is a compile error.

**The gates.** `verify:blocks` grew contract, html-binder and react-tree checks; `verify:blocks:react`
is new and runs each block in a real browser; `verify:scaffold` grew block-form compile cells through
the shared `consumer-tsc-projects.mjs` harness. Every one prints the blocks, checks and cells it ran,
so read its output rather than a number from any document. The `Block cells` CI step in the browser
leg gained the React runtime cell.

**Three conversions, baselines untouched.** `assistant`, `in-app-assistant` and `support-widget` all
moved onto the contract, and the transitional predicate was deleted in Task 12. No driver baseline
was re-recorded anywhere in the branch: `git show --stat` over
`packages/ui/scripts/block-driver/baselines` is empty for every conversion commit, and all three
drivers passed against the committed baselines. Screenshots the controller read personally, under the
session scratchpad: `pr-b/task9/driver-after` (support-widget home and conversations), and
`pr-b/task12/driver-after-assistant` plus `pr-b/task12/driver-after-in-app-assistant` (the reply-tool
and history-drill states). They match the committed baselines. **No baseline was re-recorded, so the
R4 re-record procedure never ran.**

**Two kit fixes, each its own `fix(elements):` commit.** Both were found by an implementer while
converting the first block, and both are the same class: a facade rule written for the imperative
shape that declarative markup breaks.

- `cabba617`: the autoloader never registered an element whose only occurrence on a page is inside a
  `<template>`, because a template's children live on `.content` and `querySelectorAll` walks past
  them. A generated block page ships its `*for` row markup in exactly that position, so this is a
  deadlock and not a slow path: the binder awaits `whenDefined` before its first apply, and that
  apply is what would have put a row in the live DOM. Observed live as a hang with no console error
  and no failed request. The same commit makes `readSlots` ignore a `hidden` slotted node.
- `b257dce4`: the follow-through. `readSlots` now depends on an attribute as well as on the child
  list, and three of its callers (`chat.tsx`, `thread.tsx`, `chat-workspace.tsx`) observed
  `childList` alone, so a slotted child authored hidden and later un-hidden would have stayed
  collapsed for good. All three now observe `{ childList, attributes, subtree }`, matching the four
  that already did.

**The not-breaking ruling.** The squash is `feat(blocks):` with no `!` and no BREAKING CHANGE footer.
The candidate was `readSlots` ignoring hidden slotted nodes, which is observable without a consumer
changing a line: a `<div slot="sidebar" hidden>` used to reserve real space for something invisible.
It was ruled a fix because nothing was withdrawn (no export removed, no prop renamed, no signature
changed, no shape of consumer code that compiled before and errors now); because the documented
intent is the fix rather than the old behaviour (the seam design says an empty seam collapses with no
stray border or padding, and a hidden node produced exactly that padding); because `readSlots` is not
a documented public API, reachable only as a declaration under the `./elements/*` wildcard; and
because pre-1.0 `feat` already takes the minor, so `!` would force the same bump while asserting a
withdrawal that did not happen. The honest cost is that it can move a consumer's layout, which is why
the PR body gives it its own heading so it reaches the release notes. The second consumer-visible
change is inside a block, not the kit: the `assistant` rail search filter now removes filtered rows
through a keyed `*for` over a derived list instead of hiding them.

**The pack delta, as Task 13 enumerated it** from `npm pack --dry-run --json` read through
`scripts/pack-listing.mjs` and diffed against the Task 1 baseline. Sixteen added lines, nine removed,
net seven. The seven genuinely new paths are six per-form item JSONs (one per block per FRAMEWORK
renderer, never `cdn`, per ruling P14) plus `dist/elements/autoloader-walk.d.ts`. Every one of the
nine removals pairs with an addition for the same chunk under a new content hash, which is what
changing `slots.ts` and the autoloader does to a hashed chunk graph. Nothing was removed from the
tarball. `dist/blocks/**` was NOT new to it, contrary to the plan's framing: the baseline already
carried paths under `dist/blocks/r/`, and their CONTENT changed with no path moving, which a
path-list diff cannot show. `verify:pack` printed the pack weight and its ceiling on the Task 13 run
and was green; read that line rather than a figure from here.

The seventh new path is a small finding. `autoloader-walk.d.ts` is a declaration with no `.js`
sibling in the tarball, because the bundler inlines the module. It joins the pre-existing
orphan-declaration class under the `./elements/*` wildcard that Task 9 already ticketed, so this
branch adds one member rather than creating the class. `verify:dts` and `verify:dts:consumer` are
both green over it: dead weight, not a broken type.

## 3. Rulings I made

Thirty-three, in ledger order. This section is the only place they reach you. Every one is recorded
in the SDD ledger with the finding that prompted it.

### Pre-flight, from the read-only scan of the plan against the tree

The scan ran before Task 2 and produced sixteen findings, F-1 to F-16. Each ruling below closes one.

- **P0** (dispatch): Task 1's no-edit baseline capture runs in parallel with the pre-flight scan,
  since it edits nothing and no conflict is possible. Cost if wrong: a wasted rerun.
- **P1** (F-1, T4): binder markers are numbered in DOCUMENT order (increment before recursing), so
  the task's own test asserting parent 0 and child 1 stands. The plan's prose promised document
  order and the binder's readability depends on it. Cost if wrong: nothing material, any consistent
  numbering works.
- **P2** (F-2, T4): thread `hasParent` honestly, false for a direct child of body, so the
  "`*for` needs a parent element" refusal can actually fire, and place the fixture's `*for` element
  as a direct body child. Cost if wrong: the unreachable refusal that was the defect.
- **P3** (F-3, T4): the zero-root test asserts the error text the task specifies (it contains
  `data-block-root`), not the word `host`, which that string never had. Cost: none.
- **P4** (F-4, T4): `?` joins the refused-prefix regex with a message naming `:attr` as the right
  spelling. Spec 8a.2 requires the refusal. Cost: none.
- **P5** (F-5, T5): `memberNames` tokenizes an interface body before matching, so a single-line body
  reads every member instead of only the first. Cost if wrong: a scanner that misses members, which
  the tsc backstop catches anyway.
- **P5-amended** (T5 review): split members only at bracket-depth-zero separators. P5 as first
  stated split on `,` and leaked method parameter names in as members. The amendment is the whole
  reason a reviewer per task exists.
- **P6** (F-6, T8): the react import assertion checks the exact sorted import line, not a `Dock,`
  substring that sorting makes false. Cost: none.
- **P7** (F-7, T5/T6): `crossCheckBindings` lands in `analyze-controller.ts` during Task 6 as the
  plan says; Task 5 need not pre-declare it. Interface record only, no behaviour.
- **P8** (F-8, T10): the signature is `runBlockCompileCells({ tsc, blocks, forms, esbuild, log })`,
  and the implementer reads the harness's actual shape in `verify-scaffold-compiles.mjs` rather than
  the plan's paraphrase of it. Cost if wrong: one call site rewritten.
- **P9** (F-9, T11): the driver gains per-page `consoleIgnore`, merged with the scenario's, watched
  failing first. The plan told the implementer to put it on a page spec where the driver only read it
  off the scenario. Cost if wrong: a react cell that fails on a benign React dev warning.
- **P10** (F-10, T11): the Task 11 mechanism wins over R19's (a scenario `layoutProbes` name array
  plus page `skipLayout: true`), and the layout set is the four probes Tasks 9 and 11 name, including
  `homeCtaClearOfSubtitle`. Later and more specific plan text beats earlier. Cost if wrong: one
  geometry probe skipped on a page that asserts nothing about geometry.
- **P11** (F-11, T12): use the helpers that exist in `tests/registry.test.ts` after Task 6, never the
  `check(bodyHtml)` helper the plan invented in one place while warning against inventing it in
  another. Cost: none.
- **P12** (F-12, T13): `readPackListing` returns `{ paths, shape }`, so Task 13 uses `paths`. The
  same defect Task 1 hit and corrected inline.
- **P13** (F-13, T9): `renderCdnFormFiles` passes `{ registration: 'autoloader' }`; the plan's prose
  beats its code sketch. Cost if wrong: a cdn form importing `/elements`, which the pin check refuses
  anyway.
- **P14** (F-14, T10): per-form item JSON is emitted for FRAMEWORK forms only, never `cdn`, and
  always from the twinned block. Cost if wrong: an extra JSON nobody reads.
- **P15** (F-15, T3/T8): `pnpm --filter create-kai run build` precedes create-kai's vitest in both
  tasks, because `add.test.ts` drives `dist/index.js` and both tasks would otherwise have graded a
  stale bundle. Cost: build time.
- **P16** (F-16, T3): create `packages/create-kai/test/helpers.ts` exporting `loadBundledBlocks`,
  `KIT_RANGE` and `KIT_VERSION`, and point `add.test.ts` at it. A move, not a copy. Cost if wrong:
  one small test refactor.

### During execution

- **T4-a**: two reviewer minors PROMOTED into Task 4's fix round rather than deferred, because both
  are the repo's silent-drop class and not polish: a `<template>` silently dropped its subtree, and a
  `<head>` `<script>` bypassed the authored-script refusal. Cost if wrong: a few lines of work.
- **T5-a**: the generic-method silent drop, an out-of-scope observation, PROMOTED into Task 5's
  second fix round. Same silent-partial-loss class. Cost if wrong: minutes.
- **T6-a**: the transitional "is this an authored-contract page" regex stays as written even though
  it scans the whole page string and could false-positive on prose like `#ref=1`. It is transitional,
  the two unconverted blocks pass it, and Task 12 deletes the conditional. Cost if wrong: a visible
  false red on an unconverted block before Task 12, caught immediately.
- **T7-a**: Task 7 left create-kai's suite red because six `add.test.ts` cases hit the html
  renderer's new refusal over blocks not yet converted, and the plan's Task 7 gate list omitted
  create-kai entirely. Ruling: Task 8 turns those into refusal-shaped cases mirroring its own, and
  Task 9 restores the positive assertions. Cost if wrong: one commit on the branch with a red
  create-kai suite, which is already the case at `f79bccc8`.
- **T7-b**: two plan-MANDATED defects are fixed in Task 7 rather than shipped: state referenced out
  of scope inside `applyRowsN`, and a nested `*for` generating a binder that throws. A plan-mandated
  defect is still a defect, and the spec's intent is a generated file that never throws.
- **T7-c**: two more reviewer minors promoted into the same round: the suite proving the binder
  parses via esbuild, and a comment double-escape, which is the corruption class.
- **T7-d**: the create-kai typecheck was red at `src/blocks.ts` with a TS2345 introduced by Task 3
  and caught by nothing, because no task gate named it. Fixed in Task 7's round, and create-kai's
  typecheck joins every later task's gate list. Cost if wrong: minutes.
- **T8-a**: three findings promoted into Task 8's fix round: a duplicate JSX attribute when a literal
  sits beside its binding (Task 9's page does this on four elements, and the binding wins in react),
  the silent non-compiling emission for `style=` strings and literal braces (refuse `style` by name,
  escape the braces), and the missing `crossCheckBindings` call in the react renderer so both front
  doors refuse by name. Cost if wrong: minutes each.
- **T9-a**: both kit fixes ACCEPTED into PR B as `fix(elements):` commits rather than treated as a
  stop. Fix 1 is a deadlock with no block-side answer available. Fix 2 is the exact fix the brief's
  own known-delta prescribes, at the file it names. Cost if wrong: a public slot-occupancy rule
  changed inside a feat PR, reversible in one commit.
- **T9-b**: two reviewer minors promoted into Task 9's round: a public autoloader export bought only
  to make a test possible, and a `.d.ts` false positive in `verify-pack`.
- **T11-a**: Task 12 carries two Task 11 minors as requirements rather than as tickets. The react
  cell's self-test picks its plant block BY NAME (`support-widget`) instead of `authored[0]`, and
  `installTree` clears every emitted install root before each block's tsc so one broken block cannot
  print reds under other blocks' names.
- **T12-a**: the `hostHeading` probe keeps its name for this PR even though its meaning moved to
  "matches this page's declared host chrome", because a rename costs a baseline re-record for no
  behaviour change. The small-tickets PR renames it to `hostChromeAsPolicied` and re-records. Cost if
  wrong: a misreadable probe name for one round.
- **T13-a** (implementer's ruling, controller ratifies, whole-branch review agrees): `readSlots`
  ignoring hidden slotted nodes is NOT breaking. Reasoning in section 2. Cost if wrong: a consumer
  whose layout depended on a hidden slotted node reserving space is surprised by a minor rather than
  by a major, with the change named in the release notes either way.
- **F-1** (whole-branch review, security triage): the markup and URL sink finding is a hardening of
  the authored grammar, not a vulnerability in any shipped block or published artifact. The night
  run's stop rule 2 is for a finding the owner must act on before work can proceed; this one is
  closed by a refusal inside the same PR. Not a stop, fixed in the one fix wave, flagged first in
  this addendum so the owner can overrule. Cost if wrong: you wanted to be woken and instead read it
  in the morning with the fix already merged.
- **FW-a**: four findings from the scoped re-review of the fix wave go on the next round's ticket
  list rather than triggering a second wave, which the process forbids. They are `:xlink:href` as the
  same URL sink under another spelling, `#foo="x"` being read as a ref because the ref branch reads
  the value and ignores the target, `jsString` not escaping newlines in the quoted-literal attribute
  path, and the gallery story's CDN snippet pane showing an authored page that would not run as-is.
  None affects a shipped block or artifact. Cost if wrong: one more small-tickets item each.

One more decision, made by an implementer and ratified rather than numbered: the fix wave refuses
`@event` on a non-kai tag in the GRAMMAR rather than in the react renderer, so one authored page
cannot be accepted by one renderer and refused by the other. An existing grammar test that asserted
the old permission was narrowed with a comment saying what changed. That is the defect class the
contract exists to remove, and R21 already puts shape decisions at the grammar.

## 4. Deferred to the next rounds

The ticket list. Nothing here blocks anything. The small-tickets PR (night run 3.6) should absorb
everything marked **[tickets]**; the rest belongs to whichever PR opens the file next.

**Kit.**

- **[tickets]** Six elements still carry their own inline copy of the slot query and did not get the
  hidden-aware fix: `card.tsx`, `pane.tsx`, `dialog.tsx`, `input.tsx`, `setting-item.tsx`,
  `prompt-dock.tsx`. Nothing regressed, but the kit now has two answers to "does a hidden slotted
  node fill a region" depending on which element you ask, and that inconsistency is new. Worth
  closing sooner than a normal small ticket.
- Internal element modules emit orphan `.d.ts` under the `./elements/*` wildcard with no `.js`
  sibling. Pre-existing class; this branch added `autoloader-walk.d.ts` to it.
- `discover()` now walks `*` per mutation batch instead of `:not(:defined)`. A perf note, not a
  defect.

**Grammar and renderers.**

- **[tickets]** `:xlink:href` belongs in `URL_SINKS`, and `#foo="x"` should be refused the way an
  empty target now is (both from FW-a). `jsString` does not escape newlines in the quoted-literal
  attribute path, which needs a `"` and a line break in one authored value to reach.
- The URL refusal is a wholesale "not yet", not a policy. The moment a generated form runs
  `isSafeUrl` over a bound value it should become a guard; `URL_SINKS` is the single place to change,
  and the spec amendment says so.
- `classify` accepts an empty binding target in the `#ref` shape; a malformed `*for` cascades into a
  misleading `:key` error; a nested repeated element carrying `data-block-root` is not refused, only
  a direct body child is.
- `kaiTags` and `refs` are collected over the whole body rather than the `data-block-root` subtree.
- `renderBinder` takes `shape` and never reads it. Cross-checking prop and attr values against
  `shape.stateFields` would catch a typo'd `.textContent="titel"`; `stateFields` is currently read by
  nobody.
- Two `VOID_TAGS` definitions disagree (a Set in `html.ts`, a regex in `index.ts`).
- The ten-line parse preamble is duplicated between `html.ts` and `react.ts`; a shared `parseBlock()`
  would collapse it.
- `bindingProp` still camelCases `:data-*` and `:aria-*` targets in one attr case on kai elements. No
  real block authors that shape.
- Text nodes are trimmed onto their own lines, which is fatal inside `<pre>`; `headInner` is passed
  through verbatim, so R16's ASCII guarantee holds for the body only.
- `block.files.get(page) as string` dies inside parse5 instead of naming the missing file.
- The cdn inliner dedupes hoisted imports but not inlined module bodies. Unreachable from the
  generated binder today.
- **[tickets]** The gallery story's CDN snippet pane shows an authored page that would not run as-is
  (stub data), from FW-a.

**Gates.**

- **[tickets]** `fail()` in `verify-blocks-react.mjs` exits inside the `try`, leaking the temp
  install dir on the install-failure paths.
- **[tickets]** `child.kill()` may not reach vite through npx. A SIGKILL timer, or spawn
  `node_modules/.bin/vite` directly.
- Plant 3's expect alternative is broad; tightening it needs a shared-state probe, which moves a
  baseline.
- Read the first CI run's step timing for the browser leg. It is `timeout-minutes: 15` and the new
  cell adds two pack-and-install rounds.
- The TypeScript-survival regex is defined twice, in `block-compile-cells.mjs` and
  `verify-blocks.mjs`. Plan-mandated, and a coupling-map candidate.
- Nothing guards a story that renders at module scope against a contract tightening. Section 5 says
  why that cost a CI run; a unit-project case that imports the story module would be cheap.
- Stray double blank line in `verify-blocks.mjs`.

**Tests.**

- **[tickets]** The rail search filter, which is the headline conversion, has no driver state. Add an
  `8-search-filter` state on `assistant` with one `--record`.
- **[tickets]** The `hostHeading` probe rename to `hostChromeAsPolicied`, with the baseline
  re-record it costs (ruling T12-a).
- `add.test.ts`'s D7 case uses an identity stripper; a throwing stub would be honest.
- `tests/registry.test.ts`'s exports-map test hardcodes two entries instead of walking `pkg.exports`,
  so `./targets` is not automatically covered there.
- `dev.test.ts`'s "one shared renderer" case proved it for `cdn` alone until Task 9 converted the
  rest; re-read the assertion now that it can prove more.

**Docs and prose.**

- `support-widget.controller.ts` carried the same `view ?? 'home'` shape Task 12 removed from
  `in-app-assistant`. The fix wave closed it, so this is a note that the pattern existed in two
  places, not an open item.
- The hide-to-remove change for filtered rows needed a consumer-facing note; Task 13 put it in the PR
  body, and it should reach the release notes.

## 5. Process notes

**Shape of the run.** Thirteen tasks, a fresh implementer per task, a reviewer per task who was never
that task's implementer. Fix rounds by task: Task 4 one, Task 5 two, Task 7 one, Task 8 one, Task 9
one, Task 12 one; Tasks 2, 3, 6, 10, 11 and 13 needed none. Then one whole-branch review on the most
capable model, then exactly one fix wave off it (eleven items), then a scoped re-review of the wave,
which found nothing new and parked four items under FW-a. No second wave, per the process.

**The pre-flight scan paid for itself.** The read-only scan of the plan against the tree, before any
task ran, found sixteen places where the plan was wrong: a task's own test contradicting its own code
(marker ordering, a refusal that could never fire, an assertion on a word the error string did not
contain, a prefix the regex did not cover, an import assertion defeated by sorting, a helper the plan
invented while warning against inventing it); a scanner too weak for fixtures written in two other
tasks; interface records that omitted what a later task adds; two plan-versus-plan disagreements
about a mechanism; a return shape the plan got wrong twice; an option the prose required and the code
sketch dropped; a scope disagreement inside one task; a gate ordering that would have graded a stale
bundle; and a module the plan imported that does not exist. None of these was found in code. The
previous two rounds recorded the same thing.

**Two kit bugs found by implementers, not by review.** Both in Task 9, both while converting the
first block to the contract, and neither reachable from any existing test: the autoloader not walking
into `<template>.content`, and `readSlots` counting hidden nodes. The conversion was the test.

**The CI finding, and what it says about the gate.** CI run 1 on #374: `test` PASS, `storybook-gate`
FAIL. Shard 1 could not load `apps/gallery/GalleryPage.stories.tsx`, because the story built a stub
block with an authored entry script and no controller and rendered all three forms at MODULE scope,
so the renderers' new refusals made the file fail to import. Nothing local caught it:
`build-storybook` compiles a story without executing its module scope. It was folded into the fix
wave as item 11, the story's stub block was converted to the contract, and the cause was understood
before the fix, so the stop condition would have been a second red on the same cause. There was none.

**`storybook-gate` is a REQUIRED check.** Ruleset 18328421 requires contexts `test` and
`storybook-gate`. The memory entry saying Storybook is advisory and flakes on CI is STALE and should
be corrected: a red storybook shard now blocks a merge.

**A gate list that names nothing cannot catch anything.** create-kai's typecheck was red from Task 3
through Task 7, four tasks, on a TS2345 that Task 3 introduced. No task's gate list named it. Ruling
T7-d fixed it and put it in every gate list from Task 8 onward, and Task 13 added it to the closing
list too. This is the same failure the repo already documents in another form: the check that exists
but is never run is indistinguishable from the check that does not exist.

**`git checkout <file>` is not a safe revert.** Reverting a planted self-test failure with
`git checkout packages/ui/scripts/gen-blocks.mjs` also discarded the implementer's own uncommitted
edit to the same file, because plants are placed mid-task while real work is uncommitted. Restore a
plant from a copy instead. Separately, one implementer edited a file in the main checkout by mistake,
noticed, reverted it and redid the edit in the worktree, and recorded the whole thing. That is the
right behaviour; the branch-versus-worktree rule exists because the mistake is easy.

**A gate that refuses for procedural reasons is not a finding.** `verify:artifact-glob` refused twice
in Task 13, both times because its pre-build snapshot was missing or stale, which is its own
anti-vacuity design working. It needs `rm -rf packages/ui/dist`, a snapshot, then a full build.
Budget for that before re-running the closing gate list.

## 6. State of main and next

`main` is at `c785d1a3`. The `feat/blocks-authored-contract` branch is deleted locally and remotely.
The `blocks-b` worktree is removed.

**PR C is next**, the `/blocks` site section, per night run 3.2 (spec sections 4, 4.1 and 2.5). Its
plan is in flight in the session scratchpad under `pr-c/`, and it gets an independent adversarial
review against the tree before a single task runs, like every plan in this run. The worktree is
already prepared at `.claude/worktrees/blocks-c` on branch `feat/blocks-site-section`.

After C, the queue is unchanged from the operating order: **D**, then **B2**, then the pages move,
then the small-tickets PR that absorbs section 4's **[tickets]** items, then the new-blocks round.
Section 5 of the night run is still the only list of reasons to stop.
