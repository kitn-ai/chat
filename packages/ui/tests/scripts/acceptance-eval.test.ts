import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { listInvariants } from '../../src/agent-tooling/catalog/invariants';
import { listScenarios } from '../../src/agent-tooling/catalog/scenarios';
import { listSurfaceRecipes } from '../../src/agent-tooling/catalog/surfaces';
import {
  DIMENSIONS,
  SEVERITIES,
  assertRubricCoverage,
  dimension,
  rubricFor,
  scoreRun,
} from '../../scripts/lib/rubric.mjs';
import {
  attributeFindings,
  catalogChangeId,
  prioritiseCatalogChanges,
  resolveAttribution,
  tierDelta,
} from '../../scripts/lib/catalog-attribution.mjs';
import { gateAuditClean, gateElementsExist, scanJudgeLeak } from '../../scripts/lib/output-scan.mjs';
import { proposedFabricationRow, renderFabricatedPage } from '../../scripts/lib/fabrications.mjs';

const PKG = join(__dirname, '..', '..');
const EVAL = join(PKG, 'scripts/acceptance-eval.mjs');
const derived = JSON.parse(readFileSync(join(PKG, 'src/agent-tooling/catalog/derived.json'), 'utf8')) as {
  elements: { tag: string }[];
};
const knownTags = derived.elements.map((e) => e.tag);
const scenarios = listScenarios();

const facts = {
  invariantIds: listInvariants().map((i) => i.id),
  recipeIds: listSurfaceRecipes().map((r) => r.id),
  knownTags,
  describedTags: ['kai-chat'],
  pages: [] as string[],
};

/** Every judged dimension of a scenario, at one score. */
const judgeAll = (scenarioId: string, score: number) => {
  const s = scenarios.find((x) => x.id === scenarioId)!;
  return Object.fromEntries(rubricFor(s).dimensions.filter((d) => d.gate === 'judged').map((d) => [d.id, score]));
};
/** Every mechanical dimension of a scenario, passing. */
const gateAll = (scenarioId: string, passed = true) => {
  const s = scenarios.find((x) => x.id === scenarioId)!;
  return Object.fromEntries(rubricFor(s).dimensions.filter((d) => d.gate === 'mechanical').map((d) => [d.id, { passed }]));
};

// ---------------------------------------------------------------------------

describe('the rubric covers the deck it scores', () => {
  it('every scoring line in every scenario is claimed by at least one dimension', () => {
    expect(() => assertRubricCoverage(scenarios)).not.toThrow();
    // Non-vacuity: there ARE scoring lines to claim.
    expect(scenarios.flatMap((s) => s.scoring).length).toBeGreaterThan(0);
  });

  // POSITIVE CONTROL. The check above is a loop that passes trivially if the
  // matcher claims everything; this proves it can report a line as unclaimed.
  it('an unclaimed scoring line is reported, not silently dropped from the score', () => {
    const fake = { id: 'SX', scoring: ['zzz nothing in the rubric matches this zzz'], depth: 'x' };
    expect(rubricFor(fake).unclaimed).toHaveLength(1);
    expect(() => assertRubricCoverage([fake])).toThrow(/no rubric dimension claims/);
  });

  it('picks the dimensions each scenario actually needs', () => {
    const ids = (id: string) => rubricFor(scenarios.find((s) => s.id === id)!).dimensions.map((d) => d.id);
    // S2 names streaming and compilation; S7 is a prose answer and names neither.
    expect(ids('S2')).toContain('streams');
    expect(ids('S2')).toContain('compiles');
    expect(ids('S7')).not.toContain('streams');
    expect(ids('S7')).not.toContain('compiles');
    // The honesty bound and the fabrication gate apply everywhere: any answer
    // can invent a tag.
    for (const s of scenarios) {
      expect(ids(s.id)).toContain('honesty-bound');
      expect(ids(s.id)).toContain('elements-exist');
    }
  });

  it('says out loud where a scenario discriminates weakly', () => {
    expect(rubricFor(scenarios.find((s) => s.id === 'S7')!).note).toMatch(/DISCRIMINATES WEAKLY/);
    expect(rubricFor(scenarios.find((s) => s.id === 'S6')!).note).toMatch(/STRONGEST SIGNAL/);
  });

  it('scores the refusal scenario\'s honesty bound as the heaviest single dimension', () => {
    const s6 = rubricFor(scenarios.find((s) => s.id === 'S6')!);
    const honesty = s6.dimensions.find((d) => d.id === 'honesty-bound')!;
    for (const d of s6.dimensions) expect(honesty.weight).toBeGreaterThanOrEqual(d.weight);
  });

  it('names the cardTypes answer as CORRECT in the anchor a judge reads', () => {
    const anchors = dimension('honesty-bound')!.anchors;
    expect(anchors[10]).toContain('cardTypes');
    expect(anchors[10]).toContain('not a failed refusal');
  });
});

describe('mechanical gates sit UNDER the judged score', () => {
  it('refuses a judged score for a mechanically gated dimension', () => {
    expect(() => scoreRun({ scenario: scenarios.find((s) => s.id === 'S6')!, gates: gateAll('S6'), judged: { ...judgeAll('S6', 8), 'elements-exist': 10 } })).toThrow(
      /MECHANICALLY gated/,
    );
  });

  it('refuses a gate result for a judged dimension', () => {
    expect(() =>
      scoreRun({ scenario: scenarios.find((s) => s.id === 'S6')!, gates: { ...gateAll('S6'), 'honesty-bound': { passed: true } }, judged: judgeAll('S6', 8) }),
    ).toThrow(/JUDGED dimension/);
  });

  // The discipline this branch keeps re-learning: a green that means "the check
  // never ran" is the dangerous one.
  it('treats an UNRUN gate as an error, never as a skip and never as a pass', () => {
    expect(() => scoreRun({ scenario: scenarios.find((s) => s.id === 'S6')!, gates: { 'elements-exist': { passed: true } }, judged: judgeAll('S6', 8) })).toThrow(
      /has no gate result/,
    );
  });

  it('reports a failed gate as a gated failure, outranking the score', () => {
    const s2 = scenarios.find((s) => s.id === 'S2')!;
    const r = scoreRun({ scenario: s2, gates: { ...gateAll('S2'), compiles: { passed: false, detail: 'TS2345' } }, judged: judgeAll('S2', 10) });
    expect(r.verdict).toBe('gated-fail');
    expect(r.failedGates).toContain('compiles');
    // The judged dimensions were all 10 and the run still does not pass.
    expect(r.normalized).toBeLessThan(10);
  });

  it('surfaces a gate that scanned nothing rather than counting it as clean', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const r = scoreRun({ scenario: s6, gates: { ...gateAll('S6'), 'elements-exist': { passed: true, vacuous: true } }, judged: judgeAll('S6', 8) });
    expect(r.vacuousGates).toContain('elements-exist');
  });
});

describe('severity is runtime impact, and it has teeth', () => {
  it('is ordered by what the user of the built app loses', () => {
    expect(SEVERITIES.map((s) => s.id)).toEqual(['does-not-render', 'does-not-function', 'does-not-wire', 'cosmetic-or-practice']);
    expect(SEVERITIES.filter((s) => s.blocking).map((s) => s.id)).not.toContain('cosmetic-or-practice');
    // Caps descend with impact.
    const caps = SEVERITIES.map((s) => s.cap);
    expect([...caps].sort((a, b) => a - b)).toEqual(caps);
  });

  it.each([
    ['does-not-render', 0],
    ['does-not-function', 3],
    ['does-not-wire', 5],
    ['cosmetic-or-practice', 8],
  ])('a %s finding caps its dimension at %i however it was judged', (sev, cap) => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const r = scoreRun({
      scenario: s6,
      gates: gateAll('S6'),
      judged: judgeAll('S6', 10),
      findings: [
        {
          id: 'f',
          dimension: 'completeness',
          severity: sev,
          summary: 'x',
          attribution: { kind: 'missing-recipe', proposedId: 'new-thing', intent: 'y' },
        },
      ],
    });
    const row = r.rows.find((x) => x.id === 'completeness')!;
    expect(row.raw).toBe(10);
    expect(row.score).toBe(cap);
    expect(row.capped).toBe(cap < 10);
  });

  it('refuses a finding with no attribution', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    expect(() =>
      scoreRun({
        scenario: s6,
        gates: gateAll('S6'),
        judged: judgeAll('S6', 8),
        // @ts-expect-error -- `attribution` is deliberately absent: this is
        // exactly the shape scoreRun must refuse at runtime, and the type says
        // so too. If this stops being a type error, the contract has loosened.
        findings: [{ id: 'f', dimension: 'completeness', severity: 'cosmetic-or-practice', summary: 'x' }],
      }),
    ).toThrow(/no attribution/);
  });
});

describe('every finding is attributed to a catalog record', () => {
  it('resolves an honest attribution and gives it a stable change id', () => {
    const [f] = attributeFindings({
      findings: [{ id: 'a', attribution: { kind: 'fabricated-element', invented: 'kai-datagrid', useInstead: 'kai-cards' } }],
      catalog: facts,
    });
    expect(f.changeId).toBe('fabricated:kai-datagrid');
  });

  it.each([
    [{ kind: 'invariant-ineffective', invariant: 'no-such-invariant', why: 'x' }, /does not exist/],
    [{ kind: 'missing-invariant', proposedId: 'upgrade-race', statement: 'x' }, /already exists/],
    [{ kind: 'recipe-ineffective', recipe: 'no-such-recipe', why: 'x' }, /does not exist/],
    [{ kind: 'fabricated-element', invented: 'kai-chat', useInstead: 'kai-thread' }, /is a real element/],
    [{ kind: 'fabricated-element', invented: 'kai-datagrid', useInstead: 'kai-also-fake' }, /does not ship either/],
    [{ kind: 'fabricated-element', invented: 'kai-datagrid', useInstead: null }, /noReplacementReason/],
    [{ kind: 'missing-element-description', tag: 'kai-chat' }, /DOES have a description/],
    [{ kind: 'missing-element-description', tag: 'kai-nope' }, /not an element the kit ships/],
    [{ kind: 'underived-contract', tag: 'kai-nope', fact: 'x' }, /this is fabricated-element/],
    [{ kind: 'not-a-catalog-gap', page: 'INVARIANTS.md' }, /requires `quote`/],
    [{ kind: 'invented-kind' }, /unknown attribution kind/],
  ])('refuses %#: an attribution that does not resolve against the catalog', (attribution, match) => {
    expect(resolveAttribution(attribution, facts).join(' ')).toMatch(match);
    expect(() => attributeFindings({ findings: [{ id: 'x', attribution }], catalog: facts })).toThrow(match);
  });

  // The escape hatch has to cost something, or every finding lands in it.
  it('accepts not-a-catalog-gap only with the page and the line quoted', () => {
    expect(resolveAttribution({ kind: 'not-a-catalog-gap', page: 'INVARIANTS.md', quote: 'A new array reference NOTIFIES' }, facts)).toEqual([]);
  });

  it('the same change id collapses findings, and the list ranks by how many each closes', () => {
    const findings = [
      { id: '1', dimension: 'completeness', severity: 'cosmetic-or-practice', attribution: { kind: 'missing-element-description', tag: 'kai-cards' } },
      { id: '2', dimension: 'completeness', severity: 'cosmetic-or-practice', attribution: { kind: 'missing-element-description', tag: 'kai-cards' } },
      { id: '3', dimension: 'honesty-bound', severity: 'does-not-render', attribution: { kind: 'missing-recipe', proposedId: 'grid-recipe', intent: 'x' } },
      { id: '4', dimension: 'completeness', severity: 'cosmetic-or-practice', attribution: { kind: 'not-a-catalog-gap', page: 'INVARIANTS.md', quote: 'q' } },
    ];
    const attributed = attributeFindings({ findings, catalog: facts });
    const p = prioritiseCatalogChanges({
      findings: attributed,
      weightOf: (f) => dimension(f.dimension)?.weight ?? 1,
      severityRank: (id) => SEVERITIES.find((s) => s.id === id)?.rank ?? 1,
    });
    expect(p.ranked[0].changeId).toBe('describe:kai-cards');
    expect(p.ranked[0].closes).toBe(2);
    // not-a-catalog-gap is counted, and kept out of the change list.
    expect(p.ranked.map((c) => c.kind)).not.toContain('not-a-catalog-gap');
    expect(p.notCatalogGaps).toHaveLength(1);
    expect(p.addressableShare).toBe(0.75);
  });

  it('ties break on severity, so one does-not-render outranks one cosmetic', () => {
    const findings = [
      { id: '1', dimension: 'completeness', severity: 'cosmetic-or-practice', attribution: { kind: 'missing-recipe', proposedId: 'a-recipe', intent: 'x' } },
      { id: '2', dimension: 'completeness', severity: 'does-not-render', attribution: { kind: 'missing-recipe', proposedId: 'b-recipe', intent: 'x' } },
    ];
    const p = prioritiseCatalogChanges({
      findings: attributeFindings({ findings, catalog: facts }),
      weightOf: () => 1,
      severityRank: (id) => SEVERITIES.find((s) => s.id === id)?.rank ?? 1,
    });
    expect(p.ranked[0].changeId).toBe(catalogChangeId({ kind: 'missing-recipe', proposedId: 'b-recipe' }));
  });
});

describe('tier delta names what the catalog leaves implicit', () => {
  const evaluation = (over: Record<string, unknown>) => ({
    scenarioId: 'S6',
    kitVersion: '1.0.0',
    model: 'm',
    tier: 't',
    normalized: 5,
    verdict: 'scored',
    rows: [
      { id: 'honesty-bound', gate: 'judged', weight: 4, score: 10 },
      { id: 'completeness', gate: 'judged', weight: 3, score: 7 },
    ],
    ...over,
  });

  it('reports the dimensions the strong model held and the weak one lost', () => {
    const strong = evaluation({ model: 'strong', normalized: 9 });
    const weak = evaluation({
      model: 'weak',
      normalized: 3,
      rows: [
        { id: 'honesty-bound', gate: 'judged', weight: 4, score: 0 },
        { id: 'completeness', gate: 'judged', weight: 3, score: 7 },
      ],
    });
    const d = tierDelta({
      strong,
      weak,
      weakFindings: [
        { id: 'w1', dimension: 'honesty-bound', severity: 'does-not-render' },
        { id: 'w2', dimension: 'completeness', severity: 'cosmetic-or-practice' },
      ],
    });
    expect(d.implicitContracts).toEqual(['honesty-bound']);
    // completeness scored the same in both, so it names nothing implicit.
    expect(d.implicitContracts).not.toContain('completeness');
    expect(d.revealedFindings.map((f) => f.id)).toEqual(['w1']);
    expect(d.revealedFindings[0].tierRevealed).toBe(true);
    expect(d.heldAtWeakTier).toBe(false);
  });

  it('refuses to compare across scenarios or across kit versions', () => {
    expect(() => tierDelta({ strong: evaluation({}), weak: evaluation({ scenarioId: 'S1' }) })).toThrow(/across scenarios/);
    expect(() => tierDelta({ strong: evaluation({}), weak: evaluation({ kitVersion: '2.0.0' }) })).toThrow(/different kit versions/);
    expect(() => tierDelta({ strong: evaluation({}), weak: evaluation({ kitVersion: '2.0.0' }), allowVersionSkew: true })).not.toThrow();
  });
});

describe('the gates the evaluator runs for itself', () => {
  it('catches a fabricated kai-* tag', () => {
    const g = gateElementsExist({ files: [{ name: 'a.ts', text: '<kai-datagrid></kai-datagrid>' }], knownTags });
    expect(g.passed).toBe(false);
    expect(g.fabricated.map((f) => f.tag)).toContain('kai-datagrid');
  });

  // THE CARRY-IN. Registering your own element and routing it through cardTypes
  // is a CORRECT answer to the refusal scenario; a gate that flagged it would
  // punish the best available answer.
  it("does not call a consumer's own element a fabrication", () => {
    const g = gateElementsExist({
      files: [{ name: 'a.ts', text: "customElements.define('my-grid', MyGrid); chat.cardTypes = { grid: 'my-grid' };" }],
      knownTags,
    });
    expect(g.passed).toBe(true);
  });

  it('does not mistake an event name for a tag', () => {
    const g = gateElementsExist({ files: [{ name: 'a.ts', text: "chat.addEventListener('kai-submit', fn); el.dispatchEvent(new CustomEvent('kai-card'));" }], knownTags });
    expect(g.passed).toBe(true);
    expect(g.tagsUsed).toEqual([]);
  });

  it('does not scan prose, so the honest refusal is not punished', () => {
    const g = gateElementsExist({ files: [{ name: 'NOTES.md', text: 'There is no <kai-datagrid> in this kit.' }], knownTags });
    expect(g.passed).toBe(true);
    // …and it SAYS it looked at nothing, rather than reporting a clean pass.
    expect(g.vacuous).toBe(true);
    expect(g.filesScanned).toBe(0);
  });

  it('refuses to run against an empty known-tag set rather than reporting everything fabricated', () => {
    expect(() => gateElementsExist({ files: [], knownTags: [] })).toThrow(/empty known-tag set/);
  });

  it('fires a self-audit needle in either quote style', () => {
    for (const text of ["el.setAttribute('messages', String(m));", 'el.setAttribute("messages", String(m));']) {
      expect(gateAuditClean({ files: [{ name: 'a.ts', text }] }).passed).toBe(false);
    }
    expect(gateAuditClean({ files: [{ name: 'a.ts', text: 'el.messages = m;' }] }).passed).toBe(true);
  });

  it('detects a run contaminated by the answer key, and leaves clean output alone', () => {
    const line = scenarios.find((s) => s.id === 'S6')!.scoring[0];
    expect(scanJudgeLeak({ files: [{ name: 'a.md', text: `notes: ${line}` }], scenarios }).clean).toBe(false);
    expect(scanJudgeLeak({ files: [{ name: 'a.ts', text: 'const chat = document.querySelector("kai-chat");' }], scenarios }).clean).toBe(true);
  });
});

describe('the FABRICATED.md write-back', () => {
  const row = {
    invented: 'kai-datagrid',
    wanted: 'a spreadsheet grid message type',
    useInstead: 'kai-cards',
    firstSeen: '2026-08-17',
  };

  it('renders the honest empty state: header and separator only', () => {
    const page = renderFabricatedPage([]);
    expect(page).toContain('No acceptance runs have happened yet');
    expect(page.split('\n').filter((l) => l.trim().startsWith('|'))).toHaveLength(2);
  });

  it('renders a recorded row, and drops the emptiness wording when it does', () => {
    const page = renderFabricatedPage([row]);
    expect(page).not.toContain('No acceptance runs have happened yet');
    const rows = page.split('\n').filter((l) => l.trim().startsWith('|'));
    expect(rows).toHaveLength(3);
    expect(rows[2]).toContain('kai-datagrid');
    expect(rows[2]).toContain('kai-cards');
  });

  it('prints the reason when there is no replacement, rather than a blank cell', () => {
    const page = renderFabricatedPage([{ ...row, useInstead: null, noReplacementReason: 'the kit ships no grid element' }]);
    expect(page).toContain('the kit ships no grid element');
  });

  it('proposes a row from a fabrication finding, and only from one', () => {
    const proposed = proposedFabricationRow(
      { attribution: { kind: 'fabricated-element', invented: 'kai-datagrid', wanted: 'a grid', useInstead: 'kai-cards' } },
      { scenarioId: 'S6', model: 'm', date: '2026-08-17' },
    );
    expect(proposed).toMatchObject({ invented: 'kai-datagrid', useInstead: 'kai-cards', firstSeen: '2026-08-17', scenario: 'S6' });
    expect(() => proposedFabricationRow({ attribution: { kind: 'missing-recipe' } }, { scenarioId: 'S6', model: 'm', date: 'd' })).toThrow(
      /only fabricated-element/,
    );
  });
});

describe('the evaluator CLI, end to end over a prepared run', () => {
  const RUNNER = join(PKG, 'scripts/acceptance-run.mjs');
  let runDir: string;

  const run = (args: string[]): { code: number; out: string } => {
    try {
      return { code: 0, out: execFileSync('node', args, { encoding: 'utf8', stdio: 'pipe' }) };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };

  beforeAll(() => {
    const runs = mkdtempSync(join(tmpdir(), 'accept-eval-'));
    const r = run([RUNNER, '--scenario', 'S6', '--model', 'claude-opus-5', '--tier', 'frontier', '--runs-dir', runs]);
    expect(r.code, r.out).toBe(0);
    runDir = join(runs, readdirSync(runs)[0]);
    mkdirSync(join(runDir, 'output'), { recursive: true });
  });

  const findings = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      judgedScores: { 'contract-correctness': 9, 'invariant-compliance': 8, 'honesty-bound': 10, completeness: 7 },
      findings: [],
      ...over,
    });

  it('scores a clean run and writes the analysis, recording which path ran', () => {
    writeFileSync(join(runDir, 'output', 'main.ts'), "customElements.define('my-grid', G);\nchat.cardTypes = { grid: 'my-grid' };\n");
    writeFileSync(join(runDir, 'findings.json'), findings());
    const r = run([EVAL, '--run', runDir]);
    expect(r.code, r.out).toBe(0);
    const report = readFileSync(join(runDir, 'REPORT.md'), 'utf8');
    expect(report).toContain('**execution path**');
    expect(report).toContain('claude-code');
    expect(report).toContain('Catalog improvement analysis');
    // The S6 honesty note reaches the report rather than staying in the rubric.
    expect(report).toContain('STRONGEST SIGNAL');
  });

  it('REFUSES a gates file that answers a gate the evaluator computes itself', () => {
    writeFileSync(join(runDir, 'findings.json'), findings());
    writeFileSync(join(runDir, 'gates.json'), JSON.stringify({ 'elements-exist': { passed: true } }));
    const r = run([EVAL, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('computes itself');
    rmSync(join(runDir, 'gates.json'));
  });

  it('REFUSES a contaminated run instead of scoring it', () => {
    const line = scenarios.find((s) => s.id === 'S6')!.scoring[0];
    writeFileSync(join(runDir, 'output', 'leak.md'), `The judge wants: ${line}\n`);
    writeFileSync(join(runDir, 'findings.json'), findings());
    const r = run([EVAL, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('CONTAMINATED RUN');
    rmSync(join(runDir, 'output', 'leak.md'));
  });

  // The escape hatch has to cost something, and its cost is quoting a page that
  // exists. Resolved against THIS run's pack, so the check is real.
  it('refuses an attribution naming a page the pack does not have', () => {
    writeFileSync(
      join(runDir, 'findings.json'),
      findings({
        findings: [
          {
            id: 'x',
            dimension: 'completeness',
            severity: 'cosmetic-or-practice',
            summary: 'x',
            attribution: { kind: 'not-a-catalog-gap', page: 'NOT-A-PAGE.md', quote: 'q' },
          },
        ],
      }),
    );
    const bad = run([EVAL, '--run', runDir]);
    expect(bad.code).not.toBe(0);
    expect(bad.out).toContain('is not one of the pack');

    // POSITIVE CONTROL: the same finding against a page the pack DOES have
    // resolves, so the refusal is about the page name and not about the kind.
    writeFileSync(
      join(runDir, 'findings.json'),
      findings({
        findings: [
          {
            id: 'x',
            dimension: 'completeness',
            severity: 'cosmetic-or-practice',
            summary: 'x',
            attribution: { kind: 'not-a-catalog-gap', page: 'INVARIANTS.md', quote: 'q' },
          },
        ],
      }),
    );
    expect(run([EVAL, '--run', runDir]).code).toBe(0);
  });

  it('refuses a findings file belonging to a different run', () => {
    writeFileSync(join(runDir, 'findings.json'), findings({ runId: 'some-other-run' }));
    const r = run([EVAL, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('is for run some-other-run');
  });

  it('refuses a runs PARENT, which would score one run against another ledger', () => {
    const r = run([EVAL, '--run', join(runDir, '..')]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('contains several runs');
  });
});

describe('the evaluator CLI', () => {
  it('its own positive controls all fire', () => {
    const out = execFileSync('node', [EVAL, '--self-test'], { encoding: 'utf8' });
    expect(out).toContain('every planted fault detected');
    expect(out).not.toContain('✗');
  });

  it('every mechanical dimension declares who runs it', () => {
    for (const d of DIMENSIONS.filter((x) => x.gate === 'mechanical')) {
      expect(['evaluator', 'external'], `${d.id} declares no runner`).toContain(d.runner);
    }
  });
});
