import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

const badgeVariants = cva('inline-flex items-center justify-center rounded-full text-xs font-medium min-h-5 min-w-5', {
  variants: {
    variant: {
      default: 'bg-muted text-muted-foreground px-2 py-0.5',
      count: 'bg-muted text-muted-foreground h-5 px-1.5',
      citation: 'bg-primary text-primary-foreground px-1.5 py-0.5 cursor-pointer',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge(props: BadgeProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'variant', 'class', 'children');
  return <span class={cn(badgeVariants({ variant: local.variant }), local.class)} {...rest}>{local.children}</span>;
}
