# The coupling map

Two things in this repo depend on each other, nothing enforces the link, and it
breaks in front of a user. That was four separate defects in one day. This is the
map of every such pair there is evidence for, so the next one is a lookup instead
of an incident.

**Scan for the thing you are about to touch.** Each row says what else has to
move, how it fails, and what catches it.

- **Enforced by** is the column that matters. It names a command, a test file or
  a CI step. `NOTHING` means the next person to change that side finds out from a
  user, from a red release, or not at all.
- Every row points at a file, a symbol or a command you can run. Nothing here is
  reasoned from architecture.
- No counts, versions or timings that a script can produce — those rot. Where a
  number would go, the command that prints it goes instead.
- This is a map, not a work plan. It proposes no fixes. The unenforced rows are
  collected at the end so they are easy to find.

Related: [`docs/package-consumer-issues.md`](package-consumer-issues.md) for
consumer-facing packaging defects, and `packages/create-kai/README.md`, which
carries that package's own guard table with the incident behind each one.

---

## 1. Release and publish

Failures here surface during a publish, on a tag already cut, which is the worst
moment to learn anything.

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| The `packages` map in `release-please-config.json` | the release **branch name**, and the publish loop's literal list in `.github/workflows/release-please.yml` (`for pkg in packages/ui packages/create-kai`) | release-please defaults `separate-pull-requests` from the package count, so adding the second package moved the branch from `release-please--branches--main--components--@kitn.ai/ui` (the merge of #228, `30214c3a`) to `release-please--branches--main`, orphaning the open release PR. Removing a package flips it back. A package added to the config but not to the loop is never published, and nothing says so | **NOTHING** |
| The order of the publish loop | `packages/ui` must publish **before** `packages/create-kai`: create-kai bakes `^<kit version>` into every project it emits | Publishing create-kai first ships a scaffold whose own dependency is not on the registry yet; the user's first `npm install` fails | The loop runs under `bash -e`, so a kit publish failure aborts before create-kai is reached. That the two literals stay in this order: **NOTHING** |
| Which package released | nothing rebuilds create-kai. Its pin is frozen at the kit version of the commit where **create-kai itself** last bumped — `git show <release commit>:.release-please-manifest.json` tells you which | A kit-only release leaves the published CLI pinning the older kit, and the idempotent `npm view` guard correctly skips a republish because create-kai's own version did not change. The ordering rule stops the pin running *ahead* of the registry; nothing stops it running *behind* | **NOTHING** |
| `bootstrap-sha` | every package at once. It sits at the top level of `release-please-config.json`, not inside a `packages` entry, and it re-arms whenever the package count grows (`needsBootstrap = releasesFound < expectedReleases`) | Inert today. Adding a third package re-arms it against a sha that will by then be many cycles stale, and the walk re-proposes commits already released | **NOTHING**. No test reads it |
| `include-component-in-tag` | the tag namespace. Unset, it defaults to true for non-root paths — `git tag --sort=-creatordate` shows `@kitn.ai/ui-v*` and `create-kai-v*` | Setting it false makes two packages compete for one bare `v<x.y.z>` namespace and orphans every changelog compare link already written | **NOTHING** |
| Adding a `"."` package | a root `CHANGELOG.md` appears, and the unprefixed `release_created` output starts being emitted again | The workflow's `if:` gates lead with that now-dead output; the repo was already bitten in the other direction when the config path moved from `.` to `packages/ui` and `release_created` evaluated false while the tag and release existed | The `\|\| releases_created \|\| workflow_dispatch` fallback in every gate. **No test** |
| `prepublishOnly` in either `package.json` | the tarball. Both packages ship a gitignored `dist/` | `npm pack` on a fresh checkout emits a tarball with no code and **exits 0** — npm never checks that a `bin` target exists | `packages/create-kai/test/publish-shape.test.ts`, which derives the rule rather than asserting a string, follows `npm run` chains through intermediate scripts, rejects the `prepublish`/`postpublish` near-misses, and carries over-breadth, over-narrowness and vacuity controls. It covers **create-kai only**; `packages/ui`'s hook is unasserted |
| Whether a `verify:*` script is invoked from a workflow | the guard stops guarding, silently. `verify:pack` existed for some time invoked from nowhere automatic | A check that runs nowhere has the shape of the bug it guards against | `publish-shape.test.ts` ("the CI wiring for the tarball verifier", with a would-notice-if-deleted control), `packages/ui/tests/agent-tooling/emitted-project-wiring.test.ts`, and the `packages/ui/tests/scripts/*-guard-wiring.test.ts` set. Guards outside that set: **NOTHING** |
| Anything at all on `main` | the publish gate, which must pass before `npm publish` runs. `release-please.yml` and `test.yml` are separate workflows on the same `push: main` trigger, so they race — and until the gate existed the publish won, because the release job has no `needs:` and nothing else consulted a status | A red `test` on main did not stop `npm publish`. `gh api repos/kitn-ai/ui/commits/<sha>/check-runs --jq '.check_runs[] \| "\(.name) \(.conclusion) \(.completed_at)"'` on `af6f7717` and `12a51dad` prints the race: `release` completed before `test` did, and on `12a51dad` `test` concluded `failure`. A `needs:` cannot fix it (cross-workflow), and neither can gating on the release PR — release-please opens it with `GITHUB_TOKEN`, so its runs sit in `action_required` and never execute (`4b276894`, a release-branch head, carries zero check runs), which is why release PRs merge with `--admin` | `.github/scripts/require-green-checks.mjs`, between release-please and the publish steps: it queries the checks API for `github.sha` — the exact commit being published — and refuses unless every required context is `completed` with conclusion `success`, waiting while they run and denying by default on absence, timeout or an unreadable API. `packages/ui/tests/scripts/publish-gate-wiring.test.ts` fails if it is removed, reordered after the publish, given `continue-on-error`, or if its `if:` drifts from the publish step's |
| A release — any version bump release-please makes | the CDN pin literals under `packages/`, `apps/`, `examples/` and the root README. `release-please-config.json` carries no `extra-files`, so nothing rewrites them, and `lint:cdn-pins` asserts they **equal** `packages/ui/package.json` | The release commit bumps the version and leaves every pin one release behind, so the required `test` job fails on **every** release commit. Observed on `8d56f1d7` (`@kitn.ai/ui@0.25.1`): `test` concluded `failure` at 14:46:16 and the publish completed at 14:47:36 regardless. Ungated that was a red `main` nobody blocked on. **With the publish gate above it blocks the release instead** — correctly, since the commit really is red, but every release now needs `node packages/ui/scripts/lint-cdn-pins.mjs --fix` landed before it can ship | `lint:cdn-pins` (required CI) catches the mismatch, but only once the release commit already exists. That the pins are rewritten *as part of* the release: **NOTHING** |
| The `permissions:` block in `release-please.yml` | the publish gate's API reads. `permissions:` is an allowlist, so an unlisted scope is `none` — the gate needs `checks: read` and `statuses: read` alongside the existing `contents` / `pull-requests` / `id-token` writes | Drop either and the gate cannot read the commit's checks. It fails **closed**, so nothing unvetted ships — but every release is blocked until somebody reads the log, which is the other way this ships broken | `publish-gate-wiring.test.ts` asserts both scopes are granted |
| The required contexts in the branch ruleset | the `--require` list in the publish gate step. `GITHUB_TOKEN` cannot read rulesets — that needs `Administration: read`, which the workflow `permissions:` block has no key for — so the list cannot be derived at runtime and is a literal | A context added to the ruleset is not gated on: the release ships having satisfied only the contexts the literal names. The reverse is safe and loud — naming a context that does not exist makes the gate refuse every release rather than publish one. Print the live list with `gh api repos/kitn-ai/ui/rulesets/18328421 --jq '.rules[] \| select(.type == "required_status_checks") \| .parameters.required_status_checks[].context'` | **NOTHING**. `publish-gate-wiring.test.ts` asserts the list is non-empty, not that it matches the ruleset |
| Root `.npmrc` | `enable-pre-post-scripts=true` is what makes pnpm fire `prepublishOnly`, `prebuild` and `postbuild`; `build:css`, `build:theme` and `build:api` are only reachable through those hooks | Delete the line and `nx build ui` prints success while generating nothing, while `npm publish` still runs them — CI and the shipped artifact diverge | **NOTHING**. Recorded as the guarantee in `docs/superpowers/plans/2026-06-29-monorepo-migration-pr1.md` |
| Root `.npmrc` | `node-linker=hoisted` means one version of a package wins for the whole workspace, so a devDependency range in **any** workspace package is a workspace-wide fact | An `@types/node: ^22` copied into create-kai downgraded the hoisted `@types/node` for `packages/ui` and timed out its emitted-code suite. Nothing in that failure pointed back | `sharedDevDepsProblem` (`packages/create-kai/src/build-guards.ts`) fails the CLI build on a disagreement — but only between create-kai and `packages/ui`. Starters pinning a different range: **NOTHING**, named at `packages/ui/scripts/verify-starters.mjs` |

---

## 2. What survives `npm pack`

The working tree, the build output and the tarball are three different things,
and the gaps between them are silent by construction.

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| Add a dotfile to a starter that npm strips at publish | a row in `STRIPPED_DOTFILES` (`packages/create-kai/src/template-dotfiles.ts`). The rename on the way in (`scripts/build.mjs`), the un-rename on the way out (`src/generate.ts`) and the pack check (`scripts/verify-pack.mjs`) all read that one list | `.npmrc` was written as a copy of the `.gitignore` mechanism rather than a row in it, so `create-kai@0.1.0` shipped two of eight frameworks that died on `ENOENT ... open '.../myapp/.npmrc'` on the first command a user runs. Every local check was green — they read `dist/templates` on disk, where the file always exists | `scripts/verify-pack.mjs` (per-template `_gitignore`, a literal-dotfile scan of the **built tree** because npm strips the file before it reaches the listing, and every file a patch table OPENS must be in the tarball) plus a round-trip test in `test/generate.test.ts` with an explicit vacuity assertion over the same list. Adding a row arms all of them |
| The `files` negations in `packages/ui/package.json` | four `exports` subpaths resolve **outside** `dist/`: `./theme.css`, `./element-meta.json` and `./icon-names.json` (the last two into `src/`), and source maps point into `src/` too | A broader negation ships a package whose `exports` map points at nothing. `scripts/emit-subpath-dts.mjs` checks declared `types` targets **on disk**, not in the tarball; `verify-pack-weight.mjs` reads the packed listing but only weighs it | **NOTHING**. create-kai has exactly this check; `packages/ui` does not |
| Add a large generated file under `packages/ui/src/` | the allowlist in `scripts/verify-pack-weight.mjs`, each entry carrying a written reachability reason | 300 KB of generated JSON rode along to every consumer for months: nothing imported it, `exports` could not reach it, and no check looked at what gets PACKED | `verify:pack` — a precise rule (every packed file outside `dist/` over the threshold must be allowlisted) plus a crude total-size ceiling as the backstop for growth inside `dist/`, where content-hashed names make an exact allowlist impossible |
| An emitted chunk filename in any `vite.config.*.ts` | the `sideEffects` globs in `packages/ui/package.json`, hand-written against filenames the build produces (`./dist/register-impl-*.js`, `./dist/elements/*.js`) | A consumer's bundler tree-shakes away every `kai-*` registration. 0.19.0 shipped a blank page with a silent console; Vite 6 and 7 build the same broken package fine | `verify:consumer` (`scripts/verify-consumer-sideeffects.mjs`) packs the build into a throwaway app, bundles it with a Rolldown-based Vite, and counts `customElements.define` |
| `packages/create-kai`'s `files` or `bin` | `dist/templates/**` and `dist/index.js` must be in the tarball | `npx create-kai` installs cleanly and then finds no template | `scripts/verify-pack.mjs`, wired into `prepublishOnly` and run twice in CI. Its template set is the packed listing **union** the on-disk dirs, because a template that packed to nothing is simply absent from the listing |

---

## 3. Values baked in at build time

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| The `define` keys in `packages/create-kai/scripts/build.mjs` | the matching `declare const` in `packages/create-kai/types/globals.d.ts` | Rename one side only: tsc still passes (the `declare` is still there), esbuild emits the bare identifier, and `npx create-kai` throws `ReferenceError` on first run | **NOTHING** |
| `packages/ui/package.json`'s `version` | `__KIT_VERSION__` → `DEFAULT_KIT_RANGE = ^${__KIT_VERSION__}` (`packages/create-kai/src/index.ts`) → the pin in every emitted project's `package.json` and in its `kai.json` | Pre-1.0 a caret cannot cross a minor, so a kit minor strands a published create-kai on a range that cannot resolve forward | Templates and pin come out of one build, so they cannot disagree with each other. That the pinned range is **publishable**: **NOTHING** — `packages/create-kai/test/kit-contract.test.ts` names `verify-pin.mjs` as the check for it, and no such file exists (`ls packages/create-kai/scripts`). The substitute is a hand-run recipe in that package's README, and `npm run smoke` is in no workflow |
| The React wrapper build (`packages/ui/vite.config.react.ts`) | the `'use client';` banner Rollup would otherwise strip from the source | `dist/react.js` stops being a client module in an RSC app | `verify:react-wrappers`, which self-tests both directions |
| `packages/ui/package.json`'s `version` | `serverInfo` in `packages/ui/src/agent-tooling/mcp/server.ts` is a **hand-typed** version string, and it is what every MCP harness reads on initialize | Already wrong — it names a version several minors behind. `server.test.ts` never asserts it | **NOTHING** |
| The `pdfjs-dist` CDN pin | `PDFJS_VERSION` in `packages/ui/src/primitives/pdf-preview.ts`, which ships in the browser bundle as a live CDN URL | Not cross-checked against any dependency entry. Exact-pinned by design; overridable via `configurePdfPreview` | **NOTHING** |

---

## 4. Derived lists

One source, many re-fires. These are the good kind of coupling: adding a member
makes every consumer object on its own. They are here so you know what will go
red, and so nobody quietly turns a derivation back into a literal.

| Source of truth | Derived by | What adding a member does | Enforced by |
|---|---|---|---|
| The `MessagePart` union in `packages/ui/src/elements/chat-types.ts` | three independent derivations: `scripts/lint-silent-drops.mjs` and `scripts/verify-scaffold-compiles.mjs` each TS-parse the union (each with its own anti-vacuity floor), and `src/state/stream.ts` derives a forbidden-key set from it at the type level | A seventh variant re-fires **every waived site** in `src/wire/`, including waivers written before it existed, and requires a `partAs(part(), '<new>')` branch in the emitted Solid `renderPart` | `lint:silent-drops` (required CI, no build, `--self-test`) · `verify:scaffold` (needs a build) · `tsc` plus the `@ts-expect-error` pins in `src/state/stream-types.test.ts`. The best-guarded list in the repo |
| `src/wire/media-types.ts`'s `ENCODABLE` array | `encodableMediaTypes()`, the composer's `accept`, and every scaffolder emitter's `accept` | A new row teaches the encoder and widens the picker at once | `scaffold.test.ts` asserts both the emitted value **and** that no emitter contains a media-type literal at all — the second exists because the first cannot see a copy until `ENCODABLE` next changes, one release too late |
| The integration registry (`packages/ui/src/agent-tooling/registry.ts`) | `verify:scaffold`'s front-end and route axes (esbuild-bundled and imported at run time, with a refusal to fall back to a hand-written list), the route-contract harness, `listGatewayGroups()`, and `packages/create-kai/src/catalog.ts` | Registering an integration moves the cell counts by itself. No count is pinned in the script; it prints what it ran | `verify:scaffold` · `emitted-route-contract.live.test.ts`, whose exclusions must each name a re-derived reason. **Except** `src/agent-tooling/mcp/matrix.test.ts`: its loop is derived from the registry but the `SIGNATURE` table it indexes is hand-written and has no key for two registered integrations. Nothing asserts that table covers the registry — contrast `scaffold.test.ts`, which makes exactly that completeness assertion for `COMPONENT_ENTRY` over `Framework.options` |
| The `Framework` enum in `src/agent-tooling/types.ts` | `scaffold.test.ts` derives its axis from `Framework.options` and says why: "a hand-written list is how a target gets added and covered by nothing" | A twelfth member is covered by that test | **NOTHING** for the compile gate: `verify-scaffold-compiles.mjs` carries a hand-written `FRAMEWORKS` plus parallel `EXT` and `PROJECT` maps, and nothing asserts they equal `Framework.options`. This is the one place the repo's own stated rule is broken inside the gate that states it |
| `listSurfaceProbes()` in `src/agent-tooling/archetypes.ts` | the surface axis of `verify:scaffold`, and create-kai's feature validation | Read the `WHY NOT THE POWER SET` comment before touching it | `assertSurfacesAreDistinct()` refuses two surfaces with identical component lists, and refuses one without `kai-chat` |
| The `# Runtime:` label the scaffolder emits | `RUNTIME_PROJECT` in `verify-scaffold-compiles.mjs`, which picks the tsc project modelling that host's globals | A new host must be added to the map | **Hard failure** on an unrecognised label, never a skip — the correct shape for a string-keyed map |
| `packages/ui/src/elements/register-impl.ts` (hand-maintained) | `scripts/gen-elements-manifest.mjs` writes `src/elements/element-manifest.json`, which is imported at runtime by `src/elements/autoloader.ts`, read by `verify-elements-bundle.mjs`, `verify-consumer-sideeffects.mjs` and `gen-element-dts.mjs`, and drives the per-element build entry points | Register an element and commit without rebuilding and the committed manifest is stale, so the autoloader cannot lazily register it | **NOTHING**. It is a committed generated file and it is the one derived artifact **missing** from `verify-generated-sync.mjs`'s list |
| The `src/elements/` directory | `scripts/gen-element-api.mjs` scans the directory, minus a `SKIP` set — a **different** element set from the one `register-impl.ts` defines | A facade on disk but not imported by `register-impl.ts` lands in `element-meta.json`, the CEM, the docs tables and the React wrappers, but is not in the register-all bundle. That is `remote`'s documented state, and nothing distinguishes it from an accidental omission | **NOTHING** for the divergence itself |
| `src/primitives/card-schemas/` | the expected set in `verify-schemas-exported.mjs` is a `readdirSync` of that directory, never a literal | A new schema is covered the day it is added | `verify:schemas` · `verify:tool-schemas` (every keyword in any authored schema must be classified by both provider tables) |
| An eighth card **type** | `cardSchemas`, `cardSchemaNames`, `cardTools()` and the parity tests all move | `CARD_TYPES` in `scripts/gen-card-validation-schemas.mjs` is a hand list, and the only test over it compares the generated artifact back against **the generator's own list** — a circular check. The browser-side validator silently omits the new type. `BUILTIN_CARD_TAGS` and `BUILTIN_CARD_COMPONENTS` are hand-parallel to it and to each other | **NOTHING** ties `CARD_TYPES` to `Object.keys(cardSchemas)` |
| A `--kai-color-*` token in `packages/ui/theme.css` | `dist/theme.tokens.css` is a transform of it, so that half cannot drift | The `kai` MCP's `theme` tool hardcodes token names in `cssBlock()` and never reads `theme.css`; its test hardcodes the same literals. Rename a token and the tool keeps emitting the dead name, the test keeps passing, and an agent pastes a block that themes nothing. The derived pattern exists in the repo — `src/stories/docs/theme-tokens.tsx` reads the loaded CSS at runtime — just not here | **NOTHING** |
| A starter's own `.gitignore` | `templateSkips()` in `packages/create-kai/src/build-guards.ts` decides what is not copied into a template | The basename list it replaced could not express `src/routeTree.gen.ts` or build trees, so template contents differed between CI and a clean checkout | `gitignoreProblem` (a starter must have one) and `templateIgnoreProblem` (a negated rule is refused rather than mis-read) |
| The `exports` map, or `examples/starters/` | `verify-ssr-imports.mjs` derives its entry list from `exports`; `verify-starters.mjs` derives its roster from the directory and each starter's own kit dependency spec | A new subpath or a ninth starter is covered the day it lands; an unclassifiable starter is a hard failure, not a skip | `verify:ssr` · `verify:starters` |

---

## 5. Tool versions

Anything that parses another tool's output is coupled to that tool's version, and
the versions differ between jobs.

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| The npm the release job installs (`npm install -g npm@…` in `release-please.yml`) | the same version in `test.yml`'s second `verify:pack` step | npm 12 moved the top level of `npm pack --json` from an array to an object keyed by package name. `verify:pack` is the second half of create-kai's `prepublishOnly`, and npm 12 was the one npm it had never run under — so it threw at publish time, after the kit had already gone out, leaving a broken create-kai on the registry with its own fix unpublishable | `packages/create-kai/test/publish-shape.test.ts` asserts the two workflows name the same version, with a vacuity control and a drift control. The parser (`scripts/pack-listing.mjs`) is separately graded against committed captures of both shapes |
| The npm that `packages/ui`'s scripts run under | `scripts/verify-pack-weight.mjs`, `scripts/verify-consumer-sideeffects.mjs` and `scripts/verify-dts-consumer.mjs` all still assume the pre-npm-12 array shape (`JSON.parse(...)[0]`) | The same defect, one package over, in three places. `verify-pack-weight.mjs` slices from the first literal `[`, so under the keyed shape it throws a syntax error rather than the legible `undefined.files` | **NOTHING**. None of the three imports `pack-listing.mjs`, and the skew guard is scoped to create-kai |
| `node-version` in any workflow | all of them. `release-please.yml` says so in a comment: it MUST match `test.yml`, or you publish a compiled package built on a Node major nothing tests on | Prose only. Related and also unguarded: the pinned npm declares an `engines.node` floor against a floating `node-version: 22`, and a floor moving raises `EBADENGINE` at publish time on a cut tag | **NOTHING** for the match. The exact npm pin is the mitigation for the engines half |
| `VITE` in `packages/ui/scripts/verify-consumer-sideeffects.mjs` | what the consumer guard actually proves. It pins a Rolldown-based Vite specifically because the Rollup-based one passes on a broken package, and the kit's own devDependency is the older major | A floating range resolved from the registry at run time, so a new minor changes what CI tests with no commit. Failure reads as missing element registrations, not as a version problem | **NOTHING**, on either the pin or its deliberate divergence from the kit's own Vite |
| `typescript@5` in `packages/ui/scripts/verify-dts-consumer.mjs` | what the shipped `.d.ts` are type-checked against | Same floating-range exposure | **NOTHING** |
| A route host's typings | they must stay **real devDependencies** (`@sveltejs/kit`, `@tanstack/react-start`, `express`, `@cloudflare/workers-types`, `@angular/ssr`, `ai`, `@langchain/*`, `@mastra/client-js`) | A `declare module` stub resolves every SDK call to `any` and the gate goes back to proving nothing | `verify:scaffold` runs a per-project probe that must produce a specific tsc error, so a package degraded to `any` fails loudly |
| A starter's tsconfig | the harness copies of those flags in `verify-scaffold-compiles.mjs` — `experimentalDecorators` + `noPropertyAccessFromIndexSignature` for Angular, `jsx: preserve` + `jsxImportSource` for Solid, and the explicit `types`/DOM split for routes | The harness goes on compiling against a config no consumer ships. `request.json()` is `Promise<any>` under the DOM lib and `Promise<unknown>` under undici's, which is why the route projects exist at all | **NOTHING** ties the harness's copies to the starters' real ones |
| `nx.json`'s `build.outputs` | what a cache restore puts back. A new emitted directory not declared there restores a partial `dist/` that nothing re-checks, and the lifecycle never runs to notice | Local only today: CI caches the pnpm store, not `.nx/cache`, so the build always runs cold. That mitigation is accidental | **NOTHING**. Hoisting `verify:dts` to its own CI step buys independence from the caching model but asserts nothing about `outputs` |

---

## 6. Generated files that live in the source tree

Some derived artifacts are committed, so a stale one shows up in a diff. Some are
gitignored, so a stale one is invisible. The build writes both into the **source**
tree, which is why an NX cache hit can restore a "successful" build that
regenerated nothing.

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| Anything `scripts/gen-element-api.mjs` reads (element facades, slots, parts, icons) | the committed artifacts it and its chained generators write: `src/elements/element-meta.json`, `src/elements/icon-names.json`, `src/elements/element-types.d.ts`, `frameworks/react/index.tsx`, `llms.txt`, `llms-full.txt`, and the marked blocks of `docs/web-components.md` | A new `::part()` was registered once with none of them regenerated. Nothing went red, and because the `kai` MCP's `component_reference` and the docs site's tables read those files, a part that existed in the shipped element was invisible to every tool a developer would use to find it | `verify:generated` (required CI). It runs the real `build:api` and diffs, never through NX; seeds each artifact with a single-use sentinel so a generator that no-ops or was deleted goes red instead of reading as in-sync; `--self-test` proves the comparator half still detects drift. Regenerate with `pnpm --filter @kitn.ai/ui run build:api` |
| `src/elements/register-impl.ts` | `src/elements/element-manifest.json` — committed, generated, and **not** in that guard's list | see §4 | **NOTHING** |
| A card schema | `src/primitives/card-validate-cards.ts` — committed and generated | | `verify:card-validation`, the same generator run with `--check` |
| `src/elements/styles.css` | `src/elements/compiled.css` — gitignored, produced by `build:css` via `prebuild` | A fresh clone or worktree without it fails a large batch of tests on `Failed to resolve import "./compiled.css?inline"`, which reads like a broken checkout rather than a missing step | **NOTHING** catches staleness; a bare `vitest` does not run `prebuild` |
| How you regenerate | never run `scripts/gen-llms.mjs` standalone. Its no-argument path falls back to reading `dist/custom-elements.json`, which drops each slot's `mode`, so it silently rewrites `llms-full.txt` with **less** data than `build:api` produced. The file says so itself, and there is deliberately no npm script for it | The oversized diff is the only tell | `verify:generated` catches the result, not the act |

---

## 7. The scaffolder and the kit

The scaffolder emits code as string literals, so the compiler is not watching. It
is coupled to the kit at three seams: the request shape, the element API, and the
starters it copies. Its templates **are** `examples/starters/*`, copied verbatim
apart from the patch tables.

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| The chat request shape | `chatRoutePreamble` in `packages/ui/src/agent-tooling/route-emit.ts` — one function, consumed by both the `kai` MCP and `create-kai`. Its symbol list is derived from the declaration text, not restated | The kit's own tests never see the emitted file; the assembly step is where declarations go missing | `routeSymbolsProblem` (`packages/create-kai/src/build-guards.ts`) grades the emitted TEXT for each declaration; `verify:scaffold` compiles it against the shipped exports map and `.d.ts` |
| The wire's content-part encoding | the preamble's `wireParts`/`wireText` branches are a hand-written restatement of what `toOpenAIMessages` produces | A silent mismatch: the route compiles, and the model receives a part it cannot read | **NOTHING** relates the two by type — the preamble is a string |
| An element **property** name | the emitted front ends in `mcp/tools/scaffold.ts` | Caught: the `emitted` vitest project mounts a real `<kai-chat>` and reads `chat.messages` / `chat.loading` off it | `pnpm --filter @kitn.ai/ui exec vitest run --project=emitted` |
| An element **event** name or its `detail` key | the same emitted front ends, once per framework flavour (`addEventListener('kai-submit', …)`, `@kai-submit`, `onkai-submit`, `(kai-submit)`) | **Not caught.** The live test synthesizes the event itself — `chat.dispatchEvent(new CustomEvent('kai-submit', …))` in `tests/agent-tooling/emitted-mock-path.live.test.ts` — so the emitted listener hears the name the test chose, not the element's. `verify:scaffold` sees strings; `scaffold.test.ts` asserts strings against strings | **NOTHING** |
| An element **attribute** name (`suggestion-mode`, `variant`, `removable`, `accept`, …) | the emitted markup | Attributes are inert strings there, and the shipped React JSX augmentation types every element as `{ [attr: string]: unknown }` | **NOTHING** for the scaffolder. The docs site does cross-check attributes against `element-meta.json`; nothing under `agent-tooling/` or `create-kai/` reads that file |
| A starter's text that a patch matches | the `find` in `PATCHES` or `GATEWAY_PATCHES` (`packages/create-kai/src/patches.ts`) | A reworded comment would ship a half-patched project — `workspace:*` instructions, or a browser tab that does not name the user's project | `patchMatchProblem` (zero matches is fatal; more than one is fatal without `multiple`) and `emittedContentProblem`, which patches in memory and greps the result |
| A starter's file layout | `framework.paths` in `packages/create-kai/src/frameworks.ts`, copied verbatim into the emitted `kai.json` and quoted in the emitted README | Nothing opens those paths at build time, so a row copied from the one above diverges silently — `solid` declared a stylesheet path its starter never had, for as long as the row existed | `appPathProblem` and `declaredPathsProblem`. Neither covers a framework still marked `planned` |
| What a gateway's route hands the browser | `BROWSER_WIRE` in `packages/create-kai/src/catalog.ts` must match the reader the go-live patch emits | The worst silent failure in the CLI: `readOpenAIStream` does not throw on a dialect it cannot read, it yields nothing, and every turn ends as an empty bubble. It cannot be derived from `streamFormat`, which describes the provider — `anthropic` is `native` and still correct here because its route re-frames | `routeWireProblem` — a declaration, not a derivation, so wiring a gateway forces someone to answer the question |
| An import in any starter | the kit must export it | create-kai pins a **published** range while starters track the workspace kit. When `parts[]` landed in the tree but not on npm, emitted projects installed cleanly and then failed the user's build | `test/kit-contract.test.ts` against the workspace kit. Against the **published** kit it is manual: `KAI_KIT_ROOT=<extracted tarball> npx vitest run test/kit-contract.test.ts` |
| What the CLI bundle imports | it must not reach `agent-tooling/mcp/` or `zod`. Read from the leaf modules at the root of `agent-tooling/` instead | Three symbols out of `mcp/tools/scaffold.ts` took `dist/index.js` from 203 kB to 904 kB and every other check stayed green — the emitted output was byte-identical. The cause is a module-scope schema build, a property of the module rather than of what you import from it | `bundleGraphProblem`, which grades the esbuild metafile's real module graph rather than a byte ceiling |

---

## 8. The module graph

This decides what could be split into its own package, and it is the layer with
no automated check at all.

- **`wire/` → `state/` is one-directional.** `src/wire/consume.ts` imports runtime
  values from `src/state/parts.ts`; nothing in `src/state/` imports `wire/` outside
  tests. Verify: `grep -rn "from '\.\./wire" packages/ui/src/state/`.
- **Both reach into `elements/` and `components/` for the type model** —
  `chat-types.ts`, `tool-types.ts`, `attachment-types.ts` — and `state/parts.ts`
  additionally takes one **value**, `classifyTool`, from `components/`. Those
  modules are a DOM-free shared type core that happens to live inside two
  component directories; they are not the component tree.
- **`components/` ↔ `elements/` is a genuine cycle with value imports both ways.**
  These two cannot be separated.
- **`agent-tooling/` is independent of the components** but takes one runtime
  value from `wire/media-types`, and imports the kit's own `@kitn.ai/ui/schemas`
  through the public specifier deliberately — a relative import of that barrel
  would drag the card registry in and force `jsx` + DOM into `tsconfig.mcp.json`.
  Element data reaches the MCP by reading `dist/custom-elements.json` at runtime.
- **Two `exports` subpaths resolve into `src/`**, so `src` has to stay in `files`
  — see §2.
- **Enforced by: NOTHING.** No dep-cruiser config, no ESLint anywhere in the repo,
  no test asserting the module graph. The nearest things are shape guards
  (`verify:dts` over emitted declarations, `verify:ssr` over entry points) and
  `tsconfig.mcp.json`'s DOM-free `lib`, which is what actually keeps
  `agent-tooling/mcp/**` honest — and which does not cover the leaf modules at the
  root of `agent-tooling/`.

---

## 9. Docs and machine surfaces that restate code

| If you change | What else moves | How it fails | Enforced by |
|---|---|---|---|
| An element name, prop, event or `::part()` | every fenced code block, every `kai-*` markup sample and every symbol named in prose under `apps/docs/src/content/docs/` | Docs are the one consumer surface with no compiler behind them | `pnpm --filter @kitn.ai/docs run verify:docs` (required CI). It reads the built `dist/*.d.ts` through the package's own exports map and `src/elements/element-meta.json` at run time — nothing baked in — compiles every snippet, and checks markup, events, parts and the scalar-vs-array attribute split against the same source. Its anti-theatre self-test must go red first, so `0 findings` cannot mean "the kit types resolved to `any`". It gates on `high` only |
| Anything a doc states as a **number or a version** | prose, not symbols, so `verify:docs` does not look | Both are wrong today: `packages/ui/README.md` and three `apps/docs` guides illustrate CDN pinning with versions several minors behind, and `guides/introduction.mdx` states a rounded element count on a page whose own generated index prints the real one | **NOTHING** |
| Anything in `README.md`, `packages/ui/README.md` or `context7.json` | `verify:docs` scans `apps/docs/src/content/docs` only | The `kai-` contract is restated in `context7.json`'s `rules` and in both READMEs, and is served to agents from there | **NOTHING** |
| Register an integration | the docs site's integrations section is a hand-written page set | Several integrations the scaffolder supports have no page. Compare `ls apps/docs/src/content/docs/integrations/` against `ls packages/ui/src/agent-tooling/integrations/` | **NOTHING** |
| Add a docs page | the hand-listed sidebar in `apps/docs/astro.config.mjs` | A slug with no page fails the Astro build; a **page with no sidebar entry is invisible and silent**. Undocumented-element coverage is reported by `verify:docs`, not failed on | Partial — one direction only |
| Any link | — | | **NOTHING**. There is no link checker in any workflow |

---

## The unenforced list

Everything above whose last column says `NOTHING`, in one place. An unenforced
coupling is a future incident; an enforced one is just a fact.

**Release**

1. The `packages` map vs the publish loop's literal list, and vs the release branch name.
2. The order of that loop (`packages/ui` before `packages/create-kai`).
3. A published create-kai pinning a kit older than the current one, after a kit-only release.
4. `bootstrap-sha` being global, and re-arming stale when a package count grows.
5. `include-component-in-tag` and the tag namespace.
6. `packages/ui`'s `prepublishOnly` (the derived rule covers create-kai only).
7. The publish gate's `--require` context list vs the ruleset's required contexts — `GITHUB_TOKEN` cannot read rulesets, so it cannot be derived. Safe direction only: a wrong name refuses every release rather than publishing an unvetted one.
8. Root `.npmrc`: `enable-pre-post-scripts=true` gating every `pre`/`post` hook.
9. Starter dependency ranges under `node-linker=hoisted`.
10. The CDN pin literals being rewritten as part of a release — release-please bumps the version, nothing updates the pins, and `lint:cdn-pins` requires equality, so the required `test` job fails on every release commit.

**Packaging**

11. `packages/ui`'s `files` negations vs the four `exports` subpaths resolving outside `dist/`.

**Build-time constants**

12. `define` keys in `create-kai/scripts/build.mjs` vs the `declare const`s in `types/globals.d.ts`.
13. Whether create-kai's pinned range is publishable — `verify-pin.mjs` is referenced and does not exist, and `npm run smoke` is in no workflow.
14. The hand-typed MCP `serverInfo` version (already wrong).
15. `PDFJS_VERSION`.

**Derived lists**

16. `src/elements/element-manifest.json` — committed, generated, imported at runtime by the autoloader, and the one derived artifact missing from `verify:generated`.
17. `matrix.test.ts`'s `SIGNATURE` table vs the integration registry it loops over.
18. `verify-scaffold-compiles.mjs`'s hand-written `FRAMEWORKS`/`EXT`/`PROJECT` vs the `Framework` enum.
19. `CARD_TYPES` in `gen-card-validation-schemas.mjs` vs `cardSchemas` — the only check over it is circular. Same for `BUILTIN_CARD_TAGS` and `BUILTIN_CARD_COMPONENTS`.
20. The `kai` MCP `theme` tool's hardcoded token names vs `theme.css`.
21. A facade in `src/elements/` that `register-impl.ts` does not import.

**Tool versions**

22. Three `npm pack --json` parsers in `packages/ui/scripts/` still on the pre-npm-12 array shape.
23. `node-version` agreement across workflows (a comment, not a check).
24. The `VITE` pin, and its deliberate divergence from the kit's own Vite major.
25. The `typescript@5` pin.
26. Harness tsconfig flags vs the real starter tsconfigs.
27. `nx.json`'s `build.outputs` completeness.

**Generated artifacts**

28. `src/elements/compiled.css` staleness.

**Scaffolder**

29. The preamble's content-part encoding vs `toOpenAIMessages`.
30. Element **event** names and `detail` keys vs the emitted front ends — the live test synthesizes the event.
31. Element **attribute** names vs emitted markup.

**Module graph**

32. Layering. No lint rule, no dep-cruiser, no test.

**Docs**

33. Version literals and counts in prose.
34. `README.md`, `packages/ui/README.md` and `context7.json`.
35. Integration pages vs the integration catalog.
36. Links.
