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

  it('never drops a seed colliding with a .prop/:attr binding on the same element: it applies in onMount instead', () => {
    // Controller ruling B2-T3-a. Svelte's set_custom_element_data assigns
    // the property for a bound expression AND for a plain attribute of the
    // same name -- source order would decide silently which one wins -- so
    // the colliding seed cannot stay a static attribute here either. It
    // becomes a one-time setAttribute on the element's own bind:this ref,
    // applied after the ready-gated tree has rendered and before boot().
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(
        'seed:position="bottom-end" .unread="hidden"',
        'seed:position="bottom-end" seed:unread="true" .unread="hidden"',
      ),
    );
    const files = byPath(renderSvelteForm(b));
    const sfc = files.get('Fixture.svelte')!;
    const adapter = files.get('useFixture.svelte.ts')!;
    // Not a static attribute anywhere: the reactive binding it collides with
    // is unaffected.
    expect(sfc).not.toContain('unread="true"');
    expect(sfc).toContain('unread={fixture.state.hidden}');
    // The OTHER seed on the same element, which does not collide, is
    // unaffected: still a plain static attribute.
    expect(sfc).toContain('position="bottom-end"');
    // dock already has a #ref, so the seed reuses it rather than inventing a
    // synthetic one.
    expect(adapter).toContain("setAttribute('unread', 'true')");
    const tickAt = adapter.indexOf('await tick();');
    const seedAt = adapter.indexOf("setAttribute('unread', 'true')");
    const bootAt = adapter.indexOf('void controller.actions.boot();');
    expect(tickAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(tickAt);
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
    const files = byPath(renderSvelteForm(b));
    const sfc = files.get('Fixture.svelte')!;
    const adapter = files.get('useFixture.svelte.ts')!;
    // The literal is unaffected; it still renders as authored.
    expect(sfc).toContain('label="orig"');
    // The seed never becomes a second, colliding "label" attribute.
    expect(sfc).not.toMatch(/label="seeded"/);
    expect(adapter).toContain("setAttribute('label', 'seeded')");
    expect(sfc).toMatch(/let seedRef\d+ = \$state<KaiConversationsElement \| null>\(null\);/);
    expect(sfc).toMatch(/bind:this=\{seedRef\d+\}/);
    const tickAt = adapter.indexOf('await tick();');
    const seedAt = adapter.indexOf("setAttribute('label', 'seeded')");
    const bootAt = adapter.indexOf('void controller.actions.boot();');
    expect(tickAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(tickAt);
    expect(bootAt).toBeGreaterThan(seedAt);
  });

  it('escapes {, }, <, > and & in text, and passes a comment through unescaped', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(
        '<span .textContent="title"></span>',
        '<!-- note --><span>a { b } &lt; c &amp; d &gt; e</span>',
      ),
    );
    const sfc = byPath(renderSvelteForm(b)).get('Fixture.svelte')!;
    // Every stray brace is escaped (unlike vue's paired-mustache rule): a
    // single `{` or `}` is enough to open or close a svelte expression.
    expect(sfc).toContain('a &#123; b &#125; &lt; c &amp; d &gt; e');
    expect(sfc).not.toContain('a { b } < c & d > e');
    // A comment node passes through: nothing inside an HTML comment needs
    // entity escaping, only a literal `-->` would (defensive, unreachable
    // through an authored page -- the parser that read it would have already
    // closed the comment on that sequence).
    expect(sfc).toContain('<!-- note -->');
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
