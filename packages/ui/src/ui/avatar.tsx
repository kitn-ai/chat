import { type JSX, splitProps, Show } from 'solid-js';
import { cn } from '../utils/cn';

export interface AvatarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = { sm: 'h-6 w-6 text-micro', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };

export function Avatar(props: AvatarProps) {
  const [local, rest] = splitProps(props, ['src', 'alt', 'fallback', 'size', 'class']);
  const size = () => local.size ?? 'md';
  return (
    <div class={cn('inline-flex items-center justify-center rounded-md bg-accent font-semibold text-accent-foreground flex-shrink-0', sizeClasses[size()], local.class)} {...rest}>
      <Show when={local.src} fallback={<span>{local.fallback}</span>}>
        <img src={local.src} alt={local.alt ?? local.fallback} class="h-full w-full rounded-md object-cover" />
      </Show>
    </div>
  );
}
