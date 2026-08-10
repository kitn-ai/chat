import {
  createContext, useContext, createSignal, createUniqueId, Show, onCleanup, splitProps,
  type JSX, type Accessor,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { ChevronRight, Check } from 'lucide-solid';
import { cn } from '../utils/cn';
import { useChatConfig } from '../primitives/chat-config';
import { createPresence, usePosition, useDismiss, As, type AsTag } from './overlay';

interface DropdownCtx {
  open: Accessor<boolean>;
  setOpen: (v: boolean, opts?: { viaKeyboard?: boolean; returnFocus?: boolean }) => void;
  triggerId: string;
  menuId: string;
  setTrigger: (el: HTMLElement) => void;
  setMenu: (el: HTMLElement) => void;
  trigger: Accessor<HTMLElement | undefined>;
  menu: Accessor<HTMLElement | undefined>;
  openedViaKeyboard: Accessor<boolean>;
  /** Register a portaled submenu surface so outside-click dismissal treats it as
   *  "inside" the menu tree (sub content lives in a sibling portal, not the menu DOM). */
  registerSubMenu: (el: HTMLElement) => () => void;
  /** Currently-mounted submenu surfaces, for the dismiss "inside" test. */
  subMenus: Accessor<HTMLElement[]>;
}
const Ctx = createContext<DropdownCtx>();
const useDropdown = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('Dropdown parts must be used within <Dropdown>');
  return c;
};

// The roving-focus set: real menuitems AND checkbox/radio items, minus disabled.
// A DropdownSubTrigger is a menuitem too, so it participates. Labels/separators
// are intentionally excluded. Submenu content is portaled to a SIBLING node, so
// a parent's querySelectorAll scoped to its own menu never reaches sub items.
const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"])';

/** Imperative open controller, handed to a parent (e.g. the kai-menu facade) via
 *  `controllerRef` so it can drive/observe the Dropdown's open state. */
export interface DropdownController { open: Accessor<boolean>; setOpen: (v: boolean) => void; }

export interface DropdownProps {
  children: JSX.Element;
  /** Initial open state (uncontrolled seed). */
  defaultOpen?: boolean;
  /** When true, the trigger never opens the menu. */
  disabled?: boolean;
  /** Receive the open controller (open accessor + setOpen) once mounted. */
  controllerRef?: (api: DropdownController) => void;
}

export interface DropdownTriggerProps {
  /** Render as a different tag/component; defaults to a button. */
  as?: AsTag;
  children?: JSX.Element;
  class?: string;
  /** Remaining attributes are spread onto the rendered trigger. */
  [k: string]: unknown;
}

export interface DropdownContentProps { children: JSX.Element; class?: string }

export interface DropdownItemProps {
  children: JSX.Element;
  class?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface DropdownSeparatorProps { class?: string }

export interface DropdownLabelProps { children: JSX.Element; class?: string }

export interface DropdownCheckboxItemProps extends DropdownItemProps { checked?: boolean }

export interface DropdownRadioItemProps extends DropdownItemProps { checked?: boolean }

export interface DropdownSubProps { children: JSX.Element }

export interface DropdownSubTriggerProps { children: JSX.Element; class?: string }

export interface DropdownSubContentProps { children: JSX.Element; class?: string }

export function Dropdown(props: DropdownProps) {
  const [open, setOpenSig] = createSignal(props.defaultOpen ?? false);
  const [viaKb, setViaKb] = createSignal(false);
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const [menu, setMenu] = createSignal<HTMLElement>();
  const [subMenus, setSubMenus] = createSignal<HTMLElement[]>([]);
  const registerSubMenu = (el: HTMLElement) => {
    setSubMenus((prev) => [...prev, el]);
    return () => setSubMenus((prev) => prev.filter((m) => m !== el));
  };
  const setOpen = (v: boolean, opts?: { viaKeyboard?: boolean; returnFocus?: boolean }) => {
    // Gate opening while disabled; closing always works.
    if (v && props.disabled) return;
    setViaKb(!!opts?.viaKeyboard);
    setOpenSig(v);
    if (v) {
      // Focus the first item on keyboard-open. The menu mounts via <Show>; we
      // attempt focus now and re-assert in the menu ref's microtask so it lands
      // once the node exists. Skip disabled items (roving-focus contract).
      if (opts?.viaKeyboard) {
        queueMicrotask(() => menu()?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus());
        menu()?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
      }
    } else if (opts?.returnFocus !== false) {
      // Closing via keyboard/select: return focus to the trigger. The menu
      // unmounts on a microtask (createPresence) and that teardown blurs
      // whatever is focused, so re-assert focus AFTER unmount too.
      const el = trigger();
      el?.focus();
      queueMicrotask(() => el?.focus());
    }
  };
  // Hand the open controller up to a facade (e.g. kai-menu) so it can drive +
  // observe open state via wireDisclosure. Mirrors HoverCardRoot.controllerRef.
  props.controllerRef?.({ open, setOpen: (v: boolean) => setOpen(v) });
  return (
    <Ctx.Provider value={{
      open, setOpen, triggerId: createUniqueId(), menuId: createUniqueId(),
      setTrigger, setMenu, trigger, menu, openedViaKeyboard: viaKb,
      registerSubMenu, subMenus,
    }}>
      {props.children}
    </Ctx.Provider>
  );
}

export function DropdownTrigger(props: DropdownTriggerProps) {
  const ctx = useDropdown();
  // Forward extra attributes (e.g. aria-label for an icon-only trigger). The
  // controlled wiring below (id/aria-*/onClick/onKeyDown/class/type) is applied
  // AFTER the spread so it always wins over a caller-supplied duplicate.
  const [, rest] = splitProps(props, ['as', 'children', 'class']);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ctx.setOpen(true, { viaKeyboard: true });
    }
  };
  return (
    <As
      as={props.as ?? 'button'}
      {...rest}
      ref={ctx.setTrigger}
      id={ctx.triggerId}
      aria-haspopup="menu"
      aria-expanded={ctx.open()}
      aria-controls={ctx.open() ? ctx.menuId : undefined}
      onClick={() => ctx.setOpen(!ctx.open())}
      onKeyDown={onKeyDown}
      class={props.class}
      {...(props.as ? {} : { type: 'button' })}
    >
      {props.children}
    </As>
  );
}

export function DropdownContent(props: DropdownContentProps) {
  const ctx = useDropdown();
  const config = useChatConfig();
  const presence = createPresence(ctx.open);
  const position = usePosition(ctx.trigger, ctx.menu, {
    placement: 'bottom-start',
    gutter: 6,
    // Trigger removed from the DOM -> close (no focus return; it's gone) so the
    // menu portal doesn't orphan.
    onDisconnect: () => ctx.setOpen(false, { returnFocus: false }),
  });
  useDismiss({
    enabled: ctx.open,
    onDismiss: (reason) => ctx.setOpen(false, { returnFocus: reason === 'escape' }),
    // Open submenus portal to a sibling node, so include them as "inside" — a
    // click on a sub item must not be treated as an outside dismiss.
    refs: () => [ctx.trigger(), ctx.menu(), ...ctx.subMenus()],
  });

  const items = () => Array.from(ctx.menu()?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
  const focusIndex = (i: number) => {
    const list = items();
    if (!list.length) return;
    const idx = ((i % list.length) + list.length) % list.length;
    list[idx].focus();
  };
  // Resolve the focused item via the menu's own root node. Inside a Shadow DOM
  // (every kitn-* element), `document.activeElement` returns the host element,
  // not the focused menu item, which would break ArrowUp/Down roving focus.
  // `getRootNode().activeElement` correctly returns the active node within the
  // same tree (ShadowRoot or Document).
  const activeItem = () => {
    const root = ctx.menu()?.getRootNode() as Document | ShadowRoot | undefined;
    return (root?.activeElement ?? document.activeElement) as Element | null;
  };
  const currentIndex = () => items().findIndex((el) => el === activeItem());

  const onKeyDown = (e: KeyboardEvent) => {
    const list = items();
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusIndex(currentIndex() + 1); break;
      case 'ArrowUp': e.preventDefault(); focusIndex(currentIndex() - 1); break;
      case 'Home': e.preventDefault(); focusIndex(0); break;
      case 'End': e.preventDefault(); focusIndex(list.length - 1); break;
      case 'Tab': ctx.setOpen(false, { returnFocus: false }); break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const start = currentIndex() + 1;
          const lower = e.key.toLowerCase();
          const match = list.findIndex((el, i) => i >= start && (el.textContent ?? '').trim().toLowerCase().startsWith(lower));
          const found = match >= 0 ? match : list.findIndex((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(lower));
          if (found >= 0) { e.preventDefault(); focusIndex(found); }
        }
    }
  };

  return (
    <Show when={presence.present()}>
      <Portal mount={config.portalMount()}>
        <div
          ref={(el) => {
            ctx.setMenu(el); presence.setRef(el);
            // Keyboard-open focuses the first item. setOpen() also attempts this
            // synchronously; this ref-time microtask re-asserts focus once the
            // menu node exists. Skip disabled items.
            if (ctx.openedViaKeyboard()) {
              queueMicrotask(() => el.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus());
            }
          }}
          id={ctx.menuId}
          role="menu"
          aria-labelledby={ctx.triggerId}
          tabindex={-1}
          data-expanded={presence.state() === 'open' ? '' : undefined}
          data-closed={presence.state() === 'closed' ? '' : undefined}
          onKeyDown={onKeyDown}
          style={{
            position: 'fixed', left: `${position.pos().x}px`, top: `${position.pos().y}px`,
            // hide (without unmounting) when the trigger scrolls out of view
            visibility: position.hidden() ? 'hidden' : 'visible',
            'pointer-events': position.hidden() ? 'none' : undefined,
          }}
          class={cn(
            'z-50 min-w-[8rem] rounded-lg bg-card p-1 kai-elevation',
            'animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
            props.class,
          )}
        >
          {props.children}
        </div>
      </Portal>
    </Show>
  );
}

export function DropdownItem(props: DropdownItemProps) {
  const ctx = useDropdown();
  const activate = () => {
    if (props.disabled) return;
    props.onSelect?.();
    ctx.setOpen(false);
  };
  return (
    <div
      role="menuitem"
      tabindex={-1}
      aria-disabled={props.disabled ? 'true' : undefined}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
      onPointerMove={(e) => { if (!props.disabled) (e.currentTarget as HTMLElement).focus(); }}
      class={cn(
        'flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
        'hover:bg-muted focus:bg-muted',
        props.disabled && 'opacity-50 pointer-events-none',
        props.class,
      )}
    >
      {props.children}
    </div>
  );
}

/**
 * A thin, non-interactive divider between groups of items.
 * a11y: `role="separator"` — exposed to AT as a group boundary; not in the
 * roving-focus tab order (the `[role="menuitem"]` query skips it).
 */
export function DropdownSeparator(props: DropdownSeparatorProps) {
  return <div role="separator" class={cn('-mx-1 my-1 h-px bg-border', props.class)} />;
}

/**
 * A non-interactive section header.
 * a11y: a plain muted label — NOT a menuitem and NOT focusable, so roving focus
 * skips it; it labels the items that follow visually only (`select-none`).
 */
export function DropdownLabel(props: DropdownLabelProps) {
  return (
    <div class={cn('select-none px-2 py-1.5 text-xs font-medium text-muted-foreground', props.class)}>
      {props.children}
    </div>
  );
}

/**
 * A togglable menu item.
 * a11y: `role="menuitemcheckbox"` + `aria-checked`. Activating fires `onSelect`
 * but KEEPS THE MENU OPEN (the consumer flips `checked`). The Check sits at the
 * TRAILING edge (toggle-style) so the item's leading content — an icon when
 * present — aligns with the plain items above it instead of being pushed in by a
 * reserved leading check column.
 */
export function DropdownCheckboxItem(props: DropdownCheckboxItemProps) {
  const activate = () => {
    if (props.disabled) return;
    props.onSelect?.(); /* stay open — consumer owns `checked` */
  };
  return (
    <div
      role="menuitemcheckbox"
      aria-checked={props.checked ? 'true' : 'false'}
      tabindex={-1}
      aria-disabled={props.disabled ? 'true' : undefined}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
      onPointerMove={(e) => { if (!props.disabled) (e.currentTarget as HTMLElement).focus(); }}
      class={cn(
        'flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
        'hover:bg-muted focus:bg-muted',
        props.disabled && 'opacity-50 pointer-events-none',
        props.class,
      )}
    >
      {props.children}
      <span class="ml-auto flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        <Show when={props.checked}><Check class="size-4" aria-hidden="true" /></Show>
      </span>
    </div>
  );
}

/**
 * A single-select (radio) menu item.
 * a11y: `role="menuitemradio"` + `aria-checked`. Behaves like the checkbox item —
 * activating fires `onSelect` but KEEPS THE MENU OPEN (the consumer moves the
 * selection within the group). The Check sits at the TRAILING edge so leading
 * content aligns with plain items. Group membership is the consumer's concern;
 * this primitive just renders the selected state and reports the click.
 */
export function DropdownRadioItem(props: DropdownRadioItemProps) {
  const activate = () => {
    if (props.disabled) return;
    props.onSelect?.(); /* stay open — consumer owns the group selection */
  };
  return (
    <div
      role="menuitemradio"
      aria-checked={props.checked ? 'true' : 'false'}
      tabindex={-1}
      aria-disabled={props.disabled ? 'true' : undefined}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
      onPointerMove={(e) => { if (!props.disabled) (e.currentTarget as HTMLElement).focus(); }}
      class={cn(
        'flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
        'hover:bg-muted focus:bg-muted',
        props.disabled && 'opacity-50 pointer-events-none',
        props.class,
      )}
    >
      {props.children}
      <span class="ml-auto flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        <Show when={props.checked}><Check class="size-4" aria-hidden="true" /></Show>
      </span>
    </div>
  );
}

// ── Submenus ────────────────────────────────────────────────────────────────

interface DropdownSubCtx {
  open: Accessor<boolean>;
  setOpen: (v: boolean, opts?: { viaKeyboard?: boolean; returnFocus?: boolean }) => void;
  triggerId: string;
  menuId: string;
  setTrigger: (el: HTMLElement) => void;
  setMenu: (el: HTMLElement) => void;
  trigger: Accessor<HTMLElement | undefined>;
  menu: Accessor<HTMLElement | undefined>;
  openedViaKeyboard: Accessor<boolean>;
  /** clear any pending close timer (used when the pointer re-enters trigger or content) */
  cancelClose: () => void;
  /** schedule a deferred close, tolerating a pointer crossing the gap to the submenu */
  scheduleClose: () => void;
}
const SubCtx = createContext<DropdownSubCtx>();
const useDropdownSub = () => {
  const c = useContext(SubCtx);
  if (!c) throw new Error('DropdownSub parts must be used within <DropdownSub>');
  return c;
};

/**
 * A nested menu group. Mirrors the `Dropdown` context shape with its own open
 * signal + trigger/content refs, plus a small close-delay so a pointer can cross
 * the gap from the trigger to the submenu without it snapping shut.
 *
 * The submenu is tied to its PARENT open state: when the parent menu closes
 * (Escape/outside-click/select), `useDismiss` on the parent unmounts the whole
 * content tree, which tears this provider down and drops the sub with it.
 */
export function DropdownSub(props: DropdownSubProps) {
  const [open, setOpenSig] = createSignal(false);
  const [viaKb, setViaKb] = createSignal(false);
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const [menu, setMenu] = createSignal<HTMLElement>();
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelClose = () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = undefined; } };
  const setOpen = (v: boolean, opts?: { viaKeyboard?: boolean; returnFocus?: boolean }) => {
    cancelClose();
    setViaKb(!!opts?.viaKeyboard);
    setOpenSig(v);
    if (v) {
      if (opts?.viaKeyboard) {
        queueMicrotask(() => menu()?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus());
        menu()?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
      }
    } else if (opts?.returnFocus !== false) {
      const el = trigger();
      el?.focus();
      queueMicrotask(() => el?.focus());
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer = setTimeout(() => setOpen(false), 120);
  };
  onCleanup(cancelClose);
  return (
    <SubCtx.Provider value={{
      open, setOpen, triggerId: createUniqueId(), menuId: createUniqueId(),
      setTrigger, setMenu, trigger, menu, openedViaKeyboard: viaKb,
      cancelClose, scheduleClose,
    }}>
      {props.children}
    </SubCtx.Provider>
  );
}

/**
 * The item that opens a submenu.
 * a11y: `role="menuitem"` + `aria-haspopup="menu"` + `aria-expanded`, trailing
 * ChevronRight. Opens on pointerenter, click, ArrowRight, and Enter/Space;
 * keyboard-open also moves focus into the sub's first item. ArrowRight/Enter are
 * swallowed so the parent menu doesn't also act on them.
 */
export function DropdownSubTrigger(props: DropdownSubTriggerProps) {
  const sub = useDropdownSub();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      sub.setOpen(true, { viaKeyboard: true });
    }
  };
  return (
    <div
      ref={sub.setTrigger}
      id={sub.triggerId}
      role="menuitem"
      tabindex={-1}
      aria-haspopup="menu"
      aria-expanded={sub.open()}
      aria-controls={sub.open() ? sub.menuId : undefined}
      onClick={() => sub.setOpen(!sub.open())}
      onKeyDown={onKeyDown}
      onPointerEnter={() => { sub.cancelClose(); sub.setOpen(true); }}
      onPointerLeave={() => sub.scheduleClose()}
      onPointerMove={(e) => (e.currentTarget as HTMLElement).focus()}
      class={cn(
        'flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors',
        'hover:bg-muted focus:bg-muted data-[expanded]:bg-muted',
        props.class,
      )}
      data-expanded={sub.open() ? '' : undefined}
    >
      {props.children}
      <ChevronRight class="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

/**
 * The submenu surface — same portal/positioning/roving-focus core as
 * DropdownContent, anchored `right-start` off its trigger.
 * a11y: ArrowLeft and Escape close the sub and RETURN FOCUS to the trigger;
 * ArrowUp/Down/Home/End rove within; typeahead included (matches DropdownContent).
 * Keyboard-open focuses the first item.
 */
export function DropdownSubContent(props: DropdownSubContentProps) {
  const sub = useDropdownSub();
  const parent = useDropdown();
  const config = useChatConfig();
  const presence = createPresence(sub.open);
  const position = usePosition(sub.trigger, sub.menu, {
    placement: 'right-start',
    gutter: 2,
    // Sub trigger removed from the DOM -> close so the submenu portal doesn't orphan.
    onDisconnect: () => sub.setOpen(false, { returnFocus: false }),
  });
  // Escape/ArrowLeft are handled by onKeyDown below (stopPropagation keeps them
  // local to the sub). Outside-pointer dismiss is handled by the PARENT's
  // useDismiss (whose refs include the registered submenu surface). A separate
  // useDismiss here would double-fire Escape because document listeners run
  // after stopPropagation on the element, not on the document.

  const items = () => Array.from(sub.menu()?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
  const focusIndex = (i: number) => {
    const list = items();
    if (!list.length) return;
    const idx = ((i % list.length) + list.length) % list.length;
    list[idx].focus();
  };
  const activeItem = () => {
    const root = sub.menu()?.getRootNode() as Document | ShadowRoot | undefined;
    return (root?.activeElement ?? document.activeElement) as Element | null;
  };
  const currentIndex = () => items().findIndex((el) => el === activeItem());

  const onKeyDown = (e: KeyboardEvent) => {
    const list = items();
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusIndex(currentIndex() + 1); break;
      case 'ArrowUp': e.preventDefault(); focusIndex(currentIndex() - 1); break;
      case 'Home': e.preventDefault(); focusIndex(0); break;
      case 'End': e.preventDefault(); focusIndex(list.length - 1); break;
      case 'ArrowLeft': e.preventDefault(); e.stopPropagation(); sub.setOpen(false, { returnFocus: true }); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); sub.setOpen(false, { returnFocus: true }); break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const start = currentIndex() + 1;
          const lower = e.key.toLowerCase();
          const match = list.findIndex((el, i) => i >= start && (el.textContent ?? '').trim().toLowerCase().startsWith(lower));
          const found = match >= 0 ? match : list.findIndex((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(lower));
          if (found >= 0) { e.preventDefault(); focusIndex(found); }
        }
    }
  };

  return (
    <Show when={presence.present()}>
      <Portal mount={config.portalMount()}>
        <div
          ref={(el) => {
            sub.setMenu(el); presence.setRef(el);
            // Tell the parent menu this surface is part of its tree (outside-click).
            const unregister = parent.registerSubMenu(el);
            onCleanup(unregister);
            if (sub.openedViaKeyboard()) {
              queueMicrotask(() => el.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus());
            }
          }}
          id={sub.menuId}
          role="menu"
          aria-labelledby={sub.triggerId}
          tabindex={-1}
          data-expanded={presence.state() === 'open' ? '' : undefined}
          data-closed={presence.state() === 'closed' ? '' : undefined}
          onKeyDown={onKeyDown}
          // Keep the sub open while the pointer is over it (cancel a pending close
          // scheduled by the trigger's pointerleave); re-arm the close on exit.
          onPointerEnter={() => sub.cancelClose()}
          onPointerLeave={() => sub.scheduleClose()}
          style={{
            position: 'fixed', left: `${position.pos().x}px`, top: `${position.pos().y}px`,
            visibility: position.hidden() ? 'hidden' : 'visible',
            'pointer-events': position.hidden() ? 'none' : undefined,
          }}
          class={cn(
            'z-50 min-w-[8rem] rounded-lg bg-card p-1 kai-elevation',
            'animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
            props.class,
          )}
        >
          {props.children}
        </div>
      </Portal>
    </Show>
  );
}
