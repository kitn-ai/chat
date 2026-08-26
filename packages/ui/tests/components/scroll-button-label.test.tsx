/**
 * GUARD — the ScrollButton's accessible name across both `showLabel` states.
 *
 * WHY THIS EXISTS. `label` and `showLabel` were split precisely so the icon-only
 * button (the common case) does not carry a hardcoded English `aria-label` a
 * consumer cannot localise, and so the labelled button is not announced twice.
 * Both halves are invisible in a diff and neither shows up in a screenshot: the
 * failure mode is a screen reader saying "Scroll to bottom Scroll to bottom", or
 * saying "Scroll to bottom" when the consumer asked for "Jump to latest".
 *
 * The name assertions go through `toHaveAccessibleName`, which runs a real
 * accessible-name computation (dom-accessibility-api) rather than reading the
 * `aria-label` attribute back. That is what makes the no-double-announcement
 * case expressible at all: with an `aria-label` AND visible text the computed
 * name is still one string, so only checking the attribute's ABSENCE alongside
 * the visible text tells you the visible text is what wins.
 *
 * WHAT JSDOM CANNOT DO HERE, stated rather than faked: jsdom performs no layout
 * and does not load the element stylesheet, so `getComputedStyle` returns
 * nothing useful for `background-color`, `border-radius` or `box-shadow`. The
 * opacity, radius, elevation and contrast claims were measured in a real
 * Chromium against the Storybook story and are NOT asserted here; what is
 * asserted below about the surface is only that the class contract carrying them
 * is present (an opaque `bg-card`, not the half-transparent `bg-muted/50` the
 * shared `outline` variant supplies, and no `rounded-full`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { ScrollButton } from '../../src/components/scroll-button';
import { ChatContainerRoot, ChatContainerContent } from '../../src/components/chat-container';

afterEach(cleanup);

/**
 * Mount the button in its VISIBLE state. While pinned to the bottom the button
 * is deliberately `aria-hidden`, and an accessible-name computation over a
 * hidden element correctly returns the empty string, so a naive mount would
 * assert nothing about the name. jsdom does no layout, so "scrolled up" has to
 * be faked the way the primitive reads it: `scrollHeight - scrollTop -
 * clientHeight` past `useStickToBottom`'s 50px threshold, then a `scroll` event.
 */
function mount(props: Parameters<typeof ScrollButton>[0] = {}) {
  const out = render(() => (
    <ChatContainerRoot>
      <ChatContainerContent>content</ChatContainerContent>
      <ScrollButton {...props} />
    </ChatContainerRoot>
  ));
  const container = out.container.querySelector('[role="log"]') as HTMLElement;
  Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  container.scrollTop = 0;
  container.dispatchEvent(new Event('scroll'));

  const btn = out.container.querySelector('button');
  if (!btn) throw new Error('no button rendered');
  if (btn.getAttribute('aria-hidden') === 'true') {
    throw new Error('button is still aria-hidden: the scrolled-up state did not take');
  }
  return btn;
}

describe('ScrollButton accessible name', () => {
  it('names the icon-only button from the default label', () => {
    const btn = mount();
    expect(btn).toHaveAccessibleName('Scroll to bottom');
    // Icon only: nothing visible to read, so the name has to come from aria-label.
    expect(btn.getAttribute('aria-label')).toBe('Scroll to bottom');
    expect(btn.textContent?.trim()).toBe('');
  });

  it('lets a consumer localise the icon-only name', () => {
    const btn = mount({ label: 'Zum Ende springen' });
    expect(btn).toHaveAccessibleName('Zum Ende springen');
  });

  it('renders the label visibly and takes the name from it, not a second aria-label', () => {
    const btn = mount({ showLabel: true, label: 'Jump to latest' });
    expect(btn).toHaveTextContent('Jump to latest');
    expect(btn).toHaveAccessibleName('Jump to latest');
    // The no-double-announcement half: with the text visible, an aria-label
    // would override it and the two could drift apart.
    expect(btn.hasAttribute('aria-label')).toBe(false);
  });

  it('shows the default label when showLabel is set without a label', () => {
    const btn = mount({ showLabel: true });
    expect(btn).toHaveTextContent('Scroll to bottom');
    expect(btn).toHaveAccessibleName('Scroll to bottom');
  });

  it('hides the arrow from assistive tech so it never doubles the name', () => {
    const svg = mount({ showLabel: true }).querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('ScrollButton floating surface (class contract only, see file header)', () => {
  it('is opaque and not a circle by default', () => {
    const cls = mount().className;
    expect(cls).toContain('bg-card');
    expect(cls).not.toContain('bg-muted/50');
    expect(cls).not.toContain('rounded-full');
    expect(cls).toContain('rounded-lg');
    expect(cls).toContain('kai-elevation');
    expect(cls).toContain('border-input');
  });
});
