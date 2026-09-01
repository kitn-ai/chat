/**
 * Unit tests for the `<kai-tab-bar>` parent-item contract.
 *
 * Strategy: `defineWebComponent` registers a real Shadow-DOM custom element and
 * is not suitable for jsdom unit tests. Instead the pure-DOM controller the bar
 * facade wires (`createTabBarItemsController`) and its id/disabled helpers are
 * driven over plain nodes, mirroring the pattern in
 * `conversation-list.declarative.test.tsx`: bare (dash-less) stand-ins are
 * always "ready", so the controller stamps them directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  createTabBarItemsController,
  isTabBarItemDisabled,
  readTabBarItemValue,
  type TabBarItemsController,
} from '../components/tab-bar';

// ---------------------------------------------------------------------------
// readTabBarItemValue / isTabBarItemDisabled — pure helpers
// ---------------------------------------------------------------------------

describe('readTabBarItemValue', () => {
  it('prefers the value PROPERTY (what a framework loop sets)', () => {
    const el = document.createElement('div') as HTMLDivElement & { value?: string };
    el.value = 'prop';
    el.setAttribute('value', 'attr');
    el.id = 'host';
    expect(readTabBarItemValue(el)).toBe('prop');
  });
  it('falls back to the value attribute, then the host id', () => {
    const el = document.createElement('div');
    el.setAttribute('value', 'attr');
    el.id = 'host';
    expect(readTabBarItemValue(el)).toBe('attr');
    el.removeAttribute('value');
    expect(readTabBarItemValue(el)).toBe('host');
  });
});

describe('isTabBarItemDisabled', () => {
  it('reads the property, the bare attribute, and treats ="false" as enabled', () => {
    const el = document.createElement('div') as HTMLDivElement & { disabled?: boolean };
    expect(isTabBarItemDisabled(el)).toBe(false);
    el.setAttribute('disabled', '');
    expect(isTabBarItemDisabled(el)).toBe(true);
    el.setAttribute('disabled', 'false');
    expect(isTabBarItemDisabled(el)).toBe(false);
    el.disabled = true;
    expect(isTabBarItemDisabled(el)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createTabBarItemsController — the parent-item contract over plain nodes
// ---------------------------------------------------------------------------

type Host = HTMLElement & { value?: string; active?: boolean; iconOnly?: boolean; disabled?: boolean };

function makeItems(values: string[]): Host[] {
  return values.map((v) => {
    const el = document.createElement('div') as Host;
    el.setAttribute('value', v);
    document.body.appendChild(el);
    return el;
  });
}

describe('createTabBarItemsController', () => {
  let items: Host[];
  let value: string | undefined;
  let iconOnly: boolean;
  let onSelect: ReturnType<typeof vi.fn<(value: string) => void>>;
  let controller: TabBarItemsController;

  // composedPath() is only populated DURING dispatch, so the handlers run as
  // listeners on the shared parent, exactly how the bar facade wires them.
  // Registered per test and removed after, so no stale controller lingers.
  const cleanups: Array<() => void> = [];
  const wireClick = () => {
    const listener = (e: Event) => controller.handleClick(e as MouseEvent);
    document.body.addEventListener('click', listener);
    cleanups.push(() => document.body.removeEventListener('click', listener));
  };
  const wireKeys = () => {
    const listener = (e: Event) => controller.handleKeyDown(e as KeyboardEvent);
    document.body.addEventListener('keydown', listener);
    cleanups.push(() => document.body.removeEventListener('keydown', listener));
  };
  const key = (el: HTMLElement, k: string) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  };

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    items = makeItems(['home', 'messages', 'help']);
    value = 'home';
    iconOnly = false;
    onSelect = vi.fn();
    controller = createTabBarItemsController({
      getItems: () => items,
      getValue: () => value,
      getIconOnly: () => iconOnly,
      onSelect,
    });
  });

  it('sync stamps role="tab" (an authored role is left alone) and aria-selected on exactly the active item', () => {
    items[1].setAttribute('role', 'presentation');
    controller.sync();
    expect(items[0]).toHaveAttribute('role', 'tab');
    expect(items[1]).toHaveAttribute('role', 'presentation');
    expect(items[0]).toHaveAttribute('aria-selected', 'true');
    expect(items[1]).toHaveAttribute('aria-selected', 'false');
    expect(items[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('sync flows active and iconOnly PROPERTIES to the hosts (the item facade styling hooks)', () => {
    iconOnly = true;
    controller.sync();
    expect(items[0].active).toBe(true);
    expect(items[1].active).toBe(false);
    expect(items[0].iconOnly).toBe(true);
    expect(items[2].iconOnly).toBe(true);
  });

  it('roving tabindex: exactly one item tabbable (the active one, else the first enabled)', () => {
    controller.sync();
    expect(items.map((i) => i.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    value = undefined;
    items[0].setAttribute('disabled', '');
    controller.sync();
    expect(items.map((i) => i.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('click on an item (composed-path aware) selects its value; the current value and disabled items do not fire', () => {
    controller.sync();
    wireClick();
    const click = (el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    click(items[1]);
    expect(onSelect).toHaveBeenCalledWith('messages');
    onSelect.mockClear();
    click(items[0]); // already active
    expect(onSelect).not.toHaveBeenCalled();
    items[2].setAttribute('disabled', '');
    click(items[2]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ArrowRight/ArrowLeft move selection with wrap-around, skipping disabled items (selection follows focus)', () => {
    items[1].setAttribute('disabled', '');
    controller.sync();
    wireKeys();
    key(items[0], 'ArrowRight'); // skips disabled messages, lands on help
    expect(onSelect).toHaveBeenCalledWith('help');
    value = 'help';
    controller.sync();
    onSelect.mockClear();
    key(items[2], 'ArrowRight'); // wraps back to home
    expect(onSelect).toHaveBeenCalledWith('home');
    value = 'home';
    controller.sync();
    onSelect.mockClear();
    key(items[0], 'ArrowLeft'); // wraps backwards over the disabled item to help
    expect(onSelect).toHaveBeenCalledWith('help');
  });

  it('Home/End jump to the first/last enabled item; Enter/Space select the item in the event path', () => {
    controller.sync();
    wireKeys();
    key(items[0], 'End');
    expect(onSelect).toHaveBeenCalledWith('help');
    onSelect.mockClear();
    key(items[1], 'Enter');
    expect(onSelect).toHaveBeenCalledWith('messages');
    onSelect.mockClear();
    key(items[2], ' ');
    expect(onSelect).toHaveBeenCalledWith('help');
  });

  it('keyboard moves re-derive the roving tabindex onto the moved-to item', () => {
    controller.sync();
    wireKeys();
    key(items[0], 'ArrowRight');
    expect(items.map((i) => i.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('sync writes on-change only, so it cannot feed the facade MutationObserver a loop', () => {
    controller.sync();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    for (const item of items) observer.observe(item, { attributes: true });
    controller.sync();
    expect(observer.takeRecords()).toHaveLength(0);
    expect(records).toHaveLength(0);
    observer.disconnect();
  });
});
