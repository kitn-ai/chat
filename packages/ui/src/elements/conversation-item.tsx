import { createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import { readSlots, CONVERSATION_ITEM_SLOTS } from './slots';
import { SlottedConversationItem, type ConversationRowDensity } from '../components/conversation-item';
import { isStandaloneConversationItem, readConversationItemId } from '../components/conversation-list';

interface Props extends Record<string, unknown> {
  /** The row's identity: the `conversation-id` attribute (host `id` is the
   *  fallback). Inside `<kai-conversations>` it is handed to the container's
   *  selection contract (`kai-conversation-select`); standalone it is the `id`
   *  in this element's own `kai-select` detail. */
  conversationId?: string;
  /** Selected state. Reflected as `aria-current` on the row body and a
   *  `data-active` styling hook on the row; inside a container the container
   *  drives it from its `activeId`, standalone you set it yourself. */
  active?: boolean;
  /** Dense single-line row padding. */
  compact?: boolean;
  /** Row density: `default`, `compact` (same as the `compact` flag), or
   *  `panel`, the widget-panel presentation matching the facade panel's
   *  measured row box (12px/10px padding, a 40px single-line row). Previously
   *  that box was a private interior class a composition could only
   *  approximate by smuggling padding through slotted spans (2026-08-31
   *  composition spike, phase 3 round 3). An explicit density wins over
   *  `compact`. */
  density?: ConversationRowDensity;
  /** Show the unread indicator dot at the row's trailing edge, inside the
   *  activation surface and before the `menu` region, with a screen-reader
   *  "Unread" label. Drive it from `isConversationUnread` (exported from the
   *  package root and from `dist/stores.js`). */
  unread?: boolean;
}

interface Events {
  /** STANDALONE activation only: the row was activated (click, Enter or Space on its body) while the item is NOT a
   *  direct child of `<kai-conversations>`. `id` is the row's identity: the
   *  `conversation-id` attribute, else the host `id`. Inside a container this
   *  never fires: activation surfaces once, as `kai-conversation-select` on the
   *  container. */
  'kai-select': { id: string };
}

/**
 * `<kai-conversation-item>` — one composed row of a consumer-owned conversation
 * loop. Two placements, one activation event each:
 *
 * SLOTTED into `<kai-conversations>`' light DOM (a direct child): the consumer
 * owns the loop (framework-native `map`, `<For>`, `v-for`); the container
 * detects these children, skips its data rendering, and runs the parent-item
 * contract over them — selection state flowing container to item, roving
 * tabindex, arrow-key traversal, and the accessible list/row relationship
 * (list rows with button bodies and `aria-current` marking the active one;
 * axe's nested-interactive and aria-required-children
 * rules are why this is not listbox/option). Activation (click, Enter, Space)
 * surfaces as `kai-conversation-select` on the container, and the item itself
 * fires nothing — no double event.
 *
 * STANDALONE (anywhere else — a hand-composed rail, or wrapped in another
 * element even inside a container, since the container manages only direct
 * children): the row activates ITSELF.
 * Its shadow body is a tabbable `role="button"`, and click / Enter / Space
 * fire `kai-select` on this element with `{ id }` — non-bubbling, like every
 * `kai-*` event, so listen on the item itself. What a standalone row does NOT
 * have is the container's LIST story: roving tabindex across rows, arrow-key
 * traversal, and the shared `role="list"` relationship — each standalone row
 * is an ordinary tab stop, and a hand-composed rail brings its own list
 * semantics (or slots the rows into `<kai-conversations>` and gets them for
 * free).
 *
 * Slots: the default slot is the title; `leading`, `meta` and `menu` are the
 * named regions. The `menu` slot takes your OWN popover (rename, fork, archive
 * live there); the element provides only the region plus focus and ARIA
 * plumbing, never a declarative actions prop, and a click inside it never
 * selects the row — in either placement.
 */
defineWebComponent<Props, Events>('kai-conversation-item', {
  conversationId: undefined,
  active: undefined,
  compact: undefined,
  density: undefined,
  unread: undefined,
}, (props, { element, flag, reflectFlag, dispatch }) => {
  // Which named regions the consumer has filled; drives the conditional
  // wrappers so an empty region leaves no stray box behind.
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  // Standalone vs container-managed, decided at mount (an item is not
  // reparented in practice; the activation handler re-checks at event time so
  // a row moved INTO a container can never double-fire).
  const [standalone, setStandalone] = createSignal(false);
  onMount(() => {
    const read = () => setSlots(readSlots(element, CONVERSATION_ITEM_SLOTS));
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());

    // The HOST is the row LISTITEM:
    // it wraps the activation body AND the consumer's tabbable menu, so it must
    // never be the activation control itself — axe nested-interactive bans
    // focusable descendants of a control. The button role, aria-current and the
    // tabindex live on the shadow BODY (`data-kai-item-body`): inside a
    // container its controller stamps them; standalone the component renders
    // them itself. An authored role wins.
    if (!element.hasAttribute('role')) element.setAttribute('role', 'listitem');

    setStandalone(isStandaloneConversationItem(element));
  });

  // Standalone activation → the per-item `kai-select` event. The re-check at
  // event time keeps this dead the moment the item becomes a container's direct
  // child, so the container's `kai-conversation-select` stays the only event.
  const activate = () => {
    if (!isStandaloneConversationItem(element)) return;
    dispatch('kai-select', { id: readConversationItemId(element) });
  };

  // Property and attribute stay in agreement for `active`; the body's
  // aria-current follows it reactively (nothing is written to the host).
  reflectFlag('active');

  return (
    <SlottedConversationItem
      conversationId={props.conversationId as string | undefined}
      active={flag('active')}
      compact={flag('compact')}
      density={props.density as ConversationRowDensity | undefined}
      unread={flag('unread')}
      hostSemantics
      onActivate={standalone() ? activate : undefined}
      leading={slots().leading ? <slot name="leading" /> : undefined}
      meta={slots().meta ? <slot name="meta" /> : undefined}
      menu={slots().menu ? <slot name="menu" /> : undefined}
    >
      <slot />
    </SlottedConversationItem>
  );
});
