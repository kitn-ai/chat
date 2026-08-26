import { createEffect, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { DEFAULT_FORMAT, Input, type InputProps } from '../ui/input';
import {
  compileMask,
  formatForDisplay,
  formatRaw,
  normalizeToRaw,
  type CaseMode,
} from '../primitives/field-mask';
import { canonicalize, fieldSemantics, type FieldSemanticType } from '../primitives/field-semantics';
import type { CopyPolicy, InputMaskRejectReason } from '../primitives/input-mask';

interface Props extends Record<string, unknown> {
  /** Native input type: `text` (default) · `email` · `url` · `search` · `tel` ·
   *  `password` · `number`. Single-line only. */
  type?: string;
  /** Controlled value, and always the CANONICAL one when a mask is active: digits
   *  for `tel` / `ssn` / `credit-card`, the formatted text for `custom`.
   *  Settable and reflected to the `value` attribute. `el.value = '5551234567'`
   *  drives it (no event) and is re-fitted to the mask on the way in, so the field
   *  shows `555-123-4567`. Read `el.value` for live state; the formatted text rides
   *  along on every `kai-input` / `kai-change` detail as `formattedValue`. */
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

  // --- Form-field formats (spec §7.2). Five SCALARS, which is exactly why they work as
  // HTML attributes under the kai- contract. With `format` AND `semantic` both absent the
  // element behaves as it always did: no mask, no extra attributes, nothing.

  /** Mask pattern: `#` a digit, `@` a letter or digit, `*` an obscurable letter or
   *  digit, and every other character a positional literal (`@@@-####` → `CHG-4821`).
   *
   *  The literal `default` is the opt-in sentinel: it resolves to the default format of
   *  `semantic` (`tel` → `###-###-####`). A bare `semantic` never starts masking on its
   *  own, so an opt-in token is what turns tier 2 on. */
  format?: string;
  /** Placeholder guide shown at unfilled positions, aligned position for position with
   *  `format`: `mm/dd/yyyy` against `##/##/####`. Spaces are a valid guide character, so
   *  a guide of blanks and separators is how a phone field shows its shape without
   *  showing letters. Without a guide the field shows only up to the last typed
   *  character. A guide is a visual aid, never an accessible name: keep the `hint` text
   *  as well. */
  guide?: string;
  /** Semantic field type: `tel` · `ssn` · `credit-card` · `custom`. On its own it sets
   *  `inputmode` / `autocomplete` / `spellcheck` / `autocorrect` / `autocapitalize` and
   *  decides the canonical value; it never starts masking by itself. */
  semantic?: FieldSemanticType;
  /** Case folding applied to typed and pasted text: `preserve` (default) · `upper` ·
   *  `lower`. Attribute: `case-mode`. */
  caseMode?: CaseMode;
  /** What a copy or cut of a masked field puts on the clipboard: `canonical` (default)
   *  · `formatted` · `obscured` · `blocked`. Attribute: `copy-policy`. */
  copyPolicy?: CopyPolicy;
  // NOTE: `autocapitalize` is forwarded too, but NOT as a declared prop — see the
  // attribute read in the facade body (it is a global reflected HTMLElement IDL
  // attribute and would break the element constructor as a component-register prop).
}

/** Events fired by `<kai-input>`. */
interface Events {
  /** The value changed per keystroke. `value` is the canonical value (what a backend
   *  wants); `formattedValue` is the text on screen. With no mask the two are equal. */
  'kai-input': { value: string; formattedValue: string };
  /** The value was committed (blur). Same detail shape as `kai-input`. */
  'kai-change': { value: string; formattedValue: string };
  /** A mask refused, or partly refused, some content. The reasons are `full` (no free
   *  position left), `wrong-class` (a letter into a digit position), `over-capacity` (a
   *  paste longer than the mask holds; what fits was kept), and `format-change-clipped`
   *  (the `format` changed under a value that no longer fits). `data` is the content
   *  that was refused.
   *
   *  The first three are USER-INPUT errors, and are the ones worth announcing in a
   *  polite live region. `format-change-clipped` is not one: it follows the app changing
   *  its own configuration, so it reports and nothing more. None of the four touches
   *  validity, so `invalid` and `error` stay the consumer decision. */
  'kai-input-rejected': { reason: InputMaskRejectReason; data: string };
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
 * Methods: `focus()`, `select()`, `clear()`, `getRawValue()`, `getFormattedValue()`.
 * Restyle via `::part(field)`,
 * `::part(input)`, `::part(label)`, `::part(hint)`.
 *
 * ## Masked and formatted fields
 *
 * `format` turns the field into a mask; `guide`, `semantic`, `case-mode` and
 * `copy-policy` tune it. All five are scalars, so all five are plain attributes.
 *
 * ```html
 * <kai-input label="Ticket" format="@@@-####" case-mode="upper"
 *            hint="Three letters, a dash, four digits."></kai-input>
 * <kai-input label="Phone" semantic="tel" format="default"
 *            guide="   -   -    "></kai-input>
 * ```
 *
 * `el.value` is the CANONICAL value — digits for `tel` / `ssn` / `credit-card`, the
 * formatted text for `custom`. The text on screen rides along as
 * `formattedValue` on the `kai-input` / `kai-change` details. Refusals report on
 * `kai-input-rejected` and never touch validity.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO, both recorded rather than smuggled:
 *
 * 1. **Not form-associated.** There is no `ElementInternals` and no
 *    `setFormValue()`, so a `<kai-input>` inside a `<form>` contributes nothing to
 *    `FormData` and takes no part in native validation, with or without a mask.
 *    That is a KNOWN GAP: form association lands later, with its own migration.
 *    Read the value off the element.
 * 2. **No `value-type` prop.** Canonical-form-per-semantic-type is the whole
 *    contract; a per-field raw-or-formatted switch would make
 *    the same field round-trip differently depending on who set it.
 *
 * ### The controlled-value rule, stated
 *
 * A write to `el.value` after mount is re-fitted through the masker, so it lands
 * FORMATTED on screen and canonical on the property, and fires no event. What that
 * covers is any write that reaches this element: `el.value = x`, the `value`
 * attribute, and a React/Vue/Svelte wrapper prop, since every wrapper drives this
 * element by writing the property. A value present at first render is masked by the
 * same rule, and so is a change to `format` / `guide` / `semantic` / `case-mode`
 * AFTER mount: the canonical value is re-derived, so `el.value` never serves a
 * reading that disagrees with the configuration in force. An over-long write is
 * clipped to what the mask holds and says so on `kai-input-rejected`.
 *
 * The one thing none of that reaches is a consumer that writes the inner `<input>`
 * inside the shadow root directly, behind both this element and its mask.
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
  format: undefined,
  guide: undefined,
  semantic: undefined,
  caseMode: undefined,
  copyPolicy: undefined,
}, (props, ctx) => {
  const { element, dispatch, flag, expose } = ctx;

  /** Is a mask configured at all? An empty `format` means no, same as an absent one. */
  const masked = (): boolean => {
    const format = props.format as string | undefined;
    return format !== undefined && format !== '';
  };

  /**
   * Resolve a seed value through the SAME pure engine the masker runs on, so the two
   * signals below start out agreeing with what the field will actually show.
   *
   * WHY THE FACADE DERIVES THIS INSTEAD OF ASKING THE MASKER. A seeded value is the one
   * case the masker cannot report: it normalizes the text at attach time WITHOUT
   * notifying, because attaching is not an edit the consumer made. Nor can the facade
   * provoke it afterwards -- an edit whose raw value comes out unchanged commits nothing
   * and notifies nobody (`applyEdit` returns early on `nextRaw === raw`), which is
   * exactly what re-writing the seed is. So without this, a
   * `<kai-input format="@@@-####" value="chg4821">` would SHOW `CHG-4821` while
   * `el.value` still read `chg4821`.
   *
   * This is a derivation, not a second policy -- `field-mask`, `field-semantics` and the
   * `DEFAULT_FORMAT` sentinel are all read from where `ui/input.tsx` reads them, so
   * nothing about the resolution is restated here. A bad format or an unresolvable
   * `default` falls through unmasked exactly as it does there (the widget is the one
   * that warns; warning twice for one misconfiguration would be noise).
   */
  const throughMask = (text: string): { canonical: string; formatted: string } => {
    const plain = { canonical: text, formatted: text };
    if (text === '' || !masked()) return plain;
    const semantic = (props.semantic as FieldSemanticType | undefined) ?? 'custom';
    const format = props.format as string;
    const resolved = format === DEFAULT_FORMAT ? fieldSemantics(semantic).defaultFormat : format;
    if (resolved === undefined) return plain;
    try {
      const pattern = compileMask(resolved, props.guide as string | undefined);
      const raw = normalizeToRaw(pattern, text, (props.caseMode as CaseMode | undefined) ?? 'preserve');
      return {
        canonical: canonicalize(pattern, formatRaw(pattern, raw), semantic),
        formatted: formatForDisplay(pattern, raw),
      };
    } catch {
      return plain;
    }
  };

  // TWO signals, and the split is the whole controlled-value story.
  //
  // `value` is the CANONICAL value: what `el.value` reads, what reflects to the `[value]`
  // attribute, what every event detail carries. `display` is the text the inner input
  // shows, which under a mask is the FORMATTED text and is not the same string.
  //
  // Before the split there was one signal driving both, and it fought the masker: the
  // masker writes `555-123-4567` into the input, the facade stores the canonical
  // `5551234567`, and the controlled `value` prop then writes THAT back over the input on
  // the next flush -- the field un-formats itself one keystroke behind the user. Feeding
  // Input the display text means the value it writes is the text already there, which the
  // HTML value setter treats as a no-op (caret included).

  const seed = throughMask(
    (props.value as string | undefined) ?? element.getAttribute('value') ?? '',
  );
  const [value, setValue] = createSignal(seed.canonical);
  const [display, setDisplay] = createSignal(seed.formatted);

  // Coerce any value coming through the `value` setter (a JS assignment, or the
  // write-back from `attributeChangedCallback`) to a string — falling back to the
  // live attribute when nullish so the reflect write-back equals the signal and
  // the equality guards absorb it (no attr⇄prop feedback loop; mirrors kai-segmented).
  const coerce = (v: unknown): string =>
    v == null ? (element.getAttribute('value') ?? '') : String(v);

  // Set both WITHOUT firing an event (the unmasked path: canonical IS the display text).
  const setBothQuiet = (next: string) => {
    if (untrack(value) !== next) setValue(next);
    if (untrack(display) !== next) setDisplay(next);
  };

  const innerInput = () => element.shadowRoot?.querySelector<HTMLInputElement>('input') ?? null;

  /** Set while the facade is driving the field itself, so the masker callback it
   *  provokes updates state without firing `kai-input`. A programmatic write is not a
   *  keystroke, and the host that performed it already knows what it wrote. */
  let programmatic = false;

  /**
   * The single external-write path: `el.value = …`, the `value` attribute, and `clear()`
   * all land here.
   *
   * WITH A MASK it goes THROUGH the masker rather than around it. The masker owns
   * `input.value`, its own stored value, its undo stack and its caret; writing the input
   * behind its back leaves it holding a stale string, and the next keystroke reconciles
   * against that stale string rather than against what is on screen. So: put the text in
   * the field, then fire the `input` event the masker already listens for, which is its
   * documented reconcile path (spec §5.1) and ends in the same normalize-format-commit
   * every edit takes. The masker calls back with the canonical value and the formatted
   * text is then in the DOM, so both signals come from IT, not from the caller.
   *
   * A refusal (wrong characters, over capacity) reports on `kai-input-rejected` and leaves
   * the field as it was, which is the same contract typing gets.
   */
  const writeValue = (next: string, force = false): void => {
    // The reflect effect below writes `[value]`, which component-register writes back
    // through this setter. Without this guard that write-back would re-enter the masker on
    // every value change. `force` is for the one caller that must re-run an equal value.
    if (!force && untrack(value) === next) return;

    const input = innerInput();
    if (input === null || !masked()) {
      setBothQuiet(next);
      return;
    }

    programmatic = true;
    try {
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    } finally {
      programmatic = false;
    }
  };

  // Override `value` so reads return LIVE state and host writes (`el.value = …`)
  // drive it WITHOUT firing events — distinct from the typing path.
  Object.defineProperty(element, 'value', {
    get: () => value(),
    set: (v: unknown) => writeValue(coerce(v)),
    configurable: true,
    enumerable: true,
  });

  // A CONFIGURATION CHANGE AFTER MOUNT re-derives the canonical value.
  //
  // The masker cannot report this one, in either of the two shapes it takes:
  //
  //   - `format` ARRIVING on a live field attaches a fresh masker, and attaching seeds
  //     with `notify: false` on purpose. The display re-formats, `el.value` does not.
  //   - `update()` notifies only when the FORMATTED text changed, so a reconfiguration
  //     that moves the canonical value WITHOUT moving the display is silent by design:
  //     flipping `semantic` from `custom` to `tel` under `###-###-####` turns
  //     `555-123-4567` into `5551234567` on the wire and changes nothing on screen.
  //
  // Either way `el.value` would go on serving a stale canonical value indefinitely -- and
  // an external write does NOT repair it, because an edit whose raw value comes out
  // unchanged commits nothing and notifies nobody. Only a keystroke did. So the facade
  // re-derives, from the text the masker has settled on.
  //
  // WHAT IT RE-FITS, and why not simply the text on screen. While a mask is on, the text
  // on screen can carry GUIDE characters at the unfilled positions, and a guide character
  // that happens to fit the position class would be absorbed as content on the way back
  // in. The previous CANONICAL value has no guide in it and is the faithful record of what
  // the user actually entered, so that is the input -- the same thing `update()` re-fits
  // from. With no mask there is no canonical form to speak of, so the field text is it.
  //
  // WHY A MICROTASK. This effect is created before the JSX below, so on any flush it runs
  // BEFORE the mask effect inside `Input`: reading or writing here would race the masker
  // it is trying to agree with. One microtask puts the whole thing after the flush. Where
  // the masker DID notify (a clipping format change), it has already set the right value
  // by then and this recomputes the same answer.
  {
    let first = true;
    createEffect(() => {
      // Tracked deliberately, and these four only: the inputs `throughMask` reads.
      void props.format;
      void props.guide;
      void props.semantic;
      void props.caseMode;
      if (first) {
        // The seed above already did this, synchronously and with no DOM to wait for.
        first = false;
        return;
      }
      queueMicrotask(() => {
        const source = masked() ? untrack(value) : (innerInput()?.value ?? untrack(display));
        const next = throughMask(source);
        if (untrack(value) !== next.canonical) setValue(next.canonical);
        if (untrack(display) !== next.formatted) setDisplay(next.formatted);
      });
    });
  }

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

  expose({
    /** Focus the inner input (the host can't reach into the shadow root). */
    focus: (options?: FocusOptions) => innerInput()?.focus(options),
    /** Select the inner input's text. */
    select: () => innerInput()?.select(),
    /** The canonical value: digits for `tel` / `ssn` / `credit-card`, the formatted text
     *  for `custom`, and the field text when no mask is on. Identical to reading
     *  `el.value`, under the name backends use for the submitted form of a masked
     *  field. The mask engine has a third,
     *  narrower notion of raw (the fill characters with no literals at all) and that one
     *  is internal: it is not what any backend wants and it is not exposed here. */
    getRawValue: (): string => untrack(value),
    /** The text on screen, literals and guide included. The counterpart to
     *  `formattedValue` on the `kai-input` / `kai-change` details, for a consumer that
     *  needs it outside an event. */
    getFormattedValue: (): string => innerInput()?.value ?? untrack(display),
    /** Empty the value and fire `kai-change` with `''`. On a masked field this resets the
     *  mask itself, not just the text on screen, so the next character starts over. */
    clear: () => {
      writeValue('', true);
      // From the signals, not from the DOM: unmasked, the input has not been re-rendered
      // yet at this point, so the DOM still holds the text that was just cleared.
      dispatch('kai-change', { value: untrack(value), formattedValue: untrack(display) });
    },
  });

  return (
    <>
      <style>{':host{display:block}'}</style>
      <Input
        type={(props.type as string) ?? 'text'}
        value={display()}
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
        format={props.format as string | undefined}
        guide={props.guide as string | undefined}
        semantic={props.semantic as FieldSemanticType | undefined}
        caseMode={props.caseMode as CaseMode | undefined}
        copyPolicy={props.copyPolicy as CopyPolicy | undefined}
        leading={region('leading')}
        trailing={region('trailing')}
        onValueInput={(v) => {
          // `v` is already canonical (the widget reads it off the masker). The formatted
          // text is whatever the masker just put in the DOM, so read it from there rather
          // than re-deriving it -- there is only one thing that knows it.
          setValue(v);
          setDisplay(innerInput()?.value ?? v);
          if (!programmatic) {
            dispatch('kai-input', { value: v, formattedValue: untrack(display) });
          }
        }}
        onValueChange={(v) => {
          setValue(v);
          if (!masked()) setDisplay(v);
          dispatch('kai-change', { value: v, formattedValue: innerInput()?.value ?? v });
        }}
        onMaskReject={(detail) => dispatch('kai-input-rejected', detail)}
      />
    </>
  );
});
