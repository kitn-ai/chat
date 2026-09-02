# Blocks become a package: `packages/blocks` (`@kitn.ai/blocks`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the private workspace package `packages/blocks` and relocate the authored block sources, the blocks registry and the shared form renderer into it, with every consumer moving from a relative cross-package reach to a package specifier and no behaviour change anywhere.

**Architecture:** A pure relocation across a package boundary. `packages/blocks` depends on nothing at runtime -- not `@kitn.ai/ui`, not `zod`, not `node:*` -- which the registry module already earns by taking its two kit-derived inputs (`routeIntegrations`, `nonscalarByTag`) by injection. It ships TypeScript source with no build step, so its `exports` map points at `.ts` files and every consumer (the ui build scripts via their existing esbuild `importTs` round trip, `create-kai` via esbuild, the gallery via vite, the ui typecheck passes via `moduleResolution: bundler`) reads the same one module identity. The ui package gains `@kitn.ai/blocks` as a `workspace:*` devDependency; the ui build depends on blocks, blocks depends on nothing, no cycle.

**Tech Stack:** pnpm + NX workspace, Vite 8 (`packages/ui/config/vite/{lib,node,page}.ts`, target selected by `KAI_BUILD`), vite-plugin-dts, vitest (ui projects `unit` / `emitted` / `storybook`; a new node-environment suite in `packages/blocks`), tsc, esbuild (the `importTs` helper in the ui generators and `create-kai`'s bundler), GitHub Actions `test` aggregator over five legs.

**Spec:** `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md`, sections 2 (where things live), 5 (verification) and 7 (sequencing). **This plan is PR A of that spec's five, and PR A only.** Predecessor spec: `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md`. Precedent plan, whose gate discipline this one copies: `docs/superpowers/plans/2026-09-02-mcp-out-of-src.md`.

---

## Scope: PR A, and nothing else

IN scope:

- `packages/blocks` created: `@kitn.ai/blocks`, `private: true`, never published, exports `.` and `./forms`.
- `packages/ui/blocks/<id>/**` -> `packages/blocks/blocks/<id>/**`.
- `packages/ui/mcp/blocks/registry.ts` -> `packages/blocks/src/registry.ts`.
- `packages/ui/mcp/blocks/forms.ts` -> `packages/blocks/src/forms.ts`, **as ONE file**.
- `packages/ui/mcp/tests/blocks-registry.test.ts` -> `packages/blocks/tests/registry.test.ts`, split per the ruling below.
- Every consumer moved to specifier imports.
- The two dead `dts.include` entries in `packages/ui/config/vite/lib.ts` deleted.

OUT of scope, do not start any of it:

- `src/forms/` as a per-framework directory. That is PR B. `forms.ts` stays ONE file this PR.
- `src/targets.ts` and a `./targets` export. That is PR B/D.
- The `/blocks` page on `apps/docs`, and retiring `packages/ui/apps/gallery`, `dist/gallery` or the `kai dev` gallery route. That is PR C. The gallery keeps working; only its import specifiers change.
- New `FRAMEWORK_SIGNALS` rows, the targets table in `planAdd`, README printing. That is PR D.
- Any change to what a block IS, to any block's authored source, or to any renderer's output.

---

## Global Constraints

- Branch: `feat/blocks-package`, cut from `origin/main`. Never `git checkout` in someone else's working checkout; if another agent owns this tree, stop and say so.
- Conventional commits, all of the form `refactor(blocks): <what>`. No `feat`, no `fix`: this PR changes no behaviour, and a `feat` here would move the release-please bump for a move.
- **No behaviour change.** If a step makes you want to improve something you are reading, do not. Write it down for the PR body instead.
- **A fresh clone or worktree needs THREE things before the unit suite means anything, and skipping one produces a failure that reads like a broken checkout:** (1) `pnpm install` -- a worktree under `.claude/worktrees/` resolves up into the parent checkout's `node_modules` while Vite refuses to serve paths outside the worktree root, and the whole suite dies on one identical `Cannot find module '/@fs/<parent>/node_modules/@testing-library/jest-dom/dist/vitest.mjs'`; (2) `pnpm --filter @kitn.ai/ui run build:css`, because `packages/ui/src/elements/compiled.css` is generated and gitignored and without it a large batch of files die on `Failed to resolve import "./compiled.css?inline"`; (3) a real build, for `dist/custom-elements.json` and `dist/blocks/`. `npm run` puts the ancestor `.bin` on PATH, so `build:css` can print success while the suite still fails identically. Do all three before believing any red.
- When a cold build is needed run `cd packages/ui && npm run build`, not `nx build ui`: the NX cache can restore a build target whose generators write into the SOURCE tree, printing success while changing nothing.
- **Never pipe a heavy suite or a build through `tail` inside an `&&` chain** -- the exit status becomes the pipe's and a failure reads as a pass. Run each gate as its own command.
- Scratchpad paths are for scratch only. A scratchpad path must never appear in a committed file, and the final task greps for that.
- macOS `sed` needs the empty backup argument: `sed -i '' -E`.
- No em dashes and no emoji in any prose this plan adds to the tree (the registry's own `validateBlockManifest` refuses both in block copy, and the house voice refuses them everywhere else).
- `packages/blocks` is PRIVATE. It must NOT be added to `release-please-config.json`, and NOT to the publish loop in `.github/workflows/release-please.yml`. Task 8 states this as a deliberate non-change.
- `docs/superpowers/**` is scanned by `node packages/ui/scripts/lint-gate-parity.mjs` and `node packages/ui/scripts/lint-threshold-derivation.mjs`. Any fenced block or table you add to a doc under that tree that looks like a merge-gate enumeration needs `<!-- gate-list: partial -- <reason> -->` above it; any numeric threshold in prose needs a backticked producing command, the literal phrase `ratchet, not a target`, or `lint-thresholds: waive -- <reason>`. This plan file already carries those directives; keep them if you edit it.
- `gh pr update-branch` before merge.
- Every commit ends with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

## Rulings this plan makes

**1. The moved test SPLITS, and the split is by what each assertion is about.**

`packages/ui/mcp/tests/blocks-registry.test.ts` has four dependencies on `packages/ui` that a package "depending on nothing" cannot inherit: `listIntegrations()` from `packages/ui/mcp/registry.ts`, `packages/ui/src/elements/element-nonscalar.json`, `packages/ui/package.json`'s version, and the BUILT artifacts under `packages/ui/dist/blocks/` plus the generated driver page under `packages/ui/scripts/block-driver/pages/generated/`.

- Everything that is a fact about the registry MODULE and the block SOURCES -- both of which now live in `packages/blocks` -- moves to `packages/blocks/tests/registry.test.ts`. Its two injected inputs come from LOCAL FIXTURES declared in the test file, because the module takes them by injection precisely so that it does not know them; a test of an injection seam that reaches for the real value is testing the caller. The fixtures are named as fixtures so nobody reads them as a claim about the real catalog.
- The four assertions that need `packages/ui`'s real catalogs, real version or build outputs stay in `packages/ui`, in a new small file `packages/ui/mcp/tests/blocks-artifacts.test.ts` that imports the registry by specifier. That keeps them in the ui `unit` project (so a stale build is caught without waiting for `verify:blocks`, which needs a browser and a build) and keeps `packages/blocks` free of any build-order dependency.

The alternative -- giving `packages/blocks` a devDependency on `@kitn.ai/ui` -- does not work even setting the discipline aside: `listIntegrations` is not on any public export of `@kitn.ai/ui`, so the reach would have to be the same relative path this PR exists to delete.

**2. `packages/blocks` has no build step and its `exports` map points at `.ts` source.** Giving it a build puts a build ordering between it and the ui build for no gain, since every consumer that matters bundles the source anyway. Two consequences to hold: the ui typecheck passes pull the blocks sources into their own programs (good -- a blocks-side type error is visible from both sides), and the two `.mjs` generators keep their existing esbuild `importTs` round trip, pointed at the entry **read out of the package's own `exports` map** rather than at a path literal.

**3. Two tsconfigs in `packages/blocks`, and the source pass's `"types": []` plus its DOM-free `lib` are both load-bearing.** No ambient type packages mechanically enforces "no `node:*`" -- a `node:fs` import there becomes a compile error rather than a discipline nobody re-checks. A DOM-free `lib` enforces the other axis: this package emits HTML as strings and never touches a document, and both source files were measured compiling clean under `lib: ["ES2023"]` (the one `HTMLElement` in `forms.ts` sits inside a string literal). The tests do read the filesystem, so they get their own pass with `types: ["node"]`. `typecheck` runs both.

**4. `verbatimModuleSyntax` and `isolatedModules` are new to these two files, and are expected to be a NO-OP.** They came from `packages/create-kai/tsconfig.json`, the workspace-package precedent this plan copies. Measured before this plan was written: both files compile CLEAN under `verbatimModuleSyntax` + `isolatedModules` + `noUnusedLocals`. `registry.ts` has no imports at all, and `forms.ts`'s single import (`import { generateCdnForm, type Block, type CdnFormOptions } from './registry'`) already uses inline `type` modifiers. So a red pass in Task 4 Step 8 is UNLIKELY; if one appears anyway the fix is to add a `type` modifier or change `export {` to `export type {`, never to relax an option.

**5. The tarball gate is a file list with FOUR enumerated lines, not a byte gate and not an unchanged list.** `dist/` ships inside `@kitn.ai/ui` (`files: ["dist", ...]`), so `dist/blocks/**` and `dist/assets/**` are both consumer-visible. `CONTRACT_BANNER` (in the registry module) names where a block's source lives, that directory moves, and the banner has two consequences: it changes one comment line in each generated CDN form, and -- because the registry module is bundled into `dev.ts`'s chunk of the `construct-cli` build -- it changes that chunk's CONTENT HASH, so `dist/assets/dev-<hash>.js` is renamed. Measured on the pre-move tree: exactly one file imports that chunk (`dist/construct-cli.es.js`, fixed name), so the rename does not cascade. The expected pack-list delta is therefore three removed and one added, enumerated in Task 9 Step 2, and the expected `diff -r` set is enumerated in Step 3. Anything outside either is a finding, not a nuisance.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `packages/blocks/package.json` | `@kitn.ai/blocks`, private, `type: module`, exports `.` / `./forms` / `./package.json`, inline `nx` key, scripts `typecheck` and `test` |
| `packages/blocks/tsconfig.json` | the SOURCE pass: browser lib, `"types": []`, strict, `verbatimModuleSyntax`, `isolatedModules`, `noEmit` |
| `packages/blocks/tsconfig.tests.json` | the TESTS pass: same strictness, `types: ["node"]` |
| `packages/blocks/vitest.config.ts` | node environment, `include: ['tests/**/*.test.ts']` |
| `packages/blocks/README.md` | what the package is, why it depends on nothing, what injects what |
| `packages/blocks/src/registry.ts` | moved from `packages/ui/mcp/blocks/registry.ts` |
| `packages/blocks/src/forms.ts` | moved from `packages/ui/mcp/blocks/forms.ts` |
| `packages/blocks/blocks/<id>/**` | moved from `packages/ui/blocks/<id>/**` |
| `packages/blocks/tests/registry.test.ts` | moved from `packages/ui/mcp/tests/blocks-registry.test.ts`, less the four ui-dependent assertions |
| `packages/ui/mcp/tests/blocks-artifacts.test.ts` | the four ui-dependent assertions, keeping them in the ui `unit` project |

**Modified, grouped by the task that owns them:**

| Task | Files |
|---|---|
| 2 | `packages/ui/package.json`, `packages/create-kai/package.json` (one devDependency each) |
| 3 | `packages/ui/scripts/gen-blocks.mjs`, `packages/ui/scripts/verify-blocks.mjs`, `packages/create-kai/scripts/build.mjs`, `packages/ui/mcp/tests/blocks-registry.test.ts`, `packages/ui/mcp/blocks/registry.ts` (two prose paths) |
| 4 | `packages/ui/mcp/construct/dev.ts`, `packages/ui/mcp/construct/dev.test.ts`, `packages/ui/apps/gallery/{main.tsx,GalleryPage.tsx,GalleryPage.stories.tsx}`, `packages/create-kai/src/{blocks.ts,react-form.ts}`, `packages/create-kai/test/add.test.ts`, `packages/ui/scripts/{gen-blocks,verify-blocks}.mjs` |
| 5 | `packages/ui/config/vite/lib.ts`, `packages/ui/tsconfig.mcp.json` |
| 6 | `packages/create-kai/src/build-guards.ts`, `packages/create-kai/test/build-guards.test.ts`, `packages/create-kai/scripts/verify-pack.mjs` |
| 7 | `.github/workflows/test.yml` |
| 8 | `docs/coupling-map.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md` |

**Deliberately NOT modified, each with its reason (Task 8 states these in the PR body):**

- `release-please-config.json` and `.github/workflows/release-please.yml` -- the package is private and must never enter the publish loop.
- `.gitignore` -- the generated driver pages stay at `packages/ui/scripts/block-driver/pages/generated/`; the driver does not move.
- `packages/ui/vitest.config.ts` coverage `include`/`exclude` -- it names `src/**` and `mcp/**` as globs, never `mcp/blocks` specifically, so the moved files simply leave the glob.
- `packages/ui/tsconfig.json` -- same: `include` names `mcp/**`, `exclude` names `mcp/mcp` and `mcp/tests`. Registry and forms leave the pass by leaving the directory.
- `packages/ui/tsconfig.tests.json` -- `mcp/tests/**` still exists and still holds a file (`blocks-artifacts.test.ts`).
- `packages/ui/scripts/lint-cdn-pins.mjs` -- its `SCAN_ROOTS` already includes `packages`, so `packages/blocks` stays in scope with no edit. Task 9 asserts this rather than assuming it.
- `packages/ui/scripts/story-roots.mjs` -- it returns roots under `packages/ui` only (`src`, `apps`), so `packages/blocks` is outside every story and solid-coverage scan by construction. Nothing to exclude.
- `packages/ui/scripts/verify-pack-weight.mjs` -- its `dist/blocks` ledger row is a narrative record of a past measurement, and PR A does not change what `dist/blocks` contains beyond one comment line. Read the tool's printed figure in Task 9; only if it prints a changed number does the row get amended, and then from the tool.

---

### Task 1: Baseline

**Files:**
- Create: nothing in the repo. Every baseline artifact lives in a scratch directory and is NEVER committed.

**Interfaces:**
- Produces: `$BASE/dist-baseline/` (a full copy of `packages/ui/dist`), `$BASE/pack-files-baseline.txt`, `$BASE/gates-baseline.txt`, `$BASE/ck-pack-baseline.txt`. Task 9 diffs against all four.

- [ ] **Step 1: Cut the branch**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git fetch origin
git status --porcelain
git checkout -b feat/blocks-package origin/main
```

Expected: `git status --porcelain` is clean before the checkout. If it is not, stop -- another agent may own this tree.

- [ ] **Step 2: Install and build cold**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm install
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npm run build:css
npm run build
```

Expected: the build exits 0. A red baseline makes every later diff meaningless; stop if it fails.

- [ ] **Step 3: Capture the dist, pack and gate baselines**

```bash
export BASE="$(mktemp -d)"
echo "baseline dir: $BASE"
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
cp -R dist "$BASE/dist-baseline"
npm pack --dry-run --json > "$BASE/pack-baseline.json"
node -e "const f=require(process.env.BASE+'/pack-baseline.json')[0].files.map(x=>x.path).sort();require('fs').writeFileSync(process.env.BASE+'/pack-files-baseline.txt',f.join('\n')+'\n')"
wc -l "$BASE/pack-files-baseline.txt"
```

Expected: a file count printed. Do not write that count into any committed file; it is read from the artifact each time.

- [ ] **Step 4: Capture the create-kai pack baseline and the gate list**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter create-kai run build
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai
npm pack --dry-run --json > "$BASE/ck-pack-baseline.json"
node -e "const f=require(process.env.BASE+'/ck-pack-baseline.json')[0].files.map(x=>x.path).sort();require('fs').writeFileSync(process.env.BASE+'/ck-pack-baseline.txt',f.join('\n')+'\n')"
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/scripts/lint-gate-parity.mjs --list > "$BASE/gates-baseline.txt"
head -3 "$BASE/gates-baseline.txt"
```

Expected: `--list` prints the required job's gate set. Task 7 adds exactly two entries to it; Task 9 diffs and asserts that only those two appear.

- [ ] **Step 5: Record the block ids the scan finds, for later comparison**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
ls packages/ui/blocks > "$BASE/block-ids-baseline.txt"
cat "$BASE/block-ids-baseline.txt"
```

Expected: the directory list. Every later scan must produce the same set; the registry is a directory scan, so a change here means the move lost a block.

- [ ] **Step 6: Nothing to commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git status --porcelain
```

Expected: empty (`dist/` is gitignored). This task makes no commit.

---

### Task 2: The package skeleton, and proof the toolchain resolves it

**Files:**
- Create: `packages/blocks/package.json`, `packages/blocks/tsconfig.json`, `packages/blocks/tsconfig.tests.json`, `packages/blocks/vitest.config.ts`, `packages/blocks/README.md`, `packages/blocks/src/.gitkeep` (deleted again in Task 4), `packages/blocks/tests/skeleton.test.ts` (deleted again in Task 4)
- Modify: `packages/ui/package.json`, `packages/create-kai/package.json`

**Interfaces:**
- Produces: the workspace package `@kitn.ai/blocks` with scripts `typecheck` (two tsc passes) and `test` (`vitest run`), and `exports` keys `.`, `./forms`, `./package.json`. Tasks 3, 4 and 6 resolve the package through `@kitn.ai/blocks/package.json` and read `exports['.'].default` out of it; that key MUST exist and MUST be a repo-relative path string.

- [ ] **Step 1: Write the package manifest**

Create `packages/blocks/package.json`:

```json
{
  "name": "@kitn.ai/blocks",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Authored kai blocks, the registry that understands their layout, and the shared form renderer. Never published: bundled into create-kai and the docs site.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/kitn-ai/ui.git",
    "directory": "packages/blocks"
  },
  "nx": {
    "name": "blocks"
  },
  "exports": {
    ".": {
      "types": "./src/registry.ts",
      "default": "./src/registry.ts"
    },
    "./forms": {
      "types": "./src/forms.ts",
      "default": "./src/forms.ts"
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.tests.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^4.1.0"
  }
}
```

Two things about this file that look like omissions and are decisions. `version` is `0.0.0` and is never bumped: the package is private and absent from `release-please-config.json`, so nothing rewrites it and nothing reads it.

The `nx` key carries a name and NOTHING else, and that is a **deliberate deviation from the spec**, which (section 2.1) says the package "carries an inline `nx` key on the pattern `packages/create-kai/package.json` already uses (a `targets` map with `test.dependsOn` and `typecheck.dependsOn`)". `nx.json`'s `targetDefaults` gives `test` and `typecheck` a cache entry and NO `dependsOn`, and this package's `test` and `typecheck` read only its own source, so an explicit `dependsOn` here would be noise pretending to be a constraint. (Contrast `packages/create-kai`, whose `test.dependsOn` names `build` for a real reason: its suite reads `dist/templates`.) Task 9's PR body lists this as a judgement call for the reviewer.

- [ ] **Step 2: Write the two tsconfigs**

Create `packages/blocks/tsconfig.json`:

```json
{
  "comment": "The SOURCE pass. TWO options here are load-bearing and neither is an omission. `types: []` means no ambient type packages, which turns a `node:fs` import in this package into a compile error rather than a discipline nobody re-checks. `lib` is ES2023 with NO DOM: this package emits HTML as STRINGS and never touches a document, so granting DOM would let a real DOM reach compile silently. Measured before it was written down: both source files compile clean with no DOM lib (the one `HTMLElement` in forms.ts sits inside a string literal, not a type position). The filesystem WALK lives in the callers that have a filesystem (packages/ui/scripts/gen-blocks.mjs, packages/ui/scripts/verify-blocks.mjs, packages/create-kai/src/blocks.ts); what they feed in is derived from their scan, never hand-listed. The tests DO read the filesystem and get their own pass in tsconfig.tests.json.",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": [],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/blocks/tsconfig.tests.json`:

```json
{
  "comment": "The TESTS pass. Same strictness as the source pass; the one difference is `types: [\"node\"]`, because the suite scans the real blocks/ directory off disk. Keeping this separate is what lets the source pass declare no ambient types and no DOM lib at all.",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["tests/**/*.ts", "src/**/*.ts"]
}
```

- [ ] **Step 3: Write the vitest config**

Create `packages/blocks/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node, not jsdom: this package is pure functions over injected data plus a
    // test suite that scans the authored block directories off disk. Nothing
    // here touches a DOM.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 4: Write the README**

Create `packages/blocks/README.md`:

```markdown
# @kitn.ai/blocks

The authored kai blocks, the registry that understands their layout, and the
shared form renderer. Private: never published, bundled into `create-kai` and
the docs site.

## What is here

- `blocks/<id>/` -- one directory per block. A directory IS a block when it
  holds a `registry-item.json`. Adding a block is adding a directory; nothing
  anywhere holds a list.
- `src/registry.ts` -- manifest validation, the directory-scan discovery, the
  derived index and per-block item JSON, the CDN-form generator, and
  `checkBlockContracts`.
- `src/forms.ts` -- the one renderer every delivery form goes through, so what
  the gallery shows is byte-for-byte what `create-kai add` writes.

## This package depends on nothing

Not on `@kitn.ai/ui`, not on `zod`, not on `node:*`. The two facts the registry
needs from the kit arrive by injection, from callers that have a filesystem:

| Injected input | Read from |
|---|---|
| `routeIntegrations` | `listIntegrations()` in `packages/ui/mcp/registry.ts` |
| `nonscalarByTag` | `packages/ui/src/elements/element-nonscalar.json` |
| `version` | `packages/ui/package.json` |

`tsconfig.json` declares no ambient type packages, which is what enforces the
`node:*` half mechanically rather than by convention.

## No build step

The `exports` map points at TypeScript source. Every consumer bundles it:
`packages/ui/scripts/gen-blocks.mjs` and `verify-blocks.mjs` through their
esbuild round trip, `create-kai` through its CLI bundle, the docs site through
vite. A build here would put a build ordering between this package and the ui
build and buy nothing.

## Gates

    pnpm --filter @kitn.ai/blocks run typecheck
    pnpm --filter @kitn.ai/blocks exec vitest run

The block CELLS -- every block's contracts, freshness, pins and its recorded
browser baseline -- are `pnpm --filter @kitn.ai/ui run verify:blocks`, which
lives in the ui package because it needs the kit's build outputs.
```

- [ ] **Step 5: Add the devDependency on both sides**

In `packages/ui/package.json`, add to `devDependencies`, in alphabetical position:

```json
"@kitn.ai/blocks": "workspace:*",
```

In `packages/create-kai/package.json`, add to `devDependencies`, immediately before the existing `"@kitn.ai/ui": "workspace:*"` line:

```json
"@kitn.ai/blocks": "workspace:*",
```

Both are `workspace:*`, so `sharedDevDepsProblem` (`packages/create-kai/src/build-guards.ts`) sees identical ranges and stays green. `pnpm-workspace.yaml` already globs `packages/*`, so it needs no edit.

- [ ] **Step 6: Write a throwaway test that proves the toolchain, and watch it fail first**

Create `packages/blocks/src/.gitkeep` (empty) and `packages/blocks/tests/skeleton.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('the package skeleton', () => {
  it('exports "." at a real source path read out of the exports map', () => {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), 'utf8')) as {
      exports: Record<string, { default: string }>;
    };
    expect(pkg.exports['.'].default).toBe('./src/registry.ts');
    expect(pkg.exports['./forms'].default).toBe('./src/forms.ts');
  });
});
```

- [ ] **Step 7: Install, then run the suite and watch it fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm install
pnpm --filter @kitn.ai/blocks exec vitest run
```

Expected: FAIL. `src/registry.ts` and `src/forms.ts` do not exist yet, but the assertion above only reads the manifest, so this passes on the manifest alone -- which is exactly the vacuous pass to avoid. Before running it, temporarily change `'./src/registry.ts'` in the test to `'./src/WRONG.ts'`, run, and confirm it goes RED naming the mismatch. Then change it back and run again.

- [ ] **Step 8: Run it green, and run the typecheck**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/blocks exec vitest run
pnpm --filter @kitn.ai/blocks run typecheck
```

Expected: both exit 0. The typecheck's source pass reads an empty `src/` and reports nothing, which is correct for a skeleton.

- [ ] **Step 9: Confirm the specifier resolves from the ui package**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node -e "const {createRequire}=require('node:module');const r=createRequire('/Users/home/Projects/kitn-ai/kitn-chat/packages/ui/package.json');console.log(r.resolve('@kitn.ai/blocks/package.json'))"
node -e "const {createRequire}=require('node:module');const r=createRequire('/Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai/package.json');console.log(r.resolve('@kitn.ai/blocks/package.json'))"
```

Expected: both print a path ending `packages/blocks/package.json`. If either throws `Cannot find module`, `pnpm install` did not link the package; re-run it before going on.

- [ ] **Step 10: Confirm NX sees the package AND the new edge**

This is not ceremony. `nx.json`'s default `namedInputs` are `{projectRoot}/**/*`, so the block sources are about to leave `ui`'s project root. The ONLY thing that keeps a block-source edit invalidating `ui`'s cached `build` is the project-graph edge that the `workspace:*` devDependency creates. If that edge is not there, `nx build ui` can serve a cache hit over changed block sources and print success, which is the failure mode CLAUDE.md already records for this build target in a different form.

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx show projects
pnpm exec nx show project ui --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log(JSON.stringify(p.implicitDependencies??[]),JSON.stringify(Object.keys(p.targets??{})))})"
pnpm exec nx graph --file=/tmp/nx-graph.json >/dev/null && node -e "const g=require('/tmp/nx-graph.json');const deps=(g.graph?.dependencies?.ui??[]).map(d=>d.target);console.log('ui ->',deps.join(', '));if(!deps.includes('blocks')){console.error('NO EDGE ui -> blocks: nx cannot see the devDependency, and a block-source edit will not invalidate ui build cache');process.exit(1)}"
```

Expected: `nx show projects` lists `blocks`, and the graph probe prints `ui -> ... blocks` and exits 0. If the edge is missing, the devDependency did not land or `pnpm install` did not link it -- fix that before going on, and do NOT paper over it with an `implicitDependencies` entry.

- [ ] **Step 11: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/blocks packages/ui/package.json packages/create-kai/package.json pnpm-lock.yaml
git commit -m "$(cat <<'MSG'
refactor(blocks): create the packages/blocks workspace package skeleton

Private, never published, depends on nothing. Two tsconfig passes: the source
pass declares no ambient type packages, which is what enforces the no-node:*
discipline mechanically. The ui and create-kai packages gain it as a
workspace:* devDependency; nothing imports it yet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 3: The block sources move

**Files:**
- Move: `packages/ui/blocks/<id>/**` -> `packages/blocks/blocks/<id>/**` (`git mv`)
- Modify: `packages/ui/scripts/gen-blocks.mjs:51-54`, `packages/ui/scripts/verify-blocks.mjs:57-61,117-136`, `packages/create-kai/scripts/build.mjs:162-164`, `packages/ui/mcp/tests/blocks-registry.test.ts:40-42`, `packages/ui/mcp/blocks/registry.ts:3,383`

Line numbers drift. Confirm each with a grep before editing; the anchor text in every step below is the authority.

**Interfaces:**
- Consumes: `@kitn.ai/blocks/package.json` resolving (Task 2 Step 9).
- Produces: a `blocksPackageRoot()` shape that Tasks 4 and 6 reuse verbatim -- resolve `@kitn.ai/blocks/package.json` with `createRequire`, take its `dirname`, and join `blocks` for the authored sources.

This task moves ONLY the block directories. `registry.ts` and `forms.ts` stay in `packages/ui/mcp/blocks/` until Task 4, so every consumer keeps working through the same imports it has today and the task is independently gateable.

- [ ] **Step 1: Move the directories**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
mkdir -p packages/blocks/blocks
for d in $(ls packages/ui/blocks); do git mv "packages/ui/blocks/$d" "packages/blocks/blocks/$d"; done
rmdir packages/ui/blocks
git status --porcelain | head -40
ls packages/blocks/blocks
```

Expected: `git status` shows renames only (`R ` entries), and `ls` prints the same set as `$BASE/block-ids-baseline.txt`.

```bash
diff <(ls packages/blocks/blocks) "$BASE/block-ids-baseline.txt"
```

Expected: empty.

- [ ] **Step 2: Watch `verify:blocks` fail, so the path edits are earned**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/ui run verify:blocks
```

Expected: RED with an **uncaught `ENOENT`** naming `packages/ui/blocks`, thrown out of the `readdirSync(BLOCKS_DIR, ...)` in `verify-blocks.mjs`'s `scanBlocks()`.

Do NOT expect the friendly `a zero-block scan is a broken walk, not an empty gallery` message: that guard sits AFTER the scan and only fires on a directory that exists and is empty, so the `rmdir` in Step 1 makes the readdir throw first. The distinction is worth holding rather than smoothing over -- the gate is loud either way, which is what this step is checking, but a plan that predicted the friendly message and got a stack trace would look like something had gone wrong.

(If you would rather see the friendly message too, run `mkdir packages/ui/blocks && pnpm --filter @kitn.ai/ui run verify:blocks && rmdir packages/ui/blocks`. Optional; the ENOENT is sufficient evidence.)

- [ ] **Step 3: Point `gen-blocks.mjs` at the package**

In `packages/ui/scripts/gen-blocks.mjs`, replace lines 51-54:

```js
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKS_DIR = join(ROOT, 'blocks');
const OUT_DIR = join(ROOT, 'dist', 'blocks');
const DRIVER_PAGES_DIR = join(ROOT, 'scripts', 'block-driver', 'pages', 'generated');
```

with:

```js
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The authored block sources live in their own package now. Resolve it rather
// than joining a path literal: a repo-root literal is exactly the hand-typed
// restatement that goes stale the next time something moves.
const BLOCKS_PKG_JSON = createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json');
const BLOCKS_PKG_ROOT = dirname(BLOCKS_PKG_JSON);
const BLOCKS_DIR = join(BLOCKS_PKG_ROOT, 'blocks');
// The OUTPUTS stay in packages/ui: dist/blocks/ ships inside @kitn.ai/ui, and
// the driver pages are served by this package's block driver.
const OUT_DIR = join(ROOT, 'dist', 'blocks');
const DRIVER_PAGES_DIR = join(ROOT, 'scripts', 'block-driver', 'pages', 'generated');
```

and add `createRequire` to the imports, immediately after the existing `node:url` import line:

```js
import { createRequire } from 'node:module';
```

- [ ] **Step 4: Point `verify-blocks.mjs` at the package**

In `packages/ui/scripts/verify-blocks.mjs`, replace line 58:

```js
const BLOCKS_DIR = join(ROOT, 'blocks');
```

with:

```js
// The authored block sources are their own package; the driver, its baselines
// and the generated pages stay here, because they need this package's build.
const BLOCKS_PKG_ROOT = dirname(createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json'));
const BLOCKS_DIR = join(BLOCKS_PKG_ROOT, 'blocks');
```

and add to the imports, immediately after the existing `node:url` import line:

```js
import { createRequire } from 'node:module';
```

- [ ] **Step 5: Fix the two operator-facing messages that name the old path**

In `packages/ui/scripts/verify-blocks.mjs`, inside `driverPrereqErrors`, replace:

```js
    errors.push(`${name}: no state script at blocks/${name}/states.mjs -- every block declares its driver states (V-1); a block cannot ship unverified`);
```

with:

```js
    errors.push(`${name}: no state script at packages/blocks/blocks/${name}/states.mjs -- every block declares its driver states (V-1); a block cannot ship unverified`);
```

and, in the same function, replace the `--record` instruction line:

```js
      `    node scripts/block-driver/driver.mjs blocks/${name}/states.mjs --serve scripts/block-driver/pages --pages block --record scripts/block-driver/baselines/${name}.json --shots <dir>\n` +
```

with:

```js
      `    node scripts/block-driver/driver.mjs ../blocks/blocks/${name}/states.mjs --serve scripts/block-driver/pages --pages block --record scripts/block-driver/baselines/${name}.json --shots <dir>\n` +
```

The instruction is copy-pasteable from `packages/ui`, which is where the surrounding message already tells the reader to stand, so the relative hop is `../blocks/blocks/`.

- [ ] **Step 6: Point `create-kai`'s build at the resolved package**

In `packages/create-kai/scripts/build.mjs`, replace lines 160-164:

```js
  await cp(path.join(repoRoot, 'packages/ui/blocks'), path.join(dist, 'blocks'), { recursive: true });
  const blockCount = (await readdir(path.join(dist, 'blocks'), { withFileTypes: true })).filter((d) => d.isDirectory()).length;
  console.log(`  blocks    ${blockCount} copied from packages/ui/blocks`);
```

with:

```js
  // Resolved through the package, never `path.join(repoRoot, ...)`. A repo-root
  // path literal is the copy the derive-don't-type rule is about: it survives a
  // move silently until the directory it names is empty, and an empty copy here
  // means `add` installs and then finds nothing to write.
  const blocksPkgRoot = path.dirname(createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json'));
  await cp(path.join(blocksPkgRoot, 'blocks'), path.join(dist, 'blocks'), { recursive: true });
  const blockCount = (await readdir(path.join(dist, 'blocks'), { withFileTypes: true })).filter((d) => d.isDirectory()).length;
  if (blockCount === 0) {
    failIf('create-kai build: copied zero block directories from @kitn.ai/blocks -- a zero-block copy is a broken resolve, not an empty catalog');
  }
  console.log(`  blocks    ${blockCount} copied from ${path.relative(repoRoot, blocksPkgRoot)}/blocks`);
```

and add to the imports at the top of the file, beside the other `node:` imports:

```js
import { createRequire } from 'node:module';
```

- [ ] **Step 7: Watch the new zero-block `failIf` fire**

A guard nobody has seen fail is not evidence, and this one is the difference between `create-kai` shipping a tarball with no blocks and failing at build time.

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
mv packages/blocks/blocks packages/blocks/blocks.away
pnpm --filter create-kai run build
```

Expected: RED, naming `copied zero block directories from @kitn.ai/blocks`. Note what this proves and what it does not: `cp` on a missing source throws first, so if the message you get is an ENOENT on `packages/blocks/blocks` instead, the `failIf` is unreachable as written and must move ABOVE the `cp` as an `existsSync` precondition. Either outcome is information; a silent green is the only wrong one.

Restore and re-run:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
mv packages/blocks/blocks.away packages/blocks/blocks
pnpm --filter create-kai run build
```

Expected: green, printing the copied block count and the resolved source directory.

- [ ] **Step 8: Point the still-in-place registry test at the package**

In `packages/ui/mcp/tests/blocks-registry.test.ts`, replace:

```ts
const ROOT = resolve(__dirname, '../..');
const BLOCKS_DIR = join(ROOT, 'blocks');
```

with:

```ts
const ROOT = resolve(__dirname, '../..');
const BLOCKS_DIR = join(
  dirname(createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json')),
  'blocks',
);
```

and extend the two existing imports at the top of the file:

```ts
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
```

(This file moves in Task 4. Fixing it here keeps the suite green at this task's gate, which is what makes the task independently verifiable.)

- [ ] **Step 9: Rewrite the two prose paths in `registry.ts`**

`packages/ui/mcp/blocks/registry.ts:3`, in the module docblock, replace:

```
 * "Registry mechanics"). Blocks live at `packages/ui/blocks/<id>/`, each with
```

with:

```
 * "Registry mechanics"). Blocks live at `packages/blocks/blocks/<id>/`, each with
```

`packages/ui/mcp/blocks/registry.ts:383`, inside `CONTRACT_BANNER`, replace:

```
  block's source in packages/ui/blocks/ and regenerate (node scripts/gen-blocks.mjs).
```

with:

```
  block's source in packages/blocks/blocks/ and regenerate (node scripts/gen-blocks.mjs).
```

`CONTRACT_BANNER` is EMITTED into every generated CDN form and every generated driver page, so this one line is a consumer-visible content change inside `dist/blocks/r/*.cdn.html`. That is intended and is enumerated in Task 9's expected `diff -r` set. It changes no file NAME, so the pack file-list gate is untouched.

- [ ] **Step 10: Rebuild and run the block gate**

<!-- gate-list: partial -- this task's own verification subset, not the merge gate; the merge gate is the required `test` graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npm run build
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/ui run verify:blocks
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter create-kai run build
pnpm --filter create-kai exec vitest run
```

Expected: all green. `verify:blocks` prints the discovered block ids; compare them against `$BASE/block-ids-baseline.txt`. Its `--self-test` half runs first and must still report every planted class caught, including the missing-baseline class, whose message now names the new path.

- [ ] **Step 11: Confirm the emitted banner really moved**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
grep -c "packages/blocks/blocks/" packages/ui/dist/blocks/r/*.cdn.html
grep -rn "packages/ui/blocks" packages/ui/dist/blocks/ || echo "no stale path in the emitted forms"
```

Expected: a nonzero count per file, and the second command printing the no-stale-path line.

- [ ] **Step 12: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/blocks packages/ui/blocks packages/ui/scripts/gen-blocks.mjs packages/ui/scripts/verify-blocks.mjs packages/ui/mcp/tests/blocks-registry.test.ts packages/ui/mcp/blocks/registry.ts packages/create-kai/scripts/build.mjs
git commit -m "$(cat <<'MSG'
refactor(blocks): authored block sources move to packages/blocks/blocks

git mv only; no block source is edited. The four consumers that reached the
directory by path now resolve it through @kitn.ai/blocks/package.json, so a
future move breaks loudly at resolve time instead of scanning an empty
directory. create-kai's build additionally hard-fails on a zero-block copy,
which is the failure shape `add` would otherwise hit at a user's first run.

The generated CDN forms' contract banner names the block sources' directory, so
dist/blocks/r/*.cdn.html changes by that one comment line. No file name moves.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 4: The registry, the forms and the test move; every importer becomes a specifier

**Files:**
- Move: `packages/ui/mcp/blocks/registry.ts` -> `packages/blocks/src/registry.ts`, `packages/ui/mcp/blocks/forms.ts` -> `packages/blocks/src/forms.ts`, `packages/ui/mcp/tests/blocks-registry.test.ts` -> `packages/blocks/tests/registry.test.ts` (all `git mv`)
- Create: `packages/ui/mcp/tests/blocks-artifacts.test.ts`
- Delete: `packages/blocks/src/.gitkeep`, `packages/blocks/tests/skeleton.test.ts`
- Modify: `packages/ui/mcp/construct/dev.ts:21-22`, `packages/ui/mcp/construct/dev.test.ts:688`, `packages/ui/apps/gallery/main.tsx:4`, `packages/ui/apps/gallery/GalleryPage.tsx:46`, `packages/ui/apps/gallery/GalleryPage.stories.tsx:9-10`, `packages/create-kai/src/blocks.ts:30-47`, `packages/create-kai/src/react-form.ts:19`, `packages/create-kai/test/add.test.ts:22`, `packages/ui/scripts/gen-blocks.mjs:67`, `packages/ui/scripts/verify-blocks.mjs:82`

**Interfaces:**
- Consumes: the `exports` map from Task 2, and `BLOCKS_PKG_ROOT` / `BLOCKS_PKG_JSON` from Task 3.
- Produces: two importable specifiers. `@kitn.ai/blocks` exports `discoverBlocks`, `validateBlockManifest`, `buildRegistryIndex`, `buildRegistryItem`, `generateCdnForm`, `rewriteBareImport`, `rewriteBlockScript`, `checkBlockContracts`, `CDN_IMPORT_ENTRIES`, and the types `Block`, `BlockManifest`, `RawBlockSource`. `@kitn.ai/blocks/forms` exports `BLOCK_FORMS`, `isBlockFormId`, `renderBlockForm`, `adaptRegistrationForBundler`, `componentName`, `renderCdnFormFiles`, `renderReactForm`, `renderWcForm`, `bodyToJsx`, `kaiTagsIn`, `renderComponent`, `renderEntryTypings`, `renderJsxTypings`, `wrapEntryScript`, `wrapWcEntryScript`, and the types `FormFile`, `BlockFormId`. No symbol is added, removed or renamed by this task.

- [ ] **Step 1: Move the three files and drop the skeleton**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git mv packages/ui/mcp/blocks/registry.ts packages/blocks/src/registry.ts
git mv packages/ui/mcp/blocks/forms.ts packages/blocks/src/forms.ts
git mv packages/ui/mcp/tests/blocks-registry.test.ts packages/blocks/tests/registry.test.ts
rmdir packages/ui/mcp/blocks
git rm -f packages/blocks/src/.gitkeep packages/blocks/tests/skeleton.test.ts
git status --porcelain | head -20
```

Expected: three renames plus two deletions, and `packages/ui/mcp/blocks/` gone.

- [ ] **Step 2: Rewrite every TypeScript importer**

Nine sites, each a one-line specifier swap. Make them by hand, not with a blanket `sed`: two of them sit next to prose that also has to change.

`packages/ui/mcp/construct/dev.ts:21-22` -- replace:

```ts
import { generateCdnForm, type Block, type BlockManifest } from '../blocks/registry';
import { BLOCK_FORMS, isBlockFormId, renderBlockForm, type FormFile } from '../blocks/forms';
```

with:

```ts
import { generateCdnForm, type Block, type BlockManifest } from '@kitn.ai/blocks';
import { BLOCK_FORMS, isBlockFormId, renderBlockForm, type FormFile } from '@kitn.ai/blocks/forms';
```

`packages/ui/mcp/construct/dev.ts`, around line 814, the comment naming the renderer -- replace `` (`blocks/forms.ts`) `` with `` (`@kitn.ai/blocks/forms`) ``.

`packages/ui/mcp/construct/dev.test.ts:688` -- replace:

```ts
import { BLOCK_FORMS } from '../blocks/forms';
```

with:

```ts
import { BLOCK_FORMS } from '@kitn.ai/blocks/forms';
```

`packages/ui/apps/gallery/main.tsx:4` -- replace:

```ts
import { BLOCK_FORMS, type BlockFormId, type FormFile } from '../../mcp/blocks/forms';
```

with:

```ts
import { BLOCK_FORMS, type BlockFormId, type FormFile } from '@kitn.ai/blocks/forms';
```

`packages/ui/apps/gallery/GalleryPage.tsx:46` -- the identical line, the identical replacement. Its docblock at line 19 also says `` (one renderer: `mcp/blocks/forms.ts`) ``; make that `` (one renderer: `@kitn.ai/blocks/forms`) ``.

`packages/ui/apps/gallery/GalleryPage.stories.tsx:9-10` -- replace:

```ts
} from '../../mcp/blocks/forms';
import type { Block } from '../../mcp/blocks/registry';
```

with:

```ts
} from '@kitn.ai/blocks/forms';
import type { Block } from '@kitn.ai/blocks';
```

Its docblock at line 22 says `` (`mcp/blocks/forms.ts` ``; make that `` (`@kitn.ai/blocks/forms` ``.

`packages/create-kai/src/blocks.ts:30-47` -- replace the three import sources:

```ts
import { discoverBlocks } from '../../ui/mcp/blocks/registry';
import type {
  Block,
  BlockManifest,
  RawBlockSource,
} from '../../ui/mcp/blocks/registry';
```

becomes:

```ts
import { discoverBlocks } from '@kitn.ai/blocks';
import type {
  Block,
  BlockManifest,
  RawBlockSource,
} from '@kitn.ai/blocks';
```

and:

```ts
} from '../../ui/mcp/blocks/forms';
```

becomes:

```ts
} from '@kitn.ai/blocks/forms';
```

Its docblock at lines 5-11 says the registry is imported from `` `../../ui/mcp/blocks/registry` `` and that `scripts/build.mjs` copies `` `packages/ui/blocks/` ``. Replace those two with `` `@kitn.ai/blocks` `` and `` the resolved `@kitn.ai/blocks` package's `blocks/` directory ``. Its comment at line 322 naming `` (`mcp/blocks/forms.ts` `` becomes `` (`@kitn.ai/blocks/forms` ``.

`packages/create-kai/src/react-form.ts:19` -- replace:

```ts
} from '../../ui/mcp/blocks/forms';
```

with:

```ts
} from '@kitn.ai/blocks/forms';
```

and in its docblock replace `` `packages/ui/mcp/blocks/forms.ts` `` with `` `@kitn.ai/blocks/forms` ``.

`packages/create-kai/test/add.test.ts:22` -- replace:

```ts
import { buildRegistryItem } from '../../ui/mcp/blocks/registry';
```

with:

```ts
import { buildRegistryItem } from '@kitn.ai/blocks';
```

- [ ] **Step 3: Point the two generators' `importTs` at the entry read from the exports map**

In `packages/ui/scripts/gen-blocks.mjs`, replace line 67:

```js
const blocksMod = await importTs(join(ROOT, 'mcp/blocks/registry.ts'));
```

with:

```js
// The entry is READ OUT OF the package's exports map, not restated: there is
// then one identity for the module, and a change to the map moves this with it.
// Resolving it through node's own resolver instead would depend on which
// conditions apply to a require of a .ts file, which is a detail this script
// has no reason to care about.
const blocksExports = JSON.parse(readFileSync(BLOCKS_PKG_JSON, 'utf8')).exports;
const blocksEntry = blocksExports?.['.']?.default;
if (typeof blocksEntry !== 'string') {
  console.error('gen-blocks: @kitn.ai/blocks has no exports["."].default -- cannot locate the registry entry');
  process.exit(1);
}
const blocksMod = await importTs(join(BLOCKS_PKG_ROOT, blocksEntry));
```

In `packages/ui/scripts/verify-blocks.mjs`, replace line 82:

```js
const registry = await importTs(join(ROOT, 'mcp/blocks/registry.ts'));
```

with:

```js
// The entry, read out of the package's exports map (the gen-blocks.mjs pattern).
const BLOCKS_PKG_JSON = createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json');
const blocksEntry = JSON.parse(readFileSync(BLOCKS_PKG_JSON, 'utf8')).exports?.['.']?.default;
if (typeof blocksEntry !== 'string') {
  console.error('verify-blocks: @kitn.ai/blocks has no exports["."].default -- cannot locate the registry entry');
  process.exit(1);
}
const registry = await importTs(join(BLOCKS_PKG_ROOT, blocksEntry));
```

In `verify-blocks.mjs`, Task 3 Step 4 introduced `BLOCKS_PKG_ROOT` as a one-line `dirname(createRequire(...).resolve(...))`. Rewrite that line to reuse the `BLOCKS_PKG_JSON` constant this step adds, so the resolve happens once:

```js
const BLOCKS_PKG_ROOT = dirname(BLOCKS_PKG_JSON);
```

and move the `BLOCKS_PKG_JSON` declaration above it. Same in `gen-blocks.mjs`, where Task 3 Step 3 already declared both in that order.

The comment in `gen-blocks.mjs`'s header at line 2 says the script is "the filesystem half of mcp/blocks/registry.ts" and at line 3 that it "Scans packages/ui/blocks/<id>/". Replace with `@kitn.ai/blocks`'s `src/registry.ts` and `packages/blocks/blocks/<id>/`. The header of `verify-blocks.mjs` at lines 3 and 10 says the same two things; make the same two replacements there.

- [ ] **Step 4: Confirm the only relative reaches left are the ones Task 5 owns**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
grep -rn "blocks/registry'\|blocks/forms'\|mcp/blocks" packages apps .github --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.json' 2>/dev/null | grep -v node_modules | grep -v '/dist/'
```

Expected: **exactly three hits, all in `packages/ui/config/vite/lib.ts`** -- the two dead `dts.include` entries and the comment above them that justifies them. Task 5 deletes all three together. Anything else is a site Step 2 or Step 3 missed.

This grep is deliberately AFTER the generator step rather than before it. Run it between Steps 2 and 3 and it prints seven hits, not three: the four extra are `scripts/gen-blocks.mjs:2` and `:67` and `scripts/verify-blocks.mjs:10` and `:82`, all four owned by Step 3. Reading seven where the plan said two is exactly the kind of mismatch that gets a correct step second-guessed.

- [ ] **Step 5: Split the moved test -- lift the four ui-dependent assertions out**

In `packages/blocks/tests/registry.test.ts`, DELETE these two `it(...)` blocks entirely:

- `'the built dist/blocks/registry.json and r/<name>.json match what the current sources produce'` (in the `registry derivation` describe)
- `'the built cdn.html and generated driver page match what the current sources produce'` (in the `the CDN-form generator` describe)

and DELETE the `'the real blocks pass the kai- contract checks'` block plus the `readBuiltArtifact` helper, `DIST_BLOCKS`, `NONSCALAR`, `VERSION` and `ROUTES` as currently defined. Then rewrite the file's head so it stands on the package alone:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  discoverBlocks,
  validateBlockManifest,
  buildRegistryIndex,
  buildRegistryItem,
  generateCdnForm,
  rewriteBareImport,
  rewriteBlockScript,
  checkBlockContracts,
  CDN_IMPORT_ENTRIES,
  type Block,
  type RawBlockSource,
} from '../src/registry';

const BLOCKS_DIR = resolve(__dirname, '../blocks');

/**
 * FIXTURES, not the real catalogs, and that is the point. `routeIntegrations`
 * and `nonscalarByTag` reach the registry BY INJECTION precisely so this module
 * does not know them; a test of an injection seam that reaches for the real
 * value is testing the caller instead. Reading them here would also mean a
 * relative hop into packages/ui, which is the reach the package boundary exists
 * to delete.
 *
 * The real catalogs meeting the real blocks is `pnpm --filter @kitn.ai/ui run
 * verify:blocks` ([contracts] and [pins]) plus
 * packages/ui/mcp/tests/blocks-artifacts.test.ts, both of which live in the
 * package that has them. Neither half is lost; each is asserted where its
 * inputs are.
 */
const ROUTES = ['fixture-route-a', 'fixture-route-b'];
const NONSCALAR: Record<string, string[]> = { 'kai-thread': ['messages'] };
const VERSION = '9.9.9-fixture';
```

Everything below stays as it is, with three amendments.

**(a) The derivation `it` must DROP its `errors` assertion.** It currently reads:

```ts
  it('every blocks/<dir> with a manifest is discovered, error-free', () => {
    expect(errors).toEqual([]);
    expect(blocks.map((b) => b.name).sort()).toEqual(sources.map((s) => s.dirName).sort());
    expect(blocks.length).toBeGreaterThanOrEqual(1); // a zero-block scan is a broken walk
    expect(blocks.some((b) => b.name === 'support-widget')).toBe(true);
  });
```

Rewrite it as:

```ts
  it('every blocks/<dir> with a manifest is discovered', () => {
    // NOT `expect(errors).toEqual([])`. Discovery validates `registryDependencies`
    // against the routeIntegrations it is handed, and the routes here are
    // FIXTURES. That assertion passes today only because all three real manifests
    // happen to declare `registryDependencies: []`; the first block to declare a
    // real `route:<id>` dep would turn it red against a fixture list that cannot
    // contain the id. Error-free discovery against the REAL catalog is asserted
    // in packages/ui/mcp/tests/blocks-artifacts.test.ts and by verify:blocks
    // [contracts], both of which have the real catalog. What belongs HERE is the
    // derivation claim: the scan is the list.
    expect(blocks.map((b) => b.name).sort()).toEqual(sources.map((s) => s.dirName).sort());
    expect(blocks.length).toBeGreaterThanOrEqual(1); // a zero-block scan is a broken walk
    expect(blocks.some((b) => b.name === 'support-widget')).toBe(true);
  });
```

**(b)** The `it('a real route dependency and a sibling block are accepted')` case uses `ROUTES[0]`, which now names a fixture route. Unchanged in text, correct in meaning: it is asserting that a KNOWN route id is accepted, and the fixture list is what defines "known" for this suite.

**(c)** The `it('pins are generated from package.json and EQUAL its version ...')` title claims something the fixture cannot. Rename it to `'pins are generated from the injected version, never baked in'` and make the claim discriminating by rendering the SAME block twice under two versions, which a hardcoded pin could not satisfy:

```ts
  it('pins are generated from the injected version, never baked in', () => {
    const a = generateCdnForm(widget, { version: '1.2.3-fixture' });
    const b = generateCdnForm(widget, { version: '4.5.6-fixture' });
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    const pins = (html: string) =>
      new Set([...html.matchAll(/@kitn\.ai\/ui@([\d.]+(?:-[\w.-]+)?)/g)].map((m) => m[1]));
    expect(pins(a.html as string)).toEqual(new Set(['1.2.3-fixture']));
    expect(pins(b.html as string)).toEqual(new Set(['4.5.6-fixture']));
    // Every pinned line stays release-wired (inline annotation, pin first on line).
    for (const line of (a.html as string).split('\n')) {
      if (/@kitn\.ai\/ui@\d/.test(line)) expect(line).toMatch(/x-release-please-version/);
    }
  });
```

The equality-with-the-REAL-version half of the original claim -- the `lint:cdn-pins` invariant -- is asserted in `blocks-artifacts.test.ts` and again by `verify:blocks` `[pins]` on the emitted artifact. Neither half is lost.

- [ ] **Step 6: Write the ui-side artifact test, and watch it fail first**

Create `packages/ui/mcp/tests/blocks-artifacts.test.ts`:

```ts
/**
 * The four blocks assertions whose inputs live in THIS package: the real
 * integration catalog, the real element-nonscalar map, this package's version,
 * and the BUILT artifacts under dist/blocks/ plus the generated driver page.
 *
 * They were part of mcp/tests/blocks-registry.test.ts before that suite moved
 * to @kitn.ai/blocks, and they stay here rather than moving with it because the
 * blocks package depends on nothing and must not grow a build-order dependency
 * on the kit. Splitting on "what are the inputs" rather than "what is the
 * subject" is what keeps both halves honest.
 *
 * They are in the `unit` project on purpose: verify:blocks covers the same
 * ground but needs a real browser and a full build, so this is what catches a
 * stale build in the fast suite.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import {
  discoverBlocks,
  buildRegistryIndex,
  buildRegistryItem,
  generateCdnForm,
  checkBlockContracts,
  type Block,
  type RawBlockSource,
} from '@kitn.ai/blocks';
import { listIntegrations } from '../registry';

const ROOT = resolve(__dirname, '../..');
const BLOCKS_DIR = join(
  dirname(createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json')),
  'blocks',
);
const DIST_BLOCKS = join(ROOT, 'dist', 'blocks');

/** Generated block artifacts live under dist/ (never committed), so a fresh
 *  checkout has none -- fail naming the exact path and how to produce it (the
 *  custom-elements.json pattern), never by walking somewhere else. */
function readBuiltArtifact(path: string): string {
  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing -- generated block artifacts are build outputs, not committed. ` +
        'Run `nx build ui` (or, after build:api, `node scripts/gen-blocks.mjs` from packages/ui) first.',
    );
  }
  return readFileSync(path, 'utf8');
}

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string;
const ROUTES = listIntegrations().map((i) => i.id);
const NONSCALAR = JSON.parse(
  readFileSync(join(ROOT, 'src/elements/element-nonscalar.json'), 'utf8'),
) as Record<string, string[]>;

/** The same walk gen-blocks.mjs does -- a dir is a block iff it holds a
 *  registry-item.json. */
function scanRealBlocks(): RawBlockSource[] {
  return readdirSync(BLOCKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(BLOCKS_DIR, e.name, 'registry-item.json')))
    .map((e) => ({
      dirName: e.name,
      manifestJson: readFileSync(join(BLOCKS_DIR, e.name, 'registry-item.json'), 'utf8'),
      files: readdirSync(join(BLOCKS_DIR, e.name), { withFileTypes: true })
        .filter((f) => f.isFile() && f.name !== 'registry-item.json')
        .map((f) => ({ name: f.name, content: readFileSync(join(BLOCKS_DIR, e.name, f.name), 'utf8') })),
    }));
}

describe('the real blocks against this package real inputs', () => {
  const sources = scanRealBlocks();
  const { blocks, errors } = discoverBlocks(sources, ROUTES);

  it('discovers every block directory, error-free, against the real integration catalog', () => {
    expect(errors).toEqual([]);
    expect(blocks.length).toBeGreaterThanOrEqual(1); // a zero-block scan is a broken walk
    expect(blocks.map((b) => b.name).sort()).toEqual(sources.map((s) => s.dirName).sort());
  });

  it('the real blocks pass the kai- contract checks against the real element-nonscalar map', () => {
    for (const block of blocks) expect(checkBlockContracts(block, NONSCALAR)).toEqual([]);
  });

  it('the built dist/blocks/registry.json and r/<name>.json match what the current sources produce', () => {
    const builtIndex = JSON.parse(readBuiltArtifact(join(DIST_BLOCKS, 'registry.json')));
    expect(builtIndex).toEqual(buildRegistryIndex(blocks));
    for (const block of blocks) {
      const built = JSON.parse(readBuiltArtifact(join(DIST_BLOCKS, 'r', `${block.name}.json`)));
      expect(built).toEqual(buildRegistryItem(block));
    }
  });

  it('the built cdn.html and generated driver page match what the current sources produce, pinned to this package version', () => {
    for (const block of blocks as Block[]) {
      const cdn = generateCdnForm(block, { version: VERSION });
      expect(cdn.errors).toEqual([]);
      expect(readBuiltArtifact(join(DIST_BLOCKS, 'r', `${block.name}.cdn.html`))).toBe(cdn.html);
      const local = generateCdnForm(block, { version: VERSION, base: '/kit/' });
      expect(
        readBuiltArtifact(join(ROOT, 'scripts/block-driver/pages/generated', block.name, 'index.html')),
      ).toBe(local.html);
    }
  });
});
```

- [ ] **Step 7: Watch the artifact test fail, then pass**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node -e "const p='packages/ui/dist/blocks/registry.json';const fs=require('fs');fs.writeFileSync(p+'.bak',fs.readFileSync(p));fs.writeFileSync(p,'{\"items\":[]}')"
pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/tests/blocks-artifacts.test.ts
```

Expected: RED on the built-index assertion. Then restore and re-run:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node -e "const p='packages/ui/dist/blocks/registry.json';const fs=require('fs');fs.copyFileSync(p+'.bak',p);fs.unlinkSync(p+'.bak')"
pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/tests/blocks-artifacts.test.ts
```

Expected: green. A check nobody has watched fail is not evidence.

- [ ] **Step 8: Typecheck the blocks package, and fix the mechanical strictness errors**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/blocks run typecheck
```

**Expected: green on the first run.** Measured before this plan was written, both files compile clean under these options: `registry.ts` has no imports at all, and `forms.ts`'s single import already uses inline `type` modifiers.

If it is red anyway, the errors will be one of these, and each is mechanical:

- TS1484 (`'X' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled`) -- add the `type` modifier.
- TS1205 (`Re-exporting a type when 'isolatedModules' is enabled requires using 'export type'`) -- change `export {` to `export type {` for the type-only half.
- TS6133 (`declared but its value is never read`, from `noUnusedLocals`) -- delete the genuinely unused local.
- TS2307 or TS2580 on a `node:` specifier, or a missing DOM global -- **STOP.** That is exactly what the `"types": []` and DOM-free `lib` pass exists to catch, and it means something in these files reaches a filesystem or a document that it should not. Do not add the lib or the types package; find what reached.

Do NOT relax any compiler option to clear any of these.

Run it again until green, then:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/blocks exec vitest run
```

Expected: green, with the same describes as before minus the four lifted assertions.

- [ ] **Step 9: Rebuild and run the ui and create-kai gates**

<!-- gate-list: partial -- this task's own verification subset, not the merge gate; the merge gate is the required `test` graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npm run build
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/blocks run typecheck
pnpm --filter @kitn.ai/blocks exec vitest run
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui run verify:blocks
pnpm --filter create-kai run build
pnpm --filter create-kai run typecheck
pnpm --filter create-kai exec vitest run
pnpm exec nx typecheck ui --skip-nx-cache
```

Expected: every one exits 0.

`nx typecheck ui` belongs HERE, not only in Task 5. This task rewrites imports in eight files across three trees (`mcp/construct`, `apps/gallery`, `create-kai/src`), and a broken specifier in any of them is a tsc error, so deferring the check would let this task's own gate pass over its own defect. It is safe to run before Task 5: `dts.include` is a string array read by **vite-plugin-dts at BUILD time**, and no tsc pass reads it -- the two dead entries cannot make a typecheck red, which is precisely why they survived unnoticed in the first place.

`--skip-nx-cache` is not optional: this repo has recorded the nx cache returning a stale green over code carrying a real TS1015.

- [ ] **Step 10: Confirm all FOUR surfaces resolve the `.ts`-exports package**

This is the one mechanical risk in the whole plan, and it has four instances, not one. `@kitn.ai/blocks`'s `exports` point at `.ts`, and pnpm symlinks it, so with `preserveSymlinks` off every resolver lands on a real path under `packages/blocks/` that is OUTSIDE the consuming project's root. Four different toolchains have to be happy with that, and two of them are vitest dev-server semantics rather than a bundler:

| Surface | What resolves it | Why it is a distinct risk | Fallback if it breaks |
|---|---|---|---|
| `packages/ui/apps/gallery/**` | vite `page` build (`config/vite/page.ts`) | a real browser bundle of a `.ts` dependency | `optimizeDeps.exclude: ['@kitn.ai/blocks']` and/or `resolve.dedupe` in `config/vite/page.ts` |
| `packages/ui/mcp/tests/blocks-artifacts.test.ts` | the ui `unit` vitest project | vitest's dev server must SERVE a dependency whose realpath is outside the project root; this is the same class as the `/@fs/<parent>` failure CLAUDE.md records for worktrees | `test.server.deps.inline: ['@kitn.ai/blocks']` in `packages/ui/vitest.config.ts` |
| `packages/create-kai/test/add.test.ts` | create-kai's vitest config | that config previously only ever imported BUILT JavaScript; a `.ts` workspace dependency is new to it | `test.server.deps.inline: ['@kitn.ai/blocks']` in `packages/create-kai/vitest.config.ts` |
| `packages/ui/apps/gallery/GalleryPage.stories.tsx` | Storybook's vite builder (`.storybook/main.ts`'s `stories` glob includes `../apps/**/*.stories.@(ts\|tsx)`) | **outside the test graph and outside every step above**, so nothing else in this plan would catch it | `viteFinal`'s `optimizeDeps.exclude` in `.storybook/main.ts` |

Steps 8 and 9 already exercised the first three. Read the evidence explicitly, then cover the fourth:

<!-- gate-list: partial -- the four resolution surfaces this task must exercise, not the merge gate; the merge gate is the required `test` graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
ls packages/ui/dist/gallery/index.html
grep -rl "BLOCK_FORMS\|renderWcForm" packages/ui/dist/gallery/assets/ | head -3
pnpm --filter @kitn.ai/ui exec vitest run --project=unit mcp/tests/blocks-artifacts.test.ts
pnpm --filter create-kai exec vitest run test/add.test.ts
pnpm --filter @kitn.ai/ui run build-storybook
```

Expected: the gallery page exists with a built asset carrying the renderer, both targeted suites green, and the storybook build exits 0. A resolution failure on any surface throws loudly rather than passing quietly, so a green here is real.

**If any surface DID need a fallback, apply the one its row names and RECORD which, in the PR body.** PR C hits the identical question from `apps/docs`, and the answer being written down is worth more than the fix itself.

- [ ] **Step 11: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/blocks packages/ui packages/create-kai
git commit -m "$(cat <<'MSG'
refactor(blocks): registry + forms move to @kitn.ai/blocks; every importer on a specifier

git mv of three files, then nine one-line specifier swaps. No exported symbol
is added, removed or renamed. The two .mjs generators keep their esbuild
importTs round trip and read the entry OUT OF the package's exports map, so
there is one identity for the module and the map moves it.

The moved suite splits by what each assertion's INPUTS are, not by its subject.
Everything that is a fact about the registry module and the block sources went
with them, taking its two injected inputs from fixtures because the seam exists
so the module does not know them. The four assertions needing this package's
real integration catalog, real element-nonscalar map, real version or built
artifacts stay here as mcp/tests/blocks-artifacts.test.ts, in the unit project,
so a stale build is still caught without a browser.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 5: The dead declaration emission goes, and the ui typecheck goes green

**Files:**
- Modify: `packages/ui/config/vite/lib.ts:494-512`, `packages/ui/tsconfig.mcp.json` (the `comment` field)

**Interfaces:**
- Consumes: the moved files from Task 4.
- Produces: a build that no longer emits `dist/agent-tooling/blocks/registry.d.ts` or `dist/agent-tooling/blocks/forms.d.ts`. Those two names are the ONLY entries the `@kitn.ai/ui` pack file list may lose, and Task 9 asserts exactly that.

- [ ] **Step 1: Delete the two dead `dts.include` entries and the comment that justified them**

In `packages/ui/config/vite/lib.ts`, in the `construct` target's `dts.include`, replace this whole block:

```ts
        'mcp/construct/public.ts',
        'mcp/construct/schema.ts',
        'mcp/construct/schema-url.ts',
        // The blocks pure-module layer (registry + the shared form renderer).
        // Browser-safe by their own discipline headers (no node:*, no zod-free
        // violation -- registry/forms are plain functions over injected data).
        // Needed here because apps/gallery/GalleryPage.tsx imports BLOCK_FORMS
        // types from '../../mcp/blocks/forms', and (the parallel case)
        // apps/builder/HomeScreen.tsx imports ConstructListing from
        // '../../mcp/construct/templates' -- neither app lives under src/ or
        // the dts include anymore, and public.ts re-exports only from
        // './schema', so these two include entries currently have no in-repo
        // consumer and are kept only pending a separate removal decision.
        // forms.d.ts imports './registry', so both are listed.
        'mcp/blocks/registry.ts',
        'mcp/blocks/forms.ts',
      ],
```

with:

```ts
        'mcp/construct/public.ts',
        'mcp/construct/schema.ts',
        'mcp/construct/schema-url.ts',
        // The blocks registry and form renderer used to be listed here too, and
        // emitted a dist/agent-tooling/blocks/ declaration directory. No
        // `exports` key named those files and nothing in the repo resolved
        // them; the comment that stood here recorded them as kept "pending a
        // separate removal decision". Moving the blocks to @kitn.ai/blocks made
        // the decision. Anything wanting those types imports the package.
      ],
```

The replacement comment deliberately does NOT spell the two old paths. It is the last place in non-historical source that would carry them, and Task 9 Step 7 greps the tree for exactly those strings; a comment naming them would make that grep permanently noisy, which is how a grep-based check stops being read.

Leave the `outDir: 'dist/agent-tooling'` / `entryRoot: 'mcp'` pair below it EXACTLY as it is. That string is the literal value of `exports["./construct"].types` and of the `typesVersions` entry, both pinned by `packages/ui/tests/scripts/construct-export-smoke.test.ts`. Changing it is consumer-visible; holding it is free.

- [ ] **Step 2: Fix the one word in `tsconfig.mcp.json`'s comment**

In `packages/ui/tsconfig.mcp.json`, the `comment` field reads:

```
The rest of mcp/ (construct, catalog, blocks, integrations, recipes and the leaf modules at its root) stays in tsconfig.json's browser pass
```

Replace with:

```
The rest of mcp/ (construct, catalog, integrations, recipes and the leaf modules at its root) stays in tsconfig.json's browser pass
```

`blocks` is no longer one of `mcp/`'s subdirectories, so listing it would send a reader to a directory that does not exist.

- [ ] **Step 3: Assert the four configs that need NO edit, rather than assuming it**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
grep -n '"include"\|"exclude"' packages/ui/tsconfig.json
grep -n 'mcp/tests' packages/ui/tsconfig.tests.json
grep -n "include: \['src/\*\*\|'mcp/\*\*" packages/ui/vitest.config.ts
grep -n "SCAN_ROOTS = " packages/ui/scripts/lint-cdn-pins.mjs
```

Expected, and each is the reason there is nothing to change:

- `packages/ui/tsconfig.json`'s `include` names `mcp/**/*.ts` and its `exclude` names `mcp/mcp` and `mcp/tests` -- both globs, never `mcp/blocks`. The moved files leave the pass by leaving the directory.
- `packages/ui/tsconfig.tests.json` still names `mcp/tests/**/*.ts`, and that directory still holds `blocks-artifacts.test.ts` plus the emitted-code guards. Dropping it would silently stop checking them.
- `packages/ui/vitest.config.ts`'s coverage `include` names `src/**` and `mcp/**` as globs and its `exclude` names `mcp/tests/**`. Same reasoning.
- `lint-cdn-pins.mjs`'s `SCAN_ROOTS` includes `packages`, so `packages/blocks` is in its scan with no edit. That guard hard-fails on a zero-match run, so if the move had taken the sources out of scope it would go red rather than quietly clean.

- [ ] **Step 4: Rebuild cold and confirm the two declarations are gone**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
rm -rf dist
npm run build:css
npm run build
ls dist/agent-tooling/blocks 2>&1 || echo "dist/agent-tooling/blocks is gone, as intended"
ls dist/agent-tooling/construct/
```

Expected: the first `ls` fails with no such file or directory, and `dist/agent-tooling/construct/` still holds `public.d.ts`, `schema.d.ts` and `schema-url.d.ts`. If the construct declarations went missing too, the `dts.include` edit took a line it should not have; revert and redo it.

- [ ] **Step 5: The declaration-boundary guard and the construct export smoke**

<!-- gate-list: partial -- the three checks that can see a deleted declaration, not the merge gate; the merge gate is the required `test` graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/ui run verify:dts
pnpm --filter @kitn.ai/ui run verify:dts:consumer
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/construct-export-smoke.test.ts
```

Expected: all green. `verify:dts` asserts every emitted `.d.ts` specifier resolves, which is the check that would catch a declaration left pointing at a file this task deleted.

- [ ] **Step 6: The full ui typecheck, cache bypassed**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx typecheck ui --skip-nx-cache
```

Expected: 0 errors across all seven passes. `--skip-nx-cache` is not optional here: this repo has recorded the nx cache returning a stale green over code carrying a real TS1015, and a cached green over broken code is the one that ships.

- [ ] **Step 7: The two vitest projects**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
```

Expected: both green. `--project=unit` is not the merge gate on its own; `emitted` runs as its own CI step and has to be run separately.

- [ ] **Step 8: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/ui/config/vite/lib.ts packages/ui/tsconfig.mcp.json
git commit -m "$(cat <<'MSG'
refactor(blocks): drop the dead dist/agent-tooling/blocks declaration emission

Two dts.include entries emitted dist/agent-tooling/blocks/{registry,forms}.d.ts
that no exports key named and nothing resolved. The comment at the site already
recorded them as kept pending a separate removal decision; the move made it.

outDir: 'dist/agent-tooling' and entryRoot: 'mcp' stay untouched: that string is
the literal value of exports["./construct"].types and of the typesVersions
entry, both pinned by tests/scripts/construct-export-smoke.test.ts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 6: `create-kai`'s build guards and its packed-tarball assertion

**Files:**
- Modify: `packages/create-kai/src/build-guards.ts` (the `bundleGraphProblem` message, plus a new export), `packages/create-kai/test/build-guards.test.ts`, `packages/create-kai/scripts/build.mjs` (one new `failIf`), `packages/create-kai/scripts/verify-pack.mjs`

**Interfaces:**
- Consumes: `@kitn.ai/blocks` resolving from `packages/create-kai` (Task 2 Step 9), and the specifier imports from Task 4.
- Produces: `missingReuseInputsProblem(inputs: readonly string[]): string | null`, exported from `packages/create-kai/src/build-guards.ts` and called from `scripts/build.mjs` beside the existing `bundleGraphProblem` call. Returns `null` when the bundle's module graph reaches `packages/blocks/src/`, and a message naming the miss otherwise.

- [ ] **Step 1: Write the failing test for the positive half**

Add to `packages/create-kai/test/build-guards.test.ts`:

```ts
describe('missingReuseInputsProblem', () => {
  // esbuild metafile input keys are relative to the process cwd, which for this
  // build is packages/create-kai, so the blocks package arrives as
  // ../blocks/src/registry.ts. The rule matches the path SEGMENT rather than a
  // prefix, the same shape bundleGraphProblem's ban rules use, so it survives
  // being run from a different cwd.
  it('is silent when the graph reaches the blocks package source', () => {
    expect(
      missingReuseInputsProblem([
        'src/index.ts',
        '../blocks/src/registry.ts',
        '../blocks/src/forms.ts',
      ]),
    ).toBeNull();
  });

  it('names the miss when the graph does not reach it', () => {
    const msg = missingReuseInputsProblem(['src/index.ts', '../ui/mcp/registry.ts']);
    expect(msg).toMatch(/packages\/blocks\/src/);
    expect(msg).toMatch(/copy/i);
  });

  it('a vendored copy under create-kai does not satisfy it', () => {
    // The failure this guards against is somebody re-adding a local copy of the
    // registry rather than importing the package: the ban rules would stay
    // green, because a copy breaks no ban.
    const msg = missingReuseInputsProblem(['src/index.ts', 'src/vendor/blocks-registry.ts']);
    expect(msg).toMatch(/packages\/blocks\/src/);
  });
});
```

and extend the file's existing import of the guards to include `missingReuseInputsProblem`.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter create-kai exec vitest run test/build-guards.test.ts
```

Expected: FAIL with `missingReuseInputsProblem is not a function` (or a TS resolution error naming the missing export).

- [ ] **Step 3: Implement it**

Add to `packages/create-kai/src/build-guards.ts`, immediately after `bundleGraphProblem`:

```ts
/**
 * The POSITIVE half of the bundle-graph rule.
 *
 * `bundleGraphProblem` says what the CLI may not reach. It cannot say what the
 * CLI MUST reach, and the difference matters: the reuse boundary this build
 * asserts is that block logic comes from `@kitn.ai/blocks` and is never copied
 * here. A vendored copy breaks no ban rule, so the ban half stays green while
 * the exact drift the boundary exists to prevent has already happened.
 *
 * A workspace-linked package's inputs resolve to real paths under
 * `packages/blocks/`, not to `node_modules/@kitn.ai/blocks/`, which is also why
 * the ban rules keep working unchanged across this move.
 */
export function missingReuseInputsProblem(inputs: readonly string[]): string | null {
  const normalized = inputs.map((input) => input.replaceAll('\\', '/'));
  const required: { what: RegExp; why: string }[] = [
    {
      what: /(?:^|\/)(?:packages\/)?blocks\/src\//,
      why: '@kitn.ai/blocks (packages/blocks/src) — the registry and the shared form renderer',
    },
  ];

  const missing = required.filter((rule) => !normalized.some((input) => rule.what.test(input)));
  if (missing.length === 0) return null;

  return (
    'create-kai build: the CLI bundle does NOT reach a module it must.\n' +
    missing.map((rule) => `  · ${rule.why}`).join('\n') +
    '\n  Block logic is the blocks package, never a copy here: one source, a build\n' +
    '  failure as the drift failure mode. If this fires after an intentional\n' +
    '  refactor, the fix is to import the package, not to delete this rule — a\n' +
    '  vendored copy breaks no ban rule, so the ban half cannot see it.'
  );
}
```

- [ ] **Step 4: Run the test green**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter create-kai exec vitest run test/build-guards.test.ts
```

Expected: PASS.

- [ ] **Step 5: Restate `bundleGraphProblem`'s message for the new shape**

In `packages/create-kai/src/build-guards.ts`, the message's closing paragraph currently reads:

```ts
    '  The CLI is one bundled zero-dependency file so `npx` cold start is fast, and\n' +
    '  every user downloads all of it. Read what you need from the LEAF modules at the\n' +
    '  root of mcp/ — registry.ts, types.ts, route-emit.ts. If the fact you\n' +
    '  need only exists inside mcp/, move it to a leaf rather than importing the tool.'
```

Replace with:

```ts
    '  The CLI is one bundled zero-dependency file so `npx` cold start is fast, and\n' +
    '  every user downloads all of it. Read what you need from the LEAF modules at the\n' +
    '  root of mcp/ — registry.ts, types.ts, route-emit.ts — or from @kitn.ai/blocks,\n' +
    '  which is a whole package of them. If the fact you need only exists inside\n' +
    '  mcp/, move it to a leaf rather than importing the tool.'
```

The docblock above the function names the three leaves; add one sentence after that list:

```ts
 *     The blocks registry and the form renderer are the same kind of leaf and
 *     now live in their own package, `@kitn.ai/blocks`; `missingReuseInputsProblem`
 *     below asserts the bundle really reaches it rather than a local copy.
```

- [ ] **Step 6: Wire the new guard into the build**

In `packages/create-kai/scripts/build.mjs`, immediately after the existing line:

```js
  failIf(guards.bundleGraphProblem(Object.keys(bundled.metafile.inputs)));
```

add:

```js
  failIf(guards.missingReuseInputsProblem(Object.keys(bundled.metafile.inputs)));
```

- [ ] **Step 7: Watch the build guard fire on the real metafile**

The rule is written against an assumed key shape. Confirm it against the real one rather than trusting the regex:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter create-kai run build
```

Expected: green. Then prove the key shape really is what the rule matches:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai
node -e "
const {build}=require('esbuild');
build({entryPoints:['src/index.ts'],bundle:true,write:false,metafile:true,platform:'node',format:'esm',external:['zod'],logLevel:'silent'})
  .then(r=>console.log(Object.keys(r.metafile.inputs).filter(k=>/blocks\/src\//.test(k))))
  .catch(e=>{console.error('probe failed:',e.message);process.exit(1)});
"
```

Expected: a non-empty array naming the blocks sources. If it is empty while `pnpm run build` was green, the guard passed vacuously and the regex is wrong -- fix the regex, do not adjust the test.

- [ ] **Step 8: Add the tarball assertion to `verify-pack.mjs`**

In `packages/create-kai/scripts/verify-pack.mjs`, immediately after the existing `dist/templates/**` check:

```js
const templateFiles = files.filter((f) => f.startsWith('dist/templates/'));
if (templateFiles.length === 0) {
  problems.push(
    'no dist/templates/** in the tarball — `npx create-kai` would install and then find no template',
  );
}
```

add:

```js
// The same failure shape as the templates case above, on the other half of what
// the CLI ships. A tarball with a bundled CLI and no blocks passes every check
// over the tree: `create-kai add` installs cleanly and then finds nothing to
// write, at the user's first run.
const blockFiles = files.filter((f) => f.startsWith('dist/blocks/'));
if (blockFiles.length === 0) {
  problems.push(
    'no dist/blocks/** in the tarball — `create-kai add` would install and then find no block to write',
  );
}
```

- [ ] **Step 9: Watch the tarball assertion fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
mv packages/create-kai/dist/blocks packages/create-kai/dist/blocks.away
pnpm --filter create-kai run verify:pack
```

Expected: RED, naming `no dist/blocks/**`. Then restore and re-run:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
mv packages/create-kai/dist/blocks.away packages/create-kai/dist/blocks
pnpm --filter create-kai run verify:pack
```

Expected: green.

- [ ] **Step 10: The create-kai gate, including the smoke**

<!-- gate-list: partial -- this task's own verification subset, not the merge gate; the merge gate is the required `test` graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter create-kai run build
pnpm --filter create-kai run typecheck
pnpm --filter create-kai exec vitest run
pnpm --filter create-kai run verify:pack
pnpm --filter create-kai run smoke
```

Expected: all green. The smoke's `add` leg is the one that matters here: it drives the BUILT CLI, lists blocks out of the bundled registry, writes one into a react project and a plain project, and asserts a second `add` refuses. Read its printed line naming the block it used and the count it listed; a count of zero would have thrown, which is the point.

- [ ] **Step 11: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/create-kai
git commit -m "$(cat <<'MSG'
refactor(blocks): create-kai asserts the blocks package is REACHED, and that it ships

Two guards, both watched failing first.

missingReuseInputsProblem is the positive half of the bundle-graph rule.
bundleGraphProblem says what the CLI may not reach and cannot say what it must,
and the difference is the drift the reuse boundary exists to stop: a vendored
copy of the registry breaks no ban rule, so the ban half stays green while the
boundary is already gone.

verify-pack gains a dist/blocks/** assertion mirroring the dist/templates/** one
beside it. Today a tarball with a bundled CLI and no blocks passes everything
over the tree and fails at the user's first `add`.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 7: CI wiring

**Files:**
- Modify: `.github/workflows/test.yml` (the `unit` leg, and the comment on the `verify:blocks` step in the `browser` leg)

**Interfaces:**
- Consumes: the `typecheck` and `test` scripts from Task 2.
- Produces: exactly two new entries in `node packages/ui/scripts/lint-gate-parity.mjs --list`: `@kitn.ai/blocks run typecheck` and `@kitn.ai/blocks vitest (all projects)`. Task 9 diffs the list against the Task 1 baseline and asserts those two and nothing else.

- [ ] **Step 1: Add the blocks steps to the `unit` leg**

In `.github/workflows/test.yml`, in the `unit` job, immediately AFTER the `Unit tests (jsdom)` step and BEFORE the emitted-code step, insert:

```yaml
      # The blocks package: pure functions over injected data plus the authored
      # block sources. Node-environment, no build input of any kind, so it sits
      # here rather than behind the kit artifact. The block CELLS -- contracts,
      # freshness, pins and the recorded browser baseline per block -- are
      # verify:blocks in the `browser` leg, which needs the kit's dist.
      - name: Blocks package typecheck
        run: pnpm --filter @kitn.ai/blocks run typecheck

      - name: Blocks package tests
        run: pnpm --filter @kitn.ai/blocks exec vitest run
```

The `unit` leg already runs `pnpm install --frozen-lockfile`, which is all these two need. Do not put them in the `build` leg: they must not be able to pass because something else built first.

- [ ] **Step 2: Fix the one comment in the `browser` leg that names the old path**

Around line 1107 the comment reads:

```
      # Every block in packages/ui/blocks/ gets its CI cell (V-2, blocks-and-
```

Replace `packages/ui/blocks/` with `packages/blocks/blocks/`.

- [ ] **Step 3: Confirm the extractor recognises both new steps**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/scripts/lint-gate-parity.mjs --list > /tmp/gates-after-task7.txt
diff "$BASE/gates-baseline.txt" /tmp/gates-after-task7.txt
```

Expected: exactly two added lines, `@kitn.ai/blocks run typecheck` and `@kitn.ai/blocks vitest (all projects)`, each with its step name beneath. Nothing removed, nothing renamed. If the extractor reports an unknown shape instead, it is telling you it cannot classify a step -- read the step it names rather than working around it.

- [ ] **Step 4: Run the two doc linters**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
```

Expected: both exit 0. `lint-gate-parity` scans `docs/superpowers/**`, which includes THIS plan file. If it flags a fenced block here, add `<!-- gate-list: partial -- <reason> -->` above that block rather than editing the commands.

- [ ] **Step 5: Confirm the workflow still parses as YAML**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node -e "const {parse}=require('yaml');const y=parse(require('fs').readFileSync('.github/workflows/test.yml','utf8'));const s=y.jobs.unit.steps.map(x=>x.name).filter(Boolean);console.log(s.join('\n'))"
```

Expected: the `unit` leg's step names print in order, with the two new ones between `Unit tests (jsdom)` and the emitted-code step. The `yaml` package is already in the workspace; this is the same cross-check `lint-gate-parity.mjs`'s header records having done once against its own narrow extractor.

- [ ] **Step 6: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add .github/workflows/test.yml
git commit -m "$(cat <<'MSG'
refactor(blocks): the blocks package typecheck and suite join the required unit leg

Two steps, in `unit` rather than `build`: the package has no build input of any
kind, and putting them behind the kit artifact would let them pass because
something else built first. lint-gate-parity --list gains exactly these two
entries and nothing else.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 8: Docs, the coupling map, and the non-changes stated out loud

**Files:**
- Modify: `docs/coupling-map.md`, `CLAUDE.md` (the Map paragraph and the architecture bullet), `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md:474`

**Interfaces:**
- Consumes: everything above.
- Produces: no code. This task is the record.

- [ ] **Step 1: Confirm there is nothing to rewrite in `docs/coupling-map.md`**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
grep -n "packages/ui/blocks\|mcp/blocks" docs/coupling-map.md || echo "no old blocks path in the coupling map"
grep -n "blocks" docs/coupling-map.md
```

Expected: the first command prints the no-old-path line. **This step is a confirmation, not an edit.** The coupling map's `blocks` mentions are the CDN-pin row, the two build-artifact rows (which name `scripts/block-driver/pages/generated/`, a path that does not move) and the §10 narrative -- none of them spells `packages/ui/blocks` or `mcp/blocks`. Run the greps and see it rather than assuming it; the real work in this task is Step 2's new rows.

If a hit DOES appear, rewrite it: `packages/ui/blocks/` becomes `packages/blocks/blocks/`, `mcp/blocks/registry.ts` becomes `@kitn.ai/blocks` (`packages/blocks/src/registry.ts`), `mcp/blocks/forms.ts` becomes `@kitn.ai/blocks/forms` (`packages/blocks/src/forms.ts`).

- [ ] **Step 2: Add the two new coupling rows**

The move creates two couplings that did not exist before.

**Row one**, for §10: `packages/blocks`'s `exports` map is now read by four consumers, two of them by parsing the JSON. Append:

```markdown
| `packages/blocks/package.json`'s `exports` map | `packages/ui/scripts/gen-blocks.mjs` and `packages/ui/scripts/verify-blocks.mjs`, which PARSE it to find the registry entry for their esbuild round trip; `packages/create-kai`'s CLI bundle, the gallery's vite build, Storybook's builder and four tsc passes, which resolve through it normally | Renaming or restructuring a key leaves the two generators unable to locate the entry. They fail loudly and by name (`@kitn.ai/blocks has no exports["."].default`), which is the designed outcome; the failure mode worth naming is the opposite one, adding a key nothing reads | The two generators' explicit hard failure, plus `pnpm --filter @kitn.ai/ui run verify:blocks`, which drives both. There is no check that every exports key HAS a consumer -- that is exactly the rot the dead `dist/agent-tooling/blocks/*.d.ts` emission was, and it took a package move to notice |
```

**Row two**, also for §10, and this is the one with `NOTHING` in the last column:

```markdown
| A block source under `packages/blocks/blocks/` | `packages/ui`'s cached `build` output (`dist/blocks/**` and the generated driver pages), which `gen-blocks.mjs` writes in `postbuild` | `nx.json`'s default `namedInputs` are `{projectRoot}/**/*`, and the block sources are no longer inside `ui`'s project root. The ONLY thing that makes a block edit invalidate `ui`'s build hash is the project-graph edge `ui -> blocks`, created by the `workspace:*` devDependency in `packages/ui/package.json`. Drop that devDependency -- because "nothing in `src/` imports it", which is true -- and `nx build ui` can serve a cache hit over changed block sources and print success. A cached build looks exactly like a successful one | **NOTHING automated.** The edge is asserted once, by hand, in this move's Task 2 Step 10 (`nx show projects` lists `blocks`; the graph's `ui` dependencies include `blocks`). `verify:blocks` would eventually catch the stale artifact through its `fresh` check, but only on a run that did not itself come from cache |
```

**And one line for §4** (derived lists), because the entry path is now a copy that lives in two forms:

```markdown
- `packages/blocks/package.json`'s `exports["."].default` -- the registry entry path. Read, never restated, by `packages/ui/scripts/gen-blocks.mjs` and `packages/ui/scripts/verify-blocks.mjs`, which parse the manifest rather than joining a path literal. Both hard-fail by name if the key is absent.
```

- [ ] **Step 3: Update `CLAUDE.md`**

In the Map paragraph (the last line of the file's "Map" section), replace:

```
pnpm + NX workspace. `packages/ui/` (the kit: `src/` -- `primitives` · `ui` · `components` · `state` · `wire` · `elements` -- plus `mcp/` (the `kai` MCP + construct engine, with its own tests), `frameworks/react/` wrappers, Storybook, `theme.css` / `theme.tokens.css`) · `apps/docs/` (public Astro Starlight docs → ui.kitn.ai) · `examples/*` (at repo root, deferred) · `packages/ui/dist/` (built, gitignored).
```

with:

```
pnpm + NX workspace. `packages/ui/` (the kit: `src/` -- `primitives` · `ui` · `components` · `state` · `wire` · `elements` -- plus `mcp/` (the `kai` MCP + construct engine, with its own tests), `frameworks/react/` wrappers, Storybook, `theme.css` / `theme.tokens.css`) · `packages/blocks/` (`@kitn.ai/blocks`, private: the authored blocks, the registry that understands their layout, and the shared form renderer) · `apps/docs/` (public Astro Starlight docs → ui.kitn.ai) · `examples/*` (at repo root, deferred) · `packages/ui/dist/` (built, gitignored).
```

Then add a new bullet to the "Architecture" list, immediately after the `packages/ui/mcp/` bullet:

```markdown
- `packages/blocks/` (`@kitn.ai/blocks`, private, never published) the authored blocks (`blocks/<id>/` -- a directory IS a block when it holds a `registry-item.json`), `src/registry.ts` (validation, the directory-scan discovery, the derived index and item JSON, the CDN-form generator, `checkBlockContracts`) and `src/forms.ts` (the ONE renderer every delivery form goes through, so what the gallery shows is byte-for-byte what `create-kai add` writes). **It depends on nothing** -- not `@kitn.ai/ui`, not zod, not `node:*` -- and its `tsconfig.json` declares no ambient type packages, which is what enforces the last of those mechanically. The kit-derived facts arrive by injection from callers that have a filesystem: `routeIntegrations` from `listIntegrations()`, `nonscalarByTag` from `src/elements/element-nonscalar.json`, `version` from `packages/ui/package.json`. No build step: the `exports` map points at `.ts` and every consumer bundles it. `packages/ui/scripts/{gen-blocks,verify-blocks}.mjs` stay in the ui package because they need the kit's build outputs; they read the entry out of the package's exports map.
```

- [ ] **Step 4: Add the one line to the 2026-08-31 spec, without rewriting history**

At `docs/superpowers/specs/2026-08-31-blocks-and-parts-design.md:474` the text reads `` `packages/ui/blocks/<id>/` (each with a small manifest: title, ``. Do NOT rewrite it. Add one line immediately after the bullet it belongs to:

```markdown
  **Path note, 2026-09-02:** the block sources moved to
  `packages/blocks/blocks/<id>/` and the registry to `@kitn.ai/blocks`. See
  `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` section
  2. Everything this bullet says about the mechanism still holds.
```

`docs/superpowers/HANDOFF-2026-09-01-blocks-shipped.md` names `agent-tooling/blocks/forms.ts`, which was already historical before this PR: it records what shipped at the time. Leave it. Historical records get labelled, never rewritten, and that line is already labelled by the handoff's own date.

- [ ] **Step 5: Confirm the two non-changes, in writing and by grep**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node -e "const c=require('./release-please-config.json');console.log(Object.keys(c.packages))"
grep -n "blocks" release-please-config.json .github/workflows/release-please.yml || echo "no blocks entry in the release config or the publish loop, as intended"
```

Expected: the package list names `packages/ui` and `packages/create-kai` only, and the grep prints the no-entry line. `@kitn.ai/blocks` is `private: true` and must never enter the publish loop; this plan adds nothing to either file, deliberately.

- [ ] **Step 6: Run the doc linters again**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
pnpm --filter @kitn.ai/ui run lint:cdn-pins
```

Expected: all three exit 0. `lint:cdn-pins` is here because its `SCAN_ROOTS` covers `packages`, so the moved sources are in its scan; a zero-match run is a hard failure there by design, which is what makes a green meaningful.

- [ ] **Step 7: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add docs CLAUDE.md
git commit -m "$(cat <<'MSG'
refactor(blocks): record the move in the coupling map, CLAUDE.md and the 2026-08-31 spec

One new coupling row: three consumers now read packages/blocks/package.json's
exports map, two of them by parsing it. Nothing checks that an exports key has a
consumer, which is exactly the rot the dead dist/agent-tooling/blocks/*.d.ts
emission was; the row says so.

The 2026-08-31 spec gets a dated path note rather than a rewrite. It records
what was true when it was written.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 9: The full gate, the tarball diff, and the PR

**Files:**
- Modify: none, unless a gate finds something.

**Interfaces:**
- Consumes: everything, plus the four baselines from Task 1.
- Produces: a PR with the enumerated deltas as its evidence.

- [ ] **Step 1: Cold build from an empty dist**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
rm -rf dist
npm run build:css
npm run build
```

Do not pipe this through `tail` inside an `&&` chain.

- [ ] **Step 2: The `@kitn.ai/ui` pack file list, name for name**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npm pack --dry-run --json > "$BASE/pack-final.json"
node -e "const f=require(process.env.BASE+'/pack-final.json')[0].files.map(x=>x.path).sort();require('fs').writeFileSync(process.env.BASE+'/pack-files-final.txt',f.join('\n')+'\n')"
diff "$BASE/pack-files-baseline.txt" "$BASE/pack-files-final.txt"
```

**Expected, and this is THE gate on the move:** exactly THREE removed lines and ONE added line.

```
< dist/agent-tooling/blocks/forms.d.ts
< dist/agent-tooling/blocks/registry.d.ts
< dist/assets/dev-<OLDHASH>.js
> dist/assets/dev-<NEWHASH>.js
```

The first two are Task 5's deleted declarations. The third and fourth are ONE file, renamed by its own content hash, and the reason is Task 3 Step 9: `CONTRACT_BANNER` lives in the registry module, the registry module is bundled into `dev.ts`'s chunk of the `construct-cli` build, and vite names that chunk `dist/assets/dev-<hash>.js`. Change one character of the banner and the hash moves. Measured on the pre-move tree, the chunk is `dist/assets/dev-DnPmEzRp.js` and **exactly one** file imports it, `dist/construct-cli.es.js`, whose own name is fixed -- so the rename does not cascade.

Confirm that shape rather than assuming it:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
grep -o "assets/dev-[A-Za-z0-9_-]*\.js" dist/construct-cli.es.js | sort -u
grep -rlo "assets/dev-" dist/*.js
```

Expected: one chunk name, and `dist/construct-cli.es.js` as its only importer. If a second importer appears, the hash rename cascades and the expected delta is larger -- enumerate the whole cascade before treating it as fine.

Any line outside those four is a finding. In particular a MISSING `dist/blocks/...` entry means the generator lost the sources, and any OTHER added entry means something is emitting that was not before.

- [ ] **Step 3: The cold `dist/` content diff, against the Task 1 baseline**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
diff -r "$BASE/dist-baseline" dist
```

**Expected set, in full. Nothing outside it:**

1. `Only in $BASE/dist-baseline/agent-tooling: blocks` -- the deleted declaration directory (Task 5).
2. A PAIR under `dist/assets`: `Only in $BASE/dist-baseline/assets: dev-<OLDHASH>.js` and `Only in dist/assets: dev-<NEWHASH>.js`. Same file, renamed by its content hash because `CONTRACT_BANNER` is bundled into it. Diff the two by hand (`diff "$BASE/dist-baseline/assets/dev-<OLDHASH>.js" dist/assets/dev-<NEWHASH>.js`) and confirm the ONLY difference is the banner string.
3. One changed comment line in each generated CDN form under `dist/blocks/r/*.cdn.html`: the `CONTRACT_BANNER` line naming where a block's source lives, `packages/ui/blocks/` becoming `packages/blocks/blocks/` (Task 3 Step 9). One line per file, in the HTML comment, nothing else in those files.
4. `dist/construct-cli.es.js` differs, in exactly TWO ways: the `CONTRACT_BANNER` string it inlines, and the `assets/dev-<hash>.js` specifier it imports. Both are the same cause. Anything beyond those two is a finding.
5. Nothing else. In particular `dist/blocks/registry.json` and `dist/blocks/r/*.json` must be BYTE-IDENTICAL: the banner is not part of the item JSON, and no block source was edited. `dist/mcp.es.js` must be byte-identical too: the MCP bundle does not carry `dev.ts`.

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
diff "$BASE/dist-baseline/mcp.es.js" dist/mcp.es.js && echo "mcp.es.js identical, as expected"
diff "$BASE/dist-baseline/blocks/registry.json" dist/blocks/registry.json && echo "registry.json identical, as expected"
diff "$BASE/dist-baseline/construct-cli.es.js" dist/construct-cli.es.js
```

The last one is EXPECTED to print output. Read it: two hunks, the banner and the chunk specifier. A chunk-order or import-shape change beyond those is a real finding about bundling a workspace TypeScript package, not noise.

Record the exact diff output; it goes in the PR body verbatim.

- [ ] **Step 4: The create-kai tarball list**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter create-kai run build
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai
npm pack --dry-run --json > "$BASE/ck-pack-final.json"
node -e "const f=require(process.env.BASE+'/ck-pack-final.json')[0].files.map(x=>x.path).sort();require('fs').writeFileSync(process.env.BASE+'/ck-pack-final.txt',f.join('\n')+'\n')"
diff "$BASE/ck-pack-baseline.txt" "$BASE/ck-pack-final.txt"
```

Expected: empty. `create-kai`'s tarball carries the same `dist/blocks/**` names as before; only where the build COPIED them from changed.

- [ ] **Step 5: The gate-parity diff**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/scripts/lint-gate-parity.mjs --list > "$BASE/gates-final.txt"
diff "$BASE/gates-baseline.txt" "$BASE/gates-final.txt"
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
```

Expected: exactly two added gates (`@kitn.ai/blocks run typecheck`, `@kitn.ai/blocks vitest (all projects)`) and their step names, nothing removed, and both linters exit 0.

- [ ] **Step 6: The local gate run, mirroring the required `test` job**

Run each as its own command. Never chain them through a pipe.

<!-- gate-list: partial -- the local pre-push subset run from one machine; the merge gate is the required `test` graph across five parallel legs, printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/blocks run typecheck
pnpm --filter @kitn.ai/blocks exec vitest run
pnpm exec nx typecheck ui --skip-nx-cache
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter @kitn.ai/ui run verify:blocks
pnpm --filter @kitn.ai/ui run verify:consumer
pnpm --filter @kitn.ai/ui run verify:scaffold
pnpm --filter @kitn.ai/ui run verify:construct
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run verify:dts
pnpm --filter @kitn.ai/ui run verify:dts:consumer
pnpm --filter @kitn.ai/ui run verify:pack
pnpm --filter @kitn.ai/ui run verify:artifact-glob
pnpm --filter @kitn.ai/ui run build-storybook
pnpm --filter @kitn.ai/ui run lint:silent-drops
pnpm --filter @kitn.ai/ui run lint:cdn-pins
pnpm --filter @kitn.ai/ui run lint:catalog-drift
pnpm --filter @kitn.ai/docs run verify:docs
pnpm --filter create-kai run build
pnpm --filter create-kai run typecheck
pnpm --filter create-kai exec vitest run
pnpm --filter create-kai run verify:pack
pnpm --filter create-kai run smoke
```

Then the pinned-npm pack pass, which is a SEPARATE gate from the two `verify:pack` runs above and is the one this move's tarball claim actually rests on. CI runs it as `packed-tarball shape, both packages (under the npm the release job pins)`; reproduce it locally:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
npm install --prefix "$BASE/npm-release-pin" npm@12.0.2 --no-audit --no-fund
VERIFY_PACK_NPM="$BASE/npm-release-pin/node_modules/.bin/npm" pnpm --filter create-kai run verify:pack
VERIFY_PACK_NPM="$BASE/npm-release-pin/node_modules/.bin/npm" pnpm --filter @kitn.ai/ui run verify:pack
```

`npm pack --json` changed shape under a newer npm DURING a publish once; both packages' parsers were only ever exercised under the older one. Read the pin version out of `.github/workflows/test.yml`'s step rather than trusting the literal above, which is a copy.

Expected: every command exits 0.

**What is deliberately deferred to the PR run, and why.** `verify:ssr`, the cross-origin `test:e2e` matrix, the built-bundle Playwright guards (`test:focus-ring`, `test:hovercard`, `test:content-brand-bleed`, `test:message-text-token`, `test:command-ivp`, `test:menu-ivp`) and `test:react` are not here: each needs a browser install and none of them can see a package boundary move -- they drive the built bundle, which this PR proves byte-equal apart from the enumerated four lines. The required `test` graph runs them; `gh pr checks --watch` in Step 10 is where they are read. `nx build docs` is replaced by `@kitn.ai/docs run verify:docs`, which is the gate CI actually runs (`Docs alignment (every doc snippet compiles against the shipped API)`); the astro build is not in the required graph at all.

Two of these print axes rather than a verdict, and the axes are the claim, not a number written here:

- `verify:scaffold` prints its axes and cell counts. Compare them against a run on `main`; identical counts is the claim. This PR touches no scaffolder axis, so a moved count is a finding.
- `verify:blocks` prints the discovered block ids. Compare against `$BASE/block-ids-baseline.txt`.

- [ ] **Step 7: Assert the tree carries no scratch path and no stale reference**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git status --porcelain
git grep -nE "/private/tmp/claude-|/var/folders/|$TMPDIR" -- . | head
git grep -n "packages/ui/blocks" -- . ':!docs/superpowers' | head
git grep -n "mcp/blocks" -- . ':!docs/superpowers' | head
```

Expected: `git status --porcelain` is clean, the scratch grep prints nothing, and both path greps print nothing.

`docs/superpowers` is excluded WHOLE, and that is deliberate rather than lazy. That tree is the dated record: the handoffs, the extraction research, the two earlier plans, the 2026-08-31 spec (which now carries its dated path note), the 2026-09-01 restructure spec and the 2026-09-02 spec this plan implements all name the old paths correctly, because they record what was true when they were written. Historical records get labelled, never rewritten. Narrowing the exclusion to a few globs, as an earlier draft of this plan did, just makes the grep print those same files under a different name.

Everything OUTSIDE that tree must be clean, including `packages/ui/config/vite/lib.ts`, whose Task 5 replacement comment is phrased without the old paths precisely so this grep stays readable.

- [ ] **Step 8: Push and open the PR**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git push -u origin feat/blocks-package
gh pr create --title "refactor(blocks): the blocks become packages/blocks (@kitn.ai/blocks)" --body "$(cat <<'BODY'
PR A of five in
`docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` section 7:
the move, and only the move. No behaviour change, which is what makes the
tarball diff a real gate.

## What moved

- `packages/ui/blocks/<id>/**` -> `packages/blocks/blocks/<id>/**`
- `packages/ui/mcp/blocks/registry.ts` -> `packages/blocks/src/registry.ts`
- `packages/ui/mcp/blocks/forms.ts` -> `packages/blocks/src/forms.ts`, still ONE
  file. The per-framework split is PR B.
- `packages/ui/mcp/tests/blocks-registry.test.ts` -> `packages/blocks/tests/registry.test.ts`

`@kitn.ai/blocks` is private, never published, and absent from
`release-please-config.json` and the publish loop by design. It exports `.` and
`./forms`; `./targets` is PR B/D and is not here.

## The tarball

`npm pack --dry-run --json` for `@kitn.ai/ui`, name for name against `main`:
three removed, one added.

    < dist/agent-tooling/blocks/forms.d.ts
    < dist/agent-tooling/blocks/registry.d.ts
    < dist/assets/dev-<OLDHASH>.js
    > dist/assets/dev-<NEWHASH>.js

The first two were emitted by two `dts.include` entries that no `exports` key
named and nothing in the repo resolved. The comment at that site already
recorded them as kept "pending a separate removal decision"; the move made the
decision.

The third and fourth are ONE file, renamed by its own content hash. The registry
module's `CONTRACT_BANNER` tells whoever pastes a CDN form where to edit the
block's source, that directory moved, and the registry module is bundled into
`dev.ts`'s chunk of the `construct-cli` build. Exactly one file imports that
chunk (`dist/construct-cli.es.js`, fixed name), so the rename does not cascade;
the check for that is in the PR's evidence below.

`diff -r` of a cold `dist/` against a pre-move baseline, in full: the deleted
declaration directory, that `dist/assets` rename pair, one comment line per
generated CDN form, and `dist/construct-cli.es.js` differing in exactly two ways
(the banner, and the chunk specifier it imports). `dist/mcp.es.js`,
`dist/blocks/registry.json` and every `dist/blocks/r/*.json` are byte-identical.

`create-kai`'s tarball file list diffs empty.

## Judgement calls worth reviewing

**1. The `nx` key on `packages/blocks` carries a name and no `targets` map**, which is a deliberate deviation from spec section 2.1 (it asks for the create-kai pattern, a map with `test.dependsOn` and `typecheck.dependsOn`). `nx.json`'s `targetDefaults` gives `test` and `typecheck` no `dependsOn` at all, and this package's `test` and `typecheck` read only its own source, so an explicit empty `dependsOn` would be noise pretending to be a constraint. Say so if you disagree; it is one line either way.

**2. The moved test SPLIT.**

It split because four of its assertions need inputs that only
`packages/ui` has: the real integration catalog, the real element-nonscalar
map, the kit's version, and the built artifacts under `dist/blocks/`.

The split is by what each assertion's INPUTS are, not by its subject. Facts
about the registry module and the block sources went with them and take their
two injected inputs from FIXTURES -- the seam exists so the module does not know
those values, and a test of an injection seam that reaches for the real value is
testing the caller. The four ui-dependent assertions stay in the ui package as
`mcp/tests/blocks-artifacts.test.ts`, inside the `unit` project, so a stale
build is still caught in the fast suite rather than only by `verify:blocks`,
which needs a browser.

Nothing is lost; each half is asserted where its inputs live. Two assertions
were additionally WEAKENED on purpose on the blocks side and the reason is in a
comment at each site: `expect(errors).toEqual([])` over the real blocks passed
only because all three manifests happen to declare `registryDependencies: []`,
and would go red against fixture routes the day one declares a real
`route:<id>`; and the version-equality claim became a two-version render, which
is the part the injection seam can actually prove. The real-catalog and
real-version halves of both are asserted in `blocks-artifacts.test.ts` and by
`verify:blocks`.

**3. Four toolchains now resolve a workspace package whose `exports` point at
`.ts`**: the gallery's vite build, the ui `unit` vitest project, create-kai's
vitest project, and Storybook's builder. Each was exercised; the PR records
whether any needed a `server.deps.inline` / `optimizeDeps.exclude` escape hatch,
because PR C hits the identical question from `apps/docs`.

## Two new guards, both watched failing first

- `missingReuseInputsProblem` in `create-kai`'s build guards is the POSITIVE
  half of the bundle-graph rule. `bundleGraphProblem` says what the CLI may not
  reach and cannot say what it must, and the difference is the drift the reuse
  boundary exists to stop: a vendored copy of the registry breaks no ban rule,
  so the ban half stays green while the boundary is already gone.
- `verify-pack.mjs` gains a `dist/blocks/**` assertion mirroring the
  `dist/templates/**` one beside it. Today a tarball with a bundled CLI and no
  blocks passes everything over the tree and fails at the user's first `add` --
  the same failure shape the templates assertion exists for.

## Derive it, don't type it

Every consumer that reached the block sources by path now resolves the package
instead: `create-kai`'s build copies from the resolved package root rather than
`path.join(repoRoot, 'packages/ui/blocks')`, and the two `.mjs` generators read
their entry OUT OF the package's `exports` map instead of a path literal. Both
generators hard-fail by name if that key is missing.

## Evidence

- Cold `npm run build` from an empty `dist/`, then the local gate subset:
  blocks typecheck and suite, `nx typecheck ui --skip-nx-cache`,
  `--project=unit`, `--project=emitted`, `verify:blocks`, `verify:consumer`,
  `verify:scaffold`, `verify:construct`, `verify:generated`, `verify:dts`,
  `verify:dts:consumer`, `verify:pack`, `verify:artifact-glob`,
  `build-storybook`, `lint:silent-drops`, `lint:cdn-pins`,
  `lint:catalog-drift`, `@kitn.ai/docs verify:docs`, create-kai's build +
  typecheck + suite + `verify:pack` + `smoke`, and BOTH packages'
  `verify:pack` again under the npm the release job pins. All green. The
  browser-install gates (`verify:ssr`, `test:e2e`, the built-bundle Playwright
  guards, `test:react`) are left to the required CI graph: they drive the built
  bundle, which this PR proves byte-equal apart from the four enumerated lines.
- `dist/construct-cli.es.js` is the only importer of the renamed
  `dist/assets/dev-<hash>.js` chunk, so the content-hash rename does not
  cascade (`grep -rlo "assets/dev-" dist/*.js`).
- `nx show projects` lists `blocks` and the project graph carries the edge
  `ui -> blocks`, which is the only thing keeping a block-source edit from
  being invisible to `ui`'s build cache now that the sources left its project
  root. Registered as a coupling-map row with `NOTHING` in the enforced column.
- `verify:scaffold` printed the same axes and cell counts as `main`.
- `verify:blocks --self-test` still catches every planted class, including the
  missing-baseline class whose message now names the new path.
- `lint-gate-parity.mjs --list` diffs by exactly two added gates: the blocks
  typecheck and the blocks suite, both in the required `unit` leg.
- The `create-kai` smoke's `add` leg drove the BUILT CLI into a react project
  and a plain project and refused the re-add.

BODY
)"
```

- [ ] **Step 9: Clean up the scratch directory**

```bash
rm -rf "$BASE"
cd /Users/home/Projects/kitn-ai/kitn-chat
git status --porcelain
```

Expected: the scratch directory is gone and the tree is clean.

- [ ] **Step 10: Before merge**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
gh pr update-branch
gh pr checks --watch
```

Expected: the branch is current with `main` and the required `test` check concludes success. A green local run is not the merge gate.

---

## Self-review

**Spec coverage.** Section 2.1's table: the package, its two source files, its tests, its two configs and its `nx` key are Task 2 and Task 4; `src/forms/` as a directory and `src/targets.ts` are explicitly OUT of scope per section 7's PR-A boundary, and the Scope section says so rather than leaving it implicit. Section 2.2's dependency direction is Task 2's `"types": []` ruling plus Task 4's exports-map read, and the three injected inputs are named in the package README and in the CLAUDE.md bullet. Section 2.3's consumer table: all five rows are Tasks 3, 4 and 6, and the three create-kai build details (`bundleGraphProblem`, the resolved copy in `build.mjs`, the `verify-pack.mjs` assertion) each have their own steps with the watch-it-fail step attached. Section 2.4's dead emission is Task 5. Section 2.5 is PR C and is excluded by name. Section 5's "what stays" (`verify:blocks` keeps all four checks and its `--self-test`, only its inputs move) is Tasks 3 and 4; section 5's "what is new" is entirely PR B and after, except the "every new guard is watched failing first" rule, which Tasks 2, 4 and 6 each apply. Section 7's PR A gate list -- pack list, `verify:blocks`, create-kai smoke, `nx typecheck ui --skip-nx-cache` -- is Task 9 Steps 2, 6 and 6.

**Placeholder scan.** No TBD, no "add appropriate error handling", no "similar to Task N". Every code step carries the literal replacement text. Four figures are deliberately left to the run rather than written down, and each names the command that prints it: the `@kitn.ai/ui` pack file count (Task 1 Step 3), `verify:scaffold`'s axes and cell counts (Task 9 Step 6), the discovered block ids (captured to `$BASE/block-ids-baseline.txt` in Task 1 Step 5 and compared, never typed), and the `dist/assets/dev-<hash>.js` chunk hashes on both sides of the move, which are written as `<OLDHASH>` / `<NEWHASH>` because a hash typed into a plan is stale the moment anything upstream of it changes. The npm pin in Task 9 Step 6 is written out but flagged as a copy, with the instruction to read it from the workflow step instead.

**Type consistency.** `missingReuseInputsProblem(inputs: readonly string[]): string | null` has the same signature shape as the neighbouring `bundleGraphProblem`, is declared in Task 6's Interfaces block, tested in Step 1, implemented in Step 3 and called in Step 6 under that exact name. `BLOCKS_PKG_JSON` / `BLOCKS_PKG_ROOT` / `BLOCKS_DIR` are introduced in Task 3 Steps 3-4 and reused unchanged in Task 4 Step 3, which explicitly reorders the two declarations so the resolve happens once rather than twice. `blocksEntry` is local to each generator. The `exports['.'].default` key is asserted by Task 2's skeleton test, read by both generators in Task 4, and registered as a coupling in Task 8. No symbol of the moved modules is added, renamed or removed anywhere; Task 4's Interfaces block enumerates the full exported surface of both specifiers so a reviewer can check that claim without opening the files.

**Known risks, stated rather than hidden.**

1. **Four toolchains resolving a workspace package whose `exports` point at `.ts`** (Task 4 Step 10, which carries the table). It should work -- pnpm symlinks the package, `preserveSymlinks` is off so the resolved path is real and outside `node_modules`, and both vite and vitest transform `.ts` -- but it is the mechanical unknown in the plan, and it has four instances, not one: the gallery's vite `page` build, the ui `unit` vitest project (`blocks-artifacts.test.ts`), create-kai's vitest project (`add.test.ts`, whose config had only ever imported built JavaScript), and Storybook's builder (`GalleryPage.stories.tsx`, reached by `.storybook/main.ts`'s `../apps/**/*.stories.@(ts|tsx)` glob and by NOTHING else in this plan, which is why Task 9's gate list gained `build-storybook`). The two vitest instances are a different failure class from the two bundler ones: they are dev-server file-serving semantics, the same class as the `/@fs/<parent>` failure CLAUDE.md records for worktrees, and their escape hatch is `test.server.deps.inline` rather than `optimizeDeps.exclude`. Each row names its own fallback and the step says to record which was needed, because PR C hits the identical question from `apps/docs`.
2. **The NX project-graph edge is the only thing making a block edit invalidate `ui`'s build cache.** `nx.json`'s default `namedInputs` are `{projectRoot}/**/*`, and the block sources are leaving `ui`'s project root. The edge comes from the `workspace:*` devDependency, which nothing in `src/` imports -- so a future tidy-up that removes it as "unused" would let `nx build ui` serve a cache hit over changed block sources and print success. Asserted once by hand (Task 2 Step 10) and registered as a coupling-map row whose enforced column says `NOTHING`, which is the honest entry.
3. **`verbatimModuleSyntax` / `isolatedModules` on the two moved files** (Task 4 Step 8). Measured clean before this plan was written, so this is listed as a risk that has already been retired rather than one being carried: `registry.ts` has no imports and `forms.ts`'s single import already uses inline `type` modifiers. The step keeps the red branch anyway, with one error class treated as a STOP rather than a fix -- a `node:` import or a DOM global in `src/`, because that is exactly what the `"types": []` and DOM-free `lib` pass exists to catch.
4. **The `CONTRACT_BANNER` line is a consumer-visible content change with a second-order effect that is easy to miss.** It changes one comment line per generated CDN form, AND it renames `dist/assets/dev-<hash>.js`, because the registry module carrying the banner is bundled into `dev.ts`'s chunk of the `construct-cli` build. That is why the tarball gate is a FILE LIST gate with an enumerated four-line delta rather than an unchanged-list gate, and why Task 9 Step 2 checks that exactly one file imports that chunk before treating the rename as non-cascading. Leaving the banner naming a directory that no longer exists would be worse than the diff.
