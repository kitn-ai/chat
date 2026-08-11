// Grid density exploration for Rob (5x5 vs 9x9 vs 15x15). Needs `pnpm dev`.
//
//   node scripts/grid-size-explore.mjs   # BASE_URL / SHOT_DIR env to override
//
// Each capture is one clip containing THEIR grid (top) and OURS (bottom) at
// the same instant, 2x scale. Scenarios per density:
//   (a) speaking, real voice fixture pinned mid-speech (frame 52, v=0.549)
//   (b) speaking, silence (all-zero bands): ours empty by design, theirs
//       middle row (intentional divergence)
//   (c) scripted listening + thinking
// Density drive: gridDrive() resamples the 3-band voice frame to
// ceil(count/2) half-bands and centre-out mirrors -- at 15 columns the
// resampler is doing real work; the per-column smear is MEASURED (distinct
// column heights), not eyeballed. Contact sheets compose the densities
// side by side per scenario.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'grid-size');
fs.mkdirSync(OUT, { recursive: true });

const DSF = 2;
const DENSITIES = [5, 9, 15];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: DSF });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl?.setGridCount);

const control = (fn, arg) => page.evaluate(([f, a]) => window.__parityControl[f](a), [fn, arg]);

const captureClip = async (name) => {
  const t = await page.getByTestId('tile-their-grid').boundingBox();
  const k = await page.getByTestId('tile-kai-grid').boundingBox();
  const clip = {
    x: Math.min(t.x, k.x) - 4,
    y: Math.min(t.y, k.y) - 4,
    width: Math.max(t.x + t.width, k.x + k.width) - Math.min(t.x, k.x) + 8,
    height: Math.max(t.y + t.height, k.y + k.height) - Math.min(t.y, k.y) + 8,
  };
  const buf = await page.screenshot({ clip });
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  return buf;
};

const readColumns = (count) =>
  page.evaluate((cols) => {
    const dist = (cells, attr) => {
      const perCol = new Array(cols).fill(0);
      for (const el of cells) {
        const i = +el.getAttribute(`data-${attr}-index`);
        if (el.getAttribute(`data-${attr}-highlighted`) !== 'true') continue;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const mid = Math.floor((cols - 1) / 2); // square: rows === cols
        perCol[col] = Math.max(perCol[col], Math.abs(Math.floor(cols / 2) - row) + 1);
      }
      return perCol;
    };
    const their = dist(
      document.querySelectorAll('[data-testid="tile-their-grid"] [data-lk-index]'),
      'lk',
    );
    const kaiEl = document.querySelector('[data-testid="tile-kai-grid"] kai-audio-visualizer');
    const kai = dist(kaiEl.shadowRoot.querySelectorAll('[data-kai-index]'), 'kai');
    return { their, kai };
  }, count);

const report = { densities: {}, consoleErrors };
const sheets = { 'a-voice': [], 'b-silence': [], 'c-listening': [], 'c-thinking': [] };

for (const n of DENSITIES) {
  await control('setGridCount', n);
  await page.waitForTimeout(300);

  // (a) real voice, pinned mid-speech
  await control('setFixtureFrame', 52);
  await page.getByTestId('btn-state-speaking').click();
  await page.waitForTimeout(500);
  sheets['a-voice'].push(await captureClip(`d${n}-a-voice-f52`));
  const cols = await readColumns(n);
  const distinct = (arr) => new Set(arr).size;
  report.densities[n] = {
    halfBands: Math.ceil(n / 2),
    voiceFrame52: {
      theirColHeights: cols.their.join(''),
      kaiColHeights: cols.kai.join(''),
      distinctHeights: { their: distinct(cols.their), kai: distinct(cols.kai) },
    },
  };

  // (b) silence
  await control('setSyntheticBands', [0, 0, 0, 0, 0]);
  await page.waitForTimeout(300);
  sheets['b-silence'].push(await captureClip(`d${n}-b-silence`));

  // (c) scripted states
  await control('setSyntheticBands', null);
  for (const s of ['listening', 'thinking']) {
    await page.getByTestId(`btn-state-${s}`).click();
    await page.waitForTimeout(700);
    sheets[`c-${s}`].push(await captureClip(`d${n}-c-${s}`));
  }
  await page.getByTestId('btn-state-speaking').click();
}

// Contact sheets: densities left-to-right, 16px gutter, per scenario.
for (const [scenario, bufs] of Object.entries(sheets)) {
  const pngs = bufs.map((b) => PNG.sync.read(b));
  const gap = 16 * DSF;
  const width = pngs.reduce((a, p) => a + p.width, 0) + gap * (pngs.length - 1);
  const height = Math.max(...pngs.map((p) => p.height));
  const sheet = new PNG({ width, height });
  // dark background so padding doesn't flash white
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = 11; sheet.data[i + 1] = 13; sheet.data[i + 2] = 16; sheet.data[i + 3] = 255;
  }
  let x = 0;
  for (const p of pngs) {
    PNG.bitblt(p, sheet, 0, 0, p.width, p.height, x, Math.floor((height - p.height) / 2));
    x += p.width + gap;
  }
  fs.writeFileSync(path.join(OUT, `contact-${scenario}.png`), PNG.sync.write(sheet));
}

// Restore defaults for whoever uses the page next.
await control('setGridCount', null);
await control('setSyntheticBands', null);
await control('setFixturePlaying', true);
await browser.close();

fs.writeFileSync(path.join(OUT, 'grid-size.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`artifacts: ${OUT}`);
