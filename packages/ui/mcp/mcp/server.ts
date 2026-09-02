import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { reference } from './tools/reference';
import { scaffold } from './tools/scaffold';
import { theme } from './tools/theme';
import { debug } from './tools/debug';
import { constructTool } from './tools/construct';
import type { Tool } from './tools/types';
import { validateToolArgs } from './validate-args';

const tools: Tool[] = [reference, scaffold, theme, debug, constructTool];

const PACKAGE_NAME = '@kitn.ai/ui';

/**
 * The `serverInfo` every MCP harness reads back on `initialize`. READ, NOT TYPED.
 *
 * This was a hand-typed `{ name: '@kitn.ai/ui', version: '0.15.0' }` and the kit kept
 * releasing past it, so every harness that connected was told a version ten minors
 * stale — the same "derive it, don't type it" failure as the CDN pins, minus their
 * lint. Nothing here is allowed to restate the version: `server.test.ts` reads
 * package.json off disk itself and compares.
 *
 * RESOLVED BY THE PACKAGE'S OWN NAME, not by path arithmetic. This module runs from
 * two places — `<package>/mcp/mcp/server.ts` under vitest, and inlined
 * into `<package>/dist/mcp.es.js` for the bin — which sit at different depths, so a
 * relative hop would need one rule per context (what manifest.ts has to do, because
 * `dist/custom-elements.json` is a build artifact with no name to ask for). A
 * self-reference has no depth to get wrong: Node resolves `@kitn.ai/ui/package.json`
 * against the nearest package.json whose `name` matches, which is this package in
 * both contexts and in an install. It also never escapes into a neighbouring
 * checkout the way a parent-directory search can.
 *
 * WHY IT SURVIVES PUBLISHING. npm always ships package.json, `exports` carries
 * `"./package.json": "./package.json"` (self-reference is restricted to the exports
 * map, so that key is load-bearing — drop it and this throws, and the test goes red
 * with it), and `bin/mcp.js` imports `../dist/mcp.es.js` by its own URL, so the
 * resolver starts inside the installed package however it was launched (npx, global
 * install, symlink). Not a JSON import: that inlines the version at BUILD time, which
 * is a second copy that can disagree with the package.json shipped beside it, and it
 * would need `resolveJsonModule` on the repo's browser tsc pass as well as this one.
 *
 * A broken resolve throws instead of falling back to a placeholder — `bin/mcp.js`
 * turns that into a named fatal on stderr, which is the loud version. A wrong version
 * silently announced to every harness is the quiet one.
 */
function packageIdentity(): { name: string; version: string } {
  const specifier = `${PACKAGE_NAME}/package.json`;
  const require = createRequire(import.meta.url);
  const pkg = require(specifier) as { name?: string; version?: string };
  if (pkg.name !== PACKAGE_NAME || typeof pkg.version !== 'string') {
    throw new Error(
      `[${PACKAGE_NAME}] Refusing to report a serverInfo that is not this package's: ` +
        `${specifier} resolved to ${require.resolve(specifier)}, whose name is ` +
        `${JSON.stringify(pkg.name)} and version ${JSON.stringify(pkg.version)}.`,
    );
  }
  return { name: pkg.name, version: pkg.version };
}

/**
 * The AI/UI MCP server. A stdio server (see ./stdio.ts) exposing the AI/UI tools
 * to any MCP harness. Registers four tools; Tasks 2–5 fill in each handler.
 *
 * The returned `Server` is augmented with `__listToolsForTest()`, a test-only
 * helper that returns the registered tool names without touching the transport.
 */
export interface AiUiServer extends Server {
  __listToolsForTest(): string[];
}

export function createServer(): AiUiServer {
  const server = new Server(packageIdentity(), { capabilities: { tools: {} } }) as AiUiServer;

  const byName = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      // The protocol requires a JSON Schema. We use zod 4's native converter
      // (the repo is on zod 4); the SDK-bundled zod-to-json-schema only
      // understands zod 3 and emits an empty schema for our zod 4 objects.
      inputSchema: z.toJSONSchema(t.inputSchema) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      };
    }
    const args = request.params.arguments ?? {};
    // Enforce the schema each tool ADVERTISES (additionalProperties: false +
    // required) — one path for all four tools. Without this, a wrong key was
    // silently ignored and the handler answered a different question (see
    // validate-args.ts for the observed failure).
    const problem = validateToolArgs(tool.name, tool.inputSchema, args);
    if (problem) {
      return { isError: true, content: [{ type: 'text', text: problem }] };
    }
    return tool.handler(args);
  });

  server.__listToolsForTest = () => tools.map((t) => t.name);

  return server;
}
