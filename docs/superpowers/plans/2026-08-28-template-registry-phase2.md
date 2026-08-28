# Template Registry — Phase 2 Implementation Plan (spec tasks 6–8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One template registry (`templates.ts`, a leaf) that three consumers read live — create-kai's grown shape axis, `BuilderStart`'s card list, and the MCP `construct` tool's starter statements — with every buildable starter schema-valid by test, riding the emit gate as generated fixtures, shipped to create-kai over a new zod-free `@kitn.ai/ui/construct/templates` subpath, and registered in coupling-map §4.

**Architecture:** `packages/ui/src/agent-tooling/construct/templates.ts` is pure data plus type-only imports (`import type { Construct }`), so the browser-side builder components, the Node MCP tool, and create-kai's esbuild bundle can all import it. The `CONSTRUCT_SCHEMA_URL` constant moves to a new leaf `schema-url.ts` (re-exported from `schema.ts`, one address kept) so templates can stamp `$schema` without a value import of the zod module. A new vite lib entry bundles templates alone to `dist/construct-templates.js`; create-kai imports it at runtime and `bundleGraphProblem`'s existing zod ban is the enforcement. A build:api generator writes each buildable starter/variant to `fixtures/templates/*.construct.json`; `verify:generated` guards their drift and `verify:construct`'s fixture discovery (extended to recurse) ejects/compiles/builds each one on every gate run.

**Tech Stack:** TypeScript, Zod (test layer only — never in the registry module), vitest (unit), vite lib builds, esbuild (create-kai bundle + `importTs`), the repo's own guard scripts.

**Spec:** `docs/superpowers/specs/2026-08-28-template-registry-and-builder-build.md` — Phase 2, rulings B-12..B-18, corrections C-4/C-6. Companion context: `2026-08-28-t5-vocabulary-rulings.md` (rulings 8, 10a, 11), `2026-08-28-template-builder-design.md` (T-1..T-7).

**DEPENDENCY — this plan executes AFTER Phase 1 (spec tasks 1–5) lands.** It is written against the post-phase-1 schema: `capabilities.messageActions` / `capabilities.sources` / `header.themeToggle` + `header.actions` / `composer.triggers` / `shell` / `aside` all exist in `ConstructSchema` and in the `Construct` type. If any of those keys is missing when you start, stop and surface it — do not stub around it.

## Global Constraints

- **Leaf-module rule for `templates.ts` (B-12):** data + type-only imports only. `import type { Construct } from './schema'` (erased at emit), a value import of `./schema-url` (a zero-import leaf) and NOTHING else — no zod, no component imports, no `./schema` value import. Pinned by a source-scan test in `templates.test.ts` AND by create-kai's `bundleGraphProblem` (the zod ban goes red on its own if the entry ever grows a zod path).
- **Menu-honesty:** product surfaces filter `availability === 'buildable'`. Voice is in the registry as `'story-only'` (identity only, no starter — the TYPE forbids one); Multi-mode is not in the registry at all (C-4). The Labs start screen keeps six cards.
- **Derive, don't type:** BuilderStart's card list, the wizard's template options, and the MCP tool's statements all READ the registry — never restate id/name/description. The one deliberate copy is the generated fixture JSONs (an `.mjs` gate reads JSON, not TS), recorded loudly in coupling-map §4.
- **All starters `provider: { mode: 'mock' }`, `$schema` stamped (B-14).** Starter content is the story demos' schema-expressible subset only (C-6) — titles, starters, accents, capability toggles, trigger item lists, header/shell chrome. Stub message threads and non-vocabulary anatomy do NOT carry over.
- **Conventional commits** (release-please drives versioning; never hand-edit `package.json` version). Pre-1.0: `feat!` = minor bump.
- **NX cache caveats:** `nx build ui` can hit the cache and skip build:api's source-tree generators while printing success; `nx typecheck ui`'s cached verdict has been wrong in both directions. Use `pnpm --filter @kitn.ai/ui run typecheck` (runs `verify:quarantine` first) and `nx build ui --skip-nx-cache` (or `npm run build:api` inside `packages/ui`) wherever a regenerated artifact matters.
- **`verify:construct` needs a real build first** (`nx build ui` — it packs this checkout's own dist). Minutes, not seconds; run it as the task-6 epic gate, not per-step.
- **Commands run from the repo root** unless a step says otherwise.

## Spec-ruling → task map

| Ruling | Landed in |
|---|---|
| B-12 (one leaf module, entry type, per-starter schema validity) | Task 6 |
| B-13 (templates v1, voice story-only, no Multi-mode, Research buildable) | Task 6 |
| B-14 (starter content from the stories' schema-expressible subset; triggers only on Workspace; mock provider) | Task 6 |
| B-15 (fixture generator rides build:api; verify:generated + verify:construct coverage) | Task 6 |
| B-16 (new zod-free `./construct/templates` subpath; `bundleGraphProblem` stays the enforcement) | Task 6 (entry) + Task 7 (the proof: create-kai bundles it) |
| B-17a (create-kai: grown shapeAxis, starter seeding, WIZARD_REGISTRY entries) | Task 7 |
| B-17b (BuilderStart maps the registry; story keeps six; product filters buildable) | Task 8 |
| B-17c (MCP tool: registry statements replace `starterFor`'s regex starter) | Task 8 |
| B-18 (coupling-map §4 entry) | Task 6 |
| C-4 (Multi-mode absent), C-6 (schema-expressible subset only) | Tasks 6 (data + tests) |

---

## Task 6 — the registry, the subpath, the fixture generator, the coupling-map row

**Files:**
- Create: `packages/ui/src/agent-tooling/construct/schema-url.ts`
- Create: `packages/ui/src/agent-tooling/construct/templates.ts`
- Create: `packages/ui/src/agent-tooling/construct/templates.test.ts`
- Create: `packages/ui/vite.config.construct-templates.ts`
- Create: `packages/ui/scripts/gen-construct-template-fixtures.mjs`
- Edit: `packages/ui/src/agent-tooling/construct/schema.ts` (move the URL const to the leaf, re-export)
- Edit: `packages/ui/vite.config.construct.ts` (add `schema-url.ts` to the dts include)
- Edit: `packages/ui/package.json` (`exports` + `build` chain + `build:api` chain)
- Edit: `packages/ui/scripts/verify-generated-sync.mjs` (register the 7 fixture JSONs)
- Edit: `packages/ui/scripts/verify-construct.mjs` (recursive fixture discovery)
- Edit: `docs/coupling-map.md` (§4 row)
- Generated (committed): `packages/ui/src/agent-tooling/construct/fixtures/templates/*.construct.json` (7 files)

**Interfaces:**

```ts
// templates.ts exports — the B-12 entry shape
export type TemplateId = 'widget' | 'inAppAssistant' | 'assistant' | 'research' | 'workspace' | 'voice';
export type BuildableTemplateId = Exclude<TemplateId, 'voice'>;

export interface TemplateVariant {
  id: string;
  name: string;
  description: string;
  starter: Construct;
}
export interface TemplateControlSection {
  /** Stable section id — phase 3's panel keys its section registry off these. */
  id: string;
  /** The ConstructSchema paths this section edits (dotted, top-level-first). */
  paths: readonly string[];
}
export interface BuildableTemplate {
  id: BuildableTemplateId;
  name: string;            // T-4 neutral public name
  description: string;     // one-liner
  availability: 'buildable';
  starter: Construct;      // typed — tsc itself is the first drift guard
  variants?: readonly TemplateVariant[];
  controls: readonly TemplateControlSection[];
}
export interface StoryOnlyTemplate {
  id: Extract<TemplateId, 'voice'>;
  name: string;
  description: string;
  availability: 'story-only';
  // NO starter member — "the type makes starter optional exactly and only
  // for story-only entries" (B-13): a story-only entry CANNOT carry one.
}
export type TemplateEntry = BuildableTemplate | StoryOnlyTemplate;

export const TEMPLATES: readonly TemplateEntry[];
export function buildableTemplates(): readonly BuildableTemplate[];
export function templateById(id: TemplateId): TemplateEntry | undefined;
```

```jsonc
// package.json exports addition — the B-16 subpath
"./construct/templates": {
  "types": "./dist/agent-tooling/construct/templates.d.ts",
  "default": "./dist/construct-templates.js"
}
```

### Steps

- [ ] **6.1 — write the failing registry test first.** Create `packages/ui/src/agent-tooling/construct/templates.test.ts`:

```ts
/**
 * The template registry's contract (B-12/B-13/B-14): every buildable starter
 * (and every variant starter) safeParses against the REAL ConstructSchema on
 * every run — the create-kai precedent: correspondence lives in the test
 * layer, driven off the live schema, because the registry module itself must
 * stay zod-free (a leaf all three consumers can import).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConstructSchema, CONSTRUCT_SCHEMA_URL } from './schema';
import { TEMPLATES, buildableTemplates, templateById } from './templates';

const starterCases = buildableTemplates().flatMap((t) => [
  { name: t.id, starter: t.starter },
  ...(t.variants ?? []).map((v) => ({ name: `${t.id}.${v.id}`, starter: v.starter })),
]);

describe('every buildable starter is a valid construct (B-12)', () => {
  it('has starters to drive, so the loops below are not vacuous', () => {
    expect(starterCases.length).toBeGreaterThan(0);
    expect(buildableTemplates().length).toBeGreaterThan(0);
  });

  for (const { name, starter } of starterCases) {
    it(`${name}: safeParses against the real ConstructSchema`, () => {
      const parsed = ConstructSchema.safeParse(starter);
      expect(
        parsed.success,
        parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2),
      ).toBe(true);
    });
    it(`${name}: stamps $schema and the mock provider (B-14 — keyless first run)`, () => {
      expect(starter.$schema).toBe(CONSTRUCT_SCHEMA_URL);
      expect(starter.provider).toEqual({ mode: 'mock' });
    });
  }
});

describe('registry shape (B-13 / C-4)', () => {
  it('voice is story-only, identity only; Multi-mode is not in the registry at all', () => {
    const voice = templateById('voice');
    expect(voice?.availability).toBe('story-only');
    expect(voice && 'starter' in voice).toBe(false);
    expect(TEMPLATES.some((t) => /multi/i.test(t.id))).toBe(false);
  });

  it('the five buildable templates are exactly the ruled set, in card order', () => {
    expect(buildableTemplates().map((t) => t.id)).toEqual([
      'widget',
      'inAppAssistant',
      'assistant',
      'research',
      'workspace',
    ]);
  });

  it('workspace carries the two ruling-11 variants, identities from builder-workspace-variants', () => {
    const ws = buildableTemplates().find((t) => t.id === 'workspace')!;
    expect(ws.variants?.map((v) => v.id)).toEqual(['artifactPreview', 'appPreview']);
  });

  it('every buildable entry has a non-empty controls manifest', () => {
    for (const t of buildableTemplates()) {
      expect(t.controls.length, t.id).toBeGreaterThan(0);
      for (const s of t.controls) expect(s.paths.length, `${t.id}/${s.id}`).toBeGreaterThan(0);
    }
  });
});

describe('starter content rules (B-14 / B-4)', () => {
  it('Workspace is the ONLY buildable template whose starters carry composer.triggers (the ruling-8 default-on matrix, expressed as starter data)', () => {
    for (const t of buildableTemplates()) {
      const all = [t.starter, ...(t.variants ?? []).map((v) => v.starter)];
      const hasTriggers = all.some((s) => s.composer?.triggers !== undefined);
      expect(hasTriggers, t.id).toBe(t.id === 'workspace');
    }
  });

  it("Research states its defining fact in its own JSON: sources: { strip: true }", () => {
    const research = buildableTemplates().find((t) => t.id === 'research')!;
    expect(research.starter.capabilities?.sources).toEqual({ strip: true });
  });
});

describe('templates.ts stays a leaf (B-12)', () => {
  it('has no value import other than ./schema-url — no zod, no ./schema, no components', () => {
    const src = readFileSync(new URL('./templates.ts', import.meta.url), 'utf8');
    const valueImports = [...src.matchAll(/^import (?!type[\s{])[^;]*?from '([^']+)';/gm)].map(
      (m) => m[1],
    );
    expect(valueImports).toEqual(['./schema-url']);
  });
});
```

- [ ] **6.2 — run it, watch it fail** (module does not exist yet):

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/templates.test.ts
```

Expected: `Cannot find module './templates'` (and `'./schema-url'` once templates exists). A green here means you are in the wrong tree.

- [ ] **6.3 — move the schema URL to a leaf.** Create `packages/ui/src/agent-tooling/construct/schema-url.ts`:

```ts
/**
 * The construct schema's published URL — a LEAF on purpose (the kit-pin.ts
 * pattern, same reason as C-2's chat-actions const): templates.ts must stamp
 * `$schema` on every starter (B-14) without a value import of schema.ts,
 * whose top-level zod side effects esbuild cannot tree-shake past
 * (create-kai's wizard.ts header records that failure). schema.ts re-exports
 * this, so every existing import site keeps its one address.
 */
export const CONSTRUCT_SCHEMA_URL = 'https://ui.kitn.ai/schemas/construct/v1.json';
```

Then in `packages/ui/src/agent-tooling/construct/schema.ts`, replace the current line 30:

```ts
export const CONSTRUCT_SCHEMA_URL = 'https://ui.kitn.ai/schemas/construct/v1.json';
```

with:

```ts
export { CONSTRUCT_SCHEMA_URL } from './schema-url';
```

And in `packages/ui/vite.config.construct.ts`, grow the dts include (line 46) so `schema.d.ts`'s new re-export resolves in dist:

```ts
      include: [
        'src/agent-tooling/construct/public.ts',
        'src/agent-tooling/construct/schema.ts',
        'src/agent-tooling/construct/schema-url.ts',
      ],
```

- [ ] **6.4 — write `packages/ui/src/agent-tooling/construct/templates.ts`.** The full module (starter provenance is annotated per entry; every starter is the C-6 schema-expressible subset of its Labs story or fixture, with `provider` forced to mock per B-14):

```ts
/**
 * The template registry — ONE module, a LEAF (B-12).
 *
 * Data + type-only imports ONLY: `import type { Construct }` is erased at
 * emit, and ./schema-url is a zero-import leaf. NO zod value import, no
 * component import, EVER — that single constraint is what lets all three
 * consumers read this file: the browser-side builder components
 * (builder-start.tsx), the Node MCP tool (mcp/tools/construct.ts), and
 * create-kai's esbuild bundle over `@kitn.ai/ui/construct/templates`
 * (B-16 — bundleGraphProblem's zod ban goes red on its own if this module
 * ever grows a zod path). templates.test.ts pins the import discipline AND
 * safeParses every starter against the real ConstructSchema on every run —
 * schema validity lives in the TEST layer because it cannot live here.
 *
 * A template is a starter construct plus a control manifest, not schema
 * vocabulary (T-3). Public names are neutral (T-4). Voice is 'story-only':
 * identity only, no starter — the StoryOnlyTemplate type has no starter
 * member, which is what "the type makes starter optional exactly and only
 * for story-only entries" (B-13) means. Multi-mode is owner-parked and not
 * in the registry at all (C-4).
 *
 * Starter provenance (C-6): each starter is the schema-expressible subset
 * of its Labs/Builder story's seed state (or the owner-widget fixture
 * lineage, for widget) — titles, starters, accents, capability toggles,
 * trigger lists, header/shell chrome. Stub message threads, pane anatomy
 * and other non-vocabulary story state do NOT carry over. All providers
 * are `{ mode: 'mock' }` (B-14 — the wizard's own keyless-first-run
 * promise), regardless of what the story used.
 */
import type { Construct } from './schema';
import { CONSTRUCT_SCHEMA_URL } from './schema-url';

export type TemplateId = 'widget' | 'inAppAssistant' | 'assistant' | 'research' | 'workspace' | 'voice';
export type BuildableTemplateId = Exclude<TemplateId, 'voice'>;

export interface TemplateVariant {
  id: string;
  name: string;
  description: string;
  starter: Construct;
}

/** One panel section: a stable id (phase 3's BuilderPanel keys its section
 *  registry off these — the shape builder-panel.tsx's sections already
 *  stubbed) plus the schema paths the section edits. */
export interface TemplateControlSection {
  id: string;
  paths: readonly string[];
}

export interface BuildableTemplate {
  id: BuildableTemplateId;
  name: string;
  description: string;
  availability: 'buildable';
  starter: Construct;
  variants?: readonly TemplateVariant[];
  controls: readonly TemplateControlSection[];
}

export interface StoryOnlyTemplate {
  id: Extract<TemplateId, 'voice'>;
  name: string;
  description: string;
  availability: 'story-only';
}

export type TemplateEntry = BuildableTemplate | StoryOnlyTemplate;

// Shared section manifests, composed per template below. These are data, not
// components: the ids are the contract phase 3's panel binds to.
const IDENTITY: TemplateControlSection = { id: 'identity', paths: ['name'] };
const THEME: TemplateControlSection = { id: 'theme', paths: ['theme.accent', 'theme.mode', 'theme.unreadColor'] };
const HEADER: TemplateControlSection = { id: 'header', paths: ['header.title'] };
const HEADER_CHROME: TemplateControlSection = {
  id: 'header',
  paths: ['header.title', 'header.themeToggle', 'header.actions'],
};
const EMPTY: TemplateControlSection = { id: 'empty', paths: ['empty.title', 'empty.description', 'empty.icon'] };
const HOME: TemplateControlSection = { id: 'home', paths: ['home'] };
const CAPABILITIES: TemplateControlSection = {
  id: 'capabilities',
  paths: [
    'capabilities.starters',
    'capabilities.attachments',
    'capabilities.history',
    'capabilities.conversations',
    'capabilities.reasoning',
    'capabilities.reasoningOpen',
  ],
};
const MESSAGE_ACTIONS: TemplateControlSection = {
  id: 'messageActions',
  paths: ['capabilities.messageActions.user', 'capabilities.messageActions.assistant'],
};
const SOURCES: TemplateControlSection = { id: 'sources', paths: ['capabilities.sources.strip'] };
const WIDGET_CHROME: TemplateControlSection = {
  id: 'widget',
  paths: ['widget.position', 'widget.launcherIcon', 'widget.defaultOpen'],
};
const ASIDE: TemplateControlSection = { id: 'aside', paths: ['aside.position', 'aside.width'] };
const COMPOSER_TRIGGERS: TemplateControlSection = {
  id: 'composerTriggers',
  paths: ['composer.triggers.slash', 'composer.triggers.mention'],
};
const SHELL: TemplateControlSection = { id: 'shell', paths: ['shell.commandPalette', 'shell.userMenu'] };
const PROVIDER: TemplateControlSection = { id: 'provider', paths: ['provider'] };

// ── Support widget — owner-widget fixture lineage (B-14), de-branded ────────
const widgetStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'support-widget',
  layout: 'widget',
  provider: { mode: 'mock' },
  header: { title: 'Support' },
  theme: { unreadColor: '#38BDF8', mode: 'system' },
  empty: {
    title: "Hi, we're here to help",
    description: 'Ask us about orders, refunds, and more.',
  },
  home: {
    greeting: { title: 'How can we help? 👋', subtitle: 'Orders, refunds, anything.' },
    recentConversation: true,
    links: [
      { label: 'Help center', href: 'https://ui.kitn.ai', description: 'Guides and FAQs', icon: 'book-open' },
    ],
  },
  // States the kit default loudly (the anchored-on-the-default convention,
  // same as research's sources.strip) so the template's chrome fact is
  // visible/editable in its own JSON.
  widget: { position: 'bottom-end' },
  capabilities: {
    starters: ["Where's my order?", 'Request a refund'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
  },
};

// ── In-app assistant — builder-in-app-assistant.stories.tsx lineage ─────────
const inAppAssistantStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'in-app-assistant',
  layout: 'aside',
  provider: { mode: 'mock' },
  header: { title: 'Assistant' },
  theme: { accent: '#0ea5e9', mode: 'system' },
  // codegen's own defaults, stated so the geometry is visible/editable.
  aside: { position: 'end', width: '380px' },
  capabilities: {
    starters: ['Deploy payments to production', 'Check the canary status'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
  },
};

// ── Assistant — builder-assistant.stories.tsx lineage ───────────────────────
const assistantStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'daily-assistant',
  layout: 'fullscreen',
  provider: { mode: 'mock' },
  header: { title: 'Assistant' },
  theme: { accent: '#7c3aed', mode: 'system' },
  empty: {
    title: 'What can I help with?',
    description: 'Ask anything, or start from a suggestion below.',
  },
  capabilities: {
    starters: ['Draft the Q3 board update', 'Summarize a document', 'Compare two options'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
  },
};

// ── Research — builder-research.stories.tsx lineage ─────────────────────────
const researchStarter: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'research-assistant',
  layout: 'fullscreen',
  provider: { mode: 'mock' },
  header: { title: 'Research' },
  theme: { accent: '#0f766e', mode: 'system' },
  capabilities: {
    starters: ['How does the wire adapter work?', 'What are message parts?'],
    attachments: { accept: ['application/pdf'] },
    history: { persistence: 'local' },
    // The template's defining fact, stated even though it matches the emit
    // default (B-4): the row already renders; strip: true is the visible
    // switch this template exists around.
    sources: { strip: true },
    // "assistant-style actions" (B-13) — the owner's A3 default matrix
    // (builder-message-actions.tsx: user Edit on; assistant
    // Copy/Like/Dislike on).
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
};

// ── Workspace — builder-workspace.stories.tsx lineage ───────────────────────
// The base starter is the artifact-preview shape; the two variants (ruling
// 11, identities from builder-workspace-variants.tsx) differ only where the
// schema can see (C-6): name and starter prompts. Triggers are ON here and
// ONLY here — the ruling-8 default-on matrix IS this data (B-14); there is
// no separate matrix field to drift.
const workspaceTriggers: NonNullable<Construct['composer']> = {
  triggers: {
    slash: [
      { id: 'summarize', label: 'summarize', description: 'Summarize the thread so far' },
      { id: 'translate', label: 'translate', description: 'Translate the last message' },
    ],
    mention: [
      { id: 'researcher', label: 'researcher', description: 'Hands off to the research agent' },
      { id: 'coder', label: 'coder', description: 'Hands off to the coding agent' },
    ],
  },
};

const workspaceBase: Construct = {
  $schema: CONSTRUCT_SCHEMA_URL,
  name: 'build-workspace',
  layout: 'split',
  provider: { mode: 'mock' },
  header: {
    title: 'Workspace',
    themeToggle: true,
    // The story's Share/Deploy rows, mapped onto the kit Button's real
    // variant names (B-6a's enum): 'secondary' → outline, 'primary' → default.
    actions: [
      { label: 'Share', variant: 'outline' },
      { label: 'Deploy', variant: 'default' },
    ],
  },
  theme: { accent: '#ea580c', mode: 'system' },
  shell: { commandPalette: true, userMenu: { name: 'Ada', plan: 'Pro' } },
  composer: workspaceTriggers,
  capabilities: {
    starters: ['Build a pricing table', 'Add a dark mode toggle'],
    attachments: { accept: ['image/*'] },
    history: { persistence: 'local' },
  },
};

const workspaceArtifactPreview: Construct = {
  ...workspaceBase,
  name: 'artifact-workspace',
};

const workspaceAppPreview: Construct = {
  ...workspaceBase,
  name: 'app-workspace',
  capabilities: {
    ...workspaceBase.capabilities,
    starters: ['Build a landing page for a coffee shop', 'Make the hero work on mobile'],
  },
};

export const TEMPLATES: readonly TemplateEntry[] = [
  {
    id: 'widget',
    name: 'Support widget',
    description: 'A floating chat that lives in the corner of your site.',
    availability: 'buildable',
    starter: widgetStarter,
    controls: [IDENTITY, THEME, HEADER, HOME, CAPABILITIES, WIDGET_CHROME, PROVIDER],
  },
  {
    id: 'inAppAssistant',
    name: 'In-app assistant',
    description: 'An assistant docked inside your existing app.',
    availability: 'buildable',
    starter: inAppAssistantStarter,
    controls: [IDENTITY, THEME, HEADER, ASIDE, CAPABILITIES, PROVIDER],
  },
  {
    id: 'assistant',
    name: 'Assistant',
    description: 'A full-page assistant with a history of past conversations.',
    availability: 'buildable',
    starter: assistantStarter,
    controls: [IDENTITY, THEME, HEADER, EMPTY, CAPABILITIES, MESSAGE_ACTIONS, PROVIDER],
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Search-first answers with cited sources.',
    availability: 'buildable',
    starter: researchStarter,
    controls: [IDENTITY, THEME, HEADER, CAPABILITIES, SOURCES, MESSAGE_ACTIONS, PROVIDER],
  },
  {
    id: 'workspace',
    name: 'Workspace',
    description:
      'Chat drives a live work surface: previews, code, and artifacts build beside the conversation.',
    availability: 'buildable',
    starter: workspaceBase,
    variants: [
      {
        id: 'artifactPreview',
        name: 'Artifact preview beside chat',
        description: 'A code or rendered-output pane grows beside the conversation as you build.',
        starter: workspaceArtifactPreview,
      },
      {
        id: 'appPreview',
        name: 'App preview with device toggles',
        description:
          'A full browser-chrome preview of the running app, with desktop, tablet, and mobile views.',
        starter: workspaceAppPreview,
      },
    ],
    controls: [
      IDENTITY,
      THEME,
      HEADER_CHROME,
      SHELL,
      COMPOSER_TRIGGERS,
      CAPABILITIES,
      MESSAGE_ACTIONS,
      PROVIDER,
    ],
  },
  {
    id: 'voice',
    name: 'Voice',
    description: 'A voice-first assistant you talk to, push-to-talk and all.',
    availability: 'story-only',
  },
];

export function buildableTemplates(): readonly BuildableTemplate[] {
  return TEMPLATES.filter((t): t is BuildableTemplate => t.availability === 'buildable');
}

export function templateById(id: TemplateId): TemplateEntry | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
```

  Note on `theme.mode: 'system'` in every starter: `Construct` is `z.infer` (the OUTPUT type), and `theme.mode` carries `.default('system')` in the schema, so the output type REQUIRES `mode` whenever `theme` is present. Writing it explicitly is what makes `starter: Construct` typecheck AND makes the generated fixture JSON byte-stable against `safeParse` round-trips.

  Note on names/descriptions: the six `name`/`description` strings are byte-identical to the current `BUILDER_TEMPLATES` literals in `builder-start.tsx` — Task 8 deletes those literals and maps over this registry, and `builder-start.test.tsx`'s existing name/description queries must keep passing unchanged.

- [ ] **6.5 — run the test again, watch it go green:**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/templates.test.ts
```

If a starter fails `safeParse`, the failure message prints the zod issues — fix the STARTER (or discover a phase-1 schema mismatch and surface it), never loosen the test.

- [ ] **6.6 — the new dist entry.** Create `packages/ui/vite.config.construct-templates.ts`:

```ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// The template registry as its own ZOD-FREE entry
// (@kitn.ai/ui/construct/templates → dist/construct-templates.js). B-16:
// the existing ./construct entry is one bundled file with top-level
// z.discriminatedUnion side effects esbuild cannot tree-shake past (see
// create-kai's wizard.ts header), so the registry — structured data three
// surfaces read live — gets its own entry create-kai can bundle.
// bundleGraphProblem's zod ban in create-kai's build is the enforcement:
// if this entry ever grows a zod import, that build goes red on its own.
//
// No `external` config on purpose: templates.ts's only value import is the
// schema-url leaf, which inlines to a string. The emitted chunk must have
// ZERO imports — a zod import appearing here would surface in create-kai's
// metafile graph and fail its build.
//
// dts include mirrors vite.config.construct.ts's pattern (read its header):
// templates.d.ts's `import type { Construct } from './schema'` resolves to
// the schema.d.ts that config already emits earlier in the build chain.
export default defineConfig({
  plugins: [
    dts({
      include: [
        'src/agent-tooling/construct/templates.ts',
        'src/agent-tooling/construct/schema-url.ts',
      ],
      outDir: 'dist',
      entryRoot: 'src',
    }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/agent-tooling/construct/templates.ts'),
      formats: ['es'],
      fileName: () => 'construct-templates.js',
    },
  },
});
```

- [ ] **6.7 — wire the entry into `packages/ui/package.json`.** Three edits:

  1. In `"exports"`, immediately after the existing `"./construct"` key:

  ```jsonc
  "./construct/templates": {
    "types": "./dist/agent-tooling/construct/templates.d.ts",
    "default": "./dist/construct-templates.js"
  },
  ```

  2. In the `"build"` script, after `vite build --config vite.config.construct.ts`, insert:

  ```
  && vite build --config vite.config.construct-templates.ts
  ```

  3. In the `"build:api"` script, append the fixture generator (step 6.8):

  ```
  && node scripts/gen-construct-template-fixtures.mjs
  ```

- [ ] **6.8 — the fixture generator (B-15).** Create `packages/ui/scripts/gen-construct-template-fixtures.mjs`:

```js
// Writes each BUILDABLE template starter (and every variant starter) to
// src/agent-tooling/construct/fixtures/templates/<name>.construct.json —
// the §4-registered DERIVED COPY of templates.ts (B-15/B-18). The copy
// exists because verify-construct.mjs is an .mjs gate that reads JSON
// fixtures, not TS; verify:generated guards its drift (this generator runs
// in build:api), and verify:construct's fixture discovery then ejects/
// compiles/builds every starter on every gate run with zero new harness.
//
// Same `importTs` mechanism as gen-construct-schema.mjs (read its header):
// esbuild-bundle the TS module into a throwaway .mjs and import it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'gen-construct-template-fixtures-'));
  const bundle = join(tmp, 'bundle.mjs');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

const { buildableTemplates } = await importTs(
  join(PKG_ROOT, 'src/agent-tooling/construct/templates.ts'),
);

const OUT_DIR = join(PKG_ROOT, 'src/agent-tooling/construct/fixtures/templates');
mkdirSync(OUT_DIR, { recursive: true });

for (const template of buildableTemplates()) {
  const files = [
    [template.id, template.starter],
    ...(template.variants ?? []).map((v) => [`${template.id}.${v.id}`, v.starter]),
  ];
  for (const [name, starter] of files) {
    const out = join(OUT_DIR, `${name}.construct.json`);
    writeFileSync(out, `${JSON.stringify(starter, null, 2)}\n`);
    console.log(`  · wrote ${out}`);
  }
}
```

Run it once and commit its output (7 files — `verify-generated-sync` refuses untracked artifacts):

```bash
cd packages/ui && node scripts/gen-construct-template-fixtures.mjs && cd ../..
git add packages/ui/src/agent-tooling/construct/fixtures/templates
```

- [ ] **6.9 — register the fixtures with `verify:generated`.** In `packages/ui/scripts/verify-generated-sync.mjs`, extend the `GENERATED` array after the two `construct.v1.schema.json` entries:

```js
  // The template registry's derived fixture JSONs (B-15) — written by
  // scripts/gen-construct-template-fixtures.mjs in build:api, read by
  // verify-construct.mjs's recursive fixture discovery. One file per
  // buildable starter + variant; a template removed from templates.ts
  // leaves its file's sentinel standing, which is this guard's red.
  { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/widget.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/inAppAssistant.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/assistant.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/research.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/workspace.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/workspace.artifactPreview.construct.json', probe: 'overwrite' },
  { file: 'packages/ui/src/agent-tooling/construct/fixtures/templates/workspace.appPreview.construct.json', probe: 'overwrite' },
```

(This is a hand list, like the two schema-copy entries above it — the guard's own precondition loop makes a missing/renamed file a loud failure, and the sentinel makes a dropped generator output a loud failure. The list cannot rot silently in either direction.)

- [ ] **6.10 — recursive fixture discovery in `verify:construct` (B-15).** In `packages/ui/scripts/verify-construct.mjs`, replace `namedFixtures()` (currently a flat `readdirSync(FIXTURES_DIR)` at ~line 203):

```js
const FIXTURES_DIR = join(PKG_ROOT, 'src/agent-tooling/construct/fixtures');
function namedFixtures() {
  // recursive: true — the template starters live one level down in
  // fixtures/templates/ (generated by build:api from templates.ts, B-15);
  // discovered, never listed, same as the flat fixtures always were.
  return readdirSync(FIXTURES_DIR, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.construct.json'))
    .map((f) => ({
      fixture: JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf8')),
      layout: null,
      isAllCaps: false,
      // path separators flattened so the cell name stays a plain dir name
      named: f.replaceAll('/', '-').replaceAll('\\', '-'),
    }));
}
```

Also update comment line 48 in the same file's header ("every `*.construct.json` in the fixtures dir, discovered, never listed") to say "recursively discovered".

- [ ] **6.11 — coupling-map §4 entry (B-18).** Append this row to the table in `docs/coupling-map.md` §4 ("Derived lists"), after the `TAG_RE`/`CONSTRUCT_TAG_RE` row:

```markdown
| The template registry (`packages/ui/src/agent-tooling/construct/templates.ts`) — a leaf: data + type-only imports, no zod, so the browser builder, the Node MCP tool and create-kai's bundle all read ONE module | four consumers: the generated fixture JSONs under `src/agent-tooling/construct/fixtures/templates/` (written by `scripts/gen-construct-template-fixtures.mjs` in build:api), create-kai's template shape axis (`shapeAxis` maps `buildableTemplates()`), `BuilderStart`'s card list (`BUILDER_TEMPLATES` maps `TEMPLATES`), and the MCP `construct` tool's template statements | Adding a buildable template grows the wizard's menu, the builder's card grid and the MCP statements on its own, and its starter is ejected/compiled/built by `verify:construct` the moment build:api writes its fixture. The one DELIBERATE COPY is the fixture JSONs — they exist because `verify-construct.mjs` is an `.mjs` gate that reads JSON fixtures, not TS; a new fixture must also be listed in `verify-generated-sync.mjs`'s `GENERATED` (a missing entry is that guard's own loud precondition failure, never a silent skip) | `templates.test.ts` (every starter/variant safeParsed against the live `ConstructSchema`; the leaf's import discipline; consumers import, never restate) · `verify:generated` (fixture drift, sentinel-proofed) · `verify:construct` (the starters actually eject/compile/build) · create-kai's `bundleGraphProblem` (the entry stays zod-free) |
```

- [ ] **6.12 — task-6 gates, in order (the spec's list verbatim: unit, typecheck, build, verify:generated, verify:construct, verify:pack):**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui run typecheck
nx build ui --skip-nx-cache
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run verify:construct   # minutes; template fixtures now ride — check its printed cell list names the 7 template fixtures
pnpm --filter @kitn.ai/ui run verify:pack        # the new dist entry ships inside the ceiling
```

Read `verify:construct`'s own printed counts — never restate them. If `verify:pack` trips the ceiling, that is a finding to surface, not a number to raise quietly.

- [ ] **6.13 — commit:**

```bash
git add packages/ui/src/agent-tooling/construct/schema-url.ts \
        packages/ui/src/agent-tooling/construct/schema.ts \
        packages/ui/src/agent-tooling/construct/templates.ts \
        packages/ui/src/agent-tooling/construct/templates.test.ts \
        packages/ui/src/agent-tooling/construct/fixtures/templates \
        packages/ui/vite.config.construct-templates.ts \
        packages/ui/vite.config.construct.ts \
        packages/ui/scripts/gen-construct-template-fixtures.mjs \
        packages/ui/scripts/verify-generated-sync.mjs \
        packages/ui/scripts/verify-construct.mjs \
        packages/ui/package.json \
        docs/coupling-map.md
git commit -m "feat(construct): template registry leaf + ./construct/templates entry + generated starter fixtures

One leaf module (templates.ts, type-only Construct import, no zod) read by
the builder, the MCP tool and create-kai. Buildable starters ride
verify:construct as build:api-generated fixtures guarded by verify:generated;
voice is story-only, Multi-mode absent (C-4). Coupling-map §4 records the
one deliberate copy (fixture JSONs).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg2uqtxknh9xtCcZPAerER"
```

---

## Task 7 — consumer a: create-kai's template shape axis + starter seeding

**Files:**
- Edit: `packages/create-kai/src/wizard.ts` (ShapeId, `shapeAxis`, `WizardAnswers`, `composeConstruct`, `emitConstruct`, `runWizard`, `WIZARD_REGISTRY`, `constructTagName` signature)
- Edit: `packages/create-kai/src/index.ts` (routing comment + fallback stay; no structural change — verify)
- Edit: `packages/create-kai/test/wizard.test.ts`
- Edit: `packages/create-kai/test/menu-honesty.test.ts`
- (`packages/create-kai/src/axes.ts` is NOT edited — `answerAxis`/`decideAxis`/`AxisIo` are reused as-is, the "ask or state" law unchanged.)

**Interfaces:**

```ts
// wizard.ts — the grown shape axis
import { buildableTemplates, type BuildableTemplateId } from '@kitn.ai/ui/construct/templates';

export type ShapeId = BuildableTemplateId | 'scratch' | 'app';

export interface WizardAnswers {
  name: string;
  shape: Exclude<ShapeId, 'app'>;
  /** undefined = keep the starter's header untouched; '' = no header title. */
  headerTitle?: string;
  /** undefined = keep the starter's home untouched; false removes it; true (re)writes the greeting. */
  home?: boolean;
  homeGreeting?: string;
  /** [] = keep the starter's list (the wizard cannot clear a list it did not write — stated). */
  starters: string[];
  attachments: boolean;
  history: boolean;
  /** undefined = keep the starter's accent untouched; '' = no accent. */
  accent?: string;
}

export function constructTagName(projectName: string, kind: 'widget' | 'chat'): string;
```

Runtime import note (B-16): `buildableTemplates` is a VALUE import of `@kitn.ai/ui/construct/templates`. esbuild bundles it into `dist/index.js` (the workspace dep resolves to `packages/ui/dist/construct-templates.js`, a zero-import chunk — Task 6.6). `bundleGraphProblem` grades the metafile: no `node_modules/zod/`, no `agent-tooling/mcp/` — the build itself is the proof. The `__DEFINE__` mechanism is NOT used here (it is for single build-time facts; the registry is structured data). create-kai's build and tests both need `packages/ui` built first — already true today (`scripts/build.mjs` line 47 imports `@kitn.ai/ui/construct`; `test/wizard.test.ts` line 24 imports it too).

**Breaking CLI surface, decided loudly:** the shape ids `'fullscreen'` is RETIRED — `--shape fullscreen` now fails at the existing validation in `index.ts` ("unknown shape 'fullscreen'. Available: widget, inAppAssistant, assistant, research, workspace, scratch, app"), which lists the replacements. `'widget'` keeps working (it is now the Support-widget template — same layout, richer starter). Pre-1.0; the commit is `feat!`.

### Steps

- [ ] **7.1 — WIZARD_REGISTRY first: the drift test is already red.** Phase 1 added six schema keys create-kai has no entries for, so `test/wizard.test.ts`'s registry-drift describe fails the moment you run it against the phase-1 kit. Confirm the red:

```bash
pnpm --filter @kitn.ai/ui run build   # if not already built this session (skip if task 6's gates just ran)
pnpm --filter create-kai run test -- wizard
```

Expected failures: `top-level key "aside" is not classified…`, same for `composer`, `shell`, and `capabilities key "messageActions"…`, `"sources"…`. (`header`'s entry exists; its nested `themeToggle`/`actions` are below the registry's stated top-level+capabilities grain — see `WIZARD_REGISTRY`'s own docblock.)

- [ ] **7.2 — add the six entries** to `WIZARD_REGISTRY` in `packages/create-kai/src/wizard.ts` (every reason decides loudly, per B-17a):

```ts
  aside: {
    status: 'not-asked',
    reason:
      'aside geometry (position/width) is seeded by the in-app-assistant template starter and passes through untouched; hand-edit the construct file to move or resize the rail',
  },
  composer: {
    status: 'not-asked',
    reason:
      'composer triggers are template data (on for Workspace only — the ruling-8 default matrix lives in the registry starters); the wizard passes the starter through untouched and never prompts for trigger lists',
  },
  shell: {
    status: 'not-asked',
    reason:
      'shell chrome (command palette, user menu) is template data seeded by the Workspace starter; the wizard passes it through untouched — edit the construct file to change it',
  },
  'capabilities.messageActions': {
    status: 'not-asked',
    reason:
      'per-role action lists are template data (the research starter states the owner-default matrix); the wizard passes the starter through untouched — hand-edit or use the builder to reorder/toggle actions',
  },
  'capabilities.sources': {
    status: 'not-asked',
    reason:
      "the sources strip is the research template's defining fact, stated in its starter; the wizard passes it through untouched",
  },
```

Re-run `pnpm --filter create-kai run test -- wizard`: the drift describe goes green; other wizard tests still pass (nothing else changed yet).

- [ ] **7.3 — write the new failing tests.** In `packages/create-kai/test/wizard.test.ts`, add (imports grow by `buildableTemplates` from `'@kitn.ai/ui/construct/templates'`):

```ts
describe('shapeAxis: the buildable-template list + scratch + app (B-17a)', () => {
  it('derives its template options from the registry, in registry order, then scratch, then app', () => {
    const axis = shapeAxis();
    expect(axis.options.map((o) => o.id)).toEqual([
      ...buildableTemplates().map((t) => t.id),
      'scratch',
      'app',
    ]);
  });
  it('labels/hints come from the registry, never restated', () => {
    const axis = shapeAxis();
    for (const t of buildableTemplates()) {
      const opt = axis.options.find((o) => o.id === t.id)!;
      expect(opt.label).toBe(t.name);
      expect(opt.hint).toBe(t.description);
    }
  });
  it('is a real choice with a reason (the ask-or-state law needs both)', () => {
    expect(decideAxis(shapeAxis()).ask).toBe(true);
    expect(shapeAxis().because.length).toBeGreaterThan(10);
  });
});

describe('composeConstruct: template seeding (B-17a)', () => {
  /** The non-interactive answers for a shape — every "keep" sentinel. */
  const keep = (shape: Exclude<ShapeId, 'app'>, name = 'my-proj'): WizardAnswers => {
    const starter = shape === 'scratch' ? undefined : buildableTemplates().find((t) => t.id === shape)!.starter;
    return {
      name,
      shape,
      headerTitle: undefined,
      home: undefined,
      homeGreeting: '',
      starters: [],
      attachments: Boolean(starter?.capabilities?.attachments),
      history: Boolean(starter?.capabilities?.history && starter.capabilities.history.persistence !== 'none'),
      accent: undefined,
    };
  };

  for (const t of buildableTemplates()) {
    it(`${t.id}: unanswered answers round-trip the starter unchanged except $schema/name`, () => {
      const out = composeConstruct(keep(t.id)) as Record<string, unknown>;
      const expected = structuredClone(t.starter) as Record<string, unknown>;
      expected.$schema = CONSTRUCT_SCHEMA_URL;
      expected.name = out.name; // asserted separately below
      expect(out).toEqual(expected);
      expect(ConstructSchema.safeParse(out).success).toBe(true);
    });
  }

  it('the emitted name derives from the PROJECT name and the starter layout, not the starter name', () => {
    const out = composeConstruct(keep('widget', 'acme')) as { name: string };
    expect(out.name).toBe('acme-widget');
    const chat = composeConstruct(keep('research', 'acme')) as { name: string };
    expect(chat.name).toBe('acme-chat');
  });

  it('asked answers OVERRIDE starter fields; blank text answers CLEAR them', () => {
    const answers = { ...keep('assistant'), headerTitle: 'My Bot', accent: '' };
    const out = composeConstruct(answers) as { header?: { title?: string }; theme?: { accent?: string; mode: string } };
    expect(out.header?.title).toBe('My Bot');
    expect(out.theme?.accent).toBeUndefined();
    expect(out.theme?.mode).toBe('system'); // mode survives an accent clear
  });

  it('history off strips history AND conversations (the schema forbids the orphan)', () => {
    const out = composeConstruct({ ...keep('assistant'), history: false }) as {
      capabilities?: Record<string, unknown>;
    };
    expect(out.capabilities?.history).toBeUndefined();
    expect(out.capabilities?.conversations).toBeUndefined();
    expect(ConstructSchema.safeParse(out).success).toBe(true);
  });

  it("history on over a starter WITHOUT it gets the local+conversations pair; research's history-without-conversations shape is preserved", () => {
    const scratch = composeConstruct({ ...keep('scratch'), history: true }) as {
      capabilities?: Record<string, unknown>;
    };
    expect(scratch.capabilities?.history).toEqual({ persistence: 'local' });
    expect(scratch.capabilities?.conversations).toBe(true);
    const research = composeConstruct(keep('research')) as { capabilities?: Record<string, unknown> };
    expect(research.capabilities?.history).toEqual({ persistence: 'local' });
    expect(research.capabilities?.conversations).toBeUndefined();
  });

  it('scratch is the bare fullscreen construct — everything off', () => {
    const out = composeConstruct(keep('scratch', 'my-proj'));
    expect(out).toEqual({
      $schema: CONSTRUCT_SCHEMA_URL,
      name: 'my-proj-chat',
      layout: 'fullscreen',
      provider: { mode: 'mock' },
    });
    expect(ConstructSchema.safeParse(out).success).toBe(true);
  });
});
```

Also update the EXISTING tests this change moves:
  - the `shapeAxis: a real 3-way choice` describe (test/wizard.test.ts:547) is replaced by the new derived describe above;
  - every old `composeConstruct`/`runWizard` case built on the retired `'fullscreen'` shape id switches to `'scratch'` (bare behavior, byte-identical output) or `'assistant'` (template behavior) — pick per what each test asserts;
  - the `runWizard` state/ask correspondence describe (line 166+) grows the conditional `'Template'` and `'Variant'` state labels (step 7.5) and the starter-seeded `initial` values on `io.text`/`io.confirm` spies;
  - the `constructTagName` property test keeps running both kinds — its second argument becomes `'widget' | 'chat'` at the call sites (`constructTagName(name, 'widget')` / `constructTagName(name, 'chat')`).

Run and watch the new describes fail:

```bash
pnpm --filter create-kai run test -- wizard
```

- [ ] **7.4 — implement `wizard.ts`.** The full set of edits:

  1. Imports + ShapeId (replacing `export type ShapeId = 'widget' | 'fullscreen' | 'app';` at line 70):

```ts
import { buildableTemplates, type BuildableTemplateId } from '@kitn.ai/ui/construct/templates';

export type ShapeId = BuildableTemplateId | 'scratch' | 'app';
```

  2. `shapeAxis()` (replacing the current three-option body, keeping the `Axis` contract and the docblock's routing story updated):

```ts
export function shapeAxis(): Axis {
  const options: AxisOption[] = [
    // Derived from the registry (B-17a): labels/hints are the templates'
    // own names/one-liners, never restated. Only buildable templates are
    // offered — menu-honesty (voice stays a Labs story card).
    ...buildableTemplates().map((t) => ({ id: t.id, label: t.name, hint: t.description })),
    {
      id: 'scratch',
      label: 'Start from scratch',
      hint: 'a bare chat construct, everything off — you can switch to a template later',
    },
    {
      id: 'app',
      label: 'Full app',
      hint: 'a scaffolded project with routing and a shell, not just a chat construct',
    },
  ];
  return {
    id: 'shape',
    label: 'Shape',
    question: 'What are you building?',
    options,
    because:
      'each shape needs a different tool: the templates and "scratch" compose a construct ' +
      '(this wizard, seeded from the template registry), while "app" needs the project ' +
      'scaffold this wizard does not build',
  };
}
```

  3. The starter lookup (new, below `shapeAxis`):

```ts
/**
 * The starter construct a shape seeds the wizard with. Templates come from
 * the registry (deep-cloned — answers must never mutate registry data);
 * 'scratch' is the bare fullscreen construct. The BASE Workspace starter is
 * used, never a variant: the CLI asks no variant question — the variants
 * are the builder's second screen (B-23), stated out loud in runWizard.
 */
function wizardStarter(shape: Exclude<ShapeId, 'app'>): Record<string, unknown> {
  if (shape === 'scratch') {
    return { $schema: SCHEMA_URL, name: '', layout: 'fullscreen', provider: { mode: 'mock' } };
  }
  const template = buildableTemplates().find((t) => t.id === shape);
  if (!template) throw new Error(`no buildable template '${shape}' in the registry`);
  return structuredClone(template.starter) as unknown as Record<string, unknown>;
}
```

  4. `constructTagName` — the second parameter becomes the suffix kind (the shape union no longer implies a layout):

```ts
export function constructTagName(projectName: string, kind: 'widget' | 'chat'): string {
  if (CONSTRUCT_TAG_RE.test(projectName)) return projectName;
  let base = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!/^[a-z]/.test(base)) {
    base = base.length > 0 ? `k-${base}` : 'k';
  }
  return `${base}-${kind}`;
}
```

  5. `composeConstruct` — starter-merge semantics (asked answers OVERRIDE; `undefined` keeps; the whole body replaces the current build-from-nothing version):

```ts
export function composeConstruct(a: WizardAnswers): unknown {
  const construct = wizardStarter(a.shape) as Record<string, unknown> & {
    header?: Record<string, unknown> & { title?: string };
    theme?: Record<string, unknown> & { accent?: string };
    home?: Record<string, unknown> & { greeting?: Record<string, unknown> };
    capabilities?: Record<string, unknown> & { history?: { persistence?: string } };
  };

  construct.$schema = SCHEMA_URL;
  construct.name = constructTagName(a.name, construct.layout === 'widget' ? 'widget' : 'chat');

  if (a.headerTitle !== undefined) {
    if (a.headerTitle.length > 0) {
      construct.header = { ...construct.header, title: a.headerTitle };
    } else if (construct.header) {
      delete construct.header.title;
      if (Object.keys(construct.header).length === 0) delete construct.header;
    }
  }

  if (a.accent !== undefined) {
    if (a.accent.length > 0) {
      construct.theme = { mode: 'system', ...construct.theme, accent: a.accent };
    } else if (construct.theme) {
      delete construct.theme.accent;
      if (Object.keys(construct.theme).length === 0) delete construct.theme;
    }
  }

  if (a.home !== undefined) {
    if (a.home) {
      const title =
        a.homeGreeting && a.homeGreeting.length > 0 ? a.homeGreeting : DEFAULT_HOME_GREETING_TITLE;
      construct.home = { ...construct.home, greeting: { ...construct.home?.greeting, title } };
    } else {
      delete construct.home;
    }
  }

  const capabilities: Record<string, unknown> = { ...construct.capabilities };
  if (a.starters.length > 0) capabilities.starters = a.starters.slice(0, 6);
  if (a.attachments) {
    capabilities.attachments = capabilities.attachments ?? { accept: DEFAULT_ATTACHMENTS_ACCEPT };
  } else {
    delete capabilities.attachments;
  }
  if (a.history) {
    // A starter that already persists keeps its exact shape (research keeps
    // history WITHOUT a conversation list — its own defining shape); only
    // history created from nothing gets the local+conversations pair.
    if (!construct.capabilities?.history || construct.capabilities.history.persistence === 'none') {
      capabilities.history = { persistence: 'local' };
      capabilities.conversations = true;
    }
  } else {
    delete capabilities.history;
    // the schema rejects conversations with nowhere to persist — strip both.
    delete capabilities.conversations;
  }
  if (Object.keys(capabilities).length > 0) construct.capabilities = capabilities;
  else delete construct.capabilities;

  return construct;
}
```

  6. `emitConstruct` — the name comes off the composed construct (one derivation site; the previous duplicate `constructTagName` call goes away):

```ts
  const construct = composeConstruct(answers) as { name: string };
  const fileName = `${answers.name}.construct.json`;
  const file = path.join(dir, fileName);
  await writeFile(file, `${JSON.stringify(construct, null, 2)}\n`, 'utf8');

  return {
    file,
    devCommand: `npx @kitn.ai/ui dev ${fileName}`,
    constructName: construct.name,
  };
```

  7. `runWizard` — starter-seeded initials, keep-sentinels in non-interactive mode, and the new stated lines (asked-or-stated law: everything decided for the user is printed; blank keeps the starter, which the Template line says out loud):

```ts
export async function runWizard(
  shape: Exclude<ShapeId, 'app'>,
  name: string,
  io: WizardIo,
  nonInteractive: boolean,
): Promise<WizardAnswers> {
  const starter = wizardStarter(shape) as {
    header?: { title?: string };
    theme?: { accent?: string };
    home?: { greeting?: { title?: string } };
    capabilities?: { attachments?: unknown; history?: { persistence?: string } };
  };
  const starterHasHistory = Boolean(
    starter.capabilities?.history && starter.capabilities.history.persistence !== 'none',
  );

  if (nonInteractive) {
    // Nothing asked OR stated (answerAxis's own non-interactive rule). All
    // "keep" sentinels — composeConstruct round-trips the starter unchanged.
    return {
      name,
      shape,
      headerTitle: undefined,
      home: undefined,
      homeGreeting: '',
      starters: [],
      attachments: Boolean(starter.capabilities?.attachments),
      history: starterHasHistory,
      accent: undefined,
    };
  }

  io.state('Schema', `${SCHEMA_URL} — every construct the wizard emits stamps this so tooling can validate it`);
  io.state('Name', `${name} — the project directory already fixed this`);
  io.state('Provider', 'mock — a keyless first run; switch providers in the construct file after');
  if (shape !== 'scratch') {
    io.state(
      'Template',
      `${shape} — seeded from the registry starter; each answer below overrides its field, and a blank answer keeps the template's value`,
    );
  }
  if (shape === 'workspace') {
    io.state(
      'Variant',
      'the base Workspace starter — pick artifact-preview or app-preview in the builder, or hand-edit the file',
    );
  }

  const headerTitle = await io.text('Header title? (leave blank for none)', starter.header?.title ?? '');
  const accent = await io.text('Accent color? (leave blank for the kit default)', starter.theme?.accent ?? '');
  const home = await io.confirm('Show a home/greeting screen?', Boolean(starter.home));
  const homeGreeting = home
    ? await io.text(
        'Greeting title? (leave blank for the default)',
        starter.home?.greeting?.title ?? DEFAULT_HOME_GREETING_TITLE,
      )
    : '';
  const starters = await io.multilineList(
    "Starter prompts (comma-separated, up to 6, blank to keep the template's)",
  );
  const attachments = await io.confirm('Allow file attachments?', Boolean(starter.capabilities?.attachments));
  const history = await io.confirm(
    'Persist conversation history in this browser?',
    starterHasHistory || shape === 'scratch',
  );

  if (history && !starterHasHistory) {
    io.state('Conversations', 'enabled — turned on automatically because history is on');
  }

  return {
    name,
    shape,
    headerTitle,
    home,
    homeGreeting,
    starters: starters.slice(0, 6),
    attachments,
    history,
    accent,
  };
}
```

  Also update `WIZARD_REGISTRY`'s reasons for the keys whose behavior changed — `layout` (now fixed by the chosen TEMPLATE's starter, still decided by the always-asked shape axis upstream), `theme`/`header`/`home`/`capabilities.starters` (each now "…a blank answer keeps the template starter's value"), and `capabilities.conversations` (now "kept exactly as the template starter states it; created only when the wizard turns history on from nothing"). The file-header paragraph about `ShapeId` routing updates from "widget | fullscreen" to "any buildable template id or scratch".

  8. `index.ts`: no structural change — `runConstructFlow`'s parameter type `Exclude<ShapeId, 'app'>` widens automatically, the `--shape` validation already lists `shapes.options` ids, and `fallback: 'app'` stays. Update only the section-2 comment ("a real three-way choice (widget/fullscreen/app)" → "the template list + scratch + app, derived from the registry").

- [ ] **7.5 — run the wizard suite until green:**

```bash
pnpm --filter create-kai run test -- wizard
```

Fix implementation, not tests, unless a test still encodes the retired `'fullscreen'` id.

- [ ] **7.6 — menu-honesty growth.** Append to `packages/create-kai/test/menu-honesty.test.ts`:

```ts
import { CONSTRUCT_SCHEMA_URL, ConstructSchema } from '@kitn.ai/ui/construct';
import { composeConstruct, runWizard, shapeAxis } from '../src/wizard';
import type { ShapeId } from '../src/wizard';

describe('every shape the axis offers actually composes (the wizard-side menu-honesty rule)', () => {
  const constructShapes = shapeAxis()
    .options.map((o) => o.id)
    .filter((id): id is Exclude<ShapeId, 'app'> => id !== 'app');

  it('offers at least one construct shape, so the loop below is not vacuous', () => {
    expect(constructShapes.length).toBeGreaterThan(0);
  });

  for (const shape of constructShapes) {
    it(`${shape}: the non-interactive answers compose a construct the REAL schema accepts`, async () => {
      const io = {
        text: async () => '',
        confirm: async () => false,
        multilineList: async () => [],
        state: () => {},
      };
      const answers = await runWizard(shape, 'menu-app', io, true);
      const construct = composeConstruct(answers) as { $schema?: string };
      const parsed = ConstructSchema.safeParse(construct);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
      expect(construct.$schema).toBe(CONSTRUCT_SCHEMA_URL);
    });
  }
});
```

(This drives the axis's OWN option list through the generator against the live schema — the same subject-is-the-menu shape the file's header demands. A template whose starter stops validating fails here whether or not anyone remembered it.)

- [ ] **7.7 — task-7 gates (the spec's list verbatim: create-kai's own test + build — bundleGraphProblem = the zod ban's proof — plus typecheck):**

```bash
pnpm --filter @kitn.ai/ui run build      # create-kai's build + tests resolve @kitn.ai/ui/construct/templates from dist (skip if already built since task 6)
pnpm --filter create-kai run build       # bundleGraphProblem grades the metafile: zod ban holds with the registry bundled in
pnpm --filter create-kai run test
pnpm --filter create-kai run typecheck
```

Read the build's printed `bundle dist/index.js <size> kB` line: the registry is a few KB of data — if the size jumped by hundreds of KB, the graph pulled something it must not, and `bundleGraphProblem` should already have said so.

- [ ] **7.8 — commit:**

```bash
git add packages/create-kai/src/wizard.ts packages/create-kai/src/index.ts \
        packages/create-kai/test/wizard.test.ts packages/create-kai/test/menu-honesty.test.ts
git commit -m "feat(create-kai)!: template shape axis over the registry, starter-seeded wizard

shapeAxis derives its options from buildableTemplates() (+ scratch + app);
answers OVERRIDE the seeded starter, blanks keep it (stated). --shape
fullscreen is retired (assistant/scratch replace it; the error lists the
options). WIZARD_REGISTRY classifies the six phase-1 keys, all not-asked
with loud reasons.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg2uqtxknh9xtCcZPAerER"
```

---

## Task 8 — consumers b + c: BuilderStart maps the registry; the MCP tool states it

**Files:**
- Edit: `packages/ui/src/components/builder-start.tsx`
- Edit: `packages/ui/src/components/builder-start.test.tsx`
- Edit: `packages/ui/src/agent-tooling/mcp/tools/construct.ts`
- Edit: `packages/ui/src/agent-tooling/mcp/construct-tool.test.ts`

**Interfaces:**

```ts
// builder-start.tsx — derived, not restated (B-17b)
import { TEMPLATES, type TemplateId } from '../agent-tooling/construct/templates';

export type BuilderTemplateId = TemplateId | 'scratch';
export type BuilderCardTemplateId = TemplateId;

export interface BuilderTemplate {
  id: BuilderCardTemplateId;
  name: string;
  description: string;
}

/** All six cards — the Labs story's list (B-13: the start screen keeps six). */
export const BUILDER_TEMPLATES: readonly BuilderTemplate[];
/** The buildable five — what a real product surface renders (menu-honesty). */
export const BUILDABLE_BUILDER_TEMPLATES: readonly BuilderTemplate[];

export interface BuilderStartProps {
  value?: BuilderTemplateId;
  onSelect: (id: BuilderTemplateId) => void;
  /** Which cards to render. Defaults to BUILDER_TEMPLATES (all six — the
   *  story). A product surface passes BUILDABLE_BUILDER_TEMPLATES. */
  templates?: readonly BuilderTemplate[];
  class?: string;
}
```

(Importing `agent-tooling/construct/templates` from `components/` is safe: the module is a leaf — data + a string const — with no zod and no Node API; `builder-start.tsx` is story-side only, exported from no barrel, so no dts-boundary or bundle concern moves.)

### Steps

- [ ] **8.1 — failing tests first.** In `packages/ui/src/components/builder-start.test.tsx`, add:

```ts
import { TEMPLATES } from '../agent-tooling/construct/templates';
import { BUILDABLE_BUILDER_TEMPLATES } from './builder-start';

describe('BuilderStart derives from the template registry (B-17b)', () => {
  it('BUILDER_TEMPLATES is the registry, id/name/description, in registry order — never restated', () => {
    expect(BUILDER_TEMPLATES).toEqual(
      TEMPLATES.map(({ id, name, description }) => ({ id, name, description })),
    );
  });

  it('BUILDABLE_BUILDER_TEMPLATES filters availability === "buildable" (voice stays a story card only)', () => {
    expect(BUILDABLE_BUILDER_TEMPLATES.map((t) => t.id)).toEqual(
      TEMPLATES.filter((t) => t.availability === 'buildable').map((t) => t.id),
    );
    expect(BUILDABLE_BUILDER_TEMPLATES.some((t) => t.id === 'voice')).toBe(false);
  });

  it('a product surface passing the buildable list renders five cards and no Voice', () => {
    render(() => <BuilderStart templates={BUILDABLE_BUILDER_TEMPLATES} onSelect={vi.fn()} />);
    expect(screen.queryByText('Voice')).not.toBeInTheDocument();
    for (const t of BUILDABLE_BUILDER_TEMPLATES) {
      expect(screen.getByText(t.name)).toBeInTheDocument();
    }
  });

  it('the default (story) rendering still shows all six', () => {
    render(() => <BuilderStart onSelect={vi.fn()} />);
    expect(screen.getByText('Voice')).toBeInTheDocument();
    expect(BUILDER_TEMPLATES).toHaveLength(6);
  });
});
```

Run and watch it fail (`BUILDABLE_BUILDER_TEMPLATES` does not exist; `BUILDER_TEMPLATES` is still a hand list):

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-start.test.tsx
```

- [ ] **8.2 — implement `builder-start.tsx`.** Replace the hand-coded union + `BUILDER_TEMPLATES` literal array (lines 21–77) with the derived versions:

```ts
import { TEMPLATES, type TemplateId } from '../agent-tooling/construct/templates';

// 'scratch' is NOT a template — no illustration, no card, no registry entry.
// (unchanged comment about the scratch row …)
export type BuilderTemplateId = TemplateId | 'scratch';

/** The template ids that DO have a card — every registry id. */
export type BuilderCardTemplateId = TemplateId;

export interface BuilderTemplate {
  id: BuilderCardTemplateId;
  name: string;
  description: string;
}

/** All six cards, DERIVED from the template registry (B-17b) — id, name and
 *  one-liner are the registry's own; this module adds only the
 *  illustrations, which stay component-side keyed by id (SVGs are not
 *  registry data). The Labs story renders all six (T-1a); a real product
 *  surface renders BUILDABLE_BUILDER_TEMPLATES instead (menu-honesty). */
export const BUILDER_TEMPLATES: readonly BuilderTemplate[] = TEMPLATES.map(
  ({ id, name, description }) => ({ id, name, description }),
);

export const BUILDABLE_BUILDER_TEMPLATES: readonly BuilderTemplate[] = TEMPLATES.filter(
  (t) => t.availability === 'buildable',
).map(({ id, name, description }) => ({ id, name, description }));
```

Add the `templates?` prop to `BuilderStartProps` (docblock as in Interfaces above) and change the grid's loop source:

```tsx
      <For each={props.templates ?? BUILDER_TEMPLATES}>
```

`TEMPLATE_ILLUSTRATIONS` stays exactly where it is (`Record<BuilderCardTemplateId, () => JSX.Element>` still covers all six ids — the type now derives from the registry, so a seventh registry entry fails HERE at typecheck until it gets a drawing, which is the correct loud failure).

- [ ] **8.3 — run builder-start tests green** (the pre-existing six-card/name/description/keyboard tests must pass UNCHANGED — the derived names are byte-identical to the old literals; if one differs, fix the registry copy in Task 6, not the test):

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-start.test.tsx src/components/builder-workspace-variants.test.tsx
```

- [ ] **8.4 — MCP tool: failing tests first.** In `packages/ui/src/agent-tooling/mcp/construct-tool.test.ts`, add:

```ts
import { buildableTemplates } from '../construct/templates';

describe('starter templates come from the registry (B-17c)', () => {
  it('a clearly implied intent returns THAT template starter, stated', async () => {
    const r = await constructTool.handler({ intent: 'a research tool with cited sources' });
    const out = text(r);
    expect(out).toContain('"layout": "fullscreen"');
    expect(out).toContain('"strip": true'); // research's defining fact rides along
    expect(out).toMatch(/template: research/i); // stated, not asked
    expect(out).not.toMatch(/which template/i);
  });

  it('an unclear intent lists the buildable templates and asks which', async () => {
    const r = await constructTool.handler({ intent: 'something for my site' });
    const out = text(r);
    for (const t of buildableTemplates()) {
      expect(out).toContain(t.id);
      expect(out).toContain(t.description);
    }
    expect(out).toMatch(/which template/i);
    expect(out).not.toContain('voice'); // menu-honesty: story-only never offered
  });

  it('the starter is the registry object with only the name swapped (never a mutated registry)', async () => {
    const before = JSON.stringify(buildableTemplates().find((t) => t.id === 'widget')!.starter);
    const r = await constructTool.handler({ intent: 'an embedded support widget' });
    const out = text(r);
    expect(out).toContain('"name": "my-chat"');
    expect(out).toContain('"title": "Support"'); // widget starter chrome rides along
    expect(JSON.stringify(buildableTemplates().find((t) => t.id === 'widget')!.starter)).toBe(before);
  });
});
```

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/construct-tool.test.ts` — the new describe fails (old regex starter has no template statements).

- [ ] **8.5 — implement.** In `packages/ui/src/agent-tooling/mcp/tools/construct.ts`, replace `starterFor` (lines 41–58):

```ts
import { buildableTemplates, type BuildableTemplateId } from '../../construct/templates';

/** Intent → template, checked in specificity order (widget's own regex kept
 *  from the pre-registry version of this function). A match is STATED, per
 *  this tool's existing stated/questions convention; no match returns the
 *  buildable list and asks which. Story-only templates are never offered
 *  (menu-honesty). */
const INTENT_PATTERNS: readonly { id: BuildableTemplateId; re: RegExp }[] = [
  { id: 'widget', re: /widget|embed|bubble|corner|launcher/i },
  { id: 'research', re: /research|search|cite|citation|sources?\b/i },
  { id: 'workspace', re: /workspace|split|pane|artifact|side.?by.?side|preview/i },
  { id: 'inAppAssistant', re: /aside|dock|in.?app|copilot|console|sidebar/i },
  { id: 'assistant', re: /assistant|chat\s*(app|bot)|full.?screen/i },
];

function starterFor(intent: string) {
  const templates = buildableTemplates();
  const name = 'my-chat'; // real-choice: always ask for the tag name (it is theirs)
  const tagQuestion = `What should the element tag be? (kebab-case, e.g. "acme-support"; using "${name}" until you say)`;

  const match = INTENT_PATTERNS.find((p) => p.re.test(intent));
  const template = match ? templates.find((t) => t.id === match.id) : undefined;

  if (!template) {
    return {
      construct: {
        $schema: CONSTRUCT_SCHEMA_URL,
        name,
        layout: 'fullscreen',
        provider: { mode: 'mock' },
      },
      stated: [
        'no template implied — starting from a bare fullscreen construct. Templates available:',
        ...templates.map((t) => `  · ${t.id} — ${t.name}: ${t.description}`),
      ],
      questions: [
        tagQuestion,
        'Which template fits? (name one of the ids above, or keep the bare construct)',
      ],
    };
  }

  const construct = structuredClone(template.starter) as Record<string, unknown>;
  construct.name = name;
  return {
    construct,
    stated: [
      `template: ${template.id} (${template.name}) — implied by your request; every field below is yours to edit`,
    ],
    questions: [tagQuestion],
  };
}
```

(`CONSTRUCT_SCHEMA_URL` is already imported at the top of the file; the handler body below `starterFor` is untouched.)

- [ ] **8.6 — run the MCP suites green, including the pre-existing cases** (the `'a support widget for our order page'` test must pass against the RICHER widget starter — it asserts `"layout": "widget"` / `"mode": "mock"` / the schema URL / no `which layout` question, all of which the registry starter satisfies):

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/construct-tool.test.ts src/agent-tooling/mcp/construct-conversation.test.ts
```

If `construct-conversation.test.ts` (the multi-turn flow) pins wording the new statements changed, update its EXPECTATIONS to the new stated lines — the convention (stated vs. asked) is the contract, not the exact prose; but any assertion about validation/rejection behavior must pass untouched.

- [ ] **8.7 — task-8 gates (the spec's list verbatim: unit, typecheck):**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui run typecheck
```

- [ ] **8.8 — commit:**

```bash
git add packages/ui/src/components/builder-start.tsx packages/ui/src/components/builder-start.test.tsx \
        packages/ui/src/agent-tooling/mcp/tools/construct.ts packages/ui/src/agent-tooling/mcp/construct-tool.test.ts \
        packages/ui/src/agent-tooling/mcp/construct-conversation.test.ts
git commit -m "feat(builder,mcp): BuilderStart and the construct tool read the template registry

BuilderStart derives its cards from TEMPLATES (story keeps six; product
surfaces pass the buildable five — illustrations stay component-side).
The MCP tool's regex starter is replaced by registry statements: implied
intents get that template's starter stated, unclear intents get the
buildable list and one question.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg2uqtxknh9xtCcZPAerER"
```

---

## Phase-2 epic-end verification (before declaring the phase done)

- [ ] Full gate sweep, fresh (no scoped runs as verdicts):

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter @kitn.ai/ui run typecheck
nx build ui --skip-nx-cache
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run verify:construct
pnpm --filter @kitn.ai/ui run verify:pack
pnpm --filter create-kai run build && pnpm --filter create-kai run test && pnpm --filter create-kai run typecheck
```

- [ ] Confirm `verify:construct`'s printed fixture list names all 7 template fixtures (read the output — no count is recorded here on purpose).
- [ ] Confirm `pnpm --filter create-kai run build`'s bundle-size line is within a few KB of the pre-task-7 figure.

## Self-review (author's check against the spec)

- **B-12** ✓ Task 6: one leaf module, entry type with `availability`/`starter`/`variants`/`controls`, per-starter safeParse in `templates.test.ts`, import-discipline scan.
- **B-13** ✓ Task 6: five buildable in build order + voice story-only (type forbids a starter) + no Multi-mode; Research ships buildable with `sources.strip` real end-to-end (phase-1 B-4/B-8).
- **B-14** ✓ Task 6: starters are the stories'/fixture's schema-expressible subset; triggers on Workspace only (tested); mock provider + `$schema` on all (tested).
- **B-15** ✓ Task 6: generator rides build:api via `importTs`; `verify:generated` registration (sentinel-proofed); `verify:construct` recursion.
- **B-16** ✓ Task 6 entry + Task 7 proof: new subpath, own vite entry, zero-import chunk, `bundleGraphProblem` unchanged as the enforcement; `__DEFINE__` deliberately not used.
- **B-17a** ✓ Task 7: derived `shapeAxis`, starter seeding with override/keep semantics stated, `WIZARD_REGISTRY` growth, registry-drift test green against the phase-1 schema.
- **B-17b** ✓ Task 8: `BUILDER_TEMPLATES` derived; story keeps six; buildable filter exported + prop for product surfaces; illustrations component-side.
- **B-17c** ✓ Task 8: registry statements, stated/questions convention kept, story-only never offered.
- **B-18** ✓ Task 6.11: §4 row with the deliberate copy named.
- **C-4** ✓ tested (no Multi-mode entry). **C-6** ✓ starter contents exclude stub threads/anatomy.
- **Placeholder scan** ✓ no TODO/`...`-as-code in any code block; every path/command literal; the only ellipses are inside prose comments.
- **Type consistency** ✓ `Construct` output type honored (`theme.mode` explicit); `ShapeId`/`BuilderTemplateId` both derive from `TemplateId`; `constructTagName`'s new `'widget' | 'chat'` kind matches every call site shown.

## Ambiguities resolved while writing this plan (surface to the owner if any looks wrong)

1. **`CONSTRUCT_SCHEMA_URL` moved to a new leaf `schema-url.ts`** (re-exported from `schema.ts`). The spec's leaf rule forbids templates.ts importing schema.ts for the const (value import ⇒ zod in every consumer graph); this is the C-2/B-6 leaf pattern applied once more.
2. **`--shape fullscreen` is retired** (breaking, `feat!`): the axis is now template ids + `scratch` + `app`. `scratch` is the bare **fullscreen** construct; a bare widget is reached via the Support-widget template. The unknown-shape error already lists the live options.
3. **The CLI wizard asks no Workspace-variant question** — it seeds from the base starter and STATES that the variants live in the builder (B-23). Adding a second axis for one template was judged out of the spec's task-7 scope.
4. **Wizard keep-semantics:** `undefined` keeps a starter field, `''` clears it (text questions are seeded with the starter's value as the prompt initial); an empty starter-prompt list keeps the template's list; history-off strips `conversations` too (schema requires it); history-on preserves a starter's exact history shape (research keeps history *without* conversations).
5. **Starter contents derived from the stories (C-6), with these judgment calls:**
   - *widget*: owner-widget fixture lineage, de-branded (Acme → neutral "Support"/"we're here to help"), `position` normalized to `bottom-end` and `defaultOpen` dropped (the fixture's `top-start`/`defaultOpen: true` are fixture-exercise values, not a sane template default); no `accent` (the fixture has none — only `unreadColor: '#38BDF8'`, kept).
   - *inAppAssistant*: story's `ops-console` identity neutralized to `in-app-assistant`/"Assistant" (T-4 neutral names); `aside: { position: 'end', width: '380px' }` states codegen's current hardcoded geometry so it is visible/editable.
   - *assistant*: story's construct plus `empty: { title: 'What can I help with?', description: 'Ask anything…' }` (the story's greeting signals, which are schema-expressible via `empty` per ruling 4).
   - *research*: story construct + `sources: { strip: true }` (B-4/B-13) + `messageActions: { user: ['edit'], assistant: ['copy','like','dislike'] }` — "assistant-style actions" read as the owner's A3 default matrix from `builder-message-actions.tsx`. Assistant/widget starters carry NO `messageActions` (kit defaults) since B-13 names actions only for research.
   - *workspace*: header actions map the story's `secondary`/`primary` row variants onto the kit Button's real variant names (`outline`/`default` — B-6a's enum has no primary/secondary); trigger entries get stable label-derived ids (`summarize`/`translate`/`researcher`/`coder`) instead of the story's generated row ids, and drop `icon` (B-5's `TriggerEntry` is `{ id, label, description? }`); `shell.userMenu` uses the story's own "Ada"/"Pro". Variants differ only in `name` and (for appPreview) starter prompts — the schema-expressible residue of two anatomies whose real difference (pane content) is not vocabulary; appPreview's two prompts are invented in the Lovable register the story documents.
   - **All providers forced to `{ mode: 'mock' }`** even though four stories seed `endpoint` — B-14 is explicit (keyless first run).
6. **Fixture file naming:** `<templateId>.construct.json` and `<templateId>.<variantId>.construct.json` under `fixtures/templates/`; `verify:construct` flattens path separators into the cell name. The 7 files are hand-listed in `verify-generated-sync.mjs`'s `GENERATED` (like the two schema copies already are) — the guard's preconditions and sentinel make both drift directions loud.
7. **`BuilderStart` product filtering** is delivered as data (`BUILDABLE_BUILDER_TEMPLATES`) plus an optional `templates` prop defaulting to all six — the story stays byte-identical with no prop, and phase 3's `kai dev --builder` passes the buildable list (B-23). No story file changes in this phase.
8. **WIZARD_REGISTRY red between phases:** phase 1 makes create-kai's registry-drift test fail until task 7 runs. That is the drift guard doing its job; task 7 step 7.1 confirms the red first and fixes it before anything else. Phase-1 tasks' own gates don't run create-kai's suite, so phase 1 still lands green per the spec's ordering.
9. **`construct-conversation.test.ts` wording:** if its multi-turn expectations pin the old starter prose, expectations update to the new stated lines; behavior assertions (validation, rejection, previous-good-construct) stay untouched.
