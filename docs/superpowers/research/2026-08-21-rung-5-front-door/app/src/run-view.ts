/**
 * One run state, two renderings.
 *
 * The board page draws it as a board on its own origin; this module projects the
 * SAME state into the `tasks` card data the in-thread checklist renders. Both
 * read one feed, so the checklist and the board cannot disagree about which step
 * is running.
 */
import type { TasksCardData } from '@kitn.ai/ui/schemas';
import type { RunState, RunStep } from '../shared/run';
import { RUN_STATUS_LABEL } from '../shared/run';

export type { RunState };
export type TasksCardShape = TasksCardData;

const STEP_NOTE: Record<RunStep['state'], string> = {
  pending: 'queued',
  running: 'running now',
  done: 'done',
  reverted: 'reverted',
};

/** The console header's one-line summary of the run. */
export function runHeadline(run: RunState | null, connected: boolean): string {
  if (!connected) return 'Run board offline';
  if (!run || run.status === 'idle') return RUN_STATUS_LABEL.idle;
  const done = run.steps.filter((step) => step.state === 'done').length;
  return `${RUN_STATUS_LABEL[run.status]} · ${done}/${run.steps.length} · ${run.region}`;
}

/**
 * Project a run into `tasks` card data.
 *
 * `mode: 'progress'` is the checklist look — a done/total header and circular
 * indicators — rather than the default `select` mode, which is a pick-list with
 * a confirm button. The rows are re-derived from the run on every tick, so this
 * is a REPORT of what the run board did, not a control surface.
 */
export function checklistDataFor(run: RunState): TasksCardData {
  return {
    mode: 'progress',
    heading: `${run.service} → production (${run.region}) · ${RUN_STATUS_LABEL[run.status]}`,
    tasks: run.steps.map((step) => ({
      id: step.id,
      label: step.state === 'reverted' ? `${step.label} — reverted` : step.label,
      description: `${step.description} · ${STEP_NOTE[step.state]}`,
      checked: step.state === 'done',
    })),
    allowEmpty: true,
    confirmLabel: 'Acknowledge',
  };
}
