/**
 * B4 probe: content slotted into all five shell slots actually PAINTS, each in
 * its own region of the page.
 *
 * Every projected node must have a non-zero rect, and the rects must sit in the
 * arrangement the shell promises: header spans the top, footer the bottom, the
 * start aside inline-start of main, the end aside inline-end of it. Geometry,
 * not slot-assignment bookkeeping.
 *
 *   node scripts/probe-workspace-shell-slots.mjs [--headed]
 *
 * Watch it fail: drop one region's slot rendering from the facade.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>workspace shell slots</title>
<style>html,body{margin:0;height:100%}</style></head>
<body>
  <kai-workspace id="ws" style="display:block;height:100vh">
    <div slot="header" id="s-header">header band</div>
    <div slot="start" id="s-start" style="height:100%">start aside</div>
    <div slot="main" id="s-main" style="height:100%">main named</div>
    <div id="s-default">main default</div>
    <div slot="end" id="s-end" style="height:100%">end aside</div>
    <div slot="footer" id="s-footer">footer band</div>
  </kai-workspace>
  <script type="module">
    let error = null;
    try { await import('/src/elements/chat-workspace.tsx'); } catch (e) { error = String((e && e.stack) || e); }
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
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on('pageerror', (e) => console.error('pageerror:', String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__probe, null, { timeout: 60_000 });
const probe = await page.evaluate(() => window.__probe);
if (probe.error) {
  console.error('module import failed:\n' + probe.error);
  await browser.close(); await server.close(); process.exit(2);
}

const rects = await page.evaluate(() => {
  const out = {};
  for (const id of ['s-header', 's-start', 's-main', 's-default', 's-end', 's-footer']) {
    const r = document.getElementById(id).getBoundingClientRect();
    out[id] = { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  }
  return out;
});

let failed = false;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} (${detail})`);
  if (!ok) failed = true;
};

for (const [id, r] of Object.entries(rects)) {
  check(`${id} painted with a non-zero rect`, r.width > 0 && r.height > 0,
    `${r.width.toFixed(1)}x${r.height.toFixed(1)} at ${r.x.toFixed(1)},${r.y.toFixed(1)}`);
}

const { 's-header': header, 's-start': start, 's-main': main, 's-end': end, 's-footer': footer } = rects;
check('header sits above the columns', header.bottom <= start.y + 1 && header.bottom <= main.y + 1,
  `header bottom ${header.bottom.toFixed(1)} vs start/main top ${start.y.toFixed(1)}/${main.y.toFixed(1)}`);
check('footer sits below the columns', footer.y + 1 >= main.bottom,
  `footer top ${footer.y.toFixed(1)} vs main bottom ${main.bottom.toFixed(1)}`);
check('start aside is inline-start of main', start.right <= main.x + 1,
  `start right ${start.right.toFixed(1)} vs main x ${main.x.toFixed(1)}`);
check('end aside is inline-end of main', end.x + 1 >= main.right,
  `end x ${end.x.toFixed(1)} vs main right ${main.right.toFixed(1)}`);
check('the default slot lands in the main region (same column as main)',
  Math.abs(rects['s-default'].x - main.x) <= 1, `default x ${rects['s-default'].x.toFixed(1)} vs main x ${main.x.toFixed(1)}`);

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
