# HANDOFF: model-driven components

Last updated 2026-08-11. Supersedes the 2026-08-10 version entirely.

**The epic through PR #147 is MERGED TO MAIN.** The 2026-08-11 work described below is not:
sub-project D, the guard round, the re-recorded five-configuration matrix and the corrections
to this document all sit on `feat/message-parts`, ahead of `origin/main`. Check the gap with
`git rev-list --count origin/main..feat/message-parts` rather than trusting a count written
here, because a count written here is stale by the next commit (§5.11).

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

**Sub-project D is done** (§1.1). Both conformance known gaps are closed in the library.

What remains between here and something genuinely distinctive is **the emit contract** (§1.2).
That is the head of the queue.

---

## 1. Recommended sequence

Do these in order. The reasoning for the ordering matters more than the list.

### 1.1 Sub-project D — DONE. Nothing to do here.

Tasks #65, #66, #67, the citation row and the scaffold parity repair all landed on this branch.
Recorded here so nobody re-opens them, and because the details are contracts a consumer can hit:

- **#65 `addCard` is an id-keyed upsert** — `upsertCardPart` in `packages/ui/src/state/parts.ts`.
  It **replaces the envelope wholesale** rather than merging fields. Deliberate: a card envelope
  arrives whole, as one tool result, and a field-by-field merge could never CLEAR `resolution`,
  which `CardPolicy.onReopen` needs.
- **#66 `artifact` is the 7th built-in card type**, rendering through
  `packages/ui/src/components/artifact-card.tsx`. That wrapper exists because `<Artifact>` cannot
  supply its own height — bare in a thread, its preview frame measures 0px — and it carries
  `part="card"` + `data-card-type="artifact"` as the handles a test or a consumer can hold.
- **#67 `Reasoning` has `aria-expanded` / `aria-controls` / `data-state`.**
- **The citation row.** `source` parts render as a citation row (`part="citations"`), grouped the
  way `file` parts are and placed OUTSIDE the message bubble.
- **The emitted Solid scaffold's `renderPart` matches `components/message.tsx` again.** Sub-project
  D briefly broke that parity; it is repaired. Six branches: `text`, `reasoning`, `tool`, `card`,
  `source` (consecutive ones collapsed into one `<SourceList part="citations">` that is a SIBLING
  of the text bubble, not inside it) and `file` (collapsed into one `<Attachments>` row). Two
  divergences from `<kai-chat>` genuinely remain, and are now stated instead of being papered over
  by the old "renders exactly what `<kai-chat>` renders" claim: the bubble's own padding and
  radius, and no `cardTypes` override prop.
  **It is guarded structurally, not merely fixed.** `verify:scaffold` parses the `MessagePart`
  union out of `src/elements/chat-types.ts` with the TypeScript compiler API and requires a
  `partAs(part(), '<variant>')` branch per variant across all 54 Solid cells. Watched failing three
  ways, one of them an emitted front end of `''`, because an empty `.tsx` compiles clean and tsc
  would have waved it through.

Both former red cells are closed: S12 and S13 no longer carry a `knownGap` at all. **The full
five-configuration matrix has since been re-run live**, so all ten S12/S13 cells are live passes,
not replays. The hedge that used to sit here is retired, and it was retired by a measurement
rather than by a judgement that it read as fussy. Per-cell evidence is in the results doc.

### 1.2 The emit contract (tasks #8–#11) — START HERE

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

**New, from sub-project D. No issue numbers yet.** The first is the one that matters. (The
scaffolder's missing `source` branch used to head this list; it is fixed and guarded, see §1.1.)

- **No CI guard that generated files are in sync with source.** `element-meta.json`, `llms-full.txt`
  and `docs/web-components.md` are derived, committed, and checked by nothing. The obvious guard is a
  regenerate-and-`git diff --exit-code` job. Watch it fail before trusting it (§5.10).
- **The conformance harness no longer exercises the consumer `cardTypes` seam anywhere.** S13 used to
  be its only user, via `<spike-artifact>`; now that `artifact` is built in, the seam that lets a
  consumer substitute their own design-system component is untested end to end. That seam is exactly
  what task #9 is about to build on.
- **`docs/web-components.md:5` claims 27 elements.** `element-meta.json` has 80. Hand-written prose
  inside a generated file (§5.2).
- **Two timing tests flake under full-suite load** — `primitives/create-tween.test.ts` and
  `components/audio-visualizer/variant-wave.test.tsx`. They pass in isolation. Fake timers or a
  tolerance, not a retry.

### 1.5 #70 — INVESTIGATED, and it demoted itself. Do not fix it next.

Done: [`specs/2026-08-11-reasoning-details-investigation.md`](specs/2026-08-11-reasoning-details-investigation.md).

**The filing's premise was wrong.** `reasoning_details` is NOT absent from `wire/` — the read path
handles it deliberately and with tests. The drop is one function on encode (`toOpenAIMessages`), and
the comment justifying it ("OpenAI chat completions has no reasoning channel on the way back in") is
the real error. OpenRouter has one.

**The untested question is answered: it round-trips.** OpenRouter accepts `reasoning_details` on the
way back in (200), and omitting it is accepted too (200). Zero 400s. The signature is the
load-bearing field — stripping it is a hard 400 from Anthropic upstream.

**If you do fix it, do not echo `part.raw`.** After a streamed turn `part.raw` holds the FINAL
fragment only — a signature with no text. Reassemble from `part.text` + `part.signature`.

**Verdict: a latent quality-and-cost gap, not a defect.** Including reasoning costs ~+25% prompt
tokens per round. Reprioritise it below §1.6.

### 1.6 The finding that came out of #70, and is worth more than it

**The matrix was measuring a harness parameter and reporting it as a provider limit** — for a whole
five-configuration sweep, in a published table, as a confident `n/a`.

The spike asked for thinking with `reasoning: {effort: 'medium'}`. OpenRouter derives an Anthropic
budget from `effort` as a PERCENTAGE of `max_tokens` (medium ~= 50%), and the spike caps `max_tokens`
at 900 for cost. That derives 450 — under Anthropic's 1024 floor — so the provider returned no
thinking, silently, with a 200. The Anthropic-wire column meanwhile asked for a full 1024. **The two
columns were never asking the same question, which is the single thing that configuration exists to
guarantee.**

Fixed and guarded (`server/thinking-budget.test.ts`, cross-wire assertion, watched failing first).
S02 on `haiku-4.5 (openai wire)` is now a live `pass` with real signed thinking.

Both halves are confirmed: live pass, and offline replay green against a settled build. The replay
needed two attempts — the first collided with a concurrent `dist/` rebuild and failed with a symptom
that looks nothing like a build race (`data-kai-phase="running"` never appearing), then reproduced as
a pass with no code change.

**Done since, and it paid for itself:**

- **All five configurations were re-run live**, not just `haiku-oai`. The item that used to sit
  here proposed exactly that, noted `gpt-5.4-mini` and `ministral-3b` were "not expected to move",
  and argued that expecting nothing is the reasoning that produced this bug in the first place.
  **`gpt-5.4-mini` moved.** Its reasoning went from encrypted-only to a 2,111-char summary between
  two runs hours apart: same model, same request, nothing changed on our side. A few cents bought
  a retraction of a claim we would otherwise still be publishing.

**Still open:**

- **A scenario that asserts on thinking and a tool call surviving the same round trip.** The
  re-recorded `haiku-oai` column now carries reasoning in all 13 scenario dirs, tool-loop
  scenarios included, so that configuration is exercised in passing. Nothing asserts on it. It is
  where the #70 fix would have to prove itself. Sketch in the investigation doc, §7.

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
| `verify:scaffold` | 432 emitted front-ends + 77 backend routes compile under real host tsconfigs; 54 html / 54 angular / 54 solid checked structurally, the solid ones per `MessagePart` variant | ~18s, no network |
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

**95 cells: 93 pass, 2 model-behaviour differences, zero known gaps, zero UI failures, $0.107.**
Every cell has a live measurement, S12 and S13 included. Both non-passes are `ministral-3b` (S02
reasoning, S04 multi-round tool loop), printed as `n/a` in the results table, and both are the
model doing something else rather than a defect: ministral has no reasoning mode, and it settled
the three-round loop in two. They are real, so do not round them off to "everything passes". The
per-cell table lives in the results doc rather than here, so it only has to be right in one place
(§5.11).

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
  is impossible to write. **No scenario uses it today** (S12 and S13 were its only users). Keep the
  mechanism: the next gap you document should be forced through it, not written as a comment.
- **The negative control (`conformance:control`) can be structurally blind.** It is the harness's own
  proof that the assertions are load-bearing, and it is weaker than it looks. Read §5.6 before you
  trust a red control cell as evidence that the green one means anything.
- **S05's cells are not equivalent across wires.** The OpenAI fixture interleaves argument fragments
  adversarially; Anthropic streams content blocks sequentially and cannot produce that shape. Marked
  `pass*` with a footnote.
- **A conformance cell measures one moment.** Of this table's three claims of the form "the
  provider cannot do this", **two did not survive a second measurement**: Haiku's missing thinking
  was us asking wrong, and `gpt-5.4-mini` went from encrypted-only reasoning to a 2,111-char
  summary between two runs hours apart. Same model, same request, different day. Only ministral's
  "no reasoning mode" held. Write these cells as **"did not, on this date"**, never as a provider
  limit.
- Switching models requires **restarting vite** — `OPENROUTER_MODEL` is read server-side per request.
  The matrix runner handles this; fixtures namespace by `modelSlug`.
- **A sweep is not "well under a cent".** The headline above is per five-configuration sweep
  ($0.1019 for the original one, ~$0.264 cumulative for the day). Price per token, not volume:
  Haiku is 14–35x DeepSeek, and the two Haiku columns are 84% of the total on 41% of the requests.

### Anthropic wire constraints, now documented

`tool_choice` must be an object. `system` is top-level, not a message. `budget_tokens` >= 1024 with
`max_tokens` strictly greater (reusing `max_tokens: 900` fails outright). Blocks stream strictly
sequentially and are indexed by **content block**, so a thinking block pushes a tool call from index
0 to 1 — which is the exact shape of the original Critical.

**Verbatim thinking costs about 1.07x prompt tokens, not 2.2x.** The 2.2x this document used to
publish was a double-count, wrong by almost exactly a factor of two. **The Anthropic Skin emits
`input_tokens` TWICE per request**, once in `message_start` and once in the final billed usage
frame; the OpenAI wire emits it once. Counting every occurrence doubles one column and leaves the
other alone. Re-derived from the committed fixtures by two sessions independently:

| | anthropic | openai | ratio |
|---|---|---|---|
| `18e7dd8`, every occurrence | 52,922 | 24,039 | **2.20x, the figure that was published** |
| `18e7dd8`, billed frame only | 26,461 | 24,039 | 1.10x |
| `e352545`, billed frame only | 26,185 | 24,560 | **1.07x, like for like** |

**Publish 1.07x.** The 1.10x row is not the answer either: it compares a thinking column against
one that, because of the budget bug, had no thinking in it. Only the current sweep compares like
with like.

The corroboration that settles it does not go through token counting at all, which is why it is
worth more than the arithmetic: **the two columns' billed costs differ by 7.5%** ($0.046465 vs
$0.043233, same model, same price card). That tracks a 1.07x prompt-token ratio and is flatly
inconsistent with 2.2x, which would have shown up as roughly double.

**Why this was worth chasing rather than filing as tidying.** As written, the claim read *do not
use verbatim thinking on Anthropic, it costs more than double.* It asserted a 120% premium; the
real premium is about 7%. And verbatim thinking is not a tuning knob, it is a correctness
requirement: a modified or filtered thinking block is a hard 400 from the provider. So the
overstatement pushed the reader toward the one design that cannot work. It is a number someone
makes an architecture decision on, and it would have talked them out of the correct choice.

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
- A near-miss worth the line: the obvious implementation of the new `renderPart` variant guard
  **would have been satisfied by a COMMENT.** The prose naming `card / source / file` sits in the
  same emitted file as the branches that have to render them, so a text match cannot tell the
  description from the code. `verify:scaffold` strips whole-line comments before matching.

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

This is about writers colliding. For the other worktree failure — a writer that starts from the
wrong tree — see §5.9.

File-ownership instructions do not constrain whole-tree operations. One agent's
`git checkout -- <path>` clobbered another's in-flight edit; `npm pack` captured a third's mid-edit
file. Use `isolation: "worktree"` for agents that WRITE; readers can share.

**Third instance, 2026-08-11, and the first to destroy PAID evidence.** Two sessions shared
`.claude/worktrees/message-parts`. One ran a bulk `git checkout`/`reset` at 15:56:53 which, in a
single operation: reverted the other's uncommitted source edits, discarded **28 freshly recorded
live fixtures** (~$0.045 of API spend), and orphaned an already-made commit off the branch tip. A
second collision rebuilt `packages/ui/dist/` mid-run, producing a false conformance failure.

Three things made it recoverable and one made it detectable:

- **Commit early; committed work survives a checkout.** The orphaned commit was recovered intact
  with `git cherry-pick` — nothing was lost that had been committed. The fixtures, which had not,
  were gone.
- **Reports outlive artifacts.** `harness/matrix-reports/*.live.json` survived and was the durable
  proof the live pass had really happened, after the fixtures proving it were reverted.
- **Identical mtimes to the second across 28 files is the signature of a bulk VCS operation**, not
  of a run. A live run writes them spread over its duration. That is what distinguished "someone
  reverted this" from "another live run overwrote this", which have opposite responses.
- Detection was luck: the reverted file happened to surface in a tool notification. **Re-read
  `git log --oneline -1` before trusting that the tree still contains your work**, especially before
  spending money on a run whose output you intend to commit.

### 5.5 Compilation is not behaviour

A reference-keyed `<For>` type-checks perfectly. A Next.js route handler compiles cleanly and throws
`req.json is not a function` in SvelteKit. `verify:scaffold` structurally cannot catch either.

### 5.6 A control pass can be structurally blind

§5.1 says watch the check fail. That is necessary and **not sufficient**. Confirm it fails for the
reason you think.

S13 passed in 2.0s while the artifact card rendered as **empty chrome** — heading, toolbar, no
content. The assertion was `seesText(page, 'v2')`, unscoped, and it was satisfied by the
`<kai-tool>` panel echoing the model's own `open_artifact` ARGUMENTS a few inches up the thread.
The card never had to render anything.

The part worth internalising is that **the negative control could not have caught it.**
`CONTROL-empty` produces no tool panel either, so the control goes red — for a plausible-looking
reason — while the real run proves nothing. Two green-and-red signals, agreeing, both blind. It was
caught by DOM-probing a GREEN run, which is the only thing that would have.

Both S12 and S13 now scope their assertions to the element that must do the rendering
(`kai-thread [data-card-type="artifact"]`, and "outside `[part~="content"]`" for citations). S12
learned the same lesson independently: a bare `a[href*="ui.kitn.ai"]` passed off a markdown link the
model had typed in its prose.

### 5.7 Verifying the intended change is not verifying the diff

A peer regenerating the derived docs confirmed the thing it wanted was present — and nearly
committed a silent **67-entry regression in the same file**: every slot's `inject`/`replace` value
collapsed to `—`, from running `gen-llms.mjs` standalone after `build:api` had already written it.

The intended change was correct. Everything around it was not. **The oversized diff was the only
tell.** Read the whole diff of a generated file, not the lines you went looking for.

### 5.8 A cached build looks exactly like a successful one

**`nx build ui` CAN hit the NX cache and skip the generators entirely**, reporting "Successfully
ran target build" while changing nothing: those generators write their side effects into the
SOURCE tree, and a cache restore does not put them back. If you need the derived artifacts
regenerated, run `npm run build:api` inside `packages/ui`, or pass `--skip-nx-cache`.

**Rely on neither behaviour.** The cache hit was observed once, with output quoting "read the
output from the cache" and zero changed files. A second agent could not reproduce it: three
consecutive `nx build ui` runs all missed the cache and did regenerate, mtimes advancing each
time. Both observations are probably true, since the target's own source-tree side effects dirty
its input hash and most real edits dirty it further.

The hazard holds either way, and it is the same family as §5.1: **success and no-op are
indistinguishable from the output.** Verify the artifact changed, not that the command exited 0.

This was first written flat ("`nx build ui` does NOT regenerate the derived artifacts"), here and
in `CLAUDE.md`, generalised from that single observation inside an hour. It is the freshest
instance of §5.13. The advice survives both observations, so it was safe to state; the mechanism
was contingent on one run, and the mechanism is the half that had to be corrected.

### 5.9 Worktree-isolated agents branch from `origin/main`, not from your branch

`worktree.baseRef: fresh`. Of four agents dispatched today, **two were stale** — one by 12 commits,
on a base where two of its own target files had since changed. It would have gone green the whole
way against a tree that no longer exists.

Both caught it themselves, and only because the base "looked wrong". That is luck, not a process.

**Fix: state the base SHA in the dispatch and require the agent to assert it before editing.** One
line each side. This is the cheap half of §5.4 — that one is about writers colliding, this one is
about a writer starting from the wrong tree, and they need different fixes.

### 5.10 A one-directional guard is satisfied by a registry that has drifted into fiction

Proven, not argued: **deleting `part="row"` from the source left all 27 `slots.test.ts` tests
green.** The drift guard only asserted "every `::part` in source is registered". A registry entry
with nothing behind it sailed through, which is the failure mode a registry actually has.

Both directions now exist (`slots.test.ts`, "reverse drift guard"). Note the residual limit
honestly, because the next person will over-read it: **the reverse check matches part names
GLOBALLY.** It proves a name is rendered *somewhere* in the source, not that it is rendered by the
element it is registered under. A part moved between elements still passes.

### 5.11 A fact stated in two places gets fixed in one

This is the shape underneath §5.6, §5.7 and §5.10, and it is worth more than any of them.

**When a value appears in more than one place — a count in a summary and in a heading, a field name
across two wire formats, a registry entry and the source it describes — changing one and verifying
that one is indistinguishable from having changed both.** Five instances, all today:

- **S13.** The assertion verified there was exactly one artifact card, and missed that the `v2` text
  proving the revision came from the tool panel rather than from the card. One half checked.
- **The regen.** A peer confirmed the entry it was adding was present, and nearly committed a silent
  67-entry regression in the same file (§5.7).
- **The results doc.** A correction updated "3 model-behaviour differences" in the summary and left
  "### 2. Model-behaviour differences — 4 cells" eleven lines below it. Two statements of one count,
  one updated — in a document whose entire subject is a table disagreeing with the prose under it.
- **A guard spec.** A reasoning-floor check keyed on `usage.completion_tokens_details.reasoning_tokens`,
  which is the OPENAI-wire spelling. The Anthropic wire calls it
  `usage.output_tokens_details.thinking_tokens`. Same fact, two spellings. It would have failed the
  one column that was always correct, and gone red against its historical control for a reason
  unrelated to the claim — a validated-looking red/green pair keyed on a field that is meaningless
  on half the columns. Same failure as §5.6: **a real red is not sufficient; the red has to be red
  BECAUSE of the thing being measured.**
- **The scaffold cell count, and it is the one instance here that got resolved by measurement.**
  §3 says 432 emitted front ends; `CLAUDE.md` said 378 (6 x 9 x 7). Running the gate settled it:
  **432 across 8 frameworks, 432/432 compiling**, plus 54 html / 54 angular / 54 solid structural
  checks and 77/77 routes. §3 is correct, do not "fix" it; `CLAUDE.md` is the stale copy and is
  being corrected separately. **The tell was not that either number looked wrong. It was that they
  disagreed**, and neither document alone could have produced that signal.

The check that catches this is not "did my change work" but **"where else is this same fact
written"**.

And the lesson is not "be careful" — this repo already has the structural answer for the code cases.
`TOOL_KEYS`/`REASONING_KEYS` fail the BUILD when a field is added without a comparator; the `::part`
guard now compares registry against source in both directions. **Make the duplicate impossible, or
make it fail loudly.** Prose is where that is hardest and where no guard exists, which is why the
results doc is the instance that got furthest.

### 5.12 Absence read as a legitimate value

**This and §5.13 are the two lessons from this session that leave this repo**, alongside §5.11.
The rest above are instances: worth recognising when they recur, but tied to this codebase. These
two are rules.

Four separate bugs were the same bug: something was absent, and the absence was read as a value.

- **The original Haiku bug.** HTTP 200 with no thinking block, read as a provider limit and
  published as one (§1.6). A silent 200 is the best-disguised absence there is, because it arrives
  carrying a success code.
- **A truncated fixture has no usage frame**, so it reads as zero reasoning tokens, and a guard
  built on that number blames a provider for a dead connection.
- **The same fixture reads as a smaller cost total.** This one has no shape to notice at all: an
  undercount is indistinguishable from a correct total.
- **"Zero fixtures matched the glob" and "zero findings in the fixtures"** are the same number
  with opposite meanings, and nothing in the output separates them.

Operational form: **assert the COUNT before you trust the SUM, and state the count beside the
figure so a reader can tell a complete measurement from a partial one.** Summing whatever happens
to be present is not measuring it. The results doc's cost table prints `requests` next to `cost`
for this reason, over an assertion that `cost_fields == count(*.sse)` per column.

**The count check has its own blind spot, and it is a different failure: presence read as
current.** That assertion reported OK on all five columns while two stale orphan fixtures from a
previous run sat in the tree, inflating the naive total by $0.0024. They are complete files with
valid cost fields; they are just from a different run. **A completeness check cannot tell you the
data is fresh.** Keep it separate from the four above, because it defeats the check you would
build to catch them.

### 5.13 The contingent argument is the one that will need correcting later

The question was whether replaying a recorded stream offline proves anything, or is circular
because we changed the renderer and then replayed our own recording.

There is an argument that cannot fail: **a fixture is the provider's SSE bytes, captured in the
proxy upstream of everything the fix touched, so our rendering code cannot have influenced what a
provider sent. In any ordering. Ever.** It holds for every fixture in the repo regardless of when
it was made, and no later discovery about dates can touch it.

Two sessions in sequence reached past it, for evidence that was vivid and checkable over evidence
that was merely true. The first argued from a wall clock ("recorded before the citation row
existed"), which was wrong as stated: the commit was 15:43 and the recording 15:52. The correction
argued from commit timestamps, which survived one more round of checking and then also needed
qualifying. Recorded honestly: one round more, which is not a difference in kind.

**A timestamp feels like proof because it has a number in it and you can go and look.** The
structural claim has no number and reads like a bare assertion, which is exactly why both sessions
reached over it for the version that could be wrong. **When an argument is available in both a
structural and a contingent form, the contingent one is the one that will need correcting later.**
Lead with the structural one; keep the dates below it as corroboration for a reader who does not
accept it.

---

## 6. Repo gotchas

- After `nx build ui`, `packages/ui/src/components/component-meta.json` churns with TS-expansion
  noise. `git checkout --` it; it is not used at runtime. **Everything else regenerating is real** and
  should be committed — the branch is meant to be a zero-drift build fixpoint. But do not read
  NOTHING regenerating as proof of a clean tree: that is also what a cache hit looks like (§5.8).
- **Run `pnpm --filter @kitn.ai/ui run build:css` in a fresh worktree** before the unit suite.
  `src/elements/compiled.css` is generated and gitignored, and without it the element tests fail on
  `Failed to resolve import "./compiled.css?inline"` — which reads as a broken checkout.
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
