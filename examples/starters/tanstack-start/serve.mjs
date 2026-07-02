// Minimal production server for the TanStack Start build.
//
// `vite build` emits a portable Web-`fetch` handler at dist/server/server.js
// (not a Node http listener) plus the static client assets in dist/client. A
// real deploy would pick a target (Node, Bun, a CDN/worker, …); for this example
// we bridge Node's http to the fetch handler and serve the static assets, so
// `npm start` runs the SSR build locally. Node 18+ provides the Web globals
// (Request/Response/ReadableStream) this needs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const clientDir = join(root, 'dist', 'client');
const { default: handler } = await import('./dist/server/server.js');

const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

async function serveStatic(pathname) {
  if (pathname === '/' || pathname.endsWith('/')) return null;
  const filePath = join(clientDir, pathname);
  if (!filePath.startsWith(clientDir)) return null; // path traversal guard
  try {
    if (!(await stat(filePath)).isFile()) return null;
  } catch {
    return null;
  }
  const body = await readFile(filePath);
  return new Response(body, {
    headers: { 'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream' },
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Hashed client assets are static files; serve them straight from disk.
    const staticRes = await serveStatic(url.pathname);
    const webRes = staticRes ?? (await handler.fetch(toRequest(req, url)));

    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
    if (webRes.body) {
      const reader = webRes.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

function toRequest(req, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? 'half' : undefined,
  });
}

server.listen(PORT, () => {
  console.log(`▶ TanStack Start (production) on http://localhost:${PORT}`);
});
