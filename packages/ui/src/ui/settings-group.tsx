import { Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export interface SettingsGroupProps {
  /** Small section heading shown above the card. */
  heading: string;
  /** Optional muted description under the heading. */
  description?: string;
  /** The stacked `SettingItem` rows. */
  children: JSX.Element;
  class?: string;
}

/**
 * A settings section: a small heading + optional muted description over a bordered,
 * rounded card that stacks `SettingItem` rows with hairline dividers between them.
 * Host-agnostic chrome: the SAME group drops into a modal or a full settings page;
 * only the content (the rows) changes per app.
 */
export function SettingsGroup(props: SettingsGroupProps): JSX.Element {
  return (
    <section class={cn('flex flex-col gap-2', props.class)}>
      <div part="header" class="flex flex-col gap-0.5 px-1">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {props.heading}
        </h3>
        <Show when={props.description}>
          <p class="text-xs text-muted-foreground">{props.description}</p>
        </Show>
      </div>
      <div part="body" class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {props.children}
      </div>
    </section>
  );
}

export interface SettingItemProps {
  /** Row label (primary text). */
  label: string;
  /** Optional secondary description under the label. */
  description?: string;
  /** The control on the right (a `Switch`, `Segmented`, select, ...). Omit for a
   *  plain label row. */
  control?: JSX.Element;
  class?: string;
}

/**
 * One row inside a `SettingsGroup`: a left label/description block and an optional
 * right-aligned `control`, vertically centered with comfortable padding.
 */
export function SettingItem(props: SettingItemProps): JSX.Element {
  return (
    <div class={cn('flex items-center justify-between gap-4 px-4 py-3', props.class)}>
      <div part="label" class="flex min-w-0 flex-col gap-0.5">
        <span class="text-sm text-foreground">{props.label}</span>
        <Show when={props.description}>
          <span class="text-xs leading-snug text-muted-foreground">{props.description}</span>
        </Show>
      </div>
      <Show when={props.control}>
        <div part="control" class="shrink-0">{props.control}</div>
      </Show>
    </div>
  );
}
