# Handoff: builder testing, and the config-vs-composition boundary (2026-08-30)

Written for the owner's next session (they asked to resume tomorrow with
Fable to make decisions and go deeper). The headline is the last section —
everything before it is context for that decision.

## Where the code is

**On main, shipped:** PR #350 (template registry, phase-1 vocabulary, the
real `kai dev --builder`) and #351 (dark-by-default, illustration
root-cause, design parity). **Released and live on npm: `@kitn.ai/ui@0.31.0`
and `create-kai@0.4.0`** — the release that ships the builder publicly.

**Branch `feat/modes-and-screens`, 26 commits, LOCAL AND UNPUSHED** by the
owner's instruction ("i want to run this locally before pushing these
changes... so i can provide you precise changes where I see issues"). It
carries: the whole workSurface round, the AppHeader promotion, the local-kit
fix, the BuildWait animation, three specs and three plans, and two audits.
Nothing here is on a PR.

**One dirty file at handoff:** `packages/ui/src/components/work-surface.tsx`
plus an uncommitted `docs/superpowers/research/2026-08-30-code-tab/` — an
agent finishing the Code-tab empty state. Check it before building on it.

## What the owner found by actually running it

They ran `node ~/Projects/kitn-ai/kitn-chat/packages/ui/bin/mcp.js dev
--builder` and found, in minutes, things a full IVP and a parity audit had
called green:

1. The variant screen was unbranded and cramped (fixed — it never got the
   parity round's canvas treatment).
2. Creating a construct looked broken for ~28s of dead silence (fixed —
   the panel now appears in 50ms with an honest placeholder; the server
   responds immediately and announces the preview over SSE when it is
   really listening).
3. `kai dev --builder` was installing published 0.30.0 from npm, which has
   no `WorkSurface` — a crash (fixed — running the repo's own bin now packs
   and installs the repo's own kit, announced loudly, ~1s, cached).
4. The Workspace preview had a blank pane and a huge gap (fixed — the split
   was INVERTED versus the story: chat belonged in a 360px rail with the
   work surface in the main region).
5. The Workspace header was wrong (fixed — the story's `AppHeader` is now a
   promoted component both the story and the emitted app render).
6. The Code tab toggle could not be turned on at all (fixing — `codeView`
   now stands alone with an honest empty state).
7. **Checkpoints.** "If there is a preview then most likely there are
   checkpoints... not sure if you are really carefully thinking about each
   use case." This one is not a bug; it is the finding.

## What the template-purpose audit found (the important part)

Full report: `docs/superpowers/research/2026-08-30-template-purpose/`
(also `2026-08-30-emitted-parity/report.md` for the layer above it).

- **The Checkpoint components ship, exported and documented — and BOTH
  reference apps hand-rolled the row instead** (`lovable.stories.tsx`,
  `v0.stories.tsx`, badge + button, twice). The corpus the round was told
  to model from pointed away from the component.
- **S-1: every emitted app can only say plain text.** Every starter emits
  `createMockResponder()` with no arguments; a mock turn is
  `{text?, toolCalls?}`. So `reasoning`, `sources.strip`, `cards` and tool
  rows are unobservable in EVERY template. No research app built from a
  starter has ever rendered a citation.
- **S-2: every construct card renders as `form`.** Seven built-in card
  types ship; `cards[]` had no `kind`.
- **The process finding:** every T-5 ruling and all five control manifests
  answer "what CONTROLS does this panel need." None asks "what does this
  THREAD contain." The corpus averages four in-thread content types per
  app; our starters seed two plain-text messages.

## Rulings made today

In `docs/superpowers/specs/2026-08-28-t5-vocabulary-rulings.md`, Amendments
1 and 2 (every one reworkable):

- **Owner:** `cards[].kind` adopted (all seven, defaults to `form`) ·
  checkpoints adopted as marker vocabulary + event seam (restore is the
  app's, it can cost tokens or trigger a redeploy) · model switcher adopted
  as `models: [{id,label}]` + event.
- **Owner, earlier:** dark by default except the widget · starters carry no
  brand accent · everything free-and-reversible defaults ON, anything
  needing a backend or landing on an invoice stays off with a hint.
- **Supervisor:** `workSurface` partially reversed out of its T-5 deferral
  (the deferral had failed its own "mechanism exists, only the switch is
  missing" test) · no handoff/escalation vocabulary until a Labs app models
  the widget's thread · `webSearch` stays off but as a NAMED deferral, not
  a silent hardcode · the story is the binding acceptance surface for
  anything with a story.

## THE DECISION FOR TOMORROW

The owner's reaction to the audit: *"ugh. this is one reason i hated the
idea of config over composition."*

The assessment I gave, for them to push on:

Config did not merely make each capability expensive (five places:
vocabulary, ruling, codegen, panel, gate). It made the wrong question the
easy one — a panel of toggles feels finished, so nobody asked what the
thread contains, and a build-loop template shipped with no build loop.
Composition does not have that failure mode: writing the thread makes the
absence obvious.

This is also the empirical answer to the guided-config ceiling the owner
banked on 2026-08-26 ("answer it once the wizard exists"). **The ceiling is
not where the layout gets complex — it is where the THREAD gets rich.**

The proposed boundary:
- **Construct keeps the first tier** — widget · in-app assistant ·
  assistant. Chrome and capability toggles over one conversation is what it
  is honestly good at, and the wizard story holds there.
- **Workspace and Research become composition-first** — real example apps,
  recipes, eject as the front door rather than the escape hatch. Their
  value is in-thread content types, which config can only enumerate badly,
  one owner ruling at a time, forever.
- The live-runtime spec's **emitter seam** is what makes that a direction
  rather than a retreat (one shared plan module; snippets per framework;
  eject producing something worth keeping).

Consequence for today's rulings: `cards[].kind` pays off regardless and
should stand. **Checkpoints and the model switcher are the first two items
of an infinite list if Workspace stays config-tier — they are the natural
stopping point, not the next step.** The owner has not ruled on the
boundary; the Workspace/Research vocabulary work is ON HOLD pending it.

## Queued, in the audit's priority order (all on hold for the boundary call except 1)

1. **Scripted mocks per template** (+ `MockTurn.sources`). No vocabulary,
   no ruling, widest effect of anything on the list — it makes every
   capability already in the schema observable. Do this whatever the
   boundary decision is.
2. `cards[].kind` routing.
3. Checkpoints — promote the hand-rolled row, render it, declare it. *(on
   hold)*
4. Model switcher · research follow-ups (`persistSuggestions`) ·
   `FeedbackBar` for the widget · the named deferrals replacing silent
   hardcodes. *(on hold)*
5. The round's own tail: wizard classification (Task 8), format docs (Task
   9), the full IVP (Task 10); the WIRE bucket from the parity audit
   (palette trigger, switch-template skipping the variant picker, inert
   sources switch); reviews owed for tasks 5+6 and 7.
6. `verify:construct` RENDER leg (~1 day, +60-90s/run) — **with the
   caution that it would catch NONE of the purpose-audit findings**, since
   it asserts a contract derived from the construct and those are things a
   construct cannot declare.

## Specs written, awaiting a go-ahead

- `2026-08-30-live-construct-runtime.md` — store-driven preview, no
  reload, no state loss; the plan module that makes drift structurally
  impossible; the emitter seam. **Owner wants this AFTER the content is
  validated.** Note it refactors ~70 emit functions, so it cannot run
  concurrently with template work.
- `2026-08-30-modes-manifest-design.md` + plan — the owner ruled the
  manifest-of-constructs direction; not started.
- `2026-08-30-screens-gallery-design.md` + plan — proofs + Settings as a
  docs gallery; not started.

## Traps

- Background waits die at turn boundaries; agents must run foreground.
- Agents leak dev servers; an orphan on 4400 blocked the owner once. Kill
  by cwd, never by pattern.
- `dist/builder-page` is PREBUILT and shipped — a stale `dist` means you
  are testing yesterday's builder. Rebuild with `--skip-nx-cache`.
- Quoting a Tailwind class inside a doc comment compiles a real utility
  (the shadow-sheet scanner reads comment text). Stories are excluded from
  that scan, so class hygiene in stories has never been checked.
- Tailwind arbitrary-value classes emit non-deterministically here; use
  inline token styles for anything load-bearing.
- New docs under `docs/superpowers/` trip `lint-gate-parity` and
  `lint-threshold-derivation` unless fences are marked.
