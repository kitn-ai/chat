import { describe, it, expect } from 'vitest';
import { normalizeDb, reduceToBands, reduceToVolume, normalizeVolumeBands } from './audio-bands';

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
  it('splits proportionally so each band sees its own slice', () => {
    // bins 100..199. Load the first half loud, second half quiet.
    const freq = new Float32Array(1024).fill(-Infinity);
    for (let i = 100; i < 150; i++) freq[i] = -10;
    for (let i = 150; i < 200; i++) freq[i] = -100;
    const [lo, hi] = reduceToBands(freq, 2, 100, 200);
    expect(lo).toBeGreaterThan(hi);
    expect(lo).toBeCloseTo(normalizeDb(-10), 6);
    expect(hi).toBeCloseTo(0, 6);
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
