import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js';
import { reduceToBands, reduceToVolume } from './audio-bands';

export interface AudioAnalysisOptions {
  /**
   * Number of frequency buckets to produce, or a live accessor for it.
   * Default 5.
   *
   * An accessor is resolved INSIDE the analysis effect, so a change to
   * whatever signal backs it (e.g. a caller's variant or size switching)
   * rebuilds the analyser at the new bucket count instead of silently
   * leaving `bands()` padded or truncated to a stale size.
   */
  bands?: number | (() => number);
  /** Low bin index of the pass window. NOT a frequency. Default 100. */
  loPass?: number;
  /** High bin index of the pass window. NOT a frequency. Default 200. */
  hiPass?: number;
  /** Minimum ms between updates. Default 32 (about 30fps). */
  updateInterval?: number;
}

const DEFAULTS = {
  bands: 5,
  loPass: 100,
  hiPass: 200,
  updateInterval: 32,
} as const;

/**
 * `fftSize`/`smoothingTimeConstant` are deliberately NOT caller-configurable
 * options, unlike everything above. They exist in two different, non-tunable
 * shapes below instead: one AnalyserNode per reduction, each matching
 * upstream LiveKit's own hook for that reduction. A single flat
 * `smoothingTimeConstant` option (this hook's original design) is exactly
 * the bug that made bars snap back to rest instead of easing like upstream's
 * do: one value silently applied to both a fast reduction and a slow one.
 * Hard-coding removes the only way a caller (or a future edit here) could
 * reintroduce that.
 */

/**
 * Matches upstream's `useMultibandTrackVolume`, which drives the DOM
 * bar/grid/radial variants: `{ fftSize: 2048 }`, no `smoothingTimeConstant`
 * given, so the AnalyserNode uses the Web Audio spec default of 0.8. That
 * slow decay (roughly 330ms to fall to 10% of a peak, at this hook's 32ms
 * sample interval) is what makes bars ease back to rest after speech stops
 * instead of snapping.
 */
const BANDS_ANALYSER = {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
} as const;

/**
 * Matches upstream's `useTrackVolume`, which drives the shader variants:
 * `{ fftSize: 512, smoothingTimeConstant: 0.55 }`. Faster decay (roughly
 * 123ms to 10% of peak) keeps the shaders' reactivity within the ~33ms lag
 * the aurora variant was tuned against; the bands' slower 0.8 here would
 * make the shaders visibly sluggish.
 */
const VOLUME_ANALYSER = {
  fftSize: 512,
  smoothingTimeConstant: 0.55,
} as const;

/** `bands` accepts a plain number or a live accessor; read whichever was given. */
function resolveBandCount(bands: number | (() => number)): number {
  return typeof bands === 'function' ? bands() : bands;
}

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
 * `createMediaStreamSource` does NOT throw on a second call for the same
 * stream, unlike the element API above -- it is legal per spec to build
 * several independent source nodes from one MediaStream. In practice several
 * simultaneous nodes reading the same stream is a known source of
 * intermittent silent data loss in Chromium (observed here as `volume`
 * sticking at 0 for several seconds with three or more visualizers on one
 * live microphone). Cache and share one node per stream, exactly like the
 * element path, so N consumers is one node with N analyser taps rather than
 * N nodes racing each other.
 */
const streamSources = new WeakMap<MediaStream, MediaStreamAudioSourceNode>();

/**
 * `instanceof MediaStream` is not usable here: that global does not exist in
 * every environment (jsdom included), and referencing it throws a
 * ReferenceError instead of returning false. Every DOM element carries a
 * `tagName`; a MediaStream never does, so it is a safe, environment-agnostic
 * discriminator between the two accepted source types.
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
 * Runs TWO analysers off one source node: `bands` for the DOM variants and a
 * scalar `volume` for the shader ones, each with its own `fftSize` and
 * `smoothingTimeConstant` matching upstream's two separate hooks (see
 * BANDS_ANALYSER / VOLUME_ANALYSER above). An earlier version of this hook
 * shared a single analyser between both reductions as an optimization; that
 * silently forced one smoothing behavior onto both and made bars snap back
 * to rest instead of easing like upstream's do. What this still saves over
 * upstream: one shared, cached source node per element/stream (see
 * elementSources/streamSources below) instead of a fresh one per hook
 * instance, and one requestAnimationFrame loop reading both analysers each
 * tick instead of two independent timers.
 *
 * Safe to call with no source: it emits zeros and never constructs a context,
 * which is what makes the state-driven (no audio) mode work.
 */
export function useAudioAnalysis(
  source: () => MediaStream | HTMLMediaElement | undefined,
  options: AudioAnalysisOptions = {},
): { bands: Accessor<number[]>; volume: Accessor<number> } {
  const opts = { ...DEFAULTS, ...options };
  const [bands, setBands] = createSignal<number[]>(new Array(resolveBandCount(opts.bands)).fill(0));
  const [volume, setVolume] = createSignal(0);

  createEffect(() => {
    const src = source();
    // Read INSIDE the effect, not from the outer `opts.bands` closure: when
    // this is an accessor, calling it here is what makes the effect track it,
    // so a later change reruns this whole setup (new analyser, right-sized
    // arrays) instead of leaving the old bucket count wired up forever.
    const bandCount = resolveBandCount(opts.bands);

    // Reset to a correctly-sized zero array whenever the source or the band
    // count changes, so a stale picture never lingers after the mic stops or
    // the requested resolution changes.
    setBands(new Array(bandCount).fill(0));
    setVolume(0);

    if (!src) return;

    const ctx = getContext();
    if (!ctx) return; // SSR, or a browser without Web Audio.
    if (typeof requestAnimationFrame === 'undefined') return;

    const stopResume = resumeOnGesture(ctx);

    let node: AudioNode;
    if (!isMediaElement(src)) {
      let streamNode = streamSources.get(src);
      if (!streamNode) {
        streamNode = ctx.createMediaStreamSource(src);
        streamSources.set(src, streamNode);
      }
      node = streamNode;
      // Deliberately NOT connected to destination: that would echo the mic.
      // Unlike the element path below, a stream source NEVER reaches
      // destination, cached or not.
    } else {
      const el = src;
      let elNode = elementSources.get(el);
      if (!elNode) {
        elNode = ctx.createMediaElementSource(el);
        // Connect to destination exactly once, right here at creation, so the
        // audio path does not depend on how many visualizers attach. Both
        // analysers below are terminal side-taps: an AnalyserNode still
        // receives data with nothing connected downstream of it, so neither
        // one also connects to destination. If either did, N consumers on
        // one element would sum to N times the amplitude.
        elNode.connect(ctx.destination);
        elementSources.set(el, elNode);
      }
      node = elNode;
    }

    // Two analysers off the same source node, not one: see BANDS_ANALYSER /
    // VOLUME_ANALYSER above for why they cannot share a smoothingTimeConstant.
    const bandsAnalyser = ctx.createAnalyser();
    bandsAnalyser.fftSize = BANDS_ANALYSER.fftSize;
    bandsAnalyser.smoothingTimeConstant = BANDS_ANALYSER.smoothingTimeConstant;

    const volumeAnalyser = ctx.createAnalyser();
    volumeAnalyser.fftSize = VOLUME_ANALYSER.fftSize;
    volumeAnalyser.smoothingTimeConstant = VOLUME_ANALYSER.smoothingTimeConstant;

    node.connect(bandsAnalyser);
    node.connect(volumeAnalyser);

    const freq = new Float32Array(bandsAnalyser.frequencyBinCount);
    const bytes = new Uint8Array(volumeAnalyser.frequencyBinCount);

    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      if (now - last >= opts.updateInterval) {
        bandsAnalyser.getFloatFrequencyData(freq);
        volumeAnalyser.getByteFrequencyData(bytes);
        setBands(reduceToBands(freq, bandCount, opts.loPass, opts.hiPass));
        setVolume(reduceToVolume(bytes));
        last = now;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      stopResume();
      bandsAnalyser.disconnect();
      volumeAnalyser.disconnect();
      // Both the element and stream source nodes above are cached and shared
      // across every consumer of the same element/stream: another consumer
      // may still be using this one, and it can never be recreated. Drop
      // only this consumer's own taps into it (the two-argument form, once
      // per analyser), never the no-argument node.disconnect() -- that would
      // tear the source down for everyone still using it.
      node.disconnect(bandsAnalyser);
      node.disconnect(volumeAnalyser);
    });
  });

  return { bands, volume };
}
