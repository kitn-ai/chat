import { omit, For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export type SkeletonVariant = 'text' | 'rect' | 'circle';

export interface SkeletonProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Shape preset. `text` = one or more lines; `rect` = a block; `circle` =
   *  round. Omit for the bare, class-driven block (size it with utility classes
   *  yourself — the original low-level usage). */
  variant?: SkeletonVariant;
  /** CSS width (a number is treated as px). With a `variant` and no width it
   *  fills its container (responsive); for `circle` it is the diameter. */
  width?: string | number;
  /** CSS height (a number is treated as px). Defaults per variant. */
  height?: string | number;
  /** `text` only: how many lines to render (the last is shorter). Default 1. */
  lines?: number;
}

const len = (v?: string | number) => (typeof v === 'number' ? `${v}px` : v);

const rounding = (variant?: SkeletonVariant) =>
  variant === 'circle' ? 'rounded-full' : variant === 'text' ? 'rounded' : 'rounded-md';

function Skeleton(props: SkeletonProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'variant', 'width', 'height', 'lines', 'style');

  const hasWidth = () => local.width != null;
  const hasHeight = () => local.height != null;
  // The responsive default applies only to the variant API; bare class-driven
  // usage is left untouched so `<Skeleton class="h-4 w-64" />` keeps working.
  const fills = () => !hasWidth() && local.variant != null && local.variant !== 'circle';

  const blockStyle = (shortLast: boolean): JSX.CSSProperties => {
    const style: JSX.CSSProperties = typeof local.style === 'object' && local.style ? { ...local.style } : {};
    if (local.variant === 'circle') {
      const d = len(local.width) ?? len(local.height) ?? '2.5rem';
      style.width = d;
      style.height = d;
      return style;
    }
    if (shortLast) style.width = '70%';
    else if (hasWidth()) style.width = len(local.width);
    if (hasHeight()) style.height = len(local.height);
    else if (local.variant === 'text') style.height = '0.75rem';
    return style;
  };

  const block = (shortLast = false) => (
    <div
      part="skeleton"
      // `bg-foreground/10` tints from the theme foreground, so it keeps a visible
      // ~10% contrast against the background in BOTH light and dark (the old
      // `bg-muted` was nearly invisible on a light surface). Recolor / restyle
      // opacity from outside via `::part(skeleton)`.
      class={cn('animate-pulse bg-foreground/10', rounding(local.variant), fills() && 'w-full', local.class)}
      style={blockStyle(shortLast)}
      {...rest}
    />
  );

  const lineCount = () => (local.variant === 'text' ? Math.max(1, local.lines ?? 1) : 1);

  return (
    <Show when={lineCount() > 1} fallback={block()}>
      <div class="flex w-full flex-col gap-2">
        <For each={Array.from({ length: lineCount() })}>{(_, i) => block(i() === lineCount() - 1)}</For>
      </div>
    </Show>
  );
}

export { Skeleton };
