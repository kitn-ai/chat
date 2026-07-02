/** Minimal shape of a Web Speech recognition result event — enough to read the
 *  first transcript. The full SpeechRecognition API isn't in TS's lib.dom yet. */
interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  start(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Resolve the Chromium (`webkitSpeechRecognition`) or standard constructor, if any. */
function getSpeechRecognition(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Web Speech mic → one-shot transcript. Chromium-only (`webkitSpeechRecognition`);
 * `supported` is false elsewhere so the caller can degrade gracefully. Svelte port
 * of the kit's `useVoiceInput` (a React hook). It hands the raw transcript to
 * `onTranscript` and lets the caller decide what to do with it (the composer mic
 * appends it to the live text). No composer or DOM knowledge.
 *
 * @param onTranscript called with the final recognized transcript.
 * @returns `supported` (Chromium-only availability) and a `start` that begins one
 *   recognition pass (a no-op when unsupported).
 */
export function createVoiceInput(onTranscript: (transcript: string) => void): {
  supported: boolean;
  start: () => void;
} {
  // Latest-callback ref: keeps `start` stable while always calling the current
  // `onTranscript`, mirroring the React hook (no stale closure).
  const cbRef = { current: onTranscript };
  cbRef.current = onTranscript;

  const supported = getSpeechRecognition() !== undefined;

  const start = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (event) => cbRef.current(event.results[0][0].transcript);
    rec.start();
  };

  return { supported, start };
}
