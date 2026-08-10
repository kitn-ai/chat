// THE guard behind the whole wire sub-project.
//
// Anthropic returns 400 invalid_request_error if `thinking` or
// `redacted_thinking` blocks in the most recent assistant message are modified,
// reordered, filtered or RECONSTRUCTED. Nothing in this file is hand-built:
// captured SSE goes through the format, the adapter and a real AssistantStream,
// and comes back out through the encoder, and every expectation is derived from
// the fixture's own bytes rather than restated.
//
// Assertions compare with JSON.stringify, not toBe. Anything that clones a
// message (persistence, structuredClone, a JSON transport) breaks reference
// identity while preserving bytes, and the provider compares bytes. Exactly one
// test below uses toBe, to document that identity does hold on the synchronous
// same-process path.
import { describe, expect, it } from 'vitest';
import { readAnthropicStream } from './read';
import {
  WireEncodeError,
  toAnthropicMessages,
  toOpenAIMessages,
  type AnthropicContentBlock,
} from './encode';
import { applyToolOutput } from './sink-helpers';
import { ANTHROPIC_FIXTURES } from './fixtures/anthropic';
import { replayBytes } from './fixtures/replay';
import { createAssistantStream, type AssistantStream, type SetMessages } from '../state/stream';
import type { ChatMessage } from '../elements/chat-types';

/** Drive a REAL AssistantStream from a captured fixture and hand back the
 *  resulting messages. No hand-built parts anywhere in this file.
 *
 *  `afterStream` is the HOST's half of a tool round: it runs after the provider
 *  turn has been read but while the same stream is still open, exactly as a host
 *  executing a tool and continuing the answer would. */
async function streamFixture(
  name: string,
  afterStream?: (stream: AssistantStream) => void,
): Promise<ChatMessage[]> {
  const sse = ANTHROPIC_FIXTURES[name];
  if (!sse) throw new Error(`missing fixture anthropic/${name}`);
  let messages: ChatMessage[] = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'go' }] }];
  const set: SetMessages = (fn) => {
    messages = fn(messages);
  };
  const stream = createAssistantStream(set);
  try {
    // 17 bytes at a time: coprime with the frame lengths, so boundaries land
    // mid-key and mid-value and a decoder that assumes whole frames is caught.
    await readAnthropicStream(replayBytes(sse, 17), stream);
    afterStream?.(stream);
  } finally {
    stream.done();
  }
  return messages;
}

/** Settle every tool the way a host would after running it. The encoders SKIP a
 *  tool with no result, so a test about tool blocks has to do this first. */
function settleTools(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === 'tool'
        ? { ...p, tool: { ...p.tool, state: 'output-available' as const, output: { c: 18 } } }
        : p,
    ),
  }));
}

/** Every `data:` JSON payload in a fixture, for comparing against the wire.
 *  `[DONE]` is a sentinel, not JSON, so it is skipped rather than parsed. */
function frames(name: string): Array<Record<string, unknown>> {
  return ANTHROPIC_FIXTURES[name]
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.startsWith('data: '))
    .map((l) => l.slice(6).trim())
    .filter((payload) => payload !== '' && payload !== '[DONE]')
    .map((payload) => JSON.parse(payload) as Record<string, unknown>);
}

const blockType = (frame: Record<string, unknown>): string =>
  (frame.content_block as { type?: string } | undefined)?.type ?? '';

/** The provider's own content-block order, taken from the fixture. */
function wireBlockTypes(name: string): string[] {
  return frames(name)
    .filter((f) => f.type === 'content_block_start')
    .sort((a, b) => (a.index as number) - (b.index as number))
    .map(blockType);
}

const THINKING_TYPES = ['thinking', 'redacted_thinking'];

/** Concatenate one delta field across a fixture, optionally scoped to a single
 *  content-block index, the way the provider's own block assembles. */
function deltaText(name: string, kind: string, field: string, index?: number): string {
  return frames(name)
    .filter(
      (f) =>
        f.type === 'content_block_delta' &&
        (index === undefined || f.index === index) &&
        (f.delta as { type?: string } | undefined)?.type === kind,
    )
    .map((f) => (f.delta as Record<string, string>)[field])
    .join('');
}

/** The `thinking` block the provider sent, rebuilt from the fixture's own bytes
 *  and serialized. This is the target every verbatim assertion compares against:
 *  the WIRE, not the part the adapter produced.
 *
 *  The SEED matters: `content_block_start` may carry an opening `thinking`
 *  value, and `formats/anthropic.ts` prepends it. It is zero-length in every
 *  fixture captured so far, so ignoring it would pass today and then fail
 *  against a CORRECT encoder the first time a capture arrives with one. */
function wireThinkingJson(name: string): string {
  const start = frames(name).find(
    (f) => f.type === 'content_block_start' && blockType(f) === 'thinking',
  );
  if (!start) throw new Error(`fixture anthropic/${name} has no thinking block`);
  const index = start.index as number;
  const seed = (start.content_block as { thinking?: string }).thinking ?? '';
  const thinking = seed + deltaText(name, 'thinking_delta', 'thinking', index);
  const signature = deltaText(name, 'signature_delta', 'signature', index);
  expect(signature, `${name} must carry a signature`).not.toBe('');
  return JSON.stringify({ type: 'thinking', thinking, signature });
}

const assistantBlocks = (out: ReturnType<typeof toAnthropicMessages>): AnthropicContentBlock[] =>
  out.filter((m) => m.role === 'assistant').flatMap((m) => m.content);

/** The provider's own tool-call id, read out of the fixture. */
function wireToolId(name: string): string {
  const start = frames(name).find(
    (f) => f.type === 'content_block_start' && blockType(f) === 'tool_use',
  );
  if (!start) throw new Error(`fixture anthropic/${name} has no tool_use block`);
  return (start.content_block as { id: string }).id;
}

/** The tool-block index of the first `tool_use`, for scoping delta lookups. */
function wireToolIndex(name: string): number {
  const start = frames(name).find(
    (f) => f.type === 'content_block_start' && blockType(f) === 'tool_use',
  );
  if (!start) throw new Error(`fixture anthropic/${name} has no tool_use block`);
  return start.index as number;
}

/** All visible text the provider sent, assembled from its own text_deltas. */
function wireText(name: string): string {
  return deltaText(name, 'text_delta', 'text');
}

describe('Anthropic round-trip fidelity', () => {
  it('re-emits every thinking block byte-identically to the wire', async () => {
    const messages = await streamFixture('thinking-tool');
    const encoded = toAnthropicMessages(messages);
    const blocks = assistantBlocks(encoded);

    const thinking = blocks.filter((b) => b.type === 'thinking');
    expect(thinking).toHaveLength(1);

    // Rebuilt straight from the fixture's own deltas: this is what "verbatim"
    // means, and it is checked against the wire, not against the part the
    // adapter produced.
    expect(deltaText('thinking-tool', 'thinking_delta', 'thinking')).not.toBe('');
    expect(JSON.stringify(thinking[0])).toBe(wireThinkingJson('thinking-tool'));
  });

  it('reads raw.payload, NOT the part text, when the two disagree', async () => {
    // The teeth behind the test above. A part whose `text` still matches the
    // wire cannot tell an echo from a reconstruction, because both produce the
    // same bytes. `text` is documented as informational and a consumer is free
    // to trim, redact or re-render it; `raw` is the round-trip channel. Edit one
    // and the encoder must still emit the other.
    const messages = await streamFixture('thinking-tool');
    const tampered = messages.map((m) => ({
      ...m,
      parts: m.parts.map((p) =>
        p.type === 'reasoning'
          ? { ...p, text: 'EDITED BY THE HOST', signature: 'EDITED BY THE HOST' }
          : p,
      ),
    }));
    const blocks = assistantBlocks(toAnthropicMessages(tampered));
    const thinking = blocks.filter((b) => b.type === 'thinking');
    expect(thinking).toHaveLength(1);
    expect(JSON.stringify(thinking[0])).toBe(wireThinkingJson('thinking-tool'));
  });

  it('keeps BLOCK ORDER, which the API validates', async () => {
    const messages = settleTools(await streamFixture('thinking-tool'));
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    // Derived from the fixture's content_block_start index order, not restated.
    expect(wireBlockTypes('thinking-tool')).toEqual(['thinking', 'text', 'tool_use']);
    expect(blocks.map((b) => b.type)).toEqual(wireBlockTypes('thinking-tool'));
  });

  it('emits no tool_use for a call that has no result yet', async () => {
    // Unsettled tools are skipped ENTIRELY, call and result, so the
    // one-call-one-result invariant both APIs enforce cannot be violated.
    const messages = await streamFixture('thinking-tool');
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    expect(blocks.map((b) => b.type)).toEqual(['thinking', 'text']);
  });

  it('emits the same number of thinking blocks it received, INCLUDING empty ones', async () => {
    for (const name of ['thinking-tool', 'redacted-thinking', 'empty-thinking']) {
      const messages = await streamFixture(name);
      const blocks = assistantBlocks(toAnthropicMessages(messages));
      const wireThinking = wireBlockTypes(name).filter((t) => THINKING_TYPES.includes(t));
      const encodedThinking = blocks.filter((b) => THINKING_TYPES.includes(b.type as string));
      expect(wireThinking.length, `${name} must carry a thinking block`).toBeGreaterThan(0);
      expect(encodedThinking, `${name} block count`).toHaveLength(wireThinking.length);
      // Kind for kind, in order: a redacted block must not come back as a
      // plain thinking block, or the signature check on the way in fails.
      expect(encodedThinking.map((b) => b.type)).toEqual(wireThinking);
    }
  });

  it('re-emits a redacted_thinking blob byte-identically', async () => {
    const messages = await streamFixture('redacted-thinking');
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    const redacted = blocks.find((b) => b.type === 'redacted_thinking');
    const wireBlock = frames('redacted-thinking').find(
      (f) => f.type === 'content_block_start' && blockType(f) === 'redacted_thinking',
    )!.content_block;
    expect(JSON.stringify(redacted)).toBe(JSON.stringify(wireBlock));
  });

  it('carries an empty-text thinking block through rather than dropping it', async () => {
    const messages = await streamFixture('empty-thinking');
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    const empty = blocks.find((b) => b.type === 'thinking' && b.thinking === '');
    expect(empty).toBeDefined();
    // The signature is the whole value of an omitted-thinking block: it is what
    // the provider verifies on the way back in.
    expect(JSON.stringify(empty)).toBe(wireThinkingJson('empty-thinking'));
  });

  it('echoes the PROVIDER tool id, never a synthesised one', async () => {
    const messages = settleTools(await streamFixture('thinking-tool'));
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    const toolUse = blocks.find((b) => b.type === 'tool_use') as { id: string } | undefined;
    const wireId = frames('thinking-tool').find(
      (f) => f.type === 'content_block_start' && blockType(f) === 'tool_use',
    )!.content_block as { id: string };
    expect(toolUse?.id).toBe(wireId.id);
    expect(toolUse?.id).toMatch(/^toolu_/);
    expect(toolUse?.id).not.toMatch(/^call_\d+$/);
  });

  it('survives a structuredClone of the whole message list', async () => {
    // WEAK ALONE, on purpose, and recorded as such: this compares the encoder to
    // ITSELF, so a uniformly broken encoder passes it. It has teeth only through
    // the wire-derived assertions above, which pin one side of the comparison to
    // the fixture's bytes. Its job is narrow: catch a clone-sensitive path
    // (reference identity, a Map, a class instance) that the same-process tests
    // cannot see.
    const messages = await streamFixture('thinking-tool');
    const before = JSON.stringify(assistantBlocks(toAnthropicMessages(messages)));
    const after = JSON.stringify(assistantBlocks(toAnthropicMessages(structuredClone(messages))));
    expect(after).toBe(before);
    // Anchor one side to the fixture so this cannot pass on a uniformly broken
    // encoder alone.
    expect(before).toContain(wireThinkingJson('thinking-tool'));
  });

  it('holds reference identity on the synchronous same-process path', async () => {
    // Documented, not required: a clone (persistence, structuredClone, a JSON
    // transport) breaks identity while preserving bytes, and the provider
    // compares bytes. Production assertions use JSON.stringify.
    const messages = await streamFixture('thinking-tool');
    const part = messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === 'reasoning' && p.raw !== undefined)!;
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    expect(blocks[0]).toBe((part as { raw: { payload: unknown } }).raw.payload);
  });

  it('THROWS rather than reconstructing when raw was stripped', async () => {
    const messages = await streamFixture('thinking-tool');
    // Exactly what a naive persistence layer does: keep text and signature,
    // drop the payload it does not understand.
    const stripped = messages.map((m) => ({
      ...m,
      parts: m.parts.map((p) => (p.type === 'reasoning' ? { ...p, raw: undefined } : p)),
    }));
    // The part still has everything a reconstruction would need, which is the
    // point: the encoder must refuse anyway.
    const reasoning = stripped.flatMap((m) => m.parts).find((p) => p.type === 'reasoning')!;
    expect(reasoning.text).not.toBe('');
    expect(reasoning.signature).toBeTruthy();
    expect(() => toAnthropicMessages(stripped)).toThrow(WireEncodeError);
  });
});

describe('OpenAI round-trip ordering', () => {
  /** One complete round, driven the way a host drives it: read the provider
   *  turn, run the tool it asked for, report the result through the kit's own
   *  sink helper, then keep answering into the SAME assistant message. That last
   *  part is what the kit's design encourages and what makes the ordering
   *  question real. */
  const ANSWER = 'It is 18C in Paris.';

  async function oneRound(): Promise<ChatMessage[]> {
    const toolId = wireToolId('thinking-tool');
    return streamFixture('thinking-tool', (stream) => {
      applyToolOutput(stream, toolId, { c: 18 });
      stream.appendText(ANSWER);
    });
  }

  it('puts the tool RESULT between the call and the answer that used it', async () => {
    const out = toOpenAIMessages(await oneRound());
    const toolId = wireToolId('thinking-tool');

    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);

    // The assistant message that ANNOUNCES the call carries only the text the
    // model said BEFORE it, which is everything the provider streamed on the
    // wire for this turn.
    expect(out[1].content).toBe(wireText('thinking-tool'));
    expect(out[1].tool_calls?.map((c) => c.id)).toEqual([toolId]);

    expect(out[2]).toEqual({
      role: 'tool',
      tool_call_id: toolId,
      name: 'get_weather',
      content: '{"c":18}',
    });

    // The answer comes AFTER the result. Flattening the turn would put it in
    // out[1], ahead of the result it was based on.
    expect(out[3]).toEqual({ role: 'assistant', content: ANSWER });
    expect(out[1].content).not.toContain(ANSWER);

    // Stated as an ordering invariant too, so a reshuffle that keeps the roles
    // but moves the text still fails.
    const answerAt = out.findIndex((m) => m.content === ANSWER);
    const resultAt = out.findIndex((m) => m.role === 'tool');
    const callAt = out.findIndex((m) => (m.tool_calls?.length ?? 0) > 0);
    expect(callAt).toBeGreaterThanOrEqual(0);
    expect(resultAt).toBeGreaterThan(callAt);
    expect(answerAt).toBeGreaterThan(resultAt);
  });

  it('echoes the provider argument text VERBATIM through the whole round', async () => {
    const out = toOpenAIMessages(await oneRound());
    // Reassembled from the fixture's own input_json_delta fragments, including
    // the space after the colon that JSON.stringify(input) would drop.
    const wireArgs = deltaText(
      'thinking-tool',
      'input_json_delta',
      'partial_json',
      wireToolIndex('thinking-tool'),
    );
    expect(wireArgs).toContain('": "');
    expect(out[1].tool_calls?.[0].function.arguments).toBe(wireArgs);
    expect(out[1].tool_calls?.[0].function.name).toBe('get_weather');
  });

  it('never emits an assistant message with null content and no tool_calls', async () => {
    // Reachable from a real stream: a reasoning-only turn encodes to nothing on
    // this wire, and `{ content: null }` with no tool_calls is rejected by
    // strict-compatible endpoints.
    for (const name of ['thinking-tool', 'empty-thinking', 'redacted-thinking']) {
      const out = toOpenAIMessages(await streamFixture(name));
      for (const m of out) {
        expect(
          m.content !== null || (m.tool_calls?.length ?? 0) > 0,
          `${name}: ${JSON.stringify(m)}`,
        ).toBe(true);
      }
    }
  });
});
