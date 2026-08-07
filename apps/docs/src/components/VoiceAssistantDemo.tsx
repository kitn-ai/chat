/** Voice assistant demo — a hands-free chat app built on <kai-chat>.
 *
 *  kai-chat's built-in `voice` attribute renders a mic button in the input
 *  toolbar and fires `kai-voice` when clicked. Real mic capture can't run in a
 *  docs sandbox, so the mic click inserts a realistic canned transcript and
 *  drives the normal kai-submit streaming flow. The spoken-reply half is REAL:
 *  the finished reply is read aloud via the Web Speech API, feature-guarded
 *  so unsupported browsers degrade silently. A "Speak reply" control re-reads
 *  the latest answer on demand. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';
import IconMic from '~icons/lucide/mic';
import IconVolume from '~icons/lucide/volume-2';
import IconSquare from '~icons/lucide/square';

interface MessagePart {
  type: 'text';
  text: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  actions?: string[];
}

interface Props {
  chatTitle?: string;
  placeholder?: string;
  height?: string;
}

let uid = 0;
const nextId = () => `va${++uid}`;

/** Canned transcripts the simulated mic cycles through, standing in for real
 *  speech-to-text output. */
const TRANSCRIPTS = [
  "What's the weather in Tokyo this weekend?",
  'Remind me what I have scheduled for tomorrow morning.',
  'Add oat milk and espresso beans to my shopping list.',
];

/** Keyed scripted replies so the demo stays deterministic and realistic. */
const REPLIES: Record<string, string> = {
  "What's the weather in Tokyo this weekend?":
    'Tokyo looks mild and mostly clear this weekend. Saturday reaches 22°C with light cloud, and Sunday warms to 24°C with a 20% chance of afternoon showers. Pack a light jacket for the evenings, when temperatures dip to around 15°C.',
  'Remind me what I have scheduled for tomorrow morning.':
    "Tomorrow morning you have three things: a 9:00 design review with the product team, a 10:30 one-on-one with Priya, and a 11:15 dentist appointment on Oak Street. Your first open block is at 12:00.",
  'Add oat milk and espresso beans to my shopping list.':
    "Added oat milk and espresso beans to your shopping list. That list now has five items — milk, beans, sourdough, eggs, and spinach. Want me to read the whole list back?",
};

const FALLBACK_REPLY =
  "I heard you. In a real app this is where your assistant's streamed answer would appear, spoken aloud as it finishes.";

export default function VoiceAssistantDemo(props: Props) {
  let host:
    | (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown })
    | undefined;
  const [ready, setReady] = createSignal(false);
  const [speaking, setSpeaking] = createSignal(false);
  const [lastReply, setLastReply] = createSignal('');
  let timer: number | undefined;
  let transcriptIndex = 0;

  const theme = () => document.documentElement.dataset.theme || 'light';
  const ttsSupported = () =>
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  /** Read text aloud via the Web Speech API. Guarded so unsupported browsers
   *  do nothing rather than throw. */
  const speak = (text: string) => {
    if (!ttsSupported() || !text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.onend = () => setSpeaking(false);
    utter.oncancel = () => setSpeaking(false);
    window.speechSynthesis.cancel(); // stop any previous utterance
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  const stopSpeaking = () => {
    if (!ttsSupported()) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const runTurn = (text: string) => {
    if (!text || !host) return;
    stopSpeaking();

    const aId = nextId();
    host.messages = [
      ...(host.messages ?? []),
      { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    (host as any).loading = true;

    const full = REPLIES[text] ?? FALLBACK_REPLY;
    const words = full.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);

    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      host!.messages = (host!.messages ?? []).map((m) =>
        m.id === aId
          ? {
              ...m,
              parts: [{ type: 'text', text: partial }],
              ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}),
            }
          : m,
      );
      if (!done) {
        timer = window.setTimeout(tick, 36);
      } else {
        (host as any).loading = false;
        setLastReply(full);
        speak(full); // speak the completed reply aloud
      }
    };
    timer = window.setTimeout(tick, 220);
  };

  // Mic button (kai-voice) → simulate speech-to-text with a canned transcript.
  const onVoice = () => {
    const text = TRANSCRIPTS[transcriptIndex % TRANSCRIPTS.length];
    transcriptIndex += 1;
    runTurn(text);
  };

  // Typed submit follows the same streaming + spoken-reply flow.
  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (text) runTurn(text);
  };

  onMount(async () => {
    await loadKit();
    if (!host) return;

    customElements.upgrade(host);
    (host as any).voice = true; // render the mic button in the toolbar
    host.messages = [];
    if (props.chatTitle) (host as any).chatTitle = props.chatTitle;
    if (props.placeholder) (host as any).placeholder = props.placeholder;
    host.setAttribute('theme', theme());

    host.addEventListener('kai-voice', onVoice);
    host.addEventListener('kai-submit', onSubmit);

    setReady(true);

    const obs = new MutationObserver(() => host?.setAttribute('theme', theme()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    onCleanup(() => {
      clearTimeout(timer);
      stopSpeaking();
      host?.removeEventListener('kai-voice', onVoice);
      host?.removeEventListener('kai-submit', onSubmit);
      obs.disconnect();
    });
  });

  return (
    <div
      class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface"
      style={{ height: props.height ?? '600px', display: 'flex', 'flex-direction': 'column' }}
    >
      {/* @ts-expect-error custom element */}
      <kai-chat
        ref={(el: HTMLElement) => (host = el as any)}
        style={{ display: 'block', flex: '1', 'min-height': '0' }}
      />
      <div
        style={{
          'border-top': '1px solid var(--color-line, #e5e7eb)',
          padding: '10px 16px',
          background: 'var(--color-surface, #fff)',
          display: 'flex',
          'align-items': 'center',
          gap: '12px',
          'flex-wrap': 'wrap',
        }}
      >
        <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', 'font-size': '13px', color: 'var(--color-ink, #1f2937)', opacity: '0.75' }}>
          <IconMic style={{ width: '15px', height: '15px' }} />
          Tap the mic in the toolbar to speak (demo inserts a transcript)
        </span>
        {speaking() ? (
          <button
            type="button"
            onClick={stopSpeaking}
            style={{
              display: 'inline-flex', 'align-items': 'center', gap: '6px',
              'margin-left': 'auto', padding: '6px 12px', 'font-size': '13px',
              'border-radius': '8px', border: '1px solid var(--color-line, #e5e7eb)',
              background: 'transparent', color: 'var(--color-ink, #1f2937)', cursor: 'pointer',
            }}
          >
            <IconSquare style={{ width: '14px', height: '14px' }} />
            Stop
          </button>
        ) : (
          <button
            type="button"
            disabled={!ready() || !lastReply()}
            onClick={() => speak(lastReply())}
            style={{
              display: 'inline-flex', 'align-items': 'center', gap: '6px',
              'margin-left': 'auto', padding: '6px 12px', 'font-size': '13px',
              'border-radius': '8px', border: '1px solid var(--color-line, #e5e7eb)',
              background: 'transparent',
              color: 'var(--color-ink, #1f2937)',
              cursor: lastReply() ? 'pointer' : 'not-allowed',
              opacity: lastReply() ? '1' : '0.5',
            }}
          >
            <IconVolume style={{ width: '14px', height: '14px' }} />
            Speak reply
          </button>
        )}
      </div>
    </div>
  );
}
