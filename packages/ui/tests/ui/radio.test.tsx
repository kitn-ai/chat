import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Radio, RadioGroup } from '../../src/ui/radio';
import { RadioGroupWidget, type WidgetProps } from '../../src/components/form-widgets';

afterEach(() => { document.body.innerHTML = ''; });

function widgetProps(over: Partial<WidgetProps> = {}): WidgetProps {
  return {
    id: 'f-severity',
    value: undefined,
    field: { type: 'string', enum: ['Blocking', 'Degraded', 'Cosmetic'] },
    disabled: false,
    required: false,
    invalid: false,
    label: 'Severity',
    onInput: () => {},
    onBlur: () => {},
    ...over,
  } as WidgetProps;
}

const OPTIONS = [
  { value: 'blocking', label: 'Blocking' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'cosmetic', label: 'Cosmetic' },
];

// ---------------------------------------------------------------- the primitive

test('Radio is a REAL native input, not a div wearing a role', () => {
  const { container } = render(() => <Radio name="g" value="a" />);
  const el = container.firstElementChild as HTMLInputElement;
  expect(el.tagName).toBe('INPUT');
  expect(el.type).toBe('radio');
  expect(el.classList.contains('kai-radio')).toBe(true);
});

test('RadioGroup gives every member the same name — what makes it one control', () => {
  // The shared `name` is not decoration: it is what makes the browser treat the set as
  // a single tab stop with arrow-key navigation and mutual exclusion. jsdom implements
  // the exclusion but not the arrow navigation, so the exclusion is what is asserted
  // here and the arrow behaviour is verified in a real Chromium (see the task report).
  const { container } = render(() => <RadioGroup options={OPTIONS} name="sev" value="degraded" />);
  const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  expect(radios.map((r) => r.name)).toEqual(['sev', 'sev', 'sev']);
  expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
  radios[2].click();
  expect(radios.map((r) => r.checked)).toEqual([false, false, true]);
});

test('RadioGroup mints a name when none is given, so a bare group is still exclusive', () => {
  const { container } = render(() => <RadioGroup options={OPTIONS} />);
  const names = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => r.name);
  expect(new Set(names).size).toBe(1);
  expect(names[0]).not.toBe('');
});

test('RadioGroup is a radiogroup with an accessible name', () => {
  const { container } = render(() => <RadioGroup options={OPTIONS} label="Severity" />);
  const group = container.querySelector('[role="radiogroup"]')!;
  expect(group.getAttribute('aria-label')).toBe('Severity');
});

test('RadioGroup reports the selected value and the option that carried it', () => {
  const seen: unknown[] = [];
  const { container } = render(() => (
    <RadioGroup options={OPTIONS} value="blocking" onChange={(v, o) => seen.push([v, o.label])} />
  ));
  container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click();
  expect(seen).toEqual([['degraded', 'Degraded']]);
});

test('RadioGroup disables the whole group, or one row at a time', () => {
  const { container } = render(() => (
    <RadioGroup options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }]} />
  ));
  const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  expect(radios.map((r) => r.disabled)).toEqual([false, true]);
  document.body.innerHTML = '';

  const { container: c2 } = render(() => (
    <RadioGroup options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} disabled />
  ));
  expect([...c2.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => r.disabled)).toEqual([true, true]);
});

test('RadioGroup forwards id, data-* and the aria trio to the group element', () => {
  const { container } = render(() => (
    <RadioGroup options={OPTIONS} data-control="" aria-required="true" aria-describedby="d1" />
  ));
  const group = container.querySelector('[role="radiogroup"]')!;
  expect(group.hasAttribute('data-control')).toBe(true);
  expect(group.getAttribute('aria-required')).toBe('true');
  expect(group.getAttribute('aria-describedby')).toBe('d1');
});

test('RadioGroup REMOVES a forwarded aria attribute when it goes undefined', () => {
  const [invalid, setInvalid] = createSignal<'true' | undefined>('true');
  const { container } = render(() => <RadioGroup options={OPTIONS} aria-invalid={invalid()} />);
  const group = container.querySelector('[role="radiogroup"]')!;
  expect(group.getAttribute('aria-invalid')).toBe('true');
  setInvalid(undefined);
  expect(group.hasAttribute('aria-invalid')).toBe(false);
});

test('RadioGroup rows are labels, so the whole row is a click target', () => {
  const { container } = render(() => <RadioGroup options={OPTIONS} />);
  const rows = [...container.querySelectorAll('label')];
  expect(rows.length).toBe(3);
  expect(rows.every((r) => r.querySelector('input[type="radio"]') !== null)).toBe(true);
});

test('RadioGroup renders a bare span with no description, and a column with one', () => {
  // The no-description shape is byte-for-byte what the call sites rendered before the
  // primitive existed, which is what makes the migration a provable visual no-op.
  const { container } = render(() => <RadioGroup options={[{ value: 'a', label: 'A' }]} />);
  const row = container.querySelector('label')!;
  expect(row.lastElementChild!.className).toBe('');
  document.body.innerHTML = '';

  const { container: c2 } = render(() => (
    <RadioGroup options={[{ value: 'a', label: 'A', description: 'Pages the on-call' }]} />
  ));
  const row2 = c2.querySelector('label')!;
  expect(row2.lastElementChild!.className).toContain('flex-col');
  expect(row2.textContent).toContain('Pages the on-call');
});

test('RadioGroup presentation slot replaces the label column, keeping the control', () => {
  const { container } = render(() => (
    <RadioGroup options={OPTIONS} value="degraded">
      {(opt, state) => <span data-row={opt.value}>{state.checked ? 'on' : 'off'}</span>}
    </RadioGroup>
  ));
  expect([...container.querySelectorAll('[data-row]')].map((e) => e.textContent)).toEqual(['off', 'on', 'off']);
  // The radios are still real inputs — a presentation slot must not cost the control.
  expect(container.querySelectorAll('input[type="radio"]').length).toBe(3);
});

test('RadioGroup adds no validation of its own', () => {
  // Scope boundary (plan §4): "at least one" is the app's rule, not the kit's.
  const { container } = render(() => <RadioGroup options={OPTIONS} />);
  const group = container.querySelector('[role="radiogroup"]')!;
  expect(group.hasAttribute('aria-invalid')).toBe(false);
  expect([...container.querySelectorAll<HTMLInputElement>('input')].every((r) => !r.required)).toBe(true);
});

// -------------------------------------------------------------- the call site

test('RadioGroupWidget renders the primitive over the schema enum, keeping the hooks', () => {
  const seen: unknown[] = [];
  let blurs = 0;
  const { container } = render(() => (
    <RadioGroupWidget
      {...widgetProps({ value: 'Degraded', required: true, describedBy: 'd1', onInput: (v) => seen.push(v), onBlur: () => { blurs += 1; } })}
    />
  ));
  const group = container.querySelector('[role="radiogroup"]')!;
  expect(group.getAttribute('aria-label')).toBe('Severity');
  expect(group.hasAttribute('data-control')).toBe(true);
  expect(group.getAttribute('aria-required')).toBe('true');
  expect(group.getAttribute('aria-describedby')).toBe('d1');

  const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  expect(radios.map((r) => r.value)).toEqual(['Blocking', 'Degraded', 'Cosmetic']);
  expect(radios.map((r) => r.name)).toEqual(['f-severity', 'f-severity', 'f-severity']);
  expect(radios.map((r) => r.checked)).toEqual([false, true, false]);

  radios[2].click();
  expect(seen).toEqual(['Cosmetic']);
  expect(blurs).toBe(1);
});
