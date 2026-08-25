import { Show, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { Separator } from '../ui/separator';

export interface CheckpointProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export function Checkpoint(props: CheckpointProps) {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'class', 'children');
  return (
    <div
      class={cn(
        'flex items-center gap-0.5 overflow-hidden text-muted-foreground',
        local.class
      )}
      {...rest}
    >
      {local.children}
      <Separator />
    </div>
  );
}

export interface CheckpointIconProps {
  class?: string;
  children?: JSX.Element;
}

export function CheckpointIcon(props: CheckpointIconProps) {
  return (
    <Show
      when={!props.children}
      fallback={props.children}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={cn('size-4 shrink-0', props.class)}
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
    </Show>
  );
}

export interface CheckpointTriggerProps {
  tooltip?: string;
  /** Accessible name for the button — required when it has no visible text (icon-only). */
  'aria-label'?: string;
  onClick?: () => void;
  children?: JSX.Element;
  class?: string;
  variant?: 'ghost' | 'default' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
}

export function CheckpointTrigger(props: CheckpointTriggerProps) {
  const variant = () => props.variant ?? 'ghost';
  const size = () => props.size ?? 'sm';

  // A factory (not a single shared node): the Show fallback and the Tooltip
  // child each need their OWN element instance, otherwise Solid reuses one DOM
  // node across both branches and throws HierarchyRequestError when the tooltip
  // branch mounts it.
  const renderButton = () => (
    <Button
      variant={variant()}
      size={size()}
      type="button"
      aria-label={props['aria-label']}
      onClick={props.onClick}
      class={props.class}
    >
      {props.children}
    </Button>
  );

  return (
    <Show when={props.tooltip} fallback={renderButton()}>
      <Tooltip content={props.tooltip!}>{renderButton()}</Tooltip>
    </Show>
  );
}
