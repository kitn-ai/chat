import { createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import { readSlots, CONVERSATION_ITEM_SLOTS } from './slots';
import { SlottedConversationItem } from '../components/conversation-item';

interface Props extends Record<string, unknown> {
  /** The row's identity, handed to the container's selection contract. In the
   *  element this is the `conversation-id` attribute (host `id` is the fallback). */
  conversationId?: string;
  /** Selected state. Reflected as `aria-current` on the row body and a
   *  `data-active` styling hook on the row; the container drives it from its
   *  `activeId`. */
  active?: boolean;
  /** Dense single-line row padding. */
  compact?: boolean;
}

/**
 * `<kai-conversation-item>` — one composed row of a consumer-owned conversation
 * loop, slotted into `<kai-conversations>`' light DOM. The consumer owns the
 * loop (framework-native `map`, `<For>`, `v-for`); the container detects these
 * children, skips its data rendering, and runs the parent-item contract over
 * them: selection state flowing container to item, roving tabindex, and the
 * accessible list/row relationship (list rows with button bodies and
 * `aria-current` marking the active one; ratified 2026-08-20 — axe's
 * nested-interactive and aria-required-children rules are why this is not
 * listbox/option).
 *
 * Slots: the default slot is the title; `leading`, `meta` and `menu` are the
 * named regions. The `menu` slot takes your OWN popover (rename, fork, archive
 * live there); the element provides only the region plus focus and ARIA
 * plumbing, never a declarative actions prop, and a click inside it never
 * selects the row.
 *
 * The item is presentational on its own: activation (click, Enter, Space)
 * surfaces as `kai-conversation-select` on the surrounding `<kai-conversations>`,
 * never as an event of this element.
 */
defineWebComponent<Props>('kai-conversation-item', {
  conversationId: undefined,
  active: undefined,
  compact: undefined,
}, (props, { element, flag, reflectFlag }) => {
  // Which named regions the consumer has filled; drives the conditional
  // wrappers so an empty region leaves no stray box behind.
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  onMount(() => {
    const read = () => setSlots(readSlots(element, CONVERSATION_ITEM_SLOTS));
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());

    // The HOST is the row LISTITEM (sibling restructure, ratified 2026-08-20):
    // it wraps the activation body AND the consumer's tabbable menu, so it must
    // never be the activation control itself — axe nested-interactive bans
    // focusable descendants of a control. The button role, aria-current and the
    // roving tabindex live on the shadow BODY (`data-kai-item-body`), which the
    // container's controller targets. An authored role wins.
    if (!element.hasAttribute('role')) element.setAttribute('role', 'listitem');
  });

  // Property and attribute stay in agreement for `active`; the body's
  // aria-current follows it reactively (nothing is written to the host).
  reflectFlag('active');

  return (
    <SlottedConversationItem
      conversationId={props.conversationId as string | undefined}
      active={flag('active')}
      compact={flag('compact')}
      hostSemantics
      leading={slots().leading ? <slot name="leading" /> : undefined}
      meta={slots().meta ? <slot name="meta" /> : undefined}
      menu={slots().menu ? <slot name="menu" /> : undefined}
    >
      <slot />
    </SlottedConversationItem>
  );
});
