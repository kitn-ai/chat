import type { ChatMessage } from '@kitn.ai/ui';
import { appendMessage, createAssistantStream, onStreamSettled, type SetMessages } from '@kitn.ai/ui/state';
import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';

/**
 * One turn of the support conversation, start to finish.
 *
 * THE MOCK/REAL SEAM IS NOT IN THIS FILE. Both modes are the same `POST
 * /api/chat` and the same `readOpenAIStream`; whether the frames came from
 * `createMockResponder()` or from a model over OpenRouter is decided in
 * `server/chat-api.ts` by whether a key is present. That is the point of the
 * split — going live changes no client code, so the path under test here is the
 * path that ships.
 *
 * NO HISTORY. The thread lives in this closure and dies with the page. Rung 1 is
 * the smallest real surface: a widget you open, ask one thing and close.
 */

/** The `<kai-chat>` properties this app sets. Arrays and objects are PROPERTIES,
 *  never attributes — only the scalars in index.html ride as attributes. */
export type ChatElement = HTMLElement & {
  messages?: ChatMessage[];
  loading?: boolean;
  suggestions?: string[];
};

export interface SupportChat {
  /** Append the user's turn and stream the reply. Never rejects. */
  send(raw: string): Promise<void>;
}

const SUGGESTIONS = [
  "Where do I find last month's invoice?",
  'Can I change plan mid-cycle?',
  'How do I add a VAT number?',
];

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;
}

export function createSupportChat(chat: ChatElement): SupportChat {
  let messages: ChatMessage[] = [];

  // THE REACTIVITY CONTRACT, both halves.
  //
  // The array reference is what NOTIFIES: assigning the same array back is a
  // no-op even if an item inside it changed, so every write goes through a
  // helper that RETURNS a new array and the result is assigned here.
  //
  // The item's object identity is what makes an edit VISIBLE, because the
  // thread is a reference-keyed list. `createAssistantStream` replaces the
  // message object it is folding into on every delta (`{ ...prev[i], parts }`),
  // so the growing assistant turn re-renders rather than sitting stale — which
  // is exactly why this app folds through the kit's state core instead of
  // pushing into `parts`. Both halves apply to every update, not only to
  // streaming ones.
  const set: SetMessages = (updater) => {
    messages = updater(messages);
    chat.messages = messages;
  };

  // Stable reference, set once: re-setting a NEW array of the same strings on
  // every render would re-render the suggestions for no reason.
  chat.suggestions = SUGGESTIONS;
  chat.messages = messages;

  async function send(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text) return;

    set((prev) => appendMessage(prev, { id: newId(), role: 'user', parts: [{ type: 'text', text }] }));

    // Encode BEFORE the assistant placeholder exists. `createAssistantStream`
    // appends an empty assistant message immediately, and an empty turn is not
    // something to send to a provider.
    const wireMessages = toOpenAIMessages(messages);

    chat.loading = true;
    const stream = onStreamSettled(createAssistantStream(set), () => {
      chat.loading = false;
    });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: wireMessages }),
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 400);
        throw new Error(`/api/chat replied ${response.status}. ${detail}`.trim());
      }

      // The kit's reader, never a hand-rolled SSE loop. It parses the mock's
      // frames and a real provider's identically.
      await readOpenAIStream(response, stream);
      stream.done();
    } catch (error) {
      // DECIDE LOUDLY. A support widget that swallows a failed turn leaves the
      // user staring at a spinner that already stopped, so the failure goes into
      // the thread where they can see it.
      //
      // ONE CALL, not `appendText` + `done`. `abort(reason)` settles the turn
      // AND puts the reason in the thread when no part can carry it, which on a
      // text-only widget is always. The mechanism differs where it matters:
      // `appendText` MERGES into a trailing text part, so a turn that died
      // mid-sentence glued this apology onto the model's half-finished line and
      // it read as the model saying it. `abort` appends its reason as its OWN
      // part, which is the whole reason it does not reuse `appendText`.
      stream.abort(`**Sorry — that message did not go through.**\n\n${errorText(error)}`);
    }
  }

  return { send };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
