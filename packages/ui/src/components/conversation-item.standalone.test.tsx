/**
 * F-45 tier 2 (owner-ruled 2026-08-25): STANDALONE-ONLY activation for
 * `<kai-conversation-item>`.
 *
 * Strategy (the toast.declarative.test.tsx pattern): `defineWebComponent`
 * registers a real Shadow-DOM custom element unsuitable for jsdom, so the two
 * halves are tested against the pieces the facade composes:
 *
 *   1. `isStandaloneConversationItem` — the facade's inside/outside decision,
 *      derived from the container's own `:scope > kai-conversation-item`
 *      membership rule.
 *   2. `SlottedConversationItem` with `onActivate` — the standalone activation
 *      contract on the row BODY (tabbable, role button, click + Enter/Space),
 *      and, with `onActivate` absent (what the facade passes inside a
 *      container), the row stays exactly as before: not tabbable, no
 *      component-level activation — so the container's `kai-conversation-select`
 *      path stays the ONLY one and nothing double-fires.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { SlottedConversationItem } from './conversation-item';
import { isStandaloneConversationItem, createConversationItemsController } from './conversation-list';

afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────────────
// isStandaloneConversationItem — the inside/outside decision
// ─────────────────────────────────────────────────────────────────────────────

describe('isStandaloneConversationItem', () => {
  it('is false for a direct child of <kai-conversations> (the container runs activation)', () => {
    const container = document.createElement('kai-conversations');
    const item = document.createElement('kai-conversation-item');
    container.appendChild(item);
    expect(isStandaloneConversationItem(item)).toBe(false);
  });

  it('is true outside any <kai-conversations>', () => {
    const rail = document.createElement('div');
    const item = document.createElement('kai-conversation-item');
    rail.appendChild(item);
    expect(isStandaloneConversationItem(item)).toBe(true);
  });

  it('is true for an item WRAPPED inside <kai-conversations> — the container manages only direct children (:scope >)', () => {
    // The container's item mode queries `:scope > kai-conversation-item`, so a
    // wrapper-nested item is invisible to its controller. Standalone activation
    // must follow the same membership rule, or such an item would be inert with
    // no path to activation at all.
    const container = document.createElement('kai-conversations');
    const wrapper = document.createElement('div');
    const item = document.createElement('kai-conversation-item');
    wrapper.appendChild(item);
    container.appendChild(wrapper);
    expect(isStandaloneConversationItem(item)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SlottedConversationItem — standalone activation on the row body
// ─────────────────────────────────────────────────────────────────────────────

function body(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-kai-item-body]') as HTMLElement;
}

describe('SlottedConversationItem — standalone activation (onActivate set)', () => {
  it('the row body is the activation control: role button, tabbable', () => {
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c-1" onActivate={() => {}}>Q2 plan</SlottedConversationItem>
    ));
    const b = body(container);
    expect(b).toHaveAttribute('role', 'button');
    expect(b).toHaveAttribute('tabindex', '0');
  });

  it('click on the body activates once', () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c-1" onActivate={onActivate}>Q2 plan</SlottedConversationItem>
    ));
    fireEvent.click(body(container));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('Enter and Space on the body activate, with the default prevented (no page scroll on Space)', () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c-1" onActivate={onActivate}>Q2 plan</SlottedConversationItem>
    ));
    const b = body(container);
    const enter = fireEvent.keyDown(b, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(enter).toBe(false); // fireEvent returns false when defaultPrevented
    const space = fireEvent.keyDown(b, { key: ' ' });
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(space).toBe(false);
  });

  it('other keys do not activate', () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c-1" onActivate={onActivate}>Q2 plan</SlottedConversationItem>
    ));
    fireEvent.keyDown(body(container), { key: 'ArrowDown' });
    fireEvent.keyDown(body(container), { key: 'a' });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('a click in the menu region never activates the row (the menu is the body\'s sibling)', () => {
    const onActivate = vi.fn();
    const { container } = render(() => (
      <SlottedConversationItem
        conversationId="c-1"
        onActivate={onActivate}
        menu={<button data-testid="row-menu">…</button>}
      >
        Q2 plan
      </SlottedConversationItem>
    ));
    fireEvent.click(container.querySelector('[data-testid="row-menu"]') as HTMLElement);
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe('SlottedConversationItem — inside a container (onActivate absent), nothing changes', () => {
  it('the body is not tabbable and carries no component-level activation', () => {
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c-1">Q2 plan</SlottedConversationItem>
    ));
    const b = body(container);
    expect(b).not.toHaveAttribute('tabindex');
    // No listener throws / no observable activation channel — the container's
    // controller is the only path. (The click below simply bubbles.)
    fireEvent.click(b);
    fireEvent.keyDown(b, { key: 'Enter' });
  });

  it('the container\'s controller stays the SINGLE activation path — one select per click, no double-fire', () => {
    // The facade passes onActivate only when standalone, so inside a container
    // the component contributes no handler: the container's delegated click is
    // the one and only activation. Wire the ratified controller over the
    // rendered row exactly as `kai-conversations` does and count.
    const onSelect = vi.fn();
    const { container } = render(() => (
      <SlottedConversationItem conversationId="c-7">Q2 plan</SlottedConversationItem>
    ));
    // Stand-in for the element host the controller manages (jsdom cannot
    // upgrade the real facade): the render container carries the identity the
    // way the host attribute does.
    container.setAttribute('conversation-id', 'c-7');
    const controller = createConversationItemsController({
      getItems: () => [container as HTMLElement],
      getActiveId: () => undefined,
      onSelect,
    });
    container.addEventListener('click', (e) => controller.handleClick(e as MouseEvent));
    fireEvent.click(body(container));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('c-7');
  });
});
