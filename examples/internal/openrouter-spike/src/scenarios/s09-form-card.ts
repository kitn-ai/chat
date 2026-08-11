import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesAtLeast, seesText } from './dom';

/** S9 — a form card and its result round-trip: type a value, submit, and the
 *  card must render the submitted summary back. */
export const s09FormCard: Scenario = {
  id: 'S09-form-card',
  title: 'Form card + result round-trip',
  proves: 'a JSON-Schema form card renders real inputs and resolves to a summary of what was entered',
  prompt: 'I want to book a demo. Collect my name and email.',
  tools: pickTools('request_form'),
  mode: 'live',
  async assert(page) {
    const fields = page.locator('[data-field]');
    await seesAtLeast(page, fields, 2, 'form fields');

    // Fill EVERY text field, not just the first. The model decides which fields
    // are required, and a form that still has an empty required field will not
    // submit — which reads as "the card is broken" when it is the assertion that
    // is half-done.
    const inputs = page.locator('[data-field] input[type="text"], [data-field] input[type="email"]');
    const n = await inputs.count();
    if (n === 0) fail('the form card rendered fields but no text inputs');
    for (let i = 0; i < n; i++) {
      const value = /mail/i.test((await inputs.nth(i).getAttribute('id')) ?? '')
        ? 'ada@example.com'
        : 'Ada Lovelace';
      await inputs.nth(i).fill(value);
    }

    // The form's own submit, addressed by its `form` association rather than by
    // its model-authored label.
    await page.locator('button[type="submit"][form]').first().click();

    // The resolved view: "Submitted" plus a <dl> of what was entered. Asserting
    // the VALUE back is the round trip — a card that merely disables itself on
    // submit would pass a "Submitted" check and lose the data.
    await seesText(page, 'Submitted', { because: 'the form card resolves to its read-only summary' });
    await seesText(page, 'Ada Lovelace', { because: 'the summary echoes the value that was typed' });

    const live = await page.locator('[data-field] input').count();
    if (live !== 0) fail(`the form stayed editable after submit: ${live} inputs still rendered`);
  },
};
