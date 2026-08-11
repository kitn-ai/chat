import { describe, it, expect } from 'vitest';
import {
  normalizeState,
  barSequence,
  barInterval,
  gridSequence,
  radialSequence,
  radialInterval,
  shaderTargets,
  waveTargets,
  type VisualizerState,
} from './visualizer-sequences';

describe('normalizeState', () => {
  it('passes through known states', () => {
    expect(normalizeState('speaking')).toBe('speaking');
    expect(normalizeState('thinking')).toBe('thinking');
    // First-class since 2026-08-10 (Rob): disconnected renders the
    // dead-connection look (flat wave, dark grid) instead of aliasing to
    // idle, which now gently undulates on the wave.
    expect(normalizeState('disconnected')).toBe('disconnected');
  });
  it('maps LiveKit room-lifecycle aliases', () => {
    // 'failed' rides with 'disconnected', not 'idle': both are
    // dead-connection looks upstream.
    expect(normalizeState('failed')).toBe('disconnected');
    expect(normalizeState('initializing')).toBe('connecting');
    expect(normalizeState('pre-connect-buffering')).toBe('connecting');
  });
  it('falls back to idle for unknown or missing values', () => {
    expect(normalizeState('nonsense')).toBe('idle');
    expect(normalizeState(undefined)).toBe('idle');
  });
});

describe('barSequence', () => {
  it('connecting sweeps a mirrored pair across the bars', () => {
    expect(barSequence('connecting', 5)).toEqual([
      [0, 4], [1, 3], [2, 2], [3, 1], [4, 0],
    ]);
  });
  it('listening blinks the center bar', () => {
    expect(barSequence('listening', 5)).toEqual([[2], [-1]]);
  });
  it('thinking uses the same blink as listening', () => {
    expect(barSequence('thinking', 5)).toEqual(barSequence('listening', 5));
  });
  it('speaking lights every bar', () => {
    expect(barSequence('speaking', 4)).toEqual([[0, 1, 2, 3]]);
  });
  it('idle lights nothing', () => {
    expect(barSequence('idle', 5)).toEqual([[]]);
  });
  it('disconnected lights nothing, mirroring idle for now (LiveKit measurement pending)', () => {
    expect(barSequence('disconnected', 5)).toEqual([[]]);
  });
  it('never returns an empty sequence, so `tick % length` is always safe', () => {
    const states = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'disconnected'] as const;
    for (const s of states) {
      for (const n of [1, 2, 3, 5, 12]) {
        expect(barSequence(s, n).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('barInterval', () => {
  it('divides the connecting sweep across the bar count', () => {
    expect(barInterval('connecting', 5)).toBe(400);
    expect(barInterval('connecting', 4)).toBe(500);
  });
  it('uses the fixed upstream intervals for the other states', () => {
    expect(barInterval('listening', 5)).toBe(500);
    expect(barInterval('thinking', 5)).toBe(150);
    expect(barInterval('speaking', 5)).toBe(1000);
    expect(barInterval('idle', 5)).toBe(1000);
  });
});

describe('gridSequence', () => {
  it('connecting walks the perimeter ring once, without repeating a cell', () => {
    const seq = gridSequence('connecting', 5, 5);
    const keys = seq.map((c) => `${c.x},${c.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(seq[0]).toEqual({ x: 0, y: 0 });
    // A 5x5 outer ring is 16 cells.
    expect(seq).toHaveLength(16);
  });
  it('connecting honours a tighter spread', () => {
    const seq = gridSequence('connecting', 5, 5, 1);
    // The inner 3x3 ring is 8 cells.
    expect(seq).toHaveLength(8);
  });
  it('listening shows the center once then rests', () => {
    const seq = gridSequence('listening', 5, 5);
    expect(seq[0]).toEqual({ x: 2, y: 2 });
    expect(seq).toHaveLength(9);
    expect(seq.slice(1).every((c) => c.x === -1 && c.y === -1)).toBe(true);
  });
  it('thinking sweeps the middle row out and back', () => {
    const seq = gridSequence('thinking', 5, 5);
    expect(seq).toHaveLength(10);
    expect(seq.every((c) => c.y === 2)).toBe(true);
    expect(seq[0]).toEqual({ x: 0, y: 2 });
    expect(seq[4]).toEqual({ x: 4, y: 2 });
    expect(seq[5]).toEqual({ x: 4, y: 2 });
    expect(seq[9]).toEqual({ x: 0, y: 2 });
  });
  it('disconnected rests on the same center frame as idle (variant-grid suppresses the highlight for both)', () => {
    expect(gridSequence('disconnected', 5, 5)).toEqual([{ x: 2, y: 2 }]);
  });
  it('idle and speaking rest on the center', () => {
    expect(gridSequence('idle', 5, 5)).toEqual([{ x: 2, y: 2 }]);
    expect(gridSequence('speaking', 5, 5)).toEqual([{ x: 2, y: 2 }]);
  });
  it('regression: non-square grids emit only valid coordinates', () => {
    // Bug fix: gridRing was using row-center for both axes, producing
    // out-of-range x coordinates on non-square grids.
    const seq = gridSequence('connecting', 20, 3, 1);
    for (const coord of seq) {
      expect(coord.x).toBeGreaterThanOrEqual(0);
      expect(coord.x).toBeLessThan(3);
      expect(coord.y).toBeGreaterThanOrEqual(0);
      expect(coord.y).toBeLessThan(20);
    }
  });
  it('regression: explicit spread=0 is not treated as undefined', () => {
    // Bug fix: spread ? ... treated 0 as falsy. Explicit 0 should request
    // the tightest possible ring, which is strictly smaller than the default.
    const withSpreadZero = gridSequence('connecting', 5, 5, 0);
    const withoutSpread = gridSequence('connecting', 5, 5);
    expect(withSpreadZero.length).toBeLessThan(withoutSpread.length);
  });
  it('never returns an empty sequence', () => {
    const states = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'disconnected'] as const;
    for (const s of states) {
      expect(gridSequence(s, 3, 3).length).toBeGreaterThan(0);
    }
  });
});

describe('radialSequence', () => {
  it('connecting pairs each bar with its antipode', () => {
    expect(radialSequence('connecting', 4)).toEqual([
      [0, 2], [1, 3], [2, 0], [3, 1],
    ]);
  });
  it('listening partitions the ring into interleaved groups that cover it exactly once', () => {
    const seq = radialSequence('listening', 12);
    const flat = seq.flat().sort((a, b) => a - b);
    expect(flat).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it('thinking reuses the listening partition', () => {
    expect(radialSequence('thinking', 12)).toEqual(radialSequence('listening', 12));
  });
  it('speaking lights the whole ring', () => {
    expect(radialSequence('speaking', 4)).toEqual([[0, 1, 2, 3]]);
  });
  it('idle lights nothing', () => {
    expect(radialSequence('idle', 8)).toEqual([[]]);
  });
  it('disconnected lights nothing, mirroring idle for now (LiveKit measurement pending)', () => {
    expect(radialSequence('disconnected', 8)).toEqual([[]]);
  });
  it('never returns an empty sequence', () => {
    const states = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'disconnected'] as const;
    for (const s of states) {
      for (const n of [4, 8, 12, 24]) {
        expect(radialSequence(s, n).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('radialInterval', () => {
  it('freezes the sequencer while thinking, because CSS drives the spin', () => {
    expect(radialInterval('thinking')).toBe(Infinity);
  });
  it('uses the upstream intervals otherwise', () => {
    expect(radialInterval('connecting')).toBe(500);
    expect(radialInterval('listening')).toBe(500);
    expect(radialInterval('speaking')).toBe(1000);
    expect(radialInterval('idle')).toBe(1000);
  });
});

describe('shaderTargets', () => {
  it('pulses between two values while listening and thinking', () => {
    expect(shaderTargets('listening').intensity).toEqual([0.5, 0.8]);
    expect(shaderTargets('thinking').intensity).toEqual([0.25, 0.5]);
  });
  it('settles on a single dim value when idle', () => {
    expect(shaderTargets('idle')).toEqual({ intensity: 0.3, speed: 1 });
  });
  it('disconnected keeps the idle dim intensity but gets its OWN speed, so a shader can render a dead line distinct from idle', () => {
    // Speed 0.5, not idle's 1: uSpeed is the only state-correlated scalar
    // (besides intensity) a custom shader receives, and disconnected's look
    // is a flat dead line where idle's is a calm breathing ridge -- sharing
    // idle's speed made the two indistinguishable in GLSL. Intensity stays
    // at the dim 0.3 resting value; still one-line adjustable if the
    // pending LiveKit disconnected-state measurement says otherwise.
    expect(shaderTargets('disconnected')).toEqual({ intensity: 0.3, speed: 0.5 });
  });
  it('speeds up while thinking, and faster still while connecting -- each state gets a distinct speed', () => {
    // uSpeed is the ONLY state-correlated scalar (besides intensity) that
    // reaches a custom shader's GLSL, so every state needs its own value or
    // a consumer shader cannot tell them apart: idle 1, speaking/listening
    // 2.5 (disambiguated by band energy), thinking 4, connecting 6. The
    // shared 4.0 the two transitional states used to have made them
    // pixel-identical in any shader keying off the kit's uniforms -- the
    // Custom story's per-state looks are the concrete consumer.
    expect(shaderTargets('thinking').speed).toBe(4.0);
    expect(shaderTargets('connecting').speed).toBe(6.0);
    expect(shaderTargets('connecting').speed).not.toBe(shaderTargets('thinking').speed);
  });
  it('leaves speaking intensity to the live volume', () => {
    expect(shaderTargets('speaking').speed).toBe(2.5);
  });
});

describe('waveTargets', () => {
  // This test used to pin a flat idle line. Upstream's wave switch has no
  // 'idle' arm at all -- idle falls through to the speaking/default arm and
  // gently undulates; their explicitly flat state is 'disconnected'. See the
  // wave section note in visualizer-sequences.ts (Rob, 2026-08-09).
  it('gently undulates when idle, sharing the speaking arm like upstream', () => {
    expect(waveTargets('idle')).toEqual({
      speed: 10,
      amplitude: 0.025,
      frequency: 10,
      opacity: 1.0,
      pulseDuration: 0,
    });
    // Structural parity: upstream serves idle and speaking from ONE arm.
    expect(waveTargets('idle')).toEqual(waveTargets('speaking'));
  });
  it('renders the flat line for disconnected, upstream\'s explicit flat state, including through normalizeState', () => {
    const flat = { speed: 5, amplitude: 0, frequency: 0, opacity: 1.0, pulseDuration: 0 };
    expect(waveTargets('disconnected')).toEqual(flat);
    // The chain the element takes: raw markup state -> normalizeState ->
    // table. Until 'disconnected' became first-class (Rob, 2026-08-10) the
    // alias sent this through 'idle', which now means the gentle wave.
    expect(waveTargets(normalizeState('disconnected'))).toEqual(flat);
  });
  it('keeps the flat line for out-of-union states (the default arm stays conservative)', () => {
    // Flat pinning moved here from the idle test above: the default arm keeps
    // it reachable should a disconnected-like state ever join the union.
    expect(waveTargets('bogus' as VisualizerState)).toEqual({
      speed: 5,
      amplitude: 0,
      frequency: 0,
      opacity: 1.0,
      pulseDuration: 0,
    });
  });
  it('uses the base wave while listening and mirrors opacity', () => {
    const t = waveTargets('listening');
    expect(t.speed).toBe(5);
    expect(t.amplitude).toBeCloseTo(0.025, 6);
    expect(t.frequency).toBe(10);
    expect(t.opacity).toEqual([1.0, 0.3]);
    expect(t.pulseDuration).toBeCloseTo(0.75, 6);
  });
  it('quadruples speed and frequency while thinking', () => {
    const t = waveTargets('thinking');
    expect(t.speed).toBe(20);
    expect(t.frequency).toBe(40);
    expect(t.amplitude).toBeCloseTo(0.025 / 4, 6);
    expect(t.pulseDuration).toBeCloseTo(0.4, 6);
  });
  it('doubles speed and holds full opacity while speaking', () => {
    const t = waveTargets('speaking');
    expect(t.speed).toBe(10);
    expect(t.opacity).toBe(1.0);
  });
});
