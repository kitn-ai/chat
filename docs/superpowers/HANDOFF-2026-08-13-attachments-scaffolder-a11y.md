# HANDOFF: attachments, the create-kai scaffolder, and a label-vs-visible-text a11y fix

**Verified against `origin/main` at `bce481ebd5e0cc781433053c98387af28d94480a`** (`fix(create-kai):
rename the Angular project, and grade titles by what they must be (#201)`).

That SHA is the whole contract of this document. Everything below was read off that tree, and
`git log --oneline bce481e..origin/main` measures exactly how stale it has become. Nothing here was
carried forward from a summary; the session that commissioned it supplied a narrative, every claim in
that narrative was checked against the repo, and §8 lists the ones that did not survive.

### This document went stale twice while it was being written, and that is the argument for the anchor

Not a caution. A measurement, taken on the file you are reading.

**First draft, anchored at `e6fd55e`:** it said the 0.22.0 release was deliberately held and that
publishing was Rob's call. Within the hour Rob merged it, the `Release` workflow ran, and 0.22.0 was
live on npm. A standing "do not publish" instruction became history while the paragraph containing it
was still being edited.

**Second draft, anchored at `5a85826`:** it described #201 as an open PR, and §5.9 and §5.10 were
*about* that PR. #201 merged and became main's tip. Two of this document's own sections were
describing a proposal that had already shipped.

Both drafts were correct at their anchors and wrong within minutes. That is the whole case: **a
handoff without a SHA is not wrong, it is unfalsifiable**, and a reader cannot tell drift from
disagreement. The previous handoff, `HANDOFF-model-driven-components.md`, opens with the same lesson
learned the same way, reporting that re-deriving it against a newer base moved seventeen figures and
that the rate to plan for is about one figure in three over a single day of merged work. Two documents
in two days. Plan for it.

**Re-derive; do not patch the number somebody tells you about.** When main moved under this file the
second time, the sections were re-read against the tree rather than text-edited, and that caught
something a find-and-replace would have shipped: #201 did **not** fully close the root cause §5.9
names, and the Solid starter's offending title is **unchanged**. See §5.9 and §6.

**This file contains no number a script can produce.** That rule went into root `CLAUDE.md` in #191.
Counts, timings and test totals are not restated here; where a figure matters, the command that prints
it is named instead. Run the command.

---

## 0. Do this first

> **§9 was appended later, verified at `16c14c2`.** Sections 0 through 8 are as written at `bce481e`
> and have not been edited except for pointers like this one. Read §9 for what landed after, and for
> which claims below are now retired.

1. **`git log --oneline --first-parent bce481e..origin/main`** and **`gh pr list --state open`**.
   Nothing from this session was left open. Main moved twice while this was being written.
2. **`@kitn.ai/ui@0.22.0` is PUBLISHED and is `latest`** (§2). Rob merged the release PR mid-session.
   Two breaking changes shipped with it. Anything that was "gated on 0.22.0" is now unblocked (§6).
   *(Still true at `16c14c2`; a 0.22.1 release PR is now open and unmerged. §9.)*
3. **The `create-kai` root cause is only PARTLY closed.** #201 moved the content rules into a tested
   module, but `scripts/build.mjs` still runs `main()` at module scope with no test importing it, and
   four guards still live inside it. Read §5.9 before assuming that finding is retired.
   *(RETIRED at `16c14c2` by #203 and #205, but not in the way this sentence would predict: the
   guards left, `main()` at module scope did not. §9.1.)*

---

## 1. What merged

Derive the list rather than trusting this table:

```
git log --oneline --first-parent 101bfc0..bce481e
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
| #201 | `bce481e` | `fix(create-kai): rename the Angular project, and grade titles by what they must be` |

**The last three rows landed while this document was being written**, which is the failure this whole
file is organised around. All three were described as open in the narrative it was derived from; each
was re-derived against the tree before it merged. See §8.7 and §8.8.

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

**Verify the release from the tarball, not the version number.** `npm pack @kitn.ai/ui@0.22.0` and
read it: the `./wire` entry in the exports map resolves (`./dist/wire.js` plus
`./dist/wire/index.d.ts`), and `encodableMediaTypes`, `resolveMediaPolicy`, `textFileContent` and the
`undetermined` status are all present in the shipped `dist`. A version number on the registry says a
publish ran; the tarball says the feature shipped.

### A release PR can only be merged with `--admin`, and that is expected

**Record this so the next person does not read it as a misconfiguration.** The ruleset
`main: required checks` (id `18328421`) requires exactly one context: **`test`**. The `test` workflow
triggers on `pull_request` to `main`, but a release-please PR never produces a run of it, so the
required context can never be satisfied on that branch and the merge button stays blocked forever.

Verified rather than assumed: `gh pr checks 179` and `gh pr checks 146` (the 0.21.0 release) both
report *no checks reported on the branch*, so this is systemic to release-please PRs here and not a
one-off. `.github/workflows/release-please.yml` runs the action with
`token: ${{ secrets.GITHUB_TOKEN }}`, and GitHub suppresses workflow runs for events raised by that
token, which is the standard cause. The ruleset carries bypass actors (`OrganizationAdmin` and a
repository admin role, both `always`) for exactly this case.

So: **merging a release PR needs `--admin`. That is the designed path, not a workaround.** Everything
else still goes through `test`.

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
list. That function is now `verifyEmittedContent` in `scripts/build.mjs`, renamed from
`verifyNoRepoInternals` by #201 when it grew the title rule (§5.10).

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
#193 closed one layer up. #195's replacement spans the whole title and anchors on the space after the
kit name, with three real strings in the tree excluded by that one character.

**It was still not enough, and #201 fixed it by changing the question rather than the pattern.** See
§5.10. That pattern is still in `REPO_INTERNAL` (now in `src/template-guards.ts`) and unchanged: it
is retained for prose a title rule cannot reach, and is simply no longer load-bearing for titles.

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

### 5.9 The root cause, from #201 (merged as `bce481e`, and only PARTLY closed)

> **Status at `16c14c2`: the finding is closed, this section's stated condition is still true.** #203
> and #205 moved every rule out of `scripts/build.mjs` and added an anti-rot test, so the "four guards
> remain inside it" claim below is now false. `main().catch(...)` at module scope with no test
> importing it is **unchanged**, because the fix was to move the rules out rather than make the file
> reachable. The paragraphs below are left as written at `bce481e`. §9.1.

**A guard you cannot invoke in isolation is a guard nobody has watched fail.**

`packages/create-kai/scripts/build.mjs` calls `main()` at module scope, and no test imports it. So
**every rule living inside that file was unreachable except by running the whole build and reading
stderr.** This repo's stated discipline is to watch every check go red before trusting it, and that
discipline is physically unenforceable against a check with no seam to grab. In #201's author's words,
that is *how a guard shipped unable to match the one string it was pointed at*.

Note where the instances above live: 5.1, 5.2, 5.3 and 5.10 are all in that one file. They were not a
run of bad luck. They were concentrated where the discipline could not be applied.

**What #201 fixed.** The content rules moved into `packages/create-kai/src/template-guards.ts` as
exported pure functions (`repoInternalProblems`, `documentTitles`, `titleProblems`, plus
`REPO_INTERNAL` and `PROBE_NAME`), with `test/template-guards.test.ts` alongside. `build.mjs` loads
them through the same `loadTs()` it already used for `frameworks.ts` and `patches.ts`. `patches.ts`
grew `countMatches` and its own `test/patches.test.ts`. Those rules now have a seam.

**What #201 did not fix, re-derived against `bce481e` rather than assumed.** The file still ends
`main().catch(...)`, and still **no test imports it** (the only mentions under
`packages/create-kai/test/` are prose in comments, including one in `template-guards.test.ts`
explaining why the rules moved out). Four guards remain inside it and remain reachable only by running
the whole build: `verifyPatches`, `verifyAppPath`, `verifyDeclaredPaths` and `verifySharedDevDeps`,
alongside the orchestration in `copyTemplate`, `walk` and `verifyEmittedContent`.

So the shape that produced four of this session's eight instances is **reduced, not removed**. Derive
it yourself before trusting either statement:

```
tail -5 packages/create-kai/scripts/build.mjs
grep -rn "scripts/build" packages/create-kai/test/
grep -n "^async function" packages/create-kai/scripts/build.mjs
```

Anyone continuing this work should finish the move rather than treat the finding as retired. **Do not
read "the guards moved to `template-guards.ts`" as "the root cause is closed"**. That summary was
offered to this document and did not survive checking (§8.8).

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

### 5.10 A verifier that reimplements the thing it verifies is checking its own copy (#201, merged)

Before `bce481e`, `verifyNoRepoInternals` applied patches by hand:

```js
source = source.replace(new RegExp(patch.find.source, patch.find.flags), () => patch.replace('my-app'));
```

instead of calling `applyPatch` from `src/patches.ts`. The hand-rolled copy was blind to the
`multiple` patch kind #201 introduced, so it would have validated a half-patched file no user ever
receives. This is the **duplicated-fact** failure, the same one `packages/ui/src/wire/media-types.ts`
exists to prevent one package over (§3), appearing in a verifier rather than in a feature. The renamed
`verifyEmittedContent` now takes `applyPatch` as a parameter and calls it.

**Two rules that shipped with it, both worth understanding before editing that package:**

`multiple: true` on a patch. `angular.json` names the Angular project at four sites, two of them
embedded in longer values (`dist/ui-example-angular`, `ui-example-angular:build:production`), so the
patch matches the bare name and rewrites every occurrence. The reasoning is the interesting part:
`verifyPatches` throws when a patch matches more than once, so four context-pinned patches would each
match once and **satisfy the unambiguity guard completely** while covering a fixed four of an
unbounded set. Add an `extract-i18n` target and the fifth reference ships green. That is a fixed-arity
encoding of an unbounded fact. The hole is kept narrow: patches that do not opt in are still held to
exactly one match, an opted-in patch matching **zero** times is fatal, and `patches.test.ts` asserts
this is the only patch in the table that opts in.

`titleProblems` grades titles by what they must **be**, not by what they must not be. The build
applies patches with a deliberately implausible sentinel (`PROBE_NAME`) and requires every document
title to equal it. Nothing describing our repo, in any spelling or under any future rename, can
satisfy that, and a template whose title was never patched cannot pass vacuously. The rule has no list
to keep current. Its **known limit is stated in the code**: it reads HTML documents, which covers
every `ready` framework; the two SSR starters set their titles in JS and are both `planned`, and
telling a document title from an object field named `title` needs a parser.

Note the shape of this fix, because it generalises: the old rule enumerated wrong outcomes and each
new starter could invent one it had never seen. The new rule states the required outcome, so the set
it covers is closed by construction.

---

## 6. Still open, and what is next

> **Status at `16c14c2`: item 2 has SHIPPED as #204, and the §5.9 finding below is half retired.**
> The remaining `create-kai` work is item 1, the three chat apps. §9.7 has the corrections; the list
> below is left as written at `bce481e`.

**`gh pr list --state open` is the authority.** Nothing from this session was left open at `bce481e`.
#201 was the last to land, and it closed the two defects earlier rounds had found and deliberately
left because they touch shared files those agents were told not to edit.

**Two things #201 left behind on purpose, re-derived against `bce481e` rather than read off its
description.** Both look like unfinished work and are not:

- **`examples/starters/angular/angular.json` still contains `ui-example-angular` at all four sites**,
  and should. That file is *our* example and is correctly named after it. The fix is a scaffold-time
  patch (`find: /ui-example-angular/`, `multiple: true`, `replace: (name) => name`), so the rename
  happens in the emitted project. Do not "fix" the starter.
- **`examples/starters/solid/index.html` still reads `<title>kai-chat — SolidJS Primitives Example</title>`.**
  #201 touched no file under `examples/`. The defect was never the title; it was that the guard could
  not see it. Now `titleProblems` requires every emitted title to equal the sentinel, so flipping
  Solid to `ready` fails at the title guard, by design, before it reaches `goLiveThread`. That title
  becomes a real edit only when someone writes the Solid chat app.

**The one open finding in that package is §5.9's:** `scripts/build.mjs` still runs `main()` at module
scope with no test importing it, and four guards still live inside it. Finishing that move is the
natural follow-up to #201 and is not tracked by any PR.

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

**Eight claims did not survive checking.** The narrative was substantially right: the merged set and
its numbering, every attachment claim, the framework split and its reasoning, and all eight vacuity
instances held up. What failed clusters in one place, and it is worth naming the pattern rather than
just the items. **Six of the eight are claims about the state of something outside the code** (what
merged, what is open, which file is which, what a version is doing on npm) and only two are about the
code itself. State claims decay in hours; structural claims do not. Weight your trust accordingly, and
when a report mixes them, check the state ones first.

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
8. **"#201's guards moved to `src/template-guards.ts`, which is the root-cause fix."** Half right, and
   the half that is wrong is the half that matters. The content rules did move and are now tested. But
   `scripts/build.mjs` **still** ends `main().catch(...)`, **still** has no test importing it, and
   **still** holds four guards. This one is worth dwelling on: it arrived as a summary of a PR that had
   just merged, from someone who had read the PR, and it was wrong in the direction that would have
   closed a live finding. Re-reading the file took one command. **Had this document been re-anchored by
   find-and-replace instead of re-derived, §5.9 would have shipped announcing that the root cause was
   fixed**: a check-that-proves-nothing claim, inside the document cataloguing them. §5.9.

---

## 9. What landed after `bce481e`

**Verified against `origin/main` at `16c14c2752d88c777a5b5e01b3d50593d7bded41`**
(`fix(agent-tooling): derive the emitted accept from the media-type declaration (#210)`).

**Everything above this section was accurate at `bce481e`, and none of it has been rewritten.** This
section records what landed after that SHA. Where something above is now retired, the section carries
a short status marker pointing here instead of being edited in place, because the anchoring is the
point: a reader who wants to know what was true at `bce481e` can still find out, and a document that
quietly re-writes its own history teaches the failure mode §8 exists to catch.

This section was commissioned from a narrative, like the rest of the file. Every claim in that
narrative was checked against this tree, and §9.8 lists the ones that did not survive. Same rule as
§8: the corrections are recorded, not smoothed over.

Derive the landed set rather than trusting any list:

```
git log --oneline --first-parent bce481e..origin/main
```

**Note what that range does not contain: #209 never merged.** It is the open release-please PR for
0.22.1, and `npm view @kitn.ai/ui dist-tags` still reads `0.22.0`. So everything in this section is on
main and none of it is published, and §2's account of why a release PR can only be merged with
`--admin` applies to it unchanged. A reader working from PR numbers alone will read the gap between
#208 and #210 as a missing merge; it is a held release.

### 9.1 The `create-kai` root cause: closed by relocation, and §5.9's literal condition still holds (#203, #205)

**§5.9 and §6 status: the finding is retired, the sentence stating it is still literally true.** Both
halves matter and the difference between them is the whole content of this entry.

§5.9 names the root cause as two clauses. Re-derive each:

```
tail -5 packages/create-kai/scripts/build.mjs
grep -rn "scripts/build" packages/create-kai/test/
grep -n "^async function" packages/create-kai/scripts/build.mjs
```

- **"`scripts/build.mjs` still runs `main()` at module scope with no test importing it"** is
  **UNCHANGED**, and deliberately so. The file still ends `main().catch(...)`. No test imports it,
  and none can. #203 did not make the file reachable; it accepted that the file is unreachable and
  moved the rules out from under it. One test now *reads* `build.mjs` as text (see below), which is
  why the second grep returns more than it did, but reading is not importing and the distinction is
  the one §5.9 was making.
- **"four guards still live inside it"** is **now FALSE.** The third grep no longer returns a single
  `verify`-shaped name. What remains is `loadTs`, `copyTemplate`, `walk`, `readTemplateFiles` and
  `main`, which is filesystem plumbing rather than rules.

So the honest status is that the shape §5.9 identified is **gone from that file**, and the property
§5.9 used to describe it is **still a property of that file**. Do not report the first without the
second, and do not read the second as the finding still being open.

**#203 moved five, not the four §5.9 counted.** §5.9 listed `verifyPatches`, `verifyAppPath`,
`verifyDeclaredPaths` and `verifySharedDevDeps` as guards and classified `verifyEmittedContent` as
orchestration alongside `copyTemplate` and `walk`. #203 moved that one too. They are now
`patchMatchProblem`, `appPathProblem`, `declaredPathsProblem`, `sharedDevDepsProblem` and
`emittedContentProblem` in `packages/create-kai/src/build-guards.ts`, with
`test/build-guards.test.ts` alongside.

Three shape decisions in that module, all stated in its docblock and worth reading before adding a
sixth rule:

- **The rules return their message instead of throwing it.** The message names the file, states why
  the rule exists and says which table to edit, so it is the thing a test most needs to assert.
  Throwing puts it back where only a build run can read it, which is the defect being removed.
  `build.mjs` throws what they return, so a failing build reads exactly as it did.
- **The filesystem arrives as an argument.** A rule that only runs against a real template tree drags
  a template copy and a bundle step into any test that wants to watch it fail. `build.mjs` passes a
  reader over the copied tree, a test passes one over a literal.
- **`build-guards.ts` cannot import `generate.ts`.** Doing so pulls the catalog and the kit's source
  into the bundle `build.mjs` builds through `loadTs()`. That is why `appPathProblem` takes
  `goLiveThread` as a parameter, and why the two gitignore names live in two files (below).

**The move is held in place by an anti-rot test**, and this is the part that makes the finding stay
closed rather than being closed once. `test/build-guards.test.ts` asserts `build.mjs` declares no
guard-shaped name, in either the `function` or the `const` spelling, and its failure message points
the next author at `src/build-guards.ts`. That test is the one that reads `build.mjs` as text.

**It states its own limit rather than overstating its reach**, which is the same discipline §5.10
records: it reads top-level names, so it catches a guard someone declares and misses one inlined into
a function that already does the reading. Catching that needs a parser.

**#205 closed the two defects #203 found and deliberately left**, and it is two defects rather than
the one its subject's first clause suggests:

- **`GITIGNORE_TEMPLATE_NAME` was declared twice**, exported from `src/generate.ts` and restated as a
  local in `scripts/build.mjs`. **Drift between them is silent and only reachable in the published
  package**: the build writes a template filename `generate()` never renames back, so the scaffolded
  project ships with no working `.gitignore`, and that file is what stops a user's first `git add .`
  staging an API key. `build.mjs` already loaded `generate.ts` through `loadTs()`, so it now reads the
  exported constant. **No guard was added, deliberately**: the second declaration is gone, so a check
  over a fact that now exists once is machinery over nothing.
- **The rule requiring a starter to HAVE a `.gitignore` was inlined in `copyTemplate`**, a function
  whose other job is `cp`. It is now `gitignoreProblem()` in `build-guards.ts`. This is the entry
  #203's anti-rot check had named as the one live instance its regex provably could not see, so the
  blind spot is now real but empty, and the test says exactly that rather than deleting the caveat.

The two names are each declared once: `GITIGNORE_SOURCE_NAME` with the rule that asserts it,
`GITIGNORE_TEMPLATE_NAME` with the `generate()` that renames it back.

### 9.2 `lint-silent-drops`, and why zero matches is a hard failure there (#204)

**§6 item 2 is SHIPPED, not deferred.** See §9.7.

Scope is `packages/ui/src/wire/` only, and the reasoning for that narrowness is the entry's value: it
is the one layer where a quiet decision is **irreversible**. The encoders turn `parts` into a provider
request, so a variant they do not encode is gone once the request leaves the process. A UI component
that renders only `text` parts is fine, because the data is still there.

The rule: a function in `src/wire` that discriminates a `MessagePart` at all must account for every
variant, **with the variant list read from the union in `src/elements/chat-types.ts` rather than
restated**, or declare the drop by name at the site. That derivation is the same one `verify:scaffold`
already uses on the emitted Solid `renderPart`, generalised from the scaffolder's output to the kit's
own encoders.

**The waiver is a parsed directive and not prose BECAUSE PROSE ALREADY FAILED.** This is the entry to
carry forward. The pre-fix encoder already carried a comment saying `card, source and file parts are
never encoded; they are kit-side ... which is why a user turn carrying only an attachment encodes to
nothing`, plus a `default:` clause whose entire body was a comment saying the same thing and a
`break;`. **A guard that honoured comments would have passed, unchanged, the exact source that shipped
the bug.** So the waiver form is:

```
// lint-silent-drops: drops card,source -- reason
```

and it covers **only the variants it spells out**. That is what makes it fire forever rather than
once: adding a seventh member to the union re-fires every waived site, naming only the new variant,
instead of being swallowed by a suppression written before that variant existed. Read the live ones
with `grep -n "lint-silent-drops:" packages/ui/src/wire/encode.ts`; they are intended drops whose
reasons were already written in prose, now converted into an enforced contract with no behaviour
change.

**Validated against the real defect, from git history, not a synthetic case.** Run against `2c0634a`
it exits 1, and every finding names `file` as silently dropped. `2c0634a` is #187, and it is the
**parent of #186** on first-parent order, which is a live instance of §1's warning that PR numbers are
not merge order. The one that matters most is `textOf`: it is the helper that made a user turn encode
to nothing, **it contains no string literal at all**, and it is caught through resolving the local
type-guard predicate in `parts.filter(isTextPart)`.

**It catches one of four historical defects and says so in its own scorecard.** The three it does not
catch were each rejected on evidence rather than omitted: the `url: cond ? work() : undefined` shape
was measured to have a precision low enough that the rule would be blanket-suppressed, and **a
disabled rule is worse than none because it leaves everyone believing the class is covered**; the
`content ?? ''` shape lives inside template-literal route snippets a TS AST over the host file cannot
see, where `verify:scaffold`'s route-compile gate is already the right instrument; and a missing
`.gitignore` is an *absence*, with no text to match, so a source linter is the wrong instrument
entirely. That last one was then fixed properly by #205 (§9.1).

**A zero-match run is a HARD FAILURE**, and there are three distinct tripwires rather than one,
because there are three ways for the scan to become vacuous: parsing zero variants out of the union
(`would pass everything`), walking zero non-test wire files (`matched nothing, which is a broken scan,
not a clean tree`), and finding zero functions that discriminate a `MessagePart` at all. A waiver
naming a variant that is not in the union, or carrying a reason too short to be a reason, is also
fatal.

Run it in isolation with no build: `node packages/ui/scripts/lint-silent-drops.mjs`, plus
`--package-root <dir>` to point it at a historical checkout and `--self-test` to watch it detect. The
CI wiring is `pnpm --filter @kitn.ai/ui run lint:silent-drops` in the required `test` job, and the npm
script runs the self-test half first. `tests/scripts/silent-drop-guard-wiring.test.ts` guards that
wiring by running the linter against synthesized trees and requiring a non-zero exit, rather than
trusting the script's self-report.

### 9.3 Object URLs on attachment `url`, and the opposite zero-match rule (#206, #207)

Three live instances of the pattern #186 removed from the kit, in the three places a consumer is most
likely to copy from:

- **A Storybook story** (#206), the "With File Attachments" story in
  `packages/ui/src/stories/prompt-input-variants.stories.tsx`, which staged an object URL for images
  and no `url` at all for anything else. Both halves are unencodable. The story is explicitly teaching
  manual wiring, so it was teaching the defect, and its hand-written "Show code" panel, which is the
  surface readers actually copy, omitted the attach wiring entirely.
- **A live docs demo** (#207), `apps/docs/src/components/AttachmentsFlowDemo.tsx`.
- **Published MDX whose comment RECOMMENDED it** (#207),
  `apps/docs/src/content/docs/patterns/attachments-flow.mdx`, carrying
  `create an object URL if you want an image preview in the hover card`. This is the worst of the
  three: the docs were recommending a pattern the library already rejects, since `toOpenAIMessages`
  and `toAnthropicMessages` refuse a `blob:` URL with a written reason.

All now follow `readAsDataUrl` in `src/elements/default-input.tsx`: a `data:` URI for **every** file
rather than only images, snapshotting the file list before the first await because the upload element
is free to clear it as soon as the handler yields, and re-reading `attachments` after the await so a
second drop landing mid-read is appended to rather than overwritten.

**A fourth instance turned up that the guard cannot reach, and #207 says so rather than implying
coverage.** The `AttachmentData` props table described `url` as `Object URL or CDN URL — enables image
previews in the hover card`: the anti-pattern named first, and the field framed as a preview hint
rather than as the thing the wire encodes. No AST rule can reach a table cell. **The guard did not
find it and would not have**, prose stays a review problem, and the script itself states this.

#### The contrast with §9.2, which must not be collapsed

**These are two different kinds of check, and conflating them breaks one of them.**

| | `lint-silent-drops` | `lint-attachment-object-urls` |
|---|---|---|
| scans for | dispatch sites it **knows exist** | a pattern that **should not exist** |
| zero findings | **FATAL.** Zero means the scan broke | **PASS.** Zero is the healthy steady state |
| vacuity tripwire | zero variants parsed, zero files, zero discriminating functions | **zero FILES walked**, plus `--self-test` |

Copying the zero-match-fails behaviour across to the reintroduction guard would make it fail on the
clean tree it was written to protect. Copying the zero-match-passes behaviour back to
`lint-silent-drops` would make a broken scan indistinguishable from a clean encoder. The script's own
header records this reasoning; do not "harmonise" the two.

Detection is structural, on a real TS parse, and reaches markdown fences and script blocks as well as
source. It is anchored on the one wrong function feeding the one field, a `url` property or `.url`
member whose value comes from `createObjectURL`, rather than on the ternary shape `lint-silent-drops`
records as considered and rejected. Minting an object URL to render bytes in-tab, which
`components/image.tsx` and `components/voice-output.tsx` legitimately do, binds a variable rather than
a `url` property and is never matched.

**The `--self-test` earned its keep during development**, and the story is the argument for writing
one: a first cut worked on blanked text and regex windows, and on `.tsx` an apostrophe in JSX prose
opened a string literal that blanked a real defect out of the input and **reported the tree clean**.
Three of its cases pin that failure dead.

CI wiring is `pnpm --filter @kitn.ai/ui run lint:attachment-object-urls` in the required `test` job.
Note that it excludes `apps/docs/public/kitn/`, a gitignored copy of built kit output, because
including it made the walked-file count depend on whether a build had run.

**A chain worth noticing:** #204's own writeup recorded, as a side finding it was not fixing, that the
defective idiom survived in the prompt-input story. #206 then closed it. A guard that reports what it
is not covering is how the next PR knows what to do.

### 9.4 A docstring that described the URL its function had stopped emitting (#208)

`fileToAttachmentLines` in `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` emits
`FileReader.readAsDataURL` and stages a `data:` URI. Its docstring said the opposite **and recommended
it**: `The object URL is what makes an image preview a real thumbnail rather than a generic icon; it
is deliberately not revoked here, and the comment says why rather than leaving a silent leak.` Both
halves were false. There is no object URL, so there is nothing
to revoke, and the sentence taught a reader that the anti-pattern was a considered choice rather than
the thing #186 removed.

**`git log -L` dates the two ranges exactly, and that is the technique to reuse.** The function body
was last written by #186 (`ad8de3b`); the docstring has not been touched since #185 (`476a16b`)
introduced it, when it was still true. Re-derive it by running `git log -L <range>:<file>` over each
range at `0a7f4b3^`. The body at that parent already carried an emitted comment reading
`A data: URI, NOT URL.createObjectURL`, directly under a docstring recommending the object URL, which
is the shape to look for: **the code was corrected and the prose above it was not.**

The replacement names no media type, on the same rule #190 settled for the emitted note:
`encodableMediaTypes()` is the set, and a docstring is a worse place for a second copy of it than the
note is, not a better one. #210 is the same rule applied to the attribute (§9.5).

This is the second time in that one file that code moved and its prose did not. Treat a comment above
a recently rewritten function as unverified until read.

### 9.5 The scaffolder steered users away from the types #190 made encodable (#210)

The emitters in `mcp/tools/scaffold.ts` hardcoded `accept="image/*,application/pdf"`, one per
framework target. **That was correct when images and PDFs were the whole capability set, and stopped
being correct at #190**, which made `text/*`, `application/json`, `application/xml` and two YAML
spellings encodable and published `encodableMediaTypes()` precisely so that nothing would have to
restate the set. `ATTACHMENT_WIRE_NOTE`, three lines above, already told the reader "this list moves,
read `encodableMediaTypes()`", over an attribute that had stopped moving.

**The list did not go wrong in this repo. It went wrong in every app scaffolded from it**, which is
the worst possible place for a copy of a moving fact to live, because nothing there can ever check it.
All emitters now interpolate `ATTACHMENT_ACCEPT`, which reads `encodableMediaTypes()` from
`wire/media-types.ts`, so the emitted attribute moves on its own the next time the declaration does.

**Scope, stated so nobody over-reads the fix:** `accept` reaches the native `<input accept>` and
nothing else. The OS dialog always offers an "All Files" escape, and `accept` does not apply to
drag-and-drop at all, since `components/file-upload.tsx` hands `dataTransfer.files` straight to
`onFilesAdded` with no filtering. So the defect was a scaffolded picker **steering users away from**
file types the kit can now send, not blocking them. A scaffolded app that wants a filter that *holds*
calls `resolveMediaPolicy().decide()` on what it staged, and the emitted note points at it.

#### The guard has two halves, and the second is the interesting one

Both live in `scaffold.test.ts`, next to the block that already forbids media types in the emitted
note. Same rule, other half: the note must not *name* media types, the attribute must *derive* them.
They fail at different times.

- **The output check** requires every `Framework.options` entry, derived rather than hand-listed, to
  emit `encodableMediaTypes().join(',')` verbatim, with an anti-vacuity check that each emitted at
  least one `accept=`. It catches an attribute that disagrees with the declaration **today**.
- **The source check** forbids any `accept="<media types>"` literal in `scaffold.ts` at all. It
  catches a literal that **AGREES with the declaration today**, which the output check cannot see
  until `ENCODABLE` next changes, one release too late.

That second half was watched failing in the only way that proves it: hardcoding the
**currently-correct** full set turned every output assertion **green** and reddened only the source
check. **A literal that is correct today is the defect.** It stops moving when the capability set
does, in code that ships to a user repo where nothing checks it.

This generalises past `accept`, and it is the sharpest statement of the duplicated-fact rule this
document has: correctness at the moment of writing is not evidence about a copied fact. Only the
derivation is.

### 9.6 The `accept` fix that was nearly shipped instead, and why omission is not the safe default

Recorded as a correction, and it is the supervising session's own (§9.8 item 6). **The proposed fix
was to emit no `accept` at all**, on the reasoning that an absent filter means the full capability
set. Verify the two halves before reusing either:

**True of `resolveMediaPolicy`.** With `accept === undefined` it pushes every `ENCODABLE` capability
into the effective set, so the resolver's answer for an absent filter really is the whole capability
set. Read the top of `resolveMediaPolicy` in `packages/ui/src/wire/media-types.ts`.

**Irrelevant on the tags the scaffolder emits.** `<kai-file-upload>` in
`packages/ui/src/elements/file-upload.tsx` passes `accept` straight to the Solid `<FileUpload>` in
`packages/ui/src/components/file-upload.tsx`, which passes it straight to `<input type="file">`.
Neither file imports `resolveMediaPolicy` or filters anything, and the drop path hands
`dataTransfer.files` to `onFilesAdded` untouched. So on these tags an absent attribute is not the
capability set, **it is WIDER than the capability set**: the dialog offers a `.zip`, the emitted
`toAttachment` stages it, and the encoder throws on a file the picker itself volunteered, **in a
starter with no `onAttachmentsRejected` path**, so it lands as an unhandled throw.

Omission is a third behaviour matching neither layer. Deriving is the only form that tracks the
declaration. The cost is a long attribute, which is real noise in a starter, but it is honest noise.

**One refinement on that reasoning, since the contrast is easy to overstate.** `<kai-chat>` does
resolve the policy in `elements/default-input.tsx`, but only when `accept` is **set**: with it absent
the composer also does no filtering, and the code says why (`No accept means no filtering, which is
what every existing consumer gets today. Opting in is what turns the picker into a guarantee`). So the
real distinction is not "`<kai-chat>` filters and `<kai-file-upload>` does not". It is that **setting
`accept` on `<kai-chat>` buys a JS filter that holds, while setting it on `<kai-file-upload>` buys
only a picker hint.** That strengthens the case for deriving rather than omitting; it does not weaken
it.

#### A rejected follow-up, recorded so nobody revives it

**Defaulting `<kai-file-upload accept>` to the capability set.** #190 considered exactly this question
for the composer and shipped the other way. Its own words, from the PR body, under a heading reading
**"Decisions left open for Rob"**:

> **Should the composer default to the kit's capability set when `accept` is absent?** Shipped: **no
> filter** — back-compat, zero behaviour change. Defaulting it on would structurally close the #186
> class, at the cost of blocking attachments a consumer stages for their own non-model purpose.

Two things to carry accurately rather than the gist. **The reasoning is exactly as summarised**: it
would block attachments a consumer stages for non-model purposes. But **#190 did not "decide against"
it**; it shipped the back-compatible behaviour and listed the question as open for Rob, alongside the
text-file wrapper form and the list-vs-predicate call. And it was asked about `<kai-chat accept>`, a
different element from `<kai-file-upload accept>`. The reasoning transfers. The status does not, and
"#190 rejected this" would be the kind of hardened relay §8 is about.

### 9.7 §6 corrections

**Item 2, "Lint for silent drops, truncations and swallowed errors. NOW UNBLOCKED", is SHIPPED**, as
#204. §9.2. It was built the way that item specified, as a lint rule rather than a one-time sweep, and
the pairing that item predicted held: the rule has a seam by construction, is invokable with no build,
and is wired into the required job. The broad "whether vs how" review of every existing prop remains
**explicitly dropped and should not be revived**.

**Item 1, the three chat apps, is the remaining `create-kai` work and is unchanged.**
`packages/create-kai/src/frameworks.ts` still carries `solid`, `nextjs` and `tanstack-start` as
`status: 'planned'`, for the reasons §4 gives, which are unaffected by anything in this section.

**Item 3, re-measuring the timeout budget, is unchanged.**

**The two things §6 records as deliberately left behind by #201 are both still true**, and both still
should be: `examples/starters/angular/angular.json` still names the Angular project after our example,
and `examples/starters/solid/index.html` still carries its own title. Neither is a defect. Do not
"fix" either.

**"The one open finding in that package is §5.9's" is half retired.** See §9.1: the four guards are
out, the module-scope `main()` is not, and #203 chose the first as the fix rather than the second.

### 9.8 What this section's commissioning narrative got wrong

Same discipline as §8, and the same shape of result: the narrative was substantially right, and what
failed was mostly the *status* of things rather than the *structure* of them.

1. **"#203 completes the root cause §5.9 records as half-fixed."** The finding is closed and the
   sentence stating it is not. `build.mjs` still ends `main().catch(...)` and still has no test
   importing it; what changed is that no rule lives there any more. Reporting "the root cause is
   closed" without that distinction is the same over-claim §8.8 catches one PR earlier, in the
   opposite direction.
2. **"the four guards still inside `build.mjs`."** #203 moved five. §5.9 had counted
   `verifyEmittedContent` as orchestration rather than as a guard; #203 moved it with the rest.
3. **#205 described as the `GITIGNORE_TEMPLATE_NAME` de-duplication.** It was two defects. It also
   extracted the "a starter must have a `.gitignore`" rule out of `copyTemplate`, which is what
   emptied the blind spot #203's anti-rot check had named as its one live instance. Its subject says
   both: "one declaration **and a seam**".
4. **"#206, #207" treated as one change covering three sites.** #206 is the Storybook story alone.
   #207 is the docs demo, the published MDX, and the lint. #207 also found a fourth instance, the
   props-table prose, and states that its own guard did not find it and would not.
5. **The zero-match contrast stated as one tripwire each.** `lint-silent-drops` has three distinct
   vacuity failures, not one. The contrast with the reintroduction guard is exactly as the narrative
   framed it and is stated in §9.3.
6. **The `accept` correction understated one half.** "`<kai-file-upload>` never resolves a policy" is
   verified. But `<kai-chat>` does not filter either when `accept` is absent, so the distinction is
   about what *setting* the prop buys on each tag, not about which tag filters. §9.6.
7. **"#190 considered exactly that and decided against it."** The reasoning is verbatim correct. The
   status is not: #190 shipped the back-compatible behaviour and filed the question under "Decisions
   left open for Rob". §9.6.
8. **The gap at #209 read as a merged PR.** It is the open release-please PR for 0.22.1. Nothing in
   this section is published; `npm view @kitn.ai/ui dist-tags` still reads 0.22.0.

Note the split, because it is the same one §8 measured: **six of these eight are status claims, and
two are about the code.** The structural claims in the narrative held up almost entirely. The claims
about what a PR *did*, what a decision *was*, and what shipped are the ones that needed checking.
That ratio has now held across two consecutive handoffs. Check the status claims first.

---

## Appendix: style note

`docs/superpowers/` is not consistent on em dashes. `HANDOFF-audio-visualizers.md` uses none;
`HANDOFF-model-driven-components.md` and `HANDOFF-composition-hardening.md` use them heavily. **No
script in this repo enforces prose style on handoffs.** The only mechanical em-dash check,
`packages/ui/tests/scripts/rendered-description-style.test.ts`, covers rendered component descriptions
and nothing else, and `apps/docs/STYLE.md` warns against "an em-dash flourish" without banning the
character. This file follows the zero-em-dash precedent, and the ones that remain are inside verbatim
quotes (commit subjects, the Solid starter's title, code) where changing them would falsify a quote.
