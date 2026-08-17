# Composition Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the composition catalog: a derived ingredient layer, authored surface/invariant records, the drift lint that keeps the authored layer honest, the scenario deck with an acceptance-pack skeleton, and `component_reference` re-platformed onto the catalog.

**Architecture:** Two layers under `packages/ui/src/agent-tooling/catalog/`. The derived layer is a generated, committed JSON artifact (`derived.json`) produced by `scripts/gen-catalog.mjs` inside the `build:api` chain and guarded by `verify:generated`. The authored layer is zod-validated TS records (scenarios, invariants, inventory, surface recipes) whose every reference must resolve against the derived layer and the tree, enforced by `scripts/lint-catalog-drift.mjs` in the required CI `test` job.

**Tech Stack:** TypeScript, zod (already a dependency, `^4.4.3`), esbuild (already used by `verify-scaffold-compiles.mjs` to import TS registries from `.mjs` scripts), the TypeScript compiler API (already used by `lint-silent-drops.mjs`), vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-composition-catalog-design.md` (read it first; its §7 build order is this plan's task order). §7 item 6, iterating under acceptance runs, is ongoing work that follows this plan rather than a task inside it.

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
- Produces: the zod schemas `SurfaceArchetype`, `DeliveryTarget`, `WireReader`, `Backend`, `EnforcedBy`, `Invariant`, `WiringEdge`, `SurfaceRecipe`, `InventoryEntry`, `Scenario`, `DerivedCatalog`, `DerivedElement`, `EventException`; the inferred types `TInvariant`, `TSurfaceRecipe`, `TScenario`, `TInventoryEntry`, `TDerivedCatalog`; `export const scenarios: TScenario[]` and `export function listScenarios(): TScenario[]` (parse-validated). Tasks 3–9 import these names exactly.

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
});

export const EventException = z.object({
  file: z.string(),
  event: z.string(),
  bubbles: z.boolean(),
  composed: z.boolean(),
});

export const DerivedCatalog = z.object({
  elements: z.array(DerivedElement).min(1),
  // Floor mirrors MIN_VARIANTS in lint-silent-drops: a degraded parse must not pass.
  partVariants: z.array(z.string()).min(4),
  integrations: z.array(z.object({ id: z.string(), category: z.string(), streamFormat: z.string(), keyExposure: z.string() })).min(1),
  capabilityGroups: z.array(z.object({ id: z.string(), components: z.array(z.string()) })).min(1),
  themeTokens: z.array(z.string()).min(1),
  eventExceptions: z.array(EventException),
});

export type TInvariant = z.infer<typeof Invariant>;
export type TSurfaceRecipe = z.infer<typeof SurfaceRecipe>;
export type TScenario = z.infer<typeof Scenario>;
export type TInventoryEntry = z.infer<typeof InventoryEntry>;
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

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/agent-tooling/catalog/
git commit -m "feat(catalog): schema module and the normative scenario deck

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

- [ ] **Step 3: Watch the guard still discriminate after the refactor**

Run: `node packages/ui/scripts/lint-silent-drops.mjs --self-test`
Expected: exit 0, self-test output showing its seeded defects still DETECTED (the self-test exists to watch the analyzer detect; a refactor that lobotomized it fails here).
Then run: `pnpm --filter @kitn.ai/ui run lint:silent-drops`
Expected: exit 0.

- [ ] **Step 4: Commit**

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
- Test: `packages/ui/tests/scripts/catalog-derived.test.ts`

**Interfaces:**
- Consumes: `readVariants`, `MIN_VARIANTS` from `scripts/lib/message-part-variants.mjs` (Task 2); `DerivedCatalog` from `catalog-types.ts` (Task 1).
- Produces: `packages/ui/src/agent-tooling/catalog/derived.json` matching `DerivedCatalog`. Tasks 7 and 9 read it via `import derived from './derived.json';`.

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
    // The known protocol exceptions surface in the derived exception list.
    const names = derived.eventExceptions.map((e) => e.event);
    expect(names).toContain('kai-maximize-intent');
    expect(names).toContain('kai-maximize-state');
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
const eventExceptions = [];
const elDir = join(ROOT, 'src/elements');
for (const f of readdirSync(elDir).filter((n) => n.endsWith('.tsx') && n !== 'define.tsx')) {
  const text = readFileSync(join(elDir, f), 'utf8');
  const re = /new CustomEvent\(\s*'(kai-[a-z-]+)'\s*,\s*\{([^}]*)\}/g;
  for (const m of text.matchAll(re)) {
    const opts = m[2];
    const bubbles = /bubbles:\s*true/.test(opts);
    const composed = /composed:\s*true/.test(opts);
    if (bubbles || composed) eventExceptions.push({ file: `src/elements/${f}`, event: m[1], bubbles, composed });
  }
}
eventExceptions.sort((a, b) => (a.file + a.event).localeCompare(b.file + b.event));

writeFileSync(OUT, JSON.stringify({ elements, partVariants, integrations, capabilityGroups, themeTokens, eventExceptions }, null, 2) + '\n');
console.log(`gen-catalog: wrote ${OUT} (${elements.length} elements, ${partVariants.length} part variants, ${integrations.length} integrations, ${eventExceptions.length} event exceptions)`);
```

- [ ] **Step 4: Run the generator, then the test; verify both pass**

Run: `node packages/ui/scripts/gen-catalog.mjs` (expect the summary line, exit 0)
Then: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/catalog-derived.test.ts`
Expected: PASS (2 tests). If `kai-maximize-intent`/`kai-maximize-state` are missing, the regex drifted from the dispatch sites in `src/elements/artifact.tsx` / `src/elements/resizable.tsx`; fix the generator, not the test.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @kitn.ai/ui run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit (generator + committed artifact + test)**

```bash
git add packages/ui/scripts/gen-catalog.mjs packages/ui/src/agent-tooling/catalog/derived.json packages/ui/tests/scripts/catalog-derived.test.ts
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

### Task 6: The authored inventory and the exemplar surface recipe

**Files:**
- Create: `packages/ui/src/agent-tooling/catalog/surfaces.ts`
- Test: `packages/ui/src/agent-tooling/catalog/surfaces.test.ts`

**Interfaces:**
- Consumes: `SurfaceRecipe`, `InventoryEntry`, types from `catalog-types.ts` (Task 1); invariant IDs (Task 5).
- Produces: `export const inventory: TInventoryEntry[]`, `export const surfaceRecipes: TSurfaceRecipe[]`, `export function listSurfaceRecipes(): TSurfaceRecipe[]`, `export function listInventory(): TInventoryEntry[]`. Task 7 lints them; Task 9 serves them.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/catalog/surfaces.test.ts
import { describe, expect, it } from 'vitest';
import { InventoryEntry, SurfaceRecipe } from './catalog-types';
import { inventory, listInventory, listSurfaceRecipes, surfaceRecipes } from './surfaces';

describe('authored surface layer', () => {
  it('inventory parses and sorts every entry into surface / ingredient / corpus', () => {
    expect(inventory.length).toBeGreaterThan(0);
    for (const entry of listInventory()) expect(() => InventoryEntry.parse(entry)).not.toThrow();
  });

  it('the nine Labs/Apps are surfaces; Proofs is corpus', () => {
    const surfaceTitles = inventory.filter((e) => e.sort === 'surface').map((e) => e.title);
    for (const app of ['claude-code', 'chatgpt', 'codex', 't3code', 'perplexity', 'perplexity-pro', 'v0', 'lovable', 'split-workspace']) {
      expect(surfaceTitles.join(' ')).toContain(app);
    }
    expect(inventory.find((e) => e.title === 'Proofs')?.sort).toBe('corpus');
  });

  it('at least one complete recipe exists and parses', () => {
    expect(surfaceRecipes.length).toBeGreaterThan(0);
    for (const r of listSurfaceRecipes()) expect(() => SurfaceRecipe.parse(r)).not.toThrow();
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

The inventory rows are spec §4's sort table verbatim (it was reviewed by the owner in PR #276); one entry per row, apps split out so each is checkable. The single exemplar recipe is deliberate: further recipes land through acceptance-run iteration (spec §7 item 6), not through this plan. Full content:

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
 * One complete recipe as the exemplar the drift lint and the MCP exercise.
 * Further recipes are added through acceptance-run iteration, each proven
 * against a scenario before it lands.
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
];

export function listInventory(): TInventoryEntry[] {
  return z.array(InventoryEntry).parse(inventory);
}

export function listSurfaceRecipes(): TSurfaceRecipe[] {
  return z.array(SurfaceRecipe).parse(surfaceRecipes);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog/surfaces.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck, then commit**

Run: `pnpm --filter @kitn.ai/ui run typecheck` (expect exit 0), then:

```bash
git add packages/ui/src/agent-tooling/catalog/surfaces.ts packages/ui/src/agent-tooling/catalog/surfaces.test.ts
git commit -m "feat(catalog): the sorted inventory and the workspace-chat exemplar recipe

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
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '..', '..');
const SELF_TEST = process.argv.includes('--self-test');

async function loadAuthored(catalogDir) {
  const tmp = mkdtempSync(join(tmpdir(), 'catalog-drift-'));
  const entrySrc = [
    `export { invariants } from '${join(catalogDir, 'invariants.ts')}';`,
    `export { surfaceRecipes, inventory } from '${join(catalogDir, 'surfaces.ts')}';`,
    `export { scenarios } from '${join(catalogDir, 'scenarios.ts')}';`,
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
export function check({ derived, invariants, surfaceRecipes, inventory, scenarios, fileExists, lintScripts }) {
  const errors = [];
  const gaps = [];
  const tags = new Map(derived.elements.map((e) => [e.tag, e]));
  const invariantIds = new Set(invariants.map((i) => i.id));

  // Anti-vacuity: this lint exists to check records the design requires.
  if (surfaceRecipes.length === 0) errors.push('zero surface recipes: nothing to check is a failure, not a pass.');
  if (invariants.length === 0) errors.push('zero invariants: nothing to check is a failure, not a pass.');
  if (inventory.length === 0) errors.push('zero inventory entries.');
  if (scenarios.length === 0) errors.push('zero scenarios.');

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

async function main() {
  const catalogDir = join(ROOT, 'src/agent-tooling/catalog');
  const derived = JSON.parse(readFileSync(join(catalogDir, 'derived.json'), 'utf8'));
  const authored = await loadAuthored(catalogDir);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const { errors, gaps } = check({
    derived,
    invariants: authored.invariants,
    surfaceRecipes: authored.surfaceRecipes,
    inventory: authored.inventory,
    scenarios: authored.scenarios,
    fileExists: (p) => existsSync(join(REPO, p)),
    lintScripts: Object.keys(pkg.scripts),
  });
  for (const g of gaps) console.log(`⚠ coverage gap: ${g}`);
  if (errors.length) {
    for (const e of errors) console.error(`✗ lint-catalog-drift: ${e}`);
    process.exit(1);
  }
  console.log(`lint-catalog-drift: ${authored.surfaceRecipes.length} recipes, ${authored.invariants.length} invariants resolved clean (${gaps.length} reported gaps).`);
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
    inventory: [{ title: 't', sort: 'corpus', note: 'n' }], scenarios: [{ id: 'S1' }],
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
    ['missing enforcedBy test path fails', { ...base, invariants: [{ ...okInvariant, id: 'inv-t', enforcedBy: { kind: 'test', paths: ['nope.test.ts'] }, status: 'enforced' }] }, 1],
    ['kind none is a gap, not an error', { ...base }, 0],
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

Temporarily edit `packages/ui/src/agent-tooling/catalog/surfaces.ts`: add `'kai-datagrid'` to the exemplar recipe's `ingredients`. Run `node packages/ui/scripts/lint-catalog-drift.mjs`. Expected: exit 1, `✗ lint-catalog-drift: recipe workspace-chat: ingredient kai-datagrid is not a derived element.` Record the output. Revert the edit (`git checkout -- packages/ui/src/agent-tooling/catalog/surfaces.ts`) and re-run to green.

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
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
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

  it('packs a scenario: catalog.json + PROMPT.md + JUDGE.md, and NO kit source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-'));
    execFileSync('node', [SCRIPT, '--scenario', 'S1', '--out', dir], { encoding: 'utf8' });
    expect(existsSync(join(dir, 'catalog.json'))).toBe(true);
    expect(existsSync(join(dir, 'PROMPT.md'))).toBe(true);
    expect(existsSync(join(dir, 'JUDGE.md'))).toBe(true);
    expect(readFileSync(join(dir, 'PROMPT.md'), 'utf8')).toContain('conversations sidebar');
    const judge = readFileSync(join(dir, 'JUDGE.md'), 'utf8');
    expect(judge).toContain('new array AND new changed-item objects');
    // Catalog-only means catalog-only: nothing from src/ travels.
    expect(readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))).toEqual([]);
    const catalog = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));
    expect(catalog.derived.elements.length).toBeGreaterThan(0);
    expect(catalog.invariants.length).toBeGreaterThan(0);
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
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
  `export { scenarios } from '${join(catalogDir, 'scenarios.ts')}';`,
  `export { invariants } from '${join(catalogDir, 'invariants.ts')}';`,
  `export { surfaceRecipes, inventory } from '${join(catalogDir, 'surfaces.ts')}';`,
].join('\n'));
const bundle = join(tmp, 'bundle.mjs');
await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
const authored = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

if (args.includes('--list')) {
  for (const s of authored.scenarios) console.log(`${s.id}  ${s.depth}`);
  process.exit(0);
}

const id = arg('--scenario');
const out = arg('--out');
if (!id || !out) fail('usage: acceptance-pack.mjs --scenario <S1..S7> --out <dir> | --list');
const scenario = authored.scenarios.find((s) => s.id === id);
if (!scenario) fail(`unknown scenario ${id}; run --list.`);

const derived = JSON.parse(readFileSync(join(catalogDir, 'derived.json'), 'utf8'));
writeFileSync(join(out, 'catalog.json'), JSON.stringify({
  derived,
  invariants: authored.invariants,
  surfaceRecipes: authored.surfaceRecipes,
  inventory: authored.inventory,
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
Expected: PASS (3 tests).

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
- Produces: `component_reference`'s per-element output gains an `## Invariants` section and an `## Appears in surface recipes` section.

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
    expect(text).toContain('## Invariants');
    expect(text).toContain('reactivity-two-halves');
    expect(text).toContain('A new array reference NOTIFIES');
  });

  it('kai-conversations names the recipes it appears in', async () => {
    const text = await textFor('kai-conversations');
    expect(text).toContain('## Appears in surface recipes');
    expect(text).toContain('workspace-chat');
  });

  it('an element in no recipe still gets universal invariants, and no fabricated membership', async () => {
    const text = await textFor('kai-kbd');
    expect(text).toContain('## Invariants');
    expect(text).toContain('props-not-attributes'); // universal: applies to every element
    expect(text).not.toContain('## Appears in surface recipes');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: the three new tests FAIL (`## Invariants` absent); every pre-existing test still PASSES. If a pre-existing test fails, stop: the checkout is broken, not the task.

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

function renderCatalogSections(tag: string): string {
  const invs = invariantsFor(tag);
  const recipes = recipesFor(tag);
  const lines: string[] = ['', '## Invariants', ''];
  for (const i of invs) {
    lines.push(`- **${i.id}**${i.status === 'open' ? ' (open)' : ''}: ${i.statement}`);
  }
  if (recipes.length > 0) {
    lines.push('', '## Appears in surface recipes', '');
    for (const r of recipes) lines.push(`- **${r.id}**: ${r.intent}`);
  }
  return lines.join('\n');
}
```

Append `renderCatalogSections(tag)` to the per-element markdown at the end of the existing element rendering path (the function that assembles the sections for a resolved element; it is the one that renders props/events/methods — grep for where the events section is emitted and append after the last section).

- [ ] **Step 4: Run the whole reference suite, verify green**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Full gates for the finished branch**

Run, in order, reporting each real exit code:

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

## Coupling-map rows affected (name in the PR body; do NOT edit the map)

- New enforced coupling: authored catalog records ↔ the tree, enforced by `lint:catalog-drift` (self-tested, in the required `test` job).
- New enforced coupling: `derived.json` ↔ its sources, enforced by `verify:generated` (now that `gen-catalog.mjs` is inside `build:api`).
- New registered copies: none; every derived fact rides the generator. The authored layer's editorial judgments (inventory sort, recipes) are validated by the drift lint and measured by the acceptance deck.
