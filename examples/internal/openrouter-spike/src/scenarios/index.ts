// The scenario catalog.
//
// Imported by BOTH the app (for `prompt`/`tools`, so a run in the browser and a
// run under Playwright are the same run) and the runner (for `assert`). Nothing
// reachable from here may import a Node or Playwright VALUE.
import type { Scenario } from './types';

import { s01PlainText } from './s01-plain-text';
import { s02Reasoning } from './s02-reasoning';
import { s03SingleTool } from './s03-single-tool';
import { s04MultiRound } from './s04-multi-round';
import { s05ParallelTools } from './s05-parallel-tools';
import { s06ToolError } from './s06-tool-error';
import { s06bMalformedArgs } from './s06b-malformed-args';
import { s07ConfirmCard } from './s07-confirm-card';
import { s08ChoiceCard } from './s08-choice-card';
import { s09FormCard } from './s09-form-card';
import { s10TasksCard } from './s10-tasks-card';
import { s11LinkEmbed } from './s11-link-embed';
import { s12Citations } from './s12-citations';
import { s13Artifact } from './s13-artifact';
import { s14Attachments } from './s14-attachments';
import { s15Interleaving } from './s15-interleaving';
import { s16MidStreamError } from './s16-mid-stream-error';
import { s17Cancel } from './s17-cancel';
import { s18ExpandMidStream } from './s18-expand-mid-stream';

export const SCENARIOS: readonly Scenario[] = [
  s01PlainText,
  s02Reasoning,
  s03SingleTool,
  s04MultiRound,
  s05ParallelTools,
  s06ToolError,
  s06bMalformedArgs,
  s07ConfirmCard,
  s08ChoiceCard,
  s09FormCard,
  s10TasksCard,
  s11LinkEmbed,
  s12Citations,
  s13Artifact,
  s14Attachments,
  s15Interleaving,
  s16MidStreamError,
  s17Cancel,
  s18ExpandMidStream,
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** Where a scenario's replay fixture lives, relative to `fixtures/`. A `live`
 *  scenario replays from what it RECORDED (per model); a `replay` scenario has a
 *  hand-written stream under `canned/`, because the behaviour it covers cannot
 *  be provoked from a prompt. */
export function replayDirFor(scenario: Scenario, modelSlug: string): string {
  if (scenario.replayDir) return scenario.replayDir;
  return scenario.mode === 'replay' ? `canned/${scenario.id}` : `live/${modelSlug}/${scenario.id}`;
}

export type { Scenario, ScenarioMode } from './types';
export { ScenarioAssertionError } from './types';
