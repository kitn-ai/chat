import { For, Show } from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { renderIcon } from '../ui/icon';
import { relativeTimeShort, isConversationUnread } from './conversation-item';
import { Row } from './row';
import type { ConversationSummary, HomeLinkEntry } from '../types';

export interface HomePanelProps {
  greeting?: { title?: string; subtitle?: string };
  /** The most-recent conversation, host-derived. `undefined` hides the card
   *  entirely — this component never fetches or picks one itself. */
  recent?: ConversationSummary;
  /** Defaults to `true`. */
  showNewConversation?: boolean;
  /** Defaults to `'Send us a message'`. */
  newChatLabel?: string;
  links?: HomeLinkEntry[];
  onSelectRecent?: (id: string) => void;
  onNewChat: () => void;
  /** Fired only for href-less link entries — an entry with a safe `href`
   *  navigates as a real anchor instead. */
  onLink?: (entry: HomeLinkEntry) => void;
  class?: string;
}

/**
 * The widget home screen (Intercom-pattern, H-1): greeting, the most-recent
 * conversation, a "start a new conversation" CTA, and a list of host-defined
 * links. Pure props in, events out — no fetching, no routing; `ChatThread`
 * wires this behind its Home/Messages tab bar.
 *
 * The rows render THROUGH the public `Row` part (P-4/P-9): the
 * recent-conversation card and each help link are `Row` compositions, so the
 * facade's home tab and a composed block's settings screen share one row
 * anatomy. The unsafe-href rule now lives where the anatomy does: `Row`
 * refuses an `href` that fails `isSafeUrl` (e.g. `javascript:`) by rendering
 * a plain, non-interactive row — label visible, no anchor, no button, no
 * click handler — rather than silently promoting it into an event-emitter.
 * (The CTA stays a `Button`: it is a primary action, not a list row.)
 */
export function HomePanel(props: HomePanelProps) {
  const title = () => props.greeting?.title ?? 'Hi there 👋';

  return (
    <div
      data-kai-home-panel
      class={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5', props.class)}
    >
      <div class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold text-foreground">{title()}</h2>
        <Show when={props.greeting?.subtitle}>
          <p class="text-sm text-muted-foreground">{props.greeting!.subtitle}</p>
        </Show>
      </div>

      <Show when={props.recent}>
        {(recent) => {
          const time = () => relativeTimeShort(recent().updatedAt ?? recent().lastMessageAt);
          const unread = () => isConversationUnread(recent());
          return (
            <Row
              data-kai-home-recent
              class="rounded-xl border border-border p-4"
              subtitle={recent().trailing}
              trailing={
                <>
                  <Show when={unread()}>
                    <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-unread" />
                  </Show>
                  <Show when={time()}>
                    <span class="shrink-0">{time()}</span>
                  </Show>
                </>
              }
              onActivate={() => props.onSelectRecent?.(recent().id)}
            >
              {recent().title}
            </Row>
          );
        }}
      </Show>

      <Show when={props.showNewConversation !== false}>
        <Button
          type="button"
          data-kai-home-new
          full
          align="start"
          onClick={() => props.onNewChat()}
          class="justify-between"
        >
          <span>{props.newChatLabel ?? 'Send us a message'}</span>
          {renderIcon('arrow-right', { class: 'size-4 shrink-0' })}
        </Button>
      </Show>

      <Show when={props.links && props.links.length > 0}>
        <div class="flex flex-col overflow-hidden rounded-xl border border-border">
          <For each={props.links}>
            {(entry) => (
              <Row
                data-kai-home-link
                class="rounded-none border-b border-border last:border-b-0"
                leading={entry.icon ? renderIcon(entry.icon, { class: 'size-4 shrink-0' }) : undefined}
                subtitle={entry.description}
                chevron
                href={entry.href}
                onActivate={entry.href ? undefined : () => props.onLink?.(entry)}
              >
                {entry.label}
              </Row>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
