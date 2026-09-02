// The "Programmatic layer" section of llms-full.txt: the `@kitn.ai/ui/state`
// and `@kitn.ai/ui/wire` API, DERIVED from the shipped declarations.
//
// WHY THIS EXISTS (rung-6 finding F-46, S1): every element is documented on
// every generated surface, and the moment a builder leaves `<kai-chat>` — a
// hand-composed thread, a custom host — the API it must write against
// (`createAssistantStream`, the part folds, `createMockResponder`,
// `readOpenAIStream`/`toOpenAIMessages`) appeared on NO sanctioned surface at
// all. The measured result was seven `.d.ts` reads under `node_modules` doing
// the work this file now does.
//
// DERIVED, NEVER RESTATED. The export list comes from the two subpath barrels
// (`dist/state/index.d.ts`, `dist/wire/index.d.ts`) and the rendered
// declarations come from the per-module `.d.ts` those barrels re-export — the
// exact files a consumer's tsc reads. Nothing here is a hand-typed signature:
// when `/state` gains an export it appears in the index on the next build, and
// when a signature moves this section moves with it. The ONE curated choice is
// CORE_MODULES below — WHICH modules get their declarations printed in full
// rather than index-only — and that is a depth decision, not an API list.
//
// The section is written into llms-full.txt by gen-llms.mjs, fenced by the
// PROGRAMMATIC_MARKERS below, and the MCP's
// `component_reference({ name: "programmatic" })` topic serves it by slicing
// those markers back out of the shipped package-root llms-full.txt — the
// canonical, only shipped copy (owner-ruled 2026-08-25; the dist/llms/
// duplicate is gone) — one derivation, two doors, ZERO extra shipped bytes.
// (It used to also write a standalone dist/llms/programmatic.md; that was
// ~50 KB of pure duplication in the tarball and verify:pack is the guard that
// priced it.)

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The modules whose declarations are rendered IN FULL (JSDoc included).
 * Everything else an entry point exports still appears in the derived index —
 * this list only decides depth, and it is the residual hard core the rung-6
 * audit measured: every out-of-bounds `.d.ts` read was one of these files.
 */
const CORE_MODULES = {
  state: ['stream', 'parts', 'mock'],
  wire: ['read', 'encode', 'chunk'],
};

const ENTRY_POINTS = [
  {
    id: 'state',
    specifier: '@kitn.ai/ui/state',
    dir: 'dist/state',
    blurb:
      'I/O-free pure folds over `ChatMessage[]`. No client, no fetch — you own the transport; ' +
      'these functions own the array-identity discipline the elements re-render on.',
  },
  {
    id: 'wire',
    specifier: '@kitn.ai/ui/wire',
    dir: 'dist/wire',
    blurb:
      'The model-stream adapter. The kit PARSES, the consumer FETCHES: you make the request ' +
      '(your endpoint, your key), hand the response body to a reader, and it folds provider ' +
      'SSE onto message parts. The encoders turn the thread back into provider messages.',
  },
];

/**
 * The fence the MCP slices on. REGISTERED COPY: the same two literals live in
 * mcp/mcp/tools/reference.ts (`renderProgrammaticAppendix`),
 * which cannot import this .mjs. Change one and the reference tests fail on
 * the "Missing build artifact" branch, so the drift is loud, not silent.
 */
export const PROGRAMMATIC_MARKERS = {
  start: '<!-- kai:programmatic:start -->',
  end: '<!-- kai:programmatic:end -->',
};

const fail = (msg) => {
  throw new Error(
    `gen-llms-programmatic: ${msg}\n` +
      `The programmatic section is derived from the shipped declarations under dist/. ` +
      `Run \`nx build ui\` (or the full \`npm run build\` in packages/ui) first.`,
  );
};

function parse(path) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** `'./stream.js'` -> `stream`. */
const moduleOf = (spec) => spec.replace(/^\.\//, '').replace(/\.js$/, '');

/**
 * The barrel's export map: [{ name, module, typeOnly }], read off the
 * `export { A, B } from './mod.js'` statements in the entry point's index.d.ts.
 */
function readBarrelExports(indexPath) {
  const sf = parse(indexPath);
  const out = [];
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier || !st.exportClause) continue;
    if (!ts.isNamedExports(st.exportClause)) continue;
    const module = moduleOf(st.moduleSpecifier.text);
    for (const el of st.exportClause.elements) {
      out.push({ name: el.name.text, module, typeOnly: st.isTypeOnly || el.isTypeOnly });
    }
  }
  if (out.length === 0) fail(`${indexPath} yields zero exports — the derivation is broken, not empty.`);
  return out;
}

/** One statement's source text including its leading JSDoc, minus blank runs. */
function statementText(sf, st) {
  const full = sf.text.slice(st.getFullStart(), st.end);
  return full.replace(/^\s*\n/, '').trimEnd();
}

/**
 * Every top-level declaration of a core module, imports and re-export plumbing
 * dropped. Unexported helper types stay in: `AssistantStream`'s signatures
 * reference them, and a reader handed the interface without them is back to
 * opening the file.
 */
function moduleDeclarations(modulePath) {
  const sf = parse(modulePath);
  const parts = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st) || ts.isExportAssignment(st)) continue;
    parts.push(statementText(sf, st));
  }
  return parts.join('\n');
}

/**
 * The `ChatRequestBody` contract, extracted from the scaffolder's own preamble
 * (`mcp/route-emit.ts`, `CHAT_REQUEST_BODY_DECL`) — the single
 * source every emitted backend route already injects. Only the leading plain
 * string-literal lines are taken (the type + its doc); the guard functions that
 * follow use template substitutions and are implementation, not contract.
 */
function chatRequestBodyDecl() {
  const path = resolve(root, 'mcp/route-emit.ts');
  const sf = parse(path);
  let arr;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'CHAT_REQUEST_BODY_DECL' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      arr = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!arr) fail('CHAT_REQUEST_BODY_DECL not found in mcp/route-emit.ts — the contract moved; update this extractor.');
  const lines = [];
  for (const el of arr.elements) {
    // Plain literals only. The first templated line (`ChatRequestError` uses
    // `${request.method}`) ends the contract block by construction.
    if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
      lines.push(el.text);
    } else {
      break;
    }
  }
  const endIdx = lines.findIndex((l) => l.startsWith('};'));
  if (endIdx === -1 || !lines.some((l) => l.includes('type ChatRequestBody'))) {
    fail('CHAT_REQUEST_BODY_DECL no longer opens with the ChatRequestBody type — update this extractor.');
  }
  return lines.slice(0, endIdx + 1).join('\n');
}

/** `| name | kind | module |` rows for every export of one entry point. */
function indexTable(exports) {
  const rows = exports.map(
    (e) => `| \`${e.name}\` | ${e.typeOnly ? 'type' : 'value'} | \`${e.module}\` |`,
  );
  return ['| Export | Kind | Module |', '|---|---|---|', ...rows].join('\n');
}

/**
 * Build the whole section. Returns `{ markdown, exportCount }`; the count is
 * derived, for the caller's log line.
 */
export function buildProgrammaticSection() {
  for (const ep of ENTRY_POINTS) {
    if (!existsSync(resolve(root, ep.dir, 'index.d.ts'))) {
      fail(`missing ${ep.dir}/index.d.ts`);
    }
  }

  const out = [
    PROGRAMMATIC_MARKERS.start,
    '## Programmatic layer — `@kitn.ai/ui/state` + `@kitn.ai/ui/wire`',
    '',
    '<!-- generated by scripts/gen-llms-programmatic.mjs from the shipped dist/*.d.ts — do not edit by hand -->',
    '',
    'The API you write a HOST against — everything below is what a hand-composed surface',
    '(no `<kai-chat>`) wires together. Signatures and docs below are the shipped declaration',
    'files themselves, so they cannot drift from what your editor shows.',
    '',
    'The streaming loop, end to end:',
    '',
    '```ts',
    "import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';",
    "import { readOpenAIStream } from '@kitn.ai/ui/wire';",
    '',
    '// 1. A setter with the ONE universal contract: functional updater, new array out.',
    'const stream = createAssistantStream((update) => { el.messages = update(el.messages ?? []); });',
    '',
    '// 2. You fetch (or preview with the mock — real SSE frames, no provider, no key):',
    'const mock = createMockResponder();            // or: fetch("/api/chat", …).then(r => r.body)',
    'const result = await readOpenAIStream(mock(prompt), stream);',
    '',
    '// 3. THE HOST RESOLVES TOOL CALLS. A provider (and the mock) only ANNOUNCES a tool',
    '//    call — the part sits at state "input-available" forever unless your code answers',
    '//    it. Executing the tool is the app\'s decision, and this is the call that answers.',
    '//    The ONE exception: a call with `providerExecuted: true` (see ModelToolCall below)',
    '//    was already run by the provider, in-stream — the host must NOT execute those.',
    'for (const call of result.toolCalls) {',
    '  if (call.providerExecuted) continue;',
    "  stream.upsertTool(call.id, { state: 'output-available', output: await runTool(call) });",
    '}',
    'stream.done();                                 // seal the turn; late sink calls are dropped',
    '```',
    '',
    'Scripting a mock tool call (so the tool panel renders with zero backend):',
    '',
    '```ts',
    'const mock = createMockResponder({',
    "  replies: ['Plain text turn', { text: 'Let me check.', toolCalls: [{ name: 'search_docs', arguments: { query: 'threads' } }] }],",
    '});',
    '```',
    '',
  ];

  for (const ep of ENTRY_POINTS) {
    const exports = readBarrelExports(resolve(root, ep.dir, 'index.d.ts'));
    out.push(`### \`${ep.specifier}\``, '', ep.blurb, '');
    out.push(`Every export (${exports.length}, derived from \`${ep.dir}/index.d.ts\`):`, '');
    out.push(indexTable(exports), '');

    for (const mod of CORE_MODULES[ep.id]) {
      if (!exports.some((e) => e.module === mod)) {
        fail(`core module '${mod}' is no longer re-exported by ${ep.dir}/index.d.ts — update CORE_MODULES.`);
      }
      out.push(
        `#### \`${ep.specifier}\` · \`${mod}\` — the shipped declarations`,
        '',
        '```ts',
        moduleDeclarations(resolve(root, ep.dir, `${mod}.d.ts`)),
        '```',
        '',
      );
    }
  }

  out.push(
    '### The `ChatRequestBody` preamble (what your route receives)',
    '',
    'Every backend route the `kai` MCP scaffolds narrows `await request.json()` ONCE at the',
    'edge, through this type — `request.json()` is `Promise<unknown>` under a Node/undici',
    'tsconfig, so destructuring it raw fails a stock `npm run build` even though it ran fine',
    'in dev. The front end sends `toOpenAIMessages(thread)`; this is what that produces, so',
    'the two halves stay pinned to one type. Do not hand-roll a second narrowing.',
    '',
    '```ts',
    chatRequestBodyDecl(),
    '```',
    '',
    'The scaffolded routes pair it with a `readChatRequest(request)` guard that turns a bare',
    'GET or malformed JSON into a status response instead of an unhandled throw — re-scaffold',
    'any integration with the `kai` MCP `scaffold` tool to get the full preamble.',
    PROGRAMMATIC_MARKERS.end,
  );

  const exportCount = ENTRY_POINTS.reduce(
    (n, ep) => n + readBarrelExports(resolve(root, ep.dir, 'index.d.ts')).length,
    0,
  );
  return { markdown: out.join('\n'), exportCount };
}
