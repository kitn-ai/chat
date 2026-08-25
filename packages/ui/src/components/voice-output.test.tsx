import { flush } from 'solid-js';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { VoiceOutput, type VoiceOutputController } from './voice-output';

// jsdom ships no Web Speech API, so stub speechSynthesis + the utterance ctor.
// The stub captures the spoken utterance and lets a test fire its `onstart` /
// `onend` / `onerror` to drive the transitions the component listens for.
let lastUtterance:
  | { text: string; onstart?: () => void; onend?: () => void; onerror?: (e: { error?: string }) => void }
  | undefined;
const speakSpy = vi.fn((u: typeof lastUtterance) => { lastUtterance = u; });
const cancelSpy = vi.fn();

class FakeUtterance {
  text: string;
  onstart?: () => void;
  onend?: () => void;
  onerror?: (e: { error?: string }) => void;
  constructor(text: string) { this.text = text; }
}

beforeEach(() => {
  lastUtterance = undefined;
  speakSpy.mockClear();
  cancelSpy.mockClear();
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', { speak: speakSpy, cancel: cancelSpy, pause: vi.fn(), resume: vi.fn() });
  // jsdom defines `window` but not the speechSynthesis property; mirror the stub.
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VoiceOutput — native path (speechSynthesis)', () => {
  it('speak() calls speechSynthesis.speak, but speaking-change(true) waits for utterance.onstart', () => {
    const onSpeakingChange = vi.fn();
    let controller!: VoiceOutputController;
    render(() => (
      <VoiceOutput text="hello world" onSpeakingChange={onSpeakingChange} controllerRef={(c) => (controller = c)} />
    ));

    controller.speak();

    expect(speakSpy).toHaveBeenCalledTimes(1);
    expect(lastUtterance?.text).toBe('hello world');
    // speaking:true means AUDIO STARTED, not "speak() was called" (W4 symptom 3):
    // firing it optimistically inside speak() let a consumer's watchdog race it.
    expect(onSpeakingChange).not.toHaveBeenCalled();

    lastUtterance?.onstart?.();
    flush(); // V2-FLUSH: commit the staged speaking-state write
    expect(onSpeakingChange).toHaveBeenLastCalledWith(true);
  });

  it('clicking the button speaks, then stops on a second click (fires speaking-change(false))', () => {
    const onSpeakingChange = vi.fn();
    const { getByRole } = render(() => (
      <VoiceOutput text="read me" onSpeakingChange={onSpeakingChange} />
    ));
    const btn = getByRole('button');

    fireEvent.click(btn);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(speakSpy).toHaveBeenCalledTimes(1);
    lastUtterance?.onstart?.();
    flush(); // V2-FLUSH: commit the staged speaking-state write
    expect(onSpeakingChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(btn);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(cancelSpy).toHaveBeenCalled();
    expect(onSpeakingChange).toHaveBeenLastCalledWith(false);
  });

  it('fires speaking-change(false) when the utterance ends', () => {
    const onSpeakingChange = vi.fn();
    let controller!: VoiceOutputController;
    render(() => (
      <VoiceOutput text="bye" onSpeakingChange={onSpeakingChange} controllerRef={(c) => (controller = c)} />
    ));

    controller.speak();
    lastUtterance?.onstart?.();
    flush(); // V2-FLUSH: commit the staged speaking-state write
    expect(onSpeakingChange).toHaveBeenLastCalledWith(true);

    lastUtterance?.onend?.();
    flush(); // V2-FLUSH: commit the staged speaking-state write
    expect(onSpeakingChange).toHaveBeenLastCalledWith(false);
  });

  it('a synthesis runtime error fires onError with source "synthesis" and the platform code', () => {
    const onError = vi.fn();
    const onSpeakingChange = vi.fn();
    let controller!: VoiceOutputController;
    render(() => (
      <VoiceOutput
        text="fail me"
        onError={onError}
        onSpeakingChange={onSpeakingChange}
        controllerRef={(c) => (controller = c)}
      />
    ));

    controller.speak();
    lastUtterance?.onstart?.();
    flush(); // V2-FLUSH: commit the staged speaking-state write
    lastUtterance?.onerror?.({ error: 'not-allowed' });
    flush(); // V2-FLUSH: commit the staged speaking-state write

    expect(onError).toHaveBeenCalledWith({
      source: 'synthesis',
      error: 'not-allowed',
      message: expect.stringContaining('not-allowed'),
    });
    expect(onSpeakingChange).toHaveBeenLastCalledWith(false);
  });

  it('deliberate cancellation ("canceled"/"interrupted") does NOT fire onError', () => {
    const onError = vi.fn();
    let controller!: VoiceOutputController;
    render(() => (
      <VoiceOutput text="cut me off" onError={onError} controllerRef={(c) => (controller = c)} />
    ));

    controller.speak();
    lastUtterance?.onstart?.();
    flush(); // V2-FLUSH: commit the staged speaking-state write
    // What the platform reports when the APP calls cancel() (stop, or a new
    // speak() pre-empting): the app asked for it, so it is not a failure.
    lastUtterance?.onerror?.({ error: 'interrupted' });
    flush(); // V2-FLUSH: commit the staged speaking-state write
    lastUtterance?.onerror?.({ error: 'canceled' });
    flush(); // V2-FLUSH: commit the staged speaking-state write

    expect(onError).not.toHaveBeenCalled();
  });

  it('renders disabled when speechSynthesis is unavailable and no synthesize is set', () => {
    vi.unstubAllGlobals();
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    const { getByRole } = render(() => <VoiceOutput text="no speech" />);
    expect(getByRole('button')).toBeDisabled();
  });
});

describe('VoiceOutput — model path (synthesize)', () => {
  beforeEach(() => {
    // jsdom implements neither URL.createObjectURL nor HTMLMediaElement.play/pause.
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined);
  });

  it('speak() invokes the synthesize callback with the text and emits the blob', async () => {
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    const onSynthesize = vi.fn(async () => blob);
    const onSynthesized = vi.fn();
    let controller!: VoiceOutputController;
    render(() => (
      <VoiceOutput
        text="say this"
        onSynthesize={onSynthesize}
        onSynthesized={onSynthesized}
        controllerRef={(c) => (controller = c)}
      />
    ));

    controller.speak();
    // Native path must NOT be used when synthesize is set.
    expect(speakSpy).not.toHaveBeenCalled();
    expect(onSynthesize).toHaveBeenCalledWith('say this');

    // Let the synthesize promise resolve so the blob is emitted.
    await onSynthesize.mock.results[0].value;
    expect(onSynthesized).toHaveBeenCalledWith(blob);
  });

  it('speaking-change(true) fires only once audio.play() has resolved (audio actually started)', async () => {
    const onSpeakingChange = vi.fn();
    let resolvePlay!: () => void;
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(
      () => new Promise<void>((resolve) => { resolvePlay = resolve; }),
    );
    let controller!: VoiceOutputController;
    render(() => (
      <VoiceOutput
        text="model speech"
        onSynthesize={async () => new Blob(['audio'])}
        onSpeakingChange={onSpeakingChange}
        controllerRef={(c) => (controller = c)}
      />
    ));

    controller.speak();
    await Promise.resolve(); // synthesize resolves; play() is still pending
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSpeakingChange).not.toHaveBeenCalled();

    resolvePlay();
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSpeakingChange).toHaveBeenLastCalledWith(true);
  });

  it('a rejecting synthesize callback fires onError with source "synthesis"', async () => {
    const onError = vi.fn();
    const failure = Object.assign(new Error('TTS backend unreachable'), { name: 'SynthesizeError' });
    let controller!: VoiceOutputController;
    render(() => (
      <VoiceOutput
        text="doomed"
        onSynthesize={async () => { throw failure; }}
        onError={onError}
        controllerRef={(c) => (controller = c)}
      />
    ));

    controller.speak();
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(onError).toHaveBeenCalledWith({
      source: 'synthesis',
      error: 'SynthesizeError',
      message: 'TTS backend unreachable',
    });
  });

  it('audio.play() rejecting (e.g. autoplay blocked) fires onError with the DOMException name', async () => {
    const onError = vi.fn();
    const blocked = Object.assign(new Error('play() blocked'), { name: 'NotAllowedError' });
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockRejectedValue(blocked);
    let controller!: VoiceOutputController;
    render(() => (
      <VoiceOutput
        text="blocked"
        onSynthesize={async () => new Blob(['audio'])}
        onError={onError}
        controllerRef={(c) => (controller = c)}
      />
    ));

    controller.speak();
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(onError).toHaveBeenCalledWith({
      source: 'synthesis',
      error: 'NotAllowedError',
      message: 'play() blocked',
    });
  });
});
