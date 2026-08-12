// src/components/card-renderer.tsx
// The Solid single-envelope dispatcher: pick the card for envelope.type and render it
// with the envelope spread onto its props. Routing uses the ambient CardProvider
// (useCardHost). Unknown type → CardFallback + a one-shot contract `error` emit.
// Invalid data → two-tier validation, mirroring the remote transport; see below.
import { createEffect, createMemo, untrack, Show, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { CardEnvelope } from '../primitives/card-contract';
import { useCardHost } from '../primitives/card-host';
import { BUILTIN_CARD_COMPONENTS, mergeCardComponents, type CardComponentMap } from '../primitives/card-registry';
import { cardValidationMessage, validateCardData, type CardValidationReport } from '../primitives/card-validate-cards';
import { CardFallback } from './card-fallback';

export interface CardRendererProps {
  envelope: CardEnvelope;
  /** Add/override type→component entries (merged over the built-ins). */
  types?: CardComponentMap;
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
   * Set `false` to opt out. A type with no built-in schema (a consumer's own card)
   * is never validated either way.
   */
  validateCards?: boolean;
}

export function CardRenderer(props: CardRendererProps): JSX.Element {
  const host = useCardHost();
  const map = createMemo(() => mergeCardComponents(props.types));
  const entry = createMemo(() => map()[props.envelope.type]);

  // MIRRORS src/remote/provider-runtime.ts:139-147. That transport runs
  // `validateAgainstSchema(renderer.schema, envelope.data)` and, on failure, renders
  // a placeholder and emits `{ kind: 'error', cardId, message }`. This is the same
  // behaviour on the native path, split into two tiers so a card that renders
  // acceptably today is reported without being replaced. Keep the two in step.
  //
  // ONLY THE BUILT-IN COMPONENT IS VALIDATED, and that is not an optimisation.
  // `types` lets a consumer replace a built-in type's renderer with their own
  // (`types={{ confirm: MyConfirm }}`), and `confirm.schema.json` describes OUR
  // ConfirmCard's data, not theirs. Validating a replaced renderer's payload against
  // our schema would reject shapes that are correct for the component actually on
  // screen. The identity check is against BUILTIN_CARD_COMPONENTS, which is the same
  // object `mergeCardComponents` puts in the map when nothing overrode the type, and
  // the same one elements/message.tsx reuses for a non-overridden built-in.
  const report = createMemo<CardValidationReport | null>(() => {
    if (props.validateCards === false) return null;
    if (entry() !== BUILTIN_CARD_COMPONENTS[props.envelope.type]) return null;
    return validateCardData(props.envelope.type, props.envelope.data);
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
    host?.emit({ kind: 'error', cardId: props.envelope.id, message });
  });

  return (
    <Show when={entry()} fallback={<UnknownCard envelope={props.envelope} />}>
      {(comp) => (
        <Show
          when={report()?.tier === 'hard'}
          // SOFT and valid both take this branch: the card renders exactly as it
          // does today. The soft failure is reported through the effect above and
          // changes nothing on screen, which is the whole point of the tiering.
          fallback={<Dynamic component={comp()} envelope={props.envelope} host={host} />}
        >
          {/* HARD: there is nothing to draw, so name the field instead. */}
          <CardFallback type={props.envelope.type} cardId={props.envelope.id} reason={report()!.summary} />
        </Show>
      )}
    </Show>
  );
}

/** Renders the fallback and emits exactly one `error` (untracked, on first render). */
function UnknownCard(props: { envelope: CardEnvelope }): JSX.Element {
  const host = useCardHost();
  untrack(() =>
    host?.emit({
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
  opts?: { types?: CardComponentMap; validateCards?: boolean },
): JSX.Element {
  return <CardRenderer envelope={envelope} types={opts?.types} validateCards={opts?.validateCards} />;
}
