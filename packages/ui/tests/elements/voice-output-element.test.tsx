import { flush } from 'solid-js';
import { vi } from 'vitest';
import '../../src/elements/voice-output';

// jsdom ships no Web Speech API; stub the synthesis surface so the facade's
// native path runs. The stub captures the utterance so a test can fire its
// onstart/onerror and watch what the ELEMENT dispatches.
interface UtteranceLike {
  text: string;
  onstart?: () => void;
  onend?: () => void;
  onerror?: (e: { error?: string }) => void;
}
let lastUtterance: UtteranceLike | undefined;

class FakeUtterance implements UtteranceLike {
  text: string;
  onstart?: () => void;
  onend?: () => void;
  onerror?: (e: { error?: string }) => void;
  constructor(text: string) { this.text = text; }
}

beforeEach(() => {
  lastUtterance = undefined;
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', {
    speak: vi.fn((u: UtteranceLike) => { lastUtterance = u; }),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  });
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis =
    (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
});

interface VoiceOutputEl extends HTMLElement {
  text: string;
  speak(): void;
}

async function mountAndSpeak() {
  const el = document.createElement('kai-voice-output') as VoiceOutputEl;
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  el.text = 'hello out loud';
  flush(); // V2-FLUSH: commit the staged prop before speak() reads it

  const speaking: boolean[] = [];
  el.addEventListener('kai-speaking-change', (e) => {
    speaking.push((e as CustomEvent<{ speaking: boolean }>).detail.speaking);
  });
  const errors: { source: string; error: string; message: string }[] = [];
  el.addEventListener('kai-voice-error', (e) => {
    errors.push((e as CustomEvent<{ source: string; error: string; message: string }>).detail);
  });

  el.speak();
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  return { el, speaking, errors };
}

test('kai-speaking-change {speaking:true} fires on utterance.onstart, not inside speak()', async () => {
  const { el, speaking } = await mountAndSpeak();

  // speak() has been called but audio has not started: no event yet. This is
  // the behavior change from W4 symptom 3 (it used to fire inside speak()).
  expect(speaking).toEqual([]);

  lastUtterance?.onstart?.();
  flush(); // V2-FLUSH: commit the staged speaking-state write
  expect(speaking).toEqual([true]);

  lastUtterance?.onend?.();
  flush(); // V2-FLUSH: commit the staged speaking-state write
  expect(speaking).toEqual([true, false]);

  el.remove();
});

test('utterance.onerror dispatches kai-voice-error {source:"synthesis"} with the platform code', async () => {
  const { el, speaking, errors } = await mountAndSpeak();

  lastUtterance?.onstart?.();
  flush(); // V2-FLUSH: commit the staged speaking-state write
  lastUtterance?.onerror?.({ error: 'not-allowed' });
  flush(); // V2-FLUSH: commit the staged speaking-state write

  expect(errors).toEqual([
    { source: 'synthesis', error: 'not-allowed', message: expect.stringContaining('not-allowed') },
  ]);
  expect(speaking).toEqual([true, false]);

  el.remove();
});
