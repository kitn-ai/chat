#!/usr/bin/env node
// Materialise the SHIPPED `vercel-ai-sdk` route into a file the spike's dev
// proxy can import and drive against a real model.
//
// WHY GENERATE IT RATHER THAN WRITE IT
// ------------------------------------
// Every line of that route lives inside a string literal in
// `packages/ui/mcp/integrations/vercel-ai-sdk.ts`, assembled by
// the scaffolder's own `next` adapter and its `readChatRequest` / `wireParts`
// preamble. A hand-copied version in this directory would be a FORK: it would
// keep passing after the shipped route broke, and the whole point of driving it
// live is to find out whether the artifact a consumer actually pastes works.
//
// So the route is produced by calling `scaffold.handler(...)` — the same entry
// point `verify:scaffold` compiles and the same one the `kai` MCP serves — and
// block (2) of its output is written out verbatim. `conformance:gateway*` runs
// this FIRST, every time, so a stale copy cannot be measured.
//
// The output is committed anyway, so a reader can see exactly what was driven
// without running anything.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SPIKE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(SPIKE, '..', '..', '..');
const UI = join(REPO, 'packages', 'ui');
const OUT = join(SPIKE, 'server', 'generated', 'vercel-ai-sdk-route.ts');

/** The integration under test. Named once: this generator is not a general
 *  scaffold runner and should not pretend to be one. */
const INTEGRATION = 'vercel-ai-sdk';
/** `next` because its adapter is the thinnest — it wraps the portable handler in
 *  `export async function POST(req: Request)` and nothing else, so what the dev
 *  proxy calls is the handler itself rather than a framework's idea of it.
 *  Every other TS framework wraps the SAME `chatHandler` body (the integration
 *  declares no `routeTemplates`), and `verify:scaffold`'s
 *  `assertRoutesAreSurfaceIndependent` is what keeps that true. */
const FRAMEWORK = 'next';
/** A surface that bears BOTH a tool panel and cards, so the scaffolder emits the
 *  tools half of the contract. It does not affect the route — routes are
 *  surface-independent by construction — but asking for the tool surface is the
 *  honest way to request the route that a tool loop needs. */
const COMPONENTS = ['kai-chat', 'kai-tool', 'kai-reasoning'];

const fail = (msg) => {
  console.error(`\n✗ emit-gateway-route: ${msg}\n`);
  process.exit(1);
};

const tmp = mkdtempSync(join(tmpdir(), 'kai-spike-gateway-'));
try {
  const esbuild = await import('esbuild');
  const bundle = join(tmp, 'scaffold.bundle.mjs');
  await esbuild.build({
    entryPoints: [join(UI, 'mcp', 'mcp', 'tools', 'scaffold.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
  });

  const { scaffold } = await import(pathToFileURL(bundle).href);
  if (typeof scaffold?.handler !== 'function') {
    fail('the scaffolder no longer exports a `scaffold` tool with a handler.');
  }

  const out = await scaffold.handler({
    components: COMPONENTS,
    integration: INTEGRATION,
    placement: 'full-page',
    framework: FRAMEWORK,
  });
  const text = out?.content?.[0]?.text;
  if (typeof text !== 'string') fail('the scaffolder returned no text content.');

  const block = text.split('=== (2) BACKEND ROUTE ===')[1]?.split(/^=== \(3\)/m)[0];
  if (block === undefined) fail('the scaffold output has no "=== (2) BACKEND ROUTE ===" section.');

  // The scaffolder's prose lines start with `#`. They are commentary AROUND the
  // code (the runtime label, the run note), not part of it.
  const code = block
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();

  // Anti-vacuity: an empty or truncated block would be written out happily and
  // then fail at import time as something that reads like a Vite problem.
  for (const needle of ['async function chatHandler', 'export async function POST', 'result.fullStream']) {
    if (!code.includes(needle)) {
      fail(
        `block (2) does not contain \`${needle}\`, so this is not the route this harness drives.\n` +
          `  Got ${code.length} characters starting:\n    ${code.split('\n').slice(0, 6).join('\n    ')}`,
      );
    }
  }

  const banner = [
    '// GENERATED — DO NOT EDIT. Run `pnpm gateway:route` (or any `conformance:gateway*`',
    '// script, which runs it first) to regenerate.',
    '//',
    `// Source: the \`${INTEGRATION}\` integration's \`webRoute\`, wrapped by the scaffolder's`,
    `// \`${FRAMEWORK}\` adapter — i.e. byte for byte what \`kai\` scaffold hands a consumer.`,
    '// It is committed so the code this spike drove live is readable without running',
    '// anything; harness/emit-gateway-route.mjs explains why it is generated at all.',
    '',
  ].join('\n');

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${banner}${code}\n`);
  console.log(
    `emit-gateway-route: wrote ${code.split('\n').length} lines to ` +
      `${OUT.slice(SPIKE.length + 1)} (${INTEGRATION} / ${FRAMEWORK}).`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
