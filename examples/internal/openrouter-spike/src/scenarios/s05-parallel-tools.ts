import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesAtLeast, seesProse } from './dom';

/** S5 — two tool calls in ONE assistant turn.
 *
 *  REPLAY-ONLY on purpose. Whether a model batches its calls is a model choice,
 *  not something a prompt can pin, so a live S5 would be a coin flip that
 *  reports on the model rather than on us. The fixture pins the wire shape: two
 *  `tool_calls` entries at `index` 0 and 1, their argument fragments
 *  INTERLEAVED, which is the case a per-call accumulator gets wrong. */
export const s05ParallelTools: Scenario = {
  id: 'S05-parallel-tools',
  title: 'Parallel tool calls in one turn',
  proves: 'two interleaved tool calls in a single turn render as two independent Completed panels',
  prompt: "What's the weather in Paris and Tokyo?",
  tools: pickTools('get_weather'),
  mode: 'replay',
  async assert(page) {
    const completed = page.getByText('Completed');
    await seesAtLeast(page, completed, 2, 'Completed tool panels');

    const panels = await page.locator('button[aria-controls]').filter({ hasText: 'get_weather' }).count();
    if (panels !== 2) fail(`expected exactly 2 get_weather panels from one turn, saw ${panels}`);

    await seesProse(page, 20);
  },
};
