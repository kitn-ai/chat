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

  it('imports only the react hooks it actually uses', () => {
    // `useEffect` is emitted ONLY for a seed, so importing it unconditionally
    // is TS6133 (`noUnusedLocals`) in a stock react-ts project: the emitted
    // file does not compile in the consumer's tree, and nothing here would
    // have said so.
    const seeded = byPath(renderReactForm(block())).get('Fixture.tsx')!;
    expect(seeded).toContain("import { useEffect } from 'react';");

    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace(' seed:position="bottom-end"', ''));
    const unseeded = byPath(renderReactForm(b)).get('Fixture.tsx')!;
    expect(unseeded).not.toContain('useEffect');
    expect(unseeded).not.toContain("from 'react';"); // no hooks at all, so no import line

    // A seed on an element with no `#ref` allocates one, which is the other
    // hook the list can contain.
    const c = block();
    (c.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations seed:density="panel">'),
    );
    expect(byPath(renderReactForm(c)).get('Fixture.tsx')).toContain("import { useEffect, useRef } from 'react';");
  });

  it('passes data- and aria- attributes through verbatim rather than camelCasing them', () => {
    // React takes `data-*` and `aria-*` as authored. CamelCasing them invents
    // `dataTestid` and `ariaLabel`, which are not on the wrappers' closed prop
    // type, so the emitted file fails to compile.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-dock data-block-root', '<kai-dock data-block-root data-testid="dock" aria-label="Support"'),
    );
    const tsx = byPath(renderReactForm(b)).get('Fixture.tsx')!;
    expect(tsx).toContain('data-testid="dock"');
    expect(tsx).toContain('aria-label="Support"');
    expect(tsx).not.toContain('dataTestid');
    expect(tsx).not.toContain('ariaLabel');
  });

  it('drops a literal attribute that a binding of the same name already writes', () => {
    // The authored page carries both when the literal is the value the element
    // shows BEFORE the controller runs: the html form needs it, and React does
    // not (the prop applies on the first render). Emitting both is a duplicate
    // JSX attribute.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE
        .replace('<kai-conversations>', '<kai-conversations hidden :hidden="hidden">')
        .replace('.unread="hidden"', 'unread .unread="hidden"'),
    );
    const tsx = byPath(renderReactForm(b)).get('Fixture.tsx')!;
    const conversations = tsx.split('\n').find((l) => l.includes('<Conversations'))!;
    expect(conversations).toContain('hidden={state.hidden}');
    expect(conversations).not.toMatch(/<Conversations\s+hidden[\s>]/);
    const dock = tsx.split('\n').find((l) => l.includes('<Dock'))!;
    expect(dock).toContain('unread={state.hidden}');
    expect(dock).not.toMatch(/\sunread[\s>]/);
  });

  it('escapes literal braces in text rather than emitting TSX that does not parse', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<span .textContent="title"></span>', '<span>a { b }</span>'),
    );
    const tsx = byPath(renderReactForm(b)).get('Fixture.tsx')!;
    expect(tsx).toContain("{'{'}");
    expect(tsx).toContain("{'}'}");
    expect(tsx).not.toMatch(/a \{ b \}/);
  });

  it('refuses a string style attribute by name, pointing at the stylesheet', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations style="color: red">'),
    );
    expect(() => renderReactForm(b)).toThrow(/style=/);
    expect(() => renderReactForm(b)).toThrow(/stylesheet/);
  });

  it('cross-checks the bindings against the controller, as the html form does', () => {
    // `create-kai add` and `kai dev` render without ever running
    // checkBlockContracts, so without this the tsx calls a function nobody
    // exports and the reader finds out from tsc in their own project.
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderReactForm(b)).toThrow(/nope/);
  });

  it('names a :attr binding on a kai element exactly as a literal attribute is named', () => {
    // The binding path used to camelCase blindly, which emitted `class={...}`
    // (React warns and drops it) and `dataTestid={...}` (not on the wrappers'
    // closed prop type, so the emitted file does not compile). One rule, one
    // function: `literalPropName`.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations :class="title" :data-testid="title" :aria-label="title">'),
    );
    const tsx = byPath(renderReactForm(b)).get('Fixture.tsx')!;
    expect(tsx).toContain('className={state.title}');
    expect(tsx).toContain('data-testid={state.title}');
    expect(tsx).toContain('aria-label={state.title}');
    expect(tsx).not.toContain('dataTestid');
    expect(tsx).not.toContain('ariaLabel');
    expect(tsx).not.toMatch(/\sclass=\{/);
  });

  it('escapes < and > in text, not only braces', () => {
    // A bare `<` opens a tag, so text carrying one emits TSX that does not
    // parse. The brace case was already handled and these two were not.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<span .textContent="title"></span>', '<span>1 &lt; 2 &amp; a &gt; b</span>'),
    );
    const tsx = byPath(renderReactForm(b)).get('Fixture.tsx')!;
    expect(tsx).toContain("1 {'<'} 2 & a {'>'} b");
  });

  it('emits a literal attribute value carrying a double quote as an expression', () => {
    // `title="say "hi""` closes the JSX string on the first inner quote.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations title="say &quot;hi&quot;">'),
    );
    const tsx = byPath(renderReactForm(b)).get('Fixture.tsx')!;
    expect(tsx).toContain(`title={'say "hi"'}`);
  });

  it('refuses an @event on a plain tag, where React has no derivable handler name', () => {
    // Refused at the grammar (parse-template), so the html form refuses the
    // same page rather than the two forms disagreeing about one source.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<span .textContent="title"></span>', '<input @keydown="open" />'),
    );
    expect(() => renderReactForm(b)).toThrow(/kai-input/);
  });

  it('refuses a block with no controller, by the file name it wanted', () => {
    const b = block();
    (b.files as Map<string, string>).delete('fixture.controller.ts');
    expect(() => renderReactForm(b)).toThrow(/fixture\.controller\.ts/);
  });

  it('the README is byte-identical to what this form emitted before the shared renderer (regression control)', () => {
    const readme = renderReactForm(block()).find((f) => f.path === 'README.md');
    expect(readme, 'the react form emitted no README').toBeDefined();
    expect(readme!.content).toBe(
      ['# F', '', 'f', '', "Render it: `import { Fixture } from './Fixture';`", ''].join('\n'),
    );
  });

  it('the README names what the block needs when the manifest says so', () => {
    const withEnv: Block = { ...block(), manifest: { ...block().manifest, envVars: { OPENAI_API_KEY: 'a key' } } };
    const readme = renderReactForm(withEnv).find((f) => f.path === 'README.md')!;
    expect(readme.content).toContain('Needs OPENAI_API_KEY set.');

    const withRoute: Block = {
      ...block(),
      manifest: { ...block().manifest, registryDependencies: ['route:/api/chat'] },
    };
    const readmeRoute = renderReactForm(withRoute).find((f) => f.path === 'README.md')!;
    expect(readmeRoute.content).toContain('Needs a server route: /api/chat.');
  });
});
