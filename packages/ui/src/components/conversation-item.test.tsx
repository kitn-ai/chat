/**
 * A1 — the slotted-item API of `SlottedConversationItem` (the Solid component the
 * `kai-conversation-item` facade renders). Spec § 2a: default slot = title, plus
 * `meta` / `leading` / `menu` regions; active state reflected as `aria-selected`
 * plus a styling hook; `::part` names on the row regions (row, title, meta,
 * leading, menu). The data-mode `ConversationItem` is deliberately untouched by
 * this suite — `reactivity-contract.test.tsx` and the A4 coexistence file pin it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { SlottedConversationItem } from './conversation-item';

afterEach(cleanup);

describe('SlottedConversationItem', () => {
  it('renders the default slot (title) inside part="title"', () => {
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c1">Quarterly report</SlottedConversationItem>
    ));
    const title = container.querySelector('[part~="title"]');
    expect(title).not.toBeNull();
    expect(title!.textContent).toContain('Quarterly report');
  });

  it('renders leading, meta and menu regions with their part names', () => {
    const { container } = render(() => (
      <SlottedConversationItem
        conversationId="c1"
        leading={<span data-t="lead">L</span>}
        meta={<span data-t="meta">2h ago</span>}
        menu={<button data-t="menu">…</button>}
      >
        Title
      </SlottedConversationItem>
    ));
    for (const part of ['row', 'leading', 'meta', 'menu']) {
      expect(container.querySelector(`[part~="${part}"]`), `part "${part}"`).not.toBeNull();
    }
    expect(container.querySelector('[part~="leading"] [data-t="lead"]')).not.toBeNull();
    expect(container.querySelector('[part~="meta"] [data-t="meta"]')).not.toBeNull();
    expect(container.querySelector('[part~="menu"] [data-t="menu"]')).not.toBeNull();
  });

  it('omits the leading, meta and menu wrappers when nothing is projected', () => {
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c1">Title</SlottedConversationItem>
    ));
    for (const part of ['leading', 'meta', 'menu']) {
      expect(container.querySelector(`[part~="${part}"]`), `part "${part}"`).toBeNull();
    }
  });

  it('reflects active as aria-selected plus a styling hook, and updates reactively', () => {
    const [active, setActive] = createSignal(false);
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c1" active={active()}>Title</SlottedConversationItem>
    ));
    const row = container.querySelector('[part~="row"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.getAttribute('aria-selected')).toBe('false');
    expect(row.hasAttribute('data-active')).toBe(false);

    setActive(true);
    expect(row.getAttribute('aria-selected')).toBe('true');
    // The styling hook: a data attribute selectable from consumer CSS.
    expect(row.hasAttribute('data-active')).toBe(true);
  });

  it('the row carries role="option" and the menu region is guarded from activation semantics', () => {
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c1" menu={<button>…</button>}>Title</SlottedConversationItem>
    ));
    const row = container.querySelector('[part~="row"]') as HTMLElement;
    expect(row.getAttribute('role')).toBe('option');
    // The marker the container's activation guard keys off (see
    // createConversationItemsController): clicks whose composed path crosses this
    // node must not select the row.
    expect(container.querySelector('[part~="menu"]')!.hasAttribute('data-kai-item-menu')).toBe(true);
  });
});
