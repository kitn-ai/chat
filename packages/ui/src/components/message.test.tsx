import { describe, it, expect } from 'vitest';
import { groupMessageParts } from './message';
import type { MessagePart } from '../elements/chat-types';

describe('groupMessageParts', () => {
  it('wraps a single file part in its own files group', () => {
    const parts: MessagePart[] = [
      { type: 'file', attachment: { id: 'a', type: 'file', filename: 'a.png' } },
    ];
    const groups = groupMessageParts(parts);
    expect(groups).toEqual([
      { kind: 'files', parts: [parts[0]] },
    ]);
  });

  it('collapses three consecutive file parts into one files group', () => {
    const parts: MessagePart[] = [
      { type: 'file', attachment: { id: 'a', type: 'file', filename: 'a.png' } },
      { type: 'file', attachment: { id: 'b', type: 'file', filename: 'b.png' } },
      { type: 'file', attachment: { id: 'c', type: 'file', filename: 'c.png' } },
    ];
    const groups = groupMessageParts(parts);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ kind: 'files', parts });
  });

  it('keeps file parts separated by a non-file part as two distinct groups', () => {
    const file1: MessagePart = { type: 'file', attachment: { id: 'a', type: 'file', filename: 'a.png' } };
    const text: MessagePart = { type: 'text', text: 'in between' };
    const file2: MessagePart = { type: 'file', attachment: { id: 'b', type: 'file', filename: 'b.png' } };
    const groups = groupMessageParts([file1, text, file2]);
    expect(groups).toEqual([
      { kind: 'files', parts: [file1] },
      { kind: 'single', part: text },
      { kind: 'files', parts: [file2] },
    ]);
  });

  it('preserves order across a mix of part types', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Checking.' },
      { type: 'tool', tool: { type: 'get_weather', kind: 'generic', state: 'output-available' } },
      { type: 'text', text: 'Done.' },
    ];
    const groups = groupMessageParts(parts);
    expect(groups.map((g) => (g.kind === 'single' ? g.part.type : 'files'))).toEqual([
      'text', 'tool', 'text',
    ]);
  });
});
