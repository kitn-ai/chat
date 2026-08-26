import { type JSX, For, Show, splitProps, createUniqueId } from 'solid-js';
import { cn } from '../utils/cn';

export interface RadioProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {}

/**
 * A single radio button. A REAL `<input type="radio">` behind `appearance: none`,
 * styled by the kit's `.kai-radio` rule, never a `<div role="radio">`.
 *
 * The native element is what makes a set of radios a GROUP: browsers give same-`name`
 * radios one tab stop, arrow-key navigation between them, mutual exclusion and form
 * participation, and screen readers announce "2 of 4". None of that is reimplementable
 * for free, and every hand-rolled radio in this kit's control audit had lost some of it.
 *
 * Use {@link RadioGroup} for a set. Reach for a bare `Radio` when you are laying the
 * group out yourself — give every member the same `name`.
 *
 * Everything not listed in `RadioProps` is forwarded to the input, so `id`, `name`,
 * `value`, `required`, `disabled`, `aria-*` and any `data-*` hook behave exactly as
 * they do on a plain `<input>`. No validation is applied: `required` reaches the
 * native attribute and stops there.
 */
export function Radio(props: RadioProps): JSX.Element {
  const [local, rest] = splitProps(props, ['class']);
  return <input {...rest} type="radio" class={cn('kai-radio', local.class)} />;
}

/** One choice in a {@link RadioGroup}. */
export interface RadioOption<T = string> {
  /** The value this row selects. Compared to the group's `value` by identity. */
  value: T;
  /** The row's visible label. */
  label: JSX.Element;
  /** Optional second line under the label. */
  description?: JSX.Element;
  /** Disable this row alone (the group's `disabled` disables all of them). */
  disabled?: boolean;
}

export interface RadioGroupProps<T = string>
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  /** The choices, in display order. */
  options: readonly RadioOption<T>[];
  /** The selected value. Matched against each option's `value` by identity. */
  value?: T;
  /**
   * The shared form-control name every radio in the group carries — what makes the
   * browser treat them as one control. Defaults to a generated id, so the group is
   * exclusive and keyboard-navigable even when nothing is being submitted.
   */
  name?: string;
  /** Disable every row. */
  disabled?: boolean;
  /** Accessible name for the group. Rendered as `aria-label` on the `radiogroup`. */
  label?: string;
  /** Fires with the newly selected value (and its option) on selection. */
  onChange?: (value: T, option: RadioOption<T>) => void;
  /** Fires when a radio loses focus — the commit point for a form field. */
  onOptionBlur?: () => void;
  /** Extra classes for each row. */
  itemClass?: string;
  /**
   * Presentation slot. Replaces the default label/description column with whatever
   * you return, so a row can carry media, a badge or a price without a second radio
   * component existing. The control, the row chrome and the group semantics stay ours.
   */
  children?: (option: RadioOption<T>, state: { checked: boolean; disabled: boolean }) => JSX.Element;
}

/**
 * A vertical set of radio rows in a bordered, divided list — the kit's standard
 * "pick exactly one" control.
 *
 * The group is a `role="radiogroup"` wrapper around real `<input type="radio">`s that
 * share a `name`, so the keyboard behaviour (one tab stop, arrows to move) is the
 * browser's and not a reimplementation. Clicking anywhere on a row selects it, because
 * each row is a `<label>`.
 *
 * Everything not listed in `RadioGroupProps` is forwarded to the group element, so
 * `id`, `aria-*` and any `data-*` hook land where a form expects them.
 *
 * ```tsx
 * <RadioGroup
 *   label="Severity"
 *   options={[{ value: 'blocking', label: 'Blocking' }, { value: 'cosmetic', label: 'Cosmetic' }]}
 *   value={severity()}
 *   onChange={setSeverity}
 * />
 * ```
 */
export function RadioGroup<T = string>(props: RadioGroupProps<T>): JSX.Element {
  const [local, rest] = splitProps(props, [
    'options', 'value', 'name', 'disabled', 'label', 'onChange', 'onOptionBlur', 'itemClass', 'children', 'class',
  ]);
  const fallbackName = createUniqueId();
  const groupName = () => local.name ?? fallbackName;
  return (
    <div
      {...rest}
      role="radiogroup"
      aria-label={local.label}
      class={cn('divide-y divide-border overflow-hidden rounded-lg border border-border', local.class)}
    >
      <For each={local.options}>
        {(opt) => {
          const checked = () => local.value === opt.value;
          const rowDisabled = () => !!(local.disabled || opt.disabled);
          return (
            <label
              class={cn(
                'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                opt.description !== undefined && 'items-start',
                checked()
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-foreground hover:bg-muted/50',
                local.itemClass,
              )}
            >
              <Radio
                name={groupName()}
                value={String(opt.value)}
                checked={checked()}
                disabled={rowDisabled()}
                class={opt.description === undefined ? undefined : 'mt-0.5'}
                onChange={() => local.onChange?.(opt.value, opt)}
                onBlur={() => local.onOptionBlur?.()}
              />
              <Show
                when={local.children}
                fallback={
                  // No description → a bare <span>, byte for byte what every call site
                  // rendered before this component existed. The two-line column only
                  // appears when there is a second line to put in it.
                  <Show when={opt.description !== undefined} fallback={<span>{opt.label}</span>}>
                    <span class="flex flex-col gap-0.5">
                      <span>{opt.label}</span>
                      <span class="text-xs font-normal text-muted-foreground">{opt.description}</span>
                    </span>
                  </Show>
                }
              >
                {(render) => render()(opt, { checked: checked(), disabled: rowDisabled() })}
              </Show>
            </label>
          );
        }}
      </For>
    </div>
  );
}
