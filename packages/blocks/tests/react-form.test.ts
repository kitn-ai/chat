/**
 * The react form: the typed wrappers from `@kitn.ai/ui/react` plus a
 * `useSyncExternalStore` adapter over the controller.
 *
 * It reads the SAME fixture the html suite reads. One page, one controller,
 * two renderers: two renderers disagreeing about one source is the defect
 * class this round exists to remove, and two hand-written fixtures could
 * disagree quietly.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderReactForm } from '../src/forms';
import type { Block } from '../src/registry';

const FIXTURES = resolve(__dirname, 'fixtures');
const PAGE = readFileSync(join(FIXTURES, 'fixture.html'), 'utf8');
const CONTROLLER = readFileSync(join(FIXTURES, 'fixture.controller.ts'), 'utf8');

// `block()` and `byPath()` are the same two helpers html-form.test.ts
// declares. If a third suite needs them they move to tests/fixtures/block.ts;
// two is not yet a pattern.
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

const byPath = (files: { path: string; content: string }[]) => new Map(files.map((f) => [f.path, f.content]));

// The import line the emitted component must carry, DERIVED from the fixture
// rather than typed: every `kai-` tag the page renders, PascalCased and
// sorted, which is the order the renderer emits. The fixture renders no kai
// element outside its `data-block-root`, so a page-wide scan is that subtree's
// list; the "host chrome is never imported" case below is what pins the
// difference.
const wrapperName = (tag: string): string =>
  tag.slice('kai-'.length).split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
const EXPECTED_IMPORT = `import { ${[...new Set([...PAGE.matchAll(/<(kai-[\w-]+)/g)].map((m) => m[1]))]
  .map(wrapperName)
  .sort()
  .join(', ')} } from '@kitn.ai/ui/react';`;

describe('the react form', () => {
  it('emits the component, the hook, the controller, the mock, the css and a README', () => {
    const files = byPath(renderReactForm(block()));
    expect([...files.keys()].sort()).toEqual([
      'Fixture.tsx', 'README.md', 'fixture.controller.ts', 'fixture.css', 'useFixture.ts',
    ]);
  });

  it('targets every file at src/components/<id>/', () => {
    for (const file of renderReactForm(block())) expect(file.target).toBe(`src/components/fixture/${file.path}`);
  });

  it('imports every kai element from @kitn.ai/ui/react and emits no raw kai- tag', () => {
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain("from '@kitn.ai/ui/react'");
    // The EXACT line, sorted: `Dock` sorts last, so a "contains Dock," probe
    // would pass on an unsorted list and on a list with a name missing.
    expect(tsx).toContain(EXPECTED_IMPORT);
    expect(tsx).not.toMatch(/<kai-/);
  });

  it('imports the wrappers the BLOCK ROOT renders, never one that only host chrome uses', () => {
    // The tags are collected over the block root's subtree, not over the page:
    // an element in the host stand-in is not in the emitted tree, so importing
    // it would be an unused local and the react compile cell fails on it.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<p class="host-stand-in">stand-in</p>', '<kai-button></kai-button>'),
    );
    const tsx = byPath(renderReactForm(b)).get('Fixture.tsx')!;
    expect(tsx).toContain(EXPECTED_IMPORT);
    expect(tsx).not.toContain('Button');
  });

  it('translates each binding kind', () => {
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('unread={state.hidden}');            // .prop
    expect(tsx).toContain('onClick={actions.open}');           // @kai-click -> the onName rule
    expect(tsx).toContain('{state.title}');                    // .textContent -> children
    expect(tsx).toContain('refs.current.dock = el;');          // #ref, no cast (PR B0 typed it)
    expect(tsx).toContain('.map((row) =>');                    // *for
    expect(tsx).toContain('key={row.id}');                     // the mandatory :key
  });

  it('reads a repeated row through the loop item, never through state', () => {
    // The row body and the repeated element's OWN bindings are inside the
    // `.map((row) => ...)` closure, so `state.row.title` would not even
    // compile. Cheaper to catch here than in the compile cell.
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('{row.title}');
    expect(tsx).toContain('unread={row.unread}');
    // `state.rows` is the list itself and legal; `state.row.` would be the
    // loop item read through the outer scope, which is the defect.
    expect(tsx).not.toMatch(/state\.row\./);
  });

  it('writes a seed ONCE in a mount effect, never as a re-applied prop', () => {
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain("setAttribute('position', 'bottom-end')");
    expect(tsx).toMatch(/useEffect\(\(\) => \{[\s\S]*setAttribute\('position'[\s\S]*\}, \[\]\);/);
    expect(tsx).not.toContain('position="bottom-end"');
  });

  it('translates a ="false" literal on a kai element to a JSX boolean', () => {
    const b = block();
    // `Block.files` is a ReadonlyMap, which is right for every consumer and
    // wrong for a fixture that varies one file; the map above is a real Map.
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false">'),
    );
    expect(byPath(renderReactForm(b)).get('Fixture.tsx')).toContain('searchable={false}');
  });

  it('emits the hook as one useSyncExternalStore over the controller', () => {
    const hook = byPath(renderReactForm(block())).get('useFixture.ts')!;
    expect(hook).toContain('useSyncExternalStore(controller.subscribe, controller.state, controller.state)');
    expect(hook).toContain("from './fixture.controller'");
    expect(hook).toContain('void controller.actions.boot();');
  });

  it('exports the component by NAME, which is what the README tells the reader to import', () => {
    const files = byPath(renderReactForm(block()));
    expect(files.get('Fixture.tsx')).toContain('export function Fixture()');
    expect(files.get('Fixture.tsx')).not.toContain('export default');
    expect(files.get('README.md')).toContain('import { Fixture }');
  });

  it('emits no registration import: the wrappers self-register', () => {
    const tsx = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(tsx).not.toContain('registerAll');
    expect(tsx).not.toContain('@kitn.ai/ui/elements');
    expect(tsx).not.toContain('whenDefined');
  });

  it('refuses a block with no controller, by the file name it wanted', () => {
    const b = block();
    (b.files as Map<string, string>).delete('fixture.controller.ts');
    expect(() => renderReactForm(b)).toThrow(/fixture\.controller\.ts/);
  });
});
