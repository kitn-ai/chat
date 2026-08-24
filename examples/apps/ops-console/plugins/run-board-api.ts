/**
 * The run board's API, mounted on the BOARD dev server (the second origin).
 *
 * Two different origins read this feed: the board page, which is same-origin
 * with it, and the console on :5182, which is not — hence CORS. The console is
 * allowed to READ the run and to START or ROLL BACK one, and that is the whole
 * surface. The board page itself never mutates: its rollback button emits a card
 * event up the bridge and waits for the console to come back through this API.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { StartRunInput } from '../shared/run.js';
import { getRun, resetRun, rollbackRun, startRun, subscribe } from '../server/run-engine.js';
import { readBody } from './bridge.js';

/** Dev-only: any http loopback origin may talk to the board. */
function allowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:') return null;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? origin : null;
  } catch {
    return null;
  }
}

function cors(req: IncomingMessage, res: ServerResponse): void {
  const origin = allowedOrigin(req.headers.origin);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

function startInput(body: string): StartRunInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    parsed = {};
  }
  const input = (parsed ?? {}) as Partial<StartRunInput>;
  return {
    service: typeof input.service === 'string' && input.service ? input.service : 'payments',
    region: typeof input.region === 'string' && input.region ? input.region : 'us-east-1',
    ticket: typeof input.ticket === 'string' && input.ticket ? input.ticket : 'CHG-0000',
  };
}

export function runBoardApiPlugin(): Plugin {
  return {
    name: 'ops-console-run-board-api',
    configureServer(server) {
      server.middlewares.use('/api/run', async (req, res) => {
        cors(req, res);
        const path = (req.url ?? '/').split('?')[0]!.replace(/\/$/, '') || '/';

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        try {
          if (req.method === 'GET' && path === '/') {
            json(res, 200, getRun());
            return;
          }

          if (req.method === 'GET' && path === '/stream') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            // Seed the subscriber with the CURRENT state: a client that connects
            // mid-run must not sit blank until the next tick.
            res.write(`data: ${JSON.stringify(getRun())}\n\n`);
            const unsubscribe = subscribe((state) => {
              res.write(`data: ${JSON.stringify(state)}\n\n`);
            });
            // A keep-alive comment, so an idle run does not look like a dead feed.
            const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
            const close = (): void => {
              clearInterval(heartbeat);
              unsubscribe();
            };
            req.on('close', close);
            res.on('close', close);
            return;
          }

          if (req.method === 'POST' && path === '/start') {
            json(res, 200, startRun(startInput(await readBody(req))));
            return;
          }

          if (req.method === 'POST' && path === '/rollback') {
            json(res, 200, rollbackRun());
            return;
          }

          if (req.method === 'POST' && path === '/reset') {
            json(res, 200, resetRun());
            return;
          }

          json(res, 404, { error: `No run-board route for ${req.method} ${path}.` });
        } catch (error) {
          // An unhandled rejection in an async connect middleware EXITS Node 22.
          server.config.logger.error(`[run-board-api] ${String(error)}`);
          if (!res.headersSent) json(res, 500, { error: 'Run board failed.' });
          else res.end();
        }
      });
    },
  };
}
