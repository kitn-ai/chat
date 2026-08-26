import { type JSX, For, Show, splitProps } from 'solid-js';
import { cn } from '../utils/cn';
import { Checkbox } from './checkbox';

/** One choice in a {@link CheckboxGroup}. */
export interface CheckboxOption<T = string> {
  /** The value this row selects. Compared to the group's `value` by identity. */
  value: T;
  /** The row's visible label. */
  label: JSX.Element;
  /** Optional second line under the label. */
  description?: JSX.Element;
  /** Disable this row alone (the group's `disabled` disables all of them). */
  disabled?: boolean;
}

export interface CheckboxGroupProps<T = string>
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  /**
   * The choices, in display order. Rendered in full: the kit never truncates,
   * re-orders or de-duplicates a consumer's option list.
   */
  options: readonly CheckboxOption<T>[];
  /** The selected values. Each option is checked when its `value` is in here (by identity). */
  value?: readonly T[];
  /**
   * The shared form-control name every box in the group carries, so a native form
   * submits the whole selection under one key and `FormData.getAll(name)` reads it back.
   *
   * UNLIKE {@link RadioGroup}, this has no default. A radio group needs a shared `name`
   * for the browser to make the set exclusive and arrow-navigable, so one is generated
   * when none is given; checkboxes are independent controls and need nothing to behave
   * correctly. Generating a name here would submit the selection under a random key,
   * which is worse than submitting nothing.
   */
  name?: string;
  /** Disable every row. */
  disabled?: boolean;
  /** Accessible name for the group. Rendered as `aria-label` on the `group`. */
  label?: string;
  /**
   * Fires on every toggle with the NEXT selection, plus the option that moved and
   * which way it went. The next selection is a fresh array — the group holds no state
   * of its own, so `value` is yours to own.
   */
  onChange?: (value: T[], option: CheckboxOption<T>, checked: boolean) => void;
  /** Fires when a box loses focus — the commit point for a form field. */
  onOptionBlur?: () => void;
  /** Extra classes for each row. */
  itemClass?: string;
  /**
   * Presentation slot. Replaces the default label/description column with whatever
   * you return, so a row can carry media, a badge or a price without a second
   * checkbox component existing. The control, the row chrome and the group semantics
   * stay ours.
   */
  children?: (option: CheckboxOption<T>, state: { checked: boolean; disabled: boolean }) => JSX.Element;
}

/**
 * A vertical set of checkbox rows in a bordered, divided list — the kit's standard
 * "pick any number" control, and {@link RadioGroup}'s sibling: same options shape,
 * same row chrome, same presentation slot, multi-value instead of single.
 *
 * Every row is a real `<input type="checkbox">` inside a `<label>`, so clicking
 * anywhere on the row toggles it and the keyboard behaviour (a tab stop per box,
 * Space to toggle) is the browser's rather than a reimplementation. The wrapper is
 * `role="group"`, not `role="listbox"`: the boxes are independent controls and
 * nothing here overrides what they already announce.
 *
 * Everything not listed in `CheckboxGroupProps` is forwarded to the group element, so
 * `id`, `aria-labelledby`, any other `aria-*` and any `data-*` hook land where a form
 * expects them. No validation is applied — "at least one" is your application's rule,
 * not the kit's.
 *
 * ```tsx
 * <CheckboxGroup
 *   label="Environments"
 *   name="env"
 *   options={[{ value: 'prod', label: 'Production' }, { value: 'staging', label: 'Staging' }]}
 *   value={envs()}
 *   onChange={setEnvs}
 * />
 * ```
 */
export function CheckboxGroup<T = string>(props: CheckboxGroupProps<T>): JSX.Element {
  const [local, rest] = splitProps(props, [
    'options', 'value', 'name', 'disabled', 'label', 'onChange', 'onOptionBlur', 'itemClass', 'children', 'class',
  ]);
  const selected = (): readonly T[] => local.value ?? [];
  return (
    <div
      {...rest}
      role="group"
      aria-label={local.label}
      class={cn('divide-y divide-border overflow-hidden rounded-lg border border-border', local.class)}
    >
      <For each={local.options}>
        {(opt) => {
          const checked = () => selected().includes(opt.value);
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
              <Checkbox
                name={local.name}
                value={String(opt.value)}
                checked={checked()}
                disabled={rowDisabled()}
                class={opt.description === undefined ? undefined : 'mt-0.5'}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  const now = selected();
                  // Filter-or-append rather than a toggle on the previous array, so the
                  // emitted selection follows the CONTROL's state. They diverge when the
                  // caller re-renders mid-interaction, and following the box is what a
                  // native form would report.
                  const next = on ? [...now.filter((v) => v !== opt.value), opt.value] : now.filter((v) => v !== opt.value);
                  local.onChange?.(next, opt, on);
                }}
                onBlur={() => local.onOptionBlur?.()}
              />
              <Show
                when={local.children}
                fallback={
                  // No description, a bare <span> — byte for byte what the form's
                  // hand-rolled checkbox list rendered before this component existed.
                  // The two-line column only appears when there is a second line.
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
