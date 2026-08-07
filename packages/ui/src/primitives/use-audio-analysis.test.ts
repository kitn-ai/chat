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
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    // Run exactly one frame synchronously so an update happens without a loop.
    cb(performance.now() + 1000);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
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
