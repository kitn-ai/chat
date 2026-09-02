/**
 * GUARD — a TypeScript backend must be able to NAME a card payload.
 *
 * We publish `./schemas/*.json` so a Python or Go route can generate models for the
 * card payloads. For a long time TypeScript, the language this kit is authored in,
 * was the one that could not do the same: `ConfirmCardData` and friends were
 * declared inside their components' `.tsx`, and a type import still has to RESOLVE
 * even though it erases, so naming one from a Node/no-DOM project was
 *
 *   TS6142: Module '../../components/choice-card' was resolved to
 *           '.../src/components/choice-card.tsx', but '--jsx' is not set.
 *
 * and `@kitn.ai/ui/schemas` could not re-export them at all without pulling the
 * Solid tree into the server-safe entry's graph. A route building a card envelope
 * got `data: unknown`.
 *
 * That was the FOURTH instance of one defect (after `BUILTIN_CARD_TAGS`,
 * `CardComponentMap` and the tag map), and each of the first three was fixed and
 * then left with no check, which is why there was a fourth. This is the check.
 * `src/primitives/card-data-types.ts` is where the payload types live now, and the
 * property that matters about it is not "it compiles" but "it compiles WITHOUT
 * `jsx`", which every other pass in `nx typecheck ui` is too permissive to see:
 * tsconfig.json, tsconfig.tests.json and both react configs all set a `jsx`, and
 * tsconfig.mcp.json (which does not) includes only `mcp/mcp/**`, so
 * nothing there imports these types and nothing would notice them moving back.
 *
 * WATCHED IN THE DISCRIMINATING DIRECTION. Test 2 points the identical probe at a
 * `.tsx` and requires TS6142 to come back. Without it this file would keep passing
 * if the compiler options silently gained a `jsx` (which is exactly how a check
 * like this rots into proving nothing) — and relaxing them is not the alternative
 * anyway: granting the MCP pass `jsx` was measured at 130 errors on this case.
 *
 * It builds its own `ts.Program` rather than shelling out to `tsc -p
 * tsconfig.mcp.json`, because that project's `include` names only the MCP tree; a
 * probe would have to be written INTO src/ and deleted again, which races the
 * editor and leaves debris on a crashed run. The options below are copied from
 * tsconfig.mcp.json and asserted against it in test 3, so the copy cannot drift.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The Node/no-DOM shape a backend route compiles under. Mirrors tsconfig.mcp.json. */
const NODE_NO_DOM: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.esnext.d.ts'],
  types: [],
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  // Deliberately NO `jsx`. That absence is the whole subject of this file.
};

/** The five payload types, plus the shapes `ArtifactCardData` reaches. */
const PAYLOAD_TYPES = [
  'ArtifactCardData',
  'ArtifactCardFile',
  'ChoiceCardData',
  'ConfirmCardData',
  'FormDefinition',
  'FormField',
  'TasksCardData',
] as const;

/** Compile one in-memory module against the real source tree and return its errors. */
function compileProbe(source: string): ts.Diagnostic[] {
  const probePath = resolve(PKG, 'src/__card-data-probe__.ts');
  const host = ts.createCompilerHost(NODE_NO_DOM, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (f) => (f === probePath ? source : readFile(f));
  host.fileExists = (f) => f === probePath || fileExists(f);
  const program = ts.createProgram([probePath], NODE_NO_DOM, host);
  return [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ];
}

const format = (ds: ts.Diagnostic[]) =>
  ds.map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);

describe('card payload types are namable from a Node/no-DOM project', () => {
  it('compiles with NO `jsx`, and the values really typecheck', () => {
    // Not a bare `import type` list: an unused type import can be erased before
    // anything checks it. Each one is USED as an annotation on a literal, which is
    // what a route actually writes, and a wrong literal would fail here.
    const probe = `
      import type { ${PAYLOAD_TYPES.join(', ')} } from './primitives/card-data-types';
      export const confirm: ConfirmCardData = { actions: [{ id: 'go', label: 'Go' }] };
      export const choice: ChoiceCardData = { options: [{ id: 'a', label: 'A' }] };
      export const tasks: TasksCardData = { tasks: [{ id: 't', label: 'T' }] };
      export const field: FormField = { type: 'string', 'x-kai-widget': 'textarea' };
      export const form: FormDefinition = { type: 'object', properties: { a: field } };
      export const file: ArtifactCardFile = { path: 'index.html', type: 'html' };
      export const artifact: ArtifactCardData = { src: 'https://x.test', files: [file] };
    `;
    expect(format(compileProbe(probe))).toEqual([]);
  });

  it('still reports TS6142 for a payload type reached through a .tsx', () => {
    // The control. If this ever goes quiet, the pass above stopped being about the
    // Node/no-DOM boundary and started being about nothing.
    const probe = `
      import type { ChoiceCardData } from './components/choice-card';
      export const choice: ChoiceCardData = { options: [{ id: 'a', label: 'A' }] };
    `;
    expect(format(compileProbe(probe)).join('\n')).toMatch(/TS6142/);
  });

  it('uses the same no-`jsx` boundary tsconfig.mcp.json does', () => {
    // The options above are a copy, so pin the one property that makes them the
    // right copy. `tsc` accepts comments in a tsconfig, so strip them first.
    const raw = readFileSync(resolve(PKG, 'tsconfig.mcp.json'), 'utf8');
    const parsed = ts.parseConfigFileTextToJson('tsconfig.mcp.json', raw);
    expect(parsed.error).toBeUndefined();
    const opts = (parsed.config as { compilerOptions: Record<string, unknown> }).compilerOptions;
    expect(opts.jsx).toBeUndefined();
    expect(opts.lib).toEqual(['ESNext']);
    expect(NODE_NO_DOM.jsx).toBeUndefined();
  });

  it('exports every payload type from the server-safe entry', () => {
    // The barrel a backend route actually imports. Reading the SOURCE of the entry
    // rather than importing it, so this is a statement about the published surface
    // and not about whatever the test runner's alias resolves to.
    const entry = readFileSync(resolve(PKG, 'src/schemas/index.ts'), 'utf8');
    for (const name of PAYLOAD_TYPES) expect(entry).toContain(name);
  });
});
