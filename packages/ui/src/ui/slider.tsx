import { type JSX, Show, splitProps, createSignal } from 'solid-js';
import { cn } from '../utils/cn';

export interface SliderProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type' | 'children' | 'min' | 'max' | 'step' | 'value'> {
  /**
   * Lowest selectable value. REQUIRED, and deliberately so.
   *
   * A range with no `min`/`max` is not a slider, it is a slider-shaped guess, and the
   * guess belongs to whoever knows what the number means. `SliderWidget` reading a
   * JSON-Schema field still defaults an absent `minimum` to 0 — that is the WIDGET's
   * decision about a consumer-authored schema, and it stays there rather than being
   * quietly adopted by every caller of this component.
   */
  min: number;
  /** Highest selectable value. REQUIRED for the same reason as `min`. */
  max: number;
  /** Granularity. Omitted means the native default (1); `'any'` means continuous. */
  step?: number | 'any';
  /** The current value. Controlled — drive it from `onInput`. Omit for uncontrolled. */
  value?: number;
  /** Initial value when uncontrolled. */
  defaultValue?: number;
  /**
   * Show the current value beside the track. Off by default.
   *
   * Two shapes, because one is not enough and three would be too many. `true` renders
   * the raw number, which is what most sliders want. A FUNCTION renders whatever it
   * returns, because plenty of sliders are not counting bare numbers: `60%`, `3 of 5`,
   * `1m 30s`. A boolean alone cannot express those, and a formatter alone would make
   * the common case read `valueLabel={(v) => v}`.
   *
   * The readout is `aria-hidden`. The input already reports the same number through
   * `aria-valuenow` / `aria-valuetext`, so an exposed copy would be announced twice.
   *
   * NOTE ON STRUCTURE: with a readout the component renders a flex row around the
   * input; without one it is still a bare `<input>` and nothing changes for existing
   * callers. Toggling this at runtime therefore rebuilds the input element, which is
   * fine for a control panel and not something a real app does mid-drag.
   */
  valueLabel?: boolean | ((value: number) => JSX.Element);
}

/**
 * A slider. A REAL `<input type="range">` behind `appearance: none`, styled by the
 * kit's `.kai-range` rule, never a `<div>` with a drag handler.
 *
 * The native control brings the whole keyboard contract (arrows, Home, End,
 * PageUp/PageDown), pointer and touch dragging, form participation via `name`, and
 * the `slider` role with a live value announcement — all of it for free and all of it
 * correct. Every accessibility defect this kit's control audit found was in a control
 * that had replaced the native element with something hand-rolled.
 *
 * What the component adds is the **filled track**. `.kai-range` paints the portion
 * left of the thumb from a `--kai-range-fill` custom property, and until now every
 * caller computed that percentage itself. It is arithmetic over `min`, `max` and the
 * current value — three things this component already has — so no consumer should
 * ever write it again.
 *
 * Everything not listed in `SliderProps` is forwarded to the input, so `id`, `name`,
 * `disabled`, `required`, `aria-*` and any `data-*` hook behave exactly as they do on
 * a plain `<input>`. No clamping and no validation is applied: a value outside
 * `min`..`max` is the browser's business, not ours.
 *
 * ```tsx
 * <Slider min={0} max={100} step={5} value={v()} onInput={(e) => setV(e.currentTarget.valueAsNumber)} />
 * ```
 */
export function Slider(props: SliderProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'class', 'style', 'min', 'max', 'step', 'value', 'defaultValue', 'ref', 'valueLabel',
  ]);

  // The uncontrolled mirror. A slider's fill has to follow the thumb even when nobody
  // is holding the value in a signal, so the component tracks the live value itself
  // through a NATIVE `on:input` listener. That is `on:` and not `onInput` on purpose:
  // `onInput` stays in `rest` and reaches the input untouched, so a caller's handler
  // is neither wrapped nor swallowed, and the two listeners simply both run.
  const [live, setLive] = createSignal<number | undefined>(props.defaultValue);

  // HTML's own rule for a range with no value: the midpoint of the span. Restated here
  // rather than left to the browser because the fill has to agree with the thumb on the
  // very first paint, before any input event exists.
  const current = () => local.value ?? live() ?? (local.min + local.max) / 2;

  const fill = (): string => {
    const lo = local.min;
    const hi = local.max;
    if (!(hi > lo)) return '0%';
    // Clamp: a value outside the range is the caller's to fix, but a track painted
    // 140% wide is a rendering artefact nobody asked for.
    const pct = ((current() - lo) / (hi - lo)) * 100;
    return `${Math.min(100, Math.max(0, pct))}%`;
  };

  // Merge rather than replace: `style` is a legitimate thing to pass a slider, and the
  // fill is a custom property that has to survive alongside it. Solid accepts either a
  // string or an object here, so both shapes are handled.
  const style = (): string | JSX.CSSProperties => {
    const s = local.style;
    if (typeof s === 'string') return `${s.replace(/;\s*$/, '')};--kai-range-fill:${fill()}`;
    return { ...(s ?? {}), '--kai-range-fill': fill() } as JSX.CSSProperties;
  };

  // CONTROLLED-MODE RECONCILIATION. A controlled `<input type="range">` in Solid can
  // drift: the browser moves the thumb on a drag, and if the caller's `value` does not
  // change in response, the bound expression is unchanged, so Solid never writes the
  // DOM back. The thumb ends up somewhere the component's own state says it is not —
  // and because the fill is derived from `value`, the two visibly DISAGREE. That is the
  // exact symptom reported against the Storybook Playground: thumb slides, track does
  // not. A pinned, writer-less `<Slider value={40} />` is a legitimate thing to render,
  // and it should look pinned rather than half-moved.
  //
  // WHY A MICROTASK AND NOT THE HANDLER OR A BARE EFFECT. Both of those run too early
  // and would break the ordinary controlled case. The `on:input` listener above is
  // attached to the TARGET, so it runs before the caller's `onInput`, which Solid
  // delegates at the document; snapping back there would hand the caller's handler a
  // value we had already reset. A `createEffect` is flushed at the end of the update
  // that `setLive` starts, which is still inside the target listener and therefore also
  // before the delegated one. A microtask runs after the whole event turn: every input
  // listener has run and any signal the caller set has propagated, so a value that
  // still disagrees means the caller genuinely did not accept the edit.
  let el: HTMLInputElement | undefined;
  const reconcileControlled = () => {
    const v = local.value;
    // Uncontrolled: `live` is the truth and the DOM is already showing it.
    if (v === undefined || el === undefined) return;
    if (el.valueAsNumber !== v) el.value = String(v);
  };

  const readout = (): JSX.Element => {
    const vl = local.valueLabel;
    return typeof vl === 'function' ? vl(current()) : current();
  };

  const control = () => (
    <input
      {...rest}
      type="range"
      class={cn('kai-range', local.class)}
      style={style()}
      min={local.min}
      max={local.max}
      step={local.step}
      value={local.value ?? live() ?? undefined}
      ref={(node) => {
        // `ref` is split out and re-applied by hand because this component needs the
        // element for the reconciliation above. Solid always hands a component a ref
        // FUNCTION (a variable ref compiles into one), so the typeof guard is for the
        // hand-written object case only.
        el = node;
        const forward = local.ref;
        if (typeof forward === 'function') (forward as (n: HTMLInputElement) => void)(node);
      }}
      on:input={(e) => {
        setLive((e.currentTarget as HTMLInputElement).valueAsNumber);
        queueMicrotask(reconcileControlled);
      }}
    />
  );

  return (
    <Show when={local.valueLabel} fallback={control()}>
      <div class="flex items-center gap-3">
        {control()}
        {/* aria-hidden: the input already announces this number. The readout is a
            second copy for the eyes only, and exposing it would double the
            announcement on every step of a drag. */}
        <span
          aria-hidden="true"
          class="min-w-9 shrink-0 rounded-md bg-background px-2 py-1 text-center text-sm font-medium tabular-nums text-foreground shadow-sm"
        >
          {readout()}
        </span>
      </div>
    </Show>
  );
}
