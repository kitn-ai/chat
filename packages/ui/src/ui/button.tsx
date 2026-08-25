import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

const buttonVariants = cva(
  // No justify-* here — the `align` variant owns content justification so it can
  // be overridden (e.g. a full-width, left-aligned block button).
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        ghost: 'hover:bg-muted text-foreground',
        subtle: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        outline: 'bg-muted/50 text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-md',
        md: 'h-9 px-4 text-sm',
        lg: 'h-10 px-6 text-sm',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
      align: {
        start: 'justify-start',
        center: 'justify-center',
        end: 'justify-end',
      },
    },
    defaultVariants: { variant: 'default', size: 'md', align: 'center' },
  }
);

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Stretch to the full width of the container (a block button). */
  full?: boolean;
}

export function Button(props: ButtonProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'variant', 'size', 'align', 'full', 'class', 'children');
  return (
    <button class={cn(buttonVariants({ variant: local.variant, size: local.size, align: local.align }), local.full && 'w-full', local.class)} {...rest}>
      {local.children}
    </button>
  );
}

export { buttonVariants };
