import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesRole } from './dom';

/** S7 — generative UI, path A: a tool call becomes a confirm card PART inside
 *  the assistant message. */
export const s07ConfirmCard: Scenario = {
  id: 'S07-confirm-card',
  title: 'Confirm card',
  proves: 'a card part renders the real confirm card with its model-authored label and both actions',
  prompt: 'Redeploy the staging environment for me.',
  tools: pickTools('propose_action'),
  mode: 'live',
  async assert(page) {
    // "Not now" is OURS (tools.ts hard-codes the cancel action), so it proves the
    // envelope reached the real ConfirmCard rather than any markdown the model
    // may have written about approving something.
    await seesRole(page, 'button', 'Not now', { because: 'the confirm card renders its cancel action' });

    // The approve button's label is MODEL-authored, so it cannot be asserted by
    // string. Assert instead that a second, distinct action button exists inside
    // the same card — that is what makes it a confirm card and not a notice.
    const actions = page.locator('button[data-action-id]');
    const count = await actions.count();
    if (count < 2) fail(`expected the confirm card to render 2 action buttons, saw ${count}`);

    const approve = page.locator('button[data-action-id]:not([data-action-id="cancel"])').first();
    const label = ((await approve.textContent()) ?? '').trim();
    if (label.length === 0) fail('the approve action rendered with an empty label');
  },
};
