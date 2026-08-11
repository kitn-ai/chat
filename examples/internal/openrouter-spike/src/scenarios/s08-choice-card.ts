import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesAtLeast, seesRole, seesText } from './dom';

/** S8 — a choice card, and its result round-trip: pick an option, submit, and
 *  the card must flip to its resolved read-only view showing WHAT was chosen. */
export const s08ChoiceCard: Scenario = {
  id: 'S08-choice-card',
  title: 'Choice card + selection round-trip',
  proves: 'a choice card renders a real radiogroup and resolves to a read-only summary of the pick',
  prompt: 'I want to add auth to my app. Ask me which provider to use.',
  tools: pickTools('ask_choice'),
  mode: 'live',
  async assert(page) {
    const options = page.locator('[role="radio"][data-option-id]');
    await seesAtLeast(page, options, 2, 'choice options');

    const first = options.first();
    // The option's LABEL only — `textContent()` on the row would concatenate the
    // label with its description, and the resolved view echoes the label alone.
    const label = ((await first.locator('span.truncate').first().textContent()) ?? '').trim();
    if (label.length === 0) fail('the first choice option rendered with no label');

    await first.click();
    await seesRole(page, 'button', 'Choose', { because: 'the submit action is enabled once an option is picked' });
    await page.getByRole('button', { name: 'Choose' }).first().click();

    // The resolved view. Its presence is the round trip: the card stopped being
    // interactive and now states the outcome.
    await seesText(page, label, { because: 'the resolved card names the option that was chosen' });
    const stillOpen = await options.count();
    if (stillOpen !== 0) fail(`the choice card stayed interactive after submit: ${stillOpen} radios still rendered`);
  },
};
