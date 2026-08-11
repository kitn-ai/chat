/**
 * GUARD — the generated element type declarations must be VALID with
 * `skipLibCheck: false`.
 *
 * `tsconfig.json` (and every consumer template we ship) sets `skipLibCheck: true`,
 * which tells tsc to skip type-checking `.d.ts` files ENTIRELY. That is why
 * `src/elements/element-types.d.ts` — a `.d.ts`, and the `./elements` types entry
 * once it is copied to `dist/elements.d.ts` — was able to ship five errors that no
 * pass in `npm run typecheck` could see:
 *
 *   3 × TS2430  KaiConfirmElement / KaiMessageElement / KaiResizableItemElement
 *               "incorrectly extends interface 'HTMLElement'" (autofocus / role / hidden)
 *   2 × TS2344  raised inside lib.dom.d.ts, because `role` is declared by `Element`,
 *               so `HTMLElementTagNameMap[K] extends Element` no longer holds
 *   2 × TS2304  `CodeHighlightingOptions` / `ToolKind` referenced by the local
 *               `declare function` signatures but never imported into scope
 *
 * A consumer with `skipLibCheck: false` — the correct setting for a library that
 * wants its own types checked — gets all of them. This compiles the file the way
 * that consumer does, so a regression fails here instead of in their build.
 *
 * The file is GENERATED (scripts/gen-element-types.mjs). Fix the generator, not
 * the output.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_TYPES = resolve(pkgRoot, 'src/elements/element-types.d.ts');
const DIST_TYPES = resolve(pkgRoot, 'dist/elements.d.ts');

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  strict: true,
  // The whole point of this guard.
  skipLibCheck: false,
  noEmit: true,
  jsx: ts.JsxEmit.Preserve,
  jsxImportSource: 'solid-js',
  types: [],
};

/** Every diagnostic tsc reports for `file`, as `TSxxxx path(line,col): message` strings. */
function diagnose(file: string): string[] {
  const program = ts.createProgram([file], OPTIONS);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file && d.start !== undefined
      ? `${d.file.fileName.replace(`${pkgRoot}/`, '')}(${
          ts.getLineAndCharacterOfPosition(d.file, d.start).line + 1
        })`
      : '<no file>';
    return `TS${d.code} ${where}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').split('\n')[0]}`;
  });
}

/** The `export interface Kai…Element extends HTMLElement { … }` block of a copy. */
function interfaceBlock(source: string): string {
  const start = source.indexOf('export interface Kai');
  const end = source.indexOf('declare global {');
  expect(start, 'element interfaces not found').toBeGreaterThan(-1);
  expect(end, '`declare global` marker not found').toBeGreaterThan(start);
  return source.slice(start, end).trim();
}

describe('generated element types compile with skipLibCheck: false', () => {
  it('src/elements/element-types.d.ts has no diagnostics', () => {
    expect(diagnose(SRC_TYPES)).toEqual([]);
  });

  it('the shipped dist/elements.d.ts carries the SAME element interfaces', () => {
    // Conditional only on the build having run. The interfaces are one generated
    // string written to both copies, so asserting they are byte-identical makes
    // the check above cover the shipped copy too — it cannot silently diverge.
    if (!existsSync(DIST_TYPES)) {
      expect(existsSync(SRC_TYPES), 'no build yet; the src copy is still checked above').toBe(true);
      return;
    }
    expect(interfaceBlock(readFileSync(DIST_TYPES, 'utf8'))).toBe(
      interfaceBlock(readFileSync(SRC_TYPES, 'utf8')),
    );
  });

  it('dist/elements.d.ts has no diagnostics', () => {
    if (!existsSync(DIST_TYPES)) return;
    expect(diagnose(DIST_TYPES)).toEqual([]);
  });
});
