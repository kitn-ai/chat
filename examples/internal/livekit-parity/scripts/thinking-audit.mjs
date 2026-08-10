// Thinking-state highlight check (campaign task #8). Needs `pnpm dev` running.
//
// Round-1 screenshot showed their bar with a bright sweeping thinking
// indicator while our bar row had no visibly highlighted bar. This samples
// BOTH bars' DOM ~40 times over ~2.5s in state=thinking:
//   - their side: [data-lk-index] elements, data-lk-highlighted attribute +
//     computed background-color,
//   - kai side: shadow DOM bar parts, data-kai-highlighted attribute +
//     computed background-color.
// Verdict material: does a highlighted index sweep on each side, and does
// the highlighted bar actually get a distinct background?
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'thinking-audit');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl);
await page.getByTestId('btn-state-thinking').click();
await page.waitForTimeout(600);

const samples = [];
for (let i = 0; i < 40; i++) {
  samples.push(
    await page.evaluate(() => {
      const read = (el) => ({
        bg: getComputedStyle(el).backgroundColor,
        h: getComputedStyle(el).height,
      });
      const their = [...document.querySelectorAll('[data-testid="tile-their-bar"] [data-lk-index]')].map(
        (el) => ({ hi: el.getAttribute('data-lk-highlighted') === 'true', ...read(el) }),
      );
      const kaiEl = document.querySelector('[data-testid="tile-kai-bar"] kai-audio-visualizer');
      const kaiBars = kaiEl?.shadowRoot
        ? [...kaiEl.shadowRoot.querySelectorAll('[data-kai-index]')].map((el) => ({
            hi:
              el.getAttribute('data-kai-highlighted') === 'true' ||
              (el.getAttribute('part') ?? '').includes('highlighted'),
            part: el.getAttribute('part'),
            ...read(el),
          }))
        : null;
      return { t: performance.now(), their, kai: kaiBars };
    }),
  );
  await page.waitForTimeout(60);
}

await page.screenshot({ path: path.join(OUT, 'thinking-live.png') });

const hiIndex = (row) => row.map((b, i) => (b.hi ? i : -1)).filter((i) => i >= 0).join('+') || '-';
const theirSeq = samples.map((s) => hiIndex(s.their));
const kaiSeq = samples.map((s) => (s.kai ? hiIndex(s.kai) : 'NO-SHADOW'));

const distinct = (seq) => [...new Set(seq)];
console.log('their highlighted-index sequence:', theirSeq.join(' '));
console.log('kai   highlighted-index sequence:', kaiSeq.join(' '));
console.log('their distinct:', distinct(theirSeq).join(','), '| kai distinct:', distinct(kaiSeq).join(','));

// Background comparison: highlighted vs not, one sample of each per side.
const findPair = (rows) => {
  for (const s of rows) {
    const hi = s?.find((b) => b.hi);
    const lo = s?.find((b) => !b.hi);
    if (hi && lo) return { hi: hi.bg, lo: lo.bg, hiPart: hi.part };
  }
  return null;
};
console.log('their bg (highlighted vs not):', JSON.stringify(findPair(samples.map((s) => s.their))));
console.log('kai   bg (highlighted vs not):', JSON.stringify(findPair(samples.map((s) => s.kai))));

fs.writeFileSync(path.join(OUT, 'thinking-audit.json'), JSON.stringify(samples, null, 1));
console.log(`raw samples + screenshot: ${OUT}`);
await browser.close();
