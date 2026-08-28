import { type JSX, splitProps, createEffect, on } from 'solid-js';
import { cn } from '../utils/cn';
import { useAutoResize } from '../primitives/use-auto-resize';

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxHeight?: number;
  /** Floor the auto-resized height at this many pixels, even when the field
   *  is empty. Omit to fall back to `useAutoResize`'s own default (one
   *  visible line, derived from computed line-height + padding/border). */
  minHeight?: number;
  autoResize?: boolean;
}

export function Textarea(props: TextareaProps) {
  const [local, rest] = splitProps(props, ['class', 'maxHeight', 'minHeight', 'autoResize', 'value']);
  const { ref, resize } = useAutoResize({ maxHeight: local.maxHeight, minHeight: local.minHeight });

  // A CONTROLLED `value` change (the parent hands down new text — e.g. a
  // chip toggling a pattern into an accept list, or any other reactive
  // update that isn't the user typing) fires no DOM 'input' event, so the
  // resize-on-'input' listener inside `useAutoResize` never sees it. Without
  // this, a controlled textarea's box only ever grows off USER typing and
  // silently stays the wrong size after a programmatic update — gap #3 in
  // the fix. `defer: true` so this never redoes the mount-time measurement
  // (already covered by the hook's own rAF + ResizeObserver); it only fires
  // on a REAL subsequent change, after Solid has already written the new
  // value into the DOM (effects run after the render they depend on), so
  // `resize()` measures the up-to-date `scrollHeight`.
  createEffect(on(() => local.value, () => resize(), { defer: true }));

  return (
    <textarea
      ref={local.autoResize !== false ? ref : undefined}
      class={cn('w-full resize-none rounded-md bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', local.class)}
      rows={1}
      value={local.value}
      {...rest}
    />
  );
}
