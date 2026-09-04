/**
 * The svelte form: a `.svelte` component over the custom elements, plus a
 * `.svelte.ts` rune adapter holding one `$state` snapshot.
 *
 * THE THREE THINGS THAT ARE NOT OBVIOUS, each pinned below:
 *
 * 1. The adapter is named `.svelte.ts`, not `.ts`: the runes compiler runs on
 *    `.svelte` and `.svelte.ts` files only, so `$state` in a plain module is
 *    a compile error, not a silent no-op.
 * 2. The registration await lives in `onMount`, which never runs during
 *    server rendering -- `customElements` does not exist on the server.
 * 3. A kai prop is set PLAINLY (no `.prop` modifier the way vue needs one):
 *    svelte's own `set_custom_element_data` assigns the PROPERTY once the
 *    element is registered and the name is one of its setters, and the tree
 *    is gated on registration, so a bound `false` clears rather than writing
 *    the string "false".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderSvelteForm } from '../src/forms';
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

describe('the svelte form', () => {
  it('emits the component, the rune adapter, the controller, the css and a README', () => {
    expect([...byPath(renderSvelteForm(block())).keys()].sort()).toEqual([
      'Fixture.svelte', 'README.md', 'fixture.controller.ts', 'fixture.css', 'useFixture.svelte.ts',
    ]);
  });

  it('names the adapter .svelte.ts, because runes do not compile in a plain module', () => {
    // `$state` outside a .svelte or .svelte.ts file is a compile error, not a
    // silent no-op, so the extension is load-bearing rather than a convention.
    const adapter = byPath(renderSvelteForm(block())).get('useFixture.svelte.ts')!;
    expect(adapter).toContain('$state');
    expect(adapter).toContain('onMount');
  });

  it('targets every file at src/lib/components/<id>/', () => {
    for (const file of renderSvelteForm(block())) {
      expect(file.target).toBe(`src/lib/components/fixture/${file.path}`);
    }
  });

  it('does the registration await inside onMount, which never runs on the server', () => {
    const adapter = byPath(renderSvelteForm(block())).get('useFixture.svelte.ts')!;
    expect(adapter).toContain("import '@kitn.ai/ui/elements';");
    expect(adapter).toContain(`const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];`);
    expect(adapter).toMatch(/onMount\(\(\) => \{[\s\S]*customElements\.whenDefined/);
    // `customElements` does not exist on the server, and a SvelteKit page
    // renders this component there. `onMount` never runs during server
    // rendering, which is the whole reason the await lives in one rather than
    // at call time.
    //
    // Asserted as CONTAINMENT, not absence. The emitted adapter's await IS
    // indented, so a `/^\s*await Promise\.all\(TAGS/m` absence check would match
    // the correct line and fail against the renderer this task specifies. What
    // must not exist is the same await at module top level, with no indentation
    // and no hook around it.
    expect(adapter).toMatch(/onMount\(\(\) => \{[\s\S]*await Promise\.all\(TAGS/);
    expect(adapter).not.toMatch(/^await Promise\.all\(TAGS/m);
  });

  it('calls boot() from onMount, after the ready-gated tree has been flushed to the DOM', () => {
    const adapter = byPath(renderSvelteForm(block())).get('useFixture.svelte.ts')!;
    expect(adapter).toContain('await tick();\n      void controller.actions.boot();');
    expect(adapter).toContain("import { onMount, tick } from 'svelte';");
  });

  it('gates the tree on ready, and takes the ref through bind:this', () => {
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('{#if fixture.ready}');
    expect(sfc).toContain("import type { KaiDockElement } from '@kitn.ai/ui/elements';");
    expect(sfc).toContain('let dock = $state<KaiDockElement | null>(null);');
    expect(sfc).toContain('bind:this={dock}');
    expect(sfc).toContain('useFixture(() => ({ dock }))');
  });

  it('binds a kai prop by its camel name, plainly, and says why that is a property', () => {
    // Svelte's set_custom_element_data assigns the PROPERTY when the element is
    // registered and the name is one of its setters, and the tree is gated on
    // registration. So a plain attribute here IS the property assignment, and a
    // bound `false` does not become the string "false".
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('unread={fixture.state.hidden}');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations .activeId="title">'),
    );
    expect(byPath(renderSvelteForm(b)).get('Fixture.svelte')).toContain('activeId={fixture.state.title}');
  });

  it('wires an event with the on<name> attribute svelte 5 compiles to addEventListener', () => {
    // Verified against svelte 5.56's compiler: `onkai-click={fn}` emits
    // `$.event('kai-click', node, fn)`, which is exactly right for an event
    // that does not bubble.
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('onkai-click={fixture.actions.open}');
  });

  it('renders a *for as a KEYED each, which is what the mandatory :key becomes here', () => {
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('{#each fixture.state.rows as row (row.id)}');
    expect(sfc).toContain('{row.title}');
    expect(sfc).not.toMatch(/state\.row\./);
  });

  it('emits a seed as a static attribute and a ="false" literal as a bound false', () => {
    const sfc = byPath(renderSvelteForm(block())).get('Fixture.svelte')!;
    expect(sfc).toContain('position="bottom-end"');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false" compact>'),
    );
    const other = byPath(renderSvelteForm(b)).get('Fixture.svelte')!;
    expect(other).toContain('searchable={false}');
    expect(other).toContain('compact={true}');
  });

  it('the README says how to render it and claims no config a Svelte project does not need', () => {
    const readme = byPath(renderSvelteForm(block())).get('README.md')!;
    expect(readme).toContain('Fixture.svelte');
    // Svelte needs no isCustomElement equivalent: any dashed tag is an element.
    expect(readme).not.toContain('isCustomElement');
  });

  it('cross-checks the bindings against the controller', () => {
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderSvelteForm(b)).toThrow(/nope/);
  });
});
