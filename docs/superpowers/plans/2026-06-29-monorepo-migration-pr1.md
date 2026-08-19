# Monorepo Migration — PR 1 ("Lift into the monorepo") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `kitn-ai/ui` from a single root npm package into a pnpm + NX workspace — the kit moves to `packages/ui`, the docs site to `apps/docs` consuming `@kitn.ai/ui` via `workspace:*` (deleting `sync-kit`), with an identical published artifact and release-please still cutting `@kitn.ai/ui` correctly.

**Architecture:** Three internal commits of ONE atomic PR. (1) Establish the workspace + `git mv` the kit into `packages/ui` + pnpm conversion. (2) `git mv docs-site → apps/docs`, switch it to `workspace:*` package imports, delete `sync-kit`. (3) Move release-please to the new package path + rework CI. The published package (`packages/ui`) stays green at every commit; the docs app is migrated wholesale in commit 2 (do not build docs between commits 1 and 2). Examples (except the two `remote-*` ones, which are in the kit's required e2e gate) are deferred to a separate examples-refresh plan (PR 2+).

**Tech Stack:** pnpm 10.24 workspaces, NX (latest), Vite 6 lib builds, Storybook 10, Astro 6 (docs), Playwright, Vitest 4, release-please (single-package node mode), GitHub Actions.

## Global Constraints

- Node `>=22`; package manager `pnpm@10.24.0` (`packageManager` field at root).
- The published `@kitn.ai/ui` artifact is **identical** after the move: same `name`/`version`/`exports`/`bin`/`files`/`sideEffects`. Prove with an `npm pack` file-list diff vs the published 0.18.0 tarball.
- The MCP stays **inside** `packages/ui` (bin `kai-mcp` → `bin/mcp.js` + `vite.config.mcp.ts`). No `./mcp` export is added; no second package.
- release-please stays **single-package** (`node`), only the path changes `"."` → `"packages/ui"`.
- Element prefix is **`kai-`**, never `kitn-`. Copy/comments: no em dashes (use a hyphen or rephrase).
- Use **`git mv`** for every move to preserve history.
- Do **NOT** touch `docs/notes.md` / `docs/notes-native.md` (Rob's).
- The two build guards (`scripts/verify-elements-bundle.mjs`, `verify-react-wrappers.mjs`) stay wired into the build and must pass.
- `examples/*` is **not** added to the workspace in this PR (deferred to PR 2), except that `examples/remote-host` and `examples/remote-provider` get path-only fixes because the kit's required cross-origin e2e gate serves them.

---

## File structure (what this PR creates / moves)

**New at repo root:**
- `pnpm-workspace.yaml` — workspace globs (`packages/*`, `apps/*`).
- `nx.json` — task graph + caching + the `dev`/`build` target defaults.
- `.npmrc` — `node-linker=hoisted`, `enable-pre-post-scripts=true`.
- `package.json` — **replaced** by a private orchestrator (NX run-many scripts).
- `README.md` — replaced by a short monorepo overview (the kit's README moves to `packages/ui`).

**Moved into `packages/ui/` (via `git mv`, the whole kit):** `src/`, `bin/`, `frameworks/`, `tests/`, `.storybook/`, `scripts/`, `theme.css`, `llms.txt`, `llms-full.txt`, `CHANGELOG.md`, the old `package.json`/`README.md`, all 7 `vite.config.*.ts`, `vitest.config.ts`, `vitest.react.config.ts`, `vitest.shims.d.ts`, all 7 `playwright.*.config.ts`, `tsconfig.json`, `tsconfig.react.json`, `tsconfig.react.test.json`, `tsconfig.mcp.json`, `postcss.config.js`. (`context7.json` does **not** move — it indexes the docs; it stays at root and its path is updated in Task 2.)

**Stays at repo root (ROOT-META):** `LICENSE`, `CLAUDE.md`, `.github/`, `docs/`, `examples/`, `release-please-config.json`, `.release-please-manifest.json`, `context7.json`, `.gitignore`.

**Moved (Task 2):** `docs-site/` → `apps/docs/`.

**Deleted (Task 2):** `docs-site/scripts/sync-kit.mjs` + its `predev`/`prebuild` hooks.

---

## Task 1: Workspace skeleton + move the kit into `packages/ui` + pnpm conversion

**Files:**
- Create: `pnpm-workspace.yaml`, `nx.json`, `.npmrc`, new root `package.json`, new root `README.md`
- Move: the entire kit → `packages/ui/` (see file structure above)
- Modify (path fixes): `packages/ui/.storybook/main.ts`, `packages/ui/package.json` (dev scripts + `nx` name), `examples/remote-host/host-entry.ts`, `examples/remote-provider/provider-entry.ts`, `examples/remote-provider/renderers.ts`, `packages/ui/scripts/gen-web-components-md.mjs`, root `.gitignore`
- Delete: root `package-lock.json`

**Interfaces:**
- Produces: NX project `ui` (= `packages/ui`, package name `@kitn.ai/ui`) with targets `build`, `dev` (Storybook on 6006), `test`, `typecheck`, `test:react`, `test:e2e`. Task 2's `docs` project depends on `ui:build`. Task 3's release-please/CI reference `packages/ui`.

- [ ] **Step 1: Capture the published-artifact baseline (for the identity check later)**

```bash
cd /private/tmp/claude-501/-Users-home-Projects-kitn-ai-kitn-chat/*/scratchpad 2>/dev/null || cd /tmp
npm pack @kitn.ai/ui@0.18.0 >/dev/null 2>&1
tar -tzf kitn.ai-ui-0.18.0.tgz | sed 's#^package/##' | sort > /tmp/pack-baseline.txt
wc -l /tmp/pack-baseline.txt    # remember this count
```
Expected: a sorted file list (≈ the contents of `files`: `dist/**`, `src/**` minus excludes, `bin/**`, `frameworks/**`, `theme.css`, `llms*.txt`).

- [ ] **Step 2: Create the `packages/ui` directory and `git mv` the kit into it**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
mkdir -p packages/ui
git mv src bin frameworks tests .storybook scripts theme.css llms.txt llms-full.txt \
       CHANGELOG.md package.json README.md \
       vite.config.ts vite.config.provider.ts vite.config.react.ts vite.config.barrel.ts \
       vite.config.state.ts vite.config.mcp.ts vite.config.elements.ts \
       vitest.config.ts vitest.react.config.ts vitest.shims.d.ts \
       playwright.config.ts playwright.composer.config.ts playwright.menu.config.ts \
       playwright.command.config.ts playwright.slots.config.ts playwright.promptinput.config.ts \
       playwright.shot.config.ts \
       tsconfig.json tsconfig.react.json tsconfig.react.test.json tsconfig.mcp.json \
       postcss.config.js \
       packages/ui/
git rm package-lock.json
```
Expected: all listed paths now under `packages/ui/`; `git status` shows renames. (Do NOT move `LICENSE`, `CLAUDE.md`, `.github`, `docs`, `examples`, `context7.json`, `release-please*`, `.gitignore`.)

- [ ] **Step 3: Add the `nx` project name to the kit package.json**

In `packages/ui/package.json`, add a top-level `"nx"` key (so `nx build ui` works despite the scoped name):
```jsonc
  "name": "@kitn.ai/ui",
  "version": "0.18.0",
  "nx": { "name": "ui" },
```
(Insert `"nx": { "name": "ui" },` immediately after the `"version"` line.)

- [ ] **Step 4: Fix the cross-boundary path breaks (examples + storybook live one level deeper now)**

`packages/ui/.storybook/main.ts` — examples stay at repo root, `.storybook` is now at `packages/ui/.storybook`, so `../examples` must become `../../examples`:
- Line ~23: `resolve(HERE, '../examples/remote-provider')` → `resolve(HERE, '../../examples/remote-provider')`
- Line ~62: staticDir `from: '../examples/artifact-fixtures'` → `from: '../../examples/artifact-fixtures'`
- (Leave `../llms.txt`, `../llms-full.txt`, `../src/**` globs — those moved with the kit and stay correct.)

`packages/ui/package.json` dev scripts (lines ~115-116):
- `"dev:provider": "vite examples/remote-provider --port 6007 --strictPort"` → `"vite ../../examples/remote-provider --port 6007 --strictPort"`
- `"dev:host": "vite examples/remote-host --port 6006 --strictPort"` → `"vite ../../examples/remote-host --port 6006 --strictPort"`

`examples/remote-host/host-entry.ts` — kit source moved to `packages/ui/src`:
- `'../../src/remote/host-embed'` → `'../../packages/ui/src/remote/host-embed'`
- `'../../src/primitives/card-contract'` → `'../../packages/ui/src/primitives/card-contract'`

`examples/remote-provider/provider-entry.ts`:
- `'../../src/remote/provider'` → `'../../packages/ui/src/remote/provider'`

`examples/remote-provider/renderers.ts`:
- every `'../../src/elements/…'` → `'../../packages/ui/src/elements/…'`

`packages/ui/scripts/gen-web-components-md.mjs` (writes the repo-root `docs/web-components.md`; `root` is now `packages/ui`, lines ~143, ~170):
- change the output target from `join(root, 'docs/web-components.md')` to `join(root, '..', '..', 'docs/web-components.md')` (keep writing the repo-root `docs/`).

- [ ] **Step 5: Re-point the two root-anchored `.gitignore` lines**

In root `.gitignore`, the non-anchored entries (`node_modules/`, `dist/`, `storybook-static/`, `test-results/`, `spike-screens/`, `*.log`) already match at any depth — leave them. Re-point the two **anchored** lines:
- `src/elements/compiled.css` → `packages/ui/src/elements/compiled.css`
- `tests/e2e/__screenshots__/pill-skins/` → `packages/ui/tests/e2e/__screenshots__/pill-skins/`

- [ ] **Step 6: Create `.npmrc` (mirror npm's flat layout + keep lifecycle hooks)**

Create `/.npmrc`:
```ini
node-linker=hoisted
enable-pre-post-scripts=true
```

- [ ] **Step 7: Create `pnpm-workspace.yaml`**

Create `/pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
# examples/* are added during the examples-refresh PRs (PR 2+)
```

- [ ] **Step 8: Create `nx.json`**

Create `/nx.json`:
```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "sharedGlobals": []
  },
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "cache": true,
      "outputs": ["{projectRoot}/dist", "{projectRoot}/storybook-static"]
    },
    "typecheck": { "cache": true },
    "test": { "cache": true },
    "dev": { "dependsOn": ["^build"], "cache": false }
  }
}
```
(`dev.dependsOn ["^build"]` makes Task 2's `docs:dev` wait for `ui:build`; `ui:dev` has no upstream so it starts immediately. If the installed NX flags `dev` as a long-running task, add `"continuous": true` to the `dev` default.)

- [ ] **Step 9: Replace the root `package.json` with a private orchestrator**

Overwrite `/package.json`:
```json
{
  "name": "kitn-ai",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.24.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "nx run-many -t dev",
    "build": "nx run-many -t build",
    "test": "nx run-many -t test",
    "typecheck": "nx run-many -t typecheck",
    "build:ui": "nx build ui",
    "build:docs": "nx build docs"
  }
}
```

- [ ] **Step 10: Replace the root `README.md` with a short monorepo overview**

Overwrite `/README.md`:
```markdown
# kitn-ai

Monorepo for **@kitn.ai/ui** — framework-agnostic, Shadow-DOM `kai-*` web components for building AI chat UIs, authored in SolidJS.

## Layout

- [`packages/ui`](packages/ui) — the published kit (`@kitn.ai/ui`) + Storybook + the `kai` MCP.
- [`apps/docs`](apps/docs) — the public docs site (ui.kitn.ai), consuming the kit via `workspace:*`.
- [`examples/`](examples) — framework consumer examples.

## Develop

```bash
pnpm install
pnpm dev      # Storybook (6006) + docs (4321) together
pnpm build    # build every workspace (ui before docs)
pnpm test     # run all workspace tests
```

Package docs: [`packages/ui/README.md`](packages/ui/README.md).
```

- [ ] **Step 11: Install NX and convert to a pnpm lockfile**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
rm -rf node_modules packages/ui/node_modules
pnpm add -Dw nx@latest
pnpm install
```
Expected: a single `pnpm-lock.yaml` at root; `node_modules` populated (hoisted layout). NX is a root devDependency.

- [ ] **Step 12: Build the kit from the workspace and verify the published artifact is identical**

```bash
nx build ui
ls packages/ui/dist/theme.tokens.css packages/ui/src/elements/element-meta.json   # postbuild ran
cd packages/ui && npm pack --dry-run 2>&1 | sed -n 's/^npm notice [0-9.]*[kMG]*B *//p' | sort > /tmp/pack-new.txt
diff /tmp/pack-baseline.txt /tmp/pack-new.txt; cd ..
```
Expected: `nx build ui` PASSES (both verify guards print OK); `theme.tokens.css` + `element-meta.json` exist (proves `prebuild`/`postbuild` hooks ran under pnpm); the `diff` is **empty** (published file list unchanged). If the `npm pack --dry-run` parsing differs by npm version, instead list with `npm pack --dry-run --json | jq -r '.[0].files[].path' | sort`.

- [ ] **Step 13: Run the full kit gate green from the workspace**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
nx typecheck ui                                   # = tsc x4
pnpm --filter @kitn.ai/ui exec vitest run --project=unit  # jsdom unit (~1225)
pnpm --filter @kitn.ai/ui test:react              # react adapter
npx playwright install --with-deps chromium
pnpm --filter @kitn.ai/ui test:e2e                # cross-origin matrix — proves remote-* path fixes
```
Expected: typecheck 4/4 PASS; unit ~1225 PASS; react PASS; e2e PASS (the e2e pass specifically confirms `examples/remote-host` + `examples/remote-provider` resolve `../../packages/ui/src/...` and the `dev:host`/`dev:provider` webServers serve from `../../examples/...`).

- [ ] **Step 14: Verify `pnpm dev` boots Storybook (docs arrives in Task 2)**

```bash
( pnpm dev & sleep 45; curl -sSf http://localhost:6006 >/dev/null && echo "STORYBOOK UP"; kill %1 ) 2>&1 | tail -5
```
Expected: `STORYBOOK UP`. (`nx run-many -t dev` currently has only the `ui` project; `apps/docs` joins in Task 2.)

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "refactor(repo): lift the kit into packages/ui (pnpm + NX workspace)" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `docs-site` → `apps/docs`, consume `@kitn.ai/ui` via `workspace:*`, delete `sync-kit`

**Files:**
- Move: `docs-site/` → `apps/docs/`
- Modify: `apps/docs/package.json`, `apps/docs/src/components/example/kit.ts`, `apps/docs/.gitignore`, `packages/ui/package.json` (add `./element-meta.json` export), root `context7.json`, the docs file that imports `src/data/element-meta.json`
- Create: `apps/docs/scripts/copy-kit-assets.mjs` (the minimal 4-file asset step)
- Delete: `apps/docs/scripts/sync-kit.mjs`, `docs-site/package-lock.json`

**Interfaces:**
- Consumes: NX project `ui` and its `@kitn.ai/ui` exports (`./elements`, `./element-meta.json`, `dist/elements/autoloader.js`, `dist/theme.tokens.css`, `llms.txt`, `llms-full.txt`).
- Produces: NX project `docs` (= `apps/docs`) with a `build` target depending on `ui:build`, and a `dev` target (Astro on 4321).

- [ ] **Step 1: Move the docs app and remove its standalone lockfile**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
mkdir -p apps
git mv docs-site apps/docs
git rm apps/docs/package-lock.json
```

- [ ] **Step 2: Make `apps/docs` a workspace consumer**

In `apps/docs/package.json`:
- set `"name": "@kitn.ai/docs"`, add `"private": true`, add `"nx": { "name": "docs" }`
- add the dependency: `"@kitn.ai/ui": "workspace:*"`
- remove the `"sync:kit"`, `"predev"`, `"prebuild"` scripts; add `"prebuild": "node scripts/copy-kit-assets.mjs"`

- [ ] **Step 3: Add the `./element-meta.json` export to the kit**

In `packages/ui/package.json` `exports`, add (after `./theme.tokens.css`):
```json
    "./element-meta.json": "./src/elements/element-meta.json",
```

- [ ] **Step 4: Switch the interactive-examples loader to a package import**

In `apps/docs/src/components/example/kit.ts`, replace the runtime URL import (the `const base = import.meta.env.BASE_URL…` + `import(/* @vite-ignore */ \`${base}/kitn/kai.es.js\`)` block, ~lines 14-23) with:
```ts
    // Resolve the live workspace package — Vite honors @kitn.ai/ui sideEffects,
    // so the elements self-register. No raw-bundle URL, no sync-kit drift.
    kitPromise = import('@kitn.ai/ui/elements').then(() =>
      customElements.whenDefined('kai-chat'),
    );
```
Keep the rest of the file (`syncKaiTheme`, `syncToastRegionTheme`) unchanged.

- [ ] **Step 5: Switch the metadata import to the package export**

```bash
grep -rn "data/element-meta\|data/icon-names" apps/docs/src
```
For each hit (the props/events table data source), replace the import of `../data/element-meta.json` with `@kitn.ai/ui/element-meta.json`. (If `icon-names.json` is consumed, add a matching `"./icon-names.json": "./src/elements/icon-names.json"` export in Step 3 and repoint it too.)

- [ ] **Step 6: Create the minimal 4-file asset step (replaces the full-bundle sync)**

Create `apps/docs/scripts/copy-kit-assets.mjs`:
```js
// Copy ONLY the few raw-served kit assets the standalone demos need — the
// interactive examples now import @kitn.ai/ui directly (Vite-resolved). This is
// a deliberate, bounded copy, NOT the old sync-kit full-bundle mirror.
import { createRequire } from 'node:module';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgRoot = dirname(require.resolve('@kitn.ai/ui/package.json'));
const here = dirname(new URL(import.meta.url).pathname);
const pub = join(here, '..', 'public');

mkdirSync(join(pub, 'kitn', 'elements'), { recursive: true });
// autoloader-demo.html loads these two as raw assets (the zero-build CDN path):
cpSync(join(pkgRoot, 'dist/elements/autoloader.js'), join(pub, 'kitn/elements/autoloader.js'));
cpSync(join(pkgRoot, 'dist/theme.tokens.css'), join(pub, 'kitn/theme.tokens.css'));
// llms.txt / llms-full.txt served at the site root for AI agents:
cpSync(join(pkgRoot, 'llms.txt'), join(pub, 'llms.txt'));
cpSync(join(pkgRoot, 'llms-full.txt'), join(pub, 'llms-full.txt'));
console.log('[copy-kit-assets] copied 4 raw-served assets from @kitn.ai/ui');
```
(`require.resolve('@kitn.ai/ui/package.json')` needs a `"./package.json": "./package.json"` export in `packages/ui/package.json` — add it in Step 3 if absent.)

- [ ] **Step 7: Delete `sync-kit` and update the docs `.gitignore`**

```bash
git rm apps/docs/scripts/sync-kit.mjs
```
In `apps/docs/.gitignore`, keep `public/kitn/`, `public/llms.txt`, `public/llms-full.txt` (still generated by `copy-kit-assets.mjs`); remove the `src/data/*.json` ignore line **only if** `element-meta.json`/`icon-names.json` are no longer copied there (they are now package imports).

- [ ] **Step 8: Re-point `context7.json` at the renamed docs path**

In root `context7.json`, change any `docs-site/src/content/docs` path under `folders`/`excludeFolders` to `apps/docs/src/content/docs`.

- [ ] **Step 9: Install (links the workspace dep) and build the docs**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm install        # links @kitn.ai/ui workspace:* into apps/docs
nx build docs       # builds ui first (dependsOn ^build), runs copy-kit-assets, astro build
```
Expected: `pnpm install` resolves `@kitn.ai/ui` to the workspace package; `nx build docs` PASSES; `apps/docs/dist/` produced; `apps/docs/public/kitn/elements/autoloader.js` + `theme.tokens.css` + `public/llms*.txt` present.

- [ ] **Step 10: IVP — the interactive examples actually register (the whole point)**

```bash
( nx dev docs & sleep 40
  curl -sSf "http://localhost:4321/" >/dev/null && echo "DOCS UP"
  kill %1 ) 2>&1 | tail -5
```
Then a browser check (storybook-static / static builds can't register web components, so this MUST hit the live dev server): open a docs page containing an interactive example, confirm a `<kai-chat>` upgrades (shadow root present) and the standalone `/autoloader-demo.html` renders. Expected: `DOCS UP` and a registered `kai-chat` (defer the full visual pass to the end-of-migration IVP per the supervisor's standing rule).

- [ ] **Step 11: Verify `pnpm dev` now boots BOTH**

```bash
( pnpm dev & sleep 50
  curl -sSf http://localhost:6006 >/dev/null && echo "STORYBOOK UP"
  curl -sSf http://localhost:4321 >/dev/null && echo "DOCS UP"
  kill %1 ) 2>&1 | tail -8
```
Expected: both `STORYBOOK UP` and `DOCS UP` — the headline ergonomic goal.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(docs): apps/docs consumes @kitn.ai/ui via workspace:* (delete sync-kit)" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Move release-please to `packages/ui` + rework CI

**Files:**
- Modify: `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/test.yml`, `.github/workflows/deploy-docs.yml`, `.github/workflows/release-please.yml`

**Interfaces:**
- Consumes: NX projects `ui` and `docs`; the kit at `packages/ui` (with `packages/ui/CHANGELOG.md` moved there in Task 1).

- [ ] **Step 1: Point release-please at the new package path**

`release-please-config.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": false,
  "packages": {
    "packages/ui": {
      "release-type": "node",
      "package-name": "@kitn.ai/ui"
    }
  }
}
```
`.release-please-manifest.json`:
```json
{ "packages/ui": "0.18.0" }
```

- [ ] **Step 2: Dry-run release-please to confirm it resolves the package (the highest-risk check)**

```bash
npx release-please release-pr --dry-run \
  --repo-url=kitn-ai/ui \
  --config-file=release-please-config.json \
  --manifest-file=.release-please-manifest.json \
  --token="${GH_TOKEN:-$(gh auth token)}" 2>&1 | tail -30
```
Expected: the dry-run plans a release-PR (or "no release necessary") for **`@kitn.ai/ui`** rooted at **`packages/ui`**, targeting `packages/ui/package.json` + `packages/ui/CHANGELOG.md`. It must NOT reference the repo root `"."`. If no token is available, at minimum assert the config/manifest JSON parse and that `packages/ui/package.json` + `packages/ui/CHANGELOG.md` exist.

- [ ] **Step 3: Rework `test.yml` (the REQUIRED check) for pnpm + Node 22**

Replace the `test` job steps after checkout with:
```yaml
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: nx build ui
      - run: nx typecheck ui
      - run: pnpm --filter @kitn.ai/ui exec vitest run --project=unit
      - run: pnpm --filter @kitn.ai/ui test:react
      - run: npx playwright install --with-deps chromium
      - run: pnpm --filter @kitn.ai/ui test:e2e
```
Apply the same `pnpm/action-setup` + `setup-node(cache: pnpm)` + `pnpm install --frozen-lockfile` + `nx build ui` + `pnpm --filter @kitn.ai/ui test:storybook:ci` swap to the non-required `storybook` job. Keep both jobs and the branch-protection (required = `test`, non-required = `storybook`) contract intact.

- [ ] **Step 4: Rework `deploy-docs.yml` (drop the manual kit pre-build + docs `npm ci`)**

Replace the `build` job's node/install/build steps with:
```yaml
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: nx build docs        # builds @kitn.ai/ui first (dependsOn ^build), then astro
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/docs/dist
```
(The GitHub-Pages base path and ui.kitn.ai custom domain config inside `apps/docs` are unchanged.)

- [ ] **Step 5: Rework `release-please.yml` to publish from `packages/ui`**

Keep the `googleapis/release-please-action@v4` step unchanged (it reads the root config/manifest). For the `release_created` publish steps, swap npm→pnpm and publish the package:
```yaml
      - uses: pnpm/action-setup@v4
        if: ${{ steps.release.outputs.release_created }}
      - uses: actions/setup-node@v4
        if: ${{ steps.release.outputs.release_created }}
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
        if: ${{ steps.release.outputs.release_created }}
      - run: pnpm --filter @kitn.ai/ui publish --access public --no-git-checks
        if: ${{ steps.release.outputs.release_created }}
```
(`prepublishOnly` → `npm run build` runs via pnpm's lifecycle; `.npmrc enable-pre-post-scripts=true` guarantees it. OIDC trusted publishing / provenance is unchanged — no `NODE_AUTH_TOKEN`.)

- [ ] **Step 6: Validate the workflow YAML + a final green gate locally**

<!-- gate-list: partial -- historical record, predates lint:gate-parity -->
```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
for f in .github/workflows/*.yml; do node -e "require('js-yaml')" 2>/dev/null && npx --yes js-yaml "$f" >/dev/null && echo "OK $f"; done
nx run-many -t build          # ui + docs both build, ui first
nx typecheck ui
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
```
Expected: each workflow parses; `nx run-many -t build` builds `ui` then `docs`; typecheck + unit green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "ci(repo): release-please + workflows target packages/ui under pnpm/NX" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## End-of-PR verification (before opening the PR)

- [ ] `pnpm install --frozen-lockfile` clean from scratch (`rm -rf node_modules && pnpm install --frozen-lockfile`).
- [ ] `nx run-many -t build` green (ui + docs); both verify guards pass; `npm pack` file-list diff vs 0.18.0 baseline is empty.
- [ ] `nx typecheck ui` (4/4), unit (~1225), `test:react`, `test:e2e` all green.
- [ ] `pnpm dev` boots Storybook (6006) + docs (4321) together.
- [ ] release-please dry-run resolves `@kitn.ai/ui @ packages/ui`.
- [ ] `git log --stat` shows renames (history preserved), and `docs/notes.md` / `docs/notes-native.md` are untouched.
- [ ] Open PR 1. After merge, watch the first release-please run; then start the examples-refresh plan (PR 2+), which adds `examples/*` to `pnpm-workspace.yaml` and converts each example to `workspace:*` + current API.

---

## Deferred to follow-up (NOT this PR)

- **Examples refresh** (PR 2+): add `examples/*` to the workspace; convert `react`/`vue`/`angular`/`solid` (drop `^0.2`/`^0.4` pins, update to current `kai-*` API), `nextjs`/`tanstack-start` (`file:../..` → `workspace:*`), `composable` (`../../dist` → workspace), and fully convert `remote-host`/`remote-provider` from relative-source imports to `workspace:*`. Plus the consistent mini-chat showcase narrative.
- `scripts/audit-a11y.mjs` hardcoded `localhost:8000/examples/composable` URL (dev-only tool, not in any gate) — fix alongside the examples PR.
- Root README expansion into a fuller monorepo landing.
