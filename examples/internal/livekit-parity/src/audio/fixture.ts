import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  VOICE_BANDS,
  VOICE_FRAME_MS,
} from '@kit-src/components/audio-visualizer/audio-visualizer.voice-fixture';
import {
  mirrorBandsCenterOut,
  mirrorBandsAroundRing,
} from '@kit-src/primitives/audio-bands';
import {
  defaultBarCount,
  defaultRadialBarCount,
} from '@kit-src/components/audio-visualizer/sizes';

/**
 * FIXTURE mode: deterministic band-level drive with no audio stack at all.
 *
 * `VOICE_BANDS` is the kit's baked voice fixture -- half-band frames
 * extracted through the kit's own pipeline as it exists in THIS tree (see
 * that file's header for the current bake: window, split, gain, cadence).
 * Imported from kit source, so a re-bake changes this mode automatically.
 * Per frame this hook derives every shape both sides need, and the SAME
 * numbers are fed to both rows:
 *
 * - bar:  mirrorBandsCenterOut to the md bar count -> our `bands` prop AND
 *         their `volumeBands` (bar + grid, both that wide at md).
 * - ring: the half-bands resampled to ceil(ringCount/2), then
 *         mirrorBandsAroundRing -> both radials (md ring count).
 * - volume: RMS of the mirrored bar array -> their wave/aura `volume` prop.
 *         Matches how our dispatcher derives volume from a caller-supplied
 *         `bands` array (components/audio-visualizer/index.tsx), so both
 *         shader rows get the same scalar.
 *
 * Counts come from the kit's own size tables (defaultBarCount /
 * defaultRadialBarCount at 'md'), not hardcoded numbers.
 *
 * Note the mapping (centre-out mirror) is OURS on both sides here: fixture
 * mode isolates animation/rendering character, not band->element mapping.
 * Their raw left-to-right mapping is exercised in the live modes.
 */
const BAR_COUNT = defaultBarCount('md');
const RING_COUNT = defaultRadialBarCount('md');

export interface FixtureFrame {
  frame: number;
  half: number[];
  bar5: number[];
  ring24: number[];
  volume: number;
}

function resample(src: readonly number[], n: number): number[] {
  if (src.length === 0) return new Array(n).fill(0);
  if (src.length === 1) return new Array(n).fill(src[0]);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const pos = (i * (src.length - 1)) / (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(src.length - 1, lo + 1);
    const t = pos - lo;
    out[i] = src[lo] * (1 - t) + src[hi] * t;
  }
  return out;
}

function rms(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v * v;
  return Math.sqrt(sum / values.length);
}

/**
 * Drive shapes for an EXPLICIT level set (scripted audits: constant levels,
 * ramps). `levels` is full-width (one value per bar/column at md); the ring
 * is resampled from it. `frame: -1` marks the drive as synthetic.
 */
export function syntheticDrive(levels: number[]): FixtureFrame {
  const bar5 = resample(levels, BAR_COUNT);
  return {
    frame: -1,
    half: [...levels],
    bar5,
    ring24: resample(levels, RING_COUNT),
    volume: rms(bar5),
  };
}

export function useVoiceFixture(playing: boolean): {
  frame: FixtureFrame;
  /** Jump to a frame (wraps). Scripts reach this via `window.__parityControl`. */
  setFrame: (n: number) => void;
} {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () => setIndex((f) => (f + 1) % VOICE_BANDS.length),
      VOICE_FRAME_MS,
    );
    return () => clearInterval(id);
  }, [playing]);

  const frame = useMemo(() => {
    const half = [...VOICE_BANDS[index]];
    const bar5 = mirrorBandsCenterOut(resample(half, Math.ceil(BAR_COUNT / 2)), BAR_COUNT);
    const ring24 = mirrorBandsAroundRing(resample(half, Math.ceil(RING_COUNT / 2)), RING_COUNT);
    return { frame: index, half, bar5, ring24, volume: rms(bar5) };
  }, [index]);

  const setFrame = useCallback((n: number) => {
    const len = VOICE_BANDS.length;
    setIndex(((Math.round(n) % len) + len) % len);
  }, []);

  return { frame, setFrame };
}
