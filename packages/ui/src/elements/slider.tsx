import { createEffect, createSignal, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { Slider } from '../ui/slider';

interface Props extends Record<string, unknown> {
  /** Lowest selectable value. Required: a range with no bounds is a guess, and the
   *  guess belongs to whoever knows what the number means. */
  min?: number;
  /** Highest selectable value. Required, for the same reason as `min`. */
  max?: number;
  /** Granularity. Omitted means the native default of 1; `any` means continuous. */
  step?: number | 'any';
  /** Controlled value. Settable and reflected to the `value` attribute. `el.value = 40`
   *  drives it; dragging updates it and fires `kai-input` per step, `kai-change` on
   *  release. Read `el.value` for live state. */
  value?: number;
  /** Disable interaction. */
  disabled?: boolean;
  /** Accessible label for the slider. */
  label?: string;
  /** Form-control name, for a native form submit. */
  name?: string;
  /** Show the current value beside the track. Off by default.
   *
   *  Two ways in, because one of them is not a scalar. As a bare ATTRIBUTE
   *  (`<kai-slider value-label>`) it renders the raw number. As a JS PROPERTY it also
   *  accepts a formatter function (`el.valueLabel = (v) => v + '%'`), for a slider that
   *  is not counting bare numbers. A function cannot survive an attribute, so that half
   *  is property-only.
   *
   *  The readout is hidden from assistive tech: the slider already reports the same
   *  number, and an exposed copy would be announced twice. */
  valueLabel?: boolean | ((value: number) => string);
}

/** Events fired by `<kai-slider>`. */
interface Events {
  /** The thumb moved. Fires per step during a drag or a key press. */
  'kai-input': { value: number };
  /** The value was committed: pointer released, or a key press finished. */
  'kai-change': { value: number };
}

/**
 * `<kai-slider>` — a slider over a real `<input type="range">`, with the kit's filled
 * track and thumb. Arrows, Home, End and PageUp/PageDown all work because the control
 * underneath is the browser's, not a reimplementation.
 *
 * Give it `min` and `max` (there are no defaults on purpose), drive and read the
 * position with the `value` property, and listen for `kai-input` while dragging or
 * `kai-change` on release.
 *
 * ```html
 * <kai-slider min="0" max="100" step="5" value="40" label="Temperature"></kai-slider>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const slider = document.querySelector('kai-slider');
 *   slider.addEventListener('kai-input', (e) => console.log(e.detail.value));
 *   slider.value = 70;   // drive it (no event — the host already knows)
 * </script>
 * ```
 */
defineWebComponent<Props, Events>('kai-slider', {
  min: undefined,
  max: undefined,
  step: undefined,
  value: undefined,
  disabled: undefined,
  label: undefined,
  name: undefined,
  valueLabel: undefined,
}, (props, ctx) => {
  const { element, dispatch, flag, expose } = ctx;

  // `Number(null)` is 0 and `Number('')` is 0, both FINITE, so a naive
  // `Number.isFinite(Number(v))` treats a missing attribute as a real zero and the
  // fallbacks below never fire. Reject the empty cases before coercing.
  const num = (v: unknown, fallback: number): number => {
    if (v == null || (typeof v === 'string' && v.trim() === '')) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  // No invented bounds: these mirror the native `<input type="range">` defaults, which
  // is what an author who wrote neither attribute is already going to get.
  const min = () => num(props.min, 0);
  const max = () => num(props.max, 100);

  // Lift the position into the facade and drive Slider CONTROLLED so the host can read
  // it (`el.value` / `:host([value])`) and set it after mount. Seed from the `value`
  // property/attribute present on mount, falling back to the midpoint — HTML's own rule
  // for a range with no value. kai-checkbox / kai-radio-group's structure, deliberately.
  const [value, setValue] = createSignal(
    props.value != null
      ? num(props.value, (min() + max()) / 2)
      : num(element.getAttribute('value'), (min() + max()) / 2),
  );

  // Coerce anything arriving through the `value` setter (a JS assignment, or the
  // write-back `attributeChangedCallback` fires when the reflect effect below writes the
  // attribute) to a number, falling back to the live attribute when nullish so the
  // write-back equals the signal and the guard absorbs it — no attr⇄prop feedback loop.
  const coerce = (v: unknown): number =>
    v == null ? num(element.getAttribute('value'), untrack(value)) : num(v, untrack(value));

  // Apply a new value and fire once (the user path). No-op while disabled.
  const apply = (next: number, type: 'kai-input' | 'kai-change') => {
    if (flag('disabled')) return;
    // kai-change fires on commit EVEN IF the value equals the last one this element
    // reported, because "you let go here" is information the host cannot derive; the
    // equality guard applies to the per-step stream only.
    if (type === 'kai-input' && untrack(value) === next) return;
    setValue(next);
    dispatch(type, { value: next });
  };

  // Reads return LIVE state; host writes drive it WITHOUT firing an event — the host
  // already knows what it set. The equality guard kills the reflect write-back.
  Object.defineProperty(element, 'value', {
    get: () => value(),
    set: (v: unknown) => { const next = coerce(v); if (untrack(value) !== next) setValue(next); },
    configurable: true,
    enumerable: true,
  });

  // Reflect internal value → the `[value]` host attribute (for `:host([value])`).
  createEffect(() => {
    const v = String(value());
    if (element.getAttribute('value') !== v) element.setAttribute('value', v);
  });

  expose({
    /** Focus the inner range input (the host element can't reach it). */
    focus: (options?: FocusOptions) =>
      element.shadowRoot?.querySelector<HTMLInputElement>('input[type="range"]')?.focus(options),
  });

  // `step` arrives as a string when it came from an attribute. Resolve the one literal
  // the spec allows (`any`, continuous) and treat everything else as a number.
  const step = (): number | 'any' | undefined => {
    const raw = props.step;
    if (raw == null) return undefined;
    if (String(raw) === 'any') return 'any';
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  // `valueLabel` arrives either as a bare attribute (the boolean half) or as a property
  // holding a formatter (the half an attribute cannot carry). `flag` handles the first,
  // a typeof check the second.
  const valueLabel = (): boolean | ((v: number) => string) => {
    const raw = props.valueLabel;
    if (typeof raw === 'function') return raw as (v: number) => string;
    return flag('valueLabel');
  };

  // Base sets `:host{display:block}`, which is right for a full-width track.
  return (
    <Slider
      min={min()}
      max={max()}
      step={step()}
      value={value()}
      disabled={flag('disabled')}
      aria-label={props.label as string | undefined}
      name={props.name as string | undefined}
      valueLabel={valueLabel()}
      onInput={(e) => apply(e.currentTarget.valueAsNumber, 'kai-input')}
      onChange={(e) => apply(e.currentTarget.valueAsNumber, 'kai-change')}
    />
  );
});
