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

const HERE = dirname(fileURLToPath(import.meta.url));
const SPIKE_ROOT = resolve(HERE, '..');
const REPORT_DIR = join(SPIKE_ROOT, 'harness', 'matrix-reports');

/**
 * The models under test. Chosen to close gaps rather than for breadth:
 *
 *  1. the baseline everything else was proven on;
 *  2. an Anthropic model through OpenRouter's Anthropic Skin — the ONLY way to
 *     drive `readAnthropicStream` and `toAnthropicMessages` against a live
 *     provider, and the least-proven path in the kit;
 *  3. the SAME Anthropic model through the OpenAI-compatible endpoint, so a
 *     failure in (2) can be attributed to the wire or to the model, not to both;
 *  4. a genuine OpenAI model, to show the OpenAI reader is not accidentally
 *     shaped around DeepSeek's dialect;
 *  5. a small cheap model, to measure the floor of what a consumer gets away with.
 */
const MODELS = [
  { key: 'deepseek', model: '~deepseek/deepseek-v4-flash-latest', port: 5180 },
  { key: 'haiku', model: 'anthropic/claude-haiku-4.5', port: 5181 },
  { key: 'haiku-oai', model: 'anthropic/claude-haiku-4.5', wire: 'openai', port: 5182 },
  { key: 'gpt', model: 'openai/gpt-5.4-mini', port: 5183 },
  { key: 'ministral', model: 'mistralai/ministral-3b-2512', port: 5184 },
];

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
 */
function classify(spec) {
  const test = spec.tests?.[0];
  const result = test?.results?.[0];
  const annotations = [...(spec.annotations ?? []), ...(test?.annotations ?? [])];
  const gap = annotations.find((a) => a.type === 'confirmed-gap');
  const status = result?.status ?? test?.status ?? 'unknown';

  if (gap) return { state: 'gap', detail: gap.description ?? '' };
  if (status === 'skipped') {
    return { state: 'skip', detail: result?.error?.message ?? 'no recording yet' };
  }
  if (status === 'passed') return { state: 'pass', detail: '' };
  return {
    state: 'fail',
    detail: (result?.error?.message ?? result?.errors?.[0]?.message ?? 'failed').trim(),
  };
}

/** Scenario id out of a test title like `S03-single-tool [live] — Single tool call`. */
function scenarioIdOf(title) {
  const m = /^(\S+)\s+\[(live|replay)\]/.exec(title);
  return m ? { id: m[1], mode: m[2] } : null;
}

async function runOne(entry) {
  const label = entry.wire ? `${entry.model} (${entry.wire} wire)` : entry.model;
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
        // Read by the Vite plugin the webServer starts, per request.
        OPENROUTER_MODEL: entry.model,
        ...(entry.wire ? { OPENROUTER_WIRE: entry.wire } : { OPENROUTER_WIRE: 'auto' }),
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
    wire: entry.wire ?? (/^~?anthropic\//.test(entry.model) ? 'anthropic' : 'openai'),
    label,
    exitCode: child.status,
    seconds: Math.round((Date.now() - started) / 1000),
    cells,
  };
}

const GLYPH = { pass: 'pass', fail: 'FAIL', gap: 'gap', skip: 'skip', unknown: '?' };

const row = (cells) => `| ${cells.join(' | ')} |`;

function renderTable(rows) {
  const ids = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))].sort();
  return [
    row(['scenario', ...rows.map((r) => r.key)]),
    row(['---', ...rows.map(() => '---')]),
    ...ids.map((id) => row([id, ...rows.map((r) => GLYPH[r.cells[id]?.state ?? 'unknown'])])),
  ].join('\n');
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
console.log('\nFailures and gaps in detail:\n');
for (const row of results) {
  for (const [id, cell] of Object.entries(row.cells)) {
    if (cell.state === 'pass') continue;
    const first = cell.detail.split('\n').slice(0, 8).join('\n      ');
    console.log(`  [${row.key}] ${id} — ${cell.state}\n      ${first}\n`);
  }
}
console.log(`Raw reports: ${REPORT_DIR}`);
