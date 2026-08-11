// Spike scaffolding: ids and the scenario rail. There is no canned responder
// here: every reply comes from a real model (or, in replay, from a stream a real
// model produced earlier).
//
// The rail is DERIVED from the conformance catalog rather than hand-listed, so
// clicking an entry in the browser runs exactly what the Playwright runner runs.
// A rail that drifted from the harness would be the most expensive kind of
// green: a demo that works and a suite that tests something else.
import { SCENARIOS as CONFORMANCE_SCENARIOS } from './scenarios';
import type { Scenario as ConformanceScenario } from './scenarios';

export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2);
}

/** The `<kai-conversations>` row shape, plus the scenario it stands for. */
export interface RailEntry {
  id: string;
  title: string;
  scope: { type: 'collection' };
  messageCount: number;
  lastMessageAt: string;
  updatedAt: string;
  scenario: ConformanceScenario;
}

const now = new Date().toISOString();

export const RAIL: RailEntry[] = CONFORMANCE_SCENARIOS.map((scenario) => ({
  id: scenario.id,
  // The `replay` badge is load-bearing in the UI too: it is the difference
  // between "this cost money" and "this cost nothing".
  title: `${scenario.id.replace(/^S0?/, '')} · ${scenario.title}${scenario.mode === 'replay' ? ' (replay)' : ''}`,
  scope: { type: 'collection' as const },
  messageCount: 0,
  lastMessageAt: now,
  updatedAt: now,
  scenario,
}));

export const SUGGESTIONS = ['S03-single-tool', 'S07-confirm-card', 'S15-interleaving']
  .map((id) => CONFORMANCE_SCENARIOS.find((s) => s.id === id)?.prompt)
  .filter((p): p is string => !!p);
