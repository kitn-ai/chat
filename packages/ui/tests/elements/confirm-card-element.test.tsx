// tests/elements/confirm-card-element.test.tsx
// Contract integration for <kai-confirm>: the bubbling `kai-card` CustomEvent reaches
// a document listener with the right `action` payload + resolved single-shot state.
import '../../src/elements/confirm-card';
import { CARD_EVENT_NAME } from '../../src/primitives/card-routing';
import type { CardEvent } from '../../src/primitives/card-contract';
import type { ConfirmCardData } from '../../src/components/confirm-card';

const flush = () => new Promise((r) => setTimeout(r, 0));

function listen(): { events: CardEvent[]; off: () => void } {
  const events: CardEvent[] = [];
  const handler = (e: Event) => events.push((e as CustomEvent<CardEvent>).detail);
  document.addEventListener(CARD_EVENT_NAME, handler);
  return { events, off: () => document.removeEventListener(CARD_EVENT_NAME, handler) };
}

afterEach(() => {
  document.querySelectorAll('kai-confirm').forEach((e) => e.remove());
});

const APPROVE: ConfirmCardData = {
  body: 'Apply 3 migrations to production?',
  tone: 'warning',
  actions: [
    { id: 'approve', label: 'Run migration', style: 'primary', default: true, payload: { n: 3 } },
    { id: 'reject', label: 'Cancel' },
  ],
};

async function mount(data: ConfirmCardData, cardId = 'card-approve-1') {
  // No cast — this is a real KaiConfirmElement now. See the long note in
  // choice-element.test.tsx: the old `as HTMLElement & { data: ConfirmCardData }` could
  // not fail, because without the tag map every `kai-*` tag was an opaque HTMLElement.
  const el = document.createElement('kai-confirm');
  el.setAttribute('card-id', cardId);
  // Bare, no cast, no directive — the documented consumer workflow, and it compiles
  // as of 2026-08-12. It carried an `@ts-expect-error` while the generated prop was
  // `data?: Record<string, unknown>`, which no exported card INTERFACE was assignable
  // to; the payload types are `type` aliases in primitives/card-data-types.ts now and
  // the facade declares `data?: ConfirmCardData`. See the long note in
  // choice-element.test.tsx, and keep this line bare so it can still fail.
  el.data = data;
  document.body.appendChild(el);
  await flush();
  return el;
}

test('kai-confirm registers', () => {
  expect(customElements.get('kai-confirm')).toBeTruthy();
});

test('mount emits a bubbling `ready` reaching the document', async () => {
  const { events, off } = listen();
  await mount(APPROVE);
  expect(events.some((e) => e.kind === 'ready' && e.cardId === 'card-approve-1')).toBe(true);
  off();
});

test('clicking an action emits `action` with id + echoed payload; bubbling+composed', async () => {
  const { events, off } = listen();
  const el = await mount(APPROVE);
  const btn = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.dataset.actionId === 'approve',
  )!;
  btn.click();
  await flush();
  const action = events.find((e) => e.kind === 'action') as
    | Extract<CardEvent, { kind: 'action' }>
    | undefined;
  expect(action?.cardId).toBe('card-approve-1');
  expect(action?.action).toBe('approve');
  expect(action?.payload).toEqual({ n: 3 });
  off();
});

test('resolved state shows read-only chosen label, hides other actions + sets data-kai-resolved', async () => {
  const { off } = listen();
  const el = await mount(APPROVE);
  const approve = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.dataset.actionId === 'approve',
  )!;
  approve.click();
  await flush();
  // After resolution, buttons are replaced by a read-only label; the other action button is absent.
  const reject = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.dataset.actionId === 'reject',
  );
  expect(reject).toBeUndefined();
  // The chosen label is visible in the read-only view.
  expect(el.shadowRoot!.textContent).toContain('Run migration');
  expect(el.getAttribute('data-kai-resolved')).toBe('approve');
  off();
});

test('single-shot: a second click does not emit again', async () => {
  const { events, off } = listen();
  const el = await mount(APPROVE);
  const approve = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.dataset.actionId === 'approve',
  )!;
  approve.click();
  approve.click();
  await flush();
  expect(events.filter((e) => e.kind === 'action').length).toBe(1);
  off();
});

test('dismissible emits `dismiss`', async () => {
  const { events, off } = listen();
  const el = await mount({ ...APPROVE, dismissible: true });
  const dismiss = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.getAttribute('aria-label') === 'Dismiss',
  )!;
  dismiss.click();
  await flush();
  expect(events.some((e) => e.kind === 'dismiss')).toBe(true);
  off();
});

test('empty actions → inline error state + `error` event; no buttons', async () => {
  const { events, off } = listen();
  const el = await mount({ actions: [] } as unknown as ConfirmCardData, 'card-bad');
  const root = el.shadowRoot!;
  expect(root.querySelector('[role="alert"]')).toBeTruthy();
  expect(root.querySelector('[data-action-id]')).toBeNull();
  expect(events.some((e) => e.kind === 'error' && e.cardId === 'card-bad')).toBe(true);
  off();
});

test('duplicate ids de-duped (first wins) → one button per id', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { off } = listen();
  const el = await mount({
    actions: [
      { id: 'a', label: 'First' },
      { id: 'a', label: 'Dup' },
      { id: 'b', label: 'B' },
    ],
  });
  const ids = Array.from(el.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-action-id]')).map(
    (b) => b.dataset.actionId,
  );
  expect(ids).toEqual(['a', 'b']);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
  off();
});
