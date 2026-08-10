# HANDOFF: kai-audio-visualizer

**Date:** 2026-08-10 · **Branch:** `worktree-audio-visualizers` in `.claude/worktrees/audio-visualizers` ·
**90 commits ahead of main; tip = this docs commit atop `4c91763`**

Read this first, then `.superpowers/sdd/2026-08-07-audio-visualizers/progress.md` (the full ledger of every
task, finding, and ruling, including the parity-campaign session block at the bottom).

---

## 0. State right now

| | |
| --- | --- |
| Tests | 1672 unit across 180 files (verified at `4c91763`) |
| Typecheck | `pnpm exec nx typecheck ui` clean, 4/4 |
| Element count | 80 |
| Tip | this docs commit, atop `4c91763` |

### Port map. Get this wrong and you review stale stories.

- **6006 = the MAIN checkout's Storybook.** Not this worktree. Rob lost an hour to this once.
- **6018 = this worktree's Storybook.**
- **6021 = the LiveKit parity harness** (`examples/internal/livekit-parity`, `pnpm dev`, strictPort).

### Landed at the end of the session

- `4c91763`: aurora connecting-rotation flip to clockwise (+5.5, was -5.5). Supervisor call, Rob
  delegated 2026-08-10; rationale in the auroraTargets doc comment. Single-line revert if the eye test
  disagrees.
- `cf6839e`: distinct scripted-state looks for the custom demo, plus the shaderTargets per-state speed
  split (idle 1, listening/speaking 2.5, thinking 4, connecting 6, disconnected 0.5) so a consumer
  shader can tell states apart from the kit's uniforms alone.
- Still uncommitted: `examples/internal/aurora-playground/`, a DIFFERENT session's work. Leave alone.

### The load-flake trio

The same 3 tests fail under full-suite parallel load and pass in isolation, every time: 2 in
`create-tween.test.ts` (".to()'d tween reaches its target", "a SECOND tween reaches its own target") and 1
in `variant-wave.test.tsx` ("frequency reaches non-zero over real animation frames"). All three run real
animation frames; load starves them. **Rule: re-run those files isolated before believing red.** Flagged
for fake-clock hardening; they will bite CI as-is.

---

## 1. What shipped (pre-campaign, still accurate)

`<kai-audio-visualizer>`, one element, six variants: `bar`, `grid`, `radial` (CSS/DOM), `wave`, `aurora`
(WebGL), `custom` (consumer GLSL). Ported from LiveKit Agents UI with no `livekit-client` dependency.

- **Primitives:** `audio-bands.ts`, `visualizer-sequences.ts`, `use-sequencer.ts`, `use-audio-analysis.ts`,
  `create-tween.ts`, `test-utils/fake-clock.ts`
- **Components:** `components/audio-visualizer/` (dispatcher, 6 variants, `shader-canvas.tsx`, 2 GLSL files)
- **Element:** `elements/audio-visualizer.tsx`; parts in `slots.ts`; registered in `register-impl.ts`
- **Docs:** `apps/docs/.../audio-visualizer.mdx`; the MCP reads live from the CEM
- **Attribution:** `packages/ui/NOTICE` (8 Apache-2.0 ported files; `aurora.glsl.ts` is original work)

Plan and spec: `docs/superpowers/{plans,specs}/2026-08-07-audio-visualizers*.md`.

---

## 2. The LiveKit parity campaign (2026-08-09/10)

Commits `24534bd` (stories mirror) then `c22933e..4c91763`, plus the docs commit carrying this handoff.
Everything below was measured against LiveKit's actual components running side by side on identical
audio, not against screenshots.

1. **Stories centre-outward mirror** (`24534bd`): caller-supplied `bands` bypass the component's mirror by
   contract, so the speaking tiles still ramped left-heavy. Fixed the stories, not the contract: voice
   fixture re-baked at ceil(n/2) width, mirrored through the component's own primitives, plus a per-tile
   Playwright symmetry guard watched failing on the ramp (worst pair deviation 0.343 vs 0.045 tolerance)
   before going 7/7 green.
2. **White-noise root cause + chain alignment** (`c22933e`): Rob's mic through LiveKit's components shows
   no white noise; ours idled at half height with constant flicker. Measured cause: the widened bins-4-120
   window admits low-frequency room tone that upstream's bins 100-200 never see (room tone there sits 17dB
   under the -100dB floor); the geometric split concentrated the noisiest bins into the centre band; our
   volume analyser ran 2.5x cooler than theirs. Fix: revert to upstream's window (bins 100-200, wide
   window stays a documented primitive-level opt-in), upstream's linear proportional chunking (geometric
   deleted), their volume scale (minDecibels -100 / maxDecibels -80). Verified: idle band-over-rate 5-7%
   vs their 4-6% (was 58-64%), volume mean within 1-4% (was ~3x low).
3. **Single-writer speaking override** (`1a3eb38`): two sibling effects raced for the same tween in wave
   and custom; under load the base tween could land after the volume override and park the line at
   baseline, never self-healing on static drive. Merged to one effect per tween owner; regression tests
   force the adverse subscription order deterministically.
4. **Aurora behavioral parity, clean-room** (`9020656`): rotation clockwise (time-reversed wind + per-state
   trims), pulse tone-mapping so the ring cannot blink out, hue ~197 with saturation rising 0.95-0.97,
   sharper edges, spring entry on listening. Radius-vs-volume fit 43.5/44.7 vs their 43.9/44.8. The
   Polyform aura shader was never read; targets come from pixel audits + the Apache-2.0 driving hook.
5. **Grid threshold remap + dark idle** (`17214f7`) and **square `count` API** (`33e8b07`, BREAKING:
   `rowCount`/`columnCount` replaced by `count`). See divergences below.
6. **Upstream mic constraints + solid custom demo** (`348f09b`): Microphone stories request LiveKit's
   constraint set (echoCancellation, noiseSuppression, autoGainControl, voiceIsolation) instead of bare
   `audio:true`; custom demo rewritten as a continuous spectrum ridge, LED segmentation opt-in via
   `complexity`.
7. **Wave idle = gentle undulation** (`0dbfb2f`): upstream's wave switch has no idle arm; idle falls
   through to the speaking targets. Ours had mapped idle to their FLAT look, which is actually their
   `disconnected`.
8. **First-class `disconnected` state** (`33e8b07`): wave flat-lines like upstream, bar/grid/radial go
   dark, aurora keeps breathing; `failed` now aliases to `disconnected`. The `798d78b` audit measured
   upstream at disconnected vs idle: **wave is their only variant that differs**, which is what each of
   our arms pins. Represented in the stories picker, StateMatrix, autodocs, facade typing, docs.
9. **Custom per-state looks** (`cf6839e`): the demo shader renders distinct scripted-state looks, and
   shaderTargets gives every state its own speed (idle 1, listening/speaking 2.5, thinking 4,
   connecting 6, disconnected 0.5) because uSpeed is the only state-correlated scalar besides intensity
   that reaches a consumer shader's GLSL.
10. **Aurora rotation unify** (`4c91763`): connecting flips to clockwise; see divergences below.
11. **The harness itself** (`09dc7d6`, instruments `42ef268`): see section 5.

---

## 3. Deliberate upstream divergences (the complete list)

All documented in-code at the divergence site, all Rob-driven, all measured first:

- **Grid, three** (`17214f7`): (a) speaking thresholds scale to the realistic speech ceiling,
  `max((|mid-y|/(mid+1)) * 0.65, 0.02)`, because real speech peaks at 0.51-0.54 through the aligned chain
  and upstream's 2/3 outer-row threshold fired zero times in 139 measured speech samples on THEIR grid
  too; (b) the middle row's always-true 0 becomes a 0.02 silence floor, so a silent mic shows an empty
  grid; (c) scripted idle highlights nothing where upstream rests one lit centre cell.
- **Grid, earlier pair** (Task 2, in `visualizer-sequences.ts`): gridRing centerX on non-square grids and
  spread=0 treated as unset. Less reachable now that the element API is square-only.
- **Wave idle semantics**: our idle matches their idle (gentle, the fall-through) and their flat look
  lives at our first-class `disconnected`. Not a divergence so much as a re-mapping; the divergence would
  have been keeping idle flat.
- **Aurora connecting rotation** (landed `4c91763`): flipped CW to match every other transitional state.
  The CCW value came from the screenshot-cadence estimator later shown unreliable; upstream drives
  thinking/connecting with identical dynamics.

`disconnected` arms for bar/radial/grid/aurora mirror idle per the `798d78b` measurement; custom's runs
its own dimmer speed (0.5, `cf6839e`). Each is a dedicated one-line-adjustable case.

---

## 4. Decisions that are ROB'S, still open

1. **Veil provenance.** The aurora derives from a two-team clean-room fact sheet; braid/wind are fully
   clean-room. Whether veil ships in the published npm package is his call. A reviewer independently
   re-derived all four warp matrices by hand, exact match.
2. **Angular property-loss race** in `component-register`: pre-upgrade property writes clobbered, affects
   all 80 elements. Docs mitigation now, library-level fix as its own epic.
3. **Invalid `::part` selectors elsewhere**: ours fixed (`54cf024`); the same unparseable shape is
   pre-existing at `slots.ts:238`, `:348`, `:507` for other elements. Separate epic.
4. **Showcase app** demonstrating the visualizers in context. Not started.
5. **Grid density follow-ups**: the square-count explorer (`scripts/grid-size-explore.mjs` +
   `grid-size-supplement.mjs` in the harness) measured n x n looks on both sides; whether the per-size
   defaults change is his call.
6. **use-voice-recorder constraints**: the Microphone STORIES now request LiveKit's constraint set
   (`348f09b`), but the kit's own `use-voice-recorder` primitive (behind `<kai-voice-input>`) still
   requests bare audio. Whether it adopts the same set is an API/behavior call.

---

## 5. The parity harness: how to verify against upstream

`examples/internal/livekit-parity`: LiveKit's actual agents-ui visualizers in one row, ours in a second,
same audio (live mic with constraints toggle, Rob's recording, deterministic fixture). Read its README.

```bash
cd examples/internal/livekit-parity
pnpm setup       # vendors upstream + fetches voice.wav; vendor dir is GITIGNORED
pnpm install
pnpm exec nx build ui   # from repo root if packages/ui/dist is stale
pnpm dev         # http://localhost:6021
```

**License rule, non-negotiable:** the vendored aura component is Polyform Non-Resale (UNCRN LLC), not open
source. Run locally for black-box comparison only. Never commit it, never copy from it; our aurora GLSL
stays clean-room. After `nx build ui`: `git checkout -- packages/ui/src/components/component-meta.json`.

Scripts (`scripts/`): `parity-acceptance.mjs` holds the four locked comparative assertions (idle silence,
volume scale, band activity, flicker), proven RED on the pre-alignment build and stable GREEN after; per-
variant pixel audits (`wave-audit`, `aurora-audit` + `aurora-followup`, `grid-audit`, `thinking-audit`,
`wave-idle-audit`, `their-disconnected-audit`); `wave-reentry-repro.mjs` reproduces the tween race;
`grid-size-explore/-supplement` for density; `pnpm verify` runs `verify.mjs`.

---

## 6. Verification lessons. This epic's real product.

**Six separate checks passed while proving nothing** before the campaign (bundle-guard stub, undeletable
alias test, single-slot RAF clock, vacuous SSR zeros, regex-blind parts guard, and
`::part(bar)[data-kai-highlighted]` which is INVALID CSS and survived 18 reviews). **Watch every guard and
regression test FAIL before trusting it. Ask: would this pass with the feature deleted?** See memory
`checks-that-prove-nothing`.

Campaign additions:

- **Extreme-value statistics at convergence.** The screenshot-cadence rotation estimator produced the
  connecting CCW value; the closing sweep showed its IQR swamps the medians, so the split direction was
  noise. When two implementations converge, the residual you are estimating shrinks below your
  instrument's spread. Check the spread before trusting a small signed difference.
- **Probe quantization epsilons.** Pixel probes quantize; the band-shape spec needed an explicit
  grid-only tolerance on centre-max, and round-two instruments added full-precision probe hooks. Give
  every comparative assertion an epsilon derived from the probe, not from optimism.
- **Sample per tile, never in aggregate.** Joining 120 radial spokes into one string once collapsed real
  variation into one value and produced a false broken verdict.
- Unit tests + typecheck are necessary, never sufficient. Rob's live review found 6 defects every
  automated layer missed. The harness exists so "matches upstream" is a measurement, not an impression.

---

## 7. Known-open, non-blocking

- Nothing from this feature is exported from `packages/ui/src/index.ts` (grep-verified today), so the
  `children` render-prop is still unreachable from the library entry; spec §12 claims `ShaderCanvas` is
  exported and it is not.
- A `theme` change tears down and recreates the whole element, including a fresh WebGL context.
- `<kai-voice-input>` does not expose its `MediaStream`; the docs mic example calls `getUserMedia` itself.
- `complexity` is documented for all shader variants; only `custom` reads it. `theme` is ignored by wave
  and custom.
- Aurora frame cost unmeasured (~288 sines/pixel at 36 strands); the `mediump` heuristic keys off
  visualizer SIZE rather than device.
- The load-flake trio (section 0) awaits fake-clock hardening.
