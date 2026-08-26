import { createEffect, createSignal, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { RadioGroup } from '../ui/radio';
// Public shape of the `options` prop; lives in ./element-data-types so the ROOT
// entry can re-export it (see that file's header).
import type { KaiRadioOption } from './element-data-types';

interface Props extends Record<string, unknown> {
  /** The choices, top to bottom. Set as a JS PROPERTY (array), never an attribute. */
  options: KaiRadioOption[];
  /** Controlled selected `value`. Settable and reflected to the `value` attribute.
   *  `el.value = 'degraded'` drives it; choosing a row updates it and fires
   *  `kai-change`. Read `el.value` for live state. */
  value?: string;
  /** Shared form-control name for every radio in the group. Defaults to a generated
   *  id, so the group is exclusive and keyboard-navigable even when nothing is
   *  submitted. */
  name?: string;
  /** Disable every row. Individual rows carry their own `disabled`. */
  disabled?: boolean;
  /** Accessible name for the group. */
  label?: string;
}

/** Events fired by `<kai-radio-group>`. */
interface Events {
  /** A row was chosen. */
  'kai-change': { value: string };
}

/**
 * `<kai-radio-group>` — the kit's "pick exactly one" control: a bordered, divided
 * list over real `<input type="radio">`s that share a `name`, so one tab stop, arrow
 * keys, mutual exclusion and form participation are the browser's and not a
 * reimplementation.
 *
 * Feed it `options` (a JS-property array of `{ value, label, description?, disabled? }`),
 * drive/read the selection with the `value` property (settable + reflected to the
 * `value` attribute, so `:host([value])` and `el.value` see live state), and listen
 * for `kai-change`.
 *
 * Re-rendering follows the kit's reactivity contract: hand it a NEW array reference,
 * and a new object for any option whose content changed — the rows are a
 * reference-keyed list, so mutating an option in place changes nothing on screen.
 *
 * ```html
 * <kai-radio-group value="degraded" label="Severity"></kai-radio-group>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const group = document.querySelector('kai-radio-group');
 *   group.options = [
 *     { value: 'blocking', label: 'Blocking', description: 'Pages the on-call' },
 *     { value: 'degraded', label: 'Degraded' },
 *     { value: 'cosmetic', label: 'Cosmetic' },
 *   ];
 *   group.addEventListener('kai-change', (e) => console.log(e.detail.value));
 *   group.value = 'cosmetic'; // drive it (no kai-change — the host already knows)
 * </script>
 * ```
 */
defineWebComponent<Props, Events>('kai-radio-group', {
  options: [],
  value: undefined,
  name: undefined,
  disabled: undefined,
  label: undefined,
}, (props, ctx) => {
  const { element, dispatch, flag, expose } = ctx;

  // Lift the selection into the facade and drive RadioGroup CONTROLLED so the host can
  // read it (`el.value` / `:host([value])`) and set it after mount. Seed from the
  // `value` property/attribute present on mount; nothing is auto-selected, because
  // `options` normally arrives as a property AFTER upgrade (kai-segmented's structure).
  const [value, setValue] = createSignal(
    (props.value as string | undefined) ?? element.getAttribute('value') ?? '',
  );

  // Coerce anything arriving through the `value` setter (a JS assignment, or the
  // attributeChangedCallback write-back) to a string, falling back to the live
  // attribute when nullish so the reflect write-back equals the signal and the guards
  // below absorb it — no attr⇄prop feedback loop.
  const coerce = (v: unknown): string =>
    v == null ? (element.getAttribute('value') ?? '') : String(v);

  // Apply a new value and fire kai-change once (the user-choice path).
  const apply = (next: string) => {
    if (untrack(value) === next) return;
    setValue(next);
    dispatch('kai-change', { value: next });
  };

  Object.defineProperty(element, 'value', {
    get: () => value(),
    set: (v: unknown) => { const next = coerce(v); if (untrack(value) !== next) setValue(next); },
    configurable: true,
    enumerable: true,
  });

  // Reflect internal value → the `[value]` host attribute (for `:host([value])`).
  createEffect(() => {
    const v = value();
    if (v) {
      if (element.getAttribute('value') !== v) element.setAttribute('value', v);
    } else if (element.hasAttribute('value')) {
      element.removeAttribute('value');
    }
  });

  expose({
    /** Focus the group's tab stop. That is the selected radio, or the first row when
     *  nothing is selected yet. */
    focus: (options?: FocusOptions) => {
      const root = element.shadowRoot;
      const radios = [...(root?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])];
      (radios.find((r) => r.checked) ?? radios[0])?.focus(options);
    },
  });

  return (
    <RadioGroup
      options={(props.options ?? []) as KaiRadioOption[]}
      value={value()}
      name={props.name as string | undefined}
      disabled={flag('disabled')}
      label={props.label as string | undefined}
      onChange={(next) => apply(next)}
    />
  );
});
