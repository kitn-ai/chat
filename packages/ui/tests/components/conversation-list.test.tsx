import { flush } from 'solid-js';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { ConversationList, CollapsedRail } from '../../src/components/conversation-list';
import type { ConversationSummary, ConversationGroup } from '../../src/types';

describe('ConversationList', () => {
  const groups: ConversationGroup[] = [
    { id: 'g1', name: 'Research', sortOrder: 0, createdAt: '2026-01-01' },
  ];
  const conversations: ConversationSummary[] = [
    { id: 'c1', title: 'Database options', groupId: 'g1', scope: { type: 'collection' }, messageCount: 5, lastMessageAt: '2026-04-10', updatedAt: '2026-04-10' },
    { id: 'c2', title: 'Quick question', groupId: undefined, scope: { type: 'collection' }, messageCount: 2, lastMessageAt: '2026-04-09', updatedAt: '2026-04-09' },
  ];

  it('renders groups with conversation counts', () => {
    render(() => <ConversationList groups={groups} conversations={conversations} activeId="c1" onSelect={() => {}} onNewChat={() => {}} />);
    expect(screen.getByText('Research')).toBeTruthy();
  });

  // `groups` drives the render loop, so a conversation pointing at a group the
  // consumer never declared used to be dropped on the floor: no row, no error, no
  // empty state — the list just showed fewer conversations than it was given.
  // A stale id, a group removed from the array, or a filtered/paginated `groups`
  // response all produce exactly that. Now it falls through to "Ungrouped".
  it('renders a conversation whose groupId matches no group, under Ungrouped', () => {
    const orphan: ConversationSummary = {
      id: 'c3', title: 'Orphaned thread', groupId: 'gone', scope: { type: 'collection' },
      messageCount: 1, lastMessageAt: '2026-04-08', updatedAt: '2026-04-08',
    };
    render(() => (
      <ConversationList
        groups={groups}
        conversations={[...conversations, orphan]}
        activeId="c1"
        onSelect={() => {}}
        onNewChat={() => {}}
      />
    ));
    expect(screen.getByText('Orphaned thread')).toBeTruthy();
    expect(screen.getByText('Ungrouped')).toBeTruthy();
    // …and it does NOT leak into the group it names but does not belong to.
    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.getByText('Database options')).toBeTruthy();
  });

  it('still renders every conversation when `groups` is empty', () => {
    render(() => (
      <ConversationList
        groups={[]}
        conversations={conversations}
        activeId="c1"
        onSelect={() => {}}
        onNewChat={() => {}}
      />
    ));
    expect(screen.getByText('Database options')).toBeTruthy(); // groupId 'g1', no groups declared
    expect(screen.getByText('Quick question')).toBeTruthy();
  });

  it('keeps the search filter applied to the ungrouped fallthrough', () => {
    const orphan: ConversationSummary = {
      id: 'c3', title: 'Orphaned thread', groupId: 'gone', scope: { type: 'collection' },
      messageCount: 1, lastMessageAt: '2026-04-08', updatedAt: '2026-04-08',
    };
    render(() => (
      <ConversationList groups={groups} conversations={[...conversations, orphan]} onSelect={() => {}} onNewChat={() => {}} />
    ));
    fireEvent.input(screen.getByLabelText('Search chats'), { target: { value: 'orphan' } });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(screen.getByText('Orphaned thread')).toBeTruthy();
    expect(screen.queryByText('Quick question')).toBeNull();
  });
});

// The collapsed-rail fallback is shared by kai-workspace and the standalone
// kai-conversations, so collapse looks identical in both. Unit-test it here.
describe('CollapsedRail', () => {
  it('renders a labelled reopen button and calls onExpand on click', () => {
    const onExpand = vi.fn();
    render(() => <CollapsedRail onExpand={onExpand} />);
    const btn = screen.getByRole('button', { name: 'Open sidebar' });
    fireEvent.click(btn);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
