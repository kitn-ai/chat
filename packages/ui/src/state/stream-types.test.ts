// @vitest-environment node
//
// Type-level guard for AssistantStream's mutator parameters.
//
// THE HAZARD. `Source`, `Partial<ToolPart>` and `ReasoningOpts` are weak types —
// no required field between them — and TypeScript only excess-property-checks
// OBJECT LITERALS. Hand a mutator a VARIABLE instead and the check never runs,
// so a bag sharing one optional key name is silently accepted:
//
//     addFile(attachment) { inner.addSource(attachment); return wrapper; }
//
// compiled at exit 0 and wrote an attachment into a `source` part. Nine such
// pairs existed across those three bags. `Unmixed<Shape>` in ./stream closes
// them by forbidding the keys that belong exclusively to a SIBLING bag.
//
// Nothing in the normal build can see this: the whole defect is that tsc says
// yes. So this test runs the compiler itself over a probe module and asserts
// the diagnostics. The `@ts-expect-error` lines are the assertion — remove the
// guard and each becomes an "Unused '@ts-expect-error' directive", which is a
// diagnostic, which fails the empty-array expectation. A negative type test
// that passes either way proves nothing.
//
// Same virtual-module machinery as ./../elements/inline-element-types.test.ts.

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ts: typeof import('typescript') = createRequire(import.meta.url)('typescript');

const HERE = dirname(fileURLToPath(import.meta.url));

/** Compile `source` as a virtual module inside src/state/ (so its relative
 *  imports resolve against the real source tree) and return its diagnostics. */
function typecheckVirtualModule(source: string): string[] {
  const virtualPath = resolve(HERE, '__stream-types-guard.virtual.ts');
  const options: import('typescript').CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  };

  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === virtualPath
      ? ts.createSourceFile(virtualPath, source, languageVersion, true, ts.ScriptKind.TS)
      : getSourceFile(fileName, languageVersion, onError, shouldCreate);
  host.fileExists = (fileName) => fileName === virtualPath || fileExists(fileName);
  host.readFile = (fileName) => (fileName === virtualPath ? source : readFile(fileName));

  const program = ts.createProgram([virtualPath], options, host);
  const virtualFile = program.getSourceFile(virtualPath);
  return [
    ...program.getSyntacticDiagnostics(virtualFile),
    ...program.getSemanticDiagnostics(virtualFile),
  ].map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    const line =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : undefined;
    return line ? `line ${line}: ${message}` : message;
  });
}

const PREAMBLE = [
  `import type { AssistantStream } from './stream';`,
  `import type { Source } from '../elements/chat-types';`,
  `import type { AttachmentData } from '../components/attachment-types';`,
  `import type { ToolPart } from '../components/tool-types';`,
  `import type { CardEnvelope } from '../primitives/card-contract';`,
  `import type { ReasoningOpts } from './parts';`,
  ``,
  `declare const s: AssistantStream;`,
  `declare const attachment: AttachmentData;`,
  `declare const tool: ToolPart;`,
  `declare const card: CardEnvelope;`,
  `declare const source: Source;`,
  `declare const toolPatch: Partial<ToolPart>;`,
  `declare const reasoningOpts: ReasoningOpts;`,
  ``,
];

describe('AssistantStream mutator parameters are bag-exclusive', () => {
  it('rejects every sibling bag a weak parameter would otherwise absorb', () => {
    // Each pair below compiles CLEAN without `Unmixed`, because the argument is a
    // variable and no excess-property check applies. The `@ts-expect-error` is
    // what asserts the guard fired.
    const probe = [
      ...PREAMBLE,
      `// @ts-expect-error an attachment is not a citation (the bug behind this guard)`,
      `s.addSource(attachment);`,
      `// @ts-expect-error a card envelope is not a citation`,
      `s.addSource(card);`,
      `// @ts-expect-error a reasoning options bag is not a citation`,
      `s.addSource(reasoningOpts);`,
      `// @ts-expect-error an attachment is not a tool patch`,
      `s.upsertTool('t', attachment);`,
      `// @ts-expect-error a card envelope is not a tool patch`,
      `s.upsertTool('t', card);`,
      `// @ts-expect-error a reasoning options bag is not a tool patch`,
      `s.upsertTool('t', reasoningOpts);`,
      `// @ts-expect-error a citation is not a reasoning options bag`,
      `s.appendReasoning('d', source);`,
      `// @ts-expect-error a tool part is not a reasoning options bag`,
      `s.appendReasoning('d', tool);`,
      `// @ts-expect-error a tool patch is not a reasoning options bag`,
      `s.appendReasoning('d', toolPatch);`,
    ].join('\n');

    expect(typecheckVirtualModule(probe)).toEqual([]);
  });

  it('still accepts every legitimate call, including a consumer superset', () => {
    // The guard forbids only keys owned by a SIBLING bag. A consumer who hangs
    // their own field off a citation is not making the mistake this catches, and
    // must not be pushed toward a cast — a cast would reopen the hole.
    const probe = [
      ...PREAMBLE,
      `declare const consumerSource: { url: string; title: string; relevance: number };`,
      ``,
      `s.addSource({ id: 's1', url: 'https://a', title: 'A', snippet: '...', index: 1 });`,
      `s.addSource({});`,
      `s.addSource(source);`,
      `s.addSource(consumerSource);`,
      `s.upsertTool('t', { state: 'output-available', output: { hits: 3 } });`,
      `s.upsertTool('t', toolPatch);`,
      `s.appendReasoning('d');`,
      `s.appendReasoning('d', { index: 0, streamId: 'r1', label: 'Thinking' });`,
      `s.appendReasoning('d', reasoningOpts);`,
      `s.addFile(attachment);`,
      `s.addCard(card);`,
    ].join('\n');

    expect(typecheckVirtualModule(probe)).toEqual([]);
  });

  it('leaves addCard/addFile unwrapped on purpose — the strong types already hold', () => {
    // Those two take types with required fields, so ordinary assignability does
    // the job `Unmixed` exists to do for a weak bag. The decision rests on two
    // facts, and this test is what re-opens it if either stops being true.
    const probe = [
      ...PREAMBLE,
      // (1) Nothing a sibling bag produces reaches `CardEnvelope` — it requires
      //     `data`, which no other bag carries. Wrapping addCard buys ZERO.
      `// @ts-expect-error an attachment is not a card envelope`,
      `s.addCard(attachment);`,
      `// @ts-expect-error a tool part is not a card envelope`,
      `s.addCard(tool);`,
      `// @ts-expect-error a citation is not a card envelope`,
      `s.addCard(source);`,
      `// @ts-expect-error a reasoning options bag is not a card envelope`,
      `s.addCard(reasoningOpts);`,
      // (2) addFile already rejects an ordinarily-inferred envelope. The known
      //     residual (`CardEnvelope<'file', unknown>` reaching addFile) needs a
      //     hand-written generic narrowing, which is why it is not worth the two
      //     ordinary consumer shapes wrapping addFile would break. The full
      //     trade, and the other two blind spots, are boundary points 1-3 in
      //     ./stream.ts -- that comment is where the whole boundary lives.
      `// @ts-expect-error an ordinarily-inferred envelope is not an attachment`,
      `s.addFile(card);`,
    ].join('\n');

    expect(typecheckVirtualModule(probe)).toEqual([]);
  });

  it('derives the forbidden key set from the MessagePart union, not a hand-written list', () => {
    // A seventh variant must re-fire the guard on its own. Proxy for that: the
    // guard rejects a bag whose only foreign key is `resolution`, which nothing
    // names literally in ./stream -- it can only have arrived via CardEnvelope,
    // reached through the union.
    const probe = [
      ...PREAMBLE,
      `declare const resolutionish: { url?: string; resolution?: { kind: 'dismissed' } };`,
      `// @ts-expect-error \`resolution\` belongs to CardEnvelope, reached via MessagePart`,
      `s.addSource(resolutionish);`,
    ].join('\n');

    expect(typecheckVirtualModule(probe)).toEqual([]);
  });
});
