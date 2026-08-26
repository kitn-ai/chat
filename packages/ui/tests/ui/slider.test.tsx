/**
 * Guards for the `Slider` primitive and its one migrated call site.
 *
 * WHAT JSDOM CANNOT SEE, STATED SO NOTHING HERE READS AS MORE THAN IT IS. jsdom does
 * no layout and does not load `src/elements/styles.css`, so nothing below proves the
 * slider LOOKS right: `.kai-range` computes to nothing here, the pseudo-element track
 * and thumb do not exist, and `getComputedStyle` on the input reports the UA default.
 * What these pin is the part that is real in a DOM with no CSS at all: that the control
 * is the NATIVE element, that it still routes through the one designed class, that the
 * `--kai-range-fill` arithmetic the component took over from its callers produces the
 * right number, and that the props forwarding does not stamp a lying `aria-invalid`.
 * The computed-style proof that the rendered result is unchanged is done in a real
 * Chromium, against the same stories, and reported separately.
 */
import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Slider } from '../../src/ui/slider';
import { SliderWidget, type WidgetProps } from '../../src/components/form-widgets';

afterEach(() => { document.body.innerHTML = ''; });

const fillOf = (el: Element): string | null =>
  (el as HTMLElement).style.getPropertyValue('--kai-range-fill') || null;

function widgetProps(over: Partial<WidgetProps> = {}): WidgetProps {
  return {
    id: 'f-x',
    value: undefined,
    field: { type: 'number' },
    disabled: false,
    required: false,
    invalid: false,
    label: 'Temperature',
    onInput: () => {},
    onBlur: () => {},
    ...over,
  } as WidgetProps;
}

// ---------------------------------------------------------------- the primitive

test('Slider is a REAL native range input, not a div with a drag handler', () => {
  // The plan's hard rule (§3): every accessibility loss the control audit found was in
  // a control that had replaced the native element. A `<div role="slider">` would
  // satisfy a naive "renders something draggable" assertion, so assert the element.
  const { container } = render(() => <Slider min={0} max={100} />);
  const el = container.firstElementChild as HTMLInputElement;
  expect(el.tagName).toBe('INPUT');
  expect(el.type).toBe('range');
  expect(el.classList.contains('kai-range')).toBe(true);
});

test('Slider class merges with the kit rule instead of replacing it', () => {
  const { container } = render(() => <Slider min={0} max={100} class="mt-2" />);
  const el = container.firstElementChild!;
  expect(el.classList.contains('kai-range')).toBe(true);
  expect(el.classList.contains('mt-2')).toBe(true);
});

test('Slider forwards min, max and step verbatim and invents no defaults', () => {
  // Plan §4's named trap. The 0..100 fallback belongs to the widget reading a
  // JSON-Schema field, never to the primitive.
  const { container } = render(() => <Slider min={-40} max={140} step={0.5} />);
  const el = container.firstElementChild as HTMLInputElement;
  expect(el.getAttribute('min')).toBe('-40');
  expect(el.getAttribute('max')).toBe('140');
  expect(el.getAttribute('step')).toBe('0.5');
});

test('Slider computes --kai-range-fill so no caller ever does the arithmetic', () => {
  const { container } = render(() => <Slider min={0} max={200} value={50} />);
  expect(fillOf(container.firstElementChild!)).toBe('25%');
});

test('Slider fill follows a controlled value reactively', () => {
  const [v, setV] = createSignal(0);
  const { container } = render(() => <Slider min={0} max={10} value={v()} />);
  const el = container.firstElementChild!;
  expect(fillOf(el)).toBe('0%');
  setV(10);
  expect(fillOf(el)).toBe('100%');
  setV(2.5);
  expect(fillOf(el)).toBe('25%');
});

test('Slider fill handles an inverted or degenerate range without painting nonsense', () => {
  const { container } = render(() => (
    <>
      <Slider min={5} max={5} value={5} />
      <Slider min={0} max={100} value={400} />
      <Slider min={0} max={100} value={-90} />
    </>
  ));
  const [degenerate, over, under] = [...container.children];
  expect(fillOf(degenerate)).toBe('0%');
  // Clamped: a value outside the range is the caller's to fix, but a 400%-wide track
  // is a rendering artefact nobody asked for.
  expect(fillOf(over)).toBe('100%');
  expect(fillOf(under)).toBe('0%');
});

test('Slider with no value at all sits at the midpoint, HTML\'s own rule', () => {
  const { container } = render(() => <Slider min={0} max={80} />);
  expect(fillOf(container.firstElementChild!)).toBe('50%');
});

test('Slider merges the fill INTO a caller style rather than clobbering it', () => {
  const { container } = render(() => <Slider min={0} max={100} value={10} style={{ 'max-width': '10rem' }} />);
  const el = container.firstElementChild as HTMLElement;
  expect(fillOf(el)).toBe('10%');
  expect(el.style.maxWidth).toBe('10rem');
});

test('Slider fill follows the thumb when UNCONTROLLED', () => {
  // The reason the component listens to a native `on:input` of its own: an uncontrolled
  // slider has no signal to read, and a fill frozen at the seed value while the thumb
  // moves is the visible bug.
  const { container } = render(() => <Slider min={0} max={100} defaultValue={10} />);
  const el = container.firstElementChild as HTMLInputElement;
  expect(fillOf(el)).toBe('10%');
  el.value = '90';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  expect(fillOf(el)).toBe('90%');
});

test('Slider does NOT swallow a caller onInput handler', () => {
  // `on:input` is used precisely so `onInput` reaches the input untouched. A component
  // that split `onInput` out to track the value and forgot to call it back would pass
  // every other test in this file.
  const seen: number[] = [];
  const { container } = render(() => (
    <Slider min={0} max={100} onInput={(e) => seen.push(e.currentTarget.valueAsNumber)} />
  ));
  const el = container.firstElementChild as HTMLInputElement;
  el.value = '33';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  expect(seen).toEqual([33]);
});

test('Slider forwards id, name, data-* and the aria trio to the input', () => {
  const { container } = render(() => (
    <Slider min={0} max={100} id="f-temp" name="temperature" data-control="" aria-required="true" aria-invalid="true" aria-describedby="d1 d2" />
  ));
  const el = container.firstElementChild!;
  expect(el.id).toBe('f-temp');
  expect(el.getAttribute('name')).toBe('temperature');
  expect(el.hasAttribute('data-control')).toBe(true);
  expect(el.getAttribute('aria-required')).toBe('true');
  expect(el.getAttribute('aria-invalid')).toBe('true');
  expect(el.getAttribute('aria-describedby')).toBe('d1 d2');
});

test('Slider REMOVES a forwarded aria attribute when it goes undefined', () => {
  // Decision D-7's named trap: a spread that wrote `aria-invalid={false}` leaves the
  // literal string "false" in the DOM, which reads as INVALID to a screen reader.
  const [invalid, setInvalid] = createSignal<'true' | undefined>('true');
  const { container } = render(() => <Slider min={0} max={100} aria-invalid={invalid()} />);
  const el = container.firstElementChild!;
  expect(el.getAttribute('aria-invalid')).toBe('true');
  setInvalid(undefined);
  expect(el.hasAttribute('aria-invalid')).toBe(false);
});

// ---------------------------------------------------------------- the call site

test('SliderWidget renders the primitive and keeps its own schema fallbacks', () => {
  // The widget reads a consumer-authored JSON-Schema field, so an absent
  // `minimum`/`maximum` still becomes 0..100 HERE. That guess must not migrate into
  // the primitive, and the primitive must not have acquired one (see the test above).
  const { container } = render(() => <SliderWidget {...widgetProps({ value: 25 })} />);
  const el = container.querySelector('input[type="range"]') as HTMLInputElement;
  expect(el).toBeTruthy();
  expect(el.classList.contains('kai-range')).toBe(true);
  expect(el.getAttribute('min')).toBe('0');
  expect(el.getAttribute('max')).toBe('100');
  expect(fillOf(el)).toBe('25%');
  expect(el.id).toBe('f-x');
  expect(el.hasAttribute('data-control')).toBe(true);
});

test('SliderWidget still honours schema bounds, step and the integer rule', () => {
  const { container } = render(() => (
    <SliderWidget {...widgetProps({ field: { type: 'integer', minimum: 10, maximum: 20 }, value: 15 })} />
  ));
  const el = container.querySelector('input[type="range"]') as HTMLInputElement;
  expect(el.getAttribute('min')).toBe('10');
  expect(el.getAttribute('max')).toBe('20');
  expect(el.getAttribute('step')).toBe('1');
  expect(fillOf(el)).toBe('50%');
  expect(el.getAttribute('aria-valuetext')).toBe('15');
});

test('SliderWidget reports the value through onInput and commits on blur', () => {
  const seen: unknown[] = [];
  let blurred = 0;
  const { container } = render(() => (
    <SliderWidget {...widgetProps({ value: 20, onInput: (v) => seen.push(v), onBlur: () => { blurred += 1; } })} />
  ));
  const el = container.querySelector('input[type="range"]') as HTMLInputElement;
  el.value = '61';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  expect(seen).toEqual([61]);
  expect(blurred).toBe(1);
});

// ------------------------------------------------- controlled/uncontrolled divergence
//
// THE DEFECT THESE PIN. A controlled `<input type="range">` in Solid can drift: the
// browser moves the thumb, and if the caller's `value` does not change in response the
// bound expression is unchanged, so Solid never writes the DOM back. The thumb ends up
// somewhere the component says it is not, and because the fill is derived from `value`
// the two visibly DISAGREE. Reported by the owner against the Storybook Playground as
// "the track thumb does not move with the circle".
//
// A test that renders once and checks the initial fill cannot see any of this. The
// whole defect is the SECOND update, so every test below changes something and asserts
// the change landed.

/** One trusted-shaped input event, plus the microtask the reconciliation waits on. */
async function drag(el: HTMLInputElement, to: number): Promise<void> {
  el.value = String(to);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await Promise.resolve();
}

test('a controlled Slider with NO writer snaps the thumb back instead of drifting', async () => {
  // `<Slider value={40} />` is a legitimate pinned slider. It must LOOK pinned: thumb
  // and fill agreeing at 40, not a thumb at 85 over a track filled to 40%.
  const { container } = render(() => <Slider min={0} max={100} value={40} />);
  const el = container.firstElementChild as HTMLInputElement;
  expect(fillOf(el)).toBe('40%');
  await drag(el, 85);
  expect(el.value).toBe('40');
  expect(fillOf(el)).toBe('40%');
});

test('a controlled Slider WITH a writer moves, and the fill moves with it', async () => {
  // The ordinary controlled case must not be broken by the snap-back. The caller's
  // `onInput` is Solid-delegated and therefore runs AFTER the component's own target
  // listener, which is exactly why the reconciliation is deferred to a microtask.
  const [v, setV] = createSignal(40);
  const { container } = render(() => (
    <Slider min={0} max={100} value={v()} onInput={(e) => setV(e.currentTarget.valueAsNumber)} />
  ));
  const el = container.firstElementChild as HTMLInputElement;
  expect(fillOf(el)).toBe('40%');
  await drag(el, 85);
  expect(v()).toBe(85);
  expect(el.value).toBe('85');
  expect(fillOf(el)).toBe('85%');
});

test('a controlled Slider hands the caller the NEW value, not the reconciled one', async () => {
  // The failure mode of snapping back too early: the caller's handler reads
  // `e.currentTarget.valueAsNumber` and gets the value we already reset.
  const seen: number[] = [];
  const { container } = render(() => (
    <Slider min={0} max={100} value={40} onInput={(e) => seen.push(e.currentTarget.valueAsNumber)} />
  ));
  const el = container.firstElementChild as HTMLInputElement;
  await drag(el, 85);
  expect(seen).toEqual([85]);
});

test('an UNCONTROLLED Slider is never snapped back', async () => {
  const { container } = render(() => <Slider min={0} max={100} defaultValue={40} />);
  const el = container.firstElementChild as HTMLInputElement;
  await drag(el, 85);
  expect(el.value).toBe('85');
  expect(fillOf(el)).toBe('85%');
});

// ---------------------------------------------------------------- the value readout

test('Slider with NO valueLabel is still a bare input, unchanged for every caller', () => {
  // The whole point of the prop being off by default. If this ever renders a wrapper,
  // every existing call site's DOM shape moved underneath it.
  const { container } = render(() => <Slider min={0} max={100} value={40} />);
  expect(container.firstElementChild!.tagName).toBe('INPUT');
  expect(container.querySelector('span')).toBeNull();
});

test('Slider valueLabel renders the raw number, and it FOLLOWS the value', () => {
  const [v, setV] = createSignal(40);
  const { container } = render(() => <Slider min={0} max={100} value={v()} valueLabel />);
  const span = container.querySelector('span')!;
  expect(span.textContent).toBe('40');
  setV(85);
  expect(span.textContent).toBe('85');
});

test('Slider valueLabel takes a FORMATTER for sliders that are not counting bare numbers', () => {
  // A boolean alone cannot say "60%", "3 of 5" or "1m 30s", which is the whole reason
  // the prop is a union rather than a flag.
  const [v, setV] = createSignal(3);
  const { container } = render(() => (
    <Slider min={0} max={5} value={v()} valueLabel={(n) => `${n} of 5`} />
  ));
  const span = container.querySelector('span')!;
  expect(span.textContent).toBe('3 of 5');
  setV(4);
  expect(span.textContent).toBe('4 of 5');
});

test('Slider readout is hidden from assistive tech, so the value is announced ONCE', () => {
  // The input already reports the number through aria-valuenow / aria-valuetext. An
  // exposed copy would be read twice on every step of a drag.
  const { container } = render(() => <Slider min={0} max={100} value={40} valueLabel />);
  expect(container.querySelector('span')!.getAttribute('aria-hidden')).toBe('true');
});

test('Slider readout still tracks an UNCONTROLLED drag', async () => {
  const { container } = render(() => <Slider min={0} max={100} defaultValue={40} valueLabel />);
  const el = container.querySelector('input')! as HTMLInputElement;
  await drag(el, 85);
  expect(container.querySelector('span')!.textContent).toBe('85');
});

test('SliderWidget delegates its bubble to the primitive, same markup, now aria-hidden', () => {
  // The duplication that motivated the prop: the widget used to hand-build this row and
  // this span. Same classes, one owner. `aria-hidden` is new and is an improvement.
  const { container } = render(() => <SliderWidget {...widgetProps({ value: 25 })} />);
  const row = container.firstElementChild!;
  expect(row.tagName).toBe('DIV');
  expect(row.className).toBe('flex items-center gap-3');
  const span = container.querySelector('span')!;
  expect(span.textContent).toBe('25');
  expect(span.getAttribute('aria-hidden')).toBe('true');
  for (const cls of ['min-w-9', 'shrink-0', 'rounded-md', 'bg-background', 'tabular-nums', 'shadow-sm']) {
    expect(span.classList.contains(cls)).toBe(true);
  }
});
