import { render, fireEvent } from '@solidjs/testing-library';
import { describe, it, expect, vi } from 'vitest';
import { HomePanel } from './home-panel';
import { WidgetTabBar } from './widget-tab-bar';
import type { ConversationSummary } from '../types';

const tick = () => new Promise((r) => setTimeout(r, 0));
const summary: ConversationSummary = {
  id: 'c1', title: 'Order #42', messageCount: 3,
  updatedAt: new Date().toISOString(), trailing: 'On its way!',
  lastMessageAt: new Date().toISOString(),
};

describe('HomePanel (H-1)', () => {
  it('defaults: greeting title + new-conversation card render with no config', () => {
    const { getByText } = render(() => <HomePanel onNewChat={() => {}} />);
    expect(getByText('Hi there 👋')).toBeTruthy();
    expect(getByText('Send us a message')).toBeTruthy();
  });

  it('recent card renders summary fields and taps through with the id', async () => {
    const onSelectRecent = vi.fn();
    const { getByText, container } = render(() => (
      <HomePanel recent={summary} onSelectRecent={onSelectRecent} onNewChat={() => {}} />
    ));
    expect(getByText('Order #42')).toBeTruthy();
    expect(getByText('On its way!')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-kai-home-recent]')!);
    await tick();
    expect(onSelectRecent).toHaveBeenCalledWith('c1');
  });

  it('no recent prop → no recent card', () => {
    const { container } = render(() => <HomePanel onNewChat={() => {}} />);
    expect(container.querySelector('[data-kai-home-recent]')).toBeNull();
  });

  it('href link renders a hardened anchor; javascript: href renders NO anchor but the label stays visible', () => {
    const { container, getByText } = render(() => (
      <HomePanel onNewChat={() => {}} links={[
        { label: 'Docs', href: 'https://ui.kitn.ai' },
        { label: 'Evil', href: 'javascript:alert(1)' },
      ]} />
    ));
    const a = container.querySelector('a[href="https://ui.kitn.ai"]')!;
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(getByText('Evil')).toBeTruthy(); // escaped rendering, not deletion
  });

  it('unsafe-href entry renders as a non-interactive row: no anchor, no button', () => {
    const { container } = render(() => (
      <HomePanel onNewChat={() => {}} links={[{ label: 'Evil', href: 'javascript:alert(1)' }]} />
    ));
    const row = container.querySelector('[data-kai-home-link]')!;
    expect(row).toBeTruthy();
    expect(row.tagName).not.toBe('A');
    expect(row.tagName).not.toBe('BUTTON');
  });

  it('href-less link is a button that emits the entry via onLink', async () => {
    const onLink = vi.fn();
    const entry = { label: 'Talk to sales', icon: 'message-circle' };
    const { getByText } = render(() => (
      <HomePanel onNewChat={() => {}} links={[entry]} onLink={onLink} />
    ));
    fireEvent.click(getByText('Talk to sales'));
    await tick();
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ label: 'Talk to sales' }));
  });

  it('showNewConversation={false} hides the new-conversation card', () => {
    const { container } = render(() => (
      <HomePanel onNewChat={() => {}} showNewConversation={false} />
    ));
    expect(container.querySelector('[data-kai-home-new]')).toBeNull();
  });
});

describe('WidgetTabBar (H-2, H-6)', () => {
  it('real tablist semantics; active tab is aria-selected', () => {
    const { container } = render(() => (
      <WidgetTabBar active="home" onChange={() => {}} />
    ));
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('unread reaches the Messages tab ACCESSIBLE NAME, not only a hidden dot (#336 lesson)', () => {
    const { container } = render(() => (
      <WidgetTabBar active="home" onChange={() => {}} unread />
    ));
    const messages = container.querySelector('[data-kai-tab-messages]')!;
    expect(messages.getAttribute('aria-label')).toMatch(/unread/i);
    expect(container.querySelector('[data-kai-tab-unread]')).toBeTruthy();
  });

  it('tab click emits the tab id', async () => {
    const onChange = vi.fn();
    const { container } = render(() => (
      <WidgetTabBar active="home" onChange={onChange} />
    ));
    fireEvent.click(container.querySelector('[data-kai-tab-messages]')!);
    await tick();
    expect(onChange).toHaveBeenCalledWith('messages');
  });
});
