<!-- Read-only design by a Plan agent, 2026-09-01. Owner approved the parallel split in principle the same day; this is the input to the implementation plan. -->

# Splitting the serial `test` job — design

## 0. What forced every conclusion here

Fifteen files read `test.yml` and assume the required job is one job named `test` containing everything:

- `packages/ui/scripts/lint-gate-parity.mjs` — `const JOB = 'test'`, `MIN_RUN_STEPS = 30`. A `test` job with fewer than 30 `run:` steps is a **hard failure** ("extractor found almost nothing"), by design, because a small gate set is a set every documented list matches.
- `packages/ui/tests/agent-tooling/emitted-project-wiring.test.ts` — asserts the `test` job block contains `--project=emitted` *and* `--project=unit`.
- Twelve `packages/ui/tests/scripts/*-guard-wiring.test.ts` files — each carries its **own private copy** of `jobBlock(yaml, 'test')` and asserts the block contains its script; most also assert `--project=unit` as a vacuity canary.
- `packages/ui/tests/scripts/gate-parity-guard-wiring.test.ts` — counts `^ {8}run:` lines in the `test` block independently and requires the linter's reported count to **equal** it, and requires that independent count `> 30`.
- `.github/scripts/require-green-checks.mjs`, invoked from `release-please.yml` with a literal `--require test`.

`packages/create-kai/test/publish-shape.test.ts` is the one exception — its `testJobPins()` regex scans the **whole file**, not a job block, so it survives the split untouched. Worth knowing; it is the shape the others should move toward.

---

## 1. Step inventory

46 gates, printed by rule from the workflow itself (`node packages/ui/scripts/lint-gate-parity.mjs --list`). Times are measured where the brief gave one, estimated otherwise (marked `~`); the estimates are budgeted against the 156s of unaccounted wall left after the measured steps (1404s of the 1560s total).

<!-- gate-list: partial -- a step inventory with timings for the split design; the workflow itself is the authority, and lint-gate-parity --list prints the exact set -->
| # | Step | Time | Needs | Named guard / coupling |
|---|---|---|---|---|
| 1 | Model-spend guard (`spike-ci-guard.mjs audit`) | <1s | source, **pre-install** | coupling-map: workflows ↔ live models. Comment: "Deliberately before `pnpm install`" |
| 2 | TanStack static-server guard (`node --test`) | ~2s | source, **pre-install**, `working-directory` | "a test nobody runs is not a test"; 43-test traversal suite |
| 3 | Traversal ran a non-empty suite (`node -e`) | <1s | **the TAP file step 2 wrote to `$RUNNER_TEMP`** | anti-vacuity for #2. `node --test` over zero files exits 0 |
| 4 | `pnpm install --frozen-lockfile` | ~45s | plumbing | — |
| 5 | `lint:silent-drops` | ~2s | source | CLAUDE.md "decide loudly"; coupling-map `MessagePart` union row |
| 6 | `lint:catalog-drift` | ~3s | source | coupling-map: authored catalog ↔ `derived.json` |
| 7 | `lint:attachment-object-urls` | ~2s | source | #186 reintroduction guard |
| 8 | `lint:cdn-pins` | ~1s | source + `package.json` | coupling-map: release-please bump ↔ every pin literal |
| 9 | `lint:llms-size` | ~1s | committed artifact | CLAUDE.md "never run `gen-llms.mjs` standalone" |
| 10 | `lint:pack-parse` | ~1s | source | coupling-map: npm 12 `pack --json` shape, 4 sites |
| 11 | `lint:story-conventions` | ~2s | source | story `docs.source.code` + Events category |
| 12 | `lint:gate-parity` | ~1s | **`test.yml` + `docs/superpowers/**`** | the guard this whole split has to teach |
| 13 | `lint:thresholds` | <1s | markdown | CLAUDE.md "no number without a producer" |
| 14 | **`nx build ui`** | **105s** | source (prebuild `build:css`, postbuild `build:api`/`build:blocks`/`verify:dts`) | CLAUDE.md: "a cached build looks exactly like a successful one" |
| 15 | `verify:generated` | ~20s | **source only** — invokes `build:api` directly, never through nx | coupling-map: anything `build:api` reads ↔ every committed artifact |
| 16 | `nx typecheck ui` | **54s** | **built dist** | CLAUDE.md: `verify:quarantine` first, `tsconfig.mcp.json` resolves `dist` before `src` |
| 17 | `verify:consumer` | **15s** | dist + network | 0.19.0 blank page; `VITE` pin coupling row |
| 18 | `verify:pack` | ~2s | dist (hard-fails without) | `derived.json` 97.7 KiB row |
| 19 | `verify:dts` | ~1s | dist | "independence from the caching MODEL staying sound" |
| 20 | `verify:dts:consumer` | ~10s | dist + network | 0.19.0 extensionless re-exports + `skipLibCheck` |
| 21 | `verify:ssr` | ~5s | dist | two guards chained; `Skeleton` render canary |
| 22 | `verify:diagnostics-wiring` | ~1s | dist | `./diagnostics` shipped inert |
| 23 | `verify:schemas` | ~1s | dist | 11 schemas unreachable via `exports` |
| 24 | `verify:tool-schemas` | ~1s | dist | two strict subsets asserted to DIFFER |
| 25 | `verify:card-validation` | ~0.3s | **source only** | no keyword validates nothing |
| 26 | `verify:solid-coverage` | ~3s | dist | GAP 0; every element writable in Solid |
| 27 | `verify:scaffold` | **33s** | dist + 6 tsc projects | surfaces axis; `consumer-tsc-projects.mjs` coupling row |
| 28 | **`verify:construct`** | **476s** | dist (packs it) + **network** (`npm install`) | real eject → install → tsc → build → consumer bundle |
| 29 | `Cache npm` (`actions/cache`, `~/.npm`) | ~10s | plumbing | **sits AFTER #28 — see §5** |
| 30 | `verify:starters` | **102s** | dist + network (`npm ci` ×2) | refuses `--only`/`--linked-only` when `$CI` |
| 31 | `@kitn.ai/docs verify:docs` | ~8s | dist | coupling-map: element surface ↔ every doc snippet |
| 32 | **`vitest --project=unit`** | **334s** | `compiled.css` + `dist/custom-elements.json` | CLAUDE.md's three-things rule |
| 33 | `vitest --project=emitted` | **29s** | `compiled.css` + dist | `emitted-project-wiring.test.ts` |
| 34 | Spike typecheck | ~3s | dist (`@kitn.ai/ui/schemas`) | `cards.seam.test.ts` |
| 35 | Spike tests | ~2s | dist | same |
| 36 | `create-kai build` | ~6s | source | devDep range agreement with `packages/ui` |
| 37 | `create-kai typecheck` | ~5s | dist `.d.ts` | — |
| 38 | `create-kai vitest run` | ~15s | create-kai `dist/templates` | published-kit contract gate |
| 39 | `create-kai verify:pack` | ~5s | create-kai dist | second half of `prepublishOnly` |
| 40 | Pinned-npm tarball shape (npm@12.0.2, both pkgs) | ~15s | **both builds** | `publish-shape.test.ts` pins the version to `release-please.yml` |
| 41 | `test:react` | ~10s | `dist/kai.es.js` + generated `frameworks/react/index.tsx` | — |
| 42 | `npx playwright install` | **21s** | plumbing, `timeout-minutes: 5` | "hung three times, not slow" |
| 43 | `test:e2e` (cross-origin) | **40s** | browser + 2 Vite servers over **source** | postMessage security matrix |
| 44 | `verify:blocks` | **81s** | dist + `dist/blocks/` + generated driver pages + browser | V-2 blocks-and-parts; after Playwright deliberately |
| 45 | `test:focus-ring` | **70s** | dist + browser + own server (:6210) | `@property` unset in shadow roots; 29/39 controls |
| 46 | `test:message-text-token` | ~15s | dist + browser (:6211) | accent brands controls, never content |
| 47 | `test:content-brand-bleed` | ~15s | dist + browser (:6212) | same defect, third instance |
| 48 | Hover-card tab-stops | ~15s | dist + browser (:6013) | "a guard nobody wires into CI is worse than no guard" |
| 49 | `test:command-ivp` | ~35s cold | browser + **Storybook :6006** (`reuseExistingServer: true`) | — |
| 50 | `test:menu-ivp` | **44s** | browser + **Storybook :6006** (`reuseExistingServer: true`) | — |

---

## 2. Dependency graph

**Hard, must-hold:**

- **#2 → #3, same job, adjacent.** #3 reads `$RUNNER_TEMP/tanstack-traversal.tap` written by #2. `$RUNNER_TEMP` is per-job. Splitting them is the one edit that silently restores the exact bug the pair exists for.
- **#14 (`nx build ui`) → 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 30, 31, 32, 33, 34, 35, 37, 40, 41, 44, 45, 46, 47, 48.** Every one hard-fails or lies without `dist/`. `verify:pack` and `verify:blocks` fail *loudly* (both print "run the build first"); `--project=unit` fails in the way CLAUDE.md says reads like a broken checkout.
- **#14's `prebuild` (`build:css`) → 32, 33, 49, 50.** `compiled.css` is generated and gitignored.
- **#36 (`create-kai build`) → 37, 38, 39, 40.**
- **#42 (Playwright) → 43–50.**
- **#29 (npm cache) → #30**, and it *should* precede #28 (§5).

**Documented as load-bearing by order:**

- **`verify:quarantine` before the tsc passes** — inside `packages/ui`'s `typecheck` script, not the workflow. CLAUDE.md: the chain is `&&`-joined and the MCP pass is red on any unbuilt tree, so anywhere else in the order the rot check is skipped on exactly the fresh clones where rot hides. **Do not flatten `nx typecheck ui` into separate workflow steps** while splitting — that is the one refactor that looks like parallelism and deletes the guard.
- **`tsconfig.mcp.json` resolves `dist/schemas` before `src/schemas`** — which is *why* #16 needs #14, and why moving typecheck into a build-free leg would take the pass from green to red (measured).
- **`dedupe:shiki` after every `vite build` and before `verify:elements-bundle`** — inside the `build` script's hand-written `&&` chain. Enforced by NOTHING (coupling-map §"dedupe:shiki's position"). Untouched by this split, and must stay untouched.
- **#1 and #2 before `pnpm install`** — an economy/robustness ordering, stated twice in comments ("no dependencies, no build, no network"; "a break fails the run before 20 minutes of build have been spent").
- **#44 after #42 rather than beside #17** — stated in its comment: build-dependent *and* browser-dependent.
- **#15 deliberately does NOT depend on #14** — it invokes `build:api` directly "and never goes through NX, so no cache state can affect its result." That independence is the point and must survive: do not make `verify:generated` a consumer of the build artifact.
- **`packages/ui` publishes before `create-kai`** — in `release-please.yml`, not here. Unaffected, listed so nobody "tidies" it in the same pass.

**Order-free (safe to move anywhere post-install):** 5–13, 25.

---

## 3. Proposed job graph

Five legs plus an aggregator. `build` fans out; nothing else has edges.

```
build ──┬── construct
        ├── unit
        ├── dist-guards
        └── browser
                   ╰──→ test (aggregator, if: always())
storybook ×4 ──→ storybook-gate
```

### `build` — 3.8m
Steps 1, 2, 3 (pre-install, in order), 4, then 5–13 + 25, then 14, then upload.

Keeping the 11 no-build lints here rather than in a sixth parallel leg is deliberate: **`needs:` is the only fail-fast the split leaves.** GitHub does not cancel sibling jobs, so a lint in its own leg would let `construct` burn nine minutes on a tree that a 1-second guard already rejected. Inside `build`, a red lint costs 105s of build and zero downstream minutes — which is the property the existing "deliberately before `pnpm install`" comments are protecting. Price: 18s on the critical path.

Uploads one artifact, `kit-dist`:
```
packages/ui/dist/**                                 (12 MB)
packages/ui/src/elements/compiled.css               (gitignored, prebuild)
packages/ui/scripts/block-driver/pages/generated/**  (gitignored, build:blocks — verify:blocks needs it)
```
That is the complete gitignored-and-build-written set under `packages/ui` (`git status --porcelain --ignored=matching` confirms; `.kai-test-cache/`, `.kai-local-kit/`, `storybook-static/`, `test-results/` are runtime caches, excluded). Everything else the build writes — `element-meta.json`, `derived.json`, `llms-full.txt`, `frameworks/react/index.tsx`, `docs/web-components.md`, the construct template fixtures — is **committed**, so a downstream `checkout` already has it, and `verify:generated` in `dist-guards` proves it is the right version.

Timing: 8 checkout + 22 setup + 3 pre-install + 45 install + 18 lints + 105 build + 25 upload = **226s**.

### `construct` — 9.4m (the critical path)
`needs: build`. Restore `~/.npm` **first**, then `verify:construct`.
75 overhead + 12 download + 476 = **563s**. With the npm cache moved ahead of it (§5), est. **~487s**.

Alone on its leg because it is 30% of the whole job and shares nothing.

### `unit` — 8.5m
`needs: build`. Steps 32, 33, 41, 34, 35, 36, 37, 38, 39, 40.
75 + 12 + (334 + 29 + 10 + 5 + 31 + 15) = **511s**.

Grouping rationale: `--project=unit` and `--project=emitted` stay adjacent (CLAUDE.md: "Both run in the required CI `test` job as separate steps"), and `create-kai build` sits next to the two `verify:pack` steps that need it.

### `dist-guards` — 5.9m
`needs: build`. Steps 15, 16, 27, 17, 20, 21, 26, 18, 19, 22, 23, 24, 31, then the npm cache restore and 30.
75 + 12 + 154 + 102 + 10 = **353s**.

`verify:generated` goes here specifically because this leg uploads nothing — its sentinel-seeding writes into the source tree, and a leg that both seeds sentinels and produces an artifact is one crashed process away from shipping a poisoned one.

### `browser` — 7.1m
`needs: build`. Step 42, then 43, 44, 45, 46, 47, 48, 49, 50.
75 + 12 + 21 + 315 = **423s**.

Free win available inside this leg: both IVP configs set `reuseExistingServer: **true**` (not `!CI`), so starting one Storybook as a background step and letting #49 and #50 both attach saves one cold boot, ~30s.

### `test` — aggregator, ~15s
`needs: [build, construct, unit, dist-guards, browser]`, `if: always()`. **The `if: always()` is not optional** — without it a failed leg *skips* the aggregator, and a skipped required check is not a red one.

The shell must be derived, not hand-listed. `storybook-gate` compares one named result because it has one leg; a five-leg copy of that shape has a real failure mode — a leg added to `needs:` and forgotten in the `if` chain is silently ungated:
```yaml
- run: |
    echo '${{ toJSON(needs) }}' \
      | jq -e 'to_entries | map(select(.value.result != "success")) | if length == 0 then true else (map(.key) | @text "red legs: \(.)" | halt_error(1)) end'
```
`toJSON(needs)` *is* the `needs:` list, so the two cannot drift.

### Numbers

| | Wall | Raw runner-min | Billed (ceil/job) |
|---|---|---|---|
| **Today** — `test` | 26.0m | 26.0 | 26 |
| **After** — build | 3.8m | 3.8 | 4 |
| | construct | 9.4m | 9.4 | 10 |
| | unit | 8.5m | 8.5 | 9 |
| | dist-guards | 5.9m | 5.9 | 6 |
| | browser | 7.1m | 7.1 | 8 |
| | test | 0.3m | 0.3 | 1 |
| **After** — total | **13.2m** (build + construct) | **35.0** | **38** |
| **Delta** | **−12.8m wall (−49%)** | **+9.0 CPU-min (+35%)** | **+12 billed** |

With the npm cache moved ahead of `verify:construct`: wall **~11.9m**, and the `unit` leg (8.5m) becomes the co-pole.

Whole workflow including the unchanged storybook matrix: ~47 → ~56 raw runner-min. In-flight jobs per PR: 6 → 11.

Where the +9 comes from, so nobody looks for a mistake: 4 × 75s duplicated checkout/setup/install = 5.0m, artifact upload+downloads ≈ 1.1m, and the loss of `&&` short-circuiting on a red run (a failure at step 5 today costs 1 minute; after the split it costs whatever the four parallel legs burn before the aggregator concludes).

**Optional follow-on, not part of this split:** the four storybook shards each run their own `nx build ui`. Pointing them at `kit-dist` instead trades −6.2 CPU-min for +2.2m of storybook wall (they would start after `build`). Since `storybook-gate` is now required, that wall matters — but 9.7m still sits under the 13.2m critical path. **Verify before doing**: the shards run `test:storybook:ci` through pnpm, not nx, so nx's `dependsOn: [build]` does not apply and the explicit build step is genuinely load-bearing; confirm the storybook project needs nothing from `postbuild` that the artifact omits.

---

## 4. The required-check story

### What actually breaks

A thin `test` aggregator with one `run:` step does **not** leave the ruleset alone. It turns red:

1. **`lint:gate-parity` itself.** `analyzeWorkflow` throws `GuardError` at `MIN_RUN_STEPS = 30`: *"extractor found almost nothing — the workflow moved… Fix the extractor, not the floor."* The script is telling you, correctly, what to do.
2. **`gate-parity-guard-wiring.test.ts`** — `expect(independent, 'the independent count found no run steps').toBeGreaterThan(30)`.
3. **`emitted-project-wiring.test.ts`** — the `test` block no longer contains `--project=unit` or `--project=emitted`.
4. **All twelve `*-guard-wiring.test.ts` files** — each `toContain(NPM_SCRIPT)` against the `test` block, most with the `--project=unit` canary alongside.

Renaming the required checks instead breaks the *same* fifteen files (they would have to name a different job), **plus** requires a ruleset edit **plus** an edit to `require-green-checks.mjs`'s literal `--require test` — which coupling-map row 7 records as guarded by **NOTHING**, and which is the one list in this repo whose being wrong in the silent direction ships an unvetted release.

### Recommendation: keep `test` as the aggregator name

Same source work, two fewer places to be wrong, and the publish gate's un-derivable literal never has to move. The change is not "point the guards at a different job" but **"teach the guards that the required gate is a job *graph*"** — which is `derive it, don't type it` applied to the thing the split creates.

**4a. `lint-gate-parity.mjs`.** Replace `const JOB = 'test'` with a set derived *from the workflow*: parse the `test` job's `needs:` and analyze `test` ∪ every job transitively reachable through it. `extractSteps` already takes a job name, so this is a loop plus a `needs:` parse. Three floors, all of which the file's own idiom already supplies:

- `MIN_RUN_STEPS` moves to the **union** (still ~50 — comfortably above 30).
- **A root job with no `needs:` and no gates is a hard failure.** That is precisely the degenerate aggregator, and without this the floor can be satisfied by one fat leg while another quietly falls out.
- **New teeth: a job in this workflow that contains gate-shaped steps and is NOT reachable from `test` is a hard failure.** Without it, moving a step into an unaggregated job removes it from the merge gate while `--list` keeps printing 46. This is the same rule as the existing "an unrecognised shape is a hard failure naming the step," one level up, and it is the rule that makes the whole split safe. `storybook` is reachable via `storybook-gate` only if you add that edge; if not, exempt it by name in one place with a written reason, the way the file already exempts `CLAUDE.md` from the doc scan.

The 46 gate ids are unchanged by all of this, so every `gate-list: partial` marker in `docs/superpowers/**` keeps passing untouched.

**4b. The fourteen `jobBlock(yaml, 'test')` copies.** Replace with one shared helper — `requiredGateBlock(yaml)` returning `test` ∪ its transitive `needs:`, concatenated. Every `toContain(NPM_SCRIPT)` then passes unchanged, and the `--project=unit` canary keeps working because the `unit` leg is in the union.

This deliberately reverses a duplication the repo chose ("duplicated locally so the blocks stay independent"), and the trade is real: one bug in the helper blinds fourteen guards at once. Two mitigations, both cheap: the helper carries its own vacuity floor (throws if `test` declares no `needs:`, or if the union yields fewer run steps than the linter's floor), and each test keeps its existing `expect(block).not.toBe('')`. The alternative — fourteen copies each with a hand-typed job list — is the exact defect class CLAUDE.md's "derive it, don't type it" section is about, and it would rot on the first leg rename.

Note also that the `--project=unit` canary changes meaning under a union: today it proves "this job still runs the suite"; after, it proves "the graph still runs it." Say so in the comment, or it reads as a check that stopped being about anything.

**4c. `publish-shape.test.ts` needs no change** — whole-file regex.

**4d. `require-green-checks.mjs --require test` needs no change** — but there is a **live, pre-existing gap** to fix in the same PR: the ruleset now requires `storybook-gate`, and `--require` still names only `test`. A release can currently publish over a red `storybook-gate`. Coupling-map row 7 predicts exactly this ("A context added to the ruleset is not gated on"). Add it.

**4e. Comments.** `test.yml:10–26` and `:1010–1023` both call `storybook-gate` advisory and `test` "the ONLY" required check. Both are now false and both must be rewritten — and the `gh api … rulesets/18328421` incantation should stay in both, because it is the only authoritative source and it is what makes the next stale comment self-correcting. The new `test` header should state that green means *every leg was green*, that the gate set is the union over `needs:`, and that `if: always()` is what makes a red leg red rather than skipped.

---

## 5. Caching

**Today.** `actions/setup-node@v4 … cache: pnpm` — the pnpm store, nothing else. One `actions/cache` for `~/.npm`, keyed `starters-npm-${{ hashFiles('examples/starters/*/package-lock.json') }}`.

**NX cache in CI: none, and keep it that way.** `nx.json` has no `nxCloudAccessToken`, no remote-cache plugin, no `cacheDirectory` override; `.nx/cache` is gitignored and never persisted. The `verify:dts` comment already states it: *"on CI the question is moot today — no nx cache is persisted between runs at all (`cache: pnpm` caches the pnpm store, not `.nx/cache`), so the build always runs cold."*

**Do not persist `.nx/cache` as part of this work.** CLAUDE.md records the nx cache returning wrong verdicts **in both directions** — `nx build ui` printing "Successfully ran target build" while regenerating nothing, and `nx typecheck ui` reporting a cached green over a real TS1015. Coupling-map's `nx.json build.outputs` row calls the cold-build mitigation "accidental" but real. Trading a measured-wrong cache for two minutes is the worst deal on this page.

**The artifact is a different thing, and the difference must be written down.** It moves one build's outputs between jobs of **one run**, keyed by the run, not by an input hash the repo has watched be wrong. But it does import one hazard from the nx model: **downstream legs never run `postbuild`**, so anything postbuild writes that is not in the upload glob is silently absent — which is the coupling-map `build.outputs` row promoted from "local only" to live CI. Two mitigations:

- The glob list *is* the new `outputs` list. Add a step to the `build` leg that fails if any gitignored, build-written path under `packages/ui` is not covered by it — `git status --porcelain --ignored=matching packages/ui` before and after the build, diffed against the glob. That closes a coupling the map currently marks `NOTHING`, and it is cheap.
- `verify:dts` and `verify:pack` both hard-fail on a partial `dist/`; they are already the tripwire and should stay separate steps in `dist-guards`. Their existing "independence from the caching MODEL staying sound" comment now has teeth it was written for.

**The 476s emit chain.**

1. **Free win, available today, independent of the split: move the `~/.npm` cache restore above `verify:construct`.** It currently sits at line 641, *nine steps after* the chain that does the `npm install`. The construct chain's shared install runs fully cold every run. Restoring first should take a meaningful bite out of 476s.
2. **Give the construct leg its own key**, over what actually determines the emitted projects' dependency set: `packages/ui/src/agent-tooling/construct/construct.v1.schema.json`, `templates.ts`, and `packages/ui/package.json` (the version goes into every emitted pin). `hashFiles()` over those, with a `restore-keys:` prefix so a miss still warms. Use `actions/cache/restore` (no save) in whichever leg is not the writer, so two legs sharing `~/.npm` do not race on the same key.
3. **No path filter. Do not skip this leg on kit changes.** `verify-construct.mjs` ejects against **this checkout's own packed tarball** — "never a hand-typed version — npm's published `@kitn.ai/ui` may not have caught up." So a PR that touches only `src/elements/` changes what every cell installs, while touching nothing a construct-scoped path filter would match. That is CLAUDE.md's "the tree is not the tarball, and the tarball is not what `npx` runs" in its most literal form. A filter safe enough to use would have to fire on `packages/ui/**` + `scripts/**` + the lockfile + the workflow — which is nearly every PR, so it buys almost nothing and adds a way to be wrong. Spend the effort on the npm cache and on the shard below.

**Next lever after this split, if 13m is still too long:** `--project=unit` (334s) shards cleanly with `vitest --shard=1/2`, and — checked against the canonicalizer — `vitest run --project=unit --shard=1/2` still resolves to the gate id `@kitn.ai/ui vitest unit`, and `gates` is a `Map<id, string[]>`, so two shards collapse to one gate with two step names. `emitted-project-wiring` only greps for the literal `--project=unit`, so it passes too. The hazard is the one the traversal guard exists for: **a shard matching no files exits 0**. Any sharding needs a reported-test-count assertion in the same shape as step #3 before it is trustworthy.

---

## 6. Risks and what to verify

**Conservation — every step still runs somewhere, exactly once.** The mechanical check already exists and is derived rather than typed:

```bash
git worktree add /tmp/ci-base main
node packages/ui/scripts/lint-gate-parity.mjs --repo-root /tmp/ci-base --list > /tmp/before.txt
node packages/ui/scripts/lint-gate-parity.mjs --list > /tmp/after.txt
diff <(sort /tmp/before.txt) <(sort /tmp/after.txt)
```
Run the **new** linter against both trees — that is what makes the comparison valid, and it is a property worth stating out loud: over the old tree, "`test` ∪ its transitive `needs:`" degenerates to "`test`", because `test` has no `needs:`. So the union derivation is backward-compatible by construction, and the diff is a genuine before/after rather than two different questions.

`--list` prints each id **with its step names**, so the comparison is over the multiset of (gate, step) pairs — which is what "exactly once" means here. `verify:pack` legitimately appears twice (once plain, once under pinned npm) and must keep appearing twice. Expect exactly **46 gates**, unchanged.

**Checklist:**

- [ ] `diff` above is empty. 46 gates, same step names.
- [ ] `node packages/ui/scripts/lint-gate-parity.mjs --self-test` green — with a **new case added** for the split: a workflow whose `test` has `needs:` and whose legs carry the gates must analyze to the same set, and a gate-bearing job **not** reachable from `test` must be a hard failure. Per the file's own standard, watch the new rule fire before trusting it.
- [ ] All 14 wiring tests green against the shared helper, and the helper's vacuity floor watched firing (point it at a workflow whose `test` declares no `needs:`).
- [ ] `--project=unit` and `--project=emitted` both appear in the union; `emitted-project-wiring.test.ts` green.
- [ ] `publish-shape.test.ts` green untouched (whole-file regex — confirm exactly one `VERIFY_PACK_NPM` step survives).
- [ ] Artifact completeness: the `dist-guards` leg's `verify:pack` and `verify:dts` pass (both hard-fail on partial `dist/`), and `verify:blocks` in `browser` finds `dist/blocks/` **and** the generated driver pages.
- [ ] `verify:starters` still refuses `--only`/`--linked-only` — `$CI` is set by GitHub in every leg.
- [ ] Per-leg `timeout-minutes` set to fit each leg (construct 25, unit 20, others 15) instead of 30 copied five times, and **`timeout-minutes: 5` preserved on the Playwright install** — it has hung to the job ceiling three times.
- [ ] Both stale comment blocks (`:10–26`, `:1010–1023`) rewritten; `storybook-gate` described as required.
- [ ] `--require test storybook-gate` in `release-please.yml`.
- [ ] `docs/coupling-map.md` gains two rows: *the artifact glob ↔ what a downstream leg sees* (enforced by the new glob-coverage step) and *the `needs:` graph ↔ the guards that scope to the required gate* (enforced by `lint:gate-parity`'s new unreachable-job rule). The repo's own convention is to register a coupling when you create one; this split creates two.

**Prove it red — three deliberately broken runs, watched, not assumed.** The repo's standard throughout is "watched failing rather than assumed to fail," and this is the property the whole split rests on:

1. **A red leg fails `test`.** Plant a type error in `packages/ui/src/elements/` on a throwaway branch. Expect: `dist-guards` red, `test` red, and — the part actually worth confirming — `gh api repos/kitn-ai/ui/commits/<sha>/check-runs --jq '.check_runs[] | "\(.name) \(.conclusion)"'` shows a check literally named `test` with conclusion `failure`.
2. **A skipped leg fails `test`.** Break the `build` leg (e.g. a syntax error in a lint the build leg runs). Every downstream leg is *skipped*, not failed. Confirm `test` still runs (`if: always()`) and still concludes `failure`. This is the case a hand-written `if` chain gets wrong, and the case where getting it wrong yields a **green required check over a workflow that ran nothing**.
3. **A leg outside the graph is caught.** Move one gate step into a job not reachable from `test`'s `needs:` and confirm `lint:gate-parity` goes red naming it. Without this, the split's failure mode is exactly the one the repo has been bitten by twice — a check that runs nowhere, wearing the shape of coverage.

**Residual risks, stated rather than hidden:** +9 CPU-min and 11 concurrent jobs per PR; loss of `&&` short-circuiting within a leg's siblings; a leg's steps still run serially, so `construct` at 9.4m is a floor until the npm cache and/or a shard axis moves it; and the `unit` leg at 8.5m becomes the co-pole the moment construct improves — plan the vitest shard next, not now.

---

## Critical files for implementation

- `/Users/home/Projects/kitn-ai/kitn-chat/.github/workflows/test.yml`
- `/Users/home/Projects/kitn-ai/kitn-chat/packages/ui/scripts/lint-gate-parity.mjs`
- `/Users/home/Projects/kitn-ai/kitn-chat/packages/ui/tests/agent-tooling/emitted-project-wiring.test.ts`
- `/Users/home/Projects/kitn-ai/kitn-chat/packages/ui/tests/scripts/gate-parity-guard-wiring.test.ts` (and the twelve sibling `*-guard-wiring.test.ts` files sharing its `jobBlock` copy)
- `/Users/home/Projects/kitn-ai/kitn-chat/.github/workflows/release-please.yml` (the `--require` list)

---

## 10-line summary

1. `build` 3.8m — pre-install guards, install, 11 no-build lints, `nx build ui`, uploads `dist/` + `compiled.css` + generated block-driver pages.
2. `construct` 9.4m — `verify:construct` alone; the critical path, ~8.1m once the npm cache restore moves ahead of it.
3. `unit` 8.5m — vitest `unit` + `emitted`, react, spike, all four create-kai steps, the pinned-npm tarball step.
4. `dist-guards` 5.9m — typecheck, scaffold, generated, the ten fast dist verifications, docs, starters.
5. `browser` 7.1m — Playwright install, cross-origin e2e, blocks, the three paint guards, hover-card, both Storybook IVPs.
6. `test` aggregator — `needs:` all five, `if: always()`, verdict derived from `toJSON(needs)` so a forgotten leg cannot go ungated.
7. **Critical path 13.2m** (build + construct) vs 26m today — **−49% wall**; ~11.9m with the npm-cache fix.
8. **CPU: 26 → 35 raw runner-min (+9, +35%); billed 26 → 38.** Cost is 4× duplicated checkout/install (5.0m) + artifacts (1.1m) + lost `&&` short-circuiting.
9. **Keep the required check named `test`** — a rename additionally moves the ruleset and `require-green-checks.mjs`'s un-derivable `--require` literal for no benefit. But note the aggregator is *not* free: 15 files scope to the job named `test`, and `lint-gate-parity`'s `MIN_RUN_STEPS = 30` floor hard-fails a thin one by design. Fix by teaching `lint-gate-parity` and one shared `jobBlock` helper that the gate is `test` ∪ its transitive `needs:` — derived from the workflow, plus new teeth: a gate-bearing job unreachable from `test` is a hard failure.
10. Verify by diffing `lint-gate-parity --list` (46 gates, unchanged) across base and branch **with the new linter on both**, and by three watched red runs: a failed leg, a *skipped* leg (the `if: always()` case, where getting it wrong yields a green check over a workflow that ran nothing), and a gate moved outside the graph. Separately: `--require` still names only `test` while the ruleset now also requires `storybook-gate` — a release can currently publish over a red one.
