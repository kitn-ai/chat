/**
 * The run-board domain model.
 *
 * Shared by three places that must agree on it:
 *  - `server/run-engine.ts`, which owns the only copy of the state,
 *  - `src/board/*`, the provider page served from the SECOND origin,
 *  - `src/*`, the console, which renders the same run as a native `tasks` card.
 */

export type StepState = 'pending' | 'running' | 'done' | 'reverted';

export interface RunStep {
  id: string;
  label: string;
  description: string;
  state: StepState;
}

export interface HealthPing {
  at: string;
  endpoint: string;
  status: number;
  latencyMs: number;
  ok: boolean;
}

export type RunStatus =
  | 'idle'
  | 'deploying'
  | 'healthy'
  | 'rolling-back'
  | 'rolled-back';

export interface RunState {
  runId: string;
  service: string;
  region: string;
  ticket: string;
  status: RunStatus;
  steps: RunStep[];
  pings: HealthPing[];
  /** ISO-8601, bumped on every mutation. Cheap way to spot a stale snapshot. */
  updatedAt: string;
}

export interface StartRunInput {
  service: string;
  region: string;
  ticket: string;
}

/** Human copy for a status, used by both renderings so they cannot drift. */
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'No run in flight',
  deploying: 'Deploying',
  healthy: 'Live and healthy',
  'rolling-back': 'Rolling back',
  'rolled-back': 'Rolled back',
};

/**
 * The canonical deployment plan.
 *
 * Lives here rather than in the engine because THREE processes render it: the
 * board server that advances it, the board page that draws it, and the chat
 * route — a different server — that emits the in-thread checklist card before
 * the console has seen a single run snapshot.
 */
export const DEPLOY_STEPS: ReadonlyArray<Pick<RunStep, 'id' | 'label' | 'description'>> = [
  { id: 'build', label: 'Build image', description: 'payments:{{sha}} — multi-stage build' },
  { id: 'migrate', label: 'Run migrations', description: '3 pending migrations, forward-only' },
  { id: 'canary', label: 'Shift 5% canary', description: 'Weighted routing in {{region}}' },
  { id: 'soak', label: 'Soak canary', description: 'Watch error rate for 90s' },
  { id: 'promote', label: 'Promote to 100%', description: 'Drain the old revision' },
];

/** The card type the console asks the remote provider to draw. */
export const RUN_BOARD_CARD_TYPE = 'ops-run-board';

/** The `action` verb the board's rollback button emits back up to the console. */
export const ROLLBACK_ACTION = 'request-rollback';
