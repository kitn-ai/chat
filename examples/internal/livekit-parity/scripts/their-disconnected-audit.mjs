// What does EACH LiveKit visualizer render at state='disconnected' with zero
// drive -- and how does it differ from their 'idle'? Ground truth for our
// first-class disconnected state. THEIR row only. Needs `pnpm dev`.
//
// DOM variants (bar/grid/radial): 15 samples @100ms of data-lk-highlighted
// indices (+ bar heights). Shader variants (wave/aura): 8-frame pixel series
// @150ms -- wave waviness/motion/lum (wave-metrics), aura radius/val series
// (aura-metrics). One still per variant per state.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeWave } from './lib/wave-metrics.mjs';
import { analyzeAura } from './lib/aura-metrics.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'their-disconnected');
fs.mkdirSync(OUT, { recursive: true });
const r2 = (v) => (Number.isNaN(v) ? NaN : Math.round(v * 100) / 100);
const DSF = 2;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: DSF });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl?.setSyntheticBands);
await page.evaluate(() => window.__parityControl.setSyntheticBands([0, 0, 0, 0, 0]));

const domSample = () =>
  page.evaluate(() => {
    const read = (tile) =>
      [...document.querySelectorAll(`[data-testid="tile-their-${tile}"] [data-lk-index]`)].map((el) => ({
        i: +el.getAttribute('data-lk-index'),
        hi: el.getAttribute('data-lk-highlighted') === 'true',
        h: el.style?.height || getComputedStyle(el).height,
      }));
    return { bar: read('bar'), grid: read('grid'), radial: read('radial'), t: performance.now() };
  });

const shaderPair = async () => {
  const grab = async (tile) => page.getByTestId(`tile-their-${tile}`).screenshot();
  // analyzeWave decodes its own buffer; analyzeAura expects a decoded PNG.
  return {
    wave: analyzeWave(await grab('wave')),
    aura: analyzeAura(PNG.sync.read(await grab('aura'))),
    t: performance.now(),
  };
};

const centroidStats = (c) => {
  const v = c.filter((x) => !Number.isNaN(x));
  if (v.length < 10) return NaN;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};

const report = {};
for (const state of ['disconnected', 'idle']) {
  await page.getByTestId(`btn-state-${state}`).click();
  await page.waitForTimeout(1000);

  const dom = [];
  for (let i = 0; i < 15; i++) {
    dom.push(await domSample());
    await page.waitForTimeout(100);
  }
  const shader = [];
  for (let i = 0; i < 8; i++) {
    shader.push(await shaderPair());
    await page.waitForTimeout(150);
  }

  for (const tile of ['bar', 'grid', 'radial', 'wave', 'aura']) {
    await page
      .getByTestId(`tile-their-${tile}`)
      .screenshot({ path: path.join(OUT, `their-${tile}-${state}.png`) });
  }

  const domSummary = (key) => {
    const patterns = dom.map((s) => s[key].filter((c) => c.hi).map((c) => c.i).join(',') || '-');
    return {
      cells: dom[0][key].length,
      distinctHighlightPatterns: [...new Set(patterns)],
      maxLitAtOnce: Math.max(...dom.map((s) => s[key].filter((c) => c.hi).length)),
    };
  };
  const barHeights = [...new Set(dom.flatMap((s) => s.bar.map((c) => c.h)))];

  const waveMotion = [];
  for (let i = 1; i < shader.length; i++) {
    const a = shader[i - 1].wave.centroid;
    const b = shader[i].wave.centroid;
    const dt = (shader[i].t - shader[i - 1].t) / 1000;
    let sum = 0;
    let n = 0;
    for (let x = 0; x < a.length; x++) {
      if (Number.isNaN(a[x]) || Number.isNaN(b[x])) continue;
      sum += Math.abs(b[x] - a[x]);
      n++;
    }
    if (n > 20) waveMotion.push(sum / n / dt);
  }
  const med = (arr) => {
    const v = arr.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
    return v.length ? r2(v[Math.floor(v.length / 2)]) : NaN;
  };

  report[state] = {
    bar: { ...domSummary('bar'), distinctHeights: barHeights },
    grid: domSummary('grid'),
    radial: domSummary('radial'),
    wave: {
      wavinessPx: r2(med(shader.map((s) => centroidStats(s.wave.centroid))) / DSF),
      motionPxS: med(waveMotion.map((v) => v / DSF)),
      lumMin: r2(Math.min(...shader.map((s) => s.wave.meanLum))),
      lumMax: r2(Math.max(...shader.map((s) => s.wave.meanLum))),
    },
    aura: {
      meanRSeries: shader.map((s) => r2(s.aura.meanR)),
      valSeries: shader.map((s) => r2(s.aura.meanVal)),
      litSeries: shader.map((s) => s.aura.lit),
    },
  };
}

await page.evaluate(() => window.__parityControl.setSyntheticBands(null));
await browser.close();
fs.writeFileSync(path.join(OUT, 'their-disconnected.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`artifacts: ${OUT}`);
