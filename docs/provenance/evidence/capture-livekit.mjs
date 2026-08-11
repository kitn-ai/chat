import { chromium } from '/Users/home/Projects/kitn-ai/kitn-chat/node_modules/playwright/index.mjs';
import fs from 'node:fs';

fs.mkdirSync('lk-frames', { recursive: true });

const b = await chromium.launch({
  args: ['--use-gl=angle', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const p = await b.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
await p.goto('https://docs.livekit.io/frontends/agents-ui/audio-visualizer/prebuilt/', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await p.waitForTimeout(2000);

await p.getByRole('tab', { name: 'Aura' }).first().click().catch(async () => {
  await p.getByText('Aura', { exact: true }).first().click();
});
await p.waitForTimeout(3000);

const target = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('canvas').forEach((c, i) => {
    const r = c.getBoundingClientRect();
    out.push({ i, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) });
  });
  return out;
});
console.log('canvases after Aura click:', JSON.stringify(target));
if (!target.length) {
  await p.screenshot({ path: 'lk-aura-debug.png', fullPage: false });
  await b.close();
  process.exit(1);
}

// pick the biggest canvas
const big = target.reduce((a, c) => (c.w * c.h > a.w * a.h ? c : a));
const canvas = p.locator('canvas').nth(big.i);
await canvas.scrollIntoViewIfNeeded();
await p.waitForTimeout(1500);

// burst capture with real timestamps
const times = [];
for (let i = 0; i < 100; i++) {
  times.push(performance.now());
  await canvas.screenshot({ path: `lk-frames/lk_${String(i).padStart(3, '0')}.png` });
}
fs.writeFileSync('lk-frames/times.json', JSON.stringify(times));
const dt = (times[times.length - 1] - times[0]) / (times.length - 1);
console.log(`captured 100 frames, mean interval ${dt.toFixed(1)}ms (${(1000 / dt).toFixed(1)} fps), size ${big.w}x${big.h}`);
await b.close();
