/**
 * Guards for the four form-widget changes that landed together: the group-label a11y
 * fix, `MultiSelectWidget` becoming a checkbox group (decision D-3), and `number` /
 * `taglist` routing through `Input`.
 *
 * WHAT JSDOM CANNOT SEE, STATED SO NOTHING HERE READS AS MORE THAN IT IS. jsdom does no
 * layout and does not load `src/elements/styles.css`, so nothing below proves a label is
 * PAINTED where a sighted user would find it, only that it is a real element with text
 * in the document rather than an `aria-label` string. It also renders no native picker,
 * so the D-3 comparison against `<select multiple>` is about DOM shape, not about how
 * either control feels. The `:focus-visible` ring, the row geometry and the real
 * keyboard pass are done in a browser and reported separately.
 *
 * Accessible NAMES are read out of the accessibility tree with `computeAccessibleName`
 * (the same implementation Testing Library's `getByRole({ name })` uses), never off an
 * attribute — an `aria-label` and an `aria-labelledby` pointing at visible text look
 * identical to an attribute assertion and are the entire difference this file is about.
 */
import { test, expect, afterEach, describe } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { computeAccessibleName } from 'dom-accessibility-api';
import axe from 'axe-core';
import { Form, type FormField } from '../../src/components/form';
import {
  NumberWidget,
  TagListWidget,
  MultiSelectWidget,
  CheckboxGroupWidget,
  type WidgetProps,
} from '../../src/components/form-widgets';

afterEach(() => { document.body.innerHTML = ''; });

const widgetProps = (over: Partial<WidgetProps> = {}): WidgetProps => ({
  id: 'f-envs',
  value: undefined,
  field: { type: 'array', items: { enum: ['prod', 'staging', 'local'] } } as FormField,
  disabled: false,
  required: false,
  invalid: false,
  label: 'Environments',
  onInput: () => {},
  onBlur: () => {},
  ...over,
});

/** Mount a `kai-form` schema in the LIGHT dom (the Solid component, not the facade). */
function renderForm(properties: Record<string, FormField>, required: string[] = []) {
  return render(() => (
    <Form data={{ type: 'object', properties, required }} />
  ));
}

/** The row for one field key, as `FieldRow` stamps it. */
const row = (root: ParentNode, key: string) => root.querySelector(`[data-field="${key}"]`) as HTMLElement;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Every group field has a VISIBLE label, correctly associated.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One case per widget kind that `FieldRow` used to suppress its `<label>` for. The
 * bug: four of the six named themselves with `aria-label` and nothing else, so the
 * text existed only in the accessibility tree.
 *
 * `mechanism` records WHY each kind is the way it is, so a future reader does not
 * "converge" the two that legitimately differ.
 */
const GROUP_KINDS: Array<{
  kind: string;
  key: string;
  field: FormField;
  label: string;
  /** The element that must carry the accessible name. */
  named: (r: HTMLElement) => HTMLElement;
  mechanism: 'row-label' | 'own-legend';
}> = [
  {
    kind: 'radio', key: 'severity', label: 'Severity',
    field: { type: 'string', enum: ['Blocking', 'Cosmetic'] },
    named: (r) => r.querySelector('[role="radiogroup"]') as HTMLElement,
    mechanism: 'row-label',
  },
  {
    kind: 'checkbox-group', key: 'envs', label: 'Envs',
    field: { type: 'array', items: { enum: ['prod', 'staging'] } },
    named: (r) => r.querySelector('[role="group"]') as HTMLElement,
    mechanism: 'row-label',
  },
  {
    kind: 'multiselect', key: 'regions', label: 'Regions',
    // Six options is over the default inlineMax of 4, which is what selects the
    // `multiselect` kind rather than `checkbox-group`.
    field: { type: 'array', items: { enum: ['a', 'b', 'c', 'd', 'e', 'f'] } },
    named: (r) => r.querySelector('[role="group"]') as HTMLElement,
    mechanism: 'row-label',
  },
  {
    kind: 'taglist', key: 'tags', label: 'Tags',
    field: { type: 'array', items: { type: 'string' } },
    named: (r) => r.querySelector('[role="group"]') as HTMLElement,
    mechanism: 'row-label',
  },
  {
    kind: 'fieldset', key: 'contact', label: 'Contact',
    field: { type: 'object', properties: { name: { type: 'string' } } },
    named: (r) => r.querySelector('fieldset') as HTMLElement,
    mechanism: 'own-legend',
  },
  {
    kind: 'repeater', key: 'steps', label: 'Steps',
    field: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' } } } },
    named: (r) => r.querySelector('fieldset') as HTMLElement,
    mechanism: 'own-legend',
  },
];

describe('every grouped field kind has a VISIBLE label', () => {
  for (const c of GROUP_KINDS) {
    test(`${c.kind}: the name comes from text in the document, not from an aria-label`, () => {
      const { container } = renderForm({ [c.key]: { ...c.field, title: c.label } });
      const r = row(container, c.key);
      const named = c.named(r);
      expect(named, `no group element rendered for ${c.kind}`).not.toBeNull();

      // (a) The name is what a screen reader announces.
      expect(computeAccessibleName(named)).toBe(c.label);

      // (b) And it is VISIBLE: a real element carrying that text, not an attribute.
      //     This is the whole defect. `aria-label` would pass (a) and fail here.
      expect(named.hasAttribute('aria-label')).toBe(false);
      const visible = [...r.querySelectorAll('label, legend')].filter((e) => e.textContent?.trim().startsWith(c.label));
      expect(visible.length, `${c.kind} has no visible element carrying "${c.label}"`).toBeGreaterThan(0);

      // (c) The text appears ONCE. A row label plus a legend would print it twice.
      const shown = [...r.querySelectorAll('label, legend')].filter((e) => e.textContent?.trim().replace(/\s*\*$/, '') === c.label);
      expect(shown.length).toBe(1);
      expect(shown[0].tagName.toLowerCase()).toBe(c.mechanism === 'own-legend' ? 'legend' : 'label');
    });
  }
});

test('the group-naming label is not silently ALSO a broken <label for>', () => {
  // A `<label for>` pointing at an id no labelable control owns names nothing. The
  // three kinds with no single control drop `for`; taglist keeps it, because its draft
  // <input> really does carry the row id and a native association beats an ARIA one.
  const { container } = renderForm({
    severity: { type: 'string', enum: ['a', 'b'], title: 'Severity' },
    tags: { type: 'array', items: { type: 'string' }, title: 'Tags' },
  });
  const radioLabel = row(container, 'severity').querySelector('label') as HTMLLabelElement;
  expect(radioLabel.hasAttribute('for')).toBe(false);

  const tagLabel = row(container, 'tags').querySelector('label') as HTMLLabelElement;
  const target = document.getElementById(tagLabel.getAttribute('for') as string);
  expect(target).not.toBeNull();
  expect(target!.tagName.toLowerCase()).toBe('input');
  expect(computeAccessibleName(target as HTMLElement)).toBe('Tags');
});

test('the required marker rides the group label too, and stays hidden from AT', () => {
  const { container } = renderForm({ envs: { type: 'array', items: { enum: ['a', 'b'] }, title: 'Envs' } }, ['envs']);
  const r = row(container, 'envs');
  const label = r.querySelector('label') as HTMLElement;
  expect(label.textContent).toContain('*');
  expect(label.querySelector('[aria-hidden="true"]')).not.toBeNull();
  // The asterisk must not leak into the announced name; `required` travels as ARIA.
  expect(computeAccessibleName(r.querySelector('[role="group"]') as HTMLElement)).toBe('Envs');
  expect(r.querySelector('[role="group"]')!.getAttribute('aria-required')).toBe('true');
});

test('axe finds no ARIA violations across a form holding all six group kinds', async () => {
  const props: Record<string, FormField> = {};
  for (const c of GROUP_KINDS) props[c.key] = { ...c.field, title: c.label };
  const { container } = renderForm(props);
  const results = await axe.run(container, {
    runOnly: { type: 'rule', values: ['aria-roles', 'aria-valid-attr-value', 'aria-allowed-attr', 'label', 'form-field-multiple-labels'] },
  });
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. D-3: MultiSelectWidget is a checkbox group now.
// ─────────────────────────────────────────────────────────────────────────────

test('MultiSelectWidget is a CheckboxGroup, not a <select multiple> (decision D-3)', () => {
  const { container } = render(() => (
    <MultiSelectWidget {...widgetProps({ value: ['prod', 'local'] })} />
  ));
  // The control that replaced it. `<select multiple>` is gone from this widget.
  expect(container.querySelector('select')).toBeNull();
  const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(boxes.map((b) => b.value)).toEqual(['prod', 'staging', 'local']);
  expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
  expect(container.querySelector('[role="group"]')!.hasAttribute('data-control')).toBe(true);
});

test('MultiSelectWidget still reports EVERY selection, in the schema\'s own types', () => {
  const seen: unknown[] = [];
  let blurs = 0;
  const { container } = render(() => (
    <MultiSelectWidget {...widgetProps({ value: ['prod'], onInput: (v) => seen.push(v), onBlur: () => { blurs += 1; } })} />
  ));
  const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  boxes[2].click();
  expect(seen).toEqual([['prod', 'local']]);
  expect(blurs).toBe(1);
});

test('MultiSelectWidget caps its HEIGHT, never its option list', () => {
  // A long list is why this kind exists at all. The scroll cap is presentation; every
  // option is still rendered, which is the line between styling and a silent drop.
  const enum10 = Array.from({ length: 10 }, (_, i) => `opt${i}`);
  const { container } = render(() => (
    <MultiSelectWidget {...widgetProps({ field: { type: 'array', items: { enum: enum10 } } as FormField })} />
  ));
  expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(10);
  const group = container.querySelector('[role="group"]') as HTMLElement;
  expect(group.className).toContain('overflow-y-auto');
  expect(group.className).toMatch(/max-h-/);
});

test('CheckboxGroupWidget renders no scroll cap — that is the multiselect variant only', () => {
  const { container } = render(() => <CheckboxGroupWidget {...widgetProps()} />);
  expect((container.querySelector('[role="group"]') as HTMLElement).className).not.toContain('overflow-y-auto');
});

test('the migrated multiselect participates in a native form through FormData', () => {
  // What `<select multiple>` gave for free and a hand-rolled list would have lost.
  const { container } = render(() => (
    <form><MultiSelectWidget {...widgetProps({ value: ['staging'] })} /></form>
  ));
  expect(new FormData(container.querySelector('form') as HTMLFormElement).getAll('f-envs')).toEqual(['staging']);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Step 6: number and taglist route through `Input`.
// ─────────────────────────────────────────────────────────────────────────────

const numberProps = (over: Partial<WidgetProps> = {}) =>
  widgetProps({ id: 'f-count', label: 'Count', field: { type: 'integer' } as FormField, ...over });

test('NumberWidget keeps the SAME input node when `invalid` flips', () => {
  // The focus-node-reuse property `ui/input.tsx:262-268` documents. `kai-form` derives
  // `invalid` from the field's own value, so this flip happens on every keystroke that
  // crosses a validity boundary.
  //
  // HONEST LIMIT, MEASURED. This does NOT demonstrate that the migration fixed a live
  // bug here: reverting `NumberWidget` to its raw `<input class={cn(inputBase, invalid
  // && …)}>` leaves this test GREEN. The rebuild the fix is about happened inside
  // `Input`, where the class was evaluated in a `<Show>` fallback's memo; a class
  // expression written directly on a JSX element in the widget compiles to a nested
  // effect on the EXISTING node and never had the problem. What the migration buys is
  // one owner of the field shell and the masking, and this guard is a call-site pin
  // that the widget keeps `Input`'s guarantee — `tests/ui/input-node-identity.test.tsx`
  // owns the primitive's side of it.
  const [invalid, setInvalid] = createSignal(false);
  const props = numberProps();
  const { container } = render(() => (
    <NumberWidget {...props} invalid={invalid()} />
  ));
  const before = container.querySelector('input') as HTMLInputElement;
  before.focus();
  expect(document.activeElement).toBe(before);

  setInvalid(true);

  const after = container.querySelector('input') as HTMLInputElement;
  expect(after, 'the invalid flip rebuilt the input node').toBe(before);
  expect(document.activeElement, 'focus did not survive the invalid flip').toBe(before);
  expect(after.className).toContain('border-destructive');
});

test('NumberWidget forwards the schema bounds and invents none', () => {
  // Scope boundary (plan §4): min/max come from the consumer's schema or not at all.
  const { container } = render(() => (
    <NumberWidget {...numberProps({ field: { type: 'integer' } as FormField })} />
  ));
  const el = container.querySelector('input') as HTMLInputElement;
  expect(el.type).toBe('number');
  expect(el.hasAttribute('min')).toBe(false);
  expect(el.hasAttribute('max')).toBe(false);
  expect(el.getAttribute('step')).toBe('1');
  expect(el.hasAttribute('data-control')).toBe(true);
  document.body.innerHTML = '';

  const { container: c2 } = render(() => (
    <NumberWidget {...numberProps({ field: { type: 'number', minimum: 2, maximum: 9 } as FormField })} />
  ));
  const el2 = c2.querySelector('input') as HTMLInputElement;
  expect([el2.getAttribute('min'), el2.getAttribute('max')]).toEqual(['2', '9']);
  expect(el2.hasAttribute('step')).toBe(false);
});

test('NumberWidget still reports keystrokes and commits on blur', () => {
  const seen: unknown[] = [];
  let blurs = 0;
  const { container } = render(() => (
    <NumberWidget {...numberProps({ onInput: (v) => seen.push(v), onBlur: () => { blurs += 1; } })} />
  ));
  const el = container.querySelector('input') as HTMLInputElement;
  el.value = '42';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur'));
  expect(seen).toEqual(['42']);
  expect(blurs).toBe(1);
});

const tagProps = (over: Partial<WidgetProps> = {}) =>
  widgetProps({ id: 'f-tags', label: 'Tags', field: { type: 'array', items: { type: 'string' } } as FormField, ...over });

test('TagListWidget renders its draft field through `Input`, keeping the row hooks', () => {
  const { container } = render(() => <TagListWidget {...tagProps({ describedBy: 'd1', required: true })} />);
  const el = container.querySelector('input[type="text"]') as HTMLInputElement;
  expect(el.id).toBe('f-tags');
  expect(el.hasAttribute('data-control')).toBe(true);
  expect(el.getAttribute('aria-describedby')).toBe('d1');
  expect(el.getAttribute('aria-required')).toBe('true');
  // `Input`'s field shell, which is what routing through it buys.
  expect(el.className).toContain('rounded-md');
  expect(el.getAttribute('part')).toBe('field input');
});

test('TagListWidget remove controls are Buttons with a per-tag accessible name', () => {
  // A bare "✕" glyph is what a screen reader falls back to when nothing names the
  // control, and three of them in a row are indistinguishable.
  const { container } = render(() => <TagListWidget {...tagProps({ value: ['bug', 'ui'] })} />);
  const removes = [...container.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label')?.startsWith('Remove'));
  expect(removes.map((b) => computeAccessibleName(b))).toEqual(['Remove bug', 'Remove ui']);
  // No naked glyph left in the accessible name or the markup.
  expect(container.textContent).not.toContain('✕');
  expect(removes.every((b) => b.querySelector('svg')?.getAttribute('aria-hidden') === 'true')).toBe(true);
  // Real Buttons, not raw <button>s: the kit's focus ring rides the variant classes.
  expect(removes.every((b) => b.className.includes('focus-visible:ring-2'))).toBe(true);
});

test('TagListWidget Add button is a Button and still adds on Enter', () => {
  const seen: unknown[] = [];
  const { container } = render(() => <TagListWidget {...tagProps({ value: ['bug'], onInput: (v) => seen.push(v) })} />);
  const add = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add') as HTMLButtonElement;
  expect(add.className).toContain('focus-visible:ring-2');

  const el = container.querySelector('input[type="text"]') as HTMLInputElement;
  el.value = 'ui';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(seen).toEqual([['bug', 'ui']]);
});

test('TagListWidget imposes no cap on how many tags may be added', () => {
  // Scope boundary (plan §4): how many is too many lands in a policy document.
  const many = Array.from({ length: 40 }, (_, i) => `t${i}`);
  const seen: unknown[] = [];
  const { container } = render(() => <TagListWidget {...tagProps({ value: many, onInput: (v) => seen.push(v) })} />);
  const el = container.querySelector('input[type="text"]') as HTMLInputElement;
  expect(el.disabled).toBe(false);
  el.value = 'one-more';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect((seen[0] as string[]).length).toBe(41);
});
