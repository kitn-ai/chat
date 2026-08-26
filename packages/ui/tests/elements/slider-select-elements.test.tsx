/**
 * Guards for the `<kai-slider>` and `<kai-select>` facades.
 *
 * WHAT JSDOM CANNOT SEE. No layout, no element stylesheet applied to the shadow root,
 * and no native dropdown: nothing here proves either element LOOKS right. What it pins
 * is the facade contract that is real without CSS — the `kai-` prefix, array props as
 * JS PROPERTIES, non-bubbling `kai-*` events, the property/attribute reflection round
 * trip, and the specific failure mode both of these state-lifting facades share: an
 * attr⇄prop feedback loop, or a host write that fires a change event back at the host
 * that made it. The look is verified in a real Chromium and reported separately.
 */
import { test, expect } from 'vitest';
import '../../src/elements/slider';
import '../../src/elements/select';

/** Let the element upgrade and its first effects flush. */
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

async function mount<T extends HTMLElement>(tag: string, attrs: Record<string, string> = {}): Promise<T> {
  const el = document.createElement(tag) as T;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await settle();
  return el;
}

// ---------------------------------------------------------------- kai-slider

test('kai-slider renders a real native range input inside its shadow root', async () => {
  const el = await mount('kai-slider', { min: '0', max: '100', value: '40', label: 'Temperature' });
  const input = el.shadowRoot!.querySelector('input[type="range"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  expect(input.classList.contains('kai-range')).toBe(true);
  expect(input.getAttribute('aria-label')).toBe('Temperature');
  expect(input.style.getPropertyValue('--kai-range-fill')).toBe('40%');
  el.remove();
});

test('kai-slider value reads back live and a host write fires NO event', async () => {
  const el = await mount<HTMLElement & { value: number }>('kai-slider', { min: '0', max: '100', value: '10' });
  const seen: string[] = [];
  el.addEventListener('kai-input', () => seen.push('input'));
  el.addEventListener('kai-change', () => seen.push('change'));

  expect(el.value).toBe(10);
  el.value = 70;
  await settle();
  expect(el.value).toBe(70);
  // Reflected, so `:host([value])` sees live state.
  expect(el.getAttribute('value')).toBe('70');
  // The host already knows what it set; echoing it back is noise, and the write-back
  // the reflect effect triggers must not turn into a second event either.
  expect(seen).toEqual([]);
  el.remove();
});

test('kai-slider fires kai-input while dragging and kai-change on commit', async () => {
  const el = await mount<HTMLElement & { value: number }>('kai-slider', { min: '0', max: '100', value: '10' });
  const detail: Array<[string, number]> = [];
  el.addEventListener('kai-input', (e) => detail.push(['kai-input', (e as CustomEvent).detail.value]));
  el.addEventListener('kai-change', (e) => detail.push(['kai-change', (e as CustomEvent).detail.value]));

  const input = el.shadowRoot!.querySelector('input[type="range"]') as HTMLInputElement;
  input.value = '55';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  await settle();

  expect(detail).toEqual([['kai-input', 55], ['kai-change', 55]]);
  expect(el.value).toBe(55);
  el.remove();
});

test('kai-slider events do not bubble, per the kai- contract', async () => {
  const el = await mount('kai-slider', { min: '0', max: '100' });
  let bubbled = 0;
  document.addEventListener('kai-input', () => { bubbled += 1; });
  const input = el.shadowRoot!.querySelector('input[type="range"]') as HTMLInputElement;
  input.value = '80';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await settle();
  expect(bubbled).toBe(0);
  el.remove();
});

test('kai-slider is inert while disabled', async () => {
  const el = await mount<HTMLElement & { value: number }>('kai-slider', { min: '0', max: '100', value: '10', disabled: '' });
  let fired = 0;
  el.addEventListener('kai-input', () => { fired += 1; });
  const input = el.shadowRoot!.querySelector('input[type="range"]') as HTMLInputElement;
  expect(input.disabled).toBe(true);
  input.value = '90';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await settle();
  expect(fired).toBe(0);
  expect(el.value).toBe(10);
  el.remove();
});

test('kai-slider with no bounds falls back to the NATIVE range defaults', async () => {
  // Not an invented kit default: 0..100 is exactly what a bare `<input type="range">`
  // gives an author who wrote neither attribute.
  const el = await mount('kai-slider');
  const input = el.shadowRoot!.querySelector('input[type="range"]') as HTMLInputElement;
  expect(input.getAttribute('min')).toBe('0');
  expect(input.getAttribute('max')).toBe('100');
  expect(input.style.getPropertyValue('--kai-range-fill')).toBe('50%');
  el.remove();
});

test('kai-slider value-label ATTRIBUTE renders the raw number', async () => {
  const el = await mount('kai-slider', { min: '0', max: '100', value: '40', 'value-label': '' });
  const span = el.shadowRoot!.querySelector('span')!;
  expect(span.textContent).toBe('40');
  expect(span.getAttribute('aria-hidden')).toBe('true');
  el.remove();
});

test('kai-slider valueLabel PROPERTY accepts a formatter an attribute could not carry', async () => {
  // A function is not a scalar, so this half is property-only. Same prop NAME on both
  // layers, because a second name for the same idea is a second thing to document.
  const el = await mount<HTMLElement & { valueLabel: (v: number) => string }>(
    'kai-slider', { min: '0', max: '100', value: '60' },
  );
  el.valueLabel = (v) => `${v}%`;
  await settle();
  expect(el.shadowRoot!.querySelector('span')!.textContent).toBe('60%');
  el.remove();
});

test('kai-slider without value-label renders no readout at all', async () => {
  const el = await mount('kai-slider', { min: '0', max: '100', value: '40' });
  expect(el.shadowRoot!.querySelector('span')).toBeNull();
  el.remove();
});

test('kai-slider readout follows a host-driven value change', async () => {
  const el = await mount<HTMLElement & { value: number }>(
    'kai-slider', { min: '0', max: '100', value: '40', 'value-label': '' },
  );
  expect(el.shadowRoot!.querySelector('span')!.textContent).toBe('40');
  el.value = 90;
  await settle();
  expect(el.shadowRoot!.querySelector('span')!.textContent).toBe('90');
  el.remove();
});

test('kai-slider focus() reaches the inner input', async () => {
  const el = await mount<HTMLElement & { focus: () => void }>('kai-slider', { min: '0', max: '100' });
  el.focus();
  expect(el.shadowRoot!.activeElement).toBe(el.shadowRoot!.querySelector('input[type="range"]'));
  el.remove();
});

// ---------------------------------------------------------------- kai-select

test('kai-select renders a real native select and takes options as a JS PROPERTY', async () => {
  const el = await mount<HTMLElement & { options: unknown[] }>('kai-select', { label: 'Model' });
  el.options = [{ value: 'opus', label: 'Claude Opus' }, { value: 'haiku' }];
  await settle();
  const select = el.shadowRoot!.querySelector('select') as HTMLSelectElement;
  expect(select).toBeTruthy();
  expect(el.shadowRoot!.querySelector('[role="listbox"]')).toBeNull();
  expect([...select.options].map((o) => o.value)).toEqual(['opus', 'haiku']);
  expect([...select.options].map((o) => o.textContent)).toEqual(['Claude Opus', 'haiku']);
  expect(select.getAttribute('aria-label')).toBe('Model');
  el.remove();
});

test('kai-select value reads back live and a host write fires NO kai-change', async () => {
  const el = await mount<HTMLElement & { options: unknown[]; value: string }>('kai-select', { value: 'opus' });
  el.options = [{ value: 'opus' }, { value: 'haiku' }];
  await settle();
  let fired = 0;
  el.addEventListener('kai-change', () => { fired += 1; });

  expect(el.value).toBe('opus');
  el.value = 'haiku';
  await settle();
  expect(el.value).toBe('haiku');
  expect(el.getAttribute('value')).toBe('haiku');
  expect((el.shadowRoot!.querySelector('select') as HTMLSelectElement).value).toBe('haiku');
  expect(fired).toBe(0);
  el.remove();
});

test('kai-select fires kai-change with BOTH value and values', async () => {
  const el = await mount<HTMLElement & { options: unknown[] }>('kai-select');
  el.options = [{ value: 'opus' }, { value: 'haiku' }];
  await settle();
  const seen: unknown[] = [];
  el.addEventListener('kai-change', (e) => seen.push((e as CustomEvent).detail));

  const select = el.shadowRoot!.querySelector('select') as HTMLSelectElement;
  select.value = 'haiku';
  select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  await settle();
  expect(seen).toEqual([{ value: 'haiku', values: ['haiku'] }]);
  el.remove();
});

test('kai-select multiple exposes the WHOLE selection through el.values', async () => {
  // Returning only the first option from a multiple select would be a silent drop.
  const el = await mount<HTMLElement & { options: unknown[]; values: string[]; value: string }>(
    'kai-select', { multiple: '' },
  );
  el.options = [{ value: 'opus' }, { value: 'sonnet' }, { value: 'haiku' }];
  await settle();
  const seen: unknown[] = [];
  el.addEventListener('kai-change', (e) => seen.push((e as CustomEvent).detail));

  const select = el.shadowRoot!.querySelector('select') as HTMLSelectElement;
  expect(select.multiple).toBe(true);
  select.options[0].selected = true;
  select.options[2].selected = true;
  select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  await settle();

  expect(seen).toEqual([{ value: 'opus', values: ['opus', 'haiku'] }]);
  expect(el.values).toEqual(['opus', 'haiku']);
  expect(el.value).toBe('opus');

  // And the host can drive the whole selection back. TWO values on purpose: a setter
  // that kept only the first would satisfy a one-element assertion, and losing the
  // rest is exactly the silent drop this property exists to prevent. (Found by
  // mutation: `v.slice(0, 1)` passed the single-value version of this test.)
  el.values = ['sonnet', 'haiku'];
  await settle();
  expect([...select.selectedOptions].map((o) => o.value)).toEqual(['sonnet', 'haiku']);
  expect(el.values).toEqual(['sonnet', 'haiku']);
  el.remove();
});

test('kai-select events do not bubble, per the kai- contract', async () => {
  const el = await mount<HTMLElement & { options: unknown[] }>('kai-select');
  el.options = [{ value: 'opus' }, { value: 'haiku' }];
  await settle();
  let bubbled = 0;
  document.addEventListener('kai-change', () => { bubbled += 1; });
  const select = el.shadowRoot!.querySelector('select') as HTMLSelectElement;
  select.value = 'haiku';
  select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  await settle();
  expect(bubbled).toBe(0);
  el.remove();
});

test('kai-select follows the reactivity contract: a NEW array re-renders the list', async () => {
  const el = await mount<HTMLElement & { options: unknown[] }>('kai-select');
  el.options = [{ value: 'opus' }];
  await settle();
  const select = () => el.shadowRoot!.querySelector('select') as HTMLSelectElement;
  expect([...select().options].map((o) => o.value)).toEqual(['opus']);
  el.options = [{ value: 'opus' }, { value: 'haiku' }];
  await settle();
  expect([...select().options].map((o) => o.value)).toEqual(['opus', 'haiku']);
  el.remove();
});

test('kai-select focus() reaches the inner select', async () => {
  const el = await mount<HTMLElement & { options: unknown[]; focus: () => void }>('kai-select');
  el.options = [{ value: 'opus' }];
  await settle();
  el.focus();
  expect(el.shadowRoot!.activeElement).toBe(el.shadowRoot!.querySelector('select'));
  el.remove();
});
