// The guard on the CONSUMER `cardTypes` seam's coverage.
//
// The failure this exists for is not "the seam broke". It is "the seam stopped
// being tested and nothing went red".
//
// S13 used to register `<spike-artifact>` through `cardTypes`, because the kit
// shipped no `artifact` card. That was the seam's ONLY end-to-end user. When
// `artifact` landed as the 7th built-in the workaround was correctly deleted —
// and the seam's coverage went with it, in a green suite. Coverage that exists
// only because something is MISSING is coverage on a timer: the day the gap
// closes, the coverage is deleted as dead weight by someone who is right to
// delete it.
//
// So this file checks the two things a browser assertion cannot:
//
//   1. the app's card type is STILL not a kit built-in (read off the kit, never
//      restated), so the seam is still being exercised as a seam rather than
//      shadowing a built-in with a stub;
//   2. the seam is still on an ORDINARY path — counted from the catalog, not
//      asserted by hand — rather than back to one bespoke user.
//
// Node environment, no DOM, no browser, no key, no network. Runs under
// `pnpm --filter @kitn.ai/ui-example-openrouter-spike test`, beside
// `server/reasoning-coverage.test.ts`, the harness's other check that cannot be
// skipped by choosing not to run a browser.
import { describe, expect, it } from 'vitest';
// The server-safe entry: plain data, no Solid and no DOM below it, which is what
// lets a node test read the kit's own list instead of copying it.
import { BUILTIN_CARD_TAGS } from '@kitn.ai/ui/schemas';
import { CONSUMER_CARD_TOOLS, SPIKE_CARD_SCHEMAS, SPIKE_CARD_TYPES, WEATHER_CARD_TAG } from './cards';
import { runTool, TOOL_SPECS } from './tools';
import { SCENARIOS } from './scenarios';

/** Catalog scenarios that OFFER a tool whose result renders through the seam.
 *  Offering is not rendering — S06b's arguments are malformed and S17 is
 *  cancelled mid-call, so neither produces a card — which is why the floor below
 *  is a floor and not the exact count. */
const scenariosOnTheSeam = SCENARIOS.filter((s) =>
  s.tools.some((t) => Object.prototype.hasOwnProperty.call(CONSUMER_CARD_TOOLS, t.function.name)),
);

describe('the consumer cardTypes seam', () => {
  it('registers at least one card type, and the kit ships none of them', () => {
    const types = Object.keys(SPIKE_CARD_TYPES);
    expect(types.length, 'the seam has no registered type at all, so nothing exercises it').toBeGreaterThan(0);

    for (const type of types) {
      expect(
        Object.prototype.hasOwnProperty.call(BUILTIN_CARD_TAGS, type),
        `\`${type}\` is now one of the kit's BUILT-IN card types (${Object.keys(BUILTIN_CARD_TAGS).join(', ')}).\n` +
          'A consumer entry for a built-in type does not test the seam, it SHADOWS the kit component ' +
          'with a stub — and the moment someone notices that and deletes the override (correctly), the ' +
          "seam's coverage disappears with it in a green suite. That already happened once, to " +
          '`spike-artifact`. Move the spike to a card type the kit does not ship.',
      ).toBe(false);
    }
  });

  it('draws every registered type with the app\'s OWN element, never a kai-* one', () => {
    for (const [type, tag] of Object.entries(SPIKE_CARD_TYPES)) {
      expect(tag.startsWith('kai-'), `\`${type}\` points at \`${tag}\`, which is one of the kit's own elements`).toBe(
        false,
      );
      expect(tag, `\`${type}\` must name a valid custom element`).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/);
    }
  });

  it('pairs every registered type with a schema, so the app\'s own card is not the only unchecked one', () => {
    for (const type of Object.keys(SPIKE_CARD_TYPES)) {
      expect(
        Object.prototype.hasOwnProperty.call(SPIKE_CARD_SCHEMAS, type),
        `\`${type}\` is registered in cardTypes but has no cardSchemas entry — the kit validates its ` +
          'seven built-ins and would leave this one, the card this app actually owns, unchecked',
      ).toBe(true);
    }
  });

  it('is reached by a REAL tool run, not only by a test that reaches for it', () => {
    const produced = new Set<string>();

    for (const [name, input] of Object.entries(CONSUMER_CARD_TOOLS)) {
      expect(
        TOOL_SPECS.some((t) => t.function.name === name),
        `CONSUMER_CARD_TOOLS names \`${name}\`, which is not a tool this spike ships`,
      ).toBe(true);

      const run = runTool(name, input);
      const card = run.card;
      expect(card, `\`${name}\` produced no card, so it no longer reaches the seam`).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(SPIKE_CARD_TYPES, card!.type),
        `\`${name}\` produced a \`${card!.type}\` card, which is not registered through cardTypes`,
      ).toBe(true);
      produced.add(card!.type);
    }

    // The other direction: a type registered in `cardTypes` that nothing emits is
    // a seam entry with no traffic, which is how this rots back into decoration.
    for (const type of Object.keys(SPIKE_CARD_TYPES)) {
      expect(
        produced.has(type),
        `\`${type}\` is registered through cardTypes but no tool in CONSUMER_CARD_TOOLS produces one`,
      ).toBe(true);
    }
  });

  it('carries a payload the app\'s element can actually draw', () => {
    const run = runTool('get_weather', { city: 'Paris' });
    // Not "a card exists": the assertion the browser makes is that the CONDITION
    // renders inside the card, and it can only do that if the tool put it there.
    expect(run.card?.data).toMatchObject({ city: 'Paris', condition: 'Light rain', units: '°C' });
  });

  it('sits on an ORDINARY path, offered by several scenarios rather than one', () => {
    const ids = scenariosOnTheSeam.map((s) => s.id);
    expect(
      ids.length,
      `only ${ids.length} catalog scenario(s) offer a consumer-card tool (${ids.join(', ') || 'none'}).\n` +
        'The point of hanging the `weather` card off `get_weather` is that the seam rides the path the ' +
        'spike ALREADY takes, so breaking `cardTypes` breaks several cells at once. A seam that only a ' +
        'single purpose-built scenario touches cannot rot loudly, because nothing real depends on it — ' +
        'which is how the last one died.',
    ).toBeGreaterThanOrEqual(3);
  });

  it('is asserted by the scenarios that render it, not merely offered', () => {
    // `seesConsumerCards` is the ONLY place the harness looks at the seam. If no
    // scenario calls it, every check above still passes and the end-to-end
    // coverage is gone again — the exact shape of the original failure.
    const assertions = SCENARIOS.filter((s) => /seesConsumerCards/.test(s.assert.toString()));
    expect(
      assertions.map((s) => s.id).length,
      'no scenario asserts the consumer card renders. The seam would be registered, fed by a real ' +
        'tool, and measured by nothing.',
    ).toBeGreaterThanOrEqual(2);
  });

  it('names the element the harness locates, in one place', () => {
    expect(Object.values(SPIKE_CARD_TYPES)).toContain(WEATHER_CARD_TAG);
  });
});
