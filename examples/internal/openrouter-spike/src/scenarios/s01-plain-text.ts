import type { Scenario } from './types';
import { neverSeesText, seesAssistantProse } from './dom';

/** S1 — the floor. Tokens arrive, a text part opens, prose renders. */
export const s01PlainText: Scenario = {
  id: 'S01-plain-text',
  title: 'Plain text streaming',
  proves: 'text deltas fold into one text part and render as prose',
  prompt: 'In two sentences, what is a web component?',
  tools: [],
  mode: 'live',
  // Half of S1's claim is an ABSENCE (no tool panel), so the empty control could
  // never falsify it. The control here is a clean tool round.
  controlDir: 'canned/CONTROL-noisy',
  async assert(page) {
    // Prose, not "a text part exists": the bubble is what the user reads.
    await seesAssistantProse(page, 60);
    // With no tools in the request there must be no tool panel. This half is
    // what stops the scenario passing on a page that renders everything.
    await neverSeesText(page, 'Completed', 'no tool panel on a tool-free turn');
  },
};
