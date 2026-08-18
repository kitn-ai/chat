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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertRoute, routeModel, EXECUTION_PATHS, OPENROUTER_ALLOWED } from './lib/run-routing.mjs';
import { importCatalog } from './lib/import-catalog.mjs';
import { HANDOVER_PREFIX, digestOf, filesUnder, verifyHandover } from './lib/handover.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKER = join(ROOT, 'scripts/acceptance-pack.mjs');
const args = process.argv.slice(2);

/**
 * A flag's value, refusing the next FLAG as a value.
 *
 * `--tier --runs-dir /tmp/x` used to record `tier: "--runs-dir"` and then
 * consume the directory as a positional nobody read, so the run was ledgered
 * under a tier that is a flag name and the runs directory silently became
 * whatever `--runs-dir` fell back to. Every field here ends up in a comparison,
 * so a swallowed argument is a corrupted measurement rather than a typo.
 */
const arg = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(
      `✗ acceptance-run: ${name} was given no value${value ? ` (the next token is the flag ${value})` : ''}. Every field on this command line is recorded in the ledger and compared across runs, so a missing one is refused rather than guessed.`,
    );
    process.exit(1);
  }
  return value;
};

function fail(msg) {
  console.error(`✗ acceptance-run: ${msg}`);
  process.exit(1);
}

const USAGE = `usage:
  acceptance-run.mjs --scenario <S1..S7> --model <id> --tier <label> --runs-dir <dir>
                     [--path ${EXECUTION_PATHS.join('|')}] [--effort <label>]
                     [--handover <dir>] [--exec <module>] [--note <text>]
  acceptance-run.mjs --prune-handovers <runs-dir>
  acceptance-run.mjs --self-test

Execution paths: Anthropic models run through the owner's Claude Code
subscription; OpenRouter carries only ${OPENROUTER_ALLOWED.join(', ')}.
A mismatch is REFUSED, never rerouted — the two bill to different places.`;

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

// MAINTENANCE: sweep handovers nothing references any more.
//
// A handover has to outlive the process that made it — the agent reads it later
// — so it cannot be cleaned up on exit, and they accumulate. A review swept 824
// abandoned directories out of TMPDIR. Failed runs now prune their own, and this
// clears what earlier ones left: every directory matching our prefix that no
// run-info.json under `<runs-dir>` still points at.
if (args.includes('--prune-handovers')) {
  const runsRoot = arg('--prune-handovers');
  const referenced = new Set();
  const collect = (dir, depth) => {
    if (depth > 3) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const info = join(dir, e.name, 'run-info.json');
      if (existsSync(info)) {
        try {
          referenced.add(resolve(JSON.parse(readFileSync(info, 'utf8')).handoverDir ?? ''));
        } catch {
          /* an unreadable ledger protects nothing; treat it as referencing nothing */
        }
      } else collect(join(dir, e.name), depth + 1);
    }
  };
  if (existsSync(runsRoot)) collect(runsRoot, 0);

  const tmp = tmpdir();
  const candidates = readdirSync(tmp).filter((e) => e.startsWith(HANDOVER_PREFIX));
  let removed = 0;
  const kept = [];
  for (const name of candidates) {
    const full = resolve(join(tmp, name));
    if (referenced.has(full)) {
      kept.push(name);
      continue;
    }
    try {
      rmSync(full, { recursive: true, force: true });
      removed += 1;
    } catch (err) {
      console.error(`  could not remove ${full}: ${err?.message ?? err}`);
    }
  }
  console.log(
    `acceptance-run: pruned ${removed} of ${candidates.length} handover director(ies) under ${tmp}; kept ${kept.length} still referenced by a ledger under ${runsRoot}.`,
  );
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

const explicitHandover = arg('--handover');
const handoverDir = explicitHandover ?? mkdtempSync(join(tmpdir(), `${HANDOVER_PREFIX}${runId}-`));
// Only a handover THIS process created is ever removed, and only on a path
// where no agent can have read it yet.
const ownsHandover = !explicitHandover;
if (existsSync(handoverDir) && readdirSync(handoverDir).length && explicitHandover) {
  fail(`--handover ${handoverDir} is not empty. The agent must receive the pack and nothing else.`);
}
mkdirSync(handoverDir, { recursive: true });

// ONLY `agent/`. Never the pack root, which contains `judge/`. This is the
// structural half of the isolation: the ancestor check above is a backstop for
// where the directory SITS, and this is what it CONTAINS.
cpSync(join(packDir, 'agent'), handoverDir, { recursive: true });

/** Remove a handover we created, so a failed run never leaves one lying around. */
const pruneHandover = (why) => {
  if (!ownsHandover) return;
  try {
    rmSync(handoverDir, { recursive: true, force: true });
    console.error(`acceptance-run: removed the handover at ${handoverDir} (${why}).`);
  } catch (err) {
    console.error(`acceptance-run: COULD NOT remove the handover at ${handoverDir} — ${err?.message ?? err}. Delete it by hand; it is a pack from a run that failed.`);
  }
};

const handover = verifyHandover({
  handoverDir,
  sourceDir: join(packDir, 'agent'),
  runsDir,
  scoringLines: allScoringLines,
});
if (!handover.ok) {
  // Prune BEFORE failing. A handover that failed verification is exactly the one
  // that must not survive on disk: the reviewer swept 824 abandoned directories
  // out of TMPDIR, some of them holding a live answer key, all of them left by
  // runs that had already failed.
  pruneHandover('it did not verify');
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
  // The form comparisons key on. Three spellings of one model used to produce
  // three ledger strings and a cross-run comparison read them as three models.
  modelCanonical: route.modelCanonical,
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
