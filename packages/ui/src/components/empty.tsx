import { type JSX, splitProps } from 'solid-js';
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
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div
      // NO `text-center` / `text-balance` on the root. Both INHERIT, and
      // `EmptyContent` is an arbitrary-content slot — a `PromptInput` dropped in
      // it picked the centering up and rendered its placeholder and its typed
      // text centred (owner report). Centering is a fact about the empty state's
      // OWN title/description, so it lives on `EmptyTitle`/`EmptyDescription`
      // (and `EmptyHeader`, which wraps only those). The root still centres its
      // children as BOXES via `items-center`, which is what it actually wants.
      data-slot="empty"
      class={cn(
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg p-6',
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
  const [local, rest] = splitProps(props, ['class', 'children']);
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
  const [local, rest] = splitProps(props, ['class', 'variant', 'children']);
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
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div
      data-slot="empty-title"
      // Carries its own centering + balance (the root no longer broadcasts them
      // to every slotted child), so a title is centred wherever it is placed.
      class={cn('text-title font-medium tracking-tight text-center text-balance', local.class)}
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
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <p
      data-slot="empty-description"
      class={cn(
        // Same as EmptyTitle: own the centering + balance rather than inheriting
        // it from a root that also reaches arbitrary slotted content.
        'text-muted-foreground text-body text-center text-balance [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
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
  const [local, rest] = splitProps(props, ['class', 'children']);
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
