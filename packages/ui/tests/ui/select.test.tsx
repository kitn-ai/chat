/**
 * Guards for the `Select` primitive and its two migrated call sites.
 *
 * WHAT JSDOM CANNOT SEE, STATED SO NOTHING HERE READS AS MORE THAN IT IS. jsdom does no
 * layout, does not load `src/elements/styles.css` and never renders a native dropdown,
 * so nothing below proves the select LOOKS right, that the chevron sits over the box,
 * or that `appearance: none` suppressed the OS arrow. What these pin is the part that
 * is real in a DOM with no CSS at all: that the control is a NATIVE `<select>` rather
 * than a hand-built listbox, that the option list is rendered in FULL and in order,
 * that selection is matched by identity, that the chevron is inert and hidden from
 * assistive tech, and that props forwarding does not stamp a lying `aria-invalid`.
 * The computed-style proof and the real dropdown/type-ahead behaviour are done in a
 * real Chromium against the same stories, and reported separately.
 */
import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Select } from '../../src/ui/select';
import { SelectWidget, type WidgetProps } from '../../src/components/form-widgets';

afterEach(() => { document.body.innerHTML = ''; });

const MODELS = [
  { value: 'opus', label: 'Claude Opus' },
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'haiku', label: 'Claude Haiku' },
];

const labels = (el: HTMLSelectElement) => [...el.options].map((o) => o.textContent);
const values = (el: HTMLSelectElement) => [...el.options].map((o) => o.value);

function widgetProps(over: Partial<WidgetProps> = {}): WidgetProps {
  return {
    id: 'f-x',
    value: undefined,
    field: { type: 'string', enum: ['low', 'medium', 'high'] },
    disabled: false,
    required: false,
    invalid: false,
    label: 'Severity',
    onInput: () => {},
    onBlur: () => {},
    ...over,
  } as WidgetProps;
}

// ---------------------------------------------------------------- the primitive

test('Select is a REAL native select, not a hand-built listbox', () => {
  // The plan is explicit that native is the choice: it is what keeps the platform
  // picker on mobile, type-ahead on desktop, form participation and the OS
  // accessibility tree. A `<div role="listbox">` would satisfy a naive assertion.
  const { container } = render(() => <Select options={MODELS} />);
  const el = container.querySelector('select')!;
  expect(el).toBeTruthy();
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  // `appearance-none` is what suppresses the OS arrow so the kit chevron is not a
  // SECOND arrow. jsdom cannot compute it, so pin the class that carries it.
  expect(el.classList.contains('appearance-none')).toBe(true);
});

test('Select renders the option list in FULL and in order', () => {
  // Plan §4: the kit must not truncate, re-order or de-duplicate a consumer's options.
  // Duplicates included on purpose: silently collapsing them would be a silent drop.
  const dupes = [{ value: 'a' }, { value: 'b' }, { value: 'a' }, { value: 'c' }];
  const { container } = render(() => <Select options={dupes} />);
  expect(values(container.querySelector('select')!)).toEqual(['a', 'b', 'a', 'c']);
});

test('Select labels default to the value and are not required', () => {
  const { container } = render(() => <Select options={[{ value: 'opus' }, { value: 'x', label: 'Extra' }]} />);
  expect(labels(container.querySelector('select')!)).toEqual(['opus', 'Extra']);
});

test('Select matches the selection by IDENTITY, not by string form', () => {
  // A JSON-Schema enum of numbers reaches this component as numbers. `String(value)`
  // lands on the option's DOM value, but the comparison stays on the original, which
  // is what the pre-migration `props.value === opt` did.
  const { container } = render(() => <Select<number> options={[{ value: 1 }, { value: 2 }]} value={2} />);
  expect((container.querySelector('select') as HTMLSelectElement).value).toBe('2');
});

test('Select renders a placeholder row ONLY when given one, and never invents wording', () => {
  const { container } = render(() => (
    <>
      <Select options={MODELS} />
      <Select options={MODELS} placeholder="Choose a model…" />
    </>
  ));
  const [bare, withPlaceholder] = [...container.querySelectorAll('select')];
  expect(values(bare)).toEqual(['opus', 'sonnet', 'haiku']);
  expect(labels(withPlaceholder)![0]).toBe('Choose a model…');
  expect(withPlaceholder.options[0].value).toBe('');
  expect(withPlaceholder.options[0].disabled).toBe(true);
});

test('Select keeps the placeholder selected while nothing is chosen', () => {
  // The placeholder is DISABLED, and a browser skips disabled options when picking a
  // default. Without an explicit `selected` the control would show the first real
  // option while the caller's state said nothing was chosen.
  const { container } = render(() => <Select options={MODELS} placeholder="Choose…" />);
  expect((container.querySelector('select') as HTMLSelectElement).selectedIndex).toBe(0);
});

test('Select treats an EMPTY ARRAY as nothing-chosen too', () => {
  const { container } = render(() => <Select options={MODELS} placeholder="Choose…" value={[]} />);
  expect((container.querySelector('select') as HTMLSelectElement).selectedIndex).toBe(0);
});

test('Select accepts an array selection for a multiple select', () => {
  const { container } = render(() => <Select multiple options={MODELS} value={['opus', 'haiku']} />);
  const el = container.querySelector('select') as HTMLSelectElement;
  expect([...el.selectedOptions].map((o) => o.value)).toEqual(['opus', 'haiku']);
});

test('Select draws the chevron on the closed control and NOT on a list box', () => {
  const { container } = render(() => (
    <>
      <Select options={MODELS} />
      <Select multiple options={MODELS} />
    </>
  ));
  const [single, multi] = [...container.children];
  expect(single.querySelector('svg')).toBeTruthy();
  // A `multiple` select has no closed state for a chevron to point at, and
  // `appearance: none` on the platform list box buys nothing.
  expect(multi.querySelector('svg')).toBeNull();
  expect(multi.querySelector('select')!.classList.contains('appearance-none')).toBe(false);
});

test('Select chevron is inert and hidden from assistive tech', () => {
  // If it were focusable, announced, or ate the click, it would be a defect in exactly
  // the layer this component exists to own.
  const { container } = render(() => <Select options={MODELS} />);
  const svg = container.querySelector('svg')!;
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(svg.classList.contains('pointer-events-none')).toBe(true);
});

test('Select accepts raw children for lists a flat array cannot express', () => {
  const { container } = render(() => (
    <Select value="us-west">
      <optgroup label="Americas">
        <option value="us-east">us-east-1</option>
        <option value="us-west">us-west-2</option>
      </optgroup>
    </Select>
  ));
  const el = container.querySelector('select') as HTMLSelectElement;
  expect(el.querySelector('optgroup')).toBeTruthy();
  expect(el.value).toBe('us-west');
});

test('Select invalid state matches the shared field constant, not a second copy', async () => {
  // `docs/coupling-map.md` §4: the destructive border is Input's string, imported, so
  // a select and a text field in one form cannot drift into two error looks.
  const { FIELD_INVALID } = await import('../../src/ui/input');
  const { container } = render(() => <Select options={MODELS} invalid />);
  const el = container.querySelector('select')!;
  for (const cls of FIELD_INVALID.split(' ')) expect(el.classList.contains(cls)).toBe(true);
});

test('Select forwards id, name, required, data-* and the aria trio to the select', () => {
  const { container } = render(() => (
    <Select options={MODELS} id="f-model" name="model" required data-control="" aria-required="true" aria-invalid="true" aria-describedby="d1 d2" />
  ));
  const el = container.querySelector('select')!;
  expect(el.id).toBe('f-model');
  expect(el.getAttribute('name')).toBe('model');
  expect(el.hasAttribute('required')).toBe(true);
  expect(el.hasAttribute('data-control')).toBe(true);
  expect(el.getAttribute('aria-required')).toBe('true');
  expect(el.getAttribute('aria-invalid')).toBe('true');
  expect(el.getAttribute('aria-describedby')).toBe('d1 d2');
});

test('Select REMOVES a forwarded aria attribute when it goes undefined', () => {
  // Decision D-7's named trap: a spread that wrote `aria-invalid={false}` leaves the
  // literal string "false" in the DOM, which reads as INVALID to a screen reader.
  const [invalid, setInvalid] = createSignal<'true' | undefined>('true');
  const { container } = render(() => <Select options={MODELS} aria-invalid={invalid()} />);
  const el = container.querySelector('select')!;
  expect(el.getAttribute('aria-invalid')).toBe('true');
  setInvalid(undefined);
  expect(el.hasAttribute('aria-invalid')).toBe(false);
});

// ---------------------------------------------------------------- the call sites

test('SelectWidget renders the primitive with the same option set as before', () => {
  const { container } = render(() => <SelectWidget {...widgetProps({ value: 'medium' })} />);
  const el = container.querySelector('select') as HTMLSelectElement;
  expect(el.id).toBe('f-x');
  expect(el.hasAttribute('data-control')).toBe(true);
  // Placeholder row first, then the schema enum, unchanged and untruncated.
  expect(values(el)).toEqual(['', 'low', 'medium', 'high']);
  expect(el.value).toBe('medium');
});

test('SelectWidget keeps its own "Select…" wording, which the primitive does not own', () => {
  // A schema-driven field has nowhere else to get placeholder text, so the default
  // stays in the widget. The primitive renders no placeholder row unless given one.
  const { container } = render(() => <SelectWidget {...widgetProps()} />);
  expect(container.querySelector('select')!.options[0].textContent).toBe('Select…');
});

test('SelectWidget prefers an explicit placeholder over its default', () => {
  const { container } = render(() => <SelectWidget {...widgetProps({ placeholder: 'Pick a severity' })} />);
  expect(container.querySelector('select')!.options[0].textContent).toBe('Pick a severity');
});

test('SelectWidget reports the chosen value and commits in one go', () => {
  const seen: unknown[] = [];
  let blurred = 0;
  const { container } = render(() => (
    <SelectWidget {...widgetProps({ onInput: (v) => seen.push(v), onBlur: () => { blurred += 1; } })} />
  ));
  const el = container.querySelector('select') as HTMLSelectElement;
  el.value = 'high';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  expect(seen).toEqual(['high']);
  expect(blurred).toBe(1);
});

// The two `MultiSelectWidget` guards that used to live here are GONE, not silently
// dropped: decision D-3 was ruled and the widget is a `CheckboxGroup` now, not a
// `<select multiple>`. Its coverage moved to `tests/components/form-group-controls.test.tsx`
// beside the checkbox-group it became.
