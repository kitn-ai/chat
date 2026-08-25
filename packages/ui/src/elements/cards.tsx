// src/elements/cards.tsx
// <kai-cards> — the web-component list dispatcher. Renders one child kai-* element per
// envelope (by type→tag), propagates its theme, and routes children's bubbling
// `kai-card` events through an optional `policy`. The raw events keep bubbling past
// <kai-cards> (composed) so document-level listeners still work. Unknown types render
// the Solid CardFallback inline and emit a contract `error`.
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import { deferApply } from '../utils/defer-apply'; // V2-PORT: on(...,{defer:true}) replacement
import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import { defineWebComponent } from './define';
import type { CardEnvelope, CardEvent, CardPolicy, CardResolution } from '../primitives/card-contract';
import { CARD_EVENT_NAME, emitCardEvent, routeCardEvent } from '../primitives/card-routing';
import { BUILTIN_CARD_TAGS, mergeCardTags } from '../primitives/card-registry';
import type { JsonSchema } from '../primitives/card-validate';
import { cardValidationMessage, validateCardData, type CardValidationReport } from '../primitives/card-validate-cards';
import { hasConsumerSchema } from '../components/card-renderer';
import { CardFallback } from '../components/card-fallback';
// Register the built-in child card elements so that importing <kai-cards> is self-contained.
import './form';
import './confirm-card';
import './tasks';
import './choice';
import './link-preview';
import './embed';

interface Props extends Record<string, unknown> {
  /** The stream of card envelopes to render. Set as a JS PROPERTY: `el.cards = [...]`. */
  cards?: CardEnvelope[];
  /** Optional type→tag overrides/additions (merged over the built-ins). Property: `el.types`.
   *  Typed as a plain string map (not the `CardTagMap` alias) so the generated React
   *  wrapper inlines it instead of emitting an unresolved named type. */
  types?: Record<string, string>;
  /** JSON Schemas for the card types this app renders, keyed by envelope type. The
   *  companion of `types`, which says what DRAWS a card while this says what a
   *  VALID one looks like. An OBJECT, so it is a JS property only: `el.schemas = {
   *  'pricing-table': pricingSchema }`, never an attribute.
   *  `createCardRegistry(...).validationSchemas` is exactly this shape.
   *
   *  Without it the kit validates its own seven built-ins and leaves your own card
   *  type, the one your app actually cares about, as the only unchecked thing on
   *  screen. A schema here WINS over a built-in of the same name, matching
   *  `mergeCardTags`, where your entry is spread over ours.
   *
   *  Typed `Record<string, object>` rather than `Record<string, JsonSchema>`
   *  deliberately: an imported `.json` schema widens `"type"` to `string`, and an
   *  authored one carries `$schema`/`title`/`description`/`additionalProperties`,
   *  so the tighter type would reject both of the normal ways to supply one. See
   *  `CardSchemaMap` in components/card-renderer.tsx. */
  schemas?: Record<string, object>;
  /** Optional CardPolicy handling child events. Property: `el.policy`. */
  policy?: CardPolicy;
  /** Validate each envelope's `data` against the schema for its type before
   *  rendering it, using a built-in's own schema or yours from `schemas`. Default
   *  `true`; set `validate-cards="false"` (or `el.validateCards = false`) to opt
   *  out. A hard failure (wrong type, a missing required field) renders a
   *  diagnostic naming the field instead of the card; a soft failure (bounds)
   *  renders the card unchanged. Both emit a contract `error` event. On in
   *  production too: a model emitting a bad shape is a production failure mode,
   *  so stripping the check there would hide it from exactly the person who needs
   *  to see it. */
  validateCards?: boolean;
}

/** Events fired by `<kai-cards>`. */
interface Events {
  /** A child card transitioned to a resolved/deferred state (an action was chosen, a
   *  form/tasks submission landed, or it was dismissed). Re-emitted off the host as
   *  a non-bubbling convenience event so a consumer can observe resolution centrally
   *  without diffing the cards array. `detail` = `{ cardId, resolution }`. (A
   *  `reopen` un-resolves a card and has no `CardResolution`, so it does NOT fire
   *  this; observe reopen via the underlying bubbling `kai-card` event.) */
  'kai-card-resolved': { cardId: string; resolution: CardResolution };
}

/** Map a terminal/deferred child CardEvent to the CardResolution it produces. Returns
 *  `undefined` for events that don't resolve a card (ready/error/etc.) and for
 *  `reopen` (which clears resolution → no CardResolution to convey). */
function resolutionFromEvent(e: CardEvent): CardResolution | undefined {
  switch (e.kind) {
    case 'action':
      return { kind: 'action', action: e.action, payload: e.payload };
    case 'submit':
      return { kind: 'submit', data: e.data };
    case 'dismiss':
      return { kind: 'dismissed' };
    default:
      return undefined;
  }
}

/** A single resolved child: a known kai-* tag (props set imperatively), a diagnostic
 *  for data that cannot render, or the unknown-type fallback. */
function CardSlot(props: {
  envelope: CardEnvelope;
  tag?: string;
  theme: string;
  validate: boolean;
  schemas?: Record<string, object>;
  emit: (e: CardEvent) => void;
}): JSX.Element {
  let ref: HTMLElement | undefined;

  // MIRRORS src/remote/provider-runtime.ts:139-147, the same way
  // components/card-renderer.tsx does. The remote (iframe) transport has validated
  // every incoming envelope since the contract landed and this native one did not,
  // so the same bad payload was caught in one transport and rendered silently in the
  // other. Two tiers: `hard` (nothing to render) replaces the card with a diagnostic
  // naming the field, `soft` (bounds) renders the card untouched. Both emit `error`.
  //
  // OUR schema applies only to OUR element: `types` lets a consumer point a built-in
  // card type at their own element (`el.types = { confirm: 'my-confirm-el' }`), and
  // our schema describes our element's data, not theirs.
  //
  // A schema the CONSUMER registered through `el.schemas` runs the other way: they
  // wrote it about their own card, and it is the shape their model was told to
  // emit, so it applies whichever element draws the type. That is what validates a
  // `pricing-table` — nobody's built-in, and until this prop existed the one card in
  // the app that nothing checked. Same rule as components/card-renderer.tsx, which
  // compares component identity where this compares tag identity; `hasConsumerSchema`
  // is shared with it so the gate is spelled once.
  const report = createMemo<CardValidationReport | null>(() => {
    if (!props.validate) return null;
    if (!hasConsumerSchema(props.schemas, props.envelope.type) && props.tag !== BUILTIN_CARD_TAGS[props.envelope.type]) {
      return null;
    }
    // `schemas` is passed even when the gate opened on tag identity, so a consumer
    // schema for a built-in type wins over ours — `schemaFor`'s rule.
    return validateCardData(props.envelope.type, props.envelope.data, props.schemas as Record<string, JsonSchema> | undefined);
  });
  const invalid = () => report()?.tier === 'hard';

  // V2-PORT: one place that stamps the envelope onto the child element — called
  // from the REF (pre-upgrade, the house rule: set WC props in ref callbacks)
  // AND from the reactive effect below for later envelope changes. Seeding in
  // the ref matters under v2: this facade's update effect now lands on the
  // flush AFTER the child's own mount-time effects, so an un-seeded child would
  // transiently validate undefined data and emit a spurious error event.
  const applyEnvelope = (el: HTMLElement, env: typeof props.envelope, theme: string): void => {
    (el as unknown as { data: unknown }).data = env.data;
    (el as unknown as { cardId: string }).cardId = env.id;
    if (env.title != null) (el as unknown as { heading: string }).heading = env.title;
    (el as unknown as { resolution: unknown }).resolution = env.resolution;
    el.setAttribute('theme', theme);
    // Stable, queryable id so the host's getCard()/resolve() can find this child
    // node without relying on the (private, scalar-only) cardId property reflecting.
    el.setAttribute('data-card-id', env.id);
  };

  // Set object/string props as DOM properties on the custom element (reactive).
  // V2-PORT (R1): the envelope/theme reads are the tracked compute; the `ref`
  // read and the property/attribute writes are the apply (the ref is
  // render-produced, so a compute-side read would see undefined at mount).
  createEffect(
    () => ({ env: props.envelope, theme: props.theme }),
    ({ env, theme }) => {
      if (ref) applyEnvelope(ref, env, theme);
    },
  );
  // Hoist the unknown-type error emit to onSettled to avoid side-effect-in-JSX lint issue
  // and to ensure exactly one error fires.
  onSettled(() => {
    if (!props.tag) {
      props.emit({ kind: 'error', cardId: props.envelope.id, message: `Unsupported card type: ${props.envelope.type}` });
    }
  });
  // One `error` per distinct problem, both tiers. Keyed on the message, not on
  // mount: a consumer re-assigning `el.cards` per stream chunk hands this a new
  // envelope object each time, so an identity-triggered emit would fire per chunk.
  let lastEmitted: string | null = null;
  // V2-PORT: tracked reads in the compute; the dedupe + emit in the apply.
  createEffect(
    () => ({ r: report(), tag: props.tag, cardId: props.envelope.id }),
    ({ r, tag, cardId }) => {
      if (!tag) return; // an unknown TYPE already reported itself in onSettled
      if (!r || r.ok) {
        lastEmitted = null;
        return;
      }
      const message = cardValidationMessage(r);
      if (message === lastEmitted) return;
      lastEmitted = message;
      props.emit({ kind: 'error', cardId, message });
    },
  );

  return (
    <Show
      when={props.tag}
      fallback={<CardFallback type={props.envelope.type} cardId={props.envelope.id} />}
    >
      {(tag) => (
        <Show
          when={invalid()}
          // SOFT and valid both take this branch: the card renders as it does today.
          fallback={<Dynamic component={tag()} ref={(el: HTMLElement) => { ref = el; untrack(() => applyEnvelope(el, props.envelope, props.theme)); }} />}
        >
          <CardFallback type={props.envelope.type} cardId={props.envelope.id} reason={report()!.summary} />
        </Show>
      )}
    </Show>
  );
}

defineWebComponent<Props, Events>(
  'kai-cards',
  { cards: undefined, types: undefined, schemas: undefined, policy: undefined, validateCards: true },
  (props, { element, dispatch, expose }) => {
    // Local working copy of the card list. The `cards` PROP still drives rendering
    // (a new prop array re-seeds this), but holding a settable copy lets the
    // imperative resolve()/dismiss() methods flip one envelope's resolution and
    // re-render the matching child — the imperative twin of a consumer cloning +
    // reassigning the whole cards array. `on(..., { defer: true })` re-seeds only on
    // a genuine prop change (mount uses the createSignal seed below), preserving any
    // pending imperative resolution until the consumer supplies a new prop array.
    const [cards, setCards] = createSignal<CardEnvelope[]>(props.cards ?? []);
    createEffect(() => props.cards, deferApply((next: CardEnvelope[] | undefined) => { setCards(next ?? []); }));

    // Route children's bubbling kai-card events through the policy. Attached to the host
    // element so composed events from each child's shadow root are caught as they bubble.
    // The handler reads `props.policy` at EVENT time (not mount time) so setting
    // `el.policy` after the element is in the DOM — the standard host pattern — works.
    onSettled(() => {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<CardEvent>).detail;
        routeCardEvent(props.policy ?? {}, detail);
        // Additionally re-emit the non-bubbling convenience event when a child
        // transitions to a resolved/deferred state — alongside (not instead of) the
        // existing policy routing + the raw bubbling kai-card event.
        const resolution = resolutionFromEvent(detail);
        if (resolution) dispatch('kai-card-resolved', { cardId: detail.cardId, resolution });
      };
      element.addEventListener(CARD_EVENT_NAME, handler as EventListener);
      // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => element.removeEventListener(CARD_EVENT_NAME, handler as EventListener);
    });

    // ── Imperative API (instance methods on the host) ──────────────────────────
    // Pattern B: the methods operate on the facade's own working copy + the rendered
    // child DOM nodes. Resolving an envelope sets its `resolution`, which flows down
    // through CardSlot's effect (sets the child's `resolution` prop) so the child
    // re-renders into its chromed read-only view.
    const resolveCard = (cardId: string, resolution: CardResolution) =>
      setCards((list) =>
        list.some((env) => env.id === cardId)
          ? list.map((env) => (env.id === cardId ? { ...env, resolution } : env))
          : list,
      );
    expose({
      /** Programmatically resolve a child card by id: set that envelope's
       *  `resolution` so the child re-renders into its read-only/resolved view. The
       *  imperative twin of the consumer mutating the cards array. No-op for an
       *  unknown id. */
      resolve: (cardId: string, resolution: CardResolution) => resolveCard(cardId, resolution),
      /** Collapse a card to its re-openable stub from the host side. Convenience for
       *  `resolve(cardId, { kind: 'dismissed' })`. */
      dismiss: (cardId: string) => resolveCard(cardId, { kind: 'dismissed' }),
      /** Return the live child element node for a card id (or null) so consumers can
       *  call that card's own methods (focus/expand/…) without a shadow-DOM query. */
      getCard: (cardId: string): HTMLElement | null =>
        element.shadowRoot?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`) ?? null,
    });

    // Read the facade's REACTIVE `theme` prop, not element.getAttribute (which is
    // not a tracked dependency) — otherwise a theme change on <kai-cards> after the
    // children first render never propagates, leaving each child card stuck on its
    // initial 'auto' (which follows the OS, so cards looked "always dark").
    const theme = () => ((props as { theme?: string }).theme ?? 'auto');
    const tags = () => mergeCardTags(props.types);
    return (
      <div class="flex flex-col gap-3">
        <For each={cards()}>
          {(env) => (
            <CardSlot
              envelope={env}
              tag={tags()[env.type]}
              theme={theme()}
              validate={props.validateCards !== false}
              schemas={props.schemas}
              emit={(e) => emitCardEvent(element, e)}
            />
          )}
        </For>
      </div>
    );
  },
);
