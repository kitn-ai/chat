/**
 * Hands-free voice assistant.
 *
 *   speak -> <kai-voice-input> (native SpeechRecognition, on device)
 *         -> transcript text into <kai-thread>
 *         -> POST /api/chat, read with readOpenAIStream from @kitn.ai/ui/wire
 *         -> reply streams into the same thread, token by token
 *         -> <kai-voice-output> (native speechSynthesis) reads it back
 *
 * No audio ever leaves the browser: recognition and synthesis are both the
 * platform's own, and the only thing on the wire is text.
 *
 * There is no store. Data flows in via properties and out via events, and this
 * module is the host that wires one element to the next.
 */
import '@kitn.ai/ui/elements'; // registers every <kai-*> — must come first
import '@kitn.ai/ui/theme.tokens.css';
import './styles.css';

import type {
  KaiAudioVisualizerElement,
  KaiNoticeElement,
  KaiStatusElement,
  KaiThreadElement,
  KaiVoiceInputElement,
  KaiVoiceOutputElement,
} from '@kitn.ai/ui/elements';
import {
  appendMessage,
  createAssistantStream,
  textMessage,
  type ChatMessage,
} from '@kitn.ai/ui/state';
import { readOpenAIStream, toOpenAIMessages, WireError } from '@kitn.ai/ui/wire';

import { CHAT_ROUTE } from './routes';
import { detectVoiceSupport, microphoneErrorMessage, supportMessage } from './voice-support';

/* ------------------------------------------------------------------ phases */

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'blocked';

interface PhaseLook {
  /** <kai-audio-visualizer state>. `disconnected` is the kit's dead, flat look. */
  visualizer: string;
  /** <kai-status status>, the coloured presence dot. */
  dot: 'new' | 'online' | 'busy' | 'away' | 'offline';
  pulse: boolean;
  label: string;
}

const PHASE_LOOK: Record<Phase, PhaseLook> = {
  idle: { visualizer: 'idle', dot: 'offline', pulse: false, label: 'Idle' },
  listening: { visualizer: 'listening', dot: 'online', pulse: true, label: 'Listening' },
  thinking: { visualizer: 'thinking', dot: 'busy', pulse: true, label: 'Thinking' },
  speaking: { visualizer: 'speaking', dot: 'new', pulse: true, label: 'Speaking' },
  blocked: { visualizer: 'disconnected', dot: 'away', pulse: false, label: 'Unavailable' },
};

/* ------------------------------------------------------------------- utils */

/** Typed listener on the element ITSELF: kai-* events do not bubble. */
function on<T>(target: EventTarget, type: string, handler: (detail: T) => void): void {
  target.addEventListener(type, (event) => handler((event as CustomEvent<T>).detail));
}

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el as T;
}

/* ------------------------------------------------------------------ wiring */

async function init(): Promise<void> {
  const shell = need('shell');
  const thread = need<KaiThreadElement>('transcript');
  const voiceIn = need<KaiVoiceInputElement>('mic');
  const voiceOut = need<KaiVoiceOutputElement>('speaker');
  const visualizer = need<KaiAudioVisualizerElement>('viz');
  const phaseDot = need<KaiStatusElement>('phase-dot');
  const phaseLabel = need('phase-label');
  const caption = need('caption');
  const pushToTalk = need<HTMLButtonElement>('ptt');
  const supportNotice = need<KaiNoticeElement>('support-notice');
  const supportNoticeText = need('support-notice-text');
  const errorNotice = need<KaiNoticeElement>('error-notice');
  const errorNoticeText = need('error-notice-text');

  // kai-* elements register through an async dynamic import (SSR-safety), so a
  // property set before the upgrade is dropped. Wait for the upgrade first.
  await Promise.all(
    [
      'kai-thread',
      'kai-voice-input',
      'kai-voice-output',
      'kai-audio-visualizer',
      'kai-status',
      'kai-notice',
    ].map((tag) => customElements.whenDefined(tag)),
  );

  // Booleans as properties, not attributes: `code-highlight="false"` would be
  // the string "false", which is truthy.
  thread.codeHighlight = false;
  thread.scrollButton = true;
  voiceIn.interim = true;

  // Declared before the closures below, which read it.
  const support = detectVoiceSupport();

  /* ---------------------------------------------------------------- state */

  let messages: ChatMessage[] = [];
  let phase: Phase = 'idle';
  let micStream: MediaStream | null = null;
  let inFlight: AbortController | null = null;
  let bandsTimer = 0;
  let speakWatchdog = 0;
  let lastQuestion = { text: '', at: 0 };

  const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]): void => {
    messages = updater(messages);
    // A NEW array reference is what re-renders; mutating in place does not.
    thread.messages = messages;
  };

  const showCaption = (text: string, kind: 'idle' | 'interim' | 'final' | 'note'): void => {
    caption.textContent = text;
    caption.dataset.kind = text ? kind : 'idle';
  };

  const showError = (message: string): void => {
    errorNoticeText.textContent = message;
    errorNotice.hidden = false;
    console.error('[voice-assistant]', message);
  };

  const clearError = (): void => {
    errorNotice.hidden = true;
  };

  /* --------------------------------------------------- visualizer plumbing */

  /**
   * Synthetic levels for the speaking phase. `speechSynthesis` exposes no audio
   * node to tap, so the kit's `bands` prop is the documented path — and setting
   * it means no AudioContext is built at all. A NEW array per frame is required.
   */
  const startSyntheticBands = (): void => {
    stopSyntheticBands();
    const count = 28;
    bandsTimer = window.setInterval(() => {
      const t = performance.now() / 1000;
      visualizer.bands = Array.from({ length: count }, (_, i) => {
        const carrier = Math.sin(t * 6.2 + i * 0.45) * 0.5 + 0.5;
        const flutter = Math.sin(t * 17 + i * 1.9) * 0.5 + 0.5;
        return Math.min(1, Math.max(0.06, carrier * 0.65 + flutter * 0.35 * carrier));
      });
    }, 55);
  };

  const stopSyntheticBands = (): void => {
    if (bandsTimer) window.clearInterval(bandsTimer);
    bandsTimer = 0;
    visualizer.bands = undefined;
  };

  /**
   * Our own microphone tap, purely so the visualisation is driven by REAL
   * amplitude. <kai-voice-input> opens its own stream for recognition and does
   * not hand it out; opening a second one is cheap and lets us close it the
   * moment listening ends, so the browser's recording indicator goes out
   * between turns instead of staying lit.
   */
  const openMic = async (): Promise<void> => {
    if (!support.microphone) return;
    if (!micStream) {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    // Only attach if we are still listening — the user may have let go already.
    if (phase === 'listening') visualizer.stream = micStream;
    else closeMic();
  };

  const closeMic = (): void => {
    visualizer.stream = undefined;
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
  };

  /* -------------------------------------------------------- phase switching */

  const setPhase = (next: Phase): void => {
    if (phase === next) return;
    phase = next;

    const look = PHASE_LOOK[next];
    shell.dataset.phase = next;
    visualizer.state = look.visualizer;
    phaseDot.status = look.dot;
    phaseDot.pulse = look.pulse;
    phaseDot.label = look.label;
    phaseLabel.textContent = look.label;
    thread.loading = next === 'thinking';

    if (next !== 'speaking') stopSyntheticBands();
    else startSyntheticBands();

    if (next !== 'listening') closeMic();
  };

  /* ------------------------------------------------------- capability gate */

  const problem = supportMessage(support);
  if (problem) {
    supportNoticeText.textContent = problem;
    supportNotice.severity = support.usable ? 'warning' : 'error';
    supportNotice.hidden = false;
    console.warn('[voice-assistant]', problem);
  }

  if (!support.recognition || !support.microphone) {
    // Nothing can be asked at all: say so, and make the controls inert rather
    // than leaving a mic button that looks fine and does nothing.
    setPhase('blocked');
    pushToTalk.disabled = true;
    voiceIn.disabled = true;
    showCaption('Voice input is unavailable in this browser.', 'note');
    return;
  }

  setPhase('idle');

  /* ------------------------------------------------------------- the turn */

  const speakReply = (text: string): void => {
    const utterance = text.trim();
    if (!utterance) {
      showCaption('The reply was empty — nothing to read aloud.', 'note');
      setPhase('idle');
      return;
    }
    if (!support.synthesis) {
      showCaption('Reply is text-only: this browser has no speech synthesis.', 'note');
      setPhase('idle');
      return;
    }

    voiceOut.text = utterance;
    setPhase('speaking');
    voiceOut.speak();

    // If `kai-speaking-change` never confirms, we would sit in "Speaking"
    // forever with silence. Say so instead of pretending.
    window.clearTimeout(speakWatchdog);
    speakWatchdog = window.setTimeout(() => {
      if (phase !== 'speaking') return;
      setPhase('idle');
      showError(
        'The browser accepted the reply but never started speaking. The text is in the transcript; use "Replay answer" to try again.',
      );
    }, 2500);
  };

  const ask = async (question: string): Promise<void> => {
    clearError();
    inFlight?.abort();
    voiceOut.stop();

    // Earlier turns stay exactly as they are; this appends to them.
    const history = appendMessage(messages, textMessage('user', question));
    setMessages(() => history);
    setPhase('thinking');

    const controller = new AbortController();
    inFlight = controller;

    // createAssistantStream appends the in-flight assistant message and folds
    // every delta onto its parts, producing new refs so <kai-thread> re-renders.
    const stream = createAssistantStream(setMessages);
    let reply = '';

    try {
      const response = await fetch(CHAT_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The server owns `model` and `stream` — it may be the mock or a real
        // provider behind the same route. The body is just the encoded thread.
        body: JSON.stringify({ messages: toOpenAIMessages(history) }),
        signal: controller.signal,
      });
      // The kit parses, the consumer fetches: never hand-roll an SSE reader.
      const turn = await readOpenAIStream(response, stream);
      if (turn.error) {
        stream.abort(turn.error.message);
        showError(`The reply stream carried an error: ${turn.error.message}`);
      } else {
        reply = turn.text;
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // Superseded by a newer question. Settle the message quietly.
        stream.abort('Interrupted by a new question.');
        return;
      }
      const message =
        err instanceof WireError
          ? `The chat endpoint answered ${err.status} ${err.statusText}.`
          : err instanceof Error && err.message
            ? err.message
            : 'The request to /api/chat failed.';
      stream.abort(message);
      showError(message);
    } finally {
      // done() SETTLES the message: every sink call after it is dropped, which
      // is why everything above runs before it.
      stream.done();
      if (inFlight === controller) inFlight = null;
    }

    if (controller.signal.aborted) return;
    if (!reply) {
      setPhase('idle');
      return;
    }
    speakReply(reply);
  };

  /* ------------------------------------------------------ element -> host */

  on<{ recording: boolean }>(voiceIn, 'kai-recording-change', ({ recording }) => {
    if (recording) {
      clearError();
      showCaption('', 'idle');
      setPhase('listening');
      void openMic().catch((err) => {
        showError(microphoneErrorMessage(err));
        if (phase === 'listening') setPhase('idle');
      });
      return;
    }
    closeMic();
    // Only fall back to idle if nothing else has taken over — the final
    // transcript may already have moved us to "thinking".
    if (phase === 'listening') setPhase('idle');
  });

  on<{ text: string }>(voiceIn, 'kai-transcript-interim', ({ text }) => {
    if (phase === 'listening') showCaption(text, 'interim');
  });

  on<{ text: string }>(voiceIn, 'kai-transcription', ({ text }) => {
    const question = text.trim();
    if (!question) {
      showCaption('Nothing was recognised — try again, a little closer to the mic.', 'note');
      if (phase === 'listening') setPhase('idle');
      return;
    }
    // A recogniser that emits two final results for one utterance would
    // otherwise post the same question twice.
    const now = performance.now();
    if (question === lastQuestion.text && now - lastQuestion.at < 1500) return;
    lastQuestion = { text: question, at: now };

    showCaption(question, 'final');
    void ask(question);
  });

  // The unsupported-fallback signal: audio was captured but no text came back,
  // which means SpeechRecognition is not there after all. Never fail silently.
  on<{ blob: Blob }>(voiceIn, 'kai-audio-captured', () => {
    if (support.recognition) return;
    setPhase('blocked');
    showError(
      'Audio was captured but this browser produced no transcript: native speech recognition is unavailable.',
    );
  });

  on<{ speaking: boolean }>(voiceOut, 'kai-speaking-change', ({ speaking }) => {
    window.clearTimeout(speakWatchdog);
    if (speaking) setPhase('speaking');
    else if (phase === 'speaking') setPhase('idle');
  });

  /* -------------------------------------------------------- host -> element */

  // Push-to-talk. <kai-voice-input>'s own button is a tap-to-toggle; these drive
  // the same element imperatively so both routes report through the same events.
  const holdStart = (): void => {
    if (phase === 'listening' || phase === 'blocked') return;
    voiceOut.stop();
    pushToTalk.dataset.held = 'true';
    voiceIn.start();
  };

  const holdEnd = (): void => {
    if (pushToTalk.dataset.held !== 'true') return;
    delete pushToTalk.dataset.held;
    voiceIn.stop();
  };

  pushToTalk.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    pushToTalk.setPointerCapture(event.pointerId);
    holdStart();
  });
  pushToTalk.addEventListener('pointerup', holdEnd);
  pushToTalk.addEventListener('pointercancel', holdEnd);
  pushToTalk.addEventListener('lostpointercapture', holdEnd);

  /**
   * Space is push-to-talk only while nothing else has focus. A focused control
   * keeps its native Space activation — otherwise tabbing to the mic or the
   * replay button and pressing Space would be swallowed here.
   */
  const spaceIsGlobal = (event: KeyboardEvent): boolean => {
    const target = event.target as Node | null;
    return !target || target === document.body || target === document.documentElement;
  };

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey) return;
    if (!spaceIsGlobal(event)) return;
    event.preventDefault(); // stop the page from scrolling
    holdStart();
  });

  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' || !spaceIsGlobal(event)) return;
    event.preventDefault();
    holdEnd();
  });

  // Let go of the mic if the tab is hidden mid-hold.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) holdEnd();
  });

  window.addEventListener('beforeunload', () => {
    inFlight?.abort();
    closeMic();
  });
}

// <script type="module"> is deferred, so the DOM is already parsed here.
void init().catch((err) => {
  // Even the bootstrap failing has to be visible on the page.
  console.error('[voice-assistant] failed to start', err);
  const notice = document.getElementById('error-notice');
  const text = document.getElementById('error-notice-text');
  if (notice && text) {
    text.textContent = `The app failed to start: ${err instanceof Error ? err.message : String(err)}`;
    notice.removeAttribute('hidden');
  }
});
