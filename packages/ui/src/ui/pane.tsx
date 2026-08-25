import { Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Maximize2, Minimize2, X, Columns2, PanelRight } from 'lucide-solid';
import { cn } from '../utils/cn';

/** The work state of the pane's agent/process. Drives a tone-colored status dot
 *  (and optional label) in the header. */
export type PaneStatusTone = 'working' | 'idle' | 'done' | 'error' | 'blocked';

export interface PaneStatus {
  /** The tone — maps to a semantic status hue (see {@link PANE_STATUS_BG}). */
  tone: PaneStatusTone;
  /** Optional text beside the dot (e.g. "Running tests…"). Without it the dot is
   *  decorative and only the color carries meaning. */
  label?: string;
  /** Animate a ping ring on the dot — for the live `working` state. Respects
   *  prefers-reduced-motion. */
  pulse?: boolean;
}

/** tone → status-dot color utility, backed by the kit's tool-* / muted tokens so
 *  it reads correctly in BOTH light and dark without hardcoded colors.
 *  - `working` → blue (in-flight)
 *  - `idle`    → neutral muted (waiting)
 *  - `done`    → green (complete)
 *  - `error`   → red (failed)
 *  - `blocked` → amber (needs input / stalled) */
export const PANE_STATUS_BG: Record<PaneStatusTone, string> = {
  working: 'bg-tool-blue',
  idle: 'bg-muted-foreground',
  done: 'bg-tool-green',
  error: 'bg-tool-red',
  blocked: 'bg-tool-amber',
};

export interface PaneProps {
  /** A glyph/avatar shown before the title (an agent icon, a model avatar). */
  leading?: JSX.Element;
  /** The pane title — the agent / window name. */
  title: string;
  /** A role / label shown under the title (e.g. "Reviewer", "claude-sonnet"). */
  subtitle?: string;
  /** A tone-colored status dot (+ optional label) in the header. */
  status?: PaneStatus;
  /** Extra header controls, placed BEFORE the built-in window controls. */
  actions?: JSX.Element;
  /** The pane body — scrolls inside a `min-h-0 flex-1 overflow-y-auto` region. */
  children?: JSX.Element;
  /** A pinned row below the body (e.g. a composer). Stays put while the body scrolls. */
  footer?: JSX.Element;
  /** Highlight the frame with a ring/border to signal the ACTIVE pane. */
  focused?: boolean;
  /** Show the restore glyph (Minimize2) instead of maximize (Maximize2). */
  maximized?: boolean;
  /** Maximize/restore window control. */
  onMaximize?: () => void;
  /** Close window control. */
  onClose?: () => void;
  /** Optional split control — the button only renders when this is provided. */
  onSplit?: () => void;
  /** Optional dock-to-side control — the button only renders when this is provided. */
  onDock?: () => void;
  /** Extra classes for the outer frame. */
  class?: string;
}

/** A header window-control: a square, muted icon button. */
function ControlButton(props: { label: string; onClick?: () => void; children: JSX.Element }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={() => props.onClick?.()}
      class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-80 transition-colors hover:bg-hover hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {props.children}
    </button>
  );
}

/**
 * Pane — a reusable framed panel for a multi-agent workspace: a header (leading
 * glyph + title/subtitle + status dot + actions + window controls), a scrolling
 * body, and an optional pinned footer (e.g. a composer). It is the "pane frame"
 * every agent tile otherwise re-hand-rolls.
 *
 * Layout: the outer frame is a column flexbox; the header and footer hold their
 * height (`shrink-0`) while the body takes the rest (`min-h-0 flex-1
 * overflow-y-auto`) so content scrolls INSIDE the pane. Give the pane a bounded
 * height (a fixed parent, or `h-full` inside a grid/flex track) for the scroll to
 * engage; the body imposes no padding so content controls its own.
 *
 * Window controls (right side of the header): maximize/restore (Maximize2 ↔
 * Minimize2, toggled by `maximized`) and close (X) are always present; split
 * (Columns2) and dock (PanelRight) only render when `onSplit` / `onDock` are
 * passed. Each fires its callback prop.
 *
 * States: `focused` paints a ring + accent border to mark the active pane;
 * `maximized` swaps the maximize glyph for restore.
 *
 * Colors come entirely from design tokens (surface / border / ring / tool-*),
 * so it reads correctly in light and dark with no hardcoded values. The header,
 * body, footer, and window-control cluster are exposed via
 * `::part(header|body|footer|controls)` for the `kai-pane` facade.
 */
export function Pane(props: PaneProps) {
  return (
    <div
      data-pane
      class={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-surface',
        props.focused ? 'border-ring ring-2 ring-inset ring-ring/35' : 'border-border',
        props.class,
      )}
    >
      <div
        part="header"
        class="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2"
      >
        <Show when={props.leading}>
          <span class="flex shrink-0 items-center text-muted-foreground">{props.leading}</span>
        </Show>
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-medium leading-tight text-foreground">{props.title}</span>
          <Show when={props.subtitle}>
            <span class="truncate text-xs leading-tight text-muted-foreground">{props.subtitle}</span>
          </Show>
        </div>
        <Show when={props.status}>
          {(status) => (
            <span
              class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
              role={status().label ? 'status' : undefined}
              aria-label={status().label}
            >
              <span class="relative flex size-2">
                <Show when={status().pulse}>
                  <span
                    aria-hidden="true"
                    class={cn(
                      'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:hidden',
                      PANE_STATUS_BG[status().tone],
                    )}
                  />
                </Show>
                <span
                  aria-hidden="true"
                  class={cn('relative inline-flex size-2 rounded-full', PANE_STATUS_BG[status().tone])}
                />
              </span>
              <Show when={status().label}>
                <span class="truncate">{status().label}</span>
              </Show>
            </span>
          )}
        </Show>
        <div part="controls" class="ml-auto flex shrink-0 items-center gap-0.5">
          {props.actions}
          <Show when={props.onSplit}>
            <ControlButton label="Split pane" onClick={props.onSplit}>
              <Columns2 class="size-4" aria-hidden="true" />
            </ControlButton>
          </Show>
          <Show when={props.onDock}>
            <ControlButton label="Dock pane" onClick={props.onDock}>
              <PanelRight class="size-4" aria-hidden="true" />
            </ControlButton>
          </Show>
          <ControlButton
            label={props.maximized ? 'Restore pane' : 'Maximize pane'}
            onClick={props.onMaximize}
          >
            <Show when={props.maximized} fallback={<Maximize2 class="size-4" aria-hidden="true" />}>
              <Minimize2 class="size-4" aria-hidden="true" />
            </Show>
          </ControlButton>
          <ControlButton label="Close pane" onClick={props.onClose}>
            <X class="size-4" aria-hidden="true" />
          </ControlButton>
        </div>
      </div>

      <div part="body" class="min-h-0 flex-1 overflow-y-auto" tabindex={0}>
        {props.children}
      </div>

      <Show when={props.footer}>
        <div part="footer" class="shrink-0 border-t border-border">
          {props.footer}
        </div>
      </Show>
    </div>
  );
}
