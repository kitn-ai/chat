import { describe, expect, it } from 'vitest';
import { readAnthropicStream, readOpenAIStream } from './read';
import { OPENAI_FIXTURES } from './fixtures/openai';
import { ANTHROPIC_FIXTURES } from './fixtures/anthropic';
import { BYTE_SIZES, nullSink, replayBytes, replayReadable } from './fixtures/replay';
import type { ModelTurn } from './chunk';

type Reader = (source: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>) => Promise<ModelTurn>;

const openai: Reader = (source) => readOpenAIStream(source, nullSink());
const anthropic: Reader = (source) => readAnthropicStream(source, nullSink());

const CASES: Array<[string, string, Reader]> = [
  ...Object.entries(OPENAI_FIXTURES).map(([n, sse]): [string, string, Reader] => [
    `openai/${n}`,
    sse,
    openai,
  ]),
  ...Object.entries(ANTHROPIC_FIXTURES).map(([n, sse]): [string, string, Reader] => [
    `anthropic/${n}`,
    sse,
    anthropic,
  ]),
];

/** Codepoints outside ASCII, which UTF-8 encodes in 2 to 4 bytes. Replaying at
 *  1 and 3 bytes puts a chunk boundary INSIDE them. */
const multibyte = (sse: string) => [...sse].filter((c) => c.codePointAt(0)! > 127);

describe('L3 byte-boundary replay', () => {
  it('has fixtures to sweep', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(13);
  });

  // THE TEETH OF THIS WHOLE FILE. A corpus of pure ASCII cannot catch a decoder
  // built without `{ stream: true }`, because a chunk boundary can never land
  // inside a one-byte codepoint: the sweep would sit there passing against a
  // broken decoder. Every fixture WAS ASCII when this suite was written, so this
  // assertion is what stops that from silently coming back.
  it.each([
    ['openai', OPENAI_FIXTURES],
    ['anthropic', ANTHROPIC_FIXTURES],
  ])('%s fixtures include multi-byte UTF-8 for the split-codepoint case', (_provider, fixtures) => {
    const chars = Object.values(fixtures).flatMap(multibyte);
    expect(chars.length).toBeGreaterThan(0);
    // A 4-byte codepoint (emoji) as well as 2- and 3-byte ones, so a 3-byte
    // replay chunk cannot happen to align with every character boundary.
    expect(chars.some((c) => c.codePointAt(0)! > 0xffff)).toBe(true);
  });

  it.each(CASES)(
    '%s parses identically at every byte size through both source shapes',
    async (name, sse, read) => {
      // The 4096 AsyncIterable run is the baseline; every other run must match it.
      const baseline = await read(replayBytes(sse, 4096));
      const expected = JSON.stringify(baseline.parts);

      for (const size of BYTE_SIZES) {
        const viaIterable = await read(replayBytes(sse, size));
        expect(JSON.stringify(viaIterable.parts), `${name} @ ${size} via AsyncIterable`).toBe(
          expected,
        );

        const viaStream = await read(replayReadable(sse, size));
        expect(JSON.stringify(viaStream.parts), `${name} @ ${size} via ReadableStream`).toBe(
          expected,
        );
      }
    },
  );

  it.each(CASES)('%s reports the same turn summary at 1 byte as at 4096', async (_name, sse, read) => {
    const big = await read(replayBytes(sse, 4096));
    const tiny = await read(replayBytes(sse, 1));
    expect(tiny.text).toBe(big.text);
    expect(tiny.reasoning).toBe(big.reasoning);
    expect(tiny.finishReason).toBe(big.finishReason);
    expect(tiny.stopReason).toBe(big.stopReason);
    expect(tiny.reasoningChunks).toBe(big.reasoningChunks);
    expect(JSON.stringify(tiny.toolCalls)).toBe(JSON.stringify(big.toolCalls));
    expect(JSON.stringify(tiny.sources)).toBe(JSON.stringify(big.sources));
    expect(JSON.stringify(tiny.usage)).toBe(JSON.stringify(big.usage));
  });
});
