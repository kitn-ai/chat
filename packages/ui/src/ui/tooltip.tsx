import { createSignal, createUniqueId, onCleanup, Show, type Accessor, omit } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Portal } from '@solidjs/web';
import { type Placement } from '@floating-ui/dom';
import { cn } from '../utils/cn';
import { useChatConfig } from '../primitives/chat-config';
import { createPresence, usePosition, useDismiss, As } from './overlay';

/** Imperative open controller, handed to a parent (e.g. the kai-tooltip facade)
 *  via `controllerRef` so it can drive/observe open state. */
export interface TooltipController { open: Accessor<boolean>; setOpen: (v: boolean) => void; }

export interface TooltipProps {
  content: string;
  children: JSX.Element;
  class?: string;
  openDelay?: number;
  /** Delay (ms) before it hides after the pointer leaves. Defaults to 0 (hides
   *  immediately). */
  closeDelay?: number;
  /** Preferred placement (post flip/shift). Defaults to `'top'`. */
  placement?: Placement;
  /** Initial open state on mount (uncontrolled seed). */
  defaultOpen?: boolean;
  /** When true, hover/focus (and `show()`) never opens the tooltip. */
  disabled?: boolean;
  /** Receive the open controller (open accessor + setOpen) once mounted. */
  controllerRef?: (api: TooltipController) => void;
  dismissOnClick?: boolean;
}

export function Tooltip(props: TooltipProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;
  const config = useChatConfig();
  const id = createUniqueId();
  const [open, setOpen] = createSignal(local.defaultOpen ?? false);
  const [triggerEl, setTriggerEl] = createSignal<HTMLElement>();
  const [contentEl, setContentEl] = createSignal<HTMLElement>();
  // Hand the open controller up so a facade (kai-tooltip) can drive/observe it.
  // setOpen is gated on `disabled` so the disclosure surface (show/hide/toggle)
  // can never force the tooltip open while disabled.
  local.controllerRef?.({ open, setOpen: (v) => setOpen(v && !local.disabled) });
  let timer: number | undefined;
  // True for the span of a click (pointerdown → focus → click). Suppresses the
  // focus-show so clicking a hovered trigger DISMISSES it instead of flickering
  // hide→show→hide (pointerdown hid it, the click-induced focus re-showed it,
  // then click hid it again). Keyboard focus has no preceding pointerdown, so it
  // still shows the tooltip normally.
  let pointerDown = false;

  const [pointerInside, setPointerInside] = createSignal(false);
  const [focusInside, setFocusInside] = createSignal(false);

  const show = (delay = 0) => {
    if (local.disabled) return;
    clearTimeout(timer);
    if (delay) timer = window.setTimeout(() => setOpen(true), delay);
    else setOpen(true);
  };
  const hide = () => {
    clearTimeout(timer);
    const delay = local.closeDelay ?? 0;
    if (delay) timer = window.setTimeout(() => setOpen(false), delay);
    else setOpen(false);
  };
  const maybeHide = () => { if (!pointerInside() && !focusInside()) hide(); };
  // Action-style tooltips should dismiss when their trigger is clicked: the pointer
  // never "leaves", so reset the inside flags and force-close until the next genuine
  // hover/focus. Opt out with dismissOnClick={false}.
  const dismiss = () => { if (local.dismissOnClick === false) return; setPointerInside(false); setFocusInside(false); hide(); };
  onCleanup(() => clearTimeout(timer));

  const presence = createPresence(open);
  const position = usePosition(triggerEl, contentEl, {
    placement: local.placement ?? 'top',
    gutter: 6,
    // Trigger removed from the DOM -> close so the tooltip portal doesn't orphan.
    onDisconnect: () => setOpen(false),
  });
  useDismiss({ enabled: open, onDismiss: hide, refs: () => [triggerEl(), contentEl()] });

  return (
    <>
      <As
        as="span"
        class="inline-flex"
        ref={setTriggerEl}
        aria-describedby={open() ? id : undefined}
        onPointerEnter={() => { setPointerInside(true); show(local.openDelay ?? 600); }}
        onPointerLeave={() => { setPointerInside(false); maybeHide(); }}
        onPointerDown={() => { pointerDown = true; dismiss(); window.setTimeout(() => { pointerDown = false; }, 0); }}
        onClick={dismiss}
        onFocusIn={() => { setFocusInside(true); if (!pointerDown) show(); }}
        onFocusOut={(e: FocusEvent) => { const t = triggerEl(); if (t && t.contains(e.relatedTarget as Node)) return; setFocusInside(false); maybeHide(); }}
      >
        {local.children}
      </As>
      <Show when={presence.present()}>
        <Portal mount={config.portalMount()}>
          <div
            ref={(el) => { setContentEl(el); presence.setRef(el); }}
            id={id}
            role="tooltip"
            data-expanded={presence.state() === 'open' ? '' : undefined}
            data-closed={presence.state() === 'closed' ? '' : undefined}
            style={{ position: 'fixed', left: `${position.pos().x}px`, top: `${position.pos().y}px`, 'pointer-events': 'none', visibility: position.hidden() ? 'hidden' : 'visible' }}
            class={cn(
              'z-50 rounded-md bg-foreground px-2.5 py-1 text-xs text-background shadow-md',
              'animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
              local.class,
            )}
          >
            {local.content}
          </div>
        </Portal>
      </Show>
    </>
  );
}
