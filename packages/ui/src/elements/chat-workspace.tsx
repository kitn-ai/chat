import { createSignal, onMount, onCleanup, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { readSlots, WORKSPACE_SLOTS } from './slots';
import {
  WorkspaceShell,
  type WorkspaceShellController,
  type WorkspaceAsideSide,
  type WorkspaceAsideToggleDetail,
  type WorkspaceAsideResizeDetail,
} from '../components/workspace-shell';

interface Props extends Record<string, unknown> {
  /** Controlled collapsed state of the start aside. Set this as a JS property
   *  (`el.startCollapsed = true`) to drive the aside from your app, updating it
   *  in response to the `kai-aside-toggle` event. Omit for uncontrolled (the
   *  element manages it). */
  startCollapsed?: boolean;
  /** Initial collapsed state of the start aside when uncontrolled (default
   *  false). Use the `default-start-collapsed` attribute to start collapsed in
   *  plain HTML. */
  defaultStartCollapsed?: boolean;
  /** Controlled collapsed state of the end aside. Set this as a JS property
   *  (`el.endCollapsed = true`) to drive the aside from your app, updating it
   *  in response to the `kai-aside-toggle` event. Omit for uncontrolled (the
   *  element manages it). */
  endCollapsed?: boolean;
  /** Initial collapsed state of the end aside when uncontrolled (default
   *  false). Use the `default-end-collapsed` attribute to start collapsed in
   *  plain HTML. */
  defaultEndCollapsed?: boolean;
  /** Auto-collapse both asides when the shell's own width drops below this many
   *  px, and re-expand when it grows back above. Applies to uncontrolled asides
   *  only (it never fights an app-driven collapsed prop); omit to disable.
   *  Fires `kai-aside-toggle`. Attribute: `collapse-below`. */
  collapseBelow?: number;
  /** Below this shell width in px, an expanded aside renders as an overlay
   *  drawer over the main region instead of a column beside it. Escape inside
   *  the drawer closes it and returns focus to the element focused before it
   *  opened. Omit to disable. Attribute: `drawer-below`. */
  drawerBelow?: number;
  /** Density hint. Reflected as a `data-compact` hook on the root (and as the
   *  `compact` attribute on the element) for your CSS and slotted content; the
   *  shell itself keeps no other opinion about density. */
  compact?: boolean;
}

/** Events fired by `<kai-workspace>`. Layout only: every chat event now belongs
 *  to the part that fires it, inside your own markup. */
interface Events {
  /** An aside collapsed or expanded (a method, the breakpoint, the drawer's Escape). */
  'kai-aside-toggle': WorkspaceAsideToggleDetail;
  /** The aside was resized (fires per drag step, keyboard nudge, or a handle double-click reset), width in px. */
  'kai-aside-resize': WorkspaceAsideResizeDetail;
}

/**
 * `<kai-workspace>` — the chat-agnostic layout shell: five slots (`header` ·
 * `start` · `main` · `end` · `footer`), resize handles between the columns,
 * per-aside collapse, collapse-below-breakpoint, and a mobile drawer mode for
 * the asides. It knows nothing about chat: a file tree in `start` is as valid
 * as `<kai-conversations>`, and the workspace app slots `<kai-conversations>`
 * and `<kai-chat>` into it.
 *
 * ```html
 * <kai-workspace collapse-below="720" drawer-below="640">
 *   <kai-conversations slot="start"></kai-conversations>
 *   <kai-chat></kai-chat>
 * </kai-workspace>
 * ```
 *
 * Aside geometry is CSS custom properties, not props (the `kai-dock` rule):
 * `--kai-workspace-start-width` (280px) · `--kai-workspace-start-min-width`
 * (200px) · `--kai-workspace-start-max-width` (480px) · `--kai-workspace-end-width`
 * (320px) · `--kai-workspace-end-min-width` (200px) · `--kai-workspace-end-max-width`
 * (480px). Read once at upgrade. Parts: `header` · `start` · `main` · `end` ·
 * `footer` (the asides also match `::part(aside)`).
 *
 * **BREAKING (0.24):** this element was a chat
 * preset; it is now a layout shell, and everything chat-shaped is gone from its
 * surface. Where each removed prop went:
 *
 * - `conversations` / `activeId` / `groups` / `noConversations`: set them on your
 *   own `<kai-conversations slot="start">`.
 * - `messages` / `loading` / `proseSize` / `codeTheme` / `codeHighlight` /
 *   `chatTitle` / `scrollButton` / `cardTypes` / `cardSchemas`: set them on your
 *   own `<kai-chat>` in the main region.
 * - `value` / `placeholder` / `suggestions` / `suggestionMode` / `voice` /
 *   `triggers` / `kindIcons` and the renamed `webSearch` (was `search`): the
 *   composer surface on `<kai-chat>` or `<kai-prompt-input>`.
 * - `models` / `currentModel` / `context`: header chrome you slot (a model
 *   picker is a part in a slot, not three orchestrator props).
 * - `sidebarWidth` / `sidebarMinWidth` / `sidebarMaxWidth`: the
 *   `--kai-workspace-start-*` custom properties above.
 * - `sidebarCollapsed` / `defaultSidebarCollapsed`: `startCollapsed` /
 *   `defaultStartCollapsed` (per-aside; the end aside has its own pair).
 * - `collapseBelow`: kept, now collapsing both asides.
 * - `compact`: kept as a reflected density hint; the rail's row density is
 *   `<kai-conversations>`' own `compact`.
 * - Chat events (`kai-submit`, `kai-conversation-select`, `kai-message-action`,
 *   `kai-model-change`, `kai-search`, `kai-voice`, `kai-value-change`,
 *   `kai-suggestion-click`): listen on the part that fires them.
 *   `kai-sidebar-toggle` is now `kai-aside-toggle` with a `side`.
 * - Methods: `toggleSidebar()` / `collapseSidebar()` / `expandSidebar()` are now
 *   `toggleAside(side)` / `collapseAside(side)` / `expandAside(side)`; the
 *   thread methods (`focus`/`clear`/`send`/`scrollToBottom`) live on your
 *   `<kai-chat>`.
 *
 * The migration path for a full app is the `workspace` block scaffold (the kai
 * MCP `scaffold` tool), which emits this composition wired.
 */
defineWebComponent<Props, Events>('kai-workspace', {
  startCollapsed: undefined,
  defaultStartCollapsed: undefined,
  endCollapsed: undefined,
  defaultEndCollapsed: undefined,
  collapseBelow: undefined,
  drawerBelow: undefined,
  compact: undefined,
}, (props, { dispatch, flag, expose, element, reflectFlag }) => {
  // Which slots the consumer has filled. A bare <slot> is always a truthy JSX
  // node, so each optional region renders ONLY when readSlots reports projected
  // light-DOM content (re-read on childList mutation). Main always renders.
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  onMount(() => {
    const read = () => setSlots(readSlots(element, WORKSPACE_SLOTS));
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true });
    onCleanup(() => observer.disconnect());
  });

  // Reflect the read-back flags (the G-05 rule: a bare attribute parses to
  // `undefined`, so without this the property would contradict the attribute).
  reflectFlag('compact');
  reflectFlag('defaultStartCollapsed');
  reflectFlag('defaultEndCollapsed');

  // Aside geometry from the element's CSS custom properties, read once at
  // upgrade (inline style first so jsdom, which does not resolve custom
  // properties through getComputedStyle, still honors a direct set).
  const readVar = (name: string, fallback: number): number => {
    const inline = element.style.getPropertyValue(name).trim();
    const computed = inline || getComputedStyle(element).getPropertyValue(name).trim();
    const n = parseFloat(computed);
    return Number.isFinite(n) ? n : fallback;
  };
  const geometry = untrack(() => ({
    startWidth: readVar('--kai-workspace-start-width', 280),
    startMinWidth: readVar('--kai-workspace-start-min-width', 200),
    startMaxWidth: readVar('--kai-workspace-start-max-width', 480),
    endWidth: readVar('--kai-workspace-end-width', 320),
    endMinWidth: readVar('--kai-workspace-end-min-width', 200),
    endMaxWidth: readVar('--kai-workspace-end-max-width', 480),
  }));

  let controller: WorkspaceShellController | undefined;
  expose({
    /** Collapse/expand one aside (fires `kai-aside-toggle`). */
    toggleAside: (side: WorkspaceAsideSide) => controller?.toggleAside(side),
    /** Force one aside collapsed (fires `kai-aside-toggle`). */
    collapseAside: (side: WorkspaceAsideSide) => controller?.collapseAside(side),
    /** Force one aside expanded (fires `kai-aside-toggle`). */
    expandAside: (side: WorkspaceAsideSide) => controller?.expandAside(side),
  });

  return (
    <WorkspaceShell
      header={slots()['header'] ? <slot name="header" /> : undefined}
      start={slots()['start'] ? <slot name="start" /> : undefined}
      end={slots()['end'] ? <slot name="end" /> : undefined}
      footer={slots()['footer'] ? <slot name="footer" /> : undefined}
      startCollapsed={props.startCollapsed as boolean | undefined}
      defaultStartCollapsed={flag('defaultStartCollapsed')}
      endCollapsed={props.endCollapsed as boolean | undefined}
      defaultEndCollapsed={flag('defaultEndCollapsed')}
      collapseBelow={props.collapseBelow as number | undefined}
      drawerBelow={props.drawerBelow as number | undefined}
      compact={flag('compact')}
      {...geometry}
      onAsideToggle={(detail) => dispatch('kai-aside-toggle', detail)}
      onAsideResize={(detail) => dispatch('kai-aside-resize', detail)}
      controllerRef={(c) => (controller = c)}
    >
      <slot name="main" />
      <slot />
    </WorkspaceShell>
  );
});
