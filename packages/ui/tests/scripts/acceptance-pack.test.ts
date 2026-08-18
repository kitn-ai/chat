import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { listInvariants } from '../../src/agent-tooling/catalog/invariants';
import { listScenarios } from '../../src/agent-tooling/catalog/scenarios';
import { listSurfaceRecipes } from '../../src/agent-tooling/catalog/surfaces';
import { NEEDLES, variantsOf } from '../../scripts/lib/audit-needles.mjs';

const PKG = join(__dirname, '..', '..');
const SCRIPT = join(PKG, 'scripts/acceptance-pack.mjs');
const derived = JSON.parse(readFileSync(join(PKG, 'src/agent-tooling/catalog/derived.json'), 'utf8')) as {
  elements: { tag: string; props: { name: string; scalar: boolean }[]; tokens: string[]; composedFrom: string[] }[];
  partVariants: string[];
  themeTokens: string[];
};
const pkgJson = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
  version: string;
  exports: Record<string, unknown>;
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
      'DELIVERY.md',
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
    expect(catalog.kitVersion).toBe(pkgJson.version);
    expect(readFileSync(join(dir, 'PACK.md'), 'utf8')).toContain(pkgJson.version);
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

  // C1 -- without this page the agent has to invent an import, and S5 (a script
  // tag, no build step) is unanswerable however honest the agent is.
  it('tells the agent how to load the kit: entry points, registration, CDN, React', () => {
    const d = readFileSync(join(agent, 'DELIVERY.md'), 'utf8');

    // Every published entry point is named. Derived from the exports map, so a
    // new key that nobody documents fails here as well as in the script.
    const shown = Object.keys(pkgJson.exports).filter((k) => !k.endsWith('.json'));
    expect(shown.length).toBeGreaterThan(0);
    for (const k of shown) {
      const spec = k === '.' ? '@kitn.ai/ui' : `@kitn.ai/ui${k.slice(1)}`;
      expect(d, `DELIVERY.md does not name ${spec}`).toContain(`\`${spec}\``);
    }

    expect(d).toContain('npm install @kitn.ai/ui');
    expect(d).toContain("import '@kitn.ai/ui/elements';");
    expect(d).toContain('<script type="module">');
    expect(d).toContain("customElements.whenDefined('kai-chat')");
    expect(d).toContain("from '@kitn.ai/ui/react'");

    // The CDN pin is READ from package.json, never typed: a hand-typed literal
    // is what lint:cdn-pins exists to catch, and it would rot at the next release.
    expect(d).toContain(`@kitn.ai/ui@${pkgJson.version}/dist/kai.es.js`);
    expect(d).toMatch(/cdn\.jsdelivr\.net|unpkg\.com/);

    // F-8a-8: the Solid component names must not read as import paths.
    expect(d).toContain('provenance, not import paths');
    const pageText = readAll(join(agent, 'elements'));
    expect(pageText).toContain('(internal — not importable)');
    expect(pageText).toContain('(also exported from `@kitn.ai/ui` for SolidJS)');
  });

  // I3 -- the Task-5 class: recommending an import a consumer cannot reach.
  it('names no import specifier that is not in the exports map', () => {
    const agentText = readAll(agent);
    const keys = new Set(Object.keys(pkgJson.exports));
    const specifiers = [...new Set([...agentText.matchAll(/@kitn\.ai\/ui(?:\/[a-zA-Z0-9._*-]+)*/g)].map((m) => m[0]))];
    expect(specifiers.length).toBeGreaterThan(3);
    for (const spec of specifiers) {
      const sub = spec === '@kitn.ai/ui' ? '.' : `.${spec.slice('@kitn.ai/ui'.length)}`;
      const ok = keys.has(sub) || [...keys].some((k) => k.endsWith('/*') && sub.startsWith(k.slice(0, -1)));
      expect(ok, `${spec} is not in the package exports map`).toBe(true);
    }
    // And the symbols the pack recommends really are exported. `createAssistantStream`
    // is the one review found unchecked; it is asserted by name so a silent
    // regression in the generic scan cannot take it with it.
    expect(agentText).toContain('createAssistantStream');
    expect(readFileSync(join(PKG, 'src/state/index.ts'), 'utf8')).toMatch(/\bcreateAssistantStream\b/);
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

    const readme = readFileSync(join(agent, 'README.md'), 'utf8');
    expect(readme).toMatch(/Open only the\s+element pages you actually need/);
    // A blank "what it is" cell must be labelled as a missing description, not
    // left to read as a judgement about the element.
    expect(index).toMatch(/A blank means \*nobody has\s+written one\*/);
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
    const sample = derived.elements.flatMap((e) => e.props.map((p) => p.name)).find((n) => !universal.includes(n));
    expect(sample).toBeDefined();
    expect(pageText).toContain(`**\`${sample}\`**`);
  });

  // A2 -- the lists must SAY they are complete.
  it('states that the element list and the part-variant list are exhaustive, with counts that match', () => {
    const index = readFileSync(join(agent, 'ELEMENTS.md'), 'utf8');
    expect(index).toContain('EXHAUSTIVE');
    expect(index).toContain(`These ${derived.elements.length} tags`);
    expect(index).toMatch(/If a tag is not on this list, it does\s+not exist/);

    const parts = readFileSync(join(agent, 'PARTS.md'), 'utf8');
    expect(parts).toContain('EXHAUSTIVE');
    expect(parts).toContain(`${derived.partVariants.length} variants and no others`);
    for (const v of derived.partVariants) expect(parts).toContain(`type: '${v}'`);

    // The refusal scenario needs the same statement in the pack it actually
    // gets, not only in S1's.
    const s6 = join(pack('S6'), 'agent');
    expect(readFileSync(join(s6, 'ELEMENTS.md'), 'utf8')).toContain('EXHAUSTIVE');
    expect(readFileSync(join(s6, 'PROMPT.md'), 'utf8')).toMatch(/name what is\s+missing, and stop/);
  });

  // I6 -- a page headed EXHAUSTIVE must not list things that are not tokens,
  // and must not contradict the element pages.
  it('lists only real theme tokens, names the dropped fragments, and agrees with the element pages', () => {
    const theme = readFileSync(join(agent, 'THEME.md'), 'utf8');
    const listed = [...theme.matchAll(/^- `(--[a-z0-9-]+)`$/gm)].map((m) => m[1]);
    expect(listed.length).toBeGreaterThan(0);

    // A prefix fragment is not a token you can set.
    const fragments = derived.themeTokens.filter((t) => t.endsWith('-'));
    expect(fragments.length, 'no fragment in the upstream list; this test would be vacuous').toBeGreaterThan(0);
    for (const f of fragments) expect(listed, `${f} is listed as a settable token`).not.toContain(f);
    // Dropped, not hidden.
    for (const f of fragments) expect(theme, `${f} is dropped without saying so`).toContain(f);
    expect(listed).toHaveLength(derived.themeTokens.length - fragments.length);

    // Every token an element page names must be spelled the way THEME.md
    // spells it, or an agent following the page fails its own self-audit.
    const elementTokens = [...new Set(derived.elements.flatMap((e) => e.tokens))];
    expect(elementTokens.length, 'no element declares a token; this test would be vacuous').toBeGreaterThan(0);
    const pageText = readAll(join(agent, 'elements'));
    for (const t of elementTokens) {
      const prefixed = `--kai-${t.slice(2)}`;
      expect(pageText, `${prefixed} is not on any element page`).toContain(`\`${prefixed}\``);
      expect(listed, `${prefixed} is on an element page but not in THEME.md`).toContain(prefixed);
    }
  });

  // A3 + I7 -- searchable, and machine-checked so no needle fires on correct code.
  it('builds the self-audit out of every pair, with a needle that fires on no right form', () => {
    const audit = readFileSync(join(agent, 'SELF-AUDIT.md'), 'utf8');
    const invariants = listInvariants();
    const examples = invariants.flatMap((inv) => inv.examples);
    expect(examples.length).toBeGreaterThan(0);
    for (const ex of examples) {
      expect(audit.includes(ex.wrong), `self-audit is missing the wrong form: ${ex.wrong}`).toBe(true);
      expect(audit.includes(ex.right), `self-audit is missing the right form: ${ex.wrong}`).toBe(true);
    }
    expect([...audit.matchAll(/^### \d+\. `/gm)]).toHaveLength(examples.length);

    // The needles, re-checked here rather than trusted from the script: one per
    // pair, present in its own wrong form, and firing on NO right form anywhere.
    const allRights = examples.map((ex) => ex.right);
    let checked = 0;
    for (const inv of invariants) {
      for (let i = 0; i < inv.examples.length; i++) {
        const needle = (NEEDLES as Record<string, string>)[`${inv.id}#${i}`];
        expect(needle, `no needle for ${inv.id}#${i}`).toBeDefined();
        expect(inv.examples[i].wrong, `${inv.id}#${i}: needle absent from its own wrong form`).toContain(needle);
        // EVERY quote variant, not just the authored one: quote-agnosticism is a
        // widening, and a widening is how a false positive gets in.
        const variants = (variantsOf as (n: string) => string[])(needle);
        expect(variants.length).toBeGreaterThan(0);
        for (const v of variants) {
          for (const right of allRights) {
            expect(right.includes(v), `${inv.id}#${i}: needle variant ${v} fires on a right form`).toBe(false);
          }
          expect(audit, `${inv.id}#${i}: needle variant ${v} not in the page`).toContain(v);
        }
        // A quoted needle must offer both spellings, or a double-quote formatter
        // silences it on identical code.
        if (needle.includes("'")) {
          expect(variants, `${inv.id}#${i}: no double-quote variant`).toContain(needle.replace(/'/g, '"'));
        }
        checked++;
      }
    }
    expect(checked).toBe(examples.length);

    expect(audit).toContain(`There are ${derived.elements.length} legal tags`);
    expect(audit).toContain(`There are ${derived.partVariants.length}:`);
    expect(audit).toContain('must appear in\n   DELIVERY.md');
  });

  // A4 -- seeded empty, and empty means empty.
  it('seeds the fabricated-components page empty, with an honest explanation and no invented rows', () => {
    const fab = readFileSync(join(agent, 'FABRICATED.md'), 'utf8');
    expect(fab).toContain('No acceptance runs have happened yet');
    const rows = fab.split('\n').filter((l) => l.trim().startsWith('|'));
    expect(rows).toHaveLength(2);
    const tags = [...fab.matchAll(/\bkai-[a-z0-9-]+/g)].map((m) => m[0]);
    const real = new Set(derived.elements.map((e) => e.tag));
    for (const t of tags) expect(real.has(t), `${t} is not a real element`).toBe(true);
  });

  // A5 + I5 -- judge-only data stays out, INCLUDING scoring lines from scenarios
  // other than the one packed. The first version checked S1's lines only, and
  // S2's line was leaking verbatim through an invariant statement in every pack.
  it('keeps enforcedBy pointers, corpus paths and EVERY scenario scoring line out of agent/', () => {
    const judgeOnly = [
      ...listInvariants().flatMap((inv) => {
        const e = inv.enforcedBy;
        // `kind: 'lint'` carries a SCRIPT NAME, not a path, and the invariant's
        // own statement names it verbatim. Rewriting a statement to hide it
        // would create an unpinned copy of authored prose, which is worse than
        // the leak; only paths are checked here, and that limit is deliberate.
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

    const allScoring = listScenarios().flatMap((s) => s.scoring);
    expect(allScoring.length).toBeGreaterThan(listScenarios().length);
    for (const line of allScoring) {
      expect(agentText.includes(line), `a scoring line leaked into agent/: ${line}`).toBe(false);
    }
    // The redaction must be visible where it happened, not silent.
    expect(agentText).toContain('[scoring criterion withheld from this pack]');
    // And S1's own lines must still be in judge/, or the checklist is empty.
    for (const line of listScenarios().find((s) => s.id === 'S1')!.scoring) {
      expect(judgeText.includes(line), `scoring line missing from judge/: ${line}`).toBe(true);
    }
  });

  // A6 -- the floor stage.
  it('executes every invariant right-form before packing, and declares every stand-in', () => {
    const out = execFileSync('node', [SCRIPT, '--floor'], { encoding: 'utf8' });
    const examples = listInvariants().flatMap((inv) => inv.examples);
    expect(out).toContain(`floor clean — ${examples.length} examples executed`);
    for (const inv of listInvariants()) {
      for (let i = 0; i < inv.examples.length; i++) {
        expect(out, `${inv.id}#${i} was not executed`).toContain(`PASS  ${inv.id}#${i}`);
        // I2: nothing here runs against a real registered element, so every row
        // must say what it ran against instead.
        const row = out.split('\n').find((l) => l.includes(`PASS  ${inv.id}#${i}`))!;
        expect(row, `${inv.id}#${i} declares no stand-in`).toContain('[stand-ins:');
      }
    }
    const floorReport = readFileSync(join(judge, 'FLOOR.md'), 'utf8');
    expect(floorReport).toMatch(/no example ran\s+against a real registered/);
    expect(floorReport).toContain('Every row declares at least one stand-in.');
    // The three async-fault routes, and the bound, stated rather than implied.
    expect(floorReport).toContain('DOM event listener');
    expect(floorReport).toMatch(/settles for \*\*\d+ms\*\*/);
    expect(floorReport).toContain('removes the\npack');
    // A4: the symbol check must report its own coverage, including any skip.
    expect(floorReport).toContain('## Import specifiers the pack names');
    for (const sym of ['Chat (react)', 'useKaiChat (react)', 'elementsReady (elements)', 'createAssistantStream (state)']) {
      expect(floorReport, `${sym} is not reported as checked`).toContain(sym);
    }
    expect(floorReport).toMatch(/nothing was skipped|UNCHECKED — read this as a gap/);
    // JUDGE.md must not overclaim either.
    expect(readFileSync(join(judge, 'JUDGE.md'), 'utf8')).toContain('executed against the stand-ins');
  });

  it('the floor stage detects every planted fault, including an empty case list and a late throw', () => {
    // The floor asserts an ABSENCE of failures, which is worth nothing until it
    // has been watched to observe one. `--self-test` plants the faults; this
    // asserts it reported each.
    const out = execFileSync('node', [SCRIPT, '--self-test'], { encoding: 'utf8' });
    for (const expected of [
      'a right form that throws is reported failed',
      'a right form that executes but violates its claim is reported failed',
      'a right form that throws LATE, inside a .then, is reported failed',
      'a throw inside a DOM EVENT LISTENER is reported failed (jsdom hides these in its virtual console)',
      'a fault scheduled BEYOND the per-case drain is reported, and is not blamed on another example',
      'needle check: a needle whose other quote variant fires on a right form is reported',
      'needle check: a needle matches the same mistake spelled with double quotes',
      'an example with no harness is reported, not skipped',
      'a missing harness raises a structural error',
      'a harness with an EMPTY case list is reported, not passed',
      'an empty case list raises a structural error',
      'a dangling harness raises a structural error',
      'a correct right form still passes',
      'needle check: a needle that fires on a right form is reported',
      'needle check: a sound needle is accepted',
    ]) {
      expect(out, `self-test did not report: ${expected}`).toContain(`✓ ${expected}`);
    }
    // I4: the artifact-agreement guard must be bidirectional and per-field.
    for (const expected of [
      'a tag only element-meta.json has',
      'a prop only derived.json has',
      'a prop only element-meta.json has',
      'an event only element-meta.json has',
      'a prop whose type makes it function-valued on one side only',
      'a prop whose scalar flag disagrees',
    ]) {
      expect(out, `self-test did not report artifact agreement for: ${expected}`).toContain(
        `✓ artifact agreement detects ${expected}`,
      );
    }
    expect(out).not.toContain('✗');
  });
});
