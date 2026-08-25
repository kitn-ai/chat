import { describe, it, expect } from 'vitest';
import { createRoot, flush } from 'solid-js';
import { useTextStream } from '../../src/primitives/use-text-stream';

describe('useTextStream', () => {
  it('returns displayedText, isComplete, and control functions', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [stream, dispose] = createRoot((d) => [useTextStream({ mode: 'typewriter' }), d] as const);
    expect(stream.displayedText()).toBe('');
    expect(stream.isComplete()).toBe(true);
    expect(typeof stream.reset).toBe('function');
    expect(typeof stream.startStreaming).toBe('function');
    expect(typeof stream.pause).toBe('function');
    expect(typeof stream.resume).toBe('function');
    dispose();
  });

  it('streams text from a string source', async () => {
    const result = await new Promise<string>((resolve) => {
      createRoot(async (dispose) => {
        const stream = useTextStream({ mode: 'typewriter', speed: 1, characterChunkSize: 100 });
        // V2-SHAPE: leave the root's synchronous owned scope before driving writes.
        await Promise.resolve();
        stream.startStreaming('Hello, world!');
        flush(); // V2-FLUSH: commit the staged write
        await new Promise((r) => setTimeout(r, 50));
        resolve(stream.displayedText());
        dispose();
      });
    });
    expect(result).toBe('Hello, world!');
  });
});
