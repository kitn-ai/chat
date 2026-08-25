import { flush as flushSync } from 'solid-js';
import '../../src/elements/input';

/** Let Solid's scheduler flush effects (the value→attribute reflect) + renders. */
const flush = () => new Promise((r) => setTimeout(r, 0));

test('drives the value (setter → attribute reflect → inner input) and reads live state', async () => {
  const el = document.createElement('kai-input') as HTMLElement & { value: string };
  document.body.appendChild(el);
  await flush();

  el.value = 'hi';
  await flush();

  expect(el.getAttribute('value')).toBe('hi');
  const input = el.shadowRoot!.querySelector('input')!;
  expect(input.value).toBe('hi');
  expect(el.value).toBe('hi');

  el.remove();
});

test('typing in the inner input fires kai-input with detail.value', async () => {
  const el = document.createElement('kai-input') as HTMLElement & { value: string };
  document.body.appendChild(el);
  await flush();

  const values: string[] = [];
  el.addEventListener('kai-input', (e) => values.push((e as CustomEvent<{ value: string }>).detail.value));

  const input = el.shadowRoot!.querySelector('input')!;
  input.value = 'abc';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  expect(values).toEqual(['abc']);
  expect(el.value).toBe('abc');

  el.remove();
});

test('blur on the inner input fires kai-change with detail.value', async () => {
  const el = document.createElement('kai-input') as HTMLElement & { value: string };
  document.body.appendChild(el);
  await flush();

  el.value = 'committed';
  await flush();

  const changes: string[] = [];
  el.addEventListener('kai-change', (e) => changes.push((e as CustomEvent<{ value: string }>).detail.value));

  const input = el.shadowRoot!.querySelector('input')!;
  input.dispatchEvent(new Event('blur'));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  expect(changes).toEqual(['committed']);

  el.remove();
});

test('clear() empties the value and fires kai-change with an empty string', async () => {
  const el = document.createElement('kai-input') as HTMLElement & { value: string; clear: () => void };
  document.body.appendChild(el);
  await flush();

  el.value = 'temp';
  await flush();

  const changes: string[] = [];
  el.addEventListener('kai-change', (e) => changes.push((e as CustomEvent<{ value: string }>).detail.value));

  el.clear();
  await flush();

  expect(el.value).toBe('');
  expect(changes).toEqual(['']);

  el.remove();
});

test('focus() focuses the inner input', async () => {
  const el = document.createElement('kai-input') as HTMLElement & { focus: () => void };
  document.body.appendChild(el);
  await flush();

  const input = el.shadowRoot!.querySelector('input')!;
  let focused = false;
  input.addEventListener('focus', () => { focused = true; });

  el.focus();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(focused).toBe(true);

  el.remove();
});

test('forwards autocomplete / inputmode / autocapitalize to the inner input', async () => {
  const el = document.createElement('kai-input');
  el.setAttribute('autocomplete', 'email');
  el.setAttribute('inputmode', 'numeric');
  el.setAttribute('autocapitalize', 'characters');
  document.body.appendChild(el);
  await flush();

  const input = el.shadowRoot!.querySelector('input')!;
  expect(input.getAttribute('autocomplete')).toBe('email');
  expect(input.getAttribute('inputmode')).toBe('numeric');
  expect(input.getAttribute('autocapitalize')).toBe('characters');

  el.remove();
});

test('the error attribute marks the inner input aria-invalid', async () => {
  const el = document.createElement('kai-input');
  el.setAttribute('error', 'Required field');
  document.body.appendChild(el);
  await flush();

  const input = el.shadowRoot!.querySelector('input')!;
  expect(input.getAttribute('aria-invalid')).toBe('true');

  el.remove();
});
