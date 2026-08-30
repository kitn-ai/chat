# Screens Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the five `Labs/Proofs` token-only screens into a **Screens gallery** — one source module per screen under `packages/ui/src/screens/`, a `Labs/Screens` story group, a `Screens` topic on the docs site with a live per-screen preview and a copy-the-source panel, a generated `screen-*` code recipe per screen served by the `kai` MCP, and one quiet pointer line on the builder Start screen. Add the **Settings** screen (story-first) as the sixth entry. Kill the hand-typed `parameters.docs.source.code` skeletons.

**Architecture:** each screen's single source of truth is a standalone Solid component file, `packages/ui/src/screens/<id>.tsx`, plus a zero-dependency leaf metadata registry `packages/ui/src/screens/registry.ts` (the `agent-tooling/construct/templates.ts` pattern: data + type-only imports, no zod, no component imports). Everything else derives from those two: the Storybook stories render the components and take their source panel from a Vite `?raw` import of the same file; `scripts/gen-screen-recipes.mjs` (wired into `build:api`) rewrites the relative `../elements/*` registration imports to one `import '@kitn.ai/ui/elements';` and writes `src/agent-tooling/recipes/generated/screens.json`, which `recipes/index.ts` maps into `screen-<id>` `CodeRecipe`s (served by `component_reference`, compiled by `verify:scaffold` under its existing **solid** tsc project); the docs site renders each screen inside a full-bleed non-Starlight Astro route in an iframe (its own Tailwind-processed stylesheet that imports the kit's `theme.css` and `@source`s `packages/ui/src/screens`) and shows the **generated, consumer-shaped** code in its copy panel, so what a reader copies is what the MCP serves.

**Tech Stack:** SolidJS 1.9.x, lucide-solid, Storybook (`storybook-solidjs-vite`, addon-a11y = axe per story), vitest (`--project=unit`), @solidjs/testing-library, Astro 6 + Starlight + `@astrojs/solid-js` + `starlight-sidebar-topics`, Tailwind v4 (`@tailwindcss/vite` on the docs side, the `tailwindcss` CLI for the kit's `compiled.css`), node `.mjs` generators + esbuild `importTs`, tsc via `scripts/lib/consumer-tsc-projects.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-30-screens-gallery-design.md` (rulings R-1..R-6 and its task breakdown T1..T6). This plan expands that breakdown; where the plan resolves something the spec left open or got wrong about the current tree, the step says so in place.

---

## Global Constraints

- **The `Labs/Screens` stories are the BINDING acceptance surface.** Every visual judgement in this arc — the extraction parity check, the Settings design round, the end-of-arc IVP — compares against the *stories*, not against prose in this plan or the spec. The docs preview of a screen must be the story's screen (same module), so any divergence is a wiring bug and the IVP hunts exactly that. This is stated up front because the phase-3 builder round treated its design stories as groundwork instead of the contract and shipped a parity gap.
- **Story-first for unseen UI** (owner policy 2026-08-26): the Settings screen lands as a story with stub data and gets screenshotted for the owner BEFORE it is extracted. Standing autonomy — do not idle waiting for a reply; capture the screenshots, say where they are, keep going.
- **ONE source per screen.** `src/screens/<id>.tsx` is the only place a screen's markup exists. The story, the docs preview, the docs copy panel and the MCP recipe are all derived. If a step ever has you typing a screen's markup, class list, ingredient list or blurb a second time, the step is wrong — read the fact where it lives. `docs/coupling-map.md` §4 gains the row that records this (Task 9).
- **No number in this plan's prose that a script prints.** Cell counts, recipe counts, pack sizes and byte ceilings are read from the gate's own output or from the constant in the script (`MAX_UNPACKED_BYTES` / `MAX_FILE_BYTES` in `scripts/verify-pack-weight.mjs`). The spec's "13.5 MiB ceiling" line is stale — do not copy it anywhere.
- **Docs copy is bound by `apps/docs/STYLE.md`.** Every line of MDX prose this plan writes: earn every sentence, active voice, no "seamless/powerful/leverage/out of the box", no stock transitions, no em-dash flourishes, no emoji, web-components-first framing, no unverified claims, no hand-typed element counts. Read STYLE.md before writing any page.
- **`lint:cdn-pins` must stay clean:** gallery pages carry NO `@kitn.ai/ui@<version>` literal. Link the Installation page instead of restating a pinned CDN snippet. The builder pointer URL is a bare docs path with no version in it.
- **All commands run from the repo root** unless a step says `cd packages/ui`. **FOREGROUND only** — never background a gate; a gate you did not watch finish did not run.
- **Reports paste RAW output.** Every completion report quotes the actual command line and the actual tail of its output (pass counts, printed axes, error text). No paraphrase, no "tests pass".
- **nx cache caveats** (CLAUDE.md): `nx typecheck ui` has been wrong in both directions — when a typecheck verdict matters run `npm run typecheck` inside `packages/ui`, or `nx typecheck ui --skip-nx-cache`. `nx build ui` can hit the cache and skip the derived-artifact generators while printing success — when the generated JSON matters, run `npm run build:api` inside `packages/ui` or pass `--skip-nx-cache`.
- **A fresh clone/worktree needs `pnpm install`, then `pnpm --filter @kitn.ai/ui run build:css`, then a real build** before the unit suite means anything. This arc touches the docs app too, and `nx build docs` depends on `^build`, so the kit must be built for the docs build to resolve `@kitn.ai/ui` and for `src/elements/compiled.css` to exist.
- **Never hand-edit a generated artifact.** `src/agent-tooling/recipes/generated/screens.json` is written by its generator and guarded by `verify:generated`.
- `--project=unit` is not the whole gate: `--project=emitted` runs as a separate required CI step. Nothing in this arc should move the emitted project, but run it before claiming done.
- Conventional commits; the trailer lines are the executor's to append. Do not hand-edit any `package.json` version.

---

## File Structure (locked in)

| File | Role |
|---|---|
| `packages/ui/src/screens/registry.ts` | Create: the zero-dependency leaf — `Screen` type + `SCREENS` array + `getScreen()`. |
| `packages/ui/src/screens/auth.tsx` | Create: extracted from `proof-auth.stories.tsx`. The reference pattern (Task 2). |
| `packages/ui/src/screens/pricing.tsx` | Create: extracted from `proof-pricing.stories.tsx`. |
| `packages/ui/src/screens/dashboard.tsx` | Create: extracted from `proof-dashboard.stories.tsx`. |
| `packages/ui/src/screens/data-table.tsx` | Create: extracted from `proof-data-table.stories.tsx`. |
| `packages/ui/src/screens/empty-states.tsx` | Create: extracted from `proof-empty-states.stories.tsx`. |
| `packages/ui/src/screens/settings.tsx` | Create (Task 5, after the story settles): the new sixth screen. |
| `packages/ui/src/screens/screens.test.tsx` | Create: the screens contract test — import discipline, no-hex, registry↔file↔story coverage, smoke render. |
| `packages/ui/src/elements/screens.stories.tsx` | Create: `Labs/Screens` — About card + one story per screen, `?raw` source params. |
| `packages/ui/src/elements/proof-{about,auth,pricing,dashboard,data-table,empty-states}.stories.tsx` | Delete, after extraction. |
| `packages/ui/.storybook/styles.css` | Modify: add `@source "../src/screens";`. `src/elements/styles.css` is NOT touched. |
| `packages/ui/src/agent-tooling/catalog/surfaces.ts` | Modify: inventory row `Proofs` → `Screens` (the Labs title it resolves against moves). |
| `packages/ui/src/agent-tooling/catalog/surfaces.test.ts` | Modify: the corpus-title literal list. |
| `packages/ui/scripts/gen-screen-recipes.mjs` | Create: the generator + the exported `rewriteScreenImports`. |
| `packages/ui/tests/scripts/gen-screen-recipes.test.ts` | Create: the rewrite's own test (accept, rewrite, dedupe, reject). |
| `packages/ui/src/agent-tooling/recipes/generated/screens.json` | Generated. Committed. |
| `packages/ui/src/agent-tooling/recipes/types.ts` | Modify: `CodeRecipeFile['lang']` gains `'tsx'`. |
| `packages/ui/src/agent-tooling/recipes/index.ts` | Modify: map the generated JSON into `screen-<id>` recipes. |
| `packages/ui/package.json` | Modify: `build:api` gains `node scripts/gen-screen-recipes.mjs`. |
| `packages/ui/scripts/verify-generated-sync.mjs` | Modify: `GENERATED` gains the screens JSON. |
| `packages/ui/scripts/verify-artifact-fresh.mjs` | Modify: `GENERATED_SOURCES` gains the screens JSON. |
| `packages/ui/scripts/verify-scaffold-compiles.mjs` | Modify: recipe cells accept `tsx` and route them to the solid project. |
| `packages/ui/scripts/lib/consumer-tsc-projects.mjs` | Modify: `lucide-solid` joins the symlinked consumer packages. |
| `apps/docs/src/pages/screens/preview/[id].astro` | Create: the full-bleed preview route. |
| `apps/docs/src/styles/screen-preview.css` | Create: the route's own Tailwind-processed stylesheet. |
| `apps/docs/src/components/ScreenPreview.tsx` | Create: iframe + Resizer + theme postMessage island. |
| `apps/docs/src/components/ScreenSource.tsx` | Create: the generated-source copy panel island. |
| `apps/docs/src/components/ScreenIndex.tsx` | Create: the overview page's derived screen list. |
| `apps/docs/src/content/docs/screens/*.mdx` | Create: `overview` + one page per screen. |
| `apps/docs/astro.config.mjs` | Modify: the `Screens` topic (items derived), `vite.server.fs.allow`, `vite.resolve.dedupe`. |
| `apps/docs/package.json` | Modify: `lucide-solid` dependency. |
| `packages/ui/tests/docs/screens-pages.test.ts` | Create: the docs page-set-equals-registry test. |
| `packages/ui/src/components/builder-start.tsx` | Modify: one muted footer line. |
| `packages/ui/src/components/builder-start.test.tsx` | Modify: append the pointer tests; the derivation pins are untouched. |
| `docs/coupling-map.md` | Modify: §4 gains the screens row. |

---

### Task 1: The screens registry leaf + the contract test

**Files:**
- Create: `packages/ui/src/screens/registry.ts`
- Create: `packages/ui/src/screens/screens.test.tsx`

**Interfaces:**
- Produces: `export interface Screen { id, title, blurb, ingredients, notes }`, `export const SCREENS: readonly Screen[]`, `export function getScreen(id: string): Screen | undefined` from `packages/ui/src/screens/registry`.
- Consumed by: the story file (Task 2/3), `gen-screen-recipes.mjs` (Task 6), the docs page-set test (Task 7). Note the docs site does **not** import this module — it reads the generated `screens.json`, so the docs never compile kit TypeScript for metadata.
- Consumes: nothing. It is a leaf: no value imports at all.

- [ ] **Step 1: Write the failing contract test**

Create `packages/ui/src/screens/screens.test.tsx`. This file is the whole enforcement layer for R-1's rules, so write it first and watch every assertion fail for the right reason.

```tsx
// The screens contract. `src/screens/<id>.tsx` is the SINGLE SOURCE for a
// gallery screen: the Labs/Screens story renders it, the docs preview route
// renders it, the docs copy panel and the `screen-*` MCP recipe are generated
// from its text. Everything below exists so that "single source" is a fact
// about the tree rather than a claim in a spec.
//
// The import allowlist is the positioning claim made structural: a screen is
// what a CONSUMER can build — tokens + markup + published kai-* elements. The
// moment a screen imports `../components/` or `../ui/`, it stops being an
// argument that the token layer holds and becomes a demo of the kit's own
// internals, and the generated recipe stops compiling for anybody.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, cleanup } from '@solidjs/testing-library';
import { SCREENS, getScreen } from './registry';

const HERE = dirname(fileURLToPath(import.meta.url));

const screenFiles = (): string[] =>
  readdirSync(HERE)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    .sort();

const idOf = (file: string): string => file.replace(/\.tsx$/, '');

/** Value imports (type-only imports are erased and cannot reach a consumer). */
function valueImports(src: string): string[] {
  const from = [...src.matchAll(/^import (?!type[\s{])[^;]*?from '([^']+)';/gm)].map((m) => m[1]);
  const bare = [...src.matchAll(/^import '([^']+)';/gm)].map((m) => m[1]);
  return [...from, ...bare];
}

const ALLOWED_PACKAGES = ['solid-js', 'solid-js/web', 'lucide-solid'];
const ALLOWED_RELATIVE = /^\.\.\/elements\/[a-z0-9-]+$/;

describe('the screens registry is a leaf', () => {
  it('has no value import at all — data only, so every consumer can read it', () => {
    const src = readFileSync(join(HERE, 'registry.ts'), 'utf8');
    expect(valueImports(src)).toEqual([]);
  });

  it('ids are unique, kebab-case, and match a file on disk in both directions', () => {
    const ids = SCREENS.map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, `${id} is not kebab-case`).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(screenFiles().map(idOf).sort()).toEqual([...ids].sort());
  });

  it('every entry carries a title, a blurb, ingredients and notes', () => {
    for (const s of SCREENS) {
      expect(s.title.length, s.id).toBeGreaterThan(0);
      expect(s.blurb.length, s.id).toBeGreaterThan(0);
      expect(Array.isArray(s.ingredients), s.id).toBe(true);
      expect(s.notes.length, `${s.id} has no notes — the recipe would teach nothing`).toBeGreaterThan(0);
      for (const tag of s.ingredients) expect(tag, s.id).toMatch(/^kai-[a-z-]+$/);
    }
  });

  it('getScreen resolves a registered id and nothing else', () => {
    expect(getScreen(SCREENS[0].id)).toBe(SCREENS[0]);
    expect(getScreen('not-a-screen')).toBeUndefined();
  });
});

describe('every screen module obeys the consumer-shaped import discipline', () => {
  it('imports only solid-js, lucide-solid, and relative kai-* registrations', () => {
    for (const file of screenFiles()) {
      const src = readFileSync(join(HERE, file), 'utf8');
      for (const spec of valueImports(src)) {
        const ok = ALLOWED_PACKAGES.includes(spec) || ALLOWED_RELATIVE.test(spec);
        expect(
          ok,
          `${file} imports '${spec}'. A screen may import solid-js, lucide-solid, or a ` +
            "relative '../elements/<x>' registration (rewritten to '@kitn.ai/ui/elements' " +
            'by gen-screen-recipes.mjs). Anything from components/, ui/ or primitives/ ' +
            'breaks both the positioning claim and the generated recipe.',
        ).toBe(true);
      }
    }
  });

  it('declares every kai-* element it registers in its registry ingredients', () => {
    for (const file of screenFiles()) {
      const src = readFileSync(join(HERE, file), 'utf8');
      const registered = valueImports(src)
        .filter((s) => ALLOWED_RELATIVE.test(s))
        .map((s) => `kai-${s.replace('../elements/', '')}`);
      const entry = getScreen(idOf(file))!;
      // `../elements/register` registers the whole bundle: the ingredient list
      // is then the tags the markup actually places, which the text check below
      // covers, so only per-element modules are compared here.
      for (const tag of registered.filter((t) => t !== 'kai-register')) {
        expect(entry.ingredients, `${file} registers ${tag} but does not list it`).toContain(tag);
      }
      for (const tag of entry.ingredients) {
        expect(src, `${file} lists ${tag} but never places it`).toContain(`<${tag}`);
      }
    }
  });

  it('uses token utilities, never a hex color', () => {
    // Anchored alternatives, not `{3,8}`: the dashboard's activity feed carries
    // an order number (`#10482`), which a loose 3-digit match would read as a
    // color. Three/six/eight hex digits followed by a word boundary is a color;
    // `#104` followed by `8` is not.
    const HEX = /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/;
    for (const file of screenFiles()) {
      const src = readFileSync(join(HERE, file), 'utf8');
      const hit = src.match(HEX);
      expect(hit?.[0], `${file} hardcodes ${hit?.[0]} — screens are token-only, that is the proof`).toBeUndefined();
    }
  });

  it('default-exports a component that renders', async () => {
    for (const s of SCREENS) {
      const mod = (await import(`./${s.id}.tsx`)) as { default: () => unknown };
      expect(typeof mod.default, `${s.id} has no default-exported component`).toBe('function');
      const { container, unmount } = render(() => (mod.default as () => never)());
      expect(container.firstElementChild, `${s.id} rendered nothing`).not.toBeNull();
      unmount();
    }
    cleanup();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/screens/screens.test.tsx`
Expected: FAIL to collect — `./registry` does not exist. That is the correct first failure.

- [ ] **Step 3: Write the registry leaf**

Create `packages/ui/src/screens/registry.ts`. Entries for the five extracted screens; `settings` is appended by Task 5.

```ts
/**
 * The screens registry — ONE module, a LEAF.
 *
 * Data only: NO value imports, ever (screens.test.tsx pins that). The same
 * discipline `agent-tooling/construct/templates.ts` keeps, for the same
 * reason — three consumers with three different module graphs read this:
 * the Storybook story, the `gen-screen-recipes.mjs` generator (esbuild-
 * bundled into a throwaway .mjs at build:api time), and, transitively
 * through the JSON that generator writes, the docs site and the `kai` MCP.
 *
 * What lives here is METADATA. Source code does not: each screen's markup
 * lives once, in `./<id>.tsx`, and everything else derives from that file.
 * A `blurb` here becomes the recipe's `intent` and the docs page's lead;
 * `notes` become the teaching lines `component_reference` prints above the
 * files. `ingredients` are the kai-* tags the screen places — the contract
 * test checks that list against the module's own registration imports and
 * its markup in both directions, so it cannot quietly go stale.
 */
export interface Screen {
  /** Kebab-case id. It is the module basename, the story id suffix, the docs
   *  page slug and (as `screen-<id>`) the MCP recipe name. */
  id: string;
  title: string;
  /** One sentence: what the screen is. Used as the recipe intent and the
   *  gallery lead. */
  blurb: string;
  /** The kai-* tags the screen places. Empty means token-only markup. */
  ingredients: readonly string[];
  /** The WHY a prop table cannot carry — served above the recipe files. */
  notes: readonly string[];
}

export const SCREENS: readonly Screen[] = [
  {
    id: 'auth',
    title: 'Sign in',
    blurb:
      'A centered sign-in card: email and password fields, a show/hide toggle, a primary submit, and an OAuth row under a divider.',
    ingredients: ['kai-input'],
    notes: [
      'The fields are <kai-input>, which owns the token-driven border, ring and the leading/trailing affix slots. Everything else — the card, the divider, the OAuth buttons — is markup over token utilities.',
      'The double container is deliberate: the outer element scrolls (no items-center, which clips the top on overflow) and the inner one uses m-auto, so the card centers when there is room and top-aligns when there is not.',
      'Every color is a --color-* token utility, so light and dark both work with no second stylesheet.',
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing',
    blurb:
      'A three-plan pricing page with a monthly/annual billing toggle, a highlighted plan, and a feature matrix.',
    ingredients: ['kai-icon'],
    notes: [
      'Only the glyphs come from the kit here (<kai-icon>). The plan cards, the toggle and the feature rows are token markup, which is the point: the kit ships no pricing component and does not need to.',
      'The highlighted plan uses the primary token for its border and badge and nothing else — one accent, applied once.',
    ],
  },
  {
    id: 'dashboard',
    title: 'Analytics dashboard',
    blurb:
      'An analytics dashboard: stat tiles with deltas, an activity feed, and charts drawn as markup.',
    ingredients: [],
    notes: [
      'No kai-* element at all. Surfaces come from the bg-surface / bg-card / bg-surface-sunken hierarchy, elevation from .kai-elevation, and the up/down deltas from the --color-tool-* hues.',
      'The charts are markup, not a charting library: bars are divs sized in percent. Swap in your own chart library without touching anything else on the page.',
    ],
  },
  {
    id: 'data-table',
    title: 'Data table',
    blurb:
      'A members table: sortable columns, row selection, status pills, a search field and pagination.',
    ingredients: ['kai-search'],
    notes: [
      'The filter field is <kai-search> (debounced input, clear affordance, keyboard shortcut hint). The table itself is markup — the kit ships no grid.',
      'kai-search reports through a non-bubbling kai-search event, so the listener goes on the element itself, added in a ref callback.',
      'Status pills read their tint from the --color-tool-* hues rather than inventing a semantic scale.',
    ],
  },
  {
    id: 'empty-states',
    title: 'Empty and error states',
    blurb:
      'A gallery of the four states every app needs: no results, first run, error, and offline.',
    ingredients: [],
    notes: [
      'Each panel is the same shape — tinted glyph, headline, one muted line, one or two actions — so the set reads as one system rather than four one-offs.',
      'The tints are token hues at low alpha (bg-tool-blue/12, bg-destructive/10), which keeps them legible in both modes without a second palette.',
    ],
  },
];

export function getScreen(id: string): Screen | undefined {
  return SCREENS.find((s) => s.id === id);
}
```

- [ ] **Step 4: Run the test again**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/screens/screens.test.tsx`
Expected: the leaf/registry describe block PASSES; the per-module block FAILS on `screenFiles()` being empty against five ids (`expected [] to equal [ 'auth', … ]`). Task 2 closes that.

---

### Task 2: Extract `auth` — the reference pattern

This task is written out in full. Tasks 3 and 5 repeat it file by file.

**Files:**
- Create: `packages/ui/src/screens/auth.tsx`
- Create: `packages/ui/src/elements/screens.stories.tsx`
- Delete: `packages/ui/src/elements/proof-auth.stories.tsx`
- Modify: `packages/ui/.storybook/styles.css`

**Interfaces:**
- Produces: `export default function AuthScreen(): JSX.Element` from `src/screens/auth.tsx`; the `Labs/Screens` meta and the `Auth` story from `src/elements/screens.stories.tsx`.
- Consumes: `../elements/input` (registration), `lucide-solid`, `solid-js`, and — in the story only — `../screens/auth.tsx?raw`.

- [ ] **Step 1: Create `packages/ui/src/screens/auth.tsx`**

The render body moves byte-for-byte out of `proof-auth.stories.tsx`. What changes: the story scaffolding is gone, the registration import path shifts one level (`./input` → `../elements/input`), the JSX augmentation comes along **byte-identical to the one in `src/elements/input.stories.tsx`** (TS2717 if the two ever disagree), and the header comment is rewritten for its new job.

```tsx
import { createSignal, Show, type JSX } from 'solid-js';
import { Mail, Lock, Eye, EyeOff, Github, ArrowRight, Sparkles } from 'lucide-solid';
import '../elements/input';

// Declare the custom element tag for SolidJS JSX.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-input': JSX.HTMLAttributes<HTMLElement> & {
        type?: string;
        value?: string;
        placeholder?: string;
        label?: string;
        hint?: string;
        error?: string;
        size?: string;
        disabled?: boolean;
        readonly?: boolean;
        required?: boolean;
        invalid?: boolean;
        name?: string;
        theme?: string;
      };
    }
  }
}

// A sign-in screen built from design tokens + markup, with the kit's own field
// element for the two inputs. It is a GALLERY SCREEN: this file is the single
// source, and the Labs/Screens story, the docs preview, the docs copy panel and
// the `screen-auth` MCP recipe all derive from it. The relative registration
// import above is rewritten to `import '@kitn.ai/ui/elements';` by
// scripts/gen-screen-recipes.mjs, so the copy a consumer is handed is
// consumer-shaped while this file stays buildable on an unbuilt tree.
//
// It themes light/dark for free: every color is a --color-* token utility, no
// hardcoded hex. The page sits on bg-surface-sunken so the bg-card card lifts
// off it with its border + the token-driven .kai-elevation shadow in both modes.

// Inline, monochrome Google "G" (fill=currentColor so it themes with the button
// text - no brand hex, keeping the screen 100% token/currentColor driven).
function GoogleGlyph(props: { class?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class={props.class}>
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

// The email + password fields are <kai-input>, so the hand-rolled input class
// string is gone (kai-input owns the token-driven border/ring + affix layout).
// The OAuth buttons stay raw markup and share this class.
const oauthButtonClass =
  'inline-flex w-full items-center justify-center gap-2.5 rounded-md border border-input bg-background ' +
  'px-4 py-2.5 text-sm font-medium text-foreground transition-colors ' +
  'hover:bg-accent hover:text-accent-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function AuthScreen(): JSX.Element {
  const [show, setShow] = createSignal(false);

  return (
    // OUTER = the bounded scroll container: full-height, scrolls when the
    // viewport is short. NO items-center (that would clip the top on overflow);
    // min-h-0 lets it shrink below content height and actually scroll.
    <div class="flex h-screen flex-col overflow-y-auto min-h-0 bg-surface-sunken text-foreground">
      {/* INNER = the centering wrapper. m-auto v-centers the card when there's
          spare room and collapses to top-aligned (scrollable) when content is
          taller than the viewport. py-10 is the comfortable overflow padding. */}
      <div class="m-auto w-full max-w-md px-4 py-10">
        <div class="rounded-2xl border border-border bg-card p-7 text-card-foreground kai-elevation sm:p-8">
          {/* Brand mark + heading. The mark is a token-tinted rounded square. */}
          <div class="mb-7 flex flex-col items-center text-center">
            <div class="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles class="size-5" />
            </div>
            <h1 class="text-xl font-semibold tracking-tight text-foreground">Sign in</h1>
            <p class="mt-1 text-sm text-muted-foreground">Welcome back. Sign in to your account to continue.</p>
          </div>

          {/* FORM */}
          <form class="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
            {/* Email field — the kit's <kai-input> with a leading Mail glyph. */}
            <kai-input type="email" label="Email" placeholder="you@example.com">
              <Mail slot="leading" class="size-4" />
            </kai-input>

            {/* Password field — <kai-input> with a leading Lock glyph and a
                trailing show/hide toggle; the Forgot link sits right-aligned below. */}
            <div class="flex flex-col gap-1.5">
              <kai-input
                type={show() ? 'text' : 'password'}
                label="Password"
                placeholder="Enter your password"
              >
                <Lock slot="leading" class="size-4" />
                <button
                  slot="trailing"
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show() ? 'Hide password' : 'Show password'}
                  class="-mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Show when={show()} fallback={<Eye class="size-4" />}>
                    <EyeOff class="size-4" />
                  </Show>
                </button>
              </kai-input>
              <a
                href="#"
                class="self-end text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Forgot password?
              </a>
            </div>

            {/* Primary submit, full width */}
            <button
              type="submit"
              class="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Sign in
              <ArrowRight class="size-4" />
            </button>
          </form>

          {/* Divider with "or" (kai-separator exists, but this screen stays raw markup) */}
          <div class="my-6 flex items-center gap-3">
            <div class="h-px flex-1 bg-border" />
            <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">or</span>
            <div class="h-px flex-1 bg-border" />
          </div>

          {/* OAuth / social buttons */}
          <div class="flex flex-col gap-2.5">
            <button type="button" class={oauthButtonClass}>
              <GoogleGlyph class="size-4" />
              Continue with Google
            </button>
            <button type="button" class={oauthButtonClass}>
              <Github class="size-4" />
              Continue with GitHub
            </button>
          </div>
        </div>

        {/* Footer link, outside the card */}
        <p class="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <a
            href="#"
            class="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
          >
            Create account
          </a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/ui/src/elements/screens.stories.tsx` with the About card and the Auth story**

The story file is thin by construction: it imports the component and its own text. `parameters.docs.source.code` is the `?raw` import — the file itself, not a skeleton of it.

```tsx
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { For } from 'solid-js';
import { FlaskConical, ScanSearch, ShieldCheck, ArrowRight } from 'lucide-solid';
import { SCREENS } from '../screens/registry';
import AuthScreen from '../screens/auth';
import authSource from '../screens/auth.tsx?raw';

// Labs/Screens — the gallery. Each story below renders the ONE module that is
// that screen's source (src/screens/<id>.tsx) and takes its source panel from a
// ?raw import of the same file. There is no second copy of any screen's markup
// anywhere: the docs preview renders the same module, and the `screen-<id>` MCP
// recipe is generated from the same text at build:api time.
//
// These stories are the BINDING design surface for the gallery. The docs page
// for a screen must be this screen; a difference is a wiring bug.

const meta = { title: 'Labs/Screens', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

/** The source panel for a screen: the real file, via ?raw. */
const source = (code: string) => ({ docs: { source: { language: 'tsx', code } } });

// Why the screens exist — the two jobs each one does at once.
const JOBS = [
  {
    icon: ShieldCheck,
    tint: 'bg-tool-green/12 text-tool-green',
    title: 'Prove the tokens hold',
    body: 'Build a polished, real screen we ship no component for, from tokens alone. If it looks right in light and dark, the token layer is doing its job.',
  },
  {
    icon: ScanSearch,
    tint: 'bg-tool-blue/12 text-tool-blue',
    title: 'Surface the gaps',
    body: 'Where the tokens run out - a missing scale, a color we had to fake, a primitive worth a component - that gap is the deliverable. kai-input and kai-search both exist because a screen here needed them.',
  },
];

export const About: Story = {
  name: 'About',
  render: () => (
    <div class="min-h-screen bg-background px-6 py-10 text-foreground">
      <div class="mx-auto max-w-3xl">
        <header class="mb-8 flex items-start gap-3">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FlaskConical class="size-6" />
          </div>
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Screens</h1>
            <p class="mt-1 text-sm text-muted-foreground">
              Whole app screens built from the tokens and the general-purpose elements.
            </p>
          </div>
        </header>

        <p class="text-sm leading-relaxed text-foreground/90">
          Each screen is a real one - sign-in, pricing, a dashboard, a data table, empty states,
          settings - built from the design tokens plus markup, using the kit's own elements only
          where the kit actually has one. They started as proofs of the token layer. They are now
          the gallery: this group is the design surface, and each screen ships as a single module
          in src/screens/ that the docs site previews and the kai MCP serves as a code recipe.
        </p>

        <h2 class="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Why they exist
        </h2>
        <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <For each={JOBS}>
            {(job) => (
              <div class="rounded-xl border border-border bg-card p-5">
                <div class={`flex size-9 items-center justify-center rounded-lg ${job.tint}`}>
                  <job.icon class="size-5" />
                </div>
                <h3 class="mt-3 text-sm font-semibold tracking-tight text-foreground">{job.title}</h3>
                <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{job.body}</p>
              </div>
            )}
          </For>
        </div>

        <h2 class="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How to read them
        </h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Open a screen and toggle the theme - light and dark both come from the --color-* tokens,
          nothing is a hardcoded hex. The gaps these screens surfaced are tracked in{' '}
          <code class="rounded bg-surface-sunken px-1.5 py-0.5 text-[0.8125rem] text-foreground">
            docs/labs-proofs-gap-backlog.md
          </code>
          .
        </p>

        <h2 class="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          The gallery
        </h2>
        {/* Derived from the registry: a screen registered without a story here
            still shows up in this list, and the contract test fails on the
            missing story export. */}
        <ul class="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          <For each={SCREENS}>
            {(screen) => (
              <li class="flex items-center gap-3 px-5 py-3 text-sm">
                <ArrowRight class="size-4 shrink-0 text-muted-foreground" />
                <span class="font-medium text-foreground">{screen.title}</span>
                <span class="text-muted-foreground">{screen.blurb}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The Labs/Screens gallery: whole app screens built from the design tokens and the kit\'s general-purpose elements. Each one is a single module in src/screens/ — the story, the docs preview, the copy panel and the MCP recipe all derive from it.',
      },
    },
  },
};

export const Auth: Story = {
  name: 'Auth',
  render: () => <AuthScreen />,
  parameters: source(authSource),
};
```

- [ ] **Step 3: Delete the old story and add the Tailwind source line**

Delete `packages/ui/src/elements/proof-auth.stories.tsx`.

In `packages/ui/.storybook/styles.css`, add one line to the existing `@source` block (after `@source "../src/**/*.mdx";`):

```css
@source "../src/screens";
```

Do **not** add this to `packages/ui/src/elements/styles.css`. That sheet is `source(none)` on purpose — utilities used only by gallery screens must not land in `compiled.css`, which every consumer pays for in every shadow root.

- [ ] **Step 4: Run the contract test**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/screens/screens.test.tsx`
Expected: still FAILS the id/file equality (four screens outstanding) but the import-discipline, no-hex, ingredient and render assertions now pass over `auth.tsx`. Paste the raw failure — it should name exactly the four missing files and nothing else.

- [ ] **Step 5: Typecheck**

Run: `cd packages/ui && npm run typecheck`
Expected: PASS. If TS2717 fires on `kai-input`, the augmentation block in `auth.tsx` is not byte-identical to `src/elements/input.stories.tsx`'s — make it identical rather than "compatible".

- [ ] **Step 6: Visual parity — the extraction must be a no-op on pixels**

Before deleting anything else, capture the before/after. Run Storybook in the foreground (`pnpm --filter @kitn.ai/ui run dev`, port 6006; storybook-static cannot register web components, so it must be the dev server), and screenshot `labs-screens--auth` in light and dark. Compare against the pre-extraction `labs-proofs--auth` screenshot taken from the same commit's parent (`git stash` the branch or check out the parent in a scratch worktree if needed). Save both to `docs/superpowers/research/2026-08-30-screens-gallery/`.
Expected: identical rendering. The extraction moves code; it does not redesign anything.

---

### Task 3: The remaining four extractions + the group rename fallout

Repeat Task 2's pattern per file. Nothing new is designed here.

**Files:**
- Create: `packages/ui/src/screens/pricing.tsx`, `dashboard.tsx`, `data-table.tsx`, `empty-states.tsx`
- Modify: `packages/ui/src/elements/screens.stories.tsx`
- Delete: `packages/ui/src/elements/proof-pricing.stories.tsx`, `proof-dashboard.stories.tsx`, `proof-data-table.stories.tsx`, `proof-empty-states.stories.tsx`, `proof-about.stories.tsx`
- Modify: `packages/ui/src/agent-tooling/catalog/surfaces.ts`, `packages/ui/src/agent-tooling/catalog/surfaces.test.ts`

**Interfaces:**
- Produces: `PricingScreen`, `DashboardScreen`, `DataTableScreen`, `EmptyStatesScreen` as default exports; the `Pricing`, `Dashboard`, `DataTable`, `EmptyStates` stories.
- Consumes: `../elements/register` (pricing — the current proof imports `./register` for `kai-icon`; keep the same module, path-shifted), `../elements/search` (data-table), `lucide-solid`, `solid-js`, `solid-js/web` (`Dynamic`).

- [ ] **Step 1: `packages/ui/src/screens/pricing.tsx`**

Move `proof-pricing.stories.tsx`'s module-level data (`PLANS`, the feature matrix), its helpers, and its `render` body verbatim into a default-exported `PricingScreen`. Carry the `kai-icon` JSX augmentation across byte-identical to the one in `src/elements/primitives.stories.tsx`. `./register` becomes `../elements/register`. Registry ingredients already say `kai-icon`; the contract test checks both directions.

- [ ] **Step 2: `packages/ui/src/screens/dashboard.tsx`**

Move `proof-dashboard.stories.tsx` the same way. No JSX augmentation (no kai-* tag), no registration import — its ingredients list is empty and the test enforces that the markup places no `<kai-` tag.

- [ ] **Step 3: `packages/ui/src/screens/data-table.tsx`**

Move `proof-data-table.stories.tsx`. `./search` becomes `../elements/search`; the `kai-search` augmentation must match `src/elements/search.stories.tsx`'s byte-for-byte. Keep the `el.addEventListener('kai-search', …)` ref callback exactly as it is — a non-bubbling `kai-*` event listened for on the element itself, in a ref, is the contract, and this screen is one of the places a reader will copy it from.

- [ ] **Step 4: `packages/ui/src/screens/empty-states.tsx`**

Move `proof-empty-states.stories.tsx`, including the `Pattern` interface, the `PATTERNS` array, the three button class constants and the `EmptyStatePanel` helper.

- [ ] **Step 5: Add the four stories**

In `screens.stories.tsx`, add four `?raw` imports and four story exports, each the same three lines as `Auth`:

```tsx
import PricingScreen from '../screens/pricing';
import pricingSource from '../screens/pricing.tsx?raw';
// … dashboard, data-table, empty-states

export const Pricing: Story = { name: 'Pricing', render: () => <PricingScreen />, parameters: source(pricingSource) };
export const Dashboard: Story = { name: 'Dashboard', render: () => <DashboardScreen />, parameters: source(dashboardSource) };
export const DataTable: Story = { name: 'Data Table', render: () => <DataTableScreen />, parameters: source(dataTableSource) };
export const EmptyStates: Story = { name: 'Empty States', render: () => <EmptyStatesScreen />, parameters: source(emptyStatesSource) };
```

- [ ] **Step 6: Add the story-coverage assertion to the contract test**

Append to `screens.test.tsx`. This is the derivation that keeps a registered screen from having no story:

```tsx
describe('the Labs/Screens story group covers the registry', () => {
  const exportName = (id: string): string =>
    id.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

  it('exports one story per registered screen, plus About', async () => {
    const mod = (await import('../elements/screens.stories')) as Record<string, unknown>;
    const stories = Object.keys(mod).filter((k) => k !== 'default');
    expect(stories.sort()).toEqual(['About', ...SCREENS.map((s) => exportName(s.id))].sort());
  });

  it('every story renders its screen and carries the real file as its source', async () => {
    const mod = (await import('../elements/screens.stories')) as Record<
      string,
      { render: () => unknown; parameters?: { docs?: { source?: { code?: string } } } }
    >;
    for (const s of SCREENS) {
      const story = mod[exportName(s.id)];
      const { container, unmount } = render(() => story.render() as never);
      expect(container.firstElementChild, `${s.id} story rendered nothing`).not.toBeNull();
      unmount();
      const code = story.parameters?.docs?.source?.code ?? '';
      const file = readFileSync(join(HERE, `${s.id}.tsx`), 'utf8');
      expect(code, `${s.id}'s source panel is not the file itself`).toBe(file);
    }
    cleanup();
  });
});
```

The second assertion is the one that kills the two-copy defect for good: the source panel is byte-equal to the module, so a hand-written skeleton cannot come back.

- [ ] **Step 7: Delete the proof stories, including `proof-about.stories.tsx`**

The About card's framing now lives in the `Labs/Screens` About story (Task 2, Step 2). Delete all five remaining `proof-*.stories.tsx`. Keep `docs/labs-proofs-gap-backlog.md` — it is a real record and the About card links it.

- [ ] **Step 8: Fix the catalog inventory — the group rename has one real consumer**

The spec says "nothing in the repo pins the old ids beyond comments". That is true of the story **ids** (`labs-proofs--*`) and false of the group **title**: `lint:catalog-drift` resolves every inventory row against the `Labs/X` titles it parses out of the tree, and `src/agent-tooling/catalog/surfaces.ts` carries a row named `Proofs`. Renaming the group without this edit fails the lint with `inventory: "Proofs" matches no Labs story title or Labs/Apps story file in the tree.`

In `surfaces.ts`, replace the last inventory row:

```ts
  { title: 'Screens', sort: 'corpus', note: 'whole app screens from tokens + general-UI elements; each one a src/screens/ module the docs preview and the kai MCP serve' },
```

In `surfaces.test.ts`, the corpus-title literal list (the file's own comment calls this out as a deliberate copy — "changing one means changing both"):

```ts
    for (const t of ['Screens', 'Chat Slots', 'Prompt Input Slots', 'Workspace Slots']) {
```

Also update the surrounding prose in `surfaces.ts`'s comment block (item 2 of the "what deletion does not cover" list) from `Proofs` to `Screens`.

Leave two other `Labs/Proofs` occurrences alone: the historical narrative in `src/agent-tooling/catalog/labs-titles.ts`'s header (a record of a past defect — rewriting it into a falsehood is worse than a stale name) and the synthetic fixture string in `scripts/lint-catalog-drift.mjs`'s self-test (a made-up input, not a reference to the tree).

- [ ] **Step 9: Grep for anything else that names the old group or files**

Run: `grep -rn "labs-proofs\|Labs/Proofs\|proof-auth\|proof-pricing\|proof-dashboard\|proof-data-table\|proof-empty-states\|proof-about" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.json" --include="*.md" --include="*.mdx" . | grep -v node_modules`
Expected: only `docs/labs-proofs-gap-backlog.md`, the two deliberate leavings from Step 8, and this plan/spec. Anything else is a pin nobody knew about — fix it in this task and say so in the report.

- [ ] **Step 10: Run the gates**

```
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/screens/
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog/
cd packages/ui && npm run lint:catalog-drift
cd packages/ui && npm run typecheck
```
Expected: all four PASS. The contract test's id/file equality is now satisfied for the five extracted screens.

- [ ] **Step 11: Story screenshots — the parity check for the other four**

With Storybook dev running, screenshot each of `labs-screens--pricing`, `--dashboard`, `--data-table`, `--empty-states` in light and dark, and compare each against the corresponding pre-extraction proof screenshot. Save under `docs/superpowers/research/2026-08-30-screens-gallery/`.
Expected: pixel-equivalent. A difference means the move was not a move.

- [ ] **Step 12: axe**

Run: `pnpm --filter @kitn.ai/ui run test:storybook`
Expected: green for the `Labs/Screens` files. The Storybook vitest project runs axe per story with `a11y.test: 'error'`, so an a11y regression in an extracted screen fails here. This project is flaky under parallel load (it is advisory in CI for that reason) — if it flakes, re-run and paste both runs.

---

### Task 4: Settings — the story, story-first

The design does not exist yet, so this task specifies the anatomy rather than leaving it to a later judgement. It lands as a story with stub data, gets screenshotted for the owner, and only then extracts (Task 5).

**Files:**
- Modify: `packages/ui/src/elements/screens.stories.tsx` (a `Settings` story whose render body lives inline in the story for the design round)

**Interfaces:**
- Produces: the `Settings` story under `Labs/Screens`.
- Consumes: `../elements/tabs`, `../elements/input`, `../elements/switch`, `../elements/select`, `../elements/avatar`, `../elements/button`, `../elements/separator`, `lucide-solid`, `solid-js`.

**The anatomy (concrete, not "design a settings screen"):**

A single-column settings page, `min-h-screen bg-surface-sunken`, a `max-w-3xl` centered column with `px-6 py-10`. This is the entry that carries the positioning claim — the other five prove tokens, this one composes the **general-UI atoms** — so every control is a kai-* element, not markup.

- **Page header.** `h1` "Settings" (`text-xl font-semibold tracking-tight`), one muted line under it: "Manage your profile, appearance and notifications."
- **Section nav: `<kai-tabs variant="underline">`**, `items` set as a JS property in a ref callback (arrays are never HTML attributes), four tabs: `{ id: 'profile', label: 'Profile' }`, `{ id: 'appearance', label: 'Appearance' }`, `{ id: 'notifications', label: 'Notifications' }`, `{ id: 'account', label: 'Account' }`. `defaultValue="profile"`. The `kai-tab-change` listener is added on the element itself in the same ref callback and drives a local `createSignal` for which section renders. Tabs, not a left rail: one column reads correctly at the widths a docs iframe gets, and `kai-tabs` is an atom this gallery exists to show.
- **The Section/Field/Row rhythm** from the builder rounds, restated locally (a screen may not import `../components/builder-panel` — that is the import rule, and it is the positioning claim): three small local helpers in this file, at page scale rather than the builder panel's 320px scale.
  - `Section({ title, description, children })` → `<section class="rounded-xl border border-border bg-card p-6">` with an `h2` (`text-sm font-semibold`), an optional muted description line, and `mt-5 flex flex-col gap-5` for the body. Sections stack with `gap-6`.
  - `Field({ label, hint, children })` → a labelled control block, `flex flex-col gap-1.5`, hint in `text-xs text-muted-foreground`.
  - `Row({ label, hint, children })` → label+hint on the left, control on the right, `flex items-start justify-between gap-6`. This is the shape every switch row uses.
- **Profile section** — "Profile", description "How you appear to your team."
  - An identity row: `<kai-avatar size="lg" fallback="AT" alt="Ava Thompson">` beside the name and email in `text-sm`, with `<kai-button variant="outline" size="sm">Change photo</kai-button>` on the right.
  - `<kai-separator>`.
  - `Field` "Display name" → `<kai-input value="Ava Thompson" name="displayName">`.
  - `Field` "Email" → `<kai-input type="email" value="ava@acme.io" name="email">` with a leading `Mail` glyph in the `leading` slot.
  - `Field` "Role" hint "Ask an owner to change this." → `<kai-select disabled>` with `options` `[{ value: 'owner', label: 'Owner' }, { value: 'admin', label: 'Admin' }, { value: 'member', label: 'Member' }]` set as a property, `value="owner"`.
  - A footer action row: `<kai-button>Save changes</kai-button>` and `<kai-button variant="ghost">Cancel</kai-button>`, right-aligned.
- **Appearance section** — "Appearance", description "Applies to this browser."
  - `Field` "Theme" → `<kai-select>` with `options` `[{ value: 'system', label: 'Match system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]`, `value="system"`.
  - `Row` "Reduce motion", hint "Turn off transitions and animated states." → `<kai-switch>`.
  - `Row` "Compact density", hint "Tighter spacing in lists and tables." → `<kai-switch checked>`.
- **Notifications section** — "Notifications", description "Where we reach you."
  - Three `Row`s, each with a `<kai-switch>`: "Product updates" (on), "Mentions and replies" (on), "Weekly digest" (off), each with a one-line hint.
  - `Field` "Digest day" → `<kai-select>` with the seven weekday options, `value="mon"`, shown only when the digest switch is on (`<Show>`), so the screen demonstrates one conditional control rather than a wall of static ones.
- **Account section** — "Account".
  - `Row` "Two-factor authentication", hint "Require a code at sign-in." → `<kai-switch checked>`.
  - `<kai-separator>`.
  - A danger block: `rounded-lg border border-destructive/40 bg-destructive/5 p-4`, an `h3` "Delete account", one muted line "This removes your workspace and every conversation in it. This cannot be undone.", and `<kai-button variant="destructive" size="sm">Delete account</kai-button>`. Destructive styling comes from the destructive token, at low alpha for the fill — the same tint discipline the empty-states screen uses.

No persistence, no routing, no validation: every control is stub-bound to a local signal. It is a screen, not an app.

- [ ] **Step 1: Write the story**

Add `Settings` to `screens.stories.tsx` with the anatomy above, its render body inline for the design round. Set every array/object prop (`items`, `options`) as a JS property inside a `ref` callback, never as an attribute, and add every `kai-*` listener on the element itself in the same callback.

Note the story-coverage test from Task 3 Step 6 will now FAIL (a `Settings` export with no registry entry). That is correct and expected until Task 5 — the failure message names exactly that, and it is the guard doing its job. Run it and paste the failure rather than pre-empting it.

- [ ] **Step 2: Run the story in Storybook and fix what the browser says**

Run Storybook in the foreground: `pnpm --filter @kitn.ai/ui run dev`. Open `Labs/Screens/Settings`.
Expected: every control renders as a real kit control, not raw OS chrome. If a class you used is missing from the checked-in `compiled.css`, say so in the report rather than restarting Storybook yourself.

- [ ] **Step 3: axe on the new story**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=storybook src/elements/screens.stories.tsx`
Expected: PASS. Common catches here: heading order (the page `h1`, section `h2`s, the danger `h3` — no skipped level), and every switch/select carrying an accessible name via its `label` prop.

- [ ] **Step 4: Screenshots for the owner (explicit deliverable)**

Capture `labs-screens--settings` in **light and dark**, full page, at a desktop width, and save to `docs/superpowers/research/2026-08-30-screens-gallery/settings-light.png` and `settings-dark.png`. Name both paths in the task report so the owner can look without hunting.

This is show-first for unseen UI. **Do not block on a reply** — standing autonomy applies, so proceed to Task 5. If the owner responds later with changes, they land in the story first and re-extract.

---

### Task 5: Extract Settings

**Files:**
- Create: `packages/ui/src/screens/settings.tsx`
- Modify: `packages/ui/src/screens/registry.ts`, `packages/ui/src/elements/screens.stories.tsx`

- [ ] **Step 1: Move the render body into `src/screens/settings.tsx`**

Same shape as `auth.tsx`: default-exported component, the local `Section`/`Field`/`Row` helpers, relative registration imports for each element it uses, and the `declare module 'solid-js'` augmentations for `kai-tabs`, `kai-input`, `kai-switch`, `kai-select`, `kai-avatar`, `kai-button` and `kai-separator` — each byte-identical to the existing augmentation for that tag elsewhere in the tree (grep `'kai-<tag>':` under `src/` first; TS2717 is the cost of guessing).

- [ ] **Step 2: Add the registry entry**

Append to `SCREENS` in `registry.ts`:

```ts
  {
    id: 'settings',
    title: 'Settings',
    blurb:
      'App settings: profile, appearance, notifications and account, composed entirely from the kit\'s general-purpose elements.',
    ingredients: ['kai-tabs', 'kai-input', 'kai-switch', 'kai-select', 'kai-avatar', 'kai-button', 'kai-separator'],
    notes: [
      'This is the screen made of ELEMENTS rather than markup: tabs, inputs, switches, selects, an avatar, buttons and separators are all the kit\'s, and the page around them is token utilities.',
      'Array props — kai-tabs items, kai-select options — are set as JavaScript properties in a ref callback. Arrays cannot be HTML attributes.',
      'kai-* events do not bubble. Every listener here goes on the element itself, in the same ref callback that sets its properties.',
      'Nothing persists. Each control is bound to a local signal, so the screen is a starting point rather than a settings system.',
    ],
  },
```

- [ ] **Step 3: Point the story at the module**

Replace the inline render body with `render: () => <SettingsScreen />` plus `parameters: source(settingsSource)` and the two imports, exactly like the other five.

- [ ] **Step 4: Run the contract + story tests**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/screens/`
Expected: PASS, including the story-coverage and source-panel-equals-file assertions for all six screens.

- [ ] **Step 5: Typecheck and re-screenshot**

Run: `cd packages/ui && npm run typecheck`, then re-capture the Settings story light/dark and confirm the extraction changed nothing visually.

---

### Task 6: The MCP feed — generator, recipes, gates

**Files:**
- Create: `packages/ui/scripts/gen-screen-recipes.mjs`
- Create: `packages/ui/tests/scripts/gen-screen-recipes.test.ts`
- Generated: `packages/ui/src/agent-tooling/recipes/generated/screens.json`
- Modify: `packages/ui/src/agent-tooling/recipes/types.ts`, `packages/ui/src/agent-tooling/recipes/index.ts`, `packages/ui/package.json`, `packages/ui/scripts/verify-generated-sync.mjs`, `packages/ui/scripts/verify-artifact-fresh.mjs`, `packages/ui/scripts/verify-scaffold-compiles.mjs`, `packages/ui/scripts/lib/consumer-tsc-projects.mjs`

**Interfaces:**
- Produces: `export function rewriteScreenImports(source, id)` from `scripts/gen-screen-recipes.mjs`; `src/agent-tooling/recipes/generated/screens.json` shaped `{ [id]: { meta: { id, title, intent, ingredients, notes }, code } }`; `screen-<id>` entries in `codeRecipes`.
- Consumes: `src/screens/registry.ts` (via the esbuild `importTs` helper) and each `src/screens/<id>.tsx` as text.

- [ ] **Step 1: Write the rewrite's test first**

Create `packages/ui/tests/scripts/gen-screen-recipes.test.ts`. The rewrite is the one piece of this generator that can be silently wrong — a bad rewrite emits code that compiles in this repo and not in a consumer's, which is the exact failure class `verify:scaffold` exists for, so it gets a unit test of its own on top of the compile gate.

```ts
// The import rewrite that makes a screen module consumer-shaped. It is exported
// from the generator and tested here because a wrong rewrite is invisible: the
// kit's own tree keeps compiling either way, and only a consumer finds out.
import { describe, it, expect } from 'vitest';
import { rewriteScreenImports } from '../../scripts/gen-screen-recipes.mjs';

describe('rewriteScreenImports', () => {
  it('replaces a relative element registration with the published entry point', () => {
    const out = rewriteScreenImports(
      "import { createSignal } from 'solid-js';\nimport '../elements/input';\n\nexport default function S() {}\n",
      'auth',
    );
    expect(out).toContain("import '@kitn.ai/ui/elements';");
    expect(out).not.toContain('../elements/input');
    expect(out).toContain("import { createSignal } from 'solid-js';");
  });

  it('collapses several registrations into ONE published import, at the first position', () => {
    const out = rewriteScreenImports(
      "import '../elements/tabs';\nimport '../elements/switch';\nimport '../elements/select';\nexport default function S() {}\n",
      'settings',
    );
    expect(out.match(/@kitn\.ai\/ui\/elements/g)).toHaveLength(1);
    expect(out.split('\n')[0]).toBe("import '@kitn.ai/ui/elements';");
  });

  it('leaves a screen with no registrations untouched', () => {
    const src = "import { For } from 'solid-js';\nexport default function S() {}\n";
    expect(rewriteScreenImports(src, 'dashboard')).toBe(src);
  });

  it('keeps solid-js and lucide-solid imports exactly as authored', () => {
    const out = rewriteScreenImports(
      "import { For } from 'solid-js';\nimport { Dynamic } from 'solid-js/web';\nimport { Mail } from 'lucide-solid';\nexport default function S() {}\n",
      'x',
    );
    expect(out).toContain("from 'solid-js/web'");
    expect(out).toContain("from 'lucide-solid'");
  });

  it('REFUSES a relative import that is not a bare element registration', () => {
    expect(() =>
      rewriteScreenImports("import { cn } from '../utils/cn';\nexport default function S() {}\n", 'auth'),
    ).toThrow(/\.\.\/utils\/cn/);
    expect(() =>
      rewriteScreenImports("import { Card } from '../ui/card';\nexport default function S() {}\n", 'auth'),
    ).toThrow(/\.\.\/ui\/card/);
  });

  it('REFUSES a named import from an element module — a screen registers, it does not reach inside', () => {
    expect(() =>
      rewriteScreenImports("import { KaiInput } from '../elements/input';\nexport default function S() {}\n", 'auth'),
    ).toThrow(/binding/i);
  });

  it('REFUSES an unknown package', () => {
    expect(() =>
      rewriteScreenImports("import x from 'left-pad';\nexport default function S() {}\n", 'auth'),
    ).toThrow(/left-pad/);
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/gen-screen-recipes.test.ts`
Expected: FAIL to resolve `../../scripts/gen-screen-recipes.mjs`.

- [ ] **Step 3: Write the generator**

Create `packages/ui/scripts/gen-screen-recipes.mjs`. It mirrors `gen-construct-template-fixtures.mjs` (same `importTs` esbuild trick, same "write and log each file" shape), with the rewrite exported so the test above drives it directly.

```js
// Writes src/agent-tooling/recipes/generated/screens.json — the §4-registered
// DERIVED COPY of the screens gallery. `src/screens/registry.ts` supplies the
// metadata and `src/screens/<id>.tsx` supplies the code; nothing here is
// restated by hand.
//
// The copy exists because a `CodeRecipe`'s `files[].code` is a string the MCP
// hands to a builder, and a .tsx module is not a string. Making the recipe a
// hand-written file with the source pasted in is exactly the two-copy defect
// this gallery was built to remove, so the paste is done by a generator and
// guarded by verify:generated.
//
// THE REWRITE is the whole reason this is not a `readFileSync`. In the tree a
// screen registers elements relatively (`../elements/input`) so Storybook and
// the kit's own tsc work on an UNBUILT tree — the dist-first self-import trap.
// A consumer has no such path: they register with one `@kitn.ai/ui/elements`
// import. Anything that is neither a registration nor an allowed package is a
// hard ERROR rather than a best-effort rewrite: a screen that reaches into
// components/ or ui/ is not a screen a consumer can build, and emitting it
// anyway would hand somebody code that cannot compile outside this repo.
// `verify:scaffold` then compiles every emitted file under the solid consumer
// project, so the rewrite is proven rather than assumed.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Packages a screen may import. A consumer installs exactly these. */
const ALLOWED_PACKAGES = new Set(['solid-js', 'solid-js/web', 'lucide-solid']);
/** The one relative form allowed: a BARE registration import of one element. */
const REGISTRATION = /^\.\.\/elements\/[a-z0-9-]+$/;
const PUBLISHED_REGISTRATION = "import '@kitn.ai/ui/elements';";

/**
 * The screen module's text, made consumer-shaped.
 * @param {string} source raw `src/screens/<id>.tsx`
 * @param {string} id     the screen id, for error messages
 * @returns {string}
 */
export function rewriteScreenImports(source, id) {
  const lines = source.split('\n');
  const out = [];
  let emittedRegistration = false;

  for (const line of lines) {
    const bare = line.match(/^import '([^']+)';\s*$/);
    if (bare) {
      const spec = bare[1];
      if (REGISTRATION.test(spec)) {
        if (!emittedRegistration) {
          out.push(PUBLISHED_REGISTRATION);
          emittedRegistration = true;
        }
        continue;
      }
      if (!ALLOWED_PACKAGES.has(spec)) {
        throw new Error(
          `screen '${id}' imports '${spec}'. A screen may import ${[...ALLOWED_PACKAGES].join(', ')} ` +
            "or a bare '../elements/<x>' registration, and nothing else — everything here is code a " +
            'consumer is handed.',
        );
      }
      out.push(line);
      continue;
    }

    const bound = line.match(/^import (?:type )?[^;]*?from '([^']+)';\s*$/);
    if (bound) {
      const spec = bound[1];
      if (REGISTRATION.test(spec)) {
        throw new Error(
          `screen '${id}' imports a binding from '${spec}'. A screen REGISTERS an element ` +
            "(`import '../elements/<x>';`) and then uses its tag; it never reaches inside the module.",
        );
      }
      if (!ALLOWED_PACKAGES.has(spec)) {
        throw new Error(
          `screen '${id}' imports '${spec}'. A screen may import ${[...ALLOWED_PACKAGES].join(', ')} ` +
            "or a bare '../elements/<x>' registration, and nothing else.",
        );
      }
    }
    out.push(line);
  }

  return out.join('\n');
}

async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'gen-screen-recipes-'));
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

// `import.meta.main` is not available on every Node in CI, so the module guards
// on argv instead: imported by the test, it only exports; run by build:api, it
// writes.
const RUN_AS_SCRIPT = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (RUN_AS_SCRIPT) {
  const { SCREENS } = await importTs(join(PKG_ROOT, 'src/screens/registry.ts'));
  if (!Array.isArray(SCREENS) || SCREENS.length === 0) {
    console.error('\n✗ gen-screen-recipes: the registry lists no screens. Refusing to write an empty artifact.\n');
    process.exit(1);
  }

  const OUT_DIR = join(PKG_ROOT, 'src/agent-tooling/recipes/generated');
  mkdirSync(OUT_DIR, { recursive: true });

  const payload = {};
  for (const screen of SCREENS) {
    const file = join(PKG_ROOT, 'src/screens', `${screen.id}.tsx`);
    const code = rewriteScreenImports(readFileSync(file, 'utf8'), screen.id);
    payload[screen.id] = {
      meta: {
        id: screen.id,
        title: screen.title,
        // The registry's `blurb` IS the recipe's intent. One sentence, one
        // source: the gallery lead, the docs description and the MCP intent
        // are the same string by construction.
        intent: screen.blurb,
        ingredients: [...screen.ingredients],
        notes: [...screen.notes],
      },
      code,
    };
  }

  const out = join(OUT_DIR, 'screens.json');
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`  · wrote ${out} (${Object.keys(payload).length} screen(s))`);
}
```

- [ ] **Step 4: Run the rewrite test**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/gen-screen-recipes.test.ts`
Expected: PASS, all seven.

- [ ] **Step 5: Wire the generator into `build:api` and generate**

In `packages/ui/package.json`, append to `build:api`:

```
&& node scripts/gen-screen-recipes.mjs
```

Run: `cd packages/ui && node scripts/gen-screen-recipes.mjs`
Expected: `· wrote …/generated/screens.json (6 screen(s))`. Open the JSON and confirm each `code` starts with the solid-js import and carries `import '@kitn.ai/ui/elements';` exactly where a registration used to be, and that `dashboard`/`empty-states` carry none.

- [ ] **Step 6: Widen the recipe file lang and map the JSON**

In `src/agent-tooling/recipes/types.ts`:

```ts
  lang: 'ts' | 'tsx' | 'html' | 'css';
```

Update the type's doc comment: the sentence "compiles every `lang: 'ts'` file" becomes "compiles every `lang: 'ts'` file under the stock consumer project and every `lang: 'tsx'` file under the solid one".

In `src/agent-tooling/recipes/index.ts`:

```ts
import type { CodeRecipe } from './types';
import { composedThread } from './composed-thread';
import screensJson from './generated/screens.json';

export type { CodeRecipe, CodeRecipeFile } from './types';

/** The gallery screens, as recipes. Generated at build:api time from
 *  src/screens/registry.ts + src/screens/<id>.tsx by
 *  scripts/gen-screen-recipes.mjs — this module maps, it never restates.
 *  Ids are `screen-<id>` so a recipe name can never collide with an element
 *  tag (reference.test.ts asserts that generically over this list). */
const screenRecipes: CodeRecipe[] = Object.values(
  screensJson as Record<string, { meta: { id: string; title: string; intent: string; ingredients: string[]; notes: string[] }; code: string }>,
).map((s) => ({
  id: `screen-${s.meta.id}`,
  title: s.meta.title,
  intent: s.meta.intent,
  ingredients: s.meta.ingredients,
  notes: [
    ...s.meta.notes,
    'Solid JSX. For React swap `class` for `className` and `<For>` for `.map()`; for Vue/Svelte the markup and the token classes carry over unchanged. Icons come from lucide-solid — install it, or swap in your own icon set.',
  ],
  files: [{ path: `src/screens/${s.meta.id}.tsx`, lang: 'tsx', code: s.code }],
}));

export const codeRecipes: CodeRecipe[] = [composedThread, ...screenRecipes];

export function listCodeRecipes(): CodeRecipe[] {
  return codeRecipes;
}

export function getCodeRecipe(id: string): CodeRecipe | undefined {
  return codeRecipes.find((r) => r.id === id);
}
```

The framework-translation line is appended here, once, rather than repeated in every registry entry's `notes` — it is the same sentence for every screen, so it has one home.

- [ ] **Step 7: Register the artifact with both freshness guards**

In `scripts/verify-generated-sync.mjs`, add to `GENERATED` (after the construct fixtures, before `docs/web-components.md`):

```js
  { file: 'packages/ui/src/agent-tooling/recipes/generated/screens.json', probe: 'overwrite' },
```

In `scripts/verify-artifact-fresh.mjs`, add to `GENERATED_SOURCES`:

```js
  'src/agent-tooling/recipes/generated/screens.json', // scripts/gen-screen-recipes.mjs (build:api, postbuild)
```

That second edit is not optional: `build:api` runs in `postbuild`, so this file's mtime is always newer than `dist/`, and the guard's own comment says a new postbuild-written source that is not listed makes a correctly built tree fail instantly. (Note for the executor: `construct.v1.schema.json` and the construct template fixtures are in the same position and are **not** listed — a pre-existing gap in that list, not something this arc introduces and not something to fix here. If `verify:fresh` is red for those paths, it was red before you started; say so and move on.)

- [ ] **Step 8: Teach `verify:scaffold` to compile a tsx recipe**

In `scripts/verify-scaffold-compiles.mjs`, in the code-recipe block: recipe files are currently selected with `f.lang === 'ts'` and every one is written into `PROJECTS[PROJECT.html].dir` with a `.ts` extension, so a `tsx` file would be silently skipped — the exact "passes vacuously" shape this repo keeps paying for.

```js
  let recipeFiles = 0;
  for (const r of CODE_RECIPES) {
    // 'ts' compiles under the stock consumer project; 'tsx' under the SOLID
    // one (jsx: preserve + jsxImportSource), the same project the solid
    // front-end cells use. Selecting by an explicit set rather than `!== 'html'`
    // keeps a future lang from being swept into a project that cannot check it.
    const compilable = r.files.filter((f) => f.lang === 'ts' || f.lang === 'tsx');
    if (compilable.length === 0)
      fail(`code recipe '${r.id}' has no TypeScript file — a recipe of prose compiles nothing and proves nothing.`);
    …
    for (const f of compilable) {
      const project = f.lang === 'tsx' ? PROJECT.solid : PROJECT.html;
      const stem = f.path.replace(/\.tsx?$/, '').replace(/[^A-Za-z0-9_-]+/g, '_');
      const label = `recipe__${r.id}__${stem}`;
      if (FILTER && !label.includes(FILTER)) continue;
      writeFileSync(join(PROJECTS[project].dir, `${label}.${f.lang}`), f.code);
      cases.push({ label, project });
      recipeFiles++;
    }
  }
  console.log(`  · compiling ${recipeFiles} code-recipe file(s) from ${CODE_RECIPES.length} registered recipe(s)`);
```

`usedProjects` already reads `c.project ?? PROJECT[c.framework]`, so the solid project joins the tsc run with no further change. Rename the loop's `tsFiles` binding to `compilable` throughout the block (the anti-vacuity `fail` above uses it).

- [ ] **Step 9: Give the consumer project `lucide-solid`**

In `scripts/lib/consumer-tsc-projects.mjs`, add `'lucide-solid'` to the symlinked package list, in the front-end block beside `solid-js`, with a one-line comment: the gallery screens import it, and it is a real dependency of this package, never a `declare module` stub — a stub resolves every glyph to `any` and the gate goes back to proving nothing.

- [ ] **Step 10: Run the gates, in this order**

```
cd packages/ui && npm run build:api
cd packages/ui && npm run verify:generated
cd packages/ui && npm run verify:scaffold
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/
cd packages/ui && npm run verify:pack
```

Expected: `verify:generated` PASSES (self-test first, then the real run). `verify:scaffold` PASSES and its printed lines must show (a) the code-recipe count grown by six, (b) `solid` among the `project(s)` it ran tsc over, and (c) a clean `N/N scaffolds compile`. **Read the printed numbers; do not quote any number from this plan.** `reference.test.ts`'s generic recipe assertions (the list names every recipe; no id shadows an element tag or a reserved topic) cover the six new ids with no test edit. `verify:pack` needs a build first — if the unpacked total moves near `MAX_UNPACKED_BYTES`, that is a conversation, not a silent raise.

If `verify:scaffold` reports unused locals or strict errors inside an emitted screen, fix the SCREEN module (`noUnusedLocals` is stricter than the kit's own tsconfig, so a leftover import can survive here and fail there) — never relax the project.

- [ ] **Step 11: Confirm the MCP actually serves one**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/reference.test.ts`
Expected: PASS. Then eyeball one recipe end to end by adding a temporary assertion or a scratch node script that calls `getCodeRecipe('screen-auth')` and prints `files[0].code.split('\n').slice(0,4)` — the first lines must be the solid-js import and `import '@kitn.ai/ui/elements';`. Delete the scratch script before committing.

---

### Task 7: The docs gallery — preview route, islands, pages, topic

**Files:**
- Create: `apps/docs/src/pages/screens/preview/[id].astro`, `apps/docs/src/styles/screen-preview.css`, `apps/docs/src/components/ScreenPreview.tsx`, `apps/docs/src/components/ScreenSource.tsx`, `apps/docs/src/components/ScreenIndex.tsx`
- Create: `apps/docs/src/content/docs/screens/{overview,auth,pricing,dashboard,data-table,empty-states,settings}.mdx`
- Modify: `apps/docs/astro.config.mjs`, `apps/docs/package.json`
- Create: `packages/ui/tests/docs/screens-pages.test.ts`

**Interfaces:**
- Produces: the `/screens/preview/<id>/` routes and the `Screens` sidebar topic.
- Consumes: `packages/ui/src/agent-tooling/recipes/generated/screens.json` (metadata + the consumer-shaped code — the same bytes the MCP serves) and `packages/ui/src/screens/<id>.tsx` (the live component, via `import.meta.glob`).

**Two decisions the spec left open, resolved here:**

1. **The copy panel shows the GENERATED code, not the `?raw` file.** The raw file registers elements with a relative `../elements/input` path — copy that into an app and it does not resolve. The generated `code` in `screens.json` is the same module with `import '@kitn.ai/ui/elements';` in that spot, it is the byte-identical thing the MCP hands a coding agent, and `verify:scaffold` compiles it. Showing anything else would put a broken copy button on a page whose entire job is the copy button. The story keeps the `?raw` file, which is correct there: Storybook shows the authored source.
2. **The docs read the JSON for metadata, not `registry.ts`.** One cross-workspace import instead of two, no TypeScript leaf compiled by two toolchains, and the docs page set is then keyed off the same artifact the MCP is.

- [ ] **Step 1: Configure the docs Vite for the cross-package source import**

In `apps/docs/astro.config.mjs`, extend the existing `vite` block:

```js
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

  vite: {
    plugins: [tailwindcss(), Icons({ compiler: 'solid' })],
    // The screen previews import Solid modules from packages/ui/src/screens/
    // directly — the ONE place this site compiles kit source instead of the
    // built package. It has to: a screen is light-DOM markup over the kit's
    // Tailwind theme, so there is nothing in dist/ to render, and the point of
    // the gallery is that the page and the story are the same module.
    server: { fs: { allow: [REPO_ROOT] } },
    // One Solid runtime. The workspace hoists a single solid-js today, so this
    // changes nothing right now; it is here so that the day it does not, the
    // failure is an install-time dedupe rather than a blank preview and a
    // reactivity bug nobody can reproduce.
    resolve: { dedupe: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  },
```

Add `lucide-solid` to `apps/docs/package.json` dependencies (match the version `packages/ui/package.json` declares — read it, do not guess), then `pnpm install` at the repo root.

- [ ] **Step 2: Add the `Screens` topic, derived**

In the same file, above `defineConfig`:

```js
import { readFileSync } from 'node:fs';

// The gallery's page list is DERIVED from the generated screens artifact — the
// same file the docs islands and the kai MCP read. Typing the six slugs here
// would be a seventh copy of a list the repo already knows.
const SCREEN_IDS = Object.keys(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../packages/ui/src/agent-tooling/recipes/generated/screens.json', import.meta.url)),
      'utf8',
    ),
  ),
);
```

and insert the topic after `Examples`:

```js
    {
      label: 'Screens',
      link: '/screens/overview/',
      id: 'screens',
      items: ['screens/overview', ...SCREEN_IDS.map((id) => `screens/${id}`)],
    },
```

Match the surrounding topics' exact object shape when you write it — read the array first; the shape above is what the file uses today, but the file is the authority.

- [ ] **Step 3: The preview stylesheet**

Create `apps/docs/src/styles/screen-preview.css`. This is the only stylesheet on the site that imports the kit's theme, and it is safe here for the reason the Solid starter is safe: **Tailwind processes it**. The raw-browser-import trap (which discards the `@theme` block whole) is a different situation.

```css
/* The screen-preview route's stylesheet, and nothing else's.

   It is NOT app.css: this route is a bare, full-bleed page with no Starlight
   chrome, and what it needs is the KIT's token layer (--color-card,
   --color-surface-sunken, the tool-* hues, .kai-elevation) rather than the
   docs site's own --kai-*/ink scale. Importing @kitn.ai/ui/theme.css into
   app.css would restyle the whole site; importing it here restyles one iframe.

   source(none) + explicit @source lines, the same discipline
   packages/ui/src/elements/styles.css keeps: automatic detection would scan
   apps/docs and compile utilities for pages this sheet never serves, and would
   still miss packages/ui/src/screens, which is outside this app entirely. */
@import "tailwindcss" source(none);
@import "@kitn.ai/ui/theme.css";

@source "../../../../packages/ui/src/screens";
@source "../pages/screens";
@source "../components/ScreenPreviewHost.tsx";

@layer base {
  /* The screen owns the viewport. No margin, no scrollbar of our own — each
     screen brings its own h-screen/min-h-screen container. */
  html,
  body {
    margin: 0;
    background: var(--color-background);
    color: var(--color-foreground);
  }
}
```

`@source "../components/ScreenPreviewHost.tsx"` covers the host island's own wrapper classes (Step 4). Verify each path resolves from the CSS file's own directory — a wrong `@source` compiles nothing and fails silently, which is the whole reason the kit's sheet documents its own paths.

- [ ] **Step 4: The preview host island**

Create `apps/docs/src/components/ScreenPreviewHost.tsx` — the island the full-bleed route mounts. It resolves the screen module by id through a glob (derived: a new screen file is picked up with no edit here), applies the theme from the query string, and answers `postMessage` theme flips from the embedding page.

```tsx
import { createSignal, onCleanup, onMount, Show, type Component, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';

// Every gallery screen module, resolved lazily by id. A GLOB, not a map: a
// hand-written id→import map is exactly the derived list that goes stale, and
// the screens live one directory over with a fixed naming rule.
const modules = import.meta.glob<{ default: Component }>('../../../../packages/ui/src/screens/*.tsx');

type Theme = 'light' | 'dark';

/** Apply a theme to BOTH halves of the page: the light-DOM token utilities
 *  follow the `dark` class on <html> (the scope theme.css defines), while each
 *  kai-* element reads its own `theme` attribute. Setting one and not the
 *  other gives a dark page with light controls on it. */
function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
  for (const el of document.querySelectorAll('*')) {
    if (el.tagName.startsWith('KAI-')) el.setAttribute('theme', theme);
  }
}

export default function ScreenPreviewHost(props: { id: string }): JSX.Element {
  const [Screen, setScreen] = createSignal<Component | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    const key = `../../../../packages/ui/src/screens/${props.id}.tsx`;
    const load = modules[key];
    if (!load) {
      // Loud, not blank. A missing module here means the route was built for an
      // id the screens directory does not have.
      setError(`No screen module for "${props.id}".`);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    applyTheme(params.get('theme') === 'dark' ? 'dark' : 'light');

    const mod = await load();
    setScreen(() => mod.default);

    // The embedding gallery page posts the site theme on every flip. Re-apply
    // AFTER render so kai-* elements mounted by the screen get the attribute.
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string; theme?: Theme } | null;
      if (data?.type === 'kai-screen-theme' && (data.theme === 'light' || data.theme === 'dark')) {
        applyTheme(data.theme);
      }
    };
    window.addEventListener('message', onMessage);
    onCleanup(() => window.removeEventListener('message', onMessage));

    // The screen's own elements upgrade a tick after mount; re-stamp the theme
    // once they exist.
    queueMicrotask(() => applyTheme((document.documentElement.dataset.theme as Theme) ?? 'light'));
  });

  return (
    <Show when={Screen()} fallback={<p class="p-6 text-sm">{error() ?? 'Loading…'}</p>}>
      {(C) => <Dynamic component={C()} />}
    </Show>
  );
}
```

- [ ] **Step 5: The full-bleed route**

Create `apps/docs/src/pages/screens/preview/[id].astro`. There is no existing non-Starlight `.astro` page on this site, so this file owns its whole document.

```astro
---
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ScreenPreviewHost from '../../../components/ScreenPreviewHost.tsx';
import '../../../styles/screen-preview.css';

// Static paths from the generated screens artifact — the same file the topic
// list, the islands and the kai MCP read.
export function getStaticPaths() {
  const screens = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../../packages/ui/src/agent-tooling/recipes/generated/screens.json', import.meta.url)),
      'utf8',
    ),
  ) as Record<string, { meta: { title: string } }>;
  return Object.entries(screens).map(([id, s]) => ({ params: { id }, props: { title: s.meta.title } }));
}

const { id } = Astro.params;
const { title } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- Not indexed: this route exists to be framed by the gallery page. -->
    <meta name="robots" content="noindex" />
    <title>{title} — AI/UI screen preview</title>
  </head>
  <body>
    <ScreenPreviewHost client:only="solid" id={id} />
  </body>
</html>
```

- [ ] **Step 6: Prove the mechanism on ONE screen before writing six pages**

Run: `pnpm --filter @kitn.ai/docs run dev` (foreground) and open `http://localhost:4321/screens/preview/auth/` and `…/auth/?theme=dark`.
Expected: the auth screen renders identically to the `labs-screens--auth` story, in both themes, with `<kai-input>` fully styled (its shadow sheet comes from the kit source the docs Vite compiled).

This step is the plan's load-bearing risk. If it fails, do not paper over it — read the actual error and fix the actual cause:
- "not allowed to be served" → the `server.fs.allow` entry did not resolve; print `REPO_ROOT`.
- `Failed to resolve import "./compiled.css?inline"` → the kit has not been built; run `pnpm --filter @kitn.ai/ui run build:css`.
- Unstyled token markup → the `@source` path in `screen-preview.css` is wrong relative to the CSS file.
- Two Solid runtimes (reactivity dead, or an `_$owner` crash) → the `resolve.dedupe` entry.

Only if the cross-package compilation cannot be made to work at all, take the spec's recorded fallback: point the iframe at the deployed Storybook's `iframe.html?id=labs-screens--<id>`. It has the same zero-copy property and a worse coupling (docs page ↔ Storybook deploy), so it lands **only** with a dated note in `docs/coupling-map.md`.

- [ ] **Step 7: The gallery islands**

Create `apps/docs/src/components/ScreenPreview.tsx` — the iframe embed, inside the existing `Resizer`, mirroring what `Example.tsx` does for element demos:

```tsx
import { onCleanup, onMount } from 'solid-js';
import { Resizer } from './example/Resizer';

const theme = (): 'light' | 'dark' =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/** A gallery screen, framed. The iframe is the geometry answer: these are
 *  full-viewport layouts, and a Starlight content column is not a viewport. */
export default function ScreenPreview(props: { id: string; height?: string }) {
  let frame: HTMLIFrameElement | undefined;

  onMount(() => {
    // Starlight flips data-theme on <html>; forward it to the framed page, the
    // same MutationObserver pattern syncKaiTheme uses for kai-* elements.
    const obs = new MutationObserver(() => {
      frame?.contentWindow?.postMessage({ type: 'kai-screen-theme', theme: theme() }, '*');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    onCleanup(() => obs.disconnect());
  });

  const src = (): string => `${import.meta.env.BASE_URL}screens/preview/${props.id}/?theme=${theme()}`;

  return (
    <div class="not-content my-5">
      <Resizer>
        <iframe
          ref={frame}
          src={src()}
          title={`${props.id} screen preview`}
          loading="lazy"
          class="w-full rounded-xl border border-line bg-surface"
          style={{ height: props.height ?? '620px' }}
        />
      </Resizer>
      <p class="mt-2 text-sm">
        <a href={src()} target="_blank" rel="noreferrer">Open full screen</a>
      </p>
    </div>
  );
}
```

Create `apps/docs/src/components/ScreenSource.tsx` — the copy panel, reading the generated artifact:

```tsx
import { createSignal, For } from 'solid-js';
import screens from '../../../packages/ui/src/agent-tooling/recipes/generated/screens.json';

type Entry = { meta: { id: string; title: string; intent: string; ingredients: string[]; notes: string[] }; code: string };

/** The screen's source, exactly as the kai MCP serves it — the generated,
 *  consumer-shaped module (relative registrations already rewritten to
 *  `import '@kitn.ai/ui/elements';`). Showing the authored file here would put
 *  a relative import nobody can resolve behind a copy button. */
export default function ScreenSource(props: { id: string }) {
  const entry = (): Entry => (screens as Record<string, Entry>)[props.id];
  const [copied, setCopied] = createSignal(false);

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(entry().code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div class="not-content my-5">
      <div class="mb-2 flex items-center justify-between gap-3">
        <p class="text-sm">
          <code>src/screens/{props.id}.tsx</code>
        </p>
        <button type="button" onClick={copy} class="rounded-md border border-line px-2.5 py-1 text-sm">
          {copied() ? 'Copied' : 'Copy source'}
        </button>
      </div>
      <pre class="max-h-[32rem] overflow-auto rounded-xl border border-line bg-surface-2 p-4 text-sm"><code>{entry().code}</code></pre>
      <ul class="mt-4">
        <For each={entry().meta.notes}>{(note) => <li>{note}</li>}</For>
      </ul>
    </div>
  );
}
```

Create `apps/docs/src/components/ScreenIndex.tsx` — the overview page's list, `For`-ing the same JSON into linked cards (title, blurb, and the ingredient tags as `<code>` chips, `href={`${import.meta.env.BASE_URL}screens/${id}/`}`). Keep it to about twenty lines; it is a list, not a layout.

- [ ] **Step 8: The gallery pages**

Create the seven MDX files. Each screen page is the same four things and nothing else — no restated markup, no hand-typed ingredient list, no version literal:

`apps/docs/src/content/docs/screens/auth.mdx`:

```mdx
---
title: Sign in
description: A sign-in screen built from the design tokens, with the kit's own field element for the inputs.
---

import ScreenPreview from '../../../components/ScreenPreview.tsx';
import ScreenSource from '../../../components/ScreenSource.tsx';

A centered sign-in card: email and password with a show/hide toggle, a primary submit, and an OAuth row under a divider. The fields are `kai-input`; everything else is markup over the theme tokens, so light and dark both work with no second stylesheet.

<ScreenPreview client:only="solid" id="auth" />

## Take it

Copy the file into your app, install `lucide-solid` for the glyphs, and keep the token classes. Registering the elements is the one line at the top — see [Installation](/docs/installation/) for the rest.

<ScreenSource client:only="solid" id="auth" />
```

Repeat for `pricing`, `dashboard`, `data-table`, `empty-states`, `settings`, changing only the frontmatter and the one-paragraph lead. Write each lead fresh against the screen in front of you; do not paraphrase this plan or the registry blurb back into the page. Verify the Installation link target actually exists before shipping it (STYLE.md: verify no 404s).

`apps/docs/src/content/docs/screens/overview.mdx` — the guide page. Title: **Build your whole app with AI/UI**. It says three things, in this order:

1. The kit is a token system, a set of general-purpose elements, and the AI feature components on top. Point at the Components topic's own control/foundation pages for the atom list — do **not** type a count of anything.
2. What the gallery proves: these are real screens the kit ships no component for, built from tokens and the elements that do exist. Where the tokens ran out, a component got built — `kai-input` and `kai-search` exist because a screen here needed them.
3. How to take one: open a screen, copy the source, install the noted dependencies, keep the tokens. Framework note in one line (Solid JSX; `class` → `className` and `<For>` → `.map()` for React).

Then `<ScreenIndex client:only="solid" />`. Keep the whole page under a screen of prose — STYLE.md's prime directive applies hardest to the page that exists to make an argument.

- [ ] **Step 9: The page-set test**

`apps/docs` has no test runner and no test tooling, so this check lives where the merge gate already runs: the kit's `unit` project, reaching across the repo the way `verify-generated-sync` and `lint:cdn-pins` already do.

Create `packages/ui/tests/docs/screens-pages.test.ts`:

```ts
// The docs gallery must be exactly the registry: a screen with no page, or a
// page with no screen, fails here. Lives in the kit's unit project because
// apps/docs has no test runner and this is a required-CI gate; it reads the
// docs tree by path, the same way verify-generated-sync writes into it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS } from '../../src/screens/registry';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PAGES = join(REPO, 'apps/docs/src/content/docs/screens');
const CONFIG = join(REPO, 'apps/docs/astro.config.mjs');

describe('the docs Screens topic tracks the registry', () => {
  it('has one page per screen, plus overview, and nothing else', () => {
    const slugs = readdirSync(PAGES)
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => f.replace(/\.mdx$/, ''))
      .sort();
    expect(slugs).toEqual(['overview', ...SCREENS.map((s) => s.id)].sort());
  });

  it('every page embeds the preview and the source panel for its own id', () => {
    for (const s of SCREENS) {
      const page = readFileSync(join(PAGES, `${s.id}.mdx`), 'utf8');
      expect(page, `${s.id}.mdx does not embed its preview`).toContain(`<ScreenPreview client:only="solid" id="${s.id}"`);
      expect(page, `${s.id}.mdx does not embed its source panel`).toContain(`<ScreenSource client:only="solid" id="${s.id}"`);
    }
  });

  it('the sidebar item list is DERIVED, not typed', () => {
    // A literal `screens/<id>` in the config means somebody replaced the
    // derivation with a list, which is the drift this whole arc removes.
    const config = readFileSync(CONFIG, 'utf8');
    for (const s of SCREENS) {
      expect(config, `astro.config.mjs hard-codes screens/${s.id}`).not.toContain(`screens/${s.id}`);
    }
    expect(config).toContain('screens/overview');
  });

  it('no gallery page pins a package version (lint:cdn-pins has nothing to find here)', () => {
    for (const f of readdirSync(PAGES).filter((x) => x.endsWith('.mdx'))) {
      expect(readFileSync(join(PAGES, f), 'utf8'), `${f} pins a version`).not.toMatch(/@kitn\.ai\/ui@\d/);
    }
  });
});
```

- [ ] **Step 10: Run the docs gates**

```
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/docs/screens-pages.test.ts
nx build docs
cd packages/ui && npm run lint:cdn-pins
```
Expected: all three PASS. `nx build docs` builds the kit first (`dependsOn: ["^build"]`), so allow for that; a Rollup error naming a path under `packages/ui/src` is the cross-package import failing at build time even though dev worked — the `fs.allow` setting covers dev only.

- [ ] **Step 11: Read the pages as a developer in a hurry**

Do STYLE.md's final pass on all seven pages: cut every sentence that does not help someone ship, kill any "seamless/powerful/leverage/out of the box", check every link resolves, confirm no emoji anywhere, and confirm the framing is web-components-first (Solid is how the source is written, not the pitch).

---

### Task 8: The builder Start pointer

**Files:**
- Modify: `packages/ui/src/components/builder-start.tsx`
- Modify: `packages/ui/src/components/builder-start.test.tsx`

**Interfaces:** no new export. `BUILDER_TEMPLATES` / `BUILDABLE_BUILDER_TEMPLATES` are **not touched** — their `TEMPLATES.map(...)` / `.filter(...)` equality is byte-pinned by the existing derivation tests, and this task must leave those green without editing them.

- [ ] **Step 1: Write the failing tests**

Append to `builder-start.test.tsx`:

```tsx
describe('the Screens gallery pointer', () => {
  it('renders one muted footer line linking the gallery, below the grid', () => {
    render(() => <BuilderStart templates={BUILDER_TEMPLATES} onSelect={vi.fn()} />);
    const link = screen.getByRole('link', { name: 'Screens gallery' });
    expect(link).toHaveAttribute('href', 'https://ui.kitn.ai/screens/overview/');
    expect(screen.getByText(/Building app screens rather than a chat surface\?/)).toBeInTheDocument();
  });

  it('is chrome, not a seventh template: outside the card grid, not a button, not in the template list', () => {
    const { container } = render(() => <BuilderStart templates={BUILDER_TEMPLATES} onSelect={vi.fn()} />);
    const grid = container.querySelector('[data-builder-start]')!;
    expect(grid.querySelector('a')).toBeNull();
    expect(screen.queryByRole('button', { name: /Screens gallery/ })).not.toBeInTheDocument();
    expect(BUILDER_TEMPLATES.some((t) => t.name === 'Screens gallery')).toBe(false);
  });

  it('carries no version literal (nothing for lint:cdn-pins to find)', () => {
    render(() => <BuilderStart templates={BUILDER_TEMPLATES} onSelect={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Screens gallery' }).getAttribute('href')).not.toMatch(/@\d/);
  });
});
```

- [ ] **Step 2: Run them, watch them fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-start.test.tsx`
Expected: the three new tests FAIL on the missing link; every existing test, including both derivation pins, still PASSES.

- [ ] **Step 3: Add the line**

In `builder-start.tsx`, immediately after the "Start from scratch" `<button>` and still inside the fragment:

```tsx
      {/* The Screens gallery pointer — chrome, not a template. Text weight, no
          card, no icon, no place in the grid: somebody who came here to build a
          chat surface should not have to read past it, and somebody who came to
          the wrong screen should find the right one in one line. Deliberately
          OUTSIDE [data-builder-start] so nothing about the card grid — its
          count, its svg count, its aria-pressed sweep — moves. */}
      <p class="mx-auto mt-8 max-w-md text-center text-sm text-muted-foreground">
        Building app screens rather than a chat surface? See the{' '}
        <a
          href="https://ui.kitn.ai/screens/overview/"
          class="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
        >
          Screens gallery
        </a>
        .
      </p>
```

- [ ] **Step 4: Run the whole file**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-start.test.tsx`
Expected: PASS, including `BUILDER_TEMPLATES is the registry, id/name/description, in registry order — never restated` and the buildable-filter pin, neither of which was edited.

- [ ] **Step 5: Look at it**

Screenshot `Labs/Builder/Start` from the running Storybook (the story shares this component with the real builder page, so the story is the check). Save to `docs/superpowers/research/2026-08-30-screens-gallery/builder-start-pointer.png`. The review question is one question: **does it read as chrome, or as a seventh template?** If it competes with the grid, make it quieter, not louder.

---

### Task 9: Coupling map, then the arc IVP

**Files:**
- Modify: `docs/coupling-map.md`
- Create: `docs/superpowers/research/2026-08-30-screens-gallery/` (evidence)

- [ ] **Step 1: Add the §4 row**

Append to the §4 "Derived lists" table (after the template-registry row):

```
| The screens gallery: `packages/ui/src/screens/<id>.tsx` (the markup, once) + `packages/ui/src/screens/registry.ts` (a leaf: data, zero value imports, so the story, the Node generator and — through the JSON — the docs site and the MCP all read one module) | four consumers: the `Labs/Screens` stories (render the module; the source panel is a `?raw` import of the same file), `scripts/gen-screen-recipes.mjs` in `build:api` (rewrites the relative `../elements/*` registrations to one `@kitn.ai/ui/elements` import and writes `src/agent-tooling/recipes/generated/screens.json`), `recipes/index.ts` (maps that JSON into `screen-<id>` code recipes served by `component_reference` and compiled by `verify:scaffold`), and the docs `Screens` topic (the sidebar item list, the `/screens/preview/<id>/` static paths, the copy panel and the overview index are all read out of that JSON; only the live preview imports the `.tsx` module, across the workspace) | Adding a screen grows the story group, the docs page set, the sidebar topic, the recipe list and `verify:scaffold`'s printed cell count on its own. The one DELIBERATE COPY is `generated/screens.json`, and it exists for the same reason the construct fixtures do — the MCP serves a recipe's code as a STRING, and a `.tsx` module is not a string; the rewrite that makes it consumer-shaped is the second reason, since the tree's relative registration import would not resolve in anybody's app | `verify:generated` (drift in both directions) · `verify:scaffold` (every `tsx` recipe file compiles under the solid consumer project, resolving `@kitn.ai/ui` through the shipped exports map — so the rewrite is proven, not assumed) · `screens.test.tsx` (import discipline, no hex, registry↔file↔story coverage, and the source panel byte-equal to the module, which is what keeps the deleted `parameters.docs.source.code` skeletons from growing back) · `tests/docs/screens-pages.test.ts` (page set equals registry, and the sidebar list stays derived) · `tests/scripts/gen-screen-recipes.test.ts` (the rewrite accepts, collapses and REFUSES) · `verify:fresh` (the generated JSON is registered in `GENERATED_SOURCES`) |
```

Also note in §4's row for the template registry nothing changes; this is an addition, not an edit.

- [ ] **Step 2: The end-of-arc IVP**

Per defer-IVP-to-end. Two surfaces, because storybook-static cannot register web components:

- **Story side** — `pnpm --filter @kitn.ai/ui run dev` (Storybook 6006). Screenshot all six `Labs/Screens` stories, light and dark.
- **Docs side** — `nx build docs && pnpm --filter @kitn.ai/docs run preview`. Playwright over the built site:
  - each of the six gallery pages renders its iframe, and the framed screen matches the corresponding story screenshot (light AND dark — flip the site theme and assert the frame followed);
  - the "Open full screen" link loads `/screens/preview/<id>/` standalone;
  - the copy button writes exactly `screens.json`'s `code` for that id (read the clipboard, compare to the file — byte equality, not "contains");
  - `/screens/overview/` lists every screen and every link resolves (no 404);
  - the `Screens` topic appears in the sidebar after `Examples`.
- **Builder side** — the Start story shows the pointer line and the link href is the bare docs path.

Save every screenshot and the Playwright output under `docs/superpowers/research/2026-08-30-screens-gallery/` and commit it, per the builder-arc precedent.

- [ ] **Step 3: Full gate sweep before calling the arc done**

```
cd packages/ui && npm run typecheck
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter @kitn.ai/ui run test:storybook
cd packages/ui && npm run build:api && npm run verify:generated
cd packages/ui && npm run verify:scaffold
cd packages/ui && npm run lint:catalog-drift && npm run lint:cdn-pins && npm run lint:silent-drops
cd packages/ui && npm run verify:pack
nx build docs
```

Paste the raw tail of each. `lint:silent-drops` must be untouched (nothing in this arc goes near `src/wire`); if it moved, something is wrong that has nothing to do with screens.

---

## Self-review

**Spec coverage, ruling by ruling:**

- **R-1 (inventory + single source of truth)** — Tasks 1–3 and 5. Six screens: `auth`, `pricing`, `dashboard`, `data-table`, `empty-states` extracted verbatim; `settings` designed in Task 4 and extracted in Task 5. `src/screens/<id>.tsx` is the one source; `registry.ts` is the zero-value-import leaf (pinned); the story derives its source panel from `?raw` and the test asserts it is byte-equal to the file, which is the assertion that kills the hand-typed `parameters.docs.source.code` skeletons for good. `proof-about` is absorbed into the `Labs/Screens` About story and its file deleted. `.storybook/styles.css` gains `@source "../src/screens"`; `src/elements/styles.css` is explicitly untouched. Import discipline (solid-js / lucide-solid / relative registrations only, nothing from `components/`, `ui/`, `primitives/`) and the token-only/no-hex rule are both enforced by `screens.test.tsx`. Per-framework emitted variants stay out of v1, and the framework-translation line is one sentence appended once in `recipes/index.ts`.
- **R-2 (Settings, story-first)** — Task 4 specifies the concrete anatomy (four `kai-tabs` sections; profile with avatar/inputs/select; appearance with select + two switches; notifications with three switches and one conditional select; account with 2FA and a danger block), states the Section/Field/Row rhythm is restated locally because a screen may not import `components/`, and makes the light+dark screenshot capture an explicit, path-named step. Standing autonomy: the plan does not wait on approval. Extraction is a separate task so the design can iterate without blocking the pipeline.
- **R-3 (docs placement + preview mechanism + guide)** — Task 7. `Screens` is its own topic after Examples, its item list derived from the generated artifact and a test that fails if anyone types it. The preview is a full-bleed non-Starlight Astro route per screen with its own Tailwind-processed stylesheet (`@import "tailwindcss" source(none)` + `@import "@kitn.ai/ui/theme.css"` + `@source` over `packages/ui/src/screens`), framed in the existing `Resizer`, with `?theme=` on load and a `postMessage` flip. Step 6 proves the mechanism on one screen before six pages exist, with the spec's Storybook-iframe fallback recorded and gated on a coupling-map note. `overview` is the guide page, with no hand-typed element count.
- **R-4 (builder pointer)** — Task 8. One muted footer line, text and link, outside `[data-builder-start]`, with tests that it is not a button, not in `BUILDER_TEMPLATES`, and carries no version literal — and the existing byte-pinned derivation tests are left unedited and must stay green.
- **R-5 (MCP feed, generated)** — Task 6. `gen-screen-recipes.mjs` in `build:api`, the rewrite exported and unit-tested in both directions (rewrite, collapse, refuse), `generated/screens.json` registered in `verify-generated-sync`'s `GENERATED` **and** `verify-artifact-fresh`'s `GENERATED_SOURCES`, `CodeRecipeFile['lang']` widened to `'tsx'`, `recipes/index.ts` mapping the JSON into `screen-<id>` entries, `verify:scaffold` routing `tsx` recipe files to the solid project (the spec assumed this worked; the current script filters to `lang === 'ts'` and hard-codes the html project, so the plan changes both), `lucide-solid` added to the real consumer devDependencies rather than stubbed, and `verify:pack` run with its ceiling read from the script.
- **R-6 (gates + acceptance surface)** — stated first in the Global Constraints, exercised per task, and closed by Task 9's two-surface IVP. Per-change gates match the spec: uncached typecheck, unit + emitted, the contract test, axe via the storybook project, `verify:generated` / `verify:scaffold` / pack-weight for the generator, `nx build docs` + the page-set test + a STYLE.md pass + `lint:cdn-pins` for the docs.

**Ambiguities resolved (each is a deviation the executor should not re-litigate):**

1. The spec's "nothing in the repo pins the old ids" is right about story ids and wrong about the group title — `surfaces.ts`'s `Proofs` inventory row and `surfaces.test.ts`'s corpus literal both pin `Labs/Proofs` through `lint:catalog-drift`. Task 3 Step 8 fixes both and names the two occurrences deliberately left alone.
2. The docs copy panel shows the **generated** code, not the `?raw` file: the raw file's relative registration import does not resolve in a consumer app, so a `?raw` copy button would hand out broken code. The story keeps `?raw` (Storybook should show the authored source). Both still derive from one file.
3. The docs read `screens.json` for metadata rather than importing `registry.ts` across the workspace — one cross-package artifact instead of two, and the docs and the MCP are then keyed off the same bytes.
4. The docs' `app.css` does **not** use `@import "tailwindcss"` or any `@source` line (it is three layer-pinned sub-imports plus `@theme inline` over the site's own `--kai-*` tokens). The preview route therefore gets its OWN sheet in the kit's `source(none)` style rather than an edit to `app.css`, which would have restyled the whole site.
5. `apps/docs` has no test runner at all, so the page-set test lives in the kit's `unit` project (required CI) and reaches across the repo, the way `verify-generated-sync` and `lint:cdn-pins` already do.
6. `verify-artifact-fresh.mjs`'s `GENERATED_SOURCES` needs the new JSON — the spec did not mention it, and omitting it makes a correctly built tree fail `verify:fresh` instantly. The pre-existing omission of the construct fixtures from that same list is called out as pre-existing, not fixed here.
7. `import.meta.glob` resolves the screen module in the preview island instead of a hand-written id→import map, so a new screen needs no docs-side edit.
8. The registry field is `blurb` (the spec's R-1 shape) and the generator maps it to the recipe's `intent` (the spec's R-5 shape). One string, one home, both spellings satisfied.
9. Array props (`kai-tabs.items`, `kai-select.options`) and every `kai-*` listener are set in `ref` callbacks, never as attributes and never in `onMount` — the repo's own contract and its recorded lesson.
10. The spec's "13.5 MiB ceiling" is stale against `MAX_UNPACKED_BYTES` in `verify-pack-weight.mjs`. The plan names the constant and forbids quoting any number it does not print.

**Placeholder scan:** no `TODO`, no `TBD`, no `...` standing in for code, no invented file path, no invented API. Every quoted file path exists in the tree today or is created by a named step. The four places the plan says "read the file first" rather than quoting it — the `starlight-sidebar-topics` topic object shape, the four remaining proof render bodies (moved verbatim, not retyped), the `lucide-solid` version, and the pack-weight ceiling — are deliberate: each is a fact the tree owns, and copying it here is the exact drift this arc exists to remove.

**Type consistency:** `Screen` (registry) → `screens.json` `meta` → `CodeRecipe` is one flow with one rename (`blurb` → `intent`), performed in the generator and nowhere else. `CodeRecipeFile['lang']` widening to `'tsx'` is matched at all three consumers — the `verify:scaffold` selector, the `renderCodeRecipe` fence (already `${f.lang}`, no change needed), and `recipes/index.ts`. The story-export naming rule (`data-table` → `DataTable`) is derived in the test, not typed. Every `declare module 'solid-js'` augmentation moved into `src/screens/` must stay byte-identical to the existing one for that tag, or `tsc` reports TS2717 — called out at each move.
