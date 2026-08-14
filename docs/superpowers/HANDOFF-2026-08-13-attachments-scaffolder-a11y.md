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
>
> **§10 (`67365c8`), §11 (`12a51da`) and §12 (`6afe8a0`) were appended the same way.** Read §11
> before §4 or §6: `create-kai` now runs every framework in its table, so §4's ready/planned split,
> and the scope decision built on it, are history rather than current state.
>
> **§12 IS THE NEWEST ANCHOR. Start there, and derive your range from `6afe8a0`, not from any
> SHA a summary hands you.** The brief that commissioned §12 named §9's anchor as the newest and
> was ten commits out of date; §12's opening paragraph is that correction. §12 also carries the
> one factual retraction in this file that has a live consumer consequence: #227's claim that a
> `vercel-ai-sdk` defect broke "every turn of every scaffolded app" is FALSE, and §12.5 refutes it
> from the types. Do not repeat it.

1. **`git log --oneline --first-parent bce481e..origin/main`** and **`gh pr list --state open`**.
   Nothing from this session was left open. Main moved twice while this was being written.
   *(At `6afe8a0` two PRs ARE open and both matter: #228, the 0.23.0 release carrying the #227 fix,
   and #231, the coverage diagnostic whose report is not on main. §12.2 and §12.7.)*
2. **`@kitn.ai/ui@0.22.0` is PUBLISHED and is `latest`** (§2). Rob merged the release PR mid-session.
   Two breaking changes shipped with it. Anything that was "gated on 0.22.0" is now unblocked (§6).
   *(Still true at `16c14c2`; a 0.22.1 release PR is now open and unmerged. §9.)*
3. **The `create-kai` root cause is only PARTLY closed.** #201 moved the content rules into a tested
   module, but `scripts/build.mjs` still runs `main()` at module scope with no test importing it, and
   four guards still live inside it. Read §5.9 before assuming that finding is retired.
   *(RETIRED at `16c14c2` by #203 and #205, but not in the way this sentence would predict: the
   guards left, `main()` at module scope did not. §9.1. At `67365c8` the surviving clause is retired
   as a finding too, and #212 corrected two of §9.1's own claims about the check that replaced it.
   §10.1.)*

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

> **SUPERSEDED at `12a51da`.** Every row in `packages/create-kai/src/frameworks.ts` is now `ready`,
> including the three this section explains cannot be. #216, #217 and #220 wrote the chat apps this
> section says would have to be written, and the scope decision below is history rather than a
> standing call. **§11.1.** The section is left as written at `bce481e`, because the reasoning is
> still why the work took the shape it did, and because the **heading is the worked example**: a row
> count, in a heading, in a file that opens by declaring it holds no number a script can produce.
> `grep -c "status: 'ready'"` produces it, and it rotted.

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
  *(FALSE at `12a51da`. Both are hand-composed chat workspaces now: #216 for tanstack-start, #220 for
  nextjs. Each kept its SSR proof by strengthening the demonstration rather than by keeping the demo
  on a second route, and the registration probe survives in both as `HydrationBadge`. §11.1.)*
- `examples/starters/solid` is a primitives showcase. It does not use `@kitn.ai/ui/wire` at all; it
  replays a canned part script through the `@kitn.ai/ui/state` folds. So it has no
  `toOpenAIMessages(...)` for the emitted README's go-live diff to quote, `goLiveThread` throws on it,
  and `scripts/build.mjs` stops there if the status is flipped. **That throw is the guard working.**
  *(FALSE at `12a51da` by #217, and the throw is retired the right way: the starter gained the call
  the guard was asking for rather than the guard being routed around. §11.1.)*

`scripts/build.mjs` refuses all three today, watched, per #195 and #194.
*(No longer refuses any of them, and the rule that does the refusing is now `appPathProblem` rather
than `verifyAppPath`; the name in §5.9's list changed with the move #203 made. §11.1.)*

### The scope decision

> **SPENT at `12a51da`, by being carried out rather than reversed.** The scoped project this decision
> defers to is #216, #217 and #220. What is worth keeping is the shape of the call, not the outcome:
> it named the work as a feature rather than a status flip, and that is exactly what it cost. §11.1.

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
>
> **Further, at `67365c8`: that remaining clause is RETIRED as a finding.** It is still literally
> true and it is no longer a defect, so anyone who greps it out of the paragraphs below and re-opens
> it will be doing work that makes the codebase worse. §10.1 carries the reasoning, which is the part
> that has to travel with the status.

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
*(CLOSED at `12a51da`. #219 gave `documentTitles` the parser, and the docblock now opens with*
`READS JS-DECLARED TITLES TOO, which is what the note here used to hand to "whoever makes an SSR row ready"`*.
A narrower limit is stated in its place. Note that the limit was handed forward and then collected by
the person it was handed to, which is the outcome a stated limit is for. §11.4.)*

Note the shape of this fix, because it generalises: the old rule enumerated wrong outcomes and each
new starter could invent one it had never seen. The new rule states the required outcome, so the set
it covers is closed by construction.

---

## 6. Still open, and what is next

> **Status at `16c14c2`: item 2 has SHIPPED as #204, and the §5.9 finding below is half retired.**
> The remaining `create-kai` work is item 1, the three chat apps. §9.7 has the corrections; the list
> below is left as written at `bce481e`.
>
> **Status at `12a51da`: item 1 is SHIPPED too, so nothing on this list is `create-kai` work any
> more.** Item 3 is the only one still open. §11.6 has the corrections, including one bullet below
> whose prediction came true and therefore stopped being true.
>
> **Status at `6afe8a0`: item 3 is still the only one open**, and it has now been carried across
> three anchors untouched, which is itself worth noticing before carrying it a fourth time. The
> current next list is §12.8, and nothing on it is on this one.

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
  *(FALSE at `12a51da` as a statement about the tree, and TRUE as a prediction. Someone wrote the
  Solid chat app: #217 retitled the file and gave it the scaffold-time patch every other starter has,
  and `titleProblems` caught it on the first build with the status flipped, exactly as this bullet
  said it would. The old string survives only as `HISTORICAL_SOLID_TITLE` in
  `test/template-guards.test.ts`, because fixing the starter removed the tree's only specimen for
  "a title no name-anchored pattern can see". §11.6.)*

**The one open finding in that package is §5.9's:** `scripts/build.mjs` still runs `main()` at module
scope with no test importing it, and four guards still live inside it. Finishing that move is the
natural follow-up to #201 and is not tracked by any PR.

**Next, in the order the session left them:**

1. **The three chat apps.** Writing a real thread + composer + mock stream for `solid`, `nextjs` and
   `tanstack-start`, SSR-safely, and only then flipping their rows. Scoped as its own project (§4).
   *(SHIPPED at `12a51da`. Merge order was `tanstack-start` (#216), `solid` (#217), `nextjs` (#220),
   which is neither this list's order nor its reverse. The per-framework SEQUENCE this item
   prescribes, starter first and status flip last, is what each of the three actually followed.
   §11.1.)*
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

> **CORRECTED at `67365c8` by #212. Two claims in this entry did not survive checking.** "the blind
> spot is now real but empty" was wrong when it was written: parsing `build.mjs` rather than grepping
> it found rules still living there. And "it reads top-level names" understates the hole, because the
> names it read were not the naming convention this repo uses for a rule. The entry is left as
> written at `16c14c2`; §10.1 has both corrections and the evidence.

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
*(Wrong at `67365c8`, and wrong in the direction this document is about: the limit it stated was not
the limit it had. §10.1.)*

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
  *("real but empty" was FALSE when written; #212 parsed the file and found rules still in it. §10.1.)*

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
*(FALSE at `12a51da`: no row carries `status: 'planned'`. §11.1.)*

**Item 3, re-measuring the timeout budget, is unchanged.**
*(Still unchanged at `12a51da`, and now the only item on §6's list that is.)*

**The two things §6 records as deliberately left behind by #201 are both still true**, and both still
should be: `examples/starters/angular/angular.json` still names the Angular project after our example,
and `examples/starters/solid/index.html` still carries its own title. Neither is a defect. Do not
"fix" either.
*(HALF TRUE at `12a51da`. The angular.json half holds unchanged, all four sites. The Solid half does
not: #217 retitled the file. Note that "still carries its own title" survives as a sentence while
being wrong about the string, which is why §6's version quotes the title and this one does not.
Quoting is what makes a claim falsifiable by grep. §11.6.)*

**"The one open finding in that package is §5.9's" is half retired.** See §9.1: the four guards are
out, the module-scope `main()` is not, and #203 chose the first as the fix rather than the second.
*(Fully retired at `67365c8`: the module-scope `main()` is not a defect on its own, and #212 states
why in a form that should stop it being re-opened. §10.1.)*

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
   both: "one declaration **and a seam**". *(The "emptied" half is wrong at `67365c8`: it took one
   rule out of `copyTemplate` and left another one in. §10.1.)*
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

## 10. What landed after `16c14c2`

**Verified against `origin/main` at `67365c8b21ff1cf01485ef5f93af4318e6dbe635`** (`fix: clear a batch
of small open items (5 of 5 were still live) (#213)`).

Same rule as §9. Nothing above this section is rewritten; where a claim above is now wrong it carries
a marker pointing here, so a reader who wants to know what was believed at `16c14c2` can still find
out. Derive the landed set rather than trusting this heading:

```
git log --oneline --first-parent 16c14c2..origin/main
```

Three things are in that range, and only the first belongs to this document.

- **#212 is §10.1.** It corrects two claims §9.1 made, and retires §5.9's surviving clause.
- **#209 MERGED.** §9 says "Note what that range does not contain: #209 never merged", which was
  true at `16c14c2` and is not now. The held release PR it names went in. Whether the publish
  followed is a separate fact from the merge, and both are derivable rather than restatable here:
  `.release-please-manifest.json` on main gives the version the repo believes it is at, and
  `npm view @kitn.ai/ui dist-tags` gives what is actually on npm. Run both; §2 names the same two
  facts for the previous release and keeps them apart for the same reason.
- **#213 belongs to the other handoff.** It clears the small items in
  `HANDOFF-model-driven-components.md` §1.4, and the corrections for those are recorded in that
  document, in that section, not here.

### 10.1 §9.1 overstated the anti-rot check twice, and §5.9's second clause is retired (#212)

**§9.1's "the blind spot is now real but empty" was wrong at `16c14c2`.** It was not empty. Parsing
`scripts/build.mjs` rather than grepping it found two rules still living there:

- `create-kai build: no framework is marked ready`, inlined in `main()` and **carrying no name at
  all**. Invisible twice over: nested, and with no declaration for a name-based check to match.
- `create-kai build: no starter at ${from}`, inlined in `copyTemplate` beside the `cp` it explains.
  That is the same function #205 pulled the `.gitignore` rule out of, which is worth noticing on its
  own: a rule was extracted from that function by hand while another rule sat in it, unseen by the
  check written in the same round.

Both are now `readyFrameworksProblem` and `missingStarterProblem` in `src/build-guards.ts`, with
their messages byte-identical, so a failing build prints exactly what it printed before.

**§9.1's "it reads top-level names" understates the hole, and the understated half is the serious
one.** The regex was `/^(?:(?:async\s+)?function|const)\s+((?:verify|check|assert|guard)\w*)/gm`.
The disclosed limit was the `^`, which cannot match an indented declaration. The undisclosed limit
was the alternation. **Every rule in `src/build-guards.ts` is named `*Problem`**, `patchMatchProblem`
and `gitignoreProblem` and `sharedDevDepsProblem`, and not one of those four prefixes is that
convention. So the naming a next author would copy off the neighbouring code was precisely the
naming the check could not see, at the **top level, inside its own stated reach**. A planted
top-level `*Problem` function left the suite green. The check now parses the file and asks two
questions: is there a guard-shaped function at any depth, by both conventions, and does the file
write a message of its own. The second is the only one of the two that can see a rule with no name.

**§5.9's second clause is RETIRED, and the reasoning has to travel with the status**, because
"`main()` at module scope with no test importing it" is still literally true and will keep reading
like an open finding to anyone who greps it out of §5.9. It is not one. The defect §5.9 diagnosed
was never module scope; it was **rules living where nothing can watch them**, and #203 and #205
moved every rule out. `export main` plus an entry-point guard was considered by #203's author and
rejected, and that argument holds at this SHA: no test would import it, so the export buys no
coverage it does not already have, and it re-legitimises `build.mjs` as a place to put a rule, which
is the one thing the move existed to stop. An unimportable IO orchestrator is the correct shape of
that file now. Do not finish the move; there is nothing left to move.

**One more thing about this guard, stated plainly because it is this document's own subject
appearing inside this document.** It was described three times by three authors who had each just
improved it, and each description overstated what had been checked: #203 disclosed the nesting hole
and not the naming one, #205 reported the blind spot emptied, and §9.1 relayed both as verified. The
check written to enforce "watch it fail before trusting it" was itself the thing nobody watched
fail.

---

## 11. What landed after `67365c8`: `create-kai` reached every framework in its table

**Verified against `origin/main` at `12a51dad8534d505a7a8f12ea80b55d2ee1ea54d`**
(`feat(create-kai): make the Next.js starter a composed chat app, and turn the last row on (#220)`).

Same rule as §9 and §10. Nothing above is rewritten; where a claim above is now wrong it carries a
marker pointing here, so a reader who wants to know what was believed at `67365c8` can still find
out. Derive the landed set rather than trusting this heading:

```
git log --oneline --first-parent 67365c8..origin/main
```

**#214 is absent from that range and did not vanish.** It is the open release-please PR for 0.22.2,
the third consecutive section that has had to say this about a gap in the numbering (§9 for #209 open,
§10 for #209 merged). The pattern is now reliable enough to expect: a missing number in this repo is
usually a held release, not a lost merge. `.release-please-manifest.json` on main gives the version
the repo believes it is at and `npm view @kitn.ai/ui dist-tags` gives what is on npm; they are
different facts, and §2 explains why the merge needs `--admin`.

This section was commissioned from a narrative, like §9. Every claim in it was checked against this
tree, and §11.10 lists the ones that did not survive. The ratio held for the third time: the
structural claims were right, and what failed was **attribution** rather than status this round, which
is a new variant worth watching.

### 11.1 §4 is superseded: the queue is empty (#216, #217, #220)

> **Still true at `6afe8a0`, and now the smaller half of the story.** The FRAMEWORK queue is empty.
> The (gateway, framework) CELL grid is mostly empty in the other direction: #225 wired the first
> real gateway, and only `react` and `nextjs` declare a route host, so six of these eight ready rows
> cannot be scaffolded against a real provider at all. `create-kai` is also still at version `0.0.0`,
> is absent from `release-please-config.json`, and 404s on npm. "Complete" needs both qualifiers.
> §12.4 and §12.2.

**Every row in `packages/create-kai/src/frameworks.ts` now carries `status: 'ready'` and
`composedWorkspace: true`.** #216 rewrote `tanstack-start`, #217 rewrote `solid`, #220 rewrote
`nextjs`, and each flipped its own row last. §4's split, and the scope decision built on it, are
history.

**This file states no count for that**, and the omission is the point rather than pedantry. §4 put a
row count in a heading, root `CLAUDE.md` forbids exactly that (`Element/cell/route/test/row counts,
timings and versions rot the moment the gate moves`), and it rotted inside a week. The roster lives in
the table and at runtime in `create-kai --list --json`, and `packages/create-kai/README.md` already
carries the tombstone for the last place that restated it: *"This paragraph used to name which
frameworks were ready, and it was wrong within a day of each one landing [...]"* Ask the CLI.

The table's docblock is the thing to read, not this paragraph. It records the same lesson twice more:
that the roster is the `composedWorkspace` column and not prose, and that

> THE QUEUE IS EMPTY as of the Next.js flip [...] That is a statement about today, not a rule [...]
> `planned`, `note` and `composedWorkspace: false` are still live machinery for the NEXT framework
> someone adds.

**All three followed the sequence §6 item 1 prescribed**: write the starter, then flip. Solid is the
clean worked example, and #217 states the part that matters for the guards. `goLiveThread` threw on
the old Solid starter, §4 called that throw "the guard working", and it was: the throw went away
because the starter gained the `toOpenAIMessages(...)` call the guard was asking for, not because
anyone routed around it. A guard that stops complaining when the code becomes correct is the outcome;
a guard that gets an exemption is not.

Two shape decisions carried across all three, both worth knowing before touching a starter:

- **The SSR demos were replaced, not kept on a second route.** A thread that hydrates and then
  *streams* proves more than a static `messages` array proves once at mount, and `create-kai` copies
  the whole starter into every scaffolded project, so a second demo route would be dead code in each
  one. Note this is a **rejected alternative**, not a deletion: neither starter ever had a second
  route.
- **The registration probe survives as `HydrationBadge`** in both SSR starters, carrying the same
  `data-testid="registration-status"` the old inline probe used. It reads `data-state="server"` in the
  prerendered HTML and flips once client JS has defined the elements. The reason it earns its place is
  stated in its own docblock: hydration failure otherwise looks exactly like success, and a screenshot
  cannot tell them apart. It earns most on Next, where a production React build minifies hydration
  errors into a numbered link.

### 11.2 One `theme.css` defect, three starters, three narrowings

> **A FOURTH pass landed as #222**, over the comments these earlier passes left in the starters. It
> found one over-broad claim (TanStack, "every `--color-*` token silently resolves to nothing") and
> one WRONG MECHANISM (Next.js, "the elements re-scope their own tokens"; nothing re-scopes, Tailwind
> emits `@theme` to `:root, :host` and the `:host` half pins the tokens per element). The narrowing
> was not finished when this section said it was. §12.1.

**Record this as one finding with three passes, not as three bugs.** Each pass found another instance
and made the claim smaller, and the version that would have been written after any single pass would
have been wrong. It is the clearest worked example in this repo of the rule #218 added while it was
happening (§11.3).

The defect: `@kitn.ai/ui/theme.css` is Tailwind v4 **source**. Its light tokens live inside an
`@theme { … }` block, which is a Tailwind at-rule and not CSS, and a browser discards an unknown
at-rule **whole**. `@kitn.ai/ui/theme.tokens.css` is the compiled stylesheet. A pipeline with no
Tailwind that imports the first one ships a document with no `--color-*` on `:root`, on a green build.

**Pass 1, #216, TanStack: found.** The starter imported the source file, the emitted asset carried one
raw `@theme {`, and `--color-background` was defined nowhere else. Measured on the built CSS rather
than read off the config: `@theme` count went 1 to 0 after the switch, and a real `:root` block plus a
`.dark` block now ship. The obvious lesson at this point is "never import `theme.css`".

**Pass 2, no PR: that lesson is wrong, and the counter-example was already in the tree.**
`examples/starters/solid/src/styles.css` imports the very same `@kitn.ai/ui/theme.css` and is correct,
because it says `@import "tailwindcss"` above it and `@tailwindcss/vite` is in its pipeline, so
`@theme` is **compiled** rather than discarded. **The condition is whether Tailwind processes the
file, not which specifier you wrote.** "Never import `theme.css`" would have broken Solid.

This pass is a check, not a change, which is why it has no commit of its own. Solid was **read** and
left alone: `git log -- examples/starters/solid/src/styles.css` does not name #217. Its record is
#218's `CLAUDE.md` rule and the note #219 wrote onto the `nextjs` row. Attributing this pass to #217
because #217 is the Solid PR is the mistake §11.10 opens with.

**Check that claim the tight way, because the loose way fails.** `git show 832f6aa | grep theme.css`
returns three hits, so "#217 never mentions `theme.css`" is false. All three are about the `.dark`
variant, in the README and an `App.tsx` comment, and #217 also documented Solid's `@source` line and
its Tailwind setup. What it never states is the source-versus-compiled distinction or the condition
that turns on it. **Adjacent prose is not the claim**, and a grep for the filename cannot tell them
apart.

**Pass 3, #219 and #220, Next: found again, then measured to its real size.** #219's audit of the
`nextjs` row found the third instance without running anything: `app/layout.tsx` imported the source
file while `postcss.config.mjs` declared `plugins: {}` and its own comment asserted the file was
*"just custom properties"*. #220 fixed it and then **measured the blast radius against a defect twin
running beside the fixed app in Chromium**, which is what turned an assertion into a size:

- **Dark mode is unaffected**, and the reason is structural rather than lucky. `.dark` is a top-level
  rule in `theme.css`, **outside** the `@theme` block, so a browser parses it even when the file
  arrives as raw source. Only the light set is inside the at-rule that gets discarded.
- **Chrome inside any `kai-*` element still resolves.** The starter comments attribute this to the
  elements re-scoping "their own tokens onto slotted content", which describes the effect correctly
  and the agency wrongly. There is no `::slotted()` token rule and nothing re-scopes: Tailwind v4
  emits `@theme` tokens to **`:root, :host`**, `elements/styles.css` imports `theme.css` into the
  compiled sheet `define.tsx` adopts into every shadow root, and the `:host` half sets the tokens on
  the custom element itself, where slotted light-DOM children inherit them the ordinary way. The
  `display: contents` wrapper carrying the `.dark` scope does the same for the dark set. **Plain
  inheritance, off a token pin nobody added for this purpose.** Worth knowing before anyone "fixes"
  it, since the behaviour depends on a Tailwind emit target rather than on kit code.
- **What breaks is the chrome outside every element.** The app shell measured
  `background-color: rgba(0, 0, 0, 0)` against `rgb(255, 255, 255)` on the twin, while `.sidebar`
  matched on both.

**That narrowness is why it survived three starters.** The page looks nearly right, so nothing about
the failure recruits attention. `app/layout.tsx` now states the defect at that size, and names the
easy version it is refusing: *"'the app renders on fallbacks' is the easy version and it is wrong."*

The finding is not written down anywhere as one thing; each pass lives in its own PR body plus the
comments it left in the starter it touched. That is why it is here. The single best in-tree statement
is the block comment at the top of `examples/starters/nextjs/app/layout.tsx`, which is also the only
place all three passes appear together. Do not look for this in
`docs/package-consumer-issues.md`: its `theme.css` entry is a **different** defect, about token
collisions inside a consumer that *does* run Tailwind.

**The over-broad version is still in the tree, in the starter where the defect was first found.**
#220's body says "Every comment stating the defect now states it at that size", and that is false:
`git show --stat 12a51da -- examples/starters/tanstack-start/` is empty, and
`examples/starters/tanstack-start/src/routes/__root.tsx` still reads that every `--color-*` token
resolves to nothing and *"the app renders with the fallbacks"*, with the starter's README carrying the
unqualified version too. The corrected size exists only in the Next starter and in `frameworks.ts`.

Notice what that is. #220 measured the narrow claim, wrote it into the file in front of it, and then
stated the sweep in the perfect tense without doing it, **inside the PR that establishes narrowness as
the finding**. Nobody was careless; the third pass simply had no reason to open the first pass's
starter. That is the cost of a finding whose only home is a series of PR bodies, and it is a concrete
job for whoever picks this up: propagate the narrowed wording to TanStack, or delete the wording there
and point both starters at one place.

### 11.3 #218 turned that into a rule, and pass two is the rule's own evidence

**`CLAUDE.md` gained one line**, and it is worth reading whole rather than in summary:

> **Before generalising a fix into a rule, name a second instance of the class and check the rule
> against it** [...] The second instance is nearly always already in the tree and cheap to check [...]
> **The wrong version is always the more quotable one**: the compression is what drops the qualifier
> that made it true, so a finding that shortens into something satisfying is exactly when to distrust
> it.

The commit message names three cases from one session where the obvious generalisation would have
introduced a new defect and the counter-example was already sitting in the tree: the ARIA role a
linter wanted on `kai-button`'s host (§5.4), "an absent `accept` means the full capability set"
(§9.6), and this one.

Two things about it are worth carrying. First, **the rule is downstream of §11.2 rather than applied
to it**: #218 landed after the Solid counter-example had been found, so the theme.css entry is the
rule's evidence, not its first customer. Second, the tell it names is testable on this document. §4's
heading is more quotable than the table it points at, and it is the sentence that went wrong.

### 11.4 The title guard grew a parser, and collected a limit that had been handed forward (#219)

§5.10 recorded `titleProblems`'s stated limit: it read HTML documents, the two SSR starters declared
their titles in JS, and both were `planned`, so the gap belonged to "whoever makes an SSR row ready".
#219 is that person, and the docblock now opens by saying so:
`READS JS-DECLARED TITLES TOO, which is what the note here used to hand to "whoever makes an SSR row ready"`.

`documentTitles` in `packages/create-kai/src/template-guards.ts` dispatches HTML to the old regex and
everything else to a **TypeScript compiler API parse**, loaded through `createRequire` rather than a
static import because the module has to load under `scripts/build.mjs`. Three shapes, each a framework
contract rather than a guess: Next's `export const metadata` and `generateMetadata()` (walking every
`ReturnStatement` at any depth), a `{ title }` entry in a `meta:` array for TanStack Start and unhead,
and `document.title =` anywhere.

**Why a parse and not a regex is measured, not argued.** The two SSR starters carry eight `title:`
fields that are not document titles: card headings, conversation names, a JSX attribute. A regex that
reaches the two real ones reports all eight.

**It states a narrower limit rather than claiming the class closed**, under `WHAT IS STILL NOT GRADED`:
computed titles, Next's `title.template`, `.vue` and `.svelte` script blocks, and titles set through an
indirection. Read "the JS-declared-title class is closed" as shorthand and check that list before
relying on it.

#219 is five loose ends, one commit each so any one reverts alone, and the other four are: the
`frameworks.ts` header (stale in **both** halves after #216, plus a third stale reference to the
long-renamed `verifyAppPath`); the template copy filter, now derived from each starter's own
`.gitignore` because a flat basename set could not see a path like `src/routeTree.gen.ts`; a third
hand-written element count in `docs/web-components.md`, **removed rather than derived**, because
deriving it would have shipped a claim that is false; and an emitted-project test block for Solid,
the one `ready` row that had none.

### 11.5 An audit that read as complete recorded one of three `paths` problems (#220)

#219's audit of the `nextjs` row is a good audit. It ran before the work, it found two live defects
invisible at the time because a `planned` row is never graded against its template, and it wrote them
into the table under a heading reading "TWO THINGS THIS ROW WILL WALK INTO, both found while auditing
it". Both were real: `paths.css` named a file the starter did not have, and the theme.css import
(§11.2).

**#220 found two more in the same block**, and the distinction between them matters more than the
count:

- **`paths.components` was `'app'` and is now `'app/components'`. This one was a genuine defect and
  the audit missed it.** It pointed at a real directory, so `declaredPathsProblem` passed it: that
  rule only checks existence. A v2 `add` reads this field to decide where to WRITE a generated
  component, and `app` would have scattered them among the route files. **An existence check cannot
  see a path that exists and is wrong**, which is the same shape as §5.5 one axis over.
- **`paths.app` moved from `'app/page.tsx'` to `'app/workspace.tsx'`, and calling that an error would
  be wrong.** The old value named a file that existed; what it lacked was the `toOpenAIMessages(...)`
  expression `appPathProblem` requires, and #219's own text said so explicitly and called it the guard
  working. The value moved because the composed workspace landed in the client island rather than the
  Server Component page. A consequence of the rewrite, not a defect the audit overlooked.

**The transferable part is the first one. An audit that reads as complete is worth distrusting,
especially when it names a sibling field**: recording `paths.css` made the whole `paths` block look
inspected. The cheap defence is to say which keys were checked and against what, since
`declaredPathsProblem` skips `env` and `app` by design and only tests existence for the rest.

### 11.6 Three tests that had run out of a subject (#220)

Every shipped row is now `composedWorkspace: true`, so a test needing "a framework with no composed
starter" has nothing in the table to point at. Three tests were in that position and #220 re-pointed
them. What each one actually did is more instructive than the summary:

- **`catalog.test.ts`, "has a composed workspace behind every shipped framework".** The only one with
  a true vacuity guard, and **it fired**: it filtered `FRAMEWORKS` on `!f.composedWorkspace` and
  asserted the result was not empty, with the message *"every framework now has a composed workspace,
  so this gap is closed and this test has no subject"*. It now asserts the shipped table directly and
  stays live as the tripwire for the next framework added.
- **`catalog.test.ts`, "refuses a composed-only feature on a framework with no composed starter".**
  Hardcoded `getFramework('nextjs')`. **No vacuity guard**; it would simply have failed. This is the
  one that now builds a **synthetic row**: `{ ...react, id: 'synthetic', composedWorkspace: false }`.
- **`generate.test.ts`, "refuses at the surface gate rather than emitting a project without the
  feature".** Also hardcoded `'nextjs'`. It now uses a **synthetic feature id** on a real framework,
  not a synthetic row.

**The mechanism is not the one the flip suggests.** None of the three selected on `status: 'planned'`.
One filtered on `composedWorkspace`, two named `nextjs` outright. `nextjs` happened to be
simultaneously the last `planned` row and the last non-composed row, which is why one flip took all
three subjects at once and why the coincidence reads like a cause.

**The lesson is the fix, not the failure.** A test whose specimen is whichever real row is currently
off is a test the next success deletes. Synthetic rows cost nothing and cannot be flipped out from
under the assertion. Where the property is genuinely about the shipped table, assert it about the
shipped table and let it be the tripwire.

### 11.7 The strongest evidence in this round is not executable

> **Unchanged at `6afe8a0`, re-derived rather than assumed.** Both greps below still return nothing,
> and the probe is still referenced from no `package.json` and no workflow. #223 added a check on a
> THIRD surface (the emitted Solid scaffold, structurally) rather than wiring up either of these
> two, so the gap this section names has been stepped around once more. §12.9.

**Worth stating plainly, because it is a different failure from the one §5 catalogues and it is easy
to feel good about.** The two sharpest empirical claims from these PRs are:

- #216 and #220: the server emits `<kai-thread>` with **no `messages` attribute**, and the elements
  register after hydration.
- #217: **0 of 4** rows carried a speaker name on the old Solid starter against **6 of 6** after,
  measured by running the old version on a second port rather than asserting the fix.

Both were really measured, in a real browser, and both are recorded only in PR bodies and commit
messages. **Neither run is in the tree and neither runs in CI**, so neither can detect a regression.
What the starters carry instead is prose: the TanStack README tells the reader to `curl` the app and
look, which is an instruction, not an assertion.

**The SSR half is unguarded outright.** `grep -rn "messagesAttr\|SSR emitted\|messages= attribute"`
returns nothing, and the three SSR scripts in `packages/ui/scripts/` are a different axis: `verify:ssr`
proves the module graph resolves under the `node` condition and that components survive execution in a
DOM-free process. Neither reads a rendered document for `<kai-thread>` or for the absence of a
`messages` attribute. `verify-starters.mjs` says as much about itself, calling itself the compile floor
and naming "an array passed as an HTML attribute instead of a JS property" as the exact class it cannot
see, which is the class these probes were built to check.

**The a11y half is guarded, and saying "not in the tree" would be wrong. Say which surface instead.**
#176 left a deliberate pair, and the pairing is the model to copy:

- `packages/ui/tests/elements/thread-row-speaker.test.tsx` is the **cheap CI guard**. It asserts the
  attributes that produce the accessible role and name, always through a populated `<kai-thread>` or
  `<kai-chat>` and never by constructing a `<Message>`, because the original defect was an isolated
  test staying green while the fix reached nobody through the primary path.
- `packages/ui/scripts/probe-thread-row-semantics.mjs` is **the evidence**: Playwright plus a CDP read
  of chromium's real accessibility tree, joined to the DOM by `backendNodeId`, since jsdom has no
  accessibility tree to compute a name from. Both files carry the same warning against citing their
  axe line as coverage, because axe was measured reporting zero violations over a fully unlabelled
  thread.

**What that pair does not cover is the surface these PRs were working on.** It drives the kit's
elements; nothing points it at the starters, and `scaffold.test.ts` makes no speaker or `aria-label`
assertion at all. The probe is also **unwired**: `grep -rn "probe-thread-row-semantics"` over every
`package.json` and workflow returns nothing, so the computed-AX half runs only when somebody types it.
Read §11.8 next. A good guard aimed at one surface is exactly how the same defect survives on another.

§5 is about checks that pass while covering nothing. This is the mirror image: **coverage that was
genuine at the moment it was taken and left nothing behind.** Anyone continuing this work should
assume the SSR contract is unguarded until they see the guard, and should treat wiring that probe up
as cheaper than the next round of manual browser runs.

One consequence for reading #217's numbers: the denominators differ because they are different apps
with different seed threads, so it is 0% against 100% rather than a four-to-six improvement in one
thread. Do not confuse them with #176's own figures, which were 1 of 6 against 6 of 6 through
`<kai-thread>`.

### 11.8 Still open: the instance #176 named is not the instance that got fixed

> **CLOSED at `6afe8a0` by #223.** The emitted Solid front end now passes `role={m().role}` to
> `<Message>`. Read §12.1 before re-running the two greps below: the first returns the fix, and
> **the second still returns nothing**, because the check went into `verify:scaffold` as
> `solidSpeakerSemanticsCheck` rather than into `scaffold.test.ts` where this section predicted it.
> A negative grep is evidence about a location, not about a property.

**#176 is a PR, not an issue**, and its sweep filed the emitted Solid front end in
`packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` as unfixed: the emitter reads `m().role` for
alignment classes and never passes it to `<Message>`, so every scaffolded Solid app ships unlabelled
rows. #217 fixed **the Solid starter**, which had the same shape, and its comment says so:
*"That is #176: every framework reading `m.role` for its alignment classes and then not passing it
on."*

**The scaffolder's copy is unchanged at this SHA, and nothing asserts it.** Derive both:

```
grep -n "role=" packages/ui/src/agent-tooling/mcp/tools/scaffold.ts
grep -n "speaker\|aria-label" packages/ui/src/agent-tooling/mcp/scaffold.test.ts
```

Both return nothing. The emitted `<Message>` around line 3502 still takes only `class`, and the
scaffold suite has no assertion about a speaker name to fail. So the second instance was found and
fixed while the first stayed open, which is #218's rule running in the direction nobody warns about:
naming a second instance is what makes a rule safe to generalise, and it is also how the original ends
up the one left behind. This is not tracked by any PR, and it is the highest-value item this section
leaves: every Solid app scaffolded by the `kai` MCP still ships unlabelled message rows.

### 11.9 §6 and §9.7 corrections

**§6 item 1, the three chat apps, is SHIPPED.** §11.1. Nothing on §6's list is `create-kai` work any
more; item 3, re-measuring the timeout budget on a quiet box, is the only one still open, and
`packages/ui/scripts/measure-timings.mjs` still exists for it.

**§6's Solid title bullet was right as a prediction and is now wrong as a description.** It said the
title "becomes a real edit only when someone writes the Solid chat app", and #217 is that PR: the file
was retitled and given the scaffold-time patch every other starter has, and `titleProblems` caught it
on the first build with the status flipped, exactly as the bullet said it would. The old string
survives as `HISTORICAL_SOLID_TITLE` in `test/template-guards.test.ts`, because fixing the starter
removed the tree's only specimen of a title no name-anchored pattern can see. A new sweep now asserts
over every starter's real title instead.

**§6's angular.json bullet is unchanged and still correct.** All four sites still read
`ui-example-angular`, and they should; the rename is a scaffold-time patch. Do not "fix" the starter.

**§9.7's pairing of those two bullets as "both still true" is now half right**, which is worth one
sentence of method. §6 quoted the Solid title; §9.7 described it as "still carries its own title".
The description survived the change and stayed readable while being wrong about the string. **Quoting
is what makes a claim falsifiable by grep**, and paraphrasing a quoted claim in a later section is how
a document launders a fact it can no longer check.

**§5.10's stated limit on `titleProblems` is closed**, by the person it was handed to. §11.4.

### 11.10 What this section's commissioning narrative got wrong

Same discipline as §8 and §9.8. The narrative was substantially right about structure again, and it
was right about the theme.css finding in a way that mattered, having correctly identified it as one
finding with three passes before this document checked it. Four claims did not survive, and the shape
of the failures **moved**: §8 and §9.8 both found six status claims and two structural ones, while
these four are almost all **attribution**, meaning who established a fact rather than whether it is
true.

1. **"#217 proved Solid imports the same file safely."** The fact is verified and the attribution is
   not. #217's PR body never raises `theme.css`, it did not touch
   `examples/starters/solid/src/styles.css`, and the three times its diff does say `theme.css` are all
   about the `.dark` variant rather than about source versus compiled (§11.2). The counter-example was
   found by whoever wrote #218, in the tree, after #217 landed. That is a better story than the one
   offered, because it is the rule #218 was adding doing exactly what it says: *"the second instance
   is nearly always already in the tree and cheap to check."* The narrative gave the credit to the PR
   that made Solid prominent rather than to the pass that checked it.
2. **"#220 found it a third time in Next."** #219's audit found it, before any Next.js work started,
   and wrote it into the `frameworks.ts` row. #220 fixed it and measured the blast radius. Splitting
   those two is what makes §11.5's point land: the same audit that found this one missed
   `paths.components`, so it is not a story about one PR being thorough.
3. **"#220 fixed two more `paths` errors."** One error and one move. `paths.components` was a genuine
   defect the audit missed; `paths.app` moved because the workspace moved into the island, and #219's
   own text had already named that file as the one `appPathProblem` would stop on. §11.5.
4. **"Three tests were written against whichever framework was still `planned`, and their own vacuity
   guards fired."** Three tests is right and the mechanism is wrong twice. None selected on `status`:
   one filtered on `composedWorkspace`, two hardcoded `'nextjs'`. Only the first had a real vacuity
   guard, and only the second re-points at a synthetic **row**; the third uses a synthetic feature id.
   §11.6.

Two smaller ones, recorded because the wording would mislead rather than because the substance is
wrong. **"#216 kept the SSR proof and strengthened it"** is true of the demonstration and false of any
assertion: there was no committed check before or after, which is §11.7. And **"removed the `<Chat>`
drop-in rather than keeping a second route"** describes a rejected alternative; no second route ever
existed to remove.

---

## 12. What landed after `12a51da`: a real gateway, a live provider run, and the first offline route harness

**Verified against `origin/main` at `6afe8a036403fd593f24aacb00988932d76e2445`**
(`test(agent-tooling): run every emitted route against its real SDK, offline (#230)`).

Same rule as §9, §10 and §11. Nothing above this section is rewritten; where a claim above is now
wrong it carries a marker pointing here.

**Start by fixing the anchor, because the brief that commissioned this section got it wrong and the
error is instructive.** It said nineteen commits had landed since `16c14c2`. Both halves are
defensible and the conclusion is not: nineteen is the right count for `16c14c2..origin/main`, and
`16c14c2` is **§9's** anchor, not this document's. §10 anchored at `67365c8` and §11 anchored at
`12a51da`, so ten of those nineteen were already read and written up. Deriving the range from the
newest anchor in the file rather than from the one a summary named cut the work in half and, more to
the point, stopped this section re-describing #216, #217 and #220 as though they were new.

```
git log --oneline --first-parent 12a51da..origin/main
```

Nine commits, and they group into five pieces of work plus a release:

- **#221, #222, #223** are this document paying its own debts. #221 IS §11. §12.1.
- **#214** is the held 0.22.2 release, merged and published. §12.2.
- **#226 then #229** are one seam, opened and then moved. §12.3.
- **#225** is `create-kai`'s first gateway past the mock. §12.4.
- **#227** is the `vercel-ai-sdk` route driven against a live model, and it carries the correction
  this section most wants to survive. §12.5.
- **#230** is the route-contract harness. §12.6.

Two PRs are OPEN and neither is in that range: **#228**, the 0.23.0 release, and **#231**, a coverage
diagnostic. §12.2 and §12.7. This is the fourth consecutive section that has had to explain a gap in
the PR numbering as a held release rather than a lost merge, and it is now safe to expect.

This section was commissioned from a narrative, like §9 and §11. Every claim in it was checked
against this tree, and §12.11 lists the ones that did not survive. The ratio held for the fourth
time.

### 12.1 The three closures this document earned (#221, #222, #223)

**#221 is §11 itself.** Worth stating so that a reader deriving the range does not go looking for
what it changed in the kit: nothing. It is the handoff.

**#222 corrected §11.2's own comments, and the shape of both errors is the point.** §11.2 recorded
the `theme.css` defect as one finding narrowed over three passes. #222 is a fourth pass over the
comments those passes left in the starters, and it found the two failure modes this document
catalogues, one of each:

- **Over-broad.** The TanStack comment said "every `--color-*` token silently resolves to nothing and
  the app renders with the fallbacks". #220 had already measured otherwise: dark mode is a plain
  `.dark` rule and is unaffected, and chrome inside any `kai-*` element still resolves. Only chrome
  outside every element breaks. That narrowness is exactly why the bug survived three starters, so
  the starter that made narrowness the point was the worst place to leave the wide version.
- **Wrong mechanism, which is worse than no mechanism.** The Next.js comment said "the elements
  re-scope their own tokens onto slotted content". Nothing re-scopes. Tailwind emits `@theme` to
  `:root, :host`, adopted into every element's shadow root, so the `:host` half pins the tokens on
  each host and descendants inherit off it. Same observed behaviour, wrong cause. #222's own summary
  is the sentence to keep: a wrong cause is worse than none, because the next person reasons from it.

Both comments now state the CONDITION, does Tailwind process this file, rather than the import
specifier. That is #218's rule holding after the fact.

**#223 CLOSES §11.8, which §11 called the highest-value item it was leaving.** The emitted Solid
front end read `m().role` for its alignment classes and then dropped it, so every Solid app
scaffolded through the published `kai` MCP shipped unlabelled message rows. It now passes
`role={m().role}` to `<Message>`. Solid is the only target that renders the SolidJS component
directly rather than through `<kai-chat>`, so it inherits none of the facade's a11y work; the other
seven emit `<kai-chat>`, and #223 states that it verified that rather than assuming it.

**One thing about that closure is a trap for anyone grepping, and it is this document's own subject
again.** §11.8 handed the reader two derivations. Re-run at this SHA:

```
grep -n "role=" packages/ui/src/agent-tooling/mcp/tools/scaffold.ts
grep -n "speaker\|aria-label" packages/ui/src/agent-tooling/mcp/scaffold.test.ts
```

The first now returns the fix. **The second still returns nothing, and the finding is closed
anyway.** The check did not go where §11.8 predicted. It went into `verify:scaffold` as
`solidSpeakerSemanticsCheck` (`packages/ui/scripts/verify-scaffold-compiles.mjs`), which reads the
emitted code across every solid cell rather than one sampled configuration the way a string
assertion in `scaffold.test.ts` would. #223's reasoning for that placement is worth copying: `role`
is optional on `MessageProps`, so omitting it compiles perfectly, which is the same class as
`solidPartCoverageCheck` next to it, valid code with missing behaviour. It also strips comments
before locating the tag, because the emitted tag now carries a prose block containing the literal
`role="article"`, so a substring search over raw text would be satisfied by the comment rather than
by the attribute. Confirmed by mutation. **A negative grep is evidence about a location, not about a
property.**

### 12.2 The release, and the package that has no release at all

**0.22.2 is merged and published.** `.release-please-manifest.json` on main and
`npm view @kitn.ai/ui dist-tags` agree at this SHA, which is not something to restate here; run both,
and §2 explains why they are kept apart and why the merge needs `--admin`.

**#228 is OPEN, is 0.23.0, and is the repo owner's call.** It carries #225 and #227, which means it
carries the `vercel-ai-sdk` fix in §12.5. Until it merges, the shipped `vercel-ai-sdk` route on npm
still fails on `ai` v7 for any app that sends a system message. That is the one thing on the open
list with a live consumer consequence.

**`create-kai` is not published, and no pipeline would publish it.** This matters because §11.1 and
the brief for this section both describe `create-kai` as complete, which is true of its framework
table and false of its delivery. Derive it:

```
grep '"version"' packages/create-kai/package.json     # 0.0.0
cat release-please-config.json                        # packages/ui only
npm view create-kai version                           # 404
```

The package has a `bin`, a `files` array and a `verify:pack` script, so it is publishable in shape.
It has never been published, and `release-please-config.json` has one entry. Nobody can run
`npm create kai@latest` today, which is the exact command the package's own `description` field
advertises. This is not tracked by any PR.

### 12.3 The preamble seam: opened by #226, moved by #229

One seam, two commits, and the second exists because the first landed it in the wrong file.

**#226 exported it.** `Integration.webRoute` is not emittable on its own: the fragments reference
declarations that were module-private in the kit, so PR #225 was carrying a checked copy plus two
build guards to notice when it drifted. #226 exports `chatRoutePreamble(fragment)` rather than the
constants the copy was made from, and the reasoning generalises past this repo: a flat preamble is
the shape that got it wrong, because one declaration is injected only where the route calls it (an
unused declaration is a hard error under `--noUnusedLocals`), so a consumer handed the other constant
alone emits some routes that compile and some that do not, and finds out only for the ones it
happened to wire first. **"What goes above THIS fragment" cannot be answered half-right, so the
export is a function and not a table.** It also exports `CLIENT_MODEL_IDS` and `defaultModelFor`,
because `openrouter` forwards the client's `model` and a front end posting messages alone gets a 400
that no build or typecheck can see.

**#229 moved it, and the reason is a build-graph fact nobody would predict from reading the export.**
`mcp/tools/scaffold.ts` builds the MCP tool's input schema at MODULE SCOPE, and a module-scope side
effect is not tree-shakeable, so esbuild asked for any one of those three exports had to keep the
whole file and everything it imports. The consequence landed on `create-kai`, whose CLI is one
bundled zero-dependency file: most of the bundle became zod, in the graph and never executed,
downloaded by every user of a command that does not exist yet (§12.2). The preamble now lives in
`packages/ui/src/agent-tooling/route-emit.ts`.

**Two pieces of method in #229 are worth more than the fix.** First, it measured the before and after
**on the same commit**, and its message says why: both ends had drifted since the regression landed,
so quoting either half against a different commit is how these numbers go wrong. Second, "it is a
leaf" is a claim about imports, and it checked it rather than asserting it: esbuild's metafile puts
exactly one module in that file's graph, itself. And the null result it reports, emitted output
unchanged, is not a blind one: **the same harness moved hundreds of rows between the two preceding
commits**, so it is a harness that has been seen to move. A null result from an instrument nobody has
watched move is not evidence.

### 12.4 `create-kai`'s first real gateway (#225), and what "complete" does and does not mean

**Every row in `packages/create-kai/src/frameworks.ts` carries `status: 'ready'` and
`composedWorkspace: true`, and none carries `planned`.** Re-derived at this SHA. That was already
§11.1's finding at `12a51da`; it is restated here only because it is the claim most likely to be
carried forward without its qualifier, and the qualifier is below.

**`WIRED_GATEWAYS` is `{ mock, openrouter, anthropic }`**, widened from `{ mock }` by #225. The
authority is `packages/create-kai/src/catalog.ts`; the CLI prints the live version with
`create-kai --list --json`, and the previous handoff's note that the gateway prompt stays flat
"until `WIRED_GATEWAYS` widens" is now the deferral that came due.

**Now the qualifier, and it is load-bearing.** "Complete" is true on the framework axis and false on
the gateway axis, and the catalog says so in a comment worth reading in place: *"WIDENING IS NOT ONE
AXIS. A gateway is wirable only in a (gateway, framework) CELL."* Derive the cells:

```
grep -n "route:" packages/create-kai/src/frameworks.ts
```

Only `react` and `nextjs` name a route host. `vue`, `svelte`, `solid`, `angular`, `html` and
`tanstack-start` are all `route: null`, so `wirableGateway` refuses every keyed gateway for them with
a message saying which frameworks declare one. **Every ready framework other than those two cannot be
scaffolded against a real provider at all** (that is most of the table at this SHA; run the grep
rather than quoting a fraction, because this is exactly the ratio that moves next), and #225 chose
react and nextjs deliberately, as the two
ends of the route-destination axis rather than as a fan-out: Next is the cheapest correct destination
(one file, ships in production) and a Vite SPA is the most expensive (three files plus a
`vite.config.ts` edit, and development only, because `vite build` emits no server).

**What #225 exercised, in its own words, and what it did not.** Exercised: scaffold, install, and
`npm run build` for both cells, plus a boot probe with the upstream repointed at a dead local port
(app boots, route mounted, handler ran, a wrong path still 404s so the 502 is not a generic fallback,
dev server survives). **Not exercised: any real round trip, any streaming from a live model, or
whether the emitted model id is currently valid. No provider was called.** It also states its own
vacuity: `openrouter.deps.npm` is empty, so that smoke run proves nothing about dependency emission,
and the claim is graded by a unit test against `langgraph` instead.

**A defect only running it could find**, recorded because it is the argument for the boot probe: the
Vite plugin's async middleware is not awaited by Connect, so an upstream network failure was an
unhandled rejection that killed `npm run dev`. Observed, then fixed with a try/catch returning 502.

**On "each framework was proven in a real browser, never by a green build."** That is the right
description of the method and it needs two corrections. It is not what `scripts/smoke.mjs` does;
that script's own docblock is explicit that it scaffolds, installs and BUILDS, that it does not call
a provider, and that "what happens on a real first message is not covered by this script". The
browser runs are real and are recorded in PR bodies: #216, #217 and #220 each scaffolded through the
CLI into a temp dir **outside the repo**, installed, built, and drove Chromium with text sampled
growing over time and page identity asserted on the document title rather than on a port. But #217's
console was clean *apart from* Vite's connect and the mock responder's deliberate "no provider was
contacted" notice, so "clean console" is a summary and not a quotation. And §5.6 of this document
records one of those browser verifications driving a leaked dev server from a previous run, which is
the method failing once and being caught. **The method is right. "Never by a green build" is a claim
about intent that the tree cannot confirm, and none of those runs is in CI (§11.7 is still true).**

### 12.5 The live `vercel-ai-sdk` run (#227), and the correction this section most wants to survive

**Phase one: the route could only ever emit text.** `result.textStream` carries text deltas only, so
a tool call or a reasoning block went past it silently and the route answered every turn as plain
prose however the model replied. The integration's own `streamMapping` said so and named the fix. It
is now on `result.fullStream`, re-framed onto the OpenAI wire that `readOpenAIStream` already parses.
Part names were checked against the installed `ai` typings rather than from memory, because they have
changed across majors and a wrong name is a route that compiles and emits nothing. Two silent traps
are handled in the route and documented there: OpenAI correlates tool-call fragments by POSITION
while the SDK only gives an id, so the route keeps an id-to-index map; and `fullStream` re-sends the
complete input on `tool-call` after streaming it in fragments, so emitting both doubles every call's
arguments while skipping it unconditionally empties them for a provider that streams none. Tools are
converted to the SDK's own `ToolSet` deliberately WITHOUT `execute`, because an executable tool makes
the route the loop owner and the call never reaches the browser.

**Phase two: the live run found a defect no gate could.** Driving the shipped route (generated from
`scaffold.handler`, never hand-copied) against the AI Gateway threw on the first request:

```
InvalidPromptError: System messages are not allowed in the prompt or messages
fields. Use the instructions option instead.
```

`SystemModelMessage` is still a member of the `ModelMessage` union, so a system entry in `messages`
typechecks and `verify:scaffold` stayed green, while `ai` v7's `standardizePrompt` refuses it at run
time. Fixed by hoisting system turns into `instructions`, which takes the message array, so several
of them keep their order and their count instead of being flattened into one string. The route says
where the v5/v6 split is, because on those versions there is no `instructions` option and a system
message in `messages` is correct.

Fixtures for every live cell are committed under
`examples/internal/openrouter-spike/fixtures/live/`, in per-backend directories so the gateway column
and its OpenRouter control do not share one, and both replay with no key and no network. Spend was
under a cent.

**Two guards this run earned, each watched red first, and both are the failure mode this document is
named for.** `seesAssistantProse` refused nothing: the first live run threw on every request, the app
rendered its own `_The request failed: ..._` notice, and the scenario went GREEN on the error message
for the bug it exists to catch. And `recordFixture` accepted an error-only stream as a recording *and
cleared the directory first*, so a rate-limited retry wrote one billing message over two good tool
rounds. An error-only stream is well formed and terminated, so the truncation guard waved it through.

---

**THE CORRECTION, and it is the single most important paragraph in this section. #227's PR body and
its commit message both say the failure was "every turn of every scaffolded app" on this integration.
That is WRONG, it was relayed onward at least twice, and the tree refutes it in four independent
places.**

```
grep -n "role:" packages/ui/src/elements/chat-types.ts
grep -n "system" packages/ui/src/wire/encode.ts
grep -n "system" packages/ui/src/agent-tooling/mcp/tools/scaffold.ts
grep -rn "role: 'system'" examples/starters/
```

1. **`ChatMessage.role` is `'user' | 'assistant'`.** There is no third member. A system turn is not
   representable in the thread the kit hands the encoder.
2. **`toOpenAIMessages` never emits a system message.** The string `system` appears once in
   `packages/ui/src/wire/encode.ts`, in the `OpenAIWireMessage` role union that describes what the
   wire ACCEPTS. No code path in that file constructs one.
3. **The scaffolder emits no system prompt.** The word does not occur in
   `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` at all, and the emitted front end posts
   `messages: toOpenAIMessages(thread)`.
4. **No starter sends one.** The grep over `examples/starters/` is empty.

The only client in this repo that prepends one is the internal spike, at
`examples/internal/openrouter-spike/src/hooks/useSpikeChat.ts`, on the line that builds the OpenAI
request:

```ts
: [{ role: 'system', content: systemPrompt }, ...toOpenAIMessages(mirror)];
```

**The APP prepends it. The kit's encoder does not.** So a stock scaffold on this integration did not
fail. It failed the moment anyone added a system prompt, which is a normal thing to do and is what
the harness that found this does. **Urgency unchanged, blast radius overstated.**

Why this one is worth the space. The false version is the more quotable one, exactly as root
`CLAUDE.md` warns: "every turn of every scaffolded app" is a better sentence than "every turn of any
app that adds a system prompt", and the compression is what dropped the qualifier that made it true.
It also survived review, a merge, and a relay into a handoff brief, because it is downstream of a
true and alarming fact (a runtime failure invisible to the type system) and nobody re-derived the
premise attached to it. **The type that refutes it is four lines long and was never read.**

**One consequence to carry:** the fix is still correct and still urgent, because the hoist is what
makes the route usable by anyone with a system prompt. It is unreleased until #228 merges (§12.2).
And a second-order gap this opens: since `ChatMessage.role` has no system member, an application
carrying a system prompt has nowhere in the kit's own model to put it, and every integration invents
its own handling. That is a design question, not a defect, and it is not tracked.

**Also left behind by #227, in its own reviewer notes:** `apps/docs/src/content/docs/integrations/
vercel-ai-sdk.mdx` still teaches `textStream` and `gpt-4o` throughout. Confirmed unchanged at this
SHA. The published docs therefore teach the shape #227 replaced, including an aside instructing the
reader to re-frame `textStream`.

### 12.6 The route-contract harness (#230): every emitted route against its real SDK, offline

**`packages/ui/tests/agent-tooling/emitted-route-contract.live.test.ts`**, and it is the answer to
§12.5's question of how a route that compiles can be broken. It imports each emitted backend route,
drives a real request through it, and asserts the stream that comes back, against the integration's
real SDK, with no network.

**It runs on every CI pass and needed no workflow edit.** It is picked up by the `emitted` vitest
project (`packages/ui/emitted-code-tests.ts` declares the directory and the `.live.test.ts` suffix),
which the required `test` job runs. That wiring is itself asserted by
`tests/agent-tooling/emitted-project-wiring.test.ts`, so deleting the CI step turns a unit test red
rather than quietly reducing coverage. Note the file suffix says `live` and the harness is the
opposite of live; the suffix is the vitest project selector, not a claim about the network.

**Offline is enforced, not assumed.** `globalThis.fetch` is replaced at module scope, before any
emitted route is dynamically imported, and it **throws** rather than returning a default if a route
calls it outside a driven request. The file states its own two limits, which is why they can be
repeated here: only `globalThis.fetch` is replaced, so an SDK on `node:http` would escape (loudly,
after one request left), and env keys are set with `??=` so a developer's real key is not
overwritten, though no transport exists to spend it.

**How the covered set is derived**, which matters more than its size: `cellsFor` walks
`listIntegrations()` and emits a cell for every integration with a `webRoute` (hosted in a Next
route) plus one for every `routeTemplates` key that has a host. Today that is a Next cell for
`openai`, `anthropic`, `openrouter`, `vercel-ai-sdk`, `langgraph`, `cloudflare`, `ollama` and
`mastra`, plus `cloudflare`'s worker cell. Nothing is listed by hand, so a new integration with a
`webRoute` is covered the day it lands.

**`cloudflare`'s worker cell is the interesting one** and is the reason the harness is not simply a
fetch recorder. That route's only transport is an `env.AI` binding, so the harness stubs the binding
and records the call. Grepping the worker template for `fetch` returns exactly one hit, the handler
declaration `async fetch(req, env)`, and no call. `cloudflare.webRoute`, used for the Next cell, does
call `fetch`, so the same integration is covered through both transports.

**The uncovered set, and the one place the brief overstated it.** Three integrations are excluded:
`mock` (emits no backend route at all), `pydantic-ai` (Python) and `pi` (its route is an Express
server that spawns the `pi` binary). The claim that these are "re-derived each run" is **half right,
and the half that is wrong is the half a reader would rely on**:

- The three **ids are hardcoded**, as keys of a `NOT_EXECUTABLE` map. Nothing derives them.
- Each id's **justification is re-derived every run**, by a `check(integration)` predicate beside the
  prose reason: `mock` must still have no `webRoute` and no `routeTemplates`; `pydantic-ai` must
  still be `language: 'python'`; `pi` must still have no `webRoute`, be `local-binary`, and have a
  route template that spawns or listens. If a catalog entry changes so a reason stops being true, the
  test fails naming the reason.
- **The complement is derived**, and this is what makes the hardcoding safe: any integration in the
  registry that is neither covered nor in `NOT_EXECUTABLE` fails the suite. A new integration cannot
  slip through unnoticed, it can only be added to one list or the other deliberately.

That distinction is worth keeping because "derived" and "hardcoded but validated" fail differently.
The first cannot go stale. The second can only go stale loudly.

**`outOfBand` does not decide reachability, and assuming it does is the trap.** It is a required
field on every integration describing what must already be running (`none`, `local-server`,
`local-binary`, `language-runtime`). `ollama` and `mastra` are both `local-server` and **both are
covered**, because both have a `webRoute` and the harness drives the route, not the provider.
`outOfBand` is not an input to `cellsFor` at all. It appears once, as one conjunct of the `pi`
exclusion predicate, where it helps validate an exclusion rather than decide one.

### 12.7 The coverage diagnostic (#231): MERGED as `addfe2d`, and its report is on main

> **Written at `6afe8a0` while #231 was open. It merged as `addfe2d`, which is `6afe8a0`'s immediate
> successor.** This heading read "**OPEN, and its report is not on main**", and the framing that
> stood here opened "**Read this section knowing the artifact is not in the tree**", recording that
> #231 adds `docs/superpowers/coverage-diagnostic-2026-08-14.md` and a `coverage` block in
> `packages/ui/vitest.config.ts`, that neither was on main at that SHA, that
> `git ls-files | grep -i coverage` returned nothing that is a report, and that if #231 were closed
> rather than merged this section would be its only surviving record. All of that was true at
> `6afe8a0`. None of it is true now: `git ls-tree -r --name-only origin/main | grep -i coverage`
> lists the report, and `git show origin/main:packages/ui/vitest.config.ts | grep -n coverage` finds
> the block. **The findings below are reproducible by running a command rather than by reading a
> PR**, the command the report itself names:
> `nx build ui && npm run build:css && npx vitest run --project=unit --project=emitted --coverage`,
> from `packages/ui`.
>
> **The heading is corrected rather than left to rot, which is the opposite of what §4 gets, and the
> difference is whether the rot teaches anything.** §4's heading is a row count in a file that opens
> by swearing off counts, so leaving it rotted is the worked example. This one teaches nothing and
> would only send a reader hunting for a file already sitting in front of them. §12's own opening
> still lists #231 as one of two open PRs, and that stays as written, like every other claim at this
> section's anchor. **§12.10.**
>
> **Re-derived at `addfe2d`, because "the config block is inert unless `--coverage` is passed" was a
> claim about a PR and is now a claim about the tree: it holds.** The block declares no
> `coverage.enabled` key, and the only `enabled: true` in that file is `browser.enabled` on the
> storybook project. It carries no `thresholds` key. And
> `git grep -- '--coverage' origin/main -- '.github/**' 'packages/ui/package.json' 'package.json'`
> returns nothing, so no workflow and no script turns it on, and Vitest collects only when the flag
> or that key is set.
> `@vitest/coverage-v8` was already declared at `6afe8a0`, and `git diff --stat 6afe8a0 addfe2d` is
> three files with no source, no test and no lockfile among them, so the merge cost the suite
> nothing and every structural finding below still reads off the current tree unchanged.

**It is a diagnostic and not a gate**, and it should stay one: no threshold is proposed, the config
block is inert unless `--coverage` is passed, and `@vitest/coverage-v8` was already a declared
devDependency so nothing was installed. Its own caveat is the right frame for every figure in it:
**coverage says a line ran, not that anything would notice if it were wrong.** High-coverage areas
are reported as "exercised", never "tested".

**Percentages here are measurements from a dated run against `e796bee`, not properties of the
repo.** They are recorded with that label or not at all, per this file's opening rule. What follows
instead are the structural findings, which are falsifiable by grep and do not rot.

**1. The expectation inverts.** `wire/` and `state/` measured as the two BEST-covered library folders,
not the worst. That is the finding, and the number is not needed to state it.

**2. `state/stream.ts` is the real hole, and it is a silent-corruption path.** Verified structurally
at this SHA, independent of any coverage run. `onStreamSettled` returns a **hand-written delegation
wrapper**: an object literal with one line per `AssistantStream` method, each of the form
`inner.X(...); return wrapper;`. Eight rows. Four are exercised through the wrapper by tests
(`appendText`, `done`, `abort`, `addCard`, the last of these by a test literally named for it). **Four
are not: `appendReasoning`, `upsertTool`, `addSource`, `addFile`.** All four are exercised only on the
bare stream from `createAssistantStream`, never through the wrapper. `addSource` and `addFile` are
not called anywhere in `packages/ui`'s tests at all; their only call sites in the repo are in the
spike, a different vitest project. **A copy-paste slip in an unexercised row, `inner.addCard` where
`inner.addSource` was meant, would corrupt a message and pass the entire suite today.** Four
assertions close it. Name the four rows rather than the count when you write the test, because the
count moves the moment a ninth method is added and the names are what a reviewer can check.

**3. `elements/autoloader.ts` is a published entry point at zero.** `packages/ui/package.json` exports
it as `./autoloader` with its own types, `apps/docs` documents it as a consumer entry and copies the
built file out as a raw CDN asset. **One qualifier the headline drops:** it is a CDN and static-only
entry by design, and importing it through a bundler 404s deliberately. That constrains how it can be
tested and is why it is at zero, but it does not make it less published.

**4. The guard-script gap is real and the figure is wrong in both directions.** #231's report says
"10 of them have neither a unit test nor a `--self-test`" and that the repo "has already solved this
for five scripts", applied "to a third of the guards". Re-derived here:

- **The five WITH a self-test are exactly right**, scoped to `packages/ui/scripts/`:
  `grep -ln "self-test\|selfTest" packages/ui/scripts/*.mjs` returns `lint-silent-drops`,
  `lint-attachment-object-urls`, `ssr-render-probe`, `verify-ssr-render`, `verify-scaffold-compiles`.
  **It misses a sixth outside that directory**, `.github/scripts/spike-ci-guard.mjs`, which carries a
  `selfTest()` invoked unconditionally.
- **The ten WITHOUT is a named list, not a complete one.** All ten are genuinely unguarded. At least
  three more in the same directory are too, and all three gate every build:
  `verify-elements-bundle.mjs`, `verify-react-wrappers.mjs` and `verify-shader-lazy.mjs` run inside
  `packages/ui`'s own `build` script, so they gate CI as hard as anything on the list. Add
  `verify-ssr-imports.mjs`, which is wired into the required workflow and **looks** covered because
  its name appears in `tests/scripts/ssr-render-guard-wiring.test.ts`, where it is named only as the
  insufficient prior state that guard exists to prevent reverting to. Add `audit-a11y.mjs` and
  `packages/create-kai/scripts/verify-pack.mjs`, and no scoping tried reproduces ten.
- **So "a third of the guards" understates the gap**, and the recommendation built on it is
  unaffected: closing it is still the highest-value item on the list. Just do not treat the ten as a
  worklist that ends.
- One thing that does NOT close the gap, checked because it looks like it might:
  `packages/ui/tests/scripts/main-module-guards.test.ts` sweeps every `.mjs` in the repo, but it
  tests one cross-cutting idiom (that the entry-point check survives a percent-encoded path), not any
  script's guard logic.

**5. Code exercised only by the storybook job is unprotected in practice**, because that job is
advisory and does not block a merge. The LOC figure is a measurement from that dated run; the
structural claim, that a whole component family lives only in the non-blocking tier, is the part to
carry.

### 12.8 What is next, in priority order

1. **The unguarded CI guard scripts.** Highest value because they protect the rest of the gate, and
   cheap because the pattern is already written five times in this repo: a `--self-test` mode that
   plants a defect and requires the guard to fire, plus a `tests/scripts/*-wiring.test.ts` asserting
   both that it fires AND that a run discriminating nothing is a failure rather than a pass. Work
   from a freshly derived list, not from #231's ten (§12.7 item 4).
2. **`state/stream.ts`'s delegation table.** Four assertions against a real silent-corruption path,
   named in §12.7 item 2. Assert through the `onStreamSettled` wrapper, not the bare stream, because
   that is the distinction the gap is made of.
3. **v0 Gateway and HuggingFace into the catalog, then widen `WIRED_GATEWAYS` further.** Note the
   axis problem from §12.4 before scoping this: widening the set is necessary and not sufficient, and
   the more valuable half may be giving more frameworks a route host so the existing gateways reach
   them.
4. **The harness-layer discussion the repo owner asked to be reminded about.**
5. **Mutation testing, scoped to `wire/` plus `state/parts.ts` plus `state/messages.ts` and nowhere
   else.** Pure, fast, high-coverage folds, which is exactly where "exercised but not tested" is both
   most likely and cheapest to disprove.

### 12.9 Still open, and smaller

- **`create-kai` is unpublishable as configured.** §12.2. Version `0.0.0`, absent from
  `release-please-config.json`, 404 on npm, while its own description advertises
  `npm create kai@latest`.
- **The `vercel-ai-sdk` docs page teaches the replaced shape.** §12.5. Named by #227 as a follow-up
  and untouched since.
- **`elements/autoloader.ts` has no test at all**, and its CDN-only delivery is the reason a
  straightforward import test does not work. §12.7 item 3.
- **`scenario-assertion-control` is flaky, and the fix that suggests itself is wrong.** It is a CI
  job, not a script: the only job in `.github/workflows/spike-conformance-control.yml`, advisory and
  path-filtered, running the conformance suite inverted so every scenario assertion must go RED
  against a control fixture. The flake is a transient-phase race: the tests wait for
  `html[data-kai-phase="running"]` through `waitForPhase`, which is a plain `waitForSelector` with no
  already-past escape hatch, and `running` is replaced by `done` once a sub-second replay settles.
  The workflow records one occurrence and a re-run of the same commit passed. **Do NOT "fix" it by
  making the wait accept "already past".** That wait is what detects a genuine stall, and accepting a
  terminal phase would make every real stall pass. `retries: 0` is deliberate in that harness for the
  same reason. If it is worth fixing, subscribe to the phase transition rather than polling for a
  state that is transient by construction.
- **The composed-path a11y probe is wired into nothing.**
  `packages/ui/scripts/probe-thread-row-semantics.mjs` reads chromium's real accessibility tree over
  CDP, which is the only way to measure a computed name (jsdom has no accessibility tree). A
  repo-wide grep for its name returns its own usage header, a doc comment in
  `tests/elements/thread-row-speaker.test.tsx` pointing at it, and this document. No `package.json`,
  no workflow. It runs when somebody types it.
- **The direct-render a11y path is now checked structurally and still not executed.** #223 added
  `solidSpeakerSemanticsCheck` over emitted code (§12.1), and #223 itself states the limit: the
  `emitted` vitest project cannot reach Solid, which emits TSX needing `babel-preset-solid` that
  harness has no transform for, so a structural check over emitted code is the strongest evidence
  available and is not equivalent to executing it.
- **The SSR proof is still asserted only in PR bodies.** §11.7 said this and it is unchanged:
  `grep -rn "messagesAttr\|SSR emitted\|messages= attribute"` still returns nothing.
- **Hand-written `.d.mts` files let drift hide from tsc.** Two exist,
  `examples/internal/openrouter-spike/harness/reasoning-coverage.d.mts` and `models.d.mts`. #227 hit
  the failure mode and its commit message states it precisely: tsc checks every caller against
  whatever the declaration claims and never against the implementation, so adding a parameter to the
  function and its call site while leaving the declaration behind is drift the compiler reports at
  the caller and nowhere else. #227 fixed the declaration and then pinned the behaviour with a test,
  which is the right pairing; the class is still open for the other file.

### 12.10 Corrections to earlier sections

**§12.7's heading and opening framing are CORRECTED, and this entry is the odd one on the list.**
Every other correction here, and every one in §9.7 and §11.9, points back at an earlier round. This
one points at this round. §12.7 said the coverage report and the `coverage` block were not on main;
both statements were true at this section's anchor `6afe8a0` and both stopped being true at the very
next commit, when #231 merged as `addfe2d`. The heading is rewritten and the original wording is
quoted inside the marker rather than deleted. Nothing else in §12.7 changed, and nothing else needed
to: `addfe2d`'s parent is `6afe8a0` and its diff touches no source and no test, so the structural
findings were read off a tree identical to the one that now carries the report. **The interval is
the part worth carrying.** `TZ=UTC git show -s --format='%h %ad' --date=iso-local 2344e14 addfe2d`
puts §12's own commit and #231's merge minutes apart, which is the third time this file has gone
stale while being written and by far the fastest. The intro argues that a handoff without a SHA is
unfalsifiable; this is the case for the corollary, that a section written about an OPEN PR is
already carrying a fuse. §12.7, §12.11.

**§11.8 is CLOSED** by #223, and its second derivation still returns nothing. §12.1.

**§11.2's comments were corrected in the tree** by #222, in both directions this document
catalogues. §12.1.

**§11.1's "the queue is empty" is still true and is now the smaller half of the story.** The
framework queue is empty; the (gateway, framework) cell grid is mostly empty in the other direction.
§12.4.

**§11.7 is unchanged.** Neither the SSR probe nor the a11y probe reached CI, and #223 added a check
on a third surface rather than wiring either of them up.

**§6 item 3 is the only survivor of §6.** Re-measuring the timeout budget on a genuinely quiet box,
with `packages/ui/scripts/measure-timings.mjs`. Item 1 shipped at `12a51da` (§11.9) and item 2 shipped
as #204 (§9.7).

**§10's expectation about missing PR numbers has now held four times running.** #209, #214 and #228
were each a held release, not a lost merge.

### 12.11 What this section's commissioning narrative got wrong

Same discipline as §8, §9.8 and §11.10. The narrative was substantially right about structure for
the fourth time, and it was right in the way that matters most: it carried the §12.5 correction
itself, having already caught that #227's blast-radius claim was false, and it asked for that to be
recorded prominently rather than quietly. Everything below is smaller than that.

1. **"19 commits since the last anchor `16c14c2`."** The count is right for that range and the anchor
   is not this document's newest. §11 anchored at `12a51da`; the real delta is nine commits, and ten
   of the nineteen were already written up in §10 and §11. Deriving from the file rather than from
   the summary is what caught it, which is the same instruction the summary itself gave.
2. **"`create-kai` is COMPLETE."** True of the framework table and false of two things a reader would
   assume from the word. Six of the eight ready frameworks declare no route host, so no keyed gateway
   can be wired for them at all (§12.4). And the package is at version `0.0.0`, is absent from
   `release-please-config.json`, and 404s on npm, so the CLI cannot be run by anyone outside this
   repo (§12.2).
3. **"Each was proven by ... observing text stream in a real browser with a clean console, never by a
   green build."** The method is right and the description overstates its reach. It is not what
   `smoke.mjs` does, and that script says so itself. #217's console was clean apart from two known
   benign sources. And §5.6 of this document records one such browser verification driving a leaked
   dev server from a previous run, so the method has failed once and been caught. "Never by a green
   build" is unfalsifiable from the tree.
4. **"Uncovered with reasons re-derived each run."** Half right, and the wrong half is the one a
   reader would rely on. The three excluded ids are hardcoded map keys. What is re-derived each run
   is each exclusion's justification, plus the complement check that fails on any unaccounted
   integration. §12.6.
5. **"10 CI guard scripts have neither a unit test nor a `--self-test`; five others already got that
   treatment."** Both figures come from #231's report and both understate. The five is right only if
   you scope to `packages/ui/scripts/` and miss `.github/scripts/spike-ci-guard.mjs`. The ten is a
   named list, not a complete one: at least three more build-gating guards and two others are equally
   unguarded, and no scoping reproduces ten. The recommendation is unaffected. §12.7 item 4.

Two smaller ones, recorded because the wording would mislead rather than because the substance is
wrong. **"`state/stream.ts` has 8 of 31 functions never called"** is exact as a coverage function
count, and it counts function NODES, so a reader expecting 31 named declarations in a short file will
not find them; the delegation-table half of that finding is the durable one and is stated by row name
in §12.7. And **"the coverage report is not on main"** is true and slightly undersells the situation:
neither the report nor the config is on main, so nothing in §12.7 can be reproduced from this tree by
running a command, only by reading the PR.
*(TRUE at `6afe8a0` and FALSE one commit later. #231 merged as `addfe2d`, `6afe8a0`'s immediate
successor, putting both the report and the `coverage` block on main. §12.7 is now reproducible by
command, the one its own report names:
`nx build ui && npm run build:css && npx vitest run --project=unit --project=emitted --coverage`,
from `packages/ui`. The narrative was right when it was written, and the situation it undersold
resolved in the other direction inside three minutes. §12.7, §12.10.)*

---

## Appendix: style note

`docs/superpowers/` is not consistent on em dashes. `HANDOFF-audio-visualizers.md` uses none;
`HANDOFF-model-driven-components.md` and `HANDOFF-composition-hardening.md` use them heavily. **No
script in this repo enforces prose style on handoffs.** The only mechanical em-dash check,
`packages/ui/tests/scripts/rendered-description-style.test.ts`, covers rendered component descriptions
and nothing else, and `apps/docs/STYLE.md` warns against "an em-dash flourish" without banning the
character. This file follows the zero-em-dash precedent, and the ones that remain are inside verbatim
quotes (commit subjects, the Solid starter's title, code) where changing them would falsify a quote.
