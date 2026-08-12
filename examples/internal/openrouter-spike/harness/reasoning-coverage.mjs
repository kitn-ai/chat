#!/usr/bin/env node
// A positive assertion about reasoning, read out of the recorded fixtures.
//
// WHAT THIS EXISTS FOR
//
// `anthropic/claude-haiku-4.5` on the OpenAI-compatible wire recorded ZERO
// reasoning across all 13 scenarios for an entire conformance sweep, and the
// results doc published that silence as a provider limit: "Haiku emits no
// reasoning on the OpenAI wire… it isolates the loss to the normalisation
// layer." It was our own request shape. OpenRouter derives an Anthropic thinking
// budget as a percentage of `max_tokens`; the harness caps `max_tokens` at 900
// for cost, so `reasoning: { effort: 'medium' }` derived roughly 450 — under
// Anthropic's hard 1024-token floor — and the provider answered with HTTP 200
// and no thinking at all.
//
// THAT is why a whole sweep walked past it: the failure was a 200 with silence.
// Nothing errored, so every check that asked "did the request fail?" said no.
// `server/thinking-budget.test.ts` now pins the request SHAPE; this pins the
// OUTCOME, which is the half that survives the next provider's floor.
// OpenRouter applies the same derived-budget path to Gemini and some Qwen
// models, so adding either column re-arms the identical trap.
//
// THE FIELD IS NOT THE SAME ON BOTH WIRES — and this is the trap inside the trap
//
//   openai wire     usage.completion_tokens_details.reasoning_tokens
//   anthropic wire  usage.output_tokens_details.thinking_tokens
//
// A guard keyed only on `reasoning_tokens` reads zero for the whole
// `-anthropic-wire` column, whose thinking has worked correctly the entire time,
// and reports a WIRE difference as a model failure — the exact defect class this
// file exists to prevent. Worse, such a guard also goes red against the historical
// pre-fix fixtures, so its red/green pair looks like proof while it measures
// nothing on half the columns. `usageFieldFor` therefore switches exhaustively on
// the declared wire and THROWS on anything else: a third dialect must be a hard
// failure, never a silent zero.
//
// WHAT IT ASSERTS, per column
//
//   · the declaration is complete    — no `reasons`/`wire` means a hard failure,
//                                      so a new column cannot opt out by omission
//   · something was actually READ    — "no fixtures matched" and "no reasoning in
//                                      the fixtures" are different failures that
//                                      produce the same number, and only one of
//                                      them means what this guard claims
//   · every stream TERMINATED        — a recording cut mid-flight has no usage
//                                      block at all, because usage is the last
//                                      thing in a stream, so it reads as zero
//                                      reasoning and gets blamed on the model
//   · the wire's field was FOUND     — usage present but the field missing means
//                                      the dialect changed under us
//   · `reasons: true`  => max thinking tokens over the column > 0
//   · `reasons: false` => no thinking tokens anywhere (the declaration is held to
//                                      account in both directions)
//
// Column-level, not per-scenario, on purpose: models legitimately decline to
// think on a given turn (DeepSeek does, on two of its thirteen), so a
// per-scenario requirement would be flaky and a flaky guard gets deleted. The
// historical bug was a column at exactly zero, which is what this catches — and
// the per-scenario breakdown is printed anyway, so a partial regression is
// visible to a reader even though it is not asserted.
//
// It reads committed fixtures only: no key, no network, no browser.
//
//   node harness/reasoning-coverage.mjs                 # the spike's own fixtures
//   node harness/reasoning-coverage.mjs /path/fixtures  # any recorded set
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODELS } from './models.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where the thinking-token count lives, per SSE dialect.
 *
 *  Exhaustive and throwing. The default branch is the whole point: if a third
 *  dialect ever reaches this function, neither key matches, every lookup returns
 *  `undefined`, and a healthy column reads as a column that never thought. A
 *  guard that answers "zero" for a question it does not understand is worse than
 *  no guard. */
export function usageFieldFor(wire) {
  switch (wire) {
    case 'openai':
      return { container: 'completion_tokens_details', field: 'reasoning_tokens' };
    case 'anthropic':
      return { container: 'output_tokens_details', field: 'thinking_tokens' };
    default:
      throw new Error(
        `reasoning-coverage: unknown wire ${JSON.stringify(wire)}. Each dialect spells the ` +
          `thinking-token count differently (openai: completion_tokens_details.reasoning_tokens, ` +
          `anthropic: output_tokens_details.thinking_tokens). Add the new dialect's spelling here ` +
          `rather than letting it read as zero reasoning.`,
      );
  }
}

/** The fixture directory name for a (model, wire) pair.
 *
 *  A deliberate second copy of `modelSlug`/`fixtureSlug` from
 *  `server/openrouter-proxy.ts`: that file is TypeScript and this one has to run
 *  under bare node with no build step. `server/reasoning-coverage.test.ts` pins
 *  this against the proxy's own functions for every catalog entry, so the copy
 *  cannot drift without a red test. */
export function fixtureDirFor(model, wire) {
  const slug =
    String(model)
      .replace(/^~/, '')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/\.{2,}/g, '.')
      .toLowerCase() || 'unknown-model';
  return wire === 'anthropic' ? `${slug}-anthropic-wire` : slug;
}

/** Every clean recording ends with this, in all three dialects the spike has
 *  seen: OpenAI's, DeepSeek's, and the Anthropic Skin's (which closes
 *  `message_stop`, `event: data`, then this). Verified across all 138 committed
 *  fixtures — 138 of 138.
 *
 *  It is the only marker there is. `recordFixture` writes from a `finally`
 *  block, so a stream that dies mid-flight is still written to disk, and the
 *  error frame emitted on the catch path never enters the capture buffer: the
 *  file is short, well-formed, and says nothing about having failed. */
const STREAM_TERMINATOR = 'data: [DONE]';

/**
 * Read one recorded round.
 *
 * Returns the usage frames seen and the thinking-token counts they reported, so
 * the caller can tell four genuinely different things apart:
 *   · `terminated === false` — the recording is CUT SHORT and unusable
 *   · `usageFrames === 0`  — nothing to measure; a garbled recording
 *   · `samples.length === 0` — usage reported, but not this wire's field
 *   · `samples` all zero   — the provider measured the thinking and it was none
 *
 * The first of those is why the terminator is checked at all. Usage is the LAST
 * thing in a stream, so a stream cut at token 40 has no usage block — and would
 * read as "declared reasoning-capable, produced nothing", pointing at a provider
 * or a request-shape bug when the real cause was a connection that died. That is
 * the same wrong-diagnosis shape as keying on the wrong field name: a
 * true-looking red for an unrelated reason.
 *
 * `reasoningTokens` is the MAX rather than the sum: the Anthropic wire reports
 * cumulative usage on `message_delta` and the OpenAI wire reports it once at the
 * end, so summing would double-count the day a provider starts emitting running
 * totals. For a "> 0" claim the max is never wrong in the direction that matters.
 */
export function readRound(sse, wire) {
  const { container, field } = usageFieldFor(wire);
  const lines = String(sse).split('\n');
  let usageFrames = 0;
  const samples = [];

  const lastMeaningful = lines.map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
  const terminated = lastMeaningful === STREAM_TERMINATOR;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') continue;

    let frame;
    try {
      frame = JSON.parse(payload);
    } catch {
      continue; // a partial line in a cancelled recording is not a measurement
    }
    if (!frame || typeof frame !== 'object') continue;

    // Both dialects put usage at the top level of their final frame; the
    // Anthropic wire ALSO carries a preliminary one inside `message_start`,
    // whose `output_tokens_details` is null. Read both and let the details
    // lookup decide which one actually said anything.
    for (const usage of [frame.usage, frame.message?.usage]) {
      if (!usage || typeof usage !== 'object') continue;
      usageFrames += 1;
      const details = usage[container];
      if (!details || typeof details !== 'object') continue;
      const value = details[field];
      if (typeof value === 'number' && Number.isFinite(value)) samples.push(value);
    }
  }

  return {
    terminated,
    usageFrames,
    samples,
    reasoningTokens: samples.length ? Math.max(...samples) : null,
  };
}

const dirsIn = (path) => {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return null; // missing directory, which the caller reports as unrecorded
  }
};

const roundsIn = (path) => {
  try {
    return readdirSync(path)
      .filter((f) => f.endsWith('.sse'))
      .sort();
  } catch {
    return [];
  }
};

/** Everything wrong with a declaration, in the entry's own words. Checked before
 *  a single file is opened: a column whose declaration is broken has no verdict
 *  to give, and guessing one is how a column joins the matrix uncovered. */
function declarationFaults(entry) {
  const faults = [];
  if (!entry || typeof entry !== 'object') return ['not an object'];
  for (const key of ['key', 'model']) {
    if (typeof entry[key] !== 'string' || !entry[key]) faults.push(`\`${key}\` must be a non-empty string`);
  }
  if (entry.wire !== 'openai' && entry.wire !== 'anthropic') {
    faults.push(`\`wire\` must be 'openai' or 'anthropic', got ${JSON.stringify(entry.wire)}`);
  }
  if (typeof entry.reasons !== 'boolean') {
    faults.push(
      `\`reasons\` must be declared true or false, got ${JSON.stringify(entry.reasons)} — ` +
        `a model with no capability declaration cannot be checked, and defaulting it either way ` +
        `lets a new column opt out of coverage in silence`,
    );
  }
  return faults;
}

/** Audit one column against its recorded fixtures. */
function auditColumn(fixturesRoot, entry) {
  const faults = declarationFaults(entry);
  const key = (entry && typeof entry === 'object' && entry.key) || '(unnamed)';
  const base = {
    key: String(key),
    model: (entry && entry.model) ?? null,
    wire: (entry && entry.wire) ?? null,
    reasons: entry && typeof entry.reasons === 'boolean' ? entry.reasons : null,
    label: entry && entry.model ? `${entry.model} (${entry.wire} wire)` : String(key),
    dir: null,
    scenarios: [],
    roundsRead: 0,
    usageFrames: 0,
    reasoningTokens: 0,
  };

  if (faults.length) {
    return { ...base, verdict: 'undeclared', reason: `undeclared column: ${faults.join('; ')}` };
  }

  const dir = fixtureDirFor(entry.model, entry.wire);
  const columnRoot = join(fixturesRoot, 'live', dir);
  const scenarioDirs = dirsIn(columnRoot);

  if (scenarioDirs === null || scenarioDirs.length === 0) {
    return {
      ...base,
      dir,
      verdict: 'unrecorded',
      reason: `no recordings under fixtures/live/${dir}/ — a MISSING measurement, not a pass`,
    };
  }

  const scenarios = [];
  let roundsRead = 0;
  let usageFrames = 0;
  const truncated = [];
  const noUsage = [];
  const noField = [];

  for (const scenario of scenarioDirs) {
    const scenarioRoot = join(columnRoot, scenario);
    const rounds = roundsIn(scenarioRoot);
    let best = 0;
    for (const round of rounds) {
      const path = join(scenarioRoot, round);
      if (!statSync(path).isFile()) continue;
      const read = readRound(readFileSync(path, 'utf8'), entry.wire);
      roundsRead += 1;
      usageFrames += read.usageFrames;
      if (!read.terminated) truncated.push(`${scenario}/${round}`);
      else if (read.usageFrames === 0) noUsage.push(`${scenario}/${round}`);
      else if (read.samples.length === 0) noField.push(`${scenario}/${round}`);
      best = Math.max(best, read.reasoningTokens ?? 0);
    }
    scenarios.push({ id: scenario, rounds: rounds.length, reasoningTokens: best });
  }

  const measured = { ...base, dir, scenarios, roundsRead, usageFrames };
  const reasoningTokens = scenarios.reduce((max, s) => Math.max(max, s.reasoningTokens), 0);
  const thinking = scenarios.filter((s) => s.reasoningTokens > 0).map((s) => s.id);
  const silent = scenarios.filter((s) => s.reasoningTokens === 0).map((s) => s.id);

  // "Nothing was read" and "nothing was found" are the same number and are not
  // the same fact. Rule the unreadable cases out FIRST, so a broken recording is
  // never reported as a model that declined to think.
  if (roundsRead === 0) {
    return {
      ...measured,
      reasoningTokens,
      verdict: 'unrecorded',
      reason: `fixtures/live/${dir}/ has scenario directories but no round-N.sse in any of them`,
    };
  }
  if (truncated.length) {
    return {
      ...measured,
      reasoningTokens,
      verdict: 'truncated',
      reason:
        `${truncated.length} of ${roundsRead} recorded rounds do not end with "${STREAM_TERMINATOR}", ` +
        `so the stream died mid-flight and was written out anyway (\`recordFixture\` runs in a ` +
        `\`finally\`, and the error frame never reaches the capture buffer). Usage is the LAST thing ` +
        `in a stream, so these would otherwise read as zero reasoning and be blamed on the model or ` +
        `the request shape. Re-record them: ${truncated.join(', ')}`,
    };
  }
  if (noUsage.length) {
    return {
      ...measured,
      reasoningTokens,
      verdict: 'unreadable',
      reason:
        `${noUsage.length} of ${roundsRead} recorded rounds carry no usage frame at all, so there was ` +
        `nothing to measure: ${noUsage.join(', ')}`,
    };
  }
  if (noField.length) {
    const { container, field } = usageFieldFor(entry.wire);
    return {
      ...measured,
      reasoningTokens,
      verdict: 'wrong-field',
      reason:
        `${noField.length} of ${roundsRead} recorded rounds report usage but never ` +
        `usage.${container}.${field}, the ${entry.wire} wire's spelling of the thinking-token count. ` +
        `Either the recording is truncated or the dialect changed: ${noField.join(', ')}`,
    };
  }

  if (entry.reasons && reasoningTokens === 0) {
    return {
      ...measured,
      reasoningTokens,
      verdict: 'silent',
      reason:
        `declared reasons: true but recorded ZERO thinking tokens across all ${scenarios.length} ` +
        `scenarios (${roundsRead} rounds): ${silent.join(', ')}. This is the shape of the haiku-oai ` +
        `bug — a 200 with an empty reasoning channel, most likely a thinking budget under the ` +
        `provider's floor. Check the request shape before believing it is a model characteristic.`,
    };
  }
  if (!entry.reasons && reasoningTokens > 0) {
    return {
      ...measured,
      reasoningTokens,
      verdict: 'mislabelled',
      reason:
        `declared reasons: false but recorded up to ${reasoningTokens} thinking tokens in ` +
        `${thinking.join(', ')}. The declaration is wrong, and a wrong 'false' is how a real ` +
        `regression hides behind an exemption.`,
    };
  }

  return {
    ...measured,
    reasoningTokens,
    verdict: 'ok',
    reason: entry.reasons
      ? `thinking in ${thinking.length}/${scenarios.length} scenarios, up to ${reasoningTokens} tokens`
      : `no thinking anywhere, as declared`,
  };
}

/** Verdicts that mean the sweep cannot be believed. `unrecorded` is deliberately
 *  NOT one of them — a column with nothing recorded is a missing measurement, the
 *  same distinction the harness draws between `skip` and `FAIL` — but it is never
 *  reported as a pass either. */
export const FAILING_VERDICTS = [
  'undeclared',
  'truncated',
  'unreadable',
  'wrong-field',
  'silent',
  'mislabelled',
];

/**
 * Audit every column.
 *
 * `models` is typed `unknown[]` on purpose. The undeclared-column check is a
 * RUNTIME check, and a signature that promised well-formed entries would make the
 * one case this guard most needs to prove — a new column with no `reasons` — the
 * one case its own test could not express.
 *
 * @param {string} fixturesRoot the directory containing `live/`
 * @param {readonly unknown[]} models
 */
export function auditReasoningCoverage(fixturesRoot, models = MODELS) {
  const root = resolve(fixturesRoot);
  const columns = models.map((entry) => auditColumn(root, entry));
  return {
    fixturesRoot: root,
    columns,
    failures: columns.filter((c) => FAILING_VERDICTS.includes(c.verdict)),
    missing: columns.filter((c) => c.verdict === 'unrecorded'),
    roundsRead: columns.reduce((n, c) => n + c.roundsRead, 0),
  };
}

const pad = (cells, widths) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');

export function formatCoverageReport(report) {
  const head = ['column', 'wire', 'declared', 'rounds', 'thinking', 'max tok', 'verdict'];
  const rows = report.columns.map((c) => [
    c.key,
    c.wire ?? '?',
    c.reasons === null ? '?' : c.reasons ? 'reasons' : 'no-reasoning',
    String(c.roundsRead),
    c.scenarios.length ? `${c.scenarios.filter((s) => s.reasoningTokens > 0).length}/${c.scenarios.length}` : '-',
    String(c.reasoningTokens),
    c.verdict.toUpperCase(),
  ]);
  const widths = head.map((_, i) => Math.max(...[head, ...rows].map((r) => String(r[i]).length)));

  const out = [
    `reasoning coverage — ${report.fixturesRoot}`,
    '',
    pad(head, widths),
    pad(
      head.map((_, i) => '-'.repeat(widths[i])),
      widths,
    ),
    ...rows.map((r) => pad(r, widths)),
    '',
    `${report.roundsRead} recorded rounds read`,
  ];

  for (const c of report.columns) {
    if (c.verdict === 'ok') continue;
    out.push('', `  [${c.key}] ${c.verdict.toUpperCase()} — ${c.label}`, `      ${c.reason}`);
    if (c.scenarios.length) {
      out.push(`      per scenario: ${c.scenarios.map((s) => `${s.id}=${s.reasoningTokens}`).join(' ')}`);
    }
  }
  return out.join('\n');
}

// Standalone entry point, so this can be pointed at any recorded set — including
// a historical one extracted from git — without a test runner.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = process.argv[2] ? resolve(process.argv[2]) : join(HERE, '..', 'fixtures');
  const report = auditReasoningCoverage(root, MODELS);
  console.log(formatCoverageReport(report));
  if (report.roundsRead === 0) {
    console.error(`\n!! read 0 recorded rounds under ${root}/live — nothing was measured.`);
    process.exitCode = 1;
  } else if (report.failures.length) {
    console.error(`\n!! ${report.failures.length} column(s) failed: ${report.failures.map((c) => c.key).join(', ')}`);
    process.exitCode = 1;
  }
}
