# Template registry + builder build (2026-08-28)

The real-build spec the design spec's Process step 5 promised
(`2026-08-28-template-builder-design.md`, T-1..T-7). Implements EXACTLY what
`2026-08-28-t5-vocabulary-rulings.md` ADOPTS — nothing it DEFERS
(voice, `conversations {persistent}`, answerTabs/media/relatedQuestions,
workSurface, composer chips/menu/contextPills) and nothing it PARKS
(`modes[]` + Settings). Three phases, in build order: vocabulary + kit
tasks → the template registry → the real builder. The merged design suite
(BuilderStart, WorkspaceVariantPicker, the per-template Labs/Builder
stories, builder-panel/-message-actions/-shell-controls/-composer-triggers)
is the groundwork; this spec turns it real.

## Corrections to the brief (verified in-tree, 2026-08-28)

- **C-1 · sources.strip needs the kit addition — confirmed, not assumed.**
  `message.tsx` unconditionally groups consecutive `source` parts into one
  `part="citations"` row; no visibility prop exists on Message, ChatThread,
  or any facade (grep: no `hideSources`/`showSources` anywhere outside the
  Research story's own stub toggle). Phase 1 adds the smallest one (B-8).
- **C-2 · The derivation const cannot live in `chat-types.ts` itself.**
  The rulings say "ONE const list in chat-types.ts". `schema.ts` compiles
  under `tsconfig.mcp.json`'s Node-only no-DOM pass (its own header explains
  why it imports `url-scheme-policy`, not `card-routing`), and a VALUE
  import of `chat-types.ts` drags `tool-types`/`attachment-types`/
  `card-contract` into that graph. The const therefore lives in a new LEAF
  module (B-6) — the `kit-pin.ts` "leaf on purpose" pattern — and
  `chat-types.ts` derives its union from it. Still one source; different
  file than the ruling assumed.
- **C-3 · 'speak' is already modeled — as a non-action.**
  `builder-message-actions.tsx` ships `'speak'` flagged `proposed: true`
  with a `SPEAK_CUSTOM_ACTION` workaround because it is NOT a
  `ChatMessageAction` today. Phase 1 promotes it for real and retires the
  `proposed` flag + the CustomAction shim (B-7).
- **C-4 · Multi-mode has no start-screen card to gate.** The brief says
  "Voice and Multi-mode are NOT buildable"; true, but only Voice is a T-1a
  card at all. Multi-mode is owner-parked (ruling 10) with a Labs story and
  nothing else — it does not enter the registry in v1 (B-13).
- **C-5 · verify:construct's derived axes do NOT cover the phase-1 keys by
  themselves.** The gate derives `layout` (enum) and `capabilities.*` keys
  from the schema artifact; `aside`, `header`, `composer`, and `shell` are
  TOP-LEVEL keys with no synthesized cell. Only `messageActions`/`sources`
  hard-fail automatically (the CAPABILITY_VALUES rule). Phase 1 must extend
  the gate's derivation (B-11), or the new vocabulary ships with zero
  emit-chain coverage while the gate prints green.
- **C-6 · Story seed state ≠ starter-construct content.** The Labs demos
  seed fake message threads and stub anatomies most of which is not
  construct vocabulary. What carries over into starters is the
  schema-expressible subset: titles, starters, accents, capability toggles,
  trigger item lists, header/shell chrome (B-14).

## Phase 1 — vocabulary + kit tasks

The net phase-1 list from the rulings, verbatim: `aside` ·
`capabilities.messageActions` · `capabilities.sources` ·
`header.themeToggle` + `header.actions` · `composer.triggers` · `shell`.
Kit tasks: `'speak'` · per-role default actions · `composerStart`/
`composerEnd` · the citations-visibility prop (C-1).

### Rulings

- **B-1 · Widen, never restructure — every addition is an optional sibling.**
  `.strict()` everywhere, presence enables, cross-field rules in
  `superRefine` with loud path'd messages — the existing schema.ts
  discipline, unchanged. No existing key moves.
- **B-2 · `aside: { position?: 'start'|'end'; width?: string }`,**
  layout-scoped to `'aside'` by superRefine exactly as `widget` is to
  `'widget'` (same message shape: `"aside" is only valid on layout:
  "aside"`). Codegen: `emitLayoutOpen`'s aside case (which today hardcodes
  `width: '380px'` and `inset-inline-end`) reads `position` (start ↔
  `inset-inline-start`/border-end) and `width`. `width` is
  construct-authored untrusted text: it lands as a JSON.stringify'd VALUE
  inside the Solid `style={{ }}` object (property assignment, same
  no-CSS-text-interpolation guarantee as setProperty) — never concatenated
  into a CSS string.
- **B-3 · `capabilities.messageActions: { user?: Action[]; assistant?:
  Action[] }`,** ordered arrays, `z.enum` read off the one const (B-6).
  Enum ids ONLY — no CustomAction vocabulary. A CustomAction is an id the
  APP must handle; a construct has no app code, so emitting one is a dead
  affordance (the rulings' own item-3 test). Duplicate ids within one array
  rejected in superRefine (the `slots` duplicate pattern). Codegen threads
  them onto the new ChatThread per-role props (B-7); the emit site
  JSON.stringify's the whole array (enum-validated, but the discipline is
  uniform).
- **B-4 · `capabilities.sources: { strip?: boolean }`** — `.strict()`
  object, both members meaningful: `strip: false` emits the hide prop
  (B-8); `strip: true` or the key absent emits nothing (the row already
  renders — the kit default IS the on state, same anchored-on-the-default
  convention as `reasoning: 'full'`). The Research starter states
  `sources: { strip: true }` anyway, so the template's defining fact is
  visible in its JSON.
- **B-5 · `header.themeToggle?: boolean` · `header.actions?: { label:
  string; variant?: <Button variant> }[]` · `composer: { triggers?: {
  slash?: TriggerEntry[]; mention?: TriggerEntry[] } }` · `shell: {
  commandPalette?: z.literal(true); userMenu?: { name: string; plan?:
  string } }`.** `header` stays construct-wide; `composer` and `shell` are
  new top-level `.strict()` objects (`composer` is not a capability — it is
  chrome on the medium, like `header`). `TriggerEntry` mirrors the kit's
  own `TriggerItem` (components/composer.tsx) narrowed to `{ id, label,
  description? }` — the fields that are pure display data; `promptText`/
  `data`/`kind` stay kit-side. Codegen maps `slash` → `TriggerDef { char:
  '/', kind: 'command', items }` and `mention` → `{ char: '@', kind:
  'mention', items }` onto ChatThread's real `triggers` prop. All strings
  JSON.stringify'd at their emit sites.
- **B-6 · One const, one leaf: `src/elements/chat-actions.ts`.**
  `export const CHAT_MESSAGE_ACTIONS = ['copy','like','dislike',
  'regenerate','edit','speak'] as const;` — no imports (a leaf, per C-2).
  `chat-types.ts` re-derives: `export type ChatMessageAction = (typeof
  CHAT_MESSAGE_ACTIONS)[number];` (and re-exports the const so existing
  import sites keep one address). `schema.ts` imports the const and builds
  `z.enum(CHAT_MESSAGE_ACTIONS)`. Drift guard: nothing to guard — both
  sides READ the same const; the only test needed is the existing
  schema.test.ts pattern proving the enum rejects an off-list id. That is
  the point of deriving instead of corresponding.
- **B-6a · Button variants: derive via the test layer, not an import.**
  `buttonVariants` is a cva record inside `button.tsx` (a .tsx — not
  importable from schema.ts under the mcp pass). A leaf const
  `src/ui/button-variant-names.ts` (`['default','ghost','subtle','outline',
  'destructive'] as const`) feeds the zod enum; a unit drift test asserts it
  equals `Object.keys` of the cva record's `variant` block (the test can
  import button.tsx). This is the create-kai precedent: where the bundle
  boundary blocks a live import, correspondence lives in the TEST layer,
  driven off the real object on every run.
- **B-7 · Kit task: `'speak'` + per-role defaults.** (a) `'speak'` joins
  the const (B-6); `ui/action-icons.ts` gains its curated icon (Volume2 —
  what the picker already uses); the action bar's click handling backs it
  with the existing `kai-voice-output`/SpeechSynthesis mechanics
  (components/voice-output.tsx) speaking the message's text parts — free,
  local, no provider. (b) ChatThread gains `userActions?` /
  `assistantActions?: (ChatMessageAction | CustomAction)[]` — role-scoped
  DEFAULTS a per-message `m.actions` overrides (override = replace, not
  merge; a message that sets `actions: []` gets none — decided loudly in
  the prop doc). Threaded through the `<kai-chat>` facade + React wrapper
  like every ChatThread prop. (c) `builder-message-actions.tsx` retires
  `proposed`/`SPEAK_CUSTOM_ACTION` (C-3).
- **B-8 · Kit task: the citations-visibility prop is `hideSources?:
  boolean` on ChatThread,** forwarded to Message/MessageBody, which skips
  the `'sources'` group in its part-grouping render when set. Default
  absent/false = today's rendering, byte-for-byte. Named as a hide (not
  `sources: boolean`) so absence-means-default stays unambiguous.
- **B-9 · Kit task: `composerStart?: JSX.Element` / `composerEnd?:
  JSX.Element` on ChatThread,** rendered immediately before/after the
  built-in composer — the `emptyContent` escape-hatch pattern verbatim
  (plain JSX handed down inside the same tree, no Portal). Kit-tier only in
  phase 1: no construct vocabulary binds to them yet (they exist to close
  the bare-Solid gap the Workspace round named, and phase 3's builder does
  not need them either).
- **B-10 · Shell codegen is App.tsx code, not components.** `shell.
  commandPalette` emits into the generated App: the kit's real
  `CommandList` inside the overlay shape `builder-shell-controls.tsx`
  documents (backdrop + centered panel + Escape/backdrop-close + an `Input`
  filtering client-side), opened on Mod+K. Palette entries DERIVE from what
  the construct actually enables — menu-honesty against dead entries: "New
  conversation" only when `capabilities.conversations`, "Toggle theme" only
  when `header.themeToggle`, plus the always-real "Focus composer". `shell.
  userMenu` emits the documented Dropdown+Avatar recipe (name/plan
  JSON.stringify'd); its menu items dispatch a `kai-user-menu` CustomEvent
  on the host and are labeled as consumer seams in the emitted comment.
  `header.themeToggle` emits a Button in ChatThread's `headerEndContent`
  toggling the host's `theme` attribute via the facade's `ctx.element`
  (the attribute `defineWebComponent` already owns). `header.actions` emit
  as kit Buttons (variant threaded) in `headerEndContent`; each click
  dispatches a non-bubbling `kai-header-action` CustomEvent on the host
  with `detail: { label }` — vocabulary-never-logic means the construct
  cannot say what an action DOES, so the honest emit is the kit's own
  event contract, documented in the emitted comment as the consumer's
  listening seam. No new kit component anywhere in this ruling.
- **B-11 · Gate growth is part of phase 1, not a follow-up.**
  (a) `CAPABILITY_VALUES` in verify-construct.mjs gains valuers for
  `messageActions` and `sources` — the existing hard-fail forces this the
  moment the schema artifact regenerates, by design. (b) The gate gains a
  SECOND derived probe axis: the top-level emit-bearing keys read off the
  schema artifact's `properties` (everything except the non-emitting
  `$schema`/`name`/`provider`/`userId` spine, held in one listed exclusion
  set), each with a `TOP_LEVEL_VALUES` valuer under the same
  no-valuer-is-a-hard-failure rule — so `aside`/`header`/`composer`/`shell`
  (and `theme`/`empty`/`home`/`cards`/`slots`/`widget`, unprobed today)
  each get a solo cell plus an all-top-level cell per layout, with the
  aside/widget layout-scoping handled the way `fixtureFor` already handles
  cross-field couplings. The gate prints its own cell counts; read those,
  never a number here. (c) `gen-construct-schema.mjs` regenerates both
  schema copies in build:api; `verify:generated` already guards their
  drift — no new mechanism, just run it. (d) `lint:silent-drops` is
  expected UNTOUCHED: nothing in phase 1 changes a `src/wire`
  discrimination (message actions are display, not wire). If an
  implementation finds itself editing wire, that is a spec deviation to
  surface, not waive. (e) Unit tests per schema.test.ts's patterns: accept/
  reject pairs per new key, every superRefine rule shown firing AND not
  firing, codegen snapshot + determinism coverage per new emit function.

## Phase 2 — the template registry

### Rulings

- **B-12 · One module: `packages/ui/src/agent-tooling/construct/
  templates.ts`, a LEAF.** Data + type-only imports (`import type {
  Construct }` — erased at emit), NO zod value import, no component import.
  That single constraint is what lets all three consumers read it: the
  browser-side builder components, the Node MCP tool, and create-kai's
  bundle (B-16). Per template: `id` · public `name` (T-4) · one-line
  `description` · `availability: 'buildable' | 'story-only'` · `starter:
  Construct` (typed, so tsc itself is the first drift guard) · `variants?:
  { id; name; description; starter: Construct }[]` · `controls:` the
  panel's section manifest (ordered section ids naming the schema paths
  each section edits — the shape builder-panel.tsx's sections already
  stubbed). Schema validity of every starter (and every variant starter)
  is pinned by `templates.test.ts` safeParsing each against the real
  `ConstructSchema` — the create-kai precedent: correspondence in the test
  layer, driven off the live schema every run.
- **B-13 · Templates v1:** `widget` (Support widget, layout `widget`) ·
  `inAppAssistant` (In-app assistant, layout `aside`) · `assistant`
  (Assistant, `fullscreen` + `history` local + `conversations: true` —
  ruling 5's honest today-shape) · `research` (Research, `fullscreen` +
  `sources: { strip: true }` + assistant-style actions) · `workspace`
  (Workspace, `split`, TWO variants per ruling 11 — `artifactPreview` /
  `appPreview`, identities from `builder-workspace-variants.tsx`) — all
  `buildable`. `voice`: in the registry as `'story-only'` (identity only,
  `starter` absent — the type makes starter optional exactly and only for
  story-only entries), so the Labs start screen keeps its six cards while
  every real product surface filters to buildable (T-1a menu-honesty).
  Multi-mode: not in the registry at all (C-4). **Research ships
  buildable:** its one defining chrome fact (the sources strip) is real
  end to end after B-4/B-8; the deferred answerTabs/media/relatedQuestions
  are additive, and holding the card for them would gate a working
  template on vocabulary the rulings explicitly deferred.
- **B-14 · Starter content derives from the story demos' schema-expressible
  subset (C-6):** the Support widget starter from the owner-widget fixture
  lineage (accent, header title, home greeting, starters, attachments,
  history+conversations, widget position); Workspace's starters carry
  `composer.triggers` populated (the default-on matrix from ruling 8 is
  EXPRESSED as starter data — Workspace is the only buildable starter that
  includes triggers; no separate matrix field exists to drift). All
  starters `provider: { mode: 'mock' }` (keyless first run, the wizard's
  own promise), `$schema` stamped.
- **B-15 · Starters ride the emit gate as generated fixtures.** A build:api
  step (the `importTs` mechanism gen-construct-schema.mjs already uses)
  writes each buildable starter + variant to
  `src/agent-tooling/construct/fixtures/templates/<id>.construct.json`.
  `verify:generated` guards the copies' drift; `verify:construct`'s
  named-fixture discovery (recursive over the fixtures dir — extend the
  readdir if needed) then ejects/compiles/builds every template starter on
  every gate run with zero new harness. This is the §4-registered derived
  copy (B-18).
- **B-16 · Crossing to create-kai: a new zod-free exports subpath
  `@kitn.ai/ui/construct/templates`** (own dist entry bundling
  templates.ts alone). The existing `./construct` entry is one bundled
  file with top-level zod side effects esbuild cannot tree-shake past
  (wizard.ts's header records the failure) — so the registry gets its own
  entry, importable at create-kai runtime and bundleable.
  `bundleGraphProblem`'s zod ban stays the enforcement: if the entry ever
  grows a zod import, the CLI build goes red on its own. The `__DEFINE__`
  substitution mechanism is NOT used here — it is for single build-time
  facts, and the registry is structured data three surfaces read live.
- **B-17 · Three consumers, one registry.** (a) **create-kai:** `shapeAxis`
  grows from the widget/fullscreen/app triple to the buildable-template
  list (labels/hints from the registry) + `app` + a scratch row; a
  template answer routes to `runWizard` seeded from that starter (the
  wizard's asked questions OVERRIDE starter fields; unasked starter fields
  pass through — stated, per the axes' ask-or-state law), `app` still
  routes to `generate()`. `WIZARD_REGISTRY`'s drift test keeps running
  against the real schema; new phase-1 keys get entries (`not-asked` for
  everything the wizard doesn't prompt — decided loudly in each `reason`).
  (b) **BuilderStart:** `BUILDER_TEMPLATES` in builder-start.tsx stops
  hand-coding id/name/description and maps over the registry (story keeps
  all six; product surfaces filter `availability === 'buildable'`);
  illustrations stay component-side keyed by id (SVGs are not registry
  data). (c) **the MCP `construct` tool:** `starterFor`'s hand-rolled
  regex starter is replaced by the registry — the tool lists the buildable
  templates as informed STATEMENTS (id · name · one-liner), matches an
  intent to a template when the intent clearly implies one (stated, per
  its existing stated/questions convention), and returns that starter;
  otherwise it returns the list and asks which. The capability-menu idea,
  grounded in real data.
- **B-18 · Coupling-map §4 entry** (next free number per its own rule):
  source = `templates.ts`; derived = the generated fixture JSONs (B-15),
  the wizard's template axis, BuilderStart's card list, the MCP tool's
  statements; enforced by `templates.test.ts` (schema validity + the
  consumers importing, not restating) · `verify:generated` (fixture
  copies) · `verify:construct` (the starters actually eject/compile/
  build). Record the one deliberate copy loudly: the fixture JSONs, and
  why they exist (an .mjs gate that reads JSON, not TS).

## Phase 3 — the real builder

### Rulings

- **B-19 · The panel derives; the registry scopes.** The real BuilderPanel
  keeps the merged section/row rhythm and field components but its
  controls derive from `ConstructSchema.shape` (walk the zod shape:
  ZodEnum → radio/select, ZodBoolean → switch, ZodString → input,
  ZodArray(string) → the chips/list editors, nested strict objects →
  sections), with the template's `controls` manifest (B-12) selecting and
  ordering which sections render. No control is hand-listed against a
  schema path the walk can produce; where a field needs a bespoke editor
  (ColorField for `theme.accent`, the message-actions picker, the trigger
  entry editor), a keyed override map supplies the component — overrides
  keyed by schema path, so a renamed path goes red in the drift test
  below, not silently unstyled.
- **B-20 · superRefine becomes a named-rule table — the visibility layer's
  guard.** schema.ts's superRefine body refactors into `CROSS_FIELD_RULES:
  { id; paths; check(construct, ctx) }[]` iterated by one superRefine (an
  internal restructure; the schema's external behavior, messages included,
  is pinned unchanged by the existing tests). The panel's
  conditional-visibility registry is keyed by the same rule ids
  (widget→layout hides the widget section, aside→layout likewise,
  reasoningOpen→reasoning disables-with-reason, conversations→history
  disables-with-reason, endpoint→url shows/requires — the two visibility
  treatments the design rounds already settled). A unit test asserts the
  two key sets are EQUAL, so a new superRefine rule fails until the
  builder classifies it — the drift guard the brief asked for, made
  possible by deriving the rule list instead of introspecting zod.
- **B-21 · Path translation is one small module, registry-guarded.**
  `construct-form-paths.ts`: presence-as-boolean (section on = object
  present, off = key DELETED, never `false`/`{}`), delete-on-empty (an
  empty starters list deletes the key — the schema's own `.min(1)` demands
  it; empty capabilities object deleted), and the `strip`-style
  default-anchored booleans. Its test drives every translation BOTH
  directions (construct→form→construct round-trips byte-identical for
  every template starter — the starters are the free corpus), and a
  drift check derives the presence-keyed path list from the schema shape
  so a new presence-style key fails until translated.
- **B-22 · The builder lives in `kai dev --builder`.** Studied against
  dev.ts: `kai dev` already owns the whole loop — validate → codegen →
  install-once → vite in the workdir → watch the construct file → regen on
  change, last-good preview on rejection. The builder ADDS a second, thin
  Vite server (builder UI shipped in the kit package, light-DOM Solid)
  that (a) iframes the generated project's dev server as the live preview
  and (b) exposes one endpoint that atomically writes the construct file —
  after `validateConstruct`, rejections returned to the panel with paths,
  never written. The EXISTING watch loop then regenerates and HMRs the
  iframe: panel → file write → watcher → codegen → HMR, the proven spike
  seam, with the construct FILE as the single source of truth (hand-edits
  in an editor flow into the open builder through the same watcher — the
  builder holds no state the file doesn't). Not a new CLI, not kai dev's
  default (plain `kai dev` stays byte-identical for the agent/hand-author
  path), not a vite plugin inside the generated project (that project is
  the eject artifact and stays clean).
- **B-23 · Entry flow:** `kai dev --builder` with no construct file opens
  the Start screen — BuilderStart over the registry, buildable cards only
  + the scratch row (menu-honesty in the real product surface; Voice
  stays a Labs-story card only); Workspace advances through
  WorkspaceVariantPicker; selection writes `<name>.construct.json` from
  the starter (name prompt via the `constructTagName` rules) and enters
  the panel. With an existing file argument, straight to the panel.
  Switching template from inside the panel = the T-2 confirm, then a
  starter rewrite.
- **B-24 · Styling: reuse `solid.css`.** The builder UI is exactly the
  light-DOM Solid consumer #345 shipped `solid.css` for (the export
  exists — package.json `./solid.css`). The builder page imports it plus
  `theme.css` through its own Vite build; no shadow root, no new reset
  layer. If a builder-only gap surfaces, it is a `solid.css` fix (every
  light-DOM consumer benefits), not a builder-local stylesheet.
- **B-25 · The round-8 a11y gap is closed here:** every derived field
  renders a real `<label for>`/`id` association (generated ids), grouped
  controls get `fieldset`/`legend` or `role="group"` + `aria-labelledby`,
  disabled-with-reason surfaces the reason to AT (`aria-describedby`).
  Asserted in the panel's unit tests (queries by accessible name, the
  testing-library way), not just eyeballed.
- **B-26 · Phase-3 gates:** unit tests (panel derivation, B-20/B-21 drift
  guards, a11y queries) · `nx typecheck ui` (fresh or `--skip-nx-cache`
  per CLAUDE.md's cached-verdict warning) · an IVP/Playwright pass driving
  the REAL `kai dev --builder`: pick each buildable template, flip a
  control per section, assert the iframe's preview reflects it (HMR
  round-trip), assert a rejected edit (e.g. clearing a required field)
  reports and leaves the preview standing, screenshot evidence. The
  builder is UI; per the standing policy it is shown before it is claimed.

## Task breakdown

Ordered; each task lands green on its own. Counts the gates print are the
record — none are restated here.

**Phase 1**
1. **Leaf consts + kit action work** — `src/elements/chat-actions.ts`
   (new leaf), `src/elements/chat-types.ts` (derive union, re-export),
   `src/ui/action-icons.ts`, `src/ui/button-variant-names.ts` (new leaf),
   `src/ui/button.tsx` (import-or-test per B-6a), the action bar's speak
   handling in `src/components/message.tsx` (+ voice-output reuse),
   `src/components/builder-message-actions.tsx` (retire `proposed`).
   Gates: unit (`--project=unit`), typecheck, the B-6a drift test.
2. **ChatThread kit props** — `src/components/chat-thread.tsx`
   (`userActions`/`assistantActions`, `hideSources`, `composerStart`/
   `composerEnd`), `src/components/message.tsx` (`hideSources` skip),
   `src/elements/chat.tsx` facade + React wrapper threading, stories.
   Gates: unit, typecheck, `nx build ui` (element-meta/CEM regen via
   build:api — beware the cached-build caveat).
3. **Schema additions** — `src/agent-tooling/construct/schema.ts` (B-2..
   B-5 keys, superRefine rules incl. duplicates + layout scoping),
   `schema.test.ts` accept/reject pairs per rule. Gates: unit, typecheck,
   `npm run build:api` in packages/ui (regen both schema copies),
   `verify:generated`.
4. **Codegen for every new key** — `codegen.ts` (aside geometry ·
   messageActions props · hideSources · triggers · headerEndContent
   themeToggle/actions + `kai-header-action` event · shell palette +
   userMenu recipe per B-10), `codegen.test.ts` snapshots + determinism.
   Gates: unit, typecheck, `verify:scaffold` untouched-but-run,
   `lint:silent-drops` (expected unchanged — deviation is a flag, B-11d).
5. **Gate growth** — `scripts/verify-construct.mjs` (new capability
   valuers; the derived top-level probe axis + `TOP_LEVEL_VALUES` +
   exclusion set, `--self-test` extended to prove the new hard-fail
   fires). Gates: `verify:construct --self-test`, then the full
   `verify:construct` (minutes; needs `nx build ui` first).

**Phase 2**
6. **The registry** — `src/agent-tooling/construct/templates.ts` (new
   leaf), `templates.test.ts` (safeParse every starter/variant),
   package.json exports `./construct/templates` + its vite lib entry,
   the fixture generator in build:api + `verify:generated` registration,
   `docs/coupling-map.md` §4 entry. Gates: unit, typecheck, build,
   `verify:generated`, `verify:construct` (template fixtures now ride),
   `verify:pack` (new dist entry ships).
7. **Consumer a: create-kai** — `packages/create-kai/src/wizard.ts` +
   `axes.ts` (template axis over the registry, starter seeding),
   `index.ts` routing, `test/wizard.test.ts` + `menu-honesty.test.ts`
   growth, WIZARD_REGISTRY entries for the phase-1 keys. Gates:
   create-kai's own test + build (bundleGraphProblem = the zod ban's
   proof), typecheck.
8. **Consumers b + c** — `src/components/builder-start.tsx` (registry
   map, buildable filter for product surfaces), `builder-start.test.tsx`,
   `src/agent-tooling/mcp/tools/construct.ts` (registry statements
   replacing `starterFor`'s regex) + its tests. Gates: unit, typecheck.

**Phase 3**
9. **Rule table + path translation** — `schema.ts` (CROSS_FIELD_RULES
   restructure, behavior-pinned), `src/components/construct-form-paths.ts`
   (new) + round-trip tests over the starters, the B-20 key-set-equality
   test. Gates: unit, typecheck, build:api + `verify:generated` (schema
   artifact must be byte-identical — the restructure is internal).
10. **The derived panel** — `builder-panel.tsx` rework (schema walk +
    manifest + override map + visibility registry + B-25 a11y), field
    tests. Gates: unit, typecheck, Storybook story updated (story-first
    policy: owner sees it before wiring).
11. **`kai dev --builder`** — `src/agent-tooling/construct/dev.ts` +
    `cli.ts`/`cli-entry.ts` (flag, second server, write endpoint,
    validate-before-write), the builder page entry (imports solid.css +
    theme.css), Start-screen/variant/confirm flow (B-23), `dev.test.ts`
    growth. Gates: unit, typecheck, `verify:construct` (plain `kai dev`
    path unchanged), then the **IVP/Playwright pass of B-26** as the
    epic-end verification, screenshots attached.

## Out of scope (recorded so nobody re-litigates)

Everything the rulings DEFER or PARK (header of this spec) · the
`conversations` persistent rail (its own follow-up with the kit mode) ·
publishing/hosting the builder anywhere but `kai dev` (the third front
door stays deferred) · new vocabulary for workspace panes (the ruled
ceiling stands) · Multi-mode and Settings (owner-parked).
