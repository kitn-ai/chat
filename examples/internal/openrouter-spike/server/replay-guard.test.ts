// The replay path is steered by the PAGE: the browser posts `{ replay: { dir,
// round } }` and the proxy reads a file off disk with it. The dev server is
// localhost-only, but a path a page can choose is a path worth pinning, and a
// traversal here would read arbitrary files — including the `.env.local` two
// directories up that the whole security contract exists to protect.
//
// No key, no network, no server: these call the resolver directly.
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fixturePath, modelSlug } from './openrouter-proxy';

const ROOT = resolve('/tmp/spike-fixtures');

describe('fixturePath', () => {
  it('resolves a normal fixture under the fixtures root', () => {
    expect(fixturePath(ROOT, 'canned/S05-parallel-tools', 1)).toBe(
      resolve(ROOT, 'canned/S05-parallel-tools/round-1.sse'),
    );
  });

  it('refuses to climb out of the fixtures root', () => {
    expect(fixturePath(ROOT, '../../..', 1)).toBeNull();
    expect(fixturePath(ROOT, 'canned/../../../../etc', 1)).toBeNull();
    // The one that actually matters: the key file lives above the fixtures dir.
    expect(fixturePath(ROOT, '../.env.local', 1)).toBeNull();
  });

  it('refuses an absolute path', () => {
    expect(fixturePath(ROOT, '/etc/passwd', 1)).toBeNull();
    expect(fixturePath(ROOT, '/', 1)).toBeNull();
  });

  it('refuses an empty dir and a NUL byte', () => {
    expect(fixturePath(ROOT, '', 1)).toBeNull();
    expect(fixturePath(ROOT, 'canned\0/x', 1)).toBeNull();
  });

  it('refuses a round that is not a small positive integer', () => {
    for (const round of [0, -1, 1.5, 100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(fixturePath(ROOT, 'canned/x', round), `round=${round}`).toBeNull();
    }
  });

  it('is not fooled by a sibling directory sharing the root prefix', () => {
    // `/tmp/spike-fixtures-secrets` starts with the root STRING but is not under
    // the root DIRECTORY. A naive startsWith check without the separator lets it
    // through.
    expect(fixturePath(ROOT, '../spike-fixtures-secrets', 1)).toBeNull();
  });
});

describe('modelSlug', () => {
  it('drops the floating-latest tilde and makes the id path-safe', () => {
    expect(modelSlug('~deepseek/deepseek-v4-flash-latest')).toBe('deepseek-deepseek-v4-flash-latest');
    expect(modelSlug('openai/gpt-5.2')).toBe('openai-gpt-5.2');
  });

  it('cannot produce a path separator or a traversal segment', () => {
    const slug = modelSlug('../../etc/passwd');
    expect(slug).not.toContain('/');
    expect(slug).not.toContain('..');
  });
});
