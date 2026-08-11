import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesAtLeast, seesText } from './dom';

/** S10 — a tasks card and its result: tick a step, confirm, and the card must
 *  report how many of how many were chosen. */
export const s10TasksCard: Scenario = {
  id: 'S10-tasks-card',
  title: 'Tasks card + result',
  proves: 'a tasks card renders a real checklist and resolves to a "Selected n of m" summary',
  prompt: 'Give me a checklist for shipping a release, and let me tick off which steps to run.',
  tools: pickTools('plan_tasks'),
  mode: 'live',
  async assert(page) {
    const tasks = page.locator('[data-task-id]');
    await seesAtLeast(page, tasks, 2, 'checklist rows');
    const total = await tasks.count();

    await seesText(page, 'Select all', { because: 'the checklist renders its select-all affordance' });

    const box = tasks.first().locator('input[type="checkbox"]').first();
    await box.check();
    // The live count is an aria-live region: the number a screen reader hears.
    await seesText(page, '1 selected', { because: 'the checklist announces the running count' });

    // "Confirm" is the app's own label (see tools.ts): the model authors the
    // TASKS, not the button, so there is something stable to click.
    await page.getByRole('button', { name: 'Confirm', exact: true }).first().click();

    await seesText(page, `Selected 1 of ${total}`, {
      because: 'the resolved card states the outcome, not just that it happened',
    });
    const live = await page.locator('[data-task-id] input[type="checkbox"]').count();
    if (live !== 0) fail(`the checklist stayed interactive after confirm: ${live} checkboxes still rendered`);
  },
};
