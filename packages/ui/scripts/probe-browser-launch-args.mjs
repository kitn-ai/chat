#!/usr/bin/env node
/**
 * Does `vitest.config.ts`'s chromium hardening actually reach the browser?
 *
 * A green storybook run proves nothing here: the suite passes whether or not
 * `launchOptions` sits in a position the playwright provider reads. So this
 * probe ignores the config file and reads the one thing that cannot lie -- the
 * argv of the chromium process vitest actually launched.
 *
 * Two phases, because a naive "is the flag in argv?" check is itself a check
 * that proves nothing. Playwright's OWN chromium defaults already include
 * --disable-dev-shm-usage, --no-sandbox, --disable-renderer-backgrounding and
 * others from our list, so those flags are present whether or not our config
 * was honoured. Only flags playwright does not pass by itself can distinguish
 * the two states, and the probe works out which ones those are by measurement
 * rather than by assertion:
 *
 *   A. launch chromium through playwright with NO options and record its argv
 *      -> the empirical default set
 *   B. run a real `vitest run --project=storybook` and record the argv of the
 *      chromium IT launched
 *   verdict := over (our configured flags MINUS the defaults from A) only
 *
 * Exit 0 = every discriminating flag reached the process (config applied).
 * Exit 1 = at least one discriminating flag is missing (config NOT applied).
 * Exit 2 = a phase never produced a browser, so the probe measured nothing.
 *          Never read that as a pass.
 *
 * Usage: node scripts/probe-browser-launch-args.mjs [--story <path>] [--out <file>]
 */
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import process from 'node:process';

// The flags vitest.config.ts asks chromium for, restated literally on purpose.
// Deriving them from the config would make the probe agree with the config by
// construction, which is the exact failure mode under test.
const EXPECTED_FLAGS = [
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--js-flags=--max-old-space-size=2048',
];

const argv = process.argv.slice(2);
const readArg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const story = readArg('--story', 'src/elements/status.stories.tsx');
const outFile = readArg('--out', null);
const timeoutMs = Number(readArg('--timeout', '180000'));

function psTable() {
  try {
    return execFileSync('ps', ['-Ao', 'pid=,args=', '-ww'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

function argvOfPid(pid) {
  for (const line of psTable().split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m && m[1] === String(pid)) return m[2];
  }
  return null;
}

/** Playwright-launched chromium BROWSER processes, keyed by pid. */
function playwrightChromiums() {
  const found = new Map();
  for (const line of psTable().split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const [, pid, args] = m;
    // Playwright drives chromium out of its own browser cache and always hands
    // the browser process a throwaway profile. Renderer/GPU children carry
    // `--type=`; only the top-level process holds the launch args we want.
    if (!/ms-playwright/.test(args)) continue;
    if (!/--user-data-dir=/.test(args)) continue;
    if (/\s--type=/.test(args)) continue;
    found.set(pid, args);
  }
  return found;
}

const pretty = (args) => args.split(' --').join('\n  --');

// ---------------------------------------------------------------- phase A
async function captureDefaultArgs() {
  const { chromium } = await import('playwright');
  const server = await chromium.launchServer({ headless: true });
  const pid = server.process().pid;
  const args = argvOfPid(pid);
  await server.close();
  return args;
}

// ---------------------------------------------------------------- phase B
function captureVitestArgs() {
  return new Promise((resolve) => {
    const baseline = new Set(playwrightChromiums().keys());
    console.log(`[probe] ${baseline.size} playwright chromium(s) already running; those PIDs are ignored`);
    console.log(`[probe] starting: vitest run --project=storybook ${story}`);

    const child = spawn('npx', ['vitest', 'run', '--project=storybook', story], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '' },
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });

    let done = false;
    const started = Date.now();
    const settle = (args) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      resolve({ args, log });
    };

    const poll = setInterval(() => {
      for (const [pid, args] of playwrightChromiums()) {
        if (!baseline.has(pid)) return settle(args);
      }
      if (Date.now() - started > timeoutMs) settle(null);
    }, 150);

    // The run can exit between poll ticks; give the loop one last look.
    child.on('exit', () => setTimeout(() => settle(null), 300));
  });
}

// ---------------------------------------------------------------- verdict
const defaultArgs = await captureDefaultArgs();
if (!defaultArgs) {
  console.error('[probe] INCONCLUSIVE - could not read argv of a plain playwright chromium.');
  process.exit(2);
}
console.log('[probe] phase A - playwright chromium with NO launch options:\n' + pretty(defaultArgs) + '\n');

const discriminating = EXPECTED_FLAGS.filter((f) => !defaultArgs.includes(f));
const undetectable = EXPECTED_FLAGS.filter((f) => defaultArgs.includes(f));

console.log('[probe] flags playwright already passes by itself (CANNOT distinguish applied from not):');
for (const f of undetectable) console.log(`  default  ${f}`);
console.log('[probe] flags that only appear if our config was honoured (the real check):');
for (const f of discriminating) console.log(`  probe    ${f}`);
console.log('');

if (discriminating.length === 0) {
  console.error('[probe] INCONCLUSIVE - every configured flag is also a playwright default.');
  console.error('[probe] There is nothing to measure. Do not read this as a pass.');
  process.exit(2);
}

const { args: vitestArgs, log } = await captureVitestArgs();
if (!vitestArgs) {
  console.error('\n[probe] INCONCLUSIVE - never observed a chromium launched by vitest.');
  console.error('[probe] The probe measured NOTHING. Do not read this as a pass.');
  console.error('[probe] last 40 lines of the vitest run:\n' + log.split('\n').slice(-40).join('\n'));
  process.exit(2);
}

console.log('\n[probe] phase B - chromium launched by vitest:\n' + pretty(vitestArgs) + '\n');

const present = discriminating.filter((f) => vitestArgs.includes(f));
const missing = discriminating.filter((f) => !vitestArgs.includes(f));
for (const f of present) console.log(`  APPLIED  ${f}`);
for (const f of missing) console.log(`  MISSING  ${f}`);

// Playwright appends our args after its own, and chromium keeps the LAST of a
// duplicated switch (see scripts/probe-duplicate-switch.mjs). So adding any
// switch playwright already sets silently REPLACES its value rather than
// extending it -- `--disable-features` being the one that actually matters,
// since playwright uses it for 16 test-determinism features.
const dupes = [];
for (const switchName of ['--disable-features', '--enable-features', '--js-flags', '--user-agent']) {
  const n = (vitestArgs.match(new RegExp(`${switchName}=`, 'g')) || []).length;
  if (n > 1) dupes.push(`${switchName} appears ${n}x - the last one silently wins`);
}
for (const d of dupes) console.log(`  CLOBBER  ${d}`);

const verdict = missing.length === 0 && dupes.length === 0 ? 'APPLIED' : 'NOT APPLIED';
console.log(`\n[probe] VERDICT: ${present.length}/${discriminating.length} discriminating flags on the process -> ${verdict}`);

if (outFile) {
  writeFileSync(outFile, JSON.stringify({ defaultArgs, vitestArgs, undetectable, discriminating, present, missing, dupes, verdict }, null, 2));
  console.log(`[probe] wrote ${outFile}`);
}
process.exit(verdict === 'APPLIED' ? 0 : 1);
