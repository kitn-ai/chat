// src/components/card-renderer.tsx
// The Solid single-envelope dispatcher: pick the card for envelope.type and render it
// with the envelope spread onto its props. Routing uses the ambient CardProvider
// (useCardHost). Unknown type → CardFallback + a one-shot contract `error` emit.
// Invalid data → two-tier validation, mirroring the remote transport; see below.
import { createEffect, createMemo, untrack, Show, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { CardContext, CardEnvelope, CardHost } from '../primitives/card-contract';
import { useCardHost } from '../primitives/card-host';
import { emitCardEvent } from '../primitives/card-routing';
import { BUILTIN_CARD_COMPONENTS, mergeCardComponents, type CardComponentMap } from '../primitives/card-registry';
import type { JsonSchema } from '../primitives/card-validate';
import { cardValidationMessage, validateCardData, type CardValidationReport } from '../primitives/card-validate-cards';
import { CardFallback } from './card-fallback';

/**
 * Consumer card schemas by envelope type: `{ 'pricing-table': pricingSchema }`.
 *
 * `object`, NOT `JsonSchema`, and that is measured rather than lazy. A real schema
 * is either imported from a `.json` file — where TypeScript widens `"type": "object"`
 * to `string`, which `JsonSchema`'s literal union rejects — or written out with the
 * `$schema` / `title` / `description` / `additionalProperties` keywords that
 * `JsonSchema` does not describe at all, which excess-property checking rejects.
 * Both are the ordinary case, so the tighter type would make the normal way of
 * supplying a schema a compile error. `src/schemas/index.ts` widens `CardSchema`
 * for exactly this reason and says so at length (lines 92-110 there).
 *
 * The value is handed straight to `validateCardData`, which reads only the keywords
 * `validateAgainstSchema` implements and ignores the rest.
 */
export type CardSchemaMap = Record<string, object>;

export interface CardRendererProps {
  envelope: CardEnvelope;
  /** Add/override type→component entries (merged over the built-ins). */
  types?: CardComponentMap;
  /**
   * JSON Schemas for the card types this app renders, keyed by `envelope.type`.
   * `createCardRegistry(...).validationSchemas` is exactly this shape.
   *
   * The companion of `types`, and the half that was missing: `types` says WHAT
   * draws a `pricing-table`, `schemas` says what a VALID one looks like. Without it
   * the kit checks its own seven built-ins and leaves the developer's own card —
   * the one the app actually cares about — as the only unvalidated thing on screen.
   *
   * A schema given here WINS over a built-in of the same name, matching
   * `mergeCardComponents`, where the consumer's entry is spread over ours.
   */
  schemas?: CardSchemaMap;
  /**
   * Validate `envelope.data` against the built-in schema for `envelope.type` before
   * rendering. Default `true`.
   *
   * ON IN PRODUCTION TOO, DELIBERATELY. The obvious alternative, stripping the check
   * from production builds, inverts the point: a model emitting a bad shape is a
   * production failure mode, so stripping it means the developer's USERS get the
   * broken card while the developer's laptop looks fine. The cost is the projected
   * schema data for all seven card types, measured by building this package twice
   * (once with the projection stubbed to `{}`) rather than estimated: +834 B gzip on
   * `dist/index.js` and +775 B gzip on the elements register bundle. That is below
   * the noise floor of a package that already ships a Solid runtime and `marked`.
   *
   * Set `false` to opt out. A type with no schema at all — no built-in, and none
   * supplied through `schemas` — is never validated either way.
   */
  validateCards?: boolean;
  /**
   * The custom-element host node to emit off when no `CardProvider` is above this
   * renderer: events leave as the bubbling, composed `kai-card` CustomEvent
   * (`emitCardEvent`), so `listenForCardEvents(element)` — or a plain
   * `addEventListener('kai-card', …)` on the element — receives them.
   *
   * This is what makes cards INSIDE `<kai-chat>`/`<kai-message>`/`<kai-thread>`
   * interactive: those facades pass their own host element down here, and
   * with neither this nor a `CardProvider` every emit — ready/action/submit/
   * dismiss/reopen and the contract `error` — used to be silently discarded.
   * An ambient `CardProvider` still wins when present.
   */
  hostElement?: HTMLElement;
}

/**
 * The effective CardHost: an ambient `CardProvider` when present, otherwise a
 * bubbling-`kai-card` host over `hostElement`, otherwise none (a truly bare card).
 *
 * The fallback's `context()` mirrors the remote transport's `defaultContext()`
 * (`remote/provider-runtime.ts`): the contract return is non-optional, but no
 * native card reads it today — the element facades own theme/locale through
 * `ChatConfig`, not through card context.
 */
function resolveHost(ctxHost: CardHost | undefined, hostElement: HTMLElement | undefined): CardHost | undefined {
  if (ctxHost) return ctxHost;
  if (!hostElement) return undefined;
  const context = (): CardContext => ({ theme: { mode: 'light' }, locale: 'en' });
  return { context, emit: (event) => emitCardEvent(hostElement, event) };
}

/**
 * True when the consumer registered a schema for this type.
 *
 * Spelled out rather than left to `validateCardData` because it is a GATE, not a
 * lookup: a consumer schema is the one thing that authorises validating a renderer
 * that is not ours. `hasOwnProperty` (not `in`) so a type named `toString` cannot
 * pick up `Object.prototype`, and the `typeof` check so a `{ 'x': null }` entry
 * reads as "not registered" instead of matching and then validating against
 * nothing. The same predicate lives in elements/cards.tsx for `<kai-cards>`; the
 * two dispatchers already duplicate this rule (they compare component identity vs
 * tag identity), so keep them in step.
 */
export function hasConsumerSchema(schemas: CardSchemaMap | undefined, type: string): boolean {
  if (!schemas || !Object.prototype.hasOwnProperty.call(schemas, type)) return false;
  const s = schemas[type];
  return typeof s === 'object' && s !== null;
}

export function CardRenderer(props: CardRendererProps): JSX.Element {
  const ctxHost = useCardHost();
  const host = createMemo(() => resolveHost(ctxHost, props.hostElement));
  const map = createMemo(() => mergeCardComponents(props.types));
  const entry = createMemo(() => map()[props.envelope.type]);

  // MIRRORS src/remote/provider-runtime.ts:139-147. That transport runs
  // `validateAgainstSchema(renderer.schema, envelope.data)` and, on failure, renders
  // a placeholder and emits `{ kind: 'error', cardId, message }`. This is the same
  // behaviour on the native path, split into two tiers so a card that renders
  // acceptably today is reported without being replaced. Keep the two in step.
  //
  // WHAT AUTHORISES A CHECK IS A SCHEMA THAT DESCRIBES WHAT IS ON SCREEN.
  //
  // `types` lets a consumer replace a built-in type's renderer with their own
  // (`types={{ confirm: MyConfirm }}`), and `confirm.schema.json` describes OUR
  // ConfirmCard's data, not theirs. Validating a replaced renderer's payload against
  // our schema would reject shapes that are correct for the component actually on
  // screen. So OUR schema applies only to OUR component: the identity check is
  // against BUILTIN_CARD_COMPONENTS, the same object `mergeCardComponents` puts in
  // the map when nothing overrode the type, and the same one elements/message.tsx
  // reuses for a non-overridden built-in.
  //
  // A schema the CONSUMER registered is the other way round: they wrote it about
  // their own card, and it is the shape their model was told to emit, so it applies
  // whichever component draws the type. That covers the case the identity check can
  // never reach — a `pricing-table` that is nobody's built-in — and it re-enables
  // the check on an overridden built-in, where the objection was our schema and not
  // the checking.
  const report = createMemo<CardValidationReport | null>(() => {
    if (props.validateCards === false) return null;
    if (
      !hasConsumerSchema(props.schemas, props.envelope.type) &&
      entry() !== BUILTIN_CARD_COMPONENTS[props.envelope.type]
    ) {
      return null;
    }
    // `schemas` is passed even when the gate opened on renderer identity, so a
    // consumer schema for a built-in type wins over ours — `schemaFor`'s rule.
    return validateCardData(props.envelope.type, props.envelope.data, props.schemas as Record<string, JsonSchema> | undefined);
  });

  // One `error` per distinct problem, both tiers. Keyed on the message rather than
  // on mount because streaming hands this component a NEW envelope object per chunk
  // (that is the documented way to re-render), so an identity-triggered emit would
  // fire once per chunk for one bad card.
  let lastEmitted: string | null = null;
  createEffect(() => {
    const r = report();
    if (!entry()) return; // an unknown TYPE reports itself, once, in UnknownCard
    if (!r || r.ok) {
      lastEmitted = null;
      return;
    }
    const message = cardValidationMessage(r);
    if (message === lastEmitted) return;
    lastEmitted = message;
    host()?.emit({ kind: 'error', cardId: props.envelope.id, message });
  });

  return (
    <Show when={entry()} fallback={<UnknownCard envelope={props.envelope} hostElement={props.hostElement} />}>
      {(comp) => (
        <Show
          when={report()?.tier === 'hard'}
          // SOFT and valid both take this branch: the card renders exactly as it
          // does today. The soft failure is reported through the effect above and
          // changes nothing on screen, which is the whole point of the tiering.
          fallback={<Dynamic component={comp()} envelope={props.envelope} host={host()} />}
        >
          {/* HARD: there is nothing to draw, so name the field instead. */}
          <CardFallback type={props.envelope.type} cardId={props.envelope.id} reason={report()!.summary} />
        </Show>
      )}
    </Show>
  );
}

/** Renders the fallback and emits exactly one `error` (untracked, on first render). */
function UnknownCard(props: { envelope: CardEnvelope; hostElement?: HTMLElement }): JSX.Element {
  const ctxHost = useCardHost();
  untrack(() =>
    resolveHost(ctxHost, props.hostElement)?.emit({
      kind: 'error',
      cardId: props.envelope.id,
      message: `Unsupported card type: ${props.envelope.type}`,
    }),
  );
  return <CardFallback type={props.envelope.type} cardId={props.envelope.id} />;
}

/** Function sugar: renderCard(env) ≡ <CardRenderer envelope={env} />. */
export function renderCard(
  envelope: CardEnvelope,
  opts?: { types?: CardComponentMap; schemas?: CardSchemaMap; validateCards?: boolean },
): JSX.Element {
  return (
    <CardRenderer
      envelope={envelope}
      types={opts?.types}
      schemas={opts?.schemas}
      validateCards={opts?.validateCards}
    />
  );
}
