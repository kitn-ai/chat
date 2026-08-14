#!/usr/bin/env node
// The cross-model matrix runner.
//
// One conformance pass per model, then a scenario x model table.
//
// THE BLOCKER THIS EXISTS FOR: `OPENROUTER_MODEL` is read server-side, per
// request, by the Vite plugin. Switching models means a new dev server. Playwright
// will happily start one — but its `reuseExistingServer: true` means a second
// model would silently reuse the FIRST model's server and every row after the
// first would be a lie with no symptom. So each model gets its own PORT, which
// makes reuse impossible, and `SPIKE_EXPECT_MODEL` makes the runner assert what
// the page actually reports before it believes a single result.
//
// The key is never touched here. `OPENROUTER_ENV_DIR` only tells Vite's loadEnv
// which directory to look in; the value is read server-side and never crosses
// back.
//
//   node harness/run-matrix.mjs                    # live pass, every model
//   node harness/run-matrix.mjs --mode replay      # offline, from what was recorded
//   node harness/run-matrix.mjs --only deepseek,haiku
//   node harness/run-matrix.mjs --scenarios S01-plain-text,S03-single-tool
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The catalog lives in its own module so anything that needs to know what the
// columns are — the reasoning-coverage guard and its vitest spec — can ask
// without importing THIS file, which runs a whole sweep at import time.
import { MODELS } from './models.mjs';
import { auditReasoningCoverage, formatCoverageReport } from './reasoning-coverage.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPIKE_ROOT = resolve(HERE, '..');
const REPORT_DIR = join(SPIKE_ROOT, 'harness', 'matrix-reports');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MODE = arg('mode', 'live');
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SCENARIOS = arg('scenarios', '');
const selected = MODELS.filter((m) => ONLY.length === 0 || ONLY.includes(m.key));

/** A port that already answers is a port we cannot trust: something else is
 *  serving it, possibly a stale dev server on another model. Refuse rather than
 *  measure the wrong thing. */
function portIsFree(port) {
  return new Promise((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
      .on('connect', () => {
        socket.destroy();
        done(false);
      })
      .on('error', () => done(true));
    setTimeout(() => {
      socket.destroy();
      done(true);
    }, 1500);
  });
}

/** Walk the Playwright JSON report, which nests suites arbitrarily deep. */
function collectSpecs(node, out = []) {
  for (const spec of node.specs ?? []) out.push(spec);
  for (const suite of node.suites ?? []) collectSpecs(suite, out);
  return out;
}

/**
 * Turn one spec into a cell.
 *
 * The three outcomes that look alike and are NOT the same thing:
 *   · `gap`  — the scenario is a documented known gap and failed as documented.
 *              The runner records that as a `confirmed-gap` annotation and
 *              reports the test as passed, so without reading annotations a gap
 *              is indistinguishable from a real pass.
 *   · `skip` — a live scenario with no recording yet. A MISSING measurement, not
 *              a failing one.
 *   · `fail` — everything else, with the runner's own diagnostic block attached
 *              (rounds / tool calls / finish reason), which is what lets a human
 *              tell a UI bug from a model that simply never called the tool.
 *
 * A fourth thing two `pass` cells can hide: the two wires do not always test the
 * same claim. S05's OpenAI fixture interleaves two calls' argument fragments;
 * Anthropic closes each content block before opening the next and CANNOT produce
 * that shape, so its cell is a strictly weaker claim. The scenario declares the
 * difference (`provesByWire`), the runner annotates it per run, and `claim`
 * carries it into the table as a footnote — because printing both as a bare
 * `pass` reads the weaker cell as the stronger one.
 */
function classify(spec) {
  const test = spec.tests?.[0];
  const result = test?.results?.[0];
  const annotations = [...(spec.annotations ?? []), ...(test?.annotations ?? [])];
  const gap = annotations.find((a) => a.type === 'confirmed-gap');
  const diff = annotations.find((a) => a.type === 'model-behaviour');
  const claim = annotations.find((a) => a.type === 'wire-claim')?.description ?? '';
  const status = result?.status ?? test?.status ?? 'unknown';

  if (gap) return { state: 'gap', detail: gap.description ?? '', claim };
  // A DECLARED model-behaviour difference: red because this model does something
  // else, not because the kit broke. Its own state rather than a `fail`, so the
  // verdict below does not end a sweep red for a documented difference — and its
  // own state rather than a `pass`, because a reader must be able to see that
  // this cell did not exercise what the scenario claims. `harness/model-behaviour.ts`
  // makes the declaration fail in BOTH directions before it is trusted here.
  if (diff) return { state: 'diff', detail: diff.description ?? '', claim };
  if (status === 'skipped') {
    return { state: 'skip', detail: result?.error?.message ?? 'no recording yet', claim };
  }
  if (status === 'passed') return { state: 'pass', detail: '', claim };
  return {
    state: 'fail',
    detail: (result?.error?.message ?? result?.errors?.[0]?.message ?? 'failed').trim(),
    claim,
  };
}

/** Scenario id out of a test title like `S03-single-tool [live] — Single tool call`. */
function scenarioIdOf(title) {
  const m = /^(\S+)\s+\[(live|replay)\]/.exec(title);
  return m ? { id: m[1], mode: m[2] } : null;
}

async function runOne(entry) {
  const label = `${entry.model} (${entry.wire} wire)`;
  if (!(await portIsFree(entry.port))) {
    throw new Error(
      `Port ${entry.port} is already in use. The matrix gives each model its own port so a stale ` +
        `dev server can never be reused with the wrong OPENROUTER_MODEL. Free it and re-run.`,
    );
  }

  const reportPath = join(REPORT_DIR, `${entry.key}.${MODE}.json`);
  mkdirSync(REPORT_DIR, { recursive: true });

  console.log(`\n${'='.repeat(72)}\n${label} — ${MODE}\n${'='.repeat(72)}`);

  const started = Date.now();
  const child = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--config', 'harness/playwright.config.ts'],
    {
      cwd: SPIKE_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Read by the Vite plugin the webServer starts, per request. The wire is
        // sent EXPLICITLY rather than left to `auto`: the catalog declares it,
        // the fixture directory is named after it, and the reasoning-coverage
        // guard reads a different usage field per dialect. Letting the server
        // derive one while the catalog declares another is how a column would be
        // measured against the wrong recordings.
        // `server/reasoning-coverage.test.ts` pins every declaration against
        // `resolveWire`, so this is the same wire `auto` used to pick.
        OPENROUTER_MODEL: entry.model,
        OPENROUTER_WIRE: entry.wire,
        // Declared, like the wire and for the same reason. On a `gateway` column
        // the proxy IGNORES the two lines above — that route pins its own model
        // and re-frames its own stream — and `SPIKE_EXPECT_MODEL` below is what
        // holds the declaration and the route's pinned id together: change one
        // without the other and the suite refuses the row rather than measuring
        // it against the wrong recordings.
        SPIKE_BACKEND: entry.backend,
        SPIKE_PORT: String(entry.port),
        SPIKE_MODE: MODE,
        SPIKE_EXPECT_MODEL: entry.model,
        SPIKE_JSON_REPORT: reportPath,
        ...(SCENARIOS ? { SPIKE_ONLY: SCENARIOS } : {}),
      },
    },
  );

  if (!existsSync(reportPath)) {
    throw new Error(`${label}: Playwright produced no report at ${reportPath} (exit ${child.status})`);
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const cells = {};
  for (const spec of collectSpecs(report)) {
    const parsed = scenarioIdOf(spec.title);
    if (!parsed) continue; // the catalog check and the S12 control are not rows
    cells[parsed.id] = { ...classify(spec), mode: parsed.mode };
  }

  return {
    key: entry.key,
    model: entry.model,
    wire: entry.wire,
    label,
    exitCode: child.status,
    seconds: Math.round((Date.now() - started) / 1000),
    cells,
  };
}

const GLYPH = { pass: 'pass', fail: 'FAIL', gap: 'gap', diff: 'diff', skip: 'skip', unknown: '?' };

const row = (cells) => `| ${cells.join(' | ')} |`;

/** `pass*` = this cell's wire proves something OTHER than the scenario's general
 *  claim. The asterisk is the whole point: it is what stops a reader treating
 *  two green cells as two equal results. */
const glyphFor = (cell) => `${GLYPH[cell?.state ?? 'unknown']}${cell?.claim ? '*' : ''}`;

function renderTable(rows) {
  const ids = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))].sort();
  return [
    row(['scenario', ...rows.map((r) => r.key)]),
    row(['---', ...rows.map(() => '---')]),
    ...ids.map((id) => row([id, ...rows.map((r) => glyphFor(r.cells[id]))])),
  ].join('\n');
}

/** The footnotes behind every `*`: what that configuration's cell ACTUALLY
 *  proves, in its own words, deduped so five columns of the same wire print the
 *  claim once. */
function renderClaims(rows) {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    for (const [id, cell] of Object.entries(r.cells)) {
      if (!cell.claim) continue;
      const key = `${id}|${cell.claim}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`  ${id} ${cell.claim}`);
    }
  }
  return out;
}

const results = [];
for (const entry of selected) {
  try {
    results.push(await runOne(entry));
  } catch (e) {
    console.error(`\n!! ${entry.key}: ${e.message}`);
    results.push({ key: entry.key, model: entry.model, label: entry.model, error: e.message, cells: {} });
  }
}

const summaryPath = join(REPORT_DIR, `matrix.${MODE}.json`);
writeFileSync(summaryPath, JSON.stringify(results, null, 2));

console.log(`\n${'='.repeat(72)}\nMATRIX (${MODE})\n${'='.repeat(72)}\n`);
console.log(renderTable(results));

const claims = renderClaims(results);
if (claims.length) {
  console.log('\n* these cells do not prove what the scenario generally claims:\n');
  console.log(claims.join('\n'));
}

console.log('\nFailures and gaps in detail:\n');
for (const row of results) {
  for (const [id, cell] of Object.entries(row.cells)) {
    if (cell.state === 'pass') continue;
    const first = cell.detail.split('\n').slice(0, 8).join('\n      ');
    console.log(`  [${row.key}] ${id} — ${cell.state}\n      ${first}\n`);
  }
}
console.log(`Raw reports: ${REPORT_DIR}`);

// Every cell above can be green while a whole column recorded no reasoning at
// all: none of the scenarios assert that the model THOUGHT, only that what it
// produced rendered. `haiku-oai` passed a full sweep that way and its silence was
// published as a provider limit. So the sweep ends by reading its own recordings
// back and saying so out loud.
//
// The same audit runs offline in `server/reasoning-coverage.test.ts`, which is
// the copy that cannot be skipped. This one exists so a live run fails at the
// moment of recording rather than at the next CI run.
console.log(`\n${'='.repeat(72)}\nREASONING COVERAGE\n${'='.repeat(72)}\n`);
const coverage = auditReasoningCoverage(join(SPIKE_ROOT, 'fixtures'), selected);
console.log(formatCoverageReport(coverage));

if (coverage.roundsRead === 0) {
  console.error(`\n!! read 0 recorded rounds — the coverage check measured NOTHING.`);
  process.exitCode = 1;
} else if (coverage.failures.length) {
  console.error(
    `\n!! reasoning coverage FAILED for ${coverage.failures.map((c) => c.key).join(', ')}. ` +
      `Do not publish this sweep's reasoning column as a model characteristic until the request ` +
      `shape and the recordings have been checked.`,
  );
  process.exitCode = 1;
}
if (coverage.missing.length) {
  console.log(`\n   missing measurements (nothing recorded): ${coverage.missing.map((c) => c.key).join(', ')}`);
}

// THE VERDICT. Until this existed the runner printed `FAIL` cells and exited 0,
// because only the reasoning audit above ever touched `process.exitCode` — a
// measured, reproducible fact: `--only ministral --mode replay` printed two FAIL
// rows and returned EXIT=0. So the matrix could not be wired into CI as a gate;
// anyone who tried would get a job that passes no matter what the cells say,
// which is the failure mode this whole harness exists to catch, in the harness.
//
// Three things end the run red, and the third is the one that is easy to leave out:
//   · a red cell;
//   · a model row that could not run at all (its Playwright process died, or the
//     port was busy) — that is UNMEASURED, not passed;
//   · ZERO cells collected. A run that measured nothing must never exit 0. This
//     is the same "absence read as zero" that produced the thinking-budget bug:
//     an empty result set and a clean result set are the same number of failures.
const rowsWithError = results.filter((r) => r.error);
const failedCells = results.flatMap((r) =>
  Object.entries(r.cells ?? {})
    .filter(([, c]) => c.state === 'fail')
    .map(([id]) => `${r.key}/${id}`),
);
const totalCells = results.reduce((n, r) => n + Object.keys(r.cells ?? {}).length, 0);
// Declared differences do NOT end the run red — that is the point of declaring
// them — but they are counted out loud, because a sweep whose green depends on
// exemptions should say how many it is leaning on.
const declaredDiffs = results.flatMap((r) =>
  Object.entries(r.cells ?? {})
    .filter(([, c]) => c.state === 'diff')
    .map(([id]) => `${r.key}/${id}`),
);
const skipped = results.flatMap((r) =>
  Object.entries(r.cells ?? {})
    .filter(([, c]) => c.state === 'skip')
    .map(([id]) => `${r.key}/${id}`),
);

console.log(`\n${'='.repeat(72)}\nVERDICT\n${'='.repeat(72)}\n`);
console.log(
  `  configurations: ${results.length}   cells: ${totalCells}   ` +
    `failed: ${failedCells.length}   declared diffs: ${declaredDiffs.length}   ` +
    `skipped: ${skipped.length}   errored rows: ${rowsWithError.length}`,
);

if (totalCells === 0) {
  console.error(`\n!! the matrix collected ZERO cells — it measured NOTHING. Not a pass.`);
  process.exitCode = 1;
}
if (rowsWithError.length) {
  console.error(
    `\n!! ${rowsWithError.length} configuration(s) never ran: ` +
      `${rowsWithError.map((r) => `${r.key} (${r.error})`).join('; ')}`,
  );
  process.exitCode = 1;
}
if (failedCells.length) {
  console.error(`\n!! ${failedCells.length} cell(s) FAILED: ${failedCells.join(', ')}`);
  process.exitCode = 1;
}
if (skipped.length) {
  // Not fatal on its own — a `live` scenario with no recording yet is a missing
  // measurement, and the harness deliberately distinguishes that from a failure.
  // It is still printed, because "we did not measure it" degrades a sweep's
  // coverage claim and is invisible from the table, where `skip` is one word.
  console.log(`\n   not measured (no recording yet): ${skipped.join(', ')}`);
}

// `ministral-3b`'s S02 and S04 are the two cells that made this necessary: both
// are documented MODEL-BEHAVIOUR differences rather than defects, so a truthful
// exit code would have ended every sweep red forever, which trains everyone to
// read red as noise — worse than the always-green bug it replaced.
//
// They are DECLARED, in `harness/model-behaviour.ts`, not special-cased here. An
// exemption hard-coded in the runner is one nobody ever has to re-justify; a
// declaration has to say what the model does instead, must still fail with the
// documented failure, and goes RED if the cell starts passing — so a difference
// that quietly disappears surfaces instead of becoming a permanent hole.
