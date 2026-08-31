// Drives BOTH widgets — the facade page (index.html) and the fine-grain page
// (fine.html) — through the same 8-state story, light and dark, capturing a
// screenshot per state so the two can be compared state-for-state. Fidelity is
// the acceptance bar (owner round 2), not feature checkboxes.
//
// Interaction is user-level: Playwright's shadow-piercing locators click what
// a person would click. The two programmatic exceptions, both needed to land
// a reply while the dock is CLOSED (no user path exists by construction):
// fine uses the PUBLIC prompt value + send(); the facade page has no public
// send, so the driver dispatches the same kai-submit CustomEvent its app.js
// listens for. The facade is the reference here, not the subject of the
// public-surface ethic.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8942';
const SHOTS = process.env.SHOTS ?? './shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const out = [];

const PAGES = {
  facade: {
    path: '/index.html',
    indexKey: 'support-widget-cdn:index', // app.js's hand-rolled store format
    newChat: /new conversation/i,
    closedSend: () => {
      const chat = document.getElementById('chat');
      chat.dispatchEvent(new CustomEvent('kai-submit', { detail: { value: 'Request a refund', attachments: [] } }));
    },
  },
  fine: {
    path: '/fine.html',
    indexKey: 'kai:support-widget-fine:threads', // localStorageStore's format
    newChat: /new conversation/i, // same affordance as the facade now (light-DOM pill)
    closedSend: () => {
      const prompt = document.getElementById('prompt');
      prompt.value = 'Request a refund';
      prompt.send();
      // Setting `value` makes the composer CONTROLLED (the host owns the
      // text), so the driver clears its own value after sending — a real
      // user's Enter goes through the uncontrolled path and clears itself.
      prompt.value = '';
    },
  },
};
PAGES['fine-accent'] = { ...PAGES.fine, path: '/fine-accent.html' };

async function story(kind, name, colorScheme, { full = true } = {}) {
  const spec = PAGES[kind];
  const ctx = await browser.newContext({ colorScheme, viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  await page.goto(`${BASE}${spec.path}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__widgetReady === true, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const result = { name, colorScheme, errors };
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${name}-${colorScheme}-${n}.png` });

  // 1 closed
  await shot('1-closed');

  // 2 home
  await page.getByRole('button', { name: 'Open Support' }).click();
  await page.waitForTimeout(600);
  await shot('2-home');

  // 3 empty thread via the CTA
  await page.getByRole('button', { name: 'Send us a message' }).click();
  await page.waitForTimeout(400);
  await shot('3-thread-empty');

  // 4 streamed reply via the suggestion chip
  await page.getByText("Where's my order?", { exact: false }).last().click();
  await page.waitForTimeout(3500);
  await shot('4-reply');
  result.thread = {
    pulledUp: await page.getByText('Let me pull up that order').count() > 0,
    tool: await page.getByText(/lookup[_-]?order/i).count() > 0,
    dhl: await page.getByText('DHL', { exact: false }).count() > 0,
  };
  // Facade parity probes on the fine page's drilled-chat state (and the
  // facade's own, as the reference): no tab bar, back arrow present.
  result.inThread = {
    backArrow: await page.getByRole('button', { name: 'Back' }).count() > 0,
    homeTab: await page.getByRole('tab', { name: 'Home' }).isVisible().catch(() => false),
    suggestionsStillShowing: await page.getByRole('button', { name: 'Request a refund' }).isVisible().catch(() => false),
  };

  if (full) {
    // 5 conversations list: back arrow -> home, then the Messages tab.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: /Messages/ }).click();
    await page.waitForTimeout(400);
    await shot('5-conversations');
    await page.waitForFunction(
      (key) => localStorage.getItem(key) != null,
      spec.indexKey,
      { timeout: 10000 },
    );
    const rowTitle = await page.evaluate(
      (key) => { try { return JSON.parse(localStorage.getItem(key) ?? '[]')[0]?.title ?? null; } catch { return null; } },
      spec.indexKey,
    );
    result.listRowTitle = rowTitle;

    // Re-enter the conversation from its row, then close the dock.
    await page.locator(kind === 'fine' ? 'kai-conversations' : 'kai-chat').getByText(rowTitle.slice(0, 25), { exact: false }).first().click();
    await page.waitForTimeout(400);
    // The header X (light-DOM id on both pages; the OPEN launcher shares the
    // "Close Support" accessible name, so a role query would be ambiguous).
    await page.locator('#close').click();
    await page.waitForTimeout(300);

    // 6 a reply lands while closed -> unread badge on the launcher.
    await page.evaluate(spec.closedSend);
    await page.waitForTimeout(4500);
    result.unreadAfterClosedReply = await page.evaluate(() => document.getElementById('dock').unread === true);
    await shot('6-closed-unread');

    // 7 reopen -> the badge clears.
    await page.getByRole('button', { name: 'Open Support' }).click();
    await page.waitForTimeout(600);
    result.unreadAfterReopen = await page.evaluate(() => document.getElementById('dock').unread === true);
    await shot('7-reopened');

    // 8 new conversation from the list -> empty state.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForTimeout(300);
    // fine: back returns to the list (entered from a row); facade: same rule.
    await page.getByRole('button', { name: spec.newChat }).click();
    await page.waitForTimeout(400);
    result.emptyAfterNewChat = await page.getByText("Hi, we're here to help").count() > 0;
    await shot('8-new-conversation-empty');

    // Reload: auto-restore of the most recent conversation.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__widgetReady === true, null, { timeout: 15000 });
    result.restoredOnReload = await page.evaluate((k) => {
      const el = document.getElementById(k === 'fine' ? 'thread' : 'chat');
      return (el.messages ?? []).length > 0;
    }, kind);
  }

  await ctx.close();
  return result;
}

for (const [kind, name, scheme, opts] of [
  ['facade', 'facade', 'light', {}],
  ['fine', 'fine', 'light', {}],
  ['facade', 'facade', 'dark', {}],
  ['fine', 'fine', 'dark', {}],
  ['fine-accent', 'fine-accent', 'light', { full: false }],
]) {
  try {
    out.push(await story(kind, name, scheme, opts));
  } catch (err) {
    out.push({ name, colorScheme: scheme, FAILED: String(err).slice(0, 300) });
  }
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
