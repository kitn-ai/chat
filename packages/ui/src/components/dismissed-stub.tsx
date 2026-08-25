import { Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Card } from './card';
import { RotateCcw } from 'lucide-solid';

// ─────────────────────────────────────────────────────────────────────────────
// DismissedStub — the collapsed, re-openable read-only view a card renders once
// the user has dismissed it (a DEFERRED resolution, not a terminal one). It's a
// dense `Card` showing "<intent>: <title> — dismissed" + a ghost Reopen button.
// Pure/presentational: the owning card wires `onReopen` to emit `{kind:'reopen'}`.
// ─────────────────────────────────────────────────────────────────────────────

/** The card types that render a dismissed stub, mapped to their intent verb. */
export type DismissedCardType = 'confirm' | 'choice' | 'form' | 'tasks';

const INTENT_LABELS: Record<DismissedCardType, string> = {
  confirm: 'Proposed',
  choice: 'Choose',
  form: 'Form',
  tasks: 'Tasks',
};

/** Map a card `type` to its dismissed-stub intent label ("Proposed:", "Choose:",
 *  "Form:", "Tasks:"). Falls back to a capitalized type for unknown card types. */
export function stubIntent(type: string): string {
  const known = INTENT_LABELS[type as DismissedCardType];
  if (known) return `${known}:`;
  if (type.length === 0) return 'Card:';
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}:`;
}

export interface DismissedStubProps {
  /** The card type, used to derive the intent label ("Proposed:" etc.). */
  type: string;
  /** The card's title/heading; shown after the intent label. Falls back gracefully. */
  title?: string;
  /** Re-open handler. The owning card emits `{ kind:'reopen', cardId }`. */
  onReopen: () => void;
  /** The Reopen button label. Default 'Reopen'. */
  reopenLabel?: string;
  class?: string;
}

/**
 * `DismissedStub` — the compact stub a card collapses to after it's been dismissed.
 * Group-labelled for a11y; the Reopen affordance is a ghost button.
 */
export function DismissedStub(props: DismissedStubProps): JSX.Element {
  const intent = (): string => stubIntent(props.type);
  const title = (): string => props.title ?? 'this card';
  const label = (): string => props.reopenLabel ?? 'Reopen';
  const groupLabel = (): string => `${intent()} ${title()} — dismissed`;

  return (
    <Card dense class={props.class}>
      <div
        role="group"
        aria-label={groupLabel()}
        class="flex flex-wrap items-center gap-x-2 gap-y-1"
      >
        <span class="min-w-0 text-sm text-muted-foreground">
          <span class="font-medium text-foreground">{intent()}</span>{' '}
          <span class="text-foreground">{title()}</span>
          <span class="text-muted-foreground"> — dismissed</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class={cn('ml-auto gap-1.5')}
          onClick={() => props.onReopen()}
        >
          <RotateCcw size={14} aria-hidden="true" />
          <Show when={label()}>{label()}</Show>
        </Button>
      </div>
    </Card>
  );
}
