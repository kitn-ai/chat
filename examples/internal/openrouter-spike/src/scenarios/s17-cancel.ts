import type { Scenario } from './types';
import { pickTools } from '../tools';
import {
  bubbles,
  controlledPanel,
  expand,
  fail,
  neverSeesText,
  seesText,
  textLength,
  toolTrigger,
  waitForMinLength,
  waitForStableLength,
} from './dom';

/**
 * S17 — the user hits Stop on a long stream.
 *
 * REPLAY-ONLY, and slowly: cancelling needs a stream that is still open when the
 * click lands, which a fast live turn will not reliably give you. The fixture
 * opens a tool call, then streams a long answer one sentence at a time.
 *
 * What must be true afterwards: the in-flight fetch is aborted (no more deltas),
 * whatever already rendered stays, and the tool call that never got a result is
 * left in a HONEST state — `AssistantStream.abort` flips any non-complete tool
 * part to `output-error`, so the panel says Error with the reason rather than
 * sitting on a spinner forever.
 *
 * ── why this scenario is shaped the way it is ────────────────────────────────
 * The first version measured `bubbles().last()` and allowed 40 characters of
 * growth after the click. Both were wrong, and they hid each other:
 *
 *  - `bubbles().last()` is the ECHOED PROMPT until the assistant emits its first
 *    text delta. On a fast machine the click landed at ~50ms, before any prose
 *    existed at all, so the check compared the user's own 89-character prompt to
 *    itself and passed while measuring nothing. It cancelled during the TOOL
 *    CALL every time.
 *  - 40 characters is smaller than one frame. The fixture streams whole
 *    sentences (mean 62 characters, largest 95), so the moment a slower runner
 *    was late enough to measure real prose, the single frame already on the wire
 *    when the abort fired blew the budget and the suite went red.
 *
 * So: pin the bubble that is actually streaming, require real prose before
 * clicking, pace the fixture slowly enough that a loaded runner still gets its
 * click in, and state the post-click claim as "growth ceases, short of the end"
 * rather than as a character budget a lucky measurement window can satisfy.
 */

/** The prompt, repeated as a constant because `during` PROVES which bubble it is
 *  looking at rather than trusting a position. */
const PROMPT = 'Write me a long explanation of how streaming works, and check the weather in Paris first.';

/** The last sentence round 1 streams (see `harness/make-canned-fixtures.mjs`).
 *  It can only render if the stream ran to the end, so "this never appears" IS
 *  "Stop cut the stream short" — a claim no measurement window can fake, unlike
 *  a character budget. `harness/scenarios.spec.ts` guards it against the fixture
 *  drifting out from under it. */
export const S17_CLOSING_SENTENCE = 'All of it shows up the first time somebody clicks.';

/** The largest single content delta in the S17 fixture, also guarded in
 *  `harness/scenarios.spec.ts`. A frame already on the wire when the abort fires
 *  still lands, so THIS, not zero, is the floor under any honest growth bound. */
export const S17_MAX_FRAME_CHARS = 95;

/** What may still arrive after the click: the frame in flight, plus one more for
 *  a loaded runner. Past this the stream is continuing, not draining. */
const INFLIGHT_ALLOWANCE = 2 * S17_MAX_FRAME_CHARS;

/** How much prose must be rendered before Stop is worth clicking. Deliberately
 *  clear of the prompt's own 89 characters, so the vacuous version of this
 *  scenario cannot come back: pointed at the prompt bubble this never resolves,
 *  and the run fails as "nothing to cancel" instead of passing. */
const PROSE_BEFORE_STOP = 120;

/** Frame pacing for the replay. Slow on purpose — the whole scenario needs the
 *  stream to still be open when the click lands, and the click is the slowest
 *  thing on a loaded CI runner. At this pace round 1 spans ~2.4s and the click
 *  is due around 0.9s, which leaves ~470 characters still unsent. */
const FRAME_MS = 150;

export const s17Cancel: Scenario = {
  id: 'S17-cancel',
  title: 'Long stream + user cancel',
  proves: 'Stop aborts the stream, keeps what rendered, and resolves the orphaned tool panel to Error',
  prompt: PROMPT,
  tools: pickTools('get_weather'),
  mode: 'replay',
  replayDelayMs: FRAME_MS,
  async during(page) {
    // Wait until there is something to interrupt: a tool panel plus real prose.
    await page.getByText('get_weather').first().waitFor({ state: 'visible', timeout: 20_000 });

    // Bubble 0 is the echoed prompt, bubble 1 is the answer being streamed. The
    // pin is PROVEN below rather than assumed, so a change in how the thread
    // renders fails loudly here instead of quietly measuring the wrong node.
    const streamed = bubbles(page).nth(1);
    await streamed.waitFor({ state: 'attached', timeout: 20_000 });
    const echoed = ((await bubbles(page).nth(0).textContent().catch(() => '')) ?? '').trim();
    if (echoed !== PROMPT) {
      fail(
        `expected bubble 0 to be the echoed prompt, saw ${JSON.stringify(echoed.slice(0, 80))} — ` +
          'the bubble this scenario measures is pinned by position and that position has moved',
      );
    }

    const before = await waitForMinLength(streamed, PROSE_BEFORE_STOP);
    if (before < PROSE_BEFORE_STOP) {
      fail(`nothing to cancel: the answer was only ${before} characters when Stop was due`);
    }

    // If the fixture already finished, this run cannot say anything about
    // cancelling — and must not pretend to. Diagnose it as the harness problem
    // it is rather than letting it surface as a confusing assertion failure.
    if (await page.getByText(S17_CLOSING_SENTENCE).first().isVisible().catch(() => false)) {
      fail(
        'the fixture finished streaming before Stop could be clicked, so this run never tested ' +
          `cancellation. Raise the scenario's replayDelayMs (currently ${FRAME_MS}ms a frame).`,
      );
    }

    await page.getByRole('button', { name: 'Stop' }).first().click();

    // 1. Growth must CEASE. Quiet for four frames counts as stopped.
    const settled = await waitForStableLength(streamed, { quietMs: 4 * FRAME_MS, timeout: 8_000 });
    if (settled === null) {
      fail(
        'Stop did not abort the stream: the answer was still growing 8s after the click ' +
          `(${before} -> ${await textLength(streamed)} characters and counting)`,
      );
    }

    // 2. It must cease PROMPTLY — only what was already on the wire may land.
    if (settled - before > INFLIGHT_ALLOWANCE) {
      fail(
        `Stop did not abort the stream promptly: the answer grew from ${before} to ${settled} ` +
          `characters after the click, past the ${INFLIGHT_ALLOWANCE}-character in-flight allowance`,
      );
    }

    // 3. And it must have been cut SHORT. This is the claim a character budget
    //    cannot make: the closing sentence renders only if round 1 ran to the
    //    end, whatever the timings were on the day.
    await neverSeesText(
      page,
      S17_CLOSING_SENTENCE,
      'the cancelled stream to stop short of its closing sentence',
    );
  },
  async assert(page) {
    // Whatever had rendered is still on screen — measured on the bubble that was
    // streaming, not on whichever bubble happens to be last.
    const prose = ((await bubbles(page).nth(1).textContent().catch(() => '')) ?? '').trim();
    if (prose.length < 10) fail(`cancelling emptied the message (${prose.length} chars left)`);

    // The orphaned tool call resolved to a stated failure rather than a spinner.
    const trigger = toolTrigger(page, 'get_weather');
    await trigger.waitFor({ state: 'visible', timeout: 10_000 });
    await seesText(page, 'Error', { because: 'a tool call with no result must not stay pending forever' });

    const panel = await controlledPanel(page, trigger);
    await expand(trigger, panel, 'get_weather tool');
    await seesText(page, /Stopped by the user/, { because: 'the panel must say WHY it stopped' });
  },
};
