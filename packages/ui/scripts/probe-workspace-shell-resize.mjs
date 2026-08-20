/**
 * B4 probe: dragging the shell's resize handle actually moves GEOMETRY.
 *
 * Asserts the slotted start aside's `getBoundingClientRect().width` grew by the
 * drag delta and the main region's rect shrank by the same amount — never a
 * state string or an attribute read. Also captures `kai-aside-resize` and checks
 * its reported width matches the measured one.
 *
 *   node scripts/probe-workspace-shell-resize.mjs [--headed]
 *
 * Watch it fail: make the handles static (ResizableHandle `static`) and the
 * drag moves nothing.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>workspace shell resize</title>
<style>html,body{margin:0;height:100%}</style></head>
<body>
  <kai-workspace id="ws" style="display:block;height:100vh">
    <div slot="start" id="rail" style="height:100%">rail</div>
    <div id="main" style="height:100%">main</div>
  </kai-workspace>
  <script type="module">
    let error = null;
    try { await import('/src/elements/chat-workspace.tsx'); } catch (e) { error = String((e && e.stack) || e); }
    const ws = document.getElementById('ws');
    window.__resizes = [];
    ws.addEventListener('kai-aside-resize', (e) => window.__resizes.push(e.detail));
    await new Promise((r) => setTimeout(r, 500));
    window.__probe = { error };
  </script>
</body></html>`;

function servePage() {
  return {
    name: 'probe-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) {
          server.transformIndexHtml(req.url, PAGE).then((html) => {
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          }, next);
          return;
        }
        next();
      });
    },
  };
}

const server = await createServer({
  root, configFile: false, plugins: [servePage(), solidPlugin()],
  server: { port: 0, strictPort: false }, logLevel: 'warn',
});
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
page.on('pageerror', (e) => console.error('pageerror:', String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__probe, null, { timeout: 60_000 });
const probe = await page.evaluate(() => window.__probe);
if (probe.error) {
  console.error('module import failed:\n' + probe.error);
  await browser.close(); await server.close(); process.exit(2);
}

const rect = (sel) => page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}, sel);

const before = { rail: await rect('#rail'), main: await rect('#main') };

// The handle lives in the shadow root; drive it by coordinates with a real drag.
const handle = await page.evaluate(() => {
  const sep = document.getElementById('ws').shadowRoot.querySelector('[role="separator"]');
  if (!sep) return null;
  const r = sep.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!handle) {
  console.error('FAIL: no [role="separator"] handle in the shadow root');
  await browser.close(); await server.close(); process.exit(1);
}

const DELTA = 100;
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(handle.x + (DELTA / 10) * i, handle.y);
await page.mouse.up();
await page.waitForTimeout(200);

const after = { rail: await rect('#rail'), main: await rect('#main') };
const resizes = await page.evaluate(() => window.__resizes);

const railGrew = after.rail.width - before.rail.width;
const mainShrank = before.main.width - after.main.width;

let failed = false;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} (${detail})`);
  if (!ok) failed = true;
};

check('rail width grew by the drag delta', Math.abs(railGrew - DELTA) <= 3,
  `before ${before.rail.width.toFixed(1)}px, after ${after.rail.width.toFixed(1)}px, delta ${railGrew.toFixed(1)}px vs drag ${DELTA}px`);
check('main region reflowed by the same amount', Math.abs(mainShrank - DELTA) <= 3,
  `before ${before.main.width.toFixed(1)}px, after ${after.main.width.toFixed(1)}px, shrank ${mainShrank.toFixed(1)}px`);
check('kai-aside-resize fired for the start aside', resizes.length > 0 && resizes.every((r) => r.side === 'start'),
  `${resizes.length} event(s), last ${JSON.stringify(resizes.at(-1) ?? null)}`);
check('reported width matches the measured rect', resizes.length > 0 && Math.abs(resizes.at(-1).width - after.rail.width) <= 3,
  `event ${resizes.at(-1)?.width?.toFixed?.(1)}px vs rect ${after.rail.width.toFixed(1)}px`);

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
