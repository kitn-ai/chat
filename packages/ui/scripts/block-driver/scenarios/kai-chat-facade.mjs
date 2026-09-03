// Baseline scenario for the CURRENT `kai-chat` facade (Task 2.1, V-1 seed).
// The eight-state story is the composition spike's fine-drive.mjs story,
// restated as data; the harness page is the spike's facade widget page
// (pages/kai-chat-facade/). Task 2.2's refactor must reproduce this scenario
// value-for-value against baselines/kai-chat-facade.json.
//
// `expect` maps pin only the facts the spike's report treats as the facade
// contract (navigation rules, unread machinery, empty state, restore); every
// other probe and every computed-style probe is recorded, and drift is caught
// by the --baseline diff, not by a hand-typed number here.

const INDEX_KEY = 'support-widget-cdn:index'; // app.js's handRolledLocalStore name

const settle = (ms) => (page) => page.waitForTimeout(ms);
const clickButton = (name) => async (page) => { await page.getByRole('button', { name }).click(); };

const style = (name, target, props) => ({ name, target, props });

export default {
  name: 'kai-chat-facade',
  viewport: { width: 1100, height: 760 },
  schemes: ['light', 'dark'],
  ready: (page) => page
    .waitForFunction(() => window.__blockReady === true, null, { timeout: 15000 })
    .then(() => page.waitForTimeout(400)),

  pages: {
    facade: {
      path: '/index.html',
      // Programmatic exception (no user path exists by construction): landing
      // a reply while the dock is CLOSED. The facade has no public send, so
      // the harness dispatches the same kai-submit CustomEvent app.js
      // listens for — the spike driver's documented exception, kept verbatim.
      closedSend: () => {
        const chat = document.getElementById('chat');
        chat.dispatchEvent(new CustomEvent('kai-submit', { detail: { value: 'Request a refund', attachments: [] } }));
      },
    },
  },

  states: [
    {
      name: '1-closed',
      styleProbes: [
        style('launcher', (page) => page.getByRole('button', { name: 'Open Support' }),
          ['width', 'height', 'borderRadius', 'backgroundColor']),
      ],
    },
    {
      name: '2-home',
      act: async (page) => { await clickButton('Open Support')(page); await settle(600)(page); },
      probes: {
        greeting: (page) => page.getByText('How can we help?', { exact: false }).count().then((n) => n > 0),
        helpLink: (page) => page.getByText('Help center', { exact: false }).count().then((n) => n > 0),
      },
      expect: { greeting: true, helpLink: true },
      styleProbes: [
        style('homeCta', (page) => page.getByRole('button', { name: 'Send us a message' }),
          ['backgroundColor', 'borderRadius', 'fontSize']),
        style('greetingTitle', (page) => page.getByText('How can we help?', { exact: false }).first(),
          ['fontSize', 'fontWeight', 'color']),
      ],
    },
    {
      name: '3-thread-empty',
      act: async (page) => { await clickButton('Send us a message')(page); await settle(400)(page); },
      probes: {
        emptyTitle: (page) => page.getByText("Hi, we're here to help").count().then((n) => n > 0),
      },
      expect: { emptyTitle: true },
    },
    {
      name: '4-reply',
      act: async (page) => {
        await page.getByText("Where's my order?", { exact: false }).last().click();
        await settle(3500)(page);
      },
      probes: {
        pulledUp: (page) => page.getByText('Let me pull up that order').count().then((n) => n > 0),
        tool: (page) => page.getByText(/lookup[_-]?order/i).count().then((n) => n > 0),
        dhl: (page) => page.getByText('DHL', { exact: false }).count().then((n) => n > 0),
        // The P-3 navigation rule, as probed by the spike: a drilled view
        // shows a back arrow and hides the tab bar.
        backArrow: (page) => page.getByRole('button', { name: 'Back' }).count().then((n) => n > 0),
        homeTab: (page) => page.getByRole('tab', { name: 'Home' }).isVisible().catch(() => false),
        suggestionsStillShowing: (page) => page.getByRole('button', { name: 'Request a refund' }).isVisible().catch(() => false),
      },
      expect: { pulledUp: true, tool: true, dhl: true, backArrow: true, homeTab: false },
      styleProbes: [
        style('assistantReplyText', (page) => page.getByText('Let me pull up that order').first(),
          ['color', 'fontSize', 'lineHeight']),
      ],
    },
    {
      name: '5-conversations',
      act: async (page, { spec }) => {
        await clickButton('Back')(page);
        await settle(300)(page);
        await page.getByRole('tab', { name: /Messages/ }).click();
        await settle(400)(page);
        await page.waitForFunction((key) => localStorage.getItem(key) != null, spec.indexKey ?? INDEX_KEY, { timeout: 10000 });
      },
      probes: {
        listRowTitle: (page, { spec }) => page.evaluate(
          (key) => { try { return JSON.parse(localStorage.getItem(key) ?? '[]')[0]?.title ?? null; } catch { return null; } },
          spec.indexKey ?? INDEX_KEY,
        ),
      },
      expect: { listRowTitle: "Where's my order?" },
    },
    {
      name: '6-closed-unread',
      act: async (page, { spec }) => {
        // Re-enter the conversation from its row, close the dock, then land a
        // reply while closed (the declared programmatic exception).
        const title = await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? '[]')[0]?.title ?? '',
          spec.indexKey ?? INDEX_KEY,
        );
        await page.locator('kai-chat').getByText(title.slice(0, 25), { exact: false }).first().click();
        await settle(400)(page);
        // The header X by id: the OPEN launcher shares the "Close Support"
        // accessible name, so a role query would be ambiguous.
        await page.locator('#close').click();
        await settle(300)(page);
        await page.evaluate(spec.closedSend);
        await settle(4500)(page);
      },
      probes: {
        unreadAfterClosedReply: (page) => page.evaluate(() => document.getElementById('dock').unread === true),
      },
      expect: { unreadAfterClosedReply: true },
    },
    {
      name: '7-reopened',
      act: async (page) => { await clickButton('Open Support')(page); await settle(600)(page); },
      probes: {
        unreadAfterReopen: (page) => page.evaluate(() => document.getElementById('dock').unread === true),
      },
      expect: { unreadAfterReopen: false },
    },
    {
      name: '8-new-conversation-empty',
      act: async (page) => {
        await clickButton('Back')(page);
        await settle(300)(page);
        await page.getByRole('button', { name: /new conversation/i }).click();
        await settle(400)(page);
      },
      probes: {
        emptyAfterNewChat: (page) => page.getByText("Hi, we're here to help").count().then((n) => n > 0),
      },
      expect: { emptyAfterNewChat: true },
    },
    {
      name: '9-reloaded',
      act: async (page, sctx) => {
        await page.reload({ waitUntil: 'load' });
        await sctx.scenario.ready(page, sctx);
      },
      probes: {
        // Bounded wait so a slow async restore cannot masquerade as "no
        // restore"; the settled boolean is the recorded fact either way.
        restoredOnReload: (page) => page
          .waitForFunction(() => ((document.getElementById('chat').messages ?? []).length > 0), null, { timeout: 5000 })
          .then(() => true, () => false),
      },
    },
  ],
};
