/** Minimal shape of a Web Speech recognition result event, enough to read the
 *  first transcript. The full SpeechRecognition API is not in TS's lib.dom yet. */
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

export interface VoiceInput {
  /** Chromium-only availability. False elsewhere so the caller can degrade. */
  supported: boolean;
  /** Begin one recognition pass (a no-op when unsupported). */
  start: () => void;
}

/**
 * Web Speech mic to one-shot transcript. Chromium-only (`webkitSpeechRecognition`);
 * `supported` is false elsewhere so the caller can degrade gracefully. Framework
 * ports (the React `useVoiceInput` hook, the Vue composable) share this exact
 * logic. It hands the raw transcript to `onTranscript` and lets the caller decide
 * what to do with it (the composer mic appends it to the live text). No composer
 * or DOM knowledge.
 *
 * @param onTranscript called with the final recognized transcript.
 */
export function createVoiceInput(onTranscript: (transcript: string) => void): VoiceInput {
  const supported = getSpeechRecognition() !== undefined;

  const start = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (event) => onTranscript(event.results[0][0].transcript);
    rec.start();
  };

  return { supported, start };
}
