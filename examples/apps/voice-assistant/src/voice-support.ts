/**
 * Feature detection for the two browser-native speech APIs this app is built
 * on, plus the microphone it needs to visualise.
 *
 * Nothing here is optional politeness: if the browser can't do one of these the
 * page has to SAY so, because the alternative is a mic button that looks fine
 * and does nothing.
 */

export interface VoiceSupport {
  /** `SpeechRecognition` (or the still-prefixed `webkitSpeechRecognition`). */
  recognition: boolean;
  /** `speechSynthesis` + `SpeechSynthesisUtterance`. */
  synthesis: boolean;
  /** `navigator.mediaDevices.getUserMedia`, for the amplitude visualisation. */
  microphone: boolean;
  /** Both of the above are gated on a secure context (https, or localhost). */
  secureContext: boolean;
  /** True when speech in AND speech out are available. */
  usable: boolean;
}

export function detectVoiceSupport(): VoiceSupport {
  // `SpeechRecognition` is not in TypeScript's DOM lib, so probe the global
  // bag rather than inventing a type for an API we never construct ourselves —
  // <kai-voice-input> owns that.
  const globals = window as unknown as Record<string, unknown>;
  const recognition =
    typeof globals.SpeechRecognition === 'function' ||
    typeof globals.webkitSpeechRecognition === 'function';

  const synthesis =
    'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

  const microphone = typeof navigator.mediaDevices?.getUserMedia === 'function';

  return {
    recognition,
    synthesis,
    microphone,
    secureContext: window.isSecureContext,
    usable: recognition && synthesis,
  };
}

/**
 * The sentence to show on the page, or `null` when everything is available.
 * Names the missing capability and what it costs, so the failure is legible
 * rather than just "unsupported".
 */
export function supportMessage(support: VoiceSupport): string | null {
  const lost: string[] = [];
  if (!support.recognition) {
    lost.push(
      'speech recognition (SpeechRecognition / webkitSpeechRecognition), so this browser cannot turn your voice into text',
    );
  }
  if (!support.synthesis) {
    lost.push(
      'speech synthesis (speechSynthesis), so replies will appear as text but will not be read aloud',
    );
  }
  if (!support.microphone) {
    lost.push('microphone access (getUserMedia), so nothing can be recorded or visualised');
  }
  if (lost.length === 0) return null;

  const insecure = !support.secureContext
    ? ' This page is not running in a secure context — these APIs are only available over https, or on localhost.'
    : '';

  return `This browser is missing ${lost.join('; and ')}.${insecure} As of today, Chrome, Edge and Safari implement native speech recognition; Firefox does not.`;
}

/** A readable sentence for a getUserMedia rejection. */
export function microphoneErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was denied. Allow it for this site and try again — the audio never leaves your browser.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Plug one in, or pick one in your system sound settings.';
    case 'NotReadableError':
      return 'The microphone is already in use by another application and could not be opened.';
    case 'TimeoutError':
      // Raised by the app's own deadline around getUserMedia (main.ts): a
      // permission prompt left unanswered keeps the request pending forever.
      return 'The microphone did not open — a permission prompt may still be waiting for an answer. Allow microphone access and try again.';
    default:
      return `The microphone could not be opened: ${err instanceof Error ? err.message : String(err)}`;
  }
}
