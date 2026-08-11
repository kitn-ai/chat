import type { Scenario } from './types';
import { pickTools } from '../tools';
import { controlledPanel, expand, fail, seesElement, seesText, toolTrigger } from './dom';

/**
 * S12 — citations.
 *
 * EXPECTED TO FAIL, by construction. `search_docs` produces `source` parts and
 * `AssistantStream.addSource` puts them on the message in stream order, so the
 * DATA is correct and the wire half works. But `message.tsx` matches `source`
 * parts to `null` on purpose — the citation row is a later sub-project — so
 * nothing reaches the screen.
 *
 * The assertion below is written as if the row already shipped. When it does,
 * this scenario goes green and `knownGap` comes off. Until then a red S12 is the
 * gap being measured rather than assumed.
 */
export const s12Citations: Scenario = {
  id: 'S12-citations',
  title: 'Citations from a search tool',
  proves: 'source parts render as a citation the user can see and follow',
  knownGap: {
    what: 'message.tsx renders `source` parts as null (an explicit no-op <Match>): the parts arrive, the citation row does not exist yet',
    /**
     * The gap is "the parts arrive and render nothing", so the parts have to
     * ARRIVE before their non-rendering means anything. A stream that produced
     * no search call at all fails here instead, which is what a broken run
     * deserves.
     *
     * What this can and cannot see, stated plainly: the citation row is the
     * missing feature, so there is no rendered citation to point at, and the
     * closest visible evidence is the tool panel's own output. `runTool`
     * ('search_docs' in src/tools.ts) returns its `sources` from exactly the
     * `results` it renders into that output, and `useSpikeChat` calls
     * `stream.addSource` once per result unconditionally. So doc URLs in the
     * panel means source parts on the message. It does not re-prove the kit's
     * `addSource` fold — that is `@kitn.ai/ui/state`'s own suite — and it is not
     * meant to.
     */
    async reached(page) {
      const trigger = toolTrigger(page, 'search_docs');
      await seesElement(trigger, 'a search_docs tool panel', {
        because: 'a citation cannot be missing from a turn that never searched',
      });
      await seesText(page, 'Completed', { because: 'the search tool itself must still complete' });

      // Its OUTPUT, not just a green chip: the doc URLs in the panel are the
      // same list the app turns into `source` parts.
      const panel = await controlledPanel(page, trigger);
      await expand(trigger, panel, 'search_docs tool');
      await seesText(page, /ui\.kitn\.ai\//, {
        because: 'the search results ARE the sources — no results, no source parts, nothing to render',
      });
    },
    signature: /no citation rendered outside the message body/,
  },
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
