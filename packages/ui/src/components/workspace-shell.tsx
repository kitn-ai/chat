import { Show, createSignal, createMemo, onMount, onCleanup, type JSX } from 'solid-js';
import { createControllableSignal } from '../primitives/controllable';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import { cn } from '../utils/cn';

/** The two aside columns of the shell, named logically (`start` follows the
 *  writing direction; on an RTL page it is the right column). */
export type WorkspaceAsideSide = 'start' | 'end';

/** Detail of an aside collapse/expand, however it happened (a method, the
 *  breakpoint, the drawer's Escape). */
export interface WorkspaceAsideToggleDetail {
  side: WorkspaceAsideSide;
  collapsed: boolean;
}

/** Detail of an aside resize (fires per drag step, keyboard nudge, or a handle double-click reset), width in px. */
export interface WorkspaceAsideResizeDetail {
  side: WorkspaceAsideSide;
  width: number;
}

/** Imperative surface exposed through `controllerRef` (the facade forwards it
 *  as element methods). */
export interface WorkspaceShellController {
  /** Collapse/expand one aside (reports through onAsideToggle). */
  toggleAside(side: WorkspaceAsideSide): void;
  /** Force one aside collapsed (reports through onAsideToggle). */
  collapseAside(side: WorkspaceAsideSide): void;
  /** Force one aside expanded (reports through onAsideToggle). */
  expandAside(side: WorkspaceAsideSide): void;
}

export interface WorkspaceShellProps {
  /** Header band content. The region renders only when this is provided. */
  header?: JSX.Element;
  /** Start aside content (the inline-start column: a rail, a nav, a file tree).
   *  The region renders only when this is provided. */
  start?: JSX.Element;
  /** End aside content (the inline-end column: inspector, notes, preview).
   *  The region renders only when this is provided. */
  end?: JSX.Element;
  /** Footer band content. The region renders only when this is provided. */
  footer?: JSX.Element;
  /** Main region content. Always rendered. */
  children?: JSX.Element;

  /** Controlled collapsed state of the start aside. Omit for uncontrolled. */
  startCollapsed?: boolean;
  /** Initial collapsed state of the start aside when uncontrolled (default false). */
  defaultStartCollapsed?: boolean;
  /** Controlled collapsed state of the end aside. Omit for uncontrolled. */
  endCollapsed?: boolean;
  /** Initial collapsed state of the end aside when uncontrolled (default false). */
  defaultEndCollapsed?: boolean;

  /** Start aside default width in px (default 280). */
  startWidth?: number;
  /** Start aside minimum width in px during resize (default 200). */
  startMinWidth?: number;
  /** Start aside maximum width in px during resize (default 480). */
  startMaxWidth?: number;
  /** End aside default width in px (default 320). */
  endWidth?: number;
  /** End aside minimum width in px during resize (default 200). */
  endMinWidth?: number;
  /** End aside maximum width in px during resize (default 480). */
  endMaxWidth?: number;

  /** Auto-collapse both asides when the shell's own width drops below this many
   *  px, and re-expand when it grows back above. Applies to uncontrolled asides
   *  only (it never fights an app-driven collapsed prop); omit to disable. */
  collapseBelow?: number;
  /** Below this shell width in px, an expanded aside renders as an overlay
   *  drawer over the main region instead of a column beside it. Escape inside
   *  the drawer closes it and returns focus to the element focused before it
   *  opened. Omit to disable. */
  drawerBelow?: number;
  /** Density hint. Reflected as a `data-compact` hook on the root (and as the
   *  `compact` attribute on the element) for your CSS and slotted content; the
   *  shell itself keeps no other opinion about density. */
  compact?: boolean;

  /** An aside collapsed or expanded (any path: method, breakpoint, drawer Escape). */
  onAsideToggle?: (detail: WorkspaceAsideToggleDetail) => void;
  /** The aside was resized (fires per drag step, keyboard nudge, or a handle double-click reset), width in px. */
  onAsideResize?: (detail: WorkspaceAsideResizeDetail) => void;

  /** Receives the imperative controller once on mount. */
  controllerRef?: (controller: WorkspaceShellController) => void;
  class?: string;
}

/**
 * The chat-agnostic workspace layout shell: five regions (header · start aside ·
 * main · end aside · footer) with resize handles between the columns, per-aside
 * controlled/uncontrolled collapse, collapse-below-breakpoint, and a mobile
 * drawer mode for the asides. It knows nothing about chat: a file tree in
 * `start` is as valid as a conversation rail.
 */
export function WorkspaceShell(props: WorkspaceShellProps) {
  let rootEl!: HTMLDivElement;

  // --- host width (drives collapseBelow + drawerBelow) ---
  const [hostWidth, setHostWidth] = createSignal<number | undefined>(undefined);

  // --- per-aside collapse: controlled wins, otherwise internal state ---
  const [startCollapsed, setStartCollapsed] = createControllableSignal(
    () => props.startCollapsed,
    props.defaultStartCollapsed ?? false,
  );
  const [endCollapsed, setEndCollapsed] = createControllableSignal(
    () => props.endCollapsed,
    props.defaultEndCollapsed ?? false,
  );
  const collapsed = (side: WorkspaceAsideSide) => (side === 'start' ? startCollapsed() : endCollapsed());
  const isControlled = (side: WorkspaceAsideSide) =>
    (side === 'start' ? props.startCollapsed : props.endCollapsed) !== undefined;

  const setCollapsedTo = (side: WorkspaceAsideSide, next: boolean) => {
    if (side === 'start') setStartCollapsed(next); else setEndCollapsed(next);
    if (next) restoreDrawerFocus(side);
    props.onAsideToggle?.({ side, collapsed: next });
  };

  // --- drawer mode + focus return ---
  const drawerMode = createMemo(() => {
    const below = props.drawerBelow;
    const width = hostWidth();
    return below != null && width != null && width < below;
  });
  // The element focused when a drawer opened, restored on close. Per side, so a
  // start drawer closing never steals focus a later end drawer captured.
  const drawerOpeners: Partial<Record<WorkspaceAsideSide, HTMLElement>> = {};
  const captureDrawerFocus = (side: WorkspaceAsideSide) => {
    if (!drawerMode()) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) drawerOpeners[side] = active;
  };
  const restoreDrawerFocus = (side: WorkspaceAsideSide) => {
    const opener = drawerOpeners[side];
    delete drawerOpeners[side];
    if (drawerMode() && opener && opener.isConnected) opener.focus();
  };

  const expand = (side: WorkspaceAsideSide) => {
    captureDrawerFocus(side);
    setCollapsedTo(side, false);
  };
  const controller: WorkspaceShellController = {
    toggleAside: (side) => (collapsed(side) ? expand(side) : setCollapsedTo(side, true)),
    collapseAside: (side) => setCollapsedTo(side, true),
    expandAside: (side) => expand(side),
  };
  props.controllerRef?.(controller);

  // --- collapse-below-breakpoint (uncontrolled asides only) ---
  // `autoCollapsed` tracks whether WE collapsed a side, so crossing back above
  // the breakpoint never expands an aside the user collapsed themselves.
  const autoCollapsed: Record<WorkspaceAsideSide, boolean> = { start: false, end: false };
  const applyBreakpoint = (width: number) => {
    const below = props.collapseBelow;
    if (below == null) return;
    const isBelow = width < below;
    for (const side of ['start', 'end'] as const) {
      // A side with no content has nothing to collapse; reporting a toggle for
      // a region that does not exist would be noise, not loudness.
      if (!asideContent(side)) continue;
      if (isControlled(side)) continue;
      if (isBelow && !collapsed(side)) {
        autoCollapsed[side] = true;
        setCollapsedTo(side, true);
      } else if (!isBelow && collapsed(side) && autoCollapsed[side]) {
        autoCollapsed[side] = false;
        setCollapsedTo(side, false);
      }
    }
  };

  onMount(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? rootEl.clientWidth;
      setHostWidth(width);
      applyBreakpoint(width);
    });
    ro.observe(rootEl);
    onCleanup(() => ro.disconnect());
  });

  // --- widths ---
  const widths = (side: WorkspaceAsideSide) =>
    side === 'start'
      ? {
          size: props.startWidth ?? 280,
          min: props.startMinWidth ?? 200,
          max: props.startMaxWidth ?? 480,
        }
      : {
          size: props.endWidth ?? 320,
          min: props.endMinWidth ?? 200,
          max: props.endMaxWidth ?? 480,
        };

  // --- drawer Escape: scoped to the drawer (never a document listener, never
  // swallowed — the kai-dock rule at page scale) ---
  const onDrawerKeyDown = (side: WorkspaceAsideSide) => (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    setCollapsedTo(side, true);
  };

  const asideRefs: Partial<Record<WorkspaceAsideSide, HTMLElement>> = {};
  const emitResize = (side: WorkspaceAsideSide) => {
    const el = asideRefs[side];
    if (!el) return;
    props.onAsideResize?.({ side, width: el.getBoundingClientRect().width });
  };

  const asideContent = (side: WorkspaceAsideSide) => (side === 'start' ? props.start : props.end);

  /** An aside as a resizable column (desktop mode). */
  const asideColumn = (side: WorkspaceAsideSide) => {
    const w = widths(side);
    return (
      <ResizablePanel
        defaultSize={`${w.size}px`}
        minSize={`${w.min}px`}
        maxSize={`${w.max}px`}
        part={side === 'start' ? 'aside start' : 'aside end'}
        ref={(el: HTMLElement) => (asideRefs[side] = el)}
        class="bg-surface"
      >
        {asideContent(side)}
      </ResizablePanel>
    );
  };

  /** An aside as an overlay drawer (mobile mode). */
  const asideDrawer = (side: WorkspaceAsideSide) => (
    <div
      part={side === 'start' ? 'aside start' : 'aside end'}
      data-drawer=""
      class={cn(
        'absolute inset-y-0 z-20 max-w-[85%] overflow-auto border-border bg-surface shadow-lg',
        side === 'start' ? 'start-0 border-e' : 'end-0 border-s',
      )}
      style={{ width: `${widths(side).size}px` }}
      onKeyDown={onDrawerKeyDown(side)}
    >
      {asideContent(side)}
    </div>
  );

  const showAside = (side: WorkspaceAsideSide) => !!asideContent(side) && !collapsed(side);

  return (
    <div
      ref={rootEl}
      class={cn('flex h-full w-full flex-col overflow-hidden bg-background', props.class)}
      data-compact={props.compact ? '' : undefined}
    >
      <Show when={props.header}>
        <div part="header" class="shrink-0 border-b border-border">{props.header}</div>
      </Show>
      <div class="relative min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <Show when={showAside('start') && !drawerMode()}>
            {asideColumn('start')}
            <ResizableHandle onPanelResize={() => emitResize('start')} />
          </Show>
          <ResizablePanel part="main">{props.children}</ResizablePanel>
          <Show when={showAside('end') && !drawerMode()}>
            <ResizableHandle onPanelResize={() => emitResize('end')} />
            {asideColumn('end')}
          </Show>
        </ResizablePanelGroup>
        <Show when={showAside('start') && drawerMode()}>{asideDrawer('start')}</Show>
        <Show when={showAside('end') && drawerMode()}>{asideDrawer('end')}</Show>
      </div>
      <Show when={props.footer}>
        <div part="footer" class="shrink-0 border-t border-border">{props.footer}</div>
      </Show>
    </div>
  );
}
