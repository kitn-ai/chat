import { z } from 'zod';
import {
  InventoryEntry,
  PartConsumption,
  SurfaceRecipe,
  type TInventoryEntry,
  type TPartConsumption,
  type TSurfaceRecipe,
} from './catalog-types';

/**
 * Spec §4's sort, as records. Criterion: a surface is product-shaped, something
 * a user could be handed, proven end-to-end by a Labs/App or deployable alone;
 * an ingredient exists only inside something else; fixtures and proofs are
 * corpus (tests), not catalog entries.
 *
 * TWO SENSES OF "CORPUS", and they are not the same thing. Here it is a `sort`:
 * this entry is a fixture or a proof, so it is test material rather than a
 * catalog entry. On a SurfaceRecipe, `corpus:` is a list of repo PATHS that
 * demonstrate the recipe. A story can be both — `split-workspace` is sorted
 * `surface` in this inventory and also appears in a recipe's `corpus:` array,
 * which is coherent (a product-shaped surface is exactly what demonstrates a
 * recipe) but reads as a contradiction if you join the two on the word. A
 * packer must key on `sort === 'corpus'` and on `recipe.corpus` separately.
 *
 * Every `title` is a real Storybook title segment under `Labs/` — the app names
 * are the `Labs/Apps` story FILENAMES, the rest are `title: 'Labs/<x>'` values
 * under src/ (note: NOT all under src/elements/ — Settings lives in src/ui/ and
 * Audio Visualizers under src/components/, so a check scoped to src/elements/
 * alone would wrongly flag them).
 *
 * WHAT IS ENFORCED TODAY, in the present tense. Every claim below was measured
 * by mutation in both directions, not reasoned from reading the guards.
 *
 * EVERY ROW IS RESOLVED AGAINST THE TREE. `lint:catalog-drift` (required CI,
 * needs no build) requires each title to match a Labs story title or a
 * `Labs/Apps` story filename on disk. Misspell ANY row -- tier is irrelevant --
 * and CI fails by name: `Settings` -> `Settingss` gives
 * `inventory: "Settingss" matches no Labs story title or Labs/Apps story file in
 * the tree.` That closes what an earlier version of this comment called
 * "GENUINELY UNCHECKED", and the earlier text is worth remembering as a defect
 * in its own right: it survived the guard landing and went on telling every
 * maintainer that the coverage did not exist, which is how someone ends up
 * rebuilding it.
 *
 * WHAT RESOLUTION DOES NOT COVER IS DELETION, because the check runs row -> tree
 * and a deleted row asks nothing of the tree. The other direction is covered
 * unevenly, and this is the part to read before deleting anything:
 *
 *  1. `surface` rows naming a `Labs/Apps` story FILE -- deletion FAILS
 *     surfaces.test.ts, which reads those filenames off disk and requires each
 *     to have a row sorted `surface`. Covered in both directions.
 *  2. `Proofs`, `Chat Slots`, `Prompt Input Slots`, `Workspace Slots` --
 *     deletion FAILS surfaces.test.ts, which asserts those four exact titles are
 *     present and sorted `corpus`. That list is a literal copy of these four
 *     titles living inside the test; changing one means changing both.
 *  3. Every remaining row -- deletion PASSES everything. Measured: removing the
 *     `Settings` row leaves both surfaces.test.ts and lint:catalog-drift green.
 *     This is the one real gap, and the lint's own honesty item 8 states it.
 *
 * Each row's tier is decided by which test in surfaces.test.ts covers it, so
 * read that file, not this list, if they drift.
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
  {
    title: 'Foundations',
    sort: 'ingredient',
    note: 'atoms: Input, Search, Kbd, Nav, Tabs, Status, Screen, Progress Bar, Coachmark, EditableLabel, Voice output',
  },
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
 *
 * EVERY `wiring` edge below is EXECUTED in surfaces.test.ts against the real
 * registered elements in jsdom — the event is fired the way a user fires it,
 * the named property is assigned, and the effect is asserted in the shadow DOM.
 * Name resolution against derived.json proves an event and a property EXIST; it
 * does not prove the edge works, and that gap is where a plausible falsehood
 * would live. Add an edge here only with a probe beside it.
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
        note: 'detail is {id}; the host looks the thread up and assigns it — a new array AND a new object per changed item (reactivity-two-halves)',
      },
      {
        from: 'kai-conversations',
        event: 'kai-new-chat',
        to: 'kai-chat',
        property: 'messages',
        note: 'detail is empty by design; the event is the whole signal and the host resets to an empty thread',
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
        note: 'detail is {maximized}, NOT an index: the host knows which panel holds the artifact and mirrors the boolean onto that index (null to restore). Only needed when the panel is not an ancestor — an artifact INSIDE a kai-resizable-item already drives it through the bubbling kai-maximize-intent protocol, with no host code at all',
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
    // No single story composes all four ingredients, so the corpus names what
    // each half is really proven by rather than one path that only half applies:
    // chat-slots composes kai-chat with kai-conversations, split-workspace
    // composes kai-resizable with kai-artifact, and surfaces.test.ts is where
    // the four wiring edges above are actually executed.
    corpus: [
      'packages/ui/src/elements/chat-slots.stories.tsx',
      'packages/ui/src/elements/split-workspace.stories.tsx',
      'packages/ui/src/agent-tooling/catalog/surfaces.test.ts',
    ],
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
        note: 'host reads event.detail.value, appends the user turn, streams the reply through the wire reader; on this target the host is an inline script, not a framework, so the listener must be attached after customElements.whenDefined (upgrade-race)',
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
 *
 * WHAT THE CHECKS CAN AND CANNOT SEE. surfaces.test.ts asserts both directions
 * of NAME agreement with `derived.partVariants`: no variant in the union is
 * unaccounted for by any record, and no record claims a variant the union does
 * not have. Neither can check the claim that actually matters — whether
 * `kai-chat` really renders a `source` part is an EDITORIAL judgement, and
 * nothing in the tree derives it, which is exactly why this is a registered
 * copy rather than generated data. A machine cannot tell a correct record from
 * a confident wrong one here. That claim is measured by the acceptance deck,
 * not by CI, so do not add an assertion that looks like it covers it.
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
