/**
 * Unit tests for Tooltip.
 *
 * Tooltips open on hover/focus and close on pointer-leave/blur. But when the
 * trigger is an action button (copy / 👍 / 👎), clicking it never fires a
 * pointer-leave, so the tooltip lingers over the thing you just acted on. The
 * trigger therefore dismisses on click/pointerdown by default, and resets its
 * internal hover/focus flags so it stays closed until a genuine new hover/focus.
 * `dismissOnClick={false}` opts out.
 */
import { flush } from 'solid-js';
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, within } from '@solidjs/testing-library';
import { Tooltip } from './tooltip';

afterEach(cleanup);

// createPresence unmounts on a microtask when there is no exit animation (jsdom),
// so flush the queue before asserting the tooltip node has left the DOM.
const tick = () => new Promise((r) => setTimeout(r, 0));

// The tooltip content renders through a Portal mounted onto document.body — a
// *sibling* of the render container — so the render result's container-scoped
// queries can't see it. Query the whole document instead.
const tooltip = () => within(document.body).queryByRole('tooltip');

describe('Tooltip', () => {
  it('shows the tooltip on hover and hides it on pointer-leave', async () => {
    const { getByText } = render(() => (
      <Tooltip content="Copy">
        <button>Copy</button>
      </Tooltip>
    ));
    const trigger = getByText('Copy');
    expect(tooltip()).not.toBeInTheDocument();

    // openDelay defaults to 600ms on pointer-enter — focus opens immediately.
    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(tooltip()).toBeInTheDocument();

    fireEvent.focusOut(trigger, { relatedTarget: document.body });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await tick();
    expect(tooltip()).not.toBeInTheDocument();
  });

  it('dismisses on trigger click by default', async () => {
    const { getByText } = render(() => (
      <Tooltip content="Copy">
        <button>Copy</button>
      </Tooltip>
    ));
    const trigger = getByText('Copy');
    const triggerSpan = trigger.parentElement!; // <As as="span"> carries the aria + handlers

    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(tooltip()).toBeInTheDocument();

    fireEvent.click(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    // click closes open() synchronously — aria-describedby is the reliable signal
    // (the portal node lingers one microtask via createPresence's exit handling).
    expect(triggerSpan).not.toHaveAttribute('aria-describedby');
    await tick();
    expect(tooltip()).not.toBeInTheDocument();
  });

  it('dismisses on trigger pointerdown by default', () => {
    const { getByText } = render(() => (
      <Tooltip content="Copy">
        <button>Copy</button>
      </Tooltip>
    ));
    const trigger = getByText('Copy');
    const triggerSpan = trigger.parentElement!;

    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(triggerSpan).toHaveAttribute('aria-describedby');

    fireEvent.pointerDown(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(triggerSpan).not.toHaveAttribute('aria-describedby');
  });

  it('clicking while still focused fully closes it (resets the focus-inside flag)', async () => {
    // The trigger keeps focus through the click, so maybeHide() would normally
    // be vetoed by focusInside. dismiss() resets that flag and force-closes, so
    // open() reaches false — observable via aria-describedby clearing.
    const { getByText } = render(() => (
      <Tooltip content="Copy">
        <button>Copy</button>
      </Tooltip>
    ));
    const trigger = getByText('Copy');
    const triggerSpan = trigger.parentElement!; // <As as="span"> carries the aria + handlers

    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(triggerSpan).toHaveAttribute('aria-describedby');
    expect(tooltip()).toBeInTheDocument();

    fireEvent.click(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await tick();
    // Without the flag reset, focusInside would keep open() true here.
    expect(triggerSpan).not.toHaveAttribute('aria-describedby');
    expect(tooltip()).not.toBeInTheDocument();
  });

  it('keeps the tooltip open on click/pointerdown when dismissOnClick={false}', () => {
    const { getByText } = render(() => (
      <Tooltip content="Copy" dismissOnClick={false}>
        <button>Copy</button>
      </Tooltip>
    ));
    const trigger = getByText('Copy');
    const triggerSpan = trigger.parentElement!; // <As as="span"> carries the aria link

    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(triggerSpan).toHaveAttribute('aria-describedby');
    expect(tooltip()).toBeInTheDocument();

    // Opted out — open() stays true through click and pointerdown. aria-describedby
    // is the reliable open() signal (the portal node's exit timing is animation-driven).
    fireEvent.click(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(triggerSpan).toHaveAttribute('aria-describedby');
    fireEvent.pointerDown(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(triggerSpan).toHaveAttribute('aria-describedby');
    expect(tooltip()).toBeInTheDocument();
  });
});
