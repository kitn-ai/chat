import { splitProps, For, Show, createSignal, createMemo, onMount, type JSX } from 'solid-js';
import { PanelLeftOpen } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { ConversationItem, type ConversationRowDensity } from './conversation-item';
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

/** Read a conversation item's identity the way the container does: the
 *  `conversationId` property, else the `conversation-id` attribute, else the
 *  host `id`. The property is what a framework loop sets; the attributes are
 *  the plain-HTML spellings (host `id` matches the `<kai-conversation>`
 *  data-carrier precedent). */
export function readConversationItemId(el: Element): string {
  const prop = (el as Element & { conversationId?: unknown }).conversationId;
  if (typeof prop === 'string' && prop) return prop;
  return el.getAttribute('conversation-id') ?? el.id;
}

/** Whether a `<kai-conversation-item>` is STANDALONE — outside the management
 *  of a `<kai-conversations>` container — and therefore activates ITSELF:
 *  the facade makes its row body a
 *  tabbable button and fires `kai-select` on click / Enter / Space. Derived
 *  from the container's own membership rule, not from mere ancestry: item mode
 *  queries `:scope > kai-conversation-item` (direct children only), so an item
 *  wrapped in another element inside a container is standalone too — the
 *  container's controller never stamps or activates it. Inside a container
 *  (a direct child), the parent-item contract is the ONLY activation
 *  path: the container dispatches `kai-conversation-select` and owns roving
 *  tabindex, and the item fires nothing of its own. */
export function isStandaloneConversationItem(el: Element): boolean {
  return el.parentElement?.localName !== 'kai-conversations';
}

export interface ConversationItemsControllerOptions {
  /** The current slotted item hosts, in DOM order. */
  getItems: () => HTMLElement[];
  /** The container's active conversation id. */
  getActiveId: () => string | undefined;
  /** Item activation (click / Enter / Space). Surfaces as
   *  `kai-conversation-select` on the element. */
  onSelect: (id: string) => void;
}

export interface ConversationItemsController {
  /** Re-derive the ARIA/roving-tabindex bookkeeping over the current items.
   *  Call on slotchange / child mutation and whenever `activeId` changes. */
  sync(): void;
  /** The container's items-region click handler (composed-path aware). */
  handleClick(e: MouseEvent): void;
  /** The container's items-region keydown handler (arrows, Home/End,
   *  Enter/Space). */
  handleKeyDown(e: KeyboardEvent): void;
}

/**
 * The parent-item contract of item mode, as a pure-DOM
 * controller so it is host-agnostic: the `kai-conversations` facade wires it over
 * its slotted `kai-conversation-item` children, and the jsdom contract tests
 * drive it over plain nodes. Solid context cannot cross the element boundary
 * (each facade is its own Solid root), so the channel is DOM traversal by
 * construction:
 *
 * - selection flows container to item — exactly one item's BODY node (the
 *   shadow body of a `kai-conversation-item`, else the node itself; see
 *   `bodyOf`) is `aria-current="true"`, plus the `active` property on the
 *   host for the item's own styling hook;
 * - `role="button"` is ensured on each item's body node (an authored role is
 *   left alone);
 * - roving tabindex — exactly one body node `tabindex="0"` (the active
 *   item's, else the first's), the rest `-1`, re-derived on every `sync()`;
 *   menu content keeps its natural tab order (it is the body's SIBLING, not a
 *   descendant);
 * - activation (click / Enter / Space) calls `onSelect` with the item's id, and
 *   is SUPPRESSED when the composed path crosses the item's `menu` region
 *   (light-DOM `slot="menu"` content or the shadow `data-kai-item-menu`
 *   wrapper), so the consumer's own popover never also selects the row;
 * - ArrowUp/ArrowDown/Home/End move focus item-to-item, tabindex following the
 *   focused item.
 */
export function createConversationItemsController(
  opts: ConversationItemsControllerOptions,
): ConversationItemsController {
  const itemFromEvent = (e: Event): HTMLElement | undefined => {
    const items = opts.getItems();
    return e.composedPath().find((n): n is HTMLElement => items.includes(n as HTMLElement));
  };
  /** The item's ACTIVATION node — the target of role/aria-current/tabindex/
   *  focus. For a `kai-conversation-item` host that is its shadow body (the
   *  sibling restructure: the host is the row listitem
   *  wrapping the body AND the consumer's tabbable menu, so the control
   *  semantics must sit below it). A bare node with no such body is its own
   *  control. */
  const bodyOf = (item: HTMLElement): HTMLElement =>
    (item.shadowRoot?.querySelector('[data-kai-item-body]') as HTMLElement | null) ?? item;
  const menuInPath = (e: Event): boolean =>
    e.composedPath().some(
      (n) =>
        n instanceof Element &&
        (n.hasAttribute('data-kai-item-menu') || n.getAttribute('slot') === 'menu'),
    );
  // Write-on-change only. `setAttribute` records a mutation even when the value
  // is identical, and the facade re-syncs from a MutationObserver over these very
  // nodes — unconditional writes would feed the observer forever.
  const setAttr = (el: Element, name: string, value: string) => {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };
  /** An item whose shadow body has not RENDERED yet must not be stamped: the
   *  fallback would write control semantics onto the HOST, they would stick
   *  (the item facade defers to an authored role), and axe then sees exactly
   *  the role="button"-host-with-focusable-menu shape the restructure removed.
   *  Measured in the focus-order probe: the container's first sync can run
   *  before the item elements upgrade. A later sync catches them — the
   *  facade's own mount mutates host attributes, which re-runs sync through
   *  the container's MutationObserver read(). Bare nodes (no dash: the jsdom
   *  stand-ins) are always ready. */
  const readyBodies = (items: HTMLElement[]) => {
    const out = new Map<HTMLElement, HTMLElement>();
    for (const item of items) {
      const body = bodyOf(item);
      if (body === item && item.localName.includes('-')) continue;
      out.set(item, body);
    }
    return out;
  };

  const rove = (items: HTMLElement[], target: HTMLElement | undefined) => {
    for (const [item, body] of readyBodies(items)) setAttr(body, 'tabindex', item === target ? '0' : '-1');
  };

  const sync = () => {
    const items = opts.getItems();
    const activeId = opts.getActiveId();
    const bodies = readyBodies(items);
    let anchor: HTMLElement | undefined;
    for (const [item, body] of bodies) {
      const isActive = activeId !== undefined && readConversationItemId(item) === activeId;
      if (!body.hasAttribute('role')) body.setAttribute('role', 'button');
      setAttr(body, 'aria-current', isActive ? 'true' : 'false');
      const host = item as HTMLElement & { active?: boolean };
      if (host.active !== isActive) host.active = isActive;
      if (isActive) anchor = item;
    }
    rove(items, anchor ?? (bodies.keys().next().value as HTMLElement | undefined));
  };

  return {
    sync,
    handleClick(e) {
      const item = itemFromEvent(e);
      if (!item || menuInPath(e)) return;
      opts.onSelect(readConversationItemId(item));
    },
    handleKeyDown(e) {
      const items = opts.getItems();
      if (items.length === 0) return;
      const item = itemFromEvent(e);
      if (e.key === 'Enter' || e.key === ' ') {
        if (!item || menuInPath(e)) return;
        e.preventDefault();
        opts.onSelect(readConversationItemId(item));
        return;
      }
      let next: HTMLElement | undefined;
      const idx = item ? items.indexOf(item) : items.findIndex((i) => bodyOf(i).getAttribute('tabindex') === '0');
      if (e.key === 'ArrowDown') next = items[Math.min(idx + 1, items.length - 1)];
      else if (e.key === 'ArrowUp') next = items[Math.max(idx - 1, 0)];
      else if (e.key === 'Home') next = items[0];
      else if (e.key === 'End') next = items[items.length - 1];
      if (!next) return;
      e.preventDefault();
      rove(items, next);
      bodyOf(next).focus();
    },
  };
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
  /** Row density for the data rows: `default`, `compact` (same as the
   *  `compact` flag), or `panel`, the widget-panel presentation matching the
   *  facade panel's measured row box (P-7, blocks-and-parts design
   *  2026-08-31). An explicit density wins over `compact`. Item mode is
   *  unaffected: slotted rows carry their own density. */
  density?: ConversationRowDensity;
  /** Show the built-in search box (default `true`). Set `false` to hide it,
   *  e.g. a widget-box list where search earns no room (the facade's own
   *  `ConversationPanel` renders no search; 2026-08-31 composition spike,
   *  phase 3 round 2). Hidden, the imperative `focus()`/`clearSearch()`
   *  still exist but reach no input, and `onSearchChange` never fires. */
  searchable?: boolean;
  /** Fired whenever the built-in search box query changes (typing or a
   *  programmatic `clear()`). Lets the facade surface a `kai-search` event. */
  onSearchChange?: (query: string) => void;
  /** Receive the imperative controller once mounted. The `kai-conversations`
   *  facade uses it to focus / clear the internal search input. */
  controllerRef?: (controller: ConversationListController) => void;
  /** Item mode: your OWN rows, rendered inside a list region in place of the
   *  data rows. When set, the built-in search
   *  filter, grouping and empty/no-match states do not apply — the consumer's
   *  loop owns them — while the chrome (header, search box, new-chat, footer)
   *  still renders and `onSearchChange` still reports queries. The
   *  `kai-conversations` facade passes its default `<slot>` here when it detects
   *  `kai-conversation-item` children. */
  items?: JSX.Element;
  /** Keydown handler for the item-mode list region (the facade wires
   *  `createConversationItemsController.handleKeyDown`). */
  itemsKeyDown?: (e: KeyboardEvent) => void;
  /** Click handler for the item-mode list region (the facade wires
   *  `createConversationItemsController.handleClick`). */
  itemsClick?: (e: MouseEvent) => void;
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
  const [local] = splitProps(props, ['groups', 'conversations', 'activeId', 'onSelect', 'onNewChat', 'onToggleSidebar', 'header', 'footer', 'empty', 'compact', 'density', 'searchable', 'onSearchChange', 'controllerRef', 'items', 'itemsKeyDown', 'itemsClick', 'class']);
  const [searchQuery, setSearchQuery] = createSignal('');
  // Item mode: the consumer's own rows replace the data rendering wholesale.
  const itemMode = createMemo(() => local.items != null);
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

  /**
   * Everything that is NOT filed under a rendered group heading: no `groupId` at
   * all, OR a `groupId` that matches no entry in `groups`.
   *
   * The second half used to be dropped on the floor. `groups` drives the render
   * loop, so a conversation pointing at a group the consumer had not declared
   * (a stale id, a group removed from the array, a filtered/paginated `groups`
   * response) vanished from the sidebar with no error and no empty state — the
   * list just silently held fewer rows than the data it was given. Falling through
   * to "Ungrouped" keeps every conversation the consumer passed in reachable.
   */
  const ungrouped = createMemo(() => {
    const known = new Set((local.groups ?? []).map((g) => g.id));
    return filteredConversations().filter((c) => c.groupId == null || !known.has(c.groupId));
  });

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
      <Show when={local.searchable !== false && (itemMode() || !isEmpty())}>
        <div class="px-3 pb-2">
          <div class="flex items-center gap-2 rounded-md bg-surface-strong px-2.5 py-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-muted-foreground"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input ref={searchInput} type="text" value={searchQuery()} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="Search chats..."
              aria-label="Search chats"
              class="bg-transparent text-compact text-foreground placeholder:text-muted-foreground rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full" />
          </div>
        </div>
      </Show>
      {/* Item mode: the consumer's own rows in a list region. The container's
          filter/grouping/empty states do not apply — the consumer's loop owns
          them. */}
      <Show when={itemMode()}>
        <ScrollArea class="flex-1 px-2">
          <div
            role="list"
            aria-label="Conversations"
            part="items"
            class="space-y-0.5 py-1"
            onKeyDown={(e) => local.itemsKeyDown?.(e)}
            onClick={(e) => local.itemsClick?.(e)}
          >
            {local.items}
          </div>
        </ScrollArea>
      </Show>
      {/* list, or the empty state (replace) when there are no conversations. */}
      <Show
        when={!itemMode() && !isEmpty()}
        fallback={
          <Show when={!itemMode()}>
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
          </Show>
        }
      >
        {/* F-04, decide loudly: a query matching nothing renders a VISIBLE
            no-match state, keyed off the FILTERED count — distinct from the
            zero-conversations empty state above, which keys off the unfiltered
            list (and still owns the `empty` override). */}
        <Show when={filteredConversations().length === 0}>
          <div class="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
            No conversations match your search
          </div>
        </Show>
        <Show when={filteredConversations().length > 0}>
        <ScrollArea class="flex-1 px-2">
          <For each={local.groups}>
            {(group) => {
              const convs = createMemo(() => groupedConversations().get(group.id) ?? []);
              return (
                <Show when={convs().length > 0}>
                  <GroupSection name={group.name} count={convs().length} conversations={convs()} activeId={local.activeId} onSelect={local.onSelect} compact={local.compact} density={local.density} />
                </Show>
              );
            }}
          </For>
          <Show when={ungrouped().length > 0}>
            <Show
              when={local.compact}
              fallback={<GroupSection name="Ungrouped" count={ungrouped().length} conversations={ungrouped()} activeId={local.activeId} onSelect={local.onSelect} density={local.density} />}
            >
              <div class="space-y-0.5 py-1">
                <For each={ungrouped()}>
                  {(conv) => <ConversationItem conversation={conv} isActive={conv.id === local.activeId} onSelect={local.onSelect} compact density={local.density} />}
                </For>
              </div>
            </Show>
          </Show>
        </ScrollArea>
        </Show>
      </Show>
      {/* footer (inject): a row below the list (account / settings / …). */}
      <Show when={local.footer}>
        <div class="shrink-0 border-t border-border">{local.footer}</div>
      </Show>
    </div>
  );
}

function GroupSection(props: { name: string; count: number; conversations: ConversationSummary[]; activeId?: string; onSelect: (id: string) => void; compact?: boolean; density?: ConversationRowDensity }) {
  const [open, setOpen] = createSignal(true);
  return (
    <Collapsible open={open()} onOpenChange={setOpen}>
      <CollapsibleTrigger class="flex items-center gap-1.5 w-full px-1.5 py-1 rounded-md text-compact text-muted-foreground font-medium hover:bg-muted/30 transition-colors cursor-pointer mt-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class={cn('transition-transform', !open() && '-rotate-90')}><polyline points="6 9 12 15 18 9"/></svg>
        <span>{props.name}</span>
        <Badge variant="count" class="ml-auto text-caption">{props.count}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="pl-2 mt-0.5 space-y-0.5">
          <For each={props.conversations}>
            {(conv) => <ConversationItem conversation={conv} isActive={conv.id === props.activeId} onSelect={props.onSelect} compact={props.compact} density={props.density} />}
          </For>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
