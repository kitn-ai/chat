/**
 * GUARD — `lint:catalog-drift` still DETECTS, and CI still runs it.
 *
 * The guard itself resolves every authored claim in the composition catalog
 * (element tags, wiring events and properties, invariant ids, `enforcedBy`
 * paths, recipe corpus paths, inventory titles, scenario invariant refs)
 * against the derived layer and the tree. It exists because the authored layer
 * is prose about a tree that keeps moving, which is exactly how the old roster
 * died.
 *
 * This file exists because of HOW that guard would be lost. Not by someone
 * deleting it: by the `--self-test` half dropping off the npm script, by CI
 * dropping the step, or by `check()` degrading into something that returns no
 * errors for any input. All three make CI greener while covering less, and a
 * resolver that resolves nothing looks identical to a clean catalog from
 * outside.
 *
 * So the detection assertions do not trust the script's own self-report. They
 * RUN it, and they drive `check()` with fixtures — a fabricating one that must
 * produce a NAMED error, and a POSITIVE CONTROL that must come back clean. The
 * control is not decoration: an analyzer that threw on every input, or one
 * whose fixtures were malformed, would satisfy the negative assertion alone
 * while detecting nothing, which is the failure mode this branch keeps hitting.
 *
 * Watched failing, each mutation in ISOLATION against a 10-passing baseline:
 *
 *   - dropping the `--self-test` half from the npm script          -> 1 red (the script assertion)
 *   - deleting the CI step                                         -> 1 red (the CI assertion)
 *   - `check()` neutered to `return { errors: [], gaps: [] }`      -> 6 red
 *   - `check()` returning `{ errors: [], gaps }`, gaps preserved   -> 5 red
 *
 * The last two are the pair worth reading. Under the FULL neutering the
 * positive control goes red too, because it also asserts the `kind: 'none'`
 * gap survives — so it is not merely a decorative "did not throw". Under the
 * narrower mutation, which suppresses errors while leaving gaps intact, the
 * control stays GREEN and the four detection cases go red on their own. That is
 * the shape a positive control is supposed to have: it must be capable of
 * passing while the negative cases fail, or it is not a control.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, readLabsTitles as titlesInLint } from '../../scripts/lint-catalog-drift.mjs';
import { readLabsTitles as titlesInSrc } from '../../src/agent-tooling/catalog/labs-titles';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/lint-catalog-drift.mjs';
const NPM_SCRIPT = 'lint:catalog-drift';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/**
 * The body of one top-level job in a GitHub workflow. Same crude extraction as
 * tests/scripts/cdn-pins-guard-wiring.test.ts, for the same reason — the repo
 * carries no YAML parser and the question is answerable from the job's lines.
 */
function jobBlock(yaml: string, job: string): string {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Runs the linter and returns its exit code plus combined output. */
function runLinter(args: string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [resolve(pkgRoot, SCRIPT), ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('the catalog drift guard detects, and CI runs it', () => {
  it('ships the linter', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it('`lint:catalog-drift` runs the self-test half as well as the real resolve', () => {
    expect(pkg.scripts[NPM_SCRIPT]).toBe(
      'node scripts/lint-catalog-drift.mjs --self-test && node scripts/lint-catalog-drift.mjs',
    );
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test');

    // If the extraction ever returns nothing (the job was renamed, the indentation
    // changed), everything below would pass vacuously. Fail here instead.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the `test` job no longer runs the unit project either — read this guard',
    ).toContain('--project=unit');
    expect(
      block,
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. It is the only check that an authored ` +
        `catalog claim still names something real; without it the surface layer rots one ` +
        `renamed story and one fabricated tag at a time.`,
    ).toContain(NPM_SCRIPT);
  });

  it('cannot be neutered by `continue-on-error` or a false `if:`', () => {
    // PRESENT-BUT-INERT is the failure this closes, and the assertion above
    // cannot see it: `continue-on-error: true` turns the guard's refusal into a
    // warning, and `if: false` skips it outright, while the step text stays
    // exactly where the `toContain` is looking. Same idiom as
    // tests/scripts/publish-gate-wiring.test.ts.
    const block = jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test');
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');

    const lines = block.split('\n');
    const start = lines.findIndex((l) => l.includes(NPM_SCRIPT));
    expect(start, `no step running \`${NPM_SCRIPT}\``).toBeGreaterThan(-1);

    // The step is the `- name:` block containing that run line: walk back to the
    // `-` that opens it and forward to the next one.
    const open = lines.slice(0, start + 1).map((l) => /^\s*- /.test(l)).lastIndexOf(true);
    const after = lines.slice(start + 1).findIndex((l) => /^\s*- /.test(l));
    const step = lines.slice(open, after === -1 ? lines.length : start + 1 + after).join('\n');

    expect(step, 'the step extraction returned nothing — everything below would pass vacuously').toContain(NPM_SCRIPT);
    expect(
      step,
      '`continue-on-error` on the catalog drift step turns a hard refusal into a warning, ' +
        'and the job goes green over a catalog whose claims no longer resolve.',
    ).not.toContain('continue-on-error');
    expect(
      step,
      'an `if:` on the catalog drift step can skip it entirely while the step text stays ' +
        'in the workflow for a `toContain` to find.',
    ).not.toMatch(/^\s*if:/m);
  });

  it('its own self-test passes, so the analyzer still detects every seeded defect', () => {
    const { code, output } = runLinter(['--self-test']);
    expect(code, `the self-test exited ${code}:\n${output}`).toBe(0);
    expect(output, 'the self-test reported a case it could not detect').not.toContain('✗');

    // A self-test that ran ZERO cases also prints no `✗` and exits 0. So check
    // the summary agrees with what was actually printed, both counts read off
    // the output rather than restated here — a hand-typed expected count would
    // be the first thing to rot when a case is added.
    const claimed = Number(/all (\d+) cases behaved/.exec(output)?.[1] ?? NaN);
    const observed = (output.match(/^✓ self-test:/gm) ?? []).length;
    expect(claimed, `the self-test printed no summary line:\n${output}`).toBeGreaterThan(0);
    expect(observed, 'the self-test summary claims more cases than it printed').toBe(claimed);
  });

  it('resolves the REAL catalog clean', () => {
    // Not a fixture: the committed catalog. This is what turns the unit suite red
    // when an authored claim stops naming something real, independently of CI.
    const { code, output } = runLinter([]);
    expect(code, `the real catalog does not resolve:\n${output}`).toBe(0);
    expect(output).toContain('resolved clean');
  });
});

/**
 * THE REGISTERED COPY, GUARDED. `readLabsTitles` exists twice — once in
 * scripts/lint-catalog-drift.mjs and once in src/agent-tooling/catalog/
 * labs-titles.ts — because a Node .mjs cannot import a .ts at runtime, and
 * `surfaces.test.ts` lives under `src/`, whose typecheck pass has no `allowJs`,
 * so the .ts side cannot import the .mjs either (measured: TS7016). Both decide
 * whether a `title: 'Labs/…'` is a real registration or just prose, from
 * opposite sides of the same question, so silent divergence would put the two
 * checks back into the state where one DEMANDS a phantom row and the other
 * REFUSES it.
 *
 * ★ WHAT THIS GUARD IS WORTH, stated honestly because the previous round got it
 * wrong. It catches DIVERGENCE. It did NOT catch the bug that mattered: both
 * copies of the earlier hand-rolled comment stripper carried the identical
 * apostrophe defect, so they agreed perfectly while both were wrong. Two
 * implementations of the same mistake agree. What makes agreement meaningful
 * now is that both delegate to the TypeScript parser; this guard is the
 * backstop against drift, never the reason to trust either.
 *
 * This is the only file in the repo that can import both. It is the guard.
 */
describe('the two readLabsTitles implementations cannot diverge', () => {
  const storyFiles = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.stories.tsx')) out.push(full);
      }
    };
    walk(join(pkgRoot, 'src'));
    return out;
  };

  it('agree on every story file in the tree, and the corpus is not inert', () => {
    const files = storyFiles();
    // Non-vacuity: an empty corpus would make the loop below prove nothing.
    expect(files.length, 'no story files found — the walk is broken').toBeGreaterThan(0);

    const results = files.map((f) => {
      const text = readFileSync(f, 'utf-8');
      const name = f.slice(f.lastIndexOf('/') + 1);
      return { f, lint: titlesInLint(text, name), src: titlesInSrc(text, name) };
    });

    // POSITIVE CONTROL, which this test previously lacked entirely: if the
    // readers returned [] for every file, "they agree" would be trivially true
    // and this whole corpus would prove nothing. Require real titles found.
    expect(
      results.filter((r) => r.src.length > 0).length,
      'no story file yielded a Labs title — the readers are inert and agreement is meaningless',
    ).toBeGreaterThan(0);

    const differing = results.filter((r) => JSON.stringify(r.lint) !== JSON.stringify(r.src));
    expect(
      differing.map((r) => r.f.replace(pkgRoot, '')),
      'the lint and src copies of readLabsTitles disagree. They decide the same question ' +
        'from opposite sides; if they drift, one check demands an inventory row the other refuses.',
    ).toEqual([]);
  });

  it('agree on the adversarial inputs the parser exists for', () => {
    const cases = [
      `// title: 'Labs/GHOST'\nconst meta = { title: 'Labs/Real' };`,
      `/* title: 'Labs/GHOST' */\nconst m = { title: 'Labs/Real' };`,
      // ★ THE APOSTROPHE CLASS, which defeated the hand-rolled stripper in three
      // real story files while both copies of it agreed perfectly.
      `const a = <p>Don't have an account?</p>;\n// title: 'Labs/GHOST'\nconst m = { title: 'Labs/Real' };`,
      `const a = <p>Don't panic</p>;\nconst m = { title: 'Labs/Real' };`,
      `const m = { title: "Labs/Real" };`,
      'const m = { title: `Labs/Real` };',
      `const url = 'https://example.com//x';\nconst m = { title: 'Labs/Real' };`,
      "const s = 'it\\'s escaped // still a string';\nconst m = { title: 'Labs/Real' };",
      `const s = 'Labs/NotATitle';`,
      '',
      '/* unterminated block comment',
    ];
    // POSITIVE CONTROL: at least one case must actually yield a title, or "the
    // two agree" is satisfied by two functions that both return nothing.
    expect(
      cases.some((c) => titlesInSrc(c, 'probe.tsx').length > 0),
      'no adversarial case yielded a title — the corpus proves nothing',
    ).toBe(true);
    // And the apostrophe case must specifically NOT leak the commented title.
    const apostrophe = cases[2];
    expect(titlesInSrc(apostrophe, 'probe.tsx'), 'a commented title leaked past an apostrophe').toEqual(['Labs/Real']);

    for (const c of cases) {
      expect(titlesInLint(c, 'probe.tsx'), `disagreement on: ${JSON.stringify(c)}`).toEqual(titlesInSrc(c, 'probe.tsx'));
    }
  });
});

/**
 * Detection, driven directly. `check()` is pure and exported for exactly this:
 * these two cases are a matched pair, and neither means anything alone.
 */
describe('check() observes both presence and absence', () => {
  const derived = {
    elements: [
      {
        tag: 'kai-a',
        props: [{ name: 'value', scalar: true, optional: true, fn: false }],
        events: ['kai-pick'],
        methods: [],
        parts: [],
        composedFrom: [],
        tokens: [],
      },
    ],
    partVariants: ['text', 'reasoning', 'tool', 'source'],
    integrations: [{ id: 'mock', category: 'mock', streamFormat: 'native', keyExposure: 'frontend-safe' }],
    capabilityGroups: [{ id: 'x', components: ['kai-a'] }],
    themeTokens: ['--kai-color-accent'],
    eventExceptions: [],
  };
  const recipe = {
    id: 'r',
    intent: 'i',
    archetypes: ['full-screen'],
    targets: ['bundler'],
    ingredients: ['kai-a'],
    backend: { endpoint: 'consumer-owned', reader: 'readModelStream' },
    wiring: [{ from: 'kai-a', event: 'kai-pick', to: 'kai-a', property: 'value' }],
    invariants: ['inv'],
    corpus: ['README.md'],
  };
  const input = {
    derived,
    invariants: [{ id: 'inv', statement: 's', appliesTo: {}, enforcedBy: { kind: 'none' }, status: 'open' }],
    surfaceRecipes: [recipe],
    inventory: [{ title: 'Command', sort: 'ingredient', note: 'n' }],
    scenarios: [{ id: 'S1', needs: ['invariant:inv'] }],
    partConsumption: [{ tag: 'kai-a', consumes: ['text', 'reasoning', 'tool', 'source'] }],
    labsTitles: ['Command'],
    isFile: (p: string) => p === 'README.md' || p === 'packages/ui/src/wire/read.ts',
    npmScripts: ['lint:silent-drops'],
    wireExports: ['readModelStream'],
  };

  it('POSITIVE CONTROL: a coherent catalog produces no errors', () => {
    // Without this, the case below passes just as well when check() throws on
    // everything or when these fixtures are malformed in some shared way.
    const { errors, gaps } = check(input);
    expect(errors, `a coherent fixture was reported as broken: ${errors.join(' | ')}`).toEqual([]);
    // `kind: 'none'` is a reported GAP, never an error — that distinction is the
    // whole reason invariants can be honest about being unenforced.
    expect(gaps).toHaveLength(1);
  });

  it('names a fabricated element rather than resolving it', () => {
    const { errors } = check({ ...input, surfaceRecipes: [{ ...recipe, ingredients: ['kai-a', 'kai-datagrid'] }] });
    expect(errors.join(' | ')).toContain('ingredient kai-datagrid is not a derived element');
  });

  it('names a wiring edge whose event the element does not dispatch', () => {
    const wiring = [{ from: 'kai-a', event: 'kai-nope', to: 'kai-a', property: 'value' }];
    const { errors } = check({ ...input, surfaceRecipes: [{ ...recipe, wiring }] });
    expect(errors.join(' | ')).toContain('kai-a does not dispatch kai-nope');
  });

  it('names an inventory title that resolves to nothing in the tree', () => {
    const { errors } = check({ ...input, inventory: [{ title: 'Ghost Panel', sort: 'ingredient', note: 'n' }] });
    expect(errors.join(' | ')).toContain('"Ghost Panel" matches no Labs story title');
  });

  it('treats an empty catalog as a failure, not a pass', () => {
    // The vacuity tripwire. Every check in this lint is a loop over an authored
    // list, so an empty one turns the whole run into a green proving nothing.
    const { errors } = check({ ...input, surfaceRecipes: [], inventory: [], partConsumption: [] });
    expect(errors.join(' | ')).toContain('zero surface recipes');
    expect(errors.join(' | ')).toContain('zero inventory entries');
  });
});
