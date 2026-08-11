// Types for `reasoning-coverage.mjs`, which stays JavaScript so `run-matrix.mjs`
// can use it under bare node with no build step.
import type { MatrixWire } from './models.mjs';

/** Where a dialect puts its thinking-token count inside `usage`. */
export interface UsageField {
  container: string;
  field: string;
}

/** Throws on any wire it does not recognise — see the note in the .mjs about why
 *  answering "zero" for an unknown dialect is worse than not answering. The
 *  parameter is `unknown` so the throwing branch is reachable from a test. */
export declare function usageFieldFor(wire: unknown): UsageField;

/** `fixtures/live/<dir>` for a (model, wire) pair. Pinned against the proxy's own
 *  `fixtureSlug` by `server/reasoning-coverage.test.ts`. */
export declare function fixtureDirFor(model: string, wire: MatrixWire): string;

export interface RoundReading {
  /** Whether the recording ends with `data: [DONE]`. False means the stream died
   *  mid-flight and was written out anyway — and since usage is the LAST thing in
   *  a stream, such a file reads as zero reasoning for a reason that has nothing
   *  to do with the model. */
  terminated: boolean;
  /** Usage frames seen. Zero means the recording had nothing to measure. */
  usageFrames: number;
  /** Every thinking-token count this wire's field reported. Empty means usage was
   *  present but the field was not — a different failure from "it was zero". */
  samples: number[];
  /** The largest sample, or null when the field never appeared. */
  reasoningTokens: number | null;
}

export declare function readRound(sse: string, wire: MatrixWire): RoundReading;

export type ColumnVerdict =
  | 'ok'
  /** Declared `reasons: true`, read fine, recorded no thinking at all. */
  | 'silent'
  /** Declared `reasons: false` and thought anyway. */
  | 'mislabelled'
  /** Nothing recorded: a MISSING measurement, not a pass and not a failure. */
  | 'unrecorded'
  /** Rounds that never reached `data: [DONE]`: re-record them. */
  | 'truncated'
  /** Rounds that terminated but carry no usage frame — a garbled recording. */
  | 'unreadable'
  /** Usage present, this wire's thinking field absent: the dialect changed. */
  | 'wrong-field'
  /** The catalog entry has no usable `reasons`/`wire`/`model` declaration. */
  | 'undeclared';

export interface ScenarioReading {
  id: string;
  rounds: number;
  /** Largest thinking-token count over this scenario's rounds. */
  reasoningTokens: number;
}

export interface ColumnReport {
  key: string;
  model: string | null;
  wire: MatrixWire | null;
  reasons: boolean | null;
  label: string;
  dir: string | null;
  scenarios: ScenarioReading[];
  roundsRead: number;
  usageFrames: number;
  reasoningTokens: number;
  verdict: ColumnVerdict;
  reason: string;
}

export interface CoverageReport {
  fixturesRoot: string;
  columns: ColumnReport[];
  /** Columns whose verdict means the sweep cannot be believed. */
  failures: ColumnReport[];
  /** Columns with nothing recorded yet. */
  missing: ColumnReport[];
  /** Total rounds actually opened. Zero means the guard measured nothing. */
  roundsRead: number;
}

export declare const FAILING_VERDICTS: ColumnVerdict[];

export declare function auditReasoningCoverage(
  fixturesRoot: string,
  models?: readonly unknown[],
): CoverageReport;

export declare function formatCoverageReport(report: CoverageReport): string;
