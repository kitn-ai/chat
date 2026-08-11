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

/** The SSE dialect the server under test is speaking. Declared here rather than
 *  imported from `../transport` so this module keeps its no-runtime rule. */
export type ScenarioWire = 'openai' | 'anthropic';

/**
 * A documented, EXPECTED failure.
 *
 * The three fields exist because `knownGap` used to be one string, and one
 * string is not enough to tell "the gap is still there" from "this run was
 * broken and never got near the gap". That is not hypothetical: during the run
 * where the canned fixtures were still OpenAI-only, S13 was replayed into
 * `readAnthropicStream`, the stream parsed to NOTHING, the assertion timed out
 * waiting for an artifact that was never going to exist — and the harness
 * recorded it as `KNOWN GAP CONFIRMED`. A green table over a silent breakage,
 * inside the harness built to prevent exactly that.
 *
 * So a gap is only confirmable when all three hold:
 *
 *   1. `reached` PASSES  — everything upstream of the gap worked, so the run got
 *      far enough for the gap to be observable at all;
 *   2. `assert` FAILS    — the gap is still open (a gap that silently closed is
 *      a gap nobody documented);
 *   3. the failure MATCHES `signature` — it failed for the documented reason and
 *      not for some other one that happens to be red.
 *
 * Anything else is a LOUD failure.
 */
export interface KnownGap {
  /** What is missing, in one line. Printed in the report. */
  what: string;
  /**
   * The precondition: everything that must ALREADY work for the gap to be
   * exhibited. Written against the rendered DOM like any other assertion, and
   * held to the same standard — `conformance:control` points it at a stream that
   * cannot reach the gap and requires it to go red.
   */
  reached: (page: Page) => Promise<void>;
  /** The failure this gap actually produces. Matched against the assertion's own
   *  message, so an unrelated red (a timeout, a page error) cannot pass for it. */
  signature: RegExp;
}

export interface Scenario {
  /** Stable id, also the fixture directory name. */
  id: string;
  title: string;
  /** One line: what a PASS here actually proves. Printed in the report. */
  proves: string;
  /**
   * Per-wire override for `proves`, for the scenarios whose two fixtures cannot
   * make the same claim.
   *
   * S05 is the case: chat-completions announces both tool calls up front and
   * INTERLEAVES their argument fragments, and Anthropic streams content blocks
   * strictly in sequence and cannot produce that framing at all. Both fixtures
   * are realistic; they are not equally demanding, and a table that renders both
   * as a bare `pass` reads the weaker one as the stronger claim.
   */
  provesByWire?: Partial<Record<ScenarioWire, string>>;
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
  /** Set when the scenario is EXPECTED to fail against today's kit. See
   *  `KnownGap`: confirming a gap takes a precondition and a signature, not just
   *  a red cell. */
  knownGap?: KnownGap;
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
