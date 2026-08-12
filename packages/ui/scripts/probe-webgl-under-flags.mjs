#!/usr/bin/env node
/**
 * Throwaway experiment (not wired into CI): the storybook suite had never once
 * run with the config's chromium flags actually applied, so their behavioural
 * cost was never observed. `src/components/audio-visualizer/shader-canvas.tsx`
 * needs a WebGL context, and `--disable-gpu` plus `--disable-software-rasterizer`
 * can remove both the GPU path AND the swiftshader fallback -- which would leave
 * every shader-backed story silently rendering nothing (the component returns
 * null from `getContext` and degrades rather than throwing, so a story would
 * still pass).
 *
 * Compares plain chromium against chromium launched with the exact flag list
 * from vitest.config.ts.
 */
import { chromium } from 'playwright';

/** The list as it stood while it was inert -- what would have gone live unchanged. */
const OLD_LIST = [
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--js-flags=--max-old-space-size=2048',
];

/** What vitest.config.ts ships now. */
const SHIPPED = OLD_LIST.filter(
  (f) => f !== '--disable-software-rasterizer' && !f.startsWith('--js-flags='),
);

async function webglReport(args) {
  const browser = await chromium.launch({ headless: true, args });
  const page = await browser.newPage();
  const out = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { ok: false, renderer: null };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      ok: true,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
  await browser.close();
  return out;
}

const cases = [
  ['plain chromium (reference)', []],
  ['OLD list, as it would have gone live', OLD_LIST],
  ['--disable-gpu alone', ['--disable-gpu']],
  ['--disable-software-rasterizer alone', ['--disable-software-rasterizer']],
  ['the two together, nothing else', ['--disable-gpu', '--disable-software-rasterizer']],
  ['SHIPPED list (what vitest.config.ts sends)', SHIPPED],
];

const results = {};
for (const [label, args] of cases) {
  const r = await webglReport(args);
  results[label] = r;
  console.log(`${label.padEnd(44)} webgl=${String(r.ok).padEnd(5)} renderer=${r.renderer ?? '-'}`);
}

const plain = results['plain chromium (reference)'];
const old = results['OLD list, as it would have gone live'];
const shipped = results['SHIPPED list (what vitest.config.ts sends)'];

if (!plain.ok) {
  console.log('\n=> INCONCLUSIVE: plain chromium has no WebGL here either, so this machine cannot tell.');
  process.exit(2);
}
console.log(
  `\nold list  -> webgl ${old.ok ? 'SURVIVES' : 'GONE'}` +
  `\nshipped   -> webgl ${shipped.ok ? 'SURVIVES' : 'GONE'}`,
);
// Neither flag alone does it; only the pair. That is the finding worth keeping.
console.log(
  !old.ok && shipped.ok
    ? '\n=> Confirmed: --disable-gpu + --disable-software-rasterizer together remove WebGL,\n   and dropping --disable-software-rasterizer restores it. The shipped list is safe.'
    : shipped.ok
      ? '\n=> The shipped list keeps WebGL, and the old list did too - the pairing no longer reproduces.'
      : '\n=> REGRESSION: the SHIPPED list removes WebGL. Shader-backed stories would render their bar fallback.',
);
process.exit(shipped.ok ? 0 : 1);
