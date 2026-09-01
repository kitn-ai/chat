import { For, Show, splitProps, type JSX } from 'solid-js';
import { cn } from '../utils/cn';
import { renderIcon } from '../ui/icon';

/**
 * One tab in a `TabBar` (data-driven mode). `id` is the selected `value`
 * throughout, mirroring `KaiTabItem` in ui/tabs.
 */
export interface TabBarItem {
  /** Stable id, emitted as the selected `value`. */
  id: string;
  /** Named icon from the kit roster (e.g. "home", "message-square"). */
  icon?: string;
  /** Visible label under the icon; also the tab's accessible name. */
  label?: string;
  /** Unread dot on the icon's corner. Reaches the accessible name too
   *  (a dot alone is invisible to assistive tech, the #336 lesson). */
  dot?: boolean;
  /** Count badge on the icon's corner; wins over `dot` when both are set.
   *  Reaches the accessible name too. */
  badge?: string | number;
  disabled?: boolean;
}

/** The bar container utilities: the facade's `WidgetTabBar` chrome, exactly
 *  (Intercom-pattern bottom navigation, h-14, top border, kit background). */
export const TAB_BAR_CLASS = 'flex h-14 shrink-0 items-stretch border-t border-border bg-background';

/** Per-tab utilities, given whether the tab is active. Matches the facade's
 *  `WidgetTabBar`: an icon-over-label column, `text-primary` when active (so
 *  the active tab retints with `--kai-color-primary`), muted otherwise. */
export function tabBarTabClass(active: boolean): string {
  return cn(
    'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
  );
}

/**
 * Compose a tab's accessible name from its label and its badge/dot state, so
 * the unread signal reaches assistive tech and not only the visible corner
 * mark (the #336 lesson: `aria-label` carries what the dot shows). A count
 * badge appends the count; a dot appends "(unread)".
 */
export function tabBarItemAccessibleName(
  label: string,
  opts: { dot?: boolean; badge?: string | number } = {},
): string {
  if (opts.badge !== undefined && opts.badge !== '') return `${label} (${opts.badge})`;
  if (opts.dot) return `${label} (unread)`;
  return label;
}

/**
 * The interior of one tab: the icon (the element's own default size, `size-5`,
 * so equal glyphs need no consumer sizing), the badge or unread dot on its
 * corner, and the label below unless `iconOnly`. Shared by the data-driven
 * `TabBar` and the `kai-tab-bar-item` facade (which slots its light-DOM text
 * in as `label`).
 */
export interface TabBarItemContentProps {
  icon?: string;
  dot?: boolean;
  badge?: string | number;
  iconOnly?: boolean;
  label?: JSX.Element;
}

export function TabBarItemContent(props: TabBarItemContentProps) {
  const showBadge = () => props.badge !== undefined && props.badge !== '';
  return (
    <>
      <span class="relative">
        {renderIcon(props.icon, { class: 'size-5' })}
        <Show
          when={showBadge()}
          fallback={
            <Show when={props.dot}>
              {/* Both marker names on the one dot: `data-kai-tab-dot` is this
                  part's own hook; `data-kai-tab-unread` is the facade's
                  established name for the same mark (the kai-chat widget tab
                  bar renders through this component, P-9), kept so existing
                  consumers and tests keep resolving it. */}
              <span
                data-kai-tab-dot
                data-kai-tab-unread
                aria-hidden="true"
                class="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-unread"
              />
            </Show>
          }
        >
          <span
            data-kai-tab-badge
            aria-hidden="true"
            class="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-unread px-1 text-caption font-medium leading-none text-white"
          >
            {props.badge}
          </span>
        </Show>
      </span>
      <Show when={!props.iconOnly}>
        <span>{props.label}</span>
      </Show>
    </>
  );
}

export interface TabBarProps extends Omit<JSX.HTMLAttributes<HTMLElement>, 'onChange'> {
  items?: TabBarItem[];
  /** Selected item id. */
  value?: string;
  /** Hide the labels visually; each label still names its tab for assistive
   *  tech (via `aria-label`). */
  iconOnly?: boolean;
  /** Accessible name for the tablist (default "Navigation"). */
  label?: string;
  /** Fired with the newly-selected item's id. */
  onChange?: (value: string) => void;
  /** Capture the tablist node (so a facade's `focus()` can target the active tab). */
  ref?: (el: HTMLElement) => void;
}

/**
 * Bottom-navigation tab bar: icon-over-label columns (or icon-only), an
 * optional unread dot or count badge per tab, equal-width tabs filling the
 * row. This is navigation chrome, a different component from the `Tabs`
 * strip (content tabs / segmented control), per ruling P-2: `kai-tabs` could
 * not express icon-over-label, icon-only, or a per-item badge.
 *
 * Same a11y idiom as `Tabs`: real `tablist`/`tab` roles, roving tabindex,
 * Arrow/Home/End keyboard nav with selection following focus, disabled items
 * skipped.
 */
export function TabBar(props: TabBarProps) {
  const [local, rest] = splitProps(props, [
    'items', 'value', 'iconOnly', 'label', 'onChange', 'ref', 'class',
  ]);
  const items = () => local.items ?? [];
  const enabled = () => items().filter((it) => !it.disabled);
  // Selection falls back to the first enabled tab so an uncontrolled bar never
  // renders with nothing active (the facade's tab bar always has an active tab).
  const activeId = () => {
    if (local.value !== undefined && items().some((it) => it.id === local.value)) return local.value;
    return enabled()[0]?.id;
  };

  const tabEls: Record<string, HTMLButtonElement> = {};

  // Roving tabindex: exactly one tab in the tab order (the active tab, else
  // the first enabled one), same as ui/tabs.
  const rovingId = () => {
    const active = activeId();
    if (active !== undefined && enabled().some((it) => it.id === active)) return active;
    return enabled()[0]?.id;
  };

  const select = (item: TabBarItem) => {
    if (item.disabled) return;
    if (item.id === activeId()) return;
    local.onChange?.(item.id);
  };

  const onKeyDown = (e: KeyboardEvent, item: TabBarItem) => {
    const list = enabled();
    if (list.length === 0) return;
    const i = list.findIndex((it) => it.id === item.id);
    let next: TabBarItem | undefined;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = list[(i + 1) % list.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = list[(i - 1 + list.length) % list.length];
        break;
      case 'Home':
        next = list[0];
        break;
      case 'End':
        next = list[list.length - 1];
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        select(item);
        return;
      default:
        return;
    }
    if (next) {
      e.preventDefault();
      select(next);
      tabEls[next.id]?.focus();
    }
  };

  return (
    <nav
      {...rest}
      ref={(el) => local.ref?.(el)}
      role="tablist"
      part="tablist"
      aria-label={local.label ?? 'Navigation'}
      class={cn(TAB_BAR_CLASS, local.class)}
    >
      <For each={items()}>
        {(item) => {
          const active = () => item.id === activeId();
          return (
            <button
              ref={(el) => { tabEls[item.id] = el; }}
              type="button"
              part="tab"
              role="tab"
              data-active={active() ? '' : undefined}
              aria-selected={active() ? 'true' : 'false'}
              aria-label={tabBarItemAccessibleName(item.label ?? item.id, item)}
              tabindex={item.id === rovingId() ? 0 : -1}
              disabled={item.disabled}
              class={tabBarTabClass(active())}
              onClick={() => select(item)}
              onKeyDown={(e) => onKeyDown(e, item)}
            >
              <TabBarItemContent
                icon={item.icon}
                dot={item.dot}
                badge={item.badge}
                iconOnly={local.iconOnly}
                label={item.label}
              />
            </button>
          );
        }}
      </For>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// The parent-item contract for the element layer (`<kai-tab-bar>` over slotted
// `<kai-tab-bar-item>` children), as a pure-DOM controller so it is
// host-agnostic and jsdom-testable. Mirrors createConversationItemsController:
// Solid context cannot cross the element boundary (each facade is its own
// Solid root), so the channel is DOM traversal by construction.
// ---------------------------------------------------------------------------

/** Read a tab item's identity the way the bar does: the `value` property
 *  (what a framework loop sets), else the `value` attribute, else the host
 *  `id` (the plain-HTML spellings). */
export function readTabBarItemValue(el: Element): string {
  const prop = (el as Element & { value?: unknown }).value;
  if (typeof prop === 'string' && prop) return prop;
  return el.getAttribute('value') ?? el.id;
}

/** Whether a tab item host is disabled: the `disabled` property, else the
 *  presence of the `disabled` attribute (not spelled `="false"`). */
export function isTabBarItemDisabled(el: Element): boolean {
  const prop = (el as Element & { disabled?: unknown }).disabled;
  if (typeof prop === 'boolean') return prop;
  const attr = el.getAttribute('disabled');
  return attr !== null && attr !== 'false';
}

export interface TabBarItemsControllerOptions {
  /** The current slotted item hosts, in DOM order. */
  getItems: () => HTMLElement[];
  /** The bar's effective selected value. */
  getValue: () => string | undefined;
  /** Whether the bar renders icon-only (labels hidden visually). */
  getIconOnly: () => boolean;
  /** Item activation (click, Enter, Space, or arrow-key move). Surfaces as
   *  `kai-tab-change` on the bar element. */
  onSelect: (value: string) => void;
}

export interface TabBarItemsController {
  /** Re-derive the tab/aria-selected/roving-tabindex bookkeeping over the
   *  current items. Call on child mutation and whenever `value` changes. */
  sync(): void;
  /** The bar's tablist click handler (composed-path aware). */
  handleClick(e: MouseEvent): void;
  /** The bar's tablist keydown handler (arrows, Home/End, Enter/Space). */
  handleKeyDown(e: KeyboardEvent): void;
}

/**
 * The parent-item contract of `<kai-tab-bar>` item mode:
 *
 * - selection flows bar to item: exactly one item's BODY node (the shadow
 *   `data-kai-tab-body` button of a `kai-tab-bar-item`, else the node itself)
 *   is `aria-selected="true"`, plus the `active` property on the host for the
 *   item's own styling hook;
 * - `role="tab"` is ensured on each item's body node (an authored role is
 *   left alone), and the host `iconOnly` property follows the bar's mode;
 * - roving tabindex: exactly one body node `tabindex="0"` (the active item's,
 *   else the first enabled one's), the rest `-1`, re-derived on every `sync()`;
 * - activation (click, Enter, Space) calls `onSelect` with the item's value;
 * - ArrowLeft/ArrowRight (and Up/Down)/Home/End move selection AND focus
 *   item-to-item with wrap-around, the `Tabs` idiom (activation follows
 *   focus), skipping disabled items.
 */
export function createTabBarItemsController(
  opts: TabBarItemsControllerOptions,
): TabBarItemsController {
  const itemFromEvent = (e: Event): HTMLElement | undefined => {
    const items = opts.getItems();
    return e.composedPath().find((n): n is HTMLElement => items.includes(n as HTMLElement));
  };
  /** The item's ACTIVATION node, the target of role/aria-selected/tabindex/
   *  focus: a `kai-tab-bar-item` host's shadow body button, else the node
   *  itself (the jsdom stand-ins). */
  const bodyOf = (item: HTMLElement): HTMLElement =>
    (item.shadowRoot?.querySelector('[data-kai-tab-body]') as HTMLElement | null) ?? item;
  // Write-on-change only: the facade re-syncs from a MutationObserver over
  // these very nodes, and unconditional writes would feed the observer forever.
  const setAttr = (el: Element, name: string, value: string) => {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };
  /** An item whose shadow body has not RENDERED yet must not be stamped: the
   *  fallback would write tab semantics onto the HOST and they would stick.
   *  A later sync catches it (the facade's own mount mutates host attributes,
   *  which re-runs sync through the bar's MutationObserver). Bare nodes (no
   *  dash: the jsdom stand-ins) are always ready. */
  const readyBodies = (items: HTMLElement[]) => {
    const out = new Map<HTMLElement, HTMLElement>();
    for (const item of items) {
      const body = bodyOf(item);
      if (body === item && item.localName.includes('-')) continue;
      out.set(item, body);
    }
    return out;
  };
  const enabledItems = () => opts.getItems().filter((it) => !isTabBarItemDisabled(it));

  const rove = (items: HTMLElement[], target: HTMLElement | undefined) => {
    for (const [item, body] of readyBodies(items)) {
      setAttr(body, 'tabindex', item === target && !isTabBarItemDisabled(item) ? '0' : '-1');
    }
  };

  const sync = () => {
    const items = opts.getItems();
    const value = opts.getValue();
    const iconOnly = opts.getIconOnly();
    const bodies = readyBodies(items);
    let anchor: HTMLElement | undefined;
    for (const [item, body] of bodies) {
      const isActive = value !== undefined && readTabBarItemValue(item) === value;
      if (!body.hasAttribute('role')) body.setAttribute('role', 'tab');
      setAttr(body, 'aria-selected', isActive ? 'true' : 'false');
      const host = item as HTMLElement & { active?: boolean; iconOnly?: boolean };
      if (host.active !== isActive) host.active = isActive;
      if (host.iconOnly !== iconOnly) host.iconOnly = iconOnly;
      if (isActive) anchor = item;
    }
    const firstEnabled = enabledItems().find((it) => bodies.has(it));
    rove(items, anchor ?? firstEnabled);
  };

  const select = (item: HTMLElement) => {
    if (isTabBarItemDisabled(item)) return;
    const value = readTabBarItemValue(item);
    if (value === opts.getValue()) return;
    opts.onSelect(value);
  };

  return {
    sync,
    handleClick(e) {
      const item = itemFromEvent(e);
      if (!item) return;
      select(item);
    },
    handleKeyDown(e) {
      const list = enabledItems();
      if (list.length === 0) return;
      const item = itemFromEvent(e);
      if (e.key === 'Enter' || e.key === ' ') {
        if (!item) return;
        e.preventDefault();
        select(item);
        return;
      }
      const current = item && list.includes(item)
        ? item
        : list.find((it) => bodyOf(it).getAttribute('tabindex') === '0');
      const i = current ? list.indexOf(current) : 0;
      let next: HTMLElement | undefined;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = list[(i + 1) % list.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
      else if (e.key === 'Home') next = list[0];
      else if (e.key === 'End') next = list[list.length - 1];
      if (!next) return;
      e.preventDefault();
      select(next);
      rove(opts.getItems(), next);
      bodyOf(next).focus();
    },
  };
}
