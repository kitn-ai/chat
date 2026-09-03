// support-widget's state script for the block driver (V-1): the facade
// scenario's nine-state story, adapted so the SAME states drive both the
// generated block page and the kai-chat facade page — the overlap IS the
// parity claim (the block is the facade's widget rebuilt on the public
// parts). Page-specific facts (store index key, how a closed-dock reply is
// landed, where the thread's messages live, what the store titles a
// conversation) ride each page's spec; probes return page-neutral values so
// parity mode can diff them strictly.
//
// Runs (from packages/ui, after a real build):
//   record:  node scripts/block-driver/driver.mjs blocks/support-widget/states.mjs \
//              --serve scripts/block-driver/pages --pages block \
//              --record scripts/block-driver/baselines/support-widget.json --shots <dir>
//   parity:  same, with --pages block,facade
//
// The facade page's store titles a conversation from the FIRST USER message
// ("Where's my order?"); the kit's localStorageStore titles from the LAST
// message text at first save. Both are real titles for the same
// conversation, so the parity-safe probe is "the first row's title is the
// one this page's store derives" — a boolean, equal across pages. (The
// store's title policy is a recorded spike observation, not this block's.)

const settle = (ms) => (page) => page.waitForTimeout(ms);
const clickButton = (name) => async (page) => { await page.getByRole('button', { name }).click(); };
const style = (name, target, props) => ({ name, target, props });

const firstIndexRow = (page, spec) => page.evaluate(
  (key) => { try { return JSON.parse(localStorage.getItem(key) ?? '[]')[0] ?? null; } catch { return null; } },
  spec.indexKey,
);

export default {
  name: 'support-widget',
  viewport: { width: 1100, height: 760 },
  schemes: ['light', 'dark'],
  ready: (page) => page
    .waitForFunction(() => window.__blockReady === true, null, { timeout: 15000 })
    .then(() => page.waitForTimeout(400)),

  pages: {
    // The GENERATED /kit/ rendering of the CDN form (gen-blocks.mjs output) —
    // the driver runs the real generated artifact, never a copy.
    block: {
      // pages/generated/ is where gen-blocks.mjs writes it (gitignored; a
      // build artifact per the 2026-08-31 owner ruling) — build first.
      path: '/generated/support-widget/index.html',
      indexKey: 'kai:support-widget:threads',
      rowScope: 'kai-conversations',
      messagesElementId: 'thread',
      // localStorageStore titles from the latest message text at first save:
      // the assistant's first reply (a recorded spike observation about the
      // store, not this block).
      expectedFirstTitle: 'Let me pull up that order.',
      // The controller's mount-time restore hydrates the thread on reload.
      expectRestore: true,
      // Programmatic exception (no user path exists by construction): landing
      // a reply while the dock is CLOSED. The block's send seam is the
      // kai-submit listener on the composer element.
      closedSend: () => {
        document.getElementById('prompt').dispatchEvent(
          new CustomEvent('kai-submit', { detail: { value: 'Request a refund', attachments: [] } }),
        );
      },
    },
    // The kai-chat facade page (Task 2.1's harness, unchanged) — the parity
    // reference where states overlap.
    facade: {
      path: '/kai-chat-facade/index.html',
      indexKey: 'support-widget-cdn:index',
      rowScope: 'kai-chat',
      messagesElementId: 'chat',
      // The facade harness's hand-rolled store titles from the first user
      // message instead.
      expectedFirstTitle: "Where's my order?",
      // The facade page does NOT rehydrate after this story's reload - the
      // recorded pre-refactor fact (baselines/kai-chat-facade.json leaves the
      // probe unpinned and recorded false). The block's controller-driven
      // restore is a deliberate behavioral improvement, so the probe compares
      // each page against ITS OWN recorded policy.
      expectRestore: false,
      closedSend: () => {
        document.getElementById('chat').dispatchEvent(
          new CustomEvent('kai-submit', { detail: { value: 'Request a refund', attachments: [] } }),
        );
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
        // MEASURED home-layout probes (owner-caught defect 2026-09-01: the
        // recorded baseline itself showed the CTA overlapping the subtitle's
        // descenders — the flex gap authored on the kai-view host counted the
        // shadow <style> as an item and the .home children got no gaps at
        // all). Relationships, not absolute y: parity-comparable against the
        // facade, and an overlap can never re-record itself into a baseline.
        homeCtaClearOfSubtitle: async (page) => {
          const sub = await page.getByText('Orders, refunds, anything.').first().boundingBox();
          const cta = await page.getByRole('button', { name: 'Send us a message' }).first().boundingBox();
          return !!sub && !!cta && cta.y >= sub.y + sub.height;
        },
        // The facade's measured column rhythm: 4px title->subtitle,
        // 16px subtitle->CTA, a 20px subtitle line box.
        homeSubtitleToCtaGap: async (page) => {
          const sub = await page.getByText('Orders, refunds, anything.').first().boundingBox();
          const cta = await page.getByRole('button', { name: 'Send us a message' }).first().boundingBox();
          return Math.round(cta.y - (sub.y + sub.height));
        },
        homeTitleToSubtitleGap: async (page) => {
          const title = await page.getByText('How can we help?', { exact: false }).first().boundingBox();
          const sub = await page.getByText('Orders, refunds, anything.').first().boundingBox();
          return Math.round(sub.y - (title.y + title.height));
        },
        homeSubtitleLineBox: async (page) => {
          const sub = await page.getByText('Orders, refunds, anything.').first().boundingBox();
          return Math.round(sub.height);
        },
      },
      expect: {
        greeting: true, helpLink: true,
        homeCtaClearOfSubtitle: true,
        homeSubtitleToCtaGap: 16,
        homeTitleToSubtitleGap: 4,
        homeSubtitleLineBox: 20,
      },
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
        // The P-3 navigation rule: a drilled view shows a back arrow and
        // hides the tab bar.
        backArrow: (page) => page.getByRole('button', { name: 'Back' }).isVisible().catch(() => false),
        homeTab: (page) => page.getByRole('tab', { name: 'Home' }).isVisible().catch(() => false),
        suggestionsStillShowing: (page) => page.getByRole('button', { name: 'Request a refund' }).isVisible().catch(() => false),
      },
      expect: { pulledUp: true, tool: true, dhl: true, backArrow: true, homeTab: false, suggestionsStillShowing: false },
      styleProbes: [
        // lineHeight is deliberately NOT compared: a recorded fidelity gap,
        // not scenario noise - assistant text computes line-height 22.4px
        // inside kai-chat but 20px in a standalone kai-thread (same color and
        // font-size). Filed with the Task 3.1 report as a V-4 kit seam;
        // restore the property here when that seam closes.
        style('assistantReplyText', (page) => page.getByText('Let me pull up that order').first(),
          ['color', 'fontSize']),
      ],
    },
    {
      name: '5-conversations',
      act: async (page, { spec }) => {
        await clickButton('Back')(page);
        await settle(300)(page);
        await page.getByRole('tab', { name: /Messages/ }).click();
        await settle(400)(page);
        await page.waitForFunction((key) => localStorage.getItem(key) != null, spec.indexKey, { timeout: 10000 });
      },
      probes: {
        // Parity-safe: does the first index row carry the title this page's
        // store policy derives, and does the LIST render it?
        rowTitleAsPolicied: async (page, { spec }) => {
          const row = await firstIndexRow(page, spec);
          if (!row?.title) return false;
          const rendered = await page.locator(spec.rowScope).getByText(row.title.slice(0, 25), { exact: false }).count();
          return row.title === spec.expectedFirstTitle && rendered > 0;
        },
      },
      expect: { rowTitleAsPolicied: true },
    },
    {
      name: '6-closed-unread',
      act: async (page, { spec }) => {
        // Re-enter the conversation from its row, close the dock, then land a
        // reply while closed (the declared programmatic exception).
        const row = await firstIndexRow(page, spec);
        await page.locator(spec.rowScope).getByText(row.title.slice(0, 25), { exact: false }).first().click();
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
        // restore". Each page is compared against ITS OWN restore policy
        // (spec.expectRestore), so the probe value is parity-comparable.
        restoreAsPolicied: (page, { spec }) => page
          .waitForFunction(
            (id) => ((document.getElementById(id)?.messages ?? []).length > 0),
            spec.messagesElementId,
            { timeout: 5000 },
          )
          .then(() => true, () => false)
          .then((restored) => restored === spec.expectRestore),
      },
      expect: { restoreAsPolicied: true },
    },
  ],
};
