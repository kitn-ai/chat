// THE `compiles` GATE, and the third outcome it forced into the contract.
//
// The gate itself needs a real `tsc` over a built `dist/`, and it proves itself
// there: `node scripts/acceptance-gate-compiles.mjs --self-test` plants a fault
// per outcome — including one only `--strict` catches — and watches each fire.
// That is the wrong shape for a unit suite (a temp node_modules tree and six tsc
// passes), so what is pinned HERE is everything around it that a compile is not
// needed to check:
//
//   · the scoring contract for an external gate with no subject, in rubric.mjs;
//   · that a gates.json cannot type its way to that verdict;
//   · the three outcomes as the EVALUATOR sees them, end to end through the CLI;
//   · the gate script's refusals, which all fire before any tsc runs.
//
// The one thing to keep in mind while reading: not-applicable is not a pass and
// not a failure, and BOTH of the wrong answers have already shipped here. Scoring
// a subject-less gate 10 handed out weight nobody earned; scoring it 0 made the
// deck's best answer — a correct prose refusal — score worst and hard-fail.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { listScenarios } from '../../src/agent-tooling/catalog/scenarios';
import { dimension, rubricFor, scoreRun } from '../../scripts/lib/rubric.mjs';
import { planFiles } from '../../scripts/lib/compile-plan.mjs';
import { codeUnits } from '../../scripts/lib/output-scan.mjs';
import { FRAMEWORK_PROJECT } from '../../scripts/lib/consumer-tsc-projects.mjs';

const PKG = join(__dirname, '..', '..');
const GATE = join(PKG, 'scripts/acceptance-gate-compiles.mjs');
const EVAL = join(PKG, 'scripts/acceptance-eval.mjs');
const RUNNER = join(PKG, 'scripts/acceptance-run.mjs');
const scenarios = listScenarios();
const S1 = scenarios.find((s) => s.id === 'S1')!;

const run = (args: string[]): { code: number; out: string } => {
  try {
    return { code: 0, out: execFileSync('node', args, { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

/** Every judged dimension of a scenario, at one score. */
const judgeAll = (scenarioId: string, score: number) => {
  const s = scenarios.find((x) => x.id === scenarioId)!;
  return Object.fromEntries(rubricFor(s).dimensions.filter((d) => d.gate === 'judged').map((d) => [d.id, score]));
};
/**
 * Every mechanical dimension of a scenario, passing, with named overrides.
 *
 * The cast is deliberate and it is the point of several tests below: the shapes
 * being fed in are the INVALID ones — `adjudicated: 1`, a string where a boolean
 * belongs — and the whole question is whether `scoreRun` refuses them at
 * runtime. These scripts are in no tsconfig program with `checkJs`, so a JSDoc
 * type is documentation; nothing was checking it, which is how `"false"` scored
 * a perfect 10 twice.
 */
const gateAll = (scenarioId: string, over: Record<string, unknown> = {}) => {
  const s = scenarios.find((x) => x.id === scenarioId)!;
  return {
    ...Object.fromEntries(rubricFor(s).dimensions.filter((d) => d.gate === 'mechanical').map((d) => [d.id, { passed: true }])),
    ...over,
  } as Record<string, { passed: boolean }>;
};

// ---------------------------------------------------------------------------

describe('the `compiles` dimension is declared as an external mechanical gate', () => {
  it('is mechanical, external, and does not apply to every scenario', () => {
    const d = dimension('compiles')!;
    expect(d.gate).toBe('mechanical');
    expect(d.runner).toBe('external');
    expect(d.alwaysApplies).toBe(false);
  });

  // The gate script refuses a scenario that does not claim it, so this list is
  // the one it prints. Derived from the rubric on both sides.
  it('applies to exactly the scenarios whose scoring lines mention compiling', () => {
    const applies = scenarios.filter((s) => rubricFor(s).dimensions.some((d) => d.id === 'compiles')).map((s) => s.id);
    expect(applies).toEqual(['S1', 'S2', 'S4']);
    for (const id of applies) {
      expect(scenarios.find((s) => s.id === id)!.scoring.some((line) => /compile/i.test(line))).toBe(true);
    }
  });
});

describe('an external gate with no subject — the third outcome', () => {
  // UNCHANGED, and it must stay that way: a runner asserting its own vacuity is
  // how a real S1 run WITH code scored 10.00/10 on three gates that claimed to
  // have found nothing.
  it('still refuses `vacuous` asserted by the external runner itself', () => {
    expect(() =>
      scoreRun({ scenario: S1, gates: gateAll('S1', { compiles: { passed: false, vacuous: true } }), judged: judgeAll('S1', 10) }),
    ).toThrow(/EXTERNAL gate and reported/);
  });

  // NEW, and it is the whole point: an answer that is prose by design has no
  // subject for `compiles` either. The verdict belongs to whoever LOOKED at the
  // output, which is the evaluator, and it is stamped as such.
  it('accepts it once the EVALUATOR has adjudicated, and takes the dimension out of the score', () => {
    const r = scoreRun({
      scenario: S1,
      gates: gateAll('S1', {
        compiles: { passed: false, vacuous: true, adjudicated: 'evaluator', filesSeen: 1, filesScanned: 0, unread: [] },
      }),
      judged: judgeAll('S1', 10),
    });
    expect(r.notApplicable).toContain('compiles');
    expect(r.verdict).toBe('scored');
    expect(r.failedGates).not.toContain('compiles');
    const row = r.rows.find((x) => x.id === 'compiles')!;
    expect(row.applicable).toBe(false);
    expect(row.score).toBeNull();
    // Out of the denominator, not zeroed inside it.
    expect(r.totalWeight).toBeLessThan(r.declaredWeight);
    // And the row says WHOSE scan established it. The gate did not look.
    expect(row.source).toContain("the evaluator's own scan");
    expect(row.source).toContain('this external gate had no subject');
  });

  // Absence of SUBJECT is not absence of MERIT. This is the regression that made
  // a correct refusal the worst-scoring answer in the deck.
  it('lets an otherwise perfect answer reach 10 rather than hard-failing it', () => {
    const r = scoreRun({
      scenario: S1,
      gates: {
        'elements-exist': { passed: true, vacuous: true, filesSeen: 1, unread: [] },
        'audit-clean': { passed: true, vacuous: true, filesSeen: 1, unread: [] },
        compiles: { passed: false, vacuous: true, adjudicated: 'evaluator', filesSeen: 1, filesScanned: 0, unread: [] },
        registers: { passed: false, vacuous: true, adjudicated: 'evaluator', filesSeen: 1, filesScanned: 0, unread: [] },
      },
      judged: judgeAll('S1', 10),
    });
    expect(r.normalized).toBe(10);
    expect(r.verdict).toBe('scored');
  });

  // H1's rule applied to the third field on this object, because the first two
  // were both defeated by a truthy string that read as its own opposite.
  it.each([[true], ['true'], [1], [{}], [[]], ['Evaluator'], ['evaluator ']])(
    'refuses an `adjudicated` of %o rather than reading it as truthy',
    (adjudicated) => {
      expect(() =>
        scoreRun({
          scenario: S1,
          gates: gateAll('S1', { compiles: { passed: false, vacuous: true, adjudicated } }),
          judged: judgeAll('S1', 10),
        }),
      ).toThrow(/adjudicated/);
    },
  );

  it('still refuses the adjudicated absence while a file in the output went unread', () => {
    expect(() =>
      scoreRun({
        scenario: S1,
        gates: gateAll('S1', {
          compiles: { passed: false, vacuous: true, adjudicated: 'evaluator', filesSeen: 2, filesScanned: 0, unread: ['main.txt'] },
        }),
        judged: judgeAll('S1', 10),
      }),
    ).toThrow(/cannot read/);
  });

  // A gate that RAN and failed is still a gated failure. The new branch must not
  // have widened into "external gates can excuse themselves".
  it('still fails a gate that had a subject and did not compile', () => {
    const r = scoreRun({
      scenario: S1,
      gates: gateAll('S1', { compiles: { passed: false, detail: 'TS2345' } }),
      judged: judgeAll('S1', 10),
    });
    expect(r.verdict).toBe('gated-fail');
    expect(r.failedGates).toContain('compiles');
    expect(r.notApplicable).toEqual([]);
  });
});

describe('what the gate plans to compile', () => {
  const plan = (name: string, text: string) => planFiles(codeUnits([{ name, text }]));

  it('takes a .ts file and a ```ts fence in markdown, so a prose-shaped answer is measured', () => {
    expect(plan('src/main.ts', 'export const a = 1;\n').files).toHaveLength(1);
    expect(plan('ANSWER.md', '```ts\nexport const a = 1;\n```\n').files).toHaveLength(1);
  });

  it('lifts a .vue <script> rather than handing tsc a file it cannot read', () => {
    const { files } = plan('App.vue', '<template><p>x</p></template>\n<script setup lang="ts">\nconst a: number = 1;\n</script>\n');
    expect(files).toHaveLength(1);
    expect(files[0].lifted).toBe(true);
    expect(files[0].text).toContain('const a: number = 1;');
  });

  // NOT a silent drop. A stock consumer tsconfig has no `allowJs`, so tsc would
  // read a .js file as nothing at all — and the silence would score as a pass.
  it('reports JavaScript as unreadable-by-tsc instead of dropping it or calling it "no code"', () => {
    const { files, skipped } = plan('main.js', 'export const a = 1;\n');
    expect(files).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].why).toMatch(/allowJs/);
  });

  it('reports a template-only component rather than counting it as compiled', () => {
    const { files, skipped } = plan('App.vue', '<template><p>x</p></template>\n');
    expect(files).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  // The framework axis is the projects', not a list here.
  it('names a tsc project for every framework the gate accepts', () => {
    expect(Object.keys(FRAMEWORK_PROJECT).length).toBeGreaterThan(0);
    for (const [framework, project] of Object.entries(FRAMEWORK_PROJECT)) {
      expect(['default', 'angular', 'solid'], `${framework} compiles under ${project}`).toContain(project);
    }
  });
});

describe('the gate script refuses before it compiles anything', () => {
  let runDir = '';

  beforeAll(() => {
    const runs = mkdtempSync(join(tmpdir(), 'gate-compiles-'));
    const r = run([RUNNER, '--scenario', 'S1', '--model', 'claude-opus-5', '--tier', 'frontier', '--runs-dir', runs]);
    expect(r.code, r.out).toBe(0);
    runDir = join(runs, readdirSync(runs)[0]);
    mkdirSync(join(runDir, 'output'), { recursive: true });
  });

  it('refuses to guess the framework', () => {
    const r = run([GATE, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('--framework is required');
    // The reason matters: .tsx is react OR solid, and those are different tsconfigs.
    expect(r.out).toContain('react or solid');
  });

  it('refuses a framework the consumer projects do not cover', () => {
    const r = run([GATE, '--run', runDir, '--framework', 'preact']);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('is not a framework this kit compiles for');
  });

  it('refuses a directory that is not a prepared run', () => {
    const r = run([GATE, '--run', join(tmpdir(), 'definitely-not-a-run'), '--framework', 'react']);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('no run-info.json');
  });

  it('refuses a scenario the dimension does not apply to, naming the ones it does', () => {
    const runs = mkdtempSync(join(tmpdir(), 'gate-compiles-s6-'));
    expect(run([RUNNER, '--scenario', 'S6', '--model', 'claude-opus-5', '--tier', 'frontier', '--runs-dir', runs]).code).toBe(0);
    const s6 = join(runs, readdirSync(runs)[0]);
    const r = run([GATE, '--run', s6, '--framework', 'react']);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('does not apply to S6');
    expect(r.out).toContain('S1, S2, S4');
  });
});

describe('the evaluator adjudicates the absence, and refuses every attempt to type it', () => {
  let runDir = '';
  const findings = () =>
    JSON.stringify({
      judgedScores: Object.fromEntries(Object.entries(judgeAll('S1', 9))),
      findings: [],
    });

  beforeAll(() => {
    const runs = mkdtempSync(join(tmpdir(), 'gate-compiles-eval-'));
    const r = run([RUNNER, '--scenario', 'S1', '--model', 'claude-opus-5', '--tier', 'frontier', '--runs-dir', runs]);
    expect(r.code, r.out).toBe(0);
    runDir = join(runs, readdirSync(runs)[0]);
    mkdirSync(join(runDir, 'output'), { recursive: true });
    writeFileSync(join(runDir, 'findings.json'), findings());
  });

  const withOutput = (files: Record<string, string>) => {
    const dir = join(runDir, 'output');
    for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true, force: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  };
  const withGates = (gates: unknown) => {
    const p = join(runDir, 'gates.json');
    if (gates === null) rmSync(p, { force: true });
    else writeFileSync(p, JSON.stringify(gates, null, 2));
  };

  // OUTCOME 3, end to end and with NOTHING supplied. This is the case the old
  // contract could not express: it used to be a hard error naming a missing gate.
  it('scores a prose-only answer with compiles NOT APPLICABLE, not 0 and not an error', () => {
    withOutput({ 'ANSWER.md': 'There is no such element in this kit, and I am not going to invent one.\n' });
    withGates(null);
    const r = run([EVAL, '--run', runDir]);
    expect(r.code, r.out).toBe(0);
    const report = readFileSync(join(runDir, 'REPORT.md'), 'utf8');
    expect(report).toContain('dimension(s) did not apply');
    expect(report).toContain('compiles');
    expect(report).not.toContain('Gated failure');
    const evaluation = JSON.parse(readFileSync(join(runDir, 'evaluation.json'), 'utf8')) as {
      notApplicable: string[];
      verdict: string;
      rows: { id: string; score: number | null; source: string }[];
    };
    expect(evaluation.notApplicable).toContain('compiles');
    expect(evaluation.verdict).toBe('scored');
    const row = evaluation.rows.find((x) => x.id === 'compiles')!;
    expect(row.score).toBeNull();
    expect(row.source).toContain("the evaluator's own scan");
  });

  // The other half of that: the adjudication is a claim about the OUTPUT, so it
  // may not be made while a file in the output went unread.
  it('does NOT adjudicate an absence when a file went unread — that is still a missing gate', () => {
    withOutput({ 'main.txt': 'const a: number = 1;\n' });
    withGates(null);
    const r = run([EVAL, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('has no gate result');
  });

  it('refuses a supplied verdict that claims to have compiled an output with no code in it', () => {
    withOutput({ 'ANSWER.md': 'No code here.\n' });
    withGates({ compiles: { passed: true, detail: 'trust me' }, registers: { passed: true } });
    const r = run([EVAL, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('found no code it could read');
  });

  it.each([[true], ['true'], ['evaluator']])('refuses a gates file that types `adjudicated: %o` itself', (adjudicated) => {
    withOutput({ 'main.ts': "const chat = document.querySelector('kai-chat');\nvoid chat;\n" });
    withGates({ compiles: { passed: true, adjudicated }, registers: { passed: true } });
    const r = run([EVAL, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('not an operator');
  });

  // THE MEASURED REGRESSION, through the CLI. Real code in the output, three
  // external gates claiming there was nothing to look at.
  it('refuses a self-declared `vacuous` from a gates file over an output that HAS code', () => {
    withOutput({ 'main.ts': "const chat = document.querySelector('kai-chat');\nvoid chat;\n" });
    withGates({ compiles: { passed: false, vacuous: true }, registers: { passed: false, vacuous: true } });
    const r = run([EVAL, '--run', runDir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('EXTERNAL gate and reported');
  });

  // POSITIVE CONTROL for the block above: with code present and honest verdicts,
  // the same run scores. Without this, every refusal above could be the CLI
  // refusing everything.
  it('scores the same run when the gates are honestly supplied', () => {
    withOutput({ 'main.ts': "const chat = document.querySelector('kai-chat');\nvoid chat;\n" });
    withGates({ compiles: { passed: true, detail: 'tsc clean' }, registers: { passed: true, detail: 'upgraded' } });
    const r = run([EVAL, '--run', runDir]);
    expect(r.code, r.out).toBe(0);
    const evaluation = JSON.parse(readFileSync(join(runDir, 'evaluation.json'), 'utf8')) as { notApplicable: string[]; rows: { id: string; score: number }[] };
    expect(evaluation.notApplicable).toEqual([]);
    expect(evaluation.rows.find((x) => x.id === 'compiles')!.score).toBe(10);
  });

  it('is still a gated failure when the gate ran and the code did not compile', () => {
    withOutput({ 'main.ts': "const chat = document.querySelector('kai-chat');\nvoid chat;\n" });
    withGates({ compiles: { passed: false, detail: 'TS2345' }, registers: { passed: true } });
    writeFileSync(
      join(runDir, 'findings.json'),
      JSON.stringify({
        judgedScores: judgeAll('S1', 9),
        findings: [
          {
            id: 'F1',
            dimension: 'compiles',
            severity: 'does-not-render',
            summary: 'does not build',
            attribution: { kind: 'not-a-catalog-gap', page: 'INVARIANTS.md', quote: 'q' },
          },
        ],
      }),
    );
    const r = run([EVAL, '--run', runDir]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('gated-fail');
    writeFileSync(join(runDir, 'findings.json'), findings());
  });
});

describe('the gate is wired where an operator will find it', () => {
  it('ships as a package script', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['gate:compiles']).toContain('acceptance-gate-compiles.mjs');
    expect(pkg.scripts['gate:compiles:self-test']).toContain('--self-test');
  });

  it('the evaluator points at it when the scenario needs it', () => {
    expect(existsSync(GATE)).toBe(true);
    expect(readFileSync(EVAL, 'utf8')).toContain('acceptance-gate-compiles.mjs');
  });
});
