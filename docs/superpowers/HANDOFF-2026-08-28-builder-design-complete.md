# Handoff: builder design rounds complete, ready for implementation (2026-08-28)

Written for a fresh seat. The owner cleared the session here, before the
real-build implementation begins.

## Read in this order
1. `docs/superpowers/specs/2026-08-28-template-builder-design.md` — the
   governing spec (T-1..T-7 + amendments; template-first, six start cards,
   variant picker rule, Voice ship-gate).
2. `docs/superpowers/research/2026-08-28-builder-t5-vocabulary-proposals.md`
   — the consolidated vocabulary ruling package (11 numbered items + 10a).
   **THE OWNER HAS NOT RULED ON THESE YET** — that ruling sitting is the
   gate between the design branch and the real-build spec.
3. Memory `[[construct-engine]]` (full round-by-round state).

## Where things stand

**Branch `feat/builder-story`** (NOT merged, NOT pushed; ~45 commits off
main at #345, rebased clean): the complete story-first design of the visual
construct builder, iterated live with the owner over ~20 feedback rounds.
Storybook (`pnpm --filter @kitn.ai/ui run storybook`, :6006) holds:

- `Labs/Builder/Start` — six blueprint template cards (Support widget ·
  In-app assistant · Assistant · Research · Workspace · Voice) + a quiet
  "Start from scratch" row (bare fullscreen chat, switch template later).
- The Workspace two-step variant picker (2 cards at step-1 scale: artifact
  preview · app preview). "Switchable views" ruled its OWN family
  (Multi-mode), not a variant — reasoning in builder-workspace-variants.tsx.
- Seven template screens, each preview modeled on its Labs example (Lovable/
  v0 for Workspace incl. expand-to-full + composer plus-menu + the exact
  owner-specified header; Perplexity for Research; claude-code/perplexity-pro
  for Multi-mode — NOTE: Codex has NO mode switch, that premise was
  corrected; t3-toned transcript for Voice).
- Voice: collapsible workspace-style transcript rail (download button,
  contrast-fixed composer), talk modes (hold-mic / hold-Space with Kbd hint /
  open-mic), round secondary-gray mic, optional header, Captions component
  (segments[] API, 4 variants: lower-third/floating/minimal/stacked — built
  in a parallel worktree, reconciled).
- Cross-template machinery: template-scoped panel `sections` config,
  wordless-skeleton language (builder-skeleton.tsx), role-scoped ordered
  message-action pickers (builder-message-actions.tsx), viewport chips
  (mirroring REAL kit 480px behaviors), composer /+@ trigger knobs (defaults
  on only for Workspace/Multi-mode), command-palette + user-menu shell knobs,
  configurable header-actions editor (Share/Deploy as defaults; every header
  element optional, positions opinionated), accent live-retint (the
  --kai-*/--color-* wrapper fix).
- New shipped-quality primitives from the rounds: `ColorField` (native
  picker behind a rounded swatch), `ToggleChip` (pill toggle), `Captions`,
  hardened `useAutoResize` (min-height floor, ResizeObserver reveal,
  controlled-value resize).

Gates at handoff: full unit 5323+ green, typecheck clean, catalog-drift
clean (5 pre-existing gaps, none from this work). The dev-server Storybook
theme toggle in the Workspace header flips the PREVIEWED construct's
theme.mode, not the page (deliberate; owner aware).

## The extra-screens ruling (owner asked; settled 2026-08-28)
1. Command palette + user menu → builder shell knobs. BUILT.
2. Settings screen → PARKED until the Multi-mode vocabulary ruling; if modes
   survive, Settings is a mode/screen type.
3. Proofs (about/auth/pricing/dashboard/data-table) → NOT builder material
   (outside the one-chat-surface boundary). Routed to the general-UI docs
   round as a **Screens gallery**: browsable library, per-screen preview +
   copy-the-source button; Start screen gets only a quiet pointer; the
   gallery feeds the banked MCP capability menu. This is the concrete
   opening move of the general-UI positioning round.

## What implementation needs (in order)
1. **Owner rules on the T-5 package** (the 11 items — messageActions
   role-scoped arrays + kit-tier 'speak', aside geometry, voice wholesale,
   composer group incl. triggers/menu/labels, sources display, header
   actions, shell knobs, Multi-mode `modes[]` which may be the vocabulary
   ceiling's edge, transcript download, etc.).
2. Real-build spec per the template spec's Process step 5: schema-derived
   panel (the derivation strains the spike named: superRefine conditional
   visibility; presence/delete-on-empty path translation — registry-guard
   it), dev-server wiring (the spike proved the seam: panel → construct file
   → kai dev HMR iframe), template picker as entry, wizard/create-kai
   convergence (one template registry serving both).
3. Merge decision on feat/builder-story (design branch merges as the
   component/story base once the owner signs the designs).

## Traps for the next seat
- Storybook dev server + stale compiled.css: post-#345 the pipeline scans
  src/{components,ui,elements,primitives,utils}; stories are covered by
  .storybook/styles.css. New utility classes sometimes need
  `pnpm --filter @kitn.ai/ui run build:css` + occasionally a JIT quirk
  (Round A2 found non-deterministic arbitrary-class emission — inline
  token styles are the workaround; a report section documents it).
- Long-running subagents lose transcripts (resume fails) — re-dispatch
  fresh workers briefed from the report file, which lives in the SESSION
  scratchpad and DIES with the session: the durable copies are this doc,
  the spec, the T-5 research doc, and git history.
- Sub-agent background waits die at turn boundaries; foreground only.
- The session scratchpad also holds all screenshots (builder-all-shots/,
  captions-shots/, builder-start-shots/, builder-w-shots/) — regenerate
  from Storybook when needed rather than mourning them.
