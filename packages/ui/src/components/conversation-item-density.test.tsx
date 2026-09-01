/**
 * P-7 (blocks-and-parts design 2026-08-31) — list density as public API plus
 * the unread dot.
 *
 * The composition spike's round 3 could match the facade widget panel's row
 * box only by smuggling padding through slotted spans around a PRIVATE
 * interior class. This file is that round's computed-style probe turned into
 * a test:
 *
 * - The `panel` density's row box is DERIVED from conversation-panel.tsx's
 *   SOURCE (the facade's actual row class), never restated, so if the facade
 *   density moves, `DENSITY_ROW_BOX.panel` must move with it or this fails.
 * - The class-to-pixel translation is asserted against the values the spike
 *   MEASURED off the live facade (phase3-fine-grain.md, round 3: px-3 py-2.5
 *   = 12px/10px padding, a 40px single-line row). jsdom has no layout engine,
 *   so real computed geometry runs in the block driver (V-1); what this test
 *   pins is that the public density resolves to the exact same utilities the
 *   facade paints, which is what makes the geometry equal by construction.
 * - No contortions: the panel presentation must be reachable with the ONE
 *   prop, no host padding, no slotted-span padding.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, cleanup } from '@solidjs/testing-library';
import {
  ConversationItem,
  SlottedConversationItem,
  DENSITY_ROW_BOX,
  resolveRowDensity,
} from './conversation-item';
import type { ConversationSummary } from '../types';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));

/** The facade widget panel's row padding utilities, read from the SOURCE of
 *  conversation-panel.tsx (its row button class carries `rounded-lg px-N py-N`;
 *  the only other px/py pair in the file, the floating pill, does not).
 *  Deriving here is what keeps `DENSITY_ROW_BOX.panel` a checked copy instead
 *  of a silent one: Tailwind compiles literal class strings, so the value
 *  cannot be imported at runtime. */
function facadePanelRowPadding(): { px: string; py: string } {
  const source = readFileSync(resolve(here, 'conversation-panel.tsx'), 'utf8');
  const match = source.match(/rounded-lg (px-[\d.]+) (py-[\d.]+)/);
  if (!match) throw new Error('conversation-panel.tsx row class not found: expected `rounded-lg px-N py-N` in its row button');
  return { px: match[1], py: match[2] };
}

/** Tailwind spacing scale: `px-3` -> 3 * 4px = 12px. The 4px unit is
 *  Tailwind's default 0.25rem step at the 16px root font size. */
function twSpacingPx(cls: string): number {
  const n = Number(cls.split('-')[1]);
  if (Number.isNaN(n)) throw new Error(`not a numeric spacing utility: ${cls}`);
  return n * 4;
}

const conv = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: 'c1',
  title: 'Where is my order?',
  messageCount: 3,
  updatedAt: '2026-08-30T12:00:00Z',
  lastMessageAt: '2026-08-30T12:00:00Z',
  ...over,
});

const UNREAD = { lastReadAt: '2026-08-30T11:00:00Z' }; // read BEFORE updatedAt
const READ = { lastReadAt: '2026-08-30T13:00:00Z' }; // read AFTER updatedAt

describe('the panel density row box is the facade panel row box, derived', () => {
  it('DENSITY_ROW_BOX.panel equals the padding utilities in conversation-panel.tsx source', () => {
    const { px, py } = facadePanelRowPadding();
    expect(DENSITY_ROW_BOX.panel).toBe(`${px} ${py}`);
  });

  it('those utilities translate to the round-3 measured geometry: 12px/10px padding, a 40px single-line row', () => {
    // Measured off the LIVE facade by the spike's fine-drive computed-style
    // probe (phase3-fine-grain.md round 3): row = px-3 py-2.5 = 12px/10px,
    // 40px tall. 40 = 10 + 20 + 10: the text-sm line (1.25rem = 20px at the
    // 16px root) between the two vertical paddings. The pixel literals are the
    // recorded measurement; the class names feeding them are derived above.
    const { px, py } = facadePanelRowPadding();
    expect(twSpacingPx(px)).toBe(12);
    expect(twSpacingPx(py)).toBe(10);
    const TEXT_SM_LINE_PX = 20;
    expect(twSpacingPx(py) * 2 + TEXT_SM_LINE_PX).toBe(40);
  });

  it('ConversationItem density="panel" paints exactly those utilities, one prop, no contortions', () => {
    const { px, py } = facadePanelRowPadding();
    const { container } = render(() => (
      <ConversationItem conversation={conv()} isActive={false} onSelect={() => {}} density="panel" />
    ));
    const row = container.querySelector('button')!;
    expect(row.classList.contains(px)).toBe(true);
    expect(row.classList.contains(py)).toBe(true);
    // and none of the other densities' padding
    for (const c of [...DENSITY_ROW_BOX.default.split(' '), ...DENSITY_ROW_BOX.compact.split(' ')]) {
      expect(row.classList.contains(c)).toBe(false);
    }
  });

  it('SlottedConversationItem density="panel" paints the same box (item mode reaches it too)', () => {
    const { px, py } = facadePanelRowPadding();
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c1" density="panel">Row</SlottedConversationItem>
    ));
    const row = container.querySelector('[part="row"]')!;
    expect(row.classList.contains(px)).toBe(true);
    expect(row.classList.contains(py)).toBe(true);
  });
});

describe('density defaults preserve existing behavior', () => {
  it('no density, no compact: the default box, unchanged', () => {
    const { container } = render(() => (
      <ConversationItem conversation={conv()} isActive={false} onSelect={() => {}} />
    ));
    const row = container.querySelector('button')!;
    for (const c of DENSITY_ROW_BOX.default.split(' ')) expect(row.classList.contains(c)).toBe(true);
    // default anatomy unchanged: the message-count subline still renders
    expect(row.textContent).toContain('3 messages');
  });

  it('the legacy compact boolean still means the compact box', () => {
    expect(resolveRowDensity(undefined, true)).toBe('compact');
    const { container } = render(() => (
      <ConversationItem conversation={conv()} isActive={false} onSelect={() => {}} compact />
    ));
    const row = container.querySelector('button')!;
    for (const c of DENSITY_ROW_BOX.compact.split(' ')) expect(row.classList.contains(c)).toBe(true);
  });

  it('an explicit density wins over compact', () => {
    expect(resolveRowDensity('panel', true)).toBe('panel');
    expect(resolveRowDensity('default', true)).toBe('default');
  });
});

describe('panel anatomy (the widget-box presentation)', () => {
  it('renders semibold title + relative time, and the trailing field as the preview line', () => {
    const { container } = render(() => (
      <ConversationItem
        conversation={conv({ trailing: 'Order KAI-1042 shipped with DHL' })}
        isActive={false}
        onSelect={() => {}}
        density="panel"
      />
    ));
    const row = container.querySelector('button')!;
    expect(row.textContent).toContain('Where is my order?');
    expect(row.textContent).toContain('Order KAI-1042 shipped with DHL');
    // no "N messages" subline in the panel presentation
    expect(row.textContent).not.toContain('messages');
  });
});

describe('unread dot (P-7b)', () => {
  it('ConversationItem: dot + sr-only label when isConversationUnread says so, in every density', () => {
    for (const density of ['default', 'compact', 'panel'] as const) {
      const { container, unmount } = render(() => (
        <ConversationItem conversation={conv(UNREAD)} isActive={false} onSelect={() => {}} density={density} />
      ));
      const row = container.querySelector('button')!;
      expect(row.hasAttribute('data-unread'), `data-unread in ${density}`).toBe(true);
      expect(row.querySelector('[part="unread"]'), `dot in ${density}`).toBeTruthy();
      expect(row.querySelector('.sr-only')?.textContent, `sr label in ${density}`).toBe('Unread');
      unmount();
    }
  });

  it('ConversationItem: no dot when read, and none when lastReadAt is absent (existing data unchanged)', () => {
    for (const over of [READ, {}]) {
      const { container, unmount } = render(() => (
        <ConversationItem conversation={conv(over)} isActive={false} onSelect={() => {}} />
      ));
      const row = container.querySelector('button')!;
      expect(row.hasAttribute('data-unread')).toBe(false);
      expect(row.querySelector('[part="unread"]')).toBeNull();
      unmount();
    }
  });

  it('SlottedConversationItem: the unread prop renders the dot INSIDE the activation body, before the menu sibling', () => {
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c1" unread menu={<button>menu</button>}>
        Row
      </SlottedConversationItem>
    ));
    const body = container.querySelector('[data-kai-item-body]')!;
    expect(body.querySelector('[part="unread"]')).toBeTruthy();
    // the menu region carries no dot: the dot is part of the row's own state
    const menu = container.querySelector('[data-kai-item-menu]')!;
    expect(menu.querySelector('[part="unread"]')).toBeNull();
  });

  it('SlottedConversationItem: no unread prop, no dot (unchanged rows stay unchanged)', () => {
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c1">Row</SlottedConversationItem>
    ));
    expect(container.querySelector('[part="unread"]')).toBeNull();
  });
});
