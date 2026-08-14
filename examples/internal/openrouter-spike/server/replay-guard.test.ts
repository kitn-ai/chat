// The replay path is steered by the PAGE: the browser posts `{ replay: { dir,
// round } }` and the proxy reads a file off disk with it. The dev server is
// localhost-only, but a path a page can choose is a path worth pinning, and a
// traversal here would read arbitrary files — including the `.env.local` two
// directories up that the whole security contract exists to protect.
//
// No key, no network, no server: these call the resolver directly.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixturePath, fixtureSlug, gatewayModelFrom, modelSlug, resolveWire } from './openrouter-proxy';

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

describe('resolveWire', () => {
  it('sends an anthropic/* model through the Anthropic Skin by default', () => {
    expect(resolveWire('', 'anthropic/claude-haiku-4.5')).toBe('anthropic');
    expect(resolveWire('auto', '~anthropic/claude-haiku-4.5')).toBe('anthropic');
  });

  it('leaves every other model on the OpenAI-compatible endpoint', () => {
    expect(resolveWire('', '~deepseek/deepseek-v4-flash-latest')).toBe('openai');
    expect(resolveWire('', 'openai/gpt-5.4-mini')).toBe('openai');
    // Not a prefix match on the vendor: a model merely NAMED after anthropic is
    // still served by whoever hosts it.
    expect(resolveWire('', 'someone/anthropic-clone')).toBe('openai');
  });

  it('honours an explicit override in both directions', () => {
    // The whole point of the override: drive an Anthropic MODEL down the
    // OpenAI-compat path, so a failure can be attributed to the model or to the
    // Anthropic wire rather than to both at once.
    expect(resolveWire('openai', 'anthropic/claude-haiku-4.5')).toBe('openai');
    expect(resolveWire('anthropic', '~deepseek/deepseek-v4-flash-latest')).toBe('anthropic');
    expect(resolveWire('  ANTHROPIC  ', 'openai/gpt-5.4-mini')).toBe('anthropic');
  });
});

describe('fixtureSlug', () => {
  it('keeps the bare slug on the OpenAI wire, so existing recordings resolve', () => {
    expect(fixtureSlug('~deepseek/deepseek-v4-flash-latest', 'openai')).toBe(
      'deepseek-deepseek-v4-flash-latest',
    );
  });

  it('separates the two dialects of the SAME model', () => {
    // These two directories hold mutually unparseable SSE. Sharing one would let
    // an OpenAI-shaped recording be replayed into readAnthropicStream, which
    // does not throw — it yields an empty turn, i.e. a green-looking lie.
    const model = 'anthropic/claude-haiku-4.5';
    expect(fixtureSlug(model, 'anthropic')).not.toBe(fixtureSlug(model, 'openai'));
    expect(fixtureSlug(model, 'anthropic')).toBe('anthropic-claude-haiku-4.5-anthropic-wire');
  });

  it('is still a safe directory name', () => {
    const slug = fixtureSlug('../../etc/passwd', 'anthropic');
    expect(slug).not.toContain('/');
    expect(slug).not.toContain('..');
  });

  it('separates the two BACKENDS of the same model on the same wire', () => {
    // The gateway column and its OpenRouter control run the SAME pinned model id
    // on the SAME wire — that is the entire point of the pair, since it makes
    // any difference attributable to the integration. Which also means one
    // directory name would serve both, and each run would overwrite the other's
    // evidence: a comparison of a column against itself, with nothing to show
    // for it but a plausible table.
    const model = 'deepseek/deepseek-v4-flash-0731';
    expect(fixtureSlug(model, 'openai', 'gateway')).not.toBe(fixtureSlug(model, 'openai', 'openrouter'));
    expect(fixtureSlug(model, 'openai', 'gateway')).toBe('deepseek-deepseek-v4-flash-0731-gateway');
  });

  it('defaults to the openrouter backend, so every existing recording still resolves', () => {
    const model = '~deepseek/deepseek-v4-flash-latest';
    expect(fixtureSlug(model, 'openai')).toBe(fixtureSlug(model, 'openai', 'openrouter'));
  });
});

describe('gatewayModelFrom', () => {
  // The gateway column's model is not configurable HERE on purpose: the route
  // pins it, and a server that could override it would make the two columns
  // incomparable while still printing a tidy table. So it is read back out of
  // the generated route, and this pins the one line that reading depends on.
  it('reads the model the generated route pins', () => {
    expect(gatewayModelFrom("const MODEL = 'deepseek/deepseek-v4-flash-0731';")).toBe(
      'deepseek/deepseek-v4-flash-0731',
    );
  });

  it('refuses to guess when the route stops pinning one', () => {
    // Not a default. A guessed id would be recorded into a fixture directory
    // named after a model that never ran.
    expect(() => gatewayModelFrom('const model = getModel();')).toThrow(/no `const MODEL/);
  });

  it('reads the REAL generated route, so the two cannot drift', () => {
    // The check that survives an edit to the integration: whatever the shipped
    // route pins right now has to be readable by the rule above.
    const source = readFileSync(
      new URL('./generated/vercel-ai-sdk-route.ts', import.meta.url),
      'utf8',
    );
    expect(gatewayModelFrom(source)).toMatch(/^[\w.~-]+\/[\w.-]+$/);
  });
});
