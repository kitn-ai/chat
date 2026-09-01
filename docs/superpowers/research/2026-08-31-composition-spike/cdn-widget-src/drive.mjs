// Drives the CDN pages through the same story the spike used, light and dark,
// and accounts every network request (count + encoded bytes) per page load.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8931';
const SHOTS = process.env.SHOTS ?? './shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();

async function measure(pagePath, name, colorScheme, { story = true } = {}) {
  const ctx = await browser.newContext({ colorScheme, viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  const requests = [];
  page.on('response', async (res) => {
    try {
      const body = await res.body();
      requests.push({ url: res.url(), status: res.status(), bytes: body.length });
    } catch { requests.push({ url: res.url(), status: res.status(), bytes: -1 }); }
  });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  const t0 = Date.now();
  await page.goto(`${BASE}${pagePath}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__widgetReady === true, null, { timeout: 15000 }).catch(() => {});
  const readyMs = Date.now() - t0;
  // Launcher visible?
  const launcher = page.locator('kai-dock');
  await launcher.waitFor({ state: 'attached' });
  await page.waitForTimeout(400);
  const initialReq = requests.length;
  const initialBytes = requests.reduce((a, r) => a + Math.max(0, r.bytes), 0);

  await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-1-closed.png` });

  let result = { name, colorScheme, readyMs, initialReq, initialBytes, errors };
  let result_clickedLauncher;
  if (story) {
    // Open the launcher (dock button is in shadow DOM; click the host).
    const t1 = Date.now();
    const clickedLauncher = await page.evaluate(() => {
      const btn = document.getElementById('dock').shadowRoot?.querySelector('button');
      if (btn) { btn.click(); return true; }
      document.getElementById('dock').show();
      return false;
    });
    result_clickedLauncher = clickedLauncher;
    // Home tab: wait for the greeting.
    await page.waitForTimeout(1200);
    result.openMs = Date.now() - t1;
    result.clickedLauncher = result_clickedLauncher;
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-2-home.png` });

    // CTA into the thread: "Send us a message" button lives in kai-chat's shadow.
    const clickedCta = await page.evaluate(() => {
      const find = (root, pred, out = []) => {
        for (const el of root.querySelectorAll('*')) {
          if (pred(el)) out.push(el);
          if (el.shadowRoot) find(el.shadowRoot, pred, out);
        }
        return out;
      };
      const btns = find(document, (el) => el instanceof HTMLButtonElement && /send us a message/i.test(el.textContent ?? ''));
      if (btns[0]) { btns[0].click(); return true; }
      return false;
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-3-thread-empty.png` });
    result.clickedCta = clickedCta;

    // Click the first suggestion chip.
    const clickedChip = await page.evaluate(() => {
      const find = (root, pred, out = []) => {
        for (const el of root.querySelectorAll('*')) {
          if (pred(el)) out.push(el);
          if (el.shadowRoot) find(el.shadowRoot, pred, out);
        }
        return out;
      };
      const chips = find(document, (el) => el instanceof HTMLButtonElement && /where's my order/i.test(el.textContent ?? ''));
      if (chips[0]) { chips[0].click(); return true; }
      return false;
    });
    result.clickedChip = clickedChip;
    // Let the mock stream settle (reasoning + text + tool row).
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-4-reply.png` });

    // Assertions on rendered content.
    result.threadText = await page.evaluate(() => {
      const texts = [];
      const walk = (root) => {
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { texts.push(el.shadowRoot.textContent ?? ''); walk(el.shadowRoot); }
      };
      walk(document);
      const all = texts.join(' ');
      return {
        pulledUp: all.includes('Let me pull up that order'),
        tool: /lookup[_-]?order/i.test(all),
        dhl: all.includes('DHL'),
      };
    });
    result.totalReq = requests.length;
    result.totalBytes = requests.reduce((a, r) => a + Math.max(0, r.bytes), 0);
  }
  result.requests = requests.map((r) => `${r.status} ${r.bytes} ${r.url.replace(BASE, '')}`);
  await ctx.close();
  return result;
}

const out = [];
out.push(await measure('/index.html', 'autoloader', 'light'));
out.push(await measure('/index.html', 'autoloader', 'dark'));
out.push(await measure('/register-all.html', 'registerall', 'light'));
out.push(await measure('/register-all.html', 'registerall', 'dark', { story: false }));

// Root-import probe.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index-root-import.html`);
  await page.waitForFunction(() => window.__rootImport !== 'pending', null, { timeout: 5000 }).catch(() => {});
  out.push({ name: 'root-import-probe', result: await page.evaluate(() => window.__rootImport) });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
