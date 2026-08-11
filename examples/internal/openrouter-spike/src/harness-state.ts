// The narrow channel between the running app and the Playwright runner.
//
// It carries the RUN LIFECYCLE (has the turn settled yet?) and loop-level facts
// the DOM genuinely does not express (how many round trips the tool loop took,
// what the provider's finish_reason was). It deliberately does NOT carry the
// message parts: an assertion that reads `parts` proves the wire adapter ran and
// says nothing about whether anything rendered, and this repo has already
// shipped a "Completed" badge that came from seeded data while the live loop had
// never run. Scenarios assert the DOM; this is for the report.
import type { Page } from '@playwright/test';
import type { TurnStats } from './hooks';

export type HarnessPhase = 'idle' | 'running' | 'done' | 'error';

export interface HarnessState {
  phase: HarnessPhase;
  scenario: string | null;
  /** Which stream source the turn used, so a report can never claim a replayed
   *  run was live. */
  source: 'live' | 'replay' | null;
  model: string | null;
  stats: TurnStats | null;
  error: string | null;
}

/** The attribute the runner waits on. On <html>, so it is set before first paint
 *  and survives any re-render of the app tree. */
export const PHASE_ATTR = 'data-kai-phase';

export const HARNESS_KEY = '__kaiHarness';

declare global {
  interface Window {
    __kaiHarness?: HarnessState;
  }
}

/** Publish state from the app. Sets the attribute LAST so a runner that sees
 *  `done` is guaranteed to see the matching stats. */
export function publishHarnessState(state: HarnessState): void {
  window[HARNESS_KEY] = state;
  document.documentElement.setAttribute(PHASE_ATTR, state.phase);
}

/** Read it from the runner. */
export function readHarnessState(page: Page): Promise<HarnessState | null> {
  return page.evaluate(() => window.__kaiHarness ?? null);
}
