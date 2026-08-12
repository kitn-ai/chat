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
import { pinStreamingReplay, seesFetchAborted } from './replay-report';

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
 *
 * ── and why the DOM is not enough on its own ─────────────────────────────────
 * Everything above is still only what the SCREEN shows, and the screen cannot
 * see the thing this scenario is named after. `AssistantStream.abort` makes the
 * fold ignore later deltas, so a build that settles the message without
 * aborting the fetch renders identically: text stops, closing sentence never
 * appears, socket stays open, bytes keep arriving. Confirmed by disabling each
 * half of `stop()` in turn — only disabling BOTH used to turn this red, which
 * means the half that matters most was untested.
 *
 * Claim 3 closes that. The proxy records whether the client hung up mid-stream
 * and publishes it at `/api/replay-report`; a cancel that leaks a live request
 * is served every frame and now fails here. See `./replay-report.ts`.
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

/** How much prose must be rendered before Stop is worth clicking. Deliberately
 *  clear of the prompt's own 89 characters, so the vacuous version of this
 *  scenario cannot come back: pointed at the prompt bubble this never resolves,
 *  and the run fails as "nothing to cancel" instead of passing. */
const PROSE_BEFORE_STOP = 120;

/** Frame pacing for the replay. Slow on purpose, and the single most important
 *  number here: the scenario needs the stream to still be OPEN when the click
 *  lands, and dispatching a click is the slowest thing on a loaded runner. Round
 *  1 is 14 prose frames; the click is due after the 6th, so this leaves 8 frames
 *  of margin for the click — 2.4s at this pace. Measured against a 6x
 *  CPU-throttled renderer on an oversubscribed box, clicks took 1-2s, so 150ms
 *  a frame (1.2s of margin) was not enough and 300ms is.
 *
 *  If a runner is ever slower still, this scenario says so in as many words
 *  rather than blaming cancellation — see the two guards around the click. */
const FRAME_MS = 300;

export const s17Cancel: Scenario = {
  id: 'S17-cancel',
  title: 'Long stream + user cancel',
  proves:
    'Stop aborts the in-flight FETCH (observed server-side, not inferred from the text stopping), ' +
    'keeps what rendered, and resolves the orphaned tool panel to Error',
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

    // A run where the fixture ran out before the click cannot say anything about
    // cancelling, and must not pretend to — in EITHER direction. Left
    // undiagnosed it reads as "the closing sentence rendered, so Stop did
    // nothing", which blames the kit for the harness being slow. Checked on both
    // sides of the click, because the stream keeps flowing while the click is
    // being dispatched and that dispatch is the slow part.
    const finished = () =>
      page.getByText(S17_CLOSING_SENTENCE).first().isVisible().catch(() => false);
    const tooSlow = (when: string) =>
      fail(
        `the fixture finished streaming ${when}, so this run never tested cancellation. ` +
          `Raise the scenario's replayDelayMs (currently ${FRAME_MS}ms a frame).`,
      );

    if (await finished()) tooSlow('before Stop could be clicked');

    // Pin the stream that is on the wire BEFORE interrupting it, so claim 3
    // below is talking about this replay and not about some later one. This
    // also arms the whole scenario: no stream in flight means nothing to
    // cancel, and it fails saying so.
    const pinned = await pinStreamingReplay(page);

    await page.getByRole('button', { name: 'Stop' }).first().click();
    if (await finished()) tooSlow('while the Stop click was being dispatched');

    // 1. Growth must CEASE. Quiet for four frames counts as stopped.
    const settled = await waitForStableLength(streamed, { quietMs: 4 * FRAME_MS, timeout: 8_000 });
    if (settled === null) {
      fail(
        'Stop did not abort the stream: the answer was still growing 8s after the click ' +
          `(${before} -> ${await textLength(streamed)} characters and counting)`,
      );
    }

    // 2. And it must have been cut SHORT. This is the claim a character budget
    //    cannot make: the closing sentence renders only if round 1 ran to the
    //    end, whatever the timings were on the day.
    //
    //    There is deliberately NO "it grew by at most N characters" bound here.
    //    One was tried (two frames' worth, 190 characters) and it failed 1 run
    //    in 5 under a 6x CPU-throttled renderer, growing 355 -> 572: what such a
    //    bound actually measures is how long the CLICK took to dispatch on a
    //    loaded machine, not how long the stream kept flowing. Loosening it
    //    would only make the flake rarer, and the promptness it was reaching for
    //    is not observable from the DOM — see HARNESS.md for the server-side
    //    frame count that could measure it honestly.
    await neverSeesText(
      page,
      S17_CLOSING_SENTENCE,
      'the cancelled stream to stop short of its closing sentence',
    );

    // 3. And the FETCH was actually aborted.
    //
    //    Claims 1 and 2 are everything the DOM can say, and they are both
    //    satisfied by a cancel that never reaches `fetch`: `stream.abort()`
    //    makes the fold ignore later deltas, so the text stops and the closing
    //    sentence never renders while the socket stays open and every remaining
    //    byte still arrives. Both readings are consistent with the working
    //    implementation AND with one that leaks a live request, which is what
    //    made this scenario unable to fail for the reason it exists.
    //
    //    The server is the peer whose socket the abort closes, so it is the
    //    only party that can tell the two apart. Measured on ITS clock, which
    //    is also why this does not inherit the flakiness of the post-click
    //    character budget that was tried and removed above.
    await seesFetchAborted(
      page,
      pinned,
      'Stop must cancel the request, not just stop listening to it',
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
