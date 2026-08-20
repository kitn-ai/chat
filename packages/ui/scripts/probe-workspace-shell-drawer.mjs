/**
 * B4 probe: the mobile drawer OVERLAYS main (z-order verified via
 * elementFromPoint), Escape closes it, and focus returns to the opener.
 *
 * Narrow viewport (under `drawer-below`): expanding the start aside must paint
 * it OVER the main region — its rect overlaps main's rect and
 * `document.elementFromPoint` at the drawer's center hits the drawer content,
 * not main. Escape inside it closes the drawer and `document.activeElement`
 * lands back on the button that opened it.
 *
 *   node scripts/probe-workspace-shell-drawer.mjs [--headed]
 *
 * Watch it fail: drop the focus restore (or the Escape handler) in the shell.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>workspace shell drawer</title>
<style>html,body{margin:0;height:100%}</style></head>
<body>
  <kai-workspace id="ws" drawer-below="640" default-start-collapsed style="display:block;height:100vh">
    <div slot="start" id="rail" style="height:100%;padding:8px">
      <button id="in-rail">rail action</button>
    </div>
    <div id="main" style="height:100%;padding:8px">
      <button id="opener">open rail</button>
    </div>
  </kai-workspace>
  <script type="module">
    let error = null;
    try { await import('/src/elements/chat-workspace.tsx'); } catch (e) { error = String((e && e.stack) || e); }
    const ws = document.getElementById('ws');
    document.getElementById('opener').addEventListener('click', () => ws.expandAside('start'));
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
const page = await browser.newPage({ viewport: { width: 480, height: 600 } });
page.on('pageerror', (e) => console.error('pageerror:', String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__probe, null, { timeout: 60_000 });
const probe = await page.evaluate(() => window.__probe);
if (probe.error) {
  console.error('module import failed:\n' + probe.error);
  await browser.close(); await server.close(); process.exit(2);
}

let failed = false;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} (${detail})`);
  if (!ok) failed = true;
};

// Open the drawer with a REAL click (which also focuses the opener).
await page.click('#opener');
await page.waitForTimeout(200);

const geo = await page.evaluate(() => {
  const rail = document.getElementById('rail').getBoundingClientRect();
  const main = document.getElementById('main').getBoundingClientRect();
  const cx = rail.x + rail.width / 2;
  const cy = rail.y + rail.height / 2;
  const top = document.elementFromPoint(cx, cy);
  return {
    rail: { x: rail.x, width: rail.width },
    main: { x: main.x, width: main.width },
    overlap: rail.width > 0 && main.width > 0 && rail.x < main.x + main.width && main.x < rail.x + rail.width,
    topId: top ? top.id || top.tagName : null,
  };
});

check('the drawer painted with real width', geo.rail.width > 0, `rail width ${geo.rail.width.toFixed(1)}px`);
check('the drawer rect OVERLAPS main (an overlay, not a column)', geo.overlap,
  `rail x ${geo.rail.x.toFixed(1)} w ${geo.rail.width.toFixed(1)}; main x ${geo.main.x.toFixed(1)} w ${geo.main.width.toFixed(1)}`);
check('elementFromPoint at the drawer center hits drawer content (z-order)',
  geo.topId === 'rail' || geo.topId === 'in-rail', `top element: ${geo.topId}`);

// Escape from inside the drawer: closes it and returns focus to the opener.
await page.focus('#in-rail');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

const after = await page.evaluate(() => ({
  railWidth: document.getElementById('rail').getBoundingClientRect().width,
  active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
}));

check('Escape closed the drawer (rect gone)', after.railWidth === 0, `rail width ${after.railWidth.toFixed(1)}px`);
check('focus returned to the opener', after.active === 'opener', `document.activeElement: ${after.active}`);

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
