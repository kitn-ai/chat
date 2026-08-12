# HANDOFF: model-driven components

Last updated 2026-08-12. **Verified against `origin/main` at `476a16b`.** Supersedes the
2026-08-11 version entirely.

That SHA is the point of the line, not decoration. This document is a claim about the state of a
tree, and without knowing which tree, a later reader cannot tell drift from disagreement.
`git log --oneline 476a16b..origin/main` measures exactly how stale this is. Every count and every
"done" below was read off that tree; nothing was carried forward from the previous version on
trust, and several things that were carried forward turned out to be wrong.

**This document went stale between being written and being merged, which is the failure it is
about.** It was derived against `665350a`; four PRs (#182–#185) landed before it could merge, and
re-deriving against `476a16b` moved **seventeen** figures across §0–§4. One was structural rather
than incremental — #185 replaced the scaffolder's archetype axis with a surface axis, so the
front-end matrix went 528 → 616 and the three structural checks went 66 → 77 each — and the rest
moved because a suite grew, a gate was added, or a count was simply wrong (§2's deprecation table
said five versions where the registry says six). Two items §1.3 recorded as BLOCKED were unblocked
by the same PR, and one §1.4 item had half closed itself. **That is the rate to plan for: about one
figure in three, over a single day of merged work.** Re-derive the section; do not patch the one
number somebody tells you about, because the number you are told is rarely the only one that moved.

**The work this document describes as done is MERGED TO MAIN**, through PR #178, and
**`@kitn.ai/ui@0.21.0` is published** (§2). That now includes the whole emit contract, which the
2026-08-11 version had in flight and at the head of the queue. In-flight work is described by its
plan under `docs/superpowers/plans/`, and those files carry their own base SHAs.

Read the state from the repo, not from a branch name written here. `git log --oneline origin/main`
answers what has landed. A branch name cannot, because branches merge and get deleted while a
sentence naming one stays put, which makes a branch name a worse thing to hardcode here than the
count this paragraph used to warn about (§5.11).

---

## 0. Read this first

The two goals, in Rob's framing:

1. **Help devs create projects** — the `kai` MCP scaffolder (ships) and `npx create-kai`, which is
   now a real package with one framework working end to end rather than a spec with zero code.
2. **Prove a real model drives our UI** — tools, responses, cards, reasoning, end to end.

**Goal 2 is done and evidenced.** 95 conformance cells across five model configurations,
zero UI failures, every result produced twice (live, then replayed offline) and agreeing.
See `docs/superpowers/specs/2026-08-11-cross-model-conformance-results.md`. Read §4 before you cite
that number: the harness's shared locator was selecting the wrong bubble, and five of those cells
were passing without measuring anything.

**Goal 1's delivery layer is repaired and guarded.** Scaffolds COMPILE across eight frameworks (616
front ends) and backend routes are type-checked against real host tsconfigs, so the emitted code no
longer teaches a bug. State the next part precisely, because the gap between the two is where this
repo keeps getting caught: the emitted code is **EXECUTED for the `html` target only** — all three
tests in the `emitted` project pass `framework: 'html'`. Seven frameworks are compiled and not run.
When the workspace-split bug landed, compilation caught **three** of the seven (React, Next and
TanStack, on `TS6133` for a now-unused import) and **missed four**: vue, svelte, angular and html
compiled clean and rendered nothing (§5.5). Trust the enumeration, not the summary — one PR body
rounds this to "four of seven", and the named list is the half that cannot be wrong (§5.13).

**Sub-project D is done** (§1.1). Both conformance known gaps are closed in the library.

**The emit contract is done** (§1.2) — schemas exported, custom card types registrable and
validated in the browser, the scaffolder emitting a loop that runs, the MCP serving the schemas.
The 2026-08-11 version of this document called it "START HERE"; that is no longer true and the
section is now a record rather than a task.

What is at the head of the queue is **`create-kai`** (§1.3), whose two catalog blockers were closed
by #185 — and **the attachment wire gap** (§1.7), which is the one open defect in this document that
a user can hit on the default path without doing anything unusual.

---

## 1. Recommended sequence

Do these in order. The reasoning for the ordering matters more than the list.

**A trap first, because it wastes a lookup every time.** The `#8`, `#27`, `#70`, `#94` style numbers
throughout §1 are this project's own backlog numbering. They are **not GitHub issue numbers**, and
they collide with real ones: `#94` in the repo is a merged release PR. GitHub's own tracker has four
open issues on a different sequence. PR numbers, when this document cites them, are always written
as "PR #151" or "in #165".

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
  of the text bubble, not inside it) and `file` (collapsed into one `<Attachments>` row).
  **It is guarded structurally, not merely fixed.** `verify:scaffold` parses the `MessagePart`
  union out of `src/elements/chat-types.ts` with the TypeScript compiler API and requires a
  `partAs(part(), '<variant>')` branch per variant across all 77 Solid cells. Watched failing three
  ways, one of them an emitted front end of `''`, because an empty `.tsx` compiles clean and tsc
  would have waved it through.

  **The divergence list has moved since 2026-08-11 and is worth re-reading rather than trusting.**
  The old "no `cardTypes` override prop" entry is CLOSED: the Solid target now emits the
  component-map half of `cardTypes` plus `schemas`, wired from the same `createCardRegistry` call
  as every other framework (§1.2). The bubble's own padding and radius are still hardcoded in the
  emit rather than inherited. And a NEW one arrived on 2026-08-12, filed in #176 and still open:
  **the emitted Solid front end reads `m().role` for alignment and passes it to `renderPart()`,
  then drops it on `<Message>`** — so every scaffolded Solid app ships unlabelled rows and does not
  inherit the a11y fix that reached `<kai-chat>`. Solid is the one target that renders `<Message>`
  directly, which is exactly why it does not inherit anything (§5.20).

Both former red cells are closed: S12 and S13 no longer carry a `knownGap` at all. **The full
five-configuration matrix has since been re-run live**, so all ten S12/S13 cells are live passes,
not replays. The hedge that used to sit here is retired, and it was retired by a measurement
rather than by a judgement that it read as fussy. Per-cell evidence is in the results doc.

### 1.2 The emit contract (tasks #8–#11) — DONE. Nothing to do here.

Shipped across four PRs, #151 → #154, on 2026-08-11/12. **A card schema IS the shape of a tool
definition**: hand a model our `confirm` schema as a tool and it emits a valid envelope by
construction, which our dispatcher renders. That is now reachable rather than argued. The evidence
it mattered was that our own conformance spike had to HAND-DERIVE the confirm schema, with a
comment saying it had to.

Recorded here because these are contracts a consumer can hit. The loop a developer can write today:

```ts
export const cards = createCardRegistry({
  use: ['confirm', 'choice'],
  custom: { 'pricing-table': { schema: pricingSchema, tag: 'my-pricing-table' } },
});

chat.cardTypes   = cards.tags;               // client: what DRAWS an arriving card
chat.cardSchemas = cards.validationSchemas;  // client: what a VALID one looks like
tools: cardTools(cards, { provider })        // server: what the model is OFFERED
```

- **#8 the schemas are exported**, on two surfaces. `@kitn.ai/ui/schemas` (JS, server-safe) is
  primary and exports `cardSchemas` (the 7 card-data schemas) plus `contractSchemas` (envelope,
  event, and the two result shapes); `@kitn.ai/ui/schemas/*.schema.json` is raw, for Python and Go
  backends and for `fetch`. **Eleven schemas, not ten** — the count this section used to carry was
  wrong. The JS entry is primary because raw JSON imports break differently on every framework
  target the scaffolder supports. `cardTools()` projects a schema into a provider tool definition;
  `cardFromToolCall()` maps the call back to a `CardEnvelope`, keyed on the provider's
  `tool_call_id`, which is already the key `upsertCardPart` uses. That is not an optimisation, it
  is why a model revising a card updates it in place instead of stacking a second copy.
  `isCardTool` tests the `kai_` prefix only, so a consumer-registered type round-trips without the
  kit knowing about it: generate narrowly, accept broadly, and let the renderer be the layer that
  says a type is unknown, because it is the only layer that can say it where a human sees it.
- **#9 custom registration** through `createCardRegistry`, and validation of the developer's own
  card types **in the browser**, not only on the server. `cardSchemas` is a narrow schema map
  rather than the registry object, deliberately: a `CardRegistry` prop would have been a third
  parallel concept beside `types` and `cardTypes` with undefined precedence when both were set.
  The overridden-built-in rule survives intact — their schema present, theirs applies and ours
  never does; no schema and an overridden renderer, no validation.
- **#10 the scaffolder emits a loop that RUNS and the MCP serves the schemas.** `verify:scaffold`
  states the guarantee in its own words: 160 of 616 scaffolds emit the full round trip, 456 emit
  none of it, and **all 64 that declare a tools array put card tools in it.** That last clause is
  the silent hole — a tools array offered to a model with no card in it — and it is asserted
  independently of the emit plan rather than derived from it. The 160 and the 64 did not move when
  the matrix grew to 616; only the "emit none of it" count did, which is the arithmetic you want,
  because the new surfaces are attachment surfaces rather than card ones.
- **#11 `openai` and `anthropic` catalog integrations exist** (11 integrations now, not 9), and
  `clientToolFormat` is declared per integration. It replaced a table keyed on `streamFormat`,
  which is a response-shape field being asked a request-shape question and broke the moment a
  native-protocol integration forwarded tools. Keying on integration id would have been wrong too:
  `anthropic`'s own route converts FROM the OpenAI envelope server-side, so sending Anthropic's
  native `{name, input_schema}` would have shipped every tool with a blank name.

**Three findings that outlive the tasks:**

- **Strict mode is unusable today, for all seven card types, on both providers.** The plan
  predicted two. `form`'s data is a free-form object so under mandatory `additionalProperties:
  false` it can only ever be `{}`; `embed` uses `if`/`then`; `artifact` uses `oneOf`; the other
  four fail on `minLength` / `maxLength` / `format: "uri"`. Four plan assumptions did not survive
  contact: Anthropic **supports** `allOf`, Anthropic does **not** support `pattern`, OpenAI forbids
  root `anyOf`, and the two providers' `format` lists differ with `uri` on Anthropic only. So
  non-strict is not merely the default, it is the only working mode, and `strict: true` throws
  naming every card, path and keyword. **That makes the client-side validation the enforcement
  mechanism rather than a safety net.**
- **Probing all seven cards with hard-invalid data found two live defects.** `embed` THREW
  (`TypeError: reading 'posterUrl'`) — a model emitting a malformed embed crashed the render.
  `artifact` rendered empty chrome with no signal at all. Both are caught before the component runs
  now.
- **What the validator does NOT catch is asserted as passing tests**, each with a written reason,
  so the gap cannot be quietly overstated: `additionalProperties`, `allOf`, `anyOf`, `oneOf` and
  `format` are unenforced. **`artifact`'s silent case is therefore still open**, because its
  src-or-files rule lives in `anyOf`.

Also settled empirically, do not re-litigate: **cards come from TOOLS, not structured output.**
The spike ran both. Structured output produces valid envelopes but suppresses tool calling, breaks
streaming, and costs more. Recorded in `examples/internal/openrouter-spike/FINDINGS.md`.

### 1.3 `create-kai` (tasks #12–#15) — START HERE

`packages/create-kai/`. Spec at `docs/superpowers/specs/2026-07-01-create-kai-scaffolder-design.md`
(v2: layout-first flow, feature multi-select, the clone rule, `kai.json`, staged v0/v1/v2). It
would have inherited every scaffolder defect fixed on 2026-08-10/11 and multiplied it across eight
frameworks, which is why it was right to do the repair first.

All four v0 prerequisites landed on 2026-08-12 and the CLI consumes them rather than reinventing
them: the `openai`/`anthropic` integrations, declared `deps`/`keyExposure`, the shared
`createMockResponder()`, and `renderSurface({ framework, components, integration })`. Templates are
`examples/starters/*` reused verbatim (23 files for React); gateways, features and env vars come
from `packages/ui/src/agent-tooling/`, bundled at build time. Two sources of truth, neither copied
— only the CLI's own axes (feature, framework and layout tables) are new.

**What shipped, in #165: the zero-config path, React only.** Enter through every prompt gives
React, full-screen, conversation history and the local mock, and it streams. In
`src/frameworks.ts`, one of eight entries is `status: 'ready'`; the other seven are `'planned'`.
The CLI's build, typecheck and 52 tests run in the required `test` job, and the build is not
optional because the tests read `dist/templates` and fail loudly rather than passing on an empty
template set.

**Two claims about the published pin, and they are NOT the same claim.** Keep them apart, because
collapsing them is how this document would overstate by exactly one step.

- **Verified: the pin resolves and compiles.** `packages/ui/package.json` is at 0.21.0 and
  `scripts/build.mjs` derives the pin as `^${kitVersion}`, so a scaffold now pins `^0.21.0`;
  `test/kit-contract.test.ts` passes 3/3; `npx create-kai my-app --yes` produced 23 files,
  `npm install` resolved `@kitn.ai/ui@0.21.0` **from the registry**, and `npm run build` exited 0.
  The same build against 0.20.1 produced nine type errors.
- **NOT verified: that it STREAMS from a registry install.** The streaming evidence came from the
  WORKSPACE build during #165, which is a different artifact.

The defect underneath that is worth one sentence because it will recur: **`^0.20.1` does not
satisfy 0.21.0.** Under semver's 0.x caret rule a minor bump is breaking, so the pin was wrong the
moment the kit released, not merely stale — which is why release-please #146 was a dependency for
this CLI rather than housekeeping.

**What is next, in order, from the session that owns this lane:**

1. **The remaining seven frameworks.** Tractable because `renderSurface` is components-keyed rather
   than archetype-keyed. One defect sits directly on the path: the scaffolder's Solid branch emits
   `} from '@kitn.ai/ui'` rather than `@kitn.ai/ui/solid` (#94, being fixed). `scaffold.ts` carries
   zero references to the `./solid` entry today, and the Solid STARTER has the same defect (§1.4,
   #69). One mistake, two emitters.
2. **The gateway slice — NO LONGER BLOCKED, and deliberately not done.** Read the change in status
   carefully, because "unblocked" and "deferred" are both true and they are different facts. #185
   added `Integration.outOfBand` (`'none' | 'local-server' | 'local-binary' | 'language-runtime'`),
   declared per integration with a `superRefine` that refuses an entry declaring nothing plus three
   route-source nets that refuse a false `'none'`; `listGatewayGroups()` in the kit registry now
   returns the spec's three headings from declared fields alone. `create-kai`'s own prompt stays
   FLAT anyway, and its comment says why: `WIRED_GATEWAYS` is `{ mock }` in this slice, so grouping
   a list where ten of eleven entries are unselectable would add headings to a menu with one live
   item. Switching to `listGatewayGroups()` is the companion to widening `WIRED_GATEWAYS`, not a
   task of its own. **One correction fell out of the derivation and is worth carrying:** the spec's
   third group listed LangGraph and was wrong — its emitted route compiles the graph in process and
   asks for a key and nothing else, so it files under "Bring a key".
3. **The feature multi-select — UNBLOCKED.** #185 registered an `attachments` preset (`kai-chat` +
   `kai-file-upload` + `kai-attachments`, matching the CLI spec's own feature table), so
   `listCapabilityGroups` sees a fifth capability, `renderSurface` has a branch, and `verify:scaffold`
   compiles it. `create-kai` reports the feature as `renderer` rather than `unavailable` **and
   nothing in the CLI was edited to make that true** — the derivation reported that the world
   changed, which is what that design was for. A different gap took its place and is narrower:
   `conversations` is `COMPOSED_ONLY`, because `renderSurface` has no `kai-conversations` branch.
4. **The coding-agent wiring step** (`.mcp.json` + `AGENTS.md`). Unblocked, not started.

**The headline has changed, and the old one is worth reading before the new one.** This section
used to say *v1 is gated on CATALOG COMPLETENESS, not on CLI code*, with two of four next steps
blocked on catalog gaps. **Both gaps closed in a single PR**, so that headline is retired: v1 is now
gated on CLI code — the seven remaining frameworks and the wiring step — plus widening
`WIRED_GATEWAYS`. The two blockers were reported rather than papered over, and that is precisely why
they were cheap to close.

**One open decision, awaiting Rob — do not record it as taken.** v1 shipping all eight frameworks
was a scope call made in his absence. The spec excluded Angular and Solid on the grounds that no
renderer existed, which is stale: both renderers do exist. Two sessions independently think
shipping all eight is right. He has not seen it.

### 1.4 Small items — batch them

Do NOT pay context-switch cost on these individually. Batch them when something else forces a build.

**Closed on 2026-08-12.** Recorded so nobody re-opens them:

- **The generated-artifact sync guard exists and gates.** `verify:generated` re-runs the generators
  outside NX, diffs every checked-in derived artifact, and **cannot pass vacuously**: each file is
  seeded with a single-use random sentinel first, so a generator that was deleted, renamed, dropped
  an output or no-op'd fails here instead of reading as in sync.
- **The conformance harness exercises the consumer `cardTypes` seam again**, and the fix is the
  interesting part. The shallow answer was a dedicated scenario. The real one: `get_weather`, the
  spike's most-used tool and part of the default interactive set, now returns a `weather` card the
  kit does not ship, drawn by the app's own `<spike-weather-card>`. Seven catalog scenarios offer
  that tool, so breaking the seam now breaks what the app ordinarily does, instead of breaking a
  special case that only exists to be broken.
- **Both timing flakes are gone by construction, not by tolerance.** `createTween` measured elapsed
  time as `rafTimestamp - performance.now()`, which share a time origin in a browser and do NOT
  under vitest with jsdom: the subtraction lands twice, `t` goes negative, and `linear` clamped only
  the top, so the tween ran backwards. Both files now drive off the deterministic fake clock and
  contain no wall-clock waits at all.

**Still open. I checked each of these against the tree on 2026-08-12 rather than carrying it
forward:**

- **#27** per-element `./elements/*` is still not server-importable, and `verify-ssr-imports.mjs`
  says so in its own header: those modules are DOM-only by design and the guard asserts they fail
  ONLY for that reason. "A separate, still-open limitation" is the guard's own wording, which is
  the right way to carry a known gap.
- **#54** the Angular starter README still says a bare `voice` attribute is read as false. It is
  read as **true**: `resolveFlag` in `define.tsx` returns `hasAttribute(attr) && getAttribute(attr)
  !== 'false'`. The README teaches the opposite of the code.
- **#58** three `redeclared-kit-type` sites remain — `CardEnvelope` in `guides/generative-ui.mdx`
  and `examples/remote-cards.mdx`, `MessagePart` in `integrations/connect-any-backend.mdx`.
- **#62** per-element EVENT attribution is still file-level: `gen-element-api.mjs` takes the "union
  of typed events and dispatch() literals seen in the file". `::part` attribution was fixed
  per-element in #152 and methods in #154; events were not, and a file declaring two tags
  (`resizable.tsx`) is where that shows.
- **#63** the docs harness still greps source. Nothing under `apps/docs/scripts/docs-alignment/`
  reads `declarativeChildren`.
- **#64** is now HALF closed, and re-deriving it is what found that. `segmented.tsx` no longer
  defaults `options` at all — it reads `merged.options` directly, so a caller omitting it fails
  where the mistake is. `file-tree.tsx` still carries `mergeProps({ files: [] })`. One site, not
  two.
- **#68** promote the Solid mid-stream repro into CI.
- **#69** the Solid STARTER still imports from the root entry — two sites in
  `examples/starters/solid/src/App.tsx` — while the guide says `./solid`. Same defect as the
  scaffolder's Solid branch (§1.3). **#183 did NOT close this and could not have**, which is the
  useful part: `verify:starters` now builds all eight starters in the required job, and this starter
  builds fine, because the root entry really does serve those symbols. A compile gate cannot see a
  specifier that works but contradicts the documentation.
- **`docs/web-components.md:5` still claims 27 elements.** `element-meta.json` has 80. Hand-written
  prose inside a generated file, which is precisely why `verify:generated` cannot see it: the
  regeneration reproduces the stale sentence byte-identically and the drift check passes (§5.2).
- **`audio-visualizer/index.test.tsx` flakes about 1 run in 34 and is NOT fixed.** Diagnosed as
  mock isolation rather than wait duration, and the diagnosis is the useful part: `waitFor`'s
  1000ms is its own budget, and on expiry it rethrows the last assertion error rather than anything
  mentioning time, so **a missed deadline is indistinguishable from a condition that was never
  satisfiable.** A probe now records which, so the next CI occurrence says so. A deferred-promise
  refactor was written and deliberately not shipped, because its benefit is contingent on a cause
  the evidence argues against.

### 1.5 #70 — INVESTIGATED, then SHIPPED. Do not re-open it.

Investigation: [`specs/2026-08-11-reasoning-details-investigation.md`](specs/2026-08-11-reasoning-details-investigation.md).
Shipped in #153: **`toOpenAIMessages(messages, { reasoning: 'include' })`**, in
`packages/ui/src/wire/encode.ts`. Default `'omit'` is byte-identical to the previous behaviour, so
no consumer's token bill moves silently.

The 2026-08-11 version of this section argued for demoting it below §1.6 as "a latent
quality-and-cost gap, not a defect". That call was overtaken within a day. Recorded rather than
edited away, because the section was right about the thing that mattered:

**Do not echo `part.raw`.** The naive version was written first specifically to prove it fails.
After a streamed turn only the final `reasoning_details` frame carries the signature and it has no
text, and `appendReasoningPart` resolves `raw` last-write-wins — so echoing it forwards a textless
fragment. The encoder reassembles from `part.text` + `part.signature`, sends encrypted blocks by
reference, and skips unsigned ones. Skipping is safe against the provider's sequence rules because
**verifiability turns out to be a property of the model CONFIGURATION rather than of individual
blocks**, which is not what you would guess from the rule's wording.

The filing's original premise was wrong and that is still worth knowing. `reasoning_details` was
never absent from `wire/` — the read path handled it deliberately and with tests. The drop was one
function on encode, and the comment justifying it ("OpenAI chat completions has no reasoning
channel on the way back in") was the real error, because OpenRouter has one.

The round trip is measured: OpenRouter accepts `reasoning_details` on the way back in (200), and
omitting it is accepted too (200). Zero 400s. The signature is the load-bearing field — stripping
it is a hard 400 from Anthropic upstream. Including reasoning costs roughly 25% more prompt tokens
per round.

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

**Still open, and it is now more valuable than when it was written:**

- **A scenario that asserts on thinking and a tool call surviving the same round trip.** The
  re-recorded `haiku-oai` column carries reasoning in all 13 scenario dirs, tool-loop scenarios
  included, so the configuration is exercised in passing. Nothing asserts on it. The scenario list
  still stops at S18 — nothing was added for this. It was previously "where the #70 fix would have
  to prove itself"; #70 has since SHIPPED (§1.5), so this is now the missing proof for code that is
  in the tree rather than a prerequisite for code that is not. Sketch in the investigation doc, §7.

### 1.7 ★ Attachments are a THREE-LAYER gap, and the layers must land together

Open as of `476a16b`. Every layer below was read off the tree rather than carried in from the
session that found it, and one claim did not survive that check — recorded at the bottom, because a
finding you could not reproduce is worth as much as the ones you could.

**Layer 1 — encoding.** `toOpenAIMessages` and `toAnthropicMessages` both drop `file` parts. Not an
oversight; both say so at the site. `wire/encode.ts` above `toOpenAIMessages`: *"`card`, `source`
and `file` parts are never encoded; they are kit-side. File attachments are a documented v1
limitation, which is why a user turn carrying only an attachment encodes to nothing and is
skipped."* The Anthropic encoder's `default:` branch repeats it. **So an attachment-only turn
encodes to nothing at all.**

The type is the harder half, and it is the reason this is not a one-line fix:
`OpenAIWireMessage.content` is declared `string | null`. Multimodal content is an ARRAY of parts on
both providers, so layer 1 cannot be fixed inside the encoder — it needs the public wire type
widened, which is a breaking change to an exported interface and ripples into every route that reads
`.content`.

**Layer 2 — route re-mapping.** Which is where that ripple lands. Of the 11 integrations, four
forward `messages` verbatim and would carry array content through untouched (`openai`, `openrouter`,
`ollama`, `cloudflare`), and `mock` emits no route at all. The remaining six touch `content` on the
way past — five of them assuming it is a string:

| integration | what it does | effect on array content |
| --- | --- | --- |
| `anthropic` | `pushUser([{ type: 'text', text: message.content }])` | array lands in a `text` field |
| `vercel-ai-sdk` | `content: message.content ?? ''` at four sites | flattened |
| `mastra` | `const content = m.content ?? ''` | flattened |
| `pi` | `messages.at(-1)?.content ?? ''` as a prompt string | flattened, and history dropped anyway |
| `pydantic-ai` | `prompt = messages[-1].content`, typed `content: str` | flattened (python) |
| `langgraph` | `{ ...m, content: m.content ?? '' }` | **passes through** — only `null` is coerced |

So five of eleven integrations — **55 of the 121 route cells** — would drop attachments at runtime
even with a fixed encoder. `langgraph` is the honest edge case: its route does not flatten, but its
own comment records that LangChain's `MessageContent` coercion accepts string only, so it is
untested rather than safe.

**Layer 3 — production. This is the load-bearing one:** *the kit cannot produce an attachment its
own encoder would accept.* `packages/ui/src/elements/default-input.tsx:77` — the built-in paperclip
that every `<kai-chat>` renders, unconditionally, because `ChatThread` always passes
`onAttachmentsChange` and no prop turns it off:

```ts
url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
```

An image gets a `blob:` URL, which is scoped to the tab that created it and unresolvable by anyone
else, so no provider can fetch it. **A document gets no `url` at all.** The scaffolder's emitted
`toAttachment` has the same defect with a different shape — `url: URL.createObjectURL(file)` for
*every* file, so documents get a blob URL rather than none. Neither is a form any model can consume.

**Why they have to land together.** Fixing the encoder alone is worse than shipping nothing:
today an attachment is silently dropped, and afterwards the DEFAULT path — the built-in paperclip,
no consumer code involved — hands the encoder a `blob:` URL or an undefined one and converts a
silent drop into a hard throw. The order that works is layer 3, then 1, then 2.

**`ATTACHMENT_WIRE_NOTE` is a DATED claim, not a standing fact.** #185 emits this into every
attachment scaffold:

```
// The staged files ride along on the message as `file` parts, so they RENDER
// in the thread. They are NOT sent to the model: toOpenAIMessages /
// toAnthropicMessages do not encode `file` parts (a stated v1 limit of
// @kitn.ai/ui/wire), so nothing here reaches the provider.
```

True at `476a16b`. **False the moment layer 1 lands**, and it is emitted into user code, so it will
outlive the limitation it describes and start teaching the opposite. It is on the fix's critical
path, not a follow-up. This document has already been burned by exactly this shape: §1.5 was still
steering readers away from #70 after #70 had shipped.

**What each test project can see, and the evidence for it.** The `emitted` project is the only one
that EXECUTES the scaffolder's output — it writes the emitted `main.ts` to a real module, imports it
(the module ends in `void init()`), and drives a mounted `<kai-chat>` out to a stubbed `fetch`. The
unit suite never runs that code: `scaffold.test.ts` asserts over the emitted STRINGS, so it can
check wording and never behaviour. That gap is not theoretical — I broke the attachment bridge
deliberately (made `URL.createObjectURL` throw) and watched the projects disagree:
`--project=unit` stayed green at 2,858/2,858 while `--project=emitted` went red with

```
a dropped file never reached <kai-attachments> — the dropzone is mounted but nothing stages
TypeError: createObjectURL is not a function
```

**One correction to the report that reached me.** It cited that failure as `expected +0 to be 2`,
from the fetch-round counter, "because fetch never fired". That assertion is real —
`expect(round).toBe(2)` in `emitted-maximal-surface.live.test.ts` — but it is **not** the one that
fires for a broken attachment bridge: the staging assertion sits ~20 lines earlier and catches it
first. The structural claim (only the emitted project sees this layer) held; the fingerprint did
not. Cite the staging message.

---

## 2. Shipped to npm

`latest` points at **0.21.0**, published 2026-08-12.

| version | contains |
| --- | --- |
| **0.20.0** | audio-visualizer epic + the `sideEffects` blank-page fix |
| **0.20.1** | root entry server-importable |
| **0.21.0** | `parts[]` + `@kitn.ai/ui/wire` + `@kitn.ai/ui/schemas` + `@kitn.ai/ui/solid`, the emit contract, the element interaction methods, the scaffolder rebuild |

0.21.0 is also what unblocked `create-kai` (§1.3): everything the CLI scaffolds against is public
for the first time in this version.

The 0.20.x fixes were for bugs **live in production and not caused by the parts work**. Both were
found by building and running real consumer apps, not by reading code. Their mechanics are below,
stated once, next to the deprecations they produced.

### Ten of the twelve published versions are deprecated

Done, not outstanding. The previous version of this document had "deprecate 0.19.0" as an open item
blocked on Rob's npm credentials; the sweep went further than that one version. Read off the
registry, 2026-08-12:

| versions | class | message points at |
| --- | --- | --- |
| 0.14.1, 0.15.0, 0.15.1 | **raw TypeScript as the package entry** — `exports "."` pointed at `./src/index.ts`, so Node cannot import it and bundlers must transpile `node_modules` | fixed in 0.16.0 |
| 0.16.0 → 0.19.0 (6 versions) | **registration chunk tree-shaken** — blank page, no `kai-*` elements register, silent console | fixed in 0.20.0 |
| 0.20.0 | **root entry throws under Node** — `Client-only API called on the server side`, so SSR and any server-side import fail | fixed in 0.20.1 |

**0.20.1 and 0.21.0 are the only clean versions.** Every message names its defect, its fix version,
and directs the reader to 0.21.0. Re-read off the registry per version at `476a16b`: 12 published,
10 carrying a deprecation message, and the middle row is **six** versions (0.16.0, 0.17.0, 0.18.0,
0.18.1, 0.18.2, 0.19.0) — it read "5" until this pass. The row total was right and the row itself
was wrong, which is the arithmetic that survives review longest.

Three defect classes, and they are worth reading as three rather than as ten deprecations, because
each is a different lesson about what the package promises:

- **`sideEffects`** omitted `dist/register-impl-*.js`, so Vite 8 / Rolldown tree-shook every
  `customElements.define` call. **The trigger is Vite 8 specifically** — Vite 6 and 7 keep the
  chunk. The kit did not regress; the ecosystem moved. That is why the June consumer-hardening
  campaign passed and this failed, and it is why the guard that catches it (`verify:consumer`) has
  to bundle with a real consumer bundler rather than reason about our own.
- **Root entry SSR.** `dist/index.js` is compiled with Solid's DOM transform but leaves `solid-js`
  external, so under Node `solid-js/web` resolves to the SERVER build where `template` is a stub.
  **Bundling Solid does NOT fix it** — measured; that build fails with `window is not defined` from
  24 module-scope `delegateEvents` calls. The transform is the problem, not the resolution. The fix
  is a `node`-condition SSR twin whose condition order mirrors `solid-js/web`'s own exports map.
- **Raw TypeScript entries** predate this epic and are here for completeness. They are the reason
  the package ships compiled entry points and why raw-source exports must not be reintroduced.

---

## 3. The CI gate

The heading used to read "The nine CI guards", and that count went stale twice in a day. It is
gone deliberately: a number in a heading is a second copy of something the table below already
says, and §5.11 is about exactly that. **Recount it, do not adjust it.** The command is

```
sed -n '/^  test:/,/^  storybook:/p' .github/workflows/test.yml | grep -c '^      - name:'
```

which returns **30** today, of which 4 are setup (install, build, the npm cache for the standalone
starters, install-playwright) and **26 gate a merge**. Three unnamed `uses:` steps do checkout and
toolchain setup. It returned 28/3/25 one day earlier; #183 added both a guard and a cache step,
which is why the setup count is not a constant either.

**Every guard here was watched failing before being trusted.** If you add a 27th, do the same or do
not bother.

| # | step | catches | notes |
| --- | --- | --- | --- |
| 1 | model-spend audit | any workflow line that could reach a live model | deny-by-default over every workflow file; 6 rules, each self-tested against a known-bad and a known-good sample BEFORE the scan proceeds |
| 2 | TanStack traversal suite | path traversal in the starter's static server | 43 tests, runs before `pnpm install` (~2s) |
| 3 | traversal suite non-empty | "the suite is missing" reading as "all 43 passed" | `node --test` exits 0 when it matches no files; this asserts a non-zero TAP count |
| 4 | `verify:generated` | a derived artifact out of sync with its source | sentinel-seeded, so a generator that no-ops cannot read as in sync; never goes through NX |
| 5 | `nx typecheck ui` | types | `verify:quarantine` FIRST, then 5 tsc passes (6 stages) |
| 6 | `verify:consumer` | registrations survive a real Vite 8 / Rolldown consumer bundle | 79/79 tags, installed into a throwaway app outside the repo |
| 7 | `verify:pack` | dead weight shipping to consumers | every packed file outside `dist/` over 64 KiB must be allowlisted with a written reason; 831 files / 11.44 MiB against a 12.5 MiB ceiling, 6 allowlisted |
| 8 | `verify:dts` | an emitted `.d.ts` specifier that does not resolve | delegated to tsc's own resolver, both resolution modes |
| 9 | `verify:dts:consumer` | shipped `.d.ts` type-check under bundler AND nodenext, both directions | needs network |
| 10 | `verify:ssr` | every entry imports AND every component RENDERS under `node` | two guards chained: 9 entries, then 127 components on `.` and 166 on `./solid` through `renderToString` in a DOM-free child process |
| 11 | `verify:schemas` | both schema surfaces reachable from outside the repo | 11 schemas, resolved from a temp package under bundler + nodenext + Node, compared by BYTES; the expected set is a `readdirSync`, never a literal count |
| 12 | `verify:tool-schemas` | a projected tool definition a provider would reject | two independently written keyword tables, asserted to DIFFER; `minItems` checked by VALUE, not presence |
| 13 | `verify:card-validation` | a schema keyword that validates nothing | every keyword must land in ENFORCED / STRIPPED / NOT_ENFORCED; ENFORCED is read out of the validator's BODY, not its interface |
| 14 | `verify:solid-coverage` | an element with no writable Solid equivalent | 80-element catalog against `@kitn.ai/ui/solid` — **not the root entry any more**, since the full Solid surface moved off `.`; also every public component ships a `<Name>Props` |
| 15 | `verify:scaffold` | emitted code that does not compile on its real host | 616 front ends (7 surface probes × 11 integrations × 8 TS frameworks, **both catalog axes derived from the registry**) + 99 of 121 backend routes under 3 host tsconfigs (11 python, 11 `mock` with no route by design); 77 html / 77 angular / 77 solid structural, the solid ones per `MessagePart` variant; plus 56 preset renders proved byte-identical to `renderSurface` |
| 16 | `verify:starters` | a starter that stops compiling, shipping into every scaffolded project | **NEW in #183.** Builds all 8 starters with the command a user runs, typechecks the one whose build cannot (tanstack-start). Roster DERIVED from the directory + each app's own kit dependency; an unclassifiable starter is a hard failure, not a skip |
| 17 | `verify:docs` | a doc snippet that does not compile against the shipped API | BLOCKING, gates on `high` only; anti-theatre self-test runs first |
| 18 | unit | 2,858 tests / 239 files | jsdom, `--project=unit` |
| 19 | emitted | the scaffolder's output actually RUNS | 3 files, **`html` target only** — card path, maximal surface, mock path. EXECUTES the emitted `main.ts` against a mounted surface. A separate PROJECT, deliberately not a separate JOB |
| 20–21 | spike typecheck + tests | the conformance harness's own suite, incl. the `cardTypes` seam guard | 93 tests / 8 files, node-only, no key, no browser, ~1s |
| 22–24 | create-kai build + typecheck + tests | the CLI, incl. the published-kit contract gate | 52 tests; the build is required first or the tests read an empty template set |
| 25 | React adapter tests | the generated React wrappers | |
| 26 | cross-origin e2e | the host/provider postMessage handshake across two real origins | what jsdom and same-origin storybook cannot see |

**Advisory, NOT gating.** Verified against the ruleset API rather than from the workflow files:
ruleset `18328421` requires only the `test` context. So the storybook browser shards, the
conformance replay (`spike-conformance.yml`, 38s) and the negative control
(`spike-conformance-control.yml`, 6.4 min, path-filtered) are advisory **by construction** — no
ruleset change was needed to keep them that way. This repo already made a browser suite required,
watched it flake, and reverted it.

**Both halves of a two-direction guard are required.** "Wrong code errors" alone is satisfied by
types that error at everything; "right code compiles" alone is satisfied by types that are entirely
`any` — which was the actual bug in the `.d.ts` case.

**Three of these guards exist because a guard passed while covering nothing** (§5.1, §5.18), and
the pattern is worth naming: #3 exists because #2's runner exits 0 on zero matches, #4's sentinel
exists because a deleted generator reads as in sync, and #11's `readdirSync` exists because a
literal count covers the schemas you thought of. Each one is a guard over a guard.

**The strongest argument for #19 being its own project is that it sees a layer nothing else does.**
Guards #15 and #18 are both blind to it, in opposite directions: `verify:scaffold` COMPILES the
emitted code and a scaffold can compile perfectly while rendering nothing, and the unit suite's
`scaffold.test.ts` asserts over the emitted STRINGS, so it can check wording and never behaviour.
Only #19 executes the emitted `main.ts` — imports it, so `void init()` runs — against a mounted
`<kai-chat>` and out to a stubbed `fetch`. Measured rather than asserted: breaking the emitted
attachment bridge on purpose left `--project=unit` green at 2,858/2,858 and turned `--project=emitted`
red on *"a dropped file never reached `<kai-attachments>` — the dropzone is mounted but nothing
stages"*. That is the whole case for the project, and it is why a green `--project=unit` locally is
not the merge gate. §1.7 has the full account.

---

## 4. The conformance harness

`examples/internal/openrouter-spike/`. Read `HARNESS.md` first.

19 scenarios (S01 → S18, with S06b), each a module owning its prompt, tools and a **rendered-DOM**
assertion. A Playwright runner drives the real app; the proxy records every live stream to a
fixture and replays it with no key and no network. Results:
`docs/superpowers/specs/2026-08-11-cross-model-conformance-results.md`.

**95 cells: 93 pass, 2 model-behaviour differences, zero known gaps, zero UI failures, $0.107.**
Every cell has a live measurement, S12 and S13 included. Both non-passes are `ministral-3b` (S02
reasoning, S04 multi-round tool loop), printed as `n/a` in the results table, and both are the
model doing something else rather than a defect: ministral has no reasoning mode, and it settled
the three-round loop in two. They are real, so do not round them off to "everything passes". The
per-cell table lives in the results doc rather than here, so it only has to be right in one place
(§5.11).

**That paragraph is the state as published on 2026-08-11, and the very next section qualifies it.**
"Every cell has a live measurement" is true of the REQUEST; it is not true of what every assertion
then measured. Read on before quoting it.

### ★ Read this before you cite the table: the shared locator was reading the wrong bubble

Fixed 2026-08-12 in #164 and #171. It is the most important thing in this section, because it
changes what several published cells mean.

`answer()` was `bubbles().last()`. **Until the assistant emits its first delta, the last bubble is
the echoed USER PROMPT.** Three consequences, each a different shape of the same defect:

- **S17 passed vacuously for its entire existence.** `during()` located the answer with
  `bubbles().last()`, so at the ~50ms click the check read the prompt's 89 characters, cleared its
  own 40-character floor with them, and compared the prompt to itself. The assistant's first text
  delta arrived at 176ms. Its tolerance was also smaller than a single frame, so it would have
  failed the instant it measured the real thing — **the two defects hid each other.** The behaviour
  was correct all along (round 1 totals 623 characters; the cancelled stream stopped at 355 and
  held), so this is a correct conclusion with zero evidence under it.
- **S16's check was INVERTED, not merely latent.** It asserts that a mid-stream error must not
  empty the assistant bubble, written as `.last()` then fail-if-empty. Wiping the message REMOVES
  the assistant's row, so `.last()` fell back to the user's echo and reported success. **It passed
  hardest in exactly the case it was written to catch.** It reached no `answer()` audit because the
  locator was inlined.
- **S04's entire final-answer assertion was satisfiable by the user's own prompt**, which names the
  three cities it searches for. S01 survived on luck alone: a 42-character prompt against a
  60-character bound.

Fixed by construction rather than by a safer bound: `assistantBubble` selects by SPEAKER,
`seesProse` became `seesAssistantProse`, `lastBubble` keeps position under an honest name, and a
runtime cross-check fails loudly if the speaker signals stop discriminating. A permanent guard in
`harness/scenarios.spec.ts` fails on *"must refuse to answer with the user's own prompt"*, watched
red twice with the locator reverted.

**What this means for the published table: all five S17 cells are vacuous, and they are five runs
of the same two canned fixtures.** The results doc carries its own footnote on this and is owned
elsewhere; do not read five columns of `pass` on that row as five measurements. Nothing in
`packages/ui/src/` was at fault or changed.

**S17 has since been rewritten again, in #184, and the second repair is the more interesting one.**
Keep the two facts apart: the PUBLISHED cells stay vacuous, because they were recorded under the old
scenario, while the scenario now in the tree asserts something neither version could. Fixing the
locator left S17 measuring only what the SCREEN shows, and the screen cannot see the thing the
scenario is named after — `AssistantStream.abort` makes the fold ignore later deltas, so a build
that settles the message WITHOUT aborting the fetch renders identically: text stops, the closing
sentence never appears, the socket stays open and the bytes keep arriving. Confirmed by disabling
each half of `stop()` in turn; only disabling BOTH used to turn it red, so the half that matters
most was untested. S17 now carries three claims — growth ceases, the closing sentence never renders
(a claim no measurement window can fake, unlike a character budget), and **the fetch was aborted,
observed SERVER-side** via the proxy's `/api/replay-report`. The post-click character budget was
tried and deliberately removed: at 190 characters it failed 1 run in 5 under a 6x-throttled
renderer, because what such a bound measures is how long the CLICK took to dispatch, not how long
the stream kept flowing.

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
  trust a red control cell as evidence that the green one means anything. **Concretely: it cannot
  be cited as covering the `cardTypes` seam.** It proves S03/S05 go red against an unsatisfiable
  stream, but it stops at each scenario's FIRST failing assertion — the tool panel — and never
  reaches the seam assertion. The advisory job is named `scenario-assertion-control` rather than
  `assertions` precisely so a green run cannot be read as seam coverage. The seam-specific red rests
  on six deliberate breakages instead.
- **The consumer `cardTypes` seam is back on the app's NORMAL path**, not in a dedicated scenario.
  `get_weather` returns a `weather` card the kit does not ship, drawn by the app's own
  `<spike-weather-card>`; seven catalog scenarios offer that tool. Two things made it cheap and are
  worth knowing before you touch fixtures: `card` parts are never encoded onto the wire, so every
  recorded fixture stayed valid, and the tool's `output` is unchanged, so the model sees exactly
  what it saw before. Of its six watched reds, the sharpest was pinning the envelope id so the
  second card upserts over the first: **only the COUNT went red.** S03 stayed green, and a presence
  check on S05 would have too.
- **A live model call from CI is structurally impossible, not merely undocumented.**
  `.github/scripts/spike-ci-guard.mjs` refuses any `SPIKE_MODE` other than `replay`, refuses to
  start if `.env.local` exists on CI, and scrubs `OPENROUTER_API_KEY` from the child. Its audit half
  is **deny-by-default**: any workflow line reaching the harness without going through `exec` is a
  finding, so a route nobody predicted fails BECAUSE it is unrecognised. It caught three evasion
  routes including `conformance:sweep`, a script that does not exist yet. It also refuses live
  LOCALLY, for a stated reason: silently handing back replay results to someone who asked for live
  is a false measurement, not a saving.
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

**The `budget_tokens` rule above is model-scoped, and the scope is narrow.** It holds for the model
we actually drove — Haiku 4.5 — and for Sonnet 4.5 and older. On Fable 5, Opus 5, Opus 4.8, Opus 4.7
and Sonnet 5 the parameter is **removed and returns a 400**; on Opus 4.6 / Sonnet 4.6 it is
deprecated but still functional. The replacement is `thinking: { type: 'adaptive' }` plus
`output_config.effort`. Do not generalize the 1024 floor to a current model — verified against the
`claude-api` reference 2026-08-12.

**The silent-200 trap survives in a new form, and it is worth naming because it is the same trap.**
On all six current models `thinking.display` now defaults to `'omitted'`, which streams thinking
blocks whose text is empty. That reads exactly like "this model has no reasoning mode" — the precise
misdiagnosis that cost the earlier sweep, wearing a different mask. Set
`display: 'summarized'` explicitly before concluding anything about a model's reasoning.

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

Every mechanism added in this session is one shape of a single defence: **make the absence of a
measurement impossible to mistake for a measurement.**

It is a concrete rule and not an abstract one because of where it started. A table cell read
`n/a`, and everyone, including the people who wrote it, read that as a fact about a provider. It
was our own request, carrying a thinking budget under the provider's floor, answered with HTTP 200
and silence (§1.6). Nothing errored. The silence was published as a provider limitation.

Each mechanism reduces to that rule:

- **The truthful matrix exit code.** A run that collected zero cells must not exit 0. An empty
  result set and a clean one have the same failure count.
- **The `modelBehaviour` declaration.** An exemption must state what the model does INSTEAD, and
  must fail when the difference disappears, so a permanent hole cannot pass for a measured result.
- **The reasoning-coverage guard.** A column declared reasoning-capable that recorded none is a
  finding, not a silence. Its verdict ordering checks truncation before silence, because a
  truncated stream has no usage frame and therefore reads as zero reasoning.
- **The stall diagnostic.** Report observed state, refuse to name a cause. Being confidently
  specific about the wrong thing costs more than being vague.
- **The generated-artifact guard.** A generator that exits 0 having written nothing must not read
  as in sync.

One shape none of them catch, named here so nobody reads the rule as fully mechanised: **coverage
that exists only because something was missing is coverage on a timer.** The workaround did not
fail. It succeeded, was correctly deleted, and nothing went red. That is worse than a broken test,
because there is no moment at which anyone could have caught it.

What follows is where that was learned, one failure at a time.

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
- My own CI poller, treating an empty API response as "done".
- The same poller, treating an unenumerated status word as "done".
- **The same poller again, and the worst-timed instance in the epic.** I watched required checks
  with `gh pr checks --watch | tail -20; echo "EXIT=$?"`. `$?` there is **`tail`'s** exit status,
  not `gh`'s, so it printed success no matter what CI did. Caught only by going to query the check
  conclusions directly instead of trusting the number, while merging the PR whose headline is four
  guards against checks that prove nothing. The general form: **a pipeline's exit status describes
  its last command.** Capture to a file, or read `PIPESTATUS`, when the exit code is the thing you
  care about.
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
in `CLAUDE.md`, generalised from that single observation inside an hour. **That is §5.13 in its
mechanism-versus-advice form.** The advice survives both observations, so it was safe to state; the
mechanism was contingent on one run, and the mechanism is the half that had to be corrected.

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

**There is a prose-only class of this, and this document keeps producing it.** A count, a
superlative and a branch name are all facts about the state of things, embedded in prose that
describes the state of things. Each is a second copy of something the document already expresses,
and each goes stale on a change that had no reason to touch it: a count when a sibling is added,
"the freshest instance of" when anything is appended below it, a branch name when the branch merges
and is deleted. A volatile identifier quoted from memory rather than read from the source is the
same defect arriving already broken. The fix is the same in every case: **name the thing; do not
count it, rank it against a set that is still growing, or pin it to a location that moves.** The
section documenting this keeps committing it, which is the evidence that it is hard rather than
careless.

### 5.12 Absence read as a legitimate value

**§5.11, this one, and everything below it are the lessons from this session that leave this
repo.** The rest above are instances: worth recognising when they recur, but tied to this codebase.
This is a boundary rather than a count or a list because both have already gone stale here: the
count when §5.14 was added, the list that replaced it when §5.15 was. That is §5.11 happening twice
inside the paragraph that points at it. Keep portable lessons at the end of the section and the
boundary stays true on its own.

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

### 5.14 "Done" and "landed" are different facts

I reported the reasoning-coverage guard as DONE and believed it. A peer session had it in its head
as shipped too. It was written, tested, committed, and **not in the tree**: it sat on a worktree
branch cut before the matrix sweep. Nothing in either session's account distinguished "written and
committed on a branch" from "landed on the working branch".

That is what makes it worse than the lessons above it. Two independent parties held the same belief,
and neither had anything in hand that could have contradicted it.

It surfaced only by enumerating every `worktree-agent-*` branch and diffing commit SUBJECTS against
HEAD's log, and that turned up **four** unlanded workstreams, not one. The mechanical trap worth
recording: **a cherry-pick does not mark its source.** A branch whose work is already in HEAD, picked
rather than merged, still reports commits ahead, so `git branch --merged` omits it and a raw
ahead-count counts it. Both call a landed branch unlanded, which is why the count is not the signal
and the subjects have to be compared.

§5.4 says commit early, because committed work survives someone else's checkout. This is its other
half: committed is not landed. `git log -1` in the tree you are standing in shows your commit and
says nothing about whether the branch that ships has it.

Operational form: **never trust your own record of what you landed. Enumerate the branches and diff
subjects against HEAD.**

### 5.15 Verifying a mechanism is not verifying its constraints, and neither is verifying that it compiles

Three layers, each silent about the ones above it. From building the `modelBehaviour` declaration
for the conformance matrix:

1. **What it DOES when used correctly.** Watched four ways: declared-and-still-differs goes green;
   declared-but-now-passes goes red; declared-but-fails-with-a-different-error goes red;
   declaration-removed goes red.
2. **What it REFUSES when used wrongly.** Checked only because the actual requirement
   ("unwritable as a bare note") lives at this layer and not at the first. Shortening the `instead`
   field to a useless value, and watching the catalog test reject it.
3. **Whether it is WELL-FORMED at all.** `tsc -b` then caught a `string | null` vs
   `string | undefined` mismatch. **All five runtime checks had passed against code that does not
   compile**, because Playwright transpiles specs without typechecking them.

The third is both the easiest to skip, because five greens already felt like enough, and the most
embarrassing, because a tool will simply tell you.

Operational form: **a constraint system has a layer for what it does, a layer for what it refuses,
and a layer for whether it is well-formed. Greens at one layer say nothing about the others.**

The same work gained a property for free by watching a bad declaration in isolation: one malformed
declaration does not disable the others, so the mechanism **fails closed**. An exemption mechanism
that failed open would go silently green the day someone mistyped a signature.

### 5.16 Writing "measured" next to a claim should force the measurement

An agent asserted from reasoning that `resolveJsonModule` is required for TypeScript to RESOLVE a
JSON import, reporting TS2307 in both resolution modes without it. I recorded that as settled and
relayed it onward.

It is wrong. TypeScript 5.x defaults the flag to true under both `bundler` and `nodenext`; the code
is TS2732, not TS2307; and the ORIGINAL claim it was "correcting" was right.

Two details make it a lesson rather than a mistake:

- It was caught only when the claim was about to be written into a guard header **labelled as
  measured**. Having to write the word forced the measurement.
- The first measurement attempt was broken in the same shape. It OMITTED the flag rather than
  setting it to `false`, got "compiles clean" both ways, and nearly confirmed the error.

Both operational forms are worth keeping. **Writing "measured" beside a claim is a commitment that
should trigger the measurement, not a description of your confidence.** And **when testing whether
a flag matters, omitting it and disabling it are different experiments, only one of which tests the
flag.**

The supervisory half, recorded honestly: I amplified the finding to Rob within minutes of receiving
it, and it was the third relayed claim that day that did not survive verification. **Speed of relay
is not free.**

### 5.17 A check that reports the boring branch has been misread, not verified

Building a diagnostic that reports observed state on a timeout, a build race was staged to exercise
its "dist changed during this run" branch. The diagnostic reported `unchanged`, because the touch
beat the spec's module load. The report was correct. It was correct about the wrong branch.

The window was widened and the race re-run, rather than accepting it.

This is neither of the failure modes §5.1 and §5.6 name. The check did fire, and the report was not
wrong. What went wrong is that **the branch the condition was staged to exercise never ran, and the
output looks like success either way.**

Operational form: **name the branch you expect BEFORE running, then check the output took that
branch, not merely that the output is sane.** The tell exists only for the person who knew which
branch they were aiming at, which is why review cannot catch it.

The same diagnostic carries a test asserting it NEVER names a cause, only observed state.
**Asserting a design constraint in a test beats trusting review to preserve it**, because the
constraint most likely to decay is the one a well-meaning contributor would violate helpfully.
Adding a cause to a diagnostic is exactly that shape.

### 5.18 ★ The population is narrower than its label

This is the session's second unifying frame, and it is the one to read if you only read one.

§5.1 names *absence read as a legitimate value* — a missing measurement wearing a value's clothes.
This one is its complement, and it is harder to see because **nothing about it is wrong.** The
measurement really ran. The assertions really passed. The count is really correct. What is false is
the label: **the enumerated set is smaller than the name implies**, so a real measurement over a
real population certifies a population nobody intended.

Five instances, all found in a single day, none of which review had flagged:

| Named | Actually enumerated |
|---|---|
| `verify:scaffold` iterates "every integration" | a hand-written `INTEGRATIONS` array — a new integration is simply absent |
| the element API artifacts expose "every method" | only `PropertyAssignment` AST nodes; every shorthand `expose({ maximize })` member was invisible (128 reported, 131 real) |
| "6 archetypes × 9 integrations × 8 frameworks" | 6 archetypes resolving to **5 distinct component lists** — `drop-in-chat` and `support-widget` are both exactly `[kai-chat]`, so a sixth of that matrix duplicated another sixth |
| the fifth tsc pass covers "the package" | minus a quarantine list nothing re-checked for shrinkage |
| S17's `bubbles().last()` reads "the assistant's reply" | the **echoed user prompt**, for the first 176ms — the click landed at ~50ms |

The last one is the sharpest, because it published. The scenario compared the prompt to itself,
cleared its own 40-char floor with the prompt's 89 characters, and reported PASS in **five model
columns**. One of three published claims was never measured anywhere. (The behaviour was correct
all along — 623 chars total, stopped at 355, held. Correct conclusion, zero evidence.)

**Operational test — the only one that works: add a member and confirm the counts move.** Reading
the code cannot distinguish "iterates the registry" from "iterates a list that happens to match the
registry today", because on the day you read it, they are the same list. Every derivation in that
table matched reality when written. The defect is that it was a *copy* of reality, with no mechanism
to stay one.

Corollary for anything self-describing: **derive the population from the thing itself, or assert the
count against it.** `verify:scaffold` now reads the registry; the union-order check derives its
variant list from the union in `chat-types.ts` rather than restating it. A restated list is a second
source of truth that only decays.

### 5.19 A validator validates what is PRESENT

axe reported clean on four components that had a semantic state and no ARIA at all. That is not an
axe failure — a rule engine matches nodes and checks their attributes, so **it cannot see a role
that was never written.** Zero violations over an empty selector is the §5.1 shape wearing a
tool's authority.

Anything you would describe as "the linter would have caught it" deserves the question: *would it
have had a node to match?* Absence has no node.

### 5.20 Verifying a fix in isolation is not verifying it reaches a user

`Message` was given a correct `role`-driven ARIA mapping, unit-tested, merged. It reached nobody:
`Thread` and `ChatThread` render `<Message class={…}>` and never pass `role` at all, while reading
`m().role` two lines away for styling. The component test was green and the composed product was
unchanged.

**Test the seam a user actually renders, not the unit you edited.** For this kit that means the
element or the composed component — the layer a consumer imports — because every prop-forwarding gap
lives *between* units and is invisible to both sides' tests.

---

## 6. Repo gotchas

- **The `component-meta.json` gotcha is GONE — the file was deleted in #152, so do not go looking
  for it.** It shipped ~300 KB to every consumer and was write-only: the generator discarded the
  return value, nothing read the file, and the Storybook addon it was designed for was never built.
  Proven before deletion by making the generator emit 78 bytes instead of 306,574 and running the
  entire gate set. What survives is the half that was never about that file: **everything
  regenerating after a build is real** and should be committed, since the branch is meant to be a
  zero-drift build fixpoint. And do not read NOTHING regenerating as proof of a clean tree — that
  is also what a cache hit looks like (§5.8).
- **A fresh clone or worktree needs THREE things before the unit suite means anything**, and
  skipping any one fails in a way that reads like a broken checkout. This is the single most
  expensive repeated mistake in this repo; `CLAUDE.md` carries the long version.
  1. **`pnpm install`.** Worktrees live under `.claude/worktrees/` INSIDE the parent checkout, so
     Node resolution walks up into the parent's `node_modules` while Vite only serves paths under
     the worktree root. Effectively the whole suite dies on one identical error about
     `@testing-library/jest-dom`. The file really is there; Vite is refusing to serve it from
     outside the root. `build:css` does not cover this and **prints success anyway**, because
     `npm run` puts the ancestor `.bin` on PATH.
  2. **`pnpm --filter @kitn.ai/ui run build:css`.** `src/elements/compiled.css` is generated and
     gitignored; without it 42 files die on `Failed to resolve import "./compiled.css?inline"` and
     two more fail downstream assertions that need real styling.
  3. **A real build**, for `dist/custom-elements.json`. The MCP manifest tests now throw naming the
     exact path they wanted. That failure is NEW and it is the honest version of an older green:
     resolution used to walk up ten parent directories, so from a worktree it escaped into the
     parent checkout and those tests PASSED, 16 of 17, against a six-week-old artifact from a tree
     nobody was working in. **Never "fix" it by restoring the walk-up.**
- **`--project=unit` is not the whole jsdom story.** The run-the-emitted-code guards live in their
  own `emitted` project and both run as separate steps in the required job, so a green
  `--project=unit` locally is not the merge gate.
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

Added since 2026-08-11:

- Emit contract plan (§1.2), incl. the provider strict-mode research: `docs/superpowers/plans/2026-08-11-emit-contract.md`
- `reasoning_details` investigation (§1.5): `docs/superpowers/specs/2026-08-11-reasoning-details-investigation.md`
- Soft-tier validation corpus, incl. what it does NOT cover: `docs/superpowers/specs/2026-08-12-soft-tier-corpus.md`
- The CLI itself: `packages/create-kai/README.md`
- **Timing figures and how they were contaminated:** `packages/ui/emitted-code-tests.ts` and
  `packages/ui/test-timeout-budgets.ts`. Read these before quoting any duration from this period.

Added at `476a16b` (#182–#185), and each of these is the SOURCE for a count this document quotes
rather than a restatement of it — read the script, not the sentence:

- The scaffolder gate's own scope comment, incl. why the archetype axis became a surface axis and
  why writing an expected cell count here would restore the coupling it exists to break:
  `packages/ui/scripts/verify-scaffold-compiles.mjs` (header)
- The starter gate, incl. what a compile floor cannot prove: `packages/ui/scripts/verify-starters.mjs`
- The derived capability/surface axes: `packages/ui/src/agent-tooling/archetypes.ts`
  (`listCapabilityGroups`, `listSurfaceProbes`)
- The derived gateway grouping and where it diverges from the CLI spec on purpose:
  `packages/ui/src/agent-tooling/registry.ts` (`listGatewayGroups`)
- The attachment wire limitation as emitted to consumers (§1.7):
  `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` (`ATTACHMENT_WIRE_NOTE`)
- S17's server-observed abort (§4): `examples/internal/openrouter-spike/src/scenarios/replay-report.ts`
  and `HARNESS.md`
  Every timing measurement taken between Aug 11 22:10 and Aug 12 10:05 local came off a box with
  four of ten cores pinned by orphaned CPU burners, so no "idle" baseline from that window is idle.
  The `--maxWorkers=4` recommendation derived in it is **WITHDRAWN, not annotated**, because unlike
  the timeout budgets its error does not run in the safe direction.
