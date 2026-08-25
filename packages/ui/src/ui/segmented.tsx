import { For, Show } from 'solid-js';
import { mergeDefaults } from '../utils/merge-defaults'; // V2-PORT: 1.x mergeProps semantics (undefined does not override)
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export interface SegmentedOption {
  value: string;
  label: string;
  /** Optional leading icon (a JSX node, e.g. a lucide-solid icon). */
  icon?: JSX.Element;
}

export interface SegmentedProps {
  /** The selectable segments, left to right. */
  options: SegmentedOption[];
  /** The selected segment's `value` (controlled). */
  value: string;
  /** Fires with the next `value` when a segment is chosen. */
  onChange: (value: string) => void;
  /** Control density. Defaults to `md`. */
  size?: 'sm' | 'md';
  class?: string;
}

const SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-8 px-3 text-sm',
};

/**
 * `Segmented`: a single-select pill track (a.k.a. segmented / toggle-group). A
 * recessed `bg-surface-sunken` rail of segment buttons where the selected segment
 * lifts onto a raised `bg-background` chip. Token-driven, light + dark.
 *
 * a11y: `role="group"` of real `<button>`s, each carrying `aria-pressed`; a roving
 * tabindex (only the selected segment is in the tab order) with Arrow / Home / End
 * key navigation that moves selection between segments.
 */
export function Segmented(props: SegmentedProps): JSX.Element {
  const merged = mergeDefaults({ size: 'md' as const }, props);
  const buttons: HTMLButtonElement[] = [];

  const currentIndex = () => merged.options.findIndex((o) => o.value === merged.value);

  const select = (i: number) => {
    const opt = merged.options[i];
    if (!opt) return;
    merged.onChange(opt.value);
    buttons[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const count = merged.options.length;
    if (count === 0) return;
    const cur = currentIndex();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      select((Math.max(cur, 0) + 1) % count);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      select((Math.max(cur, 0) - 1 + count) % count);
    } else if (e.key === 'Home') {
      e.preventDefault();
      select(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      select(count - 1);
    }
  };

  return (
    <div
      role="group"
      part="track"
      onKeyDown={onKeyDown}
      class={cn('inline-flex items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5', merged.class)}
    >
      <For each={merged.options}>
        {(opt, i) => {
          const selected = () => opt.value === merged.value;
          // Roving tabindex: the selected segment is tabbable; if nothing matches,
          // the first segment falls back to tabbable so the group is reachable.
          const focusable = () => selected() || (currentIndex() === -1 && i() === 0);
          return (
            <button
              type="button"
              part="segment"
              ref={(el) => { buttons[i()] = el; }}
              aria-pressed={selected() ? 'true' : 'false'}
              tabindex={focusable() ? 0 : -1}
              onClick={() => merged.onChange(opt.value)}
              class={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                SIZE[merged.size],
                selected()
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Show when={opt.icon}>
                <span class="inline-flex shrink-0 items-center" aria-hidden="true">{opt.icon}</span>
              </Show>
              <span>{opt.label}</span>
            </button>
          );
        }}
      </For>
    </div>
  );
}
