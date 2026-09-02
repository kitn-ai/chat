/**
 * The Solid dispatcher's half of the native validation, tested for the property that
 * actually matters: HARD and SOFT produce DIFFERENT OBSERVABLE OUTCOMES.
 *
 * A tiering where both paths do the same thing is a tiering in name only, so every
 * test here checks the DOM and the emitted event together, and each tier is asserted
 * against the other as its control:
 *
 *   hard  the real card is GONE and a diagnostic naming the field is in its place
 *   soft  the real card is PRESENT, unchanged, and an error was still emitted
 *
 * The payloads differ by one constraint (`actions: []` vs five actions), so nothing
 * but the tier can explain the difference in outcome.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { CardRenderer } from './card-renderer';
import { cardFromToolCall } from '../schemas/from-tool-call';
import { CardProvider } from '../primitives/card-host';
import type { CardContext, CardEnvelope } from '../primitives/card-contract';

const CTX: CardContext = { theme: { mode: 'light' }, locale: 'en' };

afterEach(cleanup);

const envelope = (data: unknown, type = 'confirm'): CardEnvelope =>
  ({ type, id: 'c1', title: 'Deploy', data } as CardEnvelope);

const VALID = { body: 'Ship it?', actions: [{ id: 'go', label: 'Deploy', style: 'primary' }] };
/** HARD: a confirm card with no decisions. Renders empty chrome today. */
const HARD = { body: 'Ship it?', actions: [] };
/** SOFT: five actions where the schema caps at four. Renders five buttons today. */
const SOFT = { body: 'Ship it?', actions: [1, 2, 3, 4, 5].map((n) => ({ id: `a${n}`, label: `Action ${n}` })) };

function mount(data: unknown, props: { validateCards?: boolean; type?: string } = {}) {
  const onError = vi.fn();
  const result = render(() => (
    <CardProvider context={CTX} policy={{ onError: (cardId, message) => onError(cardId, message) }}>
      <CardRenderer envelope={envelope(data, props.type)} validateCards={props.validateCards} />
    </CardProvider>
  ));
  return { ...result, onError };
}

/** The real confirm card's own marker: its action buttons carry data-action-id. */
const actionButtons = (c: HTMLElement) => c.querySelectorAll('[data-action-id]');
const diagnostic = (c: HTMLElement) => c.querySelector('[data-card-invalid]');

describe('CardRenderer: a VALID card is untouched', () => {
  it('renders the card and emits nothing', () => {
    const { container, onError } = mount(VALID);
    expect(actionButtons(container)).toHaveLength(1);
    expect(diagnostic(container)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('CardRenderer: HARD replaces the card', () => {
  it('renders a diagnostic INSTEAD of the card, naming the field path', () => {
    const { container } = mount(HARD);
    // The control for the soft test below: the real card is gone.
    expect(actionButtons(container)).toHaveLength(0);
    const el = diagnostic(container);
    expect(el).not.toBeNull();
    expect(el).toHaveTextContent('Invalid');
    expect(el).toHaveTextContent('confirm');
    // The field path, not a generic "invalid card". This is the whole product claim.
    expect(container.querySelector('[data-card-invalid-reason]')).toHaveTextContent(
      '(root).actions: fewer than minItems 1',
    );
  });

  it('emits ONE error naming the tier and the path', () => {
    const { onError } = mount(HARD);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('c1', 'invalid card data (hard): (root).actions: fewer than minItems 1');
  });
});

describe('CardRenderer: SOFT renders the card anyway', () => {
  it('renders the REAL card, not a diagnostic', () => {
    const { container } = mount(SOFT);
    // The control for the hard test above: same field, one keyword apart, the card
    // survives. If this ever renders a diagnostic, the tiering has collapsed into one
    // behaviour and the pre-1.0 regression the design exists to prevent has landed.
    expect(actionButtons(container)).toHaveLength(5);
    expect(diagnostic(container)).toBeNull();
  });

  it('still emits ONE error, marked soft', () => {
    const { onError } = mount(SOFT);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('c1', 'invalid card data (soft): (root).actions: more than maxItems 4');
  });
});

describe('CardRenderer: validateCards={false} opts out of both tiers', () => {
  it('falls back to whatever the card itself does, which for confirm names no field', () => {
    // WHAT THE PLAN GOT WRONG, PINNED HERE SO IT IS NOT RE-ASSUMED.
    // The plan describes the un-validated hard case as "an empty confirm card, no
    // signal". Measured, that is not what happens: `ConfirmCard` has an ad-hoc guard
    // of its own (confirm-card.tsx:112) and emits a generic message. What the
    // dispatcher check adds for confirm is the FIELD PATH, plus the same behaviour
    // on the cards that have no guard. See the two tests below for those.
    const { container, onError } = mount(HARD, { validateCards: false });
    expect(diagnostic(container)).toBeNull();
    expect(onError).toHaveBeenCalledWith('c1', "This card couldn't be displayed.");
    expect(onError.mock.calls[0]?.[1]).not.toContain('actions');
  });

  it('renders the soft-invalid card with no event', () => {
    const { container, onError } = mount(SOFT, { validateCards: false });
    expect(actionButtons(container)).toHaveLength(5);
    // The soft tier is covered by no card's own guard: five buttons where the schema
    // caps at four is silent everywhere before this change.
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('CardRenderer: the cases the cards themselves do not handle', () => {
  // Measured across all seven built-ins with validation off and a hard-invalid
  // payload: confirm / choice / tasks / form emit a generic "couldn't be displayed",
  // link names its own field, ARTIFACT emits nothing and renders empty chrome, and
  // EMBED throws. The last two are what the hard tier is really for.

  it('turns embed\'s render-time CRASH into a named diagnostic', () => {
    // `<Embed>` reads `provider` unconditionally and dies on a payload that omits it
    // (`TypeError: Cannot read properties of undefined (reading 'posterUrl')`). The
    // hard tier decides before the card is ever mounted, so the crash cannot happen.
    expect(() => mount({ title: 'A video' }, { type: 'embed', validateCards: false })).toThrow(/posterUrl/);
    cleanup();

    const { container, onError } = mount({ title: 'A video' }, { type: 'embed' });
    expect(onError).toHaveBeenCalledWith('c1', 'invalid card data (hard): (root).provider: required');
    expect(container.querySelector('[data-card-invalid-reason]')).toHaveTextContent('(root).provider: required');
  });

  it('does NOT catch an empty artifact, because that rule lives in `anyOf`', () => {
    // The honest limit, asserted rather than omitted. `artifact` requires `src` OR
    // `files` through a root `anyOf`, which this validator has no applicator for, so
    // `{ tab: 'preview' }` validates and renders the same empty chrome it does today
    // with no event at all. Implementing `anyOf` is what would close this; widening a
    // claim would not.
    const { container, onError } = mount({ tab: 'preview' }, { type: 'artifact' });
    expect(onError).not.toHaveBeenCalled();
    expect(diagnostic(container)).toBeNull();
  });
});

/**
 * The other half of `isCardTool`'s rule, joined to the half that states it.
 *
 * `schemas/from-tool-call.ts` accepts ANY `kai_`-prefixed name on purpose —
 * "generate narrowly, accept broadly, let the renderer be the layer that says a type
 * is unknown" — and pays for that permissiveness with a promise it makes in prose:
 * "a genuinely unknown type is named on screen by the fallback". Until this test
 * existed the two halves lived in two files joined by a COMMENT (from-tool-call.test.ts
 * cites `card-renderer.test.tsx:38` by line number), and a citation is not a check:
 * the accept side could keep passing while the surface side regressed to a blank, and
 * nothing would go red.
 *
 * Worth stating what was measured on 2026-08-12, because the opposite was believed:
 * the surface side WORKS today, and did before this test. `cardFromToolCall('kai_bogus',
 * …)` renders `CardFallback` naming the type through every host — `<kai-chat>`,
 * `<kai-thread>`, `<kai-message>` and `<kai-cards>` — each with exactly one
 * `[data-card-fallback]` carrying `role="alert"` and the text "Unsupported card type:
 * bogus". The belief that it rendered NOTHING came from misreading the header of
 * `mcp/tests/emitted-card-path.live.test.ts`, which says that pointing its
 * fixture at an unregistered type "leaves the text assertion GREEN and fails only on
 * [data-action-id]". That is a true statement about THAT FILE'S assertion scoping —
 * the tool panel echoes the model's arguments a few inches up the thread, so an
 * unscoped text match cannot tell a drawn card from an undrawn one — and it says
 * nothing about whether a fallback drew. It did.
 */
describe('CardRenderer: an unknown type from a TOOL CALL surfaces', () => {
  it('names the type on screen and emits one error, from a real cardFromToolCall envelope', () => {
    // Built by the function a consumer's tool loop actually calls, NOT hand-written,
    // so this fails if `cardFromToolCall` ever starts gating on the built-ins (which
    // would send the call to `runTool` and make the card vanish silently instead).
    const fromTool = cardFromToolCall('kai_bogus', { anything: 1 }, { id: 'call_abc' });
    expect(fromTool).not.toBeNull();
    expect(fromTool!.type).toBe('bogus');

    const onError = vi.fn();
    const { container } = render(() => (
      <CardProvider context={CTX} policy={{ onError: (id, m) => onError(id, m) }}>
        <CardRenderer envelope={fromTool!} />
      </CardProvider>
    ));

    // SURFACED, not merely present: the type is named in the visible text and the
    // node is an alert, so a screen reader gets it too. Asserting only that some
    // node exists would pass on empty chrome, which is the failure `artifact` had.
    const fb = container.querySelector('[data-card-fallback]');
    expect(fb).not.toBeNull();
    expect(fb).toHaveAttribute('role', 'alert');
    expect(fb).toHaveTextContent('Unsupported card type: bogus');
    expect(diagnostic(container)).toBeNull(); // unknown TYPE, not invalid DATA

    // And the id is the provider's tool_call_id verbatim, so the app can attribute
    // the diagnostic back to the call that produced it.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('call_abc', 'Unsupported card type: bogus');
  });
});

describe('CardRenderer: the unknown-TYPE path is unchanged', () => {
  it('still reports an unsupported type, not a validation failure', () => {
    const { container, onError } = mount({ anything: true }, { type: 'never-registered' });
    expect(container.querySelector('[data-card-fallback]')).not.toBeNull();
    expect(diagnostic(container)).toBeNull(); // the unknown-type fallback, not the diagnostic one
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('c1', 'Unsupported card type: never-registered');
  });

  it('does NOT validate a BUILT-IN type whose renderer the consumer replaced', () => {
    // `types` replaces the component, so the shape of `data` is now that component's
    // business. `confirm.schema.json` describes OUR ConfirmCard; applying it to
    // someone else's would reject payloads that are correct for what is on screen.
    // Two existing tests in the suite depend on this
    // (tests/components/card-renderer.test.tsx and
    // src/elements/thread-cards.declarative.test.tsx, both of which override
    // `confirm` with `data: {}`), which is how the rule was found.
    const Custom = (p: { envelope: CardEnvelope }) => <div data-custom>{p.envelope.id}</div>;
    const onError = vi.fn();
    const { container } = render(() => (
      <CardProvider context={CTX} policy={{ onError: (id, m) => onError(id, m) }}>
        <CardRenderer envelope={envelope(HARD)} types={{ confirm: Custom }} />
      </CardProvider>
    ));
    expect(container.querySelector('[data-custom]')).not.toBeNull();
    expect(diagnostic(container)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not validate a consumer type the kit has no schema for', () => {
    const Custom = () => <div data-custom>mine</div>;
    const onError = vi.fn();
    const { container } = render(() => (
      <CardProvider context={CTX} policy={{ onError: (id, m) => onError(id, m) }}>
        <CardRenderer envelope={envelope({ whatever: [] }, 'my-widget')} types={{ 'my-widget': Custom }} />
      </CardProvider>
    ));
    expect(container.querySelector('[data-custom]')).not.toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

/**
 * `schemas` — the consumer's own card types, checked in the browser.
 *
 * These four tests are the whole gate, one branch each. The `types`-only cases
 * above are their controls: same payload, same renderer, no schema, no check.
 */
describe('CardRenderer: a CONSUMER schema is enforced too', () => {
  const Custom = (p: { envelope: CardEnvelope }) => <div data-custom>{p.envelope.id}</div>;
  /** Authored form, `$schema`/`title`/`additionalProperties` left in — the shape a
   *  developer actually has, and the reason `schemas` is not typed `JsonSchema`. */
  const PRICING_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Pricing table',
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
          properties: { name: { type: 'string' }, price: { type: 'number' } },
        },
      },
    },
  };
  const mountCustom = (data: unknown, schemas?: Record<string, object>, types: Record<string, typeof Custom> = { 'pricing-table': Custom }) => {
    const onError = vi.fn();
    const result = render(() => (
      <CardProvider context={CTX} policy={{ onError: (id, m) => onError(id, m) }}>
        <CardRenderer envelope={envelope(data, 'pricing-table')} types={types} schemas={schemas} />
      </CardProvider>
    ));
    return { ...result, onError };
  };

  it('HARD on a consumer card replaces it with a diagnostic naming the field path', () => {
    const { container, onError } = mountCustom({ plans: [{ name: 'Pro' }] }, { 'pricing-table': PRICING_SCHEMA });
    expect(container.querySelector('[data-custom]')).toBeNull();
    expect(container.querySelector('[data-card-invalid-reason]')).toHaveTextContent(
      '(root).plans[0].price: required',
    );
    expect(onError).toHaveBeenCalledWith('c1', 'invalid card data (hard): (root).plans[0].price: required');
  });

  it('SOFT on a consumer card renders it unchanged and still reports', () => {
    const { container, onError } = mountCustom(
      { plans: [1, 2, 3, 4].map((n) => ({ name: `P${n}`, price: n })) },
      { 'pricing-table': PRICING_SCHEMA },
    );
    expect(container.querySelector('[data-custom]')).not.toBeNull();
    expect(diagnostic(container)).toBeNull();
    expect(onError).toHaveBeenCalledWith('c1', 'invalid card data (soft): (root).plans: more than maxItems 3');
  });

  it('the SAME payload with NO schemas prop is untouched', () => {
    // The control. Pre-change behaviour, pinned: without a schema a consumer card
    // renders whatever it was handed and nothing is emitted.
    const { container, onError } = mountCustom({ plans: [{ name: 'Pro' }] });
    expect(container.querySelector('[data-custom]')).not.toBeNull();
    expect(diagnostic(container)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('validateCards={false} still opts a consumer card out', () => {
    const onError = vi.fn();
    const { container } = render(() => (
      <CardProvider context={CTX} policy={{ onError: (id, m) => onError(id, m) }}>
        <CardRenderer
          envelope={envelope({ plans: [{ name: 'Pro' }] }, 'pricing-table')}
          types={{ 'pricing-table': Custom }}
          schemas={{ 'pricing-table': PRICING_SCHEMA }}
          validateCards={false}
        />
      </CardProvider>
    ));
    expect(container.querySelector('[data-custom]')).not.toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('a consumer schema for a BUILT-IN type wins over ours', () => {
    // `schemaFor`'s consumer-wins rule, reaching the dispatcher. The renderer here
    // is OURS (not overridden) and the schema is THEIRS, so the failing field names
    // their field: proof the precedence is real and not a coincidence.
    const onError = vi.fn();
    const { container } = render(() => (
      <CardProvider context={CTX} policy={{ onError: (id, m) => onError(id, m) }}>
        <CardRenderer envelope={envelope(VALID)} schemas={{ confirm: { type: 'object', required: ['question'] } }} />
      </CardProvider>
    ));
    expect(actionButtons(container)).toHaveLength(0);
    expect(container.querySelector('[data-card-invalid-reason]')).toHaveTextContent('(root).question: required');
    expect(onError).toHaveBeenCalledWith('c1', 'invalid card data (hard): (root).question: required');
  });

  it('validates an OVERRIDDEN built-in when the consumer supplied its schema', () => {
    // The overridden-built-in rule is "OUR schema does not describe THEIR card", so
    // supplying theirs re-enables the check. The `types`-only twin of this test (in
    // the block above) must keep passing for this one to mean anything.
    const onError = vi.fn();
    const { container } = render(() => (
      <CardProvider context={CTX} policy={{ onError: (id, m) => onError(id, m) }}>
        <CardRenderer
          envelope={envelope(HARD)}
          types={{ confirm: Custom }}
          schemas={{ confirm: { type: 'object', required: ['question'] } }}
        />
      </CardProvider>
    ));
    expect(container.querySelector('[data-custom]')).toBeNull();
    expect(container.querySelector('[data-card-invalid-reason]')).toHaveTextContent('(root).question: required');
    expect(onError).toHaveBeenCalledWith('c1', 'invalid card data (hard): (root).question: required');
  });
});
