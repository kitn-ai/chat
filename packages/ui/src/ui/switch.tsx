import { createSignal } from 'solid-js';
import { cn } from '../utils/cn';

export interface SwitchProps {
  /** Controlled checked state. When set, the component defers state to the
   *  parent; drive it from `onChange`. Omit for uncontrolled (internal) state. */
  checked?: boolean;
  /** Initial checked state when uncontrolled. */
  defaultChecked?: boolean;
  /** Disable interaction. */
  disabled?: boolean;
  /** Accessible label for the control. */
  label?: string;
  /** Form-control name. When set (paired with `value`), a hidden checkbox carries
   *  the on/off value for serialization. */
  name?: string;
  /** Submitted value when checked (paired with `name`). Defaults to `'on'`. */
  value?: string;
  /** Fires with the next checked state on toggle. */
  onChange?: (checked: boolean) => void;
  /** Receives the inner `role="switch"` button so a parent can focus it. */
  buttonRef?: (el: HTMLButtonElement) => void;
  class?: string;
}

/**
 * A toggle switch (`role="switch"`). Controlled via `checked`, or uncontrolled
 * from `defaultChecked`. Keyboard-operable (Space/Enter) and theme-tokened.
 */
export function Switch(props: SwitchProps) {
  const [internal, setInternal] = createSignal(props.defaultChecked ?? false);
  const isControlled = () => props.checked !== undefined;
  const isOn = () => (isControlled() ? !!props.checked : internal());

  const toggle = () => {
    if (props.disabled) return;
    const next = !isOn();
    if (!isControlled()) setInternal(next);
    props.onChange?.(next);
  };

  return (
    <>
      {props.name != null && (
        <input
          type="checkbox"
          name={props.name}
          value={props.value ?? 'on'}
          checked={isOn()}
          disabled={props.disabled}
          aria-hidden="true"
          tabindex={-1}
          style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', 'white-space': 'nowrap' }}
          onChange={() => { /* driven by the button; keep the input in sync only */ }}
        />
      )}
      <button
        type="button"
        role="switch"
        ref={props.buttonRef}
        aria-checked={isOn() ? 'true' : 'false'}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        }}
        class={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isOn() ? 'bg-primary' : 'bg-muted',
          props.class,
        )}
      >
        <span
          class={cn(
            'inline-block h-4 w-4 rounded-full shadow transition-transform',
            // On the `primary` track use `primary-foreground` so the thumb stays
            // visible in both themes (in dark mode `primary` is light, where a
            // hard-coded white thumb vanished). Off-track stays white over `muted`.
            isOn() ? 'translate-x-[1.125rem] bg-primary-foreground' : 'translate-x-0.5 bg-white',
          )}
        />
      </button>
    </>
  );
}
