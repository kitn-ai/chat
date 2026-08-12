import { defineWebComponent } from './define';
import { ConfirmCard, type ConfirmCardData, type ConfirmController } from '../components/confirm-card';
import type { CardResolution } from '../primitives/card-contract';

interface Props extends Record<string, unknown> {
  /** The confirm definition (the CardEnvelope.data). Set as a JS PROPERTY:
   *  `el.data = { body, tone, actions:[…] }`. Import `ConfirmCardData` from
   *  `@kitn.ai/ui` for the full shape. */
  data?: Record<string, unknown>;
  /** Stable card id correlating every emitted CardEvent. Attribute: `card-id`. */
  cardId?: string;
  /** Heading rendered in the card chrome (= CardEnvelope.title). Attribute: `heading`. */
  heading?: string;
  /** Focus the default action on mount (off by default, so nothing steals
   *  focus). Attribute: `autofocus`. */
  autofocus?: boolean;
  /** Set when the user resolved this card; renders the read-only view. Property:
   *  `el.resolution = { kind:'action', action:'…' }`. */
  resolution?: Record<string, unknown>;
}

/**
 * `<kai-confirm>` — a named-intent **approval** card (set via the `data` property):
 * a title + body + a small set of action buttons. Activating an action emits the
 * Card contract's **`action`** verb up a bubbling **`kai-card`** CustomEvent
 * (`{ kind:'action', cardId, action, payload }`) and resolves the card so the same
 * approval can't double-fire. Also emits `ready` on mount, `dismiss` for the
 * optional close affordance, and `error` for a malformed definition (inline error).
 * Routes through a `CardProvider` when present, else the bubbling `kai-card` event.
 * Isolated in Shadow DOM; theme-aware via the shared kit tokens.
 *
 * Exposes instance methods `focus()`/`confirm(actionId?)`/`dismiss()`/`reopen()`
 * that drive the same internal paths as the buttons.
 */
defineWebComponent<Props>(
  'kai-confirm',
  {
    data: undefined,
    cardId: undefined,
    heading: undefined,
    autofocus: false,
    resolution: undefined,
  },
  (props, { element, flag, expose }) => {
    // Pattern C: the ConfirmCard owns the action/dismiss state and hands up a
    // controller; the facade captures it and exposes delegating methods. The card's
    // own paths still fire (confirm → kai-card `action`; dismiss/reopen → kai-card
    // `dismiss`/`reopen`).
    let controller: ConfirmController | undefined;
    expose({
      /** Focus the default action button (or the first action if none is default).
       *  The same target `autofocus` focuses on mount, but on demand. */
      focus: (options?: FocusOptions) => controller?.focus(options),
      /** Activate an action by id: emits the `action` verb on kai-card and resolves
       *  the card (single-shot). With no id, invokes the default action. */
      confirm: (actionId?: string) => controller?.confirm(actionId),
      /** Trigger the dismiss path: emits `dismiss` on kai-card and optimistically
       *  collapses the card to its re-openable stub. */
      dismiss: () => controller?.dismiss(),
      /** Re-open a dismissed card from its stub: emits `reopen` on kai-card. */
      reopen: () => controller?.reopen(),
    });

    return (
      <ConfirmCard
        data={props.data as ConfirmCardData | undefined}
        cardId={props.cardId ?? (element.id || 'kai-confirm')}
        heading={props.heading}
        autofocus={flag('autofocus')}
        resolution={props.resolution as CardResolution | undefined}
        controllerRef={(c) => (controller = c)}
        hostElement={element}
      />
    );
  },
);
