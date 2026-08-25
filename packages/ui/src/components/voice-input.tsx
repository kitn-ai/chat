import { omit, Show, For, createSignal, createEffect } from 'solid-js';
import { deferApply } from '../utils/defer-apply'; // V2-PORT: on(...,{defer:true}) replacement
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { useVoiceRecorder } from '../primitives/use-voice-recorder';
import { useSpeechRecognition } from '../primitives/use-speech-recognition';

/** Imperative handle exposed via `controllerRef` — surfaces the recorder's latent
 *  start/stop so the `<kai-voice-input>` facade can forward them as instance
 *  methods (push-to-talk). Both run the SAME getUserMedia → blob → transcription
 *  path as clicking the mic, so manual + programmatic emit identically. */
export interface VoiceInputController {
  /** Begin recording programmatically (same path as clicking the mic). */
  start(): void;
  /** Stop the in-progress recording (produces the blob → onTranscribe). */
  stop(): void;
}

export interface VoiceInputProps {
  onTranscribe: (audio: Blob) => Promise<string>;
  onTranscription: (text: string) => void;
  disabled?: boolean;
  class?: string;
  /** Host supplied a `transcribe` callback. When true the MediaRecorder →
   *  onTranscribe path runs. When false the component prefers native
   *  SpeechRecognition (capable browsers), falling back to record-only. */
  hasTranscribe?: boolean;
  /** BCP-47 language tag for native recognition (e.g. `en-US`). */
  lang?: string;
  /** Emit live partial transcripts via `onInterim` (native path only). */
  interim?: boolean;
  /** Live partial transcript from native recognition (when `interim`). */
  onInterim?: (text: string) => void;
  /** Fires whenever recording starts or stops. Guarded against the spurious
   *  initial `false` — only true transitions emit (the facade maps this to
   *  kai-recording-change). */
  onRecordingChange?: (recording: boolean) => void;
  /** Receive the imperative controller once mounted. The `<kai-voice-input>`
   *  facade forwards these as element methods (start/stop). */
  controllerRef?: (controller: VoiceInputController) => void;
  /** A recognition session failed or produced nothing. `error` is the platform
   *  error code, the thrown exception's name, or `no-result` when the session
   *  ended with no error and no text. The facade maps this to kai-voice-error. */
  onError?: (detail: { source: 'recognition'; error: string; message: string }) => void;
}

export function VoiceInput(props: VoiceInputProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;
  const { isRecording, start, stop } = useVoiceRecorder();
  const speech = useSpeechRecognition({ interim: props.interim });
  const [isProcessing, setIsProcessing] = createSignal(false);

  // Path selection (§6): a `transcribe` callback always wins (MediaRecorder →
  // host transcriber). Otherwise prefer native SpeechRecognition when the browser
  // supports it. The unsupported-no-callback case falls through to recording the
  // blob (→ onTranscribe → kai-audio-captured) with no text.
  const useNative = () => !props.hasTranscribe && speech.isSupported;

  const label = () =>
    isProcessing() ? 'Transcribing...' : isActive() ? 'Stop recording' : 'Voice input';

  const isActive = () => (useNative() ? speech.isListening() : isRecording());

  // Native path: SpeechRecognition resolves with the final transcript when it
  // ends (click again or controller.stop()). Final text → onTranscription.
  // Every other outcome reaches onError, so a session can never end in silence
  // (W4 symptom 1: runtime errors set a signal nothing read, and an empty
  // result fired no event at all).
  async function beginRecognition() {
    let errored = false;
    try {
      const text = await speech.start({
        lang: props.lang,
        onInterim: props.interim ? (t) => props.onInterim?.(t) : undefined,
        onError: (error, message) => {
          errored = true;
          props.onError?.({ source: 'recognition', error, message });
        },
      });
      if (text.trim()) {
        local.onTranscription(text.trim());
      } else if (!errored) {
        // No error, no text: the session ended cleanly having heard nothing.
        // Reported through the SAME error event (as `no-result`) rather than an
        // empty kai-transcription, so kai-transcription keeps its contract
        // (final text exists) and one listener covers every failed session; the
        // code distinguishes "user said nothing" from "recognition broke".
        props.onError?.({
          source: 'recognition',
          error: 'no-result',
          message: 'Speech recognition ended without capturing any text',
        });
      }
    } catch (err) {
      // start() itself threw (unsupported, or the platform refused to start).
      if (!errored) {
        props.onError?.({
          source: 'recognition',
          error: err instanceof Error ? err.name : 'unknown',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Begin recording, then run transcription once the blob resolves. Shared by the
  // mic click and the imperative start() so both flows emit identically. start()
  // resolves its Blob when the recorder stops (click again or controller.stop()).
  async function beginRecording() {
    try {
      const blob = await start();
      setIsProcessing(true);
      try {
        const text = await local.onTranscribe(blob);
        if (text.trim()) local.onTranscription(text.trim());
      } finally {
        setIsProcessing(false);
      }
    } catch {
      setIsProcessing(false);
    }
  }

  // Drive whichever path is active (§6: start/stop must follow the live path).
  function begin() {
    if (useNative()) void beginRecognition();
    else void beginRecording();
  }
  function end() {
    if (useNative()) speech.stop();
    else stop();
  }

  async function handleClick() {
    if (isActive()) end();
    else begin();
  }

  // Emit recording transitions to the host. `on(..., { defer: true })` skips the
  // initial mount value (a spurious {recording:false}) — only real start/stop
  // transitions fire. Drives BOTH manual (click) and programmatic (start/stop)
  // since they all flip the active path's signal (MediaRecorder or recognition).
  createEffect(isActive, deferApply((recording) => {
    props.onRecordingChange?.(recording);
  }));

  // Imperative controller (Pattern C): hand the facade a start/stop handle.
  // start() runs the active path; stop() ends the in-progress session (resolving
  // the active path's promise). Guard start() so a double-start while already
  // active is a no-op (matches the click toggle).
  props.controllerRef?.({
    start: () => { if (!isActive()) begin(); },
    stop: () => end(),
  });

  // Mic icon (not recording)
  const MicIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );

  // Square stop icon (recording)
  const StopIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );

  // Spinner (processing transcription)
  const Spinner = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );

  return (
    <div class={cn('relative inline-flex items-center justify-center', local.class)}>
      {/* Animated pulse rings when recording */}
      <Show when={isActive()}>
        <For each={[0, 1, 2]}>
          {(index) => (
            <div
              class="absolute inset-0 animate-ping rounded-full border-2 border-red-400/30"
              style={{
                "animation-delay": `${index * 0.3}s`,
                "animation-duration": "2s",
              }}
            />
          )}
        </For>
      </Show>

      <Tooltip content={label()}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label()}
          onClick={handleClick}
          disabled={local.disabled || isProcessing()}
          class={cn(
            'relative z-10 rounded-full transition-all duration-300',
            isActive() && 'bg-destructive text-white hover:bg-destructive/80',
          )}
        >
          <Show when={isProcessing()}>
            <Spinner />
          </Show>
          <Show when={!isProcessing() && isActive()}>
            <StopIcon />
          </Show>
          <Show when={!isProcessing() && !isActive()}>
            <MicIcon />
          </Show>
        </Button>
      </Tooltip>
    </div>
  );
}
