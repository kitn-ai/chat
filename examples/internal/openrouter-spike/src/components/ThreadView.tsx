import { Thread } from '@kitn.ai/ui/react';
import type { ChatMessage } from '@kitn.ai/ui/react';
import type { Theme } from '../App';

interface ThreadViewProps {
  theme: Theme;
  messages: ChatMessage[];
  loading: boolean;
  /** Consumer card types (envelope type → custom-element tag), merged over the
   *  built-ins. The spike adds `artifact`, which the kit does not ship. */
  cardTypes?: Record<string, string>;
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
 */
export function ThreadView({ theme, messages, loading, cardTypes }: ThreadViewProps) {
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
        cardTypes={cardTypes}
      />
    </div>
  );
}
