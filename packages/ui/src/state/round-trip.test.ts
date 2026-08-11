import { describe, expect, it } from 'vitest';
import { createAssistantStream, type SetMessages } from './stream';
import type { ChatMessage } from '../elements/chat-types';

describe('round-trip fidelity', () => {
  it('carries an Anthropic thinking block byte-identically through the stream', () => {
    const original = {
      type: 'thinking',
      thinking: 'Let me work through this.',
      signature: 'ErUBCkYIARgCIkAd8xVzGx...',
    };
    let messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages = fn(messages); };

    const s = createAssistantStream(set);
    s.appendReasoning(original.thinking, {
      index: 0,
      signature: original.signature,
      raw: { source: 'anthropic.content_block', payload: original },
    });
    s.done();

    const part = messages[0].parts.find((p) => p.type === 'reasoning');
    expect(part?.raw?.payload).toEqual(original);
    expect(JSON.stringify(part?.raw?.payload)).toBe(JSON.stringify(original));
    // Reference identity, not a structural clone: a clone would still pass toEqual
    // above but could silently diverge from `original` under later mutation.
    expect(part?.raw?.payload).toBe(original);
  });

  it('keeps raw intact across later text and tool appends', () => {
    let messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages = fn(messages); };
    const raw = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'x', signature: 'S' } };

    const s = createAssistantStream(set);
    s.appendReasoning('x', { index: 0, raw });
    s.appendText('answer');
    s.upsertTool('tc1', { type: 'bash', state: 'output-available' });
    s.appendText('more');

    const part = messages[0].parts.find((p) => p.type === 'reasoning');
    expect(part?.raw).toEqual(raw);
  });

  it('keeps distinct raw payloads per index across parallel reasoning blocks', () => {
    let messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages = fn(messages); };
    const rawA = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'a', signature: 'SA' } };
    const rawB = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'b', signature: 'SB' } };

    const s = createAssistantStream(set);
    s.appendReasoning('a', { index: 0, raw: rawA });
    s.appendReasoning('b', { index: 1, raw: rawB });
    // Further text-only deltas on each block must not smear the other's raw.
    s.appendReasoning('-more', { index: 0 });
    s.appendReasoning('-more', { index: 1 });
    s.done();

    const reasoningParts = messages[0].parts.filter((p) => p.type === 'reasoning');
    const partA = reasoningParts.find((p) => p.index === 0);
    const partB = reasoningParts.find((p) => p.index === 1);
    expect(partA?.raw).toBe(rawA);
    expect(partB?.raw).toBe(rawB);
    expect(partA?.text).toBe('a-more');
    expect(partB?.text).toBe('b-more');
  });
});
