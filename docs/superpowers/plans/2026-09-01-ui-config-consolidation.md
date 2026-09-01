# packages/ui Config Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the 22 `vite.config.*.ts` and 14 `playwright*.config.ts` files at `packages/ui/` root into 5 and 3 files under `packages/ui/config/`, with `dist/` byte-identical and every playwright suite still running.

**Architecture:** Each new config file exports one `defineConfig` selected from a `TARGETS` table by the `KAI_BUILD` environment variable (vite) or by a `--project=` name (playwright). No multi-entry vite build is introduced anywhere: every output keeps its own single-entry invocation, which is what makes byte-identity the acceptance criterion rather than a hope. Playwright splits into three files rather than one because `webServer` is a top-level option and two of the servers both bind port 6006.

**Tech Stack:** pnpm + NX workspace, Vite 7 lib mode, `vite-plugin-solid`, `vite-plugin-dts`, Playwright 1.61.1, tsc, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-01-ui-config-consolidation-design.md`. Read it before starting. It records why multi-entry was rejected, which orderings inside the `build` chain are load-bearing, and the full inventory of callers.

**Branch:** `feat/ui-config-consolidation`

## Global Constraints

- **Sequencing (owner ruling, 2026-09-01):** this round lands AFTER the CI split and BEFORE `src/agent-tooling` moves to `packages/ui/mcp/`. If `.github/workflows/test.yml` still has a single `test` job when you start, the CI split has not landed; stop and say so.
- **`dist/` must be byte-identical before and after the vite half.** `diff -r` of a pre-build snapshot against the post-build tree must print nothing. This is a gate, not a smoke test.
- **No multi-entry `build.lib.entry` object anywhere except `config/vite/elements.ts` `split`,** which already had one. Introducing one elsewhere hoists shared chunks and silently weakens the `SELF_CONTAINED_ENTRIES` contract in `scripts/verify-cdn-entries.mjs`.
- **Every existing header comment moves verbatim** onto the row or function that replaces it. These comments carry provenance nothing else records (why the SSR twins exist, why theme-studio externalizes the element bundle, why band-shape had its own port). Losing them is the main way this change goes wrong quietly.
- **Do not run a repo-wide sed for `vite.config.ts`.** `src/agent-tooling/mcp/tools/scaffold.ts`, `src/agent-tooling/construct/codegen.ts`, `src/agent-tooling/mcp/tools/debug.ts` and `src/agent-tooling/route-emit.ts` emit that string into CONSUMER projects. Every edit is targeted by file and line.
- **Copy/voice:** `apps/docs/STYLE.md`. No emoji. No em dashes in text you write.
- **Every commit carries these trailers:**

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

- **Two PRs, in order.** Tasks 1 to 7 are PR 1 (vite). Tasks 8 to 10 are PR 2 (playwright). Each must be revertible on its own.
- **A fresh worktree needs `pnpm install`, then `pnpm --filter @kitn.ai/ui run build:css`, then a real build** before any test means anything. See CLAUDE.md. This plan assumes you are working in the main checkout on a branch, which is the cheaper path for sequential work.

---

## File Structure

**Created (PR 1):**

| file | responsibility |
| --- | --- |
| `packages/ui/config/vite/lib.ts` | 14 library subpath outputs: the DOM builds, the SSR twins, the two no-transform construct bundles, and provider |
| `packages/ui/config/vite/react.ts` | `dist/react.js` alone: the `'use client';` banner and the `srcSpecifiersToDist` declaration rewriter |
| `packages/ui/config/vite/node.ts` | the two node bins, `dist/mcp.es.js` and `dist/construct-cli.es.js` |
| `packages/ui/config/vite/elements.ts` | the register-all bundle and the per-element split, sharing one `libMinifyPlugin` |
| `packages/ui/config/vite/page.ts` | the three prebuilt pages under `dist/builder-page`, `dist/theme-studio`, `dist/gallery` |

**Created (PR 2):**

| file | responsibility |
| --- | --- |
| `packages/ui/config/playwright/storybook.config.ts` | the 9 Storybook-driven suites, one Storybook webServer |
| `packages/ui/config/playwright/bare.config.ts` | the 3 paint guards plus hovercard, four bare webServers, the fresh-`dist` globalSetup |
| `packages/ui/config/playwright/cross-origin.config.ts` | the remote-card security matrix, host plus provider webServers |

**Deleted:** all 22 `packages/ui/vite.config*.ts` and all 14 `packages/ui/playwright*.config.ts`.

---

### Task 1: `config/vite/lib.ts` with one target, and the typecheck pass that must follow it

The whole point of this task is to prove the mechanism on the smallest possible target before repeating it thirteen times, and to prove that the fifth typecheck pass still reads the moved files. That second proof is the one thing in this plan that would otherwise fail green.

**Files:**
- Create: `packages/ui/config/vite/lib.ts`
- Modify: `packages/ui/tsconfig.tests.json` (the `comment` field and the `include` array)
- Modify: `packages/ui/package.json:183` (the `state` link of the `build` chain only)
- Delete: `packages/ui/vite.config.state.ts`

**Interfaces:**
- Produces: `TARGETS: Record<string, Target>` in `config/vite/lib.ts`, keyed by output stem. Tasks 2 adds rows to it. The `Target` interface is `{ entry: string; fileName: string; transform: 'dom' | 'ssr' | 'none'; external?: (string | RegExp)[]; dts?: Parameters<typeof dts>[0] }`, where `entry` is relative to the package root.
- Produces: the invocation shape `KAI_BUILD=<stem> vite build --config config/vite/lib.ts`, used by Tasks 2 and 7.

- [ ] **Step 1: Snapshot the baseline `dist/`**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/ui run build:css
pnpm exec nx build ui --skip-nx-cache
rm -rf /tmp/dist-before && cp -R packages/ui/dist /tmp/dist-before
ls /tmp/dist-before/state.js
```

Expected: `state.js` listed. If `nx build ui` printed "Successfully ran target build" from cache, it may not have regenerated the derived artifacts; `--skip-nx-cache` is why it is there.

- [ ] **Step 2: Create `packages/ui/config/vite/lib.ts`**

```ts
import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// One config for every library subpath bundle. Selected by KAI_BUILD, one value
// per emitted file, named after the output stem so the mapping needs no lookup.
//
// WHY A TABLE AND NOT 14 FILES: they differed on four axes only (which Solid
// transform runs, the externals list, the emitted filename, and whether a
// declaration emit rides along). Everything else was copy-paste. The four axes
// are the four columns below.
//
// WHY NOT ONE MULTI-ENTRY BUILD: rollup hoists code shared between entries into
// a separate chunk, and dist/state.js, dist/wire.js and dist/stores.js are
// promised self-contained by scripts/verify-cdn-entries.mjs so a no-build page
// can load them from a raw CDN URL. A hoisted chunk is a RELATIVE specifier, so
// that guard would stay green while the promise got weaker. Every target here
// keeps its own single-entry invocation.
//
// WHY AN ENV VAR AND NOT `vite build --mode <target>`: --mode also drives
// .env.<mode> loading and Vite's isProduction determination, which feeds
// `define` replacement of process.env.NODE_ENV inside bundled dependencies.
// Any of that flipping would change emitted bytes, which is the one thing this
// consolidation must not do. KAI_BUILD touches nothing Vite reads.

// This file lives two levels below the package root, so entries resolve from
// PKG rather than __dirname. Vite's `root` is process.cwd(), always packages/ui
// via the npm script, so build.outDir 'dist' is unaffected by this file's
// location: only explicitly resolved paths are.
const PKG = resolve(__dirname, '../..');

const SOLID = ['solid-js', 'solid-js/web', 'solid-js/store'];
const SOLID_ELEMENT = [...SOLID, 'solid-element'];

interface Target {
  /** Entry module, relative to the package root. */
  entry: string;
  /** Emitted filename under dist/. */
  fileName: string;
  /** 'dom' = Solid's client transform, 'ssr' = the server transform, 'none' = no Solid plugin. */
  transform: 'dom' | 'ssr' | 'none';
  external?: (string | RegExp)[];
  /** vite-plugin-dts options, for the targets that own a declaration emit. */
  dts?: Parameters<typeof dts>[0];
}

const TARGETS: Record<string, Target> = {
  // dist/state.js
  state: {
    entry: 'src/state/index.ts',
    fileName: 'state.js',
    transform: 'dom',
    external: SOLID,
  },
};

const requested = process.env.KAI_BUILD ?? '';
const target = TARGETS[requested];
if (!target) {
  throw new Error(
    `config/vite/lib.ts: KAI_BUILD must be one of [${Object.keys(TARGETS).join(', ')}], got ${JSON.stringify(process.env.KAI_BUILD)}`,
  );
}

const plugins: PluginOption[] = [];
if (target.transform === 'dom') plugins.push(solidPlugin());
// `solid` overrides the preset options the plugin would otherwise pick from
// Vite's ssr flag, so the SSR transform applies to a plain (non-build.ssr) lib
// build and bundling/externalization stay identical to the DOM build.
if (target.transform === 'ssr') plugins.push(solidPlugin({ solid: { generate: 'ssr', hydratable: false } }));
if (target.dts) plugins.push(dts(target.dts));

export default defineConfig({
  plugins,
  build: {
    // Every target here is a LATER build in the chain than the register-all
    // bundle, which is the only emptyOutDir:true build writing to dist/ root.
    emptyOutDir: false,
    lib: {
      entry: resolve(PKG, target.entry),
      formats: ['es'],
      fileName: () => target.fileName,
    },
    rollupOptions: { external: target.external ?? [] },
  },
});
```

- [ ] **Step 3: Widen the fifth typecheck pass to cover `config/`**

In `packages/ui/tsconfig.tests.json`, change the `include` array from:

```json
  "include": ["tests/**/*.ts", "tests/**/*.tsx", "*.ts", "src/elements/element-types.d.ts"],
```

to:

```json
  "include": ["tests/**/*.ts", "tests/**/*.tsx", "*.ts", "config/**/*.ts", "src/elements/element-types.d.ts"],
```

In the same file's `comment` field, replace the parenthetical

```
(vite.config.*.ts, vitest.config.ts, playwright.*.config.ts, vitest.shims.d.ts)
```

with

```
(config/vite/*.ts, config/playwright/*.ts, vitest.config.ts, vitest.shims.d.ts)
```

`"*.ts"` is a package-root, non-recursive glob. It is the only thing that put the 22 vite and 14 playwright configs into this pass. Without `"config/**/*.ts"` the pass keeps printing zero errors while reading 36 fewer files.

- [ ] **Step 4: Watch the coverage claim fail, so it is not a claim**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
printf '\nconst __coverage_probe: number = "not a number";\n' >> config/vite/lib.ts
npx tsc --noEmit -p tsconfig.tests.json
```

Expected: a `TS2322` naming `config/vite/lib.ts`, saying `Type 'string' is not assignable to type 'number'`.

If it reports nothing, the include glob is wrong and every later task is unchecked. Do not proceed.

Then remove the probe:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git checkout -- config/vite/lib.ts 2>/dev/null || sed -i '' '/__coverage_probe/d' config/vite/lib.ts
npx tsc --noEmit -p tsconfig.tests.json
```

Expected: no output, exit 0.

- [ ] **Step 5: Watch the unknown-target guard fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npx vite build --config config/vite/lib.ts
```

Expected: a thrown error reading `config/vite/lib.ts: KAI_BUILD must be one of [state], got undefined`. A config that silently builds the wrong thing is the worst outcome available here, so watch it refuse.

- [ ] **Step 6: Build the one target and prove it is byte-identical**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
KAI_BUILD=state npx vite build --config config/vite/lib.ts
cmp dist/state.js /tmp/dist-before/state.js && echo IDENTICAL
```

Expected: `IDENTICAL`.

- [ ] **Step 7: Rewrite the `state` link of the build chain and delete the old config**

In `packages/ui/package.json:183`, replace exactly this substring:

```
vite build --config vite.config.state.ts
```

with:

```
KAI_BUILD=state vite build --config config/vite/lib.ts
```

Then:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm vite.config.state.ts
```

- [ ] **Step 8: Full build, full diff**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
diff -r /tmp/dist-before packages/ui/dist && echo "DIST IDENTICAL"
```

Expected: `DIST IDENTICAL`, no diff lines.

- [ ] **Step 9: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/ui/config/vite/lib.ts packages/ui/package.json packages/ui/tsconfig.tests.json
git rm --cached packages/ui/vite.config.state.ts 2>/dev/null || true
git add -A packages/ui/vite.config.state.ts
git commit -m "refactor(ui): vite lib configs move to config/vite/lib.ts, starting with state

One config file selected by KAI_BUILD replaces one file per output. state
moves first to prove the mechanism: dist/state.js is byte-identical.

tsconfig.tests.json's include gains config/**/*.ts. Its \"*.ts\" glob is
package-root and non-recursive, so without this the fifth typecheck pass
would keep passing while reading none of the moved files. Watched fail with
a planted TS2322 before it was trusted.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"
```

---

### Task 2: the remaining 13 library targets

**Files:**
- Modify: `packages/ui/config/vite/lib.ts` (add 13 rows to `TARGETS`)
- Modify: `packages/ui/package.json:183` (13 links of the `build` chain)
- Delete: `packages/ui/vite.config.barrel.ts`, `vite.config.barrel.server.ts`, `vite.config.solid.ts`, `vite.config.solid.server.ts`, `vite.config.wire.ts`, `vite.config.stores.ts`, `vite.config.define.ts`, `vite.config.define.server.ts`, `vite.config.diagnostics.ts`, `vite.config.schemas.ts`, `vite.config.provider.ts`, `vite.config.construct.ts`, `vite.config.construct-templates.ts`

**Interfaces:**
- Consumes: `Target`, `TARGETS`, `SOLID`, `SOLID_ELEMENT`, `PKG` from Task 1.
- Produces: the 14 `KAI_BUILD` values Task 7 wires into the final `build` script.

- [ ] **Step 1: Add the 13 rows**

Replace the `TARGETS` object in `packages/ui/config/vite/lib.ts` with this. Order the rows as the build chain runs them, so the file reads in build order.

```ts
const TARGETS: Record<string, Target> = {
  // dist/kai-provider.es.js, the "./provider" export. No Solid plugin: the
  // provider is plain TypeScript, and solid-js / solid-js/web are external
  // because the host page supplies them.
  provider: {
    entry: 'src/remote/provider.ts',
    fileName: 'kai-provider.es.js',
    transform: 'none',
    external: ['solid-js', 'solid-js/web'],
  },

  // dist/index.js, the "." export under the `browser` and `default` conditions.
  // This is ALSO the only declaration emit over src/**: every other subpath's
  // .d.ts comes from this pass plus scripts/emit-subpath-dts.mjs.
  index: {
    entry: 'src/index.ts',
    fileName: 'index.js',
    transform: 'dom',
    external: SOLID_ELEMENT,
    dts: {
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.stories.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/agent-tooling/**',
        'src/stories/**',
        'src/wire/fixtures/**',
        'src/**/*.testlib.ts',
      ],
      outDir: 'dist',
      entryRoot: 'src',
    },
  },

  // dist/index.server.js, the "." export under `node` / `deno` / `worker`.
  'index.server': {
    entry: 'src/index.ts',
    fileName: 'index.server.js',
    transform: 'ssr',
    external: SOLID_ELEMENT,
  },

  // dist/solid.js, the "./solid" export.
  solid: {
    entry: 'src/solid.ts',
    fileName: 'solid.js',
    transform: 'dom',
    external: SOLID_ELEMENT,
  },

  // dist/solid.server.js, the "./solid" server twin.
  'solid.server': {
    entry: 'src/solid.ts',
    fileName: 'solid.server.js',
    transform: 'ssr',
    external: SOLID_ELEMENT,
  },

  // dist/state.js
  state: {
    entry: 'src/state/index.ts',
    fileName: 'state.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/wire.js
  wire: {
    entry: 'src/wire/index.ts',
    fileName: 'wire.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/stores.js
  stores: {
    entry: 'src/stores/index.ts',
    fileName: 'stores.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/define.js. solid-element is deliberately NOT external here: it is not
  // a declared peer, so this entry bundles it for consumers.
  define: {
    entry: 'src/elements/define-entry.ts',
    fileName: 'define.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/define.server.js, matching the DOM twin's externals exactly.
  'define.server': {
    entry: 'src/elements/define-entry.ts',
    fileName: 'define.server.js',
    transform: 'ssr',
    external: SOLID,
  },

  // dist/diagnostics.js
  diagnostics: {
    entry: 'src/diagnostics/index.ts',
    fileName: 'diagnostics.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/schemas.js. MUST build before the mcp target in config/vite/node.ts:
  // that bundle compiles the MCP against this built file, not against src.
  // vitest.config.ts records the same dependency from the other side.
  schemas: {
    entry: 'src/schemas/index.ts',
    fileName: 'schemas.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/construct.js, the "./construct" export. No Solid plugin.
  construct: {
    entry: 'src/agent-tooling/construct/public.ts',
    fileName: 'construct.js',
    transform: 'none',
    external: ['zod'],
    dts: {
      include: [
        'src/agent-tooling/construct/public.ts',
        'src/agent-tooling/construct/schema.ts',
        'src/agent-tooling/construct/schema-url.ts',
        'src/agent-tooling/blocks/registry.ts',
        'src/agent-tooling/blocks/forms.ts',
      ],
      outDir: 'dist',
      entryRoot: 'src',
    },
  },

  // dist/construct-templates.js, the "./construct/templates" export. Nothing
  // external: this bundle is self-contained by design.
  'construct-templates': {
    entry: 'src/agent-tooling/construct/templates.ts',
    fileName: 'construct-templates.js',
    transform: 'none',
    dts: {
      include: [
        'src/agent-tooling/construct/templates.ts',
        'src/agent-tooling/construct/schema-url.ts',
      ],
      outDir: 'dist',
      entryRoot: 'src',
    },
  },
};
```

- [ ] **Step 2: Carry the provenance comments across**

Each of the deleted files has a header comment that is not restated above. Copy each one verbatim as the comment block above its row, replacing the one-line stub:

| deleted file | header to move | goes above row |
| --- | --- | --- |
| `vite.config.barrel.server.ts` lines 5 to 30 | why the SSR twin exists at all: the module-scope `template()` and `delegateEvents()` calls, the `notSup` stub, why bundling solid-js does not fix it, why `hydratable: false` | `index.server` |
| `vite.config.solid.server.ts` lines 5 to 22 | the short form of the same, plus the note that `verify:ssr` derives its entry list from the exports map | `solid.server` |
| `vite.config.define.server.ts` lines 5 to 30 | the same for define-entry's own JSX, plus the note that `defineWebComponent()` was already SSR-safe and this is a module-load fix | `define.server` |
| `vite.config.provider.ts` header | whatever it says about not clobbering `dist/kai.es.js` | `provider` |
| `vite.config.construct.ts` header | the construct public-surface reasoning | `construct` |
| `vite.config.construct-templates.ts` header | the templates reasoning | `construct-templates` |
| `vite.config.schemas.ts` header | any note about the mcp ordering | `schemas` |
| `vite.config.stores.ts`, `vite.config.wire.ts`, `vite.config.define.ts`, `vite.config.diagnostics.ts`, `vite.config.barrel.ts`, `vite.config.solid.ts` headers | whatever each carries | the matching row |

Read each file before deleting it. `git show HEAD:packages/ui/vite.config.<name>.ts` retrieves one after deletion if you miss one.

- [ ] **Step 3: Rewrite the 13 build-chain links**

In `packages/ui/package.json:183`, apply these substring replacements. Do not reorder the chain.

```
vite build --config vite.config.provider.ts             -> KAI_BUILD=provider vite build --config config/vite/lib.ts
vite build --config vite.config.barrel.ts               -> KAI_BUILD=index vite build --config config/vite/lib.ts
vite build --config vite.config.barrel.server.ts        -> KAI_BUILD=index.server vite build --config config/vite/lib.ts
vite build --config vite.config.solid.ts                -> KAI_BUILD=solid vite build --config config/vite/lib.ts
vite build --config vite.config.solid.server.ts         -> KAI_BUILD=solid.server vite build --config config/vite/lib.ts
vite build --config vite.config.wire.ts                 -> KAI_BUILD=wire vite build --config config/vite/lib.ts
vite build --config vite.config.stores.ts               -> KAI_BUILD=stores vite build --config config/vite/lib.ts
vite build --config vite.config.define.ts               -> KAI_BUILD=define vite build --config config/vite/lib.ts
vite build --config vite.config.define.server.ts        -> KAI_BUILD=define.server vite build --config config/vite/lib.ts
vite build --config vite.config.diagnostics.ts          -> KAI_BUILD=diagnostics vite build --config config/vite/lib.ts
vite build --config vite.config.schemas.ts              -> KAI_BUILD=schemas vite build --config config/vite/lib.ts
vite build --config vite.config.construct.ts            -> KAI_BUILD=construct vite build --config config/vite/lib.ts
vite build --config vite.config.construct-templates.ts  -> KAI_BUILD=construct-templates vite build --config config/vite/lib.ts
```

Note `vite.config.barrel.ts` and `vite.config.barrel.server.ts` share a prefix: replace the longer string first, or the shorter match will corrupt it.

- [ ] **Step 4: Delete the 13 files**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm vite.config.barrel.ts vite.config.barrel.server.ts vite.config.solid.ts \
  vite.config.solid.server.ts vite.config.wire.ts vite.config.stores.ts \
  vite.config.define.ts vite.config.define.server.ts vite.config.diagnostics.ts \
  vite.config.schemas.ts vite.config.provider.ts vite.config.construct.ts \
  vite.config.construct-templates.ts
```

- [ ] **Step 5: Build and diff**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
diff -r /tmp/dist-before packages/ui/dist && echo "DIST IDENTICAL"
```

Expected: `DIST IDENTICAL`.

If `dist/*.d.ts` files moved or vanished, `vite-plugin-dts` resolved `include`/`entryRoot` against the config directory instead of the Vite root. Fix by making those paths absolute from `PKG` and re-diff; do not accept a changed declaration layout.

- [ ] **Step 6: Declaration and SSR guards**

<!-- gate-list: partial -- the four gates this task can move, not the required CI `test` job's gate set; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints that -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/ui run verify:dts
pnpm --filter @kitn.ai/ui run verify:dts:consumer
pnpm --filter @kitn.ai/ui run verify:ssr
pnpm --filter @kitn.ai/ui run verify:cdn-entries
```

Expected: all four exit 0. `verify:ssr` is the one that would catch a lost SSR twin; `verify:cdn-entries` is the one that would catch an accidental multi-entry chunk.

- [ ] **Step 7: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/ui
git commit -m "refactor(ui): the remaining 13 library builds move into config/vite/lib.ts

14 config files become 14 rows. Every header comment moved with its row:
the SSR-twin provenance in particular is the only record of why those three
builds exist.

dist/ is byte-identical (diff -r against a pre-change snapshot is empty).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"
```

---

### Task 3: `config/vite/react.ts`

**Files:**
- Create: `packages/ui/config/vite/react.ts`
- Modify: `packages/ui/package.json:183` (the react link)
- Delete: `packages/ui/vite.config.react.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. This config is single-purpose and has no `KAI_BUILD`.
- Produces: `vite build --config config/vite/react.ts`, used by Task 7.

React stays its own file rather than a fifteenth row in `lib.ts` because `docs/coupling-map.md:101` registers it BY PATH as the owner of the `'use client';` banner, and because `srcSpecifiersToDist` is 25 lines nothing else uses.

- [ ] **Step 1: Create the file**

Copy `packages/ui/vite.config.react.ts` verbatim, then apply exactly these three changes:

1. Add `const PKG = resolve(__dirname, '../..');` immediately after the imports, with this comment above it:

```ts
// This file lives two levels below the package root, so distRoot/srcRoot and
// the lib entry resolve from PKG rather than __dirname. Vite's `root` is
// process.cwd() (packages/ui, via the npm script), so the dts plugin's
// tsconfigPath / include / outDir stay relative to the package as before.
const PKG = resolve(__dirname, '../..');
```

2. Change `const distRoot = resolve(__dirname, 'dist');` to `const distRoot = resolve(PKG, 'dist');` and `const srcRoot = resolve(__dirname, 'src');` to `const srcRoot = resolve(PKG, 'src');`.

3. Change `entry: resolve(__dirname, 'frameworks/react/index.tsx')` to `entry: resolve(PKG, 'frameworks/react/index.tsx')`.

Leave `tsconfigPath: 'tsconfig.react.json'`, `include: ['frameworks/react/**']`, `outDir: 'dist/react'`, `entryRoot: 'frameworks/react'`, the `beforeWriteFile` hook, the `external` array and `output: { banner: "'use client';" }` untouched. They resolve against the Vite root, which has not moved.

- [ ] **Step 2: Swap the build link and delete the old file**

In `packages/ui/package.json:183`:

```
vite build --config vite.config.react.ts  ->  vite build --config config/vite/react.ts
```

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm vite.config.react.ts
```

- [ ] **Step 3: Build, diff, and run the banner guard**

<!-- gate-list: partial -- the two gates this task can move, not the required CI `test` job's gate set -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
diff -r /tmp/dist-before packages/ui/dist && echo "DIST IDENTICAL"
head -c 20 packages/ui/dist/react.js
pnpm --filter @kitn.ai/ui run verify:react-wrappers
```

Expected: `DIST IDENTICAL`; the head prints `'use client';`; `verify:react-wrappers` exits 0.

- [ ] **Step 4: Update the coupling-map row**

In `docs/coupling-map.md:101`, replace `packages/ui/vite.config.react.ts` with `packages/ui/config/vite/react.ts`. Change nothing else in that row.

- [ ] **Step 5: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/ui docs/coupling-map.md
git commit -m "refactor(ui): the react wrapper build moves to config/vite/react.ts

Kept as its own file, not a row in lib.ts: docs/coupling-map.md registers it
by path as the owner of the 'use client' banner, and srcSpecifiersToDist is
used by nothing else. The coupling row moves with it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"
```

---

### Task 4: `config/vite/node.ts`

**Files:**
- Create: `packages/ui/config/vite/node.ts`
- Modify: `packages/ui/package.json:183` (the mcp and construct-cli links)
- Delete: `packages/ui/vite.config.mcp.ts`, `packages/ui/vite.config.construct-cli.ts`

**Interfaces:**
- Produces: `KAI_BUILD=mcp` and `KAI_BUILD=construct-cli` against `config/vite/node.ts`, used by Task 7 and by `.claude/skills/consumer-regression/`.

- [ ] **Step 1: Create the file**

```ts
import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// The two node bins: dist/mcp.es.js (the `kai` MCP stdio server, launched by
// bin/mcp.js) and dist/construct-cli.es.js. Both are build.ssr bundles targeting
// node18 with the standard library and zod external, which is the one shape in
// this package that is neither a browser lib build nor a page.
//
// Selected by KAI_BUILD. See config/vite/lib.ts's header for why an env var and
// not --mode.

const NODE_BUILTINS = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

interface Target {
  /** Entry, relative to the Vite root (packages/ui). */
  entry: string;
  /** Emitted filename under dist/. */
  out: string;
  external: (string | RegExp)[];
}

const TARGETS: Record<string, Target> = {
  // Built AFTER KAI_BUILD=schemas: this bundle compiles the MCP against the
  // BUILT dist/schemas.js, not against src. vitest.config.ts records the same
  // dependency from the other side.
  mcp: {
    entry: 'src/agent-tooling/mcp/stdio.ts',
    out: 'mcp.es.js',
    external: ['zod', /^@modelcontextprotocol\/sdk/, ...NODE_BUILTINS],
  },
  'construct-cli': {
    entry: 'src/agent-tooling/construct/cli-entry.ts',
    out: 'construct-cli.es.js',
    external: ['zod', ...NODE_BUILTINS],
  },
};

const requested = process.env.KAI_BUILD ?? '';
const target = TARGETS[requested];
if (!target) {
  throw new Error(
    `config/vite/node.ts: KAI_BUILD must be one of [${Object.keys(TARGETS).join(', ')}], got ${JSON.stringify(process.env.KAI_BUILD)}`,
  );
}

export default defineConfig({
  build: {
    emptyOutDir: false,
    ssr: target.entry,
    target: 'node18',
    rollupOptions: {
      external: target.external,
      output: { entryFileNames: target.out },
    },
  },
});
```

The externals arrays keep the exact order the two deleted files used. Rollup does not care about order, but a reviewer diffing against the old files does.

Move any header comment from the two deleted files onto the matching row before deleting them.

- [ ] **Step 2: Swap the build links and delete the old files**

In `packages/ui/package.json:183`:

```
vite build --config vite.config.mcp.ts            -> KAI_BUILD=mcp vite build --config config/vite/node.ts
vite build --config vite.config.construct-cli.ts  -> KAI_BUILD=construct-cli vite build --config config/vite/node.ts
```

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm vite.config.mcp.ts vite.config.construct-cli.ts
```

- [ ] **Step 3: Build, diff, and run the bin end to end**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
diff -r /tmp/dist-before packages/ui/dist && echo "DIST IDENTICAL"
node packages/ui/bin/mcp.js --help 2>&1 | head -5
```

Expected: `DIST IDENTICAL`; the bin prints its help rather than a module-resolution error. A bundled-instead-of-external builtin shows up here and nowhere else.

- [ ] **Step 4: Update the consumer-regression skill's two commands**

`.claude/skills/consumer-regression/SKILL.md:52`:

```
npx vite build --config vite.config.mcp.ts
```
becomes
```
KAI_BUILD=mcp npx vite build --config config/vite/node.ts
```

`.claude/skills/consumer-regression/recipes.md:40`: the same replacement.

`.claude/skills/consumer-regression/recipes.md:85`: replace `built by \`vite.config.mcp.ts\`` with `built by \`config/vite/node.ts\` (\`KAI_BUILD=mcp\`)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/ui .claude/skills/consumer-regression
git commit -m "refactor(ui): the two node bin builds move to config/vite/node.ts

mcp and construct-cli were the same build.ssr shape twice. The consumer-
regression skill's rebuild command moves with them; it is the one caller
outside package.json that invokes a vite config by name.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"
```

---

### Task 5: `config/vite/elements.ts`

This is the riskiest vite task: it merges the only `emptyOutDir: true` build in `dist/` root with the manifest-driven per-element split, and it deduplicates a `libMinifyPlugin` that was copy-pasted into both.

**Files:**
- Create: `packages/ui/config/vite/elements.ts`
- Modify: `packages/ui/package.json:183` (the first link) and `:184` (`build:elements`)
- Delete: `packages/ui/vite.config.ts`, `packages/ui/vite.config.elements.ts`

**Interfaces:**
- Produces: `KAI_BUILD=register` and `KAI_BUILD=split` against `config/vite/elements.ts`.

- [ ] **Step 1: Create the file**

```ts
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { transform } from 'esbuild';
import type { Plugin, Rollup, UserConfig } from 'vite';

type OutputBundle = Rollup.OutputBundle;
type OutputChunk = Rollup.OutputChunk;

// The two element bundles.
//
//   KAI_BUILD=register -> dist/kai.es.js, the coarse register-all facade. This
//     is the ONLY build in the chain with emptyOutDir:true writing to dist/
//     root, which is why it runs FIRST: anything built before it is deleted.
//
//   KAI_BUILD=split -> dist/elements/<name>.js, one self-registering module per
//     tag, driven by src/elements/element-manifest.json. Runs inside
//     build:elements, between gen-elements-manifest.mjs (which writes the
//     manifest) and gen-element-dts.mjs.
//
// They stay two targets rather than one multi-entry build because their
// rollupOptions.output differ: register writes kai.[format].js at dist/ root
// with tree-shaking OFF, split writes elements/[name].js plus hashed chunks.
// vite's output config is per build, not per entry.

const PKG = resolve(__dirname, '../..');

// Was duplicated verbatim in vite.config.ts and vite.config.elements.ts.
// The `import(` rewrite marks the emitted dynamic imports @vite-ignore so a
// consumer's bundler leaves the lazy chunk boundaries alone.
function libMinifyPlugin(): Plugin {
  return {
    name: 'lib-minify',
    enforce: 'post',
    apply: 'build',
    async generateBundle(_outputOptions, bundle: OutputBundle) {
      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') {
          const result = await transform((chunk as OutputChunk).code, {
            minify: true,
            legalComments: 'none',
          });
          (chunk as OutputChunk).code = result.code.replace(/import\(`/g, 'import(/*@vite-ignore*/`');
        }
      }
    },
  };
}

function registerConfig(): UserConfig {
  return {
    plugins: [solidPlugin(), libMinifyPlugin()],
    build: {
      lib: {
        entry: resolve(PKG, 'src/elements/register.ts'),
        name: 'Kai',
        fileName: (format) => `kai.${format}.js`,
        formats: ['es'],
      },
      rollupOptions: {
        treeshake: false,
        preserveEntrySignatures: 'allow-extension',
      },
      emptyOutDir: true,
    },
  };
}

function splitConfig(): UserConfig {
  // Read LAZILY, inside this function. src/elements/element-manifest.json is
  // generated by gen-elements-manifest.mjs and does not exist on a fresh tree
  // until build:elements runs. A module-scope read here would make the
  // `register` build (which runs first, before the manifest exists) throw.
  const manifest = JSON.parse(
    readFileSync(resolve(PKG, 'src/elements/element-manifest.json'), 'utf8'),
  );
  const entry: Record<string, string> = {
    autoloader: resolve(PKG, 'src/elements/autoloader.ts'),
    remote: resolve(PKG, 'src/elements/remote.tsx'),
  };
  for (const file of Object.keys(manifest.files)) {
    for (const ext of ['tsx', 'ts']) {
      const p = resolve(PKG, `src/elements/${file}.${ext}`);
      if (existsSync(p)) {
        entry[file] = p;
        break;
      }
    }
  }
  return {
    plugins: [solidPlugin(), libMinifyPlugin()],
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: {
        output: { entryFileNames: 'elements/[name].js', chunkFileNames: '[name]-[hash].js' },
      },
    },
  };
}

const CONFIGS: Record<string, () => UserConfig> = {
  register: registerConfig,
  split: splitConfig,
};

const requested = process.env.KAI_BUILD ?? '';
const build = CONFIGS[requested];
if (!build) {
  throw new Error(
    `config/vite/elements.ts: KAI_BUILD must be one of [${Object.keys(CONFIGS).join(', ')}], got ${JSON.stringify(process.env.KAI_BUILD)}`,
  );
}

export default defineConfig(build());
```

Move any remaining header comments from `vite.config.ts` and `vite.config.elements.ts` onto the matching function before deleting them.

- [ ] **Step 2: Prove the lazy manifest read matters**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
mv src/elements/element-manifest.json /tmp/element-manifest.json.bak
KAI_BUILD=register npx vite build --config config/vite/elements.ts && echo "REGISTER OK WITHOUT MANIFEST"
mv /tmp/element-manifest.json.bak src/elements/element-manifest.json
```

Expected: `REGISTER OK WITHOUT MANIFEST`. If it throws `ENOENT ... element-manifest.json`, the read is at module scope and a fresh clone's first build will fail. Fix before continuing.

- [ ] **Step 3: Swap both build links and delete the old files**

In `packages/ui/package.json:183`, the FIRST link:

```
vite build --config vite.config.ts  ->  KAI_BUILD=register vite build --config config/vite/elements.ts
```

Take care: `vite.config.ts` is a substring of nothing else remaining in the chain at this point, but check with `grep -o 'vite.config[a-z.-]*\.ts' packages/ui/package.json` before and after.

In `packages/ui/package.json:184`:

```
"build:elements": "node scripts/gen-elements-manifest.mjs && KAI_BUILD=split vite build --config config/vite/elements.ts && node scripts/gen-element-dts.mjs"
```

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm vite.config.ts vite.config.elements.ts
```

- [ ] **Step 4: Build, diff, and run the element guards**

<!-- gate-list: partial -- the three gates this task can move, not the required CI `test` job's gate set -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
diff -r /tmp/dist-before packages/ui/dist && echo "DIST IDENTICAL"
pnpm --filter @kitn.ai/ui run verify:elements-bundle
pnpm --filter @kitn.ai/ui run verify:shader-lazy
pnpm --filter @kitn.ai/ui run verify:consumer
```

Expected: `DIST IDENTICAL` and all three guards exit 0.

`DIST IDENTICAL` here also proves the `dedupe:shiki` step still runs against the same chunk layout it did before, which is what `scripts/dedupe-shiki-chunks.mjs` depends on.

- [ ] **Step 5: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/ui
git commit -m "refactor(ui): both element builds move to config/vite/elements.ts

register (emptyOutDir true, runs first) and split (manifest-driven, runs
inside build:elements) become two functions sharing the libMinifyPlugin that
was copy-pasted into both. The manifest read is LAZY: it does not exist on a
fresh tree until gen-elements-manifest runs, so a module-scope read would
break the register build. Watched fail with the manifest moved aside.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"
```

---

### Task 6: `config/vite/page.ts`

**Files:**
- Create: `packages/ui/config/vite/page.ts`
- Modify: `packages/ui/package.json:183` (the three page links)
- Delete: `packages/ui/vite.config.builder-page.ts`, `vite.config.theme-studio.ts`, `vite.config.gallery.ts`

**Interfaces:**
- Produces: `KAI_BUILD=builder`, `KAI_BUILD=theme-studio`, `KAI_BUILD=gallery` against `config/vite/page.ts`.

- [ ] **Step 1: Create the file**

```ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';

// The three prebuilt dev-tool pages, built at kit build time so the `kai dev`
// CLI's thin server serves static files and compiles nothing at consumer
// runtime. All three are light-DOM Solid with their own Tailwind build.
//
// base './' on all three because dev.ts serves each from an arbitrary port,
// builder at the root and the other two under /theme-studio/ and /gallery/.
//
// Each has its own `root`, which is why these are three INVOCATIONS of one
// config rather than one build: Vite's root is a per-build setting.

const PKG = resolve(__dirname, '../..');

interface Page {
  /** App root, relative to the package root. */
  root: string;
  /** Output directory, relative to the package root. */
  outDir: string;
  external?: string[];
  paths?: Record<string, string>;
}

const PAGES: Record<string, Page> = {
  builder: {
    root: 'apps/builder',
    outDir: 'dist/builder-page',
  },
  'theme-studio': {
    root: 'apps/theme-studio',
    outDir: 'dist/theme-studio',
    // The kai-* element bundle is NOT re-bundled into this app: the one dynamic
    // import('@kitn.ai/ui/elements') in apps/theme-studio/kit.ts is external,
    // rewritten to the absolute /theme-studio/kit/kai.es.js route, which dev.ts
    // maps onto the package's own dist/. Zero duplication, and this build stays
    // ordering-independent of build:elements.
    external: ['@kitn.ai/ui/elements'],
    paths: { '@kitn.ai/ui/elements': '/theme-studio/kit/kai.es.js' },
  },
  gallery: {
    root: 'apps/gallery',
    outDir: 'dist/gallery',
  },
};

const requested = process.env.KAI_BUILD ?? '';
const page = PAGES[requested];
if (!page) {
  throw new Error(
    `config/vite/page.ts: KAI_BUILD must be one of [${Object.keys(PAGES).join(', ')}], got ${JSON.stringify(process.env.KAI_BUILD)}`,
  );
}

export default defineConfig({
  root: resolve(PKG, page.root),
  base: './',
  plugins: [solid()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: resolve(PKG, page.outDir),
    // Each page owns its own subdirectory, so this clobbers only itself.
    emptyOutDir: true,
    ...(page.external
      ? { rollupOptions: { external: page.external, output: { paths: page.paths } } }
      : {}),
  },
});
```

Move the remaining header prose from each of the three deleted files onto its `PAGES` row before deleting them.

- [ ] **Step 2: Swap the three build links and delete the old files**

In `packages/ui/package.json:183`:

```
vite build --config vite.config.builder-page.ts  -> KAI_BUILD=builder vite build --config config/vite/page.ts
vite build --config vite.config.theme-studio.ts  -> KAI_BUILD=theme-studio vite build --config config/vite/page.ts
vite build --config vite.config.gallery.ts       -> KAI_BUILD=gallery vite build --config config/vite/page.ts
```

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm vite.config.builder-page.ts vite.config.theme-studio.ts vite.config.gallery.ts
```

- [ ] **Step 3: Build and diff**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
diff -r /tmp/dist-before packages/ui/dist && echo "DIST IDENTICAL"
ls packages/ui/dist/builder-page/index.html packages/ui/dist/theme-studio/index.html packages/ui/dist/gallery/index.html
grep -c 'theme-studio/kit/kai.es.js' packages/ui/dist/theme-studio/assets/*.js
```

Expected: `DIST IDENTICAL`; all three `index.html` exist; the grep finds the rewritten absolute route at least once. If it finds zero, the `output.paths` rewrite did not apply and the page will fetch nothing at runtime.

- [ ] **Step 4: Confirm no vite config remains at the package root**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
ls packages/ui/vite.config*.ts 2>&1
grep -o 'vite\.config[a-z.-]*\.ts' packages/ui/package.json | sort -u
```

Expected: `ls` reports no such file; the grep prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/ui
git commit -m "refactor(ui): the three prebuilt pages move to config/vite/page.ts

Three invocations of one config rather than one build, because Vite's root is
a per-build setting and each page has its own. theme-studio's external plus
output.paths rewrite moves with it: that is what keeps it independent of
build:elements.

No vite.config*.ts remains at the package root.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"
```

---

### Task 7: the comment sweep, and PR 1

**Files:**
- Modify (comments only): `packages/ui/scripts/verify-ssr-render.mjs:40,41,137` · `packages/ui/scripts/dedupe-shiki-chunks.mjs:3,50` · `packages/ui/scripts/verify-pack-weight.mjs:256` · `packages/ui/scripts/gen-element-api.mjs:599` · `packages/ui/scripts/emit-subpath-dts.mjs:23` · `packages/ui/vitest.config.ts:73-74` · `packages/ui/bin/mcp.js:3` · `packages/ui/src/solid.ts:14-15` · `packages/ui/src/stores/index.ts:19` · `packages/ui/src/elements/element-diagnostics.ts:354` · `packages/ui/src/elements/element-artifact-divergence.test.ts:21` · `packages/ui/src/elements/define-entry.test.ts:11,13` · `packages/ui/src/elements/register.ts:21` · `packages/ui/src/components/audio-visualizer/index.tsx:231` · `packages/ui/src/agent-tooling/mcp/stdio.ts:7` · `packages/ui/src/agent-tooling/mcp/manifest.ts:276` · `packages/ui/src/agent-tooling/mcp/tools/reference.ts:711` · `packages/ui/src/agent-tooling/construct/cli-entry.ts:1` · `packages/ui/src/agent-tooling/construct/dev.ts:177,591,599` · `packages/ui/apps/theme-studio/kit.ts:10` · `packages/ui/apps/theme-studio/index.html:3` · `packages/ui/apps/theme-studio/ThemeStudio.tsx:23`
- Modify: `packages/ui/tsconfig.tests.json` (the `resolved` key string)
- Modify: `docs/composable-web-components-roster.md:44`
- Modify: `docs/research/autoloader-proof.mjs:6`

- [ ] **Step 1: Rewrite the comment references**

Each reference names an old config path. Replace with the new path and, where the reference is a command, the `KAI_BUILD` value. The mapping:

```
vite.config.ts                       -> config/vite/elements.ts (KAI_BUILD=register)
vite.config.elements.ts              -> config/vite/elements.ts (KAI_BUILD=split)
vite.config.react.ts                 -> config/vite/react.ts
vite.config.mcp.ts                   -> config/vite/node.ts (KAI_BUILD=mcp)
vite.config.construct-cli.ts         -> config/vite/node.ts (KAI_BUILD=construct-cli)
vite.config.builder-page.ts          -> config/vite/page.ts (KAI_BUILD=builder)
vite.config.theme-studio.ts          -> config/vite/page.ts (KAI_BUILD=theme-studio)
vite.config.gallery.ts               -> config/vite/page.ts (KAI_BUILD=gallery)
vite.config.<anything else>.ts       -> config/vite/lib.ts (KAI_BUILD=<output stem>)
```

`vite.config.elements.ts:44-50` is cited with a line range in two places (`src/elements/element-diagnostics.ts:354`, `src/agent-tooling/mcp/tools/reference.ts:711`). Those line numbers are now wrong. Replace the range with a prose anchor instead of a new number: "the `output.entryFileNames` in `splitConfig()` in `config/vite/elements.ts`". A line number nobody updates is the failure mode CLAUDE.md names.

- [ ] **Step 2: Fix the quarantine registry's key**

In `packages/ui/tsconfig.tests.json`, the `resolved` object has a key literally named:

```
"vite.config.ts + vite.config.elements.ts"
```

Rename it to:

```
"config/vite/elements.ts (was vite.config.ts + vite.config.elements.ts)"
```

`scripts/verify-quarantine.mjs` only cross-checks `exclude` entries against `entries`, `structuralExcludes` and `resolved`, so a `resolved` key naming no live file is accepted either way. The rename is for the reader. Leave the entry's prose untouched: it records what was actually wrong, which is the useful part.

- [ ] **Step 3: Confirm nothing live still names a deleted file**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
grep -rn -E 'vite\.config\.(barrel|builder-page|construct|construct-cli|construct-templates|define|diagnostics|elements|gallery|mcp|provider|react|schemas|solid|state|stores|theme-studio|wire)[a-z.-]*\.ts' \
  packages/ui .github .claude docs/coupling-map.md docs/composable-web-components-roster.md docs/research \
  2>/dev/null | grep -v node_modules | grep -v '/dist/'
```

Expected: no output.

`docs/superpowers/**` and `docs/handoff/**` are historical records and are deliberately NOT rewritten, the same policy `lint:cdn-pins` applies to release history. They are excluded from the grep above for that reason.

- [ ] **Step 4: Do not touch the scaffolder's emitted strings**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git diff --stat HEAD~6 -- packages/ui/src/agent-tooling/mcp/tools/scaffold.ts \
  packages/ui/src/agent-tooling/construct/codegen.ts \
  packages/ui/src/agent-tooling/mcp/tools/debug.ts \
  packages/ui/src/agent-tooling/route-emit.ts
```

Expected: no output. Those files' `vite.config.ts` mentions are strings emitted into CONSUMER projects. If the diff is non-empty, a sed leaked; revert those files.

- [ ] **Step 5: Full gate sweep**

<!-- gate-list: partial -- the gates this PR's changes can move, run locally before pushing; the required CI `test` job is the merge verdict and `node packages/ui/scripts/lint-gate-parity.mjs --list` prints its full set -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
diff -r /tmp/dist-before packages/ui/dist && echo "DIST IDENTICAL"
pnpm --filter @kitn.ai/ui run typecheck
pnpm --filter @kitn.ai/ui run verify:pack
pnpm --filter @kitn.ai/ui run verify:consumer
pnpm --filter @kitn.ai/ui run verify:dts
pnpm --filter @kitn.ai/ui run verify:dts:consumer
pnpm --filter @kitn.ai/ui run verify:cdn-entries
pnpm --filter @kitn.ai/ui run verify:ssr
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run verify:scaffold
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
```

Expected: `DIST IDENTICAL` and every command exits 0. `verify:scaffold` is the one that would catch a leaked sed into the emitted consumer code.

- [ ] **Step 6: Prove the tarball did not move**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npm pack --dry-run --json > /tmp/pack-after.json
node -e "const a=require('/tmp/pack-after.json')[0];console.log(a.files.length, a.unpackedSize)"
```

Compare the two printed values against the same command run on `main`. Expected: identical file count and identical unpacked size. `dist/` being byte-identical makes this a formality, which is the point of checking it.

- [ ] **Step 7: Commit and open PR 1**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A
git commit -m "docs(ui): comment references follow the vite configs into config/vite/

22 vite configs are now 5. This is the reference sweep: scripts, source
comments, the quarantine registry key, the roster doc and the autoloader
research script. docs/superpowers/ and docs/handoff/ are historical records
and are deliberately left naming the old paths.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"

git push -u origin feat/ui-config-consolidation
gh pr create --title "refactor(ui): 22 vite configs become 5 under config/vite/" --body "$(cat <<'BODY'
The 22 `vite.config.*.ts` files at `packages/ui/` root become 5 under
`packages/ui/config/vite/`, each selecting its output from a `TARGETS` table by
the `KAI_BUILD` environment variable.

**`dist/` is byte-identical.** No multi-entry build was introduced anywhere, so
no chunk was hoisted and no output moved. `diff -r` against a pre-change build
is empty, and `npm pack --dry-run --json` reports the same file count and
unpacked size.

Why not multi-entry: rollup hoists code shared between entries into a separate
chunk, and `dist/state.js`, `dist/wire.js` and `dist/stores.js` are promised
self-contained by `scripts/verify-cdn-entries.mjs` so a no-build page can load
them from a raw CDN URL. A hoisted chunk is a relative specifier, so that guard
would have stayed green while the promise got weaker. Recorded as a separate,
measured follow-up.

The one thing that would have failed green: `tsconfig.tests.json`'s `include`
carries `"*.ts"`, a package-root non-recursive glob, and that is the only thing
putting these configs into the fifth typecheck pass. It now also carries
`"config/**/*.ts"`, watched fail first with a planted TS2322.

Design: `docs/superpowers/specs/2026-09-01-ui-config-consolidation-design.md`

Playwright is PR 2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
BODY
)"
```

---

### Task 8: `config/playwright/storybook.config.ts`

PR 2 starts here. Branch from the merged PR 1, or continue on the same branch if PR 1 has not merged yet and you are stacking.

**Files:**
- Create: `packages/ui/config/playwright/storybook.config.ts`
- Modify: `packages/ui/package.json:244-251` (five scripts rewritten, four added)
- Delete: `packages/ui/playwright.composer.config.ts`, `playwright.slots.config.ts`, `playwright.menu.config.ts`, `playwright.command.config.ts`, `playwright.input-mask.config.ts`, `playwright.promptinput.config.ts`, `playwright.shot.config.ts`, `playwright.audio-visualizer.config.ts`, `playwright.audio-visualizer-band-shape.config.ts`

**Interfaces:**
- Produces: nine project names consumed by the scripts in this task and by nothing else: `composer`, `slots`, `menu`, `command`, `input-mask`, `promptinput`, `shot`, `audio-visualizer`, `audio-visualizer-band-shape`.

- [ ] **Step 1: Record the baseline test counts**

Before changing anything, run each of the five wired suites and write down the number of tests each reports. A project that matches no files exits 0, so these counts are the only thing that will prove the merge did not silently empty a suite.

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
for s in test:composer-ivp test:slots-ivp test:menu-ivp test:command-ivp test:input-mask-ivp; do
  echo "== $s"; pnpm --filter @kitn.ai/ui run $s 2>&1 | tail -3
done
```

Record each "N passed" figure. Do the same for the four unwired suites:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
for c in playwright.promptinput playwright.shot playwright.audio-visualizer playwright.audio-visualizer-band-shape; do
  echo "== $c"; npx playwright test --config $c.config.ts 2>&1 | tail -3
done
```

- [ ] **Step 2: Create the config**

```ts
import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

// The nine Storybook-driven browser suites, one project each, one Storybook
// server for all of them.
//
// WHY THESE NINE AND NOT ALL FOURTEEN: `webServer` is a TestConfig option, not
// a TestProject one, so a single config starts every listed server on every
// run. Two of the fourteen bind port 6006 and would collide: Storybook (here)
// and dev:host (config/playwright/cross-origin.config.ts). The three paint
// guards plus hover-card run against bare harness servers and live in
// config/playwright/bare.config.ts. Port conflict is what draws the file
// boundaries, and it is the only thing that does.
//
// KAI_SB_PORT: playwright.audio-visualizer-band-shape.config.ts existed
// entirely because a worktree's run must not attach to the PARENT checkout's
// Storybook on 6006, so it hardcoded 6018. That need is real and it is now
// config-wide: set KAI_SB_PORT once and every suite here moves together,
// instead of one suite having an escape hatch the other eight lack.
//
// The webServer command spells storybook out rather than reusing the
// `storybook` npm script, which hardcodes `-p 6006`. Relying on a trailing
// `-p` to override an earlier one is undocumented last-flag-wins behaviour
// that changes across storybook versions.

const PKG = resolve(__dirname, '../..');
const PORT = process.env.KAI_SB_PORT ?? '6006';
const BASE = `http://localhost:${PORT}`;

const CHROMIUM = {
  ...devices['Desktop Chrome'],
  launchOptions: { args: ['--disable-dev-shm-usage', '--no-sandbox'] },
};

// Storybook compiles each story on first load (Vite on-demand). A generous
// ceiling tolerates the cold compile while returning as soon as the assertion
// passes on warm runs.
const COLD_COMPILE = { timeout: 30_000 };

export default defineConfig({
  // Relative to THIS FILE: Playwright resolves testDir against the config's
  // own directory, not the cwd.
  testDir: '../../tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE, trace: 'off' },
  projects: [
    {
      // <kai-composer>: contenteditable, trigger menu, atomic pills, submit
      // payload. None of it reachable through jsdom or synthetic userEvent.
      name: 'composer',
      testMatch: /composer-ivp\.spec\.ts/,
      retries: process.env.CI ? 1 : 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      // The <kai-chat> slotted-shell composition slots: inject, replace, and
      // the data-flow wall.
      name: 'slots',
      testMatch: /(chat|promptinput)-slots-ivp\.spec\.ts/,
      retries: 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      // <kai-menu> and the cascading primitives: submenu open-on-hover,
      // ArrowRight/ArrowLeft traversal, in-place checkbox toggle, and which id
      // kai-select actually carries.
      name: 'menu',
      testMatch: /menu-ivp\.spec\.ts/,
      retries: process.env.CI ? 1 : 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      // <kai-command>: grouping, search filtering, keyboard nav, and the
      // kai-select / kai-query-change CustomEvents crossing a shadow root.
      name: 'command',
      testMatch: /command-ivp\.spec\.ts/,
      retries: process.env.CI ? 1 : 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      name: 'input-mask',
      testMatch: /input-mask-ivp\.spec\.ts/,
      retries: 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      // SHOT=baseline|after selects which screenshots this writes.
      name: 'promptinput',
      testMatch: /promptinput-(shot|behavior|pills)\.spec\.ts/,
      retries: 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      // Screenshot ARTIFACTS for visual review, not assertions.
      name: 'shot',
      testMatch: /\.shot\.spec\.ts$/,
      retries: 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      // Live WebGL and a real Web Audio graph. deviceScaleFactor 2 because the
      // translucent-edge inspection cannot judge a one-pixel fringe at 1x, and
      // the autoplay flag so the WAV <audio> element plays without a gesture.
      name: 'audio-visualizer',
      testMatch: /audio-visualizer-ivp\.spec\.ts/,
      retries: 0,
      timeout: 60_000,
      expect: { timeout: 15_000 },
      use: {
        ...CHROMIUM,
        viewport: { width: 1400, height: 1000 },
        deviceScaleFactor: 2,
        launchOptions: {
          args: [
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
    {
      // The centre-outward band-mirror regression guard.
      name: 'audio-visualizer-band-shape',
      testMatch: /audio-visualizer-band-shape\.spec\.ts/,
      retries: 0,
      timeout: 90_000,
      expect: { timeout: 15_000 },
      use: {
        ...CHROMIUM,
        viewport: { width: 1400, height: 1000 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    // cwd is REQUIRED: Playwright defaults webServer.cwd to the config file's
    // own directory, which is config/playwright/, where `npm run build:css`
    // does not exist.
    cwd: PKG,
    command: `npm run build:css && npx storybook dev -p ${PORT} --ci --quiet`,
    url: `${BASE}/iframe.html`,
    // Reuse whatever is already listening. Both cases work with the same
    // command: an existing server is used as-is and never restarted or torn
    // down, and if nothing is listening Playwright starts one and stops it
    // after the run.
    reuseExistingServer: true,
    // The ceiling of the nine originals, which ranged from 120s to 180s. A
    // longer ceiling never fails a run that would have passed.
    timeout: 180_000,
  },
});
```

- [ ] **Step 3: Rewrite five scripts and add four**

In `packages/ui/package.json`, replace lines 244 to 250's five Storybook entries and add four more. The full set for this task:

```json
    "test:composer-ivp": "playwright test --config config/playwright/storybook.config.ts --project=composer",
    "test:slots-ivp": "playwright test --config config/playwright/storybook.config.ts --project=slots",
    "test:menu-ivp": "playwright test --config config/playwright/storybook.config.ts --project=menu",
    "test:command-ivp": "playwright test --config config/playwright/storybook.config.ts --project=command",
    "test:input-mask-ivp": "playwright test --config config/playwright/storybook.config.ts --project=input-mask",
    "test:promptinput": "playwright test --config config/playwright/storybook.config.ts --project=promptinput",
    "test:shot": "playwright test --config config/playwright/storybook.config.ts --project=shot",
    "test:audio-visualizer": "playwright test --config config/playwright/storybook.config.ts --project=audio-visualizer",
    "test:audio-visualizer-band-shape": "playwright test --config config/playwright/storybook.config.ts --project=audio-visualizer-band-shape",
```

- [ ] **Step 4: Delete the nine configs**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm playwright.composer.config.ts playwright.slots.config.ts playwright.menu.config.ts \
  playwright.command.config.ts playwright.input-mask.config.ts playwright.promptinput.config.ts \
  playwright.shot.config.ts playwright.audio-visualizer.config.ts \
  playwright.audio-visualizer-band-shape.config.ts
```

- [ ] **Step 5: Watch a bad project name fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npx playwright test --config config/playwright/storybook.config.ts --project=composerr
```

Expected: Playwright errors with `Project(s) "composerr" not found`. A typo must not read as a passing run.

- [ ] **Step 6: Run all nine and compare counts to the baseline**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
for s in test:composer-ivp test:slots-ivp test:menu-ivp test:command-ivp test:input-mask-ivp \
         test:promptinput test:shot test:audio-visualizer test:audio-visualizer-band-shape; do
  echo "== $s"; pnpm --filter @kitn.ai/ui run $s 2>&1 | tail -3
done
```

Expected: each reports the same number of tests as the Step 1 baseline, and each passes. A count of zero is a failure regardless of the exit code.

- [ ] **Step 7: Prove `KAI_SB_PORT` works**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
KAI_SB_PORT=6018 pnpm --filter @kitn.ai/ui run test:audio-visualizer-band-shape 2>&1 | tail -3
```

Expected: passes, with the same test count. This is the behavior `playwright.audio-visualizer-band-shape.config.ts` existed for, now available to all nine.

- [ ] **Step 8: Update the spec header comments**

In each file, replace the `Run:` line. Line numbers from the design doc:

```
tests/e2e/composer-ivp.spec.ts:12                  -> npm run test:composer-ivp
tests/e2e/chat-slots-ivp.spec.ts:10                -> npm run test:slots-ivp
tests/e2e/promptinput-slots-ivp.spec.ts:9          -> npm run test:slots-ivp
tests/e2e/menu-ivp.spec.ts:15                      -> npm run test:menu-ivp
tests/e2e/command-ivp.spec.ts:12                   -> npm run test:command-ivp
tests/e2e/input-mask-ivp.spec.ts:65                -> npm run test:input-mask-ivp
tests/e2e/composer-pill-skins.shot.spec.ts:9       -> npm run test:shot
tests/e2e/promptinput-prefilled.shot.spec.ts:5     -> npm run test:shot
tests/e2e/audio-visualizer-ivp.spec.ts:36          -> npm run test:audio-visualizer
tests/e2e/audio-visualizer-band-shape.spec.ts:46   -> npm run test:audio-visualizer-band-shape
```

`tests/e2e/audio-visualizer-band-shape.spec.ts:50` also refers to "playwright.audio-visualizer-band-shape.config.ts's header" for the port reasoning. Repoint it at the `KAI_SB_PORT` comment in `config/playwright/storybook.config.ts`.

- [ ] **Step 9: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/ui
git commit -m "test(ui): nine storybook playwright configs become nine projects

One config, one Storybook server, nine projects. Every per-suite difference
(testMatch, retries, timeout, expect.timeout, viewport, deviceScaleFactor,
launch args) is a TestProject option, verified against playwright 1.61.1's
typings.

The band-shape suite's private port 6018 becomes config-wide KAI_SB_PORT,
so a worktree moves all nine together instead of one having an escape hatch.

webServer.cwd is set explicitly: Playwright defaults it to the config file's
directory, which is now config/playwright/.

Four suites that had no npm script now have one. Every project's test count
was recorded before and after and is unchanged; a project matching no files
exits 0, so the count is the assertion.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"
```

---

### Task 9: `config/playwright/bare.config.ts` and the workflow step

**Files:**
- Create: `packages/ui/config/playwright/bare.config.ts`
- Modify: `packages/ui/package.json` (three scripts rewritten, one added)
- Modify: `.github/workflows/test.yml` (the hover-card step and its comment)
- Modify: `packages/ui/tests/e2e/hover-card-tabstops.spec.ts:23`
- Delete: `packages/ui/playwright.focus-ring.config.ts`, `playwright.message-text-token.config.ts`, `playwright.content-brand-bleed.config.ts`, `playwright.hovercard.config.ts`

**Interfaces:**
- Produces: four project names: `focus-ring`, `message-text-token`, `content-brand-bleed`, `hovercard`.

- [ ] **Step 1: Record baseline counts**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
for s in test:focus-ring test:message-text-token test:content-brand-bleed; do
  echo "== $s"; pnpm --filter @kitn.ai/ui run $s 2>&1 | tail -3
done
pnpm --filter @kitn.ai/ui exec playwright test --config playwright.hovercard.config.ts 2>&1 | tail -3
```

Record the four counts. These guards drive `dist/`, so the build first is not optional.

- [ ] **Step 2: Create the config**

```ts
import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

// The four suites that must NOT run under Storybook, because Storybook loads
// Tailwind at DOCUMENT level, which registers the --tw-* custom properties
// globally and makes shadow-root rings paint. That is the precise condition
// that hid the focus-ring defect. Each of these serves a bare page that loads
// only the built dist/ bundle, which is what a real consumer app looks like.
//
// Separate from config/playwright/storybook.config.ts because these servers
// must not share a port with Storybook, and separate from
// config/playwright/cross-origin.config.ts because dev:host binds 6006 too.
//
// globalSetup ENFORCES a fresh dist/ rather than asking politely in a comment.
// It arrived with the hover-card suite, whose header records why: a
// deliberately broken fix produced a GREEN run against a stale bundle. The
// other three guards here drive dist/ for exactly the same reason and asked for
// a build in prose. Being config-wide, the enforcement now covers all four. In
// CI this is free: the `test` job builds well before any of these steps.

const PKG = resolve(__dirname, '../..');

const CHROMIUM = {
  ...devices['Desktop Chrome'],
  launchOptions: { args: ['--disable-dev-shm-usage', '--no-sandbox'] },
};

/** The bare harness server, one instance per port. */
const harness = (port: number) => ({
  // cwd is REQUIRED: Playwright defaults webServer.cwd to the config file's own
  // directory, and tests/e2e/ is not under config/playwright/.
  cwd: PKG,
  command: 'node tests/e2e/focus-ring-harness-server.mjs',
  url: `http://localhost:${port}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
  env: { FOCUS_RING_PORT: String(port) },
});

export default defineConfig({
  testDir: '../../tests/e2e',
  globalSetup: '../../tests/e2e/hover-card-global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [
    {
      // Does the focus indicator actually PAINT inside a shadow root, with no
      // document-level Tailwind to supply the --tw-* properties.
      name: 'focus-ring',
      testMatch: /focus-ring-paints\.spec\.ts/,
      timeout: 180_000,
      use: {
        ...CHROMIUM,
        baseURL: 'http://localhost:6210',
        trace: 'off',
        viewport: { width: 1100, height: 900 },
      },
    },
    {
      // What a branded --kai-color-primary resolves to for user message TEXT.
      name: 'message-text-token',
      testMatch: /message-text-token\.spec\.ts/,
      timeout: 60_000,
      use: {
        ...CHROMIUM,
        baseURL: 'http://localhost:6211',
        trace: 'off',
        viewport: { width: 900, height: 700 },
      },
    },
    {
      // The content/chrome brand-bleed sweep: reasoning, loader, prompt
      // suggestion, file tree and source, all of which hardcoded text-primary.
      name: 'content-brand-bleed',
      testMatch: /content-brand-bleed\.spec\.ts/,
      timeout: 60_000,
      use: {
        ...CHROMIUM,
        baseURL: 'http://localhost:6212',
        trace: 'off',
        viewport: { width: 900, height: 800 },
      },
    },
    {
      // Tab-stop and focus-open matrix. jsdom has no tab-order engine, so it
      // can never press Tab, which is how two defects here passed unit tests
      // that verified a keyboard claim with a synthetic focusIn.
      name: 'hovercard',
      testMatch: /hover-card-tabstops\.spec\.ts$/,
      expect: { timeout: 15_000 },
      use: {
        ...CHROMIUM,
        baseURL: 'http://localhost:6013',
        trace: 'on-first-retry',
      },
    },
  ],
  webServer: [
    harness(6210),
    harness(6211),
    harness(6212),
    {
      // The workspace's own vite via pnpm exec, never bare npx, for hermetic
      // CI. pnpm exec rather than a path because pnpm hoists vite to the
      // workspace root and packages/ui/node_modules/.bin/vite does not exist.
      cwd: PKG,
      command: 'pnpm exec vite --port 6013 --strictPort',
      url: 'http://localhost:6013/tests/e2e/fixtures/hover-card-tabstops.html',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
```

Port 6013 stays away from Storybook (6006), the remote-card host and provider (6006, 6007), and the docs site (4321). The three harness ports 6210 to 6212 stay distinct so the three guards can run independently.

- [ ] **Step 3: Rewrite three scripts and add one**

```json
    "test:focus-ring": "playwright test --config config/playwright/bare.config.ts --project=focus-ring",
    "test:message-text-token": "playwright test --config config/playwright/bare.config.ts --project=message-text-token",
    "test:content-brand-bleed": "playwright test --config config/playwright/bare.config.ts --project=content-brand-bleed",
    "test:hovercard": "playwright test --config config/playwright/bare.config.ts --project=hovercard",
```

- [ ] **Step 4: Delete the four configs**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm playwright.focus-ring.config.ts playwright.message-text-token.config.ts \
  playwright.content-brand-bleed.config.ts playwright.hovercard.config.ts
```

- [ ] **Step 5: Change the one workflow step that names a config**

`.github/workflows/test.yml` currently carries, near line 919:

```yaml
      # Expects: packages/ui/playwright.hovercard.config.ts
      #          packages/ui/tests/e2e/hover-card-tabstops.spec.ts
      - name: Hover-card tab-stop guard (built bundle)
        run: pnpm --filter @kitn.ai/ui exec playwright test --config playwright.hovercard.config.ts
```

Locate it by grep rather than by line number, because the CI split may have moved it into a different job:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
grep -rn 'playwright.hovercard.config.ts' .github/workflows/
```

Replace with:

```yaml
      # Expects: packages/ui/config/playwright/bare.config.ts (project: hovercard)
      #          packages/ui/tests/e2e/hover-card-tabstops.spec.ts
      - name: Hover-card tab-stop guard (built bundle)
        run: pnpm --filter @kitn.ai/ui run test:hovercard
```

Leave the step `name` exactly as it is. It is what the gate-parity linter uses to label the gate, and keeping it lets the before/after `--list` diff be read as a rename rather than a swap.

Why the script spelling and not `exec playwright test --config ... --project=hovercard`: `classifyCommand` in `packages/ui/scripts/lint-gate-parity.mjs` (lines 302 to 312) matches `exec playwright test` and then REQUIRES `--config`, returning `unknown` without it. An unknown step shape is a hard failure. Going through the npm script makes this gate the same shape as the other seven playwright gates and needs no change to the linter.

- [ ] **Step 6: Diff the gate set**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/scripts/lint-gate-parity.mjs --list > /tmp/gates-after.txt
git stash && node packages/ui/scripts/lint-gate-parity.mjs --list > /tmp/gates-before.txt && git stash pop
diff /tmp/gates-before.txt /tmp/gates-after.txt
```

Expected: exactly two changed lines, the gate id going from `@kitn.ai/ui playwright playwright.hovercard.config.ts` to `@kitn.ai/ui run test:hovercard`. The gate COUNT on the first line of each file must be identical, and the step name "Hover-card tab-stop guard (built bundle)" must appear in both.

Then:

```bash
node packages/ui/scripts/lint-gate-parity.mjs
```

Expected: exits 0. No `gate-list: complete` block exists anywhere in the repo (`grep -rn 'gate-list:' docs/ .github/ CLAUDE.md` shows every marker is `partial`, and partial blocks are skipped whole), so no documented list needs editing for the rename.

- [ ] **Step 7: Watch globalSetup catch a stale bundle**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
mv packages/ui/dist/kai.es.js /tmp/kai.es.js.bak
pnpm --filter @kitn.ai/ui run test:focus-ring
```

Expected: FAILS in globalSetup, naming the stale or missing bundle, before any test runs. This is the new coverage: `test:focus-ring` previously ran happily against whatever was there.

```bash
mv /tmp/kai.es.js.bak packages/ui/dist/kai.es.js
```

- [ ] **Step 8: Run all four and compare counts**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
for s in test:focus-ring test:message-text-token test:content-brand-bleed test:hovercard; do
  echo "== $s"; pnpm --filter @kitn.ai/ui run $s 2>&1 | tail -3
done
```

Expected: four passing runs with the Step 1 counts.

- [ ] **Step 9: Update the spec comment**

`packages/ui/tests/e2e/hover-card-tabstops.spec.ts:23`: replace

```
Run: `npx playwright test --config playwright.hovercard.config.ts`
```

with

```
Run: `npm run test:hovercard`
```

- [ ] **Step 10: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A packages/ui .github/workflows/test.yml
git commit -m "test(ui): the four bare-server suites become one config with four projects

focus-ring, message-text-token, content-brand-bleed and hover-card all serve
a bare page that loads only the built bundle, deliberately without Storybook's
document-level Tailwind. Four webServers, four projects, one config.

hover-card's globalSetup (fail on a stale dist/) is a TestConfig option and is
therefore now config-wide. The other three drive dist/ for the same reason and
only asked for a build in a comment. Watched fail with dist/kai.es.js moved
aside.

The one workflow step that spelled a playwright config directly now runs
test:hovercard instead. lint-gate-parity's canonicalizer requires --config
after `exec playwright test` and returns unknown without it, so --project=
alone would have turned the gate red; routing through the npm script makes
this gate the same shape as the other seven. Gate count unchanged, one id
renamed, step name unchanged.

webServer.cwd is set explicitly on all four: Playwright defaults it to the
config file's directory.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"
```

---

### Task 10: `config/playwright/cross-origin.config.ts`, and PR 2

**Files:**
- Create: `packages/ui/config/playwright/cross-origin.config.ts`
- Modify: `packages/ui/package.json` (`test:e2e`)
- Modify: `docs/coupling-map.md:125`
- Delete: `packages/ui/playwright.config.ts`

- [ ] **Step 1: Create the config**

Copy `packages/ui/playwright.config.ts` verbatim into `packages/ui/config/playwright/cross-origin.config.ts`, then apply exactly these changes:

1. Add after the imports:

```ts
import { resolve } from 'node:path';

const PKG = resolve(__dirname, '../..');
```

2. `testDir: 'tests/e2e'` becomes `testDir: '../../tests/e2e'`. Playwright resolves it against the config file's directory.

3. Add `cwd: PKG,` as the first key of BOTH `webServer` array entries. Playwright defaults `webServer.cwd` to the config file's directory, and `npm run dev:host` does not exist there.

4. In the header comment, replace the three config filenames it names (`playwright.composer.config.ts`, `playwright.promptinput.config.ts`, `playwright.shot.config.ts`) with: "the Storybook-driven suites, which run as projects of `config/playwright/storybook.config.ts`".

5. Add to the header comment:

```
// This is the one suite that cannot join either of the other two configs:
// dev:host binds 6006, the same port Storybook binds, and `webServer` is a
// TestConfig option rather than a TestProject one, so one config would start
// both and they would collide. The WARNING below is the local form of the same
// fact.
```

Leave `testMatch: /remote-element\.spec\.ts$/`, `forbidOnly`, `retries`, `reporter`, `use`, `projects` and both `webServer` entries otherwise untouched.

- [ ] **Step 2: Point `test:e2e` at it**

In `packages/ui/package.json`:

```json
    "test:e2e": "playwright test --config config/playwright/cross-origin.config.ts",
```

There is now no `playwright.config.ts` at the package root, so a bare `playwright test` has no default config and will fail loudly. That is intended: a bare invocation silently picking whichever suite happened to be the default is worse.

- [ ] **Step 3: Delete the last config and confirm the root is clean**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
git rm playwright.config.ts
ls playwright*.config.ts 2>&1
ls -1 vite.config*.ts playwright*.config.ts tsconfig*.json vitest* 2>/dev/null
```

Expected: `ls playwright*.config.ts` reports no such file. The final listing shows 10 files: 6 `tsconfig*.json` and 4 `vitest*`.

- [ ] **Step 4: Run it**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm --filter @kitn.ai/ui run test:e2e 2>&1 | tail -5
```

Expected: passes, same test count as before the change. Stop any running Storybook first: `dev:host` and Storybook both bind 6006, and `reuseExistingServer` would attach to the wrong one. That hazard is unchanged by this round and is documented in the config's own WARNING.

- [ ] **Step 5: Update the coupling-map row**

`docs/coupling-map.md:125` names `playwright.input-mask.config.ts` as one leg of the spec-name / testMatch / script-name triangle. Replace with `config/playwright/storybook.config.ts` (the `input-mask` project). The rest of the row still holds: the coupling is between the spec filename, the `testMatch` pattern and the npm script name, and all three still exist.

- [ ] **Step 6: Full sweep**

<!-- gate-list: partial -- the gates this PR's changes can move, run locally before pushing; the required CI `test` job is the merge verdict and `node packages/ui/scripts/lint-gate-parity.mjs --list` prints its full set -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx build ui --skip-nx-cache
pnpm --filter @kitn.ai/ui run typecheck
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
for s in test:e2e test:composer-ivp test:slots-ivp test:menu-ivp test:command-ivp \
         test:input-mask-ivp test:promptinput test:shot test:audio-visualizer \
         test:audio-visualizer-band-shape test:focus-ring test:message-text-token \
         test:content-brand-bleed test:hovercard; do
  echo "== $s"; pnpm --filter @kitn.ai/ui run $s 2>&1 | tail -3
done
grep -rn -E 'playwright\.[a-z-]*\.config\.ts' packages/ui .github .claude docs/coupling-map.md 2>/dev/null | grep -v node_modules
```

Expected: `typecheck` and both linters exit 0; all 14 suites pass with their recorded counts; the final grep prints nothing.

`typecheck` matters here specifically: the fifth pass now reads `config/playwright/*.ts` because of the include widened in Task 1, so a bad project option or a mistyped `devices` key is a compile error rather than a runtime surprise.

- [ ] **Step 7: Commit and open PR 2**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A
git commit -m "test(ui): the cross-origin matrix moves to config/playwright/cross-origin.config.ts

The last of the 14. It keeps its own file because dev:host binds 6006, the
same port Storybook binds, and webServer is a TestConfig option: one config
would start both.

No playwright config remains at the package root, so a bare \`playwright test\`
now fails loudly instead of silently running whichever suite was the default.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2"

git push
gh pr create --title "refactor(ui): 14 playwright configs become 3 under config/playwright/" --body "$(cat <<'BODY'
The 14 `playwright*.config.ts` files at `packages/ui/` root become 3 under
`packages/ui/config/playwright/`, with each old config becoming a project.

Three files and not one, because `webServer` is a `TestConfig` option rather
than a `TestProject` one: a single config starts every server on every run, and
Storybook and `dev:host` both bind 6006. Port conflict draws the boundaries.
Everything else that varied per suite (`testMatch`, `retries`, `timeout`,
`expect.timeout`, `viewport`, `deviceScaleFactor`, launch args) is a
`TestProject` option, checked against playwright 1.61.1's own typings.

Three things get better rather than merely smaller:

- The band-shape suite's private port 6018 becomes config-wide `KAI_SB_PORT`,
  so a worktree moves all nine Storybook suites together.
- Hover-card's `globalSetup`, which fails the run on a stale `dist/`, is now
  config-wide and so covers the three paint guards that previously asked for a
  fresh build in a comment. Watched fail with the bundle moved aside.
- `forbidOnly` on CI goes from 5 of 14 suites to all of them.

One gate id is renamed. `.github/workflows/test.yml` was the only place naming
a config directly, and `classifyCommand` in `lint-gate-parity.mjs` requires
`--config` after `exec playwright test`, returning `unknown` without it, so
`--project=` alone would have turned that gate red. The step now runs
`pnpm --filter @kitn.ai/ui run test:hovercard`, which makes it the same shape as
the other seven playwright gates. Gate count and step name unchanged; every
`gate-list: partial` marker in the repo still passes, and there are no
`gate-list: complete` blocks.

Five suites that had no npm script now have one.

Design: `docs/superpowers/specs/2026-09-01-ui-config-consolidation-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
BODY
)"
```

---

## Self-Review

**1. Spec coverage.**

| spec section | task |
| --- | --- |
| Vite grouping A, B, C into one file | Tasks 1, 2 |
| Group D (react) kept separate, coupling-map row | Task 3 |
| Group E (node bins) | Task 4 |
| Group F (elements), the `emptyOutDir` ordering, the lazy manifest read | Task 5 |
| Group G (pages), three roots | Task 6 |
| The `build` and `build:elements` rewrites | Tasks 1 to 6, incrementally, one link at a time |
| Byte-identity as the acceptance criterion | Tasks 1, 2, 3, 4, 5, 6, 7 |
| `tsconfig.tests.json` include widening | Task 1, watched fail in Step 4 |
| Playwright, three files by port conflict | Tasks 8, 9, 10 |
| `KAI_SB_PORT` replacing the private 6018 | Task 8 |
| `globalSetup` widening | Task 9 |
| The gate id rename and why the script spelling wins | Task 9 |
| The caller inventory (25 comment references, docs, skill files) | Tasks 4, 7, 8, 9, 10 |
| The do-not-sed trap | Global Constraints, Task 7 Step 4 |
| Verification plan | Tasks 7 and 10 Step 6 |

No gap.

**2. Placeholder scan.** Every config file is given in full. The one instruction that points at content rather than reproducing it is Task 2 Step 2, moving the SSR-twin header comments, and it names the exact file and line range for each plus the `git show` recovery command. Reproducing 500 lines of unchanged prose in a plan would make the plan worse without making the task clearer.

**3. Type consistency.** `Target` is defined in Task 1 with the four fields Task 2 uses. `config/vite/node.ts` deliberately declares its OWN `Target` (fields `entry`, `out`, `external`) because a `build.ssr` bundle has no `fileName` or `transform`; the two interfaces are local to their files and never cross. `KAI_BUILD` is the selector in `lib.ts`, `node.ts`, `elements.ts` and `page.ts`, and `react.ts` deliberately has none. `PKG = resolve(__dirname, '../..')` is spelled identically in all five vite files and both new playwright files that need it. Project names in Task 8's config exactly match the `--project=` values in Task 8 Step 3, and Task 9's four match Task 9 Step 3.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-01-ui-config-consolidation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
