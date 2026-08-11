# aurora playground

Interactive tuning playground for the aurora audio visualizer. Three shader modes
(braid, wind, veil), a slider for every tunable, presets, accent and background
color pickers, and three drive sources including live microphone.

Built during the 2026-08-07 aurora prototyping session; kept here as a permanent
reference. The full research package (reference frames, measurement harness,
comparison videos, handoff doc, clean-room fact sheet) lives in the epic's SDD
workspace at `.superpowers/sdd/2026-08-07-audio-visualizers/reference/aura-prototype/`
and in `~/Projects/kitn-ai/aurora-prototype/`.

## Run

```bash
pnpm install --ignore-workspace
pnpm dev
```

Open the printed URL. Query params: `?still` renders a single frame with no panel
(for automation; `window.renderAt(t, level)` and `window.setParams({...})` are
exposed), `?size=N` scales the canvas.

## Layout

- `src/shaders.ts` holds the vertex + fragment shaders. All three modes live in
  one fragment shader, switched by the `uMode` uniform.
- `src/main.ts` holds the GL host, the presets (exported constants: SOFT, BOLD,
  ROB, WIND, VEIL, VEIL_TALK), the slider spec, and the drive sources.

## Provenance

Braid (mode 1) and wind (mode 2) are original clean-room work. Veil (mode 3) was
implemented from a two-team clean-room fact sheet describing the upstream aura
(`lk-aura-factsheet.md` in the SDD package); whether veil ships in the npm package
is decided at the epic's Task 14 human gate. Never open the upstream aura source
files (see the SDD package README).
