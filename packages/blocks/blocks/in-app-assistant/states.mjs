// in-app-assistant's state script for the block driver (V-1): the docked
// aside walked through its named states - empty, a reply with reasoning plus
// a settled search_docs call, a source-free follow-up (the template's
// capability set declares no sources strip, so none may render), the history
// drill and back, a fresh conversation, and the controller's
// restore-on-reload. One page (the generated /kit/ rendering of the CDN
// form), so record/check are the modes.
//
// Runs (from packages/ui, after a real build + gen-blocks):
//   record:  node scripts/block-driver/driver.mjs blocks/in-app-assistant/states.mjs \
//              --serve scripts/block-driver/pages --pages block \
//              --record scripts/block-driver/baselines/in-app-assistant.json --shots <dir>

const settle = (ms) => (page) => page.waitForTimeout(ms);
const style = (name, target, props) => ({ name, target, props });

const firstIndexRow = (page, spec) => page.evaluate(
  (key) => { try { return JSON.parse(localStorage.getItem(key) ?? '[]')[0] ?? null; } catch { return null; } },
  spec.indexKey,
);

export default {
  name: 'in-app-assistant',
  viewport: { width: 1100, height: 720 },
  schemes: ['light', 'dark'],
  ready: (page) => page
    .waitForFunction(() => window.__blockReady === true, null, { timeout: 15000 })
    .then(() => page.waitForTimeout(400)),

  pages: {
    // The GENERATED /kit/ rendering of the CDN form (gen-blocks.mjs output) -
    // the driver runs the real generated artifact, never a copy.
    block: {
      path: '/generated/in-app-assistant/index.html',
      indexKey: 'kai:in-app-assistant:threads',
      // localStorageStore titles from the latest message text at first save:
      // the assistant's first reply (a recorded spike observation about the
      // store, not this block).
      expectedFirstTitle: 'Checking the docs for that.',
    },
  },

  states: [
    {
      name: '1-empty',
      probes: {
        hostHeading: (page) => page.getByRole('heading', { name: 'Acme Deploys' }).isVisible().catch(() => false),
        emptyTitle: (page) => page.getByText('What can I help with?').count().then((n) => n > 0),
        starter: (page) => page.getByRole('button', { name: 'Check the canary status' }).isVisible().catch(() => false),
        historyButton: (page) => page.getByRole('button', { name: 'Conversation history' }).isVisible().catch(() => false),
      },
      expect: { hostHeading: true, emptyTitle: true, starter: true, historyButton: true },
      styleProbes: [
        style('panelHeader', (page) => page.getByText('Assistant', { exact: true }).first(),
          ['fontSize', 'fontWeight', 'color']),
      ],
    },
    {
      name: '2-reply-tool',
      act: async (page) => {
        await page.getByRole('button', { name: 'Check the canary status' }).click();
        await settle(3500)(page);
      },
      probes: {
        checking: (page) => page.getByText('Checking the docs for that').count().then((n) => n > 0),
        tool: (page) => page.getByText(/search[_-]?docs/i).count().then((n) => n > 0),
        suggestionsGone: (page) => page.getByRole('button', { name: 'Deploy payments to production' }).isVisible().catch(() => false),
      },
      expect: { checking: true, tool: true, suggestionsGone: false },
      styleProbes: [
        style('assistantReplyText', (page) => page.getByText('Checking the docs for that').first(),
          ['color', 'fontSize']),
      ],
    },
    {
      name: '3-followup-no-sources',
      act: async (page) => {
        const box = page.locator('kai-prompt-input').getByRole('textbox').first();
        await box.click();
        await box.fill('What does the deploy checklist say?');
        await box.press('Enter');
        await settle(3500)(page);
      },
      probes: {
        greenCanary: (page) => page.getByText('green canary', { exact: false }).count().then((n) => n > 0),
        // The template's capability set declares no sources, so no citation
        // link may render anywhere in the thread.
        noSourceLinks: (page) => page.locator('kai-thread').locator('a[href*="ui.kitn.ai"]').count().then((n) => n === 0),
      },
      expect: { greenCanary: true, noSourceLinks: true },
    },
    {
      name: '4-history-drill',
      act: async (page, { spec }) => {
        await page.waitForFunction((key) => localStorage.getItem(key) != null, spec.indexKey, { timeout: 10000 });
        await page.getByRole('button', { name: 'Conversation history' }).click();
        await settle(400)(page);
      },
      probes: {
        // The stack's navigation rule: a drilled view shows the back arrow.
        backArrow: (page) => page.getByRole('button', { name: 'Back' }).isVisible().catch(() => false),
        historyHidden: (page) => page.getByRole('button', { name: 'Conversation history' }).isVisible().catch(() => false),
        rowTitleAsPolicied: async (page, { spec }) => {
          const row = await firstIndexRow(page, spec);
          if (!row?.title) return false;
          const rendered = await page.locator('kai-conversations').getByText(row.title.slice(0, 25), { exact: false }).count();
          return row.title === spec.expectedFirstTitle && rendered > 0;
        },
      },
      expect: { backArrow: true, historyHidden: false, rowTitleAsPolicied: true },
    },
    {
      name: '5-row-back-to-chat',
      act: async (page, { spec }) => {
        const row = await firstIndexRow(page, spec);
        await page.locator('kai-conversations').getByText(row.title.slice(0, 25), { exact: false }).first().click();
        await settle(400)(page);
      },
      probes: {
        threadLoaded: (page) => page.evaluate(() => (document.getElementById('thread').messages ?? []).length > 0),
        backGone: (page) => page.getByRole('button', { name: 'Back' }).isVisible().catch(() => false),
      },
      expect: { threadLoaded: true, backGone: false },
    },
    {
      name: '6-new-conversation-empty',
      act: async (page) => {
        await page.getByRole('button', { name: 'Conversation history' }).click();
        await settle(300)(page);
        await page.getByRole('button', { name: /new conversation/i }).click();
        await settle(400)(page);
      },
      probes: {
        emptyAfterNew: (page) => page.getByText('What can I help with?').count().then((n) => n > 0),
      },
      expect: { emptyAfterNew: true },
    },
    {
      name: '7-reloaded',
      act: async (page, sctx) => {
        await page.reload({ waitUntil: 'load' });
        await sctx.scenario.ready(page, sctx);
      },
      probes: {
        // Bounded wait so a slow async restore cannot masquerade as "no
        // restore": the controller's mount-time restore hydrates the thread.
        restored: (page) => page
          .waitForFunction(() => ((document.getElementById('thread')?.messages ?? []).length > 0), null, { timeout: 5000 })
          .then(() => true, () => false),
      },
      expect: { restored: true },
    },
  ],
};
