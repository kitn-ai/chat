import { flush as flushSync } from 'solid-js';
import '../../src/elements/editable-label';

/** Let Solid's scheduler flush effects + renders. */
const flush = () => new Promise((r) => setTimeout(r, 0));

type EditableEl = HTMLElement & { value: string; editing: boolean; edit: () => void };

test('committing a changed value fires kai-rename with detail.value', async () => {
  const el = document.createElement('kai-editable-label') as EditableEl;
  el.setAttribute('value', 'Old');
  document.body.appendChild(el);
  await flush();

  const renames: string[] = [];
  el.addEventListener('kai-rename', (e) => renames.push((e as CustomEvent<{ value: string }>).detail.value));

  el.edit();
  await flush();

  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
  input.value = 'New';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  expect(renames).toEqual(['New']);
  expect(el.value).toBe('New');

  el.remove();
});

test('Esc fires kai-cancel and keeps the old value', async () => {
  const el = document.createElement('kai-editable-label') as EditableEl;
  el.setAttribute('value', 'Keep');
  document.body.appendChild(el);
  await flush();

  let cancelled = false;
  const renames: string[] = [];
  el.addEventListener('kai-cancel', () => { cancelled = true; });
  el.addEventListener('kai-rename', (e) => renames.push((e as CustomEvent<{ value: string }>).detail.value));

  el.edit();
  await flush();

  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
  input.value = 'Discard';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  expect(cancelled).toBe(true);
  expect(renames).toEqual([]);
  expect(el.value).toBe('Keep');

  el.remove();
});

test('edit() enters edit mode (renders the inner input)', async () => {
  const el = document.createElement('kai-editable-label') as EditableEl;
  el.setAttribute('value', 'Name');
  document.body.appendChild(el);
  await flush();

  expect(el.shadowRoot!.querySelector('input')).toBeNull();
  el.edit();
  await flush();
  expect(el.shadowRoot!.querySelector('input')).not.toBeNull();

  el.remove();
});
