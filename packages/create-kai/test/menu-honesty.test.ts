/**
 * THE MENU MUST ONLY OFFER WHAT THE GENERATOR CAN EMIT.
 *
 * Every other test in this package drives a feature list someone chose by hand,
 * which is exactly how the shipped defect stayed green: `--yes` defaults to
 * `['conversations']`, the one cell that works, and nothing drove the other five
 * the prompt was showing. `create-kai@0.1.4` offered six features and scaffolded
 * one — the other five, and the empty selection, threw
 * "generated feature surfaces are not wired in this release" AFTER the user had
 * answered every prompt.
 *
 * So the subject here is not a feature list. It is the prompt's OWN list:
 * `availableFeatures(framework)` is what `index.ts` renders as options, and each
 * option is driven through `generate()` against the real templates. A feature
 * that cannot be scaffolded fails here whether or not anyone remembered to add a
 * case for it, and a feature added to the menu later is covered on arrival.
 *
 * VACUITY IS GUARDED TWICE, because "the menu offers nothing" and "the menu
 * offers only things that work" are the same green here otherwise: the offered
 * set must be non-empty for every ready framework, and the zero-config default
 * must be inside it.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ZERO_CONFIG } from '../src/args';
import { cliAxes, decideAxis } from '../src/axes';
import { availableFeatures } from '../src/features';
import { readyFrameworks } from '../src/frameworks';
import { generate } from '../src/generate';
import { readyLayouts } from '../src/layouts';
import type { ProjectPlan } from '../src/types';

const TEMPLATE_ROOT = path.resolve(__dirname, '../dist/templates');

const plan = (dir: string, over: Partial<ProjectPlan> = {}): ProjectPlan => ({
  dir,
  name: 'menu-app',
  frameworkId: 'react',
  layout: 'full-screen',
  widgetStyle: null,
  featureIds: [],
  gatewayId: 'mock',
  kit: '^9.9.9',
  kitBuiltAgainst: '9.9.9',
  ...over,
});

let root: string;

beforeAll(async () => {
  if (!existsSync(TEMPLATE_ROOT)) {
    throw new Error(
      `no templates at ${TEMPLATE_ROOT} — run \`pnpm --filter create-kai run build\` first`,
    );
  }
  root = await mkdtemp(path.join(tmpdir(), 'create-kai-menu-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** One scaffold into its own directory under the shared root. */
async function scaffold(id: string, over: Partial<ProjectPlan>): Promise<void> {
  const dir = path.join(root, id);
  await generate(plan(dir, over), { templateRoot: TEMPLATE_ROOT });
  await rm(dir, { recursive: true, force: true });
}

describe('every feature the prompt offers actually scaffolds', () => {
  for (const framework of readyFrameworks()) {
    const offered = availableFeatures(framework);

    it(`${framework.id}: offers at least one feature, so the loop below is not vacuous`, () => {
      expect(
        offered.map((f) => f.id),
        `${framework.id} offers no features at all — the loop below asserts nothing`,
      ).not.toEqual([]);
    });

    for (const feature of offered) {
      it(`${framework.id} + ${feature.id}`, async () => {
        // No try/catch: the failure IS the message. `generate` throws with the
        // reason the CLI would have printed after the user answered every prompt.
        await scaffold(`${framework.id}-${feature.id}`, {
          frameworkId: framework.id,
          featureIds: [feature.id],
        });
      });
    }

    /**
     * The empty selection is a real answer to a multi-select — pressing Enter
     * with everything unticked — and `--features none` spells it on the command
     * line. It threw in 0.1.4 exactly like the five unwired features did.
     */
    it(`${framework.id} + no features`, async () => {
      await scaffold(`${framework.id}-none`, { frameworkId: framework.id, featureIds: [] });
    });
  }
});

describe('the zero-config answers are inside the offered menu', () => {
  it('offers every feature `--yes` picks, on every ready framework', () => {
    for (const framework of readyFrameworks()) {
      const offered = availableFeatures(framework).map((f) => f.id);
      for (const id of ZERO_CONFIG.features) {
        expect(
          offered,
          `--yes picks '${id}' on ${framework.id}, which the prompt does not offer there`,
        ).toContain(id);
      }
    }
  });

  it('offers the layout `--yes` picks', () => {
    expect(readyLayouts().map((l) => l.id)).toContain(ZERO_CONFIG.layout);
  });
});

/**
 * AN AXIS WITH ONE POSSIBLE ANSWER IS STATED, NOT SILENTLY TAKEN.
 *
 * The same rule the features menu obeys, applied to the select axes — and the
 * gateway axis is why it needed a test rather than a convention. It was written
 * for the layout axis, which rendered a one-option select; the gateway axis a
 * hundred lines below did the *opposite* and took its single answer in silence,
 * and neither site made the other visible. Six of the eight ready frameworks can
 * host no gateway but the mock, so most interactive runs never saw the backend
 * question in any form and were never told what had been decided for them.
 *
 * The subject is `cliAxes()`, which is what `index.ts` calls — not a list
 * written here. An axis absent from it is an axis nobody checks, so the ids are
 * recorded below.
 */
describe('an axis with one possible answer is stated, not taken in silence', () => {
  const seen = { asked: [] as string[], stated: [] as string[] };

  for (const framework of readyFrameworks()) {
    it(`${framework.id}: every one-answer axis carries a line the user can read`, () => {
      const axes = cliAxes(framework);
      expect(axes.length, `${framework.id} has no axes — this asserted nothing`).toBeGreaterThan(0);

      for (const axis of axes) {
        const decision = decideAxis(axis);
        if (decision.ask) {
          seen.asked.push(`${framework.id}/${axis.id}`);
          continue;
        }
        seen.stated.push(`${framework.id}/${axis.id}`);
        expect(
          decision.only,
          `the '${axis.id}' axis has no answer at all for ${framework.id}`,
        ).not.toBeNull();
        expect(
          decision.statement,
          `the '${axis.id}' axis has exactly one answer for ${framework.id} and states nothing — ` +
            'it would be decided for the user without telling them, which is the gateway defect',
        ).not.toBeNull();
        // The line has to name the answer and say why it is the only one. A
        // statement that is just the label tells a reader nothing they can act
        // on, which is why `Axis.because` is required.
        expect(decision.statement).toContain(decision.only!.label);
        expect(decision.statement!.length).toBeGreaterThan(decision.only!.label.length + 10);
      }
    });
  }

  /**
   * BOTH BRANCHES MUST OCCUR IN THE SHIPPED TABLE, or the loop above is half a
   * test: with everything asked it asserts nothing, and with everything stated
   * nothing proves the select still renders when there IS a choice.
   */
  it('exercised both a real choice and a decided-for-you answer', () => {
    expect(seen.stated, 'no axis was decided for the user — the rule went untested').not.toEqual([]);
    expect(seen.asked, 'no axis had a real choice — the select path went untested').not.toEqual([]);
  });

  /**
   * The axis roster, recorded rather than derived, because there is nothing to
   * derive it from: `index.ts` cannot be imported (it calls `main()` at module
   * scope), so nothing can check that every axis it decides is in `cliAxes()`.
   * If a new select axis lands, this fails and points at the gap.
   */
  it('governs every select axis the CLI has', () => {
    expect(cliAxes(readyFrameworks()[0]).map((a) => a.id)).toEqual(['layout', 'gateway']);
  });
});
