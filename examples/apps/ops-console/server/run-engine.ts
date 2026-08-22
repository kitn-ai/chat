/**
 * The run board's state machine. In-memory, single instance, owned by the BOARD
 * server (the second origin) and by nobody else.
 *
 * Both renderings read from here — the cross-origin board page over its own
 * SSE feed, and the console's in-thread checklist over the same feed from
 * another origin — so a tick cannot show two different things in two places.
 */
import type { HealthPing, RunState, RunStep, StartRunInput } from '../shared/run.js';
import { DEPLOY_STEPS } from '../shared/run.js';

const STEP_INTERVAL_MS = 2200;
const PING_INTERVAL_MS = 3000;
const MAX_PINGS = 8;

type Listener = (state: RunState) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function freshSteps(region: string, sha: string): RunStep[] {
  return DEPLOY_STEPS.map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description.replace('{{region}}', region).replace('{{sha}}', sha),
    state: 'pending' as const,
  }));
}

function idleState(): RunState {
  return {
    runId: 'none',
    service: '—',
    region: '—',
    ticket: '—',
    status: 'idle',
    steps: [],
    pings: [],
    updatedAt: nowIso(),
  };
}

let state: RunState = idleState();
const listeners = new Set<Listener>();

/** Every timer the current run owns, so a new run cannot inherit an old one's. */
let stepTimer: ReturnType<typeof setInterval> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;

function clearTimers(): void {
  if (stepTimer !== undefined) clearInterval(stepTimer);
  if (pingTimer !== undefined) clearInterval(pingTimer);
  stepTimer = undefined;
  pingTimer = undefined;
}

function commit(next: Omit<RunState, 'updatedAt'>): void {
  state = { ...next, updatedAt: nowIso() };
  for (const listener of listeners) {
    // One bad subscriber must not stop the others from being told.
    try {
      listener(state);
    } catch {
      /* a dead response stream; the close handler will unsubscribe it */
    }
  }
}

/** A pseudo-sha derived from the run id — deterministic, so no Math.random here. */
function shaFor(runId: string): string {
  let hash = 0;
  for (const ch of runId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(7, '0').slice(0, 7);
}

function pingFor(index: number, region: string): HealthPing {
  // Deterministic latency wobble: a real prober would measure, and a mock that
  // randomises makes two renderings of the same run disagree on replay.
  const latencyMs = 38 + ((index * 17) % 46);
  return {
    at: nowIso(),
    endpoint: `https://payments.${region}.internal/healthz`,
    status: 200,
    latencyMs,
    ok: true,
  };
}

function startPings(): void {
  let index = 0;
  pingTimer = setInterval(() => {
    if (state.status !== 'healthy') return;
    const ping = pingFor(index++, state.region);
    commit({ ...state, pings: [ping, ...state.pings].slice(0, MAX_PINGS) });
  }, PING_INTERVAL_MS);
}

export function getRun(): RunState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startRun(input: StartRunInput): RunState {
  clearTimers();
  const runId = `run-${Date.now().toString(36)}`;
  commit({
    runId,
    service: input.service,
    region: input.region,
    ticket: input.ticket,
    status: 'deploying',
    steps: freshSteps(input.region, shaFor(runId)),
    pings: [],
  });

  stepTimer = setInterval(() => {
    if (state.status !== 'deploying') return;
    const steps = state.steps.map((s) => ({ ...s }));
    const running = steps.find((s) => s.state === 'running');
    if (running) running.state = 'done';
    const next = steps.find((s) => s.state === 'pending');
    if (next) {
      next.state = 'running';
      commit({ ...state, steps });
      return;
    }
    commit({ ...state, steps, status: 'healthy' });
    clearInterval(stepTimer!);
    stepTimer = undefined;
    startPings();
  }, STEP_INTERVAL_MS);

  return state;
}

export function rollbackRun(): RunState {
  if (state.status === 'idle') return state;
  clearTimers();
  commit({ ...state, status: 'rolling-back', pings: [] });

  stepTimer = setInterval(() => {
    const steps = state.steps.map((s) => ({ ...s }));
    // Unwind in reverse: the last step that is still `done` is the next to go.
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      const step = steps[i]!;
      if (step.state === 'done' || step.state === 'running') {
        step.state = 'reverted';
        commit({ ...state, steps });
        return;
      }
    }
    commit({ ...state, steps, status: 'rolled-back' });
    clearTimers();
  }, 900);

  return state;
}

export function resetRun(): RunState {
  clearTimers();
  commit(idleState());
  return state;
}
