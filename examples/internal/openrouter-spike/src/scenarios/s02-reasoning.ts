import type { Scenario } from './types';
import { expand, fail, reasoningBody, reasoningTrigger, seesProse } from './dom';

/** S2 — reasoning deltas land in their own part and are readable on demand. */
export const s02Reasoning: Scenario = {
  id: 'S02-reasoning',
  title: 'Reasoning',
  proves: 'reasoning deltas render as a collapsed disclosure that opens to real text',
  prompt: 'Think it through step by step, then answer: how many days are in a leap year?',
  tools: [],
  mode: 'live',
  async assert(page) {
    const trigger = reasoningTrigger(page);
    await trigger.waitFor({ state: 'visible', timeout: 20_000 });

    const body = reasoningBody(trigger);
    // Reasoning renders CLOSED. Assert that first: a disclosure that is already
    // open renders its text with no interaction, and then the click below would
    // prove nothing.
    if (await body.isVisible()) fail('reasoning rendered already open; the closed→open assertion below is vacuous');

    await expand(trigger, body, 'reasoning');
    const thought = ((await body.textContent()) ?? '').trim();
    if (thought.length < 20) fail(`reasoning panel opened but holds only ${thought.length} chars of text`);

    await seesProse(page, 20);
  },
};
