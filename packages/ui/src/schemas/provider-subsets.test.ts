// The two subsets are two DOCUMENTS, and this file's job is to keep them that way.
//
// The failure this repo has shipped more than once is a check keyed on something
// that exists on only one of two wires, passing forever while covering one. The
// structural defence is that OPENAI_STRICT and ANTHROPIC_STRICT are written out
// independently and asserted to DIFFER. If someone ever "simplifies" them into one
// table with a provider flag, or copy-pastes one over the other, the first test here
// goes red before the projection can start lying about what a provider accepts.

import { describe, expect, it } from 'vitest';
import { cardSchemas } from './index';
import { ANTHROPIC_STRICT, OPENAI_STRICT, checkProviderSubset, providerSubsets } from './provider-subsets';

const keywordsOf = (violations: { keyword: string }[]) => violations.map((v) => v.keyword);

describe('the two provider subsets are two documents', () => {
  it('DIFFER, so a copy-paste that collapses them fails loudly', () => {
    expect(OPENAI_STRICT).not.toEqual(ANTHROPIC_STRICT);
    expect(OPENAI_STRICT.keywords).not.toEqual(ANTHROPIC_STRICT.keywords);
    expect(OPENAI_STRICT.id).not.toBe(ANTHROPIC_STRICT.id);
  });

  it('each carries the source doc it was read off, and when', () => {
    for (const subset of Object.values(providerSubsets)) {
      expect(subset.source).toMatch(/^https:\/\//);
      expect(subset.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Every violation message quotes the source, so a stale rule is arguable
      // against a URL rather than against someone's memory.
      expect(subset.source.length).toBeGreaterThan(20);
    }
  });

  // `minItems` is the tell named in the plan's guard table. It is legal at any value
  // on OpenAI and legal only at 0 or 1 on Anthropic, so a single shared table cannot
  // express it and a collapsed one gets it wrong in a way that 400s at request time.
  it('disagree about minItems, which is the tell', () => {
    const arrayOfFive = { type: 'array', minItems: 5, items: { type: 'string' } };
    expect(keywordsOf(checkProviderSubset(arrayOfFive, OPENAI_STRICT))).not.toContain('minItems');
    expect(keywordsOf(checkProviderSubset(arrayOfFive, ANTHROPIC_STRICT))).toContain('minItems');

    const arrayOfOne = { type: 'array', minItems: 1, items: { type: 'string' } };
    expect(keywordsOf(checkProviderSubset(arrayOfOne, ANTHROPIC_STRICT))).not.toContain('minItems');
  });

  // Each of these is a rule the plan got wrong or did not have, checked against the
  // live docs on 2026-08-11. They are asserted one by one rather than as a snapshot,
  // so a future doc re-read that changes ONE of them says which one.
  it('disagree about allOf: unsupported on OpenAI, supported on Anthropic', () => {
    expect(OPENAI_STRICT.keywords.allOf.status).toBe('unsupported');
    expect(ANTHROPIC_STRICT.keywords.allOf.status).toBe('supported');
  });

  it('disagree about pattern: supported on OpenAI, absent from Anthropic', () => {
    expect(OPENAI_STRICT.keywords.pattern.status).toBe('supported');
    expect(ANTHROPIC_STRICT.keywords.pattern.status).toBe('unsupported');
  });

  it('disagree about the format VALUE list: Anthropic has `uri`, OpenAI does not', () => {
    const withUri = { type: 'string', format: 'uri' };
    expect(keywordsOf(checkProviderSubset(withUri, OPENAI_STRICT))).toContain('format');
    expect(keywordsOf(checkProviderSubset(withUri, ANTHROPIC_STRICT))).not.toContain('format');
    // and they agree on one that is on both lists, so the difference is the value
    // list and not the keyword being broken on one side
    const withEmail = { type: 'string', format: 'email' };
    expect(checkProviderSubset(withEmail, OPENAI_STRICT)).toEqual([]);
    expect(checkProviderSubset(withEmail, ANTHROPIC_STRICT)).toEqual([]);
  });

  it('disagree about maxItems and numeric bounds', () => {
    expect(OPENAI_STRICT.keywords.maxItems.status).toBe('supported');
    expect(ANTHROPIC_STRICT.keywords.maxItems.status).toBe('unsupported');
    expect(OPENAI_STRICT.keywords.minimum.status).toBe('supported');
    expect(ANTHROPIC_STRICT.keywords.minimum.status).toBe('unsupported');
  });

  it('disagree about whether every property must be required', () => {
    expect(OPENAI_STRICT.requireAllPropertiesRequired).toBe(true);
    // Anthropic's own quick-start ships `required: ["location"]` with an unlisted
    // `unit` property, so optional is legal there.
    expect(ANTHROPIC_STRICT.requireAllPropertiesRequired).toBe(false);
    const optional = {
      type: 'object',
      additionalProperties: false,
      required: ['a'],
      properties: { a: { type: 'string' }, b: { type: 'string' } },
    };
    expect(keywordsOf(checkProviderSubset(optional, OPENAI_STRICT))).toContain('required');
    expect(checkProviderSubset(optional, ANTHROPIC_STRICT)).toEqual([]);
  });

  it('disagree about anyOf at the root and about recursion', () => {
    expect(OPENAI_STRICT.allowRootAnyOf).toBe(false);
    expect(ANTHROPIC_STRICT.allowRootAnyOf).toBe(true);
    expect(OPENAI_STRICT.allowRecursion).toBe(true);
    expect(ANTHROPIC_STRICT.allowRecursion).toBe(false);
  });
});

describe('the checker', () => {
  it('treats an UNCLASSIFIED keyword as a failure, never as a pass', () => {
    // The whole guard rests on this. A keyword neither provider documents must be
    // reported, or the tables silently become an allowlist of things we happened to
    // think of.
    for (const subset of Object.values(providerSubsets)) {
      const v = checkProviderSubset({ type: 'string', contentEncoding: 'base64' }, subset);
      expect(keywordsOf(v)).toContain('contentEncoding');
      expect(v.find((x) => x.keyword === 'contentEncoding')?.reason).toMatch(/unknown keyword/);
    }
  });

  it('names a vendor extension as a vendor extension', () => {
    const v = checkProviderSubset({ type: 'string', 'x-kai-control': 'tone' }, ANTHROPIC_STRICT);
    expect(keywordsOf(v)).toContain('x-kai-control');
    expect(v[0].reason).toMatch(/vendor extension/);
  });

  it('never faults a pure annotation', () => {
    const annotated = {
      type: 'string',
      title: 'A',
      description: 'B',
      examples: ['c'],
      $comment: 'd',
      deprecated: false,
      readOnly: false,
      writeOnly: false,
    };
    for (const subset of Object.values(providerSubsets)) {
      expect(checkProviderSubset(annotated, subset)).toEqual([]);
    }
  });

  // form.schema.json has properties literally NAMED `properties`, `required`,
  // `type` and `x-kai-order`. A checker that walked object keys without knowing
  // which positions hold keywords would report a developer's own field names as
  // unsupported schema keywords, which is a false positive that would make the
  // whole guard untrustworthy on the one card whose data IS a schema.
  it('does not mistake a property NAME for a keyword', () => {
    const v = checkProviderSubset(cardSchemas.form, ANTHROPIC_STRICT);
    // `x-kai-order` is a property of the form card's data, not a keyword applied to
    // it, so it must not be reported as a vendor extension.
    expect(v.filter((x) => x.keyword === 'x-kai-order')).toEqual([]);
    expect(v.filter((x) => x.path === 'x-kai-order' && x.keyword === 'type')).toEqual([]);
  });

  it('reports EVERY violation with a path and a named keyword, never a generic rejection', () => {
    const v = checkProviderSubset(cardSchemas.confirm, ANTHROPIC_STRICT);
    expect(v.length).toBeGreaterThan(1);
    for (const one of v) {
      expect(one.path.length).toBeGreaterThan(0);
      expect(one.keyword.length).toBeGreaterThan(0);
      expect(one.reason.length).toBeGreaterThan(0);
    }
  });

  it('stops descending through a keyword it has already rejected', () => {
    // `embed`'s `allOf` is unsupported on OpenAI. Reporting its branches too would
    // bury the one line that matters under sub-violations of a construct that is
    // already gone.
    const v = checkProviderSubset(cardSchemas.embed, OPENAI_STRICT);
    expect(keywordsOf(v)).toContain('allOf');
    expect(v.filter((x) => x.path.startsWith('(root)/allOf['))).toEqual([]);
    // Anthropic DOES support allOf, so there it must descend and find the `if`.
    const a = checkProviderSubset(cardSchemas.embed, ANTHROPIC_STRICT);
    expect(keywordsOf(a)).not.toContain('allOf');
    expect(keywordsOf(a)).toContain('if');
  });
});
