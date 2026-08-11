import type { Scenario } from './types';
import { fail, seesText } from './dom';

/**
 * S16 — the provider dies halfway through a sentence.
 *
 * REPLAY-ONLY: a provider cannot be asked to fail on cue. The fixture streams
 * real content deltas, then an in-band `error` frame — OpenRouter's own shape
 * for "this generation blew up after headers went out", which arrives as
 * `ModelTurn.error` rather than as an HTTP status.
 *
 * The behaviour under test is that the kit does NOT throw away what already
 * rendered. A stream error must leave the partial message on screen and add the
 * failure beside it; wiping the bubble loses work the user was already reading.
 */
export const s16MidStreamError: Scenario = {
  id: 'S16-mid-stream-error',
  title: 'Mid-stream provider error',
  proves: 'an error after the first token keeps the partial message and surfaces the failure',
  prompt: 'Write a short paragraph about streaming.',
  tools: [],
  mode: 'replay',
  // A stream that SUCCEEDS is the control: if the error assertion still passes
  // against a clean turn, it is matching on something incidental.
  controlDir: 'canned/CONTROL-noisy',
  async assert(page) {
    // The prose that arrived BEFORE the error is still there.
    await seesText(page, 'Streaming is', { because: 'the partial answer must survive the failure' });

    // And the failure is visible, not swallowed.
    await seesText(page, /rate.?limit|upstream_error|failed/i, {
      because: "the provider's own error message must reach the user",
    });

    const prose = ((await page.locator('[part~="content"]').last().textContent()) ?? '').trim();
    if (prose.length === 0) fail('the assistant bubble was emptied by the error');
  },
};
