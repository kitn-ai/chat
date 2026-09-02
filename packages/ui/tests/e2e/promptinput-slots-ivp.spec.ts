import { test, expect, type Page } from '@playwright/test';

/**
 * IVP (Independent Visual Proof) for the SPIKE slotted-shell composition model
 * on <kai-prompt-input>. Drives the real web component rendered by Storybook
 * and proves, in a real browser, that consumer light-DOM is actually assigned
 * to the Solid-rendered shadow slots — something jsdom unit tests cannot verify.
 *
 * Run: `npm run test:slots-ivp`
 * (Storybook must be serving on :6006.)
 */

const STORY = (id: string) => `/iframe.html?id=labs-prompt-input-slots--${id}&viewMode=story`;

/** Count light-DOM elements actually assigned to each named shadow slot. */
async function assignedCounts(page: Page, names: string[]) {
  return page.evaluate((slotNames) => {
    const host = document.querySelector('kai-prompt-input');
    const root = host?.shadowRoot;
    const out: Record<string, number> = {};
    for (const n of slotNames) {
      const slot = root?.querySelector(`slot[name="${n}"]`) as HTMLSlotElement | null;
      out[n] = slot ? slot.assignedElements().length : -1;
    }
    return out;
  }, names);
}

test.describe('kai-prompt-input composition slots IVP', () => {
  const SLOT_NAMES = ['input-top', 'toolbar-start', 'toolbar-end'];

  test('Slots: input-top + toolbar-start + toolbar-end project into shadow slots', async ({ page }) => {
    await page.goto(STORY('slots'));
    await expect(page.locator('kai-prompt-input')).toBeVisible();
    await page.waitForTimeout(700); // solid mount + slot assignment

    const counts = await assignedCounts(page, SLOT_NAMES);
    expect(counts['input-top'], 'input-top projected').toBeGreaterThan(0);
    expect(counts['toolbar-start'], 'toolbar-start projected').toBeGreaterThan(0);
    expect(counts['toolbar-end'], 'toolbar-end projected').toBeGreaterThan(0);

    await page.screenshot({ path: 'spike-screens/slots-promptinput.png' });
  });

  test('DropIn: no slots projected → every shadow slot has zero assigned elements', async ({ page }) => {
    await page.goto(STORY('drop-in'));
    await expect(page.locator('kai-prompt-input')).toBeVisible();
    await page.waitForTimeout(700);

    const counts = await assignedCounts(page, SLOT_NAMES);
    for (const name of SLOT_NAMES) {
      expect(counts[name], `${name} has no projection`).toBe(0);
    }

    await page.screenshot({ path: 'spike-screens/slots-promptinput-dropin.png' });
  });
});
