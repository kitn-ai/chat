/**
 * The server route a keyed gateway needs, and where each framework puts it.
 *
 * WHY THIS FILE EXISTS AT ALL — the gateway axis is not symmetrical with the
 * framework axis. Every other thing the CLI emits is a copy of a reviewed
 * starter; a route is the one artifact with no starter behind it, because a
 * starter runs on the mock and the mock has no server side. So this is the first
 * code create-kai GENERATES rather than copies, and the rules below are what
 * keep that generation honest.
 *
 * ── WHAT IS READ FROM THE KIT AND WHAT IS NOT ────────────────────────────────
 *
 * The handler body is `integration.webRoute`, read off the catalog exactly as
 * `catalog.ts` requires. It is never restated here, and it is the part that
 * carries the provider knowledge — the endpoint, the auth header, the status
 * forwarding, the reasons each of those is written the way it is.
 *
 * The DECLARATION around it is ours, and that is a deliberate split rather than
 * a gap. The kit's `kai` MCP has its own per-framework wrappers in
 * `mcp/mcp/tools/scaffold.ts` (`WEB_ROUTE_ADAPTERS`), and they are not
 * reusable here even in principle: an MCP wrapper emits a PASTE-ABLE SNIPPET —
 * one string that concatenates three files with `// ── vite-chat-api.ts ───`
 * separators and a commented-out `// export default defineConfig(...)` line for
 * the reader to apply by hand. create-kai writes files to disk that have to
 * compile, so it needs three real files and a real config edit. The two consume
 * the same handler and diverge immediately after it, which is why the wrapper
 * lives with the framework table that owns every other per-framework path.
 *
 * ── THE PREAMBLE COMES FROM THE KIT ──────────────────────────────────────────
 *
 * A bare `webRoute` does not compile. Every fragment in the catalog calls
 * `readChatRequest`, and three (anthropic, mastra, vercel-ai-sdk) also call
 * `wireParts` / `wireText` — measured across the catalog, the bare fragments are
 * TS2304 on five distinct names. `chatRoutePreamble(fragment)` answers what goes
 * above THIS fragment, and it is a function rather than a constant precisely
 * because the content helpers are conditional: an unused declaration is a hard
 * `--noUnusedLocals` error, so a flat preamble would compile for some routes and
 * not others.
 *
 * THIS FILE USED TO CARRY A COPY of one of those declarations, because the kit
 * did not export them. It does now, so the copy is gone and so is the guard that
 * watched it for drift. What is left is `routeSymbolsProblem`, which grades this
 * emitter's OUTPUT rather than the kit's input — a different artifact, and one
 * the kit's own tests cannot see. See `build-guards.ts`.
 */
import { chatRoutePreamble, defaultModelFor } from './catalog';
import type { Integration } from './catalog';
import type { FrameworkDef } from './frameworks';

/** A file the generator writes, path relative to the project root. */
export interface EmittedFile {
  path: string;
  contents: string;
}

/**
 * How one framework declares a route around the portable `chatHandler`.
 *
 * `file` is the destination of the handler itself and is also what
 * `FrameworkDef.paths.route` reports into `kai.json`. `extra` is for hosts that
 * need more than one file — a Vite SPA needs the plugin that mounts the handler
 * as well as the handler.
 */
export interface RouteHost {
  /** where the handler lands, relative to the project root */
  file: string;
  /** how this route runs, for the README and the CLI's closing note */
  runtime: string;
  /** true when the route also answers in production, not just `npm run dev` */
  production: boolean;
  /** import lines emitted above the handler */
  before?: readonly string[];
  /** the declaration emitted below the handler that calls `chatHandler` */
  after: readonly string[];
  /** additional files this host needs to actually serve the handler */
  extra?: readonly EmittedFile[];
}

/**
 * The model id this integration's front end should post, or undefined.
 *
 * Straight through to the kit's `defaultModelFor`, which reads
 * `forwardsFromClient` to decide whether the route reads the field at all and
 * then looks the id up in `CLIENT_MODEL_IDS`. It THROWS for an integration that
 * forwards `model` with no id registered, which is why this package no longer
 * carries a guard for that case — the failure already happens, loudly, at the
 * same moment ours did.
 *
 * Re-exported under this name rather than used inline so the call site reads as
 * a question about the front end, which is what it is.
 */
export const clientModelFor = defaultModelFor;

/**
 * Next.js — the cheapest correct destination in the table.
 *
 * One file, no config edit, and the same route answers `next dev` and
 * `next start`, because an App Router route handler IS the production server.
 * Nothing here is dev-only, which is why this row reports `production: true`
 * and the Vite rows below do not.
 */
const nextHost: RouteHost = {
  file: 'app/api/chat/route.ts',
  runtime: 'Next.js route handler (Node)',
  production: true,
  after: [
    ``,
    `// Next.js App Router: the file exports the HTTP method.`,
    `export async function POST(req: Request): Promise<Response> {`,
    `  return chatHandler(req);`,
    `}`,
  ],
};

/**
 * A Vite SPA — three files, because a Vite SPA has no server.
 *
 * `fetch('/api/chat')` from a Vite app hits the dev server, and the dev server
 * serves static files, so the request 404s with an HTML body that the SSE reader
 * then fails to parse. The plugin below is what makes the path answer, and it
 * answers in DEVELOPMENT ONLY — `vite build` emits static assets and no server,
 * so a deployed build has nothing behind `/api/chat`. That is a property of the
 * target, not a shortcoming of the emit, and the emitted comments say so rather
 * than letting a user discover it at deploy time.
 *
 * `server/chat.ts`, NOT `src/server/chat.ts`. The starter's tsconfig is split in
 * two the way `npm create vite` writes it: `tsconfig.app.json` covers `src` with
 * `types: ["vite/client"]` and no node types, `tsconfig.node.json` covers
 * `vite.config.ts` and what it imports. A handler under `src/` is therefore
 * compiled by the BROWSER project too, where `process.env` is TS2591 "Cannot
 * find name 'process'". Outside `src/` only the node project claims it, and that
 * is the one with the node types the handler needs.
 *
 * NO `.js` IMPORT SUFFIX, which is where this diverges from the kit MCP's
 * version of the same advice. That guidance is written for a stock
 * `"module": "nodenext"` node tsconfig, where an extensionless relative import
 * is TS2835. This repo's React starter ships `"moduleResolution": "bundler"`,
 * under which the suffix is unnecessary and the extensionless form is the
 * idiomatic one. Checked against the starter rather than inherited.
 */
function viteSpaHost(): RouteHost {
  return {
    file: 'server/chat.ts',
    runtime: 'Vite dev-server middleware (Node) — development only',
    production: false,
    after: [
      ``,
      `// vite.config.ts reaches the handler through this export.`,
      `export { chatHandler };`,
    ],
    extra: [
      {
        path: 'vite-chat-api.ts',
        contents: [
          `import type { Plugin } from 'vite';`,
          ``,
          `import { chatHandler } from './server/chat';`,
          ``,
          `/**`,
          ` * Mount the chat handler on Vite's dev server.`,
          ` *`,
          ` * A Vite SPA has no server routes, so \`fetch('/api/chat')\` has nothing to`,
          ` * answer it: the dev server serves static files, the request 404s with an`,
          ` * HTML body, and the SSE reader fails on the first frame.`,
          ` *`,
          ` * DEV ONLY. \`vite build\` emits static assets and no server, so a deployed`,
          ` * build has nothing behind this path. To ship, deploy \`server/chat.ts\` to a`,
          ` * real server (a Next route, a SvelteKit endpoint, a Worker, Express) and`,
          ` * point the fetch at it.`,
          ` */`,
          `export function chatApiPlugin(): Plugin {`,
          `  return {`,
          `    name: 'chat-api',`,
          `    configureServer(server) {`,
          `      server.middlewares.use('/api/chat', async (req, res) => {`,
          `        // THE try/catch IS NOT DEFENSIVE PADDING. Connect does not await this`,
          `        // handler, so a rejection here is an unhandled promise rejection, and`,
          `        // Node's default for that is to kill the process — \`npm run dev\` exits`,
          `        // on the first upstream network failure and the browser is left with a`,
          `        // dead server. Observed, not theorised: a POST with the provider`,
          `        // unreachable took the dev server down with a TypeError.`,
          `        try {`,
          `          let body = '';`,
          `          req.setEncoding('utf8');`,
          `          for await (const chunk of req) body += chunk;`,
          ``,
          `          const response = await chatHandler(`,
          `            new Request('http://localhost/api/chat', {`,
          `              method: 'POST',`,
          `              headers: { 'Content-Type': 'application/json' },`,
          `              body,`,
          `            }),`,
          `          );`,
          ``,
          `          // The STATUS has to survive the bridge: a 401 from the provider that`,
          `          // arrives at the browser as a 200 is a blank bubble and no error.`,
          `          res.statusCode = response.status;`,
          `          // Annotated because this tsconfig has no DOM lib, so Headers comes from`,
          `          // @types/node and these params are implicitly \`any\` under noImplicitAny.`,
          `          response.headers.forEach((value: string, key: string) => res.setHeader(key, value));`,
          `          if (!response.body) {`,
          `            res.end();`,
          `            return;`,
          `          }`,
          ``,
          `          // Write each chunk as it lands — buffering here defeats streaming.`,
          `          const reader = response.body.getReader();`,
          `          for (;;) {`,
          `            const { value, done } = await reader.read();`,
          `            if (done) break;`,
          `            res.write(value);`,
          `          }`,
          `          res.end();`,
          `        } catch (error) {`,
          `          // Loudly, and as JSON: readOpenAIStream throws a WireError carrying`,
          `          // this message, so the failure reaches the UI instead of being a`,
          `          // bubble that never fills.`,
          `          console.error('[chat-api]', error);`,
          `          if (!res.headersSent) {`,
          `            res.statusCode = 502;`,
          `            res.setHeader('Content-Type', 'application/json');`,
          `            res.end(`,
          `              JSON.stringify({`,
          `                error: { message: error instanceof Error ? error.message : String(error) },`,
          `              }),`,
          `            );`,
          `          } else {`,
          `            // Mid-stream: the status is already out, so the only honest move is`,
          `            // to stop rather than append an error frame the parser would read`,
          `            // as content.`,
          `            res.end();`,
          `          }`,
          `        }`,
          `      });`,
          `    },`,
          `  };`,
          `}`,
          ``,
        ].join('\n'),
      },
    ],
  };
}

/** The Vite SPA host. React is the only SPA wired today; the shape is per-starter. */
export const REACT_ROUTE_HOST = viteSpaHost();

export const NEXT_ROUTE_HOST = nextHost;

/**
 * Assemble every file the route needs for this (integration, framework) pair.
 *
 * Returns an empty array when the framework declares no route host, which is
 * how "this cell is not wired" is represented — the caller refuses the combination
 * rather than emitting a project whose front end posts to a path nothing serves.
 */
export function emitRoute(integration: Integration, framework: FrameworkDef): EmittedFile[] {
  const host = framework.route;
  if (!host) return [];
  const fragment = integration.webRoute;
  if (!fragment) return [];

  // What goes above THIS fragment, asked per fragment rather than assumed. The
  // content helpers come back only for the routes that call them, so a route
  // that does not is not handed declarations `--noUnusedLocals` would reject.
  const preamble = chatRoutePreamble(fragment);

  return [
    {
      path: host.file,
      contents: [
        `// ${host.file} — ${host.runtime}`,
        ...preamble.imports,
        ...(host.before ?? []),
        ``,
        ...preamble.decl,
        ``,
        fragment,
        ...host.after,
        ``,
      ].join('\n'),
    },
    ...(host.extra ?? []),
  ];
}

/**
 * Every symbol the emitted route file declares above the handler.
 *
 * Read back out of what `emitRoute` actually produced, for the build guard. The
 * kit derives its own `symbols` from its declaration text for the same reason:
 * a listed set is a restatement, and a restatement is what drifts.
 */
export function emittedPreambleSymbols(integration: Integration): readonly string[] {
  return integration.webRoute ? chatRoutePreamble(integration.webRoute).symbols : [];
}
