// Static server standing in for the CDN. Logs every request with the byte
// count actually served, so the report's payload numbers come from the wire,
// not from `ls -l` over files that might never be fetched.
import { createServer } from 'node:http';
import { readFile, appendFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 8931);
const LOG = join(ROOT, `access-${PORT}.log`);

const TYPES = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = normalize(decodeURIComponent(url.pathname));
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
    await appendFile(LOG, `200 ${body.length} ${path}\n`);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    await appendFile(LOG, `404 0 ${path}\n`);
  }
}).listen(PORT, () => console.log(`cdn stand-in on http://localhost:${PORT}/ root=${ROOT}`));
