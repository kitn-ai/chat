// src/components/card-fallback.tsx
// Rendered by the dispatcher when an envelope's `type` has no registered card.
// Visual: reuses the Card chrome so it sits naturally in a card stream.
import type { JSX } from 'solid-js';
import { Card } from './card';
import { AlertTriangle } from 'lucide-solid';

export interface CardFallbackProps {
  /** The unrecognized envelope type, shown to aid debugging. */
  type: string;
  /** The envelope id (for parity with cards; not displayed). */
  cardId?: string;
}

/** Inert, themed fallback for an unsupported card type. Emits nothing itself —
 *  the dispatcher emits the contract `error` event alongside rendering this. */
export function CardFallback(props: CardFallbackProps): JSX.Element {
  return (
    <Card>
      <div data-card-fallback role="alert" class="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <AlertTriangle class="size-4 shrink-0 text-destructive dark:text-red-400" aria-hidden="true" />
        <span>
          Unsupported card type: <code class="font-mono">{props.type}</code>
        </span>
      </div>
    </Card>
  );
}
