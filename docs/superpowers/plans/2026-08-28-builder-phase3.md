# Builder Phase 3 (the real builder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the real visual builder — the CROSS_FIELD_RULES table + form-path translation layer (spec task 9), the schema-derived BuilderPanel (spec task 10), and `kai dev --builder` (spec task 11) — per rulings B-19..B-26 of the build spec.

**Architecture:** schema.ts's superRefine body becomes a named-rule table (`CROSS_FIELD_RULES`) with its external behavior — every message string — pinned by the existing tests and the generated JSON-Schema artifact pinned byte-identical. A new `src/components/construct-form-paths.ts` owns path-based reads/writes over a real `Construct` (presence-as-boolean, delete-on-empty, default-anchored booleans) plus the zod shape walk and the rule-id-keyed visibility registry. A new `DerivedBuilderPanel` (light-DOM Solid, real `Construct` type) derives its controls from `ConstructSchema.shape` scoped by the registry's per-template `controls` manifests, with a path-keyed override map for bespoke editors. `kai dev --builder` adds a second thin HTTP server beside the existing `kai dev` loop: it serves a prebuilt builder page (Vite-built at kit build time into `dist/builder-page/`), iframes the generated project's Vite dev server as the live preview, and exposes one validate-then-write endpoint — the construct FILE stays the single source of truth, and the existing watcher → codegen → HMR seam does the rest. Plain `kai dev` stays byte-identical: `dev()` is not touched.

**Tech Stack:** SolidJS 1.x, zod ^4.4 (no ZodEffects wrapper — `.superRefine()` returns the same schema class; walk via `instanceof` + `def.innerType`), vitest (`--project=unit`), @solidjs/testing-library, node:http + node:fs (no new runtime dependency for the CLI), vite + vite-plugin-solid + @tailwindcss/postcss for the builder-page build, `solid.css` (#345 — already imports `theme.css` + `kit-base.css`).

**Spec:** `docs/superpowers/specs/2026-08-28-template-registry-and-builder-build.md` (Phase 3, rulings B-19..B-26, task breakdown 9–11), backed by `docs/superpowers/specs/2026-08-28-t5-vocabulary-rulings.md`. Phases 1+2 are LANDED on this branch — the current tree is ground truth (schema.ts already carries the six new keys; templates.ts + its `controls` manifests exist; `kai dev` lives in `src/agent-tooling/construct/dev.ts`).

## Global Constraints

- **B-20 pin:** schema.ts's external behavior — acceptance, rejection, paths, AND message text — is byte-identical after the rule-table restructure. The existing `schema.test.ts` (600 lines, message-asserting) is the pin; do not edit any existing test in it.
- **B-20 artifact pin:** after `npm run build:api` in `packages/ui`, `git diff --exit-code` over `packages/ui/src/agent-tooling/construct/construct.v1.schema.json` and `apps/docs/public/schemas/construct/v1.json` must be clean. superRefine checks do not serialize into `z.toJSONSchema` output, so any diff means the restructure leaked into the declared shape — stop and fix, never regenerate-and-commit the diff.
- **B-22:** plain `kai dev <file>` stays byte-identical — `dev()` in dev.ts is NOT modified; `devBuilder()` is a sibling reusing the same exported helpers.
- **B-12:** `templates.ts` stays a zod-free leaf (its own `templates.test.ts` pins the import discipline); nothing in this phase adds an import to it.
- **The construct FILE is the sole state** (B-22): the builder holds no state the file doesn't; every panel edit goes file-ward through ONE validate-then-write endpoint; a rejection never writes and the last-good preview stands.
- Never hand-edit generated artifacts (`construct.v1.schema.json`, docs schema copy, `fixtures/templates/*.construct.json`, `compiled.css`). `verify:generated` guards them.
- All commands from the repo root unless a step says `cd packages/ui`. Conventional commits; trailer lines (Co-Authored-By / Claude-Session) per repo convention are the executor's to append.
- `nx typecheck ui` verdicts can be cache-stale in both directions (CLAUDE.md): when a typecheck gate matters, run `npm run typecheck` inside `packages/ui` or pass `--skip-nx-cache`.
- No emoji in copy; docs/comments in the repo's terse human voice.

## File Structure (locked in)

| File | Role |
|---|---|
| `packages/ui/src/agent-tooling/construct/schema.ts` | Modify: superRefine body → exported `CROSS_FIELD_RULES` table iterated by one superRefine. |
| `packages/ui/src/components/construct-form-paths.ts` | Create: path get/set/delete with delete-on-empty, presence booleans, anchored booleans, zod shape walk (`schemaNodeAt`/`controlKindFor`), `RULE_VISIBILITY`. |
| `packages/ui/src/components/construct-form-paths.test.ts` | Create: round-trips over every registry starter, presence-path drift check, B-20 key-set-equality test. |
| `packages/ui/src/components/builder-panel.tsx` | Modify (minimal): export `Section`, `Field`, `Row` so the derived panel reuses the rhythm. Nothing else changes — the legacy stub-typed panel keeps serving the four design-round template stories. |
| `packages/ui/src/components/builder-panel-derived.tsx` | Create: `DerivedBuilderPanel` over the real `Construct` — schema walk + manifest + override map + visibility + B-25 a11y. |
| `packages/ui/src/components/builder-panel-derived.test.tsx` | Create: derivation, override-drift, visibility, accessible-name queries. |
| `packages/ui/src/elements/builder-derived-panel.stories.tsx` | Create: `Labs/Builder/Derived panel` — story-first, one story per buildable template. |
| `packages/ui/src/builder-app/{index.html,styles.css,main.tsx,App.tsx}` | Create: the builder page (light-DOM Solid; Start → variant → name → panel+iframe flow). |
| `packages/ui/vite.config.builder-page.ts` | Create: builds the page into `dist/builder-page/`. |
| `packages/ui/package.json` | Modify: add the builder-page build to the `build` chain. |
| `packages/ui/src/agent-tooling/construct/dev.ts` | Modify: add `atomicWriteJson`, `handleConstructPut`, `createEventHub`, `serveBuilderAsset`, `devBuilder` — `dev()` untouched. |
| `packages/ui/src/agent-tooling/construct/dev.test.ts` | Modify: grow with endpoint/atomic-write/hub/static-guard tests. |
| `packages/ui/src/agent-tooling/construct/cli.ts` | Modify: `--builder` flag (exported `parseDevArgs`), USAGE line. `cli-entry.ts` needs no change (argv flows through `runCli`). |
| `packages/ui/src/agent-tooling/construct/cli.test.ts` | Modify: `parseDevArgs` cases. |

---

### Task 1: CROSS_FIELD_RULES — the named-rule table (spec task 9, first half; B-20)

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/schema.ts` (lines 427–556, the `.superRefine((construct, ctx) => { … })` body)
- Test: `packages/ui/src/agent-tooling/construct/schema.test.ts` (append ONE new describe; existing tests untouched — they ARE the behavior pin)

**Interfaces:**
- Produces: `export interface CrossFieldRule { id: string; paths: readonly string[]; check: (construct: Construct, ctx: z.RefinementCtx) => void }` and `export const CROSS_FIELD_RULES: readonly CrossFieldRule[]` from `./schema`. Task 2's `RULE_VISIBILITY` keys off `CROSS_FIELD_RULES.map(r => r.id)`; Task 3's panel reads rule ids for visibility.
- Consumes: nothing new — this is an internal restructure of the current tree's superRefine body.

- [ ] **Step 1: Establish the pin — run the existing schema suite green BEFORE touching anything**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts`
Expected: PASS (all existing tests). This green is the before-picture the restructure must reproduce.

- [ ] **Step 2: Write the failing test (rule ids exist, are unique, and the table is exported)**

Append to `schema.test.ts`:

```ts
describe('CROSS_FIELD_RULES (B-20)', () => {
  it('is the exported, named-rule form of the superRefine body: twelve rules, unique ids, in source order', async () => {
    const { CROSS_FIELD_RULES } = await import('./schema');
    const ids = CROSS_FIELD_RULES.map((r) => r.id);
    expect(ids).toEqual([
      'slots-unique',
      'custom-layout-needs-slots',
      'split-pane-slot-collision',
      'widget-layout-scope',
      'aside-layout-scope',
      'message-actions-unique',
      'launcher-icon-url',
      'empty-icon-url',
      'reasoning-open-scope',
      'conversations-need-history',
      'home-link-urls',
      'history-endpoint-url',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of CROSS_FIELD_RULES) expect(r.paths.length, r.id).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts`
Expected: FAIL — `CROSS_FIELD_RULES` is not exported.

- [ ] **Step 4: Restructure schema.ts**

Replace the entire `.superRefine((construct, ctx) => { … })` body (schema.ts:427–556). The rule bodies are the CURRENT code moved verbatim — same conditions, same `path` arrays, same message strings, same ORDER (issue order feeds `validateConstruct`'s problems array). Insert between `ConstructSchema`'s `.strict()` object literal and the `export type Construct` line:

```ts
/** One cross-field rule of the construct format (B-20). The table is the
 *  visibility layer's guard: the builder's RULE_VISIBILITY registry
 *  (src/components/construct-form-paths.ts) is keyed by these ids, and a
 *  key-set-equality test fails any new rule until the builder classifies
 *  it. `paths` names the dotted construct paths the rule READS — panel
 *  metadata, not zod mechanics. Bodies are the pre-table superRefine code
 *  verbatim; behavior (messages included) is pinned by schema.test.ts and
 *  the generated artifact is pinned byte-identical by verify:generated
 *  (superRefine never serializes into z.toJSONSchema output). */
export interface CrossFieldRule {
  id: string;
  paths: readonly string[];
  check: (construct: Construct, ctx: z.RefinementCtx) => void;
}
```

(`Construct` is declared below the schema; forward-referencing the type in an interface is fine — types are erased. If tsc objects to the ordering, type the parameter as `z.infer<typeof ConstructSchema>` — but that self-reference inside the schema's own chain will NOT compile, so instead declare the table with the construct parameter typed structurally: `(construct, ctx)` inferred from the superRefine callsite. The clean shape that compiles is below — the table is defined AFTER the schema, and the superRefine body closes over it via a function declaration, which hoists.)

Concretely, schema.ts becomes:

```ts
  .strict()
  .superRefine((construct, ctx) => {
    for (const rule of CROSS_FIELD_RULES) rule.check(construct, ctx);
  });

export type Construct = z.infer<typeof ConstructSchema>;

export interface CrossFieldRule {
  id: string;
  paths: readonly string[];
  check: (construct: Construct, ctx: z.RefinementCtx) => void;
}

export const CROSS_FIELD_RULES: readonly CrossFieldRule[] = [
  {
    id: 'slots-unique',
    paths: ['slots'],
    check: (construct, ctx) => {
      if (!construct.slots) return;
      const seen = new Set<string>();
      construct.slots.forEach((name, i) => {
        if (seen.has(name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['slots', i],
            message: `duplicate slot name "${name}"`,
          });
        }
        seen.add(name);
      });
    },
  },
  {
    id: 'custom-layout-needs-slots',
    paths: ['layout', 'slots'],
    check: (construct, ctx) => {
      if (construct.layout === 'custom' && (!construct.slots || construct.slots.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slots'],
          message: '"custom" layout requires at least one declared slot — custom IS the slots grain',
        });
      }
    },
  },
  {
    id: 'split-pane-slot-collision',
    paths: ['layout', 'slots'],
    check: (construct, ctx) => {
      if (construct.layout === 'split' && construct.slots) {
        const i = construct.slots.indexOf('pane');
        if (i !== -1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['slots', i],
            message:
              '"pane" collides with the "split" layout\'s own fixed <slot name="pane"> — choose a different slot name',
          });
        }
      }
    },
  },
  {
    id: 'widget-layout-scope',
    paths: ['layout', 'widget'],
    check: (construct, ctx) => {
      if (construct.widget && construct.layout !== 'widget') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['widget'],
          message: '"widget" is only valid on layout: "widget"',
        });
      }
    },
  },
  {
    id: 'aside-layout-scope',
    paths: ['layout', 'aside'],
    check: (construct, ctx) => {
      if (construct.aside && construct.layout !== 'aside') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['aside'],
          message: '"aside" is only valid on layout: "aside"',
        });
      }
    },
  },
  {
    id: 'message-actions-unique',
    paths: ['capabilities.messageActions.user', 'capabilities.messageActions.assistant'],
    check: (construct, ctx) => {
      const messageActions = construct.capabilities?.messageActions;
      if (!messageActions) return;
      // Same reason the slots rule exists: a regex/enum alone can't see
      // across array entries. Per-array only — the two roles may share ids.
      for (const role of ['user', 'assistant'] as const) {
        const list = messageActions[role];
        if (!list) continue;
        const seen = new Set<string>();
        list.forEach((id, i) => {
          if (seen.has(id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['capabilities', 'messageActions', role, i],
              message: `duplicate action id "${id}"`,
            });
          }
          seen.add(id);
        });
      }
    },
  },
  {
    id: 'launcher-icon-url',
    paths: ['widget.launcherIcon'],
    check: (construct, ctx) => {
      if (construct.widget?.launcherIcon && !isSafeUrl(construct.widget.launcherIcon)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['widget', 'launcherIcon'],
          message: 'launcherIcon must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
        });
      }
    },
  },
  {
    id: 'empty-icon-url',
    paths: ['empty.icon'],
    check: (construct, ctx) => {
      if (construct.empty?.icon && !isSafeUrl(construct.empty.icon)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['empty', 'icon'],
          message: 'icon must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
        });
      }
    },
  },
  {
    id: 'reasoning-open-scope',
    paths: ['capabilities.reasoning', 'capabilities.reasoningOpen'],
    check: (construct, ctx) => {
      const reasoning = construct.capabilities?.reasoning;
      const reasoningOpen = construct.capabilities?.reasoningOpen;
      if (reasoningOpen !== undefined && (reasoning === 'compact' || reasoning === 'off')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', 'reasoningOpen'],
          message: '"reasoningOpen" only applies when reasoning is "full" or omitted — "compact"/"off" have no disclosure to open',
        });
      }
    },
  },
  {
    id: 'conversations-need-history',
    paths: ['capabilities.conversations', 'capabilities.history'],
    check: (construct, ctx) => {
      const history = construct.capabilities?.history;
      if (construct.capabilities?.conversations && (!history || history.persistence === 'none')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', 'conversations'],
          message: '"conversations" requires capabilities.history.persistence to be "local" or "endpoint" — a conversation list needs somewhere to persist conversations',
        });
      }
    },
  },
  {
    id: 'home-link-urls',
    paths: ['home.links'],
    check: (construct, ctx) => {
      const URL_SHAPED = /^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/\//;
      for (const [i, link] of (construct.home?.links ?? []).entries()) {
        if (link.href && !isSafeUrl(link.href)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['home', 'links', i, 'href'],
            message: 'href must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
          });
        }
        if (link.icon && URL_SHAPED.test(link.icon) && !isSafeUrl(link.icon)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['home', 'links', i, 'icon'],
            message: 'icon must be a kit icon name or an http(s)/relative URL — no javascript:/data: schemes',
          });
        }
      }
    },
  },
  {
    id: 'history-endpoint-url',
    paths: ['capabilities.history.persistence', 'capabilities.history.url'],
    check: (construct, ctx) => {
      const history = construct.capabilities?.history;
      if (!history) return;
      if (history.persistence === 'endpoint' && !history.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', 'history', 'url'],
          message: '"endpoint" persistence requires a url',
        });
      }
      if (history.persistence !== 'endpoint' && history.url !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['capabilities', 'history', 'url'],
          message: 'url is only valid with "endpoint" persistence',
        });
      }
    },
  },
];
```

Compilation note (do not skip): `CROSS_FIELD_RULES` is declared AFTER the superRefine that iterates it. That is safe at runtime — the superRefine callback only runs at parse time, long after module evaluation — and safe for tsc because `const` hoisting inside a closure is legal (TDZ only bites if a parse happened during module init; none does). If the executor prefers belt-and-braces, wrap the loop as `for (const rule of CROSS_FIELD_RULES) …` inside a hoisted `function runCrossFieldRules(construct: Construct, ctx: z.RefinementCtx)` declared at the bottom — either shape is fine; the exported table and ids are the contract. Delete the old inline body entirely; the pre-table comments (`// Same reason the slots rule exists…`) move with their rules.

- [ ] **Step 5: Run the full schema suite — the pin plus the new test**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts`
Expected: PASS, including every pre-existing message-text assertion (e.g. the `aside` message equality at schema.test.ts:488).

- [ ] **Step 6: Prove the artifact is byte-identical (B-20)**

Run:
```bash
cd packages/ui && npm run build:api && git diff --exit-code -- src/agent-tooling/construct/construct.v1.schema.json ../../apps/docs/public/schemas/construct/v1.json
```
Expected: exit 0, no diff. (build:api also rewrites the template fixture JSONs — those must also be diff-clean; `git status` should show nothing.) Then `pnpm --filter @kitn.ai/ui run verify:generated` — expected PASS.

- [ ] **Step 7: Typecheck and neighbors**

Run: `cd packages/ui && npm run typecheck` (the mcp pass compiles schema.ts under the Node no-DOM tsconfig — the table must not add any DOM-touching import; it adds none).
Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct`
Expected: PASS (templates.test.ts, dev.test.ts, cli.test.ts, codegen.test.ts all still green — the restructure is invisible to them).

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts
git commit -m "refactor(construct): superRefine body becomes the named CROSS_FIELD_RULES table (B-20), behavior-pinned"
```

---

### Task 2: construct-form-paths.ts — path translation + shape walk + visibility registry (spec task 9, second half; B-21 + B-20's key-set test)

**Files:**
- Create: `packages/ui/src/components/construct-form-paths.ts`
- Test: `packages/ui/src/components/construct-form-paths.test.ts`

**Interfaces:**
- Consumes: `CROSS_FIELD_RULES`, `ConstructSchema`, `type Construct` from `../agent-tooling/construct/schema`; `buildableTemplates` from `../agent-tooling/construct/templates` (test only).
- Produces (Task 3 and the builder page consume these exact names):
  - `getAtPath(construct: Construct, path: string): unknown`
  - `setAtPath(construct: Construct, path: string, value: unknown): Construct`
  - `deleteAtPath(construct: Construct, path: string): Construct`
  - `readPresenceBoolean(c, path): boolean` / `writePresenceBoolean(c, path, on): Construct`
  - `PRESENCE_BOOLEAN_PATHS: readonly string[]` / `derivePresenceBooleanPaths(): string[]`
  - `ANCHORED_BOOLEAN_DEFAULTS: Record<string, boolean>` / `readAnchoredBoolean(c, path): boolean` / `writeAnchoredBoolean(c, path, next): Construct`
  - `unwrapSchema(node: z.ZodType): z.ZodType` / `schemaNodeAt(path: string): z.ZodType | undefined` / `controlKindFor(node: z.ZodType): ControlKind`
  - `type ControlKind` (variants: `enum`/`boolean`/`presence`/`string`/`string-list`/`section`/`complex`)
  - `RULE_VISIBILITY: Record<string, RuleVisibility>` / `type RuleVisibility`

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/construct-form-paths.test.ts`:

```ts
/**
 * B-21: the construct itself IS the form state — this module supplies the
 * path-based reads/writes the derived panel edits through. The registry
 * starters are the free round-trip corpus: a no-op edit on every manifest
 * path must be byte-identical (JSON.stringify), which is what "construct →
 * form → construct byte-identical" means when the form holds no copy.
 */
import { describe, expect, it } from 'vitest';
import { CROSS_FIELD_RULES, validateConstruct, type Construct } from '../agent-tooling/construct/schema';
import { buildableTemplates } from '../agent-tooling/construct/templates';
import {
  getAtPath,
  setAtPath,
  deleteAtPath,
  readPresenceBoolean,
  writePresenceBoolean,
  PRESENCE_BOOLEAN_PATHS,
  derivePresenceBooleanPaths,
  ANCHORED_BOOLEAN_DEFAULTS,
  readAnchoredBoolean,
  schemaNodeAt,
  controlKindFor,
  RULE_VISIBILITY,
} from './construct-form-paths';

const starterCases = buildableTemplates().flatMap((t) => [
  { label: t.id, template: t, starter: t.starter },
  ...(t.variants ?? []).map((v) => ({ label: `${t.id}.${v.id}`, template: t, starter: v.starter })),
]);

describe('round-trips over the registry corpus (B-21)', () => {
  it('has a corpus, so the loops below are not vacuous', () => {
    expect(starterCases.length).toBeGreaterThan(0);
  });

  for (const { label, template, starter } of starterCases) {
    it(`${label}: a no-op edit on every manifest path is byte-identical`, () => {
      for (const path of template.controls.flatMap((s) => s.paths)) {
        const cur = getAtPath(starter, path);
        const next = cur === undefined ? deleteAtPath(starter, path) : setAtPath(starter, path, cur);
        expect(JSON.stringify(next), path).toBe(JSON.stringify(starter));
      }
    });
  }

  it('deleteAtPath of an absent key is reference identity — no phantom prune', () => {
    const widget = buildableTemplates().find((t) => t.id === 'widget')!.starter;
    expect(deleteAtPath(widget, 'widget.launcherIcon')).toBe(widget);
    expect(deleteAtPath(widget, 'shell.userMenu')).toBe(widget);
  });
});

describe('delete-on-empty (B-21)', () => {
  const assistant = buildableTemplates().find((t) => t.id === 'assistant')!.starter;

  it('an empty starters list deletes the key — the schema min(1) demands it', () => {
    const next = setAtPath(assistant, 'capabilities.starters', []);
    expect(getAtPath(next, 'capabilities.starters')).toBeUndefined();
    expect(validateConstruct(next).ok).toBe(true);
  });

  it('emptying the last member of an object prunes the object itself', () => {
    // Build a construct whose capabilities holds only starters, then empty it.
    const base = validateConstruct({
      name: 'acme-x', layout: 'fullscreen', provider: { mode: 'mock' },
      capabilities: { starters: ['hi'] },
    });
    if (!base.ok) throw new Error('fixture invalid');
    const next = setAtPath(base.construct, 'capabilities.starters', []);
    expect(getAtPath(next, 'capabilities')).toBeUndefined();
  });

  it('an empty string deletes the key (all schema strings are min(1))', () => {
    const next = setAtPath(assistant, 'header.title', '');
    expect(getAtPath(next, 'header')).toBeUndefined(); // title was header's only member
  });
});

describe('presence-as-boolean (B-21)', () => {
  const widget = buildableTemplates().find((t) => t.id === 'widget')!.starter;

  it('the module list matches the schema-derived z.literal(true) leaves — the drift check', () => {
    expect([...PRESENCE_BOOLEAN_PATHS].sort()).toEqual(derivePresenceBooleanPaths().sort());
  });

  it('on sets literal true; off deletes the key, never writes false', () => {
    expect(readPresenceBoolean(widget, 'capabilities.conversations')).toBe(true);
    const off = writePresenceBoolean(widget, 'capabilities.conversations', false);
    expect(getAtPath(off, 'capabilities.conversations')).toBeUndefined();
    const on = writePresenceBoolean(off, 'capabilities.conversations', true);
    expect(getAtPath(on, 'capabilities.conversations')).toBe(true);
  });
});

describe('default-anchored booleans (B-4/B-21)', () => {
  it('sources.strip anchors to true: absent reads ON; writes are always explicit (stating the default is legal — Research does)', () => {
    expect(ANCHORED_BOOLEAN_DEFAULTS['capabilities.sources.strip']).toBe(true);
    const widget = buildableTemplates().find((t) => t.id === 'widget')!.starter;
    expect(readAnchoredBoolean(widget, 'capabilities.sources.strip')).toBe(true); // absent
    const research = buildableTemplates().find((t) => t.id === 'research')!.starter;
    expect(readAnchoredBoolean(research, 'capabilities.sources.strip')).toBe(true); // stated
  });
});

describe('schema walk (B-19 groundwork)', () => {
  it('every registry control path resolves in ConstructSchema.shape — a renamed path goes red here', () => {
    for (const t of buildableTemplates())
      for (const s of t.controls)
        for (const p of s.paths) expect(schemaNodeAt(p), `${t.id}/${s.id}/${p}`).toBeDefined();
  });

  it('classifies representative nodes', () => {
    expect(controlKindFor(schemaNodeAt('layout')!)).toEqual({ kind: 'enum', options: ['widget', 'fullscreen', 'aside', 'split', 'custom'] });
    expect(controlKindFor(schemaNodeAt('header.themeToggle')!)).toEqual({ kind: 'boolean' });
    expect(controlKindFor(schemaNodeAt('shell.commandPalette')!)).toEqual({ kind: 'presence' });
    expect(controlKindFor(schemaNodeAt('aside.width')!)).toEqual({ kind: 'string' });
    expect(controlKindFor(schemaNodeAt('capabilities.starters')!)).toEqual({ kind: 'string-list' });
    expect(controlKindFor(schemaNodeAt('header.actions')!)).toEqual({ kind: 'complex' });
    expect(controlKindFor(schemaNodeAt('provider')!)).toEqual({ kind: 'complex' });
    const home = controlKindFor(schemaNodeAt('home')!);
    expect(home.kind).toBe('section');
  });
});

describe('RULE_VISIBILITY (B-20 — the key-set-equality drift guard)', () => {
  it('classifies exactly the CROSS_FIELD_RULES ids — a new rule fails until the builder classifies it', () => {
    expect(Object.keys(RULE_VISIBILITY).sort()).toEqual(CROSS_FIELD_RULES.map((r) => r.id).sort());
  });

  it('the two settled treatments carry their targets', () => {
    expect(RULE_VISIBILITY['widget-layout-scope']).toEqual({ treatment: 'hide-section', section: 'widget' });
    expect(RULE_VISIBILITY['aside-layout-scope']).toEqual({ treatment: 'hide-section', section: 'aside' });
    expect(RULE_VISIBILITY['conversations-need-history'].treatment).toBe('disable-with-reason');
    expect(RULE_VISIBILITY['reasoning-open-scope'].treatment).toBe('disable-with-reason');
    expect(RULE_VISIBILITY['history-endpoint-url'].treatment).toBe('show-requires');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/construct-form-paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `construct-form-paths.ts`**

```ts
/**
 * The construct ↔ form translation layer (B-21) plus the schema walk the
 * derived panel builds on (B-19) and the rule-id-keyed visibility registry
 * (B-20). The construct itself IS the form state — the panel is controlled
 * (value/onChange over a whole Construct, the same shape BuilderPanel
 * already uses), and this module supplies the path-based edits:
 *
 *  - presence-as-boolean: section on = object present, off = key DELETED —
 *    never `false`, never `{}` left behind;
 *  - delete-on-empty: an empty array/string deletes its key (the schema's
 *    own min(1) demands it), and an object emptied BY THAT DELETION is
 *    pruned too — but deleting an absent key is identity, so a no-op edit
 *    round-trips byte-identical (the test corpus is every registry starter);
 *  - default-anchored booleans: `capabilities.sources.strip` reads ON when
 *    absent (the kit default IS the on state, B-4); writes stay explicit —
 *    stating the default is legal and Research does it on purpose.
 *
 * Zod 4 notes: `.superRefine()` returns the schema class itself (no
 * ZodEffects wrapper), so `ConstructSchema.shape` is directly walkable;
 * optional/default wrappers unwrap via `def.innerType`.
 */
import { z } from 'zod';
import { ConstructSchema, type Construct } from '../agent-tooling/construct/schema';

// ── path get/set/delete ─────────────────────────────────────────────────────

export function getAtPath(construct: Construct, path: string): unknown {
  let cur: unknown = construct;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function setAtPath(construct: Construct, path: string, value: unknown): Construct {
  if (isEmptyValue(value)) return deleteAtPath(construct, path);
  const keys = path.split('.');
  const set = (node: Record<string, unknown>, i: number): Record<string, unknown> => {
    const key = keys[i];
    if (i === keys.length - 1) return { ...node, [key]: value };
    const child = node[key];
    const childObj =
      child !== null && typeof child === 'object' && !Array.isArray(child)
        ? (child as Record<string, unknown>)
        : {};
    return { ...node, [key]: set(childObj, i + 1) };
  };
  return set(construct as unknown as Record<string, unknown>, 0) as unknown as Construct;
}

export function deleteAtPath(construct: Construct, path: string): Construct {
  const keys = path.split('.');
  // Returns the SAME node when nothing changed (absent key: identity, no
  // phantom prune), undefined when the node emptied and should be pruned.
  const del = (node: Record<string, unknown>, i: number): Record<string, unknown> | undefined => {
    const key = keys[i];
    if (!(key in node)) return node;
    if (i === keys.length - 1) {
      const { [key]: _gone, ...rest } = node;
      return Object.keys(rest).length === 0 ? undefined : rest;
    }
    const child = node[key];
    if (child === null || typeof child !== 'object' || Array.isArray(child)) return node;
    const nextChild = del(child as Record<string, unknown>, i + 1);
    if (nextChild === child) return node;
    if (nextChild === undefined) {
      const { [key]: _empty, ...rest } = node;
      return Object.keys(rest).length === 0 ? undefined : rest;
    }
    return { ...node, [key]: nextChild };
  };
  const out = del(construct as unknown as Record<string, unknown>, 0);
  // The root can never empty: name/layout/provider are required and never
  // addressed by a form path's delete.
  return (out ?? construct) as unknown as Construct;
}

// ── presence-as-boolean ─────────────────────────────────────────────────────

/** Registered copy of the schema's z.literal(true) leaves; the drift check
 *  (derivePresenceBooleanPaths) fails a new presence-style key until it is
 *  translated here. */
export const PRESENCE_BOOLEAN_PATHS = [
  'capabilities.conversations',
  'home.recentConversation',
  'shell.commandPalette',
] as const;

export function readPresenceBoolean(c: Construct, path: string): boolean {
  return getAtPath(c, path) === true;
}

export function writePresenceBoolean(c: Construct, path: string, on: boolean): Construct {
  return on ? setAtPath(c, path, true) : deleteAtPath(c, path);
}

export function derivePresenceBooleanPaths(): string[] {
  const out: string[] = [];
  const visit = (node: z.ZodType, path: string[]): void => {
    const bare = unwrapSchema(node);
    if (bare instanceof z.ZodObject) {
      for (const [key, child] of Object.entries(bare.shape)) visit(child as z.ZodType, [...path, key]);
      return;
    }
    // Zod 4: ZodLiteral exposes its value set as `values`.
    if (bare instanceof z.ZodLiteral && (bare as z.ZodLiteral<boolean>).values?.includes(true as never)) {
      out.push(path.join('.'));
    }
  };
  visit(ConstructSchema as unknown as z.ZodType, []);
  return out;
}

// ── default-anchored booleans (B-4) ─────────────────────────────────────────

export const ANCHORED_BOOLEAN_DEFAULTS: Record<string, boolean> = {
  // Absent = the strip renders (the kit default IS the on state).
  'capabilities.sources.strip': true,
};

export function readAnchoredBoolean(c: Construct, path: string): boolean {
  const v = getAtPath(c, path);
  return typeof v === 'boolean' ? v : (ANCHORED_BOOLEAN_DEFAULTS[path] ?? false);
}

export function writeAnchoredBoolean(c: Construct, path: string, next: boolean): Construct {
  return setAtPath(c, path, next);
}

// ── schema walk (B-19) ──────────────────────────────────────────────────────

export function unwrapSchema(node: z.ZodType): z.ZodType {
  let cur: z.ZodType = node;
  while (cur instanceof z.ZodOptional || cur instanceof z.ZodDefault) {
    cur = (cur.def as { innerType: z.ZodType }).innerType;
  }
  return cur;
}

export function schemaNodeAt(path: string): z.ZodType | undefined {
  let cur: z.ZodType | undefined = ConstructSchema as unknown as z.ZodType;
  for (const key of path.split('.')) {
    if (!cur) return undefined;
    const bare = unwrapSchema(cur);
    if (!(bare instanceof z.ZodObject)) return undefined;
    cur = (bare.shape as Record<string, z.ZodType | undefined>)[key];
  }
  return cur;
}

export type ControlKind =
  | { kind: 'enum'; options: readonly string[] }
  | { kind: 'boolean' }
  | { kind: 'presence' }
  | { kind: 'string' }
  | { kind: 'string-list' }
  | { kind: 'section'; keys: readonly string[] }
  | { kind: 'complex' };

export function controlKindFor(node: z.ZodType): ControlKind {
  const bare = unwrapSchema(node);
  if (bare instanceof z.ZodEnum) return { kind: 'enum', options: bare.options as readonly string[] };
  if (bare instanceof z.ZodBoolean) return { kind: 'boolean' };
  if (bare instanceof z.ZodLiteral) return { kind: 'presence' };
  if (bare instanceof z.ZodString) return { kind: 'string' };
  if (bare instanceof z.ZodArray) {
    const el = unwrapSchema((bare.def as { element: z.ZodType }).element);
    return el instanceof z.ZodString ? { kind: 'string-list' } : { kind: 'complex' };
  }
  if (bare instanceof z.ZodObject) return { kind: 'section', keys: Object.keys(bare.shape) };
  return { kind: 'complex' }; // discriminated unions (provider), records — override territory
}

// ── visibility registry (B-20) ──────────────────────────────────────────────

export type RuleVisibility =
  | { treatment: 'hide-section'; section: string }
  | { treatment: 'disable-with-reason'; path: string; reason: string }
  | { treatment: 'show-requires'; path: string }
  | { treatment: 'reject-only' };

/** Keyed by CROSS_FIELD_RULES ids — the key-set-equality test in
 *  construct-form-paths.test.ts fails a new superRefine rule until the
 *  builder classifies it here (B-20's drift guard). `reject-only` means the
 *  panel surfaces the rule only through validation problems (duplicates,
 *  URL-scheme rejections — states the panel's own editors cannot produce). */
export const RULE_VISIBILITY: Record<string, RuleVisibility> = {
  'slots-unique': { treatment: 'reject-only' },
  'custom-layout-needs-slots': { treatment: 'reject-only' },
  'split-pane-slot-collision': { treatment: 'reject-only' },
  'widget-layout-scope': { treatment: 'hide-section', section: 'widget' },
  'aside-layout-scope': { treatment: 'hide-section', section: 'aside' },
  'message-actions-unique': { treatment: 'reject-only' },
  'launcher-icon-url': { treatment: 'reject-only' },
  'empty-icon-url': { treatment: 'reject-only' },
  'reasoning-open-scope': {
    treatment: 'disable-with-reason',
    path: 'capabilities.reasoningOpen',
    reason: 'Only applies while Reasoning is Full — Compact and Off have no disclosure to open.',
  },
  'conversations-need-history': {
    treatment: 'disable-with-reason',
    path: 'capabilities.conversations',
    reason: 'Needs History set to Local or Endpoint — a conversation list needs somewhere to persist conversations.',
  },
  'home-link-urls': { treatment: 'reject-only' },
  'history-endpoint-url': { treatment: 'show-requires', path: 'capabilities.history.url' },
};
```

Zod-4 API pitfalls for the executor (verify against `node_modules/zod` if a check misbehaves, and adjust the ONE accessor, not the design): `ZodLiteral.values` is the value list in v4 (`.value` throws on multi-literal); `ZodArray`'s element is `def.element` (there is also an `.element` getter — either works); `ZodEnum.options` is stable across v3/v4.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/construct-form-paths.test.ts`
Expected: PASS (all describes, non-vacuous corpus assertion included).

- [ ] **Step 5: Typecheck**

Run: `cd packages/ui && npm run typecheck`
Expected: PASS. (construct-form-paths.ts lives in src/components — the Solid pass, not the mcp pass; importing zod + schema there is fine.)

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/construct-form-paths.ts packages/ui/src/components/construct-form-paths.test.ts
git commit -m "feat(builder): construct-form-paths — path translation, schema walk, and the rule-keyed visibility registry (B-20/B-21)"
```

---

### Task 3: DerivedBuilderPanel — the schema-derived panel (spec task 10; B-19/B-25)

**Files:**
- Modify: `packages/ui/src/components/builder-panel.tsx` (export `Section`, `Field`, `Row` — change `function Section(` → `export function Section(` etc., lines 210/219/231; nothing else)
- Create: `packages/ui/src/components/builder-panel-derived.tsx`
- Test: `packages/ui/src/components/builder-panel-derived.test.tsx`
- Create: `packages/ui/src/elements/builder-derived-panel.stories.tsx`

**Interfaces:**
- Consumes: everything Task 2 produced; `Section`/`Field`/`Row`/`AcceptTypeEditor`/`TagEditor`/`LinksEditor` from `./builder-panel` (LinksEditor and AcceptTypeEditor/TagEditor are already exported or become exported the same way as Section — `TagEditor`, `AcceptTypeEditor`, `LinksEditor` are module-local today: export all three); `ActionRowPicker`, `USER_ACTION_CATALOG`, `ASSISTANT_ACTION_CATALOG` from `./builder-message-actions`; `type BuildableTemplate, TemplateControlSection` from `../agent-tooling/construct/templates`; `type Construct, ConstructProblem, CROSS_FIELD_RULES` from `../agent-tooling/construct/schema`; `BUTTON_VARIANT_NAMES` from `../ui/button-variant-names`; kit controls (`Input`, `Select`, `Switch`, `Button`, `ColorField`).
- Produces: `export function DerivedBuilderPanel(props: DerivedBuilderPanelProps): JSX.Element` with
  ```ts
  export interface DerivedBuilderPanelProps {
    value: Construct;                       // controlled; the panel holds no copy
    onChange: (next: Construct) => void;    // fires a whole next Construct per edit
    template: BuildableTemplate;            // registry entry — controls manifest + starter (section seeds)
    problems?: readonly ConstructProblem[]; // server-side rejections, rendered per path
    class?: string;
  }
  export const FIELD_OVERRIDES: Record<string, /* editor component keyed by schema path */ …>
  ```
  Task 5's builder page mounts this exact component.

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/components/builder-panel-derived.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { DerivedBuilderPanel, FIELD_OVERRIDES } from './builder-panel-derived';
import { schemaNodeAt, getAtPath } from './construct-form-paths';
import { buildableTemplates, type BuildableTemplate } from '../agent-tooling/construct/templates';
import type { Construct } from '../agent-tooling/construct/schema';

afterEach(cleanup);

const tpl = (id: string): BuildableTemplate => buildableTemplates().find((t) => t.id === id)!;

function Controlled(props: { template: BuildableTemplate; onChange?: (v: Construct) => void }) {
  const [value, setValue] = createSignal(props.template.starter);
  return (
    <DerivedBuilderPanel
      value={value()}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      template={props.template}
    />
  );
}

describe('derivation (B-19)', () => {
  for (const t of buildableTemplates()) {
    it(`${t.id}: renders exactly its manifest's sections, in manifest order`, () => {
      const { container } = render(() => <Controlled template={t} />);
      const rendered = [...container.querySelectorAll('[data-derived-section]')].map((el) =>
        el.getAttribute('data-derived-section'),
      );
      expect(rendered).toEqual(t.controls.map((s) => s.id));
    });
  }

  it('override drift: every FIELD_OVERRIDES key is a live schema path — a rename goes red here (B-19)', () => {
    for (const path of Object.keys(FIELD_OVERRIDES)) {
      expect(schemaNodeAt(path), path).toBeDefined();
    }
  });
});

describe('a11y (B-25)', () => {
  it('derived scalar fields carry a real label/for association', () => {
    render(() => <Controlled template={tpl('inAppAssistant')} />);
    // aside.width is a plain derived ZodString — no override, pure walk.
    const width = screen.getByLabelText('Width');
    expect(width.tagName).toBe('INPUT');
    expect(width.getAttribute('id')).toBeTruthy();
  });

  it('grouped controls are named groups', () => {
    render(() => <Controlled template={tpl('research')} />);
    expect(screen.getByRole('group', { name: 'Your messages' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Assistant messages' })).toBeInTheDocument();
  });

  it('disabled-with-reason surfaces the reason to AT via aria-describedby', () => {
    // inAppAssistant's starter has history: local — flip to a starter without it.
    const t = tpl('assistant');
    const noHistory: BuildableTemplate = {
      ...t,
      starter: { ...t.starter, capabilities: { starters: ['hi'] } },
    };
    render(() => <Controlled template={noHistory} />);
    const conversations = screen.getByRole('switch', { name: 'Conversations' });
    expect(conversations).toBeDisabled();
    expect(conversations).toHaveAccessibleDescription(/needs history set to local or endpoint/i);
  });
});

describe('edits go through construct-form-paths', () => {
  it('presence: toggling a z.literal(true) switch off DELETES the key', () => {
    const onChange = vi.fn();
    render(() => <Controlled template={tpl('workspace')} onChange={onChange} />);
    const palette = screen.getByRole('switch', { name: 'Command palette' });
    expect(palette).toHaveAttribute('aria-checked', 'true');
    palette.click();
    const next = onChange.mock.calls.at(-1)![0] as Construct;
    expect(getAtPath(next, 'shell.commandPalette')).toBeUndefined();
  });

  it('anchored boolean: the sources strip switch reads ON from an absent key and writes explicit false', () => {
    const t = tpl('research');
    const absent: BuildableTemplate = {
      ...t,
      starter: {
        ...t.starter,
        capabilities: { ...t.starter.capabilities, sources: undefined },
      } as Construct,
    };
    const onChange = vi.fn();
    render(() => <Controlled template={absent} onChange={onChange} />);
    const strip = screen.getByRole('switch', { name: 'Sources strip' });
    expect(strip).toHaveAttribute('aria-checked', 'true'); // absent = the kit default ON
    strip.click();
    const next = onChange.mock.calls.at(-1)![0] as Construct;
    expect(getAtPath(next, 'capabilities.sources.strip')).toBe(false);
  });

  it('problems render beside their section, pathed', () => {
    render(() => (
      <DerivedBuilderPanel
        value={tpl('widget').starter}
        onChange={() => {}}
        template={tpl('widget')}
        problems={[{ path: 'name', message: 'must be a valid custom-element tag' }]}
      />
    ));
    expect(screen.getByText(/must be a valid custom-element tag/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-panel-derived.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Export the shared pieces from builder-panel.tsx**

In `builder-panel.tsx`, add `export` to `Section`, `Field`, `Row`, `TagEditor`, `AcceptTypeEditor`, `LinksEditor` (six `function` → `export function` edits; no body changes). Run the legacy panel suite to prove nothing moved: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-panel.test.tsx` — expected PASS.

- [ ] **Step 4: Implement `builder-panel-derived.tsx`**

The component in full. Key structure — quote is the implementation, not a sketch:

```tsx
/**
 * DerivedBuilderPanel (B-19/B-25) — the REAL builder inspector: controls
 * DERIVE from ConstructSchema.shape (construct-form-paths' walk), the
 * template registry's `controls` manifest selects and orders the sections,
 * a path-keyed FIELD_OVERRIDES map supplies bespoke editors, and the
 * RULE_VISIBILITY registry (keyed by CROSS_FIELD_RULES ids) drives
 * hide/disable/show-requires. Typed over the REAL Construct — the legacy
 * BuilderPanel (stub BuilderConstruct, four design-round stories) stays
 * as-is; this module reuses its Section/Field/Row rhythm and editors, which
 * is what "keeps the merged section/row rhythm" means once the type
 * changes. Migrating the four template stories onto this panel is recorded
 * follow-up, not this task.
 */
import { type JSX, Show, For, createUniqueId } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { X } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { ColorField } from '../ui/color-field';
import { BUTTON_VARIANT_NAMES } from '../ui/button-variant-names';
import { Section, Field, Row, TagEditor, AcceptTypeEditor, LinksEditor } from './builder-panel';
import { ActionRowPicker, USER_ACTION_CATALOG, ASSISTANT_ACTION_CATALOG } from './builder-message-actions';
import type { BuildableTemplate } from '../agent-tooling/construct/templates';
import type { Construct, ConstructProblem } from '../agent-tooling/construct/schema';
import {
  getAtPath, setAtPath, deleteAtPath,
  readPresenceBoolean, writePresenceBoolean, PRESENCE_BOOLEAN_PATHS,
  readAnchoredBoolean, writeAnchoredBoolean, ANCHORED_BOOLEAN_DEFAULTS,
  schemaNodeAt, controlKindFor, RULE_VISIBILITY,
} from './construct-form-paths';
```

Editor plumbing:

```tsx
export interface FieldEditorProps {
  path: string;
  value: Construct;
  write: (next: Construct) => void;
}

/** Human labels for schema path leaves the walk cannot name well. Fallback:
 *  the last path segment, capitalized. */
const FIELD_LABELS: Record<string, string> = {
  'name': 'Name',
  'aside.width': 'Width',
  'aside.position': 'Position',
  'header.title': 'Header title',
  'header.themeToggle': 'Theme toggle',
  'theme.mode': 'Mode',
  'theme.accent': 'Accent',
  'theme.unreadColor': 'Unread color',
  'capabilities.starters': 'Starters',
  'capabilities.reasoning': 'Reasoning',
  'capabilities.reasoningOpen': 'Reasoning open',
  'capabilities.conversations': 'Conversations',
  'capabilities.sources.strip': 'Sources strip',
  'shell.commandPalette': 'Command palette',
  'widget.position': 'Position',
  'widget.launcherIcon': 'Launcher icon',
  'widget.defaultOpen': 'Open by default',
  'home.recentConversation': 'Recent conversation',
};
export function labelFor(path: string): string {
  const named = FIELD_LABELS[path];
  if (named) return named;
  const leaf = path.split('.').at(-1)!;
  return leaf.charAt(0).toUpperCase() + leaf.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase();
}
```

Bespoke editors, each a `(props: FieldEditorProps) => JSX.Element`, registered in the override map — write each in full in the file:

- `AccentEditor` / `UnreadColorEditor` — `ColorField` with `label={labelFor(props.path)}`, `value={getAtPath(...) as string | undefined}`, `onChange={(v) => props.write(setAtPath(props.value, props.path, v || undefined))}`.
- `AttachmentsEditor` (path `capabilities.attachments`) — presence Row + `AcceptTypeEditor`; on = `setAtPath(value, 'capabilities.attachments', getAtPath(template starter) ?? { accept: ['image/*', 'application/pdf'] })`, off = `deleteAtPath`.
- `HistoryEditor` (path `capabilities.history`) — the persistence `Select` (`none`/`local`/`endpoint`, options derived from `schemaNodeAt('capabilities.history.persistence')`'s enum); when `endpoint`, an inline required `Input` labeled `Endpoint URL` per RULE_VISIBILITY's `show-requires` on `capabilities.history.url` — the reworked shape of the legacy panel's History field. Choosing `none` writes `{ persistence: 'none' }`; do NOT delete the object (the starters state it, and deleting would flip conversations invalid silently — decide loudly: keep what the author wrote).
- `MessageActionsEditor` (paths `capabilities.messageActions.user` and `.assistant`) — bridges `ActionRowPicker` to the schema arrays: rows = the construct's array order with `enabled: true`, then the catalog's remaining ids `enabled: false`; on change, the enabled rows' ids in row order become the array (`setAtPath` — an all-off list deletes the key via delete-on-empty). Legend `Your messages` / `Assistant messages` (the group names the a11y test asserts).
- `TriggerEntriesEditor` (paths `composer.triggers.slash` / `.mention`) — a LinksEditor-style repeater over `{ id, label, description? }` rows (three `Input`s per row + remove + add; ids default from the label slugified `label.toLowerCase().replace(/[^a-z0-9]+/g, '-')`). Empty list deletes the key.
- `HeaderActionsEditor` (path `header.actions`) — repeater of `{ label, variant? }`: `Input` for label, `Select` over `BUTTON_VARIANT_NAMES` (+ an inherit/default blank option mapping to `undefined`). Empty list deletes the key.
- `UserMenuEditor` (path `shell.userMenu`) — presence Row ("User menu") + Name (required) / Plan Inputs. Off deletes.
- `HomeEditor` (path `home`) — presence Row ("Home tab") + greeting title/subtitle Inputs + recent-conversation presence Switch (via write/readPresenceBoolean on `home.recentConversation`) + `LinksEditor` on `home.links`.
- `ProviderEditor` (path `provider`) — the legacy panel's Provider section, typed over the real union: mode Select (`mock`/`endpoint`); when endpoint, URL + wire Selects; switching to mock writes `{ mode: 'mock' }` whole (the union has no partials).

```tsx
export const FIELD_OVERRIDES: Record<string, (props: FieldEditorProps) => JSX.Element> = {
  'theme.accent': AccentEditor,
  'theme.unreadColor': UnreadColorEditor,
  'capabilities.attachments': AttachmentsEditor,
  'capabilities.history': HistoryEditor,
  'capabilities.messageActions.user': UserMessageActionsEditor,
  'capabilities.messageActions.assistant': AssistantMessageActionsEditor,
  'composer.triggers.slash': SlashTriggersEditor,
  'composer.triggers.mention': MentionTriggersEditor,
  'header.actions': HeaderActionsEditor,
  'shell.userMenu': UserMenuEditor,
  'home': HomeEditor,
  'provider': ProviderEditor,
};
```

The generic derived field (B-25 a11y baked in — real label/for, generated ids, aria-describedby wiring):

```tsx
function DerivedField(props: FieldEditorProps & { disabledReason?: string }): JSX.Element {
  const node = () => schemaNodeAt(props.path);
  const kind = () => (node() ? controlKindFor(node()!) : ({ kind: 'complex' } as const));
  const id = createUniqueId();
  const reasonId = `${id}-reason`;
  const label = labelFor(props.path);
  const current = () => getAtPath(props.value, props.path);
  const write = (v: unknown) => props.write(setAtPath(props.value, props.path, v));
  const anchored = () => props.path in ANCHORED_BOOLEAN_DEFAULTS;
  const presence = () => (PRESENCE_BOOLEAN_PATHS as readonly string[]).includes(props.path);
  return (
    <>
      {/* enum → labeled Select; boolean/presence/anchored → Row + Switch;
          string → labeled Input; string-list → TagEditor in a named group */}
      <Show when={kind().kind === 'enum'}>
        <div class="flex flex-col gap-1.5">
          <label for={id} class="text-xs font-medium text-foreground">{label}</label>
          <Select
            id={id}
            options={(kind() as { options: readonly string[] }).options.map((value) => ({ value, label: value }))}
            value={(current() as string | undefined) ?? ''}
            onChange={(e) => write(e.currentTarget.value || undefined)}
          />
        </div>
      </Show>
      <Show when={kind().kind === 'boolean' || presence() || anchored()}>
        <Row label={label} muted={Boolean(props.disabledReason)}>
          <Switch
            checked={
              anchored() ? readAnchoredBoolean(props.value, props.path)
              : presence() ? readPresenceBoolean(props.value, props.path)
              : current() === true
            }
            disabled={Boolean(props.disabledReason)}
            label={label}
            aria-describedby={props.disabledReason ? reasonId : undefined}
            onChange={(on) =>
              props.write(
                anchored() ? writeAnchoredBoolean(props.value, props.path, on)
                : presence() ? writePresenceBoolean(props.value, props.path, on)
                : on ? setAtPath(props.value, props.path, true) : deleteAtPath(props.value, props.path),
              )
            }
          />
        </Row>
        <Show when={props.disabledReason}>
          <p id={reasonId} class="text-xs text-muted-foreground">{props.disabledReason}</p>
        </Show>
      </Show>
      <Show when={kind().kind === 'string'}>
        <div class="flex flex-col gap-1.5">
          <label for={id} class="text-xs font-medium text-foreground">{label}</label>
          <Input id={id} size="sm" value={(current() as string | undefined) ?? ''} onValueInput={(v) => write(v || undefined)} />
        </div>
      </Show>
      <Show when={kind().kind === 'string-list'}>
        <Field label={label}>
          <TagEditor
            tags={(current() as string[] | undefined) ?? []}
            onChange={(next) => write(next)}
            ariaLabel={label}
          />
        </Field>
      </Show>
    </>
  );
}
```

(Prerequisite check for the executor: `ui/input.tsx`'s `Input` and `ui/select.tsx`'s `Select` must forward an `id` prop to the native element — read both before wiring; if either does not, add the passthrough there (a one-line spread/prop add in the kit primitive, which every consumer with a `<label for>` benefits from) rather than faking the association with aria-label. The a11y test's `getByLabelText('Width')` fails honestly until this is true. Same for `Switch` and `aria-describedby`.)

The panel body:

```tsx
export function DerivedBuilderPanel(props: DerivedBuilderPanelProps): JSX.Element {
  const hiddenSections = (): Set<string> => {
    const hidden = new Set<string>();
    for (const [id, vis] of Object.entries(RULE_VISIBILITY)) {
      if (vis.treatment !== 'hide-section') continue;
      // The rule's precondition: the section's key is layout-scoped; hide
      // unless the construct's layout matches the section id.
      if (props.value.layout !== vis.section) hidden.add(vis.section);
    }
    return hidden;
  };
  const disabledReasonFor = (path: string): string | undefined => {
    for (const vis of Object.values(RULE_VISIBILITY)) {
      if (vis.treatment !== 'disable-with-reason' || vis.path !== path) continue;
      if (path === 'capabilities.conversations') {
        const p = props.value.capabilities?.history?.persistence;
        if (!p || p === 'none') return vis.reason;
      }
      if (path === 'capabilities.reasoningOpen') {
        const r = props.value.capabilities?.reasoning;
        if (r === 'compact' || r === 'off') return vis.reason;
      }
    }
    return undefined;
  };
  const problemsFor = (section: { paths: readonly string[] }): ConstructProblem[] =>
    (props.problems ?? []).filter((p) => section.paths.some((sp) => p.path === sp || p.path.startsWith(`${sp}.`)));

  return (
    <div class={cn('flex flex-col divide-y divide-border text-sm text-foreground', props.class)} data-derived-panel>
      <For each={props.template.controls.filter((s) => !hiddenSections().has(s.id))}>
        {(section) => (
          <section class="flex flex-col gap-3 border-b border-border p-4 last:border-b-0" data-derived-section={section.id}>
            <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sectionTitle(section.id)}</h3>
            <For each={section.paths}>
              {(path) => {
                const Override = FIELD_OVERRIDES[path];
                return Override ? (
                  <Dynamic component={Override} path={path} value={props.value} write={props.onChange} />
                ) : (
                  <DerivedField path={path} value={props.value} write={props.onChange} disabledReason={disabledReasonFor(path)} />
                );
              }}
            </For>
            <For each={problemsFor(section)}>
              {(p) => <p class="text-xs text-destructive" role="alert">{p.path}: {p.message}</p>}
            </For>
          </section>
        )}
      </For>
    </div>
  );
}

const SECTION_TITLES: Record<string, string> = {
  identity: 'Identity', theme: 'Theme', header: 'Header', empty: 'Empty state',
  home: 'Home', capabilities: 'Capabilities', messageActions: 'Message actions',
  sources: 'Sources', widget: 'Widget', aside: 'Aside', composerTriggers: 'Composer triggers',
  shell: 'Shell', provider: 'Provider',
};
function sectionTitle(id: string): string { return SECTION_TITLES[id] ?? id; }
```

Note the manifest wrinkle from the LANDED registry (templates.ts:72–107): the `data-derived-section` values are section ids, and section-level derivation nuances are: `identity` = `['name']` (a string leaf — top-level `name` renders through DerivedField); `hide-section` visibility keys off `vis.section` matching the section ID (`'widget'`/`'aside'`), which matches the registry's ids exactly. `problems` with a `name` path land in the identity section by the prefix filter.

- [ ] **Step 5: Run the panel tests**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-panel-derived.test.tsx src/components/builder-panel.test.tsx src/components/construct-form-paths.test.ts`
Expected: PASS all three (legacy panel untouched behaviorally).

- [ ] **Step 6: The story (story-first — owner sees it before wiring)**

Create `packages/ui/src/elements/builder-derived-panel.stories.tsx`:

```tsx
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { DerivedBuilderPanel } from '../components/builder-panel-derived';
import { buildableTemplates, type BuildableTemplate } from '../agent-tooling/construct/templates';
import { validateConstruct, type Construct, type ConstructProblem } from '../agent-tooling/construct/schema';

/**
 * Labs/Builder/Derived panel — the B-19 panel, one story per buildable
 * template, driven by the REAL registry manifest + REAL ConstructSchema
 * walk. The right column shows the live construct JSON plus live
 * validateConstruct problems, so a rejected edit is visible immediately —
 * the same loud path the kai dev --builder write endpoint uses.
 */
function Demo(props: { template: BuildableTemplate }) {
  const [value, setValue] = createSignal<Construct>(props.template.starter);
  const problems = (): ConstructProblem[] => {
    const out = validateConstruct(value());
    return out.ok ? [] : out.problems;
  };
  return (
    <div class="grid h-dvh grid-cols-[380px_1fr] bg-background text-foreground">
      <div class="overflow-y-auto border-r border-border">
        <DerivedBuilderPanel value={value()} onChange={setValue} template={props.template} problems={problems()} />
      </div>
      <pre class="overflow-auto p-4 text-xs">{JSON.stringify(value(), null, 2)}</pre>
    </div>
  );
}

const meta = { title: 'Labs/Builder/Derived panel', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;

export const SupportWidget: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'widget')!} /> };
export const InAppAssistant: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'inAppAssistant')!} /> };
export const Assistant: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'assistant')!} /> };
export const Research: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'research')!} /> };
export const Workspace: StoryObj = { render: () => <Demo template={buildableTemplates().find((t) => t.id === 'workspace')!} /> };
```

(Check the sibling `builder.stories.tsx` import block for the exact Meta/StoryObj import path used in this tree and mirror it.)

- [ ] **Step 7: Typecheck + visual check**

Run: `cd packages/ui && npm run typecheck` — expected PASS.
Run: `pnpm --filter @kitn.ai/ui run storybook` (needs `build:css` first, the script runs it) and eyeball all five stories: sections in manifest order, hidden widget/aside sections on wrong layouts (flip via Raw JSON is not available here — the layout is template-fixed, so widget shows Widget, inAppAssistant shows Aside), conversations disable-with-reason on the no-history state, live problems on clearing the name. Screenshot for the owner per story-first policy; do not claim the look, show it.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/builder-panel.tsx packages/ui/src/components/builder-panel-derived.tsx packages/ui/src/components/builder-panel-derived.test.tsx packages/ui/src/elements/builder-derived-panel.stories.tsx
git commit -m "feat(builder): schema-derived BuilderPanel — manifest-scoped walk, path-keyed overrides, rule-keyed visibility, real label/for a11y (B-19/B-25)"
```

---

### Task 4: The builder page + its build (spec task 11, page half; B-23/B-24)

**Files:**
- Create: `packages/ui/src/builder-app/index.html`
- Create: `packages/ui/src/builder-app/styles.css`
- Create: `packages/ui/src/builder-app/main.tsx`
- Create: `packages/ui/src/builder-app/App.tsx`
- Create: `packages/ui/vite.config.builder-page.ts`
- Modify: `packages/ui/package.json` (`build` script: append `&& vite build --config vite.config.builder-page.ts` after the `vite.config.construct-templates.ts` build)

**Interfaces:**
- Consumes: `DerivedBuilderPanel` (Task 3), `BuilderStart`, `BUILDABLE_BUILDER_TEMPLATES`, `type BuilderTemplateId` from `../components/builder-start`; `WorkspaceVariantPicker` from `../components/builder-workspace-variants`; `buildableTemplates`, `templateById` from `../agent-tooling/construct/templates`; `type Construct, ConstructProblem` from `../agent-tooling/construct/schema`.
- Consumes (HTTP, produced by Task 5 — build against this contract): `GET /api/state` → `{ phase: 'start' | 'panel'; constructPath?: string; construct?: unknown; previewUrl?: string }` · `POST /api/create` body `{ templateId: string; variantId?: string; name: string }` → `200 { previewUrl }` | `422 { problems: ConstructProblem[] }` · `POST /api/construct` body = the whole construct JSON → `200 { ok: true }` | `422 { problems }` · `GET /api/construct` → the file's current JSON · `GET /api/events` → SSE, event `construct` on every watcher regen.
- Produces: `dist/builder-page/` (index.html + hashed assets), served statically by Task 5's server.

- [ ] **Step 1: styles + config**

`src/builder-app/styles.css` (B-24 — reuse `solid.css`; it already `@import`s `./theme.css` and `./kit-base.css`, so importing theme.css again would be a duplicate — the ruling's "plus theme.css" is satisfied through solid.css itself):

```css
@import "tailwindcss" source(none);
@import "../../solid.css";
@source "../components";
@source "../ui";
@source ".";
```

`vite.config.builder-page.ts`:

```ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';

// The kai dev --builder page (B-22..B-24): light-DOM Solid, prebuilt at kit
// build time so the CLI's "second thin server" serves static files and
// compiles nothing at consumer runtime. base './' because dev.ts serves it
// from an arbitrary port's root.
export default defineConfig({
  root: resolve(__dirname, 'src/builder-app'),
  base: './',
  plugins: [solid()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: resolve(__dirname, 'dist/builder-page'),
    emptyOutDir: true,
  },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>kai builder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`main.tsx`:

```tsx
import { render } from 'solid-js/web';
import { App } from './App';
import './styles.css';

render(() => <App />, document.getElementById('root')!);
```

- [ ] **Step 2: App.tsx — the whole flow (B-23)**

Write in full:

```tsx
/**
 * The kai dev --builder page (B-22/B-23): Start screen over the registry
 * (buildable cards + the scratch row), WorkspaceVariantPicker for the one
 * multi-variant family, a constructTagName prompt, then the derived panel
 * beside an iframe of the generated project's own Vite dev server. The
 * construct FILE is the single source of truth: every edit POSTs to the
 * validate-then-write endpoint (a rejection reports pathed problems and
 * writes nothing — the last-good preview stands), and external hand-edits
 * flow back in through the SSE 'construct' event the watcher broadcasts.
 */
import { createSignal, createResource, onMount, onCleanup, Show } from 'solid-js';
import { BuilderStart, BUILDABLE_BUILDER_TEMPLATES, type BuilderTemplateId } from '../components/builder-start';
import { WorkspaceVariantPicker, type WorkspaceVariantId } from '../components/builder-workspace-variants';
import { DerivedBuilderPanel } from '../components/builder-panel-derived';
import { buildableTemplates, type BuildableTemplate } from '../agent-tooling/construct/templates';
import type { Construct, ConstructProblem } from '../agent-tooling/construct/schema';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

type Screen =
  | { step: 'start' }
  | { step: 'variant'; templateId: 'workspace' }
  | { step: 'name'; templateId: BuilderTemplateId; variantId?: WorkspaceVariantId }
  | { step: 'panel' };

/** Scratch is not a registry template (builder-start.tsx's own rule): a bare
 *  fullscreen mock chat, edited through a default manifest of every
 *  non-layout-scoped section. */
const SCRATCH_TEMPLATE: BuildableTemplate = {
  id: 'assistant', // manifest/type anchor only; the id is never shown for scratch
  name: 'Scratch',
  description: 'A bare chat, everything off.',
  availability: 'buildable',
  starter: { name: 'my-chat', layout: 'fullscreen', provider: { mode: 'mock' } },
  controls: [
    { id: 'identity', paths: ['name'] },
    { id: 'theme', paths: ['theme.accent', 'theme.mode', 'theme.unreadColor'] },
    { id: 'header', paths: ['header.title'] },
    { id: 'capabilities', paths: ['capabilities.starters', 'capabilities.attachments', 'capabilities.history', 'capabilities.conversations', 'capabilities.reasoning', 'capabilities.reasoningOpen'] },
    { id: 'provider', paths: ['provider'] },
  ],
};

export function App() {
  const [screen, setScreen] = createSignal<Screen>({ step: 'start' });
  const [template, setTemplate] = createSignal<BuildableTemplate>(SCRATCH_TEMPLATE);
  const [construct, setConstruct] = createSignal<Construct | undefined>();
  const [previewUrl, setPreviewUrl] = createSignal<string | undefined>();
  const [problems, setProblems] = createSignal<readonly ConstructProblem[]>([]);
  const [pickedId, setPickedId] = createSignal<BuilderTemplateId | undefined>();
  const [name, setName] = createSignal('');
  const [confirmSwitch, setConfirmSwitch] = createSignal(false);

  onMount(async () => {
    const state = await (await fetch('/api/state')).json();
    if (state.phase === 'panel') {
      setConstruct(state.construct as Construct);
      setPreviewUrl(state.previewUrl);
      // With an existing file there is no picked template: default to the
      // scratch manifest, which edits the common sections. (Recorded
      // decision — a construct file carries no template id, and guessing
      // one from shape would be a silent decision.)
      setScreen({ step: 'panel' });
    }
    const events = new EventSource('/api/events');
    events.addEventListener('construct', async () => {
      const raw = await (await fetch('/api/construct')).json();
      setConstruct(raw as Construct);
      setProblems([]);
    });
    onCleanup(() => events.close());
  });

  const templateFor = (id: BuilderTemplateId): BuildableTemplate =>
    id === 'scratch' ? SCRATCH_TEMPLATE : buildableTemplates().find((t) => t.id === id) ?? SCRATCH_TEMPLATE;

  const onPick = (id: BuilderTemplateId) => {
    setPickedId(id);
    if (id === 'workspace') setScreen({ step: 'variant', templateId: 'workspace' });
    else {
      setName(templateFor(id).starter.name);
      setScreen({ step: 'name', templateId: id });
    }
  };

  const create = async (variantId?: WorkspaceVariantId) => {
    const res = await fetch('/api/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId: pickedId(), variantId, name: name() }),
    });
    const body = await res.json();
    if (!res.ok) { setProblems(body.problems ?? []); return; }
    setTemplate(templateFor(pickedId()!));
    setConstruct(body.construct as Construct);
    setPreviewUrl(body.previewUrl);
    setProblems([]);
    setScreen({ step: 'panel' });
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const onEdit = (next: Construct) => {
    setConstruct(next); // optimistic — the panel stays live while typing
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const res = await fetch('/api/construct', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.status === 422) setProblems((await res.json()).problems ?? []);
      else setProblems([]);
    }, 300);
  };

  const switchTemplate = async (id: BuilderTemplateId) => {
    // T-2: switching templates resets the construct to the new starter —
    // confirmed by the dialog that opened this path. The NAME is preserved
    // (it is the author's identity choice, not template data).
    const starter = templateFor(id).starter;
    const next = { ...starter, name: construct()?.name ?? starter.name } as Construct;
    setTemplate(templateFor(id));
    setConfirmSwitch(false);
    onEdit(next);
  };

  return (
    <div class="min-h-dvh bg-background text-foreground">
      <Show when={screen().step === 'start'}>
        <main class="mx-auto max-w-4xl p-8">
          <h1 class="mb-1 text-lg font-semibold">Start a construct</h1>
          <p class="mb-6 text-sm text-muted-foreground">Pick a template. You will get a live preview and a construct file you own.</p>
          <BuilderStart templates={BUILDABLE_BUILDER_TEMPLATES} value={pickedId()} onSelect={onPick} />
        </main>
      </Show>
      <Show when={screen().step === 'variant'}>
        <main class="mx-auto max-w-4xl p-8">
          <WorkspaceVariantPicker
            onBack={() => setScreen({ step: 'start' })}
            onSelect={(variantId) => { setName(templateFor('workspace').starter.name); setScreen({ step: 'name', templateId: 'workspace', variantId }); }}
          />
        </main>
      </Show>
      <Show when={screen().step === 'name'}>
        {(_) => {
          const s = screen() as Extract<Screen, { step: 'name' }>;
          return (
            <main class="mx-auto flex max-w-md flex-col gap-3 p-8">
              <label for="construct-name" class="text-sm font-medium">Element name</label>
              <Input id="construct-name" value={name()} onValueInput={setName} placeholder="acme-support" />
              <p class="text-xs text-muted-foreground">The emitted custom-element tag: lowercase, with a hyphen (e.g. acme-support).</p>
              <For each={problems()}>{(p) => <p role="alert" class="text-xs text-destructive">{p.path}: {p.message}</p>}</For>
              <div class="flex gap-2">
                <Button variant="outline" onClick={() => setScreen({ step: 'start' })}>Back</Button>
                <Button onClick={() => create(s.variantId)}>Create</Button>
              </div>
            </main>
          );
        }}
      </Show>
      <Show when={screen().step === 'panel' && construct()}>
        <div class="grid h-dvh grid-cols-[380px_1fr]">
          <div class="flex flex-col overflow-y-auto border-r border-border">
            <div class="flex items-center justify-between border-b border-border p-3">
              <span class="text-sm font-semibold">{template().name}</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmSwitch(true)}>Switch template</Button>
            </div>
            <Show when={confirmSwitch()}>
              <div class="flex flex-col gap-2 border-b border-border bg-muted p-3" role="alertdialog" aria-label="Switch template">
                <p class="text-xs">Switching resets this construct to the new template's starter. Your name is kept; everything else is replaced.</p>
                <BuilderStart templates={BUILDABLE_BUILDER_TEMPLATES} onSelect={(id) => switchTemplate(id)} />
                <Button variant="outline" size="sm" onClick={() => setConfirmSwitch(false)}>Cancel</Button>
              </div>
            </Show>
            <DerivedBuilderPanel value={construct()!} onChange={onEdit} template={template()} problems={problems()} />
          </div>
          <Show when={previewUrl()} fallback={<p class="p-8 text-sm text-muted-foreground">Preview starting…</p>}>
            <iframe title="preview" src={previewUrl()} class="h-full w-full border-0" />
          </Show>
        </div>
      </Show>
    </div>
  );
}
```

(Add the missing `For` import from solid-js. The `role="alertdialog"` confirm is deliberately inline rather than a portal Dialog — the page is a dev tool; if the kit's `ui/dialog` drops in cleanly, prefer it, but do not block on it.)

- [ ] **Step 3: Wire the build**

In `packages/ui/package.json`'s `build` script, append `&& vite build --config vite.config.builder-page.ts` immediately after `vite build --config vite.config.construct-templates.ts`.

- [ ] **Step 4: Build the page and verify output**

Run: `cd packages/ui && npx vite build --config vite.config.builder-page.ts`
Expected: `dist/builder-page/index.html` + `assets/*.js` + `assets/*.css` written; the CSS bundle contains the kit tokens (`grep -l -- --color-primary dist/builder-page/assets/*.css` finds a file).

- [ ] **Step 5: Typecheck**

Run: `cd packages/ui && npm run typecheck` — expected PASS (src/builder-app compiles under the Solid pass; if the pass's include globs miss `src/builder-app`, extend the include in the same tsconfig the components use — check `tsconfig.json`'s include before assuming).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/builder-app packages/ui/vite.config.builder-page.ts packages/ui/package.json
git commit -m "feat(builder): the kai dev --builder page — start/variant/name/panel flow over solid.css, prebuilt into dist/builder-page (B-23/B-24)"
```

---

### Task 5: `kai dev --builder` — flag, second server, validate-then-write (spec task 11, CLI half; B-22/B-23)

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/dev.ts` (append; `dev()` untouched)
- Modify: `packages/ui/src/agent-tooling/construct/cli.ts` (USAGE + `parseDevArgs` + dev case)
- Test: `packages/ui/src/agent-tooling/construct/dev.test.ts`, `packages/ui/src/agent-tooling/construct/cli.test.ts`

**Interfaces:**
- Consumes: `DerivedBuilderPanel`'s HTTP contract from Task 4 (state/create/construct/events routes); registry via `buildableTemplates`/`templateById` from `./templates`; existing dev.ts exports (`workDirFor`, `ensureInstalled`, `regenTurn`); `generateProject`/`writeProject` from `./codegen`; `validateConstruct` from `./schema`.
- Produces:
  - `export function atomicWriteJson(abs: string, value: unknown): void`
  - `export function handleConstructPut(raw: unknown, abs: string): { ok: true; construct: Construct } | { ok: false; problems: ConstructProblem[] }`
  - `export function createEventHub(): { attach(res: ServerResponse): void; broadcast(event: string): void }`
  - `export function builderPageDir(): string` and `export function serveBuilderAsset(urlPath: string, rootDir: string): { file: string; type: string } | undefined`
  - `export async function devBuilder(constructPath: string | undefined, opts?: { io?: CliIo; uiSpec?: string; port?: number; previewPort?: number }): Promise<never>`
  - `export function parseDevArgs(rest: string[]): { uiSpec?: string; builder: boolean; path?: string }` from cli.ts

- [ ] **Step 1: Write the failing tests**

Append to `dev.test.ts`:

```ts
import { mkdtempSync, readFileSync as readF, writeFileSync as writeF, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { atomicWriteJson, handleConstructPut, createEventHub, serveBuilderAsset } from './dev';

describe('kai dev --builder internals (B-22)', () => {
  const goodRaw = { name: 'demo-widget', layout: 'widget', provider: { mode: 'mock' } };

  it('handleConstructPut: a rejection reports pathed problems and NEVER writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-builder-'));
    const abs = join(dir, 'demo.construct.json');
    writeF(abs, JSON.stringify(goodRaw));
    const before = readF(abs, 'utf8');
    const out = handleConstructPut({ ...goodRaw, layout: 'sidebar' }, abs);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'layout')).toBe(true);
    expect(readF(abs, 'utf8')).toBe(before);
  });

  it('handleConstructPut: a valid body is written atomically — pretty JSON + trailing newline, RAW body preserved (no zod defaults injected), no tmp litter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-builder-'));
    const abs = join(dir, 'demo.construct.json');
    writeF(abs, '{}');
    // theme WITHOUT mode: zod's .default('system') must NOT leak into the file.
    const body = { ...goodRaw, theme: { accent: '#e91e63' } };
    const out = handleConstructPut(body, abs);
    expect(out.ok).toBe(true);
    const onDisk = JSON.parse(readF(abs, 'utf8')) as Record<string, unknown>;
    expect((onDisk.theme as Record<string, unknown>).mode).toBeUndefined();
    expect(readF(abs, 'utf8').endsWith('\n')).toBe(true);
    expect(readdirSync(dir)).toEqual(['demo.construct.json']); // tmp renamed away
  });

  it('event hub broadcasts to attached responses as SSE frames', () => {
    const hub = createEventHub();
    const frames: string[] = [];
    hub.attach({
      writeHead: () => {},
      write: (chunk: string) => { frames.push(chunk); return true; },
      on: () => {},
    } as never);
    hub.broadcast('construct');
    expect(frames.some((f) => f.includes('event: construct'))).toBe(true);
  });

  it('serveBuilderAsset refuses path traversal out of the page dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-page-'));
    writeF(join(dir, 'index.html'), '<!doctype html>');
    expect(serveBuilderAsset('/', dir)?.file.endsWith('index.html')).toBe(true);
    expect(serveBuilderAsset('/../../../etc/passwd', dir)).toBeUndefined();
    expect(serveBuilderAsset('/%2e%2e/%2e%2e/etc/passwd', dir)).toBeUndefined();
  });
});
```

Append to `cli.test.ts`:

```ts
import { parseDevArgs } from './cli';

describe('kai dev --builder flag parse (B-22/B-23)', () => {
  it('plain dev: path positional, no builder', () => {
    expect(parseDevArgs(['demo.construct.json'])).toEqual({ uiSpec: undefined, builder: false, path: 'demo.construct.json' });
  });
  it('--builder with no path is legal (the Start screen), with a path goes straight to the panel', () => {
    expect(parseDevArgs(['--builder'])).toEqual({ uiSpec: undefined, builder: true, path: undefined });
    expect(parseDevArgs(['--builder', 'demo.construct.json'])).toEqual({ uiSpec: undefined, builder: true, path: 'demo.construct.json' });
    expect(parseDevArgs(['demo.construct.json', '--builder'])).toEqual({ uiSpec: undefined, builder: true, path: 'demo.construct.json' });
  });
  it('--ui composes with --builder, same parse dev/compile already use', () => {
    expect(parseDevArgs(['--builder', '--ui', 'file:/x.tgz', 'demo.construct.json'])).toEqual({ uiSpec: 'file:/x.tgz', builder: true, path: 'demo.construct.json' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/dev.test.ts src/agent-tooling/construct/cli.test.ts`
Expected: FAIL — the new exports don't exist.

- [ ] **Step 3: Implement in dev.ts (append below `dev()`; imports merged at top: add `renameSync`, `createServer` + `type ServerResponse`/`IncomingMessage` from `node:http`, `extname`, `fileURLToPath` from `node:url`, `buildableTemplates` from `./templates`)**

```ts
// ── kai dev --builder (B-22/B-23) ───────────────────────────────────────────
// A SECOND, thin server beside the loop above — dev() itself is untouched
// (plain `kai dev` stays byte-identical). The builder page is PREBUILT into
// dist/builder-page at kit build time (vite.config.builder-page.ts), so at
// consumer runtime this server compiles nothing: it serves static files,
// exposes ONE validate-then-write endpoint (the construct FILE is the sole
// state), and iframes the generated project's own Vite dev server. Deviation
// from the spec's "thin Vite server" wording, recorded in the plan: a
// runtime Vite server would need vite + the Solid compiler resolvable at
// the CLI's runtime for zero benefit — the page needs no runtime compile,
// and node:http keeps plain kai dev's dependency graph unchanged.

export function atomicWriteJson(abs: string, value: unknown): void {
  const tmp = `${abs}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, abs);
}

/** The ONE write doorway (B-22): validate, then atomically write the RAW
 *  body — not the parsed construct, whose zod defaults (theme.mode) would
 *  silently rewrite the author's file. A rejection returns pathed problems
 *  and touches nothing. */
export function handleConstructPut(
  raw: unknown,
  abs: string,
): { ok: true; construct: Construct } | { ok: false; problems: ConstructProblem[] } {
  const out = validateConstruct(raw);
  if (!out.ok) return out;
  atomicWriteJson(abs, raw);
  return { ok: true, construct: out.construct };
}

export function createEventHub(): { attach: (res: ServerResponse) => void; broadcast: (event: string) => void } {
  const clients = new Set<ServerResponse>();
  return {
    attach(res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      clients.add(res);
      res.on('close', () => clients.delete(res));
    },
    broadcast(event) {
      for (const res of clients) res.write(`event: ${event}\ndata: {}\n\n`);
    },
  };
}

const ASSET_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

/** Resolve a request path inside the prebuilt page dir; undefined on
 *  traversal or a miss. Root serves index.html. */
export function serveBuilderAsset(urlPath: string, rootDir: string): { file: string; type: string } | undefined {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = resolve(rootDir, rel);
  if (!file.startsWith(resolve(rootDir) + '/') && file !== resolve(rootDir, 'index.html')) return undefined;
  if (!existsSync(file)) return undefined;
  return { file, type: ASSET_TYPES[extname(file)] ?? 'application/octet-stream' };
}

/** dist/builder-page relative to the BUNDLED cli (dist/construct-cli.es.js). */
export function builderPageDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'builder-page');
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function devBuilder(
  constructPath: string | undefined,
  opts: { io?: CliIo; uiSpec?: string; port?: number; previewPort?: number } = {},
): Promise<never> {
  const io = opts.io ?? { log: (s: string) => console.log(s), error: (s: string) => console.error(s) };
  const port = opts.port ?? 4400;
  const previewPort = opts.previewPort ?? 4401;
  const pageDir = builderPageDir();
  if (!existsSync(join(pageDir, 'index.html'))) {
    io.error(`Missing build artifact: ${pageDir} — the builder page ships prebuilt. Run \`nx build ui\` (or npm run build in packages/ui) and try again.`);
    process.exit(1);
  }

  const hub = createEventHub();
  let abs = constructPath ? resolve(constructPath) : undefined;
  let previewUrl: string | undefined;

  const boot = async (absPath: string): Promise<void> => {
    const readRaw = (): unknown => JSON.parse(readFileSync(absPath, 'utf8'));
    const first = validateConstruct(readRaw());
    if (!first.ok) {
      for (const p of first.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
      throw new Error('construct invalid');
    }
    const dir = workDirFor(first.construct.name, process.cwd());
    const files = generateProject(first.construct, { uiSpec: opts.uiSpec });
    writeProject(files, dir);
    await ensureInstalled(dir, files, io);
    // Same rename-surviving directory watch as dev() — see its comment.
    const base = basename(absPath);
    watch(dirname(absPath), (_event, filename) => {
      if (filename !== base) return;
      regenTurn(readRaw, { write: writeProject }, dir, { uiSpec: opts.uiSpec }, io);
      hub.broadcast('construct'); // hand-edits flow into the open builder
    });
    const vite = spawn('npm', ['run', 'dev', '--', '--port', String(previewPort), '--strictPort'], {
      cwd: dir,
      stdio: 'inherit',
    });
    const killVite = () => vite.kill();
    process.once('exit', killVite);
    process.once('SIGINT', killVite);
    process.once('SIGTERM', killVite);
    previewUrl = `http://localhost:${previewPort}/`;
    io.log(`previewing <${first.construct.name}> at ${previewUrl}`);
  };

  if (abs) await boot(abs);

  const server = createServer(async (req, res) => {
    const send = (code: number, body: unknown): void => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = req.url ?? '/';
      if (req.method === 'GET' && url === '/api/state') {
        return send(200, abs
          ? { phase: 'panel', constructPath: abs, construct: JSON.parse(readFileSync(abs, 'utf8')), previewUrl }
          : { phase: 'start' });
      }
      if (req.method === 'GET' && url === '/api/construct') {
        if (!abs) return send(404, { problems: [{ path: '', message: 'no construct yet' }] });
        return send(200, JSON.parse(readFileSync(abs, 'utf8')));
      }
      if (req.method === 'GET' && url === '/api/events') return hub.attach(res);
      if (req.method === 'POST' && url === '/api/construct') {
        if (!abs) return send(409, { problems: [{ path: '', message: 'create a construct first' }] });
        const out = handleConstructPut(await readJsonBody(req), abs);
        return out.ok ? send(200, { ok: true }) : send(422, { problems: out.problems });
      }
      if (req.method === 'POST' && url === '/api/create') {
        if (abs) return send(409, { problems: [{ path: '', message: 'a construct already exists in this session' }] });
        const body = (await readJsonBody(req)) as { templateId?: string; variantId?: string; name?: string };
        const template = buildableTemplates().find((t) => t.id === body.templateId);
        const starter: unknown = body.templateId === 'scratch' || !template
          ? { name: body.name, layout: 'fullscreen', provider: { mode: 'mock' } }
          : {
              ...(template.variants?.find((v) => v.id === body.variantId)?.starter ?? template.starter),
              name: body.name,
            };
        const validated = validateConstruct(starter);
        if (!validated.ok) return send(422, { problems: validated.problems });
        const target = resolve(process.cwd(), `${body.name}.construct.json`);
        atomicWriteJson(target, starter);
        abs = target;
        await boot(target);
        return send(200, { previewUrl, construct: starter });
      }
      const asset = serveBuilderAsset(url, pageDir);
      if (asset) {
        res.writeHead(200, { 'content-type': asset.type });
        return res.end(readFileSync(asset.file));
      }
      // SPA fallback: any other GET serves the page shell.
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(readFileSync(join(pageDir, 'index.html')));
      }
      return send(404, { problems: [{ path: '', message: 'not found' }] });
    } catch (err) {
      return send(400, { problems: [{ path: '', message: err instanceof Error ? err.message : String(err) }] });
    }
  });
  server.listen(port, () => io.log(`kai builder at http://localhost:${port}/ — the construct file stays yours.`));
  return new Promise<never>(() => {});
}
```

- [ ] **Step 4: cli.ts — flag + routing**

Add beside `parseUiFlag` (exported):

```ts
/** `kai dev` arg parse, exported for tests: `--builder` opens the visual
 *  builder (path optional — no path = the Start screen, B-23); plain dev
 *  keeps requiring a path. */
export function parseDevArgs(rest: string[]): { uiSpec: string | undefined; builder: boolean; path: string | undefined } {
  const { uiSpec, positional } = parseUiFlag(rest);
  const builder = positional.includes('--builder');
  const path = positional.filter((a) => a !== '--builder')[0];
  return { uiSpec, builder, path };
}
```

Replace the `case 'dev'` body:

```ts
    case 'dev': {
      const { uiSpec, builder, path } = parseDevArgs(rest);
      if (builder) {
        const { devBuilder } = await import('./dev');
        await devBuilder(path, { io, uiSpec });
        return 0; // unreachable; devBuilder never resolves
      }
      if (!path) {
        io.error(USAGE);
        return 2;
      }
      const { dev } = await import('./dev');
      await dev(path, { io, uiSpec });
      return 0; // unreachable; dev() never resolves
    }
```

USAGE gains one line after the `kai dev` row:

```
  kai dev --builder [construct.json]     visual builder + live preview (no file = start from a template)
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/dev.test.ts src/agent-tooling/construct/cli.test.ts`
Expected: PASS — the new describes plus every pre-existing dev/cli test (the plain-dev pin).

- [ ] **Step 6: Typecheck + the untouched-loop gates**

Run: `cd packages/ui && npm run typecheck` — expected PASS.
Run: `pnpm --filter @kitn.ai/ui run lint:silent-drops` — expected PASS untouched (nothing here discriminates a MessagePart).
Do NOT run `verify:construct` here if the concurrent gate agent is running it; it lands in Task 6's epic-end pass.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/dev.ts packages/ui/src/agent-tooling/construct/dev.test.ts packages/ui/src/agent-tooling/construct/cli.ts packages/ui/src/agent-tooling/construct/cli.test.ts
git commit -m "feat(construct): kai dev --builder — second thin server, atomic validate-then-write endpoint, start-screen create flow (B-22/B-23)"
```

---

### Task 6: Epic-end gates + the B-26 IVP/Playwright pass

**Files:** none committed except screenshots/report under `docs/superpowers/research/2026-08-28-builder-ivp/` (per repo custom for IVP evidence).

**Interfaces:** consumes everything; produces the evidence B-26 demands. The builder is UI: it is shown before it is claimed.

- [ ] **Step 1: Full builds + gates (mind the cache caveats)**

```bash
nx build ui --skip-nx-cache
nx typecheck ui --skip-nx-cache
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run verify:construct
pnpm --filter @kitn.ai/ui run verify:pack
```
Expected: all PASS. `verify:construct` proves the plain `kai dev`/eject path unchanged (its template fixtures ride from phase 2); `verify:pack` proves the new `dist/builder-page` doesn't blow the pack ceiling — if it does, that is a real finding to surface (the ceiling is 13.15 MiB per the standing memo), not to waive.

- [ ] **Step 2: The IVP pass — real `kai dev --builder`, per template**

Setup (once): pack the local build the way cli.test.ts's `packedUiTarball` does — `cd packages/ui && npm pack --pack-destination /tmp` — and export `UI_SPEC=file:/tmp/kitn.ai-ui-<version>.tgz`. Work in a fresh temp dir per template.

Per buildable template (`widget`, `inAppAssistant`, `assistant`, `research`, `workspace` — read the list from `buildableTemplates()`, never this line):

1. In an empty dir: `node <repo>/packages/ui/bin/mcp.js dev --builder --ui "$UI_SPEC"` (or the dist cli entry — whatever `kai dev` resolves to in this tree; check `bin/mcp.js`'s routing first).
2. Playwright: open `http://localhost:4400/`, screenshot the Start screen (buildable cards + scratch row only — NO Voice card: menu-honesty assertion).
3. Pick the template (workspace: assert the variant step renders, pick `artifactPreview`), accept the default name, Create. Wait for the iframe; screenshot.
4. **Flip one control per manifest section** and assert the iframe reflects it after HMR (poll the iframe DOM): e.g. header title text change appears in the preview header; theme accent changes the primary color; a starter added appears as a chip; widget position start/end flips the dock corner; aside width changes the rail's computed width; research: sources strip toggle; workspace: a header action button appears. Screenshot each section's before/after or one composite per template.
5. **Rejected edit**: clear the Name field (or set it to `Support` — no hyphen). Assert the panel shows the pathed problem, the construct FILE on disk still holds the last valid JSON (`cat <name>.construct.json`), and the iframe preview still renders (last-good stands). Screenshot.
6. **Hand-edit inflow**: edit the construct file in a shell (`jq '.header.title = "From the editor"' … > tmp && mv tmp …`) and assert the open panel updates (SSE) and the preview HMRs.
7. Kill the process; assert no orphaned vite (`pgrep -f "vite.*--port 4401"` empty).

Save screenshots to `docs/superpowers/research/2026-08-28-builder-ivp/<template>-*.png` with a short `README.md` index listing what each shows and the exact commands run. Per the supervisor policy the verification is executed by a separate ivp-verifier agent that writes its OWN probe from this checklist, not by the implementing agent.

- [ ] **Step 3: Commit the evidence**

```bash
git add docs/superpowers/research/2026-08-28-builder-ivp
git commit -m "docs(builder): B-26 IVP evidence — per-template kai dev --builder HMR round-trips, rejection stands, screenshots"
```

---

## Self-Review (performed while writing; re-run after execution)

**Spec coverage, B-19..B-26:**
- B-19 (derive; registry scopes; override map keyed by schema path; renamed path fails a drift test) → Task 3 (+ Task 2's `schemaNodeAt` and the override-drift test).
- B-20 (rule table; behavior + messages pinned; artifact byte-identical; visibility registry keyed by rule ids; key-set-equality test) → Task 1 + Task 2.
- B-21 (one small module; presence-as-boolean; delete-on-empty; anchored booleans; both-direction round-trips over every starter; presence-path drift check) → Task 2.
- B-22 (builder in `kai dev`; second thin server; iframe preview; one atomic validate-then-write endpoint; file is sole state; plain `kai dev` byte-identical; not a plugin in the generated project) → Tasks 4+5.
- B-23 (Start screen over the registry, buildable + scratch; Workspace variant step; name prompt via the tag rules; existing file → straight to panel; T-2 switch confirm) → Tasks 4+5.
- B-24 (solid.css reuse, light DOM, no new reset) → Task 4.
- B-25 (label/for, fieldset/legend or named groups, aria-describedby on disabled-with-reason; asserted by accessible-name queries) → Task 3.
- B-26 (unit + typecheck fresh/skip-cache + IVP/Playwright with per-section flips, rejection standing, screenshots) → Task 6.

**Known deviations recorded loudly (see also the plan-author report):** the second server is node:http over a PREBUILT page, not a literal runtime Vite server (B-22's wording); the derived panel is a NEW component reusing the legacy panel's exported pieces rather than an in-place rework of `builder-panel.tsx` (B-19's wording) — migrating the four template design stories onto it is recorded follow-up; the T-2 switch preserves `name`; scratch's manifest is page-local data.

**Placeholder scan:** no TBDs; every editor in Task 3's override map is named with its exact behavior; the two large code files (App.tsx, dev.ts additions) are quoted in full.

**Type consistency:** `DerivedBuilderPanelProps`/`FieldEditorProps`/`ControlKind`/`RuleVisibility`/`CrossFieldRule` names match across Tasks 1–5; the HTTP contract in Task 4's Interfaces matches Task 5's routes verbatim (`/api/state`, `/api/create`, `/api/construct` GET+POST, `/api/events`; 422 `{ problems }`).
