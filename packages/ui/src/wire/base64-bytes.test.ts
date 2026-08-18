// `base64Bytes` counts what a base64 payload stands for, EXACTLY.
//
// Exactness is the whole contract: this number is rendered as an attachment's
// size, and a size that is quietly an estimate is worse than an absent one. The
// implementation is a full O(n) scan for that reason, and three cheaper
// candidates were measured and rejected -- see the docblock at the function.
//
// These pin the arithmetic against an actual decode, so any future attempt at a
// faster counter has to prove it is the same function rather than merely a
// plausible one. There is deliberately NO heap assertion here: the obvious one
// ('a big payload must not move the heap') passes for every candidate on a
// whitespace-free input, because V8 returns the original string from a
// `.replace` that matched nothing. It would have proved nothing.
import { describe, expect, it } from 'vitest';
import { base64Bytes } from './encode-probe';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('base64Bytes', () => {
  it('agrees with an actual decode, across every padding case', () => {
    // Lengths 0..40 cover all three padding remainders many times over.
    for (let n = 0; n <= 40; n++) {
      const source = 'x'.repeat(n);
      const encoded = b64(source);
      expect(base64Bytes(encoded)).toBe(Buffer.from(encoded, 'base64').length);
    }
  });

  it('counts multibyte content by BYTES, not characters', () => {
    const source = 'héllo → wörld 🎉';
    const bytes = Buffer.from(source, 'utf8').length;
    expect(base64Bytes(b64(source))).toBe(bytes);
    expect(bytes).toBeGreaterThan(source.length);
  });

  it('tolerates embedded whitespace, which a wrapped payload carries', () => {
    const source = 'the quick brown fox jumps over the lazy dog, twice over';
    const encoded = b64(source);
    const wrapped = encoded.replace(/(.{8})/g, '$1\n');
    expect(wrapped).not.toBe(encoded);
    expect(base64Bytes(wrapped)).toBe(Buffer.from(source, 'utf8').length);
    // Every whitespace character, not just newlines.
    expect(base64Bytes(` \t\r\n\f\v${encoded} `)).toBe(Buffer.from(source, 'utf8').length);
  });

  it('is 0 for empty and for whitespace-only input', () => {
    expect(base64Bytes('')).toBe(0);
    expect(base64Bytes('   \n\t ')).toBe(0);
  });

  it('stays exact at a size where guessing would be tempting', () => {
    // 16 MB of base64 stands for exactly 12 MB. A prefix-probing shortcut --
    // the fast candidate that was rejected -- gets this right and gets the
    // wrapped case below silently wrong, which is why the pair is here.
    const big = 'A'.repeat(16 * 1024 * 1024);
    expect(base64Bytes(big)).toBe(12 * 1024 * 1024);

    // The same 16 MB of base64, but its whitespace begins only AFTER a prefix
    // long enough to fool a probe. A counter that sampled the first few KB
    // would take `data.length` at face value and over-count by every newline it
    // never saw.
    //
    // The newline count is load-bearing and 800 is not arbitrary: bytes are
    // `floor(chars * 3 / 4)`, so ONE stray newline shifts the result by 0.75
    // and floors away to nothing. An assertion written with a single newline
    // passes for the broken counter too -- it was, and it did.
    const CLEAN_PREFIX = 8192; // twice any plausible probe window
    const NEWLINES = 800;
    const wrapped =
      'A'.repeat(CLEAN_PREFIX) +
      '\n'.repeat(NEWLINES) +
      'A'.repeat(16 * 1024 * 1024 - CLEAN_PREFIX);
    expect(base64Bytes(wrapped)).toBe(12 * 1024 * 1024);
    // What the prefix-probing counter would have said, so the gap is explicit.
    expect(Math.floor(((16 * 1024 * 1024 + NEWLINES) * 3) / 4)).toBe(12 * 1024 * 1024 + 600);
  });
});
