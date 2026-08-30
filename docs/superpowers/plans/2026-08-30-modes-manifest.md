# Multi-mode as a manifest of constructs — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task. Work through the tasks in order — each task lands green on its own gates before the next starts, EXCEPT the one designed red gate called out in the sequencing note below. Mark each `- [ ]` checkbox `- [x]` as you complete it. Follow TDD: write the failing test, watch it fail for the RIGHT reason, implement minimally, watch it pass, commit.

**Goal.** Ship multi-mode as a **manifest of constructs**: a `.construct.json` whose `modes: [{ id, label, file }]` references SIBLING construct files, each of which is a plain, individually-valid, individually-ejectable construct — validated as a tree by the CLI, emitted as ONE web component whose thin shell swaps modes with a segmented switcher, offered by `kai dev`/`eject`/`compile`, the create-kai wizard and the `kai` MCP under a new `'cli'` availability tier.

**Architecture.** `modes` is a new OPTIONAL top-level key on the SAME `ConstructSchema` — no second file kind, no nested vocabulary. Three new `CROSS_FIELD_RULES` carry the whole manifest contract (`modes-or-surface` makes `layout`/`provider` required only when `modes` is absent, and rejects every other key beside `modes`; `modes-unique-ids`; `modes-unique-files`). Cross-FILE resolution never enters `schema.ts`: a new Node-only sibling module `construct/tree.ts` owns `loadConstruct`/`loadConstructTree` and returns a `ConstructTree` that `cli.ts` and `dev.ts` both drive `generateProject` from. Codegen grows ONE branch: the `src/`-interior emit is factored behind a path prefix, each mode is emitted at `src/modes/<id>/` by the SAME emitters a standalone eject uses (byte-identical, pinned), and `src/App.tsx` becomes a thin shell over the kit's own `Tabs variant="segmented"` mounting exactly one mode through `<Show>`. The gate (`verify-construct.mjs`) grows a third derived axis of manifest cells plus a self-test fault; the registry gains a Multi-mode entry on a new `'cli'` tier that every menu derives from.

**Tech stack.** SolidJS · zod 4 (single source of truth; the JSON Schema artifact is DERIVED by `scripts/gen-construct-schema.mjs`) · vitest (`--project=unit`, jsdom) · Node `.mjs` gate scripts · pnpm + NX from the repo root · esbuild (create-kai bundle, fixture generator).

**Spec.** `docs/superpowers/specs/2026-08-30-modes-manifest-design.md` (rulings R1–R7, the "Complications in the current tree" list, and the six-task breakdown). Read it alongside this plan — every task below argues from a ruling and names it.

## Global constraints (bind every task)

- **vocabulary-never-logic.** No handlers, no expressions, no code-in-JSON. `modes` names files; it never says what a mode *does*.
- **one-chat-surface-per-mode.** Exactly one mode is mounted at a time (`<Show>`, never CSS-hidden), and a mode's emitted App is literally what ejecting that mode file standalone emits — one chat surface, one provider loop, per mode.
- **widen-never-restructure.** Every schema addition is an optional sibling; no existing key moves. Every construct that validates today must validate byte-identically after Task 1. The `layout`/`provider` loosening (R1d) is the ONE base-object change and it only ADDS accepted inputs.
- **derive-don't-type.** The manifest's legal-key set is computed from the construct's OWN keys against the four allowed names, never a restated list of the illegal ones. Gate axes read the schema artifact. Menus read the registry. **No number in any doc that a script can print** — name the command instead.
- **menu-honesty / decide loudly.** Every menu offers exactly what works through it: the `'cli'` tier is offered by the wizard and the MCP (whose chains work end to end) and excluded from `BuilderStart` and `/api/create` (whose chain does not, yet). A silent drop, a silent truncation, a swallowed error or a silent fallback is a defect — a mode's overridden `theme`, a mode layout whose fixed-position chrome escapes the shell, a missing sibling file, and a manifest reaching a builder screen that cannot edit it are each announced in words.
- **Loud rejection, never sanitizing.** A bad mode `id`, a non-sibling `file`, a duplicate, a nested manifest: rejected with a path and a reason. Nothing is coerced.
- **Untrusted-text discipline.** Every construct-authored string reaching emitted code is `JSON.stringify`'d at its emit site — mode `label` and `id` included — never a raw JSX attribute string and never concatenated into CSS text. Closed schema enums may interpolate directly.
- **`schema.ts` must stay Node-clean.** It compiles under `tsconfig.mcp.json`'s Node-only, no-DOM pass (transitively via `mcp/tools/construct.ts`) and is imported by the browser builder bundle: it may never gain `node:fs`, a DOM type, or a `.tsx` value import. Cross-file resolution therefore lives in `tree.ts`, not here.
- **`templates.ts` stays a leaf.** Data + type-only imports ONLY — no zod, no `./schema` value import, no components (create-kai's `bundleGraphProblem` goes red on its own otherwise). Starter validity lives in the TEST layer.
- **Conventional commits** (release-please drives versioning; pre-1.0 so `feat!` = minor). Never hand-edit `package.json`'s version. Commit messages below are the SUBJECT line only — the executor adds the repo's `Co-Authored-By:` / `Claude-Session:` trailers.
- **Run every command from the repo root** unless a step says `cd packages/ui` (only `npm run build:api`, `npm run typecheck`, `npm run verify:construct` and `node scripts/verify-construct.mjs` run inside `packages/ui`).
- **NX cache caveats (CLAUDE.md).** `nx build ui` can hit the cache and skip the derived-artifact generators while printing success — when artifacts must regenerate, use `npm run build:api` inside `packages/ui`, or `--skip-nx-cache`. `nx typecheck ui`'s cached verdict has been wrong in BOTH directions — trust `npm run typecheck` inside `packages/ui` or `nx typecheck ui --skip-nx-cache`.
- **FOREGROUND only.** Never background a build, a gate or a test run. `verify:construct` takes minutes (real npm installs, real vite builds, network) — wait for it.
- **Reports paste RAW output.** Every "run it and watch it fail" step means paste the actual failing lines into the task report, not a summary. A cell count, a rule count or a timing is read off the tool's own output, never retyped from this plan.
- **Sequencing note (the one designed red gate).** The moment Task 1 regenerates the schema artifact with `modes`, `verify:construct` HARD-FAILS at startup: `top-level key "modes" is in the schema but has no fixture valuer`. That is spec complication 4 working exactly as built. **Task 1 ends by running the gate and pasting that failure; Task 2 begins by re-running it and watching it still fire, then closes it.** Do not "fix" it inside Task 1, do not run `verify:construct` as a green gate between them, and do not treat Tasks 1 and 2 as separately mergeable — they are ONE PR unit. Every other gate stays green per task.

---

## File structure

| File | Role after this arc |
|---|---|
| `packages/ui/src/agent-tooling/construct/schema.ts` | + `ModeSchema`, the `modes` key, `layout`/`provider` optional, 3 new `CROSS_FIELD_RULES`, `SurfaceConstruct`/`asSurface`/`isManifest` |
| `packages/ui/src/agent-tooling/construct/tree.ts` | **NEW.** The resolution layer: `loadConstruct` (moved), `loadConstructTree`, `resolveModes`, `treeInput`, `treeNotices`. Node-only; the ONE place a mode `file` reaches `readFileSync` |
| `packages/ui/src/agent-tooling/construct/codegen.ts` | + `ResolvedMode`, `GenerateOptions.modes`, `emitSurfaceFiles(prefix)`, `emitManifestApp`, host-need over modes, the `--kai-surface-height` var |
| `packages/ui/src/agent-tooling/construct/cli.ts` | validate/eject/compile drive `loadConstructTree`; re-exports `loadConstruct` |
| `packages/ui/src/agent-tooling/construct/dev.ts` | `regenTurn` over a tree, basename-SET watch, `/api/state`'s additive `manifest`, whole-tree POST guard, `/api/create`'s loud cli-tier rejection |
| `packages/ui/src/agent-tooling/construct/templates.ts` | + `'multiMode'` id, `CliTemplate`/`'cli'` tier, `cliTemplates()`, `inferTemplateId`'s modes branch, the Multi-mode entry + `modeStarters` |
| `packages/ui/src/components/construct-form-paths.ts` | + `RULE_VISIBILITY` entries for the 3 new rules |
| `packages/ui/src/components/builder-start.tsx` | + the Multi-mode illustration (the exhaustive Record forces it); menus unchanged |
| `packages/ui/src/builder-app/App.tsx` | + the read-only manifest screen beside the live preview |
| `packages/ui/src/agent-tooling/mcp/tools/construct.ts` | manifest-aware VALID line; cli-tier templates in the statements, naming the builder deferral |
| `packages/ui/scripts/verify-construct.mjs` | `modes` → `TOP_LEVEL_EXCLUDED`; the manifest axis; sibling-aware `ejectCell`; self-test probe 4 |
| `packages/ui/scripts/verify-generated-sync.mjs` | + the three new fixture paths in `GENERATED` |
| `packages/create-kai/src/wizard.ts` | `cliTemplates()` menu, the `layout === 'widget'` fix, multi-file `emitConstruct` |
| `docs/coupling-map.md` | §4: the templates row grows the multi-file starter; a NEW row for `TOP_LEVEL_EXCLUDED`'s `modes` ↔ the manifest axis |
| `apps/docs/src/content/docs/guides/multi-mode.mdx` | **NEW.** The public manifest page |

---

## Task 1 — Schema: the `modes` vocabulary

Implements R1a–R1d and spec complications 1, 2 and 5.

**Files**
- Modify: `packages/ui/src/agent-tooling/construct/schema.ts`
- Modify: `packages/ui/src/agent-tooling/construct/schema.test.ts`
- Modify: `packages/ui/src/components/construct-form-paths.ts` (`RULE_VISIBILITY`)
- Modify: `packages/ui/src/agent-tooling/construct/cli.ts` (the two lines tsc forces; Task 2 replaces the branch)
- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts` (signature narrowing only — no emit change)
- Modify: `packages/ui/src/agent-tooling/mcp/tools/construct.ts` (the `VALID:` line tsc forces)
- Modify: `packages/create-kai/src/wizard.ts` (`WIZARD_REGISTRY` classification — its drift test fails otherwise)
- Regenerate: `packages/ui/src/agent-tooling/construct/construct.v1.schema.json` + `apps/docs/public/schemas/construct/v1.json` (via `build:api`)

**Interfaces**
- Produces: `modes?: { id: string; label: string; file: string }[]` on `Construct` · `export type SurfaceConstruct = Construct & { layout: NonNullable<Construct['layout']>; provider: NonNullable<Construct['provider']> }` · `export function asSurface(c: Construct): SurfaceConstruct` · `export function isManifest(c: Construct): boolean` · three new `CROSS_FIELD_RULES` ids: `modes-or-surface`, `modes-unique-ids`, `modes-unique-files`.
- Consumes: nothing new. `CHAT_MESSAGE_ACTIONS`/`BUTTON_VARIANT_NAMES` imports are untouched.

### Steps

- [ ] **1.1 Write the failing schema tests.** Append to `packages/ui/src/agent-tooling/construct/schema.test.ts` (the file's `minimal` fixture is already in scope at the top):

  ```ts
  const manifest = {
    name: 'acme-console',
    theme: { accent: '#7c3aed', mode: 'dark' },
    modes: [
      { id: 'assistant', label: 'Assistant', file: './assistant.construct.json' },
      { id: 'computer', label: 'Computer', file: './computer.construct.json' },
    ],
  };

  describe('modes: the manifest shape (R1a)', () => {
    it('accepts a manifest: $schema + name + theme + modes, and nothing else', () => {
      expect(validateConstruct(manifest).ok).toBe(true);
      expect(validateConstruct({ ...manifest, $schema: 'https://ui.kitn.ai/schemas/construct/v1.json' }).ok).toBe(true);
      // theme is optional on a manifest too
      expect(validateConstruct({ name: 'acme-console', modes: manifest.modes }).ok).toBe(true);
    });

    it('rejects fewer than 2 modes (a one-mode manifest IS the mode file) and more than 6', () => {
      expect(validateConstruct({ ...manifest, modes: [manifest.modes[0]] }).ok).toBe(false);
      const seven = Array.from({ length: 7 }, (_, i) => ({
        id: `m${i}`, label: `M${i}`, file: `./m${i}.construct.json`,
      }));
      expect(validateConstruct({ ...manifest, modes: seven }).ok).toBe(false);
      const six = seven.slice(0, 6);
      expect(validateConstruct({ ...manifest, modes: six }).ok).toBe(true);
    });

    it('rejects a mode id that is not a legible ident (it becomes src/modes/<id>/ and a component name)', () => {
      for (const id of ['Assistant', '1st', 'has_underscore', 'has space', '-leading', '']) {
        const out = validateConstruct({ ...manifest, modes: [{ ...manifest.modes[0], id }, manifest.modes[1]] });
        expect(out.ok, `id "${id}" should be rejected, not sanitized`).toBe(false);
      }
    });

    it('rejects an empty label and any key beyond id/label/file (.strict())', () => {
      expect(validateConstruct({ ...manifest, modes: [{ ...manifest.modes[0], label: '' }, manifest.modes[1]] }).ok).toBe(false);
      expect(
        validateConstruct({ ...manifest, modes: [{ ...manifest.modes[0], icon: 'x' }, manifest.modes[1]] }).ok,
      ).toBe(false);
    });
  });

  describe('modes[].file: sibling paths only (R1c)', () => {
    const withFile = (file: string) => ({ ...manifest, modes: [{ ...manifest.modes[0], file }, manifest.modes[1]] });

    it('rejects absolute paths, .. escapes, subdirectories, backslashes, URL schemes and the wrong extension', () => {
      for (const file of [
        '/etc/passwd.construct.json',
        '../sibling.construct.json',
        './nested/mode.construct.json',
        '.\\mode.construct.json',
        'https://evil.example/mode.construct.json',
        'assistant.construct.json',
        './assistant.json',
        './Assistant.construct.json',
        './.construct.json',
      ]) {
        const out = validateConstruct(withFile(file));
        expect(out.ok, `file "${file}" should be rejected`).toBe(false);
        if (!out.ok) {
          expect(out.problems.some((p) => p.message.includes('relative sibling path'))).toBe(true);
        }
      }
    });

    it('accepts a kebab-ish sibling basename', () => {
      for (const file of ['./assistant.construct.json', './multi-mode-2.construct.json', './a.construct.json']) {
        expect(validateConstruct(withFile(file)).ok, file).toBe(true);
      }
    });
  });

  describe('modes cross-field rules (R1a/R1c)', () => {
    it('rejects duplicate mode ids, pathed at the second occurrence', () => {
      const out = validateConstruct({
        ...manifest,
        modes: [manifest.modes[0], { ...manifest.modes[1], id: 'assistant' }],
      });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.problems.some((p) => p.path === 'modes.1.id' && /duplicate mode id "assistant"/.test(p.message))).toBe(true);
      }
    });

    it('rejects two modes sharing one surface file', () => {
      const out = validateConstruct({
        ...manifest,
        modes: [manifest.modes[0], { ...manifest.modes[1], file: './assistant.construct.json' }],
      });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.problems.some((p) => p.path === 'modes.1.file' && /duplicate mode file/.test(p.message))).toBe(true);
      }
    });
  });

  describe('modes-or-surface: mutual exclusion (R1b/R1d)', () => {
    it('rejects EVERY key outside $schema/name/theme/modes beside modes, naming the key', () => {
      const beside: Record<string, unknown> = {
        layout: 'fullscreen',
        provider: { mode: 'mock' },
        capabilities: { starters: ['hi'] },
        header: { title: 'x' },
        empty: { title: 'x' },
        home: {},
        cards: [{ name: 'a_card', schema: { type: 'object' } }],
        slots: ['pane-a'],
        widget: { defaultOpen: true },
        aside: { position: 'end' },
        shell: { commandPalette: true },
        composer: { triggers: { slash: [{ id: 'a', label: 'A' }] } },
        userId: 'u1',
      };
      for (const [key, value] of Object.entries(beside)) {
        const out = validateConstruct({ ...manifest, [key]: value });
        expect(out.ok, `"${key}" must be rejected beside modes`).toBe(false);
        if (!out.ok) {
          expect(
            out.problems.some(
              (p) =>
                p.path === key &&
                p.message ===
                  `"${key}" belongs in a mode's construct file, not the manifest — the manifest is the app shell; modes carry the surfaces.`,
            ),
            `"${key}" needs the loud key-naming message, got ${JSON.stringify(out.problems)}`,
          ).toBe(true);
        }
      }
    });

    it('still REQUIRES layout and provider when modes is absent (every construct that validated before still does)', () => {
      expect(validateConstruct(minimal).ok).toBe(true);
      const noLayout = validateConstruct({ name: 'acme-support', provider: { mode: 'mock' } });
      expect(noLayout.ok).toBe(false);
      if (!noLayout.ok) {
        expect(noLayout.problems.some((p) => p.path === 'layout')).toBe(true);
      }
      const noProvider = validateConstruct({ name: 'acme-support', layout: 'widget' });
      expect(noProvider.ok).toBe(false);
      if (!noProvider.ok) {
        expect(noProvider.problems.some((p) => p.path === 'provider')).toBe(true);
      }
      const neither = validateConstruct({ name: 'acme-support' });
      expect(neither.ok).toBe(false);
      if (!neither.ok) {
        expect(neither.problems.map((p) => p.path).sort()).toEqual(['layout', 'provider']);
      }
    });
  });

  describe('asSurface / isManifest (the narrowing every emitter below the manifest branch uses)', () => {
    it('isManifest is true for a manifest and false for a surface construct', async () => {
      const { isManifest, asSurface } = await import('./schema');
      const m = validateConstruct(manifest);
      const s = validateConstruct(minimal);
      expect(m.ok && isManifest(m.construct)).toBe(true);
      expect(s.ok && isManifest(s.construct)).toBe(false);
      if (s.ok) expect(asSurface(s.construct).layout).toBe('widget');
      if (m.ok) expect(() => asSurface(m.construct)).toThrow(/manifest/);
    });
  });
  ```

  In the SAME step, update the existing `CROSS_FIELD_RULES` id-list test at the bottom of the file — it currently asserts twelve ids and will go red by design:

  ```ts
    it('is the exported, named-rule form of the superRefine body: fifteen rules, unique ids, in source order', async () => {
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
        'modes-or-surface',
        'modes-unique-ids',
        'modes-unique-files',
      ]);
  ```

  (Leave the two assertions after it — unique ids, non-empty `paths` — untouched.)

- [ ] **1.2 Watch them fail.** Run:

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts
  ```

  Expected: the manifest-accept cases fail because `"modes" is not construct vocabulary` (the `.strict()` rejection) AND because `layout`/`provider` are still required; the id-list test fails with twelve ids where fifteen were expected; the `asSurface` import fails (`asSurface is not a function`). Paste the raw failures. If the "still REQUIRES layout and provider" test is the one that fails, STOP — that is the widen-never-restructure guarantee and it must be green before and after.

- [ ] **1.3 Add `ModeSchema` and the `modes` key.** In `schema.ts`, directly above `export const ConstructSchema`, add:

  ```ts
  /** One entry of a MANIFEST's mode list (R1a). A mode's config IS a sibling
   *  construct file — no nested construct vocabulary ever enters this schema,
   *  which is the whole point of the manifest shape (owner ruling 2026-08-30).
   *  `.strict()` like every other object here: an unknown key is a loud
   *  rejection, not a silently ignored one. */
  const ModeSchema = z
    .object({
      /** Same shape as a slot name — it becomes an emitted identifier fragment
       *  (`src/modes/<id>/`, a Solid component alias) and the switcher's value,
       *  so it must be a legible ident, REJECTED not sanitized. Duplicates are
       *  a cross-field rule below: a regex cannot see across array entries. */
      id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'mode ids must be kebab-case, starting with a letter'),
      /** The switcher's visible text. Construct-authored/untrusted, like
       *  `header.title` — JSON.stringify'd at its one emit site. */
      label: z.string().min(1),
      /** A RELATIVE SIBLING path. This ONE regex simultaneously forbids
       *  absolute paths, `..` escapes, backslashes, URL schemes and
       *  subdirectories: the value reaches `readFileSync` in the CLI/dev layer
       *  and a directory watcher's filter set, so path traversal is made
       *  INEXPRESSIBLE rather than filtered (R1c). A deliberate design payoff:
       *  the whole tree lives in one directory, so `kai dev`'s existing
       *  single-directory watcher already covers it (R4a). */
      file: z
        .string()
        .regex(
          /^\.\/[a-z0-9][a-z0-9-]*\.construct\.json$/,
          'must be a relative sibling path like "./assistant.construct.json"',
        ),
    })
    .strict();

  /** The only top-level keys legal BESIDE `modes` (R1b). Held as a set and
   *  compared against the construct's OWN keys by the `modes-or-surface` rule
   *  below — never as a restated list of the illegal ones, so a key added to
   *  this schema tomorrow is manifest-illegal on its own with no edit here. */
  const MANIFEST_LEGAL_KEYS = new Set(['$schema', 'name', 'theme', 'modes']);
  ```

  Inside the `ConstructSchema` object, change `layout` and `provider` to optional and add `modes` as the LAST key (after `composer`, so the emitted artifact's key order stays append-only):

  ```ts
      // R1d, the one base-object loosening this format needs: required only
      // when `modes` is ABSENT, enforced by the `modes-or-surface` cross-field
      // rule below. Widen-never-restructure — every construct that validated
      // before still validates byte-identically; the only new acceptance is
      // the manifest shape. Two consequences, both recorded loudly rather than
      // discovered: (1) superRefine never serializes into z.toJSONSchema
      // output, so the published construct/v1.json no longer lists
      // layout/provider under `required` and an EXTERNAL validator will pass a
      // construct with neither `layout` nor `modes` — `validateConstruct`, the
      // only doorway to codegen, still rejects it, the same artifact-invisible
      // class as every existing cross-field rule; (2) `layout`/`provider` are
      // now `T | undefined` on the inferred type, so every emitter below the
      // manifest branch takes `SurfaceConstruct` (below) rather than testing
      // for undefined it can never see.
      layout: z.enum(['widget', 'fullscreen', 'aside', 'split', 'custom']).optional(),
      provider: ProviderSchema.optional(),
  ```

  ```ts
      /** MULTI-MODE (owner ruling 2026-08-30): a manifest of constructs, no
       *  nesting. Each entry names a SIBLING construct file that is a plain,
       *  individually-valid, individually-ejectable construct; the emitted
       *  shell mounts and swaps them. Presence makes this file a MANIFEST:
       *  `layout`/`provider` are no longer required and every surface key is
       *  rejected (R1b, `modes-or-surface` below). min(2) is menu-honesty — a
       *  one-mode manifest is just the mode file itself, and a switcher with
       *  one entry is a lie. max(6) is the same bounded-list posture as
       *  `slots`' max(8) and `starters`' max(6): a segmented control past six
       *  entries is a different component. Cross-FILE resolution is NOT here
       *  and never will be — this module compiles under tsconfig.mcp.json's
       *  Node-only pass and is imported by the browser builder bundle, so
       *  readFileSync can never enter it; see construct/tree.ts (R2). */
      modes: z.array(ModeSchema).min(2).max(6).optional(),
  ```

- [ ] **1.4 Add the three cross-field rules.** Append to `CROSS_FIELD_RULES` (order matters — the id-list test pins it):

  ```ts
    {
      id: 'modes-or-surface',
      // The rule reads the WHOLE object, so its panel-metadata paths name the
      // two poles the builder would care about if it ever edited a manifest.
      paths: ['modes', 'layout', 'provider'],
      check: (construct, ctx) => {
        if (!construct.modes) {
          // Absent `modes` → the pre-2026-08-30 contract, unchanged: both keys
          // required, one issue per missing key, pathed at that key.
          if (construct.layout === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['layout'],
              message: 'required — a construct without "modes" must declare a layout',
            });
          }
          if (construct.provider === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['provider'],
              message: 'required — a construct without "modes" must declare a provider',
            });
          }
          return;
        }
        // Present `modes` → the manifest IS the app shell (owner sketch).
        // Every surface fact — the provider, the header, identity — belongs to
        // the mode file that owns that surface, so each mode stays
        // individually ejectable with NOTHING withheld. `theme` stays here
        // because the emitted shell is ONE custom element with ONE host and
        // ONE shadow root: a per-mode theme on a shared host would be a lie
        // (R1b/R3d). DERIVED, not restated: the construct's own keys are
        // checked against the four legal ones, so a key added to this schema
        // tomorrow is manifest-illegal the day it lands.
        for (const key of Object.keys(construct)) {
          if (MANIFEST_LEGAL_KEYS.has(key)) continue;
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `"${key}" belongs in a mode's construct file, not the manifest — the manifest is the app shell; modes carry the surfaces.`,
          });
        }
      },
    },
    {
      id: 'modes-unique-ids',
      paths: ['modes'],
      check: (construct, ctx) => {
        if (!construct.modes) return;
        // The slots-unique pattern: a regex/enum alone cannot see across array
        // entries. Two modes with one id would collide on src/modes/<id>/ and
        // on the switcher's own value.
        const seen = new Set<string>();
        construct.modes.forEach((mode, i) => {
          if (seen.has(mode.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['modes', i, 'id'],
              message: `duplicate mode id "${mode.id}"`,
            });
          }
          seen.add(mode.id);
        });
      },
    },
    {
      id: 'modes-unique-files',
      paths: ['modes'],
      check: (construct, ctx) => {
        if (!construct.modes) return;
        // Each mode is its OWN surface: two modes may not share one file.
        const seen = new Set<string>();
        construct.modes.forEach((mode, i) => {
          if (seen.has(mode.file)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['modes', i, 'file'],
              message: `duplicate mode file "${mode.file}" — each mode is its own surface`,
            });
          }
          seen.add(mode.file);
        });
      },
    },
  ```

- [ ] **1.5 Add the narrowing helpers.** In `schema.ts`, immediately after `export type Construct = z.infer<typeof ConstructSchema>;`:

  ```ts
  /**
   * A construct that carries a SURFACE — a layout and a provider — rather than
   * a manifest's mode list. `layout`/`provider` are optional on `Construct`
   * only because a MANIFEST omits them (R1d); every emitter below the manifest
   * branch receives a real surface, and the `modes-or-surface` rule is what
   * makes that true of anything `validateConstruct` returned. Naming the
   * narrowing once beats sprinkling non-null assertions through codegen.
   */
  export type SurfaceConstruct = Construct & {
    layout: NonNullable<Construct['layout']>;
    provider: NonNullable<Construct['provider']>;
  };

  /** Presence of `modes` is what makes a construct file a manifest. */
  export function isManifest(c: Construct): boolean {
    return c.modes !== undefined;
  }

  /**
   * Narrow a validated construct to its surface, loudly. Throws rather than
   * returning null: reaching here with a manifest means a caller skipped the
   * mode branch, which would otherwise emit a silently broken project (a
   * `layout: undefined` switch falling through to nothing).
   */
  export function asSurface(c: Construct): SurfaceConstruct {
    if (c.modes || !c.layout || !c.provider) {
      throw new Error(
        `"${c.name}" is a manifest, not a surface construct — modes carry the surfaces (agent-tooling/construct/tree.ts resolves them).`,
      );
    }
    return c as SurfaceConstruct;
  }
  ```

- [ ] **1.6 Run the schema tests green.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts
  ```

  Expected: PASS, including the pre-existing cases (widen-never-restructure). Paste the raw summary.

- [ ] **1.7 Classify the three new rules in `RULE_VISIBILITY`** (spec complication 5 — `construct-form-paths.test.ts`'s key-set-equality test fails every unclassified rule BY DESIGN). Run it first and watch it fail:

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/construct-form-paths.test.ts
  ```

  Expected: `classifies exactly the CROSS_FIELD_RULES ids` fails, listing `modes-or-surface`, `modes-unique-ids`, `modes-unique-files` as unclassified. Then append to `RULE_VISIBILITY` in `packages/ui/src/components/construct-form-paths.ts`:

  ```ts
    // The manifest rules (owner ruling 2026-08-30). All three are
    // `reject-only` for v1 because the builder never EDITS a manifest in this
    // arc (R4b): `kai dev --builder <manifest>` shows a read-only screen
    // naming the per-mode command that does edit it, so there is no panel
    // control for these rules to hide, disable or require. When builder
    // editing of manifests lands, `modes-or-surface` becomes the
    // hide-section rule for every surface section and these entries get
    // revisited — that is the reason they are classified now rather than
    // waived: this registry is the drift guard that will force it.
    'modes-or-surface': { treatment: 'reject-only' },
    'modes-unique-ids': { treatment: 'reject-only' },
    'modes-unique-files': { treatment: 'reject-only' },
  ```

  Re-run the same command. Expected: PASS.

- [ ] **1.8 Fix the type fallout tsc enumerates (spec complication 1).** Run the typecheck FIRST and paste the raw error list — it is the enumeration:

  ```
  pnpm --filter @kitn.ai/ui run typecheck
  ```

  Expected errors, and the fix for each:

  1. `codegen.ts` — `emitLayoutImport`, `emitLayoutOpen`, `emitLayoutClose`: *"Function lacks ending return statement and return type does not include 'undefined'"* (the exhaustive `switch (c.layout)` no longer covers `undefined`). Change all three signatures from `(c: Construct)` to `(c: SurfaceConstruct)` — the switch is exhaustive again and the emitters keep their existing bodies untouched.
  2. `codegen.ts` — `emitProviderImports`, `emitProviderSetup`, `emitCardsImport`, `emitToolsField`: *"'c.provider' is possibly 'undefined'"*. Same fix: `(c: SurfaceConstruct)`.
  3. `codegen.ts` — `emitApp` and `emitCustomApp` call the above: change both to `(c: SurfaceConstruct)`. `generateProject` then reports `Argument of type 'Construct' is not assignable to 'SurfaceConstruct'` at `emitApp(construct)`; for THIS task only, wrap it as `emitApp(asSurface(construct))` (Task 3 replaces that line with the prefix-aware `emitSurfaceFiles`).

     Add the import at the top of `codegen.ts`:

     ```ts
     import { asSurface, type Construct, type SurfaceConstruct } from './schema';
     ```

     (`asSurface` is a VALUE import; `codegen.ts` already imports `node:fs`, so it is Node-only and unaffected by the mcp pass's no-DOM rule.)
  4. `mcp/tools/construct.ts` — `c.layout` / `c.provider.mode` in the `VALID:` line. Replace that one line with a manifest-aware pair:

     ```ts
              c.modes
                ? `VALID: <${c.name}> — a MANIFEST of ${c.modes.length} modes (${c.modes.map((m) => m.id).join(', ')}). Each mode is its own construct file beside it; this tool validates ONE file at a time, so run \`kai validate <manifest>\` to check the whole tree.`
                : `VALID: <${c.name}> (${c.layout}, ${c.provider?.mode}).`,
     ```

     and guard the endpoint follow-up line, which reads the same optional:

     ```ts
              ...(c.provider?.mode === 'endpoint'
     ```
  5. `cli.ts` — `construct.layout` / `construct.provider.mode` in `validate`. Replace the body of the `case 'validate':` block with:

     ```ts
       case 'validate': {
         const construct = loadConstruct(rest[0] ?? '', io);
         if (!construct) return 1;
         if (construct.modes) {
           // TRANSIENT (this commit only — Tasks 1+2 are one PR unit): the
           // schema accepts a manifest before the resolution layer exists, and
           // printing "layout: undefined" would be worse than saying so.
           // Task 2 replaces this branch with the resolved-tree summary.
           io.error(`${resolve(rest[0] ?? '')} is a manifest — mode resolution lands with loadConstructTree in the next commit.`);
           return 1;
         }
         const c = asSurface(construct);
         io.log(`valid construct: <${c.name}> (layout: ${c.layout}, provider: ${c.provider.mode})`);
         const warning = homeRecentConversationWarning(c);
         if (warning) io.log(warning);
         return 0;
       }
     ```

     and extend cli.ts's schema import: `import { asSurface, validateConstruct, type Construct } from './schema';`.

     Note for `eject`/`compile` in this commit: they still call `loadConstruct` and hand the result to `generateProject`, which now throws `asSurface`'s loud message on a manifest. That is a transient stack trace INSIDE this PR unit; Task 2 routes both through `loadConstructTree`. Do not paper over it with a second guard here.

  Re-run `pnpm --filter @kitn.ai/ui run typecheck` until green and paste the final output. (Per CLAUDE.md, trust this command and `nx typecheck ui --skip-nx-cache` — never a cached `nx typecheck ui`.)

- [ ] **1.9 Classify `modes` in create-kai's `WIZARD_REGISTRY`.** Its drift test derives the key list from the real `ConstructSchema`, so a new top-level key fails it. Watch it fail first:

  ```
  pnpm --filter @kitn.ai/ui run build:api && pnpm --filter create-kai test -- wizard
  ```

  Expected: `top-level key "modes" is not classified in WIZARD_REGISTRY`. Then add to `WIZARD_REGISTRY` in `packages/create-kai/src/wizard.ts`, alphabetically beside `home`:

  ```ts
    modes: {
      status: 'not-asked',
      reason:
        'multi-mode is a MANIFEST of sibling construct files, not a field the guided flow composes one answer at a time; Task 5 of this arc offers it as a whole TEMPLATE (the Multi-mode entry writes the manifest and its mode files together), and this entry moves to "stated" then',
    },
  ```

  Re-run the same command. Expected: PASS.

- [ ] **1.10 Regenerate the derived schema artifact.** From `packages/ui`:

  ```
  cd packages/ui && npm run build:api
  ```

  Then check the diff on `src/agent-tooling/construct/construct.v1.schema.json`: `properties.modes` appears, and `required` LOSES `layout` and `provider`. **That `required` weakening is the expected diff (R1d.1), not a bug** — superRefine never serializes, so the published artifact cannot carry the exclusion rules; `validateConstruct` remains the only doorway to codegen. Say so in the task report.

  Then:

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema-artifact.test.ts
  pnpm --filter @kitn.ai/ui run verify:generated
  ```

  Expected: both PASS (the artifact test pins the checked-in copy against `z.toJSONSchema` right now, and the docs-site copy byte-identical).

- [ ] **1.11 Run the whole unit suite.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit
  pnpm --filter create-kai test
  ```

  Expected: PASS. Any failure here is real fallout from the loosening — fix it, do not skip it.

- [ ] **1.12 Watch the designed `verify:construct` hard-fail (the forcing function for Task 2).** From `packages/ui`:

  ```
  cd packages/ui && node scripts/verify-construct.mjs --self-test
  ```

  Expected output, and it must appear:

  ```
  ✗ verify-construct: top-level key "modes" is in the schema but has no fixture valuer — add one to TOP_LEVEL_VALUES in scripts/verify-construct.mjs (or, for a non-emitting spine key, to TOP_LEVEL_EXCLUDED with a reason).
  ```

  Paste it raw. **Do not fix it here.** This is spec complication 4; Task 2 closes it. If the gate does NOT fail, stop and investigate — the derived top-level axis has stopped deriving.

- [ ] **1.13 Commit.**

  ```bash
  git add packages/ui/src/agent-tooling/construct/schema.ts \
          packages/ui/src/agent-tooling/construct/schema.test.ts \
          packages/ui/src/agent-tooling/construct/construct.v1.schema.json \
          packages/ui/src/agent-tooling/construct/cli.ts \
          packages/ui/src/agent-tooling/construct/codegen.ts \
          packages/ui/src/agent-tooling/mcp/tools/construct.ts \
          packages/ui/src/components/construct-form-paths.ts \
          packages/create-kai/src/wizard.ts \
          apps/docs/public/schemas/construct/v1.json
  git commit -m "feat(construct): modes vocabulary — a manifest of sibling constructs"
  ```

---

## Task 2 — Resolution layer + validate + the gate axis

Implements R1e, R2 and R6's `verify:construct` growth; closes the red gate Task 1 opened. **Tasks 1 and 2 are ONE PR unit** — do not merge Task 1 alone.

**Files**
- Create: `packages/ui/src/agent-tooling/construct/tree.ts`
- Create: `packages/ui/src/agent-tooling/construct/tree.test.ts`
- Modify: `packages/ui/src/agent-tooling/construct/cli.ts` (validate/eject/compile through the tree; re-export `loadConstruct`)
- Modify: `packages/ui/src/agent-tooling/construct/cli.test.ts`
- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts` (`ResolvedMode` + `GenerateOptions.modes` — the type contract only; Task 3 emits from it)
- Modify: `packages/ui/scripts/verify-construct.mjs`
- Modify: `docs/coupling-map.md` (§4)

**Interfaces**
- Produces (from `tree.ts`): `export interface ConstructTree` as `{ kind: 'single'; construct: SurfaceConstruct } | { kind: 'manifest'; manifest: Construct; modes: ResolvedMode[] }` · `export function loadConstruct(path: string, io: CliIo): Construct | null` (moved verbatim) · `export function loadConstructTree(path: string, io: CliIo): ConstructTree | null` · `export function resolveModes(manifest: Construct, entryAbs: string): { ok: true; modes: ResolvedMode[] } | { ok: false; problems: ConstructProblem[] }` · `export function treeInput(tree: ConstructTree): { construct: Construct; modes?: readonly ResolvedMode[] }` · `export function treeNotices(tree: ConstructTree): string[]` · `export function treeBasenames(entryAbs: string, tree: ConstructTree): Set<string>`.
- Produces (from `codegen.ts`): `export interface ResolvedMode { id: string; label: string; file: string; construct: Construct }` and `GenerateOptions.modes?: readonly ResolvedMode[]`.
- Consumes: `validateConstruct`, `asSurface`, `type Construct`, `type ConstructProblem`, `type SurfaceConstruct` (Task 1); `accentContrastNotice` (existing, `codegen.ts`); `type CliIo` (`cli.ts`, TYPE-ONLY — see 2.3's note on the import direction).

### Steps

- [ ] **2.1 Re-watch the red gate, then write the failing resolution tests.** First, from `packages/ui`:

  ```
  cd packages/ui && node scripts/verify-construct.mjs --self-test
  ```

  Confirm the `top-level key "modes" … has no fixture valuer` failure from step 1.12 still fires and paste it — this task's job is to close it, and a task that starts green here has nothing to close.

  Then create `packages/ui/src/agent-tooling/construct/tree.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { mkdtempSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { loadConstructTree, resolveModes, treeInput, treeNotices, treeBasenames } from './tree';
  import { validateConstruct, type Construct } from './schema';

  const io = () => {
    const logs: string[] = [];
    const errors: string[] = [];
    return { logs, errors, io: { log: (s: string) => logs.push(s), error: (s: string) => errors.push(s) } };
  };

  const ASSISTANT = {
    name: 'acme-assistant',
    layout: 'fullscreen',
    provider: { mode: 'mock' },
    capabilities: { starters: ['Draft the update'] },
  };
  const COMPUTER = { name: 'acme-computer', layout: 'split', provider: { mode: 'mock' } };
  const MANIFEST = {
    name: 'acme-console',
    theme: { accent: '#7c3aed', mode: 'dark' },
    modes: [
      { id: 'assistant', label: 'Assistant', file: './assistant.construct.json' },
      { id: 'computer', label: 'Computer', file: './computer.construct.json' },
    ],
  };

  /** Write a tree into a fresh temp dir; returns the entry file's absolute path. */
  function tree(files: Record<string, unknown>, entry = 'app.construct.json'): string {
    const dir = mkdtempSync(join(tmpdir(), 'kai-tree-'));
    for (const [name, json] of Object.entries(files)) {
      writeFileSync(join(dir, name), `${JSON.stringify(json, null, 2)}\n`);
    }
    return join(dir, entry);
  }

  describe('loadConstructTree: single (byte-identical to loadConstruct today)', () => {
    it('a construct with no modes resolves to kind "single" and narrows to a surface', () => {
      const { io: sink, errors } = io();
      const out = loadConstructTree(tree({ 'app.construct.json': ASSISTANT }), sink);
      expect(errors).toEqual([]);
      expect(out?.kind).toBe('single');
      if (out?.kind === 'single') expect(out.construct.layout).toBe('fullscreen');
    });

    it('an invalid single construct returns null with the pathed problems already printed', () => {
      const { io: sink, errors } = io();
      const out = loadConstructTree(tree({ 'app.construct.json': { name: 'x', layout: 'nope' } }), sink);
      expect(out).toBeNull();
      expect(errors.join('\n')).toMatch(/is not a valid construct/);
      expect(errors.join('\n')).toMatch(/layout:/);
    });
  });

  describe('loadConstructTree: manifest resolution (R2)', () => {
    it('resolves every mode file against the manifest\'s own directory', () => {
      const { io: sink, errors } = io();
      const out = loadConstructTree(
        tree({
          'app.construct.json': MANIFEST,
          'assistant.construct.json': ASSISTANT,
          'computer.construct.json': COMPUTER,
        }),
        sink,
      );
      expect(errors).toEqual([]);
      expect(out?.kind).toBe('manifest');
      if (out?.kind === 'manifest') {
        expect(out.modes.map((m) => m.id)).toEqual(['assistant', 'computer']);
        expect(out.modes.map((m) => m.construct.name)).toEqual(['acme-assistant', 'acme-computer']);
        expect(out.modes[0].file).toBe('./assistant.construct.json');
      }
    });

    it('a MISSING mode file fails loudly with the mode index, the resolved absolute path and the referring manifest — never a bare ENOENT', () => {
      const { io: sink, errors } = io();
      const entry = tree({ 'app.construct.json': MANIFEST, 'computer.construct.json': COMPUTER });
      expect(loadConstructTree(entry, sink)).toBeNull();
      const printed = errors.join('\n');
      expect(printed).toMatch(/modes\[0\]\.file → .*assistant\.construct\.json: cannot read \(referenced by .*app\.construct\.json\)/);
    });

    it('an INVALID mode file fails with BOTH coordinates: the mode index and the inner problem path', () => {
      const { io: sink, errors } = io();
      const entry = tree({
        'app.construct.json': MANIFEST,
        'assistant.construct.json': ASSISTANT,
        'computer.construct.json': {
          ...COMPUTER,
          capabilities: { history: { persistence: 'endpoint' } },
        },
      });
      expect(loadConstructTree(entry, sink)).toBeNull();
      expect(errors.join('\n')).toMatch(
        /modes\[1\]\.file → .*computer\.construct\.json: capabilities\.history\.url: "endpoint" persistence requires a url/,
      );
    });

    it('reports EVERY broken reference in ONE pass, not just the first', () => {
      const { io: sink, errors } = io();
      const entry = tree({ 'app.construct.json': MANIFEST });
      expect(loadConstructTree(entry, sink)).toBeNull();
      expect(errors.filter((e) => e.includes('cannot read')).length).toBe(2);
    });

    it('rejects a mode file that is ITSELF a manifest — no nesting in v1 (R1e)', () => {
      const { io: sink, errors } = io();
      const entry = tree({
        'app.construct.json': MANIFEST,
        'assistant.construct.json': { name: 'inner-manifest', modes: MANIFEST.modes },
        'computer.construct.json': COMPUTER,
      });
      expect(loadConstructTree(entry, sink)).toBeNull();
      expect(errors.join('\n')).toContain(
        '"./assistant.construct.json" is itself a manifest — a manifest may not reference another manifest (no nesting, v1)',
      );
    });

    it('a manifest naming ITSELF is caught by the same no-nesting rule (the complete cycle story for v1)', () => {
      const { io: sink, errors } = io();
      const selfRef = {
        name: 'acme-console',
        modes: [
          { id: 'a', label: 'A', file: './a.construct.json' },
          { id: 'b', label: 'B', file: './b.construct.json' },
        ],
      };
      const entry = tree({ 'a.construct.json': selfRef, 'b.construct.json': COMPUTER }, 'a.construct.json');
      expect(loadConstructTree(entry, sink)).toBeNull();
      expect(errors.join('\n')).toContain('is itself a manifest');
    });
  });

  describe('resolveModes: the problem form the HTTP write doorway needs', () => {
    it('returns pathed problems rather than printing, so dev.ts can answer 422 with them', () => {
      const entry = tree({ 'app.construct.json': MANIFEST });
      const manifest = validateConstruct(MANIFEST);
      expect(manifest.ok).toBe(true);
      if (!manifest.ok) return;
      const out = resolveModes(manifest.construct, entry);
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.problems.map((p) => p.path)).toEqual(['modes[0].file', 'modes[1].file']);
        expect(out.problems[0].message).toMatch(/cannot read/);
      }
    });
  });

  describe('treeInput / treeBasenames / treeNotices', () => {
    it('treeInput gives generateProject the same call shape for both kinds', () => {
      const single = loadConstructTree(tree({ 'app.construct.json': ASSISTANT }), io().io)!;
      expect(treeInput(single).modes).toBeUndefined();
      const manifest = loadConstructTree(
        tree({
          'app.construct.json': MANIFEST,
          'assistant.construct.json': ASSISTANT,
          'computer.construct.json': COMPUTER,
        }),
        io().io,
      )!;
      expect(treeInput(manifest).construct.name).toBe('acme-console');
      expect(treeInput(manifest).modes?.length).toBe(2);
    });

    it('treeBasenames is the watch filter set: the entry plus every mode file, all in ONE directory (R4a)', () => {
      const entry = tree({
        'app.construct.json': MANIFEST,
        'assistant.construct.json': ASSISTANT,
        'computer.construct.json': COMPUTER,
      });
      const t = loadConstructTree(entry, io().io)!;
      expect([...treeBasenames(entry, t)].sort()).toEqual([
        'app.construct.json',
        'assistant.construct.json',
        'computer.construct.json',
      ]);
    });

    it('treeNotices says out loud that a mode\'s own theme is overridden by the manifest\'s (R3d) — never a silent drop', () => {
      const entry = tree({
        'app.construct.json': MANIFEST,
        'assistant.construct.json': ASSISTANT,
        'computer.construct.json': { ...COMPUTER, theme: { accent: '#0ea5e9', mode: 'light' } },
      });
      const notices = treeNotices(loadConstructTree(entry, io().io)!);
      expect(notices).toContain(
        'mode "computer": its theme is overridden by the manifest\'s when mounted in <acme-console>; it still applies when ejected standalone',
      );
      // The assistant mode declares no theme of its own, so nothing of ITS is
      // overridden and it must NOT produce a notice (crying wolf is the other
      // half of deciding loudly).
      expect(notices.some((n) => n.includes('mode "assistant"'))).toBe(false);
    });

    it('treeNotices warns that a fixed-position mode layout escapes the shell bar', () => {
      const entry = tree({
        'app.construct.json': MANIFEST,
        'assistant.construct.json': { name: 'acme-rail', layout: 'aside', provider: { mode: 'mock' } },
        'computer.construct.json': COMPUTER,
      });
      const notices = treeNotices(loadConstructTree(entry, io().io)!);
      expect(notices).toContain(
        'mode "assistant": layout "aside" positions itself against the viewport, so it renders over the mode switcher rather than below it; it still works ejected standalone.',
      );
    });

    it('treeNotices still carries the accent-contrast notice for a single construct (unchanged behavior)', () => {
      const entry = tree({ 'app.construct.json': { ...ASSISTANT, theme: { accent: 'var(--brand)' } } });
      expect(treeNotices(loadConstructTree(entry, io().io)!).some((n) => n.includes('not parseable for contrast'))).toBe(true);
    });
  });
  ```

- [ ] **2.2 Watch them fail.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/tree.test.ts
  ```

  Expected: the whole file fails at import — `Failed to resolve import "./tree"`. That is the right failure.

- [ ] **2.3 Create `tree.ts`.** New file `packages/ui/src/agent-tooling/construct/tree.ts`:

  ```ts
  /**
   * Cross-FILE construct resolution — the manifest's mode files (R2).
   *
   * WHY THIS IS ITS OWN MODULE, not part of schema.ts: `validateConstruct`
   * stays single-file, synchronous and I/O-free forever. schema.ts compiles
   * under tsconfig.mcp.json's Node-only no-DOM pass AND is imported by the
   * browser builder bundle, so `readFileSync` can never enter it —
   * vocabulary-never-logic's structural cousin: the format definition must not
   * acquire a filesystem.
   *
   * WHY NOT cli.ts, where the spec first sketched it: `cli.ts` reaches
   * `dev.ts` through a DYNAMIC `import('./dev')` on purpose (plain `kai dev`
   * never pays for the builder's code, and Rollup splits it into its own
   * chunk — see dev.ts's `resolveBuilderPageDir` comment for what that chunk
   * split has already cost once). `dev.ts` needs this resolver too, and a
   * value import back into cli.ts would put a static back-edge across that
   * dynamic split. Both sides import THIS leaf instead; `cli.ts` re-exports
   * `loadConstruct` so its existing address still works.
   *
   * A mode `file` is the one construct-authored string that reaches
   * `readFileSync`. The schema's sibling-only regex (R1c) is what makes path
   * traversal INEXPRESSIBLE before it ever gets here — this module resolves
   * against `dirname(entry)` and never re-derives that policy.
   */
  import { readFileSync } from 'node:fs';
  import { basename, dirname, join, resolve } from 'node:path';
  import { accentContrastNotice, type ResolvedMode } from './codegen';
  import {
    asSurface,
    validateConstruct,
    type Construct,
    type ConstructProblem,
    type SurfaceConstruct,
  } from './schema';
  import type { CliIo } from './cli';

  export type ConstructTree =
    | { kind: 'single'; construct: SurfaceConstruct }
    | { kind: 'manifest'; manifest: Construct; modes: ResolvedMode[] };

  /** Load + validate ONE construct file. Moved here verbatim from cli.ts (which
   *  re-exports it) so `dev.ts` can reach it without a static back-edge across
   *  cli.ts's dynamic `import('./dev')`. */
  export function loadConstruct(path: string, io: CliIo): Construct | null {
    const abs = resolve(path);
    let raw: string;
    try {
      raw = readFileSync(abs, 'utf8');
    } catch {
      io.error(`cannot read ${abs}`);
      return null;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      io.error(`${abs} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    const out = validateConstruct(json);
    if (!out.ok) {
      io.error(`${abs} is not a valid construct:`);
      for (const p of out.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
      return null;
    }
    return out.construct;
  }

  /**
   * Resolve a manifest's mode files against its own directory, collecting
   * EVERY problem in one pass — a manifest with three broken references
   * reports three, not the first. Returns problems rather than printing so
   * both presentations share one core: the CLI prints them with the `→`
   * formatter below, and the builder server's write doorway answers 422 with
   * them (dev.ts).
   */
  export function resolveModes(
    manifest: Construct,
    entryPath: string,
  ): { ok: true; modes: ResolvedMode[] } | { ok: false; problems: ConstructProblem[] } {
    const entryAbs = resolve(entryPath);
    const dir = dirname(entryAbs);
    const modes: ResolvedMode[] = [];
    const problems: ConstructProblem[] = [];
    for (const [i, mode] of (manifest.modes ?? []).entries()) {
      const path = `modes[${i}].file`;
      // The schema's sibling-only regex already guarantees one path segment,
      // so join() cannot escape `dir` — no second traversal check here.
      const abs = join(dir, basename(mode.file));
      let raw: string;
      try {
        raw = readFileSync(abs, 'utf8');
      } catch {
        problems.push({ path, message: `${abs}: cannot read (referenced by ${entryAbs})` });
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (err) {
        problems.push({
          path,
          message: `${abs}: not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
      // R1e, and the FIRST rule here on purpose: a referenced manifest is
      // rejected before its own contents matter. With nesting rejected and
      // paths sibling-only, no reference chain longer than manifest→mode can
      // exist, so v1 needs no general cycle detector — and a manifest listing
      // ITSELF is caught by this exact rule, since a manifest is just a file
      // with `modes`.
      if (json !== null && typeof json === 'object' && 'modes' in (json as Record<string, unknown>)) {
        problems.push({
          path,
          message: `"${mode.file}" is itself a manifest — a manifest may not reference another manifest (no nesting, v1)`,
        });
        continue;
      }
      const validated = validateConstruct(json);
      if (!validated.ok) {
        for (const p of validated.problems) {
          problems.push({ path, message: `${abs}: ${p.path || '(root)'}: ${p.message}` });
        }
        continue;
      }
      modes.push({ id: mode.id, label: mode.label, file: mode.file, construct: validated.construct });
    }
    return problems.length > 0 ? { ok: false, problems } : { ok: true, modes };
  }

  /**
   * THE doorway for every command that reads a construct from disk. A file
   * with no `modes` behaves exactly as `loadConstruct` always did; a manifest
   * additionally resolves + validates every sibling, printing each failure
   * with BOTH coordinates (the mode index and the inner path) and the resolved
   * absolute path. A missing or invalid sibling is the single most likely
   * authoring failure of this format — it must never surface as a bare ENOENT.
   */
  export function loadConstructTree(path: string, io: CliIo): ConstructTree | null {
    const construct = loadConstruct(path, io);
    if (!construct) return null;
    if (!construct.modes) return { kind: 'single', construct: asSurface(construct) };
    const resolved = resolveModes(construct, path);
    if (!resolved.ok) {
      io.error(`${resolve(path)} is a manifest with unresolved modes:`);
      for (const p of resolved.problems) io.error(`  ${p.path} → ${p.message}`);
      return null;
    }
    return { kind: 'manifest', manifest: construct, modes: resolved.modes };
  }

  /** The (construct, modes) pair `generateProject` takes, for either kind — so
   *  eject/compile/dev share ONE call shape and cannot forget the mode list
   *  (which `generateProject` rejects loudly, but at runtime). */
  export function treeInput(tree: ConstructTree): { construct: Construct; modes?: readonly ResolvedMode[] } {
    return tree.kind === 'single'
      ? { construct: tree.construct }
      : { construct: tree.manifest, modes: tree.modes };
  }

  /** Every basename `kai dev` must watch: the entry plus each mode file. All
   *  in ONE directory, because `file` is sibling-only (R1c) — which is exactly
   *  why dev()'s existing rename-surviving `watch(dirname(abs))` already
   *  covers the whole tree and only its basename FILTER has to widen (R4a). */
  export function treeBasenames(entryPath: string, tree: ConstructTree): Set<string> {
    const names = new Set([basename(resolve(entryPath))]);
    if (tree.kind === 'manifest') {
      for (const mode of tree.modes) names.add(basename(mode.file));
    }
    return names;
  }

  /** Whether two themes differ in any field a construct can express. Field-by
   *  -field rather than JSON.stringify: key ORDER is a parse artifact, and a
   *  notice that fires on reordering would be noise. */
  function themeDiffers(a: Construct['theme'], b: Construct['theme']): boolean {
    return a?.accent !== b?.accent || a?.unreadColor !== b?.unreadColor || a?.mode !== b?.mode;
  }

  /**
   * Every generation-time notice for a tree, in one place, so `validate`,
   * `eject`, `compile` and every `dev` regen turn say the same things.
   *
   *  - the accent-contrast notice, unchanged, for whichever file owns the
   *    facade (the manifest, or the single construct);
   *  - R3d: a mode's OWN `theme` is USED when that file is ejected standalone
   *    and NOT APPLIED under a manifest — one facade, one host, one shadow
   *    root, so a per-mode theme would be a lie. That decision is made LOUDLY,
   *    per mode, never silently. A mode that declares no theme has nothing
   *    overridden and gets no line;
   *  - the mode layouts whose chrome positions itself against the VIEWPORT
   *    (`widget`'s Dock, `aside`'s fixed rail) render over the shell's switcher
   *    bar rather than below it. Not rejected — those layouts are legal
   *    constructs and eject perfectly on their own — but said out loud, since
   *    the alternative is a preview that silently looks wrong.
   */
  export function treeNotices(tree: ConstructTree): string[] {
    const notices: string[] = [];
    const accent = accentContrastNotice(tree.kind === 'single' ? tree.construct : tree.manifest);
    if (accent) notices.push(accent);
    if (tree.kind === 'single') return notices;
    for (const mode of tree.modes) {
      if (mode.construct.theme && themeDiffers(mode.construct.theme, tree.manifest.theme)) {
        notices.push(
          `mode "${mode.id}": its theme is overridden by the manifest's when mounted in <${tree.manifest.name}>; it still applies when ejected standalone`,
        );
      }
      if (mode.construct.layout === 'widget' || mode.construct.layout === 'aside') {
        notices.push(
          `mode "${mode.id}": layout "${mode.construct.layout}" positions itself against the viewport, so it renders over the mode switcher rather than below it; it still works ejected standalone.`,
        );
      }
    }
    return notices;
  }
  ```

- [ ] **2.4 Add the `ResolvedMode` contract to codegen.** In `packages/ui/src/agent-tooling/construct/codegen.ts`, beside `GenerateOptions`:

  ```ts
  /** One resolved mode of a manifest: the vocabulary entry plus the construct
   *  its `file` actually contained. Declared HERE, not in tree.ts, because it
   *  is part of `generateProject`'s input contract — tree.ts (which does the
   *  reading) imports the type from this module, so there is no cycle. */
  export interface ResolvedMode {
    id: string;
    label: string;
    file: string;
    construct: Construct;
  }
  ```

  and extend `GenerateOptions`:

  ```ts
    /** A MANIFEST's resolved mode files (R3). Required whenever `construct`
     *  declares `modes` and rejected otherwise — `generateProject` checks both
     *  directions loudly, because this module never reads a file itself:
     *  resolution is the CLI layer's job (construct/tree.ts). */
    modes?: readonly ResolvedMode[];
  ```

  (Task 3 makes `generateProject` act on it. This task only lands the type so `tree.ts` compiles.)

- [ ] **2.5 Run the tree tests green.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/tree.test.ts
  ```

  Expected: PASS. If the "reports EVERY broken reference in ONE pass" case fails at 1 instead of 2, the loop is returning early — that is the defect the test exists for.

- [ ] **2.6 Route the CLI through the tree.** In `cli.ts`: delete the local `loadConstruct` definition, and re-export it plus the tree API so existing import sites keep one address:

  ```ts
  import { loadConstructTree, treeInput, treeNotices, type ConstructTree } from './tree';

  export { loadConstruct } from './tree';
  ```

  Drop the now-unused `readFileSync`/`validateConstruct`/`asSurface` imports that tsc flags. Replace the three command bodies:

  ```ts
      case 'validate': {
        const tree = loadConstructTree(rest[0] ?? '', io);
        if (!tree) return 1;
        if (tree.kind === 'single') {
          const c = tree.construct;
          io.log(`valid construct: <${c.name}> (layout: ${c.layout}, provider: ${c.provider.mode})`);
          const warning = homeRecentConversationWarning(c);
          if (warning) io.log(warning);
          for (const notice of treeNotices(tree)) io.log(notice);
          return 0;
        }
        // The whole tree's validity in ONE command (R2): the manifest's own
        // summary plus a line per resolved mode, so an author never has to run
        // `kai validate` once per file to learn the app is sound.
        io.log(`valid manifest: <${tree.manifest.name}> (${tree.modes.length} modes)`);
        for (const mode of tree.modes) io.log(`  mode "${mode.id}" → ${mode.file}: valid`);
        for (const mode of tree.modes) {
          const warning = homeRecentConversationWarning(mode.construct);
          if (warning) io.log(`  mode "${mode.id}": ${warning}`);
        }
        for (const notice of treeNotices(tree)) io.log(notice);
        return 0;
      }
      case 'eject': {
        const { uiSpec, positional } = parseUiFlag(rest);
        const [path, outDir] = positional;
        if (!path || !outDir) {
          io.error(USAGE);
          return 2;
        }
        const tree = loadConstructTree(path, io);
        if (!tree) return 1;
        const { construct, modes } = treeInput(tree);
        const overwritten = writeProject(generateProject(construct, { uiSpec, modes }), resolve(outDir));
        if (overwritten.length > 0) {
          io.log(`overwriting ${overwritten.length} existing file(s)`);
        }
        for (const notice of treeNotices(tree)) io.log(notice);
        io.log(`ejected <${construct.name}> to ${resolve(outDir)} — npm install && npm run dev. The source is yours.`);
        return 0;
      }
  ```

  and in `case 'compile':`, swap the loader and thread `modes` through both `generateProject` calls:

  ```ts
        const tree = loadConstructTree(path, io);
        if (!tree) return 1;
        const { construct, modes } = treeInput(tree);
        const outDir = resolve(outArg ?? 'dist-construct');
        const { workDirFor, ensureInstalled } = await import('./dev');
        const dir = workDirFor(construct.name, process.cwd());
        const files = generateProject(construct, { uiSpec, modes });
  ```

  (`emitTypes(construct)` and the `dist/<name>.js` copy are unchanged — one facade, one bundle, R3e. Leave `accentContrastNotice`'s import if `compile` still uses it; otherwise drop it — tsc's `noUnusedLocals` will say.)

- [ ] **2.7 Extend the CLI tests.** Append to `packages/ui/src/agent-tooling/construct/cli.test.ts`, inside the existing `describe('kai CLI', …)` (it already has a temp-dir + `runCli` harness — follow the neighbouring cases' exact idiom for building a dir and capturing io):

  ```ts
    it('validate: a manifest prints the tree — the manifest summary plus one line per resolved mode', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'kai-cli-manifest-'));
      writeFileSync(
        join(dir, 'app.construct.json'),
        JSON.stringify({
          name: 'acme-console',
          modes: [
            { id: 'assistant', label: 'Assistant', file: './assistant.construct.json' },
            { id: 'computer', label: 'Computer', file: './computer.construct.json' },
          ],
        }),
      );
      writeFileSync(
        join(dir, 'assistant.construct.json'),
        JSON.stringify({ name: 'acme-assistant', layout: 'fullscreen', provider: { mode: 'mock' } }),
      );
      writeFileSync(
        join(dir, 'computer.construct.json'),
        JSON.stringify({ name: 'acme-computer', layout: 'split', provider: { mode: 'mock' } }),
      );
      const logs: string[] = [];
      const code = await runCli(['validate', join(dir, 'app.construct.json')], {
        log: (s) => logs.push(s),
        error: (s) => logs.push(s),
      });
      expect(code).toBe(0);
      expect(logs[0]).toBe('valid manifest: <acme-console> (2 modes)');
      expect(logs).toContain('  mode "assistant" → ./assistant.construct.json: valid');
      expect(logs).toContain('  mode "computer" → ./computer.construct.json: valid');
    });

    it('validate: a manifest with a missing mode file exits 1 naming the mode index and the resolved path', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'kai-cli-manifest-bad-'));
      writeFileSync(
        join(dir, 'app.construct.json'),
        JSON.stringify({
          name: 'acme-console',
          modes: [
            { id: 'assistant', label: 'Assistant', file: './assistant.construct.json' },
            { id: 'computer', label: 'Computer', file: './computer.construct.json' },
          ],
        }),
      );
      const errors: string[] = [];
      const code = await runCli(['validate', join(dir, 'app.construct.json')], {
        log: () => {},
        error: (s) => errors.push(s),
      });
      expect(code).toBe(1);
      expect(errors.join('\n')).toMatch(/modes\[0\]\.file → .*assistant\.construct\.json: cannot read/);
      expect(errors.join('\n')).toMatch(/modes\[1\]\.file → .*computer\.construct\.json: cannot read/);
    });
  ```

  Run:

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/cli.test.ts
  ```

  Expected: PASS (the eject cases in this file still exercise the single path; `generateProject` is untouched by this task, so a manifest eject is still Task 3's work — do not add an eject-a-manifest case here).

- [ ] **2.8 Close the gate: exclude `modes` and give it its own axis.** In `packages/ui/scripts/verify-construct.mjs`:

  (a) Add `modes` to the exclusion set with its reason — and note the axis that makes the exclusion legal:

  ```js
  // The exclusion set is the non-emitting spine plus the two keys that ARE
  // their own axes already: `layout` (the outer loop) and `capabilities`
  // (CAPABILITY_VALUES above) — and `modes`, which is excluded here because it
  // is MUTUALLY EXCLUSIVE with every key the two single-file axes synthesize
  // (schema.ts's `modes-or-surface` rule: a manifest carries $schema/name/
  // theme/modes and nothing else), so no valuer in either table could produce
  // a construct that validates. It gets its own THIRD axis instead —
  // `buildManifestCells()` below. Excluding a key with no replacement axis
  // would be a silent coverage hole; docs/coupling-map.md §4 registers this
  // exclusion↔axis pair for exactly that reason.
  const TOP_LEVEL_EXCLUDED = new Set(['$schema', 'name', 'provider', 'userId', 'layout', 'capabilities', 'modes']);
  ```

  (b) Teach `ejectCell` to write a cell's sibling files before ejecting:

  ```js
  // ── shared install: eject the first cell, npm install, symlink into the rest ─
  /** `siblings` are a MANIFEST cell's mode files, written under their exact
   *  declared basenames beside the manifest so `loadConstructTree` resolves
   *  them against `dirname(entry)` the way a real author's directory does. */
  function ejectCell(fixture, outDir, uiSpec, siblings = []) {
    mkdirSync(outDir, { recursive: true });
    for (const sibling of siblings) {
      writeFileSync(join(outDir, sibling.name), JSON.stringify(sibling.json, null, 2));
    }
    const fixturePath = join(outDir, `${fixture.name}.construct.tmp.json`);
    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
    run('node', [BIN, 'eject', fixturePath, outDir, '--ui', uiSpec], PKG_ROOT);
  }
  ```

  and pass them at the one call site in `main()`: `ejectCell(c.fixture, dir, tarball, c.siblings ?? [])`.

  (c) Add the manifest axis, right after `crossAxisFixtureFor`:

  ```js
  /**
   * THIRD AXIS: manifest cells (the multi-mode vocabulary, 2026-08-30).
   *
   * `modes` cannot ride either single-file axis — it excludes every key those
   * axes synthesize — so it gets cells of its own: a manifest fixture PLUS the
   * sibling mode files it references, written together before the eject leg.
   * All eight legs then run over them exactly as for any other cell, including
   * the consumer-bundle leg (the shell's own registration has to survive a
   * real Vite build too).
   *
   * The mode constructs are composed from the SAME `fixtureFor` the capability
   * axis uses, never hand-built literals, so a new capability widens these
   * cells on its own.
   */
  function manifestCells() {
    const cells = [];

    // Cell 1: the shape the evidence shows — two modes, an assistant-ish
    // fullscreen surface and a workspace-ish split one, with every capability
    // on so the per-mode emit is exercised through the shell.
    const twoModeFiles = [
      { id: 'assistant', file: './probe-mode-assistant.construct.json', fixture: fixtureFor('fullscreen', capabilityKeys, 'mode-a') },
      { id: 'computer', file: './probe-mode-computer.construct.json', fixture: fixtureFor('split', capabilityKeys, 'mode-b') },
    ];
    cells.push({
      fixture: {
        name: 'probe-manifest-two',
        theme: { accent: '#7c3aed', mode: 'dark' },
        modes: twoModeFiles.map((m) => ({ id: m.id, label: m.id, file: m.file })),
      },
      siblings: twoModeFiles.map((m) => ({ name: m.file.slice(2), json: m.fixture })),
      layout: null,
      isAllCaps: false,
    });

    // Cell 2: every legal manifest key at once, at the schema's own max(6) —
    // six modes across every layout the emit chain supports under a shell.
    const maxModeLayouts = ['fullscreen', 'split', 'fullscreen', 'split', 'fullscreen', 'split'];
    const maxModeFiles = maxModeLayouts.map((layout, i) => ({
      id: `mode-${i}`,
      file: `./probe-mode-max-${i}.construct.json`,
      fixture: fixtureFor(layout, [], `max-${i}`),
    }));
    cells.push({
      fixture: {
        $schema: SCHEMA.$id,
        name: 'probe-manifest-max',
        theme: { accent: '#0f766e', unreadColor: '#38BDF8', mode: 'light' },
        modes: maxModeFiles.map((m) => ({ id: m.id, label: `Mode ${m.id}`, file: m.file })),
      },
      siblings: maxModeFiles.map((m) => ({ name: m.file.slice(2), json: m.fixture })),
      layout: null,
      isAllCaps: false,
    });

    return cells;
  }
  ```

  Wire it into `buildCells()`'s return: `return [...cells, ...manifestCells()];`

  (d) Make named-fixture discovery manifest-aware — and say why the mode files are ALSO their own cells:

  ```js
  function namedFixtures() {
    // recursive: true — the template starters live one level down in
    // fixtures/templates/ (generated by build:api from templates.ts, B-15);
    // discovered, never listed, same as the flat fixtures always were.
    //
    // A manifest fixture and its mode files play TWO roles here, deliberately:
    // the manifest cell carries its siblings so the whole tree ejects as one
    // project, AND each mode file is discovered as a standalone fixture in its
    // own right. That second cell is not an accident to be filtered out — it
    // IS the individually-ejectable guarantee (R3a) under test: a mode file
    // must eject, compile and build on its own, or "each referenced file is a
    // plain construct" is a claim nothing checks.
    return readdirSync(FIXTURES_DIR, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.construct.json'))
      .map((f) => {
        const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf8'));
        const dir = dirname(join(FIXTURES_DIR, f));
        return {
          fixture,
          layout: null,
          isAllCaps: false,
          siblings: (fixture.modes ?? []).map((m) => {
            const name = m.file.slice(2);
            return { name, json: JSON.parse(readFileSync(join(dir, name), 'utf8')) };
          }),
          // path separators flattened so the cell name stays a plain dir name
          named: f.replaceAll('/', '-').replaceAll('\\', '-'),
        };
      });
  }
  ```

  Add `dirname` to the `node:path` import at the top of the file.

  (e) Count the new axis in the printed summary (derive it, like every other count):

  ```js
    const manifestProbeCount = cells.filter((c) => c.fixture.name.startsWith('probe-manifest-')).length;
  ```

  and exclude that prefix from `capabilityProbeCount`'s filter alongside `probe-top-`/`probe-cross-`, then add ` + ${manifestProbeCount} manifest probes (a manifest plus its sibling mode files, ejected as one project)` to the `console.log` template.

  (f) Add self-test probe 4 — the manifest fault — after probe 3 in `selfTest()`:

  ```js
      // Probe 4: a manifest whose mode file is MISSING must fail the eject leg.
      // The resolution layer's loudness (R2) is load-bearing for this harness:
      // without it a broken reference would eject a project with a shell that
      // imports modules nobody wrote, and the failure would surface as a tsc
      // error three legs later — or, worse, as a silently single-mode app.
      step('probe 4: a manifest with a missing mode file must fail the eject leg');
      const manifestDir = join(tmp, 'probe-manifest-cell');
      const manifestFixture = {
        name: 'selftest-manifest',
        modes: [
          { id: 'a', label: 'A', file: './selftest-mode-a.construct.json' },
          { id: 'b', label: 'B', file: './selftest-mode-b.construct.json' },
        ],
      };
      const modeA = { name: 'selftest-mode-a', layout: 'fullscreen', provider: { mode: 'mock' } };
      const modeB = { name: 'selftest-mode-b', layout: 'split', provider: { mode: 'mock' } };
      // 4a (the positive control): the COMPLETE tree ejects clean, so 4b's
      // failure is about the missing file and not about manifests at large.
      ejectCell(manifestFixture, manifestDir, tarball, [
        { name: 'selftest-mode-a.construct.json', json: modeA },
        { name: 'selftest-mode-b.construct.json', json: modeB },
      ]);
      console.log('  ✓ probe 4a: a complete manifest tree ejects through the real CLI');
      const brokenDir = join(tmp, 'probe-manifest-broken');
      let brokenEjectFailed = false;
      try {
        ejectCell(manifestFixture, brokenDir, tarball, [
          { name: 'selftest-mode-a.construct.json', json: modeA },
        ]);
      } catch {
        brokenEjectFailed = true;
      }
      if (!brokenEjectFailed) {
        fail(
          'probe 4: a manifest referencing a mode file that does not exist ejected SUCCESSFULLY.\n' +
            '  The resolution layer stopped rejecting broken references — the manifest cells below prove nothing.',
        );
      }
      console.log('  ✓ probe 4b: a manifest with a missing mode file failed the eject leg as expected');
  ```

- [ ] **2.9 Run the self-test and watch probe 4 discriminate.** From `packages/ui`:

  ```
  cd packages/ui && node scripts/verify-construct.mjs --self-test
  ```

  Expected: the `modes` hard-fail from 1.12 is GONE (the exclusion closed it), probes 1–3 pass as before, and probes 4a/4b both print. Paste the whole output. Note: probe 4 will still fail at 4a until Task 3 teaches `generateProject` to emit a manifest — that is expected here, because `eject` now calls `generateProject(manifest, { modes })` and the emit branch does not exist yet. **If 4a fails with `generateProject: <selftest-manifest> declares modes but no resolved mode list was passed`, the CLI wiring is wrong (fix it). If it fails inside `emitApp`/`asSurface`, that is Task 3's work: record it, and re-run this exact command as Task 3's step 3.9.** Do not weaken the probe to get past it.

- [ ] **2.10 Register the coupling in §4.** In `docs/coupling-map.md`, add a row to the §4 table (after the template-registry row):

  ```
  | `TOP_LEVEL_EXCLUDED`'s `modes` entry in `packages/ui/scripts/verify-construct.mjs` | the manifest cell axis (`manifestCells()`) in the SAME file, plus the sibling-aware `ejectCell` and `namedFixtures()` | `modes` is excluded from the derived top-level probe axis because it is mutually exclusive with every key that axis synthesizes (schema.ts's `modes-or-surface`), so no valuer could build a construct that validates. **An exclusion with no replacement axis is a silent coverage hole** — this row exists so the pair is read together: delete or narrow `manifestCells()` and the exclusion stops being legal | The gate's own startup hard-fail covers the OPPOSITE direction only (a new top-level key with neither a valuer nor an exclusion). **NOTHING** enforces that an EXCLUDED key still has an axis — that is this row's job, plus `--self-test` probe 4, which fails if a manifest with a missing mode file ever ejects successfully |
  ```

  Also extend the existing template-registry row's "What adding a member does" cell with: `A `'cli'`-tier entry additionally carries `modeStarters`, so materializing it writes the manifest AND its sibling mode files — the fixture generator, the wizard and the gate's discovery walk each handle the multi-file shape.` (Task 5 lands the tier; write the sentence now so the row is not edited twice.)

- [ ] **2.11 Full unit suite + typecheck.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit
  pnpm --filter @kitn.ai/ui run typecheck
  ```

  Expected: PASS. Paste the summaries.

- [ ] **2.12 Commit.**

  ```bash
  git add packages/ui/src/agent-tooling/construct/tree.ts \
          packages/ui/src/agent-tooling/construct/tree.test.ts \
          packages/ui/src/agent-tooling/construct/cli.ts \
          packages/ui/src/agent-tooling/construct/cli.test.ts \
          packages/ui/src/agent-tooling/construct/codegen.ts \
          packages/ui/scripts/verify-construct.mjs \
          docs/coupling-map.md
  git commit -m "feat(construct): resolve a manifest's mode files as one tree, loudly"
  ```

---

## Task 3 — Codegen: the prefix refactor + the shell

Implements R3a–R3e and spec complications 3 and 9.

**Files**
- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts`
- Modify: `packages/ui/src/agent-tooling/construct/codegen.test.ts`

**Interfaces**
- Produces: `generateProject(construct, { modes })` emitting `src/App.tsx` (the shell) + `src/modes/<id>/App.tsx` (+ `src/modes/<id>/cards.ts`) per mode · `emitSurfaceFiles(c: SurfaceConstruct, prefix: string): GeneratedFile[]` · `emitManifestApp(manifest: Construct, modes: readonly ResolvedMode[]): string` · `modeComponentAlias(id: string): string` · the `--kai-surface-height` custom property on every filling layout.
- Consumes: `ResolvedMode`, `GenerateOptions.modes` (Task 2); `asSurface`/`SurfaceConstruct` (Task 1); `Tabs`/`KaiTabItem` from `@kitn.ai/ui/solid` (already exported — `src/solid.ts:72`).

**Two facts about the existing code this task depends on, verified against the tree:**
1. `emitApp` emits `import { cards } from './cards';` — a path RELATIVE to App.tsx, and `cards.ts` is always its sibling. So the prefix refactor needs **no** change inside `emitApp` at all: the same bytes are correct at `src/` and at `src/modes/<id>/`. That is what makes the byte-equality pin (R3a) true by construction rather than by test-and-hope.
2. The kit's `Tabs` takes `items: KaiTabItem[]` where the entry key is **`id`**, not `value` (`src/ui/tabs.tsx`), and `onChange` fires with that id. The spec's sketch wrote `{ value, label }`; the emit below uses the real prop shape.

### Steps

- [ ] **3.1 Write the failing codegen tests.** Append to `packages/ui/src/agent-tooling/construct/codegen.test.ts` (its `construct()` / `file()` helpers are already in scope):

  ```ts
  import type { ResolvedMode } from './codegen';

  /** A resolved mode, built through the real validator so a mode construct in
   *  these tests can never be a shape the schema would reject. */
  const mode = (id: string, label: string, overrides: Record<string, unknown>): ResolvedMode => {
    const out = validateConstruct({ name: `acme-${id}`, provider: { mode: 'mock' }, ...overrides });
    if (!out.ok) throw new Error(JSON.stringify(out.problems));
    return { id, label, file: `./${id}.construct.json`, construct: out.construct };
  };

  const manifestOf = (modes: ResolvedMode[], overrides: Record<string, unknown> = {}): Construct => {
    const out = validateConstruct({
      name: 'acme-console',
      theme: { accent: '#7c3aed', mode: 'dark' },
      modes: modes.map((m) => ({ id: m.id, label: m.label, file: m.file })),
      ...overrides,
    });
    if (!out.ok) throw new Error(JSON.stringify(out.problems));
    return out.construct;
  };

  const TWO_MODES = () => [
    mode('assistant', 'Assistant', { layout: 'fullscreen', capabilities: { starters: ['Draft it'] } }),
    mode('computer', 'Computer', { layout: 'split' }),
  ];

  describe('generateProject: manifest branch (R3)', () => {
    it('rejects a manifest with no resolved mode list, and a mode list with no manifest — both loudly', () => {
      const modes = TWO_MODES();
      expect(() => generateProject(manifestOf(modes))).toThrow(/declares modes but no resolved mode list/);
      expect(() => generateProject(construct(), { modes })).toThrow(/declares no modes/);
    });

    it('emits the shell plus one directory per mode', () => {
      const modes = TWO_MODES();
      const paths = generateProject(manifestOf(modes), { modes }).map((f) => f.path).sort();
      expect(paths).toEqual(
        [
          'index.html',
          'package.json',
          'src/App.tsx',
          'src/element.tsx',
          'src/modes/assistant/App.tsx',
          'src/modes/computer/App.tsx',
          'tsconfig.json',
          'vite.config.lib.ts',
          'vite.config.ts',
        ].sort(),
      );
    });

    it('THE REUSE PIN: a mode\'s emit byte-equals the SAME construct ejected standalone, modulo the path prefix', () => {
      // R3a / one-chat-surface-per-mode: a mode's App is literally what
      // ejecting that mode file on its own emits — the two paths cannot drift
      // because they ARE one path. If this ever fails, a second mode-flavored
      // generator has grown; delete it rather than updating this assertion.
      const cards = [{ name: 'refund_approval', schema: { type: 'object', properties: { amount: { type: 'number' } } } }];
      const modes = [
        mode('assistant', 'Assistant', { layout: 'fullscreen', cards }),
        mode('computer', 'Computer', { layout: 'split', cards }),
      ];
      const manifestFiles = generateProject(manifestOf(modes), { modes });
      for (const m of modes) {
        const standalone = generateProject(m.construct);
        expect(file(manifestFiles, `src/modes/${m.id}/App.tsx`)).toBe(file(standalone, 'src/App.tsx'));
        expect(file(manifestFiles, `src/modes/${m.id}/cards.ts`)).toBe(file(standalone, 'src/cards.ts'));
      }
    });

    it('namespaces card registries per mode — two card-bearing modes no longer collide on src/cards.ts', () => {
      const cards = [{ name: 'a_card', schema: { type: 'object' } }];
      const modes = [
        mode('assistant', 'Assistant', { layout: 'fullscreen', cards }),
        mode('computer', 'Computer', { layout: 'split', cards }),
      ];
      const paths = generateProject(manifestOf(modes), { modes }).map((f) => f.path);
      expect(paths).toContain('src/modes/assistant/cards.ts');
      expect(paths).toContain('src/modes/computer/cards.ts');
      expect(paths).not.toContain('src/cards.ts');
    });

    it('is deterministic: same manifest and modes, same bytes', () => {
      expect(generateProject(manifestOf(TWO_MODES()), { modes: TWO_MODES() })).toEqual(
        generateProject(manifestOf(TWO_MODES()), { modes: TWO_MODES() }),
      );
    });
  });

  describe('the manifest shell (R3b/R3c)', () => {
    const shell = (modes = TWO_MODES(), overrides = {}) =>
      file(generateProject(manifestOf(modes, overrides), { modes }), 'src/App.tsx');

    it('imports each mode App under a Pascal-cased alias derived from its id', () => {
      const code = shell();
      expect(code).toContain("import { App as AssistantMode } from './modes/assistant/App';");
      expect(code).toContain("import { App as ComputerMode } from './modes/computer/App';");
    });

    it('mounts exactly ONE mode at a time via <Show> — never CSS-hidden', () => {
      const code = shell();
      expect(code).toContain('<Show when={mode() === "assistant"}>');
      expect(code).toContain('<Show when={mode() === "computer"}>');
      expect(code).not.toMatch(/display:\s*'none'/);
      // The first mode is the default.
      expect(code).toContain('const [mode, setMode] = createSignal("assistant");');
    });

    it('renders the segmented switcher with the kit Tabs prop shape (items use `id`, not `value`)', () => {
      const code = shell();
      expect(code).toContain('<Tabs variant="segmented"');
      expect(code).toContain('value={mode()} onChange={setMode}');
      expect(code).toContain('{ id: "assistant", label: "Assistant" }');
      expect(code).toContain('{ id: "computer", label: "Computer" }');
    });

    it('JSON.stringifies mode ids and labels at every emit site (untrusted construct-authored text)', () => {
      const hostile = 'Assistant"; alert(1); //';
      const modes = [
        mode('assistant', hostile, { layout: 'fullscreen' }),
        mode('computer', 'Computer', { layout: 'split' }),
      ];
      const code = shell(modes);
      expect(code).toContain(JSON.stringify(hostile));
      expect(code).not.toContain('alert(1); //"');
    });

    it('assembles the solid-js import ONCE, so the duplicate-identifier class cannot return', () => {
      const code = shell();
      expect(code.match(/from 'solid-js'/g)).toHaveLength(1);
      expect(code).toContain("import { createSignal, Show } from 'solid-js';");
    });

    it('passes `host` only to the modes that take it — an excess prop would not compile', () => {
      const modes = [
        mode('assistant', 'Assistant', { layout: 'fullscreen', header: { title: 'A', themeToggle: true } }),
        mode('computer', 'Computer', { layout: 'split' }),
      ];
      const code = shell(modes);
      expect(code).toContain('<AssistantMode host={props.host} />');
      expect(code).toContain('<ComputerMode />');
      expect(code).toContain('export function App(props: { host: HTMLElement })');
    });

    it('takes no props at all when no mode needs the host', () => {
      const code = shell();
      expect(code).toContain('export function App()');
      expect(code).not.toContain('props.host');
    });
  });

  describe('the manifest facade and host page (R3d/R3e)', () => {
    it('registers ONE element under the manifest\'s name, with the manifest\'s theme', () => {
      const modes = TWO_MODES();
      const files = generateProject(manifestOf(modes), { modes });
      const element = file(files, 'src/element.tsx');
      expect(element).toContain("defineWebComponent('acme-console', { theme: 'dark' as 'light' | 'dark' | 'auto' }");
      expect(element).toContain("ctx.element.style.setProperty('--kai-color-primary', \"#7c3aed\")");
      // The interior stays pure Solid: no nested registrations, one facade.
      expect(element.match(/defineWebComponent\(/g)).toHaveLength(1);
      for (const f of files) {
        if (f.path.startsWith('src/modes/')) expect(f.code).not.toContain('defineWebComponent');
      }
    });

    it('threads ctx.element into the shell when any mode needs the host', () => {
      const modes = [
        mode('assistant', 'Assistant', { layout: 'fullscreen', header: { title: 'A', themeToggle: true } }),
        mode('computer', 'Computer', { layout: 'split' }),
      ];
      expect(file(generateProject(manifestOf(modes), { modes }), 'src/element.tsx')).toContain('<App host={ctx.element} />');
    });

    it('the demo host page mounts the manifest tag with no widget hint (a shell is a filling surface)', () => {
      const modes = TWO_MODES();
      const html = file(generateProject(manifestOf(modes), { modes }), 'index.html');
      expect(html).toContain('<acme-console></acme-console>');
      expect(html).not.toContain('bottom-right corner');
      expect(html).toContain('<script type="module" src="/src/element.tsx"></script>');
    });
  });

  describe('--kai-surface-height: a filling layout fills its REGION, not always the viewport', () => {
    it('every filling layout emits the var with a 100dvh fallback, so a standalone eject is unchanged', () => {
      for (const layout of ['fullscreen', 'split'] as const) {
        expect(file(generateProject(construct({ layout, ...(layout === 'split' ? {} : {}) })), 'src/App.tsx')).toContain(
          "height: 'var(--kai-surface-height, 100dvh)'",
        );
      }
      const customApp = file(
        generateProject(construct({ layout: 'custom', slots: ['header'] })),
        'src/App.tsx',
      );
      expect(customApp).toContain("height: 'var(--kai-surface-height, 100dvh)'");
    });

    it('the shell sets it to 100% on the mode region, so a mode fills below the switcher instead of overflowing it', () => {
      const modes = TWO_MODES();
      const code = file(generateProject(manifestOf(modes), { modes }), 'src/App.tsx');
      expect(code).toContain('[data-kai-mode-surface] { --kai-surface-height: 100%; }');
      expect(code).toContain('data-kai-mode-surface');
    });
  });
  ```

  In the same step, update the ONE existing assertion that pins the old literal — `codegen.test.ts:599`, in the layout table:

  ```ts
      ['fullscreen', "height: 'var(--kai-surface-height, 100dvh)'"],
  ```

- [ ] **3.2 Watch them fail.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/codegen.test.ts
  ```

  Expected: the manifest describes fail at `generateProject` throwing `asSurface`'s "is a manifest, not a surface construct" (Task 1's transient wrapper) or emitting only `src/App.tsx`; the `--kai-surface-height` cases fail on the literal `100dvh`; the layout-table case at line 599 fails. Paste the raw failures.

- [ ] **3.3 Swap the hardcoded viewport height for the overridable var.** In `codegen.ts`, add the constant beside `themeMode`:

  ```ts
  /**
   * The height every FILLING layout uses (`fullscreen`, `split`, `custom`).
   *
   * A CSS custom property with the same `100dvh` fallback these layouts used
   * to hardcode, so a standalone eject renders exactly as before — and a mode
   * mounted under a manifest shell fills the region BELOW the mode switcher,
   * because the shell sets `--kai-surface-height: 100%` on the region it puts
   * each mode in. A raw `100dvh` inside the shell would be viewport-tall
   * regardless of the bar above it, clipping the composer off the bottom of
   * every mode — and no rule can override an inline style, so the var is the
   * seam that makes the two contexts agree.
   *
   * Critically the emitted TEXT is identical either way, which is what keeps a
   * mode's App.tsx byte-identical to its own standalone eject (R3a's reuse
   * pin). `widget` and `aside` are NOT filling layouts — they position
   * themselves against the viewport by design, and `treeNotices` (tree.ts)
   * says so out loud for a mode that uses one.
   */
  const SURFACE_HEIGHT = "var(--kai-surface-height, 100dvh)";
  ```

  Replace the three literals:
  - `emitCustomApp`'s wrapper (line ~792): `<div style={{ height: '${SURFACE_HEIGHT}', display: 'flex', 'flex-direction': 'column' }}>`
  - `emitLayoutOpen`'s `fullscreen` case: `    <div style={{ height: '${SURFACE_HEIGHT}', display: 'flex', 'flex-direction': 'column' }}>\n`
  - `emitLayoutOpen`'s `split` case: `    <div style={{ height: '${SURFACE_HEIGHT}' }}>\n      <WorkspaceShell …` (the inner `height: '100%'` on the end pane stays as it is — it is already relative to its own parent).

- [ ] **3.4 Factor the interior emit behind a path prefix (R3a).** In `codegen.ts`, replace the body of `generateProject` and add the two helpers:

  ```ts
  export function generateProject(construct: Construct, opts: GenerateOptions = {}): GeneratedFile[] {
    const uiSpec = opts.uiSpec ?? `^${kitVersion()}`;
    const modes = opts.modes;
    // Decide loudly, both directions. This module never reads a file: a
    // manifest's mode files are resolved by the CLI layer (construct/tree.ts's
    // loadConstructTree), so arriving here with `modes` in the construct and
    // no resolved list is a caller bug that would otherwise emit a shell
    // importing modules nobody wrote.
    if (construct.modes && !modes) {
      throw new Error(
        `generateProject: <${construct.name}> declares modes but no resolved mode list was passed — load it with loadConstructTree (agent-tooling/construct/tree.ts) and pass opts.modes.`,
      );
    }
    if (!construct.modes && modes) {
      throw new Error(`generateProject: opts.modes was passed for <${construct.name}>, which declares no modes.`);
    }
    const files: GeneratedFile[] = [
      { path: 'package.json', code: emitPackageJson(construct, uiSpec) },
      { path: 'tsconfig.json', code: emitTsconfig() },
      { path: 'vite.config.ts', code: emitViteDev() },
      { path: 'vite.config.lib.ts', code: emitViteLib(construct) },
      { path: 'index.html', code: emitIndexHtml(construct) },
      { path: 'src/element.tsx', code: emitElement(construct, modes) },
    ];
    if (modes) {
      files.push({ path: 'src/App.tsx', code: emitManifestApp(construct, modes) });
      for (const mode of modes) {
        files.push(...emitSurfaceFiles(asSurface(mode.construct), `src/modes/${mode.id}/`));
      }
    } else {
      files.push(...emitSurfaceFiles(asSurface(construct), 'src/'));
    }
    return files;
  }

  /**
   * The `src/`-interior emit for ONE chat surface, at a path prefix (R3a).
   *
   * This is the whole of the "prefix refactor": `emitApp` itself needs no
   * prefix argument, because the only relative import it writes is
   * `./cards` — and cards.ts is always App.tsx's SIBLING, at `src/` and at
   * `src/modes/<id>/` alike. So a mode's emitted bytes are literally a
   * standalone eject's bytes, which is why the reuse pin in codegen.test.ts
   * is an equality and not an approximation. It also fixes the collision the
   * old hardcoded `src/cards.ts` would have caused: two card-bearing modes
   * would have overwritten one registry.
   */
  function emitSurfaceFiles(c: SurfaceConstruct, prefix: string): GeneratedFile[] {
    const files: GeneratedFile[] = [{ path: `${prefix}App.tsx`, code: emitApp(c) }];
    if (c.cards) files.push({ path: `${prefix}cards.ts`, code: emitCardsRegistry(c.cards) });
    return files;
  }
  ```

  Then make `emitElement` mode-aware. Change its signature to `function emitElement(c: Construct, modes?: readonly ResolvedMode[]): string`, and replace both uses of `needsHost(c)` inside it with `projectNeedsHost(c, modes)`, adding beside `needsHost`:

  ```ts
  /** Whether the FACADE must thread `ctx.element` into `App`. For a manifest
   *  the answer belongs to the modes, not the manifest: a manifest carries no
   *  header chrome or shell of its own (the schema rejects them beside
   *  `modes`), so asking `needsHost(manifest)` would always say no and the
   *  shell would have no host to forward to a mode that needs one. */
  function projectNeedsHost(c: Construct, modes?: readonly ResolvedMode[]): boolean {
    return modes ? modes.some((m) => needsHost(m.construct)) : needsHost(c);
  }
  ```

- [ ] **3.5 Emit the shell.** Add to `codegen.ts`, directly after `emitCustomApp`:

  ```ts
  /** kebab mode id → the Solid component alias its import binds. `assistant` →
   *  `AssistantMode`. Injective over the schema's own id shape
   *  (`^[a-z][a-z0-9-]*$`): the uppercase positions reconstruct the hyphens,
   *  so two distinct ids can never collide on one alias, and the schema
   *  already rejects duplicate ids outright. */
  export function modeComponentAlias(id: string): string {
    return `${id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}Mode`;
  }

  /**
   * `src/App.tsx` for a MANIFEST — a THIN shell, and deliberately nothing more
   * (R3b).
   *
   * Each mode below owns its ENTIRE surface, including any rail of its own, so
   * this file never reaches inside a mode's layout: it renders a slim top bar
   * carrying the kit's own segmented `Tabs` and swaps the whole surface under
   * it. The perplexity-pro evidence puts its switcher in-rail — but an in-rail
   * placement would need the shell to compose INTO a mode's layout, which is
   * exactly the nesting this format rejects; because the entire surface swaps,
   * the effect that evidence shows (rail and main both change per mode) is
   * preserved anyway. An in-rail variant needs a rail-composition seam that
   * does not exist yet: recorded as future work in the spec (R3c), not
   * silently dropped.
   *
   * Exactly one mode is mounted at a time — `<Show>`, not CSS-hidden — so
   * one-chat-surface-per-mode holds STRUCTURALLY rather than by convention.
   * Modes are independent in v1: no shared conversation, no shared history, no
   * cross-mode message passing. Switching unmounts the surface; a mode whose
   * own `capabilities.history.persistence` is `local`/`endpoint` survives the
   * switch through its own persistence, and a `none` mode loses its in-memory
   * thread — that is its own declared persistence decision doing exactly what
   * it says (R7.3).
   */
  function emitManifestApp(manifest: Construct, modes: readonly ResolvedMode[]): string {
    // ONE assembled solid-js import statement, never two independently-gated
    // ones binding names into the same module — the duplicate-identifier class
    // `emitSolidJsImports` exists for (spec complication 9). This module's set
    // is fixed, so it is assembled from one array rather than hand-typed.
    const solidNames = ['createSignal', 'Show'];
    const withHost = projectNeedsHost(manifest, modes);
    const imports = modes
      .map((m) => `import { App as ${modeComponentAlias(m.id)} } from './modes/${m.id}/App';`)
      .join('\n');
    // Construct-authored/untrusted text at every emit site, ids included
    // (an id is schema-constrained, but the discipline here is uniform, never
    // value-dependent — the same rule B-3 applied to the action arrays).
    const items = modes
      .map((m) => `{ id: ${JSON.stringify(m.id)}, label: ${JSON.stringify(m.label)} }`)
      .join(', ');
    const mounts = modes
      .map(
        (m) =>
          `        <Show when={mode() === ${JSON.stringify(m.id)}}><${modeComponentAlias(m.id)}${
            needsHost(m.construct) ? ' host={props.host}' : ''
          } /></Show>\n`,
      )
      .join('');
    return `import { ${solidNames.join(', ')} } from 'solid-js';
  import { Tabs } from '@kitn.ai/ui/solid';
  ${imports}

  // The manifest shell: ONE custom element, one host, one shadow root. Each
  // mode below is a COMPLETE construct, emitted by the same emitters a
  // standalone eject uses — src/modes/<id>/App.tsx is byte-for-byte what
  // \`kai eject <that mode file>\` writes as src/App.tsx, so a mode you like
  // can be lifted out of here and shipped on its own with nothing withheld.
  //
  // Exactly one mode is mounted at a time (<Show>, not CSS-hidden). Modes are
  // independent: no shared conversation, no shared history. Switching unmounts
  // the surface — a mode that declares its own history persistence survives
  // the switch through it.
  //
  // The mode region sets --kai-surface-height: 100% so each mode's own filling
  // layout fills THIS region rather than the whole viewport (which would push
  // its composer off the bottom of the page, under the bar).
  const MODES = [${items}];

  export function App(${withHost ? 'props: { host: HTMLElement }' : ''}) {
    const [mode, setMode] = createSignal(${JSON.stringify(modes[0].id)});
    return (
      <div style={{ height: '100dvh', display: 'flex', 'flex-direction': 'column' }}>
        <style>{'[data-kai-mode-surface] { --kai-surface-height: 100%; }'}</style>
        <div style={{ display: 'flex', 'align-items': 'center', padding: '0.5rem 0.75rem', 'border-block-end': '1px solid var(--kai-color-border)' }}>
          <Tabs variant="segmented" items={MODES} value={mode()} onChange={setMode} />
        </div>
        <div data-kai-mode-surface style={{ flex: '1', 'min-height': '0' }}>
  ${mounts}      </div>
      </div>
    );
  }
  `;
  }
  ```

  **Indentation note:** the template literal above is shown indented for readability inside this plan. In the file, the emitted lines must start at column 0 (the same way `emitApp`'s own template literal does) — copy the structure, not the leading two spaces on the emitted lines.

- [ ] **3.6 Run the codegen tests green.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/codegen.test.ts
  ```

  Expected: PASS, including the reuse pin. If the pin fails, do NOT adjust the assertion — find what made a mode's emit differ from a standalone one and remove that difference.

- [ ] **3.7 Remove Task 1's transient wrapper.** `generateProject` now calls `asSurface` at the right two places, so the temporary `emitApp(asSurface(construct))` line from step 1.8.3 is gone as part of 3.4. Confirm with `grep -n "asSurface" packages/ui/src/agent-tooling/construct/codegen.ts` — the only hits should be the import and the two calls inside `generateProject`.

- [ ] **3.8 Typecheck + full unit suite + the emitted project.**

  <!-- gate-list: partial -- a mid-plan checkpoint for task 3 only; the merge verdict is the required CI `test` job, not this subset -->
  ```
  pnpm --filter @kitn.ai/ui run typecheck
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit
  pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
  ```

  `--project=emitted` covers the MCP scaffolder, not the construct engine, so it is untouched by this task — run it anyway per the repo rule that a green `--project=unit` is not the merge gate.

- [ ] **3.9 Run the real gate — the manifest cells now compile, build and bundle for real.** From `packages/ui`:

  ```
  cd packages/ui && npm run build:api && cd ../.. && nx build ui --skip-nx-cache
  cd packages/ui && node scripts/verify-construct.mjs --self-test
  cd packages/ui && npm run verify:construct
  ```

  The self-test's probe 4a must now pass (it failed by design at Task 2 step 2.9 — the emit branch did not exist yet); paste it. Then read the full gate's PRINTED cell counts — never a number from this plan — and confirm the manifest probes appear in the summary line. Every manifest cell must eject, `tsc --noEmit` under its own emitted tsconfig, `npm run build`, and (for the layout×all-caps cells) survive the consumer-bundle leg. **This is where the shell faces `tsc --strict --noUnusedLocals` for real** — a `--kai-surface-height` key Solid's `CSSProperties` rejects, an excess `host` prop on a mode that does not take one, or an unused `props` parameter all surface HERE. Fix any such defect in `codegen.ts` with a matching `codegen.test.ts` assertion, never by weakening the gate.

- [ ] **3.10 Commit.**

  ```bash
  git add packages/ui/src/agent-tooling/construct/codegen.ts \
          packages/ui/src/agent-tooling/construct/codegen.test.ts
  git commit -m "feat(construct): emit a manifest as one element with a mode switcher"
  ```

---

## Task 4 — `kai dev`, the builder server, and the read-only manifest screen

Implements R4a–R4c and spec complication 6.

**Files**
- Modify: `packages/ui/src/agent-tooling/construct/dev.ts`
- Modify: `packages/ui/src/agent-tooling/construct/dev.test.ts`
- Modify: `packages/ui/src/agent-tooling/construct/templates.ts` (`'multiMode'` id + `inferTemplateId`'s modes branch — types and derivation only; Task 5 lands the entry data)
- Modify: `packages/ui/src/agent-tooling/construct/templates.test.ts`
- Create: `packages/ui/src/components/builder-manifest-screen.tsx`
- Create: `packages/ui/src/components/builder-manifest-screen.test.tsx`
- Modify: `packages/ui/src/builder-app/App.tsx`

**Interfaces**
- Produces: `regenTurn(entryAbs: string, sink, dir, opts, io): Set<string> | null` (returns the basenames to watch) · `regenerateTree(tree: ConstructTree, sink, dir, opts): GeneratedFile[]` · `/api/state`'s additive `manifest?: { name: string; modes: { id: string; label: string; file: string }[] }` field · `MULTI_MODE_TEMPLATE_ID` and `inferTemplateId`'s `'multiMode'` return · `<BuilderManifestScreen manifest={…} constructPath={…} />`.
- Consumes: `loadConstructTree`, `treeInput`, `treeNotices`, `treeBasenames`, `type ConstructTree` (Task 2); `generateProject`'s modes branch (Task 3).

**Note on the two functions this task replaces.** `regenerate` (raw → files) has exactly one caller in the tree (`regenTurn`) plus its own two tests; `regenTurn` takes a `readRaw: () => unknown` closure. Both predate cross-file resolution and neither can express a tree. They are REPLACED, not duplicated — a second regen path is precisely how "the mode file changed but the preview didn't" ships.

### Steps

- [ ] **4.1 Write the failing dev tests.** In `packages/ui/src/agent-tooling/construct/dev.test.ts`, replace the two `regenerate` cases (`'regenerate refuses an invalid construct…'`, `'regenerate writes on a valid construct'`) and the `regenTurn` cases with tree-driven ones. Add these imports at the top: `regenerateTree, regenTurn` from `./dev`, `loadConstructTree` from `./tree`, plus `mkdtempSync`/`writeFileSync`/`join`/`tmpdir` (most are already imported — check before adding).

  ```ts
  const silentIo = { log: () => {}, error: () => {} };

  /** Write a construct tree into a fresh temp dir; returns the entry path. */
  function treeDir(files: Record<string, unknown>, entry = 'app.construct.json'): string {
    const dir = mkdtempSync(join(tmpdir(), 'kai-dev-tree-'));
    for (const [name, json] of Object.entries(files)) {
      writeF(join(dir, name), `${JSON.stringify(json, null, 2)}\n`);
    }
    return join(dir, entry);
  }

  const MODE_A = { name: 'demo-assistant', layout: 'fullscreen', provider: { mode: 'mock' } };
  const MODE_B = { name: 'demo-computer', layout: 'split', provider: { mode: 'mock' } };
  const MANIFEST = {
    name: 'demo-console',
    modes: [
      { id: 'assistant', label: 'Assistant', file: './a.construct.json' },
      { id: 'computer', label: 'Computer', file: './b.construct.json' },
    ],
  };

  describe('regen over a construct TREE', () => {
    it('regenerateTree writes the single-construct project unchanged', () => {
      const written: { files: GeneratedFile[]; dir: string }[] = [];
      const entry = treeDir({ 'app.construct.json': MODE_A });
      const tree = loadConstructTree(entry, silentIo)!;
      const files = regenerateTree(tree, { write: (f, d) => written.push({ files: f, dir: d }) }, '/tmp/somewhere');
      expect(written.map((w) => w.dir)).toEqual(['/tmp/somewhere']);
      expect(files.map((f) => f.path)).toContain('src/App.tsx');
      expect(files.map((f) => f.path)).not.toContain('src/modes/assistant/App.tsx');
    });

    it('regenerateTree writes the whole manifest project, modes included', () => {
      const entry = treeDir({ 'app.construct.json': MANIFEST, 'a.construct.json': MODE_A, 'b.construct.json': MODE_B });
      const tree = loadConstructTree(entry, silentIo)!;
      const files = regenerateTree(tree, { write: () => {} }, '/tmp/somewhere');
      expect(files.map((f) => f.path)).toEqual(
        expect.arrayContaining(['src/App.tsx', 'src/modes/assistant/App.tsx', 'src/modes/computer/App.tsx']),
      );
    });

    it('regenTurn returns the basename SET to watch — the manifest plus every mode file (R4a)', () => {
      const entry = treeDir({ 'app.construct.json': MANIFEST, 'a.construct.json': MODE_A, 'b.construct.json': MODE_B });
      const watched = regenTurn(entry, { write: () => {} }, '/tmp/somewhere', {}, silentIo);
      expect(watched && [...watched].sort()).toEqual(['a.construct.json', 'app.construct.json', 'b.construct.json']);
    });

    it('regenTurn recomputes the set from the FRESHLY LOADED manifest, so adding a mode is picked up', () => {
      const entry = treeDir({ 'app.construct.json': MANIFEST, 'a.construct.json': MODE_A, 'b.construct.json': MODE_B });
      const dir = join(entry, '..');
      writeF(join(dir, 'c.construct.json'), JSON.stringify({ name: 'demo-third', layout: 'fullscreen', provider: { mode: 'mock' } }));
      writeF(
        entry,
        JSON.stringify({
          ...MANIFEST,
          modes: [...MANIFEST.modes, { id: 'third', label: 'Third', file: './c.construct.json' }],
        }),
      );
      const watched = regenTurn(entry, { write: () => {} }, '/tmp/somewhere', {}, silentIo);
      expect(watched?.has('c.construct.json')).toBe(true);
    });

    it('regenTurn keeps the LAST GOOD preview up when ANY file in the tree is invalid, and returns null', () => {
      const entry = treeDir({ 'app.construct.json': MANIFEST, 'a.construct.json': MODE_A, 'b.construct.json': { name: 'demo-computer', layout: 'nope' } });
      const written: string[] = [];
      const errors: string[] = [];
      const watched = regenTurn(
        entry,
        { write: (_f, d) => written.push(d) },
        '/tmp/somewhere',
        {},
        { log: () => {}, error: (s) => errors.push(s) },
      );
      expect(watched).toBeNull();
      expect(written).toEqual([]);
      expect(errors.join('\n')).toMatch(/construct rejected — last good preview stays up/);
      expect(errors.join('\n')).toMatch(/modes\[1\]\.file → .*b\.construct\.json: layout:/);
    });

    it('regenTurn never throws — a sink that explodes inside an fs.watch listener would kill the whole dev process', () => {
      const entry = treeDir({ 'app.construct.json': MODE_A });
      const errors: string[] = [];
      expect(() =>
        regenTurn(
          entry,
          { write: () => { throw new Error('disk on fire'); } },
          '/tmp/somewhere',
          {},
          { log: () => {}, error: (s) => errors.push(s) },
        ),
      ).not.toThrow();
      expect(errors.join('\n')).toMatch(/regen failed \(disk on fire\) — last good preview stays up/);
    });

    it('regenTurn prints every tree notice — the theme override is never silent', () => {
      const logs: string[] = [];
      const entry = treeDir({
        'app.construct.json': { ...MANIFEST, theme: { accent: '#7c3aed', mode: 'dark' } },
        'a.construct.json': { ...MODE_A, theme: { accent: '#0ea5e9', mode: 'light' } },
        'b.construct.json': MODE_B,
      });
      regenTurn(entry, { write: () => {} }, '/tmp/somewhere', {}, { log: (s) => logs.push(s), error: () => {} });
      expect(logs.join('\n')).toMatch(/mode "assistant": its theme is overridden by the manifest's/);
    });
  });

  describe('the builder server over a manifest (R4b)', () => {
    it('handleConstructPut validates the WHOLE TREE for a manifest body, writing nothing when a sibling is broken', () => {
      const entry = treeDir({ 'app.construct.json': MANIFEST, 'a.construct.json': MODE_A });
      const before = readF(entry, 'utf8');
      const out = handleConstructPut({ ...MANIFEST, name: 'renamed-console' }, entry);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.problems.some((p) => p.path === 'modes[1].file')).toBe(true);
      expect(readF(entry, 'utf8')).toBe(before);
    });

    it('handleConstructPut accepts a manifest whose whole tree resolves', () => {
      const entry = treeDir({ 'app.construct.json': MANIFEST, 'a.construct.json': MODE_A, 'b.construct.json': MODE_B });
      const out = handleConstructPut({ ...MANIFEST, name: 'renamed-console' }, entry);
      expect(out.ok).toBe(true);
      expect(JSON.parse(readF(entry, 'utf8')).name).toBe('renamed-console');
    });

    it('manifestStateField describes the manifest for the read-only screen, additively', () => {
      const entry = treeDir({ 'app.construct.json': MANIFEST, 'a.construct.json': MODE_A, 'b.construct.json': MODE_B });
      const tree = loadConstructTree(entry, silentIo)!;
      expect(manifestStateField(tree)).toEqual({
        name: 'demo-console',
        modes: [
          { id: 'assistant', label: 'Assistant', file: './a.construct.json' },
          { id: 'computer', label: 'Computer', file: './b.construct.json' },
        ],
      });
      const single = loadConstructTree(treeDir({ 'app.construct.json': MODE_A }), silentIo)!;
      // Additive: the existing single-construct shape is UNTOUCHED.
      expect(manifestStateField(single)).toBeUndefined();
    });
  });
  ```

  Add `manifestStateField` to the `./dev` import list in this test file.

- [ ] **4.2 Watch them fail.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/dev.test.ts
  ```

  Expected: import failures for `regenerateTree`/`manifestStateField`, a signature failure on `regenTurn` (it still takes a `readRaw` closure, so passing a path string makes `readRaw()` throw "entry is not a function"), and the `handleConstructPut` manifest cases passing the schema but writing anyway (no tree check yet). Paste them.

- [ ] **4.3 Replace `regenerate`/`regenTurn` with the tree pair.** In `dev.ts`, delete `regenerate` and `RegenOutcome`, and put in their place:

  ```ts
  /** One regen: generate the whole tree's project and write it. Injectable
   *  writer so the watch loop is testable without touching a disk. */
  export function regenerateTree(
    tree: ConstructTree,
    sink: { write: (files: GeneratedFile[], dir: string) => void },
    dir: string,
    opts: GenerateOptions = {},
  ): GeneratedFile[] {
    const { construct, modes } = treeInput(tree);
    const files = generateProject(construct, { ...opts, modes });
    sink.write(files, dir);
    return files;
  }

  /**
   * One watch-triggered turn: load the TREE from the entry path → regenerate →
   * report. Returns the basename set to keep watching (recomputed from the
   * freshly-loaded manifest every turn, so adding a mode to the list picks up
   * its new sibling file on the very next save — R4a), or null when anything
   * in the tree is invalid.
   *
   * Never throws. Every failure — unreadable JSON, a rejected construct, an
   * unresolvable mode reference, or an exception from the sink's real fs
   * writes — is reported via `io` and swallowed here, because this same body
   * runs inside an fs.watch listener where an uncaught throw is an uncaught
   * exception that kills the whole `kai dev` process instead of leaving the
   * last good preview running.
   */
  export function regenTurn(
    entryAbs: string,
    sink: { write: (files: GeneratedFile[], dir: string) => void },
    dir: string,
    opts: GenerateOptions,
    io: CliIo,
  ): Set<string> | null {
    try {
      // Collect the tree's problems rather than letting loadConstructTree
      // print them bare: the watch loop's contract is that a mid-edit invalid
      // state keeps the LAST GOOD preview up and says so.
      const problems: string[] = [];
      const tree = loadConstructTree(entryAbs, { log: io.log, error: (s) => problems.push(s) });
      if (!tree) {
        io.error('construct rejected — last good preview stays up:');
        for (const line of problems) io.error(line);
        return null;
      }
      regenerateTree(tree, sink, dir, opts);
      io.log('construct changed — regenerated; Vite will hot-update the tab.');
      for (const notice of treeNotices(tree)) io.log(notice);
      return treeBasenames(entryAbs, tree);
    } catch (err) {
      io.error(`regen failed (${err instanceof Error ? err.message : String(err)}) — last good preview stays up`);
      return null;
    }
  }
  ```

  Update `dev.ts`'s imports: drop `validateConstruct` if now unused, drop `accentContrastNotice` (superseded by `treeNotices`), and add

  ```ts
  import { loadConstructTree, treeBasenames, treeInput, treeNotices, type ConstructTree } from './tree';
  ```

  (`dev.ts` keeps `import type { CliIo } from './cli';` — type-only, erased, so the dynamic-import chunk split is unaffected.)

- [ ] **4.4 Widen `dev()`'s watch filter from one basename to the tree's set.** Replace `dev()`'s first-load block and watcher:

  ```ts
    const abs = resolve(constructPath);
    const first = loadConstructTree(abs, io);
    if (!first) process.exit(1);
    const { construct, modes } = treeInput(first);
    const dir = workDirFor(construct.name, process.cwd());
    const files = generateProject(construct, { uiSpec: opts.uiSpec, modes });
    writeProject(files, dir);
    for (const notice of treeNotices(first)) io.log(notice);

    await ensureInstalled(dir, files, io);

    // Watch the PARENT DIRECTORY, not the file itself: most editors save by
    // writing a temp file and renaming it over the original, which replaces
    // the inode. fs.watch(path) on macOS/FSEvents stays bound to the old inode
    // and goes permanently silent after that first rename — one edit works,
    // every edit after it is dropped with no error. Watching the directory and
    // filtering by basename survives rename-based saves.
    //
    // For a MANIFEST the filter is a SET, not one name — and because `file` is
    // sibling-only (R1c) the whole tree lives in THIS one directory, so the
    // existing single watcher already covers it and only the filter had to
    // widen. The set is replaced on every successful turn, so editing the
    // manifest's own `modes` list (adding a mode → a new sibling file) starts
    // watching that new file immediately.
    let watched = treeBasenames(abs, first);
    watch(dirname(abs), (_event, filename) => {
      if (!filename || !watched.has(filename)) return;
      const next = regenTurn(abs, { write: writeProject }, dir, { uiSpec: opts.uiSpec }, io);
      if (next) watched = next;
    });

    io.log(
      first.kind === 'manifest'
        ? `previewing <${construct.name}> (${first.modes.length} modes) — edit ${abs} or any mode file beside it and watch the tab.`
        : `previewing <${construct.name}> — edit ${abs} and watch the tab.`,
    );
  ```

  (Everything from `const vite = spawn(…)` down is unchanged.)

- [ ] **4.5 Make the builder server manifest-aware.** In `dev.ts`:

  (a) The whole-tree write doorway — replace `handleConstructPut`'s body:

  ```ts
  export function handleConstructPut(
    raw: unknown,
    abs: string,
  ): { ok: true; construct: Construct } | { ok: false; problems: ConstructProblem[] } {
    const out = validateConstruct(raw);
    if (!out.ok) return out;
    // A manifest body is only writable if its WHOLE TREE resolves — a manifest
    // saved with a mode file that does not exist would take the preview down
    // on the very next regen, and the ONE write doorway is where that gets
    // refused, not where it gets discovered. Resolution runs server-side
    // because it needs the filesystem, which the page bundle has no access to.
    if (out.construct.modes) {
      const resolved = resolveModes(out.construct, abs);
      if (!resolved.ok) return { ok: false, problems: resolved.problems };
    }
    atomicWriteJson(abs, raw);
    return { ok: true, construct: out.construct };
  }

  /** The ADDITIVE `manifest` field on GET /api/state (R4b): what the read-only
   *  manifest screen needs, and nothing more. `undefined` for a single
   *  construct, so the existing single-construct response shape is byte-
   *  identical to what it was. */
  export function manifestStateField(
    tree: ConstructTree,
  ): { name: string; modes: { id: string; label: string; file: string }[] } | undefined {
    if (tree.kind !== 'manifest') return undefined;
    return {
      name: tree.manifest.name,
      modes: tree.modes.map((m) => ({ id: m.id, label: m.label, file: m.file })),
    };
  }
  ```

  Add `resolveModes` to the `./tree` import.

  (b) `boot` goes through the tree, and its watcher takes the same set treatment:

  ```ts
    const boot = async (absPath: string): Promise<void> => {
      const first = loadConstructTree(absPath, io);
      if (!first) throw new Error('construct invalid');
      manifestState = manifestStateField(first);
      const { construct, modes } = treeInput(first);
      const dir = workDirFor(construct.name, process.cwd());
      const files = generateProject(construct, { uiSpec: opts.uiSpec, modes });
      writeProject(files, dir);
      for (const notice of treeNotices(first)) io.log(notice);
      await ensureInstalled(dir, files, io);
      // Same rename-surviving directory watch as dev(), same basename SET.
      let watched = treeBasenames(absPath, first);
      watch(dirname(absPath), (_event, filename) => {
        if (!filename || !watched.has(filename)) return;
        const next = regenTurn(absPath, { write: writeProject }, dir, { uiSpec: opts.uiSpec }, io);
        if (next) {
          watched = next;
          const reloaded = loadConstructTree(absPath, { log: () => {}, error: () => {} });
          if (reloaded) manifestState = manifestStateField(reloaded);
        }
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
      io.log(`previewing <${construct.name}> at ${previewUrl}`);
    };
  ```

  Declare `let manifestState: ReturnType<typeof manifestStateField>;` beside `let previewUrl`.

  (c) `/api/state` grows the additive field:

  ```ts
        if (req.method === 'GET' && url === '/api/state') {
          return send(200, abs
            ? {
                phase: 'panel',
                constructPath: abs,
                construct: JSON.parse(readFileSync(abs, 'utf8')),
                previewUrl,
                // Additive (R4b): present ONLY for a manifest session, so a
                // single-construct response is unchanged byte for byte.
                ...(manifestState ? { manifest: manifestState } : {}),
              }
            : { phase: 'start' });
        }
  ```

- [ ] **4.6 Run the dev tests green.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/dev.test.ts
  ```

  Expected: PASS.

- [ ] **4.7 Give `inferTemplateId` its manifest branch (spec complication 6).** First the failing test — append to `packages/ui/src/agent-tooling/construct/templates.test.ts`:

  ```ts
  describe('inferTemplateId: a manifest is never mistaken for a Scratch construct (R4b)', () => {
    it('a construct with modes infers the multi-mode id, whatever else it carries', () => {
      const manifest = {
        $schema: CONSTRUCT_SCHEMA_URL,
        name: 'acme-console',
        modes: [
          { id: 'assistant', label: 'Assistant', file: './assistant.construct.json' },
          { id: 'computer', label: 'Computer', file: './computer.construct.json' },
        ],
      } as never;
      expect(inferTemplateId(manifest)).toBe(MULTI_MODE_TEMPLATE_ID);
      expect(MULTI_MODE_TEMPLATE_ID).toBe('multiMode');
    });

    it('the modes branch is checked BEFORE layout — a manifest has no layout to fall through on', () => {
      // The bug this prevents: `layout: undefined` hits inferTemplateId's
      // `default` case, returns undefined, and the builder falls back to the
      // Scratch control manifest — a panel offering `layout` edits the write
      // doorway then rejects (schema.ts's modes-or-surface). A dead-end loop,
      // not merely an ugly screen.
      expect(inferTemplateId({ name: 'x', modes: [] } as never)).toBe(MULTI_MODE_TEMPLATE_ID);
    });
  });
  ```

  Add `MULTI_MODE_TEMPLATE_ID` to this file's `./templates` import. Run it, watch it fail on the missing export, then in `templates.ts`:

  ```ts
  export type TemplateId = 'widget' | 'inAppAssistant' | 'assistant' | 'research' | 'workspace' | 'voice' | 'multiMode';
  export type BuildableTemplateId = Exclude<TemplateId, 'voice' | 'multiMode'>;

  /** The multi-mode family's id, exported as a constant because two consumers
   *  BRANCH on it rather than merely listing it: `inferTemplateId` below, and
   *  the builder page, which routes a manifest to a read-only screen instead
   *  of a panel (R4b). A branch keyed off a bare string literal in two files
   *  is exactly the copy this repo's derive-don't-type rule is about. */
  export const MULTI_MODE_TEMPLATE_ID = 'multiMode' as const;
  ```

  and rewrite `inferTemplateId`:

  ```ts
  export function inferTemplateId(c: Construct): TemplateId | undefined {
    // FIRST, before layout: a manifest has no layout at all, so without this
    // branch it falls through to `undefined` and the builder mounts its
    // generic Scratch panel over it — a panel whose `layout` control the write
    // doorway rejects on save (schema.ts's `modes-or-surface`). A dead end,
    // not just a wrong label.
    if (c.modes) return MULTI_MODE_TEMPLATE_ID;
    switch (c.layout) {
  ```

  (the rest of the switch is unchanged; its `default: return undefined;` still covers `custom` and `undefined`).

  Re-run the templates tests. Expected: PASS, including the pre-existing "every buildable starter infers back to its own template id" case — `BuildableTemplateId` is still what those starters produce.

- [ ] **4.8 Write the failing manifest-screen test.** Create `packages/ui/src/components/builder-manifest-screen.test.tsx`:

  ```tsx
  import { describe, expect, it } from 'vitest';
  import { render, screen } from '@solidjs/testing-library';
  import { BuilderManifestScreen } from './builder-manifest-screen';

  const MANIFEST = {
    name: 'acme-console',
    modes: [
      { id: 'assistant', label: 'Assistant', file: './assistant.construct.json' },
      { id: 'computer', label: 'Computer', file: './computer.construct.json' },
    ],
  };

  describe('BuilderManifestScreen (R4b — menu-honesty: name the path that works)', () => {
    it('names the manifest and every mode', () => {
      render(() => <BuilderManifestScreen manifest={MANIFEST} constructPath="/w/acme-console.construct.json" />);
      expect(screen.getByText('acme-console')).toBeInTheDocument();
      expect(screen.getByText('Assistant')).toBeInTheDocument();
      expect(screen.getByText('Computer')).toBeInTheDocument();
    });

    it('names the exact command that DOES edit each mode, rather than offering edits this screen cannot make', () => {
      render(() => <BuilderManifestScreen manifest={MANIFEST} constructPath="/w/acme-console.construct.json" />);
      expect(screen.getByText('kai dev --builder ./assistant.construct.json')).toBeInTheDocument();
      expect(screen.getByText('kai dev --builder ./computer.construct.json')).toBeInTheDocument();
    });

    it('says the builder cannot edit a manifest yet — a deferral stated, not implied by an absence', () => {
      render(() => <BuilderManifestScreen manifest={MANIFEST} constructPath="/w/acme-console.construct.json" />);
      expect(screen.getByRole('note')).toHaveTextContent(/builder can't edit a manifest yet/i);
    });

    it('offers no editable control at all — a panel that offers what the write doorway rejects is a broken menu', () => {
      const { container } = render(() => (
        <BuilderManifestScreen manifest={MANIFEST} constructPath="/w/acme-console.construct.json" />
      ));
      expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });
  ```

  Run it, watch it fail at the missing module.

- [ ] **4.9 Build the screen.** Create `packages/ui/src/components/builder-manifest-screen.tsx`:

  ```tsx
  /**
   * The builder's READ-ONLY manifest screen (R4b).
   *
   * `kai dev --builder <manifest>` must not mount a derived panel over a
   * manifest: every control that panel would offer (`layout`, `provider`,
   * capabilities…) is a key the write doorway REJECTS beside `modes`
   * (schema.ts's `modes-or-surface`), so the user would edit, save, and be
   * refused — a dead-end loop, not merely an ugly screen. Menu-honesty says a
   * screen that names the working path beats a menu that offers edits nothing
   * accepts, so this screen shows what the manifest IS and, per mode, the
   * exact command that edits that mode.
   *
   * Deliberately inert: no inputs, no buttons. Builder EDITING of manifests is
   * a later round (R7.6); when it lands, this file is replaced by a real panel
   * and the registry entry's availability flips from 'cli' to 'buildable',
   * widening every menu on its own.
   */
  import { For, type JSX } from 'solid-js';

  export interface BuilderManifestScreenProps {
    manifest: { name: string; modes: { id: string; label: string; file: string }[] };
    /** The manifest file's own path, shown so the author knows which file the
     *  live preview beside this screen is driven from. */
    constructPath: string;
  }

  export function BuilderManifestScreen(props: BuilderManifestScreenProps): JSX.Element {
    return (
      <div class="flex flex-col gap-4 p-4">
        <div class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-foreground">{props.manifest.name}</span>
          <span class="text-xs text-muted-foreground">{props.constructPath}</span>
        </div>
        <p role="note" class="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          This is a multi-mode manifest: the app shell, plus one construct file per mode. The builder can't edit a
          manifest yet — edit the manifest JSON directly, or open a single mode with the command beside it. The preview
          is live either way.
        </p>
        <div class="flex flex-col gap-3">
          <For each={props.manifest.modes}>
            {(mode) => (
              <div class="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0">
                <span class="text-sm font-medium text-foreground">{mode.label}</span>
                <span class="text-xs text-muted-foreground">{mode.file}</span>
                <code class="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                  kai dev --builder {mode.file}
                </code>
              </div>
            )}
          </For>
        </div>
      </div>
    );
  }
  ```

  Re-run `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-manifest-screen.test.tsx`. Expected: PASS. (If the `kai dev --builder ./x` text assertion fails on whitespace, the JSX expression is splitting the text node — put the whole command in one interpolation: `{\`kai dev --builder ${mode.file}\`}`.)

- [ ] **4.10 Route the builder page to it.** In `packages/ui/src/builder-app/App.tsx`:

  - import the screen and the id: `import { BuilderManifestScreen } from '../components/builder-manifest-screen';` and add `MULTI_MODE_TEMPLATE_ID` to the existing `../agent-tooling/construct/templates` import.
  - add a signal beside the others: `const [manifest, setManifest] = createSignal<{ name: string; modes: { id: string; label: string; file: string }[] } | undefined>();`
  - in `onMount`'s `state.phase === 'panel'` branch, set it: `setManifest(state.manifest);` (additive — `undefined` for every single-construct session, exactly as before).
  - guard the derived-panel branch and add the manifest one. Replace the `step === 'panel'` block's left column with:

    ```tsx
            <div class="flex flex-col overflow-y-auto border-r border-border">
              <div class="flex items-center justify-between border-b border-border p-3">
                <span class="text-sm font-semibold">{manifest() ? manifest()!.name : template().name}</span>
                <Show when={!manifest()}>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmSwitch(true)}>Switch template</Button>
                </Show>
              </div>
              <Show
                when={manifest()}
                fallback={
                  <DerivedBuilderPanel value={construct()!} onChange={onEdit} template={template()} problems={problems()} />
                }
              >
                <BuilderManifestScreen manifest={manifest()!} constructPath={constructPath() ?? ''} />
              </Show>
            </div>
    ```

    (add `const [constructPath, setConstructPath] = createSignal<string | undefined>();` and `setConstructPath(state.constructPath);` in the same `onMount` branch — the server already sends it.)
  - in `templateForLoadedConstruct`, make the manifest case explicit rather than letting it reach the Scratch fallback:

    ```tsx
      const templateForLoadedConstruct = (c: Construct): BuildableTemplate => {
        const id = inferTemplateId(c);
        // A manifest never gets a control manifest at all — the read-only
        // screen renders instead of DerivedBuilderPanel (R4b). Returning the
        // Scratch manifest here would be harmless only because that branch is
        // unreachable; naming it keeps the reason next to the code.
        if (id === MULTI_MODE_TEMPLATE_ID) return { ...SCRATCH_TEMPLATE, name: c.name };
        if (id) {
          const entry = templateById(id);
          if (entry && entry.availability === 'buildable') return entry;
        }
        return { ...SCRATCH_TEMPLATE, name: c.name };
      };
    ```
  - the SSE `construct` refetch handler: when the file on disk is a manifest, `body` is the manifest JSON. `setTemplate(templateForLoadedConstruct(body))` still runs harmlessly; add `setManifest(body.modes ? { name: body.name, modes: body.modes } : undefined);` beside `setConstruct(body as Construct)` so an external edit that adds or renames a mode updates the screen.

- [ ] **4.11 Typecheck, unit suite, and the builder page build.**

  <!-- gate-list: partial -- a mid-plan checkpoint for task 4 only; the merge verdict is the required CI `test` job, not this subset -->
  ```
  pnpm --filter @kitn.ai/ui run typecheck
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit
  nx build ui --skip-nx-cache
  ```

  The build is the gate for the builder page itself (it is PREBUILT into `dist/builder-page` at kit build time — a page that does not compile is a runtime 500 in `kai dev --builder`, invisible to the unit suite).

- [ ] **4.12 Commit.**

  ```bash
  git add packages/ui/src/agent-tooling/construct/dev.ts \
          packages/ui/src/agent-tooling/construct/dev.test.ts \
          packages/ui/src/agent-tooling/construct/templates.ts \
          packages/ui/src/agent-tooling/construct/templates.test.ts \
          packages/ui/src/components/builder-manifest-screen.tsx \
          packages/ui/src/components/builder-manifest-screen.test.tsx \
          packages/ui/src/builder-app/App.tsx
  git commit -m "feat(construct): kai dev watches a whole manifest tree; the builder says what it can't edit"
  ```

  (The manual IVP for `kai dev` and `kai dev --builder` runs at the END of the arc, per the repo's defer-IVP policy — Task 6 step 6.5.)

---

## Task 5 — Template registry (`'cli'` tier) + wizard + MCP + fixtures

Implements R5a–R5c and R6's remaining gates; resolves spec complications 7 and 8.

**Files**
- Modify: `packages/ui/src/agent-tooling/construct/templates.ts`
- Modify: `packages/ui/src/agent-tooling/construct/templates.test.ts`
- Modify: `packages/ui/src/components/builder-start.tsx` (one illustration — the exhaustive Record forces it)
- Modify: `packages/ui/src/components/builder-start.test.tsx`
- Modify: `packages/ui/src/agent-tooling/construct/dev.ts` (`/api/create`'s loud cli-tier rejection)
- Modify: `packages/ui/src/agent-tooling/construct/dev.test.ts`
- Modify: `packages/ui/src/agent-tooling/mcp/tools/construct.ts`
- Modify: `packages/ui/src/agent-tooling/mcp/construct-tool.test.ts` (follow the file's own harness — it iterates `buildableTemplates()`)
- Modify: `packages/ui/scripts/gen-construct-template-fixtures.mjs`
- Modify: `packages/ui/scripts/verify-generated-sync.mjs` (`GENERATED`)
- Modify: `packages/create-kai/src/wizard.ts`
- Modify: `packages/create-kai/src/index.ts` (the multi-file "wrote N files" line)
- Modify: `packages/create-kai/test/wizard.test.ts`

**Interfaces**
- Produces: `export interface CliTemplate { id: Extract<TemplateId, 'multiMode'>; name: string; description: string; availability: 'cli'; starter: Construct; modeStarters: readonly ModeStarter[] }` · `export interface ModeStarter { file: string; construct: Construct }` · `export function cliTemplates(): readonly (BuildableTemplate | CliTemplate)[]` · `emitConstruct` returning `{ file: string; files: string[]; devCommand: string; constructName: string }`.
- Consumes: `MULTI_MODE_TEMPLATE_ID`, `TemplateId` (Task 4); `assistantStarter`/`workspaceBase` lineages (existing, in `templates.ts`).

**Naming.** The entry ships under the working name **"Multi-mode"** (T-4's convention: the code name is the working one until the owner names the card; the card copy is owner-reviewable text). Do not invent a different public name.

### Steps

- [ ] **5.1 Write the failing registry tests.** Append to `packages/ui/src/agent-tooling/construct/templates.test.ts`:

  ```ts
  describe("the 'cli' availability tier (R5a) — menu-honesty in BOTH directions", () => {
    const multiMode = templateById(MULTI_MODE_TEMPLATE_ID);

    it('Multi-mode is in the registry on the cli tier — not buildable, not story-only', () => {
      expect(multiMode?.availability).toBe('cli');
      expect(multiMode?.name).toBe('Multi-mode');
    });

    it('cliTemplates() is buildable + cli — ONE place the tier distinction lives', () => {
      expect(cliTemplates().map((t) => t.id)).toEqual(
        TEMPLATES.filter((t) => t.availability === 'buildable' || t.availability === 'cli').map((t) => t.id),
      );
      expect(cliTemplates().some((t) => t.id === MULTI_MODE_TEMPLATE_ID)).toBe(true);
      expect(cliTemplates().some((t) => t.id === 'voice')).toBe(false);
    });

    it('buildableTemplates() does NOT widen — the builder cannot edit a manifest yet (R4b)', () => {
      expect(buildableTemplates().some((t) => t.id === MULTI_MODE_TEMPLATE_ID)).toBe(false);
      expect(buildableTemplates().map((t) => t.id)).toEqual([
        'widget',
        'inAppAssistant',
        'assistant',
        'research',
        'workspace',
      ]);
    });
  });

  describe('the Multi-mode starter set (R5b) — a manifest plus its siblings', () => {
    const entry = templateById(MULTI_MODE_TEMPLATE_ID)!;
    const cli = entry as Extract<typeof entry, { availability: 'cli' }>;

    it('the manifest starter safeParses and carries ONLY the four manifest-legal keys', () => {
      const parsed = ConstructSchema.safeParse(cli.starter);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
      expect(Object.keys(cli.starter).sort()).toEqual(['$schema', 'modes', 'name', 'theme']);
    });

    it('every mode starter safeParses on its own — the individually-ejectable guarantee, in the test layer', () => {
      expect(cli.modeStarters.length).toBe(2);
      for (const modeStarter of cli.modeStarters) {
        const parsed = ConstructSchema.safeParse(modeStarter.construct);
        expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
        expect(modeStarter.construct.$schema).toBe(CONSTRUCT_SCHEMA_URL);
        expect(modeStarter.construct.provider).toEqual({ mode: 'mock' });
      }
    });

    it('every `file` in the manifest has exactly one matching mode starter, and vice versa', () => {
      expect(cli.starter.modes?.map((m) => m.file).sort()).toEqual(cli.modeStarters.map((m) => m.file).sort());
    });

    it('the manifest owns the theme and no mode starter carries one — so materializing it never fires an override notice', () => {
      expect(cli.starter.theme?.mode).toBe('dark');
      for (const modeStarter of cli.modeStarters) {
        expect(modeStarter.construct.theme, modeStarter.file).toBeUndefined();
      }
    });

    it('no mode starter uses a viewport-positioned layout, so none renders over the switcher', () => {
      for (const modeStarter of cli.modeStarters) {
        expect(['widget', 'aside']).not.toContain(modeStarter.construct.layout);
      }
    });
  });
  ```

  Extend this file's `./templates` import with `cliTemplates` and `MULTI_MODE_TEMPLATE_ID`, and its existing "Multi-mode is not in the registry at all" assertion in `describe('registry shape (B-13 / C-4)')` must be REPLACED — it was written when Multi-mode was owner-parked (C-4) and is now false by ruling:

  ```ts
    it('voice is story-only, identity only; Multi-mode is cli-tier with a starter set', () => {
      const voice = templateById('voice');
      expect(voice?.availability).toBe('story-only');
      expect(voice && 'starter' in voice).toBe(false);
      // C-4 parked Multi-mode out of the registry; the 2026-08-30 owner ruling
      // put it in, on its own tier — offered wherever the CLI chain works,
      // excluded wherever the builder chain does not.
      const multi = templateById(MULTI_MODE_TEMPLATE_ID);
      expect(multi?.availability).toBe('cli');
      expect(multi && 'modeStarters' in multi).toBe(true);
    });
  ```

- [ ] **5.2 Watch them fail.**

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/templates.test.ts
  ```

  Expected: `cliTemplates is not a function`, `templateById('multiMode')` undefined, and the replaced registry-shape case failing. Paste them.

- [ ] **5.3 Add the tier and the entry.** In `templates.ts`, after `StoryOnlyTemplate`:

  ```ts
  /** One sibling construct file of a manifest starter. `file` is the manifest's
   *  own reference string (`./name.construct.json`), so whoever materializes
   *  the template writes each construct under exactly the basename the
   *  manifest names — the wizard, the fixtures generator, and (when the tier
   *  flips) the builder's create endpoint. */
  export interface ModeStarter {
    file: string;
    construct: Construct;
  }

  /**
   * The `'cli'` tier (R5a). A family whose whole CLI chain works — validate,
   * dev, eject, compile — but which the visual BUILDER cannot edit yet, so it
   * is offered by create-kai's wizard and the MCP `construct` tool (both derive
   * their menus from this registry) and EXCLUDED from `BuilderStart`'s card
   * list and the builder server's `/api/create`. Menu-honesty in both
   * directions: every menu offers exactly what works through it.
   *
   * `modeStarters` is additive on THIS tier's type only, so
   * `BuildableTemplate`'s `starter: Construct` — which assumes one file — and
   * every existing registry consumer compile unchanged. When builder editing
   * of manifests lands, this tier flips to 'buildable' and every menu widens
   * on its own.
   */
  export interface CliTemplate {
    id: Extract<TemplateId, 'multiMode'>;
    name: string;
    description: string;
    availability: 'cli';
    /** The MANIFEST. */
    starter: Construct;
    /** Its siblings — each a plain, individually-ejectable construct. */
    modeStarters: readonly ModeStarter[];
  }

  export type TemplateEntry = BuildableTemplate | StoryOnlyTemplate | CliTemplate;
  ```

  Then the starter set, after `workspaceAppPreview` (seeded from the `assistantStarter` / `workspaceBase` lineages, de-branded, per R5):

  ```ts
  // ── Multi-mode — the manifest family (owner ruling 2026-08-30) ──────────────
  // The Assistant | Computer pair the perplexity-pro evidence shows, seeded
  // from the assistant and workspace lineages above. Two facts worth stating
  // because they are decisions, not omissions:
  //   · Neither mode carries a `theme`. The manifest owns it — one facade, one
  //     host, one shadow root (R3d) — so a per-mode theme would be silently
  //     overridden, and the CLI would (correctly) print an override notice on
  //     every run of the flagship starter. A mode ejected standalone simply
  //     gets the kit's own default theme, which is the honest default for a
  //     file that is no longer inside this app.
  //   · Neither mode uses `widget` or `aside`. Those layouts position
  //     themselves against the VIEWPORT, so under a shell they render over the
  //     mode switcher (tree.ts's treeNotices says so out loud). Legal, but not
  //     what a starter should teach.
  const multiModeAssistant: Construct = {
    $schema: CONSTRUCT_SCHEMA_URL,
    name: 'multi-mode-assistant',
    layout: 'fullscreen',
    provider: { mode: 'mock' },
    header: { title: 'Assistant' },
    empty: {
      title: 'What can I help with?',
      description: 'Ask anything, or switch to Computer to build something.',
    },
    capabilities: {
      starters: ['Draft the Q3 board update', 'Summarize a document'],
      attachments: { accept: ['image/*', 'application/pdf'] },
      history: { persistence: 'local' },
      conversations: true,
    },
  };

  const multiModeComputer: Construct = {
    $schema: CONSTRUCT_SCHEMA_URL,
    name: 'multi-mode-computer',
    layout: 'split',
    provider: { mode: 'mock' },
    header: { title: 'Computer', themeToggle: true },
    composer: workspaceTriggers,
    capabilities: {
      starters: ['Build a pricing table', 'Add a dark mode toggle'],
      attachments: { accept: ['image/*'] },
      history: { persistence: 'local' },
    },
  };

  const multiModeStarter: Construct = {
    $schema: CONSTRUCT_SCHEMA_URL,
    name: 'multi-mode-console',
    theme: { accent: '#7c3aed', mode: 'dark' },
    modes: [
      { id: 'assistant', label: 'Assistant', file: './multi-mode-assistant.construct.json' },
      { id: 'computer', label: 'Computer', file: './multi-mode-computer.construct.json' },
    ],
  };
  ```

  and the entry, appended to `TEMPLATES` (last — after `voice`):

  ```ts
    {
      id: MULTI_MODE_TEMPLATE_ID,
      name: 'Multi-mode',
      description: 'Two surfaces in one element, swapped by a mode switcher — each mode its own construct file.',
      availability: 'cli',
      starter: multiModeStarter,
      modeStarters: [
        { file: './multi-mode-assistant.construct.json', construct: multiModeAssistant },
        { file: './multi-mode-computer.construct.json', construct: multiModeComputer },
      ],
    },
  ```

  Finally the derivation helper, beside `buildableTemplates()`:

  ```ts
  /** Every template whose CLI chain works end to end: buildable + cli. The
   *  wizard and the MCP tool read THIS; `BuilderStart` and `/api/create` keep
   *  reading `buildableTemplates()`. One place, so the tier distinction cannot
   *  drift into a second hand-written list. */
  export function cliTemplates(): readonly (BuildableTemplate | CliTemplate)[] {
    return TEMPLATES.filter(
      (t): t is BuildableTemplate | CliTemplate => t.availability === 'buildable' || t.availability === 'cli',
    );
  }
  ```

  Run the templates tests. Expected: PASS.

- [ ] **5.4 Add the card illustration the exhaustive Record forces (spec complication 8).** Run the unit suite for `builder-start` and watch tsc/vitest complain:

  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-start.test.tsx
  pnpm --filter @kitn.ai/ui run typecheck
  ```

  Expected: `Property 'multiMode' is missing in type … but required in type 'Record<BuilderCardTemplateId, () => JSX.Element>'` — the derivation working. **Do NOT fix it by narrowing `BuilderCardTemplateId` or filtering `BUILDER_TEMPLATES`:** `BUILDER_TEMPLATES` is the Labs CATALOG (it already carries story-only Voice), and the honest menus — `BUILDABLE_BUILDER_TEMPLATES` and the builder's own default — already exclude anything non-buildable with no edit at all. Add the illustration instead, following the file's own shared style rules (the same `viewBox`, `STROKE`, `ACCENT`/`ACCENT_FILL` style consts every sibling uses — read `AssistantIllustration` and copy its structure):

  ```tsx
  /** Multi-mode: two stacked surfaces behind one segmented switcher — the one
   *  visual fact that distinguishes this family from Assistant. */
  function MultiModeIllustration(): JSX.Element {
    return (
      <svg viewBox="0 0 160 110" width="160" height="110" role="img" aria-hidden="true">
        <rect x="20" y="14" width="120" height="16" rx="8" style={MUTED} stroke-width={STROKE} />
        <rect x="22" y="16" width="56" height="12" rx="6" style={ACCENT_FILL} />
        <rect x="20" y="38" width="120" height="58" rx="6" style={MUTED} stroke-width={STROKE} />
        <rect x="28" y="48" width="48" height="8" rx="4" style={ACCENT} stroke-width={STROKE} />
        <rect x="28" y="62" width="72" height="8" rx="4" style={MUTED} stroke-width={STROKE} />
        <rect x="28" y="76" width="60" height="8" rx="4" style={MUTED} stroke-width={STROKE} />
      </svg>
    );
  }
  ```

  (If the file's shared consts are named differently from `MUTED`/`ACCENT`/`ACCENT_FILL`/`STROKE`, use ITS names — read them off the neighbouring illustrations rather than introducing new ones.) Register it: `multiMode: MultiModeIllustration,` in `TEMPLATE_ILLUSTRATIONS`.

  Then add one assertion to `builder-start.test.tsx`, in the `derives from the template registry` describe:

  ```ts
    it("the cli tier never reaches a builder menu — Multi-mode has a catalog card but is not offered where it can't be edited", () => {
      expect(BUILDER_TEMPLATES.some((t) => t.id === 'multiMode')).toBe(true);
      expect(BUILDABLE_BUILDER_TEMPLATES.some((t) => t.id === 'multiMode')).toBe(false);
    });
  ```

  Re-run both commands. Expected: PASS. Note that the existing `'the Labs story renders all six by passing BUILDER_TEMPLATES explicitly'` case now renders seven cards — its assertions are about Voice being present, not about a count, so it stays green; if its NAME now reads wrong, rename it to `'the Labs story renders the whole catalog by passing BUILDER_TEMPLATES explicitly'` and leave the body alone.

- [ ] **5.5 Make `/api/create` refuse the cli tier LOUDLY (spec complication 7).** Today it falls through `!template` into the bare-scratch branch, so asking for Multi-mode would silently write a plain fullscreen chat — a silent wrong-thing, which is worse than a refusal. First the failing test, appended to `dev.test.ts`'s builder-server describe:

  ```ts
    it("/api/create refuses a cli-tier template by NAME, pointing at the CLI — never silently substituting a bare chat", () => {
      const out = createStarterFor({ templateId: 'multiMode', name: 'acme-console' });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.problems[0].message).toContain('Multi-mode');
        expect(out.problems[0].message).toMatch(/npm create kai|kai dev/);
      }
    });

    it('/api/create still creates a buildable template and still falls back to a bare chat for scratch', () => {
      const buildable = createStarterFor({ templateId: 'widget', name: 'acme-widget' });
      expect(buildable.ok && (buildable.starter as { layout?: string }).layout).toBe('widget');
      const scratch = createStarterFor({ templateId: 'scratch', name: 'acme-chat' });
      expect(scratch.ok && (scratch.starter as { layout?: string }).layout).toBe('fullscreen');
    });
  ```

  Then extract the decision out of the request handler in `dev.ts` so it is unit-testable (the handler keeps only the I/O), placing it beside `handleConstructPut`:

  ```ts
  /** `/api/create`'s starter decision, extracted so it is testable without a
   *  server. `/api/create` writes exactly ONE file and stays that way in v1
   *  (spec complication 7): the only multi-file template is `'cli'`-tier and
   *  the builder cannot edit it anyway, so rather than growing a multi-file
   *  create path nothing can use yet, a cli-tier request is REFUSED BY NAME
   *  with the command that does work. The tier flip (when builder editing of
   *  manifests lands) is where multi-file create belongs. */
  export function createStarterFor(body: {
    templateId?: string;
    variantId?: string;
    name?: string;
  }): { ok: true; starter: unknown } | { ok: false; problems: ConstructProblem[] } {
    const offered = cliTemplates().find((t) => t.id === body.templateId);
    if (offered && offered.availability === 'cli') {
      return {
        ok: false,
        problems: [
          {
            path: 'templateId',
            message: `"${offered.name}" is a manifest of several construct files, and the builder can't create or edit one yet — start it from the CLI instead: \`npm create kai\` (pick ${offered.name}), then \`kai dev <name>.construct.json\`.`,
          },
        ],
      };
    }
    const template = buildableTemplates().find((t) => t.id === body.templateId);
    return {
      ok: true,
      starter:
        body.templateId === 'scratch' || !template
          ? { name: body.name, layout: 'fullscreen', provider: { mode: 'mock' } }
          : {
              ...(template.variants?.find((v) => v.id === body.variantId)?.starter ?? template.starter),
              name: body.name,
            },
    };
  }
  ```

  and rewrite the handler branch to use it:

  ```ts
        if (req.method === 'POST' && url === '/api/create') {
          if (abs) return send(409, { problems: [{ path: '', message: 'a construct already exists in this session' }] });
          const body = (await readJsonBody(req)) as { templateId?: string; variantId?: string; name?: string };
          const picked = createStarterFor(body);
          if (!picked.ok) return send(422, { problems: picked.problems });
          const validated = validateConstruct(picked.starter);
          if (!validated.ok) return send(422, { problems: validated.problems });
          const target = resolve(process.cwd(), `${body.name}.construct.json`);
          atomicWriteJson(target, picked.starter);
          abs = target;
          await boot(target);
          return send(200, { previewUrl, construct: picked.starter });
        }
  ```

  Update `dev.ts`'s templates import to `import { buildableTemplates, cliTemplates } from './templates';`. Re-run the dev tests. Expected: PASS.

- [ ] **5.6 Offer the tier in the MCP `construct` tool, naming the deferral (R6).** Failing test first — append to `packages/ui/src/agent-tooling/mcp/construct-tool.test.ts` (follow its existing call idiom for `constructTool.handler`):

  ```ts
  describe('the cli tier in the construct tool (R5a/R6)', () => {
    it('lists Multi-mode among the templates when no intent matches, marked CLI-only', async () => {
      const out = await constructTool.handler({ intent: 'something with no template in it' });
      const text = out.content[0].text as string;
      expect(text).toContain('multiMode — Multi-mode');
      expect(text).toMatch(/CLI only for now/);
    });

    it('a multi-mode intent returns the manifest AND every mode file, each with its filename', async () => {
      const out = await constructTool.handler({ intent: 'I want two modes with a switcher between them' });
      const text = out.content[0].text as string;
      expect(text).toContain('./multi-mode-assistant.construct.json');
      expect(text).toContain('./multi-mode-computer.construct.json');
      expect(text).toMatch(/one directory/);
      // Menu-honesty in prose: the builder deferral is stated, not implied.
      expect(text).toMatch(/visual builder can't edit a manifest yet/);
    });

    it('validating a manifest says which check this stateless tool CANNOT do', async () => {
      const out = await constructTool.handler({
        construct: {
          name: 'acme-console',
          modes: [
            { id: 'assistant', label: 'Assistant', file: './assistant.construct.json' },
            { id: 'computer', label: 'Computer', file: './computer.construct.json' },
          ],
        },
      });
      const text = out.content[0].text as string;
      expect(text).toContain('MANIFEST of 2 modes');
      expect(text).toMatch(/kai validate/);
    });
  });
  ```

  Then in `mcp/tools/construct.ts`:
  - swap the import to `import { buildableTemplates, cliTemplates, type BuildableTemplateId, type TemplateId } from '../../construct/templates';` and change `starterFor`'s `const templates = buildableTemplates();` to `const templates = cliTemplates();`.
  - widen `INTENT_PATTERNS`' id type to `TemplateId` and add the multi-mode pattern FIRST (it is the most specific — "modes" must not be eaten by another alternative):

    ```ts
    const INTENT_PATTERNS: readonly { id: TemplateId; re: RegExp }[] = [
      { id: 'multiMode', re: /\b(?:multi.?mode|modes|mode switcher|two surfaces|switch between)\b/i },
      { id: 'widget', re: /\b(?:widget|embed|bubble|corner|launcher)\b/i },
    ```
  - annotate the no-match template list so a cli-tier row says so:

    ```ts
          ...templates.map(
            (t) =>
              `  · ${t.id} — ${t.name}: ${t.description}${
                t.availability === 'cli' ? ' (CLI only for now — kai dev/eject/compile; the visual builder can\'t edit it yet)' : ''
              }`,
          ),
    ```
  - and give a matched cli-tier template its multi-file answer, replacing the tail of `starterFor`:

    ```ts
      const construct = structuredClone(template.starter) as Record<string, unknown>;
      construct.name = name;
      if (template.availability === 'cli') {
        // A manifest is USELESS without its siblings, so the tool hands back
        // every file it takes, each labeled with the exact basename the
        // manifest references. Deciding loudly beats returning one JSON blob
        // the author then has to reverse-engineer into three files.
        return {
          construct,
          modeFiles: template.modeStarters.map((m) => ({ file: m.file, construct: m.construct })),
          stated: [
            `template: ${template.id} (${template.name}) — implied by your request; every field below is yours to edit`,
            'this is a MANIFEST: the file above plus one construct file per mode. Write all of them into one directory — the manifest references its modes as siblings, and nothing else resolves.',
            "the visual builder can't edit a manifest yet; `kai dev`, `kai eject` and `kai compile` all work on it today.",
          ],
          questions: [tagQuestion],
        };
      }
      return { construct, stated: [...], questions: [tagQuestion] };
    ```

    Give `starterFor`'s return type an optional `modeFiles?: { file: string; construct: unknown }[]` and render it in the handler's `!construct` branch, right after the manifest's own fenced block:

    ```ts
                ...(s.modeFiles ?? []).flatMap((m) => [`${m.file}:`, '```json', JSON.stringify(m.construct, null, 2), '```']),
    ```
  - extend the manifest `VALID:` line from step 1.8.4 so it names the check this stateless tool cannot make (it already does — verify the wording matches the test's `/kai validate/`).

  Run the MCP tool tests. Expected: PASS.

- [ ] **5.7 Teach the wizard the manifest shape (R5c, spec complication 1's last site).** Failing tests first — append to `packages/create-kai/test/wizard.test.ts`:

  ```ts
  describe('the cli tier in the wizard (R5c)', () => {
    it('shapeAxis offers every cliTemplates() entry, so Multi-mode appears without a second list', () => {
      expect(shapeAxis().options.map((o) => o.id)).toEqual([
        ...cliTemplates().map((t) => t.id),
        'scratch',
        'app',
      ]);
    });

    it('composeConstruct returns a manifest for the multiMode shape — no layout, no provider, no invented keys', () => {
      const construct = composeConstruct({
        name: 'acme-console',
        shape: 'multiMode',
        headerTitle: undefined,
        home: undefined,
        homeGreeting: '',
        starters: [],
        attachments: false,
        history: false,
        accent: undefined,
      }) as Record<string, unknown>;
      expect(Object.keys(construct).sort()).toEqual(['$schema', 'modes', 'name', 'theme']);
      expect(construct.name).toBe('acme-console-chat');
    });

    it('constructTagName gets the "chat" kind for a manifest — a manifest has no layout to read (the wizard.ts:226 fix)', () => {
      const construct = composeConstruct({
        name: 'myapp',
        shape: 'multiMode',
        headerTitle: undefined, home: undefined, homeGreeting: '', starters: [], attachments: false, history: false, accent: undefined,
      }) as { name: string };
      expect(construct.name).toBe('myapp-chat');
    });

    it('emitConstruct writes the manifest AND every mode file, under the basenames the manifest references', async () => {
      const dir = join(mkdtempSync(join(tmpdir(), 'kai-wizard-manifest-')), 'app');
      const result = await emitConstruct(dir, {
        name: 'acme-console',
        shape: 'multiMode',
        headerTitle: undefined, home: undefined, homeGreeting: '', starters: [], attachments: false, history: false, accent: undefined,
      });
      expect(result.files.map((f) => path.basename(f)).sort()).toEqual([
        'acme-console.construct.json',
        'multi-mode-assistant.construct.json',
        'multi-mode-computer.construct.json',
      ]);
      // Every written file parses, and the manifest's references resolve
      // against its OWN directory — the sibling rule, end to end.
      const manifest = JSON.parse(readFileSync(result.file, 'utf8'));
      for (const mode of manifest.modes) {
        expect(existsSync(join(dir, mode.file.slice(2)))).toBe(true);
      }
      expect(result.devCommand).toBe('npx @kitn.ai/ui dev acme-console.construct.json');
    });

    it('a single-file shape still writes exactly one file (the wizard did not grow a second path)', async () => {
      const dir = join(mkdtempSync(join(tmpdir(), 'kai-wizard-single-')), 'app');
      const result = await emitConstruct(dir, {
        name: 'acme-widget',
        shape: 'widget',
        headerTitle: undefined, home: undefined, homeGreeting: '', starters: [], attachments: false, history: false, accent: undefined,
      });
      expect(result.files).toEqual([result.file]);
    });
  });
  ```

  Add `cliTemplates` to this file's `@kitn.ai/ui/construct/templates` import, and add `'multiMode'` to the `SHAPES` matrix const so every existing answer-matrix cell runs over it too:

  ```ts
  const SHAPES: WizardAnswers['shape'][] = ['widget', 'scratch', 'multiMode'];
  ```

  Run and watch it fail. Then in `packages/create-kai/src/wizard.ts`:
  - `import { buildableTemplates, cliTemplates, type BuildableTemplateId, type TemplateId } from '@kitn.ai/ui/construct/templates';`
  - `export type ShapeId = TemplateId | 'scratch' | 'app';` (the axis now offers cli-tier ids too; `'voice'` never reaches it because `cliTemplates()` excludes story-only).
  - `shapeAxis()`: `...cliTemplates().map((t) => ({ id: t.id, label: t.name, hint: t.description })),` and update its comment — "Only buildable templates are offered" becomes "Only templates whose CLI chain works end to end are offered — `cliTemplates()`; Voice stays a Labs story card, and the tier distinction lives in ONE place (menu-honesty)."
  - `wizardStarter`: look the shape up in `cliTemplates()` rather than `buildableTemplates()`.
  - `composeConstruct`'s tag-kind line (`wizard.ts:226`) — the recorded complication:

    ```ts
    // A MANIFEST has no `layout` at all (the schema rejects it beside
    // `modes`), so this cannot read the tag kind off the starter for every
    // shape any more: a manifest is always a filling surface, never a corner
    // widget, so it takes 'chat' explicitly. Reading `construct.layout ===
    // 'widget'` on a manifest would silently yield 'chat' too — this states
    // the reason rather than relying on undefined behaving conveniently.
    const tagKind = construct.modes ? 'chat' : construct.layout === 'widget' ? 'widget' : 'chat';
    construct.name = constructTagName(a.name, tagKind);
    ```

    and give the typed local a `modes?: unknown[]` member so this compiles.
  - guard the surface-only edits: every block after the name line (`headerTitle`, `accent`, `home`, `capabilities`) writes keys the manifest schema REJECTS. Wrap them:

    ```ts
    // The manifest is the app SHELL — every surface fact belongs to a mode's
    // own file (schema.ts's `modes-or-surface`), so the guided questions have
    // nothing to write here. `runWizard` states that rather than asking them
    // (below); this is the composer's half of the same rule.
    if (construct.modes) return construct;
    ```

    placed immediately after the `construct.name = …` assignment.
  - `runWizard`: for a manifest shape, ask nothing and STATE why, before the existing question sequence:

    ```ts
    const starterIsManifest = Boolean((starter as { modes?: unknown }).modes);
    ```

    and, in the interactive branch after the `Template` statement:

    ```ts
    if (starterIsManifest) {
      io.state(
        'Modes',
        `${((starter as { modes?: { id: string }[] }).modes ?? []).map((m) => m.id).join(' + ')} — a manifest writes one construct file per mode beside it; edit a mode's own file to change that surface (the questions below apply to a single-surface construct only)`,
      );
      return { name, shape, headerTitle: undefined, home: undefined, homeGreeting: '', starters: [], attachments: false, history: false, accent: undefined };
    }
    ```

    (A prompt whose answer is discarded is not a question — the same rule `axes.ts` already enforces.)
  - `emitConstruct`: write the whole starter set and report every file.

    ```ts
    export async function emitConstruct(
      dir: string,
      answers: WizardAnswers,
    ): Promise<{ file: string; files: string[]; devCommand: string; constructName: string }> {
      if (existsSync(dir) && (await readdir(dir)).length > 0) {
        throw new Error(`${dir} already exists and is not empty`);
      }
      await mkdir(dir, { recursive: true });

      const construct = composeConstruct(answers) as { name: string; modes?: { file: string }[] };
      const fileName = `${answers.name}.construct.json`;
      const file = path.join(dir, fileName);
      await writeFile(file, `${JSON.stringify(construct, null, 2)}\n`, 'utf8');
      const files = [file];

      // A manifest is useless without its siblings, so the wizard writes them
      // together, under exactly the basenames the manifest references (R5b).
      // They go in the SAME directory because `file` is sibling-only — nothing
      // else resolves.
      if (construct.modes) {
        const template = cliTemplates().find((t) => t.id === answers.shape);
        const modeStarters = template && 'modeStarters' in template ? template.modeStarters : [];
        for (const modeStarter of modeStarters) {
          const modePath = path.join(dir, modeStarter.file.slice(2));
          await writeFile(modePath, `${JSON.stringify(modeStarter.construct, null, 2)}\n`, 'utf8');
          files.push(modePath);
        }
      }

      return { file, files, devCommand: `npx @kitn.ai/ui dev ${fileName}`, constructName: construct.name };
    }
    ```
  - `WIZARD_REGISTRY`'s `modes` entry from step 1.9 flips to the truth now:

    ```ts
      modes: {
        status: 'stated',
        reason:
          'multi-mode is a whole TEMPLATE, not a field: picking the Multi-mode shape writes a manifest plus one construct file per mode, and the wizard states the mode list rather than asking about it — edit a mode\'s own construct file to change that surface',
      },
    ```
  - `packages/create-kai/src/index.ts`'s `runConstructFlow`: report every file, not just the first.

    ```ts
      spinner.stop(
        result.files.length > 1
          ? `Wrote ${result.files.map((f) => pc.cyan(path.relative(process.cwd(), f))).join(', ')} — a manifest and one construct file per mode`
          : `Wrote ${pc.cyan(path.relative(process.cwd(), result.file))}`,
      );
    ```

  Run `pnpm --filter create-kai test`. Expected: PASS, including every answer-matrix cell for the new shape.

- [ ] **5.8 Generate the fixtures and list them.** In `packages/ui/scripts/gen-construct-template-fixtures.mjs`, import `cliTemplates` alongside `buildableTemplates`, and write the cli tier's whole starter set:

  ```js
  const { buildableTemplates, cliTemplates } = await importTs(
    join(PKG_ROOT, 'src/agent-tooling/construct/templates.ts'),
  );
  ```

  ```js
  // The cli tier (2026-08-30): a manifest starter plus its sibling MODE files,
  // written under exactly the basenames the manifest references so
  // verify-construct.mjs's discovery walk can eject the tree as one project —
  // and so each mode file is ALSO discovered as a standalone fixture, which is
  // the individually-ejectable guarantee under test, not an accident.
  for (const template of cliTemplates()) {
    if (template.availability !== 'cli') continue;
    const files = [
      [template.id, template.starter],
      ...template.modeStarters.map((m) => [m.file.slice(2).replace(/\.construct\.json$/, ''), m.construct]),
    ];
    for (const [name, starter] of files) {
      const out = join(OUT_DIR, `${name}.construct.json`);
      writeFileSync(out, `${JSON.stringify(starter, null, 2)}\n`);
      console.log(`  · wrote ${out}`);
    }
  }
  ```

  Run `cd packages/ui && npm run build:api`, then add the three new paths to `GENERATED` in `packages/ui/scripts/verify-generated-sync.mjs`, after the workspace rows:

  ```js
    // The cli tier's multi-file starter set (2026-08-30): the manifest plus
    // one file per mode. All three are written by the same generator; the
    // ADD-direction guard (cfg.fixtureDir) would fail on any of them being
    // unlisted, which is exactly how this list stays honest.
    { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/multiMode.construct.json', probe: 'overwrite' },
    { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/multi-mode-assistant.construct.json', probe: 'overwrite' },
    { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/multi-mode-computer.construct.json', probe: 'overwrite' },
  ```

  **Watch the ADD-direction guard fire first** (it is the guard that would otherwise let a new fixture go unchecked forever): run `pnpm --filter @kitn.ai/ui run verify:generated` BEFORE adding the three lines and paste the `3 fixture(s) in … are not in GENERATED` failure; then add them and re-run for green.

- [ ] **5.9 Run every gate this task touches.**

  <!-- gate-list: partial -- the gates task 5 touches, not the required CI `test` job's full gate set -->
  ```
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit
  pnpm --filter create-kai test
  pnpm --filter @kitn.ai/ui run typecheck
  pnpm --filter @kitn.ai/ui run verify:generated
  nx build ui --skip-nx-cache
  cd packages/ui && node scripts/verify-construct.mjs --self-test && npm run verify:construct
  cd ../.. && pnpm --filter @kitn.ai/ui run verify:scaffold
  ```

  Read `verify:construct`'s PRINTED counts: the named-fixture count grows by three (the manifest and its two mode files), and the manifest fixture ejects as one project while each mode file ALSO ejects standalone — the dual role, working. `verify:scaffold` is untouched by this arc but shares the registry machinery, so run it and confirm it prints its own axes and cell counts unchanged. create-kai's `bundleGraphProblem` runs inside its own test/build — confirm the leaf stayed zod-free (`templates.ts` gained data and two type declarations only).

- [ ] **5.10 Commit.**

  ```bash
  git add packages/ui/src/agent-tooling/construct/templates.ts \
          packages/ui/src/agent-tooling/construct/templates.test.ts \
          packages/ui/src/agent-tooling/construct/dev.ts \
          packages/ui/src/agent-tooling/construct/dev.test.ts \
          packages/ui/src/agent-tooling/construct/fixtures/templates \
          packages/ui/src/agent-tooling/mcp/tools/construct.ts \
          packages/ui/src/agent-tooling/mcp/construct-tool.test.ts \
          packages/ui/src/components/builder-start.tsx \
          packages/ui/src/components/builder-start.test.tsx \
          packages/ui/scripts/gen-construct-template-fixtures.mjs \
          packages/ui/scripts/verify-generated-sync.mjs \
          packages/create-kai/src/wizard.ts \
          packages/create-kai/src/index.ts \
          packages/create-kai/test/wizard.test.ts
  git commit -m "feat(construct): Multi-mode joins the registry on a cli availability tier"
  ```

---

## Task 6 — Docs, the end-of-arc IVP, and close-out

Implements R6's docs obligations and R7's "each decided loudly" record.

**Files**
- Create: `apps/docs/src/content/docs/guides/multi-mode.mdx`
- Modify: `apps/docs/astro.config.mjs` (sidebar entry)
- Modify: `apps/docs/src/content/docs/guides/drop-in-widget.mdx` (one cross-link)
- Modify: `docs/coupling-map.md` (final pass)
- Modify: `~/.claude/projects/-Users-home-Projects-kitn-ai-kitn-chat/memory/` (the construct-engine memory note)

### Steps

- [ ] **6.1 Write the guide.** Create `apps/docs/src/content/docs/guides/multi-mode.mdx`. Voice: `apps/docs/STYLE.md` — a sharp human engineer, web-components-first, no emoji, no spoon-feeding, no boilerplate. Structure and content (write real prose over this skeleton; every code block below is REAL and must be checked against the shipped starter with `cat packages/ui/src/agent-tooling/construct/fixtures/templates/multiMode.construct.json`):

  ```mdx
  ---
  title: Multi-mode
  description: One element, two surfaces, a switcher between them — each mode is its own construct file.
  ---
  ```

  Sections, in order:

  1. **What it is.** A construct file whose `modes` list names sibling construct files. The manifest is the app shell; each mode is a complete, ordinary construct — the same file you would hand `kai dev` on its own. Nothing nests.
  2. **The manifest**, with the real starter JSON pasted from the fixture, and the four keys that are legal in it (`$schema`, `name`, `theme`, `modes`) plus the sentence that carries the rule: everything else belongs to the mode file that owns that surface, so every mode stays individually ejectable with nothing withheld.
  3. **The sibling rule.** `file` must be `./something.construct.json` — one path segment, beside the manifest. Show the rejection message. State the payoff: the whole tree lives in one directory, so `kai dev` watches all of it and there is no path traversal to defend against, because none is expressible.
  4. **What the switcher does.** One custom element, one host, one shadow root; a segmented control on a slim bar; exactly one mode mounted at a time. Modes are independent in v1 — no shared conversation, no shared history. A mode with `capabilities.history.persistence: "local"` survives a switch through its own persistence; a mode with `none` does not, which is what `none` means.
  5. **Theme precedence.** The manifest's `theme` drives the one facade. A mode file's own `theme` applies when that file is ejected standalone and not when it is mounted under a manifest — and the CLI prints one line per mode this affects. Paste the real notice text.
  6. **The commands.** `kai validate` over a manifest prints the whole tree; `kai dev` watches every file in it; `kai eject` writes `src/App.tsx` (the shell) plus `src/modes/<id>/`; `kai compile` still produces one `.js`. Show the `kai validate` output shape.
  7. **What's out, and why.** No nested manifests. No per-mode overrides in the manifest (`theme` is precedence, not patching). No cross-mode shared state. The switcher sits on a top bar, not in a mode's rail. The visual builder shows a manifest read-only and names the command that edits each mode. Each of these is a decision, so say which and say briefly why — do not present them as gaps.

  Register it in `apps/docs/astro.config.mjs` right after the Drop-in widget entry:

  ```js
                { label: 'Multi-mode', slug: 'guides/multi-mode' },
  ```

  And add one line to `apps/docs/src/content/docs/guides/drop-in-widget.mdx`, at the end of its "The wizard's third choice" paragraph: a sentence pointing at `/guides/multi-mode/` for the case where one element needs more than one surface.

- [ ] **6.2 Build the docs and read the page.**

  ```
  pnpm --filter @kitn.ai/ui-docs build
  ```

  (If that filter name is wrong, read the package name off `apps/docs/package.json` — do not guess twice.) Expected: a clean build with the new page in the output. Then start `pnpm dev` and open `http://localhost:4321/guides/multi-mode/`, confirm the sidebar entry and that every code block renders.

- [ ] **6.3 Voice pass.** Re-read the page against `apps/docs/STYLE.md`. Specifically: no em-dash-heavy AI cadence, no "simply"/"just", no restating the schema as a table when the JSON already shows it, and no number a script could print (never state how many templates or cells exist — name the command).

- [ ] **6.4 Final coupling-map pass.** Re-read the two §4 edits from Task 2 step 2.10 against what actually shipped and correct any drift: the template-registry row's multi-file sentence must match `CliTemplate`'s real member name (`modeStarters`), and the new `TOP_LEVEL_EXCLUDED`↔axis row must name the real function (`manifestCells()`) and the real self-test probe number (4). Add the manifest guide to §9's "docs that restate code" list only if the page ends up restating an enum or a cap — if it shows real JSON and real command output instead, it does not belong there, and say so in the report rather than adding a row for symmetry.

- [ ] **6.5 The end-of-arc IVP (deferred per the repo's defer-IVP policy).** From a scratch directory OUTSIDE the repo, drive the real published-ish chain against this checkout's build. Do NOT use `storybook-static`; `kai dev` runs a real Vite server.

  ```
  nx build ui --skip-nx-cache
  mkdir -p /tmp/kai-manifest-ivp && cd /tmp/kai-manifest-ivp
  cp <repo>/packages/ui/src/agent-tooling/construct/fixtures/templates/multiMode.construct.json app.construct.json
  cp <repo>/packages/ui/src/agent-tooling/construct/fixtures/templates/multi-mode-*.construct.json .
  node <repo>/packages/ui/bin/mcp.js validate app.construct.json
  node <repo>/packages/ui/bin/mcp.js dev app.construct.json
  ```

  Then, in the browser (Playwright or Claude-in-Chrome), confirm and SCREENSHOT each:
  1. the segmented switcher renders with both mode labels, and clicking Computer swaps the whole surface (not just a header);
  2. each mode's composer is fully visible and reachable at the bottom of its region — this is the `--kai-surface-height` fix; a clipped composer means the var is not reaching the mode wrapper;
  3. hand-editing `multi-mode-assistant.construct.json` (change `header.title`) hot-updates the tab without restarting `kai dev` — the widened basename set;
  4. hand-editing that same file into an INVALID state prints the pathed `modes[0].file → …` problem AND leaves the last good preview running;
  5. `kai dev --builder app.construct.json` shows the read-only manifest screen — the mode list, the per-mode `kai dev --builder ./…` commands, the deferral note — beside a LIVE preview iframe (R4c: only the editing panel is deferred, not seeing it run).

  Paste the raw `kai validate` output and attach the screenshots. Any defect found here is fixed in the task that owns the file, with a test added there — never patched in the IVP.

- [ ] **6.6 Update memory.** Append to the construct-engine memory note (`construct-engine.md` in the project memory dir) a short entry: multi-mode SHIPPED as a manifest of constructs; the vocabulary is `modes` on the same schema with `modes-or-surface` carrying the exclusion; resolution lives in `construct/tree.ts` (never schema.ts); the registry's new `'cli'` tier is what keeps the wizard/MCP honest while the builder cannot edit a manifest; and the reopen trigger for the deferred pieces — an in-rail switcher (needs a rail-composition seam), builder editing (flips the tier to `'buildable'` and every menu widens on its own), manifest-level `userId`, and cross-mode shared state (new vocabulary on new evidence, not a default).

- [ ] **6.7 Commit.**

  ```bash
  git add apps/docs/src/content/docs/guides/multi-mode.mdx \
          apps/docs/astro.config.mjs \
          apps/docs/src/content/docs/guides/drop-in-widget.mdx \
          docs/coupling-map.md
  git commit -m "docs(construct): the multi-mode manifest guide"
  ```

- [ ] **6.8 Whole-arc gate sweep before opening the PR.** Every required check, from the repo root, in the foreground:

  <!-- gate-list: partial -- the arc's own pre-PR checklist, a hand-picked subset; the required CI `test` job (44 gates -- `node packages/ui/scripts/lint-gate-parity.mjs --list`) is the merge verdict -->
  ```
  pnpm --filter @kitn.ai/ui run typecheck
  pnpm --filter @kitn.ai/ui exec vitest run --project=unit
  pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
  pnpm --filter create-kai test
  pnpm --filter @kitn.ai/ui run verify:generated
  pnpm --filter @kitn.ai/ui run lint:silent-drops
  pnpm --filter @kitn.ai/ui run lint:cdn-pins
  pnpm --filter @kitn.ai/ui run verify:consumer
  pnpm --filter @kitn.ai/ui run verify:scaffold
  cd packages/ui && node scripts/verify-construct.mjs --self-test && npm run verify:construct
  ```

  `lint:silent-drops` must be UNTOUCHED — nothing in this arc changes a `src/wire` discrimination. If you find yourself editing `src/wire`, stop and surface it: that is a spec deviation, not something to waive. Paste every command's raw tail.

---

## Self-review

**1. Spec coverage.**

| Spec | Where |
|---|---|
| R1a — `modes` vocabulary, min 2 / max 6, id/label/file shape | Task 1 (1.1, 1.3) |
| R1b — exactly four legal keys beside `modes`, loud per-key message, derived not restated | Task 1 (1.4, `modes-or-surface`) |
| R1c — the sibling-only `file` regex, duplicate files rejected | Task 1 (1.3, 1.4) |
| R1d — `layout`/`provider` optional; artifact `required` weakening recorded; every new rule classified in `RULE_VISIBILITY` | Task 1 (1.3, 1.7, 1.10) |
| R1e — a referenced manifest rejected loudly; the complete v1 cycle story | Task 2 (2.1, 2.3 — the FIRST rule in `resolveModes`) |
| R2 — resolution in the CLI layer, one-pass error collection, both coordinates, `kai validate` prints the tree | Task 2 (2.3, 2.6, 2.7) |
| R3a — per-mode emit is a REUSE, prefixed; the byte-equality pin | Task 3 (3.1's reuse pin, 3.4's `emitSurfaceFiles`) |
| R3b — the thin shell, `<Show>` single mount, JSON.stringify'd ids/labels | Task 3 (3.5) |
| R3c — top-bar placement; in-rail recorded as future work | Task 3 (3.5's doc comment), Task 6 (guide §7) |
| R3d — one facade, theme precedence, the printed per-mode notice | Task 2 (`treeNotices`), Task 3 (`emitElement`/`projectNeedsHost`) |
| R3e — index.html, workdir, compile unchanged | Task 2 (2.6's compile branch), Task 3 (3.1's host-page case) |
| R4a — the basename SET, recomputed per turn, one directory watcher | Task 4 (4.3, 4.4) |
| R4b — read-only manifest screen, `inferTemplateId`'s modes branch, additive `/api/state.manifest` | Task 4 (4.5, 4.7–4.10) |
| R4c — the live preview stands beside the read-only screen | Task 4 (4.10's `Show` keeps the iframe column), Task 6 (6.5's IVP item 5) |
| R5a — the `'cli'` tier, offered by wizard + MCP, excluded from BuilderStart + `/api/create` | Task 5 (5.3, 5.5, 5.6, 5.7) |
| R5b — `modeStarters`, `templates.test.ts` extends its safeParse pin, the leaf stays zod-free | Task 5 (5.1, 5.3, 5.9) |
| R5c — `cliTemplates()`, the `wizard.ts:226` fix, multi-file write | Task 5 (5.7) |
| R6 — `verify:construct` exclusion + manifest axis + self-test fault; dual-role fixtures; `verify:generated`; MCP wording; coupling-map rows | Task 2 (2.8–2.10), Task 5 (5.6, 5.8, 5.9) |
| R7.1 Settings out · R7.2 no per-mode overrides · R7.3 modes independent · R7.4 no nesting · R7.5 in-rail deferred · R7.6 builder editing deferred · R7.7 manifest `userId` deferred | Task 6 (guide §7) + Task 6.6 (memory's reopen triggers); R7.3 additionally emitted as a comment in the shell (Task 3.5) and asserted by the `<Show>` test (3.1) |
| Complication 1 (`c.layout` consumers) | Task 1 step 1.8 enumerates all five sites via tsc and fixes each; Task 5.7 fixes the sixth (`wizard.ts:226`) |
| Complication 2 (weaker external JSON-schema validation) | Documented at the schema edit itself (1.3's `layout` comment) and confirmed against the artifact diff in 1.10 |
| Complication 3 (`src/App.tsx`/`src/cards.ts` hardcoded) | Task 3.4 |
| Complication 4 (gate red between Tasks 1 and 2) | The Global Constraints sequencing note + steps 1.12 / 2.1 / 2.9 |
| Complication 5 (`RULE_VISIBILITY` key-set test) | Task 1 step 1.7, watched failing first |
| Complication 6 (builder fallback dead end) | Task 4 (4.7's `inferTemplateId`, 4.10's routing) — lands BEFORE the template task, as the spec requires |
| Complication 7 (`/api/create` single-file) | Task 5.5 — stays single-file, refuses the cli tier by name |
| Complication 8 (`templates.test.ts` / `builder-start.test.tsx` pins) | Task 5.1's replaced registry-shape case, 5.4's derivation-preserving fix |
| Complication 9 (shell import dedup) | Task 3.5's single assembled `solidNames` array + 3.1's one-import-statement assertion |

Two spec items are implemented differently from the spec's literal wording, both recorded at the site: `loadConstructTree` lives in `tree.ts` rather than `cli.ts` (cli.ts re-exports `loadConstruct`) because a value back-edge from `dev.ts` into `cli.ts` would cross cli.ts's deliberate dynamic `import('./dev')` chunk split; and the shell's `Tabs` items use the kit's real `id` key rather than the spec sketch's `value`.

**2. Placeholder scan.** No "TBD", no "similar to Task N", no "add appropriate error handling". Every code step carries real code; every gate step carries the exact command and the expected output. Three steps deliberately say "read it off the file rather than this plan" — the illustration style consts (5.4), the docs package name (6.2), and every printed cell/rule count — and that is the derive-don't-type rule, not a placeholder.

**3. Cross-task type consistency.** `ResolvedMode` is declared once (codegen.ts, Task 2.4) and used by tree.ts, dev.ts and codegen.ts under that one name. `ConstructTree`'s `single` branch carries `SurfaceConstruct`, which is what lets `cli.ts`'s validate read `c.layout`/`c.provider.mode` without assertions. `treeInput` returns `{ construct; modes? }` — exactly `generateProject`'s two arguments — and is the only call shape used by eject, compile, `dev()`, `boot()` and `regenerateTree`. `regenTurn` returns `Set<string> | null` in its declaration (4.3), its tests (4.1) and both call sites (4.4, 4.5b). `MULTI_MODE_TEMPLATE_ID` is declared in Task 4 and consumed by Tasks 4 and 5 under that name; `modeStarters` is the member name in `CliTemplate`, the fixtures generator, the wizard and the coupling-map row. `emitConstruct` returns `{ file, files, devCommand, constructName }` in Task 5.7 and `index.ts` reads `result.files` there.
