import { defineWebComponent } from './define';
import { ChoiceCard, type ChoiceCardData, type ChoiceController } from '../components/choice-card';
import type { CardResolution } from '../primitives/card-contract';

interface Props extends Record<string, unknown> {
  /** The choice definition (the CardEnvelope.data). Set as a JS PROPERTY:
   *  `el.data = { prompt, options:[…], allowOther?, submitLabel? }`. Import
   *  `ChoiceCardData` from `@kitn.ai/ui` for the full shape. */
  data?: Record<string, unknown>;
  /** Stable card id correlating every emitted CardEvent. Attribute: `card-id`. */
  cardId?: string;
  /** Heading rendered in the card chrome (= CardEnvelope.title). Attribute: `heading`. */
  heading?: string;
  /** Set when the user resolved this card; renders the read-only view. Property:
   *  `el.resolution = { kind:'action', action:'…' }`. */
  resolution?: Record<string, unknown>;
  /** Controlled selection: the selected option id. When set, the consumer owns
   *  the current pick (RadioGroup `value`). Attribute: `value`. */
  value?: string;
  /** Option id to pre-select on mount (uncontrolled seed). Attribute: `default-value`. */
  defaultValue?: string;
  /** Disable the whole radiogroup + Submit (e.g. while the agent is busy).
   *  Attribute: `disabled`. */
  disabled?: boolean;
}

/** Events fired by `<kai-choice>`. (The terminal submit/dismiss/reopen flow is
 *  emitted via the bubbling `kai-card` contract event — listen for `kai-card`.) */
interface Events {
  /** The selection changed BEFORE submit (a row click or the `select()` method).
   *  Distinct from the terminal `action` verb on the `kai-card` contract event. */
  'kai-value-change': { value: string };
}

/**
 * `<kai-choice>` — a single-select **"pick one of N rich options"** card (set via the
 * `data` property): a prompt + a radiogroup of list rows. Clicking a row **selects** it
 * (no emit, fires `kai-value-change`); the **Submit** button below then emits the Card
 * contract's **`action`** verb up a bubbling **`kai-card`** CustomEvent (`{ kind:'action',
 * cardId, action: option.id, payload? }`) and resolves the card so the same pick can't
 * double-fire. An optional `allowOther` free-text escape appends a selectable "Other…" row
 * that reveals an inline input; the same Submit emits `action:'__other__'` with `{ text }`.
 * Also emits `ready` on mount and `error` for a malformed definition (inline error). Routes
 * through a `CardProvider` when present, else the bubbling `kai-card` event. Isolated in
 * Shadow DOM; theme-aware via the shared tokens.
 *
 * Supports controlled selection (`value`), an uncontrolled seed (`defaultValue`), a
 * group-level `disabled`, and instance methods `focus()`/`select(id)`/`send()`/
 * `dismiss()`/`reopen()`.
 */
defineWebComponent<Props, Events>(
  'kai-choice',
  {
    data: undefined,
    cardId: undefined,
    heading: undefined,
    resolution: undefined,
    value: undefined,
    defaultValue: undefined,
    disabled: undefined,
  },
  (props, { element, dispatch, flag, expose }) => {
    // Pattern C: the ChoiceCard owns selection/submit/dismiss state and hands up a
    // controller; the facade captures it and exposes delegating methods. The card's
    // own paths still fire (select → kai-value-change; send → kai-card `action`;
    // dismiss/reopen → kai-card `dismiss`/`reopen`).
    let controller: ChoiceController | undefined;
    expose({
      /** Focus the radiogroup roving tab stop (or the Other input when selected). */
      focus: (options?: FocusOptions) => controller?.focus(options),
      /** Select an option by id locally: no emit, fires kai-value-change (same as a
       *  row click). Lets a consumer pre-highlight or drive selection externally. */
      select: (optionId: string) => controller?.select(optionId),
      /** Submit the current selection: emits the `action` verb on kai-card and
       *  resolves the card (single-shot). Named `send`, not `submit`, per the shared
       *  vocabulary. */
      send: () => controller?.send(),
      /** Trigger the dismiss path: emits `dismiss` on kai-card and optimistically
       *  collapses the card to its re-openable stub. */
      dismiss: () => controller?.dismiss(),
      /** Re-open a dismissed card from its stub: emits `reopen` on kai-card. */
      reopen: () => controller?.reopen(),
    });

    return (
      <ChoiceCard
        data={props.data as ChoiceCardData | undefined}
        cardId={props.cardId ?? (element.id || 'kai-choice')}
        heading={props.heading}
        resolution={props.resolution as CardResolution | undefined}
        value={props.value}
        defaultValue={props.defaultValue}
        disabled={flag('disabled')}
        onValueChange={(value) => dispatch('kai-value-change', { value })}
        controllerRef={(c) => (controller = c)}
        hostElement={element}
      />
    );
  },
);
