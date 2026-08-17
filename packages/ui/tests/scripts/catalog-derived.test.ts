import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DerivedCatalog } from '../../src/agent-tooling/catalog/catalog-types';

const PKG = join(__dirname, '..', '..');
const ARTIFACT = join(PKG, 'src/agent-tooling/catalog/derived.json');

describe('derived catalog artifact', () => {
  it('exists, parses against DerivedCatalog, and derives from the tree', () => {
    const derived = DerivedCatalog.parse(JSON.parse(readFileSync(ARTIFACT, 'utf8')));
    const meta = JSON.parse(readFileSync(join(PKG, 'src/elements/element-meta.json'), 'utf8'));
    // Same element set as element-meta.json, no more, no less.
    expect(derived.elements.map((e) => e.tag).sort()).toEqual(meta.map((m: { tag: string }) => m.tag).sort());
    // Elements carry the spec §3 fields.
    expect(derived.elements.some((e) => e.composedFrom.length > 0)).toBe(true);
    expect(derived.elements.some((e) => e.tokens.length > 0)).toBe(true);
  });

  it('the protocol exceptions are extracted exactly, deduped', () => {
    const derived = DerivedCatalog.parse(JSON.parse(readFileSync(ARTIFACT, 'utf8')));
    expect(derived.eventExceptions).toEqual([
      { file: 'src/elements/artifact.tsx', event: 'kai-maximize-intent', bubbles: true, composed: true },
      { file: 'src/elements/resizable.tsx', event: 'kai-maximize-state', bubbles: false, composed: true },
    ]);
  });

  // `fn` is derived by PARSING A FORMATTED TYPE STRING out of element-meta.json,
  // so its meaning depends on how `build:api`'s type printer spaces and orders
  // unions. That is exactly the kind of dependency that changes without anyone
  // noticing: a printer that emitted `string | undefined` instead of
  // `undefined | string`, or dropped the space around the pipe, would silently
  // reclassify props while every schema check stayed green. Pin the whole
  // result, not a spot check.
  it('marks exactly the function-valued props, and nothing that merely contains a callback', () => {
    const derived = DerivedCatalog.parse(JSON.parse(readFileSync(ARTIFACT, 'utf8')));
    const fnProps = derived.elements.flatMap((e) => e.props.filter((p) => p.fn).map((p) => `${e.tag}.${p.name}`));
    expect(fnProps.sort()).toEqual(['kai-voice-input.transcribe', 'kai-voice-output.synthesize']);

    // The two conjuncts of the rule, each with the case that breaks it alone.
    // `includes('=>')` without `startsWith('(')` would sweep these in: they are
    // an object and an array that CONTAIN callbacks, not callbacks.
    const named = (tag: string, prop: string) =>
      derived.elements.find((e) => e.tag === tag)?.props.find((p) => p.name === prop);
    expect(named('kai-cards', 'policy')?.fn).toBe(false);
    expect(named('kai-toast-region', 'toasts')?.fn).toBe(false);
    // `startsWith('(')` without `includes('=>')` would sweep these in: parenthesised
    // unions, `undefined | (A | B)[]`.
    expect(named('kai-composer', 'highlights')?.fn).toBe(false);
    expect(named('kai-suggestions', 'suggestions')?.fn).toBe(false);

    // `fn` is non-optional by design: absent and false must not be confusable,
    // so every prop record carries it.
    expect(derived.elements.every((e) => e.props.every((p) => typeof p.fn === 'boolean'))).toBe(true);
  });

  it('regenerating changes nothing (the committed artifact is current)', () => {
    const before = readFileSync(ARTIFACT, 'utf8');
    execFileSync('node', [join(PKG, 'scripts/gen-catalog.mjs')], { stdio: 'pipe' });
    const after = readFileSync(ARTIFACT, 'utf8');
    expect(after).toBe(before);
  });
});
