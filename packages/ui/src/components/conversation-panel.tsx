import { For, Show, createMemo } from 'solid-js';
import { cn } from '../utils/cn';
import { ScrollArea } from '../ui/scroll-area';
import { relativeTimeShort, isConversationUnread } from './conversation-item';
import type { ConversationSummary } from '../types';

export interface ConversationPanelProps {
  conversations: ConversationSummary[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  /** Wording for the floating new-conversation pill. Defaults to "New conversation". */
  newChatLabel?: string;
  class?: string;
}

/**
 * The widget-box list view (owner rework, 2026-08-26 — the earlier retrofit
 * of the desktop `ConversationList` into this box was rejected at the live
 * demo). NOT `ConversationList`, which stays the desktop-sidebar surface
 * unchanged: no search box, no group headers, no per-row menu, no full-width
 * footer bar, no second "+" beside the header toggle. A row is a
 * conversation, full stop — bold title, right-aligned relative time, one
 * truncated line of the last message. The ONE way to start a new
 * conversation is the floating pill near the bottom.
 *
 * Modeled directly on Intercom's Messenger "Messages" tab (first-hand
 * research: `.superpowers/sdd/2026-08-26-conversations/
 * research-intercom-messages-view.md`) — a box this size gets one job at a
 * time: browsing conversations OR having one, never both, and the list
 * replaces the ENTIRE content area (`ChatThread` hides the thread,
 * suggestions and composer while this renders — see its `view() === 'list'`
 * branch).
 */
export function ConversationPanel(props: ConversationPanelProps) {
  // Most-recently-updated first — the same defensive sort ChatThread's own
  // auto-restore uses (an unparsable/missing date sorts last, never throws).
  const ordered = createMemo(() =>
    [...props.conversations].sort((a, b) => {
      const at = Date.parse(a.updatedAt ?? '');
      const bt = Date.parse(b.updatedAt ?? '');
      return (Number.isNaN(bt) ? -Infinity : bt) - (Number.isNaN(at) ? -Infinity : at);
    }),
  );

  return (
    <div class={cn('relative flex h-full flex-col', props.class)}>
      <Show
        when={props.conversations.length > 0}
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
            No conversations yet
          </div>
        }
      >
        <ScrollArea class="flex-1 px-2 pt-2">
          {/* Bottom padding clears the floating pill so the last row is never
              hidden behind it. */}
          <div role="list" aria-label="Conversations" class="space-y-0.5 pb-16">
            <For each={ordered()}>
              {(conv) => {
                const isActive = () => conv.id === props.activeId;
                const time = () => relativeTimeShort(conv.updatedAt ?? conv.lastMessageAt);
                const unread = () => isConversationUnread(conv);
                return (
                  <button
                    type="button"
                    role="listitem"
                    data-conversation-id={conv.id}
                    data-active={isActive() ? '' : undefined}
                    data-unread={unread() ? '' : undefined}
                    aria-current={isActive() ? 'true' : undefined}
                    onClick={() => props.onSelect(conv.id)}
                    class={cn(
                      'block w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                      isActive() ? 'bg-muted' : 'hover:bg-muted/50',
                    )}
                  >
                    <div class="flex items-baseline gap-2">
                      <span class={cn('min-w-0 flex-1 truncate text-sm font-semibold', isActive() ? 'text-foreground' : 'text-foreground/90')}>
                        {conv.title}
                      </span>
                      <Show when={time()}>
                        <span class="shrink-0 text-xs text-muted-foreground">{time()}</span>
                      </Show>
                    </div>
                    {/* Trailing line: the last-message preview, plus — Intercom's own
                        placement (research doc §2) — a small unread dot at its end. No
                        preview text and no unread still renders nothing, same as before. */}
                    <Show when={conv.trailing || unread()}>
                      <div class="mt-0.5 flex items-center gap-1.5">
                        <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{conv.trailing}</span>
                        <Show when={unread()}>
                          <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-unread" />
                          <span class="sr-only">Unread</span>
                        </Show>
                      </div>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </ScrollArea>
      </Show>
      {/* The ONE new-conversation control: a compact centered floating pill,
          never a header "+" AND a footer bar at once (the retrofit's
          rejected shape). */}
      <div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <button
          type="button"
          data-kai-new-conversation
          onClick={props.onNewChat}
          class="pointer-events-auto rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-md transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {props.newChatLabel ?? 'New conversation'}
        </button>
      </div>
    </div>
  );
}
