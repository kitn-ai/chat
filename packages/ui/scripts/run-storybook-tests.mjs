#!/usr/bin/env node
// Sub-batching + retry wrapper for the storybook browser test project.
//
// Why this exists: the storybook project runs ~112 *.stories.tsx as chromium
// browser tests (render + play + axe). vitest runs them through a SINGLE
// long-lived chromium process per invocation, which accumulates ~20MB of
// never-reclaimed memory PER story file (a vitest-browser/chromium harness cost,
// not our component code — proven: the ~45-file local crash ceiling is unchanged
// whether the theme MutationObserver or the heaviest app stories are removed). On
// the smaller CI runners that ceiling is lower, so even a 14-file shard sometimes
// dies mid-run ("Browser connection was closed" / "[birpc] rpc is closed") — a
// process-level crash that vitest's own per-test `retry` cannot recover.
//
// The only reliable lever is files-per-process. This wrapper splits the work into
// small SUB-SHARDS and runs EACH in a FRESH vitest process (= fresh chromium), so
// no single browser ever sees enough files to crash. Each sub-shard is retried a
// few times to absorb a rare crash; a real, deterministic regression still fails
// every attempt and goes red.
//
// ── The diagnostic contract ────────────────────────────────────────────────────
// This wrapper REPORTS OBSERVATIONS AND NEVER NAMES A CAUSE.
//
// It used to retry under the banner "likely a chromium crash, not a test failure".
// That sentence was never checked against anything — it was printed for every
// non-zero exit. A `vitest.config.ts` SYNTAX ERROR was observed being retried three
// times wearing it, which is the worst possible outcome: a genuine config break
// reaches CI disguised as the one failure everybody has been trained to wave
// through, precisely because the sub-sharding above exists to work around a real
// harness flake.
//
// So every line this script prints about a failure is something it actually
// checked: the exit status, the signal (if any), whether vitest recorded any test
// results, whether the config file parses, and the head of stderr. Where those
// checks do not separate the possibilities, it prints "unknown" — which is a true
// statement, and the banner was not. The same rule is already enforced elsewhere in
// this repo (`src/wire/openai-fixtures.test.ts` asserts the adapter cannot blame a
// token limit it was never told about); `tests/scripts/storybook-retry-report.test.ts`
// enforces it here, so the next well-meaning "add the likely cause, it'd be more
// useful" edit fails a test instead of shipping.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_ATTEMPTS = Number(process.env.STORYBOOK_TEST_ATTEMPTS ?? 3);

// Target number of sub-shards across ALL CI matrix shards combined. ~112 files /
// 20 ≈ 5-6 files per fresh chromium process — a comfortable margin under the
// crash ceiling. Raise it (env only, no workflow edit) if a runner ever still
// crashes; it just makes each batch smaller.
const SUBSHARD_TARGET = Number(process.env.STORYBOOK_SUBSHARD_TOTAL ?? 20);

// vitest's own config-file resolution order, so we check the file vitest would
// have loaded rather than a file we assumed it loaded.
const CONFIG_CANDIDATES = [
  'vitest.config.ts', 'vitest.config.mts', 'vitest.config.cts',
  'vitest.config.js', 'vitest.config.mjs', 'vitest.config.cjs',
  'vite.config.ts', 'vite.config.mts', 'vite.config.cts',
  'vite.config.js', 'vite.config.mjs', 'vite.config.cjs',
];

const ANSI = /\[[0-9;]*m/g;

/**
 * Does the config vitest would load actually parse?
 *
 * This is a real parse of the real bytes via esbuild — not an inference from an
 * exit code. A file that does not parse cannot parse on the next attempt either,
 * which is the one fact that makes a retry provably pointless.
 *
 * Returns `{ state: 'ok' | 'broken' | 'unchecked' }`. 'unchecked' is honest
 * ignorance (no config found, or esbuild not resolvable) and never claims 'ok'.
 */
export function checkConfigParses(dir = process.cwd()) {
  const file = CONFIG_CANDIDATES.find((name) => existsSync(join(dir, name)));
  if (!file) return { state: 'unchecked', reason: 'no vitest/vite config file found' };

  let transformSync;
  try {
    ({ transformSync } = createRequire(import.meta.url)('esbuild'));
  } catch {
    return { state: 'unchecked', reason: 'esbuild not resolvable from this script' };
  }

  try {
    transformSync(readFileSync(join(dir, file), 'utf8'), {
      loader: file.endsWith('ts') || file.endsWith('cts') || file.endsWith('mts') ? 'ts' : 'js',
    });
    return { state: 'ok', file };
  } catch (err) {
    const first = (err?.errors?.[0]) ?? null;
    const where = first?.location ? ` (${file}:${first.location.line}:${first.location.column})` : '';
    return { state: 'broken', file, message: `${first?.text ?? err?.message ?? 'parse failed'}${where}` };
  }
}

/**
 * Did vitest record any test results for this attempt?
 *
 * Read from vitest's own JSON report, which it writes only once the run reaches
 * the reporting stage. A run that dies before collecting anything leaves no file
 * at all, so "the suite ran" and "nothing ran" stop being a guess.
 */
export function readReport(path) {
  if (!path || !existsSync(path)) return { state: 'none' };
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'));
    const total = Number(r.numTotalTests ?? 0);
    if (!Number.isFinite(total) || total === 0) return { state: 'none' };
    return { state: 'ran', total, failed: Number(r.numFailedTests ?? 0) };
  } catch {
    return { state: 'unchecked', reason: 'report file present but unreadable' };
  }
}

/** First `n` non-blank lines of stderr, ANSI stripped, for quoting verbatim. */
export function stderrHead(stderr, n = 5) {
  return String(stderr ?? '')
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .slice(0, n);
}

/**
 * Turn one finished attempt into a report of WHAT WAS OBSERVED.
 *
 * Every bullet is a checked fact. Nothing here names a cause, ranks a
 * likelihood, or uses a hedging adverb — when the checks do not separate the
 * possibilities the report says so outright. `deterministic` is true only when a
 * check proves the next attempt must produce the same result.
 */
export function describeAttempt({ label, attempt, attempts, status, signal, spawnError, stderr, report, config }) {
  const lines = [];
  const observed = [];

  if (spawnError) observed.push(`could not start vitest: ${spawnError}`);
  else if (signal) observed.push(`process terminated by signal ${signal} (no exit code)`);
  else observed.push(`process exited ${status}, not terminated by a signal`);

  if (report?.state === 'ran') observed.push(`vitest recorded ${report.total} test result(s), ${report.failed} failed`);
  else if (report?.state === 'unchecked') observed.push(`test results not readable: ${report.reason}`);
  else observed.push('vitest recorded no test results');

  let deterministic = false;
  if (config?.state === 'broken') {
    observed.push(`${config.file} does not parse: ${config.message}`);
    deterministic = true;
  } else if (config?.state === 'ok') {
    observed.push(`${config.file} parses`);
  } else if (config?.state === 'unchecked') {
    observed.push(`config not checked: ${config.reason}`);
  }

  lines.push(`sub-shard ${label} attempt ${attempt}/${attempts} did not pass. Observed:`);
  for (const o of observed) lines.push(`  - ${o}`);

  const head = stderrHead(stderr);
  if (head.length) {
    lines.push(`  - stderr, first ${head.length} line(s):`);
    for (const l of head) lines.push(`      ${l}`);
  } else {
    lines.push('  - stderr: empty');
  }

  // The checks above either prove the outcome is fixed, or they do not separate a
  // harness death from a genuine failure. Say which — do not pick one.
  if (deterministic) lines.push('  - this outcome cannot change between attempts.');
  else lines.push('  - what produced this: unknown, on the checks above.');

  return { text: lines.join('\n'), deterministic };
}

export function main() {
  // STORYBOOK_SHARD = "i/N" from the CI matrix (1-based i, N total jobs). Absent =>
  // local full run (treated as shard 1/1, i.e. the whole suite, still sub-batched).
  let i = 1, N = 1;
  const shardEnv = process.env.STORYBOOK_SHARD;
  if (shardEnv) {
    const [a, b] = shardEnv.split('/').map(Number);
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b >= 1 && a <= b) { i = a; N = b; }
  }

  // Round the target up to a whole multiple of N so each CI shard owns an equal,
  // integer number of sub-shards.
  const M = Math.max(N, Math.ceil(SUBSHARD_TARGET / N) * N);
  const per = M / N;
  const start = (i - 1) * per + 1;
  const subshards = Array.from({ length: per }, (_, j) => start + j);

  console.log(`storybook tests — CI shard ${i}/${N}; sub-shards ${subshards.join(', ')} of ${M}, ${MAX_ATTEMPTS} attempts each\n`);

  const reportDir = mkdtempSync(join(tmpdir(), 'kai-storybook-report-'));
  const reportFile = join(reportDir, 'results.json');

  let failed = null;
  try {
    for (const k of subshards) {
      const arg = `${k}/${M}`;
      let passed = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`\n> sub-shard ${arg} — attempt ${attempt}/${MAX_ATTEMPTS}\n`);

        // Clear the previous attempt's report first, or a stale file would be read
        // as this attempt's result.
        rmSync(reportFile, { force: true });

        // stderr is piped so its head can be quoted in the report, then written
        // straight through so nothing is lost from the CI log.
        const res = spawnSync(
          'npx',
          ['vitest', 'run', '--project=storybook', `--shard=${arg}`,
            '--reporter=default', '--reporter=json', `--outputFile.json=${reportFile}`],
          { stdio: ['inherit', 'inherit', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32' },
        );
        if (res.stderr) process.stderr.write(res.stderr);

        const code = res.status ?? 1;
        if (code === 0 && !res.signal && !res.error) {
          if (attempt > 1) console.log(`\nsub-shard ${arg} passed on attempt ${attempt}\n`);
          passed = true;
          break;
        }

        const { text, deterministic } = describeAttempt({
          label: arg,
          attempt,
          attempts: MAX_ATTEMPTS,
          status: res.status,
          signal: res.signal,
          spawnError: res.error?.message,
          stderr: res.stderr,
          report: readReport(reportFile),
          config: checkConfigParses(),
        });
        console.warn(`\n${text}\n`);

        // Retry is the safety net for the harness crash described at the top, and
        // it stays on for every outcome the checks cannot pin down. It is skipped
        // only when a check PROVED the next attempt runs the same bytes to the
        // same end — today that is a config that does not parse. Retrying that
        // just spends CI time to reprint the same failure.
        if (deterministic) {
          console.warn(`sub-shard ${arg} — skipping the remaining ${MAX_ATTEMPTS - attempt} attempt(s) on the observation above.\n`);
          break;
        }
        if (attempt < MAX_ATTEMPTS) console.warn(`sub-shard ${arg} — retrying.\n`);
      }
      if (!passed) { failed = arg; break; }
    }
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\nsub-shard ${failed} did not pass — failing CI shard ${i}/${N}.\n`);
    process.exit(1);
  }
  console.log(`\nall ${per} sub-shard(s) passed for CI shard ${i}/${N}.\n`);
  process.exit(0);
}

// Only run when executed directly, so the helpers above can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
