import { createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import { readSlots, ROW_SLOTS } from './slots';
import { Row } from '../components/row';

interface Props extends Record<string, unknown> {
  /** Pressable row: renders real button semantics (click, Enter, Space) and
   *  fires `kai-click` on activation. Ignored when `href` is set. */
  interactive?: boolean;
  /** Navigate on press: the row renders as a real anchor opening in a new tab.
   *  An href outside the kit's safe URL schemes renders a plain
   *  non-interactive row instead (label visible, nothing clickable). */
  href?: string;
  /** Show a trailing chevron affordance at the row's end. */
  chevron?: boolean;
}

interface Events {
  /** The row was activated (click, Enter or Space) while `interactive` is set
   *  and no `href` is present. Non-bubbling: listen on the element itself. */
  'kai-click': void;
}

/**
 * `<kai-row>`: the generic mobile list row (P-4, blocks-and-parts design
 * 2026-08-31): leading region, title with optional subtitle, trailing region,
 * optional chevron affordance. The one anatomy behind the widget home tab's
 * three rows (recent conversation with a timestamp, CTA with a trailing
 * arrow, help link with a leading icon and chevron) and every settings screen
 * a block grows; nothing in it is chat-specific.
 *
 * Interaction, one of three: `href` set and safe, a real anchor (new tab);
 * `interactive` set, a real `<button>` firing `kai-click`; neither, a plain
 * display row. An unsafe `href` (scheme outside the kit's URL policy) renders
 * the non-interactive row: label visible, no anchor, no event.
 */
defineWebComponent<Props, Events>('kai-row', {
  interactive: undefined,
  href: undefined,
  chevron: undefined,
}, (props, { element, flag, dispatch }) => {
  // Which named regions the consumer has filled; drives the conditional
  // wrappers so an empty region leaves no stray box behind.
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  onMount(() => {
    const read = () => setSlots(readSlots(element, ROW_SLOTS));
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });

  return (
    <Row
      href={props.href as string | undefined}
      chevron={flag('chevron')}
      onActivate={flag('interactive') ? () => dispatch('kai-click') : undefined}
      leading={slots().leading ? <slot name="leading" /> : undefined}
      subtitle={slots().subtitle ? <slot name="subtitle" /> : undefined}
      trailing={slots().trailing ? <slot name="trailing" /> : undefined}
    >
      <slot />
    </Row>
  );
});
