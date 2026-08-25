import { omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

/**
 * Empty — a composable empty-state block, modeled on shadcn/ui's `Empty`.
 * Structure:
 *   Empty
 *   ├── EmptyHeader
 *   │   ├── EmptyMedia   (icon / avatar)
 *   │   ├── EmptyTitle
 *   │   └── EmptyDescription
 *   └── EmptyContent     (actions / suggestions)
 *
 * Styling is token-driven (`--color-*`), so it themes with the rest of the kit.
 * No visible border by default; add `border border-dashed` via `class` for a card.
 */

// --- Empty (root) ---

export interface EmptyProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function Empty(props: EmptyProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'children');
  return (
    <div
      data-slot="empty"
      class={cn(
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg p-6 text-center text-balance',
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </div>
  );
}

// --- EmptyHeader ---

export interface EmptyHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function EmptyHeader(props: EmptyHeaderProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'children');
  return (
    <div
      data-slot="empty-header"
      class={cn('flex max-w-sm flex-col items-center gap-2 text-center', local.class)}
      {...rest}
    >
      {local.children}
    </div>
  );
}

// --- EmptyMedia ---

const emptyMediaVariants = cva(
  'flex shrink-0 items-center justify-center mb-2 [&_svg]:size-6',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: 'bg-muted text-foreground size-10 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface EmptyMediaProps
  extends JSX.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyMediaVariants> {
  children: JSX.Element;
}

function EmptyMedia(props: EmptyMediaProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'variant', 'children');
  return (
    <div
      data-slot="empty-media"
      data-variant={local.variant ?? 'default'}
      class={cn(emptyMediaVariants({ variant: local.variant }), local.class)}
      {...rest}
    >
      {local.children}
    </div>
  );
}

// --- EmptyTitle ---

export interface EmptyTitleProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function EmptyTitle(props: EmptyTitleProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'children');
  return (
    <div
      data-slot="empty-title"
      class={cn('text-lg font-medium tracking-tight', local.class)}
      {...rest}
    >
      {local.children}
    </div>
  );
}

// --- EmptyDescription ---

export interface EmptyDescriptionProps extends JSX.HTMLAttributes<HTMLParagraphElement> {
  children: JSX.Element;
}

function EmptyDescription(props: EmptyDescriptionProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'children');
  return (
    <p
      data-slot="empty-description"
      class={cn(
        'text-muted-foreground text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </p>
  );
}

// --- EmptyContent ---

export interface EmptyContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function EmptyContent(props: EmptyContentProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'children');
  return (
    <div
      data-slot="empty-content"
      class={cn(
        'flex w-full max-w-sm min-w-0 flex-col items-center gap-2 text-sm text-balance',
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </div>
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  emptyMediaVariants,
};
