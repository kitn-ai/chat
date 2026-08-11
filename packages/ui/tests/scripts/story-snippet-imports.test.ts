/**
 * GUARD — an `import { … } from '@kitn.ai/ui…'` inside a Storybook doc snippet must
 * be one a reader can actually copy and run.
 *
 * Snippets live in STRING LITERALS (the `docs.source.code` parameter), so no
 * compiler ever looks at them. After the `./solid` split moved the full SolidJS
 * surface off "." onto `@kitn.ai/ui/solid`, 31 snippets across 26 story files were
 * left telling the reader to import `Input`, `Nav`, `Dialog`, `Thread`, `Composer`,
 * … from "." — where they no longer exist. Two of them (`PaneGrid`, and the
 * `createPresence`/`usePosition`/`useDismiss` overlay trio) named symbols that were
 * exported from neither entry.
 *
 * So: for every such snippet, resolve the named symbols against the entry the
 * snippet actually names, and fail on any that is not exported there.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const ENTRIES: Record<string, string> = {
  '@kitn.ai/ui': 'src/index.ts',
  '@kitn.ai/ui/solid': 'src/solid.ts',
  '@kitn.ai/ui/state': 'src/state/index.ts',
  '@kitn.ai/ui/wire': 'src/wire/index.ts',
  // The `./elements` TYPES entry. Its dist twin (dist/elements.d.ts) is generated
  // from this same file by scripts/gen-element-types.mjs, so the two cannot differ.
  '@kitn.ai/ui/elements': 'src/elements/element-types.d.ts',
};

const tsconfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile(resolve(pkgRoot, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  pkgRoot,
);
const entryPaths = Object.values(ENTRIES).map((p) => resolve(pkgRoot, p));
const program = ts.createProgram(entryPaths, { ...tsconfig.options, noEmit: true });
const checker = program.getTypeChecker();

const exportsByEntry = new Map<string, Set<string>>();
for (const [spec, rel] of Object.entries(ENTRIES)) {
  const sf = program.getSourceFile(resolve(pkgRoot, rel));
  const sym = sf && checker.getSymbolAtLocation(sf);
  exportsByEntry.set(spec, new Set(sym ? checker.getExportsOfModule(sym).map((s) => s.name) : []));
}

function storyFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) storyFiles(p, out);
    else if (p.endsWith('.stories.tsx')) out.push(p);
  }
  return out;
}

/** `import { A, type B } from '@kitn.ai/ui…'` anywhere in a story file's text. */
const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'(@kitn\.ai\/ui(?:\/[a-z-]+)?)'/g;

interface SnippetImport { file: string; spec: string; names: string[] }

const found: SnippetImport[] = [];
for (const file of storyFiles(resolve(pkgRoot, 'src')).sort()) {
  for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
    const names = m[1]
      .split(',')
      .map((s) => s.replace(/\btype\b/, '').trim())
      .map((s) => s.split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    found.push({ file: file.replace(`${pkgRoot}/`, ''), spec: m[2], names });
  }
}

describe('Storybook doc snippets import from an entry that exports the symbol', () => {
  it('finds the snippets at all (the rule is not vacuous)', () => {
    expect(found.length).toBeGreaterThan(50);
    expect(found.some((f) => f.spec === '@kitn.ai/ui/solid')).toBe(true);
    expect(found.some((f) => f.spec === '@kitn.ai/ui')).toBe(true);
    for (const set of exportsByEntry.values()) expect(set.size).toBeGreaterThan(0);
  });

  it('every named symbol is exported from the entry the snippet names', () => {
    const broken: string[] = [];
    for (const { file, spec, names } of found) {
      const available = exportsByEntry.get(spec);
      if (!available) {
        broken.push(`${file}: unknown entry '${spec}'`);
        continue;
      }
      for (const n of names) {
        if (!available.has(n)) broken.push(`${file}: '${n}' is not exported from '${spec}'`);
      }
    }
    expect(broken.sort()).toEqual([]);
  });
});
