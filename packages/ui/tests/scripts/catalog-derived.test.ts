import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DerivedCatalog } from '../../src/agent-tooling/catalog/catalog-types';
import { listCapabilityGroups, listIntegrations } from '../../src/agent-tooling/registry';

const PKG = join(__dirname, '..', '..');
const ARTIFACT = join(PKG, 'src/agent-tooling/catalog/derived.json');

const read = () => DerivedCatalog.parse(JSON.parse(readFileSync(ARTIFACT, 'utf8')));
const meta = (): { tag: string; [k: string]: unknown }[] =>
  JSON.parse(readFileSync(join(PKG, 'src/elements/element-meta.json'), 'utf8'));

/**
 * The function-valued props, as MEASURED against this tree rather than as
 * re-computed by the generator's rule. Restating the rule here would only prove
 * the generator agrees with itself; a literal set fails the day a real prop
 * changes shape, which is the whole point of pinning it.
 */
const FUNCTION_VALUED = new Set(['kai-voice-input.transcribe', 'kai-voice-output.synthesize']);

describe('derived catalog artifact', () => {
  it('exists, parses against DerivedCatalog, and derives from the tree', () => {
    const derived = read();
    // Same element set as element-meta.json, no more, no less.
    expect(derived.elements.map((e) => e.tag).sort()).toEqual(meta().map((m) => m.tag).sort());
    // Elements carry the spec §3 fields.
    expect(derived.elements.some((e) => e.composedFrom.length > 0)).toBe(true);
    expect(derived.elements.some((e) => e.tokens.length > 0)).toBe(true);
  });

  /**
   * Presence is not content. Review demonstrated that emptying `events`,
   * `methods` and `parts` on all 80 elements, and inverting `scalar`/`optional`
   * on all 550 props, left the suite green: the schema asks only for arrays of
   * the right type, and the staleness check below cannot see a mutation that
   * both the generator and the artifact share. So re-derive every field from
   * element-meta.json and compare the whole structure at once.
   *
   * This becomes the entire guard after Task 4: once build:api regenerates
   * derived.json, the staleness check is satisfied by construction and stops
   * being a safety net for content at all.
   */
  it('re-derives every element field from element-meta.json, not merely their shapes', () => {
    const expected = meta()
      .map((m) => {
        const el = m as {
          tag: string;
          props?: { name: string; scalar?: boolean; optional?: boolean }[];
          events?: { name: string }[];
          methods?: { name: string }[];
          parts?: { name: string }[];
          composedFrom?: { name: string }[];
          tokens?: string[];
        };
        return {
          tag: el.tag,
          props: (el.props ?? []).map((p) => ({
            name: p.name,
            scalar: p.scalar === true,
            optional: p.optional === true,
            fn: FUNCTION_VALUED.has(`${el.tag}.${p.name}`),
          })),
          events: (el.events ?? []).map((e) => e.name),
          methods: (el.methods ?? []).map((x) => x.name),
          parts: (el.parts ?? []).map((p) => p.name),
          composedFrom: (el.composedFrom ?? []).map((c) => c.name),
          tokens: el.tokens ?? [],
        };
      })
      .sort((a, b) => a.tag.localeCompare(b.tag));
    expect(read().elements).toEqual(expected);
  });

  it('re-derives integrations and theme tokens from their sources, not merely non-empty', () => {
    const derived = read();
    expect(derived.integrations).toEqual(
      listIntegrations().map((i) => ({
        id: i.id,
        category: i.category,
        streamFormat: i.streamFormat,
        keyExposure: i.keyExposure,
      })),
    );
    expect(derived.capabilityGroups).toEqual(
      listCapabilityGroups().map((g) => ({ id: g.id, components: g.components })),
    );
    const tokens = [
      ...new Set(readFileSync(join(PKG, 'theme.css'), 'utf8').match(/--kai-[a-z0-9-]+/g) ?? []),
    ].sort();
    expect(tokens.length).toBeGreaterThan(1);
    expect(derived.themeTokens).toEqual(tokens);
  });

  /**
   * THREE records, not two. `emitCardEvent` (src/primitives/card-routing.ts)
   * dispatches `kai-card` bubbling and composed on purpose — cards.tsx relies on
   * it crossing shadow boundaries — and it lives outside src/elements AND names
   * its event through the `CARD_EVENT_NAME` constant, so it needed both a wider
   * scan and identifier resolution to appear. A harness reading derived.json
   * would otherwise conclude kai-card obeys the non-bubbling contract.
   *
   * `resizable.tsx` dispatches kai-maximize-state from three sites with
   * identical options: four dispatches, one record. Six `new CustomEvent` sites
   * exist under src/ outside tests and stories; define.tsx is the built-in
   * dispatch these are exceptions TO, leaving these three.
   */
  it('the protocol exceptions are extracted exactly, deduped', () => {
    expect(read().eventExceptions).toEqual([
      { file: 'src/elements/artifact.tsx', event: 'kai-maximize-intent', bubbles: true, composed: true },
      { file: 'src/elements/resizable.tsx', event: 'kai-maximize-state', bubbles: false, composed: true },
      { file: 'src/primitives/card-routing.ts', event: 'kai-card', bubbles: true, composed: true },
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
    const derived = read();
    const fnProps = derived.elements.flatMap((e) => e.props.filter((p) => p.fn).map((p) => `${e.tag}.${p.name}`));
    expect(fnProps.sort()).toEqual([...FUNCTION_VALUED].sort());

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

  /**
   * Regenerate into a TEMP DIR and diff there. Running the generator against its
   * committed path would make this test SELF-HEALING: the first run repairs the
   * artifact it is checking, so a stale file fails once and then passes forever
   * with an empty `git status` — a re-run of a flaked CI job would erase the
   * evidence of genuine staleness. It also stops this test racing the suites in
   * Tasks 6 and 8 that read the committed path in parallel.
   */
  it('regenerating changes nothing (the committed artifact is current)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'catalog-derived-'));
    try {
      const out = join(tmp, 'derived.json');
      execFileSync('node', [join(PKG, 'scripts/gen-catalog.mjs'), '--out', out], { stdio: 'pipe' });
      expect(readFileSync(out, 'utf8')).toBe(readFileSync(ARTIFACT, 'utf8'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
