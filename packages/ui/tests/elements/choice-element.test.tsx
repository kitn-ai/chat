// tests/elements/choice-element.test.tsx
// Contract integration for <kai-choice>: clicking a row SELECTS it (no emit); the
// Submit button emits the bubbling `kai-card` `action` event with the right payload +
// resolved single-shot state, plus the unified allowOther flow. Modeled on
// confirm-card-element.test.tsx.
import '../../src/elements/choice';
import { CARD_EVENT_NAME } from '../../src/primitives/card-routing';
import type { CardEvent } from '../../src/primitives/card-contract';
import type { ChoiceCardData } from '../../src/components/choice-card';

const flush = () => new Promise((r) => setTimeout(r, 0));

function listen(): { events: CardEvent[]; off: () => void } {
  const events: CardEvent[] = [];
  const handler = (e: Event) => events.push((e as CustomEvent<CardEvent>).detail);
  document.addEventListener(CARD_EVENT_NAME, handler);
  return { events, off: () => document.removeEventListener(CARD_EVENT_NAME, handler) };
}

afterEach(() => {
  document.querySelectorAll('kai-choice').forEach((e) => e.remove());
});

const PLANS: ChoiceCardData = {
  prompt: 'Which plan fits you?',
  options: [
    { id: 'free', label: 'Free', meta: '$0' },
    { id: 'pro', label: 'Pro', recommended: true, meta: '$12/mo', payload: { plan: 'pro' } },
  ],
};

async function mount(data: ChoiceCardData, cardId = 'card-choice-1') {
  // No cast: with src/elements/element-types.d.ts in the pass (see tsconfig.tests.json
  // "tagMapIs") this is a real KaiChoiceElement. It used to read
  // `as HTMLElement & { data: ChoiceCardData }`, which asserted nothing — the tag map
  // was absent, so every `kai-*` tag was an opaque HTMLElement and the intersection was
  // a pure widening the compiler accepts unconditionally. Measured: the identical cast
  // compiled against 'kai-confirm' and against 'kai-not-a-real-element', and errored
  // only for 'div' — the one tag tsc actually knew.
  const el = document.createElement('kai-choice');
  el.setAttribute('card-id', cardId);
  // @ts-expect-error — a REAL gap in the generated declarations, not test noise, and
  // deliberately marked rather than cast away. gen-element-types.mjs emits `data?:
  // Record<string, unknown>` for every card element, and NO exported card interface is
  // assignable to that (interfaces get no implicit index signature), so a consumer
  // following this element's own doc comment — "Import `ChoiceCardData` from
  // `@kitn.ai/ui` for the full shape" — writes `el.data = myChoiceCardData` and gets
  // TS2322. The payload itself is still fully checked, at `mount`'s parameter, so this
  // line only moves a known-good value into a badly-typed slot. When the generator
  // learns the real payload types this directive becomes unused and TS2578 fails the
  // pass, which is the point: it cannot rot closed.
  el.data = data;
  document.body.appendChild(el);
  await flush();
  return el;
}

const radios = (el: HTMLElement) =>
  Array.from(el.shadowRoot!.querySelectorAll<HTMLElement>('[role="radio"]'));

const submitButton = (el: HTMLElement) =>
  Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === 'Submit',
  )!;

test('kai-choice registers', () => {
  expect(customElements.get('kai-choice')).toBeTruthy();
});

test('mount emits a bubbling `ready` reaching the document', async () => {
  const { events, off } = listen();
  await mount(PLANS);
  expect(events.some((e) => e.kind === 'ready' && e.cardId === 'card-choice-1')).toBe(true);
  off();
});

test('group is a radiogroup; options are radios with aria-checked', async () => {
  const { off } = listen();
  const el = await mount(PLANS);
  expect(el.shadowRoot!.querySelector('[role="radiogroup"]')).toBeTruthy();
  const rs = radios(el);
  expect(rs.length).toBe(2);
  expect(rs.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  off();
});

test('picking a row selects it (aria-checked true) but does NOT emit yet', async () => {
  const { events, off } = listen();
  const el = await mount(PLANS);
  const pro = radios(el).find((r) => r.dataset.optionId === 'pro')!;
  pro.click();
  await flush();
  expect(pro.getAttribute('aria-checked')).toBe('true');
  expect(events.some((e) => e.kind === 'action')).toBe(false);
  off();
});

test('Submit emits `action` with id + echoed payload; bubbling+composed', async () => {
  const { events, off } = listen();
  const el = await mount(PLANS);
  const pro = radios(el).find((r) => r.dataset.optionId === 'pro')!;
  // Submit disabled until something is selected.
  expect(submitButton(el).disabled).toBe(true);
  pro.click();
  await flush();
  expect(submitButton(el).disabled).toBe(false);
  submitButton(el).click();
  await flush();
  const action = events.find((e) => e.kind === 'action') as
    | Extract<CardEvent, { kind: 'action' }>
    | undefined;
  expect(action?.cardId).toBe('card-choice-1');
  expect(action?.action).toBe('pro');
  expect(action?.payload).toEqual({ plan: 'pro' });
  off();
});

test('resolved state after Submit sets data-kai-resolved', async () => {
  const { off } = listen();
  const el = await mount(PLANS);
  radios(el).find((r) => r.dataset.optionId === 'pro')!.click();
  await flush();
  submitButton(el).click();
  await flush();
  expect(el.getAttribute('data-kai-resolved')).toBe('pro');
  off();
});

test('single-shot: after Submit, further clicks/Submit do not re-emit', async () => {
  const { events, off } = listen();
  const el = await mount(PLANS);
  radios(el).find((r) => r.dataset.optionId === 'free')!.click();
  await flush();
  submitButton(el).click();
  await flush();
  // The radiogroup is replaced by the read-only resolved view; no Submit remains.
  expect(el.shadowRoot!.querySelector('[role="radiogroup"]')).toBeNull();
  expect(submitButton(el)).toBeUndefined();
  expect(events.filter((e) => e.kind === 'action').length).toBe(1);
  off();
});

test('disabled option is aria-disabled + not focusable + inert (cannot be selected)', async () => {
  const { off } = listen();
  const el = await mount({ options: [{ id: 'a', label: 'A', disabled: true }, { id: 'b', label: 'B' }] });
  const a = radios(el).find((r) => r.dataset.optionId === 'a')!;
  expect(a.getAttribute('aria-disabled')).toBe('true');
  expect(a.getAttribute('tabindex')).toBe('-1');
  a.click();
  await flush();
  // Clicking a disabled row neither selects it nor enables Submit.
  expect(a.getAttribute('aria-checked')).toBe('false');
  expect(submitButton(el).disabled).toBe(true);
  off();
});

test('roving tabindex: exactly one radio is a tab stop', async () => {
  const { off } = listen();
  const el = await mount(PLANS);
  const tabbable = radios(el).filter((r) => r.getAttribute('tabindex') === '0');
  expect(tabbable.length).toBe(1);
  off();
});

test('Arrow keys move focus skipping disabled; Enter selects then Submit emits "c"', async () => {
  const { events, off } = listen();
  const el = await mount({
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: true },
      { id: 'c', label: 'C' },
    ],
  });
  const group = el.shadowRoot!.querySelector('[role="radiogroup"]') as HTMLElement;
  const a = radios(el).find((r) => r.dataset.optionId === 'a')!;
  a.focus();
  // ArrowDown from A should skip disabled B and land on C.
  group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));
  await flush();
  // Enter selects the focused row (no emit yet).
  group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  await flush();
  const c = radios(el).find((r) => r.dataset.optionId === 'c')!;
  expect(c.getAttribute('aria-checked')).toBe('true');
  expect(events.some((e) => e.kind === 'action')).toBe(false);
  // Submit emits the selection.
  submitButton(el).click();
  await flush();
  const action = events.find((e) => e.kind === 'action') as
    | Extract<CardEvent, { kind: 'action' }>
    | undefined;
  expect(action?.action).toBe('c');
  off();
});

test('empty options → inline error + `error` event; no radios', async () => {
  const { events, off } = listen();
  const el = await mount({ options: [] } as unknown as ChoiceCardData, 'card-bad');
  const root = el.shadowRoot!;
  expect(root.querySelector('[role="alert"]')).toBeTruthy();
  expect(root.querySelector('[role="radio"]')).toBeNull();
  expect(events.some((e) => e.kind === 'error' && e.cardId === 'card-bad')).toBe(true);
  off();
});

test('allowOther: select Other reveals input; the one Submit emits __other__ with text', async () => {
  const { events, off } = listen();
  const el = await mount({
    options: [{ id: 'a', label: 'A' }],
    allowOther: { label: 'Other…', placeholder: 'Tell me' },
  });
  // Before selecting Other there is no text input and Submit is disabled.
  expect(el.shadowRoot!.querySelector('input[type="text"]')).toBeNull();
  expect(submitButton(el).disabled).toBe(true);

  const other = radios(el).find((r) => r.dataset.optionId === '__other__')!;
  other.click();
  await flush();
  // Other selected → input appears; no emit yet; Submit still disabled (empty text).
  expect(events.some((e) => e.kind === 'action')).toBe(false);
  const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[type="text"]')!;
  expect(input).toBeTruthy();
  expect(submitButton(el).disabled).toBe(true);

  input.value = 'custom';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await flush();
  expect(submitButton(el).disabled).toBe(false);
  submitButton(el).click();
  await flush();
  const action = events.find((e) => e.kind === 'action') as
    | Extract<CardEvent, { kind: 'action' }>
    | undefined;
  expect(action?.action).toBe('__other__');
  expect(action?.payload).toEqual({ text: 'custom' });
  off();
});
