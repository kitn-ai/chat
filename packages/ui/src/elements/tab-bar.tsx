import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import {
  TAB_BAR_CLASS,
  createTabBarItemsController,
  isTabBarItemDisabled,
  readTabBarItemValue,
} from '../components/tab-bar';
import { cn } from '../utils/cn';

interface Props extends Record<string, unknown> {
  /** Controlled selected value. Set the property or the `value` attribute and
   *  drive it from your app in response to `kai-tab-change`. Omit for
   *  uncontrolled: the bar manages its own selection, seeded from
   *  `defaultValue`, else the first enabled tab. */
  value?: string;
  /** Initial selected value when uncontrolled (the `default-value` attribute
   *  in plain HTML). */
  defaultValue?: string;
  /** Icon-only mode: every tab hides its label visually. The slotted labels
   *  still name the tabs for assistive tech. */
  iconOnly?: boolean;
  /** Accessible name for the tablist (default "Navigation"). */
  label?: string;
}

interface Events {
  /** A tab was selected (click, Enter/Space, or arrow-key move). `value` is
   *  the item's `value` attribute, else its host `id`. */
  'kai-tab-change': { value: string };
}

/**
 * `<kai-tab-bar>`, bottom-navigation chrome: equal-width icon-over-label tabs
 * (or icon-only) with per-tab unread dot / count badge, the shape the widget
 * facade's Home/Messages bar renders. Compose it from `<kai-tab-bar-item>`
 * children; the bar owns selection state, real `tablist`/`tab` semantics,
 * roving tabindex and arrow-key traversal over them, and emits
 * `kai-tab-change` (non-bubbling: listen on this element).
 *
 * This is navigation chrome, a different component from `<kai-tabs>` (a
 * content tab strip / segmented control), per ruling P-2.
 *
 * ```html
 * <kai-tab-bar value="home">
 *   <kai-tab-bar-item value="home" icon="home">Home</kai-tab-bar-item>
 *   <kai-tab-bar-item value="messages" icon="message-square" dot>Messages</kai-tab-bar-item>
 * </kai-tab-bar>
 * <script>
 *   document.querySelector('kai-tab-bar')
 *     .addEventListener('kai-tab-change', (e) => console.log(e.detail.value));
 * </script>
 * ```
 */
defineWebComponent<Props, Events>('kai-tab-bar', {
  value: undefined,
  defaultValue: undefined,
  iconOnly: undefined,
  label: undefined,
}, (props, { element, dispatch, expose, flag }) => {
  // The slotted <kai-tab-bar-item> hosts, reference-stable (a fresh array every
  // observer tick would re-run the sync effect, whose writes the observer sees,
  // in a feedback loop).
  const [itemHosts, setItemHosts] = createSignal<HTMLElement[]>([]);
  onMount(() => {
    const read = () => {
      const hosts = [...element.querySelectorAll<HTMLElement>(':scope > kai-tab-bar-item')];
      setItemHosts((prev) =>
        prev.length === hosts.length && hosts.every((h, i) => h === prev[i]) ? prev : hosts,
      );
      // Re-sync on EVERY mutation, not only membership changes: an item host
      // that upgrades after the first sync mutates its own attributes (its
      // facade's mount), which lands here, and its shadow body needs stamping
      // even though the hosts array is reference-stable. sync() writes
      // on-change only, so this cannot feed the observer a loop.
      if (hosts.length) controller.sync();
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });

  // Controlled/uncontrolled selection: `value` (when set) wins; otherwise the
  // bar manages its own, seeded from `defaultValue`. With neither set the
  // first enabled tab is active, so an uncontrolled bar never renders with
  // nothing selected. `setValueTo` always writes the internal value (a no-op
  // visually while controlled) and emits `kai-tab-change` so a controlling
  // app can update its own state.
  const [internal, setInternal] = createSignal(props.defaultValue as string | undefined);
  const firstEnabledValue = () => {
    const first = itemHosts().find((it) => !isTabBarItemDisabled(it));
    return first ? readTabBarItemValue(first) : undefined;
  };
  const value = () =>
    (props.value as string | undefined) ?? internal() ?? firstEnabledValue();
  const setValueTo = (next: string) => {
    setInternal(next);
    dispatch('kai-tab-change', { value: next });
  };

  // The parent-item contract: selection flowing bar to item, roving tabindex,
  // tab/aria-selected bookkeeping. Pure DOM and host-agnostic (see the
  // controller's JSDoc in components/tab-bar.tsx): Solid context cannot cross
  // the element boundary, so the channel is DOM traversal by construction.
  const controller = createTabBarItemsController({
    getItems: itemHosts,
    getValue: value,
    getIconOnly: () => flag('iconOnly'),
    onSelect: setValueTo,
  });
  // Re-derive the bookkeeping whenever the children, the selection, or the
  // icon-only mode change.
  createEffect(() => {
    if (itemHosts().length) controller.sync();
  });

  expose({
    /** Select a tab by value (fires `kai-tab-change`). Ignores unknown and
     *  disabled values. */
    select: (next: string) => {
      const item = itemHosts().find((it) => readTabBarItemValue(it) === next);
      if (!item || isTabBarItemDisabled(item)) return;
      setValueTo(next);
    },
    /** Focus the active tab (or the first focusable tab). */
    focus: () => {
      for (const item of itemHosts()) {
        const body = item.shadowRoot?.querySelector<HTMLElement>('[data-kai-tab-body][tabindex="0"]');
        if (body) { body.focus(); return; }
      }
    },
  });

  return (
    <nav
      role="tablist"
      part="tablist"
      aria-label={(props.label as string | undefined) ?? 'Navigation'}
      class={cn(TAB_BAR_CLASS, 'w-full')}
      onClick={(e: MouseEvent) => controller.handleClick(e)}
      onKeyDown={(e: KeyboardEvent) => controller.handleKeyDown(e)}
    >
      <slot />
    </nav>
  );
});
