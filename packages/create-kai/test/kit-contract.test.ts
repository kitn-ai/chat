/**
 * The drift guard: every `@kitn.ai/ui` import the TEMPLATES make must be
 * something the kit actually exports.
 *
 * WHY THIS EXISTS, WITH THE INCIDENT. `create-kai` pins a published range of
 * `@kitn.ai/ui` and copies templates out of `examples/starters/*`. Those two
 * move independently: the starters track the workspace kit and are CI-built
 * against `workspace:*`, while the pin points at npm. When the parts[] migration
 * landed in the tree but not on npm, the React starter imported
 * `@kitn.ai/ui/wire`, `MessagePart` and `createMockResponder` — none of which the
 * latest published version had. The emitted project installed cleanly and then
 * failed with nine type errors on `npm run build`.
 *
 * So this test reads the imports out of the templates and checks them against
 * the kit's own `exports` map and `.d.ts` files. It runs against the WORKSPACE
 * kit, which is the version the templates are written for, so a green run means
 * "templates agree with the kit they ship beside" — it does NOT by itself prove
 * the PINNED range is publishable. `verify-pin.mjs` is the check for that, and
 * it needs the network.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PKG_ROOT = path.resolve(__dirname, '..');
const TEMPLATE_ROOT = path.join(PKG_ROOT, 'dist/templates');

/**
 * The kit to check the templates against. Defaults to the workspace kit.
 *
 * `KAI_KIT_ROOT` points it at any extracted `@kitn.ai/ui` package instead —
 * which is how the same assertions become a PUBLISH gate: run them against the
 * npm tarball the pin resolves to, and a green result means an emitted project
 * will actually build for a user. Run against published 0.20.1 today it fails,
 * which is correct and is the reason `create-kai` cannot publish yet.
 */
const KIT_ROOT = process.env.KAI_KIT_ROOT
  ? path.resolve(process.env.KAI_KIT_ROOT)
  : path.resolve(PKG_ROOT, '../ui');

interface TemplateImport {
  file: string;
  specifier: string;
  named: string[];
}

/** `import { a, b } from 'x'`, `import type { c } from 'x'`, `import 'x'`. */
const IMPORT_RE = /import\s+(?:type\s+)?(?:\{([^}]*)\}\s*from\s*)?['"](@kitn\.ai\/ui[^'"]*)['"]/g;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir)) {
    if (entry === 'node_modules') continue;
    const abs = path.join(dir, entry);
    if ((await stat(abs)).isDirectory()) out.push(...(await walk(abs)));
    else if (/\.(?:ts|tsx|js|jsx|vue|svelte)$/.test(entry)) out.push(abs);
  }
  return out;
}

async function collectImports(): Promise<TemplateImport[]> {
  const found: TemplateImport[] = [];
  for (const file of await walk(TEMPLATE_ROOT)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const named = (match[1] ?? '')
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      found.push({ file: path.relative(TEMPLATE_ROOT, file), specifier: match[2], named });
    }
  }
  return found;
}

/** The `types` file the kit's exports map gives for a subpath, if any. */
function resolveTypes(exportsMap: Record<string, unknown>, specifier: string): string | null {
  const subpath = specifier === '@kitn.ai/ui' ? '.' : `.${specifier.slice('@kitn.ai/ui'.length)}`;
  const entry = exportsMap[subpath];
  if (entry === undefined) return null;
  if (typeof entry === 'string') return entry;
  const types = (entry as Record<string, string>).types;
  return types ?? null;
}

/** Names re-exported by a bundled `.d.ts`, from its `export { … }` lists. */
function exportedNames(dts: string): Set<string> {
  const names = new Set<string>();
  for (const match of dts.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of dts.matchAll(
    /export\s+declare\s+(?:function|const|let|var|class|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1]);
  }
  for (const match of dts.matchAll(/export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  return names;
}

describe('templates agree with the workspace kit', () => {
  it('has templates and a built kit to check against', () => {
    expect(existsSync(TEMPLATE_ROOT), `run \`pnpm --filter create-kai run build\` first`).toBe(true);
    expect(
      existsSync(path.join(KIT_ROOT, 'dist')),
      'run `nx build ui` first — this test reads the kit\'s built .d.ts files',
    ).toBe(true);
  });

  it('imports only subpaths the kit exports', async () => {
    const kitPkg = JSON.parse(await readFile(path.join(KIT_ROOT, 'package.json'), 'utf8'));
    const imports = await collectImports();
    expect(imports.length, 'templates import nothing from @kitn.ai/ui — that cannot be right').
      toBeGreaterThan(0);

    const unknown = imports
      .filter((i) => resolveTypes(kitPkg.exports, i.specifier) === null && !kitPkg.exports[
        i.specifier === '@kitn.ai/ui' ? '.' : `.${i.specifier.slice('@kitn.ai/ui'.length)}`
      ])
      .map((i) => `${i.file}: ${i.specifier}`);
    expect(unknown).toEqual([]);
  });

  it('imports only names the kit exports', async () => {
    const kitPkg = JSON.parse(await readFile(path.join(KIT_ROOT, 'package.json'), 'utf8'));
    const imports = await collectImports();
    const missing: string[] = [];

    for (const entry of imports) {
      if (entry.named.length === 0) continue;
      const types = resolveTypes(kitPkg.exports, entry.specifier);
      if (!types) continue;
      const dtsPath = path.join(KIT_ROOT, types);
      if (!existsSync(dtsPath)) {
        missing.push(`${entry.file}: ${entry.specifier} has no built types at ${types}`);
        continue;
      }
      const names = exportedNames(await readFile(dtsPath, 'utf8'));
      for (const name of entry.named) {
        if (!names.has(name)) missing.push(`${entry.file}: ${entry.specifier} has no '${name}'`);
      }
    }

    expect(missing).toEqual([]);
  });
});
