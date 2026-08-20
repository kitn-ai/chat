import { describe, it, expect } from 'vitest';
import { integrations } from '../registry';
import { scaffold } from './tools/scaffold';

/**
 * Matrix coverage for the `scaffold` tool. Where the sibling scaffold.test.ts
 * asserts a handful of hand-picked combos in depth, this walks the full
 * integration registry and a framework × placement spread to prove the
 * scaffolder never throws and always emits a wired chat surface.
 *
 * Reads out.content[0].text with the CallToolResult cast used across the
 * sibling tests. The "a kai-chat is wired" assertion is /<Chat\b|<kai-chat/:
 * the html/vue/svelte branches emit the raw <kai-chat> tag, while the
 * react/next branches render it through the @kitn.ai/ui/react <Chat> wrapper —
 * both are the same web component, so either satisfies the contract.
 */

const text = (out: Awaited<ReturnType<typeof scaffold.handler>>) =>
  (out.content as { type: string; text: string }[])[0].text;

// A wired kai-chat: the raw tag, or the React wrapper that mounts it.
const KAI_CHAT = /<Chat\b|<kai-chat/;

// Each integration's signature — the endpoint, import, or name that proves the
// generated route is the right one (not a generic stub). mock has no backend, so
// its signature is the local-preview marker emitted instead of a route.
//
// THIS TABLE IS A COPY OF THE REGISTRY'S ID LIST, so it is pinned to one below.
// It shipped missing `openai` and `anthropic` — the two entries the registry
// deliberately lists FIRST — and the loop read them as `SIGNATURE[i.id]`, which
// is `undefined` at a missing key. `expect(anything).toMatch(undefined)` PASSES
// under vitest, so the two frontier providers were asserted against nothing:
// gutting both routes to `return new Response('lorem ipsum')` left this file
// green at 12/12. `strict: true` does not catch it either — the index signature
// types as `RegExp`, not `RegExp | undefined`, without `noUncheckedIndexedAccess`.
// Hence `signatureFor` (throws on a missing id) and the key-set test below: a
// twelfth integration now fails loudly instead of passing vacuously.
const SIGNATURE: Record<string, RegExp> = {
  // The endpoint each route POSTs to. NOT /openai/i or /anthropic/i — both words
  // are all over the emitted prose and the model-id consts, so a name match
  // survives a route that was never generated (see the note on `pi` below).
  openai: /api\.openai\.com\/v1\/chat\/completions/,
  anthropic: /api\.anthropic\.com\/v1\/messages/,
  openrouter: /openrouter\.ai\/api\/v1\/chat\/completions/,
  'vercel-ai-sdk': /ai-sdk|streamText|@ai-sdk|toDataStream/i,
  langgraph: /langgraph|langchain/i,
  cloudflare: /cloudflare|CF_ACCOUNT_ID/i,
  ollama: /11434|ollama/i,
  mastra: /mastra/i,
  // The spawn that IS the pi route. The old /\bpi\b/i matched the word "pi" in
  // the catalog's own streamMapping and runNote prose, which the scaffolder emits
  // whether or not a route was generated — so it held with the route gutted.
  pi: /spawn\('pi',\s*\['--mode',\s*'rpc'/,
  'pydantic-ai': /pydantic|fastapi/i,
  mock: /No backend or API key needed|stream locally/i,
};

/**
 * The signature for `id`, or a hard failure naming it.
 *
 * The point of the throw is that a registry entry with no signature must not be
 * able to reach `toMatch`, where `undefined` is silently accepted and the
 * assertion evaporates. This is the lookup every assertion in this file goes
 * through; there is no bare `SIGNATURE[...]` left.
 */
function signatureFor(id: string): RegExp {
  const signature = SIGNATURE[id];
  if (!signature) {
    throw new Error(
      `No SIGNATURE entry for integration '${id}'. Every id in the registry needs one. ` +
        `Add a marker that proves ${id}'s OWN route was generated — its endpoint URL or a ` +
        `route-only import — and not a word that also appears in its catalog prose, which the ` +
        `scaffolder emits with or without a route. Registry ids: ` +
        `${integrations.map((i) => i.id).join(', ')}.`,
    );
  }
  return signature;
}

describe('scaffold — integration matrix', () => {
  // The structural check, and the one that cannot pass vacuously: it compares
  // sets, so it fires on a registry entry with no signature AND on a signature
  // left behind by a removed integration. Sorted both sides so the diff names
  // the offending id rather than an ordering.
  it('every registry integration has a signature, and no signature is orphaned', () => {
    const registryIds = integrations.map((i) => i.id).sort();
    const signatureIds = Object.keys(SIGNATURE).sort();
    expect(
      signatureIds,
      'SIGNATURE keys must equal the registry ids exactly — a missing key makes the ' +
        'matrix assertion below evaporate, an extra key is a stale entry.',
    ).toEqual(registryIds);
  });

  it('scaffolds a drop-in chat for every integration without throwing', async () => {
    for (const i of integrations) {
      // mock is a front-end-only preview; the rest get their language's server framework.
      const framework = i.id === 'mock' ? 'react' : i.language === 'python' ? 'fastapi' : 'next';
      const out = await scaffold.handler({
        useCase: 'drop-in-chat',
        integration: i.id,
        placement: 'side',
        framework,
      });
      const t = text(out);

      // a kai-chat surface is wired (raw tag or React wrapper)
      expect(t, `${i.id}: no kai-chat wiring`).toMatch(KAI_CHAT);
      // the generated app imports from the real package
      expect(t, `${i.id}: missing @kitn.ai/ui import`).toContain('@kitn.ai/ui');
      // the integration's own signature is present (right route, not a stub)
      expect(t, `${i.id}: missing signature`).toMatch(signatureFor(i.id));
      // non-trivial output
      expect(t.length, `${i.id}: output too short`).toBeGreaterThan(100);
    }
  });

  it('mock scaffolds a kai element with no backend fetch (zero-config preview)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'side',
      framework: 'react',
    });
    const t = text(out);
    expect(t).toMatch(KAI_CHAT);
    // No backend call in the FRONT END — the reply streams client-side. Scoped
    // to block (1) since G-04: block (2) now ships the optional mock route,
    // whose Vite-middleware wrapper mentions fetch('/api/chat') in prose.
    const front = t.split('=== (2) BACKEND ROUTE ===')[0];
    expect(front).not.toContain("fetch('/api");
    expect(t).toMatch(/No backend or API key needed|streams its reply locally/i);
  });
});

describe('scaffold — framework × placement spread (openrouter)', () => {
  const frameworks = ['next', 'react', 'html'] as const;
  const placements = ['full-page', 'side', 'docked-widget'] as const;

  for (const framework of frameworks) {
    for (const placement of placements) {
      it(`${framework} × ${placement} emits a wired kai-chat + the openrouter endpoint`, async () => {
        const out = await scaffold.handler({
          useCase: 'drop-in-chat',
          integration: 'openrouter',
          placement,
          framework,
        });
        const t = text(out);
        expect(t).toMatch(KAI_CHAT);
        expect(t).toMatch(signatureFor('openrouter'));
        expect(t.length).toBeGreaterThan(100);
      });
    }
  }

  it('html framework emits the raw <kai-chat> tag (no React wrapper)', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'html',
    });
    const t = text(out);
    expect(t).toMatch(/<kai-chat/);
  });
});
