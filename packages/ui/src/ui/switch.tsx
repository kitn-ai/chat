import { type JSX, createSignal, splitProps } from 'solid-js';
import { cn } from '../utils/cn';

export interface SwitchProps
  extends Omit<
    JSX.ButtonHTMLAttributes<HTMLButtonElement>,
    | 'type' | 'role' | 'aria-checked' | 'children' | 'ref'
    | 'onChange' | 'onchange' | 'onClick' | 'onclick' | 'onKeyDown' | 'onkeydown'
  > {
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
 *
 * Anything not named in `SwitchProps` is forwarded to the inner button, so `id`,
 * `aria-required` / `aria-invalid` / `aria-describedby` and any `data-*` hook land
 * on the focusable element without a caller stamping them through a `ref`. The
 * switch keeps ownership of `type`, `role`, `aria-checked` and the toggle handlers:
 * those are the control, not decoration.
 */
export function Switch(props: SwitchProps) {
  const [local, rest] = splitProps(props, [
    'checked', 'defaultChecked', 'disabled', 'label', 'name', 'value', 'onChange', 'buttonRef', 'class',
  ]);
  const [internal, setInternal] = createSignal(local.defaultChecked ?? false);
  const isControlled = () => local.checked !== undefined;
  const isOn = () => (isControlled() ? !!local.checked : internal());

  const toggle = () => {
    if (local.disabled) return;
    const next = !isOn();
    if (!isControlled()) setInternal(next);
    local.onChange?.(next);
  };

  return (
    <>
      {local.name != null && (
        <input
          type="checkbox"
          name={local.name}
          value={local.value ?? 'on'}
          checked={isOn()}
          disabled={local.disabled}
          aria-hidden="true"
          tabindex={-1}
          style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', 'white-space': 'nowrap' }}
          onChange={() => { /* driven by the button; keep the input in sync only */ }}
        />
      )}
      {/* `{...rest}` comes FIRST so the attributes below win: a caller can add an
          `id` or an `aria-describedby`, but cannot turn this into something that is
          no longer a switch. */}
      <button
        {...rest}
        type="button"
        role="switch"
        ref={local.buttonRef}
        aria-checked={isOn()}
        aria-label={local.label}
        disabled={local.disabled}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        }}
        class={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // WCAG 2.1 SC 1.4.11: the track IS this control's visual boundary, so it
          // needs 3:1 against the surface behind it. The OFF fill cannot carry that
          // — `--color-muted` is a shared surface token (measured 1.10:1 light on
          // `--color-background`) and darkening it to clear 3:1 would repaint every
          // muted surface in the kit. So the boundary moves to a border on the
          // control-edge token `--color-input`, which exists for exactly this and is
          // already held to the 3:1 floor for radios, checkboxes and inputs
          // (tests/primitives/control-contrast.test.ts). The ON track keeps its
          // ~17:1 `--color-primary` fill and takes a transparent border purely so
          // the two states stay the same size — the fill still paints under it.
          isOn() ? 'border-transparent bg-primary' : 'border-input bg-muted',
          local.class,
        )}
      >
        <span
          class={cn(
            'inline-block h-4 w-4 rounded-full shadow transition-transform',
            // On the `primary` track use `primary-foreground` so the thumb stays
            // visible in both themes (in dark mode `primary` is light, where a
            // hard-coded white thumb vanished). Off-track stays white over `muted`.
            // The track is `border-box` with a 1px border, so the thumb travels
            // inside a 34px box: 2px in from each inner edge keeps both end
            // positions 3px from the track's outer edge.
            isOn() ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0.5 bg-white',
          )}
        />
      </button>
    </>
  );
}
