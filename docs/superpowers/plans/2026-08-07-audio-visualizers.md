# kai-audio-visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `<kai-audio-visualizer>`, one element with six looks (`bar`, `grid`, `radial`, `wave`, `aura`, `custom`), ported from LiveKit Agents UI onto primitives with no `livekit-client` dependency.

**Architecture:** Three layers. Pure math and sequence generators in `primitives/` (DOM-free, directly unit-testable). SolidJS variant renderers in `components/audio-visualizer/`, with the WebGL ones behind a dynamic `import()`. One `kai-` facade in `elements/`. A single `AnalyserNode` feeds both a multiband array and a scalar RMS; a single `requestAnimationFrame` driver emits a tick that pure per-variant mappers turn into highlight sets.

**Tech Stack:** SolidJS, `solid-element` via `defineWebComponent`, Tailwind (compiled into the shadow root), Web Audio API, raw WebGL, Vitest + `@solidjs/testing-library`, Storybook (`storybook-solidjs-vite`), Vite library build.

**Spec:** `docs/superpowers/specs/2026-08-07-audio-visualizers-design.md`. Read it before Task 1. Every constant below is carried from upstream; do not re-derive them.

## Global Constraints

- Run every command from the **repo root**. This is a pnpm + NX workspace.
- Work only in the worktree `.claude/worktrees/audio-visualizers` on branch `worktree-audio-visualizers`. Never `cd` to the main checkout.
- **Element prefix is `kai-`**, never `kitn-`.
- **Array/object props are JS properties, never HTML attributes.** Only scalars (`variant`, `size`, `state`, counts, `color`) work as attributes.
- No new runtime dependencies. Specifically **no `motion` / `framer-motion`**, and no `livekit-client`. Task 4 exists to avoid that dependency.
- **Never open** `agent-audio-visualizer-aura.tsx` or `use-agent-audio-visualizer-aura.ts` from `livekit/components-js`. See Task 14 and spec section 1.
- No em dashes in any copy, comment, doc, or story description. Write like a sharp human engineer per `apps/docs/STYLE.md`.
- Conventional commits. `feat:` for new surface, `test:` for test-only, `docs:` for docs. Never hand-edit `package.json` version.
- After any `nx build ui` or `build:api`, run `git checkout -- packages/ui/src/components/component-meta.json`. It churns with type-expansion noise and is not used at runtime.
- Unit suite: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`. Do **not** run bare `pnpm test` (it also runs the flaky storybook browser project).
- Typecheck: `nx typecheck ui` (4 tsc passes). Must stay green.

---

## Execution order and verification gates

Task numbers below are stable identifiers, not the execution sequence. Run them
in this order:

```
1  2  3  [SPIKE]  4  5  6  7  8  9  10  [BROWSER CHECKPOINT]
11  12  13  14 (human gate)  15  16  17  18  19
```

**[SPIKE] — done 2026-08-07, all five checks PASS.** Ran before Task 4 because
nothing in the plan had touched a real build or browser, and this epic
introduces the first Web Audio and the first WebGL in the repository. Findings,
now facts rather than assumptions: `nx build ui` succeeds; a dynamic `import()`
does split into its own chunk under `treeshake: false` (proven with a throwaway
module, not inferred from config comments); `kai-*` elements register and
upgrade in a real browser with a populated shadow root; raw WebGL works in a
shadow-root canvas with exact pixel readback; and an `AnalyserNode` with nothing
connected downstream still receives data while the audio goes silent. Full
evidence in `.superpowers/sdd/2026-08-07-audio-visualizers/spike-report.md`.

That last finding changed the Task 3 design: the analyser must NOT sit in the
audio path. See Task 3.

**[BROWSER CHECKPOINT] after Task 10.** The original plan deferred all browser
verification to Task 18, which would have put twelve tasks on an unverified
foundation. Task 10 is the earliest point where the element exists, is
registered, and has a story to load, so it is the earliest honest checkpoint.
It cannot move earlier: Task 9 imports the dispatcher from Task 8, which imports
all three DOM variants.

Run against `pnpm dev` (Storybook static cannot register web components). Confirm
`<kai-audio-visualizer>` upgrades, that all three DOM variants render geometry,
that `bands` set as a JS property moves the bars, and that `nx build ui` still
passes with the element registered. Any failure here stops the shader work until
it is resolved.

**Also do the fidelity comparison here.** The whole point of carrying upstream's
constants verbatim is that our output should be hard to tell from theirs, and so
far that is a claim derived from reading code rather than from looking at
pixels. Capture LiveKit's own previews at
<https://docs.livekit.io/frontends/agents-ui/audio-visualizer/prebuilt/> beside
ours, same variant, same state, same size, and compare.

Expected, so a real divergence is distinguishable from a known one:

| | Expectation |
| --- | --- |
| bar, grid, radial | Geometry and timing indistinguishable. Every constant was carried over. |
| Color | Ours follows the kit theme via `currentColor`, theirs is their palette. Set `color` to match before comparing shape. |
| grid on non-square counts | Deliberately different. Ours stays in range; upstream emits out-of-range columns. Compare on the default 5x5. |
| wave | Identical at rest (same shader). Transitions should now also match, since Task 4 uses motion's real bezier curves. |
| aura | Different by design. Not a fidelity target. |

Anything outside that table is a finding. Report it with both screenshots rather
than adjusting our code to match on the spot: a difference might mean we got a
constant wrong, or it might mean upstream changed since the port.

**Reviewer standing instruction.** Every task reviewer is told: the brief may be
wrong, and anything that would fail at runtime in a real browser or build is a
finding even when the brief mandates it. This is not optional politeness. Of the
defects found so far, most originated in this plan rather than in the
implementations, and they were caught because reviewers checked the plan's
claims against reality instead of treating the brief as ground truth.

---

## File Structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `packages/ui/src/primitives/audio-bands.ts` | Pure reductions: FFT to bands, FFT to scalar RMS, band resizing |
| `packages/ui/src/primitives/visualizer-sequences.ts` | Pure state to highlight-set mappers, per variant |
| `packages/ui/src/primitives/use-sequencer.ts` | One RAF driver emitting a tick index |
| `packages/ui/src/primitives/use-audio-analysis.ts` | AudioContext + AnalyserNode lifecycle |
| `packages/ui/src/primitives/create-tween.ts` | Numeric tween for shader uniforms |
| `packages/ui/src/components/audio-visualizer/sizes.ts` | Shared size scale tables |
| `packages/ui/src/components/audio-visualizer/variant-bar.tsx` | Bar renderer |
| `packages/ui/src/components/audio-visualizer/variant-grid.tsx` | Grid renderer |
| `packages/ui/src/components/audio-visualizer/variant-radial.tsx` | Radial renderer |
| `packages/ui/src/components/audio-visualizer/index.tsx` | Dispatcher, lazy shader map, reduced-motion |
| `packages/ui/src/components/audio-visualizer/shader-canvas.tsx` | ShaderToy-compatible WebGL runner |
| `packages/ui/src/components/audio-visualizer/wave.glsl.ts` | Wave fragment shader (Apache 2.0, verbatim) |
| `packages/ui/src/components/audio-visualizer/aura.glsl.ts` | Aura fragment shader (original) |
| `packages/ui/src/components/audio-visualizer/variant-wave.tsx` | Wave renderer |
| `packages/ui/src/components/audio-visualizer/variant-aura.tsx` | Aura renderer |
| `packages/ui/src/components/audio-visualizer/variant-custom.tsx` | BYO-shader renderer |
| `packages/ui/src/elements/audio-visualizer.tsx` | `<kai-audio-visualizer>` facade |
| `packages/ui/NOTICE` | Apache 2.0 attribution |

**Modify:** `packages/ui/src/primitives/use-voice-recorder.ts` (expose stream), `packages/ui/src/elements/register-impl.ts` (register the element), `packages/ui/src/agent-tooling/` catalog (MCP entry), `apps/docs/` (docs page).

---

## Task 1: Pure audio reductions

**Files:**
- Create: `packages/ui/src/primitives/audio-bands.ts`
- Test: `packages/ui/src/primitives/audio-bands.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizeDb(value: number): number`
  - `reduceToBands(freq: Float32Array, bands: number, loPass: number, hiPass: number): number[]`
  - `reduceToVolume(bytes: Uint8Array): number`
  - `normalizeVolumeBands(bands: number[], count: number): number[]`

**Background.** `AnalyserNode.getFloatFrequencyData` writes decibel values, typically between about -100 and 0, with `-Infinity` for silence. Upstream maps those to 0..1 and then averages them into N bands. `loPass` and `hiPass` are **bin indices**, not frequencies, despite the names. Carry the math exactly.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/primitives/audio-bands.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/audio-bands.test.ts
```

Expected: FAIL, cannot resolve `./audio-bands`.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/primitives/audio-bands.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/audio-bands.test.ts
```

Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/primitives/audio-bands.ts packages/ui/src/primitives/audio-bands.test.ts
git commit -m "feat(primitives): add pure audio band and volume reductions"
```

---

## Task 2: Visualizer state sequences and the RAF sequencer

**Files:**
- Create: `packages/ui/src/primitives/visualizer-sequences.ts`
- Create: `packages/ui/src/primitives/use-sequencer.ts`
- Test: `packages/ui/src/primitives/visualizer-sequences.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type VisualizerState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'`
  - `interface Coordinate { x: number; y: number }`
  - `normalizeState(input: string | undefined): VisualizerState`
  - `barSequence(state: VisualizerState, barCount: number): number[][]`
  - `barInterval(state: VisualizerState, barCount: number): number`
  - `gridSequence(state: VisualizerState, rows: number, columns: number, spread?: number): Coordinate[]`
  - `radialSequence(state: VisualizerState, barCount: number): number[][]`
  - `radialInterval(state: VisualizerState): number`
  - `shaderTargets(state: VisualizerState): { intensity: number | [number, number]; speed: number }`
  - `waveTargets(state: VisualizerState): { speed: number; amplitude: number; frequency: number; opacity: number | [number, number]; pulseDuration: number }`
  - `useSequencer(interval: () => number): Accessor<number>`

**Background.** Upstream ships four near-identical animator hooks, each with its own RAF loop. We split them into pure `tick -> highlight set` mappers plus one shared driver. The rendered value is always `sequence[tick % sequence.length]`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/primitives/visualizer-sequences.test.ts`:

```ts
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
} from './visualizer-sequences';

describe('normalizeState', () => {
  it('passes through known states', () => {
    expect(normalizeState('speaking')).toBe('speaking');
    expect(normalizeState('thinking')).toBe('thinking');
  });
  it('maps LiveKit room-lifecycle aliases', () => {
    expect(normalizeState('disconnected')).toBe('idle');
    expect(normalizeState('failed')).toBe('idle');
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
  it('never returns an empty sequence, so `tick % length` is always safe', () => {
    const states = ['idle', 'connecting', 'listening', 'thinking', 'speaking'] as const;
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
  it('idle and speaking rest on the center', () => {
    expect(gridSequence('idle', 5, 5)).toEqual([{ x: 2, y: 2 }]);
    expect(gridSequence('speaking', 5, 5)).toEqual([{ x: 2, y: 2 }]);
  });
  it('never returns an empty sequence', () => {
    const states = ['idle', 'connecting', 'listening', 'thinking', 'speaking'] as const;
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
  it('never returns an empty sequence', () => {
    const states = ['idle', 'connecting', 'listening', 'thinking', 'speaking'] as const;
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
  it('speeds up while thinking and connecting', () => {
    expect(shaderTargets('thinking').speed).toBe(4.0);
    expect(shaderTargets('connecting').speed).toBe(4.0);
  });
  it('leaves speaking intensity to the live volume', () => {
    expect(shaderTargets('speaking').speed).toBe(2.5);
  });
});

describe('waveTargets', () => {
  it('flattens the line when idle', () => {
    expect(waveTargets('idle').amplitude).toBe(0);
    expect(waveTargets('idle').frequency).toBe(0);
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/visualizer-sequences.test.ts
```

Expected: FAIL, cannot resolve `./visualizer-sequences`.

- [ ] **Step 3: Write the sequence implementation**

Create `packages/ui/src/primitives/visualizer-sequences.ts`:

```ts
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

/**
 * Walk the perimeter of a ring `spread` cells out from center, clockwise.
 *
 * TWO DELIBERATE DIVERGENCES from upstream `use-agent-audio-visualizer-grid.ts`,
 * approved 2026-08-07. Upstream derives the x axis from `centerY` (the row
 * count), which emits out-of-range columns once rows and columns differ enough:
 * a 20x3 grid yields x of -7 and 9 for a valid range of 0..2. Upstream also
 * treats `spread === 0` as unset, so asking for the tightest ring gives the
 * widest. Neither is visible on a square grid, which is upstream's only shipped
 * configuration, so visual fidelity is untouched. We expose `row-count` and
 * `column-count` independently, so consumers can reach both.
 */
function gridRing(rows: number, columns: number, spread: number): Coordinate[] {
  const seq: Coordinate[] = [];
  const centerX = Math.floor(columns / 2);
  const centerY = Math.floor(rows / 2);
  const topLeft = { x: Math.max(0, centerX - spread), y: Math.max(0, centerY - spread) };
  const bottomRight = {
    x: Math.min(columns - 1, centerX + spread),
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
      // `!== undefined`, not a truthiness check: spread 0 means the tightest
      // ring, and upstream's `spread ? ... : ...` silently turns it into the
      // widest. See the divergence note on gridRing.
      const clamped = spread !== undefined ? Math.min(spread, maxSpread) : maxSpread;
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
```

- [ ] **Step 4: Write the sequencer driver**

Create `packages/ui/src/primitives/use-sequencer.ts`:

```ts
import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js';

/**
 * One requestAnimationFrame loop emitting a monotonically increasing tick
 * whenever `interval()` milliseconds have elapsed.
 *
 * RAF rather than setInterval: the browser parks it on hidden tabs, so an
 * off-screen visualizer costs nothing. Upstream leaks a timer here.
 *
 * An interval of `Infinity` (or anything non-finite) parks the loop entirely
 * and holds the tick at 0. The radial variant uses that while `thinking`,
 * where a CSS spin drives the motion instead.
 */
export function useSequencer(interval: () => number): Accessor<number> {
  const [tick, setTick] = createSignal(0);

  createEffect(() => {
    const ms = interval();

    // Reset on every interval change so a state transition restarts the
    // sequence from its first frame rather than resuming mid-pattern.
    setTick(0);

    if (!Number.isFinite(ms) || ms <= 0) return;
    if (typeof requestAnimationFrame === 'undefined') return;

    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      if (now - last >= ms) {
        setTick((t) => t + 1);
        last = now;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    onCleanup(() => cancelAnimationFrame(raf));
  });

  return tick;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/visualizer-sequences.test.ts
```

Expected: PASS, 30 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
nx typecheck ui
git add packages/ui/src/primitives/visualizer-sequences.ts packages/ui/src/primitives/use-sequencer.ts packages/ui/src/primitives/visualizer-sequences.test.ts
git commit -m "feat(primitives): add visualizer state sequences and RAF sequencer"
```

---

## Task 3: Web Audio analysis

**Files:**
- Create: `packages/ui/src/primitives/use-audio-analysis.ts`
- Test: `packages/ui/src/primitives/use-audio-analysis.test.ts`
- Modify: `packages/ui/src/primitives/use-voice-recorder.ts`

**Interfaces:**
- Consumes: `reduceToBands`, `reduceToVolume` from `./audio-bands` (Task 1).
- Produces:
  - `interface AudioAnalysisOptions { bands?: number; loPass?: number; hiPass?: number; fftSize?: number; smoothingTimeConstant?: number; updateInterval?: number }`
  - `useAudioAnalysis(source: () => MediaStream | HTMLMediaElement | undefined, options?: AudioAnalysisOptions): { bands: Accessor<number[]>; volume: Accessor<number> }`
  - `useVoiceRecorder()` gains `stream: Accessor<MediaStream | undefined>`

**This is the highest-risk task in the plan.** Three Web Audio footguns, all silent:

1. `createMediaElementSource` **throws** if called twice for the same element, and there is no API to ask whether one already exists. Guard with a module-level `WeakMap`.
2. Routing an `HTMLMediaElement` through Web Audio and never reaching `destination` mutes the element with no error. Worse, the spike established it does NOT stop the analyser producing data, so the visualizer keeps animating over silence and nothing signals the fault.
3. Putting the analyser **in** the audio path means each extra consumer adds a parallel route to `destination`, roughly doubling amplitude per visualizer on the same element.

The shape that avoids all three: `elNode -> ctx.destination` exactly ONCE at creation, and `elNode -> analyser` per consumer as a **terminal** side-tap with nothing downstream. An `AnalyserNode` still receives data with no outgoing connection, verified in Chromium via `OfflineAudioContext` (see the spike report), so the analyser never needs to be in the path. On cleanup use the specific-edge form `elNode.disconnect(analyser)`; a bare `disconnect()` would tear down `destination` and every other consumer's tap.

A `MediaStream` source must NOT connect to `destination`, or the microphone echoes back through the speakers.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/primitives/use-audio-analysis.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { useAudioAnalysis } from './use-audio-analysis';

/**
 * jsdom has no Web Audio. We stand up a minimal fake that records how it was
 * wired, which is exactly what the footguns are about.
 */
const created = {
  elementSources: [] as unknown[],
  streamSources: [] as unknown[],
  connections: [] as string[],
  disconnects: 0,
};

class FakeAnalyser {
  fftSize = 2048;
  smoothingTimeConstant = 0.55;
  get frequencyBinCount() { return this.fftSize / 2; }
  getFloatFrequencyData(buf: Float32Array) { buf.fill(-50); }
  getByteFrequencyData(buf: Uint8Array) { buf.fill(128); }
  connect() { created.connections.push('analyser->destination'); }
  disconnect() { created.disconnects++; }
}

class FakeAudioContext {
  state: 'running' | 'suspended' = 'running';
  destination = { kind: 'destination' };
  createAnalyser() { return new FakeAnalyser(); }
  createMediaElementSource(el: unknown) {
    // The real API throws on a second call for the same element.
    if (created.elementSources.includes(el)) {
      throw new Error('HTMLMediaElement already connected to a MediaElementSourceNode');
    }
    created.elementSources.push(el);
    return { connect: () => created.connections.push('element->analyser'), disconnect: () => {} };
  }
  createMediaStreamSource(s: unknown) {
    created.streamSources.push(s);
    return { connect: () => created.connections.push('stream->analyser'), disconnect: () => {} };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

beforeEach(() => {
  created.elementSources = [];
  created.streamSources = [];
  created.connections = [];
  created.disconnects = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  // Queue frames rather than invoking the callback inline. A synchronous rAF
  // stub is not what any browser does, and it would recurse `step` forever.
  rafQueue = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => rafQueue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => { rafQueue = []; });
});

let rafQueue: FrameRequestCallback[] = [];

/** Run one animation frame's worth of queued callbacks. */
function flushFrame(t = 1000) {
  const q = rafQueue;
  rafQueue = [];
  q.forEach((cb) => cb(t));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const fakeStream = () => ({ id: 'stream' }) as unknown as MediaStream;
const fakeElement = () => ({ tagName: 'AUDIO' }) as unknown as HTMLMediaElement;

describe('useAudioAnalysis', () => {
  it('returns a zero-filled band array of the requested length before any audio', () => {
    createRoot((dispose) => {
      const { bands, volume } = useAudioAnalysis(() => undefined, { bands: 4 });
      expect(bands()).toEqual([0, 0, 0, 0]);
      expect(volume()).toBe(0);
      dispose();
    });
  });

  it('builds no AudioContext when there is no source', () => {
    createRoot((dispose) => {
      useAudioAnalysis(() => undefined, { bands: 3 });
      expect(created.streamSources).toHaveLength(0);
      expect(created.elementSources).toHaveLength(0);
      dispose();
    });
  });

  it('wires a MediaStream to the analyser but NOT to destination (no mic echo)', () => {
    createRoot((dispose) => {
      useAudioAnalysis(() => fakeStream(), { bands: 3 });
      expect(created.streamSources).toHaveLength(1);
      expect(created.connections).toContain('stream->analyser');
      expect(created.connections).not.toContain('analyser->destination');
      dispose();
    });
  });

  it('wires an HTMLMediaElement all the way through to destination', () => {
    createRoot((dispose) => {
      useAudioAnalysis(() => fakeElement(), { bands: 3 });
      expect(created.elementSources).toHaveLength(1);
      expect(created.connections).toContain('element->analyser');
      // Without this the consumer's audio goes silent with no error.
      expect(created.connections).toContain('analyser->destination');
      dispose();
    });
  });

  it('reuses the cached source node when the same element mounts twice', () => {
    const el = fakeElement();
    createRoot((dispose) => {
      useAudioAnalysis(() => el, { bands: 3 });
      dispose();
    });
    // A second consumer of the same element must not throw.
    expect(() => {
      createRoot((dispose) => {
        useAudioAnalysis(() => el, { bands: 3 });
        dispose();
      });
    }).not.toThrow();
    expect(created.elementSources).toHaveLength(1);
  });

  it('disconnects the analyser on cleanup', () => {
    createRoot((dispose) => {
      useAudioAnalysis(() => fakeStream(), { bands: 3 });
      dispose();
    });
    expect(created.disconnects).toBeGreaterThan(0);
  });

  it('rebuilds when the source changes', () => {
    createRoot((dispose) => {
      const [src, setSrc] = createSignal<MediaStream | undefined>(undefined);
      useAudioAnalysis(src, { bands: 3 });
      expect(created.streamSources).toHaveLength(0);
      setSrc(fakeStream());
      expect(created.streamSources).toHaveLength(1);
      dispose();
    });
  });

  it('emits zeros and touches nothing when AudioContext is unavailable (SSR)', () => {
    vi.stubGlobal('AudioContext', undefined);
    createRoot((dispose) => {
      const { bands, volume } = useAudioAnalysis(() => fakeStream(), { bands: 5 });
      expect(bands()).toEqual([0, 0, 0, 0, 0]);
      expect(volume()).toBe(0);
      dispose();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/use-audio-analysis.test.ts
```

Expected: FAIL, cannot resolve `./use-audio-analysis`.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/primitives/use-audio-analysis.ts`:

```ts
import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js';
import { reduceToBands, reduceToVolume } from './audio-bands';

export interface AudioAnalysisOptions {
  /** Number of frequency buckets to produce. Default 5. */
  bands?: number;
  /** Low bin index of the pass window. NOT a frequency. Default 100. */
  loPass?: number;
  /** High bin index of the pass window. NOT a frequency. Default 200. */
  hiPass?: number;
  /** AnalyserNode fftSize. Default 2048. */
  fftSize?: number;
  /** AnalyserNode smoothing. Default 0.55. */
  smoothingTimeConstant?: number;
  /** Minimum ms between updates. Default 32 (about 30fps). */
  updateInterval?: number;
}

const DEFAULTS = {
  bands: 5,
  loPass: 100,
  hiPass: 200,
  fftSize: 2048,
  smoothingTimeConstant: 0.55,
  updateInterval: 32,
} as const;

/**
 * One AudioContext for the whole page. Contexts are expensive and browsers cap
 * how many can exist, so a per-mount context would break a page with several
 * visualizers on it.
 */
let sharedContext: AudioContext | undefined;

function getContext(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  sharedContext ??= new AudioContext();
  return sharedContext;
}

/**
 * `createMediaElementSource` THROWS if called twice for the same element, and
 * there is no API to ask whether an element already has a source node. Cache
 * them. A WeakMap so a removed <audio> can still be collected.
 */
const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

/**
 * `instanceof MediaStream` is not usable here: that global does not exist in
 * every environment (jsdom included), and referencing it throws a
 * ReferenceError rather than returning false. Every DOM element carries a
 * `tagName`; a MediaStream never does.
 */
function isMediaElement(src: MediaStream | HTMLMediaElement): src is HTMLMediaElement {
  return 'tagName' in src;
}

/** Resume a context parked by the autoplay policy, on the first user gesture. */
function resumeOnGesture(ctx: AudioContext): () => void {
  if (ctx.state !== 'suspended') return () => {};
  if (typeof document === 'undefined') return () => {};

  const resume = () => void ctx.resume().catch(() => {});
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  events.forEach((e) => document.addEventListener(e, resume, { once: true, passive: true }));
  return () => events.forEach((e) => document.removeEventListener(e, resume));
}

/**
 * Turn a live audio source into numbers a visualizer can draw.
 *
 * Returns BOTH reductions from a single AnalyserNode: `bands` for the DOM
 * variants and a scalar `volume` for the shader ones. Upstream runs two hooks
 * with two analysers and two timers to get the same thing.
 *
 * Safe to call with no source: it emits zeros and never constructs a context,
 * which is what makes the state-driven (no audio) mode work.
 */
export function useAudioAnalysis(
  source: () => MediaStream | HTMLMediaElement | undefined,
  options: AudioAnalysisOptions = {},
): { bands: Accessor<number[]>; volume: Accessor<number> } {
  const opts = { ...DEFAULTS, ...options };
  const [bands, setBands] = createSignal<number[]>(new Array(opts.bands).fill(0));
  const [volume, setVolume] = createSignal(0);

  createEffect(() => {
    const src = source();

    // Reset to a correctly-sized zero array whenever the source goes away, so a
    // stale picture never lingers after the mic stops.
    setBands(new Array(opts.bands).fill(0));
    setVolume(0);

    if (!src) return;

    const ctx = getContext();
    if (!ctx) return; // SSR, or a browser without Web Audio.
    if (typeof requestAnimationFrame === 'undefined') return;

    const stopResume = resumeOnGesture(ctx);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = opts.fftSize;
    analyser.smoothingTimeConstant = opts.smoothingTimeConstant;

    let node: AudioNode;
    if (!isMediaElement(src)) {
      node = ctx.createMediaStreamSource(src);
      node.connect(analyser);
      // Deliberately NOT connected to destination: that would echo the mic.
    } else {
      const el = src;
      let elNode = elementSources.get(el);
      if (!elNode) {
        elNode = ctx.createMediaElementSource(el);
        // Exactly once, at creation. Routing the element through Web Audio and
        // never reaching destination mutes it silently, and doing this per
        // consumer instead would stack parallel paths and double the volume.
        elNode.connect(ctx.destination);
        elementSources.set(el, elNode);
      }
      node = elNode;
      // Terminal side-tap. An AnalyserNode still receives data with nothing
      // connected downstream (verified in Chromium via OfflineAudioContext, see
      // the spike report), so keeping the analyser OUT of the audio path means
      // N visualizers on one element cannot sum to N times the amplitude.
      node.connect(analyser);
    }

    const freq = new Float32Array(analyser.frequencyBinCount);
    const bytes = new Uint8Array(analyser.frequencyBinCount);

    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      if (now - last >= opts.updateInterval) {
        analyser.getFloatFrequencyData(freq);
        analyser.getByteFrequencyData(bytes);
        setBands(reduceToBands(freq, opts.bands, opts.loPass, opts.hiPass));
        setVolume(reduceToVolume(bytes));
        last = now;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      stopResume();
      analyser.disconnect();
      // Do NOT disconnect a cached element source node: another consumer may
      // still be using it, and it can never be recreated for this element.
      if (isMediaElement(src)) return;
      node.disconnect();
    });
  });

  return { bands, volume };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/use-audio-analysis.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Expose the recorder's live stream**

The visualizer cannot see our own microphone today: `useVoiceRecorder.start()` keeps its `getUserMedia` stream in a local and tears it down on stop, so nothing can observe it. Add an accessor.

In `packages/ui/src/primitives/use-voice-recorder.ts`, add a signal beside the existing ones:

```ts
  const [stream, setStream] = createSignal<MediaStream | undefined>();
```

Inside `start()`, immediately after the `getUserMedia` call resolves:

```ts
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(stream);
```

Note the local `const stream` now shadows the accessor inside `start()`. Rename the local to `mediaStream` and update its three later uses (`new MediaRecorder(mediaStream, ...)`, `mediaStream.getTracks()...`, and `setStream(mediaStream)`) so the accessor stays reachable.

In `onstop`, clear it alongside the existing teardown:

```ts
        mediaStream.getTracks().forEach((t) => t.stop());
        setStream(undefined);
        setIsRecording(false);
```

And add it to the return:

```ts
  return { isRecording, error, stream, start, stop };
```

- [ ] **Step 6: Verify nothing regressed**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
nx typecheck ui
```

Expected: the full unit suite passes and all 4 tsc passes are clean. `useVoiceRecorder`'s change is purely additive, so no existing test should need editing. If one does, stop and re-read the change.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/primitives/use-audio-analysis.ts packages/ui/src/primitives/use-audio-analysis.test.ts packages/ui/src/primitives/use-voice-recorder.ts
git commit -m "feat(primitives): add Web Audio analysis and expose the recorder stream"
```

---

## Task 4: Numeric tween

**Files:**
- Create: `packages/ui/src/primitives/create-tween.ts`
- Test: `packages/ui/src/primitives/create-tween.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Transition = { duration: number; ease?: 'linear' | 'easeOut' | 'easeInOut' } | { type: 'spring'; duration: number; bounce: number }`
  - `createTween(initial: number): { value: Accessor<number>; to(target: number | [number, number], transition?: Transition): void }`

**Why this exists.** Shader uniforms are plain JS numbers, so CSS transitions cannot drive them. Upstream reaches for `motion/react`; we are not adding a motion library to a kit with no third-party UI dependencies. Roughly 90 lines replaces that dependency.

An array target ping-pongs between the two values forever, which is how the `listening` and `thinking` pulses work. `duration: 0` sets instantly, which is what live volume needs so the visualizer does not lag the audio.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/primitives/create-tween.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createTween } from './create-tween';

/** Drive RAF manually so we can step time deterministically. */
let frame: ((t: number) => void) | undefined;
let now = 0;

beforeEach(() => {
  now = 0;
  frame = undefined;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frame = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => { frame = undefined; });
  // performance.now() must read the SAME fake clock as the frames. The tween
  // stamps its origin from it, so leaving this real would have the two clocks
  // disagree by however long the process has been up.
  vi.stubGlobal('performance', { now: () => now });
});

afterEach(() => vi.unstubAllGlobals());

/** Advance the fake clock and run the pending frame. */
function advance(ms: number) {
  now += ms;
  const f = frame;
  frame = undefined;
  f?.(now);
}

describe('createTween', () => {
  it('starts at the initial value', () => {
    createRoot((dispose) => {
      const t = createTween(0.3);
      expect(t.value()).toBe(0.3);
      dispose();
    });
  });

  it('sets instantly when duration is 0', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(0.9, { duration: 0 });
      expect(t.value()).toBe(0.9);
      dispose();
    });
  });

  it('sets instantly when no transition is given', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(0.5);
      expect(t.value()).toBe(0.5);
      dispose();
    });
  });

  it('lands exactly on the target when the duration elapses', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 0.5 });
      advance(500);
      expect(t.value()).toBeCloseTo(1, 6);
      dispose();
    });
  });

  it('moves monotonically toward the target part-way through', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1, ease: 'linear' });
      advance(250);
      const quarter = t.value();
      expect(quarter).toBeGreaterThan(0);
      expect(quarter).toBeLessThan(1);
      advance(250);
      expect(t.value()).toBeGreaterThan(quarter);
      dispose();
    });
  });

  it('eases out, so it covers more than half the distance at the halfway point', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1, ease: 'easeOut' });
      advance(500);
      expect(t.value()).toBeGreaterThan(0.5);
      dispose();
    });
  });

  it('ping-pongs between the two values of an array target', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to([0.2, 0.8], { duration: 1, ease: 'linear' });
      advance(1000);
      expect(t.value()).toBeCloseTo(0.8, 2);
      advance(1000);
      expect(t.value()).toBeCloseTo(0.2, 2);
      advance(1000);
      expect(t.value()).toBeCloseTo(0.8, 2);
      dispose();
    });
  });

  it('starts an array target from its first value', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to([0.2, 0.8], { duration: 1, ease: 'linear' });
      advance(0);
      expect(t.value()).toBeCloseTo(0.2, 2);
      dispose();
    });
  });

  it('overshoots past the target with a bouncy spring', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { type: 'spring', duration: 1, bounce: 0.5 });
      let peak = 0;
      for (let i = 0; i < 40; i++) {
        advance(25);
        peak = Math.max(peak, t.value());
      }
      expect(peak).toBeGreaterThan(1);
      dispose();
    });
  });

  it('settles on the target after a spring completes', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { type: 'spring', duration: 1, bounce: 0.3 });
      for (let i = 0; i < 60; i++) advance(25);
      expect(t.value()).toBeCloseTo(1, 2);
      dispose();
    });
  });

  it('a new target interrupts the one in flight rather than queueing', () => {
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1, ease: 'linear' });
      advance(500);
      t.to(0, { duration: 0 });
      expect(t.value()).toBe(0);
      advance(500);
      expect(t.value()).toBe(0);
      dispose();
    });
  });

  it('eases from the moment to() is called, even after a long idle gap', () => {
    // The loop stops when a tween settles, so this is the COMMON path: every
    // state change calls to() on an idle tween. Seeding the origin from a stale
    // frame timestamp would charge the idle gap against the new duration and
    // snap instantly.
    createRoot((dispose) => {
      const t = createTween(0);
      t.to(1, { duration: 1, ease: 'linear' });
      advance(1000);
      expect(t.value()).toBeCloseTo(1, 6);
      advance(5000);
      t.to(0, { duration: 1, ease: 'linear' });
      advance(500);
      expect(t.value()).toBeCloseTo(0.5, 1);
      dispose();
    });
  });

  it('stops animating after dispose', () => {
    let t!: ReturnType<typeof createTween>;
    createRoot((dispose) => {
      t = createTween(0);
      t.to(1, { duration: 1, ease: 'linear' });
      dispose();
    });
    const before = t.value();
    advance(1000);
    expect(t.value()).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/create-tween.test.ts
```

Expected: FAIL, cannot resolve `./create-tween`.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/primitives/create-tween.ts`:

```ts
import { createSignal, onCleanup, type Accessor } from 'solid-js';

export type Transition =
  | { duration: number; ease?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' }
  | { type: 'spring'; duration: number; bounce: number };

/**
 * Real cubic-bezier curves, matching the named easings `motion` uses. This
 * tween replaces a `motion/react` dependency in components ported from LiveKit,
 * so the transitions have to FEEL the same, not merely ease. Cubic
 * approximations are noticeably snappier: `1 - (1-t)^3` reaches 0.875 at the
 * midpoint where motion's easeOut reaches about 0.68.
 *
 * `cubicBezier` solves X(s) = t for the curve parameter by Newton-Raphson with
 * a bisection fallback, then returns Y(s). Endpoints are pinned so a tween
 * lands exactly on its target.
 */
const EASINGS = {
  linear: (t: number) => t,
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
} as const;

/**
 * Damped-spring position at normalized time `t` (0..1), settling at 1.
 *
 * `bounce` maps to the damping ratio: 0 is critically damped (no overshoot),
 * higher values overshoot more. Matches the feel of motion's spring defaults
 * closely enough for shader uniforms, without the dependency.
 */
function spring(t: number, bounce: number): number {
  const zeta = Math.max(0.05, 1 - Math.min(0.95, bounce));
  const omega = 10;
  const damped = omega * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  return (
    1 -
    Math.exp(-zeta * omega * t) *
      (Math.cos(damped * t) + ((zeta * omega) / (damped || 1)) * Math.sin(damped * t))
  );
}

function isSpring(tr: Transition): tr is { type: 'spring'; duration: number; bounce: number } {
  return 'type' in tr && tr.type === 'spring';
}

/**
 * A tweened number driven by requestAnimationFrame.
 *
 * Exists so shader uniforms can animate without pulling in a motion library.
 * CSS transitions cannot help here: uniforms are plain JS numbers handed to
 * WebGL every frame.
 *
 * `to()` interrupts whatever is in flight. An array target ping-pongs between
 * its two values forever, which is how the listening and thinking pulses read.
 * `duration: 0` (or no transition) sets instantly, which live volume needs so
 * the picture never lags the audio.
 */
export function createTween(initial: number): {
  value: Accessor<number>;
  to(target: number | [number, number], transition?: Transition): void;
} {
  const [value, setValue] = createSignal(initial);
  let raf = 0;
  let disposed = false;

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  onCleanup(() => {
    disposed = true;
    stop();
  });

  function to(target: number | [number, number], transition?: Transition) {
    stop();
    if (disposed) return;

    const pingPong = Array.isArray(target);
    const [a, b] = pingPong ? target : [value(), target];

    if (!transition || (!isSpring(transition) && transition.duration === 0)) {
      setValue(pingPong ? a : b);
      return;
    }

    const durationMs = transition.duration * 1000;
    if (durationMs <= 0) {
      setValue(b);
      return;
    }

    if (typeof requestAnimationFrame === 'undefined') {
      setValue(b);
      return;
    }

    const ease = isSpring(transition)
      ? (t: number) => spring(t, transition.bounce)
      : EASINGS[transition.ease ?? 'easeOut'];

    // A ping-pong starts from its first value rather than wherever it was, so
    // the pulse reads the same every time it restarts.
    let from = pingPong ? a : value();
    let to_ = b;
    if (pingPong) setValue(a);

    // Origin is stamped when to() is called, NOT lazily on the first frame.
    // rAF timestamps share their time origin with performance.now(), so the two
    // are directly comparable. Seeding from a frame instead would charge the
    // idle gap since the previous tween finished against this tween's duration:
    // the loop stops when a tween settles, so every state change calls to() on
    // an idle tween and would snap straight to the target instead of easing.
    let startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      setValue(from + (to_ - from) * ease(t));

      if (t < 1) {
        raf = requestAnimationFrame(step);
        return;
      }

      if (!pingPong) {
        setValue(to_);
        raf = 0;
        return;
      }

      // Reverse and run again, restamping the origin for the new leg.
      setValue(to_);
      [from, to_] = [to_, from];
      startedAt = performance.now();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
  }

  return { value, to };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/create-tween.test.ts
```

Expected: PASS, 12 tests.

If the spring overshoot test fails, the damping constants need adjusting, not the test: the requirement is that `bounce: 0.5` visibly overshoots and `bounce: 0.3` settles. Tune `zeta`/`omega` until both hold.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/primitives/create-tween.ts packages/ui/src/primitives/create-tween.test.ts
git commit -m "feat(primitives): add numeric tween for shader uniforms"
```

---

## Task 5: Size scales and the bar variant

**Files:**
- Create: `packages/ui/src/components/audio-visualizer/sizes.ts`
- Create: `packages/ui/src/components/audio-visualizer/variant-bar.tsx`
- Test: `packages/ui/src/components/audio-visualizer/variant-bar.test.tsx`

**Interfaces:**
- Consumes: `VisualizerState`, `barSequence`, `barInterval` from `../../primitives/visualizer-sequences`; `useSequencer` from `../../primitives/use-sequencer`; `normalizeVolumeBands` from `../../primitives/audio-bands`.
- Produces:
  - `type VisualizerSize = 'icon' | 'sm' | 'md' | 'lg' | 'xl'`
  - `const CONTAINER_HEIGHT: Record<VisualizerSize, number>` and siblings `GAP`, `BAR_WIDTH`, `GRID_CELL`, `GRID_GAP`, `RADIAL_RADIUS`
  - `defaultBarCount(size: VisualizerSize): number`
  - `defaultRadialBarCount(size: VisualizerSize): number`
  - `defaultGridCount(size: VisualizerSize): number`
  - `interface VariantProps { state: VisualizerState; size: VisualizerSize; bands: number[]; frozen: boolean; color?: string; class?: string }`
  - `function BarVisualizer(props: VariantProps & { barCount?: number }): JSX.Element`

**Rendering contract, shared by all three DOM variants.** Every drawn element carries `part` (`bar` or `cell`), `data-kai-index`, and `data-kai-highlighted`, so consumers restyle from outside the shadow root. Bands are forced to all-zero unless `state === 'speaking'`; in every other state the sequence alone drives the highlight. `frozen` comes from `prefers-reduced-motion` and pins the sequencer at its first frame.

Sizes are numbers in a plain table, not Tailwind classes. Upstream uses `cva` with literal arbitrary values (`w-[4px]`), which cannot be interpolated and forces five variants per geometry. Inline styles from a table are shorter and let `barCount` vary freely.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/audio-visualizer/variant-bar.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { BarVisualizer } from './variant-bar';
import { defaultBarCount } from './sizes';

afterEach(cleanup);

const bars = (c: HTMLElement) => Array.from(c.querySelectorAll('[part="bar"]')) as HTMLElement[];

describe('defaultBarCount', () => {
  it('uses 3 bars at the two smallest sizes and 5 above', () => {
    expect(defaultBarCount('icon')).toBe(3);
    expect(defaultBarCount('sm')).toBe(3);
    expect(defaultBarCount('md')).toBe(5);
    expect(defaultBarCount('lg')).toBe(5);
    expect(defaultBarCount('xl')).toBe(5);
  });
});

describe('BarVisualizer', () => {
  it('renders one bar per band', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.1, 0.2, 0.3, 0.4, 0.5]} frozen={false} />
    ));
    expect(bars(container)).toHaveLength(5);
  });

  it('honours an explicit barCount over the band array length', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.5]} frozen={false} barCount={3} />
    ));
    expect(bars(container)).toHaveLength(3);
  });

  it('falls back to the size default when barCount is absent', () => {
    const { container } = render(() => (
      <BarVisualizer state="idle" size="icon" bands={[]} frozen={false} />
    ));
    expect(bars(container)).toHaveLength(3);
  });

  it('drives bar height from the bands while speaking', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0, 0.5, 1]} frozen={false} barCount={3} />
    ));
    const heights = bars(container).map((b) => b.style.height);
    expect(heights).toEqual(['0%', '50%', '100%']);
  });

  it('zeroes the heights in every state except speaking', () => {
    const { container } = render(() => (
      <BarVisualizer state="listening" size="md" bands={[1, 1, 1]} frozen={false} barCount={3} />
    ));
    bars(container).forEach((b) => expect(b.style.height).toBe('0%'));
  });

  it('lights every bar while speaking', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.5, 0.5, 0.5]} frozen={false} barCount={3} />
    ));
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('true'));
  });

  it('lights nothing when idle', () => {
    const { container } = render(() => (
      <BarVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={3} />
    ));
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('false'));
  });

  it('exposes a stable index on every bar for external styling', () => {
    const { container } = render(() => (
      <BarVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={4} />
    ));
    expect(bars(container).map((b) => b.dataset.kaiIndex)).toEqual(['0', '1', '2', '3']);
  });

  it('pads a short band array rather than dropping bars', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.4]} frozen={false} barCount={3} />
    ));
    expect(bars(container).map((b) => b.style.height)).toEqual(['40%', '40%', '40%']);
  });

  it('marks the host with the current state for CSS hooks', () => {
    const { container } = render(() => (
      <BarVisualizer state="thinking" size="md" bands={[]} frozen={false} />
    ));
    expect(container.querySelector('[data-kai-state="thinking"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-bar.test.tsx
```

Expected: FAIL, cannot resolve `./variant-bar`.

- [ ] **Step 3: Write the size tables**

Create `packages/ui/src/components/audio-visualizer/sizes.ts`:

```ts
/**
 * Size scales for the audio visualizer variants.
 *
 * Values carried from livekit/components-js `packages/shadcn/components/agents-ui/`
 * (Apache License 2.0). Kept as numbers rather than Tailwind classes so bar
 * counts and radii can be interpolated: upstream hardcodes arbitrary values
 * (`w-[4px]`) in cva variants, which cannot vary with a runtime count.
 */

export type VisualizerSize = 'icon' | 'sm' | 'md' | 'lg' | 'xl';

export const SIZES: readonly VisualizerSize[] = ['icon', 'sm', 'md', 'lg', 'xl'];

/** Overall height of the bar and radial containers, in px. */
export const CONTAINER_HEIGHT: Record<VisualizerSize, number> = {
  icon: 24, sm: 56, md: 112, lg: 224, xl: 448,
};

/** Gap between bars, in px. */
export const GAP: Record<VisualizerSize, number> = {
  icon: 2, sm: 4, md: 8, lg: 16, xl: 32,
};

/** Bar width, in px. Doubles as the bar's min-height so a dot shows at zero. */
export const BAR_WIDTH: Record<VisualizerSize, number> = {
  icon: 4, sm: 8, md: 16, lg: 32, xl: 64,
};

/** Grid cell diameter, in px. */
export const GRID_CELL: Record<VisualizerSize, number> = {
  icon: 2, sm: 4, md: 8, lg: 12, xl: 16,
};

/** Grid gap, in px. Note this diverges from GAP above at lg and xl. */
export const GRID_GAP: Record<VisualizerSize, number> = {
  icon: 2, sm: 4, md: 8, lg: 12, xl: 16,
};

/** Distance from center to the radial ring, in px. */
export const RADIAL_RADIUS: Record<VisualizerSize, number> = {
  icon: 6, sm: 16, md: 32, lg: 64, xl: 128,
};

export function defaultBarCount(size: VisualizerSize): number {
  return size === 'icon' || size === 'sm' ? 3 : 5;
}

export function defaultRadialBarCount(size: VisualizerSize): number {
  return size === 'icon' || size === 'sm' ? 12 : 24;
}

export function defaultGridCount(size: VisualizerSize): number {
  return size === 'icon' ? 3 : 5;
}
```

- [ ] **Step 4: Write the bar variant**

Create `packages/ui/src/components/audio-visualizer/variant-bar.tsx`:

```tsx
import { For, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';
import { normalizeVolumeBands } from '../../primitives/audio-bands';
import { useSequencer } from '../../primitives/use-sequencer';
import { barSequence, barInterval, type VisualizerState } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT, GAP, BAR_WIDTH, defaultBarCount, type VisualizerSize } from './sizes';

/** Props every DOM variant takes. The dispatcher supplies all of them. */
export interface VariantProps {
  state: VisualizerState;
  size: VisualizerSize;
  /** Multiband levels, 0..1. Only read while `state === 'speaking'`. */
  bands: number[];
  /** `prefers-reduced-motion`: pin the sequencer at its first frame. */
  frozen: boolean;
  /** Overrides the inherited `currentColor` the bars are painted with. */
  color?: string;
  class?: string;
}

/**
 * Vertical bars that rise with the audio while speaking, and run a scripted
 * pattern in every other state.
 *
 * Ported from livekit/components-js `agent-audio-visualizer-bar.tsx`
 * (Apache License 2.0).
 */
export function BarVisualizer(props: VariantProps & { barCount?: number }): JSX.Element {
  const count = () => props.barCount ?? defaultBarCount(props.size);

  // Frozen (reduced motion) parks the sequence on frame 0 rather than stopping
  // the component: the shape still reads, it just does not move.
  const tick = useSequencer(() => (props.frozen ? Infinity : barInterval(props.state, count())));

  const sequence = () => barSequence(props.state, count());
  const highlighted = () => sequence()[tick() % sequence().length] ?? [];

  // Bands only mean anything while speaking. Everywhere else the sequence is
  // the whole story, so a stale level never leaks into a scripted state.
  const levels = () =>
    props.state === 'speaking'
      ? normalizeVolumeBands(props.bands, count())
      : new Array(count()).fill(0);

  return (
    <div
      data-kai-state={props.state}
      class={cn('relative flex items-center justify-center', props.class)}
      style={{
        height: `${CONTAINER_HEIGHT[props.size]}px`,
        gap: `${GAP[props.size]}px`,
        ...(props.color ? { color: props.color } : {}),
      }}
    >
      <For each={levels()}>
        {(level, i) => (
          <div
            part="bar"
            data-kai-index={i()}
            data-kai-highlighted={highlighted().includes(i())}
            class={cn(
              'rounded-full bg-current/10 transition-colors duration-250 ease-linear',
              'data-[kai-highlighted=true]:bg-current',
            )}
            style={{
              width: `${BAR_WIDTH[props.size]}px`,
              'min-height': `${BAR_WIDTH[props.size]}px`,
              height: `${level * 100}%`,
            }}
          />
        )}
      </For>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-bar.test.tsx
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Add the render-prop seam**

Spec section 3 promises the exported Solid component takes a children render-prop for callers who want full control over each element, not just CSS. `::part()` covers restyling from outside the shadow root; this covers replacing the markup entirely from inside Solid.

Add to `VariantProps` in `variant-bar.tsx`:

```tsx
  /**
   * Render each element yourself. Receives the element's index, whether the
   * sequence has it lit, and its 0..1 level. `::part(bar)` handles restyling;
   * this is for replacing the markup outright.
   */
  children?: (item: { index: number; highlighted: boolean; value: number }) => JSX.Element;
```

Then in `BarVisualizer`, wrap the default bar:

```tsx
      <For each={levels()}>
        {(level, i) => {
          const item = () => ({
            index: i(),
            highlighted: highlighted().includes(i()),
            value: level,
          });
          return (
            props.children?.(item()) ?? (
              <div
                part="bar"
                data-kai-index={i()}
                data-kai-highlighted={item().highlighted}
                class={cn(
                  'rounded-full bg-current/10 transition-colors duration-250 ease-linear',
                  'data-[kai-highlighted=true]:bg-current',
                )}
                style={{
                  width: `${BAR_WIDTH[props.size]}px`,
                  'min-height': `${BAR_WIDTH[props.size]}px`,
                  height: `${level * 100}%`,
                }}
              />
            )
          );
        }}
      </For>
```

Apply the same wrapping in `GridVisualizer` (Task 6) and `RadialVisualizer` (Task 7), passing `value: levels()[index] ?? 0` for the grid. Since `VariantProps` is shared, the type comes for free once it is added here.

Add these tests to `variant-bar.test.tsx`:

```tsx
  it('lets a caller render each bar themselves', () => {
    const { container } = render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.5, 0.5]} frozen={false} barCount={2}>
        {(item) => <span data-custom={item.index}>{item.value}</span>}
      </BarVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(2);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(0);
  });

  it('hands the render-prop the live highlight state and level', () => {
    const seen: { index: number; highlighted: boolean; value: number }[] = [];
    render(() => (
      <BarVisualizer state="speaking" size="md" bands={[0.25, 0.75]} frozen={false} barCount={2}>
        {(item) => { seen.push(item); return <span />; }}
      </BarVisualizer>
    ));
    expect(seen.map((s) => s.value)).toEqual([0.25, 0.75]);
    expect(seen.every((s) => s.highlighted)).toBe(true);
  });
```

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-bar.test.tsx
```

Expected: PASS, 13 tests.

Note the facade does NOT expose this. A web component cannot take a Solid function as an attribute, and `::part()` is the right seam from HTML. This is for consumers importing the Solid component directly.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/audio-visualizer/sizes.ts packages/ui/src/components/audio-visualizer/variant-bar.tsx packages/ui/src/components/audio-visualizer/variant-bar.test.tsx
git commit -m "feat(components): add audio visualizer size scales and bar variant"
```

---

## Task 6: Grid variant

**Files:**
- Create: `packages/ui/src/components/audio-visualizer/variant-grid.tsx`
- Test: `packages/ui/src/components/audio-visualizer/variant-grid.test.tsx`

**Interfaces:**
- Consumes: `VariantProps` from `./variant-bar`; `gridSequence` from `../../primitives/visualizer-sequences`; `normalizeVolumeBands` from `../../primitives/audio-bands`; `useSequencer` from `../../primitives/use-sequencer`; `GRID_CELL`, `GRID_GAP`, `defaultGridCount` from `./sizes`.
- Produces: `function GridVisualizer(props: VariantProps & { rowCount?: number; columnCount?: number; spread?: number; interval?: number }): JSX.Element`

**The speaking rule.** A cell lights when its column's band clears a threshold set by how far the cell sits from the middle row. Middle-row cells light at any level; edge rows need a loud signal. That is what makes the grid read as a spectrum rather than a blinking field.

```
y            = floor(index / columnCount)
rowMidPoint  = floor(rowCount / 2)
volumeChunks = 1 / (rowMidPoint + 1)
threshold    = abs(rowMidPoint - y) * volumeChunks
highlighted  = bands[index % columnCount] >= threshold
```

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/audio-visualizer/variant-grid.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { GridVisualizer } from './variant-grid';

afterEach(cleanup);

const cells = (c: HTMLElement) => Array.from(c.querySelectorAll('[part="cell"]')) as HTMLElement[];
const lit = (c: HTMLElement) => cells(c).filter((e) => e.dataset.kaiHighlighted === 'true');

describe('GridVisualizer', () => {
  it('renders rowCount x columnCount cells', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={4} columnCount={6} />
    ));
    expect(cells(container)).toHaveLength(24);
  });

  it('defaults to 5x5, or 3x3 at icon size', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} />
    ));
    expect(cells(container)).toHaveLength(25);
    cleanup();
    const small = render(() => (
      <GridVisualizer state="idle" size="icon" bands={[]} frozen={false} />
    ));
    expect(cells(small.container)).toHaveLength(9);
  });

  it('lays out the columns via grid-template-columns', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={3} columnCount={4} />
    ));
    const host = container.querySelector('[data-kai-state]') as HTMLElement;
    expect(host.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });

  it('lights the full column when a band is at full level', () => {
    const { container } = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        rowCount={5} columnCount={3} bands={[1, 0, 0]}
      />
    ));
    // Column 0 clears every row threshold; columns 1 and 2 clear only the middle row.
    const litIdx = lit(container).map((e) => Number(e.dataset.kaiIndex));
    expect(litIdx).toContain(0);   // row 0, col 0
    expect(litIdx).toContain(6);   // row 2, col 0
    expect(litIdx).toContain(12);  // row 4, col 0
    expect(litIdx).not.toContain(1); // row 0, col 1 needs a loud band
  });

  it('lights only the middle row of a silent column', () => {
    const { container } = render(() => (
      <GridVisualizer
        state="speaking" size="md" frozen={false}
        rowCount={5} columnCount={1} bands={[0]}
      />
    ));
    // threshold at the middle row is 0, so a zero band still clears it.
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['2']);
  });

  it('lights exactly one cell in a scripted state', () => {
    const { container } = render(() => (
      <GridVisualizer state="thinking" size="md" bands={[]} frozen={false} rowCount={5} columnCount={5} />
    ));
    expect(lit(container)).toHaveLength(1);
  });

  it('rests on the center cell when idle', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={5} columnCount={5} />
    ));
    expect(lit(container).map((e) => e.dataset.kaiIndex)).toEqual(['12']);
  });

  it('indexes every cell in row-major order', () => {
    const { container } = render(() => (
      <GridVisualizer state="idle" size="md" bands={[]} frozen={false} rowCount={2} columnCount={3} />
    ));
    expect(cells(container).map((e) => e.dataset.kaiIndex)).toEqual(['0', '1', '2', '3', '4', '5']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-grid.test.tsx
```

Expected: FAIL, cannot resolve `./variant-grid`.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/components/audio-visualizer/variant-grid.tsx`:

```tsx
import { For, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';
import { normalizeVolumeBands } from '../../primitives/audio-bands';
import { useSequencer } from '../../primitives/use-sequencer';
import { gridSequence } from '../../primitives/visualizer-sequences';
import { GRID_CELL, GRID_GAP, defaultGridCount } from './sizes';
import type { VariantProps } from './variant-bar';

/**
 * A grid of dots that pulses with the audio.
 *
 * Ported from livekit/components-js `agent-audio-visualizer-grid.tsx`
 * (Apache License 2.0).
 */
export function GridVisualizer(
  props: VariantProps & {
    rowCount?: number;
    columnCount?: number;
    /** Ring distance from center for the connecting animation, in cells. */
    spread?: number;
    /** Ms between scripted frames. Default 100. */
    interval?: number;
  },
): JSX.Element {
  const rows = () => props.rowCount ?? defaultGridCount(props.size);
  const cols = () => props.columnCount ?? defaultGridCount(props.size);
  const interval = () => props.interval ?? 100;
  const items = () => Array.from({ length: rows() * cols() }, (_, i) => i);

  const tick = useSequencer(() =>
    // Speaking is driven by audio, not the clock; freezing also parks it.
    props.frozen || props.state === 'speaking' ? Infinity : interval(),
  );

  const sequence = () => gridSequence(props.state, rows(), cols(), props.spread);
  const active = () => sequence()[tick() % sequence().length] ?? { x: -1, y: -1 };

  const levels = () => normalizeVolumeBands(props.bands, cols());

  /**
   * While speaking, a cell lights when its column's level clears a threshold
   * that grows with distance from the middle row. Middle cells light at any
   * level, edges need a loud signal, so the grid reads as a spectrum.
   */
  function isLit(index: number): boolean {
    if (props.state === 'speaking') {
      const y = Math.floor(index / cols());
      const mid = Math.floor(rows() / 2);
      const chunk = 1 / (mid + 1);
      const threshold = Math.abs(mid - y) * chunk;
      return (levels()[index % cols()] ?? 0) >= threshold;
    }
    return active().x === index % cols() && active().y === Math.floor(index / cols());
  }

  /** Snap on, fade off: highlighted cells transition 10x faster than they decay. */
  function transition(index: number): string {
    if (props.state === 'speaking') return '150ms';
    return `${interval() / (isLit(index) ? 1000 : 100)}s`;
  }

  return (
    <div
      data-kai-state={props.state}
      class={cn('grid', props.class)}
      style={{
        'grid-template-columns': `repeat(${cols()}, 1fr)`,
        gap: `${GRID_GAP[props.size]}px`,
        ...(props.color ? { color: props.color } : {}),
      }}
    >
      <For each={items()}>
        {(index) => (
          <div
            part="cell"
            data-kai-index={index}
            data-kai-highlighted={isLit(index)}
            class={cn(
              'place-self-center rounded-full bg-current/10 transition-all ease-out',
              'data-[kai-highlighted=true]:bg-current',
            )}
            style={{
              width: `${GRID_CELL[props.size]}px`,
              height: `${GRID_CELL[props.size]}px`,
              'transition-duration': transition(index),
            }}
          />
        )}
      </For>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-grid.test.tsx
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/audio-visualizer/variant-grid.tsx packages/ui/src/components/audio-visualizer/variant-grid.test.tsx
git commit -m "feat(components): add audio visualizer grid variant"
```

---

## Task 7: Radial variant

**Files:**
- Create: `packages/ui/src/components/audio-visualizer/variant-radial.tsx`
- Test: `packages/ui/src/components/audio-visualizer/variant-radial.test.tsx`

**Interfaces:**
- Consumes: `VariantProps` from `./variant-bar`; `radialSequence`, `radialInterval` from `../../primitives/visualizer-sequences`; `CONTAINER_HEIGHT`, `RADIAL_RADIUS`, `defaultRadialBarCount` from `./sizes`.
- Produces: `function RadialVisualizer(props: VariantProps & { barCount?: number; radius?: number }): JSX.Element`

**Geometry.** For bar `i` of `barCount`:

```
angle     = (i / barCount) * 2 * PI
transform = rotate(${angle}rad) translateY(${radius}px)
dotSize   = radius * PI / barCount        // width, and min-height
height    = state === 'speaking' ? dotSize * 10 * band : 0
```

`thinking` spins the whole container in CSS (5s linear) with every bar lit and the sequencer parked. That is why `radialInterval('thinking')` returns `Infinity`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/audio-visualizer/variant-radial.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { RadialVisualizer } from './variant-radial';
import { defaultRadialBarCount } from './sizes';

afterEach(cleanup);

const bars = (c: HTMLElement) => Array.from(c.querySelectorAll('[part="bar"]')) as HTMLElement[];
const spokes = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-kai-spoke]')) as HTMLElement[];

describe('defaultRadialBarCount', () => {
  it('uses 12 bars at the two smallest sizes and 24 above', () => {
    expect(defaultRadialBarCount('icon')).toBe(12);
    expect(defaultRadialBarCount('sm')).toBe(12);
    expect(defaultRadialBarCount('md')).toBe(24);
  });
});

describe('RadialVisualizer', () => {
  it('renders one bar per position around the ring', () => {
    const { container } = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={8} />
    ));
    expect(bars(container)).toHaveLength(8);
  });

  it('spaces the spokes evenly around a full turn', () => {
    const { container } = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={4} radius={40} />
    ));
    const transforms = spokes(container).map((s) => s.style.transform);
    expect(transforms[0]).toContain('rotate(0rad)');
    expect(transforms[1]).toContain(`rotate(${Math.PI / 2}rad)`);
    expect(transforms[2]).toContain(`rotate(${Math.PI}rad)`);
    transforms.forEach((t) => expect(t).toContain('translateY(40px)'));
  });

  it('sizes each dot from the circumference so bars never overlap', () => {
    const { container } = render(() => (
      <RadialVisualizer state="idle" size="md" bands={[]} frozen={false} barCount={8} radius={40} />
    ));
    const expected = (40 * Math.PI) / 8;
    expect(bars(container)[0]!.style.width).toBe(`${expected}px`);
  });

  it('collapses every bar to zero height outside speaking', () => {
    const { container } = render(() => (
      <RadialVisualizer state="listening" size="md" bands={[1, 1, 1, 1]} frozen={false} barCount={4} />
    ));
    bars(container).forEach((b) => expect(b.style.height).toBe('0px'));
  });

  it('extends bars from the bands while speaking', () => {
    const { container } = render(() => (
      <RadialVisualizer
        state="speaking" size="md" frozen={false}
        barCount={4} radius={40} bands={[0, 0.5, 1, 0]}
      />
    ));
    const dot = (40 * Math.PI) / 4;
    const heights = bars(container).map((b) => b.style.height);
    expect(heights[0]).toBe('0px');
    expect(heights[1]).toBe(`${dot * 10 * 0.5}px`);
    expect(heights[2]).toBe(`${dot * 10 * 1}px`);
  });

  it('lights the whole ring and spins while thinking', () => {
    const { container } = render(() => (
      <RadialVisualizer state="thinking" size="md" bands={[]} frozen={false} barCount={8} />
    ));
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('true'));
    const host = container.querySelector('[data-kai-state="thinking"]') as HTMLElement;
    expect(host.className).toContain('animate-spin');
  });

  it('does not spin while frozen for reduced motion', () => {
    const { container } = render(() => (
      <RadialVisualizer state="thinking" size="md" bands={[]} frozen={true} barCount={8} />
    ));
    const host = container.querySelector('[data-kai-state="thinking"]') as HTMLElement;
    expect(host.className).not.toContain('animate-spin');
  });

  it('lights the whole ring while speaking', () => {
    const { container } = render(() => (
      <RadialVisualizer state="speaking" size="md" bands={[0.5, 0.5, 0.5, 0.5]} frozen={false} barCount={4} />
    ));
    bars(container).forEach((b) => expect(b.dataset.kaiHighlighted).toBe('true'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-radial.test.tsx
```

Expected: FAIL, cannot resolve `./variant-radial`.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/components/audio-visualizer/variant-radial.tsx`:

```tsx
import { For, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';
import { normalizeVolumeBands } from '../../primitives/audio-bands';
import { useSequencer } from '../../primitives/use-sequencer';
import { radialSequence, radialInterval } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT, RADIAL_RADIUS, defaultRadialBarCount } from './sizes';
import type { VariantProps } from './variant-bar';

/**
 * Bars arranged around a circle, growing outward with the audio.
 *
 * Ported from livekit/components-js `agent-audio-visualizer-radial.tsx`
 * (Apache License 2.0).
 */
export function RadialVisualizer(
  props: VariantProps & { barCount?: number; radius?: number },
): JSX.Element {
  const count = () => props.barCount ?? defaultRadialBarCount(props.size);
  const radius = () => props.radius ?? RADIAL_RADIUS[props.size];

  // Chord length at this radius: keeps neighbouring dots from touching however
  // many bars are on the ring.
  const dotSize = () => (radius() * Math.PI) / count();

  const tick = useSequencer(() => (props.frozen ? Infinity : radialInterval(props.state)));
  const sequence = () => radialSequence(props.state, count());
  const highlighted = () => sequence()[tick() % sequence().length] ?? [];

  const levels = () =>
    props.state === 'speaking'
      ? normalizeVolumeBands(props.bands, count())
      : new Array(count()).fill(0);

  // `thinking` parks the sequencer (interval Infinity) and spins the container
  // instead, so the lit ring rotates as one piece.
  const spinning = () => props.state === 'thinking' && !props.frozen;

  return (
    <div
      data-kai-state={props.state}
      class={cn(
        'relative flex items-center justify-center',
        spinning() && 'animate-spin [animation-duration:5s]',
        props.class,
      )}
      style={{
        height: `${CONTAINER_HEIGHT[props.size]}px`,
        'aspect-ratio': '1',
        ...(props.color ? { color: props.color } : {}),
      }}
    >
      <For each={levels()}>
        {(level, i) => (
          <div
            data-kai-spoke
            class="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2"
            style={{
              'transform-origin': 'center',
              transform: `rotate(${(i() / count()) * Math.PI * 2}rad) translateY(${radius()}px)`,
            }}
          >
            <div
              part="bar"
              data-kai-index={i()}
              data-kai-highlighted={highlighted().includes(i())}
              class={cn(
                'origin-bottom rounded-full bg-current/10',
                'transition-colors duration-150 ease-linear',
                'data-[kai-highlighted=true]:bg-current',
              )}
              style={{
                width: `${dotSize()}px`,
                'min-height': `${dotSize()}px`,
                // x10 so a mid-level band reaches a readable length; upstream's factor.
                height: props.state === 'speaking' ? `${dotSize() * 10 * level}px` : '0px',
              }}
            />
          </div>
        )}
      </For>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-radial.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Warn on a bar count that will not look right**

Upstream warns when `barCount` is not divisible by 4, because the ring loses its symmetry. Add it at the top of `RadialVisualizer`, guarded so it fires once per mount rather than per render:

```tsx
  if (count() % 4 !== 0) {
    console.warn(
      `<kai-audio-visualizer variant="radial">: barCount ${count()} is not divisible by 4. ` +
      `The ring will look asymmetric.`,
    );
  }
```

- [ ] **Step 6: Run the whole suite and commit**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
nx typecheck ui
git add packages/ui/src/components/audio-visualizer/variant-radial.tsx packages/ui/src/components/audio-visualizer/variant-radial.test.tsx
git commit -m "feat(components): add audio visualizer radial variant"
```

---

## Task 8: Dispatcher

**Files:**
- Create: `packages/ui/src/components/audio-visualizer/index.tsx`
- Test: `packages/ui/src/components/audio-visualizer/index.test.tsx`

**Interfaces:**
- Consumes: `BarVisualizer`/`VariantProps` (Task 5), `GridVisualizer` (Task 6), `RadialVisualizer` (Task 7), `useAudioAnalysis` (Task 3), `normalizeState` (Task 2), `defaultBarCount` (Task 5).
- Produces:
  - `type VisualizerVariant = 'bar' | 'grid' | 'radial' | 'wave' | 'aura' | 'custom'`
  - `interface ShaderSpec { fragment: string; uniforms?: Record<string, { type: string; value: number | number[] }> }`
  - `interface AudioVisualizerProps { variant?; state?; size?; barCount?; rowCount?; columnCount?; radius?; spread?; interval?; color?; complexity?; label?; stream?; audioElement?; bands?; shader?; class? }`
  - `function AudioVisualizer(props: AudioVisualizerProps): JSX.Element`
  - `function usePrefersReducedMotion(): Accessor<boolean>`

**The lazy boundary is load-bearing.** `vite.config.ts` sets `treeshake: false` on the register-all bundle by design, so anything statically imported here lands in `kai.es.js` for every consumer, including one who only uses `<kai-chat>`. The shader path is roughly 25 to 30 KB and GLSL does not compress. **Never convert these to static imports.** Task 16 adds a guard.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/audio-visualizer/index.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import { AudioVisualizer } from './index';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('AudioVisualizer dispatch', () => {
  it('renders bars by default', () => {
    const { container } = render(() => <AudioVisualizer />);
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);
  });

  it('renders cells for the grid variant', () => {
    const { container } = render(() => <AudioVisualizer variant="grid" />);
    expect(container.querySelectorAll('[part="cell"]').length).toBe(25);
  });

  it('renders spokes for the radial variant', () => {
    const { container } = render(() => <AudioVisualizer variant="radial" />);
    expect(container.querySelectorAll('[data-kai-spoke]').length).toBe(24);
  });

  it('falls back to bars for an unknown variant', () => {
    const { container } = render(() => <AudioVisualizer variant={'nonsense' as never} />);
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);
  });

  it('normalizes a LiveKit state alias onto ours', () => {
    const { container } = render(() => <AudioVisualizer state={'initializing' as never} />);
    expect(container.querySelector('[data-kai-state="connecting"]')).toBeTruthy();
  });

  it('passes caller-supplied bands straight through without touching Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const { container } = render(() => (
      <AudioVisualizer variant="bar" state="speaking" barCount={3} bands={[0.2, 0.4, 0.6]} />
    ));
    const heights = Array.from(container.querySelectorAll('[part="bar"]')).map(
      (b) => (b as HTMLElement).style.height,
    );
    expect(heights).toEqual(['20%', '40%', '60%']);
  });

  it('is decorative by default', () => {
    const { container } = render(() => <AudioVisualizer />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
  });

  it('becomes an labelled image when a label is given', () => {
    const { container } = render(() => <AudioVisualizer label="Assistant audio" />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Assistant audio');
    expect(host.getAttribute('aria-hidden')).toBeNull();
  });

  it('renders a bar fallback while a shader variant loads', () => {
    const { container } = render(() => <AudioVisualizer variant="aura" />);
    // The dynamic import has not resolved on the first synchronous frame.
    expect(container.querySelectorAll('[part="bar"]').length).toBeGreaterThan(0);
  });

  it('freezes the sequence when the user prefers reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(() => <AudioVisualizer variant="radial" state="thinking" />);
    await waitFor(() => {
      const host = container.querySelector('[data-kai-state="thinking"]') as HTMLElement;
      expect(host.className).not.toContain('animate-spin');
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/index.test.tsx
```

Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/components/audio-visualizer/index.tsx`:

```tsx
import {
  createSignal, createEffect, onCleanup, Show, Switch, Match,
  type Accessor, type Component, type JSX,
} from 'solid-js';
import { cn } from '../../utils/cn';
import { useAudioAnalysis } from '../../primitives/use-audio-analysis';
import { normalizeState, type VisualizerState } from '../../primitives/visualizer-sequences';
import { BarVisualizer, type VariantProps } from './variant-bar';
import { GridVisualizer } from './variant-grid';
import { RadialVisualizer } from './variant-radial';
import { defaultBarCount, type VisualizerSize } from './sizes';

export type VisualizerVariant = 'bar' | 'grid' | 'radial' | 'wave' | 'aura' | 'custom';

/** A consumer-supplied fragment shader, for `variant="custom"`. */
export interface ShaderSpec {
  /** GLSL source defining `mainImage(out vec4 fragColor, in vec2 fragCoord)`. */
  fragment: string;
  /**
   * Custom uniforms. The canvas DECLARES these for you; declaring them in the
   * shader too is a compile error.
   */
  uniforms?: Record<string, { type: string; value: number | number[] }>;
}

export interface AudioVisualizerProps {
  variant?: VisualizerVariant;
  state?: string;
  size?: VisualizerSize;
  barCount?: number;
  rowCount?: number;
  columnCount?: number;
  /** Radial only: distance from center, in px. */
  radius?: number;
  /** Grid only: ring distance for the connecting animation, in cells. */
  spread?: number;
  /** Grid only: ms between scripted frames. */
  interval?: number;
  color?: string;
  /** Shader variants only: pattern density, 0..1. */
  complexity?: number;
  /** Setting this makes the element an announced image instead of decorative. */
  label?: string;
  stream?: MediaStream;
  audioElement?: HTMLMediaElement;
  /** Pre-computed levels. Set this and no AudioContext is ever constructed. */
  bands?: number[];
  shader?: ShaderSpec;
  class?: string;
}

/** Tracks `prefers-reduced-motion`, live. */
export function usePrefersReducedMotion(): Accessor<boolean> {
  const [reduced, setReduced] = createSignal(false);

  createEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    onCleanup(() => mq.removeEventListener?.('change', onChange));
  });

  return reduced;
}

/**
 * Shader variants live behind a dynamic import so the WebGL runtime and the
 * GLSL strings (about 25 to 30 KB) never reach a consumer who does not ask for
 * them.
 *
 * This MUST stay dynamic. `vite.config.ts` disables tree-shaking on the
 * register-all bundle by design, so a static import here would put the whole
 * shader path into `kai.es.js` for everyone, including a `<kai-chat>`-only user.
 */
const SHADER_VARIANTS: Record<string, () => Promise<{ default: Component<never> }>> = {
  wave: () => import('./variant-wave'),
  aura: () => import('./variant-aura'),
  custom: () => import('./variant-custom'),
};

export function AudioVisualizer(props: AudioVisualizerProps): JSX.Element {
  const variant = () => props.variant ?? 'bar';
  const size = () => props.size ?? 'md';
  const state = (): VisualizerState => normalizeState(props.state);
  const reduced = usePrefersReducedMotion();

  const isShader = () => variant() in SHADER_VARIANTS;

  // How many buckets the analyser should produce. Grid keys off columns, radial
  // off its own default, everything else off the bar count.
  const bandCount = () => {
    if (variant() === 'grid') return props.columnCount ?? (size() === 'icon' ? 3 : 5);
    if (variant() === 'radial') return props.barCount ?? (size() === 'icon' || size() === 'sm' ? 12 : 24);
    return props.barCount ?? defaultBarCount(size());
  };

  // A caller-supplied `bands` array short-circuits Web Audio entirely, which is
  // what keeps the headless and SSR paths free of an AudioContext.
  const source = () => (props.bands ? undefined : props.stream ?? props.audioElement);
  const analysis = useAudioAnalysis(source, { bands: bandCount() });
  const bands = () => props.bands ?? analysis.bands();

  // Lazily loaded shader component, or undefined until it resolves. Failure is
  // not fatal: the bar fallback below stays on screen.
  const [Shader, setShader] = createSignal<Component<never> | undefined>();
  createEffect(() => {
    const v = variant();
    const load = SHADER_VARIANTS[v];
    if (!load) {
      setShader(undefined);
      return;
    }
    let cancelled = false;
    void load()
      .then((m) => { if (!cancelled) setShader(() => m.default); })
      .catch((err) => {
        console.warn(`<kai-audio-visualizer variant="${v}">: failed to load the shader chunk, falling back to bars.`, err);
      });
    onCleanup(() => { cancelled = true; });
  });

  const shared = (): VariantProps => ({
    state: state(),
    size: size(),
    bands: bands(),
    frozen: reduced(),
    color: props.color,
  });

  const a11y = () =>
    props.label
      ? { role: 'img', 'aria-label': props.label }
      : { 'aria-hidden': 'true' as const };

  return (
    <div class={cn('inline-flex', props.class)} {...a11y()}>
      <Switch
        fallback={<BarVisualizer {...shared()} barCount={props.barCount} />}
      >
        <Match when={variant() === 'grid'}>
          <GridVisualizer
            {...shared()}
            rowCount={props.rowCount}
            columnCount={props.columnCount}
            spread={props.spread}
            interval={props.interval}
          />
        </Match>
        <Match when={variant() === 'radial'}>
          <RadialVisualizer {...shared()} barCount={props.barCount} radius={props.radius} />
        </Match>
        <Match when={isShader()}>
          {/* Bars stand in until the chunk resolves, and permanently if it cannot. */}
          <Show
            when={Shader()}
            fallback={<BarVisualizer {...shared()} barCount={props.barCount} />}
          >
            {(Comp) => {
              const C = Comp() as Component<Record<string, unknown>>;
              return (
                <C
                  {...shared()}
                  volume={analysis.volume()}
                  complexity={props.complexity}
                  shader={props.shader}
                />
              );
            }}
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
```

- [ ] **Step 4: Stub the three shader variants so the dynamic imports resolve**

The dispatcher references `./variant-wave`, `./variant-aura`, `./variant-custom`, which Tasks 12 to 15 build. Create minimal default exports now so typecheck and tests pass, and so the lazy boundary is exercised from this task onward.

Create each of `variant-wave.tsx`, `variant-aura.tsx`, `variant-custom.tsx` in `packages/ui/src/components/audio-visualizer/` with:

```tsx
import type { JSX } from 'solid-js';

/** Placeholder. Replaced in a later task. Renders nothing so the fallback shows. */
export default function Placeholder(): JSX.Element {
  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/index.test.tsx
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
nx typecheck ui
git add packages/ui/src/components/audio-visualizer/
git commit -m "feat(components): add audio visualizer dispatcher with lazy shader variants"
```

---

## Task 9: The kai-audio-visualizer element

**Files:**
- Create: `packages/ui/src/elements/audio-visualizer.tsx`
- Modify: `packages/ui/src/elements/register-impl.ts`
- Test: `packages/ui/src/elements/audio-visualizer.declarative.test.tsx`

**Interfaces:**
- Consumes: `AudioVisualizer`, `ShaderSpec` from `../components/audio-visualizer`; `defineWebComponent` from `./define`.
- Produces: the registered `<kai-audio-visualizer>` custom element.

**Contract reminders.** Scalars are attributes; `stream`, `audioElement`, `bands`, `shader` are JS properties only. No events and no methods: this is a display element, so it stays off the interaction-API surface. Attribute values arrive as strings, so every numeric prop needs `Number(...)`.

- [ ] **Step 1: Write the failing test**

`defineWebComponent` needs a real browser (Constructable Stylesheets, shadow roots) and is unsuitable for jsdom, so the established pattern tests the facade's CONTRACT against the component it composes. Create `packages/ui/src/elements/audio-visualizer.declarative.test.tsx`:

```tsx
/**
 * Unit tests for the declarative `<kai-audio-visualizer>` API.
 *
 * Mirrors toast.declarative.test.tsx: exercise `AudioVisualizer` directly with
 * the values the facade would hand it after attribute coercion, rather than
 * upgrading a real custom element (which jsdom cannot do).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { AudioVisualizer } from '../components/audio-visualizer';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
  vi.stubGlobal('AudioContext', undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('kai-audio-visualizer declarative API', () => {
  it('coerces a string bar-count attribute to a number', () => {
    const { container } = render(() => <AudioVisualizer barCount={Number('7')} />);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(7);
  });

  it('coerces string row-count and column-count', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="grid" rowCount={Number('3')} columnCount={Number('4')} />
    ));
    expect(container.querySelectorAll('[part="cell"]')).toHaveLength(12);
  });

  it('applies a color attribute to the rendered geometry', () => {
    const { container } = render(() => <AudioVisualizer color="#ff0000" />);
    const host = container.querySelector('[data-kai-state]') as HTMLElement;
    expect(host.style.color).toBe('rgb(255, 0, 0)');
  });

  it('accepts bands set as a JS property', () => {
    const { container } = render(() => (
      <AudioVisualizer state="speaking" barCount={2} bands={[0.25, 0.75]} />
    ));
    const heights = Array.from(container.querySelectorAll('[part="bar"]')).map(
      (b) => (b as HTMLElement).style.height,
    );
    expect(heights).toEqual(['25%', '75%']);
  });

  it('re-renders when bands is replaced with a new array reference', () => {
    const [get, set] = (() => {
      let v = [0.1, 0.1];
      const subs: (() => void)[] = [];
      return [() => v, (n: number[]) => { v = n; subs.forEach((f) => f()); }] as const;
    })();
    // Streaming requires a NEW array reference per frame; mutation does not re-render.
    expect(get()).not.toBe([0.1, 0.1]);
    set([0.9, 0.9]);
    expect(get()).toEqual([0.9, 0.9]);
  });

  it('defaults every optional attribute to a working visualizer', () => {
    const { container } = render(() => <AudioVisualizer />);
    expect(container.querySelectorAll('[part="bar"]')).toHaveLength(5);
    expect(container.querySelector('[data-kai-state="idle"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/audio-visualizer.declarative.test.tsx
```

Expected: FAIL, cannot resolve `../components/audio-visualizer`. If Task 8 is done this resolves; the test should then fail only on assertions you have not implemented. Either way, confirm red before green.

- [ ] **Step 3: Write the facade**

Create `packages/ui/src/elements/audio-visualizer.tsx`:

```tsx
import { AudioVisualizer, type ShaderSpec, type VisualizerVariant } from '../components/audio-visualizer';
import type { VisualizerSize } from '../components/audio-visualizer/sizes';
import { defineWebComponent } from './define';

interface Props extends Record<string, unknown> {
  /** Look to render: `bar` (default), `grid`, `radial`, `wave`, `aura`, `custom`. Attribute: `variant`. */
  variant?: string;
  /** `idle` (default), `connecting`, `listening`, `thinking`, `speaking`. LiveKit aliases accepted. Attribute: `state`. */
  state?: string;
  /** `icon` | `sm` | `md` (default) | `lg` | `xl`. Attribute: `size`. */
  size?: string;
  /** Bars to draw. Bar and radial only. Attribute: `bar-count`. */
  barCount?: number;
  /** Grid rows. Attribute: `row-count`. */
  rowCount?: number;
  /** Grid columns. Attribute: `column-count`. */
  columnCount?: number;
  /** Radial ring distance from center, in px. Attribute: `radius`. */
  radius?: number;
  /** Grid connecting-animation ring distance, in cells. Attribute: `spread`. */
  spread?: number;
  /** Grid ms between scripted frames. Attribute: `interval`. */
  interval?: number;
  /** CSS color for the geometry. Attribute: `color`. */
  color?: string;
  /** Shader pattern density, 0..1. Attribute: `complexity`. */
  complexity?: number;
  /** Announce the visualizer with this label instead of hiding it. Attribute: `label`. */
  label?: string;
  /** Live microphone or WebRTC audio. JS property only. */
  stream?: MediaStream;
  /** An `<audio>` or `<video>` element to tap. JS property only. */
  audioElement?: HTMLMediaElement;
  /** Pre-computed levels, 0..1. Set this and no AudioContext is built. JS property only. */
  bands?: number[];
  /** Custom fragment shader for `variant="custom"`. JS property only. */
  shader?: ShaderSpec;
}

/** Parse a numeric attribute. Attributes arrive as strings; blank means unset. */
function num(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `<kai-audio-visualizer>` renders live audio as bars, a grid, a ring, a wave,
 * or a glowing aura. It also animates from `state` alone with no audio at all,
 * which is what you want when the source cannot be tapped (browser speech
 * synthesis exposes no audio node).
 *
 * ```html
 * <kai-audio-visualizer variant="bar" state="speaking" size="md"></kai-audio-visualizer>
 * <kai-audio-visualizer variant="radial" size="lg" bar-count="24"></kai-audio-visualizer>
 * ```
 *
 * Audio sources are JS properties, never attributes:
 * ```js
 * el.stream = micStream            // MediaStream
 * el.audioElement = audioRef       // HTMLMediaElement
 * el.bands = [0.2, 0.8, 0.4]       // pre-computed, skips Web Audio
 * ```
 *
 * Restyle from outside via `::part(bar)` / `::part(cell)`, each carrying
 * `data-kai-index` and `data-kai-highlighted`.
 */
defineWebComponent<Props>('kai-audio-visualizer', {
  variant: 'bar',
  state: 'idle',
  size: 'md',
  barCount: undefined,
  rowCount: undefined,
  columnCount: undefined,
  radius: undefined,
  spread: undefined,
  interval: undefined,
  color: undefined,
  complexity: undefined,
  label: undefined,
  stream: undefined,
  audioElement: undefined,
  bands: undefined,
  shader: undefined,
}, (props) => (
  <AudioVisualizer
    variant={props.variant as VisualizerVariant | undefined}
    state={props.state as string | undefined}
    size={props.size as VisualizerSize | undefined}
    barCount={num(props.barCount)}
    rowCount={num(props.rowCount)}
    columnCount={num(props.columnCount)}
    radius={num(props.radius)}
    spread={num(props.spread)}
    interval={num(props.interval)}
    color={props.color as string | undefined}
    complexity={num(props.complexity)}
    label={props.label as string | undefined}
    stream={props.stream as MediaStream | undefined}
    audioElement={props.audioElement as HTMLMediaElement | undefined}
    bands={props.bands as number[] | undefined}
    shader={props.shader as ShaderSpec | undefined}
  />
));
```

- [ ] **Step 4: Register the element**

In `packages/ui/src/elements/register-impl.ts`, add the import beside the other input-ecosystem elements (near `import './voice-input';`):

```ts
import './audio-visualizer';
```

This file is hand-maintained and the API generator skips it, so the import must be added by hand.

- [ ] **Step 5: Run the tests and verify registration**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/audio-visualizer.declarative.test.tsx
nx typecheck ui
```

Expected: PASS, 6 tests, and 4 clean tsc passes.

- [ ] **Step 6: Confirm the element count went up by one**

```bash
nx build ui
git checkout -- packages/ui/src/components/component-meta.json
grep -c '"kai-' packages/ui/src/elements/element-manifest.json
```

Expected: 89. If the manifest did not pick it up, the `register-impl.ts` import is missing.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/elements/audio-visualizer.tsx packages/ui/src/elements/audio-visualizer.declarative.test.tsx packages/ui/src/elements/register-impl.ts packages/ui/src/elements/element-manifest.json packages/ui/src/elements/element-meta.json
git commit -m "feat(elements): add kai-audio-visualizer"
```

---

## Task 10: Stories for the DOM variants

**Files:**
- Create: `packages/ui/src/components/audio-visualizer/audio-visualizer.stories.tsx`

**Interfaces:**
- Consumes: `AudioVisualizer` from `./index`.
- Produces: nothing consumed by later tasks.

**Convention.** New components get SolidJS `Components/*` stories, which are the canonical surface. Copy is terse and written for developers: no When/How/Placement boilerplate, no em dashes, no spoon-feeding.

A live-microphone story is deliberately excluded here: `getUserMedia` prompts for a permission the Storybook a11y test run cannot answer, which would hang CI. Mic verification happens in the IVP (Task 18).

- [ ] **Step 1: Write the stories**

Create `packages/ui/src/components/audio-visualizer/audio-visualizer.stories.tsx`:

```tsx
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, onCleanup, For } from 'solid-js';
import { AudioVisualizer } from './index';
import { componentDescription } from '../../stories/docs/element-controls';
import { SIZES } from './sizes';

const STATES = ['idle', 'connecting', 'listening', 'thinking', 'speaking'] as const;

const meta = {
  title: 'Components/Elements/AudioVisualizer',
  component: AudioVisualizer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'Renders live audio as bars, a grid, a ring, a wave, or a glowing aura. Set `stream` or `audioElement` to tap real audio, or `bands` to drive it yourself.',
        'With no source at all it animates from `state` alone, which is what you need when the audio cannot be tapped. Browser speech synthesis exposes no audio node.',
        'Restyle from outside the shadow root via `::part(bar)` and `::part(cell)`, both carrying `data-kai-index` and `data-kai-highlighted`.',
      ]),
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['bar', 'grid', 'radial', 'wave', 'aura'],
      description: 'Which look to render.',
      table: { defaultValue: { summary: 'bar' } },
    },
    state: {
      control: 'select',
      options: [...STATES],
      description: 'Drives the scripted animation. `speaking` hands control to the audio.',
      table: { defaultValue: { summary: 'idle' } },
    },
    size: {
      control: 'select',
      options: [...SIZES],
      table: { defaultValue: { summary: 'md' } },
    },
    barCount: { control: 'number', description: 'Bar and radial only.' },
    color: { control: 'color' },
  },
} satisfies Meta<typeof AudioVisualizer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: 'bar', state: 'listening', size: 'md' },
};

/** Synthetic levels so the speaking state animates without a microphone. */
function useFakeBands(count: number) {
  const [bands, setBands] = createSignal<number[]>(new Array(count).fill(0));
  const id = setInterval(() => {
    // A new array reference every tick. Mutating in place does not re-render.
    setBands(Array.from({ length: count }, (_, i) => 0.25 + 0.7 * Math.abs(Math.sin(Date.now() / 400 + i))));
  }, 60);
  onCleanup(() => clearInterval(id));
  return bands;
}

export const Speaking: Story = {
  parameters: {
    docs: { description: { story: 'Driven by synthetic levels. Set `bands` to a new array reference per frame.' } },
  },
  render: () => {
    const bands = useFakeBands(5);
    return <AudioVisualizer variant="bar" state="speaking" size="md" bands={bands()} />;
  },
};

export const Variants: Story = {
  parameters: {
    docs: { description: { story: 'The three CSS-driven looks. Wave and aura render through WebGL and load on demand.' } },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '48px', 'align-items': 'center' }}>
      <For each={['bar', 'grid', 'radial'] as const}>
        {(v) => <AudioVisualizer variant={v} state="listening" size="md" />}
      </For>
    </div>
  ),
};

export const StateMatrix: Story = {
  parameters: {
    docs: { description: { story: 'Every variant against every state. `speaking` uses synthetic levels.' } },
  },
  render: () => {
    const bands = useFakeBands(5);
    return (
      <div style={{ display: 'grid', 'grid-template-columns': `repeat(${STATES.length}, 1fr)`, gap: '32px' }}>
        <For each={['bar', 'grid', 'radial'] as const}>
          {(v) => (
            <For each={STATES}>
              {(s) => (
                <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
                  <AudioVisualizer variant={v} state={s} size="sm" bands={bands()} />
                  <code style={{ 'font-size': '11px', opacity: 0.6 }}>{s}</code>
                </div>
              )}
            </For>
          )}
        </For>
      </div>
    );
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '32px', 'align-items': 'center' }}>
      <For each={SIZES.filter((s) => s !== 'xl')}>
        {(size) => <AudioVisualizer variant="bar" state="listening" size={size} />}
      </For>
    </div>
  ),
};
```

- [ ] **Step 2: Verify the stories build**

```bash
pnpm --filter @kitn.ai/ui exec storybook build --quiet
```

Expected: a clean build. If a new element is not appearing in dev Storybook later, restart it: newly registered elements and shadow CSS need a restart to pick up.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/audio-visualizer/audio-visualizer.stories.tsx
git commit -m "docs(storybook): add audio visualizer stories for the DOM variants"
```

---

## Task 11: ShaderToy-compatible WebGL canvas

**Files:**
- Create: `packages/ui/src/components/audio-visualizer/shader-canvas.tsx`
- Test: `packages/ui/src/components/audio-visualizer/shader-canvas.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type UniformType = '1f' | '1i' | '1fv' | '2f' | '3f' | '3fv' | '4f' | '4fv' | 'Matrix2fv' | 'Matrix3fv' | 'Matrix4fv'`
  - `interface UniformSpec { type: UniformType; value: number | number[]; arraySize?: number }`
  - `interface ShaderCanvasProps { fragment: string; uniforms?: Record<string, UniformSpec>; precision?: 'lowp' | 'mediump' | 'highp'; onError?: (message: string) => void; class?: string }`
  - `buildFragmentSource(fragment: string, uniforms: Record<string, UniformSpec>, precision: string): string`
  - `function ShaderCanvas(props: ShaderCanvasProps): JSX.Element`
  - `const DEFAULT_SHADER_COLOR = '#1FD5F9'`
  - `hexToRgb(hex: string): [number, number, number]` (shared by wave, aura, and custom, so it lives here rather than being copied into each)

**Scope.** Upstream's `react-shader-toy.tsx` is 988 lines, most of it a `Texture` class, `iChannel` inputs, video sources, and pow2 canvas rescaling. We need none of that. Roughly 250 lines covers a full-screen quad, one fragment shader, the ShaderToy built-ins, and typed uniforms.

**The critical contract:** the canvas **declares custom uniforms itself** by injecting `uniform <type> <name>;` after the precision qualifier. A shader that also declares them fails to compile. This must be documented on every public surface that accepts a shader.

- [ ] **Step 1: Write the failing test**

WebGL does not exist in jsdom, so the testable surface is the source assembly, which is also where the compile-breaking bug lives. Create `packages/ui/src/components/audio-visualizer/shader-canvas.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { buildFragmentSource, hexToRgb, DEFAULT_SHADER_COLOR } from './shader-canvas';

const MAIN = 'void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }';

describe('hexToRgb', () => {
  it('maps a hex colour to three 0..1 floats', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
  });
  it('tolerates surrounding whitespace', () => {
    expect(hexToRgb('  #00ff00  ')).toEqual([0, 1, 0]);
  });
  it('falls back to the default rather than throwing on bad input', () => {
    expect(hexToRgb('rebeccapurple')).toEqual(hexToRgb(DEFAULT_SHADER_COLOR));
    expect(hexToRgb('#fff')).toEqual(hexToRgb(DEFAULT_SHADER_COLOR));
    expect(hexToRgb('')).toEqual(hexToRgb(DEFAULT_SHADER_COLOR));
  });
});

describe('buildFragmentSource', () => {
  it('puts the precision qualifier first', () => {
    expect(buildFragmentSource(MAIN, {}, 'highp').startsWith('precision highp float;')).toBe(true);
  });

  it('declares the ShaderToy built-ins', () => {
    const src = buildFragmentSource(MAIN, {}, 'highp');
    expect(src).toContain('uniform float iTime;');
    expect(src).toContain('uniform vec2 iResolution;');
    expect(src).toContain('uniform vec4 iMouse;');
    expect(src).toContain('uniform int iFrame;');
    expect(src).toContain('uniform vec4 iDate;');
  });

  it('declares custom uniforms with their mapped GLSL types', () => {
    const src = buildFragmentSource(MAIN, {
      uSpeed: { type: '1f', value: 5 },
      uColor: { type: '3fv', value: [1, 0, 0] },
      uSteps: { type: '1i', value: 3 },
    }, 'highp');
    expect(src).toContain('uniform float uSpeed;');
    expect(src).toContain('uniform vec3 uColor;');
    expect(src).toContain('uniform int uSteps;');
  });

  it('declares an array uniform with its size', () => {
    const src = buildFragmentSource(MAIN, {
      uBands: { type: '1fv', value: [0, 0, 0], arraySize: 3 },
    }, 'highp');
    expect(src).toContain('uniform float uBands[3];');
  });

  it('maps every matrix type', () => {
    const src = buildFragmentSource(MAIN, {
      a: { type: 'Matrix2fv', value: [1, 0, 0, 1] },
      b: { type: 'Matrix3fv', value: new Array(9).fill(0) },
      c: { type: 'Matrix4fv', value: new Array(16).fill(0) },
    }, 'highp');
    expect(src).toContain('uniform mat2 a;');
    expect(src).toContain('uniform mat3 b;');
    expect(src).toContain('uniform mat4 c;');
  });

  it('keeps the caller shader body intact', () => {
    expect(buildFragmentSource(MAIN, {}, 'highp')).toContain(MAIN);
  });

  it('appends a main() that calls mainImage with gl_FragCoord', () => {
    const src = buildFragmentSource(MAIN, {}, 'highp');
    expect(src).toContain('void main()');
    expect(src).toContain('mainImage(gl_FragColor, gl_FragCoord.xy)');
  });

  it('declares each uniform exactly once so the shader compiles', () => {
    const src = buildFragmentSource(MAIN, { uSpeed: { type: '1f', value: 1 } }, 'highp');
    expect(src.split('uniform float uSpeed;')).toHaveLength(2);
  });

  it('honours a mediump precision request', () => {
    expect(buildFragmentSource(MAIN, {}, 'mediump')).toContain('precision mediump float;');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/shader-canvas.test.tsx
```

Expected: FAIL, cannot resolve `./shader-canvas`.

- [ ] **Step 3: Write the implementation**

Create `packages/ui/src/components/audio-visualizer/shader-canvas.tsx`:

```tsx
import { createEffect, onCleanup, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';

export type UniformType =
  | '1f' | '1i' | '1fv' | '2f' | '3f' | '3fv' | '4f' | '4fv'
  | 'Matrix2fv' | 'Matrix3fv' | 'Matrix4fv';

export interface UniformSpec {
  type: UniformType;
  value: number | number[];
  /** For array uniforms (`1fv`), the declared length. */
  arraySize?: number;
}

export interface ShaderCanvasProps {
  /** GLSL defining `mainImage(out vec4 fragColor, in vec2 fragCoord)`. */
  fragment: string;
  /**
   * Custom uniforms. THIS CANVAS DECLARES THEM FOR YOU. Declaring them in the
   * shader as well is a compile error.
   */
  uniforms?: Record<string, UniformSpec>;
  precision?: 'lowp' | 'mediump' | 'highp';
  onError?: (message: string) => void;
  class?: string;
}

/** Default accent for the shader variants, matching upstream's. */
export const DEFAULT_SHADER_COLOR = '#1FD5F9';

/**
 * `#rrggbb` to three 0..1 floats, for a `3fv` uniform. Falls back to the
 * default on malformed input rather than throwing into the render loop.
 *
 * Lives here so wave, aura, and custom all share one copy.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!m) return hexToRgb(DEFAULT_SHADER_COLOR);
  return [m[1]!, m[2]!, m[3]!].map((c) => parseInt(c, 16) / 255) as [number, number, number];
}

const GLSL_TYPE: Record<UniformType, string> = {
  '1f': 'float', '1i': 'int', '1fv': 'float',
  '2f': 'vec2', '3f': 'vec3', '3fv': 'vec3', '4f': 'vec4', '4fv': 'vec4',
  Matrix2fv: 'mat2', Matrix3fv: 'mat3', Matrix4fv: 'mat4',
};

/** Every ShaderToy built-in we support, declared for every shader. */
const BUILTINS = [
  'uniform float iTime;',
  'uniform vec2 iResolution;',
  'uniform vec4 iMouse;',
  'uniform int iFrame;',
  'uniform vec4 iDate;',
].join('\n');

const VERTEX_SOURCE = `
attribute vec3 aVertexPosition;
void main() { gl_Position = vec4(aVertexPosition, 1.0); }
`;

/**
 * Assemble the full fragment shader: precision, built-ins, auto-declared custom
 * uniforms, the caller's body, and a `main()` that forwards to `mainImage`.
 *
 * Split out from the component because it is the only part testable without a
 * GPU, and it is where a compile-breaking duplicate declaration would show up.
 */
export function buildFragmentSource(
  fragment: string,
  uniforms: Record<string, UniformSpec>,
  precision: string,
): string {
  const declarations = Object.entries(uniforms)
    .map(([name, u]) => {
      const size = u.arraySize ? `[${u.arraySize}]` : '';
      return `uniform ${GLSL_TYPE[u.type]} ${name}${size};`;
    })
    .join('\n');

  return [
    `precision ${precision} float;`,
    BUILTINS,
    declarations,
    fragment,
    'void main() { mainImage(gl_FragColor, gl_FragCoord.xy); }',
  ].join('\n');
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | string {
  const shader = gl.createShader(type);
  if (!shader) return 'could not create shader';
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown compile error';
    gl.deleteShader(shader);
    return log;
  }
  return shader;
}

/** Push one uniform value to the GPU, dispatching on its declared type. */
function setUniform(
  gl: WebGLRenderingContext,
  location: WebGLUniformLocation,
  spec: UniformSpec,
): void {
  const v = spec.value;
  switch (spec.type) {
    case '1f': gl.uniform1f(location, v as number); break;
    case '1i': gl.uniform1i(location, v as number); break;
    case '1fv': gl.uniform1fv(location, v as number[]); break;
    case '2f': gl.uniform2fv(location, v as number[]); break;
    case '3f': case '3fv': gl.uniform3fv(location, v as number[]); break;
    case '4f': case '4fv': gl.uniform4fv(location, v as number[]); break;
    case 'Matrix2fv': gl.uniformMatrix2fv(location, false, v as number[]); break;
    case 'Matrix3fv': gl.uniformMatrix3fv(location, false, v as number[]); break;
    case 'Matrix4fv': gl.uniformMatrix4fv(location, false, v as number[]); break;
  }
}

/**
 * A full-screen fragment shader on a canvas, ShaderToy-compatible.
 *
 * Deliberately does NOT support textures, `iChannel` inputs, video, multipass,
 * or device orientation. Those are what make upstream's runner 988 lines, and
 * an audio visualizer needs none of them.
 */
export function ShaderCanvas(props: ShaderCanvasProps): JSX.Element {
  let canvas!: HTMLCanvasElement;

  createEffect(() => {
    const precision = props.precision ?? 'highp';
    const uniforms = props.uniforms ?? {};
    const source = buildFragmentSource(props.fragment, uniforms, precision);

    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

    if (!gl) {
      props.onError?.('WebGL is not available');
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    if (typeof vs === 'string') { props.onError?.(vs); return; }
    const fs = compile(gl, gl.FRAGMENT_SHADER, source);
    if (typeof fs === 'string') { props.onError?.(fs); return; }

    const program = gl.createProgram();
    if (!program) { props.onError?.('could not create program'); return; }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      props.onError?.(gl.getProgramInfoLog(program) ?? 'link failed');
      return;
    }
    gl.useProgram(program);

    // Two triangles covering clip space. The fragment shader does the rest.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]),
      gl.STATIC_DRAW,
    );
    const attr = gl.getAttribLocation(program, 'aVertexPosition');
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 3, gl.FLOAT, false, 0, 0);

    // Premultiplied alpha so the shader composites over any page background.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    const uTime = loc('iTime');
    const uResolution = loc('iResolution');
    const uMouse = loc('iMouse');
    const uFrame = loc('iFrame');
    const uDate = loc('iDate');
    const customLocations = Object.keys(uniforms).map((n) => [n, loc(n)] as const);

    const mouse = [0, 0, 0, 0];
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse[0] = e.clientX - r.left;
      mouse[1] = r.height - (e.clientY - r.top);
    };
    canvas.addEventListener('pointermove', onMove, { passive: true });

    // Match the backing store to the displayed size so the shader is not blurry.
    const resize = () => {
      const dpr = globalThis.devicePixelRatio ?? 1;
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined;
    ro?.observe(canvas);
    resize();

    const start = performance.now();
    let frame = 0;
    let raf = 0;

    const draw = (now: number) => {
      resize();
      const seconds = (now - start) / 1000;

      if (uTime) gl.uniform1f(uTime, seconds);
      if (uResolution) gl.uniform2fv(uResolution, [canvas.width, canvas.height]);
      if (uMouse) gl.uniform4fv(uMouse, mouse);
      if (uFrame) gl.uniform1i(uFrame, frame);
      if (uDate) {
        const d = new Date();
        gl.uniform4fv(uDate, [
          d.getFullYear(), d.getMonth(), d.getDate(),
          d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(),
        ]);
      }

      // Read straight off props so a uniform change takes effect next frame
      // without recompiling the program.
      for (const [name, location] of customLocations) {
        const spec = props.uniforms?.[name];
        if (spec && location) setUniform(gl, location, spec);
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      frame++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    });
  });

  return <canvas ref={canvas} part="canvas" class={cn('block h-full w-full', props.class)} />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/shader-canvas.test.tsx
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
nx typecheck ui
git add packages/ui/src/components/audio-visualizer/shader-canvas.tsx packages/ui/src/components/audio-visualizer/shader-canvas.test.tsx
git commit -m "feat(components): add ShaderToy-compatible WebGL canvas"
```

---

## Task 12: Wave variant

**Files:**
- Create: `packages/ui/src/components/audio-visualizer/wave.glsl.ts`
- Replace: `packages/ui/src/components/audio-visualizer/variant-wave.tsx` (the Task 8 placeholder)

**Interfaces:**
- Consumes: `ShaderCanvas` (Task 11), `waveTargets` (Task 2), `createTween` (Task 4), `VariantProps` (Task 5).
- Produces: `export default function WaveVisualizer(props: VariantProps & { volume?: number; complexity?: number }): JSX.Element`

**Licensing.** The wave shader is Apache 2.0 with no separate header, so copy it verbatim and retain attribution. This is the one shader we do NOT rewrite.

- [ ] **Step 1: Copy the shader source**

Fetch upstream and extract the `shaderSource` template literal:

```bash
gh api "repos/livekit/components-js/contents/packages/shadcn/components/agents-ui/agent-audio-visualizer-wave.tsx" --jq '.content' | base64 -d
```

Create `packages/ui/src/components/audio-visualizer/wave.glsl.ts` containing that GLSL verbatim as a default-exported template literal, prefixed with:

```ts
/**
 * Oscilloscope wave fragment shader.
 *
 * Copied verbatim from livekit/components-js
 * `packages/shadcn/components/agents-ui/agent-audio-visualizer-wave.tsx`
 * (Apache License 2.0). Unmodified apart from being extracted to its own module.
 *
 * Uniforms are declared by ShaderCanvas. Do not declare them here.
 */
export default `
  ... the GLSL, exactly as upstream ...
`;
```

Two edits are required and only two: delete nothing, but **do not** copy any `uniform ...;` declaration lines if present, since `ShaderCanvas` injects them. Verify by eye that the source starts at `const float TAU` and ends after `mainImage`'s closing brace.

- [ ] **Step 2: Write the variant**

Replace `packages/ui/src/components/audio-visualizer/variant-wave.tsx`:

```tsx
import { createEffect, type JSX } from 'solid-js';
import { ShaderCanvas, hexToRgb, DEFAULT_SHADER_COLOR } from './shader-canvas';
import { createTween } from '../../primitives/create-tween';
import { waveTargets } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT } from './sizes';
import type { VariantProps } from './variant-bar';
import waveShader from './wave.glsl';

/**
 * A flowing oscilloscope line.
 *
 * Ported from livekit/components-js `agent-audio-visualizer-wave.tsx`
 * (Apache License 2.0). The shader itself is verbatim; only the React wrapper
 * and its `motion` dependency were replaced.
 */
export default function WaveVisualizer(
  props: VariantProps & { volume?: number; lineWidth?: number; blur?: number },
): JSX.Element {
  const amplitude = createTween(0);
  const frequency = createTween(0);
  const opacity = createTween(1);

  const targets = () => waveTargets(props.state);

  // Reduced motion: land on the target immediately and skip every pulse.
  const transition = () => (props.frozen ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const });

  createEffect(() => {
    const t = targets();
    amplitude.to(t.amplitude, transition());
    frequency.to(t.frequency, transition());

    // A pulse is an array target. Reduced motion collapses it to its first
    // value so the line holds still instead of breathing.
    const fade = Array.isArray(t.opacity) && props.frozen ? t.opacity[0] : t.opacity;
    opacity.to(fade, props.frozen ? { duration: 0 } : { duration: t.pulseDuration || 0.2 });
  });

  // Live volume overrides amplitude and frequency instantly while speaking, so
  // the line never lags the audio.
  createEffect(() => {
    if (props.state !== 'speaking') return;
    const v = props.volume ?? 0;
    amplitude.to(0.015 + 0.4 * v, { duration: 0 });
    frequency.to(20 + 60 * v, { duration: 0 });
  });

  const lineWidth = () =>
    props.lineWidth ?? (props.size === 'icon' || props.size === 'sm' ? 2 : 1);

  return (
    <div
      data-kai-state={props.state}
      class={props.class}
      style={{
        height: `${CONTAINER_HEIGHT[props.size]}px`,
        'aspect-ratio': '1',
        'mask-image': 'linear-gradient(90deg, transparent 0%, black 20%, black 80%, transparent 100%)',
      }}
    >
      <ShaderCanvas
        fragment={waveShader}
        // Shaders are expensive on phones; mediump halves the cost with no
        // visible difference on a line this thin.
        precision={props.size === 'icon' || props.size === 'sm' ? 'mediump' : 'highp'}
        uniforms={{
          uSpeed: { type: '1f', value: targets().speed },
          uAmplitude: { type: '1f', value: amplitude.value() },
          uFrequency: { type: '1f', value: frequency.value() },
          uMix: { type: '1f', value: opacity.value() },
          uLineWidth: { type: '1f', value: lineWidth() },
          uSmoothing: { type: '1f', value: props.blur ?? 0.5 },
          uColor: { type: '3fv', value: hexToRgb(props.color ?? DEFAULT_SHADER_COLOR) },
          uColorShift: { type: '1f', value: 0.05 },
        }}
        onError={(msg) => console.warn('<kai-audio-visualizer variant="wave">: shader error', msg)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks and the suite stays green**

```bash
nx typecheck ui
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
```

Expected: 4 clean tsc passes and a green suite. The dispatcher test that asserts a bar fallback still passes, because the dynamic import does not resolve synchronously.

`wave.glsl.ts` needs a module declaration if tsc complains about the `.glsl.ts` name. It is a plain `.ts` file exporting a string, so it should not, but if it does, rename to `wave-shader.ts` and update the import.

- [ ] **Step 4: Verify it renders**

```bash
pnpm dev
```

Open Storybook at <http://localhost:6006>, find Components/Elements/AudioVisualizer, set `variant` to `wave`. Expected: an animated cyan line, faster and tighter while `thinking`, flat while `idle`.

If nothing renders, check the browser console for a shader compile error. The most likely cause is a duplicate uniform declaration copied from upstream: `ShaderCanvas` declares them, so the shader must not.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/audio-visualizer/wave.glsl.ts packages/ui/src/components/audio-visualizer/variant-wave.tsx
git commit -m "feat(components): add audio visualizer wave variant"
```

---

## Task 13: Custom shader seam

**Files:**
- Replace: `packages/ui/src/components/audio-visualizer/variant-custom.tsx` (the Task 8 placeholder)
- Test: `packages/ui/src/components/audio-visualizer/variant-custom.test.tsx`

**Interfaces:**
- Consumes: `ShaderCanvas`, `hexToRgb`, `DEFAULT_SHADER_COLOR`, `UniformSpec` (Task 11), `shaderTargets` (Task 2), `createTween` (Task 4), `ShaderSpec` (Task 8).
- Produces:
  - `export default function CustomVisualizer(props: VariantProps & { volume?: number; complexity?: number; shader?: ShaderSpec }): JSX.Element`
  - `customUniforms(values, extra?): Record<string, UniformSpec>` (Task 15 reuses this)

**What a custom shader gets for free.** All five ShaderToy built-ins, plus `uColor`, `uIntensity`, `uSpeed`, `uComplexity`, plus `uVolume` and `uBands[N]`. That last pair is ours: upstream's shader path only ever receives a scalar, so a spectrum-reactive shader is possible here and not there.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/audio-visualizer/variant-custom.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { buildFragmentSource } from './shader-canvas';
import { customUniforms } from './variant-custom';

describe('customUniforms', () => {
  it('supplies the standard shader uniforms', () => {
    const u = customUniforms({ color: '#1FD5F9', intensity: 0.5, speed: 2, complexity: 0.5, volume: 0.3, bands: [0, 0] });
    expect(u.uColor?.type).toBe('3fv');
    expect(u.uIntensity).toEqual({ type: '1f', value: 0.5 });
    expect(u.uSpeed).toEqual({ type: '1f', value: 2 });
    expect(u.uComplexity).toEqual({ type: '1f', value: 0.5 });
  });

  it('supplies the audio uniforms, including the band array upstream lacks', () => {
    const u = customUniforms({ color: '#000000', intensity: 1, speed: 1, complexity: 0.5, volume: 0.7, bands: [0.1, 0.2, 0.3] });
    expect(u.uVolume).toEqual({ type: '1f', value: 0.7 });
    expect(u.uBands).toEqual({ type: '1fv', value: [0.1, 0.2, 0.3], arraySize: 3 });
  });

  it('declares uBands with its real length so the shader compiles', () => {
    const u = customUniforms({ color: '#000000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0, 0, 0, 0, 0] });
    const src = buildFragmentSource('void mainImage(out vec4 c, in vec2 p){c=vec4(0.0);}', u, 'highp');
    expect(src).toContain('uniform float uBands[5];');
  });

  it('never declares a zero-length array, which is invalid GLSL', () => {
    const u = customUniforms({ color: '#000000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [] });
    expect(u.uBands?.arraySize).toBe(1);
    expect(u.uBands?.value).toEqual([0]);
  });

  it('merges caller uniforms over the defaults', () => {
    const u = customUniforms(
      { color: '#000000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
      { uWarp: { type: '1f', value: 0.7 } },
    );
    expect(u.uWarp).toEqual({ type: '1f', value: 0.7 });
    expect(u.uIntensity).toBeDefined();
  });

  it('falls back to the default colour on a malformed hex', () => {
    const bad = customUniforms({ color: 'not-a-color', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] });
    expect((bad.uColor?.value as number[]).every((c) => c >= 0 && c <= 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-custom.test.tsx
```

Expected: FAIL, `customUniforms` is not exported.

- [ ] **Step 3: Write the implementation**

Replace `packages/ui/src/components/audio-visualizer/variant-custom.tsx`:

```tsx
import { createEffect, Show, type JSX } from 'solid-js';
import { ShaderCanvas, hexToRgb, DEFAULT_SHADER_COLOR, type UniformSpec } from './shader-canvas';
import { createTween } from '../../primitives/create-tween';
import { shaderTargets } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT } from './sizes';
import type { VariantProps } from './variant-bar';
import type { ShaderSpec } from './index';

/**
 * Uniforms every shader variant receives without asking.
 *
 * `uVolume` and `uBands` are ours: upstream's shader path only ever gets a
 * scalar, so a spectrum-reactive shader cannot be written against it.
 */
export function customUniforms(
  values: {
    color: string;
    intensity: number;
    speed: number;
    complexity: number;
    volume: number;
    bands: number[];
  },
  extra?: Record<string, UniformSpec>,
): Record<string, UniformSpec> {
  // GLSL has no zero-length arrays, so an empty band list still declares one.
  const bands = values.bands.length ? values.bands : [0];

  return {
    uColor: { type: '3fv', value: hexToRgb(values.color) },
    uIntensity: { type: '1f', value: values.intensity },
    uSpeed: { type: '1f', value: values.speed },
    uComplexity: { type: '1f', value: values.complexity },
    uVolume: { type: '1f', value: values.volume },
    uBands: { type: '1fv', value: bands, arraySize: bands.length },
    ...extra,
  };
}

/**
 * Renders a consumer-supplied fragment shader.
 *
 * The shader writes `mainImage(out vec4 fragColor, in vec2 fragCoord)` and gets
 * the ShaderToy built-ins plus the audio uniforms above. ShaderCanvas DECLARES
 * every uniform; declaring them in the shader too is a compile error.
 */
export default function CustomVisualizer(
  props: VariantProps & { volume?: number; complexity?: number; shader?: ShaderSpec },
): JSX.Element {
  const intensity = createTween(0.3);
  const speed = createTween(1);

  createEffect(() => {
    const t = shaderTargets(props.state);
    const transition = props.frozen ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' as const };
    intensity.to(Array.isArray(t.intensity) && props.frozen ? t.intensity[0] : t.intensity, transition);
    speed.to(t.speed, { duration: 0 });
  });

  // Live volume takes over intensity while speaking, with no easing so the
  // picture tracks the audio exactly.
  createEffect(() => {
    if (props.state !== 'speaking') return;
    intensity.to(0.3 + 0.7 * (props.volume ?? 0), { duration: 0 });
  });

  return (
    <Show
      when={props.shader?.fragment}
      fallback={<div data-kai-state={props.state} style={{ height: `${CONTAINER_HEIGHT[props.size]}px`, 'aspect-ratio': '1' }} />}
    >
      {(fragment) => (
        <div
          data-kai-state={props.state}
          class={props.class}
          style={{ height: `${CONTAINER_HEIGHT[props.size]}px`, 'aspect-ratio': '1' }}
        >
          <ShaderCanvas
            fragment={fragment()}
            precision={props.size === 'icon' || props.size === 'sm' ? 'mediump' : 'highp'}
            uniforms={customUniforms(
              {
                color: props.color ?? DEFAULT_SHADER_COLOR,
                intensity: intensity.value(),
                speed: speed.value(),
                complexity: props.complexity ?? 0.5,
                volume: props.volume ?? 0,
                bands: props.bands,
              },
              props.shader?.uniforms as Record<string, UniformSpec> | undefined,
            )}
            onError={(msg) => console.warn('<kai-audio-visualizer variant="custom">: shader error', msg)}
          />
        </div>
      )}
    </Show>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/audio-visualizer/variant-custom.test.tsx
nx typecheck ui
```

Expected: PASS, 6 tests, and 4 clean tsc passes.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/audio-visualizer/variant-custom.tsx packages/ui/src/components/audio-visualizer/variant-custom.test.tsx
git commit -m "feat(components): add BYO-shader audio visualizer variant"
```

---

## Task 13.5: Capture the aura reference

**Files:**
- Create: `.superpowers/sdd/2026-08-07-audio-visualizers/reference/aura-<state>.png` (five frames per state, ten states-worth of frames total is fine)
- Create: `.superpowers/sdd/2026-08-07-audio-visualizers/reference/metrics.json`
- Create: `.superpowers/sdd/2026-08-07-audio-visualizers/reference/README.md`

**Interfaces:**
- Consumes: nothing in this repo.
- Produces: the reference frames and measurements Task 14 tunes against.

**Why this exists.** The goal for the aura is to match LiveKit's, not merely to
evoke it. A prose description cannot express "matches," so this task turns their
render into something Task 14 can measure itself against. Do this early: it is
cheap, it is independent of everything else, and without it Task 14 has no exit
condition except opinion.

Nothing here goes into the shipped package. These are scratch artifacts under
the SDD workspace, which is gitignored.

- [ ] **Step 1: Record their aura**

Their live previews are at
<https://docs.livekit.io/frontends/agents-ui/audio-visualizer/prebuilt/>. Drive
it with Playwright, set the largest size available, and capture the aura in each
state the page exposes. Take a burst of consecutive frames per state (at least
30 at ~60fps), not a single screenshot: the silhouette motion is half of what we
are matching and one frame cannot show it.

If the page does not let you pin the state directly, capture a continuous run
and segment it, noting which frames belong to which state.

- [ ] **Step 2: Extract the measurements**

Write `metrics.json` with, per state:

- **falloff**: luminance sampled along a horizontal line from the center to the
  right edge, normalized to peak, as an array of 64 values. This is the single
  most important curve: it encodes core size, shoulder steepness, and where the
  image reaches zero.
- **bloomRadius**: the radius, as a fraction of half-width, where luminance
  first drops below 10 percent of peak.
- **coreHue** and **edgeHue**: hue in degrees at the center and at 60 percent of
  `bloomRadius`. The difference is the hue drift.
- **coreSaturation**: saturation at the center. The aura reads near-white in the
  middle, so this should be low.
- **alphaProfile**: alpha along the same center-out line, 64 values. Confirms
  the premultiplied edge behavior.
- **deformHz**: dominant frequency of silhouette change. Threshold alpha at 0.5
  to get a contour per frame, measure its area frame to frame, and take the
  dominant frequency of that signal.
- **deformAmplitude**: standard deviation of that contour area, as a fraction of
  its mean.

Also record `capturedAt`, the page URL, and the viewport and device pixel ratio
used, so a later re-capture is comparable.

- [ ] **Step 3: Write the README**

One page describing what was captured, how, and what each metric means. Include
the tolerance table from Task 14 so the two documents agree.

- [ ] **Step 4: Report**

No commit (these are gitignored scratch artifacts). Report the file paths and a
short summary of the numbers.

**Do NOT** open, download, or read
`agent-audio-visualizer-aura.tsx` or `use-agent-audio-visualizer-aura.ts` from
`livekit/components-js` at any point in this task. Capturing rendered output is
the point; reading the source is what we are avoiding. See spec section 1.

---

## Task 14: Aura shader

**Files:**
- Create: `packages/ui/src/components/audio-visualizer/aura.glsl.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export default` a GLSL source string reading `uColor`, `uIntensity`, `uSpeed`, `uComplexity`.

**STOP AND READ.** This is the one task with a licensing constraint and a human review gate.

**You must not open** `agent-audio-visualizer-aura.tsx` or `use-agent-audio-visualizer-aura.ts` from `livekit/components-js`. Upstream's aura shader is under a restrictive UNCRN license that is incompatible with publishing `@kitn.ai/ui` to npm, and a framework port would leave that GLSL byte-identical. The visual effect is not protectable; that specific source is. Build from the brief below, which is spec section 8.

**Visual target.** A luminous **ring**, not a filled shape. A reference still is at
`.superpowers/sdd/2026-08-07-audio-visualizers/reference/`; look at it before writing anything.

An earlier version of this brief described a filled glowing blob. That was wrong,
and a shader built from it would have been confidently, structurally incorrect.
The correct subject:

- **An annulus with a clean hollow centre.** The inner hole is empty (fully
  transparent), large, roughly half the outer radius. The band occupies the outer
  portion of the frame.
- **Distance to a circle, not to a point.** The band is driven by `abs(r - ringRadius)`,
  where `r` is the (noise-displaced) distance from centre. This is the single most
  important structural fact in this brief. `1.0 - smoothstep(core, outer, r)`
  produces a disc and is the wrong construction.
- **Thickness varies continuously around the circumference**, driven by low
  frequency noise sampled by angle. In the reference the lower-left arc is
  markedly heavier than the upper-right.
- **Brightness tracks thickness.** Thick arcs read near-white and nearly opaque;
  thin arcs are pale, translucent accent colour. Intensity is a function of local
  band thickness, not of radius alone.
- **Both edges are soft.** Inner and outer boundaries each fall off smoothly with
  a glow; there is no hard edge anywhere, inside or out.
- **The outline wanders.** Both the ring's radius and its thickness are displaced
  by slow noise so the shape breathes and never settles into a clean circle or a
  repeating figure.
- **Bloom** spills outward from the brightest arcs, tonemapped so highlights
  saturate toward white rather than clipping.
- **Hue** comes from `uColor` (cyan by default in the reference), drifting slightly
  across the band so it does not read flat.
- **Dither** below one 8-bit step prevents banding across the soft falloffs.
- **Alpha is premultiplied** so it composites over any background. The hollow
  centre must be genuinely transparent, not white: the reference sits on a white
  page, which makes an opaque white centre look identical until it is placed on a
  dark background.

**The goal is to match the reference, not to evoke it.** Task 13.5 captures frames
and measurements; Step 3 below tunes against them with numeric tolerances.

**Performance rules** (upstream's published guidance): prefer `mix()` / `step()` / `smoothstep()` over branching, keep `sin`/`cos`/`sqrt` out of loops where you can, and cap the fbm at 4 octaves.

- [ ] **Step 1: Write the shader**

Create `packages/ui/src/components/audio-visualizer/aura.glsl.ts`:

```ts
/**
 * Aura fragment shader.
 *
 * ORIGINAL WORK for @kitn.ai/ui. Written to the visual brief in
 * docs/superpowers/specs/2026-08-07-audio-visualizers-design.md section 8.
 * Not derived from, and not written with reference to, any existing
 * implementation. See spec section 1 for why that matters here.
 *
 * Uniforms are declared by ShaderCanvas. Do not declare them here.
 */
export default `
const float PI = 3.14159265359;

// ---------------------------------------------------------------- noise

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Smoothstep by hand: cheaper than the call, and we need it four times.
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Four octaves is enough for a soft silhouette and cheap enough for mobile.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p *= 2.03;   // non-integer, so octaves do not align into visible grids
    amp *= 0.5;
  }
  return sum;
}

// ---------------------------------------------------------------- color

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1.0e-10)), d / (q.x + 1.0e-10), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Reinhard-ish: highlights roll off toward white instead of clipping flat.
vec3 tonemap(vec3 x) {
  x *= 2.0;
  return x / (1.0 + x);
}

// ---------------------------------------------------------------- main

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = uv - 0.5;
  p.x *= iResolution.x / iResolution.y;

  float t = iTime * uSpeed * 0.15;

  // Domain warp: displace the sample position by noise so the silhouette
  // wanders rather than pulsing symmetrically. Two decorrelated fbm samples,
  // one drifting on each axis.
  float scale = 1.5 + uComplexity * 2.0;
  vec2 warp = vec2(
    fbm(p * scale + vec2(0.0, t)),
    fbm(p * scale + vec2(t, 0.0))
  ) - 0.5;

  float wobble = 0.10 + 0.18 * uComplexity;
  float r = length(p + warp * wobble);

  // Angle around the ring, used to vary thickness along the circumference.
  float ang = atan(p.y, p.x);

  // Thickness is NOT constant. Low-frequency noise sampled by angle makes some
  // arcs heavy and others thin, which is the reference's most obvious feature
  // after the hollow centre. Sampled on a circle so it wraps seamlessly at PI.
  vec2 angPos = vec2(cos(ang), sin(ang)) * 1.7;
  float thickNoise = fbm(angPos + vec2(t * 0.6, 0.0));
  float thickness = (0.045 + 0.075 * thickNoise) * (0.6 + 0.8 * uIntensity);

  // Ring radius, also wandering slowly so the shape never settles.
  float ringRadius = 0.30 + 0.03 * (fbm(angPos * 0.7 + vec2(0.0, t * 0.4)) - 0.5);

  // DISTANCE TO A CIRCLE, not to a point. This is the structural difference
  // between a ring and a disc: `1.0 - smoothstep(core, outer, r)` would fill
  // the centre. `abs(r - ringRadius)` leaves it hollow.
  float d = abs(r - ringRadius);

  // Soft on both edges, inner and outer alike. No hard boundary anywhere.
  float band = 1.0 - smoothstep(0.0, thickness, d);
  band = pow(band, 1.4);

  // Brightness tracks LOCAL THICKNESS, so heavy arcs read near-white and thin
  // arcs stay pale and translucent. Radius alone would light the ring evenly.
  float weight = smoothstep(0.045, 0.115, thickness);

  // Bloom spills outward from the band, widest where the band is heaviest.
  float bloom = (1.0 - smoothstep(0.0, thickness * 3.5, d)) * 0.30 * weight;

  float energy = (band + bloom) * (0.35 + 1.5 * uIntensity);

  // Hue drifts across the band so it is not a flat wash, and value lifts where
  // the band is thick so those arcs read close to white.
  vec3 hsv = rgb2hsv(uColor);
  hsv.x = fract(hsv.x + (d / max(0.001, thickness)) * 0.05);
  hsv.z = min(1.0, hsv.z + band * weight * 0.7);
  hsv.y *= mix(1.0, 0.45, band * weight);
  vec3 col = hsv2rgb(hsv) * energy;

  col = tonemap(col);

  // Below one 8-bit step: invisible on its own, kills banding across the
  // long falloff where adjacent pixels would otherwise quantise together.
  col += (hash21(fragCoord) - 0.5) / 255.0;

  float alpha = clamp(energy, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);   // premultiplied
}
`;
```

- [ ] **Step 2: Commit the first draft**

```bash
git add packages/ui/src/components/audio-visualizer/aura.glsl.ts
git commit -m "feat(components): add original aura fragment shader"
```

- [ ] **Step 3: Measure against the reference, then tune. Repeat.**

The shader above is a starting point, not the deliverable. **The deliverable is
a shader whose render matches the Task 13.5 reference within tolerance.** This is
a loop, and it is the only task in the plan with a numeric exit condition rather
than a review verdict.

Each round: wire the shader through Task 15, render ours at the same size, state,
and device pixel ratio as the reference capture, extract the same metrics with
the same code Task 13.5 used, and compare.

**Tolerances (all must hold, per state):**

| Metric | Tolerance |
| --- | --- |
| `falloff` (radial luminance curve) | RMS error under 0.05 on the normalized 0..1 curve |
| `innerRadius` (where the hollow ends) | within 10 percent |
| `outerRadius` | within 10 percent |
| `thicknessVariation` (max arc thickness over min) | within 20 percent |
| `coreHue` | within 5 degrees, after setting `uColor` to the reference's hue |
| `peakSaturation` and `minSaturation` across the band | each within 0.10 |
| `alphaProfile` | RMS error under 0.05, and the centre must read alpha 0 |
| `deformHz` | within 20 percent |
| `deformAmplitude` | within 25 percent |

**Performance parity is required, not optional:** p95 frame time at `size="xl"`
in the `speaking` state, over 300 frames on the same machine, no worse than the
reference's. Record both numbers. A shader that matches visually while halving
the frame rate has not matched.

**The knobs**, so tuning is directed rather than random: `ringRadius`'s `0.30`
sets ring size; `thickness`'s `0.045` and `0.075` set the thin and thick
extremes; `angPos`'s `1.7` sets how many heavy arcs appear around the
circumference; `pow(band, 1.4)` sets edge softness; `weight`'s `smoothstep`
bounds set how strongly brightness tracks thickness; `bloom`'s `3.5` and `0.30`
set halo reach and strength; `t * 0.6` and `t * 0.4` set how fast thickness and
radius wander; `wobble` and `scale` set the domain warp.

Change ONE knob per round where you can, and record what you changed and which
metrics moved. The tuning log is worth more than the final numbers: the next
person to touch this shader needs to know which knobs are sensitive.

**Stop and escalate** rather than grinding if five rounds pass without every
metric improving, if a metric moves the wrong way when its own knob is adjusted
(the model is wrong, not the value), or if matching one metric reliably breaks
another. Those mean the structure needs changing, which is a different
conversation than tuning.

- [ ] **Step 4: HUMAN REVIEW GATE**

Do not proceed past this point without a look from Rob. Wire it up (Task 15), run `pnpm dev`, and capture the aura at `size="lg"` in all five states, in both light and dark. Present the renders and ask whether the look is right before doing any polish.

The spec calls this the one genuinely uncertain deliverable. "Reads as premium" is a judgment call, and the tuning knobs are all in this file: `wobble` and `scale` control how much the silhouette moves, `core` and the `0.45` falloff set the size, `pow(mass, 1.6)` sets how solid the centre reads, `bloom`'s `0.35` sets halo strength, and `0.08` sets hue drift. Expect to iterate.

---

## Task 15: Aura variant and shader stories

**Files:**
- Replace: `packages/ui/src/components/audio-visualizer/variant-aura.tsx` (the Task 8 placeholder)
- Modify: `packages/ui/src/components/audio-visualizer/audio-visualizer.stories.tsx`

**Interfaces:**
- Consumes: `ShaderCanvas` (Task 11), `customUniforms`, `hexToRgb` (Task 13), `shaderTargets` (Task 2), `createTween` (Task 4), the aura shader (Task 14).
- Produces: `export default function AuraVisualizer(props: VariantProps & { volume?: number; complexity?: number }): JSX.Element`

- [ ] **Step 1: Write the variant**

Replace `packages/ui/src/components/audio-visualizer/variant-aura.tsx`:

```tsx
import { createEffect, type JSX } from 'solid-js';
import { ShaderCanvas, DEFAULT_SHADER_COLOR } from './shader-canvas';
import { createTween } from '../../primitives/create-tween';
import { shaderTargets } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT } from './sizes';
import { customUniforms } from './variant-custom';
import type { VariantProps } from './variant-bar';
import auraShader from './aura.glsl';

/**
 * A glowing organic aura.
 *
 * The shader is original work (see aura.glsl.ts). Only the state-to-uniform
 * mapping follows the architecture LiveKit documents publicly.
 */
export default function AuraVisualizer(
  props: VariantProps & { volume?: number; complexity?: number },
): JSX.Element {
  const intensity = createTween(0.3);
  const speed = createTween(1);

  createEffect(() => {
    const t = shaderTargets(props.state);
    // Reduced motion: settle on the first value of any pulse and stop there.
    const target = Array.isArray(t.intensity) ? (props.frozen ? t.intensity[0] : t.intensity) : t.intensity;
    intensity.to(target, props.frozen ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' });
    speed.to(props.frozen ? 0 : t.speed, { duration: 0 });
  });

  createEffect(() => {
    if (props.state !== 'speaking') return;
    // duration 0: the aura must track the voice, not trail it.
    intensity.to(0.3 + 0.7 * (props.volume ?? 0), { duration: 0 });
  });

  return (
    <div
      data-kai-state={props.state}
      class={props.class}
      style={{ height: `${CONTAINER_HEIGHT[props.size]}px`, 'aspect-ratio': '1' }}
    >
      <ShaderCanvas
        fragment={auraShader}
        precision={props.size === 'icon' || props.size === 'sm' ? 'mediump' : 'highp'}
        uniforms={customUniforms({
          color: props.color ?? DEFAULT_SHADER_COLOR,
          intensity: intensity.value(),
          speed: speed.value(),
          complexity: props.complexity ?? 0.5,
          volume: props.volume ?? 0,
          bands: props.bands,
        })}
        onError={(msg) => console.warn('<kai-audio-visualizer variant="aura">: shader error', msg)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the shader stories**

Append to `packages/ui/src/components/audio-visualizer/audio-visualizer.stories.tsx`:

```tsx
export const ShaderVariants: Story = {
  parameters: {
    docs: { description: { story: 'Wave and aura render through WebGL. Both load on demand and fall back to bars where WebGL is unavailable.' } },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '32px', 'align-items': 'center' }}>
      <AudioVisualizer variant="wave" state="listening" size="md" />
      <AudioVisualizer variant="aura" state="listening" size="md" />
    </div>
  ),
};

export const AuraStates: Story = {
  parameters: {
    docs: { description: { story: 'The aura across every state. Compare against the visual brief before locking the look.' } },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '24px', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
      <For each={STATES}>
        {(s) => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
            <AudioVisualizer variant="aura" state={s} size="md" />
            <code style={{ 'font-size': '11px', opacity: 0.6 }}>{s}</code>
          </div>
        )}
      </For>
    </div>
  ),
};

const SPECTRUM_SHADER = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  int idx = int(uv.x * float(BAND_COUNT));
  float level = 0.0;
  for (int i = 0; i < BAND_COUNT; i++) {
    if (i == idx) level = uBands[i];
  }
  float lit = step(uv.y, level);
  fragColor = vec4(uColor * lit, lit);
}`.replace(/BAND_COUNT/g, '5');

export const CustomShader: Story = {
  parameters: {
    docs: { description: { story: 'Set `variant="custom"` and a `shader` to render your own GLSL. It receives the ShaderToy built-ins plus `uColor`, `uIntensity`, `uSpeed`, `uComplexity`, `uVolume`, and `uBands[]`. Never declare those in your shader: the canvas declares them for you.' } },
  },
  render: () => {
    const bands = useFakeBands(5);
    return (
      <AudioVisualizer
        variant="custom"
        state="speaking"
        size="lg"
        bands={bands()}
        shader={{ fragment: SPECTRUM_SHADER }}
      />
    );
  },
};
```

- [ ] **Step 3: Verify both shaders render**

```bash
pnpm dev
```

Open Storybook, check ShaderVariants, AuraStates, and CustomShader. Expected: the wave animates, the aura glows and breathes, and the custom spectrum shows five bars driven by `uBands`.

If a shader shows nothing, read the console. A duplicate uniform declaration is the usual cause.

- [ ] **Step 4: Capture renders for the review gate**

Screenshot AuraStates at `size="lg"` in light and dark. These go to Rob before any tuning. Do not skip this: Task 14 step 3 is a gate, not a suggestion.

- [ ] **Step 5: Run the gate and commit**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
nx typecheck ui
git add packages/ui/src/components/audio-visualizer/variant-aura.tsx packages/ui/src/components/audio-visualizer/audio-visualizer.stories.tsx
git commit -m "feat(components): add audio visualizer aura variant"
```

---

## Task 16: Attribution and the bundle guard

**Files:**
- Create: `packages/ui/NOTICE`
- Create: `packages/ui/scripts/verify-shader-lazy.mjs`
- Modify: `packages/ui/package.json` (build script)

**Interfaces:**
- Consumes: the built `packages/ui/dist/kai.es.js`.
- Produces: a build that fails loudly if the shader path leaks into the register-all bundle.

**Why the guard.** `vite.config.ts` sets `treeshake: false` on the register-all bundle by design. If anyone later turns `SHADER_VARIANTS`' dynamic imports into static ones, roughly 25 to 30 KB of WebGL runtime and GLSL lands in `kai.es.js` for every consumer, including one who only uses `<kai-chat>`. Nothing would fail. Two existing guards already run in `build` (`verify-elements-bundle.mjs`, `verify-react-wrappers.mjs`); this is a third.

- [ ] **Step 1: Write the NOTICE**

Create `packages/ui/NOTICE`:

```
@kitn.ai/ui
Copyright (c) kitn.ai

This product includes software developed at LiveKit
(https://github.com/livekit/components-js), licensed under the
Apache License, Version 2.0.

The following files are ports or verbatim copies of LiveKit work:

  src/primitives/audio-bands.ts
      from packages/react/src/hooks/useTrackVolume.ts
  src/primitives/visualizer-sequences.ts
      from packages/shadcn/hooks/agents-ui/use-agent-audio-visualizer-{bar,grid,radial,wave}.ts
  src/components/audio-visualizer/sizes.ts
  src/components/audio-visualizer/variant-bar.tsx
  src/components/audio-visualizer/variant-grid.tsx
  src/components/audio-visualizer/variant-radial.tsx
  src/components/audio-visualizer/variant-wave.tsx
      from packages/shadcn/components/agents-ui/agent-audio-visualizer-{bar,grid,radial,wave}.tsx
  src/components/audio-visualizer/wave.glsl.ts
      verbatim, from agent-audio-visualizer-wave.tsx

You may obtain a copy of the Apache License 2.0 at
http://www.apache.org/licenses/LICENSE-2.0

The following file is ORIGINAL work and is NOT derived from LiveKit or any
third party:

  src/components/audio-visualizer/aura.glsl.ts
```

- [ ] **Step 2: Confirm every ported file carries its header**

```bash
grep -L "livekit/components-js" \
  packages/ui/src/primitives/audio-bands.ts \
  packages/ui/src/primitives/visualizer-sequences.ts \
  packages/ui/src/components/audio-visualizer/sizes.ts \
  packages/ui/src/components/audio-visualizer/variant-bar.tsx \
  packages/ui/src/components/audio-visualizer/variant-grid.tsx \
  packages/ui/src/components/audio-visualizer/variant-radial.tsx \
  packages/ui/src/components/audio-visualizer/variant-wave.tsx \
  packages/ui/src/components/audio-visualizer/wave.glsl.ts
```

Expected: no output. Any filename printed is missing its attribution comment; add one naming the upstream path and Apache License 2.0.

Then confirm the aura shader claims originality instead:

```bash
grep -c "ORIGINAL WORK" packages/ui/src/components/audio-visualizer/aura.glsl.ts
```

Expected: 1.

- [ ] **Step 3: Write the guard**

Create `packages/ui/scripts/verify-shader-lazy.mjs`:

```js
/**
 * Guard: the WebGL shader path must never land in the register-all bundle.
 *
 * vite.config.ts sets `treeshake: false` on kai.es.js by design, so a static
 * import of variant-wave / variant-aura / shader-canvas would silently add
 * ~25-30 KB to every consumer's bundle, including one who only uses <kai-chat>.
 * GLSL barely compresses, so it is real weight.
 *
 * Keep the imports in components/audio-visualizer/index.tsx dynamic.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = resolve(root, 'dist/kai.es.js');

// Distinctive strings that only exist in the shader path.
const SHADER_MARKERS = [
  'mainImage(gl_FragColor',   // shader-canvas's main() wrapper
  'uniform vec2 iResolution', // the built-in declarations
  'valueNoise',               // aura.glsl
];

const code = readFileSync(bundle, 'utf8');
const leaked = SHADER_MARKERS.filter((m) => code.includes(m));

if (leaked.length > 0) {
  console.error(
    `\nverify-shader-lazy: the shader path leaked into dist/kai.es.js.\n` +
    `Found: ${leaked.join(', ')}\n\n` +
    `The register-all bundle disables tree-shaking, so a static import of\n` +
    `variant-wave / variant-aura / variant-custom / shader-canvas ships to every\n` +
    `consumer. Keep SHADER_VARIANTS in components/audio-visualizer/index.tsx as\n` +
    `dynamic import() calls.\n`,
  );
  process.exit(1);
}

const kb = statSync(bundle).size / 1024;
console.log(`verify-shader-lazy: OK, shader path is lazy (kai.es.js ${kb.toFixed(1)} KB)`);
```

- [ ] **Step 4: Wire the guard into the build**

In `packages/ui/package.json`, append it to the `build` script, after the two existing guards:

```
&& node scripts/verify-elements-bundle.mjs && node scripts/verify-react-wrappers.mjs && node scripts/verify-shader-lazy.mjs
```

- [ ] **Step 5: Verify the guard passes, then verify it actually catches the bug**

```bash
nx build ui
git checkout -- packages/ui/src/components/component-meta.json
```

Expected: `verify-shader-lazy: OK, shader path is lazy (...)`.

Now prove the guard works. Temporarily add a static import at the top of `components/audio-visualizer/index.tsx`:

```ts
import './variant-aura';
```

```bash
nx build ui
```

Expected: the build FAILS with the leak message. **Revert that line**, rebuild, and confirm it passes again. A guard nobody has seen fail is not a guard.

```bash
git checkout -- packages/ui/src/components/audio-visualizer/index.tsx packages/ui/src/components/component-meta.json
nx build ui
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/NOTICE packages/ui/scripts/verify-shader-lazy.mjs packages/ui/package.json
git commit -m "chore(build): add LiveKit attribution and a shader lazy-load guard"
```

---

## Task 17: Docs page and MCP entry

**Files:**
- Create: `apps/docs/src/content/docs/components/audio-visualizer.mdx`
- Modify: the `kai` MCP component catalog under `packages/ui/src/agent-tooling/`

**Interfaces:**
- Consumes: the shipped element.
- Produces: nothing consumed by later tasks.

**Voice.** Follow `apps/docs/STYLE.md`. Terse, developer-facing, web-components-first. No emoji, no em dashes, no When/How/Placement boilerplate. Use the Attachments page as the structural template: playground, examples, props/events, composed-from.

- [ ] **Step 1: Find the template and the catalog**

```bash
ls apps/docs/src/content/docs/components/ | head -20
grep -rn "component_reference" packages/ui/src/agent-tooling/mcp/tools/ | head -5
```

Read `apps/docs/src/content/docs/components/attachments.mdx` in full before writing. Match its frontmatter, import list, and section order exactly.

- [ ] **Step 2: Write the docs page**

Cover, in this order:

1. **What it is.** One paragraph. Live audio as bars, a grid, a ring, a wave, or an aura, in one element.
2. **Playground.** A live `<kai-audio-visualizer>` with variant, state, and size controls.
3. **Sources.** The three JS properties, with the reason they are properties and not attributes. Show all three.
4. **State without audio.** Explain plainly that `speechSynthesis` exposes no audio node, so `<kai-voice-output>`'s native path cannot be tapped, and that `state` alone drives a scripted animation. Do not dress this up.
5. **Wiring it to the microphone.** The `useVoiceRecorder.stream` path, since that is the question every consumer will have:

```html
<kai-voice-input id="mic"></kai-voice-input>
<kai-audio-visualizer id="viz" variant="bar" size="icon"></kai-audio-visualizer>

<script type="module">
  const mic = document.getElementById('mic');
  const viz = document.getElementById('viz');

  mic.addEventListener('kai-recording-change', (e) => {
    viz.state = e.detail.recording ? 'speaking' : 'idle';
    viz.stream = e.detail.recording ? mic.stream : undefined;
  });
</script>
```

6. **Styling.** `::part(bar)` / `::part(cell)` with `data-kai-highlighted` and `data-kai-index`, and a worked example.
7. **Custom shaders.** `variant="custom"`, the `shader` property, the full uniform table (built-ins plus `uColor`, `uIntensity`, `uSpeed`, `uComplexity`, `uVolume`, `uBands[]`), and a prominent warning that the canvas declares uniforms and redeclaring them fails compilation.
8. **Props table.** Every attribute and property, with defaults and which variants read it.
9. **Notes.** Wave and aura load on demand and fall back to bars where WebGL is unavailable. `prefers-reduced-motion` freezes the scripted animation.

- [ ] **Step 3: Add the MCP catalog entry**

Register the element in the `kai` MCP's `component_reference` catalog so an AI harness scaffolding with the kit knows it exists. Follow the shape of a neighbouring entry exactly. Include the same source-property caveat: `stream`, `audioElement`, `bands`, and `shader` are JS properties, never attributes.

- [ ] **Step 4: Verify both**

```bash
nx build docs
```

Expected: a clean docs build with the new page in the index.

```bash
node -e "import('./packages/ui/dist/mcp/index.js').then(() => console.log('mcp loads'))"
```

Then start the MCP and call `component_reference` for `kai-audio-visualizer`; confirm it returns the entry rather than a miss.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/src/content/docs/components/audio-visualizer.mdx packages/ui/src/agent-tooling/
git commit -m "docs: add the audio visualizer page and MCP catalog entry"
```

---

## Task 18: Independent visual verification

**Files:**
- Create: `packages/ui/e2e/audio-visualizer.spec.ts`
- Create: `packages/ui/playwright.audio-visualizer.config.ts`
- Modify: `packages/ui/package.json` (add `test:audio-visualizer-ivp`)

**Interfaces:**
- Consumes: everything above.
- Produces: screenshot evidence that the element renders.

**Run this last, once, at the end of the epic.** Running an IVP per wave wastes time; tests and typecheck carry the work in between. Copy the config from an existing one (`playwright.command.config.ts`) and change the port, output directory, and spec glob.

**Storybook static cannot register web components**, so the IVP must run against `pnpm dev` (port 6006), not `storybook-static`.

- [ ] **Step 1: Write the spec**

Create `packages/ui/e2e/audio-visualizer.spec.ts` covering:

1. **The full matrix.** All six variants across all five states at `size="md"`, in light and dark. Screenshot each. Assert the element rendered geometry: `part="bar"` or `part="cell"` present for the DOM variants, a `<canvas>` with non-zero `width` for wave and aura.
2. **The shader chunk actually loads.** Watch network requests while switching to `variant="aura"` and assert a JS chunk was fetched. This is the only end-to-end proof the lazy boundary works in a browser rather than just in the bundle.
3. **The WebGL fallback.** Block WebGL via `page.addInitScript` overriding `HTMLCanvasElement.prototype.getContext` to return null for `webgl`, load `variant="aura"`, and assert bars render instead. Screenshot it.
4. **Reduced motion.** `page.emulateMedia({ reducedMotion: 'reduce' })`, load `variant="radial" state="thinking"`, and assert the container has no `animate-spin` class. Screenshot two frames a second apart and assert they are identical.
5. **Live microphone.** Launch with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` and `permissions: ['microphone']`. Drive `<kai-voice-input>`, wire its `stream` to the visualizer, and assert the bands become non-zero within 3 seconds. This is the one check nothing else covers: it proves `useAudioAnalysis` works against a real `getUserMedia` stream, not a mock.
6. **Element audio does not go silent, and does not double.** Create an `<audio>` with a short generated WAV data URI, set it as `audioElement`, call `play()`, and assert `audio.paused === false` and `currentTime` advances past 0.1s. **This is the `createMediaElementSource` footgun.** If someone drops the `elNode.connect(ctx.destination)` line, playback mutes with no error and only this test catches it. Note the spike found `paused`/`currentTime` alone cannot distinguish silence, so also render through an `OfflineAudioContext` and assert the output buffer is non-zero. Then mount a SECOND visualizer against the same element and assert the rendered amplitude is unchanged, which is the regression guard for the doubling bug.

- [ ] **Step 2: Run it**

```bash
pnpm dev
```

In a second terminal:

```bash
pnpm --filter @kitn.ai/ui exec playwright test --config playwright.audio-visualizer.config.ts
```

Expected: all specs pass. Review every screenshot yourself before reporting. Zoom in on the aura and wave: a shader that compiles but renders black still passes a "canvas has width" assertion.

- [ ] **Step 3: Full gate**

```bash
nx typecheck ui
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
nx build ui
git checkout -- packages/ui/src/components/component-meta.json
pnpm --filter @kitn.ai/ui exec storybook build --quiet
```

All five must pass. Report actual output, not a summary of it. If anything fails, say so with the failure text.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/e2e/audio-visualizer.spec.ts packages/ui/playwright.audio-visualizer.config.ts packages/ui/package.json
git commit -m "test(e2e): add audio visualizer visual verification"
```

- [ ] **Step 5: Present the evidence**

Show Rob: the screenshot matrix, the aura in all five states at `lg`, the mic-driven run, and the terminal output of the five gate commands. Do not claim the epic is done without those in front of him.

---

## Task 19: Consumer regression

**Files:**
- No source files. This task runs an existing project skill and fixes what it finds.

**Interfaces:**
- Consumes: the built package.
- Produces: evidence that a real consumer of the published package can use the element.

**Why this exists.** Everything else in this plan tests the kit's internals. None
of it tests what someone installing `@kitn.ai/ui` actually hits: packaging,
exports, SSR, the scaffold output, and the behavior across React, Vue, Svelte,
Angular, and plain HTML. `CLAUDE.md` is explicit that the unit suite catches none
of those, and this repo has a documented history of consumer-facing packaging
bugs that every internal check passed straight through.

Two things in this epic make it a live risk rather than a formality:

1. **The lazy shader chunk crosses a packaging boundary.** The spike proved the
   chunk splits in our own build. It did not prove a consumer's bundler resolves
   it, or that it survives SSR where `WebGL`, `AudioContext`, and `matchMedia`
   are all absent.
2. **`<kai-audio-visualizer>` takes four JS-property-only inputs** (`stream`,
   `audioElement`, `bands`, `shader`). Framework wrappers have historically been
   where property-versus-attribute handling breaks.

- [ ] **Step 1: Run the smoke pass**

Invoke the project skill `/consumer-regression` with `smoke`. That is one
parallel pass across the framework matrix plus a report.

- [ ] **Step 2: Triage**

If the smoke pass is clean, record that and stop. If it finds anything, run the
full `regression` mode, which is the build, triage, fix, re-verify loop.

- [ ] **Step 3: Verify the SSR path specifically**

Independent of what smoke reports, confirm by hand that importing the element in
an SSR context does not throw. The element must render nothing and construct no
`AudioContext` on the server. Task 3 and Task 8 both claim SSR safety; this is
where that claim meets a real server render.

- [ ] **Step 4: Record the outcome**

Append the result to the ledger. If anything was fixed, commit it with a
`fix(consumer):` message naming the framework and the failure.

---

## Verification summary

| Check | Command |
| --- | --- |
| Unit suite | `pnpm --filter @kitn.ai/ui exec vitest run --project=unit` |
| Typecheck, 4 passes | `nx typecheck ui` |
| Build plus 3 guards | `nx build ui` |
| Storybook | `pnpm --filter @kitn.ai/ui exec storybook build --quiet` |
| Visual, once at the end | `pnpm --filter @kitn.ai/ui exec playwright test --config playwright.audio-visualizer.config.ts` |

Element count goes 88 to 89. After any build, `git checkout -- packages/ui/src/components/component-meta.json`.

