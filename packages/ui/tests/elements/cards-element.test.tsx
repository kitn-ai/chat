// tests/elements/cards-element.test.tsx
// <kai-cards>: renders the right child kai-* per envelope, sets data/cardId/heading/theme,
// routes child events through .policy, bubbles the raw kai-card event, and shows a
// fallback (+ error) for unknown types.
import { flush as flushSync } from 'solid-js';
import '../../src/elements/cards';
import { CARD_EVENT_NAME } from '../../src/primitives/card-routing';
import type { CardEnvelope, CardEvent, CardPolicy } from '../../src/primitives/card-contract';

const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => { document.querySelectorAll('kai-cards').forEach((e) => e.remove()); });

type CardsEl = HTMLElement & { cards: CardEnvelope[]; policy?: CardPolicy; types?: Record<string, string> };

async function mount(cards: CardEnvelope[], setup?: (el: CardsEl) => void): Promise<CardsEl> {
  const el = document.createElement('kai-cards') as CardsEl;
  el.cards = cards;
  setup?.(el);
  document.body.appendChild(el);
  await flush();
  await flush();
  await flush();
  return el;
}

const CONFIRM: CardEnvelope = {
  type: 'confirm', id: 'c1', title: 'Deploy?',
  data: { body: 'Ship it?', actions: [{ id: 'go', label: 'Go', default: true }] },
};

test('kai-cards registers', () => {
  expect(customElements.get('kai-cards')).toBeTruthy();
});

test('renders one child element per envelope, in order', async () => {
  const el = await mount([
    CONFIRM,
    { type: 'link', id: 'l1', data: { url: 'https://example.com', title: 'Ex' } },
  ]);
  const tags = Array.from(el.shadowRoot!.querySelectorAll('kai-confirm, kai-link-preview')).map((n) => n.tagName.toLowerCase());
  expect(tags).toEqual(['kai-confirm', 'kai-link-preview']);
});

test('sets data + card-id + heading on a child', async () => {
  const el = await mount([CONFIRM]);
  const child = el.shadowRoot!.querySelector('kai-confirm') as HTMLElement & { data: unknown; cardId: string; heading: string };
  expect(child.data).toEqual(CONFIRM.data);
  expect(child.cardId).toBe('c1');
  expect(child.heading).toBe('Deploy?');
});

test('.policy set AFTER the element is in the DOM still receives events', async () => {
  // The standard host pattern is to set `el.policy` as a property after append.
  // The router must read policy at event time, not capture it at mount.
  const actions: string[] = [];
  const el = document.createElement('kai-cards') as CardsEl;
  el.cards = [CONFIRM];
  document.body.appendChild(el);
  await flush(); await flush(); await flush();
  el.policy = { onAction: (_id, action) => actions.push(action) };
  flushSync(); // V2-FLUSH: commit the staged policy prop before the click reads it
  const btn = el.shadowRoot!.querySelector('kai-confirm')!.shadowRoot!
    .querySelector<HTMLButtonElement>('[data-action-id="go"]')!;
  btn.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(actions).toEqual(['go']);
});

test('.policy receives a child action', async () => {
  const actions: string[] = [];
  const el = await mount([CONFIRM], (e) => { e.policy = { onAction: (_id, action) => actions.push(action) }; });
  const btn = el.shadowRoot!.querySelector('kai-confirm')!.shadowRoot!.querySelector<HTMLButtonElement>('[data-action-id="go"]')!;
  btn.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(actions).toEqual(['go']);
});

test('raw kai-card events bubble past kai-cards to the document', async () => {
  const seen: CardEvent[] = [];
  const handler = (e: Event) => seen.push((e as CustomEvent<CardEvent>).detail);
  document.addEventListener(CARD_EVENT_NAME, handler);
  const el = await mount([CONFIRM]);
  const btn = el.shadowRoot!.querySelector('kai-confirm')!.shadowRoot!.querySelector<HTMLButtonElement>('[data-action-id="go"]')!;
  btn.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(seen.some((e) => e.kind === 'action' && (e as any).action === 'go')).toBe(true);
  document.removeEventListener(CARD_EVENT_NAME, handler);
});

test('unknown type → fallback alert + an error routed to .policy', async () => {
  const errors: string[] = [];
  const el = await mount([{ type: 'mystery', id: 'm1', data: {} }], (e) => { e.policy = { onError: (_id, msg) => errors.push(msg) }; });
  expect(el.shadowRoot!.querySelector('[role="alert"]')!.textContent).toContain('mystery');
  expect(errors).toHaveLength(1);
});

test('.types maps a custom type to a registered tag', async () => {
  const el = await mount(
    [{ type: 'note', id: 'n1', data: { body: 'hi' } }],
    (e) => { e.types = { note: 'kai-confirm' }; },
  );
  // 'note' now resolves to kai-confirm (data lacks actions → its own inline error, but the TAG is chosen)
  expect(el.shadowRoot!.querySelector('kai-confirm')).toBeTruthy();
});
