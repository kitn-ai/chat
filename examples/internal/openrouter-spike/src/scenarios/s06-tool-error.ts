import type { Scenario } from './types';
import { pickTools } from '../tools';
import { controlledPanel, expand, seesText, toolTrigger } from './dom';

/** S6 — a tool that FAILS. The panel's output-error branch is unreachable from a
 *  model prompt (a model cannot make a tool fail), so the failure is engineered
 *  locally and routed through `applyToolFailure`, exactly as a consumer's own
 *  catch block would. */
export const s06ToolError: Scenario = {
  id: 'S06-tool-error',
  title: 'Tool execution error',
  proves: 'a failing tool renders the Error chip and its failure text, not a silent Completed',
  prompt: 'Deploy the api service to production.',
  tools: pickTools('fail_deploy'),
  mode: 'live',
  async assert(page) {
    const trigger = toolTrigger(page, 'fail_deploy');
    await trigger.waitFor({ state: 'visible', timeout: 20_000 });

    await seesText(page, 'Error', { because: 'the failed call must chip as Error' });

    const panel = await controlledPanel(page, trigger);
    await expand(trigger, panel, 'fail_deploy tool');
    // The verbatim failure text from tools.ts. A generic "something went wrong"
    // would pass a laxer assertion while telling the user nothing.
    await seesText(page, /upstream_unavailable|HTTP 502/, {
      because: "the panel must show the tool's own failure text",
    });
  },
};
