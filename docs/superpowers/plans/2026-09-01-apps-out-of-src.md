# Apps Out of `src/` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the three shipped dev-tool apps (`builder-app`, `theme-studio-app`, `gallery-app`) from `packages/ui/src/` to `packages/ui/apps/{builder,theme-studio,gallery}`, leaving the kit-owned theme data behind in `packages/ui/src/themes/`, with the shipped tarball unchanged.

**Architecture:** The apps stay inside the ui package (they are prebuilt into `dist/builder-page`, `dist/theme-studio`, `dist/gallery` by the kit's `build` and served by `kai dev`), but out of `src/`, which becomes the library alone. They keep importing kit internals by relative path (`../../src/<dir>/…`). A new `tsconfig.apps.json` typechecks them the way `tsconfig.react.json` typechecks `frameworks/`. Two data modules the kit itself imports (`theme-tokens.ts`, `theme-payload.ts`) move to `src/themes/` first, so no kit file ever imports from `apps/`.

**Tech Stack:** pnpm + NX workspace, Vite (per-app configs at `packages/ui/vite.config.{builder-page,theme-studio,gallery}.ts`), Vitest (`unit` project collects `**/*.test.*` by default), Tailwind v4 (`@source` directives), Storybook (`storybook-solidjs-vite`), tsc.

**Spec:** `docs/superpowers/specs/2026-09-01-repo-restructure-design.md` (Step 1). Read its Step 1 section before starting: it records why the home is `packages/ui/apps/` and not top-level `apps/`.

## Global Constraints

- Every command runs from the repo root (`/Users/home/Projects/kitn-ai/kitn-chat`) unless a step says `packages/ui`.
- Work on a branch off `main` in the main checkout: `git checkout -b feat/apps-out-of-src` (sequential work, no worktree — see memory `concurrent-writers-need-worktrees`).
- No kit file under `packages/ui/src/` may import from `packages/ui/apps/`. Direction is apps → src only.
- The three dist output paths (`dist/builder-page`, `dist/theme-studio`, `dist/gallery`) and `dev.ts`'s resolution of them do not change. `dev.ts` needs no edit.
- The shipped tarball may change ONLY by losing `dist/builder-app/`, `dist/gallery-app/`, `dist/theme-studio-app/` (`.d.ts` leakage from the old `src/**` tsconfig include).
- Commit messages: conventional commits (`refactor(ui): …`), ending with the attribution block:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
  ```
- Never hand-edit `package.json` `version`. Never run `gen-llms.mjs` standalone. `nx build ui` may cache; use `--skip-nx-cache` when the plan says so.
- Copy voice: no emoji, no em dashes in comments you write.
- macOS `sed -i` needs `-i ''`.

---

### Task 0: Baseline capture (before any move)

**Files:**
- Create (scratch, not committed): `/private/tmp/claude-501/-Users-home-Projects-kitn-ai-kitn-chat-packages-create-kai/18aba3fe-13fd-42a6-b021-7ddbce6ca950/scratchpad/baseline/`

**Interfaces:**
- Produces: `baseline/pack-files.txt` (sorted tarball file list), `baseline/{builder,theme-studio,gallery}.png` (screenshots), `baseline/dist-sizes.txt`. Task 7 diffs against these.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/apps-out-of-src
```

- [ ] **Step 2: Build cold and list the tarball**

```bash
pnpm install
nx build ui --skip-nx-cache
cd packages/ui && npm pack --dry-run --json 2>/dev/null | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j[0].files.map(f=>f.path).sort().join('\n'))" > "$SCRATCH/baseline/pack-files.txt"
du -sk dist/builder-page dist/theme-studio dist/gallery > "$SCRATCH/baseline/dist-sizes.txt"
grep -cE "^dist/(builder-app|gallery-app|theme-studio-app)/" "$SCRATCH/baseline/pack-files.txt"
```
where `SCRATCH` is the scratchpad path above (`mkdir -p "$SCRATCH/baseline"` first).
Expected: the last grep prints a number greater than 0 (the leakage exists today; Task 7 expects it to be 0).

- [ ] **Step 3: Confirm the gates are green BEFORE the move**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/styles/shadow-sheet-scan.test.ts tests/styles/theme-studio-coverage.test.ts src/builder-app src/theme-studio-app src/gallery-app
pnpm --filter @kitn.ai/ui run typecheck
```
Expected: PASS. If anything is red here, STOP and report: it is pre-existing and must not be silently fixed inside this plan.

- [ ] **Step 4: Screenshot the three served pages**

Start the CLI's dev server from the built package (the exact flag is `--builder`; read `packages/ui/src/agent-tooling/construct/dev.ts` for the port it prints):
```bash
cd packages/ui && node bin/mcp.js dev --builder
```
With Playwright (or the Chrome tools), capture full-page screenshots of the builder root, `/theme-studio/`, and `/gallery/` to `$SCRATCH/baseline/{builder,theme-studio,gallery}.png`. Stop the server.
Expected: three non-blank screenshots. Record the URLs used in `$SCRATCH/baseline/urls.txt`.

---

### Task 1: Kit-owned theme data moves to `src/themes/`

**Files:**
- Move: `packages/ui/src/theme-studio-app/theme-tokens.ts` → `packages/ui/src/themes/theme-tokens.ts`
- Move: `packages/ui/src/theme-studio-app/theme-payload.ts` → `packages/ui/src/themes/theme-payload.ts`
- Modify: `packages/ui/src/agent-tooling/construct/theme-token-policy.ts:37`
- Modify: `packages/ui/src/agent-tooling/construct/schema.ts:59` (comment)
- Modify: `packages/ui/src/agent-tooling/construct/schema.test.ts:723` (comment)
- Modify: `packages/ui/src/theme-studio-app/ThemeStudio.tsx:17,52,376`
- Modify: `packages/ui/src/builder-app/App.tsx:21`
- Modify: `packages/ui/tests/styles/theme-studio-coverage.test.ts:13,16,49`

**Interfaces:**
- Produces: `src/themes/theme-tokens.ts` and `src/themes/theme-payload.ts` with their exports unchanged (`studioTokens`, `GROUPS`, `ALL_TOKENS`, `TEXT_RUNGS`, `parseKitDefaults`, `remValue`, `TextRung`, `ThemePayload`). Tasks 2 and 3 import from these paths.

- [ ] **Step 1: Move the files**

```bash
cd packages/ui && mkdir -p src/themes && git mv src/theme-studio-app/theme-tokens.ts src/themes/theme-tokens.ts && git mv src/theme-studio-app/theme-payload.ts src/themes/theme-payload.ts
```

- [ ] **Step 2: Run the coverage test to see it fail on the old path**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/styles/theme-studio-coverage.test.ts
```
Expected: FAIL, "Failed to resolve import" naming `theme-studio-app/theme-tokens`.

- [ ] **Step 3: Repoint every importer**

```bash
cd packages/ui
sed -i '' "s#'../../theme-studio-app/theme-tokens'#'../../themes/theme-tokens'#" src/agent-tooling/construct/theme-token-policy.ts
sed -i '' "s#from './theme-tokens'#from '../themes/theme-tokens'#; s#from './theme-payload'#from '../themes/theme-payload'#" src/theme-studio-app/ThemeStudio.tsx
sed -i '' "s#'../theme-studio-app/theme-payload'#'../themes/theme-payload'#" src/builder-app/App.tsx
sed -i '' "s#'../../src/theme-studio-app/theme-tokens'#'../../src/themes/theme-tokens'#; s#packages/ui/src/theme-studio-app/theme-tokens.ts#packages/ui/src/themes/theme-tokens.ts#" tests/styles/theme-studio-coverage.test.ts
grep -rn "theme-studio-app/theme-tokens\|theme-studio-app/theme-payload\|theme-studio-app/$" src tests
```
Expected: the final grep prints only comment lines. Fix those by hand: in `schema.ts:59`, `schema.test.ts:723`, `ThemeStudio.tsx:17` and `theme-studio-coverage.test.ts:16` replace `src/theme-studio-app/theme-tokens.ts` / `theme-payload` references with `src/themes/...` (the `ThemeStudio.tsx` app path in prose stays as-is for now; Task 3 rewrites it).

- [ ] **Step 4: Verify**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/styles/theme-studio-coverage.test.ts tests/styles/shadow-sheet-scan.test.ts src/theme-studio-app src/builder-app src/agent-tooling/construct
cd packages/ui && npx tsc --noEmit
```
Expected: PASS. `src/themes/` is now inside the shadow-sheet scan's walk (it was excluded before via `theme-studio-app`). If the scan flags a token from `theme-tokens.ts`, add it to that test's waiver list with the source noted, following the existing entries' shape; do not exclude the directory.

- [ ] **Step 5: Commit**

```bash
git add -A packages/ui/src/themes packages/ui/src/theme-studio-app packages/ui/src/builder-app packages/ui/src/agent-tooling/construct packages/ui/tests/styles
git commit -m "refactor(ui): kit-owned theme tokens and payload move to src/themes

theme-tokens.ts is imported by the construct theme-token policy and the
theme.css parity test; theme-payload.ts is the wire type the builder and
the studio share and construct/schema.ts mirrors. Both are kit data, not
app code, so they leave the theme-studio app ahead of its move out of src/."
```
(append the attribution block).

---

### Task 2: `builder-app` → `apps/builder` + `tsconfig.apps.json`

**Files:**
- Move: `packages/ui/src/builder-app/` → `packages/ui/apps/builder/` (App.tsx, App.test.tsx, HomeScreen.tsx, HomeScreen.test.tsx, edit-guard.ts, edit-guard.test.ts, index.html, main.tsx, styles.css)
- Create: `packages/ui/tsconfig.apps.json`
- Modify: `packages/ui/package.json` (`typecheck` script)
- Modify: `packages/ui/vite.config.builder-page.ts:11`
- Modify: `packages/ui/src/elements/styles.css:57`
- Modify: `packages/ui/src/components/builder-header.tsx:3`, `packages/ui/src/elements/builder-derived-panel.stories.tsx:34`, `packages/ui/src/elements/builder-header.stories.tsx:11`, `packages/ui/src/agent-tooling/construct/templates.ts:30` (comments)

**Interfaces:**
- Produces: `tsconfig.apps.json` covering `apps/**/*.ts(x)`; Tasks 3 and 4 rely on it and add nothing to it.

- [ ] **Step 1: Move**

```bash
cd packages/ui && mkdir -p apps && git mv src/builder-app apps/builder
```

- [ ] **Step 2: Rewrite kit imports and Tailwind sources**

```bash
cd packages/ui/apps/builder
sed -i '' -E "s#from '\.\./(agent-tooling|ui|components|themes|utils|primitives|elements|state|wire)/#from '../../src/\1/#g" *.ts *.tsx
sed -i '' 's#@source "../components";#@source "../../src/components";#; s#@source "../ui";#@source "../../src/ui";#' styles.css
grep -n "from '\.\./[a-z]" *.ts *.tsx; grep -n "@source\|@import" styles.css
```
Expected: the first grep prints nothing (no remaining single-level parent imports); `styles.css` shows `@import "../../solid.css"` (unchanged, same depth), the two rewritten `@source` lines and `@source "."`.

- [ ] **Step 3: Repoint the vite root**

In `packages/ui/vite.config.builder-page.ts` change `root: resolve(__dirname, 'src/builder-app')` to `root: resolve(__dirname, 'apps/builder')`.

- [ ] **Step 4: Drop the shadow-sheet `@source` for the builder**

In `packages/ui/src/elements/styles.css` delete the line `@source "../builder-app";`. Rationale (put a one-line comment where it was): the builder page is light-DOM with its own Tailwind build (`apps/builder/styles.css`); the shadow sheet never styled it. Task 7's IVP compares the page against the baseline screenshot; if it regresses, restore the line as `@source "../../apps/builder";` and note why in the comment.

- [ ] **Step 5: Create `tsconfig.apps.json`**

```json
{
  "comment": "Typechecks the three shipped dev-tool apps (apps/builder, apps/theme-studio, apps/gallery). They live outside src/ so the library tsconfig (src/** only) and the dts emit never see them; this project is what keeps them typechecked. Same compiler options as tsconfig.json, noEmit.",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "baseUrl": ".",
    "paths": {
      "@kitn.ai/ui/elements": ["./src/elements/register.ts"]
    }
  },
  "include": ["apps/**/*.ts", "apps/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```
The `paths` entry is the same one `tsconfig.json` carries for the theme studio's `kit.ts` (its comment explains TS2209). Leave the `tsconfig.json` copy in place until Task 3 moves `kit.ts`; Task 3 deletes it from `tsconfig.json`.

- [ ] **Step 6: Add it to the typecheck chain**

In `packages/ui/package.json`, `scripts.typecheck`: after `tsc --noEmit -p tsconfig.react.test.json` insert ` && tsc --noEmit -p tsconfig.apps.json`. Keep `verify:quarantine` first (its position is load-bearing; see CLAUDE.md).

- [ ] **Step 7: Update the comments that name the old path**

In each of `src/components/builder-header.tsx`, `src/elements/builder-derived-panel.stories.tsx`, `src/elements/builder-header.stories.tsx`, `src/agent-tooling/construct/templates.ts`, replace `builder-app/App.tsx` (and `src/builder-app/App.tsx`) with `apps/builder/App.tsx`.

- [ ] **Step 8: Verify**

```bash
cd packages/ui && npm run build:css && npx tsc --noEmit -p tsconfig.apps.json && npx tsc --noEmit
pnpm --filter @kitn.ai/ui exec vitest run --project=unit apps/builder tests/styles/shadow-sheet-scan.test.ts
cd packages/ui && npx vite build --config vite.config.builder-page.ts && ls dist/builder-page/index.html
grep -rn "builder-app" src tests scripts vite.config.*.ts .storybook | grep -v "^src/agent-tooling/construct/dev.ts"
```
Expected: all PASS; `dist/builder-page/index.html` exists; the grep prints nothing. (If `dev.ts` matches, it is only its `dist/builder-page` narrative, which is correct and stays.)

- [ ] **Step 9: Commit**

```bash
git add -A packages/ui/apps/builder packages/ui/src packages/ui/tsconfig.apps.json packages/ui/package.json packages/ui/vite.config.builder-page.ts
git commit -m "refactor(ui): builder app moves from src/ to apps/builder

The builder page ships prebuilt (dist/builder-page, served by kai dev) but
it is an app over the kit, not the kit. It leaves src/, keeps its relative
imports one level deeper, and a new tsconfig.apps.json keeps it typechecked.
The shadow sheet no longer @sources it: the page is light-DOM with its own
Tailwind build."
```

---

### Task 3: `theme-studio-app` → `apps/theme-studio`

**Files:**
- Move: `packages/ui/src/theme-studio-app/` → `packages/ui/apps/theme-studio/` (ThemeStudio.tsx, ThemeStudio.embed.test.tsx, icons.tsx, index.html, kit.ts, main.tsx, sample-data.ts, samples/*, styles.css, theme-presets.ts)
- Modify: `packages/ui/vite.config.theme-studio.ts:12,17`
- Modify: `packages/ui/tsconfig.json` (`paths` block + its comment)
- Modify: `packages/ui/tests/styles/shadow-sheet-scan.test.ts:54`
- Modify: `packages/ui/tests/styles/theme-studio-coverage.test.ts:16`
- Modify: `apps/docs/src/components/ThemeStudio.tsx:2,6`
- Modify: `apps/docs/src/styles/app.css:15,19`

- [ ] **Step 1: Move**

```bash
cd packages/ui && git mv src/theme-studio-app apps/theme-studio
```

- [ ] **Step 2: Rewrite kit imports**

```bash
cd packages/ui/apps/theme-studio
sed -i '' -E "s#from '\.\./themes/#from '../../src/themes/#g" ThemeStudio.tsx
grep -rn "from '\.\./" . ; grep -n "theme.css" ThemeStudio.tsx
```
Expected: the only `../` imports left are `../../src/themes/theme-tokens`, `../../src/themes/theme-payload` and `../../theme.css?raw` (same depth as before, unchanged). `styles.css` has `@source "."` only, unchanged.

- [ ] **Step 3: Repoint the vite root and comment**

In `packages/ui/vite.config.theme-studio.ts`: `root: resolve(__dirname, 'apps/theme-studio')`; in its comment replace `src/theme-studio-app/kit.ts` with `apps/theme-studio/kit.ts`.

- [ ] **Step 4: Move the `paths` mapping out of `tsconfig.json`**

`kit.ts` was the only file needing `"@kitn.ai/ui/elements": ["./src/elements/register.ts"]`. Delete the `paths` block and its comment from `packages/ui/tsconfig.json` (keep `baseUrl`). `tsconfig.apps.json` already carries the mapping (Task 2).

- [ ] **Step 5: Drop the stale skip entry and fix prose paths**

In `tests/styles/shadow-sheet-scan.test.ts` delete the `'theme-studio-app', // ...` line from `NOT_SHIPPED_DIRS` (the walk covers `src/` only; the app is no longer under it). In `tests/styles/theme-studio-coverage.test.ts:16` replace `src/theme-studio-app/ThemeStudio.tsx` with `apps/theme-studio/ThemeStudio.tsx`. In `apps/theme-studio/ThemeStudio.tsx:22` replace `src/theme-studio-app/` with `apps/theme-studio/`.

- [ ] **Step 6: Repoint the docs site**

`apps/docs/src/components/ThemeStudio.tsx` line 6: `export { default } from '../../../../packages/ui/apps/theme-studio/ThemeStudio';` and fix the comment on line 2. `apps/docs/src/styles/app.css` line 19: `@source '../../../../packages/ui/apps/theme-studio';` and the comment on line 15.

- [ ] **Step 7: Verify**

```bash
cd packages/ui && npx tsc --noEmit && npx tsc --noEmit -p tsconfig.apps.json
pnpm --filter @kitn.ai/ui exec vitest run --project=unit apps/theme-studio tests/styles
cd packages/ui && npx vite build --config vite.config.theme-studio.ts && ls dist/theme-studio/index.html
nx build docs
grep -rn "theme-studio-app" packages/ui/src packages/ui/tests packages/ui/scripts packages/ui/vite.config.*.ts packages/ui/tsconfig*.json apps/docs/src
```
Expected: all PASS, docs build green, grep prints nothing.

- [ ] **Step 8: Commit**

```bash
git add -A packages/ui/apps/theme-studio packages/ui/src packages/ui/tests packages/ui/tsconfig.json packages/ui/vite.config.theme-studio.ts apps/docs/src
git commit -m "refactor(ui): theme studio moves from src/ to apps/theme-studio

Same shape as the builder move. The docs site keeps re-exporting the studio
from kit source at its new path, and the one tsconfig paths mapping that
existed for its kit.ts now lives only in tsconfig.apps.json."
```

---

### Task 4: `gallery-app` → `apps/gallery`

**Files:**
- Move: `packages/ui/src/gallery-app/` → `packages/ui/apps/gallery/` (GalleryPage.tsx, GalleryPage.test.tsx, GalleryPage.stories.tsx, index.html, main.tsx, styles.css)
- Modify: `packages/ui/vite.config.gallery.ts:12`
- Modify: `packages/ui/.storybook/main.ts:54`
- Modify: `packages/ui/tests/styles/shadow-sheet-scan.test.ts:55`
- Modify: `packages/ui/vite.config.construct.ts:54-56` (comment)

- [ ] **Step 1: Move**

```bash
cd packages/ui && git mv src/gallery-app apps/gallery
```

- [ ] **Step 2: Rewrite kit imports and Tailwind sources**

```bash
cd packages/ui/apps/gallery
sed -i '' -E "s#from '\.\./(agent-tooling|ui|components|themes|utils|primitives|elements|state|wire)/#from '../../src/\1/#g" *.ts *.tsx
sed -i '' 's#@source "../components";#@source "../../src/components";#; s#@source "../ui";#@source "../../src/ui";#' styles.css
grep -n "from '\.\./[a-z]" *.ts *.tsx; grep -n "@source\|@import" styles.css
```
Expected: first grep empty; styles.css shows the rewritten sources and unchanged `@import "../../solid.css"`.

- [ ] **Step 3: Repoint vite root and Storybook**

`packages/ui/vite.config.gallery.ts`: `root: resolve(__dirname, 'apps/gallery')`. `packages/ui/.storybook/main.ts` line 54:
```ts
stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)', '../apps/**/*.stories.@(ts|tsx)'],
```

- [ ] **Step 4: Drop the stale skip entry and fix the dts comment**

Delete the `'gallery-app', // ...` line from `NOT_SHIPPED_DIRS` in `tests/styles/shadow-sheet-scan.test.ts`. In `vite.config.construct.ts` lines 54-56 replace `dist/gallery-app/GalleryPage.d.ts` with `apps/gallery/GalleryPage.tsx` and `dist/builder-app/HomeScreen.d.ts` with `apps/builder/HomeScreen.tsx`, and reword: those apps are no longer under the dts include, so the registry/forms entries now exist for `public.d.ts`'s own consumers; keep the entries (removing them is a separate decision).

- [ ] **Step 5: Verify**

```bash
cd packages/ui && npx tsc --noEmit && npx tsc --noEmit -p tsconfig.apps.json
pnpm --filter @kitn.ai/ui exec vitest run --project=unit apps/gallery tests/styles/shadow-sheet-scan.test.ts
cd packages/ui && npx vite build --config vite.config.gallery.ts && ls dist/gallery/index.html
grep -rn "gallery-app" packages/ui/src packages/ui/tests packages/ui/scripts packages/ui/vite.config.*.ts packages/ui/.storybook
```
Expected: PASS, file exists, grep prints nothing.

- [ ] **Step 6: Storybook picks up the moved story**

```bash
cd packages/ui && npx storybook build --test -o "$SCRATCH/sb-check" 2>&1 | tail -5 && grep -l "GalleryPage" "$SCRATCH/sb-check/index.json"
```
Expected: build succeeds and `index.json` mentions the gallery story. (If `--test` is unsupported by this Storybook version, drop the flag.)

- [ ] **Step 7: Commit**

```bash
git add -A packages/ui/apps/gallery packages/ui/src packages/ui/tests packages/ui/.storybook packages/ui/vite.config.gallery.ts packages/ui/vite.config.construct.ts
git commit -m "refactor(ui): blocks gallery moves from src/ to apps/gallery

Same shape as the builder and studio moves; Storybook's stories glob now
also scans apps/ so the gallery story stays discoverable."
```

---

### Task 5: Repo docs and the pack-weight narrative

**Files:**
- Modify: `CLAUDE.md` (Map section, last line)
- Modify: `packages/ui/scripts/verify-pack-weight.mjs:362-408` (narrative comments only)
- Modify: `.claude/README.md` if it names any of the three dirs (grep first)

- [ ] **Step 1: CLAUDE.md map**

In the `## Map` paragraph, after `plus \`frameworks/react/\` wrappers` insert `, \`apps/{builder,theme-studio,gallery}\` (the three dev-tool pages \`kai dev\` serves, prebuilt into \`dist/\` and outside \`src/\` because they are apps over the kit, not the kit)`.

- [ ] **Step 2: Pack-weight narrative**

The comments in `verify-pack-weight.mjs` describe `dist/builder-page`, `dist/theme-studio`, `dist/gallery` (unchanged paths). Only where they cite `src/…-app` source paths, rewrite to `apps/…`. Do not touch the ceiling constant.

- [ ] **Step 3: Sweep**

```bash
grep -rn "theme-studio-app\|builder-app\|gallery-app" CLAUDE.md .claude packages/ui apps/docs/src --include='*.md' --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.json' --include='*.css' --include='*.mdx' | grep -v node_modules | grep -v "/dist/"
```
Expected: nothing. (`docs/superpowers/**` history is out of scope and stays.)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .claude packages/ui/scripts/verify-pack-weight.mjs
git commit -m "docs: point the map and pack-weight narrative at packages/ui/apps"
```

---

### Task 6: Full gate run

- [ ] **Step 1: Build cold, then every gate**

```bash
nx build ui --skip-nx-cache
nx typecheck ui --skip-nx-cache
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter @kitn.ai/ui run verify:scaffold
pnpm --filter @kitn.ai/ui run verify:consumer
pnpm --filter @kitn.ai/ui run lint:silent-drops
pnpm --filter @kitn.ai/ui run lint:cdn-pins
pnpm --filter @kitn.ai/ui run verify:pack-weight 2>/dev/null || node packages/ui/scripts/verify-pack-weight.mjs
nx build docs
```
Expected: every command exits 0. Paste each command's last lines into the task report. A red gate is reported, not worked around; if it is pre-existing (compare against Task 0 Step 3), say so with evidence.

- [ ] **Step 2: Commit nothing here** (a fix needed to go green is its own commit with its own message).

---

### Task 7: Tarball and rendering diff against the baseline

- [ ] **Step 1: Tarball diff**

```bash
cd packages/ui && npm pack --dry-run --json 2>/dev/null | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j[0].files.map(f=>f.path).sort().join('\n'))" > "$SCRATCH/after-pack-files.txt"
diff "$SCRATCH/baseline/pack-files.txt" "$SCRATCH/after-pack-files.txt"
du -sk dist/builder-page dist/theme-studio dist/gallery
```
Expected: the diff shows ONLY removed lines, all under `dist/builder-app/`, `dist/gallery-app/`, `dist/theme-studio-app/`. The three `du` sizes match `$SCRATCH/baseline/dist-sizes.txt` within a few KB (hash-named asset files may differ in name, never in count).

- [ ] **Step 2: Rendering diff**

Start `node bin/mcp.js dev --builder` from `packages/ui` exactly as in Task 0 Step 4, capture the same three screenshots to `$SCRATCH/after/`, and compare each against its baseline (pixel diff via Playwright's `toHaveScreenshot`-style compare, or side-by-side inspection with the images attached to the report). Stop the server.
Expected: no visible difference. If the builder page lost styling, restore `@source "../../apps/builder";` in `src/elements/styles.css` with a comment saying the IVP proved it needed, rebuild css, re-run Task 6 Step 1's unit + shadow-sheet-scan, commit as `fix(ui): the shadow sheet still needs the builder app's classes`, and re-do this step.

- [ ] **Step 3: Report**

Write `$SCRATCH/step1-report.md` with: the tarball diff, the three size lines, screenshot paths, and the last lines of every Task 6 gate. The supervisor's IVP verifier reads this.

---

## Self-review

- **Spec coverage:** apps out of src (Tasks 2-4) · kit data to `src/themes/` (Task 1) · tsconfig.apps.json + typecheck chain (Task 2) · every named reference site (Tasks 2-5) · tarball unchanged except d.ts leakage (Tasks 0, 7) · IVP of the served pages (Tasks 0, 7) · full gates (Task 6) · Storybook stays (no task, by design) · `dev.ts` untouched (constraint).
- **Placeholders:** none; every edit names the file and the replacement.
- **Consistency:** the `sed` import rewrite is identical in Tasks 2 and 4 and lists every kit dir an app imports today (`agent-tooling`, `ui`, `components`, `themes`, `utils`) plus the plausible extras; Task 3's studio imports only `themes` and `theme.css`. Path names `apps/builder`, `apps/theme-studio`, `apps/gallery`, `src/themes` are used identically throughout.
