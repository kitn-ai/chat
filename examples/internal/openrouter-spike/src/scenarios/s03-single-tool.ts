import type { Scenario } from './types';
import { pickTools } from '../tools';
import { controlledPanel, expand, seesConsumerCards, seesProse, seesText, toolTrigger } from './dom';

/**
 * S3 — one tool call, end to end: announce → arguments → local run → output.
 *
 * It also carries the harness's coverage of the CONSUMER `cardTypes` seam, and
 * that is deliberate rather than convenient. The seam's previous end-to-end user
 * was S13's `<spike-artifact>`, which existed only because the kit shipped no
 * `artifact` card; when `artifact` became a built-in the workaround was correctly
 * deleted and the seam's only coverage went with it, silently. So the replacement
 * is not a scenario that reaches for the seam — it is the seam sitting on the
 * path the spike's most-used tool already takes. `get_weather` now returns a
 * `weather` card, a type the kit does not ship, and it renders here for the same
 * reason it renders for a user typing into the composer.
 */
export const s03SingleTool: Scenario = {
  id: 'S03-single-tool',
  title: 'Single tool call',
  proves:
    'a tool call renders a panel that reaches Completed and shows its real input and output, ' +
    "and its card renders through the consumer `cardTypes` seam as the app's own element",
  prompt: "What's the weather in Paris?",
  tools: pickTools('get_weather'),
  mode: 'live',
  async assert(page) {
    const trigger = toolTrigger(page, 'get_weather');
    await trigger.waitFor({ state: 'visible', timeout: 20_000 });

    // The chip is the state the user reads off the collapsed panel.
    await seesText(page, 'Completed', { because: 'the tool panel must reach output-available' });

    const panel = await controlledPanel(page, trigger);
    await expand(trigger, panel, 'get_weather tool');

    // The panel must show the model's ARGUMENTS and the tool's REAL output, not
    // just a green chip. "Light rain" is the canned Paris fixture in tools.ts,
    // so seeing it proves the local run's result reached the panel.
    await seesText(page, 'Paris', { because: 'the panel renders the arguments the model sent' });
    await seesText(page, 'Light rain', { because: "the panel renders the tool's own output" });

    // The CONSUMER SEAM. One tool call, one observation, so exactly one card —
    // drawn by <spike-weather-card>, which the kit only ever creates because
    // ThreadView registered `weather` through `cardTypes`.
    await seesConsumerCards(page, 1, ['Light rain']);

    await seesProse(page, 30);
  },
};
