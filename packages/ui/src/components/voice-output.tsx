import { omit, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { deferApply } from '../utils/defer-apply'; // V2-PORT: on(...,{defer:true}) replacement
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';

/** Imperative handle exposed via `controllerRef` — surfaces the playback controls
 *  so the `<kai-voice-output>` facade can forward them as instance methods. Both
 *  the native (speechSynthesis) and model (synthesize → Audio) paths run through
 *  these, so manual clicks and programmatic calls behave identically. */
export interface VoiceOutputController {
  /** Speak the current `text` (native by default, model if `synthesize` is set). */
  speak(): void;
  /** Pause playback (resumable). */
  pause(): void;
  /** Resume paused playback. */
  resume(): void;
  /** Stop playback and reset. */
  stop(): void;
}

export interface VoiceOutputProps {
  /** The utterance to read aloud. */
  text: string;
  /** Speak automatically when `text` is set/changed. */
  autoplay?: boolean;
  /** TTS model seam: given text, return an audio Blob to play. When set, the
   *  native speechSynthesis path is bypassed. Mirrors VoiceInput's `onTranscribe`. */
  onSynthesize?: (text: string) => Promise<Blob>;
  /** Fires whenever playback starts or stops. `speaking: true` means audio has
   *  actually started (utterance.onstart on the native path; audio.play()
   *  resolving on the model path), not that speak() was called. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Synthesis failed: a native utterance error, a rejecting `onSynthesize`, or
   *  audio playback failing to start. `error` is the platform error code or the
   *  exception's name. Deliberate cancellation (stop(), a new speak()) is not a
   *  failure and does not fire. The facade maps this to kai-voice-error. */
  onError?: (detail: { source: 'synthesis'; error: string; message: string }) => void;
  /** Fires once the model path resolves audio (model path only). */
  onSynthesized?: (blob: Blob) => void;
  disabled?: boolean;
  class?: string;
  /** Receive the imperative controller once mounted. The `<kai-voice-output>`
   *  facade forwards these as element methods (speak/pause/resume/stop). */
  controllerRef?: (controller: VoiceOutputController) => void;
}

/** True when the browser exposes the Web Speech synthesis API. */
function hasSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function VoiceOutput(props: VoiceOutputProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;
  const [isSpeaking, setIsSpeaking] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);

  // The model path plays through one reused <Audio>; the native path drives
  // speechSynthesis. Only one is live at a time (branch on onSynthesize).
  let audio: HTMLAudioElement | undefined;
  let objectUrl: string | undefined;
  let utterance: SpeechSynthesisUtterance | undefined;

  // No way to speak at all → render disabled. A model seam OR native synthesis
  // is enough; absent both, the control is inert (see the facade/spec).
  const capable = () => !!props.onSynthesize || hasSpeechSynthesis();

  const label = () =>
    isLoading() ? 'Synthesizing...' : isSpeaking() ? 'Stop' : 'Read aloud';

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    }
  }

  // Native path: speechSynthesis.speak(new SpeechSynthesisUtterance(text)).
  // isSpeaking waits for utterance.onstart, so onSpeakingChange(true) means the
  // audio actually began. It used to flip optimistically before speak(), which
  // made "speaking" mean "speak() was called" and raced consumers watching for
  // playback to start (W4 symptom 3).
  function speakNative() {
    if (!hasSpeechSynthesis() || !local.text) return;
    window.speechSynthesis.cancel();
    utterance = new SpeechSynthesisUtterance(local.text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (event) => {
      setIsSpeaking(false);
      const code = event?.error ?? 'unknown';
      // `canceled`/`interrupted` are what the platform reports when the app
      // itself cancels (stop(), or a new speak() pre-empting): deliberate, not
      // a failure. Everything else surfaces (W4 traced a `not-allowed` here
      // that vanished without a word).
      if (code === 'canceled' || code === 'interrupted') return;
      props.onError?.({
        source: 'synthesis',
        error: code,
        message: `Speech synthesis error: ${code}`,
      });
    };
    window.speechSynthesis.speak(utterance);
  }

  // Model path: await onSynthesize(text) → play the Blob via an <Audio>.
  async function speakModel() {
    if (!props.onSynthesize || !local.text) return;
    setIsLoading(true);
    try {
      const blob = await props.onSynthesize(local.text);
      props.onSynthesized?.(blob);
      revokeUrl();
      objectUrl = URL.createObjectURL(blob);
      audio ??= new Audio();
      audio.src = objectUrl;
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => {
        setIsSpeaking(false);
        props.onError?.({
          source: 'synthesis',
          error: 'playback-failed',
          message: 'The synthesized audio failed to play',
        });
      };
      await audio.play();
      // play() resolving is this path's "audio actually started" (the model
      // path's counterpart of utterance.onstart), so isSpeaking flips only now.
      setIsSpeaking(true);
    } catch (err) {
      // onSynthesize rejected, or play() did (e.g. NotAllowedError under an
      // autoplay policy). Either way the reply is silent: say so.
      setIsSpeaking(false);
      props.onError?.({
        source: 'synthesis',
        error: err instanceof Error ? err.name : 'unknown',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }

  function speak() {
    if (props.onSynthesize) void speakModel();
    else speakNative();
  }

  function stop() {
    if (props.onSynthesize) {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    } else if (hasSpeechSynthesis()) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }

  function pause() {
    if (props.onSynthesize) audio?.pause();
    else if (hasSpeechSynthesis()) window.speechSynthesis.pause();
  }

  function resume() {
    if (props.onSynthesize) void audio?.play();
    else if (hasSpeechSynthesis()) window.speechSynthesis.resume();
  }

  function handleClick() {
    if (isSpeaking()) stop();
    else speak();
  }

  // Emit speaking transitions to the host. `defer: true` skips the spurious
  // initial `false` — only real start/stop transitions fire.
  createEffect(isSpeaking, deferApply((speaking) => {
    props.onSpeakingChange?.(speaking);
  }));

  // Autoplay: speak when text first arrives / changes (defer skips the mount
  // value so an empty seed doesn't speak).
  createEffect(() => local.text, deferApply((text) => {
    if (props.autoplay && text) speak();
  }));

  props.controllerRef?.({ speak, pause, resume, stop });

  onCleanup(() => {
    stop();
    revokeUrl();
  });

  // Speaker icon (idle)
  const SpeakerIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );

  // Square stop icon (speaking)
  const StopIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );

  // Spinner (model synthesis in flight)
  const Spinner = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );

  return (
    <div class={cn('relative inline-flex items-center justify-center', local.class)}>
      <Tooltip content={label()}>
        <Button
          part="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label()}
          aria-pressed={isSpeaking() ? 'true' : 'false'}
          onClick={handleClick}
          disabled={local.disabled || !capable() || isLoading()}
          class={cn('relative z-10 rounded-full transition-all duration-300')}
        >
          <Show when={isLoading()}>
            <Spinner />
          </Show>
          <Show when={!isLoading() && isSpeaking()}>
            <StopIcon />
          </Show>
          <Show when={!isLoading() && !isSpeaking()}>
            <SpeakerIcon />
          </Show>
        </Button>
      </Tooltip>
    </div>
  );
}
