# Coverage diagnostic — `@kitn.ai/ui`

**Measured at `e796beeba7b503d3956fdc592c676c2d1fd1a205`** (`origin/main`, "refactor(agent-tooling): move the route preamble to a zod-free leaf module (#229)").
One-off. Not a gate, not a threshold, not wired into CI.

This is a map of **what has no tests at all**, which is the one question line coverage
answers well. It is not a score. Read section 6 before quoting any number in here.

---

## 0. Three corrections to the brief

**`@vitest/coverage-v8` was already installed.** The brief said "Nothing exists. No
vitest coverage config, no c8/istanbul/nyc anywhere, no coverage script, no CI step."
Four of those five are right. But `packages/ui/package.json:244` already declares
`"@vitest/coverage-v8": "4.1.2"`, and it is in `pnpm-lock.yaml`. It is referenced by no
config, no script and no workflow — an orphan devDependency someone added and never
wired up. **Consequence: this diagnostic added no dependency and produced no lockfile
change.**

**`coverage.all` no longer exists.** It was removed in Vitest 3. The option that makes
never-imported files appear in the report is now `coverage.include`. This matters more
than it sounds: without it, v8 reports only files a test *imported*, so a module with
zero tests is **absent from the report** rather than shown at 0% — the untested modules,
the entire point of this exercise, are exactly the ones that vanish. A coverage run
configured the obvious way would have silently omitted every file this report is about.

**Two suites cannot run from a clean checkout without a build first.** Not a defect —
CI does the same thing — but it silently distorts the measurement. On a fresh worktree
`src/agent-tooling/mcp/{reference,server}.test.ts` fail (20 tests) on a missing
`dist/custom-elements.json`, and 3 of `create-kai`'s 9 files fail (13 tests, 81 more
skipped) on missing `dist/templates`. Measured naively, `agent-tooling` reads **86.4%**
instead of its true **96.5%**. Every number below was taken *after* `nx build ui` and
`create-kai build`.

---

## 1. How this was measured

```bash
# packages/ui — the two REQUIRED suites, measured together
nx build ui                                    # required: see correction 3
npm run build:css                              # compiled.css is gitignored
npx vitest run --project=unit --project=emitted --coverage

# packages/create-kai — separate package, separate suite
pnpm --filter create-kai run build
npx vitest run --coverage --coverage.include='src/**/*.ts'

# packages/ui storybook project — advisory, measured separately, 20 sub-shards
# (a single-process run CANNOT be measured; see below)
for k in $(seq 1 20); do
  npx vitest run --project=storybook --shard=$k/20 --coverage \
    --coverage.reportsDirectory=sb-shards/$k
done
```

### What is included, and why

| Suite | In CI? | Measured | Why |
|---|---|---|---|
| `unit` (jsdom) | **required** | **yes — primary** | The inner loop. 3009 tests. Executes `src/` TypeScript directly, so v8 maps hits back to source lines. |
| `emitted` (jsdom) | **required** | **yes — primary** | Same environment, same transform, different budget. It writes the scaffolder's output to a real module and *runs* it. Splitting it out would understate `agent-tooling`. |
| `storybook` (chromium) | advisory, **does not block a merge** | yes, **reported separately** | 115 `*.stories.tsx` as browser tests. Never blended into the headline — see below. |
| `react` (`vitest.react.config.ts`) | required | **no** | Tests the *generated* wrappers against the prebuilt `dist/kai.es.js`. Coverage would attribute to compiled bundle output, not `src/`. It cannot answer "which source module is untested". |
| `openrouter-spike` | required | **no** | An internal example under `examples/internal/`, not shipped library code. |
| `create-kai` | required | yes, **reported separately** | A different published package with its own suite. Blending it into a `packages/ui` figure would be meaningless. |
| `tests/e2e/**` (Playwright) | required | **no** | Standalone Playwright, not vitest. Out of scope for a line-coverage instrument. |

**The headline number covers `unit` + `emitted` only.** Those are the two required suites
that execute `src/` and can be attributed back to it. Everything else is reported on its
own terms rather than folded in.

### The storybook project cannot be measured in one pass — and it lies about it

A plain `vitest run --project=storybook --coverage` **crashed at 23 of 115 files** with
the documented `[birpc] rpc is closed` whole-runner death (the ~20MB/file chromium
harness leak already described in `vitest.config.ts`). It then **printed a complete-looking
coverage summary — `Statements: 16.55%`** — from a run that executed a fifth of the suite.
Nothing in that output says it is a fragment.

That figure is garbage, and it is the shape of garbage that gets pasted into a report. The
real measurement needed 20 sub-shards in fresh processes (**20/20 clean, 115/115 files, zero
crash markers**), mirroring what `scripts/run-storybook-tests.mjs` already does for CI.

**A related trap, for whoever runs this next:** that crashed run *overwrote*
`packages/ui/coverage/coverage-final.json`. Analysis run afterwards reads storybook-crash
data while looking exactly like the unit run. It was caught here only because `remote/`
reported 0 thin files in one table and four in another. **Copy the report out of
`coverage/` before running a second suite.**

---

## 2. Headline

`packages/ui`, `unit` + `emitted`, all **247 files / 3009 tests passing** with coverage on:

| | |
|---|---|
| Statements | **75.61%** (13085/17304) |
| Branches | 69.04% (6062/8780) |
| Functions | 72.59% (4580/6309) |
| Lines | 78.96% (10119/12815) |

`packages/create-kai`, 9 files / 245 tests passing: **72.37%** statements (490/677).

Those four numbers are the least useful thing in this document. The map is below.

### By area — `unit` + `emitted`, LOC-weighted

| area | kind | files | 0% | <50% | LOC | stmt% |
|---|---|---:|---:|---:|---:|---:|
| `wire/` | **library** | 11 | 0 | 0 | 2901 | **96.2%** |
| `schemas/` | library | 5 | 0 | 0 | 1881 | 95.8% |
| `state/` | **library** | 6 | 0 | 0 | 696 | **92.2%** |
| `primitives/` | library | 35 | 0 | 1 | 4279 | 88.2% |
| `components/` | library | 73 | 1 | 11 | 18614 | 75.7% |
| `remote/` | library | 8 | 0 | 0 | 728 | 69.3% |
| `elements/` | library | 90 | 1 | 33 | 10839 | 66.7% |
| `ui/` | library | 36 | 1 | 10 | 5420 | 61.8% |
| `agent-tooling/` | *tooling* | 23 | 1 | 0 | 9725 | 96.5% |

The two folders the brief flagged as most expensive to get wrong — `wire/` and `state/` —
are the **two best-covered library folders in the repo**. That is the headline finding, and
it inverts the brief's worry.

---

## 3. The untested-module map

Because the storybook suite exists but does not gate anything, "untested" splits three ways.
Ranked by risk, not by percentage.

### 3a. Tier 1 — dead in *every* suite (library code)

Nothing in `unit`, `emitted`, or `storybook` meaningfully executes these. The non-zero
percentages are module-level side effects (the `defineWebComponent` call at import); no
function body runs.

| LOC | unit | story | module | note |
|---:|---:|---:|---|---|
| 90 | **0%** | **0%** | `elements/autoloader.ts` | ⚠ **published entry point** `@kitn.ai/ui/autoloader` |
| 130 | 3% | 3% | `elements/segmented.tsx` | registered element, no story, no test |
| 127 | 5% | 5% | `elements/scroll-button.tsx` | registered element, no story, no test |
| 104 | 4% | 4% | `components/response-stream.tsx` | |

**`elements/autoloader.ts` is the single sharpest finding in this report.** It is a public
export in `package.json` (`"./autoloader"`), it is the delivery path for **no-build / CDN /
static-served pages**, and it works by watching the DOM with a MutationObserver and
dynamically importing sibling element modules *relative to its own URL*. It has zero
automated coverage of any kind. It is also genuinely awkward to test — which is why it has
none, and why it will stay that way unless someone decides to. The consumer-hardening
campaign verified `vanilla+autoloader` by hand once; nothing re-checks it per commit.

The other three are ordinary gaps: shipped elements nobody wrote a test or a story for.

### 3b. Tier 2 — exercised ONLY by the advisory storybook suite

**15 files, 1992 LOC.** A story is a smoke render plus axe. It proves the component mounts
without throwing and has no a11y violation. It asserts close to nothing about behaviour —
and the job that runs it **does not block a merge**.

| LOC | unit | story | module |
|---:|---:|---:|---|
| 292 | 18% | 73% | `ui/pane-group.tsx` |
| 258 | 0% | 100% | `components/audio-visualizer/audio-visualizer.voice-fixture.ts` |
| 219 | 10% | 92% | `ui/agent-card.tsx` |
| 194 | 5% | 94% | `ui/pane.tsx` |
| 167 | 14% | 100% | `components/empty.tsx` |
| 151 | 0% | 100% | `solid.ts` — public entry `@kitn.ai/ui/solid` (see note) |
| 146 | 8% | 100% | `ui/prompt-dock.tsx` |
| 118 | 0% | 100% | `ui/pane-grid.tsx` |
| 110 | 5% | 64% | `ui/segmented.tsx` |
| 85 | 10% | 92% | `ui/notice.tsx` |
| 68 | 9% | 100% | `ui/settings-group.tsx` |
| 66 | 6% | 84% | `components/image.tsx` |
| 51 | 7% | 93% | `components/thinking-bar.tsx` |
| 43 | 17% | 100% | `elements/status.tsx` |
| 24 | 15% | 100% | `ui/avatar.tsx` |

The **pane / workspace family** (`pane`, `pane-group`, `pane-grid`, `prompt-dock`,
`agent-card`, `settings-group` — 1037 LOC) sits almost entirely in this tier. If the
storybook job stays advisory, that family's only enforcement is a human noticing.

**`solid.ts` is not a real risk despite reading 0%.** It is a 151-line pure re-export
barrel, and the thing that can actually break in it — a missing or misnamed export — is
already covered by `verify:solid-coverage` (79/79 elements plus a `<Name>Props` type each)
and `verify:ssr`, both of which run against the built `dist/` in required CI. **0% coverage
does not mean unguarded**, and this is the clearest example of it in the repo.

### 3c. Tier 3 — thin in both suites

**17 files, 4020 LOC** — the largest bucket by volume. Partial unit coverage *and* partial
story coverage, neither strong. Top by size:

| LOC | unit | story | module |
|---:|---:|---:|---|
| 995 | 36% | 21% | `components/composer.tsx` |
| 593 | 46% | 15% | `ui/dropdown.tsx` |
| 464 | 37% | 4% | `components/form-widgets.tsx` |
| 349 | 23% | 41% | `components/chain-of-thought.tsx` |
| 229 | 33% | 1% | `elements/menu.tsx` |
| 218 | 21% | 3% | `ui/dialog.tsx` |
| 195 | 49% | 3% | `elements/command.tsx` |
| 140 | 47% | 2% | `elements/attachments.tsx` |
| 130 | 6% | 6% | `elements/pane.tsx` |
| 119 | 48% | 3% | `elements/switch.tsx` |

`components/composer.tsx` at 995 LOC / 36% is the biggest single untested surface in the
library. It is also the richest interaction model in the kit (contenteditable, atomic
pills, `/` and `@` triggers, shadow-DOM selection) — the class of code where behaviour is
the whole product and a smoke render proves least.

### 3d. Build-time tooling — a different kind of risk

An untested scaffolder emitter is not an untested encoder, and this repo already knows it:
`agent-tooling/` is at **96.5%**, better covered than any UI folder, because the `emitted`
project executes what it emits. Only `agent-tooling/mcp/stdio.ts` (19 LOC, the stdio
transport `npx @kitn.ai/ui mcp` actually runs on) is dead — a thin process-wiring shim.

**The real tooling gap is `packages/ui/scripts/`, which no coverage run in this report
touches at all** (it is outside `src/`). 45 scripts. Many are the CI guards that gate
`main` — and **10 of them have neither a unit test nor a `--self-test` mode**:

`verify-consumer-sideeffects` · `verify-dts-boundaries` · `verify-dts-consumer` ·
`verify-generated-sync` · `verify-schemas-exported` · `verify-solid-coverage` ·
`verify-tool-schemas` · `verify-pack-weight` · `verify-starters` · `verify-quarantine`

This is the "checks that prove nothing" class in its purest form: a guard nobody has
watched fail. The repo has already solved this for five scripts — `lint-silent-drops`,
`lint-attachment-object-urls`, `verify-ssr-render`, `verify-scaffold-compiles` and
`ssr-render-probe` all carry a `--self-test`, and `tests/scripts/*-wiring.test.ts` assert
both that the guard *fires* on a planted defect and that **a run discriminating nothing is
a failure rather than a pass**. That pattern is correct and it exists. It has been applied
to a third of the guards.

I would rank closing that gap **above** any UI coverage work in this report. It is cheap
(the pattern is already written twice), and it protects the checks everything else relies on.

### 3e. `create-kai`

72.4% overall; three modules at zero:

| LOC | stmt | module |
|---:|---:|---|
| 360 | **0%** | `src/index.ts` — the entire interactive CLI flow |
| 55 | 0% | `src/layouts.ts` |
| 26 | 0% | `src/pm.ts` — package-manager detection |

`index.ts` is 360 lines of prompt flow with zero coverage, and the one thing that would
exercise it — `scripts/smoke.mjs` — **is not wired into CI**. The risk is bounded: the
flow's only job is to fill in a `ProjectPlan`, and `generate()` plus `verify:starters`
(all 8 starters built in CI) cover the output. What is unprotected is the *flow* — prompt
defaults, branch selection, the Enter-through-everything path the module's own docblock
advertises.

---

## 4. `wire/` and `state/` — the flagged folders

**Neither is thin.** They are the best-covered library code in the repo. But two specific
holes are worth naming, because both are in the "silent wrong answer" class.

### `wire/` — 96.2% statements, 11 files, nothing below 90%

| module | stmt | fn | branch |
|---|---:|---:|---:|
| `sink-helpers.ts` | 90.0% | 87.5% | — |
| `read.ts` | 91.3% | 90.9% | **77.1%** |
| `formats/anthropic.ts` | 93.3% | 100% | **67.2%** |
| `consume.ts` | 94.8% | 100% | 87.2% |
| `encode.ts` | 96.9% | 100% | 91.9% |
| `formats/openai.ts` | 97.7% | 100% | 85.1% |
| `sse.ts` | 98.3% | 85.7% | 94.1% |
| `files.ts` | 98.4% | 100% | 88.9% |
| `chunk.ts` / `media-types.ts` | 100% | 100% | 100% / 94.6% |

The one concrete gap is **`read.ts` error reporting**. `providerMessage()` — which digs a
human-readable message out of a failed model response — has **8 of 35 branches never
taken** (L65–L79). Specifically untaken: `error` arriving as an *object* with `.message`,
and the top-level `.message` fallback. Also uncovered: the `res.text().catch(() => '')`
path at L96.

That is error-message *quality*, not data corruption — a wrong answer here produces a worse
diagnostic, not a bad chat. Rank it accordingly. `formats/anthropic.ts` at 67.2% branch is
the widest branch gap in the folder and worth a skim, though every function in it runs.

### `state/` — 92.2% statements, 6 files, nothing below 75%

| module | stmt | fn | branch |
|---|---:|---:|---:|
| `stream.ts` | **75.8%** | **74.2%** | 94.1% |
| `messages.ts` | 95.2% | 100% | 86.7% |
| `parts.ts` | 100% | 100% | 98.3% |
| `mock.ts` | 100% | 100% | 93.3% |
| `suggestions.ts` / `index.ts` | 100% | 100% | 100% |

**`state/stream.ts` is the one thing in either folder I would actually fix.** Eight of its
31 functions are never called, and they are not random:

- `addSource()` and `addFile()` — **never called on either builder**. The source-part and
  file-part paths through the assistant-stream builder are entirely unexercised.
- `onStreamSettled()`'s delegates for `appendReasoning`, `upsertTool`, `addSource` and
  `addFile` — never called. That wrapper is a hand-written 8-row delegation table, and
  **only 4 rows are exercised**.

That second one is the sharp risk. A delegation table is exactly where a copy-paste typo
survives review — `addSource(source) { inner.addCard(source); return wrapper; }` would
type-check as `unknown`-ish, run fine, corrupt the message, and **pass the entire suite
today**. Same for a row that forgets `return wrapper` and silently breaks the fluent chain
for one method. This is four cheap assertions against a real, specific, silent-corruption
failure mode, in the folder the brief correctly identified as most expensive to get wrong.

---

## 5. Where mutation testing would pay — scoped

**Recommendation: `src/wire/**` plus `src/state/parts.ts` and `src/state/messages.ts`.
Roughly 3,600 LOC. Nowhere else.**

Mutation testing answers the question line coverage cannot — *would any test notice if this
were wrong?* — and it only earns its runtime where three things hold at once:

1. **Coverage is already high.** Below ~90% it just re-reports gaps you already know about.
   `wire/` (96.2%) and `state/` (92.2%) are the only library folders that qualify.
2. **The code is pure and fast.** These are I/O-free folds over `ChatMessage[]` and byte
   streams — no DOM, no Solid reactivity, no browser. Thousands of mutants run in minutes.
   Mutating `components/` or `elements/` means re-rendering Solid components per mutant;
   the runtime is prohibitive and the surviving-mutant list would be dominated by cosmetic
   JSX no assertion should care about.
3. **A silent wrong answer is expensive.** A wrong fold in `parts.ts` or a wrong branch in
   `encode.ts` produces a plausible-looking message that reaches a provider or a user. This
   is precisely the failure class the rest of this document is about.

`state/parts.ts` is the sharpest single target: 296 LOC, 100% statements, 98.3% branches,
pure functions, and the data model everything else in the kit is built on. A folder at 100%
coverage is where mutation testing has the most to tell you, because coverage has already
run out of things to say.

**Do not run it repo-wide.** ~53,000 LOC of Solid components would take hours and return a
survivor list nobody reads. And do not gate on the mutation score either — it is the same
trap as a coverage threshold, one level up.

Practically: Stryker with the vitest runner, pointed at `--project=unit`, mutating only
those paths. Treat the first run as a reading exercise, not a scoreboard.

---

## 6. The caveat — read this before quoting any number above

**Line coverage measures whether a line *executed*, not whether anything would *notice* if
it were wrong.** Every figure in this document is a statement about execution and nothing
more.

This is not a theoretical hedge here. Nearly every defect this project found in the last
two days was in code that ran fine:

- a conformance locator that executed and asserted against the wrong element
- a smoke script that ran and only ever built one framework
- an anti-rot regex that executed, matched nothing, returned `[]`, and read as clean
- a route that ran and produced output its SDK rejected
- CSS that shipped and was discarded by browsers

Every one of those would show as **covered**. Coverage would have called all five green.

**So: report high-coverage areas as "exercised", never as "tested".** The word "tested"
claims something this instrument cannot measure.

Producing this report reproduced the failure mode three times, which is the best evidence
of it I can offer:

1. A weak-assertion sweep across all eight areas returned **`0` for every area** and read as
   a clean result. It was a **zsh** bug — zsh does not word-split unquoted variables, so the
   whole file list was passed as a single filename and every grep silently matched nothing.
   Corrected, the same sweep returns 5,441 assertions.
2. A guard-to-CI mapping returned `ci_refs=0` for eleven guards, implying none were wired
   into CI. They all are — CI invokes them by *npm script name*, not filename, and the grep
   looked for filenames.
3. A `--coverage` run reported `Statements: 16.55%` from a suite that **crashed at 23 of 115
   files**, with nothing in the output marking it partial.

All three produced clean-looking, quotable, wrong output. The first two were caught only by
disbelieving a suspiciously round result; the third only by noticing two tables disagreeing
about `remote/`.

**Specific areas I suspect are weakly asserted despite good numbers**, offered as judgement
rather than measurement:

- **`agent-tooling/` (96.5%)** — the highest-coverage folder in the repo, and much of that
  coverage comes from `scaffold.test.ts` asserting the *wording of emitted string
  literals*. The `emitted` project exists precisely because the maintainers already
  concluded that string-shape assertions do not prove the output runs. The 96.5% blends
  both kinds; the strong half is the smaller half.
- **Every module in Tier 2 (§3b)** — 100% story coverage on `ui/pane-grid.tsx` means it
  mounted without throwing. Nothing more. Reading those as tested would be the largest
  single error available in this document.
- **`schemas/` (95.8%)** — generated-adjacent code where high coverage is close to
  automatic and says little about whether the schemas are *right*.

---

## 7. What was left in the repo

Two files changed. No source file, no test file, no lockfile:

- **`packages/ui/vitest.config.ts`** — a `coverage` block (provider, reporters, `include`,
  `exclude`). **Inert unless `--coverage` is passed**: Vitest collects nothing without that
  flag, so a normal `vitest run` is unaffected. There is deliberately **no `thresholds` key**
  and **no CI step**.
- **`.gitignore`** — ignores `coverage/`.

No dependency was added: `@vitest/coverage-v8@4.1.2` was already declared (§0).

**Reproduce with:** `nx build ui && npm run build:css && npx vitest run --project=unit --project=emitted --coverage`

**No threshold is proposed and none should be added.** A percentage becomes a target, gets
gamed, and then gets believed. The map in §3 is the deliverable; the number in §2 is not.
