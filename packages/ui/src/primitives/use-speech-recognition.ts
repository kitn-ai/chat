import { createSignal, onCleanup } from 'solid-js';

// Minimal Web Speech API surface. The DOM lib doesn't ship these types reliably
// across TS versions, so we declare only what we touch. `webkitSpeechRecognition`
// is the Chrome/Safari-prefixed constructor; the unprefixed one is rare.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export interface UseSpeechRecognitionOptions {
  /** Emit live, non-final partials via the `onInterim` callback passed to start(). */
  interim?: boolean;
}

export interface SpeechRecognitionStartOptions {
  /** BCP-47 language tag, e.g. `en-US`. */
  lang?: string;
  /** Called with each interim (non-final) transcript when `interim` is enabled. */
  onInterim?: (text: string) => void;
  /**
   * Called when the recognition session hits a runtime error (`recognition.onerror`),
   * with the platform's error code (`network`, `not-allowed`, `no-speech`, ...) and a
   * human-readable message. The session still ends through `onend`, so `start()` still
   * resolves (with whatever text was captured before the error). Without this callback
   * a runtime failure is invisible: the `error` signal is state, not a notification.
   */
  onError?: (error: string, message: string) => void;
}

/**
 * Wrap the browser's Web Speech `SpeechRecognition` (Chrome/Safari; no Firefox).
 * Mirrors `useVoiceRecorder`'s shape: an `isListening` signal, an `error` signal,
 * and `start`/`stop` controls. `start()` resolves with the final transcript when
 * recognition ends; `stop()` ends the in-progress session (resolving start()).
 *
 * Caveat (documented at the element): in Chrome this is cloud-based — audio is
 * sent to Google — so it is "native to the browser," not on-device/private.
 */
export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const isSupported = getCtor() !== undefined;

  let recognition: SpeechRecognitionLike | undefined;
  let resolveText: ((text: string) => void) | undefined;
  let finalText = '';

  function start(opts: SpeechRecognitionStartOptions = {}): Promise<string> {
    setError(null);
    finalText = '';
    const Ctor = getCtor();
    if (!Ctor) {
      const message = 'SpeechRecognition is not supported in this browser';
      setError(message);
      return Promise.reject(new Error(message));
    }
    try {
      recognition = new Ctor();
      if (opts.lang) recognition.lang = opts.lang;
      recognition.interimResults = options.interim === true;
      recognition.continuous = false;

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) {
            finalText += transcript;
          } else {
            interim += transcript;
          }
        }
        if (interim && opts.onInterim) opts.onInterim(interim);
      };

      recognition.onerror = (event) => {
        const code = event.error ?? 'unknown';
        const message = `Speech recognition error: ${code}`;
        setError(message);
        opts.onError?.(code, message);
      };

      recognition.onend = () => {
        setIsListening(false);
        resolveText?.(finalText);
        recognition = undefined;
      };

      recognition.start();
      setIsListening(true);
      return new Promise<string>((resolve) => { resolveText = resolve; });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speech recognition failed to start');
      setIsListening(false);
      throw err;
    }
  }

  function stop() {
    if (recognition && isListening()) {
      recognition.stop();
    }
  }

  onCleanup(() => {
    if (recognition) recognition.abort();
  });

  return { isSupported, isListening, error, start, stop };
}
