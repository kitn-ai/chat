/**
 * A real recorded voice, baked into a short seamless loop for the
 * `speaking` tiles in the stories -- the genuine article, not a generator.
 *
 * Real voice, recorded by the project owner: "This is a test, testing one
 * two three, hello world." Captured mono at 44.1kHz, then extracted through
 * the component's ALIGNED analysis chain -- the same values upstream
 * LiveKit's components run: AnalyserNode fftSize 2048 / smoothing 0.8,
 * window bins 100-200 (the components' own loPass/hiPass; see DEFAULTS in
 * primitives/use-audio-analysis.ts), `reduceToBands`' linear-proportional
 * split as it exists in THIS tree, ~32ms cadence. Third bake of this
 * fixture: the first was 5 linear bands over a wide raw-mic window
 * (bins 4-120), the second 3 geometric bands over the same wide window;
 * both predate the pipeline realignment that reverted window and split to
 * upstream's.
 *
 * GAIN: the raw take is boosted 8x (+18dB) through a GainNode before the
 * analysers -- an honest approximation of capture-side AGC, which every
 * real input to the aligned window gets (LiveKit captures local mics with
 * autoGainControl on; the mic stories request the same) but this recording,
 * made raw, never had. Un-gained, quiet natural-volume speech sits at or
 * under the -100dB floor across bins 100-200 and the loop's time-averaged
 * band profile comes out flat-to-inverted (edges louder than centre);
 * measured at +18dB the bake hits the live-AGC targets: speech-active
 * volume through the aligned byte path (minDecibels -100 / maxDecibels
 * -80) averages 0.73, no speech frame reads all-zero bands, and the
 * time-averaged mirrored md profile is centre-strictly-max --
 * [0.41, 0.42, 0.44, 0.42, 0.41]. The trade, recorded honestly: +18dB also
 * lifts part of the room tone over the floor, so rest frames idle near
 * [0.2, 0.04, 0] instead of the exact zeros an un-gained bake would show
 * -- which is also what a real AGC mic does between words.
 *
 * 3 bands per frame is HALF width on purpose: `Math.ceil(count / 2)`, the
 * exact band count the component itself requests at `md` before mirroring
 * (see `bandCount()` in index.tsx). The `bands` prop is a raw passthrough
 * by contract, so the stories mirror these half bands out to the full
 * element count themselves through `mirrorBandsCenterOut` /
 * `mirrorBandsAroundRing` -- the same primitives the live-audio path runs.
 * See `useVoiceBands` in the stories file.
 *
 * Trimmed to the same 196-frame window (~6.4s) as the previous bake:
 * about half a second of rest before the first word, just under a second
 * after the last, and BOTH natural pauses in the middle -- one short gap
 * around "test," / "testing", the longer one after "three," before
 * "hello" -- since those are what prove the visualizer falls back to rest
 * and recovers. Loops by wrapping frame 195 back to frame 0. Re-verified
 * at the aligned values: the endpoints differ by 0.034 pre-quantization
 * ([0.22,0.05,0] vs [0.2,0.03,0] after it), which sits between the median
 * (0.025) and p90 (0.053) of ADJACENT quiet frames' natural motion at this
 * gain -- the wrap step is indistinguishable from ordinary idle flicker.
 * (The previous bake's endpoints quantized identical, but only because its
 * un-gained rest frames were all zeros -- trivial, not preserved here.)
 *
 * Quantized to 2 decimals. Playback treats the cadence as a flat
 * `VOICE_FRAME_MS`; the capture's real ticks land at 32-33ms (setTimeout
 * jitter), a ~2% difference nobody can see. Body is ~3.8KB.
 */
export const VOICE_FRAME_MS = 32;

export const VOICE_BANDS: readonly (readonly number[])[] = [
  [0.22,0.05,0],
  [0.21,0.04,0],
  [0.2,0.04,0],
  [0.22,0.03,0],
  [0.23,0.03,0],
  [0.22,0.02,0],
  [0.21,0.02,0],
  [0.22,0.02,0],
  [0.22,0.11,0.01],
  [0.22,0.14,0.02],
  [0.23,0.13,0.01],
  [0.45,0.45,0.57],
  [0.52,0.52,0.61],
  [0.62,0.61,0.64],
  [0.64,0.62,0.65],
  [0.64,0.63,0.65],
  [0.63,0.63,0.66],
  [0.62,0.62,0.65],
  [0.61,0.61,0.65],
  [0.61,0.61,0.65],
  [0.65,0.63,0.67],
  [0.67,0.63,0.67],
  [0.66,0.62,0.66],
  [0.65,0.61,0.65],
  [0.64,0.59,0.64],
  [0.63,0.58,0.62],
  [0.62,0.59,0.61],
  [0.61,0.61,0.6],
  [0.62,0.62,0.59],
  [0.61,0.62,0.59],
  [0.59,0.61,0.57],
  [0.59,0.61,0.59],
  [0.59,0.62,0.64],
  [0.59,0.62,0.66],
  [0.61,0.62,0.66],
  [0.61,0.61,0.65],
  [0.61,0.6,0.64],
  [0.6,0.59,0.63],
  [0.59,0.57,0.62],
  [0.58,0.56,0.6],
  [0.61,0.59,0.6],
  [0.62,0.59,0.6],
  [0.61,0.58,0.58],
  [0.59,0.57,0.57],
  [0.58,0.56,0.55],
  [0.6,0.57,0.56],
  [0.62,0.58,0.56],
  [0.63,0.58,0.57],
  [0.64,0.58,0.56],
  [0.64,0.58,0.55],
  [0.63,0.57,0.54],
  [0.63,0.56,0.54],
  [0.62,0.54,0.52],
  [0.61,0.53,0.51],
  [0.59,0.51,0.49],
  [0.58,0.49,0.47],
  [0.56,0.47,0.45],
  [0.54,0.46,0.43],
  [0.53,0.48,0.42],
  [0.52,0.47,0.4],
  [0.5,0.45,0.37],
  [0.48,0.43,0.35],
  [0.46,0.41,0.32],
  [0.45,0.39,0.3],
  [0.43,0.37,0.26],
  [0.41,0.35,0.23],
  [0.4,0.34,0.22],
  [0.38,0.33,0.18],
  [0.37,0.31,0.16],
  [0.38,0.32,0.21],
  [0.37,0.31,0.19],
  [0.36,0.28,0.16],
  [0.46,0.41,0.37],
  [0.5,0.49,0.52],
  [0.51,0.53,0.58],
  [0.51,0.54,0.6],
  [0.51,0.55,0.62],
  [0.52,0.56,0.63],
  [0.51,0.56,0.63],
  [0.51,0.56,0.63],
  [0.5,0.56,0.64],
  [0.51,0.56,0.64],
  [0.53,0.59,0.64],
  [0.55,0.6,0.64],
  [0.55,0.6,0.63],
  [0.53,0.58,0.61],
  [0.54,0.59,0.62],
  [0.56,0.59,0.65],
  [0.61,0.63,0.68],
  [0.63,0.64,0.69],
  [0.63,0.65,0.68],
  [0.63,0.64,0.67],
  [0.62,0.63,0.66],
  [0.61,0.61,0.65],
  [0.6,0.61,0.65],
  [0.59,0.6,0.65],
  [0.58,0.59,0.66],
  [0.56,0.58,0.65],
  [0.55,0.57,0.64],
  [0.54,0.58,0.65],
  [0.54,0.57,0.65],
  [0.53,0.56,0.64],
  [0.52,0.54,0.62],
  [0.5,0.52,0.61],
  [0.48,0.51,0.59],
  [0.47,0.49,0.58],
  [0.46,0.47,0.56],
  [0.44,0.46,0.55],
  [0.42,0.44,0.53],
  [0.4,0.41,0.51],
  [0.39,0.39,0.49],
  [0.37,0.37,0.47],
  [0.36,0.35,0.45],
  [0.34,0.34,0.43],
  [0.36,0.37,0.42],
  [0.35,0.37,0.4],
  [0.33,0.35,0.38],
  [0.32,0.33,0.36],
  [0.3,0.3,0.33],
  [0.29,0.28,0.31],
  [0.27,0.26,0.28],
  [0.26,0.24,0.26],
  [0.25,0.21,0.22],
  [0.24,0.19,0.19],
  [0.25,0.23,0.21],
  [0.35,0.38,0.36],
  [0.39,0.5,0.46],
  [0.39,0.52,0.48],
  [0.4,0.53,0.49],
  [0.47,0.6,0.55],
  [0.52,0.62,0.58],
  [0.55,0.63,0.58],
  [0.56,0.63,0.58],
  [0.54,0.62,0.57],
  [0.53,0.6,0.55],
  [0.52,0.59,0.54],
  [0.5,0.57,0.52],
  [0.49,0.56,0.5],
  [0.47,0.55,0.49],
  [0.46,0.53,0.47],
  [0.44,0.52,0.45],
  [0.43,0.51,0.46],
  [0.51,0.54,0.54],
  [0.54,0.55,0.55],
  [0.53,0.56,0.54],
  [0.52,0.57,0.54],
  [0.51,0.57,0.53],
  [0.53,0.59,0.56],
  [0.52,0.58,0.56],
  [0.51,0.57,0.55],
  [0.49,0.55,0.54],
  [0.48,0.54,0.52],
  [0.46,0.52,0.51],
  [0.44,0.5,0.49],
  [0.43,0.49,0.47],
  [0.41,0.47,0.45],
  [0.39,0.46,0.43],
  [0.37,0.44,0.41],
  [0.36,0.42,0.39],
  [0.34,0.4,0.36],
  [0.32,0.37,0.34],
  [0.31,0.35,0.32],
  [0.3,0.33,0.29],
  [0.28,0.31,0.26],
  [0.27,0.29,0.23],
  [0.27,0.27,0.22],
  [0.26,0.25,0.18],
  [0.25,0.23,0.15],
  [0.24,0.2,0.13],
  [0.23,0.18,0.09],
  [0.23,0.16,0.07],
  [0.23,0.14,0.04],
  [0.22,0.11,0.03],
  [0.22,0.09,0.02],
  [0.2,0.07,0.01],
  [0.2,0.04,0.01],
  [0.18,0.03,0.01],
  [0.18,0.02,0.01],
  [0.19,0.02,0],
  [0.19,0.01,0],
  [0.19,0.01,0],
  [0.17,0.01,0],
  [0.19,0.01,0],
  [0.18,0.07,0],
  [0.21,0.06,0],
  [0.21,0.06,0],
  [0.22,0.05,0],
  [0.2,0.03,0],
  [0.2,0.02,0],
  [0.19,0.01,0],
  [0.19,0.01,0],
  [0.2,0.01,0],
  [0.2,0,0],
  [0.19,0,0],
  [0.18,0,0],
  [0.2,0.03,0],
];
