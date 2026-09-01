import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '../utils/cn';

/**
 * `Panel` / `PanelHeader` / `PanelBody` / `PanelFooter` -- the widget panel
 * chrome as PUBLIC parts (blocks-and-parts ruling P-1, from the composition
 * spike's F-2: "with the facade gone there is no widget frame", and the first
 * fine-grain pass invented a slate palette to fill the hole).
 *
 * What this family owns is exactly the chrome `ChatThread` paints privately
 * today: the panel surface (background/foreground from kit tokens), the
 * header row (h-14, bottom border, px-5, semibold sm title), the view
 * container region, and an optional standalone frame (border, radius,
 * shadow). Chrome color is a kit decision (HOW it renders, not WHETHER), so
 * every color here is a kit token: `--kai-color-*` overrides retint the
 * panel together with the elements inside it, which the spike measured as
 * the fine grain's win once the chrome used tokens (phase 3, observation 12).
 *
 * Two postures, prop-driven:
 *
 * - **Frameless (default)** -- the panel fills its container and inherits
 *   its border radius, the shape `ChatThread` has inside `<kai-dock>`'s
 *   already-framed floating panel (the dock owns border/radius/shadow; the
 *   fine-grain recipe was `border-radius: inherit; overflow: hidden`).
 * - **`frame`** -- the panel carries its own widget-box border, radius and
 *   shadow, for standalone use with no dock around it.
 *
 * Composition, not configuration: back arrows and close buttons are slotted
 * CONTENT in the header's `start`/`end` regions, never props (ruling P-1).
 *
 * ```tsx
 * <Panel frame>
 *   <PanelHeader start={<BackButton />} end={<CloseButton />}>Support</PanelHeader>
 *   <PanelBody>{view}</PanelBody>
 *   <PanelFooter>Powered by Aurora</PanelFooter>
 * </Panel>
 * ```
 */
export interface PanelProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Standalone widget-box chrome: border, radius, shadow. Off by default,
   *  where the panel instead inherits its container's radius (the inside-a-
   *  dock posture). */
  frame?: boolean;
  children?: JSX.Element;
}

export function Panel(props: PanelProps) {
  const [local, rest] = splitProps(props, ['frame', 'class', 'style', 'children']);
  return (
    <div
      class={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground',
        local.frame && 'rounded-2xl border border-border shadow-xl',
        local.class,
      )}
      // Frameless panels sit inside an already-rounded container (kai-dock's
      // floating panel) and must clip to ITS radius -- the spike's F-2 recipe.
      // Tailwind has no non-arbitrary `rounded-inherit`, so it is inline style;
      // a caller-supplied string/object style still wins by coming after.
      style={
        local.frame
          ? local.style
          : typeof local.style === 'string'
            ? `border-radius: inherit; ${local.style}`
            : { 'border-radius': 'inherit', ...local.style }
      }
      {...rest}
    >
      {local.children}
    </div>
  );
}

export interface PanelHeaderProps extends JSX.HTMLAttributes<HTMLElement> {
  /** Leading controls, BEFORE the title: a back arrow on a drilled view, a
   *  brand mark. Content, not configuration. */
  start?: JSX.Element;
  /** Trailing controls, AFTER the title: close button, overflow menu. */
  end?: JSX.Element;
  /** The title content. Rendered in the kit's header title style (sm,
   *  semibold, foreground token). */
  children?: JSX.Element;
}

/**
 * The panel's header row. The box and type are byte-for-byte the chrome
 * `ChatThread`'s built-in header paints (h-14 row, bottom border-border,
 * px-5, gap-2 clusters, `text-sm font-semibold text-foreground` title), so
 * the refactored `kai-chat` (ruling P-9) can render its header THROUGH this
 * component with no visual delta.
 */
export function PanelHeader(props: PanelHeaderProps) {
  const [local, rest] = splitProps(props, ['start', 'end', 'class', 'children']);
  return (
    <header
      class={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-border px-5',
        local.class,
      )}
      {...rest}
    >
      {/* `part` on the clusters is what makes these VISUAL BOUNDARIES
          restylable from outside the shadow root (the spike's ::part lesson);
          outside a shadow root the attribute is inert, so plain Solid use is
          unaffected. */}
      <div part="start" class="flex min-w-0 items-center gap-2">
        {local.start}
        <Show when={local.children != null}>
          <div part="title" class="min-w-0 truncate text-sm font-semibold text-foreground">{local.children}</div>
        </Show>
      </div>
      <div part="end" class="flex shrink-0 items-center gap-2">{local.end}</div>
    </header>
  );
}

/**
 * The view container region: fills the panel between header and footer,
 * clips its content, and is the positioning context for floating children
 * (scroll buttons, overlays) -- `ChatThread`'s `relative flex-1
 * overflow-hidden` body, as a public part.
 */
export function PanelBody(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div class={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden', local.class)} {...rest}>
      {local.children}
    </div>
  );
}

/**
 * The footer strip below the view container. Unopinionated beyond layout
 * (it never scrolls away): disclaimers, a powered-by line, a tab bar.
 */
export function PanelFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div class={cn('shrink-0', local.class)} {...rest}>
      {local.children}
    </div>
  );
}
