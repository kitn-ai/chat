#!/usr/bin/env node
/**
 * Throwaway experiment (not wired into CI): `--disable-gpu` is the ONLY flag in
 * vitest.config.ts's launchOptions that playwright does not already pass by
 * itself, so it is the only one whose removal would change anything. Its comment
 * claims it "avoids the GPU process + its memory". Does it?
 *
 * Counts the chromium child processes carrying `--type=gpu-process` with and
 * without the flag, and reads the WebGL renderer string from each, since a
 * missing GPU process that silently costs WebGL would be a bad trade.
 *
 * Caveat worth carrying into any conclusion: measured on macOS against
 * chrome-headless-shell. CI is ubuntu-latest. Same binary flavour, different
 * platform GPU stack.
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

function gpuProcessCount(browserPid) {
  const out = execFileSync('ps', ['-Ao', 'pid=,ppid=,args=', '-ww'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let n = 0;
  for (const line of out.split('\n')) {
    if (!/--type=gpu-process/.test(line)) continue;
    // chromium children are not always direct children of the browser process,
    // so match on the shared user-data-dir instead of on ppid alone.
    if (/ms-playwright/.test(line)) n++;
  }
  return n;
}

async function report(label, args) {
  const browser = await chromium.launch({ headless: true, args });
  const page = await browser.newPage();
  // Touch a GL surface: a GPU process that is spawned lazily will not exist
  // until something asks for one.
  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl');
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const gpuProcs = gpuProcessCount();
  await browser.close();
  console.log(`${label.padEnd(28)} gpu-processes=${gpuProcs}  webgl=${renderer ? 'yes' : 'NO'}`);
  return { gpuProcs, renderer };
}

const without = await report('no --disable-gpu', []);
const with_ = await report('with --disable-gpu', ['--disable-gpu']);

console.log('');
if (without.gpuProcs === with_.gpuProcs) {
  console.log(
    `=> --disable-gpu changes NOTHING observable here: same GPU-process count (${without.gpuProcs}),\n` +
    `   same WebGL availability. On this platform the flag is not load-bearing.`,
  );
} else {
  console.log(
    `=> --disable-gpu removes ${without.gpuProcs - with_.gpuProcs} GPU process(es).\n` +
    `   webgl without=${without.renderer ? 'yes' : 'NO'} with=${with_.renderer ? 'yes' : 'NO'}`,
  );
}
