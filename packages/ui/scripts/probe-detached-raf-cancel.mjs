/**
 * Does `cancelAnimationFrame.bind(globalThis)` still cancel a real frame, in a
 * real browser?
 *
 * WHY THIS EXISTS
 *
 * Several teardown paths (`primitives/create-tween.ts`,
 * `primitives/use-sequencer.ts`, `primitives/use-audio-analysis.ts`,
 * `components/audio-visualizer/shader-canvas.tsx`,
 * `components/audio-visualizer/labs/lab-visualizer.tsx`) capture the function at
 * setup instead of resolving the global at dispose, because a host can delete the
 * DOM globals in between. That is a fix for an environment where the global is
 * GONE — and every one of those sites is an animation primitive whose normal home
 * is a browser where it never goes anywhere. So the fix has to be proven neutral
 * where it actually runs, not only in the jsdom teardown it was written for.
 *
 * It also settles the claim those files' comments lead with, which is the reason
 * the obvious fix is wrong: `window === globalThis`, so `const win = window`
 * captures the very object the keys are deleted from and fixes nothing.
 *
 * Run it:  node scripts/probe-detached-raf-cancel.mjs
 *
 * The negative control is load-bearing. "The frame did not fire" is also what you
 * measure when rAF never ran at all — in a headless page that throttled it, say —
 * so an uncancelled frame must be observed FIRING in the same page before any
 * "cancelled" reading means anything. Without it this probe would pass most
 * convincingly when it was measuring nothing.
 */
import { chromium, webkit } from 'playwright';

async function measure(engine, name) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    return await page.evaluate(async () => {
      const settle = () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
      const out = {};

      // The premise of the whole fix shape.
      out.windowIsGlobalThis = window === globalThis;

      // NEGATIVE CONTROL: rAF must actually fire here.
      let controlFired = false;
      requestAnimationFrame(() => { controlFired = true; });
      await settle();
      out.controlFired = controlFired;

      // What ships.
      const cancelFrame = cancelAnimationFrame.bind(globalThis);
      let boundFired = false;
      const idBound = requestAnimationFrame(() => { boundFired = true; });
      try { cancelFrame(idBound); out.boundThrew = null; } catch (e) { out.boundThrew = String(e); }
      await settle();
      out.boundCancelled = !boundFired;

      // The same call detached but NOT bound — what the `.bind` is insurance
      // against. WebIDL says an undefined `this` falls back to the global, so
      // this is expected to work too; the bind costs nothing and does not
      // depend on that.
      const detached = cancelAnimationFrame;
      let detachedFired = false;
      const idDetached = requestAnimationFrame(() => { detachedFired = true; });
      try { detached(idDetached); out.detachedThrew = null; } catch (e) { out.detachedThrew = String(e); }
      await settle();
      out.detachedCancelled = !detachedFired;

      return out;
    });
  } finally {
    await browser.close();
  }
}

const engines = [[chromium, 'chromium'], [webkit, 'webkit']];
let failed = false;

for (const [engine, name] of engines) {
  const r = await measure(engine, name);
  const ok =
    r.windowIsGlobalThis === true &&
    r.controlFired === true &&
    r.boundCancelled === true &&
    r.boundThrew === null;
  if (!ok) failed = true;
  console.log(`${name}:`);
  console.log(`  window === globalThis      ${r.windowIsGlobalThis}   <- why \`const win = window\` cannot work`);
  console.log(`  control frame fired        ${r.controlFired}   <- without this, nothing below means anything`);
  console.log(`  bound cancel worked        ${r.boundCancelled}   threw: ${r.boundThrew}`);
  console.log(`  detached (unbound) worked  ${r.detachedCancelled}   threw: ${r.detachedThrew}`);
  console.log(`  => ${ok ? 'PASS' : 'FAIL'}`);
}

process.exit(failed ? 1 : 0);
