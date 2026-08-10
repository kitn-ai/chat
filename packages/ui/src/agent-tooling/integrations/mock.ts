import type { Integration } from '../types';

/**
 * mock: the zero-config first-win.
 *
 * Not a real backend: there's no provider, no API key, no `/api` route. The
 * scaffolder special-cases `integration === 'mock'` and emits a front-end whose
 * `onSubmit` SIMULATES a streamed assistant reply CLIENT-SIDE (token-by-token,
 * a new array/object reference per chunk, honouring the messages contract).
 *
 * This lets `scaffold(useCase, integration: 'mock', framework: 'react')` run with
 * zero config so a developer sees a live, streaming chat before wiring a model.
 * Swap `integration` for a real provider (openrouter, ollama, …) when ready.
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
    'No backend. The scaffold streams a canned reply client-side by folding tokens onto the message parts, so nothing parses a wire format. Swap to a real integration and readOpenAIStream from @kitn.ai/ui/wire takes over.',
  runNote:
    'No backend or API key needed: replies stream locally for preview. Run the front-end as-is; swap `integration` for a real provider (e.g. openrouter, ollama) when ready.',
  docsSlug: 'integrations/mock',
  // Nothing: there is no request at all, the reply is streamed client-side.
  forwardsFromClient: [],
};

export default mock;
