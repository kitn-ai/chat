/**
 * GUARD — every imperative method an element exposes must be RENDERED in the
 * documentation artifacts, not merely be callable.
 *
 * `element-methods-typed.test.ts` proves the exposed methods reach the generated
 * TYPES. That left them discoverable only by reading source: the generators wrote
 * props and events into `llms-full.txt`, `docs/web-components.md` and the `kai`
 * MCP's `component_reference`, and dropped `el.methods` on the floor in all three.
 * A promised `kai-resizable.maximize()` that no artifact mentions is worse than one
 * that was never typed.
 *
 * WHY THIS IS NOT A PRESENCE CHECK
 * --------------------------------
 * "some methods rendered" and "all of them rendered" are different facts and only
 * the second is the deliverable, so every artifact is checked with SET EQUALITY per
 * element against `element-meta.json` — the same model the generators consume —
 * and then against the total. Nothing here restates a count: bump the model and
 * the expectation moves with it. A generator that renders one element's methods,
 * or renders a method under the wrong element, fails.
 *
 * The floors below (>30 elements, >100 methods) exist because every loop in this
 * file iterates the model: a model that collapsed to two methods would make the
 * whole file pass while covering nothing.
 *
 * AND WHY THAT WAS STILL NOT ENOUGH
 * ---------------------------------
 * Every check described above runs OVER THE MODEL, so none of them can see a method
 * the extractor never put in it. `gen-element-api.mjs` read only
 * `PropertyAssignment` members out of `expose({ … })`, so the three written in
 * SHORTHAND form (`expose({ clear })`) entered nothing: `kai-search.clear`,
 * `kai-editable-label.commit` and `kai-editable-label.cancel` were callable, unit
 * tested, and present in zero artifacts. Not blank rows, INVISIBLE ones, which is
 * why the no-doc-comment guard below was green the whole time. The reported total
 * was 128 and the true one 131.
 *
 * The first describe block therefore re-derives the method set FROM THE FACADE
 * SOURCES, with its own parse, and holds the model to it. That is the only check
 * here that can fail when the extractor drops something on the floor.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '..', '..');

interface MethodMeta {
  name: string;
  params: string;
  returns: string;
  description: string;
}
interface ElementMeta {
  tag: string;
  methods?: MethodMeta[];
}

const meta: ElementMeta[] = JSON.parse(
  readFileSync(resolve(pkgRoot, 'src/elements/element-meta.json'), 'utf8'),
);
const withMethods = meta.filter((e) => e.methods?.length);
const TOTAL_METHODS = withMethods.reduce((n, e) => n + e.methods!.length, 0);

/** Names the model says this element exposes, sorted. */
const expectedFor = (el: ElementMeta) => [...el.methods!.map((m) => m.name)].sort();

// ─────────────────────────────────────────────────────────────────────────────
// The model itself, re-derived from source.
//
// An INDEPENDENT parse of the facades — deliberately not the generator's, and
// deliberately not `element-meta.json` — so "the extractor missed a member" is
// something a check can actually see. Both numbers below are derived: the helper's
// method names come from parsing the helper, not from a literal 3, and the totals
// come from counting, not from a literal 131.
// ─────────────────────────────────────────────────────────────────────────────

const ELEMENTS_DIR = resolve(pkgRoot, 'src/elements');
/** Same file set the generator walks (see gen-element-api.mjs). */
const SKIP = new Set(['define.tsx', 'register.ts', 'register-impl.ts', 'css.ts', 'chat-types.ts', 'default-input.tsx']);
const facadeFiles = readdirSync(ELEMENTS_DIR)
  .filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.endsWith('.stories.tsx') && !SKIP.has(f))
  .map((f) => resolve(ELEMENTS_DIR, f));

const parse = (file: string) =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

/** Every member name in every `expose({ … })` literal under `scope`, WHATEVER form
 *  it was written in. A spread would mean members this parse cannot name, so it is
 *  a hard failure rather than a silent skip. */
function exposedNames(scope: ts.Node): string[] {
  const names: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'expose' &&
      n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])
    ) {
      for (const p of (n.arguments[0] as ts.ObjectLiteralExpression).properties) {
        if (ts.isSpreadAssignment(p)) throw new Error(`expose({ ...spread }) cannot be counted: ${p.getText()}`);
        names.push((p.name as ts.Identifier | ts.StringLiteral).text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return names;
}

/** The names `wireDisclosure()` contributes, read off the helper's own expose
 *  literal so this never restates them. */
const HELPER_NAMES: Record<string, string[]> = {
  wireDisclosure: exposedNames(parse(resolve(ELEMENTS_DIR, 'disclosure.ts'))),
};

/** How many times `name(` is called under `scope`. */
function callCount(scope: ts.Node, name: string): number {
  let n = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) n++;
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return n;
}

/** tag -> the method names its `defineWebComponent` render callback exposes.
 *  Scoped per call, so a module declaring two elements cannot pool them. */
const SOURCE_METHODS: Map<string, string[]> = (() => {
  const out = new Map<string, string[]>();
  for (const file of facadeFiles) {
    const sf = parse(file);
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) && ts.isIdentifier(n.expression) &&
        n.expression.text === 'defineWebComponent' && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])
      ) {
        const tag = (n.arguments[0] as ts.StringLiteralLike).text;
        const render = n.arguments[2];
        const names = render ? [...exposedNames(render)] : [];
        if (render) {
          for (const [helper, contributed] of Object.entries(HELPER_NAMES)) {
            for (let i = 0; i < callCount(render, helper); i++) names.push(...contributed);
          }
        }
        out.set(tag, names.sort());
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
})();

const SOURCE_TOTAL = [...SOURCE_METHODS.values()].reduce((n, names) => n + names.length, 0);

describe('every method the facades expose reaches the model', () => {
  it('the independent parse found a real surface, not an empty one', () => {
    // Floors, so a parse that silently stopped working cannot make the equality
    // below pass by matching an equally-empty model.
    expect(SOURCE_METHODS.size).toBeGreaterThan(70);
    expect(HELPER_NAMES.wireDisclosure.length).toBeGreaterThan(2);
    expect(SOURCE_TOTAL).toBeGreaterThan(100);
  });

  it('element-meta.json lists exactly the methods the source exposes, per element', () => {
    const modelMethods = new Map(meta.map((e) => [e.tag, [...(e.methods ?? []).map((m) => m.name)].sort()]));
    const mismatched: string[] = [];
    for (const [tag, names] of SOURCE_METHODS) {
      const got = modelMethods.get(tag) ?? [];
      if (got.join(',') !== names.join(',')) mismatched.push(`${tag}: model [${got}] source [${names}]`);
    }
    expect(mismatched).toEqual([]);
  });

  it('and the totals agree', () => {
    expect(TOTAL_METHODS).toBe(SOURCE_TOTAL);
  });

  it('a method written in SHORTHAND form is extracted like any other', () => {
    // The regression: `expose({ clear })` is a ShorthandPropertyAssignment, not a
    // PropertyAssignment, and the extractor read only the latter. Named here so the
    // shape stays covered even if these three elements change.
    const shorthand: [string, string][] = [
      ['kai-search', 'clear'],
      ['kai-editable-label', 'commit'],
      ['kai-editable-label', 'cancel'],
    ];
    for (const [tag, name] of shorthand) {
      expect(SOURCE_METHODS.get(tag), `${tag} must still exist`).toContain(name);
      expect(meta.find((e) => e.tag === tag)?.methods?.map((m) => m.name) ?? [], `${tag}.${name}()`).toContain(name);
    }
  });
});

describe('the method model is big enough for the loops below to mean anything', () => {
  it('has methods on many elements', () => {
    expect(withMethods.length).toBeGreaterThan(30);
    expect(TOTAL_METHODS).toBeGreaterThan(100);
  });

  it('kai-resizable exposes maximize/restore — the spot check every artifact is held to', () => {
    const el = meta.find((e) => e.tag === 'kai-resizable');
    expect(expectedFor(el!)).toEqual(['maximize', 'restore']);
  });
});

/**
 * Every rendered method must also SAY something.
 *
 * The checks above prove each method reaches every artifact with its signature.
 * They say nothing about the description column, and that gap shipped: once
 * methods started rendering, `kai-chat`'s focus/blur/clear/send/scrollToBottom,
 * `kai-editable-label.edit` and `kai-search.focus` rendered as rows with an empty
 * description in four artifacts at once. Five of the seven were on the element
 * most consumers meet first. A blank row is worse than an absent one: it asserts
 * the method exists and then tells the reader nothing about what calling it does.
 *
 * The description is read from the JSDoc on the `expose({ ... })` property by
 * gen-element-api.mjs, so this fails the moment a method is exposed without one.
 */
describe('every exposed method carries a doc comment', () => {
  it('no method renders with an empty description', () => {
    const undocumented = withMethods.flatMap((el) =>
      el.methods!.filter((m) => !m.description?.trim()).map((m) => `${el.tag}.${m.name}()`),
    );
    expect(undocumented).toEqual([]);
  });

  it('the descriptions are sentences, not placeholders', () => {
    // Deliberately a LOW bar. House style wants terse docs ("Resume paused
    // playback." is 3 words and is the right length), so this rejects only a
    // stub — "TODO", "clear", a bare repeat of the method name — and never
    // pushes anyone to pad a good short sentence.
    const tooThin = withMethods.flatMap((el) =>
      el.methods!
        .filter((m) => {
          const d = m.description.trim();
          return d.split(/\s+/).length < 3 || d.length < 15 || d.toLowerCase() === m.name.toLowerCase();
        })
        .map((m) => `${el.tag}.${m.name}(): ${JSON.stringify(m.description)}`),
    );
    expect(tooThin).toEqual([]);
    // Derived from the model, not restated: the loop above must have had work to do.
    expect(TOTAL_METHODS).toBeGreaterThan(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Markdown artifacts: llms-full.txt and docs/web-components.md
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The method names in the table under `heading` — first cell, backticked.
 * Scans forward past the section's prose to the table, then stops at the line
 * after it, so a later table (Slots, Parts) can never be counted as this one.
 */
function methodRows(section: string, heading: RegExp): string[] {
  const lines = section.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return [];
  const names: string[] = [];
  let inTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      inTable = true;
      const cell = /^\|\s*`([\w$]+)`\s*\|/.exec(line);
      if (cell) names.push(cell[1]);
      continue;
    }
    if (inTable) break; // the table ended
    if (/^(#{2,6}\s|\*\*[A-Z]|---)/.test(line)) break; // next section, no table of ours
  }
  return names.sort();
}

/** llms-full.txt splits into one `### \`kai-tag\` / \`React\`` section per element. */
function llmsSections(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const marks = [...text.matchAll(/^### `(kai-[a-z0-9-]+)`/gm)];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index! : text.length;
    out.set(m[1], text.slice(m.index!, end));
  });
  return out;
}

/** docs/web-components.md is generated only between its per-tag spec markers. */
function mdSection(text: string, tag: string): string | undefined {
  const m = new RegExp(`<!-- spec:${tag} -->([\\s\\S]*?)<!-- /spec:${tag} -->`).exec(text);
  return m?.[1];
}

interface MarkdownArtifact {
  label: string;
  path: string;
  heading: RegExp;
  sectionFor: (text: string, tag: string) => string | undefined;
  /** How many of the model's elements this artifact is expected to document. */
  minCoveredElements: number;
  /** Element the per-method spot check runs against. Must be one it documents. */
  spot: string;
  optional?: boolean;
}

const MARKDOWN_ARTIFACTS: MarkdownArtifact[] = [
  {
    label: 'packages/ui/llms-full.txt',
    path: resolve(pkgRoot, 'llms-full.txt'),
    heading: /^\*\*Methods\*\*/,
    sectionFor: (text, tag) => llmsSections(text).get(tag),
    // Fully generated: every element in the model gets a section.
    minCoveredElements: meta.length,
    spot: 'kai-resizable',
  },
  {
    // The npm copy of the same file. Build-only, so skipped when absent.
    label: 'packages/ui/dist/llms/llms-full.txt',
    path: resolve(pkgRoot, 'dist/llms/llms-full.txt'),
    heading: /^\*\*Methods\*\*/,
    sectionFor: (text, tag) => llmsSections(text).get(tag),
    minCoveredElements: meta.length,
    spot: 'kai-resizable',
    optional: true,
  },
  {
    // NOT fully generated. This file is hand-written prose with generated tables
    // spliced between `<!-- spec:TAG -->` markers, and the generator only splices
    // where an author already wrote a `### \`<kai-tag>\`` heading — 40 of the 80
    // elements today, `kai-resizable` not among them. So coverage is measured over
    // the elements this file DOCUMENTS, not over the whole model; widening it is a
    // docs-authoring job, not a generator one. The floor keeps that gap from
    // quietly growing.
    label: 'docs/web-components.md',
    path: resolve(repoRoot, 'docs/web-components.md'),
    heading: /^#### Methods\b/,
    sectionFor: mdSection,
    minCoveredElements: 40,
    spot: 'kai-conversations',
  },
];

for (const artifact of MARKDOWN_ARTIFACTS) {
  describe(`${artifact.label} documents every exposed method it covers`, () => {
    const present = () => !artifact.optional || existsSync(artifact.path);
    const read = () => readFileSync(artifact.path, 'utf8');
    /** The elements this artifact documents at all. */
    const covered = (text: string) => meta.filter((e) => artifact.sectionFor(text, e.tag) !== undefined);

    it(`renders ${artifact.spot}'s methods with their signatures`, () => {
      if (!present()) return;
      const el = meta.find((e) => e.tag === artifact.spot)!;
      const section = artifact.sectionFor(read(), artifact.spot);
      expect(section, `${artifact.spot} must have a section in this artifact`).toBeDefined();
      expect(methodRows(section!, artifact.heading)).toEqual(expectedFor(el));
      // The signature, not just the name: `maximize` alone is not a callable fact.
      // `\|` is how a union survives a markdown table cell; unescape before matching
      // so the assertion is about the AUTHORED signature, not the escaping.
      const flat = section!.replace(/\\\|/g, '|');
      for (const m of el.methods!) expect(flat).toContain(`(${m.params}): ${m.returns}`);
    });

    it('renders every method of every element it covers, each under its own element', () => {
      if (!present()) return;
      const text = read();
      const documented = covered(text);
      expect(documented.length).toBeGreaterThanOrEqual(artifact.minCoveredElements);

      const wrong: string[] = [];
      let rendered = 0;
      let expectedCount = 0;

      for (const el of documented.filter((e) => e.methods?.length)) {
        expectedCount += el.methods!.length;
        const got = methodRows(artifact.sectionFor(text, el.tag)!, artifact.heading);
        rendered += got.length;
        const want = expectedFor(el);
        if (got.join(',') !== want.join(',')) wrong.push(`${el.tag}: got [${got}] want [${want}]`);
      }

      expect(wrong).toEqual([]);
      expect(rendered).toBe(expectedCount);
      // Not a restatement of the number: it is read off the model above. The floor
      // stops a shrunken model (or a shrunken artifact) from passing vacuously.
      expect(rendered).toBeGreaterThan(50);
    });

    it('an element with no methods gets no method table', () => {
      if (!present()) return;
      const text = read();
      // resizable.tsx declares kai-resizable AND kai-resizable-item; only the group
      // exposes maximize/restore, and the model already says so.
      expect(meta.find((e) => e.tag === 'kai-resizable-item')?.methods ?? []).toEqual([]);
      const bare = covered(text).filter((e) => !e.methods?.length);
      expect(bare.length).toBeGreaterThan(0);
      const withTable = bare.filter((e) => methodRows(artifact.sectionFor(text, e.tag)!, artifact.heading).length);
      expect(withTable.map((e) => e.tag)).toEqual([]);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The docs site's MethodTable
//
// Astro components are not rendered in this suite, so this is structural: the
// component must exist, must read the generated model rather than a hand-written
// list, and must actually be MOUNTED on the pages that document an element with
// methods. A table component nobody renders documents nothing.
// ─────────────────────────────────────────────────────────────────────────────

describe('the docs site renders a MethodTable', () => {
  const componentPath = resolve(repoRoot, 'apps/docs/src/components/MethodTable.astro');
  const pagesDir = resolve(repoRoot, 'apps/docs/src/content/docs/components');
  const tagsWithMethods = new Set(withMethods.map((e) => e.tag));

  it('the component exists and is driven by element-meta.json', () => {
    expect(existsSync(componentPath), 'apps/docs/src/components/MethodTable.astro').toBe(true);
    const src = readFileSync(componentPath, 'utf8');
    expect(src).toContain('element-meta.json');
    expect(src).toMatch(/\bmethods\b/);
  });

  it('every page that already tables an element with methods also renders MethodTable', () => {
    const missing: string[] = [];
    let mounted = 0;

    for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.mdx'))) {
      const src = readFileSync(resolve(pagesDir, file), 'utf8');
      // The elements this page already documents through the other generated tables.
      const tabled = new Set(
        [...src.matchAll(/(?:PropTable|EventTable|SlotTable|PartTable)[^>]*tag="(kai-[a-z0-9-]+)"/g)].map(
          (m) => m[1],
        ),
      );
      const methodTabled = new Set(
        [...src.matchAll(/MethodTable[^>]*tag="(kai-[a-z0-9-]+)"/g)].map((m) => m[1]),
      );
      mounted += methodTabled.size;
      for (const tag of tabled) {
        if (tagsWithMethods.has(tag) && !methodTabled.has(tag)) missing.push(`${file} → ${tag}`);
      }
      // The inverse: a MethodTable on an element that exposes nothing renders an
      // empty table, which reads as "this element has no methods" by accident.
      for (const tag of methodTabled) {
        if (!tagsWithMethods.has(tag)) missing.push(`${file} → ${tag} exposes no methods`);
      }
    }

    expect(missing).toEqual([]);
    // A floor, so deleting the mounts cannot make the loop above vacuous.
    expect(mounted).toBeGreaterThan(20);
  });
});
