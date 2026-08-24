import { createSignal, onCleanup } from 'solid-js';

const SCROLL_THRESHOLD = 50;

export function useStickToBottom() {
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  let containerEl: HTMLElement | undefined;
  let shouldStick = true;

  function checkIfAtBottom() {
    if (!containerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    const atBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
    setIsAtBottom(atBottom);
    shouldStick = atBottom;
  }

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    if (!containerEl) return;
    if (typeof containerEl.scrollTo === 'function') {
      containerEl.scrollTo({ top: containerEl.scrollHeight, behavior });
    } else {
      containerEl.scrollTop = containerEl.scrollHeight;
    }
    shouldStick = true;
    setIsAtBottom(true);
  }

  let pendingFrame: number | undefined;

  /**
   * `cancelAnimationFrame`, captured at SETUP -- not called bare at cleanup.
   *
   * Cleanup is not guaranteed to run while the page that mounted this
   * primitive is still standing: a host can tear its DOM globals down first
   * (`component-register`'s `disconnectedCallback` defers a microtask; a
   * test environment deletes the globals synchronously right after
   * detaching). A bare `cancelAnimationFrame` there throws, surfacing as an
   * unhandled rejection that fails a run in which every test passed --
   * see tests/components/teardown-without-dom-globals.test.tsx, and the
   * same pattern in create-tween.ts.
   *
   * Guarded because "setup" here is the component body, and a server render
   * executes component bodies too; Node has neither global.
   */
  const cancelFrame = typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame.bind(globalThis)
    : () => {};

  function onNewContent() {
    if (shouldStick) {
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = undefined;
        scrollToBottom('instant');
      });
    }
  }

  function ref(el: HTMLElement) {
    containerEl = el;
    el.addEventListener('scroll', checkIfAtBottom, { passive: true });
    const observer = new MutationObserver(onNewContent);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    onCleanup(() => {
      el.removeEventListener('scroll', checkIfAtBottom);
      observer.disconnect();
      if (pendingFrame !== undefined) {
        cancelFrame(pendingFrame);
        pendingFrame = undefined;
      }
    });
  }

  return { ref, isAtBottom, scrollToBottom };
}
