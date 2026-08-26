/**
 * Guards for the `CheckboxGroup` primitive — `RadioGroup`'s sibling.
 *
 * WHAT JSDOM CANNOT SEE, STATED SO NOTHING HERE READS AS MORE THAN IT IS. jsdom does no
 * layout and does not load `src/elements/styles.css`, so nothing below proves the rows
 * LOOK right, that `.kai-checkbox` painted a box, or that the divided list has borders.
 * What these pin is real in a DOM with no CSS at all: that every row is a REAL
 * `<input type="checkbox">` inside a `<label>`, that the option list is rendered in
 * full and in order, that selection is matched by identity, that the group participates
 * in a native form through `FormData`, and that props forwarding does not stamp a lying
 * `aria-invalid`. The computed-style proof is done in a real browser and reported
 * separately.
 */
import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { computeAccessibleName } from 'dom-accessibility-api';
import { CheckboxGroup, type CheckboxOption } from '../../src/ui/checkbox-group';

afterEach(() => { document.body.innerHTML = ''; });

const ENVS: CheckboxOption[] = [
  { value: 'prod', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'local', label: 'Local' },
];

const boxes = (root: ParentNode) => [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

test('CheckboxGroup renders one real checkbox per option, in order, untruncated', () => {
  const { container } = render(() => <CheckboxGroup options={ENVS} />);
  expect(boxes(container).map((b) => b.value)).toEqual(['prod', 'staging', 'local']);
  // A real input, never a div wearing role="checkbox".
  expect(container.querySelectorAll('[role="checkbox"]').length).toBe(0);
  expect(container.querySelector('[role="group"]')).not.toBeNull();
});

test('CheckboxGroup checks by IDENTITY, so a numeric enum survives the round trip', () => {
  const opts: CheckboxOption<number>[] = [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }];
  const seen: number[][] = [];
  const { container } = render(() => (
    <CheckboxGroup<number> options={opts} value={[2]} onChange={(next) => seen.push(next)} />
  ));
  expect(boxes(container).map((b) => b.checked)).toEqual([false, true]);
  boxes(container)[0].click();
  // The NUMBER 1, not the string "1" the DOM value would have given.
  expect(seen).toEqual([[2, 1]]);
  expect(typeof seen[0][1]).toBe('number');
});

test('CheckboxGroup unchecking removes just that value and keeps the rest', () => {
  const seen: string[][] = [];
  const { container } = render(() => (
    <CheckboxGroup options={ENVS} value={['prod', 'staging']} onChange={(next) => seen.push(next)} />
  ));
  boxes(container)[0].click();
  expect(seen).toEqual([['staging']]);
});

test('CheckboxGroup reports which option moved and which way', () => {
  const moves: Array<[string, boolean]> = [];
  const { container } = render(() => (
    <CheckboxGroup options={ENVS} value={['prod']} onChange={(_n, opt, checked) => moves.push([opt.value, checked])} />
  ));
  boxes(container)[1].click();
  boxes(container)[0].click();
  expect(moves).toEqual([['staging', true], ['prod', false]]);
});

test('CheckboxGroup participates in a native form: FormData.getAll reads the selection', () => {
  // The whole reason the rows are real inputs. A hand-rolled control submits nothing.
  const { container } = render(() => (
    <form>
      <CheckboxGroup options={ENVS} name="env" value={['prod', 'local']} />
    </form>
  ));
  const data = new FormData(container.querySelector('form') as HTMLFormElement);
  expect(data.getAll('env')).toEqual(['prod', 'local']);
});

test('CheckboxGroup sets NO name when none is given, rather than inventing one', () => {
  // Deliberately unlike RadioGroup, which generates a name because the browser needs a
  // shared one to make a radio set exclusive. A generated name here would submit the
  // selection under a random key, which is worse than submitting nothing.
  const { container } = render(() => <CheckboxGroup options={ENVS} />);
  expect(boxes(container).every((b) => !b.hasAttribute('name'))).toBe(true);
});

test('CheckboxGroup disables every row, and one row alone', () => {
  const { container } = render(() => (
    <CheckboxGroup options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }]} />
  ));
  expect(boxes(container).map((b) => b.disabled)).toEqual([false, true]);
  document.body.innerHTML = '';

  const { container: c2 } = render(() => <CheckboxGroup options={ENVS} disabled />);
  expect(boxes(c2).every((b) => b.disabled)).toBe(true);
});

test('CheckboxGroup forwards id, data-* and the aria trio to the group element', () => {
  const { container } = render(() => (
    <CheckboxGroup options={ENVS} id="g1" data-control="" aria-required="true" aria-describedby="d1" />
  ));
  const group = container.querySelector('[role="group"]')!;
  expect(group.id).toBe('g1');
  expect(group.hasAttribute('data-control')).toBe(true);
  expect(group.getAttribute('aria-required')).toBe('true');
  expect(group.getAttribute('aria-describedby')).toBe('d1');
});

test('CheckboxGroup REMOVES a forwarded aria attribute when it goes undefined', () => {
  // The trap: a spread that writes `aria-invalid={false}` leaves the STRING "false",
  // which reads as invalid. `undefined` is what makes Solid call removeAttribute.
  const [invalid, setInvalid] = createSignal<'true' | undefined>('true');
  const { container } = render(() => <CheckboxGroup options={ENVS} aria-invalid={invalid()} />);
  const group = container.querySelector('[role="group"]')!;
  expect(group.getAttribute('aria-invalid')).toBe('true');
  setInvalid(undefined);
  expect(group.hasAttribute('aria-invalid')).toBe(false);
});

test('CheckboxGroup rows are labels, so the whole row is a click target and names the box', () => {
  const { container } = render(() => <CheckboxGroup options={ENVS} />);
  const rows = [...container.querySelectorAll('label')];
  expect(rows.length).toBe(3);
  expect(rows.every((r) => r.querySelector('input[type="checkbox"]') !== null)).toBe(true);
  // Read out of the accessibility tree, not off an attribute: the wrapping <label> is
  // the entire accessible name here and no ARIA is involved.
  expect(boxes(container).map((b) => computeAccessibleName(b))).toEqual(['Production', 'Staging', 'Local']);
});

test('CheckboxGroup renders a bare span with no description, and a column with one', () => {
  // The no-description shape is byte for byte what CheckboxGroupWidget rendered before
  // this component existed, which is what makes that migration a visual no-op.
  const { container } = render(() => <CheckboxGroup options={[{ value: 'a', label: 'A' }]} />);
  expect(container.querySelector('label')!.lastElementChild!.className).toBe('');
  document.body.innerHTML = '';

  const { container: c2 } = render(() => (
    <CheckboxGroup options={[{ value: 'a', label: 'A', description: 'Ships on merge' }]} />
  ));
  const row = c2.querySelector('label')!;
  expect(row.lastElementChild!.className).toContain('flex-col');
  expect(row.textContent).toContain('Ships on merge');
});

test('CheckboxGroup presentation slot replaces the label column, keeping the control', () => {
  const { container } = render(() => (
    <CheckboxGroup options={ENVS} value={['staging']}>
      {(opt, state) => <span data-row={opt.value}>{state.checked ? 'on' : 'off'}</span>}
    </CheckboxGroup>
  ));
  expect([...container.querySelectorAll('[data-row]')].map((e) => e.textContent)).toEqual(['off', 'on', 'off']);
  expect(boxes(container).length).toBe(3);
});

test('CheckboxGroup adds no validation of its own', () => {
  // Scope boundary (plan §4): "at least one" is the app's rule, not the kit's.
  const { container } = render(() => <CheckboxGroup options={ENVS} />);
  expect(container.querySelector('[role="group"]')!.hasAttribute('aria-invalid')).toBe(false);
  expect(boxes(container).every((b) => !b.required)).toBe(true);
});

test('CheckboxGroup names the group from `label`, reachable in the accessibility tree', () => {
  const { container } = render(() => <CheckboxGroup options={ENVS} label="Environments" />);
  const group = container.querySelector('[role="group"]') as HTMLElement;
  expect(computeAccessibleName(group)).toBe('Environments');
});
