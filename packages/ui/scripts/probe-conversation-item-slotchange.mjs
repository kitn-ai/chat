/**
 * A2 probe — REAL-BROWSER slotchange timing on `<kai-conversations>` item mode
 * (spec 2026-08-20 § 2a): appending or removing a light-DOM
 * `<kai-conversation-item>` at runtime re-derives the roving tabindex — exactly
 * one item `tabindex="0"` after every mutation — and mode flips are honest
 * (batteries rows return when the last item leaves).
 *
 *   node scripts/probe-conversation-item-slotchange.mjs [--headed]
 *
 * WATCH IT FAIL: disable the container's sync effect (the
 * `itemsController.sync()` createEffect in src/elements/conversation-list.tsx)
 * and the exactly-one-tab-stop assertions go red after every mutation. Recorded
 * in the lane report.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>conversation item slotchange</title></head>
<body>
  <div style="width:300px;height:400px">
    <kai-conversations id="list">
      <kai-conversation-item conversation-id="a">Alpha thread</kai-conversation-item>
      <kai-conversation-item conversation-id="b">Beta thread</kai-conversation-item>
    </kai-conversations>
  </div>
  <script type="module">
    let error = null;
    try {
      await import('/src/elements/conversation-list.tsx');
      await import('/src/elements/conversation-item.tsx');
    } catch (e) { error = String((e && e.stack) || e); }
    const list = document.getElementById('list');
    list.groups = [];
    list.conversations = [{
      id: 'batt-1', title: 'Batteries row', scope: { type: 'collection' },
      messageCount: 1, lastMessageAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
    }];
    list.activeId = 'a';
    await new Promise((r) => setTimeout(r, 600));
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
  root,
  configFile: false,
  plugins: [servePage(), solidPlugin()],
  server: { port: 0, strictPort: false },
  logLevel: 'warn',
});
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__probe, null, { timeout: 60_000 });
const boot = await page.evaluate(() => window.__probe);
if (boot.error) {
  console.error('module import failed:\n' + boot.error);
  await browser.close();
  await server.close();
  process.exit(2);
}

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const readState = () =>
  page.evaluate(() => {
    const list = document.getElementById('list');
    // The sibling restructure (ratified 2026-08-20): roving tabindex and
    // aria-current live on each item's shadow BODY, not the host.
    const items = [...document.querySelectorAll('kai-conversation-item')].map((i) => {
      const body = i.shadowRoot?.querySelector('[data-kai-item-body]');
      return {
        id: i.getAttribute('conversation-id'),
        tabindex: body?.getAttribute('tabindex') ?? null,
        current: body?.getAttribute('aria-current') ?? null,
        rect: (({ y, height }) => ({ y, height }))(i.getBoundingClientRect()),
      };
    });
    return { items, batteriesVisible: (list.shadowRoot?.textContent ?? '').includes('Batteries row') };
  });

console.log('\nslotchange re-derives the roving tabindex');

let s = await readState();
check('item mode on load: batteries row NOT rendered', !s.batteriesVisible);
check('exactly one tab stop among the initial items', s.items.filter((i) => i.tabindex === '0').length === 1, JSON.stringify(s.items.map((i) => i.tabindex)));
check('the active item (a) is the tab stop', s.items.find((i) => i.id === 'a')?.tabindex === '0');
check('items painted (non-zero heights)', s.items.every((i) => i.rect.height > 0), JSON.stringify(s.items.map((i) => i.rect)));

// Append a third item at runtime.
await page.evaluate(() => {
  const item = document.createElement('kai-conversation-item');
  item.setAttribute('conversation-id', 'c');
  item.textContent = 'Gamma thread';
  document.getElementById('list').appendChild(item);
});
await page.waitForTimeout(300);
s = await readState();
check('after append: three items, exactly one tab stop', s.items.length === 3 && s.items.filter((i) => i.tabindex === '0').length === 1, JSON.stringify(s.items.map((i) => [i.id, i.tabindex])));
check('after append: the appended item painted', (s.items.find((i) => i.id === 'c')?.rect.height ?? 0) > 0);

// Remove the ACTIVE item: the tab stop must re-derive onto a survivor.
await page.evaluate(() => document.querySelector('kai-conversation-item[conversation-id="a"]').remove());
await page.waitForTimeout(300);
s = await readState();
check('after removing the active item: exactly one tab stop among survivors', s.items.length === 2 && s.items.filter((i) => i.tabindex === '0').length === 1, JSON.stringify(s.items.map((i) => [i.id, i.tabindex])));

// Remove the rest: mode flips back to batteries.
await page.evaluate(() => document.querySelectorAll('kai-conversation-item').forEach((i) => i.remove()));
await page.waitForTimeout(300);
s = await readState();
check('after the last item leaves: batteries rows return', s.batteriesVisible);

if (pageErrors.length) { console.log('\npage errors:\n  ' + pageErrors.join('\n  ')); failed++; }
await browser.close();
await server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
