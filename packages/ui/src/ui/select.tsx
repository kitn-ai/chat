import { type JSX, For, Show, createEffect, splitProps } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import { cn } from '../utils/cn';
import { FIELD_BASE, FIELD_INVALID } from './input';

/** One choice in a {@link Select}. */
export interface SelectOption<T = string> {
  /** The value this row selects. Compared to the select's `value` by identity. */
  value: T;
  /** Visible text. Defaults to `String(value)`. Native `<option>`s hold text, not markup. */
  label?: string;
  /** Disable this option alone (the select's `disabled` disables the whole control). */
  disabled?: boolean;
}

export interface SelectProps<T = string>
  extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'children'> {
  /**
   * The choices, in display order. Rendered in full: the kit never truncates,
   * re-orders or de-duplicates a consumer's option list.
   *
   * Omit it and pass `children` instead when you need `<optgroup>`s or anything else
   * a flat list cannot express.
   */
  options?: readonly SelectOption<T>[];
  /**
   * The selected value, matched against each option's `value` by IDENTITY (so a
   * numeric enum selects on the number, not on its string form). Pass an array for a
   * `multiple` select.
   */
  value?: T | readonly T[];
  /**
   * Text for a leading, disabled, empty-valued option — the "nothing chosen yet" row.
   * Omitted means no such row is rendered at all; there is no default placeholder,
   * because inventing one would put words in the consumer's UI.
   */
  placeholder?: string;
  /** Force the invalid (destructive-border) state. Matches `Input`'s. */
  invalid?: boolean;
  /** Raw `<option>` / `<optgroup>` children, for lists `options` cannot express.
   *  `value` still drives the selection when you use these: it is applied to the
   *  rendered options rather than quietly doing nothing. */
  children?: JSX.Element;
  /** Extra classes for the positioning wrapper that holds the chevron. */
  containerClass?: string;
}

/**
 * A select. A REAL native `<select>` behind `appearance: none`, in a box consistent
 * with {@link Input}, with the kit's own chevron drawn over it.
 *
 * **Native, not a listbox, and that is the design.** A hand-built popup can be made to
 * look identical and cannot be made to behave identically: the native control brings
 * the platform picker on mobile, type-ahead on desktop, form participation, and the
 * OS's own accessibility tree. This kit's control audit found every one of its
 * accessibility defects in a control that had replaced a native element.
 *
 * The trade is that the *dropdown list itself* stays OS chrome — it renders outside the
 * page and no stylesheet reaches it. What the kit can do is make it follow the kit's
 * light/dark mode rather than the OS's, which `color-scheme` on the element host
 * already does (`src/elements/styles.css`). Styling the closed control and leaving the
 * open list to the platform is the whole of the bargain.
 *
 * Everything not listed in `SelectProps` is forwarded to the `<select>`, so `id`,
 * `name`, `required`, `disabled`, `multiple`, `size`, `aria-*`, any `data-*` hook and
 * the DOM events behave exactly as they do on a plain select. No validation is
 * applied: `required` reaches the native attribute and stops there.
 *
 * ```tsx
 * <Select
 *   options={[{ value: 'low' }, { value: 'high', label: 'High priority' }]}
 *   value={sev()}
 *   placeholder="Choose a severity…"
 *   onChange={(e) => setSev(e.currentTarget.value)}
 * />
 * ```
 */
export function Select<T = string>(props: SelectProps<T>): JSX.Element {
  const [local, rest] = splitProps(props, [
    'class', 'containerClass', 'options', 'value', 'placeholder', 'invalid', 'children', 'ref',
  ]);

  // A `multiple` select is a scrolling list box, not a closed control: there is no
  // collapsed state for a chevron to point at, and `appearance: none` on one buys
  // nothing. So the custom chrome applies to the single-value shape only.
  const isMulti = () => !!rest.multiple;

  const isSelected = (v: T): boolean => {
    const sel = local.value;
    if (Array.isArray(sel)) return (sel as readonly T[]).includes(v);
    return sel === v;
  };

  // Nothing chosen yet, for deciding whether the placeholder row is the selected one.
  // Array-aware on purpose: an empty array means nothing is selected, and without this
  // branch the browser would fall through to auto-selecting the first NON-disabled
  // option — i.e. showing a real choice while the caller's state said none was made.
  const isEmpty = (): boolean => {
    const v = local.value;
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === null || (v as unknown) === '';
  };

  return (
    <div class={cn('relative block w-full', local.containerClass)}>
      <select
        {...rest}
        ref={(el) => {
          // `ref` is split out and re-applied by hand because this component needs the
          // element itself for the `children` path below. Solid always hands a component
          // a ref FUNCTION (a variable ref compiles into one), so the typeof guard is for
          // the hand-written object case only.
          const forward = local.ref;
          if (typeof forward === 'function') (forward as (el: HTMLSelectElement) => void)(el);

          // `value` drives the `options` list declaratively (each `<option selected>`),
          // which cannot reach options the CALLER rendered as `children`. Applying it
          // imperatively for that path is the difference between "children are an
          // escape hatch" and "`value` silently does nothing once you use one".
          createEffect(() => {
            if (local.children === undefined) return;
            const v = local.value;
            if (v === undefined || v === null) return;
            if (Array.isArray(v)) {
              const wanted = new Set((v as readonly unknown[]).map(String));
              for (const o of el.options) o.selected = wanted.has(o.value);
            } else {
              el.value = String(v);
            }
          });
        }}
        class={cn(
          FIELD_BASE,
          // `peer` so the chevron beside it can dim with the control.
          'peer',
          // `pr-9` reserves the lane the chevron sits in, so a long option label never
          // slides under it.
          !isMulti() && 'cursor-pointer appearance-none pr-9',
          local.invalid && FIELD_INVALID,
          local.class,
        )}
      >
        <Show when={local.placeholder !== undefined}>
          <option value="" disabled selected={isEmpty()}>
            {local.placeholder}
          </option>
        </Show>
        <For each={local.options}>
          {(opt) => (
            <option value={String(opt.value)} disabled={opt.disabled} selected={isSelected(opt.value)}>
              {opt.label ?? String(opt.value)}
            </option>
          )}
        </For>
        {local.children}
      </select>
      <Show when={!isMulti()}>
        {/* `pointer-events-none` so the chevron is decoration and every click, including
            one landing on the arrow, still opens the native picker. `aria-hidden`
            because the select already announces itself as a combo box. */}
        <ChevronDown
          aria-hidden="true"
          class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
        />
      </Show>
    </div>
  );
}
