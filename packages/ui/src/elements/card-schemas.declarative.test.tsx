/**
 * THE HEADLINE: a developer's OWN card type is validated IN THE BROWSER.
 *
 * Everything else in the card-validation suite checks one of OUR seven built-ins.
 * That is the demo. This file is the point: a consumer registers `pricing-table`
 * with a schema, a model emits a malformed one, and the browser replaces it with a
 * diagnostic naming the failing field path — the same outcome a built-in gets, and
 * the same outcome the SERVER-side `registry.validate()` already produced.
 *
 * Asserted through the REAL COMPOSITION (`<kai-thread>`, `<kai-chat>`,
 * `<kai-message>` mounted with a `card` message part), not against
 * `validateCardData` directly. A unit test on the validator passes with the third
 * argument threaded or not, so it proves nothing about the dispatcher — which is
 * exactly how the gap survived: `validateCardData(type, data, schemas?)` already
 * took the argument and NOTHING passed it.
 *
 * Each test names the branch it expects to take, because the gate has four of them:
 *   1. consumer schema present  -> validate against THEIRS (whatever renders)
 *   2. no consumer schema, built-in renderer     -> validate against OURS
 *   3. no consumer schema, overridden renderer   -> do NOT validate  (pinned below)
 *   4. no consumer schema, unknown type          -> nothing to check
 */
import { describe, it, expect, afterEach } from 'vitest';
import './thread';
import './chat';
import './message';
import { createCardRegistry } from '../schemas/registry';
import type { CardSchema } from '../schemas';
import type { KaiThreadElement } from './element-types';

// jsdom doesn't implement Element.scrollTo; mounting <kai-thread>/<kai-chat> calls
// it via the stick-to-bottom primitive on a requestAnimationFrame, which otherwise
// throws as an unhandled async error and fails the whole run. Same shim as
// thread-cards.declarative.test.tsx.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

afterEach(() => {
  document.querySelectorAll('kai-thread, kai-chat, kai-message').forEach((el) => el.remove());
});

/**
 * A developer's own card schema, AS AUTHORED — `$schema`, `title`, `description`
 * and `additionalProperties` left in.
 *
 * That is not decoration. It is the reason the prop is typed `Record<string,
 * object>` and not `Record<string, JsonSchema>`: `JsonSchema` describes none of
 * those four keywords and pins `type` to a literal union, so this object literal
 * (and every `import schema from './x.schema.json'`, where TS widens `type` to
 * `string`) would be a TYPE ERROR against the tighter type. src/schemas/index.ts
 * widens `CardSchema` for exactly this reason. If someone tightens the prop, this
 * literal stops compiling under `tsconfig.tests.json` and says so.
 */
const PRICING_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Pricing table',
  description: 'A comparison of subscription plans.',
  type: 'object',
  required: ['plans'],
  additionalProperties: false,
  properties: {
    plans: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', maxLength: 40 },
          price: { type: 'number', minimum: 0 },
        },
      },
    },
  },
};

/** HARD: the model named a plan and forgot to price it. Nothing to draw. */
const HARD = { plans: [{ name: 'Pro' }] };
/** SOFT: four plans where the schema caps at three. Draws four rows today. */
const SOFT = { plans: [1, 2, 3, 4].map((n) => ({ name: `Plan ${n}`, price: n * 10 })) };
const VALID = { plans: [{ name: 'Pro', price: 20 }] };

const cardMessage = (data: unknown, type = 'pricing-table') => [
  {
    id: 'm1',
    role: 'assistant',
    parts: [{ type: 'card', envelope: { type, id: 'c1', data } }],
  },
];

async function mount(tag: string, props: Record<string, unknown>) {
  const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
  for (const [k, v] of Object.entries(props)) el[k] = v;
  document.body.append(el);
  await customElements.whenDefined(tag);
  await new Promise((r) => setTimeout(r, 0));
  const root = el.shadowRoot!;
  return {
    el,
    root,
    card: () => root.querySelector('my-pricing-table'),
    /** The built-in ConfirmCard's own marker: its action buttons carry data-action-id. */
    confirmButtons: () => root.querySelectorAll('[data-action-id]'),
    diagnostic: () => root.querySelector('[data-card-invalid]'),
    reason: () => root.querySelector('[data-card-invalid-reason]')?.textContent ?? null,
  };
}

describe('a consumer card type WITH a registered schema is validated', () => {
  it('<kai-thread>: HARD replaces the custom element with a diagnostic naming the field path', async () => {
    // Branch 1. Before the schemas prop existed this rendered <my-pricing-table>
    // with a priceless plan and said nothing at all.
    const c = await mount('kai-thread', {
      cardTypes: { 'pricing-table': 'my-pricing-table' },
      cardSchemas: { 'pricing-table': PRICING_SCHEMA },
      messages: cardMessage(HARD),
    });
    expect(c.card()).toBeNull();
    expect(c.diagnostic()).not.toBeNull();
    // The FIELD PATH, inside the array, not "invalid card data". The product claim.
    expect(c.reason()).toBe('(root).plans[0].price: required');
    expect(c.diagnostic()!.textContent).toContain('pricing-table');
  });

  it('<kai-thread>: SOFT renders the custom element unchanged', async () => {
    // Branch 1, soft half — the control for the test above. One keyword apart
    // (maxItems vs required) and the card survives, so nothing but the TIER can
    // explain the difference in outcome.
    const c = await mount('kai-thread', {
      cardTypes: { 'pricing-table': 'my-pricing-table' },
      cardSchemas: { 'pricing-table': PRICING_SCHEMA },
      messages: cardMessage(SOFT),
    });
    expect(c.card()).not.toBeNull();
    expect((c.card() as HTMLElement & { data?: unknown }).data).toEqual(SOFT);
    expect(c.diagnostic()).toBeNull();
  });

  it('<kai-thread>: a VALID payload is untouched', async () => {
    const c = await mount('kai-thread', {
      cardTypes: { 'pricing-table': 'my-pricing-table' },
      cardSchemas: { 'pricing-table': PRICING_SCHEMA },
      messages: cardMessage(VALID),
    });
    expect(c.card()).not.toBeNull();
    expect(c.diagnostic()).toBeNull();
  });

  it('<kai-chat>: the same card, the same diagnostic', async () => {
    const c = await mount('kai-chat', {
      cardTypes: { 'pricing-table': 'my-pricing-table' },
      cardSchemas: { 'pricing-table': PRICING_SCHEMA },
      messages: cardMessage(HARD),
    });
    expect(c.card()).toBeNull();
    expect(c.reason()).toBe('(root).plans[0].price: required');
  });

  it('<kai-message>: the same card, the same diagnostic', async () => {
    const c = await mount('kai-message', {
      cardTypes: { 'pricing-table': 'my-pricing-table' },
      cardSchemas: { 'pricing-table': PRICING_SCHEMA },
      message: cardMessage(HARD)[0],
    });
    expect(c.card()).toBeNull();
    expect(c.reason()).toBe('(root).plans[0].price: required');
  });
});

describe('createCardRegistry drives the element end to end', () => {
  it('<kai-thread>: registry.tags + registry.validationSchemas, and the shapes COMPOSE', async () => {
    // The point of the registry is one declaration feeding both ends. This asserts
    // the client end of that: the two members go onto the two props verbatim, with
    // no reshaping in between, and the card is checked in the browser the same way
    // `registry.validate()` checks it on the server.
    const registry = createCardRegistry({
      custom: { 'pricing-table': { schema: PRICING_SCHEMA as CardSchema, tag: 'my-pricing-table' } },
    });

    // A COMPILE-TIME assertion against the GENERATED public element type — the one
    // a consumer's `tsc` reads — not against a shape re-typed here, which would
    // assert nothing about the element. It fails under `tsconfig.tests.json` if
    // `cardSchemas` is missing from element-types.d.ts (i.e. the generated artifact
    // was not regenerated), and it fails if the prop is ever tightened to something
    // `Readonly<Record<string, JsonSchema>>` does not satisfy. Watched failing on
    // both counts before this line was kept.
    const typed = document.createElement('kai-thread') as KaiThreadElement;
    typed.cardTypes = registry.tags;
    typed.cardSchemas = registry.validationSchemas;

    const c = await mount('kai-thread', {
      cardTypes: registry.tags,
      cardSchemas: registry.validationSchemas,
      messages: cardMessage(HARD),
    });
    expect(c.card()).toBeNull();
    expect(c.reason()).toBe('(root).plans[0].price: required');
    // The server half of the same registry agrees, so the two ends cannot drift
    // into disagreeing about what a valid pricing-table is.
    expect(registry.validate('pricing-table', HARD)?.summary).toBe('(root).plans[0].price: required');
  });
});

describe('the regression direction: nothing registered, nothing changes', () => {
  it('<kai-thread>: a consumer card type with NO schema still renders unchecked', async () => {
    // Branch 4. This is what shipped before the schemas prop, and it must be what
    // still happens when a developer registers a tag and no schema.
    const c = await mount('kai-thread', {
      cardTypes: { 'pricing-table': 'my-pricing-table' },
      messages: cardMessage(HARD),
    });
    expect(c.card()).not.toBeNull();
    expect(c.diagnostic()).toBeNull();
  });

  it('<kai-thread>: a BUILT-IN card with no schemas prop behaves exactly as before', async () => {
    // Branch 2, untouched: our confirm schema still fires on our confirm card with
    // no registry anywhere in sight.
    const c = await mount('kai-thread', {
      messages: cardMessage({ body: 'Ship it?', actions: [] }, 'confirm'),
    });
    // A non-overridden built-in inside a thread renders the SOLID ConfirmCard, not
    // a <kai-confirm> element (cardComponentsFromTags short-circuits to the
    // component), so its own marker is what proves presence or absence here.
    expect(c.confirmButtons()).toHaveLength(0);
    expect(c.reason()).toBe('(root).actions: fewer than minItems 1');
  });

  it('<kai-thread>: an unrelated registered schema does not leak onto a built-in', async () => {
    // Branch 2 with a registry present: registering `pricing-table` must not change
    // what `confirm` is checked against.
    const c = await mount('kai-thread', {
      cardTypes: { 'pricing-table': 'my-pricing-table' },
      cardSchemas: { 'pricing-table': PRICING_SCHEMA },
      messages: cardMessage({ body: 'Ship it?', actions: [{ id: 'go', label: 'Deploy' }] }, 'confirm'),
    });
    expect(c.confirmButtons()).toHaveLength(1);
    expect(c.diagnostic()).toBeNull();
  });
});

describe('the overridden-built-in rule survives', () => {
  it('<kai-thread>: an overridden built-in with NO schema of its own is NOT validated', async () => {
    // Branch 3, the rule that predates this change. `cardTypes` points `confirm` at
    // the consumer's element, so OUR confirm schema no longer describes what is on
    // screen and must not be applied to it.
    const c = await mount('kai-thread', {
      cardTypes: { confirm: 'my-confirm-el' },
      cardSchemas: { 'pricing-table': PRICING_SCHEMA },
      messages: cardMessage({ body: 'Ship it?', actions: [] }, 'confirm'),
    });
    expect(c.root.querySelector('my-confirm-el')).not.toBeNull();
    expect(c.diagnostic()).toBeNull();
  });

  it('<kai-thread>: an overridden built-in WITH a schema of its own is validated against THEIRS', async () => {
    // Branch 1 over a built-in name: the consumer replaced our confirm card AND
    // told us its shape, so their shape is the one that applies. Same consumer-wins
    // direction as mergeCardTags and as `schemaFor` in card-validate-cards.ts.
    const c = await mount('kai-thread', {
      cardTypes: { confirm: 'my-confirm-el' },
      cardSchemas: { confirm: { type: 'object', required: ['question'] } },
      messages: cardMessage({ body: 'Ship it?', actions: [] }, 'confirm'),
    });
    expect(c.root.querySelector('my-confirm-el')).toBeNull();
    // THEIR field name, not ours: proof the consumer schema won rather than the
    // built-in firing by coincidence (ours would have said `(root).actions`).
    expect(c.reason()).toBe('(root).question: required');
  });
});
