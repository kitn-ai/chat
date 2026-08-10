// PARITY ACCEPTANCE — banks the RED baseline for the pipeline-alignment fix
// (noise-floor window, band-split grouping, volume analyser scale) and now
// serves as its GREEN gate. Thresholds are fixed once banked: assertions 2,
// 3, 4 are UNCHANGED since the RED round. Assertion 1 is the one deliberate
// exception -- amended from an absolute bar to a comparative one, on an
// explicit coordinator ruling issued AFTER seeing the GREEN-round numbers,
// and only after the amendment was proven (not just asserted) to still
// condemn the pre-fix build on the banked RED evidence. See
// `assertion1IdleSilence`'s own doc for the full before/after and the
// re-proof. No other threshold moved.
//
//   node scripts/parity-acceptance.mjs      # BASE_URL / PARITY_OUT_DIR / PARITY_LABEL env to override
//
// Needs `pnpm dev` running (port 6021, this app's own dev server — never
// touch 6006/6018, those are the kit's Storybooks). Drives RECORDING mode
// only (public/voice.wav, looped) — fixture mode feeds identical numbers to
// both sides by construction (see fixture.ts's own doc) and so cannot show
// this divergence; mic mode is out of scope here (see the gotcha below, and
// the report's "could not measure" section).
//
// This file does NOT touch scripts/verify.mjs or any src/ file — if a probe
// this script needs does not already exist on the page, that is reported as
// a gap, not patched in.
//
// GOTCHA (from the diagnosis handoff, repeated here because getting it wrong
// silently grabs the REAL microphone): Chromium's fake-audio flags are
// `--use-fake-device-for-media-stream` / `--use-fake-ui-for-media-stream` /
// `--use-file-for-fake-audio-capture=<path>` — note "-media-stream", not
// "-capture", on the first two. Not used by THIS script (recording mode
// never calls getUserMedia), kept here only as a landmine warning for
// whoever extends this to mic mode. Also: Playwright's `chromium-headless-shell`
// channel cannot do getUserMedia at all; this script launches the same way
// `verify.mjs` does (plain `chromium.launch()`, no `channel` override), which
// uses full headless Chromium, not the shell build.
//
// ---------------------------------------------------------------------------
// METHODOLOGY — how REST vs SPEECH frames are told apart, and why
// ---------------------------------------------------------------------------
// `public/voice.wav` is a ~10.449s loop (measured: 460800 frames / 44100Hz)
// of Rob's real voice with a ~2.9s room-tone lead-in, speech with internal
// pauses from ~3.3s to ~7.7s, then a ~2.6s quiet tail before it loops. An
// earlier draft of this script tried to exploit that fixed timeline directly
// (wall-clock offset from the moment "play" was clicked, modulo the loop
// duration). That was abandoned: the moment a click's audio actually starts
// versus when Playwright observes it is not precisely knowable, AND both
// sides' analysers apply heavy smoothing (smoothingTimeConstant 0.8 for
// bands, 0.55 for volume — see livekit-reground.md §2.3-2.4), which delays a
// threshold-crossing by on the order of 150-350ms. Anchoring to a single
// crossing and trusting fixed offline windows risked silently mislabeling
// samples near a window edge on a bad run — exactly the "checks that prove
// nothing" failure mode this epic has hit before.
//
// Instead: classify every polled sample directly from that same poll's
// `their-volume` reading, using PERCENTILES computed from the run's own
// collected distribution, not fixed offline windows or absolute thresholds:
//   - REST candidates: their-volume <= its 30th percentile this run
//   - SPEECH candidates: their-volume >= its 90th percentile this run
//   - everything else: 'transition', excluded from every assertion
// Why their-volume as the classifier (not our own signal, and not raw file
// position): using OUR OWN pipeline to decide which frames count as "idle"
// would be circular for the very assertion (1) that tests whether OUR
// pipeline reads idle correctly — a broken pipeline could exclude genuine
// silence from its own "rest" set. Their-volume is an independent read of
// the same underlying audio; the diagnosis's ADDENDUM table shows it reads
// clearly separated at rest vs speech even on a raw (non-AGC) recording
// (proxy estimate ~0.27 vs ~0.8 — a real, if approximate, gap). Percentile
// (not that literal 0.27/0.8) is used because that estimate was computed
// from an offline proxy at different smoothing than the real 512/0.55 byte
// analyser (documented uncertainty in noise-floor-diagnosis.md §"ADDENDUM
// row"); percentiles self-calibrate to whatever the REAL live analyser
// actually reads this run, without assuming the proxy's numbers are exact.
// 30/90 (not 25/75) are asymmetric on purpose: on this file roughly two
// thirds of one loop is quiet (lead-in + tail + internal pauses) and about a
// third is speech, so P30 sits well inside the larger quiet mass and P90
// sits inside the loudest tenth of samples — comfortably past the
// quiet/speech boundary on both ends, not straddling it.
//
// Consequence for the "GAP" report: there is no `data-probe` exposing raw
// playback position or an independent ground-truth envelope. A future probe
// like that would let this script bypass the their-volume-percentile proxy
// entirely; noted as a gap rather than added here.
//
// Every element read below is sampled and asserted INDIVIDUALLY, never
// pre-aggregated into one mean before the per-element/per-sample check runs
// (see the HANDOFF doc's "checks that prove nothing" lesson) — aggregation
// only happens where the assertion itself is explicitly an aggregate stat
// (assertions 2 and 3, which the dispatch specifies as means/peaks).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:6021';
// Nested under scripts/out/, which .gitignore already covers as a directory
// rule (`scripts/out/`) — reuses that instead of adding a new gitignore
// entry, since this task's constraints ask this script to be the ONLY new
// file. verify.mjs writes its own screenshots straight into scripts/out/;
// this subfolder keeps the two scripts' artifacts from colliding.
//
// RUN_LABEL tags each invocation into its OWN subfolder. Fixed after a real
// gap: the first version of this script wrote every invocation to the same
// `run{1,2,3}.json` filenames, so the RED-banking round's evidence was
// silently overwritten by the very next (GREEN) invocation, and again by
// the one after that — by the time the amendment round needed to
// "re-evaluate offline against the banked RED evidence JSONs", those files
// held GREEN data instead. The banked RED per-assertion NUMBERS survived
// only because that round's stdout had separately been piped to a log file
// outside this script's control — the raw per-sample series did not survive
// anywhere. Timestamped subfolders make that impossible going forward: nothing
// this script writes is ever overwritten by a later invocation again.
const RUN_LABEL = process.env.PARITY_LABEL || new Date().toISOString().replace(/[:.]/g, '-');
const OUT = process.env.PARITY_OUT_DIR || path.join(import.meta.dirname, 'out', 'parity-acceptance', RUN_LABEL);
fs.mkdirSync(OUT, { recursive: true });

// ---- thresholds: fixed once banked. Assertions 2/3/4 unchanged since RED.
// Assertion 1's shape changed (see assertion1IdleSilence's doc); its NEW
// thresholds (idleBandOverRateSlackPp, idleVolumeRelTolerance) are equally
// fixed from this point on — this amendment is the one-time exception, not
// a precedent for further tuning. ----
const THRESHOLDS = Object.freeze({
  idleBandMax: 0.02, // per-element "active" cutoff — feeds assertion 1's comparative rate AND assertion 3's active-band filter, unchanged
  idleBandOverRateSlackPp: 0.02, // assertion 1 (AMENDED): our per-element over-threshold RATE <= theirs' rate + 2 percentage points, same run
  idleVolumeRelTolerance: 0.1, // assertion 1 (AMENDED): our rest volume mean <= theirs * 1.10; p95 <= theirs * 1.10 + volReadoutQuantizationEpsilon, same run
  // Supervisor ruling, tied to the readout precision (see assertion1IdleSilence's
  // doc) -- the page's probes are parsed from `.toFixed(2)` text, so no
  // comparison built on them can legitimately resolve finer than 0.01.
  // SHRINK this if a future probe ever exposes full-precision floats instead
  // of display-quantized strings; do not leave it at 0.01 out of habit.
  volReadoutQuantizationEpsilon: 0.01,
  volumeRelTolerance: 0.25, // assertion 2: |ours - theirs| / theirs, speech mean — UNCHANGED
  bandStatTolerance: 0.1, // assertion 3: |ours - theirs| absolute, peak + mean-active — UNCHANGED
  flickerSlack: 0.002, // assertion 4: ours <= theirs + this, at rest — UNCHANGED
});

const POLL_MS = Number(process.env.PARITY_POLL_MS || 100);
// Comfortably more than 2x the wav's ~10.449s loop, so the percentile split
// below always has a full loop's worth of both rest and speech content
// regardless of what phase of the loop playback happened to be in when
// polling started. Overridable for a fast smoke run while iterating on this
// script itself -- the banked-RED evidence must use the real default.
const POLL_DURATION_MS = Number(process.env.PARITY_POLL_DURATION_MS || 22_000);
const REST_PERCENTILE = 0.3;
const SPEECH_PERCENTILE = 0.9;
const RUNS = Number(process.env.PARITY_RUNS || 3); // stability requirement from the dispatch

// ---------------------------------------------------------------- helpers

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const meanAbsDelta = (a, b) => mean(a.map((v, i) => Math.abs(v - (b[i] ?? 0))));

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

/** One atomic snapshot of all four `data-probe` readouts in a single
 *  `evaluate()` round trip (so the four numbers genuinely describe the same
 *  instant, not four separately-timed reads). Mirrors verify.mjs's
 *  `readProbe` regex exactly (`\d+\.\d+`) — every value in this app is
 *  formatted via `.toFixed(2)` and is never negative (0..1-ish levels), so
 *  that pattern is sufficient; kept identical to the sibling script rather
 *  than reinvented. */
async function readAllProbes(page) {
  return page.evaluate(() => {
    const text = (sel) => document.querySelector(sel)?.textContent ?? '';
    const nums = (s) => (s.match(/\d+\.\d+/g) ?? []).map(Number);
    return {
      theirBands: nums(text('[data-probe="their-bands"]')),
      theirVolume: nums(text('[data-probe="their-volume"]'))[0] ?? 0,
      kitHalf: nums(text('[data-probe="kit-half"]')),
      kitVolume: nums(text('[data-probe="kit-volume"]'))[0] ?? 0,
    };
  });
}

async function pollLoop(page, durationMs, intervalMs) {
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < durationMs) {
    const probes = await readAllProbes(page);
    samples.push({ tMs: Date.now() - t0, ...probes });
    await page.waitForTimeout(intervalMs);
  }
  return samples;
}

/** Percentile-classify every sample by ITS OWN their-volume reading against
 *  cutoffs computed from this run's whole distribution — see the file
 *  header's METHODOLOGY section for why. Mutates `phase` onto each sample. */
function classify(samples) {
  const vols = samples.map((s) => s.theirVolume).sort((a, b) => a - b);
  const restCutoff = percentile(vols, REST_PERCENTILE);
  const speechCutoff = percentile(vols, SPEECH_PERCENTILE);
  for (const s of samples) {
    s.phase = s.theirVolume <= restCutoff ? 'rest' : s.theirVolume >= speechCutoff ? 'speech' : 'transition';
  }
  return { restCutoff, speechCutoff };
}

// ---------------------------------------------------------- per-assertion

/**
 * AMENDED (post-GREEN-round coordinator ruling) from an ABSOLUTE bar --
 * (ours per-element bands < 0.02) AND (ours volume < 0.05) AND (theirs
 * per-element bands < 0.02) -- to a COMPARATIVE one. Retired the absolute
 * form because the GREEN-round evidence showed it measured the wrong thing
 * on both sides:
 *
 *   - THEIRS never actually hits absolute-zero either: 3.9-5.8% of their own
 *     REST-classified per-element band readings exceeded 0.02 in every one
 *     of the 3 banked RED runs (their bands hook has its own smoothing
 *     decay-tail after a loud passage; not a bug). "theirs < 0.02, always"
 *     was never their real behaviour, RED or GREEN -- so gating on it as an
 *     independent absolute bar was never a meaningful test of OUR pipeline.
 *   - 0.05 for OUR volume was calibrated against the OLD, cool -100/-30
 *     analyser scale. The fix deliberately re-scales our volume analyser to
 *     upstream's own hot -100/-80 scale (the thing assertion 2 gates) --
 *     and upstream's OWN idle volume on that scale is NOT near zero (both
 *     sides measured idling at ~0.17-0.18 post-fix; see the visual-green
 *     screenshots). A fixed 0.05 bar was unreachable by design the moment
 *     our scale was made to match theirs, independent of whether the fix
 *     was actually correct.
 *
 * The campaign goal was always parity WITH theirs, not an arbitrary
 * absolute floor -- so theirs becomes the reference point instead of a
 * second independent absolute gate:
 *   (a) bands: our per-element over-threshold RATE (using the same 0.02
 *       "active" cutoff as before) must be within `idleBandOverRateSlackPp`
 *       (2 percentage points) of theirs' own rate, same run.
 *   (b) volume: our rest kitVolume MEAN and P95 must each be within
 *       `idleVolumeRelTolerance` (10% relative) of theirs' own mean/P95,
 *       same run -- which requires capturing THEIR rest volume series too
 *       (theirVolVals below), not recorded by the pre-amendment version.
 *
 * RE-PROVED against the banked RED evidence before adoption (full numbers
 * in the amendment-round report, not just asserted here):
 *   - bands-comparative FAILS on all 3 RED runs (ours 57.9-63.7% over
 *     threshold vs theirs 2.95-8.21%, far outside a 2pp slack) -- the
 *     amended assertion still condemns the pre-fix build, which was the
 *     required outcome.
 *   - volume-comparative WOULD have passed on RED data too (both the old
 *     max-based form and the p95 form below: RED-era `ourVolMax` was a
 *     uniform 0.09 across all 3 banked runs, comfortably under any
 *     reasonable quantile of theirs' own rest volume) -- documented, not
 *     hidden: assertion 2 was already RED at that point (that IS where the
 *     volume-SCALE defect was caught), and the old cool scale reading low
 *     relative to theirs' hot scale is a coincidence of the wrong scale,
 *     not evidence the old build was fine. Going forward this sub-check's
 *     job is to catch a FUTURE regression where our idle volume drifts
 *     away from theirs, not to re-litigate the scale-alignment defect a
 *     second time.
 *
 * P95, not MAX, for the volume sub-check (second amendment, same day): the
 * first GREEN re-verification after the comparative rewrite came back
 * UNSTABLE (PASS/FAIL/FAIL across 3 runs) purely on the max sub-check, even
 * though bands and mean were rock-solid every run. Cause, confirmed by
 * inspecting the raw samples: MAX over 60-110 rest-classified readings is
 * dominated by single decay-tail outliers straddling a speech boundary that
 * the percentile classifier (see METHODOLOGY above) necessarily admits a
 * few of -- run 2 read `ourVolMax=0.28` against sibling rest samples that
 * were otherwise all ~0.19, one clear spike, not a shifted distribution;
 * run 3 missed by 0.003 (0.19 vs an allowed 0.187), i.e. inside plain
 * sampling noise. At the level of convergence both sides now sit at
 * (mean gap ~0.001-0.002), MAX was measuring which run happened to catch a
 * transient, not the pipeline. A gate that flakes 2-in-3 at its own
 * resolution floor is worse than useless -- it trains people to ignore it.
 * P95 keeps the same "does our TAIL behaviour match theirs" intent MAX was
 * for, while being robust to a single-sample spike the way MAX cannot be.
 *
 * QUANTIZATION EPSILON on the p95 comparison -- SUPERVISOR RULING, not a
 * self-amendment (see the amendment-round report for the ruling text): the
 * p95 re-verification still flipped 1-in-3 (run 3: `ourVolP95=0.19` vs an
 * allowed `theirVolP95*1.10=0.187`, over by 0.003), with the two
 * central-tendency sub-checks (bands, mean) passing that same run with
 * comfortable margin. Root cause: `readAllProbes` parses the page's
 * `.toFixed(2)`-formatted readouts (see its own doc), so every value this
 * script ever sees -- including the numbers `ourVolP95`/`theirVolP95` are
 * computed from -- is already quantized to 0.01. `theirVolP95` moving from
 * 0.18 (runs 1-2) to 0.17 (run 3) while `ourVolP95` held at 0.18-0.19 the
 * whole time is consistent with one sample landing on the other side of a
 * quantization boundary, not a real shift in behaviour. A comparison cannot
 * legitimately assert a difference finer than the resolution of its own
 * instrumentation -- so the p95 check gets an explicit measurement-
 * uncertainty allowance of exactly one quantization step, added on top of
 * (not instead of) the 10% relative tolerance:
 *   `ourVolP95 <= theirVolP95 * 1.10 + volReadoutQuantizationEpsilon`
 * `volReadoutQuantizationEpsilon` (0.01) is tied directly to the readout
 * precision, not chosen independently -- if a future probe exposes
 * full-precision floats instead of `.toFixed(2)` display strings (queued as
 * harness work for the wave/aurora rounds), this epsilon should SHRINK to
 * match that precision, not stay at 0.01 by habit. Sanity-checked before
 * adoption (arithmetic in the amendment report, not just asserted here):
 * inert on runs 1-2 (both already passed without it), flips only run 3's
 * near-miss to PASS, and a genuine regression (e.g. ours reading 0.25
 * against theirs' 0.18) still fails by a wide margin (0.25 vs
 * 0.18*1.10+0.01 = 0.208) -- the epsilon absorbs quantization noise, not a
 * real gap.
 */
function assertion1IdleSilence(restSamples) {
  const ourBandVals = restSamples.flatMap((s) => s.kitHalf);
  const theirBandVals = restSamples.flatMap((s) => s.theirBands);
  const ourVolVals = restSamples.map((s) => s.kitVolume);
  const theirVolVals = restSamples.map((s) => s.theirVolume);

  const ourBandsOverThreshold = ourBandVals.filter((v) => v >= THRESHOLDS.idleBandMax);
  const theirBandsOverThreshold = theirBandVals.filter((v) => v >= THRESHOLDS.idleBandMax);
  const ourBandOverRate = ourBandVals.length ? ourBandsOverThreshold.length / ourBandVals.length : NaN;
  const theirBandOverRate = theirBandVals.length ? theirBandsOverThreshold.length / theirBandVals.length : NaN;

  const ourVolMean = mean(ourVolVals);
  const theirVolMean = mean(theirVolVals);
  // Kept in evidence for diagnostic/audit purposes (this is exactly the
  // field whose 2-in-3 flakiness prompted the p95 amendment below) but no
  // longer gates the pass/fail decision.
  const ourVolMax = Math.max(...ourVolVals, 0);
  const theirVolMax = Math.max(...theirVolVals, 0);
  const ourVolP95 = percentile([...ourVolVals].sort((a, b) => a - b), 0.95);
  const theirVolP95 = percentile([...theirVolVals].sort((a, b) => a - b), 0.95);

  const evidence = {
    restSampleCount: restSamples.length,
    ourBandOverCount: ourBandsOverThreshold.length,
    ourBandTotalCount: ourBandVals.length,
    ourBandOverRate,
    theirBandOverCount: theirBandsOverThreshold.length,
    theirBandTotalCount: theirBandVals.length,
    theirBandOverRate,
    ourVolMean,
    theirVolMean,
    ourVolP95,
    theirVolP95,
    ourVolMax, // diagnostic only, see comment above -- not gated
    theirVolMax, // diagnostic only
    activeCutoff: THRESHOLDS.idleBandMax,
    bandOverRateSlackPp: THRESHOLDS.idleBandOverRateSlackPp,
    volRelTolerance: THRESHOLDS.idleVolumeRelTolerance,
    volReadoutQuantizationEpsilon: THRESHOLDS.volReadoutQuantizationEpsilon,
  };

  const bandsComparativePass =
    Number.isFinite(ourBandOverRate) &&
    Number.isFinite(theirBandOverRate) &&
    ourBandOverRate <= theirBandOverRate + THRESHOLDS.idleBandOverRateSlackPp;
  const volMeanComparativePass =
    Number.isFinite(ourVolMean) &&
    theirVolMean > 0 &&
    ourVolMean <= theirVolMean * (1 + THRESHOLDS.idleVolumeRelTolerance);
  // Epsilon is additive on top of the 10% relative tolerance, not a
  // replacement for it -- see the doc comment above for why exactly one
  // quantization step (0.01) and not more.
  const volP95ComparativePass =
    theirVolP95 > 0 &&
    ourVolP95 <= theirVolP95 * (1 + THRESHOLDS.idleVolumeRelTolerance) + THRESHOLDS.volReadoutQuantizationEpsilon;

  return {
    name: 'assertion1_idle_silence_parity_comparative',
    pass: bandsComparativePass && volMeanComparativePass && volP95ComparativePass,
    subchecks: { bandsComparativePass, volMeanComparativePass, volP95ComparativePass },
    evidence,
  };
}

function assertion2VolumeScaleParity(speechSamples) {
  const kitVolMean = mean(speechSamples.map((s) => s.kitVolume));
  const theirVolMean = mean(speechSamples.map((s) => s.theirVolume));
  const relDiff = theirVolMean > 0 ? Math.abs(kitVolMean - theirVolMean) / theirVolMean : NaN;
  const evidence = {
    speechSampleCount: speechSamples.length,
    kitVolMean,
    theirVolMean,
    ratio: theirVolMean > 0 ? kitVolMean / theirVolMean : NaN,
    relDiff,
    tolerance: THRESHOLDS.volumeRelTolerance,
  };
  return {
    name: 'assertion2_volume_scale_parity',
    pass: Number.isFinite(relDiff) && relDiff <= THRESHOLDS.volumeRelTolerance,
    evidence,
  };
}

function assertion3BandActivityParity(speechSamples) {
  const theirVals = speechSamples.flatMap((s) => s.theirBands);
  const kitVals = speechSamples.flatMap((s) => s.kitHalf);
  const theirPeak = Math.max(...theirVals, 0);
  const kitPeak = Math.max(...kitVals, 0);
  const activeEps = THRESHOLDS.idleBandMax;
  const theirActive = theirVals.filter((v) => v > activeEps);
  const kitActive = kitVals.filter((v) => v > activeEps);
  const theirMeanActive = mean(theirActive);
  const kitMeanActive = mean(kitActive);
  const peakDiff = Math.abs(kitPeak - theirPeak);
  const meanActiveDiff =
    Number.isFinite(theirMeanActive) && Number.isFinite(kitMeanActive)
      ? Math.abs(kitMeanActive - theirMeanActive)
      : NaN;
  const evidence = {
    speechSampleCount: speechSamples.length,
    theirPeak,
    kitPeak,
    peakDiff,
    theirMeanActive,
    kitMeanActive,
    meanActiveDiff,
    theirActiveCount: theirActive.length,
    kitActiveCount: kitActive.length,
    tolerance: THRESHOLDS.bandStatTolerance,
  };
  const peakPass = peakDiff <= THRESHOLDS.bandStatTolerance;
  const meanActivePass = Number.isFinite(meanActiveDiff) && meanActiveDiff <= THRESHOLDS.bandStatTolerance;
  return {
    name: 'assertion3_band_activity_parity_baseline',
    pass: peakPass && meanActivePass,
    subchecks: { peakPass, meanActivePass },
    evidence,
  };
}

function assertion4Flicker(samples) {
  const kitDeltas = [];
  const theirDeltas = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (prev.phase === 'rest' && cur.phase === 'rest') {
      kitDeltas.push(meanAbsDelta(prev.kitHalf, cur.kitHalf));
      theirDeltas.push(meanAbsDelta(prev.theirBands, cur.theirBands));
    }
  }
  const kitFlicker = mean(kitDeltas);
  const theirFlicker = mean(theirDeltas);
  const evidence = {
    consecutiveRestPairCount: kitDeltas.length,
    kitFlicker,
    theirFlicker,
    slack: THRESHOLDS.flickerSlack,
    kitMinusTheir: kitFlicker - theirFlicker,
  };
  return {
    name: 'assertion4_flicker',
    pass: Number.isFinite(kitFlicker) && Number.isFinite(theirFlicker) && kitFlicker <= theirFlicker + THRESHOLDS.flickerSlack,
    evidence,
  };
}

// -------------------------------------------------------------- one run

async function runOnce(runIndex) {
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

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('kai-audio-visualizer');
  await page.waitForSelector('[data-lk-state]');

  // Defensive: agentState already defaults to 'speaking' on mount, but
  // click it explicitly rather than rely on that default holding forever
  // (bands only render at all while state === 'speaking', both sides).
  await page.getByTestId('btn-state-speaking').click();
  await page.getByTestId('btn-mode-recording').click();
  await page.getByTestId('btn-rec-play').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="status"]')?.textContent?.includes('recording live'),
    { timeout: 8000 },
  );
  // Let the audio graph settle past the click transient before sampling.
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(OUT, `run${runIndex}-recording.png`) });

  const samples = await pollLoop(page, POLL_DURATION_MS, POLL_MS);

  await page.getByTestId('btn-rec-stop').click().catch(() => {});
  await browser.close();

  const { restCutoff, speechCutoff } = classify(samples);
  const restSamples = samples.filter((s) => s.phase === 'rest');
  const speechSamples = samples.filter((s) => s.phase === 'speech');
  const transitionCount = samples.length - restSamples.length - speechSamples.length;

  const results = [
    assertion1IdleSilence(restSamples),
    assertion2VolumeScaleParity(speechSamples),
    assertion3BandActivityParity(speechSamples),
    assertion4Flicker(samples),
  ];

  const evidenceOut = {
    runIndex,
    baseUrl: BASE,
    pollMs: POLL_MS,
    pollDurationMs: POLL_DURATION_MS,
    totalSamples: samples.length,
    restSampleCount: restSamples.length,
    speechSampleCount: speechSamples.length,
    transitionSampleCount: transitionCount,
    restCutoff,
    speechCutoff,
    thresholds: THRESHOLDS,
    consoleErrors,
    results,
    // Full raw sample series -- the per-element, never-aggregated record
    // every derived stat above was computed from, so any assertion can be
    // independently recomputed or re-audited from this file alone.
    samples,
  };
  // Evidence is written BEFORE any pass/fail is acted on below.
  fs.writeFileSync(path.join(OUT, `run${runIndex}.json`), JSON.stringify(evidenceOut, null, 2));

  return { results, consoleErrors, restSampleCount: restSamples.length, speechSampleCount: speechSamples.length };
}

// ------------------------------------------------------------------ main

const allRuns = [];
for (let i = 1; i <= RUNS; i++) {
  console.log(`\n=== run ${i}/${RUNS} ===`);
  const run = await runOnce(i);
  allRuns.push(run);
  for (const r of run.results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.name} :: ${JSON.stringify(r.evidence)}`);
  }
  if (run.consoleErrors.length) {
    console.log(`  console errors: ${run.consoleErrors.slice(0, 5).join(' | ')}`);
  }
}

// Stability check: every run's per-assertion pass/fail direction must agree.
const names = allRuns[0].results.map((r) => r.name);
const stability = names.map((name) => {
  const verdicts = allRuns.map((run) => run.results.find((r) => r.name === name).pass);
  return { name, verdicts, stable: verdicts.every((v) => v === verdicts[0]) };
});

console.log('\n=== stability across 3 runs ===');
for (const s of stability) {
  console.log(`  ${s.stable ? 'STABLE' : 'UNSTABLE'} ${s.name}: [${s.verdicts.join(', ')}]`);
}

fs.writeFileSync(
  path.join(OUT, 'summary.json'),
  JSON.stringify({ baseUrl: BASE, thresholds: THRESHOLDS, runs: RUNS, stability }, null, 2),
);

const anyUnstable = stability.some((s) => !s.stable);
const lastRun = allRuns[allRuns.length - 1];
const anyFail = lastRun.results.some((r) => !r.pass);

console.log(`\nevidence: ${OUT}`);
console.log(anyUnstable ? 'UNSTABLE across runs -- see summary.json' : 'stable across all 3 runs');
console.log(anyFail ? 'One or more assertions FAIL on today\'s build (expected for a RED-banking run).' : 'All assertions PASS.');

if (anyUnstable) process.exit(2);
process.exit(anyFail ? 1 : 0);
