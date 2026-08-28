/**
 * Browser SpeechSynthesis mechanics, shared by `VoiceOutput`
 * (components/voice-output.tsx) and the message action bar's built-in
 * 'speak' action (primitives/message-feedback.ts) — ONE implementation, per
 * B-7's "back it with the existing kai-voice-output/SpeechSynthesis
 * mechanics". Free, local, no provider — no invoice concern.
 */

/** True when the browser exposes the Web Speech synthesis API. */
export function hasSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Speak `text` natively: cancel-then-speak so a second call pre-empts the
 *  first (VoiceOutput's own speakNative discipline). No-ops where the API
 *  is absent (jsdom, some webviews) or `text` is empty — the caller's
 *  `kai-message-action` event still fires, so a host can back the same
 *  action with a model TTS path instead. */
export function speakText(text: string): void {
  if (!hasSpeechSynthesis() || !text) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
