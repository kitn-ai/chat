# Repo restructure — apps out of `src/`, the MCP toward its own package

**Date:** 2026-09-01 · **Status:** approved (owner, in-session) · **Path:** architectural, executed as baby steps with an eval gate between them

## Problem

The project feels heavy. `packages/ui/src/` mixes the shipped library (elements, components, primitives, ui, state, wire, stores, schemas, diagnostics, remote) with things that are not the library: three standalone dev apps (`builder-app`, `theme-studio-app`, `gallery-app`) and a 2.1M MCP server (`agent-tooling`). The owner's words: "I go into this package when I want to work on XYZ" — the tree should answer that. Tests are slow and some fail; that is a separate investigation, not assumed to be structural.

**Explicitly ruled out:** splitting the shipped library surface (`state`/`wire`/`stores`/`schemas`/…) into separate npm packages. Consumers keep ONE `@kitn.ai/ui` with subpath exports; any internal package split must preserve that. Also ruled out (Approach B in discussion): full internal decomposition of the kit's guts — `elements`/`components`/`primitives`/`ui` are one tightly coupled thing and stay one package.

## Step 1 — move the three dev-tool apps out of `src/` (this round)

**Correction made during planning (owner-ruled 2026-09-01):** these are not dev-only apps. The kit's `build` prebuilds them into `dist/builder-page`, `dist/theme-studio` and `dist/gallery`, and the CLI's `kai dev` (`src/agent-tooling/construct/dev.ts`) serves those static files to consumers — they SHIP inside `@kitn.ai/ui`. They also import kit internals by relative path (`../ui/button`, `../components/builder-header`, `../agent-tooling/construct/schema`, `../agent-tooling/blocks/registry`, …), none of them public subpaths. A top-level `apps/` home would therefore be a package boundary in name only (or Step-2-class export promotion) and would sit beside `apps/docs`, which deploys separately. So the home is **inside the ui package, outside `src/`**:

- `packages/ui/src/builder-app` → `packages/ui/apps/builder`
- `packages/ui/src/theme-studio-app` → `packages/ui/apps/theme-studio`
- `packages/ui/src/gallery-app` → `packages/ui/apps/gallery`

A sibling of `frameworks/`, which already holds non-`src` code with its own tsconfig. The three vite configs stay where they are and repoint `root`. Relative imports into the kit become `../../src/<dir>/…`. A new `tsconfig.apps.json` joins the `typecheck` chain so the apps stay typechecked (the main tsconfig includes only `src/**`, which is also why the stray `dist/{builder-app,gallery-app,theme-studio-app}/*.d.ts` leakage disappears). The tarball's shipped surface (`dist/builder-page`, `dist/theme-studio`, `dist/gallery`) must be byte-for-byte unchanged apart from that d.ts leakage going away. Top-level `apps/` is revisited with Step 2, if the import surface ever gets public exports.

**Kit-owned data leaves the app:** `theme-tokens.ts` (imported by `agent-tooling/construct/theme-token-policy.ts` and `tests/styles/theme-studio-coverage.test.ts`) and `theme-payload.ts` (the wire type both the builder and the studio import, and which `construct/schema.ts` mirrors) move to `packages/ui/src/themes/`. `theme-presets.ts` and `sample-data.ts` are studio-only and move with the app.

**Storybook stays.** `.storybook/` is already at the package root and stories are co-located with their components by policy; `src/stories/` is low value to move. Not this round.

**Known reference sites to update** (found by grep, re-grep during execution):

- `tests/styles/shadow-sheet-scan.test.ts` — `NOT_SHIPPED_DIRS` entries for `theme-studio-app` / `gallery-app` (it walks `src/` only, so the moved dirs leave its scope and the entries go)
- `src/elements/styles.css` — `@source "../builder-app"` scans the builder app into the SHADOW sheet, though the app is light-DOM with its own Tailwind build (`apps/builder/styles.css`). Dropped, with the builder page's rendering verified by IVP before and after; restored with the new path only if the IVP shows a regression
- `tests/styles/theme-studio-coverage.test.ts` — import path + message text (the test stays in the kit; it guards `theme.css` ↔ token-catalog parity, both kit-owned)
- `apps/docs/src/components/ThemeStudio.tsx` (re-exports the studio from kit source) and `apps/docs/src/styles/app.css` (Tailwind `@source` into the studio)
- `.storybook/main.ts` stories glob (`GalleryPage.stories.tsx` moves with the gallery)
- `vite.config.construct.ts` dts comment; `scripts/verify-pack-weight.mjs` narrative (dist paths unchanged, so behaviour is unaffected)
- Story/comment references (`builder-header.stories.tsx`, `builder-derived-panel.stories.tsx`, `components/builder-header.tsx`, `agent-tooling/construct/schema.ts`, `templates.ts`); `CLAUDE.md` Map line

**Verification:** the full gate set — `nx typecheck ui --skip-nx-cache`, `vitest --project=unit` and `--project=emitted`, `verify:scaffold`, `verify:consumer`, `lint:silent-drops`, `lint:cdn-pins` — plus `kai dev --builder` serving all three pages (builder, `/theme-studio/`, `/gallery/`) with screenshots compared to a pre-move baseline, and `npm pack --dry-run --json` file lists diffed before/after: the only permitted delta is the disappearance of `dist/{builder-app,gallery-app,theme-studio-app}/*.d.ts`.

**Eval gate:** owner looks at the result before Step 2 starts.

## Step 2 — `packages/mcp` (direction agreed; own design pass later)

`agent-tooling` becomes `packages/mcp` (owner-named; `kai-` is redundant inside the monorepo, and the npm scope carries the brand if it ever publishes separately). NOT a folder move: it deep-imports ~15 kit internals (`state/mock`, `elements/chat-types`, `wire/encode`, `primitives/url-scheme-policy`, `ui/button-variant-names`, …), and `@kitn.ai/ui` ships its `./construct` + `./construct/templates` exports and both `kai`/`kai-mcp` bins from it. Its design must settle: the import surface (public subpaths vs build-time arrangement), the `./construct` export and bin compatibility story (`npx @kitn.ai/ui mcp` keeps working), and how `verify:scaffold` + the derived-list guards span the boundary. Written and approved as its own short design after the Step 1 eval.

## Step 3 — test-health round (independent; may run parallel to Step 1)

Profile the suites on a quiet box (per the CLAUDE.md timing rules), enumerate actual failures and timeouts, fix or quarantine each with a named reason, and report where the time goes. No structural attribution without measurement.

## Out of scope, queued

Consumer onboarding / "legos + AI-agent assemblability" (docs surface, framework-native feel, widget-in-app story) — owner's deeper concern, deserves its own brainstorm session; repo structure neither fixes nor blocks it.

## Owner eval of Step 1 (2026-09-01) and the ruled target map

Step 1 shipped (#358). The owner looked at `packages/ui/apps/` and ruled it a waypoint, not the destination: this is a monorepo, and apps belong in the root `apps/` beside `docs`. Ruled map, with one rule: **imported as code by another project → `packages/`; only served or deployed as a page → `apps/`** (the owner chose to put the theme studio in `apps/` as well, accepting that the docs site and the builder import it from there):

| Location | What |
|---|---|
| `apps/docs` | the docs site (deployed) |
| `apps/builder` | the `kai dev --builder` page (served by the CLI) |
| `apps/gallery` | the blocks gallery page (served by the CLI) |
| `apps/theme-studio` | the theme builder (served by the CLI; imported by docs and builder) |
| `packages/ui` | the kit |
| `packages/mcp` | `agent-tooling`: the `kai` MCP + construct engine |
| `packages/blocks` | block sources + registry/forms (today split across `packages/ui/blocks` and `src/agent-tooling/blocks`) |
| `packages/create-kai` | unchanged |

**Mechanics that keep the boundary honest:** apps and packages import `@kitn.ai/ui` through its PUBLIC exports via `workspace:*` (most of what the pages need is already public: `./solid` for the atoms, `./construct` + `./construct/templates`; the builder-only components move into `apps/builder`; the blocks registry/forms move to `packages/blocks`; the theme tokens get one public subpath). The pages keep shipping inside `@kitn.ai/ui`: each builds to its own `dist/`, and a ui assembly target that depends on their builds copies the output into `packages/ui/dist/{builder-page,theme-studio,gallery}`, guarded by `verify:pack`. `kai dev` does not change.

**Sequencing, one PR each with an owner eval between:** `packages/mcp` (largest; unblocks blocks) → `packages/blocks` → the three pages to `apps/`. Step 1's relative-import cleanup and `tsconfig.apps.json` carry over.

**Also ruled the same day:** make `storybook-gate` a required check (it aggregates the four shards' axe + interaction runs; advisory is how three a11y defects shipped, fixed in #359) · split the serial 26-minute `test` job into parallel jobs sharing the kit build (the test-health round; e2e is under 10% of the time and no tests are removed) · the builder's `resolveContrastForeground` white-preference heuristic is PARKED for a deeper look later.
