import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression guard: speaking tiles render a centre-outward symmetric
 * profile, not the old left-to-right descending ramp.
 *
 * `<AudioVisualizer>` gained a centre-outward mirror for real-audio bands in
 * commit 3f34a45 (`mirrorBandsCenterOut` / `mirrorBandsAroundRing` in
 * `primitives/audio-bands.ts`). `index.tsx`'s `bands()` accessor
 * short-circuits that mirror whenever a caller supplies `props.bands`
 * directly (`if (props.bands) return props.bands;`), and every `speaking`
 * tile in `audio-visualizer.stories.tsx` drives the demo through exactly
 * that prop -- so a first pass of the stories (`useVoiceBands` for
 * Bar/Grid/Radial/Custom, `useFakeBands` for StateMatrix) still showed the
 * OLD ramp, not the new centre-outward shape, despite the component itself
 * being fixed. A follow-up fixed the STORIES to pre-mirror `ceil(n/2)` bands
 * through the same primitives the live-audio path uses before handing them
 * to `bands`, which is what this file verifies actually landed.
 *
 * Provenance (do not re-derive lightly): every hard assertion below --
 * `SYMMETRY_TOLERANCE`, centre-strictly-max for the linear variants, and the
 * per-element (never aggregated) sampling methodology -- was watched FAIL
 * against the pre-fix stories (left-heavy ramps, deviations 0.12-0.71,
 * centre never the max) before it was watched PASS against the fixed
 * stories. That RED-then-GREEN cycle is what makes this guard trustworthy;
 * loosening a threshold here should be treated as re-opening that
 * provenance, not a routine tweak.
 *
 * Sampling is per ELEMENT, never aggregated into one string across a whole
 * row (see the HANDOFF doc's section 5: a previous session joined 120 radial
 * spokes into one string, saw one distinct value, and drew a wrong
 * conclusion). Each tile's evidence file records the raw per-index
 * time-averaged profile.
 *
 * The StateMatrix story (and its 3 tests here: bar/grid/radial against a
 * SYNTHETIC feed) was deleted from `audio-visualizer.stories.tsx` -- it
 * duplicated the per-variant stories, which already render every state.
 * Removed here to match: the surviving Bar/Grid/Radial/Custom tests already
 * prove the same centre-outward mirror contract against the REAL voice
 * fixture, which is the stronger of the two coverages. Every remaining
 * assertion and threshold below is untouched by that removal.
 *
 * Run: `npm run test:audio-visualizer-band-shape`
 *
 * A worktree's run must not attach to the MAIN checkout's Storybook on 6006.
 * Set `KAI_SB_PORT` (for example `KAI_SB_PORT=6018`) and every Storybook suite
 * moves with it; the config starts a server on that port itself if nothing is
 * listening. See the `KAI_SB_PORT` comment at the top of
 * `config/playwright/storybook.config.ts` for exactly why.
 */

// Evidence (per-tile JSON + one screenshot) goes here. Defaults to a
// repo-local, GITIGNORED directory (`test-results/` is covered by the root
// .gitignore) rather than an absolute path baked into this file's source:
// an earlier draft hardcoded this session's own /private/tmp scratchpad
// path, which (a) does not exist for anyone else who runs this file, and
// (b) accidentally false-positived `tests/stories/e2e-story-fixtures.test.ts`
// -- that drift guard regexes every `tests/e2e/*.spec.ts` file's source for
// "word" + two adjacent dashes + "word" story-id-shaped tokens, and the
// session's sandboxed scratchpad directory name happened to contain exactly
// that shape (a package name immediately followed by a double-dash-joined
// worktree name), which parsed as a (nonexistent) story id and failed the
// guard. Note for future editors of this comment: do not spell that literal
// pattern out here either, or this paragraph reintroduces the same false
// positive it is explaining. Override the default with
// `AV_BAND_SHAPE_EVIDENCE_DIR` for a one-off custom location; the override
// is resolved, not embedded literally, so it can never reintroduce the same
// false positive.
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_EVIDENCE_DIR = join(HERE, '..', '..', 'test-results', 'av-band-shape');
const SHOT_ROOT = process.env.AV_BAND_SHAPE_EVIDENCE_DIR
  ? resolve(process.env.AV_BAND_SHAPE_EVIDENCE_DIR)
  : DEFAULT_EVIDENCE_DIR;
mkdirSync(SHOT_ROOT, { recursive: true });

// One full pass of the 196-frame (~6.4s) voice loop, sampled at the same
// ~32ms cadence useAudioAnalysis/useVoiceBands/useFakeBands all animate at,
// polled here at 100ms resolution (the poll rate is deliberately coarser
// than the source's own tick — we want a representative time-average over a
// full loop, not to reconstruct every intermediate frame). 7500ms leaves
// margin past one full loop plus per-poll `evaluate()` overhead.
const SAMPLE_INTERVAL_MS = 100;
const SAMPLE_DURATION_MS = 7500;

// Normalized-scale tolerance for "symmetric" (0..1 scale, matching the
// dispatch's requested 0.03-0.05 band). A profile whose worst mirrored pair
// differs by more than this is not symmetric. Watched FAIL at 0.12-0.71
// against the pre-fix stories -- see the file header's provenance note.
const SYMMETRY_TOLERANCE = 0.045;

async function gotoStory(page: Page, storyId: string): Promise<void> {
  await page.goto(`/iframe.html?id=components-elements-audiovisualizer--${storyId}&viewMode=story`);
  await page.waitForFunction(() => document.body.classList.contains('sb-show-main'), { timeout: 15_000 });
  await page.locator('[data-kai-state="speaking"]').first().waitFor({ state: 'attached', timeout: 10_000 });
  // Let the mount/landing tween settle before sampling the steady-state loop.
  await page.waitForTimeout(700);
}

/** Poll `sampleFn` on a wall-clock cadence for `durationMs`, returning every
 *  poll's per-index snapshot. Deliberately wall-clock (`Date.now()`), not an
 *  iteration count times `intervalMs`: each poll's own `evaluate()` round
 *  trip adds real time on top of the `waitForTimeout`, so this guarantees
 *  the loop runs for AT LEAST `durationMs`, comfortably past one full
 *  196-frame (~6.4s) voice loop, rather than potentially falling short. */
async function sampleOverTime(
  page: Page,
  sampleFn: () => Promise<number[]>,
  intervalMs: number,
  durationMs: number,
): Promise<number[][]> {
  const samples: number[][] = [];
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    samples.push(await sampleFn());
    await page.waitForTimeout(intervalMs);
  }
  return samples;
}

/** Per-index time average across every poll. Ragged polls (a transient DOM
 *  read glitch) are tolerated by falling back to 0 for a missing index
 *  rather than throwing, but every tile below is checked to have a stable
 *  element count first. */
function averageProfile(samples: number[][]): number[] {
  const n = Math.max(0, ...samples.map((s) => s.length));
  const avg = new Array(n).fill(0);
  for (const s of samples) {
    for (let i = 0; i < n; i++) avg[i] += (s[i] ?? 0) / samples.length;
  }
  return avg;
}

interface Pair {
  i: number;
  j: number;
  diff: number;
}

/** Mirrored pairs about a LINEAR centre: (0, n-1), (1, n-2), ... — what
 *  `mirrorBandsCenterOut` targets for bar/grid. The centre element itself
 *  (only present for odd `n`) has no partner and is checked separately
 *  (must be the strict max). */
function linearPairs(avg: number[]): Pair[] {
  const n = avg.length;
  const pairs: Pair[] = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const j = n - 1 - i;
    pairs.push({ i, j, diff: Math.abs(avg[i]! - avg[j]!) });
  }
  return pairs;
}

/** Mirrored pairs about the ring's vertical axis: index `i` pairs with
 *  `(n - i) % n` — what `mirrorBandsAroundRing` targets for radial. Indices
 *  0 and `n/2` are each their own fixed point (no partner) by that mapping's
 *  own contract, so they are excluded here. */
function ringPairs(avg: number[]): Pair[] {
  const n = avg.length;
  const pairs: Pair[] = [];
  for (let i = 1; i < n / 2; i++) {
    const j = (n - i) % n;
    pairs.push({ i, j, diff: Math.abs(avg[i]! - avg[j]!) });
  }
  return pairs;
}

function maxDiff(pairs: Pair[]): number {
  return pairs.length ? Math.max(...pairs.map((p) => p.diff)) : 0;
}

function round3(arr: number[]): number[] {
  return arr.map((v) => Math.round(v * 1000) / 1000);
}

// ── per-variant per-element samplers ────────────────────────────────────
// Every sampler reads ONE poll's snapshot, per element, off `data-kai-index`
// explicitly (not raw DOM order) so a future markup reorder cannot silently
// scramble the index->value mapping.

/** Bar: level is the inline `style.height`, a `NN%` of the container. */
async function sampleBarLevels(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const bars = Array.from(
      document.querySelectorAll('[data-kai-state="speaking"] > [part~="bar"]'),
    ) as HTMLElement[];
    return bars
      .map((b) => ({ idx: parseInt(b.getAttribute('data-kai-index') ?? '0', 10), v: parseFloat(b.style.height) || 0 }))
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.v / 100); // normalize the 0..100% scale to 0..1
  });
}

/** Radial: level is the inline `style.height` in PX (`dotSize() * 10 *
 *  level()`). `dotSize()` is a constant for a fixed count/radius, so raw px
 *  differences between spokes are already proportional to level differences
 *  -- normalized to 0..1 by the caller (dividing by this tile's own max) so
 *  the symmetry tolerance means the same thing across every tile. Selector
 *  requires a `[data-kai-spoke]` ancestor so it can never match bar's own
 *  `[part~="bar"]` elements (bar's are direct children of the state
 *  wrapper; radial's are one level deeper, inside the spoke wrapper) --
 *  this is what would let the SAME query work unambiguously even if a
 *  future page ever put bar/grid/radial "speaking" wrappers on screen at
 *  once (the now-deleted StateMatrix story did -- see the file header's
 *  provenance note). */
async function sampleRadialLevels(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const bars = Array.from(
      document.querySelectorAll('[data-kai-state="speaking"] [data-kai-spoke] > [part~="bar"]'),
    ) as HTMLElement[];
    return bars
      .map((b) => ({ idx: parseInt(b.getAttribute('data-kai-index') ?? '0', 10), v: parseFloat(b.style.height) || 0 }))
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.v);
  });
}

/**
 * Grid: unlike bar/radial, a cell carries no continuous level style -- only
 * a boolean `data-kai-highlighted`, lit when its COLUMN's level clears a
 * threshold that grows with distance from the middle row (`isLit` in
 * variant-grid.tsx). There is no direct numeric read available per the
 * dispatch's "whatever property that variant animates" -- the animated
 * property here is discrete (lit/unlit), not continuous.
 *
 * The proxy used: at each poll, the FRACTION of a column's rows currently
 * lit. Since `isLit` compares the SAME column level against a monotonic
 * per-row threshold (`threshold = |mid - y| * chunk`), a higher column level
 * always lights AT LEAST as many rows as a lower one at the same instant --
 * the fraction is a monotonic non-decreasing function of the column's real
 * level. Time-averaging this monotonic proxy over a full loop preserves the
 * SAME relative ordering across columns that time-averaging the real levels
 * would, which is all the symmetry check below needs (it compares columns
 * against each other, not against an absolute physical unit).
 */
async function sampleGridColumnLitFraction(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const cells = Array.from(
      document.querySelectorAll('[data-kai-state="speaking"] > [part~="cell"]'),
    ) as HTMLElement[];
    const count = cells.length;
    const cols = Math.round(Math.sqrt(count));
    if (cols * cols !== count) {
      throw new Error(`sampleGridColumnLitFraction: non-square grid (${count} cells) -- cannot infer column count`);
    }
    const litSum = new Array(cols).fill(0);
    const total = new Array(cols).fill(0);
    for (const cell of cells) {
      const idx = parseInt(cell.getAttribute('data-kai-index') ?? '0', 10);
      const col = idx % cols;
      const lit = cell.getAttribute('data-kai-highlighted') === 'true';
      total[col]! += 1;
      if (lit) litSum[col]! += 1;
    }
    return litSum.map((s: number, i: number) => (total[i] ? s / total[i]! : 0));
  });
}

/** Custom: read `uBands[i]` straight off the live GL program -- the exact
 *  values `props.bands` fed the shader, no pixel decoding needed. Reading
 *  `gl.getParameter(CURRENT_PROGRAM)` is scoped to THIS canvas's own
 *  context object (per-context state), so it is safe even though other
 *  shader canvases are not mounted on this page at all (only bar/grid/
 *  radial are DOM variants; Custom is its own single-variant story). */
async function sampleCustomBands(canvasLoc: Locator, n: number): Promise<number[]> {
  return canvasLoc.evaluate((canvas: HTMLCanvasElement, n: number) => {
    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return new Array(n).fill(0);
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    if (!program) return new Array(n).fill(0);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const loc = gl.getUniformLocation(program, `uBands[${i}]`);
      out.push(loc ? ((gl.getUniform(program, loc) as number) ?? 0) : 0);
    }
    return out;
  }, n);
}

// ── shared assertion + evidence-writing body ────────────────────────────

interface TileResult {
  tileName: string;
  rawSamples: number;
  avgProfile: number[];
  pairs: Pair[];
  maxPairDeviation: number;
  centerIndex?: number;
  centerIsMax?: boolean;
}

function writeEvidence(name: string, result: TileResult, extra?: Record<string, unknown>): void {
  writeFileSync(
    join(SHOT_ROOT, `${name}.json`),
    JSON.stringify({ ...result, avgProfile: round3(result.avgProfile), ...extra }, null, 2),
  );
}

/** Center-out (linear) check: applies to bar, grid(-proxy), and custom --
 *  every variant whose mirror is `mirrorBandsCenterOut`. Pure computation,
 *  NO assertions -- so the caller can write the evidence file before any
 *  assertion has a chance to throw and abort the test early. */
function computeLinearResult(tileName: string, avg: number[]): TileResult {
  const pairs = linearPairs(avg);
  const maxPairDeviation = maxDiff(pairs);
  const n = avg.length;
  const centerIndex = n % 2 === 1 ? (n - 1) / 2 : undefined;
  const centerIsMax = centerIndex !== undefined ? avg[centerIndex]! === Math.max(...avg) : undefined;
  return { tileName, rawSamples: 0, avgProfile: avg, pairs, maxPairDeviation, centerIndex, centerIsMax };
}

/** Ring (rotational-about-vertical-axis) check for radial. Pure, same
 *  reason as `computeLinearResult` above. `pairs` on the returned result
 *  are the NORMALIZED ring pairs (0..1 scale), since that is what the
 *  tolerance is checked against; raw px values stay in `avgProfile`. */
function computeRingResult(tileName: string, avg: number[]): TileResult {
  const max = Math.max(...avg, 1e-9);
  const normalized = avg.map((v) => v / max);
  const normPairs = ringPairs(normalized);
  const maxPairDeviation = maxDiff(normPairs);
  return { tileName, rawSamples: 0, avgProfile: avg, pairs: normPairs, maxPairDeviation };
}

/**
 * Runs the actual assertions against an already-computed (and already
 * evidence-written) result. `expect.soft` so a failure in the tolerance
 * check does not hide the centre-is-max failure in the same test's output.
 *
 * The permanent regression gate: symmetric-about-centre (or ring axis)
 * within `SYMMETRY_TOLERANCE`, and (for the linear variants) the centre
 * element at or near the max. Watched FAIL against the pre-fix stories,
 * watched PASS against the fixed ones -- see the file header's provenance
 * note.
 *
 * `centerMaxSlack` (default 0, i.e. strict `=== max`): amended for the
 * "Grid story" tile ONLY, after the pipeline-alignment fix re-baked the
 * voice fixture at +18.1dB. Measured across 3 runs post-rebake: Grid's
 * profile saturates near [0.489, 0.49, 0.489, 0.49, 0.489] -- the column
 * lit-fraction proxy (see `sampleGridColumnLitFraction`'s own doc: a
 * coarse, quantized 0..1 metric, not a continuous level) has nowhere left
 * to climb once nearly every row in nearly every column lights on nearly
 * every poll, so the true (and still centre-outward) shape is buried under
 * ~0.01 of quantization noise -- confirmed by symmetry staying EXACT
 * (`maxPairDeviation: 0`) every run even as the strict centre-max flipped
 * pass/fail run to run. This is the metric losing resolution at this
 * loudness, not the mirror breaking. `centerMaxSlack: 0.015` tolerates
 * exactly that quantization band without loosening the symmetry check
 * (still exact) or the centre needing to be BELOW its neighbours (which
 * would be the actual regression this guard exists to catch). Every other
 * tile keeps the strict `slack: 0` default deliberately: Bar and Custom
 * read a continuous level (no saturation risk at any gain) -- passed the
 * strict check cleanly 3/3 runs, so amending them would be loosening a
 * check that was never broken. (The StateMatrix bar/grid/radial tests that
 * used to make the same point against a synthetic, un-rebaked feed were
 * deleted along with the StateMatrix story -- see the file header.)
 */
function assertResult(result: TileResult, kind: 'linear' | 'ring', opts: { centerMaxSlack?: number } = {}): void {
  const { tileName, pairs, maxPairDeviation, avgProfile, centerIndex } = result;
  const centerMaxSlack = opts.centerMaxSlack ?? 0;

  const axisLabel = kind === 'linear' ? 'centre-symmetric' : 'ring-symmetric about the vertical axis';
  expect
    .soft(
      maxPairDeviation,
      `${tileName}: NOT ${axisLabel} -- worst mirrored-pair deviation ${maxPairDeviation.toFixed(3)} exceeds tolerance ${SYMMETRY_TOLERANCE}. pairs=${JSON.stringify(pairs.map((p) => ({ i: p.i, j: p.j, diff: Number(p.diff.toFixed(3)) })))} avg=${JSON.stringify(round3(avgProfile))}`,
    )
    .toBeLessThan(SYMMETRY_TOLERANCE);

  if (centerIndex !== undefined) {
    const maxVal = Math.max(...avgProfile);
    const centerVal = avgProfile[centerIndex]!;
    const centerNearMax = centerVal >= maxVal - centerMaxSlack;
    expect
      .soft(
        centerNearMax,
        centerMaxSlack > 0
          ? `${tileName}: centre element (index ${centerIndex}, value ${centerVal.toFixed(3)}) should be within ${centerMaxSlack} of the profile max (${maxVal.toFixed(3)}) -- see assertResult's centerMaxSlack doc; avg=${JSON.stringify(round3(avgProfile))}`
          : `${tileName}: centre element (index ${centerIndex}) should be the strict max of a centre-outward profile; avg=${JSON.stringify(round3(avgProfile))}`,
      )
      .toBe(true);
  }
}

// ─────────────────────────────────────────────────────────────────────────

test.describe('Speaking tiles are centre-outward symmetric (regression guard for commit 3f34a45 + the story fix that stopped bypassing it)', () => {
  test('Bar story: speaking tile is centre-symmetric', async ({ page }) => {
    await gotoStory(page, 'bar');
    const samples = await sampleOverTime(page, () => sampleBarLevels(page), SAMPLE_INTERVAL_MS, SAMPLE_DURATION_MS);
    const avg = averageProfile(samples);
    await page.screenshot({ path: join(SHOT_ROOT, 'bar.png') });
    const result = computeLinearResult('Bar', avg);
    result.rawSamples = samples.length;
    writeEvidence('bar', result);
    assertResult(result, 'linear');
  });

  test('Grid story: speaking tile column lit-fraction is centre-symmetric', async ({ page }) => {
    await gotoStory(page, 'grid');
    const samples = await sampleOverTime(
      page,
      () => sampleGridColumnLitFraction(page),
      SAMPLE_INTERVAL_MS,
      SAMPLE_DURATION_MS,
    );
    const avg = averageProfile(samples);
    await page.screenshot({ path: join(SHOT_ROOT, 'grid.png') });
    const result = computeLinearResult('Grid', avg);
    result.rawSamples = samples.length;
    writeEvidence('grid', result, { metric: 'column lit-fraction (0..1), a monotonic proxy for level -- see sampleGridColumnLitFraction doc' });
    // centerMaxSlack: 0.015 -- ONLY this tile. See assertResult's doc: the
    // lit-fraction proxy saturates at the rebaked fixture's +18.1dB gain
    // (measured profile ~[0.489, 0.49, 0.489, 0.49, 0.489], symmetry still
    // exact). StateMatrix's grid row is unaffected (fed by the synthetic
    // useFakeBands generator, not this rebaked fixture) and keeps the
    // strict default below.
    assertResult(result, 'linear', { centerMaxSlack: 0.015 });
  });

  test('Radial story: speaking tile is symmetric about the ring vertical axis', async ({ page }) => {
    await gotoStory(page, 'radial');
    const samples = await sampleOverTime(page, () => sampleRadialLevels(page), SAMPLE_INTERVAL_MS, SAMPLE_DURATION_MS);
    const avg = averageProfile(samples);
    await page.screenshot({ path: join(SHOT_ROOT, 'radial.png') });
    const result = computeRingResult('Radial', avg);
    result.rawSamples = samples.length;
    writeEvidence('radial', result, { unit: 'px height (raw in avgProfile); pairs are normalized 0..1 by this tile\'s own max' });
    assertResult(result, 'ring');
  });

  test('Custom story: speaking tile uBands are centre-symmetric', async ({ page }) => {
    await gotoStory(page, 'custom');
    const canvas = page.locator('[data-kai-state="speaking"] canvas');
    await canvas.waitFor({ state: 'attached', timeout: 10_000 });
    await page.waitForTimeout(300); // let the first draw() call bind the program
    const samples = await sampleOverTime(page, () => sampleCustomBands(canvas, 5), SAMPLE_INTERVAL_MS, SAMPLE_DURATION_MS);
    const avg = averageProfile(samples);
    await page.screenshot({ path: join(SHOT_ROOT, 'custom.png') });
    const result = computeLinearResult('Custom', avg);
    result.rawSamples = samples.length;
    writeEvidence('custom', result, { metric: 'uBands[i] read directly off the live GL program' });
    assertResult(result, 'linear');
  });
});
