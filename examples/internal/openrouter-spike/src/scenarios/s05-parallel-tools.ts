import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesAtLeast, seesProse } from './dom';

/** S5 — two tool calls in ONE assistant turn.
 *
 *  REPLAY-ONLY on purpose. Whether a model batches its calls is a model choice,
 *  not something a prompt can pin, so a live S5 would be a coin flip that
 *  reports on the model rather than on us. The fixture pins the wire shape: two
 *  `tool_calls` entries at `index` 0 and 1, their argument fragments
 *  INTERLEAVED, which is the case a per-call accumulator gets wrong.
 *
 *  THE TWO WIRES DO NOT TEST THE SAME THING HERE, and the report says so rather
 *  than printing two identical `pass` cells. Anthropic streams content blocks
 *  strictly in sequence — block 0 opens, fills and closes before block 1 starts —
 *  so the interleaved framing is not merely absent from its fixture, it is
 *  unreachable on that wire (see `harness/make-canned-fixtures.mjs`). Writing it
 *  anyway would test a stream no provider sends. The Anthropic cell is therefore
 *  the weaker of the two claims, and `provesByWire` is what keeps a reader from
 *  mistaking it for the stronger one. */
export const s05ParallelTools: Scenario = {
  id: 'S05-parallel-tools',
  title: 'Parallel tool calls in one turn',
  proves: 'two interleaved tool calls in a single turn render as two independent Completed panels',
  provesByWire: {
    openai:
      'two calls announced up front with their argument fragments INTERLEAVED round-robin ' +
      'render as two independent Completed panels — the adversarial case, which a per-call ' +
      'accumulator that assumes a fragment is valid JSON gets wrong',
    anthropic:
      'WEAKER CLAIM than the OpenAI cell: two SEQUENTIAL tool_use blocks in one turn render as ' +
      'two independent Completed panels. Anthropic closes block 0 before opening block 1, so ' +
      'interleaved fragments cannot occur on this wire and are not tested by this cell. What it ' +
      'does test that the OpenAI cell does not: the index is a CONTENT BLOCK position, not a ' +
      'tool ordinal',
  },
  prompt: "What's the weather in Paris and Tokyo?",
  tools: pickTools('get_weather'),
  mode: 'replay',
  async assert(page) {
    const completed = page.getByText('Completed');
    await seesAtLeast(page, completed, 2, 'Completed tool panels');

    const panels = await page.locator('button[aria-controls]').filter({ hasText: 'get_weather' }).count();
    if (panels !== 2) fail(`expected exactly 2 get_weather panels from one turn, saw ${panels}`);

    await seesProse(page, 20);
  },
};
