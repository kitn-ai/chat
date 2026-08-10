// Aurora/aura parity audit (campaign task #6 baseline). Needs `pnpm dev`.
//
//   node scripts/aurora-audit.mjs      # BASE_URL / SHOT_DIR env to override
//
// BLACK-BOX on their side: only rendered pixels are observed (their aura
// component + shader are Polyform-licensed; the Apache driving hook's
// constants come from the research report). Captures are same-instant: both
// aura tiles are cropped from ONE clip screenshot. deviceScaleFactor 2
// doubles measurement resolution on the md (112px) tiles.
//
// Measures per side: ring radius vs volume (pinned fixture sweep, run FIRST
// -- a dist swap may land mid-audit; dist identity is recorded per phase),
// rotation speed/direction per state, lobe count, deform rate proxy,
// listening-entry spring (radius overshoot series), state pulses, color
// (saturation/white-clip/centre transparency/edge sharpness), recording
// buckets, reduced motion.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'aurora-audit');
fs.mkdirSync(OUT, { recursive: true });

const DIST_ENTRY = path.resolve(
  import.meta.dirname,
  '../../../../packages/ui/dist/elements/audio-visualizer.js',
);
const distIdentity = () => {
  const st = fs.statSync(DIST_ENTRY);
  const head = fs.readFileSync(DIST_ENTRY, 'utf8').slice(0, 160);
  const chunk = head.match(/audio-visualizer-([\w-]+)\.js/)?.[1] ?? '?';
  return { mtime: st.mtime.toISOString(), chunk };
};

const LIT = 40; // channel-max threshold on near-black bg (aura glow is soft)
const r2 = (v) => (Number.isNaN(v) ? NaN : Math.round(v * 100) / 100);

/**
 * Radial metrics for one aura tile PNG. Angle convention: theta increases
 * CLOCKWISE on screen (atan2 with y-down). Returns per-degree outer-radius
 * profile plus aggregates.
 */
function analyzeAura(png) {
  const { width: W, height: H, data } = png;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return Math.max(data[i], data[i + 1], data[i + 2]);
  };
  // Centre = lit-pixel centroid (canvas is centered in the tile; robust).
  let sx = 0;
  let sy = 0;
  let n = 0;
  let whiteClip = 0;
  let satSum = 0;
  let valSum = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const v = Math.max(r, g, b);
      if (v > LIT) {
        sx += x;
        sy += y;
        n++;
        const min = Math.min(r, g, b);
        satSum += v === 0 ? 0 : (v - min) / v;
        valSum += v / 255;
        if (min > 240) whiteClip++;
      }
    }
  if (n < 50) {
    return { lit: n, meanR: 0, outer: new Array(360).fill(0), lobes: 0 };
  }
  const cx = sx / n;
  const cy = sy / n;
  const maxR = Math.min(cx, cy, W - cx, H - cy) - 1;

  const outer = [];
  const inner = [];
  const riseIn = [];
  const riseOut = [];
  let rSum = 0;
  let rN = 0;
  for (let a = 0; a < 360; a++) {
    const th = (a * Math.PI) / 180;
    const dx = Math.cos(th);
    const dy = Math.sin(th); // y down => theta grows clockwise on screen
    let profile = [];
    for (let r = 0; r < maxR; r += 0.5) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      profile.push(x >= 0 && y >= 0 && x < W && y < H ? lum(x, y) : 0);
    }
    const peak = Math.max(...profile);
    if (peak <= LIT) {
      outer.push(0);
      inner.push(0);
      continue;
    }
    let first = -1;
    let last = -1;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] > LIT) {
        if (first < 0) first = i;
        last = i;
      }
    }
    inner.push(first * 0.5);
    outer.push(last * 0.5);
    rSum += ((first + last) / 2) * 0.5;
    rN++;
    // 10->90% rise distance, inner side (walking outward) and outer side
    // (walking inward), around the ring's brightness peak.
    const p10 = 0.1 * peak;
    const p90 = 0.9 * peak;
    let i10 = -1;
    let i90 = -1;
    for (let i = 0; i <= last; i++) {
      if (i10 < 0 && profile[i] >= p10) i10 = i;
      if (i90 < 0 && profile[i] >= p90) i90 = i;
    }
    if (i10 >= 0 && i90 >= i10) riseIn.push((i90 - i10) * 0.5);
    let o10 = -1;
    let o90 = -1;
    for (let i = profile.length - 1; i >= 0; i--) {
      if (o10 < 0 && profile[i] >= p10) o10 = i;
      if (o90 < 0 && profile[i] >= p90) o90 = i;
    }
    if (o10 >= 0 && o10 >= o90 && o90 >= 0) riseOut.push((o10 - o90) * 0.5);
  }

  // Lobe count: local maxima of the outer profile after light smoothing.
  const sm = outer.map((_, i) => {
    let s = 0;
    for (let k = -5; k <= 5; k++) s += outer[(i + k + 360) % 360];
    return s / 11;
  });
  const mean = sm.reduce((a, b) => a + b, 0) / 360;
  let lobes = 0;
  for (let i = 0; i < 360; i++) {
    const p = sm[(i - 1 + 360) % 360];
    const nx = sm[(i + 1) % 360];
    if (sm[i] > p && sm[i] >= nx && sm[i] > mean * 1.02) lobes++;
  }

  // Centre transparency: mean luminance in a small centre disc.
  let cSum = 0;
  let cN = 0;
  const cR = Math.max(3, (rSum / Math.max(1, rN)) * 0.3);
  for (let y = Math.round(cy - cR); y <= cy + cR; y++)
    for (let x = Math.round(cx - cR); x <= cx + cR; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= cR * cR && x >= 0 && y >= 0 && x < W && y < H) {
        cSum += lum(x, y);
        cN++;
      }
    }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
  return {
    lit: n,
    meanR: rSum / Math.max(1, rN),
    outerMax: Math.max(...outer),
    outer,
    lobes,
    meanSat: satSum / n,
    meanVal: valSum / n,
    whiteClipFrac: whiteClip / n,
    centreLum: cN ? cSum / cN : NaN,
    riseInner: avg(riseIn),
    riseOuter: avg(riseOut),
  };
}

/** Best circular shift (degrees, positive = clockwise on screen) of b vs a. */
function angularShift(a, b) {
  let best = { deg: NaN, score: Infinity };
  for (let s = -90; s <= 90; s++) {
    let err = 0;
    let n = 0;
    for (let i = 0; i < 360; i++) {
      const va = a[i];
      const vb = b[(i + s + 360) % 360];
      if (va === 0 || vb === 0) continue;
      err += (va - vb) ** 2;
      n++;
    }
    if (n > 180 && err / n < best.score) best = { deg: s, score: err / n };
  }
  return best.deg;
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 2 });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl && !!window.__parityProbes);

const theirBox = await page.getByTestId('tile-their-aura').boundingBox();
const kaiBox = await page.getByTestId('tile-kai-aura').boundingBox();
// One clip containing both aura tiles -> same-instant pair, small & fast.
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
  return { t: performance.now(), their: analyzeAura(t), kai: analyzeAura(k) };
};

const setFrame = (n) => page.evaluate((f) => window.__parityControl.setFixtureFrame(f), n);
const probes = () => page.evaluate(() => window.__parityProbes);

const report = { distAtStart: distIdentity(), phases: {}, consoleErrors };

// ---------------------------------------- PHASE 1 (EARLY): radius vs volume
{
  // Reuse the known frame->volume map shape: scan every 4th frame.
  const fv = [];
  for (let f = 0; f < 196; f += 4) {
    await setFrame(f);
    await page.waitForTimeout(20);
    fv.push({ f, v: (await probes()).fixture.volume });
  }
  const pick = (t) => fv.reduce((a, b) => (Math.abs(b.v - t) < Math.abs(a.v - t) ? b : a));
  const targets = [0.03, 0.1, 0.18, 0.28, 0.38, 0.48, 0.58, Math.max(...fv.map((x) => x.v))];
  const chosen = [...new Map(targets.map((t) => { const c = pick(t); return [c.f, c]; })).values()];
  const rows = [];
  for (const { f, v } of chosen) {
    await setFrame(f);
    await page.waitForTimeout(900); // their landing 0.5s + guard; ours relax
    const m = await capturePair(`p1-v${v.toFixed(3)}`);
    rows.push({ volume: r2(v), their: r2(m.their.meanR), kai: r2(m.kai.meanR) });
  }
  const fit = (key) => {
    const xs = rows.map((r) => r.volume);
    const ys = rows.map((r) => r[key]);
    const mx = xs.reduce((a, b) => a + b) / xs.length;
    const my = ys.reduce((a, b) => a + b) / ys.length;
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    return { slope: r2(slope), intercept: r2(my - slope * mx) };
  };
  report.phases.radiusVsVolume = { rows, theirFit: fit('their'), kaiFit: fit('kai'), dist: distIdentity() };

  // Volume step response bound (capture cadence >> 33ms; bound only).
  const lo = pick(0.05);
  const hi = pick(0.58);
  await setFrame(lo.f);
  await page.waitForTimeout(900);
  const before = await capturePair(null);
  await setFrame(hi.f);
  const series = [];
  for (let i = 0; i < 6; i++) series.push(await capturePair(i === 0 ? 'p1-step-first' : null));
  report.phases.stepResponse = {
    fromV: r2(lo.v),
    toV: r2(hi.v),
    beforeR: { their: r2(before.their.meanR), kai: r2(before.kai.meanR) },
    seriesR: series.map((s) => ({ dt: Math.round(s.t - series[0].t), their: r2(s.their.meanR), kai: r2(s.kai.meanR) })),
  };
}

// --------------------------------- PHASE 2: states, rotation, pulse, spring
{
  const loud = 52; // v ~0.55 from prior audits
  await setFrame(loud);
  const stateData = {};
  for (const s of ['speaking', 'idle', 'listening', 'thinking', 'connecting']) {
    await page.getByTestId(`btn-state-${s}`).click();
    await page.waitForTimeout(1400); // springs/landings settle
    const series = [];
    for (let i = 0; i < 8; i++) {
      series.push(await capturePair(i === 0 ? `p2-${s}` : null));
      await page.waitForTimeout(140);
    }
    const rot = [];
    for (let i = 1; i < series.length; i++) {
      const d = angularShift(series[i - 1].their.outer, series[i].their.outer);
      const dk = angularShift(series[i - 1].kai.outer, series[i].kai.outer);
      const dt = (series[i].t - series[i - 1].t) / 1000;
      rot.push({ their: r2(d / dt), kai: r2(dk / dt) });
    }
    const med = (arr) => {
      const v = arr.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
      return v.length ? r2(v[Math.floor(v.length / 2)]) : NaN;
    };
    stateData[s] = {
      meanR: { their: r2(series.at(-1).their.meanR), kai: r2(series.at(-1).kai.meanR) },
      lobes: { their: series.at(-1).their.lobes, kai: series.at(-1).kai.lobes },
      rotDegPerSec: { their: med(rot.map((r) => r.their)), kai: med(rot.map((r) => r.kai)) },
      valSeries: {
        their: series.map((x) => r2(x.their.meanVal)),
        kai: series.map((x) => r2(x.kai.meanVal)),
      },
      radiusSeries: { their: series.map((x) => r2(x.their.meanR)), kai: series.map((x) => r2(x.kai.meanR)) },
    };
  }
  report.phases.states = stateData;

  // Listening-entry spring: idle -> listening, tight series through the 1s
  // spring window; overshoot = maxR notably above settled R.
  await page.getByTestId('btn-state-idle').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('btn-state-listening').click();
  const entry = [];
  for (let i = 0; i < 12; i++) entry.push(await capturePair(i === 2 ? 'p2-listening-entry' : null));
  const settleTheir = entry.at(-1).their.meanR;
  const settleKai = entry.at(-1).kai.meanR;
  report.phases.listeningEntry = {
    series: entry.map((s) => ({ dt: Math.round(s.t - entry[0].t), their: r2(s.their.meanR), kai: r2(s.kai.meanR) })),
    overshoot: {
      their: r2(Math.max(...entry.map((s) => s.their.meanR)) / settleTheir),
      kai: r2(Math.max(...entry.map((s) => s.kai.meanR)) / settleKai),
    },
  };
  await page.getByTestId('btn-state-speaking').click();
  await page.waitForTimeout(900);
}

// ------------------------------------------------- PHASE 3: color & centre
{
  const rows = [];
  for (const f of [194, 168, 52, 90]) {
    await setFrame(f);
    await page.waitForTimeout(900);
    const v = (await probes()).fixture.volume;
    const m = await capturePair(`p3-color-v${v.toFixed(2)}`);
    rows.push({
      volume: r2(v),
      their: {
        sat: r2(m.their.meanSat),
        val: r2(m.their.meanVal),
        whiteClip: r2(m.their.whiteClipFrac),
        centreLum: r2(m.their.centreLum),
        riseInner: r2(m.their.riseInner),
        riseOuter: r2(m.their.riseOuter),
      },
      kai: {
        sat: r2(m.kai.meanSat),
        val: r2(m.kai.meanVal),
        whiteClip: r2(m.kai.whiteClipFrac),
        centreLum: r2(m.kai.centreLum),
        riseInner: r2(m.kai.riseInner),
        riseOuter: r2(m.kai.riseOuter),
      },
    });
  }
  report.phases.color = rows;
}

// -------------------------------------------------- PHASE 4: recording pass
{
  await page.getByTestId('btn-mode-recording').click();
  await page.getByTestId('btn-rec-play').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="status"]')?.textContent?.includes('recording live'),
    { timeout: 5000 },
  );
  const buckets = {};
  const endAt = Date.now() + 14000;
  while (Date.now() < endAt && Object.keys(buckets).length < 3) {
    const p = await probes();
    const b = p.their.volume < 0.2 ? 'quiet' : p.their.volume < 0.5 ? 'mid' : 'loud';
    if (!buckets[b]) {
      const m = await capturePair(`p4-rec-${b}`);
      const after = await probes();
      buckets[b] = {
        theirVolume: [r2(p.their.volume), r2(after.their.volume)],
        kitVolume: [r2(p.kit.volume), r2(after.kit.volume)],
        meanR: { their: r2(m.their.meanR), kai: r2(m.kai.meanR) },
      };
    }
    await page.waitForTimeout(120);
  }
  report.phases.recording = buckets;
  await page.getByTestId('btn-rec-stop').click();
}

// -------------------------------------------------- PHASE 5: reduced motion
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 980 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const p2 = await ctx.newPage();
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  await p2.waitForFunction(() => !!window.__parityControl);
  await p2.evaluate(() => window.__parityControl.setFixtureFrame(52));
  await p2.waitForTimeout(900);
  const shot = async () => ({
    their: await p2.getByTestId('tile-their-aura').screenshot(),
    kai: await p2.getByTestId('tile-kai-aura').screenshot(),
  });
  const a = await shot();
  await p2.waitForTimeout(500);
  const b = await shot();
  fs.writeFileSync(path.join(OUT, 'p5-rm-their.png'), a.their);
  fs.writeFileSync(path.join(OUT, 'p5-rm-kai.png'), a.kai);
  report.phases.reducedMotion = {
    theirStatic: a.their.equals(b.their),
    kaiStatic: a.kai.equals(b.kai),
  };
  await ctx.close();
}

report.distAtEnd = distIdentity();
await browser.close();

fs.writeFileSync(path.join(OUT, 'aurora-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nartifacts: ${OUT}`);
