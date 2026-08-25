/**
 * Unit tests for the `kai-scroll-button` scroll-target resolution logic.
 *
 * Strategy: `defineWebComponent` requires a real browser environment
 * (Constructable Stylesheets, shadow roots) and is not suitable for jsdom.
 * Instead we:
 *   1. Test the `findScrollableAncestor` helper in isolation — it only uses
 *      DOM APIs that jsdom provides.
 *   2. Test the Solid `Button` + visibility-toggle logic that drives the
 *      show/hide animation, using the underlying component directly (mirrors
 *      the pattern in `prompt-suggestions.declarative.test.tsx`).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { ChevronDown } from 'lucide-solid';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// findScrollableAncestor — re-implemented inline so we can test without
// importing the full element (which would call defineWebComponent).
// ---------------------------------------------------------------------------

function findScrollableAncestor(startEl: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = startEl.parentElement;
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    const overflow = style.overflow + style.overflowY;
    if (/auto|scroll/.test(overflow) && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

describe('findScrollableAncestor', () => {
  it('returns null when no scrollable ancestor exists', () => {
    const wrapper = document.createElement('div');
    const child = document.createElement('span');
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);
    expect(findScrollableAncestor(child)).toBeNull();
    document.body.removeChild(wrapper);
  });

  it('returns the first scrollable ancestor', () => {
    const scrollable = document.createElement('div');
    scrollable.style.overflow = 'auto';
    // jsdom doesn't do layout, so scrollHeight === clientHeight by default.
    // Force a difference by mocking.
    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 300, configurable: true });

    const child = document.createElement('div');
    scrollable.appendChild(child);
    document.body.appendChild(scrollable);

    expect(findScrollableAncestor(child)).toBe(scrollable);
    document.body.removeChild(scrollable);
  });

  it('skips non-scrollable ancestors', () => {
    const nonScrollable = document.createElement('div');
    const scrollable = document.createElement('div');
    scrollable.style.overflowY = 'scroll';
    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 300, configurable: true });

    const child = document.createElement('span');
    nonScrollable.appendChild(child);
    scrollable.appendChild(nonScrollable);
    document.body.appendChild(scrollable);

    expect(findScrollableAncestor(child)).toBe(scrollable);
    document.body.removeChild(scrollable);
  });
});

// ---------------------------------------------------------------------------
// Visibility toggle logic — ScrollButtonUI mirrors the render logic inside
// kai-scroll-button's facade.
// ---------------------------------------------------------------------------

/** Minimal SolidJS component that mirrors the button render in scroll-button.tsx. */
function ScrollButtonUI(props: {
  isAtBottom: () => boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Scroll to bottom"
      class={cn(
        'rounded-full transition-all duration-150 ease-out',
        !props.isAtBottom()
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-4 scale-95 opacity-0',
      )}
      onClick={props.onClick}
    >
      <ChevronDown class="h-5 w-5" />
    </Button>
  );
}

describe('scroll button visibility logic', () => {
  it('is visually hidden when at bottom (has opacity-0 class)', () => {
    const { getByRole } = render(() => (
      <ScrollButtonUI isAtBottom={() => true} onClick={() => {}} />
    ));
    const btn = getByRole('button', { name: /scroll to bottom/i });
    expect(btn.className).toMatch(/opacity-0/);
  });

  it('is visible when not at bottom (has opacity-100 class)', () => {
    const { getByRole } = render(() => (
      <ScrollButtonUI isAtBottom={() => false} onClick={() => {}} />
    ));
    const btn = getByRole('button', { name: /scroll to bottom/i });
    expect(btn.className).toMatch(/opacity-100/);
  });

  it('calls onClick when the button is clicked', () => {
    const onClick = vi.fn();
    const { getByRole } = render(() => (
      <ScrollButtonUI isAtBottom={() => false} onClick={onClick} />
    ));
    fireEvent.click(getByRole('button', { name: /scroll to bottom/i }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reacts to isAtBottom signal changes', () => {
    const [atBottom, setAtBottom] = createSignal(false);
    const { getByRole } = render(() => (
      <ScrollButtonUI isAtBottom={atBottom} onClick={() => {}} />
    ));
    const btn = getByRole('button', { name: /scroll to bottom/i });
    expect(btn.className).toMatch(/opacity-100/);
    setAtBottom(true);
    flush(); // V2-FLUSH: commit the staged write
    expect(btn.className).toMatch(/opacity-0/);
  });
});
