/**
 * Unit tests for the declarative `<kai-conversation>` light-DOM API of
 * `<kai-conversations>`.
 *
 * Strategy: `defineWebComponent` registers a real Shadow-DOM custom element
 * and is not suitable for jsdom unit tests. Instead:
 *   1. Test the exported `parseKaiConversationElement` helper in isolation.
 *   2. Test that the merged list of prop + slotted items renders items correctly
 *      via a minimal ConvList harness, mirroring the pattern in
 *      `source-list.test.tsx`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { For, flush } from 'solid-js';
import { parseKaiConversationElement } from './conversation-list';
import type { ConversationSummary } from '../types';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// parseKaiConversationElement — pure helper
// ---------------------------------------------------------------------------

describe('parseKaiConversationElement', () => {
  function makeEl(attrs: Record<string, string | null>, textContent = ''): Element {
    const el = document.createElement('kai-conversation');
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null) el.setAttribute(k, v);
    }
    el.textContent = textContent;
    return el;
  }

  it('maps id attribute to ConversationSummary.id', () => {
    const el = makeEl({ id: 'c-1' }, 'Q2 plan');
    expect(parseKaiConversationElement(el).id).toBe('c-1');
  });

  it('uses trimmed textContent as title', () => {
    const el = makeEl({ id: 'c-1' }, '  Q2 plan  ');
    expect(parseKaiConversationElement(el).title).toBe('Q2 plan');
  });

  it('reads group-id attribute as groupId when present', () => {
    const el = makeEl({ id: 'c-1', 'group-id': 'g-work' }, 'Q2 plan');
    expect(parseKaiConversationElement(el).groupId).toBe('g-work');
  });

  it('sets groupId to undefined when group-id attribute is absent', () => {
    const el = makeEl({ id: 'c-1' }, 'Q2 plan');
    expect(parseKaiConversationElement(el).groupId).toBeUndefined();
  });

  it('falls back to empty string for missing id attribute', () => {
    const el = makeEl({}, 'Untitled');
    expect(parseKaiConversationElement(el).id).toBe('');
  });

  it('leaves optional fields absent instead of fabricating them (F-10)', () => {
    const el = makeEl({ id: 'c-1' }, 'Q2 plan');
    const item = parseKaiConversationElement(el);
    // A `<kai-conversation>` child carries no scope and no message timestamp,
    // so the parse must not invent them: `scope` used to be fabricated as
    // `{ type: 'collection' }` (the exact guess F-10 was filed against) and the
    // timestamps as the epoch, which rendered a bogus "many days ago" trailing.
    expect(item.scope).toBeUndefined();
    expect(item.lastMessageAt).toBeUndefined();
    // Still-required fields keep honest defaults: zero messages, and an empty
    // `updatedAt` from which relativeTimeShort derives NO trailing text at all.
    expect(item.messageCount).toBe(0);
    expect(item.updatedAt).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Merge: prop conversations + slotted conversations combine correctly
// ---------------------------------------------------------------------------

describe('conversation merge order', () => {
  /** Minimal render harness that outputs a button per conversation. */
  function ConvList(props: { items: ConversationSummary[]; onSelect: (id: string) => void }) {
    return (
      <div>
        <For each={props.items}>
          {(c) => (
            <button type="button" onClick={() => props.onSelect(c.id)}>
              {c.title}
            </button>
          )}
        </For>
      </div>
    );
  }

  it('renders one item per conversation', () => {
    const items: ConversationSummary[] = [
      { id: 'c-1', title: 'First', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: '', updatedAt: '' },
      { id: 'c-2', title: 'Second', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: '', updatedAt: '' },
    ];
    const { getByText } = render(() => <ConvList items={items} onSelect={() => {}} />);
    expect(getByText('First')).toBeInTheDocument();
    expect(getByText('Second')).toBeInTheDocument();
  });

  it('fires onSelect with the conversation id when an item is clicked', () => {
    const onSelect = vi.fn();
    const items: ConversationSummary[] = [
      { id: 'c-42', title: 'API plan', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: '', updatedAt: '' },
    ];
    const { getByText } = render(() => <ConvList items={items} onSelect={onSelect} />);
    fireEvent.click(getByText('API plan'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('c-42');
  });

  it('renders prop items before declarative (slotted) items', () => {
    const propItems: ConversationSummary[] = [
      { id: 'p-1', title: 'Prop conv', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: '', updatedAt: '' },
    ];
    const slottedItems: ConversationSummary[] = [
      { id: 's-1', title: 'Slotted conv', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: '', updatedAt: '' },
    ];
    const merged = [...propItems, ...slottedItems];

    const { getAllByRole } = render(() => <ConvList items={merged} onSelect={() => {}} />);
    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('Prop conv');
    expect(buttons[1]).toHaveTextContent('Slotted conv');
  });

  it('parseKaiConversationElement produces items that render and fire correct id', () => {
    const onSelect = vi.fn();
    const el = document.createElement('kai-conversation');
    el.setAttribute('id', 'c-99');
    el.textContent = 'My conversation';

    const parsed = parseKaiConversationElement(el);
    const { getByText } = render(() => <ConvList items={[parsed]} onSelect={onSelect} />);
    fireEvent.click(getByText('My conversation'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('c-99');
  });
});
