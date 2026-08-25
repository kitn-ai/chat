import { Show, omit, createUniqueId } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export type ProgressTone = 'primary' | 'success' | 'warning' | 'error' | 'info';

/** Fill hue per `tone`. `primary` is the theme accent; the rest use the kit's
 *  tool hues (the same colors as kai-status / kai-notice). */
export const TONE_FILL: Record<ProgressTone, string> = {
  primary: 'bg-primary',
  success: 'bg-tool-green',
  warning: 'bg-tool-amber',
  error: 'bg-tool-red',
  info: 'bg-tool-blue',
};

export interface ProgressBarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Current progress value (0..max). */
  value: number;
  /** The value `value` runs to. Defaults to 100. */
  max?: number;
  /** Optional caption above the track. */
  label?: string;
  /** Fill color. Defaults to `primary`. Override via `::part(fill)` for custom hues. */
  tone?: ProgressTone;
}

/**
 * A thin determinate progress bar: a rounded track with a `bg-primary` fill whose
 * width is `value / max`, clamped to 0..100%. Theme-aware (track = `bg-surface-strong`,
 * fill = `bg-primary`). Set `tone` for a semantic fill hue. Restyle via
 * `::part(track)` / `::part(fill)`. The fill width transitions smoothly under
 * `prefers-reduced-motion: no-preference`.
 */
export function ProgressBar(props: ProgressBarProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 
    'value', 'max', 'label', 'tone', 'class', 'aria-label', 'aria-labelledby');
  const labelId = createUniqueId();
  const max = () => local.max ?? 100;
  // Clamp value into [0, max]; drive both the fill width and aria-valuenow off it
  // so the bar and the announced value stay consistent.
  const clamped = () => {
    const m = max();
    if (!(m > 0)) return 0;
    return Math.max(0, Math.min(local.value, m));
  };
  const percent = () => {
    const m = max();
    return m > 0 ? (clamped() / m) * 100 : 0;
  };
  // The progressbar must always carry an accessible name. Prefer the rendered
  // visible label; else a caller-supplied aria-labelledby/aria-label; else a
  // generic default so the bar is never nameless (axe `aria-progressbar-name`).
  const labelledBy = () => (local.label ? labelId : local['aria-labelledby']);
  const ariaLabel = () =>
    local.label || local['aria-labelledby'] ? undefined : local['aria-label'] ?? 'Progress';
  return (
    <div class={cn('flex flex-col gap-1', local.class)} {...rest}>
      <Show when={local.label}>
        <span id={labelId} class="text-xs text-muted-foreground">{local.label}</span>
      </Show>
      <div
        part="track"
        role="progressbar"
        aria-valuenow={clamped()}
        aria-valuemin={0}
        aria-valuemax={max()}
        aria-labelledby={labelledBy()}
        aria-label={ariaLabel()}
        class="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong"
      >
        <div
          part="fill"
          class={cn(
            'h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out',
            TONE_FILL[local.tone ?? 'primary'],
          )}
          style={{ width: `${percent()}%` }}
        />
      </div>
    </div>
  );
}
