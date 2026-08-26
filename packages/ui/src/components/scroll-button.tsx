import { Show } from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { useChatContainer } from './chat-container';
import { ArrowDown } from 'lucide-solid';

/** The accessible name used when the consumer does not supply one. */
const DEFAULT_LABEL = 'Scroll to bottom';

export interface ScrollButtonProps {
  class?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
  /**
   * The button's accessible name. Used whether or not the label is visible, so
   * the announced text is always localisable. Defaults to `"Scroll to bottom"`.
   */
  label?: string;
  /**
   * Also render `label` visibly beside the icon. Defaults to `false` (icon
   * only). When it is visible the text IS the accessible name, so nothing is
   * announced twice.
   */
  showLabel?: boolean;
}

/**
 * The floating chip surface.
 *
 * The shared `outline` button variant is `bg-muted/50` — half-transparent, so
 * message text showed through a control that floats over scrolling content, and
 * its edge measured 1.05:1 against the thread behind it (SC 1.4.11 wants 3:1).
 * `bg-card` is the same opaque surface popovers, dropdowns and hover cards sit
 * on; `border-input` is the kit's control edge and clears 3:1 in both themes;
 * `kai-elevation` is the shared, themeable float shadow (`--kai-shadow-color`),
 * which is what keeps an opaque button reading as ABOVE the content.
 *
 * `ghost` and `default` are explicit consumer choices about the fill, so they
 * keep theirs; every variant gets the elevation and the rounded-square radius.
 */
function surfaceClasses(variant: ScrollButtonProps['variant']) {
  return (variant ?? 'outline') === 'outline'
    ? 'border border-input bg-card text-card-foreground kai-elevation'
    : 'kai-elevation';
}

function ScrollButton(props: ScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useChatContainer();
  const label = () => props.label ?? DEFAULT_LABEL;
  const showLabel = () => props.showLabel === true;

  return (
    <Button
      variant={props.variant ?? 'outline'}
      size={props.size ?? 'sm'}
      // When the label is visible it IS the accessible name. An aria-label on
      // top of it would override the visible text and leave the two able to
      // disagree, so it is only set for the icon-only case.
      aria-label={showLabel() ? undefined : label()}
      // At the bottom of the thread this button is fully transparent and
      // pointer-inert, but it stayed in the tab order — a keyboard user landed
      // on a control they could not see, with a focus ring painted on nothing.
      // Take it out of the tab order and hide it from assistive tech while it
      // is invisible; both revert the moment it animates back in.
      tabindex={isAtBottom() ? -1 : 0}
      aria-hidden={isAtBottom() ? 'true' : undefined}
      class={cn(
        'rounded-lg transition-all duration-150 ease-out',
        surfaceClasses(props.variant),
        // Square while icon-only; a pill-ish labelled button once the text is in.
        showLabel() ? 'h-10 w-auto gap-1.5 px-3.5 text-sm' : 'h-10 w-10 px-0',
        !isAtBottom()
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-4 scale-95 opacity-0',
        props.class
      )}
      onClick={() => scrollToBottom()}
    >
      {/* h-4, not the h-5 the chevron used. A ChevronDown only inks the lower
          part of its 24px viewBox, so at a 20px box its visible mass is small;
          ArrowDown inks the full height (stem + head), and at 20px inside a 40px
          button it read as half the button wide and crowded the padding. 16px
          balances the icon-only square and is the size lucide pairs with
          text-sm, which is what the label renders at. */}
      <ArrowDown class="h-4 w-4 shrink-0" aria-hidden="true" />
      <Show when={showLabel()}>
        <span>{label()}</span>
      </Show>
    </Button>
  );
}

export { ScrollButton };
