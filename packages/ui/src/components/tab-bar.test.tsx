import { render, fireEvent, cleanup } from '@solidjs/testing-library';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { TabBar, tabBarItemAccessibleName, type TabBarItem } from './tab-bar';

afterEach(cleanup);

const items: TabBarItem[] = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'messages', icon: 'message-square', label: 'Messages', dot: true },
  { id: 'help', icon: 'book-open', label: 'Help' },
];

const tabs = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

describe('tabBarItemAccessibleName', () => {
  it('is the bare label with no dot or badge', () => {
    expect(tabBarItemAccessibleName('Home')).toBe('Home');
  });
  it('appends (unread) for a dot: the signal must reach assistive tech, not only the visible dot (#336)', () => {
    expect(tabBarItemAccessibleName('Messages', { dot: true })).toBe('Messages (unread)');
  });
  it('appends the count for a badge, which wins over the dot', () => {
    expect(tabBarItemAccessibleName('Messages', { badge: 3, dot: true })).toBe('Messages (3)');
  });
});

describe('TabBar rendering', () => {
  it('renders a tablist of tabs, icon-over-label, with exactly one aria-selected', () => {
    const { container, getByText } = render(() => <TabBar items={items} value="home" />);
    const list = container.querySelector('[role="tablist"]')!;
    expect(list).toHaveAttribute('aria-label', 'Navigation');
    expect(tabs(container)).toHaveLength(3);
    expect(getByText('Home')).toBeTruthy();
    const selected = tabs(container).filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAttribute('aria-label', 'Home');
  });

  it('label prop names the tablist (the facade passes "Widget navigation")', () => {
    const { container } = render(() => <TabBar items={items} label="Widget navigation" />);
    expect(container.querySelector('[role="tablist"]')).toHaveAttribute('aria-label', 'Widget navigation');
  });

  it('renders the unread dot on the flagged tab AND reaches its accessible name', () => {
    const { container } = render(() => <TabBar items={items} value="home" />);
    expect(container.querySelectorAll('[data-kai-tab-dot]')).toHaveLength(1);
    const messages = tabs(container)[1];
    expect(messages.getAttribute('aria-label')).toBe('Messages (unread)');
    expect(messages.querySelector('[data-kai-tab-dot]')).toBeTruthy();
  });

  it('renders a count badge (visible text) which wins over the dot', () => {
    const badged: TabBarItem[] = [{ id: 'm', icon: 'message-square', label: 'Messages', badge: 3, dot: true }];
    const { container } = render(() => <TabBar items={badged} />);
    const badge = container.querySelector('[data-kai-tab-badge]')!;
    expect(badge.textContent).toBe('3');
    expect(container.querySelector('[data-kai-tab-dot]')).toBeNull();
    expect(tabs(container)[0].getAttribute('aria-label')).toBe('Messages (3)');
  });

  it('iconOnly hides the label text visually while aria-label still names the tab', () => {
    const { container, queryByText } = render(() => <TabBar items={items} iconOnly />);
    expect(queryByText('Home')).toBeNull();
    expect(tabs(container)[0].getAttribute('aria-label')).toBe('Home');
    // The icon still renders (an svg inside each tab).
    expect(tabs(container)[0].querySelector('svg')).toBeTruthy();
  });

  it('the active tab carries data-active (the primary-retint styling hook)', () => {
    const { container } = render(() => <TabBar items={items} value="messages" />);
    const active = tabs(container).filter((t) => t.hasAttribute('data-active'));
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute('aria-label')).toBe('Messages (unread)');
    expect(active[0].className).toContain('text-primary');
  });

  it('falls back to the first enabled tab when uncontrolled, so something is always active', () => {
    const withDisabledFirst: TabBarItem[] = [
      { id: 'a', label: 'A', disabled: true },
      { id: 'b', label: 'B' },
    ];
    const { container } = render(() => <TabBar items={withDisabledFirst} />);
    const selected = tabs(container).find((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected?.getAttribute('aria-label')).toBe('B');
  });
});

describe('TabBar selection', () => {
  it('click emits onChange with the tab id', () => {
    const onChange = vi.fn();
    const { container } = render(() => <TabBar items={items} value="home" onChange={onChange} />);
    fireEvent.click(tabs(container)[1]);
    expect(onChange).toHaveBeenCalledWith('messages');
  });

  it('clicking the already-active tab does not emit', () => {
    const onChange = vi.fn();
    const { container } = render(() => <TabBar items={items} value="home" onChange={onChange} />);
    fireEvent.click(tabs(container)[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a disabled tab cannot be selected', () => {
    const onChange = vi.fn();
    const disabled: TabBarItem[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: true },
    ];
    const { container } = render(() => <TabBar items={disabled} value="a" onChange={onChange} />);
    expect(tabs(container)[1]).toBeDisabled();
    fireEvent.click(tabs(container)[1]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('TabBar keyboard nav (the kit tabs idiom: roving tabindex, selection follows focus)', () => {
  function controlled() {
    const [value, setValue] = createSignal('home');
    const utils = render(() => <TabBar items={items} value={value()} onChange={setValue} />);
    return { ...utils, value };
  }

  it('exactly one tab is in the tab order (the active one)', () => {
    const { container } = controlled();
    const zero = tabs(container).filter((t) => t.tabIndex === 0);
    expect(zero).toHaveLength(1);
    expect(zero[0].getAttribute('aria-label')).toBe('Home');
  });

  it('ArrowRight moves selection to the next tab, wrapping at the end', () => {
    const { container, value } = controlled();
    fireEvent.keyDown(tabs(container)[0], { key: 'ArrowRight' });
    expect(value()).toBe('messages');
    fireEvent.keyDown(tabs(container)[1], { key: 'ArrowRight' });
    expect(value()).toBe('help');
    fireEvent.keyDown(tabs(container)[2], { key: 'ArrowRight' });
    expect(value()).toBe('home');
  });

  it('ArrowLeft moves selection backwards, wrapping at the start', () => {
    const { container, value } = controlled();
    fireEvent.keyDown(tabs(container)[0], { key: 'ArrowLeft' });
    expect(value()).toBe('help');
  });

  it('Home and End jump to the first and last enabled tab', () => {
    const { container, value } = controlled();
    fireEvent.keyDown(tabs(container)[0], { key: 'End' });
    expect(value()).toBe('help');
    fireEvent.keyDown(tabs(container)[2], { key: 'Home' });
    expect(value()).toBe('home');
  });

  it('Enter and Space select the focused tab', () => {
    const onChange = vi.fn();
    const { container } = render(() => <TabBar items={items} value="home" onChange={onChange} />);
    fireEvent.keyDown(tabs(container)[1], { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('messages');
    fireEvent.keyDown(tabs(container)[2], { key: ' ' });
    expect(onChange).toHaveBeenCalledWith('help');
  });

  it('arrow keys skip disabled tabs', () => {
    const [value, setValue] = createSignal('a');
    const withDisabled: TabBarItem[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: true },
      { id: 'c', label: 'C' },
    ];
    const { container } = render(() => <TabBar items={withDisabled} value={value()} onChange={setValue} />);
    fireEvent.keyDown(tabs(container)[0], { key: 'ArrowRight' });
    expect(value()).toBe('c');
  });

  it('roving tabindex follows the selection', () => {
    const { container, value } = controlled();
    fireEvent.keyDown(tabs(container)[0], { key: 'ArrowRight' });
    expect(value()).toBe('messages');
    expect(tabs(container)[1].tabIndex).toBe(0);
    expect(tabs(container)[0].tabIndex).toBe(-1);
  });
});
