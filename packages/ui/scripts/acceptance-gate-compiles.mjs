// THE `compiles` GATE — the first of the deck's three external gates to exist.
//
//   node scripts/acceptance-gate-compiles.mjs --run <runDir> --framework <fw>
//   node scripts/acceptance-gate-compiles.mjs --self-test
//
// The rubric's 10-anchor is the spec, word for word: "tsc --strict is clean
// under the consumer project for the framework asked for, resolving
// @kitn.ai/ui through the shipped exports map". So this does not stand up its
// own tsconfig — it imports the SAME projects `verify:scaffold` compiles the
// scaffolder's output under (scripts/lib/consumer-tsc-projects.mjs), because a
// second copy of them would make the anchor a claim about the copy.
//
// It writes `compiles` into the run's `gates.json` and touches no other key.
//
// TWO OUTCOMES, AND NO THIRD
// --------------------------
//   code, and it compiles      -> { passed: true }
//   code, and it does not      -> { passed: false } + the diagnostics
//   NO CODE IN THE OUTPUT      -> { passed: false }, with the reason spelled out
//
// A third outcome was tried and removed. It let an empty output leave the score
// as "not applicable", adjudicated by acceptance-eval's own `codeUnits` scan.
// That scan cannot carry the verdict: it recognises code files and LABELLED
// fences, so an unlabelled fence — how models most often emit code — reads as
// prose, and "no code my scanner recognises" became "no code". Measured: an S1
// run with ZERO output files scored 8.93/10 and exit 0, and a mixed answer that
// fabricated `<kai-datagrid>` and did not typecheck scored every mechanical gate
// 10/10.
//
// The prose-by-design case it was written for (S6's refusal, S7's diagnosis)
// never reached this gate anyway: `compiles` is `alwaysApplies: false` and no
// external mechanical dimension appears on those scenarios at all. Where this
// gate DOES apply, the scenario asked for code, and an answer with none did not
// do the thing. An external gate may still not report `vacuous: true` —
// `scoreRun` refuses it — and a missing gate result is an error, not a skip.
//
// WHAT COUNTS AS A SUBJECT
// ------------------------
// `codeUnits()` from scripts/lib/output-scan.mjs — the same units the evaluator's
// own two gates scan, so this gate and the evaluator cannot disagree about
// whether the output contains code. That includes fenced blocks inside markdown,
// because several scenarios are answered as prose with the code in a fence.
//
// Of those units, tsc can check the TypeScript ones and the `<script>` block of a
// .vue/.svelte/.html unit (lifted the same way `verify:scaffold` lifts them).
// The rest are reported, never silently dropped:
//   · JavaScript — a stock consumer tsconfig has no `allowJs`, so tsc would
//     ignore a .js file and the silence would read as a pass.
//   · Python, and a template-only component with no <script> at all.
// If code is present and NONE of it is checkable, that is `passed: false` with
// the reason spelled out — not a pass, and not an absence.
//
// KNOWN RESIDUAL, stated because it will produce a red that is not the agent's
// fault: a fenced block is compiled as a standalone module. An answer whose
// fences are illustrative FRAGMENTS ("chat.messages = …") will fail on TS2304
// for names its surrounding prose declared. That is visible in the diagnostics
// this gate records, and a judge who sees it should attribute it `pack-defect`
// rather than to the agent. The alternative — ignoring fences — would un-measure
// every prose-shaped answer, which is the larger and quieter error.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importCatalog } from './lib/import-catalog.mjs';
import { codeUnits, unreadFiles } from './lib/output-scan.mjs';
import { planFiles } from './lib/compile-plan.mjs';
import { rubricFor } from './lib/rubric.mjs';
import { EXT, FRAMEWORK_PROJECT, createConsumerTsc } from './lib/consumer-tsc-projects.mjs';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

function fail(msg) {
  console.error(`✗ acceptance-gate-compiles: ${msg}`);
  process.exit(1);
}

const GATE_ID = 'compiles';
/** The frameworks a run may name — derived from the project map, never listed here. */
const FRAMEWORKS = Object.keys(FRAMEWORK_PROJECT);

// ---------------------------------------------------------------------------
// Reading the output
// ---------------------------------------------------------------------------

function readOutputFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d, prefix) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(d, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, rel);
      else out.push({ name: rel, text: readFileSync(full, 'utf8') });
    }
  };
  walk(dir, '');
  return out;
}


// ---------------------------------------------------------------------------
// Compiling
// ---------------------------------------------------------------------------

/**
 * Compile one set of planned files in a sandbox of the given project.
 *
 * THE SANDBOX SELF-TEST IS NOT OPTIONAL. The front-end projects include
 * `*.ts`/`*.tsx` non-recursively, so files written into a subdirectory of one
 * would compile ZERO files and the silence would read as a clean pass. The
 * sandbox writes its own tsconfig from the project's own options object, and
 * then proves it: the two anti-theatre probes must still error inside it, or
 * this returns no verdict at all.
 */
function compileIn(harness, project, label, files) {
  const box = harness.sandbox(project, label);
  const control = box.selfTest();
  if (control.missed.length) {
    return {
      ok: false,
      harnessBroken: `the sandbox for project "${project}" did not fail its own controls (${control.missed
        .map((p) => p.file)
        .join(', ')}). ${control.missed.map((p) => p.why).join('; ')}. tsc said:\n${control.out || '(nothing)'}`,
    };
  }
  for (const f of files) {
    const dest = join(box.dir, f.name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.text);
  }
  const out = box.run();
  box.clear();
  // tsc reports paths relative to the process cwd, which puts a dozen `../`
  // segments in front of every diagnostic. The operator needs the name the
  // AGENT gave the file, so the sandbox prefix comes off both spellings.
  const prefixes = [`${relative(process.cwd(), box.dir)}/`, `${box.dir}/`];
  const diagnostics = prefixes.reduce((text, p) => text.split(p).join(''), out).trim();
  return { ok: true, diagnostics, dir: box.dir };
}

/** Error lines only — tsc prints a summary tail this does not need to quote. */
const errorLines = (diagnostics) => diagnostics.split('\n').filter((l) => /error TS\d+/.test(l));

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * @param {{ runDir: string, framework: string, keep?: boolean, harness?: object }} input
 *   `harness` is passed by the self-test so six fixtures share one temp tree;
 *   a real run makes its own and tears it down.
 */
function runGate({ runDir, framework, keep = false, harness: shared }) {
  const files = readOutputFiles(join(runDir, 'output'));
  const units = codeUnits(files);
  const unread = unreadFiles(files);

  // NO CODE TO COMPILE IS A FAILURE, not an absence. `compiles` only applies to
  // scenarios that asked for code, so an answer with none did not do the thing.
  // "Found no code" may not be upgraded to "there IS no code" either: the scan
  // reads only recognised code files and LABELLED fences, so an unlabelled fence
  // — how models most often emit code — looks exactly like prose to it.
  if (units.length === 0) {
    return {
      result: {
        passed: false,
        detail: unread.length
          ? `no code unit could be read, and ${unread.length} output file(s) went unread (${unread.join(', ')}). "Found nothing" is not "there is nothing" while something was not looked at, so this is a failure to determine rather than an absence.`
          : `no code unit could be read across ${files.length} output file(s), so nothing was compiled. Either the answer contains no code — a failure on a scenario that asked for some — or it emitted code this scan cannot recognise (an unlabelled fence reads as prose). Neither is a pass.`,
        filesSeen: files.length,
        filesScanned: 0,
        unread,
      },
    };
  }

  const { files: planned, skipped } = planFiles(units);
  const skipNote = skipped.length ? ` ${skipped.length} unit(s) tsc cannot check: ${skipped.map((s) => `${s.unit} (${s.why})`).join('; ')}.` : '';

  if (!planned.length) {
    return {
      result: {
        passed: false,
        detail: `the output contains ${units.length} code unit(s) and none of them is TypeScript the consumer project compiles.${skipNote}`,
        filesSeen: files.length,
        filesScanned: units.length,
        unread,
        skipped,
      },
    };
  }

  const project = FRAMEWORK_PROJECT[framework];
  const harness = shared ?? createConsumerTsc({ keep, fail });
  try {
    // The project's own anti-theatre self-test first: if `@kitn.ai/ui` resolved
    // to `any`, everything below is theatre and a green means nothing.
    if (!shared) harness.selfTest(project);
    const compiled = compileIn(harness, project, 'acceptance-run', planned);
    if (!compiled.ok) fail(`${compiled.harnessBroken}\n  No verdict was written: a broken harness must not produce a gate result.`);
    const errors = errorLines(compiled.diagnostics);
    const passed = errors.length === 0;
    console.log(
      passed
        ? `  ✓ ${planned.length} unit(s) compile clean under the ${project} project (framework ${framework})`
        : `  ✗ ${errors.length} error(s) under the ${project} project (framework ${framework}):\n${errors.map((e) => `      ${e}`).join('\n')}`,
    );
    return {
      result: {
        passed,
        detail: passed
          ? `tsc --strict clean over ${planned.length} unit(s) under the ${project} consumer project (framework ${framework}), resolving @kitn.ai/ui through the shipped exports map.${skipNote}`
          : `${errors.length} tsc error(s) under the ${project} consumer project (framework ${framework}): ${errors.slice(0, 5).join(' | ')}${
              errors.length > 5 ? ` … and ${errors.length - 5} more` : ''
            }.${skipNote}`,
        framework,
        project,
        filesSeen: files.length,
        filesScanned: units.length,
        unitsCompiled: planned.map((f) => f.unit),
        skipped,
        unread,
        diagnostics: compiled.diagnostics || undefined,
      },
    };
  } finally {
    if (!shared) harness.cleanup();
  }
}

// ---------------------------------------------------------------------------
// Self-test — every outcome watched, including the ones that must go red
// ---------------------------------------------------------------------------

async function selfTest() {
  const checks = [];
  const check = (what, ok, detail) => {
    checks.push([what, ok, detail]);
    console.log(`${ok ? '✓' : '✗'} ${what}${ok || !detail ? '' : `\n    ${detail}`}`);
  };

  // ── planning, no tsc needed ──
  check(
    'a .ts output file is planned as a compilable unit',
    planFiles(codeUnits([{ name: 'src/main.ts', text: 'export const a = 1;\n' }])).files.length === 1,
  );
  check(
    'a ```ts fence inside markdown is planned too, so a prose-shaped answer is still measured',
    planFiles(codeUnits([{ name: 'ANSWER.md', text: '```ts\nexport const a = 1;\n```\n' }])).files.length === 1,
  );
  const js = planFiles(codeUnits([{ name: 'main.js', text: 'export const a = 1;\n' }]));
  check(
    'a JavaScript unit is REPORTED as unreadable by tsc, not silently dropped and not called "no code"',
    js.files.length === 0 && js.skipped.length === 1 && /allowJs/.test(js.skipped[0].why),
  );
  const vue = planFiles(codeUnits([{ name: 'App.vue', text: '<template><p>x</p></template>\n<script setup lang="ts">\nconst a: number = 1;\n</script>\n' }]));
  check('a .vue single-file component has its <script> lifted', vue.files.length === 1 && vue.files[0].lifted === true);
  const tmpl = planFiles(codeUnits([{ name: 'App.vue', text: '<template><p>x</p></template>\n' }]));
  check('a template-only component is reported, not counted as compiled', tmpl.files.length === 0 && tmpl.skipped.length === 1);

  // ── the outcomes, through runGate itself ──
  //
  // ONE harness for every fixture below: standing up the temp tree costs more
  // than the compiles do. `harness.selfTest(project)` still runs once, and every
  // sandbox runs its own controls, so nothing is traded away for the speed.
  const scratch = mkdtempSync(join(tmpdir(), 'kai-gate-compiles-selftest-'));
  const fixture = (name, files) => {
    const dir = join(scratch, name, 'output');
    mkdirSync(dir, { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    return join(scratch, name);
  };
  const harness = createConsumerTsc({ keep: false, fail });
  harness.selfTest('default');
  const gate = (name, files, framework = 'react') => runGate({ runDir: fixture(name, files), framework, harness });

  const none = gate('prose-only', { 'ANSWER.md': 'There is no such element and I will not invent one.\n' });
  check(
    'an output with no code at all is a FAILURE with the reason, never a skip and never an absence',
    none.result.passed === false && /no code unit could be read/.test(none.result.detail),
    none.result?.detail,
  );

  const unreadable = gate('unreadable', { 'main.txt': 'const a: number = 1;\n' });
  check(
    'an unread file BLOCKS the absence verdict — "found nothing" is not "there is nothing"',
    unreadable.result.passed === false && /unread/.test(unreadable.result.detail),
  );

  const jsOnly = gate('js-only', { 'main.js': 'export const a = 1;\n' });
  check(
    'code tsc cannot check is a FAILURE with a reason, never an absence',
    jsOnly.result.passed === false && /none of them is TypeScript/.test(jsOnly.result.detail),
  );

  // ── the compiler is really running, and really strict ──
  // Each of these goes through the same runGate path a real run does.
  const good = gate('good', {
    'src/main.ts': "import { toOpenAIMessages } from '@kitn.ai/ui/wire';\nexport const wire = toOpenAIMessages([]);\n",
  });
  check('OUTCOME 1 — code that compiles passes', good.result?.passed === true, good.result?.detail);

  const planted = [
    ['an implicit `any` (TS7006) — the error ONLY --strict produces', { 'src/main.ts': 'export function f(x) {\n  return x;\n}\n' }, /TS7006/],
    ['a possibly-null value used without a check (TS18047/TS2531) — strictNullChecks is live', { 'src/main.ts': "const el = document.querySelector('kai-chat');\nexport const tag = el.tagName;\n" }, /TS(18047|2531)/],
    ['an unused import (TS6133) — noUnusedLocals is live, which is what fails a stock `npm run build`', { 'src/main.ts': "import { applyToolOutput } from '@kitn.ai/ui/wire';\nexport const ok = 1;\n" }, /TS6133/],
    [
      'a WRONG-TYPE use of the kit (TS2322) — @kitn.ai/ui did not resolve to `any`',
      { 'src/main.ts': "import { toOpenAIMessages } from '@kitn.ai/ui/wire';\nexport const bad: number = toOpenAIMessages([]);\n" },
      /TS2322/,
    ],
    [
      'a broken fence inside a markdown answer — a prose-shaped answer is measured too',
      { 'ANSWER.md': '```ts\nexport const bad: number = "not a number";\n```\n' },
      /TS2322/,
    ],
  ];
  for (const [what, files, expected] of planted) {
    const r = gate(what.slice(0, 24).replace(/\W+/g, '-'), files);
    check(
      `OUTCOME 2 — ${what}`,
      r.result?.passed === false && expected.test(r.result?.diagnostics ?? ''),
      `verdict ${JSON.stringify(r.result?.passed)}; tsc said: ${r.result?.diagnostics ?? '(nothing)'}`,
    );
  }

  // ── the sandbox's own control can FAIL ──
  // A sandbox whose tsconfig lost `strict`/`noUnusedLocals` compiles the probes
  // clean, and every verdict from it would be theatre. Watch that detected.
  try {
    const box = harness.sandbox('default', 'control');
    const honest = box.selfTest();
    check('the sandbox control PASSES on the real tsconfig (positive control)', honest.missed.length === 0, honest.out);
    writeFileSync(join(box.dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true, skipLibCheck: true, strict: false, noUnusedLocals: false }, include: ['**/*.ts'] }, null, 2));
    const broken = box.selfTest();
    check(
      'a sandbox whose tsconfig lost its strict flags is DETECTED, so a green cannot come from a dead harness',
      broken.missed.length === 2,
      `${broken.missed.length} probe(s) missed`,
    );
  } finally {
    harness.cleanup();
  }

  const failed = checks.filter(([, ok]) => !ok).map(([w]) => w);
  if (failed.length) fail(`${failed.length} of this gate's own controls did not behave:\n  - ${failed.join('\n  - ')}`);
  console.log(`✓ acceptance-gate-compiles: ${checks.length} controls, every planted fault detected.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
//
// GUARDED so this module can be IMPORTED. Without it, importing anything from
// here runs the CLI, hits "no --run" and exits 1 — which is how a script ends up
// verifiable only through a subprocess. (The decision worth unit-testing lives
// in lib/compile-plan.mjs, which is importable under jsdom; this file is not,
// because the catalog importer pulls in esbuild.)

// Spelled INLINE in the `if`, not lifted to a const: tests/scripts/main-module-guards.test.ts
// extracts every guard condition in the repo and evaluates it on a path that
// percent-encodes, and it can only find the ones written this way. A guard it
// cannot see is a guard nobody is checking — which is the whole failure mode
// (`file://${process.argv[1]}` is false on a spaced path, and the script then
// exits 0 having printed nothing).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
if (args.includes('--self-test')) {
  await selfTest();
  process.exit(0);
}

const runDir = arg('--run');
if (!runDir) {
  fail('usage: acceptance-gate-compiles.mjs --run <runDir> --framework <' + FRAMEWORKS.join('|') + '> [--gates f] [--keep] | --self-test');
}
if (!existsSync(join(runDir, 'run-info.json'))) {
  fail(`${runDir} has no run-info.json. Point --run at a directory acceptance-run.mjs produced — this gate's verdict is recorded against a ledger, not against a loose folder.`);
}
const info = JSON.parse(readFileSync(join(runDir, 'run-info.json'), 'utf8'));

const framework = arg('--framework');
if (!framework) {
  fail(
    `--framework is required, and it is not inferred. "Compiles under the consumer project for the framework ASKED FOR" is the anchor, and guessing it from a file extension would answer a different question (a .tsx file is react or solid, and those are different tsconfigs). Pass one of: ${FRAMEWORKS.join(', ')}.`,
  );
}
if (!FRAMEWORK_PROJECT[framework]) {
  fail(`"${framework}" is not a framework this kit compiles for. The consumer projects cover: ${FRAMEWORKS.join(', ')} (extensions: ${FRAMEWORKS.map((f) => `${f}→.${EXT[f]}`).join(', ')}).`);
}

// THE GATE MUST APPLY TO THIS SCENARIO. `compiles` is `alwaysApplies: false`, and
// acceptance-eval REFUSES a gates file that answers a dimension the scenario does
// not have. Catching that here saves the operator a compile whose result would be
// thrown away with an error message about something else.
const catalog = await importCatalog();
const scenario = catalog.listScenarios().find((s) => s.id === info.scenarioId);
if (!scenario) fail(`the ledger names scenario ${info.scenarioId}, which is not in the deck.`);
if (!rubricFor(scenario).dimensions.some((d) => d.id === GATE_ID)) {
  fail(
    `"${GATE_ID}" does not apply to ${scenario.id} — no scoring line in that scenario claims it, so acceptance-eval would refuse a gates file that answered it. Scenarios that need it: ${catalog
      .listScenarios()
      .filter((s) => rubricFor(s).dimensions.some((d) => d.id === GATE_ID))
      .map((s) => s.id)
      .join(', ')}.`,
  );
}

console.log(`acceptance-gate-compiles: ${info.runId} — ${scenario.id}, framework ${framework} → ${FRAMEWORK_PROJECT[framework]} project`);

const gatesPath = arg('--gates') ?? join(runDir, 'gates.json');
// ALWAYS a verdict. There is no path on which this gate declines to write one:
// an output with nothing to compile is `passed: false`, so a stale verdict from
// an earlier run over different output is overwritten rather than left behind.
const { result } = runGate({ runDir, framework, keep: args.includes('--keep') });

const existing = existsSync(gatesPath) ? JSON.parse(readFileSync(gatesPath, 'utf8')) : {};
existing[GATE_ID] = result;
writeFileSync(gatesPath, `${JSON.stringify(existing, null, 2)}\n`);
console.log(`acceptance-gate-compiles: wrote ${GATE_ID} = ${result.passed ? 'PASSED' : 'FAILED'} into ${gatesPath}`);
process.exit(0);
}
