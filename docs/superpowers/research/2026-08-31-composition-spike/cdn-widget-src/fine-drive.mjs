// Drives the fine-grain page (fine.html) through the phase-1/2 story, light
// and dark, plus the accent variant. Interaction is user-level: Playwright's
// shadow-piercing locators click what a person would click; the few
// programmatic calls are PUBLIC element methods (dock.hide()) or the public
// prompt value+send() used only to simulate typing while the dock is closed.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8942';
const SHOTS = process.env.SHOTS ?? './shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const out = [];

async function story(pagePath, name, colorScheme, { full = true } = {}) {
  const ctx = await browser.newContext({ colorScheme, viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  const requests = [];
  page.on('response', async (res) => {
    try { requests.push((await res.body()).length); } catch { requests.push(0); }
  });

  const t0 = Date.now();
  await page.goto(`${BASE}${pagePath}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__widgetReady === true, null, { timeout: 15000 });
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(400);
  const result = { name, colorScheme, readyMs, initialReq: requests.length, initialBytes: requests.reduce((a, b) => a + b, 0), errors };

  await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-1-closed.png` });

  // Open via the real launcher button (accessible name from kai-dock's label).
  await page.getByRole('button', { name: 'Open Support' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-2-home.png` });

  // Home -> thread via the CTA.
  await page.getByRole('button', { name: 'Send us a message' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-3-thread-empty.png` });

  // Suggestion chip (rendered by kai-prompt-input's public `suggestions`).
  await page.getByText("Where's my order?", { exact: false }).last().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-4-reply.png` });
  result.thread = {
    pulledUp: await page.getByText('Let me pull up that order').count() > 0,
    tool: await page.getByText(/lookup[_-]?order/i).count() > 0,
    dhl: await page.getByText('DHL', { exact: false }).count() > 0,
  };

  if (full) {
    // Conversations list via the header toggle.
    await page.getByRole('button', { name: 'Conversations' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-5-conversations.png` });
    const rowTitle = await page.evaluate(() => document.getElementById('conversations').conversations?.[0]?.title ?? null);
    result.listRowTitle = rowTitle;

    // Back into the active conversation by clicking its row (scoped to the
    // list element so the hidden thread's bubble text can't match first).
    await page.locator('kai-conversations').getByText(rowTitle.slice(0, 30), { exact: false }).first().click();
    await page.waitForTimeout(400);

    // Unread badge: close the dock, then a reply lands while closed (public
    // value + send()), so the store's updatedAt outruns lastReadAt and the
    // page derives dock.unread from isConversationUnread over store.list().
    await page.evaluate(() => document.getElementById('dock').hide());
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const prompt = document.getElementById('prompt');
      prompt.value = 'Request a refund';
      prompt.send();
    });
    await page.waitForTimeout(4500);
    result.unreadAfterClosedReply = await page.evaluate(() => document.getElementById('dock').unread === true);
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-6-closed-unread.png` });

    // Reopen: markRead runs, the badge clears.
    await page.getByRole('button', { name: 'Open Support' }).click();
    await page.waitForTimeout(600);
    result.unreadAfterReopen = await page.evaluate(() => document.getElementById('dock').unread === true);
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-7-reopened.png` });

    // New conversation via kai-conversations' built-in control.
    await page.getByRole('button', { name: 'Conversations' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /new chat/i }).click();
    await page.waitForTimeout(400);
    result.emptyAfterNewChat = await page.getByText("Hi, we're here to help").count() > 0;
    await page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-8-new-conversation-empty.png` });

    // Persistence across reload: the boot restore path.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__widgetReady === true, null, { timeout: 15000 });
    result.restoredOnReload = await page.evaluate(() => (document.getElementById('thread').messages ?? []).length > 0);
  }

  result.totalReq = requests.length;
  result.totalBytes = requests.reduce((a, b) => a + b, 0);
  await ctx.close();
  return result;
}

out.push(await story('/fine.html', 'fine', 'light'));
out.push(await story('/fine.html', 'fine', 'dark'));
out.push(await story('/fine-accent.html', 'fine-accent', 'light', { full: false }));

await browser.close();
console.log(JSON.stringify(out, null, 2));
