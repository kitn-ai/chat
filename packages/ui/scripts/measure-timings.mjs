#!/usr/bin/env node
/**
 * measure-timings.mjs — re-measure this repo's test timings, with the conditions
 * they were taken under CAPTURED rather than asserted.
 *
 * WHY THIS EXISTS. Three timing figures in this repo were measured between
 * Aug 11 22:10 and Aug 12 10:05 local on a box where four orphaned
 * `while :; do :; done` shells pinned four of ten cores continuously. Nobody
 * knew. The figures were labelled "idle". They were corrected to say
 * INVALIDATED rather than being re-numbered, because a confidently-recorded
 * second wrong number is worse than one flagged as wrong. This script is how
 * they get re-numbered honestly.
 *
 * The failure was not imprecision. It was that the stated CONDITIONS were false
 * and unrecorded, so nothing in the artifact could contradict them. Hence the
 * single rule this script is built around: every figure it emits carries the
 * machine conditions measured around it, in the output, as data. If you read a
 * number out of this script's JSON you can also read what the box was doing.
 *
 * WHAT IT DOES
 *
 *   - Brackets every run with load average, core count and the top CPU
 *     consumers, BEFORE and AFTER, into the output.
 *   - Samples FOREIGN CPU (see below) throughout each run and discards runs
 *     that were disturbed, saying which and why.
 *   - Runs >= 3 iterations and reports min / median / max. One run's noise is
 *     otherwise indistinguishable from signal: you cannot tell a stable 32.6s
 *     from one that ranges 24-33.
 *   - Supports an idle condition and a synthetic-load condition, with the
 *     generator's process count stated in the output next to the figures.
 *   - Cleans up its own load generators on every exit path, and VERIFIES they
 *     are gone -- by re-scanning `ps` for the burner's shape -- before exiting.
 *     See `liveBurnerPids` for why "by name" is not good enough.
 *
 * FOREIGN CPU, AND WHY THE DISCARD RULE IS NOT LOAD AVERAGE. The obvious
 * bracket -- load average before vs after -- cannot work as a discard signal,
 * because a 400-second test run raises the load average by running. Load
 * average is a lagged average that does not distinguish our work from anyone
 * else's, so "it went up" is the expected result of a successful measurement,
 * not evidence of disturbance. Instead this samples `ps` every couple of
 * seconds, walks the ppid chain to identify every process in OUR OWN subtree,
 * and sums %CPU over everything else. That quantity -- foreign CPU -- is what
 * the orphaned burners would have shown as a constant offset, and it is what
 * another agent starting a build mid-run shows as a spike. The load-average
 * bracket is still recorded, because it is the number a human checks with
 * `uptime`; it is just not the thing that decides validity.
 *
 * A run is DISCARDED when either:
 *   (A) intra-run spike:  p90(foreign) - p50(foreign) > --spike-threshold
 *   (B) inter-run drift:  |median(foreign) - cohort median| > --drift-threshold
 * Both thresholds are in %CPU points, where 100 == one fully busy core.
 *
 * THIS MACHINE IS NOT IDLE, AND THE SCRIPT DOES NOT PRETEND OTHERWISE. The
 * `idle` condition means only "no synthetic load added by this script". It does
 * NOT assert a quiet box. Check `conditions.before.loadavg` and `topCpu` in the
 * output and judge for yourself -- that is the entire point. Re-run this on a
 * genuinely quiet machine, with no agent session attached, to get figures that
 * deserve the word idle.
 *
 * CAPS. Pass `--test-timeout` explicitly when measuring. A per-test timeout is
 * a CEILING on the measurement: under it, "just barely over" and "three times
 * over" both report the cap value, and the reported number is always the
 * reassuring one. Two starved runs in this repo's history both reported
 * `30004ms` against a 30s cap when the real cost was 32.6s. Raise it well past
 * anything you expect, and then prove the raise took effect -- `--prove-cap`
 * sets an absurd 1ms cap and asserts the run truncates, which is watch-it-fail
 * applied to the instrument.
 *
 * USAGE
 *
 *   node scripts/measure-timings.mjs --target=emitted --iterations=3 \
 *        --test-timeout=600000 --out=results.json
 *
 *   node scripts/measure-timings.mjs --target=emitted --condition=load \
 *        --load-procs=8 --iterations=3 --test-timeout=600000
 *
 *   node scripts/measure-timings.mjs --target=unit --workers=4 --iterations=3
 *
 *   node scripts/measure-timings.mjs --target=emitted --prove-cap
 *
 * FLAGS
 *   --target=emitted|unit   vitest project to time                  (required)
 *   --condition=idle|load   add synthetic CPU load, or not     (default: idle)
 *   --load-procs=N          burner count for --condition=load  (default: cores)
 *   --iterations=N          runs per invocation                   (default: 3)
 *   --workers=N             pass --maxWorkers=N to vitest       (default: off)
 *   --test-timeout=MS       pass --testTimeout to vitest        (default: off)
 *   --label=STR             free-form label recorded in the output
 *   --out=PATH              write the full JSON result here
 *   --spike-threshold=N     rule (A), %CPU points             (default: 150)
 *   --drift-threshold=N     rule (B), %CPU points             (default: 100)
 *   --sample-interval=MS    foreign-CPU sample period        (default: 2000)
 *   --prove-cap             1ms-cap truncation check, then exit
 *
 * EXIT CODES: 0 measured (or cap proof passed), 1 a usage/graph error,
 * 2 too few runs survived the discard rules to report min/median/max.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `packages/ui` — resolved from this file, so the script works from any cwd. */
const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Marker embedded in every synthetic load generator's argv.
 *
 * This is load-bearing for cleanup, not decoration. Killing by captured PID is
 * the primary path, but a PID list only covers processes this script knows it
 * started; a unique, greppable marker lets the final sweep find a burner that
 * escaped by any route -- which is exactly what went undetected for twelve
 * hours when a `LOADPIDS=$(jobs -p)` in a subshell made the cleanup a no-op.
 */
const LOAD_MARKER = 'kitn-measure-timings-cpu-burner';

// ---------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    target: null,
    condition: 'idle',
    loadProcs: null,
    iterations: 3,
    workers: null,
    testTimeout: null,
    label: null,
    out: null,
    spikeThreshold: 150,
    driftThreshold: 100,
    sampleInterval: 2000,
    proveCap: false,
  };
  for (const arg of argv) {
    const [rawKey, ...rest] = arg.split('=');
    const value = rest.join('=');
    switch (rawKey) {
      case '--target': out.target = value; break;
      case '--condition': out.condition = value; break;
      case '--load-procs': out.loadProcs = Number(value); break;
      case '--iterations': out.iterations = Number(value); break;
      case '--workers': out.workers = Number(value); break;
      case '--test-timeout': out.testTimeout = Number(value); break;
      case '--label': out.label = value; break;
      case '--out': out.out = value; break;
      case '--spike-threshold': out.spikeThreshold = Number(value); break;
      case '--drift-threshold': out.driftThreshold = Number(value); break;
      case '--sample-interval': out.sampleInterval = Number(value); break;
      case '--prove-cap': out.proveCap = true; break;
      default:
        console.error(`unknown flag: ${rawKey}`);
        process.exit(1);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// conditions capture
// ---------------------------------------------------------------------------

/** One `ps` snapshot: pid -> {ppid, pcpu, comm}. */
function psSnapshot() {
  const res = spawnSync('ps', ['-Ao', 'pid=,ppid=,pcpu=,comm='], { encoding: 'utf8' });
  if (res.status !== 0) return [];
  return res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/);
      if (!m) return null;
      return { pid: Number(m[1]), ppid: Number(m[2]), pcpu: Number(m[3]), comm: m[4] };
    })
    .filter(Boolean);
}

/**
 * Machine conditions at this instant. Recorded verbatim into the output either
 * side of every run — this is the part the invalidated figures were missing.
 */
function captureConditions() {
  const procs = psSnapshot();
  const topCpu = [...procs]
    .sort((a, b) => b.pcpu - a.pcpu)
    .slice(0, 10)
    .map((p) => ({ pid: p.pid, pcpu: p.pcpu, comm: p.comm.split('/').pop() }));
  return {
    at: new Date().toISOString(),
    loadavg: os.loadavg().map((n) => Number(n.toFixed(2))),
    cores: os.cpus().length,
    freeMemMb: Math.round(os.freemem() / 1024 / 1024),
    topCpu,
    /** Sum of %CPU across everything, 100 == one busy core. */
    totalPcpu: Number(procs.reduce((a, p) => a + p.pcpu, 0).toFixed(1)),
    /** Burners this script owns that are currently alive — should be 0 when idle. */
    liveBurners: countLiveBurners(),
  };
}

/**
 * Sum of %CPU over every process NOT inside `rootPid`'s subtree (and not this
 * script). See the header: this, not load average, is what can tell our own
 * work apart from someone else's.
 */
function foreignPcpu(procs, rootPid) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const inOurTree = (pid) => {
    let cur = pid;
    for (let hops = 0; hops < 64; hops += 1) {
      if (cur === rootPid || cur === process.pid) return true;
      const parent = byPid.get(cur)?.ppid;
      if (parent === undefined || parent === 0 || parent === cur) return false;
      cur = parent;
    }
    return false;
  };
  let total = 0;
  for (const p of procs) if (!inOurTree(p.pid)) total += p.pcpu;
  return Number(total.toFixed(1));
}

// ---------------------------------------------------------------------------
// synthetic load — spawn, and above all, reliable teardown
// ---------------------------------------------------------------------------

/**
 * PIDs of every burner spawned by this process, captured AT SPAWN from
 * `child.pid` directly.
 *
 * Not derived later from a shell job list. The original incident was
 * `LOADPIDS=$(jobs -p)` evaluated inside a subshell, where `jobs` reported
 * nothing, so the cleanup `kill` silently killed nothing and four spinners
 * outlived the script by twelve hours — long enough to contaminate every
 * timing measured afterwards.
 */
const burnerPids = [];
let cleanupDone = false;

function spawnLoad(count) {
  for (let i = 0; i < count; i += 1) {
    // The marker rides in argv so the post-hoc `pgrep -f` sweep can find it.
    const child = spawn(
      process.execPath,
      ['-e', `/* ${LOAD_MARKER} */ const t=Date.now(); while(true){ if(Date.now()-t<0) break; }`],
      { stdio: 'ignore', detached: false },
    );
    burnerPids.push(child.pid); // captured at spawn, not reconstructed later
  }
  return [...burnerPids];
}

/**
 * PIDs of genuine live burners, found by SHAPE rather than by substring.
 *
 * A plain `pgrep -f LOAD_MARKER` is wrong in both directions and cost this
 * script a restart mid-measurement. Any shell whose own command line merely
 * MENTIONS the marker matches it -- a wrapper running
 * `echo $(pgrep -f kitn-measure-timings-cpu-burner)` is itself a hit. That is a
 * false positive that (a) reports phantom survivors and (b), far worse, made
 * the follow-up `pkill -9 -f LOAD_MARKER` target the supervising shell. The
 * fix is to require the actual burner shape -- the node binary, `-e`, and the
 * marker -- and to drop this process and every ancestor of it, since those are
 * exactly the processes that can be quoting the marker without being one.
 *
 * Same lesson as the incident that prompted this script: a cleanup check that
 * cannot tell what it is matching is not a check.
 */
function liveBurnerPids() {
  const res = spawnSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8' });
  if (res.status !== 0) return [];

  const rows = res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      return m ? { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] } : null;
    })
    .filter(Boolean);

  // Our own ancestor chain: a supervising shell may quote the marker verbatim.
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const selfChain = new Set([process.pid]);
  let cur = process.pid;
  for (let hops = 0; hops < 64; hops += 1) {
    const parent = byPid.get(cur)?.ppid;
    if (parent === undefined || parent === 0 || parent === cur) break;
    selfChain.add(parent);
    cur = parent;
  }

  // The burner's shape, not merely its name: `node ... -e ... <marker>`.
  const looksLikeBurner = (cmd) => /\bnode\b/.test(cmd) && /\s-e\s/.test(cmd) && cmd.includes(LOAD_MARKER);

  return rows.filter((r) => !selfChain.has(r.pid) && looksLikeBurner(r.command)).map((r) => r.pid);
}

/** How many genuine burners are alive right now. */
function countLiveBurners() {
  return liveBurnerPids().length;
}

/**
 * Kill every burner and PROVE it. Idempotent, and safe to call from a signal
 * handler.
 *
 * Verification is by marker sweep, not by "we sent the kill". A kill that
 * silently matched nothing is precisely the bug this whole task exists to
 * correct, so the exit path asserts absence rather than assuming it.
 */
function cleanupLoad({ verbose = true } = {}) {
  if (cleanupDone) return { killed: 0, survivors: 0, verified: true };
  cleanupDone = true;

  let killed = 0;
  for (const pid of burnerPids) {
    try { process.kill(pid, 'SIGKILL'); killed += 1; } catch { /* already gone */ }
  }

  // Re-sweep by shape, with retries: the PID list only covers what we tracked,
  // so a burner that escaped by any other route still gets caught here.
  //
  // Kill the SPECIFIC pids the sweep returned rather than `pkill -f <marker>`.
  // Pattern-killing is what made this dangerous: the pattern matched the
  // supervising shell too, so the "cleanup" would have killed the measurement
  // run itself. Killing resolved pids can only ever hit a process the sweep
  // positively identified as a burner.
  let survivors = liveBurnerPids();
  for (let attempt = 0; attempt < 10 && survivors.length > 0; attempt += 1) {
    for (const pid of survivors) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* raced us to it */ }
    }
    spawnSync('sleep', ['0.2']);
    survivors = liveBurnerPids();
  }

  const verified = survivors.length === 0;
  if (verbose) {
    console.error(
      verified
        ? `[cleanup] ${burnerPids.length} burner(s) spawned, ${killed} signalled, 0 alive — VERIFIED by re-scanning \`ps\` for the burner's shape`
        : `[cleanup] FAILED — ${survivors.length} burner(s) still alive (pids ${survivors.join(',')}). Kill them: kill -9 ${survivors.join(' ')}`,
    );
  }
  return { killed, survivors: survivors.length, verified };
}

// Every exit path. `exit` covers normal and thrown-error termination; the
// signals cover Ctrl-C and `kill`, which do NOT fire `exit` on their own.
process.on('exit', () => cleanupLoad({ verbose: false }));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) {
  process.on(sig, () => { cleanupLoad(); process.exit(130); });
}
process.on('uncaughtException', (err) => { console.error(err); cleanupLoad(); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error(err); cleanupLoad(); process.exit(1); });

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const summarize = (xs) =>
  xs.length
    ? {
        n: xs.length,
        min: Math.round(Math.min(...xs)),
        median: Math.round(median(xs)),
        max: Math.round(Math.max(...xs)),
      }
    : null;

// ---------------------------------------------------------------------------
// one vitest run
// ---------------------------------------------------------------------------

function runOnce({ target, workers, testTimeout, sampleInterval }) {
  const jsonDir = mkdtempSync(path.join(tmpdir(), 'measure-timings-'));
  const jsonPath = path.join(jsonDir, 'vitest.json');

  const args = ['exec', 'vitest', 'run', `--project=${target}`, '--reporter=json', `--outputFile=${jsonPath}`];
  if (workers != null) args.push(`--maxWorkers=${workers}`);
  if (testTimeout != null) args.push(`--testTimeout=${testTimeout}`);

  const before = captureConditions();
  const startedAt = Date.now();

  const child = spawn('pnpm', args, { cwd: PKG_DIR, stdio: ['ignore', 'pipe', 'pipe'] });

  const foreignSamples = [];
  const sampler = setInterval(() => {
    foreignSamples.push(foreignPcpu(psSnapshot(), child.pid));
  }, sampleInterval);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });

  return new Promise((resolve) => {
    child.on('close', (code) => {
      clearInterval(sampler);
      const wallMs = Date.now() - startedAt;
      const after = captureConditions();

      let report = null;
      try { report = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch { /* no report */ }
      rmSync(jsonDir, { recursive: true, force: true });

      /** Per-test durations, which is the quantity a `testTimeout` budget governs. */
      const tests = [];
      for (const file of report?.testResults ?? []) {
        for (const a of file.assertionResults ?? []) {
          if (typeof a.duration === 'number') {
            tests.push({ file: path.basename(file.name ?? ''), title: a.title, durationMs: a.duration, status: a.status });
          }
        }
      }

      resolve({
        wallMs,
        exitCode: code,
        conditions: { before, after },
        foreign: {
          samples: foreignSamples,
          p50: median(foreignSamples),
          p90: quantile(foreignSamples, 0.9),
          max: foreignSamples.length ? Math.max(...foreignSamples) : null,
        },
        tests,
        slowestTestMs: tests.length ? Math.max(...tests.map((t) => t.durationMs)) : null,
        numTotal: report?.numTotalTests ?? null,
        numFailed: report?.numFailedTests ?? null,
        tail: (stderr + stdout).split('\n').slice(-12).join('\n'),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// cap-removal proof
// ---------------------------------------------------------------------------

/**
 * Watch-it-fail, applied to the instrument.
 *
 * Lifting a cap and then seeing every run land under it is a green that is
 * equally consistent with the cap never having been lifted. So force the
 * opposite: set an absurd 1ms timeout and confirm the run actually fails on
 * it. If this passes, `--test-timeout` demonstrably reaches vitest, and a
 * subsequent high value is doing what it claims.
 */
async function proveCap(target) {
  console.error(`[prove-cap] running --project=${target} with --testTimeout=1; expecting timeout failures`);
  const run = await runOnce({ target, workers: null, testTimeout: 1, sampleInterval: 5000 });
  const timedOut = run.numFailed != null && run.numFailed > 0;
  const evidence = {
    check: 'absurdly-low-cap-truncates',
    testTimeoutMs: 1,
    exitCode: run.exitCode,
    numTotal: run.numTotal,
    numFailed: run.numFailed,
    slowestTestMs: run.slowestTestMs,
    tail: run.tail,
  };
  console.log(JSON.stringify(evidence, null, 2));
  if (timedOut) {
    console.error('[prove-cap] PASS — the flag reaches vitest and truncates the run, so it is not inert.');
    return 0;
  }
  console.error('[prove-cap] FAIL — a 1ms cap did NOT fail the run. --test-timeout is not reaching vitest; every timing below it is unproven.');
  return 1;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.target || !['emitted', 'unit'].includes(opts.target)) {
    console.error('--target=emitted|unit is required');
    process.exit(1);
  }
  if (opts.proveCap) process.exit(await proveCap(opts.target));

  if (opts.iterations < 3) {
    console.error('--iterations must be >= 3: min/median/max off fewer runs reports noise as signal');
    process.exit(1);
  }

  const cores = os.cpus().length;
  const loadProcs = opts.condition === 'load' ? (opts.loadProcs ?? cores) : 0;

  if (opts.condition === 'load') {
    spawnLoad(loadProcs);
    console.error(`[load] spawned ${loadProcs} CPU burner(s) on ${cores} cores, pids: ${burnerPids.join(',')}`);
    spawnSync('sleep', ['5']); // let the load average catch up before sampling
  }

  const runs = [];
  for (let i = 0; i < opts.iterations; i += 1) {
    console.error(`[run ${i + 1}/${opts.iterations}] target=${opts.target} condition=${opts.condition} workers=${opts.workers ?? 'default'}`);
    const run = await runOnce(opts);
    console.error(`[run ${i + 1}] wall=${(run.wallMs / 1000).toFixed(1)}s slowestTest=${run.slowestTestMs}ms failed=${run.numFailed} foreignP50=${run.foreign.p50}`);
    runs.push({ index: i + 1, ...run });
  }

  // --- discard rules -------------------------------------------------------
  const cohortMedian = median(runs.map((r) => r.foreign.p50 ?? 0));
  for (const r of runs) {
    const reasons = [];
    const spike = (r.foreign.p90 ?? 0) - (r.foreign.p50 ?? 0);
    if (spike > opts.spikeThreshold) {
      reasons.push(`intra-run spike: p90-p50 = ${spike.toFixed(1)} %CPU > ${opts.spikeThreshold}`);
    }
    const drift = Math.abs((r.foreign.p50 ?? 0) - cohortMedian);
    if (drift > opts.driftThreshold) {
      reasons.push(`inter-run drift: |p50 ${r.foreign.p50} - cohort ${cohortMedian}| = ${drift.toFixed(1)} %CPU > ${opts.driftThreshold}`);
    }
    r.discarded = reasons.length > 0;
    r.discardReasons = reasons;
    if (r.discarded) console.error(`[run ${r.index}] DISCARDED — ${reasons.join('; ')}`);
  }

  const kept = runs.filter((r) => !r.discarded);
  const cleanup = cleanupLoad();

  const result = {
    schema: 'kitn-measure-timings/1',
    label: opts.label,
    target: opts.target,
    condition: opts.condition,
    /** Stated next to the figures, per the brief — 0 means none added by us. */
    loadGeneratorProcs: loadProcs,
    cores,
    workers: opts.workers ?? 'vitest default',
    testTimeoutMs: opts.testTimeout ?? 'vitest default',
    iterations: opts.iterations,
    discardRules: {
      intraRunSpikePcpu: opts.spikeThreshold,
      interRunDriftPcpu: opts.driftThreshold,
      note: 'Thresholds are %CPU points over processes outside our own subtree; 100 == one busy core. Load average is captured but deliberately NOT used to discard: a long run raises it by running.',
    },
    idleCaveat:
      'condition=idle means only that THIS SCRIPT added no load. It does not assert a quiet machine. Read conditions.before.loadavg and topCpu on each run and judge.',
    discarded: runs.filter((r) => r.discarded).map((r) => ({ index: r.index, reasons: r.discardReasons })),
    kept: kept.length,
    /** THE FIGURES. */
    wallMs: summarize(kept.map((r) => r.wallMs)),
    slowestTestMs: summarize(kept.map((r) => r.slowestTestMs).filter((n) => n != null)),
    perTestMs: (() => {
      const byTitle = new Map();
      for (const r of kept) {
        for (const t of r.tests) {
          const key = `${t.file} :: ${t.title}`;
          if (!byTitle.has(key)) byTitle.set(key, []);
          byTitle.get(key).push(t.durationMs);
        }
      }
      return Object.fromEntries([...byTitle].map(([k, v]) => [k, summarize(v)]));
    })(),
    failures: kept.map((r) => r.numFailed),
    cleanup: {
      burnersSpawned: burnerPids.length,
      burnerPids,
      survivors: cleanup.survivors,
      verified: cleanup.verified,
      method: `re-scanned \`ps\` for processes matching the burner's shape (node + -e + ${LOAD_MARKER}), excluding this process and its ancestors, after SIGKILL`,
    },
    runs: runs.map((r) => ({
      index: r.index,
      wallMs: r.wallMs,
      exitCode: r.exitCode,
      slowestTestMs: r.slowestTestMs,
      numTotal: r.numTotal,
      numFailed: r.numFailed,
      discarded: r.discarded,
      discardReasons: r.discardReasons,
      foreign: r.foreign,
      conditions: r.conditions,
    })),
  };

  const json = JSON.stringify(result, null, 2);
  if (opts.out) { writeFileSync(opts.out, json); console.error(`[out] ${opts.out}`); }
  console.log(json);

  if (kept.length < 3) {
    console.error(`[fatal] only ${kept.length} run(s) survived the discard rules; min/median/max off fewer than 3 is noise. Re-run with more --iterations or a quieter box.`);
    process.exit(2);
  }
  process.exit(0);
}

main();
