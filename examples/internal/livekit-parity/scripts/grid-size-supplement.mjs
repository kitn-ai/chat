// Supplement to grid-size-explore: 15x15 at quiet/mid/loud voice frames so
// the density judgment isn't based only on a saturated loud frame.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'grid-size');
fs.mkdirSync(OUT, { recursive: true });
const DSF = 2;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: DSF });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl?.setGridCount);
const control = (fn, arg) => page.evaluate(([f, a]) => window.__parityControl[f](a), [fn, arg]);

await control('setGridCount', 15);
await page.getByTestId('btn-state-speaking').click();
await page.waitForTimeout(300);

const bufs = [];
for (const [frame, label] of [[168, 'quiet-v0.19'], [160, 'mid-v0.35'], [52, 'loud-v0.55']]) {
  await control('setFixtureFrame', frame);
  await page.waitForTimeout(500);
  const t = await page.getByTestId('tile-their-grid').boundingBox();
  const k = await page.getByTestId('tile-kai-grid').boundingBox();
  const clip = {
    x: Math.min(t.x, k.x) - 4,
    y: Math.min(t.y, k.y) - 4,
    width: Math.max(t.x + t.width, k.x + k.width) - Math.min(t.x, k.x) + 8,
    height: Math.max(t.y + t.height, k.y + k.height) - Math.min(t.y, k.y) + 8,
  };
  const buf = await page.screenshot({ clip, path: path.join(OUT, `d15-levels-${label}.png`) });
  bufs.push(buf);
}

const pngs = bufs.map((b) => PNG.sync.read(b));
const gap = 16 * DSF;
const width = pngs.reduce((a, p) => a + p.width, 0) + gap * (pngs.length - 1);
const height = Math.max(...pngs.map((p) => p.height));
const sheet = new PNG({ width, height });
for (let i = 0; i < sheet.data.length; i += 4) {
  sheet.data[i] = 11; sheet.data[i + 1] = 13; sheet.data[i + 2] = 16; sheet.data[i + 3] = 255;
}
let x = 0;
for (const p of pngs) {
  PNG.bitblt(p, sheet, 0, 0, p.width, p.height, x, Math.floor((height - p.height) / 2));
  x += p.width + gap;
}
fs.writeFileSync(path.join(OUT, 'contact-d15-quiet-mid-loud.png'), PNG.sync.write(sheet));

await control('setGridCount', null);
await control('setFixturePlaying', true);
await browser.close();
console.log(`artifacts: ${OUT}`);
