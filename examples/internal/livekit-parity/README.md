# livekit-parity

Internal instrument for the kai-audio-visualizer parity campaign. Mounts LiveKit's
actual agents-ui visualizers (bar, grid, radial, wave, aura) in one row and our
`<kai-audio-visualizer>` variants (bar, grid, radial, wave, aurora) in a second row,
fed the SAME audio, so divergence in sensitivity, idle-noise behavior, and motion
character is directly visible and measurable. Not a product; no polish intended.

## Setup

```bash
cd examples/internal/livekit-parity
pnpm setup          # vendors upstream sources + copies the voice fixture (see below)
pnpm install
pnpm exec nx build ui   # from the REPO ROOT if packages/ui/dist is missing/stale
pnpm dev            # http://localhost:6021 (6006/6018 are taken by Storybooks)
```

After `nx build ui`, remember the repo gotcha:
`git checkout -- packages/ui/src/components/component-meta.json`.

### What `pnpm setup` does, and the license rule

The upstream components are NOT on npm. LiveKit distributes them as a shadcn
registry (`@agents-ui`, from `livekit/components-js` `packages/shadcn`, internally
`@livekit/agents-ui`). The setup script fetches the ten component/hook files plus
`react-shader-toy.tsx` from GitHub raw (`LIVEKIT_REF` env overrides the ref,
default `main`) into `src/vendor/`, which is **gitignored and must stay that way**:

- `agent-audio-visualizer-aura.tsx` (component + inline GLSL) is **Polyform
  Non-Resale 1.0.0, (c) UNCRN LLC — not open source**. We run it locally for
  black-box visual comparison only. Never commit it, never copy from it. Our own
  aurora GLSL is clean-room and stays that way.
- Everything else vendored is Apache-2.0 (repo license); `react-shader-toy.tsx` is MIT.

The official install route (equivalent result, needs a components.json in a
shadcn-initialized app) is:

```bash
pnpm dlx shadcn@latest add @agents-ui/agent-audio-visualizer-bar \
  @agents-ui/agent-audio-visualizer-grid @agents-ui/agent-audio-visualizer-radial \
  @agents-ui/agent-audio-visualizer-wave @agents-ui/agent-audio-visualizer-aura
```

This app skips the shadcn CLI (it would want to own components.json/tailwind
config) and fetches the same files directly; the vendored imports' `@/…` shape is
satisfied by aliases in vite.config.ts/tsconfig.json.

`pnpm setup` also copies `voice.wav` from
`~/Projects/kitn-ai/audio-visualizers-artifacts/` (override with `VOICE_SRC`) into
`public/`. It is a local fixture — a private recording of the project owner's
voice — and is gitignored too.

Our side consumes the kit's **built dist** (`packages/ui/dist/elements/audio-visualizer.js`
via the `@kit-dist` alias) so the harness sees exactly what a consumer gets;
probe math and the baked voice fixture import from `packages/ui/src` (plain TS,
`@kit-src` alias).

## The three input modes

Both rows are always fed identically.

1. **fixture** (default, runs immediately, no permissions): the kit's baked
   196-frame voice fixture at 32ms. Ours gets the `bands` property; theirs gets
   the `volumeBands`/`volume` override props (upstream #1399). Same numbers both
   sides (centre-out mirrored for bar/grid, ring-mirrored for radial, RMS scalar
   for wave/aura) — this mode isolates animation/rendering character, not
   band-to-element mapping or analyser scale. Ideal for automated screenshots.
2. **recording** (one click for the autoplay gesture): decodes `public/voice.wav`
   through `AudioBufferSourceNode -> MediaStreamAudioDestinationNode` and loops
   it. Theirs receives a `LocalAudioTrack` wrapping that stream (with
   `track.mediaStream` set, as `createLocalAudioTrack` itself does); ours
   receives the same `MediaStream`. This exercises both sides' REAL analysis
   pipelines end to end — the kit's chain now matches upstream's (bins 100-200
   window, linear-proportional split, -100/-80dB volume scale), so any residual
   divergence the tiles or probes show here is real, not a known settings gap.
3. **mic** (click + permission): `createLocalAudioTrack()` with LiveKit's default
   processing, or via the constraints toggle: bare `audio: true` (browser
   defaults, Rob's docs-example path) or everything off (truly raw). One capture,
   both sides — so the toggle changes the input for both rows identically.

State selector (speaking / listening / thinking / connecting / initializing /
idle) is applied to both rows; our `initializing` intentionally aliases to
`connecting` (divergence row 13).

## Readouts

Small monospace numbers under each tile: their side re-runs their own hooks
(`useMultibandTrackVolume` with `{bands:5, loPass:100, hiPass:200}`,
`useTrackVolume` with `{fftSize:512, smoothingTimeConstant:0.55}` on their
-100/-80dB byte scale); our side re-runs the kit pipeline from the kit's OWN
exported analysis-settings contract — `DEFAULTS`, `BANDS_ANALYSER`,
`VOLUME_ANALYSER` plus `reduceToBands`/`reduceToVolume`, all imported from
`packages/ui/src` — with no analysis number restated in the harness, so the
probe tracks kit-side chain changes automatically. They are parallel probe
instances on the same track/stream, not taps into component internals; in
fixture mode they show the fed values. `data-probe` attributes (`their-bands`,
`their-volume`, `kit-half`, `kit-volume`) make them scriptable.

Known cost of honesty: upstream creates a fresh AudioContext per hook, so a live
mode runs ~10 AudioContexts at once (5 of theirs + 2 their-probes + our kit's
shared one + our probe). Chromium has coped in testing; if a tile's volume sticks
at 0, close/reopen the mode.

## Verify

```bash
pnpm verify   # needs `pnpm dev` running; Playwright + fake mic device
```

Drives fixture (screenshots mid-animation), recording (synthesized click), and
mic (Chromium fake audio device — a tone, not a real mic) and asserts the probes
move and the console stays clean. Screenshots land in `scripts/out/` (or
`$SHOT_DIR`). A real-microphone pass can only be done by a human at the page.
