import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { listInvariants } from '../../src/agent-tooling/catalog/invariants';
import { listScenarios } from '../../src/agent-tooling/catalog/scenarios';
import { listSurfaceRecipes } from '../../src/agent-tooling/catalog/surfaces';

const PKG = join(__dirname, '..', '..');
const SCRIPT = join(PKG, 'scripts/acceptance-pack.mjs');
const derived = JSON.parse(readFileSync(join(PKG, 'src/agent-tooling/catalog/derived.json'), 'utf8')) as {
  elements: { tag: string; props: { name: string; scalar: boolean }[] }[];
  partVariants: string[];
  themeTokens: string[];
};

const pack = (id: string): string => {
  // Nested, and deliberately not pre-created: the script must mkdir the whole
  // path. A test that hands it a directory that already exists never exercises
  // that, and `--out` is the one argument a runner will point somewhere new.
  const dir = join(mkdtempSync(join(tmpdir(), 'pack-')), 'nested');
  execFileSync('node', [SCRIPT, '--scenario', id, '--out', dir], { encoding: 'utf8' });
  return dir;
};

/** Every file under `root`, recursively. */
function filesUnder(root: string, predicate: (name: string) => boolean = () => true): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (predicate(e.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

const readAll = (root: string): string => filesUnder(root).map((f) => readFileSync(f, 'utf8')).join('\n');

describe('acceptance pack', () => {
  let dir: string;
  let agent: string;
  let judge: string;

  beforeAll(() => {
    dir = pack('S1');
    agent = join(dir, 'agent');
    judge = join(dir, 'judge');
  });

  it('--list prints every authored scenario', () => {
    const out = execFileSync('node', [SCRIPT, '--list'], { encoding: 'utf8' });
    const ids = listScenarios().map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(out).toContain(id);
    // Non-vacuity in the other direction: a truncated deck would still satisfy
    // the loop above, so pin the printed line count to the authored count.
    expect(out.trim().split('\n')).toHaveLength(ids.length);
  });

  it('packs into agent/ and judge/, stamped with the kit version', () => {
    expect(existsSync(join(dir, 'PACK.md'))).toBe(true);
    for (const f of [
      'README.md',
      'PROMPT.md',
      'ELEMENTS.md',
      'SHARED-PROPS.md',
      'INVARIANTS.md',
      'SELF-AUDIT.md',
      'RECIPES.md',
      'PARTS.md',
      'INTEGRATIONS.md',
      'THEME.md',
      'INVENTORY.md',
      'FABRICATED.md',
    ]) {
      expect(existsSync(join(agent, f)), `agent/${f} missing`).toBe(true);
    }
    for (const f of ['JUDGE.md', 'FLOOR.md', 'catalog.json']) {
      expect(existsSync(join(judge, f)), `judge/${f} missing`).toBe(true);
    }

    const s1 = listScenarios().find((s) => s.id === 'S1')!;
    expect(readFileSync(join(agent, 'PROMPT.md'), 'utf8')).toContain(s1.prompt);

    const catalog = JSON.parse(readFileSync(join(judge, 'catalog.json'), 'utf8'));
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
    expect(catalog.kitVersion).toBe(pkg.version);
    expect(readFileSync(join(dir, 'PACK.md'), 'utf8')).toContain(pkg.version);
    expect(catalog.derived.elements.length).toBe(derived.elements.length);
    expect(catalog.invariants.length).toBe(listInvariants().length);
  });

  it('no kit source travels, and the scan that says so can actually detect one', () => {
    // Recursive, because a flat readdir of a directory the script writes fixed
    // filenames into is a check that cannot fail.
    const isSource = (name: string) => /\.(ts|tsx|js|jsx|mjs|css)$/.test(name);
    expect(filesUnder(dir, isSource)).toEqual([]);

    // POSITIVE CONTROL: plant one nested source file and prove the scan sees it.
    mkdirSync(join(dir, 'deep', 'deeper'), { recursive: true });
    writeFileSync(join(dir, 'deep', 'deeper', 'chat.tsx'), 'export const x = 1;\n');
    expect(filesUnder(dir, isSource)).toHaveLength(1);
  });

  it('refuses an unknown scenario id, before writing anything', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pack-'));
    expect(() => execFileSync('node', [SCRIPT, '--scenario', 'S99', '--out', empty], { stdio: 'pipe' })).toThrow();
    expect(readdirSync(empty)).toEqual([]);
  });

  // A1 -- the pack is navigable markdown, not one blob.
  it('renders one page per element, and the index links exactly those pages', () => {
    const pages = readdirSync(join(agent, 'elements'));
    expect(pages.length).toBe(derived.elements.length);
    expect(pages.length).toBeGreaterThan(0);

    const index = readFileSync(join(agent, 'ELEMENTS.md'), 'utf8');
    const linked = [...index.matchAll(/\]\(elements\/([a-z0-9-]+)\.md\)/g)].map((m) => m[1]).sort();
    // BOTH directions. A one-way check passes on an index that links half the
    // pages, and also on an index that links pages which do not exist.
    expect(linked).toEqual(derived.elements.map((e) => e.tag).sort());
    expect(pages.sort()).toEqual(derived.elements.map((e) => `${e.tag}.md`).sort());

    // The index has to say "read me first and open only what you need", or an
    // agent reads all 80 pages and the split bought nothing.
    const readme = readFileSync(join(agent, 'README.md'), 'utf8');
    expect(readme).toMatch(/Open only the\s+element pages you actually need/);
  });

  // A1 -- the universal props are factored out once.
  it('factors the universal props out of every element page, and the absence is observable', () => {
    const meta = JSON.parse(readFileSync(join(PKG, 'src/elements/element-meta.json'), 'utf8')) as {
      tag: string;
      props: { name: string; universal?: boolean }[];
    }[];
    const universal = [...new Set(meta.flatMap((m) => (m.props ?? []).filter((p) => p.universal).map((p) => p.name)))];
    expect(universal.length).toBeGreaterThan(0);

    const shared = readFileSync(join(agent, 'SHARED-PROPS.md'), 'utf8');
    for (const name of universal) expect(shared).toContain(`**\`${name}\`**`);

    const pageText = readAll(join(agent, 'elements'));
    for (const name of universal) {
      expect(pageText.includes(`**\`${name}\`**`), `${name} is repeated on an element page`).toBe(false);
    }

    // POSITIVE CONTROL, and this is the whole point: "the string is absent" is
    // vacuous until the same scan is shown finding a prop that SHOULD be there.
    // Derived, not typed -- the first non-universal prop of the first element
    // that has one.
    const sample = derived.elements
      .flatMap((e) => e.props.map((p) => p.name))
      .find((n) => !universal.includes(n));
    expect(sample).toBeDefined();
    expect(pageText).toContain(`**\`${sample}\`**`);
  });

  // A2 -- the lists must SAY they are complete, or S6's refusal bound has
  // nothing to stand on.
  it('states that the element list and the part-variant list are exhaustive, with counts that match', () => {
    const index = readFileSync(join(agent, 'ELEMENTS.md'), 'utf8');
    expect(index).toContain('EXHAUSTIVE');
    expect(index).toContain(`These ${derived.elements.length} tags`);
    expect(index).toMatch(/If a tag is not on this list, it does\s+not exist/);

    const parts = readFileSync(join(agent, 'PARTS.md'), 'utf8');
    expect(parts).toContain('EXHAUSTIVE');
    expect(parts).toContain(`${derived.partVariants.length} variants and no others`);
    for (const v of derived.partVariants) expect(parts).toContain(`type: '${v}'`);

    const theme = readFileSync(join(agent, 'THEME.md'), 'utf8');
    expect(theme).toContain(`These ${derived.themeTokens.length} CSS custom`);

    // The refusal scenario needs the same statement in the pack it actually
    // gets, not only in S1's.
    const s6 = join(pack('S6'), 'agent');
    expect(readFileSync(join(s6, 'ELEMENTS.md'), 'utf8')).toContain('EXHAUSTIVE');
    expect(readFileSync(join(s6, 'PROMPT.md'), 'utf8')).toMatch(/name what is\s+missing, and stop/);
  });

  // A3 -- the self-audit is mechanically searchable, derived from the pairs.
  it('builds the self-audit out of every wrong/right pair', () => {
    const audit = readFileSync(join(agent, 'SELF-AUDIT.md'), 'utf8');
    const examples = listInvariants().flatMap((inv) => inv.examples);
    expect(examples.length).toBeGreaterThan(0);
    for (const ex of examples) {
      expect(audit.includes(ex.wrong), `self-audit is missing the wrong form: ${ex.wrong}`).toBe(true);
      expect(audit.includes(ex.right), `self-audit is missing the right form: ${ex.wrong}`).toBe(true);
    }
    // One numbered item per pair, no more and no fewer.
    expect([...audit.matchAll(/^### \d+\. `/gm)]).toHaveLength(examples.length);
    // The derived checks name the real counts, so a stale figure fails here
    // rather than misleading an agent.
    expect(audit).toContain(`There are ${derived.elements.length} legal tags`);
    expect(audit).toContain(`There are ${derived.partVariants.length}:`);
  });

  // A4 -- seeded empty, and empty means empty.
  it('seeds the fabricated-components page empty, with an honest explanation and no invented rows', () => {
    const fab = readFileSync(join(agent, 'FABRICATED.md'), 'utf8');
    expect(fab).toContain('No acceptance runs have happened yet');
    // The table header and separator, and nothing after them: any further row
    // would be an entry nobody measured.
    const rows = fab.split('\n').filter((l) => l.trim().startsWith('|'));
    expect(rows).toHaveLength(2);
    // And no `kai-` tag anywhere on the page that is not a real element.
    const tags = [...fab.matchAll(/\bkai-[a-z0-9-]+/g)].map((m) => m[0]);
    const real = new Set(derived.elements.map((e) => e.tag));
    for (const t of tags) expect(real.has(t), `${t} is not a real element`).toBe(true);
  });

  // A5 -- judge-only data stays out of the agent's surface.
  it('keeps enforcedBy pointers and recipe corpus paths out of agent/, and the scan proves it can see them', () => {
    const judgeOnly = [
      ...listInvariants().flatMap((inv) => {
        const e = inv.enforcedBy;
        // `kind: 'lint'` carries a SCRIPT NAME, not a path, and the invariant's
        // own statement names it verbatim ("enforced by lint:silent-drops in
        // CI"). Rewriting a statement to hide it would create an unpinned copy
        // of authored prose, which is worse than the leak; only paths are
        // checked here, and that limit is deliberate.
        if (e.kind === 'test') return e.paths;
        if (e.kind === 'structural') return [e.path];
        return [];
      }),
      ...listSurfaceRecipes().flatMap((r) => r.corpus),
    ];
    expect(judgeOnly.length).toBeGreaterThan(0);

    const agentText = readAll(agent);
    const judgeText = readAll(judge);
    for (const p of judgeOnly) {
      // POSITIVE CONTROL FIRST: if the string is not in judge/ either, then
      // "absent from agent/" is measuring nothing.
      expect(judgeText.includes(p), `${p} is in neither directory; the absence check is vacuous`).toBe(true);
      expect(agentText.includes(p), `${p} leaked into the agent's surface`).toBe(false);
    }

    // The scoring checklist is an answer key. Same shape of check.
    for (const line of listScenarios().find((s) => s.id === 'S1')!.scoring) {
      expect(judgeText.includes(line), `scoring line missing from judge/: ${line}`).toBe(true);
      expect(agentText.includes(line), `scoring line leaked into agent/: ${line}`).toBe(false);
    }
  });

  // A6 -- the floor stage.
  it('executes every invariant right-form before packing, and reports the stand-ins', () => {
    const out = execFileSync('node', [SCRIPT, '--floor'], { encoding: 'utf8' });
    const examples = listInvariants().flatMap((inv) => inv.examples);
    expect(out).toContain(`floor clean — ${examples.length} examples executed`);
    for (const inv of listInvariants()) {
      for (let i = 0; i < inv.examples.length; i++) {
        expect(out, `${inv.id}#${i} was not executed`).toContain(`PASS  ${inv.id}#${i}`);
      }
    }
    // Honesty about stubs travels into the pack rather than being swallowed.
    const floorReport = readFileSync(join(judge, 'FLOOR.md'), 'utf8');
    expect(floorReport).toContain('stubbed:');
    expect(floorReport).toContain('could not be executed against the real thing');
  });

  it('the floor stage detects a broken example, a silently-wrong one and a missing harness', () => {
    // The floor asserts an ABSENCE of failures, which is worth nothing until it
    // has been watched to observe one. `--self-test` plants four faults and one
    // control; this asserts it reported all five.
    const out = execFileSync('node', [SCRIPT, '--self-test'], { encoding: 'utf8' });
    for (const expected of [
      'a right form that throws is reported failed',
      'a right form that executes but violates its claim is reported failed',
      'an example with no harness is reported, not skipped',
      'a missing harness raises a structural error',
      'a dangling harness raises a structural error',
      'a correct right form still passes',
    ]) {
      expect(out, `self-test did not report: ${expected}`).toContain(`✓ ${expected}`);
    }
    expect(out).not.toContain('✗');
  });
});
