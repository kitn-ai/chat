import { test, type Page } from '@playwright/test';

/**
 * Screenshot artifact (NOT an assertion) for the per-kind pill decoration:
 * skills/agents render as LIGHT sigil-led text, plugins as a richer chip.
 * Captures the "Pill kinds" composer story in light + dark for visual review
 * against the Claude Code web reference.
 *
 * Run: `npm run test:shot`
 * Output: tests/e2e/__screenshots__/pill-skins/{light,dark}.png
 */

const STORY = '/iframe.html?id=test-fixtures-composer--pill-kinds&viewMode=story';

async function shoot(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(STORY);
  const editable = page.locator('[data-kai-composer-editable]');
  await editable.waitFor({ state: 'visible' });
  // Let the seeded doc render its pills.
  await page.locator('[data-kai-entity]').first().waitFor({ state: 'visible' });
  // Force the kai theme + a matching page backdrop so the dark capture is faithful
  // (emulateMedia alone doesn't flip an element whose auto-theme is read at mount).
  await page.evaluate((s) => {
    document.querySelector('kai-composer')?.setAttribute('theme', s);
    document.body.style.background = s === 'dark' ? '#1a1a1a' : '#ffffff';
    document.body.style.padding = '8px';
  }, scheme);
  const host = page.locator('kai-composer');
  await host.screenshot({ path: `tests/e2e/__screenshots__/pill-skins/${scheme}.png` });
}

test('pill skins — light', async ({ page }) => {
  await shoot(page, 'light');
});

test('pill skins — dark', async ({ page }) => {
  await shoot(page, 'dark');
});

test('pill selected (arrow-nav highlight) — dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(STORY);
  await page.locator('[data-kai-composer-editable]').waitFor({ state: 'visible' });
  await page.locator('[data-kai-entity]').first().waitFor({ state: 'visible' });
  await page.evaluate(() => {
    document.querySelector('kai-composer')?.setAttribute('theme', 'dark');
    document.body.style.background = '#1a1a1a';
    document.body.style.padding = '8px';
  });
  // Show the selected-pill highlight WITHOUT focusing — headless Chromium dims a
  // focused contenteditable in the capture. (The arrow-key behavior that sets
  // this state is proven by the composer IVP, not here.)
  await page.evaluate(() => {
    document.querySelector('kai-composer')?.setAttribute('theme', 'dark');
    document.body.style.background = '#1a1a1a';
    document.body.style.padding = '8px';
    const sr = document.querySelector('kai-composer')?.shadowRoot;
    sr?.querySelector('[data-kai-entity][data-kind="skill"]')?.setAttribute('data-selected', '');
  });
  await page.locator('kai-composer').screenshot({ path: 'tests/e2e/__screenshots__/pill-skins/selected-dark.png' });
});
