import { flush } from 'solid-js';
import { vi } from 'vitest';
import '../../src/elements/voice-input';

test('record button has an accessible name in its idle state (a11y A1)', async () => {
  const el = document.createElement('kai-voice-input');
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const button = el.shadowRoot!.querySelector<HTMLButtonElement>('button')!;
  // Idle state mirrors the tooltip: "Voice input".
  expect(button.getAttribute('aria-label')).toBe('Voice input');

  el.remove();
});

// --- native SpeechRecognition path (no `transcribe` callback set) ---

// A fake SpeechRecognition wired to window, so the native path is "supported".
class FakeSpeechRecognition {
  static last: FakeSpeechRecognition | undefined;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeSpeechRecognition.last = this;
  }
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  emitFinal(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript } } },
    });
  }
}

interface VoiceErrorDetail {
  source: 'recognition';
  error: string;
  message: string;
}

/** Mount a <kai-voice-input> on the fake-recognition path and start a session. */
async function mountAndStart() {
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeSpeechRecognition;
  FakeSpeechRecognition.last = undefined;

  const el = document.createElement('kai-voice-input');
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const errors: VoiceErrorDetail[] = [];
  el.addEventListener('kai-voice-error', (e) => {
    errors.push((e as CustomEvent<VoiceErrorDetail>).detail);
  });
  const transcripts: string[] = [];
  el.addEventListener('kai-transcription', (e) => {
    transcripts.push((e as CustomEvent<{ text: string }>).detail.text);
  });

  const button = el.shadowRoot!.querySelector<HTMLButtonElement>('button')!;
  button.click(); // begin recognition
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  return { el, button, errors, transcripts, recog: FakeSpeechRecognition.last! };
}

function unmount(el: HTMLElement) {
  el.remove();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
}

test('a recognition runtime error fires kai-voice-error with the platform code', async () => {
  const { el, errors, transcripts, recog } = await mountAndStart();

  recog.onerror?.({ error: 'network' });
  recog.onend?.(); // the session dies after the error, with no result
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(errors).toEqual([
    { source: 'recognition', error: 'network', message: expect.stringContaining('network') },
  ]);
  expect(transcripts).toEqual([]);

  unmount(el);
});

test('a session that ends with no text and no error fires kai-voice-error {error: "no-result"}', async () => {
  const { el, button, errors, transcripts } = await mountAndStart();

  button.click(); // stop -> onend resolves with the empty final text
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(errors).toEqual([
    { source: 'recognition', error: 'no-result', message: expect.any(String) },
  ]);
  expect(transcripts).toEqual([]);

  unmount(el);
});

test('a session that produced text fires kai-transcription and NO kai-voice-error', async () => {
  const { el, button, errors, transcripts, recog } = await mountAndStart();

  recog.emitFinal('all good');
  button.click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(transcripts).toEqual(['all good']);
  expect(errors).toEqual([]);

  unmount(el);
});

test('recognition failing to construct/start fires kai-voice-error with the exception name', async () => {
  class ThrowingRecognition extends FakeSpeechRecognition {
    start = vi.fn(() => {
      const err = new Error('recognition already started');
      err.name = 'InvalidStateError';
      throw err;
    });
  }
  (window as unknown as Record<string, unknown>).SpeechRecognition = ThrowingRecognition;

  const el = document.createElement('kai-voice-input');
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const errors: VoiceErrorDetail[] = [];
  el.addEventListener('kai-voice-error', (e) => {
    errors.push((e as CustomEvent<VoiceErrorDetail>).detail);
  });

  el.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(errors).toEqual([
    { source: 'recognition', error: 'InvalidStateError', message: 'recognition already started' },
  ]);

  unmount(el);
});

test('native recognition fires kai-transcription when no transcribe is set', async () => {
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeSpeechRecognition;
  FakeSpeechRecognition.last = undefined;

  const el = document.createElement('kai-voice-input');
  // no `el.transcribe` → native SpeechRecognition path
  el.setAttribute('recognition-lang', 'en-US');
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const transcripts: string[] = [];
  el.addEventListener('kai-transcription', (e) => {
    transcripts.push((e as CustomEvent<{ text: string }>).detail.text);
  });

  const button = el.shadowRoot!.querySelector<HTMLButtonElement>('button')!;
  button.click(); // begin recognition
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const recog = FakeSpeechRecognition.last!;
  expect(recog.start).toHaveBeenCalled();
  expect(recog.lang).toBe('en-US');

  recog.emitFinal('hello from native');
  button.click(); // stop → onend resolves with final text
  // let the resolved start() promise flush → onTranscription → dispatch
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(transcripts).toEqual(['hello from native']);

  el.remove();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
});
