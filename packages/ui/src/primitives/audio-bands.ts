/**
 * Pure reductions from AnalyserNode output to the numbers a visualizer draws.
 *
 * Ported from livekit/components-js `packages/react/src/hooks/useTrackVolume.ts`
 * (Apache License 2.0). The dB normalization curve and the proportional band
 * split are carried over verbatim so our output matches theirs frame for frame.
 */

/** dB floor of the normalization curve. Below this reads as silence. */
const MIN_DB = -100;
/** dB ceiling. Above this saturates. */
const MAX_DB = -10;

/**
 * Map one `getFloatFrequencyData` decibel value to 0..1.
 *
 * The `sqrt` at the end is a perceptual curve, not a normalization step: it
 * lifts quiet detail so low-level audio still moves the bars visibly.
 */
export function normalizeDb(value: number): number {
  if (value === -Infinity) return 0;
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, value));
  return Math.sqrt(1 - (clamped * -1) / 100);
}

/**
 * Average a slice of the frequency spectrum into `bands` buckets.
 *
 * `loPass` / `hiPass` are BIN INDICES relative to `fftSize`, not frequencies.
 * Upstream's naming is misleading; the behavior is a plain array slice.
 */
export function reduceToBands(
  freq: Float32Array,
  bands: number,
  loPass: number,
  hiPass: number,
): number[] {
  const window = freq.slice(Math.max(0, loPass), Math.max(0, hiPass));
  const total = window.length;
  const out: number[] = [];

  for (let i = 0; i < bands; i++) {
    // Proportional distribution: every bin lands in exactly one band, and the
    // remainder spreads instead of piling onto the last band.
    const start = Math.floor((i * total) / bands);
    const end = Math.floor(((i + 1) * total) / bands);
    let sum = 0;
    for (let j = start; j < end; j++) sum += normalizeDb(window[j] as number);
    out.push(end > start ? sum / (end - start) : 0);
  }

  return out;
}

/** Root-mean-square of `getByteFrequencyData`, scaled to 0..1. */
export function reduceToVolume(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    const a = bytes[i] as number;
    sum += a * a;
  }
  return Math.sqrt(sum / bytes.length) / 255;
}

/**
 * Resize a caller-supplied band array to exactly `count` entries. Extra values
 * are dropped; a short array repeats its last value (0 when empty) so a
 * consumer passing the wrong length gets a sane picture instead of holes.
 */
export function normalizeVolumeBands(bands: number[], count: number): number[] {
  if (bands.length === count) return bands;
  if (bands.length > count) return bands.slice(0, count);
  const last = bands[bands.length - 1] ?? 0;
  return [...bands, ...new Array(count - bands.length).fill(last)];
}
