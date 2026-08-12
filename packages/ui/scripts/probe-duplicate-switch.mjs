#!/usr/bin/env node
/**
 * Throwaway experiment (not wired into CI): when chromium is handed the SAME
 * switch twice, which one wins?
 *
 * This matters because playwright appends user `args` verbatim AFTER its own
 * defaults, and its defaults already include a `--disable-features=<16 names>`.
 * Adding our own `--disable-features=` therefore puts two of them on the command
 * line. If the last one wins, ours does not ADD to playwright's list -- it
 * REPLACES it, silently re-enabling everything playwright disables for test
 * determinism.
 *
 * `--user-agent` is used as the oracle rather than a feature name because its
 * effect is trivially readable from the page, and chromium parses every switch
 * through the same `base::CommandLine` map.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--user-agent=FIRST-WINS', '--user-agent=LAST-WINS'],
});
const page = await browser.newPage();
const ua = await page.evaluate(() => navigator.userAgent);
await browser.close();

console.log(`passed:  --user-agent=FIRST-WINS  then  --user-agent=LAST-WINS`);
console.log(`browser reported navigator.userAgent = ${ua}`);
console.log(
  ua.includes('LAST-WINS')
    ? '=> LAST duplicate switch wins. Our --disable-features REPLACES playwright\'s.'
    : ua.includes('FIRST-WINS')
      ? '=> FIRST duplicate switch wins. Playwright\'s --disable-features survives; ours is ignored.'
      : `=> INCONCLUSIVE, neither marker present.`,
);
