/**
 * Aurora support widget — host code for the docked <kai-chat>.
 *
 * Shape of this file follows the `support-widget-script-tag` recipe from the kai
 * MCP: one <kai-chat>, the host owns `messages`, `kai-submit` goes out and a new
 * `messages` array comes back in. The only deviation the brief asks for is where
 * the reply comes from — a local dev endpoint (`/api/chat`, see server/) rather
 * than createMockResponder() called in the browser, so the fetch below is the
 * real one and the mock lives entirely server-side.
 */
import '@kitn.ai/ui/elements'; // registers <kai-*> — required, must come first
import type { KaiChatElement } from '@kitn.ai/ui/elements';
import { createAssistantStream, type ChatMessage } from '@kitn.ai/ui/state';
import { readOpenAIStream, toOpenAIMessages, WireError } from '@kitn.ai/ui/wire';
import '@kitn.ai/ui/theme.tokens.css'; // compiled token defaults

const SUGGESTIONS = [
  'Where is my order?',
  'How do I set up the calendar sync?',
  'The lamp flickers at low brightness',
];

/**
 * The thread. The host owns it, not the element — `kai-chat.messages` is a
 * property we push into. Keeping it here (rather than reading it back off the
 * element) is what makes earlier turns survive: the panel is only hidden when
 * closed, and even a re-render would be fed from this array.
 *
 * reactivity-two-halves: every write must be a NEW array reference, and an
 * EDITED item must also be a new object. Nothing enforces that — it is a rule we
 * apply. `createAssistantStream` below already honours it for the streaming
 * message; the one hand-rolled write is the user turn, and it spreads.
 */
let messages: ChatMessage[] = [];

/** The `SetMessages` contract the state helpers expect: (prev) => next. */
function setMessages(update: (prev: ChatMessage[]) => ChatMessage[]): void {
  messages = update(messages);
  chat.messages = messages;
}

let chat: KaiChatElement;
let panel: HTMLElement;
let launcher: HTMLButtonElement;
let isOpen = false;

/** `moveFocus` is false for the initial closed state, so the widget does not
 *  steal focus from the page on load. */
function setOpen(open: boolean, moveFocus = true): void {
  isOpen = open;
  panel.classList.toggle('is-open', open);
  // `inert` keeps the closed panel out of the tab order and off the a11y tree.
  // A visibility:hidden panel is already skipped by most AT, but the composer is
  // focusable and inert is the part that actually stops it.
  panel.toggleAttribute('inert', !open);
  launcher.setAttribute('aria-expanded', String(open));
  launcher.querySelector('.sr-only')!.textContent = open
    ? 'Close support chat'
    : 'Open support chat';

  if (open) {
    launcher.removeAttribute('data-unread');
    if (moveFocus) {
      // focus() on the host lands on the host; kai-chat exposes its own focus()
      // that reaches the composer inside the shadow root. It is the only way in.
      chat.focus();
    }
    chat.scrollToBottom('instant');
  } else if (moveFocus) {
    launcher.focus();
  }
}

async function handleSubmit(event: Event): Promise<void> {
  const value = (event as CustomEvent<{ value: string }>).detail.value.trim();
  if (!value) return;

  setMessages((prev) => [
    ...prev,
    { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: value }] },
  ]);

  // `loading` shows the streaming state and disables submit. Note it is
  // effectively WRITE-ONLY: setting `true` reflects the attribute and the
  // element reacts, but reading the property back yields `undefined`. Track your
  // own flag if you need the state; never branch on `chat.loading`.
  chat.loading = true;

  // createAssistantStream appends the in-flight assistant message and folds every
  // delta onto its parts, handing setMessages a fresh array per chunk — which is
  // what makes the reply appear incrementally rather than in one lump.
  const stream = createAssistantStream(setMessages);

  try {
    // kit-parses-consumer-fetches: the consumer fetches, the kit parses. Never
    // hand-roll an SSE reader — readOpenAIStream handles keep-alive comments,
    // multi-line frames, codepoints split across chunks and the [DONE] sentinel.
    // toOpenAIMessages encodes the WHOLE thread, so the endpoint sees the full
    // multi-turn history and not just the newest line.
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: toOpenAIMessages(messages) }),
    });

    const turn = await readOpenAIStream(res, stream);
    if (turn.error) {
      // An error carried INSIDE a 200 stream, as opposed to a failed request.
      stream.abort(turn.error.message);
      console.error('[aurora] model error:', turn.error.message);
    }
  } catch (err) {
    // Without this, a dead endpoint is a permanently blank assistant bubble plus
    // an unhandled rejection. abort() settles the message; text that already
    // streamed stays put.
    const detail =
      err instanceof WireError
        ? `Support is unavailable (HTTP ${err.status}).`
        : 'Support is unavailable right now. Please try again.';
    stream.abort(detail);
    console.error('[aurora] chat request failed:', err);
  } finally {
    // done() SETTLES the message: sink calls after it are dropped, which is why
    // the whole read happens above it.
    stream.done();
    chat.loading = false;
    if (!isOpen) launcher.setAttribute('data-unread', 'true');
  }
}

async function init(): Promise<void> {
  panel = document.getElementById('support-panel') as HTMLElement;
  launcher = document.getElementById('support-launcher') as HTMLButtonElement;

  // upgrade-race: kai-* elements register through an async dynamic import, so a
  // property set before the upgrade is dropped without any warning. whenDefined
  // is the guarantee; DOMContentLoaded or a timer is a guess.
  await customElements.whenDefined('kai-chat');
  chat = document.getElementById('support-chat') as KaiChatElement;

  // props-not-attributes: arrays and objects are JS properties. An array set as
  // an attribute stringifies to '[object Object]' and silently renders nothing.
  chat.suggestions = SUGGESTIONS;
  chat.messages = messages;
  // No code blocks in support answers, so render plain <pre> and never invoke the
  // highlighter. This is a RUNTIME saving only — register-all still bundles Shiki
  // (see NOTES.md gap 11 for the per-element import that would drop it).
  chat.codeHighlight = false;
  chat.actionsReveal = 'hover';

  // events-non-bubbling: kai-* events are dispatched with bubbles:false, so this
  // listener has to sit on the element itself — document would never see it.
  chat.addEventListener('kai-submit', (event) => void handleSubmit(event));

  launcher.addEventListener('click', () => setOpen(!isOpen));

  // Escape closes even mid-stream: the request is not cancelled, the reply keeps
  // folding into `messages`, and the unread dot on the launcher says so.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) setOpen(false);
  });

  setOpen(false, false);
}

// A <script type="module"> is deferred, so the DOM is already parsed here.
void init();
