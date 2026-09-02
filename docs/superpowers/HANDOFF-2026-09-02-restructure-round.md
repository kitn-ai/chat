# HANDOFF 2026-09-02: the restructure round (apps, CI split, config consolidation, MCP out of src)

Written at the end of one long session (2026-09-01 evening through 2026-09-02 early morning) so the next one starts cold and correct. Read this, then memory, then the ledgers named below. Nothing here is a plan; it is what happened, what is open, and what was ruled.

## Where main is

Every item below is squash-merged to `main` unless marked OPEN.

| PR | What | Proof that mattered |
|---|---|---|
| #358 | `builder-app`, `theme-studio-app`, `gallery-app` out of `packages/ui/src/` into `packages/ui/apps/`; `theme-tokens.ts` + `theme-payload.ts` into `src/themes/`; `tsconfig.apps.json` in the typecheck chain | tarball delta = only the leaked `dist/*-app/*.d.ts` gone; three served pages byte-identical screenshots |
| #359 | the storybook shards red on `main` since Aug 28 were three REAL a11y defects (list-row role, brand magenta contrast, a demo accent contrast) | `storybook-gate` green for the first time since Aug 28 |
| #360 | releases require `storybook-gate` green too (`require-green-checks.mjs`) | self-test scenario proves a red gate blocks |
| #361 | Storybook link added to the docs topics config | shipped INVISIBLE (see #366) |
| #366 | docs header: nav now derives from `apps/docs/src/topics.mjs`; named breakpoints (`--breakpoint-nav` 75rem, `--breakpoint-chrome` 50rem); search width only >=50rem; duplicate mobile toggle removed | independent verifier, 7 claims PASS at 7 widths |
| #362 | CI split: five legs (`build` · `construct` · `unit` · `dist-guards` · `browser`) behind a `test` aggregator; `lint-gate-parity` derives the gate set from the `needs:` graph; `verify:artifact-glob`; mtime restamp after the artifact hop | required check `test` wall 1690s -> 581s; three watched red runs (failed leg, skipped legs, orphaned gate) |
| #368 | `.nxignore` for `.claude/worktrees/` | preventive |
| #369 | 22 `vite.config.*.ts` -> `config/vite/{lib,react,node,elements,page}.ts` (`KAI_BUILD` dispatch, refusal by name) | `dist/` byte-identical (653 files, 126 hashed chunks) except 4 comment-only d.ts lines |
| #370 | 14 `playwright.*.config.ts` -> `config/playwright/{storybook,bare,cross-origin}.config.ts`; `verify:playwright-projects` zero-match guard | 118 tests / 14 projects unchanged; the guard found a REAL latent defect (below) |
| OPEN #367 | landing-page mobile topics menu on sidebar-less pages below 75rem (`<details>`, gated on `starlightRoute.hasSidebar`) | rebased, MERGEABLE, left open for the owner because it is new UI (show-first) |
| #371 | `packages/ui/src/agent-tooling` -> `packages/ui/mcp/`, 13 tasks, all gates green, packed-tarball smoke proven; MERGED 5784d04d | see "The MCP move" below |

`packages/ui/` root now holds 6 tsconfigs + 4 vitest files and nothing else. `src/` is the library.

## Direction, as ruled by the owner

Spec: `docs/superpowers/specs/2026-09-01-repo-restructure-design.md` (read its last two sections first).

- The felt "heaviness" was three things, none of them "too many tests": apps and the MCP living in `src/`, 46 config files at the package root, and a 26-minute serial CI job with two storybook shards silently red. All three are now fixed.
- Ruled monorepo map: `apps/{docs,builder,gallery,theme-studio}` · `packages/{ui,mcp,blocks,create-kai}`, rule = imported-as-code -> `packages/`, only served/deployed -> `apps/`. BUT the owner then ruled that reorganizing must not make wiring harder, so THIS round keeps the MCP inside the ui package at `packages/ui/mcp/` (the research at `docs/superpowers/research/2026-09-01-mcp-extraction-surface.md` found 37+ plumbing sites and a builder<->construct cycle for a true `packages/mcp`). `packages/ui/apps/` is likewise a waypoint; the pages move to root `apps/` only when their import surface is public. Sequence ruled: CI split -> config consolidation -> ui/mcp -> `packages/blocks` -> pages to `apps/`.
- NOT to re-litigate: no npm-package splitting of the library surface (consumers keep one `@kitn.ai/ui`); Storybook stays where it is; `verify:quarantine` stays first in `typecheck`; `dedupe:shiki`'s position is untouched.
- Parked by the owner: the builder's `resolveContrastForeground` white-preference heuristic (prefers white above luminance 0.5 vs the true 0.179 crossover; hands `#a78bfa` white at 2.72:1).
- Queued, its own brainstorm: consumer onboarding / "legos + AI-agent assemblability" (docs surface, framework-native feel, widget-in-app). The owner's deeper concern; repo structure neither fixes nor blocks it.

## The MCP move (feat/mcp-out-of-src)

Plan: `docs/superpowers/plans/2026-09-02-mcp-out-of-src.md`. Ledger: `.superpowers/sdd/2026-09-02-mcp-out-of-src/progress.md` (gitignored; if it is gone, the commits on the branch and the PR body are the record).

State at handoff: Tasks 1-12 done and reviewed (each task had its own reviewer; two fix rounds: Task 4 restored a paraphrased header verbatim, Task 12 fixed the coupling map's own summary). Task 13 ran every gate green (unit 415 files / 5929 tests, emitted 36, scaffold 705/705, consumer 95/95, construct 113 cells, pack 670, docs 126 pages) and proved the published artifact from a throwaway install: `npx @kitn.ai/ui mcp` answers `initialize` and lists the tools; `dev --builder` serves the three pages with the pre-move asset hashes; `component_reference kai-chat` returns 51 KB from an install with no `mcp/` directory. PR: https://github.com/kitn-ai/ui/pull/371.

The contract this branch holds, and the one number to check first: `npm pack --dry-run --json` file list identical name-for-name to `main` (670 files), and `diff -r` of a cold `dist/` against a `main` baseline shows exactly: `dist/construct-cli.es.js` (2 statements: the source-checkout marker path and the stale-dist scan now walking `mcp/`), `dist/mcp.es.js` (5 statements + 2 error messages: `SOURCE_TO_PACKAGE_ROOT`, its message, 3 catalog corpus paths), and 4 comment lines across `dist/agent-tooling/blocks/registry.d.ts`, `dist/components/builder-panel.d.ts`, `dist/themes/theme-tokens.d.ts`. All consumer-invisible: `resolveManifestPath` (`mcp/mcp/manifest.ts:169-179`) returns on the shipped sibling `custom-elements.json` before the source-only constant is read.

Things the move found that the research had missed:
- A 38th plumbing site: four (really three) shipped `dist/components/*.d.ts` import `'../agent-tooling/construct/*.js'` by relative depth, which only worked because src and dist depths matched. `config/vite/lib.ts`'s `beforeWriteFile` hook rewrites the specifier and throws on an unknown depth; `verify:dts` (`scripts/verify-dts-boundaries.mjs`) is the after-the-fact backstop.
- `tsconfig.mcp.json` narrows to `mcp/mcp/**` (Node-only pass), not `mcp/**`: `catalog/surfaces.test.ts` imports DOM elements and `codegen-cards.render.test.tsx` is Solid JSX.
- The inner directory keeps its name (`packages/ui/mcp/mcp/`) for byte-identity this round.
- 13 self-referencing path literals, not 12 (`mcp/mcp/tools/theme.ts:66` inside an error template).
- `local-kit.ts`'s stale-dist scan had silently stopped covering the MCP sources; restored.
- `theme.css:113` still names `src/agent-tooling` ON PURPOSE: that comment inlines into the content-hashed `dist/theme-studio/assets/index-*.js`, and fixing it renames a shipped file. Fix it in a release that already touches that asset.

## Open items the owner must decide

1. **The 159 stale agent worktrees under `.claude/worktrees/` (217 GB).** Only one holds uncommitted edits. Deleting them is destructive; not done. `.nxignore` (#368) keeps NX out of them. Suggested: `git worktree list`, keep the one with edits, `git worktree remove` the rest.
2. **#367** (landing-page mobile menu): merge if the screenshots in the PR look right. Known gap it does not cover: below 50rem the landing page has no theme toggle or social icons (Starlight puts those in the drawer footer, which splash pages lack).
3. (done) PR #371 merged as 5784d04d after a clean whole-branch review and a three-minor fix wave; `packages/ui/src/` no longer contains `agent-tooling`.

## Follow-ups worth a ticket (none blocking)

- `verify:fresh` is red on `main` for a pre-existing reason (11 postbuild outputs not in `GENERATED_SOURCES`); not CI-wired.
- The `audio-visualizer` playwright suite is red on `main` (Check 7 deterministic; Checks 8/9 flake); it now has an `npm` script but must NOT be CI-wired until fixed. Its header claims 2x screenshots; that was never in effect (the device descriptor won); the consolidation kept 1280x720@1x.
- `tsconfig.tests.json` covers `mcp/tests/**/*.ts` but not `.tsx` (none exist today).
- `MIN_RUN_STEPS` / `MIN_CONFIGS` / `RUNTIME_CACHES` / the restamp path `packages/ui/dist` are hand-typed twins of derived facts (each carries a written reason).
- `continue-on-error` is invisible to the gate linter and the aggregator; nothing uses it, but hard-failing on it inside the required graph would close the hole.
- Storybook used to inherit the root `vite.config.ts` implicitly; it no longer exists and nothing pins that (recorded in `docs/coupling-map.md`; `docs/superpowers/specs/2026-08-30-live-construct-runtime.md:173` proposes recreating a root vite config, which would silently re-feed it).
- A cheap lint for absolute `/private/tmp`, `/tmp/claude`, `/Users/` literals in tracked source: an earlier agent committed one into `tests/e2e/audio-visualizer-ivp.spec.ts`; it was dormant on macOS and broke the Linux runner the first time a CI step loaded that spec (failure mode #17 in memory).
- Docs site: `nx build docs` is the only guard on the docs' deep import of `apps/theme-studio`, and it runs on deploy, not in the required `test` job.
- Next CI lever: shard the `unit` leg (`--shard=1/2`), with a reported-test-count assertion so an empty shard cannot pass.

## Process lessons from this session (already in memory)

- The controller is a concurrent writer too: never `git checkout` in the main checkout while an agent works there; controller docs commits to `main` go through a temp worktree (`git worktree add <dir> origin/main -b tmp`, commit, `git push origin HEAD:main`, remove); verify with `git merge-base --is-ancestor`. An agent dispatched without `isolation: "worktree"` committed on shared `main` and orphaned a spec commit for a day.
- The `main` ruleset has `strict_required_status_checks_policy`: `gh pr merge` is refused when the branch is behind; run `gh pr update-branch` first (one more CI cycle).
- Scratchpad paths are for scratch only; every agent brief must say so.
- Never pipe a build through `tail` in an `&&` chain (it swallows the exit code); run heavy suites as separate short commands; the box had a 7-day-old `nx run-many -t dev` from another project pinning a core (killed by the owner's request).

## Resume prompt for the next session

See the end of this file.

---

### Resume prompt (paste into a fresh session, from the repo root)

> Read `docs/superpowers/HANDOFF-2026-09-02-restructure-round.md` first, then `MEMORY.md`'s "Repo restructure 2026-09-01" and "CI time profile 2026-09-01" entries. State of play: the restructure round is DONE and merged (#358, #362, #369, #370, #371); only #367 (landing-page mobile menu, new UI) is open, waiting on the owner. Before doing anything: `git status` (expect clean but for an untracked `support-widget.construct.json`, leave it), `git checkout main && git pull`. The next ruled item is `packages/blocks` (block sources + registry/forms consolidated out of `packages/ui/blocks` and `packages/ui/mcp/blocks`), which has NO design yet: brainstorm it (architectural path), write the spec, then the plan, then execute subagent-driven with a reviewer per task. Operating rules that bit this session: never `git checkout` in the main checkout while an agent works there; any committing agent gets `isolation: "worktree"`; scratchpad paths never go into committed files; run heavy suites as separate short commands; the `main` ruleset refuses merges when the branch is behind. The owner also has three decisions listed in the handoff (stale worktrees, #367, the mcp PR); surface them once, do not nag.
