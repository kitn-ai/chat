/**
 * Pure `state -> highlight set` mappers for the audio visualizer variants.
 *
 * Ported from livekit/components-js `packages/shadcn/hooks/agents-ui/`
 * (Apache License 2.0). Upstream runs four separate animator hooks, each with
 * its own requestAnimationFrame loop. We keep the sequences (verbatim) but move
 * the timing into one shared driver, `use-sequencer.ts`.
 *
 * Every generator returns a NON-EMPTY array so callers can index with
 * `sequence[tick % sequence.length]` without a guard.
 */

export type VisualizerState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface Coordinate {
  x: number;
  y: number;
}

const KNOWN: readonly VisualizerState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking'];

/**
 * LiveKit's AgentState carries room-lifecycle values that mean nothing here.
 * Accept them so markup ported from LiveKit works unchanged.
 */
const ALIASES: Record<string, VisualizerState> = {
  disconnected: 'idle',
  failed: 'idle',
  initializing: 'connecting',
  'pre-connect-buffering': 'connecting',
};

export function normalizeState(input: string | undefined): VisualizerState {
  if (!input) return 'idle';
  if ((KNOWN as readonly string[]).includes(input)) return input as VisualizerState;
  return ALIASES[input] ?? 'idle';
}

// ---------------------------------------------------------------- bar

export function barSequence(state: VisualizerState, barCount: number): number[][] {
  switch (state) {
    case 'connecting': {
      // A mirrored pair sweeping outward: [0, n-1], [1, n-2], ...
      const seq: number[][] = [];
      for (let x = 0; x < barCount; x++) seq.push([x, barCount - 1 - x]);
      return seq.length ? seq : [[]];
    }
    case 'listening':
    case 'thinking': {
      // Blink the center bar. -1 is a deliberate no-index frame (the "off" beat).
      return [[Math.floor(barCount / 2)], [-1]];
    }
    case 'speaking':
      return [Array.from({ length: barCount }, (_, i) => i)];
    case 'idle':
    default:
      return [[]];
  }
}

export function barInterval(state: VisualizerState, barCount: number): number {
  switch (state) {
    // The whole sweep should take 2s regardless of how many bars it crosses.
    case 'connecting':
      return 2000 / Math.max(1, barCount);
    case 'listening':
      return 500;
    case 'thinking':
      return 150;
    default:
      return 1000;
  }
}

// ---------------------------------------------------------------- grid

/** Walk the perimeter of a ring `spread` cells out from center, clockwise. */
function gridRing(rows: number, columns: number, spread: number): Coordinate[] {
  const seq: Coordinate[] = [];
  const centerY = Math.floor(rows / 2);
  const topLeft = { x: Math.max(0, centerY - spread), y: Math.max(0, centerY - spread) };
  const bottomRight = {
    x: columns - 1 - topLeft.x,
    y: Math.min(rows - 1, centerY + spread),
  };

  for (let x = topLeft.x; x <= bottomRight.x; x++) seq.push({ x, y: topLeft.y });
  for (let y = topLeft.y + 1; y <= bottomRight.y; y++) seq.push({ x: bottomRight.x, y });
  for (let x = bottomRight.x - 1; x >= topLeft.x; x--) seq.push({ x, y: bottomRight.y });
  for (let y = bottomRight.y - 1; y > topLeft.y; y--) seq.push({ x: topLeft.x, y });

  return seq;
}

export function gridSequence(
  state: VisualizerState,
  rows: number,
  columns: number,
  spread?: number,
): Coordinate[] {
  const center = { x: Math.floor(columns / 2), y: Math.floor(rows / 2) };

  switch (state) {
    case 'connecting': {
      const maxSpread = Math.floor(Math.max(rows, columns) / 2);
      const clamped = spread ? Math.min(spread, maxSpread) : maxSpread;
      const ring = gridRing(rows, columns, clamped);
      return ring.length ? ring : [center];
    }
    case 'listening': {
      // One lit frame followed by eight dark ones: a slow heartbeat.
      const off = { x: -1, y: -1 };
      return [center, off, off, off, off, off, off, off, off];
    }
    case 'thinking': {
      // Sweep the middle row left to right, then back.
      const y = Math.floor(rows / 2);
      const seq: Coordinate[] = [];
      for (let x = 0; x < columns; x++) seq.push({ x, y });
      for (let x = columns - 1; x >= 0; x--) seq.push({ x, y });
      return seq.length ? seq : [center];
    }
    default:
      return [center];
  }
}

// ---------------------------------------------------------------- radial

/** Largest divisor of `n` that is at most `max`. Always at least 1. */
function largestDivisorAtMost(n: number, max: number): number {
  const gcd = (a: number, b: number): number => {
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  };
  for (let i = max; i >= 1; i--) if (gcd(n, i) === i) return i;
  return 1;
}

/**
 * Partition the ring into interleaved groups. Lighting one group per tick reads
 * as a rotating pattern rather than a single travelling dot. Every index appears
 * in exactly one group.
 */
function radialGroups(barCount: number): number[][] {
  const divisor =
    barCount > 8
      ? barCount / largestDivisorAtMost(barCount, 4)
      : largestDivisorAtMost(barCount, 2);
  const safe = Math.max(1, Math.floor(divisor));
  const perGroup = Math.floor(barCount / safe);
  return Array.from({ length: safe }, (_, i) =>
    Array.from({ length: perGroup }, (_, j) => j * safe + i),
  );
}

export function radialSequence(state: VisualizerState, barCount: number): number[][] {
  switch (state) {
    case 'connecting': {
      // Pair each bar with the one opposite it, sweeping around the circle.
      const center = Math.floor(barCount / 2);
      const seq: number[][] = [];
      for (let x = 0; x < barCount; x++) seq.push([x, (x + center) % barCount]);
      return seq.length ? seq : [[]];
    }
    case 'listening':
    case 'thinking': {
      const groups = radialGroups(barCount);
      return groups.length ? groups : [[]];
    }
    case 'speaking':
      return [Array.from({ length: barCount }, (_, i) => i)];
    case 'idle':
    default:
      return [[]];
  }
}

export function radialInterval(state: VisualizerState): number {
  switch (state) {
    case 'connecting':
    case 'listening':
      return 500;
    // Infinity parks the sequencer: `thinking` spins the whole container in CSS
    // with every bar lit, so ticking would fight the animation.
    case 'thinking':
      return Infinity;
    default:
      return 1000;
  }
}

// ---------------------------------------------------------------- shader

/**
 * Uniform targets for the aura and custom shaders. An array intensity means
 * "ping-pong between these two" (see create-tween). `speaking` intensity is
 * omitted from the pulse because live volume drives it instantly instead.
 */
export function shaderTargets(
  state: VisualizerState,
): { intensity: number | [number, number]; speed: number } {
  switch (state) {
    case 'listening':
      return { intensity: [0.5, 0.8], speed: 2.5 };
    case 'thinking':
    case 'connecting':
      return { intensity: [0.25, 0.5], speed: 4.0 };
    case 'speaking':
      return { intensity: 0.3, speed: 2.5 };
    case 'idle':
    default:
      return { intensity: 0.3, speed: 1 };
  }
}

const WAVE_SPEED = 5;
const WAVE_AMPLITUDE = 0.025;
const WAVE_FREQUENCY = 10;

/** Uniform targets for the wave shader. Same shape, different curve. */
export function waveTargets(state: VisualizerState): {
  speed: number;
  amplitude: number;
  frequency: number;
  opacity: number | [number, number];
  pulseDuration: number;
} {
  switch (state) {
    case 'listening':
      return {
        speed: WAVE_SPEED,
        amplitude: WAVE_AMPLITUDE,
        frequency: WAVE_FREQUENCY,
        opacity: [1.0, 0.3],
        pulseDuration: 0.75,
      };
    case 'thinking':
    case 'connecting':
      return {
        speed: WAVE_SPEED * 4,
        amplitude: WAVE_AMPLITUDE / 4,
        frequency: WAVE_FREQUENCY * 4,
        opacity: [1.0, 0.3],
        pulseDuration: 0.4,
      };
    case 'speaking':
      return {
        speed: WAVE_SPEED * 2,
        amplitude: WAVE_AMPLITUDE,
        frequency: WAVE_FREQUENCY,
        opacity: 1.0,
        pulseDuration: 0,
      };
    case 'idle':
    default:
      return {
        speed: WAVE_SPEED,
        amplitude: 0,
        frequency: 0,
        opacity: 1.0,
        pulseDuration: 0,
      };
  }
}
