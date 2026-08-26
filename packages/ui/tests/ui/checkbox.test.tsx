import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Checkbox } from '../../src/ui/checkbox';
import { CheckboxWidget, CheckboxGroupWidget, type WidgetProps } from '../../src/components/form-widgets';

afterEach(() => { document.body.innerHTML = ''; });

function widgetProps(over: Partial<WidgetProps> = {}): WidgetProps {
  return {
    id: 'f-x',
    value: undefined,
    field: { type: 'boolean' },
    disabled: false,
    required: false,
    invalid: false,
    label: 'Email me on every update',
    onInput: () => {},
    onBlur: () => {},
    ...over,
  } as WidgetProps;
}

// ---------------------------------------------------------------- the primitive

test('Checkbox is a REAL native input, not a div wearing a role', () => {
  // The plan's hard rule (§3): every accessibility loss the control audit found was in
  // a control that had replaced the native element. A `<div role="checkbox">` would
  // satisfy a naive "renders something checkable" assertion, so assert the element.
  const { container } = render(() => <Checkbox />);
  const el = container.firstElementChild as HTMLInputElement;
  expect(el.tagName).toBe('INPUT');
  expect(el.type).toBe('checkbox');
  // `.kai-checkbox` is the shipped look (appearance-none, 18x18, themed). jsdom does
  // no layout and does not apply the element stylesheet, so this pins the CLASS —
  // that the rendered result still routes through the one designed rule — and the
  // computed-style proof that the rule is unchanged is done in a real Chromium.
  expect(el.classList.contains('kai-checkbox')).toBe(true);
});

test('Checkbox class merges with the kit rule instead of replacing it', () => {
  const { container } = render(() => <Checkbox class="mt-0.5" />);
  const el = container.firstElementChild!;
  expect(el.classList.contains('kai-checkbox')).toBe(true);
  expect(el.classList.contains('mt-0.5')).toBe(true);
});

test('Checkbox drives the indeterminate DOM PROPERTY, both directions', () => {
  // `indeterminate` has no HTML attribute, so this is the one thing the primitive has
  // to do imperatively. Callers used to each carry their own ref + createEffect; the
  // failure mode of moving it inside is an effect that sets but never clears.
  const [mixed, setMixed] = createSignal(true);
  const { container } = render(() => <Checkbox indeterminate={mixed()} />);
  const el = container.firstElementChild as HTMLInputElement;
  expect(el.indeterminate).toBe(true);
  setMixed(false);
  expect(el.indeterminate).toBe(false);
  setMixed(true);
  expect(el.indeterminate).toBe(true);
});

test('Checkbox forwards id, data-* and the aria trio to the input', () => {
  const { container } = render(() => (
    <Checkbox id="f-notify" data-control="" aria-required="true" aria-invalid="true" aria-describedby="d1 d2" />
  ));
  const el = container.firstElementChild!;
  expect(el.id).toBe('f-notify');
  expect(el.hasAttribute('data-control')).toBe(true);
  expect(el.getAttribute('aria-required')).toBe('true');
  expect(el.getAttribute('aria-invalid')).toBe('true');
  expect(el.getAttribute('aria-describedby')).toBe('d1 d2');
});

test('Checkbox REMOVES a forwarded aria attribute when it goes undefined', () => {
  // Decision D-7 replaced an imperative ref+effect with a props spread. A spread that
  // wrote `aria-invalid={false}` would leave the literal string "false" in the DOM,
  // which reads as invalid to a screen reader — the exact bug the effect avoided by
  // calling removeAttribute. Drive a real signal so the reactive path runs.
  const [invalid, setInvalid] = createSignal<'true' | undefined>('true');
  const { container } = render(() => <Checkbox aria-invalid={invalid()} />);
  const el = container.firstElementChild!;
  expect(el.getAttribute('aria-invalid')).toBe('true');
  setInvalid(undefined);
  expect(el.hasAttribute('aria-invalid')).toBe(false);
});

test('Checkbox participates in a real form via name/value', () => {
  // Form participation is the headline reason for the native-input rule, and it is
  // free only if `name` and `value` actually reach the input.
  const { container } = render(() => (
    <form>
      <Checkbox name="envs" value="prod" checked />
      <Checkbox name="envs" value="staging" />
    </form>
  ));
  const form = container.querySelector('form')!;
  expect([...new FormData(form).getAll('envs')]).toEqual(['prod']);
});

test('Checkbox passes `required` through and adds no validation of its own', () => {
  // Scope boundary (plan §4): whether an unchecked box is an error is the app's call.
  // The primitive sets the native attribute and stops — no error class, no aria-invalid.
  const { container } = render(() => <Checkbox required />);
  const el = container.firstElementChild as HTMLInputElement;
  expect(el.required).toBe(true);
  expect(el.hasAttribute('aria-invalid')).toBe(false);
  expect(el.className).toBe('kai-checkbox');
});

// ------------------------------------------------------------- the call sites

test('CheckboxWidget renders the primitive, keeping id / data-control / aria', () => {
  const { container } = render(() => (
    <CheckboxWidget {...widgetProps({ value: true, required: true, invalid: true, describedBy: 'd1' })} />
  ));
  const el = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
  expect(el.classList.contains('kai-checkbox')).toBe(true);
  expect(el.checked).toBe(true);
  expect(el.id).toBe('f-x');
  expect(el.hasAttribute('data-control')).toBe(true);
  expect(el.getAttribute('aria-required')).toBe('true');
  expect(el.getAttribute('aria-invalid')).toBe('true');
  expect(el.getAttribute('aria-describedby')).toBe('d1');
});

test('CheckboxGroupWidget renders one primitive per option and toggles the array', () => {
  const seen: unknown[] = [];
  const { container } = render(() => (
    <CheckboxGroupWidget
      {...widgetProps({
        field: { type: 'array', items: { enum: ['Production', 'Staging', 'Local'] } },
        value: ['Staging'],
        onInput: (v) => seen.push(v),
      })}
    />
  ));
  const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(boxes.length).toBe(3);
  expect(boxes.every((b) => b.classList.contains('kai-checkbox'))).toBe(true);
  expect(boxes.map((b) => b.checked)).toEqual([false, true, false]);
  boxes[0].click();
  expect(seen).toEqual([['Staging', 'Production']]);
});
