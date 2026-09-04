/**
 * The solid form: custom elements directly, gated on `ready()`, plus a
 * `createSignal` adapter over the controller's snapshot.
 *
 * WHY CUSTOM ELEMENTS AND NOT THE SOLID COMPONENTS IN `@kitn.ai/ui/solid`
 * (spec 3.6, option (a)) -- and the set is ALL of them, not a subset: the
 * shared controller types its refs as the ELEMENT interfaces
 * (`KaiDockElement`), which a Solid component does not hand back, and the
 * `kai-` events are dispatched by the element facade in `src/elements/`, not
 * by the Solid component underneath it, so `on:kai-click` on a Solid
 * component would silently never fire.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderSolidForm } from '../src/forms';
import type { Block } from '../src/registry';

const FIXTURES = resolve(__dirname, 'fixtures');
const PAGE = readFileSync(join(FIXTURES, 'fixture.html'), 'utf8');
const CONTROLLER = readFileSync(join(FIXTURES, 'fixture.controller.ts'), 'utf8');

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

describe('the solid form', () => {
  it('emits the component, the adapter, the controller, the css and a README', () => {
    expect([...byPath(renderSolidForm(block())).keys()].sort()).toEqual([
      'Fixture.tsx', 'README.md', 'fixture.controller.ts', 'fixture.css', 'useFixture.ts',
    ]);
  });

  it('targets every file at src/components/<id>/', () => {
    for (const file of renderSolidForm(block())) expect(file.target).toBe(`src/components/fixture/${file.path}`);
  });

  it('renders CUSTOM ELEMENTS, never the components in @kitn.ai/ui/solid', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('<kai-dock');
    expect(tsx).not.toContain("from '@kitn.ai/ui/solid'");
    expect(tsx).not.toContain('<Dock');
  });

  it('sets a kai property with prop: and listens with on:', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('prop:unread={state().hidden}');
    expect(tsx).toContain('on:kai-click={actions.open}');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations .activeId="title">'),
    );
    expect(byPath(renderSolidForm(b)).get('Fixture.tsx')).toContain('prop:activeId={state().title}');
  });

  it('annotates the ref callback, because an unannotated one is TS7006', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain("import type { KaiDockElement } from '@kitn.ai/ui/elements';");
    expect(tsx).toContain('ref={(el: KaiDockElement) => { dock = el; }}');
    expect(tsx).toContain('let dock: KaiDockElement | null = null;');
    expect(tsx).toContain('useFixture(() => ({ dock }))');
  });

  it('repeats with <For>, and does NOT invent a key prop Solid would ignore', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('<For each={state().rows}>');
    expect(tsx).toContain('{(row) => (');
    expect(tsx).not.toMatch(/key=\{/);
    expect(tsx).toContain('reference-keyed');
  });

  it('gates the tree on ready and imports only the solid helpers it uses', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain("import { For, Show } from 'solid-js';");
    expect(tsx).toContain('<Show when={ready()}>');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(/<kai-conversations>[\s\S]*<\/kai-conversations>/, '<kai-conversations></kai-conversations>'),
    );
    const flat = byPath(renderSolidForm(b)).get('Fixture.tsx')!;
    expect(flat).toContain("import { Show } from 'solid-js';");
    expect(flat).not.toMatch(/<For\b/);
    expect(flat).not.toMatch(/\bFor\b[^\n]*from 'solid-js'/);
  });

  it('emits a seed as a static attribute and translates a ="false" literal', () => {
    const tsx = byPath(renderSolidForm(block())).get('Fixture.tsx')!;
    expect(tsx).toContain('position="bottom-end"');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false" compact>'),
    );
    const other = byPath(renderSolidForm(b)).get('Fixture.tsx')!;
    expect(other).toContain('prop:searchable={false}');
    expect(other).toContain('prop:compact={true}');
  });

  it('emits the adapter as one signal over the controller', () => {
    const adapter = byPath(renderSolidForm(block())).get('useFixture.ts')!;
    expect(adapter).toContain("import '@kitn.ai/ui/elements';");
    expect(adapter).toContain(`const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];`);
    expect(adapter).toContain('createSignal<FixtureState>(controller.state())');
    expect(adapter).toContain('onCleanup(controller.subscribe(');
    expect(adapter).toContain('onMount(');
    expect(adapter).toContain('void controller.actions.boot();');
  });

  it('calls boot() from onMount, after setReady(true) in the same hook', () => {
    const adapter = byPath(renderSolidForm(block())).get('useFixture.ts')!;
    expect(adapter).toMatch(/onMount\(async \(\) => \{[\s\S]*setReady\(true\);\n\s*void controller\.actions\.boot\(\);/);
  });

  it('cross-checks the bindings against the controller', () => {
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderSolidForm(b)).toThrow(/nope/);
  });

  // ------------------------------------------------------- CONTROLLER RULING B2-T3-a

  it('never drops a seed colliding with a prop binding on the same element: it applies in onMount instead', () => {
    // Controller ruling B2-T3-a, first collision shape: a seed's target name
    // is also claimed by a reactive binding on the SAME element. It cannot
    // stay a static attribute -- Solid's compiler would emit two entries for
    // the same DOM property/attribute, and the seed is not simply dropped
    // either. It applies once, in onMount, after the ready flip and before
    // boot().
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(
        'seed:position="bottom-end" .unread="hidden"',
        'seed:position="bottom-end" seed:unread="true" .unread="hidden"',
      ),
    );
    const files = byPath(renderSolidForm(b));
    const tsx = files.get('Fixture.tsx')!;
    const adapter = files.get('useFixture.ts')!;
    // Not a static attribute: the reactive binding it collides with is
    // unaffected and the colliding seed is not left behind as a literal.
    expect(tsx).not.toMatch(/\bunread="true"/);
    expect(tsx).toContain('prop:unread={state().hidden}');
    // The OTHER seed on the same element, which does not collide, is
    // unaffected: still a plain static attribute.
    expect(tsx).toContain('position="bottom-end"');
    // dock already has a #ref, so the seed reuses it rather than inventing a
    // synthetic one.
    expect(adapter).toContain("setAttribute('unread', 'true')");
    const readyAt = adapter.indexOf('setReady(true);');
    const seedAt = adapter.indexOf("setAttribute('unread', 'true')");
    const bootAt = adapter.indexOf('void controller.actions.boot();');
    expect(readyAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(readyAt);
    expect(bootAt).toBeGreaterThan(seedAt);
  });

  it('never drops a seed colliding with a literal attribute of the same name: it applies in onMount through a synthetic ref', () => {
    // The second collision shape B2-T3-a names: a literal attribute (not a
    // binding) claiming the same name. kai-conversations has no #ref in the
    // fixture, so this exercises the synthetic-ref path.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations label="orig" seed:label="seeded">'),
    );
    const files = byPath(renderSolidForm(b));
    const tsx = files.get('Fixture.tsx')!;
    const adapter = files.get('useFixture.ts')!;
    // The literal is unaffected; it still renders as authored.
    expect(tsx).toContain('label="orig"');
    // The seed never becomes a second, colliding "label" attribute.
    expect(tsx).not.toMatch(/label="seeded"/);
    expect(adapter).toContain("setAttribute('label', 'seeded')");
    expect(tsx).toMatch(/let seedRef\d+: KaiConversationsElement \| null = null;/);
    expect(tsx).toMatch(/ref=\{\(el: KaiConversationsElement\) => \{ seedRef\d+ = el; \}\}/);
    const readyAt = adapter.indexOf('setReady(true);');
    const seedAt = adapter.indexOf("setAttribute('label', 'seeded')");
    const bootAt = adapter.indexOf('void controller.actions.boot();');
    expect(readyAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(readyAt);
    expect(bootAt).toBeGreaterThan(seedAt);
  });

  // ------------------------------------------------------------ escaping

  it('escapes {, }, < and > in text, so a literal one does not open a JSX expression or a tag', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<span .textContent="title"></span>', '<span>a { b } < c > d</span>'),
    );
    const tsx = byPath(renderSolidForm(b)).get('Fixture.tsx')!;
    expect(tsx).toContain(`a {'{'} b {'}'} {'<'} c {'>'} d`);
    expect(tsx).not.toContain('a { b } < c > d</span>');
  });

  it('neutralises */ inside an emitted comment, so it cannot close the JSX comment early', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<span .textContent="title"></span>', '<!-- a */ b -->'),
    );
    const tsx = byPath(renderSolidForm(b)).get('Fixture.tsx')!;
    expect(tsx).toContain('{/* a * / b */}');
  });
});
