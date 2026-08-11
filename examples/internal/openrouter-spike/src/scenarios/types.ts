// The scenario contract for the conformance harness.
//
// A scenario is ONE module that owns the whole round trip: the prompt that
// provokes the behaviour, the tools that make it reachable, and the assertion
// that the RENDERED UI actually shows it. Keeping the three together is the
// point — a prompt without its assertion is a demo, and an assertion without its
// prompt is a fixture test that can pass while the live path is broken.
//
// These modules are imported by BOTH the browser app (for `prompt`/`tools`) and
// the Playwright runner (for `assert`), so nothing here may import a Node or
// Playwright value at runtime. `Page` is a TYPE-only import and erases.
import type { Page } from '@playwright/test';
import type { ToolSpec } from '../tools';

/** How a scenario gets its stream. */
export type ScenarioMode =
  /** Hits the model. Recorded to `fixtures/live/<model>/<id>/` on the way past. */
  | 'live'
  /** Never hits the model: the proxy replays `fixtures/canned/<id>/`. For the
   *  behaviours no prompt can reliably provoke (parallel calls, malformed
   *  arguments, a mid-stream provider error) and for wire-level timing. */
  | 'replay';

export interface Scenario {
  /** Stable id, also the fixture directory name. */
  id: string;
  title: string;
  /** One line: what a PASS here actually proves. Printed in the report. */
  proves: string;
  prompt: string;
  tools: ToolSpec[];
  /** `live` scenarios can also be replayed once they have been recorded;
   *  `replay` scenarios can ONLY be replayed. */
  mode: ScenarioMode;
  /** Fixture directory, relative to `fixtures/`. Defaults to `canned/<id>`. */
  replayDir?: string;
  /**
   * The NEGATIVE CONTROL: a stream that cannot possibly produce what this
   * scenario asserts. `pnpm conformance:control` runs every assertion against
   * its control and fails any that still passes.
   *
   * This exists because of a specific, real failure in this repo: an assertion
   * that watched for a "Completed" badge went green off seeded fixture data
   * while the live loop had never run. An assertion nobody has watched FAIL is
   * not evidence of anything.
   *
   * Defaults to `canned/CONTROL-empty` — three words of prose and nothing else.
   */
  controlDir?: string;
  /** Per-frame replay delay. Raise it when the assertion needs to interact with
   *  a half-written stream. */
  replayDelayMs?: number;
  /** Cap on the tool loop for this scenario. */
  maxRounds?: number;
  /** Set when the scenario is EXPECTED to fail against today's kit. The runner
   *  reports it as a known gap, and turns it into a LOUD failure if it ever
   *  starts passing — a gap that silently closes is a gap nobody documented. */
  knownGap?: string;
  /**
   * Interaction to perform WHILE the assistant turn is still streaming. Runs as
   * soon as the app reports `running`, in parallel with the stream.
   */
  during?: (page: Page) => Promise<void>;
  /** Assert the RENDERED state. Must pierce the shadow DOM and look at what the
   *  user can see; asserting the data model proves only that the adapter ran. */
  assert: (page: Page) => Promise<void>;
}

/** Thrown by the assertion helpers. The runner prints `message` verbatim. */
export class ScenarioAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioAssertionError';
  }
}
