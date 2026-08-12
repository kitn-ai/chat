// What `verify:schemas` structurally CANNOT check, and this does.
//
// The guard resolves both public surfaces from outside the package and asserts the
// two maps between them account for every file in src/primitives/card-schemas/ and
// for nothing else. It cannot check WHICH map a schema belongs in, because that
// distinction is semantic, not derivable from the directory: `card-envelope` and
// `confirm` are both `*.schema.json` and only a human knows one describes the
// wrapper and the other describes a payload a model is asked to produce.
//
// That split is load-bearing downstream. `cardSchemas` is the tool-candidate set:
// whatever is in it gets offered to a model as something it can emit. An envelope
// or an event schema leaking into it would hand the model a tool for the transport
// wrapper, which is not a thing it should ever fill in.

import { describe, expect, it } from 'vitest';
import { cardSchemas, cardSchemaNames, contractSchemas, isCardSchemaName } from './index';

describe('@kitn.ai/ui/schemas', () => {
  it('offers exactly the 7 card-DATA schemas as tool candidates', () => {
    expect(Object.keys(cardSchemas).sort()).toEqual([
      'artifact',
      'choice',
      'confirm',
      'embed',
      'form',
      'link',
      'tasks',
    ]);
  });

  it('keeps the 4 contract shapes out of the tool-candidate set', () => {
    expect(Object.keys(contractSchemas).sort()).toEqual([
      'card-envelope',
      'card-event',
      'form.result',
      'tasks.result',
    ]);
    for (const key of Object.keys(contractSchemas)) {
      expect(cardSchemas).not.toHaveProperty(key);
    }
  });

  it('keys each card-data schema by the CardEnvelope.type it describes', () => {
    // The key is not a filename convenience: T1.4 maps a tool call back onto an
    // envelope through it, so `cardSchemas.confirm` must be the schema for
    // `{ type: 'confirm' }` and the $id must agree.
    for (const [type, schema] of Object.entries(cardSchemas)) {
      expect(schema.$id).toBe(`https://kitn.ai/schemas/card/${type}.schema.json`);
    }
  });

  it('exposes the card types as a list and a narrowing predicate', () => {
    expect([...cardSchemaNames].sort()).toEqual(Object.keys(cardSchemas).sort());
    expect(isCardSchemaName('confirm')).toBe(true);
    expect(isCardSchemaName('card-envelope')).toBe(false);
    expect(isCardSchemaName('pricing-table')).toBe(false);
  });

  it('freezes both maps, so a consumer cannot mutate the kit-wide schemas', () => {
    expect(Object.isFrozen(cardSchemas)).toBe(true);
    expect(Object.isFrozen(contractSchemas)).toBe(true);
  });
});
