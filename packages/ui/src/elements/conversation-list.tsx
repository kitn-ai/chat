import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { defineWebComponent } from './define';
import { createControllableSignal } from '../primitives/controllable';
import { readSlots, CONVERSATIONS_SLOTS } from './slots';
import {
  ConversationList, CollapsedRail, createConversationItemsController,
  type ConversationListController,
} from '../components/conversation-list';
import type { ConversationGroup, ConversationSummary } from '../types';

interface Props extends Record<string, unknown> {
  /** The list's section headers (`{ id, name, sortOrder, createdAt }`), rendered
   *  in array order. A group carries no conversations of its own; it is matched
   *  against `conversations` by id, so the two props are complementary rather
   *  than alternatives. Omit for an ungrouped list. Set as a JS property. */
  groups?: ConversationGroup[];
  /** Every conversation the list renders, flat. Each one is filed under the group
   *  whose `id` equals its `groupId`; one with no `groupId`, or with a `groupId`
   *  matching no entry in `groups`, falls into a trailing "Ungrouped" section, so
   *  nothing you pass in is ever dropped. There is no recency bucketing. Set as a
   *  JS property. Omit to supply them as `<kai-conversation>` light-DOM children
   *  instead, or for the empty state. A search query that matches nothing shows a
   *  visible "No conversations match your search" state, distinct from the
   *  zero-conversations empty state. Slotted `<kai-conversation-item>` children
   *  switch the list into item mode instead: your own rows win and this array is
   *  not rendered. */
  conversations?: ConversationSummary[];
  /** The id of the currently-open conversation, highlighted in the list. */
  activeId?: string;
  /** Controlled collapsed state. Set as a JS property (`el.collapsed = true`) to
   *  drive the rail from your app, updating it in response to `kai-collapse-toggle`.
   *  Omit for uncontrolled (the element manages it). Collapsed shrinks the rail to
   *  a floating reopen button. */
  collapsed?: boolean;
  /** Initial collapsed state when uncontrolled (default false). Use the
   *  `default-collapsed` attribute to start collapsed in plain HTML. */
  defaultCollapsed?: boolean;
  /** Dense single-line rows (a leading dot + title, no message count). */
  compact?: boolean;
}

interface Events {
  /** A conversation was selected. The selection event in BOTH modes: a
   *  batteries data row, or an activated `<kai-conversation-item>` child
   *  (click, Enter or Space). */
  'kai-conversation-select': { id: string };
  /** The "New chat" button was clicked. */
  'kai-new-chat': Record<string, never>;
  /** The sidebar toggle was clicked. */
  'kai-toggle-sidebar': Record<string, never>;
  /** The rail was collapsed or expanded (via the toggle, the reopen button, or a
   *  `collapse()`/`expand()`/`toggle()` call). */
  'kai-collapse-toggle': { collapsed: boolean };
  /** The built-in search box query changed (typing, or a programmatic `clear()`
   *  which fires it with `''`). Lets a consumer mirror or server-side the filter. */
  'kai-search': { query: string };
}

/** Parse a single light-DOM `<kai-conversation>` element into a `ConversationSummary`.
 *  Attribute mapping:
 *   - `id`       → ConversationSummary.id
 *   - `group-id` → ConversationSummary.groupId (optional)
 *   - textContent → ConversationSummary.title
 *  Fields not expressible as HTML attributes are NOT fabricated (F-10): the
 *  optional `scope` and `lastMessageAt` stay absent, and the required
 *  `messageCount`/`updatedAt` get honest defaults — zero messages, and an empty
 *  `updatedAt` from which no trailing relative time is derived (the epoch it
 *  used to fabricate rendered a bogus "many days ago" on every declarative row).
 */
export function parseKaiConversationElement(n: Element): ConversationSummary {
  return {
    id: n.getAttribute('id') ?? '',
    title: n.textContent?.trim() ?? '',
    groupId: n.getAttribute('group-id') ?? undefined,
    messageCount: 0,
    updatedAt: '',
  };
}

defineWebComponent<Props, Events>('kai-conversations', {
  groups: [],
  conversations: [],
  activeId: undefined,
  collapsed: undefined,
  defaultCollapsed: undefined,
  compact: undefined,
}, (props, { dispatch, element, expose, flag }) => {
  // Read declarative <kai-conversation> children from light DOM.
  // Shadow DOM with no <slot> suppresses them visually — they're invisible data carriers.
  const [slottedConversations, setSlottedConversations] = createSignal<ConversationSummary[]>([]);
  // Item mode (spec 2026-08-20 § 2a): light-DOM <kai-conversation-item> children
  // mean the CONSUMER owns the loop — the container skips its data rendering and
  // runs the parent-item contract over the hosts instead.
  const [itemHosts, setItemHosts] = createSignal<HTMLElement[]>([]);
  // Which composition slots (header/empty/footer) the consumer has filled.
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  onMount(() => {
    const read = () => {
      const nodes = [...element.querySelectorAll('kai-conversation')];
      setSlottedConversations(nodes.map(parseKaiConversationElement));
      // Reference-stable: a fresh array every observer tick would re-run the
      // sync effect (whose writes the observer sees) in a feedback loop.
      const hosts = [...element.querySelectorAll<HTMLElement>(':scope > kai-conversation-item')];
      setItemHosts((prev) =>
        prev.length === hosts.length && hosts.every((h, i) => h === prev[i]) ? prev : hosts,
      );
      setSlots(readSlots(element, CONVERSATIONS_SLOTS));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });

  const itemMode = () => itemHosts().length > 0;

  // Prop conversations take precedence; slotted children are appended after.
  const allConversations = () => [...(props.conversations ?? []), ...slottedConversations()];

  // The parent-item contract: selection flowing container→item, roving tabindex,
  // ARIA listbox/option — pure DOM, host-agnostic (see the controller's JSDoc in
  // components/conversation-list.tsx). Solid context cannot cross the element
  // boundary, so the channel is DOM traversal by construction.
  const itemsController = createConversationItemsController({
    getItems: itemHosts,
    getActiveId: () => props.activeId as string | undefined,
    onSelect: (id) => dispatch('kai-conversation-select', { id }),
  });
  // Re-derive the bookkeeping whenever the children change (the MutationObserver
  // and the shadow slot's slotchange both funnel into itemHosts) or activeId moves.
  createEffect(() => {
    if (itemMode()) itemsController.sync();
  });

  // ── Rail collapse (controlled/uncontrolled, same pattern as kai-workspace) ──
  // `collapsed` (when set) wins; otherwise the element manages its own state,
  // seeded from `defaultCollapsed`. `setCollapsedTo` always writes the internal
  // value (a no-op visually while controlled) and emits `kai-collapse-toggle` so
  // a controlling app can update its own state. Collapsed → the shared
  // CollapsedRail (the same floating reopen button kai-workspace renders).
  const [collapsed, setCollapsed] = createControllableSignal(
    () => props.collapsed as boolean | undefined,
    flag('defaultCollapsed'),
  );
  const setCollapsedTo = (next: boolean) => { setCollapsed(next); dispatch('kai-collapse-toggle', { collapsed: next }); };

  // ── Imperative API (instance methods on the host) ──────────────────────────
  // The search box's query lives inside ConversationList; we capture its
  // controller (Pattern C) to focus / clear it from the facade.
  let controller: ConversationListController | undefined;
  expose({
    /** Focus the built-in search input inside the shadow root. */
    focus: (options?: FocusOptions) => {
      // Prefer the captured controller; fall back to a shadow query (the search
      // box only renders when there are conversations).
      if (controller) controller.focus(options);
      else element.shadowRoot?.querySelector<HTMLInputElement>('input')?.focus(options);
    },
    /** Clear the internal search query (resets the list filter) and fire
     *  kai-search with an empty string. */
    clear: () => controller?.clearSearch(),
    /** Programmatically select a conversation by id. The mirror of the
     *  kai-conversation-select event (a convenience over driving `activeId`). */
    select: (id: string) => dispatch('kai-conversation-select', { id }),
    /** Collapse the rail to its floating reopen button (fires `kai-collapse-toggle`). */
    collapse: () => setCollapsedTo(true),
    /** Expand the rail back to the full list (fires `kai-collapse-toggle`). */
    expand: () => setCollapsedTo(false),
    /** Toggle the rail collapsed/expanded (fires `kai-collapse-toggle`). */
    toggle: () => setCollapsedTo(!collapsed()),
  });

  return (
    <Show
      when={!collapsed()}
      fallback={<CollapsedRail onExpand={() => setCollapsedTo(false)} />}
    >
      <ConversationList
        groups={props.groups ?? []}
        conversations={allConversations()}
        activeId={props.activeId}
        onSelect={(id) => dispatch('kai-conversation-select', { id })}
        onNewChat={() => dispatch('kai-new-chat')}
        onToggleSidebar={() => { dispatch('kai-toggle-sidebar'); setCollapsedTo(true); }}
        compact={flag('compact')}
        onSearchChange={(query) => dispatch('kai-search', { query })}
        controllerRef={(c) => (controller = c)}
        items={itemMode() ? <slot /> : undefined}
        itemsKeyDown={itemsController.handleKeyDown}
        itemsClick={itemsController.handleClick}
        header={slots().header ? <slot name="header" /> : undefined}
        footer={slots().footer ? <slot name="footer" /> : undefined}
        empty={slots().empty ? <slot name="empty" /> : undefined}
      />
    </Show>
  );
});
