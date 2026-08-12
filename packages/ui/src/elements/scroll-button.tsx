import { createSignal, onCleanup, onMount } from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { ChevronDown } from 'lucide-solid';
import { defineWebComponent } from './define';

interface Props extends Record<string, unknown> {
  /** CSS id of the scroll container to control. When omitted the element
   *  walks up the DOM (outside its own shadow root) to find the nearest
   *  scrollable ancestor. Mirrors the `for` convention of `<label for="...">`. */
  for?: string;
  /** Button visual variant: `'outline' | 'ghost' | 'default'`. Defaults to
   *  `'outline'`. */
  variant?: 'outline' | 'ghost' | 'default';
  /** Button size token. Defaults to `'icon'` (square). */
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
}

/** Events fired by `<kai-scroll-button>`. */
interface Events {
  /** Emitted when the user clicks the button and `scrollToBottom()` is
   *  called. Carries no detail; consumers use it to know a manual scroll
   *  occurred. */
  'kai-scroll': void;
}

const SCROLL_THRESHOLD = 50;

/** Walk the composed tree upwards from `startEl` (outside shadow roots) to
 *  find the nearest scrollable ancestor. */
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

/**
 * `<kai-scroll-button>` — a floating "scroll to bottom" button for any
 * scrollable container. It is visible when the container is scrolled up
 * (hidden when at the bottom) and scrolls the container to the bottom on
 * click.
 *
 * **Wiring the scroll target** — use the `for` attribute to point at the
 * container by its DOM `id`:
 * ```html
 * <div id="my-chat" style="overflow:auto; height:400px">...</div>
 * <kai-scroll-button for="my-chat"></kai-scroll-button>
 * ```
 * When `for` is omitted the element walks upward from its host to the nearest
 * scrollable ancestor — useful when it is slotted or nested inside the
 * container.
 *
 * Emits `kai-scroll` (no detail) each time the button is clicked.
 */
defineWebComponent<Props, Events>('kai-scroll-button', {
  for: undefined,
  variant: 'outline',
  size: 'icon',
}, (props, { element, dispatch }) => {
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  let containerEl: HTMLElement | null = null;
  let cleanupFns: (() => void)[] = [];

  function checkIfAtBottom() {
    if (!containerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD);
  }

  function scrollToBottom() {
    if (!containerEl) return;
    containerEl.scrollTo({ top: containerEl.scrollHeight, behavior: 'smooth' });
    setIsAtBottom(true);
  }

  function attach(el: HTMLElement) {
    containerEl = el;
    el.addEventListener('scroll', checkIfAtBottom, { passive: true });
    checkIfAtBottom();
    cleanupFns.push(() => el.removeEventListener('scroll', checkIfAtBottom));
  }

  function detach() {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
    containerEl = null;
  }

  onMount(() => {
    // Resolve the scroll container: `for` id → nearest scrollable ancestor.
    const target = props.for
      ? document.getElementById(props.for)
      : findScrollableAncestor(element);

    if (target) attach(target);
  });

  onCleanup(detach);

  return (
    <Button
      variant={props.variant ?? 'outline'}
      size={props.size ?? 'icon'}
      aria-label="Scroll to bottom"
      class={cn(
        'rounded-full transition-all duration-150 ease-out',
        !isAtBottom()
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-4 scale-95 opacity-0',
      )}
      onClick={() => {
        scrollToBottom();
        dispatch('kai-scroll');
      }}
    >
      <ChevronDown class="h-5 w-5" />
    </Button>
  );
});
