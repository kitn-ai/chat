import { defineWebComponent } from './define';
import { TasksCard, type TasksCardController, type TasksCardData } from '../components/tasks-card';
import type { CardResolution } from '../primitives/card-contract';

interface Props extends Record<string, unknown> {
  /** The tasks definition (the CardEnvelope.data). Set as a JS PROPERTY:
   *  `el.data = { tasks:[…], selectAll, confirmLabel, … }`. Import
   *  `TasksCardData` from `@kitn.ai/ui` for the full shape. */
  data?: Record<string, unknown>;
  /** Stable card id correlating every emitted CardEvent. Attribute: `card-id`. */
  cardId?: string;
  /** Heading rendered in the card chrome (= CardEnvelope.title). Attribute: `heading`. */
  heading?: string;
  /** Set when the user resolved this card; renders the read-only view. Property:
   *  `el.resolution = { kind:'submit', data:{ selected:[…] } }`. */
  resolution?: Record<string, unknown>;
  /** Controlled selection (task ids; JS property). When set, it wins over local state. */
  value?: string[];
  /** Uncontrolled initial selection (task ids; JS property), overlaying per-task `checked`. */
  defaultValue?: string[];
  /** Freeze the whole list + Confirm. Attribute: `disabled`. */
  disabled?: boolean;
  /** Display-only: rows can't be toggled and show the default cursor (no pointer,
   *  hover, or focus affordances). Keeps the look as-is. Attribute: `readonly`. */
  readonly?: boolean;
}

/** Events fired by `<kai-tasks>`. (Resolution still flows up the bubbling `kai-card`
 *  contract event — `kai-value-change` is the live selection signal, distinct from
 *  the terminal submit.) */
interface Events {
  /** The selection changed on a toggle. Carries the selected ids in input
   *  order. */
  'kai-value-change': { value: string[] };
}

/**
 * `<kai-tasks>` — a **selectable** task/plan list (set via the `data` property):
 * checkbox rows + an optional select-all + a confirm button. Toggling rows is local
 * UI state; only the final confirm emits the Card contract's **`submit`** verb
 * up a bubbling **`kai-card`** CustomEvent (`{ kind:'submit', cardId,
 * data:{ selected } }`) with the checked ids in input order. Also emits `ready` on
 * mount and `error` for a malformed definition (inline error). Routes through a
 * `CardProvider` when present, else the bubbling `kai-card` event. Isolated in
 * Shadow DOM; theme-aware via the shared kit tokens.
 *
 * Two looks, one selection model. Default `mode:'select'` = the approval list above.
 * `mode:'progress'` = the onboarding-checklist look (e.g. "Get started 0 / 2"): a
 * header `done / total` count + circular indicators + per-item title/description,
 * and NO confirm button (checking a row IS the action, so the live
 * `kai-value-change` is the signal). The `max` gate, `toggle`/`select` methods, and
 * events all still apply.
 */
defineWebComponent<Props, Events>(
  'kai-tasks',
  {
    data: undefined,
    cardId: undefined,
    heading: undefined,
    resolution: undefined,
    value: undefined,
    defaultValue: undefined,
    disabled: false,
    readonly: false,
  },
  (props, { element, dispatch, flag, expose }) => {
    // Pattern C: the TasksCard component owns the selection set + confirm gating and
    // hands up a controller; the facade captures it and exposes delegating methods.
    let controller: TasksCardController | undefined;
    expose({
      /** Set the checked task ids (local-only, no emit), respecting disabled/max.
       *  With no arg, select all toggleable rows. */
      select: (taskIds?: string[]) => controller?.select(taskIds),
      /** Toggle one task by id, honoring the max gate (no `checked` = flip). */
      toggle: (taskId: string, checked?: boolean) => controller?.toggle(taskId, checked),
      /** Confirm the current selection: emits the `submit` CardEvent + resolves
       *  (only when the min/max gate passes). Named `send`, not `submit`. */
      send: () => controller?.send(),
      /** Focus the task group (select-all checkbox if shown, else the first row). */
      focus: (options?: FocusOptions) => controller?.focus(options),
      /** Trigger the dismiss path (emit `dismiss` + collapse to the re-openable stub). */
      dismiss: () => controller?.dismiss(),
      /** Re-open a dismissed card from its stub (emit `reopen`). */
      reopen: () => controller?.reopen(),
    });

    return (
      <TasksCard
        data={props.data as TasksCardData | undefined}
        cardId={props.cardId ?? (element.id || 'kai-tasks')}
        heading={props.heading}
        resolution={props.resolution as CardResolution | undefined}
        value={props.value as string[] | undefined}
        defaultValue={props.defaultValue as string[] | undefined}
        disabled={flag('disabled')}
        readonly={flag('readonly')}
        onValueChange={(payload) => dispatch('kai-value-change', payload)}
        controllerRef={(c) => (controller = c)}
        hostElement={element}
      />
    );
  },
);
