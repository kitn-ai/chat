# Multi-mode as a manifest of constructs — design spec (2026-08-30)

Implements the OWNER RULING of 2026-08-30 (binding): Multi-mode gets
vocabulary as a **manifest of constructs — no nesting**. A construct file
whose `modes: [{ id, label, file }]` references SIBLING construct files;
each referenced file is a plain, individually-valid, individually-ejectable
construct; the emitted shell mounts and swaps them via a mode switcher.
This keeps construct.v1 flat and honors widen-never-restructure.

Lineage: T-5 proposal item 10
(`docs/superpowers/research/2026-08-28-builder-t5-vocabulary-proposals.md`)
flagged `modes: [...]` as possibly the construct-vocabulary ceiling because
each mode carries a whole construct's worth of config; ruling 10
(`docs/superpowers/specs/2026-08-28-t5-vocabulary-rulings.md`) parked it
for the owner. The manifest shape dissolves the ceiling instead of climbing
it: a mode's config **is** a construct file, so no nested vocabulary ever
enters the schema.

Design evidence: `src/elements/perplexity-pro.stories.tsx` — the one
genuine multi-mode match found across three examples checked. Its anatomy:
a segmented Assistant | Computer toggle (`kai-tabs variant="segmented"`)
that swaps the WHOLE rail + main view per mode; `claude-code.stories.tsx`'s
Home/Code tabs are the narrower main-only variant; `codex.stories.tsx` has
**no** mode switch (recorded, not fabricated).

## Rejected alternatives (recorded as rejected, owner ruling)

- **Nested inline modes** (`modes: [{ id, shape: 'assistant', ...nested
  construct }]`, the item-10 sketch): a top-level-grain restructure of
  construct.v1 — every consumer of the flat schema (the derived JSON-schema
  artifact, the builder's path-walk panel, the fixture valuers, the MCP
  statements) would need a recursive variant. Violates
  widen-never-restructure at the format's own grain.
- **Eject-tier-only** (no vocabulary; multi-mode exists only as a
  hand-assembled eject recipe): leaves the one confirmed-real multi-surface
  shape with no `kai dev` loop, no template card, no gates — the
  vocabulary exists precisely so the whole chain (validate → dev → eject →
  compile) works.

## Standing tests applied throughout

vocabulary-never-logic · one-chat-surface-per-mode ·
widen-never-restructure · derive-don't-type · menu-honesty /
decide-loudly · untrusted-input discipline.

---

## Rulings

### R1. Schema shape — same schema, `modes` as a top-level key, mutually exclusive with the surface keys

A manifest **is a construct file** (same `.construct.json` extension, same
`ConstructSchema`, same `$schema` URL) — not a distinct file kind.
*Reasoning: one schema, one validator, one doorway (`validateConstruct`)
is the derive-don't-type answer; a second file kind would fork every
consumer of the format.*

```jsonc
{
  "$schema": "https://ui.kitn.ai/schemas/construct/v1.json",
  "name": "acme-console",
  "theme": { "accent": "#7c3aed", "mode": "dark" },
  "modes": [
    { "id": "assistant", "label": "Assistant", "file": "./assistant.construct.json" },
    { "id": "computer",  "label": "Computer",  "file": "./computer.construct.json" }
  ]
}
```

**R1a — vocabulary.** `modes: z.array(ModeSchema).min(2).max(6)`,
optional. `ModeSchema = { id, label, file }.strict()`:

- `id`: same shape as slot names (`/^[a-z][a-z0-9-]*$/`) — it becomes an
  emitted identifier fragment (`src/modes/<id>/`, a Solid component name)
  and a switcher value, so it must be a legible ident, rejected not
  sanitized. Duplicates rejected (cross-field rule, the `slots-unique`
  pattern — a regex can't see across array entries).
- `label`: `z.string().min(1)` — construct-authored untrusted text,
  JSON.stringify'd at its emit sites like `header.title`.
- `file`: a RELATIVE SIBLING path. See R1c.
- `min(2)`: a one-mode manifest is just the mode file itself — menu-honesty
  against a switcher with one entry. `max(6)`: same bounded-list posture as
  `slots`' max(8)/`starters`' max(6); a segmented control past six entries
  is a different component.

**R1b — which top-level keys stay legal beside `modes`.** Exactly four:
`$schema`, `name`, `theme`, `modes`. Everything else — `layout`,
`provider`, `capabilities`, `header`, `empty`, `home`, `cards`, `slots`,
`widget`, `aside`, `shell`, `composer`, `userId` — is REJECTED beside
`modes` with a loud, key-naming message:
`"<key>" belongs in a mode's construct file, not the manifest — the
manifest is the app shell; modes carry the surfaces.`
*Reasoning: the manifest IS the app (owner sketch); every surface fact —
including the provider, the header, and identity — belongs to the mode
file that owns that surface, so each stays individually ejectable with
nothing withheld. `theme` stays manifest-level because the emitted shell is
ONE custom element with ONE host/shadow root: the accent/mode land on the
one facade (see R3), a per-mode theme on a shared host would be a lie.*
`userId` is deliberately mode-side in v1 (it threads into each mode's own
provider/history fetches); hoisting it to the manifest is a recorded
follow-up widening if duplication annoys in practice, not this arc.

**R1c — `file` validation (schema-level, pure string checks).** All loud
rejections, no sanitizing:

- must match `/^\.\/[a-z0-9][a-z0-9-]*\.construct\.json$/` — i.e. starts
  with `./`, ONE path segment (a true sibling), kebab-ish basename, ends
  `.construct.json`. This single regex simultaneously forbids absolute
  paths, `..` escapes, backslashes, URL schemes, and subdirectories.
  Message: `must be a relative sibling path like "./assistant.construct.json"`.
- duplicate `file` values across modes rejected (two modes may not share
  one surface file — each mode is its own surface; cross-field rule beside
  the id-uniqueness one).

*Reasoning (untrusted-input discipline): the construct file is authored
input; `file` reaches `readFileSync` in the CLI/dev layer and a directory
watcher's filter set — the sibling-only rule makes path traversal
inexpressible rather than filtered, and (a deliberate design payoff) keeps
`kai dev`'s existing single-directory watcher sufficient for the whole
tree (R4).*

**R1d — mutual exclusion mechanics (the one real loosening).** `layout`
and `provider` are required today. They become `.optional()` in the base
object, guarded by a new cross-field rule `modes-or-surface` in
`CROSS_FIELD_RULES`:

- `modes` absent → `layout` and `provider` are both REQUIRED (message on
  each missing key, same text a required-key failure gives today).
- `modes` present → every key outside R1b's four is rejected (the loud
  per-key message above).

*Reasoning (widen-never-restructure): every existing construct validates
byte-identically; the only new acceptance is the manifest shape. This is a
widening of accepted inputs, not a restructure.* Two consequences recorded
loudly:

1. **The derived JSON-schema artifact weakens.** superRefine never
   serializes into `z.toJSONSchema` output (schema.ts's own note; the
   artifact is pinned byte-identical by `verify:generated`), so the
   published `construct/v1.json` will no longer list `layout`/`provider`
   under `required`, and an external validator will pass a construct with
   neither `layout` nor `modes`. `validateConstruct` — the only doorway to
   codegen — still rejects it. Same class of artifact-invisible rule as
   every existing cross-field rule; accepted, stated here so nobody reads
   the artifact diff as a bug.
2. **Every new cross-field rule must be classified in `RULE_VISIBILITY`**
   (`src/components/construct-form-paths.ts` — its key-set-equality test
   fails any unclassified rule id by design). The manifest rules classify
   as builder-invisible for v1 (the builder never edits a manifest in this
   arc, R4b); the classification entry carries that reason.

**R1e — manifest-referencing-a-manifest: rejected in v1, loudly.** A
referenced file that itself carries `modes` fails resolution (R2) with:
`"<file>" is itself a manifest — a manifest may not reference another
manifest (no nesting, v1)`. The schema alone cannot see this (single-file);
it is the resolution layer's first rule. This is also the complete cycle
story for v1: with nesting rejected and paths sibling-only, no reference
chain longer than manifest→mode can exist, so no general cycle detector is
needed — and `a.construct.json` listing itself is caught by the same rule
(a manifest is a file with `modes`).
*Reasoning: no-nesting is the owner ruling's core; one level is the
evidence's shape (perplexity-pro has exactly one switcher).*

### R2. Cross-file validation — resolution lives in the CLI/dev layer; the schema stays pure

`validateConstruct` stays single-file, synchronous, I/O-free — the schema
module compiles under the Node-only MCP tsconfig and is imported by the
browser builder bundle; `readFileSync` can never enter it.
*Reasoning: vocabulary-never-logic's structural cousin — the format
definition must not acquire a filesystem.*

New function in the CLI layer (`cli.ts`, beside `loadConstruct`):

```ts
loadConstructTree(path, io):
  | { kind: 'single'; construct: Construct }
  | { kind: 'manifest'; manifest: Construct;
      modes: { id: string; label: string; file: string; construct: Construct }[] }
  | null   // problems already printed via io, pathed
```

- Loads + `validateConstruct`s the entry file. If it has no `modes`:
  `single` (byte-identical behavior to today's `loadConstruct`).
- If it has `modes`: resolve each `file` against `dirname(entry)`, load +
  validate each. Failures are LOUD and PATHED with both coordinates:
  `modes[1].file → /abs/path/computer.construct.json: capabilities.history.url: …`
  A missing file: `modes[0].file → /abs/…: cannot read (referenced by
  <manifest path>)`. A referenced manifest: the R1e message. ALL mode
  files are checked before returning null — one pass reports every broken
  reference, not just the first.
- `kai validate <manifest>` prints one line per resolved mode
  (`mode "assistant" → ./assistant.construct.json: valid`) plus the
  manifest's own summary — the whole tree's validity in one command.

*Reasoning (decide loudly): a missing or invalid sibling is the single most
likely authoring failure of this format; it must fail with the manifest
path, the mode index, the resolved absolute path, and the inner problems —
never a bare ENOENT.*

### R3. Codegen — the emitted shell

One `generateProject` entry stays THE single generation path (dev, eject,
compile all call it — codegen.ts's own header rule). It branches
internally on `modes`:

**R3a — per-mode emit is a REUSE of the existing emitters, prefixed.** The
`src/`-interior portion of today's emit (`App.tsx`, `cards.ts` when
declared) is refactored to take a path prefix, and each mode's construct
is emitted at `src/modes/<id>/App.tsx` (+ `src/modes/<id>/cards.ts`) by
the SAME `emitApp`/`emitCardsRegistry` that a standalone construct gets —
never a second mode-flavored generator.
*Reasoning (derive-don't-type / one-chat-surface-per-mode): a mode's
emitted App is literally what ejecting that file standalone emits, so each
mode remains one chat surface with one provider loop, and the two paths
cannot drift because they are one path.* Recorded complication: today's
`generateProject` hardcodes `src/App.tsx` / `src/cards.ts` — two modes
with cards would collide on one path; the prefix refactor is the fix and
is Task 3's first commit.

**R3b — the shell.** `src/App.tsx` for a manifest is a THIN shell:

```tsx
import { Tabs } from '@kitn.ai/ui/solid';           // segmented variant
import { App as AssistantMode } from './modes/assistant/App';
import { App as ComputerMode } from './modes/computer/App';

export function App(props: { host: HTMLElement }) {
  const [mode, setMode] = createSignal('assistant'); // first mode = default
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      <div /* shell bar */>
        <Tabs variant="segmented" value={mode()} onChange={setMode}
              items={[{ value: 'assistant', label: 'Assistant' }, …]} />
      </div>
      <Show when={mode() === 'assistant'}><AssistantMode host={props.host} /></Show>
      <Show when={mode() === 'computer'}><ComputerMode host={props.host} /></Show>
    </div>
  );
}
```

(Illustrative; the real emit follows codegen's determinism/comment
conventions.) Component alias derives from the mode `id` (kebab→Pascal +
`Mode`); labels/ids are JSON.stringify'd at emit. Exactly one mode is
mounted at a time — `<Show>`, not CSS-hidden — so one-chat-surface-per-mode
holds structurally.

**R3c — switcher placement: shell bar, main-swap framing; the in-rail
variant is recorded as future work.** The perplexity-pro evidence puts the
switcher in-rail and swaps rail+main — but in the emitted shape each
mode's App owns its ENTIRE surface including any rail, so an in-rail
switcher would require the shell to reach inside a mode's layout, which is
exactly the nesting this format rejects. The shell therefore renders a
slim top bar carrying the segmented control (claude-code's main-swap
variant is the recorded precedent for this placement), and because the
whole surface below it swaps, the perplexity-pro *effect* — rail and main
both change per mode — is preserved. An in-rail placement needs a
rail-composition seam that does not exist; recorded as a possible later
round, not silently dropped.

**R3d — facade, theme, and name precedence.** ONE
`defineWebComponent(manifest.name, …)` facade (`src/element.tsx`) — the
interior stays pure Solid, no nested registrations (codegen's standing
rule, which is precisely why modes emit as Apps, not elements). The
manifest's `theme.accent`/`theme.unreadColor`/`theme.mode` drive the one
facade exactly as today (setProperty on the host, contrast pairing,
`themeMode`). A mode file's own `theme` is USED when that file is ejected
standalone and NOT APPLIED when mounted under a manifest — and that
decision is made loudly: `kai validate`/`dev`/`eject` print one notice per
mode whose `theme` differs from the manifest's
(`mode "computer": its theme is overridden by the manifest's when mounted
in <acme-console>; it still applies when ejected standalone`). Never a
silent drop. `manifest.name` is the tag; mode files keep their own `name`
(required — they are complete constructs) which is simply not registered
under the manifest.

**R3e — index.html / workdir / compile.** The demo host page mounts
`<{manifest.name}>` as today (no widget hint — a manifest shell is a
filling surface). `workDirFor(manifest.name)` and `kai compile`'s
`dist/<name>.js` copy work unchanged — one facade, one bundle.

### R4. `kai dev` / `kai dev --builder`

**R4a — dev: watch N files with the existing one directory watcher.**
Because `file` is sibling-only (R1c), the manifest and every mode file
live in ONE directory — `dev()`'s existing rename-surviving
`watch(dirname(abs))` covers the whole tree by widening the basename
filter from one name to the tree's basename set. A change to ANY file in
the set re-runs `loadConstructTree` from the manifest down and regenerates
the whole project (the regen already rewrites all files; Vite hot-updates).
An invalid state mid-edit — any file — keeps the LAST GOOD preview up with
pathed problems, exactly today's `regenTurn` contract. Editing a
manifest's `modes` list (adding a mode → new sibling file) is picked up
because the basename set is recomputed from the freshly-loaded manifest on
each regen turn.

**R4b — builder: v1 does NOT edit manifests; it says so loudly.**
dev/eject/compile must work in this arc; the builder panel is a later
round. Opening `kai dev --builder <manifest>` shows a read-only manifest
screen: the manifest's name/theme, its mode list, and per mode a line
naming the command that edits it
(`kai dev --builder ./assistant.construct.json`). No derived panel is
mounted over a manifest — `inferTemplateId` gains a `modes` branch
returning the multi-mode template id so the fallback can never present the
Scratch panel (which would offer `layout` controls the POST endpoint would
then reject — a dead-end loop, not just ugliness). The builder server's
`/api/state` grows an additive `manifest` field for this screen; the
existing single-construct shape is untouched.
*Reasoning (menu-honesty): a panel that offers edits the write doorway
rejects is a broken menu; a screen that names the working path is an
honest one.*

**R4c — builder preview of a manifest still works.** The preview iframe is
the generated project's own Vite server, which R4a already handles — the
read-only screen sits beside a fully live preview, so "builder support
deferred" defers only the editing panel, not seeing the thing run.

### R5. Templates — Multi-mode enters the registry in THIS arc, gated, with a new availability tier

The registry gains the Multi-mode entry in the same arc, consisting of a
starter MANIFEST plus two starter MODE files (assistant-shaped +
workspace-shaped — the perplexity-pro Assistant|Computer pair, seeded from
the existing `assistantStarter`/`workspaceBase` lineages with de-branded
names). Owner naming: working name "Multi-mode" per T-4 until the owner
names the card (same gate Voice's T-1a set; the entry ships under the
working name in code, the card copy is owner-reviewable text).

**R5a — availability: a new `'cli'` tier.** `TemplateEntry` today is
`'buildable' | 'story-only'`. Multi-mode cannot be `'buildable'`: the
builder can't edit it (R4b) and `BuilderStart` derives its cards from the
buildable set, so menu-honesty would break in the builder's own Start
picker. It cannot be `'story-only'`: the whole CLI chain DOES work. So:
`availability: 'cli'` — offered by create-kai's wizard and the MCP
`construct` tool statements (both derive from the registry), ejectable and
devable, EXCLUDED from `BuilderStart`'s card list and the builder-server
`/api/create` path. When builder editing lands, the tier flips to
`'buildable'` and every menu widens on its own.
*Reasoning (menu-honesty, both directions): every menu offers exactly what
works through it — the wizard's chain works end-to-end, the builder's
does not yet.*

**R5b — multi-file starters in the registry type.** `BuildableTemplate`'s
`starter: Construct` assumes one file. The manifest entry carries
`starter` (the manifest) plus `modeStarters: { file: string; construct:
Construct }[]` — an additive member on the new tier's type, so existing
entries and every registry consumer compile unchanged. Whoever
materializes a template to disk (wizard, `/api/create` when the tier
flips, the fixtures generator) writes the manifest AND its siblings.
`templates.test.ts` extends its safeParse-every-starter pin to
mode starters, and the leaf's no-zod import discipline is unaffected
(starters are data).

**R5c — create-kai wizard.** The wizard derives its template menu from
`buildableTemplates()` — that helper stays buildable-only; a sibling
`cliTemplates()` (buildable + cli) feeds the wizard so the tier
distinction lives in ONE place. Recorded complication: `wizard.ts:226`
does `construct.layout === 'widget'` to pick the tag-name kind — a
manifest has no `layout`; the manifest branch passes `'chat'` explicitly,
and the wizard writes all files of the starter set. In scope for this arc
(small, and the registry derivation drags `wizard.test.ts`'s
axis-iteration over the new entry automatically).

### R6. Gates

- **`verify:construct`** — the moment `modes` enters the schema, the gate
  HARD-FAILS by design: `TOP_LEVEL_VALUES` has no valuer for `modes`
  (`missingValuers` — the "unrecognised runtime label" rule working as
  built). The fix is not a valuer in the existing single-file axes —
  `modes` excludes them (R1b), so it joins `TOP_LEVEL_EXCLUDED` with the
  stated reason AND gets its OWN third axis: manifest cells that write the
  manifest plus its sibling mode files before the eject leg, one cell per
  {two-mode assistant+workspace} at minimum plus one all-legal-keys
  manifest (name+theme+6 modes). All eight legs run on manifest cells
  (eject → tsc → vite build → the consumer-bundle leg for the shell's
  registration). `--self-test` grows a manifest fault: a manifest whose
  mode file is missing MUST fail the eject leg, proving the resolution
  layer's loudness is load-bearing in the harness too.
- **Named fixtures ride along both ways for free.** The template fixture
  JSONs (`fixtures/templates/`) gain the manifest + its two mode files;
  the discovery walk picks up the MODE files as standalone
  fixtures too — which is correct and is the individually-ejectable
  guarantee under test, not an accident (state it in the gate's comment).
  Discovery must skip ejecting a manifest's siblings *as part of the
  manifest cell* while still ejecting them standalone — two cells per
  file-on-disk role, deliberately.
- **`verify:generated`** — the fixtures generator
  (`gen-construct-template-fixtures.mjs`) writes the new files; each goes
  in `GENERATED`, and the 2026-08-28 both-directions guard (a fixture on
  disk the list doesn't name fails) covers the add direction already. The
  schema artifact re-derives (`gen-construct-schema.mjs`) and its
  byte-identical pin moves with it — the `required`-list weakening of R1d
  is the expected diff.
- **Wizard/MCP exposure: in this arc** (R5c) — the MCP `construct` tool's
  template statements derive from the registry, so the `'cli'` tier
  appears there the day the entry lands; its statement text must name the
  builder deferral (menu-honesty in prose).
- **coupling-map §4** — the template-registry row gains the manifest
  starter's multi-file nature; a NEW row registers the one new hand-kept
  pair this spec creates: `TOP_LEVEL_EXCLUDED`'s `modes` entry vs. the
  manifest axis in `verify-construct.mjs` (excluding a key with no
  replacement axis would be a silent coverage hole — the row names the
  axis as the reason the exclusion is legal).

### R7. What stays OUT (each decided loudly)

1. **Settings** — routed to the Screens gallery by owner ruling; not a
   mode, not manifest vocabulary. (Ruling 10's parked dependency is
   resolved by relocation, not inclusion.)
2. **Per-mode overrides in the manifest** (a manifest patching a mode
   file's fields): rejected — it reintroduces nested construct vocabulary
   through the back door and breaks "each referenced file is individually
   ejectable with nothing withheld". The one deliberate exception is
   `theme`, which is a shell/host fact and is handled by precedence + a
   printed notice (R3d), never by patching the mode file.
3. **Cross-mode shared state: modes are INDEPENDENT in v1, stated.** No
   shared conversation, no shared history, no cross-mode message passing.
   Switching modes unmounts the surface (`<Show>`); a mode whose own
   `capabilities.history.persistence` is `local`/`endpoint` survives
   switches through its own persistence, and a `none` mode loses its
   in-memory thread on switch — that is its own declared persistence
   decision doing exactly what it says. The perplexity-pro evidence agrees
   (Assistant and Computer carry separate rails/sessions). A future
   "shared thread across modes" is new vocabulary on new evidence, not a
   default.
4. **Nested manifests** (R1e) — rejected loudly in v1.
5. **In-rail switcher placement** (R3c) — recorded future refinement, not
   silently dropped.
6. **Builder editing of manifests** (R4b) — later round; the read-only
   screen + the `'cli'` availability tier keep every menu honest
   meanwhile.
7. **Manifest-level `userId`** (R1b) — recorded follow-up widening.

---

## Complications in the current tree (record loudly)

1. **`layout`/`provider` are required** — the only base-object loosening
   this design needs (R1d). Every downstream `c.layout` switch
   (`emitApp`, `emitIndexHtml`, `inferTemplateId`,
   `wizard.ts:226`'s `construct.layout === 'widget'`) must gain a manifest
   branch or is reached only post-branch; Task 1 makes the type change and
   lets `tsc` enumerate the sites.
2. **The JSON-schema artifact cannot carry the exclusion rules**
   (superRefine doesn't serialize) — external validation weakens as
   described in R1d; `validateConstruct` remains the doorway.
3. **`generateProject` hardcodes `src/App.tsx`/`src/cards.ts`** — two
   modes with cards collide; the prefix refactor (R3a) is prerequisite to
   the shell emit.
4. **`verify-construct.mjs` hard-fails on the new key by design** — the
   gate and the schema land in one task or CI is red in between (R6);
   sequencing note in the task list.
5. **`RULE_VISIBILITY` key-set-equality test** fails every new cross-field
   rule until classified (R1d.2) — schema task includes the builder-side
   classification even though the builder never shows a manifest in v1.
6. **Builder fallback panel** would offer manifest-invalid edits without
   the `inferTemplateId`/read-only-screen guard (R4b) — the builder-server
   task must land before or with the template task, or a wizard-created
   manifest opened in `--builder` hits the dead-end panel.
7. **`/api/create` writes exactly one file** (`dev.ts`) — stays
   single-file in v1 because the manifest template is `'cli'`-tier and
   never reaches it; the tier flip is where multi-file create lands.
8. **`templates.test.ts` / `builder-start.test.tsx` pins** — BuilderStart
   asserts its list equals a map/filter over `TEMPLATES`; the filter
   predicate changes from `availability === 'buildable'` (already the
   shape of the pin) so the new tier is excluded by the SAME derivation,
   not a second list.
9. **`emitApp` emits `export function App(...)` with per-construct import
   sets** — fine per mode (each in its own file), but the shell's own
   import needs (`createSignal`, `Show`, `Tabs`) must go through
   `emitSolidJsImports`-style dedup discipline, not a hand-typed line, or
   the duplicate-identifier class the cross-axis cell exists for returns.

## Task breakdown

Sized like the construct-engine phase plans; each task lands green on its
own gates. Task 1+2 are one PR-unit (the gate hard-fails between them by
design — complication 4).

**Task 1 — Schema: the `modes` vocabulary.**
Files: `construct/schema.ts` (ModeSchema; `layout`/`provider` →
`.optional()`; cross-field rules `modes-or-surface`, `modes-unique-ids`,
`modes-unique-files`), `construct/schema.test.ts` (accept/reject matrix:
manifest valid; each illegal-beside-modes key's message; file-path
rejections — absolute, `..`, subdir, wrong extension; min 2/max 6; dup
ids/files; the no-layout-no-modes rejection),
`src/components/construct-form-paths.ts` (RULE_VISIBILITY entries + reason
comments). Regenerate `construct.v1.schema.json` via build:api.
Gates: unit (`schema.test.ts`, `construct-form-paths` key-set test),
`verify:generated` (artifact re-pin), `nx typecheck ui` (enumerates every
`c.layout` site — fix by branching, complication 1).

**Task 2 — Resolution layer + validate + the gate axis.**
Files: `construct/cli.ts` (`loadConstructTree`; `validate` prints the
tree; R1e/R3d notices), `construct/cli.test.ts` (missing file, invalid
file, nested manifest, all-errors-in-one-pass, notice wording),
`scripts/verify-construct.mjs` (`modes` → `TOP_LEVEL_EXCLUDED` with
reason; the manifest cell axis; the manifest self-test fault; the
dual-role fixture-discovery comment).
Gates: unit, `verify:construct` (`--self-test` first — watch the new fault
fire), coupling-map §4 rows (this task edits `docs/coupling-map.md`).

**Task 3 — Codegen: prefix refactor + the shell.**
Files: `construct/codegen.ts` (interior-emit path prefix; manifest branch
in `generateProject`: per-mode `src/modes/<id>/…`, shell `App.tsx` with
segmented Tabs via the import-dedup discipline, facade/theme precedence,
index.html), `construct/codegen.test.ts` (determinism over a manifest;
per-mode emit byte-equals the standalone emit of the same construct
modulo prefix — THE reuse pin; theme-precedence notice; shell mounts
exactly one mode; card-path namespacing with two card-bearing modes).
Gates: unit, `verify:construct` (manifest cells now compile/build/bundle
for real), `--project=emitted` unaffected (scaffolder, not construct) —
run it anyway per repo rule.

**Task 4 — dev / builder server / builder page.**
Files: `construct/dev.ts` (basename-SET watch filter recomputed per regen;
`boot` via `loadConstructTree`; `/api/state` additive `manifest` field;
`/api/construct` GET/POST guard for manifest sessions — POST of a manifest
body validates whole-tree server-side), `construct/dev.test.ts`,
`builder-app/App.tsx` + a small manifest screen component
(`inferTemplateId` modes branch in `construct/templates.ts`; read-only
manifest screen with per-mode builder commands + live preview iframe),
tests for the screen and the inferTemplateId branch.
Gates: unit, `nx build ui` (builder page prebuild), manual IVP at arc end
per defer-IVP policy (`kai dev` + `kai dev --builder` over a real
two-mode manifest — switcher swaps, hand-edit of a mode file hot-updates,
invalid mode file keeps last-good).

**Task 5 — Template registry + wizard/MCP + fixtures.**
Files: `construct/templates.ts` (`'cli'` availability tier;
`cliTemplates()`; the Multi-mode entry: starter manifest +
`modeStarters` from assistant/workspace lineages),
`construct/templates.test.ts` (tier discipline, mode-starter safeParse),
`components/builder-start.tsx`/`.test.tsx` (filter stays a derivation),
`scripts/gen-construct-template-fixtures.mjs` +
`scripts/verify-generated-sync.mjs` `GENERATED` additions,
`packages/create-kai/src/wizard.ts` (+ test: multi-file write, the
`layout === 'widget'` fix), MCP `construct` tool statement text (derives;
verify wording names the builder deferral).
Gates: unit (ui + create-kai), `verify:generated`, `verify:construct`
(the new fixtures ride the discovery walk both as manifest cells and as
standalone mode fixtures), create-kai `bundleGraphProblem` (leaf stays
zod-free), `verify:scaffold` untouched but run (shared registry
machinery).

**Task 6 — Docs + close-out.**
Files: the construct format docs page (manifest section: the sketch, the
sibling rule, precedence, what's out), `docs/coupling-map.md` final pass,
memory update. End-of-arc IVP per Task 4.
Gates: docs build (`pnpm dev` docs site), STYLE.md voice pass.
