import { createEffect, createSignal, onCleanup, Show, type Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { ArrowLeft } from 'lucide-solid';
import { cn } from '../utils/cn';
import { createPresence } from '../ui/overlay';

/** Imperative open controller, handed to a parent (the kai-screen facade) via
 *  `controllerRef` so it can drive/observe open state with `wireDisclosure`. */
export interface ScreenController {
  open: Accessor<boolean>;
  setOpen: (v: boolean) => void;
}

export interface ScreenProps {
  /** The screen body. */
  children?: JSX.Element;
  /** Header title text. A projected `title` slot overrides this. */
  title?: JSX.Element;
  /** Header title slot content (the facade's `<slot name="title" />`). Overrides `title`. */
  titleSlot?: JSX.Element;
  /** Header trailing cluster (the facade's `<slot name="actions" />`). */
  actions?: JSX.Element;
  /** Controlled open state. When set, the component never changes it itself;
   *  drive it from `onOpenChange`. Omit for uncontrolled (internal) state. */
  open?: boolean;
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean;
  /** Show the back button (default true). */
  back?: boolean;
  /** Skip marking sibling elements inert/aria-hidden while open. */
  noInert?: boolean;
  /** The custom-element host, whose siblings get inert-ed while open. */
  host?: () => HTMLElement | undefined;
  /** Fires whenever open wants to change (back button / method). */
  onOpenChange?: (open: boolean) => void;
  /** Back navigation intent: the back button or Escape. */
  onBack?: () => void;
  /** Receive the open controller once mounted. */
  controllerRef?: (api: ScreenController) => void;
  /** Receive the focusable surface node so the facade's `focus()` can target it. */
  surfaceRef?: (el: HTMLElement) => void;
}

/** A stable id seed for labelling the dialog by its title. */
let idSeq = 0;

/**
 * Screen is the presentational full-bleed overlay surface. It owns the hard parts
 * of being a takeover: it fills its mount point while open, marks sibling
 * elements `inert` + `aria-hidden` (the standard modal pattern), moves focus into
 * the surface on open and restores it on close, fires `onBack` on Escape, and
 * runs an enter/exit transition that honors `prefers-reduced-motion`. When closed
 * it is removed from layout (no space, not focusable). The developer owns the swap
 * (their own routing flips `open`); this owns being the overlay.
 */
export function Screen(props: ScreenProps) {
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const titleId = `kai-screen-title-${++idSeq}`;

  const isControlled = () => props.open !== undefined;
  const isOpen = () => (isControlled() ? !!props.open : internalOpen());
  const setOpen = (v: boolean) => {
    if (!isControlled()) setInternalOpen(v);
    props.onOpenChange?.(v);
  };

  props.controllerRef?.({ open: isOpen, setOpen });

  const presence = createPresence(isOpen);

  let surface: HTMLElement | undefined;
  // The element that had focus before we opened, restored on close.
  let restoreFocus: HTMLElement | null = null;
  // Siblings we inert-ed, so we can undo exactly what we did.
  let inerted: { el: HTMLElement; hadInert: boolean; hadAriaHidden: string | null }[] = [];

  const back = () => props.back !== false;

  const requestBack = () => props.onBack?.();

  // Inert + aria-hide the host's siblings while open (skip when noInert). This is
  // the one light-DOM touch: the standard modal pattern that makes the background
  // non-interactive and removes it from the a11y tree, which is what justifies the
  // dialog/aria-modal semantics on the surface.
  const applyInert = () => {
    if (props.noInert) return;
    const host = props.host?.();
    const parent = host?.parentElement;
    if (!host || !parent) return;
    for (const node of Array.from(parent.children)) {
      if (node === host) continue;
      const el = node as HTMLElement;
      inerted.push({ el, hadInert: el.hasAttribute('inert'), hadAriaHidden: el.getAttribute('aria-hidden') });
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    }
  };
  const releaseInert = () => {
    for (const { el, hadInert, hadAriaHidden } of inerted) {
      if (!hadInert) el.removeAttribute('inert');
      if (hadAriaHidden === null) el.removeAttribute('aria-hidden');
      else el.setAttribute('aria-hidden', hadAriaHidden);
    }
    inerted = [];
  };

  // Drive inert + focus on the open/closed transition.
  // V2-PORT (R1): compute tracks isOpen; the inert/focus choreography (DOM reads
  // and writes) is the apply. The removed initialValue seed became a default on
  // the prev parameter, so a defaultOpen mount still runs the open branch.
  createEffect(isOpen, (open, wasOpen = false) => {
    if (open && !wasOpen) {
      restoreFocus = (document.activeElement as HTMLElement) ?? null;
      applyInert();
      // Move focus into the surface once it has mounted.
      queueMicrotask(() => surface?.focus());
    } else if (!open && wasOpen) {
      releaseInert();
      // Return focus to the invoker if it's still in the document.
      const target = restoreFocus;
      restoreFocus = null;
      if (target && target.isConnected) queueMicrotask(() => target.focus());
    }
  });

  onCleanup(releaseInert);

  // Escape fires the back intent (navigation), matching the back button.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      requestBack();
    }
  };

  return (
    <Show when={presence.present()}>
      <div
        ref={(el) => { surface = el; presence.setRef(el); props.surfaceRef?.(el); }}
        part="body"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabindex="-1"
        data-expanded={presence.state() === 'open' ? '' : undefined}
        data-closed={presence.state() === 'closed' ? '' : undefined}
        onKeyDown={onKeyDown}
        // `outline-none` is DELIBERATE here and must stay: this is the
        // `tabindex="-1"` screen container, focused programmatically on open so
        // keyboard and screen-reader context follows the screen. It is not a
        // tab stop, so a ring around the whole surface would be noise. Its
        // interactive children carry their own.
        class={cn(
          'absolute inset-0 z-40 flex flex-col bg-background text-foreground outline-none',
          'animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none',
          'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:slide-out-to-bottom-2',
        )}
      >
        <header part="header" class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Show when={back()}>
            <button
              part="back"
              type="button"
              aria-label="Back"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={requestBack}
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          </Show>
          <h2 part="title" id={titleId} class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {/* Native shadow-slot fallback: a projected `title` slot wins; otherwise
                the `title` prop renders as the slot's default content. */}
            {props.titleSlot ?? props.title}
          </h2>
          <div class="flex shrink-0 items-center gap-1">{props.actions}</div>
        </header>
        <div class="min-h-0 flex-1 overflow-auto">{props.children}</div>
      </div>
    </Show>
  );
}
