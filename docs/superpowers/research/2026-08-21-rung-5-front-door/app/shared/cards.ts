/**
 * The card types this console renders, declared ONCE for both ends.
 *
 * `createCardRegistry` is the shape the client and the route both take: the
 * client hands `tags` / `validationSchemas` to `<Chat>`, and `cardTools(cards, …)`
 * projects the same declaration into the tool definitions a real model would be
 * offered. Two copies of "which cards exist" is how they drift.
 *
 *
 * WHY THESE ARE CUSTOM TYPES AND `use` IS EMPTY.
 *
 * This is the one non-obvious decision in the app, and it is forced.
 *
 * `<kai-chat>` draws the seven BUILT-IN card types with the kit's internal Solid
 * components. Those components render, and that is all they do: no `kai-card`
 * event is dispatched anywhere in the tree — not on the card, not on `<kai-chat>`,
 * not on `document` — and `<kai-chat>` carries no `policy` prop. A `confirm` card
 * emitted as a built-in therefore draws perfect Approve/Reject buttons that the
 * host can never hear. (Verified: a click produces no event on any node, and
 * `listenForCardEvents` on the chat element never fires. The `policy` prop and the
 * `kai-card-resolved` event live on `<kai-cards>`, which is a different surface.)
 *
 * `cardTypes` is the documented way to say WHAT DRAWS a card, and for a type the
 * kit does not know it dispatches to the custom element tag you name. Those tags —
 * `<kai-confirm>`, `<kai-form>`, `<kai-choice>`, `<kai-tasks>` — are the kit's own
 * card ELEMENTS, and an element does emit `kai-card`, bubbling and composed, which
 * is exactly what `listenForCardEvents` on `<kai-chat>` is waiting for.
 *
 * So the four types below are declared as this app's own, each pointing at the
 * kit's element for that card and carrying the kit's own authored schema for it.
 * The behaviour and the contract are the kit's; only the names are ours, which is
 * why they read as ops verbs (`kai_approval`, `kai_parameters`) rather than as
 * aliases. `use: []` because an app whose generative UI is entirely its own is a
 * case the registry names explicitly — and here, a built-in would be the one card
 * on screen the operator could not answer.
 */
import { cardSchemas, createCardRegistry } from '@kitn.ai/ui/schemas';

export const cards = createCardRegistry({
  use: [],
  custom: {
    approval: {
      schema: cardSchemas.confirm,
      tag: 'kai-confirm',
      description:
        'Propose a consequential, destructive or irreversible operation and wait for the operator to approve or reject it. Never act first.',
    },
    parameters: {
      schema: cardSchemas.form,
      tag: 'kai-form',
      description:
        'Collect the parameters an operation needs — region, change ticket, an operator note — instead of guessing them.',
    },
    options: {
      schema: cardSchemas.choice,
      tag: 'kai-choice',
      description:
        'Offer the operator a single-select set of strategies when several ways of doing the same thing differ in blast radius.',
    },
    checklist: {
      schema: cardSchemas.tasks,
      tag: 'kai-tasks',
      description:
        'Report the steps of a multi-step operation as a live checklist that ticks along as each step lands.',
    },
  },
});

/** The envelope types the assistant may emit, for the route's own assertion. */
export const ALLOWED_CARD_TYPES: ReadonlySet<string> = new Set(cards.types);

/** Named so a handler branches on a value rather than a loose string literal. */
export const CARD = {
  approval: 'approval',
  parameters: 'parameters',
  options: 'options',
  checklist: 'checklist',
} as const;
