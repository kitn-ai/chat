// tests/primitives/card-registry.test.ts
// The registry exposes every built-in card type for both layers, and merges overrides.
//
// TYPES IS DERIVED, AND THAT IS THE POINT OF THIS FILE.
// It used to be a literal array here, which made both coverage assertions circular in
// the only direction that matters: `BUILTIN_CARD_TAGS` and `BUILTIN_CARD_COMPONENTS`
// are hand-parallel to `cardSchemas` and to each other, and the list they were checked
// against was a third hand-written copy. Measured before the change: adding an eighth
// type to `cardSchemas` left this whole file green — `mergeCardComponents(undefined)`
// still had seven entries and the length assertion below still said 7 — while the new
// card had no component at all. `<CardRenderer>` falls through to nothing for a type
// with no entry, so that card renders as an empty slot.
//
// Neither map can be DERIVED. `link` -> `kai-link-preview` is not `kai-<type>` (the
// header of src/primitives/card-tags.ts records that the MCP re-derived it by
// convention and got away with it only because no eighth type existed), and the
// component map is JSX wiring, not data. So the fix is not a derivation, it is
// checking them for completeness against the list that IS derived.
//
// `BUILTIN_CARD_TAGS` also has a second, independent guard:
// src/agent-tooling/mcp/reference.test.ts walks `cardSchemaNames` through
// `cardTagForType` and requires each to resolve to a REGISTERED element, which the
// eighth type failed. Nothing covered `BUILTIN_CARD_COMPONENTS` at all.
import {
  BUILTIN_CARD_TAGS,
  BUILTIN_CARD_COMPONENTS,
  mergeCardTags,
  mergeCardComponents,
} from '../../src/primitives/card-registry';
import { cardSchemaNames } from '../../src/schemas/index';

// `Object.keys(cardSchemas)`, the same value `cardTools()` offers a model and
// `createCardRegistry()` defaults `use` to.
const TYPES: readonly string[] = cardSchemaNames;

test('there is a built-in card type list to check against at all', () => {
  // Zero types would make every `toEqual` below true against an empty map. "Nothing
  // wrong" and "nothing examined" are the same number unless this is asserted.
  expect(TYPES.length).toBeGreaterThan(0);
});

test('built-in tag map covers exactly the built-in card types', () => {
  expect(Object.keys(BUILTIN_CARD_TAGS).sort()).toEqual([...TYPES].sort());
  expect(BUILTIN_CARD_TAGS.form).toBe('kai-form');
  expect(BUILTIN_CARD_TAGS['tasks']).toBe('kai-tasks');
  expect(BUILTIN_CARD_TAGS.choice).toBe('kai-choice');
  // The one entry that is NOT `kai-<type>`, which is why this map is a lookup and
  // not a convention.
  expect(BUILTIN_CARD_TAGS.link).toBe('kai-link-preview');
  expect(BUILTIN_CARD_TAGS.artifact).toBe('kai-artifact');
});

test('built-in component map covers exactly the built-in card types', () => {
  expect(Object.keys(BUILTIN_CARD_COMPONENTS).sort()).toEqual([...TYPES].sort());
  for (const t of TYPES) expect(typeof BUILTIN_CARD_COMPONENTS[t]).toBe('function');
});

test('the two maps agree with each other', () => {
  // Both are checked against TYPES above, so this cannot fail on its own today. It is
  // here because they are the pair a new card type has to land in TOGETHER, and a
  // failure naming which one is short is worth more than two separate reds.
  expect(Object.keys(BUILTIN_CARD_COMPONENTS).sort()).toEqual(Object.keys(BUILTIN_CARD_TAGS).sort());
});

test('mergeCardTags overrides + adds without mutating the built-ins', () => {
  const merged = mergeCardTags({ form: 'my-form', poll: 'my-poll' });
  expect(merged.form).toBe('my-form');
  expect(merged.poll).toBe('my-poll');
  expect(merged.confirm).toBe('kai-confirm');
  expect(BUILTIN_CARD_TAGS.form).toBe('kai-form'); // built-ins untouched
});

test('mergeCardComponents merges, undefined override = built-ins only', () => {
  const custom = () => null;
  const merged = mergeCardComponents({ form: custom });
  expect(merged.form).toBe(custom);
  expect(typeof merged.confirm).toBe('function');
  expect(Object.keys(mergeCardComponents(undefined))).toHaveLength(TYPES.length);
});
