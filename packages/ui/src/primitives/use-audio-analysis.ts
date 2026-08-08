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

    const analyser = ctx.createAnalyser();
    analyser.fftSize = opts.fftSize;
    analyser.smoothingTimeConstant = opts.smoothingTimeConstant;

    let node: AudioNode;
    if (!isMediaElement(src)) {
      let streamNode = streamSources.get(src);
      if (!streamNode) {
        streamNode = ctx.createMediaStreamSource(src);
        streamSources.set(src, streamNode);
      }
      node = streamNode;
      node.connect(analyser);
      // Deliberately NOT connected to destination: that would echo the mic.
      // Unlike the element path below, a stream source NEVER reaches
      // destination, cached or not.
    } else {
      const el = src;
      let elNode = elementSources.get(el);
      if (!elNode) {
        elNode = ctx.createMediaElementSource(el);
        // Connect to destination exactly once, right here at creation, so the
        // audio path does not depend on how many visualizers attach. An
        // AnalyserNode still receives data with nothing connected downstream
        // of it, so every consumer's analyser below is a terminal side-tap:
        // it never also connects to destination. If it did, N consumers on
        // one element would sum to N times the amplitude.
        elNode.connect(ctx.destination);
        elementSources.set(el, elNode);
      }
      node = elNode;
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
      analyser.disconnect();
      // Both the element and stream source nodes above are cached and shared
      // across every consumer of the same element/stream: another consumer
      // may still be using this one, and it can never be recreated. Drop
      // only this consumer's own tap into it (the two-argument form), never
      // the no-argument node.disconnect() -- that would tear the source down
      // for everyone still using it.
      node.disconnect(analyser);
    });
  });

  return { bands, volume };
}
