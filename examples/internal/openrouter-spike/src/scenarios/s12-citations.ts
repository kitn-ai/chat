import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesElement, seesText, toolTrigger } from './dom';

/**
 * S12 — citations.
 *
 * This used to be a `knownGap`: `search_docs` produced `source` parts and
 * `AssistantStream.addSource` put them on the message in stream order, so the
 * DATA was right and the wire half worked — but `message.tsx` matched `source`
 * parts to `null` on purpose and nothing reached the screen.
 *
 * `source` parts now render as a grouped citation row (`part="citations"`)
 * OUTSIDE the message bubble, so the assertion below — which was always written
 * as if the row already shipped — is an ordinary assertion now.
 */
export const s12Citations: Scenario = {
  id: 'S12-citations',
  title: 'Citations from a search tool',
  proves: 'source parts render as a citation the user can see and follow',
  prompt: 'How does theming work in @kitn.ai/ui? Cite your sources.',
  tools: pickTools('search_docs'),
  mode: 'live',
  async assert(page) {
    // The tool half must work even though the render half does not — that is
    // what makes this a rendering gap rather than a broken tool.
    const trigger = toolTrigger(page, 'search_docs');
    await seesElement(trigger, 'a search_docs tool panel');
    await seesText(page, 'Completed', { because: 'the search tool itself must still complete' });

    // The part that does not exist yet: a citation the UI put on screen.
    //
    // The scoping matters and was learned the hard way. A bare
    // `a[href*="ui.kitn.ai/guides/theming"]` PASSED on the first live run —
    // because the model had written a markdown link in its prose, which
    // `Markdown` dutifully rendered as an anchor. That proves the model can type
    // a URL, not that the kit renders `source` parts. A citation row would live
    // OUTSIDE the message bubble, so that is what is required here.
    const outsideProse = await page
      .locator('a[href*="ui.kitn.ai"]')
      .evaluateAll((els) =>
        els
          .filter((el) => !el.closest('[part~="content"]'))
          .map((el) => (el as HTMLAnchorElement).getAttribute('href') ?? ''),
      );
    if (outsideProse.length === 0) {
      const inProse = await page.locator('[part~="content"] a[href*="ui.kitn.ai"]').count();
      fail(
        `no citation rendered outside the message body. ${inProse} link(s) appear INSIDE the prose, ` +
          'which is markdown the model typed — the `source` parts themselves render nothing.',
      );
    }
  },
};
