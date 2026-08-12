// The claims that matter here are about IDENTITY and FALL-THROUGH, not about shapes.
//
// `cardFromToolCall` is three lines of mapping. What makes it worth a test file is
// that both of its interesting properties are invisible in the mapping itself:
//
//  1. Passing the provider's `tool_call_id` through as `CardEnvelope.id` is what
//     makes a REVISED card replace itself instead of stacking. That claim spans this
//     module and `upsertCardPart`, so it is asserted against the real fold
//     (`createAssistantStream`), never a mock. The repo's own reference harness
//     generates `card-${++cardSeq}` per call (openrouter-spike/src/tools.ts:479) and
//     would fail this test, which is the point of writing it.
//
//  2. Returning `null` (rather than throwing) for a non-card tool is what lets the
//     loop use a single `if (card)` to decide between "render this" and "run this".
//
// The third property, that `isCardTool` never disagrees with `cardFromToolCall`, is
// asserted over a shared corpus rather than per-case, so a future edit to one cannot
// drift from the other silently.

import { describe, expect, it } from 'vitest';
import { cardFromToolCall, isCardTool, toolNameForCardType, KAI_TOOL_PREFIX } from './from-tool-call';
import { createAssistantStream } from '../state/stream';
import type { ChatMessage, MessagePart } from '../elements/chat-types';

/** Every name asserted anywhere in this file, so the agreement check below cannot
 *  drift out of step with the individual cases. */
const NAMES = [
  'kai_confirm',
  'kai_choice',
  'kai_form',
  'kai_tasks',
  'kai_link',
  'kai_embed',
  'kai_artifact',
  'kai_pricing-table',
  'kai_x',
  'kai_',
  'kai',
  'kai__confirm',
  'confirm',
  'search',
  'KAI_CONFIRM',
  'kai-confirm',
  'my_kai_confirm',
  '',
  'kai_confirm ',
] as const;

/** A minimal in-memory host for `createAssistantStream`: the real fold, no mock. */
function harness() {
  let messages: ChatMessage[] = [];
  const stream = createAssistantStream((updater) => {
    messages = updater(messages);
  });
  return {
    stream,
    parts: (): MessagePart[] => messages.find((m) => m.id === stream.id)?.parts ?? [],
  };
}

describe('cardFromToolCall', () => {
  it('carries the tool_call_id through, so a REVISED card upserts instead of stacking', () => {
    // The end-to-end claim: the model calls kai_confirm, then corrects itself and
    // re-emits the SAME tool_call_id with different arguments. One card, later data.
    const h = harness();
    const first = cardFromToolCall('kai_confirm', { body: 'Deploy to prod?', actions: [] }, { id: 'call_abc' });
    const second = cardFromToolCall(
      'kai_confirm',
      { body: 'Deploy to prod?', actions: [{ id: 'go', label: 'Deploy' }] },
      { id: 'call_abc' },
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    h.stream.addCard(first!);
    h.stream.addCard(second!);

    const cards = h.parts().filter((p) => p.type === 'card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      type: 'card',
      envelope: {
        type: 'confirm',
        id: 'call_abc',
        data: { body: 'Deploy to prod?', actions: [{ id: 'go', label: 'Deploy' }] },
      },
    });
  });

  it('keeps DIFFERENT tool calls apart, so the upsert above is not just "always one card"', () => {
    const h = harness();
    h.stream.addCard(cardFromToolCall('kai_confirm', { actions: [] }, { id: 'call_1' })!);
    h.stream.addCard(cardFromToolCall('kai_confirm', { actions: [] }, { id: 'call_2' })!);
    expect(h.parts().filter((p) => p.type === 'card')).toHaveLength(2);
  });

  it('reads CardEnvelope.type off the tool name, under the kai_ prefix', () => {
    for (const type of ['confirm', 'choice', 'form', 'tasks', 'link', 'embed', 'artifact']) {
      expect(cardFromToolCall(`kai_${type}`, {}, { id: 'c' })).toMatchObject({ type });
    }
  });

  it('uses the tool input verbatim as CardEnvelope.data', () => {
    // The tool's input schema IS the card-DATA schema (that is what `cardTools()`
    // hands the model), so the mapping is identity. No key is peeled off, renamed
    // or defaulted: anything else would be a second copy of the shape.
    const input = { heading: 'Ship it', body: 'now', actions: [{ id: 'y', label: 'Yes' }], tone: 'danger' };
    const card = cardFromToolCall('kai_confirm', input, { id: 'c1' });
    expect(card?.data).toEqual(input);
    expect(card).toEqual({ type: 'confirm', id: 'c1', data: input });
  });

  it('sets no envelope title, because no card-data schema offers the model one', () => {
    // CardEnvelope.title is chrome the HOST owns. `confirm.schema.json` deliberately
    // calls its in-body one `heading` and says so. A caller who wants a title writes
    // `{ ...card, title }`.
    expect(cardFromToolCall('kai_confirm', { heading: 'h' }, { id: 'c' })).not.toHaveProperty('title');
  });

  it('returns null, and does NOT throw, for a tool that is not a card tool', () => {
    for (const name of ['search', 'confirm', 'kai', 'kai_', 'KAI_CONFIRM', 'kai-confirm', 'my_kai_confirm', '']) {
      expect(() => cardFromToolCall(name, {}, { id: 'c' })).not.toThrow();
      expect(cardFromToolCall(name, {}, { id: 'c' })).toBeNull();
    }
  });

  it('produces an envelope for a prefixed type the kit does not know, so the RENDERER can name it', () => {
    // Decision, argued in the module header: `kai_` alone decides "this is a card
    // tool". Whether the type is renderable is asked once, downstream, where it is
    // already answered specifically: CardRenderer emits {kind:'error', cardId} and
    // renders CardFallback naming the type (tests/components/card-renderer.test.tsx:38,
    // src/elements/thread-cards.declarative.test.tsx:55).
    //
    // The alternative (gate on the 7 built-ins, return null otherwise) would send a
    // custom card type registered via `cardTypes` to `runTool('kai_pricing-table')`,
    // which no app implements, and the card would vanish with no diagnostic at all.
    expect(cardFromToolCall('kai_pricing-table', { plans: [] }, { id: 'c9' })).toEqual({
      type: 'pricing-table',
      id: 'c9',
      data: { plans: [] },
    });
  });

  it('passes MALFORMED input through rather than swallowing the call', () => {
    // Also argued in the module header: this module owns no validator (T1.5 does).
    // Returning null here would be indistinguishable from "not a card tool" and would
    // route a bad kai_confirm to runTool(); the envelope instead keeps the bad data
    // attributable to the tool call that produced it, so the diagnostic can be fed
    // back to the model and its retry upserts over the broken card.
    expect(cardFromToolCall('kai_confirm', { nonsense: true }, { id: 'c' })).toMatchObject({
      type: 'confirm',
      data: { nonsense: true },
    });
    expect(cardFromToolCall('kai_confirm', 'not an object', { id: 'c' })).toMatchObject({ data: 'not an object' });
    expect(cardFromToolCall('kai_confirm', null, { id: 'c' })).toMatchObject({ data: null });
    expect(cardFromToolCall('kai_confirm', [1, 2], { id: 'c' })).toMatchObject({ data: [1, 2] });
  });

  it('treats ABSENT arguments as an empty object, because undefined is not JSON', () => {
    // A model can call a tool with no arguments. `undefined` is the only value here
    // that cannot have come off the wire, so it is the only one normalised; `null`
    // above is a real JSON value and stays, for the validator to complain about.
    expect(cardFromToolCall('kai_confirm', undefined, { id: 'c' })).toEqual({ type: 'confirm', id: 'c', data: {} });
  });

  it('does not translate inside the type, so hyphenated card types survive', () => {
    expect(cardFromToolCall('kai_pricing-table', {}, { id: 'c' })).toMatchObject({ type: 'pricing-table' });
    expect(cardFromToolCall('kai__confirm', {}, { id: 'c' })).toMatchObject({ type: '_confirm' });
  });
});

describe('isCardTool', () => {
  it('agrees with cardFromToolCall on every name this file tests', () => {
    // Two functions answering the same question are a bug waiting to happen, so they
    // are derived from one decision. This asserts the derivation held.
    for (const name of NAMES) {
      expect(isCardTool(name), name).toBe(cardFromToolCall(name, {}, { id: 'c' }) !== null);
    }
  });

  it('accepts a prefixed name and rejects the obvious impostors', () => {
    expect(isCardTool('kai_confirm')).toBe(true);
    expect(isCardTool('kai_')).toBe(false);
    expect(isCardTool('confirm')).toBe(false);
  });

  it('does not add a second rule for names a provider cannot send', () => {
    // This assertion originally read `false`, on the assumption that a trailing
    // space should be rejected. It was wrong, and the fix belongs here rather than
    // in the implementation. Both providers constrain tool names to
    // [a-zA-Z0-9_-]{1,64}, so `'kai_confirm '` cannot come off the wire; adding a
    // whitespace rule to catch it would contradict "the remainder is used verbatim"
    // for no reachable case. If it somehow arrived, `'confirm '` is an unregistered
    // type and the fallback names it on screen, which is the better failure.
    expect(isCardTool('kai_confirm ')).toBe(true);
    expect(cardFromToolCall('kai_confirm ', {}, { id: 'c' })).toMatchObject({ type: 'confirm ' });
  });
});

describe('toolNameForCardType', () => {
  it('is the exact inverse of the name the loop reads, for every built-in type', () => {
    // Exported so `cardTools()` (T1.3) names its tools from here rather than
    // restating 'kai_'. A prefix written in two places is a prefix that can drift.
    for (const type of ['confirm', 'choice', 'form', 'tasks', 'link', 'embed', 'artifact', 'pricing-table']) {
      const name = toolNameForCardType(type);
      expect(isCardTool(name)).toBe(true);
      expect(cardFromToolCall(name, {}, { id: 'c' })).toMatchObject({ type });
    }
  });

  it('exposes the prefix as a value, not a literal to copy', () => {
    expect(KAI_TOOL_PREFIX).toBe('kai_');
    expect(toolNameForCardType('confirm')).toBe(`${KAI_TOOL_PREFIX}confirm`);
  });
});
