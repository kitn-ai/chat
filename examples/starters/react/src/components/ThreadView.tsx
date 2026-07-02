import { Thread } from '@kitn.ai/ui/react';
import type { ChatMessage } from '@kitn.ai/ui/react';
import type { Theme } from '../App';

interface ThreadViewProps {
  theme: Theme;
  messages: ChatMessage[];
}

/**
 * The scrolling message list. `<kai-thread>` (React `<Thread>`) owns the message
 * rendering, the centered fixed-width column, and stick-to-bottom scroll, so this
 * component just bakes the per-message actions onto the assistant turns and wires
 * the custom `speak` action to the browser's speech synthesis. `copy` (and the
 * feedback votes) are handled inside the element.
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
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(m.content));
        }
      }}
    />
  );
}
