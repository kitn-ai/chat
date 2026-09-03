/**
 * The html form: the authored page with the bindings taken OFF the markup and
 * a generated binder that puts them back at runtime. What is pinned here is
 * the shape of that binder, because it is the file with no typecheck behind
 * it anywhere.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { renderHtmlForm, withStrippedTwins } from '../src/forms';
import type { Block } from '../src/registry';

const FIXTURES = resolve(__dirname, 'fixtures');

// THE SHARED FIXTURE. Both renderer suites read the same page and the same
// controller from `packages/blocks/tests/fixtures/`, because two renderers
// disagreeing about one source is the defect class this whole round exists to
// remove, and two hand-written fixtures could disagree quietly.
//
//   packages/blocks/tests/fixtures/fixture.html
//   packages/blocks/tests/fixtures/fixture.controller.ts
//   packages/blocks/tests/fixtures/fixture.css
//
// The controller is a REAL multi-line TypeScript file, not a one-liner: the
// "no TypeScript survived into the shipped .js" assertion below is only worth
// anything if the strip has something to remove that a naive helper would
// leave behind.
const CONTROLLER = readFileSync(join(FIXTURES, 'fixture.controller.ts'), 'utf8');

const PAGE = readFileSync(join(FIXTURES, 'fixture.html'), 'utf8');

const block = (): Block => ({
  name: 'fixture',
  manifest: {
    name: 'fixture', title: 'F', description: 'f', type: 'registry:block',
    files: [
      { path: 'fixture.html', type: 'registry:page' },
      { path: 'fixture.controller.ts', type: 'registry:file' },
      { path: 'fixture.css', type: 'registry:file' },
    ],
  },
  files: new Map([
    ['fixture.html', PAGE],
    ['fixture.controller.ts', CONTROLLER],
    ['fixture.css', readFileSync(join(FIXTURES, 'fixture.css'), 'utf8')],
  ]),
});

// The strip is esbuild's, the same transform gen-blocks runs. A hand-rolled
// regex here is how the "no TypeScript in the shipped .js" case below passes
// VACUOUSLY: the obvious `/export interface[\s\S]*?\n\}\n/g` never matches a
// single-line interface, so it removes nothing, and the assertion then holds
// because the fixture had no multi-line types rather than because anything
// was stripped. `esbuild` is a DEVDEPENDENCY of packages/blocks (added in this
// task), never a dependency: it is used by this suite only, so it never
// reaches the CLI bundle that `bundleGraphProblem` grades.
const stripped = () =>
  withStrippedTwins(block(), (source, fileName) =>
    transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: fileName }).code,
  );
const byPath = (files: { path: string; content: string }[]) => new Map(files.map((f) => [f.path, f.content]));

describe('withStrippedTwins', () => {
  it('lists the twin in the MANIFEST even when the file is already on disk', () => {
    // The shape `create-kai`'s dist has: its build writes the twins beside the
    // copied sources, so `files` already carries them while `manifest.files`
    // still lists only the authored four. An early return on "the file is
    // there" left the manifest entry off, and `buildRegistryItem` serializes
    // the MANIFEST -- so a fetched item JSON silently omitted a file the html
    // form then refused to render without.
    const base = block();
    const withTwinOnDisk: Block = {
      ...base,
      files: new Map([...base.files, ['fixture.controller.js', 'export function createController() {}\n']]),
    };
    const out = withStrippedTwins(withTwinOnDisk, () => 'SHOULD NOT BE CALLED');
    expect(out.manifest.files.map((f) => f.path)).toContain('fixture.controller.js');
    // The file on disk WINS: it is the one the build already wrote, and
    // re-stripping it here would be the second stripper this whole design
    // exists to avoid.
    expect(out.files.get('fixture.controller.js')).toBe('export function createController() {}\n');
  });

  it('is idempotent: running it twice adds the twin once', () => {
    const once = withStrippedTwins(block(), (source) => source);
    const twice = withStrippedTwins(once, (source) => source);
    expect(twice.manifest.files).toEqual(once.manifest.files);
  });
});

describe('the html form', () => {
  it('refuses to render without the stripped twin, and names the generator', () => {
    expect(() => renderHtmlForm(block())).toThrow(/fixture\.controller\.js/);
    expect(() => renderHtmlForm(block())).toThrow(/gen-blocks/);
  });

  it('emits the page, the binder, the stripped controller and the css', () => {
    const files = byPath(renderHtmlForm(stripped()));
    expect([...files.keys()].sort()).toEqual(['fixture.controller.js', 'fixture.css', 'fixture.html', 'fixture.js']);
  });

  it('targets every file at blocks/<id>/', () => {
    for (const file of renderHtmlForm(stripped())) {
      expect(file.target).toBe(`blocks/fixture/${file.path}`);
    }
  });

  it('takes every binding OFF the markup and leaves the literals', () => {
    const page = byPath(renderHtmlForm(stripped())).get('fixture.html')!;
    expect(page).not.toMatch(/\.unread=|@kai-click=|#ref=|\*for=|:key=|seed:/);
    expect(page).toContain('data-kai-b="0"');
    expect(page).toContain('<link rel="stylesheet" href="./fixture.css" />');
    expect(page).toContain('<script type="module" src="./fixture.js"></script>');
  });

  it('turns the repeated element into a template the binder clones', () => {
    const page = byPath(renderHtmlForm(stripped())).get('fixture.html')!;
    expect(page).toMatch(/<template data-kai-for="\d+">\s*<kai-conversation-item/);
  });

  it('binds registration and the whenDefined await, and adapts the import for a bundler', () => {
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    expect(binder).toContain("import '@kitn.ai/ui/elements';");
    expect(binder).not.toContain('@kitn.ai/ui/autoloader');
    expect(binder).toContain('customElements.whenDefined');
    expect(binder).toContain("'kai-conversation-item'");
  });

  it('keeps the autoloader when the caller asks for it (the cdn form s native pattern)', () => {
    const binder = byPath(renderHtmlForm(stripped(), { registration: 'autoloader' })).get('fixture.js')!;
    expect(binder).toContain("import '@kitn.ai/ui/autoloader';");
    expect(binder).not.toContain("import '@kitn.ai/ui/elements';");
  });

  it('writes the seed once, before the first apply, and never inside apply()', () => {
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    const seedAt = binder.indexOf("'position'");
    const applyAt = binder.indexOf('function apply(');
    expect(seedAt).toBeGreaterThan(-1);
    expect(seedAt).toBeLessThan(applyAt);
  });

  it('signals the driver readiness convention as its last statement', () => {
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    expect(binder.trimEnd().endsWith('window.__blockReady = true;')).toBe(true);
    expect(binder.indexOf('actions.boot()')).toBeLessThan(binder.indexOf('__blockReady'));
  });

  it('wires a row descendant INSIDE the row and NOT at document scope', () => {
    // The defect this asserts: walkElements is flat, so a document-scope loop
    // that skips only the repeated element still emits `at(N).textContent =`
    // for a <span> that exists only inside the <template>. at(N) is null
    // there and the first apply() throws. Both halves are asserted, because
    // asserting only the row half passes with the duplicate still present.
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    const applyBody = binder.slice(binder.indexOf('function apply('), binder.indexOf('controller.subscribe'));
    const rowBody = binder.slice(binder.indexOf('function applyRows'), binder.indexOf('function apply('));
    expect(applyBody).not.toContain('row.title');
    expect(applyBody).toContain('applyRows');
    expect(rowBody).toContain('row.title');
    expect(rowBody).toContain('inRow(node,');
  });

  it('hands the row function the document state a plain-identifier binding needs', () => {
    // The defect: a plain identifier inside a `*for` is legal (it reads a
    // State field, not a row field), and `applyRowsN` is a MODULE-LEVEL
    // function. Emitting `state.title` in there is a ReferenceError on the
    // first apply, because `state` is a local of `apply()`.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(
        '<span .textContent="row.title"></span>',
        '<span .textContent="row.title"></span>\n          <span .textContent="title"></span>',
      ),
    );
    const binder = byPath(renderHtmlForm(withStrippedTwins(b, (s) => s))).get('fixture.js')!;
    expect(binder).toMatch(/function applyRows\d+\(rows, state\)/);
    expect(binder).toMatch(/applyRows\d+\(state\.rows, state\)/);
  });

  it('emits a binder that PARSES', () => {
    // The binder has no typecheck behind it anywhere, so the cheapest real
    // check is that a JavaScript parser accepts it. esbuild is already a
    // devDependency for the strip; this reuses it as a syntax gate over the
    // one file nothing else compiles.
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    expect(() => transformSync(binder, { loader: 'js', format: 'esm' })).not.toThrow();
  });

  it('keeps a comment verbatim instead of escaping what parse5 never decoded', () => {
    // parse5 does NOT decode entities inside a comment, so escaping again
    // turns `<!-- a & b -->` into `<!-- a &amp; b -->` and an authored
    // `&amp;` into `&amp;amp;`. Corruption, one round per render.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<p class="host-stand-in">stand-in</p>', '<!-- a & b, and &amp; too -->'),
    );
    const page = byPath(renderHtmlForm(withStrippedTwins(b, (s) => s))).get('fixture.html')!;
    expect(page).toContain('<!-- a & b, and &amp; too -->');
  });

  it('removes an attribute on false/null/undefined and NOT on 0 or the empty string', () => {
    const binder = byPath(renderHtmlForm(stripped())).get('fixture.js')!;
    const setAttr = binder.slice(binder.indexOf('const setAttr'), binder.indexOf('const controller'));
    expect(setAttr).toContain("value === false || value === null || value === undefined");
    expect(setAttr).not.toContain("value === ''");
  });

  it('carries no TypeScript into the shipped .js files', () => {
    const files = byPath(renderHtmlForm(stripped()));
    for (const name of ['fixture.js', 'fixture.controller.js']) {
      expect(files.get(name)).not.toMatch(/^\s*(?:export\s+)?(?:interface|type)\s/m);
      expect(files.get(name)).not.toMatch(/:\s*(?:string|boolean|number)\s*[;,)]/);
    }
    // Anti-vacuity: the SOURCE has to contain what the strip removes, or this
    // case holds for the wrong reason.
    expect(CONTROLLER).toMatch(/^export interface /m);
  });

  it('re-encodes non-ASCII rather than emitting a literal astral character', () => {
    const b = block();
    // `Block.files` is a ReadonlyMap, which is right for every consumer and
    // wrong for a fixture that varies one file. The cast is the whole
    // deviation: the map handed in on the line above is a real Map.
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<span .textContent="title"></span>', '<span>Hi &#x1F44B;</span>'),
    );
    const page = byPath(renderHtmlForm(withStrippedTwins(b, (s) => s))).get('fixture.html')!;
    expect(page).toContain('&#x1f44b;');
    expect(/[\u{10000}-\u{10FFFF}]/u.test(page)).toBe(false);
  });
});
