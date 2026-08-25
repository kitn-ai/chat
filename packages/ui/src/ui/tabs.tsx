import { For, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { renderIcon } from './icon';
import { cn } from '../utils/cn';

/** One tab in a `Tabs` strip. `id` is the selected `value` throughout. */
export interface KaiTabItem {
  /** Stable id, emitted as the selected `value`. Also useful for `aria-controls`. */
  id: string;
  label?: string;
  /** Named icon (e.g. "code"), image URL / data-URI, or plain text. */
  icon?: string;
  disabled?: boolean;
}

export type TabsVariant = 'segmented' | 'underline';

/** variant → tablist container utilities. */
export const TABLIST_CLASS: Record<TabsVariant, string> = {
  segmented: 'inline-flex items-center gap-1 rounded-lg bg-muted p-1',
  underline: 'inline-flex items-center gap-1 border-b border-border',
};

/** variant → per-tab utilities, given whether the tab is active. */
export function tabClass(variant: TabsVariant, active: boolean): string {
  const base =
    'inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'disabled:pointer-events-none disabled:opacity-50';
  if (variant === 'underline') {
    return cn(
      base,
      'border-b-2 px-3 py-2 -mb-px',
      active
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    );
  }
  return cn(
    base,
    'rounded-md px-3 py-1.5',
    active
      ? 'bg-background text-foreground shadow-sm'
      : 'text-muted-foreground hover:text-foreground',
  );
}

export interface TabsProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items?: KaiTabItem[];
  /** Selected item id. */
  value?: string;
  variant?: TabsVariant;
  /** Stretch the strip to full width, each tab sharing the space equally. */
  block?: boolean;
  /** Disable the whole strip. */
  disabled?: boolean;
  /** Fired with the newly-selected item's id. */
  onChange?: (value: string) => void;
  /** Capture the tablist node (so the facade's `focus()` can target the active tab). */
  ref?: (el: HTMLDivElement) => void;
}

/**
 * Accessible tab strip. Selection only (emits the selected id via `onChange`);
 * the consumer renders each tab's content. Roving tabindex, Arrow/Home/End
 * keyboard nav, disabled items skipped.
 */
export function Tabs(props: TabsProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 
    'items', 'value', 'variant', 'block', 'disabled', 'onChange', 'ref', 'class');
  const items = () => local.items ?? [];
  const variant = (): TabsVariant => local.variant ?? 'segmented';

  const tabEls: Record<string, HTMLButtonElement> = {};

  const enabled = () => items().filter((it) => !it.disabled);
  const activeId = () => local.value;

  // Roving tabindex needs exactly one tab in the tab order. The active tab gets
  // it; if nothing is selected, the first enabled tab does, so the strip is still
  // reachable by Tab.
  const rovingId = () => {
    if (activeId() !== undefined && enabled().some((it) => it.id === activeId())) return activeId();
    return enabled()[0]?.id;
  };

  const select = (item: KaiTabItem) => {
    if (local.disabled || item.disabled) return;
    if (item.id === local.value) return;
    local.onChange?.(item.id);
  };

  // Roving focus: move focus to the target tab and emit selection (activate on focus move).
  const focusId = (id: string) => {
    const el = tabEls[id];
    if (el) el.focus();
  };

  const onKeyDown = (e: KeyboardEvent, item: KaiTabItem) => {
    const list = enabled();
    if (list.length === 0) return;
    const i = list.findIndex((it) => it.id === item.id);
    let next: KaiTabItem | undefined;
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
      focusId(next.id);
    }
  };

  return (
    <div
      {...rest}
      ref={(el) => local.ref?.(el)}
      role="tablist"
      part="tablist"
      aria-disabled={local.disabled ? 'true' : undefined}
      class={cn(TABLIST_CLASS[variant()], local.block && 'flex w-full', local.class)}
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
              tabindex={item.id === rovingId() ? 0 : -1}
              disabled={local.disabled || item.disabled}
              class={cn(tabClass(variant(), active()), local.block && 'flex-1 justify-center')}
              onClick={() => select(item)}
              onKeyDown={(e) => onKeyDown(e, item)}
            >
              {renderIcon(item.icon, { class: 'size-4 shrink-0' })}
              {item.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
