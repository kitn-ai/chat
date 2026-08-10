# Aura ring shader: reference analysis + working prototype

Handoff for the agent implementing `aura.glsl.ts` (Task 14 of the audio-visualizers
epic). Everything here was derived by measuring Rob's screen recording of the target
effect. No LiveKit source was opened at any point; this document and the prototype are
clean-room artifacts and safe inputs under the epic's licensing rule.

**The prototype in this folder already matches the reference to within a few percent
on every scalar metric.** Start from it. Do not start from the single-band starter
shader in the plan's Task 14 Step 1: that construction cannot produce the reference's
crossing ribbons (details below).

## 1. Files

All paths relative to this folder unless absolute.

| File | What it is |
| --- | --- |
| `/Users/home/Movies/Record It Pro/Video/20260807123245593.mp4` | The reference recording: 10.6s, 268x286 @ 30fps, WITH the driving voice audio track |
| `aura-frames/f_001..f_032.png` | Reference frames at 3fps. Frame N covers t = (N-1)/3 s |
| `aura-burst/b_01..b_15.png` | 15 consecutive reference frames at 30fps starting t = 7.0s, for judging motion |
| `aura-proto.html` | **The working prototype.** Self-contained WebGL page, defaults = final tuned params. Open with `?play` for a live loop driven by the measured envelope |
| `shot-aura.mjs` | Deterministic still renderer: `node shot-aura.mjs <outDir> '<statesJson>' ['<paramsJson>']` |
| `motion-aura.mjs` | Full-clip renderer at 15fps with envelope smoothing: `node motion-aura.mjs <outDir> ['<paramsJson>']` |
| `analyze.mjs` | Metrics extractor: `node analyze.mjs <png>...` prints one JSON per frame |
| `renders/cmp_v1..v6.png` | Tuning history, mine vs reference side by side |
| `aura-compare.mp4` | Final side-by-side: prototype left, reference right, original audio |

The mjs scripts import Playwright by absolute path from the kitn-chat repo's
node_modules (ESM ignores NODE_PATH; that tripped the first run).

## 2. What the effect actually is (measured, not guessed)

A hollow ring of 3 additive translucent ribbons. Full-canvas transparency outside the
strokes. Concretely, from the frames:

- **Annulus, never a disc.** The centre is fully transparent at every state. Structure
  comes from distance to a circle, `abs(r - ringR)`, per strand.
- **Three near-parallel wavy ribbons** share one wave shape, slightly offset in angle,
  time, and base radius. They run merged into a single bright arc for long stretches,
  then fan apart into translucent folds. Brightest points are where they pile up.
- **Voice drives SIZE first.** Peak-luminance radius swings 0.33 to 0.51 of the canvas
  half-height from silence to loud speech (a 55% size change). Wobble amplitude also
  grows, but radius is the dominant audio axis. Band width stays roughly constant
  (19-23px at this canvas size) while the ring grows.
- **Nothing is ever white.** In every reference frame, zero pixels have
  min(R,G,B) > 190. Peak pixels are ~rgb(150, 235, 252): green/blue saturate, red
  lifts to only ~60%. Mean band saturation holds at 0.71-0.74 across all states.
  This was the biggest correction during tuning; the obvious "additive glow clipping
  to white" look is wrong.
- **Thickness is asymmetric.** Per-5-degree-sector radial thickness varies about 2:1
  around the circumference (quantiles ~9px thin side, ~21px heavy side), and the heavy
  side slowly precesses.
- **Motion is smooth drift**, wave phases moving at different speeds/directions.
  Attack is fast (~100ms), release slow (~400ms); the ring holds size through a
  sentence and relaxes in pauses.

Reference metrics per state (from `analyze.mjs`; peakRFrac = peak radius / half
height, thickness in px at 268x286, peakL = peak of the angular-averaged radial
luminance profile, 0..1):

| Frame | Audio | peakRFrac | bandWidth | thick p10/p50/p90 | peakL | whiteFrac | meanSat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| f_001 | silence (-61dB) | 0.329 | 19 | 9.4 / 12.6 / 17.0 | 0.651 | 0.000 | 0.716 |
| f_008 | quiet (-53dB) | 0.357 | 21 | 11.1 / 14.2 / 20.2 | 0.559 | 0.000 | 0.734 |
| f_016 | mid (-51dB) | 0.476 | 23 | 9.2 / 14.8 / 20.9 | 0.555 | 0.000 | 0.733 |
| f_022 | loud (-47dB) | 0.510 | 23 | 10.6 / 15.2 / 21.8 | 0.528 | 0.000 | 0.742 |
| f_028 | quiet (-53dB) | 0.364 | 16 | 8.8 / 11.3 / 15.2 | 0.694 | 0.000 | 0.712 |

Base band colour mid-intensity: ~rgb(45, 181, 209). Ring centre in the recording sits
~13px right of canvas centre; that is the recording crop, not the effect. Note that
mid/quiet frames during speech run larger than their instantaneous dB suggests:
the level is envelope-smoothed with slow release, so size lags loudness. Match
against the smoothed level, not the raw window dB.

## 3. The construction that reproduces it

Full fragment shader is in `aura-proto.html` (the `FS` string). The pieces, and why
each exists:

1. **Per-strand Gaussian stroke.** `core = exp(-d^2 / 2 sigma^2)` with
   `d = abs(r - ringR_i)`, plus a wider weak Gaussian (`sigma * 3`, gain 0.22) for
   bloom. Gives soft glow on BOTH edges with no post-processing.
2. **One wave family, three offsets.** All strands use
   `wob(a, t) = 0.55 sin(6a + 0.55t) + 0.45 sin(10a - 0.85t)` where `a = th + i*delta`,
   `t` offset by `i * 1.3s`, `delta = 0.35 rad`. Identical frequencies with small
   phase offsets make the ribbons run parallel and cross at shallow angles. Giving
   each strand DIFFERENT frequencies produces beads-on-a-wire (see `cmp_v1.png`),
   which is wrong.
3. **Per-strand energy.** Amplitude factor `0.65 + 0.35 * i`: one calm ribbon, one
   mid, one wild.
4. **Regional separation.** Strand base radii are spread by
   `(i-1) * off * (0.35 + 1.5 * sepMod)` with `sepMod = 0.5 + 0.5 sin(th + 0.38t + 1.9i)`,
   `off = 0.024`. Where sepMod is low the three merge into one solid bright arc;
   where high they fan into folds. Without this the ring is a uniform lattice
   (see `cmp_v4.png`), with too little thickness variation.
5. **Thickness envelope.** `env = 0.62 + 0.38 sin(2 th + 0.21t + 2.0)` multiplies
   wobble amplitude and strand gain: one side of the ring runs heavy, the opposite
   thin, and the pattern precesses. This is what produces the measured 2:1 sector
   thickness ratio.
6. **Audio mapping.** `baseR = 0.33 + 0.24 * level`, `amp = 0.017 + 0.043 * level`
   (fractions of half-height). Level 0 keeps a gentle idle wobble; never a clean
   circle.
7. **Colour, capped.** `bright = 0.55 + 0.65 * min(glow, 1.2)`,
   `white = smoothstep(1.35, 2.30, glow) * 0.55`,
   `col = mix(uColor * bright, white3, white)`. The 0.55 cap on the white mix is
   load-bearing: it is what keeps peaks at ~rgb(150,235,252) instead of clipping to
   white. Strand gain 0.42 so a lone ribbon reads at alpha ~0.45 and only pileups
   approach 1.0.
8. **Premultiplied output** `vec4(col * alpha, alpha)`, transparent clear, blend
   `ONE, ONE_MINUS_SRC_ALPHA`, plus sub-1/255 dither on alpha. Verify over white,
   black, and a mid-tone background; the black in the reference is the page, not
   the effect.

Final tuned parameters are the `P` defaults in `aura-proto.html`. GLSL gotcha:
`half` is a reserved word; the first compile failed on a variable named `half`.

## 4. Mapping to the epic's uniform contract

The prototype's knobs collapse onto the epic's `uColor / uIntensity / uSpeed /
uComplexity` contract like this:

- `uColor` = the accent (prototype used measured rgb(45,181,209); production should
  take the theme token and it lands within a few percent of the reference hue).
- `uIntensity` = the prototype's `uLevel`. Drive radius AND amplitude from it as in
  item 6 above. The volume tween upstream should keep fast-attack/slow-release
  (the prototype converts k_att 0.25, k_rel 0.06 per 60fps frame).
- `uSpeed` multiplies `t` everywhere (all five time coefficients scale together).
- `uComplexity` maps onto the wave frequencies (6/10 at default 1.0; scale both,
  round to integers to keep the theta-wrap seamless; non-integer angular frequencies
  discontinue at theta = +/-pi).
- State feel (idle/listening/thinking/speaking) stays in the variant layer as
  intensity/speed targets, exactly as the plan already wires shaderTargets.

Integer angular frequencies make the sin() waves periodic in theta, so there is no
seam; no unit-circle noise sampling is needed with this construction.

## 5. Verification protocol (how "done" is decided)

1. Render stills at the three anchor states with `shot-aura.mjs`:
   quiet (t=2.0, level=0.02), mid (t=5.3, level=0.61), loud (t=7.3, level=0.75).
2. Run `analyze.mjs` on your renders and on `f_001 / f_016 / f_022`, compare:
   peakRFrac within 10%, bandWidth within 20%, peakL within 15%, whiteFrac must be
   0.000, meanSat within 0.05, thickness p90/p10 ratio 1.5-2.3.
3. Render the full clip with `motion-aura.mjs`, hstack against the video with
   ffmpeg (command in the repo history, or remake: scale ref to 268:286, hstack,
   map audio), and eyeball: size must track sentences, folds must drift smoothly,
   no beading, no white flash at onsets.
4. The epic's Task 14 tolerance table still applies at the end; these three anchors
   are the fast inner loop.

Prototype status against those checks: radius exact at all three anchors (0.329 /
0.469-0.476 / 0.497-0.51), peakL 0.55-0.65 vs reference 0.53-0.69, whiteFrac 0,
meanSat 0.77 vs 0.71-0.74, thickness ratio ~1.5 vs reference ~1.8-2.1 (the one
metric still shy; more `env` swing or more `off` widens it, at the cost of peakL,
which `gain` restores).

## 6. Traps that cost rounds (do not rediscover these)

- **White blowout.** Naive additive glow + white mix reads great in isolation and is
  measurably wrong: the reference NEVER reaches white. Cap the white mix.
- **Beads vs ribbons.** Different per-strand frequencies = chain-link beads.
  Same frequencies, small angle/time offsets = parallel ribbons. The reference is
  ribbons.
- **Uniform lattice.** Constant strand separation braids everywhere and equalizes
  thickness. Separation must be regionally modulated (sepMod).
- **Radius is the audio axis.** Tuning wobble amplitude to loudness while holding
  radius misses the dominant visible response.
- **Smoothed level, not raw dB.** Matching stills to instantaneous window dB makes
  mid frames look "too big"; the reference lags loudness by design.
- **jsdom/GLSL trivia:** `half` is reserved in GLSL ES; Playwright must be imported
  by absolute path from the repo's node_modules in ESM scripts.

## 7. UPDATE: measured against LiveKit's own live demo (later same day)

Rob confirmed the real target is LiveKit's prebuilt demo at
docs.livekit.io/frontends/agents-ui/audio-visualizer/prebuilt/ (Aura tab). We
captured it directly (100 frames at 2x dpr on white, `capture-livekit.mjs`,
frames in `lk-frames/`) and measured it (`measure-travel.mjs`). This supersedes
parts of sections 2-3. Everything below is from rendered output only; the
clean-room rule holds (their aura source is PolyForm Non-Resale, (c) UNCRN LLC,
and must never be opened; `livekit/livekit` is the wrong repo anyway, it is
`livekit/components-js`).

**It is ONE ribbon, not three.** A single band whose half-width pinches to
near zero at twist points: wide sheer face-on folds between pinches, one dense
bright edge-on line at each pinch. Rob spotted this from the recording; the 2x
capture confirmed it.

**The motion FLAPS, it does not travel.** Angular thickness-profile
correlation: decorrelates in ~300ms, INVERTS at ~950ms (folds become pinches),
recurs at ~1.9s. A standing-wave flap like a flag, not slow rotation. In the
prototype this is `twistSpd ~= 1.9` (the earlier 0.55 default was 3.5x too slow).

**Their render is wide and sheer.** peakRFrac ~0.59 (their square demo),
bandWidth 0.17-0.26 of half-height and breathing, peak angular-mean density
only ~0.21-0.27, meanSat 0.54-0.60, thickness ratio ~2.1. Their default color
is `#1FD5F9` with a documented `colorShift` prop (public reference page; props
are size/state/color/colorShift/themeMode/audioTrack/volume).

**Construction that finally matched (mode 2 in `aura-proto.html`):**
centerline c(th,t) with slow wobble; half-width
`w = (|0.6 sin(2th + 1.9t) + 0.4 sin(3th - 1.33t + 1.7)| * wWidth + wMin) * env`;
two edges e1/e2 = c -/+ w plus independent flutter; then a CONTINUOUS sheet:
feathered coverage box between e1 and e2, times mass-conservation density
`clamp(wWidth*1.2/ww, 0.4, 2.0)`, times a rim term, plus a soft halo outside.

**Failed constructions, do not retry:** (a) rendering the band as N discrete
sub-strands/plies: adjacent super-gaussian strokes can NEVER sum flat, the
overlap valleys read 1.45x the ply centers and the band stripes at any sigma;
(b) any periodic "filament" texture across the width: even 5 percent amplitude
reads as concentric rings on a sheer base. The sheet must be continuous with
smooth gradation only.

**Two shipping variants now exist in the prototype:** mode 1 "braid" (three
additive strands, Rob's hand-tuned params saved as PRESET_ROB; a distinct
original look worth keeping) and mode 2 "wind" (the LiveKit-matching single
ribbon, PRESET_WIND, speeds measured). Side-by-side: `lk-compare.mp4` (mine
left, theirs right). The `?play` page has full slider controls, presets,
accent/background color pickers, and mic drive.

## 8. UPDATE: veil mode, built from a two-team clean room

Rob authorized consulting the source via a DIRTY-ROOM analyst: a separate agent
read LiveKit's aura source and produced `lk-aura-factsheet.md` (facts, numbers,
and math only; no code, no identifiers, no expression). The implementer wrote
mode 3 ("veil") in `aura-proto.html` from that fact sheet alone and never saw
the source. Read the fact sheet before touching mode 3; it is the interface.

The mechanism (nothing render-side analysis had guessed): 36 phase-offset
copies of ONE ring, each pushed through a 4-octave directional-sine warp
cascade (axes rotated 53.13 deg per octave, lacunarity 1.4, data-dependent
amplitude gain), fused into veils by an analytic neighbor-distance blur
(e^(2*spacing) - 1). Octave 0 is static in time; octave k advances at k times
the phase rate, which is the entire "wind". Dark and light modes are different
color pipelines (see fact sheet section 4); output is deliberately hotter than
premultiplied. State table (speed/scale/amplitude/frequency/brightness per
agent state) is fact sheet section 5.

Comparison: `lk-compare.mp4` and `my-lk/still_cmp*.png` now show veil mode vs
the captured LiveKit demo in its "connecting" state (brightness pulse included)
and they are visually equivalent.

**Provenance and shipping.** Braid (mode 1) and wind (mode 2) remain fully
clean-room: safe to ship anywhere. Veil (mode 3) derives from a functional
spec extracted from Polyform Non-Resale source: standard two-team clean-room
practice, defensible (facts and math are not copyrightable expression), but a
narrower margin than modes 1-2. The ship/no-ship call for veil belongs to Rob
at the epic's Task 14 human gate; do not fold veil into the npm package
without that explicit decision.
