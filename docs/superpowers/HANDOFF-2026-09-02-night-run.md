# HANDOFF 2026-09-02 (night): the blocks night run, PR B through the new-blocks round

**This is an operating order, not a status report.** The owner clears the session after the PR B
plan is committed and is away overnight. You are the controller for an unattended run: execute PR
B, then C, D, B2, the pages move, a small-tickets PR and a new-blocks round, one after another,
merging each without stopping. Section 5 is the only list of reasons to stop.

Read this file, then the previous round's handoff,
[`HANDOFF-2026-09-02-blocks-package-round.md`](HANDOFF-2026-09-02-blocks-package-round.md). That
file carries what PR A and PR B0 actually did, the four spike defects, the deferred tickets and
the process notes. Nothing here restates it.

---

## 1. State of main

Every path below was checked to exist at the time of writing.

<!-- gate-list: partial -- a work ledger of specs/plans/PRs, not an enumeration of the CI gate set -->

| Artifact | Path | State |
|---|---|---|
| Spec | `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` | on main; sections 8a and 8b are the amendments, section 9 the rulings |
| Contract spike | `docs/superpowers/research/2026-09-02-blocks-contract-spike.md` | on main |
| PR A | `packages/blocks` (`@kitn.ai/blocks`) | merged, #372 |
| PR B0 | four kit fixes, breaking ref type | merged, #373, `fix(react)!:` with a BREAKING CHANGE footer |
| #367 | landing-page mobile topics menu | merged |
| PR B plan | `docs/superpowers/plans/2026-09-02-blocks-pr-b-authored-contract.md` | 13 tasks, 22 rulings |
| Older spec still in play | `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md` | Part 2 (block candidates) and Part 3 (the CLI) |
| Restructure spec | `docs/superpowers/specs/2026-09-01-repo-restructure-design.md` | "Owner eval of Step 1" is the pages-move ruling |

**The PR B plan is committed by the controller immediately after this handoff.** It was not yet on
main when this file was written. If it is missing when you start, STOP and say so: do not write a
replacement plan from the spec, because 19 rulings were made against it that are not recoverable
from the spec text.

**Worktree, already prepared.** `.claude/worktrees/blocks-b`, branch
`feat/blocks-authored-contract`. The three-step prep is done: install, `build:css`
(`packages/ui/src/elements/compiled.css` present), and a cold build
(`packages/ui/dist/custom-elements.json` present). Confirm all three in pre-flight anyway; a
missing one reads as a broken checkout, which has cost three agents a session each. CLAUDE.md
explains why in full.

---

## 2. The process, verbatim from the last two rounds

Do not improvise a lighter version of this because the run is long. The two rounds that produced
#372 and #373 used exactly this, and both went green on the first CI run.

**Per PR.**

1. **Plan review before execution.** Every plan gets an independent adversarial review against the
   tree, on a capable model, before a single task runs. Apply its findings to the plan and commit
   that. Plans have been wrong about the tree twice in this project (a guard's real behavior, an
   empty `include` array) and both were caught here, not in code.
2. **Worktree.** The controller prepares it: branch, install, `build:css`, cold build. Each PR gets
   its own. **The controller never checks out in the main checkout while an agent is working
   there.**
3. **Execute with superpowers:subagent-driven-development**, per the plan. Ledger under
   `.superpowers/sdd/<plan-slug>/`. Use the skill's `scripts/task-brief` to cut each brief from
   the plan. A **fresh implementer per task**, model chosen to the task's size. A **reviewer per
   task**, always a different agent from the implementer.
4. **Fix rounds** with re-reviews scoped to the fix, not the whole task.
5. **Whole-branch review** on the most capable model when every task is done. Then **ONE** fix
   wave off it. Not two: if the wave's output needs its own wave, that is a signal the branch is
   not ready, and you rule on it rather than looping.
6. **Push, open the PR, watch its checks** (`gh pr checks --watch`). Squash-merge with a
   conventional title. When a review rules a change breaking, the title carries `!` and the body a
   BREAKING CHANGE footer; pre-1.0 that is a minor bump, which is correct and expected.
7. **Delete the remote branch explicitly** (`git push origin --delete <branch>`). The `gh pr merge
   --delete-branch` flag fails from a worktree: it tries to check out main locally to clean up and
   has nowhere to go.
8. **Pull main, remove the worktree, update memory, commit a handoff addendum to main** through a
   temporary worktree, never by checking out main in the shared checkout.

**Standing rules that bind every task in the run.**

- Every new guard is **watched failing first**. A check that cannot fail is the dominant failure
  mode in this repo and it is documented at length in memory.
- **Visual acceptance is measured against a reference, and the supervisor personally reads the
  screenshots.** Four owner-caught eyeball-misses earned this rule. An agent reporting "looks
  right" is not acceptance.
- **The final-gate list mirrors CI's `test` job**, read from the workflow, never typed from a
  previous handoff. `node packages/ui/scripts/lint-gate-parity.mjs --list` prints it.
- No scratchpad paths in tracked source. No absolute agent paths in commits.
- Heavy commands are never piped through `tail`; you lose the failure.
- No em dashes anywhere, prose or code comments. `apps/docs/STYLE.md` is the voice.
- No number in a doc that a script can produce. Name the command instead.

---

## 3. The queue

Seven items, in order. Each needs its own plan (except PR B, which has one), each plan reviewed
before execution, each merged before the next starts.

### 3.1 PR B: the authored contract, html/react/cdn

Plan exists: `docs/superpowers/plans/2026-09-02-blocks-pr-b-authored-contract.md`. Spec sections
3, 3.1 through 3.5, 8a, 8b. This is the only queue item you do not plan yourself.

Carry into it the two PR-B items the previous handoff parked: the wider F-5 class (eight
attribute-only declarative-child readers under `packages/ui/src/elements` still read an attribute
where they should read the live property: conversation-list, chain-of-thought, composer,
model-switcher, message, prompt-input, prompt-suggestions, message-skills), and the four PR-A
deferrals if the plan already names them.

**Eval gate:** `verify:blocks` with its `--self-test`, plus the new compile cells (blocks x
frameworks) through `packages/ui/scripts/lib/consumer-tsc-projects.mjs`, plus the React runtime
cell. Read the cell counts the gate prints; do not write one down.

### 3.2 PR C: the `/blocks` site section

Spec sections 4, 4.1 and 2.5. Write the plan first.

- `/blocks` lands on `apps/docs`, the deployed site. The viewer is built from kai components as a
  Solid island. `@astrojs/solid-js` and `unplugin-icons` are already registered in
  `apps/docs/astro.config.mjs`, and `apps/docs/src/components/` is full of `.tsx` islands, so this
  is the site's existing idiom.
- **Two frameworks only in the dropdown after PR B: HTML and React.** The dropdown lists
  frameworks that are generated AND gate-compiled, never one the renderers do not emit. This is the
  create-kai menu-honesty precedent.
- **The registry is static files the site serves:** `/blocks/registry.json` and
  `/blocks/r/<id>.json`. The site build copies the generated artifacts into `public/`; it does not
  regenerate them.
- **Preview switch:** `KAI_BLOCKS_KIT=local` loads the kit from `packages/ui/dist` for the dev
  server and PR-preview builds. Unset, production, the iframe runs the CDN pin. The footer says
  which one in words. A test asserts the production build carries the CDN URL and no local kit
  path.
- **Each card's add command is derived from that card's own id.** The mockup had a copy-paste
  defect where every card printed `support-widget`. Pin it with a test rendering more than one card
  and asserting the commands differ.
- **Framework choice is global and sticky**, `localStorage`, read and written inside `try`/`catch`.
- **Retire the predecessor:** `packages/ui/apps/gallery`, the `dist/gallery` build target,
  everything under `/gallery`, and the `/kit/` CORS mount in `packages/ui/mcp/construct/dev.ts`.
  The block driver's own `/kit/` mount at `packages/ui/scripts/block-driver/serve.mjs` STAYS; it is
  a different mount. Retiring the gallery removes a page from the ui tarball, so amend the
  pack-weight ledger row in `packages/ui/scripts/verify-pack-weight.mjs` with the measurement read
  off the tool.
- Spec 2.5 leaves one OPEN with a recommendation: `kai dev` keeps no blocks route at all. Take the
  recommendation.
- The previous handoff's "Facts PR C will need" section covers workspace-package resolution and the
  `preserveSymlinks` fragility. Name which of the three required tests the plan relies on.

**Eval gate:** the site build, the production-versus-local preview assertion, the per-card
add-command test, and a visual pass on the page with screenshots the owner can read in the morning.

### 3.3 PR D: the CLI

The 2026-08-31 spec's Part 3, plus spec section 3.4 (the targets table). Write the plan first.

- **`blockDir()` moves to the targets table.** It lives at `packages/create-kai/src/blocks.ts:285`
  today and writes React blocks to `src/blocks/<name>`; the ruled root is `src/components/<id>/`.
  PR B lands a mismatch test that goes red when the CLI still disagrees with the table. **Moving
  `blockDir()` makes that test red for the right reason, so delete it in the same PR** and say so
  in the commit body. A test kept alive past the mismatch it guarded is worse than no test.
- Detection rows for existing project forms: the CLI detects the host framework from the project,
  emits typed React wrappers for React, plain web components otherwise, and the self-contained CDN
  form with no project. Ambiguous asks loudly.
- README printing: each emitted tree carries the two or three line README the renderers produce
  (what the block needs, plus the one framework-config line where there is one).
- `add` keeps announcing its target and keeps refusing to overwrite. The whole-plan collision
  refusal in `packages/create-kai/src/add.ts` is unchanged.

**Eval gate:** create-kai's own vitest including `menu-honesty.test.ts`, the pack-file assertion,
and a real `add` into a throwaway project of each detected form.

### 3.4 PR B2: vue, svelte, angular, solid renderers

Spec sections 3.5, 3.6 and 5.1. Write the plan first.

- **Spec 3.6 is OPEN with recommendation (a): take (a).** The Solid renderer emits the custom
  element with `prop:` and `on:` for any element with no Solid component, and the kit-fix backlog
  gets an item for the missing exports. Re-derive the gap at implementation time by running
  `packages/ui/scripts/verify-solid-coverage.mjs --json` rather than trusting the spec's table, and
  note that the guard grades writable equivalence, which is weaker than "there is a component with
  this name to put in a generated tree."
- **`vue-tsc` IS the vue cell**, not a supplement to a `default`-project pass, and it needs a
  planted-defect self-test: without a `GlobalComponents` shim it passes green over code that
  type-checks nothing.
- **Svelte, Angular and Solid are compile-only cells, and the gate says so in its own output.** A
  cell that compiles and proves nothing about behavior must not read as a behavioral pass.
- Adding these four frameworks moves the compile cell count and the site dropdown together, because
  both derive from the forms list. Neither is typed. Confirm the dropdown grew without editing the
  dropdown.

**Eval gate:** the compile cells with their printed axes, the vue-tsc planted-defect self-test
watched failing, and the dropdown assertion.

### 3.5 The pages move to `apps/`

`docs/superpowers/specs/2026-09-01-repo-restructure-design.md`, the "Owner eval of Step 1" section.
Write the plan first.

- `packages/ui/apps/builder` and `packages/ui/apps/theme-studio` move to the root `apps/`. **The
  gallery is already retired by PR C, so it does not move.** The ruled map lists it; PR C makes
  that row obsolete, and the plan should say so rather than move a directory that no longer exists.
- Apps import `@kitn.ai/ui` through its public exports via `workspace:*`.
- The pages keep shipping inside `@kitn.ai/ui`: each builds to its own `dist/`, and a ui assembly
  target that depends on those builds copies the output into
  `packages/ui/dist/{builder-page,theme-studio}`. Guarded by `verify:pack`.
- `kai dev` does not change.
- Step 1's relative-import cleanup and `tsconfig.apps.json` carry over.

**Eval gate:** `verify:pack` (the assembly copy is the whole risk), a cold build compared against a
main baseline the way PR A did it, and `kai dev --builder` serving both pages.

### 3.6 The small-tickets PR

One PR, several small independent fixes. Write a plan; keep it flat, one task per ticket.

<!-- gate-list: partial -- a ticket list, not an enumeration of the CI gate set -->

| Ticket | What |
|---|---|
| `verify:fresh` red on main | `packages/ui/scripts/verify-artifact-fresh.mjs`. Fix the cause, not the assertion |
| audio-visualizer playwright suite | `test:audio-visualizer` is red and is not wired into CI. Fix it, then wire it, or state honestly why it stays out |
| absolute scratch paths | Lint tracked source for absolute agent scratchpad paths. One was committed once; failure mode #17 in the verification-lessons memory |
| `resizable.tsx:634` | The `hidden` JSDoc is now false for React consumers after PR B0. Two more copies: `element-meta.json` and the labs story |
| the wider F-5 class | Eight attribute-only readers under `src/elements`. If PR B already took them, this row is done and the plan says so |
| shard the unit leg | With a **reported-test-count assertion**, so a shard that silently runs nothing is a red, not a fast green |
| B0 residual: disconnected first apply | Capture the snapshot on a disconnected first apply; `el.isConnected` is the close condition |
| B0 residual: resizable-item | `hidden` seeding the snapshot |
| B0 residual: view-stack observer note | Overstates its claim; the stack resolves by name |
| B0 residual: runtime.tsx comment | The self-registration comment is stale |
| docs `guides/frameworks/react.mdx` | Lacks a wrapper-ref snippet, which PR B0 made worth having |

**Eval gate:** the full required job, plus each new guard watched failing first.

### 3.7 The new-blocks round

Read the memory file `new-blocks-round-inventory.md` in the memory dir, and the 2026-08-31 spec's
Part 2. Write the plan first. Three blocks the owner named: **desktop assistant**, **aside**,
**voice assistant**.

- Each block is a **hand-written authored source rebuilt on `kai-` tags from its reference**. The
  references are the Labs/Apps Storybook stories in `packages/ui/src/elements/*.stories.tsx`, and
  the demos under `/Users/home/Projects/kitn-ai/demos/`, which are **outside this repo and are
  CONVERTED, never copied**. No framework code comes across; the conversion target is the authored
  contract.
- Every block ships a **scripted mock or demo mode** and **one connection point**. A block is a
  complete runnable composition, not a working product: the kit provides the UI and the ability to
  connect. **It never provides a server.**
- **Desktop assistant** comes from the split-workspace and claude-code-style stories. **Aside** is
  the in-app-assistant variants.
- **Voice needs a `wire/` realtime adapter first.** `packages/ui/src/wire/` has none today;
  `readRealtimeEvents` does not exist and wire is text and model-stream only. Design it bounded: a
  protocol-neutral event reader over transcript, partial, turn and audio level, encoded from RTVI
  or an Inworld WebSocket **by the consumer**. If that cannot be done honestly inside this round,
  **the voice block ships demo-mode-only and gated**, which is what the 2026-08-31 spec already
  anticipated.
- **STANDING RULE, owner, stated "overly clear":** every block, new ones included, ships **every
  framework tree the generator supports at that point** (html/react/cdn after B, all six after B2),
  each gate-compiled, React runtime-tested, **nothing hand-authored per framework**. A form the
  gate cannot compile is **withheld** from the dropdown.

**Eval gate:** `verify:blocks` per new block including its driver baseline, the compile cells for
every framework the block claims, the React runtime cell, and measured visual acceptance against
the reference with screenshots saved for the owner.

---

## 4. Rulings that bind the run

These are the owner's, already made. They are not open questions and you do not relitigate them
overnight.

- **Blocks, never gallery.** Everywhere, in code and prose.
- **The sources are a package; the site is the app over it.** `packages/blocks` holds sources and
  registry; `apps/docs` renders them. Do not conflate where sources live with where they are
  browsed.
- **shadcn is a layout template for the blocks page, not a parity target.** Do not chase its CLI or
  registry shape as a goal in itself.
- **Install roots are `components/<id>` under each framework's source root**, from ONE targets
  table, and **the path the site displays is the path `add` writes, byte for byte.**
- **Typed React wrappers with real prop names** (`onSubmit`), derived by `gen-element-react.mjs`'s
  `onName` rule. There is no `onKai*` form; the 2026-08-31 spec said there was and it was wrong.
- **One framework-neutral source per block; every framework tree is generated from it.**
  Hand-written trees are throwaway generator targets only.
- **Two frameworks first, then widen.** B before B2, so the riskier toolchains come second once the
  contract has shipped once for real.
- **Long run to the end. Do not stop at merges.** Section 5 is the whole stop list.
- **Pre-1.0, a breaking change is a minor bump** via `!` in the title plus a BREAKING CHANGE
  footer. Do not avoid a correct breaking change to keep a patch.
- **An example or app that duplicates a block becomes that block's host.** The examples need TLC,
  not production-readiness. That is a round after blocks, not part of this run, unless a block
  needs its host moved to ship.

---

## 5. When to STOP anyway

These are the only reasons. Anything else, you decide and keep going.

1. A **destructive or irreversible action outside the plan** would be required: deleting user data,
   force-pushing main, publishing to npm.
2. A **security-sensitive finding**.
3. A **plan so broken that every path forward is a guess**. Not "the plan is wrong about a file";
   that is a ruling you make (section 6). This is "the plan's premise does not hold."
4. **A review or a gate contradicts an owner ruling.** The ruling wins, and the owner needs to know
   the gate disagrees before you weaken either.
5. **A required CI check red twice on the same cause after a fix.** Once is a fix. Twice on the
   same cause means you do not understand it.

**On a stop:** write the handoff addendum, leave the branch pushed and the PR open, and say exactly
what is blocked in one paragraph. Do not close the PR. Do not revert merged work to get to a clean
state.

---

## 6. Decisions to make yourself overnight

Nobody is awake. Make these and record them in the addendum.

- **Plan-versus-tree conflicts: the spec wins**, and the plan gets amended in the same commit that
  notices. If spec and tree conflict, the spec is the intent and the tree is the fact; say which
  one you followed and why.
- **Fix-round rulings.** Both previous rounds needed them mid-execution. Rule, record the ruling
  number in the ledger, continue.
- **Deferring minors.** A finding that is real but not blocking goes on the next round's ticket
  list rather than growing the PR. Say so in the PR body.
- **Model choice per task.** Size the model to the task; the whole-branch review always gets the
  most capable one.
- **Re-recording driver baselines** under the R4 procedure when a legitimate change moves them.
  **Save the screenshots and list their scratch path in the addendum** so the owner reads them in
  the morning. A re-recorded baseline with no screenshot for the owner is an unverified claim.
- **Whether a block's Solid form falls back to custom elements** (spec 3.6 option (a)) for a
  specific element. Take the fallback; do not withhold the framework.

---

## 7. Resume prompt

Paste this into the fresh session, from the repo root.

<!-- gate-list: partial -- a resume prompt, not an enumeration of the CI gate set -->

> Read `docs/superpowers/HANDOFF-2026-09-02-night-run.md` in full. It is an operating order for an
> unattended overnight run, not a status report. Then read the two memory entries it depends on:
> **Blocks direction 2026-08-31** and **New-blocks round inventory**, in the memory dir. Then check
> `git status` (expect clean but for an untracked `support-widget.construct.json` at the repo root,
> leave it) and `git pull`.
>
> Pre-flight, before any work: confirm
> `docs/superpowers/plans/2026-09-02-blocks-pr-b-authored-contract.md` is on main (if it is not,
> STOP and say so, per section 1). Confirm the worktree `.claude/worktrees/blocks-b` exists on
> branch `feat/blocks-authored-contract` and is built: `node_modules` present,
> `packages/ui/src/elements/compiled.css` present, `packages/ui/dist/custom-elements.json` present.
> Rebuild what is missing before starting, and use `--skip-nx-cache` if a build reports success
> without producing the artifact.
>
> Then execute the queue in section 3, in order, without stopping: PR B, PR C, PR D, PR B2, the
> pages move, the small-tickets PR, the new-blocks round. Use the process in section 2 verbatim for
> every one: independent plan review before execution, subagent-driven-development with a fresh
> implementer and a separate reviewer per task, a whole-branch review, one fix wave, push, watch
> CI, squash-merge, delete the remote branch explicitly, remove the worktree, update memory.
> **Write a handoff addendum to main after each merge**, through a temporary worktree.
>
> Section 5 lists the only reasons to stop. Section 6 lists what you decide yourself. Section 4 is
> the owner's rulings and they are not open.
