import { defineWebComponent } from './define';
import { VoiceOutput, type VoiceOutputController } from '../components/voice-output';

interface Props extends Record<string, unknown> {
  /** The utterance to read aloud. */
  text?: string;
  /** Speak automatically when `text` is set/changed. */
  autoplay?: boolean;
  /**
   * TTS model seam the host supplies: given text, returns an audio `Blob` to
   * play. This is a **function-valued property** (`el.synthesize = async text =>
   * blob`); when set, the native `speechSynthesis` path is bypassed. Mirrors
   * `<kai-voice-input>`'s `transcribe`. A value-returning callback can't be
   * modelled as a fire-and-forget event, hence a property.
   */
  synthesize?: (text: string) => Promise<Blob>;
  /** Disable the button (non-interactive). */
  disabled?: boolean;
}

/** Events fired by `<kai-voice-output>`. */
interface Events {
  /** Playback started or stopped. Drive your own UI in sync. `speaking: true`
   *  fires when audio actually starts (utterance.onstart natively; audio playback
   *  beginning on the `synthesize` path), not when speak() is called; earlier
   *  releases fired it optimistically inside speak() itself. Fires on real
   *  transitions only (manual click and programmatic speak()/stop()), never on
   *  mount. */
  'kai-speaking-change': { speaking: boolean };
  /** The model path (`synthesize`) resolved audio: the raw `Blob` before playback. */
  'kai-synthesized': { blob: Blob };
  /** A voice session failed, so no failure is ever silent. `detail.source` names
   *  the failing side (`recognition` on `<kai-voice-input>`, `synthesis` on
   *  `<kai-voice-output>`), `detail.error` carries the platform error code, the
   *  thrown exception's name, or `no-result` when recognition ended with no error
   *  and no text (the user said nothing), and `detail.message` is human-readable.
   *  Deliberate cancellation does not fire. */
  'kai-voice-error': { source: 'synthesis'; error: string; message: string };
}

/**
 * `<kai-voice-output>` — a speaker button that reads `text` aloud. Native by
 * default (`speechSynthesis`); set `el.synthesize` to route through your TTS
 * model instead. The output sibling of `<kai-voice-input>`. Emits
 * `kai-speaking-change`, `kai-voice-error` (a failed synthesis) and (model
 * path) `kai-synthesized`.
 */
defineWebComponent<Props, Events>('kai-voice-output', {
  text: '',
  autoplay: false,
  synthesize: undefined,
  disabled: false,
}, (props, { dispatch, flag, expose }) => {
  // Pattern C: the VoiceOutput component owns playback; it hands up a
  // speak/pause/resume/stop controller. The facade captures it and exposes
  // delegating methods (manual + programmatic run the same path, so both emit
  // the same kai-speaking-change / kai-synthesized events).
  let controller: VoiceOutputController | undefined;
  expose({
    /** Speak the current `text` (native, or via `synthesize` if set). */
    speak: () => controller?.speak(),
    /** Pause playback (resumable). */
    pause: () => controller?.pause(),
    /** Resume paused playback. */
    resume: () => controller?.resume(),
    /** Stop playback and reset. */
    stop: () => controller?.stop(),
  });

  return (
    <VoiceOutput
      text={(props.text as string | undefined) ?? ''}
      autoplay={flag('autoplay')}
      disabled={flag('disabled')}
      onSynthesize={props.synthesize ? (text) => props.synthesize!(text) : undefined}
      onSpeakingChange={(speaking) => dispatch('kai-speaking-change', { speaking })}
      onSynthesized={(blob) => dispatch('kai-synthesized', { blob })}
      onError={(detail) => dispatch('kai-voice-error', detail)}
      controllerRef={(c) => (controller = c)}
    />
  );
});
