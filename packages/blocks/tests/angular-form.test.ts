/**
 * The angular form: a standalone `Component` with `CUSTOM_ELEMENTS_SCHEMA`
 * over the custom elements, its own `.component.html` template, and an
 * `@Injectable()` store holding one `signal` over the controller's snapshot.
 *
 * THE THREE THINGS THAT ARE NOT OBVIOUS, each pinned below:
 *
 * 1. The store is instance-scoped (`providers: [FixtureStore]`), never
 *    `providedIn: 'root'`: a controller owns conversation state and a
 *    subscription, and `root` would give two instances of the block one
 *    controller.
 * 2. There is no `fixture.component.css`: the block already ships its own
 *    stylesheet and the component names it through `styleUrls`.
 * 3. The refs are read in `ngAfterViewInit`, not the constructor: `viewChild`
 *    has nothing before the view exists, and `customElements.whenDefined`
 *    must not run during SSR.
 *
 * Angular is also the only host that CALLS the action from the template:
 * `strictTemplates` type-checks that call in both directions, so
 * `ControllerShape.actionArity` decides whether `$event` is passed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderAngularForm } from '../src/forms';
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

describe('the angular form', () => {
  it('emits the component, its template, the store, the controller, the css and a README', () => {
    expect([...byPath(renderAngularForm(block())).keys()].sort()).toEqual([
      'README.md', 'fixture.component.html', 'fixture.component.ts', 'fixture.controller.ts',
      'fixture.css', 'fixture.store.ts',
    ]);
  });

  it('targets every file at src/app/components/<id>/', () => {
    for (const file of renderAngularForm(block())) {
      expect(file.target).toBe(`src/app/components/fixture/${file.path}`);
    }
  });

  it('declares CUSTOM_ELEMENTS_SCHEMA and provides its own store', () => {
    const ts = byPath(renderAngularForm(block())).get('fixture.component.ts')!;
    expect(ts).toContain('schemas: [CUSTOM_ELEMENTS_SCHEMA]');
    // Instance-scoped, never providedIn: 'root'. Two instances of the block
    // sharing one controller would share its conversation state.
    expect(ts).toContain('providers: [FixtureStore]');
    expect(ts).toContain("templateUrl: './fixture.component.html'");
    expect(ts).toContain("styleUrls: ['./fixture.css']");
  });

  it('takes its refs through viewChild, typed by the element interface the tag names', () => {
    const ts = byPath(renderAngularForm(block())).get('fixture.component.ts')!;
    expect(ts).toContain("import type { KaiDockElement } from '@kitn.ai/ui/elements';");
    expect(ts).toContain(`private readonly dock = viewChild<ElementRef<KaiDockElement>>('dock');`);
    expect(ts).toContain('ngAfterViewInit');
    expect(ts).toContain('dock: this.dock()?.nativeElement ?? null');
    // No cast: ElementRef<T>.nativeElement is T, and the controller's Refs
    // declares T | null. Matched as a CAST, not as the substring " as ": the
    // emitted comment above already breaks "resolve them as / components"
    // across a line, and the next comment might not.
    expect(ts).not.toMatch(/\bas\s+Kai\w+Element\b/);
    expect(ts).not.toMatch(/\bas\s+HTMLElement\b/);
  });

  it('binds a kai property with [camelName] and an attr binding with [attr.name] on a plain tag', () => {
    const html = byPath(renderAngularForm(block())).get('fixture.component.html')!;
    expect(html).toContain('[unread]="store.state().hidden"');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations .activeId="title">'),
    );
    expect(byPath(renderAngularForm(b)).get('fixture.component.html')).toContain(
      '[activeId]="store.state().title"',
    );
  });

  it('gates the template on ready and reads the signal, never a stale snapshot', () => {
    const html = byPath(renderAngularForm(block())).get('fixture.component.html')!;
    expect(html).toContain('@if (store.ready()) {');
    expect(html).toContain('{{ store.state().title }}');
    expect(html).toContain('@for (row of store.state().rows; track row.id) {');
    expect(html).not.toMatch(/state\(\)\.row\./);
  });

  it('wires an event with the dashed name Angular passes straight to addEventListener', () => {
    const html = byPath(renderAngularForm(block())).get('fixture.component.html')!;
    expect(html).toContain('(kai-click)="store.actions.open()"');
  });

  it('passes $event to an action that DECLARES a parameter, and to no other', () => {
    // Both directions are TS2554 under strictTemplates: a zero-arg action
    // called with $event is "Expected 0 arguments, but got 1", and a one-arg
    // action called with none is "Expected 1 arguments, but got 0". Nothing
    // about the event NAME predicts which -- kai-click carries no detail, and
    // support-widget.controller.ts mixes both arities across kai-* events in
    // ONE template -- so the renderer reads ControllerShape.actionArity.
    //
    // The shared fixture declares only zero-arg actions, so this case builds
    // the mixed shape rather than changing the fixture out from under the vue,
    // svelte and solid suites, which pin its emitted output byte for byte.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.controller.ts',
      CONTROLLER.replace('  open(): void;', '  open(): void;\n  pick(event: CustomEvent<{ id: string }>): void;'),
    );
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations @kai-conversation-select="pick">'),
    );
    const html = byPath(renderAngularForm(b)).get('fixture.component.html')!;
    expect(html).toContain('(kai-click)="store.actions.open()"');
    expect(html).toContain('(kai-conversation-select)="store.actions.pick($event)"');
    expect(html).not.toContain('store.actions.open($event)');
    expect(html).not.toContain('store.actions.pick()');
  });

  it('emits a seed as a static attribute and translates a ="false" literal', () => {
    const html = byPath(renderAngularForm(block())).get('fixture.component.html')!;
    expect(html).toContain('position="bottom-end"');
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations searchable="false" compact>'),
    );
    const other = byPath(renderAngularForm(b)).get('fixture.component.html')!;
    expect(other).toContain('[searchable]="false"');
    expect(other).toContain('[compact]="true"');
  });

  it('the store is a signal over the controller, seeded with every declared ref', () => {
    const store = byPath(renderAngularForm(block())).get('fixture.store.ts')!;
    expect(store).toContain('@Injectable()');
    expect(store).toContain('signal<FixtureState>(');
    expect(store).toContain("import '@kitn.ai/ui/elements';");
    expect(store).toContain(`const TAGS = ['kai-conversation-item', 'kai-conversations', 'kai-dock'];`);
    expect(store).toContain('{ dock: null }');
    // boot() is NOT called here: it is scheduled from the component's
    // ngAfterViewInit, after Angular has rendered the ready-gated template.
    expect(store).not.toContain('boot();');
  });

  it('calls boot() from ngAfterViewInit, through afterNextRender', () => {
    const ts = byPath(renderAngularForm(block())).get('fixture.component.ts')!;
    expect(ts).toContain('afterNextRender(() => { void this.store.actions.boot(); }, { injector: this.injector });');
    expect(ts).toContain("import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, Injector, afterNextRender, inject, viewChild } from '@angular/core';");
  });

  it('the README names CUSTOM_ELEMENTS_SCHEMA and the style scoping', () => {
    const readme = byPath(renderAngularForm(block())).get('README.md')!;
    expect(readme).toContain('CUSTOM_ELEMENTS_SCHEMA');
    expect(readme).toContain('fixture.css');
  });

  it('cross-checks the bindings against the controller', () => {
    const b = block();
    (b.files as Map<string, string>).set('fixture.html', PAGE.replace('@kai-click="open"', '@kai-click="nope"'));
    expect(() => renderAngularForm(b)).toThrow(/nope/);
  });

  it('never drops a seed colliding with a [prop] binding on the same element: it applies in ngAfterViewInit instead', () => {
    // CONTROLLER RULING B2-T3-a, the same shape svelte-form.test.ts and
    // vue-form.test.ts pin. dock already has a #ref, so the seed reuses it
    // rather than inventing a synthetic one.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(
        'seed:position="bottom-end" .unread="hidden"',
        'seed:position="bottom-end" seed:unread="true" .unread="hidden"',
      ),
    );
    const files = byPath(renderAngularForm(b));
    const html = files.get('fixture.component.html')!;
    const store = files.get('fixture.store.ts')!;
    // Not a static attribute anywhere: the reactive binding it collides with
    // is unaffected.
    expect(html).not.toContain('unread="true"');
    expect(html).toContain('[unread]="store.state().hidden"');
    // The OTHER seed on the same element, which does not collide, is
    // unaffected: still a plain static attribute.
    expect(html).toContain('position="bottom-end"');
    expect(store).toContain("seedTargets['dock']?.setAttribute('unread', 'true');");
    const readyAt = store.indexOf('this.ready.set(true);');
    const seedAt = store.indexOf("setAttribute('unread', 'true')");
    expect(readyAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(readyAt);
    // boot() is the COMPONENT's job, scheduled after connect() resolves, so
    // the ordering guarantee is: ready gate, then the seed, then boot -- the
    // seed is applied inside connect(), which the component awaits before
    // scheduling boot() through afterNextRender.
    const ts = files.get('fixture.component.ts')!;
    const connectAt = ts.indexOf('this.store.connect(');
    const bootAt = ts.indexOf('void this.store.actions.boot();');
    expect(connectAt).toBeGreaterThan(-1);
    expect(bootAt).toBeGreaterThan(connectAt);
  });

  it('never drops a seed colliding with a literal attribute of the same name: it applies through a synthetic viewChild', () => {
    // The second collision shape B2-T3-a names: a literal attribute (not a
    // binding) claiming the same name. kai-conversations has no #ref in the
    // fixture, so this exercises the synthetic-ref path.
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace('<kai-conversations>', '<kai-conversations label="orig" seed:label="seeded">'),
    );
    const files = byPath(renderAngularForm(b));
    const html = files.get('fixture.component.html')!;
    const ts = files.get('fixture.component.ts')!;
    const store = files.get('fixture.store.ts')!;
    // The literal is unaffected; it still renders as authored.
    expect(html).toContain('label="orig"');
    // The seed never becomes a second, colliding "label" attribute.
    expect(html).not.toMatch(/label="seeded"/);
    expect(html).toMatch(/#seedRef\d+/);
    expect(ts).toMatch(/private readonly seedRef\d+ = viewChild<ElementRef<KaiConversationsElement>>\('seedRef\d+'\);/);
    expect(store).toContain("setAttribute('label', 'seeded')");
    const readyAt = store.indexOf('this.ready.set(true);');
    const seedAt = store.indexOf("setAttribute('label', 'seeded')");
    expect(readyAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(readyAt);
  });

  it('escapes {{, <, > and & in text, and passes a comment through unescaped', () => {
    const b = block();
    (b.files as Map<string, string>).set(
      'fixture.html',
      PAGE.replace(
        '<span .textContent="title"></span>',
        '<!-- note --><span>a {{ b }} &lt; c &amp; d &gt; e</span>',
      ),
    );
    const html = byPath(renderAngularForm(b)).get('fixture.component.html')!;
    // Only the SECOND brace of the OPENING `{{` is encoded (same rule as
    // vue.ts, which parses the same mustache shape): the entity decodes to
    // `{`, so the raw first brace plus the decoded second one renders as
    // `{{` again but no longer opens an Angular interpolation for the
    // compiler reading the source text. The closing `}}` needs no treatment,
    // the same reason vue's does not: it only closes an interpolation the
    // opening pair already started.
    expect(html).toContain('a {&#123; b }} &lt; c &amp; d &gt; e');
    expect(html).not.toContain('a {{ b }} < c & d > e');
    // A comment node passes through: nothing inside an HTML comment needs
    // entity escaping, only a literal `-->` would (defensive, unreachable
    // through an authored page -- the parser that read it would have already
    // closed the comment on that sequence).
    expect(html).toContain('<!-- note -->');
  });
});
