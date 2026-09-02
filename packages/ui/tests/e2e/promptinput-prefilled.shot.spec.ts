import { test, type Page } from '@playwright/test';

/** Screenshot artifact: a <kai-prompt-input> pre-populated via `value` as a
 *  ComposerDoc — seeded skill/agent/plugin pills inside the real input chrome.
 *  Run: `npm run test:shot` */
const STORY = '/iframe.html?id=test-fixtures-prompt-input--prefilled&viewMode=story';

async function shoot(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(STORY);
  await page.locator('[data-kai-entity]').first().waitFor({ state: 'visible' });
  await page.evaluate((s) => {
    document.querySelector('kai-prompt-input')?.setAttribute('theme', s);
    document.body.style.background = s === 'dark' ? '#1a1a1a' : '#ffffff';
    document.body.style.padding = '8px';
  }, scheme);
  await page.locator('kai-prompt-input').screenshot({ path: `tests/e2e/__screenshots__/pill-skins/prefilled-${scheme}.png` });
}

test('prefilled prompt-input — light', async ({ page }) => { await shoot(page, 'light'); });
test('prefilled prompt-input — dark', async ({ page }) => { await shoot(page, 'dark'); });
