import { createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import {
  TabBarItemContent,
  tabBarTabClass,
  tabBarItemAccessibleName,
} from '../components/tab-bar';

interface Props extends Record<string, unknown> {
  /** The tab's identity: the `value` attribute (host `id` is the fallback).
   *  It is the `value` in the bar's `kai-tab-change` detail. */
  value?: string;
  /** Named icon from the kit roster (e.g. "home", "message-square"). The icon
   *  renders at the element's own default size, so equal glyphs across tabs
   *  need no consumer sizing. */
  icon?: string;
  /** Unread dot on the icon's corner. Reaches the tab's accessible name too:
   *  a dot alone is invisible to assistive tech. */
  dot?: boolean;
  /** Count badge on the icon's corner; wins over `dot` when both are set.
   *  Reaches the accessible name too. */
  badge?: string | number;
  /** Disabled tabs are skipped by arrow keys and cannot be selected. */
  disabled?: boolean;
  /** Selected state. Inside `<kai-tab-bar>` the bar drives it from its
   *  `value`; the active tab retints with the primary token. */
  active?: boolean;
  /** Hide the label visually (the slotted text still names the tab for
   *  assistive tech). Inside `<kai-tab-bar>` the bar drives it from its own
   *  `icon-only` attribute. */
  iconOnly?: boolean;
}

/**
 * `<kai-tab-bar-item>`, one tab of a `<kai-tab-bar>`: an icon-over-label
 * column (or icon-only) with an optional unread dot or count badge on the
 * icon's corner. The default slot is the label text.
 *
 * ```html
 * <kai-tab-bar value="home">
 *   <kai-tab-bar-item value="home" icon="home">Home</kai-tab-bar-item>
 *   <kai-tab-bar-item value="messages" icon="message-square" dot>Messages</kai-tab-bar-item>
 * </kai-tab-bar>
 * ```
 *
 * Slotted into `<kai-tab-bar>` (a direct child), the bar runs the parent-item
 * contract: selection state flows bar to item (`active`, `aria-selected`),
 * roving tabindex and arrow-key traversal live on the bar, and activation
 * surfaces once, as `kai-tab-change` on the bar. The item itself fires no
 * event of its own; outside a bar it renders inert (tab chrome has no
 * standalone activation story).
 */
defineWebComponent<Props>('kai-tab-bar-item', {
  value: undefined,
  icon: undefined,
  dot: undefined,
  badge: undefined,
  disabled: undefined,
  active: undefined,
  iconOnly: undefined,
}, (props, { element, flag, reflectFlag }) => {
  // The slotted label text feeds the accessible name (which appends the
  // dot/badge state); the visible label renders through the slot itself.
  const [text, setText] = createSignal('');
  onMount(() => {
    const read = () => setText(element.textContent?.trim() ?? '');
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    onCleanup(() => observer.disconnect());
    // The HOST is presentational: the tab semantics (role="tab",
    // aria-selected, roving tabindex) live on the shadow body button, stamped
    // by the bar's controller. An authored role wins.
    if (!element.hasAttribute('role')) element.setAttribute('role', 'presentation');
  });

  // Property and attribute stay in agreement for the styling hooks.
  reflectFlag('active');
  reflectFlag('disabled');

  return (
    <>
      {/* The host must stretch as one equal-width column of the bar's row. */}
      <style>{':host{display:flex;flex:1 1 0%;align-items:stretch;min-width:0}'}</style>
      <button
        type="button"
        data-kai-tab-body
        part="tab"
        tabindex="-1"
        disabled={flag('disabled')}
        data-active={flag('active') ? '' : undefined}
        aria-label={tabBarItemAccessibleName(text(), {
          dot: flag('dot'),
          badge: props.badge as string | number | undefined,
        })}
        class={tabBarTabClass(flag('active'))}
      >
        <TabBarItemContent
          icon={props.icon as string | undefined}
          dot={flag('dot')}
          badge={props.badge as string | number | undefined}
          iconOnly={flag('iconOnly')}
          label={<slot />}
        />
      </button>
    </>
  );
});
