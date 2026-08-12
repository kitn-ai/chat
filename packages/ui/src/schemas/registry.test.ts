// createCardRegistry: the app's card types, once, for both ends.
//
// RUNS IN jsdom, NOT node, AND THAT IS NOT A SERVER-SAFETY CLAIM BEING DODGED.
// This file imports `mergeCardTags`/`mergeCardComponents` as VALUES, to prove the
// registry's maps actually merge rather than merely typecheck, and those live in
// primitives/card-registry.tsx, which pulls the Solid card components and calls
// `delegateEvents` at module scope. `registry.ts` itself only TYPE-imports from there,
// so nothing of that reaches the built entry. The proof of that is `verify:ssr`, which
// imports the built `dist/schemas.js` in its own child process under Node's `node`
// condition; asserting it from a test that deliberately loads the DOM half would prove
// nothing.
//
// WHAT WAS ALREADY TRUE BEFORE THIS FILE EXISTED, MEASURED ON 4b33cd8
// -------------------------------------------------------------------
// The custom-card ROUND TRIP already passed. `cardTools({ 'pricing-table': schema },
// { provider: 'openai' })` already emitted `kai_pricing-table` (a bare
// `Record<type, CardSchema>` has been a legal `CardToolInput` since T1.3) and
// `cardFromToolCall('kai_pricing-table', …)` already produced
// `{ type: 'pricing-table' }` (it tests the PREFIX, not membership, and says so). A
// throwaway probe on the pristine tree passed both. So the round-trip assertions below
// are a REGRESSION guard, not evidence that this task did anything, and they are
// labelled as such rather than counted.
//
// What did NOT exist, and is what the tests after them measure:
//   - narrowing: `cardTools({ provider })` was all seven built-ins, always;
//   - one object carrying tags AND schemas, so the client and the route cannot disagree;
//   - anything at all saying a card type was registered with no schema;
//   - a custom schema reaching the VALIDATOR, which knew only the seven built-ins.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCardRegistry } from './registry';
import { cardTools } from './tool-defs';
import { cardFromToolCall } from './from-tool-call';
import type { CardSchema } from './index';
import {
  BUILTIN_CARD_TAGS,
  mergeCardComponents,
  mergeCardTags,
  type CardComponentMap,
  type CardTagMap,
} from '../primitives/card-registry';

// Restored centrally rather than at the end of each test: an inline `mockRestore()`
// after the assertions never runs when an assertion FAILS, so the spy leaks into the
// next test and its call count is inherited. That is not hypothetical, it is what the
// deliberate RED run for `use` produced: two unrelated tests reported "expected warn to
// be called 1 times, but got 2" purely from the leak.
afterEach(() => {
  vi.restoreAllMocks();
});

const pricingSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['plans'],
  properties: {
    plans: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        required: ['id', 'name', 'price'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          price: { type: 'number', minimum: 0 },
          highlight: { type: 'boolean' },
        },
      },
    },
  },
} as unknown as CardSchema;

const app = () =>
  createCardRegistry({
    use: ['confirm', 'choice'],
    custom: {
      'pricing-table': {
        schema: pricingSchema,
        tag: 'my-pricing-table',
        description: 'Show a plan comparison the user can pick from.',
      },
    },
  });

// ---------------------------------------------------------------------------
// `use` narrows. This is the point of the object.
// ---------------------------------------------------------------------------

describe('use narrows the tool definitions', () => {
  it('produces tools for exactly the declared built-ins, plus the customs', () => {
    const tools = cardTools(app(), { provider: 'openai' });
    expect(tools.map((t) => t.function.name)).toEqual(['kai_choice', 'kai_confirm', 'kai_pricing-table']);
  });

  it('use: ["confirm"] is ONE built-in tool, not seven', () => {
    const tools = cardTools(createCardRegistry({ use: ['confirm'] }), { provider: 'anthropic' });
    expect(tools.map((t) => t.name)).toEqual(['kai_confirm']);
  });

  it('use: [] is an app whose generative UI is entirely its own', () => {
    const reg = createCardRegistry({ use: [], custom: { 'pricing-table': { schema: pricingSchema } } });
    expect(cardTools(reg, { provider: 'jsonschema' }).map((t) => t.name)).toEqual(['kai_pricing-table']);
  });

  it('omitting `use` keeps all seven, matching cardTools({provider}) and what kai-chat renders', () => {
    expect(createCardRegistry().builtIn.length).toBe(7);
    expect(cardTools(createCardRegistry(), { provider: 'openai' }).length).toBe(
      cardTools({ provider: 'openai' }).length,
    );
  });

  it('is order-stable: cardSchemas order wins over declaration order', () => {
    const a = createCardRegistry({ use: ['confirm', 'choice'] });
    const b = createCardRegistry({ use: ['choice', 'confirm', 'choice'] });
    expect(a.builtIn).toEqual(b.builtIn);
  });

  it('rejects a `use` entry that is not a built-in, naming it and the alternative', () => {
    expect(() => createCardRegistry({ use: ['pricing-table' as never] })).toThrow(/"pricing-table"/);
    expect(() => createCardRegistry({ use: ['pricing-table' as never] })).toThrow(/`custom`/);
  });
});

// ---------------------------------------------------------------------------
// Type-level compatibility with the render seam.
//
// THESE ARE CHECKED BY `tsc --noEmit`, NOT BY VITEST. tsconfig.json includes
// src/**/*.ts, so this file is in the first typecheck pass. The runtime `expect`s
// underneath them check the VALUES; the annotations above check the TYPES, and the
// pair is the point: a `tags` map that merges correctly at runtime while being typed
// as something `mergeCardTags` would reject is exactly the drift this guards.
// ---------------------------------------------------------------------------

describe('registry.tags / registry.components fit the render seam', () => {
  const registry = app();

  // Forward: what the registry offers is what the merge functions take.
  const tagsIntoMerge: Parameters<typeof mergeCardTags>[0] = registry.tags;
  const componentsIntoMerge: Parameters<typeof mergeCardComponents>[0] = registry.components;
  // Reverse: the registry's own field types are no NARROWER than the seam's, so a
  // consumer can build a map by hand and assign it in. Mutual assignability, the same
  // shape inline-element-types.test.ts uses, because one direction alone passes for a
  // type that is merely a subtype.
  const seamTagsIntoRegistry: typeof registry.tags = {} as CardTagMap;
  const seamComponentsIntoRegistry: typeof registry.components = {} as CardComponentMap;

  it('merges as the seam expects: built-ins union the custom tag, consumer wins', () => {
    expect(tagsIntoMerge).toBe(registry.tags);
    expect(componentsIntoMerge).toBe(registry.components);
    expect(seamTagsIntoRegistry).toEqual({});
    expect(seamComponentsIntoRegistry).toEqual({});

    const merged = mergeCardTags(registry.tags);
    expect(merged['pricing-table']).toBe('my-pricing-table');
    for (const [type, tag] of Object.entries(BUILTIN_CARD_TAGS)) expect(merged[type]).toBe(tag);
  });

  it('does not restate the built-in tags: mergeCardTags adds those itself', () => {
    // Listing the `use`d ones here would read as if the others had been EXCLUDED, and
    // they are not: `use` narrows what the model is told, never what renders.
    expect(Object.keys(app().tags)).toEqual(['pricing-table']);
    expect(Object.keys(mergeCardTags(app().tags))).toContain('artifact');
  });

  it('carries a Solid component through untouched', () => {
    const MyCard = (() => null) as CardComponentMap[string];
    const reg = createCardRegistry({
      use: [],
      custom: { 'pricing-table': { schema: pricingSchema, component: MyCard } },
    });
    expect(mergeCardComponents(reg.components)['pricing-table']).toBe(MyCard);
  });
});

// ---------------------------------------------------------------------------
// The round trip. REGRESSION GUARD ONLY: both halves passed before this task.
// ---------------------------------------------------------------------------

describe('custom card round trip (already green before createCardRegistry)', () => {
  it('cardTools emits kai_pricing-table and cardFromToolCall reads it back', () => {
    const tool = cardTools(app(), { provider: 'anthropic' }).find((t) => t.name === 'kai_pricing-table');
    expect(tool).toBeDefined();
    expect(tool!.description).toBe('Show a plan comparison the user can pick from.');
    // The projection carries the schema, it does not restate it.
    expect(tool!.input_schema.required).toEqual(['plans']);
    // `$schema` is meta and is stripped; the constraints are not.
    expect(tool!.input_schema).not.toHaveProperty('$schema');

    const data = { plans: [{ id: 'pro', name: 'Pro', price: 20 }] };
    expect(cardFromToolCall(tool!.name, data, { id: 'toolu_01' })).toEqual({
      type: 'pricing-table',
      id: 'toolu_01',
      data,
    });
  });

  it('falls back to the schema description when the spec gives no purpose sentence', () => {
    const reg = createCardRegistry({
      use: [],
      custom: { chart: { schema: { type: 'object', description: 'A chart.' } as unknown as CardSchema } },
    });
    expect(cardTools(reg, { provider: 'jsonschema' })[0].description).toBe('A chart.');
  });
});

// ---------------------------------------------------------------------------
// A tag with no schema: legal, loud, and skipped by cardTools.
// ---------------------------------------------------------------------------

describe('a custom type with a tag but no schema', () => {
  const tagOnly = () =>
    createCardRegistry({ use: [], custom: { 'pricing-table': { tag: 'my-pricing-table' } } });

  it('still renders: the tag reaches mergeCardTags', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mergeCardTags(tagOnly().tags)['pricing-table']).toBe('my-pricing-table');
  });

  it('is skipped by cardTools, so the model is never offered a shape nobody wrote', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cardTools(tagOnly(), { provider: 'openai' })).toEqual([]);
  });

  it('warns once, naming the type and both consequences', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reg = tagOnly();
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toContain('"pricing-table"');
    expect(msg).toContain('cardTools() skips them');
    expect(msg).toContain('registry.validate() returns null');
    expect(reg.incomplete).toEqual(['pricing-table']);
  });

  it("onIncomplete: 'throw' makes it fatal, for a build or CI", () => {
    expect(() =>
      createCardRegistry({ use: [], custom: { x: { tag: 'x-card' } }, onIncomplete: 'throw' }),
    ).toThrow(/no `schema`/);
  });

  it('an unrecognised policy still warns: only the exact word "silent" silences', () => {
    // TypeScript rejects this; shipped JS does not. A typo that disables the warning
    // about a silent hole is the failure this file exists to make impossible.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createCardRegistry({ use: [], custom: { x: { tag: 'x-card' } }, onIncomplete: 'quiet' as never });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("onIncomplete: 'silent' acknowledges it, and has to be typed to happen", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reg = createCardRegistry({ use: [], custom: { x: { tag: 'x-card' } }, onIncomplete: 'silent' });
    expect(warn).not.toHaveBeenCalled();
    expect(reg.incomplete).toEqual(['x']);
  });

  it('a schema-less custom type SHADOWING a used built-in drops the built-in schema too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reg = createCardRegistry({ use: ['confirm'], custom: { confirm: { tag: 'my-confirm' } } });
    // Offering our confirm shape while their component renders it is the drift this
    // whole contract exists to stop.
    expect(cardTools(reg, { provider: 'openai' })).toEqual([]);
    expect(reg.incomplete).toEqual(['confirm']);
  });
});

// ---------------------------------------------------------------------------
// Custom schemas reach VALIDATION, not just tool definitions.
// ---------------------------------------------------------------------------

describe('registry.validate', () => {
  it('checks a custom card the kit has never seen', () => {
    const report = app().validate('pricing-table', { plans: [] })!;
    expect(report).not.toBeNull();
    expect(report.ok).toBe(false);
    expect(report.tier).toBe('hard'); // minItems: the card has nothing to draw
    expect(report.summary).toContain('(root).plans');
    expect(report.summary).toContain('minItems');
  });

  it('tiers a custom card with the SAME table the built-ins use', () => {
    // maxItems is soft everywhere: five plans render, they are just over the declared
    // bound. If this file had its own copy of the tier table, that is exactly the fact
    // that would drift.
    const five = { plans: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: 'P', price: 1 })) };
    expect(app().validate('pricing-table', five)!.tier).toBe('soft');
    expect(app().validate('pricing-table', { plans: 'Pro' })!.tier).toBe('hard');
  });

  it('passes a well-formed custom card', () => {
    const ok = app().validate('pricing-table', { plans: [{ id: 'pro', name: 'Pro', price: 20 }] })!;
    expect(ok.ok).toBe(true);
    expect(ok.tier).toBe('ok');
  });

  it('still covers all seven built-ins regardless of `use`', () => {
    // Validation is about what ARRIVED, not about what was offered. An `artifact`
    // envelope reaching a confirm-only app renders, so it must also be checked.
    const reg = app();
    expect(reg.builtIn).not.toContain('tasks');
    expect(reg.validate('tasks', { tasks: [] })!.tier).toBe('hard');
  });

  it('returns null when nothing has a schema, keeping "unchecked" apart from "clean"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reg = createCardRegistry({ use: [], custom: { chart: { tag: 'my-chart' } } });
    expect(reg.validate('chart', { anything: true })).toBeNull();
  });

  it('a custom schema WINS over a built-in of the same name, as mergeCardTags does', () => {
    const reg = createCardRegistry({
      use: ['confirm'],
      custom: { confirm: { schema: { type: 'object', required: ['cta'] } as unknown as CardSchema } },
    });
    // Our confirm schema requires `actions`; theirs requires `cta`. Theirs is the one
    // their component renders, so theirs is the one that decides.
    expect(reg.validate('confirm', { cta: 'Ship it' })!.ok).toBe(true);
    expect(reg.validate('confirm', { actions: [{ id: 'a', label: 'A' }] })!.ok).toBe(false);
  });

  it('exposes the same map for a caller already holding a validateCardData call', () => {
    expect(Object.keys(app().validationSchemas)).toEqual(['pricing-table']);
  });
});

// ---------------------------------------------------------------------------
// Shape and immutability.
// ---------------------------------------------------------------------------

describe('registry shape', () => {
  it('reports what it declares', () => {
    const reg = app();
    expect(reg.builtIn).toEqual(['choice', 'confirm']);
    expect(reg.custom).toEqual(['pricing-table']);
    expect(reg.types).toEqual(['choice', 'confirm', 'pricing-table']);
    expect(reg.incomplete).toEqual([]);
  });

  it('is frozen: the one written-down answer cannot be edited behind the route\'s back', () => {
    const reg = app();
    expect(Object.isFrozen(reg)).toBe(true);
    expect(Object.isFrozen(reg.schemas)).toBe(true);
    expect(Object.isFrozen(reg.tags)).toBe(true);
  });

  it('rejects an empty custom type name', () => {
    expect(() => createCardRegistry({ custom: { '': { tag: 'x' } } })).toThrow(/non-empty/);
  });

  it('rejects a custom entry that is not an object', () => {
    expect(() => createCardRegistry({ custom: { x: 'my-x' as never } })).toThrow(/must be an object/);
  });
});
