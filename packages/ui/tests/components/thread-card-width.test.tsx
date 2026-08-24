/**
 * K-D11 — a card in a thread fills the message column.
 *
 * The assistant row is a `flex flex-col` box laid out `items-start`, so every
 * child is a flex item with a fit-content cross size: `min(max-content,
 * column)`. Prose is wider than the column so a text bubble looks right; a form
 * card is as wide as its widest button, which is how the ops-console
 * parameters card measured 285px inside a 768px column while the approval card
 * beside it measured the full 768.
 *
 * The fix is `items-stretch` on the ASSISTANT row only. Stretch is the right
 * lever rather than `w-full` on the card, because it leaves any child that
 * states its own width alone (`Attachments variant="grid"` is `w-fit`) and it
 * matches what `Tool` and `Reasoning` already ask for explicitly (`w-full`).
 * The user row keeps `items-end` — a user bubble is `max-w-[85%]` and right
 * aligned, and stretching it would break both.
 *
 * WHAT THIS TEST CAN AND CANNOT SEE. jsdom has no layout, so it pins the
 * LAYOUT CONTRACT — which alignment each row asks for, and that a card part is
 * really a direct flex item of that row. The measured consequence (form card
 * width == column width) is only observable in a real browser; that check lives
 * in the IVP script alongside the two-cards-in-one-thread comparison, because a
 * check written as "the card is narrow" passes against the card that looks fine.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { ChatThread } from '../../src/components/chat-thread';
import type { ChatMessage } from '../../src/elements/chat-types';

if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
vi.mock('../../src/primitives/toast-store', () => {
  const fn = Object.assign(() => {}, { success: () => {}, dismiss: vi.fn(), clear: vi.fn() });
  return { toast: fn };
});

afterEach(cleanup);

const CARD_MESSAGE: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [
    {
      type: 'card',
      envelope: {
        type: 'form',
        id: 'params',
        title: 'Parameters',
        data: {
          type: 'object',
          properties: { ticket: { type: 'string', title: 'Change ticket' } },
        },
      },
    },
  ],
};

const USER_MESSAGE: ChatMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text: 'deploy it' }],
};

function rowOf(container: HTMLElement, role: 'user' | 'assistant'): HTMLElement {
  const row = container.querySelector(`[part~="row"][data-role="${role}"]`);
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

describe('assistant rows stretch their cards to the column (K-D11)', () => {
  it('lays the assistant row out items-stretch, not items-start', () => {
    const { container } = render(() => <ChatThread messages={[CARD_MESSAGE]} />);
    const row = rowOf(container, 'assistant');
    expect(row.className).toContain('items-stretch');
    expect(row.className.split(/\s+/)).not.toContain('items-start');
  });

  it('puts the card part directly in that stretched row', () => {
    const { container } = render(() => <ChatThread messages={[CARD_MESSAGE]} />);
    const row = rowOf(container, 'assistant');
    // The card renders through CardRenderer; find it by its heading and walk up
    // to the child of the row that carries it. That child is the flex item
    // whose cross size the row's alignment decides.
    const heading = container.querySelector('[data-card-id], [data-slot="card"]')
      ?? Array.from(container.querySelectorAll('*')).find((el) => el.textContent === 'Parameters');
    expect(heading).toBeTruthy();
    let item = heading as HTMLElement;
    while (item.parentElement && item.parentElement !== row) item = item.parentElement;
    expect(item.parentElement).toBe(row);
    // Nothing in between may pin a narrower width.
    expect(item.className).not.toContain('w-fit');
    expect(item.className).not.toContain('max-w-');
  });

  it('leaves the user row right-aligned so its bubble keeps its natural width', () => {
    const { container } = render(() => <ChatThread messages={[USER_MESSAGE]} />);
    const row = rowOf(container, 'user');
    expect(row.className).toContain('items-end');
    expect(row.className).not.toContain('items-stretch');
  });
});
