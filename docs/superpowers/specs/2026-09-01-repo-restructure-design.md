# Repo restructure — apps out of `src/`, the MCP toward its own package

**Date:** 2026-09-01 · **Status:** approved (owner, in-session) · **Path:** architectural, executed as baby steps with an eval gate between them

## Problem

The project feels heavy. `packages/ui/src/` mixes the shipped library (elements, components, primitives, ui, state, wire, stores, schemas, diagnostics, remote) with things that are not the library: three standalone dev apps (`builder-app`, `theme-studio-app`, `gallery-app`) and a 2.1M MCP server (`agent-tooling`). The owner's words: "I go into this package when I want to work on XYZ" — the tree should answer that. Tests are slow and some fail; that is a separate investigation, not assumed to be structural.

**Explicitly ruled out:** splitting the shipped library surface (`state`/`wire`/`stores`/`schemas`/…) into separate npm packages. Consumers keep ONE `@kitn.ai/ui` with subpath exports; any internal package split must preserve that. Also ruled out (Approach B in discussion): full internal decomposition of the kit's guts — `elements`/`components`/`primitives`/`ui` are one tightly coupled thing and stay one package.

## Step 1 — move the three dev apps out of `src/` (this round)

- `packages/ui/src/builder-app` → `apps/builder`
- `packages/ui/src/theme-studio-app` → `apps/theme-studio`
- `packages/ui/src/gallery-app` → `apps/gallery`

Each app keeps its vite config, moved alongside it (`packages/ui/vite.config.builder-page.ts`, `vite.config.theme-studio.ts`, `vite.config.gallery.ts` today). Apps import the kit as a workspace dependency or source alias — whichever the moved vite configs make cheapest, decided in the plan, with the constraint that `pnpm dev`-style iteration against kit source keeps working.

**The one real coupling stays behind:** `src/theme-studio-app/theme-tokens.ts` is a data catalog imported by `src/agent-tooling/construct/theme-token-policy.ts` and `tests/styles/theme-studio-coverage.test.ts`. It moves to `packages/ui/src/themes/theme-tokens.ts` (new folder), both importers updated, and `apps/theme-studio` imports it from the kit.

**Known reference sites to update** (found by grep, re-grep during execution):

- `tests/styles/shadow-sheet-scan.test.ts` — skip-list entries for `theme-studio-app` / `gallery-app`
- The pack/gate `NOT_SHIPPED_DIRS` list (gallery-app joined it in f9b2d81b) — moving the dirs out may let entries be deleted; the pack ceiling should be re-checked, not assumed
- `tests/styles/theme-studio-coverage.test.ts` — import path (the test itself stays in the kit; it guards `theme.css` ↔ token-catalog parity, both kit-owned)
- `apps/docs` Tailwind `@source` pointing at the theme-studio app
- Story/comment references (`builder-header.stories.tsx`, `builder-derived-panel.stories.tsx`, `components/builder-header.tsx`, `agent-tooling/construct/schema.ts`, `templates.ts`)

**Verification:** the full gate set — `nx typecheck ui` (skip-cache), `vitest --project=unit` and `--project=emitted`, `verify:scaffold`, `verify:consumer`, `lint:silent-drops`, `lint:cdn-pins` — plus each moved app actually launching and rendering (Playwright/IVP), and `npm pack` contents compared before/after (the apps were never shipped; the tarball must not change beyond the theme-tokens path).

**Eval gate:** owner looks at the result before Step 2 starts.

## Step 2 — `packages/mcp` (direction agreed; own design pass later)

`agent-tooling` becomes `packages/mcp` (owner-named; `kai-` is redundant inside the monorepo, and the npm scope carries the brand if it ever publishes separately). NOT a folder move: it deep-imports ~15 kit internals (`state/mock`, `elements/chat-types`, `wire/encode`, `primitives/url-scheme-policy`, `ui/button-variant-names`, …), and `@kitn.ai/ui` ships its `./construct` + `./construct/templates` exports and both `kai`/`kai-mcp` bins from it. Its design must settle: the import surface (public subpaths vs build-time arrangement), the `./construct` export and bin compatibility story (`npx @kitn.ai/ui mcp` keeps working), and how `verify:scaffold` + the derived-list guards span the boundary. Written and approved as its own short design after the Step 1 eval.

## Step 3 — test-health round (independent; may run parallel to Step 1)

Profile the suites on a quiet box (per the CLAUDE.md timing rules), enumerate actual failures and timeouts, fix or quarantine each with a named reason, and report where the time goes. No structural attribution without measurement.

## Out of scope, queued

Consumer onboarding / "legos + AI-agent assemblability" (docs surface, framework-native feel, widget-in-app story) — owner's deeper concern, deserves its own brainstorm session; repo structure neither fixes nor blocks it.
