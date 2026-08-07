import { Thread } from '@kitn.ai/ui/react';
import type { ChatMessage } from '@kitn.ai/ui/react';
import type { Theme } from '../App';

interface ThreadViewProps {
  theme: Theme;
  messages: ChatMessage[];
  loading: boolean;
  /** Live partial tool-call arguments, keyed by toolCallId. */
  partialArgs: Record<string, string>;
}

/**
 * The message list. `<kai-thread>` renders reasoning + tool panels off each
 * message, so almost nothing is needed here.
 *
 * The `partialArgs` strip underneath is NOT something the kit can do: while a
 * tool call's arguments are still streaming, `ToolPart.input` is a
 * `Record<string, unknown>` and a half-written `{"city":"Par` has nowhere to
 * live. So the app renders the raw fragments itself. See ../../FINDINGS.md,
 * section "ToolPart cannot hold partial arguments".
 */
export function ThreadView({ theme, messages, loading, partialArgs }: ThreadViewProps) {
  const withActions: ChatMessage[] = messages.map((m) =>
    m.role === 'assistant' ? { ...m, actions: ['copy'] } : m,
  );
  const pending = Object.entries(partialArgs).filter(([, text]) => {
    try {
      JSON.parse(text);
      return false; // already complete — the ToolPart shows it properly now
    } catch {
      return true;
    }
  });

  return (
    <div className="thread-wrap">
      <Thread className="thread" theme={theme} messages={withActions} loading={loading} />
      {pending.length > 0 && (
        <div className="partial-args" aria-live="polite">
          {pending.map(([id, text]) => (
            <div key={id} className="partial-args-row">
              <span className="partial-args-id">{id}</span>
              <code>{text}</code>
              <span className="partial-args-caret" aria-hidden>
                ▍
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
