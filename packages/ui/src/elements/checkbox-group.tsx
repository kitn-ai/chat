import { createEffect, createSignal, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { CheckboxGroup } from '../ui/checkbox-group';
// Public shape of the `options` prop; lives in ./element-data-types so the ROOT
// entry can re-export it (see that file's header).
import type { KaiCheckboxOption } from './element-data-types';

interface Props extends Record<string, unknown> {
  /** The choices, top to bottom. Set as a JS PROPERTY (array), never an attribute.
   *  Rendered in full: the kit never truncates, re-orders or de-duplicates them. */
  options: KaiCheckboxOption[];
  /** The FIRST selected value. Settable and reflected to the `value` attribute, so
   *  `:host([value])` and `el.value` see live state, and a seed can be written in
   *  markup. Writing it makes that the whole selection; to read or drive the rest,
   *  use `el.values`. */
  value?: string;
  /**
   * The shared form-control name every box carries, so `FormData.getAll(name)` reads
   * the whole selection back under one key.
   *
   * NO DEFAULT, unlike `<kai-radio-group>`. A radio set needs a shared `name` for the
   * browser to make it exclusive and arrow-navigable, so one is generated when none is
   * given; checkboxes are independent controls and behave correctly with no name at
   * all. Generating one here would submit the selection under a random key, which is
   * worse than submitting nothing.
   *
   * The element is NOT form-associated (no `ElementInternals`, no `setFormValue()`),
   * the same known gap `<kai-input>` records: the boxes live in a shadow root, so a
   * surrounding `<form>` collects nothing from them whether or not `name` is set. Read
   * `el.values`. The name still lands on every inner input, so it is right the day form
   * association arrives.
   */
  name?: string;
  /** Disable every row. Individual rows carry their own `disabled`. */
  disabled?: boolean;
  /** Accessible name for the group. */
  label?: string;
}

/** Events fired by `<kai-checkbox-group>`. */
interface Events {
  /** A row was ticked or unticked. `values` is the whole selection after the change,
   *  which is what a multi-select control needs; `value` is the first of them (empty
   *  when nothing is selected). Both are always present, so neither shape silently
   *  loses the other. This is `<kai-select>`'s detail, deliberately. */
  'kai-change': { value: string; values: string[] };
}

/**
 * `<kai-checkbox-group>` — the kit's "pick any number" control, and
 * `<kai-radio-group>`'s sibling: the same options shape and the same divided row
 * chrome over real `<input type="checkbox">`es, multi-value instead of exclusive. A
 * box per tab stop, Space to toggle and correct announcement are the browser's, not a
 * reimplementation.
 *
 * Feed it `options` (a JS-property array of `{ value, label, description?, disabled? }`),
 * drive and read the selection with the `values` property, and listen for `kai-change`.
 * `value` is the first selected option and is reflected to the `value` attribute.
 *
 * Re-rendering follows the kit's reactivity contract: hand it a NEW array reference,
 * and a new object for any option whose content changed — the rows are a
 * reference-keyed list, so mutating an option in place changes nothing on screen.
 *
 * No validation and no limits: "at least one", "at most three" and anything else that
 * lands in a policy document is the application's rule, not the kit's.
 *
 * ```html
 * <kai-checkbox-group label="Environments" name="env"></kai-checkbox-group>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const group = document.querySelector('kai-checkbox-group');
 *   // ARRAY prop — a JS property, never an attribute.
 *   group.options = [
 *     { value: 'prod', label: 'Production', description: 'Pages the on-call' },
 *     { value: 'staging', label: 'Staging' },
 *     { value: 'dev', label: 'Development' },
 *   ];
 *   group.addEventListener('kai-change', (e) => console.log(e.detail.values));
 *   group.values = ['prod', 'dev']; // drive it (no kai-change — the host already knows)
 * </script>
 * ```
 */
defineWebComponent<Props, Events>('kai-checkbox-group', {
  options: [],
  value: undefined,
  name: undefined,
  disabled: undefined,
  label: undefined,
}, (props, ctx) => {
  const { element, dispatch, flag, expose } = ctx;

  // Lift the selection into the facade and drive CheckboxGroup CONTROLLED so the host
  // can read it (`el.values` / `:host([value])`) and set it after mount. Seed from the
  // `value` property/attribute present on mount; nothing is auto-selected, because
  // `options` normally arrives as a property AFTER upgrade (kai-select's structure).
  const seed = (props.value as string | undefined) ?? element.getAttribute('value') ?? '';
  const [values, setValues] = createSignal<string[]>(seed ? [seed] : []);
  const first = () => values()[0] ?? '';

  // Coerce anything arriving through the `value` setter (a JS assignment, or the
  // attributeChangedCallback write-back the reflect effect below triggers) to a string,
  // falling back to the live attribute when nullish so the write-back equals the signal
  // and the guard absorbs it — no attr⇄prop feedback loop.
  const coerce = (v: unknown): string =>
    v == null ? (element.getAttribute('value') ?? '') : String(v);

  // Apply a new selection and fire kai-change once (the user-toggle path).
  const apply = (next: string[]) => {
    const prev = untrack(values);
    if (prev.length === next.length && prev.every((v, i) => v === next[i])) return;
    setValues(next);
    dispatch('kai-change', { value: next[0] ?? '', values: next });
  };

  Object.defineProperty(element, 'value', {
    get: () => first(),
    set: (v: unknown) => {
      const next = coerce(v);
      if (untrack(first) !== next) setValues(next ? [next] : []);
    },
    configurable: true,
    enumerable: true,
  });

  // The multi-selection read/write side, spelled exactly as `<kai-select multiple>`
  // spells it. `value` alone cannot represent a checkbox group's selection, and
  // returning only the first ticked box would be a silent drop.
  Object.defineProperty(element, 'values', {
    get: () => values(),
    set: (v: unknown) => setValues(Array.isArray(v) ? v.map(String) : []),
    configurable: true,
    enumerable: true,
  });

  // Reflect the first value → the `[value]` host attribute (for `:host([value])`).
  createEffect(() => {
    const v = first();
    if (v) {
      if (element.getAttribute('value') !== v) element.setAttribute('value', v);
    } else if (element.hasAttribute('value')) {
      element.removeAttribute('value');
    }
  });

  expose({
    /** Focus the group's first box. Not "the first ticked one", which is
     *  `<kai-radio-group>`'s rule: a radio group is ONE tab stop that lands on the
     *  selection, while every checkbox here is its own tab stop, so the entry point is
     *  simply the top of the list. */
    focus: (options?: FocusOptions) =>
      element.shadowRoot?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus(options),
  });

  return (
    <CheckboxGroup
      options={(props.options ?? []) as KaiCheckboxOption[]}
      value={values()}
      name={props.name as string | undefined}
      disabled={flag('disabled')}
      label={props.label as string | undefined}
      onChange={(next) => apply(next)}
    />
  );
});
