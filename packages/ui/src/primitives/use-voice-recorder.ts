import { createSignal, onCleanup } from 'solid-js';

export interface UseVoiceRecorderOptions {
  mimeType?: string;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const mimeType = options.mimeType ?? 'audio/webm;codecs=opus';
  const [isRecording, setIsRecording] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [stream, setStream] = createSignal<MediaStream | undefined>();

  let mediaRecorder: MediaRecorder | undefined;
  let chunks: Blob[] = [];
  let resolveBlob: ((blob: Blob) => void) | undefined;

  async function start(): Promise<Blob> {
    setError(null);
    chunks = [];
    // V2-PORT: the catch below used to read `stream()` to find the live stream, but
    // v2 stages writes — a same-tick read after `setStream(mediaStream)` returns the
    // LAST COMMITTED value (undefined), which would leave the microphone open on the
    // exact failure path this exists to close. Track the live stream in a plain
    // variable instead of reading it back through the signal.
    let acquired: MediaStream | undefined;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquired = mediaStream;
      setStream(mediaStream);
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        mediaStream.getTracks().forEach((t) => t.stop());
        setStream(undefined);
        setIsRecording(false);
        resolveBlob?.(blob);
      };
      mediaRecorder.start();
      setIsRecording(true);
      return new Promise<Blob>((resolve) => { resolveBlob = resolve; });
    } catch (err) {
      // getUserMedia may have already succeeded (stream() is live) even
      // though something after it threw, e.g. an unsupported mimeType
      // rejected by `new MediaRecorder(...)`. Leaving that stream open would
      // keep the microphone live with no indication anything is recording.
      const liveStream = acquired; // V2-PORT: see the note above start()'s try
      if (liveStream) {
        liveStream.getTracks().forEach((t) => t.stop());
        setStream(undefined);
      }
      setError(err instanceof Error ? err.message : 'Microphone access denied');
      setIsRecording(false);
      throw err;
    }
  }

  function stop() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }

  onCleanup(() => stop());

  return { isRecording, error, stream, start, stop };
}
