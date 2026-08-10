# Roadmap: live conformance → emit contract → `create-kai`

Written 2026-08-10. Supersedes the "Do FIRST on resume" section of
[`HANDOFF-model-driven-components.md`](../HANDOFF-model-driven-components.md), which stays
the reference for what already shipped and why.

## The two goals, in Rob's framing

1. **Help devs create projects.** The `kai` MCP scaffolder (ships) and `npx create-kai` (spec
   only, zero code).
2. **Prove a real model drives our UI.** Tools, responses, cards, reasoning — end to end,
   against OpenRouter, with our own components rendering it.

Everything built since 2026-08-07 exists because goal 2 was unreachable: the kit modelled tool
and reasoning parts correctly but nothing turned a provider's SSE into them, and
`ChatMessage.content` being a flat string made ordered text/tool interleaving literally
unrepresentable. That is what sub-projects A (parts) and C (the wire adapter) fixed.

## Sequencing principle

**One major epic at a time, and that epic is `create-kai`.** The two items ahead of it are
deliberately bounded: the conformance sweep is validation of work already done, and the emit
contract is mostly plumbing over schemas that already exist. Neither should be allowed to grow
into an epic. If either does, stop and re-plan rather than running two large fronts at once.

Order and the reason for it:

| Phase | Why it comes here |
| --- | --- |
| 0 · Unblock | 93 commits unmerged is the single biggest risk on the board, and both goals stand on that foundation. |
| 1 · Live conformance | We claim goal 2 is done on the evidence of ONE model and a handful of capabilities. Verify before building on it. |
| 2 · Emit contract (B) | Small, mostly built, and its design should be informed by what phase 1 finds actually works. |
| 3 · `create-kai` | The one major epic. Gated on 2 so templates generate from exported schemas instead of hand-copying them. |

---

## Phase 0 — Unblock

### T1 · Merge PR #139 → 0.19.1
**What:** the `sideEffects` fix, cherry-picked onto `main`.
**Why now:** it is live-broken on npm today. `dist/register-impl-*.js` is not covered by
`sideEffects`, so Vite 8 / Rolldown shakes out every `customElements.define` call and new
consumers get a blank page with a silent console. Vite 8 is what `npm create vite@latest`
installs, so every *new* consumer hits it.
**How:** merge; release-please cuts 0.19.1 from the `fix(build):` prefix. Never hand-edit the version.
**Done when:** 0.19.1 is on npm and a fresh Vite 8 app renders `<kai-chat>`.
**Owner:** Rob. **Status:** green on CI, awaiting merge.

### T2 · Consumer-regression SMOKE on `feat/message-parts`
**What:** 8 cells — the 6-framework core sweep (`drop-in-chat × mock × full-page`), plus
`react-state-hooks` and `react × agentic × openrouter` with a mocked upstream.
**Why:** unit tests catch none of packaging, exports, SSR, or scaffold-output bugs. This harness
is what caught the sideEffects bug. The agentic cell is the highest-signal one: it is the first
time the emitted tool loop gets built and run by something other than its author.
**How:** local tarball (unique filename — npm serves a cached stale tarball when the name
repeats), probes strictly read-only on the repo, mixed model tiers to expose model sensitivity.
**Done when:** every cell reports `WORKS-clean`, or each failure has a layer diagnosis.
**Status:** running.

### T3 · Triage and fix what T2 finds
**How:** if anything is red, escalate that cell to REGRESSION mode — a single pass proves it is
broken, only the fix → re-verify loop proves a fix worked.
**Done when:** re-probe flips the affected cells to clean.

### T4 · Review and merge `feat/message-parts`
**How:** do not read 275 files linearly. Use T2's results to target the review at what the
probes actually exercised. The PR body must state the two known-unproven gaps out loud:
Anthropic was never driven live, and the Storybook smoke was not run.
**Owner:** Rob.

---

## Phase 1 — Live conformance sweep (the thorough test)

**The problem this solves.** The live proof to date is one model
(`~deepseek/deepseek-v4-flash-latest`), one tool, one card type, two rounds. We have 79 elements.
Claiming "a model drives our UI" on that evidence is exactly the overclaiming this project has
been bitten by before. This phase replaces the claim with a table.

### T5 · Build the conformance harness
**What:** extend `examples/internal/openrouter-spike/` into a scenario-driven harness. It already
has the pieces — a Vite dev proxy keeping the key server-side, `tools.ts`, `transport.ts`, and
fixture-replay tests.

Each scenario is a module exporting `{ id, prompt, tools, assert(page) }`. A Playwright runner
drives the real app once per scenario per model, and **every raw SSE stream is recorded to a
fixture file**, so each live run permanently strengthens the offline unit suite.

**★ The assertion rule.** Every `assert` must pierce the shadow DOM and assert **visible rendered
state** — the tool panel showing `Completed` with its output JSON, the card's buttons, the
citation chip's label. Asserting that a part exists in the data model proves the adapter ran and
says nothing about whether the UI works, which is the failure mode that has cost this project
the most. **Each assertion must be watched failing before it is trusted** (point it at a scenario
that cannot produce that part and confirm it goes red).

### T6 · Run the sweep and publish the table

Scenario catalog, with today's honest status:

| # | Scenario | Elements | Today |
| --- | --- | --- | --- |
| S1 | Plain text streaming | `kai-thread`, `kai-message`, markdown/code | proven |
| S2 | Reasoning | `kai-reasoning`, `kai-thinking-bar` | proven |
| S3 | Single tool call | `kai-tool` | proven |
| S4 | Multi-round loop (≥3 rounds) | thread + encoders | proven at 2 rounds |
| S5 | Parallel tool calls in one turn | `kai-tool` ×N | untested |
| S6 | Tool error / malformed arguments | `kai-tool` `output-error` | fixtures only |
| S7 | `confirm` card | `kai-cards` | proven |
| S8 | `choice` card | `kai-cards` | untested |
| S9 | `form` card + result round-trip | `form`, `form.result` | untested |
| S10 | `tasks` card + result | `tasks`, `tasks.result` | untested |
| S11 | `link` + `embed` cards | `kai-cards` | untested |
| S12 | Citations from a search tool | source parts → citation row | **renders nothing** |
| S13 | Artifact over time | `kai-artifact` | untested |
| S14 | Attachments / file parts | attachments | untested |
| S15 | Interleaving stress: text→tool→text→reasoning→card | ordering | partly |
| S16 | Mid-stream provider error | error path | fixtures only |
| S17 | Long stream + user cancel | abort path | untested |

Model sweep — 4 models, chosen to close known gaps rather than for breadth:
- `~deepseek/deepseek-v4-flash-latest` — the baseline everything was proven on.
- **An Anthropic model through OpenRouter passthrough** — closes the "Anthropic never driven
  live" gap. Expect this to force at least one revision; the two Criticals the final review
  caught were both Anthropic-shaped.
- An OpenAI-format model — confirms the adapter is not accidentally DeepSeek-specific.
- One cheap/small model — measures the floor for what a consumer can get away with.

**Cost control:** short prompts, capped max tokens, run manually rather than in CI. The whole
matrix should cost single-digit dollars.

**Done when:** a committed conformance table says pass / fail / unsupported for every cell, and
the fixtures captured from it are in the unit suite.

### T7 · Fix what the sweep breaks
Expect S12 (citations) to fail by construction: `source` parts land correctly but `message.tsx`
deliberately matches them to `null` pending sub-project D. **That one is likely to get pulled
forward** — it is small, and a developer wiring up a search tool currently sees results arrive
and nothing appear, which reads as broken.

---

## Phase 2 — Sub-project B, the emit contract

**The insight:** a card schema is exactly the shape of a tool definition. Hand a model our
`confirm` schema as a tool and it emits a valid envelope by construction, which our dispatcher
renders. No glue, no prompt engineering. And the spike already settled the product question
empirically: **cards come from tools, not structured output** — structured output produces valid
envelopes but suppresses tool calling, breaks streaming, and costs more.

**The evidence this is the gap:** the kit builds ten card JSON Schemas into `dist/schemas/` on
every build and exports none of them — there is no `./schemas` entry in the exports map. Our own
spike hit this and hand-derived the confirm schema instead; `src/card-schema.ts` opens with a
comment saying so. The one consumer who tried to use them could not, and hand-copied — the same
drift pattern that shipped a removed schema to npm three times this epic.

- **T8 · Export the schemas.** `./schemas/*` in the exports map, plus node10 `typesVersions`.
  Guard: a test that resolves each of the ten through the public entry, watched failing first.
- **T9 · Custom schema registration.** Let a consumer register their own design-system component
  the same way, so this is a contract rather than ten hardcoded cards.
- **T10 · Document schemas-as-tool-definitions** and wire it into the MCP scaffolder and
  `component_reference`, so scaffolds generate tool definitions *from* the schemas rather than
  restating them. This is what stops the drift at the source before `create-kai` multiplies it
  across 8 frameworks.
- **T11 · Add `openai` and `anthropic` catalog integrations.** The two keys developers most often
  already hold, missing from both the CLI catalog and the `kai` MCP. Cheap: one `envVars` entry,
  `routeTemplates`, and a `streamMapping` each — and `@kitn.ai/ui/wire` already parses both formats.

**Done when:** a consumer can `import confirmSchema from '@kitn.ai/ui/schemas/confirm.schema.json'`,
pass it to a model as a tool, and render the result — proven by a conformance scenario, not by a
unit test.

---

## Phase 3 — `create-kai` (the one major epic)

Unblocked by phases 1 and 2: a scaffolded app now demonstrates tools, reasoning and cards rather
than ~5 of 79 elements. Spec is at
`docs/superpowers/specs/2026-07-01-create-kai-scaffolder-design.md` (v2, layout-first flow,
feature multi-select, the clone rule, `kai.json`, staged v0/v1/v2).

- **T12 · v0 catalog prereqs.** Extract `renderSurface({framework, components, integration})`
  shared by the MCP and the CLI, keyed on a **components list, not an archetype id** — that is
  what makes the feature multi-select possible. Extend `IntegrationSchema` with a deps list and
  `frontendSafe`/`needsProxy`. Each of these improves the MCP standalone.
- **T13 · v1 CLI.** Create-new only, 8 starters gated by the coverage matrix, `kai.json` written
  but unread. Out of scope for v1: clone names, `add`, Angular/Solid renderers.
- **T14 · The agent-wiring step.** Write project-scoped `.mcp.json` + `AGENTS.md` carrying the
  `kai-` contract rules agents get wrong. Guardrails: project scope only, never a user-global
  file; write JSON rather than shelling out to a harness; `--no-agent` flag.
- **T15 · Sampled smoke** across the matrix via the consumer-regression harness.

---

## Deferred — sub-project D

Artifact-over-time (the v0 / Lovable loop) and the interactive card round-trip
(`CardResolution`, designed but never model-driven). The citation row lives here on paper but is
likely to be pulled into phase 1 as noted in T7.

---

## Standing rules for this roadmap

Carried from what this epic cost us:

- **Watch every check fail before trusting it.** Six tests on sub-project C alone passed while
  covering nothing. A guard that has never been red is not evidence.
- **Code that gets copied has no compiler watching it.** Scaffold output, generator prose inside
  `gen-*.mjs`, and docs are invisible to both gates. Verify by *generating and running* the
  artifact, not by reading the diff.
- **Verify against the committed state**, not a dirty post-build tree.
- **Do not overclaim.** State what was proven, on what model, how many times.
