import { flush } from 'solid-js';
import '../../src/elements/prompt-input';
import type { ComposerDoc } from '../../src/primitives/composer-model';

test('value as a ComposerDoc seeds a pill; submit emits a flattened string value + the seeded entities', async () => {
  const el = document.createElement('kai-prompt-input') as HTMLElement & {
    value?: string | ComposerDoc;
  };
  const doc: ComposerDoc = [
    { type: 'text', text: 'Review ' },
    {
      type: 'entity',
      entity: { kind: 'skill', id: 'rec', label: 'Record & Replay', promptText: 'Use the Record & Replay skill.' },
    },
  ];
  el.value = doc;
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  // The seeded pill renders inline (a real skill pill, by kind).
  const pill = el.shadowRoot!.querySelector('[data-kai-entity]');
  expect(pill).toBeTruthy();
  expect(pill!.getAttribute('data-kind')).toBe('skill');

  // Submitting WITHOUT editing emits a flattened STRING value (back-compat) and
  // carries the seeded entities for downstream expansion.
  let detail: { value: unknown; entities: { id: string }[] } | null = null;
  el.addEventListener('kai-submit', (e) => (detail = (e as CustomEvent).detail));
  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const d = detail as unknown as { value: unknown; entities: { id: string }[] };
  expect(typeof d.value).toBe('string');
  expect(d.value).toBe('Review Use the Record & Replay skill.');
  expect(d.entities.map((x) => x.id)).toEqual(['rec']);

  el.remove();
});

test('emits valuechange on input and submit on Enter', async () => {
  const el = document.createElement('kai-prompt-input') as HTMLElement & {
    value?: string; placeholder?: string;
  };
  el.placeholder = 'Ask...';
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  expect(editable.getAttribute('data-placeholder')).toBe('Ask...');

  let changed: string | null = null;
  let submitted: string | null = null;
  el.addEventListener('kai-value-change', (e) => (changed = (e as CustomEvent).detail.value));
  el.addEventListener('kai-submit', (e) => (submitted = (e as CustomEvent).detail.value));

  editable.textContent = 'hello';
  // jsdom shadow-DOM events must be `composed:true` to cross the shadow boundary
  // and reach SolidJS's document-level delegated listeners (mirrors real browser
  // behaviour where native input/keydown events are always composed).
  editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(changed).toBe('hello');

  editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(submitted).toBe('hello');

  el.remove();
});

const suggestionChip = (el: HTMLElement, label: string) =>
  Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button:not([data-testid="send"])'))
    .find((b) => b.textContent?.trim() === label)!;

test('default suggestionMode "submit": clicking a suggestion emits submit (sends it)', async () => {
  const el = document.createElement('kai-prompt-input') as HTMLElement & { suggestions?: string[] };
  el.suggestions = ['Hi', 'Bye'];
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(el.shadowRoot!.textContent).toContain('Hi');

  let submitted: string | null = null;
  let suggestionClicked: string | null = null;
  el.addEventListener('kai-submit', (e) => (submitted = (e as CustomEvent).detail.value));
  el.addEventListener('kai-suggestion-click', (e) => (suggestionClicked = (e as CustomEvent).detail.value));

  // A real .click() produces a composed event that reaches Solid's delegated
  // listeners across the shadow boundary in jsdom.
  suggestionChip(el, 'Hi').click();
  expect(submitted).toBe('Hi');           // default = submit
  expect(suggestionClicked).toBe(null);   // suggestionclick is NOT fired in submit mode

  el.remove();
});

test('suggestionMode "fill": clicking a suggestion fills the input and emits suggestionclick', async () => {
  const el = document.createElement('kai-prompt-input') as HTMLElement & {
    suggestions?: string[]; suggestionMode?: 'submit' | 'fill';
  };
  el.suggestions = ['Hi', 'Bye'];
  el.suggestionMode = 'fill';
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  let submitted: string | null = null;
  let clicked: string | null = null;
  el.addEventListener('kai-submit', (e) => (submitted = (e as CustomEvent).detail.value));
  el.addEventListener('kai-suggestion-click', (e) => (clicked = (e as CustomEvent).detail.value));

  suggestionChip(el, 'Bye').click();
  expect(clicked).toBe('Bye');   // fill mode emits suggestionclick
  expect(submitted).toBe(null);  // and does NOT submit

  // Wait for controlled re-render to reflect filled value
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  expect(editable.textContent).toBe('Bye'); // filled into the input

  el.remove();
});

test('disallows leading whitespace at the start of the prompt', async () => {
  const el = document.createElement('kai-prompt-input') as HTMLElement & { value?: string };
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  let changed: string | null = null;
  el.addEventListener('kai-value-change', (e) => (changed = (e as CustomEvent).detail.value));

  // Leading spaces are stripped on input.
  editable.textContent = '   hello';
  editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(editable.textContent).toBe('hello');
  expect(changed).toBe('hello');

  // A lone leading space collapses to empty (hitting space at the start does nothing).
  editable.textContent = ' ';
  editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(editable.textContent).toBe('');

  el.remove();
});

test('send button is disabled when loading even with non-empty value', async () => {
  const el = document.createElement('kai-prompt-input') as HTMLElement & {
    loading?: boolean;
  };
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  editable.textContent = 'something';
  editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  el.loading = true;
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const send = el.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="send"]')!;
  expect(send.disabled).toBe(true);

  el.remove();
});

test('send button and textarea have accessible names (a11y A1)', async () => {
  const el = document.createElement('kai-prompt-input') as HTMLElement & {
    placeholder?: string;
  };
  el.placeholder = 'Ask anything...';
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const send = el.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="send"]')!;
  expect(send.getAttribute('aria-label')).toBe('Send message');

  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  expect(editable.getAttribute('aria-label')).toBe('Ask anything...');

  el.remove();
});

test('textarea always has a non-empty accessible name', async () => {
  // With no explicit placeholder the element supplies its default placeholder,
  // which becomes the accessible name. When the placeholder is empty the label
  // falls back to "Message" so the control is never unnamed.
  const withDefault = document.createElement('kai-prompt-input');
  document.body.appendChild(withDefault);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const defaultEditable = withDefault.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  expect(defaultEditable.getAttribute('aria-label')).toBeTruthy();
  withDefault.remove();

  const emptyPlaceholder = document.createElement('kai-prompt-input') as HTMLElement & {
    placeholder?: string;
  };
  emptyPlaceholder.placeholder = '';
  document.body.appendChild(emptyPlaceholder);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const emptyEditable = emptyPlaceholder.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  expect(emptyEditable.getAttribute('aria-label')).toBe('Message');
  emptyPlaceholder.remove();
});
