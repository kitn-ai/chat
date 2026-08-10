import { describe, it, expect } from 'vitest';
import {
  normalizeDb,
  reduceToBands,
  reduceToVolume,
  normalizeVolumeBands,
  mirrorBandsCenterOut,
  mirrorBandsAroundRing,
} from './audio-bands';

describe('normalizeDb', () => {
  it('maps silence to 0', () => {
    expect(normalizeDb(-Infinity)).toBe(0);
  });
  it('maps the floor (-100 dB) to 0', () => {
    expect(normalizeDb(-100)).toBeCloseTo(0, 6);
  });
  it('maps the ceiling (-10 dB) to sqrt(0.9)', () => {
    expect(normalizeDb(-10)).toBeCloseTo(Math.sqrt(0.9), 6);
  });
  it('clamps values above the ceiling', () => {
    expect(normalizeDb(0)).toBeCloseTo(normalizeDb(-10), 6);
  });
  it('clamps values below the floor', () => {
    expect(normalizeDb(-200)).toBeCloseTo(normalizeDb(-100), 6);
  });
  it('is monotonically increasing across the range', () => {
    expect(normalizeDb(-80)).toBeLessThan(normalizeDb(-40));
  });
});

describe('reduceToBands', () => {
  it('returns exactly `bands` entries', () => {
    const freq = new Float32Array(1024).fill(-50);
    expect(reduceToBands(freq, 5, 100, 200)).toHaveLength(5);
  });
  it('returns a uniform value for a flat spectrum', () => {
    const freq = new Float32Array(1024).fill(-50);
    const out = reduceToBands(freq, 4, 100, 200);
    const expected = normalizeDb(-50);
    out.forEach((v) => expect(v).toBeCloseTo(expected, 6));
  });
  it('returns all zeros for a silent spectrum', () => {
    const freq = new Float32Array(1024).fill(-Infinity);
    expect(reduceToBands(freq, 3, 100, 200)).toEqual([0, 0, 0]);
  });
  it('splits linear-proportionally -- upstream LiveKit\'s distribution, not the former geometric spacing', () => {
    // Upstream's useMultibandTrackVolume (useTrackVolume.ts:141-153, the
    // proportional chunking from their PR #1265): every band gets
    // floor(total/bands)-ish CONSECUTIVE bins of equal width. For 2 bands
    // over [100, 400] the boundary sits at bin 250 (100 + 300/2). Loading
    // exactly bins 100..199 loud leaves band 0 with 100 loud + 50 silent
    // bins -> two thirds of normalizeDb(-10) -- while the former GEOMETRIC
    // split (boundary at 100 * (400/100)^(1/2) = 200) put all 100 loud bins
    // alone in band 0, reading the full normalizeDb(-10). The exact
    // two-thirds value is what tells the two apart.
    const freq = new Float32Array(1024).fill(-Infinity);
    for (let i = 100; i < 200; i++) freq[i] = -10;
    const [lo, hi] = reduceToBands(freq, 2, 100, 400);
    expect(lo).toBeCloseTo((100 * normalizeDb(-10)) / 150, 6);
    expect(hi).toBeCloseTo(0, 6);
  });

  it('gives every band an equal consecutive slice over the default window: 100 bins / 5 bands = 20 bins each', () => {
    // Fill only the FIRST 20-bin slice (bins 100-119) loud. Linear
    // proportional: band 0 reads full normalizeDb(-10), bands 1-4 exactly 0.
    // The former geometric split would have put its band-0/1 edge at bin
    // 115 (100 * 2^(1/5)), bleeding bins 115-119 into band 1 -- band 1
    // reading ~0.28, not 0. That non-zero bleed is what this test fails on
    // against the geometric implementation.
    const freq = new Float32Array(1024).fill(-Infinity);
    for (let i = 100; i < 120; i++) freq[i] = -10;
    const bands = reduceToBands(freq, 5, 100, 200);
    expect(bands[0]).toBeCloseTo(normalizeDb(-10), 6);
    expect(bands.slice(1)).toEqual([0, 0, 0, 0]);
  });
  it('yields zeros when the pass window is empty', () => {
    const freq = new Float32Array(1024).fill(-50);
    expect(reduceToBands(freq, 3, 200, 200)).toEqual([0, 0, 0]);
  });
  it('yields zeros when hiPass is below loPass', () => {
    const freq = new Float32Array(1024).fill(-50);
    expect(reduceToBands(freq, 2, 300, 100)).toEqual([0, 0]);
  });
  it('handles a single band', () => {
    const freq = new Float32Array(1024).fill(-50);
    expect(reduceToBands(freq, 1, 100, 200)).toHaveLength(1);
  });
  it('handles more bands than available bins without producing NaN', () => {
    const freq = new Float32Array(1024).fill(-50);
    const out = reduceToBands(freq, 20, 100, 105);
    expect(out).toHaveLength(20);
    out.forEach((v) => expect(Number.isNaN(v)).toBe(false));
  });
});

describe('reduceToBands against a real recorded voice clip', () => {
  // Every other test in this file drives reduceToBands with a synthetic
  // .fill(...) spectrum. These three are real getFloatFrequencyData frames,
  // captured through an actual AudioContext + AnalyserNode (fftSize 2048,
  // smoothingTimeConstant 0.8, matching useAudioAnalysis's bands analyser)
  // decoding a real recorded clip: "this is a test, testing one two three,
  // hello world". Values are unmodified except rounded to 1 decimal and
  // trimmed to bins 0-199 -- exactly covering the default window's hiPass
  // of 200 AND the raw-input opt-in's 120, so the same frame is checked
  // against both windows below. The capture methodology is in
  // .superpowers/sdd/2026-08-07-audio-visualizers/task-3-report.md; the
  // window default's history (wide 4-120 for raw mics, reverted to
  // upstream's 100-200 after the noise-floor diagnosis) lives in
  // use-audio-analysis.ts's DEFAULTS docstring.

  // t=0.04s: before the clip's audio had reached the analyser. Every bin
  // reads -Infinity in the raw capture -- confirmed, not assumed.
  const SILENT_FRAME = new Float32Array(200).fill(-Infinity);

  // t=4.08s, a loud moment ("test"). All five bands land with real energy
  // and a clear low-to-high falloff.
  const SPEECH_LOUD_FRAME = new Float32Array([
    -79, -65.9, -59.2, -56.7, -51.5, -51.2, -57.5, -62.3, -51.8, -48.6, -53.5, -63.6, -60.9, -58.3, -59.6,
    -65.1, -67.5, -66.3, -69, -75, -77.4, -71.5, -67.1, -68.8, -75.4, -76.4, -70.7, -69.1, -74.8, -82.8,
    -76.4, -70.6, -71.5, -76.2, -77.8, -72.1, -70.3, -74.6, -80.6, -80, -75, -74.4, -77.2, -82.6, -82.4,
    -79.6, -80.7, -84.8, -86.1, -80.4, -79.3, -82.9, -86.5, -80.7, -78.7, -80.3, -82.3, -83.9, -81.7, -82.4,
    -87.4, -94.8, -87.1, -84.7, -85.7, -88, -85.4, -81.6, -81.9, -84.4, -89, -87.8, -85.8, -84.4, -82.6,
    -81.2, -80.6, -82.1, -85.6, -89, -87.1, -84.7, -86.9, -88.9, -85.3, -83.5, -86.8, -92.6, -90.1, -84.5,
    -84.4, -86, -86.2, -83.2, -81.5, -83.6, -85, -81.6, -79.8, -83, -85.6, -88.2, -83.9, -83.7, -86.8,
    -88.9, -85, -81.8, -83.4, -86.4, -88.2, -87.6, -85.2, -85.8, -87.1, -87.6, -87.5, -87.2, -89.1, -83.6,
    -83.1, -80.9, -79.4, -76.6, -76.9, -77.9, -78.1, -76.5, -74.9, -75.3, -77.4, -81.6, -78.9, -77.6, -77.8,
    -80.1, -82.7, -83.5, -82, -81.8, -86.3, -84.1, -80.4, -79.6, -81.2, -80.8, -79.7, -77.8, -79.5, -82.3,
    -80.3, -78.5, -79.4, -82.9, -84.8, -83.1, -81.8, -81.7, -81.5, -80.8, -77, -73.8, -74.4, -78.7, -72.9,
    -70.7, -73, -72.2, -69.9, -68.8, -69.3, -69.5, -69.6, -69.4, -70.3, -69.7, -69.9, -67.7, -65.8, -66.6,
    -68.5, -70.1, -72.4, -77.4, -79.9, -77.2, -76.2, -77, -79.7, -78.8, -78, -79.5, -76, -73.6, -74,
    -76, -76.4, -76.4, -71.5, -74.5,
  ]);

  // t=1.03s and t=3.05s: him actually talking ("this is a test...") at a
  // natural, non-shouted volume -- exactly the frames the owner's report
  // flagged: real speech that the OLD default window (100, 200) reads as
  // total silence.
  const SPEECH_QUIET_FRAME_A = new Float32Array([
    -76.3, -65.7, -59.3, -59.4, -64.1, -64.5, -65.8, -72.3, -79.8, -79.5, -77.9, -73.8, -75.4, -81.2, -85.2,
    -85.2, -85, -85.5, -88.5, -91.8, -91.9, -93.9, -94.3, -93.8, -89.1, -86.4, -85.5, -87.7, -92.5, -95.2,
    -94.6, -93.7, -94.1, -95.6, -96.7, -96.7, -97.5, -97.3, -98.4, -99.5, -98, -98.2, -98, -100.5, -101.2,
    -99.3, -98.6, -100.5, -99.8, -99.7, -101.8, -101.6, -100.4, -99.5, -102, -101, -99.2, -98.7, -99.7, -102,
    -102.5, -104.4, -104.3, -105, -103.2, -101.6, -104.7, -104.5, -101.9, -102.5, -102.8, -100.7, -102.8, -103.2, -103.4,
    -104.6, -105.3, -105.3, -108.1, -107, -105.1, -104.8, -106, -105.7, -107.2, -108.7, -106.9, -108, -108, -107.9,
    -108, -109.2, -108.1, -109.7, -106.6, -105.3, -107.6, -109.7, -109.6, -109.1, -110.7, -111, -110.5, -109.6, -108.9,
    -109.3, -110.1, -112, -110, -108.5, -110.4, -114, -111.4, -111.1, -112.6, -114.7, -113.3, -112.5, -116.9, -115.4,
    -113.8, -113.3, -113.5, -115.5, -116.5, -118.2, -117.3, -115.6, -119.3, -118.9, -116.7, -114.5, -115.9, -114, -111.8,
    -111.8, -113.6, -115.9, -115.4, -114.1, -113.8, -116.2, -117.9, -118.3, -118.5, -118.3, -117.7, -119.3, -119.7, -119.8,
    -121, -120.4, -120, -121, -122.7, -122.1, -118.7, -118.1, -118.9, -120.7, -120.2, -118.3, -121.2, -122.7, -121.2,
    -121.6, -120.2, -121, -121.3, -121, -123.3, -122.7, -121.7, -121.1, -121, -122.9, -121.6, -122.5, -121.6, -121.4,
    -121.2, -121.4, -124.3, -125.2, -124.8, -124.4, -123.2, -122.1, -122.4, -123.5, -122.1, -123.2, -123.3, -124.2, -125.8,
    -125, -121.7, -123.2, -123.9, -124.9,
  ]);
  const SPEECH_QUIET_FRAME_B = new Float32Array([
    -88.1, -71.4, -62.3, -61.2, -65.7, -65.1, -65.7, -72.5, -78.6, -80.4, -77, -74.3, -77.4, -82.2, -87.6,
    -86.6, -85.5, -86.3, -88.3, -90, -89.7, -88.4, -89.2, -91, -91.7, -89.1, -86.6, -88.2, -93.5, -94.9,
    -95.4, -96.3, -94.5, -96.2, -97.2, -95.8, -95, -96.8, -98.6, -98.5, -98.1, -98.2, -95.8, -97.4, -99.6,
    -100.8, -100.9, -98.2, -99.4, -100.2, -99.8, -100.4, -99.7, -100.4, -102.6, -101.4, -101.8, -104.2, -103.9, -103.4,
    -102.9, -103.4, -103.2, -102.6, -103, -105.6, -104, -103.1, -104.4, -105.8, -103.4, -100.8, -102, -105.6, -105.6,
    -105.3, -104.1, -103.4, -104.7, -107.5, -104.7, -103.7, -106.2, -106.5, -105.1, -105.7, -108.9, -111, -109.9, -110,
    -109.3, -109.9, -109.9, -110.6, -110.9, -110.6, -108.8, -109.1, -110.6, -111, -110.9, -110.2, -110.6, -111.2, -113.5,
    -112, -111.5, -111.2, -111.4, -111.5, -110.6, -110.8, -111.8, -110.8, -111.4, -111.6, -110.4, -110.5, -111.2, -111.8,
    -113.8, -114.6, -113.1, -112.2, -113.3, -116.5, -114.7, -114.9, -114.7, -115.2, -116.5, -113.6, -111.5, -112.1, -112.7,
    -113.8, -116.2, -118.5, -114.5, -114, -115.7, -117.5, -119.6, -119.1, -119.4, -121.9, -121.5, -121.7, -120.9, -120.1,
    -120.7, -119.4, -118.4, -120.2, -121.8, -120.6, -121, -121.7, -120, -118.8, -118.1, -121.2, -118.9, -118.8, -119.9,
    -123.3, -121.3, -120.9, -120.8, -120.8, -120.8, -121.8, -121, -120.6, -121.3, -120.1, -121.2, -124.4, -123.2, -122.3,
    -121.1, -120.9, -119.3, -119.8, -122.3, -122.9, -121.8, -121.2, -119.7, -120.7, -124.8, -126.4, -126.2, -124.2, -124.2,
    -123.5, -124, -125, -124.1, -123.9,
  ]);

  it('reads genuine silence as all-zero bands, with the default window (100, 200)', () => {
    expect(reduceToBands(SILENT_FRAME, 5, 100, 200)).toEqual([0, 0, 0, 0, 0]);
  });

  it('produces non-zero bands on every band from a loud real speech frame, with the default window (100, 200)', () => {
    // Consonants and sibilance put real energy across 2-4kHz on a loud
    // frame: every 20-bin chunk of this one sits well above the -100dB
    // floor. NO tilt assertion here on purpose: through the sibilance
    // window the loudest band varies frame to frame (this frame peaks
    // around bins 160-180, band 3) -- the low-to-high falloff that made
    // band 0 reliably loudest was a property of the wide 4-120 window, not
    // of speech through this one.
    const bands = reduceToBands(SPEECH_LOUD_FRAME, 5, 100, 200);
    bands.forEach((v) => expect(v).toBeGreaterThan(0));
  });

  it('reads quiet natural-volume speech as total silence through the default window: the noise gate, and its cost, pinned exactly', () => {
    // These two frames are him actually talking, unshouted. Through bins
    // 100-200 every bin sits at or below the -100dB floor, so the DEFAULT
    // window reads them as all-zero -- the same mechanism that keeps idle
    // room tone perfectly still (the -100dB floor + the high narrow window
    // IS upstream's noise gate; there is no explicit gate in the pipeline).
    // This is the documented trade of matching upstream: raw, un-gained
    // input needs either processed capture (AGC and friends -- what the mic
    // stories request) or the wide opt-in window below.
    for (const frame of [SPEECH_QUIET_FRAME_A, SPEECH_QUIET_FRAME_B]) {
      expect(reduceToBands(frame, 5, 100, 200)).toEqual([0, 0, 0, 0, 0]);
    }
  });

  it('still reads those same quiet frames through the documented raw-input opt-in window (4, 120)', () => {
    // The opt-in's whole justification: the fundamental + first two
    // formants carry real energy at natural volume even when 2-4kHz has
    // none. Some higher bands legitimately read 0 here -- the guard is "no
    // all-zero FRAME through the opt-in", not "no zero band".
    for (const frame of [SPEECH_QUIET_FRAME_A, SPEECH_QUIET_FRAME_B]) {
      const bands = reduceToBands(frame, 5, 4, 120);
      expect(bands.some((v) => v > 0)).toBe(true);
      expect(bands[0]).toBeGreaterThan(bands[bands.length - 1] as number);
    }
  });

  // The full pipeline a variant actually sees: request ceil(n/2) bands, then
  // mirror them centre-out to n visual elements. Symmetry is the mirror's
  // contract and survives any window; which band lands loudest does NOT --
  // through the sibilance window the per-frame peak moves around, so this
  // asserts shape symmetry and liveness, not a centre-max ordering (that
  // ordering is a time-averaged property of real speech, checked against
  // the baked fixture and the e2e band-shape spec, not per frame).
  it('combined with mirrorBandsCenterOut: a loud real speech frame maps to a symmetric, fully lit centre-out shape', () => {
    // n=8 visual elements -> ceil(8/2)=4 half-bands.
    const half = reduceToBands(SPEECH_LOUD_FRAME, 4, 100, 200);
    const shape = mirrorBandsCenterOut(half, 8);
    for (let i = 0; i < 4; i++) expect(shape[i]).toBe(shape[7 - i]);
    shape.forEach((v) => expect(v).toBeGreaterThan(0));
    // Not a flat line either: the mirror preserves real per-band contrast.
    expect(new Set(shape.map((v) => v.toFixed(6))).size).toBeGreaterThan(1);
  });
});

describe('reduceToVolume', () => {
  it('returns 0 for silence', () => {
    expect(reduceToVolume(new Uint8Array(64))).toBe(0);
  });
  it('returns 1 for a fully saturated spectrum', () => {
    expect(reduceToVolume(new Uint8Array(64).fill(255))).toBeCloseTo(1, 6);
  });
  it('returns the RMS, not the mean', () => {
    // half at 255, half at 0. mean would be 0.5; RMS is sqrt(0.5).
    const bytes = new Uint8Array(64);
    bytes.fill(255, 0, 32);
    expect(reduceToVolume(bytes)).toBeCloseTo(Math.sqrt(0.5), 6);
  });
  it('returns 0 for an empty buffer rather than NaN', () => {
    expect(reduceToVolume(new Uint8Array(0))).toBe(0);
  });
});

describe('normalizeVolumeBands', () => {
  it('passes through when the length already matches', () => {
    expect(normalizeVolumeBands([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });
  it('trims from the end when too long', () => {
    expect(normalizeVolumeBands([1, 2, 3, 4], 2)).toEqual([1, 2]);
  });
  it('pads by repeating the last value when too short', () => {
    expect(normalizeVolumeBands([1, 2], 4)).toEqual([1, 2, 2, 2]);
  });
  it('pads an empty array with zeros', () => {
    expect(normalizeVolumeBands([], 3)).toEqual([0, 0, 0]);
  });
});

describe('mirrorBandsCenterOut', () => {
  it('mirrors band 0 onto the exact centre for an odd count', () => {
    // count=5, centre index 2. half=[a,b,c] (ceil(5/2)=3).
    expect(mirrorBandsCenterOut(['a', 'b', 'c'] as unknown as number[], 5)).toEqual([
      'c', 'b', 'a', 'b', 'c',
    ]);
  });

  it('mirrors band 0 onto a shared centre PAIR for an even count', () => {
    // count=6, centre pair at indices 2 and 3. half=[a,b,c] (ceil(6/2)=3).
    expect(mirrorBandsCenterOut(['a', 'b', 'c'] as unknown as number[], 6)).toEqual([
      'c', 'b', 'a', 'a', 'b', 'c',
    ]);
  });

  it('is symmetric about the centre for any count', () => {
    const half = [0.9, 0.6, 0.4, 0.2, 0.1];
    for (const count of [7, 8, 9, 10]) {
      const out = mirrorBandsCenterOut(half, count);
      for (let i = 0; i < count; i++) expect(out[i]).toBe(out[count - 1 - i]);
    }
  });

  it('puts the loudest value at the centre and the quietest at both ends', () => {
    const half = [0.9, 0.6, 0.4, 0.2]; // descending: band 0 loudest
    const out = mirrorBandsCenterOut(half, 8);
    const centerPair = [out[3], out[4]];
    expect(centerPair).toEqual([0.9, 0.9]);
    expect(out[0]).toBe(0.2);
    expect(out[7]).toBe(0.2);
  });

  it('degrades sanely when halfBands is shorter than the count needs: repeats the last value rather than reading undefined', () => {
    const out = mirrorBandsCenterOut([0.5], 6);
    expect(out).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  });
});

describe('mirrorBandsAroundRing', () => {
  it('gives index 0 its own value (a fixed point of the reflection)', () => {
    const out = mirrorBandsAroundRing([0.9, 0.6, 0.4, 0.2], 8);
    expect(out[0]).toBe(0.9);
  });

  it('is symmetric across the vertical axis: index i and count-i share a value', () => {
    const half = [0.9, 0.6, 0.4, 0.2];
    for (const count of [6, 8, 10]) {
      const out = mirrorBandsAroundRing(half, count);
      for (let i = 1; i < count; i++) expect(out[i]).toBe(out[(count - i) % count]);
    }
  });

  it('spikes vary in length, not moving as one: at least two distinct values around the ring', () => {
    const out = mirrorBandsAroundRing([0.9, 0.6, 0.4, 0.2], 8);
    expect(new Set(out).size).toBeGreaterThan(1);
  });

  it('clamps the antipodal index for an even count to the last available band, rather than reading undefined', () => {
    // count=8 needs rings 0..4 (5 distinct values); only 4 are provided
    // (ceil(8/2)), so index 4 (the antipode of index 0) shares band 3's
    // value with its neighbours instead of getting its own.
    const out = mirrorBandsAroundRing([0.9, 0.6, 0.4, 0.2], 8);
    expect(out[4]).toBe(0.2);
    expect(out[3]).toBe(0.2);
  });
});
