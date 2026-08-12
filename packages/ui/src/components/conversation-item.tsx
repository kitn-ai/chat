import { Show, splitProps, createMemo } from 'solid-js';
import { MessageSquare } from 'lucide-solid';
import { cn } from '../utils/cn';
import type { ConversationSummary } from '../types';

export interface ConversationItemProps {
  conversation: ConversationSummary;
  isActive: boolean;
  onSelect: (id: string) => void;
  /** Dense single-line row: a leading dot + title, no message count. */
  compact?: boolean;
  class?: string;
}

/**
 * Short relative time from an ISO date string: "just now", "5m ago", "3h ago",
 * "2d ago", "24d ago". Pure — it snapshots `now` (defaults to `Date.now()`) at
 * call time, so it re-derives whenever the list re-renders; there is no internal
 * ticking clock. Returns '' for a missing or unparseable date.
 */
export function relativeTimeShort(iso?: string, now: number = Date.now()): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ConversationItem(props: ConversationItemProps) {
  const [local] = splitProps(props, ['conversation', 'isActive', 'onSelect', 'compact', 'class']);
  // The trailing text: the consumer's own `trailing` field, else an auto relative
  // time from updatedAt (fallback lastMessageAt). REACTIVITY: this (and the auto
  // time) update when the consumer re-assigns the `conversations` array with a new
  // reference — the kit's standard reactivity model — not via an internal clock.
  const trailing = createMemo(
    () => local.conversation.trailing ?? relativeTimeShort(local.conversation.updatedAt ?? local.conversation.lastMessageAt),
  );
  return (
    <button
      data-conversation-id={local.conversation.id}
      // `isActive` drives the selected LOOK below; it has to reach assistive tech
      // too, or the active conversation is visible only to sighted users. `true`
      // rather than `page` because this selects a conversation within the app, it
      // is not page navigation — same call as ui/agent-card.tsx and ui/pane-group.tsx
      // (ui/nav.tsx uses `page` because its items really are nav links).
      aria-current={local.isActive ? 'true' : undefined}
      onClick={() => local.onSelect(local.conversation.id)}
      class={cn(
        'w-full rounded-lg text-left transition-colors',
        local.compact ? 'px-2.5 py-1.5' : 'px-2.5 py-2',
        local.isActive ? 'bg-muted' : 'hover:bg-muted/50',
        local.class,
      )}
    >
      <Show
        when={local.compact}
        fallback={
          <>
            <div class="flex items-center gap-2">
              <div class={cn('min-w-0 flex-1 truncate text-sm', local.isActive ? 'font-medium text-foreground' : 'text-foreground/80')}>{local.conversation.title}</div>
              <Show when={trailing()}>
                <span part="trailing" class="ml-auto shrink-0 text-xs text-muted-foreground">{trailing()}</span>
              </Show>
            </div>
            <div class={cn('mt-0.5 truncate text-xs', local.isActive ? 'text-foreground/70' : 'text-muted-foreground')}>{local.conversation.messageCount} messages</div>
          </>
        }
      >
        <div class="flex items-center gap-2.5">
          <MessageSquare class={cn('size-3.5 shrink-0', local.isActive ? 'text-foreground' : 'text-muted-foreground')} />
          <span class={cn('min-w-0 flex-1 truncate text-sm', local.isActive ? 'font-medium text-foreground' : 'text-foreground/80')}>{local.conversation.title}</span>
          <Show when={trailing()}>
            <span part="trailing" class="ml-auto shrink-0 text-xs text-muted-foreground">{trailing()}</span>
          </Show>
        </div>
      </Show>
    </button>
  );
}
