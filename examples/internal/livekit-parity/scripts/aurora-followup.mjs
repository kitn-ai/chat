// Focused aurora follow-ups on the closing-sweep build. Needs `pnpm dev`.
//
//   1. ROTATION with real statistics: 16 frame-pairs per state, median + IQR
//      per side (the single-run medians in aurora-audit proved unstable
//      run-to-run: deform aliases into the shift estimate at ~180ms cadence).
//   2. SILENCE-HOLD: speaking at synthetic 0.6 drive, then all-zero bands --
//      does each side hold the last driven radius (their volume>0 guard;
//      our new hold behavior)?
//   3. IDLE-CENTRE series for Rob: centre-disc luminance min/mean/max over a
//      12-sample idle series per side (single frames land on different
//      deform phases; a range is judgeable) + saved pairs.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeAura, angularShift } from './lib/aura-metrics.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'aurora-followup');
fs.mkdirSync(OUT, { recursive: true });

const r2 = (v) => Math.round(v * 100) / 100;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl?.setSyntheticBands);

const theirBox = await page.getByTestId('tile-their-aura').boundingBox();
const kaiBox = await page.getByTestId('tile-kai-aura').boundingBox();
const clip = {
  x: Math.min(theirBox.x, kaiBox.x) - 4,
  y: Math.min(theirBox.y, kaiBox.y) - 4,
  width: Math.max(theirBox.x + theirBox.width, kaiBox.x + kaiBox.width) - Math.min(theirBox.x, kaiBox.x) + 8,
  height: Math.max(theirBox.y + theirBox.height, kaiBox.y + kaiBox.height) - Math.min(theirBox.y, kaiBox.y) + 8,
};
const DSF = 2;
const rel = (b) => ({
  x: Math.round((b.x - clip.x) * DSF),
  y: Math.round((b.y - clip.y) * DSF),
  width: Math.round(b.width * DSF),
  height: Math.round(b.height * DSF),
});
const relTheir = rel(theirBox);
const relKai = rel(kaiBox);
const capturePair = async (name) => {
  const full = PNG.sync.read(await page.screenshot({ clip }));
  const crop = (r) => {
    const o = new PNG({ width: r.width, height: r.height });
    PNG.bitblt(full, o, r.x, r.y, r.width, r.height, 0, 0);
    return o;
  };
  const t = crop(relTheir);
  const k = crop(relKai);
  if (name) {
    fs.writeFileSync(path.join(OUT, `${name}-their.png`), PNG.sync.write(t));
    fs.writeFileSync(path.join(OUT, `${name}-kai.png`), PNG.sync.write(k));
  }
  return { t: performance.now(), theirPng: t, kaiPng: k, their: analyzeAura(t), kai: analyzeAura(k) };
};
const setBands = (l) => page.evaluate((x) => window.__parityControl.setSyntheticBands(x), l);

const report = {};

// ------------------------------------------------------------- 1. ROTATION
const stats = (arr) => {
  const v = arr.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return { median: NaN, iqr: NaN, n: 0 };
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { median: r2(q(0.5)), iqr: r2(q(0.75) - q(0.25)), n: v.length };
};
report.rotation = {};
await setBands([0.55, 0.55, 0.55, 0.55, 0.55]);
for (const s of ['speaking', 'listening', 'thinking', 'connecting']) {
  await page.getByTestId(`btn-state-${s}`).click();
  await page.waitForTimeout(1400);
  const series = [];
  for (let i = 0; i < 17; i++) {
    series.push(await capturePair(null));
    await page.waitForTimeout(150);
  }
  const their = [];
  const kai = [];
  for (let i = 1; i < series.length; i++) {
    const dt = (series[i].t - series[i - 1].t) / 1000;
    their.push(angularShift(series[i - 1].their.outer, series[i].their.outer) / dt);
    kai.push(angularShift(series[i - 1].kai.outer, series[i].kai.outer) / dt);
  }
  report.rotation[s] = { their: stats(their), kai: stats(kai) };
}

// --------------------------------------------------------- 2. SILENCE-HOLD
await page.getByTestId('btn-state-speaking').click();
await setBands([0.6, 0.6, 0.6, 0.6, 0.6]);
await page.waitForTimeout(1000);
const driven = await capturePair('hold-driven');
await setBands([0, 0, 0, 0, 0]);
await page.waitForTimeout(300);
const after300 = await capturePair(null);
await page.waitForTimeout(1200);
const after1500 = await capturePair('hold-after-1500ms');
report.silenceHold = {
  drivenR: { their: r2(driven.their.meanR), kai: r2(driven.kai.meanR) },
  after300msR: { their: r2(after300.their.meanR), kai: r2(after300.kai.meanR) },
  after1500msR: { their: r2(after1500.their.meanR), kai: r2(after1500.kai.meanR) },
};
await setBands(null);

// ---------------------------------------------------- 3. IDLE CENTRE SERIES
await page.getByTestId('btn-state-idle').click();
await page.waitForTimeout(1200);
const centreOf = (png, a) => {
  // Mean luminance in the analyzeAura centre disc is already computed as
  // centreLum; keep the series simple by reusing it.
  return a.centreLum;
};
const idle = [];
for (let i = 0; i < 12; i++) {
  const p = await capturePair(i === 0 || i === 6 ? `idle-centre-${i}` : null);
  idle.push({ their: r2(centreOf(p.theirPng, p.their)), kai: r2(centreOf(p.kaiPng, p.kai)) });
  await page.waitForTimeout(400);
}
const range = (key) => {
  const v = idle.map((x) => x[key]).filter((x) => !Number.isNaN(x));
  return {
    min: r2(Math.min(...v)),
    mean: r2(v.reduce((a, b) => a + b, 0) / v.length),
    max: r2(Math.max(...v)),
  };
};
report.idleCentreLum = { their: range('their'), kai: range('kai'), bg: 16 };
await page.getByTestId('btn-state-speaking').click();

await browser.close();
fs.writeFileSync(path.join(OUT, 'aurora-followup.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`artifacts: ${OUT}`);
