import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { defineWebComponent } from './define';
import { createControllableSignal } from '../primitives/controllable';
import { readSlots, CONVERSATIONS_SLOTS } from './slots';
import { ConversationList, CollapsedRail, type ConversationListController } from '../components/conversation-list';
import type { ConversationGroup, ConversationSummary, ConversationScope } from '../types';

interface Props extends Record<string, unknown> {
  /** The list's section headers (`{ id, name, sortOrder, createdAt }`), rendered
   *  in array order. A group carries no conversations of its own; it is matched
   *  against `conversations` by id, so the two props are complementary rather
   *  than alternatives. Omit for an ungrouped list. Set as a JS property. */
  groups?: ConversationGroup[];
  /** Every conversation the list renders, flat. Each one is filed under the group
   *  whose `id` equals its `groupId`; one with no `groupId` — or with a `groupId`
   *  matching no entry in `groups` — falls into a trailing "Ungrouped" section, so
   *  nothing you pass in is ever dropped. There is no recency bucketing. Set as a
   *  JS property. Omit to supply them as `<kai-conversation>` light-DOM children
   *  instead, or for the empty state. */
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
}

interface Events {
  /** A conversation was selected. */
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
 *  Required fields not expressible as HTML attributes (`scope`, `messageCount`,
 *  `lastMessageAt`, `updatedAt`) receive safe defaults so the rendered list item
 *  is fully functional with just `id` + title text.
 */
export function parseKaiConversationElement(n: Element): ConversationSummary {
  return {
    id: n.getAttribute('id') ?? '',
    title: n.textContent?.trim() ?? '',
    groupId: n.getAttribute('group-id') ?? undefined,
    scope: { type: 'collection' } as ConversationScope,
    messageCount: 0,
    lastMessageAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

defineWebComponent<Props, Events>('kai-conversations', {
  groups: [],
  conversations: [],
  activeId: undefined,
  collapsed: undefined,
  defaultCollapsed: undefined,
}, (props, { dispatch, element, expose, flag }) => {
  // Read declarative <kai-conversation> children from light DOM.
  // Shadow DOM with no <slot> suppresses them visually — they're invisible data carriers.
  const [slottedConversations, setSlottedConversations] = createSignal<ConversationSummary[]>([]);
  // Which composition slots (header/empty/footer) the consumer has filled.
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  onMount(() => {
    const read = () => {
      const nodes = [...element.querySelectorAll('kai-conversation')];
      setSlottedConversations(nodes.map(parseKaiConversationElement));
      setSlots(readSlots(element, CONVERSATIONS_SLOTS));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });

  // Prop conversations take precedence; slotted children are appended after.
  const allConversations = () => [...(props.conversations ?? []), ...slottedConversations()];

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
    /** Programmatically select a conversation by id — mirror of the
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
        onSearchChange={(query) => dispatch('kai-search', { query })}
        controllerRef={(c) => (controller = c)}
        header={slots().header ? <slot name="header" /> : undefined}
        footer={slots().footer ? <slot name="footer" /> : undefined}
        empty={slots().empty ? <slot name="empty" /> : undefined}
      />
    </Show>
  );
});
