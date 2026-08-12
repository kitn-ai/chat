import {
  type JSX,
  For,
  Show,
  splitProps,
  mergeProps,
  createSignal,
  createMemo,
  createEffect,
  on,
  onMount,
  ErrorBoundary,
  createUniqueId,
} from 'solid-js';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { ProgressBar } from '../ui/progress-bar';
import { Card } from './card';
import { DismissedStub } from './dismissed-stub';
import type { CardEnvelope, CardEvent, CardHost, CardResolution } from '../primitives/card-contract';
import { useCardResolution } from './use-card-resolution';
import { emitCardEvent } from '../primitives/card-routing';
import { useCardHost } from '../primitives/card-host';
import { Check, Circle, CircleCheck, X } from 'lucide-solid';

// ─────────────────────────────────────────────────────────────────────────────
// Types (tasks.schema.json) — AUTHORED IN ../primitives/card-data-types.ts.
// See the note in confirm-card.tsx, or that file's header, for why they left a
// `.tsx` and why they are `type` aliases. Re-exported here unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import type { TasksCardData, TasksCardResult, TasksTask } from '../primitives/card-data-types';

export type {
  TasksCardData,
  TasksCardEnvelope,
  TasksCardResult,
  TasksTask,
} from '../primitives/card-data-types';

export const TASKS_CARD_TYPE = 'tasks' as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested in isolation).
// ─────────────────────────────────────────────────────────────────────────────

/** De-dupe tasks by id (first wins). Returns the usable list + an optional error. */
export function normalizeTasks(tasks: unknown): { tasks: TasksTask[]; error?: string } {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { tasks: [], error: "This card couldn't be displayed." };
  }
  const seen = new Set<string>();
  const out: TasksTask[] = [];
  for (const t of tasks) {
    if (!t || typeof t !== 'object') continue;
    const task = t as Partial<TasksTask>;
    if (typeof task.id !== 'string' || task.id.length === 0) continue;
    if (typeof task.label !== 'string' || task.label.length === 0) continue;
    if (seen.has(task.id)) {
      // eslint-disable-next-line no-console
      console.warn(`[kai-tasks] duplicate task id "${task.id}" ignored`);
      continue;
    }
    seen.add(task.id);
    out.push({
      id: task.id,
      label: task.label,
      description: typeof task.description === 'string' ? task.description : undefined,
      checked: task.checked === true,
      disabled: task.disabled === true,
    });
  }
  if (out.length === 0) return { tasks: [], error: "This card couldn't be displayed." };
  return { tasks: out };
}

/** The ids of the initially-checked tasks (in input order). */
export function initialSelected(tasks: TasksTask[]): string[] {
  return tasks.filter((t) => t.checked).map((t) => t.id);
}

/** The selected ids in input order (selection set ∩ tasks, preserving task order). */
export function selectedInOrder(tasks: TasksTask[], selected: Set<string>): string[] {
  return tasks.filter((t) => selected.has(t.id)).map((t) => t.id);
}

/** The toggleable (non-disabled) task ids. */
export function toggleableIds(tasks: TasksTask[]): string[] {
  return tasks.filter((t) => !t.disabled).map((t) => t.id);
}

export type SelectAllState = 'checked' | 'unchecked' | 'indeterminate';

/** Select-all tri-state over the toggleable rows. */
export function selectAllState(tasks: TasksTask[], selected: Set<string>): SelectAllState {
  const ids = toggleableIds(tasks);
  if (ids.length === 0) return 'unchecked';
  const n = ids.filter((id) => selected.has(id)).length;
  if (n === 0) return 'unchecked';
  if (n === ids.length) return 'checked';
  return 'indeterminate';
}

/** Whether select-all should be shown: requested AND not blocked by `max` (since
 *  "all" would violate max). */
export function showSelectAll(data: TasksCardData, tasks: TasksTask[]): boolean {
  if (data.selectAll !== true) return false;
  const count = toggleableIds(tasks).length;
  if (data.max !== undefined && count > data.max) return false;
  return true;
}

/** Whether the card is in the onboarding-checklist `progress` look (no confirm). */
export function isProgressMode(data: TasksCardData): boolean {
  return data.mode === 'progress';
}

/** The header progress count (`done` checked / `total` rows) for `progress` mode. */
export function progressCount(tasks: TasksTask[], selected: Set<string>): { done: number; total: number } {
  return { done: tasks.filter((t) => selected.has(t.id)).length, total: tasks.length };
}

/** Whether confirm is enabled for the current selection count. */
export function canConfirm(data: TasksCardData, count: number): boolean {
  const min = data.min ?? (data.allowEmpty ? 0 : 1);
  if (count < min) return false;
  if (data.max !== undefined && count > data.max) return false;
  return true;
}

/** Whether an unchecked row is blocked because `max` is reached. */
export function isMaxReached(data: TasksCardData, count: number): boolean {
  return data.max !== undefined && count >= data.max;
}

/** The disabled-reason text for confirm (for aria-describedby), or undefined. */
export function confirmReason(data: TasksCardData, count: number): string | undefined {
  if (canConfirm(data, count)) return undefined;
  const min = data.min ?? (data.allowEmpty ? 0 : 1);
  if (count < min) return `Select at least ${min}.`;
  if (data.max !== undefined && count > data.max) return `Select at most ${data.max}.`;
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// The <TasksCard> component.
// ─────────────────────────────────────────────────────────────────────────────

/** Imperative handle exposed via `controllerRef` — surfaces the tasks card's latent
 *  selection model (set the checked ids, toggle one, confirm, focus the group,
 *  dismiss/reopen) so the `<kai-tasks>` facade can forward them as instance methods. */
export interface TasksCardController {
  /** Set the checked ids (local-only, no emit), respecting disabled/max. No arg = select all toggleable rows. */
  select(taskIds?: string[]): void;
  /** Toggle one task by id, honoring the max gate. */
  toggle(taskId: string, checked?: boolean): void;
  /** Confirm the current selection (only when allowed) — emits `submit` + resolves. */
  send(): void;
  /** Focus the task group (select-all checkbox if shown, else the first row). */
  focus(options?: FocusOptions): void;
  /** Trigger the dismiss path (emit `dismiss` + collapse to the re-openable stub). */
  dismiss(): void;
  /** Re-open a dismissed card from its stub (emit `reopen`). */
  reopen(): void;
}

export interface TasksCardProps {
  /** The tasks definition (CardEnvelope.data). */
  data?: TasksCardData;
  /** The card id used to correlate every emitted CardEvent. */
  cardId?: string;
  /** The envelope title rendered in the card chrome. */
  heading?: string;
  /** Optional explicit CardHost (otherwise read from a CardProvider, otherwise the
   *  bubbling `kai-card` CustomEvent off `hostElement`). */
  host?: CardHost;
  /** The custom-element host node, for the bubbling `kai-card` fallback emit. */
  hostElement?: HTMLElement;
  class?: string;
  /** When set, render the chromed read-only summary instead of the interactive controls. */
  resolution?: CardResolution;
  /** Controlled selection (task ids) — when set, this wins over internal state. */
  value?: string[];
  /** Uncontrolled initial selection (task ids), overlaying per-task `checked`. */
  defaultValue?: string[];
  /** Freeze the whole list + Confirm. */
  disabled?: boolean;
  /** Display-only: rows can't be toggled and show the default cursor (no pointer,
   *  no hover background, no focus ring). Keeps the visual content as-is — this only
   *  drops the interactive affordances + a11y exposure. */
  readonly?: boolean;
  /** Fires on every selection change with the selected ids (distinct from submit). */
  onValueChange?: (payload: { value: string[] }) => void;
  /** Receive the imperative controller once mounted. */
  controllerRef?: (controller: TasksCardController) => void;
}

const DEFAULT_DATA: TasksCardData = { tasks: [] };

/**
 * `TasksCard` — a selectable task/plan list (checkbox rows + optional select-all
 * + a confirm button) inside `Card` chrome. Row toggling and select-all are local
 * UI state; only the final confirm emits the Card contract's `submit` verb
 * (`{ kind:'submit', cardId, data:{ selected } }`) with the checked ids in
 * input order. Emits `ready` on mount and `error` for an unusable definition.
 */
export function TasksCard(props: TasksCardProps): JSX.Element {
  const merged = mergeProps({ cardId: 'kai-tasks' }, props);
  const [local] = splitProps(merged, [
    'data', 'cardId', 'heading', 'host', 'hostElement', 'class', 'resolution',
    'value', 'defaultValue', 'disabled', 'readonly', 'onValueChange', 'controllerRef',
  ]);

  const ctxHost = useCardHost();
  const uid = createUniqueId();

  const emit = (event: CardEvent): void => {
    const h = local.host ?? ctxHost;
    if (h) h.emit(event);
    else if (local.hostElement) emitCardEvent(local.hostElement, event);
  };

  const normalized = createMemo(() => normalizeTasks(local.data?.tasks));
  const valid = createMemo(() => normalized().error === undefined);
  const errorMessage = createMemo(() => normalized().error ?? '');
  const tasks = createMemo(() => normalized().tasks);
  const data = createMemo<TasksCardData>(() => local.data ?? DEFAULT_DATA);

  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  const res = useCardResolution({ prop: () => local.resolution, data: () => local.data });

  // Only ids that exist in the current task list (drop unknown ids defensively).
  const validIds = (ids: string[]): string[] => {
    const known = new Set(tasks().map((t) => t.id));
    return ids.filter((id) => known.has(id));
  };

  // Seed selection from `value` (controlled) > `defaultValue` > per-task `checked`,
  // when a NEW definition arrives.
  createEffect(
    on(
      () => local.data,
      () => {
        const seedIds = local.value ?? local.defaultValue ?? initialSelected(tasks());
        setSelected(new Set(validIds(seedIds)));
      },
    ),
  );

  // Controlled selection: when the consumer drives `value`, mirror it into the set
  // (the controlled prop wins). Deferred so mount's seed runs first.
  createEffect(on(() => local.value, (v) => {
    if (!v) return;
    setSelected(new Set(validIds(v)));
  }, { defer: true }));

  // Fire the live change signal whenever the selection set changes (distinct from
  // the terminal submit). Deferred so the initial seed doesn't emit.
  createEffect(on(selected, (s) => {
    local.onValueChange?.({ value: selectedInOrder(tasks(), s) });
  }, { defer: true }));

  // ready / error lifecycle emits.
  createEffect(
    on(valid, (ok) => {
      if (ok) emit({ kind: 'ready', cardId: local.cardId });
      else emit({ kind: 'error', cardId: local.cardId, message: errorMessage() });
    }),
  );

  const groupDisabled = (): boolean => local.disabled === true;
  // Display-only: block all toggling/confirm and drop the interactive affordances,
  // without the dimmed/`disabled` look.
  const readOnly = (): boolean => local.readonly === true;

  const count = createMemo(() => selected().size);
  // `progress` mode = the onboarding-checklist look: a header `done / total`
  // count, circular indicators, no confirm button. Same selection model.
  const progress = createMemo(() => isProgressMode(data()));
  const progressN = createMemo(() => progressCount(tasks(), selected()));
  const confirmLabel = () => data().confirmLabel ?? 'Confirm';
  const masterState = createMemo(() => selectAllState(tasks(), selected()));
  const showMaster = createMemo(() => showSelectAll(data(), tasks()));
  const reason = createMemo(() => confirmReason(data(), count()));
  const confirmEnabled = createMemo(() => canConfirm(data(), count()) && !res.isResolved() && !groupDisabled() && !readOnly());

  // Apply one id to a selection set, honoring the max gate (mutates+returns `next`).
  const applyToggle = (next: Set<string>, id: string, on: boolean): Set<string> => {
    if (on) {
      // Respect max: block adding past max.
      if (isMaxReached(data(), next.size) && !next.has(id)) return next;
      next.add(id);
    } else {
      next.delete(id);
    }
    return next;
  };

  const toggle = (id: string, on: boolean): void => {
    if (res.isResolved() || groupDisabled() || readOnly()) return;
    setSelected(applyToggle(new Set(selected()), id, on));
  };

  const toggleAll = (on: boolean): void => {
    if (res.isResolved() || groupDisabled() || readOnly()) return;
    const next = new Set(selected());
    for (const id of toggleableIds(tasks())) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setSelected(next);
  };

  const onConfirm = (): void => {
    if (!confirmEnabled()) return;
    const result: TasksCardResult = { selected: selectedInOrder(tasks(), selected()) };
    emit({ kind: 'submit', cardId: local.cardId, data: result });
    res.setLocal({ kind: 'submit', data: result });
  };

  // Dismiss: emit `dismiss` AND optimistically flip to a `dismissed` resolution so
  // the card collapses to its re-openable stub immediately.
  const onDismiss = (): void => {
    if (res.isResolved()) return;
    emit({ kind: 'dismiss', cardId: local.cardId });
    res.setLocal({ kind: 'dismissed' });
  };
  const onReopen = (): void => emit({ kind: 'reopen', cardId: local.cardId });

  // Imperative controller (Pattern C): hand the facade a handle over the tasks
  // card's latent selection model. select sets the checked ids local-only (no
  // submit); toggle drives one row; send confirms (same path as Confirm); focus
  // targets the group; dismiss/reopen drive the stub.
  onMount(() => {
    local.controllerRef?.({
      select: (taskIds) => {
        if (res.isResolved() || groupDisabled() || readOnly()) return;
        if (taskIds === undefined) { toggleAll(true); return; }
        // Build the set fresh, honoring max + disabled per id (skip disabled rows).
        const next = new Set<string>();
        const toggleable = new Set(toggleableIds(tasks()));
        for (const id of validIds(taskIds)) {
          if (!toggleable.has(id)) continue; // skip per-task-disabled rows
          applyToggle(next, id, true);
        }
        setSelected(next);
      },
      toggle: (taskId, checked) => {
        // No explicit `checked` → flip the current state.
        const on = checked ?? !selected().has(taskId);
        toggle(taskId, on);
      },
      send: () => onConfirm(),
      focus: (options) => {
        const root = local.hostElement?.shadowRoot ?? document;
        const group = root.querySelector<HTMLElement>('[role="group"]');
        // Prefer the select-all checkbox (it's the first labelled input), else the
        // first row's checkbox; fall back to the group container itself.
        const firstInput = group?.querySelector<HTMLElement>('input[type="checkbox"]');
        (firstInput ?? group)?.focus(options);
      },
      dismiss: () => onDismiss(),
      reopen: () => onReopen(),
    });
  });

  // Surface the resolved state for host styling. Only a `submit` resolution is the
  // "submitted" state; a deferred `dismissed` (or `expired`) is not.
  createEffect(() => {
    const el = local.hostElement;
    if (!el) return;
    if (res.resolution()?.kind === 'submit') el.setAttribute('data-kai-resolved', 'submitted');
    else el.removeAttribute('data-kai-resolved');
  });

  const resolvedSummary = createMemo(() => {
    const r = res.resolution();
    if (!r || r.kind !== 'submit') return undefined;
    const sel = (r.data as { selected?: unknown })?.selected;
    const ids: string[] = Array.isArray(sel) ? (sel as string[]) : [];
    const all = tasks();
    const chosen = all.filter((t) => ids.includes(t.id)).map((t) => t.label);
    return { count: chosen.length, total: all.length, labels: chosen };
  });

  const reasonId = `kai-tl-reason-${uid}`;
  const countId = `kai-tl-count-${uid}`;
  const progressCountId = `kai-tl-progress-${uid}`;
  const progressHeadingId = `kai-tl-heading-${uid}`;
  const headingText = () => local.heading ?? local.data?.heading;

  return (
    <Show when={valid()} fallback={<Card heading={local.heading} errorMessage={errorMessage()} />}>
      <ErrorBoundary
        fallback={() => {
          emit({ kind: 'error', cardId: local.cardId, message: 'The card failed to render.' });
          return <Card heading={local.heading} errorMessage="The card failed to render." />;
        }}
      >
        <Show
          when={!res.isDeferred()}
          fallback={
            <DismissedStub type={TASKS_CARD_TYPE} title={local.heading ?? local.data?.heading} onReopen={onReopen} />
          }
        >
        <Card
          // In `progress` mode the heading + count render as a custom in-body row
          // (so the count can sit right-aligned beside the heading), so the Card
          // chrome's own heading is suppressed.
          heading={progress() ? undefined : headingText()}
          actions={
            // `progress` mode is confirm-less: checking a row IS the action.
            // `readonly` is display-only, so there's no confirm/dismiss row either.
            progress() || res.isResolved() || readOnly() ? undefined : (
              <div class="flex w-full flex-wrap items-center justify-between gap-2">
                <Show when={local.data?.dismissible === true}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Dismiss"
                    onClick={onDismiss}
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                </Show>
                <span id={countId} aria-live="polite" class="text-xs text-muted-foreground">
                  {count()} selected
                </span>
                <div class="ml-auto flex items-center gap-2">
                  <Show when={reason()}>
                    <span id={reasonId} class="sr-only">
                      {reason()}
                    </span>
                  </Show>
                  <Button
                    type="button"
                    disabled={!confirmEnabled()}
                    aria-describedby={reason() ? reasonId : undefined}
                    onClick={onConfirm}
                  >
                    {confirmLabel()}
                  </Button>
                </div>
              </div>
            )
          }
        >
          <Show
            when={!res.isResolved()}
            fallback={<TasksResolved summary={resolvedSummary()!} optimistic={res.isOptimistic()} />}
          >
            <Show when={progress()}>
              <ProgressChecklist
                heading={headingText()}
                headingId={progressHeadingId}
                countId={progressCountId}
                done={progressN().done}
                total={progressN().total}
                tasks={tasks()}
                uid={uid}
                isChecked={(id) => selected().has(id)}
                isBlocked={(task) =>
                  groupDisabled() || task.disabled === true ||
                  (!selected().has(task.id) && isMaxReached(data(), count()))
                }
                onToggle={(id, on) => toggle(id, on)}
                groupClass={local.class}
                maxNote={data().max !== undefined ? data().max : undefined}
                readonly={readOnly()}
              />
            </Show>
            <Show when={!progress()}>
            <div
              role="group"
              aria-label={local.heading ?? local.data?.heading ?? 'Tasks'}
              aria-readonly={readOnly() ? 'true' : undefined}
              class={cn('flex flex-col', local.class)}
              onKeyDown={(e) => {
                // Enter anywhere in the card (off a checkbox) confirms when enabled.
                if (e.key !== 'Enter') return;
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT') return;
                if (confirmEnabled()) onConfirm();
              }}
            >
              <div class="divide-y divide-border overflow-hidden rounded-lg border border-input">
                <Show when={showMaster()}>
                  {(() => {
                    const indeterminate = () => masterState() === 'indeterminate';
                    return (
                      <label
                        class={cn(
                          'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
                          readOnly() ? 'cursor-default' : 'cursor-pointer',
                          masterState() === 'checked'
                            ? 'bg-accent text-accent-foreground'
                            : readOnly()
                              ? 'text-foreground'
                              : 'text-foreground hover:bg-muted/50',
                        )}
                      >
                        <input
                          type="checkbox"
                          class="kai-checkbox"
                          checked={masterState() === 'checked'}
                          disabled={groupDisabled() || readOnly()}
                          aria-checked={indeterminate() ? 'mixed' : masterState() === 'checked'}
                          ref={(el) => {
                            createEffect(() => {
                              el.indeterminate = indeterminate();
                            });
                          }}
                          onChange={(e) => toggleAll(e.currentTarget.checked)}
                        />
                        <span>Select all</span>
                      </label>
                    );
                  })()}
                </Show>

                <For each={tasks()}>
                  {(task) => {
                    const checked = () => selected().has(task.id);
                    const blocked = () =>
                      groupDisabled() || task.disabled || (!checked() && isMaxReached(data(), count()));
                    const descId = `kai-tl-desc-${uid}-${task.id}`;
                    return (
                      <label
                        class={cn(
                          'flex items-start gap-3 px-3 py-2.5 text-sm transition-colors',
                          readOnly()
                            ? 'cursor-default'
                            : blocked()
                              ? 'cursor-not-allowed opacity-60'
                              : 'cursor-pointer hover:bg-muted/50',
                          checked() && !blocked()
                            ? 'bg-accent font-medium text-accent-foreground'
                            : 'text-foreground',
                        )}
                        data-task-id={task.id}
                      >
                        <input
                          type="checkbox"
                          class="kai-checkbox mt-0.5"
                          checked={checked()}
                          disabled={blocked() || readOnly()}
                          aria-disabled={blocked() ? 'true' : undefined}
                          aria-describedby={task.description ? descId : undefined}
                          onChange={(e) => toggle(task.id, e.currentTarget.checked)}
                        />
                        <span class="flex flex-col gap-0.5">
                          <span>{task.label}</span>
                          <Show when={task.description}>
                            <span id={descId} class="text-xs font-normal text-muted-foreground">
                              {task.description}
                            </span>
                          </Show>
                        </span>
                      </label>
                    );
                  }}
                </For>
              </div>

              <Show when={data().max !== undefined}>
                <p class="pt-1 text-xs text-muted-foreground">Up to {data().max} selected.</p>
              </Show>
            </div>
            </Show>
          </Show>
        </Card>
        </Show>
      </ErrorBoundary>
    </Show>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding-checklist (`mode: 'progress'`) presenter: a header `done / total`
// count + circular indicators + per-item title/description, no confirm button.
// Drives the same selection model, where toggling a row IS the action.
// ─────────────────────────────────────────────────────────────────────────────

function ProgressChecklist(props: {
  heading?: string;
  headingId: string;
  countId: string;
  done: number;
  total: number;
  tasks: TasksTask[];
  uid: string;
  isChecked: (id: string) => boolean;
  isBlocked: (task: TasksTask) => boolean;
  onToggle: (id: string, on: boolean) => void;
  groupClass?: string;
  maxNote?: number;
  /** Display-only: rows aren't focusable/toggleable and show the default cursor. */
  readonly?: boolean;
}): JSX.Element {
  return (
    <div class={cn('flex flex-col gap-3', props.groupClass)}>
      <Show when={props.heading}>
        <div class="flex items-center justify-between gap-3">
          <span id={props.headingId} class="text-sm font-medium text-foreground">
            {props.heading}
          </span>
          <span
            id={props.countId}
            aria-live="polite"
            class="shrink-0 text-sm font-medium tabular-nums text-muted-foreground"
          >
            {props.done} / {props.total}
          </span>
        </div>
      </Show>

      {/* Thin progress bar under the heading: filled to done / total. Named off the
          checklist heading (no duplicate caption), or a generic label when headless. */}
      <ProgressBar
        value={props.done}
        max={props.total}
        tone="success"
        aria-labelledby={props.heading ? props.headingId : undefined}
        aria-label={props.heading ? undefined : 'Task progress'}
      />

      <ul
        aria-labelledby={props.heading ? props.headingId : undefined}
        aria-label={props.heading ? undefined : 'Checklist'}
        class="flex flex-col gap-1"
      >
        <For each={props.tasks}>
          {(task) => {
            const checked = () => props.isChecked(task.id);
            const blocked = () => props.isBlocked(task);
            const descId = `kai-tl-pdesc-${props.uid}-${task.id}`;
            return (
              <li>
                <label
                  class={cn(
                    'group flex items-start gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors',
                    // Keyboard focus ring (kit standard, inset so it stays within the
                    // row). focus-visible only, so a mouse click that parks focus on the
                    // row doesn't leave a noisy persistent outline — and it makes a
                    // Tab-focused completed row's open description perceivable. Dropped
                    // entirely when readonly (the row isn't focusable then).
                    !props.readonly &&
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    props.readonly
                      ? 'cursor-default'
                      : blocked()
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer hover:bg-muted/50',
                  )}
                  data-task-id={task.id}
                  // Completed rows hide their description until hover/focus, so make the
                  // row itself focusable to drive the focus-reveal (group-focus-within).
                  // Incomplete rows — and every row when readonly — stay unfocusable.
                  // Expose the label + description to AT.
                  tabindex={!props.readonly && checked() ? 0 : undefined}
                  aria-label={checked() ? task.label : undefined}
                  aria-describedby={checked() && task.description ? descId : undefined}
                >
                  <input
                    type="checkbox"
                    class="sr-only"
                    checked={checked()}
                    disabled={blocked() || props.readonly}
                    aria-disabled={blocked() ? 'true' : undefined}
                    aria-describedby={task.description ? descId : undefined}
                    onChange={(e) => props.onToggle(task.id, e.currentTarget.checked)}
                  />
                  <span
                    class={cn(
                      'mt-0.5 shrink-0 text-muted-foreground',
                      // Completed rows: the check gently scales on hover.
                      checked() && 'motion-safe:transition-transform motion-safe:group-hover:scale-110',
                    )}
                    aria-hidden="true"
                  >
                    <Show
                      when={checked()}
                      fallback={<Circle size={18} />}
                    >
                      <CircleCheck size={18} class="text-foreground" />
                    </Show>
                  </span>
                  <span class="flex min-w-0 flex-col gap-0.5">
                    <span
                      class={cn(
                        'font-medium text-foreground',
                        // Completed: strike through + muted, brightening on hover.
                        checked() && 'line-through opacity-70 motion-safe:transition-opacity motion-safe:group-hover:opacity-100',
                      )}
                    >
                      {task.label}
                    </span>
                    <Show when={task.description}>
                      <Show
                        when={checked()}
                        fallback={
                          <span id={descId} class="text-xs font-normal text-muted-foreground">
                            {task.description}
                          </span>
                        }
                      >
                        {/* Completed: collapse the description and reveal it on hover or
                            keyboard focus via the grid-rows height trick. Height-collapse
                            keeps the text in the DOM + a11y tree (unlike display:none). */}
                        <div class="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr] motion-safe:transition-[grid-template-rows] motion-safe:duration-200">
                          <span
                            id={descId}
                            class="overflow-hidden text-xs font-normal text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 motion-safe:transition-opacity"
                          >
                            {task.description}
                          </span>
                        </div>
                      </Show>
                    </Show>
                  </span>
                </label>
              </li>
            );
          }}
        </For>
      </ul>

      <Show when={props.maxNote !== undefined}>
        <p class="text-xs text-muted-foreground">Up to {props.maxNote} selected.</p>
      </Show>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only resolved summary presenter.
// ─────────────────────────────────────────────────────────────────────────────

function TasksResolved(props: {
  summary: { count: number; total: number; labels: string[] };
  optimistic: boolean;
}): JSX.Element {
  return (
    <div class="flex flex-col gap-2" role={props.optimistic ? 'status' : undefined}>
      <p class="flex items-center gap-2 text-sm font-medium text-foreground">
        <Check size={16} aria-hidden="true" />
        <span>Selected {props.summary.count} of {props.summary.total}</span>
      </p>
      <Show when={props.summary.labels.length > 0}
        fallback={<p class="text-sm text-muted-foreground">None selected</p>}>
        <ul class="list-disc pl-5 text-sm text-foreground">
          <For each={props.summary.labels}>{(l) => <li>{l}</li>}</For>
        </ul>
      </Show>
    </div>
  );
}
