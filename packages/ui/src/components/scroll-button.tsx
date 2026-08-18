import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { useChatContainer } from './chat-container';
import { ChevronDown } from 'lucide-solid';

export interface ScrollButtonProps {
  class?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
}

function ScrollButton(props: ScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useChatContainer();

  return (
    <Button
      variant={props.variant ?? 'outline'}
      size={props.size ?? 'sm'}
      aria-label="Scroll to bottom"
      // At the bottom of the thread this button is fully transparent and
      // pointer-inert, but it stayed in the tab order — a keyboard user landed
      // on a control they could not see, with a focus ring painted on nothing.
      // Take it out of the tab order and hide it from assistive tech while it
      // is invisible; both revert the moment it animates back in.
      tabindex={isAtBottom() ? -1 : 0}
      aria-hidden={isAtBottom() ? 'true' : undefined}
      class={cn(
        'h-10 w-10 rounded-full transition-all duration-150 ease-out',
        !isAtBottom()
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-4 scale-95 opacity-0',
        props.class
      )}
      onClick={() => scrollToBottom()}
    >
      <ChevronDown class="h-5 w-5" />
    </Button>
  );
}

export { ScrollButton };
