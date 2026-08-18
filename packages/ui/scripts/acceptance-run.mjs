// THE RUN LEDGER AND THE HANDOVER.
//
//   node scripts/acceptance-run.mjs --scenario S6 --model claude-opus-5 \
//        --tier frontier --runs-dir <dir> [--path …] [--effort …] [--exec <module>]
//   node scripts/acceptance-run.mjs --self-test
//
// What this does: packs one scenario, records WHAT IS ABOUT TO BE MEASURED into
// a timestamped run directory, and copies `agent/` — and only `agent/` — into an
// isolated handover directory. What it does NOT do: invoke a model. There is no
// API key, no socket and no network in this file or anything it imports; the
// model invocation sits behind `--exec`, a module path the caller supplies,
// which CI never passes. That seam is the whole design: everything measurable
// about a run's setup is testable offline, and only the part that costs money
// needs a human.
//
// THREE THINGS THE LEDGER EXISTS TO RECORD, and the third is the one that gets
// forgotten: the scenario, the model — and WHICH EXECUTION PATH RAN. Without the
// path, a later cost or quality comparison across runs is guesswork, because the
// same model identifier can mean a subscription seat or a metered invoice.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertRoute, routeModel, EXECUTION_PATHS, OPENROUTER_ALLOWED } from './lib/run-routing.mjs';
import { importCatalog } from './lib/import-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKER = join(ROOT, 'scripts/acceptance-pack.mjs');
const args = process.argv.slice(2);

const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

function fail(msg) {
  console.error(`✗ acceptance-run: ${msg}`);
  process.exit(1);
}

const USAGE = `usage:
  acceptance-run.mjs --scenario <S1..S7> --model <id> --tier <label> --runs-dir <dir>
                     [--path ${EXECUTION_PATHS.join('|')}] [--effort <label>]
                     [--handover <dir>] [--exec <module>] [--note <text>]
  acceptance-run.mjs --self-test

Execution paths: Anthropic models run through the owner's Claude Code
subscription; OpenRouter carries only ${OPENROUTER_ALLOWED.join(', ')}.
A mismatch is REFUSED, never rerouted — the two bill to different places.`;

// ---------------------------------------------------------------------------
// Handover isolation
// ---------------------------------------------------------------------------

/** Every file under `root`, as repo-relative-to-root paths. */
function filesUnder(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out;
}

/**
 * CONTAMINATION CONTROL, and an honest statement of its limit.
 *
 * What this enforces: the handover directory contains a copy of `agent/` and
 * NOTHING else — no `judge/`, no `PACK.md`, no other run. It sits outside the
 * runs directory, so walking up from it reaches no answer key and no sibling
 * run; that is the property `<run>/agent` could never have, because `..` from
 * there is the judge directory.
 *
 * What it does NOT enforce: an agent's filesystem access. This script does not
 * sandbox anything. If the harness running the agent can read the whole disk, it
 * can read the judge directory whatever this checks. The backstop for that is on
 * the other side — the evaluator refuses to score output containing a scoring
 * line verbatim, because the packer redacted every one of them out of `agent/`.
 * Between the two: this makes leakage require deliberate effort, and the
 * evaluator notices when someone made it.
 */
export function verifyHandover({ handoverDir, sourceDir, runsDir, scoringLines }) {
  const problems = [];

  const rel = relative(resolve(runsDir), resolve(handoverDir));
  if (rel && !rel.startsWith('..')) {
    problems.push(
      `the handover directory ${handoverDir} is INSIDE the runs directory ${runsDir}. An agent given it can walk up into the judge material and into every other run. Point --handover somewhere else.`,
    );
  }

  const got = filesUnder(handoverDir);
  const want = filesUnder(sourceDir);
  const extra = got.filter((f) => !want.includes(f));
  const missing = want.filter((f) => !got.includes(f));
  if (extra.length) problems.push(`the handover carries ${extra.length} file(s) the pack did not: ${extra.join(', ')}`);
  if (missing.length) problems.push(`the handover is missing ${missing.length} packed file(s): ${missing.join(', ')}`);

  const judgey = got.filter((f) => /(^|\/)judge(\/|$)/i.test(f) || /JUDGE\.md$/i.test(f) || /^PACK\.md$/i.test(f));
  if (judgey.length) problems.push(`judge material reached the handover: ${judgey.join(', ')}`);

  // The packer redacts every scenario's scoring lines out of agent/. Re-checked
  // here rather than assumed: this is the last point before an agent reads it.
  const leaked = [];
  for (const f of got) {
    const text = readFileSync(join(handoverDir, f), 'utf8');
    for (const line of scoringLines) if (text.includes(line)) leaked.push(`${f}: ${line}`);
  }
  if (leaked.length) problems.push(`a scoring line survived redaction into the handover: ${leaked.join(' | ')}`);

  return { ok: problems.length === 0, problems, fileCount: got.length, files: got };
}

/** A digest over the handed-over bytes, so a later evaluation can prove which pack was read. */
function digestOf(root) {
  const h = createHash('sha256');
  for (const f of filesUnder(root)) {
    h.update(f);
    h.update('\0');
    h.update(readFileSync(join(root, f)));
    h.update('\0');
  }
  return `sha256:${h.digest('hex')}`;
}

// ---------------------------------------------------------------------------
// Self-test: watch every refusal fire
// ---------------------------------------------------------------------------

function selfTest() {
  const checks = [];
  const expectRefusal = (what, input, rule) => {
    const d = routeModel(input);
    checks.push([`${what} -> refused [${rule}]`, d.ok === false && d.rule === rule]);
  };
  const expectPath = (what, input, path, source) => {
    const d = routeModel(input);
    checks.push([`${what} -> ${path} (${source})`, d.ok === true && d.path === path && d.pathSource === source]);
  };

  // THE HEADLINE RULE, in every spelling of "Anthropic" that occurs in the wild.
  for (const model of ['anthropic/claude-sonnet-4', 'claude-opus-5', 'openrouter/anthropic/claude-3.7', 'us.anthropic.claude-opus-4']) {
    expectRefusal(`${model} + openrouter`, { model, path: 'openrouter' }, 'anthropic-never-openrouter');
    expectPath(`${model} + claude-code`, { model, path: 'claude-code' }, 'claude-code', 'explicit');
    expectPath(`${model}, no path`, { model }, 'claude-code', 'inferred');
  }
  expectPath('the owner-named model + openrouter', { model: OPENROUTER_ALLOWED[0], path: 'openrouter' }, 'openrouter', 'explicit');
  expectPath('the owner-named model, no path', { model: OPENROUTER_ALLOWED[0] }, 'openrouter', 'inferred');
  expectRefusal('the owner-named model + claude-code', { model: OPENROUTER_ALLOWED[0], path: 'claude-code' }, 'non-anthropic-never-claude-code');
  expectRefusal('an unnamed model + openrouter', { model: 'meta/llama-4', path: 'openrouter' }, 'openrouter-not-owner-named');
  expectRefusal('an unnamed model, no path', { model: 'meta/llama-4' }, 'no-path-for-model');
  expectRefusal('no model', {}, 'model-required');
  expectRefusal('an unknown path label', { model: 'claude-opus-5', path: 'bedrock' }, 'unknown-path');

  // The handover scan, watched detecting each thing it claims to detect.
  const base = mkdtempSync(join(tmpdir(), 'acceptance-run-selftest-'));
  const src = join(base, 'src');
  mkdirSync(join(src, 'elements'), { recursive: true });
  writeFileSync(join(src, 'README.md'), '# pack\n');
  writeFileSync(join(src, 'elements', 'kai-chat.md'), '# kai-chat\n');
  const runs = join(base, 'runs');
  mkdirSync(runs, { recursive: true });

  const clean = join(base, 'handover');
  cpSync(src, clean, { recursive: true });
  const lines = ['no fabricated tag appears in the output'];
  checks.push(['a clean handover verifies', verifyHandover({ handoverDir: clean, sourceDir: src, runsDir: runs, scoringLines: lines }).ok]);

  const withJudge = join(base, 'handover-judge');
  cpSync(src, withJudge, { recursive: true });
  mkdirSync(join(withJudge, 'judge'), { recursive: true });
  writeFileSync(join(withJudge, 'judge', 'JUDGE.md'), 'answer key\n');
  const j = verifyHandover({ handoverDir: withJudge, sourceDir: src, runsDir: runs, scoringLines: lines });
  checks.push(['judge material in the handover is detected', !j.ok && j.problems.some((p) => p.includes('judge material'))]);

  const withLeak = join(base, 'handover-leak');
  cpSync(src, withLeak, { recursive: true });
  writeFileSync(join(withLeak, 'README.md'), `# pack\n${lines[0]}\n`);
  const l = verifyHandover({ handoverDir: withLeak, sourceDir: src, runsDir: runs, scoringLines: lines });
  checks.push(['a scoring line in the handover is detected', !l.ok && l.problems.some((p) => p.includes('scoring line'))]);

  const inside = join(runs, 'handover');
  cpSync(src, inside, { recursive: true });
  const i = verifyHandover({ handoverDir: inside, sourceDir: src, runsDir: runs, scoringLines: lines });
  checks.push(['a handover inside the runs directory is refused', !i.ok && i.problems.some((p) => p.includes('INSIDE'))]);

  const missing = join(base, 'handover-partial');
  mkdirSync(missing, { recursive: true });
  writeFileSync(join(missing, 'README.md'), '# pack\n');
  const m = verifyHandover({ handoverDir: missing, sourceDir: src, runsDir: runs, scoringLines: lines });
  checks.push(['a truncated handover is detected', !m.ok && m.problems.some((p) => p.includes('missing'))]);

  for (const [what, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${what}`);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) fail(`${failed.length} of this script's own positive controls did not fire:\n  - ${failed.map(([w]) => w).join('\n  - ')}`);
  console.log(`✓ acceptance-run: ${checks.length} controls, every planted fault detected.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (args.includes('--self-test')) {
  selfTest();
  process.exit(0);
}
if (args.includes('--help') || args.length === 0) {
  console.log(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
}

const scenarioId = arg('--scenario');
const model = arg('--model');
const tier = arg('--tier');
const runsDir = arg('--runs-dir');
if (!scenarioId || !model || !tier || !runsDir) fail(`missing required argument.\n${USAGE}`);

// ROUTE FIRST, before anything is created. A refusal must cost nothing and leave
// nothing behind, or operators learn to work around it.
let route;
try {
  route = assertRoute({ model, path: arg('--path') });
} catch (err) {
  fail(err.message);
}
if (route.pathSource === 'inferred') {
  // Deciding loudly. An inferred path is still a decision about which invoice
  // this lands on, so it is announced rather than assumed.
  console.log(
    `acceptance-run: no --path was given; "${route.model}" admits exactly one (${route.path}, rule ${route.rule}). Recorded as inferred.`,
  );
}

const stamp = new Date();
const iso = stamp.toISOString();
const runId = `${iso.slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${scenarioId}-${model.replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
const runDir = join(runsDir, runId);
if (existsSync(runDir) && readdirSync(runDir).length) fail(`${runDir} already exists and is not empty.`);
mkdirSync(runDir, { recursive: true });

const packDir = join(runDir, 'pack');
try {
  execFileSync('node', [PACKER, '--scenario', scenarioId, '--out', packDir], { stdio: 'inherit' });
} catch {
  fail(`the packer failed for ${scenarioId}; nothing was measured. Its output is above.`);
}

const packCatalog = JSON.parse(readFileSync(join(packDir, 'judge', 'catalog.json'), 'utf8'));

// EVERY scenario's scoring lines, not this one's. The leak the packer found in
// review was S2's line quoted inside an invariant statement, in a pack built for
// S1 — a check scoped to the packed scenario could not have seen it, and this
// re-check would inherit the same blind spot if it read only `packCatalog`.
const catalog = await importCatalog();
const allScoringLines = [...new Set(catalog.listScenarios().flatMap((s) => s.scoring))];
if (!allScoringLines.length) fail('the deck reports no scoring lines at all; the redaction re-check would be vacuous.');

const handoverDir = arg('--handover') ?? mkdtempSync(join(tmpdir(), `kai-handover-${runId}-`));
if (existsSync(handoverDir) && readdirSync(handoverDir).length) {
  fail(`--handover ${handoverDir} is not empty. The agent must receive the pack and nothing else.`);
}
mkdirSync(handoverDir, { recursive: true });
cpSync(join(packDir, 'agent'), handoverDir, { recursive: true });

const handover = verifyHandover({
  handoverDir,
  sourceDir: join(packDir, 'agent'),
  runsDir,
  scoringLines: allScoringLines,
});
if (!handover.ok) {
  fail(`the handover is not clean, so no agent was given anything:\n  - ${handover.problems.join('\n  - ')}`);
}

const outputDir = join(runDir, 'output');
mkdirSync(outputDir, { recursive: true });

const runInfo = {
  runId,
  date: iso,
  scenarioId,
  // Everything needed to compare this run to another, and to know what it cost.
  model: route.model,
  tier,
  effort: arg('--effort') ?? null,
  executionPath: route.path,
  pathSource: route.pathSource,
  routingRule: route.rule,
  // The PACK's stamp, not this process's package.json read: what the agent was
  // given is the thing a later comparison has to hold constant.
  kitVersion: packCatalog.kitVersion,
  packDir,
  handoverDir,
  handoverFiles: handover.fileCount,
  handoverDigest: digestOf(handoverDir),
  outputDir,
  note: arg('--note') ?? null,
  status: 'prepared',
  transport: null,
};

const writeRunInfo = () => writeFileSync(join(runDir, 'run-info.json'), `${JSON.stringify(runInfo, null, 2)}\n`);
writeRunInfo();

// ---------------------------------------------------------------------------
// THE SEAM. Everything above is offline and tested; everything below runs only
// when a caller hands over a transport module, which CI never does.
// ---------------------------------------------------------------------------
//
// A transport module must export:
//
//   export async function runAgent(request) -> {
//     files?: { name: string, text: string }[],   // written into request.outputDir
//     transcript?: string,                        // written as output/TRANSCRIPT.md
//     meta?: object,                              // recorded in run-info.transport
//   }
//
// `request` is exactly:
//   { runId, scenarioId, model, executionPath, effort, handoverDir, outputDir }
//
// Note what is absent: no pack directory, no judge directory, no run directory.
// A transport cannot hand an agent the answer key by accident because it is
// never told where the answer key is.
const execModule = arg('--exec');
if (!execModule) {
  console.log(
    [
      `acceptance-run: prepared ${runId}`,
      `  scenario     ${scenarioId}`,
      `  model        ${route.model}  (tier ${tier}${runInfo.effort ? `, effort ${runInfo.effort}` : ''})`,
      `  path         ${route.path} [${route.pathSource}, ${route.rule}]`,
      `  kit version  ${runInfo.kitVersion}`,
      `  HAND THIS TO THE AGENT, and nothing else:`,
      `    ${handoverDir}   (${handover.fileCount} files, ${runInfo.handoverDigest.slice(0, 19)}…)`,
      `  collect its output into:`,
      `    ${outputDir}`,
      `  then: node scripts/acceptance-eval.mjs --run ${runDir}`,
      ``,
      `No model was invoked. Pass --exec <module> to drive one; see the seam contract in this file.`,
    ].join('\n'),
  );
  process.exit(0);
}

const transport = await import(pathToFileURL(resolve(execModule)).href);
if (typeof transport.runAgent !== 'function') {
  runInfo.status = 'transport-invalid';
  writeRunInfo();
  fail(`${execModule} exports no runAgent(request) function.`);
}

const request = {
  runId,
  scenarioId,
  model: route.model,
  executionPath: route.path,
  effort: runInfo.effort,
  handoverDir,
  outputDir,
};

let result;
try {
  result = await transport.runAgent(request);
} catch (err) {
  runInfo.status = 'transport-failed';
  runInfo.transport = { error: String(err && err.message ? err.message : err) };
  writeRunInfo();
  fail(`the transport threw: ${runInfo.transport.error}. The run is recorded as failed rather than left looking prepared.`);
}

for (const f of result?.files ?? []) {
  const dest = join(outputDir, f.name);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.text);
}
if (result?.transcript) writeFileSync(join(outputDir, 'TRANSCRIPT.md'), result.transcript);

runInfo.status = 'ran';
runInfo.transport = { module: execModule, meta: result?.meta ?? null, files: (result?.files ?? []).length };
writeRunInfo();

const produced = existsSync(outputDir) ? filesUnder(outputDir).length : 0;
console.log(`acceptance-run: ${runId} ran via ${execModule} — ${produced} output file(s). Next: node scripts/acceptance-eval.mjs --run ${runDir}`);
