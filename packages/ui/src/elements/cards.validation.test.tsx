/**
 * The `<kai-cards>` half of the native validation.
 *
 * Same property as the Solid dispatcher's test and the same controls: HARD replaces
 * the child element with a diagnostic, SOFT leaves the child element in place. Both
 * fire a contract `error`. The two payloads differ by one keyword on one field, so
 * nothing but the tier can explain the difference.
 *
 * Asserted through the SHADOW ROOT and the bubbling `kai-card` event, i.e. what a
 * consumer of the web component actually sees, not through internals.
 */
import { describe, it, expect, afterEach } from 'vitest';
import './cards';
import { CARD_EVENT_NAME } from '../primitives/card-routing';
import type { CardEnvelope, CardEvent } from '../primitives/card-contract';

afterEach(() => {
  document.querySelectorAll('kai-cards').forEach((el) => el.remove());
});

const env = (data: unknown, type = 'confirm'): CardEnvelope =>
  ({ type, id: 'c1', title: 'Deploy', data } as CardEnvelope);

const VALID = { body: 'Ship it?', actions: [{ id: 'go', label: 'Deploy' }] };
const HARD = { body: 'Ship it?', actions: [] };
const SOFT = { body: 'Ship it?', actions: [1, 2, 3, 4, 5].map((n) => ({ id: `a${n}`, label: `Action ${n}` })) };

async function mount(cards: CardEnvelope[], props: Record<string, unknown> = {}) {
  const el = document.createElement('kai-cards') as HTMLElement & Record<string, unknown>;
  const events: CardEvent[] = [];
  el.addEventListener(CARD_EVENT_NAME, (e) => events.push((e as CustomEvent<CardEvent>).detail));
  el.cards = cards;
  for (const [k, v] of Object.entries(props)) el[k] = v;
  document.body.append(el);
  await customElements.whenDefined('kai-cards');
  await new Promise((r) => setTimeout(r, 0));
  const root = el.shadowRoot!;
  return {
    el,
    root,
    events,
    errors: () => events.filter((e) => e.kind === 'error'),
    child: () => root.querySelector('kai-confirm'),
    diagnostic: () => root.querySelector('[data-card-invalid]'),
    reason: () => root.querySelector('[data-card-invalid-reason]')?.textContent ?? null,
  };
}

describe('<kai-cards> validation', () => {
  it('leaves a VALID card alone and emits no error', async () => {
    const c = await mount([env(VALID)]);
    expect(c.child()).not.toBeNull();
    expect(c.diagnostic()).toBeNull();
    expect(c.errors()).toHaveLength(0);
  });

  it('HARD: the child element is REPLACED by a diagnostic naming the field', async () => {
    const c = await mount([env(HARD)]);
    // The control for the soft case below: the real <kai-confirm> is not in the tree.
    expect(c.child()).toBeNull();
    expect(c.diagnostic()).not.toBeNull();
    expect(c.reason()).toBe('(root).actions: fewer than minItems 1');
    expect(c.errors()).toEqual([
      { kind: 'error', cardId: 'c1', message: 'invalid card data (hard): (root).actions: fewer than minItems 1' },
    ]);
  });

  it('SOFT: the child element STAYS and an error is still emitted', async () => {
    const c = await mount([env(SOFT)]);
    expect(c.child()).not.toBeNull();
    expect(c.diagnostic()).toBeNull();
    expect(c.errors()).toEqual([
      { kind: 'error', cardId: 'c1', message: 'invalid card data (soft): (root).actions: more than maxItems 4' },
    ]);
  });

  it('el.validateCards = false restores the un-validated behaviour', async () => {
    const c = await mount([env(HARD)], { validateCards: false });
    expect(c.child()).not.toBeNull();
    expect(c.diagnostic()).toBeNull();
    expect(c.errors().filter((e) => e.message.startsWith('invalid card data'))).toHaveLength(0);
  });

  it('the validate-cards ATTRIBUTE works too', async () => {
    // A scalar prop that only worked as a JS property would be a trap: the whole
    // point of the `kai-` contract is that scalars are settable as attributes. The
    // string "false" has to coerce, which is exactly the case that silently fails.
    const el = document.createElement('kai-cards') as HTMLElement & Record<string, unknown>;
    el.setAttribute('validate-cards', 'false');
    el.cards = [env(HARD)];
    document.body.append(el);
    await customElements.whenDefined('kai-cards');
    await new Promise((r) => setTimeout(r, 0));
    expect(el.shadowRoot!.querySelector('kai-confirm')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('[data-card-invalid]')).toBeNull();
  });

  it('does NOT validate a BUILT-IN type the consumer pointed at their own element', async () => {
    // Same rule as the Solid dispatcher: an overridden renderer owns its own shape.
    const c = await mount([env(HARD)], { types: { confirm: 'my-confirm-el' } });
    expect(c.root.querySelector('my-confirm-el')).not.toBeNull();
    expect(c.diagnostic()).toBeNull();
    expect(c.errors()).toHaveLength(0);
  });

  it('does not validate a consumer card type the kit has no schema for', async () => {
    const c = await mount([env({ whatever: [] }, 'my-widget')], { types: { 'my-widget': 'my-widget-el' } });
    expect(c.root.querySelector('my-widget-el')).not.toBeNull();
    expect(c.errors()).toHaveLength(0);
  });

  it('an UNKNOWN type still reports as an unsupported type, not as invalid data', async () => {
    const c = await mount([env({}, 'never-registered')]);
    expect(c.diagnostic()).toBeNull();
    expect(c.root.querySelector('[data-card-fallback]')).not.toBeNull();
    expect(c.errors()).toEqual([
      { kind: 'error', cardId: 'c1', message: 'Unsupported card type: never-registered' },
    ]);
  });

  it('tiers each card in a LIST independently', async () => {
    const c = await mount([
      { type: 'confirm', id: 'ok', data: VALID },
      { type: 'confirm', id: 'bad', data: HARD },
      { type: 'confirm', id: 'meh', data: SOFT },
    ] as CardEnvelope[]);
    // Two real cards (valid + soft) and one diagnostic (hard), not three of a kind.
    expect(c.root.querySelectorAll('kai-confirm')).toHaveLength(2);
    expect(c.root.querySelectorAll('[data-card-invalid]')).toHaveLength(1);
    expect(c.errors().map((e) => e.cardId).sort()).toEqual(['bad', 'meh']);
  });
});
