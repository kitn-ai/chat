import { Thread } from '@kitn.ai/ui/react';
import type { ChatMessage } from '@kitn.ai/ui/react';
import { partsToText } from '@kitn.ai/ui/state';
import type { Theme } from '../theme';

interface ThreadViewProps {
  theme: Theme;
  messages: ChatMessage[];
}

/**
 * The scrolling message list, and the piece that carries the server-rendering
 * proof.
 *
 * `<kai-thread>` (React `<Thread>`) owns the message rendering, the centered
 * fixed-width column and stick-to-bottom scroll. The server emits it as an EMPTY
 * tag — no `messages` attribute, no serialized thread — and the array only arrives
 * once the wrapper's layout effect assigns `el.messages` in the browser. Streaming
 * is that same channel repeated: a NEW array reference per chunk, which is why
 * mutating the existing array in place would render nothing.
 *
 * The full rule is BOTH halves, and streaming only satisfies them by accident:
 * the fresh array is what notifies, and a new object for the message that changed
 * is what makes the change visible (the row list is a reference-keyed `<For>`).
 * `createAssistantStream` rebuilds the streaming message as a new object every
 * delta, so streaming gets the second half for free — editing a message or a
 * conversation title by hand does not. See the framework guide.
 *
 * This component just bakes the per-message actions onto the assistant turns and
 * wires the custom `speak` action to the browser's speech synthesis. `copy` (and
 * the feedback votes) are handled inside the element.
 */
export function ThreadView({ theme, messages }: ThreadViewProps) {
  // <Thread> reads `actions` off each message; only assistant replies get them.
  const withActions: ChatMessage[] = messages.map((m) =>
    m.role === 'assistant'
      ? { ...m, actions: ['copy', { id: 'speak', label: 'Read aloud', icon: 'volume-2' }] }
      : m,
  );
  return (
    <Thread
      className="thread"
      theme={theme}
      messages={withActions}
      onMessageAction={(e) => {
        if (e.detail.action === 'speak') {
          const m = messages.find((x) => x.id === e.detail.messageId);
          if (!m) return;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(partsToText(m.parts)));
        }
      }}
    />
  );
}
