/**
 * Unit tests for HoverCardTrigger.
 *
 * The trigger renders as `<As as="span">` — a bare inline span. When the span
 * is dropped into a flex row (e.g. an attachment chip), an inline box doesn't
 * carry the children's block layout and the row collapses. The fix lets the
 * trigger carry layout classes itself, so callers can make it the flex row
 * instead of wrapping the content in an extra div.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { HoverCardRoot, HoverCardTrigger, HoverCardContent } from './hover-card';

afterEach(cleanup);

describe('HoverCardTrigger', () => {
  it('applies a forwarded class to the trigger element', () => {
    const { container } = render(() => (
      <HoverCardRoot>
        <HoverCardTrigger class="flex items-center gap-1.5">content</HoverCardTrigger>
      </HoverCardRoot>
    ));

    const trigger = container.querySelector('span');
    expect(trigger).toBeTruthy();
    expect(trigger!.className).toContain('flex');
    expect(trigger!.className).toContain('items-center');
  });
});

/**
 * ★ THE FOCUS-OPEN PATH, MEASURED BY MOVING FOCUS RATHER THAN BY FIRING AT IT.
 *
 * `HoverCardTrigger` has carried `onFocusIn`/`onFocusOut` since it was written,
 * and `tests/ui/hover-card.test.tsx:56` has asserted "opens on focus (keyboard)"
 * for just as long — by calling `fireEvent.focusIn(trigger)`. Synthesising the
 * event proves the handler is wired; it proves nothing about whether focus can
 * ever ARRIVE there. It could not: the trigger is a bare `<span>` and never set
 * `tabindex`, so on a real keyboard the Tab key skipped straight past it and
 * both handlers were unreachable.
 *
 * That went unnoticed because every consumer that existed when the handlers were
 * written put a focusable element INSIDE the trigger — `source.tsx` an `<a>`,
 * `context.tsx` a `<Button>` — and `focusin` bubbles, so the card opened via the
 * child. The first consumer with inert children (an attachment tile: a div, an
 * img, an svg) had no tab stop at all.
 *
 * So these tests move focus for real (`el.focus()`, then check
 * `document.activeElement`) and cover BOTH shapes, because the fix has to serve
 * the inert case without giving the delegating case a second tab stop.
 */
describe('HoverCardTrigger keyboard reachability', () => {
  // `enter()` schedules the open on a timer even at openDelay 0, so focus and
  // the assertion are separated by a macrotask. Same shape as tests/ui/hover-card.test.tsx.
  const openAfterFocus = (el: HTMLElement) => {
    vi.useFakeTimers();
    try {
      el.focus();
      vi.advanceTimersByTime(50);
      return document.querySelector('[data-testid="card"]');
    } finally {
      vi.useRealTimers();
    }
  };

  const focusable = (el: Element | null) => {
    (el as HTMLElement).focus();
    return document.activeElement === el;
  };

  it('takes focus itself when nothing inside it can', () => {
    const { container } = render(() => (
      <HoverCardRoot openDelay={0}>
        <HoverCardTrigger>
          <div>a tile with no controls in it</div>
        </HoverCardTrigger>
        <HoverCardContent><div data-testid="card">details</div></HoverCardContent>
      </HoverCardRoot>
    ));

    const trigger = container.querySelector('span');
    expect(trigger).toBeTruthy();
    // The claim is reachability, not the attribute — `.focus()` on a span with
    // no tabindex is a no-op, which is exactly the bug.
    expect(focusable(trigger), 'trigger must be able to hold focus').toBe(true);
  });

  it('opens the card when focus actually lands on it', () => {
    render(() => (
      <HoverCardRoot openDelay={0}>
        <HoverCardTrigger>
          <div>a tile with no controls in it</div>
        </HoverCardTrigger>
        <HoverCardContent><div data-testid="card">details</div></HoverCardContent>
      </HoverCardRoot>
    ));

    const trigger = document.querySelector('span') as HTMLElement;
    expect(openAfterFocus(trigger)).toBeTruthy();
  });

  it('does NOT add a second tab stop when the children are already focusable', () => {
    // The `source.tsx` / `context.tsx` shape. Two tab stops for one card would
    // be a regression for every existing consumer, so the trigger delegates.
    const { container } = render(() => (
      <HoverCardRoot openDelay={0}>
        <HoverCardTrigger>
          <a href="https://example.com" data-testid="link">a source</a>
        </HoverCardTrigger>
        <HoverCardContent><div data-testid="card">details</div></HoverCardContent>
      </HoverCardRoot>
    ));

    const trigger = container.querySelector('span') as HTMLElement;
    expect(trigger.hasAttribute('tabindex'), 'delegating trigger must not be a tab stop').toBe(false);

    // ...and the delegated path still opens the card, so nothing is lost.
    expect(openAfterFocus(container.querySelector('[data-testid="link"]') as HTMLElement)).toBeTruthy();
  });

  it('draws a focus ring only on the trigger that is actually the tab stop', () => {
    const inert = render(() => (
      <HoverCardRoot><HoverCardTrigger><div>tile</div></HoverCardTrigger></HoverCardRoot>
    ));
    // An OUTLINE with a negative offset, not a ring. Both choices were forced
    // by measurement in a real browser: a Tailwind v4 ring computes to
    // `box-shadow: none` inside a shadow root (its `@property` defaults never
    // register through `adoptedStyleSheets`), and an outward indicator is
    // clipped away by the attachment tile's `overflow-hidden`. jsdom can only
    // check the classes are on the element; the browser pass is what proves
    // they paint.
    const inertClass = (inert.container.querySelector('span') as HTMLElement).className;
    expect(inertClass).toContain('focus-visible:outline-2');
    expect(inertClass).toContain('focus-visible:-outline-offset-2');
    // The literal style is load-bearing — `outline-2` alone routes the STYLE
    // through a var that resolves to nothing here.
    expect(inertClass).toContain('focus-visible:[outline-style:solid]');
    inert.unmount();

    // A delegating trigger must not ring itself around the child's focus.
    const delegating = render(() => (
      <HoverCardRoot><HoverCardTrigger><a href="https://example.com">link</a></HoverCardTrigger></HoverCardRoot>
    ));
    expect((delegating.container.querySelector('span') as HTMLElement).className)
      .not.toContain('focus-visible:outline-2');
  });

  it('honours an explicit focusable override in both directions', () => {
    const { container, unmount } = render(() => (
      <HoverCardRoot openDelay={0}>
        <HoverCardTrigger focusable={false}><div>inert</div></HoverCardTrigger>
      </HoverCardRoot>
    ));
    expect((container.querySelector('span') as HTMLElement).hasAttribute('tabindex')).toBe(false);
    unmount();

    const second = render(() => (
      <HoverCardRoot openDelay={0}>
        <HoverCardTrigger focusable><a href="https://example.com">link</a></HoverCardTrigger>
      </HoverCardRoot>
    ));
    expect((second.container.querySelector('span') as HTMLElement).tabIndex).toBe(0);
  });
});
