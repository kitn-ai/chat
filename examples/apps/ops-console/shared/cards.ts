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

/**
 * INSIDER CHANGE (D9) — every action id this console IMPLEMENTS on an approval
 * card, declared once for both ends.
 *
 * A live model invented its own ids (`deploy`, `decline`, `cancel`). Nothing
 * rejected them: the card rendered with plausible buttons, `App.onCardAction`
 * switched on ids it had never heard of, and clicking Approve stamped the card
 * resolved and did NOTHING — no run, no refusal, no record. The card schema
 * types `actions[].id` as a string, which is right for the kit (an id is the
 * app's vocabulary, not the kit's) and exactly wrong to leave open here.
 *
 * So this list is the vocabulary, and it is used at BOTH ends:
 *   - `server/chat.ts` pins it as the `enum` on the derived tool's
 *     `actions[].id`, so a real model CANNOT emit an id outside it (F-23-style
 *     narrowing: a failure moved from click time to generation time);
 *   - `src/App.tsx` checks it in the switch's `default` branch, so an id that
 *     gets through anyway — a hand-built envelope, a provider that ignores the
 *     enum — produces a loud in-thread refusal naming the id instead of a
 *     silent no-op.
 *
 * It must name exactly the ids `onCardAction` handles. Both halves are needed:
 * the enum is a request, and only the second half is a guarantee.
 *
 * INSIDER CHANGE (N3) — and the vocabulary is PER INTENT, not one flat list.
 *
 * The flat enum constrained ids but not the labels the model writes for them,
 * and a label is prose the app does not control. Captured live, on a card
 * proposing a DEPLOY:
 *
 *     'approve'  -> 'Deploy to production'
 *     'reject'   -> 'Cancel'
 *     'rollback' -> 'Deploy, then roll back if it faults'   <-- executes rollbackRun()
 *
 * Every id is in vocabulary, so nothing refused it; the third button reads as a
 * deploy variant and rolls production back. Before the pin an off-vocabulary id
 * was at least refused — the pin made a coherent-looking id under a contradictory
 * label ACT.
 *
 * Reading the label to check it agrees with the id is not the fix: labels are
 * model prose, and a coherence check over prose is a heuristic guarding an
 * irreversible operation. The vocabulary is the part the app controls, so the
 * fix is to make it smaller. An approval the model raises on its own decides ONE
 * thing and offers approve or reject; `rollback`, `rotate`, `stage` and
 * `apply-strategy` are reachable ONLY on the follow-up turns the APP itself
 * drove with the matching intent, because those are the only turns on which the
 * console has already decided what is being proposed.
 */
/** Approval action ids by the INTENT of the turn that produced the card. */
export const APPROVAL_ACTIONS_BY_INTENT: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    // The app asked for an approval of the deploy the operator just parameterised.
    'deploy-approval': ['approve', 'reject'],
    // The app asked for an approval of a ROLLBACK — raised from the run board on
    // the other origin, or from the checklist. Approving a deploy is not on offer
    // here, and neither is anything else.
    rollback: ['rollback', 'reject'],
    // The app asked for an approval of the restart strategy the operator picked.
    'strategy-confirm': ['apply-strategy', 'reject'],
    // The app asked for an approval of a key rotation; staging without revoking
    // is the one genuine alternative.
    rotate: ['rotate', 'stage', 'reject'],
  });

/**
 * The vocabulary for a proposal the MODEL raised on its own.
 *
 * Every turn the app did not drive — a free-form operator prompt, the first turn
 * of a conversation — lands here. It is the narrowest useful set on purpose:
 * this is exactly the turn on which the app has no idea what is about to be
 * proposed, so it is the turn on which the consequential verbs must not be
 * reachable at all. The captured N3 card came from exactly such a turn.
 *
 * This one is enforced at the SOURCE only (the enum `server/chat.ts` pins on the
 * request). The client cannot also enforce it, because the mock script routes a
 * free-form prompt by keyword — "roll back the deploy" produces a rollback card
 * with no intent set — and that is the app's own trusted output, not a model's.
 * See the scope note on `enforceActionVocabulary` in `src/assistant.ts`.
 */
export const DEFAULT_APPROVAL_ACTION_IDS: readonly string[] = Object.freeze(['approve', 'reject']);

/** The ids allowed on an approval card produced by a turn with this intent. */
export function approvalActionIdsFor(intent?: string): readonly string[] {
  return (intent && APPROVAL_ACTIONS_BY_INTENT[intent]) || DEFAULT_APPROVAL_ACTION_IDS;
}

/**
 * Every id the console implements anywhere — DERIVED from the per-intent map so
 * the two cannot drift. This is what `App`'s total-switch backstop lists.
 */
export const APPROVAL_ACTION_IDS: readonly string[] = Object.freeze([
  ...new Set([
    ...DEFAULT_APPROVAL_ACTION_IDS,
    ...Object.values(APPROVAL_ACTIONS_BY_INTENT).flat(),
  ]),
]);

export function isApprovalActionId(action: string): boolean {
  return APPROVAL_ACTION_IDS.includes(action);
}

/** Named so a handler branches on a value rather than a loose string literal. */
export const CARD = {
  approval: 'approval',
  parameters: 'parameters',
  options: 'options',
  checklist: 'checklist',
} as const;
