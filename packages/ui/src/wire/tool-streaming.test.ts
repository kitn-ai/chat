import { describe, expect, it } from 'vitest';
import { consumeModelStream } from './consume';
import { applyToolFailure, applyToolOutput, bufferText } from './sink-helpers';
import type { AssistantStreamSink } from './chunk';
import type { ToolPart } from '../components/tool-types';
import { replayChunks } from './fixtures/chunks';

/** Records every patch, and can replay them into a merged ToolPart the way the
 *  real sink does. */
function toolSink(): AssistantStreamSink & {
  patches: Array<[string, Partial<ToolPart>]>;
  merged(id: string): Partial<ToolPart>;
} {
  const patches: Array<[string, Partial<ToolPart>]> = [];
  return {
    patches,
    merged(id) {
      return patches.filter(([k]) => k === id).reduce((acc, [, p]) => ({ ...acc, ...p }), {});
    },
    appendText: () => undefined,
    appendReasoning: () => undefined,
    upsertTool: (id, patch) => patches.push([id, { ...patch }]),
    addSource: () => undefined,
  };
}

const FRAGMENTS = ['{"ci', 'ty":"Pa', 'ris","un', 'its":"me', 'tric"}'];

const fragmentTurn = () =>
  replayChunks([
    { toolCalls: [{ index: 0, id: 'c1', name: 'get_weather', arguments: '' }] },
    ...FRAGMENTS.map((text) => ({ toolCalls: [{ index: 0, arguments: text }] })),
    { finishReason: 'tool_calls' },
  ]);

describe('streaming tool arguments (rework 2)', () => {
  it('writes rawInput on EVERY fragment', async () => {
    const sink = toolSink();
    await consumeModelStream(fragmentTurn(), sink);
    const rawInputs = sink.patches
      .filter(([id, p]) => id === 'c1' && p.rawInput !== undefined)
      .map(([, p]) => p.rawInput);
    expect(rawInputs).toEqual([
      '{"ci',
      '{"city":"Pa',
      '{"city":"Paris","un',
      '{"city":"Paris","units":"me',
      '{"city":"Paris","units":"metric"}',
      // once more at settle, carrying the final text alongside `raw`
      '{"city":"Paris","units":"metric"}',
    ]);
  });

  it('promotes to input plus input-available only on a whole valid parse', async () => {
    const sink = toolSink();
    await consumeModelStream(fragmentTurn(), sink);
    const withInput = sink.patches.filter(([id, p]) => id === 'c1' && p.input !== undefined);
    // Exactly two: the fragment that completed the object, and the settle patch.
    expect(withInput).toHaveLength(2);
    expect(withInput[0][1].input).toEqual({ city: 'Paris', units: 'metric' });
    expect(withInput[0][1].state).toBe('input-available');
    // Every patch before that one is rawInput-only and leaves the state alone.
    const firstInputAt = sink.patches.indexOf(withInput[0]);
    expect(sink.patches.slice(1, firstInputAt).every(([, p]) => p.input === undefined)).toBe(true);
    expect(sink.patches.slice(1, firstInputAt).every(([, p]) => p.state === undefined)).toBe(true);
  });

  it('flushes buffered fragments when the id arrives after them', async () => {
    const sink = toolSink();
    await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, name: 'get_weather' }] },
        { toolCalls: [{ index: 0, arguments: '{"city":"Tokyo"}' }] },
        { toolCalls: [{ index: 0, id: 'late_id' }] },
        { finishReason: 'tool_calls' },
      ]),
      sink,
    );
    expect(sink.merged('late_id').rawInput).toBe('{"city":"Tokyo"}');
    expect(sink.merged('late_id').input).toEqual({ city: 'Tokyo' });
  });

  it('keeps rawInput on a call whose arguments never parse', async () => {
    const sink = toolSink();
    const turn = await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'propose_action', arguments: '{"title":"Deploy' }] },
        { finishReason: 'length' },
      ]),
      sink,
    );
    expect(sink.merged('c1').rawInput).toBe('{"title":"Deploy');
    expect(sink.merged('c1').state).toBe('output-error');
    expect(sink.merged('c1').input).toBeUndefined();
    expect(turn.toolCalls[0].error).toContain('token limit');
  });

  it('repairs the panel type when the tool name arrives split across fragments', async () => {
    const sink = toolSink();
    await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'get_' }] },
        { toolCalls: [{ index: 0, name: 'weather' }] },
        { toolCalls: [{ index: 0, arguments: '{}' }] },
        { finishReason: 'tool_calls' },
      ]),
      sink,
    );
    expect(sink.merged('c1').type).toBe('get_weather');
  });
});

describe('sink helpers', () => {
  it('applyToolOutput completes a panel with the host result', () => {
    const sink = toolSink();
    applyToolOutput(sink, 'c1', { tempC: 18 });
    expect(sink.patches).toEqual([['c1', { state: 'output-available', output: { tempC: 18 } }]]);
  });

  it('applyToolFailure marks a panel failed with a message', () => {
    const sink = toolSink();
    applyToolFailure(sink, 'c1', 'the API returned 500');
    expect(sink.patches).toEqual([
      ['c1', { state: 'output-error', errorText: 'the API returned 500' }],
    ]);
  });

  it('bufferText swallows text and hands it back, forwarding everything else', async () => {
    const sink = toolSink();
    const buffered = bufferText(sink);
    const turn = await consumeModelStream(
      replayChunks([
        { text: '{"reply":"hi"' },
        { text: '}' },
        { reasoning: 'thinking', reasoningIndex: 0 },
        { toolCalls: [{ index: 0, id: 'c1', name: 'noop', arguments: '{}' }] },
        { finishReason: 'stop' },
      ]),
      buffered,
    );
    expect(buffered.buffered()).toBe('{"reply":"hi"}');
    // Tools still reached the underlying sink.
    expect(sink.patches.some(([id]) => id === 'c1')).toBe(true);
    // The TURN still reports the text: `parts` describes what the model
    // produced, not what the host chose to display.
    expect(turn.text).toBe('{"reply":"hi"}');
    expect(turn.parts.some((p) => p.type === 'text')).toBe(true);
  });
});
