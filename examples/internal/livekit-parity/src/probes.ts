import { useEffect, useState } from 'react';
import { reduceToBands, reduceToVolume } from '@kit-src/primitives/audio-bands';
import {
  BANDS_ANALYSER,
  DEFAULTS,
  VOLUME_ANALYSER,
} from '@kit-src/primitives/use-audio-analysis';
import { defaultBarCount } from '@kit-src/components/audio-visualizer/sizes';

/**
 * OUR side's numeric readout: a parallel analysis pass wired from the kit's
 * OWN exported settings contract -- `DEFAULTS` (band window + cadence),
 * `BANDS_ANALYSER`, and `VOLUME_ANALYSER` (fftSize / smoothing / byte-scale
 * decibel range) from `primitives/use-audio-analysis.ts`, reduced with the
 * kit's own `reduceToBands` / `reduceToVolume`. NOTHING about the analysis
 * chain is restated here, so a kit-side change to the window, the band
 * split, or the volume scale shows up in this probe automatically.
 *
 * The band count is the half-count the md bar itself requests before
 * mirroring: ceil(defaultBarCount('md') / 2).
 *
 * It is a parallel instance, not a tap into the element's internals: the
 * element runs its own identical analysis off the same stream, so these
 * numbers are representative, not literally the element's signal values.
 */
export const PROBE_HALF_BANDS = Math.ceil(defaultBarCount('md') / 2);

export function useKitProbe(stream: MediaStream | undefined): { half: number[]; volume: number } {
  const [half, setHalf] = useState<number[]>(() => new Array(PROBE_HALF_BANDS).fill(0));
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    if (!stream) {
      setHalf(new Array(PROBE_HALF_BANDS).fill(0));
      setVolume(0);
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);

    const bandsAnalyser = ctx.createAnalyser();
    bandsAnalyser.fftSize = BANDS_ANALYSER.fftSize;
    bandsAnalyser.smoothingTimeConstant = BANDS_ANALYSER.smoothingTimeConstant;

    const volumeAnalyser = ctx.createAnalyser();
    volumeAnalyser.fftSize = VOLUME_ANALYSER.fftSize;
    volumeAnalyser.smoothingTimeConstant = VOLUME_ANALYSER.smoothingTimeConstant;
    volumeAnalyser.minDecibels = VOLUME_ANALYSER.minDecibels;
    volumeAnalyser.maxDecibels = VOLUME_ANALYSER.maxDecibels;

    source.connect(bandsAnalyser);
    source.connect(volumeAnalyser);

    const freq = new Float32Array(bandsAnalyser.frequencyBinCount);
    const bytes = new Uint8Array(volumeAnalyser.frequencyBinCount);

    const id = setInterval(() => {
      bandsAnalyser.getFloatFrequencyData(freq);
      volumeAnalyser.getByteFrequencyData(bytes);
      setHalf(reduceToBands(freq, PROBE_HALF_BANDS, DEFAULTS.loPass, DEFAULTS.hiPass));
      setVolume(reduceToVolume(bytes));
    }, DEFAULTS.updateInterval);

    return () => {
      clearInterval(id);
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);

  return { half, volume };
}
