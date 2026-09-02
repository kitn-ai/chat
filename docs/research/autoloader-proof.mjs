// PROOF: serve dist/elements, load a page with only <kai-chat> + the autoloader,
// and assert the autoloader fetched ONLY chat's module + shared chunks — not the
// other element modules — and that kai-chat rendered. The selective module graph
// is also the tree-shaking proof (chat.js does not reach artifact/form/etc.).
//
// Build first:  KAI_BUILD=split npx vite build --config config/vite/elements.ts
// Then run:     node docs/research/autoloader-proof.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = execSync('git rev-parse --show-toplevel').toString().trim();
const ROOT = path.join(REPO, 'dist/elements');
const pw = require(path.join(REPO, 'node_modules/playwright/index.js'));

fs.writeFileSync(path.join(ROOT, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"></head>
<body><kai-chat placeholder="Ask me anything" style="display:block;height:90vh"></kai-chat>
<script type="module" src="./autoloader.js"></script></body></html>`);

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (req.url === '/') p = path.join(ROOT, 'index.html');
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
const PORT = 8799;
await new Promise((r) => server.listen(PORT, r));

const browser = await pw.chromium.launch();
const page = await browser.newPage();
const elementModules = new Set();
const sharedChunks = new Set();
const consoleErrors = [];
const SKIP = new Set(['autoloader.js', 'index.html']);
page.on('request', (req) => {
  const u = new URL(req.url());
  if (u.pathname.includes('/chunks/')) { sharedChunks.add(u.pathname.split('/').pop()); return; }
  const f = u.pathname.split('/').pop();
  if (f.endsWith('.js') && !SKIP.has(f)) elementModules.add(f);
});
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => {
  const el = document.querySelector('kai-chat');
  return el && el.shadowRoot && el.shadowRoot.childElementCount > 0;
}, { timeout: 8000 }).catch(() => {});

const rendered = await page.evaluate(() => {
  const el = document.querySelector('kai-chat');
  return { defined: !!customElements.get('kai-chat'), shadowKids: el?.shadowRoot?.childElementCount || 0 };
});

// MutationObserver path: inject a NEW element after load → autoloader should
// discover + load + upgrade it on the fly.
await page.evaluate(() => {
  const el = document.createElement('kai-loader');
  document.body.appendChild(el);
});
const dynamicUpgraded = await page
  .waitForFunction(() => !!customElements.get('kai-loader'), { timeout: 6000 })
  .then(() => true)
  .catch(() => false);

await browser.close();
server.close();

const loaded = [...elementModules].sort();
const FORBIDDEN = ['artifact.js', 'form.js', 'file-tree.js', 'cards.js', 'voice-input.js', 'index.js'];
const leaked = FORBIDDEN.filter((f) => elementModules.has(f));

console.log('--- kai autoloader proof (dist/elements) ---');
console.log('kai-chat defined + rendered :', rendered.defined, '| shadow children:', rendered.shadowKids);
console.log('element modules loaded      :', loaded.join(', ') || '(none)');
console.log('shared chunks loaded        :', sharedChunks.size);
console.log('dynamically-added kai-loader:', dynamicUpgraded ? 'loaded + upgraded ✅' : 'NOT upgraded ❌');
console.log('forbidden modules leaked    :', leaked.length ? leaked.join(', ') : 'NONE ✅');
console.log('console errors              :', consoleErrors.length);
if (consoleErrors.length) consoleErrors.slice(0, 4).forEach((e) => console.log('   ↳', e.slice(0, 200)));

// Expect exactly the elements actually present: chat (initial) + loader (injected).
const expected = new Set(['chat.js', 'loader.js']);
const onlyExpected = loaded.length === expected.size && loaded.every((f) => expected.has(f));
const pass = rendered.defined && rendered.shadowKids > 0 && elementModules.has('chat.js') &&
  dynamicUpgraded && onlyExpected && leaked.length === 0 && consoleErrors.length === 0;
console.log('\nRESULT:', pass
  ? 'PASS ✅ — chat (initial) + loader (dynamic) loaded on demand, nothing else, zero errors'
  : 'FAIL ❌');
process.exit(pass ? 0 : 1);
