/**
 * A2 probe — REAL-BROWSER focus order across slotted `<kai-conversation-item>`
 * children of `<kai-conversations>` (spec 2026-08-20 § 2a). jsdom has no real
 * focus traversal or paint, so the roving-tabindex contract must be measured in
 * Chromium:
 *
 *   1. Tab from a control BEFORE the list enters the list AT THE ACTIVE item
 *      (roving tabindex: the active item is the single tab stop).
 *   2. ArrowDown / ArrowUp move focus item-to-item across the SLOTTED children,
 *      with the `document.activeElement` chain asserted through the shadow
 *      boundary.
 *   3. Geometry, not state strings: every focused item has a non-zero bounding
 *      rect inside the list's rect, and consecutive focus targets sit at
 *      DIFFERENT y positions (the focus really moved between painted rows).
 *
 *   node scripts/probe-conversation-item-focus-order.mjs [--headed]
 *
 * WATCH IT FAIL: disable the container's sync effect (the
 * `itemsController.sync()` createEffect in src/elements/conversation-list.tsx)
 * and step 1 goes red — every item keeps no tabindex, so Tab skips the list or
 * enters at the wrong node. Recorded in the lane report.
 */
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const axeSource = readFileSync(
  path.join(root, '..', '..', 'node_modules', 'axe-core', 'axe.min.js'),
  'utf-8',
);

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>conversation item focus order</title></head>
<body>
  <button id="before">before the list</button>
  <div style="width:300px;height:400px">
    <kai-conversations id="list">
      <kai-conversation-item conversation-id="a">Alpha thread</kai-conversation-item>
      <kai-conversation-item conversation-id="b">Beta thread
        <button slot="menu" aria-label="Actions for Beta">menu</button>
      </kai-conversation-item>
      <kai-conversation-item conversation-id="c">Gamma thread</kai-conversation-item>
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
    list.activeId = 'b';
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

/** Deepest active element through shadow roots. Under the sibling restructure
 *  (ratified 2026-08-20) the focus target is the item's shadow BODY
 *  (`data-kai-item-body`), so the report resolves the owning
 *  `kai-conversation-item` host via getRootNode().host and says whether the
 *  focused node IS a body. */
const readFocus = () =>
  page.evaluate(() => {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    const r = el?.getBoundingClientRect() ?? { x: 0, y: 0, width: 0, height: 0 };
    const root = el?.getRootNode?.();
    const host = root instanceof ShadowRoot ? root.host : null;
    const isBody = !!el?.hasAttribute?.('data-kai-item-body');
    const owner = host?.localName === 'kai-conversation-item' ? host : (el?.closest?.('kai-conversation-item') ?? null);
    return {
      tag: el?.localName ?? null,
      isBody,
      ownerTag: owner?.localName ?? null,
      id: owner?.getAttribute?.('conversation-id') ?? el?.getAttribute?.('conversation-id') ?? el?.getAttribute?.('aria-label') ?? el?.id ?? null,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  });

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

console.log('\nfocus order over slotted <kai-conversation-item> children');

// The listbox rect, for the containment assertions below.
const listRect = await page.evaluate(() => {
  const r = document.getElementById('list').getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
check('the list painted (non-zero rect)', listRect.width > 0 && listRect.height > 0, JSON.stringify(listRect));

// 1. Tabbing from before the list reaches the item set AT THE ACTIVE item, and
//    the set holds exactly one tab stop (the list chrome — toggle, new-chat,
//    search — legitimately precedes the items in tab order; the contract is
//    about the ITEM set, not the whole element).
await page.click('#before');
const tabTrail = [];
let f;
for (let i = 0; i < 10; i++) {
  await page.keyboard.press('Tab');
  f = await readFocus();
  tabTrail.push(`${f.tag}[${f.id}]${f.isBody ? ':body' : ''}`);
  if (f.isBody) break;
}
check('Tab reaches the item set at the active item body (b)', f.isBody && f.ownerTag === 'kai-conversation-item' && f.id === 'b', tabTrail.join(' -> '));
check('the focused item painted inside the list', f.rect.height > 0 && f.rect.y >= listRect.y, JSON.stringify(f.rect));
const rectB = f.rect;

// The documented tab order (ratified 2026-08-20): each row's menu trigger keeps
// its natural DOM order, so from the active body the next Tab lands on THAT
// row's menu button; the following Tab exits without touching another body.
await page.keyboard.press('Tab');
f = await readFocus();
check("the next Tab lands on the active row's menu trigger", !f.isBody && f.ownerTag === 'kai-conversation-item' && f.id === 'b' && f.tag === 'button', `focused ${f.tag}[${f.id}]`);
await page.keyboard.press('Tab');
f = await readFocus();
check('the following Tab exits the item set (bodies are a single tab stop)', !f.isBody, `focused ${f.tag}[${f.id}]`);

// 2. Arrow keys move focus item-to-item (how focus arrived is irrelevant to the
//    arrow contract, so re-enter at the active item directly).
await page.evaluate(() => document.querySelector('kai-conversation-item[conversation-id="b"]').shadowRoot.querySelector('[data-kai-item-body]').focus());
await page.keyboard.press('ArrowDown');
f = await readFocus();
check('ArrowDown focuses the next item body (c)', f.isBody && f.id === 'c', `focused ${f.tag}[${f.id}]${f.isBody ? ':body' : ''}`);
check('focus moved to a DIFFERENT painted row (y changed)', f.rect.height > 0 && f.rect.y !== rectB.y, `y ${rectB.y} -> ${f.rect.y}`);

await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
f = await readFocus();
check('ArrowUp twice reaches the first item body (a)', f.isBody && f.id === 'a', `focused ${f.tag}[${f.id}]${f.isBody ? ':body' : ''}`);

// 3. Roving bookkeeping after movement: exactly one body tabindex="0".
const roving = await page.evaluate(() =>
  [...document.querySelectorAll('kai-conversation-item')].map((i) =>
    i.shadowRoot.querySelector('[data-kai-item-body]')?.getAttribute('tabindex') ?? null,
  ),
);
check('exactly one item body is the tab stop', roving.filter((t) => t === '0').length === 1, JSON.stringify(roving));

// 4. Enter on the focused item surfaces kai-conversation-select on the container.
//    Install the listener first (it writes to window), then press, then read.
await page.evaluate(() => {
  window.__selected = undefined;
  document
    .getElementById('list')
    .addEventListener('kai-conversation-select', (e) => (window.__selected = e.detail.id), { once: true });
});
await page.keyboard.press('Enter');
const activated = await page.evaluate(() => window.__selected ?? null);
check('Enter activates the focused item (a)', activated === 'a', `detail.id=${activated}`);

// 5. ELEMENT-MODE axe pass — the storybook a11y gate only covers the Solid
//    layer, so the composed element (list region + item hosts + a light-DOM
//    menu button) is measured here, over the same rules that drove the
//    ratified 2026-08-20 sibling restructure.
await page.addScriptTag({ content: axeSource });
const axeResult = await page.evaluate(async () => {
  const results = await window.axe.run(document.getElementById('list'), {
    runOnly: {
      type: 'rule',
      values: ['aria-required-parent', 'aria-required-children', 'nested-interactive', 'aria-allowed-attr', 'aria-valid-attr-value'],
    },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.failureSummary?.trim().replace(/\s+/g, ' ')).join(' | ')}`,
  );
});
check('element mode passes the restructure-driving axe rules', axeResult.length === 0, axeResult.join(' ;; ') || 'no violations');

if (pageErrors.length) { console.log('\npage errors:\n  ' + pageErrors.join('\n  ')); failed++; }
await browser.close();
await server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
