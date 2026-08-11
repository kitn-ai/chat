# Audio visualizers design

Date: 2026-08-07
Status: approved, ready for planning
Branch: `worktree-audio-visualizers`

## Goal

Ship `<kai-audio-visualizer>`: a single element with five looks (`bar`, `grid`, `radial`,
`wave`, `aura`) plus a `custom` escape hatch, ported from LiveKit's Agents UI visualizers
and rebuilt on primitives that owe nothing to `livekit-client`.

Two supporting primitives come with it: one Web Audio analysis hook (the thing that turns
a live audio source into numbers) and one numeric tween (the thing that animates shader
uniforms without pulling in a motion library).

Non-goal: changing the public surface of `<kai-voice-input>` or `<kai-voice-output>`.

## 1. Provenance and licensing

Source material is `livekit/components-js`, **not** `livekit/livekit` (that repo is the Go
SFU). The visualizers live at `packages/shadcn/components/agents-ui/` with animator hooks
at `packages/shadcn/hooks/agents-ui/`, riding on `packages/react/src/hooks/useTrackVolume.ts`.

| Component | Upstream license | Our approach |
| --- | --- | --- |
| `bar`, `grid`, `radial` | Apache 2.0 | Direct port. Algorithm and constants carried over verbatim. |
| `wave` | Apache 2.0 (its GLSL carries no separate header) | Direct port, shader copied verbatim. |
| `aura` | **PolyForm Non-Resale 1.0.0, (c) 2026 UNCRN LLC** | **Do not copy.** Original shader, written to the brief in section 8. |

The Aura file names a license that does not resolve: `polyformproject.org/licenses/non-resale/1.0.0/`
returns 404, and there is no `Non-Resale` license in PolyForm's official repo (the set is
Free Trial, Internal Use, Noncommercial, Perimeter, Shield, Small Business, Strict). Whatever
was intended, it is a restrictive non-open-source grant in the "no resale" family, and
`@kitn.ai/ui` is published to npm for third-party commercial use. Porting React to SolidJS
does not help here: Aura's visual identity is a 410-line GLSL string, and a framework
translation leaves that string byte-identical. That is a derivative work.

The look itself is not protectable, only this expression of it. So we write our own.

### Clean-room rule (binding on the implementer)

Whoever writes `aura.glsl.ts` **must not open** `agent-audio-visualizer-aura.tsx` or
`use-agent-audio-visualizer-aura.ts`. Work from section 8 of this document and from
LiveKit's **public** custom-visualizer guide
(<https://docs.livekit.io/frontends/agents-ui/audio-visualizer/custom.md>), which documents
the full architecture in the open: the `mainImage` convention, the `uColor` / `uSpeed` /
`uIntensity` / `uComplexity` uniform contract, the state-to-animation map, and a complete
worked example shader. That guide is sufficient to build from.

### Attribution deliverables

- `packages/ui/NOTICE` crediting LiveKit under Apache 2.0, listing the ported files.
- Apache 2.0 header retained on every ported file, naming the upstream path.
- `wave.glsl.ts` keeps its origin comment.
- `aura.glsl.ts` carries a header stating it is original work and naming this spec.

## 2. Architecture

Three layers, matching the kit's existing split.

```
primitives/
  audio-bands.ts              pure: Float32Array -> number[] bands, and -> scalar RMS
  use-audio-analysis.ts       AudioContext + AnalyserNode lifecycle, RAF loop
  visualizer-sequences.ts     pure: (state, tick, geometry) -> highlight set
  use-sequencer.ts            one RAF driver, emits a tick index at an interval
  create-tween.ts             numeric tween: eased, instant, ping-pong, spring
  use-voice-recorder.ts       MODIFIED: expose the live MediaStream

components/audio-visualizer/
  index.tsx                   <AudioVisualizer> dispatcher, lazy-loads shader variants
  variant-bar.tsx             static
  variant-grid.tsx            static
  variant-radial.tsx          static
  shader-canvas.tsx           lazy: ShaderToy-compatible WebGL runner
  variant-wave.tsx            lazy
  variant-aura.tsx            lazy
  variant-custom.tsx          lazy: renders shader-canvas with the consumer's fragment
  wave.glsl.ts                lazy: Apache 2.0, verbatim
  aura.glsl.ts                lazy: original
  audio-visualizer.stories.tsx

elements/
  audio-visualizer.tsx        <kai-audio-visualizer>
```

### Why the shader path is lazy

`vite.config.ts` sets `treeshake: false` on the register-all bundle by design (element
registration side effects get stripped otherwise). Anything statically imported into an
element therefore lands in `kai.es.js` for every consumer, including one who only uses
`<kai-chat>`. The WebGL runner plus two GLSL strings is roughly 25 to 30 KB minified, and
GLSL barely compresses because esbuild does not touch string contents.

So `index.tsx` holds a static map for the DOM variants and a dynamic-import map for the
shader ones:

```ts
const SHADER_VARIANTS = {
  wave:   () => import('./variant-wave'),
  aura:   () => import('./variant-aura'),
  custom: () => import('./variant-custom'),
}
```

Same pattern as `primitives/highlighter.ts` (Shiki langs) and `elements/register.ts`
(register-impl). Until the chunk resolves, and permanently if WebGL is unavailable or the
chunk fails to load, the element renders `bar` as a fallback and warns once.

### Deviations from upstream, and why

1. **One analyser, two reductions.** LiveKit runs `useMultibandTrackVolume` (fftSize 2048)
   for DOM variants and `useTrackVolume` (fftSize 512, smoothing 0.55) for shader variants,
   which means two `AnalyserNode`s and two timers when both are on screen. We run one
   analyser and compute both reductions from it. This also lets a custom shader receive the
   full `uBands[]` array, which upstream shaders cannot get.
2. **One RAF sequencer.** Upstream has four near-identical animator hooks (bar, grid,
   radial, wave), each with its own `requestAnimationFrame` loop. We run one driver emitting
   a tick index, with pure per-variant mappers. Same behavior, one timer, and every mapper is
   a DOM-free pure function that unit-tests directly.
3. **No `motion/react`.** Upstream's shader hooks depend on it. We ship `create-tween.ts`.
4. **No textures, channels, or video** in the shader canvas. That is what makes upstream's
   `react-shader-toy.tsx` 988 lines (the `Texture` class alone is ~184).
5. **`prefers-reduced-motion` is honored.** Upstream does not handle it.

## 3. Public API

```html
<kai-audio-visualizer
  variant="bar"          <!-- bar | grid | radial | wave | aura | custom -->
  state="speaking"       <!-- idle | connecting | listening | thinking | speaking -->
  size="md"              <!-- icon | sm | md | lg | xl -->
  bar-count="5"
  row-count="5"
  column-count="5"
  radius="32"
  spread="2"
  interval="100"
  color="#1FD5F9"
  complexity="0.5"
  label="Assistant audio"
></kai-audio-visualizer>
```

```js
el.stream = micStream         // MediaStream
el.audioElement = audioRef    // HTMLMediaElement
el.bands = [0.2, 0.8, 0.4]    // number[], bypasses Web Audio entirely
el.shader = { fragment, uniforms }   // variant="custom" only
```

Scalars are attributes, sources and objects are JS properties. Per-variant props are
inert where they do not apply (`row-count` on `variant="bar"` does nothing), matching how
`kai-card` handles appearance-specific props.

Note `radius` and `spread` are deliberately separate. Upstream overloads one `radius` prop
for two unrelated things: the radial variant's distance from center in pixels, and the grid
variant's animation spread in cells. Splitting them removes an ambiguity that would
otherwise reach consumers. `radius` is radial-only (px), `spread` is grid-only (cells).

**No events, no methods.** This is a display element, not an interactive one, so it stays
off the interaction-API surface.

### State vocabulary

`idle` | `connecting` | `listening` | `thinking` | `speaking`. Default `idle`.

LiveKit's real `AgentState` is wider than their docs table (the aura hook switches on
`idle`, `failed`, `disconnected`, `pre-connect-buffering`, `connecting`, `initializing`,
`listening`, `thinking`, `speaking`), but the extras are LiveKit-room lifecycle concepts
with no meaning in this kit. We accept these aliases so markup ported from LiveKit works
unchanged:

| Alias | Maps to |
| --- | --- |
| `disconnected`, `failed` | `idle` |
| `initializing`, `pre-connect-buffering` | `connecting` |

Unknown values fall back to `idle`.

### Source precedence

`bands` wins over `stream` wins over `audioElement`. When `bands` is set, no `AudioContext`
is ever constructed. When no source is set at all, the element still renders and the state
sequence still animates: this is what makes the `speechSynthesis` case survivable (see
section 9).

### Styling seam

`::part(bar)`, `::part(cell)`, `::part(canvas)`, each carrying `data-kai-index` and
`data-kai-highlighted`, so consumers restyle from outside the shadow root:

```css
kai-audio-visualizer::part(bar) { border-radius: 2px; background: var(--brand-dim); }
/* Note the ="true". The attribute is always present, as "true" or "false",
   so a bare [data-kai-highlighted] presence selector matches idle bars too. */
kai-audio-visualizer::part(bar)[data-kai-highlighted="true"] { background: var(--brand); }
```

The exported Solid `<AudioVisualizer>` additionally accepts a children render-prop for
full control, receiving `{ index, highlighted, value }` per element.

## 4. Primitive: audio analysis

```ts
export interface AudioAnalysisOptions {
  bands?: number              // default 5
  loPass?: number             // default 100  (bin index, not Hz)
  hiPass?: number             // default 200  (bin index, not Hz)
  fftSize?: number            // default 2048
  smoothingTimeConstant?: number  // default 0.55
  updateInterval?: number     // default 32 (ms)
}

export function useAudioAnalysis(
  source: () => MediaStream | HTMLMediaElement | undefined,
  options?: AudioAnalysisOptions,
): { bands: Accessor<number[]>; volume: Accessor<number> }
```

`loPass` / `hiPass` are bin indices relative to `fftSize`, not frequencies. That is
upstream's convention and their naming is misleading; keep the values, document the truth.

**Band reduction** (pure, in `audio-bands.ts`, ported verbatim):

1. `analyser.getFloatFrequencyData(buf)` into a `Float32Array(frequencyBinCount)`.
2. Slice `[loPass, hiPass)`.
3. Normalize each dB value: `-Infinity` becomes `0`; otherwise clamp to `[-100, -10]`, then
   `db = 1 - (clamped * -1) / 100`, then `sqrt(db)`.
4. Split into `bands` chunks by proportional distribution:
   `start = floor(i * total / bands)`, `end = floor((i + 1) * total / bands)`. Mean each
   chunk. Empty chunk yields `0`.

**Scalar reduction** (pure): `getByteFrequencyData`, then `sqrt(sum(a^2) / len) / 255`.

**Lifecycle rules:**

- One shared module-level `AudioContext`, created lazily on first real source.
- `MediaStream` source: `createMediaStreamSource(stream) -> analyser`. Do **not** connect to
  `destination` (that would echo the mic).
- `HTMLMediaElement` source: `createMediaElementSource(el) -> analyser -> destination`.
  **Two footguns, both fatal and both silent.** Calling `createMediaElementSource` twice on
  the same element throws, and failing to reconnect to `destination` mutes the element with
  no error. Guard with a module-level `WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>`
  and always wire through to `destination`. A regression here silences a consumer's TTS.
- Context starts `suspended` without a user gesture (autoplay policy). Attempt `resume()` on
  first document interaction; emit zeros until running.
- `requestAnimationFrame` driven with a `updateInterval` throttle, not `setInterval`.
  RAF pauses on hidden tabs; `setInterval` does not, and upstream leaks a timer there.
- On cleanup: cancel RAF, disconnect the analyser, drop the source node. Leave the shared
  context alive (recreating it per mount is expensive and hits the per-page context limit).
- SSR: `typeof AudioContext === 'undefined'` returns zeros with no side effects.

### `use-voice-recorder.ts` change

`start()` currently keeps its `getUserMedia` stream in a local and tears it down on stop, so
nothing can observe it. Add a `stream: Accessor<MediaStream | undefined>` to the returned
object, set when recording begins and cleared on stop. Purely additive.

## 5. Primitive: sequencer

```ts
export function useSequencer(interval: () => number): Accessor<number>
```

One RAF loop emitting a monotonically increasing tick whenever `interval` ms have elapsed.
`Infinity` freezes the tick (radial uses this for `thinking`, where a CSS spin drives the
motion instead). Reset the tick to 0 when interval or geometry changes.

Pure mappers in `visualizer-sequences.ts`, all DOM-free and directly testable:

```ts
barSequence(state, barCount): number[][]          // tick -> highlighted indices
gridSequence(state, rows, cols, spread): Coordinate[]   // tick -> {x, y}
radialSequence(state, barCount): number[][]
shaderTargets(state): { intensity: number | [number, number]; speed: number }
```

The rendered value is `sequence[tick % sequence.length]`.

### Bar sequences (verbatim from upstream)

| State | Sequence |
| --- | --- |
| `connecting` | `[[x, barCount - 1 - x] for x in 0..barCount)`, a mirrored sweep |
| `listening`, `thinking` | `[[center], [-1]]` where `center = floor(barCount / 2)`, a blink |
| `speaking` | `[[0..barCount)]`, all lit |
| `idle` | `[[]]` |

### Bar intervals (verbatim)

| State | Interval (ms) |
| --- | --- |
| `connecting` | `2000 / barCount` |
| `listening` | `500` |
| `thinking` | `150` |
| otherwise | `1000` |

### Radial intervals (verbatim)

| State | Interval (ms) |
| --- | --- |
| `connecting`, `listening` | `500` |
| `thinking` | `Infinity` (container spins via CSS, 5s linear, all bars lit) |
| otherwise | `1000` |

## 6. Variant specs

Every number below is carried from upstream. Do not re-derive.

### Size scales

| size | container height | gap | bar width | grid cell | grid gap | radial radius |
| --- | --- | --- | --- | --- | --- | --- |
| `icon` | 24px | 2px | 4px | 2px | 2px | 6 |
| `sm` | 56px | 4px | 8px | 4px | 4px | 16 |
| `md` | 112px | 8px | 16px | 8px | 8px | 32 |
| `lg` | 224px | 16px | 32px | 12px | 12px | 64 |
| `xl` | 448px | 32px | 64px | 16px | 16px | 128 |

Bars also take `min-height` equal to their width (keeps a dot visible at zero). Shader
variants are `aspect-square` at the same heights, and default to `size="lg"` where the DOM
variants default to `md`.

### Count defaults

| Variant | Default |
| --- | --- |
| `bar` | 3 for `icon`/`sm`, else 5 |
| `radial` | 12 for `icon`/`sm`, else 24. Warn if not divisible by 4. |
| `grid` | 3x3 for `icon`, else 5x5 |

### bar

Flex row, centered. Each bar's height is `${band * 100}%`, clamped by the size `min-height`.
Bands are forced to an all-zero array unless `state === 'speaking'`; the sequence drives the
highlight in every other state. `data-kai-highlighted` toggles the fill color, transitioned
over 250ms linear.

### grid

CSS grid, `grid-template-columns: repeat(columnCount, 1fr)`.

`speaking` lights a cell by row distance from the middle:

```
y            = floor(index / columnCount)
rowMidPoint  = floor(rowCount / 2)
volumeChunks = 1 / (rowMidPoint + 1)
threshold    = abs(rowMidPoint - y) * volumeChunks
highlighted  = bands[index % columnCount] >= threshold
```

Every other state lights the single cell matching the sequenced `{x, y}` coordinate, with
`transition-duration` of `interval / 1000` seconds when highlighted and `interval / 100`
when not (asymmetric: snap on, fade off).

### radial

Bars laid around a circle. For index `i` of `barCount`:

```
angle     = (i / barCount) * 2 * PI
transform = rotate(${angle}rad) translateY(${radius}px)
dotSize   = radius * PI / barCount        // width, and min-height
height    = state === 'speaking' ? dotSize * 10 * band : 0
```

`thinking` spins the container (CSS `animate-spin`, 5s) with every bar lit and the
sequencer frozen.

### wave

Port `shader-canvas.tsx` and copy the GLSL verbatim from upstream's
`agent-audio-visualizer-wave.tsx` with its Apache 2.0 header. It is an oscilloscope line
with a bell-curve amplitude envelope, edge hue shift, and a horizontal alpha mask. Uniforms:
`uSpeed`, `uAmplitude`, `uFrequency`, `uMix`, `uLineWidth`, `uSmoothing`, `uColor`,
`uColorShift`. `lineWidth` defaults to 2 for `icon`/`sm` and 1 otherwise.

### aura

Original shader. See section 8.

### custom

`el.shader = { fragment, uniforms }`. Renders `shader-canvas` directly with the consumer's
fragment source. Built-ins and audio uniforms (section 7) are provided automatically.

## 7. Shader canvas

A trimmed, ShaderToy-compatible WebGL runner. Estimate ~250 lines.

```ts
interface ShaderCanvasProps {
  fragment: string
  uniforms?: Record<string, { type: UniformType; value: number | number[] }>
  precision?: 'lowp' | 'mediump' | 'highp'   // default highp, mediump on coarse pointers
  onError?: (message: string) => void
}
```

**Built-ins**, auto-declared and updated per frame: `iTime` (float, seconds),
`iResolution` (vec2, px), `iMouse` (vec4), `iFrame` (int), `iDate` (vec4).

**Audio built-ins**, our addition, auto-declared when a source is present:
`uVolume` (float, 0..1 RMS) and `uBands[N]` (float array, the multiband values). Upstream's
shader path only ever receives a scalar, so a spectrum-reactive custom shader is possible
here and not there.

**Uniform types:** `1f` float, `2f` vec2, `3f`/`3fv` vec3, `4f`/`4fv` vec4, `1i` int,
`Matrix2fv` mat2, `Matrix3fv` mat3, `Matrix4fv` mat4.

**Critical:** the canvas *declares custom uniforms itself*, by injecting
`uniform <type> <name>;` after the precision qualifier. A shader that also declares them
fails to compile. This must be documented on the `shader` prop and in the docs page.

The shader source is wrapped: the consumer writes `mainImage(out vec4 fragColor, in vec2 fragCoord)`
and the canvas supplies `void main() { mainImage(gl_FragColor, gl_FragCoord.xy); }` plus a
full-screen quad vertex shader.

**Explicitly not ported:** textures, `iChannel*`, video sources, multipass,
`iDeviceOrientation`, pow2 canvas rescaling.

Resize via `use-resize-observer.ts` (already in primitives), scaled by `devicePixelRatio`.
Cancel RAF on cleanup and on `document.hidden`.

### Primitive: create-tween

Shader uniforms are plain numbers, so CSS transitions cannot drive them. This replaces the
`motion/react` dependency upstream carries. Estimate ~90 lines.

```ts
export function createTween(initial: number): {
  value: Accessor<number>
  to(target: number | [number, number], transition?: Transition): void
}

type Transition =
  | { duration: number; ease?: 'linear' | 'easeOut' | 'easeInOut' }
  | { type: 'spring'; duration: number; bounce: number }
```

- `duration: 0` sets instantly (used for volume response, which must not lag).
- An array target ping-pongs between the two values on repeat (used for state pulses).
- Defaults from upstream's public guide: `{ duration: 0.5, ease: 'easeOut' }` for state
  transitions, `{ duration: 0.35 }` for pulses, `{ type: 'spring', duration: 1.0, bounce: 0.35 }`
  for the listening entrance.

State-to-target map for shader variants, from the public guide:

| State | intensity | speed |
| --- | --- | --- |
| `idle` | `0.3` | `1` |
| `listening` | `[0.5, 0.8]` pulse | `2.5` |
| `thinking`, `connecting` | `[0.25, 0.5]` pulse | `4.0` |
| `speaking` | `0.3 + 0.7 * volume`, instant | `2.5` |

## 8. Aura visual brief

This section is the specification for `aura.glsl.ts`. It is written so the shader can be
built without reference to any existing implementation. Build to this description.

**Subject.** A soft luminous elliptical mass, centered in a square frame, reading as a
single organic light source rather than a shape with an edge. Premium and calm, not busy.

**Falloff.** Bright and near-white at the core, falling through the accent hue to full
transparency by roughly 45% of the frame radius. No hard boundary anywhere in the image.

**Silhouette.** Continuously deformed by low-frequency domain-warped noise so the outline
breathes and wanders. It should never read as a clean circle, and never hold a recognizable
shape for more than about a second.

**Motion.** Slow drift at rest. Both deformation rate and amplitude scale with `uSpeed` and
`uIntensity`.

**Bloom.** Values above 1.0 spill outward into a wide soft halo, tonemapped so highlights
saturate toward white rather than clipping.

**Color.** Base from `uColor`. Hue drifts slightly toward the outer edges of the mass so it
does not read flat. Default should come from our theme tokens, not a hardcoded hex.

**Dither.** Add sub-1/255 noise before output to prevent banding across the long falloff.

**Alpha.** Premultiplied against transparent so it composites over any background.

**State feel.** `idle`: small, dim, slow. `listening`: slightly larger with a gentle ~1Hz
brightness pulse. `thinking`: faster lower-amplitude pulse with visibly more turbulence.
`speaking`: scale and brightness track `uIntensity` with no perceptible lag.

**Uniforms:** `uColor` (3fv), `uIntensity` (1f), `uSpeed` (1f), `uComplexity` (1f),
plus the audio built-ins.

**Performance** (upstream's published guidance, applies to both shaders): prefer `mix()`,
`step()`, `smoothstep()` over branching; keep `sin`/`cos`/`sqrt` out of loops where possible;
use `mediump` on mobile; target 60fps and test on a real device.

**Process:** prototype first, capture renders across the five states, review before the
look is locked. Do not proceed to polish on an unreviewed look.

## 9. Degradation and accessibility

| Condition | Behavior |
| --- | --- |
| SSR / no `AudioContext` | Zeros. State sequence still renders. No side effects. |
| Context suspended (no gesture) | Zeros; `resume()` attempted on first interaction. |
| WebGL unavailable | Fall back to `bar`. Warn once. |
| Shader chunk fails to load | Fall back to `bar`. Warn once. |
| Shader compile error | Fall back to `bar`. Report via `onError` and warn once. |
| `bands` set | No `AudioContext` constructed at all. |
| No source at all | State sequence drives; this is a supported mode, not an error. |
| `prefers-reduced-motion` | Freeze scripted sequences on a static frame. Keep audio-reactive geometry but damp it. Shader variants hold `iTime`. |

**Why "no source" is a first-class mode.** `speechSynthesis` exposes no audio node, no
`MediaStream`, and no way to tap its output. So on `<kai-voice-output>`'s native path there
is genuinely nothing to analyze. The `state` prop is what makes a visualizer useful anyway:
drive it with `state="speaking"` and no source, and it animates the scripted sequence. This
is a real constraint, not a workaround, and it should be documented plainly rather than
papered over with fake data.

**Accessibility.** `aria-hidden="true"` by default: the element is decorative and its state
is conveyed by whatever drives it. Setting `label` opts into `role="img"` with that label.

## 10. Testing

Most of the logic is pure by construction, which is the point of the sequencer split.

- **Pure unit tests** (`--project=unit`, jsdom): `reduceToBands`, `reduceToVolume`,
  `normalizeVolumeBands`, `barSequence`, `gridSequence`, `radialSequence`, `shaderTargets`,
  `createTween`. Cover variant x state x count, plus the edge cases: `barCount` of 1, empty
  band arrays, `-Infinity` dB bins, `hiPass <= loPass`.
- **Lifecycle tests** with a mocked `AudioContext`: analyser created on source set, torn
  down on unmount, `createMediaElementSource` called at most once per element, element path
  always reaches `destination`, no context constructed when `bands` is set.
- **Element tests** via the existing `*.declarative.test.tsx` pattern: attribute parsing,
  alias mapping, variant fallback, part/data-attribute emission.
- **Storybook** SolidJS `Components/*` stories per variant plus a variant x state matrix.
- **IVP deferred to the end** of the epic, per standing practice: Playwright over the full
  matrix in all five sizes, light and dark, plus one real mic-driven run and one
  `prefers-reduced-motion` run. Storybook static cannot register web components, so the IVP
  runs against `npm run dev`.

Gate before merge: `nx typecheck ui` (4 passes), the unit project, `nx build ui`,
`build-storybook`.

## 11. Docs and tooling

- Docs page at `apps/docs/` following the Attachments template (playground, examples,
  props/events, composed-from). Human voice per `apps/docs/STYLE.md`, no em dashes.
- `kai` MCP `component_reference` entry.
- `element-meta.json` / `element-manifest.json` regenerate as part of the build. Remember to
  `git checkout -- packages/ui/src/components/component-meta.json` afterward, since it churns
  with type-expansion noise and is not used at runtime.
- Element count goes from 88 to 89.

## 12. Scope

**In:** the two primitives plus the tween and sequencer, `<kai-audio-visualizer>` with six
variants, the parts/data-attribute styling seam, the BYO-shader seam, `useVoiceRecorder.stream`,
stories, tests, docs page, MCP entry, NOTICE.

**Out:** any change to `<kai-voice-input>` or `<kai-voice-output>` public surface. A
standalone `<kai-shader-canvas>` element (the runner ships as an exported Solid component
and via `variant="custom"`; promoting it to its own element is a later call). Wiring the
visualizer into `kai-prompt-input` or a voice-mode surface.

## 13. Open risks

1. **Aura fidelity is the one genuinely uncertain deliverable.** The techniques involved
   (SDF shapes, domain-warped turbulence, HSV cycling, tonemapped bloom, dithering) are all
   textbook, so this is a tuning problem rather than a research problem. But "reads as
   premium" is a judgment call that needs a human look before it is locked. Budget a
   prototype-and-review cycle; do not treat it as a straight-line implementation task.
2. **The `createMediaElementSource` footgun silences audio with no error.** Highest-risk
   thing in the spec from a consumer's perspective. The `WeakMap` guard and the
   `-> destination` wiring both need explicit tests.
3. **Bundle regression is silent.** If someone later adds a static import of the shader path
   into `index.tsx`, `treeshake: false` puts 25 to 30 KB into every consumer's bundle with no
   warning. Worth a build-size assertion alongside the existing build guards.
