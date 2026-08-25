import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export type ScrollOrientation = 'vertical' | 'horizontal' | 'both';

export interface ScrollAreaProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
  /** Which axis scrolls. `vertical` (default) · `horizontal` · `both`. The cross
   *  axis is clamped to `hidden` so content can't overflow it. */
  orientation?: ScrollOrientation;
}

export function ScrollArea(props: ScrollAreaProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'children', 'class', 'orientation');
  const overflow = () =>
    local.orientation === 'horizontal' ? 'overflow-x-auto overflow-y-hidden'
      : local.orientation === 'both' ? 'overflow-auto'
        : 'overflow-y-auto overflow-x-hidden';
  return (
    // tabindex=0 keeps the scroll region reachable by keyboard when it has no
    // focusable descendants (WCAG 2.1.1 — axe `scrollable-region-focusable`).
    <div tabindex={0} class={cn(overflow(), 'scrollbar-thin', local.class)} {...rest}>
      {local.children}
    </div>
  );
}
