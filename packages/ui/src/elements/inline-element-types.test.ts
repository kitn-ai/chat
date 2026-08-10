// @vitest-environment node
//
// Drift guard for the hand-authored type block inside scripts/gen-element-types.mjs.
//
// That script inlines ChatMessage (and the types it references) as a template
// literal so the SHIPPED dist/elements.d.ts stays self-contained — no relative
// import that would drag a library .ts source file into a consumer's type graph.
// The cost of that design is that nothing in the normal build sees the block as
// TYPES: regeneration faithfully reproduces whatever text is there, so the
// zero-drift gate passes even when the block declares a schema the runtime
// removed. That is exactly what happened in 0.20.0 — `content: string` stayed in
// the inline block after the parts migration, so `@kitn.ai/ui/elements` type-blessed
// `{ id, role, content }` (runtime-rejected) and REJECTED `{ id, role, parts }`.
//
// This test closes that hole: it compiles the inline block together with the real
// source types and asserts mutual assignability, so any structural drift fails.

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Loaded through node's CJS loader rather than an ESM import, which keeps vite from
// transforming typescript.js when this file runs on its own. (Vite's dep scan still
// pre-bundles it once in a full-suite run and logs a harmless "failed to load source
// map for typescript.js" line — TypeScript ships no .map. It fails nothing.)
const ts: typeof import('typescript') = createRequire(import.meta.url)('typescript');

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '../..');

/** Load the generator's inlined type block. The specifier is a runtime variable on
 *  purpose: the script is plain ESM outside `include`, and a static import would
 *  need `allowJs`. */
async function loadInlineBlock(): Promise<string> {
  const url = pathToFileURL(resolve(PKG_ROOT, 'scripts/gen-element-types.mjs')).href;
  const mod = await import(/* @vite-ignore */ url);
  return mod.INLINE_ELEMENT_TYPES as string;
}

/** Compile `source` as a virtual module inside src/elements/ (so its relative
 *  imports resolve against the real source tree) and return its diagnostics. */
function typecheckVirtualModule(source: string): string[] {
  const virtualPath = resolve(HERE, '__inline-types-guard.virtual.ts');
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

describe('gen-element-types.mjs inline type block', () => {
  it('declares a ChatMessage structurally identical to src/elements/chat-types.ts', async () => {
    const inline = await loadInlineBlock();

    // `Assert<T extends true>` only accepts the literal `true`, so a failed
    // MutuallyAssignable resolves to `false` and becomes a compile error.
    const probe = [
      `import type {`,
      `  ChatMessage as SourceChatMessage,`,
      `  MessagePart as SourceMessagePart,`,
      `  RawOrigin as SourceRawOrigin,`,
      `  MessageSource as SourceMessageSource,`,
      `} from './chat-types';`,
      `import type { ToolPart as SourceToolPart } from '../components/tool-types';`,
      ``,
      inline,
      ``,
      `type Assert<T extends true> = T;`,
      `type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;`,
      ``,
      `export type _ChatMessageInSync = Assert<MutuallyAssignable<ChatMessage, SourceChatMessage>>;`,
      `export type _MessagePartInSync = Assert<MutuallyAssignable<MessagePart, SourceMessagePart>>;`,
      `export type _ToolPartInSync = Assert<MutuallyAssignable<ToolPart, SourceToolPart>>;`,
      `export type _RawOriginInSync = Assert<MutuallyAssignable<RawOrigin, SourceRawOrigin>>;`,
      `export type _MessageSourceInSync = Assert<MutuallyAssignable<MessageSource, SourceMessageSource>>;`,
      ``,
      // A message built the CURRENT way must be accepted, and the removed 0.19.x
      // `content` channel must not be.
      `export const valid: ChatMessage = { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] };`,
      `// @ts-expect-error the 'content' string field was removed in 0.20.0`,
      `export const legacy: ChatMessage = { id: 'm1', role: 'assistant', content: 'hi' };`,
    ].join('\n');

    expect(typecheckVirtualModule(probe)).toEqual([]);
  });

  it('keeps ChatMessage.parts as the only content channel', async () => {
    const inline = await loadInlineBlock();
    const body = inline.match(/export interface ChatMessage \{([\s\S]*?)\n\}/)?.[1];

    expect(body, 'no `export interface ChatMessage` in the inline block').toBeDefined();
    expect(body).toMatch(/^\s*parts: MessagePart\[\];$/m);
    // The pre-0.20.0 fields. Each one is runtime-rejected by validate-messages.ts.
    for (const removed of ['content', 'reasoning', 'tools', 'attachments']) {
      expect(body, `ChatMessage still declares the removed \`${removed}\` field`).not.toMatch(
        new RegExp(`^\\s*${removed}\\??:`, 'm'),
      );
    }
  });

  it('declares classifyTool with the real implementation signature', async () => {
    // ToolPart.kind's doc comment says "Derive with `classifyTool(type)`", and the
    // function is now genuinely exported from the `./elements` runtime entry
    // (src/elements/register.ts). The inline block DECLARES its signature by hand,
    // which is the same invisible-to-the-compiler hazard as ChatMessage above: a
    // regeneration reproduces a wrong signature byte-for-byte. Compile the declared
    // signature against the real function so drift fails here.
    const inline = await loadInlineBlock();
    expect(inline, 'no classifyTool declaration in the inline block').toMatch(
      /export declare function classifyTool\(/,
    );

    const probe = [
      `import { classifyTool as sourceClassifyTool } from '../components/tool-classify';`,
      ``,
      inline,
      ``,
      `type Assert<T extends true> = T;`,
      `type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;`,
      ``,
      // Same parameter list AND same return type as the real implementation.
      `export type _ClassifyToolInSync = Assert<`,
      `  MutuallyAssignable<typeof classifyTool, typeof sourceClassifyTool>`,
      `>;`,
      // And the return type is the ToolKind the block itself declares.
      `export type _ToolKindInSync = Assert<`,
      `  MutuallyAssignable<ReturnType<typeof sourceClassifyTool>, ToolKind>`,
      `>;`,
    ].join('\n');

    expect(typecheckVirtualModule(probe)).toEqual([]);
  });
});
