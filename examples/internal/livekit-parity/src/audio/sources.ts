import { createLocalAudioTrack, LocalAudioTrack } from 'livekit-client';

/**
 * Mic capture presets. Both sides always receive the SAME captured stream:
 * theirs as a LocalAudioTrack, ours as `track.mediaStream` -- so a preset
 * changes the input signal for both rows identically.
 *
 * - 'livekit': their real default path -- `createLocalAudioTrack()` with
 *   livekit-client's audioDefaults (AGC + echoCancellation + noiseSuppression
 *   + voiceIsolation; client-sdk-js src/room/defaults.ts:25-31).
 * - 'browser': bare `getUserMedia({ audio: true })` -- what our docs example
 *   does. Browsers still default AGC/NS/EC on, but no voiceIsolation.
 * - 'off': every processing constraint explicitly false -- the truly raw mic.
 */
export type MicPreset = 'livekit' | 'browser' | 'off';

export interface LiveSource {
  /** For the upstream components (`audioTrack` prop) and their hooks. */
  track: LocalAudioTrack;
  /** For our `<kai-audio-visualizer>` (`stream` property). Same underlying audio. */
  stream: MediaStream;
  stop(): void;
}

/**
 * Wrap an already-captured MediaStream in a LocalAudioTrack the way
 * `createLocalAudioTrack` does for its own capture: their hooks
 * (useTrackVolume / useMultibandTrackVolume) guard on `track.mediaStream`
 * being set, which livekit's own path assigns after capture
 * (client-sdk-js src/room/track/create.ts:138 `track.mediaStream = stream`).
 * `Track.mediaStream` is a public field, so the same assignment works here.
 */
function wrapStream(stream: MediaStream): LocalAudioTrack {
  const msTrack = stream.getAudioTracks()[0];
  if (!msTrack) throw new Error('stream has no audio track');
  const track = new LocalAudioTrack(msTrack, undefined, true);
  track.mediaStream = stream;
  return track;
}

export async function openMic(preset: MicPreset): Promise<LiveSource> {
  if (preset === 'livekit') {
    // Their exact default capture path, processing included.
    const track = await createLocalAudioTrack();
    return {
      track,
      stream: track.mediaStream ?? new MediaStream([track.mediaStreamTrack]),
      stop: () => track.stop(),
    };
  }

  const audio: boolean | MediaTrackConstraints =
    preset === 'browser'
      ? true
      : ({
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          // Not in TS's MediaTrackConstraints yet; Chrome honors it.
          voiceIsolation: false,
        } as MediaTrackConstraints);

  const stream = await navigator.mediaDevices.getUserMedia({ audio });
  const track = wrapStream(stream);
  return {
    track,
    stream,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}

/**
 * Decode public/voice.wav and loop it into a MediaStream via
 * AudioBufferSourceNode -> MediaStreamAudioDestinationNode. Deliberately NOT
 * `createMediaElementSource` (throws on a second call per element). Both
 * sides then read that one stream.
 */
export async function openRecording(url = '/voice.wav'): Promise<LiveSource> {
  const ctx = new AudioContext();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status} (run: pnpm setup)`);
  const buffer = await ctx.decodeAudioData(await res.arrayBuffer());

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const dest = ctx.createMediaStreamDestination();
  src.connect(dest);
  // Also make it audible so a human at the page hears what both rows see.
  src.connect(ctx.destination);
  src.start();

  const stream = dest.stream;
  const track = wrapStream(stream);
  return {
    track,
    stream,
    stop: () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      void ctx.close();
    },
  };
}
