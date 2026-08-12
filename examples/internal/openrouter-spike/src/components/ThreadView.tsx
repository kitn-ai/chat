import { Thread } from '@kitn.ai/ui/react';
import type { ChatMessage } from '@kitn.ai/ui/react';
import { SPIKE_CARD_SCHEMAS, SPIKE_CARD_TYPES } from '../cards';
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
 * `cardTypes`/`cardSchemas` carry the ONE card type this app owns: `weather`,
 * drawn by `<spike-weather-card>`. It is not an override of a built-in — the kit
 * ships no weather card — so it is the seam doing the only job the seam has, and
 * `get_weather` puts it on the app's ordinary path rather than a test's. The six
 * built-in card types this spike also emits are deliberately NOT listed: an entry
 * here would shadow the kit's own component with a stub and turn six live cells
 * into measurements of this file. See `../cards.ts` for why the seam has to be
 * used by something ordinary.
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
        cardTypes={SPIKE_CARD_TYPES}
        cardSchemas={SPIKE_CARD_SCHEMAS}
      />
    </div>
  );
}
