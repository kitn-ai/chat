import { flush as flushSync } from 'solid-js';
import { vi } from 'vitest';
import '../../src/elements/search';

/** Let Solid's scheduler flush effects + renders (mirrors input-element.test). */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Drive the inner input. `composed: true` crosses the shadow boundary so Solid's
 *  delegated `input` listener (on document) fires — same as input-element.test. */
const typeInto = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
};

test('renders a leading search icon and the default placeholder', async () => {
  const el = document.createElement('kai-search');
  document.body.appendChild(el);
  await flush();

  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
  expect(input.placeholder).toBe('Search…');
  // Leading affix = a rendered search icon (lucide svg) inside the bordered row.
  expect(el.shadowRoot!.querySelector('[part="field"] svg')).toBeTruthy();

  el.remove();
});

test('typing fires a single debounced kai-search after a burst', async () => {
  const el = document.createElement('kai-search') as HTMLElement;
  el.setAttribute('debounce', '200');
  document.body.appendChild(el);
  await flush();

  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
  const events: string[] = [];
  el.addEventListener('kai-search', (e) => events.push((e as CustomEvent<{ value: string }>).detail.value));

  vi.useFakeTimers();
  try {
    typeInto(input, 'a');
    typeInto(input, 'ab');
    typeInto(input, 'abc');
    // Nothing fires until the debounce window elapses.
    expect(events).toEqual([]);
    vi.advanceTimersByTime(200);
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    // One event after the burst, carrying the latest value.
    expect(events).toEqual(['abc']);
  } finally {
    vi.useRealTimers();
  }

  el.remove();
});

test('a clear button appears when non-empty; clicking it empties + fires kai-search ""', async () => {
  const el = document.createElement('kai-search') as HTMLElement & { value: string };
  document.body.appendChild(el);
  await flush();

  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
  expect(el.shadowRoot!.querySelector('[part="clear"]')).toBeNull();

  typeInto(input, 'hello');
  await flush();
  const clearBtn = el.shadowRoot!.querySelector<HTMLButtonElement>('[part="clear"]')!;
  expect(clearBtn).toBeTruthy();

  const events: string[] = [];
  el.addEventListener('kai-search', (e) => events.push((e as CustomEvent<{ value: string }>).detail.value));
  clearBtn.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  expect(el.value).toBe('');
  expect(events).toEqual(['']);

  el.remove();
});

test('Enter fires kai-submit with the current value', async () => {
  const el = document.createElement('kai-search') as HTMLElement;
  document.body.appendChild(el);
  await flush();

  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
  typeInto(input, 'query');
  await flush();

  let submitted: string | undefined;
  el.addEventListener('kai-submit', (e) => { submitted = (e as CustomEvent<{ value: string }>).detail.value; });
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(submitted).toBe('query');

  el.remove();
});

test('clear() empties the value and focuses the inner input', async () => {
  const el = document.createElement('kai-search') as HTMLElement & { value: string; clear: () => void };
  document.body.appendChild(el);
  await flush();

  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input')!;
  typeInto(input, 'stuff');
  await flush();

  let focused = false;
  input.addEventListener('focus', () => { focused = true; });

  el.clear();
  await flush();

  expect(el.value).toBe('');
  expect(focused).toBe(true);

  el.remove();
});
