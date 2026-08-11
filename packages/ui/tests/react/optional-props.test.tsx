/**
 * TYPE regression — a prop the element treats as optional must be optional in the
 * generated React wrapper's props interface.
 *
 * `kai-conversations` and `kai-workspace` register `groups: []` as their runtime
 * default and render an ungrouped list without it, but their `Props` interfaces
 * typed `groups` as a REQUIRED `ConversationGroup[]`. The generated wrapper
 * inherits that, so every React consumer who did not want grouping was forced to
 * write `groups={[]}` — `error TS2741: Property 'groups' is missing`. That was
 * fixed by widening the facade's declaration, and the proof was a throwaway
 * scratch file. This is the permanent version.
 *
 * This file is TYPE-CHECKED by `tsc --noEmit -p tsconfig.react.test.json`
 * (the third pass of `npm run typecheck`) — which is where it does its work: the
 * assertions below are compile-time, and a regression breaks that pass. It also
 * runs under `npm run test:react` so the elements really do render without the prop.
 */
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Conversations, Workspace, type ConversationsProps, type WorkspaceProps } from '@kitn.ai/ui/react';

afterEach(cleanup);

const conversations = [
  {
    id: 'c1',
    title: 'Hello world',
    scope: { type: 'collection' as const },
    messageCount: 2,
    lastMessageAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  },
];

// Compile-time assertions: `groups` must be omissible on both wrappers. If it
// goes back to being required, these two lines stop compiling (TS2741) and the
// react-test typecheck pass fails.
const _conversationsWithoutGroups: ConversationsProps = { conversations, activeId: 'c1' };
// `messages` is still REQUIRED on WorkspaceProps despite registering a `[]`
// default — the same class of defect `groups` had, in 19 other props across the
// catalog. Out of scope here; passing it keeps this test about `groups`.
const _workspaceWithoutGroups: WorkspaceProps = { conversations, messages: [], activeId: 'c1' };

test('<Conversations> renders with no `groups` prop', () => {
  const { container } = render(<Conversations conversations={conversations} activeId="c1" />);
  expect(container.querySelector('kai-conversations')).toBeTruthy();
  expect(_conversationsWithoutGroups.conversations).toHaveLength(1);
});

test('<Workspace> renders with no `groups` prop', () => {
  const { container } = render(<Workspace conversations={conversations} messages={[]} activeId="c1" />);
  expect(container.querySelector('kai-workspace')).toBeTruthy();
  expect(_workspaceWithoutGroups.conversations).toHaveLength(1);
});

// The grouped form must keep compiling too — the fix was a widening, not a swap.
const _stillGrouped: ConversationsProps = {
  conversations: [{ ...conversations[0], groupId: 'g1' }],
  groups: [{ id: 'g1', name: 'Today', sortOrder: 0, createdAt: '2026-06-01' }],
};

test('the grouped form still type-checks and renders', () => {
  const { container } = render(<Conversations {..._stillGrouped} />);
  expect(container.querySelector('kai-conversations')).toBeTruthy();
});
