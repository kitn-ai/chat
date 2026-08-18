// Static harness for the focus-ring paint guard.
//
// This server exists to reproduce the REAL CONSUMER condition and nothing else:
// a page that loads the built element bundle and NO document-level Tailwind.
// Storybook and the docs site both `@import "tailwindcss"` at document level,
// which registers every `--tw-*` custom property globally and makes shadow-root
// rings paint — that is precisely why this defect was invisible for so long.
// Do NOT add a stylesheet link here, and do not serve `src/elements/compiled.css`
// to the document: the guard asserts the absence of both and will fail loudly.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '../..');
const PORT = Number(process.env.FOCUS_RING_PORT || 6210);

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
};

/**
 * The suite drives `dist/`, so both inputs must exist. Whether dist is CURRENT
 * is a separate and much sharper question, answered in the spec itself
 * (`assertServedBundleIsFresh`) — it needs the browser's CSSOM to normalize
 * away the bundler's re-minification, which Node cannot do.
 */
function assertInputsExist() {
  const cssPath = path.join(PKG, 'src/elements/compiled.css');
  if (!fs.existsSync(cssPath)) {
    throw new Error(
      `focus-ring harness: ${cssPath} is missing.\n` +
        'Run:  pnpm --filter @kitn.ai/ui run build:css',
    );
  }
  if (!fs.existsSync(path.join(PKG, 'dist'))) {
    throw new Error(
      'focus-ring harness: dist/ is missing — this suite drives the BUILT bundle.\n' +
        'Run:  pnpm exec nx build ui',
    );
  }
}

const HARNESS = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>focus-ring paint harness</title>
    <style>
      /* Deliberately plain, hand-written CSS. No Tailwind, no build step. */
      body { margin: 0; padding: 24px; background: #fff; font-family: system-ui, sans-serif; }
      #mounts { display: flex; flex-direction: column; gap: 28px; align-items: flex-start; }
    </style>
  </head>
  <body>
    <div id="mounts"></div>
    <script type="module">
      import '/dist/kai.es.js';
      window.__kaiReady = true;
    </script>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(HARNESS);
    return;
  }
  if (url.startsWith('/dist/')) {
    // Resolve inside dist only; reject any traversal out of it.
    const target = path.resolve(PKG, '.' + url);
    const distRoot = path.resolve(PKG, 'dist');
    if (target.startsWith(distRoot + path.sep) && fs.existsSync(target)) {
      res.writeHead(200, {
        'content-type': MIME[path.extname(target)] || 'application/octet-stream',
      });
      fs.createReadStream(target).pipe(res);
      return;
    }
  }
  res.writeHead(404);
  res.end('not found');
});

try {
  assertInputsExist();
} catch (e) {
  console.error(`\n${e.message}\n`);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`focus-ring harness on http://localhost:${PORT}/`);
});
