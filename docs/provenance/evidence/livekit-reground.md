# LiveKit re-grounding: divergence map, noise-floor mechanism, parity groundwork

Date: 2026-08-09. Prepared for the kai-audio-visualizer epic (worktree `.claude/worktrees/audio-visualizers`).
All upstream files were fetched in full from GitHub `main` on 2026-08-09 and are cached in
`scratchpad/upstream/` next to this file. Line numbers cite those snapshots.

---

## 1. Provenance: what we ported, and where upstream lives today

Our NOTICE (`packages/ui/NOTICE`) attributes the port to **livekit/components-js**:

- `src/primitives/audio-bands.ts` ← `packages/react/src/hooks/useTrackVolume.ts`
- `src/primitives/visualizer-sequences.ts` ← `packages/shadcn/hooks/agents-ui/use-agent-audio-visualizer-{bar,grid,radial,wave}.ts`
- `src/components/audio-visualizer/{sizes.ts,variant-bar,variant-grid,variant-radial,variant-wave}.tsx` ← `packages/shadcn/components/agents-ui/agent-audio-visualizer-{bar,grid,radial,wave}.tsx`
- `src/components/audio-visualizer/wave.glsl.ts` ← verbatim from `agent-audio-visualizer-wave.tsx`
- `aurora.glsl.ts` — original work (clean-room), NOT from LiveKit.

Upstream today: the same repo, same paths. `packages/shadcn` is the source of the **`@agents-ui` shadcn
registry** (`registry.json`: `"name": "@agents-ui"`, homepage `https://livekit.com/ui`), internally named
`@livekit/agents-ui` v1.0.7, `"private": true` — **not published to npm**; consumers vendored it via
`pnpm dlx shadcn@latest add @agents-ui/agent-audio-visualizer-bar` (Rob's docs link confirms the same
install line). Runtime npm deps are `@livekit/components-react` (latest **2.9.23**), `livekit-client`
(latest **2.21.0**), `motion` (registry pins `^12.16.0`; latest 13.0.0), `class-variance-authority`.

The docs page component set today: **bar, grid, radial, wave, aura**, plus `react-shader-toy` (the WebGL
runtime both shaders share) and one composed block, `agent-session-view-01`.

---

## 2. Upstream audio analysis chain, end to end

### 2.1 Track → AnalyserNode (`livekit-client` `src/room/utils.ts:544-594`)

Every visualizer hook goes through `createAudioAnalyser(track, options)`:

```ts
const opts = {
  cloneTrack: false,
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  minDecibels: -100,
  maxDecibels: -80,          // <-- NOT the Web Audio default of -30
  ...options,
};
const audioContext = getNewAudioContext();   // fresh context per hook instance
const streamTrack = opts.cloneTrack ? track.mediaStreamTrack.clone() : track.mediaStreamTrack;
const mediaStreamSource = audioContext.createMediaStreamSource(new MediaStream([streamTrack]));
```

Notes:

- **A fresh `AudioContext` per hook** (closed on cleanup). No sharing, no caching (we diverge here on
  purpose; harmless).
- **`minDecibels: -100, maxDecibels: -80` are set on the AnalyserNode.** These affect ONLY
  `getByteFrequencyData` (byte values linearly map that dB window to 0..255 and saturate outside it).
  `getFloatFrequencyData` — the bands path — is unaffected. Consequence for the byte/volume path is large;
  see §4.
- Accepted input types across their hooks/components: `LocalAudioTrack | RemoteAudioTrack |
  TrackReferenceOrPlaceholder`. A plain track works — `useMultibandTrackVolume` does
  `trackOrTrackReference instanceof Track ? track : ref?.publication?.track`
  (`useTrackVolume.ts:111-114`), and both hooks guard on `track.mediaStream` being set.

### 2.2 What their input has been through (INPUT-side facts)

- The agents-ui docs wire `audioTrack` from `useAgent()` — the **agent's remote TTS track**: loud,
  broadband, studio-clean (no room), delivered over WebRTC.
- For **local mic tracks** made with LiveKit (`createLocalAudioTrack`, `client-sdk-js
  src/room/track/create.ts:178-183` → `createLocalTracks` → `mergeDefaultOptions(…, audioDefaults, …)`),
  the capture defaults are (`src/room/defaults.ts:25-31`):

  ```ts
  export const audioDefaults: AudioCaptureOptions = {
    deviceId: { ideal: 'default' },
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    voiceIsolation: true,
  };
  ```

  So a LiveKit-captured mic is AGC-boosted, noise-suppressed, voice-isolated **before** any analyser sees
  it. (Browsers also default AGC/NS/EC on for bare `getUserMedia({audio:true})`, but LiveKit additionally
  requests `voiceIsolation`.)

### 2.3 Multiband processing (`components-js packages/react/src/hooks/useTrackVolume.ts`)

Hook: `useMultibandTrackVolume` (lines 107-167). Defaults (lines 95-101):

```ts
const multibandDefaults = {
  bands: 5,
  loPass: 100,
  hiPass: 600,               // hook default; the shadcn components override to 200
  updateInterval: 32,
  analyserOptions: { fftSize: 2048 },
} as const;
```

All three DOM visualizer components override the window identically —
`{ bands: count, loPass: 100, hiPass: 200 }` (`agent-audio-visualizer-bar.tsx:180-184`,
`grid.tsx:278-282`, `radial.tsx:141-145`; the radial's loPass was bumped 80 → 100 in PR #1265).
`loPass`/`hiPass` are **bin indices** (their own doc: "this is not a frequency measure", lines 79-87).
At the WebRTC-standard 48kHz, fftSize 2048 → 23.4Hz/bin, so **bins 100-200 = 2.34–4.69kHz** (at 44.1kHz:
2.15–4.31kHz). Cadence: `setInterval(updateVolume, 32)` ≈ 31Hz. Smoothing: `createAudioAnalyser`'s 0.8.

Per tick (lines 130-156):

1. `getFloatFrequencyData` (raw dB floats; min/maxDecibels irrelevant here).
2. `frequencies.slice(loPass, hiPass)`.
3. `normalizeFrequencies` (lines 53-70) — **the entire normalization, verbatim**:

   ```ts
   const normalizeDb = (value: number) => {
     const minDb = -100;
     const maxDb = -10;
     let db = 1 - (Math.max(minDb, Math.min(maxDb, value)) * -1) / 100;
     db = Math.sqrt(db);
     return db;
   };
   // -Infinity -> 0
   ```

   Everything at or below **-100dB maps to exactly 0** (sqrt(1-1)=0). There is **no other floor, gate,
   silence threshold, minimum clamp, or hysteresis anywhere in the file** — I read it end to end.
4. Band split (lines 141-153, rewritten by PR #1265 "fix: useMultibandTrackVolume clipping",
   2026-01-14): **linear proportional distribution** — `startIndex = floor(i*totalBins/bands)`,
   averaged per chunk. With the components' window that is 100 bins / 5 bands = **20 bins averaged per
   band**. (A comment "we want logarithmic chunking here" existed pre-#1265; they went proportional
   instead.)

### 2.4 Scalar volume path (`useTrackVolume`, lines 14-51)

- `getByteFrequencyData` → RMS over bins / 255, at `setInterval(…, 1000/30)`.
- Hook default `{ fftSize: 32, smoothingTimeConstant: 0 }`, but **wave and aura both call it with
  `{ fftSize: 512, smoothingTimeConstant: 0.55 }`** (`use-agent-audio-visualizer-wave.ts:54-57`,
  `use-agent-audio-visualizer-aura.ts:61-64`).
- Because `createAudioAnalyser` leaves its own defaults for the rest, the analyser runs with
  **`minDecibels -100 / maxDecibels -80`**: every bin at or above **-80dB reads 255**. Their volume
  scalar is therefore extremely hot — effectively "sqrt of the fraction of spectrum with any energy
  above ≈-80dB" — and swings through a wide range during speech.

---

## 3. FOCAL QUESTION — why upstream does not jitter on a live/idle mic

Rob's new datum: his own mic through their components shows **no white-noise defect while remaining
speech-reactive**, so the explanation must live in their code path. Mechanisms, ranked, each labeled
CODE (in their source) or INPUT (assumption about the signal):

**1. (CODE, dominant) The analysis window sits ABOVE the noise floor's spectrum, and the -100dB floor
maps everything below it to exactly zero.** Room tone / HVAC / mic self-noise is overwhelmingly
low-frequency; above ~2.3kHz its per-bin energy on a normal mic sits below -100dBFS. Their window (bins
100-200 = 2.34–4.69kHz) reads those bins, `normalizeDb` clamps ≤-100 to **exact 0** — not "small", zero —
so idle bars are perfectly still. Speech still registers because consonants and sibilance (s/t/sh/f, and
vowel upper formants) put real energy in 2-5kHz that crosses the floor. **The window + hard floor IS
their noise gate; there is no explicit gate anywhere.** Our own ledger corroborates the trade: at that
window Rob's raw clip read mean 0.136 with 54% all-zero frames (HANDOFF §3) — weak-but-clean on raw
audio, healthier on a processed live mic (AGC lifts speech toward target level; see #3).

**2. (CODE, second order) Linear split over that window averages ~20 bins per band.** Any bin-level
flicker that does clear the floor is diluted 20:1 (`useTrackVolume.ts:141-153`). Contrast ours: geometric
edges over bins 4-120 give band 0 only bins 4-8 — 4-5 bins, at the noisiest frequencies, and the mirror
then paints that band on the CENTRE element. Their quietest estimator is nobody's centrepiece; ours is.

**3. (INPUT, real but insufficient alone) The input is conditioned before analysis.** Primary usage is
the agent's TTS track (no room at all, only ever visualized in `speaking`). Local-mic tracks captured
through livekit-client get `autoGainControl + noiseSuppression + echoCancellation + voiceIsolation`
(`defaults.ts:25-31`). AGC matters for reactivity (pushes speech energy up into the 2-5kHz window's
sensitivity); NS/voiceIsolation matter for idle cleanliness below ~1kHz — but Rob's A/B (their stack
clean, ours noisy, same mic and roughly the same browser processing) shows the window choice, not input
conditioning, is what separates the two stacks.

**4. (CODE, contextual) Bands are rendered only while `state === 'speaking'`.** Bar zeroes bands
otherwise (`agent-audio-visualizer-bar.tsx:210-213`), grid ignores them, radial forces height 0
(`radial.tsx:223`). In a correctly wired agent app an idle mic never drives pixels — the scripted
listening/thinking animations carry those states. We ported this gate faithfully, so it does not explain
the A/B either; it explains why nobody upstream ever needed the wide-window case to look good.

**5. (Explicitly NOT factors)** The dB curve/floor is byte-identical to ours (we carried it verbatim);
smoothingTimeConstant is identical (0.8 bands / 0.55 volume); there is no gating, hysteresis, floor
subtraction, or per-band conditioning anywhere in `useTrackVolume.ts`, the five agents-ui hooks, or the
five components. `minDecibels/maxDecibels -100/-80` does not touch the bands path (float reads).

**The crux for the divergence table:** what upstream does INSTEAD of a wide raw window is: keep the
window narrow and high (sibilance band), let the -100dB floor zero the idle spectrum, average many bins
per band, and let AGC'd/TTS input supply the in-window energy. They never attempt to visualize the
85-2000Hz range where a live room lives. Our regression window matches exactly: the noise appeared when
we widened bins 100-200 → 4-120 (commit `3f34a45` era) and concentrated band 0 on bins 4-8 at the centre.

Quantified with the shared curve: `normalizeDb(-100)=0`, `(-90)=0.32`, `(-85)=0.39`, `(-75)=0.50`,
`(-70)=0.55`. A room tone averaging -75dB across 86-172Hz idles the centre bar at 0.5 — Rob's exact
symptom. The same room reads ≤-100dB across 2.34-4.69kHz → 0.0 upstream.

---

## 4. Wave deep-dive (driving, not shader)

Upstream wave = `agent-audio-visualizer-wave.tsx` (component + inline GLSL) +
`use-agent-audio-visualizer-wave.ts` (driving) + `react-shader-toy.tsx` (runtime).

**Signals consumed:** ONE scalar — `useTrackVolume(audioTrack, { fftSize: 512, smoothingTimeConstant:
0.55 })` — never bands. `volume` prop overrides the computed value (`volume: volumeProp ?? trackVolume`,
hook lines 54-58). Cadence: 30Hz interval.

**State machine** (hook lines 60-98, `motion`'s `animate`, default transition
`{ duration: 0.2, ease: 'easeOut' }`), constants `DEFAULT_SPEED 5`, `DEFAULT_AMPLITUDE 0.025`,
`DEFAULT_FREQUENCY 10`:

| state | speed | amplitude | frequency | opacity |
|---|---|---|---|---|
| disconnected | 5 | →0 | →0 | →1.0 |
| listening | 5 | →0.025 | →10 | pulse 1.0↔0.3, 0.75s, mirror, ∞ |
| thinking/connecting/initializing | 20 | →0.00625 | →40 | pulse 1.0↔0.3, 0.4s, mirror, ∞ |
| speaking (and default) | 10 | →0.025* | →10* | →1.0 |

**Speaking override** (lines 100-105) — the load-bearing part, applied INSTANTLY on every volume tick:

```ts
if (state === 'speaking') {
  animateAmplitude(0.015 + 0.4 * volume, { duration: 0 });
  animateFrequency(20 + 60 * volume, { duration: 0 });
}
```

**Rendering details** (component): defaults `size 'lg'`, `state 'speaking'`, color `#1FD5F9`,
`colorShift 0.05`, `lineWidth` 2 (icon/sm) else 1, `blur 0.5`; container `aspect-square` with a
horizontal fade mask `mask-[linear-gradient(90deg,transparent 0%,black 20%,black 80%,transparent 100%)]`;
`devicePixelRatio` forwarded to the runtime; uniforms pushed every rAF from a ref (no recompiles);
IntersectionObserver pauses off-screen rendering (`react-shader-toy.tsx:917-935`).

**Our wave** (`variant-wave.tsx` + `waveTargets` in `visualizer-sequences.ts:232-280`) carries the same
constants, same speaking override `0.015 + 0.4v` / `20 + 60v`, same mask, same lineWidth/blur/colorShift,
same per-state table. **The faithful-port verdict stands for the driving math. The real divergence is the
INPUT to that math:** upstream's `volume` comes from a byte analyser scaled over **-100..-80dB**
(saturates at -80dB → speech routinely yields v ≈ 0.4-0.9), while ours (`use-audio-analysis.ts:98-101` +
`reduceToVolume`) uses the AnalyserNode spec default **-100..-30dB** — a 70dB-wider scale on which the
same speech yields a far smaller v. Fed into `0.015 + 0.4v`, our wave's amplitude barely leaves its
baseline where theirs swings visibly. This is a concrete, certain, code-level cause for "our wave doesn't
feel like theirs". (Also: when a caller supplies `bands`, our dispatcher derives volume as RMS of
already-normalized 0..1 band values (`index.tsx:284-290`) — a third, different scale again.)

Secondary wave deltas: upstream `speaking` is the DEFAULT state and unknown states fall through to the
speaking arm; ours defaults to `idle` (amplitude 0 → flat line). Upstream `disconnected` keeps
speed 5 with amplitude→0; our `idle` zeroes amplitude AND frequency with speed 5 — same visual (flat).

## 5. Aura deep-dive (driving)

Upstream aura = `agent-audio-visualizer-aura.tsx` (+ inline GLSL, Polyform-licensed, see §7) +
`use-agent-audio-visualizer-aura.ts` (Apache-2.0). Driving signals: same hot `useTrackVolume`
(512 / 0.55 / byte scale -100..-80). Constants: speed 10, amplitude 2, frequency 0.5, scale 0.2,
brightness 1.5; landing transition `{0.5s easeOut}`, pulse `{0.35s easeOut, mirror, ∞}` (hook lines
17-28):

| state | speed | scale | amplitude | frequency | brightness |
|---|---|---|---|---|---|
| idle/failed/disconnected | 10 | 0.2 | 1.2 | 0.4 | 1.0 |
| listening / pre-connect-buffering | 20 | 0.3 spring(1.0s, bounce .35) | 1.0 | 0.7 | pulse 1.5↔2.0 |
| thinking/connecting/initializing | 30 | 0.3 | 0.5 | 1.0 | pulse 0.5↔2.5 |
| speaking | 70 | 0.3 → live | 0.75 | 1.25 | 1.5 |

Speaking volume override (lines 105-117): `if (speaking && volume > 0 && !scaleMotionValue.isAnimating())
animateScale(0.2 + 0.2 * volume, { duration: 0 })` — note the **`isAnimating()` guard**: the 0.5s state
landing (or the listening spring) finishes before live volume takes the wheel. Component fixes
`blur 0.2`, default `colorShift 0.05` (prop default 1.0 inside AuraShader), theme via `uMode`
(dark default; light branch drops bloom, boosts saturation), DPR forwarded.

Ours (`variant-aurora.tsx`) matches per-state values through the fact-sheet (`auroraTargets`), with three
behavioral deltas: our speed is the fact-sheet's S/20 mapping onto a different (clean-room) shader; we
have **no spring** on listening scale (plain 0.5s easeOut); our volume override is a pure derivation
without the `isAnimating` guard (volume takes over instantly mid-landing) and relaxes to base when
volume hits 0 (upstream's motion value keeps the last driven scale until the next state change — their
guard also means a pause mid-speech leaves scale wherever volume last put it). And our volume input is
cooler for the same audio (same -100..-30 vs -100..-80 issue as wave).

---

## 6. Standalone runnability (for the parity harness)

**No LiveKit server, room, token, or agent is needed.** Verified from source:

- The visualizer components take `audioTrack` and `state` as plain props; `useAgent()` /
  `AgentSessionProvider` is just the docs' way of obtaining them. `AgentState` is a string union
  (`useAgent.ts:45-46`): `'disconnected' | 'connecting' | 'pre-connect-buffering' | 'failed' |
  'initializing' | 'idle' | 'listening' | 'thinking' | 'speaking'` — pass literals directly.
- `createLocalAudioTrack(options?)` (livekit-client `src/room/track/create.ts:178`) calls
  `getUserMedia` directly and **sets `track.mediaStream = stream`** (`create.ts:138`), which is exactly
  what `useTrackVolume`/`useMultibandTrackVolume` guard on (`useTrackVolume.ts:23,121`). A Room is never
  touched. So the minimal harness is:

  ```tsx
  const track = await createLocalAudioTrack();       // livekit-client, AGC/NS/voiceIsolation defaults
  <AgentAudioVisualizerBar state="speaking" audioTrack={track} />
  ```

  To A/B the raw-mic case, pass `createLocalAudioTrack({ autoGainControl: false, noiseSuppression:
  false, echoCancellation: false, voiceIsolation: false })`.
- Every visualizer ALSO accepts precomputed overrides — `volumeBands?: number[]` on bar/grid/radial,
  `volume?: number` on wave/aura (added upstream 2026-07-29, PR #1399) — so fixture-driven parity runs
  (our baked voice frames vs theirs) need no audio at all.
- Install: `pnpm dlx shadcn@latest add @agents-ui/agent-audio-visualizer-{bar,grid,radial,wave,aura}`
  (vendors TSX into the app), or copy the five component + five hook files straight from
  `packages/shadcn` (they only import `@livekit/components-react@^2.0.0`, `livekit-client@^2.0.0`,
  `motion`, `cva`, `cn`). npm versions current at fetch: components-react 2.9.23, livekit-client 2.21.0.
  Tailwind v4 required for the cva classes; `react-shader-toy` has no deps beyond React.

## 7. License map (file by file, current upstream `main`)

| File | License | Basis |
|---|---|---|
| repo `livekit/components-js` (root LICENSE) | Apache-2.0 | LICENSE file read |
| `packages/shadcn/package.json` (`@livekit/agents-ui`) | `"license": "Apache-2.0"` | package.json |
| `packages/react/src/hooks/useTrackVolume.ts` (all three hooks) | Apache-2.0 | repo license, no header |
| `agent-audio-visualizer-bar/grid/radial.tsx` + their hooks | Apache-2.0 | repo license, no header |
| `agent-audio-visualizer-wave.tsx` **including the inline wave GLSL** + `use-agent-audio-visualizer-wave.ts` | Apache-2.0 | repo license, no header — our verbatim `wave.glsl.ts` extraction is clean |
| `react-shader-toy.tsx` | **MIT** (header: © 2018 Morgan Villedieu, © 2023 Rysana Inc., © 2026 LiveKit fork) | file header |
| `agent-audio-visualizer-aura.tsx` **including the inline aura GLSL** | **Polyform Non-Resale 1.0.0, © 2026 UNCRN LLC (Unicorn Studio)** — NOT open source | file header; the ONLY Polyform hit in the repo (code search) |
| `use-agent-audio-visualizer-aura.ts` (the aura DRIVING hook) | Apache-2.0 | repo license, **no Polyform header** |
| `livekit-client` (`client-sdk-js`) | Apache-2.0 | repo |

Consequence for parity work: **the aura's behavior (state targets, pulse cadences, volume→scale
mapping, spring, guard) is Apache-clean to study and match — it lives entirely in the hook and the
component's prop plumbing. Only the aura shader internals are Polyform-restricted**, and our clean-room
aurora GLSL stays as the renderer. Everything else in the catalog, wave shader included, is
license-clear with attribution (already in NOTICE).

## 8. What changed upstream since our port (2026-08-07)

`packages/shadcn` commits after ~mid-July: `e93267ca` 2026-08-04 "Update agents-ui registry path and
package sync target" (#1413 — registry/publish plumbing, no visualizer behavior), `76f5a4d7` 2026-08-03
Tailwind update, `06230796` 2026-07-30 downstream registry publish scripts, `0cb785e9`/`28ab8b46`
2026-07-29 **volumeBands/volume override props on all visualizers (#1399)** — this one landed days
before our port and matches our `bands` prop concept. No behavioral change to analysis or animation
since the port. The multiband math last changed 2026-01-14 (#1265: proportional chunking + radial
loPass 80→100), long before the port; `useTrackVolume.ts` is otherwise untouched since 2025-10.

---

## 9. Stage-by-stage divergence table

Upstream refs are the 2026-08-09 snapshots; ours are worktree paths. "Recorded?" = written rationale in
HANDOFF-audio-visualizers.md §3, the progress ledger, or in-file comments.

| # | Stage | Upstream today | Ours | Why we diverged (recorded) | Consequence |
|---|---|---|---|---|---|
| 1 | Context/source | Fresh `AudioContext` + source per hook (`client utils.ts:556-563`) | One shared context, cached source nodes (`use-audio-analysis.ts:113-139`) | Contexts capped per page; Chromium multi-source loss (in-file) | Ours better for multi-tile pages; no noise impact |
| 2 | Input signal | Agent TTS remote track; local mics captured with AGC+NS+EC+voiceIsolation (`defaults.ts:25-31`) | Raw caller `MediaStream`/`<audio>`; docs example calls bare `getUserMedia` | Not recorded as a divergence | Consumers can hand us unprocessed audio; upstream's stack can't receive one unless explicitly told to |
| 3 | Bands analyser | fftSize 2048, smoothing 0.8 (`utils.ts:548-555`) | Same (`use-audio-analysis.ts:86-89`) | n/a (match) | — |
| 4 | **Analysis window** | **bins 100-200** at every component call site (`bar.tsx:180-184` etc.; hook default 100-600, `useTrackVolume.ts:95-101`) | **bins 4-120** (`use-audio-analysis.ts:59-64`) | HANDOFF §3: upstream window read all-zero on 54% of raw-mic frames | Real-mic reactivity gained; the -100dB floor stops acting as a noise gate — 86-500Hz room tone now reads 0.3-0.55. **The regression Rob sees.** |
| 5 | Band split | Linear proportional, ~20 bins averaged/band (`useTrackVolume.ts:141-153`, post-#1265) | Geometric (`audio-bands.ts:49-80`) | Keeps outer bands off zero (in-file + HANDOFF §3) | Our band 0 = bins 4-8: fewest bins, noisiest frequencies, highest variance |
| 6 | Normalization | `normalizeDb` -100..-10 + sqrt (`useTrackVolume.ts:53-70`) | Verbatim identical (`audio-bands.ts:22-26`) | n/a (match) | No gate on either side; upstream's "gate" is stages 4+5 |
| 7 | Band→element mapping | None: raw band order left-to-right / around ring | Centre-out mirror, ceil(n/2) bands (`audio-bands.ts:127-173`, `index.tsx:245,266-271`) | Rob's centre-outward request (HANDOFF §3) | Band 0 (the noisy one) is promoted to the CENTRE element — maximizes visibility of idle noise |
| 8 | Speaking-only gate | Bands only in `speaking` (`bar.tsx:210-213`, `radial.tsx:223`, grid cell branch) | Same (`variant-bar.tsx:57-60` etc.) | n/a (match) | — |
| 9 | **Volume analyser scale** | Byte scale **-100..-80dB** (`utils.ts:552-553` defaults reach wave/aura hooks) | Spec default **-100..-30dB** (`use-audio-analysis.ts:98-101`, min/maxDecibels never set) | **Not recorded — an unnoticed port gap** | Their volume scalar runs hot (speech ≈ 0.4-0.9); ours cold → our wave/aura visibly under-react. Likely the core of "our wave isn't like theirs" |
| 10 | Wave driving | motion tweens; speaking: amp `0.015+0.4v`, freq `20+60v`, duration 0 (`use-…-wave.ts:60-105`) | Same constants via createTween (`visualizer-sequences.ts:232-280`, `variant-wave.tsx:35-57`) | n/a (faithful) | Math matches; input scale (row 9) is the divergence |
| 11 | Aura driving | speed 10/20/30/70 raw; listening scale = spring(1.0s, bounce .35); volume→scale gated by `isAnimating()` (`use-…-aura.ts:67-117`) | S/20 onto clean-room shader; no spring; ungated reactive derivation (`variant-aurora.tsx:119-159`) | Fact-sheet mapping recorded; spring/guard not carried | Different attack feel on listening + mid-speech pauses; plus row 9 input scale |
| 12 | Shader runtime | ReactShaderToy (MIT fork): per-rAF uniform push from refs, ResizeObserver, **IntersectionObserver pause off-screen**, `#define DPR`, iMouse/iDate/etc. | ShaderCanvas (original): per-rAF push, ResizeObserver, no visibility pause | ShaderCanvas is a from-scratch minimal runtime | We burn GPU off-screen; otherwise equivalent |
| 13 | State vocabulary | 9-value `AgentState`; `initializing` has own cadence (bar 2000ms, radial 250ms) | 5 states + alias table (`visualizer-sequences.ts:26-31`): initializing→connecting | Recorded (alias doc) | Our `initializing` runs connecting cadence (bar 2000/n, radial 500) — minor visual mismatch |
| 14 | Default state | `'connecting'` (bar/grid/radial/aura), `'speaking'` (wave) | `'idle'` everywhere (`normalizeState`) | Not explicitly recorded | Bare-mount demos look different (ours idle-dark, theirs animated) |
| 15 | Height/color transitions | Colors only: bar 250ms, radial 150ms; height snaps | + `height 100ms ease-linear` (`variant-bar.tsx:132-134`, radial same) | Recorded, approved (in-file) | Ours smoother at 31Hz; deliberate |
| 16 | Grid speaking model | Column band vs row-distance threshold (`grid.tsx:170-197`) | Same (`variant-grid.tsx:51-66`) | n/a (match) | — |
| 17 | Sizes/counts | cva px tables; bar 3/5, radial 12/24, grid 5 (icon 3) | Same numbers as data (`sizes.ts`) | Recorded (interpolation) | — |
| 18 | Reduced motion | None anywhere upstream | `frozen` throughout | Our addition | Ours better (a11y) |
| 19 | Precomputed override | `volumeBands`/`volume` normalized per-component (#1399) | `bands` prop bypasses mirror (`index.tsx:267`) | Recorded (HANDOFF §0 gap) | Story tiles show left-heavy ramp; stories must feed ceil(n/2) |

## 10. Upstream goodies worth considering (re-grounding list)

1. **The narrow high window as the noise gate** (bins 100-200 + -100dB floor): zero-cost idle silence.
   Any reconciliation of our wide window should reckon with this being their entire mechanism.
2. **Hot volume scale for shaders** (`maxDecibels -80` byte mapping): the single setting that makes
   their wave/aura feel alive. We never set min/maxDecibels.
3. **`isAnimating()` guard on aura's volume override** — state landings/springs complete before live
   volume drives scale.
4. **Spring on aura's listening scale** (`type: 'spring', duration 1.0, bounce 0.35`) — the bouncy
   "perk up" when the agent starts listening.
5. **IntersectionObserver pause** in the shader runtime (plus `animateWhenNotVisible` opt-out).
6. **Distinct `initializing` cadences** (bar 2000ms full-sweep hold, radial 250ms fast spin).
7. **volumeBands/volume overrides on every visualizer** (their equivalent of our `bands`) — landed
   2026-07-29; API parity point for docs.
8. **`agent-session-view-01` block**: a composed full-screen session view (transcript + control bar +
   visualizer tile view) — the shape of Rob's requested showcase app.
9. Grid's dual-speed cell transitions (snap on at interval/1000s, fade off at interval/100s) — we have
   it; keep it.
10. Wave polish set: horizontal fade mask, per-size lineWidth, colorShift hue ramp toward edges — we
    carry all three; verify visually in the parity harness.
11. Their distribution story (shadcn registry + doc-gen scripts) — context for create-kai, not for the
    component.

## 11. Cached artifacts

`scratchpad/upstream/`: `useTrackVolume.ts`, `agent-audio-visualizer-{bar,grid,radial,wave,aura}.tsx`,
`use-agent-audio-visualizer-{bar,grid,radial,wave,aura}.ts`, `react-shader-toy.tsx`, `registry.json`,
`client-room-utils.ts` (createAudioAnalyser), `client-defaults.ts` (audioDefaults), `client-create.ts`
(createLocalAudioTrack), `LocalTrack.ts`, `Track.ts`, `useAgent.ts`, `useVoiceAssistant.ts`.
