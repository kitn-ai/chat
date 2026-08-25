import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Dynamic } from '@solidjs/web';

export interface TextShimmerProps extends JSX.HTMLAttributes<HTMLElement> {
  as?: string;
  duration?: number;
  spread?: number;
  children: JSX.Element;
}

function TextShimmer(props: TextShimmerProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'as', 'class', 'duration', 'spread', 'children');

  const dynamicSpread = () => Math.min(Math.max(local.spread ?? 20, 5), 45);
  const tag = () => local.as ?? 'span';

  return (
    <Dynamic
      component={tag()}
      class={cn(
        'bg-size-[200%_auto] bg-clip-text font-medium text-transparent',
        'animate-[shimmer_4s_infinite_linear]',
        local.class
      )}
      style={{
        'background-image': `linear-gradient(to right, var(--color-muted-foreground) ${50 - dynamicSpread()}%, var(--color-foreground) 50%, var(--color-muted-foreground) ${50 + dynamicSpread()}%)`,
        'animation-duration': `${local.duration ?? 4}s`,
      }}
      {...rest}
    >
      {local.children}
    </Dynamic>
  );
}

export { TextShimmer };
