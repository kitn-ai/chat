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
  // A no-arg disconnect() on a shared source node kills it for every
  // consumer still using it. The two-arg form removes just one tap. Track
  // which kind actually happened, since both call the same method name.
  streamFullDisconnects: 0,
  // Every AnalyserNode this fake context ever created, in creation order.
  // Two per consumer now (bands, then volume): lets a test inspect each
  // one's own fftSize/smoothingTimeConstant directly, not just count them.
  analysers: [] as FakeAnalyser[],
};

/**
 * The instantaneous, unsmoothed signal level every fake analyser sees, on a
 * 0 (silence) .. 1 (peak) scale. In the real graph, bands and volume read
 * off the SAME shared source node, so both analysers see the same live
 * signal at any given moment -- only each one's own smoothingTimeConstant
 * makes it react to a change at a different speed. Tests that verify decay
 * drive this directly. Defaults to 1 (loud) so every other, unrelated test
 * -- which never touches this -- keeps seeing non-zero output after a
 * flushed frame, same as the old fixed-data fake did.
 */
let rawSignalLevel = 1;

class FakeAnalyser {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  get frequencyBinCount() { return this.fftSize / 2; }

  /**
   * Simulates AnalyserNode's own internal exponential smoothing:
   * new = tau * previous + (1 - tau) * current -- the exact formula from
   * the Web Audio spec and this task's bug report. Runs on the normalized
   * 0..1 `rawSignalLevel`, not real dB/byte units: the point is to prove
   * THIS hook assigns the right smoothingTimeConstant to the right
   * analyser, through the honest mathematical consequence of that constant,
   * not to byte-match a real AnalyserNode's internal FFT/dB conversion.
   */
  smoothed = 0;
  step() {
    const tau = this.smoothingTimeConstant;
    this.smoothed = tau * this.smoothed + (1 - tau) * rawSignalLevel;
  }

  getFloatFrequencyData(buf: Float32Array) {
    this.step();
    // Maps onto normalizeDb's own [-100, -10] range in audio-bands.ts, so a
    // higher `smoothed` reads as louder through the real reduction, not
    // just through this fake's raw number.
    buf.fill(-100 + this.smoothed * 90);
  }
  getByteFrequencyData(buf: Uint8Array) {
    this.step();
    buf.fill(Math.round(this.smoothed * 255));
  }
  connect() { created.connections.push('analyser->destination'); }
  disconnect() { created.disconnects++; }
}

class FakeAudioContext {
  state: 'running' | 'suspended' = 'running';
  destination = { kind: 'destination' };
  createAnalyser() {
    const a = new FakeAnalyser();
    created.analysers.push(a);
    return a;
  }
  createMediaElementSource(el: unknown) {
    // The real API throws on a second call for the same element.
    if (created.elementSources.includes(el)) {
      throw new Error('HTMLMediaElement already connected to a MediaElementSourceNode');
    }
    created.elementSources.push(el);
    const destination = this.destination;
    return {
      // Models the real graph: this node connects to destination exactly
      // once (at creation) and to N analysers (one per consumer). Recording
      // an opaque 'element->analyser' string for every connect() call would
      // hide a regression where destination gets connected more than once.
      connect: (dest: unknown) => {
        created.connections.push(dest === destination ? 'element->destination' : 'element->analyser');
      },
      disconnect: () => {},
    };
  }
  createMediaStreamSource(s: unknown) {
    // Unlike createMediaElementSource above, the real API does NOT throw on a
    // second call for the same stream -- it is legal per spec to build
    // several independent source nodes from one MediaStream. Modeling that
    // (no throw, just another push) is the point: the bug this fake exists to
    // catch is silent, not an exception.
    created.streamSources.push(s);
    return {
      connect: () => created.connections.push('stream->analyser'),
      disconnect: (arg?: unknown) => {
        if (arg === undefined) created.streamFullDisconnects++;
      },
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

/**
 * No real browser ever invokes a requestAnimationFrame callback synchronously,
 * from inside the call that scheduled it. Modeling rAF as a queue with an
 * explicit flush (instead of calling back immediately) keeps the production
 * `step` loop honest: it can recurse via a plain `requestAnimationFrame(step)`
 * exactly as it would in a browser, and only advances a frame when a test
 * asks for one.
 *
 * Keyed by id, not a flat array: real cancelAnimationFrame(id) cancels only
 * that one registration. Several consumers sharing one stream each run their
 * own step loop concurrently, so one consumer's cleanup must not cancel a
 * still-live sibling's pending frame.
 */
let rafQueue = new Map<number, FrameRequestCallback>();
let nextRafId = 1;
function flushFrame(t = 1000) {
  const callbacks = [...rafQueue.values()];
  rafQueue.clear();
  callbacks.forEach((cb) => cb(t));
}

/**
 * Runs `n` frames, each at least `updateInterval` (32ms default) apart so
 * the production `step` loop's own throttle (`now - last >= updateInterval`)
 * lets every one of them actually read the analysers, instead of only the
 * first. `fakeNow` is a module-level clock, not local to this function: the
 * throttle compares against `step`'s own closed-over `last` from whatever
 * came before, so a second call in the same test (e.g. priming, then decay)
 * must keep advancing from where the previous call left off -- resetting to
 * a fixed start each call would make every one of its timestamps LOWER than
 * `last`, and the throttle would silently swallow every read.
 */
let fakeNow = 1000;
function advanceFrames(n: number, stepMs = 40) {
  for (let i = 0; i < n; i++) {
    fakeNow += stepMs;
    flushFrame(fakeNow);
  }
}

beforeEach(() => {
  created.elementSources = [];
  created.streamSources = [];
  created.connections = [];
  created.disconnects = 0;
  created.streamFullDisconnects = 0;
  created.analysers = [];
  rawSignalLevel = 1;
  fakeNow = 1000;
  rafQueue = new Map();
  nextRafId = 1;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafQueue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id);
  });
});

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

  // The hook wires up in a createEffect, and createEffect's first run does not
  // happen synchronously: it flushes once this callback yields. `await
  // Promise.resolve()` gives it that chance before asserting on the wiring.
  it('wires a MediaStream to the analyser but NOT to destination (no mic echo)', async () => {
    await createRoot(async (dispose) => {
      useAudioAnalysis(() => fakeStream(), { bands: 3 });
      await Promise.resolve();
      expect(created.streamSources).toHaveLength(1);
      expect(created.connections).toContain('stream->analyser');
      expect(created.connections).not.toContain('analyser->destination');
      dispose();
    });
  });

  it('wires an HTMLMediaElement all the way through to destination', async () => {
    await createRoot(async (dispose) => {
      useAudioAnalysis(() => fakeElement(), { bands: 3 });
      await Promise.resolve();
      expect(created.elementSources).toHaveLength(1);
      expect(created.connections).toContain('element->analyser');
      // Without this the consumer's audio goes silent with no error.
      expect(created.connections).toContain('element->destination');
      // The analyser is a terminal side-tap; it never sits in the audio path.
      expect(created.connections).not.toContain('analyser->destination');
      dispose();
    });
  });

  it('reuses the cached source node when the same element mounts twice', async () => {
    const el = fakeElement();
    // Each mount must let its effect actually flush before disposing, or the
    // wiring never runs and the cache is never really exercised.
    await createRoot(async (dispose) => {
      useAudioAnalysis(() => el, { bands: 3 });
      await Promise.resolve();
      dispose();
    });

    // A second consumer of the same element must not throw.
    let threw = false;
    try {
      await createRoot(async (dispose) => {
        useAudioAnalysis(() => el, { bands: 3 });
        await Promise.resolve();
        dispose();
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(created.elementSources).toHaveLength(1);

    // The element connects to destination exactly once, at creation, no
    // matter how many visualizers attach: two consumers on one <audio> must
    // not double the output.
    const toDestination = created.connections.filter((c) => c === 'element->destination');
    expect(toDestination).toHaveLength(1);
    // Both mounts still get their own analyser taps, so a second consumer
    // really does receive data. Two analysers per mount now (bands, volume),
    // so two mounts is 4, not 2.
    const toAnalyser = created.connections.filter((c) => c === 'element->analyser');
    expect(toAnalyser).toHaveLength(4);
    // Neither analyser must ever sit in the audio path, for either mount.
    expect(created.connections).not.toContain('analyser->destination');
  });

  it('disconnects both analysers on cleanup', async () => {
    await createRoot(async (dispose) => {
      useAudioAnalysis(() => fakeStream(), { bands: 3 });
      // Let the effect wire the analysers up before tearing down. Disposing
      // before the effect has ever run cleans up a computation that never
      // executed, and nothing disconnects.
      await Promise.resolve();
      dispose();
    });
    // One consumer, two analysers (bands, volume): both must disconnect.
    expect(created.disconnects).toBe(2);
  });

  it('rebuilds when the source changes', async () => {
    await createRoot(async (dispose) => {
      const [src, setSrc] = createSignal<MediaStream | undefined>(undefined);
      useAudioAnalysis(src, { bands: 3 });
      await Promise.resolve();
      expect(created.streamSources).toHaveLength(0);
      setSrc(fakeStream());
      await Promise.resolve();
      expect(created.streamSources).toHaveLength(1);
      dispose();
    });
  });

  it('produces non-zero bands once a frame actually runs', async () => {
    await createRoot(async (dispose) => {
      const { bands } = useAudioAnalysis(() => fakeStream(), { bands: 3 });
      await Promise.resolve();
      // Wired up, but no frame has read the analyser yet: still the initial
      // zero-fill.
      expect(bands()).toEqual([0, 0, 0]);
      flushFrame();
      // rawSignalLevel defaults to loud (see FakeAnalyser above), so a
      // flushed frame reports non-zero data. This is the hook's entire
      // purpose, so it gets its own assertion instead of relying on another
      // test to exercise it by accident.
      expect(bands().every((b) => b > 0)).toBe(true);
      dispose();
    });
  });

  // A `MediaStream` has no equivalent of createMediaElementSource's throw on
  // a second call, so nothing forced this caching before now. Multiple
  // independent MediaStreamAudioSourceNodes reading the same stream is legal
  // per spec, but is a known source of intermittent silent data loss in
  // Chromium: with three or more simultaneous nodes on one live microphone
  // stream, `volume` was observed sticking at 0 for 5+ seconds with no
  // recovery on some of them. These tests pin the structural fix -- one
  // shared node, N terminal analyser taps -- which is unit-testable. The
  // Chromium flakiness itself is NOT: it is a real-engine, real-hardware,
  // multi-second timing phenomenon that a synchronous jsdom fake cannot
  // reproduce (see the report for what a browser-level check would need).
  describe('sharing one MediaStream across consumers', () => {
    it('creates exactly ONE source node for two consumers on the same stream, and both receive data', async () => {
      const s = fakeStream();
      await createRoot(async (dispose) => {
        const a = useAudioAnalysis(() => s, { bands: 3 });
        const b = useAudioAnalysis(() => s, { bands: 3 });
        await Promise.resolve();
        expect(created.streamSources).toHaveLength(1);
        flushFrame();
        expect(a.bands().some((x) => x > 0)).toBe(true);
        expect(b.bands().some((x) => x > 0)).toBe(true);
        dispose();
      });
    });

    it('produces non-zero values for all six consumers on one shared stream (the failing case)', async () => {
      const s = fakeStream();
      await createRoot(async (dispose) => {
        const consumers = Array.from({ length: 6 }, () => useAudioAnalysis(() => s, { bands: 3 }));
        await Promise.resolve();
        expect(created.streamSources).toHaveLength(1);
        flushFrame();
        consumers.forEach((c) => {
          expect(c.volume()).toBeGreaterThan(0);
        });
        dispose();
      });
    });

    it('leaves the survivor working, and never fully disconnects the shared node, when one of two consumers unmounts', async () => {
      const s = fakeStream();
      let disposeB: (() => void) | undefined;
      let b: ReturnType<typeof useAudioAnalysis> | undefined;

      await createRoot(async (dispose) => {
        const a = useAudioAnalysis(() => s, { bands: 3 });
        createRoot((d) => {
          disposeB = d;
          b = useAudioAnalysis(() => s, { bands: 3 });
        });
        await Promise.resolve();
        expect(created.streamSources).toHaveLength(1);

        // B leaves; A must keep receiving data, and the shared node itself
        // must not have been torn down for everyone.
        disposeB?.();
        expect(created.streamFullDisconnects).toBe(0);

        flushFrame();
        expect(a.bands().some((x) => x > 0)).toBe(true);

        dispose();
      });

      // B's own analyser is gone, but the shared source node was never
      // fully disconnected on B's way out.
      expect(b).toBeDefined();
      expect(created.streamFullDisconnects).toBe(0);
    });

    it('leaves the single-consumer path unchanged: still one node, still never connected to destination', async () => {
      await createRoot(async (dispose) => {
        useAudioAnalysis(() => fakeStream(), { bands: 3 });
        await Promise.resolve();
        expect(created.streamSources).toHaveLength(1);
        expect(created.connections).toContain('stream->analyser');
        expect(created.connections).not.toContain('analyser->destination');
        dispose();
      });
    });
  });

  // A single analyser shared between both reductions was this hook's
  // original design, as an optimization over upstream LiveKit's two
  // separate hooks. That silently forced one smoothingTimeConstant onto
  // both, and made bars snap back to rest instead of easing like upstream's
  // do. The fix restores two analysers, each matching upstream's own
  // per-reduction settings.
  describe('two analysers, matching upstream\'s per-reduction settings', () => {
    it('creates two analysers per consumer: 2048/0.8 for bands, 512/0.55 for volume', async () => {
      await createRoot(async (dispose) => {
        useAudioAnalysis(() => fakeStream(), { bands: 3 });
        await Promise.resolve();
        expect(created.analysers).toHaveLength(2);
        const [bandsAnalyser, volumeAnalyser] = created.analysers;
        expect(bandsAnalyser!.fftSize).toBe(2048);
        expect(bandsAnalyser!.smoothingTimeConstant).toBe(0.8);
        expect(volumeAnalyser!.fftSize).toBe(512);
        expect(volumeAnalyser!.smoothingTimeConstant).toBe(0.55);
        dispose();
      });
    });

    // A test asserting two analysers exist proves the plumbing, not the fix:
    // it would pass even if both were built with the SAME constant. This
    // drives the fake with a loud signal to (near) peak, cuts to silence,
    // and checks that bands (0.8) has NOT collapsed the way volume (0.55)
    // has after the same number of silent frames -- the actual, felt
    // consequence of the two constants differing, and the only thing that
    // would have caught the original bug.
    //
    // The fake CAN model this, honestly: smoothingTimeConstant's decay is a
    // spec-defined formula (new = tau*previous + (1-tau)*current), not an
    // opaque browser internal, and the fake's `step()` above implements
    // exactly that formula using whatever constant THIS hook's production
    // code assigned to each analyser. If bands and volume were swapped, or
    // both set to the same value, this test would fail.
    it('decays the bands (0.8) reduction materially slower than the volume (0.55) one after the signal cuts to silence', async () => {
      await createRoot(async (dispose) => {
        const { bands, volume } = useAudioAnalysis(() => fakeStream(), { bands: 1 });
        await Promise.resolve();

        // Prime both analysers to (near) peak: 40 loud frames converges
        // 1 - 0.8^40 (~0.9999) and 1 - 0.55^40 (~1) both close enough to 1
        // that floating-point rounding is not a factor below.
        rawSignalLevel = 1;
        advanceFrames(40);
        const peakBand = bands()[0]!;
        const peakVolume = volume();
        expect(peakBand).toBeGreaterThan(0);
        expect(peakVolume).toBeGreaterThan(0);

        // Cut to silence. tau^n from peak: at n=6, 0.55^6 ~= 0.028 (under
        // 10% of peak, well past the ~3.9 frames the task's own math
        // predicts for 0.55), while 0.8^6 ~= 0.262 (comfortably above 10%,
        // well short of the ~10.3 frames 0.8 needs) -- a wide, non-brittle
        // margin rather than pinning to the exact fractional-frame crossing.
        rawSignalLevel = 0;
        advanceFrames(6);

        expect(volume()).toBeLessThan(peakVolume * 0.1);
        expect(bands()[0]!).toBeGreaterThan(peakBand * 0.5);
        dispose();
      });
    });
  });

  it('emits zeros and touches nothing when AudioContext is unavailable (SSR)', async () => {
    vi.stubGlobal('AudioContext', undefined);
    await createRoot(async (dispose) => {
      const { bands, volume } = useAudioAnalysis(() => fakeStream(), { bands: 5 });
      // The signals read zero SYNCHRONOUSLY regardless of the guard: see
      // "produces non-zero bands once a frame actually runs" above --
      // `bands()`/`volume()` are zero-filled at mount either way, before
      // any frame has run. Without letting the effect's first run actually
      // happen (createEffect's first run is deferred to a microtask, even
      // inside a bare createRoot -- confirmed in create-tween.test.ts),
      // this assertion alone cannot tell "the SSR guard correctly bailed"
      // from "the effect just hasn't run yet." (Verified: adding the
      // assertions below to the OLD, non-awaiting version of this test
      // still passed trivially -- the `await` is the actual fix, not just
      // the added assertions.)
      await Promise.resolve();
      expect(bands()).toEqual([0, 0, 0, 0, 0]);
      expect(volume()).toBe(0);
      // The actual guard: `getContext()`'s `typeof AudioContext ===
      // 'undefined'` check must make the effect bail out BEFORE ever
      // touching Web Audio. `created.streamSources`/`connections` staying
      // empty is direct proof `ctx.createMediaStreamSource` (and therefore
      // `new AudioContext()`) was never reached -- not an inference from
      // signals that would read the same either way. (`new AudioContext()`
      // with the global stubbed to `undefined`, as here, throws `TypeError:
      // AudioContext is not a constructor` -- confirmed directly in Node --
      // so a missing guard would not silently pass this test either; it
      // would throw during the `await` above instead.)
      expect(created.streamSources).toHaveLength(0);
      expect(created.connections).toHaveLength(0);
      dispose();
    });
  });

  // `bands` also accepts a live accessor (e.g. a consumer's variant/size
  // switching post-mount). A plain number must still work exactly as above;
  // these two prove the additive change did not regress the common case
  // while adding the reactive one.
  describe('a reactive band count', () => {
    it('still accepts a plain number for bands, unchanged', async () => {
      await createRoot(async (dispose) => {
        const { bands } = useAudioAnalysis(() => fakeStream(), { bands: 6 });
        await Promise.resolve();
        expect(bands()).toEqual([0, 0, 0, 0, 0, 0]);
        flushFrame();
        expect(bands()).toHaveLength(6);
        dispose();
      });
    });

    it('rebuilds the analyser at the new bucket count when an accessor-valued bands signal changes', async () => {
      await createRoot(async (dispose) => {
        const [bandCount, setBandCount] = createSignal(3);
        const { bands } = useAudioAnalysis(() => fakeStream(), { bands: bandCount });
        await Promise.resolve();
        flushFrame();
        expect(bands()).toHaveLength(3);

        setBandCount(7);
        await Promise.resolve();
        // The effect reruns (cleanup + rebuild) as soon as the accessor
        // changes: the array is already resized to the NEW count before any
        // new frame has read the analyser, which is the bug this closes --
        // previously a stale-length array would linger, silently padded or
        // truncated by normalizeVolumeBands, until an unmount/remount.
        expect(bands()).toEqual([0, 0, 0, 0, 0, 0, 0]);

        flushFrame();
        expect(bands()).toHaveLength(7);
        dispose();
      });
    });
  });
});
