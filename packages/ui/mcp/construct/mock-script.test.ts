/**
 * Per-template scripted mock conversations (template-purpose audit, S-1).
 *
 * The assertions are DERIVED from each starter's own construct, not from a
 * hand-written expectation table: reasoning iff the construct enables it,
 * citations iff sources are on, a `kai_` card call iff cards are declared, and
 * every announced plain tool call carrying a scripted output. That way a new
 * template or a toggled capability moves the assertions on its own.
 */
import { describe, it, expect } from 'vitest';
import { mockScriptFor, scaffoldMockScript } from './mock-script';
import { buildableTemplates } from './templates';
import type { Construct } from './schema';
import type { MockTurn } from '../../src/state/mock';

/** Every starter across all buildable templates and their variants. */
const starterCases: { name: string; starter: Construct }[] = buildableTemplates().flatMap((t) => [
  { name: t.id, starter: t.starter },
  ...(t.variants ?? []).map((v) => ({ name: `${t.id}/${v.id}`, starter: v.starter })),
]);

const turnsOf = (starter: Construct): MockTurn[] =>
  mockScriptFor(starter).replies.map((r) => (typeof r === 'string' ? { text: r } : r));

describe('mockScriptFor — every starter script exercises what its construct enables', () => {
  it('reasoning turns appear iff the construct does not disable reasoning', () => {
    for (const { name, starter } of starterCases) {
      const hasReasoning = turnsOf(starter).some((t) => t.reasoning !== undefined);
      expect(hasReasoning, name).toBe(starter.capabilities?.reasoning !== 'off');
    }
    // The off case, derived by flipping a real starter rather than authoring
    // a fixture: no reasoning may survive the gate.
    const base = starterCases[0].starter;
    const off: Construct = {
      ...base,
      capabilities: { ...base.capabilities, reasoning: 'off' },
    };
    expect(turnsOf(off).some((t) => t.reasoning !== undefined)).toBe(false);
  });

  it('citations appear iff the construct has sources on (research is the family that does)', () => {
    for (const { name, starter } of starterCases) {
      const hasSources = turnsOf(starter).some((t) => (t.sources ?? []).length > 0);
      const sourcesOn = starter.capabilities?.sources !== undefined && starter.capabilities.sources.strip !== false;
      expect(hasSources, name).toBe(sourcesOn);
      // And research specifically MUST show them — the audit's one shot that
      // never existed: a research starter rendering a citation.
      if (name.startsWith('research')) expect(hasSources, name).toBe(true);
    }
  });

  it('every script announces at least one tool call, and every plain call has a scripted output', () => {
    for (const { name, starter } of starterCases) {
      const script = mockScriptFor(starter);
      const calls = turnsOf(starter).flatMap((t) => t.toolCalls ?? []);
      expect(calls.length, name).toBeGreaterThan(0);
      for (const call of calls) {
        if (call.name.startsWith('kai_')) continue; // cards settle via cardFromToolCall, not outputs
        expect(script.toolOutputs, `${name}: ${call.name} has no scripted output`).toHaveProperty(call.name);
      }
      // And no orphan outputs: the map only names announced calls.
      for (const key of Object.keys(script.toolOutputs)) {
        expect(calls.map((c) => c.name), `${name}: output for unannounced ${key}`).toContain(key);
        expect(key.startsWith('kai_'), `${name}: ${key} would shadow the card path`).toBe(false);
      }
    }
  });

  it('a kai_<card> call appears iff the construct declares cards (starters declare none — S-3)', () => {
    for (const { name, starter } of starterCases) {
      const hasCard = turnsOf(starter).some((t) => (t.toolCalls ?? []).some((c) => c.name.startsWith('kai_')));
      expect(hasCard, name).toBe(starter.cards !== undefined);
    }
    // A construct that DOES declare a card gets a scripted call to that card.
    const base = starterCases[0].starter;
    const withCard: Construct = {
      ...base,
      cards: [{ name: 'refund_request', schema: { type: 'object', title: 'Refund', properties: {} } }],
    };
    const calls = turnsOf(withCard).flatMap((t) => t.toolCalls ?? []);
    expect(calls.some((c) => c.name === 'kai_refund_request')).toBe(true);
  });

  it('the script self-identifies as a mock in words (tell 5), with no emoji', () => {
    for (const { name, starter } of starterCases) {
      const text = turnsOf(starter)
        .map((t) => `${t.reasoning ?? ''} ${t.text ?? ''}`)
        .join(' ');
      expect(text.toLowerCase(), name).toContain('mock');
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), `${name}: emoji in emitted copy`).toBe(false);
    }
  });

  it('scripted citation URLs are https and point at the kit docs origin', () => {
    for (const { name, starter } of starterCases) {
      for (const t of turnsOf(starter)) {
        for (const s of t.sources ?? []) {
          expect(s.url, name).toMatch(/^https:\/\/ui\.kitn\.ai\//);
        }
      }
    }
  });

  it('an unrecognizable shape still gets a script exercising its gates (the generic fallback)', () => {
    const custom: Construct = {
      name: 'custom-thing',
      layout: 'custom',
      slots: ['header'],
      provider: { mode: 'mock' },
      capabilities: { sources: { strip: true } },
    } as Construct;
    const turns = turnsOf(custom);
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.some((t) => t.reasoning !== undefined)).toBe(true);
    expect(turns.some((t) => (t.sources ?? []).length > 0)).toBe(true);
    expect(turns.some((t) => (t.toolCalls ?? []).length > 0)).toBe(true);
  });
});

describe('scaffoldMockScript — the framework scaffolds get the same rich first run', () => {
  const asTurns = (s: { replies: readonly (string | MockTurn)[] }): MockTurn[] =>
    s.replies.map((r) => (typeof r === 'string' ? { text: r } : r));

  it('always scripts reasoning and citations; the mock names itself; docs-origin URLs', () => {
    for (const tools of [false, true]) {
      const script = scaffoldMockScript({ tools });
      const turns = asTurns(script);
      expect(turns.some((t) => t.reasoning !== undefined), `tools=${tools}`).toBe(true);
      expect(turns.some((t) => (t.sources ?? []).length > 0), `tools=${tools}`).toBe(true);
      const text = turns.map((t) => `${t.reasoning ?? ''} ${t.text ?? ''}`).join(' ');
      expect(text.toLowerCase()).toContain('mock');
      for (const t of turns) {
        for (const s of t.sources ?? []) expect(s.url).toMatch(/^https:\/\/ui\.kitn\.ai\//);
      }
    }
  });

  it('announces a tool call iff the surface renders kai-tool, and every call has an output', () => {
    const withTools = scaffoldMockScript({ tools: true });
    const calls = asTurns(withTools).flatMap((t) => t.toolCalls ?? []);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.name.startsWith('kai_'), 'the mock scaffold declares no card registry').toBe(false);
      expect(withTools.toolOutputs, `${call.name} has no scripted output`).toHaveProperty(call.name);
    }
    const without = scaffoldMockScript({ tools: false });
    expect(asTurns(without).flatMap((t) => t.toolCalls ?? [])).toHaveLength(0);
    expect(Object.keys(without.toolOutputs)).toHaveLength(0);
  });

  it('never scripts a kai_ card call — cardEmitPlan gives mock no registry to settle one', () => {
    for (const tools of [false, true]) {
      for (const call of asTurns(scaffoldMockScript({ tools })).flatMap((t) => t.toolCalls ?? [])) {
        expect(call.name.startsWith('kai_')).toBe(false);
      }
    }
  });
});
