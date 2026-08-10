# Aurora prototype: ADOPTED as the Task 14 base (Rob approved, 2026-08-07)

This folder is the complete handoff package for the aura/aurora shader work done
in Rob's side session with Fable. Rob has approved adopting this prototype as the
base for Task 14 instead of the plan's Step 1 starter shader. Read
`aura-shader-handoff.md` FIRST (all eight sections; the later sections supersede
parts of the earlier ones), then `lk-aura-factsheet.md`.

## What is in here

- `aura-proto.html`: the working prototype. THREE shader modes in one file:
  - mode 3 "veil" = the LiveKit-equivalent look. This is the Task 14 target.
  - mode 1 "braid" and mode 2 "wind" = original clean-room looks, worth keeping
    (Rob's hand-tuned braid params are the PRESET_ROB constant).
  - A full slider control panel, presets, accent + background color pickers,
    dark/light pipeline switch, and three drive sources including live mic.
  - Run it: `python3 -m http.server 8642` in this folder, open
    `http://127.0.0.1:8642/aura-proto.html?play`.
- `aura-shader-handoff.md`: analysis, measurements, tuning history, verification
  protocol, and the traps already hit so you do not rediscover them.
- `lk-aura-factsheet.md`: the two-team clean-room functional spec for the veil
  mode (facts, constants, math; produced by a separate analyst agent). This is
  the ONLY sanctioned window into how LiveKit's shader works.
- Capture + measurement harness (`*.mjs`), reference frames (`aura-frames/`,
  `lk-frames/`), and comparison videos (`aura-compare.mp4`, `lk-compare.mp4`).

## Binding rules carried forward

1. **Never open** `agent-audio-visualizer-aura.tsx` or
   `use-agent-audio-visualizer-aura.ts` from `livekit/components-js`. Unchanged.
   Work from the fact sheet and this prototype only.
2. **Provenance tiers.** Braid and wind are fully clean-room: shippable
   anywhere. Veil derives from the fact sheet (two-team clean room): it goes
   into the published npm package ONLY on Rob's explicit decision at the Task 14
   human review gate. Surface this distinction at that gate; do not decide it.
3. The shipped shader file keeps the original-work header and should name both
   the spec and this package's fact sheet as its inputs.

## Naming (Rob's direction, confirm at review)

Rob does NOT want the shipped variant called "aura". Direction: canonical
variant name **`aurora`** (as in aurora borealis) for the veil look. Candidate
name for the wind look if it ships: `ribbon`. Keep `aura` only as a
LiveKit-markup compatibility alias mapping to `aurora`, consistent with the
epic's existing state-alias pattern. Final names are Rob's call at the human
gate.

## Also raised by Rob

The slider playground itself has value beyond tuning: consider porting it as a
dev-facing Storybook story or docs-site lab page for the visualizer (sliders
map cleanly onto props/uniforms). Not in Task 14 scope; note it for the epic
backlog.

## Copies

Identical package at `/Users/home/Projects/kitn-ai/aurora-prototype/` (survives
worktree deletion). The original voice recording driving the dark-mode metrics
is `/Users/home/Movies/Record It Pro/Video/20260807123245593.mp4`.

## Vite + TypeScript port (2026-08-09)

The playground now also exists as a proper Vite + TS project at
`examples/internal/aurora-playground/` in this worktree (untracked; commit it
with the epic so it becomes a permanent in-repo reference). Same three modes,
panel, and presets; shaders split into `src/shaders.ts`, presets exported as
named constants. Run: `pnpm install --ignore-workspace && pnpm dev`.
Mirror copy: `~/Projects/kitn-ai/aurora-prototype/vite-playground/`.
