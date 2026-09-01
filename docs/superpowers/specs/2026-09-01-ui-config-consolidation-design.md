# packages/ui config consolidation: design

**Date:** 2026-09-01
**Status:** proposed, owner ruling pending
**Sequencing (owner, 2026-09-01):** its own round, AFTER the CI split lands and BEFORE `src/agent-tooling` moves to `packages/ui/mcp/`.

## The complaint

Owner, 2026-09-01: "I have never seen so many vitest and playwright files, they are just spamming the ui package."

The count at `packages/ui/` root, produced by `ls -1 packages/ui/{vite.config*.ts,playwright*.config.ts,tsconfig*.json,vitest*} | wc -l`:

| family | files | what they are |
| --- | --- | --- |
| `vite.config.*.ts` | 22 | one per build output |
| `playwright*.config.ts` | 14 | one per browser suite |
| `tsconfig*.json` | 6 | five typecheck passes plus the base |
| `vitest*` | 4 | two configs, one setup module, one shims `.d.ts` |
| total | 46 | |

The complaint names vitest and playwright, but vitest is only 4 files and 2 of those are not configs at all. The real mass is vite (22) and playwright (14): 36 of the 46, and both families grew one file per unit of work with no mechanism ever proposed for merging them back.

## Scope of this design

In scope: the 22 vite configs and the 14 playwright configs.

Out of scope, kept as-is, with the reason:

- **`tsconfig*.json` (6): KEEP.** Each encodes a distinct compiler environment that cannot be expressed as a project of another (`tsconfig.mcp.json` resolves `@kitn.ai/ui/schemas` to `dist` before `src`; `tsconfig.react.test.json` needs `react-jsx` where the others need Solid's; `tsconfig.apps.json` owns `apps/**`), and CLAUDE.md records the ordering inside the `typecheck` chain as load-bearing in two places.
- **`vitest.config.ts`, `vitest.react.config.ts` (2): KEEP.** They are already the consolidated form: one config carries three projects (`unit`, `emitted`, `storybook`), and the second exists because the React suite needs a different JSX transform, which is a project-level impossibility in the same way `tsconfig.react.test.json` is.
- **`vitest.setup.timeouts.ts`, `vitest.shims.d.ts` (2): KEEP.** Not configs. A setup module and an ambient declaration file.

## Part 1: vite, 22 files to 5

### What the 22 actually differ on

Read all 22. The axes that vary are: which Solid transform runs (DOM, SSR, none), the externals list, the emitted filename, whether `vite-plugin-dts` runs and over which `include`/`exclude` scope, `emptyOutDir`, `build.ssr` versus `build.lib`, `root` and `base` for the prebuilt pages, and `rollupOptions.output`.

Grouped by those axes:

| group | configs | shared shape |
| --- | --- | --- |
| A. DOM lib subpaths | `barrel`, `solid`, `state`, `wire`, `stores`, `define`, `diagnostics`, `schemas` | `solidPlugin()`, `emptyOutDir:false`, `formats:['es']`, fixed `fileName`, solid externals |
| B. SSR twins | `barrel.server`, `solid.server`, `define.server` | same, but `solidPlugin({ solid: { generate:'ssr', hydratable:false } })` |
| C. no-transform lib | `provider`, `construct`, `construct-templates` | no Solid plugin at all |
| D. React | `react` | no Solid plugin, react externals, `'use client';` banner, a bespoke dts `beforeWriteFile` |
| E. node bins | `mcp`, `construct-cli` | `build.ssr`, `target:'node18'`, builtins plus `zod` external, `output.entryFileNames` |
| F. elements | `vite.config.ts` (register-all), `elements` (per-element split) | a `libMinifyPlugin` duplicated verbatim in both, and two different `output` shapes |
| G. prebuilt pages | `builder-page`, `theme-studio`, `gallery` | `root`, `base:'./'`, `@tailwindcss/postcss`, `emptyOutDir:true`, three different roots |

Only four differences inside a group are real:

1. **Externals.** Group A splits: `barrel` and `solid` also externalize `solid-element`; the other six do not. Group C splits: `provider` externalizes `solid-js` and `solid-js/web` only, `construct` externalizes `zod`, `construct-templates` externalizes nothing.
2. **dts scoping.** `barrel` emits declarations for all of `src/**` minus seven exclude globs. `construct` emits five named files, `construct-templates` two. `react` uses a different `tsconfigPath`, `outDir`, `entryRoot` and rewrites `../src/...` specifiers to `dist` paths. The other configs emit no declarations; theirs come from the barrel emit plus `scripts/emit-subpath-dts.mjs`.
3. **`emptyOutDir`.** True in exactly four places: `vite.config.ts` (which is why it runs first and why nothing may be built before it) and the three page builds (each into its own `dist/<page>` subdirectory, so they clobber only themselves).
4. **`output`.** Group F's two members differ from each other and from everything else: register-all writes `kai.[format].js` at `dist/` root with `treeshake:false` and `preserveEntrySignatures:'allow-extension'`; the split writes `elements/[name].js` plus hashed chunks.

### The decision: parameterize, do not multi-entry

Vite lib mode accepts an object for `build.lib.entry`, so groups A, B, C, E could each collapse into a single multi-entry build. **Recommend against it, and here is the consumer-facing reason.**

A multi-entry rollup build hoists code shared between entries into a separate chunk. Today `dist/state.js`, `dist/wire.js` and `dist/stores.js` are each self-contained: everything they need is inlined. That is not an accident, it is a declared contract. `scripts/verify-cdn-entries.mjs` names exactly those three in `SELF_CONTAINED_ENTRIES` and asserts they carry zero bare import specifiers, because a no-build page loads them by raw CDN URL and a bare specifier throws `Failed to resolve module specifier`.

A hoisted chunk is emitted as a **relative** specifier (`./chunk-abc123.js`), not a bare one. So the guard stays green while the promise it guards gets quietly weaker: the raw-URL page now needs a second network fetch that it previously did not, and nothing in CI would say so. That is precisely the failure class this repo names most often, a check that keeps passing over a changed fact.

The counter-argument for multi-entry is real but small: it would dedupe code currently duplicated across those bundles, which lowers pack weight, and it would cut vite process startups. Neither is what the owner asked for. The ask is file count.

So:

- **Chunking is forbidden by construction, not by `output.manualChunks`.** Each output keeps its own single-entry `vite build` invocation. There is no multi-entry build anywhere in the proposal, so `manualChunks` and `preserveModules` are not needed and are not added.
- **Every byte under `dist/` must be identical before and after.** That is the acceptance criterion, and it is cheap to check exactly (see Verification).
- The chunk-dedup idea is recorded as a separate, later, measured change with its own PR, its own `verify:pack` reading, and an explicit decision about the `SELF_CONTAINED_ENTRIES` contract. It is not part of this round.

### The shape

A new directory `packages/ui/config/vite/`. Each file exports a `defineConfig` chosen from a `TARGETS` table by the `KAI_BUILD` environment variable. One table row per output, carrying that output's original comment verbatim.

Why an environment variable and not `vite build --mode <target>`: `--mode` also drives `.env.<mode>` loading and Vite's `isProduction` determination, which feeds `define` replacement of `process.env.NODE_ENV` inside bundled dependencies. Any of that flipping would change emitted bytes, which is the one thing this round must not do. `KAI_BUILD` touches nothing Vite reads.

The `KAI_BUILD=x` prefix is POSIX shell syntax and does not work under Windows `cmd`. Stated rather than solved: no `cross-env` dependency is added, because CI and every documented dev path here are POSIX, and adding a runtime dependency to a build script to serve a platform nobody uses is worse than the note.

**Before, 22 files:**

```
packages/ui/vite.config.ts
packages/ui/vite.config.barrel.ts
packages/ui/vite.config.barrel.server.ts
packages/ui/vite.config.builder-page.ts
packages/ui/vite.config.construct.ts
packages/ui/vite.config.construct-cli.ts
packages/ui/vite.config.construct-templates.ts
packages/ui/vite.config.define.ts
packages/ui/vite.config.define.server.ts
packages/ui/vite.config.diagnostics.ts
packages/ui/vite.config.elements.ts
packages/ui/vite.config.gallery.ts
packages/ui/vite.config.mcp.ts
packages/ui/vite.config.provider.ts
packages/ui/vite.config.react.ts
packages/ui/vite.config.schemas.ts
packages/ui/vite.config.solid.ts
packages/ui/vite.config.solid.server.ts
packages/ui/vite.config.state.ts
packages/ui/vite.config.stores.ts
packages/ui/vite.config.theme-studio.ts
packages/ui/vite.config.wire.ts
```

**After, 5 files:**

```
packages/ui/config/vite/lib.ts       # 14 targets: groups A, B, C
packages/ui/config/vite/react.ts     # 1  target:  group D
packages/ui/config/vite/node.ts      # 2  targets: group E
packages/ui/config/vite/elements.ts  # 2  targets: group F
packages/ui/config/vite/page.ts      # 3  targets: group G
```

`react.ts` stays its own file rather than becoming a fifteenth row in `lib.ts` for one reason: `docs/coupling-map.md:101` registers the React wrapper build **by path** as the owner of the `'use client';` banner, and it also carries the 25-line `srcSpecifiersToDist` declaration rewriter that nothing else uses. A coupling row should point at a file about exactly one thing.

Target names, one per output, named after the output stem so the mapping needs no lookup:

| file | `KAI_BUILD` values |
| --- | --- |
| `config/vite/lib.ts` | `index` `index.server` `solid` `solid.server` `state` `wire` `stores` `define` `define.server` `diagnostics` `schemas` `construct` `construct-templates` `provider` |
| `config/vite/react.ts` | none, single-purpose |
| `config/vite/node.ts` | `mcp` `construct-cli` |
| `config/vite/elements.ts` | `register` `split` |
| `config/vite/page.ts` | `builder` `theme-studio` `gallery` |

An unknown or missing `KAI_BUILD` must throw at config load naming the valid values. A config that silently builds the wrong target is the worst outcome available here.

### Path resolution, the thing that actually breaks

Every current config computes entries with `resolve(__dirname, 'src/...')`. Moved into `config/vite/`, `__dirname` is `packages/ui/config/vite`, so each file needs `const PKG = resolve(__dirname, '../..')` and every path resolved from `PKG`.

Vite's `root` is **not** derived from the config file location: it defaults to `process.cwd()`. Every invocation runs from `packages/ui` (npm script cwd), so `root`, `build.outDir: 'dist'`, `envDir`, `cacheDir` and the relative `build.ssr` entry strings all keep pointing where they do today. Moving the config file does not move the project root.

`vite-plugin-dts` resolves `include`, `exclude`, `entryRoot` and `tsconfigPath` against the Vite `root`, not the config file, so those stay verbatim. This is an assumption with a loud failure mode: if it were wrong, declarations land in the wrong place and `verify:dts` fails naming unresolvable specifiers. Confirm it on the first build rather than trusting this paragraph.

### The `build` script

**Before** (`packages/ui/package.json:183`), verbatim:

```
"build": "vite build --config vite.config.ts && vite build --config vite.config.provider.ts && vite build --config vite.config.react.ts && vite build --config vite.config.barrel.ts && vite build --config vite.config.barrel.server.ts && vite build --config vite.config.solid.ts && vite build --config vite.config.solid.server.ts && vite build --config vite.config.state.ts && vite build --config vite.config.wire.ts && vite build --config vite.config.stores.ts && vite build --config vite.config.define.ts && vite build --config vite.config.define.server.ts && vite build --config vite.config.diagnostics.ts && vite build --config vite.config.schemas.ts && vite build --config vite.config.mcp.ts && vite build --config vite.config.construct-cli.ts && vite build --config vite.config.construct.ts && vite build --config vite.config.construct-templates.ts && vite build --config vite.config.builder-page.ts && vite build --config vite.config.theme-studio.ts && vite build --config vite.config.gallery.ts && npm run build:elements && npm run dedupe:shiki && npm run verify:elements-bundle && npm run verify:react-wrappers && npm run verify:shader-lazy"
```

**After**, same order, same count of vite invocations, one substitution per link in the chain:

```
"build": "KAI_BUILD=register vite build --config config/vite/elements.ts && KAI_BUILD=provider vite build --config config/vite/lib.ts && vite build --config config/vite/react.ts && KAI_BUILD=index vite build --config config/vite/lib.ts && KAI_BUILD=index.server vite build --config config/vite/lib.ts && KAI_BUILD=solid vite build --config config/vite/lib.ts && KAI_BUILD=solid.server vite build --config config/vite/lib.ts && KAI_BUILD=state vite build --config config/vite/lib.ts && KAI_BUILD=wire vite build --config config/vite/lib.ts && KAI_BUILD=stores vite build --config config/vite/lib.ts && KAI_BUILD=define vite build --config config/vite/lib.ts && KAI_BUILD=define.server vite build --config config/vite/lib.ts && KAI_BUILD=diagnostics vite build --config config/vite/lib.ts && KAI_BUILD=schemas vite build --config config/vite/lib.ts && KAI_BUILD=mcp vite build --config config/vite/node.ts && KAI_BUILD=construct-cli vite build --config config/vite/node.ts && KAI_BUILD=construct vite build --config config/vite/lib.ts && KAI_BUILD=construct-templates vite build --config config/vite/lib.ts && KAI_BUILD=builder vite build --config config/vite/page.ts && KAI_BUILD=theme-studio vite build --config config/vite/page.ts && KAI_BUILD=gallery vite build --config config/vite/page.ts && npm run build:elements && npm run dedupe:shiki && npm run verify:elements-bundle && npm run verify:react-wrappers && npm run verify:shader-lazy"
```

**`build:elements` before:**

```
"build:elements": "node scripts/gen-elements-manifest.mjs && vite build --config vite.config.elements.ts && node scripts/gen-element-dts.mjs"
```

**after:**

```
"build:elements": "node scripts/gen-elements-manifest.mjs && KAI_BUILD=split vite build --config config/vite/elements.ts && node scripts/gen-element-dts.mjs"
```

Four orderings inside that chain are load-bearing and every one survives unchanged, because the chain's shape is untouched:

- `register` runs **first**, because it is the only `emptyOutDir:true` build writing to `dist/` root. Anything before it is deleted.
- `schemas` runs before `mcp`, because `vite.config.mcp.ts` bundles the MCP against the built `dist/schemas.js`. `vitest.config.ts:73-74` documents that dependency.
- `build:elements` runs before `dedupe:shiki`, which runs before `verify:elements-bundle`. `scripts/dedupe-shiki-chunks.mjs:3,50` explains why: the per-element split writes lazy chunks into the shared `dist/`, the dedupe collapses them, and the bundle guard reads the result.
- `theme-studio` externalizes `@kitn.ai/ui/elements` and rewrites it to an absolute route, which is what makes it ordering-independent of `build:elements`. That comment moves with the row.

## Part 2: playwright, 14 files to 3

### What the 14 actually differ on

| config | testMatch | port | server | notes |
| --- | --- | --- | --- | --- |
| `playwright.config.ts` | `remote-element` | 6006 + 6007 | `dev:host` + `dev:provider` | two webServers, github reporter on CI |
| `composer` | `composer-ivp` | 6006 | storybook | `retries: CI?1:0` |
| `slots` | `(chat\|promptinput)-slots-ivp` | 6006 | storybook | |
| `menu` | `menu-ivp` | 6006 | storybook | `retries: CI?1:0` |
| `command` | `command-ivp` | 6006 | storybook | `retries: CI?1:0` |
| `input-mask` | `input-mask-ivp` | 6006 | storybook | server timeout 180s |
| `promptinput` | `promptinput-(shot\|behavior\|pills)` | 6006 | storybook | `SHOT` env selects baseline/after |
| `shot` | `*.shot.spec.ts` | 6006 | storybook | screenshots, not assertions |
| `audio-visualizer` | `audio-visualizer-ivp` | 6006 | storybook | `deviceScaleFactor: 2`, autoplay flag, 1400x1000 |
| `audio-visualizer-band-shape` | `audio-visualizer-band-shape` | **6018** | storybook, explicit command | port picked to avoid a parent checkout's 6006 |
| `focus-ring` | `focus-ring-paints` | 6210 | `focus-ring-harness-server.mjs` | bare page, no document Tailwind, 1100x900 |
| `message-text-token` | `message-text-token` | 6211 | same harness, `FOCUS_RING_PORT=6211` | 900x700 |
| `content-brand-bleed` | `content-brand-bleed` | 6212 | same harness, `FOCUS_RING_PORT=6212` | 900x800 |
| `hovercard` | `hover-card-tabstops` | 6013 | `pnpm exec vite --port 6013` | `globalSetup` enforces a fresh `dist/` |

Checked against the installed typings (`node_modules/playwright/types/test.d.ts`, playwright 1.61.1): `TestProject` carries `use`, `expect`, `retries`, `timeout`, `testDir`, `testMatch`, `fullyParallel` and `name`. That covers every per-suite difference above except four, which are `TestConfig`-only and therefore decide the file boundaries: `webServer`, `globalSetup`, `reporter`, `forbidOnly`.

### Why not one config

`webServer` is top-level, so a single config starts every listed server for any run, including `--project=focus-ring`. Two of those servers **collide**: `dev:host` binds 6006 and Storybook binds 6006. `playwright.config.ts` already carries a WARNING block about exactly that collision biting people locally. One config would make it structural.

So the boundary is drawn on port conflict, which yields three files.

**After, 3 files:**

```
packages/ui/config/playwright/storybook.config.ts   # 9 projects, one Storybook webServer
packages/ui/config/playwright/bare.config.ts        # 4 projects, four bare webServers
packages/ui/config/playwright/cross-origin.config.ts # 1 project, host + provider webServers
```

**`storybook.config.ts`** absorbs the nine Storybook-driven suites. One `webServer` (Storybook, `reuseExistingServer: true`), nine projects each with its own `testMatch`, `retries`, `expect.timeout`, `timeout` and `use`.

The band-shape suite's private port 6018 exists because a worktree's run must not attach to the parent checkout's 6006 Storybook. That need is real and survives as a **config-wide** `KAI_SB_PORT` (default 6006) read once by `use.baseURL`, `webServer.url` and `webServer.command`. A worktree sets it once for every Storybook suite instead of one suite having a hardcoded escape hatch the other eight lack. That is strictly better than what exists.

**`bare.config.ts`** absorbs the three paint guards plus hovercard: four `webServer` entries on 6210, 6211, 6212, 6013, four projects. Running one project boots all four servers; three are the same tiny node harness and the fourth is a Vite static serve, so the cost is negligible and behavior is otherwise unchanged.

One deliberate behavior change here, called out because it is a change: hovercard's `globalSetup` (`tests/e2e/hover-card-global-setup.ts`, which fails the run if `dist/` is stale) becomes config-wide and therefore applies to the three paint guards too. Those three currently ask for a fresh build in a **comment** ("Needs a build first (`nx build ui`)"). Hovercard's own header records that the polite version already failed for real: a deliberately broken fix produced a green run until the bundle was rebuilt. Extending the enforcement to three more guards that drive `dist/` closes the same hole. In CI it is free: `.github/workflows/test.yml` runs "Build (element bundle + provider subpath)" at line 334, well before the paint guards at lines 887, 899 and 908.

Two smaller unifications, both in the safe direction: `forbidOnly: !!process.env.CI` (today on 5 of 14) and `reporter: process.env.CI ? 'github' : 'list'` (today on 2 of 14) apply config-wide in all three files. A stray `.only` now fails CI everywhere instead of in a third of the suites.

**`cross-origin.config.ts`** is `playwright.config.ts` moved and renamed. It keeps its own file because `dev:host` on 6006 cannot coexist with the Storybook server.

Note that after this there is no `playwright.config.ts` at the package root, so a bare `playwright test` has no default config. That is intentional: `test:e2e` names its config explicitly, and a bare invocation failing loudly beats one silently picking whichever suite happened to be the default.

### Script mapping

<!-- gate-list: partial -- a script rename table for the playwright consolidation, not an enumeration of the required CI `test` job's gate set; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints that -->

| script | before | after |
| --- | --- | --- |
| `test:e2e` | `playwright test` | `playwright test --config config/playwright/cross-origin.config.ts` |
| `test:composer-ivp` | `playwright test --config playwright.composer.config.ts` | `playwright test --config config/playwright/storybook.config.ts --project=composer` |
| `test:slots-ivp` | `playwright test --config playwright.slots.config.ts` | `playwright test --config config/playwright/storybook.config.ts --project=slots` |
| `test:menu-ivp` | `playwright test --config playwright.menu.config.ts` | `playwright test --config config/playwright/storybook.config.ts --project=menu` |
| `test:command-ivp` | `playwright test --config playwright.command.config.ts` | `playwright test --config config/playwright/storybook.config.ts --project=command` |
| `test:input-mask-ivp` | `playwright test --config playwright.input-mask.config.ts` | `playwright test --config config/playwright/storybook.config.ts --project=input-mask` |
| `test:focus-ring` | `playwright test --config playwright.focus-ring.config.ts` | `playwright test --config config/playwright/bare.config.ts --project=focus-ring` |
| `test:message-text-token` | `playwright test --config playwright.message-text-token.config.ts` | `playwright test --config config/playwright/bare.config.ts --project=message-text-token` |
| `test:content-brand-bleed` | `playwright test --config playwright.content-brand-bleed.config.ts` | `playwright test --config config/playwright/bare.config.ts --project=content-brand-bleed` |
| `test:hovercard` | did not exist | `playwright test --config config/playwright/bare.config.ts --project=hovercard` |
| `test:shot` | did not exist | `playwright test --config config/playwright/storybook.config.ts --project=shot` |
| `test:promptinput` | did not exist | `playwright test --config config/playwright/storybook.config.ts --project=promptinput` |
| `test:audio-visualizer` | did not exist | `playwright test --config config/playwright/storybook.config.ts --project=audio-visualizer` |
| `test:audio-visualizer-band-shape` | did not exist | `playwright test --config config/playwright/storybook.config.ts --project=audio-visualizer-band-shape` |

Five suites currently have no npm script at all and are run only by naming their config. Giving each one a script is what lets every caller drop `--config` from its vocabulary, and it is what makes the gate-parity fix below a one-line workflow edit.

## Part 3: the gate-parity question

`packages/ui/scripts/lint-gate-parity.mjs` canonicalizes each workflow step into a gate id by rule. The relevant branch (lines 302-312):

```js
if (/^exec\s+playwright\s+test\b/.test(rest)) {
  const c = /--config\s+(\S+)/.exec(rest);
  if (!c) return { kind: 'unknown' };
  return { kind: 'gate', shape: 'pnpm-filter', id: `${pkg} playwright ${c[1]}` };
}
```

**Answer to the question posed: no.** `playwright test --project=x` does **not** canonicalize to the same id as `playwright test --config playwright.x.config.ts`. It canonicalizes to nothing: with no `--config` the branch returns `unknown`, and an unknown step shape is a hard failure that turns the required `lint:gate-parity` gate red naming the step.

Only one workflow step is affected. `.github/workflows/test.yml:922` is the single place in the `test` job that spells a playwright run directly:

```
run: pnpm --filter @kitn.ai/ui exec playwright test --config playwright.hovercard.config.ts
```

Every other playwright gate goes through an npm script (`pnpm --filter @kitn.ai/ui run test:menu-ivp` and friends), whose gate id is the script name and is therefore blind to what the script's body does.

**Recommended fix: change the workflow step, not the linter.**

```
run: pnpm --filter @kitn.ai/ui run test:hovercard
```

This removes the only `--config` shape from the workflow, makes all eight playwright gates uniform script gates, and requires no edit to `lint-gate-parity.mjs`. Teaching the canonicalizer a `--project=` branch would be the alternative, and it is worse: it keeps a second spelling alive for one step and invents an id shape that would collide the moment two projects of one config both became steps.

**Effect on the gate set.** One id is renamed:

- before: `@kitn.ai/ui playwright playwright.hovercard.config.ts`
- after: `@kitn.ai/ui run test:hovercard`

The **count is unchanged**, and `node packages/ui/scripts/lint-gate-parity.mjs --list` is the producer of that figure on both sides of the change. The step name ("Hover-card tab-stop guard (built bundle)") does not change, so the id-plus-step-name pairing the CI-split design diffs on stays comparable.

**Every `gate-list: partial` marker survives.** Verified rather than assumed: `grep -rn 'gate-list:' docs/ .github/ CLAUDE.md` returns 38 markers and **every one is `partial`**. There is no `gate-list: complete` block anywhere in the repo. Partial blocks are skipped whole by the linter (rule 4), so no marker is sensitive to an id rename. Had a `complete` block existed, it would have had to be edited in the same commit.

## Part 4: the cost, every caller that names a config

### Live callers, must change

<!-- gate-list: partial -- an inventory of files that name a config path, not a merge-gate enumeration -->

| file:line | reference |
| --- | --- |
| `packages/ui/package.json:183` | `build`, all 21 vite invocations |
| `packages/ui/package.json:184` | `build:elements`, the 22nd |
| `packages/ui/package.json:244-251` | the eight `test:*` playwright scripts |
| `packages/ui/tsconfig.tests.json:46` | quarantine `resolved` key literally named `"vite.config.ts + vite.config.elements.ts"` |
| `packages/ui/tsconfig.tests.json` `include` | `["tests/**/*.ts", "tests/**/*.tsx", "*.ts", "src/elements/element-types.d.ts"]` |
| `packages/ui/tsconfig.tests.json` `comment` | names "vite.config.\*.ts, vitest.config.ts, playwright.\*.config.ts" as the tooling this pass covers |
| `.github/workflows/test.yml:919` | comment: "Expects: packages/ui/playwright.hovercard.config.ts" |
| `.github/workflows/test.yml:922` | the only direct `--config` invocation in the job |
| `.claude/skills/consumer-regression/SKILL.md:52` | `npx vite build --config vite.config.mcp.ts` |
| `.claude/skills/consumer-regression/recipes.md:40` | same command |
| `.claude/skills/consumer-regression/recipes.md:85` | "built by `vite.config.mcp.ts`" |
| `docs/coupling-map.md:101` | the React wrapper build row, names the path |
| `docs/coupling-map.md:125` | the input-mask spec / `testMatch` / script-name triangle row |
| `docs/composable-web-components-roster.md:44` | "`vite.config.elements.ts` builds a self-registering module per tag" |
| `docs/research/autoloader-proof.mjs:6` | "Build first: npx vite build --config vite.config.elements.ts" |

`tsconfig.tests.json`'s `include` is the one entry on that list that fails **silently**. `"*.ts"` is a package-root, non-recursive glob: it is what puts all 22 vite configs and all 14 playwright configs into the fifth typecheck pass. Move them to `config/` without adding `"config/**/*.ts"` and the pass keeps compiling, keeps printing zero errors, and stops reading 36 files. That is the exact shape of this repo's most expensive recurring defect, and the plan pins it with a deliberate planted error rather than an assertion in prose.

### Comment-only references, cosmetic but should move together

`packages/ui/scripts/verify-ssr-render.mjs:40,41,137` · `packages/ui/scripts/dedupe-shiki-chunks.mjs:3,50` · `packages/ui/scripts/verify-pack-weight.mjs:256` · `packages/ui/scripts/gen-element-api.mjs:599` · `packages/ui/scripts/emit-subpath-dts.mjs:23` · `packages/ui/vitest.config.ts:73-74` · `packages/ui/bin/mcp.js:3` · `packages/ui/src/solid.ts:14-15` · `packages/ui/src/stores/index.ts:19` · `packages/ui/src/elements/element-diagnostics.ts:354` · `packages/ui/src/elements/element-artifact-divergence.test.ts:21` · `packages/ui/src/elements/define-entry.test.ts:11,13` · `packages/ui/src/elements/register.ts:21` · `packages/ui/src/components/audio-visualizer/index.tsx:231` · `packages/ui/src/agent-tooling/mcp/stdio.ts:7` · `packages/ui/src/agent-tooling/mcp/manifest.ts:276` · `packages/ui/src/agent-tooling/mcp/tools/reference.ts:711` · `packages/ui/src/agent-tooling/construct/cli-entry.ts:1` · `packages/ui/src/agent-tooling/construct/dev.ts:177,591,599` · `packages/ui/apps/theme-studio/kit.ts:10` · `packages/ui/apps/theme-studio/index.html:3` · `packages/ui/apps/theme-studio/ThemeStudio.tsx:23`

Plus the twelve `Run:` header comments in `packages/ui/tests/e2e/*.spec.ts` (`command-ivp:12`, `chat-slots-ivp:10`, `audio-visualizer-band-shape:46,50`, `audio-visualizer-ivp:36`, `composer-ivp:12`, `composer-pill-skins.shot:9`, `input-mask-ivp:65`, `menu-ivp:15`, `hover-card-tabstops:23`, `promptinput-prefilled.shot:5`, `promptinput-slots-ivp:9`).

### The trap: do not sed

`packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` (lines 3342, 3714, 5122, 5731, 5739, 5813, 6235), `.../construct/codegen.ts` (199, 200, 417, 2399), `.../mcp/tools/debug.ts:232`, `.../route-emit.ts:115`, and their tests mention `vite.config.ts` and `vite.config.lib.ts` **as strings the scaffolder emits into a consumer's project**. A repo-wide rewrite of `vite.config.ts` would corrupt generated consumer code and would be caught only by `verify:scaffold`, at some distance from the cause. Every edit in this round is targeted by file and line.

### Guards that need updating

`lint-gate-parity.mjs`: **no change required**, given the recommended workflow fix. Every other guard is path-blind: they read `dist/`, `package.json` exports, or the packed tarball, none of which move.

## Part 5: risks

<!-- gate-list: partial -- risk rows naming the guard that catches each, not the required CI `test` job's gate set -->

| risk | severity | caught by |
| --- | --- | --- |
| `tsconfig.tests.json` `include` silently stops covering the moved configs | **highest**, fails green | nothing today; the plan adds a watched planted TS error |
| `__dirname` shift breaks entry resolution | low, loud | the build fails immediately |
| `vite-plugin-dts` resolves `include`/`tsconfigPath` against the config dir, not `root` | medium, loud | `verify:dts`, `verify:dts:consumer` |
| An output changes bytes (transform, external, or minify plugin applied where it was not) | medium | `diff -r` of `dist/` before and after; `verify:pack`, `verify:consumer` |
| A `KAI_BUILD` typo builds the wrong target or none | medium | the config throws on an unknown value; `verify:cdn-entries` and `verify:dts` fail on a missing output |
| A playwright project name typo makes a suite run zero tests and exit 0 | **high**, fails green | the plan asserts a non-zero reported test count per project, the same shape as the traversal guard at `test.yml:96` |
| Storybook and `dev:host` both binding 6006 | low | kept in separate config files, which is why there are 3 and not 1 |
| Merge conflict with the in-flight CI split, which rewrites `test.yml` into legs | medium | sequencing: this round lands after it, and the plan re-derives the hovercard step's location by grep rather than by line number |

## Part 6: verification plan

Both PRs share this, run from the repo root.

<!-- gate-list: partial -- the verification set for this round, not the required CI `test` job's gate set; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints that -->

**Vite PR, the byte-identity proof:**

1. On the base commit: `pnpm --filter @kitn.ai/ui exec nx build ui --skip-nx-cache` then `cp -R packages/ui/dist /tmp/dist-before`.
2. On the branch: the same build, then `diff -r /tmp/dist-before packages/ui/dist`. Expected output: **empty**. This is the acceptance criterion, not a smoke test.
3. `cd packages/ui && npm pack --dry-run --json > /tmp/pack-after.json`, same on base, and diff the file lists and sizes. Expected: identical, modulo nothing.
4. `pnpm --filter @kitn.ai/ui run verify:pack` (roots, per-file ceiling, total ceiling), `verify:consumer` (registrations survive a real bundler), `verify:dts` and `verify:dts:consumer` (declaration boundaries), `verify:cdn-entries` (the three self-contained entries stay bare-specifier-free), `verify:elements-bundle`, `verify:react-wrappers`, `verify:ssr`.
5. `pnpm --filter @kitn.ai/ui run typecheck`, and separately the planted-error check that the fifth pass still reads `config/`: add `const x: number = 'nope';` to `config/vite/lib.ts`, run `npx tsc --noEmit -p tsconfig.tests.json` inside `packages/ui`, confirm it reports TS2322 naming that file, then delete the line. Watching it fail is the point. A green pass over an unchecked directory is exactly what this step exists to make impossible.

**Playwright PR:**

1. Every project once, so none of them is a silent zero: for each of the 14, run its script and record the reported test count. A project matching no files exits 0 and reads as green, so the count is the assertion, not the exit code.
2. `pnpm --filter @kitn.ai/ui run test:hovercard`, confirming the `globalSetup` still fails on a stale `dist/` (delete `dist/kai.es.js`, run it, watch it fail, rebuild).
3. `node packages/ui/scripts/lint-gate-parity.mjs --list` on base and branch, diffed. Expected: the same number of gates, one id renamed as documented above, all step names unchanged.
4. `pnpm --filter @kitn.ai/ui run lint:gate-parity` and `lint:thresholds` green.
5. CI green on the required `test` job.

## Recommendation

Do it, in two PRs, in this order, each independently revertible by `git revert` of a single squash commit.

| PR | scope | files touched (approx) | revert cost |
| --- | --- | --- | --- |
| 1 | vite: 22 files to 5 under `config/vite/`, `build` and `build:elements` rewritten, `tsconfig.tests.json` include widened, 25 comment references updated | around 40 | one revert; `dist/` was byte-identical, so nothing downstream moved |
| 2 | playwright: 14 files to 3 under `config/playwright/`, 9 scripts rewritten plus 5 added, one workflow step, 12 spec header comments, 1 coupling-map row | around 30 | one revert; the workflow step reverts with it |

Vite first, because it is the larger mass, its acceptance criterion is mechanical (an empty `diff -r`), and it touches no CI step at all. Playwright second, because it is the one that moves a gate id and therefore wants a clean base to diff `--list` against.

Net effect on the package root: 46 config files become 10 (6 `tsconfig*.json`, 4 `vitest*`), with 8 files under `packages/ui/config/`.

## Explicitly not in this round

- Multi-entry vite builds and the chunk dedup they enable. Separate PR, separate measurement, separate decision about `SELF_CONTAINED_ENTRIES`.
- Reducing the number of `vite build` invocations. Unchanged at 22 by design; the round is about files, not wall time.
- Collapsing the three bare harness servers onto one port. It would work and it changes what each spec's `baseURL` means, which is a behavior change with no file-count payoff.
- `tsconfig` and `vitest` files. Keep, for the reasons at the top.
- Anything in `packages/ui/mcp/`. That move is the next round.
