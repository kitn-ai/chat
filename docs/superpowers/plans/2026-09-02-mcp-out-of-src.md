# MCP out of `src/`: `packages/ui/src/agent-tooling` becomes `packages/ui/mcp` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `kai` MCP + construct engine out of the shipped library's source tree, from `packages/ui/src/agent-tooling/` to `packages/ui/mcp/`, with the published npm tarball unchanged apart from three enumerated comment lines.

**Architecture:** A pure relocation inside `packages/ui`. No new npm package, no new public export, no change to `bin/mcp.js`, `release-please-config.json` or the publish loop. The directory keeps its internal shape, so every path literal in the repo changes by one prefix substitution (`src/agent-tooling/` becomes `mcp/`), which is what makes the rewrite auditable. Declarations keep emitting to `dist/agent-tooling/` via the dts plugin's `entryRoot`/`outDir` pair, so `exports["./construct"].types` and `typesVersions` are untouched.

**Tech Stack:** pnpm + NX workspace, Vite 8 (`config/vite/{lib,node,elements,page,react}.ts`, target selected by `KAI_BUILD`), vite-plugin-dts 4.5.4, vitest 3 (projects `unit` / `emitted` / `storybook`), tsc (seven passes chained in `packages/ui`'s `typecheck` script), GitHub Actions `test` aggregator over five legs.

**Spec:** `docs/superpowers/specs/2026-09-01-repo-restructure-design.md` (Step 2 and the "Owner eval of Step 1 and the ruled target map" section). Supporting research: `docs/superpowers/research/2026-09-01-mcp-extraction-surface.md`, whose section 3 enumerates the plumbing and whose Corrections section enumerates the self-referencing literals.

---

## Global Constraints

- Branch: `feat/mcp-out-of-src`, cut from `main`. Do not work in the current checkout's branch; another agent owns it.
- The published tarball must be unchanged except for exactly three comment lines, enumerated in Task 1's baseline and re-checked in Task 13. The `npm pack --dry-run --json` file list must be identical, name for name.
- No public export changes. `package.json` `exports`, `typesVersions`, `bin` and `files` are not edited by this plan.
- The four emitter files write consumer-project source (including `vite.config.ts` strings) and must never be touched by a `sed`: `mcp/construct/codegen.ts`, `mcp/mcp/tools/scaffold.ts`, `mcp/mcp/tools/debug.ts`, `mcp/route-emit.ts`. Their two required edits are made by hand, by line, in Task 4.
- `verify:quarantine` stays FIRST in `packages/ui`'s `typecheck` script. Do not reorder the `&&` chain.
- macOS `sed` needs the empty backup argument: `sed -i '' -E`.
- No em dashes and no emoji in any prose this plan adds to the tree.
- Scratchpad paths are for scratch only. A scratchpad path must never appear in a committed file.
- When a cold build is needed run `cd packages/ui && npm run build`, not `nx build ui`. Never pipe a build through `tail` inside an `&&` chain; the exit status is then the pipe's.
- Every commit ends with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

- `docs/superpowers/**` is scanned by `node packages/ui/scripts/lint-gate-parity.mjs` and `node packages/ui/scripts/lint-threshold-derivation.mjs`. Any fenced block or table in a doc you add that looks like a merge-gate enumeration needs `<!-- gate-list: partial -- <reason> -->` above it, and any numeric threshold in prose needs a backticked producing command, the literal phrase `ratchet, not a target`, or `lint-thresholds: waive -- <reason>`.

---

## Rulings this plan makes (the research left these open)

**1. Tests move.** `packages/ui/tests/agent-tooling/**` moves to `packages/ui/mcp/tests/**`. The emitted-project contract does not make this expensive: `packages/ui/emitted-code-tests.ts` derives the include glob and the `unit` project's mirrored exclude from ONE exported constant, `EMITTED_CODE_TEST_DIR`, so the move is a single string plus two doc lines. The `unit` project declares no `include`, so vitest's default collection picks the new location up with no config edit, and `emitted-project-wiring.test.ts` asserts a CI step name rather than a path, so the workflow line does not move. Against that: the owner ruled "tests alongside", and the mcp's own unit tests are already co-located inside the tree, so leaving these eight files behind would split one suite across two homes for no gain.

**2. The emitted `.d.ts` path stays `dist/agent-tooling/...`.** Renaming it to `dist/mcp/...` would change `exports["./construct"].types`, `typesVersions`, and `tests/scripts/construct-export-smoke.test.ts:44`, all of which are consumer-visible. Holding it fixed costs two lines per construct target (`entryRoot: 'mcp'`, `outDir: 'dist/agent-tooling'`) and buys the strongest gate available: a byte diff of `dist/`.

**3. The tsconfig partition is translated, not redrawn.** `tsconfig.mcp.json` keeps its Node-only body and narrows to `include: ["mcp/mcp/**/*.ts"]`, which is the SAME file set it checks today. It does NOT become `include: ["mcp/**/*.ts"]`: `mcp/catalog/surfaces.test.ts` side-effect-imports nine DOM elements and `mcp/construct/codegen-cards.render.test.tsx` is Solid JSX, so a Node-only, DOM-free, JSX-free pass over the whole folder goes red on files it was never meant to see. The rest of the folder stays in the browser-targeted pass, which is where it is today: `tsconfig.json` gains `mcp/**` to its `include` and swaps its `src/agent-tooling/mcp` exclude for `mcp/mcp` plus `mcp/tests`. Net effect: every file is checked by exactly the pass that checks it today.

Two consequences worth stating because the research assumed the opposite. `tsconfig.mcp.json`'s dist-first `paths` trick keeps working, so the "green on an unbuilt tree" property the research called the move's most under-appreciated regression is NOT lost here; it was a cost of `packages/mcp`, not of leaving `src/`. And `verify:quarantine`'s reason for running first still holds, because the MCP pass is still in this package's chain.

**4. Inner directory name.** The moved tree keeps its internal shape, so the MCP server lands at `packages/ui/mcp/mcp/`. Renaming the inner `mcp/` (to `server/`, say) would add churn to `create-kai`'s `bundleGraphProblem`, to `tsconfig.mcp.json` and to a dozen comments, for a cosmetic gain. Keep it.

## What the current tree says that the research does not

- **A 38th plumbing site, and it is the one that can break consumers.** Four SHIPPED declaration files import across the boundary by a relative path that only resolves because `src/agent-tooling` and `dist/agent-tooling` sit at the same depth: `dist/components/{construct-form-paths,builder-panel-derived,builder-start,builder-panel}.d.ts` each carry `from '../agent-tooling/construct/*.js'`. Move the source out of `src/` and the source specifier becomes `'../../mcp/construct/schema'`, which tsc emits verbatim into `dist/components/*.d.ts`, where it points outside `dist/` at a directory the tarball does not ship. Task 5 fixes this with a `beforeWriteFile` hook on the barrel dts target that rewrites the specifier back and throws if it fires anywhere unexpected.
- The vite configs moved. There are no longer 22 config files; `config/vite/node.ts` holds the `mcp` and `construct-cli` targets and `config/vite/lib.ts` holds `construct` and `construct-templates`, all selected by `KAI_BUILD`. The research's `vite.config.*.ts` line numbers are dead.
- `config/vite/lib.ts`'s construct target carries a comment claiming `schema.d.ts`'s relative import of `url-scheme-policy` resolves against the barrel build's earlier emit. It does not: `isSafeUrl` is used inside a `.refine()` and appears in no emitted declaration. `grep -n "url-scheme" dist/agent-tooling/construct/*.d.ts` returns nothing. The comment is decorative and should be corrected while the file is open.
- CI names `agent-tooling` in only two places now (`.github/workflows/test.yml:501` cache key, `:577` a comment), not five. The research's `:622`, `:633`, `:741`, `:395`, `:827-830` line numbers are all dead.
- `apps/docs/public/kitn/` is a gitignored copy of built kit output (`scripts/lint-cdn-pins.mjs:153` skips it). Its `agent-tooling` mention is not a site.

---

## File Structure

Created:

- `packages/ui/mcp/` (from `git mv packages/ui/src/agent-tooling packages/ui/mcp`), holding `archetypes.ts`, `registry.ts`, `route-emit.ts`, `types.ts`, `registry.test.ts`, `types.test.ts`, `README.md`, and `blocks/`, `catalog/`, `construct/`, `integrations/`, `mcp/`, `recipes/`.
- `packages/ui/mcp/tests/` (from `git mv packages/ui/tests/agent-tooling packages/ui/mcp/tests`), holding the five `*.live.test.ts` emitted-code guards plus `blocks-registry.test.ts`, `route-emit-guards.test.ts`, `emitted-project-wiring.test.ts`.

Modified (grouped by the task that owns them):

| Task | Files |
|---|---|
| 2 | `packages/ui/tsconfig.json`, `packages/ui/tsconfig.tests.json` |
| 3 | the 9 sed-rewritable files under the moved tree, plus the outbound importers in `packages/ui/src`, `packages/ui/apps`, `packages/ui/tests`, `packages/create-kai`, `examples/` |
| 4 | `mcp/mcp/tools/scaffold.ts`, `mcp/mcp/tools/theme.ts`, and the 10 depth-hop literals |
| 5 | `packages/ui/config/vite/node.ts`, `packages/ui/config/vite/lib.ts`, `packages/ui/tsconfig.mcp.json` |
| 6 | `mcp/mcp/manifest.ts`, `mcp/mcp/manifest.test.ts`, `mcp/construct/local-kit.ts`, `mcp/construct/local-kit.test.ts`, `mcp/mcp/server.test.ts`, `mcp/catalog/surfaces.ts` |
| 7 | `packages/ui/scripts/gen-{catalog,blocks,construct-schema,construct-template-fixtures,llms-programmatic}.mjs` |
| 8 | `packages/ui/scripts/verify-{generated-sync,artifact-fresh,scaffold-compiles,construct,blocks,pack-weight,solid-coverage}.mjs`, `lint-catalog-drift.mjs`, `acceptance-{pack,eval}.mjs`, `lib/{import-catalog,element-meta-keys}.mjs`, `lint-gate-parity.mjs` |
| 9 | `packages/ui/tests/styles/shadow-sheet-scan.test.ts`, `packages/ui/src/elements/slots.test.ts` |
| 10 | `packages/ui/emitted-code-tests.ts`, `packages/ui/tsconfig.tests.json`, `.github/workflows/test.yml` |
| 11 | `packages/create-kai/src/build-guards.ts`, `packages/create-kai/test/build-guards.test.ts`, `packages/create-kai/README.md`, `packages/create-kai/src/{catalog,blocks,react-form,routes,wizard}.ts`, `packages/create-kai/scripts/build.mjs`, `packages/create-kai/test/{wizard,publish-shape}.test.ts` |
| 12 | `CLAUDE.md`, `docs/coupling-map.md`, `.coderabbit.yaml`, `packages/ui/theme.css`, `packages/ui/src/elements/styles.css`, and the comment-only sites listed in that task |

---

### Task 1: Baseline

**Files:**
- Create: nothing in the repo. All baseline artifacts go under a scratch directory and are NEVER committed.

**Interfaces:**
- Produces: `$BASE/dist-baseline/` (a full copy of `packages/ui/dist`), `$BASE/pack-baseline.json`, `$BASE/gates-baseline.txt`. Later tasks diff against these.

- [ ] **Step 1: Cut the branch**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git fetch origin
git checkout -b feat/mcp-out-of-src origin/main
```

- [ ] **Step 2: Install and build cold**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm install
cd packages/ui && npm run build:css && npm run build
```

Expected: the build exits 0. If it does not, stop; a red baseline makes every later diff meaningless.

- [ ] **Step 3: Capture the dist and pack baselines**

Pick a scratch directory outside the repo and export it as `BASE` for the rest of this plan.

```bash
export BASE="$(mktemp -d)"
echo "baseline dir: $BASE"
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
cp -R dist "$BASE/dist-baseline"
npm pack --dry-run --json > "$BASE/pack-baseline.json"
node -e "const f=require(process.env.BASE+'/pack-baseline.json')[0].files.map(x=>x.path).sort();require('fs').writeFileSync(process.env.BASE+'/pack-files-baseline.txt',f.join('\n')+'\n')"
wc -l "$BASE/pack-files-baseline.txt"
```

- [ ] **Step 4: Capture the gate-parity baseline**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/scripts/lint-gate-parity.mjs --list > "$BASE/gates-baseline.txt"
wc -l "$BASE/gates-baseline.txt"
```

- [ ] **Step 5: Record the reference sites, so the rewrite can be proved exhaustive**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git grep -n "agent-tooling" -- . ':!docs/superpowers/research' ':!docs/superpowers/plans' ':!docs/superpowers/specs' > "$BASE/sites-baseline.txt"
wc -l "$BASE/sites-baseline.txt"
```

- [ ] **Step 6: Confirm the 38th site is real before relying on the fix**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
grep -rn "agent-tooling" dist/components/*.d.ts
```

Expected: four lines, in `builder-panel-derived.d.ts` (two), `builder-start.d.ts` (one), `construct-form-paths.d.ts` (one), each of the form `from '../agent-tooling/construct/<name>.js'`. Also expected: `grep -rn "agent-tooling" dist --include='*.d.ts' | grep -v '^dist/agent-tooling/'` finds `dist/construct.d.ts` and `dist/construct-templates.d.ts` (the subpath shims, which derive their text from `package.json` and therefore need no edit) alongside those four.

No commit. Nothing changed.

---

### Task 2: Widen the tsconfig globs before anything moves

**Files:**
- Modify: `packages/ui/tsconfig.json:18-19`
- Modify: `packages/ui/tsconfig.tests.json` (the `include` array)

**Interfaces:**
- Produces: a tree where `mcp/**` and `mcp/tests/**` are already claimed by a typecheck pass, so Task 3's `git mv` cannot land files in an unchecked hole.

These edits match zero files today. That is the point: they are a no-op that becomes load-bearing one commit later.

- [ ] **Step 1: Widen `tsconfig.json`**

Replace the `include` and `exclude` arrays. Current:

```json
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "frameworks", "src/agent-tooling/mcp"]
```

New:

```json
  "include": ["src/**/*.ts", "src/**/*.tsx", "mcp/**/*.ts", "mcp/**/*.tsx"],
  "exclude": ["node_modules", "dist", "frameworks", "src/agent-tooling/mcp", "mcp/mcp", "mcp/tests"]
```

The `src/agent-tooling/mcp` entry stays for exactly one commit and is deleted in Task 5, so that at no point is the Node-only tree covered twice.

- [ ] **Step 2: Widen `tsconfig.tests.json`**

Add `"mcp/tests/**/*.ts"` to the `include` array, after `"tests/**/*.tsx"`:

```json
  "include": ["tests/**/*.ts", "tests/**/*.tsx", "mcp/tests/**/*.ts", "*.ts", "config/**/*.ts", "src/elements/element-types.d.ts"],
```

- [ ] **Step 3: Prove the passes still agree**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui && npm run typecheck
```

Expected: exit 0, identical to the baseline. A glob matching nothing is not an error in tsc as long as at least one include glob matches.

- [ ] **Step 4: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/ui/tsconfig.json packages/ui/tsconfig.tests.json
git commit -m "$(cat <<'MSG'
chore(ui): tsconfig passes claim mcp/ before anything moves there

Two additive globs that match zero files today. They exist so the next
commit's `git mv` cannot land a file in a directory no typecheck pass
reads, which is how a tree goes green while checking less.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 3: The move, and every import specifier in the repo

**Files:**
- Move: `packages/ui/src/agent-tooling` to `packages/ui/mcp`
- Modify (inside the moved tree, by sed): `mcp/catalog/surfaces.test.ts`, `mcp/construct/codegen-cards.render.test.tsx`, `mcp/construct/mock-script.test.ts`, `mcp/construct/mock-script.ts`, `mcp/construct/schema.ts`, `mcp/construct/theme-token-policy.ts`, `mcp/mcp/manifest.ts`, `mcp/mcp/scaffold.test.ts`, `mcp/mcp/reference.test.ts`
- Modify (outside, by sed): `packages/ui/src/components/{builder-start.tsx,builder-start.test.tsx,builder-panel-derived.tsx,builder-panel-derived.test.tsx,construct-form-paths.ts,construct-form-paths.test.ts}`, `packages/ui/src/elements/builder-derived-panel.stories.tsx`, `packages/ui/apps/builder/{App.tsx,HomeScreen.tsx,edit-guard.ts,edit-guard.test.ts}`, `packages/ui/apps/gallery/{main.tsx,GalleryPage.tsx,GalleryPage.stories.tsx}`, `packages/ui/tests/agent-tooling/*.ts`, `packages/ui/tests/scripts/*.ts`, `packages/create-kai/src/{catalog,blocks,react-form}.ts`, `packages/create-kai/test/add.test.ts`, `examples/internal/openrouter-spike/harness/emit-gateway-route.mjs`

**Interfaces:**
- Consumes: Task 2's widened globs.
- Produces: a tree where every module specifier resolves. `tsc` is the test.

The arithmetic that makes the inbound rewrite safe: the move deletes one path segment (`src/agent-tooling` becomes `mcp`) and the targets gain one (`src/`). At depth 2 inside the moved tree those cancel, so `'../../elements/x'` becomes `'../../src/elements/x'` with the same number of `../`. The two files that do NOT target `src/` (a package-root `theme.css` and the dist walk) lose one `../` instead, and are handled by hand in Task 4.

- [ ] **Step 1: Move the directory**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git mv packages/ui/src/agent-tooling packages/ui/mcp
git status --porcelain | head -5
```

- [ ] **Step 2: Rewrite the nine depth-2 escaping imports**

Depth 2 means `mcp/<dir>/<file>`, where `'../../X'` always leaves the moved tree. The file list is explicit rather than globbed so that none of the four emitter files can be reached, and so that a tenth file appearing later fails the verification grep in Step 6 instead of being silently rewritten.

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
sed -i '' -E "s#from '\.\./\.\./(elements|components|primitives|state|ui|wire|themes|types)(/|')#from '../../src/\1\2#g" \
  mcp/catalog/surfaces.test.ts \
  mcp/construct/codegen-cards.render.test.tsx \
  mcp/construct/mock-script.test.ts \
  mcp/construct/mock-script.ts \
  mcp/construct/schema.ts \
  mcp/construct/theme-token-policy.ts \
  mcp/mcp/manifest.ts \
  mcp/mcp/scaffold.test.ts \
  mcp/mcp/reference.test.ts
sed -i '' -E "s#^import '\.\./\.\./(elements)/#import '../../src/\1/#g" mcp/catalog/surfaces.test.ts
```

The second `sed` covers `surfaces.test.ts`'s nine side-effect imports, which have no `from` keyword.

- [ ] **Step 3: Verify the inbound rewrite hit everything and nothing else**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
grep -rnE "'\.\./\.\./(elements|components|primitives|state|ui|wire|themes|types)(/|')" mcp/
```

Expected: no output. Then:

```bash
grep -rn "'\.\./\.\./src/" mcp/ | wc -l
```

Expected: 22 lines (13 in `catalog/surfaces.test.ts`, 2 in `construct/codegen-cards.render.test.tsx`, 1 in `construct/mock-script.test.ts`, 1 in `construct/mock-script.ts`, 3 in `construct/schema.ts`, 1 in `construct/theme-token-policy.ts`, 1 in `mcp/manifest.ts`; plus `mcp/scaffold.test.ts` 3 and `mcp/reference.test.ts` 1 gives 26 total, so read the per-file breakdown from `grep -rc "'\.\./\.\./src/" mcp/` rather than trusting a single figure here).

- [ ] **Step 4: Rewrite the outbound importers in `packages/ui/src` and `packages/ui/src/elements`**

These sit one level under `src/`, so `'../agent-tooling/X'` becomes `'../../mcp/X'`.

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
sed -i '' -E "s#'\.\./agent-tooling/#'../../mcp/#g" \
  src/components/builder-start.tsx \
  src/components/builder-start.test.tsx \
  src/components/builder-panel-derived.tsx \
  src/components/builder-panel-derived.test.tsx \
  src/components/construct-form-paths.ts \
  src/components/construct-form-paths.test.ts \
  src/elements/builder-derived-panel.stories.tsx
```

- [ ] **Step 5: Rewrite the remaining outbound importers**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
grep -rl "src/agent-tooling" \
  packages/ui/apps packages/ui/tests \
  packages/create-kai/src packages/create-kai/test \
  examples/internal/openrouter-spike/harness \
  --include='*.ts' --include='*.tsx' --include='*.mjs' \
  | xargs sed -i '' -E "s#src/agent-tooling/#mcp/#g; s#'src', 'agent-tooling', #'mcp', #g"
```

Then fix the one `examples/` site that uses a `join` argument list rather than a slash path:

```bash
grep -n "scaffold.ts" examples/internal/openrouter-spike/harness/emit-gateway-route.mjs
```

Expected after the sed: `entryPoints: [join(UI, 'mcp', 'mcp', 'tools', 'scaffold.ts')],`. If the sed did not produce that, edit the line by hand to exactly that text.

- [ ] **Step 6: Prove no live code still names the old path**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git grep -n "src/agent-tooling" -- packages examples | grep -vE "\.md:|^\S+: *\*|^\S+: *//" 
```

Expected: only the `packages/ui/tsconfig.json` exclude entry that Task 5 deletes, plus `packages/ui/scripts/**` and `.github/workflows/test.yml:501`, which Tasks 7, 8 and 10 own. No `import`, `from`, `join(` or `resolve(` line may remain.

- [ ] **Step 7: Typecheck both packages**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui && npm run typecheck
npm run typecheck
```

Expected: both exit 0. `tsconfig.mcp.json` still names the old path at this point and therefore includes nothing, which tsc accepts; Task 5 repairs it and Task 5's typecheck run is what proves the Node-only pass is reading files again.

- [ ] **Step 8: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A
git commit -m "$(cat <<'MSG'
refactor(ui): src/agent-tooling moves to packages/ui/mcp

The kai MCP and the construct engine leave the shipped library's source
tree. The directory keeps its internal shape, so every path literal in
the repo changes by one prefix: src/agent-tooling/ becomes mcp/.

Inbound relative imports gain a src/ segment and keep their ../ count,
because the move drops one segment from the source side and the targets
gain one on the other. Outbound importers in src/components, apps/,
tests/, create-kai and examples/ are rewritten to match.

Build wiring, scripts, guards and the self-referencing path literals
follow in their own commits.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 4: The two hand edits and the ten depth hops

**Files:**
- Modify: `packages/ui/mcp/mcp/tools/scaffold.ts:23`, `packages/ui/mcp/mcp/tools/theme.ts:2`
- Modify: `packages/ui/mcp/catalog/invariants.test.ts:10`, `packages/ui/mcp/catalog/surfaces.test.ts:46`, `packages/ui/mcp/construct/cli.test.ts:41`, `packages/ui/mcp/construct/local-kit.test.ts:16`, `packages/ui/mcp/construct/schema-artifact.test.ts:25`, `packages/ui/mcp/mcp/manifest.test.ts:39`, `packages/ui/mcp/mcp/server.test.ts:14`, `packages/ui/mcp/mcp/reference.test.ts:176-177`, `packages/ui/mcp/mcp/theme.test.ts:130-136`

**Interfaces:**
- Consumes: the moved tree from Task 3.
- Produces: every `import.meta.url` / `__dirname` hop inside the moved tree points where it did before. `mcp/construct/dev.ts` and `mcp/construct/local-kit.ts` are deliberately NOT in this list: both walk up until they find a `package.json`, so they are depth-agnostic by construction.

- [ ] **Step 1: Watch the depth hops fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm exec vitest run --project=unit mcp/mcp/manifest.test.ts mcp/mcp/server.test.ts mcp/mcp/theme.test.ts mcp/catalog/invariants.test.ts mcp/construct/schema-artifact.test.ts
```

Expected: FAIL. The failures name paths with a stray extra `..` in them. Record which files fail; they must all pass by Step 6.

- [ ] **Step 2: The two hand edits inside the emitter-adjacent files**

`mcp/mcp/tools/scaffold.ts` is an emitter file. Change ONLY line 23, by hand:

```ts
import { encodableMediaTypes } from '../../../src/wire/media-types';
```

`mcp/mcp/tools/theme.ts` line 2 targets the package root, not `src/`, so it loses one `../`:

```ts
import themeCss from '../../../theme.css?raw';
```

- [ ] **Step 3: The package-root hops**

`mcp/catalog/invariants.test.ts:10`:

```ts
const PKG = join(__dirname, '..', '..');
```

`mcp/construct/cli.test.ts:41` and `mcp/construct/local-kit.test.ts:16` both become:

```ts
const PKG_ROOT = resolve(import.meta.dirname, '../..');
```

`mcp/mcp/manifest.test.ts:39` and `mcp/mcp/server.test.ts:14` both become:

```ts
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
```

`mcp/mcp/theme.test.ts:130-136` becomes:

```ts
  // mcp/mcp/ -> packages/ui/ (same walk as manifest.test.ts).
  const THEME_CSS_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'theme.css',
  );
```

- [ ] **Step 4: The hops that target `src/` or `dist/`**

`mcp/catalog/surfaces.test.ts:46`:

```ts
    const elDir = join(__dirname, '..', '..', 'src', 'elements');
```

`mcp/mcp/reference.test.ts:176-177` becomes:

```ts
      dirname(fileURLToPath(import.meta.url)),
      '../../dist/elements',
```

- [ ] **Step 5: The repo-root hop**

`mcp/construct/schema-artifact.test.ts:25`:

```ts
      resolve(__dirname, '../../../../apps/docs/public/schemas/construct/v1.json'),
```

- [ ] **Step 6: Watch them pass**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm exec vitest run --project=unit mcp/mcp/manifest.test.ts mcp/mcp/server.test.ts mcp/mcp/theme.test.ts mcp/catalog/invariants.test.ts mcp/construct/schema-artifact.test.ts mcp/construct/cli.test.ts mcp/construct/local-kit.test.ts mcp/mcp/reference.test.ts mcp/catalog/surfaces.test.ts
```

Expected: `manifest.test.ts` and `local-kit.test.ts` still FAIL. Those two carry the self-referencing FIXTURE literals that Task 6 owns; every other file in the list must now PASS. If any other file is still red, fix it here.

- [ ] **Step 7: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A
git commit -m "$(cat <<'MSG'
fix(mcp): the ten depth hops inside the moved tree

Every import.meta.url and __dirname walk that counted segments from
src/agent-tooling/. Hops that target src/ keep their ../ count and gain
a src/ segment; the two that target the package root or dist/ lose one
../ instead. dev.ts and local-kit.ts are untouched on purpose: both walk
up to a package.json and never counted depth.

The two edits inside emitter-adjacent files (tools/scaffold.ts line 23,
tools/theme.ts line 2) are made by hand, never by sed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 5: Build wiring, and the emitted declarations that must not move

**Files:**
- Modify: `packages/ui/config/vite/node.ts:51,60`
- Modify: `packages/ui/config/vite/lib.ts:121, 398, 410-411, 416, 435, 441-443, 448-456, 484, 489-490` and the two `dts` blocks
- Modify: `packages/ui/tsconfig.mcp.json:2,50`
- Modify: `packages/ui/tsconfig.json` (drop the stale exclude entry)

**Interfaces:**
- Consumes: the moved tree.
- Produces: `packages/ui/dist` byte-identical to `$BASE/dist-baseline` apart from two comment lines in `dist/agent-tooling/blocks/registry.d.ts` that Task 12 introduces later. At the end of THIS task the diff must be empty.

- [ ] **Step 1: Repoint the two node targets**

In `config/vite/node.ts`, line 51:

```ts
    entry: 'mcp/mcp/stdio.ts',
```

line 60:

```ts
    entry: 'mcp/construct/cli-entry.ts',
```

- [ ] **Step 2: Drop the barrel dts exclude that would now lie**

In `config/vite/lib.ts`, delete line 121 (`        'src/agent-tooling/**',`) from the `index` target's `dts.exclude`. The `dts.include` on that target is `['src/**/*.ts', 'src/**/*.tsx']`, so the moved tree cannot enter the barrel emit any more and the exclude is a rule that can never fire.

- [ ] **Step 3: Repoint the construct target and pin its output path**

In `config/vite/lib.ts`, the `construct` target becomes:

```ts
  construct: {
    entry: 'mcp/construct/public.ts',
    fileName: 'construct.js',
    transform: 'none',
    external: ['zod'],
    dts: {
      include: [
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
      // outDir + entryRoot, not outDir alone. vite-plugin-dts writes each file
      // to resolve(outDir, relative(entryRoot, emittedPath)), so this pair is
      // what keeps declarations landing at dist/agent-tooling/construct/... now
      // that the source is at mcp/construct/. That path is NOT cosmetic: it is
      // the literal value of exports["./construct"].types and of the
      // typesVersions entry, both pinned by
      // tests/scripts/construct-export-smoke.test.ts. Changing it is a
      // consumer-visible change; holding it is free.
      outDir: 'dist/agent-tooling',
      entryRoot: 'mcp',
    },
  },
```

- [ ] **Step 4: Repoint the construct-templates target the same way**

```ts
  'construct-templates': {
    entry: 'mcp/construct/templates.ts',
    fileName: 'construct-templates.js',
    transform: 'none',
    dts: {
      include: [
        'mcp/construct/templates.ts',
        'mcp/construct/schema-url.ts',
      ],
      // Same outDir/entryRoot pair as the construct target above; read its
      // comment. exports["./construct/templates"].types names
      // dist/agent-tooling/construct/templates.d.ts.
      outDir: 'dist/agent-tooling',
      entryRoot: 'mcp',
    },
  },
```

- [ ] **Step 5: Correct the construct target's stale prose while the file is open**

The header paragraph currently claims `schema.d.ts`'s relative import of `url-scheme-policy` resolves against a declaration the barrel build emitted earlier. Replace that paragraph (`config/vite/lib.ts`, the block ending "resolves to that existing file.") with:

```
  // url-scheme-policy.ts is NOT in `include`, and does not need to be: schema.ts
  // imports isSafeUrl for a runtime .refine() only, so no emitted declaration
  // references it. Checked, not assumed:
  //   grep -n "url-scheme" dist/agent-tooling/construct/*.d.ts
  // returns nothing. An earlier version of this comment claimed the emit relied
  // on the barrel build having produced dist/primitives/url-scheme-policy.d.ts
  // first; it does not, and that claim would have made this move look blocked.
```

- [ ] **Step 6: Add the `beforeWriteFile` hook that keeps the four shipped declarations resolvable**

This is the 38th plumbing site. `src/components/{construct-form-paths,builder-panel-derived,builder-start,builder-panel}.ts(x)` import the construct schema and templates, and tsc emits their specifiers verbatim into `dist/components/*.d.ts`. Today `'../agent-tooling/construct/schema'` happens to resolve under `dist/` because source and output sat at matching depths. After the move the source says `'../../mcp/construct/schema'`, which from `dist/components/` points outside `dist/` at a directory the tarball does not ship.

Add this to the `index` target's `dts` block in `config/vite/lib.ts`, alongside its existing `include`/`exclude`:

```ts
      // THE ONE PLACE THE MOVE IS NOT A PURE RELOCATION.
      //
      // Four SHIPPED declarations under dist/components/ import the construct
      // schema and the template registry across the boundary by a relative
      // path. That worked for free while the source lived at
      // src/agent-tooling/: src/components -> ../agent-tooling and
      // dist/components -> ../agent-tooling are the same string. With the
      // source at mcp/, the source specifier is '../../mcp/construct/schema'
      // and tsc emits it verbatim, where from dist/components/ it points
      // outside dist/ at a directory `files` does not ship. A consumer's tsc
      // then cannot resolve Construct, and NOTHING else in the build would say
      // so -- the emit succeeds and the bytes look plausible.
      //
      // The declarations for those targets ARE emitted, by the construct target
      // below, at dist/agent-tooling/construct/. So the fix is to rewrite the
      // specifier back to the path that already exists.
      //
      // It THROWS rather than no-ops on an unexpected shape, because the
      // rewrite is depth-sensitive: every affected file today sits exactly one
      // directory under dist/, so '../../mcp/' maps to '../agent-tooling/'. A
      // future importer at another depth must fail loudly here instead of
      // silently emitting a path that resolves to nothing.
      beforeWriteFile(filePath: string, content: string) {
        if (!content.includes("/mcp/")) return;
        const rel = relative(resolve(PKG, 'dist'), filePath);
        const depth = rel.split(/[\\/]/).length - 1;
        if (depth !== 1) {
          throw new Error(
            `config/vite/lib.ts: ${rel} imports across the mcp/ boundary from depth ${depth}. ` +
              `The rewrite below only knows depth 1 (dist/<dir>/<file>.d.ts). Teach it the new ` +
              `depth or stop importing mcp/ from that file.`,
          );
        }
        return { content: content.replaceAll("'../../mcp/", "'../agent-tooling/") };
      },
```

Add `relative` to the existing `node:path` import at the top of `config/vite/lib.ts` if it is not already imported, and confirm `PKG` is the package-root constant that file already defines for `build.lib.entry`.

- [ ] **Step 7: Repoint `tsconfig.mcp.json`**

Line 2, the `comment` field, first sentence becomes:

```
"comment": "Typechecks the Node MCP server under mcp/mcp/. Separate from the browser-targeted tsconfig.json -- the MCP emits HTML as strings and has no DOM dependencies. The rest of mcp/ (construct, catalog, blocks, integrations, recipes and the leaf modules at its root) stays in tsconfig.json's browser pass, which is where it was before the 2026-09-02 move: catalog/surfaces.test.ts side-effect-imports nine DOM elements and construct/codegen-cards.render.test.tsx is Solid JSX, so widening this include to mcp/** would go red on files it was never meant to see.",
```

Line 50:

```json
  "include": ["mcp/mcp/**/*.ts"]
```

The `paths` block is unchanged. Leave its comment alone: the dist-first ordering and the unbuilt-tree fallback both still hold, because `./src/schemas/index` is still a sibling of this config.

- [ ] **Step 8: Delete the now-dead exclude in `tsconfig.json`**

`exclude` becomes:

```json
  "exclude": ["node_modules", "dist", "frameworks", "mcp/mcp", "mcp/tests"]
```

- [ ] **Step 9: Prove the Node-only pass is reading files again**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npx tsc --noEmit -p tsconfig.mcp.json --listFiles | grep -c "/packages/ui/mcp/mcp/"
```

Expected: a non-zero count. A pass whose include matches nothing exits 0 and proves nothing, which is exactly the failure this repo keeps paying for.

- [ ] **Step 10: Full typecheck**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 11: Rebuild cold and diff `dist` byte for byte**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
rm -rf dist
npm run build
diff -r "$BASE/dist-baseline" dist
```

Expected: NO output. Any difference at all is a real finding; fix it here rather than allowing it. In particular re-check:

```bash
grep -rn "mcp/" dist/components/*.d.ts
grep -rn "agent-tooling" dist/components/*.d.ts
```

Expected: the first returns nothing, the second returns the same four lines Task 1 Step 6 recorded.

- [ ] **Step 12: Diff the pack file list**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npm pack --dry-run --json > "$BASE/pack-after-task5.json"
node -e "const f=require(process.env.BASE+'/pack-after-task5.json')[0].files.map(x=>x.path).sort();require('fs').writeFileSync(process.env.BASE+'/pack-files-after-task5.txt',f.join('\n')+'\n')"
diff "$BASE/pack-files-baseline.txt" "$BASE/pack-files-after-task5.txt"
```

Expected: no output.

- [ ] **Step 13: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A
git commit -m "$(cat <<'MSG'
build(ui): the vite targets and tsconfig passes follow the mcp move

config/vite/node.ts's two entries and config/vite/lib.ts's construct and
construct-templates entries repoint at mcp/. Both construct targets gain
outDir: 'dist/agent-tooling' + entryRoot: 'mcp', which is what keeps the
emitted declarations landing where exports["./construct"].types and
typesVersions already name -- holding a consumer-visible path fixed for
two lines of config.

The barrel target gains a beforeWriteFile hook, because four SHIPPED
declarations under dist/components/ import the construct schema by a
relative path that only resolved while source and output sat at matching
depths. The hook rewrites the specifier back and THROWS on any importer
at an unexpected depth rather than emitting a path that resolves to
nothing.

tsconfig.mcp.json narrows to mcp/mcp/** (the same file set as before) and
tsconfig.json owns the rest. Its dist-first paths trick and its
unbuilt-tree fallback both survive, because mcp/ is still a sibling of
src/ inside one package.

diff -r against a pre-move dist is empty and the npm pack file list is
unchanged.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 6: The twelve self-referencing path literals

**Files:**
- Modify: `packages/ui/mcp/mcp/manifest.ts:141-147, 185-190`
- Modify: `packages/ui/mcp/mcp/manifest.test.ts:83,112,123,137`
- Modify: `packages/ui/mcp/construct/local-kit.ts:139-165`
- Modify: `packages/ui/mcp/construct/local-kit.test.ts:39,45,66,179`
- Modify: `packages/ui/mcp/mcp/server.test.ts:58`
- Modify: `packages/ui/mcp/catalog/surfaces.ts:215,316,317`

**Interfaces:**
- Consumes: the moved tree.
- Produces: `resolveManifestPath()` resolving from the new depth; `isSourceCheckout()` sniffing a marker that exists in a checkout and not in an install; catalog corpus paths that `lint:catalog-drift` can resolve.

These are the sites no outbound search finds, because they are strings about this tree written inside this tree.

- [ ] **Step 1: Watch the two suites fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm exec vitest run --project=unit mcp/mcp/manifest.test.ts mcp/construct/local-kit.test.ts mcp/mcp/server.test.ts
```

Expected: FAIL in all three. Record the assertion messages.

- [ ] **Step 2: Fix the manifest hop and its error text**

`mcp/mcp/manifest.ts`, the `SOURCE_TO_PACKAGE_ROOT` block:

```ts
/**
 * `<package>/mcp/mcp` -> `<package>`. A fixed, exact hop, and it is CHECKED
 * below rather than trusted: if this module is ever moved to a different depth
 * the derived root stops being this package and resolution throws, instead of
 * silently addressing whatever directory happens to sit two levels up.
 */
const SOURCE_TO_PACKAGE_ROOT = ['..', '..'] as const;
```

and in the `isThisPackage` failure message, the sentence naming the expected home:

```ts
        `This module must live at <package>/mcp/mcp/ (or be bundled beside ` +
```

- [ ] **Step 3: Fix the manifest fixture trees**

In `mcp/mcp/manifest.test.ts`, all four occurrences:

```ts
      const origin = join(root, 'pkg', 'mcp', 'mcp');
```

(with `'other'` and `'nowhere'` in place of `'pkg'` at lines 112 and 123 respectively, matching what is there now).

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
sed -i '' -E "s#'src', 'agent-tooling', 'mcp'#'mcp', 'mcp'#g" mcp/mcp/manifest.test.ts
grep -n "'mcp', 'mcp'" mcp/mcp/manifest.test.ts
```

Expected: four lines.

- [ ] **Step 4: Fix the source-checkout marker**

`mcp/construct/local-kit.ts`, `isSourceCheckout` and the paragraph above it. The marker file:

```ts
export function isSourceCheckout(pkgRoot: string): boolean {
  return (
    existsSync(join(pkgRoot, 'mcp', 'construct', 'cli.ts')) &&
    existsSync(join(pkgRoot, '..', '..', 'pnpm-workspace.yaml'))
  );
}
```

and the first paragraph of its doc comment, which currently argues from `src/`:

```
 * `mcp/construct/cli.ts` -- the published tarball's `files` carries `dist`,
 * `bin`, `frameworks`, the stylesheets and exactly TWO json files under
 * src/elements. `mcp/` is not in that list at all, so the whole directory is
 * absent from an install; this particular file is the one the CLI itself is
 * compiled from, so it cannot be deleted without deleting the thing being
 * detected. (Before the 2026-09-02 move the marker was
 * src/agent-tooling/construct/cli.ts and the argument was subtler, because an
 * install DOES have a src/.)
```

- [ ] **Step 5: Fix the local-kit fixtures**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
sed -i '' -E "s#'src', 'agent-tooling', 'construct'#'mcp', 'construct'#g" mcp/construct/local-kit.test.ts
sed -i '' -E "s#under src/agent-tooling#under mcp/#g" mcp/construct/local-kit.test.ts
grep -n "'mcp', 'construct'" mcp/construct/local-kit.test.ts
```

Expected: three lines (39, 66, 179).

- [ ] **Step 6: Fix the server source read**

`mcp/mcp/server.test.ts:58`:

```ts
    const source = readFileSync(join(packageRoot, 'mcp/mcp/server.ts'), 'utf-8')
```

- [ ] **Step 7: Fix the catalog corpus paths**

`mcp/catalog/surfaces.ts` lines 215, 316, 317:

```ts
      'packages/ui/mcp/catalog/surfaces.test.ts',
```

```ts
      'packages/ui/mcp/recipes/composed-thread.ts',
      'packages/ui/mcp/catalog/surfaces.test.ts',
```

- [ ] **Step 8: Watch them pass**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm exec vitest run --project=unit mcp/mcp/manifest.test.ts mcp/construct/local-kit.test.ts mcp/mcp/server.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A
git commit -m "$(cat <<'MSG'
fix(mcp): the twelve path literals the tree writes about itself

manifest.ts's fixed hop to the package root (now two levels, checked and
not trusted) and its fixture trees; local-kit.ts's source-checkout marker
and the three synthetic trees that plant it; server.test.ts's read of its
own source; and the three catalog corpus paths lint:catalog-drift
resolves against the tree.

No outbound search finds any of these -- they are strings about this tree
written inside it -- so each was watched failing before it was fixed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 7: The generators

**Files:**
- Modify: `packages/ui/scripts/gen-catalog.mjs:21,155,156`
- Modify: `packages/ui/scripts/gen-blocks.mjs:67,68`
- Modify: `packages/ui/scripts/gen-construct-schema.mjs:46,60`
- Modify: `packages/ui/scripts/gen-construct-template-fixtures.mjs:36,39`
- Modify: `packages/ui/scripts/gen-llms-programmatic.mjs:147,163`

**Interfaces:**
- Consumes: the moved tree.
- Produces: `build:api` writing byte-identical committed artifacts. `git status --porcelain` after a run is the test.

Every one of these joins a path onto a package-root constant (`ROOT` or `PKG_ROOT`), so the edit is the same prefix substitution the rest of the plan uses.

- [ ] **Step 1: Watch `build:api` fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui && npm run build:api
```

Expected: FAIL, naming a missing `src/agent-tooling/...` path.

- [ ] **Step 2: Rewrite the five generators**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
sed -i '' -E "s#src/agent-tooling/#mcp/#g" \
  scripts/gen-catalog.mjs \
  scripts/gen-blocks.mjs \
  scripts/gen-construct-schema.mjs \
  scripts/gen-construct-template-fixtures.mjs \
  scripts/gen-llms-programmatic.mjs
grep -rn "agent-tooling" scripts/gen-*.mjs
```

Expected after the sed: only `scripts/gen-llms.mjs`, whose two mentions are prose about `mcp/tools/reference.ts` and are handled in Task 12. If `gen-llms-programmatic.mjs`'s failure message at line 163 still reads `src/agent-tooling/route-emit.ts`, the sed already fixed it; confirm it now reads `mcp/route-emit.ts` so the message names a path that exists.

- [ ] **Step 3: Run the generators and prove the artifacts are unchanged**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui && npm run build:api
cd /Users/home/Projects/kitn-ai/kitn-chat && git status --porcelain
```

Expected: `git status --porcelain` shows ONLY the five `scripts/gen-*.mjs` files you just edited. If `mcp/catalog/derived.json`, `mcp/construct/construct.v1.schema.json`, `mcp/construct/fixtures/templates/*.json`, `llms.txt`, `llms-full.txt`, `src/elements/element-*.json`, `frameworks/react/index.tsx` or `docs/web-components.md` appears as modified, a generator's OUTPUT changed and that is a real finding. Read the diff before doing anything else.

- [ ] **Step 4: Do not run `gen-llms.mjs` standalone**

`build:api` reaches it through `gen-element-api.mjs`, which hands it a model it already parsed. Running the standalone generator silently rewrites `llms-full.txt` with less data. Nothing in this task should invoke it directly.

- [ ] **Step 5: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/ui/scripts
git commit -m "$(cat <<'MSG'
build(ui): the five build:api generators read mcp/ instead of src/agent-tooling/

gen-catalog, gen-blocks, gen-construct-schema,
gen-construct-template-fixtures and gen-llms-programmatic. Each joins the
path onto its own package-root constant, so the change is the one prefix.

Proved by running build:api and finding git status clean apart from the
scripts themselves: every committed derived artifact is byte-identical.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 8: The guards

**Files:**
- Modify: `packages/ui/scripts/verify-generated-sync.mjs:140,146,153-159,183`
- Modify: `packages/ui/scripts/verify-artifact-fresh.mjs:174`
- Modify: `packages/ui/scripts/verify-scaffold-compiles.mjs:1650,1811`
- Modify: `packages/ui/scripts/verify-construct.mjs:99,311`
- Modify: `packages/ui/scripts/verify-blocks.mjs:82,83`
- Modify: `packages/ui/scripts/lint-catalog-drift.mjs:685`
- Modify: `packages/ui/scripts/lib/import-catalog.mjs:19`
- Modify: `packages/ui/scripts/acceptance-pack.mjs:49,1411`
- Modify (comment only): `packages/ui/scripts/verify-pack-weight.mjs`, `packages/ui/scripts/verify-solid-coverage.mjs`, `packages/ui/scripts/lib/element-meta-keys.mjs`, `packages/ui/scripts/acceptance-eval.mjs`, `packages/ui/scripts/lint-gate-parity.mjs`, `packages/ui/scripts/gen-llms.mjs`

**Interfaces:**
- Consumes: Task 7's regenerated artifacts.
- Produces: every namespaced guard green from the new location.

- [ ] **Step 1: Watch four guards fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm run verify:generated; echo "verify:generated -> $?"
pnpm run lint:catalog-drift; echo "lint:catalog-drift -> $?"
node scripts/verify-blocks.mjs; echo "verify:blocks -> $?"
node scripts/verify-artifact-fresh.mjs; echo "verify:artifact-fresh -> $?"
```

Expected: non-zero for at least `verify:generated`, `lint:catalog-drift` and `verify:blocks`, each naming a missing `src/agent-tooling/` path. Record the messages.

- [ ] **Step 2: Rewrite the code paths**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
sed -i '' -E "s#packages/ui/src/agent-tooling/#packages/ui/mcp/#g; s#src/agent-tooling/#mcp/#g" \
  scripts/verify-generated-sync.mjs \
  scripts/verify-artifact-fresh.mjs \
  scripts/verify-scaffold-compiles.mjs \
  scripts/verify-construct.mjs \
  scripts/verify-blocks.mjs \
  scripts/lint-catalog-drift.mjs \
  scripts/lib/import-catalog.mjs \
  scripts/acceptance-pack.mjs
```

- [ ] **Step 3: Update the comment-only sites, by hand**

These are prose, not paths, and each needs a sentence that is still true rather than a substitution:

- `scripts/verify-pack-weight.mjs`: the narrative at the comments naming `src/agent-tooling/mcp/tools/scaffold.ts` (326.9 KiB), `src/agent-tooling/catalog/derived.json` (97.7 KiB) and `src/agent-tooling/construct/fixtures/`. These are HISTORICAL records of files that shipped and then stopped shipping. Rewrite the paths to `mcp/...` and add, once, in the block that discusses them: `Those paths were src/agent-tooling/... until the 2026-09-02 move; the files are the same files.` Do not change `ALLOWED_ROOT_PREFIXES` or any ceiling: `mcp/` is not in `files`, so nothing under it can be packed, and no ceiling moves.
- `scripts/verify-solid-coverage.mjs`, `scripts/lib/element-meta-keys.mjs`, `scripts/acceptance-eval.mjs`, `scripts/gen-llms.mjs`: single prose mentions. Substitute the path.
- `scripts/lint-gate-parity.mjs`: its WHY IT EXISTS header names `src/agent-tooling/catalog/derived.json` as the file that grew past a per-file ceiling. That is a historical record of an incident. Rewrite it to `mcp/catalog/derived.json` and append `(src/agent-tooling/catalog/derived.json at the time)`.

- [ ] **Step 4: Watch the guards pass**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm run verify:generated
pnpm run lint:catalog-drift
node scripts/verify-blocks.mjs
node scripts/verify-artifact-fresh.mjs
pnpm run verify:pack
```

Expected: all exit 0. `verify:generated` and `lint:catalog-drift` both run `--self-test` first inside their npm script, so a guard that stopped detecting fails here rather than passing quietly.

- [ ] **Step 5: The two heavy guards**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm run verify:scaffold
pnpm run verify:construct
```

Expected: both exit 0. Read the axis and cell counts `verify:scaffold` prints and compare them to what it printed on `main`; they must be identical, because no integration, surface or framework changed.

- [ ] **Step 6: Confirm nothing is left**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat && git grep -n "agent-tooling" -- packages/ui/scripts
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/ui/scripts
git commit -m "$(cat <<'MSG'
build(ui): the guards read mcp/ instead of src/agent-tooling/

verify-generated-sync (eleven pinned artifacts plus the fixture dir
glob), verify-artifact-fresh, verify-scaffold-compiles (both esbuild
entry points), verify-construct, verify-blocks, lint-catalog-drift,
lib/import-catalog and acceptance-pack.

verify-pack-weight, verify-solid-coverage, lib/element-meta-keys,
acceptance-eval, gen-llms and lint-gate-parity carry prose about specific
files rather than paths they resolve; each was rewritten by hand so the
record stays true rather than merely substituted. No pack ceiling moves:
mcp/ is not in `files`, so nothing under it can be packed.

Each of the four guards that could fail was watched failing first.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 9: The two directory-scan exclusions that just went dead

**Files:**
- Modify: `packages/ui/tests/styles/shadow-sheet-scan.test.ts:24,51`
- Modify: `packages/ui/src/elements/slots.test.ts:285-298`

**Interfaces:**
- Consumes: the moved tree.
- Produces: two scans whose exclusion lists name only directories that exist under `src/`.

Both scans walk `src/` and key their skip lists on a directory NAME. With `agent-tooling` gone from `src/`, both entries are unreachable, which is the same shape Step 1 of the restructure removed for the three app directories.

- [ ] **Step 1: Prove the entries are dead before deleting them**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
ls src | grep agent-tooling; echo "exit $?"
```

Expected: no output, exit 1.

- [ ] **Step 2: Delete the `shadow-sheet-scan` entry**

Remove line 51 (`  'agent-tooling', // scaffold + construct templates: ...`) from `NOT_SHIPPED_DIRS`, and in the header comment at line 24 replace the parenthetical listing `agent-tooling's scaffold templates` with `test-utils and the docs stories`, so the prose matches the list.

- [ ] **Step 3: Delete the `slots.test` entry**

`UNSCANNED_DIRS` becomes:

```ts
  const UNSCANNED_DIRS = new Set(['stories']);
```

and the bullet in the comment above it that explains `agent-tooling/` is removed, leaving the `stories/` bullet and the closing paragraph. Add one sentence at the end of that paragraph:

```
  // `agent-tooling/` used to be the other entry here. It left src/ in the
  // 2026-09-02 move, so this scan no longer reaches it and an entry naming it
  // would be a rule that can never fire.
```

- [ ] **Step 4: Watch both suites pass**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm exec vitest run --project=unit tests/styles/shadow-sheet-scan.test.ts src/elements/slots.test.ts
```

Expected: PASS. `shadow-sheet-scan` carries a candidate-count floor and a control assertion, so a scan that quietly started reading a different tree fails here rather than passing on an empty set.

- [ ] **Step 5: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/ui/tests/styles/shadow-sheet-scan.test.ts packages/ui/src/elements/slots.test.ts
git commit -m "$(cat <<'MSG'
test(ui): drop the two src/ scan exclusions the move made unreachable

Both scans walk src/ and key their skip lists on a directory name, so
with agent-tooling out of src/ neither entry can ever fire. Keeping a
rule that cannot fire is how a list stops describing the tree.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 10: The tests move, and the emitted-project contract

**Files:**
- Move: `packages/ui/tests/agent-tooling` to `packages/ui/mcp/tests`
- Modify: `packages/ui/emitted-code-tests.ts:14,95,143`
- Modify: `.github/workflows/test.yml:577` (comment only)
- Modify: `packages/ui/tests/elements/tool.test.tsx:8`, `packages/ui/src/components/card-renderer.test.tsx:169` (comment only)

**Interfaces:**
- Consumes: the moved tree, and `tsconfig.tests.json`'s `mcp/tests/**/*.ts` include from Task 2.
- Produces: `EMITTED_CODE_TEST_DIR === 'mcp/tests'`, from which `EMITTED_CODE_TESTS` and `EMITTED_CODE_TESTS_EXCLUDE` are both derived, so the `emitted` project's include and the `unit` project's exclude cannot drift.

The `unit` project declares no `include`, so vitest's default collection finds the new location with no config edit. `emitted-project-wiring.test.ts` asserts that CI names `--project=emitted` and reads `EMITTED_CODE_TEST_DIR` for its own directory scan, so the workflow's `run:` line does not move.

- [ ] **Step 1: Move the directory**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git mv packages/ui/tests/agent-tooling packages/ui/mcp/tests
ls packages/ui/mcp/tests
```

Expected: eight files.

- [ ] **Step 2: Fix the eight files' imports**

Task 3 rewrote these to `'../../mcp/...'`, which was correct from `tests/agent-tooling/`. From `mcp/tests/` the same targets are one level nearer.

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
sed -i '' -E "s#'\.\./\.\./mcp/#'../#g" mcp/tests/*.ts
grep -rn "from '\.\./" mcp/tests/*.ts
```

Expected: specifiers of the form `'../mcp/tools/scaffold'`, `'../construct/mock-script'`, `'../archetypes'`, `'../blocks/registry'`, `'../registry'`, `'../route-emit'`, `'../types'`.

- [ ] **Step 3: Move the constant**

`packages/ui/emitted-code-tests.ts:143`:

```ts
export const EMITTED_CODE_TEST_DIR = 'mcp/tests';
```

and its two doc mentions:

- line 14: `` * `mcp/tests/emitted-card-path.live.test.ts` measures 7.7s with no added ``
- line 95: `` * ADDING A FILE. Name it `*.live.test.ts` and put it under `mcp/tests/`. ``

- [ ] **Step 4: Fix the comment-only references**

`.github/workflows/test.yml:577`, `packages/ui/tests/elements/tool.test.tsx:8` and `packages/ui/src/components/card-renderer.test.tsx:169` each name `tests/agent-tooling/...` in prose:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
sed -i '' -E "s#tests/agent-tooling/#packages/ui/mcp/tests/#g" .github/workflows/test.yml
sed -i '' -E "s#tests/agent-tooling/#mcp/tests/#g" packages/ui/tests/elements/tool.test.tsx packages/ui/src/components/card-renderer.test.tsx
```

- [ ] **Step 5: Prove the emitted project collects the same five files**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm exec vitest list --project=emitted
```

Expected: the five `*.live.test.ts` files, now under `mcp/tests/`. An EMPTY list is the failure to watch for; it looks like a pass in a `vitest run`.

- [ ] **Step 6: Run both projects**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
pnpm exec vitest run --project=emitted
pnpm exec vitest run --project=unit
```

Expected: both green. `emitted-project-wiring.test.ts` runs in `unit` and asserts three things: that files matching the suffix exist under the directory, that no such file exists outside it, and that the workflow names the project. All three must pass.

- [ ] **Step 7: Typecheck**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui && npm run typecheck
```

Expected: exit 0. `verify:quarantine` runs first and audits `tsconfig.tests.json`; this task adds no exclusion, so it has nothing new to audit.

- [ ] **Step 8: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A
git commit -m "$(cat <<'MSG'
test(ui): tests/agent-tooling moves to packages/ui/mcp/tests

The eight files that test the MCP from outside it join the tree they
test. EMITTED_CODE_TEST_DIR is the only wiring: the emitted project's
include and the unit project's mirrored exclude are both derived from it,
and the unit project declares no include at all, so vitest's default
collection picks up the new home with no config edit.

The CI step keeps its name, because emitted-project-wiring.test.ts pins
`--project=emitted` rather than a path. `vitest list --project=emitted`
was checked for the five files, since an empty project looks exactly like
a passing one.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 11: `create-kai`

**Files:**
- Modify: `packages/create-kai/src/build-guards.ts:288,619,640,643,666,691`
- Modify: `packages/create-kai/test/build-guards.test.ts:368,381-384,410-411,415-416`
- Modify: `packages/create-kai/src/{catalog,blocks,react-form,routes,wizard}.ts` (comment headers)
- Modify: `packages/create-kai/scripts/build.mjs:16`, `packages/create-kai/test/{wizard,publish-shape}.test.ts`, `packages/create-kai/README.md`

**Interfaces:**
- Consumes: the moved tree. Task 3 already rewrote the four real import statements (`src/catalog.ts:31,61,62`, `src/blocks.ts:30,35,47`, `src/react-form.ts:19`, `test/add.test.ts:22`) to `'../../ui/mcp/...'`.
- Produces: `bundleGraphProblem` banning `mcp/mcp/` (the zod-heavy server) while continuing to allow the leaf modules at the root of `mcp/`.

The rule this guard enforces does not change: the CLI bundle must never reach the MCP server or `zod`, and it must keep reaching `registry.ts`, `types.ts` and `route-emit.ts`, which sit at the root of the tree precisely so the rule can tell them apart.

- [ ] **Step 1: Watch the guard's own tests fail**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai
pnpm exec vitest run test/build-guards.test.ts
```

Expected: FAIL. The fixture graph at lines 381-384 names paths that no longer exist and the ban assertion at 410-411 plants a path the regex still matches by luck, so read which assertions fail before changing anything.

- [ ] **Step 2: Repoint the regex**

`packages/create-kai/src/build-guards.ts:666`:

```ts
      what: /(?:^|\/)mcp\/mcp\//,
```

- [ ] **Step 3: Repoint the guard's prose**

Lines 288, 619, 640, 643 and 691 all name `agent-tooling`. Substitute `mcp/` for `agent-tooling/`, keeping every sentence's meaning:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai
sed -i '' -E "s#agent-tooling/mcp/#mcp/mcp/#g; s#agent-tooling/route-emit\.ts#mcp/route-emit.ts#g; s#root of agent-tooling/#root of mcp/#g; s#root of \`agent-tooling/\`#root of \`mcp/\`#g" src/build-guards.ts
grep -n "agent-tooling" src/build-guards.ts
```

Expected: no output.

- [ ] **Step 4: Repoint the fixtures**

`packages/create-kai/test/build-guards.test.ts` lines 381-384 become:

```ts
    '../ui/mcp/registry.ts',
    '../ui/mcp/types.ts',
    '../ui/mcp/route-emit.ts',
    '../ui/mcp/integrations/anthropic.ts',
```

lines 410-411 become:

```ts
      bundleGraphProblem([...legitimateGraph, '../ui/mcp/mcp/tools/scaffold.ts']),
      'mcp/mcp/tools/scaffold.ts',
```

and the prose at 368, 415 and 416 substitutes `agent-tooling/` for `mcp/` the same way.

- [ ] **Step 5: Watch it pass, and confirm it still detects**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai
pnpm exec vitest run test/build-guards.test.ts
```

Expected: PASS, including the case that plants `mcp/mcp/tools/scaffold.ts` in the graph and requires the guard to reject it. That assertion is the anti-vacuity control: a regex that matched nothing would make the ban silently permissive, and it is exactly what a careless substitution produces.

- [ ] **Step 6: Repoint the remaining prose**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai
sed -i '' -E "s#packages/ui/src/agent-tooling/#packages/ui/mcp/#g; s#\.\./\.\./ui/src/agent-tooling/#../../ui/mcp/#g; s#agent-tooling/#mcp/#g; s#tests/agent-tooling/#packages/ui/mcp/tests/#g" \
  src/catalog.ts src/blocks.ts src/react-form.ts src/routes.ts src/wizard.ts scripts/build.mjs test/wizard.test.ts test/publish-shape.test.ts README.md
grep -rn "agent-tooling" src test scripts README.md
```

Expected: no output.

`src/catalog.ts`'s header currently argues that a relative source import is used because "`@kitn.ai/ui`'s exports map does not expose `agent-tooling`, and it should not". That argument still holds word for word with the new name; do not weaken it, and do not add an export.

- [ ] **Step 7: Build, typecheck and test the CLI**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/create-kai
npm run build
npm run typecheck
pnpm exec vitest run
```

Expected: all green. The build runs `bundleGraphProblem` over the real esbuild metafile, so a bundle that started reaching the MCP fails here and not in review.

- [ ] **Step 8: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add packages/create-kai
git commit -m "$(cat <<'MSG'
build(create-kai): the bundle-graph ban follows the mcp move

bundleGraphProblem banned anything under agent-tooling/mcp/ (the CAUSE,
not the symptom: a module-scope zod schema build took dist/index.js from
203 kB to 904 kB with every other check green). The banned subtree is now
mcp/mcp/ and the allowed leaves are still registry.ts, types.ts and
route-emit.ts at the root of mcp/.

The fixture graph and the planted violation in build-guards.test.ts move
with it, and the planted case was watched failing and then passing, which
is what stops a substitution from quietly making the ban permissive.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 12: CI, docs and the enumerated tarball delta

**Files:**
- Modify: `.github/workflows/test.yml:501`
- Modify: `CLAUDE.md:7,14,38,54,76`
- Modify: `docs/coupling-map.md` (the rows listed below)
- Modify: `.coderabbit.yaml:128`
- Modify: `packages/ui/theme.css:113`
- Modify: `packages/ui/mcp/blocks/registry.ts:14,95`
- Modify: `packages/ui/src/elements/styles.css:25`, `packages/ui/src/schemas/index.ts:316`, `packages/ui/src/primitives/{card-routing.ts:7,url-scheme-policy.ts:5,card-tags.ts:11}`, `packages/ui/src/components/{builder-preview.ts:33,work-surface.tsx:97,builder-panel.tsx:15,63}`, `packages/ui/src/elements/{builder.stories.tsx:36,builder-in-app-assistant.stories.tsx:41}`, `packages/ui/src/themes/theme-tokens.ts:161`, `packages/ui/apps/gallery/{GalleryPage.tsx:19,GalleryPage.stories.tsx:22}`, `packages/ui/apps/builder/App.test.tsx:15`, `packages/ui/tests/schemas/card-data-types-node-safe.test.ts:24`, `packages/ui/tests/primitives/card-registry.test.ts:21`, `packages/ui/tests/elements/element-coverage.test.ts:537`, `examples/internal/openrouter-spike/FINDINGS.md:221`, `examples/internal/openrouter-spike/harness/emit-gateway-route.mjs:8`

**Interfaces:**
- Consumes: everything above.
- Produces: no live reference to `src/agent-tooling` outside the dated research and spec documents, which are records and stay as written.

**THE ENUMERATED TARBALL DELTA.** Two of the edits in this task change bytes inside the published package, and they are the only permitted deltas in the whole plan:

1. `packages/ui/theme.css:113`, one comment line, whose parenthetical points a construct author at the schema file. `theme.css` is in `files`.
2. `packages/ui/mcp/blocks/registry.ts:14` and `:95`, two doc-comment lines that vite-plugin-dts copies into `dist/agent-tooling/blocks/registry.d.ts`. Line 14 quotes the specifier `create-kai`'s `catalog.ts` uses, which Task 3 changed.

Both are prose that would otherwise ship naming a path that does not exist. Shipping a comment that is false is worse than a three-line diff, and an allowlist of three named lines keeps the byte gate sharp. If you would rather have a literally byte-identical tarball, leave those three lines alone and file them as follow-up: that is the only other defensible option and it should be an explicit choice, not an omission.

- [ ] **Step 1: The CI cache key**

`.github/workflows/test.yml:501`:

```yaml
          key: construct-npm-${{ hashFiles('packages/ui/mcp/construct/construct.v1.schema.json', 'packages/ui/mcp/construct/templates.ts', 'packages/ui/package.json') }}
```

`hashFiles` returns an empty string for a pattern that matches nothing rather than failing, so a stale path here degrades the key to a constant and nothing says so. Prove the new paths exist:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
ls packages/ui/mcp/construct/construct.v1.schema.json packages/ui/mcp/construct/templates.ts
```

- [ ] **Step 2: `CLAUDE.md`**

Substitute `packages/ui/mcp/` for `packages/ui/src/agent-tooling/` at lines 7 and 14, `mcp/mcp/tools/scaffold.ts` for `agent-tooling/mcp/tools/scaffold.ts` at line 54, and `packages/ui/mcp/tests/emitted-project-wiring.test.ts` for `tests/agent-tooling/emitted-project-wiring.test.ts` at line 38. Line 14's bullet becomes:

```
- `packages/ui/mcp/` the `kai` MCP server + the construct engine + the integration/archetype catalogs -- independent of the components, outside `src/` because it is tooling over the kit, not the kit. Its own `tsconfig.mcp.json` covers `mcp/mcp/**` (Node-only, no DOM, no JSX); the rest of `mcp/` rides `tsconfig.json`. Its declarations still emit to `dist/agent-tooling/` because `exports["./construct"].types` names that path.
```

Line 76's Map line becomes:

```
pnpm + NX workspace. `packages/ui/` (the kit: `src/` -- `primitives` · `ui` · `components` · `state` · `wire` · `elements` -- plus `mcp/` (the `kai` MCP + construct engine, with its own tests), `frameworks/react/` wrappers, Storybook, `theme.css` / `theme.tokens.css`) · `apps/docs/` (public Astro Starlight docs → ui.kitn.ai) · `examples/*` (at repo root, deferred) · `packages/ui/dist/` (built, gitignored). `packages/ui/apps/{builder,theme-studio,gallery}` are the three dev-tool pages `kai dev` serves, prebuilt into `dist/` and outside `src/` because they are apps over the kit, not the kit.
```

- [ ] **Step 3: `docs/coupling-map.md`**

Substitute the path in rows 69, 86, 88, 103, 118, 122, 123, 124, 142, 143, 175, 177, 194, 197, 198, 203, 204, 230, 241, 242, 252, 253, 257:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
sed -i '' -E "s#packages/ui/src/agent-tooling/#packages/ui/mcp/#g; s#src/agent-tooling/#mcp/#g; s#tests/agent-tooling/#packages/ui/mcp/tests/#g; s#\`agent-tooling/\`#\`mcp/\`#g; s#agent-tooling/mcp/#mcp/mcp/#g; s#agent-tooling/registry#mcp/registry#g; s#agent-tooling/blocks/forms#mcp/blocks/forms#g; s#agent-tooling/construct/#mcp/construct/#g; s#agent-tooling/route-emit#mcp/route-emit#g" docs/coupling-map.md
grep -n "agent-tooling" docs/coupling-map.md
```

Expected after that: only lines where the remaining text is `dist/agent-tooling` (which is correct and must stay) or a historical narrative. Read every surviving hit and settle it by hand.

Then add ONE row to the section that records module-graph couplings, because this plan created a coupling that did not exist before:

```
| `packages/ui/src/components/{construct-form-paths,builder-panel-derived,builder-start,builder-panel}` importing `mcp/construct/*` | the emitted `dist/components/*.d.ts`, which carry the source specifier verbatim. Source depth and dist depth no longer match, so the specifier is rewritten at emit time by the `beforeWriteFile` hook on the `index` target in `config/vite/lib.ts` | An importer added at a different depth under `src/` emits a relative path that points outside `dist/` at a directory `files` does not ship. A consumer's tsc then cannot resolve `Construct`, and the build succeeds | The hook THROWS on any depth it does not know, naming the file. Nothing else: `verify:dts` checks declared `types` targets, not the specifiers inside them |
```

- [ ] **Step 4: `.coderabbit.yaml:128`**

```yaml
    - path: "packages/ui/mcp/**"
```

- [ ] **Step 5: The two shipped comment lines**

`packages/ui/theme.css:113`:

```
     vocabulary -- see mcp/construct/schema.ts). */
```

`packages/ui/mcp/blocks/registry.ts:14`:

```
 * `catalog.ts` imports `../../ui/mcp/registry` -- a pure module
```

and `:95`:

```
   *  read from `mcp/registry` by the caller, never restated. */
```

- [ ] **Step 6: The remaining comment-only sites**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git grep -l "agent-tooling" -- packages examples \
  ':!packages/ui/dist' ':!docs' \
  | xargs sed -i '' -E "s#packages/ui/src/agent-tooling/#packages/ui/mcp/#g; s#src/agent-tooling/#mcp/#g; s#tests/agent-tooling/#mcp/tests/#g; s#agent-tooling/#mcp/#g"
git grep -n "agent-tooling" -- packages examples ':!packages/ui/dist'
```

Expected: no output. `examples/apps/*/README.md` files carry recorded build prompts, which are historical transcripts; if the sed touched one, `git checkout` that file and leave it alone. Verify:

```bash
git diff --stat examples/apps
```

Expected: no change under `examples/apps`. If there is one, revert it.

- [ ] **Step 7: Rebuild and confirm the delta is exactly the three lines**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npm run build:css && npm run build
diff -r "$BASE/dist-baseline" dist
```

Expected: differences in `dist/agent-tooling/blocks/registry.d.ts` ONLY, and only in the two comment lines. `dist/elements/compiled.css` must be unchanged, because Tailwind strips comments and `styles.css:25` is a comment. If `compiled.css` moved, the `styles.css` edit was not comment-only; revert it.

```bash
npm pack --dry-run --json > "$BASE/pack-after-task12.json"
node -e "const f=require(process.env.BASE+'/pack-after-task12.json')[0].files.map(x=>x.path).sort();require('fs').writeFileSync(process.env.BASE+'/pack-files-after-task12.txt',f.join('\n')+'\n')"
diff "$BASE/pack-files-baseline.txt" "$BASE/pack-files-after-task12.txt"
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git add -A
git commit -m "$(cat <<'MSG'
docs: the map, the coupling map and the review scopes name mcp/

CLAUDE.md's architecture bullets and Map line, coderabbit's review scope,
the CI cache key (hashFiles returns empty for a pattern that matches
nothing, so a stale path there degrades the key to a constant and says
so nowhere), and the ~23 coupling-map rows.

One new coupling-map row: src/components importing mcp/construct is now
a depth mismatch between source and dist, held by a beforeWriteFile hook
that throws on any depth it does not know.

Three comment lines inside the published package change, and they are the
whole tarball delta: theme.css's pointer at the construct schema, and two
doc lines in blocks/registry.ts that vite-plugin-dts copies into
dist/agent-tooling/blocks/registry.d.ts. Shipping prose that names a path
which no longer exists is worse than a three-line diff; the pack file
list is byte-identical.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
MSG
)"
```

---

### Task 13: The full gate run, the published-artifact smoke, and the PR

**Files:**
- Modify: none, unless a gate finds something.

**Interfaces:**
- Consumes: everything.
- Produces: a PR with evidence.

- [ ] **Step 1: Cold build from a clean dist**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
rm -rf dist
npm run build:css
npm run build
```

Do not pipe this through `tail` inside an `&&` chain; the exit status becomes the pipe's and a failed build reads as a pass.

- [ ] **Step 2: The local gate subset**

<!-- gate-list: partial -- the local pre-push subset, not the merge gate; the merge gate is the required `test` graph, printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
pnpm exec nx typecheck ui --skip-nx-cache
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter @kitn.ai/ui run verify:scaffold
pnpm --filter @kitn.ai/ui run verify:construct
pnpm --filter @kitn.ai/ui run verify:consumer
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run verify:pack
pnpm --filter @kitn.ai/ui run lint:silent-drops
pnpm --filter @kitn.ai/ui run lint:cdn-pins
pnpm --filter @kitn.ai/ui run lint:catalog-drift
pnpm --filter create-kai run build
pnpm --filter create-kai run typecheck
pnpm --filter create-kai exec vitest run
```

Expected: every one exits 0. Read `verify:scaffold`'s printed axes and cell counts and compare them with a run on `main`; identical counts are the claim, not a number written here.

- [ ] **Step 3: The gate-parity diff**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/scripts/lint-gate-parity.mjs --list > "$BASE/gates-after.txt"
diff "$BASE/gates-baseline.txt" "$BASE/gates-after.txt"
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
```

Expected: the `--list` diff is empty (this plan renames no CI step) and both linters exit 0.

- [ ] **Step 4: The tarball diff, against the baseline**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
diff -r "$BASE/dist-baseline" dist
npm pack --dry-run --json > "$BASE/pack-final.json"
node -e "const f=require(process.env.BASE+'/pack-final.json')[0].files.map(x=>x.path).sort();require('fs').writeFileSync(process.env.BASE+'/pack-files-final.txt',f.join('\n')+'\n')"
diff "$BASE/pack-files-baseline.txt" "$BASE/pack-files-final.txt"
```

Expected: the `dist` diff shows only the two comment lines in `dist/agent-tooling/blocks/registry.d.ts`; the file-list diff is empty. Paste both outputs into the PR body.

- [ ] **Step 5: Drive the PACKED artifact, not the tree**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat/packages/ui
npm pack --pack-destination "$BASE"
cd "$BASE" && mkdir -p smoke && cd smoke
npm init -y >/dev/null
npm i "$BASE"/kitn.ai-ui-*.tgz
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | npx @kitn.ai/ui mcp
```

Expected: an `initialize` result naming `@kitn.ai/ui`, then a `tools/list` result naming `scaffold`, `component_reference`, `theme` and `debug`. This is the check that `manifest.ts`'s hop and the bundled `dist/mcp.es.js` still work from an INSTALL rather than a checkout, which no test over the tree can tell you.

- [ ] **Step 6: `component_reference` from the same install**

```bash
cd "$BASE/smoke"
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"component_reference","arguments":{"tag":"kai-chat"}}}\n' | npx @kitn.ai/ui mcp
```

Expected: a real answer for `kai-chat`. A throw here means `resolveManifestPath()` is not finding `dist/custom-elements.json` beside the bundle, which is precisely the failure Task 6 changed the hop for.

- [ ] **Step 7: `kai dev --builder` and the three pages**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node packages/ui/bin/mcp.js dev --builder
```

In a browser, load the builder page, then `/theme-studio/` and `/gallery/`. All three must render. Take a screenshot of each and attach them to the PR. `kai dev` resolves those directories by walking up from its own compiled chunk to a `package.json`, so this is the check that `local-kit.ts`'s new source-checkout marker fires in a checkout.

- [ ] **Step 8: Confirm the source-checkout marker both ways**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
node -e "const {isSourceCheckout}=await import('./packages/ui/dist/construct-cli.es.js').catch(()=>({})); console.log('checkout:', require('fs').existsSync('packages/ui/mcp/construct/cli.ts'))" 2>/dev/null || ls packages/ui/mcp/construct/cli.ts
ls "$BASE/smoke/node_modules/@kitn.ai/ui/mcp" 2>&1 | head -1
```

Expected: the checkout has `packages/ui/mcp/construct/cli.ts`; the install has no `mcp` directory at all (`No such file or directory`). Both halves of the marker's argument are then true.

- [ ] **Step 9: Push and open the PR**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git push -u origin feat/mcp-out-of-src
gh pr create --title "refactor(ui): the kai MCP moves out of src/ to packages/ui/mcp" --body "$(cat <<'BODY'
Step 2 of the repo restructure, scoped to the owner's ruling: the MCP
leaves `src/` and lands at `packages/ui/mcp/`, INSIDE the ui package.
Not a separate npm package this round, so `release-please-config.json`,
the publish loop, `bin/mcp.js`, `exports`, `typesVersions` and `files`
are all untouched.

## The tarball

`npm pack --dry-run --json` file list: byte-identical, name for name.
`diff -r` of a pre-move `dist/` against the rebuilt one: two comment
lines in `dist/agent-tooling/blocks/registry.d.ts`, both quoting a path
that the move changed. Those two plus one line in `theme.css` are the
entire published delta, and each was a comment that would otherwise ship
naming a directory that no longer exists.

Declarations still emit to `dist/agent-tooling/` because that string is
the literal value of `exports["./construct"].types`. Held with two lines
of vite-plugin-dts config (`entryRoot: 'mcp'`, `outDir:
'dist/agent-tooling'`) rather than by changing three consumer-visible
places.

## The one thing that was not a pure relocation

Four SHIPPED declarations under `dist/components/` import the construct
schema across the boundary by a relative path. That resolved for free
only because `src/agent-tooling` and `dist/agent-tooling` were the same
string from their respective roots. With the source at `mcp/`, tsc emits
`'../../mcp/construct/schema'` into `dist/components/*.d.ts`, pointing
outside `dist/` at a directory `files` does not ship: a consumer's tsc
loses `Construct` and every check over the tree stays green. Fixed by a
`beforeWriteFile` hook on the barrel dts target that rewrites the
specifier and THROWS on any importer at a depth it does not know.

This was not in the extraction research; it is recorded as a new
`docs/coupling-map.md` row.

## Two research predictions that did not hold here

`tsconfig.mcp.json`'s dist-first `paths` trick keeps its unbuilt-tree
green, and `verify:quarantine`'s reason for running first still stands.
Both were costs of `packages/mcp`, not of leaving `src/`.

## Evidence

- Cold `npm run build` from an empty `dist/`, then the local gate subset:
  typecheck (`--skip-nx-cache`), `--project=unit`, `--project=emitted`,
  `verify:scaffold`, `verify:construct`, `verify:consumer`,
  `verify:generated`, `verify:pack`, `lint:silent-drops`,
  `lint:cdn-pins`, `lint:catalog-drift`, and create-kai's build +
  typecheck + suite. All green. `verify:scaffold` printed the same axes
  and cell counts as `main`.
- `lint-gate-parity.mjs --list` diffs empty against `main`: no CI step
  was renamed.
- `build:api` regenerates every committed artifact byte-identically
  (`git status --porcelain` clean).
- The PACKED tarball installed into a throwaway app: `npx @kitn.ai/ui
  mcp` answers `initialize` and `tools/list`, and
  `component_reference` answers for `kai-chat`, which is the only check
  that `manifest.ts`'s new hop works from an install.
- `kai dev --builder` serves the builder, `/theme-studio/` and
  `/gallery/`. Screenshots below.

BODY
)"
```

- [ ] **Step 10: Clean up the scratch directory**

```bash
rm -rf "$BASE"
```

Confirm no scratch path reached the tree:

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git grep -n "$TMPDIR" -- . | head
git grep -nE "/private/tmp/claude-|/var/folders/" -- . | head
```

Expected: no output from either.

---

## Self-review

**Spec coverage.** The spec's Step 2 names three things that must settle: the import surface, the `./construct` export and bin compatibility, and how `verify:scaffold` plus the derived-list guards span the boundary. Under the owner's `packages/ui/mcp/` ruling all three are answered by NOT creating a boundary: imports stay relative (Task 3), the export and both bins are untouched (Task 5's dts pinning plus the Global Constraints), and the guards stay single-package (Task 8). The spec's later ruled map still points at `packages/mcp`; this round is the waypoint the owner asked for, and Task 12 records the difference in `CLAUDE.md` rather than pretending the destination changed.

**Placeholder scan.** Every step names a file and a line or gives the exact replacement text. The one place a figure is left to the run rather than written down is Task 3 Step 3's per-file import count, and it says so explicitly and gives the command that prints it, because a count typed here is exactly the kind of number this repo's own rule bans.

**Type consistency.** `EMITTED_CODE_TEST_DIR` (Task 10) is the same constant `emitted-code-tests.ts` already exports and `vitest.config.ts` already reads; no new symbol is introduced. `SOURCE_TO_PACKAGE_ROOT` (Task 6) keeps its name and its `as const` tuple type, losing one element. `isSourceCheckout(pkgRoot: string): boolean` keeps its signature (Task 6). `bundleGraphProblem`'s `what` field stays a `RegExp` (Task 11). The `beforeWriteFile(filePath: string, content: string)` signature in Task 5 matches vite-plugin-dts 4.5.4's declared type, which allows a return of `void | false | { filePath?: string; content?: string }`.

**Known gap, stated rather than hidden.** Task 5's `beforeWriteFile` hook is the only new logic in the plan, and its correctness rests entirely on the `diff -r` in Task 5 Step 11 being empty. If that diff is not empty, do not adjust the hook until you have read which file moved: the hook throwing is the designed outcome for an unexpected shape, and a silently different byte is not.
