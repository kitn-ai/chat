/**
 * A real recorded voice, baked into a short seamless loop for the
 * `speaking` tiles in the stories -- the genuine article, not a generator.
 *
 * Real voice, recorded by the project owner: "This is a test, testing one
 * two three, hello world." Captured mono at 44.1kHz, then extracted through
 * the component's own pipeline: `reduceToBands` in `primitives/audio-bands.ts`
 * as it exists in THIS tree (geometric bucket spacing) at 3 bands over bins
 * 4-120 (the `voice` frequency window, roughly 86Hz-2.6kHz; the geometric
 * bucket edges land at bins 4/12/39/120), polled at the analyser's real
 * ~32ms cadence -- not resynthesized or hand-tuned. This corrects the
 * previous 5-band bake, which had been extracted with the analysis script's
 * inline LINEAR band split before `reduceToBands` moved to geometric
 * spacing -- its "the same function useAudioAnalysis calls" claim was true
 * when written and went stale when the spacing changed.
 *
 * 3 bands per frame is HALF width on purpose: `Math.ceil(count / 2)`, the
 * exact band count the component itself requests at `md` before mirroring
 * (see `bandCount()` in index.tsx). The `bands` prop is a raw passthrough
 * by contract, so the stories mirror these half bands out to the full
 * element count themselves through `mirrorBandsCenterOut` /
 * `mirrorBandsAroundRing` -- the same primitives the live-audio path runs
 * -- which is what makes the demo show the component's real centre-outward
 * shape instead of bypassing it. See `useVoiceBands` in the stories file.
 *
 * Trimmed from the original ~10.5s take down to 196 frames (~6.4s): dropped
 * the near-silent lead-in and tail, keeping about half a second of rest
 * before the first word and just under a second after the last, and keeping
 * BOTH natural pauses in the middle -- one short gap around "test," /
 * "testing", and the longer one after "three," before "hello" -- since
 * those are what prove the visualizer falls back to rest and recovers, not
 * just what fills the silence.
 *
 * Loops by wrapping frame 195 back to frame 0: the closest-matching pair of
 * quiet moments whose span still covers the whole utterance with that short
 * lead-in and tail. Re-derived for this bake by the same method as the
 * original's: the previous 192-frame trim's endpoints, near-identical at 5
 * linear bands (~0.002 apart), measure 0.024 apart at 3 geometric bands --
 * around 3450th of ~5200 candidate quiet pairs, nowhere near closest
 * anymore. The pair chosen instead is 0.003 apart before quantization and
 * IDENTICAL after it, so the wrap is a repeated quiet frame, not a jump cut
 * -- the "animated GIF" seam this fixture exists to remove. (The old
 * fixture's endpoints also quantized identical; the property is preserved,
 * not new.)
 *
 * Quantized to 2 decimals. Playback treats the cadence as a flat
 * `VOICE_FRAME_MS`; the capture's real ticks land at 32-33ms (setTimeout
 * jitter), a ~2% difference nobody can see. Body is ~3.9KB.
 */
export const VOICE_FRAME_MS = 32;

export const VOICE_BANDS: readonly (readonly number[])[] = [
  [0.52,0.29,0.02],
  [0.51,0.28,0.01],
  [0.51,0.29,0.01],
  [0.51,0.29,0.02],
  [0.51,0.29,0.02],
  [0.52,0.29,0.01],
  [0.52,0.29,0.02],
  [0.51,0.28,0.01],
  [0.51,0.27,0.01],
  [0.51,0.27,0.01],
  [0.51,0.28,0.01],
  [0.52,0.28,0.01],
  [0.52,0.27,0.01],
  [0.52,0.31,0.09],
  [0.53,0.38,0.22],
  [0.63,0.56,0.41],
  [0.64,0.59,0.44],
  [0.65,0.61,0.47],
  [0.66,0.61,0.47],
  [0.65,0.6,0.46],
  [0.64,0.59,0.45],
  [0.64,0.58,0.43],
  [0.66,0.58,0.43],
  [0.69,0.59,0.45],
  [0.7,0.58,0.45],
  [0.71,0.57,0.44],
  [0.71,0.56,0.43],
  [0.7,0.56,0.42],
  [0.7,0.57,0.4],
  [0.7,0.59,0.41],
  [0.7,0.59,0.43],
  [0.7,0.59,0.44],
  [0.7,0.58,0.43],
  [0.7,0.57,0.42],
  [0.69,0.56,0.41],
  [0.68,0.55,0.4],
  [0.67,0.53,0.39],
  [0.67,0.53,0.39],
  [0.67,0.52,0.4],
  [0.68,0.52,0.4],
  [0.68,0.51,0.38],
  [0.67,0.5,0.37],
  [0.66,0.49,0.35],
  [0.65,0.48,0.36],
  [0.64,0.47,0.38],
  [0.65,0.48,0.39],
  [0.67,0.5,0.41],
  [0.69,0.51,0.43],
  [0.7,0.51,0.45],
  [0.7,0.51,0.46],
  [0.71,0.52,0.46],
  [0.71,0.52,0.45],
  [0.71,0.52,0.44],
  [0.7,0.52,0.43],
  [0.69,0.52,0.42],
  [0.69,0.51,0.4],
  [0.68,0.5,0.38],
  [0.67,0.48,0.36],
  [0.66,0.47,0.34],
  [0.64,0.45,0.32],
  [0.63,0.43,0.3],
  [0.62,0.42,0.28],
  [0.61,0.4,0.27],
  [0.6,0.39,0.24],
  [0.59,0.38,0.21],
  [0.58,0.37,0.18],
  [0.58,0.36,0.14],
  [0.57,0.35,0.12],
  [0.56,0.34,0.08],
  [0.56,0.33,0.05],
  [0.55,0.33,0.03],
  [0.55,0.33,0.02],
  [0.54,0.33,0.01],
  [0.54,0.33,0.02],
  [0.54,0.33,0.02],
  [0.53,0.32,0.02],
  [0.6,0.41,0.1],
  [0.64,0.5,0.26],
  [0.66,0.52,0.31],
  [0.65,0.51,0.31],
  [0.64,0.5,0.31],
  [0.64,0.49,0.3],
  [0.64,0.5,0.31],
  [0.64,0.51,0.31],
  [0.64,0.5,0.3],
  [0.63,0.49,0.3],
  [0.64,0.55,0.35],
  [0.63,0.57,0.38],
  [0.63,0.57,0.37],
  [0.62,0.56,0.36],
  [0.61,0.55,0.36],
  [0.6,0.54,0.37],
  [0.65,0.59,0.44],
  [0.68,0.62,0.46],
  [0.68,0.63,0.47],
  [0.67,0.63,0.47],
  [0.66,0.62,0.46],
  [0.65,0.61,0.45],
  [0.65,0.6,0.44],
  [0.63,0.59,0.43],
  [0.62,0.57,0.41],
  [0.61,0.56,0.39],
  [0.6,0.54,0.36],
  [0.59,0.53,0.34],
  [0.58,0.51,0.33],
  [0.58,0.5,0.33],
  [0.57,0.49,0.3],
  [0.56,0.47,0.28],
  [0.55,0.46,0.25],
  [0.55,0.45,0.25],
  [0.55,0.43,0.22],
  [0.55,0.42,0.19],
  [0.54,0.41,0.15],
  [0.54,0.4,0.12],
  [0.54,0.39,0.1],
  [0.53,0.37,0.08],
  [0.53,0.36,0.07],
  [0.53,0.35,0.06],
  [0.53,0.34,0.09],
  [0.53,0.34,0.09],
  [0.52,0.33,0.08],
  [0.52,0.32,0.07],
  [0.52,0.32,0.04],
  [0.52,0.32,0.03],
  [0.53,0.31,0.03],
  [0.52,0.3,0.02],
  [0.53,0.3,0.02],
  [0.53,0.31,0.02],
  [0.53,0.3,0.03],
  [0.53,0.31,0.02],
  [0.54,0.35,0.08],
  [0.61,0.51,0.22],
  [0.63,0.54,0.24],
  [0.64,0.6,0.26],
  [0.66,0.64,0.3],
  [0.68,0.65,0.35],
  [0.69,0.65,0.37],
  [0.69,0.64,0.37],
  [0.68,0.64,0.36],
  [0.68,0.63,0.34],
  [0.67,0.62,0.31],
  [0.66,0.61,0.28],
  [0.66,0.61,0.26],
  [0.66,0.61,0.26],
  [0.66,0.61,0.27],
  [0.65,0.6,0.27],
  [0.65,0.61,0.27],
  [0.67,0.62,0.32],
  [0.68,0.63,0.41],
  [0.69,0.64,0.4],
  [0.69,0.64,0.39],
  [0.68,0.64,0.37],
  [0.67,0.63,0.35],
  [0.66,0.62,0.38],
  [0.65,0.6,0.37],
  [0.64,0.59,0.35],
  [0.63,0.57,0.33],
  [0.62,0.56,0.3],
  [0.61,0.54,0.27],
  [0.6,0.53,0.24],
  [0.59,0.51,0.21],
  [0.58,0.5,0.16],
  [0.57,0.48,0.14],
  [0.57,0.47,0.11],
  [0.56,0.45,0.1],
  [0.55,0.43,0.08],
  [0.54,0.42,0.07],
  [0.55,0.41,0.07],
  [0.54,0.4,0.06],
  [0.54,0.38,0.05],
  [0.54,0.37,0.05],
  [0.54,0.36,0.05],
  [0.53,0.35,0.04],
  [0.54,0.34,0.04],
  [0.54,0.34,0.04],
  [0.53,0.33,0.03],
  [0.53,0.33,0.03],
  [0.52,0.32,0.03],
  [0.53,0.32,0.02],
  [0.53,0.32,0.01],
  [0.54,0.32,0.02],
  [0.53,0.32,0.02],
  [0.52,0.31,0.02],
  [0.53,0.31,0.01],
  [0.52,0.31,0.01],
  [0.52,0.31,0.01],
  [0.51,0.31,0.02],
  [0.52,0.31,0.01],
  [0.53,0.31,0.01],
  [0.53,0.3,0.02],
  [0.53,0.3,0.02],
  [0.52,0.3,0.03],
  [0.53,0.3,0.03],
  [0.53,0.3,0.03],
  [0.52,0.3,0.03],
  [0.52,0.29,0.02],
];
