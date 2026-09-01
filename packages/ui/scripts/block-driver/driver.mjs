#!/usr/bin/env node
// The block driver (V-1) — the composition spike's fine-drive.mjs generalized
// into a reusable harness. A SCENARIO module declares pages, sequential UI
// STATES, user-level actions, behavioral PROBES, computed-STYLE probes and
// hard EXPECTations as data; the driver runs it against one or two pages in
// Playwright/Chromium, light + dark, and emits a JSON verdict plus a
// stable-named screenshot per state.
//
// Modes (chosen by flags, not subcommands):
//   record   --record <file>      run + write the verdict JSON (the baseline)
//   check    --baseline <file>    run + deep-diff probe/style values against a
//                                 previously recorded baseline (Task 2.2's
//                                 before/after gate)
//   parity   --pages a,b          run BOTH pages and diff them state-for-state
//                                 (the spike's facade-vs-fine comparison)
// Any mode also enforces each state's `expect` map and the zero-console-error
// rule on every run. Exit 1 on any red; the verdict JSON always says why.
//
// Usage (from packages/ui):
//   node scripts/block-driver/driver.mjs <scenario.mjs> [flags]
//     --pages <k[,k]>     page keys from scenario.pages (default: all)
//     --schemes <l[,d]>   default: light,dark
//     --base <url>        page server origin (default http://localhost:8952)
//     --serve <dir>       spawn serve.mjs on --port with this root, /kit ->
//                         --kit (default ../../dist relative to this file)
//     --port <n>          with --serve (default 8952; NEVER 4400/4401/8931)
//     --kit <dir>         with --serve: what /kit/ serves (the built dist)
//     --shots <dir>       screenshot dir (default ./shots next to scenario)
//     --record <file>     write the verdict JSON here
//     --baseline <file>   diff this run against a recorded verdict
//     --out <file>        also write the (non-baseline) verdict here
//
// Interaction ethic (inherited from fine-drive.mjs): actions are user-level —
// Playwright's shadow-piercing locators click what a person would click. A
// scenario that needs a programmatic step (e.g. landing a reply while a dock
// is CLOSED, where no user path exists by construction) declares it on the
// page spec and says why in a comment there.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- CLI parsing
const argv = process.argv.slice(2);
const scenarioPath = argv.find((a) => !a.startsWith('--'));
if (!scenarioPath) {
  console.error('usage: node driver.mjs <scenario.mjs> [--pages k,k] [--schemes light,dark] [--base url] [--serve dir] [--port n] [--kit dir] [--shots dir] [--record f] [--baseline f] [--out f]');
  process.exit(2);
}
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const scenario = (await import(pathToFileURL(resolve(scenarioPath)).href)).default;
const pageKeys = (flag('pages') ?? Object.keys(scenario.pages).join(',')).split(',');
const schemes = (flag('schemes') ?? (scenario.schemes ?? ['light', 'dark']).join(',')).split(',');
const PORT = Number(flag('port') ?? 8952);
const BASE = flag('base') ?? `http://localhost:${PORT}`;
const SHOTS = resolve(flag('shots') ?? join(dirname(resolve(scenarioPath)), 'shots'));
mkdirSync(SHOTS, { recursive: true });

for (const k of pageKeys) {
  if (!scenario.pages[k]) {
    console.error(`unknown page key "${k}" — scenario declares: ${Object.keys(scenario.pages).join(', ')}`);
    process.exit(2);
  }
}

// ------------------------------------------------------- optional page server
let server;
if (flag('serve')) {
  server = spawn(process.execPath, [join(HERE, 'serve.mjs')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      ROOT: resolve(flag('serve')),
      KIT: resolve(flag('kit') ?? join(HERE, '..', '..', 'dist')),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => {
    server.stdout.on('data', (d) => { if (String(d).includes('listening')) res(); });
    server.on('exit', (code) => rej(new Error(`serve.mjs exited ${code} before listening`)));
    setTimeout(() => rej(new Error('serve.mjs never came up')), 5000);
  });
}

// ------------------------------------------------------------------ execution
const browser = await chromium.launch();

async function runStory(pageKey, colorScheme) {
  const spec = scenario.pages[pageKey];
  const ctx = await browser.newContext({
    colorScheme,
    viewport: scenario.viewport ?? { width: 1100, height: 760 },
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));

  const run = { page: pageKey, colorScheme, states: [], consoleErrors, failures: [] };
  const sctx = { pageKey, spec, colorScheme, scenario };

  await page.goto(`${BASE}${spec.path}`, { waitUntil: 'load' });
  if (scenario.ready) await scenario.ready(page, sctx);

  for (const state of scenario.states) {
    const rec = { name: state.name, probes: {}, styles: {} };
    try {
      if (state.act) await state.act(page, sctx);
      await page.screenshot({ path: join(SHOTS, `${pageKey}-${colorScheme}-${state.name}.png`) });
      for (const [key, probe] of Object.entries(state.probes ?? {})) {
        rec.probes[key] = await probe(page, sctx);
      }
      for (const sp of state.styleProbes ?? []) {
        const values = await sp.target(page, sctx).evaluate(
          (el, props) => Object.fromEntries(props.map((p) => [p, getComputedStyle(el)[p]])),
          sp.props,
        );
        rec.styles[sp.name] = values;
      }
      for (const [key, want] of Object.entries(state.expect ?? {})) {
        const got = rec.probes[key];
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          run.failures.push(`${pageKey}/${colorScheme}/${state.name}: probe "${key}" expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
        }
      }
    } catch (err) {
      rec.error = String(err).slice(0, 400);
      run.failures.push(`${pageKey}/${colorScheme}/${state.name}: state errored — ${rec.error}`);
      run.states.push(rec);
      break; // states are sequential; later states are meaningless now
    }
    run.states.push(rec);
  }

  const ignore = scenario.consoleIgnore ?? [];
  const realErrors = consoleErrors.filter((e) => !ignore.some((re) => re.test(e)));
  if (realErrors.length) run.failures.push(`${pageKey}/${colorScheme}: console not clean — ${realErrors.join(' | ')}`);

  await ctx.close();
  return run;
}

const verdict = { scenario: scenario.name, base: BASE, runs: [], failures: [] };
for (const pageKey of pageKeys) {
  for (const scheme of schemes) {
    const run = await runStory(pageKey, scheme);
    verdict.runs.push(run);
    verdict.failures.push(...run.failures);
  }
}
await browser.close();
server?.kill();

// -------------------------------------------------------------------- diffing
// Deep-diff two probe/style trees; returns human-readable mismatch lines.
function diffStates(labelA, statesA, labelB, statesB, prefix) {
  const out = [];
  const byName = new Map(statesB.map((s) => [s.name, s]));
  for (const a of statesA) {
    const b = byName.get(a.name);
    if (!b) { out.push(`${prefix}: state "${a.name}" present in ${labelA} but missing from ${labelB}`); continue; }
    for (const bucket of ['probes', 'styles']) {
      const keys = new Set([...Object.keys(a[bucket] ?? {}), ...Object.keys(b[bucket] ?? {})]);
      for (const k of keys) {
        const av = JSON.stringify(a[bucket]?.[k]);
        const bv = JSON.stringify(b[bucket]?.[k]);
        if (av !== bv) out.push(`${prefix}/${a.name}: ${bucket.slice(0, -1)} "${k}" — ${labelA}=${av} vs ${labelB}=${bv}`);
      }
    }
  }
  for (const b of statesB) if (!statesA.some((s) => s.name === b.name)) out.push(`${prefix}: state "${b.name}" present in ${labelB} but missing from ${labelA}`);
  return out;
}

// Parity mode: two pages requested -> compare them state-for-state per scheme.
if (pageKeys.length === 2) {
  const [a, b] = pageKeys;
  for (const scheme of schemes) {
    const ra = verdict.runs.find((r) => r.page === a && r.colorScheme === scheme);
    const rb = verdict.runs.find((r) => r.page === b && r.colorScheme === scheme);
    const skip = scenario.parityIgnore ?? [];
    const diffs = diffStates(a, ra.states, b, rb.states, `parity/${scheme}`)
      .filter((d) => !skip.some((re) => re.test(d)));
    verdict.failures.push(...diffs);
  }
}

// Check mode: diff this run against a recorded baseline verdict.
const baselinePath = flag('baseline');
if (baselinePath) {
  const baseline = JSON.parse(readFileSync(resolve(baselinePath), 'utf8'));
  for (const run of verdict.runs) {
    const ref = baseline.runs.find((r) => r.page === run.page && r.colorScheme === run.colorScheme);
    if (!ref) { verdict.failures.push(`baseline has no run for ${run.page}/${run.colorScheme}`); continue; }
    verdict.failures.push(...diffStates('baseline', ref.states, 'current', run.states, `baseline/${run.page}/${run.colorScheme}`));
  }
}

// --------------------------------------------------------------------- output
verdict.pass = verdict.failures.length === 0;
const json = JSON.stringify(verdict, null, 2) + '\n';
if (flag('record')) {
  mkdirSync(dirname(resolve(flag('record'))), { recursive: true });
  writeFileSync(resolve(flag('record')), json);
}
if (flag('out')) {
  mkdirSync(dirname(resolve(flag('out'))), { recursive: true });
  writeFileSync(resolve(flag('out')), json);
}
console.log(json);
console.error(verdict.pass ? `PASS — ${verdict.runs.length} runs, 0 failures` : `FAIL — ${verdict.failures.length} failure(s):\n${verdict.failures.map((f) => `  RED ${f}`).join('\n')}`);
process.exit(verdict.pass ? 0 : 1);
