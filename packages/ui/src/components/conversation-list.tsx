import { splitProps, For, Show, createSignal, createMemo, onMount, type JSX } from 'solid-js';
import { PanelLeftOpen } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { ConversationItem } from './conversation-item';
import type { ConversationSummary, ConversationGroup } from '../types';

/**
 * The collapsed-rail fallback: a floating reopen button shown when the
 * conversation sidebar is collapsed. Shared by `kai-workspace` (its collapsed
 * branch) and the standalone `kai-conversations` (collapsed mode), so the rail
 * collapses identically in both. Renders only the button; the host owns the
 * surrounding region (the workspace puts the thread beside it, the standalone
 * element stands alone). `onExpand` reopens the rail.
 */
export interface CollapsedRailProps { onExpand: () => void; class?: string }

export function CollapsedRail(props: CollapsedRailProps) {
  return (
    <Button
      variant="ghost" size="icon-sm" aria-label="Open sidebar"
      class={cn('rounded-full bg-card/80 shadow-sm backdrop-blur', props.class)}
      onClick={props.onExpand}
    >
      <PanelLeftOpen class="size-4" />
    </Button>
  );
}

export interface ConversationListProps {
  groups: ConversationGroup[];
  conversations: ConversationSummary[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onToggleSidebar?: () => void;
  /** Replaces the built-in title bar (toggle / "Chats" / New chat). */
  header?: JSX.Element;
  /** A row below the list (e.g. account / settings / usage). */
  footer?: JSX.Element;
  /** Replaces the built-in "no conversations yet" state. */
  empty?: JSX.Element;
  /** Dense single-line rows (a leading dot + title, no message count). */
  compact?: boolean;
  /** Fired whenever the built-in search box query changes (typing or a
   *  programmatic `clear()`). Lets the facade surface a `kai-search` event. */
  onSearchChange?: (query: string) => void;
  /** Receive the imperative controller once mounted. The `kai-conversations`
   *  facade uses it to focus / clear the internal search input. */
  controllerRef?: (controller: ConversationListController) => void;
  class?: string;
}

/** Imperative handle exposed via `controllerRef` — surfaces the internal search
 *  box to the `kai-conversations` facade (the searchQuery signal lives here). */
export interface ConversationListController {
  /** Focus the built-in search `<input>`. */
  focus(options?: FocusOptions): void;
  /** Clear the internal search query (resets the list filter). */
  clearSearch(): void;
}

export function ConversationList(props: ConversationListProps) {
  const [local] = splitProps(props, ['groups', 'conversations', 'activeId', 'onSelect', 'onNewChat', 'onToggleSidebar', 'header', 'footer', 'empty', 'compact', 'onSearchChange', 'controllerRef', 'class']);
  const [searchQuery, setSearchQuery] = createSignal('');
  const isEmpty = createMemo(() => local.conversations.length === 0);
  // The search query is owned here; setQuery is the single mutation point so both
  // typing and the imperative clearSearch() notify the facade (→ kai-search).
  let searchInput: HTMLInputElement | undefined;
  const setQuery = (q: string) => { setSearchQuery(q); local.onSearchChange?.(q); };

  // Hand the imperative controller (focus / clear the search box) to the facade.
  onMount(() => {
    local.controllerRef?.({
      focus: (options) => searchInput?.focus(options),
      clearSearch: () => setQuery(''),
    });
  });

  const filteredConversations = createMemo(() => {
    const q = searchQuery().toLowerCase();
    if (!q) return local.conversations;
    return local.conversations.filter((c) => c.title.toLowerCase().includes(q));
  });

  const groupedConversations = createMemo(() => {
    const grouped = new Map<string | undefined, ConversationSummary[]>();
    for (const conv of filteredConversations()) {
      const key = conv.groupId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(conv);
    }
    return grouped;
  });

  const ungrouped = createMemo(() => groupedConversations().get(undefined) ?? []);

  return (
    <div class={cn('flex flex-col h-full bg-sidebar', local.class)}>
      {/* header (replace): the consumer's own title bar, else the built-in one. */}
      <Show
        when={local.header}
        fallback={
          <div class="flex items-center justify-between p-3 pb-2">
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" aria-label="Toggle sidebar" onClick={local.onToggleSidebar}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </Button>
              <span class="text-sm font-semibold text-foreground">Chats</span>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={local.onNewChat}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </Button>
          </div>
        }
      >
        {local.header}
      </Show>
      <Show when={!isEmpty()}>
        <div class="px-3 pb-2">
          <div class="flex items-center gap-2 rounded-md bg-surface-strong px-2.5 py-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-muted-foreground"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input ref={searchInput} type="text" value={searchQuery()} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="Search chats..."
              aria-label="Search chats"
              class="bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full" />
          </div>
        </div>
      </Show>
      {/* list, or the empty state (replace) when there are no conversations. */}
      <Show
        when={!isEmpty()}
        fallback={
          <Show
            when={local.empty}
            fallback={
              <div class="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
                No conversations yet
              </div>
            }
          >
            {local.empty}
          </Show>
        }
      >
        <ScrollArea class="flex-1 px-2">
          <For each={local.groups}>
            {(group) => {
              const convs = createMemo(() => groupedConversations().get(group.id) ?? []);
              return (
                <Show when={convs().length > 0}>
                  <GroupSection name={group.name} count={convs().length} conversations={convs()} activeId={local.activeId} onSelect={local.onSelect} compact={local.compact} />
                </Show>
              );
            }}
          </For>
          <Show when={ungrouped().length > 0}>
            <Show
              when={local.compact}
              fallback={<GroupSection name="Ungrouped" count={ungrouped().length} conversations={ungrouped()} activeId={local.activeId} onSelect={local.onSelect} />}
            >
              <div class="space-y-0.5 py-1">
                <For each={ungrouped()}>
                  {(conv) => <ConversationItem conversation={conv} isActive={conv.id === local.activeId} onSelect={local.onSelect} compact />}
                </For>
              </div>
            </Show>
          </Show>
        </ScrollArea>
      </Show>
      {/* footer (inject): a row below the list (account / settings / …). */}
      <Show when={local.footer}>
        <div class="shrink-0 border-t border-border">{local.footer}</div>
      </Show>
    </div>
  );
}

function GroupSection(props: { name: string; count: number; conversations: ConversationSummary[]; activeId?: string; onSelect: (id: string) => void; compact?: boolean }) {
  const [open, setOpen] = createSignal(true);
  return (
    <Collapsible open={open()} onOpenChange={setOpen}>
      <CollapsibleTrigger class="flex items-center gap-1.5 w-full px-1.5 py-1 rounded-md text-[13px] text-muted-foreground font-medium hover:bg-muted/30 transition-colors cursor-pointer mt-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class={cn('transition-transform', !open() && '-rotate-90')}><polyline points="6 9 12 15 18 9"/></svg>
        <span>{props.name}</span>
        <Badge variant="count" class="ml-auto text-[11px]">{props.count}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="pl-2 mt-0.5 space-y-0.5">
          <For each={props.conversations}>
            {(conv) => <ConversationItem conversation={conv} isActive={conv.id === props.activeId} onSelect={props.onSelect} compact={props.compact} />}
          </For>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
