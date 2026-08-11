import type { Scenario } from './types';
import { pickTools } from '../tools';
import { controlledPanel, expand, seesText, toolTrigger } from './dom';

/** S6b — arguments that never finish. The fixture's `arguments` string is cut
 *  off mid-JSON with `finish_reason: "length"`, which is what a real token-limit
 *  truncation looks like on the wire. REPLAY-ONLY: no prompt makes a model
 *  reliably emit broken JSON. */
export const s06bMalformedArgs: Scenario = {
  id: 'S06b-malformed-args',
  title: 'Malformed tool arguments',
  proves: 'truncated tool arguments render as an Error panel that says WHY, instead of a dead panel',
  prompt: "What's the weather in Paris?",
  tools: pickTools('get_weather'),
  mode: 'replay',
  async assert(page) {
    const trigger = toolTrigger(page, 'get_weather');
    await trigger.waitFor({ state: 'visible', timeout: 20_000 });

    await seesText(page, 'Error', { because: 'unparseable arguments must chip as Error' });

    const panel = await controlledPanel(page, trigger);
    await expand(trigger, panel, 'get_weather tool');
    await seesText(page, /Malformed tool arguments/, {
      because: 'the panel must name the failure, not just colour itself red',
    });
    // The adapter is expected to attribute the truncation to the token limit.
    await seesText(page, /token limit/, { because: 'finish_reason=length must be explained to the user' });
  },
};
