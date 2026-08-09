# HANDOFF: kai-audio-visualizer

**Date:** 2026-08-09 · **Branch:** `worktree-audio-visualizers` in `.claude/worktrees/audio-visualizers` · **73 commits**

Read this first, then `.superpowers/sdd/2026-08-07-audio-visualizers/progress.md` (the full ledger of every
task, finding, and ruling).

---

## 0. State right now

| | |
| --- | --- |
| Tests | 1629 unit across 180 files |
| Typecheck | `pnpm exec nx typecheck ui` clean, 4/4 |
| Build | `pnpm exec nx build ui` clean, all 3 guards pass |
| Storybook | builds; dev server was running detached on **6017** |
| Docs | `nx build docs` clean |
| Element count | 79 → 80 |

**Port 6006 belongs to the MAIN checkout, not this worktree.** Rob spent an hour looking at stale stories
because of this. Always start this worktree's own Storybook on another port.

### UNCOMMITTED work in flight

`packages/ui/src/primitives/use-audio-analysis.ts` (+ its tests, + `audio-bands.test.ts`) has an agent
mid-task on the **centre-outward band mapping** (section 3 below). Check whether it is coherent before
building on it. `examples/internal/aurora-playground/` changes are from a different session; leave alone.

---

## 1. What shipped

`<kai-audio-visualizer>`, one element, six variants: `bar`, `grid`, `radial` (CSS/DOM), `wave`, `aurora`
(WebGL), `custom` (consumer GLSL). Ported from LiveKit Agents UI onto primitives with no `livekit-client`
dependency.

- **Primitives:** `audio-bands.ts`, `visualizer-sequences.ts`, `use-sequencer.ts`, `use-audio-analysis.ts`,
  `create-tween.ts`, `test-utils/fake-clock.ts`
- **Components:** `components/audio-visualizer/` (dispatcher, 6 variants, `shader-canvas.tsx`, 2 GLSL files)
- **Element:** `elements/audio-visualizer.tsx`, registered in `register-impl.ts`, parts in `slots.ts`
- **Docs:** `apps/docs/src/content/docs/components/audio-visualizer.mdx`; MCP reads live from the CEM
- **Attribution:** `packages/ui/NOTICE` (8 Apache-2.0 ported files; `aurora.glsl.ts` is original work)
- **Guards:** `scripts/verify-shader-lazy.mjs` (proven to fail before trusting)
- **IVP:** `tests/e2e/audio-visualizer-ivp.spec.ts` + `playwright.audio-visualizer.config.ts`

Plan and spec: `docs/superpowers/{plans,specs}/2026-08-07-audio-visualizers*.md`.

---

## 2. Decisions that are ROB'S, still open

1. **Veil provenance.** The aurora's shipped mode derives from a two-team clean-room fact sheet; braid and
   wind are fully clean-room. Whether veil ships in the published npm package is his call. A reviewer
   independently re-derived all four warp matrices by hand and confirmed exact match, which is the
   strongest provenance evidence available.
2. **Angular is broken by a pre-existing property-loss race** in `component-register`'s constructor
   clobbering pre-upgrade property writes. Affects **all 80 elements**, not just this one. Vue and Svelte
   need workarounds; `whenDefined` is insufficient. Recommendation: docs mitigation now, library-level fix
   as its own epic.
3. **Invalid `::part` selectors elsewhere.** Ours is fixed; the same unparseable shape is pre-existing at
   `slots.ts:238`, `:348`, `:507` for other elements. Same call: separate epic.
4. **App example in the lab.** Rob asked for a showcase app demonstrating the visualizers in context. Not
   started. Best done once the stories settle.

---

## 3. IN FLIGHT: the band-mapping work

Rob recorded real audio (`this is a test, testing one two three, hello world`) which exposed a real defect
and drove three linked changes. Artifacts in the session scratchpad (TEMP, copy out if needed):
`voice.wav`, `voice-frames.json`, `analyze-voice.mjs`, `logbands.mjs`, `itime3.mjs`, `probe2.mjs`.

**The finding, measured on his voice through the real pipeline:**

LiveKit's default window `loPass: 100, hiPass: 200` is bin indices. At `fftSize 2048` / 44.1kHz that is
**2.15–4.3kHz**, above most speech energy. Most frames of normal speech produced **all zeros**:

```
t=1.03  ours=[0,0,0,0,0]                    voice=[0.404,0.141,0.008,0,0]
t=4.09  ours=[0.372,0.46,0.441,0.526,0.486] voice=[0.599,0.484,0.399,0.386,0.382]
ours (bins 100-200): mean 0.134   voice (bins 4-120): mean 0.233
```

Their window suits their input (agent TTS over WebRTC, loud and broadband). Ours is a raw microphone.

**Three changes, approved, partly landed:**

1. **Window → roughly bins 4–120** (86Hz–2.6kHz). Approved by Rob.
2. **Log band spacing.** Does NOT fix the left-to-right ramp (90% descending vs 71% linear) but stops the
   outer bands sitting at exactly zero: `linear [0.41,0.15,0.06,0,0]` vs `log [0.58,0.46,0.31,0.11,0.01]`.
3. **Centre-outward mirrored mapping.** Rob's own words: *"when there's noise, it goes center outward"* for
   bar and grid; for radial *"the spikes grow and have different ranges and levels."* Request
   `ceil(n/2)` bands, map band 0 to the centre element and higher bands outward symmetrically. This is also
   consistent with the component's own design language, since every scripted state is centre-oriented
   (`listening` blinks centre, `connecting` sweeps a mirrored pair, `thinking` sweeps the middle row) and
   only `speaking` ramped left-to-right.

**`index.tsx` needs updating**: it currently requests one band per element and must request `ceil(n/2)`.

---

## 4. The lesson that matters most

**Nine of ~30 defects came from the plan; the implementations were mostly right on first write. The
failures cluster in VERIFICATION.** Six separate checks passed while proving nothing:

1. Bundle guard read `dist/kai.es.js`, a 24KB stub, not the 676KB `register-impl` chunk where a leak lands.
2. The `aura` alias test passed with `VARIANT_ALIASES` deleted.
3. Three recompile guards shared a single-slot fake RAF clock, so `ShaderCanvas.draw` stole the slot and
   the tweens never ticked.
4. An SSR test asserted initial zeros that hold with or without the guard.
5. The `::part` drift guard's regex went blind to a dynamic `part={...}` form, dropping to ZERO coverage
   while printing green.
6. `::part(bar)[data-kai-highlighted="true"]` **is invalid CSS** — an attribute selector cannot follow a
   pseudo-element. It shipped through 18 task reviews into `slots.ts`, the docs, and the MCP reference.

**Require watching every guard and regression test FAIL before trusting it.** Ask "would this still pass if
I deleted the feature?" See memory `checks-that-prove-nothing`.

### Two bugs from ONE design flaw

The dispatcher's `shared()` bundled `bands` with static props. Solid re-invokes the whole spread source on
any property read, so reading `state` or `precision` subscribed the reader to a signal firing 31×/sec:

- `use-sequencer.ts` reset its tick every run → **every scripted animation dead**, only `speaking` alive.
- `shader-canvas.tsx` recompiled the GL program **65×/4s** and reset `iTime`, which never passed 0.33s →
  wave and aurora rendered a third of a second on a loop. Rob: *"these could have been animated GIFs."*

Fixed at source (`b5795ac`) plus defence-in-depth memos downstream. The audit found three more latent
instances in the shader variants' tween effects.

---

## 5. How to verify anything here

Unit tests and typecheck are necessary and **not sufficient**. Every serious defect in the last stretch was
invisible to them. Use the probes in the scratchpad, and **sample per tile, never in aggregate** (I once
joined 120 radial spokes into one string, saw one distinct value, and wrongly declared radial broken).

`docs/superpowers/HANDOFF-audio-visualizers.md` section 3 of the ledger has the per-state reference: what
each state should look like for each variant, derived from the constants. Use it to judge correctness by eye.

---

## 6. Known-open, non-blocking

- Nothing from this feature is exported from `packages/ui/src/index.ts`, so the `children` render-prop is
  still unreachable publicly; spec §12 claims `ShaderCanvas` ships as an exported component and it does not.
- A `theme` change tears down and recreates the whole element, including a fresh WebGL context.
- `<kai-voice-input>` does not expose its `MediaStream`; the docs mic example calls `getUserMedia` itself.
- `complexity` is documented for all shader variants; only `custom` reads it. `theme` is ignored by wave
  and custom.
- Aurora frame cost unmeasured (~288 sines/pixel at 36 strands); the `mediump` heuristic keys off
  visualizer SIZE rather than device.
- Aurora `peakL` is an open measured FAIL (35% vs a 15% tolerance) with an unproven phase-alignment caveat.
