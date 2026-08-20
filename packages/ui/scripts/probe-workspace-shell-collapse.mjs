/**
 * B4 probe: crossing `collapse-below` collapses and restores the aside's RECT.
 *
 * Resizes the real viewport across the breakpoint and asserts the slotted start
 * aside's `getBoundingClientRect()` collapses (width -> 0: an unassigned slot
 * renders nothing) and restores (width back to its configured band) — geometry,
 * not a `collapsed` attribute read.
 *
 *   node scripts/probe-workspace-shell-collapse.mjs [--headed]
 *
 * Watch it fail: no-op the shell's breakpoint handler and the rect never moves.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>workspace shell collapse</title>
<style>html,body{margin:0;height:100%}</style></head>
<body>
  <kai-workspace id="ws" collapse-below="700" style="display:block;height:100vh">
    <div slot="start" id="rail" style="height:100%">rail</div>
    <div id="main" style="height:100%">main</div>
  </kai-workspace>
  <script type="module">
    let error = null;
    try { await import('/src/elements/chat-workspace.tsx'); } catch (e) { error = String((e && e.stack) || e); }
    window.__toggles = [];
    document.getElementById('ws').addEventListener('kai-aside-toggle', (e) => window.__toggles.push(e.detail));
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
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.error('pageerror:', String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__probe, null, { timeout: 60_000 });
const probe = await page.evaluate(() => window.__probe);
if (probe.error) {
  console.error('module import failed:\n' + probe.error);
  await browser.close(); await server.close(); process.exit(2);
}

const railWidth = () => page.evaluate(() => document.getElementById('rail').getBoundingClientRect().width);

let failed = false;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} (${detail})`);
  if (!ok) failed = true;
};

const wide = await railWidth();
check('above the breakpoint the aside has real width', wide >= 200, `${wide.toFixed(1)}px at 900px viewport`);

await page.setViewportSize({ width: 600, height: 600 });
await page.waitForTimeout(300);
const narrow = await railWidth();
check('below the breakpoint the aside rect collapses', narrow === 0, `${narrow.toFixed(1)}px at 600px viewport`);

await page.setViewportSize({ width: 900, height: 600 });
await page.waitForTimeout(300);
const restored = await railWidth();
check('back above the breakpoint the aside rect restores', restored >= 200, `${restored.toFixed(1)}px at 900px viewport`);

const toggles = await page.evaluate(() => window.__toggles);
check('kai-aside-toggle reported both transitions', toggles.length >= 2
  && toggles.some((t) => t.side === 'start' && t.collapsed === true)
  && toggles.some((t) => t.side === 'start' && t.collapsed === false),
  JSON.stringify(toggles));

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
