// Wave parity audit (campaign task #5). Needs `pnpm dev` running.
//
//   node scripts/wave-audit.mjs        # BASE_URL / SHOT_DIR env to override
//
// Measures both wave tiles pixel-wise (via pngjs) at deterministic fixture
// drives (window.__parityControl) and through a live recording pass
// (window.__parityProbes for full-precision volumes at capture time):
//
//   - amplitude excursion (lit-pixel envelope height / tile height) at
//     matched volumes,
//   - spatial cycle count (centroid zero crossings) -- the frequency
//     uniform's rendered effect,
//   - temporal phase drift between two captures at fixed drive,
//   - idle / quiet-volume look, state-transition onset/offset series,
//   - reduced-motion emulation (ours freezes by design; upstream has no
//     reduced-motion path -- report row 18).
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'wave-audit');
fs.mkdirSync(OUT, { recursive: true });

const LIT = 60; // channel max > LIT counts as wave pixel on the near-black bg

/** Envelope + cycle metrics for one wave-tile PNG buffer. */
function analyzeWave(buffer) {
  const png = PNG.sync.read(buffer);
  const { width: W, height: H, data } = png;
  const x0 = Math.floor(W * 0.25);
  const x1 = Math.ceil(W * 0.75); // stay inside their 20%-80% edge fade mask
  const envelope = [];
  const centroid = [];
  let litCount = 0;
  let lumSum = 0;
  for (let x = x0; x < x1; x++) {
    let minY = -1;
    let maxY = -1;
    let cSum = 0;
    let cW = 0;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      const v = Math.max(data[i], data[i + 1], data[i + 2]);
      lumSum += v;
      if (v > LIT) {
        litCount++;
        if (minY < 0) minY = y;
        maxY = y;
        cSum += y * v;
        cW += v;
      }
    }
    envelope.push(minY < 0 ? 0 : maxY - minY + 1);
    centroid.push(cW > 0 ? cSum / cW : NaN);
  }
  const defined = centroid.filter((c) => !Number.isNaN(c));
  const mid = defined.length ? defined.reduce((a, b) => a + b, 0) / defined.length : H / 2;
  let crossings = 0;
  let prev = 0;
  for (const c of centroid) {
    if (Number.isNaN(c)) continue;
    const s = Math.sign(c - mid);
    if (s !== 0 && prev !== 0 && s !== prev) crossings++;
    if (s !== 0) prev = s;
  }
  return {
    W,
    H,
    ampFrac: Math.max(...envelope) / H,
    meanAmpFrac: envelope.reduce((a, b) => a + b, 0) / envelope.length / H,
    cycles: crossings / 2,
    litFrac: litCount / ((x1 - x0) * H),
    meanLum: lumSum / ((x1 - x0) * H),
    centroid,
  };
}

/** Horizontal shift (px) of profile b relative to a, by best cross-correlation. */
function bestShift(a, b, maxShift = 60) {
  let best = { shift: NaN, score: -Infinity };
  for (let s = -maxShift; s <= maxShift; s++) {
    let score = 0;
    let n = 0;
    for (let x = 0; x < a.length; x++) {
      const xb = x + s;
      if (xb < 0 || xb >= b.length) continue;
      const va = a[x];
      const vb = b[xb];
      if (Number.isNaN(va) || Number.isNaN(vb)) continue;
      score -= (va - vb) * (va - vb);
      n++;
    }
    if (n > a.length / 2 && score / n > best.score) best = { shift: s, score: score / n };
  }
  return best.shift;
}

const r3 = (v) => (Number.isNaN(v) ? NaN : Math.round(v * 1000) / 1000);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl && !!window.__parityProbes);

const theirTile = page.getByTestId('tile-their-wave');
const kaiTile = page.getByTestId('tile-kai-wave');

// Both tiles are cropped out of ONE full-page screenshot so the pair shares
// a single capture instant -- serialized per-tile screenshots let the live
// drive move ~100-300ms between the two tiles, which reads as a fake
// amplitude mismatch on transient audio (bug found in this audit's first
// run: the "mismatch" tracked each side's volume at its own capture moment).
let tileBoxes;
const cropPng = (png, box) => {
  const out = new PNG({ width: Math.round(box.width), height: Math.round(box.height) });
  PNG.bitblt(png, out, Math.round(box.x), Math.round(box.y), out.width, out.height, 0, 0);
  return out;
};
const capturePair = async (name) => {
  tileBoxes ??= { their: await theirTile.boundingBox(), kai: await kaiTile.boundingBox() };
  const full = PNG.sync.read(await page.screenshot());
  const t = PNG.sync.write(cropPng(full, tileBoxes.their));
  const k = PNG.sync.write(cropPng(full, tileBoxes.kai));
  fs.writeFileSync(path.join(OUT, `${name}-their.png`), t);
  fs.writeFileSync(path.join(OUT, `${name}-kai.png`), k);
  return { their: analyzeWave(t), kai: analyzeWave(k) };
};

const setFrame = (n) => page.evaluate((f) => window.__parityControl.setFixtureFrame(f), n);
const probes = () => page.evaluate(() => window.__parityProbes);

const report = { fixture: [], recording: [], transitions: {}, states: {}, reducedMotion: {}, consoleErrors };

// ---------------------------------------------------------- 1. fixture sweep
// Scan every 2nd frame for its derived volume, then pick frames nearest the
// target volumes so both waves get IDENTICAL, pinned drive.
const frameVolumes = [];
for (let f = 0; f < 196; f += 2) {
  await setFrame(f);
  await page.waitForTimeout(25);
  const p = await probes();
  frameVolumes.push({ f, v: p.fixture.volume });
}
const pick = (target) =>
  frameVolumes.reduce((a, b) => (Math.abs(b.v - target) < Math.abs(a.v - target) ? b : a));
const targets = [0.05, 0.18, 0.35, 0.55, Math.max(...frameVolumes.map((x) => x.v))];
const chosen = [...new Map(targets.map((t) => { const c = pick(t); return [c.f, c]; })).values()];

for (const { f, v } of chosen) {
  await setFrame(f);
  await page.waitForTimeout(700); // 0.2s ease tween + settle
  const a = await capturePair(`fixture-f${f}-v${v.toFixed(3)}-a`);
  await page.waitForTimeout(250);
  const b = await capturePair(`fixture-f${f}-v${v.toFixed(3)}-b`);
  report.fixture.push({
    frame: f,
    volume: r3(v),
    expectedAmp: r3(0.015 + 0.4 * v),
    expectedFreq: r3(20 + 60 * v),
    their: { amp: r3(a.their.ampFrac), cycles: a.their.cycles, drift: bestShift(a.their.centroid, b.their.centroid) },
    kai: { amp: r3(a.kai.ampFrac), cycles: a.kai.cycles, drift: bestShift(a.kai.centroid, b.kai.centroid) },
    ampRatioKaiOverTheir: r3(a.kai.ampFrac / a.their.ampFrac),
  });
}

// ------------------------------------------------- 2. states at pinned drive
const loud = pick(0.55);
await setFrame(loud.f);
for (const s of ['idle', 'listening', 'thinking']) {
  await page.getByTestId(`btn-state-${s}`).click();
  await page.waitForTimeout(900);
  const shots = [];
  for (let i = 0; i < 5; i++) {
    shots.push(await capturePair(`state-${s}-${i}`));
    await page.waitForTimeout(180);
  }
  report.states[s] = {
    their: shots.map((x) => ({ amp: r3(x.their.ampFrac), lum: r3(x.their.meanLum) })),
    kai: shots.map((x) => ({ amp: r3(x.kai.ampFrac), lum: r3(x.kai.meanLum) })),
  };
}

// -------------------------------------------- 3. transition bursts (on/off)
await page.getByTestId('btn-state-listening').click();
await page.waitForTimeout(1200);
await page.getByTestId('btn-state-speaking').click();
const onset = [];
for (let i = 0; i < 6; i++) {
  onset.push(await capturePair(`onset-${i}`));
  await page.waitForTimeout(120);
}
await page.getByTestId('btn-state-listening').click();
const offset = [];
for (let i = 0; i < 6; i++) {
  offset.push(await capturePair(`offset-${i}`));
  await page.waitForTimeout(120);
}
report.transitions = {
  onsetAmp: { their: onset.map((x) => r3(x.their.ampFrac)), kai: onset.map((x) => r3(x.kai.ampFrac)) },
  offsetAmp: { their: offset.map((x) => r3(x.their.ampFrac)), kai: offset.map((x) => r3(x.kai.ampFrac)) },
};
await page.getByTestId('btn-state-speaking').click();

// ------------------------- 3b. speaking re-entry with STATIC drive (repro)
// First run showed kai stuck at baseline after listening->speaking while the
// fixture is pinned (volume never ticks). Sequence: measure steady speaking,
// round-trip through listening, measure again, then nudge the fixture one
// frame (a volume CHANGE) to test recovery.
await page.waitForTimeout(700);
const reA = await capturePair('reentry-steady');
await page.getByTestId('btn-state-listening').click();
await page.waitForTimeout(1000);
await page.getByTestId('btn-state-speaking').click();
await page.waitForTimeout(700); // past any 0.2s tween
const reB = await capturePair('reentry-after-roundtrip');
await setFrame(loud.f - 2); // adjacent frame: new drive values, similar volume
await page.waitForTimeout(400);
const reC = await capturePair('reentry-after-volume-change');
report.speakingReentry = {
  pinnedVolume: r3(loud.v),
  steady: { their: r3(reA.their.ampFrac), kai: r3(reA.kai.ampFrac) },
  afterRoundtrip: { their: r3(reB.their.ampFrac), kai: r3(reB.kai.ampFrac) },
  afterVolumeChange: { their: r3(reC.their.ampFrac), kai: r3(reC.kai.ampFrac) },
};
await setFrame(loud.f);

// ------------------------------------------------- 4. recording (live) pass
await page.getByTestId('btn-mode-recording').click();
await page.getByTestId('btn-rec-play').click();
await page.waitForFunction(
  () => document.querySelector('[data-testid="status"]')?.textContent?.includes('recording live'),
  { timeout: 5000 },
);
const buckets = { quiet: null, mid: null, loud: null };
const bucketOf = (v) => (v < 0.2 ? 'quiet' : v < 0.5 ? 'mid' : 'loud');
const endAt = Date.now() + 15000;
while (Date.now() < endAt && Object.values(buckets).some((b) => !b)) {
  const before = await probes();
  const b = bucketOf(before.their.volume);
  if (!buckets[b]) {
    const pair = await capturePair(`recording-${b}`);
    const after = await probes();
    buckets[b] = {
      theirVolume: [r3(before.their.volume), r3(after.their.volume)],
      kitVolume: [r3(before.kit.volume), r3(after.kit.volume)],
      their: { amp: r3(pair.their.ampFrac), cycles: pair.their.cycles },
      kai: { amp: r3(pair.kai.ampFrac), cycles: pair.kai.cycles },
    };
  }
  await page.waitForTimeout(120);
}
report.recording = buckets;
await page.getByTestId('btn-rec-stop').click();

// -------------------------------------------------- 5. reduced motion check
const rmContext = await browser.newContext({
  viewport: { width: 1440, height: 980 },
  reducedMotion: 'reduce',
});
const rmPage = await rmContext.newPage();
await rmPage.goto(BASE, { waitUntil: 'networkidle' });
await rmPage.waitForFunction(() => !!window.__parityControl);
await rmPage.evaluate((f) => window.__parityControl.setFixtureFrame(f), loud.f);
await rmPage.waitForTimeout(700);
const rmShot = async (loc, name) => {
  const buf = await loc.screenshot();
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  return buf;
};
const rmTheirA = await rmShot(rmPage.getByTestId('tile-their-wave'), 'rm-their-a');
const rmKaiA = await rmShot(rmPage.getByTestId('tile-kai-wave'), 'rm-kai-a');
await rmPage.waitForTimeout(500);
const rmTheirB = await rmShot(rmPage.getByTestId('tile-their-wave'), 'rm-their-b');
const rmKaiB = await rmShot(rmPage.getByTestId('tile-kai-wave'), 'rm-kai-b');
report.reducedMotion = {
  theirStatic: rmTheirA.equals(rmTheirB),
  kaiStatic: rmKaiA.equals(rmKaiB),
};
await rmContext.close();

await browser.close();

fs.writeFileSync(path.join(OUT, 'wave-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nscreenshots + wave-audit.json: ${OUT}`);
