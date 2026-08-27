import { For, Show } from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { renderIcon } from '../ui/icon';
import { isSafeUrl } from '../primitives/url-scheme-policy';
import { relativeTimeShort, isConversationUnread } from './conversation-item';
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
 * links. Pure props in, events out — no fetching, no routing; a later task
 * wires this behind `ChatThread`'s Home/Messages tab bar.
 *
 * Unsafe-href rule: a `links` entry with an `href` that fails `isSafeUrl`
 * (e.g. `javascript:`) is NOT silently promoted into a button/event-emitter —
 * that would let a host-authored-but-attacker-influenced config still fire a
 * handler off a scheme SAFE_SCHEMES rejects. It renders as a plain,
 * non-interactive row: label visible, no anchor, no button, no click handler.
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
            <button
              type="button"
              data-kai-home-recent
              onClick={() => props.onSelectRecent?.(recent().id)}
              class="flex flex-col gap-1 rounded-xl border border-border p-4 text-left transition-colors hover:bg-accent"
            >
              <span class="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span class="min-w-0 flex-1 truncate">{recent().title}</span>
                <Show when={unread()}>
                  <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-unread" />
                </Show>
                <Show when={time()}>
                  <span class="shrink-0 text-xs font-normal text-muted-foreground">{time()}</span>
                </Show>
              </span>
              <Show when={recent().trailing}>
                <span class="line-clamp-1 text-sm text-muted-foreground">{recent().trailing}</span>
              </Show>
            </button>
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
            {(entry) => {
              const safeHref = () => (entry.href && isSafeUrl(entry.href) ? entry.href : undefined);
              const inner = (
                <>
                  <span class="flex min-w-0 items-center gap-2">
                    <Show when={entry.icon}>{renderIcon(entry.icon, { class: 'size-4 shrink-0 text-muted-foreground' })}</Show>
                    <span class="flex min-w-0 flex-col text-left">
                      <span class="truncate text-sm font-medium text-foreground">{entry.label}</span>
                      <Show when={entry.description}>
                        <span class="truncate text-xs text-muted-foreground">{entry.description}</span>
                      </Show>
                    </span>
                  </span>
                  {renderIcon('chevron-right', { class: 'size-4 shrink-0 text-muted-foreground' })}
                </>
              );
              const rowClass = 'flex items-center justify-between gap-2 border-b border-border p-3 last:border-b-0';
              return (
                <Show
                  when={!entry.href}
                  fallback={
                    <Show
                      when={safeHref()}
                      fallback={
                        // Unsafe href: a non-interactive row. No anchor, no
                        // button, no handler — the label stays visible, it
                        // just never becomes clickable.
                        <div data-kai-home-link class={rowClass}>
                          {inner}
                        </div>
                      }
                    >
                      <a
                        data-kai-home-link
                        href={safeHref()}
                        target="_blank"
                        rel="noreferrer noopener"
                        class={cn(rowClass, 'transition-colors hover:bg-accent')}
                      >
                        {inner}
                      </a>
                    </Show>
                  }
                >
                  <button
                    type="button"
                    data-kai-home-link
                    onClick={() => props.onLink?.(entry)}
                    class={cn(rowClass, 'w-full text-left transition-colors hover:bg-accent')}
                  >
                    {inner}
                  </button>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
