import { createSignal, Show, type Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { Placement } from '@floating-ui/dom';
import { cn } from '../utils/cn';
import { createPresence, usePosition, useDismiss } from './overlay';

/** Imperative open controller, handed to a parent (e.g. the kai-popover facade)
 *  via `controllerRef` so it can drive/observe open state. */
export interface PopoverController { open: Accessor<boolean>; setOpen: (v: boolean) => void; }

export interface PopoverProps {
  /** The trigger content (e.g. a button). Clicking it toggles the popover. */
  trigger: JSX.Element;
  /** The popover panel content — arbitrary nodes (rows, toggles, nested groups). */
  children: JSX.Element;
  /** Floating placement relative to the trigger. */
  placement?: Placement;
  /** Gap in px between trigger and panel. */
  gutter?: number;
  /** Controlled open state. When set, the component never changes it itself —
   *  drive it from `onOpenChange`. Omit for uncontrolled (internal) state. */
  open?: boolean;
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean;
  /** When true, clicking the trigger never opens the popover. */
  disabled?: boolean;
  /** Fires whenever the popover wants to open or close. */
  onOpenChange?: (open: boolean) => void;
  /** Receive the open controller (open accessor + setOpen) once mounted. */
  controllerRef?: (api: PopoverController) => void;
  /** Extra elements counted as "inside" for outside-click dismissal — e.g. the
   *  custom-element host, so clicks on slotted panel content don't dismiss. */
  boundary?: () => HTMLElement | undefined;
  /** Class applied to the floating panel. */
  class?: string;
}

/**
 * A general popover: a trigger that toggles a floating panel of arbitrary
 * content. Unlike `Dropdown` (role="menu" + roving focus), the panel is a
 * `role="dialog"` region, so it can hold model rows, toggles, nested groups —
 * anything. Positioning, exit animation, and Escape/outside-click dismissal
 * come from the shared overlay primitives.
 */
export function Popover(props: PopoverProps) {
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const [panel, setPanel] = createSignal<HTMLElement>();

  const isControlled = () => props.open !== undefined;
  const isOpen = () => (isControlled() ? !!props.open : internalOpen());
  const setOpen = (v: boolean) => {
    if (!isControlled()) setInternalOpen(v);
    props.onOpenChange?.(v);
  };

  // Hand the open controller up to a parent (e.g. the kai-popover facade) so it
  // can drive/observe open state via wireDisclosure.
  props.controllerRef?.({ open: isOpen, setOpen });

  const presence = createPresence(isOpen);
  const position = usePosition(trigger, panel, {
    placement: props.placement ?? 'bottom-start',
    gutter: props.gutter ?? 6,
    // Trigger removed from the DOM -> close so the panel portal doesn't orphan.
    onDisconnect: () => setOpen(false),
  });
  useDismiss({
    enabled: isOpen,
    onDismiss: () => setOpen(false),
    refs: () => [trigger(), panel(), props.boundary?.()],
  });

  return (
    <>
      <span
        ref={setTrigger}
        style={{ display: 'inline-flex' }}
        onClick={() => { if (!props.disabled) setOpen(!isOpen()); }}
      >
        {props.trigger}
      </span>
      <Show when={presence.present()}>
        <div
          ref={(el) => { setPanel(el); presence.setRef(el); }}
          role="dialog"
          data-expanded={presence.state() === 'open' ? '' : undefined}
          data-closed={presence.state() === 'closed' ? '' : undefined}
          style={{
            position: 'fixed', left: `${position.pos().x}px`, top: `${position.pos().y}px`,
            // hide (without unmounting) when the trigger scrolls out of view
            visibility: position.hidden() ? 'hidden' : 'visible',
            'pointer-events': position.hidden() ? 'none' : undefined,
          }}
          class={cn(
            // text-sm is a sensible menu default; slotted content can override it.
            'z-50 min-w-[12rem] rounded-lg bg-card p-1 text-sm kai-elevation',
            'animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
            props.class,
          )}
        >
          {props.children}
        </div>
      </Show>
    </>
  );
}
