import { Thread } from '@kitn.ai/ui/react';
import type { ChatMessage } from '@kitn.ai/ui/react';
import type { Theme } from '../App';

interface ThreadViewProps {
  theme: Theme;
  messages: ChatMessage[];
  loading: boolean;
}

/**
 * The message list. `<kai-thread>` renders reasoning, tool panels and cards off
 * each message, so nothing is needed here.
 *
 * There used to be a strip underneath showing a tool call's half-written
 * arguments, because `ToolPart.input` is a `Record<string, unknown>` and
 * `{"city":"Par` had nowhere to live. `ToolPart.rawInput` carries it now and
 * `<kai-tool>` renders it while the call is `input-streaming`, so the app
 * renders nothing itself.
 *
 * No `cardTypes` either: every card this spike emits is a BUILT-IN one, so the
 * thread is left on the kit's own registry rather than being handed an override
 * that would shadow it.
 */
export function ThreadView({ theme, messages, loading }: ThreadViewProps) {
  const withActions: ChatMessage[] = messages.map((m) =>
    m.role === 'assistant' ? { ...m, actions: ['copy'] } : m,
  );

  return (
    <div className="thread-wrap">
      <Thread
        className="thread"
        theme={theme}
        messages={withActions}
        loading={loading}
      />
    </div>
  );
}
