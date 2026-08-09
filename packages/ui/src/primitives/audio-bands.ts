/**
 * Pure reductions from AnalyserNode output to the numbers a visualizer draws.
 *
 * Ported from livekit/components-js `packages/react/src/hooks/useTrackVolume.ts`
 * (Apache License 2.0). The dB normalization curve is carried over verbatim
 * so our output matches theirs frame for frame. The band split is NOT: see
 * `reduceToBands` below for why it is deliberately geometric, not upstream's
 * proportional/linear split.
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
 *
 * DELIBERATE DIVERGENCE FROM UPSTREAM: bucket edges are spaced
 * GEOMETRICALLY across `[loPass, hiPass]`, not linearly (upstream's plain
 * proportional split, `loPass + i * width / bands`). A real voice's energy
 * falls off sharply with frequency (see the loPass/hiPass docs in
 * use-audio-analysis.ts), so equal-WIDTH linear buckets leave the higher,
 * already-quiet buckets almost no bins to average -- often reading a flat 0
 * through ordinary speech, verified on a real recorded clip (see this
 * primitive's task report). Geometric spacing gives band 0 a narrow slice
 * near `loPass` and widens every bucket after it, so the outer buckets have
 * enough real bins to move instead of sitting dead. This does NOT flatten
 * the tilt -- band 0 is still, correctly, usually the loudest -- it only
 * keeps the quieter bands alive instead of pinned at zero. Combine with
 * `mirrorBandsCenterOut`/`mirrorBandsAroundRing` below to turn that tilt
 * into a centre-out shape instead of a one-directional ramp.
 */
export function reduceToBands(
  freq: Float32Array,
  bands: number,
  loPass: number,
  hiPass: number,
): number[] {
  const lo = Math.max(0, loPass);
  const hi = Math.max(0, hiPass);
  if (hi <= lo) return new Array(bands).fill(0);

  // A geometric series needs a positive base: bin 0 (DC) cannot anchor a
  // ratio. loPass 0 is still a legal public option (the default is 4, not
  // 0), so this clamps the SERIES' base up to bin 1 rather than producing
  // NaN -- the bucket boundaries start one bin later than asked, nothing
  // else changes.
  const base = Math.max(1, lo);
  const out: number[] = [];

  for (let i = 0; i < bands; i++) {
    const start = Math.round(base * Math.pow(hi / base, i / bands));
    const end = Math.round(base * Math.pow(hi / base, (i + 1) / bands));
    // Clamp into the buffer and force at least one bin per bucket (a bucket
    // that rounds to zero width would otherwise divide by zero).
    const a = Math.min(start, freq.length - 1);
    const z = Math.max(a + 1, Math.min(end, freq.length));
    let sum = 0;
    for (let j = a; j < z; j++) sum += normalizeDb(freq[j] as number);
    out.push(sum / (z - a));
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

/**
 * Maps a smaller, ordered set of "half" band values (index 0 = loudest,
 * typically lowest frequency) onto `count` positions laid out in a straight
 * line -- a row of bars, or a row of grid columns -- centre-outward and
 * mirrored: band 0 lands on the centre (an odd `count`) or the centre PAIR
 * (an even one, both positions sharing band 0), band 1 on the pair either
 * side of that, and so on outward to the two ends.
 *
 * Every scripted state in this component is already centre-oriented
 * (`listening` blinks the centre bar, `connecting` sweeps inward from both
 * ends, `thinking` sweeps the middle row) -- `speaking` ramping left to
 * right, because it fed the analyser's raw band order straight across, was
 * the one state inconsistent with that. This closes that gap.
 *
 * `halfBands` should have exactly `Math.ceil(count / 2)` entries -- the
 * caller is responsible for requesting that many bands from
 * `useAudioAnalysis`, matching counts exactly rather than leaning on
 * `normalizeVolumeBands`'s pad-by-repeating-the-last-value, which would
 * produce a subtly wrong (not obviously broken) shape here. A shorter
 * `halfBands` still degrades sanely: the outermost positions repeat the last
 * value available rather than reading `undefined`.
 */
export function mirrorBandsCenterOut(halfBands: number[], count: number): number[] {
  const center = (count - 1) / 2;
  const out: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const ring = Math.floor(Math.abs(i - center));
    out[i] = halfBands[Math.min(ring, halfBands.length - 1)] ?? 0;
  }
  return out;
}

/**
 * Maps a smaller, ordered set of "half" band values onto `count` positions
 * arranged around a RING (radial's spokes), mirrored left-right across a
 * single vertical axis rather than fanned from a linear centre: index 0 and
 * index `count / 2` (for an even `count`; radial warns when `count` is not
 * divisible by 4, so this is the common case) are each their own fixed
 * point of the reflection and both land band 0, and every other index pairs
 * with its mirror partner at `count - i`, sharing a band.
 *
 * Radial's own geometry (`variant-radial.tsx`) places index 0 at the
 * BOTTOM of the ring (`rotate(0) translateY(radius)`, and CSS rotation is
 * clockwise for a positive angle), so band 0 (usually the loudest) reads at
 * the bottom, fading toward the top -- not band 0 at both the top AND the
 * bottom, which would need a second, horizontal mirror axis on top of this
 * one. Chosen over that fuller symmetry because it reuses the exact same
 * `Math.ceil(count / 2)` band request as the linear mirror above (one rule
 * for every variant, not a radial-specific band count), and because the
 * task's request was "spikes vary in length, not moving as one" -- this
 * already delivers that. If bottom-loud/top-quiet reads wrong in practice,
 * swapping to true 4-fold symmetry is a self-contained change here, not
 * elsewhere.
 *
 * For an even `count`, the antipodal index (`count / 2`) needs one more
 * distinct band than the linear mirror does (rings run 0..`count / 2`, not
 * 0..`count / 2 - 1`) -- with only `Math.ceil(count / 2)` bands available,
 * that one index clamps to the same value as its nearest neighbour rather
 * than getting a unique band. A minor, deliberate simplification for the
 * same one-rule-for-every-variant reason above.
 */
export function mirrorBandsAroundRing(halfBands: number[], count: number): number[] {
  const out: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const ring = Math.min(i, count - i);
    out[i] = halfBands[Math.min(ring, halfBands.length - 1)] ?? 0;
  }
  return out;
}
