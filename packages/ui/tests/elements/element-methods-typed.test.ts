/**
 * GUARD — every imperative method an element exposes must be CALLABLE through the
 * shipped types.
 *
 * `defineWebComponent`'s `ctx.expose({ … })` attaches methods to the host element:
 * `dialog.show()`, `chat.scrollToBottom()`, `panel.maximize(0)`. They were extracted
 * into `element-meta.json` and `custom-elements.json` (so the docs and the kai MCP
 * advertised them) and emitted into NO type declaration, so the whole interaction
 * API — 37 of 80 elements — was a type error for anyone who followed the docs:
 *
 *   TS2339  Property 'maximize' does not exist on type 'KaiResizableElement'.
 *   TS2339  Property 'show' does not exist on type 'KaiDialogElement'.
 *   TS2339  Property 'scrollToBottom' does not exist on type 'KaiChatElement'.
 *
 * The attempted fix — a hand-written global `KaiResizableElement` in
 * `resizable.globals.d.ts` — could not work: `element-types.d.ts` declares its own
 * module-scoped interface of that name and maps the tag to THAT, so the two
 * `HTMLElementTagNameMap` entries collided (TS2717, invisible under the
 * `skipLibCheck: true` every pass sets) and the generated one won. The fix belongs
 * in the GENERATOR (`scripts/gen-element-types.mjs`), which is what this pins.
 *
 * Two independent checks, because either alone can pass while the surface is broken:
 *   1. a consumer-shaped snippet compiles (with a positive control that a WRONG call
 *      still errors — otherwise an index signature would make check 1 vacuous), and
 *   2. every method in the model reaches its element's generated interface, derived
 *      from element-meta.json rather than restated here, so a newly exposed method
 *      cannot quietly skip coverage.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_TYPES = resolve(pkgRoot, 'src/elements/element-types.d.ts');
const DIST_TYPES = resolve(pkgRoot, 'dist/elements.d.ts');

interface ElementMeta {
  tag: string;
  className: string;
  methods?: { name: string }[];
}
const meta: ElementMeta[] = JSON.parse(readFileSync(resolve(pkgRoot, 'src/elements/element-meta.json'), 'utf8'));

/** What a consumer actually writes: query the element, call the documented method.
 *  `skipLibCheck: true` on purpose — that is the setting every consumer template
 *  ships, so this is the compilation THEY get. */
const CONSUMER_SNIPPET = `import './TYPES';

const panel = document.querySelector('kai-resizable');
panel?.maximize(0);
panel?.restore();

const dialog = document.querySelector('kai-dialog');
dialog?.show();
dialog?.hide();
dialog?.toggle();

const chat = document.createElement('kai-chat');
chat.scrollToBottom('smooth');
chat.clear();

const cards = document.createElement('kai-cards');
cards.resolve('card-1', { kind: 'dismissed' });
const node: HTMLElement | null = cards.getCard('card-1');
void node;
`;

/** POSITIVE CONTROL — these calls are WRONG and must still be rejected. Without it,
 *  an accidental `[k: string]: unknown` on the element interfaces would make the
 *  snippet above compile while typing nothing at all. */
const WRONG_SNIPPET = `import './TYPES';

const panel = document.querySelector('kai-resizable');
panel?.maximize('not-a-number');
panel?.definitelyNotAMethod();
`;

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  types: [],
};

/** Compile `snippet` against `typesFile` in memory (no temp files on disk). */
function diagnose(typesFile: string, snippet: string): string[] {
  const dir = dirname(typesFile);
  const base = typesFile.slice(dir.length + 1).replace(/\.d\.ts$/, '');
  const probePath = join(dir, '__methods-probe.ts');
  const text = snippet.replace('./TYPES', `./${base}`);

  const host = ts.createCompilerHost(OPTIONS, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (f) => (f === probePath ? text : readFile(f));
  host.fileExists = (f) => (f === probePath ? true : fileExists(f));
  host.getSourceFile = (f, v, e, s) =>
    f === probePath ? ts.createSourceFile(f, text, v, true, ts.ScriptKind.TS) : getSourceFile(f, v, e, s);

  const program = ts.createProgram([probePath], OPTIONS, host);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where =
      d.file && d.start !== undefined
        ? `${d.file.fileName.replace(`${pkgRoot}/`, '')}(${
            ts.getLineAndCharacterOfPosition(d.file, d.start).line + 1
          })`
        : '<no file>';
    return `TS${d.code} ${where}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').split('\n')[0]}`;
  });
}

/** The member list of one `export interface Kai…Element extends HTMLElement { … }`. */
function interfaceBody(source: string, className: string): string {
  const marker = `export interface ${className} extends HTMLElement {`;
  const start = source.indexOf(marker);
  expect(start, `${className} not found in the generated types`).toBeGreaterThan(-1);
  const end = source.indexOf('\n}', start);
  return source.slice(start + marker.length, end);
}

describe('exposed element methods are callable through the generated types', () => {
  for (const [label, file] of [
    ['src/elements/element-types.d.ts', SRC_TYPES],
    ['dist/elements.d.ts', DIST_TYPES],
  ] as const) {
    describe(label, () => {
      it('a consumer calling the documented methods compiles', () => {
        if (file === DIST_TYPES && !existsSync(file)) return; // build-only artifact
        expect(diagnose(file, CONSUMER_SNIPPET)).toEqual([]);
      });

      it('POSITIVE CONTROL: a wrong call is still rejected', () => {
        if (file === DIST_TYPES && !existsSync(file)) return;
        const errors = diagnose(file, WRONG_SNIPPET);
        expect(errors.join('\n')).toMatch(/TS2345|TS2769/); // string passed where number expected
        expect(errors.join('\n')).toMatch(/definitelyNotAMethod/); // no catch-all index signature
      });
    });
  }

  it('every method in element-meta.json reaches its generated interface', () => {
    const source = readFileSync(SRC_TYPES, 'utf8');
    const withMethods = meta.filter((e) => e.methods?.length);
    // The gap this guards was 37 elements wide; a model that suddenly reports a
    // handful would make the loop below pass while covering almost nothing.
    expect(withMethods.length).toBeGreaterThan(30);

    const missing: string[] = [];
    for (const el of withMethods) {
      const body = interfaceBody(source, el.className);
      for (const m of el.methods!) {
        if (!new RegExp(`^\\s{2}${m.name}\\(`, 'm').test(body)) missing.push(`${el.tag}.${m.name}()`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('a method is NOT emitted onto a sibling element declared in the same module', () => {
    // resizable.tsx declares kai-resizable AND kai-resizable-item; only the group
    // exposes maximize/restore. A file-scoped extraction gave both.
    const item = meta.find((e) => e.tag === 'kai-resizable-item');
    expect(item?.methods ?? []).toEqual([]);
    expect(interfaceBody(readFileSync(SRC_TYPES, 'utf8'), 'KaiResizableItemElement')).not.toMatch(/\bmaximize\(/);
  });
});
