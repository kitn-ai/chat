import { Show, createSignal } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Info, TriangleAlert, CircleAlert, CircleCheck, X } from 'lucide-solid';
import { cn } from '../utils/cn';
import { renderIcon } from './icon';

export type NoticeSeverity = 'neutral' | 'info' | 'warning' | 'error' | 'success';

const SEVERITY_ICON = { neutral: Info, info: Info, warning: TriangleAlert, error: CircleAlert, success: CircleCheck };

/** Icon tint per severity. Neutral stays muted; the rest use the kit's tool hues
 *  (the same on-brand, AA-checked colors used by tool/status chips). */
const ICON_TONE: Record<NoticeSeverity, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-tool-blue',
  warning: 'text-tool-amber',
  error: 'text-tool-red',
  success: 'text-tool-green',
};

/** The default leading icon for a notice: `null` when `icon="none"`, the named
 *  icon when one is given, else the severity glyph. Exported so the `kai-notice`
 *  facade can use it as the fallback inside a `slot="icon"` escape hatch. */
export function noticeIconNode(severity: NoticeSeverity, icon?: string): JSX.Element {
  if (icon === 'none') return null;
  if (icon) return renderIcon(icon, { class: cn('size-4 shrink-0', ICON_TONE[severity]) });
  const I = SEVERITY_ICON[severity];
  return <I class={cn('size-4 shrink-0', ICON_TONE[severity])} aria-hidden="true" />;
}

export interface NoticeProps {
  severity?: NoticeSeverity;
  /** Leading icon: omit for the severity default, `"none"` to hide it, or a named
   *  icon to override. */
  icon?: string;
  /** A custom icon node that replaces the icon region entirely (the `kai-notice`
   *  facade passes a `slot="icon"` here, with the default icon as its fallback). */
  iconSlot?: JSX.Element;
  /** Render a dismiss (×) button that hides the notice and calls `onDismiss`. */
  dismissible?: boolean;
  /** Called after the notice is dismissed. */
  onDismiss?: () => void;
  /** The message. */
  children: JSX.Element;
  /** Optional trailing action (e.g. a link). */
  action?: JSX.Element;
  class?: string;
}

/**
 * A self-contained inline notice / alert: a leading severity icon, a message, an
 * optional trailing action, and an optional dismiss. Carries the right a11y role
 * (`alert` for errors, `status` otherwise). Placement is the consumer's — this is
 * just the notice box.
 */
export function Notice(props: NoticeProps) {
  const [open, setOpen] = createSignal(true);
  const severity = (): NoticeSeverity => props.severity ?? 'neutral';
  const dismiss = () => { setOpen(false); props.onDismiss?.(); };

  return (
    <Show when={open()}>
      <div
        role={severity() === 'error' ? 'alert' : 'status'}
        class={cn('flex items-center gap-2.5 rounded-lg bg-surface px-3.5 py-2.5 text-sm', props.class)}
      >
        <Show when={props.iconSlot} fallback={noticeIconNode(severity(), props.icon)}>
          {props.iconSlot}
        </Show>
        <div class="flex-1 leading-snug text-muted-foreground">{props.children}</div>
        <Show when={props.action}>{props.action}</Show>
        <Show when={props.dismissible}>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            class="-my-1 -mr-1.5 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </Show>
      </div>
    </Show>
  );
}
