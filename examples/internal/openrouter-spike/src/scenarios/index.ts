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
 *  scenario replays from what it RECORDED (per model AND wire — `modelSlug`
 *  already encodes both); a `replay` scenario has a generated stream under
 *  `canned/`, because the behaviour it covers cannot be provoked from a prompt.
 *
 *  The canned streams exist in BOTH SSE dialects. They have to: a canned
 *  chat-completions stream handed to `readAnthropicStream` does not fail loudly,
 *  it parses to nothing — which showed up as six red cells that looked like UI
 *  bugs the first time an Anthropic model was driven through the Anthropic Skin.
 *  `harness/make-canned-fixtures.mjs` emits both from one description. */
export function replayDirFor(
  scenario: Scenario,
  modelSlug: string,
  wire: 'openai' | 'anthropic' = 'openai',
): string {
  if (scenario.replayDir) return scenario.replayDir;
  if (scenario.mode !== 'replay') return `live/${modelSlug}/${scenario.id}`;
  return wire === 'anthropic' ? `canned-anthropic/${scenario.id}` : `canned/${scenario.id}`;
}

export type { KnownGap, Scenario, ScenarioMode, ScenarioWire } from './types';
export { ScenarioAssertionError } from './types';
