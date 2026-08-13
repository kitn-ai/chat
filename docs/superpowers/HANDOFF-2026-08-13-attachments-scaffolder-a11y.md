# HANDOFF: attachments, the create-kai scaffolder, and a label-vs-visible-text a11y fix

**Verified against `origin/main` at `5a858268f4be3286323f6cd05fbcdfee2c9f514e`** (`docs: record that
nx typecheck ui is cached and can report a stale verdict (#200)`). The body was first derived against
`e6fd55e` and re-derived when main moved underneath it; §8.7 records what that move changed.

That SHA is the whole contract of this document. Everything below was read off that tree, and
`git log --oneline 5a85826..origin/main` measures exactly how stale it has become. Nothing here was
carried forward from a summary; the session that commissioned it supplied a narrative, every claim in
that narrative was checked against the repo, and §8 lists the ones that did not survive.

**This file contains no number a script can produce.** That rule went into root `CLAUDE.md` in #191,
and the reason it applies to handoffs too is written into the previous one: `HANDOFF-model-driven-components.md`
opens by explaining that it went stale between being written and being merged, that re-deriving it
against a newer base moved seventeen figures, and that the rate to plan for is about one figure in
three over a single day of merged work. So counts, timings and test totals are not restated here.
Where a figure matters, the command that prints it is named instead. Run the command.

---

## 0. Do this first

1. **`git log --oneline --first-parent 5a85826..origin/main`** and **`gh pr list --state open`**.
   One PR (#201) was open when this was finished, and main moved twice while it was being written.
2. **`@kitn.ai/ui@0.22.0` is PUBLISHED and is `latest`** (§2). Rob merged the release PR mid-session.
   Two breaking changes shipped with it. Anything that was "gated on 0.22.0" is now unblocked (§6).
3. **A sibling agent owns `packages/create-kai/**`.** #201 was open against it. Check whether it
   merged before touching that package.

---

## 1. What merged

Derive the list rather than trusting this table:

```
git log --oneline --first-parent 101bfc0..5a85826
```

`101bfc0` is #189, the previous session's handoff (`HANDOFF-2026-08-12-attachments-and-scope.md`), so
that range is exactly this session's landed work.

| PR | squash | subject |
|---|---|---|
| #188 | `4e02202` | `chore(test): re-measure the three invalidated timing figures` |
| #191 | `218d3ff` | `docs: record the how/whether split and purge derivable numbers from CLAUDE.md` |
| #192 | `c5b3751` | `fix(examples): the Solid starter imports from ./solid, not the root entry` |
| #193 | `082aaa6` | `feat(create-kai): Vue runs end to end, and the hole that let it not` |
| #190 | `202f01b` | `feat(wire,elements): one media-type declaration the composer and the encoder both derive from` |
| #195 | `1db4fcf` | `fix(create-kai): Next and TanStack stay planned, and the three things that hid why` |
| #194 | `b0ae942` | `feat(create-kai): Angular runs end to end, and Solid says why it cannot` |
| #197 | `5078a92` | `fix(examples): the Solid starter ignores nothing, and its favicon was ours to begin with` |
| #198 | `973d9f5` | `fix(examples): the svelte starter's svelte-ignore silenced the wrong rule` |
| #196 | `1130173` | `feat(create-kai): Svelte and HTML run end to end` |
| #199 | `e6fd55e` | `fix(elements)!: the label prop stops overriding text the user can see` |
| #179 | `4a28693` | `chore(main): release @kitn.ai/ui 0.22.0` |
| #200 | `5a85826` | `docs: record that nx typecheck ui is cached and can report a stale verdict` |

**The last two rows landed while this document was being written**, which is the failure this whole
file is organised around. Both were described as open in the narrative it was derived from; both were
re-checked and re-derived before it merged. See §8.7.

Rows are in **merge order, which is not number order**. #190 landed between #193 and #195; #194 landed
after #195; #196 landed after #197 and #198. Reading the numbers as a sequence will mislead you about
what each branch was built on, and that mattered here (§5.7).

Two PR titles differ from their squash subjects (#188, #191, #200), so `gh pr view N` and `git log`
give different strings for the same change. The squash subject is what release-please read.

---

## 2. The release: 0.22.0 shipped, with two breaking changes

**`@kitn.ai/ui@0.22.0` is published and is `latest`.** Confirm with `npm view @kitn.ai/ui dist-tags`;
`.release-please-manifest.json` on main reads the same version.

The release PR (#179) was held open for most of this session on purpose, because publishing is Rob's
call and the text-attachment work was gated in front of it. He merged it near the end, the `Release`
workflow completed, and the hold is now history rather than standing instruction. **Do not read the
"0.22.0 is held" line from the previous handoff as current.**

`packages/ui/CHANGELOG.md` is the record. Its `⚠ BREAKING CHANGES` block for 0.22.0 holds two entries:

- **`wire`: `OpenAIWireMessage.content` widens** from `string | null` to
  `string | OpenAIContentPart[] | null`. From #186, which merged in the previous session. A consumer
  doing `msg.content.trim()` stops typechecking.
- **`elements`: the `label` prop stops overriding text the user can see.** From #199, this session.

Both are minor bumps, not majors: the project is pre-1.0 and `bump-minor-pre-major` is set in
`release-please-config.json`.

---

## 3. The attachment work (#190): one media-type declaration, two layers

Read `packages/ui/src/wire/media-types.ts`. It is short, it is heavily commented, and the comments
are the design record. The claim it makes is that the composer's picker and the encoders derive from
one array, `ENCODABLE`, so deleting a row narrows both. That is the defect #186 fixed one layer down
generalised into a structure: the composer used to stage a `blob:` URL no encoder could represent.

Four things worth knowing before you touch it.

**Text files are sent as text, and this is not a preference.** The Anthropic block set is
`text` / `image` / `document` with no arbitrary-file member, so text content is the only
representation the wire can express. `text/*`, `application/json`, `application/xml` and two YAML
spellings encode on both wires. Decoding is UTF-8 via `TextDecoder('utf-8', { fatal: true })` rather
than raw `atob`, so binary wearing a text label is refused with a reason instead of arriving as
replacement characters. A NUL-byte heuristic was considered and deliberately rejected: the same
function serves the labelled-text path, where a host that said `text/plain` has asserted something the
kit should not overrule.

**`undetermined` is a decision status, and the filter is enforced inside it.** When nothing names a
file (`File.type` is `''`, or `FileReader` substitutes `application/octet-stream`), the media type
cannot decide it, and the filename is explicitly not evidence. `decide()` returns `undetermined`,
which means "look at the bytes". The gate is that it is returned **only when the effective policy
still admits `text/plain`**, the one thing a decode can establish. Narrow `accept` to `image/png` and
an unnamed file comes back `unsupported` instead, so the decode path is unreachable and a typeless
`.rs` cannot slip past an images-only filter. The comment states why the check lives there rather than
at each call site: there is one place to get right, and callers physically cannot reach the bytes
without being told to.

**An extension in `accept` throws, loudly.** `assertMediaType` rejects any entry starting with `.`.
The reason is recorded from measurement on that branch: `accept=".py"` resolved to zero effective
types and a picker with `accept=""`, a composer that silently accepted nothing, and `".py,text/plain"`
was worse because the half that worked made it read as correct. It is safe to throw because no
released version ships the prop. HTML's own `accept` does take extensions, which is exactly why
silence here was a trap.

**The `</file>` delimiter is escaped, and nothing else in the body is.** `textFileContent` in
`packages/ui/src/wire/files.ts` wraps a text attachment as
`<file name="..." type="...">\n…\n</file>`. Both attributes go through full XML attribute escaping
including `\r` and `\n`, because a filename lands between double quotes and a raw newline splits the
header. The **body** is touched by exactly one transform: `/<(\/file\s*)>/gi` becomes `&lt;$1&gt;`.
Left alone, a file containing `</file>` closes the block early and everything after it reads to the
model as the turn around the file rather than as file content, which is user-supplied bytes in
instruction position. The opening tag is deliberately left alone (it cannot end the block, and
escaping it would corrupt every HTML file anyone attaches), and the escape is visible and reversible
by eye rather than a deletion.

Also public from `@kitn.ai/ui/wire`: `encodableMediaTypes()` and `resolveMediaPolicy(...).decide(...)`,
so a consumer can build their own picker, validation and error copy without using our composer.

**One inconsistency to be aware of, not a bug:** `media-types.ts` describes `decide()` as "the
primitive behind 'expose information, do not make decisions'". #191 put the opposite instruction in
root `CLAUDE.md`: that slogan is deliberately *not* the project's form, because defaults are decisions
and good defaults are most of what a component library is worth, so the slogan gets cited against
sensible defaults. The behaviour is right and matches the how/whether split; the phrasing predates the
ruling. Fix the sentence if you are in the file anyway.

---

## 4. `create-kai` v1: five frameworks are ready, three are not, and why

Read `packages/create-kai/src/frameworks.ts`. It is the single table, and its docblock is the
argument. `readyFrameworks()` is what the prompt offers, and `--list --json` is what a script should
ask.

`status: 'ready'` today: **react, vue, svelte, angular, html** (the `html` row is served by
`examples/starters/vanilla`, so watch the `templateDir` column; patches are keyed by templateDir, and
a lookup written against the id finds none).

`status: 'planned'`: **solid, nextjs, tanstack-start**.

**`ready` means RUN, not built.** The standard, set in #193 and applied in #194 and #196, is
`scripts/smoke.mjs --framework <id> --keep` plus a real browser: a message sent and a reply streaming
into `<kai-thread>`. Vue is why the standard is worded that way; it built green while emitting a
project whose browser tab read `@kitn.ai/ui Vue example` and whose vite.config told the user to run
`nx build ui`.

**All five `ready` rows were verified against published `0.21.0`, from the registry, and that is now
one release behind.** `scripts/build.mjs` reads the kit version out of `packages/ui/package.json` at
build time and pins it as a caret range (`kit pin ^<version>`, defined into the bundle as
`__KIT_VERSION__`), so a `create-kai` built on main today emits `^0.22.0` while every ready verdict
was measured against `0.21.0`. 0.22.0 carries two breaking changes (§2). Re-running
`node scripts/smoke.mjs --framework all` is cheap and is the honest way to keep those flags meaning
what they say.

**The three planned rows are blocked because their starters are not chat apps.** This is the load-
bearing fact and it is not a table edit away:

- `examples/starters/nextjs` and `examples/starters/tanstack-start` are SSR/RSC compatibility demos.
  A Button rendered from a server component, a static `messages` array, a registration probe. No
  composer, no `<kai-thread>` fed by `useKaiChat`, no mock responder, so there is no stream for a
  browser check to observe.
- `examples/starters/solid` is a primitives showcase. It does not use `@kitn.ai/ui/wire` at all; it
  replays a canned part script through the `@kitn.ai/ui/state` folds. So it has no
  `toOpenAIMessages(...)` for the emitted README's go-live diff to quote, `goLiveThread` throws on it,
  and `scripts/build.mjs` stops there if the status is flipped. **That throw is the guard working.**

`scripts/build.mjs` refuses all three today, watched, per #195 and #194.

### The scope decision

**v1 ships at the frameworks that are genuinely chat apps. Writing chat apps for the other three is
its own scoped project, not the tail of this one.**

This is the supervising session's call, recorded here so the next reader inherits the reasoning rather
than the outcome. Converting the Solid starter would destroy the thing it exists to demonstrate;
converting the two SSR starters means writing a thread, composer and mock stream SSR-safely, which is
a feature, not a status flip. Rob has not vetoed it (that is the session's report, not something the
repo can confirm), and it is fully reversible: turning a row on is a status flip plus template
patches, and the table's docblock says exactly that.

Note `packages/create-kai/package.json` is at `0.0.0` and is not in `release-please-config.json`. The
CLI has never been published. "v1" is a scope word here, not a version on npm.

---

## 5. The dominant lesson, and the structural reason it clusters

Every item below is a check whose **green state was structurally independent of what it claimed to
cover**. This is the repo's standing failure mode, and this session produced eight fresh instances in
one day. Each was verified against the tree or the commit that fixed it.

### 5.1 The patch check verified the patches that existed, not the ones that did not (#193)

`verifyPatches` in `packages/create-kai/scripts/build.mjs` walked the patch list and confirmed each
one still matched its template. With no patches for a framework it passed vacuously, printing
`2 patches verified` (React's) while emitting a Vue project carrying our repo's example title and
`nx build ui`. Every remaining starter carried the same two lines, so the same silent pass was queued
up behind svelte, angular and html. Closed by checking the emitted **output** instead of the patch
list (`verifyNoRepoInternals`).

### 5.2 `smoke.mjs` only ever built React (#193, again in #195)

It took `--yes` with no framework flag, so it answered "does React still build" no matter which
framework you had just turned on. `--framework all` now asks the CLI's own `--list --json` which are
ready, so it widens on its own the moment a row flips. #195 then found the second half: smoke ran
`npm run build` and called that a pass, but TanStack Start's build is a bare `vite build` and Vite
strips types with esbuild rather than checking them, so a project with type errors bundles green.
`verify-starters.mjs` already knew this and smoke did not, so the two disagreed about what "builds
clean" meant. `src/starter-scripts.ts` is now that rule, read from the emitted project's own
package.json.

### 5.3 The example-title pattern was fitted to the starters in front of it (#195)

It was `\s+\S+\s+example`: the kit name, one token, then `example`. That is the shape the five Vite
starters happen to use, and it misses both SSR titles
(`@kitn.ai/ui — Next.js App Router example`). A pattern fitted to its examples is the same vacuity
#193 closed one layer up. The replacement spans the whole title and anchors on the space after the kit
name, with three real strings in the tree excluded by that one character. It is still not enough; see
§6 and §5.9.

### 5.4 A `svelte-ignore` comment was space-separated, so it suppressed half of what it named (#198)

```
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
```

In runes mode `extract_svelte_ignore` breaks out of its loop at the first code not followed by a
comma: everything after is read as prose. So the comment silenced only the first rule. **The
diagnosis was pinned by deleting both comments and getting twice the warnings, not by reading the
parser.** Separately, `svelte-check` exits 0 on warnings, which is why `verify:starters` reported the
starter green the entire time it was warning; `--fail-on-warnings` is now on that script.

The warnings themselves were false positives and the kit was not changed. Doing what the linter asks
(`role="button"` on the host) measurably makes it worse: two identically named buttons, the outer at
`tabindex -1`.

### 5.5 `verify:starters` cannot see a specifier that compiles but contradicts the docs (#192)

`examples/starters/solid` imported the kit from the root entry at two sites while `examples/README.md`
documented that as deliberate, and everything else in the project says `@kitn.ai/ui/solid`. A compile
gate cannot tell a specifier that **works** from one that is **correct**, because `./solid` is a
strict superset of `.`. So the starter built clean and the defect survived a build gate. The fix adds
a structural check that runs before any build, derives the Solid starters from each package.json
rather than a directory name, and makes all three vacuity paths hard failures so "found nothing,
therefore green" is unreachable. #180 had already fixed the same defect in the other emitter.

### 5.6 A browser verification drove a leaked dev server from a previous run (#196)

Killing the spawned `npm` orphaned the `vite` child. Vite has no `strictPort` by default, so the html
run's server moved up a port and the browser hit a **leaked Svelte server**. The two starters render
the same design, so the screenshots were pixel-identical, **and the identity read as confirmation**.
Fixed with `--strictPort`, a process-group kill, and a `document.title` assertion binding each run to
its own scaffold.

### 5.7 A CI green matched its commit SHA exactly while describing a tree two merges out of date

Structurally verifiable, and it happened here. Reproduce it:

```
git merge-base <pr-head-sha> origin/main        # what the branch was built on
git rev-list --count --first-parent <that>..<parent-of-the-squash-commit>
```

For #193 that count is two: its head was based at #188 and main had since taken #191 and #192. #194
was one behind. The green was real, it was computed on the right SHA, and it described a tree that no
longer existed. **The merge-readiness question that works is "does the PR head CONTAIN current main",
not "does the green match the head SHA".**

### 5.8 `nx typecheck ui` returned exit 0 over a real TS1015

Reported second-hand: `packages/ui/src/elements/slot-text.ts` held
`options?: { … } = {}`, a real `TS1015`, and the typecheck went green, then kept replaying the stale
failure after the fix until the cache was bypassed. **The event itself was never reproduced.** What is
verified: `slot-text.ts` now reads `options: { … } = {}` and was last touched by #199; `nx.json`
`targetDefaults` has `"typecheck": { "cache": true }`; and `verify:quarantine` heads the `&&` chain so
it is the step that would name it.

#200 landed this as a bullet in root `CLAUDE.md`, wording it as "observed once and not pinned down"
rather than asserting a cache-key mechanism. The greens it says to trust are `npm run typecheck`
inside `packages/ui` and `nx typecheck ui --skip-nx-cache`. Treat it as a verified mechanism with an
unverified occurrence, and note that the stale red only costs time while the cached green over broken
code is the one that ships.

### 5.9 The root cause, from #201 (open at time of writing)

**A guard you cannot invoke in isolation is a guard nobody has watched fail.**

`packages/create-kai/scripts/build.mjs` calls `main()` at module scope (the file ends
`main().catch(...)`), and no test imports it. Verified: the only references to it under
`packages/create-kai/test/` are prose in comments. So **every rule living inside that file was
unreachable except by running the whole build and reading stderr.** This repo's stated discipline is
to watch every check go red before trusting it, and that discipline is physically unenforceable
against a check with no seam to grab. In #201's author's words, that is *how a guard shipped unable to
match the one string it was pointed at*.

Note where the instances above live: 5.1, 5.2, 5.3 and 5.9 are all in that one file. They were not a
run of bad luck. They were concentrated where the discipline could not be applied.

#201 moves the rules into `packages/create-kai/src/template-guards.ts` as exported pure functions
(`repoInternalProblems`, `documentTitles`, `titleProblems`) with `test/template-guards.test.ts`
alongside, and `build.mjs` loads them the way it already loads `frameworks.ts` and `patches.ts`.

**Scope of the generalisation, stated at the size actually measured.** The same shape is common in
`packages/ui/scripts/` and the finding is broader than `create-kai`, but that directory is not in the
same state:

- Of the `.mjs` files there, most export nothing and do their work at module scope. Derive it with
  `ls packages/ui/scripts/*.mjs | wc -l` against `grep -lE '^export ' packages/ui/scripts/*.mjs`.
- Exactly two tests import a script module: `tests/scripts/display-name.test.ts` from `_ts-helpers.mjs`
  and `tests/scripts/storybook-retry-report.test.ts` from `run-storybook-tests.mjs`.
- **But** `packages/ui` has partial answers `create-kai` did not: `tests/scripts/main-module-guards.test.ts`
  extracts every `import.meta.url` / `process.argv[1]` entry-point guard in the repo and evaluates the
  real expressions in a real process on a percent-encoding path, and several verify scripts make their
  own vacuity paths hard failures (`verify-starters.mjs`, `verify-ssr-render.mjs`).

So: the *narrow* claim, that `create-kai`'s build had no seam and its guards were never watched, is
verified. The *broad* claim, that `packages/ui/scripts` shares the shape, is verified structurally but
is partly mitigated there. Do not quote the broad version without the mitigation.

### 5.10 A verifier that reimplements the thing it verifies is checking its own copy (#201, open)

On `5a85826`, `verifyNoRepoInternals` applies patches by hand:

```js
source = source.replace(new RegExp(patch.find.source, patch.find.flags), () => patch.replace('my-app'));
```

instead of calling `applyPatch` from `src/patches.ts`. The hand-rolled copy is blind to the new
`multiple` patch kind #201 introduces, so it would validate a half-patched file no user ever receives.
This is the **duplicated-fact** failure, the same one `packages/ui/src/wire/media-types.ts` exists to
prevent one package over (§3), appearing in a verifier rather than in a feature. #201 passes
`applyPatch` into the renamed `verifyEmittedContent`.

---

## 6. Still open, and what is next

**`gh pr list --state open` is the authority.** One PR was open at `5a85826` (#179 and #200 both
merged while this was being written):

- **#201** `fix(create-kai): rename the Angular project, and grade titles by what they must be`,
  branch `fix/create-kai-patch-machinery`. Two defects earlier rounds found and deliberately left
  because they touch shared files those agents were told not to edit. Both verified against
  `5a85826`:
  - **`examples/starters/angular/angular.json` names the project four times** (the `projects` key,
    `outputPath: "dist/ui-example-angular"`, and both `serve` buildTargets) and nothing rewrites any
    of them, so a scaffolded Angular app builds into a directory named after our example.
    `rewritePackageJson` touches package.json only. The fix needs a `multiple: true` patch kind
    because `verifyPatches` throws on a patch matching more than once; four context-pinned patches
    would each match once and satisfy the unambiguity guard completely while covering a fixed four of
    an unbounded set, which is a fixed-arity encoding of an unbounded fact.
  - **The example-title guard cannot see the Solid starter.** Its title is literally
    `kai-chat — SolidJS Primitives Example`, which contains no `@kitn.ai/ui`, while #195's pattern
    (the `example title` entry in `REPO_INTERNAL`, `scripts/build.mjs`) anchors on the kit name, so it
    cannot match. Two things went stale at once: an element name used as a product name, and a product
    since renamed. #201 replaces the enumerate-wrong-outcomes rule with a right-outcome one, patching
    with an implausible sentinel name and requiring every document title to equal it.

**Next, in the order the session left them:**

1. **The three chat apps.** Writing a real thread + composer + mock stream for `solid`, `nextjs` and
   `tanstack-start`, SSR-safely, and only then flipping their rows. Scoped as its own project (§4).
2. **Lint for silent drops, truncations and swallowed errors. NOW UNBLOCKED.** Carried from the
   previous handoff's board (§6 item 3 there), where it was **deliberately deferred until after
   0.22.0**. 0.22.0 shipped this session (§2), so the gate is gone. **Build it as a lint rule, not a
   one-time sweep**: a rule that fires forever beats an audit that finds five things once. The broad
   "whether vs how" review of every existing prop was **explicitly dropped and should not be
   revived**; apply that test to new props at review time, where it costs nothing. Note the natural
   pairing with §5.9: a lint rule has a seam by construction, which an audit does not.
3. **Re-measure the timeout budget on a genuinely quiet box.** `packages/ui/scripts/measure-timings.mjs`
   exists for exactly this and captures its own conditions. Every figure currently recorded is
   labelled non-idle because the agent sessions are themselves a large fraction of the load.

---

## 7. Operating notes for whoever runs agents next

**Isolated worktrees are not enough. Isolate scratch paths too.** Parallel agents shared one scratchpad
directory and overwrote each other's scripts. Give each agent its own subdirectory under the
scratchpad root and say so in the dispatch, the same way each gets its own worktree.

**Do not copy `node_modules` between trees.** The session reported one agent's `cp -R node_modules`
landing in a sibling's worktree. Neither the collision nor the copy is verifiable from the repo, so
take the rule and not the mechanism: this repo sets `node-linker=hoisted` in `.npmrc`, and a scan of
a worktree's `node_modules` to depth four finds **zero** symlinks, so the described "resolved pnpm
symlinks" cannot be what happened here. Whatever went wrong, `pnpm install` per worktree is the fix,
and it is required anyway (root `CLAUDE.md`: a fresh worktree needs `pnpm install`, then `build:css`,
then a real build, or the unit suite fails in a way that reads like a broken checkout).

**Merge readiness: "does the PR head CONTAIN current main", not "does the green match the head SHA".**
See §5.7 for the reproduction. A green that matches its SHA exactly can still describe a tree that no
longer exists.

**Every guard gets watched failing, and if it cannot be watched, that is the finding.** §5.9. When a
rule lives somewhere with no seam, the fix is to give it one, not to reason harder about whether it
works.

---

## 8. What the commissioning narrative got wrong

Recorded because this repo has been bitten repeatedly by claims that gain authority at each hop and
evidence at none, and a handoff that hides its own corrections teaches the opposite lesson.

1. **"Possibly #200" merged.** At `e6fd55e` it had not; it was open with `test` pending. It merged
   before this document did, as `5a85826`. Both halves of that are worth keeping: the narrative's
   claim was wrong when made and right an hour later, which is exactly why a handoff carries a SHA.
2. **"The previous handoff is `HANDOFF-model-driven-components.md`."** That file is the project-facing
   document and it does open with the staleness argument attributed to it, verified. But the
   *immediately* previous handoff is `HANDOFF-2026-08-12-attachments-and-scope.md`, merged as #189,
   which is where the deferred lint item and the session board actually live.
3. **"The `create-kai` patch machinery PR."** At the time the work started there was no PR: the
   changes were uncommitted in a sibling worktree on a local branch sitting at main's tip. #201 was
   opened while this document was being written. Anything read as "the open PR" for that work should
   be re-checked, not assumed.
4. **The `create-kai` scope decision was described as covering "five frameworks that are chat apps".**
   Correct as to the split, but the fifth ready row is `html`, whose `templateDir` is `vanilla`. Reading
   the ready set off the ids alone will send you to a directory that does not exist.
5. **"One agent's `cp -R node_modules` resolved pnpm symlinks."** Not verifiable, and the mechanism
   does not match this tree: `node-linker=hoisted` means there are no symlinks in `node_modules` to
   resolve (measured, depth four, zero). The operating rule stands; the explanation does not. §7.
6. **The `nx typecheck ui` TS1015 was presented as an observed instance.** The mechanism is verified
   and the TS1015 was real, but #200 itself says the observation arrived second-hand and reproduction
   was not attempted. It belongs in the list with that caveat attached, which is how §5.8 states it.
7. **"PR #179 is deliberately OPEN, publishing is Rob's call."** True at `e6fd55e` and false by the
   time this merged. Rob merged the release PR while the document was being written; the `Release`
   workflow ran and **`@kitn.ai/ui@0.22.0` is now published as `latest`**. The single most consequential
   correction here, because it flips a standing "do not publish" instruction into history and unblocks
   the deferred lint item (§6). It also cost a full re-derivation of §1, §2, §5.8 and §6, which is the
   documented rate of drift arriving on schedule rather than a surprise.

---

## Appendix: style note

`docs/superpowers/` is not consistent on em dashes. `HANDOFF-audio-visualizers.md` uses none;
`HANDOFF-model-driven-components.md` and `HANDOFF-composition-hardening.md` use them heavily. **No
script in this repo enforces prose style on handoffs.** The only mechanical em-dash check,
`packages/ui/tests/scripts/rendered-description-style.test.ts`, covers rendered component descriptions
and nothing else, and `apps/docs/STYLE.md` warns against "an em-dash flourish" without banning the
character. This file follows the zero-em-dash precedent, and the ones that remain are inside verbatim
quotes (commit subjects, the Solid starter's title, code) where changing them would falsify a quote.
