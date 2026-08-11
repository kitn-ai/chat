# Plan: the emit contract (tasks #8–#11 + the closed loop)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use `- [ ]` for tracking.

**Goal:** a developer builds an app with our components, points a model at it, and (a) gets a real card on screen without hand-writing a tool definition or an envelope mapper, and (b) finds out *quickly and specifically* when the model's output does not match what their app can render.

**Base SHA:** `7eb02de` on `feat/message-parts`. Assert `git rev-parse --short HEAD` before editing (§5.9).

---

## 1. What I verified before designing (read this; it changes the shape of #8)

Everything here is measured on the tree at `7eb02de`, not recalled.

**The schemas.** 11 files in `packages/ui/src/primitives/card-schemas/`. Only **7 are card-data schemas** (`confirm`, `choice`, `form`, `tasks`, `link`, `embed`, `artifact`); the other 4 (`card-envelope`, `card-event`, `form.result`, `tasks.result`) are contract shapes, not tool candidates. `scripts/copy-card-schemas.mjs` copies all 11 into `dist/schemas/`. `package.json` has **no `./schemas` export and no `typesVersions` key at all**. `files` ships `dist` *and* `src`, so the bytes are in the tarball and unreachable purely because `exports` is a closed map.

**Byte cost, measured:**

| set | minified | gzip |
|---|---|---|
| all 11, as authored (descriptions, `x-kai-*`, `$id`) | 16,613 B | **4,973 B** |
| all 11, projected for validation only (strip `description`/`title`/`$schema`/`$id`/`default`/`x-*`) | 4,154 B | **1,005 B** |

Per card, lean: confirm 483 B, choice 569 B, tasks 579 B, artifact 900 B, embed 622 B, link 336 B, form 176 B.

**The claim "a card schema IS a tool definition" is true in spirit and false in detail.** I checked both providers' current docs rather than recalling them: OpenAI via Context7 (`/websites/developers_openai_api`) plus WebFetch of `developers.openai.com/api/docs/guides/structured-outputs`; Anthropic via Context7 (`/websites/platform_claude_en_api`) plus WebFetch of `platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use` and `.../build-with-claude/structured-outputs`. Findings:

- Both **non-strict** modes accept a loose JSON Schema and mostly ignore what they do not understand. Both **strict** modes compile the schema to a grammar and **400 on an unsupported keyword**.
- The two strict subsets are **not the same**, and the difference is load-bearing:
  - OpenAI strict: **every** property must be in `required` (optional is emulated with a `null` union); `additionalProperties: false` mandatory; `minItems`/`maxItems` supported; `pattern`/`format` supported; `allOf`/`if`/`then`/`else`/`not` unsupported.
  - Anthropic strict: optional properties **are** allowed; `additionalProperties: false` mandatory; `minItems` **only 0 or 1**; `maxItems` unsupported; `minLength`/`maxLength` unsupported; numeric `minimum`/`maximum`/`multipleOf` unsupported; `default` supported; recursion unsupported.
- Anthropic's tool shape is `{ name, description, input_schema, strict? }`; OpenAI's is `{ type:'function', function:{ name, description, parameters, strict? } }`.
- Against that, the kit's schemas today: only **3 of 11** set `additionalProperties: false`; **all 11** carry `$schema` + `$id`; 7 carry `x-kai-*` keywords; `confirm`/`choice`/`tasks` use `minItems`/`maxItems`/`minLength`; `embed` uses `allOf` + `if`/`then`; `artifact` uses `oneOf` (neither provider lists `oneOf`).

  **So `embed` and `artifact` cannot be strict tool definitions at all without a schema rewrite, and the other five need a projection.** That is the real content of #8, and it is why "one line in package.json" (FINDINGS.md's estimate) is wrong.

**The dispatcher already validates, on one transport only.** `packages/ui/src/remote/provider-runtime.ts:142` runs `validateAgainstSchema(renderer.schema, envelope.data)` and, on failure, renders a placeholder and emits `{ kind:'error', cardId, message }`. The **native** path does not: `components/card-renderer.tsx:34-44` and `elements/cards.tsx:77-81` only check that the *type* is registered. So the mechanism the product owner is asking for exists, on the wrong half of the kit. This is an asymmetry to close, not a feature to invent, and it needs **no `CARD_CONTRACT_VERSION` bump**, because `error` is already a `CardEvent` kind and `CardPolicy.onError` already exists.

**`validateAgainstSchema` is already in the browser bundle** (`components/form.tsx:279` imports it; `src/index.ts:65` exports it). The marginal cost of native validation is therefore **schema data only**, not validator code.

**The validator ignores exactly the keywords the hard cases need.** `card-validate.ts` has no `anyOf`/`allOf`/`oneOf`/`if`/`then` and no `additionalProperties`. So a naive "we validate cards now" claim would be false for `embed` (whose entire provider/url requirement is in `allOf`+`if`) and partly false for `artifact` (`oneOf` height). Shipping that claim unguarded is §5.1 verbatim.

**No archetype renders cards.** `agent-tooling/archetypes.ts`: six archetypes, none includes `kai-cards`. So the scaffolder cannot emit a card app at all today.

**The Solid scaffold's `renderPart` has three branches** (`text`, `reasoning`, `tool`): `scaffold.ts:2479-2510`. The comment at **2469-2471** says it renders "exactly what `<kai-chat>` renders" and the invariant at **2208** repeats it. Both are false: no `source` branch (since the citation row shipped) and no `card` branch (since forever). Element-based targets are fine, `components/message.tsx:512` renders `card` parts, so this is a **Solid-target-only** defect, which the current wording hides.

**The repo's own reference harness hand-writes both halves.** `examples/internal/openrouter-spike/src/tools.ts` declares `propose_action` with four flat scalars (`title`, `body`, `confirmLabel`, `tone`), nothing like `confirm.schema.json`, and `tools.ts:471-500` assembles the envelope in app code, with the comment: *"The model gives us three flat scalars; the ENVELOPE is assembled here … the model cannot emit a CardEnvelope directly because the card JSON Schemas are not reachable through the package exports map."* Plus `src/card-schema.ts:7-12`'s hand-derivation. **That is the same shape written in five places today**: the JSON Schema, the TS type in `components/confirm-card.tsx`, the docs table in `apps/docs/src/content/docs/patterns/generative-ui-cards.mdx`, the spike's tool spec, and the spike's mapper. §5.11's failure mode with a 5x multiplier, before `create-kai` touches it.

---

## 2. The developer-facing before/after, with step counts

### Today: get a model-driven `confirm` card on screen

```ts
// 1. kai scaffold --archetype agentic --integration openrouter --framework next
//    → emits a tool loop, a `tools` array with `search`, and no card anything.

// 2. Open the docs, hand-copy the ConfirmCardData shape (5th copy of it).

// 3. Hand-write a tool definition that approximates the schema you cannot import:
const tools = [{
  type: 'function',
  function: {
    name: 'propose_action',
    description: 'Ask the user to approve an action before you take it.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' }, body: { type: 'string' },
        confirmLabel: { type: 'string' },
        tone: { type: 'string', enum: ['default', 'warning', 'danger'] },
      },
      required: ['title', 'body', 'confirmLabel'],
      additionalProperties: false,
    },
  },
}];

// 4. Hand-write the mapper from arguments to an envelope (copy 5 drifts here):
function toConfirmEnvelope(input: Record<string, unknown>, id: string): CardEnvelope {
  return { type: 'confirm', id, title: String(input.title ?? 'Confirm'), data: {
    body: String(input.body ?? ''), tone: /* re-validate the enum by hand */ 'default',
    dismissible: true,
    actions: [{ id: 'approve', label: String(input.confirmLabel ?? 'Confirm'), style: 'primary', default: true },
              { id: 'cancel',  label: 'Not now', style: 'default' }],
  }};
}

// 5. Splice it into the emitted tool loop, which only knows applyToolOutput:
for (const call of pending) {
  if (call.name === 'propose_action') stream.addCard(toConfirmEnvelope(call.input ?? {}, call.id));
  applyToolOutput(stream, call.id, { status: 'awaiting_user' });
}

// 6. If you picked the `solid` framework: add a `card` Match to the emitted renderPart,
//    because the emitted one has text/reasoning/tool only.
// 7. Wire a CardPolicy; pass `cardTypes` if you have your own card component.
// 8. It renders wrong. There is no signal. Debug by eye.
```

**8 steps. 2 hand-copies of a shape the kit owns. 0 signals when the shape is wrong.**

### After phase 1 (schemas exported + the loop closed)

```ts
import { cardTools, cardFromToolCall } from '@kitn.ai/ui/schemas';

// 2. tool definitions, generated:
const tools = [...myTools, ...cardTools({ provider: 'openai' })];

// 3. the loop, one added line:
for (const call of pending) {
  const card = cardFromToolCall(call.name, call.input ?? {}, { id: call.id });
  if (card) { stream.addCard(card); applyToolOutput(stream, call.id, { status: 'awaiting_user' }); continue; }
  applyToolOutput(stream, call.id, await runTool(call.name, call.input ?? {}));
}
```

**4 steps (scaffold, import, tools, loop line). 0 hand-copies.** And when the model emits `{ actions: [] }`, the thread shows a card that says *`data.actions: fewer than minItems 1`* and `policy.onError(cardId, …)` fires, instead of an empty confirm card.

### After phase 3 (the scaffolder emits it)

```
kai scaffold --archetype agentic --integration anthropic --framework sveltekit
```

**1 step.** The emitted `tools` const *calls* `cardTools(cards)`; the emitted loop *calls* `cardFromToolCall`; the emitted `renderPart` has `card` and `source` branches. Nothing is restated, so nothing can drift.

### Where it breaks on the other axes

- **Anthropic instead of OpenAI.** Two breaks. (a) The tool envelope differs (`input_schema` vs `function.parameters`), solved by `cardTools({ provider })`, which is why `provider` is a required argument and not a default. (b) There is **no `anthropic` catalog integration**, so `kai scaffold --integration anthropic` is not a thing; the developer gets `openrouter` or writes the route themselves. That is #11 and it is why #11 is in this plan rather than deferred.
- **SvelteKit instead of Next.** The break is the **JSON import**, and it is why the JS entry has to be the primary surface. `import s from '@kitn.ai/ui/schemas/confirm.schema.json'` works under Vite/SvelteKit; needs `with { type: 'json' }` under Node ESM and TS `nodenext` (which is what the stock `tsconfig.node.json` in Vite templates uses, the mode our own emitted routes compile in, per CLAUDE.md); needs `resolveJsonModule` for types in any mode; and needs a `wrangler` rule under Workers. A JS entry (`@kitn.ai/ui/schemas`) has none of those problems in any of the 11 framework targets, and gets `verify:ssr` coverage for free because that guard derives its entry list from the exports map. The raw `./schemas/*.json` subpaths still ship, they are for Python/Go backends and for `fetch`, but they are the secondary surface, not the headline.

---

## 3. Architecture

Three new pieces, one new entry, no contract bump.

**A. `@kitn.ai/ui/schemas`, a new JS subpath entry** (server-safe: no DOM, no Solid, no `fetch`). Built like `./state` and `./wire` (`vite.config.schemas.ts`, sibling `.d.ts` via `emit-subpath-dts.mjs`, which is derived from the exports map and needs no edit).

```ts
// data
export const cardSchemas: Readonly<Record<string, JsonSchema>>      // the 7 card-data schemas
export const contractSchemas: Readonly<Record<string, JsonSchema>>  // envelope/event/results

// registry  →  tool definitions
export function createCardRegistry(spec): CardRegistry
export function cardTools(registry, opts: { provider: 'openai'|'anthropic'|'jsonschema', strict?: boolean }): ToolDef[]

// tool call  →  envelope   (the inverse; the one line the loop needs)
export function cardFromToolCall(name, input, opts: { id: string }): CardEnvelope | null
export function isCardTool(name: string): boolean

// validation, full-fat (descriptive errors)
export function validateCardEnvelope(env, registry?): ValidationResult
```

**B. `CardRegistry`, the one place "this app renders these card types" is written.** This is the answer to "ground the tool definitions in the app's ACTUAL registry": there is no ambient registry today (`cardTypes`/`types` are per-element props), so we create one object the developer builds once and threads to both ends.

```ts
// cards.ts, imported by the client AND the route
import { createCardRegistry } from '@kitn.ai/ui/schemas';
import pricingSchema from './pricing.schema.json';

export const cards = createCardRegistry({
  use: ['confirm', 'choice'],                      // the built-ins THIS app renders
  custom: {
    'pricing-table': { schema: pricingSchema, tag: 'my-pricing-table',
                       description: 'Show a plan comparison the user can pick from.' },
  },
});

// client:  chat.cardTypes = cards.tags;      // feeds mergeCardTags, consumer wins, unchanged
// server:  tools: cardTools(cards, { provider: 'anthropic' })
```

`cards.tags` is exactly the `Record<type, tag>` `mergeCardTags` already takes, so **extension stays at the card layer and `MessagePart` stays closed.** A type in `tags` with no `schema` is legal (you may render something we cannot describe) but `createCardRegistry` **warns loudly in dev** and `cardTools` skips it, because a card type the model is never told about and that nothing validates is precisely the silent hole this repo keeps building.

**C. Native validation, two-tier, in the dispatcher.** `CardRenderer` (Solid) and `CardSlot` (`<kai-cards>` + `elements/message.tsx`) gain the check `provider-runtime.ts:142` already does:

- **hard** (`type` mismatch, missing `required`): render a `CardFallback`-shaped diagnostic naming the field path, emit `{kind:'error'}`. The card genuinely cannot render.
- **soft** (`maxItems`, `maxLength`, unknown property): render anyway, emit `{kind:'error'}` once. The card renders acceptably today and we must not regress it.

The tiering is not politeness. It is what keeps this from being a behaviour break for existing consumers on a pre-1.0 package.

### Bundle cost, decided explicitly

| option | client cost | verdict |
|---|---|---|
| ajv | 30–120 KB gz | disqualifying for a component library |
| reuse `validateAgainstSchema` + ship the **authored** schemas to the client | +4,973 B gz | works, but pays for descriptions the browser never reads |
| reuse it + a **build-generated lean projection** | **+1,005 B gz** | **recommended** |
| dev-only, stripped in production | 0 in prod | **rejected, and this is the interesting one** |
| opt-in `@kitn.ai/ui/validate` | 0 unless imported | rejected as the default |

Dev-only stripping is rejected on two grounds, both concrete. (1) The kit has **no `process.env.NODE_ENV` / `import.meta.env` convention anywhere in `src/`**, I grepped, so this would introduce a stripping contract we then have to make work across seven consumer bundlers on a **pre-built** dist, where substitution into `node_modules` is not guaranteed. (2) More importantly: **a model emitting a bad shape is a production failure mode.** Stripping the check in production means the developer's users get the silently-broken confirm card while the developer's laptop looks fine. That inverts the whole point.

`1,005 B gzip` against a package that already ships a Solid runtime, `marked`, and a lazy Shiki loader is below the noise floor. The escape hatch is `validateCards={false}` on `<kai-chat>`/`CardRenderer`; the descriptive full-fat validator lives in `@kitn.ai/ui/schemas` for anyone who wants it server-side.

---

## 4. Ordering: the loop closes in phase 1, not last

> **Phase order was considered and kept.** §9 risk 2 argues that the 7 built-in card types may be the wrong unit of value, and that phase 2 (custom registration) is where developers actually live. The phases were **not** swapped, because phase 2 needs phase 1's projection machinery to exist first. Revisit this with real feedback once phase 1 lands, rather than settling it now.

The roadmap's order is #8 → #9 → #10 → #11, which closes the loop at the end. **Reordered so it closes first**, because until it does, everything shipped is "here are some schemas, good luck":

| phase | what a developer can do at the end of it |
|---|---|
| **0** | (repair) the Solid scaffold renders every part kind again |
| **1** | Import our schemas, hand them to a model as tools, render the result, and **see a specific error when the shape is wrong.** Built-ins only. **The loop is closed here.** |
| **2** | Do the same with **their own** design-system components. |
| **3** | Get all of it from `kai scaffold`, on OpenAI or Anthropic, with nothing restated. |

Phase 1 is deliberately the smallest thing that is a closed loop. If phase 1 costs more than ~2 days, stop and re-plan. The roadmap's sequencing principle forbids this growing into an epic while `create-kai` waits.

---

## 5. Global constraints

- Commands from the **worktree root**. `nx` is not on PATH: `pnpm exec nx …`.
- **Fresh worktree:** `pnpm --filter @kitn.ai/ui run build:css` before any vitest run.
- Unit suite: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`. Never bare `pnpm test`.
- **Build, then gate. Never in one shell command** (§6). After `nx build ui`, `git checkout -- packages/ui/src/components/component-meta.json`; everything else that regenerates is real and gets committed.
- Generated artifacts do **not** regenerate under a cached `nx build ui`. Use `npm run build:api` inside `packages/ui` or `--skip-nx-cache` (§5.8).
- **No em dashes** in prose, comments or commit messages.
- Conventional commits. `@kitn.ai/ui` must never depend on a provider SDK. `src/schemas/**` may import provider *type shapes we declare ourselves*, never `openai` or `@anthropic-ai/sdk`.
- **Every new guard must be watched failing first, and failing for the right reason** (§5.1, §5.6). A task is not done until the failure output is pasted into the commit body.
- Agents that WRITE get `isolation: "worktree"`; readers may share (§5.4).

---

## 6. Work items

Parallelism is stated per phase. Within a phase, tasks with disjoint file sets may run concurrently.

### Phase 0: repair the false invariant (critical path, 1 agent)

> **Argument for including this here rather than separately.** It is not a courtesy fix. Phase 3 adds a `card` branch to the same `renderPart`; adding `card` while `source` is still missing ships a scaffold that renders the thing this plan added and still drops citations, the same defect, one part-kind over. The comment at 2208 is the *specification* the new branch must satisfy, and it is currently a lie, so phase 3 would be built on a false premise. It is ~20 lines in one function in a file this plan already owns, and splitting it costs a second full build plus a second ~18s `verify:scaffold` for zero isolation gain. The counter-argument (it is an unrelated bugfix that could land faster alone) is real but has had a week to happen and has not.

- **T0.1: `source` and `card` branches in the emitted Solid `renderPart`.**
  Files: `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` (2208, 2469-2483, 2497-2510), `packages/ui/src/agent-tooling/mcp/scaffold.test.ts`.
  Correct the 2469-2471 wording to state the *actual* invariant, add the two branches, and correct 2481's fallback comment.
- **T0.2: the structural guard that would have caught it.**
  Files: `packages/ui/scripts/verify-scaffold-compiles.mjs`.
  tsc cannot see a missing `<Match>`, so this is a structural check in the same family as `htmlStructureCheck`: **every variant of the `MessagePart` union, read from `src/elements/chat-types.ts`, must appear as a `partAs(part(), '<variant>')` in every emitted Solid scaffold.** Derived from the union, not from a literal list, so the next part kind is covered the day it is added.
  **Fail-first:** delete the `source` branch and confirm it names `source` specifically. Then add a fake `'audio'` variant to the union in a scratch edit and confirm it goes red without the guard being touched. That proves it is derived and not a list.

### Phase 1: the loop (critical path; T1.1 → T1.2 → {T1.3 ‖ T1.4} → T1.5 → T1.6)

- **T1.1: export the schemas, both surfaces.** *(this is #8)*
  Files: `packages/ui/package.json`, `packages/ui/vite.config.schemas.ts` (new), `packages/ui/src/schemas/index.ts` (new), `packages/ui/scripts/copy-card-schemas.mjs`.
  Add `"./schemas": {types, default}` (JS entry) **and** `"./schemas/*": "./dist/schemas/*"` (raw JSON), plus `typesVersions: { "*": { "schemas": ["dist/schemas/index.d.ts"] } }` for node10 consumers.
- **T1.2: `verify:schemas` guard.** Files: `packages/ui/scripts/verify-schemas-exported.mjs` (new), `packages/ui/package.json`, `.github/workflows/test.yml`. See §7 for what it must catch and how to make it fail.
- **T1.3: the projection, `cardTools()` + `toOpenAITools`/`toAnthropicTools`.**
  Files: `packages/ui/src/schemas/tool-defs.ts` (new), `packages/ui/src/schemas/provider-subsets.ts` (new), tests.
  Non-strict is the default (it is the mode the spike proved cards in). `strict: true` runs the provider projection and **throws, naming the card type and the keyword**, for anything it cannot express, today that is `embed` (`allOf`/`if`) and `artifact` (`oneOf`) on both providers, plus `maxItems` on Anthropic. A silent downgrade here would be §5.1 with a 400 attached.
  **`provider: 'jsonschema'` is part of this task, not a later addition.** It returns a bare `{name, description, schema}` that `ai@7`'s `jsonSchema()` accepts directly, which is what stops a developer on the Vercel AI SDK from having to keep our JSON Schema as an awkward second source of truth (§9 risk 3). T3.1 emits that form for the `vercel-ai-sdk` integration.
- **T1.4: `cardFromToolCall()` + the tool-name convention.**
  Files: `packages/ui/src/schemas/from-tool-call.ts` (new), tests.
  The design that makes this small: **the tool NAME carries `CardEnvelope.type` and the provider's `tool_call_id` carries `CardEnvelope.id`.** `id` is already unique per call and is already the key `upsertCardPart` uses, so a model revising a card re-sends the same tool call id and `addCard` upserts in place. No id generation, no collision handling.
- **T1.5: native validation, two-tier.**
  Files: `packages/ui/src/primitives/card-validate-cards.ts` (new, the generated lean projection + tiering), `packages/ui/src/components/card-renderer.tsx`, `packages/ui/src/elements/cards.tsx`, `packages/ui/src/components/card-fallback.tsx`, `packages/ui/scripts/gen-card-validation-schemas.mjs` (new), tests.
  Mirror `provider-runtime.ts:139-147` deliberately and say so in the comment, so the two transports are visibly one behaviour.
- **T1.6: the soft-tier corpus check, and it blocks the default.**
  Files: `examples/internal/openrouter-spike/harness/`, the replayed conformance fixtures, and the soft-tier default in `packages/ui/src/primitives/card-validate-cards.ts`.
  Replay real envelopes from the five conformance configurations against T1.5's projection and **count how many valid-looking ones trip the soft tier.** Zero is the bar. If the count is not zero, the soft tier ships defaulting to **off** and the projection gets fixed first; the hard tier is unaffected either way. §9 risk 4 called this the honest de-risk and the plan did not schedule it, so it is scheduled here, ahead of the default rather than after it. Put the count in the commit body, including when it is zero.

Parallel-safe: T1.3 and T1.4 touch disjoint new files under `src/schemas/` and can run concurrently after T1.1 lands. T1.5 touches `primitives/` + `components/` + `elements/` and is disjoint from both. T1.6 depends on T1.5 and runs last, because it measures T1.5's behaviour.

### Phase 2: make it theirs *(this is #9)* (1–2 agents)

- **T2.1: `createCardRegistry()`.** Files: `packages/ui/src/schemas/registry.ts` (new), tests. `registry.tags` must be assignment-compatible with `mergeCardTags`'s parameter and `registry.components` with `mergeCardComponents`'s. Assert that with a type-level test, not by inspection.
- **T2.2: `cardTools(registry)` and `validateCardEnvelope(env, registry)` honour custom types.** Files: `src/schemas/tool-defs.ts`, `src/schemas/index.ts`.
- **T2.3: restore the consumer-seam conformance coverage the handoff flags as lost.** Files: `examples/internal/openrouter-spike/src/scenarios/s20-custom-card.ts` (new), `src/tools.ts`, `harness/`. §1.4 records that `cardTypes` has had no end-to-end user since `artifact` became a built-in, and that seam is exactly what #9 stands on.

### Phase 3: stop the drift *(this is #10 + #11)* (3 agents, disjoint)

- **T3.1: the scaffolder GENERATES tool definitions.** Files: `agent-tooling/mcp/tools/scaffold.ts` (`toolSchemaLines` at 700-721, `toolLoopBody` at 493-524, `wireImportLines` at 578-601), `scaffold.test.ts`.
  The emitted code must **call** `cardTools(cards)` and `cardFromToolCall(...)`, never restate a schema. For the `vercel-ai-sdk` integration it emits `cardTools(cards, { provider: 'jsonschema' })` and hands the result to `jsonSchema()`, per the T1.3 requirement. `emitsToolSchemas()` (689-691) gains a card arm. **Decision: fold cards into the `agentic` archetype rather than adding a 7th.** A new archetype adds 72 front-end cells (+~17%) to `verify:scaffold` for a capability `agentic` already implies.
- **T3.2: `component_reference` serves the schema.** Files: `agent-tooling/mcp/tools/reference.ts`, `agent-tooling/mcp/manifest.ts`, `reference.test.ts`. Asking for `kai-confirm` should return the *schema* and the *tool definition*, generated, so an AI harness stops inventing one.
- **T3.3: `openai` and `anthropic` catalog integrations.** *(this is #11)* Files: `agent-tooling/integrations/openai.ts` (new), `agent-tooling/integrations/anthropic.ts` (new), `agent-tooling/registry.ts`, `registry.test.ts`.
  Both are `webRoute` handlers with `forwardsFromClient: ['model','tools']`. **The Anthropic one is not a copy of OpenRouter's**: `system` is top-level not a message, `tool_choice` must be an object, `max_tokens` is required, and if thinking is on `budget_tokens >= 1024` with `max_tokens` strictly greater (§4 of the handoff). The route must forward the upstream status (the missing-key-becomes-silence bug in `openrouter.ts:33-40`).
  **Cost note:** this takes `verify:scaffold` from 9 to 11 integrations = 432 → 528 front-end cells and 77 → ~99 routes, roughly +25% on an ~18s gate. Acceptable; state it in the PR.
- **T3.4: docs.** Files: `apps/docs/src/content/docs/patterns/generative-ui-cards.mdx`, a new `guides/schemas-as-tool-definitions.mdx`. The three hand-written TS shape blocks in the existing page are copies 3-of-5; either generate them from the schemas or register them with `verify:docs`. Say which, honestly, in the commit.

T3.1 / T3.2 / T3.3 / T3.4 have disjoint file sets and run in parallel.

---

## 7. Guards: what each catches, and how to make it fail first

The repo's dominant defect is checks that pass while covering nothing, and today alone produced three instances (§5.6's tool-panel echo, its structurally-blind control, §5.11's field-name-on-one-wire spec). Each guard below therefore states the **specific blind spot it must not have**.

| guard | catches | how to make it fail FIRST | the blind spot it must not have |
|---|---|---|---|
| **`verify:schemas`** (new) | a schema unreachable through the public exports map | Run it on `7eb02de` **before** T1.1: it must report **11 unresolvable**, each by name. Then after green, delete `"./schemas/*"` and confirm it names those 11 and not the JS entry. | A guard that stats `dist/schemas/` proves nothing. It must resolve `@kitn.ai/ui/schemas/confirm.schema.json` **from a temp package outside the repo**, symlink-installed, in `bundler` *and* `nodenext` (`ts.resolveModuleName` **with the containing file's implied mode**, without the mode it goes green on a broken package, exactly as `verify-dts-boundaries.mjs`'s header warns). The expected count must be `readdirSync(card-schemas).length`, derived: a hardcoded `11` passes forever after someone adds a 12th. |
| **`verify:tool-schemas`** (new) | a projected tool definition that a provider would 400 | Point it at the **un-projected** `confirm.schema.json` and confirm it names `maxItems`, `minLength` and `x-kai-control` **individually**. Then point it at `embed` and confirm it says "cannot be expressed under `anthropic` strict: `allOf`" rather than emitting it. | §5.11's exact bug. **One shared supported-keyword table would be the same defect with a different field name.** Two tables, each carrying its source-doc URL in a comment, plus an assertion that they *differ* (`expect(OPENAI_STRICT).not.toEqual(ANTHROPIC_STRICT)`) so a copy-paste that collapses them fails loudly. `minItems` is the tell: legal at any value on OpenAI, only 0 or 1 on Anthropic. |
| **Validation-projection sync** (new) | the lean client projection drifting from the authored schema | Add a property to `confirm.schema.json`, do not regenerate, confirm red. | Same family as the derived-artifacts gap §1.4 flags. Regenerate-and-`git diff --exit-code`, and **read the whole diff, not the line you went looking for** (§5.7). |
| **Validator-coverage** (new, build-time) | claiming "we validate cards" while `embed`'s `allOf` is silently unchecked | Add `"multipleOf": 2` to any card schema and confirm **the build fails**, naming the keyword and the file. | This is the `TOOL_KEYS`/`REASONING_KEYS` pattern (§5.11's structural answer). Every keyword in every card schema is either implemented by `validateAgainstSchema` or listed in an explicit `NOT_ENFORCED` set **with a written reason**. A silent skip list defeats the whole guard. |
| **`verify:scaffold` part-coverage** (extends existing) | an emitted `renderPart` missing a part kind | Delete the `source` branch, confirm red; add a fake union variant, confirm red without touching the guard. | tsc cannot see a missing `<Match>` (§5.5: compilation is not behaviour). It must read the variant list from the `MessagePart` union in source. |
| **S19a: model-driven card renders** (conformance) | the exported schema does not actually produce a renderable envelope | Point the assertion at `CONTROL-empty` and confirm red. **Then DOM-probe the GREEN run**. §5.6 says a red control is necessary and not sufficient. | S13's exact failure, from before S13 was closed (it now passes live in all ten cells). The assertion must be scoped to `kai-thread [data-card-type="confirm"] button[data-action-id]`, never unscoped text: an unscoped `seesText('Deploy')` is satisfied by the `<kai-tool>` panel echoing the model's own arguments a few inches up the thread. |
| **S19b: a WRONG shape is surfaced** (conformance; **the loop's proof**) | the diagnostic path itself | Replay the corrupted fixture against a build with T1.5 reverted. It must go red **because the confirm card rendered empty chrome**, not because nothing rendered. Confirm that distinction in the failure text before trusting it. | If the corrupted envelope also fails to produce a card *part*, S19b passes for the wrong reason and proves nothing about validation. Corrupt `data` only (`{actions: []}`), never `type` or `id`. Use a **replayed** fixture so this costs nothing and is deterministic. |

Free coverage worth knowing: `verify:ssr` derives its entry list from the exports map, so `./schemas` (JS) is covered the day it lands. `./schemas/*.json` is **not**: `jsTargets()` returns `[]` for a non-`.js` target. That gap is exactly why `verify:schemas` exists. `emit-subpath-dts.mjs` is likewise derived and needs no edit.

---

## 8. Open questions

### Needing a human decision

1. **Live re-run budget.** S19a needs one live cell to be honest (a replayed-only pass is a replayed-only pass, per §4). Roughly $0.02-0.10. Also still open from §1.6: the other four configurations' S02.

### Resolved, recorded so they are not re-litigated

**Decided by the supervising session (2026-08-11), under delegated authority:**

Rob delegated ownership of this direction. The four calls below were made by the supervising session and reported to him afterwards, with an explicit invitation to overrule any of them; he has not objected. That is not the same as approval, and it is not recorded as approval: he has not responded to these four specifically. Argue with the supervising session, not with Rob.

- **Tool-name convention: `kai_confirm`.** Prefixed, short, and collision-resistant against a developer's own `confirm` tool. `createCardRegistry({ toolPrefix })` overrides it. Reversible pre-1.0, so it does not have to be right forever.
- **Strict mode: non-strict is the default, `strict: true` is opt-in and THROWS.** The throw names the card type and the offending keyword for anything the provider cannot express: today `embed` and `artifact` on both providers, plus `maxItems` on Anthropic. **`embed`'s `allOf`/`if` and `artifact`'s `oneOf` are NOT rewritten now.** That rewrite is deferred, for the reason this plan already gives: `embed`'s conditional requirement ("generic needs `url`; youtube/vimeo need `id` or `url`") **is** the contract, so flattening it changes what a valid embed card is, and that is a `CARD_CONTRACT_VERSION` conversation.
- **Native validation is on by default, two-tier, `validateCards={false}` to opt out, and the soft tier ships gated on evidence.** Before the soft tier defaults to on, T1.6 replays real envelopes from the five conformance configurations and counts how many valid-looking ones trip it. If that count is not zero, the soft tier defaults to **off** and the projection gets fixed first. §9 risk 4 named this as the honest de-risk and then did not schedule it; it is scheduled now, as T1.6, and it blocks the default rather than following it.
- **`provider: 'jsonschema'` is built in from the start, not bolted on.** It returns a bare `{name, description, schema}` that `ai@7`'s `jsonSchema()` accepts directly, and T3.1 emits that form for the `vercel-ai-sdk` integration. This is §9 risk 3's mitigation. The mitigation is cheap and the plan says so, so it is a stated requirement of T1.3 rather than a contingency.

**Resolved by the planning agent:**

- **Cards come from TOOLS.** Settled empirically in FINDINGS.md; not reopened, and nothing in this plan touches `response_format`.
- **The JS entry is primary, raw JSON is secondary.** Because of Node/TS import attributes, `resolveJsonModule`, and Workers bundling, three different breakages across the 11 framework targets, none of which the JS entry has.
- **Extension is at the card layer.** `registry.tags` → `mergeCardTags`, `registry.components` → `mergeCardComponents`, consumer wins. `MessagePart` stays closed.
- **`CardEnvelope.id` = the provider's `tool_call_id`.** Free upsert semantics, no id generation.
- **No `CARD_CONTRACT_VERSION` bump.** `error` is already a `CardEvent` kind; `CardPolicy.onError` already exists; `provider-runtime.ts` already uses both this way.
- **Cards fold into the `agentic` archetype.** No 7th archetype, no +72 matrix cells.
- **The scaffold.ts:2469-2471 fix belongs in this plan, as phase 0.** Argued in §6.

---

## 9. What could make this NOT worth doing

Stated plainly, because two of these are live risks.

1. **The projection is the tell.** "Export the schemas" was scoped as plumbing. It is not: 2 of 7 card types cannot be strict tool definitions without a schema rewrite, and 5 need a per-provider transform. If phase 1 runs past ~2 days, this has become an epic, and the roadmap is explicit that the emit contract must not be allowed to become one while `create-kai` waits. **Stop and re-plan rather than pushing through.**
2. **The 7 built-in card types may be the wrong unit of value.** A developer's real generative UI is *their* pricing table, not our confirm card. If that is true, the valuable half is phase 2 (`createCardRegistry` + custom registration) and the 7 built-in schemas are a demo of the mechanism. That would argue for swapping phases 1 and 2. I did not swap them because phase 2 needs phase 1's projection machinery to exist first, but the *value* ordering may genuinely be inverted, and it is worth 10 minutes of Rob's opinion before starting.
3. **The ecosystem may route around us.** `ai@7` (already a devDependency here) exports `jsonSchema()` and `tool()`; a developer using the Vercel AI SDK defines tools with Zod, and our JSON Schema is an awkward second source of truth. If most target developers are on the AI SDK or on MCP tool catalogs, `cardTools()` lands as "nice, but I use Zod". Mitigation is cheap (`provider: 'jsonschema'` returns bare `{name, description, schema}` that `jsonSchema()` accepts directly, and T3.1 emits that form for the `vercel-ai-sdk` integration) but it should be built in from the start, not bolted on.
4. **Validation could be net-negative.** If it fires on cards that render fine today, we have made the product worse and noisier. The two-tier design is the mitigation and I believe it holds, but it is a judgement call made without a corpus of real model output to test against. The honest de-risk is to run S19a across the five conformance configurations and count how many *valid-looking* real envelopes trip the soft tier before turning it on by default.
5. **It does not move the number if the real blocker is upstream.** If developers cannot get a model streaming at all, cards are irrelevant. The conformance sweep (95 cells, zero UI failures) says that is not the blocker, which is the main reason I believe this *is* the highest-leverage remaining item.

---

## Provenance

- **Written by a read-only planning agent, persisted separately.** That agent had no file-editing tools, so it could not write or commit this document; a second agent placed it at this path and committed it. The text is the planning agent's, apart from the decisions recorded in §8 (which added T1.6 in §6 and the `provider: 'jsonschema'` requirement on T1.3 and T3.1), the phase-order note at the top of §4, and em dash removal per the repo convention.
- **No implementation code was written.** The code blocks in §2 are the developer-facing before/after that the brief asked for, not emitted output.

### Critical Files for Implementation

- `packages/ui/package.json`: the `exports` map, absent `typesVersions`, and the `build`/`postbuild` chain the new entry hooks into
- `packages/ui/src/primitives/card-schemas/`: the 11 schemas; `confirm`, `embed` (`allOf`/`if`) and `artifact` (`oneOf`) are the ones that decide the projection design
- `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts`: the false invariant at 2208/2469-2471, `renderPart` at 2479-2510, `toolSchemaLines` at 700-721, `toolLoopBody` at 493-524
- `packages/ui/src/remote/provider-runtime.ts`: line 142, the validate-and-emit-`error` precedent the native dispatcher must mirror
- `packages/ui/src/primitives/card-registry.tsx`: `mergeCardComponents`/`mergeCardTags`, the seam `createCardRegistry` must stay assignment-compatible with
- `packages/ui/scripts/verify-dts-boundaries.mjs`: the resolution-mode pattern the new `verify:schemas` guard must copy (the implied-mode argument is load-bearing)
