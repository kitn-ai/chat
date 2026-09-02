#!/usr/bin/env node
// AI/UI MCP server launcher. Loads the compiled stdio entry (built by the `mcp`
// target in config/vite/node.ts). A bin must run under plain Node, which can't
// execute .ts, so we import the dist ESM emit. `npx @kitn.ai/ui mcp` runs this (the sole bin).
//
// The built module (dist/mcp.es.js) auto-starts the server on import. We own the
// fatal-error / exit handling here (a .js file, outside tsc's typed src/), so the
// stdio entry source stays free of Node globals.
import { fileURLToPath } from 'node:url';
import { decideEntry } from './route.js';

// stdout is the JSON-RPC channel; diagnostics must go to stderr.
function fatal(err) {
  console.error('[kitn-ui-mcp] fatal:', err);
  process.exit(1);
}
process.on('unhandledRejection', fatal);
process.on('uncaughtException', fatal);

// Subcommand dispatch. `npx @kitn.ai/ui <cmd>`: `mcp` (or nothing) starts the
// MCP server — the historical behavior, byte-compatible and unchanged.
// dev/compile/eject/validate load the construct CLI. Anything else is a typo
// (e.g. `frobnicate`, `validat`) — it errors loudly to stderr and exits 2
// rather than silently falling through to the server (decideEntry, tested in
// route.test.js, owns that decision so it stays testable without spawning).
const [, , command] = process.argv;
const decision = decideEntry(command);
if (decision.kind === 'error') {
  console.error(`[kitn-ui-mcp] ${decision.message}`);
  process.exit(2);
}
const entry = fileURLToPath(
  new URL(decision.kind === 'construct' ? '../dist/construct-cli.es.js' : '../dist/mcp.es.js', import.meta.url),
);
import(entry).catch(fatal);
