import { createEffect, createSignal, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { Checkbox } from '../ui/checkbox';

interface Props extends Record<string, unknown> {
  /** Controlled checked state. Settable and reflected to the `checked` attribute.
   *  `el.checked = true` (or `<kai-checkbox checked>`) drives it; ticking the box
   *  updates it and fires `kai-change`. Read `el.checked` for live state. */
  checked?: boolean;
  /** Initial checked state on mount (uncontrolled seed). Bare attribute
   *  (`<kai-checkbox default-checked>`) turns it on. */
  defaultChecked?: boolean;
  /** The mixed state, for a parent box whose children are partly ticked. Visual
   *  plus an accessibility hint: the box still reports `checked === false`. */
  indeterminate?: boolean;
  /** Disable interaction. */
  disabled?: boolean;
  /** Set the native `required` attribute, and nothing more. Whether an unticked box
   *  is an error is the application's rule, not the kit's. */
  required?: boolean;
  /** Accessible label. The visible text beside the box is the consumer's to render. */
  label?: string;
  /** Form-control name (paired with `value`). */
  name?: string;
  /** Submitted value when checked (paired with `name`). Defaults to `'on'`. */
  value?: string;
}

/** Events fired by `<kai-checkbox>`. */
interface Events {
  /** The box was ticked or unticked. */
  'kai-change': { checked: boolean };
}

/**
 * `<kai-checkbox>` — a checkbox over a real `<input type="checkbox">`. Drive/read
 * its state with the `checked` property (settable + reflected to the `checked`
 * attribute, so `:host([checked])` and `el.checked` see live state); seed the
 * initial state with `default-checked` and read changes from `kai-change`.
 *
 * ```html
 * <label>
 *   <kai-checkbox default-checked label="Stream responses"></kai-checkbox>
 *   Stream responses
 * </label>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const box = document.querySelector('kai-checkbox');
 *   box.addEventListener('kai-change', (e) => console.log(e.detail.checked));
 *   box.checked = false;    // drive it (no kai-change — the host already knows)
 *   box.indeterminate = true;
 *   box.toggle();           // flip it (fires kai-change)
 * </script>
 * ```
 */
defineWebComponent<Props, Events>('kai-checkbox', {
  checked: undefined,
  defaultChecked: undefined,
  indeterminate: undefined,
  disabled: undefined,
  required: undefined,
  label: undefined,
  name: undefined,
  value: undefined,
}, (props, ctx) => {
  const { element, dispatch, flag, expose } = ctx;

  // Lift the on/off state into the facade and drive Checkbox CONTROLLED so the host
  // can read it (`el.checked` / `:host([checked])`) and set it after mount. Seed from
  // `defaultChecked` (or a bare `checked` attribute present on mount). This is
  // kai-switch's structure, deliberately — same contract, same failure modes.
  const [checked, setChecked] = createSignal(flag('defaultChecked') || flag('checked'));

  // Coerce anything arriving through the `checked` setter (a JS assignment, or the
  // write-back `attributeChangedCallback` fires when the attribute changes) to a
  // boolean, falling back to attribute presence to match `flag`'s semantics. The
  // `undefined` write-back `toggleAttribute` triggers thus resolves to the attribute
  // just written, equals the signal, and is absorbed by the guard below — no attr⇄prop
  // feedback loop.
  const coerce = (v: unknown): boolean =>
    v === true ? true
      : v === false ? false
        : element.hasAttribute('checked') && element.getAttribute('checked') !== 'false';

  // Apply a new checked state and fire kai-change once (the user path). No-op while
  // disabled.
  const apply = (next: boolean) => {
    if (flag('disabled')) return;
    if (untrack(checked) === next) return;
    setChecked(next);
    dispatch('kai-change', { checked: next });
  };

  // Reads return LIVE state; host writes drive it WITHOUT firing kai-change — the
  // host already knows what it set. The equality guard kills the reflect write-back.
  Object.defineProperty(element, 'checked', {
    get: () => checked(),
    set: (v: unknown) => { const next = coerce(v); if (untrack(checked) !== next) setChecked(next); },
    configurable: true,
    enumerable: true,
  });

  // Reflect internal checked → the `[checked]` host attribute (for `:host([checked])`).
  createEffect(() => {
    const c = checked();
    if (c !== element.hasAttribute('checked')) element.toggleAttribute('checked', c);
  });

  expose({
    /** Flip the box and fire `kai-change` (no-op while disabled). */
    toggle: () => apply(!untrack(checked)),
    /** Focus the inner input (the host element can't reach it). */
    focus: (options?: FocusOptions) =>
      element.shadowRoot?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus(options),
  });

  return (
    <>
      {/* Base sets `:host{display:block}`; a checkbox flows inline beside its text. */}
      <style>{':host{display:inline-flex}'}</style>
      <Checkbox
        checked={checked()}
        indeterminate={flag('indeterminate')}
        disabled={flag('disabled')}
        required={flag('required')}
        aria-label={props.label as string | undefined}
        aria-checked={flag('indeterminate') ? 'mixed' : undefined}
        name={props.name as string | undefined}
        value={(props.value as string | undefined) ?? 'on'}
        onChange={(e) => apply(e.currentTarget.checked)}
      />
    </>
  );
});
