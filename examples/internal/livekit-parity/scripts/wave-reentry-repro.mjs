// Focused repro for the speaking re-entry stall seen in wave-audit: N
// listening->speaking round-trips at pinned fixture drive (frame 52,
// volume 0.549), measuring both wave amplitudes at +500ms and +1200ms after
// each re-entry. Their wave should land at ~0.21 amp every time; the
// question is how often ours stays at the ~0.023 baseline instead.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const LIT = 60;

const ampOf = (buf) => {
  const png = PNG.sync.read(buf);
  const { width: W, height: H, data } = png;
  let best = 0;
  for (let x = Math.floor(W * 0.25); x < Math.ceil(W * 0.75); x++) {
    let minY = -1;
    let maxY = -1;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > LIT) {
        if (minY < 0) minY = y;
        maxY = y;
      }
    }
    if (minY >= 0) best = Math.max(best, maxY - minY + 1);
  }
  return best / H;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl);
await page.evaluate(() => window.__parityControl.setFixtureFrame(52)); // v = 0.549
await page.waitForTimeout(500);

const boxes = {
  their: await page.getByTestId('tile-their-wave').boundingBox(),
  kai: await page.getByTestId('tile-kai-wave').boundingBox(),
};
const pair = async () => {
  const full = PNG.sync.read(await page.screenshot());
  const crop = (b) => {
    const o = new PNG({ width: Math.round(b.width), height: Math.round(b.height) });
    PNG.bitblt(full, o, Math.round(b.x), Math.round(b.y), o.width, o.height, 0, 0);
    return ampOf(PNG.sync.write(o));
  };
  return { their: crop(boxes.their), kai: crop(boxes.kai) };
};

const results = [];
for (let i = 0; i < 6; i++) {
  await page.getByTestId('btn-state-listening').click();
  await page.waitForTimeout(800);
  await page.getByTestId('btn-state-speaking').click();
  await page.waitForTimeout(500);
  const at500 = await pair();
  await page.waitForTimeout(700);
  const at1200 = await pair();
  results.push({ at500, at1200 });
}
await browser.close();

for (const [i, r] of results.entries())
  console.log(
    `trip ${i}: +500ms their ${r.at500.their.toFixed(3)} kai ${r.at500.kai.toFixed(3)} | ` +
      `+1200ms their ${r.at1200.their.toFixed(3)} kai ${r.at1200.kai.toFixed(3)}`,
  );
console.log(
  `kai stalled (amp<0.1 at +1200ms): ${results.filter((r) => r.at1200.kai < 0.1).length}/6 | ` +
    `their stalled: ${results.filter((r) => r.at1200.their < 0.1).length}/6`,
);
