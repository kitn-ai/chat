# Construct Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A declarative construct format (one JSON file) + a single codegen pipeline that turns it into a readable Solid mini-project, previewed live with `kai dev` and compiled by `kai compile` into ONE self-registering web component — with `kai eject`, `kai validate`, a `construct` MCP tool, a published JSON Schema, and a `verify:construct` CI gate.

**Architecture:** Zod is the single source of truth for the format (`ConstructSchema`); the published JSON Schema and TS types derive from it. `kai dev` and `kai compile` share every line of generation (`generateProject`) — codegen-only, no interpreter. The generated project IS the eject artifact: deterministic, idiomatic, importing `@kitn.ai/ui/solid` + `/state` + `/wire`, wrapped in a `defineWebComponent` facade (newly exported on `@kitn.ai/ui/define`). Everything lives inside `@kitn.ai/ui` under `packages/ui/src/agent-tooling/construct/`.

**Tech Stack:** zod 4 (`z.toJSONSchema`, already the repo pattern in `mcp/server.ts`) · SolidJS 1.x (`@kitn.ai/ui/solid`) · Vite 6 + vite-plugin-solid in the GENERATED project · vitest `--project=unit` · Node scripts for gates (modeled on `verify-scaffold-compiles.mjs` / `verify-consumer-sideeffects.mjs`).

**Spec:** `docs/superpowers/specs/2026-08-25-construct-engine-design.md` — the plan argues from the spec; executors read both.

## Recorded decisions (the spec's "decided in the plan" items)

1. **Packaging boundary: the construct engine lives INSIDE `@kitn.ai/ui`. No new package.** What the packaging actually supports: `package.json` ships exactly one bin (`"kai-mcp": "./bin/mcp.js"`), and `npx @kitn.ai/ui mcp` already passes `mcp` as an argument that `bin/mcp.js` ignores — so the bin is one `argv` switch away from being a subcommand dispatcher with zero breaking change (`mcp`/no-arg keeps starting the MCP server). The package already ships compiled Node entries (`dist/mcp.es.js` via `vite.config.mcp.ts`'s SSR build) — the CLI gets a sibling, `dist/construct-cli.es.js`. A separate `kai` CLI package would need its own copy of the Zod schema and codegen, which is exactly the drift the owner's option-B ruling ("one generation path") forbids; and the `route-emit.ts` header documents what happened last time a second package pulled agent-tooling code across a boundary (203 kB → 904 kB). The MCP construct tool registers in the existing `tools` array in `mcp/server.ts`.
2. **`split` layout v1 depth: two-pane minimum**, composed from the kit's `PaneGroup` (`@kitn.ai/ui/solid`), chat in the start pane, the construct's `slots` projected into the end pane. Pane-grid passthrough is the arbitrary-element-tree grain — out (format rule 2).
3. **Backend route stubs: NOT emitted in v1.** The `construct` MCP tool's success response and `kai compile`'s completion message point `endpoint` authors at the existing `scaffold` MCP tool, which already emits every route the catalog knows, compiled by `verify:scaffold`. One route emitter stays one; revisit as a `kai eject --route` flag on evidence.
4. **Emitted interior styling: kit components + inline styles only, no Tailwind classes.** `defineWebComponent` injects the compiled kit CSS into the shadow root, so kit components are styled with zero build setup in the generated project — the whole reason the generated project needs no Tailwind. A raw utility class in an emit template would silently render unstyled; the codegen determinism test greps for `class="` with non-kit utilities as a tripwire.
5. **`@kitn.ai/ui/define` is a new public subpath** (Task 2). `defineWebComponent` is currently internal (`src/elements/define.tsx`); the facade the spec requires cannot be emitted without it. It gets its own entry (not `./solid`) because `define.tsx` pulls `ELEMENT_CSS` (the whole compiled kit CSS) + `solid-element`, which `./solid` consumers must not pay for.

## Global Constraints

Copied from the spec — every task's requirements implicitly include these:

- **Vocabulary, never logic** (hard rule): no conditionals, expressions, or handlers in construct JSON. The moment a construct needs an `if`, that construct wants to be code — use an exit (slots → eject → catalog).
- **No secrets, no client:** `provider` is `mock` or an endpoint URL + wire format. Kit parses, consumer fetches — enforced by the format.
- **Generated code imports `@kitn.ai/ui/state` + `@kitn.ai/ui/wire` — never a hand-rolled SSE reader, generated code included.**
- **The generated project IS the eject artifact:** deterministic (same construct → same source), idiomatic, readable, no generator droppings.
- **Enums over free-form wherever behavior varies.**
- **Interior pure Solid** — no nested element registrations; one `defineWebComponent` facade at the boundary.
- **Consumers install nothing but the output;** Solid appears only if they eject.
- **The catalog remains the PRIMARY consumer surface;** a construct is pre-composed catalog, additive.
- **The chat spine is implied, not declared** — thread + input + streaming always present; the file declares deviations and additions only.
- **Zod is the single source of truth;** published JSON Schema + TS types derived from it; the published schema is a build:api generated artifact under the generated-artifact drift guard. Versioned `construct/v1.json`.
- House rules: conventional commits (release-please — never hand-edit the version) · docs voice per `apps/docs/STYLE.md`, no em dashes as an AI tell, no emoji · no SSN-style examples in fixtures or docs · **derive it, don't type it** — the `verify:construct` fixture axes derive from the schema artifact, never a hand-written list · everything the model produced is untrusted input (card schemas flow through the kit's existing guards; codegen must not route construct strings to `innerHTML`).

## File structure (locked here; tasks reference it)

```
packages/ui/src/agent-tooling/construct/
  schema.ts                     # ConstructSchema (Zod) + validateConstruct     (Task 1, grows 7–13)
  schema.test.ts
  codegen.ts                    # generateProject + writeProject + emit templates (Task 3, grows 6–13)
  codegen.test.ts
  cli.ts                        # runCli: validate | eject | dev | compile      (Task 4, grows 5–6)
  cli.test.ts
  cli-entry.ts                  # build entry, auto-runs runCli(process.argv)   (Task 4)
  dev.ts                        # kai dev: workdir, install, spawn vite, watch  (Task 5)
  dev.test.ts
  fixtures/
    demo-widget.construct.json  # the walking-skeleton fixture                  (Task 5)
    owner-widget.construct.json # the four-sentence e2e result                  (Task 17)
    ops-console.construct.json  # ops-console re-expressed                      (Task 15)
  construct.v1.schema.json      # GENERATED (gen-construct-schema.mjs)          (Task 14)
packages/ui/src/elements/define-entry.ts        # public ./define surface       (Task 2)
packages/ui/src/agent-tooling/mcp/tools/construct.ts   # the MCP tool           (Task 16)
packages/ui/src/agent-tooling/mcp/construct-tool.test.ts
packages/ui/src/agent-tooling/mcp/construct-conversation.test.ts               # (Task 17)
packages/ui/vite.config.define.ts               # ./define bundle               (Task 2)
packages/ui/vite.config.construct-cli.ts        # dist/construct-cli.es.js      (Task 4)
packages/ui/scripts/gen-construct-schema.mjs    # schema artifact generator     (Task 14)
packages/ui/scripts/verify-construct.mjs        # the CI gate                   (Task 15)
packages/ui/bin/mcp.js                          # becomes the subcommand dispatcher (Task 4)
apps/docs/public/schemas/construct/v1.json      # GENERATED, served at ui.kitn.ai (Task 14)
```

All construct engine code sits under `src/agent-tooling/`, so `tsc --noEmit -p tsconfig.mcp.json` (part of `npm run typecheck` in `packages/ui`) covers it with no tsconfig changes. Run tests from the repo root: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit <file>`. A fresh checkout needs `pnpm install` + `pnpm --filter @kitn.ai/ui run build:css` + a real `nx build ui` before the suite means anything (see CLAUDE.md).

---

### Task 1: Construct schema core — `ConstructSchema` + `validateConstruct`

**Files:**
- Create: `packages/ui/src/agent-tooling/construct/schema.ts`
- Test: `packages/ui/src/agent-tooling/construct/schema.test.ts`

**Interfaces:**
- Consumes: `zod` (v4, already a dependency).
- Produces (later tasks rely on these exact names):
  - `export const CONSTRUCT_SCHEMA_URL = 'https://ui.kitn.ai/schemas/construct/v1.json'`
  - `export const ConstructSchema: z.ZodObject` — `.strict()`, core fields only for now: `$schema?`, `name`, `layout: z.enum(['widget'])`, `provider` (discriminated union `mock | endpoint`). Later tasks WIDEN it (7–13); they never restructure it.
  - `export type Construct = z.infer<typeof ConstructSchema>`
  - `export interface ConstructProblem { path: string; message: string }`
  - `export type ValidationOutcome = { ok: true; construct: Construct } | { ok: false; problems: ConstructProblem[] }`
  - `export function validateConstruct(input: unknown): ValidationOutcome`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/construct/schema.test.ts
import { describe, expect, it } from 'vitest';
import { validateConstruct } from './schema';

const minimal = {
  name: 'acme-support',
  layout: 'widget',
  provider: { mode: 'mock' },
};

describe('validateConstruct', () => {
  it('accepts the minimal widget construct', () => {
    const out = validateConstruct(minimal);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.construct.name).toBe('acme-support');
  });

  it('rejects a name that is not a valid custom-element tag', () => {
    // customElements.define requires a hyphen and lowercase; the emitted tag IS the name.
    const out = validateConstruct({ ...minimal, name: 'Support' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems[0].path).toBe('name');
      expect(out.problems[0].message).toMatch(/custom-element/i);
    }
  });

  it('rejects unknown keys with the path named (vocabulary is closed)', () => {
    const out = validateConstruct({ ...minimal, onMessage: 'alert(1)' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.map((p) => p.path)).toContain('onMessage');
  });

  it('accepts an endpoint provider and rejects a keyed one', () => {
    expect(
      validateConstruct({
        ...minimal,
        provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
      }).ok,
    ).toBe(true);
    // No client, no secrets: apiKey is not vocabulary, so strict() rejects it.
    const keyed = validateConstruct({
      ...minimal,
      provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai', apiKey: 'sk-x' },
    });
    expect(keyed.ok).toBe(false);
  });

  it('problems carry dotted paths for nested failures', () => {
    const out = validateConstruct({ ...minimal, provider: { mode: 'endpoint' } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path.startsWith('provider'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/ui/src/agent-tooling/construct/schema.ts
/**
 * The construct format, v1 — Zod is the SINGLE SOURCE OF TRUTH.
 *
 * The published JSON Schema (apps/docs/public/schemas/construct/v1.json) and the
 * checked-in construct.v1.schema.json are DERIVED from this object by
 * scripts/gen-construct-schema.mjs (build:api, drift-guarded). Never edit those
 * by hand; never restate an enum from here anywhere else — read it off
 * `ConstructSchema.shape` or the generated artifact.
 *
 * Format rules (spec, binding): vocabulary never logic — no handlers, no
 * expressions; `.strict()` everywhere so an unknown key is a loud rejection,
 * not a silently ignored one. No secrets, no client: `provider` can name a URL
 * and a wire format, nothing else.
 */
import { z } from 'zod';

export const CONSTRUCT_SCHEMA_URL = 'https://ui.kitn.ai/schemas/construct/v1.json';

/** A valid custom-element tag: lowercase, starts with a letter, contains a hyphen. */
const TAG_RE = /^[a-z][a-z0-9]*-[a-z0-9-]+$/;

const ProviderSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('mock') }).strict(),
  z
    .object({
      mode: z.literal('endpoint'),
      /** The CONSUMER's chat route. Kit parses, consumer fetches. */
      url: z.string().min(1),
      wire: z.enum(['openai', 'anthropic']),
    })
    .strict(),
]);

export const ConstructSchema = z
  .object({
    $schema: z.string().optional(),
    /** The emitted tag: <acme-support>. Must satisfy customElements.define. */
    name: z
      .string()
      .regex(TAG_RE, 'must be a valid custom-element tag: lowercase, with a hyphen (e.g. "acme-support")'),
    // Widened progressively: fullscreen/aside/split land in Task 12, custom in Task 13.
    layout: z.enum(['widget']),
    provider: ProviderSchema,
    theme: z
      .object({
        /** Any CSS color; becomes --kai-color-primary on the host. */
        accent: z.string().optional(),
        mode: z.enum(['light', 'dark', 'system']).default('system'),
      })
      .strict()
      .optional(),
  })
  .strict();

export type Construct = z.infer<typeof ConstructSchema>;

export interface ConstructProblem {
  /** Dotted path into the construct, '' for the root. */
  path: string;
  message: string;
}

export type ValidationOutcome =
  | { ok: true; construct: Construct }
  | { ok: false; problems: ConstructProblem[] };

/**
 * Validate one construct. The ONLY doorway to codegen: a failure never reaches
 * generation — the problems go back to the author/agent with paths and reasons.
 */
export function validateConstruct(input: unknown): ValidationOutcome {
  const parsed = ConstructSchema.safeParse(input);
  if (parsed.success) return { ok: true, construct: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      // zod's unrecognized-key issue names the keys in its message but paths the
      // OBJECT; surface each unknown key as its own problem so the agent sees
      // exactly which word is not vocabulary.
      ...(issue.code === 'unrecognized_keys'
        ? { path: [...issue.path.map(String), issue.keys[0]].join('.'), message: `"${issue.keys[0]}" is not construct vocabulary` }
        : { message: issue.message }),
    })),
  };
}
```

Note: zod 4's `unrecognized_keys` issue carries `keys: string[]`; if it lists several, map each key to its own `ConstructProblem` (flatMap instead of map). Adjust in this step, not later.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @kitn.ai/ui exec tsc --noEmit -p tsconfig.mcp.json`

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts
git commit -m "feat(construct): construct v1 Zod schema core + validateConstruct"
```

---

### Task 2: Public `@kitn.ai/ui/define` entry

The emitted facade needs `defineWebComponent`, which is internal today. New subpath, own bundle (pattern: `vite.config.state.ts` → `./state`).

**Files:**
- Create: `packages/ui/src/elements/define-entry.ts`
- Create: `packages/ui/vite.config.define.ts`
- Modify: `packages/ui/package.json` (`exports` map + `build` script chain + `sideEffects` untouched — this entry has none)
- Test: `packages/ui/src/elements/define-entry.test.ts`

**Interfaces:**
- Produces: `import { defineWebComponent } from '@kitn.ai/ui/define'` — signature unchanged from `src/elements/define.tsx:373`: `defineWebComponent<P extends Record<string, unknown>, E>(tag: string, propDefaults: P, Facade: (props: P, ctx: WebComponentContext<E>) => JSX.Element): void`. Also re-export `type WebComponentContext`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/elements/define-entry.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineWebComponent } from './define-entry';

describe('@kitn.ai/ui/define', () => {
  it('re-exports the real defineWebComponent', () => {
    expect(typeof defineWebComponent).toBe('function');
  });

  it('is wired into the exports map with types', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { exports: Record<string, { types?: string; default?: string }> };
    expect(pkg.exports['./define']).toEqual({
      types: './dist/define.d.ts',
      default: './dist/define.js',
    });
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/define-entry.test.ts`
Expected: FAIL — module not found, then (after creating the file) the exports-map assertion fails.

- [ ] **Step 3: Implement**

```ts
// packages/ui/src/elements/define-entry.ts
/**
 * @kitn.ai/ui/define — the facade seam, public.
 *
 * The construct engine's GENERATED projects (and any consumer who wants to wrap
 * a pure-Solid interior as one self-registering element) import from here. Its
 * own subpath rather than ./solid because define.tsx carries ELEMENT_CSS (the
 * full compiled kit CSS) and solid-element — weight ./solid consumers must not
 * pay. SSR-safe by construction: defineWebComponent no-ops without
 * customElements (see define.tsx).
 */
export { defineWebComponent } from './define';
export type { WebComponentContext } from './define';
```

```ts
// packages/ui/vite.config.define.ts
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

// Sibling of vite.config.state.ts: one small public entry, browser lib build,
// solid-js external (the consumer project provides it), emptyOutDir false
// because the main build already populated dist/.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/elements/define-entry.ts',
      formats: ['es'],
      fileName: () => 'define.js',
    },
    rollupOptions: { external: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  },
});
```

Before writing this config, open `packages/ui/vite.config.state.ts` and mirror its exact knobs (plugins, externals, dts handling) — the state entry is the reference for "one small public entry". If `dist/state.js` gets its `.d.ts` from `emit-subpath-dts.mjs`, add `define` to that script's entry list the same way; that script is the one that produces `dist/define.d.ts`.

`packages/ui/package.json` edits:
- In `exports`, after the `"./wire"` key: `"./define": { "types": "./dist/define.d.ts", "default": "./dist/define.js" },`
- In the `build` script, append `&& vite build --config vite.config.define.ts` immediately after the `vite.config.wire.ts` segment.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/define-entry.test.ts`
Expected: PASS.
Run: `nx build ui --skip-nx-cache` — expect `dist/define.js` + `dist/define.d.ts` to exist; `verify:dts` (runs in postbuild) must stay green.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/elements/define-entry.ts packages/ui/src/elements/define-entry.test.ts packages/ui/vite.config.define.ts packages/ui/package.json packages/ui/scripts/emit-subpath-dts.mjs
git commit -m "feat(elements): public @kitn.ai/ui/define entry for the facade seam"
```

---

### Task 3: Codegen core — `generateProject` for widget + mock (+ theme)

**Files:**
- Create: `packages/ui/src/agent-tooling/construct/codegen.ts`
- Test: `packages/ui/src/agent-tooling/construct/codegen.test.ts`

**Interfaces:**
- Consumes: `Construct` from `./schema` (Task 1); the `@kitn.ai/ui/define` entry existing (Task 2) so emitted imports resolve.
- Produces:
  - `export interface GeneratedFile { path: string; code: string }`
  - `export interface GenerateOptions { uiSpec?: string }` — override for the `@kitn.ai/ui` dependency spec (the gates install a local tarball; default derives `^<version>` from the package's own package.json via the `createRequire('@kitn.ai/ui/package.json')` pattern in `mcp/server.ts:51`).
  - `export function generateProject(construct: Construct, opts?: GenerateOptions): GeneratedFile[]`
  - `export function writeProject(files: GeneratedFile[], dir: string): void` — mkdir -p per file, write, and DELETE stale previously-generated files (tracked via a `.kai-manifest.json` listing generated paths) so a renamed emit never leaves droppings.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/construct/codegen.test.ts
import { describe, expect, it } from 'vitest';
import { generateProject } from './codegen';
import { validateConstruct, type Construct } from './schema';

function construct(overrides: Partial<Construct> = {}): Construct {
  const out = validateConstruct({
    name: 'acme-support',
    layout: 'widget',
    provider: { mode: 'mock' },
    ...overrides,
  });
  if (!out.ok) throw new Error(JSON.stringify(out.problems));
  return out.construct;
}

const file = (files: { path: string; code: string }[], path: string) => {
  const f = files.find((f) => f.path === path);
  if (!f) throw new Error(`missing ${path}; got ${files.map((x) => x.path).join(', ')}`);
  return f.code;
};

describe('generateProject (widget + mock core)', () => {
  it('emits the full project file set', () => {
    const paths = generateProject(construct()).map((f) => f.path).sort();
    expect(paths).toEqual(
      [
        'index.html',
        'package.json',
        'src/App.tsx',
        'src/element.tsx',
        'tsconfig.json',
        'vite.config.lib.ts',
        'vite.config.ts',
      ].sort(),
    );
  });

  it('is deterministic: same construct, same bytes', () => {
    expect(generateProject(construct())).toEqual(generateProject(construct()));
  });

  it('facade registers the construct name via @kitn.ai/ui/define', () => {
    const code = file(generateProject(construct()), 'src/element.tsx');
    expect(code).toContain("import { defineWebComponent } from '@kitn.ai/ui/define'");
    expect(code).toContain("defineWebComponent('acme-support'");
  });

  it('mock glue imports state + wire — never a hand-rolled SSE reader', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain("from '@kitn.ai/ui/state'");
    expect(app).toContain("from '@kitn.ai/ui/wire'");
    expect(app).not.toMatch(/text\/event-stream|EventSource|split\('\\n\\n'\)/);
  });

  it('theme accent lands as --kai-color-primary; mode maps onto the theme prop', () => {
    const files = generateProject(construct({ theme: { accent: '#e91e63', mode: 'dark' } }));
    expect(file(files, 'src/App.tsx')).toContain("'--kai-color-primary': '#e91e63'");
    expect(file(files, 'src/element.tsx')).toContain("theme: 'dark' as 'light' | 'dark' | 'auto'");
  });

  it('uiSpec overrides the @kitn.ai/ui dependency; default is ^<kit version>', () => {
    const pkg = (spec?: string) =>
      JSON.parse(file(generateProject(construct(), spec ? { uiSpec: spec } : {}), 'package.json'));
    expect(pkg('file:../kitn-ui.tgz').dependencies['@kitn.ai/ui']).toBe('file:../kitn-ui.tgz');
    expect(pkg().dependencies['@kitn.ai/ui']).toMatch(/^\^\d+\.\d+\.\d+$/);
  });

  it('emits no non-kit utility classes (interior styling rule)', () => {
    for (const f of generateProject(construct())) {
      expect(f.code).not.toMatch(/class(Name)?="(flex|grid|p-\d|m-\d|text-)/);
    }
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/codegen.test.ts`
Expected: FAIL — `Cannot find module './codegen'`.

- [ ] **Step 3: Implement `codegen.ts`**

The emit templates below are REAL and complete for the core; later tasks extend them at marked seams. Read `src/agent-tooling/mcp/tools/scaffold.ts:5030-5110` first — the solid scaffold cell is the house style for emitted Solid (its `@kitn.ai/ui/solid`-not-root rule applies here too).

```ts
// packages/ui/src/agent-tooling/construct/codegen.ts
/**
 * construct → generated Solid mini-project. THE single generation path:
 * kai dev, kai compile and kai eject all call generateProject — the preview IS
 * the artifact (owner-picked option B; no interpreter to drift).
 *
 * Quality bar: the output is the EJECT artifact. Deterministic (no dates, no
 * randomness, object keys emitted in fixed order), idiomatic, readable.
 * Interior is pure Solid composing @kitn.ai/ui/solid; provider glue imports
 * @kitn.ai/ui/state + /wire (never a hand-rolled SSE reader); the one
 * defineWebComponent facade carries the tag, theme default and slots.
 * Styling: kit components + inline styles only — defineWebComponent injects
 * the compiled kit CSS into the shadow root, so the generated project needs no
 * Tailwind, no CSS build, nothing.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Construct } from './schema';

export interface GeneratedFile {
  path: string;
  code: string;
}

export interface GenerateOptions {
  /** Dependency spec for @kitn.ai/ui in the generated package.json.
   *  Default: `^<this package's version>` (self-name resolution, mcp/server.ts pattern).
   *  The gates pass a local tarball path here. */
  uiSpec?: string;
}

function kitVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require('@kitn.ai/ui/package.json') as { version: string };
  return pkg.version;
}

const themeMode = (c: Construct): 'light' | 'dark' | 'auto' =>
  c.theme?.mode === 'light' ? 'light' : c.theme?.mode === 'dark' ? 'dark' : 'auto';

export function generateProject(construct: Construct, opts: GenerateOptions = {}): GeneratedFile[] {
  const uiSpec = opts.uiSpec ?? `^${kitVersion()}`;
  return [
    { path: 'package.json', code: emitPackageJson(construct, uiSpec) },
    { path: 'tsconfig.json', code: emitTsconfig() },
    { path: 'vite.config.ts', code: emitViteDev() },
    { path: 'vite.config.lib.ts', code: emitViteLib(construct) },
    { path: 'index.html', code: emitIndexHtml(construct) },
    { path: 'src/element.tsx', code: emitElement(construct) },
    { path: 'src/App.tsx', code: emitApp(construct) },
  ];
}

function emitPackageJson(c: Construct, uiSpec: string): string {
  return `${JSON.stringify(
    {
      name: c.name,
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build --config vite.config.lib.ts',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        '@kitn.ai/ui': uiSpec,
        'solid-js': '^1.9.0',
      },
      devDependencies: {
        typescript: '^5.6.0',
        vite: '^6.0.0',
        'vite-plugin-solid': '^2.11.0',
      },
    },
    null,
    2,
  )}\n`;
}

function emitTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'preserve',
        jsxImportSource: 'solid-js',
        strict: true,
        noUnusedLocals: true,
        skipLibCheck: true,
        types: ['vite/client'],
      },
      include: ['src'],
    },
    null,
    2,
  )}\n`;
}

function emitViteDev(): string {
  return `import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({ plugins: [solid()] });
`;
}

function emitViteLib(c: Construct): string {
  return `import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// kai compile: ONE self-registering .js. Everything is inlined (no externals):
// the consumer installs nothing but this output.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: { entry: 'src/element.tsx', formats: ['es'], fileName: () => '${c.name}.js' },
  },
});
`;
}

function emitIndexHtml(c: Construct): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${c.name} — construct preview</title>
  </head>
  <body>
    <${c.name}></${c.name}>
    <script type="module" src="/src/element.tsx"></script>
  </body>
</html>
`;
}

function emitElement(c: Construct): string {
  return `import { defineWebComponent } from '@kitn.ai/ui/define';
import { App } from './App';

// The one facade. Interior stays pure Solid (no nested element registrations);
// the kit CSS is injected into the shadow root by defineWebComponent itself.
defineWebComponent('${c.name}', { theme: '${themeMode(c)}' as 'light' | 'dark' | 'auto' }, () => <App />);
`;
}

// ── App interior ─────────────────────────────────────────────────────────────
// The chat spine is IMPLIED: thread + input + streaming are always emitted and
// wired; the construct declares deviations and additions only. Seams below are
// where later tasks splice capability code; each is a pure string join, so the
// determinism test keeps holding.

function emitApp(c: Construct): string {
  const accent = c.theme?.accent;
  const rootStyle = [
    `height: '100%'`, `display: 'flex'`, `'flex-direction': 'column'`,
    ...(accent ? [`'--kai-color-primary': '${accent}'`] : []),
  ].join(', ');
  return `import { For, Show } from 'solid-js';
import {
  ChatContainer,
  ChatContainerContent,
  ChatContainerScrollAnchor,
  Dock,
  Message,
  MessageContent,
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
  ScrollButton,
  createKaiChat,
} from '@kitn.ai/ui/solid';
import type { MessagePart } from '@kitn.ai/ui/solid';
${emitProviderImports(c)}

${emitProviderSetup(c)}

function Thread() {
  return (
    <div style={{ ${rootStyle} }}>
      <ChatContainer style={{ flex: '1 1 auto', 'min-height': '0' }}>
        <ChatContainerContent>
          <For each={chat.messages()}>
            {(message) => (
              <Message>
                <For each={message.parts}>
                  {(part) => (
                    <Show when={part.type === 'text' ? part : false}>
                      {(text) => <MessageContent markdown={message.role === 'assistant'}>{text().text}</MessageContent>}
                    </Show>
                  )}
                </For>
              </Message>
            )}
          </For>
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
        <ScrollButton />
      </ChatContainer>
      <PromptInput onSubmit={submit} loading={chat.loading()}>
        <PromptInputTextarea placeholder="Ask anything" />
        <PromptInputActions />
      </PromptInput>
    </div>
  );
}

export function App() {
  return (
${emitLayoutOpen(c)}      <Thread />
${emitLayoutClose(c)}  );
}
`;
}

function emitProviderImports(c: Construct): string {
  // Grows in Task 7 (endpoint). Mock: state responder + the shared wire reader.
  return `import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';`;
}

function emitProviderSetup(c: Construct): string {
  return `// Provider seam: mock — keyless, streams locally, announces itself once.
// Swap for provider.mode "endpoint" in the construct and re-run kai dev; the
// generated fetch keeps this exact shape (the seam is the point).
const respond = createMockResponder();
const chat = createKaiChat({
  onSubmit: async ({ value }) => {
    const stream = chat.streamAssistant();
    await readOpenAIStream(respond(value), stream);
    stream.done();
  },
});
const submit = (detail: { value: string }) => chat.handleSubmit(
  new CustomEvent('kai-submit', { detail: { value: detail.value, attachments: [] } }),
);`;
}

function emitLayoutOpen(c: Construct): string {
  // Widget: the kit's Dock (launcher + panel + focus contract). More layouts in Task 12.
  return `    <Dock label="${c.name}">\n`;
}

function emitLayoutClose(c: Construct): string {
  return `    </Dock>\n`;
}

// ── writing ──────────────────────────────────────────────────────────────────

const MANIFEST = '.kai-manifest.json';

/** Write files; prune anything the PREVIOUS generation wrote that this one didn't. */
export function writeProject(files: GeneratedFile[], dir: string): void {
  const manifestPath = join(dir, MANIFEST);
  const previous: string[] = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as string[])
    : [];
  const current = new Set(files.map((f) => f.path));
  for (const stale of previous) {
    if (!current.has(stale)) rmSync(join(dir, stale), { force: true });
  }
  for (const f of files) {
    const abs = join(dir, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.code);
  }
  writeFileSync(manifestPath, `${JSON.stringify([...current].sort(), null, 2)}\n`);
}
```

Two things to verify against the real kit while implementing (fix the TEMPLATE, keep the tests):
1. `PromptInput`'s actual submit prop names — open `src/components/prompt-input.tsx` and use its real API (`onSubmit`/`loading` or whatever it exports). If `createKaiChat.handleSubmit` already covers plain-Solid submit without the CustomEvent shim, drop the `submit` wrapper and pass `chat.handleSubmit` directly.
2. `Message`/`MessageContent` prop names (`markdown`?) — open `src/components/message.tsx`. The plan pins the COMPOSITION and the seams; exact prop spellings come from the source, and Task 15's `tsc --strict` gate is what makes a wrong spelling impossible to ship.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/codegen.test.ts`
Expected: PASS (7 tests).

Add one `writeProject` test in the same file (temp dir via `fs.mkdtempSync(join(tmpdir(), 'kai-construct-'))`): write project A, then write project B missing one file, assert the missing file was pruned and `.kai-manifest.json` lists exactly B's paths. Watch it fail first if you write it before `writeProject` exists.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @kitn.ai/ui exec tsc --noEmit -p tsconfig.mcp.json`

```bash
git add packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts
git commit -m "feat(construct): codegen core — widget layout, mock provider, theme, deterministic project emit"
```

---

### Task 4: CLI — bin dispatcher, `kai validate`, `kai eject`

**Files:**
- Create: `packages/ui/src/agent-tooling/construct/cli.ts`
- Create: `packages/ui/src/agent-tooling/construct/cli-entry.ts`
- Create: `packages/ui/vite.config.construct-cli.ts`
- Modify: `packages/ui/bin/mcp.js` (dispatcher)
- Modify: `packages/ui/package.json` (`build` script += construct-cli bundle)
- Test: `packages/ui/src/agent-tooling/construct/cli.test.ts`

**Interfaces:**
- Consumes: `validateConstruct` (Task 1), `generateProject`/`writeProject` (Task 3).
- Produces: `export async function runCli(argv: string[], io?: { log: (s: string) => void; error: (s: string) => void }): Promise<number>` — argv is post-node/post-bin (`['validate', 'path.json']`). Subcommands this task: `validate <construct.json>`, `eject <construct.json> <outDir>`. Tasks 5–6 add `dev` and `compile` as new `case`s in the same switch.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/construct/cli.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './cli';

const good = { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } };

function tmpConstruct(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'kai-cli-'));
  const p = join(dir, 'app.construct.json');
  writeFileSync(p, JSON.stringify(body, null, 2));
  return p;
}

function collect() {
  const lines: string[] = [];
  return { io: { log: (s: string) => lines.push(s), error: (s: string) => lines.push(s) }, lines };
}

describe('kai CLI', () => {
  it('validate: exit 0 and says valid for a good construct', async () => {
    const { io, lines } = collect();
    expect(await runCli(['validate', tmpConstruct(good)], io)).toBe(0);
    expect(lines.join('\n')).toMatch(/valid/i);
  });

  it('validate: exit 1 with each problem PATH and reason for a bad one', async () => {
    const { io, lines } = collect();
    const code = await runCli(['validate', tmpConstruct({ ...good, layout: 'popup' })], io);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('layout');
  });

  it('validate: unparseable JSON is a loud, pathed failure — not a stack trace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-cli-'));
    const p = join(dir, 'broken.json');
    writeFileSync(p, '{ not json');
    const { io, lines } = collect();
    expect(await runCli(['validate', p], io)).toBe(1);
    expect(lines.join('\n')).toContain(p);
  });

  it('eject: writes the generated project and names the dir', async () => {
    const out = mkdtempSync(join(tmpdir(), 'kai-eject-'));
    const { io } = collect();
    expect(await runCli(['eject', tmpConstruct(good), out], io)).toBe(0);
    expect(existsSync(join(out, 'src/App.tsx'))).toBe(true);
    expect(readFileSync(join(out, 'package.json'), 'utf8')).toContain('"acme-support"');
  });

  it('unknown subcommand: exit 2 with usage', async () => {
    const { io, lines } = collect();
    expect(await runCli(['frobnicate'], io)).toBe(2);
    expect(lines.join('\n')).toMatch(/usage/i);
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/cli.test.ts`
Expected: FAIL — `Cannot find module './cli'`.

- [ ] **Step 3: Implement**

```ts
// packages/ui/src/agent-tooling/construct/cli.ts
/**
 * The kai construct CLI: validate | eject | dev | compile.
 * Launched by bin/mcp.js (the package's one bin) via dist/construct-cli.es.js.
 * Every subcommand goes through validateConstruct first — a validation failure
 * never reaches codegen; the problems print with paths and the exit code says so.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateConstruct, type Construct } from './schema';
import { generateProject, writeProject } from './codegen';

export interface CliIo {
  log: (s: string) => void;
  error: (s: string) => void;
}

const defaultIo: CliIo = { log: (s) => console.log(s), error: (s) => console.error(s) };

const USAGE = `usage: kai <command>

  kai validate <construct.json>          check a construct, print problems with paths
  kai eject <construct.json> <outDir>    write the generated Solid project (it's yours)
  kai dev <construct.json>               live preview with reload-on-edit (Task 5)
  kai compile <construct.json> [outDir]  one self-registering .js (Task 6)
`;

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

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'validate': {
      const construct = loadConstruct(rest[0] ?? '', io);
      if (!construct) return 1;
      io.log(`valid construct: <${construct.name}> (layout: ${construct.layout}, provider: ${construct.provider.mode})`);
      return 0;
    }
    case 'eject': {
      const [path, outDir] = rest;
      const construct = path && outDir ? loadConstruct(path, io) : null;
      if (!construct || !outDir) {
        if (construct === null && path) return 1;
        io.error(USAGE);
        return 2;
      }
      writeProject(generateProject(construct), resolve(outDir));
      io.log(`ejected <${construct.name}> to ${resolve(outDir)} — npm install && npm run dev. The source is yours.`);
      return 0;
    }
    default:
      io.error(USAGE);
      return 2;
  }
}
```

```ts
// packages/ui/src/agent-tooling/construct/cli-entry.ts
/** Build entry for dist/construct-cli.es.js (vite.config.construct-cli.ts).
 *  bin/mcp.js imports this with the subcommand argv; process handling stays in
 *  the bin (this file stays free of exit calls, same split as mcp/stdio.ts). */
import { runCli } from './cli';

runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
```

```ts
// packages/ui/vite.config.construct-cli.ts
import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// Sibling of vite.config.mcp.ts (read its header): SSR/Node build, dist kept,
// zod external, Node builtins external. vite + vite-plugin-solid are NOT
// bundled — kai dev/compile run them inside the GENERATED project via npm
// scripts, so this bundle never imports them.
const external = ['zod', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    emptyOutDir: false,
    ssr: 'src/agent-tooling/construct/cli-entry.ts',
    target: 'node18',
    rollupOptions: { external, output: { entryFileNames: 'construct-cli.es.js' } },
  },
});
```

`packages/ui/bin/mcp.js` — replace the trailing import with a dispatcher (keep the existing header comment, `fatal`, and process handlers exactly as they are):

```js
// Subcommand dispatch. `npx @kitn.ai/ui <cmd>`: `mcp` (or nothing) starts the
// MCP server — the historical behavior, unchanged. dev/compile/eject/validate
// load the construct CLI. Both are dist ESM emits resolved against this file's
// own URL, so the bin works however it was invoked (npx, global, symlink).
const [, , command] = process.argv;
const CONSTRUCT_COMMANDS = ['dev', 'compile', 'eject', 'validate'];
const entry = CONSTRUCT_COMMANDS.includes(command)
  ? fileURLToPath(new URL('../dist/construct-cli.es.js', import.meta.url))
  : fileURLToPath(new URL('../dist/mcp.es.js', import.meta.url));
import(entry).catch(fatal);
```

Note `construct-cli.es.js` reads `process.argv.slice(2)` itself, so the subcommand passes through untouched. `package.json` `build` script: append `&& vite build --config vite.config.construct-cli.ts` right after the `vite.config.mcp.ts` segment.

- [ ] **Step 4: Run the tests, then the real bin**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/cli.test.ts`
Expected: PASS.
Then: `nx build ui --skip-nx-cache` and from `packages/ui`:
`node bin/mcp.js validate src/agent-tooling/construct/fixtures/demo-widget.construct.json` — create that fixture now (it is Task 5's demo star):

```json
{
  "$schema": "https://ui.kitn.ai/schemas/construct/v1.json",
  "name": "demo-widget",
  "layout": "widget",
  "provider": { "mode": "mock" },
  "theme": { "accent": "#e91e63", "mode": "system" }
}
```

Expected output: `valid construct: <demo-widget> (layout: widget, provider: mock)`, exit 0. Also confirm `node bin/mcp.js` with no args still starts the MCP server (Ctrl-C out).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/cli.ts packages/ui/src/agent-tooling/construct/cli-entry.ts packages/ui/src/agent-tooling/construct/cli.test.ts packages/ui/vite.config.construct-cli.ts packages/ui/bin/mcp.js packages/ui/package.json packages/ui/src/agent-tooling/construct/fixtures/demo-widget.construct.json
git commit -m "feat(construct): kai CLI — bin dispatcher, validate + eject subcommands"
```

---

### Task 5: `kai dev` — live preview with regen-on-edit — **THE DEMO CHECKPOINT**

**Files:**
- Create: `packages/ui/src/agent-tooling/construct/dev.ts`
- Modify: `packages/ui/src/agent-tooling/construct/cli.ts` (add the `dev` case)
- Modify: repo root `.gitignore` (add `.kai/`)
- Test: `packages/ui/src/agent-tooling/construct/dev.test.ts`

**Interfaces:**
- Consumes: `loadConstruct` (Task 4), `generateProject`/`writeProject` (Task 3), `validateConstruct` (Task 1).
- Produces:
  - `export function workDirFor(name: string, root: string): string` → `join(root, '.kai', name)`
  - `export function installKey(files: GeneratedFile[]): string` — sha256 of the emitted `package.json` code; install runs only when it changes.
  - `export async function dev(constructPath: string, opts?: { io?: CliIo; uiSpec?: string }): Promise<never>` — validate → codegen → `writeProject` into the workdir → `npm install` (skipped when `installKey` matches the recorded one in `.kai-install-key`) → spawn `npm run dev` (Vite, inherits stdio so the URL prints) → `fs.watch` the construct file; on every change: re-validate; on failure print the problems and DO NOT write (the last good preview keeps running); on success re-run codegen + `writeProject` — Vite's own HMR picks up the rewritten source files, no extra plumbing.

- [ ] **Step 1: Write the failing test** (the pure parts; the spawn is exercised by hand in step 4)

```ts
// packages/ui/src/agent-tooling/construct/dev.test.ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { workDirFor, installKey, regenerate } from './dev';
import { generateProject, type GeneratedFile } from './codegen';
import { validateConstruct } from './schema';

const construct = (name: string) => {
  const out = validateConstruct({ name, layout: 'widget', provider: { mode: 'mock' } });
  if (!out.ok) throw new Error('fixture invalid');
  return out.construct;
};

describe('kai dev internals', () => {
  it('workdir is .kai/<name> under the given root', () => {
    expect(workDirFor('demo-widget', '/repo')).toBe(join('/repo', '.kai', 'demo-widget'));
  });

  it('installKey changes only when the emitted package.json changes', () => {
    const a = generateProject(construct('demo-widget'));
    const b = generateProject(construct('demo-widget'));
    expect(installKey(a)).toBe(installKey(b));
    const c: GeneratedFile[] = a.map((f) =>
      f.path === 'package.json' ? { ...f, code: f.code.replace('"vite": "^6.0.0"', '"vite": "^7.0.0"') } : f,
    );
    expect(installKey(c)).not.toBe(installKey(a));
  });

  it('regenerate refuses an invalid construct and reports problems without writing', () => {
    const written: string[] = [];
    const out = regenerate(
      { name: 'demo-widget', layout: 'sidebar', provider: { mode: 'mock' } },
      { write: (files, dir) => written.push(dir) },
      '/tmp/nowhere',
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'layout')).toBe(true);
    expect(written).toEqual([]);
  });

  it('regenerate writes on a valid construct', () => {
    const written: string[] = [];
    const out = regenerate(
      { name: 'demo-widget', layout: 'widget', provider: { mode: 'mock' } },
      { write: (files, dir) => written.push(dir) },
      '/tmp/somewhere',
    );
    expect(out.ok).toBe(true);
    expect(written).toEqual(['/tmp/somewhere']);
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/dev.test.ts`
Expected: FAIL — `Cannot find module './dev'`.

- [ ] **Step 3: Implement `dev.ts`**

```ts
// packages/ui/src/agent-tooling/construct/dev.ts
/**
 * kai dev — validate → codegen → npm install (once per dependency change) →
 * vite dev inside the generated project → watch the construct file.
 *
 * HMR comes free: on every construct edit we re-run the SAME generateProject
 * and rewrite the source files in place; the running Vite server sees changed
 * modules and hot-updates the open tab. A validation failure never touches the
 * generated files — the reasons print and the LAST GOOD preview keeps running.
 * Mock-first and keyless by default.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateProject, writeProject, type GeneratedFile, type GenerateOptions } from './codegen';
import { validateConstruct, type ConstructProblem } from './schema';
import type { CliIo } from './cli';

export function workDirFor(name: string, root: string): string {
  return join(root, '.kai', name);
}

export function installKey(files: GeneratedFile[]): string {
  const pkg = files.find((f) => f.path === 'package.json');
  return createHash('sha256').update(pkg?.code ?? '').digest('hex');
}

export type RegenOutcome = { ok: true; files: GeneratedFile[] } | { ok: false; problems: ConstructProblem[] };

/** One regen turn, injectable writer so the watch loop is testable. */
export function regenerate(
  raw: unknown,
  sink: { write: (files: GeneratedFile[], dir: string) => void },
  dir: string,
  opts: GenerateOptions = {},
): RegenOutcome {
  const validated = validateConstruct(raw);
  if (!validated.ok) return validated;
  const files = generateProject(validated.construct, opts);
  sink.write(files, dir);
  return { ok: true, files };
}

const KEY_FILE = '.kai-install-key';

export async function dev(
  constructPath: string,
  opts: { io?: CliIo; uiSpec?: string } = {},
): Promise<never> {
  const io = opts.io ?? { log: (s: string) => console.log(s), error: (s: string) => console.error(s) };
  const abs = resolve(constructPath);
  const readRaw = (): unknown => JSON.parse(readFileSync(abs, 'utf8'));

  const first = validateConstruct(readRaw());
  if (!first.ok) {
    for (const p of first.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
    process.exit(1);
  }
  const dir = workDirFor(first.construct.name, process.cwd());
  const files = generateProject(first.construct, { uiSpec: opts.uiSpec });
  writeProject(files, dir);

  const key = installKey(files);
  const keyPath = join(dir, KEY_FILE);
  const installed = existsSync(keyPath) && readFileSync(keyPath, 'utf8') === key;
  if (!installed) {
    io.log(`installing dependencies in ${dir} (first run or deps changed)…`);
    await new Promise<void>((done, fail) => {
      const child = spawn('npm', ['install'], { cwd: dir, stdio: 'inherit' });
      child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`npm install exited ${code}`))));
    });
    writeFileSync(keyPath, key);
  }

  watch(abs, () => {
    let raw: unknown;
    try {
      raw = readRaw();
    } catch (err) {
      io.error(`construct is not valid JSON (${err instanceof Error ? err.message : err}) — last good preview stays up`);
      return;
    }
    const out = regenerate(raw, { write: writeProject }, dir, { uiSpec: opts.uiSpec });
    if (!out.ok) {
      io.error('construct rejected — last good preview stays up:');
      for (const p of out.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
      return;
    }
    io.log('construct changed — regenerated; Vite will hot-update the tab.');
  });

  io.log(`previewing <${first.construct.name}> — edit ${abs} and watch the tab.`);
  const vite = spawn('npm', ['run', 'dev'], { cwd: dir, stdio: 'inherit' });
  return new Promise<never>((_, rejectP) => {
    vite.on('exit', (code) => {
      rejectP(new Error(`vite dev exited ${code}`));
      process.exit(code ?? 0);
    });
  });
}
```

Add to `cli.ts`'s switch (before `default`), plus a `--ui <spec>` flag parse for the gates:

```ts
    case 'dev': {
      // NB: guard the -1 case — `i !== uiFlag + 1` with uiFlag === -1 would drop index 0.
      const uiFlag = rest.indexOf('--ui');
      const uiSpec = uiFlag >= 0 ? rest[uiFlag + 1] : undefined;
      const positional = uiFlag >= 0 ? rest.filter((_, i) => i !== uiFlag && i !== uiFlag + 1) : rest;
      const path = positional[0];
      if (!path) {
        io.error(USAGE);
        return 2;
      }
      const { dev } = await import('./dev');
      await dev(path, { io, uiSpec });
      return 0; // unreachable; dev() never resolves
    }
```

Append `.kai/` on its own line to the repo root `.gitignore`.

- [ ] **Step 4: Run the unit tests, then the REAL thing**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/dev.test.ts`
Expected: PASS.
Then: `nx build ui --skip-nx-cache`, and from `packages/ui`:
`node bin/mcp.js dev src/agent-tooling/construct/fixtures/demo-widget.construct.json`
Expected: install runs once, Vite prints a localhost URL, the page shows the `<demo-widget>` Dock launcher; open it, send a message, the MOCK streams a reply. Edit the fixture's `"accent"` to `"#2563eb"` and save — the tab hot-updates without a manual reload. Break the fixture (`"layout": "popup"`) — terminal prints `layout: …` and the tab keeps working; fix it back.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/dev.ts packages/ui/src/agent-tooling/construct/dev.test.ts packages/ui/src/agent-tooling/construct/cli.ts .gitignore
git commit -m "feat(construct): kai dev — live preview, regen-on-edit, last-good-stays-up"
```

- [ ] **Step 6: STOP: show the owner.** This is the walking-skeleton checkpoint the spec mandates (show-first rule). Demo exactly the step-4 sequence live: one construct file → `kai dev` → a working widget in a browser → an edit hot-updating it → a rejected edit bouncing off with a reason. Do not proceed to Task 6 until the owner has seen it.

---

### Task 6: `kai compile` — one self-registering `.js`

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/cli.ts` (add the `compile` case)
- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts` (emit `dist-types` d.ts alongside)
- Test: `packages/ui/src/agent-tooling/construct/cli.test.ts` (extend)

**Interfaces:**
- Consumes: everything above. `kai compile <construct.json> [outDir] [--ui <spec>]`: validate → codegen into the same `.kai/<name>` workdir (install-if-needed, reusing `installKey`/`KEY_FILE` logic extracted from `dev.ts` into an exported `ensureInstalled(dir: string, files: GeneratedFile[], io: CliIo): Promise<void>` in `dev.ts`) → run `npm run build` in the workdir → copy `dist/<name>.js` plus a generated `<name>.d.ts` to `outDir` (default `./dist-construct`) **with the generated source preserved beside it** (`<outDir>/source/…` = the eject artifact — preview and artifact cannot differ because both came from the one `generateProject` call).
- Produces: `codegen.ts` gains `export function emitTypes(construct: Construct): string`:

```ts
export function emitTypes(c: Construct): string {
  return `declare global {
  interface HTMLElementTagNameMap {
    '${c.name}': HTMLElement & { theme: 'light' | 'dark' | 'auto' };
  }
}
export {};
`;
}
```

- [ ] **Step 1: Write the failing test** — extend `cli.test.ts`:

```ts
  it('compile: produces one self-registering js + d.ts + the source beside it', async () => {
    const out = mkdtempSync(join(tmpdir(), 'kai-compile-'));
    const { io } = collect();
    const code = await runCli(['compile', tmpConstruct(good), out], io);
    expect(code).toBe(0);
    const js = readFileSync(join(out, 'acme-support.js'), 'utf8');
    expect(js).toContain('acme-support'); // the tag registered by the inlined defineWebComponent
    expect(existsSync(join(out, 'acme-support.d.ts'))).toBe(true);
    expect(existsSync(join(out, 'source', 'src', 'App.tsx'))).toBe(true);
  }, 240_000);
```

Mark it with vitest's per-test timeout as shown (a real `npm install` + `vite build` runs). If CI time proves painful, move this single test behind `it.skipIf(!!process.env.CI)` and rely on Task 15's gate, which compiles every fixture anyway — note the decision in the test's comment.

- [ ] **Step 2: Run it, watch it fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/cli.test.ts`
Expected: the new test FAILS (`compile` hits the `default:` usage branch, exit 2).

- [ ] **Step 3: Implement** — in `cli.ts`:

```ts
    case 'compile': {
      // Same -1 guard as the dev case; extract a shared parseUiFlag(rest) helper in cli.ts.
      const uiFlag = rest.indexOf('--ui');
      const uiSpec = uiFlag >= 0 ? rest[uiFlag + 1] : undefined;
      const positional = uiFlag >= 0 ? rest.filter((_, i) => i !== uiFlag && i !== uiFlag + 1) : rest;
      const [path, outArg] = positional;
      const construct = path ? loadConstruct(path, io) : null;
      if (!construct) return path ? 1 : (io.error(USAGE), 2);
      const outDir = resolve(outArg ?? 'dist-construct');
      const { workDirFor, ensureInstalled } = await import('./dev');
      const dir = workDirFor(construct.name, process.cwd());
      const files = generateProject(construct, { uiSpec });
      writeProject(files, dir);
      await ensureInstalled(dir, files, io);
      await new Promise<void>((done, fail) => {
        const child = spawn('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
        child.on('exit', (c) => (c === 0 ? done() : fail(new Error(`vite build exited ${c}`))));
      });
      mkdirSync(outDir, { recursive: true });
      copyFileSync(join(dir, 'dist', `${construct.name}.js`), join(outDir, `${construct.name}.js`));
      writeFileSync(join(outDir, `${construct.name}.d.ts`), emitTypes(construct));
      writeProject(files, join(outDir, 'source'));
      io.log(`compiled <${construct.name}> → ${outDir}/${construct.name}.js (source beside it in source/).`);
      io.log(`endpoint backends: the kai MCP scaffold tool emits a matching route — see its output for your framework.`);
      return 0;
    }
```

(Add the `node:child_process` / `node:fs` imports `spawn`, `mkdirSync`, `copyFileSync`, `writeFileSync`, `join` to `cli.ts`; extract `ensureInstalled` out of `dev()` into an export and call it from both places — one install path, not two.)

- [ ] **Step 4: Run the tests + a hand check**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/cli.test.ts` — PASS.
Hand check after `nx build ui --skip-nx-cache`, from `packages/ui`:
`node bin/mcp.js compile src/agent-tooling/construct/fixtures/demo-widget.construct.json /tmp/demo-out`
then serve a scratch HTML that does `<script type="module" src="/tmp/demo-out/demo-widget.js"></script><demo-widget></demo-widget>` (e.g. `python3 -m http.server`) and confirm the widget mounts with NOTHING else installed — that is the "consumer installs nothing but the output" constraint, observed.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/cli.ts packages/ui/src/agent-tooling/construct/cli.test.ts packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/dev.ts
git commit -m "feat(construct): kai compile — single self-registering output with source beside it"
```

---

### Task 7: Endpoint provider — the state/wire seam for both wires

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts` (`emitProviderImports` + `emitProviderSetup`)
- Test: `packages/ui/src/agent-tooling/construct/codegen.test.ts` (extend)

**Interfaces:** none new. The construct's `provider: { mode: 'endpoint', url, wire }` now changes the emitted glue.

- [ ] **Step 1: Failing tests** — append to `codegen.test.ts`:

```ts
describe('endpoint provider', () => {
  const endpoint = (wire: 'openai' | 'anthropic') =>
    construct({ provider: { mode: 'endpoint', url: '/api/chat', wire } });

  it('openai wire: fetch to the declared URL, readOpenAIStream + toOpenAIMessages', () => {
    const app = file(generateProject(endpoint('openai')), 'src/App.tsx');
    expect(app).toContain("fetch('/api/chat'");
    expect(app).toContain('readOpenAIStream(');
    expect(app).toContain('toOpenAIMessages(');
    expect(app).not.toContain('createMockResponder');
  });

  it('anthropic wire: the anthropic reader/encoder pair', () => {
    const app = file(generateProject(endpoint('anthropic')), 'src/App.tsx');
    expect(app).toContain('readAnthropicStream(');
    expect(app).toContain('toAnthropicMessages(');
  });

  it('no hand-rolled SSE and no key material, ever', () => {
    for (const wire of ['openai', 'anthropic'] as const) {
      const app = file(generateProject(endpoint(wire)), 'src/App.tsx');
      expect(app).not.toMatch(/text\/event-stream|EventSource|api[_-]?key|Authorization/i);
    }
  });
});
```

- [ ] **Step 2: Watch them fail** — `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/codegen.test.ts` → the three new tests FAIL (mock glue emitted for endpoint constructs).

- [ ] **Step 3: Implement** — replace the two emit functions:

```ts
function emitProviderImports(c: Construct): string {
  if (c.provider.mode === 'mock') {
    return `import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';`;
  }
  const read = c.provider.wire === 'openai' ? 'readOpenAIStream' : 'readAnthropicStream';
  const encode = c.provider.wire === 'openai' ? 'toOpenAIMessages' : 'toAnthropicMessages';
  return `import { createAssistantStream } from '@kitn.ai/ui/state';
import { ${read}, ${encode} } from '@kitn.ai/ui/wire';`;
}

function emitProviderSetup(c: Construct): string {
  if (c.provider.mode === 'mock') {
    return `// Provider seam: mock — keyless, streams locally, announces itself once.
const respond = createMockResponder();
const chat = createKaiChat({
  onSubmit: async ({ value }) => {
    const stream = chat.streamAssistant();
    await readOpenAIStream(respond(value), stream);
    stream.done();
  },
});
${SUBMIT_SHIM}`;
  }
  const { url, wire } = c.provider;
  const read = wire === 'openai' ? 'readOpenAIStream' : 'readAnthropicStream';
  const encode = wire === 'openai' ? 'toOpenAIMessages' : 'toAnthropicMessages';
  return `// Provider seam: YOUR endpoint at ${url} (${wire} wire). The kit PARSES,
// this component FETCHES — no key, no provider SDK, no client in here. Your
// route holds the key and re-frames to the provider; the kai MCP scaffold tool
// emits one for your framework.
const chat = createKaiChat({
  onSubmit: async () => {
    const stream = chat.streamAssistant();
    const response = await fetch('${url}', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: ${encode}(chat.messages()) }),
    });
    await ${read}(response, stream);
    stream.done();
  },
});
${SUBMIT_SHIM}`;
}

// The submit shim the Thread template calls — shared by BOTH provider branches
// (Task 3 inlined it in the mock emit; hoist it to this module constant now so
// the two branches cannot drift):
const SUBMIT_SHIM = `const submit = (detail: { value: string }) => chat.handleSubmit(
  new CustomEvent('kai-submit', { detail: { value: detail.value, attachments: [] } }),
);`;
```

(Hoisting means Task 3's mock template loses its inline copy — one definition. Task 9 later rewrites the shim's `attachments: []` to `attachments: pending()` when the capability is on; do that inside `SUBMIT_SHIM` by making it a function of the construct, `submitShim(c)`, at that point.)

While implementing, confirm `readOpenAIStream`'s `StreamSource` accepts a `Response` (see `src/wire/read.ts` — the catalog scaffolds pass fetch responses; if the accepted source is `response.body`, emit that instead, in BOTH branches of the template and in the mock example nothing changes).

- [ ] **Step 4: Green** — same vitest command, all codegen tests PASS. Hand check: point `demo-widget.construct.json` at `{ "mode": "endpoint", "url": "/api/chat", "wire": "openai" }` under a running `kai dev`, confirm regen prints and the submit now POSTs (network tab shows `/api/chat`, which 404s — correct: the consumer owns the route). Revert the fixture to mock.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts
git commit -m "feat(construct): endpoint provider glue — openai + anthropic wires via @kitn.ai/ui/wire"
```

---

### Task 8: Capability — `starters`

Simplest capability first; it establishes the `capabilities` object every later capability extends.

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/schema.ts` — add to `ConstructSchema`:

```ts
    capabilities: z
      .object({
        starters: z.array(z.string().min(1)).min(1).max(6).optional(),
      })
      .strict()
      .optional(),
```

- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts` (`emitApp` seam + provider setup)
- Test: extend both test files.

- [ ] **Step 1: Failing tests**

`schema.test.ts`:

```ts
  it('accepts starters and rejects an empty list', () => {
    expect(validateConstruct({ ...minimal, capabilities: { starters: ["Where's my order?"] } }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, capabilities: { starters: [] } }).ok).toBe(false);
  });
```

`codegen.test.ts`:

```ts
  it('starters render as PromptSuggestion chips that submit on click', () => {
    const app = file(
      generateProject(construct({ capabilities: { starters: ['Track my order', 'Request a refund'] } })),
      'src/App.tsx',
    );
    expect(app).toContain('PromptSuggestion');
    expect(app).toContain("'Track my order'");
    expect(app).toContain("'Request a refund'");
  });

  it('no starters, no suggestion code (spine declares deviations only)', () => {
    expect(file(generateProject(construct()), 'src/App.tsx')).not.toContain('PromptSuggestion');
  });
```

- [ ] **Step 2: Watch them fail** — run both files' vitest commands; the new tests fail (unknown key `capabilities` / missing emit).

- [ ] **Step 3: Implement.** Schema addition as above. In `emitApp`, add `PromptSuggestion` to the import list only when starters exist, seed `createKaiChat` with `initialSuggestions`, and render the chips between the thread and the input (shown only while the thread is empty — the kit's convention):

```ts
// inside emitApp, computed before the template:
const starters = c.capabilities?.starters ?? [];
const startersInit = starters.length
  ? `\n  initialSuggestions: [${starters.map((s) => `'${s.replace(/'/g, "\\'")}'`).join(', ')}],`
  : '';
// emitted between </ChatContainer> and <PromptInput …> when starters exist:
const startersJsx = starters.length
  ? `      <Show when={chat.messages().length === 0}>
        <div style={{ display: 'flex', gap: '0.5rem', 'flex-wrap': 'wrap', padding: '0.5rem' }}>
          <For each={chat.suggestions()}>
            {(s) => <PromptSuggestion onClick={() => submit({ value: s })}>{s}</PromptSuggestion>}
          </For>
        </div>
      </Show>
`
  : '';
```

Thread `startersInit` into every `createKaiChat({ … })` emit in `emitProviderSetup` (pass it as a parameter: `emitProviderSetup(c, startersInit)`), and splice `startersJsx` into the Thread template. Confirm `PromptSuggestion`'s real props in `src/components/prompt-suggestion.tsx` (onClick vs onSelect) and use the real one in the template.

- [ ] **Step 4: Green** — both vitest files PASS. `kai dev` hand check with starters in the fixture: chips render, clicking one sends it, chips leave once the thread has messages.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts
git commit -m "feat(construct): starters capability — suggestion chips on the empty thread"
```

---

### Task 9: Capability — `attachments`

**Files:**
- Modify: `schema.ts` — inside `capabilities`:

```ts
        attachments: z
          .object({
            /** Accept-list of media types/globs, e.g. ["image/*", "application/pdf"]. */
            accept: z.array(z.string().min(1)).min(1),
          })
          .strict()
          .optional(),
```

- Modify: `codegen.ts`
- Test: extend both test files.

- [ ] **Step 1: Failing tests**

`schema.test.ts`:

```ts
  it('attachments require a non-empty accept list (WHETHER stays with the author)', () => {
    expect(
      validateConstruct({ ...minimal, capabilities: { attachments: { accept: ['image/*'] } } }).ok,
    ).toBe(true);
    expect(validateConstruct({ ...minimal, capabilities: { attachments: {} } }).ok).toBe(false);
  });
```

`codegen.test.ts`:

```ts
  it('attachments: file input with the accept list, FileReader data URLs, file parts rendered', () => {
    const app = file(
      generateProject(construct({ capabilities: { attachments: { accept: ['image/*', 'application/pdf'] } } })),
      'src/App.tsx',
    );
    expect(app).toContain('accept="image/*,application/pdf"');
    expect(app).toContain('readAsDataURL'); // NEVER URL.createObjectURL (wire refuses blob:)
    expect(app).not.toContain('createObjectURL');
    expect(app).toContain("part.type === 'file'");
    expect(app).toContain('Attachments');
  });
```

- [ ] **Step 2: Watch them fail**, same commands.

- [ ] **Step 3: Implement.** Emitted additions when the capability is present (splice into `emitApp` via the same computed-block pattern as starters):
  - Import `Attachment, Attachments` and `type AttachmentData` from `@kitn.ai/ui/solid`.
  - A `pending` attachments signal + hidden `<input type="file" multiple accept="…">` + a paperclip `Button` inside `PromptInputActions` that clicks it.
  - A pick handler reading each file with `FileReader.readAsDataURL` (the `AttachmentData.url` doc in `src/components/attachment-types.ts` is binding: `data:` URIs, never object URLs):

```tsx
const [pending, setPending] = createSignal<AttachmentData[]>([]);
const pick = (input: HTMLInputElement) => {
  for (const f of input.files ?? []) {
    const reader = new FileReader();
    reader.onload = () =>
      setPending((prev) => [
        ...prev,
        { id: crypto.randomUUID(), type: 'file', filename: f.name, mediaType: f.type, url: String(reader.result) },
      ]);
    reader.readAsDataURL(f);
  }
  input.value = '';
};
```

  - Submit passes `attachments: pending()` in the `kai-submit` detail and clears `pending`. (The user message then carries `{ type: 'file', attachment }` parts — `createKaiChat.handleSubmit` owns that fold; verify in `src/primitives/create-kai-chat.ts` and, if it does not fold attachments into parts, emit the fold explicitly at the submit site.)
  - Thread rendering gains a file-part branch: consecutive `file` parts render as one `<Attachments>` row of `<Attachment attachment={…} />` (lift the run-grouping shape from the solid scaffold's `runAt` — emit the same helper).
  - `solid-js` import in the template gains `createSignal` only when attachments are on (the `noUnusedLocals` rule in the generated tsconfig makes an unconditional import a compile failure — exactly what Task 15's gate exists to catch).

- [ ] **Step 4: Green** — both files PASS. `kai dev` hand check: attach an image, send, the user bubble shows the attachment row; mock replies.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts
git commit -m "feat(construct): attachments capability — accept list, data-URL staging, file-part rows"
```

---

### Task 10: Capability — `history`

**Files:**
- Modify: `schema.ts` — inside `capabilities`:

```ts
        history: z
          .object({
            persistence: z.enum(['none', 'local', 'endpoint']),
            /** endpoint persistence only: the CONSUMER's thread routes (GET returns
             *  ChatMessage[], PUT stores them). Refined below. */
            url: z.string().min(1).optional(),
          })
          .strict()
          .optional(),
```

  plus a `.superRefine` on `ConstructSchema` (or on the history object): `persistence: 'endpoint'` requires `url`; `url` without `endpoint` is rejected. Both directions loud.
- Modify: `codegen.ts`
- Test: extend both test files.

- [ ] **Step 1: Failing tests**

`schema.test.ts`:

```ts
  it('history: endpoint persistence requires a url, and url requires endpoint', () => {
    const cap = (history: unknown) => validateConstruct({ ...minimal, capabilities: { history } });
    expect(cap({ persistence: 'local' }).ok).toBe(true);
    expect(cap({ persistence: 'endpoint', url: '/api/thread' }).ok).toBe(true);
    expect(cap({ persistence: 'endpoint' }).ok).toBe(false);
    expect(cap({ persistence: 'local', url: '/api/thread' }).ok).toBe(false);
  });
```

`codegen.test.ts`:

```ts
  it('history local: load-on-mount + persist-on-change via localStorage, keyed by tag', () => {
    const app = file(
      generateProject(construct({ capabilities: { history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain("localStorage");
    expect(app).toContain("'kai:acme-support:thread'");
    expect(app).toContain('createEffect');
  });

  it('history endpoint: GET on mount, PUT on change — consumer owns the server', () => {
    const app = file(
      generateProject(
        construct({ capabilities: { history: { persistence: 'endpoint', url: '/api/thread' } } }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain("fetch('/api/thread')");
    expect(app).toContain("method: 'PUT'");
  });

  it("history none / absent: no persistence code at all", () => {
    expect(file(generateProject(construct()), 'src/App.tsx')).not.toContain('localStorage');
  });
```

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement.** Emitted block (spliced after `createKaiChat`, `local` variant; retention/limits deliberately absent — application-layer decisions, say so in the emitted comment):

```tsx
// History: persisted locally in this browser, keyed by the element tag. What to
// retain and for how long is an app decision — clear the key to reset.
const THREAD_KEY = 'kai:acme-support:thread';
try {
  const saved = localStorage.getItem(THREAD_KEY);
  if (saved) chat.setMessages(() => JSON.parse(saved) as ChatMessage[]);
} catch { /* storage unavailable: run in-memory */ }
createEffect(() => {
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify(chat.messages()));
  } catch { /* storage unavailable: run in-memory */ }
});
```

`endpoint` variant: `fetch(url)` on mount (`.then((r) => r.ok ? r.json() : [])` into `setMessages`), `createEffect` doing a fire-and-forget `fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chat.messages()) })` guarded so the mount-load does not immediately PUT back what it loaded (an `hydrated` boolean flipped after load). Imports: add `createEffect` to the `solid-js` import and `ChatMessage` to the type import only when history is on.

- [ ] **Step 4: Green** — both files PASS. `kai dev` hand check with `local`: chat, reload the tab, the thread is still there.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts
git commit -m "feat(construct): history capability — none | local | endpoint"
```

---

### Task 11: Cards — registration + tool projection reuse

**Files:**
- Modify: `schema.ts` — top-level:

```ts
    cards: z
      .array(
        z
          .object({
            /** Tool-facing card name, e.g. "refund_approval". */
            name: z.string().regex(/^[a-z][a-z0-9_]*$/),
            /** The kit's card schema JSON (incl. x-kai-format mask hints).
             *  Validated structurally here; deep card validation is the kit's
             *  own card contract at render time. */
            schema: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1)
      .optional(),
```

- Modify: `codegen.ts`
- Test: extend both test files.

**Interfaces:** the emitted code reuses the rung-5 card-tool projection — `cardTools` / `toOpenAITools` / `toAnthropicTools` from `@kitn.ai/ui/schemas` (`src/schemas/tool-defs.ts:668-789`) — never a second projection.

- [ ] **Step 1: Failing tests**

`schema.test.ts`:

```ts
  it('cards: named entries with schema objects; bad tool names rejected', () => {
    const card = { name: 'refund_approval', schema: { type: 'object', properties: {} } };
    expect(validateConstruct({ ...minimal, cards: [card] }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, cards: [{ ...card, name: 'Refund-Approval' }] }).ok).toBe(false);
  });
```

`codegen.test.ts`:

```ts
  it('cards: renders card parts via CardRenderer and projects tools via @kitn.ai/ui/schemas', () => {
    const files = generateProject(
      construct({
        cards: [{ name: 'refund_approval', schema: { type: 'object', properties: { amount: { type: 'number' } } } }],
      }),
    );
    const app = file(files, 'src/App.tsx');
    expect(app).toContain('CardRenderer');
    expect(app).toContain("part.type === 'card'");
    expect(app).toContain("from '@kitn.ai/ui/schemas'"); // reuse, never a second projection
    expect(file(files, 'src/cards.ts')).toContain('refund_approval');
  });

  it('no cards, no card code and no src/cards.ts', () => {
    const files = generateProject(construct());
    expect(files.some((f) => f.path === 'src/cards.ts')).toBe(false);
    expect(file(files, 'src/App.tsx')).not.toContain('CardRenderer');
  });
```

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement.** When `cards` present, `generateProject` adds `src/cards.ts`:

```ts
// src/cards.ts — the construct's card registry, verbatim from the construct.
// Tool definitions for YOUR backend derive from this same object via
// @kitn.ai/ui/schemas (cardTools / toOpenAITools / toAnthropicTools) — one
// projection, shared with the kit.
export const cards = {
  refund_approval: { type: 'object', properties: { amount: { type: 'number' } } },
} as const;
```

(Emitted with `JSON.stringify(schema, null, 2)` per entry — deterministic because the construct's own key order is preserved.) `App.tsx` gains: `CardRenderer` in the solid import, `import { cards } from './cards';`, a card-part branch in the part rendering (`<Show when={part.type === 'card' ? part : false}>{(card) => <CardRenderer envelope={card().envelope} />}</Show>` — confirm `CardRenderer`'s real prop name in `src/components/card-renderer.tsx` and use it), and for the MOCK provider a comment noting the responder already emits tool calls so cards demo keylessly. For ENDPOINT constructs, the emitted seam comment names the exact projection call the consumer's route makes: `toOpenAITools(cards)` / `toAnthropicTools(cards)` matching the wire.

Mask hints (`x-kai-format` etc.) need NO engine work: they ride inside `schema` untouched and the kit's form cards honor them — add one masked field to the Task 15 `ops-console` fixture to pin that.

- [ ] **Step 4: Green**, then `kai dev` hand check: with a card in the fixture and mock provider, prompt the mock's tool-call turn and see the card render in the thread.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts
git commit -m "feat(construct): cards — registry emit, CardRenderer wiring, schemas tool-projection reuse"
```

---

### Task 12: Layouts — `fullscreen`, `aside`, `split`

**Files:**
- Modify: `schema.ts`: `layout: z.enum(['widget', 'fullscreen', 'aside', 'split'])`
- Modify: `codegen.ts` (`emitLayoutOpen`/`emitLayoutClose` become a real switch; imports become layout-conditional)
- Test: extend both test files.

- [ ] **Step 1: Failing tests**

`schema.test.ts`:

```ts
  it('layout enum: widget | fullscreen | aside | split', () => {
    for (const layout of ['widget', 'fullscreen', 'aside', 'split']) {
      expect(validateConstruct({ ...minimal, layout }).ok).toBe(true);
    }
    expect(validateConstruct({ ...minimal, layout: 'popup' }).ok).toBe(false);
  });
```

`codegen.test.ts`:

```ts
  it.each([
    ['fullscreen', 'height: \'100dvh\''],
    ['aside', 'border-inline-start'],
    ['split', 'PaneGroup'],
  ] as const)('layout %s emits its chrome', (layout, marker) => {
    const app = file(generateProject(construct({ layout })), 'src/App.tsx');
    expect(app).toContain(marker);
    if (layout !== 'widget') expect(app).not.toContain('<Dock');
  });
```

- [ ] **Step 2: Watch them fail** (schema rejects the new enum values first — widen the enum, watch the codegen tests fail on missing chrome, then implement).

- [ ] **Step 3: Implement** the layout switch:

```ts
function emitLayoutOpen(c: Construct): string {
  switch (c.layout) {
    case 'widget':
      return `    <Dock label="${c.name}">\n`;
    case 'fullscreen':
      return `    <div style={{ height: '100dvh', display: 'flex', 'flex-direction': 'column' }}>\n`;
    case 'aside':
      // A docked side panel: fixed inline-end column, kit border token.
      return `    <aside style={{ position: 'fixed', 'inset-block': '0', 'inset-inline-end': '0', width: '380px', display: 'flex', 'flex-direction': 'column', 'border-inline-start': '1px solid var(--kai-color-border)' }}>\n`;
    case 'split':
      // Two-pane minimum (recorded decision 2): chat start, slots end.
      return `    <PaneGroup style={{ height: '100dvh' }}>\n      <div style={{ flex: '1 1 60%', display: 'flex', 'flex-direction': 'column', 'min-width': '0' }}>\n`;
  }
}

function emitLayoutClose(c: Construct): string {
  switch (c.layout) {
    case 'widget':
      return `    </Dock>\n`;
    case 'fullscreen':
      return `    </div>\n`;
    case 'aside':
      return `    </aside>\n`;
    case 'split':
      return `      </div>\n      <div style={{ flex: '1 1 40%', 'min-width': '0' }}>\n        <slot name="pane" />\n      </div>\n    </PaneGroup>\n`;
  }
}
```

Import `Dock` only for `widget` and `PaneGroup` only for `split` (the generated `noUnusedLocals` enforces it). Check `PaneGroup`'s real children contract in `src/ui/pane-group.tsx` — if it requires `Pane` children or a `panes` prop, compose it that way instead; the pinned decision is TWO panes, chat + slot, not the exact wrapper spelling. `split`'s end pane carries a `<slot name="pane">` even before Task 13's `slots` field: it is the layout's own projection point, documented in the emitted comment. The exhaustive `switch` with no `default` is deliberate: TypeScript makes Task 13's `custom` addition a compile error here, so the new layout cannot be forgotten.

- [ ] **Step 4: Green**, plus `kai dev` eyeballs on each of the three new layouts (edit the fixture's `layout` live — this is the demo the checkpoint earned).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts
git commit -m "feat(construct): fullscreen, aside and split layouts"
```

---

### Task 13: Slots escape hatch + `custom` layout

**Files:**
- Modify: `schema.ts`: `layout` gains `'custom'`; top-level `slots: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).max(8).optional()`; `.superRefine`: `layout: 'custom'` with no `slots` is rejected (`custom` IS the slots grain — say so in the message).
- Modify: `codegen.ts`
- Test: extend both test files.

- [ ] **Step 1: Failing tests**

`schema.test.ts`:

```ts
  it('slots are named, kebab-case; custom layout requires them', () => {
    expect(validateConstruct({ ...minimal, slots: ['header'] }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, slots: ['Header!'] }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, layout: 'custom' }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, layout: 'custom', slots: ['header', 'footer'] }).ok).toBe(true);
  });
```

`codegen.test.ts`:

```ts
  it('declared slots become named <slot> projection points', () => {
    const app = file(generateProject(construct({ slots: ['header'] })), 'src/App.tsx');
    expect(app).toContain('<slot name="header" />');
  });

  it('custom layout: minimal chrome, every slot present, spine intact', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header', 'footer'] })),
      'src/App.tsx',
    );
    expect(app).toContain('<slot name="header" />');
    expect(app).toContain('<slot name="footer" />');
    expect(app).toContain('<PromptInput'); // the spine is implied, never dropped
    expect(app).not.toContain('<Dock');
  });
```

- [ ] **Step 2: Watch them fail.**

- [ ] **Step 3: Implement.** For non-custom layouts, declared slots emit ABOVE the thread inside the layout chrome, in declaration order: `<slot name="header" />`. For `custom`: chrome is a plain full-height flex column; slots split around the spine — first declared slot above the thread, the rest below the input (deterministic rule, documented in the emitted comment: "reorder by ejecting — this is the whole grain dimmer"). Solid compiles `<slot>` untouched in this facade because the shadow root hosts it (`defineWebComponent` renders into the shadow root; light-DOM children of `<acme-support>` project in natively). Extend the layout `switch` for `custom` (the Task 12 exhaustiveness now forces it).

- [ ] **Step 4: Green**, plus a `kai dev` check: put `<h3 slot="header">Hi</h3>` inside the element tag in the generated `index.html`'s copy — better, add slot demo content to `emitIndexHtml` when slots are declared, so the preview shows projection working out of the box.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts
git commit -m "feat(construct): named slots escape hatch + custom layout"
```

---

### Task 14: Schema publication — build:api artifact + drift guard

**Files:**
- Create: `packages/ui/scripts/gen-construct-schema.mjs`
- Modify: `packages/ui/package.json` (`build:api` chain += the generator)
- Modify: `packages/ui/scripts/verify-generated-sync.mjs` (register the two derived files if it tracks an explicit list; if it diffs the whole tree after running `build:api`, no change needed — READ the script first and do what it actually requires)
- Generated: `packages/ui/src/agent-tooling/construct/construct.v1.schema.json`, `apps/docs/public/schemas/construct/v1.json`
- Test: `packages/ui/src/agent-tooling/construct/schema-artifact.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/ui/src/agent-tooling/construct/schema-artifact.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { ConstructSchema } from './schema';

// The checked-in artifact must equal what the Zod source produces RIGHT NOW.
// gen-construct-schema.mjs is the writer; this test is the reader-side pin so
// a schema edit without a regen goes red in the unit suite too, not only in
// verify:generated.
describe('construct.v1.schema.json', () => {
  it('matches z.toJSONSchema(ConstructSchema) exactly', () => {
    const artifact = JSON.parse(
      readFileSync(resolve(__dirname, 'construct.v1.schema.json'), 'utf8'),
    );
    expect(artifact).toEqual({
      $id: 'https://ui.kitn.ai/schemas/construct/v1.json',
      ...(z.toJSONSchema(ConstructSchema) as Record<string, unknown>),
    });
  });

  it('docs-site copy is byte-identical (same artifact, second address)', () => {
    const a = readFileSync(resolve(__dirname, 'construct.v1.schema.json'), 'utf8');
    const b = readFileSync(
      resolve(__dirname, '../../../../../apps/docs/public/schemas/construct/v1.json'),
      'utf8',
    );
    expect(b).toBe(a);
  });
});
```

- [ ] **Step 2: Watch it fail** (no artifact yet).

- [ ] **Step 3: Implement the generator**

```js
// packages/ui/scripts/gen-construct-schema.mjs
// The construct format's PUBLISHED JSON Schema, derived from the Zod source of
// truth (src/agent-tooling/construct/schema.ts) — never hand-edited. Two
// addresses, one artifact: the checked-in copy beside the source (what the MCP
// tool and tests read) and apps/docs/public/schemas/construct/v1.json (served
// at https://ui.kitn.ai/schemas/construct/v1.json — what a hand-author's
// editor fetches for autocomplete). Runs in build:api, so verify:generated
// (the generated-artifact drift guard) fails CI when either copy is stale.
// Additive evolution edits v1 in place; a breaking change bumps the URL.
//
// Loads the schema through vite-node? No: through the built dist/construct-cli
// would couple api-gen to the js build. tsx is not a dependency. The pragmatic
// path the repo already uses for TS-in-scripts is to import the COMPILED mcp
// bundle — but build:api must run on an unbuilt tree. So the schema module is
// loaded with Node's own TS support if available, else via a tiny esbuild
// transform — read scripts/gen-catalog.mjs and use EXACTLY the loading
// mechanism it uses for TS sources; do not invent a new one.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { z, ConstructSchema } = await loadSchemaModule(); // per gen-catalog.mjs's mechanism

const schema = {
  $id: 'https://ui.kitn.ai/schemas/construct/v1.json',
  ...z.toJSONSchema(ConstructSchema),
};
const body = `${JSON.stringify(schema, null, 2)}\n`;

for (const out of [
  join(PKG_ROOT, 'src/agent-tooling/construct/construct.v1.schema.json'),
  join(PKG_ROOT, '../../apps/docs/public/schemas/construct/v1.json'),
]) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  console.log(`  · wrote ${out}`);
}
```

The `loadSchemaModule` note is a real instruction, not a placeholder: `scripts/gen-catalog.mjs` already solves "run a .ts module from an .mjs generator" for this exact tree — open it and reuse its loader verbatim (same helper, same import style). Then append `&& node scripts/gen-construct-schema.mjs` to the `build:api` script in `packages/ui/package.json`.

- [ ] **Step 4: Generate + green**

Run from `packages/ui`: `node scripts/gen-construct-schema.mjs`, then the vitest file — PASS. Run `pnpm --filter @kitn.ai/ui run verify:generated` and satisfy whatever registration it demands (step-file instruction above). Regenerate-after-edit discipline note for executors: `nx build ui` can cache-skip build:api (CLAUDE.md) — always regenerate with `npm run build:api` in `packages/ui` or `--skip-nx-cache`.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/scripts/gen-construct-schema.mjs packages/ui/package.json packages/ui/scripts/verify-generated-sync.mjs packages/ui/src/agent-tooling/construct/construct.v1.schema.json packages/ui/src/agent-tooling/construct/schema-artifact.test.ts apps/docs/public/schemas/construct/v1.json
git commit -m "feat(construct): publish construct/v1 JSON Schema via build:api under the drift guard"
```

---

### Task 15: `verify:construct` — the CI gate, axes derived from the schema

**Files:**
- Create: `packages/ui/scripts/verify-construct.mjs`
- Create: `packages/ui/src/agent-tooling/construct/fixtures/ops-console.construct.json`
- Modify: `packages/ui/package.json` (`"verify:construct": "node scripts/verify-construct.mjs --self-test && node scripts/verify-construct.mjs"`)
- Modify: `.github/workflows/` — add the step to the required `test` job, mirroring how `verify:scaffold` is invoked there (read the workflow, add the step beside it; it needs a build first, which that job already has).

**What the gate does** (model: `verify-scaffold-compiles.mjs` for derivation + self-test honesty, `verify-consumer-sideeffects.mjs` for the real-bundler leg):

1. **Derive the axes — never type them.** Read `src/agent-tooling/construct/construct.v1.schema.json` (drift-guarded against the Zod source by Task 14, so reading the artifact IS reading the schema): layouts from `properties.layout.enum`; capability probe keys from `Object.keys(properties.capabilities.properties)`. Fixtures = every layout × (each capability alone + none + all), plus the checked-in named fixtures (`demo-widget`, `ops-console`, and from Task 17 `owner-widget`). Adding a capability to the Zod schema moves the printed cell count by itself; the script PRINTS the axes and counts it ran — read those, never a figure in a doc. Synthesized capability payloads come from a small per-key valuer keyed by the capability's OWN schema (e.g. an `accept` array field gets `['image/*']`); an unrecognized capability key with no valuer is a HARD FAILURE, so a new capability cannot silently skip coverage (the verify-scaffold "unrecognised runtime label" rule).
2. **Pack once:** `npm pack` the built package (require `dist/kai.es.js` to exist, else fail loudly telling the runner to `nx build ui` first — the verify-consumer-sideeffects preamble).
3. **Generate through the REAL artifact chain:** for each fixture, shell `node bin/mcp.js eject <fixture.json> <cell-dir> ` — the gate drives the CLI, not the library, so the bin dispatch and the CLI bundle are covered too. Give eject the tarball: add a `--ui <spec>` flag to the `eject` case in `cli.ts` (same parse as dev/compile) in this task, TDD'd in `cli.test.ts` first (test: emitted package.json carries the flag's spec).
4. **One shared install:** install the first cell's `package.json` (they differ only in name) into a shared `node_modules`, symlink/copy it into every cell — the verify-scaffold economy move; per-cell `npm install` would be minutes × cells.
5. **Compile every cell:** `tsc --noEmit` with the cell's own generated `tsconfig.json` (`--strict --noUnusedLocals` are IN that file, so the gate compiles exactly what an ejecting consumer compiles).
6. **Build every cell:** `npm run build` (the lib config) — the emitted element must actually bundle.
7. **The consumer-bundle leg:** for each `layout × all-capabilities` cell (one per layout — the recorded scope decision: every fixture is tsc'd and vite-built; the Vite-8 consumer app leg runs per layout), scaffold a minimal Vite-8 consumer app whose `main.ts` does `import './<name>.js'` of the COMPILED output, build it, and assert the bundle still registers: the output contains the tag name and a `customElements.define`/`get` call path survives (grep the bundle for the tag string AND `customElements` — the verify-consumer-sideeffects assertion shape).
8. **Self-test first** (`--self-test`): a fixture with a deliberate type error spliced into its generated `App.tsx` MUST fail the tsc leg, and a bundle with the registration hand-stripped MUST fail the grep — if either passes, the harness is broken and the script exits non-zero saying so. Watch every check fail before trusting it.

Core of the script (the derivation + fixture synthesis + self-test spine — the install/tsc/build/bundle legs follow the two model scripts named above; lift `run`/`step`/`fail` helpers from `verify-consumer-sideeffects.mjs` verbatim):

```js
// packages/ui/scripts/verify-construct.mjs (core)
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = JSON.parse(
  readFileSync(join(PKG_ROOT, 'src/agent-tooling/construct/construct.v1.schema.json'), 'utf8'),
);

// ── AXES: DERIVED from the drift-guarded schema artifact, never typed ────────
const layouts = SCHEMA.properties.layout.enum;
const capabilityKeys = Object.keys(SCHEMA.properties.capabilities?.properties ?? {});

// One synthesizer per capability key, keyed by NAME. A key with no entry is a
// HARD FAILURE (verify-scaffold's unrecognised-label rule): a new capability
// cannot silently skip coverage.
const CAPABILITY_VALUES = {
  starters: ['Track my order', 'Request a refund'],
  attachments: { accept: ['image/*', 'application/pdf'] },
  history: { persistence: 'local' },
};
for (const key of capabilityKeys) {
  if (!(key in CAPABILITY_VALUES)) {
    fail(`capability "${key}" is in the schema but has no fixture valuer — add one to CAPABILITY_VALUES`);
  }
}

function fixtureFor(layout, capKeys, index) {
  const capabilities = Object.fromEntries(capKeys.map((k) => [k, CAPABILITY_VALUES[k]]));
  return {
    name: `probe-${layout}-${index}`,
    layout,
    provider: { mode: 'mock' },
    ...(capKeys.length ? { capabilities } : {}),
    ...(layout === 'custom' ? { slots: ['header'] } : {}),
  };
}

const cells = [];
for (const layout of layouts) {
  const probes = [[], ...capabilityKeys.map((k) => [k]), capabilityKeys]; // none + each-alone + all
  probes.forEach((capKeys, i) => cells.push(fixtureFor(layout, capKeys, i)));
}
// Named fixtures ride along: demo-widget, ops-console, owner-widget (Task 17).
const FIXTURES_DIR = join(PKG_ROOT, 'src/agent-tooling/construct/fixtures');
const named = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.construct.json'));

console.log(
  `verify:construct — ${layouts.length} layouts × ${capabilityKeys.length + 2} probes ` +
    `= ${cells.length} synthesized cells + ${named.length} named fixtures`,
);

// Each cell: write fixture JSON → `node bin/mcp.js eject <fixture> <dir> --ui <tarball>`
// → shared-install node_modules link → `tsc --noEmit` (the cell's own strict
// tsconfig) → `npm run build` → per layout×all-caps cell, the Vite-8 consumer
// bundle + registration grep. --self-test first: a spliced type error MUST fail
// tsc, a stripped registration MUST fail the grep, else exit non-zero.
```

- [ ] **Step 1:** Write `ops-console.construct.json` first — the spec's success-metric fixture, ops-console re-expressed (aside layout, endpoint provider, attachments + history + starters, one form card carrying an `x-kai-format` masked field lifted from `examples/` ops-console's real card schemas — copy a real one, e.g. the CHG-#### change-ticket mask, NEVER an SSN-style example). Validate it: `node bin/mcp.js validate src/agent-tooling/construct/fixtures/ops-console.construct.json`.
- [ ] **Step 2:** TDD the `--ui` flag on eject in `cli.test.ts` (fail → implement → pass).
- [ ] **Step 3:** Write `verify-construct.mjs` per the eight points; run `node scripts/verify-construct.mjs --self-test` and watch BOTH probes fail the right way before the real run.
- [ ] **Step 4:** Run the real gate: `pnpm --filter @kitn.ai/ui run verify:construct` — read the printed axes/counts, confirm they match `layouts × (capabilities + 2) + named fixtures`.
- [ ] **Step 5:** Wire the CI step; commit.

```bash
git add packages/ui/scripts/verify-construct.mjs packages/ui/package.json packages/ui/src/agent-tooling/construct/fixtures/ops-console.construct.json packages/ui/src/agent-tooling/construct/cli.ts packages/ui/src/agent-tooling/construct/cli.test.ts .github/workflows/
git commit -m "feat(construct): verify:construct gate — schema-derived fixture axes, tsc + build + consumer-bundle legs"
```

---

### Task 16: The `construct` MCP tool — turn-by-turn authoring

**Files:**
- Create: `packages/ui/src/agent-tooling/mcp/tools/construct.ts`
- Modify: `packages/ui/src/agent-tooling/mcp/server.ts` (tools array += `constructTool`)
- Test: `packages/ui/src/agent-tooling/mcp/construct-tool.test.ts`

**Interfaces:**
- Consumes: `Tool` from `./types`, `validateConstruct`/`ConstructSchema`/`CONSTRUCT_SCHEMA_URL` from `../../construct/schema`.
- Produces: `export const constructTool: Tool` with `name: 'construct'`. Stateless by design: the HARNESS owns the construct file; every call carries the full construct for THIS turn (that is what makes turn 40 safe — no server-side draft to corrupt). Two entry shapes, `.strict()`, at least one required via `.superRefine`:
  - `intent?: string` alone → returns a STARTER construct (widget + mock + `$schema`) plus the real-choice questions the intent leaves open. Menu-honesty rule: ask ONLY questions with more than one live answer — layout is asked only when the intent does not imply it (e.g. "widget on our support page" implies `widget`: state it, don't ask it).
  - `construct: object` (optionally with `intent`) → validate. Rejection is a NORMAL, non-error result: verdict `REJECTED`, each problem as `path: reason`, and the reminder that the previous good construct still stands. Acceptance returns verdict `VALID`, the normalized construct, and next commands (`kai dev <file>`, and for `endpoint` providers the pointer to the `scaffold` tool for a backend route — recorded decision 3).

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/mcp/construct-tool.test.ts
import { describe, expect, it } from 'vitest';
import { constructTool } from './tools/construct';
import { createServer } from './server';

const text = (r: { content: { type: string; text?: string }[] }) =>
  r.content.map((c) => c.text ?? '').join('\n');

describe('the construct MCP tool', () => {
  it('is registered on the server', () => {
    expect(createServer().__listToolsForTest()).toContain('construct');
  });

  it('intent alone returns a starter construct and only real-choice questions', async () => {
    const r = await constructTool.handler({
      intent: 'a support widget for our order page',
    });
    const out = text(r);
    expect(out).toContain('"layout": "widget"'); // implied by "widget" — stated, not asked
    expect(out).toContain('"mode": "mock"');
    expect(out).toContain('https://ui.kitn.ai/schemas/construct/v1.json');
    expect(out).not.toMatch(/which layout/i);
  });

  it('a bad turn is rejected with paths and reasons, not an error', async () => {
    const r = await constructTool.handler({
      construct: { name: 'acme-support', layout: 'popup', provider: { mode: 'mock' } },
    });
    expect(r.isError).not.toBe(true);
    const out = text(r);
    expect(out).toContain('REJECTED');
    expect(out).toContain('layout');
    expect(out).toMatch(/previous good construct/i);
  });

  it('a valid turn echoes the construct and the kai dev command', async () => {
    const r = await constructTool.handler({
      construct: { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } },
    });
    const out = text(r);
    expect(out).toContain('VALID');
    expect(out).toContain('kai dev');
  });

  it('endpoint constructs get pointed at the scaffold tool for the route', async () => {
    const r = await constructTool.handler({
      construct: {
        name: 'acme-support',
        layout: 'widget',
        provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
      },
    });
    expect(text(r)).toContain('scaffold');
  });
});
```

- [ ] **Step 2: Watch it fail** — `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/construct-tool.test.ts`.

- [ ] **Step 3: Implement `tools/construct.ts`** — follow `tools/theme.ts` for result shaping (read it first; it is the smallest sibling). Skeleton:

```ts
import { z } from 'zod';
import type { Tool } from './types';
import { validateConstruct, CONSTRUCT_SCHEMA_URL } from '../../construct/schema';

const inputSchema = z
  .object({
    intent: z.string().min(1).optional()
      .describe('What the author wants, in their words. Alone: returns a starter construct.'),
    construct: z.record(z.string(), z.unknown()).optional()
      .describe('The FULL construct JSON for this turn. The harness owns the file; send all of it every turn.'),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.intent && !v.construct) ctx.addIssue({ code: 'custom', message: 'pass intent, construct, or both' });
  });

function starterFor(intent: string) {
  // Derive what the intent already implies; ask only what it leaves open.
  const impliesWidget = /widget|embed|bubble|corner|launcher/i.test(intent);
  const name = 'my-chat'; // real-choice: always ask for the tag name (it is theirs)
  return {
    construct: {
      $schema: CONSTRUCT_SCHEMA_URL,
      name,
      layout: 'widget',
      provider: { mode: 'mock' },
    },
    stated: impliesWidget ? ['layout: widget (implied by your request)'] : [],
    questions: [
      `What should the element tag be? (kebab-case, e.g. "acme-support"; using "${name}" until you say)`,
      ...(impliesWidget ? [] : ['Layout: widget, fullscreen, aside, split, or custom?']),
    ],
  };
}

export const constructTool: Tool = {
  name: 'construct',
  description:
    'Author a kitn construct (one JSON file → one web component) turn by turn. ' +
    'Send the full construct each turn; invalid turns come back REJECTED with per-path reasons and the previous good construct stands. ' +
    `Schema: ${CONSTRUCT_SCHEMA_URL}. Preview with "npx @kitn.ai/ui dev <file>".`,
  inputSchema: inputSchema as unknown as Tool['inputSchema'],
  handler: async (args) => {
    const { intent, construct } = args as { intent?: string; construct?: Record<string, unknown> };
    if (!construct) {
      const s = starterFor(intent ?? '');
      return {
        content: [
          {
            type: 'text',
            text: [
              'STARTER construct (mock provider — keyless, previews immediately):',
              '```json', JSON.stringify(s.construct, null, 2), '```',
              ...s.stated, ...s.questions,
            ].join('\n'),
          },
        ],
      };
    }
    const out = validateConstruct(construct);
    if (!out.ok) {
      return {
        content: [
          {
            type: 'text',
            text: [
              'REJECTED — this turn does not change the file; the previous good construct stands.',
              ...out.problems.map((p) => `  ${p.path || '(root)'}: ${p.message}`),
            ].join('\n'),
          },
        ],
      };
    }
    const c = out.construct;
    return {
      content: [
        {
          type: 'text',
          text: [
            `VALID: <${c.name}> (${c.layout}, ${c.provider.mode}).`,
            '```json', JSON.stringify(c, null, 2), '```',
            `Preview: npx @kitn.ai/ui dev <file>. Compile: npx @kitn.ai/ui compile <file>.`,
            ...(c.provider.mode === 'endpoint'
              ? ['Backend route: use the scaffold tool — it emits a compiling route for your framework and wire.']
              : []),
          ].join('\n'),
        },
      ],
    };
  },
};
```

Note the `inputSchema` cast: `Tool.inputSchema` is `z.ZodObject` and `.superRefine` returns a `ZodEffects`-style wrapper in zod 4 — if `validateToolArgs`/`z.toJSONSchema` reject the wrapper, drop `.superRefine` and enforce "at least one of" inside the handler with the same message (the advertised schema stays a plain strict object; the check stays). Decide by running `server.test.ts` + `validate-args.test.ts`. Register in `server.ts`: `import { constructTool } from './tools/construct';` and `const tools: Tool[] = [reference, scaffold, theme, debug, constructTool];`.

- [ ] **Step 4: Green** — the new test file plus `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/server.test.ts` (the tool-count/schema-conversion assertions there may enumerate tools; update them honestly if they do).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/mcp/tools/construct.ts packages/ui/src/agent-tooling/mcp/construct-tool.test.ts packages/ui/src/agent-tooling/mcp/server.ts
git commit -m "feat(mcp): construct authoring tool — turn-by-turn validation, starter from intent"
```

---

### Task 17: End-to-end conversational fixture — the owner's four-sentence widget

**Files:**
- Create: `packages/ui/src/agent-tooling/mcp/construct-conversation.test.ts`
- Create: `packages/ui/src/agent-tooling/construct/fixtures/owner-widget.construct.json`
- Modify: nothing else — Task 15's gate picks the fixture up by being in `fixtures/` (its named-fixture glob).

The owner's four sentences, scripted: (1) "a support widget for our site" (2) "let people attach files and images" (3) "remember the conversation between visits" (4) "start with a couple of suggested questions".

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/agent-tooling/mcp/construct-conversation.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { constructTool } from './tools/construct';
import { validateConstruct } from '../construct/schema';
import { generateProject } from '../construct/codegen';

const text = (r: { content: { type: string; text?: string }[] }) =>
  r.content.map((c) => c.text ?? '').join('\n');

// The spec's e2e: a scripted agent session builds the owner's four-sentence
// widget, every turn validated, and the RESULT RUNS — the "runs" half is
// verify:construct, which compiles this exact fixture (owner-widget) as a
// named cell; this test pins that the conversation PRODUCES that fixture.
describe('four-sentence conversational construction', () => {
  const finalConstruct = {
    $schema: 'https://ui.kitn.ai/schemas/construct/v1.json',
    name: 'acme-support',
    layout: 'widget',
    provider: { mode: 'mock' },
    capabilities: {
      attachments: { accept: ['image/*', 'application/pdf'] },
      history: { persistence: 'local' },
      starters: ["Where's my order?", 'Request a refund'],
    },
  };

  it('every turn of the scripted session is accepted; a hostile turn is not', async () => {
    // Turn 1: intent only — starter comes back, widget implied.
    const t1 = await constructTool.handler({ intent: 'a support widget for our site' });
    expect(text(t1)).toContain('"layout": "widget"');

    // Turns 2-4: the agent grows the SAME file, full construct each turn.
    const turns = [
      { ...finalConstruct, capabilities: { attachments: finalConstruct.capabilities.attachments } },
      { ...finalConstruct, capabilities: { attachments: finalConstruct.capabilities.attachments, history: finalConstruct.capabilities.history } },
      finalConstruct,
    ];
    for (const construct of turns) {
      expect(text(await constructTool.handler({ construct }))).toContain('VALID');
    }

    // A turn-40-style bad edit bounces: the spine has no wiring to break, and
    // logic is not vocabulary.
    const bad = await constructTool.handler({
      construct: { ...finalConstruct, onMessage: "fetch('https://evil.example')" },
    });
    expect(text(bad)).toContain('REJECTED');
    expect(text(bad)).toContain('onMessage');
  });

  it('the conversation result IS the checked-in gate fixture', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(__dirname, '../construct/fixtures/owner-widget.construct.json'),
        'utf8',
      ),
    );
    expect(fixture).toEqual(finalConstruct);
  });

  it('and it generates the full wiring', () => {
    const out = validateConstruct(finalConstruct);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const app = generateProject(out.construct).find((f) => f.path === 'src/App.tsx')!.code;
    for (const marker of ['readAsDataURL', 'localStorage', 'PromptSuggestion', '<Dock']) {
      expect(app).toContain(marker);
    }
  });
});
```

- [ ] **Step 2: Watch it fail** (no fixture file yet; second test red).

- [ ] **Step 3:** Write `fixtures/owner-widget.construct.json` with exactly the `finalConstruct` body. Run the test file — PASS.

- [ ] **Step 4:** Run the whole verification ladder, in this order, and read every verdict (no green-by-assumption):
  1. `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct src/agent-tooling/mcp src/elements/define-entry.test.ts`
  2. `pnpm --filter @kitn.ai/ui run typecheck` (inside `packages/ui` — the trustworthy variant per CLAUDE.md)
  3. `nx build ui --skip-nx-cache`
  4. `pnpm --filter @kitn.ai/ui run verify:construct` — owner-widget and ops-console appear in the printed cells
  5. `pnpm --filter @kitn.ai/ui exec vitest run --project=emitted` (unchanged, but it is part of the merge gate)
  6. `pnpm --filter @kitn.ai/ui run verify:scaffold` (the server/tool changes touched its neighborhood)
  7. `node packages/ui/bin/mcp.js dev packages/ui/src/agent-tooling/construct/fixtures/owner-widget.construct.json` — the four-sentence widget, live: attach a file, reload for history, click a starter.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/mcp/construct-conversation.test.ts packages/ui/src/agent-tooling/construct/fixtures/owner-widget.construct.json
git commit -m "test(construct): e2e conversational fixture — the four-sentence widget, turn-validated"
```

---

## Success criteria traceability (spec §Executive summary)

- **ops-console ≥50% less hand-written code:** `fixtures/ops-console.construct.json` (Task 15) is the re-expression; when reporting completion, count its JSON lines against the hand-written ops-console front-end source it replaces and state the measured ratio — a report line, not a gate.
- **construct → live preview < 1 min, keyless:** Task 5 step 4/6 (mock default; only the first `npm install` is slow, and `installKey` caching makes every later run seconds).
- **Emitted element passes the kit's own consumer gates:** Task 15 legs 5–7.
- **Coding agent authors a valid construct first-try from one sentence:** Task 16 (starter-from-intent) pinned by Task 17 turn 1.

## Deferred (recorded, not lost)

- Solid v2 target (spec D-10): the generated project pins `solid-js ^1.9.0` today; when the kit's staged v2 migration lands, `emitPackageJson` is the ONE line that moves.
- `kai eject --route` / compile-time route stubs (recorded decision 3).
- Interactive canvas, non-technical authoring, arbitrary trees, plugin harness: spec non-goals.
