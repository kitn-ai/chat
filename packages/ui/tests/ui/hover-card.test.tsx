import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { HoverCardRoot, HoverCardTrigger, HoverCardContent } from '../../src/ui/hover-card';

// jsdom (v24) does not implement the PointerEvent constructor. fireEvent.pointerEnter/Leave
// need it. Real browsers implement PointerEvent, so this is a jsdom-only shim. We extend
// MouseEvent so .target / bubbling behave like a real pointer event.
if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params?: PointerEventInit) {
      super(type, params);
    }
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  return render(() => (
    <HoverCardRoot openDelay={100} closeDelay={100}>
      <HoverCardTrigger><button data-testid="trg">trigger</button></HoverCardTrigger>
      <HoverCardContent><div data-testid="content">card</div></HoverCardContent>
    </HoverCardRoot>
  ));
}

describe('HoverCard determinism (HC-1)', () => {
  it('opens after openDelay on enter and stays deterministic across repeated cycles', async () => {
    setup();
    const trg = screen.getByTestId('trg').parentElement!;
    for (let i = 0; i < 5; i++) {
      fireEvent.pointerEnter(trg);
      vi.advanceTimersByTime(100);
      expect(screen.queryByTestId('content')).toBeTruthy();
      fireEvent.pointerLeave(trg);
      vi.advanceTimersByTime(100);
      // createPresence unmounts on the next microtask in jsdom — flush it.
      await Promise.resolve();
      expect(screen.queryByTestId('content')).toBeNull();
    }
  });

  it('pointer transit trigger -> content keeps it open', () => {
    setup();
    const trg = screen.getByTestId('trg').parentElement!;
    fireEvent.pointerEnter(trg);
    vi.advanceTimersByTime(100);
    const content = screen.getByTestId('content').closest('[data-hovercard-content]')!;
    fireEvent.pointerLeave(trg);
    fireEvent.pointerEnter(content); // enters before closeDelay elapses
    vi.advanceTimersByTime(100);
    expect(screen.queryByTestId('content')).toBeTruthy();
  });

  /**
   * ★ MOVE FOCUS. DO NOT FIRE AT IT.
   *
   * This test used to read:
   *
   *     const trg = screen.getByTestId('trg').parentElement!;
   *     fireEvent.focusIn(trg);
   *
   * — which synthesises the event on the trigger span. That proves the handler
   * is WIRED and says nothing about whether focus can ever ARRIVE there, and it
   * sat on top of a path that was broken the whole time it was green: the
   * trigger never set `tabindex`, so a real Tab key skipped straight past it and
   * `onFocusIn` was unreachable from any keyboard.
   *
   * It stayed green for two reasons worth remembering. The synthetic event is
   * the first. The second is that this harness happens to put a `<button>`
   * inside the trigger, and `focusin` BUBBLES — so even a version of this test
   * that focused something real would have passed here while the inert-children
   * case (an attachment tile: a div, an img, an svg) had no tab stop at all.
   *
   * So both shapes are covered below, and both move focus for real.
   */
  it('opens on focus that a keyboard could actually deliver — delegating case', () => {
    setup();
    const button = screen.getByTestId('trg');

    // Real focus, and assert it LANDED before believing anything downstream.
    button.focus();
    expect(document.activeElement).toBe(button);

    vi.advanceTimersByTime(100);
    expect(screen.queryByTestId('content')).toBeTruthy();
  });

  it('opens on focus that a keyboard could actually deliver — inert children', () => {
    // No `<button>` to delegate to. This is the shape that was unreachable, and
    // the assertion that fails on the old trigger.
    const { container } = render(() => (
      <HoverCardRoot openDelay={100} closeDelay={100}>
        <HoverCardTrigger><div>a tile with no controls in it</div></HoverCardTrigger>
        <HoverCardContent><div data-testid="inert-content">card</div></HoverCardContent>
      </HoverCardRoot>
    ));

    const trigger = container.querySelector('span') as HTMLElement;
    trigger.focus();
    expect(document.activeElement, 'the trigger itself must be able to hold focus').toBe(trigger);

    vi.advanceTimersByTime(100);
    expect(screen.queryByTestId('inert-content')).toBeTruthy();
  });

  it('focus transit trigger -> content keeps it open', async () => {
    setup();
    const trg = screen.getByTestId('trg').parentElement!;
    fireEvent.focusIn(trg);
    vi.advanceTimersByTime(100);
    const content = screen.getByTestId('content').closest('[data-hovercard-content]')!;
    fireEvent.focusOut(trg, { relatedTarget: content });
    fireEvent.focusIn(content);
    vi.advanceTimersByTime(100);
    expect(screen.queryByTestId('content')).toBeTruthy();
  });

  it('Escape closes immediately (no closeDelay wait)', async () => {
    setup();
    const trg = screen.getByTestId('trg').parentElement!;
    fireEvent.pointerEnter(trg);
    vi.advanceTimersByTime(100);
    expect(screen.queryByTestId('content')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await Promise.resolve(); // microtask unmount
    expect(screen.queryByTestId('content')).toBeNull();
  });
});

describe('HoverCard safe-area (transparent-gap bridge + closeDelay default)', () => {
  // No explicit delays -> openDelay defaults to 0, closeDelay defaults to 300.
  function setupDefaults() {
    return render(() => (
      <HoverCardRoot>
        <HoverCardTrigger><button data-testid="trg">trigger</button></HoverCardTrigger>
        <HoverCardContent class="w-80"><div data-testid="content">card</div></HoverCardContent>
      </HoverCardRoot>
    ));
  }

  it('renders an outer shell (data-hovercard-content) wrapping an inner visual card', () => {
    setupDefaults();
    const trg = screen.getByTestId('trg').parentElement!;
    fireEvent.pointerEnter(trg);
    vi.advanceTimersByTime(0); // openDelay default 0
    const shell = document.querySelector('[data-hovercard-content]') as HTMLElement;
    expect(shell).toBeTruthy();
    // Outer shell holds the positioning + transparent background, NOT the card classes.
    expect(shell.style.position).toBe('fixed');
    expect(shell.className).toContain('z-50');
    expect(shell.className).not.toContain('bg-card');
    // The safe-area padding bridges the gap (default placement 'bottom' -> padding-top).
    expect(shell.style.paddingTop).toBe('8px');
    // Inner card carries the visual classes, the consumer class, and presence state.
    const inner = shell.firstElementChild as HTMLElement;
    expect(inner.className).toContain('bg-card');
    expect(inner.className).toContain('rounded-lg');
    expect(inner.className).toContain('w-80'); // consumer-controlled sizing
    expect(inner.hasAttribute('data-expanded')).toBe(true);
    expect(inner.contains(screen.getByTestId('content'))).toBe(true);
  });

  it('stays open across a short advance because closeDelay defaults to 300ms', () => {
    setupDefaults();
    const trg = screen.getByTestId('trg').parentElement!;
    fireEvent.pointerEnter(trg);
    vi.advanceTimersByTime(0);
    expect(screen.queryByTestId('content')).toBeTruthy();
    // Leave the trigger, then advance LESS than the 300ms default close window.
    fireEvent.pointerLeave(trg);
    vi.advanceTimersByTime(100);
    expect(screen.queryByTestId('content')).toBeTruthy(); // still open at 100ms
  });

  it('closes after the 300ms default closeDelay elapses', async () => {
    setupDefaults();
    const trg = screen.getByTestId('trg').parentElement!;
    fireEvent.pointerEnter(trg);
    vi.advanceTimersByTime(0);
    fireEvent.pointerLeave(trg);
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(screen.queryByTestId('content')).toBeNull();
  });
});
