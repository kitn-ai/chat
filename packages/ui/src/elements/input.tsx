import { createEffect, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { Input, type InputProps } from '../ui/input';

interface Props extends Record<string, unknown> {
  /** Native input type: `text` (default) · `email` · `url` · `search` · `tel` ·
   *  `password` · `number`. Single-line only. */
  type?: string;
  /** Controlled value. Settable and reflected to the `value` attribute. `el.value
   *  = 'hi'` drives it (no event); typing updates it and fires `kai-input`. Read
   *  `el.value` for live state. */
  value?: string;
  /** Placeholder shown when empty. */
  placeholder?: string;
  /** Field label, linked to the input. */
  label?: string;
  /** Helper text below the control. */
  hint?: string;
  /** Error text; flips the field invalid (`aria-invalid` + destructive border). */
  error?: string;
  /** Control density: `sm` or `md`. Defaults to `md`. */
  size?: 'sm' | 'md';
  /** Disable interaction. */
  disabled?: boolean;
  /** Make the input read-only. */
  readonly?: boolean;
  /** Mark the input required. */
  required?: boolean;
  /** Force the invalid state without an `error` string. */
  invalid?: boolean;
  /** Form-control name. */
  name?: string;
  /** Autofill hint forwarded to the inner input (e.g. `email`, `current-password`). */
  autocomplete?: string;
  /** Virtual-keyboard hint forwarded to the inner input (e.g. `numeric`, `email`). */
  inputmode?: string;
  // NOTE: `autocapitalize` is forwarded too, but NOT as a declared prop — see the
  // attribute read in the facade body (it is a global reflected HTMLElement IDL
  // attribute and would break the element constructor as a component-register prop).
}

/** Events fired by `<kai-input>`. */
interface Events {
  /** The value changed per keystroke. */
  'kai-input': { value: string };
  /** The value was committed (blur). */
  'kai-change': { value: string };
}

/** Named slots whose occupancy gates an affix. An empty `<slot>` is always a
 *  truthy node, so the facade tracks which are actually filled and only hands a
 *  `<slot>` to the primitive when content is assigned — otherwise the primitive
 *  would switch to the affix-row layout for an empty slot. */
const SLOT_NAMES = ['leading', 'trailing'] as const;
type SlotName = (typeof SLOT_NAMES)[number];

/**
 * `<kai-input>` — the kit's single-line text field. Drive/read the value with the
 * `value` property (settable + reflected to the `value` attribute, so
 * `:host([value])` and `el.value` see live state); listen for `kai-input` (per
 * keystroke) and `kai-change` (commit/blur). A `label`, `hint`, and `error` wrap
 * the control; `leading`/`trailing` slots take an icon, unit, or inline button.
 *
 * ```html
 * <kai-input label="Workspace" placeholder="Acme Inc."></kai-input>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const field = document.querySelector('kai-input');
 *   field.addEventListener('kai-input', (e) => console.log(e.detail.value));
 *   field.value = 'Acme';   // drive it (no event — the host already knows)
 *   field.focus();          // focus the inner input
 * </script>
 * ```
 *
 * Methods: `focus()`, `select()`, `clear()`. Restyle via `::part(field)`,
 * `::part(input)`, `::part(label)`, `::part(hint)`.
 */
defineWebComponent<Props, Events>('kai-input', {
  type: 'text',
  value: undefined,
  placeholder: undefined,
  label: undefined,
  hint: undefined,
  error: undefined,
  size: 'md',
  disabled: undefined,
  readonly: undefined,
  required: undefined,
  invalid: undefined,
  name: undefined,
  autocomplete: undefined,
  inputmode: undefined,
}, (props, ctx) => {
  const { element, dispatch, flag, expose } = ctx;

  // Lift the value into the facade and drive Input CONTROLLED so the host can read
  // it (`el.value` / `:host([value])`) and set it after mount. Seed from the
  // `value` property/attribute present on mount.
  const [value, setValue] = createSignal(
    (props.value as string | undefined) ?? element.getAttribute('value') ?? '',
  );

  // Coerce any value coming through the `value` setter (a JS assignment, or the
  // write-back from `attributeChangedCallback`) to a string — falling back to the
  // live attribute when nullish so the reflect write-back equals the signal and
  // the equality guards absorb it (no attr⇄prop feedback loop; mirrors kai-segmented).
  const coerce = (v: unknown): string =>
    v == null ? (element.getAttribute('value') ?? '') : String(v);

  // Set the value WITHOUT firing an event (programmatic / reflect write-back).
  const setQuiet = (next: string) => { if (untrack(value) !== next) setValue(next); };

  // Override `value` so reads return LIVE state and host writes (`el.value = …`)
  // drive it WITHOUT firing events — distinct from the typing path.
  Object.defineProperty(element, 'value', {
    get: () => value(),
    set: (v: unknown) => setQuiet(coerce(v)),
    configurable: true,
    enumerable: true,
  });

  // Reflect internal value → the `[value]` host attribute (for `:host([value])`).
  // The guard against the live attribute keeps the write-back the reflect triggers
  // (attributeChangedCallback → setter) from looping.
  createEffect(() => {
    const v = value();
    if (v) {
      if (element.getAttribute('value') !== v) element.setAttribute('value', v);
    } else if (element.hasAttribute('value')) {
      element.removeAttribute('value');
    }
  });

  // `autocapitalize` is forwarded by reading the host attribute rather than as a
  // declared prop: it is a global reflected HTMLElement IDL attribute (lowercase,
  // like the reserved `lang`/`title`), so component-register's constructor
  // `this.autocapitalize = undefined` would reflect an attribute and throw
  // "must not have attributes". Seeded now; kept in sync by the observer in onMount.
  const [autocapitalize, setAutocapitalize] = createSignal<string | undefined>(
    element.getAttribute('autocapitalize') ?? undefined,
  );

  // Track which affix slots are filled; re-read on child mutations so late/streamed
  // content lights up its affix. An empty slot is never passed to the primitive.
  const [filled, setFilled] = createSignal<Record<SlotName, boolean>>({ leading: false, trailing: false });
  onMount(() => {
    const read = () => {
      const next = {} as Record<SlotName, boolean>;
      for (const name of SLOT_NAMES) next[name] = !!element.querySelector(`:scope > [slot="${name}"]`);
      setFilled(next);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, subtree: false });
    onCleanup(() => observer.disconnect());

    // Keep the forwarded `autocapitalize` in sync with the host attribute.
    const syncAutocapitalize = () => setAutocapitalize(element.getAttribute('autocapitalize') ?? undefined);
    syncAutocapitalize();
    const attrObserver = new MutationObserver(syncAutocapitalize);
    attrObserver.observe(element, { attributes: true, attributeFilter: ['autocapitalize'] });
    onCleanup(() => attrObserver.disconnect());
  });
  const region = (name: SlotName) => (filled()[name] ? <slot name={name} /> : undefined);

  const innerInput = () => element.shadowRoot?.querySelector<HTMLInputElement>('input') ?? null;

  expose({
    /** Focus the inner input (the host can't reach into the shadow root). */
    focus: (options?: FocusOptions) => innerInput()?.focus(options),
    /** Select the inner input's text. */
    select: () => innerInput()?.select(),
    /** Empty the value and fire `kai-change` with `''`. */
    clear: () => { setValue(''); dispatch('kai-change', { value: '' }); },
  });

  return (
    <>
      <style>{':host{display:block}'}</style>
      <Input
        type={(props.type as string) ?? 'text'}
        value={value()}
        placeholder={props.placeholder as string | undefined}
        label={props.label as string | undefined}
        hint={props.hint as string | undefined}
        error={props.error as string | undefined}
        size={(props.size as 'sm' | 'md' | undefined) ?? 'md'}
        invalid={flag('invalid')}
        disabled={flag('disabled')}
        readonly={flag('readonly')}
        required={flag('required')}
        name={props.name as string | undefined}
        autocomplete={props.autocomplete as InputProps['autocomplete']}
        inputmode={props.inputmode as InputProps['inputmode']}
        autocapitalize={autocapitalize() as InputProps['autocapitalize']}
        leading={region('leading')}
        trailing={region('trailing')}
        onValueInput={(v) => { setValue(v); dispatch('kai-input', { value: v }); }}
        onValueChange={(v) => { setQuiet(v); dispatch('kai-change', { value: v }); }}
      />
    </>
  );
});
