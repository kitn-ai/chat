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

/**
 * The names in an `import { … }` list, as the kit would have to export them.
 *
 * `import { a, type B }` — the INLINE type modifier is stripped per specifier.
 * `IMPORT_RE` only strips the leading `import type {…}` form, so before this the
 * specifier arrived as the literal string `type SetMessages` and was looked up
 * under that name, which no `.d.ts` can ever export. That is a false RED, not a
 * false green: it reported the Vue starter's `type SetMessages` /
 * `type AssistantStream` as missing while `dist/state/index.d.ts` exports both,
 * and `vue-tsc -b` on the emitted project compiled them fine.
 *
 * React never tripped it because React consumes the kit's own `useKaiChat`; the
 * three starters that hand-port it — vue, svelte, angular — all write this exact
 * import, so the bug was waiting behind every one of them.
 */
export function parseNamedSpecifiers(list: string): string[] {
  return list
    .split(',')
    .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

async function collectImports(): Promise<TemplateImport[]> {
  const found: TemplateImport[] = [];
  for (const file of await walk(TEMPLATE_ROOT)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      found.push({
        file: path.relative(TEMPLATE_ROOT, file),
        specifier: match[2],
        named: parseNamedSpecifiers(match[1] ?? ''),
      });
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

/** Names declared or re-exported BY NAME in one `.d.ts`'s own text. */
function ownExportedNames(dts: string): Set<string> {
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

/** `export * from './index.js'` — a re-export with no names to read. */
const STAR_REEXPORT_RE = /export\s+\*\s+from\s*['"](\.[^'"]*)['"]/g;

/**
 * Every name a `.d.ts` exports, FOLLOWING `export *` re-exports.
 *
 * WHY THE RECURSION, because the flat version was a false-negative generator and
 * it took a sixth `ready` framework to expose it. `dist/solid.d.ts` is
 * `export * from './index.js'` plus the Solid-only additions — that star is the
 * entire reason `@kitn.ai/ui/solid` is a strict superset of `.`. Reading only
 * the file's own text therefore found the ~40 names Solid ADDS and none of the
 * ~250 it inherits, so the first Solid template to import `Button` or `Message`
 * was told the kit has no such export. Twenty-eight of those, all wrong.
 *
 * That direction of error is the loud one — a red build over working code — and
 * it is the survivable half. The dangerous half is the same blind spot pointing
 * the other way: any kit entry that re-exports through a star could drop a name
 * the templates use and this rule would keep passing, because it was never
 * reading through the star to notice. It asserted over a fraction of the surface
 * while its name claimed all of it.
 *
 * `seen` guards against a cyclic re-export chain rather than trusting the
 * kit's barrels to stay acyclic — a cycle here would be an infinite loop in the
 * test suite, which is a much worse failure than a wrong answer.
 */
async function exportedNames(dtsPath: string, seen = new Set<string>()): Promise<Set<string>> {
  if (seen.has(dtsPath) || !existsSync(dtsPath)) return new Set();
  seen.add(dtsPath);

  const source = await readFile(dtsPath, 'utf8');
  const names = ownExportedNames(source);
  for (const match of source.matchAll(STAR_REEXPORT_RE)) {
    const target = path.resolve(path.dirname(dtsPath), match[1].replace(/\.js$/, '.d.ts'));
    for (const name of await exportedNames(target, seen)) names.add(name);
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
});

/** The names an import list asks for that the kit does not export. */
async function missingNames(imports: TemplateImport[]): Promise<string[]> {
  const kitPkg = JSON.parse(await readFile(path.join(KIT_ROOT, 'package.json'), 'utf8'));
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
    const names = await exportedNames(dtsPath);
    for (const name of entry.named) {
      if (!names.has(name)) missing.push(`${entry.file}: ${entry.specifier} has no '${name}'`);
    }
  }
  return missing;
}

describe('templates agree with the workspace kit (cont.)', () => {
  it('imports only names the kit exports', async () => {
    expect(await missingNames(await collectImports())).toEqual([]);
  });

  /**
   * THE NEGATIVE CONTROL for the inline-`type` fix above.
   *
   * Stripping `type ` off a specifier is one character away from stripping the
   * specifier's meaning, and a guard that stops reporting anything looks exactly
   * like a guard that passes. So this runs a synthetic import through the SAME
   * `missingNames` lookup the real test uses and asserts both halves at once: a
   * real inline-type name resolves, and a fake one beside it is still caught.
   *
   * Without the fix the first name fails too, so this test is red before AND
   * after in different ways — which is the point.
   */
  it('still catches a name the kit lacks, inline type modifier or not', async () => {
    const missing = await missingNames([
      {
        file: 'synthetic/useChat.ts',
        specifier: '@kitn.ai/ui/state',
        named: parseNamedSpecifiers('appendMessage, type SetMessages, type NotAKitExport'),
      },
    ]);
    expect(missing).toEqual([
      "synthetic/useChat.ts: @kitn.ai/ui/state has no 'NotAKitExport'",
    ]);
  });

  /**
   * Names reached through `export *` resolve, and a fake one beside them is
   * still caught.
   *
   * `dist/solid.d.ts` is `export * from './index.js'` plus the Solid-only
   * additions — the star IS the "strict superset" invariant. `Button`,
   * `Message` and `ChatMessage` are declared on `./index.js` and appear nowhere
   * in solid.d.ts's own text, so before the recursion in `exportedNames` all
   * three came back missing and the Solid template reported 28 phantom errors
   * over imports that compile.
   *
   * The fake name is the half that keeps this from being a rule that says yes to
   * everything: following a star re-export is one edit away from collecting so
   * many names that nothing is ever missing, and that failure would look
   * identical to a pass.
   */
  it('resolves names inherited through an `export *`, and still catches a fake', async () => {
    const missing = await missingNames([
      {
        file: 'synthetic/App.tsx',
        specifier: '@kitn.ai/ui/solid',
        named: parseNamedSpecifiers('Button, Message, type ChatMessage, NotASolidExport'),
      },
    ]);
    expect(missing).toEqual([
      "synthetic/App.tsx: @kitn.ai/ui/solid has no 'NotASolidExport'",
    ]);
  });
});
