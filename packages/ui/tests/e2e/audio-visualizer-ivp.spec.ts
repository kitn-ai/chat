import { test, expect, chromium, type Page, type Locator } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Task 18 — independent visual verification for the audio-visualizer epic.
 *
 * Drives the REAL `<kai-audio-visualizer>` custom element (not the bare Solid
 * component) via Storybook's dev server: shadow DOM, `defineWebComponent`'s
 * theme wiring, the dynamic shader-chunk import boundary, and live WebGL —
 * none of which jsdom unit tests can exercise. This is the first pass to see
 * the shader variants (`wave`, `aurora`, `custom`) run in a browser at all.
 *
 * Every test appends its own `<kai-audio-visualizer>` elements straight to
 * `document.body` on an anchor story page (any story works: `.storybook/
 * preview.ts` awaits `elementsReady` before every story renders, so the
 * kai-* custom elements are already registered by the time the anchor
 * story settles). This sidesteps two problems at once: it needs no new
 * source file (no fixture story), and it exercises the exact registration
 * path a consumer hits.
 *
 * GOTCHA — Storybook's own theme-sync observer (`preview.ts`) walks every
 * `kai-*` element on the page and force-sets its `theme` ATTRIBUTE to match
 * the Storybook manager's dark-mode toggle, any time `document.body`'s
 * subtree changes (any `appendChild` anywhere) or `document.documentElement`'s
 * `class` attribute changes. Setting `theme` as part of the SAME script that
 * appends the element loses the race: the observer's `requestAnimationFrame`
 * -scheduled sync always runs after and stomps it back to the manager's
 * theme (light, by default). The fix used throughout this file: append
 * first, wait for that one sync pass to finish, THEN set the desired `theme`
 * attribute as an independent step. A plain attribute set on the element
 * itself matches neither of the observer's watched mutations (body childList,
 * `<html>` class), so it sticks — as long as nothing else appends to `body`
 * afterward in the same test.
 *
 * Run: `npm run test:audio-visualizer`
 */

const SHOT_ROOT =
  '/private/tmp/claude-501/-Users-home-Projects-kitn-ai-kitn-chat/7992d800-96a5-48f7-882d-22fafce9017d/scratchpad/av-ivp';
const DIRS = {
  matrix: join(SHOT_ROOT, '1-matrix'),
  transparency: join(SHOT_ROOT, '3-transparency'),
  lazychunk: join(SHOT_ROOT, '4-lazy-chunk'),
  webgl: join(SHOT_ROOT, '5-webgl-fallback'),
  reduced: join(SHOT_ROOT, '6-reduced-motion'),
  theme: join(SHOT_ROOT, '7-theme-override'),
  audio: join(SHOT_ROOT, '8-element-audio'),
  mic: join(SHOT_ROOT, '9-mic'),
  recompile: join(SHOT_ROOT, '10-recompile-guard'),
};
for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });

// Points at the real "Bar" story specifically -- do not swap this for a
// shader story (wave/aurora/custom) casually. This anchor's only job is to
// get the page to load so preview.ts registers the kai-* custom elements
// (see the module doc above: "any story works" for that purpose, every
// test appends its own elements rather than depending on the anchor's
// content). Previously pointed at "...--default", which was never a real
// story id in this file (audio-visualizer.stories.tsx has no `Default`
// export) -- caught by the strengthened drift guard
// (tests/stories/e2e-story-fixtures.test.ts), harmless in practice only
// because nothing here ever depended on that story actually rendering.
// "Bar" is the DOM-variant default: cheapest real anchor, costs no WebGL
// context. A shader story would be a WORSE choice now, not just an
// unnecessary one: wave/aurora/custom defer their compile until visible,
// so anchoring on one adds a real (if small) visibility/compile dependency
// this file's own tests don't need and shouldn't pay for.
const STORY_ANCHOR = '/iframe.html?id=components-elements-audiovisualizer--bar&viewMode=story';

const VARIANTS = ['bar', 'grid', 'radial', 'wave', 'aurora', 'custom'] as const;
const STATES = ['idle', 'connecting', 'listening', 'thinking', 'speaking'] as const;
const SHADER_VARIANTS = new Set(['wave', 'aurora', 'custom']);

/** Premultiplied soft circle, used to give `variant="custom"` something to
 *  draw (it renders NOTHING without a `shader` prop — `CustomVisualizer`'s
 *  own `Show` guard on `props.shader?.fragment`). Mirrors the premultiplied
 *  contract every shipped shader must follow. */
const CUSTOM_SHADER = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float d = length(uv - vec2(0.5));
  float alpha = smoothstep(0.5, 0.05, d) * uIntensity;
  fragColor = vec4(uColor * alpha, alpha);
}`;

/**
 * Force every WebGL context on the page to `preserveDrawingBuffer: true`.
 *
 * WITHOUT this, `gl.readPixels` called from a SEPARATE Playwright
 * `evaluate()` (i.e. any out-of-band inspection, not the shader's own draw
 * call) reads back all-zero: the default `preserveDrawingBuffer: false`
 * lets the browser clear the drawing buffer right after it composites a
 * frame, and by the time an async `evaluate()` runs, that clear has already
 * happened. Verified empirically on this exact setup: a trivial always-
 * opaque-red `<ShaderCanvas fragment="fragColor = vec4(1,0,0,1)">`
 * genuinely painted red on screen (confirmed via `locator.screenshot()`,
 * matching a Playwright screenshot pixel-for-pixel), while `gl.readPixels`
 * from a following `evaluate()` call read `[0,0,0,0]` on the SAME canvas at
 * the SAME instant -- not a rendering defect, a buffer-retention artifact
 * of the read technique. This patch (installed before navigation, so it's
 * in place before any `getContext('webgl')` call the app makes) is what
 * makes every `readPixels`-based assertion in this file trustworthy. It is
 * a test-environment-only change -- it alters WHAT THE TEST CAN OBSERVE
 * about the buffer between frames, not how the app renders. Screenshot-
 * based assertions (`canvas.screenshot()` / `page.screenshot()`) were never
 * affected by this, since they capture the compositor's actual presented
 * frame either way -- confirmed by the very screenshot that exposed the bug.
 */
async function installPreserveDrawingBuffer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = function (type: string, options?: any) {
      if (type === 'webgl' || type === 'experimental-webgl') {
        options = { ...(options ?? {}), preserveDrawingBuffer: true };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (orig as any).call(this, type, options);
    };
  });
}

/** Navigate to any story; `preview.ts` awaits `elementsReady` before it
 *  renders, so kai-* custom elements are registered by the time it settles.
 *  Also waits for Storybook's own `sb-loader` overlay (`body.sb-show-main`)
 *  to clear -- it sits on top of the whole viewport (opaque) until the
 *  story's chunk finishes its first compile, which otherwise blanks out
 *  every screenshot taken too early even though elements mounted underneath
 *  it already have real layout (bounding boxes are unaffected by paint
 *  order, so structural assertions passed while every early screenshot was
 *  just the spinner -- caught by actually looking at the first screenshot).
 *  Also installs `installPreserveDrawingBuffer` -- see its own doc. */
async function gotoAnchor(page: Page): Promise<void> {
  await installPreserveDrawingBuffer(page);
  await page.goto(STORY_ANCHOR);
  await page.waitForFunction(() => !!customElements.get('kai-audio-visualizer'));
  await page.waitForFunction(() => document.body.classList.contains('sb-show-main'), { timeout: 15_000 });
}

interface MountSpec {
  id: string;
  variant: string;
  state?: string;
  size?: string;
  color?: string;
  barCount?: number;
  shader?: { fragment: string };
}

/** Mount N `<kai-audio-visualizer>` elements under one wrapper, in a SINGLE
 *  body mutation (one `appendChild`), returning their locators. `theme` is
 *  deliberately NOT settable here — see the module doc's GOTCHA. */
async function mountRow(page: Page, specs: MountSpec[]): Promise<Record<string, Locator>> {
  await page.evaluate((specs) => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-test-row', 'true');
    wrap.style.display = 'flex';
    wrap.style.gap = '32px';
    wrap.style.alignItems = 'flex-end';
    wrap.style.padding = '16px';
    for (const s of specs) {
      const cell = document.createElement('div');
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems = 'center';
      cell.style.gap = '6px';
      const el = document.createElement('kai-audio-visualizer');
      el.setAttribute('data-test-id', s.id);
      el.setAttribute('variant', s.variant);
      if (s.state) el.setAttribute('state', s.state);
      if (s.size) el.setAttribute('size', s.size);
      if (s.color) el.setAttribute('color', s.color);
      if (s.barCount != null) el.setAttribute('bar-count', String(s.barCount));
      if (s.shader) (el as unknown as { shader: unknown }).shader = s.shader;
      const label = document.createElement('code');
      label.textContent = `${s.variant}/${s.state ?? 'idle'}`;
      label.style.fontSize = '10px';
      label.style.opacity = '0.6';
      cell.appendChild(el);
      cell.appendChild(label);
      wrap.appendChild(cell);
    }
    document.body.appendChild(wrap);
  }, specs);

  // Let preview.ts's theme-sync observer finish its one pass before this
  // function's caller sets an explicit `theme` — see the module doc.
  await page.waitForTimeout(150);

  const result: Record<string, Locator> = {};
  for (const s of specs) result[s.id] = page.locator(`kai-audio-visualizer[data-test-id="${s.id}"]`);
  return result;
}

/** Set `theme` on already-mounted elements. Safe to call any time AFTER
 *  `mountRow` settles, as long as nothing else appends to `body` after. */
async function setTheme(page: Page, ids: string[], theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(
    ({ ids, theme }) => {
      for (const id of ids) {
        document.querySelector(`[data-test-id="${id}"]`)?.setAttribute('theme', theme);
      }
    },
    { ids, theme },
  );
}

async function waitShaderReady(loc: Locator): Promise<void> {
  await loc.locator('canvas').waitFor({ state: 'attached', timeout: 10_000 });
}
async function waitDomReady(loc: Locator): Promise<void> {
  await loc.locator('[part~="bar"], [part~="cell"]').first().waitFor({ state: 'attached', timeout: 10_000 });
}

/**
 * Read a full horizontal strip (the whole width, one row of pixels) in a
 * SINGLE `gl.readPixels` call, at the given fraction of canvas height.
 *
 * A sparse NxN grid (see `sampleCanvas` below) is fine for a blob-shaped
 * fragment (aurora, a soft circle) but can legitimately step over a THIN
 * 1-3px line (the wave oscilloscope shader) at `size="md"` (112px), landing
 * every sample a few pixels off the line's actual y position and reporting
 * a false "blank". A full-width strip at the vertical center is cheap (one
 * GL call) and guaranteed to cross a horizontal line wherever it sits.
 */
async function sampleCenterStrip(canvasLoc: Locator, yFraction = 0.5): Promise<boolean> {
  return canvasLoc.evaluate((canvas: HTMLCanvasElement, yFraction: number) => {
    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const w = canvas.width;
    const y = Math.min(canvas.height - 1, Math.floor(canvas.height * yFraction));
    const buf = new Uint8Array(w * 4);
    gl.readPixels(0, y, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (let i = 0; i < w; i++) if (buf[i * 4 + 3]! > 5) return true;
    return false;
  }, yFraction);
}

/** Sample a grid of pixels straight off the canvas's OWN WebGL drawing
 *  buffer via `gl.readPixels` (calling `getContext('webgl')` again on an
 *  already-webgl canvas returns the SAME live context, per spec). This is
 *  the raw premultiplied RGBA the fragment shader wrote, before the browser
 *  composites it over the page background — exactly what the
 *  `premultipliedAlpha: true` contract governs. Returns `null` if no WebGL
 *  context exists (fallback case). */
async function sampleCanvas(
  canvasLoc: Locator,
  grid = 6,
): Promise<{ x: number; y: number; r: number; g: number; b: number; a: number }[] | null> {
  return canvasLoc.evaluate((canvas: HTMLCanvasElement, grid: number) => {
    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const w = canvas.width;
    const h = canvas.height;
    const out: { x: number; y: number; r: number; g: number; b: number; a: number }[] = [];
    const buf = new Uint8Array(4);
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const x = Math.min(w - 1, Math.floor(((i + 0.5) / grid) * w));
        const y = Math.min(h - 1, Math.floor(((j + 0.5) / grid) * h));
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        out.push({ x, y, r: buf[0]!, g: buf[1]!, b: buf[2]!, a: buf[3]! });
      }
    }
    return out;
  }, grid);
}

/** Read a uniform's live value straight off the GPU program bound to this
 *  canvas's WebGL context (`gl.getParameter(CURRENT_PROGRAM)` + `getUniform`)
 *  — a precise, non-visual proof of what the shader is actually being fed,
 *  independent of pixel color interpretation. */
async function readUniform(canvasLoc: Locator, name: string): Promise<number | number[] | null> {
  return canvasLoc.evaluate((canvas: HTMLCanvasElement, name: string) => {
    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    if (!program) return null;
    const loc = gl.getUniformLocation(program, name);
    if (!loc) return null;
    const v = gl.getUniform(program, loc);
    return v && typeof v === 'object' && 'length' in v ? Array.from(v as Float32Array) : (v as number);
  }, name);
}

// ─────────────────────────────────────────────────────────────────────────
// Check 1 + 2: full matrix (structure) and shader compile/paint (console +
// non-blank canvas). One test per variant: mounts all 5 states at once,
// screenshots a light contact sheet, flips theme, screenshots a dark one.
// ─────────────────────────────────────────────────────────────────────────
test.describe('Check 1+2: full matrix, all states, light+dark, shader compiles', () => {
  for (const variant of VARIANTS) {
    test(`${variant}: 5 states render, light+dark, ${SHADER_VARIANTS.has(variant) ? 'shader compiles and paints' : 'DOM parts present'}`, async ({
      page,
    }) => {
      const consoleIssues: string[] = [];
      const pageErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleIssues.push(`[${msg.type()}] ${msg.text()}`);
        }
      });
      page.on('pageerror', (err) => pageErrors.push(String(err)));

      await gotoAnchor(page);

      const specs: MountSpec[] = STATES.map((s) => ({
        id: `matrix-${variant}-${s}`,
        variant,
        state: s,
        size: 'md',
        ...(variant === 'custom' ? { shader: { fragment: CUSTOM_SHADER } } : {}),
      }));
      const locs = await mountRow(page, specs);

      for (const s of STATES) {
        const loc = locs[`matrix-${variant}-${s}`]!;
        if (SHADER_VARIANTS.has(variant)) {
          await waitShaderReady(loc);
          const canvas = loc.locator('canvas');
          const box = await canvas.boundingBox();
          const width = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
          expect(width, `${variant}/${s} canvas.width`).toBeGreaterThan(0);
          expect(box?.width ?? 0, `${variant}/${s} canvas layout width`).toBeGreaterThan(0);
          const samples = await sampleCanvas(canvas, 8);
          expect(samples, `${variant}/${s} has a WebGL context`).not.toBeNull();
          const gridHit = samples!.some((p) => p.a > 5);
          // A sparse 8x8 grid can legitimately miss a thin 1-3px line (wave);
          // a full-width center-row scan (cheap: one GL call) catches it
          // even when the grid does not. Either counts as "has content".
          const stripHit = await sampleCenterStrip(canvas, 0.5);
          const hasContent = gridHit || stripHit;
          expect(
            hasContent,
            `${variant}/${s}: canvas is BLANK — no pixel with alpha>5 across an 8x8 grid OR the center row`,
          ).toBe(true);
        } else {
          await waitDomReady(loc);
          const parts = loc.locator('[part~="bar"], [part~="cell"]');
          const count = await parts.count();
          expect(count, `${variant}/${s} part count`).toBeGreaterThan(0);
          for (let i = 0; i < count; i++) {
            const box = await parts.nth(i).boundingBox();
            expect(box?.width ?? 0, `${variant}/${s} part ${i} width`).toBeGreaterThan(0);
            expect(box?.height ?? 0, `${variant}/${s} part ${i} height`).toBeGreaterThan(0);
          }
        }
      }

      // Settle any landing tweens before the light screenshot.
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(DIRS.matrix, `${variant}-light.png`) });

      await setTheme(
        page,
        STATES.map((s) => `matrix-${variant}-${s}`),
        'dark',
      );
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(DIRS.matrix, `${variant}-dark.png`) });

      if (SHADER_VARIANTS.has(variant)) {
        const badConsole = consoleIssues.filter(
          (m) =>
            /compile|link|shader|glsl|webgl/i.test(m) &&
            !/not available/i.test(m) &&
            // Benign GPU driver performance advisory triggered by THIS test's
            // own frequent synchronous gl.readPixels calls (a real cost of
            // sampling every frame this way), not a shader defect.
            !/GPU stall due to ReadPixels/i.test(m),
        );
        writeFileSync(
          join(DIRS.matrix, `${variant}-console.txt`),
          [`console issues:`, ...consoleIssues, ``, `page errors:`, ...pageErrors].join('\n'),
        );
        expect(badConsole, `${variant}: GLSL compile/link error in console`).toEqual([]);
        expect(pageErrors, `${variant}: uncaught page error`).toEqual([]);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Check 3: transparency + premultiplied edges, wave + aurora, 3 backgrounds.
// ─────────────────────────────────────────────────────────────────────────
test.describe('Check 3: shader transparency + premultiplied edges on 3 backgrounds', () => {
  const BACKGROUNDS: { name: string; css: string; rgb: [number, number, number] }[] = [
    { name: 'white', css: '#ffffff', rgb: [255, 255, 255] },
    { name: 'black', css: '#000000', rgb: [0, 0, 0] },
    { name: 'mid', css: '#808080', rgb: [128, 128, 128] },
  ];

  for (const variant of ['wave', 'aurora'] as const) {
    for (const bg of BACKGROUNDS) {
      test(`${variant} over ${bg.name} background: transparent outside, no dark fringe at the edge`, async ({
        page,
      }) => {
        await gotoAnchor(page);
        await page.evaluate((css) => {
          document.body.style.background = css;
          document.body.style.margin = '0';
        }, bg.css);

        const specs: MountSpec[] = [{ id: `edge-${variant}-${bg.name}`, variant, state: 'listening', size: 'lg' }];
        const locs = await mountRow(page, specs);
        const loc = locs[specs[0]!.id]!;
        await waitShaderReady(loc);
        await page.waitForTimeout(900); // let the landing tween settle to a stable shape

        const canvas = loc.locator('canvas');
        const w = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
        const h = await canvas.evaluate((c: HTMLCanvasElement) => c.height);

        // Outside the drawn geometry: the far corners of a centered aura/wave
        // should be fully transparent (alpha ~0), which composites to
        // exactly the page background regardless of what RGB sits under it.
        const corner = await canvas.evaluate(
          (c: HTMLCanvasElement, [w, h]: [number, number]) => {
            const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext;
            const buf = new Uint8Array(4);
            gl.readPixels(Math.floor(w * 0.03), Math.floor(h * 0.03), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            return { r: buf[0], g: buf[1], b: buf[2], a: buf[3] };
          },
          [w, h] as [number, number],
        );
        expect(
          corner.a,
          `${variant} over ${bg.name}: corner alpha should be ~0 (transparent), got ${JSON.stringify(corner)}`,
        ).toBeLessThan(8);

        // Scan a horizontal line through vertical center, left edge to
        // center, to find the soft boundary and check for a dark fringe:
        // the actual browser composite for premultipliedAlpha:true is
        // `displayed = premultiplied_rgb + (1 - a) * background`. A
        // correctly premultiplied edge interpolates cleanly between the
        // background and the foreground color as alpha rises — it can
        // never dip DARKER than both endpoints. An unpremultiplied
        // (straight-alpha) edge composited under that same browser formula
        // does exactly that: a visible dark ring between the transparent
        // background and the fully-opaque core.
        const scan = await canvas.evaluate(
          (c: HTMLCanvasElement, [w, h]: [number, number]) => {
            const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext;
            const cy = Math.floor(h / 2);
            const buf = new Uint8Array(4);
            const out: { x: number; r: number; g: number; b: number; a: number }[] = [];
            const steps = 40;
            for (let i = 0; i <= steps; i++) {
              const x = Math.floor((i / steps) * (w - 1));
              gl.readPixels(x, cy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
              out.push({ x, r: buf[0]!, g: buf[1]!, b: buf[2]!, a: buf[3]! });
            }
            return out;
          },
          [w, h] as [number, number],
        );

        const [bgR, bgG, bgB] = bg.rgb;
        const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const bgLum = luminance(bgR, bgG, bgB);
        const composites = scan.map((p) => {
          // Premultiplied composite the browser actually performs.
          const a = p.a / 255;
          const r = p.r + (1 - a) * bgR;
          const g = p.g + (1 - a) * bgG;
          const b = p.b + (1 - a) * bgB;
          return { x: p.x, a: p.a, lum: luminance(r, g, b) };
        });
        // The fully-opaque core reference (max-alpha sample) and background
        // reference (min-alpha sample) bound the expected luminance range.
        const maxAlphaSample = composites.reduce((m, c) => (c.a > m.a ? c : m), composites[0]!);
        const minAlphaSample = composites.reduce((m, c) => (c.a < m.a ? c : m), composites[0]!);
        const floor = Math.min(bgLum, maxAlphaSample.lum) - 12; // small tolerance for AA/rounding
        const dip = composites.filter((c) => c.lum < floor);

        writeFileSync(
          join(DIRS.transparency, `${variant}-${bg.name}-scan.json`),
          JSON.stringify({ bg: bg.rgb, corner, maxAlphaSample, minAlphaSample, composites }, null, 2),
        );

        expect(
          dip,
          `${variant} over ${bg.name}: dark-fringe dip detected — some edge pixel composited DARKER ` +
            `(lum<${floor.toFixed(1)}) than both the background (lum=${bgLum.toFixed(1)}) and the opaque core ` +
            `(lum=${maxAlphaSample.lum.toFixed(1)}). Full scan: ${JSON.stringify(dip)}`,
        ).toEqual([]);

        await page.screenshot({ path: join(DIRS.transparency, `${variant}-${bg.name}-full.png`) });
        // Zoomed crop around the canvas for a human "zoom in and check".
        const box = await canvas.boundingBox();
        if (box) {
          await page.screenshot({
            path: join(DIRS.transparency, `${variant}-${bg.name}-zoom.png`),
            clip: { x: box.x, y: box.y, width: box.width, height: box.height },
          });
        }
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Check 4: the lazy shader chunk actually fetches over the network.
// ─────────────────────────────────────────────────────────────────────────
test.describe('Check 4: lazy shader chunk fetches over the network', () => {
  test('switching to wave, then aurora, each fetch a distinct new JS module', async ({ page }) => {
    await gotoAnchor(page);

    const requested: string[] = [];
    page.on('request', (req) => requested.push(req.url()));

    const locs = await mountRow(page, [{ id: 'lazy-1', variant: 'bar', state: 'idle', size: 'md' }]);
    const loc = locs['lazy-1']!;
    await waitDomReady(loc);

    const before = requested.length;
    await loc.evaluate((el) => el.setAttribute('variant', 'wave'));
    await waitShaderReady(loc);
    await page.waitForTimeout(300);
    const afterWave = requested.slice(before);
    const waveChunks = afterWave.filter((u) => /variant-wave/i.test(u));

    const beforeAurora = requested.length;
    await loc.evaluate((el) => el.setAttribute('variant', 'aurora'));
    await waitShaderReady(loc);
    await page.waitForTimeout(300);
    const afterAurora = requested.slice(beforeAurora);
    const auroraChunks = afterAurora.filter((u) => /variant-aurora/i.test(u));

    writeFileSync(
      join(DIRS.lazychunk, 'requests.json'),
      JSON.stringify({ waveChunks, auroraChunks, afterWaveAll: afterWave, afterAuroraAll: afterAurora }, null, 2),
    );

    expect(waveChunks.length, `no request matching variant-wave; full log: ${JSON.stringify(afterWave)}`).toBeGreaterThan(0);
    expect(
      auroraChunks.length,
      `no request matching variant-aurora; full log: ${JSON.stringify(afterAurora)}`,
    ).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Check 5: WebGL fallback to bars.
// ─────────────────────────────────────────────────────────────────────────
test.describe('Check 5: WebGL unavailable falls back to bars', () => {
  test('aurora renders bars, not a blank canvas, and logs a warning', async ({ page }) => {
    const consoleWarnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning' || msg.type() === 'error') consoleWarnings.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLCanvasElement.prototype as any).getContext = function (type: string, ...args: unknown[]) {
        if (type === 'webgl' || type === 'experimental-webgl') return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (orig as any).call(this, type, ...args);
      };
    });

    await gotoAnchor(page);
    const locs = await mountRow(page, [{ id: 'webgl-fallback', variant: 'aurora', state: 'listening', size: 'md' }]);
    const loc = locs['webgl-fallback']!;
    await waitDomReady(loc); // must fall back to bars, which carry part="bar" (or "bar highlighted")

    const canvasCount = await loc.locator('canvas').count();
    expect(canvasCount, 'a canvas should NOT be present once the shader reports unavailable').toBe(0);

    const bars = loc.locator('[part~="bar"]');
    const barCount = await bars.count();
    expect(barCount, 'fallback bar count').toBeGreaterThan(0);
    for (let i = 0; i < barCount; i++) {
      const box = await bars.nth(i).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThan(0);
    }

    const warned = consoleWarnings.some((m) => /shader unavailable|not available/i.test(m));
    writeFileSync(join(DIRS.webgl, 'console.txt'), consoleWarnings.join('\n'));
    expect(warned, `expected a console warning about the shader being unavailable; got: ${JSON.stringify(consoleWarnings)}`).toBe(
      true,
    );

    await page.screenshot({ path: join(DIRS.webgl, 'aurora-fallback-bars.png') });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Check 6: reduced motion freezes both shader variants (uSpeed=0, byte-
// identical frames) and radial+thinking drops animate-spin.
// ─────────────────────────────────────────────────────────────────────────
test.describe('Check 6: prefers-reduced-motion freezes shaders and drops animate-spin', () => {
  for (const variant of ['aurora', 'wave'] as const) {
    test(`${variant}: uSpeed pinned to 0 and two frames a second apart are byte-identical`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoAnchor(page);
      const locs = await mountRow(page, [
        { id: `reduced-${variant}`, variant, state: 'thinking', size: 'md' },
      ]);
      const loc = locs[`reduced-${variant}`]!;
      await waitShaderReady(loc);
      await page.waitForTimeout(400);

      const canvas = loc.locator('canvas');
      const uSpeed = await readUniform(canvas, 'uSpeed');
      expect(uSpeed, `${variant} uSpeed under frozen`).toBe(0);

      const frame1 = await canvas.screenshot();
      await page.waitForTimeout(1000);
      const frame2 = await canvas.screenshot();
      writeFileSync(join(DIRS.reduced, `${variant}-frame1.png`), frame1);
      writeFileSync(join(DIRS.reduced, `${variant}-frame2.png`), frame2);
      expect(frame1.equals(frame2), `${variant}: two frames 1s apart under reduced motion should be byte-identical`).toBe(
        true,
      );
    });
  }

  test('radial + thinking: no animate-spin under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoAnchor(page);
    const locs = await mountRow(page, [{ id: 'reduced-radial', variant: 'radial', state: 'thinking', size: 'md' }]);
    const loc = locs['reduced-radial']!;
    await waitDomReady(loc);
    const wrapper = loc.locator('[data-kai-state="thinking"]');
    const cls = await wrapper.getAttribute('class');
    writeFileSync(join(DIRS.reduced, 'radial-thinking-class.txt'), cls ?? '(null)');
    expect(cls ?? '', 'radial+thinking wrapper class under reduced motion').not.toContain('animate-spin');
    await page.screenshot({ path: join(DIRS.reduced, 'radial-thinking-frozen.png') });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Check 7: explicit `theme` wins over the OS `prefers-color-scheme`.
// ─────────────────────────────────────────────────────────────────────────
test.describe('Check 7: explicit theme overrides OS dark preference', () => {
  test('aurora theme="light" under OS-dark uses the LIGHT pipeline; theme="dark" differs', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoAnchor(page);

    const locs = await mountRow(page, [
      { id: 'theme-light', variant: 'aurora', state: 'listening', size: 'lg' },
      { id: 'theme-dark', variant: 'aurora', state: 'listening', size: 'lg' },
    ]);
    const lightLoc = locs['theme-light']!;
    const darkLoc = locs['theme-dark']!;
    // Let the shader chunk load and WebGL initialize BEFORE stamping the
    // explicit theme — this reliably outlasts preview.ts's observer resync
    // (a fixed short wait raced it: the dark element was sometimes still
    // reset back to "light" by a late-firing sync pass after being set).
    await waitShaderReady(lightLoc);
    await waitShaderReady(darkLoc);
    await setTheme(page, ['theme-light'], 'light');
    await setTheme(page, ['theme-dark'], 'dark');
    await page.waitForTimeout(900);

    // Re-assert theme stuck (paranoia — confirms the mountRow/setTheme
    // sequencing actually worked and wasn't clobbered).
    expect(await lightLoc.getAttribute('theme')).toBe('light');
    expect(await darkLoc.getAttribute('theme')).toBe('dark');

    const uThemeLight = await readUniform(lightLoc.locator('canvas'), 'uTheme');
    const uThemeDark = await readUniform(darkLoc.locator('canvas'), 'uTheme');

    writeFileSync(
      join(DIRS.theme, 'uniforms.txt'),
      `OS preference emulated: dark\ntheme="light" -> uTheme=${uThemeLight} (expect 1 = light pipeline)\ntheme="dark" -> uTheme=${uThemeDark} (expect 0 = dark pipeline)\n`,
    );

    // aurora.glsl.ts / variant-aurora.tsx contract: uTheme 1 = light
    // pipeline, 0 = dark pipeline. theme="light" under an OS-dark OS
    // preference must still resolve to 1 -- proving the explicit attribute,
    // not the media query, drives the shader's colour branch.
    expect(uThemeLight, 'theme="light" under OS-dark should select the LIGHT pipeline (uTheme=1)').toBe(1);
    expect(uThemeDark, 'theme="dark" under OS-dark should select the DARK pipeline (uTheme=0)').toBe(0);
    expect(uThemeLight).not.toBe(uThemeDark);

    await page.screenshot({ path: join(DIRS.theme, 'aurora-light-vs-dark-under-os-dark.png') });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Check 8: element audio isn't silenced, and doesn't double when a second
// visualizer taps the same element.
// ─────────────────────────────────────────────────────────────────────────
function buildWavBuffer(durationSec: number, freq = 440, sampleRate = 44100): Buffer {
  const numSamples = Math.floor(durationSec * sampleRate);
  const blockAlign = 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.8;
    const val = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
    buffer.writeInt16LE(val, 44 + i * 2);
  }
  return buffer;
}

function buildWavBase64(durationSec: number, freq = 440, sampleRate = 44100): string {
  return buildWavBuffer(durationSec, freq, sampleRate).toString('base64');
}

test.describe('Check 8: element audio not silenced, not doubled', () => {
  test('audio plays, an OfflineAudioContext confirms the fixture is non-silent, and a second visualizer does not double the amplitude', async ({
    page,
  }) => {
    // 3000 Hz, not a "nice" 440 Hz A440: useAudioAnalysis's default loPass/
    // hiPass (100/200) are BIN INDICES at fftSize 2048 / 44100 Hz, i.e. a
    // ~2153-4306 Hz window (see audio-bands.ts) -- a 440 Hz tone falls well
    // below it and reads as a flat 0 on every bar/band read, which looks
    // identical to "silenced" despite the audio genuinely playing. 3000 Hz
    // lands inside the analysed window so the bar-height assertions below
    // actually exercise real analyser output, not a false negative from an
    // out-of-band test tone.
    const wavBase64 = buildWavBase64(3, 3000);
    const dataUri = `data:audio/wav;base64,${wavBase64}`;

    await gotoAnchor(page);

    // 1) OfflineAudioContext control: prove the WAV fixture itself is really
    // audible, not silence with a valid-looking header.
    const offlinePeak = await page.evaluate(async (uri) => {
      const res = await fetch(uri);
      const arrayBuffer = await res.arrayBuffer();
      const OfflineCtor = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext })
        .OfflineAudioContext;
      const octx = new OfflineCtor(1, 44100 * 3, 44100);
      const decoded = await octx.decodeAudioData(arrayBuffer.slice(0));
      const src = octx.createBufferSource();
      src.buffer = decoded;
      src.connect(octx.destination);
      src.start(0);
      const rendered = await octx.startRendering();
      const data = rendered.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
      return peak;
    }, dataUri);
    expect(offlinePeak, 'OfflineAudioContext peak amplitude of the WAV fixture').toBeGreaterThan(0.1);

    // Instrument the audio graph BEFORE anything touches it, so the count
    // captures the FIRST (real) createMediaElementSource/connect call from
    // el1's own mount, not just whatever happens afterward. Installing this
    // any later (e.g. right before mounting the second visualizer) would
    // miss that first call entirely and make "0 additional calls for el2"
    // indistinguishable from "1 call total" -- exactly the gap that let an
    // earlier draft of this test assert the wrong number and still "pass"
    // for the wrong reason.
    await page.evaluate(() => {
      const w = window as unknown as {
        __avCalls?: { createMediaElementSource: number; connectDestination: number };
      };
      w.__avCalls = { createMediaElementSource: 0, connectDestination: 0 };
      const AC = (window as unknown as { AudioContext: typeof AudioContext }).AudioContext;
      const origCreate = AC.prototype.createMediaElementSource;
      AC.prototype.createMediaElementSource = function (...args: Parameters<typeof origCreate>) {
        w.__avCalls!.createMediaElementSource++;
        return origCreate.apply(this, args);
      };
      const AN = (window as unknown as { AudioNode: { prototype: AudioNode } }).AudioNode;
      const origConnect = AN.prototype.connect;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AN.prototype as any).connect = function (this: AudioNode, dest: any, ...rest: any[]) {
        if (dest instanceof AudioDestinationNode) w.__avCalls!.connectDestination++;
        return origConnect.apply(this, [dest, ...rest] as never);
      };
    });

    // 2) Mount ONE visualizer against a real <audio> element, play it, and
    // confirm playback is actually running (not muted with no error).
    const setup = await page.evaluate(async (uri) => {
      const audio = document.createElement('audio');
      audio.id = 'test-audio-el';
      audio.src = uri;
      audio.loop = true;
      document.body.appendChild(audio);

      const el1 = document.createElement('kai-audio-visualizer');
      el1.setAttribute('data-test-id', 'audio-vis-1');
      el1.setAttribute('variant', 'bar');
      el1.setAttribute('state', 'speaking');
      el1.setAttribute('size', 'md');
      (el1 as unknown as { audioElement: HTMLMediaElement }).audioElement = audio;
      document.body.appendChild(el1);

      await audio.play();
      return { paused: audio.paused };
    }, dataUri);
    expect(setup.paused, 'audio.paused right after play()').toBe(false);

    await page.waitForTimeout(600);
    const playback = await page.evaluate(() => {
      const audio = document.getElementById('test-audio-el') as HTMLAudioElement;
      return { paused: audio.paused, currentTime: audio.currentTime };
    });
    expect(playback.paused, 'audio.paused after 600ms').toBe(false);
    expect(playback.currentTime, 'audio.currentTime should have advanced past 0.1s').toBeGreaterThan(0.1);

    // Sample the first visualizer's rendered amplitude BEFORE mounting a
    // second consumer of the same element.
    const readBars = async () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-test-id="audio-vis-1"]');
        const bars = el?.shadowRoot?.querySelectorAll('[part~="bar"]');
        if (!bars) return [];
        return Array.from(bars).map((b) => parseFloat((b as HTMLElement).style.height) || 0);
      });

    // Average over a short window to smooth analyser-frame noise.
    const sampleAvg = async (n: number) => {
      const samples: number[][] = [];
      for (let i = 0; i < n; i++) {
        samples.push(await readBars());
        await page.waitForTimeout(120);
      }
      const len = samples[0]?.length ?? 0;
      const avg: number[] = [];
      for (let i = 0; i < len; i++) avg.push(samples.reduce((s, arr) => s + (arr[i] ?? 0), 0) / samples.length);
      return avg;
    };

    const before = await sampleAvg(5);

    // 3) Mount a SECOND visualizer against the same element. The audio-graph
    // instrumentation installed above (before el1 even mounted) is what
    // tells apart "cached, no second call" from "never instrumented in time
    // to see the first one" -- see its own comment.
    await page.evaluate(() => {
      const audio = document.getElementById('test-audio-el') as HTMLAudioElement;
      const el2 = document.createElement('kai-audio-visualizer');
      el2.setAttribute('data-test-id', 'audio-vis-2');
      el2.setAttribute('variant', 'bar');
      el2.setAttribute('state', 'speaking');
      el2.setAttribute('size', 'md');
      (el2 as unknown as { audioElement: HTMLMediaElement }).audioElement = audio;
      document.body.appendChild(el2);
    });
    await page.waitForTimeout(500);

    const after = await sampleAvg(5);
    const calls = await page.evaluate(
      () => (window as unknown as { __avCalls: { createMediaElementSource: number; connectDestination: number } })
        .__avCalls,
    );

    const beforeMax = Math.max(...before, 0.0001);
    const afterMax = Math.max(...after, 0.0001);
    const ratio = afterMax / beforeMax;

    writeFileSync(
      join(DIRS.audio, 'evidence.txt'),
      [
        `offlinePeak=${offlinePeak}`,
        `before(avg bar heights %)=${JSON.stringify(before)}`,
        `after(avg bar heights %, second visualizer mounted)=${JSON.stringify(after)}`,
        `ratio(after/before)=${ratio}`,
        `createMediaElementSource calls (should be 1, cached across both mounts)=${calls.createMediaElementSource}`,
        `connect(destination) calls (should be 1 -- doubling this doubles playback volume)=${calls.connectDestination}`,
      ].join('\n'),
    );

    // Sanity guard on the regression check itself: if `before` never
    // registered a real signal (e.g. the test tone falls outside the
    // analyser's band window), `ratio` would trivially "pass" at 1 without
    // proving anything, the exact false-negative shape this file's ground
    // rules warn about.
    expect(beforeMax, `bar amplitude before the second mount must be genuinely nonzero, not a degenerate 0/0; before=${JSON.stringify(before)}`).toBeGreaterThan(0.05);

    // The cache in useAudioAnalysis (`elementSources` WeakMap) means
    // createMediaElementSource — which THROWS if called twice for the same
    // element — and the destination connection must each happen exactly
    // once, no matter how many visualizers subsequently tap the element.
    expect(calls.createMediaElementSource, 'createMediaElementSource call count across 2 mounts').toBe(1);
    expect(calls.connectDestination, 'ctx.destination connect call count across 2 mounts').toBe(1);
    // Regression guard for the volume-doubling bug: the first visualizer's
    // rendered amplitude must not roughly double (or collapse) once a
    // second visualizer starts tapping the same element.
    expect(ratio, `bar-height ratio after/before second mount (before=${JSON.stringify(before)}, after=${JSON.stringify(after)})`).toBeGreaterThan(
      0.5,
    );
    expect(ratio, `bar-height ratio after/before second mount`).toBeLessThan(1.8);

    await page.screenshot({ path: join(DIRS.audio, 'two-visualizers-same-element.png') });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Check 9: live microphone via a fake device drives non-zero bands.
// ─────────────────────────────────────────────────────────────────────────
test.describe('Check 9: live microphone (fake device) drives useAudioAnalysis', () => {
  test('bands become non-zero within 3 seconds of a real getUserMedia stream', async ({}, testInfo) => {
    testInfo.setTimeout(30_000);

    // `--use-fake-device-for-media-stream` ALONE produces a fake audio
    // track that is genuine dead silence on this Chromium build --
    // verified directly: an AnalyserNode on the raw fake-device stream
    // read all-zero bytes across the ENTIRE spectrum and zero time-domain
    // variance for a full second, with audio processing (echoCancellation/
    // noiseSuppression/autoGainControl) both on and off. There is no tone
    // to suppress; the generator itself is silent. Chromium's own
    // `--use-file-for-fake-audio-capture=<wav path>` feeds the fake
    // capture device real PCM instead, which is the standard technique for
    // exercising a genuine (not silent) getUserMedia audio path in
    // automation -- still the REAL device/track/AudioContext pipeline
    // `useAudioAnalysis` runs against, just with deterministic content.
    const micWavPath = join(DIRS.mic, 'fake-mic-input.wav');
    // 3000 Hz for the same reason as check 8: useAudioAnalysis's default
    // loPass/hiPass (100/200 bin indices) is a ~2153-4306 Hz window, and a
    // tone outside it reads as a flat 0 indistinguishable from silence.
    writeFileSync(micWavPath, buildWavBuffer(5, 3000, 48000));

    const browser = await chromium.launch({
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${micWavPath}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    try {
      const context = await browser.newContext({
        baseURL: 'http://localhost:6006',
        permissions: ['microphone'],
      });
      const page = await context.newPage();
      try {
        await gotoAnchor(page);

        await page.evaluate(async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const el = document.createElement('kai-audio-visualizer');
          el.setAttribute('data-test-id', 'mic-test');
          el.setAttribute('variant', 'bar');
          el.setAttribute('state', 'speaking');
          el.setAttribute('size', 'md');
          document.body.appendChild(el);
          (el as unknown as { stream: MediaStream }).stream = stream;
        });

        const loc = page.locator('[data-test-id="mic-test"]');
        await waitDomReady(loc);

        const maxHeight = async () =>
          page.evaluate(() => {
            const el = document.querySelector('[data-test-id="mic-test"]');
            const bars = el?.shadowRoot?.querySelectorAll('[part~="bar"]');
            if (!bars) return 0;
            return Math.max(...Array.from(bars).map((b) => parseFloat((b as HTMLElement).style.height) || 0));
          });

        await expect
          .poll(maxHeight, { timeout: 3000, message: 'max bar height % from the fake mic stream' })
          .toBeGreaterThan(0);

        const finalHeights = await page.evaluate(() => {
          const el = document.querySelector('[data-test-id="mic-test"]');
          const bars = el?.shadowRoot?.querySelectorAll('[part~="bar"]');
          return bars ? Array.from(bars).map((b) => (b as HTMLElement).style.height) : [];
        });
        writeFileSync(join(DIRS.mic, 'bands.txt'), JSON.stringify(finalHeights, null, 2));
        await page.screenshot({ path: join(DIRS.mic, 'mic-driven-bars.png') });
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Check 10: the shader recompile guard holds under the REAL dispatcher props
// chain (regression, 2026-08-09).
//
// Production measurement on this exact story (Aurora, via a standalone
// instrumented Playwright probe, 4s window, 5 canvases): ~70 `createProgram`
// calls, `iTime` pinned under 0.33s with recurring NEGATIVE values. Root
// cause: `ShaderCanvas`'s compile effect read `props.precision` directly;
// `variant-aurora.tsx`/`variant-wave.tsx` compute `precision` from
// `props.size`, which arrives via `index.tsx`'s dispatcher spreading a
// PLAIN function (`shared()`, not a memo) that also bundles `bands`. Solid's
// spread-prop merging re-invokes the whole source function on ANY property
// read from the merged result, so reading `precision` transitively re-read
// `bands()` too -- at the ~31/sec synthetic band cadence these stories
// drive, recompiling the whole GL program on nearly every tick even though
// `precision` itself never changed.
//
// This class of leak is invisible to a jsdom unit test that hand-builds a
// flat `ShaderCanvasProps` object (see `shader-canvas.test.tsx`'s own
// regression test for the closest a unit test can get, driving a minimal
// spread-of-a-function reproduction) -- it depends on the REAL dispatcher's
// prop-plumbing shape, Solid's real compiled spread semantics, and a real
// GL driver actually recompiling. Only a real story, in a real browser,
// proves the fix holds end to end.
//
// Verification bar: at most one `createProgram` call per canvas for the
// story's lifetime (5, one per state row), and `iTime` climbing
// monotonically with no backwards step, on every canvas independently.
// ─────────────────────────────────────────────────────────────────────────

/** Hooks installed BEFORE navigation so they see every WebGL context the
 *  page ever creates: counts total `createProgram` calls, and tracks each
 *  program's own `iTime` uniform writes as an independent series (so 5
 *  canvases interleaving their own RAF loops cannot look "non-monotonic"
 *  just from being merged into one global timeline -- each program's
 *  series must be monotonic on its own). */
async function installRecompileGuardProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __avProgramsCreated: number;
      __avSeries: Map<WebGLProgram, number[]>;
    };
    w.__avProgramsCreated = 0;
    w.__avSeries = new Map();

    const proto = WebGLRenderingContext.prototype;
    const cp = proto.createProgram;
    proto.createProgram = function (this: WebGLRenderingContext) {
      w.__avProgramsCreated++;
      return cp.call(this);
    };

    const getLoc = proto.getUniformLocation;
    const locToProgram = new WeakMap<WebGLUniformLocation, WebGLProgram>();
    proto.getUniformLocation = function (this: WebGLRenderingContext, prog: WebGLProgram, name: string) {
      const loc = getLoc.call(this, prog, name);
      if (name === 'iTime' && loc) locToProgram.set(loc, prog);
      return loc;
    };

    const u1f = proto.uniform1f;
    proto.uniform1f = function (this: WebGLRenderingContext, loc: WebGLUniformLocation | null, v: number) {
      const prog = loc ? locToProgram.get(loc) : undefined;
      if (prog) {
        if (!w.__avSeries.has(prog)) w.__avSeries.set(prog, []);
        w.__avSeries.get(prog)!.push(v);
      }
      return u1f.call(this, loc, v);
    };
  });
}

interface RecompileGuardResult {
  programsCreated: number;
  canvasCount: number;
  perCanvas: { frames: number; first: number; last: number; nonMonotonicSteps: number }[];
}

async function readRecompileGuardProbe(page: Page): Promise<RecompileGuardResult> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __avProgramsCreated: number;
      __avSeries: Map<WebGLProgram, number[]>;
    };
    const perCanvas = [...w.__avSeries.values()].map((series) => {
      let nonMonotonicSteps = 0;
      for (let i = 1; i < series.length; i++) {
        if (series[i]! < series[i - 1]!) nonMonotonicSteps++;
      }
      return {
        frames: series.length,
        first: series[0] ?? 0,
        last: series[series.length - 1] ?? 0,
        nonMonotonicSteps,
      };
    });
    return { programsCreated: w.__avProgramsCreated, canvasCount: perCanvas.length, perCanvas };
  });
}

test.describe('Check 10: shader recompile guard holds under the real dispatcher props chain', () => {
  for (const variant of ['wave', 'aurora'] as const) {
    test(`${variant}: compiles once per canvas, iTime climbs monotonically over a 4s window`, async ({ page }) => {
      await installRecompileGuardProbe(page);
      // Navigate straight to the real story (not the generic anchor +
      // mountRow used elsewhere in this file): this is what actually drives
      // the synthetic band cadence (`useFakeBands`, ~32ms) that exposed the
      // leak in production. A manually-mounted element with no live audio
      // source has no ticking `bands` signal to leak through in the first
      // place, so it would not reproduce this regression.
      await page.goto(`/iframe.html?id=components-elements-audiovisualizer--${variant}&viewMode=story`);
      await page.waitForFunction(() => document.body.classList.contains('sb-show-main'), { timeout: 15_000 });
      await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 10_000 });

      // Let the story settle (initial mount, first tween landings) before
      // taking the baseline reading -- mirrors the production probe, which
      // cleared its counters after an initial settle window rather than
      // counting the expected one-time mount compiles as "recompiles."
      await page.waitForTimeout(500);
      const baseline = await readRecompileGuardProbe(page);
      const canvasCount = await page.locator('canvas').count();

      await page.waitForTimeout(4000);
      const after = await readRecompileGuardProbe(page);

      writeFileSync(
        join(DIRS.recompile, `${variant}.json`),
        JSON.stringify({ canvasCount, baseline, after }, null, 2),
      );
      await page.screenshot({ path: join(DIRS.recompile, `${variant}.png`) });

      // At most one createProgram call per canvas, EVER -- no further
      // recompiles happened during the 4s window on top of the initial
      // mount.
      expect(after.programsCreated, 'createProgram calls for the story lifetime').toBeLessThanOrEqual(canvasCount);
      expect(after.programsCreated, 'no recompiles during the 4s window after settling').toBe(baseline.programsCreated);

      // Every canvas's OWN iTime series is monotonic (no canvas ever
      // wrote a smaller iTime than its own previous frame), and climbed by
      // roughly the real elapsed wall-clock gap, not pinned near zero.
      expect(after.perCanvas.length, 'canvases observed').toBeGreaterThan(0);
      for (const series of after.perCanvas) {
        expect(series.nonMonotonicSteps, `canvas iTime series: ${JSON.stringify(series)}`).toBe(0);
        expect(series.last, `canvas iTime should have climbed near the elapsed window: ${JSON.stringify(series)}`).toBeGreaterThan(3);
      }
    });
  }
});
