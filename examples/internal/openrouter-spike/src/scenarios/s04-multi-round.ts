import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesAtLeast, seesProse } from './dom';
import { readHarnessState } from '../harness-state';

/** S4 — the loop runs more than twice: tool → result → tool → result → answer.
 *
 *  `get_weather` takes ONE city, so three cities need three calls. Whether they
 *  arrive as three ROUNDS or one parallel batch is the model's choice, which is
 *  exactly why the DOM assertion counts PANELS (what the user sees) and the
 *  round count is read separately, as a loop-level fact. If a model batches
 *  them, this scenario still passes and S5 is the one that covers the batch. */
export const s04MultiRound: Scenario = {
  id: 'S04-multi-round',
  title: 'Multi-round tool loop',
  proves: 'three tool results all render as Completed panels and feed one final answer',
  prompt:
    'Check the weather in Paris, then in Tokyo, then in Berlin. Wait for each result before asking for the next one. Then compare them in one short paragraph.',
  tools: pickTools('get_weather'),
  mode: 'live',
  maxRounds: 6,
  async assert(page) {
    const completed = page.getByText('Completed');
    await seesAtLeast(page, completed, 3, 'Completed tool panels (one per city)');

    const prose = await seesProse(page, 60);
    for (const city of ['Paris', 'Tokyo', 'Berlin']) {
      if (!prose.includes(city)) fail(`the final answer never mentions ${city}: ${JSON.stringify(prose.slice(0, 200))}`);
    }

    // Loop-level, NOT a UI claim — labelled as such so nobody reads a green S4
    // as evidence the UI renders round boundaries. It does not; there is no such
    // thing in the parts model, one assistant message spans every round.
    const state = await readHarnessState(page);
    if ((state?.stats?.rounds ?? 0) < 3) {
      fail(
        `the loop settled in ${state?.stats?.rounds ?? 0} rounds — the three calls arrived in one batch. ` +
          'The panels above still rendered; this is a MODEL behaviour note, not a UI failure.',
      );
    }
  },
};
