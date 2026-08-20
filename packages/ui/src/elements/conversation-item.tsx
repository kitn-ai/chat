import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import { readSlots, CONVERSATION_ITEM_SLOTS } from './slots';
import { SlottedConversationItem } from '../components/conversation-item';

interface Props extends Record<string, unknown> {
  /** The row's identity, handed to the container's selection contract. In the
   *  element this is the `conversation-id` attribute (host `id` is the fallback). */
  conversationId?: string;
  /** Selected state. Reflected as `aria-selected` and a `data-active` styling
   *  hook on the row; the container drives it from its `activeId`. */
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
 * ARIA listbox/option relationship.
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

    // The HOST is the option: it is the node the container focuses and marks
    // selected, so the semantics live here (the inner row renders without them,
    // one option in the accessibility tree, not two). An authored role wins.
    if (!element.hasAttribute('role')) element.setAttribute('role', 'option');
  });

  // Property and attribute stay in agreement for `active`, and `aria-selected`
  // follows it, so a standalone item is honest to assistive tech even before a
  // container's controller takes over the bookkeeping.
  reflectFlag('active');
  createEffect(() => {
    element.setAttribute('aria-selected', flag('active') ? 'true' : 'false');
  });

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
