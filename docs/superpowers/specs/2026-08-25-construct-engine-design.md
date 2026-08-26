# The construct engine — workstream 2 v1 design

Date: 2026-08-25. Owner-brainstormed and section-approved in session. Supersedes nothing;
implements the D-2 ruling (builder spec, seam-scoped) via the owner-ratified reframe below.
Plan follows via writing-plans after owner review of this file.

## Executive summary

- **We are building the ENGINE, not the builder or the harness**: a declarative construct
  format + a codegen pipeline + a thin dev runtime. The visual builder (canvas) and the
  plugin harness are later doors on top of it — one composition engine, three front doors,
  per the ratified product vision.
- **Audience v1: developers** (human and AI agents). Verticals/non-technical are a
  commercial sibling, explicitly out of the OSS core. The conversational path — a dev
  talking to their own coding harness (Claude Code, Codex, dsh, …) through our MCP — is
  the PRIMARY authoring path, validated turn-by-turn.
- **A construct is one JSON file** describing the decidable part of a chat surface:
  layout, provider seam, capabilities, cards, theme, named slots. The engine turns it
  into readable Solid source and compiles that to ONE self-registering web component.
  Consumers install nothing but the output; Solid appears only if they eject.
- **Codegen-only, one path** (owner-picked option B): `kai dev` and `kai compile` share
  every line of generation, so the preview IS the artifact. No interpreter to drift.
- **Success**: ops-console re-expressed as a construct with ≥50% less hand-written code (lint-thresholds: waive -- target set from the measured seam inventories, 48% and 63.6% glue; the achieved ratio is measured and reported at plan completion, not asserted) ·
  construct → live preview < 1 min, keyless (lint-thresholds: waive -- UX target the owner set in
  the sitting; Task 5 demonstrates it live rather than asserting it) · emitted element passes the same consumer
  gates as the kit's own elements · a coding agent authors a valid construct first-try
  from one sentence.

## Decisions ledger (all owner-ruled in the 2026-08-25 sitting)

| Decision | Ruling |
|---|---|
| Harness vs builder ordering | Neither first — the ENGINE first; both are doors on it |
| v1 audience | Developers; verticals = commercial sibling, not OSS |
| Conversational construction | Primary authoring path; hand-authoring stays possible (schema-validated JSON) |
| Architecture | B: codegen-only, single generation path for dev and compile |
| v1 format scope | Chat constructs + minimal escape hatch (named slots); NO arbitrary element tree |
| Layout | First-class enum: `widget · fullscreen · aside · split · custom` |
| Validation | Zod source of truth → published JSON Schema + TS types derived (build:api artifact, drift-guarded) |
| Preview | Passive live preview (`kai dev` + HMR) is v1; interactive canvas is NOT |
| Config-vs-composition | The format grows by VOCABULARY, never logic (hard rule, §Format) |
| Consumer dependency story | "Install nothing but the output"; Solid visible only on eject |

## Relationship to the catalog (binding, restated)

The individual `kai-*` element catalog remains the PRIMARY consumer surface. A construct
is pre-composed catalog — additive, never a replacement. The grain dimmer, in order:
construct → slots (project DOM in) → eject (full Solid source, yours) → compose catalog
elements directly in your own app. Construction is the floor; the construct is a
convenience on top of it.

## The construct format

One JSON file, schema-validated, enum-heavy, small. Example:

```jsonc
{
  "$schema": "https://ui.kitn.ai/schemas/construct/v1.json",
  "name": "acme-support",            // → the emitted tag <acme-support>
  "layout": "widget",                // widget | fullscreen | aside | split | custom
  "provider": { "mode": "endpoint", "url": "/api/chat", "wire": "openai" },
  "capabilities": {
    "attachments": { "accept": ["image/*", "application/pdf"] },
    "history": { "persistence": "local" },     // none | local | endpoint
    "starters": ["Where's my order?", "Request a refund"]
  },
  "cards": [ { "name": "refund_approval", "schema": { /* form card + x-kai hints */ } } ],
  "theme": { "accent": "#e91e63", "mode": "system" },
  "slots": ["header"]                // escape hatch → emitted <slot name="header">
}
```

Format rules:

1. **The chat spine is implied, not declared.** Thread + input + streaming are always
   present and wired correctly; the file declares deviations and additions only. This is
   what keeps turn 40 of a long authoring conversation safe — there is no spine wiring
   for an edit to break.
2. **No arbitrary element tree in v1.** Layout enum + capabilities + slots covers the
   ladder-app shapes. A free-form tree is the catalog grain (or the future canvas).
   WHY-NOT-THE-POWER-SET applies to the format itself.
3. **Vocabulary, never logic** (hard rule). No conditionals, expressions, or handlers in
   JSON. New capabilities/enum values are added on evidence (two-builder style). The
   moment a construct needs an `if`, that construct wants to be code — use an exit.
   (This is the anti-Cordis-YAML rule the owner already applied to the harness.)
4. **Enums over free-form wherever behavior varies** — the measured rung-5 lesson
   (per-intent enums beat flat enums beat free-form for anything a model writes).
5. **No secrets, no client.** `provider` is `mock` or an endpoint URL + wire format.
   Kit parses, consumer fetches — enforced by the format.
6. **Zod is the single source of truth.** The published JSON Schema (editor autocomplete
   for hand-authors) and the TS types (codegen input) are derived from it; the published
   schema is a build:api generated artifact under the generated-artifact drift guard.
   Versioned `construct/v1.json`; additive evolution in place, breaking bumps the URL.

## Codegen + runtime

```
construct.json → validate (Zod) → codegen → generated Solid project → ┬ vite dev  (kai dev, HMR)
                                                                      └ vite build (kai compile)
```

- Codegen emits a real, readable mini-project: root Solid component composing the kit's
  Solid components (interior pure Solid — no nested element registrations), capability
  wiring, provider glue importing `@kitn.ai/ui/state` + `/wire` (never a hand-rolled SSE
  reader, generated code included), card registrations, theme tokens, and a
  `defineWebComponent` facade carrying the tag + slots. Same consumption shape as
  today's solid scaffolds (already compiled `--strict` in CI). Targets Solid v2 when the
  kit ships v2 (D-10).
- **Quality bar: the generated project IS the eject artifact.** Deterministic (same
  construct → same source), idiomatic, no generator droppings. `kai eject` = keep it.
- `kai dev`: validate → codegen to a working dir → Vite dev server; watches the
  construct; every edit re-runs codegen; HMR updates the open tab. Mock-first, keyless.
- `kai compile`: same codegen → Vite lib build → one self-registering `.js` + types,
  source preserved beside it. Preview and artifact cannot differ.
- A validation failure never reaches codegen: the reason goes back to the author/agent;
  the last good preview keeps running.

## Provider seam + cards

- `mock` default (the responder now emits tool calls) · `endpoint` = their URL + wire
  (`openai` | `anthropic`).
- `cards` entries are the kit's existing card schema (incl. `x-kai-format` mask hints);
  codegen registers them and reuses the rung-5 card-tool projection for the backend's
  tool definitions.
- `history`: `none | local | endpoint` — local generated (browser storage), endpoint
  generates the calls, consumer owns the server. Retention/limits stay app decisions.

## Surfaces

- **CLI:** `kai dev` · `kai compile` · `kai eject` · `kai validate`.
- **MCP:** one construct-authoring tool surface (create/edit/validate turn-by-turn,
  rejecting bad turns with reasons) beside scaffold/component_reference/theme/debug.
  It asks ONLY real-choice questions (create-kai menu-honesty rule); layout is asked
  only when the request doesn't already imply it.

## Testing

- `verify:construct` (CI): fixture axes DERIVED from the Zod schema — layout enum ×
  capability probes, each-alone + none + all, not the power set — every fixture
  compiled `--strict` and the emitted element run through the same real-consumer-bundle
  gate as the kit's own elements.
- One end-to-end conversational fixture: a scripted agent session builds the owner's
  four-sentence widget (files + history + starters) and asserts the result runs.
- The walking skeleton comes FIRST in the plan (show-first rule): one construct →
  `kai dev` → a live widget the owner can watch change, before polish.

## Non-goals (v1)

Interactive canvas editing · non-technical authoring · arbitrary element trees ·
general app layouts (shell family) · plugin system (harness territory, parked until this
spec's implementation informs it) · any logic in JSON · key handling anywhere.

## Open questions (deliberately deferred, not blockers)

- Where the construct-authoring MCP lives (inside the kit's MCP vs the `kai` CLI package
  boundary) — decided in the plan by what the packaging supports.
- `split` layout's v1 depth (two-pane minimum vs pane-grid passthrough).
- Whether `kai compile` also emits a ready-made backend route stub per wire format
  (the scaffolder already has these; likely cheap reuse, decided in the plan).
