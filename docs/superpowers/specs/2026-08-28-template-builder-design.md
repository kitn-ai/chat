# Template-first builder — design (2026-08-28)

Owner-directed reframe of the visual builder, from the 2026-08-28 brainstorm.
Supersedes the layout-first panel design iterated on `feat/builder-story`
(rounds 1-8 remain the component groundwork: BuilderPanel sections,
ToggleChip, ColorField, the hardened useAutoResize, the cross-field
visibility patterns — all carry forward).

## The reframe (owner)

"Layout" is the schema's vocabulary, not a person's. People choose a KIND OF
APPLICATION — a support widget, a ChatGPT-style assistant, a research tool, a
workspace — and then tune it. The abstract layout enum (aside/split previews
that read as mirror images of each other) demonstrated the problem. The
builder becomes template-first: pick a template, get its controls.

## Rulings

- **T-1 · V1 templates (owner; expanded 2026-08-28 after the taxonomy
  audit):** Support widget · **In-app assistant** (docked aside — the
  ops-console fixture's real shape, fully construct-expressible today) ·
  Full-page assistant · Research/search assistant · Workspace/split. Build
  order easiest→hardest so knobs accumulate: widget → in-app assistant →
  assistant → research → workspace. Candidate pool and internal reference:
  the Labs/Apps corpus (claude-code, chatgpt, perplexity/-pro, v0, lovable,
  t3code, codex, wisp, split-workspace).
- **T-1a · The start screen shows six cards** (owner): the five above plus
  **Voice** (visualizer-first assistant — kai-voice-input/output + the
  audio-visualizer back it, but no Labs surface has ever composed them and
  the schema has zero voice keys, so its BUILD round is gated on a Labs
  voice-app surface existing first, story-first). Menu-honesty at ship time:
  a card appears in the real product only when its template is buildable.
- **T-1b · Documented non-templates** (taxonomy audit): Console
  (AMUX/t3code-class multi-session monitoring — the construct is
  single-thread by construction; agent-harness lane) and Task feed
  (Codex-class composer-led queue — nothing thread-shaped). Both eject-tier;
  no cards.
- **T-2 · Template subsumes layout (owner):** no layout radio in the panel.
  The template fixes the layout internally; switching shape = switching
  template (with a confirm, since the control set changes). `custom` remains
  outside the builder (eject tier).
- **T-3 · A template is a starter construct, not vocabulary:** pure data — a
  named starting construct JSON plus a control manifest. No `template` key in
  the schema. The picker writes the starting JSON; the panel edits it.
- **T-4 · Neutral public names:** Support widget / Assistant / Research /
  Workspace. Product-alike names stay internal to the Labs stories that
  inspired each template.
- **T-5 · Vocabulary gaps are decided per template, loudly:** when a
  template's controls need construct keys that don't exist (citations/sources
  for Research; panes/work-surface for Workspace), the template round
  PROPOSES the addition against the standing tests (one-chat-surface
  boundary; does it land on an invoice/policy) — or concludes that piece is
  eject-tier. This is the empirical guided-ceiling answer the owner ruled to
  get from tooling rather than debate. Expected going in: widget + assistant
  fit today's vocabulary; research probably needs a sources/citations key;
  workspace probably proves the ceiling.
- **T-7 · The start screen (owner):** the builder opens on a visual template
  picker — one selectable card per template, each carrying a
  blueprint/outline-style illustration of the shape being chosen (a line
  drawing of the widget-in-corner, the full-page assistant with its sidebar,
  the research layout with its sources rail, the workspace split) so the
  choice is seen, not read. Professional, and visually of a piece with the
  existing kitn brand (the docs site's look: Lato, the magenta accent, the
  kit's tokens — not a new visual language). Card anatomy: illustration,
  neutral name (T-4), one-line description; selection advances to that
  template's builder. This screen is itself a story-first design surface —
  `Labs/Builder/Start` — and doubles as the shared entry the wizard,
  the builder, and the commercial lay-person flow all converge on.
- **T-6 · Structure: `Labs/Builder/<Template>` stories,** one per template,
  each pairing that template's live-ish preview with its control panel.
  Story-first per the owner's process policy: each template's round is a
  design round the owner iterates on before anything real is wired. The
  existing single Labs/Apps Builder story is superseded by this section as
  templates land (keep it until the first template story replaces it).

## What carries forward from feat/builder-story (rounds 1-8)

BuilderPanel's section/row rhythm and stub form machinery · accept-type
ToggleChips + Advanced autosize editor · ColorField (native picker behind the
swatch) · ToggleChip primitive · the two cross-field visibility treatments
(disabled-with-reason for a dependent control; hidden-section for an
inapplicable group) · hardened useAutoResize · the two-pane shell with the
stub ChatThread preview. The layout radio and its four-mode preview are
retired (T-2); the widget-position section becomes part of the Support
widget template's controls.

## Per-template sketch (starting hypotheses — each template's own round
refines its list; expect these to be wrong in detail)

- **Support widget** (anchor; fully construct-expressible today —
  owner-widget fixture): header title · theme (accent/unread/mode) · home
  (greeting/links) · starters · attachments · history+conversations · widget
  position/launcher/defaultOpen · provider.
- **Assistant** (fullscreen + conversations): the widget set minus widget
  chrome, plus model switcher exposure and empty-state/greeting.
- **Research**: assistant set plus source/citation display controls — the
  first expected vocabulary proposal (T-5).
- **Workspace**: chat rail + work surface (panes) — expected to split into a
  construct-expressible core and eject-tier composition; its round's primary
  deliverable is that boundary, drawn concretely.

## Process

1. Owner reviews this spec.
2. Round P (Start screen, T-7): the `Labs/Builder/Start` story — four
   blueprint cards in the kitn brand language. Forces the template identities
   (names, one-liners, shape illustrations) to exist before any controls.
   Owner iterates.
3. Round W (Support widget template): restructure the existing builder story
   into `Labs/Builder/Support widget` per T-2/T-6 — mostly a reshaping of
   what exists. Owner iterates.
4. Rounds A, R, S follow one at a time, each: template story + controls +
   (T-5) any vocabulary proposal surfaced to the owner before schema work.
5. Only after the four template stories are design-approved: the real-build
   spec (schema-derived panel, dev-server wiring, template picker as entry
   surface, wizard/create-kai integration — the wizard's shape question and
   the builder's template picker should converge on the same template list,
   derived from one registry).

Out of scope for the story rounds: real schema derivation, dev-server
wiring, publishing anything. The a11y gap flagged in round 8 (Field label
association) is fixed in the real build round.
