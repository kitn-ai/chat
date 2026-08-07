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

/**
 * No real browser ever invokes a requestAnimationFrame callback synchronously,
 * from inside the call that scheduled it. Modeling rAF as a queue with an
 * explicit flush (instead of calling back immediately) keeps the production
 * `step` loop honest: it can recurse via a plain `requestAnimationFrame(step)`
 * exactly as it would in a browser, and only advances a frame when a test
 * asks for one.
 */
let rafQueue: FrameRequestCallback[] = [];
function flushFrame(t = 1000) {
  const queue = rafQueue;
  rafQueue = [];
  queue.forEach((cb) => cb(t));
}

beforeEach(() => {
  created.elementSources = [];
  created.streamSources = [];
  created.connections = [];
  created.disconnects = 0;
  rafQueue = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    rafQueue = [];
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
      expect(created.connections).toContain('analyser->destination');
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
  });

  it('disconnects the analyser on cleanup', async () => {
    await createRoot(async (dispose) => {
      useAudioAnalysis(() => fakeStream(), { bands: 3 });
      // Let the effect wire the analyser up before tearing down. Disposing
      // before the effect has ever run cleans up a computation that never
      // executed, and nothing disconnects.
      await Promise.resolve();
      dispose();
    });
    expect(created.disconnects).toBeGreaterThan(0);
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
      // FakeAnalyser reports -50dB across the board, which normalizes to a
      // positive value. This is the hook's entire purpose, so it gets its own
      // assertion instead of relying on another test to exercise it by accident.
      expect(bands().every((b) => b > 0)).toBe(true);
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
