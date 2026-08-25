// tests/elements/form-element.test.tsx
// Contract integration: the bubbling `kai-card` CustomEvent reaches a document
// listener (the requirement defineWebComponent's default dispatch does NOT meet).
import { flush as flushSync } from 'solid-js';
import '../../src/elements/form';
import { CARD_EVENT_NAME } from '../../src/primitives/card-routing';
import type { CardEvent } from '../../src/primitives/card-contract';
import type { FormDefinition } from '../../src/components/form';

const flush = () => new Promise((r) => setTimeout(r, 0));

function listen(): { events: CardEvent[]; off: () => void } {
  const events: CardEvent[] = [];
  const handler = (e: Event) => events.push((e as CustomEvent<CardEvent>).detail);
  document.addEventListener(CARD_EVENT_NAME, handler);
  return { events, off: () => document.removeEventListener(CARD_EVENT_NAME, handler) };
}

afterEach(() => {
  document.querySelectorAll('kai-form').forEach((e) => e.remove());
});

const FEEDBACK: FormDefinition = {
  type: 'object',
  required: ['rating'],
  'x-kai-order': ['rating', 'comments', 'plan', 'contactOk'],
  'x-kai-submitLabel': 'Send feedback',
  'x-kai-actions': [{ id: 'skip', label: 'Skip', variant: 'ghost' }],
  properties: {
    rating: { type: 'integer', title: 'Overall rating', minimum: 1, maximum: 5, 'x-kai-widget': 'rating' },
    comments: { type: 'string', title: 'Comments', maxLength: 500, 'x-kai-widget': 'textarea' },
    plan: { type: 'string', title: 'Your plan', enum: ['free', 'pro', 'team'], default: 'free' },
    contactOk: { type: 'boolean', title: 'OK to contact me', default: false },
  },
};

async function mount(data: FormDefinition, cardId = 'card-feedback-7f3') {
  // No cast — this is a real KaiFormElement now. See the long note in
  // choice-element.test.tsx: the old `as HTMLElement & { data: FormDefinition }` could
  // not fail, because without the tag map every `kai-*` tag was an opaque HTMLElement.
  const el = document.createElement('kai-form');
  el.setAttribute('card-id', cardId);
  // Bare, no cast, no directive — the documented consumer workflow, and it compiles
  // as of 2026-08-12. It carried an `@ts-expect-error` while the generated prop was
  // `data?: Record<string, unknown>`, which no exported card INTERFACE was assignable
  // to. `FormDefinition` is the load-bearing one of the four: it is SELF-REFERENTIAL,
  // so the generator inlines it down to a `Record<string, unknown>` placeholder one
  // level in, and only a `type` alias (which gets an implicit index signature) is
  // assignable to that — an interface would still fail here however the facade
  // declared its prop. See the long note in choice-element.test.tsx, and keep this
  // line bare so it can still fail.
  el.data = data;
  document.body.appendChild(el);
  await flush();
  return el;
}

test('kai-form registers', () => {
  expect(customElements.get('kai-form')).toBeTruthy();
});

test('mount emits a bubbling `ready` kai-card event reaching the document', async () => {
  const { events, off } = listen();
  await mount(FEEDBACK);
  expect(events.some((e) => e.kind === 'ready' && e.cardId === 'card-feedback-7f3')).toBe(true);
  off();
});

test('valid submit emits submit with the coerced object', async () => {
  const { events, off } = listen();
  const el = await mount(FEEDBACK);
  const root = el.shadowRoot!;

  // rating: click the 4th star
  const stars = root.querySelectorAll<HTMLElement>('[role="radio"]');
  stars[3].click();
  await flush();

  // comments textarea
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
  textarea.value = 'Loved the speed.';
  // Solid delegates `input`; real browser input events are composed and cross the
  // shadow boundary to Solid's root listener, so mirror that here.
  textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  // plan: choose 'pro' radio
  const proRadio = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
    (r) => r.value === 'pro',
  )!;
  proRadio.checked = true;
  proRadio.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  // contactOk: flip the switch on
  const sw = root.querySelector<HTMLElement>('[role="switch"]')!;
  sw.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  // submit
  const form = root.querySelector('form')!;
  form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await flush();

  const submit = events.find((e) => e.kind === 'submit') as
    | Extract<CardEvent, { kind: 'submit' }>
    | undefined;
  expect(submit).toBeTruthy();
  expect(submit!.cardId).toBe('card-feedback-7f3');
  expect(submit!.data).toEqual({
    rating: 4,
    comments: 'Loved the speed.',
    plan: 'pro',
    contactOk: true,
  });
  off();
});

test('secondary action button emits `action` with its id', async () => {
  const { events, off } = listen();
  const el = await mount(FEEDBACK);
  const skip = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === 'Skip',
  )!;
  skip.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  const action = events.find((e) => e.kind === 'action') as
    | Extract<CardEvent, { kind: 'action' }>
    | undefined;
  expect(action?.action).toBe('skip');
  off();
});

test('dismissible form emits `dismiss`', async () => {
  const { events, off } = listen();
  const el = await mount({ ...FEEDBACK, 'x-kai-dismissible': true });
  const dismiss = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === 'Dismiss',
  )!;
  dismiss.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(events.some((e) => e.kind === 'dismiss')).toBe(true);
  off();
});

test('required missing blocks submit (no submit) and marks the field', async () => {
  const { events, off } = listen();
  const el = await mount(FEEDBACK);
  const form = el.shadowRoot!.querySelector('form')!;
  form.requestSubmit
    ? form.requestSubmit()
    : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await flush();
  expect(events.some((e) => e.kind === 'submit')).toBe(false);
  // an inline error appears
  expect(el.shadowRoot!.querySelector('[role="alert"]')).toBeTruthy();
  off();
});

test('invalid envelope renders the inline error and emits `error`; no form', async () => {
  const { events, off } = listen();
  const el = await mount({ type: 'array' } as unknown as FormDefinition, 'card-bad');
  const root = el.shadowRoot!;
  expect(root.querySelector('form')).toBeNull();
  expect(root.querySelector('[role="alert"]')).toBeTruthy();
  expect(events.some((e) => e.kind === 'error' && e.cardId === 'card-bad')).toBe(true);
  off();
});
