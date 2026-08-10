import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, onCleanup, Show, For, type JSX } from 'solid-js';
import { AudioVisualizer, type AudioVisualizerProps } from './index';
import { Button } from '../../ui/button';
import { Notice } from '../../ui/notice';
import { componentDescription } from '../../stories/docs/element-controls';
import {
  SIZES,
  CONTAINER_HEIGHT,
  defaultBarCount,
  defaultGridCount,
  defaultRadialBarCount,
  type VisualizerSize,
} from './sizes';
import { VOICE_BANDS, VOICE_FRAME_MS } from './audio-visualizer.voice-fixture';
// The SAME mirror primitives the component's live-audio path runs (see
// `bands()` in index.tsx) -- imported, never reimplemented here, so the
// stories' pre-computed `bands` demo the real centre-outward mapping
// rather than a lookalike that could drift from it.
import { mirrorBandsCenterOut, mirrorBandsAroundRing } from '../../primitives/audio-bands';

const STATES = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'disconnected'] as const;
/** Every look, including the WebGL ones, for the `variant` control. */
const ALL_VARIANTS = ['bar', 'grid', 'radial', 'wave', 'aurora', 'custom'] as const;

const meta = {
  title: 'Components/Elements/AudioVisualizer',
  component: AudioVisualizer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      controls: {
        exclude: ['use:eventListener', 'stream', 'audioElement', 'shader', 'bands'],
      },
      description: componentDescription([
        'Renders live audio as bars, a grid, a ring, a wave, or a glowing aurora. Set `stream` or `audioElement` to tap real audio, or `bands` to drive it yourself.',
        'With no audio source at all it animates from `state` alone: idle, connecting, listening, thinking, speaking, disconnected (connection down -- the dead, flat look, matching LiveKit\'s). That is what drives it when the audio cannot be tapped, like browser speech synthesis, which exposes no audio node.',
        '`wave`, `aurora`, and `custom` render through WebGL behind a dynamic import, and fall back to bars if that fails or WebGL is unavailable. Each look gets its own story across all six states, embedded below and in the sidebar: a shader canvas acquires its GL context when it scrolls into view and releases it when it leaves, so a page full of them stays well under the browser\'s concurrent context limit however far you scroll. Expect a frame or two of blank canvas as one scrolls in. The Bar, Grid, and Radial stories each cover every state for that DOM variant; Microphone is the real thing -- click-to-enable, since Storybook cannot answer a permission prompt -- and MicrophoneAll (sidebar only) drives all six looks from the same live voice at once.',
      ]),
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [...ALL_VARIANTS],
      description: 'Which look to render. `wave`, `aurora`, and `custom` render through WebGL; `custom` needs a `shader` to draw anything.',
      table: { defaultValue: { summary: 'bar' } },
    },
    state: {
      control: 'select',
      options: [...STATES],
      description:
        'Drives the scripted animation. `speaking` reads `bands` instead; `disconnected` is the dead-connection look (flat wave, nothing lit).',
      table: { defaultValue: { summary: 'idle' } },
    },
    size: {
      control: 'select',
      options: [...SIZES],
      description: 'Size preset, icon through xl.',
      table: { defaultValue: { summary: 'md' } },
    },
    theme: {
      control: 'select',
      options: ['auto', 'light', 'dark'],
      description: 'Explicit `light`/`dark` wins; `auto` follows `prefers-color-scheme`. Only aurora reads this today, for its color pipeline -- see its story. Bar, grid, and radial already adapt through CSS `currentColor` instead; wave and custom accept the prop but do not read it yet, always drawing the shader\'s fixed default color unless `color` overrides it.',
      table: { defaultValue: { summary: 'auto' } },
    },
    barCount: {
      // Raised from 24: that used to be radial's own default AND the
      // control's ceiling, so the control could never actually exercise
      // anything past what radial already renders by default. `Tile`'s
      // `overflow: hidden` was already built to absorb "an extreme control
      // value (a huge barCount, say)" -- this control just could not reach
      // one before.
      control: { type: 'number', min: 1, max: 48 },
      description: 'Bar and radial only.',
    },
    count: {
      control: { type: 'number', min: 1, max: 15 },
      description: 'Grid only: rows and columns of the square grid.',
    },
    spread: {
      control: { type: 'number', min: 0, max: 10 },
      description: 'Grid only: ring distance for the connecting animation, in cells.',
    },
    interval: {
      control: { type: 'number', min: 20, max: 500, step: 20 },
      description: 'Grid only: ms between scripted frames. Default 100.',
    },
    radius: {
      control: { type: 'number', min: 0, max: 200 },
      description: 'Radial only: distance from center, in px.',
    },
    color: {
      control: 'color',
      description: 'Overrides the inherited `currentColor`.',
    },
    complexity: {
      control: { type: 'number', min: 0, max: 1, step: 0.05 },
      description: 'Custom only here: pattern density, 0..1. Aurora accepts the prop but does not read it yet -- see the Aurora story note.',
    },
    animateWhenNotVisible: {
      control: 'boolean',
      description:
        'Shader variants only. Off by default: a canvas scrolled out of view stops drawing and releases its WebGL context, taking it back on the way in. Turn it on to keep a visualizer running unseen, at the cost of holding a context for as long as it is mounted. Never overrides `prefers-reduced-motion`. Scroll a tile off screen with this on and off to feel the difference.',
      table: { defaultValue: { summary: 'false' } },
    },
    label: {
      control: 'text',
      description: 'Announces the element as `role="img"` with this text. Omit it and the element stays `aria-hidden`.',
    },
    class: {
      control: 'text',
      description: 'Extra classes on the wrapping element.',
    },
  },
  render: (args) => <AudioVisualizer {...args} />,
} satisfies Meta<typeof AudioVisualizer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Smooth deterministic pseudo-noise: a short sum of sine octaves at
 * irrational-ish frequency ratios (never small-integer multiples of one
 * another), so the signal does not exactly repeat inside any window someone
 * would actually sit and watch -- confirmed out to 60s of samples at 250ms
 * resolution with zero repeated values. Every term is a plain `Math.sin`, so
 * the whole thing stays smooth everywhere: no `Math.abs`, so no hard corner
 * at a zero crossing anywhere in what is built from it below.
 */
function noise(x: number, seed: number): number {
  return (
    0.5 * Math.sin(x * 1.0 + seed) +
    0.28 * Math.sin(x * 2.173 + seed * 1.61) +
    0.14 * Math.sin(x * 4.911 + seed * 0.37) +
    0.08 * Math.sin(x * 9.27 + seed * 2.53)
  );
}

/**
 * Overall utterance loudness at time `t`, roughly 0..1. Sums a sentence-scale
 * drift (~7s between deeper dips), a word-scale burst (~1.8s), and two
 * syllable-rate terms in the 3-8Hz band real speech modulates at, then
 * squashes the whole sum through ONE asymmetric sigmoid (`Math.tanh` with a
 * positive bias) -- not four separate clamps -- so the result is smooth
 * everywhere and spends most of its time "on" with real dips between words
 * and sentences, rather than a symmetric wobble that never gets close to
 * silence.
 */
function utteranceEnvelope(t: number, seed: number): number {
  const raw =
    0.42 * Math.sin(2 * Math.PI * 0.14 * t + seed * 0.6) +
    0.28 * Math.sin(2 * Math.PI * 0.55 * t + seed * 1.4) +
    0.18 * Math.sin(2 * Math.PI * 4.3 * t + seed * 0.3) +
    0.12 * Math.sin(2 * Math.PI * 6.8 * t + seed * 2.1);
  return 0.5 + 0.5 * Math.tanh(2.0 * raw + 0.45);
}

/**
 * One band's level at time `t`, clamped to 0..1 (the clamp is a rarely-hit
 * safety net, not the shaping mechanism -- simulation shows the unclamped
 * value staying inside roughly 0..0.97 on its own). `pos` is the band's
 * POSITION in the row, 0 (lowest) to 1 (highest), not the raw index -- see
 * this function's callers, which derive it from index and count together so
 * the spatial frequencies below read the same regardless of how many bands
 * are actually on screen.
 *
 * - Spectral tilt: `depth` (`1 - pos`) scales both how OFTEN a band fires
 *   (`activity`'s exponent) and how loud it gets when it does (`peakAmp`),
 *   so high bands read as genuinely sparser, not just a smaller version of
 *   the same shape.
 * - Correlated neighbours: `carrier`'s phase is a function of `pos`, so
 *   adjacent bands move together like a formant sliding across several
 *   bins at once, while its own noise octaves still give it texture that
 *   changes faster than the envelope drifts.
 * - Transients: `spike` raises a smooth 0..1 noise value to a high power,
 *   which -- with no corner anywhere in it -- still reads as an occasional
 *   sharp pop rather than a constant hiss: a plosive or a sudden onset.
 */
function bandLevel(t: number, pos: number, seed: number): number {
  const depth = 1 - pos;
  const env = utteranceEnvelope(t, seed);
  const activity = Math.pow(env, 1 + 2.2 * pos);

  const spatialPhase = pos * Math.PI * 2.4 + seed * 0.31;
  const carrier =
    0.5 +
    0.5 *
      (0.6 * noise(t * 1.7 + spatialPhase, seed + 5.5) +
        0.4 * noise(t * 3.3 + spatialPhase * 1.6, seed + 12.1));

  const peakAmp = 0.22 + 0.75 * depth;

  const transientRaw = 0.5 + 0.5 * noise(t * 0.85 + seed * 4.3, seed * 6.1 + 21);
  const spike = Math.pow(transientRaw, 10);
  const transient = spike * (0.5 + 0.5 * depth) * 1.1 * activity;

  const level = activity * peakAmp * (0.25 + 0.85 * carrier) + transient;
  return Math.max(0, Math.min(1, level));
}

/**
 * Per-variant phase offsets for `useFakeBands` below -- arbitrary distinct
 * constants, not meaningful as values. Without these, wave and aurora both
 * reading the same wall-clock time would pulse in exact lockstep when their
 * stories are browsed near each other, which was a large part of why the
 * old data read as one looping GIF copied across every tile. Bar, grid,
 * radial, and custom read real recorded voice instead (`useVoiceBands`
 * below) and use the OFFSET_* frame offsets further down for the same
 * reason.
 */
const SEED_WAVE = 11.9;
const SEED_AURORA = 14.6;

/**
 * Per-variant frame offsets for `useVoiceBands` below, spread a quarter of
 * the fixture's 196-frame loop apart (see audio-visualizer.voice-fixture.ts)
 * so bar/grid/radial/custom -- all reading the same recorded loop -- show
 * different points in it at any given wall-clock moment, the same reason
 * the SEED_* constants above exist for the synthetic generator.
 */
const OFFSET_BAR = 0;
const OFFSET_GRID = 49;
const OFFSET_RADIAL = 98;
const OFFSET_CUSTOM = 147;

/**
 * Synthetic levels so `speaking` animates without a microphone.
 *
 * Matches the real analyser's cadence -- `useAudioAnalysis`'s
 * `updateInterval: 32` (about 31fps) -- with a `requestAnimationFrame` loop
 * throttled to the same 32ms, not `setInterval`, which the real analyser
 * never uses either. A NEW array reference every tick: mutating in place
 * would not re-render.
 *
 * `count` is an ACCESSOR, not a number, and is read fresh every frame rather
 * than captured once at mount -- each call site derives it from the same
 * band-count logic `AudioVisualizer` itself uses (`index.tsx`'s
 * `bandCount()`, backed by `defaultBarCount`/`defaultGridCount`/
 * `defaultRadialBarCount` in `sizes.ts`), so the generated array always
 * matches what the mounted tile actually wants -- including after a
 * `barCount`/`count`/`size` control changes. Generating the wrong
 * width is exactly the bug this fixes: `normalizeVolumeBands` pads a short
 * array by repeating its LAST value, so a fixed-width generator feeding a
 * variant that wants more bands than that left the extras frozen on
 * whichever value happened to be last, not actually varying.
 *
 * The signal itself models speech, not a waveform demo -- `bandLevel` above
 * layers an utterance envelope (bursts and pauses at syllable/word/sentence
 * rates), a spectral tilt (low bands louder and busier, high bands sparser
 * and quieter), spatially-correlated neighbours (a formant moves several
 * bins at once, not one in isolation), and occasional transients, all built
 * from `Math.sin`/`Math.tanh`/`Math.pow` -- never `Math.abs`, which puts a
 * hard corner at every zero crossing and is a large part of why the previous
 * version read as snappy and mechanical. `seed` gives each call site its own
 * phase offset (see the `SEED_*` constants above) so different variants
 * never move in lockstep. Still a pure function of `t` and band position, so
 * it stays fully deterministic -- no `Math.random()` anywhere in it.
 *
 * Full width and unmirrored, unlike `useVoiceBands` below: its only two
 * callers are wave and aurora, whose shaders consume just the volume
 * scalar the dispatcher reduces from these bands, so band-to-element
 * shape does not apply. (This generator briefly carried an optional
 * `mirror` argument for the DOM-variant overview story that has since
 * been removed; every DOM variant's own story feeds real recorded voice
 * through `useVoiceBands`, which does the half-width-then-mirror properly.)
 */
function useFakeBands(count: () => number, seed = 0) {
  const [bands, setBands] = createSignal<number[]>(new Array(Math.max(1, count())).fill(0));
  if (typeof requestAnimationFrame === 'undefined') return bands;

  let raf = 0;
  let last = 0;
  const step = (now: number) => {
    if (now - last >= 32) {
      const t = now / 1000;
      const n = Math.max(1, count());
      setBands(Array.from({ length: n }, (_, i) => bandLevel(t, n <= 1 ? 0 : i / (n - 1), seed)));
      last = now;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  onCleanup(() => cancelAnimationFrame(raf));

  return bands;
}

/**
 * Linear interpolation across the band axis, from the fixture's native
 * width to whatever `count` the caller wants.
 *
 * The recorded fixture (audio-visualizer.voice-fixture.ts) is 3 bands wide
 * -- the component's own HALF width at `md` -- and `useVoiceBands` below
 * resamples it to `Math.ceil(count / 2)` before mirroring, so the target
 * here is always a half width, never the full element count. Bar, grid,
 * and custom at `md` ask for exactly 3, hitting the
 * `count === source.length` fast path and playing the real values back
 * verbatim. Radial defaults to 24 elements (half width 12) and the
 * `barCount` control reaches 48 (half width 24) -- padding a short array
 * by repeating its last value is what `normalizeVolumeBands` does
 * elsewhere in this component, and is exactly why the OLD radial story had
 * 19 of 24 spokes frozen on one value. This instead treats the 3 real
 * samples as points spread evenly across 0..1 and interpolates between the
 * two nearest ones for every target band, so a wider fan-out still reads
 * as one continuous spectrum -- preserving the spectral tilt and the
 * envelope -- rather than a handful of real values followed by a wall of
 * duplicates.
 */
function resampleBands(source: readonly number[], count: number): number[] {
  const target = Math.max(1, count);
  if (target === source.length) return source.slice();
  if (source.length <= 1) return new Array(target).fill(source[0] ?? 0);
  const lastIndex = source.length - 1;
  return Array.from({ length: target }, (_, i) => {
    const pos = target <= 1 ? 0 : (i / (target - 1)) * lastIndex;
    const lo = Math.floor(pos);
    const hi = Math.min(lastIndex, lo + 1);
    const frac = pos - lo;
    return source[lo] + (source[hi] - source[lo]) * frac;
  });
}

/**
 * Real recorded voice, looped, resampled to the component's half width, and
 * mirrored out to the full element count -- see
 * audio-visualizer.voice-fixture.ts for the recording, the trim, and why
 * the loop point does not jump.
 *
 * The fixture holds `Math.ceil(count / 2)`-shaped HALF bands (3, the `md`
 * half width), matching what `bandCount()` in index.tsx requests from the
 * analyser. Every tick resamples the frame to the CURRENT half width, then
 * maps it out to the full `count` through `mirror` -- one of the two
 * primitives the live-audio path itself runs: `mirrorBandsCenterOut` (the
 * default; bar, grid, custom) or `mirrorBandsAroundRing` (the radial call
 * site). The `bands` prop is a raw passthrough by contract, so doing the
 * mirroring HERE, with the component's own imported primitives, is what
 * keeps these tiles showing the real centre-outward behaviour instead of
 * the analyser's raw one-directional tilt.
 *
 * Same throttled-`requestAnimationFrame` shape as `useFakeBands` above, at
 * the fixture's own `VOICE_FRAME_MS` (32ms, matching `useAudioAnalysis`'s
 * real `updateInterval`) rather than `setInterval`. `now` is the absolute
 * `requestAnimationFrame` timestamp, not time-since-mount, so the frame
 * index is `Math.floor(now / VOICE_FRAME_MS)` -- deterministic and
 * consistent across every call site regardless of when its component
 * happened to mount.
 *
 * `offsetFrames` (the OFFSET_* constants above) shifts each call site into
 * a different point of the 196-frame loop, so bar/grid/radial/custom -- all
 * reading the same recording -- do not pulse in lockstep when their stories
 * sit next to each other, the same problem the SEED_* constants solve for
 * the synthetic generator.
 *
 * `count` is an ACCESSOR, read fresh every frame, same contract as
 * `useFakeBands`: a `barCount`/`count`/`size` control change is
 * picked up without remounting, and `resampleBands` (above) reshapes the
 * fixture's 3 real bands to the new half width rather than padding.
 */
function useVoiceBands(
  count: () => number,
  offsetFrames = 0,
  mirror: (halfBands: number[], count: number) => number[] = mirrorBandsCenterOut,
) {
  const loopLength = VOICE_BANDS.length;
  const frameAt = (frameIndex: number): number[] => {
    const n = Math.max(1, count());
    return mirror(resampleBands(VOICE_BANDS[frameIndex], Math.ceil(n / 2)), n);
  };
  const [bands, setBands] = createSignal<number[]>(frameAt(offsetFrames % loopLength));
  if (typeof requestAnimationFrame === 'undefined') return bands;

  let raf = 0;
  let last = 0;
  const step = (now: number) => {
    if (now - last >= VOICE_FRAME_MS) {
      const frameIndex = (Math.floor(now / VOICE_FRAME_MS) + offsetFrames) % loopLength;
      setBands(frameAt(frameIndex));
      last = now;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  onCleanup(() => cancelAnimationFrame(raf));

  return bands;
}

// The Custom story's demo shader: a smooth spectrum ridge, written
// clean-room for this story (deliberately NOT a port -- custom is the one
// variant that is ours). Shows what the custom seam is FOR: consumer GLSL
// driven per band by uBands, breathing with uVolume, moving on iTime, and
// state-shaded by uIntensity. Design notes live inline; the earlier
// revision drew hard per-band boxes sliced into LED segments by default,
// which read as odd horizontal lines -- segmentation is now opt-in through
// the complexity control (0, the default, is solid) and the boxes became
// one interpolated ridge with a vertical gradient and a soft crest glow.
const SPECTRUM_SHADER = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // Band energy decides what this shader renders. With real voice bands
  // present (the speaking tile; a live mic with speech), the ridge tracks
  // them. With none -- every scripted state; the story zeroes bands
  // outside speaking, matching the live pipeline where non-speaking
  // states carry no stream -- the shader MODELS the state machine itself
  // from the two state-correlated uniforms the kit provides: uSpeed,
  // distinct per state (disconnected 0.5, idle 1, listening/speaking 2.5,
  // thinking 4, connecting 6 -- shaderTargets in visualizer-sequences.ts),
  // and uIntensity (dim / pulsing / volume-driven brightness).
  float energy = 0.0;
  for (int i = 0; i < BAND_COUNT; i++) energy += uBands[i];

  // All motion runs on iTime * uSpeed: reduced motion pins uSpeed at 0
  // (variant-custom.tsx), which stills every look below and collapses the
  // state branch to the calm idle arm -- a static resting ridge, states
  // still hinted apart by uIntensity's collapsed brightness.
  float t = iTime * uSpeed;
  float level;

  if (energy > 0.05) {
    // Voice-driven ridge: sample the two nearest bands and ease between
    // them, one continuous crest instead of five hard boxes. (WebGL1 GLSL
    // can only index a uniform array by a loop constant, hence the loop.)
    float x = clamp(uv.x * float(BAND_COUNT) - 0.5, 0.0, float(BAND_COUNT - 1));
    float lo = floor(x);
    float hi = min(lo + 1.0, float(BAND_COUNT - 1));
    float levLo = 0.0;
    float levHi = 0.0;
    for (int i = 0; i < BAND_COUNT; i++) {
      if (float(i) == lo) levLo = uBands[i];
      if (float(i) == hi) levHi = uBands[i];
    }
    level = mix(levLo, levHi, smoothstep(0.0, 1.0, x - lo));
  } else if (uSpeed > 5.0) {
    // connecting: a mirrored pair of swells sweeping in from both edges to
    // meet at the centre -- the same inward-sweep semantic the DOM
    // variants' connecting sequence uses. Clearly transitional: it never
    // settles.
    float d = abs(uv.x - 0.5);
    float pos = mix(0.55, 0.0, fract(t * 0.1));
    level = 0.06 + 0.24 * exp(-pow((d - pos) * 8.0, 2.0));
  } else if (uSpeed > 3.0) {
    // thinking: one soft swell sweeping steadily across the ridge, edge to
    // edge -- a shimmer working its way through.
    float pos = fract(t * 0.08) * 1.2 - 0.1;
    level = 0.08 + 0.18 * exp(-pow((uv.x - pos) * 6.0, 2.0));
  } else if (uSpeed > 1.5) {
    // listening: the whole ridge breathing in one gentle rhythm.
    level = 0.13 + 0.05 * sin(t * 1.6) + 0.02 * sin(uv.x * 6.3 + t * 0.7);
  } else if (uSpeed > 0.75) {
    // idle: calm, low, barely moving.
    level = 0.07 + 0.015 * sin(t * 0.9 + uv.x * 3.0);
  } else if (uSpeed > 0.25) {
    // disconnected (speed 0.5): a flat, dim dead line -- no motion terms
    // at all, consistent with the wave variant's flat-line semantic. The
    // low level also naturally suppresses the crest glow below.
    level = 0.04;
  } else {
    // uSpeed 0 is FROZEN (reduced motion pins it there for every state):
    // a static calm resting ridge; states stay hinted apart only by
    // uIntensity's collapsed brightness.
    level = 0.07;
  }

  // A faint travelling shimmer keeps any crest alive between updates,
  // stilled with everything else when uSpeed is pinned to 0.
  level += 0.02 * sin(uv.x * 18.0 + t * 1.5) * smoothstep(0.03, 0.1, level);

  // Inside the ridge: a vertical gradient, dimmest at the base, saturating
  // toward full opacity right at the crest.
  float inside = step(uv.y, level);
  float grad = mix(0.35, 1.0, uv.y / max(level, 0.001));
  float crest = smoothstep(level - 0.05, level, uv.y) * 0.6;

  // uComplexity keeps the LED-segment look reachable from Controls: 0 (the
  // story default) is solid; raising it slices the fill into up to eight
  // segments. The glow below stays unsliced either way.
  float sliced = step(0.15, fract(uv.y * mix(1.0, 8.0, uComplexity)));
  float slice = mix(1.0, sliced, step(0.001, uComplexity));

  // Soft glow rising off the crest, breathing gently with the overall
  // volume scalar, so quiet bands still read on light AND dark backgrounds.
  float glow = 0.35 * (0.7 + 0.6 * uVolume) * exp(-max(uv.y - level, 0.0) * 16.0)
    * smoothstep(0.02, 0.15, level) * (1.0 - inside);

  // uIntensity is CustomVisualizer's state tween (shaderTargets in
  // primitives/visualizer-sequences.ts): steady at idle, pulsing for
  // listening/connecting/thinking, volume-driven while speaking -- what
  // keeps the five state tiles visually distinct.
  float lum = (inside * grad * slice * (1.0 + crest) + glow) * uIntensity;

  // Premultiplied alpha, per the ShaderCanvas contract.
  float alpha = clamp(lum, 0.0, 1.0);
  fragColor = vec4(uColor * alpha, alpha);
}`.replace(/BAND_COUNT/g, '5');

// ---------------------------------------------------------------- layout

const TILE_GAP = 24;

/** Fixed cell side length for a size preset -- the variant's own container
 *  height plus breathing room, so every tile in a row is the same size no
 *  matter how wide (bar) or square (radial) that variant's actual content
 *  is. Used by every per-variant story and by MicrophoneAll, so the whole
 *  file reads as one grid. */
function cellSize(size: VisualizerSize): number {
  return CONTAINER_HEIGHT[size] + 48;
}

/** A fixed-size, bordered cell with its content centered inside and an
 *  optional label underneath. `overflow: hidden` keeps an extreme control
 *  value (a huge `barCount`, say) from spilling into a neighbouring tile --
 *  the cell stays uniform even if that clips the content at the edges. */
function Tile(props: { size: VisualizerSize; label?: string; children: JSX.Element }): JSX.Element {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '10px' }}>
      <div
        style={{
          width: `${cellSize(props.size)}px`,
          height: `${cellSize(props.size)}px`,
          'box-sizing': 'border-box',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          'border-radius': '12px',
        }}
      >
        {props.children}
      </div>
      <Show when={props.label}>
        <code style={{ 'font-size': '11px', opacity: 0.6 }}>{props.label}</code>
      </Show>
    </div>
  );
}

/** One tile per state, in a wrapping row, each state's name underneath.
 *  `children` is called once per state and receives it -- the standard
 *  render-prop shape already used throughout this component (see
 *  `VariantProps['children']` in variant-bar.tsx), not a coincidence. */
function StateRow(props: {
  size: VisualizerSize;
  children: (state: (typeof STATES)[number]) => JSX.Element;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: `${TILE_GAP}px`, 'flex-wrap': 'wrap' }}>
      <For each={STATES}>{(s) => <Tile size={props.size} label={s}>{props.children(s)}</Tile>}</For>
    </div>
  );
}

// ---------------------------------------------------------------- per-variant

/** Vertical bars, LiveKit's original look. Driven by a real recorded voice
 *  while `speaking`; every other state runs its own scripted sequence with
 *  no audio involved -- `listening` blinks the center bar every 500ms. */
export const Bar: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color', 'barCount'] },
    docs: {
      description: {
        story:
          'Driven by a real recorded voice while `speaking` (see audio-visualizer.voice-fixture.ts). Every ' +
          'other state runs its own scripted sequence with no audio involved -- `listening` blinks the center ' +
          'bar every 500ms, carried from LiveKit. `theme` is not listed: bar already adapts through CSS ' +
          '`currentColor`, so the prop has nothing to do here.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    // Same band-count logic bar itself falls back to (`defaultBarCount` in
    // sizes.ts): `barCount` follows the control, and re-reading it every
    // frame (rather than once at mount) keeps the generated width in sync
    // if the control changes after mount.
    const bands = useVoiceBands(() => args.barCount ?? defaultBarCount(args.size ?? 'md'), OFFSET_BAR);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer
            variant="bar"
            state={s}
            size={args.size}
            color={args.color}
            barCount={args.barCount}
            bands={bands()}
          />
        )}
      </StateRow>
    );
  },
};

export const Grid: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color', 'count', 'spread', 'interval'] },
    docs: {
      description: {
        story:
          'A grid of dots that pulses with the audio. The square `count` defaults to the size preset; ' +
          '`spread` and `interval` only shape the scripted `connecting` sequence, not `speaking`.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    // Grid keys off `count` (falling back to `defaultGridCount`), not
    // `barCount` -- the same source `AudioVisualizer`'s own `bandCount()`
    // reads for this variant.
    const bands = useVoiceBands(() => args.count ?? defaultGridCount(args.size ?? 'md'), OFFSET_GRID);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer
            variant="grid"
            state={s}
            size={args.size}
            color={args.color}
            count={args.count}
            spread={args.spread}
            interval={args.interval}
            bands={bands()}
          />
        )}
      </StateRow>
    );
  },
};

export const Radial: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color', 'barCount', 'radius'] },
    docs: {
      description: {
        story:
          'Bars around a ring, growing outward with the audio. `thinking` spins the whole ring in CSS instead ' +
          'of following the scripted highlight groups. A `barCount` not divisible by 4 warns in the console -- ' +
          'the ring still renders, just asymmetric.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    // Radial defaults to `defaultRadialBarCount` (24 at `md`):
    // `useVoiceBands` resamples the fixture's 3 real bands to the half
    // width (12) and mirrors them around the ring -- `mirrorBandsAroundRing`
    // here, not the linear centre-out default, because that is exactly the
    // primitive `bands()` in index.tsx runs for this variant: band 0 lands
    // at the ring's bottom fixed point and fades toward the top, mirrored
    // left-right across the vertical axis. `barCount` still wins when set,
    // and is re-read every frame so the width tracks the control.
    const bands = useVoiceBands(
      () => args.barCount ?? defaultRadialBarCount(args.size ?? 'md'),
      OFFSET_RADIAL,
      mirrorBandsAroundRing,
    );
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer
            variant="radial"
            state={s}
            size={args.size}
            color={args.color}
            barCount={args.barCount}
            radius={args.radius}
            bands={bands()}
          />
        )}
      </StateRow>
    );
  },
};

// ON THE DOCS PAGE, AND THE WEBGL CONTEXT CAP -- the canonical note; the
// other shader stories point here rather than repeat it.
//
// The Docs page (tags: ['autodocs'] on `meta`) renders every story in this
// file inline at once. Wave, Aurora, and Custom are six live canvases each,
// plus MicrophoneAll's six: far past Chrome's ~16 concurrent WebGL context
// cap, where surplus contexts do not throw -- they silently fail to
// compile, so tiles render blank while everything looks fine. All three
// stories used to carry `tags: ['!autodocs']` to stay off this page for
// exactly that reason. (`docs.story.inline: false`, which renders a story
// in its own iframe, was measured and does NOT help: same-origin iframes
// share the renderer process, so they share the cap too.)
//
// ShaderCanvas now manages contexts by visibility: it defers building
// until an IntersectionObserver reports the canvas on screen, and releases
// the context (WEBGL_lose_context) when it scrolls away, rebuilding
// through the same setup path on return -- iTime freezes off screen rather
// than resetting. A page therefore holds one context per canvas actually
// in the viewport plus at most one in flight, no matter how many stories
// it hosts, so the cap is no longer reachable by scrolling this page and
// the tags are gone. Expect a one-frame deferred first compile and a two
// to three frame blank on scroll-in; that is the design, not a fault.
export const Wave: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color', 'animateWhenNotVisible'] },
    docs: {
      description: {
        story:
          '`idle`: flat line, amplitude and frequency both zero -- by design, not a bug. `listening`: the ' +
          'base wave with a slow mirrored opacity pulse, 750ms. `thinking`/`connecting`: quadruple the speed ' +
          'and frequency, quarter the amplitude, pulse faster at 400ms -- a tighter, jitterier line, and ' +
          'near-identical to each other since both share one return in `waveTargets`. `speaking`: doubles the ' +
          'base speed, holds full opacity, and reads amplitude and frequency straight from live volume with no ' +
          'easing -- driven by synthetic bands here so it moves. `theme` is not listed: this shader does not ' +
          'read it yet, and always draws the fixed default color unless `color` overrides it.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    // Wave has no `barCount` control -- it only reads `volume`, a scalar
    // reduced from `bands` -- but generate at the element count a
    // shader-load failure's bar fallback would render (`defaultBarCount`),
    // so that fallback gets a matching full-width array too. No `mirror`
    // on purpose: the shader consumes only the volume scalar, which is
    // shape-blind, and the fallback is an error path, not the place this
    // file demos the centre-outward mapping.
    const bands = useFakeBands(() => defaultBarCount(args.size ?? 'md'), SEED_WAVE);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer variant="wave" state={s} size={args.size} color={args.color} bands={bands()} animateWhenNotVisible={args.animateWhenNotVisible} />
        )}
      </StateRow>
    );
  },
};

export const Aurora: Story = {
  args: { size: 'md' },
  // On the Docs page like every other story -- see the WebGL context note
  // above Wave for why that is safe now.
  parameters: {
    controls: { include: ['size', 'color', 'theme', 'animateWhenNotVisible'] },
    docs: {
      description: {
        story:
          '`speaking` shows its steady base radius: this canvas has no live microphone to drive the ' +
          'voice-reactive growth here, since `bands`/`volume` are synthetic, not real audio. `complexity` is ' +
          'not listed as a control here: this variant\'s pattern density comes from `state` internally ' +
          '(`auroraTargets`) and does not read the `complexity` prop yet -- see Custom for a variant where it works.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    // Same reasoning as Wave above: no `barCount` control here either, only
    // `volume` is read, so generate at the same width the bar fallback
    // would default to.
    const bands = useFakeBands(() => defaultBarCount(args.size ?? 'md'), SEED_AURORA);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer variant="aurora" state={s} size={args.size} color={args.color} theme={args.theme} bands={bands()} animateWhenNotVisible={args.animateWhenNotVisible} />
        )}
      </StateRow>
    );
  },
};

export const Custom: Story = {
  // complexity 0: the demo defaults to SOLID gradient bars. The LED-segment
  // slicing stays wired to the control -- raise it and the fill slices into
  // segments -- it is a capability to discover, not the default look.
  args: { size: 'md', complexity: 0 },
  // On the Docs page like every other story -- see the WebGL context note
  // above Wave for why that is safe now.
  parameters: {
    controls: { include: ['size', 'color', 'complexity', 'animateWhenNotVisible'] },
    docs: {
      description: {
        story:
          'Set `variant="custom"` and a `shader` to render your own GLSL. It receives the ShaderToy built-ins ' +
          'plus `uColor`, `uIntensity`, `uSpeed`, `uComplexity`, `uVolume`, and `uBands[]` -- never declare ' +
          'those yourself, the canvas declares them for you. This story\'s shader models the whole state ' +
          'machine the way a consumer shader would, from the kit\'s own uniforms: `speaking` draws the five ' +
          '`uBands` as one smoothly interpolated voice ridge; with no band energy it keys off `uSpeed` ' +
          '(distinct per state) -- a flat dead line for `disconnected`, a calm, barely-moving `idle`, a ' +
          'rhythmically breathing `listening`, a swell sweeping across for `thinking`, and a mirrored pair ' +
          'rushing inward for `connecting` -- ' +
          'while `uIntensity` layers the dim/pulsing/bright state brightness on top. Vertical gradient and ' +
          'crest glow throughout; `complexity` slices the fill into LED-style segments when raised (solid at ' +
          'its 0 default); hardcoded for 5 bands, so every tile forces `barCount={5}` to match. `theme` is ' +
          'not listed: this shader does not read it yet either.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    // Pinned, not derived: SPECTRUM_SHADER's `uBands` loop is hardcoded to 5
    // (`BAND_COUNT` above), and every tile here forces `barCount={5}` to
    // match. Feeding a generalised, size-following count would desync the
    // two -- `uBands` is a fixed-length uniform array, and indexing it out
    // of bounds produced visible garbage earlier in this component's history.
    // The half width of 5 is 3 -- the fixture's own native width -- so this
    // hits `resampleBands`' passthrough fast path and mirrors the recording
    // out to 5 verbatim, no interpolation involved.
    const bands = useVoiceBands(() => 5, OFFSET_CUSTOM);
    // Voice bands reach ONLY the speaking tile. Feeding the recording into
    // every state used to swamp the scripted looks -- all five tiles
    // rendered the same voice ridge, brightness aside. Zeroed bands are
    // also what the real pipeline delivers outside speaking: the live
    // Microphone story has no stream at all in non-speaking states, so a
    // consumer shader sees uBands of zeros there and must (and now does,
    // see SPECTRUM_SHADER) script those states from uSpeed/uIntensity.
    const SILENT_BANDS = [0, 0, 0, 0, 0];
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer
            variant="custom"
            state={s}
            size={args.size}
            color={args.color}
            complexity={args.complexity}
            barCount={5}
            bands={s === 'speaking' ? bands() : SILENT_BANDS}
            shader={{ fragment: SPECTRUM_SHADER }}
            animateWhenNotVisible={args.animateWhenNotVisible}
          />
        )}
      </StateRow>
    );
  },
};

/**
 * Upstream LiveKit's local-track capture defaults (livekit-client
 * src/room/defaults.ts:27-30), requested explicitly instead of bare
 * `{ audio: true }`. The default analysis window (bins 100-200, see
 * use-audio-analysis.ts DEFAULTS) expects processed, gain-controlled
 * speech -- autoGainControl is what lifts quiet natural speech into the
 * window's sensitivity, and noiseSuppression/voiceIsolation keep the idle
 * floor clean. Browsers default the first three ON for bare `audio: true`
 * anyway; `voiceIsolation` is the one upstream adds on top, and it is not
 * in TS's MediaTrackConstraintSet yet -- hence the cast.
 */
const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...({ voiceIsolation: true } as MediaTrackConstraints),
  },
};

/**
 * A real microphone, click-to-enable.
 *
 * Nothing here calls `getUserMedia` on mount -- it renders an idle
 * visualizer and a button, so there is no permission prompt for Storybook's
 * automated a11y run to hang on. Only the click handler asks for the
 * microphone; a second click stops the tracks and returns to idle.
 *
 * `state` is forced to `speaking` while the stream is live: every other
 * state deliberately ignores audio and runs its own scripted sequence
 * instead (see Bar above), so a mic story left on `listening` would just
 * blink and look exactly as broken as the bug this fixes.
 */
export const Microphone: Story = {
  args: { variant: 'bar' },
  parameters: {
    docs: {
      description: {
        story:
          'Click to grant the microphone, click again to release it. Switch `variant` in Controls to hear the same stream drive any of the six looks -- `wave` and `aurora` read `volume`, which the dispatcher derives from the live stream, so they react too. Denied or unavailable permission shows the reason instead of failing silently.',
      },
    },
    controls: { include: ['variant'] },
  },
  render: (args: AudioVisualizerProps) => {
    const [stream, setStream] = createSignal<MediaStream | undefined>();
    const [error, setError] = createSignal<string | null>(null);
    const [requesting, setRequesting] = createSignal(false);

    const stopTracks = (s: MediaStream | undefined) => s?.getTracks().forEach((t) => t.stop());

    const toggle = async () => {
      const live = stream();
      if (live) {
        stopTracks(live);
        setStream(undefined);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('getUserMedia is not available in this browser context.');
        return;
      }
      setError(null);
      setRequesting(true);
      try {
        setStream(await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Microphone access failed.');
      } finally {
        setRequesting(false);
      }
    };

    // A leaked mic is worse than a broken story: stop the tracks on
    // cleanup (navigating away) even if a click never released them.
    onCleanup(() => stopTracks(stream()));

    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px', 'align-items': 'center' }}>
        <Tile size="lg">
          <AudioVisualizer
            variant={args.variant}
            state={stream() ? 'speaking' : 'idle'}
            size="lg"
            stream={stream()}
            shader={args.variant === 'custom' ? { fragment: SPECTRUM_SHADER } : undefined}
          />
        </Tile>
        <Button onClick={() => void toggle()} disabled={requesting()} aria-pressed={!!stream()}>
          {stream() ? 'Stop microphone' : requesting() ? 'Requesting...' : 'Enable microphone'}
        </Button>
        <Show when={error()}>{(message) => <Notice severity="error">{message()}</Notice>}</Show>
      </div>
    );
  },
};

/**
 * All six variants, one live microphone, side by side.
 *
 * Same click-to-enable pattern as Microphone above -- one button, one
 * `getUserMedia` call, one `MediaStream` -- but that single stream is set on
 * all six `<AudioVisualizer>` instances at once instead of switching one
 * through a control. Six `useAudioAnalysis` instances end up tapping the
 * same stream simultaneously: each calls its own `ctx.createMediaStreamSource
 * (stream)`, which -- unlike `createMediaElementSource` -- has no
 * once-per-element restriction, so this is expected to just work, but it had
 * never actually been exercised with six concurrent consumers before this
 * story. Verified in the browser: all six react independently to the same
 * stream, not just the first.
 */
export const MicrophoneAll: Story = {
  // Still off the Docs page, but NOT for the WebGL context reason any more
  // (see the note above Wave -- contexts are managed by visibility now).
  // What keeps it off: it is the heaviest story in the file, six live
  // visualizers on one microphone, and it is permission-gated -- the Docs
  // page is a scroll-through reference, not the place to meet a mic
  // prompt. `Microphone` above is the click-to-enable story that does
  // appear there.
  tags: ['!autodocs'],
  parameters: {
    docs: {
      description: {
        story:
          'One microphone, all six looks at once, so they can be compared on the same live voice instead of one at a time through a control. `custom` reuses the spectrum shader from the Custom story above so it visibly responds to `uBands` too.',
      },
    },
    // `include: []` does NOT hide the panel in this Storybook version -- it
    // falls back to showing every arg, which is exactly the "control that
    // does nothing" problem this file is fixing everywhere else. `disable`
    // is the mechanism that actually removes the Controls tab's content.
    controls: { disable: true },
  },
  render: () => {
    const [stream, setStream] = createSignal<MediaStream | undefined>();
    const [error, setError] = createSignal<string | null>(null);
    const [requesting, setRequesting] = createSignal(false);

    const stopTracks = (s: MediaStream | undefined) => s?.getTracks().forEach((t) => t.stop());

    const toggle = async () => {
      const live = stream();
      if (live) {
        stopTracks(live);
        setStream(undefined);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('getUserMedia is not available in this browser context.');
        return;
      }
      setError(null);
      setRequesting(true);
      try {
        setStream(await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Microphone access failed.');
      } finally {
        setRequesting(false);
      }
    };

    // Six tiles share this one stream: stop every track once here, not per
    // tile -- there is exactly one MediaStream to release, no matter how
    // many visualizers are tapping it.
    onCleanup(() => stopTracks(stream()));

    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px', 'align-items': 'center' }}>
        <Button onClick={() => void toggle()} disabled={requesting()} aria-pressed={!!stream()}>
          {stream() ? 'Stop microphone' : requesting() ? 'Requesting...' : 'Enable microphone'}
        </Button>
        <Show when={error()}>{(message) => <Notice severity="error">{message()}</Notice>}</Show>
        {/*
          2 columns, not 3: at `lg` each `Tile` is a fixed 272px square
          (`cellSize` = `CONTAINER_HEIGHT.lg` 224 + 48). 3 across needs
          roughly 880px of row width before the fixed-size tiles overflow
          their `minmax(0, 1fr)` tracks, which does not fit sensibly next to
          Storybook's sidebar and panel at a normal window width. 2 columns
          only needs about 576px and keeps all six tiles fully visible
          without scrolling, at the cost of a taller (3-row) grid instead of
          a wider one.
        */}
        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
            'column-gap': '32px',
            'row-gap': '24px',
            'justify-items': 'center',
          }}
        >
          <For each={ALL_VARIANTS}>
            {(v) => (
              <Tile size="lg" label={v}>
                <AudioVisualizer
                  variant={v}
                  state={stream() ? 'speaking' : 'idle'}
                  size="lg"
                  stream={stream()}
                  // SPECTRUM_SHADER is hardcoded for 5 bands. `lg`'s own
                  // default already happens to be 5 (`defaultBarCount`), but
                  // force it explicitly rather than lean on that coincidence
                  // -- if this story's tile size ever changes again, `custom`
                  // must still declare `uBands` at length 5 to match what the
                  // shader body indexes, or dropping to `sm`/`icon` (default
                  // 3) would desync the two the way it once did.
                  barCount={v === 'custom' ? 5 : undefined}
                  shader={v === 'custom' ? { fragment: SPECTRUM_SHADER } : undefined}
                />
              </Tile>
            )}
          </For>
        </div>
      </div>
    );
  },
};
