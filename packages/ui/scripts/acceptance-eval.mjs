// THE EVALUATOR.
//
//   node scripts/acceptance-eval.mjs --run <runDir> [--findings f] [--gates g]
//   node scripts/acceptance-eval.mjs --template <runDir>
//   node scripts/acceptance-eval.mjs --compare --strong <runDir> --weak <runDir>
//   node scripts/acceptance-eval.mjs --self-test
//
// Scores one run against the rubric, and — the part that matters — attributes
// every finding to the catalog record that should have prevented it, then ranks
// the catalog changes by how many findings each would close. THAT LIST IS THE
// OUTPUT OF A RUN. The score is how you compare two runs; the list is what you
// do next.
//
// The evaluator invokes no model and needs no network. The judged scores come in
// from a human or a judging harness through `--findings`; the gates that need
// real tooling come in through `--gates`; the two gates that can be computed
// from the output text and the catalog are computed here, and a gate that was
// never run scores zero rather than being skipped.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { importCatalog, CATALOG_PATHS } from './lib/import-catalog.mjs';
import { EXECUTION_PATHS, routeModel } from './lib/run-routing.mjs';
import { gateAuditClean, gateElementsExist, scanJudgeLeak } from './lib/output-scan.mjs';
import { DIMENSIONS, SEVERITIES, dimension, rubricFor, assertRubricCoverage, scoreRun, severity } from './lib/rubric.mjs';
import { attributeFindings, prioritiseCatalogChanges, tierDelta, ATTRIBUTION_KINDS } from './lib/catalog-attribution.mjs';
import { proposedFabricationRow } from './lib/fabrications.mjs';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

function fail(msg) {
  console.error(`✗ acceptance-eval: ${msg}`);
  process.exit(1);
}

/** The gates the evaluator computes for itself. Supplying either from outside is refused. */
const EVALUATOR_GATES = DIMENSIONS.filter((d) => d.gate === 'mechanical' && d.runner === 'evaluator').map((d) => d.id);

// ---------------------------------------------------------------------------
// Loading a run, with the contamination controls attached to the load
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

function loadRun(runDir) {
  const infoPath = join(runDir, 'run-info.json');
  if (!existsSync(infoPath)) {
    // The most likely mistake is pointing at the runs PARENT, which would feed
    // the evaluator several runs at once. Say which one it is.
    const looksLikeParent = existsSync(runDir) && readdirSync(runDir).some((e) => existsSync(join(runDir, e, 'run-info.json')));
    fail(
      looksLikeParent
        ? `${runDir} contains several runs. Evaluate ONE run directory at a time: feeding the evaluator a parent is how one run's output ends up scored against another's ledger.`
        : `${runDir} has no run-info.json. Point --run at a directory acceptance-run.mjs produced.`,
    );
  }
  const info = JSON.parse(readFileSync(infoPath, 'utf8'));
  validateLedger(info);
  const files = readOutputFiles(join(runDir, 'output'));
  return { runDir, info, files };
}

/**
 * THE LEDGER IS READ, SO IT MUST BE CHECKED.
 *
 * The evaluator used to trust every field and print them as fact. A run whose
 * `executionPath` had been edited to `"free-lol"`, set to null, or DELETED
 * scored fine and exit 0 — and a deleted path rendered the literal `undefined`
 * in the bolded execution-path cell of REPORT.md. That is worse than having no
 * record at all, because a cost comparison would read it as a finding.
 *
 * Worse still, a model/path PAIR that `routeModel` refuses could be presented as
 * something that happened: a report asserting an Anthropic model ran on the
 * metered path is precisely the claim the router exists to make impossible, and
 * printing it from an unchecked file re-opens the hole from the reading end.
 *
 * So the same decision function that authorised the run re-authorises the
 * record. One function, both ends.
 */
function validateLedger(info) {
  const problems = [];
  for (const field of ['runId', 'scenarioId', 'model', 'tier', 'date']) {
    if (typeof info[field] !== 'string' || !info[field]) problems.push(`\`${field}\` is missing or not a string`);
  }
  if (!EXECUTION_PATHS.includes(info.executionPath)) {
    problems.push(
      `\`executionPath\` is ${JSON.stringify(info.executionPath)}, which is not one of ${EXECUTION_PATHS.join(' | ')}. An unrecognised or absent path renders as fact in the report and would be trusted by a cost comparison.`,
    );
  }
  if (!['explicit', 'inferred'].includes(info.pathSource)) {
    problems.push(`\`pathSource\` is ${JSON.stringify(info.pathSource)}; it must say whether a human typed the path or it was inferred.`);
  }

  // EVERY FIELD THE REPORT PRINTS IS VALIDATED, or it is not printed. Four more
  // rendered straight into the report as fact, `undefined` included. `kitVersion`
  // is the sharpest: the compare guard depends on it, so an unvalidated one let
  // this step write an evaluation.json that the NEXT step would refuse -- a
  // failure deferred to the point where it is hardest to trace.
  if (typeof info.kitVersion !== 'string' || !info.kitVersion) {
    problems.push(
      `\`kitVersion\` is ${JSON.stringify(info.kitVersion)}. The report prints it, and --compare refuses a run without one, so writing this evaluation would defer the failure to a later step.`,
    );
  }
  if (typeof info.routingRule !== 'string' || !info.routingRule) {
    problems.push(`\`routingRule\` is ${JSON.stringify(info.routingRule)}; the report prints it beside the execution path as the reason that path was taken.`);
  }
  if (typeof info.handoverDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(info.handoverDigest)) {
    problems.push(
      `\`handoverDigest\` is ${JSON.stringify(info.handoverDigest)}; it must be a sha256 digest. It is the only evidence of WHICH pack the agent read, so an unchecked one is worse than none.`,
    );
  }
  if (!Number.isInteger(info.handoverFiles) || info.handoverFiles <= 0) {
    problems.push(`\`handoverFiles\` is ${JSON.stringify(info.handoverFiles)}; a handover of zero files is not a run that measured anything.`);
  }
  if (typeof info.model === 'string' && EXECUTION_PATHS.includes(info.executionPath)) {
    const decision = routeModel({ model: info.model, path: info.executionPath });
    if (!decision.ok) {
      problems.push(
        `the ledger records "${info.model}" on the ${info.executionPath} path, a combination the router REFUSES [${decision.rule}]. Either the file was edited after the run or the run bypassed the router; the report will not assert it as fact.`,
      );
    } else if (decision.path !== info.executionPath) {
      problems.push(`the ledger records the ${info.executionPath} path, but "${info.model}" routes to ${decision.path}.`);
    }
  }
  if (problems.length) {
    fail(`the run ledger does not validate, so nothing was scored:\n  - ${problems.join('\n  - ')}`);
  }
}

// ---------------------------------------------------------------------------
// Catalog facts the attribution resolves against
// ---------------------------------------------------------------------------

async function catalogFacts() {
  const catalog = await importCatalog();
  const derived = JSON.parse(readFileSync(CATALOG_PATHS.derived, 'utf8'));
  const knownTags = derived.elements.map((e) => e.tag);

  // WHICH ELEMENTS HAVE A DESCRIPTION ANYWHERE. Derived, because the answer is
  // the point: element-meta.json carries no element-level description at all, so
  // the only curated one-liners in the tree are the handful in llms.txt. An
  // attribution claiming an element is undescribed is therefore true for almost
  // all of them and FALSE for those few — which is exactly the check that stops
  // "no description" becoming the catch-all every finding gets filed under.
  const meta = JSON.parse(readFileSync(CATALOG_PATHS.elementMeta, 'utf8'));
  const describedTags = new Set(meta.filter((m) => m.description || m.summary).map((m) => m.tag));
  const llms = join(resolve(CATALOG_PATHS.packageJson, '..'), 'llms.txt');
  if (existsSync(llms)) {
    for (const m of readFileSync(llms, 'utf8').matchAll(/^- `<(kai-[a-z0-9-]+)>` — /gm)) describedTags.add(m[1]);
  }

  return {
    catalog,
    derived,
    facts: {
      invariantIds: catalog.listInvariants().map((i) => i.id),
      recipeIds: catalog.listSurfaceRecipes().map((r) => r.id),
      knownTags,
      describedTags: [...describedTags],
      pages: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Evaluate one run
// ---------------------------------------------------------------------------

async function evaluate({ runDir, findingsPath, gatesPath }) {
  const { info, files } = loadRun(runDir);
  const { catalog, facts } = await catalogFacts();
  const scenarios = catalog.listScenarios();

  // THE PAGES THIS RUN'S AGENT ACTUALLY HAD. Without them, `pack-defect` and
  // `not-a-catalog-gap` accept any page name, and the escape hatch stops costing
  // anything — which is the one property that keeps it from swallowing the
  // analysis. Read from the pack, not from a list here, so it is this run's pack.
  // WALKED, not a top-level listing. A flat readdir saw 13 of the pack's 93
  // pages -- every per-element page lives under `elements/`, and those are the
  // ones an agent reads most. So the escape hatch was unusable for exactly the
  // pages a finding is most likely to be about, which forces the mis-filing the
  // resolution exists to prevent.
  const agentPackDir = join(info.packDir ?? join(runDir, 'pack'), 'agent');
  if (existsSync(agentPackDir)) {
    const pages = [];
    const walk = (dir, prefix) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) walk(join(dir, e.name), rel);
        else pages.push(rel);
      }
    };
    walk(agentPackDir, '');
    // Both spellings resolve: a finding may name `kai-chat.md` or the path
    // `elements/kai-chat.md`, and refusing one of them would be pedantry that
    // costs the analysis a real attribution.
    facts.pages = [...new Set([...pages, ...pages.map((p) => p.split('/').pop())])];
  }
  assertRubricCoverage(scenarios);

  const scenario = scenarios.find((s) => s.id === info.scenarioId);
  if (!scenario) fail(`the ledger names scenario ${info.scenarioId}, which is not in the deck.`);

  // CONTAMINATION CONTROL. The packer redacts every scoring line out of agent/,
  // so a scoring line in the OUTPUT means the agent read judge/. That run
  // measures the answer key and is refused rather than scored — a contaminated
  // run scored anyway is worse than no run, because it enters the comparison.
  const leak = scanJudgeLeak({ files, scenarios });
  if (!leak.clean) {
    fail(
      `CONTAMINATED RUN — the output quotes ${leak.leaks.length} scoring line(s) verbatim, which appear nowhere in agent/:\n  - ${leak.leaks
        .map((l) => `${l.file}: [${l.scenario}] ${l.line}`)
        .join('\n  - ')}\nThis is not scored. Re-run with a clean handover.`,
    );
  }

  const findings = JSON.parse(readFileSync(findingsPath, 'utf8'));
  if (findings.runId && findings.runId !== info.runId) {
    fail(`the findings file is for run ${findings.runId} and --run is ${info.runId}. Scoring one run's output against another's judgement is not a measurement of anything.`);
  }

  // The two gates this process can answer for itself.
  const computed = {
    'elements-exist': gateElementsExist({ files, knownTags: facts.knownTags }),
    'audit-clean': gateAuditClean({ files }),
  };

  const supplied = gatesPath && existsSync(gatesPath) ? JSON.parse(readFileSync(gatesPath, 'utf8')) : {};
  for (const id of Object.keys(supplied)) {
    if (EVALUATOR_GATES.includes(id)) {
      fail(
        `the gates file supplies "${id}", which the evaluator computes itself from the output and the catalog. Accepting an outside verdict for it would let a run be declared clean without anything looking.`,
      );
    }
  }

  const rubric = rubricFor(scenario);
  const applicable = new Set(rubric.dimensions.map((d) => d.id));
  const gates = {};
  for (const [id, g] of Object.entries(computed)) if (applicable.has(id)) gates[id] = g;
  for (const [id, g] of Object.entries(supplied)) if (applicable.has(id)) gates[id] = g;

  // NO NOT-APPLICABLE ADJUDICATION FOR EXTERNAL GATES, and this is where one
  // used to live. The evaluator ran `codeUnits` over the output and, finding
  // nothing, marked every external mechanical dimension not-applicable. The
  // scan cannot support that verdict: `codeUnits` only extracts fences whose
  // language is in CODE_FENCE_LANGS, so an UNLABELLED fence — how models most
  // often emit code — is indistinguishable from prose, and "no code my scanner
  // recognises" was being adjudicated as "no code". Measured: an S1 run with
  // ZERO output files scored 8.93/10 and exit 0 where it had previously
  // hard-failed, and a mixed answer fabricating `<kai-datagrid>` and failing
  // typecheck scored every mechanical gate 10/10.
  //
  // Deleted rather than tightened, because the benefit was unreachable. The
  // case it was written for is a prose-by-design answer (S6's refusal, S7's
  // diagnosis), and those scenarios carry NO external mechanical dimension:
  // `compiles`/`registers`/`streams` exist only on S1/S2/S4/S5, where an answer
  // containing no code is a failure and not an absence. So the whole cost
  // landed on the code scenarios and none of the benefit was reachable.
  //
  // A mechanical dimension with no gate result is therefore an ERROR again —
  // `scoreRun` raises it — and the `compiles` gate reports `passed: false` when
  // it finds nothing to compile rather than declining to write a verdict.

  const attributed = attributeFindings({ findings: findings.findings ?? [], catalog: facts });
  const scored = scoreRun({ scenario, gates, judged: findings.judgedScores ?? {}, findings: attributed });

  // A FAILED RUN WITH NO FINDINGS IS NOT AN EVALUATION.
  //
  // It was accepted, and rendered "_nothing to change_" under the improvement
  // analysis next to "Addressable share: 0 — every finding names a catalog
  // change" — a sentence that is vacuously true over zero findings and reads as
  // though the catalog came out clean. The whole premise is that what an agent
  // could not build names what the catalog is missing, so a run that could not
  // build it and produced no findings has skipped the only step that mattered.
  // Keyed on ACTUAL failures. It previously also fired on `verdict !== 'scored'`,
  // which caught runs whose only anomaly was a dimension with no subject -- so a
  // flawless prose refusal, whose honest findings list IS empty, was refused
  // outright. A clean run with nothing to report is a legitimate outcome.
  if (!attributed.length && (scored.failedGates.length || scored.blockingFindings.length)) {
    fail(
      `${info.runId} is a ${scored.verdict}${scored.failedGates.length ? ` (${scored.failedGates.join(', ')})` : ''} with ZERO findings recorded. That is not an evaluation: the premise of the deck is that whatever the agent could not build names what the catalog is missing, so a failing run must say what went wrong and what would have prevented it. Record at least one finding, or — if the catalog genuinely said it plainly — one attributed \`not-a-catalog-gap\`.`,
    );
  }

  const weightOf = (f) => dimension(f.dimension)?.weight ?? 1;
  const rank = (id) => severity(id)?.rank ?? 1;
  const analysis = prioritiseCatalogChanges({ findings: attributed, weightOf, severityRank: rank });

  const fabricationProposals = attributed
    .filter((f) => f.attribution.kind === 'fabricated-element')
    .map((f) => proposedFabricationRow(f, { scenarioId: info.scenarioId, model: info.model, date: info.date.slice(0, 10) }));

  return {
    run: info,
    scenario: { id: scenario.id, depth: scenario.depth, prompt: scenario.prompt },
    ...scored,
    kitVersion: info.kitVersion,
    model: info.model,
    tier: info.tier,
    gateDetail: gates,
    findings: attributed,
    analysis,
    fabricationProposals,
    caveats: [
      ...scored.notApplicable.map(
        (id) =>
          `${id} was NOT APPLICABLE: it found no code it could read, so the gate had no subject. It is out of the score entirely — neither passed nor failed — and the remaining weights were renormalised. For a refusal answer that is the correct reading; for an answer that was supposed to contain code, read it as the answer being empty and check \`completeness\`.`,
      ),
      ...(scored.notApplicable.length
        ? [
            `The score is normalised over ${scored.totalWeight} of ${scored.declaredWeight} declared weight. Two runs of this scenario scored over different denominators are only loosely comparable.`,
          ]
        : []),
      ...(rubric.note ? [rubric.note] : []),
      'audit-clean is a FLOOR: a needle firing proves a defect, a needle not firing proves only that the literal wrong form is absent.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function renderReport(e) {
  const rows = e.rows
    .map(
      (r) =>
        `| ${r.id} | ${r.gate} | ${r.applicable === false ? 'n/a' : r.weight} | ${
          r.score === null ? '—' : `${r.score.toFixed(1)}${r.capped ? ` (capped from ${r.raw.toFixed(1)})` : ''}`
        } | ${r.source} | ${r.detail ?? ''} |`,
    )
    .join('\n');

  const findingRows = e.findings.length
    ? e.findings
        .map((f) => `- **[${f.severity}]** ${f.dimension} — ${f.summary}\n  - attributed to \`${f.changeId}\` (${f.attribution.kind})`)
        .join('\n')
    : '_No findings recorded._';

  const ranked = e.analysis.ranked.length
    ? e.analysis.ranked
        .map(
          (c, i) =>
            `| ${i + 1} | \`${c.changeId}\` | ${c.kind} | ${c.closes} | ${c.severityWeight} | ${c.tierRevealed ? 'yes' : ''} |`,
        )
        .join('\n')
    : '| — | _nothing to change_ | | | | |';

  return `# Acceptance evaluation — ${e.scenario.id} (${e.scenario.depth})

| | |
| --- | --- |
| run | \`${e.run.runId}\` |
| model | \`${e.model}\` (tier ${e.tier}${e.run.effort ? `, effort ${e.run.effort}` : ''}) |
| **execution path** | **${e.run.executionPath}** [${e.run.pathSource}, ${e.run.routingRule}] |
| kit version | \`${e.kitVersion}\` |
| date | ${e.run.date} |
| handover | ${e.run.handoverFiles} files, \`${e.run.handoverDigest}\` |

## Verdict: ${e.verdict} — ${e.normalized.toFixed(2)} / 10

${
  e.notApplicable.length
    ? `**${e.notApplicable.length} dimension(s) did not apply** — ${e.notApplicable.join(', ')} — because these gates found no code they could read in the output. They are out of the score entirely, and the remaining weights are renormalised over ${e.totalWeight} of ${e.declaredWeight}. That is the correct reading of an answer that is prose by design (a refusal, a diagnosis); if this answer was supposed to contain code, the emptiness shows up in \`completeness\` instead. Only the gates the evaluator runs itself can report this — an external gate that did not run is a failure, not an absence.\n`
    : ''
}${
  e.failedGates.length
    ? `**Gated failure.** ${e.failedGates.join(', ')} did not pass. A gated failure outranks the score: "it scored ${e.normalized.toFixed(2)}" and "it does not compile" are different facts.`
    : e.blockingFindings.length
      ? `Scored, with ${e.blockingFindings.length} finding(s) at a blocking severity.`
      : 'Scored clean against every gate.'
}

| dimension | gate | weight | score | source | detail |
| --- | --- | --- | --- | --- | --- |
${rows}

## Findings

${findingRows}

## Catalog improvement analysis

**This is the output of the run.** Every finding above was attributed to the
catalog record that should have prevented it; the changes below are ranked by how
many findings each would close.

| # | change | kind | closes | severity weight | tier-revealed |
| --- | --- | --- | --- | --- | --- |
${ranked}

${
  e.analysis.totalFindings === 0
    ? '**No findings were recorded**, so there is no addressable share to report — this run proposes no catalog change because nothing was filed against it, not because the catalog was measured and found complete.'
    : e.analysis.notCatalogGaps.length
      ? `${e.analysis.notCatalogGaps.length} of ${e.analysis.totalFindings} finding(s) were attributed \`not-a-catalog-gap\` — the catalog said it plainly and the output got it wrong anyway. Addressable share: ${e.analysis.addressableShare}.`
      : `Addressable share: ${e.analysis.addressableShare} — all ${e.analysis.totalFindings} finding(s) name a catalog change.`
}

${
  e.fabricationProposals.length
    ? `## Proposed FABRICATED.md rows\n\nPaste into \`src/agent-tooling/catalog/fabrications.ts\` after checking each tag. **Not written automatically:** a mis-scored run editing the catalog would teach every later agent that a real element is imaginary.\n\n\`\`\`json\n${JSON.stringify(e.fabricationProposals, null, 2)}\n\`\`\`\n`
    : ''
}
## Read this before quoting the score

${e.caveats.map((c) => `- ${c}`).join('\n')}
`;
}

function renderDelta(d) {
  const rows = d.rows
    .map((r) => `| ${r.id} | ${r.gate} | ${r.weight} | ${r.strong ?? '—'} | ${r.weak ?? '—'} | ${r.delta ?? '—'} |`)
    .join('\n');
  return `# Tier delta — ${d.scenarioId}

| | strong | weak |
| --- | --- | --- |
| model | \`${d.strong.model}\` | \`${d.weak.model}\` |
| tier | ${d.strong.tier} | ${d.weak.tier} |
| score | ${d.strong.normalized} | ${d.weak.normalized} |
| verdict | ${d.strong.verdict} | ${d.weak.verdict} |

${
  d.denominatorSkew
    ? `> **⚠ Different denominators.** The strong run was scored over ${d.denominatorSkew.strongWeight} weight and the weak run over ${d.denominatorSkew.weakWeight}, because a dimension applied to one and not the other. ${d.denominatorSkew.note}\n`
    : ''
}
**The headline is not "did it pass".** It is how far down the model tier the
catalog keeps working. Anything the strong model gets right and the weak one gets
wrong names a contract the catalog leaves IMPLICIT and is currently relying on
the model to supply from its own priors.

| dimension | gate | weight | strong | weak | delta |
| --- | --- | --- | --- | --- | --- |
${rows}

## Contracts the catalog is leaving implicit

Thresholds, stated rather than tuned: strong >= ${d.thresholds.strongHasIt}, weak <= ${d.thresholds.weakLacksIt}. A dimension between the two is in the table above and is deliberately not claimed here.

${d.implicitContracts.length ? d.implicitContracts.map((id) => `- **${id}**`).join('\n') : '_None: the two tiers agree everywhere, so this scenario reveals nothing about tier robustness._'}

${d.revealedFindings.length ? `${d.revealedFindings.length} finding(s) from the weak run sit on those dimensions.` : ''}

## Catalog changes, re-ranked with the tier evidence

The weak run's findings, with the tier-revealed ones tagged. **A tier-revealed
change is worth more than its raw count suggests**: the strong model did not fall
into it, so the catalog is currently relying on the model's priors to supply
that contract, and it stops being supplied somewhere below this tier.

| # | change | kind | closes | severity weight | tier-revealed |
| --- | --- | --- | --- | --- | --- |
${
  d.rankedWithTier?.ranked.length
    ? d.rankedWithTier.ranked
        .map((c, i) => `| ${i + 1} | \`${c.changeId}\` | ${c.kind} | ${c.closes} | ${c.severityWeight} | ${c.tierRevealed ? '**yes**' : ''} |`)
        .join('\n')
    : '| — | _the weak run recorded no findings_ | | | | |'
}

Held at the weak tier: **${d.heldAtWeakTier ? 'yes' : 'no'}**.
`;
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

async function selfTest() {
  const checks = [];
  const catch_ = (what, fn, match) => {
    try {
      fn();
      checks.push([what, false]);
    } catch (err) {
      checks.push([what, match ? String(err.message).includes(match) : true]);
    }
  };

  const { catalog, facts } = await catalogFacts();
  const scenarios = catalog.listScenarios();

  // The rubric covers every scoring line in the deck, and the coverage check can
  // see a line it does not cover.
  checks.push(['the rubric claims every scoring line in the deck', (() => { try { assertRubricCoverage(scenarios); return true; } catch { return false; } })()]);
  catch_(
    'an unclaimed scoring line is detected',
    () => assertRubricCoverage([{ id: 'SX', scoring: ['zzz nothing in the rubric matches this line zzz'] }]),
    'no rubric dimension claims',
  );

  const s6 = scenarios.find((s) => s.id === 'S6');

  // A mechanical dimension with no gate result is an ERROR, not a pass.
  catch_(
    'a missing gate result is an error, never a skip',
    () => scoreRun({ scenario: s6, gates: { 'elements-exist': { passed: true } }, judged: Object.fromEntries(rubricFor(s6).dimensions.filter((d) => d.gate === 'judged').map((d) => [d.id, 8])) }),
    'has no gate result',
  );

  // The mechanical/judged split holds in both directions.
  catch_(
    'a judged score for a mechanical dimension is refused',
    () => scoreRun({ scenario: s6, gates: {}, judged: { 'elements-exist': 10 } }),
    'MECHANICALLY gated',
  );
  catch_(
    'a gate result for a judged dimension is refused',
    () => scoreRun({ scenario: s6, gates: { 'honesty-bound': { passed: true } }, judged: {} }),
    'JUDGED dimension',
  );

  // Every finding must be attributed, and the attribution must resolve.
  catch_('an unattributed finding is refused', () => attributeFindings({ findings: [{ id: 'f1' }], catalog: facts }), 'carries no attribution');
  catch_(
    'an attribution naming an invariant that does not exist is refused',
    () => attributeFindings({ findings: [{ id: 'f2', attribution: { kind: 'invariant-ineffective', invariant: 'not-real', why: 'x' } }], catalog: facts }),
    'does not exist',
  );
  catch_(
    'proposing an invariant that already exists is refused',
    () => attributeFindings({ findings: [{ id: 'f3', attribution: { kind: 'missing-invariant', proposedId: 'upgrade-race', statement: 'x' } }], catalog: facts }),
    'already exists',
  );
  catch_(
    'recording a REAL element as fabricated is refused',
    () => attributeFindings({ findings: [{ id: 'f4', attribution: { kind: 'fabricated-element', invented: 'kai-chat', useInstead: 'kai-thread' } }], catalog: facts }),
    'is a real element',
  );
  catch_(
    'claiming a described element is undescribed is refused',
    () => attributeFindings({ findings: [{ id: 'f5', attribution: { kind: 'missing-element-description', tag: facts.describedTags[0] } }], catalog: facts }),
    'DOES have a description',
  );
  checks.push([
    'an honest attribution resolves',
    (() => {
      try {
        const [f] = attributeFindings({
          findings: [{ id: 'ok', attribution: { kind: 'fabricated-element', invented: 'kai-datagrid', useInstead: 'kai-cards' } }],
          catalog: facts,
        });
        return f.changeId === 'fabricated:kai-datagrid';
      } catch {
        return false;
      }
    })(),
  ]);

  // Contamination: a scoring line in the output is seen.
  const leak = scanJudgeLeak({ files: [{ name: 'main.ts', text: `// ${s6.scoring[0]}` }], scenarios });
  checks.push(['a scoring line in the output is detected as contamination', !leak.clean]);
  const noLeak = scanJudgeLeak({ files: [{ name: 'main.ts', text: 'const chat = document.querySelector("kai-chat");' }], scenarios });
  checks.push(['ordinary output is not flagged as contamination', noLeak.clean]);

  // The elements gate: fabricated kai-* found, a consumer's own element not.
  const g = gateElementsExist({
    files: [{ name: 'main.ts', text: '<kai-datagrid></kai-datagrid><my-grid></my-grid><kai-chat></kai-chat>' }],
    knownTags: facts.knownTags,
  });
  checks.push(['a fabricated kai-* tag is caught', !g.passed && g.fabricated.some((f) => f.tag === 'kai-datagrid')]);
  checks.push(["a consumer's own <my-grid> is NOT called a fabrication", !g.fabricated.some((f) => f.tag === 'my-grid')]);
  const g2 = gateElementsExist({ files: [{ name: 'main.ts', text: "chat.addEventListener('kai-submit', fn)" }], knownTags: facts.knownTags });
  checks.push(['an EVENT name is not mistaken for a tag', g2.passed]);
  const g3 = gateElementsExist({ files: [{ name: 'notes.md', text: '<kai-datagrid>' }], knownTags: facts.knownTags });
  checks.push(['prose is not scanned for tags (the honest refusal must not be punished)', g3.passed && g3.vacuous]);

  const a = gateAuditClean({ files: [{ name: 'main.ts', text: 'el.setAttribute("messages", String(messages));' }] });
  checks.push(['a wrong-form needle fires in either quote style', !a.passed]);

  for (const [what, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${what}`);
  const failed = checks.filter(([, ok]) => !ok).map(([w]) => w);
  if (failed.length) fail(`${failed.length} of the evaluator's own positive controls did not fire:\n  - ${failed.join('\n  - ')}`);
  console.log(`✓ acceptance-eval: ${checks.length} controls, every planted fault detected.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (args.includes('--self-test')) {
  await selfTest();
  process.exit(0);
}

if (args.includes('--template')) {
  const runDir = arg('--template');
  const { info } = loadRun(runDir);
  const { catalog } = await catalogFacts();
  const scenario = catalog.listScenarios().find((s) => s.id === info.scenarioId);
  const rubric = rubricFor(scenario);
  const template = {
    runId: info.runId,
    _rubric: rubric.dimensions.map((d) => ({
      id: d.id,
      gate: d.gate,
      runner: d.runner ?? null,
      weight: d.weight,
      claims: d.claimed,
      anchors: d.anchors,
    })),
    _severities: SEVERITIES,
    _attributionKinds: ATTRIBUTION_KINDS,
    _note: rubric.note ?? null,
    judgedScores: Object.fromEntries(rubric.dimensions.filter((d) => d.gate === 'judged').map((d) => [d.id, null])),
    findings: [],
  };
  const dest = arg('--out') ?? join(runDir, 'findings.template.json');
  writeFileSync(dest, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`acceptance-eval: wrote ${dest} — fill judgedScores and findings, then --run ${runDir}.`);
  const external = rubric.dimensions.filter((d) => d.gate === 'mechanical' && d.runner === 'external').map((d) => d.id);
  console.log(
    `  external gates still needed: ${external.join(', ') || 'none'} (supply via --gates; absent is an ERROR, never "skipped" and never a pass)`,
  );
  if (external.includes('compiles')) {
    console.log(`  · compiles: node scripts/acceptance-gate-compiles.mjs --run ${runDir} --framework <react|vue|…>`);
  }
  process.exit(0);
}

if (args.includes('--compare')) {
  const strongDir = arg('--strong');
  const weakDir = arg('--weak');
  if (!strongDir || !weakDir) fail('--compare needs --strong <runDir> and --weak <runDir>. Which run is stronger is your statement, not something this script infers from a model name.');
  const load = (dir) => {
    const p = join(dir, 'evaluation.json');
    if (!existsSync(p)) fail(`${dir} has no evaluation.json; evaluate it first with --run ${dir}.`);
    return JSON.parse(readFileSync(p, 'utf8'));
  };
  const strong = load(strongDir);
  const weak = load(weakDir);
  let d;
  try {
    d = tierDelta({
      strong,
      weak,
      strongFindings: strong.findings,
      weakFindings: weak.findings,
      allowVersionSkew: args.includes('--allow-version-skew'),
    });
  } catch (err) {
    fail(err.message);
  }
  // CONSUME `tierRevealed` RATHER THAN ANNOUNCING IT. It was computed, described
  // in the delta's prose, and then dropped: the per-run report's ranked table had
  // already been written, so its tier-revealed column was empty after every
  // compare. The prioritisation is re-run HERE over the weak run's findings with
  // the tier tags applied, which is the only place both halves exist at once —
  // and it is the ranking that should change, because a gap the strong model did
  // not fall into is a contract the catalog is relying on the model to supply.
  const revealedIds = new Set(d.revealedFindings.map((f) => f.id));
  const weakTagged = (weak.findings ?? []).map((f) => ({ ...f, tierRevealed: revealedIds.has(f.id) }));
  d.rankedWithTier = prioritiseCatalogChanges({
    findings: weakTagged,
    weightOf: (f) => dimension(f.dimension)?.weight ?? 1,
    severityRank: (id) => severity(id)?.rank ?? 1,
  });

  const report = renderDelta(d);
  const dest = arg('--out');
  if (dest) {
    writeFileSync(dest, report);
    writeFileSync(dest.replace(/\.md$/, '.json'), `${JSON.stringify(d, null, 2)}\n`);
    console.log(`acceptance-eval: wrote ${dest}`);
  } else {
    console.log(report);
  }
  process.exit(0);
}

const runDir = arg('--run');
if (!runDir) fail('usage: acceptance-eval.mjs --run <runDir> | --template <runDir> | --compare --strong <d> --weak <d> | --self-test');

// SHAPE FIRST. Pointing at the runs PARENT is the likeliest mistake, and its
// message must not be preempted by "no findings file" — which is what a parent
// directory looks like, and which sends the operator off writing findings for a
// directory that is not a run.
loadRun(runDir);

const findingsPath = arg('--findings') ?? join(runDir, 'findings.json');
if (!existsSync(findingsPath)) {
  fail(`no findings file at ${findingsPath}. Generate one with --template ${runDir}; a run with no judgement is not an evaluation.`);
}
const gatesPath = arg('--gates') ?? join(runDir, 'gates.json');

let evaluation;
try {
  evaluation = await evaluate({ runDir, findingsPath, gatesPath });
} catch (err) {
  fail(err.message);
}

writeFileSync(join(runDir, 'evaluation.json'), `${JSON.stringify(evaluation, null, 2)}\n`);
writeFileSync(join(runDir, 'REPORT.md'), renderReport(evaluation));
console.log(
  `acceptance-eval: ${evaluation.scenario.id} ${evaluation.verdict} — ${evaluation.normalized.toFixed(2)}/10 via ${evaluation.run.executionPath}. ${evaluation.analysis.ranked.length} catalog change(s) proposed. Wrote ${join(runDir, 'REPORT.md')}.`,
);
