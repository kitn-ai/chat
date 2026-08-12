import type { Scenario } from './types';
import { pickTools } from '../tools';
import { fail, seesElement } from './dom';

/**
 * S13 — an artifact that CHANGES over the course of a turn.
 *
 * This was the harness's longest-standing red cell, and it measured two gaps at
 * once. Both are now closed, so the `knownGap` is gone and this is an ordinary
 * assertion:
 *
 *  1. `artifact` is the 7th BUILT-IN card type. The spike used to register its
 *     own `<spike-artifact>` through the `cardTypes` seam, which is also why the
 *     locator below changed: a non-overridden built-in renders as a Solid
 *     component with no `kai-*` tag of its own, so `[data-card-type="artifact"]`
 *     on the card's own wrapper is the stable handle. It is scoped to
 *     `<kai-thread>` so it can only ever count cards the THREAD rendered.
 *  2. `AssistantStream.addCard` upserts on `envelope.id` instead of appending,
 *     so revising an artifact replaces it rather than stacking a second copy.
 *
 * REPLAY-ONLY: the fixture calls `open_artifact` twice with the same envelope id
 * and different content, which is precisely the thing a live model would do when
 * it revises its own draft.
 */
export const s13Artifact: Scenario = {
  id: 'S13-artifact',
  title: 'Artifact over time',
  proves: 'an artifact revised mid-turn renders ONCE, showing its latest content',
  prompt: 'Draft a one-paragraph release note as an artifact, then revise it.',
  tools: pickTools('open_artifact'),
  mode: 'replay',
  async assert(page) {
    // The built-in card's own wrapper, inside the thread's shadow root.
    const artifacts = page.locator('kai-thread [data-card-type="artifact"]');
    await seesElement(artifacts, 'an artifact card', {
      because: 'the `artifact` card type must render from a card part with no consumer override',
    });

    // The revision must be visible INSIDE THE CARD. The scoping is the whole
    // assertion and it was learned here, the same way S12 learned its own: an
    // unscoped `v2` check passes off the <kai-tool> panel, which echoes the
    // model's `open_artifact` ARGUMENTS — body text included — a few inches up
    // the thread. That proves the model typed "v2", not that the artifact card
    // rendered it. Scoped to the card, it also catches the card rendering as
    // empty chrome, which is what a payload the card cannot read produces.
    await seesElement(artifacts.first().getByText('v2'), 'the revised artifact body inside the card', {
      because: 'the card must show the LATEST draft, not just exist',
    });

    // …and there must be exactly ONE artifact: the revision REPLACED the draft.
    const count = await artifacts.count();
    if (count !== 1) {
      fail(
        `expected 1 artifact after a revision, saw ${count}. ` +
          'AssistantStream.addCard upserts on the envelope id, so a revision must replace the card it revises.',
      );
    }
  },
};
