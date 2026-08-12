// tests/primitives/card-registry.test.ts
// The registry exposes the 7 built-in card types for both layers and merges overrides.
import {
  BUILTIN_CARD_TAGS,
  BUILTIN_CARD_COMPONENTS,
  mergeCardTags,
  mergeCardComponents,
} from '../../src/primitives/card-registry';

const TYPES = ['form', 'confirm', 'tasks', 'choice', 'link', 'embed', 'artifact'];

test('built-in tag map covers exactly the 7 card types', () => {
  expect(Object.keys(BUILTIN_CARD_TAGS).sort()).toEqual([...TYPES].sort());
  expect(BUILTIN_CARD_TAGS.form).toBe('kai-form');
  expect(BUILTIN_CARD_TAGS['tasks']).toBe('kai-tasks');
  expect(BUILTIN_CARD_TAGS.choice).toBe('kai-choice');
  expect(BUILTIN_CARD_TAGS.link).toBe('kai-link-preview');
  expect(BUILTIN_CARD_TAGS.artifact).toBe('kai-artifact');
});

test('built-in component map covers exactly the 7 card types', () => {
  expect(Object.keys(BUILTIN_CARD_COMPONENTS).sort()).toEqual([...TYPES].sort());
  for (const t of TYPES) expect(typeof BUILTIN_CARD_COMPONENTS[t]).toBe('function');
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
  expect(Object.keys(mergeCardComponents(undefined))).toHaveLength(7);
});
