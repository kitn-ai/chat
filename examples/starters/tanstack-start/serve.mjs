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
import { join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const clientDir = join(root, 'dist', 'client');
// Trailing separator, on purpose. A bare `startsWith(clientDir)` also matches
// SIBLINGS whose name merely begins with it (dist/client-secret/), so the boundary
// has to be the separator, not the string.
const clientPrefix = clientDir.endsWith(sep) ? clientDir : clientDir + sep;
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

const badRequest = () => new Response('Bad Request', { status: 400 });

// Returns a Response to send, or null to hand the request to the SSR handler.
//
// THE ORDER HERE IS THE WHOLE POINT: decode, then resolve, then check containment,
// then touch the disk. `url.pathname` is still percent-encoded, so the string we
// would validate and the string the filesystem actually opens are different
// strings. Validate the encoded one and `/..%2f..%2fsecret` sails past a guard that
// has already pronounced the path safe, because `..%2f` only becomes `../` after
// the decode. `serve.traversal.test.mjs` pins this down by running the same probes
// against a build with the check before the decode, and asserting it LEAKS.
//
// `new URL` in the request handler does part of the job already: it resolves
// dot-segments and counts `%2e` as a dot, so plain `..` and `%2e%2e/` never arrive
// here. It does NOT touch `%2f`, which is exactly the vector this function has to
// stop. Don't lean on that upstream pass; it is one refactor away from disappearing.
async function serveStatic(pathname) {
  if (pathname === '/' || pathname.endsWith('/')) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return badRequest(); // decodeURIComponent('%') throws URIError. A 400, not a crash.
  }

  // Exactly one decode pass, never a loop-until-stable: re-decoding would turn
  // `%252e%252e` back into `..` and reopen the hole from the other side. After one
  // pass `%252e%252e` is a literal filename, which is the correct reading of it.

  // A NUL truncates the path at the syscall boundary; a backslash is a separator on
  // Windows and a legal filename character on POSIX, so the same request would mean
  // two different files. Neither appears in a real Vite asset name.
  if (decoded.includes('\0') || decoded.includes('\\')) return badRequest();

  // join(), not resolve(): `decoded` is attacker-controlled and may be absolute, and
  // resolve() would honour that and walk out of clientDir entirely. join() re-roots
  // it and normalises away the `..` the decode just produced.
  const filePath = join(clientDir, decoded);
  if (filePath === clientDir) return null;
  if (!filePath.startsWith(clientPrefix)) return badRequest();

  let body;
  try {
    if (!(await stat(filePath)).isFile()) return null;
    body = await readFile(filePath);
  } catch {
    return null;
  }
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
