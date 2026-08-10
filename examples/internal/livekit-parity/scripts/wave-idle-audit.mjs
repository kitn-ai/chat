// Wave resting-state investigation (Rob: "their wave, when it's idle, kind
// of has a little bit of a wave going on. Ours doesn't."). Needs `pnpm dev`.
//
// Drives BOTH wave tiles through every reachable state at ZERO drive
// (synthetic all-zero bands -> their volume prop 0, our bands all 0) and
// measures, per side, over a 10-frame series:
//   - amp: max lit-pixel envelope height / tile height (flat line ~= line
//     thickness ~0.016-0.023; a gentle wave reads higher),
//   - scroll px/s: horizontal drift of the wave profile between consecutive
//     frames (phase movement -- 0 for a static line),
//   - lum min/max: opacity pulsing.
// Then repeats the idle comparison with prefers-reduced-motion emulated ON.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeWave, bestShift } from './lib/wave-metrics.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'wave-idle-audit');
fs.mkdirSync(OUT, { recursive: true });
const r2 = (v) => (Number.isNaN(v) ? NaN : Math.round(v * 100) / 100);

const DSF = 2; // deviceScaleFactor: sub-line-thickness waves need the resolution

async function measure(page, label, states, shots) {
  const theirTile = page.getByTestId('tile-their-wave');
  const kaiTile = page.getByTestId('tile-kai-wave');
  const tBox = await theirTile.boundingBox();
  const kBox = await kaiTile.boundingBox();
  const clip = {
    x: Math.min(tBox.x, kBox.x) - 4,
    y: Math.min(tBox.y, kBox.y) - 4,
    width: Math.max(tBox.x + tBox.width, kBox.x + kBox.width) - Math.min(tBox.x, kBox.x) + 8,
    height: Math.max(tBox.y + tBox.height, kBox.y + kBox.height) - Math.min(tBox.y, kBox.y) + 8,
  };
  const rel = (b) => ({
    x: Math.round((b.x - clip.x) * DSF),
    y: Math.round((b.y - clip.y) * DSF),
    width: Math.round(b.width * DSF),
    height: Math.round(b.height * DSF),
  });
  const rt = rel(tBox);
  const rk = rel(kBox);
  const pair = async (name) => {
    const full = PNG.sync.read(await page.screenshot({ clip }));
    const crop = (r) => {
      const o = new PNG({ width: r.width, height: r.height });
      PNG.bitblt(full, o, r.x, r.y, r.width, r.height, 0, 0);
      return PNG.sync.write(o);
    };
    const t = crop(rt);
    const k = crop(rk);
    if (name) {
      fs.writeFileSync(path.join(OUT, `${name}-their.png`), t);
      fs.writeFileSync(path.join(OUT, `${name}-kai.png`), k);
    }
    return { t: performance.now(), their: analyzeWave(t), kai: analyzeWave(k) };
  };

  const table = {};
  for (const s of states) {
    await page.getByTestId(`btn-state-${s}`).click();
    await page.waitForTimeout(900);
    const series = [];
    for (let i = 0; i < 10; i++) {
      series.push(await pair(shots && i === 4 ? `${label}-${s}` : null));
      await page.waitForTimeout(150);
    }
    // waviness: per-frame std of the wave centreline around its mean --
    // separates a gentle sine from a flat line even below line thickness.
    // motionPxS: mean |centroid_t - centroid_{t-1}| per column, per second --
    // real phase movement; ~0 for a static image regardless of shape.
    const median = (arr) => {
      const v = arr.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
      return v.length ? v[Math.floor(v.length / 2)] : NaN;
    };
    const waviness = (key) =>
      median(
        series.map((x) => {
          const c = x[key].centroid.filter((v) => !Number.isNaN(v));
          if (c.length < 10) return NaN;
          const m = c.reduce((a, b) => a + b, 0) / c.length;
          return Math.sqrt(c.reduce((a, b) => a + (b - m) ** 2, 0) / c.length);
        }),
      );
    const motion = (key) => {
      const rates = [];
      for (let i = 1; i < series.length; i++) {
        const a = series[i - 1][key].centroid;
        const b = series[i][key].centroid;
        const dt = (series[i].t - series[i - 1].t) / 1000;
        let sum = 0;
        let n = 0;
        for (let x = 0; x < a.length; x++) {
          if (Number.isNaN(a[x]) || Number.isNaN(b[x])) continue;
          sum += Math.abs(b[x] - a[x]);
          n++;
        }
        if (n > 20) rates.push(sum / n / dt);
      }
      return median(rates);
    };
    const agg = (key) => ({
      amp: r2(Math.max(...series.map((x) => x[key].ampFrac))),
      wavinessPx: r2(waviness(key) / DSF),
      motionPxS: r2(motion(key) / DSF),
      lumMin: r2(Math.min(...series.map((x) => x[key].meanLum))),
      lumMax: r2(Math.max(...series.map((x) => x[key].meanLum))),
    });
    table[s] = { their: agg('their'), kai: agg('kai') };
  }
  return table;
}

const browser = await chromium.launch();
const report = {};

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: DSF });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__parityControl?.setSyntheticBands);
  await page.evaluate(() => window.__parityControl.setSyntheticBands([0, 0, 0, 0, 0]));
  report.zeroDrive = await measure(
    page,
    'zero',
    ['idle', 'disconnected', 'listening', 'initializing', 'connecting', 'thinking', 'speaking'],
    true,
  );
  await page.close();
}

{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: DSF,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__parityControl?.setSyntheticBands);
  await page.evaluate(() => window.__parityControl.setSyntheticBands([0, 0, 0, 0, 0]));
  report.zeroDriveReducedMotion = await measure(page, 'rm', ['idle', 'disconnected'], true);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'wave-idle-audit.json'), JSON.stringify(report, null, 2));
for (const [block, table] of Object.entries(report)) {
  console.log(`\n${block}:`);
  for (const [s, d] of Object.entries(table))
    console.log(
      ` ${s.padEnd(13)} their amp ${String(d.their.amp).padEnd(5)} wavy ${String(d.their.wavinessPx).padEnd(5)} mov ${String(d.their.motionPxS).padEnd(6)} lum ${d.their.lumMin}-${d.their.lumMax}` +
        ` | kai amp ${String(d.kai.amp).padEnd(5)} wavy ${String(d.kai.wavinessPx).padEnd(5)} mov ${String(d.kai.motionPxS).padEnd(6)} lum ${d.kai.lumMin}-${d.kai.lumMax}`,
    );
}
console.log(`\nartifacts: ${OUT}`);
