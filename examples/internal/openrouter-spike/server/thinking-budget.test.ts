// What this pins, and why it is not a shape test for its own sake.
//
// The matrix runs `anthropic/claude-haiku-4.5` down BOTH wires so that a
// difference can be attributed to the wire or to the model, not to both. That
// attribution is only valid if the two requests ask for the same thing. They did
// not.
//
// OpenRouter derives an Anthropic thinking budget from `reasoning.effort` as a
// PERCENTAGE of `max_tokens` (medium ~= 50%). The spike caps `max_tokens` at 900
// for cost, so `effort: 'medium'` derived 450 — under Anthropic's documented 1024
// floor — and the provider returned no thinking at all. The matrix recorded that
// silence as "Haiku emits no reasoning on the OpenAI wire", i.e. as a provider
// limit, when it was our own request. Measured live 2026-08-11:
//
//   effort:medium + max_tokens:900   -> reasoning_tokens 0,   no reasoning_details
//   effort:medium + max_tokens:3000  -> reasoning_tokens 108, signed block
//   budget:1024   + max_tokens:1924  -> reasoning_tokens 119, signed block
//
// So the guard that matters is the CROSS-WIRE one: both wires must ask the same
// model for the same budget. A test that only asserted "the openai payload has
// reasoning.max_tokens" would keep passing if someone later changed the Anthropic
// wire's budget and reopened the same gap from the other side.
import { describe, expect, it } from 'vitest';
import { buildUpstreamRequest, isAnthropicFamily } from './openrouter-proxy';
import type { ChatBody, ProxyEnv, WireKind } from './openrouter-proxy';

/** Anthropic's floor for a thinking budget. Duplicated from the proxy on
 *  purpose: a test that imports the constant it is checking cannot notice the
 *  constant dropping below the provider's minimum. */
const ANTHROPIC_FLOOR = 1024;

const env = (over: Partial<ProxyEnv> = {}): ProxyEnv => ({
  key: 'test-key',
  backend: 'openrouter',
  model: 'anthropic/claude-haiku-4.5',
  wire: 'openai',
  reasoningEffort: 'medium',
  maxTokens: 900,
  fixtureDir: '/tmp/fixtures',
  record: false,
  ...over,
});

const body: ChatBody = {
  messages: [{ role: 'user', content: 'hi' }] as ChatBody['messages'],
  tools: [],
};

const reasoningOf = (p: Record<string, unknown>) =>
  p.reasoning as { effort?: string; max_tokens?: number } | undefined;

/** The thinking budget a payload asks for, whichever wire's spelling it uses. */
function budgetOf(payload: Record<string, unknown>, wire: WireKind): number | undefined {
  if (wire === 'anthropic') {
    const thinking = payload.thinking as { budget_tokens?: number } | undefined;
    return thinking?.budget_tokens;
  }
  return reasoningOf(payload)?.max_tokens;
}

describe('isAnthropicFamily', () => {
  it('recognises an Anthropic model with or without the floating-latest tilde', () => {
    expect(isAnthropicFamily('anthropic/claude-haiku-4.5')).toBe(true);
    expect(isAnthropicFamily('~anthropic/claude-haiku-4.5')).toBe(true);
  });

  it('does not claim models from other providers', () => {
    for (const m of ['openai/gpt-5.4-mini', '~deepseek/deepseek-v4-flash-latest', 'mistralai/ministral-3b-2512']) {
      expect(isAnthropicFamily(m), m).toBe(false);
    }
  });
});

describe('thinking budget on the OpenAI wire', () => {
  it('asks an Anthropic model for an explicit budget, never an effort level', () => {
    const { payload } = buildUpstreamRequest(env(), body);
    const reasoning = reasoningOf(payload);
    expect(reasoning?.effort).toBeUndefined();
    expect(reasoning?.max_tokens).toBeGreaterThanOrEqual(ANTHROPIC_FLOOR);
  });

  it('leaves room for an answer after the thinking budget', () => {
    // Anthropic requires `max_tokens` strictly greater than the budget. Sharing
    // the cap with it means the answer gets nothing.
    const { payload } = buildUpstreamRequest(env(), body);
    const budget = budgetOf(payload, 'openai') ?? 0;
    expect(payload.max_tokens).toBeGreaterThan(budget);
    // and specifically: the answer still gets its full configured cap.
    expect(payload.max_tokens).toBe(900 + budget);
  });

  it('still uses an effort level for models that take one', () => {
    for (const model of ['openai/gpt-5.4-mini', '~deepseek/deepseek-v4-flash-latest']) {
      const { payload } = buildUpstreamRequest(env({ model }), body);
      expect(reasoningOf(payload)?.effort, model).toBe('medium');
      expect(reasoningOf(payload)?.max_tokens, model).toBeUndefined();
      // no budget was added, so the cost cap is unchanged for these
      expect(payload.max_tokens, model).toBe(900);
    }
  });

  it('omits reasoning entirely when thinking is off, and adds no budget', () => {
    for (const off of ['off', 'none']) {
      const { payload } = buildUpstreamRequest(env({ reasoningEffort: off }), body);
      expect(payload.reasoning, off).toBeUndefined();
      expect(payload.max_tokens, off).toBe(900);
    }
  });
});

describe('the two wires are comparable', () => {
  // This is the assertion the matrix's third configuration depends on. If it
  // fails, a difference between the two Haiku columns cannot be attributed to
  // the wire, because the requests were not asking for the same thing.
  it('asks the SAME model for the SAME thinking budget on either wire', () => {
    const openai = buildUpstreamRequest(env({ wire: 'openai' }), body);
    const anthropic = buildUpstreamRequest(env({ wire: 'anthropic' }), body);

    const a = budgetOf(openai.payload, 'openai');
    const b = budgetOf(anthropic.payload, 'anthropic');

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(ANTHROPIC_FLOOR);
  });

  it('leaves the same room for the answer on either wire', () => {
    const openai = buildUpstreamRequest(env({ wire: 'openai' }), body);
    const anthropic = buildUpstreamRequest(env({ wire: 'anthropic' }), body);
    expect(openai.payload.max_tokens).toBe(anthropic.payload.max_tokens);
  });
});
