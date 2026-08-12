#!/usr/bin/env node
/**
 * Throwaway experiment (not wired into CI): `--js-flags=--max-old-space-size=2048`
 * became live for the first time when launchOptions was moved onto the provider.
 * The config comment above it claims two different things -- "give the renderer
 * more headroom" and "lower cap forces earlier GC" -- and those point opposite
 * ways. Whether 2048MB RAISES or LOWERS the renderer's heap ceiling decides
 * whether the flag mitigates the mid-suite chromium crash or causes it.
 *
 * `performance.memory.jsHeapSizeLimit` reads the ceiling straight out of V8.
 */
import { chromium } from 'playwright';

async function heapLimitMB(args) {
  const browser = await chromium.launch({ headless: true, args });
  const page = await browser.newPage();
  const bytes = await page.evaluate(() => performance.memory?.jsHeapSizeLimit ?? null);
  await browser.close();
  return bytes == null ? null : Math.round(bytes / 1024 / 1024);
}

const plain = await heapLimitMB([]);
const capped = await heapLimitMB(['--js-flags=--max-old-space-size=2048']);

console.log(`renderer jsHeapSizeLimit, no --js-flags      : ${plain ?? 'unavailable'} MB`);
console.log(`renderer jsHeapSizeLimit, --max-old-space=2048: ${capped ?? 'unavailable'} MB`);

if (plain == null || capped == null) {
  console.log('\n=> INCONCLUSIVE: performance.memory is unavailable here.');
} else if (capped > plain) {
  console.log(`\n=> The flag RAISES the ceiling (${plain} -> ${capped} MB). It buys headroom, as the comment's first claim says.`);
} else if (capped < plain) {
  console.log(`\n=> The flag LOWERS the ceiling (${plain} -> ${capped} MB). It makes the renderer OOM SOONER, not later.`);
} else {
  console.log('\n=> No effect on the renderer ceiling; --js-flags is not reaching the renderer process.');
}
