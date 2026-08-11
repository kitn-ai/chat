import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesText } from './dom';

/**
 * S13 — an artifact that CHANGES over the course of a turn.
 *
 * EXPECTED TO FAIL, and the failure is the finding. Two things are missing:
 *
 *  1. There is no `artifact` card type. `<kai-artifact>` exists as an element but
 *     is not in `BUILTIN_CARD_TAGS`, so a model cannot reach it through a card
 *     part. This spike works around that by registering `<spike-artifact>` and
 *     passing `cardTypes={{ artifact: 'spike-artifact' }}` — the documented
 *     consumer extension point — which is the only reason the scenario renders
 *     anything at all.
 *  2. `AssistantStream` can only ever APPEND a card (`addCard` pushes a new
 *     part). There is no `updateCard`/`upsertCard` keyed by envelope id, the way
 *     `upsertTool` works for tool parts. So a second version of the same
 *     artifact renders as a SECOND card next to the first instead of replacing
 *     it, and a document the agent revises three times renders three times.
 *
 * REPLAY-ONLY: the fixture calls `open_artifact` twice with the same envelope id
 * and different content, which is precisely the thing a live model would do when
 * it revises its own draft.
 */
export const s13Artifact: Scenario = {
  id: 'S13-artifact',
  title: 'Artifact over time',
  proves: 'an artifact revised mid-turn renders ONCE, showing its latest content',
  knownGap:
    'no `artifact` card type in BUILTIN_CARD_TAGS, and AssistantStream.addCard only APPENDS — there is no id-keyed card upsert, so a revised artifact renders twice',
  prompt: 'Draft a one-paragraph release note as an artifact, then revise it.',
  tools: pickTools('open_artifact'),
  mode: 'replay',
  async assert(page) {
    // The workaround element renders, so the card-part → custom-element route is
    // genuinely exercised.
    const artifacts = page.locator('spike-artifact');
    await artifacts.first().waitFor({ state: 'attached', timeout: 20_000 });

    // The revision must be visible…
    await seesText(page, 'v2', { because: 'the revised artifact content must reach the screen' });

    // …and there must be exactly ONE artifact. This is the half that fails.
    const count = await artifacts.count();
    if (count !== 1) {
      fail(
        `expected 1 artifact after a revision, saw ${count}. ` +
          'AssistantStream.addCard appends; there is no id-keyed card upsert, so every revision stacks.',
      );
    }
  },
};
