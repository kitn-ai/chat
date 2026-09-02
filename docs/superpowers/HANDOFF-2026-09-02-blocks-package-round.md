# HANDOFF 2026-09-02: blocks spec, spike and PR A merged; PR B0 next

Written at the end of the session that specced the blocks package and site, spiked its
riskiest contract question, and executed PR A (the `packages/blocks` move). Read this, then
memory, then the ledgers named below. Nothing here is a plan; it is what happened, what is
open, and what was ruled.

## Where main is

<!-- gate-list: partial -- this is a work ledger (spec/spike/plan/PR), not an enumeration of the CI gate set -->

| Artifact | What | Commit |
|---|---|---|
| Spec | `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` | d65152c2, amended 80500d07 (section 8a), b7a4acb0 (section 8b) |
| Spike report | `docs/superpowers/research/2026-09-02-blocks-contract-spike.md` | 13132c27 |
| Plan (PR A) | `docs/superpowers/plans/2026-09-02-blocks-package-move.md` | 5ec8d5ec |
| PR A | `packages/blocks` (`@kitn.ai/blocks`) squash-merged | fcd1d4ff (#372) |

PR A moved the block sources out of `packages/ui/blocks` and `packages/ui/mcp/blocks` into a
new private, dependency-free package: `packages/blocks` (`@kitn.ai/blocks`, no build, `.ts`
exports) holding `blocks/<id>/`, `src/registry.ts`, `src/forms.ts`, `tests/`. Every consumer
(`packages/ui`, `packages/create-kai`) is on package specifiers, not relative paths across the
package boundary. The two `packages/ui` generators that used to read the blocks directory
directly now read `exports['.'].default` off the package's own `package.json`. `create-kai`
gained three new build guards in `src/build-guards.ts` (`blocksSourceRootProblem`,
`zeroBlocksCopiedProblem`, `missingReuseInputsProblem`) and `scripts/verify-pack.mjs` gained a
`dist/blocks/**` assertion. The dead `dist/agent-tooling/blocks/*.d.ts` emission (a leftover
from the #371 MCP move, never consumed) was removed. The CI `unit` leg now runs
`packages/blocks`'s own typecheck and vitest project (this moved the CI gate count from 48 to
50 -- read the count off `node packages/ui/scripts/lint-gate-parity.mjs`, not off this
sentence, if you need it exact later). `docs/coupling-map.md` §4 gained three new rows: the
`exports['.'].default` path (row + guard), the nx `ui -> blocks` project-graph edge (guard:
NOTHING -- it is cache-invalidation only, nothing asserts it exists), and the four-place
block-directory-walk duplication (guard: NOTHING); its unenforced-list gained items 46 and 47
for the latter two.

Proof that mattered for #372: `npm pack --dry-run --json` for `@kitn.ai/ui` went from 670 to
668 files, and the two-file delta was exactly the removed dead `.d.ts` pair plus a dev-chunk
content-hash rename (the `CONTRACT_BANNER` in the renamed chunk names the new source path, so
the rename is legible, not silent). A `diff -r` of a cold `dist/` against a `main` baseline
matched that same enumerated delta with nothing left over. A second cold build from clean was
byte-identical to the first. The `create-kai` pack file list was unchanged. Every required gate
was green, and the PR's CI was green on the first run.

## Direction, as ruled by the owner (spec section 9, amendments 8a/8b)

- Blocks are not a gallery. `/blocks` is a section of `ui.kitn.ai`; the block sources live in a
  package, the docs site is the app that renders them. Don't conflate "where the sources live"
  with "where they're browsed."
- shadcn is a layout template for the blocks page, not a parity target -- don't chase its CLI
  or registry shape as a goal in itself.
- Framework picker on the blocks page covers the six docs frameworks. Sticky global framework
  choice (persists across page navigation, not per-block).
- Typed React wrappers use real prop names (`onSubmit`), never a `onKai*` DOM-event-shaped
  escape hatch.
- One framework-neutral source per block; every framework's tree is GENERATED from it, never
  hand-authored per framework.
- Install roots are `components/<id>`; the path a consumer sees displayed in the docs UI is
  exactly the path that gets written to disk -- no "trust me" mismatch between preview and
  install.
- The block contract (what a framework-neutral source file may express, since every tree is
  generated from it) gained, in this round: `:attr` and `#ref` binding forms, `*for` +
  `:key` for keyed lists, `seed:attr` for static seed attributes, identifiers rather than
  arbitrary expressions in bindings, `.textContent` as a bindable, refs exposed as a getter
  (not a raw value, so a consumer can read it after mount), and an explicit
  registration-plus-`whenDefined` sequencing rule for custom elements used inside a block.
- Preview source switch: `KAI_BLOCKS_KIT=local` selects the local kit build over the published
  one, for the authoring loop.
- The authoring loop itself: a block-driver `serve.mjs` alongside the docs dev server running
  in local mode -- author a block, see it live against the local kit, without a publish round
  trip.
- The CDN form of a block goes through an esbuild transform compile step (the framework-neutral
  source is not itself valid browser JS).
- PR B was split in two by the owner: **PR B** covers html/react/cdn; **PR B2** covers
  vue/svelte/angular/solid. Sequence is B before B2 so the riskier, more scaffolded frameworks
  (Vue's type-checking story, Svelte's compiler) come second once the contract has shipped once
  for real.

## The spike (docs/superpowers/research/2026-09-02-blocks-contract-spike.md, 13132c27)

Verdict: **the seam holds.** The framework-neutral-source-to-generated-tree design survives
contact with a real two-way binding case (two refs, both wired to navigation methods) with
one-call adapters in both React and Vue -- no framework needed a second escape hatch beyond
what the contract already proposed.

Four kit-side defects were found that gate PR B (fix them first, in PR B0):

- **F-8**: the generated React wrappers don't forward `slot`, `hidden`, or clear a prop back to
  its default when the caller passes `undefined` -- all three matter for a block that composes
  kit elements inside slots.
- **F-5**: `readViewEntry` and `kai-tab-bar` read state off an HTML *attribute* where they
  should read the live *property* -- silently stale after a property-only update.
- **F-9**: `gen-element-react`'s generated ref type is untyped (an unconstrained forwarded
  ref), which defeats the point of typed wrappers for exactly the case (`#ref`) the new block
  contract just added.
- **F-10**: `ConversationSummary` is missing a re-export a generated consumer needs.

Toolchain findings: the Vue cell needs `vue-tsc` (not plain `tsc`) to catch anything, and a
"planted defect" self-test is required for it -- without a `GlobalComponents` shim, vue-tsc
passes green over code that doesn't type-check anything (green-on-nothing). The React cell
needs a runtime test, not just a type-check, because React's typed-wrapper contract (prop
names, `onSubmit` vs `onKai*`) is a behavioral claim, not just a shape one.

## Sequence now

PR A is merged. Next, in order:

1. **PR B0** -- the four kit fixes above (F-5, F-8, F-9, F-10), each with a test, then
   regenerate the React wrappers off the fixed generator. Small and mechanical; no new design.
2. **PR B** -- html/react/cdn blocks, against spec sections 3, 8a, 8b.
3. **PR C** -- site `/blocks` section; retires the dev gallery and the `/kit` mount.
4. **PR D** -- the CLI (`create-kai`-style add-a-block flow).
5. **PR B2** -- vue/svelte/angular/solid, once B has shipped once for real.

None of B0 through B2 has its own plan yet. Each needs one before execution.

## Facts PR C will need

All four toolchains already in the repo (the Vite page build, `packages/ui`'s vitest, `create-
kai`'s vitest, and Storybook) resolve a `.ts`-exports pnpm workspace package (`@kitn.ai/blocks`,
shipped with #372) with zero fallback paths needed -- this was proven incidentally by PR A and
is worth carrying into PR C's design rather than re-deriving. The fragile input behind that is
`preserveSymlinks`; it is self-announcing today via three required tests, so a PR C plan should
name which of those three it is relying on rather than assume the property is permanent.

## Deferred from PR A (ticket-worthy, none blocking)

- The reuse-detection regex `/(?:^|\/)(?:packages\/)?blocks\/src\//` matches any path with a
  `blocks/src/` segment, not only the package's own -- broader than intended, latent false-
  positive risk.
- Nothing asserts `@kitn.ai/blocks` stays a `packages/ui` devDependency; if it's ever dropped,
  the nx cache edge (`ui -> blocks`) silently stops invalidating `ui`'s build on a blocks
  change.
- CI runs `exec vitest run` for the new package's tests rather than its own `run test` script;
  cosmetic today, drifts if the package's test script ever grows flags.
- The block-directory walk is now duplicated across four call sites; a shared loader with an
  injected `fs` would collapse them, but none was blocking PR A.
- `buildRegistryIndex` and `buildRegistryItem` (inside `packages/blocks/src/registry.ts`) have
  no tests of their own inside the new package.
- Two plan-brief defects surfaced during execution, both non-blocking: `verify:artifact-glob`'s
  three-step shape wasn't quite what the brief described, and a scratch grep in one task was
  missing the `docs/superpowers` exclusion (would have false-positived on this handoff's own
  prose had it been written first).

## Open items for the owner (unchanged from the previous handoff)

1. The 159 stale agent worktrees under `.claude/worktrees/` (one holds uncommitted edits;
   deletion is destructive and not done).
2. **#367** (landing-page mobile topics menu) -- still open, still new UI, still waiting on the
   owner to look at screenshots.

## Process notes from this session

- The SDD run for PR A had 9 tasks, each with its own reviewer. Two tasks were BLOCKED and
  resolved by rulings mid-execution: a `TS18003` on an empty `include` array, and a case where
  the repo's existing "states no rule of its own" guard beat the plan's literal `failIf`
  strings -- the plan was written before that guard's actual behavior was rechecked. Two fix
  rounds followed review, plus one final fix wave before merge.
- The mockup artifact "Blocks Page Mock" (published earlier in the session) was the alignment
  tool that preceded the spec -- built to get the owner's eyes on the shape of `/blocks` before
  writing prose about it, per the `story-first-ui-iteration` policy already in memory.
- `gh pr merge --delete-branch` fails to delete the remote branch when run from a worktree: it
  tries to `checkout main` locally to clean up and that checkout has nowhere to go inside a
  worktree, so the remote branch survives the merge. Delete it afterwards with
  `git push origin --delete <branch>`.

## Resume prompt for the next session

See the end of this file.

---

### Resume prompt (paste into a fresh session, from the repo root)

> Read `docs/superpowers/HANDOFF-2026-09-02-blocks-package-round.md` first, then the spec
> (`docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md`, read section 9 and
> amendments 8a/8b last since they're the rulings) and the spike report
> (`docs/superpowers/research/2026-09-02-blocks-contract-spike.md`). State of play: the spec is
> written and ruled, the spike found the seam holds but named four kit-side defects (F-5, F-8,
> F-9, F-10), and PR A (`packages/blocks`, #372) is merged. Nothing past PR A has a plan yet.
> Before doing anything: `git status` (expect clean but for an untracked
> `support-widget.construct.json`, leave it), `git checkout main && git pull`. The next step is
> to brainstorm-lite and then plan **PR B0**: fix the four kit defects from the spike, each with
> a test, then regenerate the React wrappers off the fixed generator -- keep it small and
> mechanical, no new design surface. After B0 lands, plan **PR B** (html/react/cdn blocks)
> against spec sections 3, 8a, and 8b. PR B2 (vue/svelte/angular/solid) comes after B, by the
> owner's own sequencing ruling -- don't fold it into B's plan. The owner has two open items
> listed in this handoff (stale worktrees, #367); surface them once, do not nag.
