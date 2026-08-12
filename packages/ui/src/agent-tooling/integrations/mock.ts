import type { Integration } from '../types';

/**
 * mock: the zero-config first-win.
 *
 * No provider, no API key, no `/api` route, no network. The scaffolder
 * special-cases `integration === 'mock'` and emits a front-end whose `onSubmit`
 * calls `createMockResponder()` from `@kitn.ai/ui/state` where a real
 * integration calls `fetch('/api/chat', …)`. That is the ONLY difference between
 * the two emitted handlers. Everything after that expression is already the real
 * path: `readOpenAIStream` parses the frames, `createAssistantStream` folds them
 * onto the message parts, and the try/catch/finally and abort handling are
 * byte-identical. The zero-config preview therefore exercises the kit's own SSE
 * reader rather than a hand-rolled fold that merely resembles it.
 *
 * WHY OPENAI-SHAPED FRAMES. The mock stands in for the consumer's ROUTE, not for
 * a provider. Every other integration in this catalog re-frames its provider to
 * the OpenAI chat-completions shape server-side before the browser sees it
 * (`anthropic`'s route converts the Messages dialect frame by frame, `pi`'s
 * bridge converts Pi's stdout JSON, `vercel-ai-sdk` wraps `result.textStream`),
 * which is why `readOpenAIStream` is the only reader the scaffolder emits.
 * Matching that shape is what keeps "swap the mock for a real backend" a
 * one-expression change instead of a rewrite of the submit handler.
 *
 * WHY YOU CAN ALWAYS TELL. Sharing a real provider's frame shape means shape
 * alone no longer marks the reply as fake, so the tells are explicit: the stream
 * opens with a `: kai-mock` SSE comment, every frame carries a `_kai_mock` field
 * naming the function that produced it, `model` reports as `kai-mock` (no
 * provider serves that, so an echoed mock frame is rejected upstream rather than
 * quietly believed), and usage is all zeros. `src/state/mock.ts` records why each
 * tell sits at a different altitude; do not remove one without reading it.
 *
 * This lets `scaffold(useCase, integration: 'mock', framework: 'react')` run with
 * zero config so a developer sees a live, streaming chat before wiring a model.
 * Swap `integration` for a real provider (openai, anthropic, openrouter, ollama,
 * …) when ready.
 *
 * It carries an empty `routeTemplates` on purpose: there is no server route to
 * emit. `category: 'mock'` keeps it out of the real provider/gateway/framework/
 * harness catalogs.
 */
const mock: Integration = {
  id: 'mock',
  title: 'Mock (local preview)',
  category: 'mock',
  language: 'ts',
  streamFormat: 'native',
  envVars: [],
  routeTemplates: {},
  streamMapping:
    "No backend and no provider, but a real wire. createMockResponder() from @kitn.ai/ui/state yields canned SSE frames and the scaffold reads them with readOpenAIStream from @kitn.ai/ui/wire, on the same code path a real route's response takes: same reader, same part folding, same abort handling. The frames carry the OpenAI chat-completions shape because the mock stands in for your /api/chat ROUTE, not for a provider (every other integration here re-frames its provider to that shape server-side), so going live replaces ONE expression: mockResponse(value) becomes the awaited response from your own chat route, and nothing else in the handler changes. Nothing here can be mistaken for a real turn: the stream opens with a ': kai-mock' SSE comment, every frame carries a _kai_mock field naming createMockResponder, model reports as 'kai-mock' (no provider serves it), and usage is all zeros.",
  runNote:
    'No backend or API key needed: the reply is generated in the browser and parsed by the same reader a real route feeds. Run the front-end as-is; swap `integration` for a real provider (openai, anthropic, openrouter, ollama) when ready, and the emitted handler differs by one expression.',
  docsSlug: 'integrations/mock',
  // Nothing: there is no HTTP request at all. The frames are produced in-process
  // by createMockResponder(), so there is no body to forward a model or a tools
  // array on, and no route that would read one.
  forwardsFromClient: [],
  // Nothing to install: there is no route to install anything for.
  deps: { npm: [], pip: [] },
  // The other 'frontend-safe' entry, and the only one that is true by absence:
  // no routeTemplates, no webRoute, no envVars. There is no request, no upstream
  // and no secret, so there is nothing a public bundle could give away. This is
  // the one place where "declares nothing" genuinely means safe — which is
  // precisely why it still has to SAY so rather than be left blank.
  keyExposure: 'frontend-safe',
  // Nothing at all, and here that is the literal truth rather than a shorthand:
  // there is no route, no upstream and no process. This is the "No backend"
  // group of create-kai's gateway prompt all by itself.
  outOfBand: 'none',
};

export default mock;
