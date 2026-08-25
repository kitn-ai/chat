import { Show, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Bell, MoreHorizontal } from 'lucide-solid';
import { cn } from '../utils/cn';

/** The run state of an agent, mapped to the kit's tool / status hues.
 *  - `working` (blue) the agent is actively running.
 *  - `idle` (muted) waiting, no current activity.
 *  - `done` (green) finished its turn.
 *  - `error` (red) failed.
 *  - `blocked` (amber) stalled, usually waiting on something. */
export type AgentStatusTone = 'working' | 'idle' | 'done' | 'error' | 'blocked';

export interface AgentStatus {
  /** Which hue the status dot takes. */
  tone: AgentStatusTone;
  /** Optional short label rendered next to the dot (e.g. "Working", "Blocked on you"). */
  label?: string;
  /** Animate the dot with a ping ring (off under prefers-reduced-motion). */
  pulse?: boolean;
}

export interface AgentCardProps {
  /** @deprecated No longer rendered. Kept for back-compat with existing callers. */
  leading?: JSX.Element;
  /** The agent's name. The primary label. */
  name: string;
  /** @deprecated No longer rendered. Kept for back-compat with existing callers. */
  subtitle?: string;
  /** @deprecated No longer rendered. Kept for back-compat with existing callers. */
  lastLine?: string;
  /** Run status: a tone-colored dot, an optional small label, optionally pulsing. */
  status: AgentStatus;
  /** Raise a prominent "needs you" pill plus a glowing amber edge. The
   *  attention-routing signal that pulls focus to this agent. */
  needsAttention?: boolean;
  /** Selected / focused state. Highlighted border and surface. */
  active?: boolean;
  /** Promote this agent to focus. Fires on click and on Enter / Space. */
  onActivate?: () => void;
  /** Alias for {@link AgentCardProps.onActivate}. Both fire if both are set. */
  onClick?: () => void;
  /** Show a trailing "..." overflow button and fire this on click. The consumer
   *  wires the actual menu; the card only surfaces the affordance. Click is
   *  stopped from also activating the card. */
  onMenu?: (e: MouseEvent) => void;
  /** Extra classes merged over the card. */
  class?: string;
}

/** tone -> dot background utility (the kit's tool hues + muted for idle). */
const TONE_DOT: Record<AgentStatusTone, string> = {
  working: 'bg-tool-blue',
  idle: 'bg-muted-foreground',
  done: 'bg-tool-green',
  error: 'bg-tool-red',
  blocked: 'bg-tool-amber',
};

/** tone -> matching text color for the inline status label. */
const TONE_TEXT: Record<AgentStatusTone, string> = {
  working: 'text-tool-blue',
  idle: 'text-muted-foreground',
  done: 'text-tool-green',
  error: 'text-tool-red',
  blocked: 'text-tool-amber',
};

/** Default accessible name per tone, used when no `status.label` is given so the
 *  state is still announced even when the dot reads as decorative. */
const TONE_LABEL: Record<AgentStatusTone, string> = {
  working: 'Working',
  idle: 'Idle',
  done: 'Done',
  error: 'Error',
  blocked: 'Blocked',
};

/**
 * AgentCard - the compact representation of one agent in a multi-agent workspace.
 *
 * In a focus + periphery layout the agents you are not focused on collapse to these
 * glanceable cards, arranged as a narrow side RAIL or a wide LIST. The card stays
 * deliberately minimal: the agent name, a tone-colored status dot, a "needs you"
 * affordance when the agent wants your attention, and a trailing "..." overflow
 * button for per-agent actions. Clicking the card promotes the agent back to focus.
 *
 * It is `w-full` and lets the name truncate, so the same component works in both a
 * narrow rail and a wide list without changes - the content adapts to the box.
 *
 * Status maps to the kit's tool hues so it reads in light and dark from tokens alone:
 * working = blue, idle = muted, done = green, error = red, blocked = amber. Setting
 * `needsAttention` raises an amber "Needs you" pill and a glowing amber ring so the
 * card jumps out of the periphery - the attention-routing signal.
 */
export function AgentCard(props: AgentCardProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;

  const tone = (): AgentStatusTone => local.status.tone;
  const activate = () => {
    local.onActivate?.();
    local.onClick?.();
  };

  return (
    // A plain container (no interactive role): the agent name below is the real
    // <button> activator, and the kebab is a separate sibling <button>, so neither
    // interactive control is nested inside the other.
    <div
      data-active={local.active ? '' : undefined}
      data-needs-attention={local.needsAttention ? '' : undefined}
      class={cn(
        'group relative flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left',
        'transition-[background-color,border-color,box-shadow]',
        local.active
          ? 'border-primary bg-accent'
          : 'border-border bg-surface hover:bg-accent',
        // The attention edge: a glowing amber ring + tinted border. Stacks over the
        // active/idle surface so a focused agent can still flag that it needs you.
        local.needsAttention && 'border-tool-amber/50 ring-2 ring-inset ring-tool-amber/60',
        local.class,
      )}
    >
      {/* Status indicator leads, immediately before the name: [● label?] Name. */}
      <span
        class="inline-flex shrink-0 items-center gap-1.5"
        role="status"
        aria-label={local.status.label ?? TONE_LABEL[tone()]}
      >
        <span class="relative inline-flex">
          <Show when={local.status.pulse}>
            <span
              aria-hidden="true"
              class={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:hidden',
                TONE_DOT[tone()],
              )}
            />
          </Show>
          <span
            aria-hidden="true"
            part="status"
            class={cn('relative inline-block size-2 rounded-full', TONE_DOT[tone()])}
          />
        </span>
        <Show when={local.status.label}>
          <span class={cn('text-[11px] font-medium leading-none', TONE_TEXT[tone()])}>
            {local.status.label}
          </span>
        </Show>
      </span>

      {/* The agent name is the card's primary action: a real <button> whose inset
          ::before overlay stretches the click target over the whole card, so a click
          anywhere promotes the agent. Being a real button it is natively focusable and
          activates on Enter / Space, so no manual key handling is needed. The overlay
          also carries the card's focus ring (rounded to match), keeping the focused
          card visually identical to before. */}
      <button
        type="button"
        onClick={activate}
        aria-current={local.active ? 'true' : undefined}
        class={cn(
          'min-w-0 flex-1 text-left outline-none',
          "before:absolute before:inset-0 before:rounded-lg before:content-['']",
          'focus-visible:before:ring-2 focus-visible:before:ring-inset focus-visible:before:ring-ring',
        )}
      >
        <span class="block truncate text-sm font-medium leading-tight text-foreground">
          {local.name}
        </span>
      </button>

      <span class="flex shrink-0 items-center gap-2">
        <Show when={local.needsAttention}>
          <span class="inline-flex items-center gap-1 rounded-full bg-tool-amber/15 px-2 py-0.5 text-[11px] font-medium text-tool-amber">
            <Bell class="size-3" aria-hidden="true" />
            Needs you
          </span>
        </Show>

        <Show when={local.onMenu}>
          <button
            type="button"
            part="menu"
            aria-label="More"
            onClick={(e) => {
              // The kebab sits above the name button's stretch overlay (relative z-10),
              // so it opens its menu without activating the card; stop propagation too.
              e.stopPropagation();
              local.onMenu?.(e);
            }}
            class={cn(
              'relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-md',
              'text-muted-foreground outline-none transition-colors',
              'hover:bg-surface-sunken hover:text-foreground',
              'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            )}
          >
            <MoreHorizontal class="size-4" aria-hidden="true" />
          </button>
        </Show>
      </span>
    </div>
  );
}
