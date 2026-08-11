# HANDOFF: model-driven components

Last updated 2026-08-11. Supersedes the 2026-08-10 version entirely.

**Everything described here is MERGED TO MAIN.** `feat/message-parts` is level with
`origin/main` (0 ahead, 0 behind). There is no unmerged work.

---

## 0. Read this first

The two goals, in Rob's framing:

1. **Help devs create projects** — the `kai` MCP scaffolder (ships) and `npx create-kai` (spec only, zero code).
2. **Prove a real model drives our UI** — tools, responses, cards, reasoning, end to end.

**Goal 2 is done and evidenced.** 95 conformance cells across five model configurations,
zero UI failures, every result produced twice (live, then replayed offline) and agreeing.
See `docs/superpowers/specs/2026-08-11-cross-model-conformance-results.md`.

**Goal 1's delivery layer is repaired and guarded.** Scaffolds compile AND run across seven
frameworks; backend routes are type-checked against real host tsconfigs; the emitted code no
longer teaches a bug.

What remains between here and something genuinely distinctive is **sub-project D's three
small items, then the emit contract**. That is roughly a session, not an epic.

---

## 1. Recommended sequence

Do these in order. The reasoning for the ordering matters more than the list.

### 1.1 Sub-project D — the three small items. DO THESE FIRST.

Tasks #65, #66, #67, plus the citation row.

**Why before the emit contract, which is the roadmap's stated next step:** `AssistantStream.addCard`
only appends, with no id-keyed upsert (`packages/ui/src/state/stream.ts:55`, contrast
`upsertTool`). The emit contract's entire pitch is "hand a model our `confirm` schema as a tool
and it emits a renderable envelope by construction". If a model then REVISES that card, today it
renders N copies. Shipping schemas-as-tool-definitions on top of a card pipeline that cannot
update a card would undercut the feature at launch.

- **#65 `addCard` id-keyed upsert.** Mirror `upsertTool`. Turns conformance S13 from red to green.
- **#66 `artifact` in `BUILTIN_CARD_TAGS`.** `<kai-artifact>` ships but nothing routes a card part
  to it, so a model cannot drive an artifact through the dispatcher at all. The conformance spike
  had to register its own `<spike-artifact>` via the `cardTypes` seam just to test S13.
- **#67 `Reasoning` has no `aria-expanded`/`aria-controls`** (`components/reasoning.tsx`), unlike
  `Collapsible`. An a11y gap, and it left the harness asserting on computed `max-height` because
  there is no attribute handle on the disclosure.
- **The citation row.** `source` parts land on the message correctly, but `message.tsx:464`
  deliberately matches them to `null`. Conformance S12 fails by design because of this. A developer
  wiring up a search tool today sees results arrive and nothing appear.

All four are narrow. The conformance harness already exists to prove them: S12 and S13 are the last
two red cells in the table, and both have preconditions that now fail loudly if the run is broken
rather than silently reporting "gap confirmed" (see §4).

### 1.2 The emit contract (tasks #8–#11)

Ten card JSON Schemas are built into `dist/schemas/` on every build and exported nowhere.

**A card schema IS the shape of a tool definition.** Hand a model our `confirm` schema as a tool
and it emits a valid envelope by construction, which our dispatcher renders. No glue, no prompt
engineering. It is the most differentiating thing in the backlog and most of it already exists.

Evidence it matters: our own conformance spike had to HAND-DERIVE the confirm schema because the
kit's schemas are unreachable through the exports map. `src/card-schema.ts` opens with a comment
saying so. The one consumer who tried to use them could not.

Also settled empirically, do not re-litigate: **cards come from TOOLS, not structured output.**
The spike ran both. Structured output produces valid envelopes but suppresses tool calling, breaks
streaming, and costs more. Recorded in `examples/internal/openrouter-spike/FINDINGS.md`.

- **#8** export the schemas (`./schemas/*` in the exports map plus node10 `typesVersions`), with a
  guard that resolves each of the ten through the public entry, watched failing first.
- **#9** custom schema registration, so a consumer can register their own design-system component
  the same way. Extension happens at the CARD layer (`mergeCardComponents`/`mergeCardTags`,
  consumer wins), never by adding `MessagePart` variants.
- **#10** document schemas-as-tool-definitions and wire it into the MCP scaffolder and
  `component_reference`, so scaffolds GENERATE tool definitions from the schemas rather than
  restating them. This is what stops hand-copy drift before `create-kai` multiplies it across
  seven frameworks.
- **#11** add `openai` and `anthropic` catalog integrations. The two keys developers most often
  already hold, missing from both the CLI catalog and the `kai` MCP. `@kitn.ai/ui/wire` already
  parses both formats.

### 1.3 `create-kai` (tasks #12–#15)

Genuinely unblocked now. Spec at `docs/superpowers/specs/2026-07-01-create-kai-scaffolder-design.md`
(v2: layout-first flow, feature multi-select, the clone rule, `kai.json`, staged v0/v1/v2).

It would have inherited every scaffolder defect fixed on 2026-08-10/11 and multiplied it across
seven frameworks, which is why it was right to do the repair first.

### 1.4 Small items — batch them

Do NOT pay context-switch cost on these individually. Batch them when something else forces a build.

#27 (per-element `./elements/*` not server-importable), #54 (Angular starter README false claim about
boolean attributes), #58 (3 `redeclared-kit-type` docs advisories), #62 (per-element event
attribution is file-level), #63 (docs harness should read `declarativeChildren` instead of grepping
source — would take 17 advisories to zero), #64 (the defensive `[]` defaults on `kai-file-tree` /
`kai-segmented`), #68 (promote the Solid mid-stream repro into CI), #69 (Solid starter imports from
the root entry while the guide says `./solid`).

### 1.5 #70 needs an INVESTIGATION, not a fix

`reasoning_details` is absent from `packages/ui/src/wire/` entirely, so it is dropped on the OpenAI
path. That is asymmetric with the Anthropic path, which deliberately preserves opaque blocks
verbatim in `part.raw`.

**The drop is certain. The consequence is NOT established.** Nobody has tested whether OpenRouter
accepts `reasoning_details` on the way back in, or whether dropping it degrades a multi-round loop
with a reasoning model. Establish that first. If it round-trips fine, this is a non-issue.

---

## 2. Shipped to npm

| version | contains |
| --- | --- |
| **0.20.0** | audio-visualizer epic + the `sideEffects` blank-page fix |
| **0.20.1** | root entry server-importable |

Both fixes were for bugs **live in production and not caused by the parts work**. Both were found
by building and running real consumer apps, not by reading code.

- **`sideEffects`** omitted `dist/register-impl-*.js`, so Vite 8 / Rolldown tree-shook every
  `customElements.define` call. Blank page, silent console. **The trigger is Vite 8 specifically** —
  Vite 6 and 7 keep the chunk. The kit did not regress; the ecosystem moved. That is why the June
  consumer-hardening campaign passed and this failed.
- **Root entry SSR.** `dist/index.js` is compiled with Solid's DOM transform but left `solid-js`
  external, so under Node `solid-js/web` resolved to the SERVER build where `template` is a stub.
  **Bundling Solid does NOT fix it** — measured; that build fails with `window is not defined` from
  24 module-scope `delegateEvents` calls. The transform is the problem, not the resolution. Fix is a
  `node`-condition SSR twin whose condition order mirrors `solid-js/web`'s own exports map.

**OUTSTANDING, needs Rob's npm credentials:** deprecate 0.19.0. It is still installable and still
ships the blank page. Agent auth returns E401.

```
npm deprecate "@kitn.ai/ui@0.19.0" "Blank page on modern bundlers: sideEffects did not cover the element-registration chunk, so Vite 8 / Rolldown strips every customElements.define call (silent console). Also not server-importable. Fixed in 0.20.1 - please upgrade."
```

---

## 3. The nine CI guards

Up from two. **Every one was watched failing before being trusted.** If you add a tenth, do the same
or do not bother.

| guard | catches | notes |
| --- | --- | --- |
| `verify:consumer` | registrations survive a real Vite 8 bundle | 79/79 tags |
| `verify:dts:consumer` | shipped `.d.ts` type-check under bundler AND nodenext, both directions | needs network |
| `verify:ssr` | every public entry imports under `node` | 8 entries, derived from the exports map |
| `verify:solid-coverage` | every element writable in Solid, every component has a `<Name>Props` | 80/80 + 164 |
| `verify:scaffold` | 432 emitted front-ends + 77 backend routes compile under real host tsconfigs | ~18s, no network |
| `verify:docs` | every doc snippet compiles against the shipped API | BLOCKING, gates on `high` only |
| `verify:dts` | no emitted declaration escapes `dist/`, all specifiers resolve | both resolution modes |
| unit | 2306 tests / 209 files | |
| typecheck | 4 tsc passes | |

**Both halves of a two-direction guard are required.** "Wrong code errors" alone is satisfied by
types that error at everything; "right code compiles" alone is satisfied by types that are entirely
`any` — which was the actual bug in the `.d.ts` case.

---

## 4. The conformance harness

`examples/internal/openrouter-spike/`. Read `HARNESS.md` first.

19 scenarios, each a module owning its prompt, tools and a **rendered-DOM** assertion. A Playwright
runner drives the real app; the proxy records every live stream to a fixture and replays it with no
key and no network. Results: `docs/superpowers/specs/2026-08-11-cross-model-conformance-results.md`.

**95 cells: 81 pass, 10 confirmed known gaps, 4 model-behaviour differences, ZERO UI failures.**

### Things about it you must know before touching it

- **Switching `OPENROUTER_MODEL` to an Anthropic model does NOT test the Anthropic path.**
  OpenRouter's `/chat/completions` normalises every model onto the OpenAI shape, so it runs
  `readOpenAIStream` against an Anthropic model and reports success. There is now a SECOND wire
  routing `anthropic/*` through OpenRouter's Anthropic Skin (`/api/v1/messages`), verified from the
  recordings themselves (`message_start`, `thinking_delta`, `content_block_stop`).
- **A chat-completions stream fed to `readAnthropicStream` does not throw — it parses to NOTHING.**
  This produced six false failures on the first Anthropic run. Reading the table instead of the
  failure text would have published "the Anthropic path fails 6 of 19". It fails none.
- **`knownGap` now requires three things**: the run reached the gap, the assertion still fails, and it
  fails with the DOCUMENTED message. It previously swallowed any failure for S12/S13 — a broken
  run was recorded as "gap confirmed". The type is `{ what, reached, signature }` so a bare gap note
  is impossible to write.
- **S05's cells are not equivalent across wires.** The OpenAI fixture interleaves argument fragments
  adversarially; Anthropic streams content blocks sequentially and cannot produce that shape. Marked
  `pass*` with a footnote.
- Switching models requires **restarting vite** — `OPENROUTER_MODEL` is read server-side per request.
  The matrix runner handles this; fixtures namespace by `modelSlug`.
- **Cost is $0.1019 for a five-configuration sweep**, not "well under a cent". Price per token, not
  volume: Haiku is 14–35x DeepSeek.

### Anthropic wire constraints, now documented

`tool_choice` must be an object. `system` is top-level, not a message. `budget_tokens` >= 1024 with
`max_tokens` strictly greater (reusing `max_tokens: 900` fails outright). Blocks stream strictly
sequentially and are indexed by **content block**, so a thinking block pushes a tool call from index
0 to 1 — which is the exact shape of the original Critical. Verbatim thinking costs 2.2x prompt
tokens.

---

## 5. Hard-won lessons. These WILL recur.

### 5.1 The dominant failure mode: checks that pass while covering nothing

This accounted for more defects than bad implementations, by a wide margin. Instances from this epic:

- `verify:scaffold` was not failing on backend routes, it **never compiled them at all** — it sliced
  the emitted text at `=== (2) BACKEND ROUTE ===` and kept only the front end. 65 of 77 routes did
  not compile.
- A test named *"does NOT cancel a stream that finished on its own"* was green the whole time every
  response body was being aborted. Its mock used the default queuing strategy, so the fixture was
  enqueued AND closed before the adapter finished parsing, and `reader.cancel()` on a closed stream
  is a spec no-op that never reaches the underlying `cancel()`. **It was structurally incapable of
  failing.**
- `skipLibCheck: true` — on in every Vite template — makes an unresolvable import inside a shipped
  `.d.ts` silently degrade the type to `any`. Two probes passed against the broken package before a
  structural assertion caught it.
- `ts.resolveModuleName` under NodeNext with a *default* resolution mode resolves extensionless
  specifiers fine. The obvious guard implementation would have gone green on the broken package.
- The agentic scaffold seeded a fabricated `tc_001` tool call, so the panel showed "search
  Completed" from fixture data while the live loop had never run. **Sample data is a check that
  proves nothing, aimed at humans.**
- The `knownGap` mechanism in the harness built to catch all of this (§4).
- My own CI poller, twice — treating an empty API response, and an unenumerated status word, as
  "done".

**How to apply:** require watching it fail. Ask "would this pass if I deleted the feature?" Verify
the check reads the right artifact. Treat silence as unproven, never as success.

### 5.2 Code that gets copied has no compiler watching it

Scaffold output, generator prose inside `gen-*.mjs`, docs snippets, and starter apps are invisible
to both gates. Verify by GENERATING and RUNNING the artifact, not by reading the diff. Four separate
instances shipped the removed schema or a wrong API this way.

Corollary: **hand-written content inside a generator is the worst case**, because regeneration
reproduces stale text byte-identically and every drift check passes.

### 5.3 A fix at one layer can be dead if the layer above it is broken

The mid-stream panel bug was fixed at four levels, and each fix was correct and *inert* until the
one above it landed: `MessageBody` → `ChatThread`/`Thread` → the emitted scaffold → the starter and
the live docs page. A jsdom test drove `MessageBody` directly and went green while a browser found
the bug in seconds.

### 5.4 Concurrent writers need isolated worktrees

File-ownership instructions do not constrain whole-tree operations. One agent's
`git checkout -- <path>` clobbered another's in-flight edit; `npm pack` captured a third's mid-edit
file. Use `isolation: "worktree"` for agents that WRITE; readers can share.

### 5.5 Compilation is not behaviour

A reference-keyed `<For>` type-checks perfectly. A Next.js route handler compiles cleanly and throws
`req.json is not a function` in SvelteKit. `verify:scaffold` structurally cannot catch either.

---

## 6. Repo gotchas

- After `nx build ui`, `packages/ui/src/components/component-meta.json` churns with TS-expansion
  noise. `git checkout --` it; it is not used at runtime. **Everything else regenerating is real** and
  should be committed — the branch is meant to be a zero-drift build fixpoint.
- **Do not run a gate in the same shell command as the build.** Several "failures" this session were
  a gate reading a mid-rebuild `dist/`. Build, then run.
- `nextjs` and `tanstack-start` starters use `file:` deps. **Plain `npm install` does NOT refresh
  them** — npm treats an unchanged version as up to date. `rm -rf node_modules/@kitn.ai/ui && npm install`,
  then verify the sha256 matches the fresh build.
- **npm serves a CACHED STALE tarball** when a packed filename repeats. Use a unique name per build
  or a consumer proof verifies the PREVIOUS build.
- The `/consumer-regression` skill loads from the MAIN checkout. If you are in a worktree, check
  whether the worktree's copy is newer.
- `pnpm install --filter <pkg>` prunes the root install in this workspace. Follow with a full
  `pnpm install`.

---

## 7. Where the artifacts are

- Conformance results: `docs/superpowers/specs/2026-08-11-cross-model-conformance-results.md`
- Docs alignment findings: `docs/superpowers/specs/2026-08-10-docs-code-alignment.md`
- Solid entry coverage analysis: `docs/superpowers/specs/2026-08-10-solid-entry-coverage.md`
- Roadmap (ordering rationale): `docs/superpowers/plans/2026-08-10-roadmap-conformance-schemas-cli.md`
- Wire adapter design: `docs/superpowers/specs/2026-08-09-wire-adapter-design.md`
- Spike findings incl. cards-from-tools: `examples/internal/openrouter-spike/FINDINGS.md`
- Harness usage: `examples/internal/openrouter-spike/HARNESS.md`
- `create-kai` spec v2: `docs/superpowers/specs/2026-07-01-create-kai-scaffolder-design.md`
