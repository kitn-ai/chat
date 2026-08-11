import type { Scenario } from './types';
import { pickTools } from '../tools';
import { answer, rendersAbove, seesText, toolTrigger } from './dom';

/**
 * S15 — the whole reason `content: string` became `parts: MessagePart[]`.
 *
 * A turn that produces a tool call AND a card AND prose must render them in the
 * order they streamed, interleaved inside ONE assistant message. The old model
 * could only ever render "tools above, then text", so an assertion that merely
 * checks all three EXIST would have passed against it. This one checks ORDER, by
 * layout position, which is the only thing that distinguishes the two designs.
 */
export const s15Interleaving: Scenario = {
  id: 'S15-interleaving',
  title: 'Interleaving: tool → card → text',
  proves: 'tool, card and text parts render in stream order inside one message, not grouped by kind',
  prompt:
    'First check the weather in Tokyo. Then, once you have it, offer to publish a summary of it somewhere.',
  tools: pickTools('get_weather', 'propose_action'),
  mode: 'live',
  maxRounds: 5,
  async assert(page) {
    const tool = toolTrigger(page, 'get_weather');
    await tool.waitFor({ state: 'visible', timeout: 25_000 });
    await seesText(page, 'Completed');

    const card = page.locator('button[data-action-id]').first();
    await card.waitFor({ state: 'visible', timeout: 25_000 });

    // The tool ran first, so its panel must sit ABOVE the card it led to.
    await rendersAbove(tool, 'the get_weather panel', card, 'the confirm card');
    // And the closing prose must sit below the card, because it streamed last.
    await rendersAbove(card, 'the confirm card', answer(page), 'the closing prose');
  },
};
