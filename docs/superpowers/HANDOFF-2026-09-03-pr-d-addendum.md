# HANDOFF ADDENDUM 2026-09-03: PR D merged (#381); the security ruling and the merge mishap

## 0. Update, later the same day: merged as #381, and two rulings

**Owner ruling on the security finding (section 1): the fix stays, no advisory, no report.** The
vector needs the victim to point `create-kai add` at a source an attacker controls, which is the
same trust decision as installing any package, and the owner's words were that people "have to be
smart about where they are installing things from". Do not reopen this. `SECURITY.md`'s stale
supported-versions table is still a small-tickets item.

**#380 closed by mistake; #381 is the merge.** The controller's merge command was piped through
`tail`, so `set -e` never saw the ruleset refuse it (the head was behind `main` after the addendum
push), and the cleanup that followed deleted the remote branch, the worktree and the local branch.
GitHub auto-closed #380 and would not reopen it. The 21 commits were recovered from the dangling
commit `7d88614a`, rebased onto `main` (`1f5b83c6`), pushed, and opened as
[#381](https://github.com/kitn-ai/ui/pull/381) with the same title and body. Three rules from it,
now in memory: never push to `main` between opening a PR and merging it (the ruleset requires an
up-to-date head); never pipe `gh pr merge` through `tail`; delete a branch only after
`gh pr view --json state` says `MERGED`. The SDD workspace went with the worktree; this addendum is
the record of its rulings.

Merged 2026-09-03 as #381, squash `1528bb71`, `feat(create-kai)!:` with the BREAKING CHANGE paragraph from `923d0bb5`; remote branch deleted; worktree `blocks-d` removed. Next: PR B2.


Addendum to [`HANDOFF-2026-09-02-night-run.md`](HANDOFF-2026-09-02-night-run.md), section 3.3,
in the shape of the [PR B](HANDOFF-2026-09-03-pr-b-addendum.md) and
[PR C](HANDOFF-2026-09-03-pr-c-addendum.md) addenda. The night run is still the operating order.

## 1. Read this first

PR D is open: [#380](https://github.com/kitn-ai/ui/pull/380), branch `feat/create-kai-add-targets`,
head `7d88614a`, worktree `.claude/worktrees/blocks-d`. It is NOT merged. The controller stopped on
night-run section 5 item 2, a security-sensitive finding, after fixing it in the branch:

**The whole-branch review found path traversal in `create-kai add` for a fetched block item.**
`blockFromItemJson` accepted any `name` and any `files[].path`; `fileTarget()` concatenates them
raw; `runAdd` writes at `path.join(root, file.path)`. An item JSON with a `name` such as
`../../.git/hooks` and a page path of `pre-commit` wrote outside the project, because the collision
refusal only protects files that already exist. The hole predates this branch (the old `blockDir`
join had the same shape) and is in the published `create-kai` 0.5.0. The fix is in the branch
(`6bddccf3`): one shape rule in `packages/blocks/src/registry.ts` (`SAFE_BLOCK_NAME`, a `..` / leading
slash / backslash / empty-segment refusal for every `files[].path`), applied in `blockFromItemJson`
and `validateBlockManifest`, with a hostile-item test in `packages/create-kai/test/add.test.ts`
watched red on the exit code, the refusal text, and the filesystem (`7d88614a` made the payload
climb past the project so that last assertion can fail).

**What the owner decides:** whether this gets a draft advisory per `SECURITY.md` before or after
the merge, and whether the next `create-kai` release note names it. The controller did not open
an advisory and did not name the vector in the PR body beyond "refuses a fetched item whose name or
file paths would resolve outside the project root". `SECURITY.md`'s supported-versions table is
stale (it names `@kitn.ai/ui` 0.25.x and `create-kai` 0.1.x); a small-tickets item.

**Then the merge**, per the plan's Task 9 Step 4: squash-merge #380 with the title
`feat(create-kai)!: add writes at the blocks targets table, and detects the host framework` and a
body that keeps the BREAKING CHANGE paragraph from commit `923d0bb5` verbatim (react lands in
`src/components/<id>/`, not `src/blocks/<id>/`); then `git push origin --delete
feat/create-kai-add-targets`; pull main; remove the worktree; `rm -rf` the SDD workspace
`.claude/worktrees/blocks-d/.superpowers/sdd/2026-09-03-create-kai-add-targets` goes with it.

CI status at the time of writing: all checks green on the first run (run 33774410059; `test` and `storybook-gate`, the two required contexts, both pass; `unit`, which now carries `verify:add`, took under eight minutes).

## 2. What the branch does

Fifteen task commits plus a six-commit fix wave. In order:

- Task 0: the banked create-kai gallery-word sweep (`chore(create-kai)`), patch file deleted.
- Task 1: `planAdd` writes each rendered file's own `target` through the ONE `renderBlockForm`;
  `blockDir()` deleted; `pr-d-target-mismatch.test.ts` deleted after being watched red. The
  BREAKING commit.
- Task 2: artifact floor, paths AND bytes against `dist/blocks/f/<id>.<form>.json`, resolved through
  Node's resolver, loud on a missing artifact.
- Task 3: the html form ships the README through one shared `renderReadme`; cdn does not.
- Task 4: `add` prints the README it wrote and stops printing `docs` separately when it did.
- Task 5: `FRAMEWORK_SIGNALS` rows name a framework (`preact: null`), `landingForm` derives from
  `FRAMEWORK_BLOCK_FORMS`, ambiguity is answer-based, the fallback is one loud sentence.
- Task 6: every accepted `--form` value driven through the real `runAdd`.
- Task 7: `pnpm --filter create-kai run verify:add`, the packed CLI into one project per detection
  row, bytes matched, react tree compiled against the packed kit, four plants always on.
- Task 8: the gate in the `unit` job with an `~/.npm` cache; two coupling-map rows.
- Task 9: the full gate sweep (all named gates green at `48a91243`) and hygiene.
- Fix wave: the traversal refusal; `scripts/smoke.mjs` derives its expected roots from the table
  (its hand-typed `src/blocks` path was broken by the change and nothing runs it); the react-host
  header no longer claims pinned ranges (carets); the cache key also hashes
  `packages/ui/package.json`; `NPM` honored for installs; installs wrapped with a network hint; the
  coupled `generates no vue tree yet` string marked at both ends; a stale "(verified below)" dropped.

Measured, not typed: Task 7's report records the gate's local wall time (under half a minute cold);
the `unit` timeout was left as it was.

## 3. Rulings I made

In ledger order. Each with what it costs if wrong.

- **D-P1** (pre-flight): the coupling-map clause to replace was the MIDDLE clause, not the end.
  Cost: none.
- **D-T6-a**: the brief's "accepted set is exactly the framework forms plus cdn" test was deleted;
  `FRAMEWORK_BLOCK_FORMS` derives from `BLOCK_FORMS` in the same module, so it could not fail. The
  plan's expected red went from twice to once. Cost: one assertion of a shape nothing needed.
- **D-T7-a**: `verify-add.mjs` removes every temp root it creates (tools install AND the per-leg
  project roots), R12's ancestor separation kept. Cost: none.
- **D-T8-a**: the implementer's extra `gate-list: partial` marker on the plan's File-structure table
  stands; `lint-gate-parity` demanded it once `verify:add` became a gate id. Cost: one comment.
- **D-T8-b**: the cache comment was made true. My first wording ("the workflow's first `~/.npm`
  cache") was itself false; the `construct` job has one. Round 2 says "same shape as the `construct`
  job's". Cost: a comment.
- **D-T9-a**: Task 9 ran only its gate sweep and hygiene; push, PR and merge are the controller's,
  after the review. Cost: ordering only.
- **D-FW-a**: one fix wave took Important 1 to 4 and minors 5, 6, 7, 9; minors 8 and 10 ticketed.
  Cost: a slightly larger wave.
- **D-FW-b**: the security finding is fixed in-branch, pushed, PR opened, CI watched, merge left to
  the owner. Cost: one merge waits.
- **D-FW-c**: the hostile-path test payload climbs three levels so its filesystem assertion can
  fail; one commit by the same implementer, diff read by the controller. Cost: one commit.
- Whole-branch review ran on Fable after Opus returned 529.

## 4. Deferred to the small-tickets round

- `add.ts`: README/docs suppression is all-or-nothing per plan; a per-block check is the honest
  shape (T4 deferral folded in).
- `add.test.ts`: the `--form` loop checks existence only; bytes are covered by the artifact floor.
- `scripts/smoke.mjs` runs in no workflow (coupling map already records it); wire it or delete it.
- A symlink inside the host project lets `runAdd` write through it (host property, predates D).
- `validateBlockManifest` reports a bad bundled path twice.
- `SECURITY.md` supported-versions table is stale.
- `html-form.test.ts` array formatting (cosmetic).

## 5. Process notes

- Two plan-mandated defects were found by task reviews, not by the pre-flight scan: a test that
  could not fail (Task 6) and a temp-dir leak in a 400-line script the plan carried verbatim
  (Task 7). Both were in the plan's own code listings. The scan checks tasks against the tree; it
  does not read a script for exit paths.
- A ruling can be wrong in its wording: D-T8-b told the implementer to write a sentence that was
  false, and the haiku re-reviewer caught it by grepping the workflow. Named checks in re-review
  prompts pay for themselves.
- Opus returned 529 on the whole-branch review; Fable completed it. Sonnet implementers and haiku
  re-reviewers were reliable throughout.

## 6. Resume prompt

> Read this addendum, then the PR C and PR B addenda, then the night run. Decide on the security
> finding in section 1 (advisory or not), then squash-merge #380 with the `feat(create-kai)!:`
> title and the BREAKING CHANGE paragraph from `923d0bb5`, delete the remote branch explicitly,
> pull main, remove `.claude/worktrees/blocks-d`, update memory. Then the queue: PR B2
> (vue/svelte/angular/solid renderers), the pages move to `apps/`, the small-tickets PR (section 4
> here plus both earlier addenda's lists plus #376, #377, #378), the new-blocks round. Each needs its
> own plan, reviewed before execution. Night run section 5 is the only stop list.
