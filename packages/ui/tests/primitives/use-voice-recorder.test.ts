import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { useVoiceRecorder } from '../../src/primitives/use-voice-recorder';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVoiceRecorder', () => {
  it('returns isRecording signal and control functions', () => {
    createRoot((dispose) => {
      const { isRecording, start, stop } = useVoiceRecorder();
      expect(isRecording()).toBe(false);
      expect(typeof start).toBe('function');
      expect(typeof stop).toBe('function');
      dispose();
    });
  });

  it('stops the microphone and clears stream() if the recorder throws after getUserMedia succeeds', async () => {
    const stoppedTracks: string[] = [];
    const fakeTrack = { stop: () => stoppedTracks.push('stopped') };
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream;

    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
    });
    vi.stubGlobal(
      'MediaRecorder',
      vi.fn().mockImplementation(function () {
        // e.g. an unsupported mimeType, thrown after getUserMedia already
        // handed back a live stream. A constructable function, not an arrow,
        // since `new MediaRecorder(...)` requires one.
        throw new Error('unsupported mimeType');
      }),
    );

    await createRoot(async (dispose) => {
      const { stream, start } = useVoiceRecorder();
      await expect(start()).rejects.toThrow('unsupported mimeType');
      // The mic must not be left open with no visible recording in progress.
      expect(stream()).toBeUndefined();
      expect(stoppedTracks).toEqual(['stopped']);
      dispose();
    });
  });
});
