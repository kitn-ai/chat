// Headless acceptance pass for the parity harness. Needs `pnpm dev` running.
//
//   node scripts/verify.mjs            # BASE_URL / SHOT_DIR env to override
//
// - FIXTURE: no permissions needed; asserts both rows animate (pixel-different
//   screenshots) and the probes move.
// - RECORDING: synthesized click supplies the autoplay gesture.
// - MIC: Chromium's fake audio device (a tone, NOT a real microphone). The
//   fake tone is low-frequency, so the bins 100-200 bands window -- which
//   BOTH sides now share -- may legitimately read ~0 there; only wiring is
//   asserted, via their volume scalar (reads the whole spectrum).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
const OUT = process.env.SHOT_DIR || path.join(import.meta.dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const notes = [];
const consoleErrors = [];

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
await context.grantPermissions(['microphone'], { origin: BASE });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err}`));

const shot = async (name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
};

const readProbe = async (name) => {
  const text = (await page.locator(`[data-probe="${name}"]`).textContent()) ?? '';
  return (text.match(/\d+\.\d+/g) ?? []).map(Number);
};

// Poll a probe for `ms`, returning the max single value seen.
const sampleMax = async (name, ms) => {
  let max = 0;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    for (const v of await readProbe(name)) max = Math.max(max, v);
    await page.waitForTimeout(100);
  }
  return max;
};

const check = (label, ok, detail) => {
  (ok ? notes : failures).push(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('kai-audio-visualizer');
await page.waitForSelector('[data-lk-state]');
check('both rows mounted', true);

// ---------------------------------------------------------------- FIXTURE
await page.waitForTimeout(500);
const fixA = await shot('fixture-speaking-a');
await page.waitForTimeout(700);
const fixB = await shot('fixture-speaking-b');
check(
  'fixture animates (screenshots differ)',
  !fs.readFileSync(fixA).equals(fs.readFileSync(fixB)),
);
const fixTheir = await sampleMax('their-bands', 1500);
const fixKit = await sampleMax('kit-half', 500);
check('fixture drives their bands', fixTheir > 0.05, `max ${fixTheir.toFixed(2)}`);
check('fixture drives kit bands', fixKit > 0.05, `max ${fixKit.toFixed(2)}`);

await page.getByTestId('btn-state-thinking').click();
await page.waitForTimeout(800);
await shot('fixture-thinking');
await page.getByTestId('btn-state-listening').click();
await page.waitForTimeout(800);
await shot('fixture-listening');
await page.getByTestId('btn-state-speaking').click();

// -------------------------------------------------------------- RECORDING
await page.getByTestId('btn-mode-recording').click();
await page.getByTestId('btn-rec-play').click();
try {
  await page.waitForFunction(
    () => document.querySelector('[data-testid="status"]')?.textContent?.includes('recording live'),
    { timeout: 5000 },
  );
  await page.waitForTimeout(800);
  const recA = await shot('recording-a');
  const [recTheirV, recKitV, recTheirB, recKitB] = await Promise.all([
    sampleMax('their-volume', 4000),
    sampleMax('kit-volume', 4000),
    sampleMax('their-bands', 4000),
    sampleMax('kit-half', 4000),
  ]);
  const recB = await shot('recording-b');
  check('recording animates (screenshots differ)', !fs.readFileSync(recA).equals(fs.readFileSync(recB)));
  check('recording: their volume moves', recTheirV > 0.05, `max ${recTheirV.toFixed(2)}`);
  check('recording: kit volume moves', recKitV > 0.02, `max ${recKitV.toFixed(2)}`);
  notes.push(
    `INFO recording probe maxima -- their-bands ${recTheirB.toFixed(2)}, kit-half ${recKitB.toFixed(2)}, ` +
      `their-volume ${recTheirV.toFixed(2)}, kit-volume ${recKitV.toFixed(2)}`,
  );
} catch (e) {
  check('recording mode reaches live', false, String(e).slice(0, 200));
  await shot('recording-failed');
}

// -------------------------------------------------------------------- MIC
await page.getByTestId('btn-mode-mic').click();
await page.getByTestId('btn-mic-enable').click();
try {
  await page.waitForFunction(
    () => document.querySelector('[data-testid="status"]')?.textContent?.includes('mic live'),
    { timeout: 8000 },
  );
  await page.waitForTimeout(500);
  const micTheirV = await sampleMax('their-volume', 2500);
  const micKit = await sampleMax('kit-half', 2500);
  const micTheirB = await sampleMax('their-bands', 1000);
  await shot('mic-fake-device');
  check('mic (fake device): their volume moves', micTheirV > 0.02, `max ${micTheirV.toFixed(2)}`);
  notes.push(
    `INFO mic fake-device probe maxima -- kit-half ${micKit.toFixed(2)}, their-bands ${micTheirB.toFixed(2)} ` +
      '(fake tone is low-frequency; the shared bins 100-200 window reading ~0 on both sides is expected)',
  );
  // Constraint toggle re-captures without error.
  await page.getByTestId('preset-off').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="status"]')?.textContent?.includes('mic live'),
    { timeout: 8000 },
  );
  check('mic constraint toggle re-captures', true);
} catch (e) {
  check('mic mode reaches live', false, String(e).slice(0, 200));
  await shot('mic-failed');
}

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));

await browser.close();

console.log(['', ...notes, ...failures, '', `screenshots: ${OUT}`].join('\n'));
if (failures.length > 0) process.exit(1);
