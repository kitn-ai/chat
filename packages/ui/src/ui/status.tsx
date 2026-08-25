import { Show, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export type StatusKind = 'new' | 'online' | 'busy' | 'away' | 'offline';

/** status → background hue utility (backed by the kit's tool-* / muted tokens). */
export const STATUS_BG: Record<StatusKind, string> = {
  new: 'bg-tool-blue',
  online: 'bg-tool-green',
  busy: 'bg-tool-red',
  away: 'bg-tool-amber',
  offline: 'bg-muted-foreground',
};

const SIZE: Record<'sm' | 'md', string> = { sm: 'size-2', md: 'size-2.5' };

export interface StatusProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  status?: StatusKind;
  size?: 'sm' | 'md';
  /** Add an animated ping ring (disabled under prefers-reduced-motion). */
  pulse?: boolean;
  /** Accessible name. With it, the dot is announced; without it, it is decorative. */
  label?: string;
}

export function Status(props: StatusProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'status', 'size', 'pulse', 'label', 'class');
  const kind = () => local.status ?? 'new';
  return (
    <span
      class={cn('relative inline-flex', local.class)}
      role={local.label ? 'status' : undefined}
      aria-label={local.label}
      aria-hidden={local.label ? undefined : 'true'}
    >
      <Show when={local.pulse}>
        <span
          aria-hidden="true"
          class={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:hidden',
            STATUS_BG[kind()],
          )}
        />
      </Show>
      <span {...rest} class={cn('relative inline-block rounded-full', STATUS_BG[kind()], SIZE[local.size ?? 'sm'])} />
    </span>
  );
}
