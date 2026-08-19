# Composition Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the composition catalog: a derived ingredient layer, authored surface/invariant records, the drift lint that keeps the authored layer honest, the scenario deck with an acceptance-pack skeleton, and `component_reference` re-platformed onto the catalog.

**Architecture:** Two layers under `packages/ui/src/agent-tooling/catalog/`. The derived layer is a generated, committed JSON artifact (`derived.json`) produced by `scripts/gen-catalog.mjs` inside the `build:api` chain and guarded by `verify:generated`. The authored layer is zod-validated TS records (scenarios, invariants, inventory, surface recipes) whose every reference must resolve against the derived layer and the tree, enforced by `scripts/lint-catalog-drift.mjs` in the required CI `test` job.

**Tech Stack:** TypeScript, zod (already a dependency, `^4.4.3`), esbuild (already used by `verify-scaffold-compiles.mjs` to import TS registries from `.mjs` scripts), the TypeScript compiler API (already used by `lint-silent-drops.mjs`), vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-composition-catalog-design.md` (read it first). This plan follows the spec's §7 build order with **one deliberate deviation**: §7 item 1 pairs the scenario deck with the harness skeleton, and this plan splits them (deck in Task 1, harness in Task 8) because the packer has nothing to pack until the derived layer and the authored records exist. The deck still comes first, which is what item 1 is for. §7 item 6, iterating under acceptance runs, is ongoing work that follows this plan rather than a task inside it. All narrowings are collected in "Deviations from the spec" at the end; read it before executing.

## Global Constraints

- **Fresh worktree ritual, in this exact order, before any test run:** `pnpm install`, then `pnpm --filter @kitn.ai/ui run build:css`, then `pnpm exec nx build ui`. Skipping any one makes the suite fail in ways that read like a broken checkout.
- Always `pnpm exec nx`, never bare `nx` (not on PATH in non-interactive shells). Never mask an exit code behind `|| echo` or a pipe; report real exit codes.
- Unit tests: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit <path>`. Typecheck: `pnpm --filter @kitn.ai/ui run typecheck` (run from repo root; do not use the cached `nx typecheck ui` verdict).
- Do NOT edit `docs/coupling-map.md`, root `CLAUDE.md`, or any `docs/superpowers/HANDOFF-*.md`. If your task closes a coupling or adds a guard, name the affected row in the PR body instead.
- No hand-typed number a script can produce, anywhere (code, comments, docs). Name the command that prints it.
- Every new check must be WATCHED FAILING before it is trusted. Each task that adds a check has an explicit red step; do not skip it, and record the red output in your report.
- Derive, don't type: part variants come from the `MessagePart` union via the shared helper (Task 2); integrations and capability groups come from the TS registries via esbuild-import (the `loadCatalogAxes` pattern in `packages/ui/scripts/verify-scaffold-compiles.mjs:1902`); element facts come from `element-meta.json`.
- Conventional commit messages, each ending with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Never touch any `package.json` `version` field (release-please owns versions).

---

### Task 1: Catalog schema module and the scenario deck

**Files:**
- Create: `packages/ui/src/agent-tooling/catalog/catalog-types.ts`
- Create: `packages/ui/src/agent-tooling/catalog/scenarios.ts`
- Test: `packages/ui/src/agent-tooling/catalog/scenarios.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the zod schemas `SurfaceArchetype`, `DeliveryTarget`, `WireReader`, `Backend`, `EnforcedBy`, `Invariant`, `WiringEdge`, `SurfaceRecipe`, `InventoryEntry`, `PartConsumption`, `Scenario`, `DerivedCatalog`, `DerivedElement`, `EventException`; the inferred types `TInvariant`, `TSurfaceRecipe`, `TScenario`, `TInventoryEntry`, `TPartConsumption`, `TDerivedCatalog`; `export const scenarios: TScenario[]` and `export function listScenarios(): TScenario[]` (parse-validated). Tasks 3–9 import these names exactly.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/catalog/scenarios.test.ts
import { describe, expect, it } from 'vitest';
import { Scenario } from './catalog-types';
import { listScenarios, scenarios } from './scenarios';

describe('scenario deck', () => {
  it('carries exactly S1 through S7, in order', () => {
    expect(scenarios.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
  });

  it('every scenario parses against the schema and has non-empty needs and scoring', () => {
    for (const s of listScenarios()) {
      expect(() => Scenario.parse(s)).not.toThrow();
      expect(s.needs.length).toBeGreaterThan(0);
      expect(s.scoring.length).toBeGreaterThan(0);
    }
  });

  it('S6 is the refusal scenario: its scoring demands a loud refusal, not output', () => {
    const s6 = listScenarios().find((s) => s.id === 'S6');
    expect(s6?.scoring.join(' ')).toMatch(/refus/i);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog/scenarios.test.ts`
Expected: FAIL, cannot resolve `./catalog-types` / `./scenarios`.

- [ ] **Step 3: Write `catalog-types.ts`**

```ts
// packages/ui/src/agent-tooling/catalog/catalog-types.ts
import { z } from 'zod';

/** Surface changes appearance; target changes delivery. Two axes, never one. */
export const SurfaceArchetype = z.enum(['full-screen', 'widget', 'docked', 'inline', 'platform-embed']);
export const DeliveryTarget = z.enum(['bundler', 'script-tag']);

/** The three readers `src/wire/read.ts` exports. The drift lint (Task 7) resolves them. */
export const WireReader = z.enum(['readModelStream', 'readOpenAIStream', 'readAnthropicStream']);

/** BYO key: the endpoint is always the consumer's own. One swappable field by design. */
export const Backend = z.object({
  endpoint: z.literal('consumer-owned'),
  reader: WireReader,
});

/**
 * Tagged, because a bare path cannot honestly describe every invariant:
 * `none` is a REPORTED coverage gap, never a failure and never a fake path.
 */
export const EnforcedBy = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('test'), paths: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal('lint'), script: z.string() }),
  z.object({ kind: z.literal('structural'), path: z.string() }),
  z.object({ kind: z.literal('none'), until: z.string().optional() }),
]);

export const Diagnosis = z.object({ symptom: z.string(), cause: z.string() });

export const Invariant = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  statement: z.string().min(1),
  appliesTo: z.object({
    tags: z.array(z.string()).optional(),
    parts: z.array(z.string()).optional(),
    targets: z.array(DeliveryTarget).optional(),
  }),
  enforcedBy: EnforcedBy,
  status: z.enum(['enforced', 'open']),
  diagnosis: z.array(Diagnosis).default([]),
});

/** One host-coordinates edge: this event on A sets this property on B. */
export const WiringEdge = z.object({
  from: z.string(),
  event: z.string(),
  to: z.string(),
  property: z.string(),
  note: z.string().optional(),
});

export const SurfaceRecipe = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  intent: z.string().min(1),
  archetypes: z.array(SurfaceArchetype).min(1),
  targets: z.array(DeliveryTarget).min(1),
  ingredients: z.array(z.string()).min(1),
  backend: Backend,
  wiring: z.array(WiringEdge),
  invariants: z.array(z.string()).min(1),
  corpus: z.array(z.string()).min(1),
});

export const InventorySort = z.enum(['surface', 'ingredient', 'corpus']);
export const InventoryEntry = z.object({
  title: z.string().min(1),
  sort: InventorySort,
  note: z.string().min(1),
});

export const ScenarioId = z.enum(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
export const Scenario = z.object({
  id: ScenarioId,
  prompt: z.string().min(1),
  needs: z.array(z.string()).min(1),
  depth: z.string().min(1),
  scoring: z.array(z.string()).min(1),
});

/** The derived layer's committed artifact. Task 3's generator writes it; Task 3's test parses it. */
export const DerivedElement = z.object({
  tag: z.string(),
  props: z.array(z.object({ name: z.string(), scalar: z.boolean(), optional: z.boolean() })),
  events: z.array(z.string()),
  methods: z.array(z.string()),
  parts: z.array(z.string()),
  /** Spec §3 names both; element-meta.json already carries them. */
  composedFrom: z.array(z.string()),
  tokens: z.array(z.string()),
});

/**
 * Which MessagePart variants an element consumes. NOT derivable from any type
 * today, so spec §3's registered-copy rule applies: this is an explicit copy,
 * and Task 7's drift lint fails when the union gains a variant no record
 * accounts for. Registered in "Copies this plan creates" at the end of the plan.
 */
export const PartConsumption = z.object({
  tag: z.string(),
  consumes: z.array(z.string()).min(1),
});

export const EventException = z.object({
  file: z.string(),
  event: z.string(),
  bubbles: z.boolean(),
  composed: z.boolean(),
});

export const DerivedCatalog = z.object({
  elements: z.array(DerivedElement).min(1),
  // REGISTERED COPY: this floor restates MIN_VARIANTS, which lives in
  // scripts/lib/message-part-variants.mjs (Task 2) and cannot be imported into a
  // .ts module that also runs in the browser bundle. The generator asserts the
  // real MIN_VARIANTS; this is the schema-side backstop. If MIN_VARIANTS moves,
  // move this too — see "Copies this plan creates".
  partVariants: z.array(z.string()).min(4),
  integrations: z.array(z.object({ id: z.string(), category: z.string(), streamFormat: z.string(), keyExposure: z.string() })).min(1),
  capabilityGroups: z.array(z.object({ id: z.string(), components: z.array(z.string()) })).min(1),
  themeTokens: z.array(z.string()).min(1),
  // .min(1) because the tree HAS protocol exceptions (measured: two). An empty
  // array means the extractor broke, and a broken extractor that parses clean
  // would silently gut spec §5's exception list.
  eventExceptions: z.array(EventException).min(1),
});

export type TInvariant = z.infer<typeof Invariant>;
export type TSurfaceRecipe = z.infer<typeof SurfaceRecipe>;
export type TScenario = z.infer<typeof Scenario>;
export type TInventoryEntry = z.infer<typeof InventoryEntry>;
export type TPartConsumption = z.infer<typeof PartConsumption>;
export type TDerivedCatalog = z.infer<typeof DerivedCatalog>;
```

- [ ] **Step 4: Write `scenarios.ts`**

The seven prompts and their `needs`/`depth`/`scoring` come from spec §6's table; copy the substance, not new inventions. Full content:

```ts
// packages/ui/src/agent-tooling/catalog/scenarios.ts
import { z } from 'zod';
import { Scenario, type TScenario } from './catalog-types';

/**
 * The acceptance deck, spec §6. Normative: written BEFORE the catalog so the
 * catalog is built toward a measurement. The harness gives an agent the catalog
 * and NO kit source; whatever it cannot build names what the catalog is missing.
 */
export const scenarios: TScenario[] = [
  {
    id: 'S1',
    prompt:
      'I already have <kai-chat> in my React app. Add a conversations sidebar and let assistant replies open artifacts in a side panel.',
    needs: ['composition validity', 'wiring topology', 'invariant:reactivity-two-halves'],
    depth: 'surface recipe applied to an existing tree',
    scoring: [
      'emitted code compiles under the react consumer tsc project',
      'kai-conversations and kai-artifact register and render',
      'kai-conversation-select wiring updates kai-chat.messages with a new array AND new changed-item objects',
    ],
  },
  {
    id: 'S2',
    prompt:
      'Add an AI chat to this Vue app. Messages stream from our existing /api/chat endpoint that speaks OpenAI SSE.',
    needs: ['ingredient contracts', 'invariant:kit-parses-consumer-fetches', 'backend: consumer-owned endpoint'],
    depth: 'greenfield, contract',
    scoring: [
      'imports readOpenAIStream from @kitn.ai/ui/wire; no hand-rolled SSE reader anywhere in the output',
      'streams correctly against a mock OpenAI-SSE wire fixture',
      'compiles under the vue consumer path',
    ],
  },
  {
    id: 'S3',
    prompt: 'Give the prompt input slash-commands and voice, like your command palette demo.',
    needs: ['ingredient configuration space', 'function-valued property contract (transcribe)'],
    depth: 'capability',
    scoring: [
      'transcribe is set as a function-valued JS property, not an attribute',
      'the slash-command trigger is wired per the ingredient contract',
    ],
  },
  {
    id: 'S4',
    prompt: 'Build me a Perplexity-style research UI: sources, reasoning panel, follow-up suggestions.',
    needs: ['surface recipes'],
    depth: 'whole surface; expected to fail hardest first',
    scoring: ['human eyeball against the perplexity Labs/App story', 'compiles and registers'],
  },
  {
    id: 'S5',
    prompt:
      "I'm on WordPress. No build step. Give me a script tag for a support chat widget that talks to my service at https://example.com/chat.",
    needs: ['delivery target: script-tag', 'invariant:upgrade-race', 'widget recipe', 'backend: consumer-owned endpoint'],
    depth: 'platform embed',
    scoring: [
      'script-tag only, no bundler assumed',
      'the output acknowledges the upgrade race per the open invariant (props set after registration, or the documented gate)',
      'human eyeball in a plain HTML page',
    ],
  },
  {
    id: 'S6',
    prompt: 'Add a spreadsheet-grid message type showing live cell edits.',
    needs: ['the honesty bound: refuse what is not composable from these parts'],
    depth: 'refusal',
    scoring: [
      'the agent refuses loudly, naming that no such element exists, instead of inventing <kai-datagrid>',
      'no fabricated tag appears in the output',
    ],
  },
  {
    id: 'S7',
    prompt: 'My messages render but nothing updates while streaming.',
    needs: ['invariant diagnosis fields'],
    depth: 'debugging',
    scoring: [
      'the answer identifies the reactivity-two-halves cause: same array reference, or same item object identity',
      'the fix it proposes matches the invariant statement',
    ],
  },
];

export function listScenarios(): TScenario[] {
  return z.array(Scenario).parse(scenarios);
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog/scenarios.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @kitn.ai/ui run typecheck`
Expected: exit 0.

- [ ] **Step 7: Write the pre-development cross-check**

This is spec §6's "before development" half, and it is the reason the deck is written first: the owner asked for the deck to check *whether the plan is focusing on the right things before any development*. Create `docs/superpowers/notes/2026-08-17-catalog-cross-check.md` with two tables, filled in by reading this plan's Tasks 5 and 6 against `scenarios.ts`:

- **Scenarios addressed by no catalog data** — for each of S1–S7, name the catalog data this plan actually builds that carries it, or write NOTHING. Do this analysis yourself against the task list; do not transcribe. As a check on your METHOD rather than an answer to copy: if your analysis does not surface at least that **S4 has no recipe** (no research-UI recipe is planned; it is the depth-3 scenario the spec says should fail hardest first), re-check it, because that gap is visible from Task 6's content alone and a method that misses it will miss the ones nobody has spotted.
- **Catalog data exercised by no scenario** — for each schema field, invariant and record type, name the scenario that exercises it, or write NOTHING. **This table is genuinely open**: nobody has worked it through, and it is where the speculative surface will show up. Anything with NOTHING here is a field that exists because it seemed useful, and it should be justified or cut.

Then write a short "What this changes" paragraph. The point of the artifact is that it is allowed to say the plan is wrong; if it finds a gap that should change a task, change the task rather than filing the finding away.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/agent-tooling/catalog/ docs/superpowers/notes/2026-08-17-catalog-cross-check.md
git commit -m "feat(catalog): schema module, the scenario deck, and the pre-development cross-check

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract the MessagePart-variant reader into a shared helper

**Files:**
- Create: `packages/ui/scripts/lib/message-part-variants.mjs`
- Modify: `packages/ui/scripts/lint-silent-drops.mjs` (delete its local `readVariants`, lines ~95–126, import the helper instead)

**Interfaces:**
- Consumes: nothing.
- Produces: `readVariants(text: string): string[]` and `MIN_VARIANTS` (the number `4`) from `scripts/lib/message-part-variants.mjs`. Task 3's generator imports both.

- [ ] **Step 1: Create the helper by MOVING the existing function**

Copy `readVariants` verbatim from `packages/ui/scripts/lint-silent-drops.mjs` (the function reading the `MessagePart` type-alias union via the TypeScript compiler API) into the new file, with its own imports and the parse inlined:

```js
// packages/ui/scripts/lib/message-part-variants.mjs
// The ONE derivation of the MessagePart variant list, shared by
// lint-silent-drops.mjs and gen-catalog.mjs so the two can never disagree.
import ts from 'typescript';

export const UNION_NAME = 'MessagePart';

// A parse that yields fewer than this many variants means the declaration moved
// or changed shape and the caller is reading something else.
export const MIN_VARIANTS = 4;

/** The declared variant literals of `MessagePart`, read from the type itself so
 *  a new member is picked up with no edit here. */
export function readVariants(text) {
  const sf = ts.createSourceFile('chat-types.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === UNION_NAME && ts.isUnionTypeNode(node.type)) {
      for (const member of node.type.types) {
        if (!ts.isTypeLiteralNode(member)) continue;
        for (const prop of member.members) {
          if (
            ts.isPropertySignature(prop) &&
            prop.name &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'type' &&
            prop.type &&
            ts.isLiteralTypeNode(prop.type) &&
            ts.isStringLiteral(prop.type.literal)
          ) {
            found.push(prop.type.literal.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}
```

- [ ] **Step 2: Point `lint-silent-drops.mjs` at the helper**

In `packages/ui/scripts/lint-silent-drops.mjs`: add `import { readVariants, MIN_VARIANTS as SHARED_MIN_VARIANTS } from './lib/message-part-variants.mjs';`, delete the local `readVariants` function, and replace the local `const MIN_VARIANTS = 4;` with `const MIN_VARIANTS = SHARED_MIN_VARIANTS;`. Do not change any other logic. The local `parse` helper stays (other code in the file uses it).

- [ ] **Step 3: Pin the extraction itself, before and after the move**

**Do not rely on `--self-test` to prove this refactor.** It cannot: the self-test branch drives `analyze()` with hard-coded fixture variants and `process.exit(0)`s at `lint-silent-drops.mjs:475`, which is BEFORE `readVariants` is first called at line 485. A `readVariants` that returned `['1','2','3','4']` still passes the self-test 10/10 with exit 0. The self-test is a real check of the analyzer and no check at all of the extraction.

So pin the extraction directly. **Before** starting Step 1, write this probe to your scratch directory (not the repo) and run it with `node`, from inside `packages/ui` so `typescript` resolves:

```js
// scratch/probe-variants.mjs — run before AND after the move; outputs must be identical.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const UNION_FILE = 'src/elements/chat-types.ts';
// paste the CURRENT readVariants body here before the move; import the shared
// helper after the move: import { readVariants } from './scripts/lib/message-part-variants.mjs'
const v = readVariants(readFileSync(UNION_FILE, 'utf8'));
console.log(`${v.length} variants: ${JSON.stringify(v)}`);
```

Expected output, identical before and after (measured on this tree at the time of writing):

```
6 variants: ["text","reasoning","tool","card","source","file"]
```

If the after-output differs in length or order, the move broke the extraction; fix it before continuing. Record both outputs in your report.

- [ ] **Step 4: Confirm the analyzer still discriminates and the real run is clean**

Run: `node packages/ui/scripts/lint-silent-drops.mjs --self-test`
Expected: exit 0, seeded defects still DETECTED. (This proves the analyzer, not the extraction; Step 3 is what proves the extraction.)
Then run: `pnpm --filter @kitn.ai/ui run lint:silent-drops`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/scripts/lib/message-part-variants.mjs packages/ui/scripts/lint-silent-drops.mjs
git commit -m "refactor(scripts): one shared MessagePart-variant derivation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: The derived-layer generator

**Files:**
- Create: `packages/ui/scripts/gen-catalog.mjs`
- Create (generated, committed): `packages/ui/src/agent-tooling/catalog/derived.json`
- Modify: `packages/ui/package.json` (add `esbuild` to devDependencies)
- Test: `packages/ui/tests/scripts/catalog-derived.test.ts`

**Interfaces:**
- Consumes: `readVariants`, `MIN_VARIANTS` from `scripts/lib/message-part-variants.mjs` (Task 2); `DerivedCatalog` from `catalog-types.ts` (Task 1).
- Produces: `packages/ui/src/agent-tooling/catalog/derived.json` matching `DerivedCatalog`. **Task 7's lint reads it with `readFileSync` + `JSON.parse` (it is a `.mjs` script); Task 8's packer and Task 6's part-consumption test read it the same way; Task 9 does not read it at all.** No task imports it as a module.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/tests/scripts/catalog-derived.test.ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DerivedCatalog } from '../../src/agent-tooling/catalog/catalog-types';

const PKG = join(__dirname, '..', '..');
const ARTIFACT = join(PKG, 'src/agent-tooling/catalog/derived.json');

describe('derived catalog artifact', () => {
  it('exists, parses against DerivedCatalog, and derives from the tree', () => {
    const derived = DerivedCatalog.parse(JSON.parse(readFileSync(ARTIFACT, 'utf8')));
    const meta = JSON.parse(readFileSync(join(PKG, 'src/elements/element-meta.json'), 'utf8'));
    // Same element set as element-meta.json, no more, no less.
    expect(derived.elements.map((e) => e.tag).sort()).toEqual(meta.map((m: { tag: string }) => m.tag).sort());
    // Elements carry the spec §3 fields.
    expect(derived.elements.some((e) => e.composedFrom.length > 0)).toBe(true);
    expect(derived.elements.some((e) => e.tokens.length > 0)).toBe(true);
  });

  it('the protocol exceptions are extracted exactly, deduped', () => {
    const derived = DerivedCatalog.parse(JSON.parse(readFileSync(ARTIFACT, 'utf8')));
    expect(derived.eventExceptions).toEqual([
      { file: 'src/elements/artifact.tsx', event: 'kai-maximize-intent', bubbles: true, composed: true },
      { file: 'src/elements/resizable.tsx', event: 'kai-maximize-state', bubbles: false, composed: true },
    ]);
  });

  it('regenerating changes nothing (the committed artifact is current)', () => {
    const before = readFileSync(ARTIFACT, 'utf8');
    execFileSync('node', [join(PKG, 'scripts/gen-catalog.mjs')], { stdio: 'pipe' });
    const after = readFileSync(ARTIFACT, 'utf8');
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/catalog-derived.test.ts`
Expected: FAIL (no `derived.json`, no generator).

- [ ] **Step 3: Write the generator**

```js
// packages/ui/scripts/gen-catalog.mjs
// Emits src/agent-tooling/catalog/derived.json: the catalog's derived
// ingredient layer. Runs inside build:api so verify:generated regenerates and
// diffs it (the element-manifest lesson: the guard must invoke the script that
// writes the artifact).
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as esbuild from 'esbuild';
import { readVariants, MIN_VARIANTS } from './lib/message-part-variants.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/agent-tooling/catalog/derived.json');

function fail(msg) {
  console.error(`✗ gen-catalog: ${msg}`);
  process.exit(1);
}

async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'gen-catalog-'));
  const bundle = join(tmp, 'bundle.mjs');
  await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

// 1. Elements, from the generated meta (build:api runs gen-element-api first).
const meta = JSON.parse(readFileSync(join(ROOT, 'src/elements/element-meta.json'), 'utf8'));
const elements = meta
  .map((e) => ({
    tag: e.tag,
    props: (e.props ?? []).map((p) => ({ name: p.name, scalar: p.scalar === true, optional: p.optional === true })),
    events: (e.events ?? []).map((v) => v.name),
    methods: (e.methods ?? []).map((m) => m.name),
    parts: (e.parts ?? []).map((p) => p.name),
    // composedFrom entries are objects ({ name, group, storyId }); tokens are
    // plain strings. Verified against element-meta.json; do not add defensive
    // coercion, a shape change should fail loudly here.
    composedFrom: (e.composedFrom ?? []).map((c) => c.name),
    tokens: e.tokens ?? [],
  }))
  .sort((a, b) => a.tag.localeCompare(b.tag));
if (elements.length === 0) fail('element-meta.json yielded zero elements.');

// 2. Part variants, from the union, via the ONE shared derivation.
const partVariants = readVariants(readFileSync(join(ROOT, 'src/elements/chat-types.ts'), 'utf8'));
if (partVariants.length < MIN_VARIANTS) fail(`union parse degraded: ${partVariants.length} variants.`);

// 3. Integrations and capability groups, esbuild-imported from the TS registries.
const registry = await importTs(join(ROOT, 'src/agent-tooling/registry.ts'));
const archetypes = await importTs(join(ROOT, 'src/agent-tooling/archetypes.ts'));
const integrations = registry.listIntegrations().map((i) => ({
  id: i.id, category: i.category, streamFormat: i.streamFormat, keyExposure: i.keyExposure,
}));
const capabilityGroups = archetypes.listCapabilityGroups();
if (integrations.length === 0) fail('registry lists no integrations.');
if (capabilityGroups.length === 0) fail('no capability groups derived.');

// 4. Theme tokens, resolved against the sheet.
const themeTokens = [...new Set(readFileSync(join(ROOT, 'theme.css'), 'utf8').match(/--kai-[a-z0-9-]+/g) ?? [])].sort();
if (themeTokens.length === 0) fail('no --kai-* tokens found in theme.css.');

// 5. Event exceptions: kai-* CustomEvents dispatched with bubbles/composed true
//    OUTSIDE define.tsx (the deliberate protocol events; everything else goes
//    through dispatch(), which hard-codes both false).
//
//    PARSED, NOT REGEXED, and the reason is measured rather than stylistic. The
//    obvious regex `new CustomEvent\(\s*'(kai-[a-z-]+)'\s*,\s*\{([^}]*)\}` emits
//    ZERO exceptions on this tree: `[^}]*` stops at the closing brace of the
//    NESTED `detail: { … }`, so the captured options text never contains
//    `bubbles`/`composed` at all. It does not throw and it does not warn; it
//    quietly reports that the kit has no protocol exceptions, which would gut
//    spec §5's exception list while parsing clean. The compiler API cannot be
//    defeated by formatting, and lint-silent-drops already sets the precedent.
function boolProp(objLit, key) {
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key) {
      if (p.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (p.initializer.kind === ts.SyntaxKind.FalseKeyword) return false;
    }
  }
  return undefined;
}

const elDir = join(ROOT, 'src/elements');
// Test and story files dispatch synthetic events; they are not the contract.
const NOT_SOURCE = /\.(test|stories)\.tsx$/;
const exceptionsByKey = new Map();
for (const f of readdirSync(elDir).filter((n) => n.endsWith('.tsx') && n !== 'define.tsx' && !NOT_SOURCE.test(n))) {
  const sf = ts.createSourceFile(f, readFileSync(join(elDir, f), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'CustomEvent' &&
      node.arguments?.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.startsWith('kai-')
    ) {
      const opts = node.arguments[1];
      if (opts && ts.isObjectLiteralExpression(opts)) {
        const bubbles = boolProp(opts, 'bubbles') === true;
        const composed = boolProp(opts, 'composed') === true;
        if (bubbles || composed) {
          // Deduped: resizable.tsx dispatches kai-maximize-state from three
          // sites with identical options. One event, one record.
          const rec = { file: `src/elements/${f}`, event: node.arguments[0].text, bubbles, composed };
          exceptionsByKey.set(`${rec.file}|${rec.event}|${rec.bubbles}|${rec.composed}`, rec);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
const eventExceptions = [...exceptionsByKey.values()].sort((a, b) => (a.file + a.event).localeCompare(b.file + b.event));
if (eventExceptions.length === 0) fail('zero event exceptions: the tree has protocol exceptions, so the extractor is broken.');

writeFileSync(OUT, JSON.stringify({ elements, partVariants, integrations, capabilityGroups, themeTokens, eventExceptions }, null, 2) + '\n');
console.log(`gen-catalog: wrote ${OUT} (${elements.length} elements, ${partVariants.length} part variants, ${integrations.length} integrations, ${eventExceptions.length} event exceptions)`);
```

- [ ] **Step 4: Add esbuild as a declared dependency**

`esbuild` is imported statically here (and in Tasks 7 and 8), and this script joins `build:api`, which `prepublishOnly` runs. It currently resolves only through the root `.npmrc`'s `node-linker=hoisted`, which is an accident of the workspace layout, not a declaration. Add it to `packages/ui`'s **devDependencies** (it is build-time only, never shipped): `pnpm --filter @kitn.ai/ui add -D esbuild`. Do not add it to dependencies.

- [ ] **Step 5: Run the generator, then the test; verify both pass**

Run: `node packages/ui/scripts/gen-catalog.mjs` (expect the summary line, exit 0)
Then: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/catalog-derived.test.ts`
Expected: PASS (3 tests).

**The `eventExceptions` array this emits, measured on this tree with exactly the extractor above:**

```json
[
  { "file": "src/elements/artifact.tsx", "event": "kai-maximize-intent", "bubbles": true, "composed": true },
  { "file": "src/elements/resizable.tsx", "event": "kai-maximize-state", "bubbles": false, "composed": true }
]
```

Two records, not four: `resizable.tsx` dispatches `kai-maximize-state` from three sites with identical options, deduped to one. If you get `[]`, the extractor regressed to text matching; if you get four, the dedupe is missing. Either way fix the generator, not the test.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @kitn.ai/ui run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit (generator + committed artifact + test + the esbuild declaration)**

```bash
git add packages/ui/scripts/gen-catalog.mjs packages/ui/src/agent-tooling/catalog/derived.json packages/ui/tests/scripts/catalog-derived.test.ts packages/ui/package.json
git commit -m "feat(catalog): derive the ingredient layer into a committed artifact

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the generator into `build:api` and `verify:generated`, red first

**Files:**
- Modify: `packages/ui/package.json` (the `build:api` script)
- Modify: `packages/ui/scripts/verify-generated-sync.mjs` (the `GENERATED` array)

**Interfaces:**
- Consumes: `scripts/gen-catalog.mjs` and `derived.json` (Task 3).
- Produces: `verify:generated` covering `derived.json`; `build:api` regenerating it.

- [ ] **Step 1: Add the artifact to the guard FIRST, and watch it fail**

In `packages/ui/scripts/verify-generated-sync.mjs`, add to the `GENERATED` array:

```js
  { file: 'packages/ui/src/agent-tooling/catalog/derived.json', probe: 'overwrite' },
```

Run: `pnpm --filter @kitn.ai/ui run verify:generated`
Expected: **FAIL.** The guard plants its sentinel in `derived.json`, runs `npm run build:api`, and the sentinel survives, because `build:api` does not yet invoke `gen-catalog.mjs`. This red is the element-manifest lesson demonstrated live: a guard entry without the generating script in the guard's own command is exactly the gap that let `element-manifest.json` sit uncovered. Record the failing output.
Then restore the artifact: `git checkout -- packages/ui/src/agent-tooling/catalog/derived.json`

- [ ] **Step 2: Add the generator to `build:api`, and watch the guard pass**

In `packages/ui/package.json`, change the `build:api` script from:

```
node scripts/gen-elements-manifest.mjs && node scripts/gen-element-api.mjs
```

to:

```
node scripts/gen-elements-manifest.mjs && node scripts/gen-element-api.mjs && node scripts/gen-catalog.mjs
```

Run: `pnpm --filter @kitn.ai/ui run verify:generated`
Expected: PASS (self-test first, then the real run; both green).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/package.json packages/ui/scripts/verify-generated-sync.mjs packages/ui/src/agent-tooling/catalog/derived.json
git commit -m "feat(catalog): derived.json under verify:generated, generator in build:api

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(If `derived.json` changed byte-for-byte in step 2's regeneration, commit the regenerated version; the guard requires the committed state to be current.)

---

### Task 5: The invariant records

**Files:**
- Create: `packages/ui/src/agent-tooling/catalog/invariants.ts`
- Test: `packages/ui/src/agent-tooling/catalog/invariants.test.ts`

**Interfaces:**
- Consumes: `Invariant`, `TInvariant` from `catalog-types.ts` (Task 1).
- Produces: `export const invariants: TInvariant[]` and `export function listInvariants(): TInvariant[]` (parse-validated). Tasks 6, 7, 8, 9 reference invariant IDs exactly as spelled here: `reactivity-two-halves`, `props-not-attributes`, `events-non-bubbling`, `host-coordinates`, `untrusted-model-output`, `kit-parses-consumer-fetches`, `upgrade-race`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/catalog/invariants.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Invariant } from './catalog-types';
import { invariants, listInvariants } from './invariants';

const PKG = join(__dirname, '..', '..', '..');
const REPO = join(PKG, '..', '..');

describe('invariant records', () => {
  it('carries the seven seed invariants from spec §5', () => {
    expect(invariants.map((i) => i.id).sort()).toEqual([
      'events-non-bubbling',
      'host-coordinates',
      'kit-parses-consumer-fetches',
      'props-not-attributes',
      'reactivity-two-halves',
      'untrusted-model-output',
      'upgrade-race',
    ]);
  });

  it('every record parses; every enforcedBy pointer resolves against the tree', () => {
    for (const inv of listInvariants()) {
      expect(() => Invariant.parse(inv)).not.toThrow();
      const e = inv.enforcedBy;
      if (e.kind === 'test' || e.kind === 'structural') {
        for (const p of e.kind === 'test' ? e.paths : [e.path]) {
          expect(existsSync(join(REPO, p)), `${inv.id}: ${p} does not exist`).toBe(true);
        }
      }
      if (e.kind === 'lint') {
        const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
        expect(pkg.scripts[e.script], `${inv.id}: no script ${e.script}`).toBeDefined();
      }
    }
  });

  it('open status and enforcedBy none travel together', () => {
    for (const inv of listInvariants()) {
      expect(inv.status === 'open').toBe(inv.enforcedBy.kind === 'none');
    }
  });

  it('upgrade-race stays open until #99 option B, and says so', () => {
    const race = listInvariants().find((i) => i.id === 'upgrade-race');
    expect(race?.status).toBe('open');
    expect(race?.enforcedBy).toEqual({ kind: 'none', until: 'issue #99 option B lands in defineWebComponent' });
  });
});
```

Note the paths convention this test fixes: `test`/`structural` paths are **repo-relative** (they may point outside `packages/ui`, e.g. at a root doc), `lint` scripts are names in `packages/ui/package.json`.

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog/invariants.test.ts`
Expected: FAIL, cannot resolve `./invariants`.

- [ ] **Step 3: Write `invariants.ts`**

Statements come from spec §5's table; they are the prose an agent applies, so keep them complete sentences. Full content:

```ts
// packages/ui/src/agent-tooling/catalog/invariants.ts
import { z } from 'zod';
import { Invariant, type TInvariant } from './catalog-types';

/** Spec §5. Every one already known to break real consumers. */
export const invariants: TInvariant[] = [
  {
    id: 'reactivity-two-halves',
    statement:
      'A new array reference NOTIFIES; a new object for each changed item makes the change VISIBLE. Editing an existing item needs both. Adds, removes and reorders need only the fresh array. Setting the same array back is a no-op even if an item inside it was swapped.',
    appliesTo: { tags: ['kai-chat', 'kai-conversations'] },
    enforcedBy: { kind: 'test', paths: ['packages/ui/src/components/reactivity-contract.test.tsx'] },
    status: 'enforced',
    diagnosis: [
      { symptom: 'messages render once but never update while streaming', cause: 'the same array reference is being set back; the element is never notified' },
      { symptom: 'the list re-renders but an edited item shows stale content', cause: 'the array is new but the item object identity is unchanged; the reference-keyed <For> keeps the old row' },
    ],
  },
  {
    id: 'props-not-attributes',
    statement:
      'Arrays and objects are set as JS properties, never HTML attributes. Only scalars (strings, numbers, booleans) work as attributes. The scalar flag on every prop in the derived layer records which is which.',
    appliesTo: {},
    enforcedBy: { kind: 'structural', path: 'packages/ui/src/elements/define.tsx' },
    status: 'enforced',
    diagnosis: [
      { symptom: 'an element ignores its data entirely', cause: 'an array or object was passed as an attribute string; set it as a JS property on the element instance' },
    ],
  },
  {
    id: 'events-non-bubbling',
    statement:
      'Non-bubbling is the default: public kai-* events are dispatched through the one helper that hard-codes bubbles:false and composed:false, so listen on the element itself. The protocol exceptions (the maximize intent/state events) bubble or compose deliberately and are listed in the derived layer under eventExceptions.',
    appliesTo: {},
    enforcedBy: { kind: 'structural', path: 'packages/ui/src/elements/define.tsx' },
    status: 'enforced',
    diagnosis: [
      { symptom: 'a delegated listener on document or a parent never fires', cause: 'kai-* events do not bubble; attach the listener to the element that dispatches it' },
    ],
  },
  {
    id: 'host-coordinates',
    statement:
      'There is no store. Data flows in via properties, out via events, and the host wires element A to element B. Solid context does not cross element boundaries, so nothing coordinates elements except the host application.',
    appliesTo: {},
    enforcedBy: { kind: 'none' },
    status: 'open',
    diagnosis: [
      { symptom: 'two elements are expected to sync but do not', cause: 'nothing auto-coordinates; the host must listen on one element and set properties on the other' },
    ],
  },
  {
    id: 'untrusted-model-output',
    statement:
      'Everything the model produced is untrusted input. A MessagePart, card envelope or tool argument reaching innerHTML, an href or src, window.open or an iframe is a vulnerability. Put an existing policy on the sink (isSafeUrl/SAFE_SCHEMES for anything navigable, isRenderableLink for citations); never author a third policy.',
    appliesTo: {},
    enforcedBy: {
      kind: 'test',
      paths: [
        'packages/ui/tests/components/markdown-xss.test.tsx',
        'packages/ui/tests/components/artifact-url-xss.test.tsx',
        'packages/ui/tests/components/hostile-model-output.test.tsx',
      ],
    },
    status: 'enforced',
    diagnosis: [],
  },
  {
    id: 'kit-parses-consumer-fetches',
    statement:
      'Never hand-roll an SSE reader: import readOpenAIStream, readAnthropicStream or readModelStream from @kitn.ai/ui/wire. The kit parses; the consumer fetches. There is no client, no key handling and no provider SDK below wire/.',
    appliesTo: {},
    enforcedBy: { kind: 'lint', script: 'lint:silent-drops' },
    status: 'enforced',
    diagnosis: [
      { symptom: 'streaming works for one provider and silently drops parts for another', cause: 'a hand-rolled reader misses part variants the wire layer already handles; replace it with the wire import' },
    ],
  },
  {
    id: 'upgrade-race',
    statement:
      'A property set before the element upgrades is lost. On script-tag targets, load order is not ours. Until issue #99 option B (upgrade-property preservation in defineWebComponent) lands, every script-tag recipe must state this race loudly and set properties after registration.',
    appliesTo: { targets: ['script-tag'] },
    enforcedBy: { kind: 'none', until: 'issue #99 option B lands in defineWebComponent' },
    status: 'open',
    diagnosis: [
      { symptom: 'properties set in inline script are ignored on a CDN page', cause: 'the element had not upgraded yet; the set landed on a plain HTMLElement and was lost' },
    ],
  },
];

export function listInvariants(): TInvariant[] {
  return z.array(Invariant).parse(invariants);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog/invariants.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck, then commit**

Run: `pnpm --filter @kitn.ai/ui run typecheck` (expect exit 0), then:

```bash
git add packages/ui/src/agent-tooling/catalog/invariants.ts packages/ui/src/agent-tooling/catalog/invariants.test.ts
git commit -m "feat(catalog): the seven seed invariants as tagged records

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: The authored inventory, two recipes, and the part-consumption copy

**Files:**
- Create: `packages/ui/src/agent-tooling/catalog/surfaces.ts`
- Test: `packages/ui/src/agent-tooling/catalog/surfaces.test.ts`

**Interfaces:**
- Consumes: `SurfaceRecipe`, `InventoryEntry`, `PartConsumption` and their inferred types from `catalog-types.ts` (Task 1, unmodified by this task); invariant IDs (Task 5); `derived.json` (Task 3), read by the part-consumption test.
- Produces: `export const inventory: TInventoryEntry[]`, `export const surfaceRecipes: TSurfaceRecipe[]`, `export const partConsumption: TPartConsumption[]`, and the parse-validated accessors `listSurfaceRecipes()`, `listInventory()`, `listPartConsumption()`. **Task 7's lint and Task 8's packer call the accessors, never the raw literals**, so a schema-invalid record fails CI instead of sailing through. Task 9 serves the recipes.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/catalog/surfaces.test.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InventoryEntry, SurfaceRecipe } from './catalog-types';
import { inventory, listInventory, listSurfaceRecipes, partConsumption, surfaceRecipes } from './surfaces';

describe('authored surface layer', () => {
  it('inventory parses and sorts every entry into surface / ingredient / corpus', () => {
    expect(inventory.length).toBeGreaterThan(0);
    for (const entry of listInventory()) expect(() => InventoryEntry.parse(entry)).not.toThrow();
  });

  it('every Labs/Apps story file is sorted as a surface, derived from the tree', () => {
    // Derived, not listed: the nine app names come from the story files
    // themselves, so adding an app makes this fail until it is sorted.
    const elDir = join(__dirname, '..', '..', 'elements');
    const appFiles = readdirSync(elDir).filter(
      (f) => f.endsWith('.stories.tsx') && readFileSync(join(elDir, f), 'utf8').includes("title: 'Labs/Apps'"),
    );
    expect(appFiles.length).toBeGreaterThan(0);
    const surfaces = new Set(inventory.filter((e) => e.sort === 'surface').map((e) => e.title));
    for (const f of appFiles) {
      expect(surfaces.has(f.replace('.stories.tsx', '')), `${f} is not sorted as a surface`).toBe(true);
    }
  });

  it('Proofs and the slot fixtures are corpus', () => {
    for (const t of ['Proofs', 'Chat Slots', 'Prompt Input Slots', 'Workspace Slots']) {
      expect(inventory.find((e) => e.title === t)?.sort).toBe('corpus');
    }
  });

  it('part-consumption records cover every MessagePart variant in the union', () => {
    // Variants come from derived.json, which gen-catalog.mjs wrote using the ONE
    // shared readVariants (Task 2). Deliberately NOT a second regex over
    // chat-types.ts: this plan argues the extraction must be parsed, not matched,
    // and a test that re-derives it by hand would be exactly the copy the
    // catalog exists to eliminate.
    const derived = JSON.parse(readFileSync(join(__dirname, 'derived.json'), 'utf8'));
    expect(derived.partVariants.length).toBeGreaterThan(0);
    const covered = new Set(partConsumption.flatMap((p) => p.consumes));
    for (const variant of derived.partVariants) {
      expect(covered.has(variant), `no part-consumption record covers '${variant}'`).toBe(true);
    }
  });

  it('every recipe parses, and both delivery targets have an instance', () => {
    expect(surfaceRecipes.length).toBeGreaterThan(0);
    for (const r of listSurfaceRecipes()) expect(() => SurfaceRecipe.parse(r)).not.toThrow();
    const targets = new Set(surfaceRecipes.flatMap((r) => r.targets));
    expect(targets.has('bundler')).toBe(true);
    expect(targets.has('script-tag')).toBe(true);
  });

  it('the script-tag recipe carries the upgrade-race invariant', () => {
    const widget = listSurfaceRecipes().find((r) => r.id === 'support-widget-script-tag');
    expect(widget?.invariants).toContain('upgrade-race');
  });

  it('the exemplar recipe wires conversations into chat per the host-coordinates model', () => {
    const r = listSurfaceRecipes().find((x) => x.id === 'workspace-chat');
    expect(r?.wiring).toContainEqual(
      expect.objectContaining({ from: 'kai-conversations', event: 'kai-conversation-select', to: 'kai-chat', property: 'messages' }),
    );
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog/surfaces.test.ts`
Expected: FAIL, cannot resolve `./surfaces`.

- [ ] **Step 3: Write `surfaces.ts`**

The inventory rows are spec §4's sort table verbatim (it was reviewed by the owner in PR #276); one entry per row, apps split out so each is checkable. **Write both recipes**: `workspace-chat` (bundler) and `support-widget-script-tag` (script-tag). Two is the minimum that instances both delivery targets and every invariant including `upgrade-race`, and Step 1's test asserts exactly that. Recipes beyond these two land through acceptance-run iteration (spec §7 item 6), each proven against a scenario first, rather than being authored blind here. Full content:

```ts
// packages/ui/src/agent-tooling/catalog/surfaces.ts
import { z } from 'zod';
import { InventoryEntry, SurfaceRecipe, type TInventoryEntry, type TSurfaceRecipe } from './catalog-types';

/**
 * Spec §4's sort, as records. Criterion: a surface is product-shaped, something
 * a user could be handed, proven end-to-end by a Labs/App or deployable alone;
 * an ingredient exists only inside something else; fixtures and proofs are
 * corpus (tests), not catalog entries.
 */
export const inventory: TInventoryEntry[] = [
  { title: 'claude-code', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 'chatgpt', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 'codex', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 't3code', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 'perplexity', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 'perplexity-pro', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 'v0', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 'lovable', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 'split-workspace', sort: 'surface', note: 'Labs/App, end-to-end composition' },
  { title: 'Workspace Home', sort: 'surface', note: 'the workspace preset' },
  { title: 'Message Thread', sort: 'ingredient', note: 'the keystone of the composition-first direction (kai-thread)' },
  { title: 'Composer', sort: 'ingredient', note: 'rich input, lives inside a surface' },
  { title: 'Command', sort: 'ingredient', note: 'palette, summoned inside something' },
  { title: 'Menu', sort: 'ingredient', note: 'menu primitive' },
  { title: 'User Menu', sort: 'ingredient', note: 'account affordance inside a surface' },
  { title: 'Settings', sort: 'ingredient', note: 'a panel, not a product' },
  { title: 'Onboarding checklist', sort: 'ingredient', note: 'lives inside a surface' },
  { title: 'Conversations Collapse', sort: 'ingredient', note: 'behavior of a part' },
  { title: 'Resizable Collapsed', sort: 'ingredient', note: 'behavior of a part' },
  { title: 'Audio Visualizers', sort: 'ingredient', note: 'voice affordance inside a surface' },
  { title: 'Card', sort: 'ingredient', note: 'generative-UI cards arrive as tool calls (settled)' },
  { title: 'Foundations', sort: 'ingredient', note: 'atoms: Input, Search, Kbd, Nav, Tabs, Status, Screen, Progress Bar, Coachmark, EditableLabel, Voice output' },
  { title: 'Chat Slots', sort: 'corpus', note: 'fixture proving kai-chat injection seams' },
  { title: 'Prompt Input Slots', sort: 'corpus', note: 'fixture proving prompt-input seams' },
  { title: 'Workspace Slots', sort: 'corpus', note: 'fixture proving workspace injection seams' },
  { title: 'Proofs', sort: 'corpus', note: 'tests by construction' },
];

/**
 * Two recipes: one per delivery target. Between them they instance every
 * invariant, which is what makes the drift lint's checks non-vacuous. Further
 * recipes are added through acceptance-run iteration, each proven against a
 * scenario before it lands.
 */
export const surfaceRecipes: TSurfaceRecipe[] = [
  {
    id: 'workspace-chat',
    intent:
      'Full-screen chat with a conversations sidebar; assistant replies can open artifacts in a resizable side panel.',
    archetypes: ['full-screen'],
    targets: ['bundler'],
    ingredients: ['kai-chat', 'kai-conversations', 'kai-resizable', 'kai-artifact'],
    backend: { endpoint: 'consumer-owned', reader: 'readModelStream' },
    wiring: [
      {
        from: 'kai-conversations',
        event: 'kai-conversation-select',
        to: 'kai-chat',
        property: 'messages',
        note: 'host swaps the thread for the selected conversation: new array AND a new object per changed item (reactivity-two-halves)',
      },
      {
        from: 'kai-conversations',
        event: 'kai-new-chat',
        to: 'kai-chat',
        property: 'messages',
        note: 'host resets to an empty thread',
      },
      {
        from: 'kai-chat',
        event: 'kai-submit',
        to: 'kai-chat',
        property: 'messages',
        note: 'host reads event.detail.value, appends the user turn, streams the reply through the wire reader onto parts[]',
      },
      {
        from: 'kai-artifact',
        event: 'kai-maximize-change',
        to: 'kai-resizable',
        property: 'maximizedIndex',
        note: 'host mirrors the maximize state into the panel layout',
      },
    ],
    invariants: [
      'reactivity-two-halves',
      'props-not-attributes',
      'events-non-bubbling',
      'host-coordinates',
      'kit-parses-consumer-fetches',
      'untrusted-model-output',
    ],
    corpus: ['packages/ui/src/elements/split-workspace.stories.tsx'],
  },
  {
    // The script-tag instance. Without it, DeliveryTarget 'script-tag' and the
    // whole upgrade-race invariant exist in the schema with no recipe using
    // them, and S5 has nothing to reconstruct from.
    id: 'support-widget-script-tag',
    intent:
      'A docked support chat widget added to a page with a script tag and no build step, talking to an endpoint the site owner already runs. The CMS case.',
    archetypes: ['widget', 'docked'],
    targets: ['script-tag'],
    ingredients: ['kai-chat'],
    backend: { endpoint: 'consumer-owned', reader: 'readOpenAIStream' },
    wiring: [
      {
        from: 'kai-chat',
        event: 'kai-submit',
        to: 'kai-chat',
        property: 'messages',
        note: 'host reads event.detail.value, appends the user turn, streams the reply through the wire reader; on this target the host is an inline script, not a framework',
      },
    ],
    invariants: [
      'upgrade-race',
      'reactivity-two-halves',
      'props-not-attributes',
      'events-non-bubbling',
      'kit-parses-consumer-fetches',
      'untrusted-model-output',
    ],
    corpus: ['packages/ui/README.md'],
  },
];

/**
 * REGISTERED COPY (spec §3). Which MessagePart variants an element consumes is
 * not derivable from any type today, so it is recorded here as an explicit copy.
 * Task 7's drift lint fails when the union gains a variant no record accounts
 * for, which is what stops this going stale silently.
 */
export const partConsumption: TPartConsumption[] = [
  { tag: 'kai-chat', consumes: ['text', 'reasoning', 'tool', 'card', 'source', 'file'] },
  { tag: 'kai-message', consumes: ['text', 'reasoning', 'tool', 'card', 'source', 'file'] },
];

export function listInventory(): TInventoryEntry[] {
  return z.array(InventoryEntry).parse(inventory);
}

export function listSurfaceRecipes(): TSurfaceRecipe[] {
  return z.array(SurfaceRecipe).parse(surfaceRecipes);
}

export function listPartConsumption(): TPartConsumption[] {
  return z.array(PartConsumption).parse(partConsumption);
}
```

Update the import line at the top of the file to bring in the two extra names (both already exist in `catalog-types.ts` from Task 1; this task does not modify that file):

```ts
import {
  InventoryEntry,
  PartConsumption,
  SurfaceRecipe,
  type TInventoryEntry,
  type TPartConsumption,
  type TSurfaceRecipe,
} from './catalog-types';
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog/surfaces.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck, then commit**

Run: `pnpm --filter @kitn.ai/ui run typecheck` (expect exit 0), then:

```bash
git add packages/ui/src/agent-tooling/catalog/surfaces.ts packages/ui/src/agent-tooling/catalog/surfaces.test.ts
git commit -m "feat(catalog): the sorted inventory, both recipes, and the part-consumption copy

The inventory is spec §4's owner-reviewed sort. Two recipes, one per
delivery target, so script-tag and the upgrade-race invariant each have
an instance. partConsumption is a registered copy (spec §3) whose drift
check fires when the MessagePart union gains a variant.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: The drift lint

**Files:**
- Create: `packages/ui/scripts/lint-catalog-drift.mjs`
- Modify: `packages/ui/package.json` (add the `lint:catalog-drift` script)
- Modify: `.github/workflows/test.yml` (add the CI step after the `lint:silent-drops` step)
- Test: `packages/ui/tests/scripts/catalog-drift-guard-wiring.test.ts`

**Interfaces:**
- Consumes: `derived.json` (Task 3); `invariants.ts`, `surfaces.ts`, `scenarios.ts` (Tasks 1, 5, 6), esbuild-imported.
- Produces: the npm script `lint:catalog-drift` (exact value: `node scripts/lint-catalog-drift.mjs --self-test && node scripts/lint-catalog-drift.mjs`) and its CI step. Nothing later consumes it; everything later is protected by it.

- [ ] **Step 1: Write the lint**

```js
// packages/ui/scripts/lint-catalog-drift.mjs
// Every authored claim in the catalog must resolve against the derived layer
// and the tree, or the build fails. This is the structural answer to how the
// roster died: hand-written prose about a tree that kept moving.
//
// WHAT IT DOES NOT CATCH (measured, not guessed): a recipe whose wiring names a
// real event and a real property that are semantically unrelated still passes;
// only the acceptance harness catches wrong-but-resolvable wiring.
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '..', '..');
const SELF_TEST = process.argv.includes('--self-test');

async function loadAuthored(catalogDir) {
  const tmp = mkdtempSync(join(tmpdir(), 'catalog-drift-'));
  // The VALIDATED accessors, not the raw literals: a record that violates its
  // own zod schema must fail here rather than sail through on structural checks.
  const entrySrc = [
    `export { listInvariants } from '${join(catalogDir, 'invariants.ts')}';`,
    `export { listSurfaceRecipes, listInventory, listPartConsumption } from '${join(catalogDir, 'surfaces.ts')}';`,
    `export { listScenarios } from '${join(catalogDir, 'scenarios.ts')}';`,
  ].join('\n');
  const entry = join(tmp, 'entry.ts');
  writeFileSync(entry, entrySrc);
  const bundle = join(tmp, 'bundle.mjs');
  await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

/** Pure so the self-test can drive it with fixtures. Returns { errors, gaps }. */
export function check({ derived, invariants, surfaceRecipes, inventory, scenarios, partConsumption, labsTitles, fileExists, lintScripts }) {
  const errors = [];
  const gaps = [];
  const tags = new Map(derived.elements.map((e) => [e.tag, e]));
  const invariantIds = new Set(invariants.map((i) => i.id));

  // Anti-vacuity: this lint exists to check records the design requires.
  if (surfaceRecipes.length === 0) errors.push('zero surface recipes: nothing to check is a failure, not a pass.');
  if (invariants.length === 0) errors.push('zero invariants: nothing to check is a failure, not a pass.');
  if (inventory.length === 0) errors.push('zero inventory entries.');
  if (scenarios.length === 0) errors.push('zero scenarios.');
  if (labsTitles.length === 0) errors.push('zero Labs titles derived from the tree: the deriver is broken.');

  // The inventory is authored prose about the tree, which is the exact thing
  // that rotted the roster. Every title must name something that exists.
  for (const entry of inventory) {
    if (!labsTitles.includes(entry.title)) {
      errors.push(`inventory: "${entry.title}" matches no Labs story title or Labs/Apps story file in the tree.`);
    }
  }

  // The registered copy (spec §3): every union variant accounted for.
  const consumed = new Set(partConsumption.flatMap((p) => p.consumes));
  for (const variant of derived.partVariants) {
    if (!consumed.has(variant)) errors.push(`part-consumption: MessagePart variant '${variant}' is covered by no record. The union gained a variant; update the records.`);
  }
  for (const p of partConsumption) {
    if (!tags.has(p.tag)) errors.push(`part-consumption: ${p.tag} is not a derived element.`);
    for (const v of p.consumes) {
      if (!derived.partVariants.includes(v)) errors.push(`part-consumption: ${p.tag} claims variant '${v}', which is not in the union.`);
    }
  }

  for (const r of surfaceRecipes) {
    for (const tag of r.ingredients) {
      if (!tags.has(tag)) errors.push(`recipe ${r.id}: ingredient ${tag} is not a derived element.`);
    }
    for (const w of r.wiring) {
      const from = tags.get(w.from);
      const to = tags.get(w.to);
      if (!from) errors.push(`recipe ${r.id}: wiring 'from' ${w.from} is not a derived element.`);
      else if (!from.events.includes(w.event)) errors.push(`recipe ${r.id}: ${w.from} does not dispatch ${w.event}.`);
      if (!to) errors.push(`recipe ${r.id}: wiring 'to' ${w.to} is not a derived element.`);
      else if (!to.props.some((p) => p.name === w.property)) errors.push(`recipe ${r.id}: ${w.to} has no property ${w.property}.`);
    }
    for (const id of r.invariants) {
      if (!invariantIds.has(id)) errors.push(`recipe ${r.id}: invariant ${id} does not exist.`);
    }
    for (const path of r.corpus) {
      if (!fileExists(path)) errors.push(`recipe ${r.id}: corpus path ${path} does not exist.`);
    }
    for (const reader of [r.backend.reader]) {
      if (!fileExists('packages/ui/src/wire/read.ts')) errors.push(`recipe ${r.id}: wire module missing.`);
      else if (!readWireSource().includes(`function ${reader}(`)) errors.push(`recipe ${r.id}: wire reader ${reader} not found in src/wire/read.ts.`);
    }
  }

  for (const inv of invariants) {
    const e = inv.enforcedBy;
    if (e.kind === 'test') for (const p of e.paths) { if (!fileExists(p)) errors.push(`invariant ${inv.id}: test ${p} does not exist.`); }
    if (e.kind === 'structural' && !fileExists(e.path)) errors.push(`invariant ${inv.id}: structural site ${e.path} does not exist.`);
    if (e.kind === 'lint' && !lintScripts.includes(e.script)) errors.push(`invariant ${inv.id}: no npm script ${e.script}.`);
    if (e.kind === 'none') gaps.push(`invariant ${inv.id}: enforced by nothing${e.until ? ` (until ${e.until})` : ''}.`);
    if (inv.appliesTo.tags) for (const t of inv.appliesTo.tags) { if (!tags.has(t)) errors.push(`invariant ${inv.id}: appliesTo tag ${t} is not a derived element.`); }
    if (inv.appliesTo.parts) for (const p of inv.appliesTo.parts) { if (!derived.partVariants.includes(p)) errors.push(`invariant ${inv.id}: part variant ${p} is not in the union.`); }
  }

  function readWireSource() {
    return check._wireSource ?? (check._wireSource = readFileSync(join(REPO, 'packages/ui/src/wire/read.ts'), 'utf8'));
  }

  return { errors, gaps };
}

/**
 * The names an inventory title is allowed to have, DERIVED: every `title: 'Labs/X'`
 * suffix in the story files, plus the basename of every Labs/Apps story file
 * (the nine apps share one title and are distinguished by file).
 */
function deriveLabsTitles() {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.stories.tsx')) continue;
      const text = readFileSync(full, 'utf8');
      for (const m of text.matchAll(/title:\s*'Labs\/([^']+)'/g)) {
        const suffix = m[1];
        names.add(suffix);
        // 'Foundations/Input' also registers the group 'Foundations'.
        if (suffix.includes('/')) names.add(suffix.split('/')[0]);
      }
      if (text.includes("title: 'Labs/Apps'")) names.add(entry.name.replace('.stories.tsx', ''));
    }
  };
  walk(join(ROOT, 'src'));
  return [...names];
}

async function main() {
  const catalogDir = join(ROOT, 'src/agent-tooling/catalog');
  const derived = JSON.parse(readFileSync(join(catalogDir, 'derived.json'), 'utf8'));
  const authored = await loadAuthored(catalogDir);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const surfaceRecipes = authored.listSurfaceRecipes();
  const invariants = authored.listInvariants();
  const { errors, gaps } = check({
    derived,
    invariants,
    surfaceRecipes,
    inventory: authored.listInventory(),
    scenarios: authored.listScenarios(),
    partConsumption: authored.listPartConsumption(),
    labsTitles: deriveLabsTitles(),
    fileExists: (p) => existsSync(join(REPO, p)),
    lintScripts: Object.keys(pkg.scripts),
  });
  for (const g of gaps) console.log(`⚠ coverage gap: ${g}`);
  if (errors.length) {
    for (const e of errors) console.error(`✗ lint-catalog-drift: ${e}`);
    process.exit(1);
  }
  console.log(`lint-catalog-drift: ${surfaceRecipes.length} recipes, ${invariants.length} invariants resolved clean (${gaps.length} reported gaps).`);
}

function selfTest() {
  const derived = {
    elements: [
      { tag: 'kai-a', props: [{ name: 'items', scalar: false, optional: true }], events: ['kai-pick'], methods: [], parts: [] },
      { tag: 'kai-b', props: [{ name: 'value', scalar: true, optional: true }], events: [], methods: [], parts: [] },
    ],
    partVariants: ['text', 'reasoning', 'tool', 'source'],
    integrations: [{ id: 'mock', category: 'mock', streamFormat: 'native', keyExposure: 'frontend-safe' }],
    capabilityGroups: [{ id: 'x', components: ['kai-a'] }],
    themeTokens: ['--kai-color-accent'],
    eventExceptions: [],
  };
  const okInvariant = { id: 'inv-ok', statement: 's', appliesTo: {}, enforcedBy: { kind: 'none' }, status: 'open', diagnosis: [] };
  const okRecipe = {
    id: 'ok', intent: 'i', archetypes: ['full-screen'], targets: ['bundler'],
    ingredients: ['kai-a', 'kai-b'],
    backend: { endpoint: 'consumer-owned', reader: 'readModelStream' },
    wiring: [{ from: 'kai-a', event: 'kai-pick', to: 'kai-b', property: 'value' }],
    invariants: ['inv-ok'], corpus: ['README.md'],
  };
  const base = {
    derived, invariants: [okInvariant], surfaceRecipes: [okRecipe],
    inventory: [{ title: 'Command', sort: 'corpus', note: 'n' }], scenarios: [{ id: 'S1' }],
    partConsumption: [{ tag: 'kai-a', consumes: ['text', 'reasoning', 'tool', 'source'] }],
    labsTitles: ['Command', 'Proofs'],
    fileExists: (p) => p === 'README.md' || p === 'packages/ui/src/wire/read.ts',
    lintScripts: ['lint:silent-drops'],
  };
  const cases = [
    ['CLEAN control passes', base, 0],
    ['unknown ingredient fails', { ...base, surfaceRecipes: [{ ...okRecipe, ingredients: ['kai-datagrid'] }] }, 1],
    ['unknown wiring event fails', { ...base, surfaceRecipes: [{ ...okRecipe, wiring: [{ from: 'kai-a', event: 'kai-nope', to: 'kai-b', property: 'value' }] }] }, 1],
    ['unknown wiring property fails', { ...base, surfaceRecipes: [{ ...okRecipe, wiring: [{ from: 'kai-a', event: 'kai-pick', to: 'kai-b', property: 'nope' }] }] }, 1],
    ['bogus invariant ref fails', { ...base, surfaceRecipes: [{ ...okRecipe, invariants: ['ghost'] }] }, 1],
    ['missing corpus path fails', { ...base, surfaceRecipes: [{ ...okRecipe, corpus: ['docs/does-not-exist.md'] }] }, 1],
    ['zero recipes fails (anti-vacuity)', { ...base, surfaceRecipes: [] }, 1],
    // ISOLATED: the recipe must reference the RENAMED invariant, or the bogus-ref
    // check fires instead and this case passes even with the path check deleted.
    ['missing enforcedBy test path fails', {
      ...base,
      invariants: [{ ...okInvariant, id: 'inv-t', enforcedBy: { kind: 'test', paths: ['nope.test.ts'] }, status: 'enforced' }],
      surfaceRecipes: [{ ...okRecipe, invariants: ['inv-t'] }],
    }, 1],
    ['kind none is a gap, not an error', { ...base }, 0],
    ['inventory title that names nothing in the tree fails', { ...base, inventory: [{ title: 'Ghost Panel', sort: 'ingredient', note: 'n' }] }, 1],
    ['an uncovered union variant fails', { ...base, partConsumption: [{ tag: 'kai-a', consumes: ['text'] }] }, 1],
    ['zero Labs titles fails (deriver broken)', { ...base, labsTitles: [] }, 1],
  ];
  // NOTE: check() reads src/wire/read.ts through fileExists+readWireSource; the
  // ok recipe names readModelStream, which the real file exports, so the CLEAN
  // control exercises the reader check for real.
  let failed = 0;
  for (const [name, input, wantErrors] of cases) {
    const { errors } = check(input);
    const got = errors.length > 0 ? 1 : 0;
    const ok = got === wantErrors;
    console.log(`${ok ? '✓' : '✗'} self-test: ${name}${ok ? '' : ` (expected ${wantErrors ? 'errors' : 'clean'}, got: ${errors.join(' | ') || 'clean'})`}`);
    if (!ok) failed++;
  }
  if (failed) process.exit(1);
  console.log('lint-catalog-drift --self-test: all cases behaved.');
}

if (SELF_TEST) selfTest();
else await main();
```

- [ ] **Step 2: Run the self-test, verify every seeded defect is detected**

Run: `node packages/ui/scripts/lint-catalog-drift.mjs --self-test`
Expected: exit 0, one `✓` line per case including the CLEAN control. If any case shows `✗`, the checker is wrong, not the case.

- [ ] **Step 3: Run the real lint, verify it passes on the real catalog**

Run: `node packages/ui/scripts/lint-catalog-drift.mjs`
Expected: exit 0, a summary naming recipe/invariant counts, plus `⚠ coverage gap` lines for `host-coordinates` and `upgrade-race` (the two `kind: none` rows).

- [ ] **Step 4: WATCH IT FAIL on the real catalog**

Three separate mutations, each reverted before the next. Record all three failing outputs.

**(a) A fabricated element.** Add `'kai-datagrid'` to `workspace-chat`'s `ingredients`. Run `node packages/ui/scripts/lint-catalog-drift.mjs`. Expected: exit 1, `✗ lint-catalog-drift: recipe workspace-chat: ingredient kai-datagrid is not a derived element.`

**(b) A renamed inventory title** — the check that stops the inventory being unguarded prose. Change the `Command` entry's title to `Command Palette` (a plausible rename, and wrong). Expected: exit 1, `✗ lint-catalog-drift: inventory: "Command Palette" matches no Labs story title or Labs/Apps story file in the tree.`

**(c) A dropped part-consumption record.** Remove `'file'` from `kai-chat`'s `consumes`. Expected: exit 1, `✗ lint-catalog-drift: part-consumption: MessagePart variant 'file' is covered by no record.` This is the registered copy's drift check firing, and it is the same shape that fires when the union GAINS a variant.

After each: `git checkout -- packages/ui/src/agent-tooling/catalog/surfaces.ts` and re-run to green.

- [ ] **Step 5: Add the npm script and the CI step**

In `packages/ui/package.json` scripts, add exactly:

```json
"lint:catalog-drift": "node scripts/lint-catalog-drift.mjs --self-test && node scripts/lint-catalog-drift.mjs"
```

In `.github/workflows/test.yml`, directly after the `lint:silent-drops` step, add:

```yaml
      # Every authored catalog claim (tags, events, properties, invariant ids,
      # corpus paths) must resolve against the derived layer and the tree.
      # Self-test first: a checker that cannot detect is a green lie.
      - name: catalog drift
        run: pnpm --filter @kitn.ai/ui run lint:catalog-drift
```

- [ ] **Step 6: Write the wiring test**

```ts
// packages/ui/tests/scripts/catalog-drift-guard-wiring.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PKG = join(__dirname, '..', '..');
const REPO = join(PKG, '..', '..');

describe('lint:catalog-drift wiring', () => {
  it('the npm script exists and runs the self-test before the real run', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
    expect(pkg.scripts['lint:catalog-drift']).toBe(
      'node scripts/lint-catalog-drift.mjs --self-test && node scripts/lint-catalog-drift.mjs',
    );
  });

  it('the required test workflow invokes it', () => {
    const wf = readFileSync(join(REPO, '.github/workflows/test.yml'), 'utf8');
    expect(wf).toContain('run: pnpm --filter @kitn.ai/ui run lint:catalog-drift');
  });
});
```

- [ ] **Step 7: Run the wiring test and the script, verify green**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/catalog-drift-guard-wiring.test.ts` (expect PASS)
Run: `pnpm --filter @kitn.ai/ui run lint:catalog-drift` (expect exit 0: self-test then clean run)

- [ ] **Step 8: Commit**

```bash
git add packages/ui/scripts/lint-catalog-drift.mjs packages/ui/package.json .github/workflows/test.yml packages/ui/tests/scripts/catalog-drift-guard-wiring.test.ts
git commit -m "feat(catalog): the resolve-everything drift lint, self-tested and in CI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: The acceptance-pack skeleton

**Files:**
- Create: `packages/ui/scripts/acceptance-pack.mjs`
- Test: `packages/ui/tests/scripts/acceptance-pack.test.ts`

**Interfaces:**
- Consumes: `derived.json` (Task 3); `scenarios.ts`, `invariants.ts`, `surfaces.ts` (Tasks 1, 5, 6), esbuild-imported.
- Produces: `node scripts/acceptance-pack.mjs --scenario <id> --out <dir>` writing `catalog.json`, `PROMPT.md`, `JUDGE.md` into `<dir>`; `--list` printing scenario ids. Running the packed scenario against an agent is the iteration loop that FOLLOWS this plan (spec §7 item 6); this task builds the pack, not the agent run.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/tests/scripts/acceptance-pack.test.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PKG = join(__dirname, '..', '..');
const SCRIPT = join(PKG, 'scripts/acceptance-pack.mjs');

describe('acceptance pack', () => {
  it('--list prints S1 through S7', () => {
    const out = execFileSync('node', [SCRIPT, '--list'], { encoding: 'utf8' });
    for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']) expect(out).toContain(id);
  });

  it('packs a scenario: catalog.json + PROMPT.md + JUDGE.md, stamped with the kit version', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'pack-')), 'nested'); // not pre-created: the script must mkdir it
    execFileSync('node', [SCRIPT, '--scenario', 'S1', '--out', dir], { encoding: 'utf8' });
    expect(existsSync(join(dir, 'catalog.json'))).toBe(true);
    expect(existsSync(join(dir, 'PROMPT.md'))).toBe(true);
    expect(existsSync(join(dir, 'JUDGE.md'))).toBe(true);
    expect(readFileSync(join(dir, 'PROMPT.md'), 'utf8')).toContain('conversations sidebar');
    expect(readFileSync(join(dir, 'JUDGE.md'), 'utf8')).toContain('new array AND new changed-item objects');
    const catalog = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));
    expect(catalog.derived.elements.length).toBeGreaterThan(0);
    expect(catalog.invariants.length).toBeGreaterThan(0);
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
    expect(catalog.kitVersion).toBe(pkg.version);
  });

  it('no kit source travels, and the scan that says so can actually detect one', () => {
    // Recursive, because a flat readdir of a directory the script writes three
    // fixed filenames into is a check that cannot fail.
    const sourceFilesUnder = (root: string): string[] => {
      const out: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const full = join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.(ts|tsx|js|jsx|mjs|css)$/.test(e.name)) out.push(full);
        }
      };
      walk(root);
      return out;
    };

    const dir = mkdtempSync(join(tmpdir(), 'pack-'));
    execFileSync('node', [SCRIPT, '--scenario', 'S2', '--out', dir], { encoding: 'utf8' });
    expect(sourceFilesUnder(dir)).toEqual([]);

    // POSITIVE CONTROL: plant one nested source file and prove the scan sees it.
    mkdirSync(join(dir, 'deep', 'deeper'), { recursive: true });
    writeFileSync(join(dir, 'deep', 'deeper', 'chat.tsx'), 'export const x = 1;\n');
    expect(sourceFilesUnder(dir).length).toBe(1);
  });

  it('refuses an unknown scenario id, before writing anything', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-'));
    expect(() => execFileSync('node', [SCRIPT, '--scenario', 'S99', '--out', dir], { stdio: 'pipe' })).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/acceptance-pack.test.ts`
Expected: FAIL (script missing).

- [ ] **Step 3: Write the script**

```js
// packages/ui/scripts/acceptance-pack.mjs
// Packs ONE scenario into a directory an agent can be handed with NO kit
// source: the whole catalog (derived + authored, serialized), the scenario
// prompt, and the judge checklist. Spec §6: whatever the agent then cannot
// build names exactly what the catalog is missing.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function fail(msg) {
  console.error(`✗ acceptance-pack: ${msg}`);
  process.exit(1);
}

function arg(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

const catalogDir = join(ROOT, 'src/agent-tooling/catalog');
const tmp = mkdtempSync(join(tmpdir(), 'acceptance-pack-'));
const entry = join(tmp, 'entry.ts');
writeFileSync(entry, [
  `export { listScenarios } from '${join(catalogDir, 'scenarios.ts')}';`,
  `export { listInvariants } from '${join(catalogDir, 'invariants.ts')}';`,
  `export { listSurfaceRecipes, listInventory, listPartConsumption } from '${join(catalogDir, 'surfaces.ts')}';`,
].join('\n'));
const bundle = join(tmp, 'bundle.mjs');
await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
const authored = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

const scenarios = authored.listScenarios();

if (args.includes('--list')) {
  for (const s of scenarios) console.log(`${s.id}  ${s.depth}`);
  process.exit(0);
}

const id = arg('--scenario');
const out = arg('--out');
if (!id || !out) fail('usage: acceptance-pack.mjs --scenario <S1..S7> --out <dir> | --list');
const scenario = scenarios.find((s) => s.id === id);
if (!scenario) fail(`unknown scenario ${id}; run --list.`);

mkdirSync(out, { recursive: true });

const derived = JSON.parse(readFileSync(join(catalogDir, 'derived.json'), 'utf8'));
// The PACK is stamped, unlike derived.json: this file leaves the repo and is
// handed to an agent with no kit source and no way to ask what it is looking at.
// (derived.json stays unstamped on purpose — a version literal inside a
// committed artifact goes red on every release bump between regenerations.)
const kitVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
writeFileSync(join(out, 'catalog.json'), JSON.stringify({
  kitVersion,
  scenario: scenario.id,
  derived,
  invariants: authored.listInvariants(),
  surfaceRecipes: authored.listSurfaceRecipes(),
  inventory: authored.listInventory(),
  partConsumption: authored.listPartConsumption(),
}, null, 2) + '\n');
writeFileSync(join(out, 'PROMPT.md'), `# ${scenario.id}\n\n${scenario.prompt}\n`);
writeFileSync(join(out, 'JUDGE.md'), [
  `# Judge checklist for ${scenario.id} (${scenario.depth})`,
  '',
  ...scenario.scoring.map((s) => `- [ ] ${s}`),
  '',
  `Needs claimed by the catalog: ${scenario.needs.join('; ')}`,
  '',
].join('\n'));
console.log(`acceptance-pack: packed ${scenario.id} into ${out}`);
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/acceptance-pack.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/scripts/acceptance-pack.mjs packages/ui/tests/scripts/acceptance-pack.test.ts
git commit -m "feat(catalog): acceptance-pack skeleton, catalog-only by construction

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Re-platform `component_reference` onto the catalog

**Files:**
- Modify: `packages/ui/src/agent-tooling/mcp/tools/reference.ts`
- Modify: `packages/ui/src/agent-tooling/mcp/reference.test.ts` (add a describe block; do not touch existing tests)

**Interfaces:**
- Consumes: `invariants` (Task 5), `surfaceRecipes` (Task 6), types from `catalog-types.ts` (Task 1).
- Produces: `component_reference`'s per-element output gains an `### Invariants` section and an `### Appears in surface recipes` section.

- [ ] **Step 1: Write the failing test**

Append to `packages/ui/src/agent-tooling/mcp/reference.test.ts`, using the file's existing invocation shape (`reference.handler({ name })`, text at `content[0].text` — see its first test):

```ts
describe('component_reference serves the catalog', () => {
  const textFor = async (name: string) => {
    const out = await reference.handler({ name });
    return (out.content as { type: string; text: string }[])[0].text;
  };

  it('kai-chat carries the reactivity invariant, statement included', async () => {
    const text = await textFor('kai-chat');
    expect(text).toContain('### Invariants');
    expect(text).toContain('reactivity-two-halves');
    expect(text).toContain('A new array reference NOTIFIES');
  });

  it('kai-conversations names the recipes it appears in', async () => {
    const text = await textFor('kai-conversations');
    expect(text).toContain('### Appears in surface recipes');
    expect(text).toContain('workspace-chat');
  });

  it('an element in no recipe still gets universal invariants, and no fabricated membership', async () => {
    const text = await textFor('kai-kbd');
    expect(text).toContain('### Invariants');
    expect(text).toContain('props-not-attributes'); // universal: applies to every element
    expect(text).not.toContain('### Appears in surface recipes');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: the three new tests FAIL (`### Invariants` absent); every pre-existing test still PASSES. If a pre-existing test fails, stop: the checkout is broken, not the task.

- [ ] **Step 3: Implement**

In `packages/ui/src/agent-tooling/mcp/tools/reference.ts`, import the catalog:

```ts
import { invariants } from '../../catalog/invariants';
import { surfaceRecipes } from '../../catalog/surfaces';
import type { TInvariant, TSurfaceRecipe } from '../../catalog/catalog-types';
```

Add two pure functions near the other render helpers:

```ts
/** An invariant applies to a tag if it is unscoped (universal) or names the tag. */
function invariantsFor(tag: string): TInvariant[] {
  return invariants.filter((i) => !i.appliesTo.tags || i.appliesTo.tags.includes(tag));
}

function recipesFor(tag: string): TSurfaceRecipe[] {
  return surfaceRecipes.filter((r) => r.ingredients.includes(tag));
}

/** `###` to match every other section heading in this file (see '### Props'). */
function catalogSectionLines(tag: string): string[] {
  const lines: string[] = ['', '### Invariants', ''];
  for (const i of invariantsFor(tag)) {
    lines.push(`- **${i.id}**${i.status === 'open' ? ' (open)' : ''}: ${i.statement}`);
  }
  const recipes = recipesFor(tag);
  if (recipes.length > 0) {
    lines.push('', '### Appears in surface recipes', '');
    for (const r of recipes) lines.push(`- **${r.id}**: ${r.intent}`);
  }
  return lines;
}
```

**The exact site:** `formatReference(tag, provider)` in `packages/ui/src/agent-tooling/mcp/tools/reference.ts` (declared at line 228 at the time of writing) builds a `lines` array and ends with `return lines.join('\n')` (line 375). Insert immediately before that return:

```ts
  lines.push(...catalogSectionLines(tag));
```

Do not restructure the function; this is one push before the existing return.

- [ ] **Step 4: Run the whole reference suite, verify green**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Full gates for the finished branch**

Run, in order, reporting each real exit code:

<!-- gate-list: partial -- historical record, predates lint:gate-parity -->
```bash
pnpm --filter @kitn.ai/ui run typecheck
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run lint:catalog-drift
pnpm --filter @kitn.ai/ui run lint:silent-drops
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
```

Expected: all exit 0. (`--project=emitted` is part of the merge gate; a green `--project=unit` alone is not.)

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/agent-tooling/mcp/tools/reference.ts packages/ui/src/agent-tooling/mcp/reference.test.ts
git commit -m "feat(mcp): component_reference serves catalog invariants and recipes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Deviations from the spec

Honest deviation beats claimed conformance. Each of these narrows or reorders something the spec names; none reverses a ruled decision.

1. **Deck and harness are split across Task 1 and Task 8**, though spec §7 item 1 pairs them. The packer has nothing to pack until the derived layer (Task 3) and the authored records (Tasks 5, 6) exist. The deck itself still comes first, which is the property item 1 exists to guarantee, and Task 1 now also produces the pre-development cross-check that §6 asks for.
2. **`custom-elements.json` is not read.** Spec §3 lists it as a source; this plan derives everything from `element-meta.json` instead, which already carries props (with the `scalar` split), events, methods, parts, `composedFrom` and tokens. Reading the CEM as well would add a `dist/` dependency to a generator that otherwise needs none, and would give the catalog a second, differently-shaped copy of the same facts. If a consumer-facing fact turns up that only the CEM has, add it then, with the reason recorded. `component_reference` continues to read the CEM directly for its own output; that path is untouched.
3. **Two recipes, not a catalogue of them.** `workspace-chat` and `support-widget-script-tag` between them instance both delivery targets and every invariant including `upgrade-race`. Further recipes land through acceptance-run iteration (spec §7 item 6), each proven against a scenario before it lands, rather than authored blind here.
4. **`partConsumption` covers two elements**, not all eighty. It is a registered copy whose drift check fires on a new union variant; extending it to more elements is cheap and additive, and doing it blind now would author eighty untested claims.

## Copies this plan creates (register them; do not let them go unmarked)

Spec §3's rule is that a non-derivable fact is recorded as an explicit copy with something that notices drift.

| Copy | Where | What notices |
|---|---|---|
| Per-element `MessagePart` consumption | `partConsumption` in `surfaces.ts` | `lint:catalog-drift` fails when a union variant is covered by no record (self-test case, plus watched-red mutation (c) in Task 7) |
| The 26 inventory titles | `inventory` in `surfaces.ts` | `lint:catalog-drift` resolves every title against Labs story titles derived from the tree (watched-red mutation (b)) |
| The `Foundations` note's atom list | the `note` on that inventory row | NOTHING. It is prose inside one note field and the row's own title is resolved; the atom list inside the note is not. Accepted deliberately: it is descriptive text, not a claim the catalog serves. If it starts being served, derive it from the `Labs/Foundations/*` titles. |
| The `.min(4)` floor on `partVariants` | `DerivedCatalog` in `catalog-types.ts` | NOTHING directly; the generator asserts the real `MIN_VARIANTS` from `scripts/lib/message-part-variants.mjs`, so the schema floor is a backstop that can only be wrong in the safe direction. Move it if `MIN_VARIANTS` moves. |

## Coupling-map rows affected (name in the PR body; do NOT edit the map)

- New enforced coupling: authored catalog records ↔ the tree, enforced by `lint:catalog-drift` (self-tested, in the required `test` job).
- New enforced coupling: `derived.json` ↔ its sources, enforced by `verify:generated` (now that `gen-catalog.mjs` is inside `build:api`).
- New enforced coupling: the `MessagePart` union ↔ the part-consumption records, enforced by the same lint.
- New registered copies: the four in the table above, two enforced and two accepted with their reasons.
