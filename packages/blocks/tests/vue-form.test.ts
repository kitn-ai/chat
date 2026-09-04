/**
 * The vue form: a `<script setup lang="ts">` SFC over the custom elements, plus
 * a composable holding one `shallowRef` over the controller's snapshot.
 *
 * THE THREE THINGS THAT ARE NOT OBVIOUS, each pinned below:
 *
 * 1. The template is gated on `ready`. Outside react, a generated form emits
 *    the registration import AND the whenDefined await (spec 8b, amendment 7):
 *    Vue created `<kai-conversations>` before the bundle defined it, the
 *    property landed on a plain HTMLElement, the upgrade discarded it, and the
 *    block rendered a search box it does not have.
 * 2. A kai prop is bound with the CAMELCASE name and the `.prop` modifier.
 *    Camel because `KaiElementVueProps` carries an index signature and an
 *    explicit member only wins when the name matches it, so the kebab spelling
 *    would type as `unknown` and check nothing. `.prop` because these are
 *    properties: an attribute stringifies, and `unread="false"` reads as true.
 * 3. A `="false"` or bare-boolean literal on a kai element becomes `:name="false"`
 *    / `:name="true"` (spec 8b, amendment 8 (F-10)). The kit's own default-true-flag
 *    idiom does not survive translation: vue-tsc rejects the string against the
 *    generated `boolean`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderVueForm } from '../src/forms';
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

describe('the vue form', () => {
  it('emits the SFC, the composable, the controller, the css and a README', () => {
    expect([...byPath(renderVueForm(block())).keys()].sort()).toEqual([
      'Fixture.vue', 'README.md', 'fixture.controller.ts', 'fixture.css', 'useFixture.ts',
    ]);
  });

  it('targets every file at src/components/<id>/', () => {
    for (const file of renderVueForm(block())) expect(file.target).toBe(`src/components/fixture/${file.path}`);
  });

  it('gates the tree on registration, and awaits the tags the ROOT renders', () => {
    const files = byPath(renderVueForm(block()));
    const sfc = files.get('Fixture.vue')!;
    const composable = files.get('useFixture.ts')!;
    expect(composable).toContain("import '@kitn.ai/ui/elements';");
    expect(composable).toContain('customElements.whenDefined');
    // Derived from the fixture, not typed: every kai tag inside the block root,
    // sorted. `kai-dock`, `kai-conversations`, `kai-conversation-item`.
    expect(composable).toContain(
      `const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];`,
    );
    expect(sfc).toContain('v-if="ready"');
  });

  it('binds a kai property by its CAMELCASE name with the .prop modifier', () => {
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain(':unread.prop="state.hidden"');
    // The camel case is what makes the declared member win over
    // KaiElementVueProps's index signature. A kebab spelling here types as
    // `unknown` and vue-tsc checks nothing, which is the exact green-on-nothing
    // the compile cell's second plant exists to catch.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations .activeId="title">'),
    );
    expect(byPath(renderVueForm(b)).get('Fixture.vue')).toContain(':activeId.prop="state.title"');
  });

  it('binds a :attr on a kai element as a property too, under the camel name', () => {
    // Same rule the react renderer applies: `:attr` on a kai element is the
    // camelCase PROPERTY. An attribute stringifies, so `unread="false"` would
    // read as true, which is the boolean trap in three of the five frameworks.
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain(':unread.prop="row.unread"');
  });

  it('translates a ="false" literal and a bare boolean on a kai element', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false" compact>'),
    );
    const sfc = byPath(renderVueForm(b)).get('Fixture.vue')!;
    expect(sfc).toContain(':searchable="false"');
    expect(sfc).toContain(':compact="true"');
    // No UN-bound literal survives. Not `.not.toContain('searchable="false"')`:
    // that string is a substring of ':searchable="false"' itself (drop the
    // leading colon), so it can never pass alongside the assertion above --
    // checked and confirmed unsatisfiable as literally written in the task
    // brief. This is the same guard with a word boundary, so it can actually
    // fire on the defect it names: a plain attribute left behind un-bound.
    expect(sfc).not.toMatch(/(?<!:)searchable="false"/);
  });

  it('emits a non-colliding seed as a static attribute, never as a bound one', () => {
    // A seed is written once. In react that is a mount effect; here, when
    // nothing else on the element claims the same name, it is a plain
    // attribute, because nothing re-applies it (spec 8b, amendment 5).
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain('position="bottom-end"');
    expect(sfc).not.toContain(':position');
  });

  it('never drops a seed colliding with a .prop/:attr binding on the same element: it applies in onMounted instead', () => {
    // Controller ruling B2-T3-a. Dropping a colliding seed was the fix-round-1
    // finding: Vue compiles a `.prop`/`:attr` binding and a plain attribute of
    // the same name into two entries of ONE props object (TS1117, a duplicate
    // object-literal key), so the seed cannot stay a static attribute here --
    // but it must not disappear either. It becomes a one-time setAttribute on
    // the element's own template ref, applied after the ready-gated tree has
    // rendered and before boot() (the order react's own effect gives it).
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(
        'seed:position="bottom-end" .unread="hidden"',
        'seed:position="bottom-end" seed:unread="true" .unread="hidden"',
      ),
    );
    const files = byPath(renderVueForm(b));
    const sfc = files.get('Fixture.vue')!;
    const composable = files.get('useFixture.ts')!;
    // Not a static attribute (the un-bound literal form, only): the reactive
    // binding it collides with is unaffected.
    expect(sfc).not.toMatch(/(?<!:)unread="true"/);
    expect(sfc).toContain(':unread.prop="state.hidden"');
    // The OTHER seed on the same element, which does not collide, is
    // unaffected: still a plain static attribute.
    expect(sfc).toContain('position="bottom-end"');
    // dock already has a #ref, so the seed reuses it rather than inventing a
    // synthetic one.
    expect(composable).toContain("setAttribute('unread', 'true')");
    const nextTickAt = composable.indexOf('await nextTick();');
    const seedAt = composable.indexOf("setAttribute('unread', 'true')");
    const bootAt = composable.indexOf('void controller.actions.boot();');
    expect(nextTickAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(nextTickAt);
    expect(bootAt).toBeGreaterThan(seedAt);
  });

  it('never drops a seed colliding with a literal attribute of the same name: it applies in onMounted through a synthetic ref', () => {
    // The second collision shape B2-T3-a names: a literal attribute (not a
    // binding) claiming the same name. kai-conversations has no #ref in the
    // fixture, so this exercises the synthetic-ref path.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations label="orig" seed:label="seeded">'),
    );
    const files = byPath(renderVueForm(b));
    const sfc = files.get('Fixture.vue')!;
    const composable = files.get('useFixture.ts')!;
    // The literal is unaffected; it still renders as authored.
    expect(sfc).toContain('label="orig"');
    // The seed never becomes a second, colliding "label" attribute.
    expect(sfc).not.toMatch(/label="seeded"/);
    expect(composable).toContain("setAttribute('label', 'seeded')");
    expect(sfc).toMatch(/const seedRef\d+ = useTemplateRef<KaiConversationsElement>\('seedRef\d+'\);/);
    expect(sfc).toMatch(/ref="seedRef\d+"/);
    const nextTickAt = composable.indexOf('await nextTick();');
    const seedAt = composable.indexOf("setAttribute('label', 'seeded')");
    const bootAt = composable.indexOf('void controller.actions.boot();');
    expect(nextTickAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(nextTickAt);
    expect(bootAt).toBeGreaterThan(seedAt);
  });

  it('escapes {{, <, > and & in text, so a literal one does not open a Vue interpolation or a tag', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<span .textContent="title"></span>', '<span>a {{ b }} &lt; c &amp; d &gt; e</span>'),
    );
    const sfc = byPath(renderVueForm(b)).get('Fixture.vue')!;
    // Only the SECOND brace of the opening "{{" is encoded as an entity: the
    // raw first brace plus the decoded second one still RENDERS as "{{", but
    // the source text no longer carries the literal two-character sequence a
    // template compiler recognizes as mustache-open.
    expect(sfc).toContain('a {&#123; b }} &lt; c &amp; d &gt; e');
    expect(sfc).not.toContain('a {{ b }} < c & d > e');
  });

  it('wires an event straight to the action, with no handler name to invent', () => {
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain('@kai-click="actions.open"');
  });

  it('renders .textContent as children and a *for as a keyed v-for', () => {
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain('{{ state.title }}');
    expect(sfc).toContain('v-for="row in state.rows"');
    expect(sfc).toContain(':key="row.id"');
    expect(sfc).toContain('{{ row.title }}');
    // The loop item is read through the item, never through state.
    expect(sfc).not.toMatch(/state\.row\./);
  });

  it('takes a ref through useTemplateRef, typed by the element interface the tag names', () => {
    const sfc = byPath(renderVueForm(block())).get('Fixture.vue')!;
    expect(sfc).toContain("import type { KaiDockElement } from '@kitn.ai/ui/elements';");
    expect(sfc).toContain(`const dock = useTemplateRef<KaiDockElement>('dock');`);
    expect(sfc).toContain('useFixture(() => ({ dock: dock.value }))');
    expect(sfc).toContain('ref="dock"');
    // No cast anywhere: `useTemplateRef<T>` gives `T | null`, which is exactly
    // what the controller's Refs declares. Matched as a CAST rather than as the
    // substring " as ", which any future comment could contain and which would
    // quietly turn this into a prose guard.
    expect(sfc).not.toMatch(/\bas\s+Kai\w+Element\b/);
    expect(sfc).not.toMatch(/\bas\s+HTMLElement\b/);
  });

  it('emits the composable as ONE shallowRef over the controller snapshot', () => {
    const composable = byPath(renderVueForm(block())).get('useFixture.ts')!;
    expect(composable).toContain('shallowRef<FixtureState>(controller.state())');
    expect(composable).toContain('createController({ refs })');
    expect(composable).toContain('controller.subscribe(');
    expect(composable).toContain('void controller.actions.boot();');
    expect(composable).toContain("from './fixture.controller'");
  });

  it('calls boot() from onMounted, after the ready-gated tree has rendered', () => {
    const composable = byPath(renderVueForm(block())).get('useFixture.ts')!;
    expect(composable).toContain('await nextTick();\n    void controller.actions.boot();');
    expect(composable).toContain("import { nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue';");
  });

  it('names the one config line a Vue project needs, in the README', () => {
    const readme = byPath(renderVueForm(block())).get('README.md')!;
    expect(readme).toContain('isCustomElement');
    expect(readme).toContain('Fixture.vue');
  });

  it('cross-checks the bindings against the controller, as every other form does', () => {
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderVueForm(b)).toThrow(/nope/);
  });

  it('refuses a block with no controller, by the file name it wanted', () => {
    const b = block();
    (b.files as Map<string, string>).delete('fixture.controller.ts');
    expect(() => renderVueForm(b)).toThrow(/fixture\.controller\.ts/);
  });
});
