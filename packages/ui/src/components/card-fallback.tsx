// src/components/card-fallback.tsx
// Rendered by the dispatcher when an envelope cannot be rendered: its `type` has no
// registered card, or its `data` failed HARD validation against the built-in schema
// for that type (see primitives/card-validate-cards.ts for what "hard" means).
// Visual: reuses the Card chrome so it sits naturally in a card stream.
import { Show, type JSX } from 'solid-js';
import { Card } from './card';
import { AlertTriangle } from 'lucide-solid';

export interface CardFallbackProps {
  /** The envelope type, shown to aid debugging. */
  type: string;
  /** The envelope id (for parity with cards; not displayed). */
  cardId?: string;
  /**
   * Why this card could not render, when the type WAS known but the data was not
   * usable. Carries the failing field paths verbatim, e.g.
   * `(root).actions: fewer than minItems 1`.
   *
   * Absent means the older case: an unrecognized type. The two are told apart by
   * this prop rather than by a mode flag so a caller cannot ask for the diagnostic
   * and forget to supply the diagnosis.
   */
  reason?: string;
}

/** Inert, themed fallback for a card that cannot render. Emits nothing itself —
 *  the dispatcher emits the contract `error` event alongside rendering this. */
export function CardFallback(props: CardFallbackProps): JSX.Element {
  return (
    <Card>
      <Show
        when={props.reason}
        fallback={
          <div data-card-fallback role="alert" class="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <AlertTriangle class="size-4 shrink-0 text-destructive dark:text-red-400" aria-hidden="true" />
            <span>
              Unsupported card type: <code class="font-mono">{props.type}</code>
            </span>
          </div>
        }
      >
        {(reason) => (
          <div
            data-card-fallback
            data-card-invalid
            role="alert"
            class="flex items-start gap-2 p-4 text-sm text-muted-foreground"
          >
            <AlertTriangle class="size-4 shrink-0 translate-y-0.5 text-destructive dark:text-red-400" aria-hidden="true" />
            <span class="min-w-0">
              Invalid <code class="font-mono">{props.type}</code> card:{' '}
              <code data-card-invalid-reason class="font-mono break-words">{reason()}</code>
            </span>
          </div>
        )}
      </Show>
    </Card>
  );
}
