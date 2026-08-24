import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { useStickToBottom } from './use-stick-to-bottom';
import { installFakeClock } from '../test-utils/fake-clock';

/** Drive requestAnimationFrame manually so disposal-vs-frame ordering is deterministic. */
const { advance, isFramePending } = installFakeClock();

/**
 * A container stub shaped like what a MutationObserver callback fires
 * against: real scroll geometry, no `scrollTo` -- jsdom implements no
 * `scrollTo` (see class doc on `use-stick-to-bottom.ts`), and vitest's own
 * unhandled-error listener is what turned that gap into a flake: the
 * `TypeError: containerEl.scrollTo is not a function` was thrown from inside
 * a requestAnimationFrame callback that ran after its owning test had torn
 * down, so it surfaced as an "Unhandled Error" against the NEXT test rather
 * than a normal assertion failure.
 */
function makeContainer() {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });
  return el;
}

describe('useStickToBottom', () => {
  it('scrolls to bottom via scrollTo when new content lands while stuck', async () => {
    await createRoot(async (dispose) => {
      const { ref } = useStickToBottom();
      const el = makeContainer();
      const scrollTo = vi.fn();
      // jsdom containers have no scrollTo at all; give this one a real spy so
      // the happy path is still verified.
      (el as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
      ref(el);

      el.appendChild(document.createElement('span'));
      await Promise.resolve(); // MutationObserver callbacks fire as a microtask
      advance(16);

      expect(scrollTo).toHaveBeenCalledTimes(1);
      dispose();
    });
  });

  it('does not throw when the container has no scrollTo -- falls back to scrollTop', async () => {
    await createRoot(async (dispose) => {
      const { ref } = useStickToBottom();
      const el = makeContainer();
      expect(typeof (el as unknown as { scrollTo?: unknown }).scrollTo).toBe('undefined');
      ref(el);

      el.appendChild(document.createElement('span'));
      await Promise.resolve();
      expect(() => advance(16)).not.toThrow();
      expect(el.scrollTop).toBe(1000);
      dispose();
    });
  });

  // The real bug: onNewContent's requestAnimationFrame call outlived the
  // primitive's owner. Disposing BEFORE the frame fires must cancel it, so
  // the callback never runs against a torn-down container -- in a browser
  // that would touch a dead DOM node; under vitest it is exactly the stray
  // async callback that threw as an "Unhandled Error" from a LATER test.
  it('cancels the pending scroll frame on dispose, before it ever fires', async () => {
    let el!: HTMLElement;
    const dispose = createRoot((d) => {
      const { ref } = useStickToBottom();
      el = makeContainer();
      ref(el);
      return d;
    });

    el.appendChild(document.createElement('span'));
    await Promise.resolve(); // MutationObserver callbacks fire as a microtask
    expect(isFramePending()).toBe(true);

    dispose();
    expect(isFramePending()).toBe(false);

    // Flushing time after disposal must not throw and must not touch
    // scrollTo/scrollTop -- the frame was cancelled, not merely raced.
    const scrollTopBefore = el.scrollTop;
    expect(() => advance(16)).not.toThrow();
    expect(el.scrollTop).toBe(scrollTopBefore);
  });
});
