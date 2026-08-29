/**
 * Browser SpeechSynthesis mechanics, shared by `VoiceOutput`
 * (components/voice-output.tsx) and the message action bar's built-in
 * 'speak' action (primitives/message-feedback.ts) — ONE implementation, per
 * B-7's "back it with the existing kai-voice-output/SpeechSynthesis
 * mechanics". Free, local, no provider — no invoice concern.
 *
 * Every raw `window.speechSynthesis` access lives HERE, each wrapped in its
 * own `hasSpeechSynthesis()` guard, so `voice-output.tsx` (whose `stop()` is
 * reachable from `onCleanup`) never touches the global directly. That is not
 * just tidiness: `tests/components/teardown-without-dom-globals.test.tsx`
 * statically resolves a teardown callback's call graph PER FILE (it does not
 * follow an imported callee into the module that defines it) and recognizes
 * a guard only when the guarding predicate's body is walkable in the same
 * file as the raw access — so the guard must live beside the access it
 * protects, not just be callable before it.
 */

/** True when the browser exposes the Web Speech synthesis API. */
export function hasSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Cancel any in-flight/queued native speech. No-ops where the API is absent. */
export function cancelSpeech(): void {
  if (!hasSpeechSynthesis()) return;
  window.speechSynthesis.cancel();
}

/** Speak an already-constructed utterance (the caller wires its own
 *  onstart/onend/onerror before calling this). No-ops where the API is absent. */
export function speakUtterance(utterance: SpeechSynthesisUtterance): void {
  if (!hasSpeechSynthesis()) return;
  window.speechSynthesis.speak(utterance);
}

/** Pause in-flight native speech (resumable via `resumeSpeech`). No-ops where
 *  the API is absent. */
export function pauseSpeech(): void {
  if (!hasSpeechSynthesis()) return;
  window.speechSynthesis.pause();
}

/** Resume previously paused native speech. No-ops where the API is absent. */
export function resumeSpeech(): void {
  if (!hasSpeechSynthesis()) return;
  window.speechSynthesis.resume();
}

/** Speak `text` natively: cancel-then-speak so a second call pre-empts the
 *  first (VoiceOutput's own speakNative discipline). No-ops where the API
 *  is absent (jsdom, some webviews) or `text` is empty — the caller's
 *  `kai-message-action` event still fires, so a host can back the same
 *  action with a model TTS path instead. */
export function speakText(text: string): void {
  if (!hasSpeechSynthesis() || !text) return;
  cancelSpeech();
  speakUtterance(new SpeechSynthesisUtterance(text));
}
