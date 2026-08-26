import { type JSX, splitProps, createEffect } from 'solid-js';
import { cn } from '../utils/cn';

export interface CheckboxProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  /**
   * The mixed / partially-checked state ("some of the things below are ticked").
   *
   * `indeterminate` is a DOM PROPERTY with no HTML attribute, so it cannot be set
   * from markup — every caller that wanted it used to reach for a `ref` plus a
   * `createEffect`. That effect now lives in here, once, and callers pass a prop.
   *
   * Note that the property is purely visual plus an accessibility hint: a checkbox
   * whose `indeterminate` is true still reports `checked === false` and submits
   * accordingly. A native indeterminate checkbox already announces as "mixed", so
   * this component does not stamp `aria-checked="mixed"` on top of it — pass one
   * yourself if you also want the attribute in the DOM.
   */
  indeterminate?: boolean;
}

/**
 * A checkbox. A REAL `<input type="checkbox">` behind `appearance: none`, styled by
 * the kit's `.kai-checkbox` rule, never a `<div>` wearing `role="checkbox"`.
 *
 * That is the whole design: the native control brings keyboard operation (Space),
 * the `:focus-visible` ring, form participation via `name` / `value`, and correct
 * screen-reader announcement — all of it for free and all of it correct. Every
 * accessibility defect this kit's control audit found was in a control that had
 * replaced the native element with something hand-rolled.
 *
 * Everything not listed in `CheckboxProps` is forwarded to the input, so `id`,
 * `name`, `value`, `required`, `disabled`, `aria-*` and any `data-*` hook behave
 * exactly as they do on a plain `<input>`.
 *
 * Validation is deliberately absent. `required` is passed through to the native
 * attribute and nothing else — whether an unchecked box is an error is the
 * consuming application's call, not the kit's.
 *
 * ```tsx
 * <Checkbox name="notify" checked={on()} onChange={(e) => setOn(e.currentTarget.checked)} />
 * ```
 */
export function Checkbox(props: CheckboxProps): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'indeterminate', 'ref']);
  return (
    <input
      {...rest}
      type="checkbox"
      class={cn('kai-checkbox', local.class)}
      ref={(el) => {
        // `ref` is split out and re-applied by hand because this component needs the
        // element for `indeterminate` as well. Solid always hands a component a ref
        // FUNCTION (a variable ref compiles into one), so the typeof guard is for the
        // hand-written object case only.
        const forward = local.ref;
        if (typeof forward === 'function') (forward as (el: HTMLInputElement) => void)(el);
        createEffect(() => {
          el.indeterminate = !!local.indeterminate;
        });
      }}
    />
  );
}
