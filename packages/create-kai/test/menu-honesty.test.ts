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
import { answerAxis, cliAxes, decideAxis } from '../src/axes';
import type { Axis } from '../src/axes';
import { availableFeatures } from '../src/features';
import { readyFrameworks } from '../src/frameworks';
import { generate } from '../src/generate';
import { readyLayouts } from '../src/layouts';
import type { ProjectPlan } from '../src/types';
import { CONSTRUCT_SCHEMA_URL, ConstructSchema } from '@kitn.ai/ui/construct';
import { composeConstruct, runWizard, shapeAxis } from '../src/wizard';
import type { ShapeId } from '../src/wizard';

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

  /**
   * `answerAxis` under two spies — WHAT IT CALLED, not what the axis carries.
   *
   * The first version of this block read `decideAxis(axis).statement` and
   * asserted it was non-null. That is the trap this repo keeps paying for:
   * mutation testing deleted the single line `if (decision.statement)
   * state(...)` from the caller and the whole suite stayed green while the
   * silent-skip defect was back on BOTH axes. A statement nobody prints is
   * exactly as silent as no statement. So the rule moved into `axes.ts` behind
   * an injected `AxisIo`, and this drives it.
   */
  function run(axis: Axis, opts: Partial<Parameters<typeof answerAxis>[1]> = {}) {
    const calls = { asked: [] as string[], stated: [] as [string, string][] };
    const io = {
      ask: async (a: Axis) => {
        calls.asked.push(a.id);
        return a.options[0].id;
      },
      state: (label: string, statement: string) => {
        calls.stated.push([label, statement]);
      },
    };
    return {
      calls,
      answer: answerAxis(axis, { nonInteractive: false, fallback: 'FALLBACK', ...opts }, io),
    };
  }

  for (const framework of readyFrameworks()) {
    it(`${framework.id}: states what it decides and asks what it does not`, async () => {
      const axes = cliAxes(framework);
      expect(axes.length, `${framework.id} has no axes — this asserted nothing`).toBeGreaterThan(0);

      for (const axis of axes) {
        const { calls, answer } = run(axis);
        const chosen = await answer;

        if (decideAxis(axis).ask) {
          seen.asked.push(`${framework.id}/${axis.id}`);
          expect(calls.asked, `the '${axis.id}' axis has a real choice and did not ask`).toEqual([
            axis.id,
          ]);
          expect(
            calls.stated,
            `the '${axis.id}' axis asked AND stated — the user answers a question, then is told ` +
              'what was decided for them',
          ).toEqual([]);
          continue;
        }

        seen.stated.push(`${framework.id}/${axis.id}`);
        expect(
          calls.asked,
          `the '${axis.id}' axis has one answer for ${framework.id} and still rendered a select — ` +
            'a question with nothing to choose',
        ).toEqual([]);
        expect(
          calls.stated.length,
          `the '${axis.id}' axis has exactly one answer for ${framework.id} and printed nothing — ` +
            'it was decided for the user without telling them, which is the gateway defect',
        ).toBe(1);

        const [label, statement] = calls.stated[0];
        expect(label).toBe(axis.label);
        // The line has to name the answer and say why it is the only one. A
        // statement that is just the label tells a reader nothing they can act
        // on, which is why `Axis.because` is required.
        expect(statement).toContain(axis.options[0].label);
        expect(statement.length).toBeGreaterThan(axis.options[0].label.length + 10);
        // And the answer it returns is the one it stated, not the fallback.
        expect(chosen).toBe(axis.options[0].id);
      }
    });
  }

  /**
   * BOTH BRANCHES MUST OCCUR IN THE SHIPPED TABLE, or the loop above is half a
   * test: with everything asked it asserts nothing about stating, and with
   * everything stated nothing proves the select still renders when there IS a
   * choice.
   */
  it('exercised both a real choice and a decided-for-you answer', () => {
    expect(seen.stated, 'no axis was decided for the user — the rule went untested').not.toEqual([]);
    expect(seen.asked, 'no axis had a real choice — the select path went untested').not.toEqual([]);
  });

  /**
   * THE TWO PATHS THAT MUST STAY SILENT, so "always state" is not how the tests
   * above get satisfied. `--yes` output is read by scripts, and a flag is an
   * answer the user already gave.
   */
  it('says nothing in non-interactive mode, on either kind of axis', async () => {
    for (const framework of readyFrameworks()) {
      for (const axis of cliAxes(framework)) {
        const { calls, answer } = run(axis, { nonInteractive: true });
        await answer;
        expect(calls.stated, `${framework.id}/${axis.id} printed prompt furniture under --yes`).toEqual([]);
        expect(calls.asked, `${framework.id}/${axis.id} tried to prompt under --yes`).toEqual([]);
      }
    }
  });

  it('says nothing and asks nothing when a flag already answered the axis', async () => {
    const axis = cliAxes(readyFrameworks()[0])[0];
    const { calls, answer } = run(axis, { override: 'from-the-flag' });
    expect(await answer).toBe('from-the-flag');
    expect(calls.stated).toEqual([]);
    expect(calls.asked).toEqual([]);
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

describe('every shape the axis offers actually composes (the wizard-side menu-honesty rule)', () => {
  const constructShapes = shapeAxis()
    .options.map((o) => o.id)
    .filter((id): id is Exclude<ShapeId, 'app'> => id !== 'app');

  it('offers at least one construct shape, so the loop below is not vacuous', () => {
    expect(constructShapes.length).toBeGreaterThan(0);
  });

  for (const shape of constructShapes) {
    it(`${shape}: the non-interactive answers compose a construct the REAL schema accepts`, async () => {
      const io = {
        text: async () => '',
        confirm: async () => false,
        multilineList: async () => [],
        state: () => {},
      };
      const answers = await runWizard(shape, 'menu-app', io, true);
      const construct = composeConstruct(answers) as { $schema?: string };
      const parsed = ConstructSchema.safeParse(construct);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
      expect(construct.$schema).toBe(CONSTRUCT_SCHEMA_URL);
    });
  }
});
