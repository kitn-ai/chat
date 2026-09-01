<!-- Read-only investigation by an Explore agent, 2026-09-01, feeding the packages/mcp design (spec: 2026-09-01-repo-restructure-design.md). lint-cdn-pins: n/a. -->

# MCP extraction surface: `packages/ui/src/agent-tooling` → `packages/mcp`

Baseline read: `/Users/home/Projects/kitn-ai/kitn-chat/CLAUDE.md` (Architecture §, Build/test §, Map §), `/Users/home/Projects/kitn-ai/kitn-chat/nx.json`, `/Users/home/Projects/kitn-ai/kitn-chat/pnpm-workspace.yaml` (`packages/*` is already globbed — a new `packages/mcp` is picked up with no workspace edit), `/Users/home/Projects/kitn-ai/kitn-chat/release-please-config.json`.

Scope: 87 files / 2.1 MB under `/Users/home/Projects/kitn-ai/kitn-chat/packages/ui/src/agent-tooling/`.

---

## 1. Inbound imports (agent-tooling → the rest of `src/`)

**27 import specifiers escape `agent-tooling/`, in 9 files, hitting 15 distinct target modules + 2 assets.** 8 are in production modules; 19 are in `*.test.ts(x)` files that live *inside* agent-tooling and would move with it.

### PRODUCTION (8 sites) — these are the real boundary

| Target | Site | Symbol(s) | Class |
|---|---|---|---|
| `src/wire/media-types` | `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts:23` | `encodableMediaTypes` (value) | **PUBLIC-ALREADY** — `@kitn.ai/ui/wire` (`packages/ui/src/wire/index.ts:40`) |
| `src/state/mock` | `packages/ui/src/agent-tooling/construct/mock-script.ts:48` | `MockReply`, `MockSource`, `MockToolCall`, `MockTurn` | **TYPE-ONLY** — public at `packages/ui/src/state/index.ts:26` |
| `src/primitives/url-scheme-policy` | `packages/ui/src/agent-tooling/construct/schema.ts:28` | `isSafeUrl` (value) | **NEEDS-NEW-SUBPATH** — not on any barrel (grep of `index.ts`/`solid.ts`/`state`/`wire`/`schemas` = 0 hits) |
| `src/elements/chat-actions` | `packages/ui/src/agent-tooling/construct/schema.ts:29` | `CHAT_MESSAGE_ACTIONS` (value) | **NEEDS-NEW-SUBPATH** — only the `ChatMessageAction` *type* is public (`src/index.ts:399`), not the const list |
| `src/ui/button-variant-names` | `packages/ui/src/agent-tooling/construct/schema.ts:30` | `BUTTON_VARIANT_NAMES` (value) | **NEEDS-NEW-SUBPATH** |
| `src/themes/theme-tokens` | `packages/ui/src/agent-tooling/construct/theme-token-policy.ts:37` | `studioTokens` (value) | **NEEDS-NEW-SUBPATH** |
| `src/elements/element-manifest.json` | `packages/ui/src/agent-tooling/mcp/manifest.ts:249` | `tags` map | **JSON-ASSET** — *not* in `packages/ui/package.json` `files` and *not* an `exports` key; it survives today only because `vite.config.mcp.ts` inlines it into `dist/mcp.es.js` (`manifest.ts:242` says exactly this: "never copied into dist/") |
| `packages/ui/theme.css` | `packages/ui/src/agent-tooling/mcp/tools/theme.ts:2` (`'../../../../theme.css?raw'`) | raw text | **JSON-ASSET (raw CSS)** — the file *is* exported (`"./theme.css": "./theme.css"`) but consumed with Vite's `?raw`, which no `exports` map gives you; also needs the `css.include: [/theme\.css/]` hack in `packages/ui/vitest.config.ts` |

Already package-specifier'd today (no work): `@kitn.ai/ui/schemas` at `mcp/manifest.ts:46` and `mcp/tools/reference.ts:10`; `@kitn.ai/ui/wire` at `integrations/pi.ts:18` and `integrations/cloudflare.ts:18`. `docs/coupling-map.md:229-231` records this as deliberate: a relative import of the schemas barrel "would drag the card registry in and force `jsx` + DOM into `tsconfig.mcp.json`."

### TEST-ONLY (19 sites) — move with the tests

- `catalog/surfaces.test.ts:4-13` — nine side-effect `import '../../elements/{artifact,attachments,chat,composer,conversation-item,conversation-list,resizable,thread,toast}'` → **PUBLIC-ALREADY** via `@kitn.ai/ui/elements/*`.
- `catalog/surfaces.test.ts:7,14,15,16` — `ChatMessage`, `AttachmentData`, `ToastItem`, `ConversationGroup`/`ConversationSummary` → **TYPE-ONLY** (public at `wire/index.ts:94`, `state/index.ts:44`, `index.ts:56`, `index.ts:25`).
- `construct/codegen-cards.render.test.tsx:13,14` — `BUILTIN_CARD_COMPONENTS` (**PUBLIC-ALREADY**, `src/index.ts:89`), `FormDefinition` (**TYPE-ONLY**, `src/index.ts:102`). Caveat: `BUILTIN_CARD_COMPONENTS` is Solid; the `.` export's `node` condition resolves to `dist/index.server.js`, so a Node-project vitest in `packages/mcp` may not get it.
- `construct/mock-script.test.ts:14` — **TYPE-ONLY**.
- `mcp/scaffold.test.ts:20,21,24` — `toOpenAIMessages`/`toAnthropicMessages`/`WireEncodeError` and `encodableMediaTypes` (**PUBLIC-ALREADY**, `/wire`), `ChatMessage` (**TYPE-ONLY**).

### Counts

| Class | Sites | Of which production |
|---|---|---|
| PUBLIC-ALREADY | 13 | 1 |
| TYPE-ONLY (public type, reachable) | 8 | 1 |
| NEEDS-NEW-SUBPATH | 4 | 4 |
| JSON/RAW-ASSET | 2 | 2 |
| **Total** | **27** | **8** |

**The whole production boundary is 4 unexported values + 2 assets.** That is the entire cost of the cut on this axis.

---

## 2. Outbound (rest of repo → agent-tooling)

**~104 reference lines across 55 files.** No `frameworks/**` site. Grouped:

### `packages/create-kai` — 8 real imports, 3 files (+ guards)
- `src/catalog.ts:31` ← `registry` (`BASE_COMPONENT`, `getIntegration`, `listCapabilityGroups`, `listIntegrations`); `:61` ← `route-emit` (`CLIENT_MODEL_IDS`, `chatRoutePreamble`, `defaultModelFor`); `:62` ← `types` (`Integration`).
- `src/blocks.ts:30,35` ← `blocks/registry` (`discoverBlocks`, `Block`, `BlockManifest`, `RawBlockSource`); `:47` ← `blocks/forms` (`adaptRegistrationForBundler`, `componentName`, `renderCdnFormFiles`, `renderReactForm`, `renderWcForm`, `BlockFormId`).
- `src/react-form.ts:19` ← `blocks/forms`.
- `test/add.test.ts:22` ← `blocks/registry`.
- The header of `src/catalog.ts:1-26` states *why* it is a relative source import: "`@kitn.ai/ui`'s exports map does not expose `agent-tooling`, and it should not." This is the single most consequential outbound edge, and **the extraction fixes it**: `packages/mcp` can export `./registry`, `./route-emit`, `./types`, `./blocks` as first-class subpaths and create-kai swaps to `workspace:*`.
- **Hard constraint that survives the move**: `bundleGraphProblem` in `packages/create-kai/src/build-guards.ts` fails the CLI build if the bundle graph reaches `agent-tooling/mcp/` or `zod` (`test/build-guards.test.ts:410-411` plants exactly that). `packages/ui/src/agent-tooling/route-emit.ts` and `blocks/{registry,forms}.ts` must stay zod-free leaves in the new package, and `packages/mcp`'s `exports` must give them zod-free entry points. The path literals in `test/build-guards.test.ts:381-384` (`'../ui/src/agent-tooling/registry.ts'`, …) are fixture strings that must be rewritten.

### `packages/ui/src` (non-agent-tooling) — 11 imports, 7 files
Builder/construct UI: `src/components/builder-panel-derived.tsx:26,27`, `builder-panel-derived.test.tsx:7,8`, `builder-start.tsx:4`, `builder-start.test.tsx:13`, `construct-form-paths.ts:23`, `construct-form-paths.test.ts:9,10`, `src/elements/builder-derived-panel.stories.tsx:4,5`. **All of them want `construct/templates` and `construct/schema` only** — the two modules already published as `@kitn.ai/ui/construct` and `@kitn.ai/ui/construct/templates`. This is the reverse dependency that makes a naive cut circular: `packages/ui`'s own components would need `@kitn.ai/mcp`.
Plus one scoping ref: `src/elements/slots.test.ts:298` (`UNSCANNED_DIRS = new Set(['agent-tooling', 'stories'])`).

### `packages/ui/apps/{builder,gallery}` — 9 imports, 7 files
`apps/builder/App.tsx:17,18`, `HomeScreen.tsx:22`, `edit-guard.ts:14`, `edit-guard.test.ts:9`, `apps/gallery/GalleryPage.tsx:46`, `GalleryPage.stories.tsx:9,10`, `main.tsx:4`. These are the pages `kai dev` serves — the dependency currently points *into* the same package in both directions.

### `packages/ui/tests` — 28 lines, 14 files
`tests/agent-tooling/*` (8 files: `blocks-registry.test.ts:38,39`, the five `*.live.test.ts`, `route-emit-guards.test.ts:2,3`, `emitted-project-wiring.test.ts`), `tests/scripts/acceptance-{eval,pack,run,gate-compiles}.test.ts`, `catalog-derived.test.ts:6,7,11`, `catalog-drift-guard-wiring.test.ts:46`, plus `tests/styles/shadow-sheet-scan.test.ts:51` (exclusion).

### `packages/ui/scripts` — 33 lines, 13 scripts (see §3)

### Vite configs — 12 lines, 5 files (see §3)

### Other — 2
`packages/ui/emitted-code-tests.ts:143` (`EMITTED_CODE_TEST_DIR = 'tests/agent-tooling'`); `examples/internal/openrouter-spike/harness/emit-gateway-route.mjs:57` (esbuild-bundles `mcp/tools/scaffold.ts`).

### Which `@kitn.ai/ui` exports are implemented in agent-tooling

| Export / bin | Implementation | Build |
|---|---|---|
| `./construct` → `dist/construct.js`, types `dist/agent-tooling/construct/public.d.ts` | `construct/public.ts` → `construct/schema.ts` | `vite.config.construct.ts:71` |
| `./construct/templates` → `dist/construct-templates.js` | `construct/templates.ts` (+ `schema-url.ts`) | `vite.config.construct-templates.ts:36` |
| `bin: kai`, `kai-mcp` → `bin/mcp.js` | `mcp/stdio.ts` → `dist/mcp.es.js` (607 KB) | `vite.config.mcp.ts:33` |
| same bin, `dev`/`compile`/`eject`/`validate` | `construct/cli-entry.ts` → `dist/construct-cli.es.js` (139 KB) | `vite.config.construct-cli.ts:13` |
| `typesVersions.construct` | same `public.d.ts` | `packages/ui/package.json` |

`.` / `./solid` / `./state` / `./wire` / `./schemas` contain **no** agent-tooling code — `vite.config.barrel.ts:27` excludes `src/agent-tooling/**` from the barrel dts on purpose.

---

## 3. Build/test plumbing naming agent-tooling

**36 plumbing sites.** One line each: what it does / what changes.

**Vite (5)**
1. `packages/ui/vite.config.mcp.ts:33` — SSR-bundles `mcp/stdio.ts` → `dist/mcp.es.js`; **moves to `packages/mcp` verbatim**, output goes to `packages/mcp/dist`, and `@kitn.ai/ui` becomes an `external` (today its `@kitn.ai/ui/schemas` import resolves to `dist/schemas.js` built one step earlier in the *same* package).
2. `vite.config.construct-cli.ts:13` — same, `construct-cli.es.js`; same move.
3. `vite.config.construct.ts:47,48,49,61,62,71` — builds `./construct` + a scoped `vite-plugin-dts` pass over `construct/{public,schema,schema-url}.ts` and `blocks/{registry,forms}.ts`; its header comment (`:78-81`) explicitly relies on the barrel build having already emitted `dist/primitives/url-scheme-policy.d.ts` for `schema.d.ts`'s relative import — **that cross-package `.d.ts` resolution breaks the day `schema.ts` lives elsewhere** and must become a `@kitn.ai/ui/...` specifier (see §1's NEEDS-NEW-SUBPATH for `isSafeUrl`).
4. `vite.config.construct-templates.ts:26,27,36` — the deliberately zod-free `./construct/templates` entry; moves unchanged, but the "ZERO imports in the emitted chunk" invariant that create-kai's build enforces must be re-asserted from the new location.
5. `vite.config.barrel.ts:27` — `dts` exclude `'src/agent-tooling/**'`; **delete once the directory is gone** (it becomes a no-op that lies).

**tsconfig (4)**
6. `packages/ui/tsconfig.mcp.json` — the entire file exists for `include: ["src/agent-tooling/mcp/**/*.ts"]` with `lib: ["ESNext"]`, `types: ["node"]`, no DOM/JSX. `docs/coupling-map.md:237` calls it "what actually keeps `agent-tooling/mcp/**` honest." **It becomes `packages/mcp/tsconfig.json`** and drops out of `packages/ui`'s `typecheck` chain.
7. `tsconfig.mcp.json` `paths` (`"@kitn.ai/ui/schemas": ["./dist/schemas/index", "./src/schemas/index"]`) — the dist-first ordering documented at length in the file and in `CLAUDE.md`. **In `packages/mcp` the `src` fallback is no longer reachable** (there is no sibling `src/schemas`); it becomes `["../ui/dist/schemas/index"]` or just resolves through the workspace symlink — which means the "green on an unbuilt tree" property this comment defends is *lost*, and `packages/mcp`'s typecheck acquires a hard `nx build ui` prerequisite. This is the single most under-appreciated regression in the move.
8. `packages/ui/tsconfig.json:19` — `exclude: [... "src/agent-tooling/mcp"]`; delete after the move.
9. `packages/ui/tsconfig.tests.json:23` — owns `tests/**` incl. `tests/agent-tooling/**`; those files move to `packages/mcp/tests` and out of this pass.

**Vitest (4)**
10. `packages/ui/vitest.config.ts` `resolve.alias` `/^@kitn\.ai\/ui\/schemas$/` → `src/schemas/index.ts` — exists *solely* because agent-tooling imports the public specifier (a 25-line comment says so). **In `packages/mcp` this alias is wrong**: the workspace symlink already resolves it to `packages/ui/dist/schemas.js`, so `packages/mcp`'s vitest needs a built ui, or its own alias to `../ui/src/schemas/index.ts`.
11. `packages/ui/vitest.config.ts` `test.css.include: [/compiled\.css/, /theme\.css/]` — the `theme.css` entry is there for `agent-tooling/mcp/tools/theme.ts` (named in the comment). Moves with the tool.
12. `packages/ui/emitted-code-tests.ts:143,152,158` — `EMITTED_CODE_TEST_DIR = 'tests/agent-tooling'`, the glob and the mirrored exclude that keep `unit` and `emitted` from double-collecting. Whole contract file moves.
13. `packages/ui/vitest.config.ts` `projects[1]` (`name: EMITTED_PROJECT`, `testTimeout: EMITTED_CODE_TIMEOUT`) — the `emitted` project itself; becomes `packages/mcp`'s.

**Scripts (18)**
14. `scripts/gen-catalog.mjs:21,155,156` — reads `registry.ts` + `archetypes.ts`, writes `src/agent-tooling/catalog/derived.json`; **cross-package generator** afterwards (a `packages/ui` build:api step writing into `packages/mcp/src`, or it moves).
15. `scripts/gen-blocks.mjs:67,68` — imports `blocks/registry.ts` + `registry.ts`, writes `packages/ui/dist/blocks/**`. Reads mcp, writes ui: **an NX `dependsOn` inversion**.
16. `scripts/gen-construct-schema.mjs:46,60` — TS→JSON-Schema from `construct/schema.ts` into `construct.v1.schema.json`.
17. `scripts/gen-construct-template-fixtures.mjs:36,39` — `templates.ts` → `construct/fixtures/templates/*.json`.
18. `scripts/gen-llms-programmatic.mjs:147,163` — extracts `CHAT_REQUEST_BODY_DECL` out of `route-emit.ts` for `llms-full.txt`; hard-fails with a named message if it moves. (`gen-llms.mjs:18` also names `mcp/tools/reference.ts`.) CLAUDE.md's "never run `gen-llms.mjs` standalone" warning applies to whichever package ends up owning it.
19. `scripts/verify-scaffold-compiles.mjs:1650` — esbuild-bundles `registry.ts` for the live axes; `:1811` — bundles `mcp/tools/scaffold.ts`; `:424` — derives the `MessagePart` variant list from `packages/ui/src/elements/chat-types.ts`. **Reads both sides. Becomes a cross-package gate.** Also still carries the hand-written `FRAMEWORKS` at `:326` (`coupling-map.md:122`).
20. `scripts/lint-silent-drops.mjs:89,90` — `UNION_FILE = src/elements/chat-types.ts`, `WIRE_DIR = src/wire`. Stays entirely in `packages/ui`; it is the *other* reader of the same union (see §4).
21. `scripts/verify-construct.mjs:99,311` + `:100 BIN = bin/mcp.js`, `:103-104` requires `dist/kai.es.js` **and** `dist/construct-cli.es.js` — runs `node bin/mcp.js eject` for real, installs, tscs, builds, bundles. **After the split it needs artifacts from two packages**: ui's element bundle + mcp's CLI.
22. `scripts/verify-generated-sync.mjs:140,146,153-159,183` — 11 entries pinning agent-tooling generated artifacts as in-sync-with-source. All become cross-package.
23. `scripts/verify-artifact-fresh.mjs:174` — `derived.json` freshness.
24. `scripts/lint-catalog-drift.mjs:685` + `scripts/lib/import-catalog.mjs:19` — resolve every authored catalog claim against `derived.json` **and the element tree**; `coupling-map.md:248` says its ground truth is `derived.json` and it inherits freshness from `verify:generated`. Cross-package after the cut.
25. `scripts/verify-blocks.mjs:82,83` — imports `blocks/registry.ts` + `registry.ts`, compares each block against a committed baseline built from `packages/ui/dist`.
26. `scripts/acceptance-pack.mjs:49,1411` — the acceptance deck over `catalog/`.
27. `scripts/verify-pack-weight.mjs` — `MAX_FILE_BYTES = 64 KiB` (`:73`), `MAX_UNPACKED_BYTES = 11.85 MiB` (`:412`), `ALLOWED_ROOT_PREFIXES = ['dist/','bin/','frameworks/']` (`:92`). Its comment history at `:194,209,232,312-326` is *entirely* about agent-tooling weight (`derived.json` at 97.7 KiB, `scaffold.ts` at 326.9 KiB, `dist/mcp.es.js`). See §5.
28. `scripts/verify-quarantine.mjs` — audits `tsconfig.tests.json` excludes; runs *first* in `typecheck` precisely because "the MCP pass is red on any unbuilt tree" (`CLAUDE.md`). Once the MCP pass leaves `packages/ui`, **that ordering rationale evaporates** and the comment must be rewritten rather than silently kept.
29. `scripts/measure-timings.mjs:82,497` — `--target=emitted|unit`; the `emitted` target follows the tests to `packages/mcp`.
30. `scripts/lint-gate-parity.mjs:74` — asserts `docs/superpowers/**` gate lists equal the `test` job's step list in `.github/workflows/test.yml`. **Every CI step you add/rename/move for `packages/mcp` re-fires this.**
31. `scripts/lint-threshold-derivation.mjs` — "no number without a producer"; the pack ceilings and timings are in scope.

**CI (5)** — `.github/workflows/test.yml`
32. `:622` `verify:scaffold` — needs a built ui *and* mcp.
33. `:633` `verify:construct` — needs `bin/mcp.js` + `dist/construct-cli.es.js` + `dist/kai.es.js`.
34. `:741` `vitest run --project=emitted` — pinned by `packages/ui/tests/agent-tooling/emitted-project-wiring.test.ts` (`:736` comment; `coupling-map.md:69`), which **fails if CI stops naming `--project=emitted`** — so the test and the workflow line must move in the same commit.
35. `:395` / `:827-830` `verify:pack` (both packages, under the release-pinned npm) — a third package means a third pack check or an explicit decision not to publish it.
36. `:136` `lint:silent-drops`, `:145` `lint:catalog-drift`, `:332` `lint:thresholds`, `:360` `verify:generated`, `:363` `nx typecheck ui`, `:777-783` create-kai build/typecheck/test — all currently single-`--filter` invocations that become two-package.

Also: `.coderabbit.yaml:128` scopes review instructions to `packages/ui/src/agent-tooling/**` — a path rename, one line.

---

## 4. Derived-list couplings that cross the new boundary

Four guards read **both sides**; these are the rows in `docs/coupling-map.md` that would become cross-package:

- **The `MessagePart` union — three readers, two of which would end up on opposite sides.** Source: `packages/ui/src/elements/chat-types.ts` (stays in ui).
  - `scripts/lint-silent-drops.mjs:89` reads it to police `src/wire/**` — **ui-only, unaffected.**
  - `scripts/verify-scaffold-compiles.mjs:418-470` derives the same list to assert the emitted Solid `renderPart` has a `<Match>` per variant — **becomes ui-source → mcp-emitter.** `coupling-map.md:117` and `CLAUDE.md`'s verify:scaffold paragraph.
  - `partConsumption` in `packages/ui/src/agent-tooling/catalog/surfaces.ts` — a hand-written table of which element consumes which variant, lint-checked by name (`coupling-map.md:117`: "a seventh variant covered by no record fails the lint by name"). **Authored prose in mcp about elements in ui.**
- **The element registry / manifest, read by `component_reference`.** `mcp/manifest.ts` reads `dist/custom-elements.json` at runtime with a *hard-coded three-hop* to the package root and an identity check `name === '@kitn.ai/ui'` (`manifest.ts:138,147,150-157,178-190`), plus `mcp/manifest.ts:249` importing `src/elements/element-manifest.json` at build time. `coupling-map.md:232` — "Element data reaches the MCP by reading `dist/custom-elements.json` at runtime." **This is the #1 breakage**: the hop and the name check both fail from `packages/mcp` and the error message is engineered to be loud, so it fails safely, but it fails.
- **`derived.json` ← `gen-catalog.mjs`.** `coupling-map.md:174`: sources are `element-meta.json`, the `MessagePart` union, `agent-tooling/registry.ts`, `archetypes.ts`, `theme.css` — **three ui inputs, two mcp inputs, one mcp output**, gated by `verify:generated` (`coupling-map.md:172`) whose freshness `lint:catalog-drift` inherits (`coupling-map.md:248`).
- **The integration registry.** `coupling-map.md:121`: `registry.ts` feeds `verify:scaffold`'s axes, the route-contract harness, `listGatewayGroups()` **and `packages/create-kai/src/catalog.ts`** — a three-package fan-out after the cut. `coupling-map.md:123` adds `listSurfaceProbes()` in `archetypes.ts` → verify:scaffold's surface axis **and create-kai's feature validation**.
- Also crossing: `coupling-map.md:140` (`TAG_RE` in `construct/schema.ts` ↔ `CONSTRUCT_TAG_RE` in `create-kai/src/wizard.ts`, an admitted hand-mirror because the const is unexported — extraction is the chance to export it); `coupling-map.md:141` (`templates.ts` → 4 consumers incl. the browser builder in `packages/ui/src/components`); `coupling-map.md:190` (`chatRoutePreamble` → both the MCP and create-kai, guarded by `routeSymbolsProblem`); `coupling-map.md:199` (create-kai's bundle must never reach `agent-tooling/mcp/` or zod — 203 kB → 904 kB when it did); `coupling-map.md:102` (hand-typed version string in `mcp/server.ts:18`, already wrong, enforced by **NOTHING** — a separate `packages/mcp` version makes it wrong in a new way); `coupling-map.md:226-239` (the §8 module-graph bullets, "**Enforced by: NOTHING**" for every one).

---

## 5. Consumer contract and the three options

**Today.** `packages/ui/package.json` `"bin": { "kai-mcp": "./bin/mcp.js", "kai": "./bin/mcp.js" }`. `bin/mcp.js:27-34` reads `argv[2]`, asks the pure `decideEntry()` in `bin/route.js` (`mcp`/undefined → server; `dev|compile|eject|validate` → construct CLI; anything else → exit 2), then `import()`s `../dist/mcp.es.js` or `../dist/construct-cli.es.js` via `new URL(..., import.meta.url)`. So `npx @kitn.ai/ui mcp`, `npx @kitn.ai/ui dev x.construct.json` (docs: `apps/docs/src/content/docs/guides/drop-in-widget.mdx:23,66,74`, `guides/for-ai-agents.mdx:18`) and the installed `kai`/`kai-mcp` binaries are all one file → two dist bundles in the *same* tarball. `kai dev` additionally serves `dist/builder-page` (384 K), `dist/gallery` (1.1 M) and `dist/theme-studio` (216 K) resolved from `import.meta.url` (`construct/dev.ts:576-612`), and `construct/local-kit.ts:162` sniffs a source checkout by `existsSync(<pkgRoot>/src/agent-tooling/construct/cli.ts)` + `<pkgRoot>/../../pnpm-workspace.yaml`.

**Option (a) — `@kitn.ai/ui` depends on `@kitn.ai/mcp`, keeps the bin.**
Breaks: nothing for the consumer; `npx @kitn.ai/ui mcp` and `kai` keep working byte-compatibly if `bin/mcp.js` resolves the entry through `import('@kitn.ai/mcp/stdio')` instead of a sibling `dist/` URL. `manifest.ts`'s three-hop + `name === '@kitn.ai/ui'` check must be rewritten to resolve the *dependency's* package root (`import.meta.resolve('@kitn.ai/ui/package.json')`), and `local-kit.ts:162`'s source-checkout sniff must pick a new marker. `dev.ts`'s `dist/{builder-page,gallery,theme-studio}` walks must resolve into `@kitn.ai/ui` rather than `..`.
Cost at publish: `release-please-config.json` gains a third `packages/mcp` entry, and `.github/workflows/release-please.yml:221` (`for pkg in packages/ui packages/create-kai`) gains `packages/mcp` **first in the order** — `coupling-map.md:61-62` records that the loop order is load-bearing (ui before create-kai) and that a package in the config but not the loop is never published *and nothing says so*. The `node-workspace` plugin already handles the `workspace:*` → `^x.y.z` rewrite. Adding a third package does **not** change the branch name (that flip happened at 1→2, `coupling-map.md:61`).
`verify:pack`: ui's tarball *shrinks* (mcp.es.js 607 K + construct-cli.es.js 139 K + construct*.js 53 K leave), buying headroom under the 11.85 MiB `MAX_UNPACKED_BYTES` — but ui now carries a runtime `dependencies` entry that npm installs for every consumer of the *component library*, which is a real regression for a package whose whole pitch is "web components." Mitigate with `optionalDependencies` or a lazy `npx`-time install, both of which have their own failure modes.

**Option (b) — MCP publishes separately, ui's bin prints a pointer.**
Breaks: `npx @kitn.ai/ui mcp` and `npx @kitn.ai/ui dev` — both documented, both in the wild, both in every agent harness config anyone has already written. `verify:construct` (`scripts/verify-construct.mjs:100`) drives `node bin/mcp.js eject` for real and would have to be repointed. `coupling-map.md`'s "the tree is not the tarball, and the tarball is not what `npx` runs" applies exactly here: a pointer message is the *loudest* possible version of a breaking change, which is the repo's stated preference ("decide loudly"), but it is still breaking pre-1.0 with `bump-minor-pre-major: true` — a `feat!` = minor.
Cost at publish: cleanest — three independent packages, no cross-dep, ui's tarball drops ~800 K and ui loses `@modelcontextprotocol/sdk` from `dependencies`.
`verify:pack`: best outcome. ui gets ~0.8 MiB of headroom on the 11.85 MiB ceiling and `bin/` could shrink to nothing; `packages/mcp` needs its own ceiling (`scaffold.ts` at 326.9 KiB is over `MAX_FILE_BYTES` but lives in `src/`, which mcp need not ship).

**Option (c) — build-time bundle of `packages/mcp` INTO `packages/ui/dist`.**
Breaks: nothing at all for the consumer — `bin/mcp.js` keeps `../dist/mcp.es.js`, `manifest.ts`'s sibling-manifest branch (`manifest.ts:172-175`) keeps working unchanged, `dev.ts`'s `dist/*` walks keep working, `local-kit.ts` keeps working.
Cost at publish: **zero** — `release-please-config.json` and the publish loop are untouched, `packages/mcp` is `private: true`. This is the only option where the release wiring, which `coupling-map.md:61-62` marks as enforced by **NOTHING**, is not disturbed.
`verify:pack`: also zero — the same bytes ship, the ceiling comments at `verify-pack-weight.mjs:194,209,232` stay true. The cost is that `nx build ui` gains `dependsOn: ["^build"]` on mcp (already the `targetDefaults` default in `nx.json`), and the "did the cache skip the generators" hazard in CLAUDE.md now has a second package to skip in.

**Recommendation: (c) first, then (a) as a follow-up if and when the MCP is worth publishing on its own cadence.** (c) makes the boundary real — its own `package.json`, `tsconfig`, `vitest`, tests — while holding the consumer contract, the release wiring, the bin, the manifest resolution and the pack ceiling *all* fixed, which means the extraction PR's blast radius is the module graph and nothing else. (b) is the only one that breaks documented `npx` commands and should be off the table pre-1.0.

---

## 6. Recommended cut

**PR 1 (no move, ui only):** promote the four unexported values the boundary needs — `isSafeUrl`, `CHAT_MESSAGE_ACTIONS`, `BUTTON_VARIANT_NAMES`, `studioTokens` — onto a real `@kitn.ai/ui` surface (a `./internal` or `./tokens` subpath is enough; `isSafeUrl` arguably belongs on `.` anyway per CLAUDE.md's security section), rewrite the four `construct/{schema,theme-token-policy}.ts` imports to the public specifier, and delete the now-dead relative-`.d.ts` assumption in `vite.config.construct.ts:78-81`. Ship the `element-manifest.json` and `theme.css?raw` reads behind an explicit generated-asset step so neither depends on being a Vite sibling. **PR 2:** create `packages/mcp` as `private: true` with its own `package.json` (`@kitn.ai/ui: workspace:*`), its own `tsconfig.json` (the current `tsconfig.mcp.json` body, `paths` repointed at `../ui/dist`), its own `vitest.config.ts` carrying the `emitted` project and the `css.include` theme hack, and `git mv` the 87 files plus `tests/agent-tooling/**` and `emitted-code-tests.ts` — moving `verify-scaffold-compiles.mjs`, `verify-construct.mjs`, `gen-catalog.mjs`, `gen-construct-*.mjs`, `gen-blocks.mjs`, `lint-catalog-drift.mjs` and `acceptance-*.mjs` with them, and rewriting the CI steps in `.github/workflows/test.yml` (`:622`, `:633`, `:741`) plus whatever `lint:gate-parity` then demands of `docs/superpowers/**`. **PR 3:** add the bundle-into-ui step (option (c)) so `dist/{mcp,construct-cli}.es.js`, `dist/construct*.js` and `bin/` are byte-identical, and flip `packages/create-kai` and `packages/ui/src/components/{builder-*,construct-form-paths}` + `packages/ui/apps/{builder,gallery}` off relative source imports onto `@kitn.ai/mcp` subpaths — note this makes ui's *components* depend on mcp, so those four modules may need to move to `packages/mcp` or to `apps/` in the same PR to avoid a cycle. **PR 4:** update `docs/coupling-map.md` rows §4/§8/§9 and `.coderabbit.yaml:128`.

**The three riskiest couplings:** (1) `mcp/manifest.ts:147-190` — the hard-coded `['..','..','..']` hop plus `name === '@kitn.ai/ui'`, which by design refuses to search and will hard-fail the moment the module's depth or package changes; (2) the `tsconfig.mcp.json` dist-first `paths` trick, whose "green on an unbuilt tree" property is *unavoidably* lost across a package boundary and will re-teach a fresh clone the same confusing failure CLAUDE.md spends a paragraph on; (3) the `packages/ui/src/components/builder-*` + `apps/builder`/`apps/gallery` → `construct/{schema,templates}` edge, which makes the dependency bidirectional and is the one thing that can turn this from a clean extraction into a cycle — decide where the builder UI lives *before* PR 2, not during PR 3.

---

## Summary (10 lines)

1. Inbound: **27** escaping imports from `agent-tooling` into the rest of `src/`, across 9 files → 15 modules + 2 assets.
2. Inbound classes: **PUBLIC-ALREADY 13** · **TYPE-ONLY 8** · **NEEDS-NEW-SUBPATH 4** · **JSON/RAW-ASSET 2**.
3. Only **8** of those 27 are production; the other 19 are tests that move with the code — the real boundary is 4 unexported values (`isSafeUrl`, `CHAT_MESSAGE_ACTIONS`, `BUTTON_VARIANT_NAMES`, `studioTokens`) + 2 assets (`element-manifest.json`, `theme.css?raw`).
4. Outbound: **~104 reference lines across 55 files** — create-kai 8 imports/3 files, `packages/ui/src` 11/7, `packages/ui/apps` 9/7, `tests/` 28/14, `scripts/` 33/13, vite configs 12/5, plus 2 strays.
5. agent-tooling implements `./construct`, `./construct/templates`, and both `kai`/`kai-mcp` bins via `dist/mcp.es.js` (607 K) + `dist/construct-cli.es.js` (139 K); none of `.`/`solid`/`state`/`wire`/`schemas` touch it.
6. Plumbing: **36 sites** — 5 vite configs, 4 tsconfigs, 4 vitest, 18 scripts, 5 CI steps (plus `.coderabbit.yaml`).
7. Derived-list crossings: the `MessagePart` union (`verify:scaffold` vs `lint:silent-drops` vs `partConsumption`), `dist/custom-elements.json` + `element-manifest.json` → `component_reference`, `derived.json` ← `gen-catalog` (3 ui inputs / 2 mcp), and `registry.ts`/`archetypes.ts` → verify:scaffold **and** create-kai. `coupling-map.md` rows 102, 117, 121, 122, 123, 140, 141, 172, 174, 190, 199, 226-239, 248, 249.
8. Consumer contract: `bin/mcp.js` → `decideEntry()` in `bin/route.js` → `../dist/{mcp,construct-cli}.es.js`; `kai dev` also serves `dist/{builder-page,gallery,theme-studio}` off `import.meta.url`.
9. **Recommended: option (c)** — build-time bundle of `packages/mcp` into `packages/ui/dist`. Zero consumer breakage, zero release-please/publish-loop churn (`release-please-config.json` + the `for pkg in packages/ui packages/create-kai` loop stay untouched), zero `verify:pack` ceiling movement.
10. Watch: `manifest.ts`'s 3-hop + `@kitn.ai/ui` name check, `tsconfig.mcp.json`'s dist-first `paths` (its unbuilt-tree green is lost across packages), and the `builder-*` components/apps → `construct/*` reverse edge that can make the graph cyclic.

---

## Corrections (same day, second pass by the same investigation)

- **Outbound count:** 119 reference lines across 59 files, not ~104/55 (the first regex skipped prose and path-literal lines). By files: `ui/tests` 15, `ui/scripts` 13, `ui/src` 9, `ui/apps` 7, `create-kai` 7, vite configs 5, 2 strays.
- **37th plumbing site:** `packages/ui/tests/scripts/construct-export-smoke.test.ts:44` pins `pkg.exports['./construct'].types === './dist/agent-tooling/construct/public.d.ts'`. `vite.config.construct.ts` sets `entryRoot: 'src'`, so the emitted `.d.ts` path, the `exports` map and `typesVersions` all carry the `agent-tooling` segment. Moving the source moves the emitted path. Either keep `entryRoot` aimed so the emit still lands under `dist/agent-tooling/`, or change all three together. This applies to the `packages/ui/mcp/` move too.
- **12 self-referencing path literals in 5 agent-tooling files** that no outbound search finds: `mcp/manifest.test.ts:83,112,123,137` (fixture trees for the three-hop resolution), `construct/local-kit.ts:162` + `local-kit.test.ts:39,66,179` (the `isSourceCheckout` marker), `mcp/server.test.ts:58`, `catalog/surfaces.ts:215,316,317` (corpus paths that `lint:catalog-drift` resolves against the tree).
- **Precedent for the NEEDS-NEW-SUBPATH fix:** `src/primitives/card-tags.ts:8-13` records `BUILTIN_CARD_TAGS` being split into a DOM-free leaf precisely so the Node-only MCP tsconfig could import it as source. Same template for `isSafeUrl`, `CHAT_MESSAGE_ACTIONS`, `BUTTON_VARIANT_NAMES`, `studioTokens`.
