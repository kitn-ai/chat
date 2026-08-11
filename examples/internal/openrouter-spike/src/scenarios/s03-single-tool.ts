import type { Scenario } from './types';
import { pickTools } from '../tools';
import { controlledPanel, expand, seesProse, seesText, toolTrigger } from './dom';

/** S3 — one tool call, end to end: announce → arguments → local run → output. */
export const s03SingleTool: Scenario = {
  id: 'S03-single-tool',
  title: 'Single tool call',
  proves: 'a tool call renders a panel that reaches Completed and shows its real input and output',
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

    await seesProse(page, 30);
  },
};
