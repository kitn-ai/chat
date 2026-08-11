import type { Scenario } from './types';
import { pickTools } from '../tools';
import { answer, controlledPanel, expand, fail, seesText, toolTrigger, waitForAnswerLength } from './dom';

/**
 * S17 — the user hits Stop on a long stream.
 *
 * REPLAY-ONLY, and slowly: cancelling needs a stream that is still open when the
 * click lands, which a fast live turn will not reliably give you. The fixture
 * opens a tool call, then streams a long answer at 60ms a frame.
 *
 * What must be true afterwards: the in-flight fetch is aborted (no more deltas),
 * whatever already rendered stays, and the tool call that never got a result is
 * left in a HONEST state — `AssistantStream.abort` flips any non-complete tool
 * part to `output-error`, so the panel says Error with the reason rather than
 * sitting on a spinner forever.
 */
export const s17Cancel: Scenario = {
  id: 'S17-cancel',
  title: 'Long stream + user cancel',
  proves: 'Stop aborts the stream, keeps what rendered, and resolves the orphaned tool panel to Error',
  prompt: 'Write me a long explanation of how streaming works, and check the weather in Paris first.',
  tools: pickTools('get_weather'),
  mode: 'replay',
  replayDelayMs: 60,
  async during(page) {
    // Wait until there is something to interrupt: a tool panel plus some prose.
    await page.getByText('get_weather').first().waitFor({ state: 'visible', timeout: 20_000 });
    const before = await waitForAnswerLength(page, 40);
    if (before < 40) fail(`nothing to cancel: the answer was only ${before} characters when Stop was due`);

    await page.getByRole('button', { name: 'Stop' }).first().click();

    // Give the stream a window in which it WOULD have kept growing. The fixture
    // has ~700 characters left to send at this point, so 40 is comfortably
    // inside "one frame already in flight" and nowhere near "it kept going".
    await page.waitForTimeout(1200);
    const after = ((await answer(page).textContent()) ?? '').length;
    if (after > before + 40) {
      fail(`Stop did not abort the stream: the answer grew from ${before} to ${after} characters after the click`);
    }
  },
  async assert(page) {
    // Whatever had rendered is still on screen.
    const prose = ((await answer(page).textContent()) ?? '').trim();
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
