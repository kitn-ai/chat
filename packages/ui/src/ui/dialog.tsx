import {
  createEffect, createSignal, createUniqueId, Show, type Accessor, type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { cn } from '../utils/cn';
import { useChatConfig } from '../primitives/chat-config';
import { createPresence } from './overlay';

/** Imperative open controller, handed to a parent (e.g. the kai-dialog facade)
 *  via `controllerRef` so it can drive/observe open state with `wireDisclosure`. */
export interface DialogController { open: Accessor<boolean>; setOpen: (v: boolean) => void; }

export interface DialogProps {
  /** Dialog body — the default slot / main content. */
  children?: JSX.Element;
  /** Optional header region (e.g. a title). Rendered above the body with a divider. */
  header?: JSX.Element;
  /** Optional footer region (e.g. action buttons). Rendered below the body with a divider. */
  footer?: JSX.Element;
  /** Controlled open state. When set, the component never changes it itself —
   *  drive it from `onOpenChange`. Omit for uncontrolled (internal) state. */
  open?: boolean;
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean;
  /** Fires whenever the dialog wants to open or close (Escape / backdrop / method). */
  onOpenChange?: (open: boolean) => void;
  /** Receive the open controller (open accessor + setOpen) once mounted. */
  controllerRef?: (api: DialogController) => void;
  /** Receive the focusable panel node so a facade's `focus()` can target it. */
  panelRef?: (el: HTMLElement) => void;
  /** Accessible name for the dialog when no `header` is provided. */
  'aria-label'?: string;
  /** Extra class applied to the panel (e.g. a wider `max-w-*`). */
  class?: string;
}

/** Focusable-element selector for the Tab focus trap. */
const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Roughly "rendered + not visibility:hidden" — skips display:none / hidden nodes. */
function isVisible(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    && getComputedStyle(el).visibility !== 'hidden';
}

/**
 * Tabbable descendants of `panel`, in tab order. Crosses `<slot>` boundaries:
 * when used as a web-component facade the panel's real content is light-DOM nodes
 * assigned to its slots, not panel descendants, so a plain querySelectorAll would
 * miss them. We walk the tree and expand each slot to its assigned elements.
 */
function getTabbables(panel: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child instanceof HTMLSlotElement) {
        for (const assigned of child.assignedElements()) {
          if (assigned instanceof HTMLElement) {
            if (assigned.matches(FOCUSABLE_SELECTOR)) out.push(assigned);
            walk(assigned);
          }
        }
      } else if (child instanceof HTMLElement) {
        if (child.matches(FOCUSABLE_SELECTOR)) out.push(child);
        walk(child);
      }
    }
  };
  walk(panel);
  return out.filter(isVisible);
}

/** The deepest active element, drilling through nested shadow roots (so a focused
 *  node inside a shadow tree resolves to the real element, not its host). */
function deepActiveElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
  return el;
}

/**
 * Dialog is the presentational centered modal surface. It renders through a Portal
 * (so it escapes any clipping/stacking ancestor), dims the page with a backdrop,
 * and centers a panel with a sensible max width/height and internal scroll. It
 * closes on Escape and on a backdrop click (never on a panel click), moves focus
 * into the panel on open and restores it on close, and runs a basic Tab focus
 * trap so keyboard focus cycles within the panel while open. The developer owns
 * when it opens (drive `open` / `defaultOpen`); this owns being the modal.
 *
 * Styleable parts: `backdrop` · `panel` · `header` · `body` · `footer`.
 */
export function Dialog(props: DialogProps) {
  const config = useChatConfig();
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const headerId = `kai-dialog-title-${createUniqueId()}`;

  const isControlled = () => props.open !== undefined;
  const isOpen = () => (isControlled() ? !!props.open : internalOpen());
  const setOpen = (v: boolean) => {
    if (!isControlled()) setInternalOpen(v);
    props.onOpenChange?.(v);
  };

  // Hand the open controller up to a parent (e.g. the kai-dialog facade) so it can
  // drive/observe open state via wireDisclosure.
  props.controllerRef?.({ open: isOpen, setOpen });

  const presence = createPresence(isOpen);

  let backdrop: HTMLElement | undefined;
  let panel: HTMLElement | undefined;
  // The element that had focus before we opened, restored on close.
  let restoreFocus: HTMLElement | null = null;
  // Track where a click started so a drag that ends on the backdrop (e.g. a text
  // selection begun inside the panel) does not falsely dismiss.
  let pointerDownOnBackdrop = false;

  // Move focus into the panel on open; restore it on close. Seeded prev=false so a
  // `defaultOpen` (open-at-mount) still runs the open branch.
  createEffect((wasOpen: boolean) => {
    const open = isOpen();
    if (open && !wasOpen) {
      restoreFocus = deepActiveElement();
      queueMicrotask(() => panel?.focus());
    } else if (!open && wasOpen) {
      const target = restoreFocus;
      restoreFocus = null;
      if (target && target.isConnected) queueMicrotask(() => target.focus());
    }
    return open;
  }, false);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key !== 'Tab' || !panel) return;
    // Basic focus trap: keep Tab / Shift+Tab cycling within the panel.
    const items = getTabbables(panel);
    if (!items.length) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const active = deepActiveElement();
    const idx = active ? items.indexOf(active) : -1;
    if (e.shiftKey) {
      if (idx <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    } else if (idx === -1 || idx === items.length - 1) {
      e.preventDefault();
      items[0].focus();
    }
  };

  const onClick = (e: MouseEvent) => {
    if (pointerDownOnBackdrop && e.target === backdrop) setOpen(false);
    pointerDownOnBackdrop = false;
  };

  return (
    <Show when={presence.present()}>
      <Portal mount={config.portalMount()}>
        <div
          ref={(el) => { backdrop = el; presence.setRef(el); }}
          part="backdrop"
          data-expanded={presence.state() === 'open' ? '' : undefined}
          data-closed={presence.state() === 'closed' ? '' : undefined}
          onPointerDown={(e) => { pointerDownOnBackdrop = e.target === e.currentTarget; }}
          onClick={onClick}
          onKeyDown={onKeyDown}
          class={cn(
            'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4',
            'animate-in fade-in-0 data-[closed]:animate-out data-[closed]:fade-out-0 motion-reduce:animate-none',
          )}
        >
          <div
            ref={(el) => { panel = el; props.panelRef?.(el); }}
            part="panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={props.header ? headerId : undefined}
            aria-label={props.header ? undefined : props['aria-label']}
            tabindex={-1}
            data-expanded={presence.state() === 'open' ? '' : undefined}
            data-closed={presence.state() === 'closed' ? '' : undefined}
            // `outline-none` is DELIBERATE here and must stay. This is a
            // `tabindex={-1}` focus-trap container: it is focused
            // programmatically on open to move keyboard and screen-reader
            // context into the dialog, and is never a tab stop. Drawing a ring
            // would put a blue box around the entire dialog every time it
            // opened. The controls inside it carry their own focus rings.
            class={cn(
              'flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xl outline-none',
              'animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 motion-reduce:animate-none',
              props.class,
            )}
          >
            <Show when={props.header}>
              <header part="header" id={headerId} class="shrink-0 border-b border-border px-5 py-4 text-base font-semibold text-foreground">
                {props.header}
              </header>
            </Show>
            <div part="body" class="min-h-0 flex-1 overflow-auto px-5 py-4 text-sm text-foreground">
              {props.children}
            </div>
            <Show when={props.footer}>
              <footer part="footer" class="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
                {props.footer}
              </footer>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
