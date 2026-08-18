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
  rubricShape,
  scoreRun,
} from '../../scripts/lib/rubric.mjs';
import {
  attributeFindings,
  catalogChangeId,
  prioritiseCatalogChanges,
  resolveAttribution,
  tierDelta,
} from '../../scripts/lib/catalog-attribution.mjs';
import { codeUnits, fencedBlocks, gateAuditClean, gateElementsExist, scanJudgeLeak } from '../../scripts/lib/output-scan.mjs';
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

  // I1 — THE SHAPE, PINNED. Line-to-dimension coverage stays green while a
  // criterion is REWRITTEN: turning S4's "compiles and registers" into "the
  // emitted code compiles" keeps every line claimed and silently drops the
  // `registers` dimension, taking its weight out of the denominator so the score
  // goes UP on a scenario that just lost a gate. This table is authored intent,
  // not a derivable fact — update it deliberately when the deck changes.
  const EXPECTED_SHAPE: Record<string, { dimensions: string[]; totalWeight: number }> = {
    S1: {
      dimensions: ['audit-clean', 'compiles', 'completeness', 'contract-correctness', 'elements-exist', 'honesty-bound', 'invariant-compliance', 'registers', 'wiring-topology'],
      totalWeight: 26,
    },
    S2: {
      dimensions: ['audit-clean', 'compiles', 'completeness', 'contract-correctness', 'elements-exist', 'honesty-bound', 'invariant-compliance', 'streams'],
      totalWeight: 24,
    },
    S3: {
      dimensions: ['audit-clean', 'completeness', 'contract-correctness', 'elements-exist', 'honesty-bound', 'invariant-compliance', 'wiring-topology'],
      totalWeight: 21,
    },
    S4: {
      dimensions: ['audit-clean', 'compiles', 'completeness', 'contract-correctness', 'elements-exist', 'honesty-bound', 'invariant-compliance', 'registers'],
      totalWeight: 24,
    },
    S5: {
      dimensions: ['audit-clean', 'completeness', 'contract-correctness', 'elements-exist', 'honesty-bound', 'invariant-compliance', 'registers'],
      totalWeight: 21,
    },
    S6: {
      dimensions: ['audit-clean', 'completeness', 'contract-correctness', 'elements-exist', 'honesty-bound', 'invariant-compliance'],
      totalWeight: 19,
    },
    S7: {
      dimensions: ['audit-clean', 'completeness', 'contract-correctness', 'elements-exist', 'honesty-bound', 'invariant-compliance'],
      totalWeight: 19,
    },
  };

  it('pins the dimension SET and total weight per scenario, so one cannot drop out silently', () => {
    expect(() => assertRubricCoverage(scenarios, EXPECTED_SHAPE)).not.toThrow();
    // Non-vacuity: the table covers the whole deck.
    expect(Object.keys(EXPECTED_SHAPE).sort()).toEqual(scenarios.map((s) => s.id).sort());
  });

  it('the shape pin can see a dimension drop out while every line stays claimed', () => {
    // S4's real line, rewritten so `registers` no longer applies. Coverage alone
    // is still satisfied — `compiles` claims it — which is exactly the hole.
    const rewritten = { id: 'S4', scoring: ['the emitted code compiles'], depth: 'whole surface' };
    expect(rubricFor(rewritten).unclaimed).toEqual([]);
    expect(rubricShape(rewritten).dimensions).not.toContain('registers');
    expect(() => assertRubricCoverage([rewritten], EXPECTED_SHAPE)).toThrow(/NO LONGER APPLY/);
  });

  // F9 — the dimension-SET half and the WEIGHT half are separate guards, and the
  // set half was masking the weight half in every case the deck currently
  // produces. A weight change with an unchanged set is the drift that reprices
  // every past score without changing which criteria applied.
  it('catches a weight change even when the dimension set is identical', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const shape = rubricShape(s6);
    expect(() => assertRubricCoverage([s6], { S6: shape })).not.toThrow();
    expect(() =>
      assertRubricCoverage([s6], { S6: { dimensions: shape.dimensions, totalWeight: shape.totalWeight + 1 } }),
    ).toThrow(/total weight moved/);
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

  // PINNED EXACTLY. `toBeGreaterThanOrEqual` let the weight fall 4 -> 3 and stay
  // green, which is the whole failure mode this assertion exists to prevent:
  // the refusal scenario's honesty bound is the deck's strongest signal and its
  // weight is the thing that makes it one.
  it('scores the refusal scenario\'s honesty bound as the single heaviest dimension', () => {
    const s6 = rubricFor(scenarios.find((s) => s.id === 'S6')!);
    const honesty = s6.dimensions.find((d) => d.id === 'honesty-bound')!;
    expect(honesty.weight).toBe(4);
    for (const d of s6.dimensions) {
      if (d.id !== 'honesty-bound') expect(honesty.weight, `${d.id} matches or beats it`).toBeGreaterThan(d.weight);
    }
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

  // R1 — THE CORRECTION TO AN OVER-CORRECTION. Scoring a subject-less gate 0
  // inverted the bias onto the deck's BEST answer: S6's textbook reply is a
  // pure-prose refusal, and it scored 6.53 `gated-fail` on two gates that had
  // nothing to look at. Absence of subject is not absence of merit.
  it('a gate with no subject is NOT APPLICABLE — out of the score, not failed', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const r = scoreRun({
      scenario: s6,
      gates: { 'elements-exist': { passed: true, vacuous: true }, 'audit-clean': { passed: true, vacuous: true } },
      judged: judgeAll('S6', 10),
    });
    expect(r.notApplicable.sort()).toEqual(['audit-clean', 'elements-exist']);
    expect(r.verdict).toBe('scored');
    // A flawless prose refusal reaches a clean 10.
    expect(r.normalized).toBe(10);
    // Out of the denominator, not zeroed inside it.
    expect(r.totalWeight).toBeLessThan(r.declaredWeight);
    for (const id of r.notApplicable) {
      const row = r.rows.find((x) => x.id === id)!;
      expect(row.score).toBeNull();
      expect(row.applicable).toBe(false);
    }
  });

  // H-C — RESTORED. The old H2 test carried the only assertion pinning that a
  // PASSING non-vacuous mechanical gate scores exactly 10, and deleting that
  // test took the pin with it: `raw = g.passed ? 10 : 0` mutated to `? 9 : 0`
  // went green. Its successor asserted an inequality, which cannot see that.
  it('a passing non-vacuous mechanical gate scores exactly 10, and a failing one exactly 0', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const pass = scoreRun({ scenario: s6, gates: gateAll('S6'), judged: judgeAll('S6', 0) });
    for (const row of pass.rows.filter((r) => r.gate === 'mechanical')) {
      expect(row.score, `${row.id} did not score exactly 10`).toBe(10);
      expect(row.raw).toBe(10);
    }
    const fail = scoreRun({ scenario: s6, gates: gateAll('S6', false), judged: judgeAll('S6', 0) });
    for (const row of fail.rows.filter((r) => r.gate === 'mechanical')) expect(row.score).toBe(0);
  });

  it('does not award weight for a gate with no subject either', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const judged = judgeAll('S6', 5);
    const withSubject = scoreRun({ scenario: s6, gates: gateAll('S6'), judged });
    const without = scoreRun({
      scenario: s6,
      gates: { 'elements-exist': { passed: true, vacuous: true }, 'audit-clean': { passed: true, vacuous: true } },
      judged,
    });
    // Passing gates lift a middling judged score; absent ones must not.
    expect(withSubject.normalized).toBeGreaterThan(without.normalized);
    expect(without.normalized).toBe(5);
  });

  it('still FAILS a gate that had a subject and did not pass', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const r = scoreRun({
      scenario: s6,
      gates: { ...gateAll('S6'), 'elements-exist': { passed: false, detail: 'fabricated' } },
      judged: judgeAll('S6', 10),
    });
    expect(r.verdict).toBe('gated-fail');
    expect(r.failedGates).toContain('elements-exist');
    expect(r.notApplicable).toEqual([]);
  });

  // ★H-A — the field R1 introduced undid the validation H1 added, on the same
  // object. An external gate cannot be vacuous: it does not scan, so it has no
  // way to discover an absence of subject. Measured, a real S1 run WITH code
  // scored 10.00/10 exit 0 on three external gates marked vacuous.
  it.each([['compiles'], ['registers'], ['streams']])('refuses `vacuous` on the external gate %s', (id) => {
    const s2 = scenarios.find((s) => s.id === 'S2')!;
    if (!rubricFor(s2).dimensions.some((d) => d.id === id)) return;
    expect(() =>
      scoreRun({
        scenario: s2,
        gates: { ...gateAll('S2'), [id]: { passed: false, vacuous: true } },
        judged: judgeAll('S2', 10),
      }),
    ).toThrow(/EXTERNAL gate and reported/);
  });

  it.each([['false'], ['no'], [1], [{}], [[]]])('refuses a non-boolean `vacuous` of %o', (vacuous) => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    expect(() =>
      scoreRun({
        scenario: s6,
        gates: { ...gateAll('S6'), 'elements-exist': { passed: true, vacuous } as unknown as { passed: boolean } },
        judged: judgeAll('S6', 10),
      }),
    ).toThrow(/must be a real boolean/);
  });

  it('refuses "not applicable" while the output holds files the scan could not read', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const na = { passed: true, vacuous: true, filesSeen: 2, unread: ['main.txt'] };
    expect(() => scoreRun({ scenario: s6, gates: { ...gateAll('S6'), 'elements-exist': na }, judged: judgeAll('S6', 10) })).toThrow(
      /cannot read/,
    );
    // POSITIVE CONTROL: the same shape with nothing unread is accepted.
    const ok = { passed: true, vacuous: true, filesSeen: 1, unread: [] };
    expect(() => scoreRun({ scenario: s6, gates: { ...gateAll('S6'), 'elements-exist': ok }, judged: judgeAll('S6', 10) })).not.toThrow();
  });

  it('says what it actually knows in the not-applicable row, not "the output contains no code"', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    const r = scoreRun({
      scenario: s6,
      gates: {
        'elements-exist': { passed: true, vacuous: true, filesSeen: 3, unread: [] },
        'audit-clean': { passed: true, vacuous: true, filesSeen: 3, unread: [] },
      },
      judged: judgeAll('S6', 10),
    });
    const row = r.rows.find((x) => x.id === 'elements-exist')!;
    expect(row.source).toContain('found no code it could read');
    expect(row.source).toContain('3 output file(s)');
    expect(row.source).not.toContain('contains no code');
  });

  // H1 — the machine verdicts were the UNVALIDATED half, while judged scores
  // were runtime-checked. Backwards: gates outrank judgement.
  it.each([['false'], ['no'], ['not run'], [1], [{}], [null], [undefined as unknown as string]])(
    'refuses a gate whose `passed` is %o rather than scoring it',
    (passed) => {
      const s6 = scenarios.find((s) => s.id === 'S6')!;
      expect(() =>
        scoreRun({
          scenario: s6,
          gates: { ...gateAll('S6'), 'elements-exist': { passed } as unknown as { passed: boolean } },
          judged: judgeAll('S6', 8),
        }),
      ).toThrow(/must be a real boolean|has no gate result/);
    },
  );

  it('the string "false" specifically does not score a perfect 10', () => {
    const s6 = scenarios.find((s) => s.id === 'S6')!;
    let scored: { normalized: number } | undefined;
    try {
      scored = scoreRun({
        scenario: s6,
        gates: { ...gateAll('S6'), 'elements-exist': { passed: 'false' } as unknown as { passed: boolean } },
        judged: judgeAll('S6', 10),
      });
    } catch {
      scored = undefined;
    }
    expect(scored, 'a truthy string scored instead of being refused').toBeUndefined();
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

  // H-D — the null filter is NOT inert. Without it a strong-run n/a row against
  // a weak-run 0 prints `delta: 0` — "both models scored the same" — which is
  // the tier axis reporting a FALSE EQUALITY, on the one number this whole
  // measurement exists to produce.
  it('treats a not-applicable row as absent, never as a zero', () => {
    const strong = evaluation({
      model: 'strong',
      rows: [
        { id: 'elements-exist', gate: 'mechanical', weight: 3, score: null },
        { id: 'honesty-bound', gate: 'judged', weight: 4, score: 10 },
      ],
    });
    const weak = evaluation({
      model: 'weak',
      rows: [
        { id: 'elements-exist', gate: 'mechanical', weight: 3, score: 0 },
        { id: 'honesty-bound', gate: 'judged', weight: 4, score: 10 },
      ],
    });
    const d = tierDelta({ strong, weak });
    const row = d.rows.find((r) => r.id === 'elements-exist')!;
    expect(row.delta, 'a null row was folded in as 0 and printed a false equality').toBeNull();
    expect(row.strong).toBeNull();
    // …and it is not claimed as a contract the catalog leaves implicit either.
    expect(d.implicitContracts).not.toContain('elements-exist');
  });

  it('surfaces a denominator skew, which the per-run caveat can never reach', () => {
    const strong = evaluation({ totalWeight: 19, declaredWeight: 19 });
    const weak = evaluation({ totalWeight: 13, declaredWeight: 19 });
    const d = tierDelta({ strong, weak });
    expect(d.denominatorSkew).toMatchObject({ strongWeight: 19, weakWeight: 13 });

    // POSITIVE CONTROL: equal denominators report no skew.
    expect(tierDelta({ strong, weak: evaluation({ totalWeight: 19, declaredWeight: 19 }) }).denominatorSkew).toBeNull();
  });

  it('refuses to compare across scenarios or across kit versions', () => {
    expect(() => tierDelta({ strong: evaluation({}), weak: evaluation({ scenarioId: 'S1' }) })).toThrow(/across scenarios/);
    expect(() => tierDelta({ strong: evaluation({}), weak: evaluation({ kitVersion: '2.0.0' }) })).toThrow(/different kit versions/);
    expect(() => tierDelta({ strong: evaluation({}), weak: evaluation({ kitVersion: '2.0.0' }), allowVersionSkew: true })).not.toThrow();
  });

  // F13 — ABSENCE IS NOT COMPATIBILITY. The guard required both versions to be
  // present before it could fire, so a run missing the field compared clean
  // against anything: the case where you most need to know the packs may have
  // differed was the one it waved through.
  it.each<[string, { weak?: boolean; strong?: boolean }]>([
    ['the weak run', { weak: true }],
    ['the strong run', { strong: true }],
    ['both runs', { weak: true, strong: true }],
  ])('refuses a comparison when %s records no kit version', (_label, which) => {
    const strong = evaluation(which.strong ? { kitVersion: undefined } : {});
    const weak = evaluation(which.weak ? { kitVersion: undefined } : {});
    expect(() => tierDelta({ strong, weak })).toThrow(/does not record a kit version/);
    expect(() => tierDelta({ strong, weak, allowVersionSkew: true })).not.toThrow();
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

  it('does not read tags out of prose, so a refusal naming what it declined to invent is clean', () => {
    const g = gateElementsExist({ files: [{ name: 'NOTES.md', text: 'There is no <kai-datagrid> in this kit.' }], knownTags });
    expect(g.fabricated).toEqual([]);
    // …and it SAYS it looked at nothing, rather than reporting a clean pass.
    // The scorer treats that as NOT APPLICABLE — out of the score entirely —
    // which is what lets a pure-prose refusal reach 10. See the R1 cases above.
    expect(g.vacuous).toBe(true);
    expect(g.filesScanned).toBe(0);
  });

  // A prose answer with the code in a fence is the SHAPE of the debugging
  // scenario's best answer, and the gates saw nothing at all in it.
  it('scans fenced code inside a prose file, and only fenced code', () => {
    const file = {
      name: 'ANSWER.md',
      text: [
        'The kit has no grid, but here is the fix:',
        '',
        '```ts',
        "chat.messages = messages.map((m, i) => (i === last ? { ...m } : m));",
        '```',
        '',
        'Note that <kai-datagrid> outside a fence is me talking, not proposing.',
      ].join('\n'),
    };
    const units = codeUnits([file]);
    expect(units).toHaveLength(1);
    expect(units[0].text).toContain('chat.messages =');
    // The prose mention did not travel into the scanned unit.
    expect(units[0].text).not.toContain('kai-datagrid');

    const g = gateElementsExist({ files: [file], knownTags });
    expect(g.vacuous).toBe(false);
    expect(g.passed).toBe(true);
  });

  it('catches a fabricated tag written inside a fence', () => {
    const g = gateElementsExist({
      files: [{ name: 'ANSWER.md', text: '```html\n<kai-datagrid rows="10"></kai-datagrid>\n```\n' }],
      knownTags,
    });
    expect(g.passed).toBe(false);
    expect(g.fabricated.map((f) => f.tag)).toContain('kai-datagrid');
  });

  // R2 — only exactly-three backticks were recognised, and mixed with a
  // recognised fence the gate reported a CLEAN PASS rather than "nothing to
  // look at". That is the vacuity failure again, in a narrower disguise.
  it.each([
    ['tilde fences', '~~~html\n<kai-datagrid></kai-datagrid>\n~~~\n'],
    ['four backticks', '````html\n<kai-datagrid></kai-datagrid>\n````\n'],
    ['four tildes', '~~~~html\n<kai-datagrid></kai-datagrid>\n~~~~\n'],
    ['an unclosed fence', '```html\n<kai-datagrid></kai-datagrid>\n'],
  ])('catches a fabricated tag inside %s', (_label, text) => {
    const g = gateElementsExist({ files: [{ name: 'A.md', text }], knownTags });
    expect(g.passed).toBe(false);
    expect(g.fabricated.map((f) => f.tag)).toContain('kai-datagrid');
  });

  it('FAILS CLOSED when an unrecognised fence sits beside a recognised one', () => {
    const text = '```ts\nconst a = 1;\n```\n\n~~~html\n<kai-datagrid></kai-datagrid>\n~~~\n';
    const g = gateElementsExist({ files: [{ name: 'A.md', text }], knownTags });
    // The ```ts block made the scan non-vacuous, so "no hits" would have been
    // reported as a confident pass.
    expect(g.vacuous).toBe(false);
    expect(g.passed).toBe(false);
  });

  it('treats a shorter run of the same character as content, not as a close', () => {
    const blocks = fencedBlocks('````ts\na\n```\nb\n````');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('a\n```\nb');
  });

  it('takes the first word of the info string as the language', () => {
    expect(fencedBlocks('```ts twoslash\nconst a = 1;\n```')[0].lang).toBe('ts');
  });

  // H-B — the vacuity signal cannot distinguish "no subject" from "subject the
  // gate failed to read", so anything it cannot read must be REPORTED rather
  // than silently counted as absence.
  it.each([['main.txt'], ['notes.rst'], ['run.sh'], ['data.json']])('reports %s as unread rather than as no-code', (name) => {
    const g = gateElementsExist({ files: [{ name, text: '<kai-datagrid></kai-datagrid>' }], knownTags });
    expect(g.unread).toContain(name);
    expect(g.vacuous).toBe(true);
    // The scorer refuses a not-applicable verdict while these exist — pinned in
    // the mechanical-gate suite; here we pin that the gate SURFACES them.
  });

  it.each([['a.md'], ['a.ts'], ['a.htm'], ['a.py']])('does not report %s as unread — it is read', (name) => {
    expect(gateElementsExist({ files: [{ name, text: '// nothing\n' }], knownTags }).unread).toEqual([]);
  });

  it('does not fence-extract a non-prose file, so raw code in main.txt is not "no code"', () => {
    expect(codeUnits([{ name: 'main.txt', text: '```ts\nconst a = 1;\n```' }])).toEqual([]);
    expect(codeUnits([{ name: 'main.md', text: '```ts\nconst a = 1;\n```' }])).toHaveLength(1);
  });

  it('reports how many files it saw, not only how many it read', () => {
    const g = gateElementsExist({ files: [{ name: 'a.md', text: 'prose' }, { name: 'b.txt', text: 'x' }], knownTags });
    expect(g.filesSeen).toBe(2);
    expect(g.filesScanned).toBe(0);
  });

  // R2 follow-on: the decorations real markdown carries on an info string.
  it.each([
    ['{html}', '```{html}\n<kai-datagrid></kai-datagrid>\n```\n'],
    ['html,twoslash', '```html,twoslash\n<kai-datagrid></kai-datagrid>\n```\n'],
    ['html:src/main.html', '```html:src/main.html\n<kai-datagrid></kai-datagrid>\n```\n'],
  ])('normalises the fence language %s so the block is still read', (_label, text) => {
    const g = gateElementsExist({ files: [{ name: 'a.md', text }], knownTags });
    expect(g.vacuous).toBe(false);
    expect(g.passed).toBe(false);
  });

  it('ignores a fence in a language that is not code', () => {
    expect(codeUnits([{ name: 'a.md', text: '```json\n{"a":1}\n```\n' }])).toEqual([]);
    expect(codeUnits([{ name: 'a.md', text: '```\nplain block\n```\n' }])).toEqual([]);
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

  // F21 — the rewrites a copy-paste picks up on its own. Verbatim-only matching
  // missed every one of these on text that is plainly the same sentence.
  it.each([
    ['capitalised', (l: string) => l.toUpperCase()],
    ['doubled spaces', (l: string) => l.replace(/ /g, '  ')],
    ['a newline mid-line', (l: string) => l.replace(' ', '\n')],
    ['leading and trailing space', (l: string) => `   ${l}   `],
  ])('still detects a scoring line that was %s on the way out', (_label, mangle) => {
    const line = scenarios.find((s) => s.id === 'S6')!.scoring[0];
    expect(scanJudgeLeak({ files: [{ name: 'a.md', text: mangle(line) }], scenarios }).clean).toBe(false);
  });

  // …and the honest bound is stated in the result itself, not only in prose.
  it('says what it detects, so nobody reads it as general contamination detection', () => {
    const r = scanJudgeLeak({ files: [], scenarios });
    expect(r.detects).toContain('NOT paraphrase');
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

  // F11/I3 — a flat readdir named 13 of the pack's 93 pages. Every PER-ELEMENT
  // page lives under `elements/`, and those are the ones an attribution is most
  // likely to be about, so the escape hatch was unusable exactly where it is
  // needed and the finding would have to be mis-filed somewhere else.
  it.each([['elements/kai-chat.md'], ['kai-chat.md']])('resolves the per-element page %s, not just the top level', (page) => {
    writeFileSync(
      join(runDir, 'findings.json'),
      findings({
        findings: [
          {
            id: 'x',
            dimension: 'completeness',
            severity: 'cosmetic-or-practice',
            summary: 'x',
            attribution: { kind: 'not-a-catalog-gap', page, quote: 'q' },
          },
        ],
      }),
    );
    const r = run([EVAL, '--run', runDir]);
    expect(r.code, r.out).toBe(0);
  });

  it('the element pages really are nested, so the case above is not trivially true', () => {
    const info = JSON.parse(readFileSync(join(runDir, 'run-info.json'), 'utf8'));
    const top = readdirSync(join(info.packDir, 'agent'), { withFileTypes: true }).filter((e) => e.isFile()).length;
    const nested = readdirSync(join(info.packDir, 'agent', 'elements')).length;
    expect(nested).toBeGreaterThan(top);
  });

  // H5 — the evaluator read the ledger and printed it as fact without checking a
  // single field. A deleted executionPath rendered the literal `undefined` in
  // the bolded execution-path cell, which a cost comparison would trust.
  describe('the ledger is validated on read, not trusted', () => {
    const withLedger = (mutate: (info: Record<string, unknown>) => void): { code: number; out: string } => {
      const path = join(runDir, 'run-info.json');
      const original = readFileSync(path, 'utf8');
      const info = JSON.parse(original) as Record<string, unknown>;
      mutate(info);
      writeFileSync(path, JSON.stringify(info, null, 2));
      writeFileSync(join(runDir, 'findings.json'), findings());
      try {
        return run([EVAL, '--run', runDir]);
      } finally {
        writeFileSync(path, original);
      }
    };

    it.each([
      ['an unknown path label', (i: Record<string, unknown>) => { i.executionPath = 'free-lol'; }, 'not one of'],
      ['a null path', (i: Record<string, unknown>) => { i.executionPath = null; }, 'not one of'],
      ['a DELETED path', (i: Record<string, unknown>) => { delete i.executionPath; }, 'not one of'],
      ['a missing pathSource', (i: Record<string, unknown>) => { delete i.pathSource; }, 'pathSource'],
      ['a missing tier', (i: Record<string, unknown>) => { delete i.tier; }, '`tier` is missing'],
      // R3 — four more fields rendered into the report as fact while unvalidated.
      ['a deleted kitVersion', (i: Record<string, unknown>) => { delete i.kitVersion; }, '`kitVersion` is'],
      ['a deleted routingRule', (i: Record<string, unknown>) => { delete i.routingRule; }, '`routingRule` is'],
      ['a malformed handoverDigest', (i: Record<string, unknown>) => { i.handoverDigest = 'nope'; }, '`handoverDigest` is'],
      ['a deleted handoverDigest', (i: Record<string, unknown>) => { delete i.handoverDigest; }, '`handoverDigest` is'],
      ['a zero handoverFiles', (i: Record<string, unknown>) => { i.handoverFiles = 0; }, '`handoverFiles` is'],
    ])('refuses %s', (_label, mutate, expected) => {
      const r = withLedger(mutate);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(expected);
      // And the bad value never reaches the report as fact.
      expect(r.out).not.toContain('Wrote');
    });

    // The sharpest case: a pairing the ROUTER refuses, presented as history.
    it('refuses a model/path pair the router would never have produced', () => {
      const r = withLedger((i) => {
        i.model = 'claude-opus-5';
        i.executionPath = 'openrouter';
      });
      expect(r.code).not.toBe(0);
      expect(r.out).toContain('a combination the router REFUSES');
      expect(r.out).toContain('anthropic-never-openrouter');
    });

    // POSITIVE CONTROL: the untouched ledger still validates, so the refusals
    // above are about the mutations and not about validation rejecting anything.
    it('accepts the ledger the runner actually wrote', () => {
      writeFileSync(join(runDir, 'findings.json'), findings());
      expect(run([EVAL, '--run', runDir]).code).toBe(0);
    });
  });

  // R1 END TO END — the deck's best answer, measured through the CLI. It was
  // refused outright (exit 1) because its honest findings list is empty and two
  // gates had nothing to examine.
  it('scores a flawless pure-prose refusal a clean 10 with no findings', () => {
    const prose = join(runDir, 'output', 'REFUSAL.md');
    const existing = readdirSync(join(runDir, 'output'));
    for (const f of existing) rmSync(join(runDir, 'output', f), { recursive: true });
    writeFileSync(prose, 'There is no grid element in this kit and I am not going to invent one.\n');
    writeFileSync(
      join(runDir, 'findings.json'),
      JSON.stringify({
        judgedScores: { 'contract-correctness': 10, 'invariant-compliance': 10, 'honesty-bound': 10, completeness: 10 },
        findings: [],
      }),
    );
    const r = run([EVAL, '--run', runDir]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('10.00/10');

    const evaluation = JSON.parse(readFileSync(join(runDir, 'evaluation.json'), 'utf8'));
    expect(evaluation.verdict).toBe('scored');
    expect(evaluation.notApplicable.sort()).toEqual(['audit-clean', 'elements-exist']);

    // ALL FOUR LOUDNESS SIGNALS, each pinned. Deleting the comparability caveat
    // used to leave the suite green, so one of the four had nothing holding it.
    const report = readFileSync(join(runDir, 'REPORT.md'), 'utf8');
    expect(report).toContain('did not apply');
    expect(report).toContain('renormalised');
    expect(report, 'the comparability caveat is unpinned').toContain('only loosely comparable');
    expect(report).toContain('found no code it could read');
    // …and the claim is the honest one, not the old overreach.
    expect(report).not.toContain('the output contains no code');
    rmSync(prose);
  });

  // I4 — a gated failure with no findings rendered "_nothing to change_" beside
  // "Addressable share: 0 — every finding names a catalog change", a sentence
  // vacuously true over zero findings that reads as a clean bill of health.
  it('refuses a failing run that recorded no findings at all', () => {
    writeFileSync(join(runDir, 'output', 'bad.ts'), '<kai-datagrid></kai-datagrid>\n');
    writeFileSync(join(runDir, 'findings.json'), findings({ findings: [] }));
    const r = run([EVAL, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('ZERO findings recorded');
    rmSync(join(runDir, 'output', 'bad.ts'));
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

  // B3 — output-scan.mjs's header used to COUNT the two groups and had them
  // transposed. The counts are gone; this pins the names it now states against
  // the only place the fact lives.
  it('the evaluator runs exactly the gates output-scan.mjs names, and no others', () => {
    const mechanical = DIMENSIONS.filter((d) => d.gate === 'mechanical');
    expect(mechanical.filter((d) => d.runner === 'evaluator').map((d) => d.id).sort()).toEqual(['audit-clean', 'elements-exist']);
    expect(mechanical.filter((d) => d.runner === 'external').map((d) => d.id).sort()).toEqual(['compiles', 'registers', 'streams']);
  });

  it('every mechanical dimension declares who runs it', () => {
    for (const d of DIMENSIONS.filter((x) => x.gate === 'mechanical')) {
      expect(['evaluator', 'external'], `${d.id} declares no runner`).toContain(d.runner);
    }
  });
});
