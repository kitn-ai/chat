# The create wizard — design (2026-08-27)

Owner-approved direction from the 2026-08-27 direction discussion (the owner
independently re-derived the banked wizard plan via a TanStack comparison).
Closes the turn-zero discovery gap the owner found by running the stranger
test: the construct engine works, but a stranger has NO door to their first
construct JSON — no docs page, no CLI generator, only the agent-held MCC path.

## Scope

Three deliverables, one round:
1. **`create-kai` interactive wizard**: `npm create kai` (and `bun create kai`)
   asks "What would you like to create?" and, for construct shapes, walks a
   short schema-derived questionnaire that emits a construct JSON and hands
   off to the preview command.
2. **`kai` bin honesty**: `@kitn.ai/ui` gains a `kai` bin alias so installed
   users can actually type `kai dev`; the CLI usage text stops implying a
   binary that doesn't exist; docs use the `npx @kitn.ai/ui <cmd>` form for
   the no-install path.
3. **Docs quick-start**: a "Drop-in widget" guide on ui.kitn.ai — the
   two-command stranger flow with an annotated construct.

Out of scope: the visual builder (next phase — same question model rendered
as knobs; this round proves the derivation), workspace/desktop templates
beyond the two v1 shapes, brownfield/framework guidance changes (the agent/MCP
lane), any construct vocabulary changes.

## Rulings

- **W-1 · The verb is `create`, the vehicle is create-kai (owner).** The
  ecosystem-standard `npm create kai` front door gains a first question:
  **Chat widget** (construct, `layout: "widget"`) · **Full-page chat**
  (construct, `layout: "fullscreen"`) · **App in a framework** (the existing
  create-kai scaffold flow, unchanged). Construct shapes are new; the
  framework path is the current behavior reached through the new menu.
- **W-2 · Questions derive from the construct schema; curation is explicit
  (owner's manageability requirement).** The wizard never hand-authors an
  option list: enum values, capability keys, and defaults are read from the
  schema exported by `@kitn.ai/ui` (which becomes a real dependency of
  create-kai). Curation — WHICH keys get asked — is a single explicit
  registry in create-kai listing every top-level key and capability as either
  `asked` or `not-asked (reason)`. A drift test fails when the schema gains a
  key the registry doesn't classify, so a new capability can't be silently
  invisible to the wizard (the home-screen lesson, applied forward). This is
  the one-engine rule that keeps N doors from becoming N maintenance
  surfaces.
- **W-3 · Output is a construct file + a real next step.** The wizard writes
  `<name>.construct.json` (with `$schema`) into the target directory and
  prints the preview command; it then offers to run the preview immediately
  (spawn `npx @kitn.ai/ui dev <file>`; decline = print the command). No
  lock-in artifacts, no scaffolding beyond the one JSON for construct shapes.
- **W-4 · No template files.** The answers ARE the template: the wizard
  composes the construct from schema defaults + answers. This avoids vendored
  fixture copies (the pack diet just excluded fixtures from the tarball) and
  keeps derive-don't-type intact. Rich starters (ops-console-style) wait for
  the builder phase.
- **W-5 · Question set for v1 (curated, options derived):** shape (W-1's
  three) · name (default from folder) · header title · greeting/home on-off
  (home: {} with a greeting title when on) · starters (free text, 0-6) ·
  attachments toggle · conversation history toggle (persistence: local;
  `conversations: true` implied per its schema requirement) · accent color
  (optional). Everything else is `not-asked` with reasons in the registry.
  Provider is ALWAYS `{ "mode": "mock" }` in v1 — the wizard's promise is
  keyless-first-run; switching providers is a docs/agent concern after.
- **W-6 · Wizard honesty inherits create-kai's existing law.** The
  menu-honesty pattern (stated-vs-asked, axes.ts / AxisIo) extends to the new
  questions: an axis with one honest answer is STATED, not asked. The
  existing framework-scaffold flow must remain byte-identical when reached
  through the new first question.
- **W-7 · Bin alias + usage truth.** `@kitn.ai/ui` package.json `bin` gains
  `"kai": "./bin/mcp.js"` beside the existing `kai-mcp`. The dispatcher and
  USAGE text present commands as they can actually be typed (`npx
  @kitn.ai/ui <cmd>`, or `kai <cmd>` once installed). route.test.js grows the
  alias case. Risk note: the bare-name npx collision (`npx kai` resolves the
  unrelated `kai` package on npm) is documented in the usage text's
  no-install line; we never tell anyone to run bare `npx kai`.
- **W-8 · Docs quick-start.** New guide page (nav: near Getting started):
  the stranger flow — `npm create kai` OR hand-written construct + `npx
  @kitn.ai/ui dev` — with the annotated widget construct (the owner-test
  JSON), what each key does, and the compile step. Copy follows STYLE.md;
  cdn-pins/gate lint rules respected; every snippet honest against 0.28.0.

## Components

- **create-kai**: new `wizard.ts` (question flow, registry, construct
  composition), first-question routing in the existing entry, schema import
  from `@kitn.ai/ui` (dependency added; release-please already links the
  workspace versions). Tests extend menu-honesty style: every offered answer
  path drives a real `generate()`/emit and validates the emitted construct
  against the real schema (parse, not trust).
- **@kitn.ai/ui**: bin alias + usage-text fix + route.test.js case. No
  runtime code changes.
- **apps/docs**: one new guide page + nav entry.

## Testing

- Wizard: registry drift test (schema key added → red until classified);
  every construct the wizard can emit parses under `ConstructSchema` (drive
  the full answer matrix — it's small by design); stated-vs-asked behavioral
  tests per the existing menu-honesty harness; the framework path unchanged
  (existing tests keep passing unmodified).
- Bin: route.test.js alias case; a packed-install smoke proving `kai dev`
  exists on PATH after `npm i @kitn.ai/ui` (script-level, mirrors the
  pack-diet MCP smoke).
- Docs: `verify:docs`; the quick-start construct snippet validated against
  the real schema in the docs test if such a harness exists (else via the
  emitted/consumer gate that already compiles doc snippets).
- End-to-end acceptance: a pty-driven run of `npm create kai` in a temp dir
  (create-kai's index-unimportable residual means pty is the honest harness
  there) answering the widget path, asserting the emitted JSON validates and
  `dev` handoff line prints.

## Process

Spec → plan → subagent-driven execution, per the home-screen round. Owner
waived mid-round checkpoints ("spec it and run it"); the wizard's terminal UX
gets a recorded transcript (the terminal equivalent of story-first) presented
with the final demo.
