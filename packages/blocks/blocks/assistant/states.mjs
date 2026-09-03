// assistant's state script for the block driver (V-1): the full-page
// assistant walked through its named states - empty, a reply with reasoning
// plus a settled tool call, a cited follow-up, the model switcher recipe, the
// rail, a fresh chat, and the controller's restore-on-reload. One page (the
// generated /kit/ rendering of the CDN form), so record/check are the modes;
// there is no facade parity reference for this composition.
//
// Runs (from packages/ui, after a real build + gen-blocks):
//   record:  node scripts/block-driver/driver.mjs blocks/assistant/states.mjs \
//              --serve scripts/block-driver/pages --pages block \
//              --record scripts/block-driver/baselines/assistant.json --shots <dir>

const settle = (ms) => (page) => page.waitForTimeout(ms);
const style = (name, target, props) => ({ name, target, props });

const firstIndexRow = (page, spec) => page.evaluate(
  (key) => { try { return JSON.parse(localStorage.getItem(key) ?? '[]')[0] ?? null; } catch { return null; } },
  spec.indexKey,
);

export default {
  name: 'assistant',
  viewport: { width: 1280, height: 800 },
  schemes: ['light', 'dark'],
  ready: (page) => page
    .waitForFunction(() => window.__blockReady === true, null, { timeout: 15000 })
    .then(() => page.waitForTimeout(400)),

  pages: {
    // The GENERATED /kit/ rendering of the CDN form (gen-blocks.mjs output) -
    // the driver runs the real generated artifact, never a copy.
    block: {
      path: '/generated/assistant/index.html',
      indexKey: 'kai:assistant:threads',
      // localStorageStore titles from the latest message text at first save:
      // the assistant's first reply (a recorded spike observation about the
      // store, not this block).
      expectedFirstTitle: 'Reading q3-metrics.pdf now.',
    },
    // The REACT form, mounted at the root of a throwaway Vite app by
    // scripts/verify-blocks-react.mjs. Same story, same probes, same
    // page-specific facts: only the URL differs, because the react tree is a
    // component in an app rather than a page in a directory. The element ids
    // survive the translation (a literal id is a literal attribute), which is
    // what lets one set of probes drive both.
    react: {
      path: '/',
      indexKey: 'kai:assistant:threads',
      expectedFirstTitle: 'Reading q3-metrics.pdf now.',
      // Computed style is a measurement of the document it was taken in, and
      // the react host is a Vite index.html with a mounted subtree rather
      // than this block's own page. This page asserts state, navigation and
      // console-cleanliness; the style probes stay where they were measured.
      skipLayout: true,
    },
  },

  states: [
    {
      name: '1-empty',
      probes: {
        emptyTitle: (page) => page.getByText('What can I help with?').count().then((n) => n > 0),
        suggestion: (page) => page.getByRole('button', { name: 'Summarize a document' }).isVisible().catch(() => false),
        railNewChat: (page) => page.getByRole('button', { name: 'New chat' }).isVisible().catch(() => false),
        // The switcher renders only with more than one model - its presence IS
        // the recipe working.
        modelTrigger: (page) => page.getByText('Mock Standard').count().then((n) => n > 0),
      },
      expect: { emptyTitle: true, suggestion: true, railNewChat: true, modelTrigger: true },
      styleProbes: [
        style('topbarTitle', (page) => page.getByRole('heading', { name: 'Assistant' }),
          ['fontSize', 'fontWeight', 'color']),
      ],
    },
    {
      name: '2-reply-tool',
      act: async (page) => {
        await page.getByRole('button', { name: 'Summarize a document' }).click();
        await settle(3500)(page);
      },
      probes: {
        reading: (page) => page.getByText('Reading q3-metrics.pdf').count().then((n) => n > 0),
        tool: (page) => page.getByText(/read[_-]?document/i).count().then((n) => n > 0),
        suggestionsGone: (page) => page.getByRole('button', { name: 'Draft the Q3 board update' }).isVisible().catch(() => false),
      },
      expect: { reading: true, tool: true, suggestionsGone: false },
      styleProbes: [
        style('assistantReplyText', (page) => page.getByText('Reading q3-metrics.pdf').first(),
          ['color', 'fontSize']),
      ],
    },
    {
      name: '3-cited-followup',
      act: async (page) => {
        // Scoped to the composer: the rail's search box is a textbox too.
        const box = page.locator('kai-prompt-input').getByRole('textbox').first();
        await box.click();
        await box.fill('Summarize the key numbers');
        await box.press('Enter');
        await settle(3500)(page);
      },
      probes: {
        summary: (page) => page.getByText('revenue up 12%', { exact: false }).count().then((n) => n > 0),
        // Citations render as domain chips in the thread's sources strip (the
        // title lives on the chip's hover card), so the probe looks for the
        // domain text.
        citation: (page) => page.locator('kai-thread').getByText('ui.kitn.ai').count().then((n) => n > 0),
        composerCleared: (page) => page.locator('kai-prompt-input').getByRole('textbox').first()
          .innerText().then((t) => t.trim() === ''),
      },
      expect: { summary: true, citation: true, composerCleared: true },
    },
    {
      name: '4-model-switch',
      act: async (page) => {
        await page.getByText('Mock Standard').first().click();
        await settle(300)(page);
        await page.getByText('Mock Thinking').first().click();
        await settle(300)(page);
      },
      probes: {
        selected: (page) => page.evaluate(() => document.getElementById('models').currentModel === 'kai-mock-thinking'),
      },
      expect: { selected: true },
    },
    {
      name: '5-rail-row',
      act: async (page, { spec }) => {
        await page.waitForFunction((key) => localStorage.getItem(key) != null, spec.indexKey, { timeout: 10000 });
      },
      probes: {
        // Does the first index row carry the title the store's policy derives,
        // and does the rail render it?
        rowTitleAsPolicied: async (page, { spec }) => {
          const row = await firstIndexRow(page, spec);
          if (!row?.title) return false;
          const rendered = await page.locator('kai-conversations').getByText(row.title.slice(0, 25), { exact: false }).count();
          return row.title === spec.expectedFirstTitle && rendered > 0;
        },
      },
      expect: { rowTitleAsPolicied: true },
    },
    {
      name: '6-new-chat',
      act: async (page) => {
        await page.getByRole('button', { name: 'New chat' }).click();
        await settle(400)(page);
      },
      probes: {
        emptyAgain: (page) => page.getByText('What can I help with?').count().then((n) => n > 0),
        threadEmpty: (page) => page.evaluate(() => (document.getElementById('thread').messages ?? []).length === 0),
      },
      expect: { emptyAgain: true, threadEmpty: true },
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
