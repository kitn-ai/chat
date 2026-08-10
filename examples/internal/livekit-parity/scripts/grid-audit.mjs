// Grid parity investigation (campaign task #9). Needs `pnpm dev` running.
//
//   node scripts/grid-audit.mjs        # BASE_URL / SHOT_DIR env to override
//
// Measures, side by side and same-instant (single evaluate reads both DOMs):
//   1. LEVEL SWEEP: constant synthetic band levels 0..1 -> which rows light,
//      per side (ours: shadow data-kai-highlighted; theirs: data-lk-highlighted).
//   2. RAMP: a realistic mirrored speech shape at post-alignment levels.
//   3. SPEECH ROW-REACH: recording mode, rows engaged over full speech passes
//      + the band maxima that drove them.
//   4. IDLE: recording silence (all bands ~0) pattern; scripted idle/listening.
// Records dist chunk identity so captures are attributable to a build.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out', 'grid-audit');
fs.mkdirSync(OUT, { recursive: true });

const DIST_ENTRY = path.resolve(
  import.meta.dirname,
  '../../../../packages/ui/dist/elements/audio-visualizer.js',
);
const distIdentity = () => {
  const head = fs.readFileSync(DIST_ENTRY, 'utf8').slice(0, 160);
  return {
    chunk: head.match(/audio-visualizer-([\w-]+)\.js/)?.[1] ?? '?',
    mtime: fs.statSync(DIST_ENTRY).mtime.toISOString(),
  };
};

const COLS = 5;
const rowOf = (i) => Math.floor(i / COLS);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__parityControl?.setSyntheticBands);

const readGrids = () =>
  page.evaluate(() => {
    const their = [...document.querySelectorAll('[data-testid="tile-their-grid"] [data-lk-index]')].map(
      (el) => ({ i: +el.getAttribute('data-lk-index'), hi: el.getAttribute('data-lk-highlighted') === 'true' }),
    );
    const kaiEl = document.querySelector('[data-testid="tile-kai-grid"] kai-audio-visualizer');
    const kai = kaiEl?.shadowRoot
      ? [...kaiEl.shadowRoot.querySelectorAll('[data-kai-index]')].map((el) => ({
          i: +el.getAttribute('data-kai-index'),
          hi: el.getAttribute('data-kai-highlighted') === 'true',
        }))
      : [];
    const p = window.__parityProbes;
    return { their, kai, theirBands: p.their.bands, kitHalf: p.kit.half, t: performance.now() };
  });

const rowsLit = (cells) => {
  const byRow = new Map();
  for (const c of cells) {
    if (!byRow.has(rowOf(c.i))) byRow.set(rowOf(c.i), []);
    byRow.get(rowOf(c.i)).push(c.hi);
  }
  const full = [];
  const partial = [];
  for (const [row, states] of byRow) {
    if (states.every(Boolean)) full.push(row);
    else if (states.some(Boolean)) partial.push(row);
  }
  return { full: full.sort(), partial: partial.sort() };
};

const setBands = (levels) => page.evaluate((l) => window.__parityControl.setSyntheticBands(l), levels);

// Clip containing both grid tiles for paired screenshots.
const tBox = await page.getByTestId('tile-their-grid').boundingBox();
const kBox = await page.getByTestId('tile-kai-grid').boundingBox();
const clip = {
  x: Math.min(tBox.x, kBox.x) - 4,
  y: Math.min(tBox.y, kBox.y) - 4,
  width: Math.max(tBox.x + tBox.width, kBox.x + kBox.width) - Math.min(tBox.x, kBox.x) + 8,
  height: Math.max(tBox.y + tBox.height, kBox.y + kBox.height) - Math.min(tBox.y, kBox.y) + 8,
};
const shot = (name) => page.screenshot({ clip, path: path.join(OUT, `${name}.png`) });

const report = { dist: distIdentity(), levelSweep: [], consoleErrors };

// ------------------------------------------------------- 1. LEVEL SWEEP
// Expectations are PER SIDE since the grid threshold remap landed as a
// DELIBERATE divergence: theirs keeps upstream's |mid-y| * 1/(mid+1)
// (0, 1/3, 2/3 at 5 rows); ours is max(|mid-y|/(mid+1) * 0.65, 0.02)
// (0.02, ~0.217, ~0.433) -- silent mic shows an EMPTY grid, outer rows
// engage at realistic speech levels. Verdicts: 'match' (sides agree),
// 'diverges-by-design' (each side matches its OWN rule, sides differ),
// 'UNEXPECTED' (a side broke its own rule -- a real defect).
const expectRows = (v, thresholds) => {
  const rows = [];
  for (let y = 0; y < 5; y++) if (v >= thresholds[Math.abs(2 - y)]) rows.push(y);
  return rows;
};
const THEIR_T = [0, 1 / 3, 2 / 3];
const KAI_T = [0.02, 0.65 / 3, (2 * 0.65) / 3];
await page.getByTestId('btn-state-speaking').click();
for (let v = 0; v <= 1.001; v += 0.05) {
  const lv = Math.round(v * 100) / 100;
  await setBands([lv, lv, lv, lv, lv]);
  await page.waitForTimeout(80);
  const g = await readGrids();
  const their = rowsLit(g.their);
  const kai = rowsLit(g.kai);
  const theirOk = JSON.stringify(their.full) === JSON.stringify(expectRows(lv, THEIR_T));
  const kaiOk = JSON.stringify(kai.full) === JSON.stringify(expectRows(lv, KAI_T));
  report.levelSweep.push({
    level: lv,
    their,
    kai,
    verdict: !theirOk || !kaiOk
      ? `UNEXPECTED (their rule ${theirOk ? 'ok' : 'BROKEN'}, kai rule ${kaiOk ? 'ok' : 'BROKEN'})`
      : JSON.stringify(their.full) === JSON.stringify(kai.full)
        ? 'match'
        : 'diverges-by-design',
  });
  if ([0, 0.25, 0.45, 0.5, 0.65, 0.7, 1].includes(lv)) await shot(`sweep-${lv.toFixed(2)}`);
}

// ------------------------------------------------------------ 2. RAMP
// Mirrored speech-like shape at post-alignment levels (peak 0.65 centre).
const ramp = [0.2, 0.45, 0.65, 0.45, 0.2];
await setBands(ramp);
await page.waitForTimeout(120);
{
  const g = await readGrids();
  const perColumn = (cells) => {
    const cols = [];
    for (let c = 0; c < COLS; c++) {
      cols.push(
        cells
          .filter((x) => x.i % COLS === c && x.hi)
          .map((x) => rowOf(x.i))
          .sort()
          .join(''),
      );
    }
    return cols;
  };
  report.ramp = { levels: ramp, theirColumns: perColumn(g.their), kaiColumns: perColumn(g.kai) };
  await shot('ramp-0.2-0.45-0.65');
}
await setBands(null);

// ------------------------------------------------ 3. SPEECH ROW-REACH
await page.getByTestId('btn-mode-recording').click();
await page.getByTestId('btn-rec-play').click();
await page.waitForFunction(
  () => document.querySelector('[data-testid="status"]')?.textContent?.includes('recording live'),
  { timeout: 5000 },
);
const speech = { samples: 0, distHist: { their: [0, 0, 0], kai: [0, 0, 0] }, maxBand: { their: 0, kit: 0 }, mismatchSamples: 0 };
let quietPattern = null;
let peakShotTaken = false;
const endAt = Date.now() + 14000;
while (Date.now() < endAt) {
  const g = await readGrids();
  const dist = (cells) => Math.max(0, ...cells.filter((c) => c.hi).map((c) => Math.abs(2 - rowOf(c.i))));
  const dt = dist(g.their);
  const dk = dist(g.kai);
  speech.samples++;
  speech.distHist.their[dt]++;
  speech.distHist.kai[dk]++;
  if (dt !== dk) speech.mismatchSamples++;
  speech.maxBand.their = Math.max(speech.maxBand.their, ...g.theirBands);
  speech.maxBand.kit = Math.max(speech.maxBand.kit, ...g.kitHalf);
  if (!peakShotTaken && dt >= 1 && dk >= 1) {
    await shot('recording-speech-peak');
    peakShotTaken = true;
  }
  if (!quietPattern && g.theirBands.every((b) => b < 0.01) && g.kitHalf.every((b) => b < 0.01)) {
    quietPattern = { their: rowsLit(g.their), kai: rowsLit(g.kai) };
    await shot('recording-silence');
  }
  await page.waitForTimeout(80);
}
speech.maxRowsReached = {
  their: speech.distHist.their.map((n, d) => (n ? d : -1)).filter((d) => d >= 0).pop(),
  kai: speech.distHist.kai.map((n, d) => (n ? d : -1)).filter((d) => d >= 0).pop(),
};
report.speech = speech;
report.recordingSilence = quietPattern;
await page.getByTestId('btn-rec-stop').click();

// --------------------------------------------------------- 4. SCRIPTED STATES
await page.getByTestId('btn-mode-fixture').click();
for (const s of ['idle', 'listening']) {
  await page.getByTestId(`btn-state-${s}`).click();
  await page.waitForTimeout(400);
  const litCounts = [];
  for (let i = 0; i < 15; i++) {
    const g = await readGrids();
    litCounts.push({
      their: g.their.filter((c) => c.hi).map((c) => c.i).join(','),
      kai: g.kai.filter((c) => c.hi).map((c) => c.i).join(','),
    });
    await page.waitForTimeout(100);
  }
  const uniq = (key) => [...new Set(litCounts.map((x) => x[key]))];
  report[`state_${s}`] = {
    theirDistinctPatterns: uniq('their').length,
    kaiDistinctPatterns: uniq('kai').length,
    theirMaxLitAtOnce: Math.max(...litCounts.map((x) => (x.their ? x.their.split(',').length : 0))),
    kaiMaxLitAtOnce: Math.max(...litCounts.map((x) => (x.kai ? x.kai.split(',').length : 0))),
  };
  await shot(`state-${s}`);
}

report.distAtEnd = distIdentity();
await browser.close();
fs.writeFileSync(path.join(OUT, 'grid-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nartifacts: ${OUT}`);
